# python3 ba.py <out.jpg> <title> <cellwidth> <row label>:<before.png>,<after.png> ... : rows of before | after, labelled.
import sys
from PIL import Image, ImageDraw, ImageFont
out, title, cw = sys.argv[1], sys.argv[2], int(sys.argv[3])
rows = [a.split(':', 1) for a in sys.argv[4:]]
font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 22)
cells = []
for label, files in rows:
    ims = [Image.open(f).convert('RGB') for f in files.split(',')]
    ims = [im.resize((cw, int(cw * im.height / im.width)), Image.LANCZOS) for im in ims]
    cells.append((label, ims))
per = max(len(ims) for _, ims in cells)
H = 50 + sum(max(im.height for im in ims) + 34 for _, ims in cells)
sheet = Image.new('RGB', (cw * per, H), (24, 24, 24)); d = ImageDraw.Draw(sheet)
d.text((10, 12), title, fill=(240, 240, 240), font=font)
y = 50
for label, ims in cells:
    d.text((10, y + 4), label, fill=(230, 210, 120), font=font); y += 34
    for i, im in enumerate(ims): sheet.paste(im, (i * cw, y))
    y += max(im.height for im in ims)
sheet.save(out, quality=86)
