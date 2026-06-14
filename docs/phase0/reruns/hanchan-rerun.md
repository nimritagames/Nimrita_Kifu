# Phase 0 Gate RE-RUN: riichi-mahjong (hanchan session/flow structure)

**Run:** 2026-06-12, against `docs/spec/01-game-contract.md` v0.1 (R1–R7 incorporated).  
**Designer verdict:** expressible-with-friction  
**Adversarial verifier:** pass=false — kill-shots survived 5/6

## Kill-shot results

### ✅ K1 claim-window anchoring (no lastTs creep)

The claim grants' deadline = windowOpenTs + claimMs, where windowOpenTs is a frozen state field set by the discard reducer to the event ts (200000) and never rewritten during the window. pendingGrants is pure on state (contract line 67), so every re-eval recomputes 205000 identically. R3.1 identity = (seat, sorted action types, deadline) ⇒ the e82 re-eval at t=203000 yields the same key (seat2, sorted-types, 205000) ⇒ idempotent re-arm, no rebase (contract lines 136-138). Nothing in the trace reads lastTs; spec line 183-186 explicitly names this as the fix (R3.1 uses state-derived deadlines, not lastTs). The grep confirms 'lastTs' appears nowhere in the spec mechanism, only in the gate-obligation note. C8 (charter line 45) grants 'reducers may hold time-derived values as ordinary state' which is exactly windowOpenTs. No assumed power.

### ❌ K2 multi-ron via collect-all admitLimit

The entire allocation depends on a power the contract as written does NOT grant. Spec line 123 says the batch admits 'in grant order' but NOWHERE defines what establishes that order; R4 (VERDICT line 30) repeats 'in grant order' without pinning it. The design's atamahane (admitLimit:1 takes first member) and double-ron honba/riichiPot allocation (whole pot + honba to 'first in grant order') are correct ONLY if grant order == pendingGrants emission order. The contract does not promise emission-order preservation — 'grant order' could equally mean seat-sorted (R3.1 itself canonicalizes by sorting action types, signaling the framework's habit of canonical sorting) or arrival order, either of which breaks atamahane priority and pot allocation. The design ITSELF lists this as a claimed-REQUIRED change (the one-line normative clarification) and as friction F2. A required normative clarification is a contract change; under the contract AS WRITTEN, K2 is order-ambiguous and therefore not genuinely survived. This is the live violation.

### ✅ K3 riichi-pot disposal at close incl. final-draw

riichiPot is session-level state; the exhaustive-draw reducer leaves it untouched (carries to ending). Disposal runs in materialize[close_session](state,actor,rng) building {potDisposal: applyPot()} and the close reducer awards riichiPot to top-scorer (tie ⇒ nearest dealer), riichiPot:=0, phase:=closed. materialize reads only state (scores, riichiPot, dealerSeat, cfg.potDisposalToTopAtClose) — all in the state sketch — needs no rng/clock/identity, staying within its granted (state, actor, rng) surface. The close_session grant fires immediately via a state-stamped deadline (C8 time-as-state). Only gap is F4: the contract does not FORCE a redundant-recompute invariant at the close boundary specifically (C11 mandates it for settlement-touching reducers but the contract has no notion that close is settlement-touching) — a livable obligation gap, not an assumed power. Survives.

### ✅ K4 abortive draws (action + system-step kinds)

(a) nine_terminals is an ordinary turn action in the turn grant's allowedActions; its validator reads (state, intent) only (turn check, no-prior-calls flag, hand qualifies — all in state), materialize builds {}. (b) four_riichi: pendingGrants reads sum(riichi)=4 from state and emits a seatless system grant (R2, contract lines 104-106) with a deadline at-or-before now that fires immediately on arming (R3.4, contract line 141). The 'now' problem is solved within powers: pendingGrants is pure on state but C8 (charter line 45) lets the riichi_discard reducer stamp the current event ts (360000) into state; any state-held ts <= current admission ts satisfies R3.4. No fake seat, no lastTs+1 epsilon. Expiry event carries actual server ts (R3.5). All within granted powers.

### ✅ K5 deals/dora via materialize + per-viewer projection

materialize[start_hand](state,null,rng): freshDeck() is a pure constant, rng.shuffle is the framework-supplied deterministic stream (R1 explicitly blesses 'all structured randomness (deals, draws, shuffles)' in materialize; contract lines 69-73), slices wallSeq/tiles, picks doraIndicator from wallSeq — inputs are strictly (state, rng), no outside access. The round-1 hole (framework constructing deals) is genuinely closed: the deal lives in pure game code. materialize[draw] reads wallSeq[drawNext] from state, no fresh rng ⇒ consistent by construction. Projection statelessness HOLDS: projectEvent(event, viewer) receives no state; the FULL deal (all seats' tiles + wallSeq) is denormalized into the event payload, so projecting for seat s = keep payload.tiles[s], drop others+wallSeq — a pure (event, viewer) function (C9 stateless, line 78). Same for draw: tile is carried in the payload and redacted per-viewer. Minor nit (not a power violation): design uses integer seat indices while contract SeatRef is opaque; projection still only compares viewer's ref against an event-carried value. Survives.

### ✅ K6 tobi termination

The ron reducer drives scores[0] negative; the hand_end reducer detects min(scores)<0 and sets phase:=ending mid-rotation; close_session{reason:'tobi'} fires via a state-stamped immediate deadline. All predicates read/write only state — within reducer powers. The orthogonal voluntary-leave path uses the STANDING resign grant (R5, no deadline, contract lines 113-114), retired correctly per R5 'only when re-evaluation stops returning it' — i.e. when phase=closed and pendingGrants returns [] the resign grant is absent and disarmed; standing grants have no deadline so no expiry fires (R3.2). Unbounded renchan bounded by the same tobi predicate plus optional cfg.maxHonba in hand_end — a pure state predicate. No assumed power.

## Design (full)

## State sketch (canonical JSON, integers only)

Scores are tenths-of-thousand? No — plain integer points; sum is invariant-checked to 100000 + riichiPot.

```json
{
  "phase": "between_hands",
  "handNo": 3,
  "round": {"wind": 0, "kyoku": 1},
  "dealerSeat": 0,
  "honba": 2,
  "riichiPot": 1000,
  "scores": [24000, 25000, 25000, 25000],
  "cfg": {"turnMs":15000,"claimMs":5000,"interHandMs":5000,"settleMs":3000,
          "endRound":{"wind":1,"kyoku":4},"startScore":25000,"potDisposalToTopAtClose":1},
  "hand": {
    "wallSeq": ["..136 tile codes, deal+draw consumption order.."],
    "drawNext": 14,
    "live": 69,
    "tiles": {"0":["..13.."],"1":["..13.."],"2":["..13.."],"3":["..13.."]},
    "discards": {"0":[],"1":[],"2":[],"3":[]},
    "doraIndicators": ["1m"],
    "turnSeat": 0,
    "drawn": null,
    "riichi": [0,1,0,0],
    "claim": null,
    "windowOpenTs": 0,
    "abort": 0,
    "result": null
  }
}
```
- Wind 0=E,1=S,2=W,3=N. Seat winds DERIVED: `wind(i)=(i - dealerSeat + 4)%4`. Rotation is one integer write to `dealerSeat`.
- `hand` is `null` between hands; rebuilt entirely by `start_hand`.
- `claim` while a ron window is open: `{"tile":"6m","members":["1","2"]}` (opaque seat refs).
- `windowOpenTs` = the recorded server ts of the discard that opened the current claim window. **This is the K1 anchor.**

## pendingGrants per phase

| phase / sub-state | grants |
|---|---|
| `between_hands` | one SYSTEM grant `{seat:null, allowedActions:[{start_hand}], deadline: stateOpenTs+interHandMs, onExpiry:{start_hand}}`. Standing-early variant: also a per-seat `{seat:dealerSeat,[start_hand_now]}` if "dealer may deal early" desired; minimal trace uses only the system grant. |
| `hand_active, drawn=null, claim=null` | SYSTEM grant `{seat:null, allowedActions:[{draw}], deadline: <ts-now>, onExpiry:{draw}}` — deadline at-or-before now ⇒ fires immediately on arming (R3.4). Auto-draw with no fake seat. |
| `hand_active, drawn≠null` | `{seat:turnSeat, allowedActions:[{discard,constraints:{from:"hand+drawn"}},{riichi_discard},{tsumo},{kan_closed},{nine_terminals}], deadline: turnTs+turnMs, onExpiry:{discard}}`. `turnTs` recorded when the draw admitted — stable. |
| `hand_active, claim≠null` | for each `s∈claim.members`: `{seat:s, allowedActions:[{ron},{pon},{kan_open},{pass}], deadline: windowOpenTs+claimMs, onExpiry:{pass}, resolution:{collect-all, groupId:"claim@"+windowOpenTs, admitLimit: cfg.headBump?1:3}}`. **Deadline derives from `windowOpenTs`, a frozen state field — not lastTs (K1).** |
| four-riichi detected (`sum(riichi)=4` and all closed-tenpai) | SYSTEM grant `{seat:null, allowedActions:[{abort_four_riichi}], deadline:<now>, onExpiry:{abort_four_riichi}}` (K4). |
| `settling (result≠null)` | SYSTEM grant `{seat:null,[{hand_end}], deadline:settleTs+settleMs, onExpiry:{hand_end}}`. |
| `ending` | SYSTEM grant `{seat:null,[{close_session}], deadline:<now>, onExpiry:{close_session}}`. |
| `closed` | `[]`. |
| any phase, any seated player | STANDING grant `{seat:s, allowedActions:[{resign}]}` (no deadline; R5). Drives tobi/leave. |

`segmentOpenTypes:[start_hand]`, `segmentCloseTypes:[hand_end]` — each hand is a segment (snapshot + per-segment KDF seed for the shuffle).

## validators / materialize per phase
- `discard`/`riichi_discard`: validator checks tile∈tiles[seat]∪drawn, riichi extra: closed hand ∧ tenpai ∧ score≥1000 ∧ live≥4. Validators are law (R7); grant `constraints` are client hints only.
- `tsumo`/`ron`: validator runs the win-checker against canonical hidden `tiles[seat]` (+drawn for tsumo, +claim.tile for ron). **Reveal is NOT client-supplied** — the validator reads server-held hidden tiles; the admitted event's public reveal payload is built by `materialize[ron/tsumo]` (R1) so no client can lie. This is the round-1 "client-supplied reveal:[14]" hole, now closed.
- `start_hand`/`draw`: validators trivially ok (system). `materialize[start_hand](state,null,rng)` = `rng.shuffle(freshDeck())` → slice into `wallSeq`, deal first 13×4, set `drawNext=53`(after 52 dealt) wait — deal is 13×4=52, dead wall 14, dora flip; payload = `{wallSeq, tiles:{0..3}, doraIndicators:[wallSeq[dead-wall idx]], drawNext}`. **All mahjong structure lives in materialize, which IS game code (pure) — the framework only supplies `rng` (K5).** `materialize[draw](state,null,rng)` = `{tile: state.hand.wallSeq[state.hand.drawNext], seat: state.hand.turnSeat}` — reads the already-recorded wall, no fresh randomness; consistent by construction (K5 per-draw consistency).
- `default discard`/`pass`/`hand_end`/`close_session`/`abort_four_riichi`: `materialize` builds the parameter-free payload (e.g. `materialize[discard]` on expiry = tsumogiri `{tile: state.hand.drawn}`). R1 makes onExpiry parameterized — no shadow action needed (kills round-1 F4).

---

## WORKED TRACES

### K1 — Claim-window anchoring (deadline stability)
Setting: seat3 discards 6m; seats 1 AND 2 can ron it. claimMs=5000.
- `e80 t=200000` INTENT seat3 `discard{6m}` → validator ok → **ADMIT**. Reducer: append to discards[3]; compute capable seats {1,2}; set `claim={tile:6m,members:[1,2]}`, **`windowOpenTs:=200000`** (the event ts), `drawn:=null`.
- pendingGrants re-eval → two grants, both `deadline = windowOpenTs+claimMs = 205000`, groupId `claim@200000`, admitLimit per variant. Armed set = {G1(seat1,[ron,pon,kan,pass],205000), G2(seat2,...,205000)}.
- `e81 t=201200` INTENT seat1 `pass` → buffered (collect-all, R4), satisfies+disarms G1 outside the log; NOT yet admitted. Re-eval defers (R4). **Critical:** even though an event was processed, G2's deadline is still computed from `windowOpenTs=200000` ⇒ **205000, unchanged**. Under round-1's `lastTs+claimMs` it would creep to 201200+5000=206200. Fixed.
- `e82 t=203000` framework re-evals (no admission yet) — G2 identity = (seat2, [kan,pass,pon,ron], 205000). **Identical key ⇒ R3.1 idempotent re-arm; no duplicate grant, no rebase.**
- `e83 t=205000` G2 unsatisfied at deadline ⇒ batch closes. Buffered responses admit as one contiguous batch in grant order (R4): `pass(seat1)`, then expiry-default `pass(seat2)`. Both reducers no-op the claim; reducer then clears `claim:=null`, advances turnSeat. No stale-expiry problem: G1 was satisfied-and-disarmed, fires no separate expiry (R3.2).

### K2 — Multi-ron (double ron, admitLimit 2)
Same window, no head-bump (`admitLimit:3`).
- `e81 t=201200` INTENT seat1 `ron` → validator win-check vs tiles[1]+6m → ok → buffered, satisfies G1.
- `e82 t=204900` INTENT seat2 `ron` → ok → buffered, satisfies G2. Both group members now satisfied ⇒ batch closes early.
- Batch admits contiguously in **grant order** (seat1 before seat2 — deal order from dealer): `materialize[ron]` builds each public reveal from server hidden tiles. Reducer for first ron: seat3 pays seat1 (han/fu + 300×honba); **honba bonus + the whole `riichiPot` go to the head-bump-nearest winner = first in turn order from discarder** — here both score, riichiPot to the seat closest to seat3's right (seat... per rule, the first admitted). Second ron: seat3 pays seat2 base only (pot already swept, honba already taken). `result` accumulates both winners. `phase:=settling`.
- **Atamahane (single-winner variant):** `admitLimit:1` + `resolution` effectively priority — with admitLimit 1 the batch admits only the first-in-grant-order satisfied member; later satisfied responses are recorded as arbitration losers in the admission log and discarded. Grant order = seat order from discarder's right = natural atamahane priority. So atamahane = `{collect-all, admitLimit:1}` and grant emission ordered by claim priority.

### K3 — Riichi-pot disposal at session close (final hand = exhaustive draw, pot>0)
Final hand S4, riichiPot=2000, ends in exhaustive draw.
- `eN t=900000` last discard, `live→0`, no claims ⇒ reducer `result:{exhaust}`, tenpai payments applied (rules-minimal: skipped), `phase:=settling`.
- `eN+1 t=903000` SYSTEM EXPIRY `hand_end` → **ADMIT**. Reducer: exhaust ⇒ normally renchan, BUT finished round==`cfg.endRound` AND (rules-minimal) no extension ⇒ `phase:=ending`. **riichiPot UNCHANGED at 2000 — survives into `ending` exactly as in round-1, but now disposal is defined:**
- `eN+2 t=903000` SYSTEM EXPIRY `close_session` → **ADMIT**. `materialize[close_session]` builds `{reason:"endRound_draw", potDisposal: applyPot()}`. Reducer disposal rule (declared in cfg): `potDisposalToTopAtClose=1` ⇒ award `riichiPot` to current top-scorer (ties → seat nearest dealer), `riichiPot:=0`; write `finalStandings`; `phase:=closed`. Disposal is part of the close reducer, deterministic, recorded. (Variants: forfeit ⇒ pot just zeroed; to-last-winner ⇒ stored `lastWinnerSeat`.) `pendingGrants ⇒ []`.

### K4 — Abortive draws
**(a) nine-terminals — turn ACTION.** seat2 on first uninterrupted go-around, hand has ≥9 distinct terminals/honors.
- `e30 t=300000` INTENT seat2 `nine_terminals` (in the turn grant's allowedActions). Validator: it's seat2's turn, no prior calls this round, hand qualifies → **ADMIT**. `materialize[nine_terminals]` = `{}`. Reducer: `result:{abort:"nine_terminals"}`, `phase:=settling`.
- `e31` SYSTEM `hand_end`: abort ⇒ renchan, `honba+1`, dealer stays, riichiPot untouched (carries). Clean — abort is just another turn action and another empty boundary.

**(b) four-riichi — state-triggered SYSTEM step.**
- `e60 t=360000` INTENT seat0 `riichi_discard{tile}` → **ADMIT** (4th riichi). Reducer: `riichi[0]=1`, `scores[0]-=1000`, `riichiPot+=1000`, no ron capable ⇒ `claim=null`.
- pendingGrants re-eval sees `sum(riichi)=4` ⇒ emits SYSTEM grant `{seat:null,[abort_four_riichi], deadline:<now>, onExpiry:{abort_four_riichi}}` → fires immediately on arming (R3.4).
- `e61 t=360000` SYSTEM EXPIRY `abort_four_riichi` → **ADMIT**. Reducer: `result:{abort:"four_riichi"}`, `phase:=settling`. No fake seat, no epsilon `lastTs+1` hack — R2 system grant with at-or-before-now deadline.

### K5 — Structured randomness at hand start
- `between_hands`, `e43 t=108000` SYSTEM EXPIRY `start_hand`. Framework draws `rng` from the segment seed (per-segment KDF, D-4) and calls `materialize[start_hand](state,null,rng)`:
  `deck=freshDeck()` (136 ordered tile codes, pure); `wallSeq=rng.shuffle(deck)`; deal: `tiles[i]=wallSeq[i*13 .. i*13+12]` for i in 0..3; live wall pointer `drawNext=52`; dead wall = `wallSeq[122..135]`; `doraIndicators=[wallSeq[130]]`. Payload = `{wallSeq, tiles, doraIndicators, drawNext:52, turnSeat:dealerSeat}`. **All mahjong structure is in this pure game function; framework supplied only `rng`. Round-1's contract-violation (framework constructing deals) is gone — it's game code now (R1).**
- Reducer copies payload into `hand.*`, RNG-free.
- `projectEvent(start_hand, viewer)`:
  - viewer=seat s ⇒ return event with payload `{tiles:{s: tiles[s]}, doraIndicators, drawNext}`; **wallSeq→omitted, other seats' tiles→omitted.** Deals denormalized so each viewer keeps their own 13 (stateless projection, C9).
  - viewer=observer ⇒ `{doraIndicators}` only.
- **Per-draw (K5 consistency):** `e44 t=108001` SYSTEM `draw` (immediate-fire). `materialize[draw]` = `{seat:turnSeat, tile: wallSeq[drawNext]}` — reads recorded wall, no fresh randomness ⇒ guaranteed consistent with the recorded `start_hand`. Reducer: append tile to `tiles[turnSeat]`, `drawn:=tile`, `drawNext+=1`, `live-=1`. `projectEvent(draw, viewer)`: drawer sees `{tile}`; everyone else sees `{seat}` only (tile omitted). Stateless projection works because the tile IS in the recorded payload (not empty), redacted per-viewer. Round-1's "framework reads game state to pick next tile" hole is closed: the read happens inside `materialize`, which is game code.

### K6 — Off-schedule termination (tobi)
seat3 ron forces seat0 below 0.
- `e131 t=560000` INTENT seat1 `ron` → ADMIT (as K2). Reducer applies payment: `scores[0]: 1000 → -2700` (negative). `phase:=settling`.
- `eN+1` SYSTEM `hand_end` → ADMIT. Reducer detects `min(scores)<0` (tobi) ⇒ overrides normal rotation/endRound logic: `phase:=ending` immediately, mid-rotation (round still E-something). riichiPot disposed at close per K3 rule.
- `eN+2` SYSTEM `close_session{reason:"tobi", bankruptSeat:0}` → ADMIT. `phase:=closed`, finalStandings recorded. `pendingGrants⇒[]`. **Off-schedule close is just an alternate predicate (`min(scores)<0`) in the same `hand_end`→`ending`→`close_session` path; the STANDING `resign` grant (R5) covers the orthogonal voluntary-leave termination.** Unbounded S4 renchan is bounded by the same tobi check + an optional `cfg.maxHonba` predicate in `hand_end`.

---

## Session-model mandate (compact)
- **Honba/renchan carryover:** `hand_end` empty-payload boundary; dealer-win or exhaust ⇒ `honba+1`, `dealerSeat` unchanged; non-dealer win ⇒ `honba:=0`, `dealerSeat:=(dealerSeat+1)%4`, kyoku advances. Pure state carryover across the segment boundary.
- **Riichi-stick carryover through a drawn hand:** `riichiPot` is session-level state; per-hand `riichi[]` flags die with `hand:=null`; exhaust leaves `riichiPot` untouched ⇒ survives to next hand. Disposed only at close (K3).
- **Seat-wind rotation:** derived `wind(i)=(i-dealerSeat+4)%4`; never stored ⇒ rotation = one integer write.
- **Explicit close:** `session.termination = explicit-close`; `close_session` is the terminal recorded event; `pendingGrants⇒[]` proves the log is complete.

All boundary events carry framework/materialize-authored payloads (empty for hand_end, disposal-bearing for close_session) — R1 makes intents-with-framework-authored-payloads first-class, closing round-1's last cosmetic gap.

## Friction points

- F1 (livable) — Grant identity vs constraints staleness: R3.1 identity = (seat, sorted action types, deadline). The claim grant's allowedActions are stable but if capable-seat SET changes mid-window (it cannot in standard rules, but a kan-after-riichi-style mechanic could add a claimant), the new grant has a different identity and would NOT idempotently re-arm — it would be a fresh grant with a deadline still anchored on windowOpenTs. This is correct here but the contract gives no way to ADD a member to an existing collect-all group after arming; a late-eligible claimant either joins a new group (wrong batch) or is dropped. Not exercised by standard riichi; flagged as a latent edge for games with dynamic claimant sets.
- F2 (livable) — admitLimit + grant-order coupling is implicit: K2 multi-ron correctness depends entirely on the framework admitting collect-all batch members in 'grant order' (spec line 124) matching mahjong's atamahane priority (counterclockwise from discarder). The game controls this only by the ORDER it returns grants from pendingGrants. The contract says batch admits in 'grant order' but does not explicitly promise that order == pendingGrants return order (it could mean groupId-internal or seat-sorted order). If the framework sorts members canonically (e.g. by seat ref) instead of preserving emission order, atamahane and double-ron honba/pot allocation break. Needs a one-line normative confirmation that batch order == pendingGrants emission order.
- F3 (livable) — Immediate-fire system grants create a re-evaluation burst: auto-draw, four-riichi abort, hand_end, close_session are all deadline-at-or-before-now system grants (R2/R3.4). A single hand emits ~4-5 such immediate-fire system events plus per-draw system grants (~18 draws/hand). pendingGrants is re-evaluated after each. Correct and ceremony-light vs round-1's epsilon hack, but the per-draw system grant means every draw is a full grant-arm/fire/re-eval cycle — heavier than a turn-based engine. Acceptable at turn-based event rates (D-2 note) but worth noting the system-grant count per hand is high.
- F4 (cosmetic) — Pot-disposal rule is cfg-encoded, not contract-visible: K3 works because disposal is just deterministic reducer logic inside close_session keyed on a cfg flag. Fine, but the contract has no notion that close is settlement-touching; the redundant-recompute invariant (mandated for settlement-touching games) must cover the disposal arithmetic, which the contract does not force at the close boundary specifically — relies on the game remembering to include it.
- F5 (cosmetic) — Stateless projection still forces denormalized start_hand: per-seat deals carried alongside (redacted) wallSeq so each viewer survives projection; ~136 tile codes recorded per segment that no client receives. By-design audit weight (round-1 F7), unchanged but no longer a correctness issue — just bytes.

## Required contract changes (designer)

- Normative clarification (one line) on collect-all batch admission order: state explicitly that buffered responses + expiry-defaults admit in the ORDER the grants were returned by pendingGrants (emission order), not seat-sorted or arrival order. K2 double-ron atamahane priority and honba/riichi-pot allocation are correct ONLY under emission-order; spec line 124 says 'grant order' but does not pin what defines that order. Without this the multi-ron kill-shot is order-ambiguous.

## Verifier — violations

- K2: The design assumes the framework preserves pendingGrants EMISSION ORDER when admitting a collect-all batch. The contract (spec line 123 / R4) only says 'grant order' and never defines it. Atamahane single-winner selection (admitLimit:1 = first member) and double-ron honba/riichiPot allocation ('whole pot to first in grant order') are correct only under emission-order; a canonical seat-sort (which R3.1 already uses for identity) would break both. The design itself classifies this as a REQUIRED normative change, confirming the power is not in the contract as written.

## Verifier — missed problems

- F2/K2 ordering ambiguity is not merely 'livable friction' as the design files it under both F2(livable) AND the claimed-required-change list — it is a genuine correctness dependency for K2 and cannot be both 'livable' and 'required'. The honest classification is: K2 fails as-written and requires the one-line clarification before it passes.
- F4: The contract has no mechanism forcing the redundant-recompute invariant (C11, mandatory for settlement-touching reducers) to cover close_session pot-disposal arithmetic, because the contract does not classify close as settlement-touching. K3 is arithmetically correct but its mandated safety net is unenforced at the close boundary — relies on the game remembering. Real obligation gap, though not an assumed power.
- Representation mismatch: the state sketch uses integer seat indices ('0'..'3') as keys in tiles/discards/scores and seat fields, while the contract's SeatRef is an opaque branded string and projection/grant delivery key on opaque player refs (R7, to prevent seat-reuse hidden-info leaks found by cash-rebuy). The mahjong design's integer-seat model would need a mapping layer; not exercised by these kill-shots but a latent fidelity gap against R7's opaque-ref-keyed projection requirement.
- F1 (design-acknowledged): no contract mechanism to ADD a member to an existing collect-all group after arming — a late-eligible claimant (kan-after-riichi-style dynamic claimant set) either joins a wrong batch or is dropped. Not exercised by standard riichi but a real latent edge.

## Verifier summary

Five of six kill-shots are genuinely survived within the contract as written. K1 (claim-window anchoring) is clean: the deadline derives from the frozen windowOpenTs state field via pure pendingGrants, with R3.1 idempotent re-arm preventing creep — no lastTs anywhere. K3, K4, K5, K6 all stay strictly within granted powers: materialize reads only (state, actor, rng) and R1 explicitly blesses deals/draws/shuffles there (closing round-1's framework-constructs-deals hole); validators read only (state, intent) with the win-checker reading server-held hidden tiles (closing round-1's client-supplied-reveal hole); projection is genuinely stateless because the full deal/draw is denormalized into the event payload and redacted per-viewer (event, viewer) with no state read; immediate-fire system grants get their 'now' deadline from reducer-stamped event timestamps held as ordinary state (C8), not from any clock access inside pendingGrants; standing resign grants retire correctly under R5. K2 (multi-ron) is the failure: its atamahane priority and honba/riichiPot allocation depend on the framework preserving pendingGrants EMISSION ORDER in the collect-all batch, but the contract only says 'grant order' (spec line 123) and never defines it — the design itself lists pinning emission-order as a REQUIRED normative change, which means K2 is order-ambiguous as written and not yet genuinely survived. Because at least one kill-shot depends on an ungranted power, the gate does not pass as-is; it passes only once the one-line emission-order clarification is ratified into the contract."
