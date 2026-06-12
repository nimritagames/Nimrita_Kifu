#!/usr/bin/env node
// Nimrita_Kifu governance: protected-path guard (PreToolUse hook).
// The ONLY bypass is the amendment token (.claude/AMENDMENT) — and creating
// that token itself always surfaces to the user for explicit approval.
// Bypassing this rule therefore requires visibly changing the rule. By design.
const fs = require('fs');
const path = require('path');

const PROJECT = process.cwd();
const TOKEN = path.join(PROJECT, '.claude', 'AMENDMENT');
const TOKEN_REL = '.claude/amendment';
const PROTECTED = [
  'docs/charter.md',
  'claude.md',
  '.claude/settings.json',
  '.claude/project-tools.json',
  '.claude/hooks/',
];
const BASH_MENTIONS = [
  'charter.md',
  'claude.md',
  '.claude/hooks',
  '.claude\\hooks',
  '.claude/settings.json',
  '.claude/project-tools.json',
  '.claude/amendment',
];

function norm(p) {
  const rel = path.isAbsolute(p) ? path.relative(PROJECT, p) : p;
  return rel.split('\\').join('/').toLowerCase();
}
function isProtected(p) {
  const n = norm(p);
  return PROTECTED.some(pp => (pp.endsWith('/') ? n.startsWith(pp) : n === pp));
}
function out(decision, reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: decision,
      permissionDecisionReason: reason,
    },
  }));
}

let raw = '';
process.stdin.on('data', c => (raw += c));
process.stdin.on('end', () => {
  let input;
  try { input = JSON.parse(raw); } catch {
    // Fail VISIBLE, never open: if the guard cannot read its input it cannot
    // certify the target is unprotected, so it escalates to the user.
    out('ask', 'GOVERNANCE: protect-paths hook could not parse its input (' + raw.length + ' bytes) — failing visible instead of silently allowing. Please confirm this tool call manually.');
    return;
  }
  const tool = input.tool_name || '';
  const ti = input.tool_input || {};
  const tokenPresent = fs.existsSync(TOKEN);

  if (tool === 'Edit' || tool === 'Write' || tool === 'MultiEdit' || tool === 'NotebookEdit') {
    const target = ti.file_path || ti.notebook_path || '';
    if (!target) process.exit(0);
    if (norm(target) === TOKEN_REL) {
      out('ask', 'GOVERNANCE: creating/modifying the amendment token unlocks protected paths. The user must explicitly approve this — it is the act of changing the rule itself.');
      return;
    }
    if (isProtected(target)) {
      if (tokenPresent) {
        out('ask', 'Amendment token is active: change to protected path "' + target + '" proceeds only with user confirmation.');
      } else {
        out('deny', 'GOVERNANCE: "' + target + '" is a protected governance path (charter/operating contract/rules). Editing requires a user-ratified amendment: ask the user to approve creating .claude/AMENDMENT first. This denial is the rule working as designed — do not look for a workaround.');
      }
      return;
    }
    process.exit(0);
  }

  if (tool === 'Bash') {
    const cmd = String(ti.command || '').toLowerCase();
    const readOnly = /^\s*(git\s+(status|log|diff|show)\b|ls\b|cat\b|node\s+\.claude\/hooks\/)/.test(cmd);
    if (!tokenPresent && !readOnly && BASH_MENTIONS.some(m => cmd.includes(m))) {
      out('ask', 'GOVERNANCE: this shell command touches protected governance paths (charter/rules/hooks). User confirmation required — or ratify an amendment via .claude/AMENDMENT.');
      return;
    }
    process.exit(0);
  }

  process.exit(0);
});
