# Nimrita_Kifu — Technical Specification

**Status:** DRAFT v0.1 · **Charter:** v4.2 (C1–C12 + ratified R1–R7 per Amendment 2)
**Freeze rule:** nothing in this spec freezes until the two outstanding paper gates
(hanchan-carryover, cash-rebuy) re-run green against `01-game-contract.md`.

The spec translates the constitution into buildable precision. Each document owns one
surface; the charter remains the authority on *why*, these documents on *exactly what*.

| Doc | Surface | Status |
|---|---|---|
| `01-game-contract.md` | The TypeScript contract a game implements (C7/C9 + R1–R7) | DRAFT v0.1 |
| `02-determinism.md` | Canonical state form, hashing, PRNG, KDF, fingerprint (C2/C3) | DRAFT v0.1 |
| `03-event-model.md` | Event envelope, admission records, record classes (C1) | planned |
| `04-log-format.md` | Physical framing, segments, snapshots, sidecars (C4/C5) | planned |
| `05-runtime.md` | Grant engine lifecycle, collect-all mechanics, modes, outbox (C6, R3/R4) | planned |
| `06-observability.md` | CLI replay, exports, invariant runner, page triggers (C10/C11) | planned |

**Decision log convention:** every load-bearing choice in these documents carries a
`D-n` tag with a one-line justification, so future ADRs can reference or amend a
specific decision instead of re-arguing a document.
