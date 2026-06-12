#!/usr/bin/env node
// Nimrita_Kifu docs-consistency gate (the pre-code `verify`).
// Checks the governance documents exist, agree with each other, and that the
// operating contract still mandates the rituals it claims to mandate.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

const failures = [];
const check = (cond, msg) => { if (!cond) failures.push(msg); };

let charter = '', status = '', claudeMd = '';
try { charter = read('docs/CHARTER.md'); } catch { failures.push('docs/CHARTER.md missing'); }
try { status = read('docs/STATUS.md'); } catch { failures.push('docs/STATUS.md missing'); }
try { claudeMd = read('CLAUDE.md'); } catch { failures.push('CLAUDE.md missing'); }
check(fs.existsSync(path.join(ROOT, 'docs', 'JOURNAL.md')), 'docs/JOURNAL.md missing');
check(fs.existsSync(path.join(ROOT, 'docs', 'phase0', '0-VERDICT.md')), 'docs/phase0/0-VERDICT.md missing');

// Charter identity and version agreement.
check(charter.includes('Nimrita_Kifu'), 'charter does not carry the framework name');
const charterVersion = (charter.match(/\*\*Version\*\*\s*\|\s*([\d.]+)/) || [])[1];
check(!!charterVersion, 'charter version not parseable from header table');
if (charterVersion) {
  check(status.includes('v' + charterVersion), 'STATUS.md charter version does not match CHARTER.md (' + charterVersion + ')');
}

// The contract must still mandate its own rituals.
check(claudeMd.includes('docs/STATUS.md'), 'CLAUDE.md no longer references the STATUS baton');
check(claudeMd.includes('JOURNAL.md'), 'CLAUDE.md no longer mandates the journal ritual');
check(claudeMd.includes('docs/CHARTER.md'), 'CLAUDE.md no longer names the charter as authority');

// Amendment hygiene: the transient token must never be committed.
check(!fs.existsSync(path.join(ROOT, '.claude', 'AMENDMENT')), 'amendment token present — ceremony left open');

if (failures.length) {
  console.error('DOCS VERIFY FAILED:');
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('Docs verify: charter v' + charterVersion + ', all governance documents present and consistent.');
