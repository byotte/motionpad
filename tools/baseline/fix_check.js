#!/usr/bin/env node
// 검수 오류 재현 시험(작업지시서 0-4). node tools/baseline/fix_check.js [대상.html] [e1 e2 e3 e4 e5 e6 ...]
// 항목을 안 주면 전부. 각 항목은 '정상이면 통과'로 적혀 있다(고치기 전에는 실패해야 한다).
'use strict';
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), cp = require('child_process');
const ROOT = path.resolve(__dirname, '../..'), OUT = path.join(__dirname, 'out/fix');
fs.mkdirSync(OUT, { recursive: true });
const argv = process.argv.slice(2), TARGET = path.resolve(argv.find(a => a.endsWith('.html')) || path.join(ROOT, 'motionpad.html'));
const ONLY = argv.filter(a => !a.endsWith('.html'));
const rafs = (p, n) => p.evaluate(n => new Promise(r => { let k = 0; const f = () => ++k >= n ? r() : requestAnimationFrame(f); requestAnimationFrame(f); }), n);
const dataURL = f => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
const FIXTURE = path.join(__dirname, 'fixtures', 'character.png');
const ZONE = { name: '영역 1', kind: 'ellipse', x: .5, y: .45, rx: .15, ry: .12, strength: 26 };
const QUAD = path.join(OUT, 'quad2600.png');
if (!fs.existsSync(QUAD)) cp.execFileSync('python3', ['-I', '-c', `
import sys
from PIL import Image
W=2600;im=Image.new("RGB",(W,W))
for (x,y,c) in [(0,0,(220,30,30)),(1,0,(30,200,40)),(0,1,(30,60,220)),(1,1,(240,220,30))]: im.paste(c,(x*W//2,y*W//2,(x+1)*W//2,(y+1)*W//2))
im.save(sys.argv[1])`, QUAD]);
const EYE = (cx, cy) => ({ points: [{ x: cx - .05, y: cy }, { x: cx + .05, y: cy }, { x: cx, y: cy - .02 }, { x: cx, y: cy + .02 }], protection: [], cover: 24, curve: 0 });
function project(image, zones, extra) {
  return { format: 'motionpad-project', version: 2, image, audio: null, zones: zones || [], extra: Object.assign({
    blink: { eyes: [EYE(.62, .2), EYE(.85, .2)], speed: 100, interval: 1 },
    faces: { on: true, list: [{ mouth: { l: { x: .68, y: .32 }, r: { x: .8, y: .32 }, c: { x: .74, y: .34 } }, brows: [[{ x: .57, y: .15 }, { x: .67, y: .15 }], [{ x: .8, y: .15 }, { x: .9, y: .15 }]] }] },
    ambient: { enabled: true, breath: 0, sway: 0, face: '0:shy', faceAmt: 100 } }, extra || {}) };
}
async function openProject(page, proj, name) {
  const f = path.join(OUT, name + '.motionpad.json'); fs.writeFileSync(f, JSON.stringify(proj));
  await page.setInputFiles('#backupFile', f); await page.waitForSelector('.workspace:not([hidden])'); await rafs(page, 6);
  await page.evaluate(() => { for (const d of document.querySelectorAll('aside details')) d.open = true; }); await rafs(page, 2);
}
async function newPage(browser, vp) {
  const { isMobile, hasTouch, ...size } = vp || { width: 1200, height: 900 };
  const ctx = await browser.newContext({ viewport: size, isMobile: !!isMobile, hasTouch: !!hasTouch, acceptDownloads: true }), page = await ctx.newPage(), errors = [];
  await ctx.addInitScript(() => { try { Object.defineProperty(window, 'showSaveFilePicker', { value: undefined }); } catch (_) {} });
  page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  await page.goto('file://' + TARGET); page.errors = errors; return page;
}
const results = [];
const report = (id, ok, info) => { results.push({ id, ok }); console.log((ok ? '통과' : '실패'), id, info || ''); };
const tests = {

  // B: 동그라미 0개, PC는 올리면 안내줄에 설명·떠나면 원래 안내, 폰은 이름을 누르면, 입 찍기 중에는 순서 안내가 그대로
  async b(browser) {
    const page = await newPage(browser);
    await openProject(page, project(dataURL(FIXTURE), [ZONE], {}), 'b');
    const st = () => page.evaluate(() => { const l = document.querySelector('.guideLine .helpLayer'); return { dots: document.querySelectorAll('.helpDot,#localHelp,[data-help]:not([data-help-short])').length, help: l && !l.hidden ? l.querySelector('.helpText').textContent : '', status: document.getElementById('status').textContent }; });
    await page.evaluate(() => { document.getElementById('status').textContent = '원래 안내'; });
    const row = page.locator('[data-help-short]').filter({ hasText: '경계 부드러움' }).first();
    await row.hover(); await page.waitForTimeout(350); const a = await st();
    await page.mouse.move(5, 5); await page.waitForTimeout(350); const b = await st();
    await page.evaluate(() => document.getElementById('faceOnInput').click()); await rafs(page, 2);
    await page.evaluate(() => document.getElementById('faceMouthMode').click()); await rafs(page, 2);
    const prompt = (await st()).status;
    await row.hover(); await page.waitForTimeout(350); const c = await st();
    await page.context().close();
    const phone = await newPage(browser, { width: 390, height: 844, isMobile: true, hasTouch: true });
    await openProject(phone, project(dataURL(FIXTURE), [ZONE], {}), 'b');
    const name = phone.locator('[data-help-short] .helpName, summary.helpName').filter({ hasText: '경계 부드러움' }).first();
    await name.tap(); await phone.waitForTimeout(200);
    const d = await phone.evaluate(() => { const l = document.querySelector('.guideLine .helpLayer'); return l && !l.hidden ? l.querySelector('.helpText').textContent : ''; });
    report('b', a.dots === 0 && a.help && !b.help && b.status && b.status !== a.help && !c.help && c.status === prompt && d, `동그라미 ${a.dots} · 올림 '${a.help}' · 떠남 '${b.help}'/${b.status} · 입 찍기 중 '${c.help}' 안내 '${c.status}' · 폰 이름 누름 '${d}'`);
  },

  // A-8: 숫자는 기준값과 다를 때만 강조색(영역 = 프리셋 값, 몸체 = 기본값)
  async a8(browser) {
    const page = await newPage(browser);
    await openProject(page, project(dataURL(FIXTURE), [Object.assign({}, ZONE, { preset: 'jelly', strength: 30, spring: 17, damping: 55, ripple: 13, feather: 17, spread: 10, breath: 0 })], { ambient: { enabled: true, breath: 35, sway: 30, face: '', faceAmt: 50 } }), 'a8');
    const st = () => page.evaluate(() => { const c = id => document.getElementById(id).classList.contains('changed'), col = id => getComputedStyle(document.getElementById(id)).color;
      return { strength: c('strengthValue'), breath: c('ambientBreathVal'), feather: c('featherValue'), changedN: document.querySelectorAll('aside output.changed').length, plain: col('springValue'), hot: col('strengthValue') }; });
    const a = await st();
    await page.evaluate(() => { const e = document.getElementById('strengthInput'); e.value = 44; e.dispatchEvent(new Event('input', { bubbles: true })); const b = document.getElementById('ambientBreath'); b.value = 60; b.dispatchEvent(new Event('input', { bubbles: true })); });
    const b = await st();
    report('a8', !a.strength && !a.breath && !a.feather && a.changedN === 0 && b.strength && b.breath && b.hot !== b.plain, `처음 강조 ${a.changedN}개 · 바꾼 뒤 세기 ${b.strength} 호흡 ${b.breath} · 색 ${b.plain} → ${b.hot}`);
  },

  // A-6: 스위치 표시와 도구 표시가 어느 상태에서나 맞는지(만져 보기 ⇔ 켜진 도구 표시 없음), 켜진 도구를 다시 눌러도 그대로인지
  async a6(browser) {
    const page = await newPage(browser);
    await openProject(page, project(dataURL(FIXTURE), [ZONE], {}), 'a6');
    const st = () => page.evaluate(() => { const on = document.getElementById('touchTestBtn').getAttribute('aria-pressed') === 'true';
      const shown = [...document.querySelectorAll('.mode.active')].filter(b => b.offsetParent && getComputedStyle(b).boxShadow !== 'none').map(b => b.id);
      return { on, shown, mode: window.MotionPadDebug?.state?.().mode }; });
    const ok = r => r.on ? r.shown.length === 0 : r.shown.length === 1;
    const log = [];
    const step = async (name, fn) => { if (fn) await fn(); await rafs(page, 2); const r = await st(); log.push(name + ':' + (r.on ? '만져 보기' : '편집') + '/' + (r.shown.join(',') || '-')); return ok(r); };
    let all = await step('연 뒤');
    all = await step('올가미', () => page.click('#lassoMode')) && all;
    all = await step('올가미 다시', () => page.click('#lassoMode')) && all;
    const stillLasso = (await st()).shown[0] === 'lassoMode';
    all = await step('스위치', () => page.click('#touchTestBtn')) && all;
    all = await step('스위치 다시', () => page.click('#touchTestBtn')) && all;
    all = await step('옵션 조작', () => page.evaluate(() => { const e = document.getElementById('strengthInput'); e.value = 50; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); })) && all;
    all = await step('도구로', () => page.click('#wandMode')) && all;
    all = await step('플레이 갔다 옴', async () => { await page.click('#viewerBtn'); await rafs(page, 4); await page.click('#exitViewer'); }) && all;
    all = await step('스위치(편집으로)', () => page.click('#touchTestBtn')) && all;
    all = await step('축 지정 중', () => page.evaluate(() => document.getElementById('pivotMode').click())) && all;
    all = await step('화면 이동', () => page.evaluate(() => { document.getElementById('panMode').click(); })) && all;
    report('a6', all && stillLasso && !page.errors.length, log.join(' · ') + (stillLasso ? '' : ' · 켜진 도구를 다시 누르자 꺼짐') + (page.errors[0] || ''));
  },

  // L7: 내보내기 창의 버튼이 자기 상자 안에
  async l7(browser) {
    const page = await newPage(browser);
    await page.setInputFiles('#imageFile', FIXTURE); await page.waitForSelector('.workspace:not([hidden])');
    const r = await page.evaluate(() => { const ways = [...document.querySelectorAll('#videoDialog .exportWay')]; return { save: ways[0]?.contains(document.getElementById('exportVideoBtn')), live: ways[1]?.contains(document.getElementById('liveRecBtn')), cancel: ways[0]?.contains(document.getElementById('cancelVideoBtn')) }; });
    report('l7', r.save && r.live && r.cancel, JSON.stringify(r));
  },
  // L8: 도구를 바꿔도 그림 자리가 그대로(PC·폰)
  async l8(browser) {
    for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844, isMobile: true, hasTouch: true }]) {
      const page = await newPage(browser, vp);
      await page.setInputFiles('#imageFile', FIXTURE); await page.waitForSelector('.workspace:not([hidden])'); await rafs(page, 3);
      const rects = [];
      for (const id of ['moveMode', 'wandMode', 'panMode', 'lassoMode', 'brushMode', 'touchTestBtn']) {
        await page.evaluate(id => document.getElementById(id)?.click(), id); await rafs(page, 3);
        rects.push(await page.evaluate(() => { const b = document.getElementById('stage').getBoundingClientRect(); return [Math.round(b.top), Math.round(b.height)].join(','); }));
      }
      report('l8-' + vp.width, new Set(rects).size === 1, rects.join(' / '));
      await page.context().close();
    }
  },
  // L10·L11: 폰 아래 빈 띠 없음, 되돌리기·다시 실행·확대·축소 가로 44px 이상·되돌리기와 다시 실행 사이 6px 이상
  async l10(browser) {
    for (const vp of [{ width: 390, height: 844 }, { width: 344, height: 882 }]) {
      const page = await newPage(browser, Object.assign({ isMobile: true, hasTouch: true }, vp));
      await page.setInputFiles('#imageFile', FIXTURE); await page.waitForSelector('.workspace:not([hidden])'); await rafs(page, 3);
      const r = await page.evaluate(() => { const q = id => document.getElementById(id).getBoundingClientRect(), side = document.querySelector('.side').getBoundingClientRect();
        return { gap: Math.round(innerHeight - side.bottom), scroll: document.documentElement.scrollHeight - innerHeight, w: ['undoBtn', 'redoBtn', 'zoomOutBtn', 'zoomInBtn'].map(i => Math.round(q(i).width)), between: Math.round(q('redoBtn').left - q('undoBtn').right), rows: Math.round(document.querySelector('.stagebottom').getBoundingClientRect().height) }; });
      report('l10-' + vp.width, r.gap === 0 && r.scroll === 0, `아래 빈 띠 ${r.gap}px · 화면 넘침 ${r.scroll}px`);
      report('l11-' + vp.width, r.w.every(w => w >= 44) && r.between >= 6, `버튼 너비 ${r.w.join('·')} · 되돌리기~다시 실행 ${r.between}px · 아래 줄 높이 ${r.rows}px`);
      await page.context().close();
    }
  },

  // E2: 얼굴을 덮는 영역의 '빈자리 채우기'(tailCutout)를 켜도 표정·홍조가 보여야 한다(볼 자리 색이 표정 없음과 달라야 함)
  async e2(browser) {
    const P = (x, y) => ({ x: x / 800, y: y / 1000 });
    const eye = (cx) => ({ points: [P(cx - 30, 400), P(cx + 30, 400), P(cx, 372), P(cx, 428)], protection: [], cover: 24, curve: 0 });
    const faceExtra = face => ({ blink: { eyes: [eye(345), eye(450)], speed: 100, interval: 10 },
      faces: { on: true, list: [{ mouth: { l: P(385, 465), r: P(415, 465), c: P(400, 472) }, brows: [[P(315, 358), P(350, 352), P(385, 355)], [P(415, 355), P(450, 352), P(485, 358)]] }] },
      ambient: { enabled: true, breath: 0, sway: 0, face, faceAmt: 100 } });
    const grab = page => page.evaluate(() => new Promise(r => requestAnimationFrame(() => { const v = document.getElementById('view'), c = document.createElement('canvas'); c.width = 200; c.height = 250; const g = c.getContext('2d'); g.drawImage(v, 0, 0, 200, 250);
      r([...g.getImageData(76, 108, 14, 12).data]); })));// 볼(왼쪽 볼터치 자리)
    const out = {};
    for (const cut of [false, true]) for (const face of ['0:shy', '']) {
      const page = await newPage(browser);
      const zone = Object.assign({}, ZONE, { x: .5, y: .42, rx: .17, ry: .15, tailCutout: cut, strength: 0 });
      await openProject(page, project(dataURL(FIXTURE), [zone], faceExtra(face)), 'e2'); await rafs(page, 20);
      out[cut + face] = await grab(page);
      if (page.errors.length) console.log('  오류', page.errors[0]);
      await page.context().close();
    }
    const diff = (a, b) => { let d = 0; for (let i = 0; i < a.length; i += 4) d += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]); return d / (a.length / 4); };
    const plain = diff(out['false0:shy'], out['false']), cut = diff(out['true0:shy'], out['true']);
    report('e2', plain > 4 && cut > 4, `볼 자리 평균 색 차이: 일반 ${plain.toFixed(1)} · 빈자리 채우기 ${cut.toFixed(1)} (정상 = 둘 다 4 넘음)`);
  },

  // E3: 입 찍기 중 되돌리기로 얼굴이 사라진 뒤 그림을 세 번 누르면 오류가 나는지
  async e3(browser) {
    const page = await newPage(browser);
    await page.setInputFiles('#imageFile', FIXTURE); await page.waitForSelector('.workspace:not([hidden])'); await rafs(page, 3);
    await page.evaluate(() => { const f = document.getElementById('faceOnInput'); if (!f.checked) f.click(); }); await rafs(page, 2);
    await page.evaluate(() => document.getElementById('faceMouthMode').click()); await rafs(page, 2);
    await page.locator('#undoBtn').click(); await rafs(page, 2);
    const box = await page.locator('#view').boundingBox();
    for (const [x, y] of [[.4, .5], [.6, .5], [.5, .55]]) { await page.mouse.click(box.x + box.width * x, box.y + box.height * y); await rafs(page, 2); }
    report('e3', !page.errors.length, page.errors.length ? '오류 ' + page.errors[0] : '오류 0');
  },
  // E4: 세기를 바꾼 뒤 다른 막대에 초점만 줬다 빼면, 되돌리기 한 번에 세기가 돌아와야 한다
  async e4(browser) {
    const page = await newPage(browser);
    await openProject(page, project(dataURL(FIXTURE), [ZONE], {}), 'e4');
    await page.focus('#strengthInput');
    await page.evaluate(() => { const e = document.getElementById('strengthInput'); e.value = 40; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.focus('#ambientBreath'); await page.evaluate(() => document.getElementById('ambientBreath').blur());
    await page.locator('#undoBtn').click(); await rafs(page, 2);
    const v = await page.evaluate(() => document.getElementById('strengthInput').value);
    report('e4', v === '26', '되돌리기 한 번 뒤 세기 ' + v + ' (정상 = 26)');
  },
  // E5: 영역 세기를 바꾼 뒤 표정 창을 열면 창의 되돌리기는 꺼져 있어야 한다
  async e5(browser) {
    const page = await newPage(browser);
    await openProject(page, project(dataURL(FIXTURE), [ZONE], {}), 'e5');
    await page.focus('#strengthInput');
    await page.evaluate(() => { const e = document.getElementById('strengthInput'); e.value = 55; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.evaluate(() => document.querySelector('#exprList .chip').click()); await rafs(page, 3);
    const st = await page.evaluate(() => ({ open: document.getElementById('exprDialog').open, dis: document.getElementById('exprUndo').disabled }));
    await page.evaluate(() => document.getElementById('exprUndo').click()); await rafs(page, 2);
    const v = await page.evaluate(() => document.getElementById('strengthInput').value);
    // 창 안에서 바꾼 것은 되돌려져야 한다
    const inner = await page.evaluate(() => { const r = document.querySelector('#exprDialog .exprSettings input[type=range]'); const before = r.value; r.value = String(Number(r.min) + (Number(r.max) - Number(r.min)) * .8 | 0); r.dispatchEvent(new Event('input', { bubbles: true })); r.dispatchEvent(new Event('change', { bubbles: true }));
      const on = !document.getElementById('exprUndo').disabled; document.getElementById('exprUndo').click(); return { on, back: r.value === before, before, after: r.value }; });
    report('e5-창 안', inner.on && inner.back, JSON.stringify(inner));
    report('e5', st.open && st.dis && v === '55', `창 열림 ${st.open} · 되돌리기 꺼짐 ${st.dis} · 누른 뒤 세기 ${v} (정상 = 55)`);
  },
  // E6: 새 그림을 열면 움직임 설정은 기본값, 소리 크기는 그대로
  async e6(browser) {
    const page = await newPage(browser);
    await openProject(page, project(dataURL(FIXTURE), [ZONE], { ambient: { enabled: true, breath: 80, sway: 70, face: '', faceAmt: 50 }, base: { clip: true, exclude: true, edge: 6 }, sfxVolume: 60 }), 'e6');
    await page.setInputFiles('#imageFile', FIXTURE); await rafs(page, 6);
    const st = await page.evaluate(() => ({ breath: document.getElementById('ambientBreath').value, sway: document.getElementById('ambientSway').value, clip: document.getElementById('baseClipInput').checked, sfx: document.getElementById('sfxVolume').value }));
    report('e6', st.breath === '35' && st.sway === '30' && !st.clip && st.sfx === '60', JSON.stringify(st) + ' (정상 = 35·30·false·60)');
  },
  // E1: 원본 크기 녹화 중 깜빡임이 그림 왼쪽 위에 줄어든 그림을 덮는지
  async e1(browser) {
    const page = await newPage(browser);
    await openProject(page, project(dataURL(QUAD), [], {}), 'e1');
    await page.evaluate(() => { document.getElementById('videoDuration').value = '3'; document.getElementById('videoFPS').value = '15'; document.querySelector('input[name="videoSize"][value="orig"]').checked = true; });
    await page.evaluate(() => document.querySelector('[data-dialog="videoDialog"]').click()); await rafs(page, 3);
    const dl = page.waitForEvent('download', { timeout: 600000 }).catch(() => null);
    await page.locator('#exportVideoBtn').click();
    await page.waitForFunction(() => /영상 녹화|실패|못했/.test(document.getElementById('videoProgress').textContent), null, { timeout: 180000 });
    await page.waitForTimeout(3000);
    const px = await page.evaluate(() => new Promise(r => requestAnimationFrame(() => { const c = document.createElement('canvas'); c.width = c.height = 100; const g = c.getContext('2d'); g.drawImage(document.getElementById('view'), 0, 0, 100, 100); r([...g.getImageData(45, 45, 1, 1).data].slice(0, 3)); })));
    await dl;
    report('e1', px[0] > 150 && px[1] < 120 && px[2] < 120, '(45,45) 색 ' + px.join(',') + ' (정상 = 빨강)' + (page.errors.length ? ' 오류 ' + page.errors[0] : ''));
  },
};
(async () => {
  const browser = await chromium.launch();
  for (const [id, fn] of Object.entries(tests)) if (!ONLY.length || ONLY.includes(id)) {
    try { await fn(browser); } catch (e) { report(id, false, '예외 ' + String(e).slice(0, 300)); }
  }
  await browser.close();
  const bad = results.filter(r => !r.ok); console.log(bad.length ? `실패 ${bad.length}건` : '모두 통과'); process.exit(bad.length ? 1 : 0);
})();
