# The wear sheets: python3 wearsheet.py <unit> [labels=clean,worn] -> wear/<unit>-<shot>.jpg, each the labels side by side
# (the shots of wearshots.mjs, wear/shots/<unit>-<shot>-<label>.png), and wear/<unit>-sheet.jpg, the full figure and the
# torso's close-up together.
import os
import sys
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
unit = sys.argv[1]
labels = (sys.argv[2] if len(sys.argv) > 2 else 'clean,worn').split(',')
CROPS = {'full': (150, 40, 610, 1100)}
font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 26)


def row(shot):
    pictures = []
    for label in labels:
        picture = Image.open(os.path.join(HERE, 'wear', 'shots', f'{unit}-{shot}-{label}.png')).convert('RGB')
        if shot in CROPS:
            picture = picture.crop(CROPS[shot])
        pictures.append(picture)
    width, height = pictures[0].size
    sheet = Image.new('RGB', (width * len(pictures) + 8 * (len(pictures) - 1), height + 40), 'white')
    draw = ImageDraw.Draw(sheet)
    for index, (label, picture) in enumerate(zip(labels, pictures)):
        sheet.paste(picture, (index * (width + 8), 40))
        draw.text((index * (width + 8) + 10, 6), f'{unit}: {label}', fill='black', font=font)
    return sheet


rows = {}
for shot in ('full', 'torso', 'torsoBack', 'legs'):
    rows[shot] = row(shot)
    rows[shot].save(os.path.join(HERE, 'wear', f'{unit}-{shot}.jpg'), quality=93)
full, torso = rows['full'], rows['torso']
scale = full.height / torso.height
torso = torso.resize((int(torso.width * scale), full.height), Image.LANCZOS)
both = Image.new('RGB', (full.width + 12 + torso.width, full.height), 'white')
both.paste(full, (0, 0))
both.paste(torso, (full.width + 12, 0))
both.save(os.path.join(HERE, 'wear', f'{unit}-sheet.jpg'), quality=93)
print([(name, picture.size) for name, picture in rows.items()], both.size)
