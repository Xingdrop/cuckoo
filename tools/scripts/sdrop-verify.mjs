#!/usr/bin/env node
/**
 * Sdrop 水印校验工具（布谷 Cuckoo）
 *
 * 水印格式（文件头注释）：
 *   @Sdrop 布谷(Cuckoo) v1 SKEY_<base64(payload)>
 * payload = "<项目名>|" + 相对仓库路径 + "|" + yyyy-MM
 *
 * 用法：
 *   node tools/scripts/sdrop-verify.mjs                 # 全库校验（git 跟踪的文本文件）
 *   node tools/scripts/sdrop-verify.mjs backend/src/main.ts   # 校验单个文件
 */

import { execSync } from 'node:child_process';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { relative, basename } from 'node:path';

const ROOT = process.cwd();
const MARK = '@Sdrop 布谷(Cuckoo) v1 SKEY_';
const PAYLOAD_RE = /SKEY_([A-Za-z0-9+/=]+)/;

function decodePayload(token) {
  try {
    return Buffer.from(token, 'base64').toString('utf8');
  } catch {
    return null;
  }
}

function verifyFile(file) {
  if (statSync(file).size > 4 * 1024 * 1024) return { file, ok: false, reason: 'too large' };
  const head = readFileSync(file, 'utf8').slice(0, 64 * 1024); // 只读文件头
  const m = head.match(PAYLOAD_RE);
  if (!m) return { file, ok: false, reason: 'no Sdrop mark' };
  const payload = decodePayload(m[1]);
  if (!payload) return { file, ok: false, reason: 'bad base64' };
  const [proj, rel, month] = payload.split('|');
  const expectRel = relative(ROOT, file).replace(/\\/g, '/');
  if (proj !== '布谷(Cuckoo)' || rel !== expectRel || !/^\d{4}-\d{2}$/.test(month ?? '')) {
    return { file, ok: false, reason: `payload mismatch (${payload})` };
  }
  return { file, ok: true };
}

const ANCHORS = [
  'backend/src/main.ts',
  'backend/src/app.module.ts',
  'frontend/src/main.tsx',
  'frontend/src/app/App.tsx',
];

function trackedFiles() {
  return execSync('git ls-files', { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .filter((f) => /\.(ts|tsx|js|jsx|mjs|css|md|ps1)$/.test(f))
    .filter((f) => !f.startsWith('.zcode/') && !f.startsWith('Plugin/') && !f.endsWith('.json'));
}

const targets = process.argv.slice(2);
// 无参数 = 校验锚点清单；--all = 全库扫描（抽查用）
const files = targets.length
  ? targets.map((t) => (existsSync(t) ? t : basename(t)))
  : targets.includes('--all')
    ? trackedFiles()
    : ANCHORS;

let pass = 0;
let fail = 0;
const failed = [];
for (const f of files) {
  if (!existsSync(f)) {
    failed.push({ file: f, reason: 'not found' });
    fail++;
    continue;
  }
  const r = verifyFile(f);
  if (r.ok) pass++;
  else {
    fail++;
    failed.push(r);
  }
}

console.log(`Sdrop verify: ${pass} PASS / ${fail} FAIL / total ${pass + fail}`);
if (failed.length) {
  console.log('-- failed --');
  for (const f of failed.slice(0, 20)) console.log(`  ${f.file} :: ${f.reason}`);
  console.log(failed.length > 20 ? `  ... and ${failed.length - 20} more` : '');
  process.exitCode = 1;
}
