"""빈자리 메우기 비교 그림.  python3 tools/motion/fill/sheet.py [방식 ...] [--cases 이름조각,...] [--out 파일이름]
칸: 앱에 들어온 그림 | 정답(물체 없는 배경) | 방식별 결과. 빈자리 둘레만 잘라 보여 준다."""
from PIL import Image, ImageDraw
import numpy as np, json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.abspath(os.path.join(HERE, '../out/fill'))
args = sys.argv[1:]; opt = {}
while '--cases' in args or '--out' in args:
    for k in ('--cases', '--out'):
        if k in args: i = args.index(k); opt[k] = args[i + 1]; del args[i:i + 2]
methods = args or ['current', 'smooth', 'patch']
cases = sorted(d for d in os.listdir(OUT + '/cases') if os.path.exists(f'{OUT}/cases/{d}/meta.json'))
if '--cases' in opt: cases = [c for c in cases if any(k in c for k in opt['--cases'].split(','))]
rows = []; CELL = 300
for c in cases:
    m = json.load(open(f'{OUT}/cases/{c}/meta.json')); w, h = m['w'], m['h']
    rd = lambda p: np.frombuffer(open(p, 'rb').read(), np.uint8).reshape(h, w, 4)[:, :, :3]
    inside = np.frombuffer(open(f'{OUT}/cases/{c}/inside.bin', 'rb').read(), np.uint8).reshape(h, w)
    ys, xs = np.nonzero(inside); pad = 30
    x0, x1, y0, y1 = max(0, xs.min() - pad), min(w, xs.max() + pad), max(0, ys.min() - pad), min(h, ys.max() + pad)
    ims = [rd(f'{OUT}/cases/{c}/image.bin'), rd(f'{OUT}/cases/{c}/truth.bin')] + [rd(f'{OUT}/results/{k}/{c}.bin') for k in methods]
    cells = []
    for im in ims:
        t = Image.fromarray(im[y0:y1, x0:x1]); s = CELL / max(t.size); cells.append(t.resize((round(t.width * s), round(t.height * s)), Image.LANCZOS))
    row = Image.new('RGB', ((CELL + 6) * len(cells), CELL + 18), (40, 40, 40)); d = ImageDraw.Draw(row)
    for i, t in enumerate(cells):
        row.paste(t, (i * (CELL + 6), 18)); d.text((i * (CELL + 6) + 3, 3), ([c, 'truth'] + methods)[i], fill=(255, 255, 255))
    rows.append(row)
sheet = Image.new('RGB', (rows[0].width, sum(r.height for r in rows)), (40, 40, 40)); y = 0
for r in rows: sheet.paste(r, (0, y)); y += r.height
p = f"{OUT}/{opt.get('--out', 'sheet')}.png"; sheet.save(p); print(p, sheet.size)
