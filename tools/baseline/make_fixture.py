"""기준선용 테스트 그림 생성기. 선화가 있는 캐릭터풍 일러스트를 결정적으로 만든다.
실행: python3 tools/baseline/make_fixture.py  →  tools/baseline/fixtures/character.png
"""
from PIL import Image, ImageDraw, ImageFilter
import os

S = 2  # 2배로 그린 뒤 줄여 안티앨리어싱
W, H = 800, 1000
img = Image.new('RGB', (W * S, H * S))
d = ImageDraw.Draw(img)
# 배경: 위아래 그라데이션 + 바닥
for y in range(H * S):
    t = y / (H * S)
    d.line([(0, y), (W * S, y)], fill=(int(236 - 30 * t), int(228 - 22 * t), int(214 - 10 * t)))
d.rectangle([0, 860 * S, W * S, H * S], fill=(196, 180, 160))

def s(*v):
    return [c * S for c in v]

LINE = (34, 26, 30)
LW = 4 * S
SKIN = (250, 222, 204)
HAIR = (92, 58, 48)
CLOTH = (82, 118, 168)
TAIL = (120, 80, 60)

# 꼬리 (몸 뒤에서 오른쪽으로 휘어 나감)
pts = [(470, 720), (560, 700), (630, 640), (660, 560), (650, 480), (690, 440)]
for i in range(len(pts) - 1):
    d.line(s(*pts[i], *pts[i + 1]), fill=LINE, width=36 * S)
for p in pts:
    d.ellipse(s(p[0] - 18, p[1] - 18, p[0] + 18, p[1] + 18), fill=LINE)
for i in range(len(pts) - 1):
    d.line(s(*pts[i], *pts[i + 1]), fill=TAIL, width=28 * S)
for p in pts:
    d.ellipse(s(p[0] - 14, p[1] - 14, p[0] + 14, p[1] + 14), fill=TAIL)
# 몸통 (원피스)
d.polygon(s(300, 560, 500, 560, 560, 860, 240, 860), fill=CLOTH, outline=LINE, width=LW)
d.line(s(400, 580, 400, 860), fill=(60, 90, 130), width=3 * S)
# 팔
d.polygon(s(300, 570, 250, 700, 275, 712, 320, 600), fill=SKIN, outline=LINE, width=LW)
d.polygon(s(500, 570, 550, 700, 525, 712, 480, 600), fill=SKIN, outline=LINE, width=LW)
# 목
d.rectangle(s(375, 500, 425, 565), fill=SKIN, outline=LINE, width=LW)
# 뒷머리
d.ellipse(s(240, 170, 560, 600), fill=HAIR, outline=LINE, width=LW)
# 얼굴
d.ellipse(s(280, 230, 520, 520), fill=SKIN, outline=LINE, width=LW)
# 앞머리 (눈썹 위를 살짝 덮음)
d.polygon(s(275, 330, 300, 220, 400, 180, 500, 220, 525, 330, 470, 300, 440, 345, 400, 290, 360, 345, 330, 300),
          fill=HAIR, outline=LINE, width=LW)
d.line(s(360, 230, 340, 300), fill=(140, 96, 80), width=5 * S)
# 고양이 귀
d.polygon(s(285, 260, 290, 150, 360, 210), fill=HAIR, outline=LINE, width=LW)
d.polygon(s(515, 260, 510, 150, 440, 210), fill=HAIR, outline=LINE, width=LW)
# 눈
for cx in (350, 450):
    d.ellipse(s(cx - 30, 360, cx + 30, 430), fill=(255, 255, 255), outline=LINE, width=LW)
    d.ellipse(s(cx - 18, 372, cx + 18, 428), fill=(70, 120, 90))
    d.ellipse(s(cx - 9, 388, cx + 9, 418), fill=(20, 30, 25))
    d.ellipse(s(cx - 12, 378, cx - 2, 390), fill=(255, 255, 255))
    d.line(s(cx - 34, 362, cx + 34, 358), fill=LINE, width=6 * S)
# 볼 홍조, 입
d.ellipse(s(305, 440, 345, 460), fill=(245, 180, 170))
d.ellipse(s(455, 440, 495, 460), fill=(245, 180, 170))
d.arc(s(385, 455, 415, 475), 20, 160, fill=LINE, width=3 * S)
# 리본
d.polygon(s(400, 560, 350, 535, 350, 590), fill=(210, 70, 80), outline=LINE, width=3 * S)
d.polygon(s(400, 560, 450, 535, 450, 590), fill=(210, 70, 80), outline=LINE, width=3 * S)

img = img.resize((W, H), Image.LANCZOS)
out = os.path.join(os.path.dirname(__file__), 'fixtures', 'character.png')
img.save(out, optimize=True)
print(out, os.path.getsize(out))
