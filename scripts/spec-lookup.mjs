#!/usr/bin/env node
// Tra cứu yêu cầu/task theo ID mà không phải đọc cả SPEC.
// Dùng: node scripts/spec-lookup.mjs M9-03 R-01 R-03
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ids = process.argv.slice(2);
if (ids.length === 0) {
  console.error('Dùng: node scripts/spec-lookup.mjs <ID> [ID...]');
  process.exit(1);
}

const files = ['docs/SPEC.md', 'docs/ROADMAP.md', 'docs/QC-COVERAGE.md'];
if (existsSync('docs/proposals')) {
  for (const f of readdirSync('docs/proposals')) if (f.endsWith('.md')) files.push(join('docs/proposals', f));
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
let found = 0;

for (const id of ids) {
  // Khớp: dòng bảng "| R-01 |", task "**M9-03**", hoặc ID bị gạch "~~V-05~~"
  const re = new RegExp(`(^\\|\\s*(~~)?${escape(id)}(~~)?\\s*\\|)|(\\*\\*${escape(id)}\\*\\*)`);
  console.log(`\n=== ${id} ===`);
  let hit = false;
  for (const file of files) {
    if (!existsSync(file)) continue;
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (re.test(line)) {
        console.log(`[${file}:${i + 1}] ${line.trim()}`);
        hit = true;
        found++;
      }
    });
  }
  if (!hit) console.log('(không tìm thấy)');
}
process.exit(found ? 0 : 2);
