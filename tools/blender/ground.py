# The places' ground and building surfaces as tiling patches, each a heightfield computed here (numpy, wrapping at the tile's
# edges) with its colour and roughness per point, made into one mesh and rendered by tilebake (normal and occlusion from the real
# relief, ray traced). One script, one surface per run:
#
#   Blender -b --factory-startup --python tools/blender/ground.py -- <out dir> [resolution scale] <surface>
#
# Surfaces (tile in metres; what they are modelled on: see the comparison page's credits):
#   setts     worn granite setts in stretcher courses, sand in the joints (2 m): the Last Gate's road, a town square
#   slabs     dressed flagstones, rectangular, unequal, worn hollow (3 m): Jiangnan's granite square, Dunnottar's paving
#   rubble    random rubble walling, flat-bedded field stones in lime mortar (3 m): Dunnottar's rough walls, the sewer
#   planks    sawn boards with grain, gaps and nail heads (2 m): floors and timber
#   earth     trodden earth: clods, grit, foot and hoof prints (2 m): mud, dirt, paths, a battlefield
#   grass     summer turf: blades over thatch and earth (1.5 m)
#   drygrass  dry steppe: sparse bunch grass on grit (1.6 m)
#   gravel    gravel and grit, 3-30 mm stones in fines (1.4 m)
#   sand      arena sand (harena): fine, raked and trodden (1.6 m); also the desert
#   beach     wind- and wave-rippled sand (1.6 m)
#   concrete  broom-finished concrete, pores and hairline cracks (2.4 m)

import math
import os
import sys

import bpy
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tilebake as tb  # noqa: E402

OUT, SCALE = tb.args()
argv = sys.argv[sys.argv.index('--') + 1:]
NAME = argv[2]
N = 768                      # heightfield points across the tile
rng = np.random.default_rng(abs(hash(NAME)) % (2 ** 32))


# ---- periodic noise and stamps ------------------------------------------------------------------

def value_noise(cells, seed):
    """Tileable smooth value noise over N x N, `cells` lattice cells across, 0..1."""
    lattice = np.random.default_rng(seed).random((cells, cells))
    t = np.arange(N) * cells / N
    i0 = np.floor(t).astype(int)
    f = t - i0
    f = f * f * (3 - 2 * f)
    i1 = (i0 + 1) % cells
    a = lattice[i0][:, i0]
    b = lattice[i0][:, i1]
    c = lattice[i1][:, i0]
    d = lattice[i1][:, i1]
    fx = f[None, :]
    fy = f[:, None]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def fbm(cells, seed, octaves=5, gain=0.5):
    total = np.zeros((N, N))
    amp, norm = 1.0, 0.0
    for octave in range(octaves):
        total += amp * value_noise(cells * 2 ** octave, seed + octave * 101)
        norm += amp
        amp *= gain
    return total / norm


class Field:
    """Height (m), colour (0..1 RGB), roughness, and which stamp is on top (for per-stone colour)."""

    def __init__(self, size, base=0.0):
        self.size = size
        self.h = np.full((N, N), base)
        self.col = np.zeros((N, N, 3))
        self.rough = np.full((N, N), 0.9)
        self.owner = np.full((N, N), -1)
        self.px = size / N

    def window(self, cx, cy, reach):
        """Index arrays (wrapping) and local coordinates (m) of a square round (cx, cy)."""
        r = int(math.ceil(reach / self.px)) + 1
        ix = int(round(cx / self.px))
        iy = int(round(cy / self.px))
        xs = np.arange(ix - r, ix + r + 1)
        ys = np.arange(iy - r, iy + r + 1)
        lx = xs * self.px - cx
        ly = ys * self.px - cy
        return ys % N, xs % N, lx[None, :], ly[:, None]

    def stone(self, cx, cy, a, b, turn, top, power=0.5, wobble=0.1, seed=0, flat=0.0, owner=0):
        """A stone: an ellipse (half-axes a, b, turned), domed up to `top`, its outline wobbling; drawn where it is highest."""
        ys, xs, lx, ly = self.window(cx, cy, max(a, b) * (1 + wobble))
        c, s = math.cos(turn), math.sin(turn)
        u = (lx * c + ly * s) / a
        v = (-lx * s + ly * c) / b
        ang = np.arctan2(v, u)
        k = np.random.default_rng(seed).random(4) * 6.28
        edge = 1 + wobble * (0.6 * np.sin(2 * ang + k[0]) + 0.4 * np.sin(3 * ang + k[1]) + 0.3 * np.sin(5 * ang + k[2]))
        q = (u * u + v * v) / (edge * edge)
        inside = q < 1
        z = top * np.clip(1 - q, 0, 1) ** power
        if flat:
            z = np.minimum(z, top * (1 - flat)) + flat * 0
        block = self.h[np.ix_(ys, xs)]
        win = inside & (z > block)
        block = np.where(win, z, block)
        self.h[np.ix_(ys, xs)] = block
        own = self.owner[np.ix_(ys, xs)]
        self.owner[np.ix_(ys, xs)] = np.where(win, owner, own)

    def box(self, x0, y0, w, h, top, round_=0.01, owner=0, lumps=None):
        """A rectangular block (setts, slabs, boards) from (x0, y0), its arrises rounded over `round_` m."""
        cx, cy = x0 + w / 2, y0 + h / 2
        ys, xs, lx, ly = self.window(cx, cy, max(w, h) / 2 + 0.01)
        dx = w / 2 - np.abs(lx)
        dy = h / 2 - np.abs(ly)
        d = np.minimum(dx, dy)
        inside = d > 0
        drop = np.where(d < round_, round_ - np.sqrt(np.clip(round_ ** 2 - (round_ - d) ** 2, 0, None)), 0.0)
        z = top - drop
        block = self.h[np.ix_(ys, xs)]
        win = inside & (z > block)
        self.h[np.ix_(ys, xs)] = np.where(win, z, block)
        own = self.owner[np.ix_(ys, xs)]
        self.owner[np.ix_(ys, xs)] = np.where(win, owner, own)

    def dent(self, cx, cy, a, b, turn, depth, shape='foot'):
        """A print pressed in: a foot (heel and ball) or a hoof (a crescent)."""
        ys, xs, lx, ly = self.window(cx, cy, max(a, b) * 1.2)
        c, s = math.cos(turn), math.sin(turn)
        u = (lx * c + ly * s) / a
        v = (-lx * s + ly * c) / b
        if shape == 'hoof':
            q = u * u + v * v
            press = np.clip(1 - q, 0, 1) * (1 - np.clip(1 - ((u + 0.45) ** 2 + v * v) / 0.35, 0, 1))
        else:
            ball = np.clip(1 - ((u - 0.35) ** 2 / 0.42 + v * v / 0.9), 0, 1)
            heel = np.clip(1 - ((u + 0.55) ** 2 / 0.16 + v * v / 0.55), 0, 1)
            press = np.maximum(ball, heel)
        rim = np.clip(1 - np.abs(u * u + v * v - 1.1) / 0.25, 0, 1) * 0.25
        self.h[np.ix_(ys, xs)] += depth * (-np.sqrt(press) + rim)


def tone(base, spread, values):
    """Colours from a base RGB, scaled by `values` (0..1) over +/- spread."""
    return np.asarray(base)[None, None, :] * (1 - spread + 2 * spread * values)[:, :, None]


def per_owner(field, palette, count):
    """A colour per stamped stone, by its owner index (palette: list of RGB; picked at random per stone)."""
    picks = np.array([palette[i] for i in rng.integers(0, len(palette), count)])
    jitter = rng.uniform(0.85, 1.15, count)[:, None]
    colours = picks * jitter
    out = np.zeros((N, N, 3))
    mask = field.owner >= 0
    out[mask] = colours[field.owner[mask]]
    return out, mask


def scatter(count, size, min_gap_of, tries=40000, seed=1):
    """Dart throwing on the torus: returns [(x, y, r)] with r from min_gap_of(i) (big first)."""
    gen = np.random.default_rng(seed)
    cell = 0.25
    cells = max(1, int(size / cell))
    grid = {}
    out = []
    for attempt in range(tries):
        if len(out) >= count:
            break
        r = min_gap_of(attempt / tries, gen)
        x, y = gen.uniform(0, size, 2)
        gx, gy = int(x / size * cells), int(y / size * cells)
        ok = True
        for ox in (-1, 0, 1):
            for oy in (-1, 0, 1):
                for (sx, sy, sr) in grid.get(((gx + ox) % cells, (gy + oy) % cells), ()):
                    dx = abs(x - sx)
                    dy = abs(y - sy)
                    dx = min(dx, size - dx)
                    dy = min(dy, size - dy)
                    if dx * dx + dy * dy < (0.9 * (r + sr)) ** 2:
                        ok = False
                        break
                if not ok:
                    break
            if not ok:
                break
        if ok:
            out.append((x, y, r))
            grid.setdefault((gx % cells, gy % cells), []).append((x, y, r))
    return out


# ---- the surfaces ------------------------------------------------------------------------------

def setts():
    S = 2.0
    f = Field(S, 0.0)
    owner = 0
    y = 0.0
    courses = 20
    ch = S / courses
    for course in range(courses):
        x = rng.uniform(0, 0.2)
        lengths = []
        while sum(lengths) < S - 0.3:
            lengths.append(rng.uniform(0.16, 0.26))
        lengths.append(S - sum(lengths))
        for length in lengths:
            top = rng.uniform(0.045, 0.06)
            f.box(x + 0.006, y + 0.006, length - 0.012, ch - 0.012, top, round_=rng.uniform(0.015, 0.03), owner=owner)
            owner += 1
            x += length
        y += ch
    # Worn: each sett's top domed down at its edges a little more, pitted by grain.
    grain = fbm(48, 3, 4)
    f.h += 0.004 * (grain - 0.5) * (f.owner >= 0)
    sand = fbm(20, 4, 4)
    f.h = np.maximum(f.h, 0.008 + 0.006 * sand)
    col, stone = per_owner(f, [(0.36, 0.35, 0.34), (0.42, 0.40, 0.38), (0.31, 0.31, 0.32), (0.40, 0.36, 0.33), (0.46, 0.45, 0.43)], owner)
    f.col = np.where(stone[:, :, None], col * (0.85 + 0.3 * grain[:, :, None]), tone((0.25, 0.21, 0.16), 0.2, sand))
    f.rough = np.where(stone, 0.62 + 0.2 * grain, 0.95)
    return f


def slabs():
    S = 3.0
    f = Field(S, 0.0)
    owner = 0
    y = 0.0
    while y < S - 0.35:
        h = rng.uniform(0.4, 0.7)
        if S - y - h < 0.35:
            h = S - y
        x = rng.uniform(0, 0.4)
        lengths = []
        while sum(lengths) < S - 0.5:
            lengths.append(rng.uniform(0.45, 0.95))
        lengths.append(S - sum(lengths))
        for length in lengths:
            f.box(x + 0.005, y + 0.005, length - 0.01, h - 0.01, rng.uniform(0.022, 0.03), round_=rng.uniform(0.006, 0.014), owner=owner)
            owner += 1
            x += length
        y += h
    wear = fbm(6, 7, 5)
    grain = fbm(64, 8, 4)
    f.h += np.where(f.owner >= 0, -0.004 * wear + 0.0012 * (grain - 0.5), 0.0)
    f.h = np.maximum(f.h, 0.004)
    col, stone = per_owner(f, [(0.42, 0.41, 0.39), (0.38, 0.37, 0.36), (0.45, 0.43, 0.40), (0.35, 0.35, 0.36)], owner)
    f.col = np.where(stone[:, :, None], col * (0.85 + 0.3 * grain[:, :, None]) * (0.9 + 0.2 * wear[:, :, None]), (0.17, 0.15, 0.12))
    f.rough = np.where(stone, 0.7 + 0.2 * grain, 0.97)
    return f


def rubble():
    S = 3.0
    f = Field(S, 0.0)
    stones = scatter(900, S, lambda t, g: g.uniform(0.11, 0.22) if t < 0.3 else g.uniform(0.06, 0.12), tries=60000, seed=5)
    for index, (x, y, r) in enumerate(stones):
        # Flat-bedded: wider than tall, laid roughly level.
        f.stone(x, y, r * rng.uniform(1.1, 1.5), r * rng.uniform(0.55, 0.8), rng.uniform(-0.25, 0.25), rng.uniform(0.04, 0.08), power=0.35, wobble=0.18, seed=index, owner=index)
    grain = fbm(40, 9, 5)
    f.h += np.where(f.owner >= 0, 0.008 * (grain - 0.5), 0.0)
    mortar = fbm(16, 10, 4)
    f.h = np.maximum(f.h, 0.012 + 0.008 * mortar)
    col, stone = per_owner(f, [(0.30, 0.28, 0.27), (0.36, 0.33, 0.30), (0.27, 0.27, 0.29), (0.40, 0.33, 0.28), (0.33, 0.32, 0.30)], len(stones))
    f.col = np.where(stone[:, :, None], col * (0.8 + 0.4 * grain[:, :, None]), tone((0.34, 0.32, 0.28), 0.15, mortar))
    f.rough = np.where(stone, 0.85 + 0.1 * grain, 0.97)
    return f


def planks():
    S = 2.0
    f = Field(S, 0.0)
    boards = 10
    bw = S / boards
    xs = np.arange(N) * f.px
    grain = np.zeros((N, N))
    for board in range(boards):
        x0 = board * bw
        joint = rng.uniform(0, S)
        cols = (xs >= x0 + 0.003) & (xs < x0 + bw - 0.003)
        # Grain along the board (y): stretched noise; a butt joint across it somewhere.
        g = fbm(4, 20 + board, 5)
        streak = np.sin((xs[None, :] - x0) * 260 + 8 * g) * 0.5 + 0.5
        board_h = 0.02 + 0.0015 * rng.uniform(-1, 1) + 0.0015 * streak * 0.5 - 0.001 * np.abs((xs[None, :] - x0 - bw / 2) / (bw / 2)) ** 2
        rows = np.abs(((np.arange(N) * f.px)[:, None] - joint + S / 2) % S - S / 2) > 0.002
        sel = cols[None, :] & rows
        f.h = np.where(sel, board_h, f.h)
        grain = np.where(sel, streak * 0.6 + g * 0.4, grain)
        for nail in range(4):
            ny = (joint + (nail // 2) * S / 2 + 0.03) % S
            for side in (0.25, 0.75):
                f.stone(x0 + bw * side, ny, 0.004, 0.004, 0, 0.0215, power=0.3, wobble=0.0, owner=-2)
    nails = f.owner == -2
    f.owner[:] = -1
    f.col = np.where((f.h > 0.01)[:, :, None], tone((0.36, 0.27, 0.19), 0.3, grain), (0.05, 0.04, 0.03))
    f.col = np.where(nails[:, :, None], (0.12, 0.11, 0.1), f.col)
    f.rough = np.where(f.h > 0.01, 0.75 + 0.15 * grain, 0.95)
    return f


def earth():
    S = 2.0
    f = Field(S, 0.0)
    base = fbm(6, 30, 6)
    fine = fbm(80, 31, 3)
    f.h = 0.03 * base + 0.004 * fine
    clods = scatter(500, S, lambda t, g: g.uniform(0.008, 0.03), tries=8000, seed=32)
    for index, (x, y, r) in enumerate(clods):
        f.stone(x, y, r, r * rng.uniform(0.6, 1), rng.uniform(0, 3.14), f.h[int(y / f.px) % N, int(x / f.px) % N] + r * 0.6, power=0.6, wobble=0.3, seed=index + 1000, owner=index if r < 0.012 else -1)
    for print_ in range(26):
        x, y = rng.uniform(0, S, 2)
        if print_ % 3 == 0:
            f.dent(x, y, 0.065, 0.06, rng.uniform(0, 6.28), 0.014, 'hoof')
        else:
            f.dent(x, y, 0.14, 0.05, rng.uniform(0, 6.28), 0.012, 'foot')
    stones = f.owner >= 0
    low = 1 - np.clip((f.h - f.h.min()) / (f.h.max() - f.h.min() + 1e-9), 0, 1)
    f.col = tone((0.29, 0.23, 0.17), 0.18, base) * (0.8 + 0.25 * fine[:, :, None]) * (1 - 0.25 * low[:, :, None])
    f.col = np.where(stones[:, :, None], (0.38, 0.36, 0.33), f.col)
    f.rough = 0.92 - 0.15 * low
    return f


def blades(f, count, length, width, height, colours, seed):
    """Grass blades drawn as tapered strokes lying in all directions, each standing a little higher than what is under it."""
    gen = np.random.default_rng(seed)
    for blade in range(count):
        x, y = gen.uniform(0, f.size, 2)
        angle = gen.uniform(0, 6.28)
        bend = gen.uniform(-1.5, 1.5)
        L = gen.uniform(*length)
        top = gen.uniform(*height)
        colour = np.asarray(colours[gen.integers(0, len(colours))]) * gen.uniform(0.8, 1.2)
        steps = max(4, int(L / f.px))
        t = np.linspace(0, 1, steps)
        a = angle + bend * t * t
        px = x + np.cumsum(np.cos(a)) * L / steps
        py = y + np.cumsum(np.sin(a)) * L / steps
        w = width * (1 - t) + f.px * 0.5
        z = top * (0.6 + 0.4 * np.sin(np.pi * t * 0.9))
        for k in range(steps):
            r = max(1, int(w[k] / f.px))
            ix = int(px[k] / f.px) % N
            iy = int(py[k] / f.px) % N
            ys = np.arange(iy - r + 1, iy + r) % N
            xs = np.arange(ix - r + 1, ix + r) % N
            block = f.h[np.ix_(ys, xs)]
            zz = z[k] + 0.0008 * gen.random()
            win = zz > block
            f.h[np.ix_(ys, xs)] = np.where(win, zz, block)
            cb = f.col[np.ix_(ys, xs)]
            f.col[np.ix_(ys, xs)] = np.where(win[:, :, None], colour * (0.8 + 0.4 * t[k]), cb)


def grass():
    S = 1.5
    f = Field(S, 0.0)
    soil = fbm(10, 40, 5)
    f.h = 0.004 * soil
    f.col = tone((0.2, 0.16, 0.1), 0.2, soil)
    blades(f, 26000, (0.03, 0.09), 0.0018, (0.006, 0.03), [(0.20, 0.30, 0.09), (0.24, 0.34, 0.11), (0.17, 0.25, 0.08), (0.3, 0.32, 0.14), (0.33, 0.30, 0.16)], 41)
    f.rough = np.full((N, N), 0.88)
    return f


def drygrass():
    S = 1.6
    f = Field(S, 0.0)
    soil = fbm(10, 50, 5)
    fine = fbm(90, 51, 3)
    f.h = 0.006 * soil + 0.002 * fine
    f.col = tone((0.42, 0.36, 0.27), 0.15, soil) * (0.85 + 0.3 * fine[:, :, None])
    grit = scatter(1500, S, lambda t, g: g.uniform(0.003, 0.012), tries=12000, seed=52)
    for index, (x, y, r) in enumerate(grit):
        f.stone(x, y, r, r * 0.8, rng.uniform(0, 3), 0.004 + r * 0.6, power=0.5, wobble=0.2, seed=index, owner=index)
    col, stone = per_owner(f, [(0.46, 0.42, 0.36), (0.36, 0.33, 0.30), (0.52, 0.47, 0.40)], len(grit))
    f.col = np.where(stone[:, :, None], col, f.col)
    f.owner[:] = -1
    # Bunch grass in tufts: blades from a few hundred centres.
    gen = np.random.default_rng(53)
    for tuft in range(160):
        cx, cy = gen.uniform(0, S, 2)
        blades_at = gen.integers(25, 60)
        gen2 = np.random.default_rng(int(gen.integers(0, 1 << 30)))
        for b in range(blades_at):
            angle = gen2.uniform(0, 6.28)
            L = gen2.uniform(0.04, 0.12)
            x = cx + gen2.normal(0, 0.012)
            y = cy + gen2.normal(0, 0.012)
            steps = max(4, int(L / f.px))
            t = np.linspace(0, 1, steps)
            px = x + np.cos(angle) * L * t
            py = y + np.sin(angle) * L * t
            colour = np.asarray([(0.62, 0.55, 0.38), (0.55, 0.50, 0.33), (0.48, 0.47, 0.30)][gen2.integers(0, 3)]) * gen2.uniform(0.85, 1.15)
            for k in range(steps):
                ix = int(px[k] / f.px) % N
                iy = int(py[k] / f.px) % N
                zz = 0.03 * (1 - t[k]) + 0.008
                if zz > f.h[iy, ix]:
                    f.h[iy, ix] = zz
                    f.col[iy, ix] = colour * (0.75 + 0.4 * t[k])
    f.rough = np.full((N, N), 0.93)
    return f


def gravel():
    S = 1.4
    f = Field(S, 0.0)
    fines = fbm(30, 60, 5)
    f.h = 0.003 * fines
    stones = scatter(5000, S, lambda t, g: g.uniform(0.008, 0.018) if t < 0.25 else g.uniform(0.002, 0.008), tries=40000, seed=61)
    for index, (x, y, r) in enumerate(stones):
        f.stone(x, y, r * rng.uniform(1, 1.4), r, rng.uniform(0, 3.14), r * rng.uniform(0.6, 1.0), power=0.5, wobble=0.25, seed=index, owner=index)
    col, stone = per_owner(f, [(0.45, 0.43, 0.40), (0.36, 0.35, 0.34), (0.52, 0.48, 0.42), (0.30, 0.29, 0.29), (0.48, 0.40, 0.34)], len(stones))
    f.col = np.where(stone[:, :, None], col, tone((0.36, 0.32, 0.27), 0.2, fines))
    f.rough = np.where(stone, 0.7, 0.95)
    return f


def sand():
    S = 1.6
    f = Field(S, 0.0)
    base = fbm(5, 70, 5)
    grain = fbm(160, 71, 2)
    yy = np.arange(N)[:, None] * f.px
    xx = np.arange(N)[None, :] * f.px
    # Raked: faint parallel furrows (a rake's tines, 25 mm apart), wandering with the stroke.
    rake = np.sin((yy + 0.03 * np.sin(xx * 3.9)) * 2 * np.pi / 0.025) * 0.5 + 0.5
    strength = np.clip(fbm(3, 72, 3) * 1.6 - 0.4, 0, 1)
    f.h = 0.012 * base + 0.0012 * rake * strength + 0.0005 * grain
    for print_ in range(14):
        x, y = rng.uniform(0, S, 2)
        f.dent(x, y, 0.13, 0.048, rng.uniform(0, 6.28), 0.008, 'foot')
    f.col = tone((0.66, 0.57, 0.43), 0.08, base) * (0.92 + 0.16 * grain[:, :, None])
    f.rough = np.full((N, N), 0.95)
    return f


def beach():
    S = 1.6
    f = Field(S, 0.0)
    base = fbm(4, 80, 5)
    grain = fbm(160, 81, 2)
    yy = np.arange(N)[:, None] * f.px
    xx = np.arange(N)[None, :] * f.px
    warp = 0.06 * (fbm(4, 82, 3) - 0.5)
    phase = (yy + warp + 0.02 * np.sin(xx * 2 * np.pi / S * 3)) * 2 * np.pi / 0.08
    ripple = np.abs(np.sin(phase / 2)) ** 1.5
    f.h = 0.01 * base + 0.006 * ripple + 0.0004 * grain
    f.col = tone((0.7, 0.62, 0.5), 0.07, base) * (0.94 + 0.12 * grain[:, :, None]) * (0.95 + 0.08 * ripple[:, :, None])
    f.rough = np.full((N, N), 0.9)
    return f


def concrete():
    S = 2.4
    f = Field(S, 0.0)
    base = fbm(6, 90, 6)
    fine = fbm(120, 91, 3)
    yy = np.arange(N)[:, None] * f.px
    broom = np.sin(yy * 2 * np.pi / 0.004 + 4 * fbm(30, 92, 2)) * 0.5 + 0.5
    f.h = 0.003 * base + 0.0004 * broom + 0.0005 * fine
    pores = scatter(1200, S, lambda t, g: g.uniform(0.001, 0.003), tries=6000, seed=93)
    for (x, y, r) in pores:
        f.dent(x, y, r, r, 0, 0.0015, 'hoof')
    # A few hairline cracks: wandering lines pressed in.
    gen = np.random.default_rng(94)
    for crack in range(5):
        x, y = gen.uniform(0, S, 2)
        a = gen.uniform(0, 6.28)
        for step in range(300):
            a += gen.normal(0, 0.15)
            x += math.cos(a) * f.px
            y += math.sin(a) * f.px
            f.h[int(y / f.px) % N, int(x / f.px) % N] -= 0.0015
    f.col = tone((0.5, 0.49, 0.47), 0.12, base) * (0.92 + 0.16 * fine[:, :, None])
    f.rough = np.full((N, N), 0.88)
    return f


SURFACES = {'setts': setts, 'slabs': slabs, 'rubble': rubble, 'planks': planks, 'earth': earth, 'grass': grass, 'drygrass': drygrass, 'gravel': gravel, 'sand': sand, 'beach': beach, 'concrete': concrete}

# ---- to Blender ---------------------------------------------------------------------------------

field = SURFACES[NAME]()
S = field.size
scene = tb.reset()
span = max(1e-4, float(field.h.max() - field.h.min()))
group = tb.out_group(ao_distance=max(0.004, span * 1.5), h_lo=float(field.h.min()), h_hi=float(field.h.max()))
tile = tb.new_collection()

xs = np.arange(N + 1) * field.px
grid_h = np.pad(field.h, ((0, 1), (0, 1)), mode='wrap')
verts = np.stack([np.broadcast_to(xs[None, :], (N + 1, N + 1)), np.broadcast_to(xs[:, None], (N + 1, N + 1)), grid_h], axis=2).reshape(-1, 3)
ii, jj = np.meshgrid(np.arange(N), np.arange(N))
k = (jj * (N + 1) + ii).ravel()
faces = np.stack([k, k + 1, k + N + 2, k + N + 1], axis=1)
mesh = bpy.data.meshes.new(NAME)
mesh.vertices.add(len(verts))
mesh.vertices.foreach_set('co', verts.astype(np.float32).ravel())
mesh.loops.add(len(faces) * 4)
mesh.loops.foreach_set('vertex_index', faces.astype(np.int32).ravel())
mesh.polygons.add(len(faces))
mesh.polygons.foreach_set('loop_start', (np.arange(len(faces)) * 4).astype(np.int32))
mesh.polygons.foreach_set('loop_total', np.full(len(faces), 4, dtype=np.int32))
mesh.update()
mesh.validate()
mesh.polygons.foreach_set('use_smooth', np.ones(len(faces), dtype=bool))
colour = np.pad(field.col, ((0, 1), (0, 1), (0, 0)), mode='wrap').reshape(-1, 3)
rough = np.pad(field.rough, ((0, 1), (0, 1)), mode='wrap').reshape(-1)
for name, values in (('albedo', np.concatenate([colour, np.ones((len(colour), 1))], axis=1)), ('aux', np.stack([rough, rough, rough, np.ones_like(rough)], axis=1))):
    attribute = mesh.color_attributes.new(name, 'FLOAT_COLOR', 'POINT')
    attribute.data.foreach_set('color', values.astype(np.float32).ravel())


def surface(nodes, links, geometry):
    albedo = nodes.new('ShaderNodeAttribute')
    albedo.attribute_name = 'albedo'
    aux = nodes.new('ShaderNodeAttribute')
    aux.attribute_name = 'aux'
    return albedo.outputs['Color'], aux.outputs['Fac'], 0.0, 0.0, None


mesh.materials.append(tb.material('surface', group, surface))
obj = bpy.data.objects.new(NAME, mesh)
tb.link(obj, tile)
tb.repeat_around(tile, S, S)
size = int(1024 * SCALE)
tb.camera(S, S, size, size)
tb.render_maps(group, OUT, NAME, samples={'normal': 16, 'albedo': 8, 'orm': 64, 'height': 4}, modes=['normal', 'albedo', 'orm', 'height'])
print('ground: tile', NAME, S, flush=True)
