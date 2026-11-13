"""실제로 보이는 모습: 물체를 이동 상한(가로 5.5%)만큼 옮겨 메운 배경 위에 얹는다.
python3 tools/motion/fill/moved.py [방식 ...] [--cases 조각,...] [--out 이름] [--dx 0.055] [--dy -0.02]
칸: 정답(진짜 배경 위에 옮긴 물체) | 방식별."""
from PIL import Image, ImageDraw
import numpy as np, json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.abspath(os.path.join(HERE, '../out/fill'))
args = sys.argv[1:]; opt = {}
for k in ('--cases', '--out', '--dx', '--dy'):
    if k in args: i = args.index(k); opt[k] = args[i + 1]; del args[i:i + 2]
methods = args or ['current', 'smooth', 'patch']; DX, DY = float(opt.get('--dx', .055)), float(opt.get('--dy', -.02))
cases = sorted(d for d in os.listdir(OUT + '/cases') if os.path.exists(f'{OUT}/cases/{d}/meta.json'))
if '--cases' in opt: cases = [c for c in cases if any(k in c for k in opt['--cases'].split(','))]
rows = []; CELL = 330
for c in cases:
    m = json.load(open(f'{OUT}/cases/{c}/meta.json')); w, h = m['w'], m['h']
    rd = lambda p: np.frombuffer(open(p, 'rb').read(), np.uint8).reshape(h, w, 4)[:, :, :3]
    one = lambda k: np.frombuffer(open(f'{OUT}/cases/{c}/{k}.bin', 'rb').read(), np.uint8).reshape(h, w)
    inside, raw, image = one('inside'), one('raw'), rd(f'{OUT}/cases/{c}/image.bin')
    sx, sy = round(DX * w), round(DY * h)
    def moved(bg):
        out = bg.copy(); a = np.roll(np.roll(raw, sy, 0), sx, 1) > 0; o = np.roll(np.roll(image, sy, 0), sx, 1); out[a] = o[a]; return out
    ys, xs = np.nonzero(inside); pad = 45
    x0, x1, y0, y1 = max(0, xs.min() - pad), min(w, xs.max() + pad), max(0, ys.min() - pad), min(h, ys.max() + pad)
    ims = [moved(rd(f'{OUT}/cases/{c}/truth.bin'))] + [moved(rd(f'{OUT}/results/{k}/{c}.bin')) for k in methods]
    cells = []
    for im in ims:
        t = Image.fromarray(im[y0:y1, x0:x1]); s = CELL / max(t.size); cells.append(t.resize((round(t.width * s), round(t.height * s)), Image.LANCZOS))
    row = Image.new('RGB', ((CELL + 6) * len(cells), CELL + 18), (40, 40, 40)); d = ImageDraw.Draw(row)
    for i, t in enumerate(cells):
        row.paste(t, (i * (CELL + 6), 18)); d.text((i * (CELL + 6) + 3, 3), ([c + ' truth'] + methods)[i], fill=(255, 255, 255))
    rows.append(row)
sheet = Image.new('RGB', (rows[0].width, sum(r.height for r in rows)), (40, 40, 40)); y = 0
for r in rows: sheet.paste(r, (0, y)); y += r.height
p = f"{OUT}/{opt.get('--out', 'moved')}.png"; sheet.save(p); print(p, sheet.size)
