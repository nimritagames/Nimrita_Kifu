#!/usr/bin/env node
// Nimrita_Kifu governance: stop-time audit (Stop hook).
// Surfaces an uncommitted tree to the user whenever Claude stops responding,
// so the CLAUDE.md session-end rule (clean tree, current STATUS.md) is visible
// to the human reviewer, not merely promised by the model.
const { execSync } = require('child_process');

let dirty = '';
try {
  dirty = execSync('git status --porcelain', { encoding: 'utf8', timeout: 8000 }).trim();
} catch {
  process.exit(0);
}
if (dirty) {
  const n = dirty.split('\n').length;
  process.stdout.write(JSON.stringify({
    systemMessage: 'Kifu governance: working tree has ' + n + ' uncommitted change(s). CLAUDE.md requires a clean tree + current STATUS.md before the session ends.',
  }));
}
process.exit(0);
