# Phase 0 Gate: No-Limit Hold'em cash-game session with mid-session economy (rebuy after bust, mid-session join, cash-out, no natural end)

**Designer verdict:** expressible-with-friction  
**Adversarial verification:** ISSUES FOUND (see verifier findings)

## Design

# No-Limit Hold'em Cash-Game Session — Paper Design vs Charter v4.1

## 1. State sketch (canonical JSON, integers only — money in cents/chips per C2)

```json
{
  "phase": "BETWEEN_HANDS | HAND_ACTIVE | CLOSING | CLOSED",
  "sessionStartTs": 1718200000000,
  "policy": {"sb":100,"bb":200,"actMs":25000,"interHandMs":8000,
             "rebuyWindowMs":120000,"showMs":10000,
             "minBuyIn":20000,"maxBuyIn":100000,"maxDurationMs":28800000},
  "handNo": 41, "button": 2, "lastEventTs": 1718203400123,
  "seats": {
    "1": {"playerId":"p_ana","status":"ACTIVE","stack":84200,"pendingChips":0,"pendingWalletOp":null},
    "3": {"playerId":"p_bo","status":"BUSTED","stack":0,"pendingChips":0,
          "pendingWalletOp":{"kind":"DEBIT","amountCents":50000,"reqEventId":"e501"}},
    "5": {"playerId":null,"status":"EMPTY"}
  },
  "hand": {"street":"FLOP","board":["Ah","7d","2c"],
           "holeCards":{"1":["As","Kd"],"3":["9c","9h"]},
           "pots":[{"amount":4400,"eligible":[1,3]}],
           "actor":3,"toCall":600,"minRaiseTo":1200,"lastActionTs":1718203400123},
  "lifecycle": {"closeRequested":false,"pendingCashouts":[]}
}
```

`holeCards` lives in canonical server state; clients only ever see projected events. Seat objects key hidden info by **playerId embedded in events**, never by seat number (see friction F6). A reserved virtual seat id `"SYS"` exists in game state to host table-scoped timer grants (workaround for grants requiring a seat).

## 2. pendingGrants(state) by phase

| Condition | Grant(s) returned |
|---|---|
| BETWEEN_HANDS, seat s BUSTED, no pendingWalletOp | `{seat:s, [REQUEST_REBUY(minBuyIn..maxBuyIn), LEAVE], deadline: handEndTs+rebuyWindowMs, onExpiry: LEAVE, first-come}` |
| BETWEEN_HANDS, seat s ACTIVE | `{seat:s, [SIT_OUT, SIT_IN, REQUEST_CASH_OUT, LEAVE], deadline: <same as START_HAND timer>, onExpiry: NOOP, first-come}` (standing offer; relies on disarm semantics — see required change 2) |
| BETWEEN_HANDS, ≥2 eligible seats, !closeRequested | `{seat:"SYS", [], deadline: handEndTs+interHandMs (or eligibilityEventTs+interHandMs), onExpiry: START_HAND}` |
| HAND_ACTIVE, betting open | single grant: `{seat: hand.actor, [FOLD, toCall>0?CALL:CHECK, RAISE(minRaiseTo..stack)], deadline: lastActionTs+actMs, onExpiry: toCall>0?FOLD:CHECK}` |
| HAND_ACTIVE, street closed | `{seat:"SYS", [], deadline: lastEventTs+0, onExpiry: DEAL_FLOP/TURN/RIVER}` — zero-delay timer; randomness resolves at admission of the expiry event (C3) |
| HAND_ACTIVE, all-in runout | `{seat:"SYS", [], deadline: lastEventTs+0, onExpiry: REVEAL_ALL_IN}` — payload must embed all live hole cards (required change 1) |
| HAND_ACTIVE, showdown, next seat s in show order | `{seat:s, [SHOW, MUCK?], deadline: lastEventTs+showMs, onExpiry: must-show? SHOW : MUCK}` — sequential single grants |
| Hand resolved | `{seat:"SYS", [], deadline: lastEventTs+0, onExpiry: HAND_END}` (pot award computed in HAND_END's reduction) |
| Always (until CLOSED) | `{seat:"SYS", [], deadline: sessionStartTs+maxDurationMs, onExpiry: SESSION_TIMEOUT}` — re-returned after every event, must arm once |
| CLOSING, all pendingCashouts confirmed | `{seat:"SYS", [], deadline: lastEventTs+0, onExpiry: SESSION_CLOSED}` |
| CLOSED | ∅ — log quiesces |

**Classification (as demanded):**
- **Grants:** all betting actions, SHOW/MUCK, SIT_IN/OUT, REQUEST_REBUY, REQUEST_CASH_OUT, LEAVE, and every SYS timer (START_HAND, DEAL_*, HAND_END, SESSION_TIMEOUT, SESSION_CLOSED).
- **Admission-layer intents outside the game:** JOIN_TABLE (the player is not in state, so no grant can exist for them), CLOSE_SESSION (operator/owner, not a seat).
- **External-input events (C8):** WALLET_DEBIT_OK/FAIL, WALLET_CREDIT_OK/FAIL — recorded by the game-side wallet adapter, bypass grant authorization, carry `reqEventId` correlation and integer-cents payloads.

Effects are derived deterministically from admitted events (REQUEST_REBUY/PLAYER_JOINED → wallet debit; cash-out/close → wallet credit), idempotency key = originating eventId. Responses re-enter as external-input events.

## 3. Worked trace (hand N=41 → N+1=42)

Format: `event | source | admission verdict | state Δ / effects | grants after`.

**A. Broke → rebuy → reseated in N+1**
- `e500 HAND_END(41)` | SYS expiry | admit | seat1 wins pot; seat3 stack→0, BUSTED; phase BETWEEN_HANDS | grants: seat3 rebuy (dl=t500+120s, exp LEAVE); seat1 standing; SYS START_HAND (dl=t500+8s); SYS MAXDUR.
- `e501 REQUEST_REBUY{50000}` from p_bo | intent | **admit** — seat3 grant covers it, 20000≤50000≤100000 | pendingWalletOp set; **effect: walletDebit(p_bo, 50000, idem=e501)** | seat3 rebuy grant gone → disarmed; START_HAND still armed.
- `e502 WALLET_DEBIT_OK{reqEventId:e501,amountCents:50000}` | **external-input, recorded between segments per C8** | admit (no grant needed) | seat3 pendingChips=50000, op cleared, status SITTING_IN | grants unchanged (START_HAND deadline identical → stays armed once).
- `e503 START_HAND(42)` | SYS expiry at t500+8s | admit; **shuffle resolves at admission (C3)** — event carries each eligible seat's hole cards; seat3's pendingChips sweep to stack at this reduction → **p_bo dealt into hand N+1** | phase HAND_ACTIVE | grant: single betting grant for first actor; SYS MAXDUR.
- *Slow-wallet variant:* if e502 lands after e503, p_bo is simply not eligible at e503 (stack 0); chips sweep at START_HAND(43) — no special machinery.

**B. New player joins mid-hand-42**
- `e504 JOIN_TABLE{p_cy, seat:5, buyIn:60000}` | **admission-layer intent** (no grant possible — p_cy absent from state) | admit: seat 5 EMPTY, buy-in in range → PLAYER_JOINED | seat5 RESERVED for p_cy; effect: walletDebit(idem=e504) | live-hand grants untouched.
- `e505 WALLET_DEBIT_OK(e504)` | external | admit | seat5 pendingChips=60000, SITTING_IN; dealt in at next START_HAND.
- **History projection for p_cy** (stateless, per-event): START_HAND/DEAL events → holeCards filtered to `payload.playerId == viewer.playerId` → all prior hands fully redacted for p_cy; SHOW/REVEAL events are public (they carry their payloads — reveal-as-explicit-event); WALLET_* events → amount public, external account fields stripped unless owner. Because seat 5's previous occupant's cards were keyed by *their* playerId, seat reuse leaks nothing.

**C. Cash-out (between hands)**
- `e530 REQUEST_CASH_OUT` from p_ana | intent | admit via seat1 standing grant | seat1 CASHING_OUT, stack frozen 84200, ineligible for dealing; **effect: walletCredit(p_ana, 84200, idem=e530) through the effects boundary** |
- `e531 WALLET_CREDIT_OK(e530)` | external | admit | seat1 → EMPTY; conservation: Σstacks + pendingOps = Σdebits − Σcredits. On WALLET_CREDIT_FAIL: seat stays locked CASHING_OUT, ops flag set; retry/repair arrives as further external events.

**D. Termination (no natural end)**
- `e600 SESSION_TIMEOUT` | SYS expiry of the session-long deadline (sessionStartTs+8h), fires mid-hand 57 | admit | closeRequested=true; current hand's grants keep being returned; START_HAND and rebuy grants stop appearing.
- `e6xx HAND_END(57)` | SYS expiry | admit | phase CLOSING; every occupied seat → CASHING_OUT; **effects: one walletCredit per seat (idem=e6xx:seat)**.
- `WALLET_CREDIT_OK ×k` | external | admit each; last one → pendingGrants returns SYS zero-delay SESSION_CLOSED.
- `e6zz SESSION_CLOSED` | SYS expiry | admit | phase CLOSED; pendingGrants=∅ forever.
- Explicit close: identical pipeline, but the trigger is the CLOSE_SESSION **admission-layer intent** instead of the expiry event.

## 4. Verdict

**Expressible-with-friction.** The session economy, segment boundaries, wallet round-trips, late join, and termination all compose cleanly from grants + admission-layer intents + external-input events. Two contract gaps must be fixed before freeze: admission-time payload materialization for reveal/auto events (without it, mandatory all-in reveals and timeout-show are inexpressible), and grant lifecycle (disarm/dedup) semantics across re-evaluations (without it, auto-fold fires after a player already acted, and the session-long deadline either duplicates or never arms). Finding these is the point of the gate.

## Friction points (designer)

- Reveal payload gap: onExpiry records only an action name, projection is stateless, and past events are never re-projected - so SHOW-on-timeout and REVEAL_ALL_IN events have no way to carry the hole-card payloads C9 requires reveal events to carry. Auto-muck-only is a workaround for timeout-show but breaks all-in runouts (a disconnected all-in player cannot be made to forfeit); hence required API change 1.
- Grant lifecycle across re-evaluations is unspecified: 'appends exactly one expiry event per deadline' does not say whether a deadline is disarmed when the grant stops appearing (player acted before timeout - the FOLD expiry must NOT fire) or deduped when an identical grant is re-returned after every event (the session-long max-duration deadline); hence required API change 2.
- Zero-delay expiry grants (deadline = lastEventTs + 0) are the only self-advance mechanism and are load-bearing: dealing streets (which need admission-time randomness so MUST be new admitted events), HAND_END, SESSION_CLOSED all ride on them. Works, but the charter should bless an auto(action) library helper so every game does not reinvent it.
- Grants require a seat, but table-scoped timers (START_HAND, SESSION_TIMEOUT, SESSION_CLOSED) have no actor. Workaround: a reserved virtual seat 'SYS' in game state with allowedActions []. Ergonomic fix would be seat:null, but the workaround is sound, so not listed as required.
- Every grant must carry a deadline + onExpiry, so standing offers (cash-out/sit-out available all through BETWEEN_HANDS) are modeled by borrowing the phase-end deadline with onExpiry NOOP - safe only given the disarm semantics of required change 2; otherwise the log accumulates NOOP expiry noise.
- Projection must key hidden info on playerId embedded in the event, never on seat: seats are reused across the session-spanning log, and seat-keyed redaction would leak a prior occupant's hole cards to a late joiner who takes the same seat. projectEvent(event, viewer) statelessness makes this a hard requirement; charter should carry a normative note.
- C7/C8 interaction unstated: external-input recorded events (wallet responses) must bypass grant authorization (no seat is granted 'receive wallet callback'), and JOIN_TABLE must be admittable with no grant because the joiner is not in state. Both rely on the 'admission-layer intents outside the game' category the charter names but does not bound - the game should declare an explicit whitelist of grant-exempt intent types.
- Wallet adapter discipline (game-side, no framework change): external payloads must be canonicalized to C2 before recording - integer cents (wallet JSON floats would poison the log) - and must embed the correlating reqEventId so reducers can deterministically match confirmations to the emitting event.
- Late-joiner history delivery is a full-log per-event projection; a long cash session makes this expensive. Correctness is fine (everything redacts properly), but the contract has no snapshot/compaction power - operational cost concern to note for the framework roadmap, not a blocker.

## Required API changes (designer claim)

- C7+C9: add a pure admission hook materializeEvent(state, actionName, actorSeat) -> canonical payload, invoked when admitting both player intents and onExpiry default actions. Needed because reveal-as-explicit-event requires the reveal event to carry the newly-visible payload, but onExpiry records only an action name and projection is stateless over never-re-projected past events. Without it, mandatory reveals with no willing actor (all-in runout REVEAL_ALL_IN, must-show on showdown timeout) are inexpressible.
- C7: specify grant lifecycle across re-evaluations: (a) each post-event evaluation replaces the armed set; (b) a grant identical under (seat, onExpiry, deadline) persists as the same armed deadline - no duplicate expiry even if re-returned after thousands of events (session max-duration timer); (c) grants absent from the latest evaluation are disarmed and their expiry never fires (auto-fold must not fire after the player already acted). 'Exactly one expiry event per deadline' applies only to deadlines still armed at fire time.

## Adversarial verifier findings

**Summary:** Not a rubber-stamp — the design found genuine, well-argued friction, and both required API changes target real contract gaps (expiry events cannot carry reveal payloads under stateless never-re-projected projection; grant disarm/dedup lifecycle is unspecified). The playerId-keyed-redaction catch (friction 6) is particularly good. But it fails the honesty bar on three counts. First, two framework powers are silently assumed and listed nowhere as friction or required changes: admission-layer game-state validation of grant-exempt intents (JOIN_TABLE's seat/buy-in checks, CLOSE_SESSION operator auth — the contract's only authorization surface is grants), and framework construction of game-structured deal payloads (playerId-keyed hole cards, 3-card flops) under bare C3, which the design's own stateless-projection argument proves necessary yet which its proposed pure, randomness-blind materializeEvent cannot supply either. Second, the worked trace breaks at its centerpiece: with the sketched heads-up table, the design's own '≥2 eligible seats' condition forbids the START_HAND grant the trace arms at e500, making the e503 timing and the 'slow-wallet variant' incoherent as written. Third, the termination flow depends on fired-grant identities never re-arming ('Always (until CLOSED)' MAXDUR row), a semantic absent from both the contract and required change 2 as drafted — as specified, SESSION_TIMEOUT can re-fire indefinitely. Add unexamined wallet-liveness holes (CLOSING can hang forever on a dead wallet despite the API being able to express a guard; post-CLOSED stragglers; debit-fail past the rebuy window) and the inexpressibility of mid-hand sit-out/leave intents for non-actors. Verdict: right overall shape and largely honest friction reporting, but the trace is not correct event-by-event and the required-changes list is incomplete; the gate should bounce it for one revision rather than accept it.

**Contract violations in the design:**
- Admission-time game-state validation for grant-exempt intents is assumed, not contracted. Trace e504 admits JOIN_TABLE with the verdict 'seat 5 EMPTY, buy-in in range' and transforms it into PLAYER_JOINED, and CLOSE_SESSION is authorized as 'operator/owner, not a seat'. The contract's ONLY intent-authorization surface is grants (allowedActions + constraints); friction item 7 proposes a whitelist of grant-exempt intent TYPES, but a type whitelist cannot perform per-state validation (seat emptiness, buy-in range, double-join races) or actor authorization. The design silently grants the admission layer game-logic powers and does not list this as a required API change.
- Framework-structured deal payloads are assumed under bare C3. Trace e503 claims 'shuffle resolves at admission (C3) — event carries each eligible seat's hole cards', and DEAL_FLOP/TURN/RIVER 'randomness resolves at admission of the expiry event'. C3 supplies resolved raw outcomes (a shuffled deck); mapping that into a playerId-keyed hole-card map, or exactly 3 flop cards drawn from the remaining-deck state, is game logic executed at admission — a power the contract does not grant. The design correctly identifies this gap for REVEALS (required change 1) but presents DEALS as contract-expressible, which they are not by the design's own argument: stateless projectEvent cannot show a viewer their own cards from a raw-deck payload, so the structured payload is mandatory and nothing in the contract can build it.
- The session-long MAXDUR grant is returned 'Always (until CLOSED)' — including after SESSION_TIMEOUT has fired. The trace's quiescence (no repeat SESSION_TIMEOUT during hand 57 completion and CLOSING) depends on a 'fired grant identities never re-arm' semantic that exists neither in the contract nor in the design's own required change 2 as drafted: change 2(b) covers dedup of an ARMED identity, and its closing sentence scopes 'exactly one expiry' to 'deadlines still armed at fire time', leaving post-fire re-return of an identical grant with a now-past deadline undefined. As written, SESSION_TIMEOUT could re-fire after every subsequent event. The trivial fix (condition the grant on !closeRequested) is absent from the grant table.

**Problems the design missed:**
- Trace break at e500→e503: per the state sketch the table is effectively heads-up (seat1 ACTIVE, seat3 BUSTED, seat5 EMPTY), so after HAND_END(41) only ONE eligible seat exists and the design's own START_HAND condition ('≥2 eligible seats') means the START_HAND grant CANNOT arm at e500 with dl=t500+8s as the trace asserts. Hand 42 only becomes schedulable at e502 (rebuy confirmed), at which point the unresolved deadline formula — handEndTs+interHandMs (already near/past) vs eligibilityEventTs+interHandMs — decides whether hand 42 starts instantly or 8s later. The 'slow-wallet variant' (e503 admitted before e502) is impossible at this table: START_HAND cannot fire with one eligible seat. The trace is only coherent if unstated extra players exist, contradicting the sketch.
- The proposed materializeEvent(state, actionName, actorSeat) is declared pure and takes no resolved-randomness input, so even the design's own required change 1 cannot produce the deal payloads it needs (a pure function of state cannot shuffle, and C3 randomness resolves in the framework). The two mechanisms — C3 outcome attachment and materializeEvent payload construction — are never composed; the hook signature needs the framework-resolved randomness as a parameter.
- Simultaneous-deadline tie-breaking is glossed: the per-seat standing-offer grants deliberately share the START_HAND deadline with onExpiry NOOP, and friction 5 claims safety 'given the disarm semantics of required change 2' — but disarm only saves the NOOPs if the framework fires START_HAND FIRST among equal-timestamp deadlines. Neither the contract nor required change 2 specifies ordering of co-expiring deadlines; the wrong order records per-seat NOOP expiry events every single hand (and required change 2's post-fire-identity ambiguity then applies to the re-returned NOOP grants).
- Wallet liveness and stragglers: CLOSING waits for all credit confirmations with NO deadline guard, so a dead wallet hangs the session in CLOSING forever — even though the grant API could trivially express a SYS timeout grant per pending op (the design models no such guard). WALLET_*_OK/FAIL arriving AFTER SESSION_CLOSED enters a quiesced log as a grant-exempt external event with no defined reduction. A rebuy WALLET_DEBIT_FAIL re-exposes the rebuy grant whose deadline (handEndTs+rebuyWindowMs) may already be past, producing an instant LEAVE expiry; and a hung debit lets a busted player hold their seat indefinitely since the BUSTED-with-pendingWalletOp row returns no grant at all. None of these paths are traced.
- Non-actor seats have ZERO grants during HAND_ACTIVE, so a player who has folded (or any non-actor) cannot submit sit-out-next-hand, LEAVE, or REQUEST_CASH_OUT until BETWEEN_HANDS — standard cash-game intents are inexpressible mid-hand. Modeling them as always-on per-seat grants re-imports the NOOP-deadline noise problem; the design never examines this tension.
- Cash-game seating economics around the rebuy/join flow are unmodeled: blind posting obligations for the rejoining busted player and the mid-session joiner (post-now vs wait-for-BB, dead button rules) directly interact with the pendingChips sweep and START_HAND eligibility, and are economy-relevant for the very flows the task demanded.
- The state sketch is internally contradictory (button:2 with no seat 2 in the map; seat3 simultaneously BUSTED with a pending rebuy debit AND the live hand's current actor with hole cards and pot eligibility) — minor, but it undermines the sketch as evidence the trace was actually checked against the design's own grant conditions.
