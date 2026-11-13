"""빈자리 메우기 측정용 시험 세트 (정답을 아는 그림).

  python3 tools/motion/fill/make_cases.py  →  tools/motion/out/fill/cases/<이름>/{meta.json, *.bin}

만드는 법: 배경 그림 위에 외곽선 있는 물체(꼬리·머리 모양)를 붙인다 → 앱에 들어오는 그림.
물체를 붙이기 전 배경이 '정답'이다. 마스크는 앱과 같게 384 격자에서 만들고 2칸 넓힌 뒤 작업 크기(긴 변 850)로 옮긴다.
  tight = 물체와 꼭 맞는 선택, loose = 선택이 외곽선 안쪽으로 1칸 모자란 경우(실제 선택에서 흔함).
채점 띠: 빈자리 가장자리에서 그림 크기의 5.5%(셰이더 이동 상한) 안쪽까지만 화면에 드러난다. near = 0~2%, far = 2~5.5%.
"""
from PIL import Image, ImageDraw, ImageFilter
import numpy as np, json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '../../..'))
OUT = os.path.join(ROOT, 'tools/motion/out/fill/cases')
TILE = 384

def work_size(w, h):
    s = min(1, 850 / max(w, h)); return max(1, round(w * s)), max(1, round(h * s))

def maxf(a, r):  # 사각 최대 필터(앱 dilateMask와 같은 모양)
    out = a.copy()
    for ax in (0, 1):
        src = out.copy()
        for d in range(1, r + 1):
            for sgn in (-1, 1):
                sh = np.roll(src, sgn * d, axis=ax)
                if ax == 0:
                    if sgn > 0: sh[:d, :] = 0
                    else: sh[-d:, :] = 0
                else:
                    if sgn > 0: sh[:, :d] = 0
                    else: sh[:, -d:] = 0
                out = np.maximum(out, sh)
    return out

def to_work(mask384, w, h):  # 캔버스 drawImage 확대(쌍선형) 뒤 128 기준
    return (np.asarray(Image.fromarray(mask384).resize((w, h), Image.BILINEAR)) >= 128).astype(np.uint8)

def depth(inside, w, h):  # 빈자리 안쪽으로 몇 %(그림 크기 대비) 들어갔는지: 축별 이동 상한이 비율이라 타원 거리
    INF = 1e9; d = np.where(inside > 0, INF, 0.0)
    sx, sy = 1 / w, 1 / h; dg = (sx * sx + sy * sy) ** .5
    for _ in range(2):
        for y in range(h):
            if y: d[y] = np.minimum(d[y], d[y - 1] + sy); d[y, 1:] = np.minimum(d[y, 1:], d[y - 1, :-1] + dg); d[y, :-1] = np.minimum(d[y, :-1], d[y - 1, 1:] + dg)
            r = d[y]
            for x in range(1, w):
                if r[x - 1] + sx < r[x]: r[x] = r[x - 1] + sx
        for y in range(h - 1, -1, -1):
            if y < h - 1: d[y] = np.minimum(d[y], d[y + 1] + sy); d[y, 1:] = np.minimum(d[y, 1:], d[y + 1, :-1] + dg); d[y, :-1] = np.minimum(d[y, :-1], d[y + 1, 1:] + dg)
            r = d[y]
            for x in range(w - 2, -1, -1):
                if r[x + 1] + sx < r[x]: r[x] = r[x + 1] + sx
    return d

def save_case(name, image, truth, alpha, note):
    """image·truth: 작업 크기 RGB, alpha: 물체 불투명도(작업 크기 0~255)"""
    w, h = image.size
    a384 = np.asarray(Image.fromarray(alpha).resize((TILE, TILE), Image.BILINEAR))
    for variant, m in (('tight', (a384 >= 128)), ('loose', maxf((a384 < 128).astype(np.uint8), 1) == 0)):
        m = (m * 255).astype(np.uint8)
        raw = to_work(m, w, h); inside = to_work(maxf(m, 2), w, h); nearby = to_work(maxf(m, 8), w, h)
        d = depth(inside, w, h)
        band = np.zeros((h, w), np.uint8); band[(inside > 0) & (d <= .02)] = 1; band[(inside > 0) & (d > .02) & (d <= .055)] = 2
        p = os.path.join(OUT, f'{name}-{variant}'); os.makedirs(p, exist_ok=True)
        rgba = lambda im: np.dstack([np.asarray(im.convert('RGB')), np.full((h, w), 255, np.uint8)]).tobytes()
        open(p + '/image.bin', 'wb').write(rgba(image)); open(p + '/truth.bin', 'wb').write(rgba(truth))
        for k, v in (('inside', inside), ('nearby', nearby), ('band', band), ('raw', raw)): open(f'{p}/{k}.bin', 'wb').write(v.tobytes())
        json.dump(dict(name=f'{name}-{variant}', w=w, h=h, note=note, hole=int(inside.sum()), band=int((band > 0).sum())), open(p + '/meta.json', 'w'), ensure_ascii=False)
        print(f'{name}-{variant}', w, h, 'hole', int(inside.sum()), 'band', int((band > 0).sum()))

def paste_object(bg, kind, cx, cy, size, fill, line=(34, 26, 30)):
    """bg(작업 크기) 위에 물체를 그린다. 반환: 합성 그림, 물체 불투명도"""
    S = 3; w, h = bg.size
    layer = Image.new('RGBA', (w * S, h * S), (0, 0, 0, 0)); d = ImageDraw.Draw(layer)
    u = size * min(w, h) * S; X, Y = cx * w * S, cy * h * S; lw = max(2, round(.005 * min(w, h) * S))
    if kind == 'tail':
        pts = [(-.9, .9), (-.2, .75), (.35, .3), (.55, -.25), (.45, -.8), (.8, -1.1)]
        pts = [(X + px * u, Y + py * u) for px, py in pts]; r = .17 * u
        for width, col in ((2 * r + 2 * lw, line), (2 * r, fill)):
            d.line(pts, fill=col + (255,), width=round(width), joint='curve')
            for px, py in pts: d.ellipse([px - width / 2, py - width / 2, px + width / 2, py + width / 2], fill=col + (255,))
    else:  # head: 타원 + 귀
        d.polygon([(X - .75 * u, Y - .3 * u), (X - .7 * u, Y - 1.25 * u), (X - .1 * u, Y - .8 * u)], fill=fill + (255,), outline=line + (255,), width=lw)
        d.polygon([(X + .75 * u, Y - .3 * u), (X + .7 * u, Y - 1.25 * u), (X + .1 * u, Y - .8 * u)], fill=fill + (255,), outline=line + (255,), width=lw)
        d.ellipse([X - .8 * u, Y - u, X + .8 * u, Y + u], fill=fill + (255,), outline=line + (255,), width=lw)
        d.ellipse([X - .45 * u, Y - .1 * u, X - .2 * u, Y + .25 * u], fill=(255, 255, 255, 255), outline=line + (255,), width=lw)
        d.ellipse([X + .2 * u, Y - .1 * u, X + .45 * u, Y + .25 * u], fill=(255, 255, 255, 255), outline=line + (255,), width=lw)
    layer = layer.resize((w, h), Image.LANCZOS)
    out = bg.convert('RGBA'); out.alpha_composite(layer)
    return out.convert('RGB'), np.asarray(layer)[:, :, 3].copy()

def main():
    # 1. 기준선 캐릭터의 꼬리: 꼬리 없이 그린 그림이 정답
    src = open(os.path.join(ROOT, 'tools/baseline/make_fixture.py'), encoding='utf-8').read()
    def render(no_tail):
        code = src.split("img = img.resize")[0]
        if no_tail: code = re.sub(r"# 꼬리.*?# 몸통", "# 몸통", code, flags=re.S)
        g = {}; exec(code, g); return g['img'].resize((g['W'], g['H']), Image.LANCZOS)
    full, bare = render(False), render(True)
    ws = work_size(*full.size); full, bare = full.resize(ws, Image.LANCZOS), bare.resize(ws, Image.LANCZOS)
    diff = np.abs(np.asarray(full).astype(int) - np.asarray(bare).astype(int)).sum(2)
    save_case('char-tail', full, bare, np.where(diff > 40, 255, 0).astype(np.uint8), '기준선 캐릭터 꼬리(민무늬 배경 + 원피스·팔에 닿음)')
    # 2. 실제 그림 위에 물체 붙이기
    spots = [
        ('001', 'tail', .78, .45, .16, (120, 80, 60), '문어 다리(반짝이 무늬)'),
        ('001', 'head', .50, .13, .11, (92, 58, 48), '하늘·구름·건물 경계'),
        ('001', 'tail', .22, .50, .15, (120, 80, 60), '티셔츠·팔 경계'),
        ('002', 'head', .30, .62, .12, (92, 58, 48), '검은 옷 주름·지퍼'),
        ('002', 'tail', .62, .78, .15, (120, 80, 60), '회색 후드 무늬·끈'),
        ('003', 'head', .30, .25, .13, (92, 58, 48), '민무늬 배경 + 점'),
        ('003', 'tail', .62, .62, .15, (120, 80, 60), '선화: 푸딩·접시·크림 경계'),
        ('003', 'head', .45, .88, .11, (92, 58, 48), '선화: 접시 받침·숟가락'),
    ]
    count = {}
    for f, kind, cx, cy, size, col, note in spots:
        path = [p for p in os.listdir(os.path.join(ROOT, 'samples')) if p.startswith(f)][0]
        bg = Image.open(os.path.join(ROOT, 'samples', path)).convert('RGB'); bg = bg.resize(work_size(*bg.size), Image.LANCZOS)
        img, alpha = paste_object(bg, kind, cx, cy, size, col)
        count[f] = count.get(f, 0) + 1
        save_case(f'{f}-{count[f]}-{kind}', img, bg, alpha, note)

main()
