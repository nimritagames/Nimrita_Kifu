#!/usr/bin/env node
// Nimrita_Kifu governance self-test: proves the protect-paths hook behaves as law.
// Generates platform-correct absolute paths at runtime so the same suite passes
// on Windows (dev) and Linux (CI). Exit 1 on any mismatch — CI-gating.
const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const HOOK = path.join(ROOT, '.claude', 'hooks', 'protect-paths.js');
const AUDIT = path.join(ROOT, '.claude', 'hooks', 'session-audit.js');

const tests = [
  { name: 'deny : Edit docs/CHARTER.md (absolute path)', payload: { tool_name: 'Edit', tool_input: { file_path: path.join(ROOT, 'docs', 'CHARTER.md') } }, expect: 'deny' },
  { name: 'deny : Write CLAUDE.md', payload: { tool_name: 'Write', tool_input: { file_path: path.join(ROOT, 'CLAUDE.md') } }, expect: 'deny' },
  { name: 'deny : Write into .claude/hooks/', payload: { tool_name: 'Write', tool_input: { file_path: path.join(ROOT, '.claude', 'hooks', 'sneaky.js') } }, expect: 'deny' },
  { name: 'deny : Edit .claude/settings.json', payload: { tool_name: 'Edit', tool_input: { file_path: path.join(ROOT, '.claude', 'settings.json') } }, expect: 'deny' },
  { name: 'ask  : create amendment token', payload: { tool_name: 'Write', tool_input: { file_path: path.join(ROOT, '.claude', 'AMENDMENT') } }, expect: 'ask' },
  { name: 'allow: Edit docs/STATUS.md', payload: { tool_name: 'Edit', tool_input: { file_path: path.join(ROOT, 'docs', 'STATUS.md') } }, expect: 'allow' },
  { name: 'allow: Write src file (future code)', payload: { tool_name: 'Write', tool_input: { file_path: path.join(ROOT, 'src', 'core', 'reducer.ts') } }, expect: 'allow' },
  { name: 'ask  : Bash touching charter', payload: { tool_name: 'Bash', tool_input: { command: 'git add docs/CHARTER.md' } }, expect: 'ask' },
  { name: 'allow: Bash innocent', payload: { tool_name: 'Bash', tool_input: { command: 'npm test' } }, expect: 'allow' },
  { name: 'allow: Bash read-only on protected (cat)', payload: { tool_name: 'Bash', tool_input: { command: 'cat docs/CHARTER.md' } }, expect: 'allow' },
  { name: 'ask  : unparseable input fails VISIBLE', raw: '{"tool_name":"Edit","tool_input":{"file_path":"C:\\Webs\\broken', expect: 'ask' },
];

function decisionOf(stdout) {
  const s = stdout.trim();
  if (!s) return 'allow';
  try {
    return JSON.parse(s).hookSpecificOutput.permissionDecision;
  } catch {
    return 'UNPARSEABLE-HOOK-OUTPUT';
  }
}

let failed = 0;
for (const t of tests) {
  const input = t.raw !== undefined ? t.raw : JSON.stringify(t.payload);
  const res = spawnSync(process.execPath, [HOOK], { input, encoding: 'utf8', cwd: ROOT, timeout: 10000 });
  const got = res.status === 0 ? decisionOf(res.stdout) : 'EXIT-' + res.status;
  const ok = got === t.expect;
  if (!ok) failed++;
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + t.name + '  [expected ' + t.expect + ', got ' + got + ']');
  if (!ok && res.stderr) console.log('      stderr: ' + res.stderr.trim());
}

// Smoke-test the stop audit: must exit 0 and emit either nothing or valid JSON.
const audit = spawnSync(process.execPath, [AUDIT], { input: '{}', encoding: 'utf8', cwd: ROOT, timeout: 10000 });
let auditOk = audit.status === 0;
if (auditOk && audit.stdout.trim()) {
  try { JSON.parse(audit.stdout); } catch { auditOk = false; }
}
if (!auditOk) failed++;
console.log((auditOk ? 'PASS' : 'FAIL') + '  smoke: session-audit exits 0 with valid/empty output');

console.log('');
if (failed) {
  console.error('GOVERNANCE SELF-TEST FAILED: ' + failed + ' case(s). The law is not enforcing as written.');
  process.exit(1);
}
console.log('Governance self-test: all ' + (tests.length + 1) + ' cases green.');
