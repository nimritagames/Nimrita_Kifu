# Phase 0 Gate: Simultaneous Draft (7 Wonders style): 3 players, hidden 3-card hands, simultaneous timed picks resolving together via collect-all grants, hands pass left after each resolution, repeat until hands are empty.

**Designer verdict:** expressible-with-friction  
**Adversarial verification:** sound

## Design

# Simultaneous Draft vs. Charter v4.1

## 1. State sketch (canonical server-full state; clients hold partial state folded from projected events)

```json
{
  "phase": "picking",
  "round": 1,
  "seats": ["P0", "P1", "P2"],
  "hands":   { "P0": ["c1","c2","c3"], "P1": ["c4","c5","c6"], "P2": ["c7","c8","c9"] },
  "tableau": { "P0": [], "P1": [], "P2": [] },
  "pickedThisRound": { "P0": false, "P1": false, "P2": false },
  "roundStartTs": 1000,
  "lastResolveTs": 0,
  "pickWindowMs": 30000,
  "handSize": 3
}
```

All integers (C2). `receivesFrom(i) = seats[(i+1) % 3]` ("pass left"). `pickedThisRound` exists so the reducer can detect "all picks of this round admitted" while a resolution batch is being applied. Hidden info lives in canonical state freely; secrecy is enforced only at event projection (C9).

## 2. pendingGrants behavior

| phase | grants returned |
|---|---|
| `picking` | one per seat `s` with `!pickedThisRound[s]`: `{seat: s, allowedActions: [pick(index in 0..len(hands[s])-1)], deadline: roundStartTs + pickWindowMs, onExpiry: "autoPick", resolution: "collect-all-then-resolve"}`. All three must form ONE collect-all group — assumed semantics: all collect-all grants from a single pendingGrants evaluation are one group (friction F2). |
| `passing` | `[{seat: seats[0], allowedActions: [], deadline: lastResolveTs (already due), onExpiry: "passHands", resolution: "first-come"}]` — the "zero-delay system step" idiom: arm a deadline that is already past so the framework immediately appends the system event (friction F7). |
| `scoring`/`done` | `[]`; segmentEnd uses the same zero-delay idiom; tableau/score carryover stays in state across segments per C8. |

**autoPick is uniformly random from the seat's hand — random on purpose.** C3 resolves randomness at admission and the expiry event then *carries the resolved card*, so everyone sees what was auto-picked. A deterministic "lowest index" default would yield an expiry event with no payload and no contract mechanism to attach one (friction F5/F6).

**passHands must carry the rotated hands as payload.** C9: reveals are explicit events carrying the newly-visible payloads; past events are never re-projected; projection is stateless. The receiver never saw any event containing those cards (the deal was projected away), so the new hand can ONLY arrive as a passHands payload. But passHands is a framework-appended expiry event, and the contract gives no way for the game to attach a computed payload to it. This is the one required API change (#5 below).

**Assumed collect-all semantics (must be pinned before freeze):** responses are buffered outside the log (unadmitted, unprojected) until the group resolves (every member grant has a buffered response or its expiry event), then admitted as a contiguous batch under their originating grants, in grant order, with pendingGrants re-evaluation deferred to the end of the batch. The rival "admit each response immediately, redacted" reading breaks the game: since past events are never re-projected, an early redacted pick could never become public without a second explicit reveal event per pick.

## 3. Who learns what (projectEvent)

| event | self | others | spectator |
|---|---|---|---|
| deal (C3: shuffle resolved at admission, payload = all hands) | own hand only | counts only | counts |
| pick (admitted at batch resolution) | full | full — picks are public the instant they enter the log | full |
| autoPick expiry (C3 outcome = the card) | full | full | full |
| passHands (payload = `{received: {seat: hand}}`) | own received hand + counts | redacted | counts |

Buffered responses are not in the log, so there is nothing to project: opponents cannot infer pick timing or content during collection (good), but there is also no "P0 has locked in" indicator (friction F8).

## 4. Worked trace — two consecutive rounds, 3 players

**Round 1 — instant pick vs. timeout:**

| t | intent | admission verdict | resulting grants / deadlines |
|---|---|---|---|
| 1000 | E1 `deal` (shuffle resolved: H0=[c1,c2,c3], H1=[c4,c5,c6], H2=[c7,c8,c9]) | admitted | G1: 3 pick grants, one collect-all group, deadline 31000 armed x3 |
| 3000 | P0 `pick(c2)` | buffered — satisfies grant(P0), its deadline disarms; NOT in log, not projected | no re-eval (nothing was admitted) |
| 4000 | P0 `pick(c3)` again | rejected — grant already satisfied; recorded in admission log as loser/rejected | — |
| 7000 | P2 `pick(c9)` | buffered; 2/3 | — |
| 31000 | P1 deadline fires | framework appends exactly one expiry for the single unsatisfied grant: `autoPick(P1)`, C3 resolves -> c5; group complete -> batch resolution | — |
| 31000 | E2 `pick(P0,c2)`, E3 `autoPick(P1,c5)`, E4 `pick(P2,c9)` batch-admitted in grant order, all public | admitted x3 | re-eval deferred to after E4 (required semantics #3). Reducer: tableau filled; hands=[c1,c3]/[c4,c6]/[c7,c8]; all picked -> phase=passing, lastResolveTs=31000. pendingGrants -> G2: zero-delay passHands grant, deadline 31000 |
| 31000 | G2 fires -> E5 `passHands` expiry, admission-computed payload `received={P0:[c4,c6], P1:[c7,c8], P2:[c1,c3]}` (needs API change #5) | admitted | projection: each seat sees only its own received hand. Reducer: rotate; round=2; roundStartTs=ts(E5)=31000; phase=picking; pickedThisRound reset. pendingGrants -> G3: 3 pick grants, deadline 61000 |

**Round 2 — all pick in time, one invalid attempt:**

| t | intent | admission verdict | result |
|---|---|---|---|
| 33000 | P1 `pick(c7)` | buffered 1/3 | — |
| 34000 | P2 `pick(c9)` | REJECTED — c9 not in P2's current hand (grant constraint); grant(P2) stays unsatisfied, deadline stays armed; rejection logged | — |
| 35000 | P2 `pick(c1)` | buffered 2/3 | — |
| 36000 | P0 `pick(c6)` | buffered -> group complete BEFORE deadline -> immediate resolution | E6 `pick(P0,c6)`, E7 `pick(P1,c7)`, E8 `pick(P2,c1)` batch-admitted at t=36000, public; remaining deadlines disarmed; phase=passing |
| 36000 | zero-delay grant fires -> E9 `passHands`, payload `received={P0:[c8], P1:[c3], P2:[c4]}` | admitted | round=3, G5 pick grants, deadline 66000. After round 3's picks the hands are empty -> reducer sets phase=scoring; segmentEnd via the same zero-delay idiom |

Beats exercised: an instant pick is invisible and irrevocable; a timeout produces exactly one expiry for exactly the unsatisfied grant; the expiry response completes the collect-all group exactly as a player response would; the received hand is revealed by an explicit payload-carrying event projected per viewer.

## 5. The wall, precisely

The only in-contract workaround for the passHands payload is to make players author it: grant each seat a `passHand` action whose payload is their own remaining hand (which they know), validated at admission against state. That works on the happy path but fails on exactly the mandated case — the timed-out/disconnected player — whose expiry-generated passHand has, again, no payload channel. The other "workaround" is abusing C3 by declaring the rotation a zero-entropy random outcome. Both prove the real fix: generalize admission-time resolution to deterministic resolvers (change #5).

## Friction points (designer)

- F1 - collect-all buffering underspecified: the contract does not say whether collect-all responses are admitted on arrival (redacted) or buffered outside the log until group resolution. Only the buffered reading works: under admit-on-arrival, an early pick would enter the log redacted, and since past events are never re-projected (C9), the card could never become public at resolution without a second explicit reveal event per pick.
- F2 - no group identity for collect-all: the contract defines resolution per-grant and speaks of 'overlapping grant responses', but draft grants are disjoint (each seat picks from its own hand) yet must resolve together. Nothing says which grants form one collect-all unit or when it resolves.
- F3 - mid-batch re-evaluation hazard: pendingGrants is re-evaluated after EVERY admitted event. If that applies inside a resolution batch, then after the first admitted pick the state shows 1-of-3 picked and pendingGrants would return fresh pick grants for the other two seats with an already-past deadline (roundStartTs+30s), instantly firing spurious autoPick expiries. The game cannot defend itself: pendingGrants is pure over state and cannot know buffered responses exist.
- F4 - 'exactly one expiry event per deadline' is ambiguous when several grants share one deadline value: if two players time out, two autoPick events for two different seats are needed; a literal one-per-deadline-value reading collapses them. Also unstated: satisfied grants must disarm their deadlines (no expiry for a seat that already picked).
- F5 - expiry events have no payload channel: onExpiry is only the NAME of a default action, recorded by the framework. The expiry-generated passHands event must carry the rotated hands (C9 reveal-as-explicit-event; receivers can learn their new hand from nothing else), but the game has no way to attach a computed payload to a framework-authored event.
- F6 - C3 determinism asymmetry: a RANDOM autoPick is fully expressible (admission resolves the outcome and the event carries the card, making it public), but a DETERMINISTIC autoPick ('lowest index') is not - the event would carry nothing and spectators could never see which card was taken. Randomness is strictly more expressive than determinism, which is backwards; deterministic resolution is the missing degenerate case of C3.
- F7 - actorless system transitions need a hack: the hand pass is a deterministic consequence of resolution with no actor, but the framework's only autonomous event is deadline expiry. The workaround is a grant on an arbitrary seat with allowedActions [] and a deadline computed to be already past (lastResolveTs + 0), whose onExpiry fires the system action. It works on paper but the contract is silent on whether empty allowedActions and already-due deadlines are legal, and the seat field is meaningless.
- F8 - no 'locked in' indicator: because buffered collect-all responses are not in the log, projection can never show opponents/spectators that a player has already picked. Either the UX gap is accepted or the framework must expose grant-satisfaction status as a projectable non-log signal.
- F9 - in-contract alternative for the pass reveal exists but fails the mandated case: making each player submit their own remaining hand as a validated passHand action payload works only when everyone responds; the timed-out player's expiry-generated passHand hits F5 again, so the timeout path (explicitly required by this game) cannot be covered without API change #5.

## Required API changes (designer claim)

- C7: define collect-all grouping - all grants with resolution 'collect-all-then-resolve' returned by a single pendingGrants evaluation form one group; the group resolves when every member grant has either a buffered response or its expiry event.
- C7: define collect-all buffering - responses to a collect-all group are buffered outside the log (unadmitted, unprojected), satisfy and disarm their grant on acceptance (later responses to the same grant are rejected and logged), and are admitted as a contiguous batch at group resolution under their originating grants, in the order the grants were returned by pendingGrants.
- C7: defer pendingGrants re-evaluation and deadline arming until the final event of a collect-all resolution batch has been admitted; batch members are validated against their originating grants, not against re-evaluated ones.
- C7: reword the expiry guarantee to 'exactly one expiry event per unsatisfied grant whose deadline fires' (not per deadline value); grants satisfied by a buffered response disarm their deadlines and never produce an expiry event.
- C3/C7: generalize admission-time resolution - any admitted event, including framework-appended expiry events, may carry a payload produced by a game-supplied pure resolver resolve(state, actionType) -> payload, with RNG outcomes as the nondeterministic special case. Without this, the expiry-generated passHands event cannot carry the receiver-visible hands that C9's reveal-as-explicit-event pattern requires, and deterministic onExpiry defaults whose outcome derives from hidden state are unprojectable.
- C7 (recommended, could land as a blessed library helper instead of an API change): legalize the zero-delay system-step idiom - a grant with allowedActions [], deadline equal to the timestamp of the last admitted event, and onExpiry naming a system action - by explicitly permitting empty allowedActions and already-due deadlines.

## Adversarial verifier findings

**Summary:** The design is honest and the hostile read largely confirms it: every load-bearing extension (buffering outside the log, group formation, deferred re-evaluation, per-grant expiry with disarm, the payload resolver, the zero-delay system step) is declared inline and mapped to an explicit required change, and I independently verified the central walls are real — payload-less framework-authored expiry events genuinely cannot deliver the rotated hands under C9's stateless never-re-project rule, the admit-on-arrival alternative funnels into the same missing payload channel via the mandated timeout case, and F6's determinism asymmetry holds. The two-round trace is arithmetically correct (card flow, rotation payloads, deadlines, timestamps all recompute cleanly) — but only under the design's amended semantics, not the bare contract, so the self-applied verdict 'expressible-with-friction' is generous: by its own F9, the mandated timeout+pass case is impossible without API change #5, making the honest verdict 'requires API change'. Residual dishonesty is minor but real: the random autoPick is quietly treated as contract-native C3 when sampling from a hidden game-defined set actually needs the change-#5 resolver channel; the expiry event is silently interleaved into the resolution batch in grant order with no covering rule; and the grants declare index constraints while the trace validates and publicizes card ids. The biggest glossed problem is that the proposed 'one evaluation = one group' rule collapses if any unrelated event (which C8 guarantees can occur — wallet responses, disconnects) is admitted during the collection window, spawning a duplicate grant group with re-armed deadlines; no cross-evaluation grant identity exists in the contract or the change list. Sound overall, with the verdict label, four minor silent assumptions, and the collection-window re-evaluation hole as the required corrections.

**Contract violations in the design:**
- Random autoPick claimed as contract-native (F6: 'a RANDOM autoPick is fully expressible') and used in the trace at t=31000 ('C3 resolves -> c5'). C3 resolves randomness at admission, but binding the onExpiry NAME 'autoPick' to the procedure 'sample uniformly from state.hands[seat]' requires a game-to-framework channel specifying a sample space over hidden game state. C3's examples (shuffled deck, drawn tile) gesture at dealer-style draws, not arbitrary game-defined hidden subsets tied to expiry defaults. The random path quietly needs the same resolver machinery as the design's own change #5 (which even phrases RNG as 'the nondeterministic special case' of a game-supplied resolver) — yet the trace and F6 trade on it being free.
- Expiry-event placement inside the resolution batch is a silent sequencing power: the trace slots the framework-appended autoPick(P1) as E3 BETWEEN the buffered picks 'in grant order'. The contract says the framework appends the expiry event when the deadline fires; even the design's proposed changes #2/#3 only order buffered responses 'in the order the grants were returned' and say nothing about holding an already-fired expiry event and interleaving it into the batch. The trace assumes a rule that neither the contract nor the change list contains.
- Grant constraints declared vs. validated are inconsistent, and the projection claim depends on resolving it: pendingGrants declares 'pick(index in 0..len(hands[s])-1)' (index payload), but the trace's round-2 rejection reasons by card membership ('c9 not in P2's current hand') and the section-3 table claims pick events are 'full' for opponents/spectators — which only works if the admitted event carries the card id, since an index into a hidden hand reveals nothing. The design silently uses a richer payload+validation semantics than the grant it wrote down.
- Minor: logging a duplicate same-seat response (t=4000) as an 'arbitration loser' stretches the contract's arbitration-loser recording, which is defined for arbitration among overlapping grant responses, not re-submissions to an already-satisfied (proposed-semantics) grant. Covered by proposed change #2, but the trace row cites it as if it were existing contract behavior.

**Problems the design missed:**
- Collect-all group identity across re-evaluations: any unrelated admitted event during the 30s collection window (chat, wallet API response, disconnect notice — C8 explicitly says external inputs enter the log as recorded events) triggers pendingGrants re-evaluation. Buffered picks have not touched state, so pickedThisRound is still all-false and the evaluation returns a FRESH group of three pick grants with re-armed deadlines while the old group holds buffered responses. Proposed change #1 keys groups to 'a single pendingGrants evaluation' and change #3 defers re-eval only during the resolution batch, not the window. No stable grant identity / grant-equivalence rule exists, so the design's own fix is not robust to the contract's own session model. This is F3 generalized, and it is unaddressed.
- Self-view reconnect during collection: buffered responses are 'unadmitted, unprojected', so a player who picked and then reconnects refolds the projected log, derives state implying an open pick grant, cannot discover they already picked, and gets rejections on resubmission. F8 only covers the opponent/spectator 'locked in' indicator; the actor's own inability to reconstruct their commitment is the sharper gap.
- Deal/segment-start authoring is glossed: E1 'deal' appears at t=1000 with no author or triggering mechanism (presumably another zero-delay F7 system step or a C8 boundary event — unstated), and the design never shows how a raw C3 shuffled-deck payload partitions into per-seat hands consistently with stateless per-event projection (doable via a fixed dealing convention encoded in the event, but never specified).
- Deadline-boundary race: a pick arriving in the same admission instant the deadline fires. Change #4 says satisfied grants never produce an expiry, but the converse — a response to a grant whose expiry event has already been appended is rejected — is implied, never stated, and the arbitration between an in-flight response and a firing deadline is pinned nowhere.
- Pick revision is silently impossible: the first buffered response irrevocably satisfies and disarms the grant ('invisible and irrevocable'). Revise-until-deadline, common in simultaneous-pick games, is inexpressible under both the contract and the proposed buffering semantics (un-satisfying a grant and re-arming its deadline is yet another unpinned semantic). The design presents irrevocability as a feature without acknowledging it is forced.
- Duplicate card identities: real draft pools (7 Wonders included) contain duplicate cards. Card-id picks (as actually traced) become ambiguous with duplicates; index picks (as declared) leak nothing publicly when projected. The design needs unique instance ids in the deal payload and never says so — this is the same index-vs-card-id wobble surfacing as a game-correctness issue.
- End-of-draft transition only asserted: round 3 hands empty mid-batch, then 'segmentEnd via the same zero-delay idiom' — chaining two consecutive zero-delay system steps (skip the pass, then segmentEnd) under deferred re-evaluation is claimed but never traced.
