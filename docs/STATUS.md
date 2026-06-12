# Nimrita_Kifu — Status

**Updated:** 2026-06-12 · **Charter:** v4.2

## Current phase

**Phase 0 CLOSED.** Charter ratified through Amendment 2: Contract Revision Set 1 (R1–R7)
approved, game #2 = Ludo, framework named Nimrita_Kifu. All six paper gates ran
(expressible-with-friction across the board; see docs/phase0/0-VERDICT.md).

## Next gate (in order)

1. **Tech spec** — IN PROGRESS: `docs/spec/` opened; 01-game-contract (full TS contract,
   R1–R7 incorporated) and 02-determinism (KCF-1 canonical form, SHA-256, PCG32, HKDF,
   fingerprint) are DRAFT v0.1. Remaining: 03-event-model, 04-log-format, 05-runtime,
   06-observability.
2. **Gate re-runs** — hanchan-carryover + cash-rebuy paper gates against
   `docs/spec/01-game-contract.md`. Passing both unblocks the C7/C8 API freeze.
3. **Phase 1** — retrofit inside MJ-socket-server (admission log, seeded RNG sites, crash dump,
   CLI replay harness, incident baseline). Starts on user "go".

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
