"""grid.js --images 결과로 확대 비교 그림을 만든다(원본 크기 기준).
  python3 tools/select/grid_crops.py  →  tools/select/out/grid/<이름>.png
각 그림: 왼쪽부터 768 계산 그대로 / 384 저장(지금) / 1024 저장. 오려낸 모양을 자홍 바탕 위에 3배 확대.
확대 위치는 384와 768 그대로가 가장 많이 다른 곳."""
import json, os, sys
import numpy as np
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
D = os.path.join(HERE, 'out', 'grid')
man = json.load(open(os.path.join(D, 'manifest.json')))
C, Z = 72, 3
for m in man:
    W, H = m['W'], m['H']
    raw = np.fromfile(m['bin'], dtype=np.uint8).reshape(3, H, W)
    img = np.asarray(Image.open(m['src']).convert('RGB')).astype(np.float32)
    diff = (raw[0] != raw[1]).astype(np.float32)
    # C×C 창에서 다른 픽셀이 가장 많은 곳
    ii = diff.cumsum(0).cumsum(1)
    s = ii[C:, C:] - ii[:-C, C:] - ii[C:, :-C] + ii[:-C, :-C]
    y, x = np.unravel_index(np.argmax(s), s.shape)
    panels = []
    for k in range(3):
        a = raw[k, y:y + C, x:x + C, None].astype(np.float32)
        crop = img[y:y + C, x:x + C] * a + np.array([235, 60, 200]) * (1 - a)
        panels.append(Image.fromarray(crop.astype(np.uint8)).resize((C * Z, C * Z), Image.NEAREST))
    out = Image.new('RGB', (C * Z * 3 + 16, C * Z), 'white')
    for k, p in enumerate(panels): out.paste(p, (k * (C * Z + 8), 0))
    out.save(os.path.join(D, os.path.basename(m['bin'])[:-4] + '.png'))
    print(m['label'], (x, y))
