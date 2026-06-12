# Nimrita_Kifu

A server-side TypeScript framework **and operating model** for turn-based multiplayer
games. A *kifu* (棋譜) is the written record of a game — centuries-old Go matches replay
perfectly from theirs. That is the architecture: **the record is the truth.** Every match
is an append-only event log; state only ever comes from verified, deterministic replay;
nothing that goes wrong can stay hidden.

## Read in this order

1. **[docs/CHARTER.md](docs/CHARTER.md)** — the constitution: twelve commitments, the
   operating model, the road. Amended only by open, user-ratified ceremony.
2. **[docs/STATUS.md](docs/STATUS.md)** — where the project stands right now (the
   session-to-session baton).
3. **[docs/JOURNAL.md](docs/JOURNAL.md)** — the story so far, in plain words.
4. **[docs/phase0/](docs/phase0/)** — the paper gates that battle-tested the design
   before any code existed.

## Governance

This repository enforces its own discipline mechanically: protected-path hooks deny
changes to the constitution without an open amendment, every behavioral claim requires a
runnable demonstration, and CI gates everything (`tools/hook-tests/`, `tools/verify-docs.js`).
See [CLAUDE.md](CLAUDE.md) — the operating contract that binds the builder.

## Status

Pre-code by design: constitution ratified (v4.2), Phase 0 paper gates passed, contract
revisions R1–R7 adopted. Next: tech spec → gate re-runs → Phase 1 retrofit.
