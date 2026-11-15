# zoom.py <out.jpg> <label> <sex:col:row:x0:y0:x1:y1>... : crops of a studio sheet (cell coords, cell 1020x1860 from y 420), each enlarged to 900 wide.
import sys
from PIL import Image
S = '/private/tmp/claude-501/-Users-yanlinzhu-Documents-unix-workspace/cb91ac51-ebd4-462b-b4be-1c0ef0c9dfb9/scratchpad/unit-remodel/body'
out, label, specs = sys.argv[1], sys.argv[2], sys.argv[3:]
ims = {}
tiles = []
for spec in specs:
    sex, col, row, x0, y0, x1, y1 = spec.split(':'); col, row, x0, y0, x1, y1 = map(int, (col, row, x0, y0, x1, y1))
    im = ims.setdefault(sex, Image.open(f'{S}/shots/body-{label}-{sex}.png').convert('RGB'))
    cx, cy = col * 1020, 420 + row * 1860
    t = im.crop((cx + x0, cy + y0, cx + x1, cy + y1)); tiles.append(t.resize((900, round(900 * t.height / t.width)), Image.LANCZOS))
W = 900 * len(tiles); H = max(t.height for t in tiles)
sheet = Image.new('RGB', (W, H), (30, 30, 30))
for i, t in enumerate(tiles): sheet.paste(t, (i * 900, 0))
sheet.save(f'{S}/peek/{out}', quality=90)
