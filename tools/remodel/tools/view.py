# view.py <out.jpg> <columns> <png...>: the pictures side by side, `columns` to a row, each fitted to 700 px wide.
import sys
from PIL import Image
out, cols, files = sys.argv[1], int(sys.argv[2]), sys.argv[3:]
ims = []
for f in files:
    name, _, box = f.partition('@')
    im = Image.open(name).convert('RGB'); w, h = im.size
    if box:
        a, b, c, d = [float(v) for v in box.split(',')]; im = im.crop((int(w * a), int(h * b), int(w * c), int(h * d)))
    im.thumbnail((700, 700)); ims.append(im)
W = max(i.size[0] for i in ims); H = max(i.size[1] for i in ims)
rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (W * cols, H * rows))
for n, im in enumerate(ims): sheet.paste(im, ((n % cols) * W, (n // cols) * H))
sheet.save(out, quality=86)
