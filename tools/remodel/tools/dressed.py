# dressed.py <out> <view> <label>... : each unit's shot under each body setting, stacked (one row a setting).
import sys
from PIL import Image, ImageDraw, ImageFont
SP = '/private/tmp/claude-501/-Users-yanlinzhu-Documents-unix-workspace/cb91ac51-ebd4-462b-b4be-1c0ef0c9dfb9/scratchpad/unit-remodel'
out, view, labels = sys.argv[1], sys.argv[2], sys.argv[3:]
units = ['knight', 'samurai', 'ronin', 'mingEliteInfantry']
font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 30)
W, H = 1400, 1000; box = (0, 120, 1400, 900) if 'torso' not in view and 'head' not in view else (0, 0, 1400, 1000)
w, h = (box[2] - box[0]) * 3 // 4, (box[3] - box[1]) * 3 // 4
sheet = Image.new('RGB', (len(units) * w, len(labels) * h), (30, 30, 30)); d = ImageDraw.Draw(sheet)
for j, l in enumerate(labels):
    for i, u in enumerate(units):
        sheet.paste(Image.open(f'{SP}/{u}/body{l}-{view}.png').convert('RGB').crop(box).resize((w, h), Image.LANCZOS), (i * w, j * h))
        d.text((i * w + 10, j * h + 8), f'{u} · {l} body', font=font, fill=(255, 255, 255))
sheet.save(out, quality=88); print(out, sheet.size)
