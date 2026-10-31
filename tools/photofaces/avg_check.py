import json
import sys

from PIL import Image, ImageDraw

d = sys.argv[1]
meta = json.load(open(f'{d}/tiles.json'))
tiles = []
for key, m in meta.items():
    im = Image.open(f'{d}/tiles/{key}.png').convert('RGB')
    s = 160 / im.size[0]
    im = im.resize((160, int(im.size[1] * s)))
    dr = ImageDraw.Draw(im)
    for x, y in m['eyes']:
        dr.ellipse([x * s - 3, y * s - 3, x * s + 3, y * s + 3], outline=(0, 255, 0))
    dr.line([0, m['mouth'] * s, 160, m['mouth'] * s], fill=(255, 0, 0))
    if 'chin' in m:
        dr.line([0, m['chin'] * s, 160, m['chin'] * s], fill=(255, 255, 0))
    dr.text((3, 3), key, fill=(255, 255, 0))
    tiles.append(im.crop((0, 0, 160, 230)))
cols = 12
sheet = Image.new('RGB', (160 * cols, 230 * ((len(tiles) + cols - 1) // cols)))
for i, t in enumerate(tiles):
    sheet.paste(t, (160 * (i % cols), 230 * (i // cols)))
sheet.save(f'{d}/check.jpg', quality=85)
