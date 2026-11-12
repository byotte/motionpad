#!/usr/bin/env node
// MotionPad 합치기: src/ 의 나뉜 파일을 단일 HTML(motionpad.html)로 만든다.
//
//   node tools/build.js            src/ → motionpad.html
//   node tools/build.js --check    다시 만들어 보고 motionpad.html과 다르면 실패(커밋 전 확인용)
//   node tools/build.js --watch    src/ 가 바뀔 때마다 다시 만든다(개발용)
//   node tools/build.js --out x.html
//
// 규칙(src/index.html 과 그 안에 들어가는 파일)
//   @@include 경로        이 줄 전체를 그 파일 내용으로 바꾼다(경로는 src/ 기준, 한 단계만).
//                          들어가는 파일은 반드시 줄바꿈으로 끝나야 한다.
//   @@base64(경로)        그 자리를 파일의 base64로 바꾼다(효과음 wav).
// JS는 index.html 의 <script> 안 즉시 실행 함수 하나에 순서대로 이어 붙는다.
// ES 모듈은 file:// 에서 막히므로 쓰지 않는다. 파일 사이 순서가 곧 실행 순서다.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const DEFAULT_OUT = path.join(ROOT, 'motionpad.html');

function read(rel, enc) {
  const file = path.join(SRC, rel);
  if (!file.startsWith(SRC + path.sep)) throw new Error(`src/ 밖의 경로: ${rel}`);
  return fs.readFileSync(file, enc);
}

function build() {
  const used = [];
  let out = read('index.html', 'utf8').replace(/^@@include[ \t]+(\S+)[ \t]*\n/gm, (_, rel) => {
    const text = read(rel, 'utf8');
    if (!text.endsWith('\n')) throw new Error(`${rel}: 마지막 줄바꿈이 없다`);
    if (text.includes('@@include')) throw new Error(`${rel}: 겹친 @@include는 지원하지 않는다`);
    used.push(rel);
    return text;
  });
  out = out.replace(/@@base64\(([^)]+)\)/g, (_, rel) => {
    used.push(rel);
    return read(rel).toString('base64');
  });
  const left = out.match(/@@\w+/);
  if (left) throw new Error(`처리되지 않은 지시어: ${left[0]}`);
  return { out, used };
}

function writeOnce(outFile) {
  const t = Date.now();
  const { out, used } = build();
  fs.writeFileSync(outFile, out);
  console.log(`${path.relative(ROOT, outFile)}  ${Buffer.byteLength(out)} bytes  (파일 ${used.length}개, ${Date.now() - t}ms)`);
}

const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const outFile = outIdx >= 0 ? path.resolve(args[outIdx + 1]) : DEFAULT_OUT;

try {
  if (args.includes('--check')) {
    const { out } = build();
    const now = fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8') : null;
    if (now === out) { console.log(`일치: ${path.relative(ROOT, outFile)}`); process.exit(0); }
    console.error(`불일치: ${path.relative(ROOT, outFile)} 가 src/ 와 다르다. node tools/build.js 로 다시 만들 것.`);
    process.exit(1);
  }
  writeOnce(outFile);
  if (args.includes('--watch')) {
    let timer = null;
    fs.watch(SRC, { recursive: true }, () => {
      clearTimeout(timer);
      timer = setTimeout(() => { try { writeOnce(outFile); } catch (e) { console.error('실패:', e.message); } }, 80);
    });
    console.log('src/ 감시 중… (Ctrl+C로 끝)');
  }
} catch (e) {
  console.error('실패:', e.message);
  process.exit(1);
}
