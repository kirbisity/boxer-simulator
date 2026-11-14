# python3 quick.py <out.jpg> <width> <png>... : the pictures side by side in rows of four, scaled to <width> across.
import sys
from PIL import Image
out, width, files = sys.argv[1], int(sys.argv[2]), sys.argv[3:]
ims = [Image.open(f).convert('RGB') for f in files]
per = min(4, len(ims)); w = width // per; h = int(w * ims[0].height / ims[0].width)
rows = (len(ims) + per - 1) // per
sheet = Image.new('RGB', (w * per, h * rows))
for i, im in enumerate(ims): sheet.paste(im.resize((w, h), Image.LANCZOS), ((i % per) * w, (i // per) * h))
sheet.save(out, quality=86)
