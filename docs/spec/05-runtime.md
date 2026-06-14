# 05 — Runtime: Admission, Grant Engine, Modes, Outbox (DRAFT v0.1)

How the framework drives a match: the admission pipeline, the grant/deadline engine, the
collect-all machinery (R4/R8), execution modes, and the effects outbox (C6). Consumes the
contract (`01`), produces the records (`03`) into the log (`04`).

## D-23 — The admission pipeline (one intent → at most one event)

Every inbound thing — player action, timer fire, connection transition, wallet callback — is an
**intent**. The pipeline, single-writer per room (D-16):

```
1. Stamp ts = server admission time (C8). This becomes the event ts and the clock value.
2. Resolve the governing grant (or nonGrantIntent, R7). If none governs it → reject.
3. Run the game validator (state, intent) → Verdict (R7). Record an AdmissionRecord (D-8)
   with preStateHash and verdict regardless of outcome.
4. If rejected: stop. The admission record IS the artifact ("pressed X, nothing happened").
5. If accepted: build the payload —
     • player-authored payload: taken from the intent (validator already vetted it);
     • framework/expiry/system payload: materialize[type](state, actor, rng) (R1), where rng
       is the per-segment PCG32 stream (C3/D-3); the recorded event carries the result verbatim
       and the cumulative draw count as rngOffset (D-7).
6. Apply reducer → new state. Compute postStateHash = sha256(KCF1(state)) (C2/D-1).
7. fsync the MatchRecord BEFORE any client-ack or external emission (C5). Only now is the
   intent durable and the action acknowledged.
8. Re-run the grant engine (D-24) against the new state.
```

Steps 6–8 never run for non-live modes that must not mutate the world: see D-26.

## D-24 — The grant engine

After every admitted event (or completed collect-all batch, D-25), the engine reconciles the
**armed set** against `pendingGrants(state)`:

- **Identity** (R3.1) = `(seat, sorted(actionTypes), deadline)`. The action-type sort is for
  identity ONLY (it is *not* admission order — see D-25/R8). Deadlines are pure functions of
  state anchors, never a clock (R11): a re-evaluation that yields the same logical grant yields
  the identical identity, so it **re-arms idempotently** — no duplicate, no deadline rebase. This
  is the mechanism that kills claim-window creep.
- **Disarm:** a previously-armed grant absent from the new evaluation is disarmed; its expiry
  never fires (R3.2).
- **Arm + fire:** a newly-present deadline is armed. Two shapes (R10): `deadline <= now` fires
  immediately on arming (system step); a future deadline is a watchdog whose only effect is its
  `onExpiry` if unsatisfied. Exactly one expiry event per **unsatisfied** grant whose deadline
  elapses (R3.2).
- **Fencing** (R3.3): an armed deadline `D` totally orders the log at `D` — no response to that
  grant timestamped `> D` is admitted before `D`'s expiry event; ties at `D` resolve to the expiry.
- **Delivery** (R6): each grant is projected and delivered only to its own seat; system grants
  (`seat: null`) are delivered to no one. (Grant *existence* can leak; uniform-window helpers
  address that for hidden-info games.)

Expiry firing is itself an intent through D-23 (the `onExpiry` action), so an expiry event is a
normal admitted event with a `materialize`-built payload.

## D-25 — Collect-all machinery (R4 + R8)

When `pendingGrants` returns grants sharing a `resolution.collect-all.groupId` in one evaluation,
they form a **group**:

1. **Buffer, don't admit.** A response to a group member is validated and, if accepted, **buffered
   outside the log** and its grant is **satisfied-and-disarmed**. It is *not* yet a match-stream
   event; grant re-evaluation **defers** until the group closes (so an unrelated admitted event
   cannot spawn a duplicate group — the round-1 collection-window bug).
2. **Close** when every member is satisfied or its deadline has elapsed (whichever per member),
   bounded by `admitLimit` (once `admitLimit` members are satisfied, the group closes; remaining
   satisfied responses become **arbitration losers** recorded in the admission log, D-8).
3. **Admit as one contiguous batch in EMISSION ORDER (R8)** — the order `pendingGrants` returned
   the grants, *not* the identity sort and *not* arrival order. Expiry defaults for unsatisfied
   members are materialized and admitted in their emission slot. Each batch member flows through
   D-23 steps 5–7 (materialize, reduce, fsync) in that fixed order; grant re-evaluation (D-24)
   runs once, after the whole batch.

**Emission order is well-defined** because one `pendingGrants` evaluation returns an ordered array;
the group's members are the subsequence sharing its `groupId`, in array order. Across re-evaluations
the question cannot arise: a group is formed by exactly one evaluation and admitted as one batch
before the next evaluation runs. `admitSubSeq` (D-8) increments along the batch so the admission log
preserves the order.

## D-26 — Execution modes (C6)

Mode is an explicit constructor input, **never** derived from env:

| mode | reduces state | emits effects | accepts player/timer intents | use |
|---|---|---|---|---|
| `live` | yes | yes (via outbox, D-27) | yes | normal play |
| `recovery` | yes (replay) | **no** | no | restart: replay log to current, then → `live` |
| `shadow` | yes (replay) | no | no | prod invariant re-check in a worker (D-20) |
| `local-replay` | yes (replay) | no | no | `kifu replay`, CI determinism gate |
| `settling` | yes (framework events only) | yes | **no** (grants never armed) | quarantine resolution / settlement correction (C6) |

Non-live modes receive a **no-op effect recorder** — structurally incapable of emission. `recovery`
replays then transitions to `live`; at that transition the **outbox** (not the reducers) drains
(D-27). `settling` transitions to `closed`, never to `live`.

## D-27 — The effects outbox (C6)

Reducers never emit. An event whose semantics imply an external effect (settlement, notification)
records the *intent to emit* in the **outbox**, keyed `(matchId, incarnation, eventSeq, effectIndex)`
with deterministic effect ordering, persisted **before** send. A durable per-match **high-watermark**
records the highest emitted key. On `recovery → live`, the outbox drains everything above the
watermark, **skipping any key whose causing `eventSeq` lies in a voided range** (the incarnation bump
on quarantine, C5, makes voided effects un-drainable). The consuming service dedupes on the
idempotency key — so replay, recovery, and a dev laptop can never re-fire money. The settlement
emission carries the chain digest as of settlement (C6); post-terminal audit records anchor to it via
the audit appendix (D-16).

## Open question resolved here

**`sys.deal`: one multi-seat record or N per-seat?** (deferred from D-7.) Resolution: **one record**,
with the full deal in the payload, redacted per-viewer by `projectEvent` (the hanchan/poker gate
designs both confirmed stateless per-viewer projection of a single denormalized deal event works —
each viewer keeps only its own cards). Per-seat split is unnecessary and would multiply system events.
