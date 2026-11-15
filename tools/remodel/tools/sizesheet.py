# python3 sizesheet.py <unit> [labels=ref,now,cur] : SP/size/<unit>-<build>.jpg for each build, the views down (front, side,
# back) and the trees across (reference | now | current), and SP/size/<unit>-all.jpg, the fronts of the four builds.
import sys, os
from PIL import Image, ImageDraw, ImageFont
SP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
unit = sys.argv[1]
labels = (sys.argv[2] if len(sys.argv) > 2 else 'ref,now,cur').split(',')
NAMES = {'ref': 'reference (main, V7 body)', 'now': 'now (33024be)', 'cur': 'current (bc3486f)'}
builds = ['ordinary', 'thin', 'muscular', 'fat']; views = ['front', 'side', 'back']
CROP = (150, 40, 610, 1100)   # the figure, without the sound icon at the top right
try: font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 22)
except Exception: font = ImageFont.load_default()
def cell(build, view, label):
    f = f'{SP}/size/shots/{unit}-{build}-{view}-{label}.png'
    if not os.path.exists(f): return None
    return Image.open(f).convert('RGB').crop(CROP)
w, h = CROP[2] - CROP[0], CROP[3] - CROP[1]
for build in builds:
    if cell(build, 'front', labels[0]) is None: continue
    sheet = Image.new('RGB', (w * len(labels), 34 + h * len(views)), 'white'); d = ImageDraw.Draw(sheet)
    for i, label in enumerate(labels):
        d.text((i * w + 8, 6), f'{unit} {build}: {NAMES.get(label, label)}', fill='black', font=font)
        for j, view in enumerate(views):
            im = cell(build, view, label)
            if im: sheet.paste(im, (i * w, 34 + j * h))
    sheet.save(f'{SP}/size/{unit}-{build}.jpg', quality=88)
sheet = Image.new('RGB', (w * len(labels) * 2, (34 + h) * 2), 'white'); d = ImageDraw.Draw(sheet)
for b, build in enumerate(builds):
    ox, oy = (b % 2) * w * len(labels), (b // 2) * (34 + h)
    for i, label in enumerate(labels):
        d.text((ox + i * w + 8, oy + 6), f'{build}: {NAMES.get(label, label)}', fill='black', font=font)
        im = cell(build, 'front', label)
        if im: sheet.paste(im, (ox + i * w, oy + 34))
sheet.save(f'{SP}/size/{unit}-all.jpg', quality=86)
print(unit, 'done')
