# Phase 0 Gate: Sealed-bid auction (Goofspiel-style), 3 players: each round a prize card is flipped (randomness at admission); all players simultaneously commit a hidden bid card from a public hand of 1..5 under a shared deadline; highest bid wins prize plus carryover; tied max voids the round and carries the prize over; a player who never submits defaults to their lowest card via onExpiry.

**Designer verdict:** expressible-with-friction  
**Adversarial verification:** sound

## Design

# Sealed-Bid Auction ("Goofspiel-3") vs Charter v4.1

## Game rules fixed for this gate
3 seats. Each seat's bid hand is the public set {1..5} (standard Goofspiel: hands are common knowledge; only the *current* bid is sealed). A prize deck {1..5}: one prize drawn uniformly per round, randomness resolved at admission (C3). Round: flip prize -> simultaneous sealed bids -> reveal -> highest bid takes prize plus any carryover; tie at the max voids the round and the prize carries over (chosen over "split" because C2 bans floats — splitting prize 5 two ways needs a rounding policy). Bid cards are spent regardless. Hand ends when hands are empty; segment boundary event closes it; scores carry over in state (C8 sessions).

## 1. State sketch (canonical JSON, integers only)

```json
{
  "phase": "awaiting_flip | bidding | awaiting_reveal | hand_over",
  "round": 1,
  "seats": ["P1","P2","P3"],
  "dealer": "P1",
  "hands": { "P1": [1,2,3,4,5], "P2": [1,2,3,4,5], "P3": [1,2,3,4,5] },
  "prizesRemaining": [1,2,3,4,5],
  "currentPrize": null,
  "carryover": 0,
  "flipTs": null,
  "lastEventTs": 0,
  "commits": { "P1": null, "P2": null, "P3": null },
  "scores": { "P1": 0, "P2": 0, "P3": 0 },
  "config": { "bidWindowMs": 30000 }
}
```

`flipTs`/`lastEventTs` are server-assigned ms written by reducers from the current event's timestamp (C8) — they are what makes `deadline` computable purely from state. Server-side `commits[p]` becomes `{"card":5,"defaulted":false}`; client-projected state holds `{"hidden":true}` until reveal.

## 2. pendingGrants(state)

| predicate | grants |
|---|---|
| `awaiting_flip` && prizes remain | one degenerate "system" grant: `{seat: dealer, allowedActions: [], deadline: lastEventTs, onExpiry: "flip_prize", resolution: "first-come"}`. Zero-window: already due when armed, fires immediately; the expiry event is admitted ordinarily, so C3 resolves the uniform draw and the event carries the drawn prize. |
| `bidding` | for each seat p with `commits[p]==null`: `{seat: p, allowedActions: [{type:"commit_bid", constraints: {card IN hands[p]}}], deadline: flipTs + config.bidWindowMs, onExpiry: "bid_timeout", resolution: "collect-all-then-resolve"}`. All seats share one absolute deadline; re-evaluation after each admitted commit returns the *same* deadline for remaining seats (must re-arm idempotently — F4). |
| `awaiting_reveal` (all commits set) | one system grant: `{seat: dealer, allowedActions: [], deadline: lastEventTs, onExpiry: "reveal_bids", resolution: "first-come"}`. The reveal payload must be synthesized from state at admission — **not expressible as written** (F2). |
| `hand_over` | `[]`; segment boundary event recorded, session continues. |

**projectEvent (stateless, C9):** `commit_bid` -> full event to its own seat; `{type,seat,round}` with card stripped to everyone else. `bid_timeout` -> pass-through (payload-free). `reveal_bids` -> pass-through: it carries all newly-visible bids (reveal-as-explicit-event). `flip_prize`, boundaries -> pass-through.

**Reducers (RNG-free, deterministic):** `flip_prize`: set currentPrize from the event's resolved outcome, remove from prizesRemaining, `flipTs := ev.ts`, phase=bidding. `commit_bid`: record commit; when all three set, phase=awaiting_reveal. `bid_timeout`: `commits[seat] := {card: min(hands[seat]), defaulted: true}`; same transition. `reveal_bids`: winners = argmax of bids; unique winner -> `scores[w] += currentPrize + carryover; carryover := 0`; tie -> `carryover += currentPrize`. Spend every seat's bid card from its hand; reset commits; round++; phase=awaiting_flip or hand_over.

This *is* the commit-reveal helper as a composition: collect-all-then-resolve grants + projectEvent redaction of commits + a deadline-triggered reveal event carrying the payloads. No new framework power used except where flagged.

## 3. Worked trace — round 1, 3 players, one rejection, one expiry

| # | ts(ms) | source -> intent | admission verdict | state delta | grants after |
|---|---|---|---|---|---|
| e10 | 100000 | boundary `hand_start` | admitted | phase=awaiting_flip, lastEventTs=100000 | flip system grant, deadline=100000 (already due) |
| e11 | 100020 | framework expiry -> `flip_prize` | admitted as ordinary event; C3 resolves draw at admission, event carries `{card:4}` | currentPrize=4, prizesRemaining=[1,2,3,5], flipTs=100020, phase=bidding | 3 bid grants (P1,P2,P3), deadline=130020, onExpiry=bid_timeout, collect-all-then-resolve |
| e12 | 104250 | P2 -> `commit_bid {card:5}` | admitted (grant open, 5 in hand). Projection: P2 sees card; P1/P3/spectators see `{commit_bid, P2, r1}` | commits.P2={5,false} | bid grants P1,P3 only; same deadline 130020 re-armed |
| — | 106100 | P3 -> `commit_bid {card:7}` | **REJECTED** at admission (7 not in hands.P3 — grant constraint). Logged in admission log; no admitted event, so pendingGrants is *not* re-evaluated | none | unchanged; P3's grant still open |
| e13 | 107800 | P3 retry -> `commit_bid {card:4}` | admitted | commits.P3={4,false} | bid grant P1 only, deadline 130020 |
| e14 | 130020 | P1 silent; deadline fires -> framework appends exactly one expiry event `bid_timeout {seat:P1}` | admitted as ordinary payload-free event | reducer derives commits.P1={card: min(1..5)=1, defaulted:true}; all set -> phase=awaiting_reveal | reveal system grant, deadline=130020 (due) |
| — | 130021 | hypothetical late P1 `commit_bid {card:3}` | arbitration **loser** — grant closed by expiry; recorded in admission log (expiry-wins rule is unstated, F5) | none | — |
| e15 | 130040 | framework expiry -> `reveal_bids` | admitted; payload **synthesized from state at admission**: `{P1:{card:1,defaulted:true}, P2:{card:5}, P3:{card:4}}` — requires API change 1 (F2) | max=5 unique -> scores.P2 += 4+0; hands: P1−{1}, P2−{5}, P3−{4}; commits reset; round=2; phase=awaiting_flip | next flip system grant |

**Client-replay check on the expiry:** clients apply projected e14 (pass-through, payload-free) against *public* hands and derive the same defaulted card 1, so projected state converges with server state. This works only because Goofspiel hands are public — with hidden hands it would diverge (F6).

**Tie variant (round 2):** prize 5 flipped; P1 commits 5, P3 commits 5, P2 commits 2. `reveal_bids` reducer: max 5 shared by {P1,P3} -> no payout, `carryover := 5`; round 3's winner takes its prize + 5. Integer-only carryover deliberately replaces "split" (F7).

## 4. Verdict: expressible-with-friction

The grant model, admission-time randomness, deadline-as-pure-function-of-recorded-timestamps, and stateless projection compose cleanly for sealed bids. Two things do not survive contact: (1) deadline-triggered events that must *carry* state-derived payloads — the reveal event, which C9's no-re-projection rule makes mandatory — have no expressible payload source, since onExpiry is a bare name (randomness gets admission-time enrichment via C3; determinism gets nothing); (2) every automatic step (flip, reveal) must be smuggled through degenerate grants (empty allowedActions, already-past deadline, dealer-as-proxy seat) that the contract neither permits nor forbids. Also, under the immediate-admission reading that this commit-reveal pattern requires, `collect-all-then-resolve` is behaviorally identical to N independent `first-come` grants — its "resolve" step appends nothing, so as specified it adds no expressive power. Each point and its minimal fix is itemized in the structured fields.

## Friction points (designer)

- F1 — No first-class trigger for automatic/system events: flip_prize and reveal_bids must be encoded as degenerate grants (allowedActions: [], deadline = lastEventTs i.e. already past, dealer seat as proxy). The contract neither permits nor forbids empty allowedActions, seatless actions, or arm-and-fire-immediately deadlines; the whole design rests on this unsanctioned pattern.
- F2 — onExpiry is a bare action name with no payload mechanism, but C9 requires reveal-as-explicit-event: past commit events are never re-projected and projection is stateless, so clients can only learn the bids if the reveal event itself carries them. A deadline-triggered reveal therefore needs admission-time synthesis of a state-derived payload — the deterministic analogue of C3's randomness resolution — which the contract does not provide. This is the load-bearing gap: without it the mandated commit-reveal composition cannot be completed.
- F3 — collect-all-then-resolve is underspecified: the contract does not say whether responses are admitted on arrival or buffered until group close, nor what (if anything) the 'resolve' step appends. Under the immediate-admission reading this design requires, it is observationally identical to N independent first-come single-response grants — the enum value adds no expressive power as written.
- F4 — Deadline lifecycle is implied but unstated: pendingGrants is re-evaluated after every admitted event and returns the same absolute deadline (flipTs + window) for still-open bid grants, so identical deadlines must re-arm idempotently, and a satisfied grant's deadline must be disarmed; 'exactly one expiry event per deadline' is ambiguous when the same deadline value is returned repeatedly across re-evaluations.
- F5 — Race at ts == deadline: the arbitration rule between a player response and the framework's own expiry append is unstated; the design assumes expiry wins at-or-after the deadline and the late response is recorded as an arbitration loser, but the contract never says so.
- F6 — Payload-free expiry actions whose effects are reducer-derived (bid_timeout -> lowest card) only round-trip through stateless projection when the derivation inputs are viewer-visible. It works here solely because Goofspiel hands are public; with hidden hands, client replay of the projected log would diverge from server state. The general fix is the same payload-synthesis hook as F2 (then projectEvent can redact the synthesized card like a normal commit).
- F7 — C2's no-floats rule makes 'ties split the prize' inexpressible without an explicit integer policy (floor + remainder); the design chose carryover-on-tie instead. Game-design consequence worth a contract note, not an API change.

## Required API changes (designer claim)

- Extend Grant.onExpiry from a bare action name to {action: name, payload?: pure fn(state) -> JSON}, evaluated at admission and recorded in the expiry event — the deterministic analogue of C3's admission-time randomness resolution. Load-bearing: without it a deadline-triggered reveal_bids event cannot carry the bids, and C9's reveal-as-explicit-event pattern cannot be composed for commit-reveal.
- Codify system grants: permit seat: null, allowedActions: [], and deadlines at-or-before the current admission timestamp (arm-and-fire immediately), so automatic steps (prize flip, reveal) are expressible without a proxy seat; alternatively add an equivalent pure autoEvent(state) -> event | null hook.
- Define collect-all-then-resolve precisely: responses are admitted on arrival (subject to projection); when the last grant of the group closes (satisfied or expired), the framework admits exactly one game-named group-resolution event whose payload is synthesized per change 1. This makes the reveal trigger native instead of the degenerate-grant workaround and gives the enum value real semantics.
- State the deadline lifecycle in the contract: a satisfied grant's deadline is disarmed; identical (seat, action, deadline) grants returned across pendingGrants re-evaluations re-arm idempotently and still yield exactly one expiry event; a response arriving at or after the deadline loses to the expiry event and is recorded in the admission log as an arbitration loser.

## Adversarial verifier findings

**Summary:** Sound, with reservations — this is an honest gate, not a rubber-stamp. The design flags its out-of-contract moves (degenerate system grants F1, the load-bearing onExpiry payload-synthesis gap F2, collect-all-then-resolve inertness F3, deadline lifecycle F4/F5, the F6 public-hands dependency, the C2 float constraint F7) rather than smuggling them, and the worked trace is arithmetically and causally correct given those flagged assumptions: deadlines compute purely from recorded timestamps, the rejection correctly does not re-trigger pendingGrants, exactly one expiry fires for the one open grant, and e15 is explicitly marked as the point where the contract breaks rather than glossed. The strongest unflagged finding is the mirror-image of F2: trace e11 silently assumes the framework can resolve state-parameterized randomness (uniform over prizesRemaining) when admitting its own expiry event — load-bearing, outside C3's stated surface, and missed by a design whose whole job was friction-hunting. Second hole: boundary events have no producer (hand_over returns [] yet claims an event gets recorded — the session stalls under the design's own model). Remaining gaps are edge cases the trace avoided (simultaneous multi-seat expiry under 'exactly one expiry per deadline', final-round tie evaporating the carryover, reveal reducer must consume the event payload not state). The four proposed API changes are well-targeted; a fifth (declared randomness domains as pure functions of state, applicable to expiry events) should be added, and the headline verdict should be 'requires API change' rather than 'expressible-with-friction' since the design itself proves change 1 is load-bearing for the mandated commit-reveal composition.

**Contract violations in the design:**
- Unflagged state-parameterized randomness at expiry admission (trace e11): the framework is assumed to resolve a uniform draw over prizesRemaining — a value of game state — when admitting a framework-generated flip_prize expiry event. C3 licenses events carrying resolved outcomes ('the drawn card/tile') but provides no mechanism for the game to declare a distribution as a pure function of state, and never says expiry events receive randomness enrichment. This is the exact mirror of the flagged F2 gap (the design even asserts 'randomness gets admission-time enrichment via C3' as if settled), it is load-bearing (the in-contract alternative — shuffle the prize deck at hand_start — requires redacting the shuffle payload to keep future prizes hidden, recreating F6's client-replay divergence), and it should have been an F8 / fifth required change.
- Minor admission-log extrapolations: the contract only specifies recording arbitration losers, but the design logs constraint rejections (P3's card-7 attempt) there too, and mislabels the hypothetical 130021 late commit an 'arbitration loser' when by that point the grant is simply closed (post-e14 re-evaluation removed it) — that is a plain inadmissible action, not an arbitration outcome; F5 only genuinely applies at ts == deadline before the expiry is appended.
- Minor unflagged assumption: the expiry event bid_timeout carries {seat: P1}, but the contract defines onExpiry as a bare action name — seat attribution from the expiring grant is assumed, and the bid_timeout reducer depends on it.

**Problems the design missed:**
- Boundary events have no producer and the design's own table is self-contradictory: trace e10 hand_start appears with no source mechanism, and the hand_over row returns pendingGrants = [] while claiming 'segment boundary event recorded' — with no grant armed, nothing in the contract can ever append that event and the session stalls. Boundaries are a third instance of F1 (system events) that the design failed to apply its own degenerate-grant workaround to, or to flag.
- Multiple simultaneous no-shows avoided: the trace has exactly one silent player. With 2+ seats silent, 2+ open grants share deadline 130020 and 'exactly one expiry event per deadline' becomes ambiguous in a way F4 does not cover (one event per grant or per deadline value? in what order? does the first expiry's admission re-evaluate pendingGrants before the second fires?). The mandated test case was traced only in its easiest form.
- Final-round tie sinks the carryover: if round 5 (the last round) ties, carryover accrues with no subsequent round to award it in — the prize value silently evaporates. No rule is given (award to no one? to high total? split — which reopens the F7 float problem?). The tie-handling mandate is only half-solved.
- Reveal reducer input source unstated: for client replay to converge, the reveal_bids reducer must read bids from the synthesized event payload, not from state.commits (which projected clients hold as {hidden:true}); the description 'winners = argmax of bids' is ambiguous, and reading from state would diverge on clients — same failure class as F6, one sentence to fix, not stated.
- The entire client-side state model is assumed, not contractual: C9 defines only projectEvent(event, viewer); the design presumes clients replay projected events through the same reducers, which must therefore tolerate redacted commit_bid events (no card) and write {hidden:true}. The contract never defines how per-viewer state is derived; the design uses this model load-bearingly (its F6 argument and the 'client-replay check' depend on it) without flagging the gap.
- Verdict-label tension: the headline 'expressible-with-friction' is generous given the design's own admission that required change 1 is load-bearing ('without it the mandated commit-reveal composition cannot be completed'). Substantively this gate result is 'requires API change' for the deadline-triggered reveal leg; the friction/required-change classification should match the body text, which says 'not expressible as written'.
