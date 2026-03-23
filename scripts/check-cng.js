#!/usr/bin/env node

const { execSync } = require('node:child_process');
const { readFileSync } = require('node:fs');

function fail(message) {
  console.error(`[check:cng] ${message}`);
  process.exit(1);
}

function assertGitignoreContainsNativeIgnores() {
  const gitignore = readFileSync('.gitignore', 'utf8');
  for (const entry of ['/ios', '/android']) {
    if (!gitignore.includes(entry)) {
      fail(`Missing "${entry}" in .gitignore (required for CNG workflow).`);
    }
  }
}

function assertNoTrackedNativeFolders() {
  const tracked = execSync('git ls-files ios android', { encoding: 'utf8' }).trim();
  if (tracked.length > 0) {
    fail(`Tracked native files detected:\n${tracked}`);
  }
}

try {
  assertGitignoreContainsNativeIgnores();
  assertNoTrackedNativeFolders();
  console.log('[check:cng] OK');
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
