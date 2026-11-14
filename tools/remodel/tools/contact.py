# contact.py <dir> <phase>: the unit's shots laid out on three sheets (turn, close, motion).
import sys, os, glob
from PIL import Image
d, phase = sys.argv[1], sys.argv[2]
def grid(names, cols, out, cell=(700, 500), crop=None):
    files = [f for f in (os.path.join(d, f'{phase}-{n}.png') for n in names) if os.path.exists(f)]
    if not files: return
    rows = (len(files) + cols - 1) // cols
    sheet = Image.new('RGB', (cell[0] * cols, cell[1] * rows), (20, 20, 20))
    for i, f in enumerate(files):
        im = Image.open(f).convert('RGB')
        if crop:
            w, h = im.size; im = im.crop((int(w * crop[0]), int(h * crop[1]), int(w * crop[2]), int(h * crop[3])))
        im.thumbnail(cell, Image.LANCZOS)
        sheet.paste(im, ((i % cols) * cell[0] + (cell[0] - im.size[0]) // 2, (i // cols) * cell[1] + (cell[1] - im.size[1]) // 2))
    sheet.save(os.path.join(d, f'{phase}-{out}.jpg'), quality=88)
grid(['front', 'threeq', 'side', 'back'], 2, 'sheet-turn', cell=(900, 640))
grid(['head-front', 'head-threeq', 'head-back', 'torso-front', 'torso-threeq', 'builds-front', 'builds-back'], 3, 'sheet-close', cell=(640, 460))
grid([os.path.basename(f)[len(phase) + 1:-4] for f in sorted(glob.glob(os.path.join(d, f'{phase}-motion-*.png')))], 4, 'sheet-motion', cell=(480, 400), crop=(0.2, 0.1, 0.8, 0.95))
