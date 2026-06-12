# Phase 0 Gate: Riichi Mahjong hanchan — session/segment structure replay: dealer repeat (renchan) with honba carryover, riichi-stick pot carryover through a drawn hand, seat/wind rotation on dealer change, and explicit session close

**Designer verdict:** expressible-with-friction  
**Adversarial verification:** ISSUES FOUND (see verifier findings)

## Design

# Riichi Hanchan vs Charter v4.1 — Session Model Replay

## 1. State sketch (canonical JSON, integers only)

```json
{
  "phase": "hand_active",            // between_hands | hand_active | settling | ending | closed
  "handNo": 3,
  "round": {"wind": "E", "kyoku": 1},
  "dealerSeat": 0,                   // seat winds are DERIVED: wind(i) = WINDS[(i - dealerSeat + 4) % 4]
  "honba": 2,                        // carryover
  "riichiPot": 1000,                 // carryover, integer points
  "scores": [24000, 20000, 26000, 26000],
  "cfg": {"turnMs":15000, "claimMs":5000, "interHandMs":5000, "settleMs":3000,
          "endRound": {"wind":"S","kyoku":4}},
  "lastTs": 100400,                  // server ts of last admitted event (C7: deadlines computed from recorded timestamps in state)
  "turnTs": 99000,
  "hand": {                          // null between hands; fully rebuilt by start_hand
    "wall": ["..."], "wallCount": 69,
    "tiles": {"0":["...13..."], "1":[], "2":[], "3":[]},
    "discards": {"0":[], "1":[], "2":[], "3":[]},
    "turnSeat": 0, "drawn": "5p",
    "riichi": [false, true, false, false],
    "claim": null,                   // {tile, openSeats:[...]} while a ron window is open
    "result": null                   // {type:"tsumo"|"ron"|"exhaust", winner, payer}
  }
}
```

## 2. pendingGrants(state)

| condition | grants returned |
|---|---|
| `between_hands` | `[{seat: dealerSeat, actions:[start_hand], deadline: lastTs+interHandMs, onExpiry: start_hand, res: first-come}]` — dealer may start early; expiry auto-deals. Shuffle resolves at admission (C3); the recorded `start_hand` carries the wall. |
| `hand_active`, `drawn=null`, `claim=null` | `[{seat: turnSeat, actions:[draw], deadline: lastTs+1, onExpiry: draw, res: first-come}]` — pure auto-event via epsilon expiry; admitted `draw` carries the resolved tile (C3). |
| `hand_active`, `drawn≠null` | `[{seat: turnSeat, actions:[discard(tile∈tiles), riichi_discard(closed-tenpai ∧ score≥1000), tsumo(winning-hand)], deadline: turnTs+turnMs, onExpiry: default_discard, res: first-come}]` — `default_discard` is a deliberately arg-less shadow action; its reducer discards `state.hand.drawn` (tsumogiri on timeout). |
| `claim≠null` | for each `s ∈ claim.openSeats` (seats whose hidden tiles complete `claim.tile`): `{seat:s, actions:[ron, pass], deadline: lastTs+claimMs, onExpiry: pass, res: collect-all-then-resolve}`. No capable seat ⇒ window never opens; turn advances. |
| `settling` (`result≠null`) | `[{seat: dealerSeat, actions:[hand_end], deadline: lastTs+settleMs, onExpiry: hand_end, res: first-come}]` |
| `ending` | `[{seat: dealerSeat, actions:[close_session], deadline: lastTs+2000, onExpiry: close_session, res: first-come}]` |
| `closed` | `∅` — nothing armed; log complete. |

**Boundary events:**
- `hand_end {}` — EMPTY payload. Reducer derives everything from settled state: dealer won or exhaustive draw ⇒ `honba+1`, dealer stays (renchan); non-dealer win ⇒ `honba:=0`, `dealerSeat:=(dealerSeat+1)%4`, kyoku advances. Any win sweeps `riichiPot` to winner (`:=0`); exhaust leaves it untouched. If finished round == `cfg.endRound` and rotation is due ⇒ `phase:=ending`, else `between_hands`. `hand:=null`; `handNo+1`.
- `start_hand {wall:[136 ids consumed-order], deals:{seat→13 tiles}, doraIndicator}` — payload written at admission (C3). Reducer builds `hand.*`, `turnSeat:=dealerSeat`. `projectEvent`: viewer keeps `deals[viewer]` + dora; wall and others' deals → null. Deals are denormalized next to the wall because projection is stateless (C9): a viewer cannot re-derive their deal from a redacted wall.
- `close_session {reason}` — reducer sets `phase:=closed`, writes `finalStandings` into state.

## 3. Worked trace (mid-hand play compressed; ts in ms)

**Setting:** E1, dealer seat0, all 25000, honba 0, pot 0.

**Hand 1 — dealer tsumo → renchan (Trace A)**
- `e41 t=100000` INTENT seat0 `tsumo{reveal:[14 tiles]}` — turn grant active; "winning hand" constraint checked at admission vs canonical tiles → **ADMIT**. Reveal-as-event (C9): full payload visible to all. Reducer: `result={tsumo,0}`; each pays 4000 + 100×honba(0) ⇒ `[37000,21000,21000,21000]`; `phase=settling`. → grants: `hand_end`, deadline 103000.
- `e42 t=103000` EXPIRY `hand_end{}` → **ADMIT** (framework-recorded). Reducer: dealer won ⇒ `honba 0→1`; `dealerSeat` stays 0; derived winds unchanged; round still E1; `hand:=null`; `handNo 1→2`; `between_hands`. **Boundary payload is empty — all carryover is plain state persistence; C8 holds exactly.** → `start_hand` grant, deadline 108000.
- `e43 t=108000` EXPIRY `start_hand{wall,deals,dora}` → **ADMIT**; shuffle resolved at admission, reducer RNG-free. → draw grant seat0.

**Hand 2 (E1·1) — riichi stick → exhaustive draw (Trace B)**
- `e57 t=131000` INTENT seat1 `riichi_discard{tile:"9s"}` — constraints pass → **ADMIT**. Reducer: `riichi[1]=true`; `scores[1] 21000→20000`; `riichiPot 0→1000`. **The stick becomes ordinary session-level state at this instant; the boundary needs no special handling.** Public event, unredacted. No seat can ron 9s ⇒ no window; draw grant seat2.
- … play continues to `wallCount=0`; final discard `e88` admits with no claims ⇒ reducer sets `result={exhaust}` (tenpai payments skipped — rules-minimal), `settling`.
- `e89 t=412000` EXPIRY `hand_end{}` → **ADMIT**. Exhaust ⇒ renchan (simplified): `honba 1→2`; dealer stays; **`riichiPot` UNCHANGED at 1000 — the tested carryover, surviving purely as state**; per-hand `riichi` flags die with `hand:=null`, the stick does not. `handNo→3`.
- `e90` EXPIRY `start_hand` — new wall; pot still 1000.

**Hand 3 (E1·2, pot 1000) — non-dealer ron → rotation (Trace C)**
- `e131 t=560000` INTENT seat3 `discard{"6m"}` → **ADMIT**. Only seat1 can complete 6m ⇒ `claim={tile:"6m", openSeats:[1]}`. → grant `{seat:1, [ron,pass], deadline 565000, onExpiry:pass, collect-all-then-resolve}`.
- `e132 t=562400` INTENT seat1 `ron{reveal:[14]}` — within deadline; single-member arbitration group, trivially wins (losers would be logged per C7) → **ADMIT**. Reducer: seat3 pays 3900 + 300×honba(2)=600; winner +`riichiPot` 1000 ⇒ `pot:=0`; `settling`.
- `e133` EXPIRY `hand_end{}` → **ADMIT**. Non-dealer won ⇒ `honba 2→0`; `dealerSeat 0→1`; **rotation is one integer change — seat winds flip automatically because they are derived, never stored**; round E1→E2; `handNo→4`.

**Final hand (S4, dealer seat3) — session close (Trace D)**
- `eM` INTENT seat2 `tsumo` → **ADMIT**; settle; `settling`.
- `eM+1` EXPIRY `hand_end{}` → **ADMIT**. Non-dealer won ∧ round==`cfg.endRound` ⇒ no new hand: `phase:=ending`. → `close_session` grant.
- `eM+2` EXPIRY `close_session{reason:"S4_complete"}` → **ADMIT** — the explicit terminal boundary event. Reducer: `phase:=closed`, `finalStandings` in state. `pendingGrants ⇒ ∅`: nothing armed, session log complete.

## 4. Carryover vs reset

| survives boundary (session state) | reset by start_hand (`hand.*`) | derived, never stored |
|---|---|---|
| scores, honba, riichiPot, dealerSeat, round, handNo, cfg, lastTs | wall, tiles, discards, turnSeat, drawn, riichi flags, claim, result | seat winds, dealer/non-dealer payment roles |

## 5. Verdict

**Expressible-with-friction.** The session model itself passes cleanly: honba, riichi pot, and rotation are pure state carryover across empty boundary events; C3 admission-resolved shuffles slot perfectly into expiry-driven `start_hand`; reveal-as-event matches ron/tsumo natively. The friction is concentrated in C7's grant mechanics: arbitration grouping and deadline-disarm semantics are undefined (both blocking for the mandated claim-window helper), system-driven events require fake-seat epsilon-expiry grants, parameterized timeout defaults need shadow actions, and grants have no projection/observability story (timing side channel). Two precise contract changes required; the rest is livable ceremony.

## Friction points (designer)

- F1 (blocking, see required change 1) — Arbitration grouping undefined: 'resolution' is a per-grant field but arbitrates across grants ('how overlapping grant responses arbitrate'). Multi-ron (double/triple ron, head-bump) needs the three ron grants to form ONE collect-all-then-resolve group; the contract never says whether grants from the same pendingGrants evaluation, the same deadline, or the same action type form a group. The claim-window library helper the charter mandates is not well-defined without this.
- F2 (blocking, see required change 2) — Deadline lifecycle on re-evaluation unspecified: pendingGrants is re-evaluated after every admitted event, but 'appends exactly one expiry event per deadline' read literally means a deadline armed for a grant that no longer exists (e.g., the pass-deadline of a claim window already resolved by an admitted ron) still fires a stale expiry event that every reducer must defensively no-op. Disarm/re-arm semantics must be defined.
- F3 — No first-class system/seatless events: every game-driven transition (start_hand, hand_end, close_session, automatic draw) must be phrased as a grant to some seat (we used dealerSeat) with an onExpiry default, and pure auto-events need epsilon deadlines (lastTs+1). The contract is silent on whether a deadline at-or-before current server time fires immediately on arming. It works, but costs roughly four ceremony expiry events per hand plus a semantically meaningless seat on seatless actions.
- F4 — Parameterized expiry defaults: onExpiry is an action NAME only, but the natural timeout default in riichi (discard the drawn tile) needs an argument. Clean in-contract workaround: a dedicated arg-less shadow action 'default_discard' whose reducer reads state.hand.drawn — but every parameterized default in every game will need such a shadow action, and its admission constraints cannot be expressed the same way as the parameterized form's.
- F5 — Grant observability / timing side channel: pendingGrants reads full hidden state, so capability-filtered ron grants (only tenpai seats get the grant) leak 'someone is tenpai on that tile' through window existence and timing. The leak-free alternative — uniform claim windows granted to all three opponents — costs up to three pass-expiry events per discard (~200 noise events per hand). C9 projects events but says nothing about who may observe that a grant exists or that a deadline is armed; mitigation is currently entirely the game's problem.
- F6 — External-input admission path is asserted but not defined: C8 says wallet API responses 'enter the log as recorded events', but C7's only admission sources are grant responses and deadline expiries. After close_session the grant set is empty, so nothing can authorize admitting a payout confirmation. Not needed for this trace, but the session model points straight at the gap.
- F7 (minor, by-design cost) — Stateless projection (C9) forces denormalized start_hand payloads: the per-seat deals must be carried alongside the full 136-tile wall so each viewer's own deal survives projection, and the wall itself is recorded every hand yet redacted to null for every viewer — pure audit weight, roughly 136 tile ids per segment that no client ever sees.

## Required API changes (designer claim)

- Define arbitration grouping for grants: either specify that all grants emitted by a single pendingGrants evaluation that share the same resolution value and the same deadline form one arbitration group, or add an explicit optional groupId field to the grant shape; 'priority-order' and 'collect-all-then-resolve' are then evaluated per group, and 'losers recorded in the admission log' refers to losing responses within that group.
- Define deadline disarm/re-arm semantics: armed deadlines are derived state — after every admitted event the armed set is replaced by the deadlines of the newly returned grant set; a previously armed deadline absent from the new set is disarmed and emits no expiry event. The 'exactly one expiry event per deadline' guarantee applies only to deadlines still armed at the moment they elapse.

## Adversarial verifier findings

**Summary:** Not a rubber-stamp - this design is unusually honest. Its seven claimed frictions are real (F1 arbitration grouping and F2 deadline disarm are genuinely blocking for the mandated claim-window helper; the two proposed contract changes are correct and well-scoped), the session-model mandate is fully covered (empty hand_end boundary with honba/riichiPot/dealerSeat as pure state carryover, derived seat winds making rotation a one-integer change, explicit close_session), and the worked trace is arithmetically and sequentially coherent at every traced step (payments, honba math, deadline times, rotation E1->S4 all check out). It still fails strict soundness on two grounds. First, it silently assumes framework powers the contract does not grant: C3 randomness resolution is used as if the framework could construct mahjong-structured payloads (per-seat deals, dead-wall dora, next-wall-tile per draw consistent with the recorded wall), and admission is assumed to evaluate arbitrary game predicates (full win-checking, reveal-matches-hidden-state) under the bare word 'constraints' - both are framework-side game logic that should have been reported as friction/required changes alongside F1-F7, and the deals/draw construction gap is arguably more fundamental than anything in the friction list. Second, the trace glosses a real flow bug: claim-window deadlines are based on lastTs, which rebases after every admitted event, so multi-seat ron windows creep open indefinitely (the design anchors turn deadlines on turnTs precisely to avoid this but not claims); every window in the trace has exactly one open seat, so the bug never surfaces. Missed session-model edges: riichi-pot disposal when the final hand is a draw, multi-ron multi-admit semantics, abortive-draw expressibility, and off-schedule termination (tobi, unbounded S4 renchan). Verdict: expressible-with-friction is the right call and the two required changes should be adopted, but the friction list is incomplete - C3 needs a game-declared randomness-request API and C7 needs a defined constraint language, and the claim-deadline anchoring must be fixed in the design itself.

**Contract violations in the design:**
- start_hand payload construction is framework-side game logic: the design has the framework write deals:{seat->13 tiles} and doraIndicator into the admitted event at admission. C3 blesses 'the shuffled deck as consumed' and 'the drawn tile' as resolved outcomes, but provides no API for the game to declare STRUCTURED randomness (mahjong dealing order, 14-tile dead wall, dora flip). Splitting a shuffle into per-seat deals and picking a dora indicator is mahjong logic; only the framework exists at admission time, so the design silently grants it game knowledge. This should have been an F-item or required change; it is the same class of gap as F6 but unreported.
- Per-draw tile resolution contradicts the recorded wall: the full 136-tile wall is recorded in start_hand and held in state.hand.wall, yet each admitted draw 'carries the resolved tile (C3)'. For the draw payload to match the recorded wall, the framework must read game state (hand.wall/wallCount) to know the next tile - framework executing game logic; the alternative (fresh randomness per draw) contradicts the already-recorded wall. Neither path is in the contract. Note the tile MUST be in the recorded payload (stateless projectEvent cannot reveal an empty-payload draw to the drawer), so this cannot be pushed into the reducer. Unflagged.
- Admission-constraint expressivity assumed without flagging: grants declare predicates like tsumo(winning-hand), riichi_discard(closed-tenpai AND score>=1000), tile-in-hand, and the trace says the winning-hand constraint is 'checked at admission vs canonical tiles' - including verifying that a client-supplied reveal:[14 tiles] payload matches canonical hidden state. The contract's one word 'constraints' defines no constraint language; running arbitrary game predicates (a full mahjong win-checker) inside the framework's admission path is framework-side game logic by another name. The design even brushes against this gap in F4 ('admission constraints cannot be expressed the same way') but never flags the core assumption.

**Problems the design missed:**
- Claim-window deadline rebasing (real flow bug in this design): claim grants use deadline lastTs+claimMs, and lastTs advances on EVERY admitted event. With 2+ open ron seats, each admitted pass (intent or expiry) re-extends the remaining seats' windows - window creep; under the design's own proposed required-change-2 re-arm semantics this is guaranteed, since deadlines are recomputed after every event. The fix (anchor on a recorded window-open timestamp) is exactly what the design already does for turns via turnTs but forgot for claims. The trace never exercises this: every claim window in it has exactly one open seat.
- Riichi-pot disposal at session close: if the final hand ends in a draw, riichiPot>0 survives into phase=ending and close_session has no disposal rule (common rules: to last winner, to top placer, or forfeited). The very carryover mechanism under test has an unhandled terminal case; the design dodged it by ending the session on a tsumo that sweeps the pot.
- Multi-ron admission count: beyond F1's grouping complaint, the contract's 'records arbitration losers in the admission log' implies exactly one admitted winner per group. Double/triple ron where BOTH wins score (no head-bump rules) requires multiple admitted events from one collect-all group, plus an ordering rule for honba and riichi-pot allocation (atamahane). F1's proposed groupId fix does not resolve how many group members may be admitted.
- Abortive draws not expressible as traced: nine-terminals abort is a turn ACTION missing from the turn grant's action list; four-winds and four-riichi aborts are automatic state-triggered hand ends needing yet more epsilon-expiry ceremony grants. The mandate said 'abortive/drawn hand' and only the exhaustive draw was traced - the abortive variants are where the grant table gets ugliest.
- Off-schedule session termination: bankruptcy (tobi) ends a hanchan mid-round, and S4 dealer renchan can extend the session unboundedly; the design's only terminal condition is finished-round==cfg.endRound AND rotation due. Rules-minimal is a partial defense, but explicit session close was a mandated test target and only the happy-path close was exercised.
- Cosmetic but telling: the Section 1 state sketch violates zero-sum (scores 24000+20000+26000+26000=96000 plus riichiPot 1000 = 97000, not 100000) - impossible mahjong state in a document whose entire purpose is event-level precision. Also, the dealer's early start_hand intent must carry an empty payload that the framework then fills with resolved randomness; the contract never describes intents whose payload is framework-authored, and the design does not mention it.
