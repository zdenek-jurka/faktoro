/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const TARGET_DIRS = ['app', 'components', 'hooks', 'repositories', 'utils'];
const ALLOWED_FILES = new Set([path.join('constants', 'theme.ts')]);
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);
const HEX_PATTERN = /#[0-9A-Fa-f]{3,8}\b/g;

function walk(dir, out) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, out);
      continue;
    }
    const ext = path.extname(entry.name);
    if (SOURCE_EXTENSIONS.has(ext)) out.push(fullPath);
  }
}

const files = [];
for (const dir of TARGET_DIRS) {
  const full = path.join(ROOT, dir);
  if (fs.existsSync(full)) walk(full, files);
}

const findings = [];
for (const file of files) {
  const relative = path.relative(ROOT, file);
  if (ALLOWED_FILES.has(relative)) continue;
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const matches = line.match(HEX_PATTERN);
    if (!matches) continue;
    findings.push({
      file: relative,
      line: i + 1,
      values: [...new Set(matches)],
    });
  }
}

if (findings.length === 0) {
  console.log('No hardcoded hex colors found outside constants/theme.ts');
  process.exit(0);
}

console.log(`Found ${findings.length} lines with hardcoded hex colors:`);
for (const finding of findings.slice(0, 200)) {
  console.log(`${finding.file}:${finding.line} -> ${finding.values.join(', ')}`);
}

if (findings.length > 200) {
  console.log(`... ${findings.length - 200} more`);
}
