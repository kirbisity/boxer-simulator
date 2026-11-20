# The samurai war masks' relief, authored as height fields over each mask's own unwrapped surface (its atlas), with the
# colour, roughness, metalness and masks that go with it; and the shapes and embossed motifs the arena helmets' sheets use
# too (helmforms.py). Plain Python 3 (numpy, scipy, Pillow). helmbake.py then models each field as real geometry in
# Blender and bakes its normal map and occlusion; packhelm.py packs them into src/helmmaps-data.js.
#
#   python3 tools/blender/helmsheets.py <out dir> [names...]
#
# Every feature is placed in the piece's own measures (head radii, r; x forward, y up, z left as in arenaview.js and
# wardrobe.js), so a rivet is round whatever the region's stretch. What the details are is from the surviving pieces
# (references in src/helmmaps.js): Edo lacquered iron menpo and somen (Met 24176, 22080, 24145, 23997, 31974): fierce
# brows, wrinkles (shiwa), teeth gilt or white, a horsehair moustache, the sweat drain under the chin; the motifs (the
# Gorgon, Hercules, Victory, trophies, palm, dolphins, laurel) from the Pompeii gladiators' helmets.

import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage

N = 1024
PI = math.pi
FONT = '/System/Library/Fonts/Supplemental/Times New Roman Bold.ttf'

BRONZE = np.array([0.93, 0.93, 0.93])
GILT = np.array([1.0, 0.86, 0.52])
HOLE = np.array([0.03, 0.025, 0.02])


class Atlas:
    """A square sheet: height (atlas units, the sheet 1 wide), albedo RGB, roughness, metalness, two masks, and a cut-out."""

    def __init__(self, name, base=BRONZE, rough=0.34, metal=1.0, n=N):
        self.name = name
        self.n = n
        self.h = np.zeros((n, n), np.float32)
        self.alb = np.ones((n, n, 3), np.float32) * np.asarray(base, np.float32)
        self.rough = np.full((n, n), rough, np.float32)
        self.metal = np.full((n, n), metal, np.float32)
        self.mask = np.zeros((n, n), np.float32)
        self.cut = np.ones((n, n), np.float32)
        self.grid = None

    def region(self, rect, to_surface, size):
        return Region(self, rect, to_surface, size)

    def save(self, out):
        for key in ('h', 'alb', 'rough', 'metal', 'mask', 'cut'):
            np.save(os.path.join(out, f'{self.name}_src_{key}.npy'), getattr(self, key))
        if self.grid is not None:
            with open(os.path.join(out, f'{self.name}_grid.json'), 'w') as file:
                json.dump(self.grid, file)
        print('helmsheets:', self.name, flush=True)


class Region:
    """A rectangle of the atlas (u0, v0, u1, v1; v up) and how its pixels lie on the piece: `to_surface(x, y)` (0..1 across
    and up the region) -> dict of named surface coordinates (in r); `size`: its width in r, which sets the height scale."""

    def __init__(self, atlas, rect, to_surface, size):
        self.atlas = atlas
        n = atlas.n
        u0, v0, u1, v1 = rect
        self.cols = slice(int(round(u0 * n)), int(round(u1 * n)))
        self.rows = slice(int(round((1 - v1) * n)), int(round((1 - v0) * n)))
        w = self.cols.stop - self.cols.start
        h = self.rows.stop - self.rows.start
        x = (np.arange(w) + 0.5) / w
        y = 1 - (np.arange(h) + 0.5) / h
        self.x, self.y = np.meshgrid(x, y)
        self.s = to_surface(self.x, self.y)
        # Atlas units per r (the region's width in atlas units over its width on the piece).
        self.k = (u1 - u0) / size
        self.px = 1 / (n * self.k)

    def view(self, key):
        return getattr(self.atlas, key)[self.rows, self.cols]

    def add(self, field):
        """Raise the region by `field` (r)."""
        self.view('h')[...] += field * self.k

    def raise_to(self, field):
        h = self.view('h')
        np.maximum(h, field * self.k, out=h)

    def paint(self, weight, rgb=None, rough=None, metal=None, mask=None, cut=None, mul=None):
        w = np.clip(weight, 0, 1)
        if rgb is not None:
            alb = self.view('alb')
            alb[...] = alb * (1 - w[..., None]) + np.asarray(rgb, np.float32) * w[..., None]
        if mul is not None:
            alb = self.view('alb')
            alb[...] = alb * (1 - w[..., None] + w[..., None] * np.asarray(mul, np.float32))
        for key, value in (('rough', rough), ('metal', metal), ('mask', mask), ('cut', cut)):
            if value is not None:
                view = self.view(key)
                view[...] = view * (1 - w) + value * w

    def blur(self, field, radius):
        """A field smoothed by `radius` r (gaussian)."""
        sigma = max(0.01, radius / self.px)
        return ndimage.gaussian_filter(field, sigma, mode='reflect')


# ---- Shapes over surface coordinates (all in r) ------------------------------------------------------------------------

def smooth(t):
    t = np.clip(t, 0, 1)
    return t * t * (3 - 2 * t)


def cap(d, radius):
    """A dome: 1 at the centre, 0 at `radius`."""
    q = np.clip(1 - (d / radius) ** 2, 0, None)
    return np.sqrt(q)


def dome(d, radius):
    """A soft swelling: 1 at the centre, falling smoothly to 0 at `radius` (no edge)."""
    q = np.clip(1 - (d / radius) ** 2, 0, None)
    return q * q


def bead(d, width):
    """A rounded bead of half-width `width` along a line `d` away."""
    return cap(d, width)


def seg_dist(X, Y, points):
    """Distance to a polyline through `points` [(x, y), ...]."""
    best = np.full(X.shape, np.inf, np.float32)
    for (ax, ay), (bx, by) in zip(points[:-1], points[1:]):
        dx, dy = bx - ax, by - ay
        length = dx * dx + dy * dy or 1e-9
        t = np.clip(((X - ax) * dx + (Y - ay) * dy) / length, 0, 1)
        np.minimum(best, np.hypot(X - ax - t * dx, Y - ay - t * dy), out=best)
    return best


def curve(points, count=48):
    """A Catmull-Rom curve through points, as a polyline."""
    p = [points[0]] + list(points) + [points[-1]]
    out = []
    for i in range(1, len(p) - 2):
        for k in range(count // max(1, len(points) - 1) + 1):
            t = k / (count // max(1, len(points) - 1) + 1)
            a, b, c, d = p[i - 1], p[i], p[i + 1], p[i + 2]
            out.append(tuple(0.5 * (2 * b[j] + (-a[j] + c[j]) * t + (2 * a[j] - 5 * b[j] + 4 * c[j] - d[j]) * t * t + (-a[j] + 3 * b[j] - 3 * c[j] + d[j]) * t ** 3) for j in range(2)))
    out.append(points[-1])
    return out


def ellipse(X, Y, cx, cy, rx, ry, angle=0.0):
    """The ellipse's normalised radius at each point (1 on its edge)."""
    c, s = math.cos(angle), math.sin(angle)
    dx, dy = X - cx, Y - cy
    return np.hypot((dx * c + dy * s) / rx, (-dx * s + dy * c) / ry)


def inside(X, Y, polygon):
    """1 inside a polygon [(x, y), ...] (even-odd), else 0."""
    result = np.zeros(X.shape, bool)
    for (ax, ay), (bx, by) in zip(polygon, polygon[1:] + polygon[:1]):
        cross = ((ay > Y) != (by > Y)) & (X < (bx - ax) * (Y - ay) / ((by - ay) or 1e-9) + ax)
        result ^= cross
    return result.astype(np.float32)


def hammered(region, depth=0.004, size=0.06, seed=1):
    """Hand-raised metal: a field of shallow overlapping blows."""
    rng = np.random.default_rng(seed)
    noise = rng.standard_normal(region.x.shape).astype(np.float32)
    field = region.blur(noise, size)
    field /= field.std() + 1e-9
    region.add(field * depth)
    region.paint(smooth(field * 0.5 + 0.5) * 0.25, mul=(0.94, 0.93, 0.92))


def add_rivets(region, X, Y, points, radius=0.045, height=0.025):
    """Domed rivet heads standing on the surface."""
    field = np.zeros(X.shape, np.float32)
    for (px, py) in points:
        np.maximum(field, cap(np.hypot(X - px, Y - py), radius) * height, out=field)
    region.add(field)
    return field


def text_mask(text, width_px, height_px, size_px):
    image = Image.new('L', (width_px, height_px), 0)
    draw = ImageDraw.Draw(image)
    font = ImageFont.truetype(FONT, size_px)
    box = draw.textbbox((0, 0), text, font=font)
    draw.text(((width_px - box[2] + box[0]) / 2 - box[0], (height_px - box[3] + box[1]) / 2 - box[1]), text, fill=255, font=font)
    return np.asarray(image, np.float32) / 255


def stamp(X, Y, image, x0, y0, x1, y1):
    """An image laid over the surface rectangle (x0, y0)-(x1, y1) (y up), sampled at each point (0 outside)."""
    h, w = image.shape
    u = (X - x0) / (x1 - x0) * (w - 1)
    v = (y1 - Y) / (y1 - y0) * (h - 1)
    ok = (u >= 0) & (u <= w - 1) & (v >= 0) & (v <= h - 1)
    sample = ndimage.map_coordinates(image, [np.clip(v, 0, h - 1), np.clip(u, 0, w - 1)], order=1)
    return np.where(ok, sample, 0).astype(np.float32)


def draw_mask(width_px, height_px, paint):
    image = Image.new('L', (width_px, height_px), 0)
    paint(ImageDraw.Draw(image), width_px, height_px)
    return np.asarray(image, np.float32) / 255


# ---- Embossed motifs (drawn flat, laid on the surface, smoothed into repoussé) -----------------------------------------

def gorgon(draw, w, h):
    """A Gorgon's head: round face, wide eyes, tongue out, snakes for hair, wings at the temples."""
    cx, cy, r = w / 2, h * 0.55, w * 0.26
    for k in range(10):
        a = PI * (0.05 + 0.9 * k / 9)
        x0, y0 = cx + math.cos(a) * r * 0.9, cy - math.sin(a) * r * 0.9
        pts = [(x0 + math.cos(a) * r * t * 0.7 + math.sin(t * 9) * r * 0.08, y0 - math.sin(a) * r * t * 0.7) for t in np.linspace(0, 1, 8)]
        draw.line(pts, fill=150, width=max(2, int(r * 0.12)))
    for side in (-1, 1):
        draw.polygon([(cx + side * r * 0.7, cy - r * 0.6), (cx + side * r * 1.6, cy - r * 1.2), (cx + side * r * 1.3, cy - r * 0.5)], fill=140)
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=210)
    for side in (-1, 1):
        draw.ellipse([cx + side * r * 0.42 - r * 0.2, cy - r * 0.35, cx + side * r * 0.42 + r * 0.2, cy - r * 0.0], fill=255)
        draw.ellipse([cx + side * r * 0.42 - r * 0.08, cy - r * 0.25, cx + side * r * 0.42 + r * 0.08, cy - r * 0.1], fill=150)
    draw.polygon([(cx - r * 0.12, cy - r * 0.1), (cx + r * 0.12, cy - r * 0.1), (cx + r * 0.2, cy + r * 0.25), (cx - r * 0.2, cy + r * 0.25)], fill=245)
    draw.ellipse([cx - r * 0.42, cy + r * 0.38, cx + r * 0.42, cy + r * 0.7], fill=120)
    draw.polygon([(cx - r * 0.12, cy + r * 0.5), (cx + r * 0.12, cy + r * 0.5), (cx, cy + r * 1.0)], fill=230)


def hercules(draw, w, h):
    """Hercules' bearded head under the lion's scalp, the paws knotted below."""
    cx, cy, r = w / 2, h * 0.5, w * 0.24
    draw.ellipse([cx - r * 1.25, cy - r * 1.35, cx + r * 1.25, cy + r * 0.6], fill=150)
    for side in (-1, 1):
        draw.ellipse([cx + side * r * 0.9 - r * 0.3, cy - r * 1.5, cx + side * r * 0.9 + r * 0.3, cy - r * 0.95], fill=170)
    draw.ellipse([cx - r * 0.8, cy - r * 0.9, cx + r * 0.8, cy + r * 0.7], fill=215)
    for k in range(9):
        a = PI * (1.1 + 0.8 * k / 8)
        draw.ellipse([cx + math.cos(a) * r * 0.75 - r * 0.2, cy + r * 0.35 - math.sin(a) * r * 0.55 - r * 0.2, cx + math.cos(a) * r * 0.75 + r * 0.2, cy + r * 0.35 - math.sin(a) * r * 0.55 + r * 0.2], fill=235)
    for side in (-1, 1):
        draw.ellipse([cx + side * r * 0.32 - r * 0.15, cy - r * 0.4, cx + side * r * 0.32 + r * 0.15, cy - r * 0.2], fill=250)
    draw.line([(cx - r * 0.55, cy - r * 0.6), (cx + r * 0.55, cy - r * 0.6)], fill=250, width=max(2, int(r * 0.12)))
    draw.polygon([(cx - r * 0.1, cy - r * 0.3), (cx + r * 0.1, cy - r * 0.3), (cx + r * 0.16, cy + r * 0.12), (cx - r * 0.16, cy + r * 0.12)], fill=250)
    for side in (-1, 1):
        draw.line([(cx + side * r * 0.4, cy + r * 1.05), (cx - side * r * 0.5, cy + r * 1.5)], fill=200, width=max(2, int(r * 0.25)))


def palm(draw, w, h):
    """A palm branch, the victor's: a stem and leaflets swept up."""
    cx = w / 2
    draw.line([(cx, h * 0.97), (cx, h * 0.05)], fill=240, width=max(2, w // 22))
    for k in range(13):
        y = h * (0.12 + 0.065 * k)
        length = w * (0.18 + 0.28 * math.sin(PI * (k + 1) / 14))
        for side in (-1, 1):
            draw.line([(cx, y), (cx + side * length, y - length * 0.55)], fill=210, width=max(2, w // 34))


def dolphin(draw, w, h):
    pts = [(w * (0.08 + 0.84 * t), h * (0.55 - 0.32 * math.sin(PI * t * 1.1))) for t in np.linspace(0, 1, 18)]
    draw.line(pts, fill=220, width=max(3, h // 5))
    draw.polygon([(w * 0.86, h * 0.5), (w * 0.99, h * 0.25), (w * 0.99, h * 0.8)], fill=220)
    draw.polygon([(w * 0.42, h * 0.25), (w * 0.52, h * 0.02), (w * 0.58, h * 0.25)], fill=200)
    draw.ellipse([w * 0.1, h * 0.38, w * 0.16, h * 0.48], fill=255)


def victory(draw, w, h):
    """A winged Victory holding out a wreath: a draped body, two wings, a raised arm."""
    cx = w * 0.5
    draw.polygon([(cx - w * 0.12, h * 0.95), (cx + w * 0.14, h * 0.95), (cx + w * 0.06, h * 0.35), (cx - w * 0.05, h * 0.35)], fill=220)
    draw.ellipse([cx - w * 0.06, h * 0.2, cx + w * 0.06, h * 0.34], fill=240)
    draw.polygon([(cx - w * 0.04, h * 0.4), (cx - w * 0.45, h * 0.08), (cx - w * 0.3, h * 0.55)], fill=170)
    draw.polygon([(cx + w * 0.04, h * 0.4), (cx + w * 0.4, h * 0.02), (cx + w * 0.26, h * 0.5)], fill=170)
    draw.line([(cx + w * 0.04, h * 0.42), (cx + w * 0.34, h * 0.3)], fill=230, width=max(2, w // 16))
    draw.ellipse([cx + w * 0.3, h * 0.2, cx + w * 0.46, h * 0.36], outline=255, width=max(2, w // 22))


def trophy(draw, w, h):
    """A trophy (tropaeum): a cuirass and helmet on a post, shields and spears either side."""
    cx = w / 2
    draw.line([(cx, h * 0.98), (cx, h * 0.12)], fill=200, width=max(2, w // 14))
    draw.polygon([(cx - w * 0.16, h * 0.3), (cx + w * 0.16, h * 0.3), (cx + w * 0.12, h * 0.62), (cx - w * 0.12, h * 0.62)], fill=235)
    draw.ellipse([cx - w * 0.09, h * 0.1, cx + w * 0.09, h * 0.28], fill=245)
    for side in (-1, 1):
        draw.ellipse([cx + side * w * 0.3 - w * 0.13, h * 0.32, cx + side * w * 0.3 + w * 0.13, h * 0.62], fill=210)
        draw.line([(cx + side * w * 0.08, h * 0.95), (cx + side * w * 0.45, h * 0.05)], fill=180, width=max(2, w // 26))


def eagle(draw, w, h):
    cx = w / 2
    draw.polygon([(cx, h * 0.15), (cx - w * 0.48, h * 0.35), (cx - w * 0.3, h * 0.55), (cx, h * 0.45), (cx + w * 0.3, h * 0.55), (cx + w * 0.48, h * 0.35)], fill=200)
    draw.polygon([(cx - w * 0.1, h * 0.4), (cx + w * 0.1, h * 0.4), (cx + w * 0.14, h * 0.85), (cx - w * 0.14, h * 0.85)], fill=235)
    draw.ellipse([cx - w * 0.07, h * 0.05, cx + w * 0.07, h * 0.22], fill=250)


def scroll_band(draw, w, h, waves=10):
    """A running wave (the Vitruvian scroll)."""
    pts = []
    for k in range(waves * 24 + 1):
        t = k / 24
        pts.append((w * t / waves, h * (0.5 - 0.32 * math.sin(t * 2 * PI))))
    draw.line(pts, fill=230, width=max(2, h // 8))
    for k in range(waves):
        x = w * (k + 0.25) / waves
        draw.ellipse([x - h * 0.13, h * 0.3, x + h * 0.13, h * 0.56], fill=230)


def laurel(draw, w, h, leaves=18):
    draw.line([(0, h / 2), (w, h / 2)], fill=200, width=max(2, h // 10))
    for k in range(leaves):
        x = w * (k + 0.5) / leaves
        for side in (-1, 1):
            draw.ellipse([x - w / leaves * 0.55, h / 2 + side * h * 0.12 - h * 0.18, x + w / leaves * 0.25, h / 2 + side * h * 0.12 + h * 0.18], fill=235)


def emboss(region, X, Y, paint, rect, height, soft=0.012, gild=0.0, px=512):
    """A motif drawn by `paint` laid over surface rectangle `rect` (x0, y0, x1, y1), raised `height` (r) and smoothed;
    `gild`: how much of the raised work is gilt."""
    x0, y0, x1, y1 = rect
    aspect = (y1 - y0) / (x1 - x0)
    image = draw_mask(px, max(8, int(px * aspect)), paint)
    field = region.blur(stamp(X, Y, image, *rect), soft)
    region.add(field * height)
    if gild:
        region.paint(smooth(field * 3) * gild, rgb=GILT, rough=0.22)
    return field


# ---- The samurai war masks -----------------------------------------------------------------------------------------------

# Each mask is a patch of a sphere (radius R, `az` either side of the front, from polar angle `top` to `bottom`), displaced
# out by its relief: the coarse part goes to the mesh (`grid`, sampled here), the rest to the maps. u: the angle from the
# middle (folded: the two halves mirror), v: up.
# The samurai's war mask: the menpō (the half mask from under the eyes to under the chin), one design, drawn in the kit's
# finish (russet iron, black or red lacquer: src/wardrobe.js). `top` reaches up to the cheek wings beside the eyes.
MASKS = {
    'maskMenpo': {'R': 1.1, 'az': 0.44 * PI, 'top': 0.375 * PI, 'bottom': 0.88 * PI},
}
GRID = 17
# The menpō's mesh is finer than the world masks' (its nose, cheekbones, lips and chin are modelled, not painted).
MENPO_GRID = 33
# u = (angle / az) ** MASK_U_POWER: more of the sheet for the middle of the face, less for the cheeks.
MASK_U_POWER = 0.6
LACQUER = np.array([0.82, 0.82, 0.82])


def mask_surface(spec):
    def to(x, y):
        polar = spec['bottom'] - y * (spec['bottom'] - spec['top'])
        az = x ** (1 / MASK_U_POWER) * spec['az']
        return {'X': az * spec['R'] * np.sin(polar), 'Y': spec['R'] * np.cos(polar), 'az': az, 'polar': polar}
    return to


def wrinkle(X, Y, points, width=0.018, depth=0.015):
    return -bead(seg_dist(X, Y, curve(points, 30)), width) * depth


def teeth(region, X, Y, y_top, y_bottom, x_max, count, colour, metal, rough, h=0.03, down=True):
    """A row of teeth from the centre line out to `x_max`: rounded blocks with dark gaps between, their tips rounded."""
    pitch = x_max / count
    k = np.floor(X / pitch)
    local = np.abs(X - (k + 0.5) * pitch)
    lo, hi = min(y_top, y_bottom), max(y_top, y_bottom)
    tip_y = lo if down else hi
    rounding = np.clip(1 - np.abs(Y - tip_y) / (0.35 * (hi - lo)), 0, 1) * pitch * 0.18
    block = smooth((0.42 * pitch - rounding - local) / (0.06 * pitch)) * smooth((Y - lo) / 0.008) * smooth((hi - Y) / 0.008) * (X < x_max)
    region.add(block * h * cap(local, 0.5 * pitch))
    region.paint(block, rgb=colour, metal=metal, rough=rough, mask=0.0)
    region.paint(smooth((Y - lo) / 0.008) * smooth((hi - Y) / 0.008) * (X < x_max) * (1 - block), rgb=HOLE, rough=1.0, metal=0.0, mask=0.0)
    return block

# The menpō, from the surviving 17th-century pieces (the russet-iron menpō with its laced yodarekake and the red-lacquered
# inside, Met 31974 and the like; references in src/helmmaps.js), in the sheet's own measures (r; X across from the middle,
# Y up, as drawn on the sphere before helmforms.js MASK_FITS sets it on the face):
#   `outline` the right half's edge, from the nose bridge round the cheek wing and the jaw to the chin's foot;
#   `nose` the profile [(Y, height, half-width)] down the hooked nose; `alae` its wings; `nostril` the slits under them;
#   `cheek` the cheekbones; `crease` the line from the nose's wing past the mouth's corner (the cheek swells over it);
#   `mouth` the open grimace (centre Y, half-width, half-height), its lips standing forward; `chin` the jutting chin;
#   `flare` how far the cheek wings stand off at their edge; `lines` the pitch and depth of the grooves the iron was
#   finished in (round the mouth, and down the nose); `drain` the sweat hole under the chin.
MENPO = {
    'outline': [(-0.05, 0.38), (0.0, 0.38), (0.08, 0.37), (0.13, 0.25), (0.19, 0.08), (0.3, -0.01), (0.48, 0.03), (0.68, 0.15),
                (0.86, 0.3), (1.0, 0.4), (1.13, 0.39), (1.2, 0.2), (1.21, -0.12), (1.14, -0.42), (0.98, -0.66), (0.76, -0.84),
                (0.5, -0.96), (0.24, -1.02), (0.0, -1.04), (-0.05, -1.04)],
    'nose': [(0.38, 0.05, 0.075), (0.22, 0.11, 0.08), (0.06, 0.2, 0.09), (-0.05, 0.29, 0.12), (-0.11, 0.27, 0.15), (-0.16, 0.14, 0.15), (-0.21, 0.0, 0.12)],
    'alae': ((0.135, -0.12), 0.085, 0.13),
    'nostril': ((0.075, -0.165), 0.045, 0.02, 0.4),
    'cheek': ((0.52, -0.1), 0.38, 0.07),
    'crease': [(0.19, -0.1), (0.28, -0.25), (0.35, -0.42), (0.36, -0.56)],
    'mouth': (-0.42, 0.25, 0.072),
    'chin': ((0.0, -0.77), 0.3, 0.22, 0.09),
    'flare': 0.06,
    'lines': (0.026, 0.0028),
    'drain': (0.0, -0.95, 0.03),
}


def nose_profile(Y):
    """The nose's height and half-width at each Y, along MENPO['nose'] (zero above and below it)."""
    ys = [p[0] for p in MENPO['nose']][::-1]
    hs = [p[1] for p in MENPO['nose']][::-1]
    ws = [p[2] for p in MENPO['nose']][::-1]
    inside_nose = (Y <= ys[-1]) & (Y >= ys[0])
    return np.interp(Y, ys, hs) * inside_nose, np.interp(Y, ys, ws)


def outline_field(X, Y, polygon, soft):
    """The outline as a soft step: 1 well inside, 0 outside, `soft` r wide."""
    inner = inside(X, Y, polygon)
    edge = seg_dist(X, Y, polygon + polygon[:1])
    signed = np.where(inner > 0.5, edge, -edge)
    return smooth(signed / soft + 0.5), signed


def mask_atlas(name):
    spec = MASKS[name]
    atlas = Atlas(name, base=LACQUER, rough=0.36, metal=0.0)
    region = atlas.region((0, 0, 1, 1), mask_surface(spec), spec['az'] * spec['R'])
    X, Y = region.s['X'], region.s['Y']
    region.paint(np.ones(X.shape), mask=1.0)
    m = MENPO
    outline, signed = outline_field(X, Y, m['outline'], 0.02)

    # ---- The form: what the mesh carries (smoothed), the rest in the maps.
    relief = np.zeros(X.shape, np.float32)
    # The hooked nose: a ridge down the middle, highest just above its tip, its wings either side.
    height, half = nose_profile(Y)
    across = np.clip(1 - (X / half) ** 2, 0, None)
    nose = height * across ** 1.2
    (ax, ay), ar, ah = m['alae']
    nose = np.maximum(nose, dome(np.hypot(X - ax, (Y - ay) * 1.3), ar) * ah)
    relief += nose
    # The cheekbones, and the cheek swelling over the crease from the nose to the mouth's corner.
    (cx, cy), cr, ch = m['cheek']
    relief += dome(np.hypot(X - cx, (Y - cy) * 1.2), cr) * ch
    crease_d = seg_dist(X, Y, curve(m['crease'], 30))
    beside = X > np.interp(Y, [p[1] for p in m['crease']][::-1], [p[0] for p in m['crease']][::-1])
    relief += dome(crease_d, 0.16) * 0.045 * beside - bead(crease_d, 0.035) * 0.03
    # The upper lip and the lips round the open mouth, standing forward; the groove under the lower lip; the chin.
    my, mw, mh = m['mouth']
    mouth = ellipse(X, Y, 0.0, my - 0.035 * (X / mw) ** 2, mw, mh)
    relief += dome(ellipse(X, Y, 0.0, my + 0.05, 0.4, 0.26), 1.0) * 0.08
    relief += bead(np.abs(mouth - 1.25), 0.45) * 0.03
    relief -= bead(np.abs(Y - (my - 0.17) + 0.06 * (X / 0.3) ** 2), 0.05) * 0.02 * (np.abs(X) < 0.32)
    (chx, chy), crx, cry, chh = m['chin']
    relief += dome(ellipse(X, Y, chx, chy, crx, cry), 1.0) * chh
    # The cheek wings standing off the face at their edge (flared, as forged: the cord passes behind them).
    relief += smooth((X - 0.9) / 0.35) * smooth((Y + 0.75) / 0.3) * m['flare']
    # The mouth is open: nothing of the form inside it.
    relief *= smooth((mouth - 0.9) / 0.1)
    coarse = mask_grid(atlas, region, relief, spec, MENPO_GRID, 0.03)
    region.add(relief - coarse)

    # ---- The fine work, in the maps.
    # The grooves the iron was finished in: round the mouth in widening rings (horizontal over the chin, slanting up the
    # cheeks), and straight down the nose.
    pitch, depth = m['lines']
    rings = np.hypot(X / 1.05, (Y - my) / 0.78)
    groove = (0.5 + 0.5 * np.cos(2 * PI * rings / pitch)) ** 6
    down_nose = (0.5 + 0.5 * np.cos(2 * PI * (X / np.maximum(half, 0.05)) * 0.11 / pitch)) ** 6
    on_nose = smooth(nose / 0.06)
    region.add(-(groove * (1 - on_nose) + down_nose * on_nose) * depth)
    hammered(region, 0.0012, 0.04, seed=7)
    # The nostrils: slits under the wings.
    (nx, ny), nrx, nry, nang = m['nostril']
    nostril = ellipse(X, Y, nx, ny, nrx, nry, nang)
    region.add(-smooth((1 - nostril) / 0.35) * 0.03)
    region.paint(smooth((1 - nostril) / 0.3), rgb=HOLE, rough=1.0, mask=0.0)
    # The mouth's rim: a rolled edge round the opening, dark just inside it; the opening cut out.
    region.add(bead(np.abs(mouth - 1.04), 0.06) * 0.012)
    region.paint(smooth((1.0 - mouth) / 0.04), rgb=HOLE, rough=1.0, mask=0.0)
    # The sweat drain under the chin.
    dx, dy, dr = m['drain']
    drain = np.hypot(X - dx, Y - dy)
    region.add(bead(np.abs(drain - dr), 0.012) * 0.01 - smooth((dr - drain) / 0.008) * 0.015)
    region.paint(smooth((dr - 0.004 - drain) / 0.006), rgb=HOLE, rough=1.0, mask=0.0)
    # The iron's own unevenness: a few shades of russet (the tint gives the colour).
    rng = np.random.default_rng(5)
    mottle = region.blur(rng.standard_normal(X.shape).astype(np.float32), 0.05)
    mottle /= mottle.std() + 1e-9
    region.paint(np.ones(X.shape), mul=(1 + 0.06 * mottle[..., None]) * np.ones(3, np.float32))
    # The rolled edge round the outline, and the outline cut.
    region.add(bead(np.abs(signed - 0.018), 0.018) * 0.012)
    region.paint(1 - outline, cut=0.0)
    region.paint(smooth((1.02 - mouth) / 0.02), cut=0.0)
    # Wear: the lacquer rubbed thin on every raised edge.
    h = region.view('h') / region.k
    wear = smooth((h - region.blur(h, 0.035)) * 160) * region.view('mask')
    region.paint(wear * 0.7, rgb=LACQUER + 0.14)
    return atlas


def mask_grid(atlas, region, relief, spec, size=GRID, blur=0.06):
    """The coarse relief the mesh carries: `relief` (smoothed by `blur` r) sampled on a `size` x `size` lattice over (u, v),
    v from the bottom (the mesh's vertices, src/menpo.js). Returns the smoothed relief: what the mesh shows, so the maps
    carry only the rest."""
    smoothed = region.blur(relief, blur)
    n = relief.shape[0]
    idx = np.linspace(0, n - 1, size)
    rows = np.round(idx[::-1]).astype(int)
    cols = np.round(idx).astype(int)
    lattice = smoothed[np.ix_(rows, cols)]
    atlas.grid = {'size': size, 'R': spec['R'], 'az': spec['az'], 'top': spec['top'], 'bottom': spec['bottom'],
                  'power': MASK_U_POWER, 'heights': [round(float(v), 4) for v in lattice.reshape(-1)]}
    return smoothed


# ---- The war masks of China, the steppe and the sultanates ------------------------------------------------------------

# Quick variants on the samurai masks' two patches: a whole face (the oni somen's sphere, its features drawn 0.12 r low the
# same way) or a lower face (the menpo's). Smaller sheets (WORLD_N, packed at 256). References: src/menpo.js.
FULL = {'R': 1.12, 'az': 0.42 * PI, 'top': 0.2 * PI, 'bottom': 0.86 * PI}
HALF = {'R': 1.1, 'az': 0.44 * PI, 'top': 0.42 * PI, 'bottom': 0.88 * PI}
WORLD_MASKS = {
    'maskTiemian': FULL, 'maskShoumian': FULL, 'maskKipchak': FULL, 'maskHorde': FULL,
    'maskVentail': HALF,
}
WORLD_N = 512
METAL = np.array([0.8, 0.8, 0.8])


def mail(region, X, Y, pitch=0.075, height=0.012):
    """Riveted mail: rows of rings, each row offset half a ring, the dark between them. Returns the rings' weight."""
    field = np.zeros(X.shape, np.float32)
    for shift in (0.0, 0.5):
        row = np.floor(Y / pitch - shift)
        cy = (row + 0.5 + shift) * pitch
        offset = (row % 2) * 0.5 * pitch
        cx = np.round((X - offset) / pitch) * pitch + offset
        d = np.hypot(X - cx, (Y - cy) * 1.15)
        np.maximum(field, bead(np.abs(d - 0.36 * pitch), 0.14 * pitch), out=field)
    region.add(field * height)
    region.paint(smooth((0.25 - field) * 6) * 0.85, rgb=HOLE, rough=1.0, metal=0.0, mask=0.0)
    return field


def eye_hole(region, X, Y, cx, cy, rx, ry, angle=0.0, rim=0.012):
    """An eye opening, a raised lip round it: dark, as the oni somen's (cut through, the face behind it reads as a glow)."""
    eye = ellipse(X, Y, cx, cy, rx, ry, angle)
    region.add(bead(np.abs(eye - 1.08), 0.2) * rim)
    region.paint(smooth((1.0 - eye) / 0.05), rgb=HOLE, rough=1.0, metal=0.0, mask=0.0)
    return eye


def world_mask_atlas(name):
    spec = WORLD_MASKS[name]
    atlas = Atlas(name, base=METAL, rough=0.42, metal=1.0, n=WORLD_N)
    region = atlas.region((0, 0, 1, 1), mask_surface(spec), spec['az'] * spec['R'])
    X, Y = region.s['X'], region.s['Y']
    region.paint(np.ones(X.shape), mask=1.0)
    width = spec['az'] * spec['R']
    relief = np.zeros(X.shape, np.float32)
    if spec is FULL:
        Y = Y + 0.12
        outline = smooth((0.9 * width - X - np.clip(-0.45 - Y, 0, None) * 0.9) / 0.04)
        if name == 'maskKipchak':
            # Squarer: straight sides down to a straight jaw line, the corners only a little rounded.
            corner = 0.14
            qx = X - (0.86 * width - corner)
            qy = -0.8 - Y + corner
            d = np.hypot(np.maximum(qx, 0), np.maximum(qy, 0)) + np.minimum(np.maximum(qx, qy), 0) - corner
            outline = smooth(-d / 0.04)
    else:
        outline = smooth((0.97 * width - X - np.clip(Y - 0.0, 0, None) * 0.8 - np.clip(-0.72 - Y, 0, None) * 1.2) / 0.04)
    after = []
    if name in ('maskTiemian', 'maskKipchak'):
        # A stern man's face hammered in iron: brows (joined over the nose on the steppe mask), almond eyes cut through, a
        # long straight nose, the cheekbones, a closed mouth, the moustache raised in relief (incised hairs), a small beard.
        relief += dome(ellipse(X, Y, 0.0, 0.05, 1.0, 0.9), 1.0) * 0.07
        relief += dome(ellipse(X, Y, 0.36, -0.08, 0.2, 0.16), 1.0) * 0.05
        nose = dome(seg_dist(X, Y, [(0, 0.3), (0, -0.12)]), 0.1) * 0.12 + dome(ellipse(X, Y, 0.0, -0.13, 0.1, 0.07), 1.0) * 0.06
        relief += nose
        relief += dome(ellipse(X, Y, 0.0, -0.66, 0.2, 0.16), 1.0) * 0.05
        joined = name == 'maskKipchak'
        brow_pts = [(0.0, 0.3), (0.14, 0.31), (0.3, 0.3), (0.44, 0.24)] if joined else [(0.07, 0.29), (0.2, 0.32), (0.36, 0.3), (0.46, 0.24)]
        brow = seg_dist(X, Y, curve(brow_pts, 24))
        relief += bead(brow, 0.045) * 0.035
        moustache = curve([(0.0, -0.3), (0.1, -0.31), (0.2, -0.36), (0.27, -0.46) if joined else (0.26, -0.42)], 24)
        m = bead(seg_dist(X, Y, moustache), 0.04) * smooth((0.3 - X) / 0.05)
        relief += m * 0.03
        after.append(lambda m=m: region.add(-np.abs(np.sin((X * 0.8 + Y) * 180)) * m * 0.004))
        mouth = np.abs(Y + 0.39 + 0.03 * (X / 0.15) ** 2)
        after.append(lambda mouth=mouth: (region.add(-bead(mouth, 0.012) * smooth((0.16 - X) / 0.03) * 0.02), region.paint(bead(mouth, 0.008) * smooth((0.15 - X) / 0.03), rgb=HOLE, rough=1.0, metal=0.0, mask=0.0)))
        if name == 'maskTiemian':
            beard = dome(ellipse(X, Y, 0.0, -0.6, 0.06 + 0.04 * smooth((Y + 0.66) / 0.14), 0.1), 1.0)
            relief += beard * 0.025
            after.append(lambda beard=beard: region.add(-np.abs(np.sin(X * 220)) * beard * 0.004))
        nostril = ellipse(X, Y, 0.05, -0.16, 0.03, 0.018)
        after.append(lambda nostril=nostril: (region.add(-smooth((1 - nostril) / 0.3) * 0.02), region.paint(smooth((1 - nostril) / 0.3), rgb=HOLE, rough=1.0, metal=0.0, mask=0.0)))
        after.append(lambda: eye_hole(region, X, Y, 0.24, 0.16, 0.11, 0.045, -0.12))
        # The holes for the laces that hang it from the helmet, round its edge.
        after.append(lambda: [region.paint(smooth((0.016 - np.hypot(X - x, Y - y)) / 0.006), rgb=HOLE, rough=1.0, metal=0.0, mask=0.0) for x, y in ((0.9 * width - 0.07, 0.5), (0.9 * width - 0.07, 0.0), (0.9 * width - 0.08, -0.4), (0.0, 0.92))])
    elif name == 'maskShoumian':
        # A guardian beast's face in bronze (the shoumian): bulging eyes under curled brows, a broad snout, the mouth
        # open on fangs, cloud scrolls on the brow and cheeks.
        relief += dome(ellipse(X, Y, 0.0, 0.05, 1.0, 0.9), 1.0) * 0.08
        eye = ellipse(X, Y, 0.26, 0.15, 0.12, 0.09)
        relief += dome(eye, 1.25) * 0.06
        relief += dome(ellipse(X, Y, 0.0, -0.08, 0.2, 0.15), 1.0) * 0.14
        relief += dome(ellipse(X, Y, 0.4, -0.15, 0.2, 0.18), 1.0) * 0.06
        mouth = ellipse(X, Y, 0.0, -0.4 - 0.04 * (X / 0.3) ** 2, 0.3, 0.1)
        relief += bead(np.abs(mouth - 1.0), 0.3) * 0.035
        brow = curve([(0.06, 0.27), (0.2, 0.33), (0.38, 0.32), (0.44, 0.26), (0.4, 0.22)], 30)
        relief += bead(seg_dist(X, Y, brow), 0.05) * 0.04
        after.append(lambda: region.paint(smooth((0.98 - mouth) / 0.06), rgb=HOLE, rough=1.0, metal=0.0, mask=0.0))
        after.append(lambda: teeth(region, X, Y, -0.33, -0.39, 0.22, 4, METAL, 1.0, 0.35, 0.025))
        for x0, y0, y1 in ((0.2, -0.32, -0.5), (0.14, -0.5, -0.33)):
            fang = bead(seg_dist(X, Y, [(x0, y0), (x0 + 0.01, y1)]), 0.028) * smooth(1 - np.abs(Y - (y0 + y1) / 2) / abs(y1 - y0) * 1.6)
            after.append(lambda fang=fang: (region.add(fang * 0.04), region.paint(smooth(fang * 4), rgb=METAL, mask=1.0, metal=1.0, rough=0.3)))
        # The pupils, dark.
        after.append(lambda: region.paint(smooth((0.035 - np.hypot(X - 0.26, Y - 0.15)) / 0.01), rgb=HOLE, rough=1.0, metal=0.0, mask=0.0))
        after.append(lambda: region.add(-bead(np.abs(np.hypot(X - 0.26, Y - 0.15) - 0.06), 0.01) * 0.008))
        nostril = ellipse(X, Y, 0.09, -0.12, 0.05, 0.03, 0.4)
        after.append(lambda nostril=nostril: (region.add(-smooth((1 - nostril) / 0.3) * 0.03), region.paint(smooth((1 - nostril) / 0.3), rgb=HOLE, rough=1.0, metal=0.0, mask=0.0)))
        # Cloud scrolls: incised spirals on the brow and cheeks.
        for cx, cy, s in ((0.12, 0.62, 0.09), (0.36, 0.55, 0.08), (0.5, -0.32, 0.08), (0.62, 0.15, 0.07)):
            spiral = [(cx + s * t / 6 * math.cos(t), cy + s * t / 6 * math.sin(t)) for t in np.linspace(0, 6, 30)]
            after.append(lambda spiral=spiral: region.add(wrinkle(X, Y, spiral, 0.01, 0.012)))
    elif name == 'maskHorde':
        # A half-mask of gilt iron over the upper face (the Cuman and Golden Horde type): the brows raised, drawn down into
        # the almond cut-outs of the eyes, a beak-shaped nose riveted on; it stops over the upper lip.
        outline *= smooth((Y + 0.27 - 0.1 * (X / 0.5) ** 2) / 0.03)
        outline *= smooth((0.62 * width - X) / 0.04)
        relief += dome(ellipse(X, Y, 0.0, 0.2, 0.9, 0.7), 1.0) * 0.06
        nose = np.clip(1 - np.hypot(X / 0.1, (Y + 0.02) / 0.26), 0, None) ** 1.2 * (0.1 + 0.08 * smooth((0.1 - Y) / 0.3))
        relief += nose
        brow = curve([(0.04, 0.27), (0.18, 0.32), (0.34, 0.29), (0.44, 0.2)], 24)
        relief += bead(seg_dist(X, Y, brow), 0.05) * 0.04
        after.append(lambda: eye_hole(region, X, Y, 0.24, 0.17, 0.12, 0.05, -0.15, 0.015))
        after.append(lambda: add_rivets(region, X, Y, [(0.0, 0.3), (0.0, 0.1), (0.0, -0.08), (0.42, 0.62), (0.15, 0.78)], 0.026, 0.02))
        after.append(lambda: region.add(-bead(np.abs(X - 0.1), 0.006) * smooth((0.28 - np.abs(Y - 0.02)) / 0.02) * 0.008))
    else:
        # The ventail: mail laced across the lower face from cheek to cheek, from under the eyes to under the chin, its
        # top edge a riveted iron plate over the nose and cheekbones, a riveted strip down the middle where it fastens.
        outline *= smooth((0.12 - 0.12 * np.exp(-((X - 0.28) / 0.18) ** 2) - Y) / 0.03)
        relief += dome(ellipse(X, Y, 0.0, -0.4, 1.0, 0.8), 1.0) * 0.04 + dome(ellipse(X, Y, 0.0, -0.06, 0.13, 0.2), 1.0) * 0.08
        relief += smooth((-0.6 - Y) / 0.4) * 0.06
        top = 0.12 - 0.12 * np.exp(-((X - 0.28) / 0.18) ** 2)
        plate = smooth((Y - (top - 0.12)) / 0.01)
        strip = smooth((0.05 - X) / 0.01) * smooth((top - 0.1 - Y) * 50) * smooth((Y + 0.86) / 0.02)
        after.append(lambda: mail(region, X, Y))
        after.append(lambda plate=plate, strip=strip: (region.add(np.maximum(plate, strip) * 0.018), region.paint(np.maximum(plate, strip), rgb=METAL, rough=0.4, metal=1.0, mask=1.0)))
        after.append(lambda: add_rivets(region, X, Y, [(x, 0.12 - 0.12 * math.exp(-((x - 0.28) / 0.18) ** 2) - 0.06) for x in (0.08, 0.22, 0.36, 0.52, 0.68, 0.86, 1.04, 1.22)] + [(0.0, y) for y in (-0.2, -0.38, -0.56, -0.74)], 0.022, 0.016))
    region.add(relief - mask_grid(atlas, region, relief, spec))
    for step in after:
        step()
    if name != 'maskVentail':
        hammered(region, 0.003, 0.05, seed=len(name))
    region.add(bead(np.abs(outline - 0.5) * 0.08, 0.03) * 0.02)
    region.paint(1 - outline, cut=0.0)
    # Wear: the raised edges rubbed bright (under the lacquer's undercoat threshold, src/helmmaps.js: no red).
    h = region.view('h') / region.k
    wear = smooth((h - region.blur(h, 0.035)) * 160) * region.view('mask')
    region.paint(wear * 0.6, rgb=METAL + 0.05)
    return atlas



# The steppe man's iron face (maskKipchak: the Cuman's, and the khan's guard's), modelled as the menpō is: from the
# surviving Kipchak masks (the Lipovets mask; references in src/helmmaps.js) and the hammered steel faces of the type:
# brows arched over each eye and joined over the nose, the top edge following them; almond eyes cut through under heavy
# lids; a long straight nose, flared at the wings; hollow cheeks under the cheekbones; the moustache standing out in relief,
# swept past the mouth's corners and curled up at its ends, its hairs incised; closed lips; a rounded chin; the whole
# raised under the hammer, its pits left in it. In the sheet's measures (r; X across, Y up as drawn on the FULL sphere,
# set on the face by helmforms.js MASK_FITS.kipchak: Y 0.04 the eyes, -0.49 the mouth, -1.0 the chin's foot).
KIPCHAK = {
    'outline': [(-0.05, 0.5), (0.0, 0.5), (0.1, 0.57), (0.26, 0.61), (0.44, 0.58), (0.7, 0.55), (0.95, 0.5), (1.13, 0.36),
                (1.21, 0.05), (1.2, -0.38), (1.1, -0.68), (0.82, -0.9), (0.42, -1.0), (0.0, -1.03), (-0.05, -1.03)],
    'brow': [(0.0, 0.33), (0.08, 0.37), (0.2, 0.4), (0.34, 0.37), (0.46, 0.28), (0.53, 0.17)],
    'eye': (0.235, 0.06, 0.125, 0.047, -0.1),
    'nose': [(0.36, 0.05, 0.05), (0.2, 0.1, 0.055), (0.0, 0.15, 0.065), (-0.17, 0.21, 0.08), (-0.24, 0.13, 0.11), (-0.28, 0.0, 0.1)],
    'moustache': [(0.0, -0.34), (0.08, -0.35), (0.18, -0.39), (0.28, -0.47), (0.36, -0.5), (0.43, -0.46), (0.45, -0.39)],
    'mouth': -0.5,
    'chin': ((0.0, -0.76), 0.22, 0.18, 0.06),
}


def kipchak_atlas(name):
    spec = WORLD_MASKS[name]
    atlas = Atlas(name, base=METAL, rough=0.38, metal=1.0)
    region = atlas.region((0, 0, 1, 1), mask_surface(spec), spec['az'] * spec['R'])
    X, Y = region.s['X'], region.s['Y']
    region.paint(np.ones(X.shape), mask=1.0)
    k = KIPCHAK
    outline, signed = outline_field(X, Y, k['outline'], 0.02)
    relief = np.zeros(X.shape, np.float32)
    # The face's planes: the brow forward, the cheekbones, the cheeks hollow beneath them, the chin.
    relief += dome(ellipse(X, Y, 0.0, 0.0, 0.8, 1.0), 1.0) * 0.06
    relief += dome(np.hypot(X - 0.42, (Y + 0.08) * 1.3), 0.22) * 0.045
    relief -= dome(np.hypot(X - 0.42, (Y + 0.36) * 1.1), 0.2) * 0.035
    (cx, cy), crx, cry, ch = k['chin']
    relief += dome(ellipse(X, Y, cx, cy, crx, cry), 1.0) * ch
    # The brows: one ridge arched over each eye, joined over the nose.
    brow = seg_dist(X, Y, curve(k['brow'], 40))
    relief += bead(brow, 0.07) * 0.06
    # The eye sockets sunk, the lids round the almond cut-outs (the upper one heavier).
    ex, ey, erx, ery, ea = k['eye']
    eye = ellipse(X, Y, ex, ey, erx, ery, ea)
    relief -= dome(ellipse(X, Y, ex, ey + 0.01, erx * 1.7, ery * 3.0, ea), 1.0) * 0.05
    relief += bead(np.abs(eye - 1.25), 0.35) * (0.02 + 0.015 * (Y > ey))
    # The nose: a long straight ridge, its wings flared.
    ys = [p[0] for p in k['nose']][::-1]
    height = np.interp(Y, ys, [p[1] for p in k['nose']][::-1]) * ((Y <= ys[-1]) & (Y >= ys[0]))
    half = np.interp(Y, ys, [p[2] for p in k['nose']][::-1])
    nose = height * np.clip(1 - (X / half) ** 2, 0, None) ** 1.1
    nose = np.maximum(nose, dome(np.hypot(X - 0.075, (Y + 0.25) * 1.3), 0.08) * 0.1)
    relief += nose
    # The moustache standing out, and the lips under it.
    moustache = seg_dist(X, Y, curve(k['moustache'], 40))
    taper = np.clip(1 - X / 0.5, 0.35, 1)
    m = bead(moustache, 0.055 * taper)
    relief += m * 0.05
    lips = np.abs(Y - k['mouth'] - 0.03 * (X / 0.16) ** 2)
    relief += bead(lips, 0.05) * smooth((0.2 - X) / 0.04) * 0.02
    coarse = mask_grid(atlas, region, relief, spec, MENPO_GRID, 0.03)
    region.add(relief - coarse)
    # The fine work: the moustache's hairs incised along it; the lips' parting; the nostrils; the eyes cut through.
    along = np.arctan2(Y + 0.6, X + 0.1)
    region.add(-(0.5 + 0.5 * np.cos(along * 260)) ** 4 * smooth(m * 3) * 0.004)
    region.add(-bead(lips, 0.008) * smooth((0.16 - X) / 0.03) * 0.015)
    region.paint(bead(lips, 0.006) * smooth((0.15 - X) / 0.03), rgb=HOLE, rough=1.0, metal=0.0, mask=0.0)
    nostril = ellipse(X, Y, 0.06, -0.29, 0.032, 0.017, 0.3)
    region.add(-smooth((1 - nostril) / 0.3) * 0.02)
    region.paint(smooth((1 - nostril) / 0.3), rgb=HOLE, rough=1.0, metal=0.0, mask=0.0)
    region.add(bead(np.abs(eye - 1.04), 0.06) * 0.008)
    region.paint(smooth((1.0 - eye) / 0.05), rgb=HOLE, rough=1.0, metal=0.0, mask=0.0)
    region.paint(smooth((1.02 - eye) / 0.02), cut=0.0)
    # Raised under the hammer: its pits all over, deeper than a polished plate's.
    rng = np.random.default_rng(11)
    pits = region.blur(rng.standard_normal(X.shape).astype(np.float32), 0.012)
    pits /= pits.std() + 1e-9
    region.add(-np.clip(pits, 0, None) ** 1.5 * 0.0012)
    hammered(region, 0.0015, 0.06, seed=4)
    # The holes for the laces and the hinge at the brow; the rolled edge; the outline cut.
    for x, y in ((1.1, 0.3), (1.15, -0.1), (1.08, -0.55)):
        hole = np.hypot(X - x, Y - y)
        region.paint(smooth((0.016 - hole) / 0.005), rgb=HOLE, rough=1.0, metal=0.0, mask=0.0)
        region.add(bead(np.abs(hole - 0.022), 0.008) * 0.006)
    region.add(bead(np.abs(signed - 0.018), 0.018) * 0.012)
    region.paint(1 - outline, cut=0.0)
    h = region.view('h') / region.k
    wear = smooth((h - region.blur(h, 0.035)) * 160) * region.view('mask')
    region.paint(wear * 0.6, rgb=METAL + 0.08)
    return atlas


# The Kipchak helmet's bowl (wardrobe.js CHICHAK.kipchak: its profile and ten facets), its sheet laid as the lathe lays
# its coordinates (u round from the back, the face at u 0.25; v up the profile point by point). From the surviving
# Kipchak and Golden Horde bowls (references in src/helmmaps.js): raised under the hammer and left pitted all over; a
# teardrop panel sunk in each facet but the front one (where the mask's hinge plate is), its point up; the brow band
# below a scored line, a row of rivets round it for the lining and the aventail's leather.
KIPCHAK_BOWL = {
    'profile': [(1.2, 0), (1.21, 0.28), (1.13, 0.58), (0.94, 0.88), (0.7, 1.18), (0.47, 1.5), (0.28, 1.84), (0.14, 2.18), (0.05, 2.48), (0, 2.6)],
    'sides': 10,
    'teardrop': (1.42, 0.62, 0.15),
    'band': 0.34,
    'rivets': (0.16, 20),
}


def kipchak_bowl_atlas(name):
    k = KIPCHAK_BOWL
    profile = np.array(k['profile'], np.float32)
    step = np.hypot(np.diff(profile[:, 0]), np.diff(profile[:, 1]))
    arc = np.concatenate([[0], np.cumsum(step)])
    length = float(arc[-1])

    def to(x, y):
        t = y * (len(profile) - 1)
        radius = np.interp(t, np.arange(len(profile)), profile[:, 0])
        along = np.interp(t, np.arange(len(profile)), arc)
        angle = (x - 0.25) * 2 * PI
        angle = (angle + PI) % (2 * PI) - PI
        return {'X': angle * radius, 'Y': along, 'angle': angle, 'radius': radius}

    atlas = Atlas(name, base=METAL, rough=0.34, metal=1.0)
    region = atlas.region((0, 0, 1, 1), to, 2 * PI * 1.2)
    angle, radius, Y = region.s['angle'], region.s['radius'], region.s['Y']
    # The teardrops: one on each facet but the front one, measured across its facet.
    facet = 2 * PI / k['sides']
    centre = np.round((angle - facet / 2) / facet) * facet + facet / 2
    front = np.abs(centre) < facet / 2
    across = (angle - centre) * radius
    ty, tall, wide = k['teardrop']
    up = np.clip((Y - (ty - tall / 2)) / tall, 0, 1)
    half = wide * np.sqrt(np.clip(np.sin(PI * up ** 0.7), 0, None)) * (Y > ty - tall / 2) * (Y < ty + tall / 2)
    inside_drop = smooth((half - np.abs(across)) / 0.02) * (1 - front)
    edge = bead(np.abs(np.abs(across) - half), 0.014) * (half > 0.01) * (1 - front)
    region.add(-inside_drop * 0.012 - edge * 0.006)
    region.paint(inside_drop * 0.35, mul=(0.86, 0.86, 0.87))
    # The brow band under its scored line, and the rivets round it.
    region.add(-bead(np.abs(Y - k['band']), 0.012) * 0.008)
    ry, count = k['rivets']
    pitch = 2 * PI / count
    nearest = np.round(angle / pitch) * pitch
    region.add(cap(np.hypot((angle - nearest) * radius, Y - ry), 0.035) * 0.02)
    # Raised under the hammer: pitted all over, the pits a little darker.
    rng = np.random.default_rng(21)
    pits = region.blur(rng.standard_normal(region.x.shape).astype(np.float32), 0.014)
    pits /= pits.std() + 1e-9
    dents = np.clip(pits, 0, None) ** 1.5
    region.add(-dents * 0.0016)
    region.paint(smooth(dents * 0.6) * 0.5, mul=(0.82, 0.82, 0.83))
    hammered(region, 0.002, 0.08, seed=9)
    return atlas

BUILDERS = {
    'maskMenpo': lambda: mask_atlas('maskMenpo'),
    **{name: (lambda name=name: world_mask_atlas(name)) for name in WORLD_MASKS},
    'maskKipchak': lambda: kipchak_atlas('maskKipchak'),
    'formKipchakBowl': lambda: kipchak_bowl_atlas('formKipchakBowl'),
}


def main():
    out = sys.argv[1]
    names = sys.argv[2:] or list(BUILDERS)
    os.makedirs(out, exist_ok=True)
    for name in names:
        BUILDERS[name]().save(out)


if __name__ == '__main__':
    main()
