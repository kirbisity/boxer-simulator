# The arena helmets' and the samurai war masks' relief, authored as height fields over each piece's own unwrapped surface
# (its atlas: the regions src/helmmaps.js lays each part's texture coordinates into), with the colour, roughness, metalness
# and masks that go with it. Plain Python 3 (numpy, scipy, Pillow). helmbake.py then models each field as real geometry in
# Blender and bakes its normal map and occlusion; packhelm.py packs them into src/helmmaps-data.js.
#
#   python3 tools/blender/helmsheets.py <out dir> [names...]
#
# Every feature is placed in the piece's own measures (head radii, r; x forward, y up, z left as in arenaview.js and
# wardrobe.js), so a rivet is round and a grille hole where the eye is whatever the region's stretch. What the details are
# is from the surviving helmets and masks (references in src/helmmaps.js):
#   Pompeii barracks (Naples MANN): thraex helmets with a griffin-headed crest, a Gorgon on the bowl's front, dolphins and
#   feather tubes on the sides, a two-part visor with round grilles of linked holes; murmillo helmets with embossed scenes
#   (Rome, captives, trophies, Victories: inv. 5674; Hercules' herm: inv. 5672; the plainer British Museum 1946,0514.1 with
#   Hercules' head at the front); the smooth secutor (inv. 5642) with its two small round eyeholes; the provocator's
#   perforated visor and eagle (inv. 5657). The masks: Edo lacquered iron menpo and somen (Met 24176, 22080, 24145, 23997,
#   31974): fierce brows, wrinkles (shiwa), teeth gilt or white, a horsehair moustache, the sweat drain under the chin.

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


# ---- The brimmed helmets (thraex, hoplomachus, murmillo) ---------------------------------------------------------------

# Atlas regions (u0, v0, u1, v1) for the brimmed helmets: src/helmmaps.js lays the parts' coordinates into the same.
BRIM_REGIONS = {
    'bowl': (0, 0.64, 1, 1), 'brim': (0, 0.47, 1, 0.64), 'visor': (0, 0, 0.44, 0.47),
    'crest': (0.44, 0.12, 1, 0.47), 'plain': (0.44, 0, 0.56, 0.12), 'tube': (0.56, 0, 1, 0.12),
}
BOWL_PROFILE = [(1.3, 0.32), (1.22, 0.75), (0.98, 1.12), (0.55, 1.35), (0.0, 1.4)]
BRIM_PROFILE = [(2.08, 0.16), (2.0, 0.1), (1.62, 0.24), (1.28, 0.32)]


def lathe_surface(profile):
    """A lathe region's pixels on the piece: x the angle from the front (0) to the back (1), y the profile's points
    (0 the first, 1 the last, evenly by point, as three's LatheGeometry gives v)."""
    pts = np.asarray(profile, np.float32)
    arc = np.concatenate([[0], np.cumsum(np.hypot(*np.diff(pts, axis=0).T))])

    def to(x, y):
        k = y * (len(pts) - 1)
        i = np.clip(np.floor(k).astype(int), 0, len(pts) - 2)
        t = k - i
        rad = pts[i, 0] + (pts[i + 1, 0] - pts[i, 0]) * t
        height = pts[i, 1] + (pts[i + 1, 1] - pts[i, 1]) * t
        s = arc[i] + (arc[i + 1] - arc[i]) * t
        az = x * PI
        return {'az': az, 'rad': rad, 'y': height, 's': s, 'X': az * np.maximum(rad, 0.05), 'length': arc[-1]}
    return to, PI * max(p[0] for p in profile)


VISOR = {'R': 1.32, 'az': 0.38 * PI, 'theta0': 0.43 * PI, 'theta1': 0.88 * PI, 'stretch': 1.3}


def visor_surface(x, y):
    theta = VISOR['theta1'] - y * (VISOR['theta1'] - VISOR['theta0'])
    az = x * VISOR['az']
    X = az * VISOR['R'] * np.sin(theta)
    Y = VISOR['R'] * np.cos(theta) * VISOR['stretch']
    return {'az': az, 'theta': theta, 'X': X, 'Y': Y}


def planar(x0, y0, x1, y1):
    return lambda x, y: {'X': x0 + x * (x1 - x0), 'Y': y0 + y * (y1 - y0)}


def brimmed_atlas(name, kind='basic', style='thraex'):
    """The brimmed helmets' sheet. `kind` 'basic' (options a and b: the helmet's working detail) or 'rich' (option c: the
    embossed and gilt work of the parade-grade Pompeii pieces, by `style`)."""
    atlas = Atlas(name)
    rich = kind == 'rich'
    # The bowl.
    to, width = lathe_surface(BOWL_PROFILE)
    bowl = atlas.region(BRIM_REGIONS['bowl'], to, width)
    s = bowl.s
    hammered(bowl, 0.004, 0.05, seed=2)
    # The raised band at the foot (two beads, rivets between), and a fine beaded line above it.
    add = np.zeros(s['s'].shape, np.float32)
    add += bead(np.abs(s['s'] - 0.03), 0.03) * 0.03 + bead(np.abs(s['s'] - 0.17), 0.025) * 0.025
    bowl.add(add)
    rivet_pts = [(az * 1.3, 0.1) for az in np.linspace(0, PI, 10)]
    add_rivets(bowl, s['az'] * 1.3, s['s'], rivet_pts, 0.045, 0.03)
    beads = cap(np.hypot((np.mod(s['az'] * 1.24 + 0.03, 0.07) - 0.035), s['s'] - 0.26), 0.022) * 0.015
    bowl.add(beads)
    # The crest's foot: a raised strap along the crown, front to back, riveted (where X ~ 0 at the front and at the back).
    strap = np.minimum(s['X'], (PI - s['az']) * np.maximum(s['rad'], 0.05))
    on_crown = smooth((s['s'] - 0.2) / 0.2)
    bowl.add(smooth((0.17 - strap) / 0.03) * on_crown * 0.018)
    add_rivets(bowl, strap, s['s'], [(0.09, t) for t in np.linspace(0.5, 1.85, 7)], 0.04, 0.022)
    # The feather tubes' plates at the sides (az ~ pi/2), each with four rivets.
    side_x, side_y = (s['az'] - PI * 0.53) * s['rad'], s['s'] - 0.62
    plate = smooth((0.14 - np.maximum(np.abs(side_x) - 0.05, np.abs(side_y) - 0.12)) / 0.02)
    bowl.add(plate * 0.012)
    add_rivets(bowl, side_x, side_y, [(dx, dy) for dx in (-0.08, 0.08) for dy in (-0.15, 0.15)], 0.035, 0.022)
    if rich:
        band = lambda d, w, h: laurel(d, w, h, 26)
        emboss(bowl, s['X'], s['s'], band, (0, 0.28, PI * 1.25, 0.42), 0.02, 0.006, gild=0.7, px=1400)
        if style == 'murmillo':
            emboss(bowl, s['X'], s['s'], hercules, (-0.42, 0.42, 0.42, 1.25), 0.06, 0.012, gild=0.8)
            emboss(bowl, s['X'], s['s'], victory, (0.85, 0.42, 1.55, 1.2), 0.045, 0.01, gild=0.6)
            emboss(bowl, s['X'], s['s'], trophy, (1.9, 0.42, 2.5, 1.2), 0.045, 0.01, gild=0.6)
            word = text_mask('ROMA VICTRIX', 1200, 120, 100)
            field = bowl.blur(stamp(s['X'], s['s'], word, 0.6, 0.02, 3.3, 0.17), 0.004)
            bowl.add(-field * 0.012)
        else:
            emboss(bowl, s['X'], s['s'], gorgon, (-0.45, 0.42, 0.45, 1.3), 0.06, 0.012, gild=0.8)
            emboss(bowl, s['X'], s['s'], dolphin, (1.0, 0.75, 1.75, 1.12), 0.04, 0.01, gild=0.6)
            emboss(bowl, s['X'], s['s'], palm, (2.5, 0.42, 3.0, 1.35), 0.035, 0.008, gild=0.5)
    # The brim: a heavy rolled edge, two raised rings, rivets round its joint with the bowl.
    to, width = lathe_surface(BRIM_PROFILE)
    brim = atlas.region(BRIM_REGIONS['brim'], to, width)
    s = brim.s
    hammered(brim, 0.003, 0.05, seed=3)
    length = s['length']
    brim.add(cap(s['s'] - 0.0, 0.11) * 0.06)
    brim.add(bead(np.abs(s['s'] - 0.32), 0.022) * 0.018 + bead(np.abs(s['s'] - 0.62), 0.02) * 0.016)
    add_rivets(brim, s['az'] * 1.3, s['s'], [(az * 1.3, length - 0.06) for az in np.linspace(0, PI, 14)], 0.04, 0.025)
    if rich:
        wave = lambda d, w, h: scroll_band(d, w, h, 22)
        emboss(brim, s['X'], s['s'], wave, (0, 0.36, PI * 1.85, 0.58), 0.022, 0.006, gild=0.75, px=1600)
    # The visor: two halves meeting down the middle, the round grilles of linked holes over the eyes, a rolled edge.
    visor = atlas.region(BRIM_REGIONS['visor'], visor_surface, VISOR['az'] * VISOR['R'])
    s = visor.s
    hammered(visor, 0.003, 0.05, seed=4)
    X, Y = s['X'], s['Y']
    visor.add(bead(X, 0.035) * 0.025)
    edge_x = VISOR['az'] * VISOR['R'] * np.sin(s['theta']) - X
    visor.add(bead(np.minimum(edge_x, (Y - VISOR['R'] * math.cos(VISOR['theta1']) * VISOR['stretch'])), 0.06) * 0.04)
    eye = (0.5, -0.05)
    rad = 0.34
    d_eye = np.hypot(X - eye[0], Y - eye[1])
    # The disc stands a little proud in a beaded frame; inside it, holes in rows (a hexagonal net of linked circles).
    visor.add(smooth((rad - d_eye) / 0.02) * 0.012 + bead(np.abs(d_eye - rad), 0.03) * 0.03)
    pitch = 0.075
    hx = X / pitch
    hy = Y / (pitch * 0.866)
    row = np.round(hy)
    col = np.round(hx - 0.5 * (row % 2))
    cx = (col + 0.5 * (row % 2)) * pitch
    cy = row * pitch * 0.866
    d_hole = np.hypot(X - cx, Y - cy)
    in_disc = smooth((rad - 0.035 - d_eye) / 0.01)
    holes = smooth((0.026 - d_hole) / 0.006) * in_disc
    rings = bead(np.abs(d_hole - 0.031), 0.009) * in_disc
    visor.add(rings * 0.008 - holes * 0.02)
    visor.paint(holes, rgb=HOLE, rough=1.0, metal=0.0)
    # Hinge plates where the halves meet the bowl, either side, riveted.
    hinge = (VISOR['az'] * VISOR['R'] * 0.92, 0.28)
    visor.add(smooth((0.12 - np.maximum(np.abs(X - hinge[0]), np.abs(Y - hinge[1]) * 0.6)) / 0.02) * 0.012)
    add_rivets(visor, X, Y, [(hinge[0], hinge[1] + 0.06), (hinge[0], hinge[1] - 0.06), (hinge[0] - 0.02, -0.9), (hinge[0] - 0.02, -1.3)], 0.035, 0.022)
    if rich:
        motif = trophy if style == 'murmillo' else palm
        emboss(visor, X, Y, motif, (0.12, -1.5, 0.78, -0.5), 0.035, 0.008, gild=0.6)
        emboss(visor, X, Y, lambda d, w, h: laurel(d, w, h, 10), (0.0, 0.3, 1.0, 0.42), 0.015, 0.005, gild=0.6)
        visor.paint(smooth((rad + 0.05 - d_eye) / 0.02) * smooth((d_eye - rad + 0.05) / 0.02), rgb=GILT, rough=0.22)
    # The crest, seen from the side (the fish's fin: rays and a beaded edge; the griffin's neck: scales).
    crest = atlas.region(BRIM_REGIONS['crest'], planar(-1.5, 0.8, 1.5, 2.6), 3.0)
    s = crest.s
    X, Y = s['X'], s['Y']
    hammered(crest, 0.003, 0.05, seed=5)
    rays = np.abs(np.mod(np.arctan2(Y - 0.6, X - 1.6) * 9, 1) - 0.5)
    crest.add(bead(rays, 0.12) * 0.012)
    scales = np.hypot(np.mod(X, 0.12) - 0.06, np.mod(Y + 0.06 * np.floor(X / 0.12), 0.12) - 0.04)
    crest.add(cap(scales, 0.07) * 0.006)
    if rich:
        crest.paint(bead(rays, 0.1), rgb=GILT, rough=0.22)
    # The griffin's neck tube (along its length x, round it y): overlapping scales.
    tube = atlas.region(BRIM_REGIONS['tube'], planar(0, 0, 3.2, 1.07), 3.2)
    s = tube.s
    X, Y = s['X'], s['Y']
    row = np.floor(X / 0.1)
    scale = np.hypot(np.mod(X, 0.1) - 0.08, np.mod(Y + 0.05 * row, 0.1) - 0.05)
    tube.add(cap(scale, 0.085) * 0.02)
    if rich:
        tube.paint(cap(scale, 0.06), rgb=GILT, rough=0.22)
    plain = atlas.region(BRIM_REGIONS['plain'], planar(0, 0, 1, 1), 1.0)
    hammered(plain, 0.003, 0.05, seed=6)
    return atlas


# ---- The secutor ---------------------------------------------------------------------------------------------------------

SEC_REGIONS = {'shell': (0, 0.25, 1, 1), 'fin': (0, 0, 0.62, 0.25), 'guard': (0.62, 0, 1, 0.25)}
SEC_SHELL = {'centre': (0.1, 0.08), 'radii': (1.45, 1.62, 1.18)}
SEC_OUTLINE = [[0.6, 0.98], [0.85, 0.55], [0.92, 0], [0.85, -0.55], [0.6, -0.98], [0.0, -1.05], [-0.7, -0.85], [-1.15, -0.4], [-1.32, 0], [-1.15, 0.4], [-0.7, 0.85], [0.0, 1.05], [0.6, 0.98]]
SEC_GUARD = [(1.78, -1.32), (1.8, -1.4), (1.72, -1.42), (1.4, -1.25), (1.15, -0.95)]


def shell_surface(x, y):
    """The secutor's shell (a unit sphere scaled): x the angle from the front (0..1 = 0..pi), y from the bottom (0) to the
    top (1); in the onShell coordinates of arenaview.js (y up, z across, in r) and the angle."""
    az = x * PI
    polar = (1 - y) * PI
    cy, ry, rz = SEC_SHELL['centre'][1], SEC_SHELL['radii'][1], SEC_SHELL['radii'][2]
    return {'az': az, 'polar': polar, 'Yh': cy + ry * np.cos(polar), 'Z': rz * np.sin(polar) * np.sin(az),
            'front': np.cos(az), 'arc': az * np.sin(polar) * 1.3, 'S': (1 - y) * PI * 1.5}


def secutor_atlas(name):
    atlas = Atlas(name)
    shell = atlas.region(SEC_REGIONS['shell'], shell_surface, PI * 1.3)
    s = shell.s
    hammered(shell, 0.003, 0.06, seed=7)
    Y, Z, front = s['Yh'], s['Z'], s['front']
    on_front = smooth(front / 0.15)
    # The visor's raised edge, and the visor plate inside it a step proud.
    outline = [(z, y) for y, z in SEC_OUTLINE]
    mirrored = [(abs(z), y) for z, y in outline]
    half = mirrored[2:9]
    d_edge = seg_dist(Z, Y, curve(half, 60))
    in_visor = inside(Z, Y, [(z, y) for z, y in outline]) * on_front
    shell.add((bead(d_edge, 0.05) * 0.035) * on_front + shell.blur(in_visor, 0.015) * 0.012)
    # The snout ridge down the middle.
    ridge = bead(Z, 0.07) * smooth((0.95 - Y) / 0.05) * smooth((Y + 1.3) / 0.05) * on_front
    shell.add(ridge * 0.04)
    # Two small round eyeholes, sunk in rims; breathing slits low on the visor.
    d_eye = np.hypot(Z - 0.34, Y - 0.2)
    shell.add((bead(np.abs(d_eye - 0.1), 0.03) * 0.025 - smooth((0.1 - d_eye) / 0.01) * 0.02) * on_front)
    shell.paint(smooth((0.09 - d_eye) / 0.01) * on_front, rgb=HOLE, rough=1.0, metal=0.0)
    for k in range(3):
        slit = smooth((0.012 - np.maximum(np.abs(Z - 0.2) - 0.07, np.abs(Y + 0.55 + k * 0.14) - 0.0)) / 0.01) * on_front
        shell.add(-slit * 0.015 + bead(np.maximum(np.abs(Z - 0.2) - 0.075, np.abs(Y + 0.55 + k * 0.14) - 0.012), 0.012) * 0.008 * on_front)
        shell.paint(slit, rgb=HOLE, rough=1.0, metal=0.0)
    # Rivets round the visor's edge, inside it.
    inset = []
    for z, y in curve(half, 22)[1:-1]:
        dz, dy = -z, -0.2 - y
        length = math.hypot(dz, dy) or 1
        inset.append((z + dz / length * 0.11, y + dy / length * 0.11))
    add_rivets(shell, Z, Y, inset, 0.035, 0.02)
    # The hinge bosses at the temples and the fin's riveted foot over the crown (the back half too).
    side = np.hypot(s['arc'] - PI * 0.5 * 1.3, Y - 0.1)
    shell.add(cap(side, 0.16) * 0.03 + bead(np.abs(side - 0.16), 0.02) * 0.012)
    foot = bead(np.abs(Z), 0.09) * smooth((Y - 1.0) / 0.1)
    shell.add(foot * 0.012)
    add_rivets(shell, np.abs(Z), Y, [(0.18, y) for y in (1.25, 1.55)], 0.04, 0.02)
    fin = atlas.region(SEC_REGIONS['fin'], planar(-1.5, 0.9, 1.4, 2.6), 2.9)
    X, Yf = fin.s['X'], fin.s['Y']
    hammered(fin, 0.003, 0.05, seed=8)
    rays = np.abs(np.mod((X + Yf * 0.45) / 0.4, 1) - 0.5)
    fin.add(bead(rays, 0.09) * 0.02)
    to, width = lathe_surface(SEC_GUARD)
    guard = atlas.region(SEC_REGIONS['guard'], to, width)
    hammered(guard, 0.003, 0.05, seed=9)
    sg = guard.s
    guard.add(cap(sg['s'], 0.1) * 0.05 + bead(np.abs(sg['s'] - 0.3), 0.02) * 0.015)
    add_rivets(guard, sg['az'] * 1.3, sg['s'], [(az * 1.3, sg['length'] - 0.06) for az in np.linspace(0.35 * PI, PI, 8)], 0.04, 0.022)
    return atlas


# ---- The scissor ---------------------------------------------------------------------------------------------------------

SCI_REGIONS = {'bowl': (0, 0.6, 1, 1), 'plate': (0, 0, 0.36, 0.6), 'guard': (0.36, 0, 1, 0.6)}
SCI_BOWL = [(1.38, -0.4), (1.42, 0.1), (1.35, 0.75), (1.05, 1.25), (0.55, 1.5), (0, 1.55)]
SCI_GUARD = [(2.04, -0.98), (2.06, -1.06), (1.98, -1.08), (1.62, -0.85), (1.36, -0.4)]
SCI_PLATE = {'R': 2.4, 'half': 0.42, 'y0': -1.2, 'y1': 0.7}


def plate_surface(x, y):
    theta = x * SCI_PLATE['half']
    return {'X': SCI_PLATE['R'] * theta, 'Y': SCI_PLATE['y0'] + y * (SCI_PLATE['y1'] - SCI_PLATE['y0'])}


def scissor_atlas(name):
    atlas = Atlas(name)
    to, width = lathe_surface(SCI_BOWL)
    bowl = atlas.region(SCI_REGIONS['bowl'], to, width)
    hammered(bowl, 0.004, 0.05, seed=10)
    s = bowl.s
    bowl.add(bead(np.abs(s['s'] - 0.08), 0.03) * 0.025)
    add_rivets(bowl, s['az'] * 1.4, s['s'], [(az * 1.4, 0.2) for az in np.linspace(0, PI, 12)], 0.045, 0.026)
    strap = np.minimum(s['X'], (PI - s['az']) * np.maximum(s['rad'], 0.05))
    bowl.add(smooth((0.15 - strap) / 0.03) * smooth((s['s'] - 0.6) / 0.2) * 0.015)
    plate = atlas.region(SCI_REGIONS['plate'], plate_surface, SCI_PLATE['half'] * SCI_PLATE['R'])
    hammered(plate, 0.003, 0.05, seed=11)
    X, Y = plate.s['X'], plate.s['Y']
    plate.add(cap(np.minimum(Y - SCI_PLATE['y0'], SCI_PLATE['y1'] - Y), 0.07) * 0.045)
    plate.add(cap(SCI_PLATE['R'] * SCI_PLATE['half'] - X, 0.06) * 0.03)
    plate.add(bead(X, 0.07) * smooth((Y + 1.0) / 0.05) * smooth((0.4 - Y) / 0.05) * 0.05)
    d_eye = np.hypot(X - 0.42, Y - 0.12)
    plate.add(bead(np.abs(d_eye - 0.22), 0.04) * 0.035 - smooth((0.2 - d_eye) / 0.01) * 0.02)
    plate.paint(smooth((0.19 - d_eye) / 0.01), rgb=HOLE, rough=1.0, metal=0.0)
    for row in range(3):
        for col in range(2):
            d = np.hypot(X - (0.18 + col * 0.16), Y - (-0.45 - row * 0.17))
            plate.add(bead(np.abs(d - 0.05), 0.015) * 0.012 - smooth((0.045 - d) / 0.008) * 0.015)
            plate.paint(smooth((0.042 - d) / 0.006), rgb=HOLE, rough=1.0, metal=0.0)
    add_rivets(plate, X, Y, [(0.62, 0.6), (0.86, -0.3), (0.75, -1.1), (0.3, 0.6), (0.3, -1.12)], 0.045, 0.026)
    to, width = lathe_surface(SCI_GUARD)
    guard = atlas.region(SCI_REGIONS['guard'], to, width)
    hammered(guard, 0.003, 0.05, seed=12)
    sg = guard.s
    guard.add(cap(sg['s'], 0.1) * 0.05 + bead(np.abs(sg['s'] - 0.32), 0.02) * 0.015 + bead(np.abs(sg['s'] - 0.6), 0.02) * 0.012)
    add_rivets(guard, sg['az'] * 1.4, sg['s'], [(az * 1.4, sg['length'] - 0.07) for az in np.linspace(0.3 * PI, PI, 9)], 0.045, 0.024)
    return atlas


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


BUILDERS = {
    'helmBrim': lambda: brimmed_atlas('helmBrim', 'basic'),
    'helmBrimThraex': lambda: brimmed_atlas('helmBrimThraex', 'rich', 'thraex'),
    'helmBrimMurmillo': lambda: brimmed_atlas('helmBrimMurmillo', 'rich', 'murmillo'),
    'helmSecutor': lambda: secutor_atlas('helmSecutor'),
    'helmScissor': lambda: scissor_atlas('helmScissor'),
    'maskOni': lambda: mask_atlas('maskOni'),
    'maskRessei': lambda: mask_atlas('maskRessei'),
    'maskTengu': lambda: mask_atlas('maskTengu'),
}


def main():
    out = sys.argv[1]
    names = sys.argv[2:] or list(BUILDERS)
    os.makedirs(out, exist_ok=True)
    for name in names:
        BUILDERS[name]().save(out)


if __name__ == '__main__':
    main()
