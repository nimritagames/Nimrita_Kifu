# 06 — Observability: Replay, Exports, Invariants, Detection (DRAFT v0.1)

The headless v1 surface (C11) and the artifact discipline behind it (C10). Web timeline UI
and live inspector are explicitly v2 (gated on one game in production). Frozen-charter-driven
(C10/C11) — gate-independent.

The thesis the whole framework exists to serve: **time-to-detect and time-to-root-cause are
the product.** Every tool here is judged by whether it shortens TTD or TTRC (charter §1).

## D-17 — The CLI replay harness (`kifu replay`)

The primary v1 debugging surface. Consumes a **repro export** (Class A, D-15) — the only valid
replay input — and re-executes it through the game's reducers in `local-replay` mode (C6: no
effects). Capabilities:

- **Replay-to-first-divergence:** verifies the hash chain (D-7) event by event; on the first
  `postStateHash` mismatch, stops and prints the exact `eventSeq`, the expected vs actual hash,
  the `versionRun` classification (data-divergence vs code-changed, D-12), and the decoded event.
  Never completes silently wrong (C2).
- **Inline rejected intents:** renders admission-log rejections (D-8) interleaved at their log
  position, greyed — so "I pressed X and nothing happened" is answered by scrubbing, not grep.
- **Field-diff filter (`--touches <path>`):** shows only events whose post-apply state diff
  touches a given state path — collapses a 900-event match to the 3 that moved the wrong field.
- **Per-seat view (`--as <seatRef>`):** replays through `projectEvent` for that viewer, showing
  exactly what that client knew at each step (C9) — the tool for "why did the client show X".
- **Step / seek (`--at <eventSeq>`):** time-travel to any point; state is the verified snapshot
  (D-13) plus suffix replay.

## D-18 — Black-box crash dump

On an unhandled room-process fault: capture the last-N **match-stream** events (not operational,
D-9) + the current state + the exception, as a **Class A** artifact (sealed, pseudonymized,
encrypted at rest, D-15). The alert that fires carries a **pointer** (`matchId + eventSeq`),
never the payload (C10). Default human rendering of the dump is **Class B** (through projection);
the raw Class A payload opens only via break-glass.

## D-19 — Exports: two grades (C10)

- **Repro export (Class A):** identity-pseudonymized, payload-complete, chain-intact through the
  last verified anchor, plus an explicitly-labeled non-verifying tail (voided events, torn bytes,
  seal-release stripped to sidecar, D-15). Its creation is a chained **audit** record (D-10). The
  only artifact that feeds replay or becomes a golden fixture. The killer workflow's backbone:
  prod bug → repro export → `kifu replay` → fix → export joins the corpus.
- **Viewing export (Class B):** visibility-redacted through `projectEvent` for a stated viewer
  role; explicitly **never** a replay input. For support/audit reading, not reproduction.

## D-20 — Invariant runner

Runs the game's declared `invariants` (and the R12 redundant-recompute invariants for
`settlementTouching` reducers) after every admitted event. Modes:

- **dev / CI:** every invariant, every event, every fixture in the golden corpus (C12).
- **prod:** cheap invariants live on the serving path; expensive ones on **shadow replay** in a
  worker (C5, never the serving event loop). A violation is a **page trigger** (D-21) carrying the
  `matchId + eventSeq` of the **first** divergent event — the precise birth of the wrongness, which
  is the entire point of executable invariants (catches the "valid-but-wrong" class that logs and
  metrics structurally cannot).
- **Projection invariants (C9):** quantified over `projectEvent` output ("seat A was never sent
  tile X before its reveal event"), shadow-replayed like state invariants.
- **Constitutional projection invariant (C11):** no framework-internal record type (D-10) ever
  reaches a Class B surface — CI-enforced.

## D-21 — Page triggers (the enumerated v1 set, C11)

A finite, named set — no vague "anomaly detection" in v1:

1. invariant violation (incl. projection + redundant-recompute)
2. settlement-recompute mismatch (R12)
3. quarantine incident (C5 torn-tail / tail-behind-acked)
4. data-divergence alert (C4 same-version hash mismatch on shadow replay)
5. torn-tail detection (C5)
6. crash (D-18)

Each page carries pointers, not payloads (C10). TTD starts at the event that *caused* the
condition; the page is the TTE→TTRC handoff.

## D-22 — Support search

The path from a human complaint to a replay: real identity → external identity map (C10) →
opaque `SeatRef`(s) → player+time-indexed match search → **one-command** repro export + `kifu
replay`. The identity map is the *only* place real identity meets the opaque log, and it is
crypto-shreddable (erasure = shred the map, keep the log, C10).

## Not in this document

The web timeline UI and live inspector dashboard (v2, C11). The grant-engine/outbox internals
that *produce* these records → `05-runtime.md`.
