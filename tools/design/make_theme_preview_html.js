// 테마 후보 확인용 HTML 만들기 (배포본 아님): node tools/design/make_theme_preview_html.js <출력.html>
// motionpad.html 에 후보 색 6종을 넣고, 설정 창의 색상 테마를 6개로 늘린다. 눌러 보며 비교하는 용도.
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const OPTIONS = [['violet', 'A-1 다크'], ['light', 'A-2 라이트'], ['paper', 'A-3 종이 감성'], ['darkbasic', 'B-1 다크 베이직'], ['lightbasic', 'B-2 라이트 베이직'], ['mono', 'B-3 모노']];
let html = fs.readFileSync(path.join(ROOT, 'motionpad.html'), 'utf8');
let css = fs.readFileSync(path.join(__dirname, 'theme-candidates.css'), 'utf8');
// 설정 창의 견본 칸에도 색이 적용되도록 변수 정의 블록에 .themeSample 선택자를 추가
css = css.replace(/^:root\[data-theme="(\w+)"\]\{/gm, (m, t) => `:root[data-theme="${t}"],.themeSample[data-theme="${t}"]{`);
const radios = OPTIONS.map(([v, n]) => `<label>${n}<span class="themeSample" data-theme="${v}"><i></i></span><input type="radio" name="appTheme" value="${v}"></label>`).join('');
const a = html.match(/<fieldset class="themeOptions">.*?<\/fieldset>/s);
if (!a) throw new Error('테마 선택 영역을 찾지 못함');
html = html.replace(a[0], `<fieldset class="themeOptions"><legend>색상 테마 (미리보기 버전: 6종)</legend>${radios}</fieldset>`);
const list = "['violet','light','basic']";
if (!html.includes(list)) throw new Error('테마 허용 목록을 찾지 못함');
html = html.replace(list, JSON.stringify(OPTIONS.map(o => o[0])).replace(/"/g, "'"));
html = html.replace('</style>', css + '\n.themeOptions{grid-template-columns:repeat(3,minmax(0,1fr))}\n</style>');
html = html.replace('<title>', '<title>[테마 미리보기] ');
const out = path.resolve(process.argv[2] || 'motionpad-theme-preview.html');
fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, html); console.log(out, html.length);
