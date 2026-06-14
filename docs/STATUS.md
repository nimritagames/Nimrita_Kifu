# Nimrita_Kifu — Status

**Updated:** 2026-06-12 (autonomous session) · **Charter:** v4.2

## Current phase

**Tech spec COMPLETE in draft; flow-semantics gates PASSED.** All six spec documents are drafted
(`docs/spec/00`–`06`). The game contract is at DRAFT v0.3 (R1–R14). The two re-run gates
(hanchan multi-ron, cash-rebuy seat-reuse) passed a confirmation adversarial pass — every
flow-semantics kill-shot across poker/sealed-bid/draft/hanchan/cash-game/byo-yomi is closed.
Two quality findings from the confirmation were folded as Revision Set 3 (R13 occupancy
lifecycle, R14 machine-checkable settlement coverage).

## Next gate (in order)

1. **Tech spec polish / user review** — the six spec drafts await the user's read. Open question
   carried for the user: package scope (`@nimritagames/kifu` vs a `nimrita` org) — Phase 3, not
   blocking.
2. **Phase 1** — retrofit inside MJ-socket-server (admission log, seeded RNG sites, crash dump,
   CLI replay harness, incident baseline). **Starts on user "go" + incident war stories.**
3. **Phase 2** — two-ruleset spike (mahjong slice + sealed-bid) as executable reducers on stubs;
   this is where R13 (occupancy lifecycle) and the whole contract get their first *running-code*
   exercise. The hard C7/C8 freeze rides on these tests, not on the prose.

## Blocked on user

- "Go" for Phase 1 + incident war stories for the baseline rubric (tickets alone are thin).
- (Phase 3, not before) package-scope decision: publish `@nimritagames/kifu` from the
  account, or create a `nimrita` org for `@nimrita/kifu`.

## Infrastructure (live, 2026-06-12)

- **Remote:** https://github.com/nimritagames/Nimrita_Kifu — public by owner decision.
- **CI:** `.github/workflows/ci.yml` on every push/PR — governance self-test
  (`tools/hook-tests/run.js`, 12 cases) + docs gate (`tools/verify-docs.js`); auto-upgrades
  to `npm run verify` when package.json appears. First run green in 16s.
- **Branch ruleset `main-protection`:** PR-only main, required green `verify` check,
  no force-push, no deletion, **zero bypass actors** (`current_user_can_bypass: never`).
- **Node pinned:** 22.17.0 (`.node-version`) — seed of the C2 environment fingerprint.

## Governance (live)

Enforcement is mechanical, not advisory: `.claude/hooks/protect-paths.js` (PreToolUse) denies
edits to docs/CHARTER.md, CLAUDE.md, .claude/settings.json, .claude/project-tools.json, and
.claude/hooks/** unless the user approves the amendment token (.claude/AMENDMENT — its creation
always requires explicit user confirmation); unparseable hook input fails VISIBLE (ask), never
open. `.claude/hooks/session-audit.js` (Stop) warns the user whenever Claude stops with an
uncommitted tree. **Hooks load at next session start or after the user opens /hooks once.**
Tamper-proof (vs tamper-evident) enforcement still requires the GitHub remote + CI from the
provisioning list below.

## Done log

- **2026-06-12:** Charter v1→v4.2 (three adversarial review rounds, ~40 agents; two amendments).
  Phase 0 gates ran (6/6, 12 agents). R1–R7 ratified. Distribution model: one repo per game,
  versioned package, release-time golden gate. Game #2 = Ludo. Named **Nimrita_Kifu**.
  Repo initialized; operating contract (CLAUDE.md) and this STATUS file added.
- **2026-06-12 (later):** GitHub repo live (public), CI green, branch ruleset (zero bypass).
  Governance hooks live + battle-proven (denied their own author; first amendment ceremony ran).
- **2026-06-12 (autonomous session):** Full tech spec drafted (`docs/spec/00`–`06`). Game contract
  v0.1→v0.3 (Revision Sets 2 & 3, R8–R14). Re-ran the two failed gates against the typed contract
  (5/6 + 6/7 → both fixes folded → confirmation pass: K2 + K7 closed, no contradiction). Spec docs
  03–06 (event model, log format, runtime, observability) authored from frozen charter commitments.
  All decisions made under the user's "decide on my behalf" mandate; flagged for review on return.
