# The proof sheet (the user's call, 2026-11-11): for one sex, the Blender model as modelled, the model as the game takes it
# (cut and its arms turned), the game's body at the reference build, and an overlay of the last two (the model's silhouette
# grey, the game's outline red, the area only one covers tinted: blue the model's, red the game's), from the front, the side and
# the back; the renders from tools/blender/baseproof.py. Below it, any further sheets given (the build series).
#   python3 tools/baseproof-sheet.py <render prefix> <title> <out.png> [<sheet.png>...]

import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

prefix, title, out, *below = sys.argv[1:]
VIEWS = ['front', 'side', 'back']
COLUMNS = [('modelled', 'Blender model, as modelled'), ('cut', 'Blender model, as the game takes it'), ('game', 'Game body at the reference build'), ('overlay', 'Overlay: model grey, game outline red')]
BACKGROUND = (92, 92, 92)


def load(key, view):
    return Image.open(f'{prefix}-{key}-{view}.png').convert('RGBA')


def flat(image):
    ground = Image.new('RGBA', image.size, BACKGROUND + (255,))
    return Image.alpha_composite(ground, image).convert('RGB')


cells = []
mismatch = {}
for view in VIEWS:
    row = []
    for key, _ in COLUMNS[:3]:
        row.append(flat(load(key, view)))
    model = np.array(load('cut', view))[:, :, 3] > 127
    game = np.array(load('game', view))[:, :, 3] > 127
    over = np.zeros(model.shape + (3,), np.uint8)
    over[:] = BACKGROUND
    over[model & game] = (190, 190, 190)
    over[model & ~game] = (90, 140, 230)
    over[game & ~model] = (230, 90, 90)
    edge = Image.fromarray((game * 255).astype(np.uint8)).filter(ImageFilter.FIND_EDGES)
    over[np.array(edge) > 0] = (255, 30, 30)
    row.append(Image.fromarray(over))
    # The share of the silhouettes' union only one of them covers.
    mismatch[view] = float((model ^ game).sum()) / max(1, (model | game).sum())
    cells.append(row)
size = cells[0][0].size[0]
header, label = 70, 30
sheet = Image.new('RGB', (size * len(COLUMNS), header + label + size * len(VIEWS)), (60, 60, 60))
draw = ImageDraw.Draw(sheet)
draw.text((14, 10), title, fill=(255, 255, 255))
draw.text((14, 34), 'silhouette mismatch (only one covers / either covers): ' + ', '.join(f'{v} {m * 100:.1f}%' for v, m in mismatch.items()), fill=(220, 220, 220))
for column, (_, name) in enumerate(COLUMNS):
    draw.text((column * size + 10, header + 8), name, fill=(235, 235, 235))
for r, row in enumerate(cells):
    for c, image in enumerate(row):
        sheet.paste(image, (c * size, header + label + r * size))
if below:
    parts = [sheet] + [Image.open(path).convert('RGB') for path in below]
    width = max(p.width for p in parts)
    total = Image.new('RGB', (width, sum(p.height for p in parts)), (60, 60, 60))
    y = 0
    for p in parts:
        total.paste(p, (0, y))
        y += p.height
    sheet = total
sheet.save(out)
print(out, sheet.size, {v: round(m * 100, 1) for v, m in mismatch.items()})
