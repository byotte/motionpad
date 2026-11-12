"""기준선 비교기 (개발용).
사용: python3 tools/baseline/compare.py <기준 폴더> <새 폴더>
  예) python3 tools/baseline/compare.py tools/baseline/out/legacy tools/baseline/out/step0-2
- 같은 이름의 스크린샷을 픽셀 비교해 달라진 비율(%)을 보여 주고, 차이 그림을 <새 폴더>/diff/ 에 저장한다.
- results.json 의 저장 왕복·선택 결과·성능 수치를 나란히 보여 준다.
"""
import json, os, sys
from PIL import Image, ImageChops

a_dir, b_dir = sys.argv[1], sys.argv[2]
diff_dir = os.path.join(b_dir, 'diff')
os.makedirs(diff_dir, exist_ok=True)

print('## 스크린샷 (달라진 픽셀 비율, 채널 차 > 16. 재실행 잡음 0.1% 이하)')
for name in sorted(f for f in os.listdir(a_dir) if f.endswith('.png')):
    pb = os.path.join(b_dir, name)
    if not os.path.exists(pb):
        print(f'  {name}: 새 결과에 없음')
        continue
    ia, ib = Image.open(os.path.join(a_dir, name)).convert('RGB'), Image.open(pb).convert('RGB')
    if ia.size != ib.size:
        print(f'  {name}: 크기 다름 {ia.size} → {ib.size}')
        continue
    d = ImageChops.difference(ia, ib).convert('L')
    changed = sum(d.point(lambda v: 255 if v > 16 else 0).histogram()[255:])
    pct = 100 * changed / (ia.size[0] * ia.size[1])
    mark = '' if pct < 0.2 else '  ← 확인'
    print(f'  {name}: {pct:.2f}%{mark}')
    if pct >= 0.2:
        out = ia.copy()
        out.paste((255, 0, 0), mask=d.point(lambda v: 255 if v > 16 else 0))
        out.save(os.path.join(diff_dir, name))

ra = json.load(open(os.path.join(a_dir, 'results.json')))
rb = json.load(open(os.path.join(b_dir, 'results.json')))

def row(label, x, y):
    print(f'  {label:<28} {str(x):>14}  →  {str(y):>14}')

print('\n## 저장 왕복')
for k in ('version', 'imageIdentical', 'settingsIdentical', 'fileBytes'):
    row(k, ra['roundtrip'].get(k), rb['roundtrip'].get(k))
print('\n## 선택 결과 (영역 이름 / 픽셀 수)')
for za, zb in zip(ra['roundtrip']['zones'], rb['roundtrip']['zones']):
    row(za['name'], za['area'], zb['area'])
print('\n## 성능 (헤드리스 기준, 같은 기계에서만 비교)')
pa, pb2 = ra['perf'], rb['perf']
row('편집 화면 FPS', pa['editFps'], pb2['editFps'])
row('플레이 FPS', pa['playFps'], pb2['playFps'])
for k in ('featherDragFrameMs', 'spreadDragFrameMs'):
    row(k + ' 평균', pa[k]['avg'], pb2[k]['avg'])
    row(k + ' p95', pa[k]['p95'], pb2[k]['p95'])
if 'tailFeatherDragFrameMs' in pa and 'tailFeatherDragFrameMs' in pb2:
    row('외곽흔들기 켠 드래그 평균', pa['tailFeatherDragFrameMs']['avg'], pb2['tailFeatherDragFrameMs']['avg'])
for scen in ('sliderNormal', 'sliderTail', 'play2s'):
    fa = pa.get('profile', {}).get(scen, {}).get('inclusiveMs', {})
    fb = pb2.get('profile', {}).get(scen, {}).get('inclusiveMs', {})
    if fa or fb:
        print(f'  [{scen}] 함수 누적 ms')
        for k in sorted(set(fa) | set(fb)):
            if fa.get(k) or fb.get(k):
                row('   ' + k, fa.get(k), fb.get(k))
row('그림 열기 ms', ra.get('openImageMs'), rb.get('openImageMs'))
row('마술봉 ms', ra['selection'].get('wandMs'), rb['selection'].get('wandMs'))
row('간략 올가미 ms', ra['selection'].get('outlineMs'), rb['selection'].get('outlineMs'))
print('\n## 동작 확인')
row('슬라이더 뒤 활성 도구', pa.get('activeToolAfterSlider'), pb2.get('activeToolAfterSlider'))
row('옵션 조작 뒤 미리보기 유지', ra.get('previewKeep', {}).get('kept'), rb.get('previewKeep', {}).get('kept'))
print('\n## 오류')
row('페이지 오류 수', len(ra['errors']), len(rb['errors']))
for e in rb['errors'][:10]:
    print('   ', e)
