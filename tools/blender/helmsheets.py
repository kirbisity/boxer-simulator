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
MASKS = {
    'maskOni': {'R': 1.12, 'az': 0.42 * PI, 'top': 0.2 * PI, 'bottom': 0.86 * PI},
    'maskRessei': {'R': 1.1, 'az': 0.44 * PI, 'top': 0.42 * PI, 'bottom': 0.88 * PI},
    'maskTengu': {'R': 1.1, 'az': 0.44 * PI, 'top': 0.42 * PI, 'bottom': 0.88 * PI},
}
GRID = 17
# u = (angle / az) ** MASK_U_POWER: more of the sheet for the middle of the face, less for the cheeks.
MASK_U_POWER = 0.6
LACQUER = np.array([0.82, 0.82, 0.82])
MOUTH = np.array([0.5, 0.05, 0.035])
TEETH = np.array([0.92, 0.9, 0.82])
HAIR = np.array([0.9, 0.88, 0.84])


def mask_surface(spec):
    def to(x, y):
        polar = spec['bottom'] - y * (spec['bottom'] - spec['top'])
        az = x ** (1 / MASK_U_POWER) * spec['az']
        return {'X': az * spec['R'] * np.sin(polar), 'Y': spec['R'] * np.cos(polar), 'az': az, 'polar': polar}
    return to


def wrinkle(X, Y, points, width=0.018, depth=0.015):
    return -bead(seg_dist(X, Y, curve(points, 30)), width) * depth


def hair(region, X, Y, roots, length, sweep, droop, count, width, height, colour=HAIR, seed=3):
    """Horsehair: `count` strands from points along `roots`, each running `length` out (sweeping `sweep`, drooping
    `droop`), a mound of hair `height` high with fine strand grooves."""
    rng = np.random.default_rng(seed)
    field = np.zeros(X.shape, np.float32)
    path = curve(roots, 40)
    for k in range(count):
        p = path[int(rng.integers(0, len(path)))]
        ln = length * rng.uniform(0.7, 1.1)
        pts = [(p[0] + sweep * ln * t + rng.normal(0, 0.01), p[1] - droop * ln * t * t + rng.normal(0, 0.01)) for t in np.linspace(0, 1, 6)]
        xs = [q[0] for q in pts]
        ys = [q[1] for q in pts]
        near = (X > min(xs) - width * 2) & (X < max(xs) + width * 2) & (Y > min(ys) - width * 2) & (Y < max(ys) + width * 2)
        if not near.any():
            continue
        strand = bead(seg_dist(X[near], Y[near], pts), width * rng.uniform(0.7, 1.2)) * (1 - 0.3 * rng.random())
        field[near] = np.maximum(field[near], strand)
    mound = region.blur(field, width * 1.5)
    region.add(mound * height * 1.2 + field * height * 0.35)
    weight = smooth(field * 2.2)
    region.paint(weight, rgb=colour, rough=0.85, metal=0.0, mask=0.0)
    return weight


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


def mask_atlas(name):
    spec = MASKS[name]
    atlas = Atlas(name, base=LACQUER, rough=0.3, metal=0.0)
    region = atlas.region((0, 0, 1, 1), mask_surface(spec), spec['az'] * spec['R'])
    X, Y = region.s['X'], region.s['Y']
    region.paint(np.ones(X.shape), mask=1.0)
    rng = np.random.default_rng(5)
    peel = region.blur(rng.standard_normal(X.shape).astype(np.float32), 0.02)
    region.add(peel / (peel.std() + 1e-9) * 0.0015)
    relief = np.zeros(X.shape, np.float32)
    width = spec['az'] * spec['R']
    if name == 'maskOni':
        # The somen: the whole face of a demon. Brows bunched and swept up, eyes glaring holes, a broad flat nose with flared
        # nostrils, cheeks swollen, the mouth wide in a snarl round gilt teeth and four tusks, the brow and cheeks furrowed.
        # Drawn lower than the face beneath (the kabuto's peak hides the brow): the features 0.12 r down.
        Y = Y + 0.12
        outline = smooth((0.95 * width - X - np.clip(-0.45 - Y, 0, None) * 0.9) / 0.04)
        relief += dome(ellipse(X, Y, 0.0, 0.05, 1.0, 0.9), 1.0) * 0.08
        brow = seg_dist(X, Y, [(0.05, 0.28), (0.22, 0.36), (0.5, 0.5)])
        relief += dome(brow, 0.12) * 0.13
        relief += dome(ellipse(X, Y, 0.38, -0.12, 0.22, 0.18), 1.0) * 0.08
        nose = dome(ellipse(X, Y, 0.0, -0.02, 0.2, 0.18), 1.0) * 0.2 + dome(seg_dist(X, Y, [(0, 0.28), (0, 0.0)]), 0.08) * 0.08
        relief += nose
        relief += dome(ellipse(X, Y, 0.0, -0.72, 0.25, 0.15), 1.0) * 0.06
        mouth = ellipse(X, Y, 0.0, -0.37 - 0.05 * (X / 0.32) ** 2, 0.33, 0.13)
        relief += bead(np.abs(mouth - 1.0), 0.25) * 0.04
        sink = smooth((1.0 - mouth) / 0.15) * 0.03
        eye = ellipse(X, Y, 0.27, 0.16, 0.12, 0.055, -0.35)
        relief -= smooth((1.0 - eye) / 0.3) * 0.04
        region.add(relief - mask_grid(atlas, region, relief, spec) - sink)
        region.add(bead(np.abs(eye - 1.1), 0.25) * 0.015)
        region.paint(smooth((1.0 - eye) / 0.12), rgb=HOLE, rough=1.0, mask=0.0)
        region.paint(smooth((0.98 - mouth) / 0.06), rgb=MOUTH, rough=0.35, mask=0.0)
        teeth(region, X, Y, -0.29, -0.36, 0.26, 4, GILT, 1.0, 0.25, 0.03)
        teeth(region, X, Y, -0.47, -0.41, 0.24, 4, GILT, 1.0, 0.25, 0.03, down=False)
        for (x0, y0, y1) in ((0.24, -0.28, -0.47), (0.17, -0.48, -0.31)):
            tusk = bead(seg_dist(X, Y, [(x0, y0), (x0 + 0.015, y1)]), 0.03) * smooth(1 - np.abs(Y - (y0 + y1) / 2) / abs(y1 - y0) * 1.6)
            region.add(tusk * 0.04)
            region.paint(smooth(tusk * 4), rgb=TEETH, rough=0.3, metal=0.0, mask=0.0)
        nostril = np.minimum(ellipse(X, Y, 0.09, -0.12, 0.05, 0.03, 0.4), 9)
        region.add(-smooth((1 - nostril) / 0.3) * 0.03)
        region.paint(smooth((1 - nostril) / 0.3), rgb=HOLE, rough=1.0, mask=0.0)
        for y in (0.6, 0.67, 0.74):
            region.add(wrinkle(X, Y, [(0.0, y - 0.03), (0.2, y), (0.45, y - 0.02), (0.7, y - 0.06)], 0.02, 0.018))
        for k in range(3):
            region.add(wrinkle(X, Y, [(0.42, 0.18 - k * 0.04), (0.55, 0.16 - k * 0.07), (0.66, 0.12 - k * 0.1)], 0.014, 0.012))
        region.add(wrinkle(X, Y, [(0.03, 0.42), (0.04, 0.3)], 0.016, 0.02))
        region.add(wrinkle(X, Y, [(0.16, -0.08), (0.3, -0.22), (0.38, -0.42)], 0.025, 0.025))
        region.add(wrinkle(X, Y, [(0.12, -0.62), (0.25, -0.58), (0.36, -0.5)], 0.016, 0.012))
        # Horsehair brows, black and bristling.
        hair(region, X, Y, [(0.08, 0.34), (0.25, 0.4), (0.45, 0.5)], 0.18, 0.9, 0.3, 140, 0.012, 0.02, colour=(0.06, 0.055, 0.05), seed=11)
    else:
        # The menpo: from under the eyes to under the chin. Ressei-men, the fierce old man: a hooked nose, the cheeks and
        # chin cut with deep wrinkles, the mouth open on white teeth, a horsehair moustache and a chin tuft, the sweat drain.
        # Karasu tengu: a crow's beak in place of nose and mouth, feathered cheeks.
        outline = smooth((0.97 * width - X - np.clip(Y - 0.0, 0, None) * 0.8 - np.clip(-0.72 - Y, 0, None) * 1.2) / 0.04)
        top = 0.2 - 0.24 * np.exp(-((X - 0.3) / 0.16) ** 2)
        outline *= smooth((top - Y) / 0.03)
        relief += dome(ellipse(X, Y, 0.0, -0.4, 1.0, 0.8), 1.0) * 0.05
        relief += dome(ellipse(X, Y, 0.4, -0.2, 0.25, 0.2), 1.0) * 0.06
        relief += dome(ellipse(X, Y, 0.0, -0.78, 0.25, 0.14), 1.0) * 0.06
        if name == 'maskRessei':
            nose = dome(ellipse(X, Y, 0.0, -0.06, 0.15, 0.22), 1.0) * 0.16 + dome(seg_dist(X, Y, [(0, 0.15), (0, -0.12)]), 0.07) * 0.08
            relief += nose
            mouth = ellipse(X, Y, 0.0, -0.4 - 0.06 * (X / 0.28) ** 2, 0.28, 0.08)
            relief += bead(np.abs(mouth - 1.0), 0.3) * 0.03
            sink = smooth((1.0 - mouth) / 0.2) * 0.025
        else:
            beak_top = seg_dist(X, Y, [(0, 0.1), (0, -0.25), (0, -0.55)])
            beak = np.clip(1 - np.hypot(X / 0.22, (Y + 0.22) / 0.42), 0, None) ** 1.3
            relief += beak * (0.35 + 0.25 * smooth((0.05 - Y) / 0.5)) + dome(beak_top, 0.08) * 0.05
            mouth = np.full(X.shape, 9.0, np.float32)
            sink = 0.0
        region.add(relief - mask_grid(atlas, region, relief, spec) - sink)
        if name == 'maskRessei':
            region.paint(smooth((0.98 - mouth) / 0.08), rgb=MOUTH, rough=0.35, mask=0.0)
            teeth(region, X, Y, -0.355, -0.41, 0.2, 4, TEETH, 0.0, 0.3, 0.025)
            teeth(region, X, Y, -0.46, -0.42, 0.18, 4, TEETH, 0.0, 0.3, 0.025, down=False)
            nostril = ellipse(X, Y, 0.07, -0.21, 0.04, 0.025, 0.3)
            region.add(-smooth((1 - nostril) / 0.3) * 0.03)
            region.paint(smooth((1 - nostril) / 0.3), rgb=HOLE, rough=1.0, mask=0.0)
            for k in range(4):
                region.add(wrinkle(X, Y, [(0.2 + k * 0.07, 0.05), (0.26 + k * 0.08, -0.2), (0.3 + k * 0.08, -0.45 - k * 0.04)], 0.016, 0.02))
            region.add(wrinkle(X, Y, [(0.12, -0.15), (0.24, -0.32), (0.3, -0.48)], 0.024, 0.028))
            for k in range(3):
                region.add(wrinkle(X, Y, [(0.0, -0.62 - k * 0.06), (0.15, -0.6 - k * 0.07), (0.28, -0.56 - k * 0.08)], 0.014, 0.014))
            hair(region, X, Y, [(0.02, -0.27), (0.1, -0.29), (0.2, -0.33)], 0.34, 1.0, 0.5, 260, 0.011, 0.035, seed=4)
            hair(region, X, Y, [(0.0, -0.6), (0.08, -0.62)], 0.3, 0.15, 1.3, 120, 0.011, 0.03, seed=5)
        else:
            beak_edge = np.abs(Y + 0.38 + 0.15 * (X / 0.22) ** 2)
            region.add(-bead(beak_edge, 0.014) * smooth((0.22 - X) / 0.03) * 0.03)
            region.paint(bead(beak_edge, 0.012) * smooth((0.2 - X) / 0.03), rgb=HOLE, rough=1.0, mask=0.0)
            nostril = ellipse(X, Y, 0.06, 0.02, 0.035, 0.02)
            region.paint(smooth((1 - nostril) / 0.3), rgb=HOLE, rough=1.0, mask=0.0)
            region.add(-smooth((1 - nostril) / 0.3) * 0.02)
            off_beak = smooth((X - 0.24) / 0.05)
            row = np.floor(Y / 0.09)
            scale = np.hypot(np.mod(X + 0.045 * row, 0.09) - 0.045, np.mod(Y, 0.09) - 0.07)
            region.add(cap(scale, 0.07) * 0.015 * off_beak)
            region.add(bead(np.abs(Y + 0.1 - 0.2 * X), 0.02) * 0.02 * off_beak)
            region.paint(smooth(beak * 3) * 0.6, rgb=(0.06, 0.05, 0.05), rough=0.25, mask=0.0)
        # The sweat drain under the chin, and the cord posts on the cheeks.
        drain = np.hypot(X, Y + 0.86)
        region.add(bead(np.abs(drain - 0.035), 0.012) * 0.01 - smooth((0.03 - drain) / 0.008) * 0.015)
        region.paint(smooth((0.03 - drain) / 0.008), rgb=HOLE, rough=1.0, mask=0.0)
        add_rivets(region, X, Y, [(0.95 * width - 0.2, -0.35)], 0.06, 0.05)
    # The rolled edge round the cut outline.
    region.add(bead(np.abs(outline - 0.5) * 0.08, 0.03) * 0.02)
    region.paint(1 - outline, cut=0.0)
    # Wear: the lacquer rubbed thin on every raised edge, the red undercoat (or the iron) showing (the shader reads the
    # lacquer's albedo above its base as wear, src/helmmaps.js).
    h = region.view('h') / region.k
    wear = smooth((h - region.blur(h, 0.035)) * 160) * region.view('mask')
    region.paint(wear * 0.9, rgb=LACQUER + 0.18)
    return atlas


def mask_grid(atlas, region, relief, spec):
    """The coarse relief the mesh carries: `relief` (smoothed) sampled on a GRID x GRID lattice over (u, v), v from the
    bottom (the mesh's vertices, src/menpo.js). Returns the smoothed relief: what the mesh shows, so the maps carry only
    the rest."""
    smoothed = region.blur(relief, 0.06)
    n = relief.shape[0]
    idx = np.linspace(0, n - 1, GRID)
    rows = np.round(idx[::-1]).astype(int)
    cols = np.round(idx).astype(int)
    lattice = smoothed[np.ix_(rows, cols)]
    atlas.grid = {'size': GRID, 'R': spec['R'], 'az': spec['az'], 'top': spec['top'], 'bottom': spec['bottom'],
                  'power': MASK_U_POWER, 'heights': [round(float(v), 4) for v in lattice.reshape(-1)]}
    return smoothed


# ---- The war masks of China, the steppe and the sultanates ------------------------------------------------------------

# Quick variants on the samurai masks' two patches: a whole face (the oni somen's sphere, its features drawn 0.12 r low the
# same way) or a lower face (the menpo's). Smaller sheets (WORLD_N, packed at 256). References: src/menpo.js.
FULL = {'R': 1.12, 'az': 0.42 * PI, 'top': 0.2 * PI, 'bottom': 0.86 * PI}
HALF = {'R': 1.1, 'az': 0.44 * PI, 'top': 0.42 * PI, 'bottom': 0.88 * PI}
WORLD_MASKS = {
    'maskTiemian': FULL, 'maskShoumian': FULL, 'maskKipchak': FULL, 'maskHorde': FULL,
    'maskMailVeil': FULL, 'maskVentail': HALF,
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
    elif name == 'maskMailVeil':
        # A veil of riveted mail hung from the helmet's rim across the face, only the eyes left open, falling loose to
        # the throat: it stands off the chin and hangs away below it.
        relief += dome(ellipse(X, Y, 0.0, 0.05, 1.0, 0.9), 1.0) * 0.03 + dome(ellipse(X, Y, 0.0, -0.12, 0.14, 0.2), 1.0) * 0.05
        relief += smooth((-0.45 - Y) / 0.45) * 0.12
        after.append(lambda: mail(region, X, Y))
        slot = np.maximum(np.abs(Y - 0.15) / 0.06, np.abs(X - 0.22) / 0.17)
        after.append(lambda slot=slot: region.paint(smooth((1.0 - slot) / 0.15), cut=0.0))
        band = smooth((0.06 - np.abs(Y - 0.85)) / 0.01)
        after.append(lambda band=band: (region.add(band * 0.015), region.paint(band, rgb=GILT * 0.8, rough=0.35, metal=1.0, mask=0.0)))
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
    if name not in ('maskMailVeil', 'maskVentail'):
        hammered(region, 0.003, 0.05, seed=len(name))
    region.add(bead(np.abs(outline - 0.5) * 0.08, 0.03) * 0.02)
    region.paint(1 - outline, cut=0.0)
    # Wear: the raised edges rubbed bright (under the lacquer's undercoat threshold, src/helmmaps.js: no red).
    h = region.view('h') / region.k
    wear = smooth((h - region.blur(h, 0.035)) * 160) * region.view('mask')
    region.paint(wear * 0.6, rgb=METAL + 0.05)
    return atlas


BUILDERS = {
    'maskOni': lambda: mask_atlas('maskOni'),
    'maskRessei': lambda: mask_atlas('maskRessei'),
    'maskTengu': lambda: mask_atlas('maskTengu'),
    **{name: (lambda name=name: world_mask_atlas(name)) for name in WORLD_MASKS},
}


def main():
    out = sys.argv[1]
    names = sys.argv[2:] or list(BUILDERS)
    os.makedirs(out, exist_ok=True)
    for name in names:
        BUILDERS[name]().save(out)


if __name__ == '__main__':
    main()
