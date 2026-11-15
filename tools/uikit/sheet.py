# Contact sheet: python3 sheet.py out.png cols thumbwidth file1 file2 ... (label = parent/name)
# (tools/uikit/: droppable.) A labelled contact sheet: python3 tools/uikit/sheet.py out.png <columns> <thumb width> files...
import sys, os
from PIL import Image, ImageDraw, ImageFont
out, cols, tw = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
files = [f for f in sys.argv[4:] if os.path.exists(f)]
try:
    font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 15)
except Exception:
    font = ImageFont.load_default()
thumbs = []
for f in files:
    im = Image.open(f).convert('RGB')
    th = int(im.height * tw / im.width)
    thumbs.append((im.resize((tw, th), Image.LANCZOS), os.path.basename(os.path.dirname(f)) + '/' + os.path.basename(f)[:-4]))
rows = [thumbs[i:i + cols] for i in range(0, len(thumbs), cols)]
pad, lab = 8, 22
W = cols * (tw + pad) + pad
H = sum(max(t[0].height for t in row) + lab + pad for row in rows) + pad
sheet = Image.new('RGB', (W, H), (40, 40, 44))
d = ImageDraw.Draw(sheet)
y = pad
for row in rows:
    x = pad
    for im, name in row:
        d.text((x, y + 2), name, fill=(230, 230, 230), font=font)
        sheet.paste(im, (x, y + lab))
        x += tw + pad
    y += max(t[0].height for t in row) + lab + pad
sheet.save(out)
print(out, sheet.size)
