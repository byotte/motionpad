"""극단값 튐(접힘) 재현과 해법 비교. 셰이더의 연속 변형 식을 그대로 옮긴 모의 실험.
  python3 tools/motion/fold/sim.py  →  표 + tools/motion/out/fold/fold.png

상황(2-C.md): 얼굴 타원 영역을 오른쪽으로 크게 끈다. 영역 전체가 D만큼 이동(잡아당김 0%), 경계 흐림 띠는 좁다.
셰이더: 화면의 칸 x는 원본의 x - D*mask(x)를 가져온다. 띠에서 D*기울기 > 1이면 가져오는 순서가 뒤집힌다(접힘).
재는 것: 접힌 칸 수(그림 대비 %), 영역 안쪽의 평균 이동량(D 대비 %: 100이면 움직임이 줄지 않음).
방식: now = 지금 / cap = 2-C의 안(경계 폭에 맞춰 이동량을 줄임) / dist = 거리 기반(이동이 클 때만 띠가 바깥으로 넓어짐)
"""
from PIL import Image, ImageDraw, ImageFilter
import numpy as np, os
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '../../..'))
OUT = os.path.join(ROOT, 'tools/motion/out/fold'); os.makedirs(OUT, exist_ok=True)
TILE = 384
img = np.asarray(Image.open(os.path.join(ROOT, 'tools/baseline/fixtures/character.png')).convert('RGB')).astype(np.float32)
H, W = img.shape[:2]

def edt(binary):  # 정확한 거리(칸 단위), Felzenszwalb
    def one(f):
        n = len(f); d = np.zeros(n); v = np.zeros(n, int); z = np.zeros(n + 1); k = 0; v[0] = 0; z[0] = -1e18; z[1] = 1e18
        for q in range(1, n):
            while True:
                s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
                if s <= z[k]: k -= 1
                else: break
            k += 1; v[k] = q; z[k] = s; z[k + 1] = 1e18
        k = 0
        for q in range(n):
            while z[k + 1] < q: k += 1
            d[q] = (q - v[k]) ** 2 + f[v[k]]
        return d
    f = np.where(binary, 0.0, 1e12); f = np.apply_along_axis(one, 0, f); f = np.apply_along_axis(one, 1, f); return np.sqrt(f)

def sample(a, u, v):  # 쌍선형, u·v는 0~1
    h, w = a.shape[:2]; x = np.clip(u * w - .5, 0, w - 1); y = np.clip(v * h - .5, 0, h - 1)
    x0 = np.floor(x).astype(int); y0 = np.floor(y).astype(int); x1 = np.minimum(x0 + 1, w - 1); y1 = np.minimum(y0 + 1, h - 1)
    tx = x - x0; ty = y - y0
    if a.ndim == 3: tx = tx[..., None]; ty = ty[..., None]
    return (a[y0, x0] * (1 - tx) + a[y0, x1] * tx) * (1 - ty) + (a[y1, x0] * (1 - tx) + a[y1, x1] * tx) * ty

m = Image.new('L', (TILE, TILE), 0); ImageDraw.Draw(m).ellipse([.36 * TILE, .25 * TILE, .64 * TILE, .52 * TILE], fill=255)
raw = np.asarray(m) >= 128
signed = (edt(~raw) - edt(raw)) / TILE          # 안쪽 +, 바깥 -, 단위 = 그림 크기 비율(UV)
vv, uu = np.meshgrid((np.arange(H) + .5) / H, (np.arange(W) + .5) / W, indexing='ij')

def run(method, feather, D):
    blur = round(feather * .63)
    mask = np.asarray(m.filter(ImageFilter.GaussianBlur(blur)) if blur else m).astype(np.float32) / 255
    ma = sample(mask, uu, vv); dx = D
    safe = max(1.0, blur * 2.5) / TILE                    # 이 띠가 접히지 않고 버티는 이동량
    if method == 'now': eff = ma
    elif method == 'cap': eff = ma; dx = np.sign(D) * min(abs(D), safe)
    else:
        d = sample(signed, uu, vv); wid = 2.0 * abs(D)   # 띠 폭 = 이동량의 2배, 영역 바깥쪽으로
        t = np.clip((d + wid) / wid, 0, 1); md = t * t * (3 - 2 * t)
        k = np.clip((abs(D) - .5 * safe) / (.5 * safe), 0, 1); k = k * k * (3 - 2 * k)
        eff = ma * (1 - k) + md * k
    su = uu - np.clip(dx * eff, -.055, .055)
    fold = (np.diff(su, axis=1) < 0).mean() * 100
    inner = sample((signed > .01).astype(np.float32), uu, vv) > .5
    moved = (np.abs(uu - su)[inner].mean()) / abs(D) * 100
    return fold, moved, sample(img, su, vv)

print('경계 부드러움  이동량   방식   접힌 칸(%)  안쪽 이동(%)')
tiles = []
for feather in (0, 3, 10):
    for D in (.02, .055):
        row = []
        for method in ('now', 'cap', 'dist'):
            fold, moved, out = run(method, feather, D)
            print(f'{feather:>8}     {D:>5}   {method:<5}  {fold:8.3f}   {moved:8.1f}')
            if D == .055 and feather in (0, 3): row.append(out[int(.12 * H):int(.62 * H), int(.2 * W):int(.85 * W)])
        if row: tiles.append(np.concatenate(row, axis=1))
Image.fromarray(np.concatenate(tiles, axis=0).clip(0, 255).astype(np.uint8)).save(OUT + '/fold.png'); print(OUT + '/fold.png')
