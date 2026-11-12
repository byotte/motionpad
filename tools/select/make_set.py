"""선택 엔진 측정용 테스트 세트 생성기 (1-A).

같은 캐릭터 구도를 화풍 5종으로 그리고, 부위별 정답 마스크를 함께 만든다.
결정적(같은 결과)이라 저장소에는 넣지 않고 필요할 때 다시 만든다.

  python3 tools/select/make_set.py   →  tools/select/set/<화풍>/image.png, gt-<대상>.png

정답 마스크 값: 255 = 정답, 0 = 아님, 128 = 채점 제외(경계 반 픽셀·모호한 부분).
그림 크기는 614×768: 앱이 선택 계산에 쓰는 해상도(긴 변 768)와 같아 축소 없이 바로 쓴다.
"""
from PIL import Image, ImageDraw, ImageFilter
import numpy as np
import io, json, os

OUT_W, OUT_H = 614, 768
SS = 2                                   # 2배로 그린 뒤 줄인다(안티앨리어싱)
CW, CH = OUT_W * SS, OUT_H * SS
KX, KY = CW / 800, CH / 1000             # 설계 좌표(800×1000) → 캔버스
K = (KX + KY) / 2
HERE = os.path.dirname(os.path.abspath(__file__))
SET = os.path.join(HERE, 'set')

LABELS = ['bg', 'ground', 'tail', 'dress', 'armL', 'armR', 'neck', 'backhair', 'face', 'bangs', 'earL', 'earR',
          'eyeL', 'eyeR', 'blushL', 'blushR', 'mouth', 'ribbon', 'browL', 'browR', 'streak', 'dressline']
L = {n: i for i, n in enumerate(LABELS)}

LINE = (34, 26, 30)
SKIN = (250, 222, 204)
HAIR = (92, 58, 48)
CLOTH = (82, 118, 168)
TAIL = (120, 80, 60)
RED = (210, 70, 80)

STYLES = {
    # lw: 외곽선 두께(설계 좌표 px), shade: 음영·머리카락 결, noise: 잡티 세기, jpeg: 압축 품질
    'flat':     dict(lw=4, shade=False, noise=0, jpeg=None, bgtex=False),
    'thin':     dict(lw=2, shade=False, noise=0, jpeg=None, bgtex=False),
    'shaded':   dict(lw=3, shade=True, noise=3, jpeg=None, bgtex=True),
    'lineless': dict(lw=0, shade=True, noise=3, jpeg=None, bgtex=True),
    'jpeg':     dict(lw=3, shade=True, noise=3, jpeg=60, bgtex=True),
}


def P(*v):
    out = []
    for i in range(0, len(v), 2):
        out += [v[i] * KX, v[i + 1] * KY]
    return out


class Canvas:
    """색 그림, 부위 번호, 외곽선 여부를 같은 순서로 함께 그린다(가려짐이 자동으로 맞는다)."""

    def __init__(self):
        self.color = Image.new('RGB', (CW, CH))
        self.label = Image.new('L', (CW, CH), 0)
        self.line = Image.new('L', (CW, CH), 0)
        self.dc, self.dl, self.dn = (ImageDraw.Draw(x) for x in (self.color, self.label, self.line))

    def shape(self, kind, xy, label, fill, lw, outline=LINE):
        w = max(1, round(lw * K)) if lw else 0
        args = dict(width=w) if w else {}
        getattr(self.dc, kind)(xy, fill=fill, outline=outline if w else None, **args)
        getattr(self.dl, kind)(xy, fill=L[label], outline=L[label] if w else None, **args)
        getattr(self.dn, kind)(xy, fill=0, outline=255 if w else None, **args)

    def stroke(self, xy, label, color, width, is_line=False):
        w = max(1, round(width * K))
        self.dc.line(xy, fill=color, width=w)
        self.dl.line(xy, fill=L[label], width=w)
        self.dn.line(xy, fill=255 if is_line else 0, width=w)

    def disk(self, cx, cy, r, label, color, is_line=False):
        xy = P(cx - r, cy - r, cx + r, cy + r)
        self.dc.ellipse(xy, fill=color)
        self.dl.ellipse(xy, fill=L[label])
        self.dn.ellipse(xy, fill=255 if is_line else 0)


def draw_scene(st):
    c = Canvas()
    lw = st['lw']
    for y in range(CH):
        t = y / CH
        col = (int(236 - 30 * t), int(228 - 22 * t), int(214 - 10 * t))
        c.dc.line([(0, y), (CW, y)], fill=col)
    c.dc.rectangle(P(0, 860, 800, 1000), fill=(196, 180, 160))
    c.dl.rectangle(P(0, 860, 800, 1000), fill=L['ground'])

    # 꼬리
    pts = [(470, 720), (560, 700), (630, 640), (660, 560), (650, 480), (690, 440)]
    if lw:
        for a, b in zip(pts, pts[1:]):
            c.stroke(P(*a, *b), 'tail', LINE, 28 + 2 * lw, is_line=True)
        for p in pts:
            c.disk(*p, 14 + lw, 'tail', LINE, is_line=True)
    for a, b in zip(pts, pts[1:]):
        c.stroke(P(*a, *b), 'tail', TAIL, 28)
    for p in pts:
        c.disk(*p, 14, 'tail', TAIL)
    # 몸통·팔·목
    c.shape('polygon', P(300, 560, 500, 560, 560, 860, 240, 860), 'dress', CLOTH, lw)
    c.stroke(P(400, 580, 400, 860), 'dressline', (60, 90, 130), 3)
    c.shape('polygon', P(300, 570, 250, 700, 275, 712, 320, 600), 'armL', SKIN, lw)
    c.shape('polygon', P(500, 570, 550, 700, 525, 712, 480, 600), 'armR', SKIN, lw)
    c.shape('rectangle', P(375, 500, 425, 565), 'neck', SKIN, lw)
    # 머리
    c.shape('ellipse', P(240, 170, 560, 600), 'backhair', HAIR, lw)
    c.shape('ellipse', P(280, 230, 520, 520), 'face', SKIN, lw)
    c.shape('polygon', P(275, 330, 300, 220, 400, 180, 500, 220, 525, 330, 470, 300, 440, 345, 400, 290, 360, 345, 330, 300),
            'bangs', HAIR, lw)
    c.stroke(P(360, 230, 340, 300), 'streak', (140, 96, 80), 5)
    c.shape('polygon', P(285, 260, 290, 150, 360, 210), 'earL', HAIR, lw)
    c.shape('polygon', P(515, 260, 510, 150, 440, 210), 'earR', HAIR, lw)
    # 눈(선 없는 화풍에서도 눈 테두리는 둔다)
    for cx, side in ((350, 'L'), (450, 'R')):
        eye = 'eye' + side
        c.shape('ellipse', P(cx - 30, 360, cx + 30, 430), eye, (255, 255, 255), max(lw, 2))
        for r, col, oy in ((None, (70, 120, 90), 0),):
            xy = P(cx - 18, 372, cx + 18, 428)
            c.dc.ellipse(xy, fill=col); c.dl.ellipse(xy, fill=L[eye]); c.dn.ellipse(xy, fill=0)
        for xy, col in ((P(cx - 9, 388, cx + 9, 418), (20, 30, 25)), (P(cx - 12, 378, cx - 2, 390), (255, 255, 255))):
            c.dc.ellipse(xy, fill=col); c.dl.ellipse(xy, fill=L[eye])
        c.stroke(P(cx - 34, 362, cx + 34, 358), 'brow' + side, LINE, 6)
    for x0, side in ((305, 'L'), (455, 'R')):
        xy = P(x0, 440, x0 + 40, 460)
        c.dc.ellipse(xy, fill=(245, 180, 170)); c.dl.ellipse(xy, fill=L['blush' + side]); c.dn.ellipse(xy, fill=0)
    xy = P(385, 455, 415, 475)
    w = max(1, round(3 * K))
    c.dc.arc(xy, 20, 160, fill=LINE, width=w); c.dl.arc(xy, 20, 160, fill=L['mouth'], width=w)
    # 리본
    c.shape('polygon', P(400, 560, 350, 535, 350, 590), 'ribbon', RED, max(lw, 2) if lw else 0)
    c.shape('polygon', P(400, 560, 450, 535, 450, 590), 'ribbon', RED, max(lw, 2) if lw else 0)
    c.shape('ellipse', P(388, 549, 412, 573), 'ribbon', RED, max(lw, 2) if lw else 0)   # 매듭
    return c


def shade(c, st, rng):
    """음영(부위 안 그라데이션), 머리카락·꼬리 결, 하이라이트. 외곽선 픽셀은 건드리지 않는다."""
    col = np.asarray(c.color).astype(np.float32)
    lab = np.asarray(c.label)
    line = np.asarray(c.line) > 0
    yy, xx = np.mgrid[0:CH, 0:CW].astype(np.float32)
    for name in ('tail', 'dress', 'armL', 'armR', 'neck', 'backhair', 'face', 'bangs', 'earL', 'earR', 'ribbon'):
        m = (lab == L[name]) & ~line
        if not m.any():
            continue
        ys, xs = np.nonzero(m)
        u = (xx - xs.min()) / max(1, np.ptp(xs)); v = (yy - ys.min()) / max(1, np.ptp(ys))
        f = 1.10 - 0.32 * np.clip((u + v) / 2, 0, 1)
        col[m] *= f[m][:, None]
    # 결: 어두운·밝은 가는 곡선
    strands = Image.new('L', (CW, CH), 0)
    tone = Image.new('L', (CW, CH), 128)
    ds, dt = ImageDraw.Draw(strands), ImageDraw.Draw(tone)
    for name, n in (('backhair', 70), ('bangs', 30), ('earL', 6), ('earR', 6), ('tail', 26)):
        m = (lab == L[name]) & ~line
        ys, xs = np.nonzero(m)
        if not len(xs):
            continue
        for _ in range(n):
            k = rng.integers(len(xs)); x0, y0 = float(xs[k]), float(ys[k])
            ang = rng.uniform(1.1, 2.0) if name != 'tail' else rng.uniform(0, 6.28)
            length = rng.uniform(40, 140) * K
            pts = []
            for s in range(9):
                t = s / 8
                pts.append((x0 + np.cos(ang + 0.5 * t) * length * t, y0 + np.sin(ang + 0.5 * t) * length * t))
            w = max(1, round(rng.uniform(1.0, 2.2) * K))
            ds.line(pts, fill=255, width=w)
            dt.line(pts, fill=int(rng.choice([70, 75, 190])), width=w)
    sm = np.asarray(strands) > 0
    tn = np.asarray(tone).astype(np.float32) / 128.0
    for name in ('backhair', 'bangs', 'earL', 'earR', 'tail'):
        m = (lab == L[name]) & ~line & sm
        col[m] *= tn[m][:, None]
    # 얼굴·몸통 하이라이트 띠
    for name, (cx, cy, rx, ry) in (('face', (330, 300, 40, 25)), ('dress', (300, 650, 25, 90)), ('backhair', (300, 260, 30, 60))):
        m = (lab == L[name]) & ~line
        d = ((xx - cx * KX) / (rx * KX)) ** 2 + ((yy - cy * KY) / (ry * KY)) ** 2
        h = np.clip(1 - d, 0, 1) * 0.22
        col[m] += (255 - col[m]) * h[m][:, None]
    c.color = Image.fromarray(np.clip(col, 0, 255).astype(np.uint8))


def finish(c, st, rng):
    img = c.color.resize((OUT_W, OUT_H), Image.LANCZOS)
    a = np.asarray(img).astype(np.float32)
    if st['bgtex']:
        lab_small = np.asarray(c.label.resize((OUT_W, OUT_H), Image.NEAREST))
        bgm = lab_small <= L['ground']
        low = rng.normal(0, 1, (OUT_H // 24 + 2, OUT_W // 24 + 2)).astype(np.float32)
        low = np.asarray(Image.fromarray(low).resize((OUT_W, OUT_H), Image.BICUBIC))
        a[bgm] += (low[bgm] * 6)[:, None]
    if st['noise']:
        a += rng.normal(0, st['noise'], a.shape)
    img = Image.fromarray(np.clip(a, 0, 255).round().astype(np.uint8))
    if st['jpeg']:
        buf = io.BytesIO(); img.save(buf, 'JPEG', quality=st['jpeg']); buf.seek(0)
        img = Image.open(buf).convert('RGB')
    return img


def coverage(c, labels):
    m = np.isin(np.asarray(c.label), [L[n] for n in labels]).astype(np.float32)
    return np.asarray(Image.fromarray(m * 255).resize((OUT_W, OUT_H), Image.BOX)) / 255


def gt_image(cov, ignore=None):
    g = np.where(cov >= 0.5, 255, 0).astype(np.uint8)
    edge = (cov > 0.05) & (cov < 0.95)
    edge = np.asarray(Image.fromarray(edge.astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(3))) > 0
    g[edge] = 128
    if ignore is not None:
        g[ignore] = 128
    return Image.fromarray(g)


FIGURE = [n for n in LABELS if n not in ('bg', 'ground')]
HAIRS = ['backhair', 'bangs', 'streak', 'earL', 'earR']
FACE = ['face', 'blushL', 'blushR', 'mouth', 'browL', 'browR']
HEAD = HAIRS + FACE + ['eyeL', 'eyeR']

# 마술봉: (이름, 누른 곳, 정답 부위, 허용 부위)
#  정답 = 누른 곳에서 외곽선을 넘지 않고 이어진 '정답 부위' 덩어리(+ 자기 외곽선은 채점 제외).
#  허용 = 잡혀도 틀린 게 아닌 것(같은 색 이웃, 주름선 건너편, 얼굴 속 눈) → 채점 제외.
WAND = [
    ('dress', (336, 760), ['dress'], ['dressline']),
    ('tail', (655, 520), ['tail'], []),
    ('backhair', (260, 400), ['backhair'], HAIRS),
    ('face', (360, 492), FACE, ['eyeL', 'eyeR']),
    ('bangs', (420, 240), ['bangs', 'streak'], HAIRS),
    ('armL', (288, 640), ['armL'], []),
    ('ribbon', (367, 562), ['ribbon'], []),
    ('earL', (310, 205), ['earL'], HAIRS),
]
# 간략 범위지정: (이름, 둘러싼 점들, 정답 부위, 허용 부위)
#  정답 = 둘러싼 안에 온전히 들어온 부위. 올가미가 가로지른 부위는 사용자가 원한 게 아니다(허용에 넣지 않으면 오답).
OUTLINE = [
    ('tail-loose', [(552, 745), (610, 700), (665, 650), (705, 565), (700, 500), (735, 450), (705, 395), (650, 410),
                    (615, 470), (625, 560), (600, 615), (552, 660), (535, 700)], ['tail'], ['dress']),
    ('tail-box', [(512, 400), (736, 400), (736, 760), (512, 760)], ['tail'], []),   # 기준선 run.js와 같은 사각형
    ('earL', [(262, 135), (375, 185), (372, 235), (300, 290), (258, 262)], ['earL'], HAIRS),
    ('armL', [(228, 560), (315, 552), (340, 610), (300, 735), (232, 725)], ['armL'], []),
    ('head', [(400 + 220 * np.cos(t), 385 + 285 * np.sin(t)) for t in np.linspace(0, 2 * np.pi, 40, endpoint=False)],
     HEAD + ['neck', 'ribbon'], []),
    ('figure', [(215, 120), (590, 120), (750, 400), (740, 760), (580, 885), (220, 885), (210, 520)], FIGURE, []),
]


def component(c, labels, point):
    """누른 곳에서 외곽선을 넘지 않고 이어진 덩어리(캔버스 해상도)."""
    m = np.isin(np.asarray(c.label), [L[n] for n in labels]) & (np.asarray(c.line) == 0)
    img = Image.fromarray(m.astype(np.uint8) * 255).copy()   # copy: 배열과 메모리를 공유하면 floodfill이 반영되지 않는다
    seed = (round(point[0] * KX), round(point[1] * KY))
    if img.getpixel(seed) != 255:
        raise SystemExit(f'누른 곳이 부위 밖: {labels} {point}')
    ImageDraw.floodfill(img, seed, 128)
    comp = (np.asarray(img) == 128).astype(np.float32)
    return np.asarray(Image.fromarray(comp * 255).resize((OUT_W, OUT_H), Image.BOX)) / 255


def main():
    os.makedirs(SET, exist_ok=True)
    for name, st in STYLES.items():
        rng = np.random.default_rng(7)
        c = draw_scene(st)
        if st['shade']:
            shade(c, st, rng)
        d = os.path.join(SET, name)
        os.makedirs(d, exist_ok=True)
        finish(c, st, rng).save(os.path.join(d, 'image.png'))
        line_small = np.asarray(c.line.resize((OUT_W, OUT_H), Image.BOX)) > 32
        for n, point, fg, allow in WAND:
            req = component(c, fg, point)
            whole = coverage(c, fg)
            # 덩어리를 둘러싼 자기 외곽선, 덩어리 밖의 같은 부위, 허용 부위는 채점 제외
            near = np.asarray(Image.fromarray((req > 0.05).astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(9))) > 0
            ignore = (line_small & near) | ((whole > 0.05) & (req < 0.5))
            others = [a for a in allow if a not in fg]
            if others:
                ignore |= coverage(c, others) > 0.05
            gt_image(req, ignore).save(os.path.join(d, f'gt-w-{n}.png'))
        for n, pts, fg, allow in OUTLINE:
            gt_image(coverage(c, fg), coverage(c, [a for a in allow if a not in fg]) > 0.05 if allow else None).save(os.path.join(d, f'gt-o-{n}.png'))
        print(name, 'ok')
    scen = {
        'size': [OUT_W, OUT_H],
        'styles': list(STYLES),
        'wand': [dict(name=n, point=[p[0] / 800, p[1] / 1000]) for n, p, *_ in WAND],
        'outline': [dict(name=n, points=[[float(x) / 800, float(y) / 1000] for x, y in pts]) for n, pts, *_ in OUTLINE],
    }
    with open(os.path.join(SET, 'scenarios.json'), 'w') as f:
        json.dump(scen, f, ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
