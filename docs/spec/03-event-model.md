# 03 — Event Model: Envelope & Record Classes (DRAFT v0.1)

The on-log shape of everything. Derived from C1 (three record classes), C2 (hash chain),
C3 (rng offsets), C4 (per-event logicVersion, segments). Frozen-charter-driven: the gate
re-runs cannot change these structures — they test flow expressibility (grants), not bytes.

Game code never sees this envelope; it sees the `GameEvent` view from `01-game-contract.md`.
The framework owns the envelope.

## D-7 — The three record classes share one envelope, differ by `recordClass`

```ts
export type RecordClass =
  | 'game'    // reducer-consumed, state-affecting, game vocabulary
  | 'system'  // framework state-affecting: segment boundaries, deal/reveal system steps
  | 'audit';  // zero-state-delta chained: break-glass, seal-release, incident-settlement

/** A record on the MATCH STREAM (the hash-chained, fsync-durable log, C1/C5). */
export interface MatchRecord {
  // --- identity / ordering ---
  eventSeq: number;          // monotonic within (matchId, incarnation); never reused (C5)
  incarnation: number;       // bumped when quarantine voids a range (C5)
  segmentIndex: number;      // which segment (C4); boundaries are themselves records

  // --- provenance ---
  logicVersion: string;      // per-event (C4); divergence classified per version-run
  recordClass: RecordClass;

  // --- content ---
  type: string;              // game action type, system step name, or audit record type
  seat: SeatRef | null;      // null: system / external input / audit
  payload: CanonicalJson;    // game payload, system payload, or audit payload
  ts: Timestamp;             // server admission timestamp; the injected clock returns this (C8)

  // --- randomness (C3) ---
  rngOffset: number | null;  // cumulative PCG32 draw count AFTER this record consumed rng;
                             // null if it consumed none. Lets recovery fast-forward and
                             // fairness-verify at exact offsets without the draw mapping.

  // --- integrity (C2) ---
  postStateHash: string;     // sha256(KCF1(state)) after applying. For 'audit' (zero-delta),
                             // equals the prior postStateHash unchanged.
  prevLink: string;          // hash chain: sha256(prevLink_prev || postStateHash_prev ||
                             // envelopeDigest_prev). Re-anchors at each verified snapshot:
                             // the snapshot hash is the genesis prevLink of the next segment (C4).
}
```

`envelopeDigest` = `sha256(KCF1({eventSeq, incarnation, segmentIndex, logicVersion,
recordClass, type, seat, payload, ts, rngOffset}))` — binds every field into the chain so
no field can be altered without breaking it.

## D-8 — The admission log is a distinct, co-located record stream (C1, R7)

Every inbound intent is recorded here — accepted **and rejected** — so "pressed X, nothing
happened" is answered by scrubbing, not grepping.

```ts
export interface AdmissionRecord {
  // ordering key (C1): total order even across rejections (which have no eventSeq)
  matchId: string;
  incarnation: number;
  lastAcceptedEventSeq: number;   // the match-stream seq this intent was adjudicated against
  admissionSubSeq: number;        // disambiguates intents at the same lastAcceptedEventSeq

  ts: Timestamp;                  // server-assigned admission timestamp
  intent: { type: string; seat: SeatRef | null; payload: CanonicalJson };
  preStateHash: string;           // state hash at decision time (C1)

  verdict:
    | { ok: true; producedEventSeq: number }          // accepted → this match-stream event
    | { ok: false; reason: string };                  // rejected → machine code (R7 validator)

  // collect-all / priority arbitration (R4): the candidates that LOST this decision
  arbitrationLosers?: Array<{ seat: SeatRef | null; type: string; reason: string }>;
}
```

**Durability split (C1):** accepted intents are durable *because* their produced event is
fsync'd on the match stream before client-ack (C5). Rejection and telemetry-only admission
records use group-fsync with a declared loss window (default 100 ms) — a crash may lose the
last <100 ms of *rejections*, never an accepted/effecting event. Heartbeat evidence behind
disconnect verdicts is retained (default 30 days, D-9) so disconnect adjudications survive
crashes.

## D-9 — The operational stream is never a replay input

Transport telemetry, metrics, heartbeats. Weakest durability. Correlated to the match
stream by `(matchId, eventSeq)` but the deterministic replay/hash machinery never reads it
(C1). Crash-dump "last-N" draws from the **match** stream, not this one.

## D-10 — Framework record types (game code never authors or projects these)

| `type` | class | carries | projectEvent (C9) |
|---|---|---|---|
| `seg.open` / `seg.close` | system | segmentIndex, `hash(segmentSeed)` (open) / revealed `segmentSeed` (close) | framework-owned; default null below break-glass |
| `seat.join` / `seat.vacate` (R13) | system | fresh ref + position (join) / retired ref (vacate) | game-reduced (occupancy lifecycle); projection public (presence is not secret) |
| `sys.deal` / `sys.reveal` / `sys.*` | system | materialized payload (R1) | per game `projectEvent` if the game named the type; framework-owned otherwise |
| `audit.breakGlass` | audit | grantee, scope, reason | framework-owned; null to all viewers |
| `audit.sealRelease` | audit | masterSeed (stripped to sidecar on export, D-15) | framework-owned; null |
| `fx.settlement` / `fx.incidentSettlement` | system | settlement payload + chain digest | framework-owned; may define a player-facing notice |

**Constitutional projection invariant (C11):** no framework-internal record type ever
reaches a Class B surface. CI-checked.

## Open questions deferred to 05-runtime

- Exact `admissionSubSeq` assignment during a collect-all batch (R4): the buffered-then-
  contiguous-admission ordering lives in the runtime spec, not here.
- Whether `sys.deal` is one multi-seat record or N per-seat records (round-1 poker gate
  flagged the single multi-seat deal as needing per-seat projection): resolved in 05 against
  the gate-rerun outcome.
