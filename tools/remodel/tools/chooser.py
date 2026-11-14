# chooser.py <out stem> <label>... : the studio sheets of several settings cut to head-and-trunk tiles, one block a build, the settings side by side.
import sys
from PIL import Image, ImageDraw, ImageFont
S = '/private/tmp/claude-501/-Users-yanlinzhu-Documents-unix-workspace/cb91ac51-ebd4-462b-b4be-1c0ef0c9dfb9/scratchpad/unit-remodel/body'
stem, labels = sys.argv[1], sys.argv[2:]
HEAD, CW, CH = 420, 1020, 1860
BOX = dict(trunk=(110, 150, 910, 960), neck=(260, 150, 760, 600))
font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 34); small = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 26)
cols = dict(male=['thin', 'ordinary', 'muscular', 'fat'], female=['thin', 'ordinary', 'muscular', 'fat'])
for crop, box in BOX.items():
    for sex in ['male', 'female']:
        ims = [Image.open(f'{S}/shots/body-{l}-{sex}.png').convert('RGB') for l in labels]
        w, h = (box[2] - box[0]) // 2, (box[3] - box[1]) // 2
        gap, top = 24, 110
        W = 4 * (len(labels) * w + gap) + gap; H = top + 3 * h + 20
        out = Image.new('RGB', (W, H), (40, 40, 40)); d = ImageDraw.Draw(out)
        for b in range(4):
            x0 = gap + b * (len(labels) * w + gap)
            d.text((x0 + 8, 12), f'{sex} · {cols[sex][b]}', font=font, fill=(255, 255, 255))
            for i, l in enumerate(labels):
                d.text((x0 + i * w + 8, 66), l, font=small, fill=(220, 220, 220))
                for r in range(3):
                    cx, cy = b * CW, HEAD + r * CH
                    t = ims[i].crop((cx + box[0], cy + box[1], cx + box[2], cy + box[3])).resize((w, h), Image.LANCZOS)
                    out.paste(t, (x0 + i * w, top + r * h))
        out.save(f'{S}/{stem}-{crop}-{sex}.png'); print(f'{S}/{stem}-{crop}-{sex}.png', out.size)
