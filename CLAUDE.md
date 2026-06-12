# Nimrita_Kifu — Project Operating Contract

This file loads into every Claude session in this repo, forever. It is the cross-session
enforcement layer. The human author reviews outcomes, not process — process discipline
lives here and is non-negotiable, regardless of session, chat, or model.

## Authority chain

1. **docs/CHARTER.md** (v4.2) — the constitution. Commitments C1–C12, both amendments, and
   the road are settled. Do NOT re-litigate or "improve" them mid-task. Changes happen only
   through a user-ratified amendment (ADR + charter version bump), never a direct edit.
2. **docs/phase0/0-VERDICT.md** — Contract Revision Set 1 (R1–R7), ratified. Part of the contract.
3. **docs/STATUS.md** — current phase, next gate, open blockers. **Read it first, update it
   last, every session.** It is the session-to-session baton; memory systems are advisory,
   STATUS.md is authoritative.
4. **docs/adr/** — one short ADR per layer-level decision (the charter mandates this).

## Session ritual

- **Start:** read docs/STATUS.md, then `git log --oneline -10`. Orient before acting.
- **End:** update STATUS.md (what changed / what was verified / what's next / residual risk),
  append a plain-words entry to **docs/JOURNAL.md** — the human story of the session (what
  happened, what was learned, what it felt like), no jargon, no technical changelog — then
  commit all work — one logical change per commit, conventional prefix, imperative, <72 chars.
  Never leave the tree dirty at session end.

## Non-negotiables (the production standard)

1. **Evidence over belief.** Never state how code behaves without having executed it in this
   session. Every behavioral claim cites its proof: a test run, a replay trace, command output.
   If belief and reality might differ, run reality.
2. **Show, don't tell.** A completed task ends with a runnable demonstration — the exact
   command(s) and their output proving the change works. If it cannot be demonstrated,
   it is not done. Final summaries state: what changed, what was verified (with the actual
   commands), what risk remains.
3. **Definition of done:** typecheck + lint + full test suite green, run fresh this session;
   new behavior covered by a test that fails without the change; demonstration produced;
   STATUS.md updated; committed. No partial credit, no "should work".
4. **Root cause or nothing.** No patches, no workarounds, no special-case bypasses, no flags
   as fixes. Extend the canonical path; route every duplicate site through it.
5. **Determinism is law.** No Date.now / Math.random / Intl / locale methods / crypto / IO in
   reducer or game-logic modules. Lint-enforced once code exists (the eslint ban rules are part
   of the v1-blocking scope); until then, self-reviewed on every edit.
6. **Frozen core** (event-log format, event- and wire-schema versioning mechanisms, replay
   harness, invariant API): touching these requires a charter amendment. Stop and escalate
   to the user; do not edit and explain later.
7. **docs/CHARTER.md is write-protected by policy** — edited only to apply an amendment the
   user has explicitly ratified in conversation.

## Verification commands

Once package.json exists, `npm run verify` is the single gate (typecheck + lint + tests +
replay/determinism gates) and `.claude/project-tools.json` mirrors it — keep both in sync.
Until code exists, the verify gate is: docs internally consistent, git tree clean, STATUS.md current.

## The deepest check: the product checks the builder

Nimrita_Kifu's own machinery is the standard applied to itself: recorded sessions must replay
hash-identical (determinism gate), invariants run on every fixture, the golden corpus must be
green before anything ships. Use the framework's gates on the framework's own code first —
what is being built is also the harness that checks the builder. "I think it works" is replaced
by "here is the recorded session, watch it replay."
