#!/usr/bin/env node
// 디자인 누락 검사: tokens.css 밖의 CSS에 색·글자 크기·굵기·모서리 값이 직접 적혀 있으면 알려 준다(0건이 목표).
//   node tools/design/token_check.js
'use strict';
const fs = require('fs'), path = require('path');
const dir = path.resolve(__dirname, '../../src/css');
const rules = [
  ['색', /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|color-mix\(/],
  ['글자 크기', /font-size:\s*(?!var\(|inherit|0[;}])[^;}]+/],
  ['글자 굵기', /font-weight:\s*(?!var\(|inherit)[^;}]+/],
  ['글자(font 줄임)', /font:\s*(?!inherit)[^;}]*\d+px/],
  ['모서리', /border-radius:\s*(?!var\(|0[;} ]|50%)[^;}]+/],
];
let n = 0;
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.css') && f !== 'tokens.css')) {
  fs.readFileSync(path.join(dir, f), 'utf8').split('\n').forEach((line, i) => {
    if (/^\s*\/\*.*\*\/\s*$/.test(line)) return;
    for (const [name, re] of rules) { const m = line.replace(/\/\*.*?\*\//g, '').match(re); if (m) { n++; console.log(`${f}:${i + 1}  [${name}]  ${m[0].slice(0, 60)}`); } }
  });
}
console.log(n ? `직접 적힌 값 ${n}건` : '직접 적힌 값 0건');
process.exit(n ? 1 : 0);
