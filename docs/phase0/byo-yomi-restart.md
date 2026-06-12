# Phase 0 Gate: Go with a Shogi/Go tournament clock: per-player main time + N Japanese byo-yomi periods (integer-ms time-as-state), designed against Charter v4.1 C7 grants / C8 time

**Designer verdict:** expressible-with-friction  
**Adversarial verification:** sound

## Design

# Go with a Shogi/Go tournament clock — paper design vs Charter v4.1

Two seats (black/white). Each player has main time **M** and **N** Japanese byo-yomi periods of **P** ms: a move inside the period resets it; exceeding it consumes a period; exceeding the last period flags. Board logic is ordinary Go and irrelevant to this gate; only the clock flow is traced. All clock values are integer milliseconds (C2: no floats).

## 1. State sketch

```json
{
  "phase": "playing",
  "toMove": "black",
  "turnOpenedAt": 1100000,
  "clocks": {
    "black": { "mainMs": 30000,  "periodsLeft": 2, "periodMs": 30000 },
    "white": { "mainMs": 110000, "periodsLeft": 2, "periodMs": 30000 }
  },
  "board": { "...": "irrelevant" },
  "result": null
}
```

- `turnOpenedAt` = server-assigned timestamp of the recorded event that opened the current player's thinking time (previous move, segment start, or a clock-expiry event). C8 explicitly allows recorded event timestamps in state; this one field is the entire restart story.
- Clocks store **remaining-as-of-`turnOpenedAt`**, never "remaining now". Wall-clock-now is unrepresentable in state by construction.
- In byo-yomi iff `mainMs == 0`.

## 2. pendingGrants

```
pendingGrants(s):
  if s.phase != "playing": return []            // no grants -> no deadlines
  seat = s.toMove; c = s.clocks[seat]
  if c.mainMs > 0:
    dl  = s.turnOpenedAt + c.mainMs
    exp = c.periodsLeft > 0 ? "enterByoYomi" : "flag"   // sudden death if N=0
  else:
    dl  = s.turnOpenedAt + c.periodMs
    exp = c.periodsLeft > 1 ? "consumePeriod" : "flag"
  return [{ seat, allowedActions: [move(legalOnly), pass, resign],
            deadline: dl, onExpiry: exp, resolution: "first-come" }]
```

Single grant per evaluation — the plain "current turn" case; `resolution` is trivial. The armed deadline is always the **next clock boundary**; the ultimate flag moment (`turnOpenedAt + mainMs + periodsLeft*periodMs`) is reached as a chain of framework expiry events `enterByoYomi -> consumePeriod* -> flag`, each re-evaluated per C7 after admission. Deadline is a pure integer function of state.

Clock reducers:

```
on move|pass(e):                        // admitted only against the open grant
  c = s.clocks[s.toMove]
  if c.mainMs > 0:
    spent    = e.ts - s.turnOpenedAt           // THE arithmetic (C8)
    c.mainMs = max(0, c.mainMs - spent)        // clamp: see F1
  // byo-yomi: no debit — a move inside the period resets it for free
  s.toMove = other(s.toMove); s.turnOpenedAt = e.ts

on enterByoYomi(e):                     // framework expiry event
  c = s.clocks[s.toMove]
  s.turnOpenedAt = s.turnOpenedAt + c.mainMs   // LOGICAL boundary, not e.ts (F2)
  c.mainMs = 0

on consumePeriod(e):
  s.clocks[s.toMove].periodsLeft -= 1
  s.turnOpenedAt = s.turnOpenedAt + s.clocks[s.toMove].periodMs

on flag(e):
  s.phase = "finished"; s.result = { "winner": other(s.toMove), "by": "timeout" }
```

Expiry reducers anchor at the **logical boundary derivable from state**, so timer-firing jitter in expiry-event timestamps never leaks into clock arithmetic — everything stays exact integers. (Scoring phase, out of scope: one `collect-all-then-resolve` grant for dead-stone agreement.)

## 3. Worked traces

Config: M=120000, N=2 periods, P=30000. Absolute server ms.

**Trace A — debit, byo-yomi chain, flag-fall**

| # | event | ts | verdict | reducer effect | next grant (seat, deadline, onExpiry) |
|---|---|---|---|---|---|
| e0 | gameStart (boundary) | 1,000,000 | admitted | opened=1,000,000 | black, 1,120,000, enterByoYomi |
| e1 | black move | 1,090,000 | admitted | spent=90,000; black.main=30,000 | white, 1,210,000, enterByoYomi |
| e2 | white move | 1,100,000 | admitted | spent=10,000; white.main=110,000 | black, 1,130,000, enterByoYomi |
| e3 | EXPIRY enterByoYomi | fires ~1,130,002 (jitter) | admitted (framework) | black.main=0; opened=1,130,000 (logical) | black, 1,160,000, consumePeriod |
| e4 | EXPIRY consumePeriod | ~1,160,001 | admitted | black.periodsLeft=1; opened=1,160,000 | black, 1,190,000, flag |
| e5 | black move | 1,178,500 | admitted (inside period) | no debit; period resets | white, 1,288,500, enterByoYomi |
| e6 | white move | 1,200,000 | admitted | spent=21,500; white.main=88,500 | black (byo-yomi, last period), 1,230,000, flag |
| e7 | EXPIRY **flag** | ~1,230,003 | admitted | phase=finished; white wins by timeout | none — pendingGrants = [] |
| e8 | black move intent | 1,230,400 | REJECTED — matches no grant; recorded as admission loser | — | — |

**Trace B — server restart while Black's clock runs (the critical one).** Crash after e2; armed deadline was 1,100,000 + 30,000 = **1,130,000**.

- Wall 1,115,000: crash. Black has thought 15,000 ms; 15,000 ms remain — *implicitly*; nothing stores this.
- Wall 1,127,000: restart. Recovery replays e0–e2 through the same reducers: state again holds `turnOpenedAt=1,100,000`, `black.mainMs=30,000`. Framework evaluates `pendingGrants` on the recovered state (C7) and arms the deadline: **1,130,000 — bit-identical to pre-crash**. It fires in 3,000 ms of wall time.
- **Not gifted free time:** a naive "re-arm now + remaining" restart would arm 1,127,000+30,000 = 1,157,000, a 27 s gift. That bug is *unrepresentable* here: state can only express `(turnOpenedAt, remaining-as-of-then)`, and the deadline is an absolute pure function of that pair.
- **Not unfairly flagged:** the deadline is not earlier than pre-crash either, and no double-debit is possible — debits happen only in reducers from recorded event timestamps, and replay runs the same reducers over the same recorded timestamps.
- **Charter mechanism, named:** C8 (deadline is an absolute server-time value computed purely from state, and state holds recorded event timestamps) + C7 (pendingGrants re-evaluated after every admitted event, so recovery = replay + one evaluation + re-arm). Deadlines are never persisted, only re-derived — arming is idempotent from state.

**Trace B2 — downtime crosses the deadline.** Restart at wall 1,140,000 > 1,130,000. Re-derived deadline is already past, so the framework fires it immediately: `enterByoYomi` admitted with ts = 1,140,000 (actual time). The reducer anchors at logical 1,130,000, so the first period's deadline is 1,160,000 — 10 s of downtime count against the period, and the chain continues deterministically (exactly one expiry per deadline, re-evaluation per admission). Net semantics: a **physical chess clock that kept running through the outage** — Black flags only if absolute elapsed time truly exceeded main + all periods. Deterministic, replay-stable, defensible. What is *not* expressible is "pause clocks during the outage" — see friction F3, since nothing in the log distinguishes "player thinking" from "server down".

## Friction points (designer)

- F1 - expiry-vs-late-response race: the contract never guarantees that once a deadline D is armed, no response to that grant with server timestamp > D is admitted before D's expiry event. If a move with ts = D+epsilon slips in first (late timer / event-loop stall), spent > mainMs and the clock math goes negative; every time-as-state game must defensively clamp and duplicate the byo-yomi cascade arithmetic inside its move reducer to charge the overage correctly. A workaround exists (clamp), so it is friction, but the guarantee belongs in the contract -> required change #2.
- F2 - expiry-event timestamp semantics unspecified: is the recorded timestamp of the framework's expiry event the deadline value, or the actual (jittered, possibly post-restart) firing time? This design sidesteps it by anchoring expiry reducers at the logical boundary (turnOpenedAt + debit) derived from state, so jitter never accumulates into free time - but the contract's silence means two conforming implementations diverge observably, and the pause-style downtime policy is only expressible under actual-time semantics -> required change #1. The logical-boundary-anchor trick should ship in the charter's clock library helper so every game does not have to rediscover it.
- F3 - outage time is unconditionally charged to the running clock: pendingGrants is pure over state, and no event records downtime, so the contract cannot distinguish 'player thinking' from 'server down'. Physical-clock semantics (clock runs through the outage, Trace B2) is a deterministic, defensible default, but the pause/compensate-on-outage policy that real Go servers use is inexpressible. Fix would be an optional framework-recorded recovery boundary event carrying a downSince payload - this fits C8's existing 'external inputs enter the log as recorded events' pattern, so it is an optional library/framework addition, not a required contract change.
- F4 - one deadline + one onExpiry per grant means multi-stage byo-yomi must be expressed as a chain of expiry events (enterByoYomi -> consumePeriod* -> flag). This works cleanly because pendingGrants is re-evaluated after every admitted event, and overdue chains after a long outage fire as a deterministic one-at-a-time cascade at recovery - but the contract only implies, never states, that overdue deadlines at recovery fire sequentially in re-evaluation order. Minor wording gap.
- F5 - client ticking display: clients must render countdowns from projected (turnOpenedAt, mainMs/periodsLeft/periodMs) plus their own local clock. Display-only and C8-compliant (client time is never an input), and projection is trivial since clocks are public (projectEvent passes clock payloads through; no hidden info in this game) - but the charter should bless the 'clients extrapolate, server adjudicates' pattern explicitly in the clock helper docs.
- F6 - integers only (C2): all clock values are integer milliseconds, which is fine; any future time-odds or speed-scaling feature must define integer rounding explicitly. Non-issue for this game.

## Required API changes (designer claim)

- C7/C8 clarification (expiry timestamp): add one sentence to the contract specifying that the framework-recorded expiry event carries the actual server-assigned admission timestamp, which MAY be later than the armed deadline value (late timer, recovery after downtime) and is never earlier. Without this, the core restart-fairness behavior this gate tests is implementation-defined: two conforming frameworks could record ts=deadline-value vs ts=firing-time and produce observably different byo-yomi outcomes after an outage, and the pause-style downtime policy becomes inexpressible under deadline-value semantics.
- C7 ordering guarantee (deadline fences the log): once a deadline D is armed for the current grant set, the framework must not admit any response to that grant set bearing a server timestamp > D before admitting D's expiry event. This makes spent <= remaining a framework-level invariant, so game clock reducers do not need defensive clamps and duplicated period-cascade logic in the move path. Minimal wording: 'an armed deadline totally orders the log at D: the expiry event is admitted before any grant response timestamped after D.'

## Adversarial verifier findings

**Summary:** Verdict: sound, with two minor violations and several glossed problems. The trace arithmetic is fully correct -- I re-derived every row of Trace A (debits 90000/10000/21500, logical anchors 1,130,000/1,160,000, period reset at e5, flag at 1,230,000) and both restart traces; the restart story (replay -> state (turnOpenedAt=1,100,000, mainMs=30,000) -> pure re-derivation of deadline 1,130,000, bit-identical, no gift, no double-debit) is genuinely correct and correctly attributed to C7 re-evaluation + C8 deadline-as-pure-function-of-state-holding-recorded-timestamps. The 'remaining-as-of-turnOpenedAt' state shape plus logical-boundary anchoring in expiry reducers is the right construction and makes the naive re-arm-from-now bug unrepresentable. The friction report is honest and substantive, not a rubber-stamp: F1 (no expiry-vs-late-response fencing) and F2 (expiry timestamp semantics unspecified) are real contract gaps and the two required changes are precisely targeted. Violations found: (1) e8 claims the framework records a no-grant rejection as an 'admission loser' -- the contract only records arbitration losers among overlapping grant responses; (2) the design silently relies on armed deadlines being disarmed when superseded by re-evaluation, an unstated framework behavior it never flags despite flagging every adjacent deadline-semantics gap. Biggest glossed problems: the shown move reducer only clamps and omits the byo-yomi overage cascade that F1 itself declares mandatory (so the design's own pseudocode leaks free time under the current contract); out-of-turn resignation is inexpressible under the single-grant scheme (a deadline-less standing grant does not fit the contract's grant shape) yet 'resign' is listed in allowedActions; negative-spent from non-monotonic timestamps is unguarded; B2's reliance on past-due deadlines firing immediately at recovery is understated in F4; and F3's pause-on-outage fix is debatably required rather than optional given the gate's 'not unfairly flagged' criterion for long outages.

**Contract violations in the design:**
- Trace A row e8: a move arriving after the game ended 'matches no grant; recorded as admission loser'. The contract only promises that ARBITRATION losers (losers of overlapping-grant resolution under 'priority-order'/'first-come'/'collect-all-then-resolve') are recorded in the admission log. An action matching no open grant is not an arbitration loser; the contract says nothing about recording it. Minor and cosmetic, but it asserts a framework recording behavior the contract does not grant.
- Disarm-on-supersession is silently assumed: every trace row where a move lands before the armed deadline (e1, e2, e5, e6) requires the framework to cancel the previously armed deadline when re-evaluation yields a new grant set. The contract says 'arms deadlines, appends exactly one expiry event per deadline' and never states that a superseded deadline does not fire. It is the only sane reading, but the design's otherwise exhaustive deadline-semantics friction list (F1, F2, F4) never flags it, so the design is leaning on an unstated framework guarantee without reporting it.

**Problems the design missed:**
- The shown move reducer contradicts the design's own F1: F1 correctly says a late-admitted move (ts > armed deadline, under the unguaranteed current contract) requires duplicating the byo-yomi cascade arithmetic in the move path, but the pseudocode only does mainMs = max(0, mainMs - spent). As written: a move admitted 5s past the main-time deadline zeroes mainMs and resets turnOpenedAt without consuming the 5s overage from periods (free skip of enterByoYomi debit), and in byo-yomi a move admitted past the period deadline gets 'no debit -- period resets', meaning a late-admitted move past the LAST period escapes flagging entirely. The friction is honestly named but the design's own reducers do not contain the mitigation it says is mandatory.
- Out-of-turn resignation is inexpressible and unaddressed: pendingGrants only ever emits one grant, for toMove. In Go/chess either player may resign at any time, including while the opponent thinks. A standing 'resign anytime' grant for the waiting seat would need a grant with no deadline/onExpiry, and the contract's grant shape appears to require both -- this is real friction the design never mentions (it even lists 'resign' in allowedActions, masking the gap).
- Timestamp monotonicity is assumed, never stated: spent = e.ts - turnOpenedAt goes NEGATIVE if the log's server-assigned timestamps are not guaranteed monotonic (the contract is silent), and max(0, mainMs - spent) does not clamp negative spent -- the clock would GAIN time. Related: required change #2's wording fences only ts > D, leaving the ts == D equality case (move with spent exactly == remaining vs expiry) ambiguous.
- Trace B2 presumes the framework fires an already-past deadline immediately upon arming at recovery ('the framework fires it immediately'). F4 flags only the ORDER of overdue cascades as implied-not-stated; whether/when a deadline that is already in the past at arm time fires at all is equally unstated, and the entire outage-crossing trace rests on it. F4 understates this as a 'minor wording gap' when B2's correctness depends on it.
- F3's 'optional, not required' classification is arguable against the gate's own fairness bar: under physical-clock semantics, an outage longer than (remaining main + all periods) flags a player who had zero opportunity to move -- exactly the 'unfairly flagged' outcome the gate probes. The design confronts this honestly in B2/F3 but then downgrades the recovery-boundary-event fix from required to optional; for a production Go server the pause/compensate policy is closer to mandatory than optional.
- Scoring phase is punted with one sentence ('collect-all-then-resolve grant for dead-stone agreement') without saying whose clock, if any, runs during it, what its deadline/onExpiry is, or how a disagreement (resume play) reopens clocks. Acknowledged as out of scope, but it is the one multi-grant, non-trivial-resolution part of this game and the design avoided it.
