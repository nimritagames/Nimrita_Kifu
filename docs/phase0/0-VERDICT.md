# Phase 0 Paper Gates — Verdict

**Date:** 2026-06-12 · **Charter:** v4.1 (C7/C8 pre-freeze gates) · **Method:** six independent paper designs against the grant-API contract, each adversarially verified (12 agents).

## Headline

**The grant API's core survived. The freeze is BLOCKED — as the gate rule intends — pending Contract Revision Set 1 below.**

No gate returned *inexpressible* at the game-flow level: poker's raise-reopening rule, short all-ins and side pots, heads-up reversal, sealed-bid simultaneity, draft hand-passing, hanchan carryover, cash-session economy, and byo-yomi restart fairness all expressed cleanly **in the game layer** as pure functions over state. The "grants, not turns" bet holds. But all six designs independently hit the same contract gaps and were forced to invent the same unsanctioned idioms — which is precisely the convergent evidence the revisions below are built on.

| Gate | Designer verdict | Verifier | Notes |
|---|---|---|---|
| poker-betting | expressible-with-friction | sound | forced-reveal gap (F3) is freeze-blocking |
| sealed-bid | expressible-with-friction | sound | reveal-payload gap load-bearing for commit-reveal |
| draft | expressible-with-friction | sound | collect-all semantics essentially undefined |
| hanchan-carryover | expressible-with-friction | **issues found** | claim-window deadline creep bug; re-run required |
| cash-rebuy | expressible-with-friction | **issues found** | trace breaks at START_HAND eligibility; re-run required |
| byo-yomi-restart | expressible-with-friction | sound | restart fairness genuinely correct under the contract |

Honest relabeling per the verifiers: several gates are really **"requires API change"** — their own bodies prove a required change is load-bearing. The designs' verdict labels undersold this; this verdict does not.

## Contract Revision Set 1 (must be ratified before the C7 freeze)

**R1 — Admission-time materializer (the big one; unifies the two most-hit gaps).** The game contract gains a pure function `materialize(state, actionType, actor, rng) → payload`, invoked by the framework at admission for any event that needs a constructed payload — expiry-fired defaults, forced reveals, system steps, and **all structured randomness** (seat-keyed hole cards, per-seat deals + dora, next-wall-tile consistent with recorded state, draws over game-defined hidden subsets). The framework resolves raw randomness (C3) and passes it in; the game shapes it. Evidence: independently demanded by poker (forced reveal on all-in runout — flatly inexpressible today), sealed-bid (deadline-triggered `reveal_bids` cannot carry bids), draft (`passHands` payload), hanchan and cash-rebuy (verifiers proved the designs silently assumed framework-side game logic for deals — a power the contract never granted). `onExpiry` becomes `{action, payload-via-materialize}`.

**R2 — System steps become first-class.** `pendingGrants` may return seatless system grants (`seat: null`, `allowedActions: []`, deadline may be at-or-before now = fire immediately on arming). All six designs reinvented the same "zero-delay expiry on a proxy seat" hack for deals, street reveals, hand/segment boundaries, and session close; one design's session provably stalls without it. Bless it once, centrally.

**R3 — Deadline & grant lifecycle, fully specified.** (a) After every admitted event the armed set is *replaced* by the new evaluation's deadlines; superseded/satisfied deadlines are disarmed and never fire. (b) Identical grants re-arm idempotently — "exactly one expiry per **unsatisfied grant**", not per deadline value. (c) Expiry events carry the actual server admission timestamp (≥ the armed deadline — late firing after outages is legal and visible). (d) An armed deadline fences the log: no response timestamped after D is admitted before D's expiry event; ties at D resolve to the expiry. (e) A deadline already past at arming fires immediately. (f) Grant identity across re-evaluations is defined (stable key: seat + action set + deadline derivation), so unrelated mid-window events cannot spawn duplicate grant groups.

**R4 — Collect-all-then-resolve gets real semantics.** Grants sharing a `groupId` (explicit field) form one group; responses are buffered outside the log, satisfy-and-disarm their grant on acceptance, and are admitted as one contiguous batch at group close (all satisfied or expired), expiry-fired defaults included, in grant order; re-evaluation defers until the batch completes; the group declares how many members may be admitted (multi-ron needs >1). Evidence: sealed-bid proved the enum was observationally inert as written; draft proved admit-on-arrival can never go public under stateless projection; hanchan needs grouping for the claim-window helper the charter itself mandates.

**R5 — Standing grants.** `deadline`/`onExpiry` become optional: a grant without them is an open-ended permission (resign anytime, sit-out, rebuy, cash-out). Today these core flows are inexpressible — three gates hit this independently.

**R6 — Grant delivery is per-seat and projected.** Grants (including materialized expiry payloads) are delivered only to their own seat, never broadcast; grant *existence* can itself leak (mahjong tenpai timing side-channel) — the claim-window helper must offer uniform-window mode. Normative one-liner plus helper guidance.

**R7 — The admission surface is the game's validators, stated plainly.** Grant `constraints` are opaque game data evaluated by the game's own validators at admission (the charter already lists validators in the contract; the framework never interprets game predicates). Games additionally declare a whitelist of **non-grant intent types** (join-table, wallet callbacks, operator close) with their own validators. Projection keys hidden info on opaque player refs, never seats (seat reuse across a session leaks prior occupants' hands — found by cash-rebuy).

Also adopted as normative notes: clients derive their view by replaying projected events through redaction-tolerant reducers (the model every design assumed; now stated); the "logical-boundary anchor" clock pattern and time-banks ship in the clock helper; optional recovery-boundary event for pause-on-outage clock policy.

## Gates to re-run after R1–R7 land

- **hanchan-carryover** — real bug: claim-window deadlines anchored on `lastTs` creep open on every admitted event (the design solved this for turns, forgot it for claims); plus riichi-pot disposal at session close, multi-ron admission count, abortive draws.
- **cash-rebuy** — trace incoherent at its centerpiece (START_HAND armed with one eligible seat against its own ≥2 rule); wallet-liveness holes (CLOSING can hang forever); mid-hand sit-out/leave for non-actors needs R5.

## What this changes on the road

Nothing in sequence — this *is* Phase 0 doing its job. R1–R7 are tech-spec-grade contract revisions; they go into the C7/C8 contract text before the API freezes, the two flagged gates re-run against the revised contract, and Phase 1 (the MJ-socket-server retrofit) is unaffected — its admission-log shape already matches C1.
