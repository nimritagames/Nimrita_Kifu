# Phase 0 Gate: No-Limit Hold'em — betting flow (Phase 0 pre-freeze gate vs Charter v4.1 C7/C3/C8/C9, C:\Webs\Multiplayer\docs\CHARTER.md)

**Designer verdict:** expressible-with-friction  
**Adversarial verification:** sound

## Design

# NLHE Betting Flow vs the Grant API

## 1. State sketch (canonical JSON, integers only)

```json
{
  "phase": "idle|blinds|preflop|flop|turn|river|showdown|payout",
  "handNo": 42, "buttonSeat": 0, "sbAmt": 50, "bbAmt": 100,
  "seats": { "0": { "stack": 5000, "status": "active|folded|allin|sittingOut",
      "streetCommitted": 0, "totalCommitted": 0,
      "actedSinceFullRaise": false, "timeBankMs": 30000 } },
  "betting": { "currentBet": 100, "lastFullRaiseSize": 100, "actionOn": 3,
      "actionStartedTs": 1765000000000, "timeBankEngaged": false },
  "pots": [ { "amount": 1500, "eligible": [0, 1, 2] } ],
  "board": ["Ah","7d","2c"], "holeCards": { "3": ["As","Kd"] },
  "lastEventTs": 1765000000000
}
```

Reducers copy each event's server timestamp into `actionStartedTs`/`lastEventTs`, so deadlines are pure functions of state (C8) and restart re-arms correctly (C7). Canonical state holds all hole cards; privacy is projection's job (C9).

**Deck model (C3):** the admission-layer PRNG plus the game's draw-consumption mapping attach resolved cards to card-consuming event types: `dealHole` = 2n cards, `revealFlop` = 3, `revealTurn`/`revealRiver` = 1. `projectEvent(dealHole, v)` keeps only v's two cards; board reveals are public; showdown shows are reveal-as-explicit-event carrying the cards.

## 2. pendingGrants(state)

System steps (no acting player) use the only expression C7 permits — the **zero-delay expiry idiom**: a grant on an arbitrary live seat, `allowedActions: []`, `deadline: lastEventTs` (already due), `onExpiry: <systemAction>`; the framework fires it, appending exactly one event. Marked SYS (friction F1).

| condition | grants returned |
|---|---|
| idle, ≥2 ready | SYS → `handStart` (segment boundary, C8) |
| blinds | SB: `[postBlind(sbAmt), sitOut]`, BB: `[postBlind(bbAmt), sitOut]`; deadline `lastEventTs+10s`; onExpiry `postBlind`; resolution moot — two non-conflicting grants; re-evaluation after each admitted event retires the satisfied one |
| blinds in | SYS → `dealHole` (cards attached at admission) |
| betting street | one grant to `actionOn`: `actions(s)`; deadline `actionStartedTs+20s` (+`timeBankMs` if engaged); onExpiry: `timeBankMs>0 && !engaged` → `engageTimeBank`, else `toCall>0` → `fold`, else `check`; resolution `first-come` |
| street closed, ≥2 non-allin live | SYS → `revealFlop/Turn/River` |
| street closed, ≤1 with chips | SYS reveals remaining streets, then forced showdown reveal (F3) |
| showdown (normal) | sequential grants, last aggressor first: `[showHand, muck]`, onExpiry `muck` (kept state-independent — F4) |
| pots resolved | SYS → `payout` (pure from state), then boundary event |

**actions(s)**, with `toCall = currentBet − streetCommitted[s]`:
- `toCall==0 && currentBet==0`: `check` | `bet{min: bbAmt, max: stackTo}` | `fold`
- `toCall==0 && currentBet>0` (BB option): `check` | raise rights
- `toCall>0`: `fold` | `call{amount: min(toCall, stack)}` | raise rights **iff** `!actedSinceFullRaise[s]`
- raise rights = `raiseTo{min: currentBet+lastFullRaiseSize, max: stackTo}` when the stack reaches min, **plus `allInTo{stackTo}` always** — all-in as its own action type encodes "short all-in below min-raise is legal" without disjunctive constraints (F6).

**Reducer invariants (min-raise tracking):** `raiseTo T` with `T−currentBet ≥ lastFullRaiseSize` is FULL → `lastFullRaiseSize = T−currentBet`, clear every `actedSinceFullRaise`. Short all-in (`T−currentBet < lastFullRaiseSize`) → set `currentBet=T` only; flags and `lastFullRaiseSize` untouched. Voluntary acts set the actor's flag; blind posts do not. Street closes when all non-allin live seats have the flag set and match `currentBet` (uncalled excess refunded). Pots rebuilt at street close by layering `totalCommitted`. First to act: heads-up → button preflop, non-button postflop; else leftOf(BB) preflop, leftOf(button) postflop.

## 3. Worked traces

### A. Short all-in does NOT reopen (5-handed, 50/100; seats 0=BTN, 1=SB, 2=BB, 3=UTG, 4=CO stack 350)

| # | event | admission/reducer | resulting grant |
|---|---|---|---|
| e1–e4 | handStart, SB 50, BB 100, dealHole | currentBet 100, lastFullRaiseSize 100, actionOn 3 | seat3: fold / call 100 / raiseTo{200..} |
| e5 | seat3 `raiseTo 300` | +200 ≥ 100 → FULL: lastFullRaiseSize=200; flags cleared, seat3 set | seat4: fold / call 300 / **allInTo 350** (raiseTo absent: min 500 > 350) |
| e6 | seat4 `allInTo 350` | +50 < 200 → **SHORT**: currentBet=350; lastFullRaiseSize stays 200; **flags untouched** | seat0 (never acted): fold / call 350 / raiseTo{550..} |
| e7–e8 | seat0 fold, seat1 fold | — | seat2 (BB; blind ≠ acting): fold / call 250 / raiseTo{550..} — **retains raise rights** |
| e9 | seat2 fold | — | seat3: `actedSinceFullRaise` true, no full raise since → **fold / call 50 only**. The reopening rule lives entirely in `actions(s)` |
| e10 | seat3 `call 50` | street closed; one player with chips left | SYS runout (F1/F2), forced reveal (F3), payout |

Had seat3 timed out at e10: expiry → `engageTimeBank`, new deadline `actionStartedTs+20s+timeBankMs`, second expiry → `fold` (facing a bet; `check` if not). Time banks are pure composition — no API strain.

### B. Two all-ins, side pots (3-handed 50/100: BTN=0 stack 2000, SB=1 stack 500, BB=2 stack 1200)

| # | event | admission/reducer | resulting grant |
|---|---|---|---|
| e5 | seat0 `raiseTo 400` | FULL: lastFullRaiseSize=300 | seat1: fold / call 350 / **allInTo 500** (min raiseTo 700 > 500) |
| e6 | seat1 `allInTo 500` | +100 < 300 → SHORT; currentBet=500; no reopen | seat2 (never acted): fold / call 400 / raiseTo{800..1200} |
| e7 | seat2 `allInTo 1200` | +700 ≥ 300 → **FULL**: lastFullRaiseSize=700; flags cleared → **seat0 reopened** | seat0: fold / call 800 / raiseTo{1900..2000} |
| e8 | seat0 `call` (1200 total) | street closes; totalCommitted {1200, 500, 1200} → `pots: [{amount:1500, eligible:[0,1,2]}, {amount:1400, eligible:[0,2]}]` | SYS runout; side pot to best of {0,2}, main to best of all |

Pot evolution: during the street chips sit in `streetCommitted`; the close-of-street reducer layers them — main 3x500, side 2x700. Pure arithmetic, zero framework involvement.

### C. Heads-up positional reversal (seat0 = BTN posts SB 50, seat1 = BB 100)

Preflop after dealHole → grant **seat0** (button FIRST): fold / call 50 / raiseTo{200..}. seat0 calls → seat1 (BB option): check / raiseTo{200..}. Checks → SYS revealFlop → grant **seat1** (non-button first postflop): check / bet{100..}; checks → seat0 acts LAST. The reversal is one branch in the game's first-to-act function over (phase, buttonSeat, livePlayers) — invisible to the framework.

## 4. Verdict

The betting flow proper — grants, min-raise tracking, short-all-in non-reopening, side pots, heads-up reversal, onExpiry fold/check, time banks — expresses cleanly; the friction concentrates entirely in system-authored transitions and forced reveals (F1–F4 below).

## Friction points (designer)

- F1 — No system-authored events. handStart, dealHole, street reveals, all-in runout, payout, and segment boundaries have no acting seat, but C7 grants are seat-scoped. The only in-contract expression is the zero-delay expiry idiom (grant on an arbitrary live seat, allowedActions: [], deadline = lastEventTs already past, onExpiry = the system action). It satisfies the letter of C7 but attributes system events to a player in the log, relies on undefined empty-allowedActions and already-past-deadline semantics, and every game will reinvent it.
- F2 — Expiry x randomness is implied, never stated. C1 lists 'timer fire' as an admitted intent and C3 resolves randomness at admission, so expiry-fired default actions plausibly receive PRNG outcomes (dealHole/reveal* via expiry depend on it) — but no clause says so, and the game-side draw-consumption mapping C3 references is not part of the stated game-contract surface (state/actions/invariants/pendingGrants/projections in section 3). One-sentence clarification, not a redesign.
- F3 — HARD GAP: onExpiry is a bare action name, but C9 reveal-as-explicit-event requires the reveal event to CARRY the newly-visible payload, projection is stateless, and past events are never re-projected. A forced hole-card reveal — all-in runout where a player is disconnected, or any timeout whose correct default is 'show' — is therefore inexpressible: the expiry event has no payload and projectEvent cannot conjure one. Auto-muck-on-timeout is not a workaround for all-in runouts because a tabled all-in hand must remain live and can win the pot; mucking it forfeits chips the rules say it may claim. This is the finding that requires an API change.
- F4 — Grant visibility is unspecified. allowedActions and deadline must reach the acting client for UI, but grants are state-derived and can leak hidden information (a state-dependent onExpiry like 'muck-if-beaten' at showdown reveals the viewer is beaten; an embedded reveal payload per required-change #1 would leak cards if grants are broadcast). The contract needs a normative per-seat grant projection/delivery rule. Poker mitigation used here: keep grant contents information-neutral (onExpiry 'muck' unconditionally at normal showdown).
- F5 — Deadline-purity bookkeeping is boilerplate, by design: every reducer must copy the admitted event's timestamp into state (actionStartedTs, lastEventTs) so pendingGrants can derive absolute deadlines and restart can re-arm (C7/C8). Works, but every game reimplements it — belongs in the betting-round/rotation library helpers. Counterweight: time banks compose beautifully as two-stage expiry (onExpiry 'engageTimeBank', then extended deadline, with bank deduction computed from event timestamps) — a genuine point in the API's favor.
- F6 — Constraint language requirements: allowedActions must express exact amounts (call), integer ranges (bet/raiseTo min..max), and a DISTINCT allInTo action type — the only clean encoding of 'short all-in below min-raise is always legal while raiseTo stays range-bound'. Expressible if constraints are game-defined JSON validated by the game at admission; inexpressible if the tech spec makes constraints a fixed framework enum. Freeze should state constraints are opaque game data.
- F7 (minor) — Resolution semantics for concurrent independent grants: simultaneous SB+BB posting needs no arbitration; re-evaluation after every admitted event naturally retires satisfied grants, so 'resolution' only governs same-window races over one decision (the mahjong claim case). Worth stating normatively so helper authors don't reach for collect-all unnecessarily.

## Required API changes (designer claim)

- Extend onExpiry from a bare action name to {action, payload?}: pendingGrants (already pure over full canonical state) may embed a payload that the framework copies verbatim into the expiry event at admission. This makes reveal-as-explicit-event (C9) satisfiable for forced reveals (all-in runout with a disconnected player, timeout-defaults-to-show). Replay semantics unchanged — the payload is recorded in the event like any other (closes F3).
- Permit seat: null system grants (allowedActions empty, deadline + onExpiry only) — or, alternatively, normatively bless the zero-delay-expiry idiom in the library-helper layer and define empty-allowedActions and already-past-deadline semantics. Either is minimal; pick one before freeze (closes F1).
- Add one normative sentence on grant visibility: grants are delivered only to their own seat after per-seat projection, never broadcast; embedded onExpiry payloads are part of the grant and follow the same rule (closes F4; prerequisite for change #1 being safe).
- Clarify the C3/C7 interaction in one sentence: expiry-fired default actions are admitted intents and receive PRNG outcomes per the game's draw-consumption mapping exactly like player intents; and list the draw-consumption mapping as part of the game-contract surface in section 3 (closes F2).

## Adversarial verifier findings

**Summary:** Verified against the actual charter at C:\Webs\Multiplayer\docs\CHARTER.md (v4.1), not just the prompt summary. The design is fundamentally honest and the verdict is sound=true: all three mandated traces check out event-by-event (min-raise arithmetic 550=350+200, 800=500+300, 1900=1200+700 all correct; side-pot layering 1500/1400 from committed 1200/500/1200 correct; short-all-in non-reopening at A-e9 and full-all-in reopening at B-e7 both match NLHE rules; heads-up reversal correct including button-posts-SB), and every claimed friction is genuine when checked against the full charter text — F1 (seat-required grants), F3 (bare onExpiry vs C9 payload-carrying reveals; confirmed hard even accounting for projectState and the commutation gate the prompt summary omitted), F4 (no grant-visibility clause exists), F2 (C3 references a draw-consumption mapping that §3's contract surface omits). The four required API changes are properly reported rather than smuggled in. Two deductions: one quasi-silent assumed power — the single dealHole event with a seat-keyed payload, which stateless projection requires but no contract clause provides, while an in-contract per-seat-deal alternative was missed — and a real set of glossed poker flows: the fold-win path (the '≤1 with chips' condition as written would deal a board and force the walk winner to reveal), cumulative short all-ins (the design's per-increment comparison silently picks one side of a known ruleset divergence), auto-muck at showdown contradicting the design's own F3 forfeiture argument, off-grant standing intents (rebuy/sit-out — which the C8 gate will hit next), and short-stack blind posting. None of these invalidate the core finding; they sharpen it: the betting flow proper fits the grant API, the system-event/forced-reveal gap is real, and the freeze should be treated as blocked on required change #1 — the design's body says this even though its 'expressible-with-friction' label undersells it.

**Contract violations in the design:**
- Seat-structured randomness payloads are silently assumed. The design's single dealHole event needs a seat-keyed payload (state shows holeCards keyed by seat; 'projectEvent(dealHole, v) keeps only v's two cards') for stateless C9 projection to work. But C3 only attaches raw resolved outcomes ('the drawn tile, the shuffle as consumed') per a draw-consumption mapping the design itself describes as count-based ('dealHole = 2n cards'). A stateless projectEvent cannot map a flat 2n-card array to viewers — seat assignment depends on state (active seats, dealing order). Nothing in the contract gives the admission layer power to label outcomes by seat, and the design's own required-change #4 ('list the mapping in the contract surface') does not ask for it. Notably, an in-contract alternative exists that the design missed: n concurrent zero-delay grants each firing a per-seat dealHoleToSeat expiry event (2 cards each, seat attribution in the envelope), which projects statelessly. The single multi-seat dealHole as designed is an unflagged framework power.
- Minor: voluntary showHand's payload authorship is unstated. C9 requires the reveal event to carry the cards, but the design never says who attaches them on a voluntary show. The in-contract answer (client authors the payload from its own projected knowledge; game's admission validation checks it against canonical state) exists but is silently assumed rather than designed — and it matters, because it is exactly the mechanism that is unavailable in the F3 disconnect case.

**Problems the design missed:**
- Uncontested pot (fold-win) is mis-specified. The grants table has no 'everyone folded' row, and the condition 'street closed, ≤1 with chips' as written also matches a fold-out (the lone live player has chips, so '≤1 with chips' is true) — which would deal out the full board via SYS and then force the walk winner's hole-card reveal. Wrong per poker rules: an uncontested winner never shows and no board is dealt. The runout condition needs '≥2 live players' and an explicit fold-win → payout row.
- Cumulative short all-ins. The reducer compares each raise increment to currentBet (which already includes prior short all-ins), so consecutive short all-ins that together total a full raise relative to the last full bet never reopen betting — e.g., bet 100 → all-in 160 (short) → all-in 230 (230-160=70 < 100, short by the design's rule) leaves action closed even though the total raise over the 100 bet is 130 ≥ 100. TDA/cardroom rulesets diverge on exactly this case and many reopen; the design picked the non-cumulative semantics without noticing there was a choice. This is the canonical nasty edge of the raise-reopening rule the task asked about.
- Auto-muck on timeout at normal showdown contradicts the design's own F3 argument. A disconnected/timed-out player holding the winning hand gets onExpiry 'muck' and forfeits the pot — precisely the 'mucking forfeits chips the rules say it may claim' reasoning the design used to reject auto-muck for all-in runouts. Once required changes #1 (onExpiry payload) and #3 (per-seat grant delivery) land, onExpiry {showHand, payload} is safe and information-leak-free; the F4 'information-neutral muck' mitigation trades rules-correctness for an avoidable concern, and the design never reconciles the two positions.
- Off-grant standing intents have no home. Sit-out-next-hand, rebuy/add-on, leave-table, and missed-blind posting on return are core cash-game flows, but C7 grants require a deadline and an onExpiry — an open-ended 'you may rebuy anytime' permission is inexpressible as specified. The charter's own C8 pre-freeze gate ('a poker cash session with mid-session rebuy') will hit this immediately; the design's blinds-phase sitOut option is its only acknowledgment. This is a friction class on par with F1 that the design never raised.
- Short blind posting unhandled: postBlind(sbAmt) is a fixed-amount constraint, but a stack below the blind must post all-in-for-less, creating a side-pot layer during the blinds phase. Relatedly, onExpiry=postBlind force-commits a timed-out player's chips; real rooms default to sitting the player out, and the more aggressive default is chosen without justification.
- allInTo needs a guard: 'plus allInTo{stackTo} always' inside raise rights collides with the partial call when stackTo ≤ currentBet (a stack smaller than the facing bet should only get call-for-less via call{min(toCall,stack)}, not an allInTo 'raise'). The constraint needs stackTo > currentBet.
- Minor spec slips: the blinds deadline 'lastEventTs+10s' silently slides — after the first blind posts, re-evaluation recomputes the second blind's deadline from the new lastEventTs, restarting its clock; and the state sketch lacks a lastAggressor field even though the showdown row orders grants 'last aggressor first'.
- Verdict labeling understates F3: C7's pre-freeze gate says 'any inexpressible flow blocks the freeze,' and the design itself calls F3 a hard, inexpressible gap. The honest headline is 'freeze-blocking pending required change #1,' not 'expressible-with-friction'; the body says this, the verdict label does not.
