# Nimrita_Kifu — Status

**Updated:** 2026-06-12 · **Charter:** v4.2

## Current phase

**Phase 0 CLOSED.** Charter ratified through Amendment 2: Contract Revision Set 1 (R1–R7)
approved, game #2 = Ludo, framework named Nimrita_Kifu. All six paper gates ran
(expressible-with-friction across the board; see docs/phase0/0-VERDICT.md).

## Next gate (in order)

1. **Tech spec** — concrete TypeScript interfaces, event envelope, log framing; incorporates
   R1–R7 into the C7/C8 contract text. (Claude's work; no user input needed to start.)
2. **Gate re-runs** — hanchan-carryover + cash-rebuy paper gates against the revised contract.
   Passing both unblocks the C7/C8 API freeze.
3. **Phase 1** — retrofit inside MJ-socket-server (admission log, seeded RNG sites, crash dump,
   CLI replay harness, incident baseline). Starts on user "go".

## Blocked on user

- "Go" for Phase 1 + incident war stories for the baseline rubric (tickets alone are thin).
- Provisioning (needed by Phase 3, not before): git remote + CI with branch protection,
  private package registry for `@nimrita/kifu`, Node version pin for the env fingerprint.

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
