#!/usr/bin/env node
// Usage:
// node scripts/update-changelog.js --type=Changed --title="Fix X" --files=js/editor.js,js/app.js --notes="Improved tool behavior"

const fs = require('fs');
const path = require('path');

const changelogPath = path.resolve(__dirname, '..', 'CHANGELOG.md');

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {};
  args.forEach(arg => {
    const [key, value] = arg.split('=');
    if (!value) return;
    const normalized = key.replace(/^--/, '');
    result[normalized] = value;
  });
  return result;
}

function main() {
  const args = parseArgs();
  const type = args.type || 'Changed';
  const title = args.title || 'Update';
  const files = args.files || '';
  const notes = args.notes || '';

  const now = new Date();
  const date = now.toISOString().split('T')[0];

  if (!fs.existsSync(changelogPath)) {
    console.error('CHANGELOG.md not found at', changelogPath);
    process.exit(1);
  }

  const changelog = fs.readFileSync(changelogPath, 'utf8');
  const unreleasedHeader = '## [Unreleased]';
  const entry = `### ${type}\n- ${title} (${files})\n- ${notes}\n`;

  let head = changelog;
  if (changelog.includes(unreleasedHeader)) {
    const parts = changelog.split(unreleasedHeader);
    const before = parts.shift();
    const after = parts.join(unreleasedHeader);
    const updated = `${before}${unreleasedHeader}\n\n${entry}${after}`;
    head = updated;
  } else {
    head = `${unreleasedHeader}\n\n${entry}\n${changelog}`;
  }

  fs.writeFileSync(changelogPath, head, 'utf8');
  console.log('CHANGELOG updated successfully.');

  const memoryPath = path.resolve(__dirname, '..', 'memories', 'repo', 'livery-lab.md');
  if (fs.existsSync(memoryPath)) {
    const memoryAppend = `${date} - ${type} - ${title} - files: ${files} - ${notes}\n`;
    fs.appendFileSync(memoryPath, memoryAppend, 'utf8');
    console.log('Repo memory appended.');
  } else {
    console.warn('Repo memory path not found:', memoryPath);
  }
}

main();
