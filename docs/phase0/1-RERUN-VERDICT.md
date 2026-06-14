# Phase 0 Gate Re-Run — Verdict & Contract Revision Set 2

**Date:** 2026-06-12 · **Against:** `docs/spec/01-game-contract.md` v0.1 (charter v4.2, R1–R7 incorporated)
**Method:** the two gates that failed round 1 (hanchan-carryover, cash-rebuy) re-designed against
the typed contract, each adversarially verified with the round-1 kill-shots as the explicit test.

## Outcome

| Gate | Round 1 | Re-run | Sole remaining fail |
|---|---|---|---|
| hanchan-carryover | failed (sound=false) | **5/6 kill-shots survived** | K2 multi-ron: "grant order" undefined |
| cash-rebuy | failed (sound=false) | **6/7 kill-shots survived** | K7 seat-reuse: SeatRef occupancy semantics undefined |

**The typed contract closed every round-1 fatal gap:** structured deals/draws now live in
`materialize(state, actor, rng)` (R1) instead of being silently assumed of the framework;
forced all-in reveals copy server-held hidden state into a public payload (R1); claim-window
deadlines anchor on a frozen `windowOpenTs` state field, killing the round-1 `lastTs`-creep bug
(R3.1 + C8); standing economy intents (rebuy/cash-out/sit-out) are deadline-less standing grants
available mid-hand (R5); wallet callbacks are validated `nonGrantIntents` (R7); the session timer
is state-conditioned so it provably cannot re-fire (R3.2); START_HAND eligibility is a pure
`eligibleCount >= 2` test (R2). Each of these was a round-1 *fatal* finding; all are now expressible
**within the contract's granted signatures** — no design assumed a power it wasn't given, except
the two narrow gaps below.

## The two genuine gaps — both single-sentence under-specifications

Neither is a structural flaw; both are the contract being silent where it must be explicit. The
verifiers spelled out the exact fix and confirmed it closes the shot. These become **Contract
Revision Set 2 (R8–R12)**, folded into `01-game-contract.md` and re-confirmed by a second gate pass.

- **R8 — Define "grant order" (closes hanchan K2).** Collect-all batch admission (R4) and atamahane
  single-winner selection (`admitLimit:1`) depend on a defined order. Normative: a buffered
  collect-all batch admits in **emission order** — the order `pendingGrants` returned the grants in
  the evaluation that armed the group. This is *distinct* from the canonical action-type sort used
  for grant *identity* in R3.1 (identity-sort ≠ admission-order). Multi-ron pot/honba allocation and
  atamahane priority are correct only under emission-order.

- **R9 — SeatRef is per-occupancy (closes cash-rebuy K7).** A `SeatRef` identifies one seating
  occupancy, not a seat position. Taking a vacated seat **mints a fresh opaque SeatRef**; refs are
  never recycled across occupants. Projection keys on these per-occupancy refs, so a new occupant's
  `projectEvent` owner-match fails for the prior occupant's records → a joiner can never decode a
  predecessor's hidden payloads. (Also resolves the hanchan note that games must key state on SeatRef,
  not integer seat positions; integer indices in a design are a presentation convenience over a
  SeatRef↔position map the game maintains.)

## Three minor refinements adopted alongside (non-blocking, but folded for precision)

- **R10 — Watchdog grant pattern.** Bless explicitly: `seat:null, allowedActions:[], deadline:<future>,
  onExpiry:<escalation>` is a legal liveness watchdog (wallet-close liveness, session timer),
  *distinct* from the immediate-fire (`deadline ≤ now`) system step. Both K4 and K5 rely on it; R2's
  prose previously illustrated only the immediate-fire case.

- **R11 — `pendingGrants` deadlines read state-stored anchors, never a clock.** Since `pendingGrants(state)`
  has no clock, every future deadline it returns is computed from an absolute timestamp a prior reducer
  already recorded in state (received as the event `ts`, C8). This is *why* K1 anchoring works and the
  `lastTs`-creep bug is now unrepresentable. Stated normatively with `windowOpenTs`/`turnTs`/
  `sessionDeadlineMs` as the canonical pattern.

- **R12 — Settlement-touching covers boundary disposal.** The C11 mandatory redundant-recompute
  invariant extends to any reducer that disposes of pot/stakes at a segment or session boundary
  (riichi-pot disposal at close, side-pot settlement). The game declares which reducers are
  settlement-touching; each needs at least one covering redundant-recompute invariant.

## Latent edges logged, not yet addressed (out of v1 scope, recorded so they aren't lost)

- **Dynamic collect-all membership** (hanchan F1): no mechanism to add a member to an *already-armed*
  collect-all group (a late-eligible claimant). Not exercised by standard riichi/poker; revisit if a
  game with a dynamic claimant set is built.
- **System-grant burst cost** (hanchan F3): per-draw immediate-fire system grants mean ~18 arm/fire/
  re-eval cycles per mahjong hand. Acceptable at turn-based rates; a runtime concern for `05-runtime.md`,
  not a contract gap.

## Freeze status

The C7/C8 API freeze unblocks once R8–R12 are folded **and** a confirmation gate pass returns clean
(both gates 6/6 and 7/7 within the revised contract). That confirmation run is the immediate next step.
