# cmp.py <unit> [frames...]: before over after, the same moments of the same fight.
import sys
from PIL import Image
unit = sys.argv[1]; fr = sys.argv[2:] or ['10', '19', '27', '31']
W, H = 560, 640
sheet = Image.new('RGB', (W * len(fr), H * 2))
for r, ph in enumerate(['before', 'after']):
    for c, f in enumerate(fr):
        im = Image.open(f'{unit}/{ph}-motion-{f}.png').convert('RGB'); w, h = im.size
        im = im.crop((int(w * .22), int(h * .05), int(w * .78), int(h * .95))); im.thumbnail((W, H)); sheet.paste(im, (c * W, r * H))
sheet.save(f'{unit}/cmp-motion.jpg', quality=88)
