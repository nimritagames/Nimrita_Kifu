# Phase 0 Gate RE-RUN: poker-cash-game

**Run:** 2026-06-12, against `docs/spec/01-game-contract.md` v0.1 (R1–R7 incorporated).  
**Designer verdict:** expressible-with-friction  
**Adversarial verifier:** pass=false — kill-shots survived 6/7

## Kill-shot results

### ✅ K1 START_HAND eligibility purely from state

pendingGrants(state) computes eligibleCount from per-seat fields (stack>0 && sittingOut==0 && cashOutRequested==0 && leaveRequested==0 && pendingDebitId==0) and returns NO START_HAND when count<2. Existence is a pure eligibleCount>=2 test, not a default — the round-1 incoherence (grant armed against its own >=2 rule with one eligible seat) cannot recur. K1.2 returns no START_HAND with only s0; K1.5 arms it only after WALLET_DEBIT_OK funds s1 and count reaches 2. Critically the START_HAND window is an IDLE table: no events are admitted between eligibility (K1.4) and firing, so the deadline does not creep even if anchored on a stored event ts, and grant identity (null,[START_HAND],deadline) stays stable -> arms once, fires once. The lastTs-creep trap (the hanchan bug) requires events to keep arriving inside the window; an idle table has none. NOTE: the deadline 'ts+30000' presumes a state-stored anchor (eligibility-event ts) that the state sketch does not name — pendingGrants cannot see the clock; this is a clearly-expressible fix (charter blesses 'reducers may hold time-derived values as ordinary state') so it does not kill the shot, but the sketch is incomplete.

### ✅ K2 standing grants for mid-hand economy intents

R5 standing grants are deadline-less: pendingGrants returns s1's CASH_OUT grant every evaluation gated only by a per-seat predicate (seated), never by phase, so it is available mid-hand to a folded non-actor. R5 as written: absent deadline => no expiry, retired only when re-evaluation stops returning it; R3.1 re-arms idempotently. Validator signature (state,intent) suffices — cash-out legality is a pure state check. Reducer sets cashOutRequested=1 without touching pot/board/actor. R6 delivers only to s1. This directly closes the round-1 hole 'mid-hand sit-out/leave for non-actors inexpressible'. Nothing exceeds the granted signatures.

### ✅ K3 wallet callbacks as validated nonGrantIntents

WALLET_DEBIT_OK/FAIL declared in nonGrantIntents (R7); their validators carry full authorization and match debitId (intent.payload) to state.pendingDebitId — entirely within the (state,intent) signature, no power beyond it. The rebuy 'window' is modeled as the lifetime of the pendingDebitId state field, NOT a timer, correctly avoiding any unseen-clock dependency. FAIL after a later hand started: validator ok, reducer zeroes pendingDebitId/pendingRebuy, stack unchanged (no chips ever added => no rollback). FAIL with no matching pendingDebitId => {ok:false, STALE_DEBIT}, recorded in admission log, no state change. All verdicts and state reads are within the validator contract.

### ✅ K4 wallet-liveness deadline guard + post-close stragglers

The closing watchdog is a system grant seat:null, allowedActions:[], FUTURE deadline (creditsResolvedAnchor+60000), onExpiry:CLOSE_ESCALATE. Type-legal: deadline optional + onExpiry required-iff-deadline-present are both satisfied. R2's prose only ILLUSTRATES empty-actions with at-or-before-now (immediate fire) but does NOT forbid empty-actions with a future deadline, so the watchdog is permitted by the contract as written; the only gap is missing illustrative prose (the claimed required change). Each WALLET_CREDIT_OK decrements closingCreditsOutstanding; design states the deadline is 'stable across re-arm' (anchor fixed at close, not moved per credit) so identity (null,[],deadline) is stable -> arms once. closingCreditsOutstanding==0 stops returning it and fires an immediate SESSION_CLOSED. Dead wallet => exactly one CLOSE_ESCALATE expiry (R3.2) quarantines open segment/settles at last closed boundary — wallet cannot hang the session. Straggler post-close: nonGrantIntent validator checks phase==closed in state => {ok:false, SESSION_CLOSED}, recorded, no state change. Closes the round-1 'CLOSING can hang forever' hole. NOTE: like K1, the anchor field is not shown in the sketch's CLOSE_REQUESTED reducer, but storing event.ts there is clearly expressible.

### ✅ K5 session timer cannot re-fire (state-conditioned)

Strongest of the set. deadline = state.sessionDeadlineMs — a LITERAL absolute value present in the state sketch (1789000000000), not now+N and not lastEventTs+N, so it never creeps and identity (null,[],sessionDeadlineMs) is stable across every hand => re-arms idempotently. On elapse, exactly one SESSION_TIMEOUT (R3.2); its reducer sets closeRequested=1; next pendingGrants gates the timer on closeRequested==0 so it is ABSENT => disarmed => 'absent grants' expiry never fires (R3.2 verbatim). Re-fire would require the grant still be returned, which the predicate forbids — provably impossible under R3 as written. This precisely closes the round-1 hole 'MAXDUR returned Always(until CLOSED) so SESSION_TIMEOUT can re-fire indefinitely' by introducing the explicit !closeRequested predicate the round-1 grant table lacked.

### ✅ K6 deals + forced reveals via materialize

This is the round-1 FATAL gap (framework-structured deals assumed under bare C3; a pure randomness-blind hook could not build payloads). R1's signature materialize(state,actor,rng)=>payload closes it. DEAL: materialize.DEAL(state,null,rng) uses rng.shuffle(deck) + per-seat assignment — rng IS the framework's deterministic per-segment stream passed IN, so the 'pure function cannot shuffle' objection is dissolved; result recorded verbatim (C3: replay consumes outcomes, never re-runs PRNG). projectEvent(DEAL,viewer) is stateless over (event,viewer): owner sees cards, others see {seatRef:holeCount}. FORCE_REVEAL: materialize.FORCE_REVEAL(state,null,rng) copies state.holeCards[s1] into a public payload — the previously-inexpressible all-in forced reveal, now expressible because materialize reads state; reducer sets revealed[s1]=1; projectEvent shows it to all (reveal-as-explicit-event, C9). materialize never needs viewer/clock/identity — only (state,actor,rng). System grants seat:null so existence leaks to no one (R6). Nothing exceeds the granted signatures.

### ❌ K7 seat-reuse privacy via opaque refs

NOT provable from the contract as written. The privacy proof hinges on the framework minting a FRESH opaque SeatRef per occupancy (new joiner = s9, never the vacated s1), so projectEvent's predicate viewer.seat===event-owner-ref redacts the prior occupant's DEAL. But the contract grants no such power: SeatRef is defined (line 20-21) as 'Opaque seat reference — the ONLY player identifier' and the brand name plus doc-comment ('seat reference') lean toward a SEAT-POSITION label that would be RECYCLED across occupants (s1 stays s1). If recycled, projectEvent(old DEAL, viewer=new occupant of s1) matches s1===s1 and LEAKS the prior hand. R7 as incorporated says 'opaque-ref projection keys' but nowhere states that vacating/re-taking a seat mints a fresh non-recycled ref. The design's K7 trace SILENTLY ASSUMES the fresh-ref-per-occupancy power and concedes in its own friction note that this 'is the only true ambiguity' and 'the privacy proof depends on this being nailed down.' Honest-about-the-gap is still a gap: the guarantee survives only AFTER the claimed required change (one normative sentence on SeatRef per-occupancy minting + the projection redaction rule) is added to the text — which it is not yet. Under 'the contract as written,' K7 is not genuinely survived.

## Design (full)

## State sketch (canonical JSON, integers only — chips in cents)

```json
{
  "phase": "between-hands",
  "button": 2,
  "seats": [
    {"ref":"s0","stack":50000,"inHand":0,"folded":0,"allIn":0,
     "sittingOut":0,"cashOutRequested":0,"leaveRequested":0,
     "pendingRebuy":0,"pendingDebitId":0,"holeCount":0},
    {"ref":"s1","stack":0,"inHand":0,"folded":0,"allIn":0,
     "sittingOut":1,"cashOutRequested":0,"leaveRequested":0,
     "pendingRebuy":0,"pendingDebitId":0,"holeCount":0}
  ],
  "board": [],
  "deck": [],
  "holeCards": {},
  "revealed": {},
  "potCents": 0,
  "handIndex": 7,
  "closeRequested": 0,
  "closingCreditsOutstanding": 0,
  "sessionDeadlineMs": 1789000000000,
  "lastDebitId": 41
}
```

`holeCards` maps `seatRef -> [cardInt,cardInt]` and is the redactable bit. `revealed` maps `seatRef -> 1` once a forced/voluntary reveal event has been recorded (reveal-as-explicit-event, C9). Eligibility for a hand = `stack>0 && sittingOut==0 && cashOutRequested==0 && leaveRequested==0 && pendingDebitId==0`.

## Per-phase behavior

**pendingGrants(state)** is a pure function of state and is the ONLY flow surface. It emits, in every evaluation:
- Standing economy grants (K2): for each seated seat, deadline-less grants for `SIT_OUT`, `SIT_IN`, `REBUY` (if `stack < buyinMax`), `CASH_OUT`, `LEAVE` — gated only by per-seat predicates, never by `phase`. These are the R5 standing grants; they re-arm idempotently every evaluation and are simply *absent* when their predicate goes false.
- The system flow grant for the current phase (deal, betting actor, street advance, showdown reveal, hand-start), seat-null where appropriate.
- The session-timer grant (K5) and the closing-liveness grant (K4) when their state predicates hold.

**validators** are the law (R7). Standing-grant validators re-check the same predicates pendingGrants used (grant constraints are hints only). nonGrantIntent validators (`WALLET_DEBIT_OK/FAIL`, `WALLET_CREDIT_OK`, `JOIN_TABLE`) carry full authorization and match an incoming callback to state by `debitId`/`creditId`.

**materialize** authors payloads the actor cannot: `DEAL` (rng shuffle + per-seat hole assignment), `FORCE_REVEAL` (copies hole cards from state into a public reveal payload), `START_HAND` defaults, `SESSION_TIMEOUT`, `CLOSE_ESCALATE`. All randomness is the per-segment rng (C3). A segment = one hand (segmentOpenTypes:[START_HAND], segmentCloseTypes:[HAND_SETTLED]).

**projectEvent / projectState**: hole cards project to their owner verbatim; to everyone else `DEAL` projects with `holeCards` redacted to `{seatRef: holeCount}` (count only). A recorded `FORCE_REVEAL`/`SHOW` event projects to all viewers (it is the explicit reveal). projectState redacts `holeCards`/`deck` for non-owners.

---

## K1 — START_HAND eligibility as state-conditioned system grant
Heads-up table, hand #7 in progress, s0 and s1 both in. Hand ends, s1 is all-in and busts: `HAND_SETTLED` reducer sets `s1.stack=0`. Re-evaluation: pendingGrants counts eligible seats = `{s0}` (s1 stack 0). Count = 1 < 2 ⇒ **no START_HAND grant returned**. The table sits idle armed only with s0's standing economy grants (incl. s1's REBUY standing grant, since `stack<buyinMax`).
Trace:
1. `HAND_SETTLED` admitted (seat null, system). State: s1.stack=0, phase=between-hands.
2. pendingGrants → [s0 economy grants, s1.REBUY (standing, no deadline), s1.SIT_IN…]. **No START_HAND.** ✓ (round-1 violation cannot recur: the grant's existence is a pure `eligibleCount>=2` test, not a default.)
3. s1 sends `REBUY{amount:50000}` (standing grant response) → validator ok → reducer sets `s1.pendingRebuy=50000, s1.pendingDebitId=42`. s1 still ineligible (`pendingDebitId!=0`).
4. `WALLET_DEBIT_OK{debitId:42}` (nonGrantIntent) admitted → reducer: `s1.stack=50000, pendingDebitId=0, pendingRebuy=0`.
5. pendingGrants re-evaluates: eligibleCount = 2 ⇒ now returns `{seat:null, allowedActions:[{type:'START_HAND'}], deadline: ts+30000, onExpiry:{action:'START_HAND'}}` (a standing-ish armed system grant; or deadline-less if "wait for players" — here armed so an idle table auto-starts). START_HAND arms. ✓

## K2 — Standing economy intent mid-hand (R5)
Hand #8 in progress, phase=betting, actor=s0. s1 folded earlier this hand (`s1.folded=1`). s1 wants to cash out without disturbing the live hand.
1. During the whole hand, pendingGrants returns (besides the betting grant for the current actor) s1's standing `CASH_OUT` grant — deadline absent ⇒ never expires, re-armed idempotently after every street event. R6 delivers it only to s1.
2. s1 sends `CASH_OUT{}` mid-hand. Validator: ok (folded or not, cash-out request is always legal for a seated player). Reducer sets `s1.cashOutRequested=1`. It does **not** touch pot/board/actor — the hand is unaffected (folded player has no chips in live play beyond committed pot).
3. Hand continues normally; s0 keeps acting. After `HAND_SETTLED`, s1 is no longer eligible (`cashOutRequested==1`), so K1's eligibleCount drops s1; and a `SETTLE_CASHOUT` system grant arms to credit s1's stack and emit a `WALLET_CREDIT` request. ✓ Mid-hand standing availability to a non-actor: confirmed.

## K3 — Wallet callbacks as nonGrantIntents (R7), incl. FAIL after window
**OK between hands:** as K1 steps 3–4. `WALLET_DEBIT_OK` has no grant; admitted because it is a nonGrantIntent; validator matches `debitId==42` to `s1.pendingDebitId`, state-checks it's still pending, ⇒ ok. Reducer credits stack.
**FAIL after the rebuy window:** define the window as state, not a timer. When START_HAND fires (K1.5) while a rebuy is still pending, that is impossible (s1 was ineligible). But suppose s1 rebought, `WALLET_DEBIT_OK` was slow, and a *different* eligible pair already started hand #9; then `WALLET_DEBIT_FAIL{debitId:42}` arrives. Validator: `debitId==42` matches `s1.pendingDebitId` ⇒ ok (still a valid callback). Reducer: `s1.pendingDebitId=0, pendingRebuy=0, stack unchanged (still 0)`. **Outcome:** the rebuy simply never funded; s1 stays busted/ineligible; no chips were ever added so no rollback needed. If the FAIL arrives for a debitId that no longer matches any seat's `pendingDebitId` (already resolved), validator returns `{ok:false, reason:'STALE_DEBIT'}` — recorded in admission log, no state change. ✓ (Window = the `pendingDebitId` field's lifetime, pure state.)

## K4 — Wallet liveness on CLOSE + straggler after close
CLOSING must not hang on a dead wallet. The closing-credit step is a **system grant with a deadline** (R3.4 doesn't apply — it's a real future deadline guarding liveness):
1. `CLOSE_REQUESTED` admitted → reducer `closeRequested=1, closingCreditsOutstanding = (#seats with stack>0)`, emits per-seat `WALLET_CREDIT` requests (creditIds).
2. pendingGrants while `closeRequested==1 && closingCreditsOutstanding>0` returns `{seat:null, allowedActions:[], deadline: ts+60000, onExpiry:{action:'CLOSE_ESCALATE'}}`. Empty allowedActions ⇒ pure liveness fence.
3. Each `WALLET_CREDIT_OK{creditId}` (nonGrantIntent) decrements `closingCreditsOutstanding`. Re-evaluation re-arms the same-identity deadline grant idempotently (R3.1: identity = (null, [], deadline) — note deadline is state-derived `creditsResolvedAnchor+60000`, stable across re-arm). When `closingCreditsOutstanding==0`, pendingGrants stops returning it AND returns `{seat:null, allowedActions:[{type:'SESSION_CLOSED'}], deadline: now}` firing immediately ⇒ session closes cleanly.
4. **Dead wallet:** no OKs arrive, deadline elapses ⇒ exactly one `CLOSE_ESCALATE` expiry event (R3.2). Its reducer quarantines the open segment / settles at last closed boundary and marks the session forcibly closed. The wallet cannot hang the session forever. ✓
5. **Straggler after close:** `WALLET_CREDIT_OK{creditId:9}` arrives post-SESSION_CLOSED. Its validator (nonGrantIntent, full authz) checks session phase == closed ⇒ `{ok:false, reason:'SESSION_CLOSED'}`, recorded in admission log, no state change. The outbox reconciles the real credit out-of-band (framework C6). ✓

## K5 — Session timer as state-conditioned grant (R3), cannot re-fire
session.termination = max-duration. The timer is expressed as a grant, not a second mechanism:
1. Whenever `closeRequested==0`, pendingGrants returns `{seat:null, allowedActions:[], deadline: state.sessionDeadlineMs, onExpiry:{action:'SESSION_TIMEOUT'}}`. Identity = (null, [], sessionDeadlineMs) — stable, re-arms idempotently across every hand.
2. Deadline elapses ⇒ one `SESSION_TIMEOUT` expiry event (R3.2: exactly one per unsatisfied grant). Reducer sets `closeRequested=1` and triggers the K4 closing sequence.
3. Next pendingGrants: `closeRequested==1` ⇒ the timer grant is **absent** ⇒ disarmed, its expiry can never fire again (R3.2: absent grants' expiry never fires). Provably no re-fire because re-firing would require the grant to still be returned, and the predicate now forbids it. ✓

## K6 — Deals & forced reveals via materialize
**Deal:** START_HAND fires → segment opens → `DEAL` system grant (`seat:null, allowedActions:[{type:'DEAL'}], deadline:now`) fires immediately. `materialize.DEAL(state, null, rng)`: `rng.shuffle(deck)`, assign 2 cards per eligible seat ⇒ payload `{holeCards:{s0:[a,b], s1:[c,d]}, deckRemainder:[…]}`, recorded verbatim. projectEvent(DEAL, viewer=seat s0) ⇒ payload redacted to `{holeCards:{s0:[a,b], s1:2}, deckRemainder: <hidden>}` — own cards shown, others' shown as count. Observer ⇒ all counts.
**All-in runout forced reveal:** s0 and s1 all-in pre-river; s1 disconnected. Rules require all-in hands shown. After the last street is dealt, pendingGrants returns a `FORCE_REVEAL` system grant per all-in seat with `deadline: now, onExpiry:{action:'FORCE_REVEAL'}}` (or fires immediately as a system step). `materialize.FORCE_REVEAL(state, null, rng)` copies `state.holeCards[s1]` into payload `{seat:'s1', cards:[c,d]}`. Reducer sets `revealed[s1]=1`. projectEvent(FORCE_REVEAL, any viewer) ⇒ visible to ALL (it is the explicit reveal event, C9). The disconnected player's hand is shown without their action. ✓

## K7 — Join / seat-reuse privacy on opaque refs
Mid-session, occupant of seat "s1" (ref `s1`) cashes out and leaves; reducer clears `holeCards[s1]` and the physical seat. A new player joins via `JOIN_TABLE` (nonGrantIntent). **Critical:** the framework assigns a *fresh opaque SeatRef* (`s9`), never reusing `s1` (C10 — refs are opaque per-occupancy identifiers, not seat-position labels). pendingGrants/projection key entirely on these refs. Past `DEAL` events for old `s1` were projected at *record time* to viewers; the new viewer `s9` was not a viewer then and "past events are never re-projected" (C9) — but even on per-seat replay, projectEvent(old DEAL, viewer=s9) computes `s9 != s1` ⇒ redacts old s1's hole cards to a count. The joiner can never decode the prior occupant's cards because the projection predicate is `viewer.seat === event-owner-ref`, and `s9` never equals the retired `s1`. ✓ (Friction note below on whether refs are per-occupancy or per-seat.)

## Friction points

- K7 hinges on SeatRef being a fresh per-OCCUPANCY identifier (new joiner gets s9, not the vacated s1). The contract says SeatRef is 'the only player identifier' and 'opaque' (C10) but does NOT explicitly state that seat reuse mints a fresh ref vs. recycling the seat slot's ref. If the framework recycles the position label as the ref, projectEvent(viewer=newOccupant) on an old DEAL would match and leak the prior hand. The privacy proof depends on this being nailed down. It is the only true ambiguity; everything else is fully expressible.
- K4 closing-liveness deadline grant has allowedActions:[] with a FUTURE deadline. The contract's worked example of empty-allowedActions system grants pairs them with 'deadline at-or-before now ⇒ fires immediately' (R2). A pure liveness fence is empty-actions WITH a real future deadline whose only effect is the onExpiry escalation. This is permitted by the type (deadline optional, onExpiry required iff deadline present) but the spec prose only illustrates the immediate-fire case; the future-deadline-empty-actions 'watchdog' pattern is legal-but-undocumented and worth an explicit example so implementers don't reject it.
- K3 rebuy 'window' is modeled as the lifetime of the pendingDebitId state field rather than any timer — this works and is arguably cleaner, but the kill-shot's phrase 'after the rebuy window' presumes a window concept the contract intentionally lacks. Resolved by encoding the window as state, but a game author could naively reach for a deadline. Worth a doc note that economy windows are state predicates, not deadlines.
- Grant-existence leakage (R6 note) is real for poker: the mere presence of a FORCE_REVEAL or all-in system grant is seat:null so leaks to no one — fine. But standing CASH_OUT/REBUY grants are per-seat and harmless. No uniform-window helper is needed here; noting only that the contract's R6 'uniform-window helper' obligation is not exercised by this game, so it is untested by this gate.

## Required contract changes (designer)

- Clarify in 01-game-contract.md (C10 / SeatRef definition) that taking a vacated seat mints a FRESH opaque SeatRef per occupancy and refs are never recycled across occupants — OR specify the alternative and how projectEvent must then redact retired-occupant payloads. Without this sentence the K7 seat-reuse privacy guarantee is not provable from the contract text alone. Minimal change: add one normative sentence to the SeatRef brand doc-comment and a line in the R6/C9 projection section.
- Add an explicit example to R2/R3 documenting the 'watchdog' grant pattern: seat:null, allowedActions:[], deadline = a FUTURE timestamp, onExpiry = escalation action — distinct from the at-or-before-now immediate-fire case. K4 and K5 both rely on it; one illustrative paragraph removes the ambiguity that empty-actions implies immediate fire.

## Verifier — violations

- K7: the design assumes the framework mints a fresh opaque SeatRef per occupancy and never recycles a vacated seat's ref. The contract's SeatRef brand ('Opaque seat reference', 'the ONLY player identifier') does not grant this; the naming actively suggests a recyclable seat-position label. projectEvent's redaction predicate (viewer.seat===owner-ref) delivers privacy ONLY under the un-granted per-occupancy assumption.
- K1 (minor): pendingGrants returns START_HAND with 'deadline: ts+30000' but pendingGrants(state) cannot see the clock or any ts argument; the required state-stored eligibility anchor field is absent from the state sketch. Sound and clearly expressible (charter blesses time-derived values as state), but as drawn the sketch implies an unseen-clock read.
- K4 (minor): the closing watchdog deadline is given as both 'ts+60000' (step 2) and 'creditsResolvedAnchor+60000' (step 3); the fixed anchor field is not shown being written in the CLOSE_REQUESTED reducer. Stable-across-re-arm semantics are stated and expressible, but the anchor's provenance is not grounded in the sketch.

## Verifier — missed problems

- The state sketch omits the time anchors that K1 and K4 deadlines depend on (no betweenHands/eligibility anchor for START_HAND; no closeRequestedAt for the closing watchdog). Because pendingGrants has only (state) and no clock, every future deadline it emits must read an absolute timestamp already stored in state by a prior reducer. The contract permits this, but the design should add these fields to the sketch and show the reducers writing event.ts, to prove no unseen-clock dependency.
- K7's redaction predicate is stated two ways across the doc — 'viewer.seat === event-owner-ref' (per-occupancy ref) in the trace, while the contract's identifier is literally named SeatRef (seat-position-flavored). The design needs to either (a) add the normative per-occupancy-mint sentence, or (b) specify that retired-occupant DEAL payloads are redacted on re-projection — but C9 says past events are never re-projected, so option (b) requires its own mechanism. Neither is in the contract text.

## Verifier summary

Six of seven kill-shots are genuinely survived within the contract as written. K5 (session timer) is airtight: the deadline is the literal absolute state field sessionDeadlineMs (no creep, stable identity), and the !closeRequested predicate makes the grant absent after firing so R3.2 forbids re-fire — directly closing the round-1 MAXDUR-re-fire hole. K6 (deals/forced reveals) is cleanly closed by R1's materialize(state,actor,rng) signature: rng is the framework stream passed in, FORCE_REVEAL copies state.holeCards into a public payload, projection stays stateless — exactly the round-1 fatal gap, now expressible. K2 (R5 standing grants), K3 (nonGrantIntent wallet callbacks with state-lifetime windows, no timer), and K4 (empty-actions future-deadline watchdog, type-legal even if prose-undocumented) all stay strictly within their granted signatures and close their respective round-1 holes. K1 survives because START_HAND existence is a pure eligibleCount>=2 test and its window is an idle table (no events => no lastTs creep). The gate FAILS on K7 alone: the seat-reuse privacy guarantee depends on a fresh-opaque-SeatRef-per-occupancy power that the contract does not grant — the SeatRef brand and doc-comment lean toward a recyclable seat-position label, under which projectEvent would leak a prior occupant's hand to a new joiner. The design honestly flags this as 'the only true ambiguity,' but honest-about-a-gap is still a gap: K7 survives only after the claimed one-sentence normative change is actually written into 01-game-contract.md (SeatRef definition / R6-C9 projection section). Because the gate's bar is 'genuinely survived within the contract AS WRITTEN,' pass=false until that sentence lands. Two minor non-blocking issues: K1 and K4 deadlines reference time anchors not present in the state sketch (pendingGrants has no clock), which are clearly expressible but should be added to the sketch as written state fields to fully prove no unseen-clock read. Authoritative files: C:\\Webs\\Multiplayer\\docs\\spec\\01-game-contract.md (SeatRef line 20-21, R2 line 102-106, R3 line 134-146, R5 line 113-114), C:\\Webs\\Multiplayer\\docs\\phase0\\0-VERDICT.md (round-1 cash-rebuy failures), C:\\Webs\\Multiplayer\\docs\\phase0\\cash-rebuy.md (verifier findings)."
