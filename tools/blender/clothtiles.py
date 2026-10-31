# The textile and organic tiles (the cloth detail maps, src/detailmaps.js CLOTH_FAMILIES) as height fields: plain numpy, no
# Blender, so a tile can be looked at on its own (python3 tools/blender/clothtiles.py <name> writes a preview PNG). cloth.py
# builds each into a mesh in Blender and bakes it as the other tiles are (tilebake.py).
#
# Every tile is periodic over [0, 1) x [0, 1) in its own units (whole numbers of threads, stitches, feathers to the tile, so it
# repeats without a seam), `metres` on a side. Arrays are indexed [y, x], y up the picture (the garment's v: up the body).
# Each family returns { height (m), shade (0..1, the albedo's grey: fibre and dye variation the outfit's colour is multiplied
# by), rough (0..1), metres }. The reference each one is drawn from is cited by its function; the numbers are the reference's.

import math
import sys

import numpy as np

N = 1024


def grid(n=N):
    """Pixel centres over the unit tile: x, y (each n x n, y up)."""
    c = (np.arange(n) + 0.5) / n
    return np.meshgrid(c, c)


def periodic_noise(n, cells, seed, octaves=1):
    """Smooth periodic value noise: `cells` lattice points to the tile (each octave twice as many), -1..1."""
    return periodic_noise_xy(n, cells, cells, seed, octaves)


def periodic_noise_xy(n, cells_x, cells_y, seed, octaves=1):
    """periodic_noise with its own number of lattice cells across (x) and up (y): blotches drawn out one way."""
    rng = np.random.default_rng(seed)
    x, y = grid(n)
    total = np.zeros((n, n))
    amp = 1.0
    norm = 0.0
    for octave in range(octaves):
        kx, ky = cells_x * 2 ** octave, cells_y * 2 ** octave
        lattice = rng.uniform(-1, 1, (ky, kx))
        fx, fy = x * kx, y * ky
        ix, iy = np.floor(fx).astype(int), np.floor(fy).astype(int)
        tx, ty = fx - ix, fy - iy
        sx, sy = tx * tx * (3 - 2 * tx), ty * ty * (3 - 2 * ty)
        a = lattice[iy % ky, ix % kx]
        b = lattice[iy % ky, (ix + 1) % kx]
        c = lattice[(iy + 1) % ky, ix % kx]
        d = lattice[(iy + 1) % ky, (ix + 1) % kx]
        total += amp * (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy)
        norm += amp
        amp *= 0.5
    return total / norm


def line_noise(count, samples, seed, cells=6):
    """Per-thread smooth periodic variation along its length: `count` threads, `samples` points along, -1..1."""
    rng = np.random.default_rng(seed)
    lattice = rng.uniform(-1, 1, (count, cells))
    s = (np.arange(samples) + 0.5) / samples * cells
    i = np.floor(s).astype(int)
    t = s - i
    t = t * t * (3 - 2 * t)
    return lattice[:, i % cells] * (1 - t) + lattice[:, (i + 1) % cells] * t


def blur(a, radius):
    """A periodic box blur, twice (near enough Gaussian)."""
    for _ in range(2):
        for axis in (0, 1):
            acc = np.zeros_like(a)
            for k in range(-radius, radius + 1):
                acc += np.roll(a, k, axis=axis)
            a = acc / (2 * radius + 1)
    return a


def weave(over, warp_count, weft_count, *, width=0.86, lift=0.22, flat=1.0, slub=0.0, twist=0.0, seed=1, n=N, warp_scale=None, weft_scale=None):
    """
    A woven cloth: warp threads up the tile (along y), weft across (along x), `over[i % len, j % len]` true where warp i lies
    over weft j. Heights in thread pitches: each thread a round (or `flat`tened) section `width` of its pitch across,
    rising and sinking `lift` at the crossings. `slub`: the thread's thickness varying along it (linen's slubs, ring-spun
    denim); `twist`: the ply's slant ridges along the thread. Returns height (pitches), which thread is on top (1 warp, 0 weft).
    """
    x, y = grid(n)
    rows, cols = over.shape
    i = np.floor(x * warp_count).astype(int)
    j = np.floor(y * weft_count).astype(int)
    dx = x * warp_count - i - 0.5
    dy = y * weft_count - j - 0.5

    def lifted(index_fixed, along, count_along, warp):
        s = along * count_along - 0.5
        k0 = np.floor(s).astype(int)
        t = s - k0
        t = t * t * (3 - 2 * t)
        if warp:
            h0 = np.where(over[index_fixed % rows, k0 % cols], lift, -lift)
            h1 = np.where(over[index_fixed % rows, (k0 + 1) % cols], lift, -lift)
        else:
            h0 = np.where(over[k0 % rows, index_fixed % cols], -lift, lift)
            h1 = np.where(over[(k0 + 1) % rows, index_fixed % cols], -lift, lift)
        return h0 + (h1 - h0) * t

    thick_w = np.ones((n, n))
    thick_f = np.ones((n, n))
    if slub:
        along_w = line_noise(warp_count, n, seed)
        along_f = line_noise(weft_count, n, seed + 1)
        thick_w = 1 + slub * along_w[i % warp_count, (y * n).astype(int) % n]
        thick_f = 1 + slub * along_f[j % weft_count, (x * n).astype(int) % n]
    if warp_scale is not None:
        thick_w = thick_w * warp_scale[i % len(warp_scale)]
    if weft_scale is not None:
        thick_f = thick_f * weft_scale[j % len(weft_scale)]
    half_w = width * 0.5 * thick_w
    half_f = width * 0.5 * thick_f
    qw = np.clip(1 - (dx / half_w) ** 2, 0, None)
    qf = np.clip(1 - (dy / half_f) ** 2, 0, None)
    zw = lifted(i, y, weft_count, True) + 0.5 * width * thick_w * qw ** (0.5 * flat)
    zf = lifted(j, x, warp_count, False) + 0.5 * width * thick_f * qf ** (0.5 * flat)
    if twist:
        zw += twist * qw * np.sin(2 * np.pi * (y * weft_count * 2.0 + dx * 1.2))
        zf += twist * qf * np.sin(2 * np.pi * (x * warp_count * 2.0 + dy * 1.2))
    zw = np.where(qw > 0, zw, -1.0)
    zf = np.where(qf > 0, zf, -1.0)
    height = np.maximum(np.maximum(zw, zf), -lift - 0.3)
    return height, (zw >= zf).astype(float)


def fuzz(n, seed, strength):
    """Fibre fuzz: fine periodic noise (pitches)."""
    return strength * periodic_noise(n, 128, seed, octaves=2)


def plain():
    """
    Plain weave (tabby) linen and cotton: Romano-British linen tabbies run 17 x 17 to 24 x 24 threads/cm (Wolverton,
    https://archaeologydataservice.ac.uk/catalogue/adsdata/arch-7172-1/dissemination/mkmono_11_0_103.pdf); 18/cm here
    (0.56 mm pitch), 24 threads to the 13.3 mm tile, slubbed thread to thread as hand-spun linen is. A coarser cloth (Roman
    wool tabby, c. 7-10/cm at Walbrook, the same report; a mawashi's canvas) wears it at a larger scale.
    """
    count = 24
    pitch = 0.0133 / count
    over = np.array([[1, 0], [0, 1]], bool)
    h, top = weave(over, count, count, width=0.9, lift=0.2, slub=0.28, twist=0.04, seed=11)
    h = h + fuzz(N, 12, 0.03)
    shade = 0.86 + 0.08 * top + 0.05 * periodic_noise(N, 24, 13)
    return {'height': h * pitch, 'shade': shade, 'rough': np.full((N, N), 0.88), 'metres': 0.0133}


def twill():
    """
    Wool 2/2 diamond twill, the Germanic cloth of the migrations (the Thorsberg tunic, a narrow 2/2 diamond twill:
    https://sketchfab.com/3d-models/the-thorsberg-tunic-3d-reconstruction-e5f37c5f821948628c5645a1d41b2afc and
    https://www.romanarmytalk.com/rat/printthread.php?tid=12932), c. 12 threads/cm (comparable finds 11-14 x 14-16/cm,
    https://journals.socantscot.org/index.php/psas/article/download/8306/8274/8261): 24 threads to the 20 mm tile, the diagonal
    reversing every 4 threads into diamonds; the woollen yarn hairy. (Also a rope's slant strands, scaled up.)
    """
    count = 24
    pitch = 0.02 / count

    def g(k):
        k = k % 8
        return k if k < 4 else 7 - k

    over = np.array([[((g(a) + g(b)) % 4) < 2 for b in range(24)] for a in range(24)], bool)
    h, top = weave(over, count, count, width=0.95, lift=0.24, slub=0.15, twist=0.05, seed=21)
    h = h + fuzz(N, 22, 0.06)
    shade = 0.85 + 0.06 * top + 0.06 * periodic_noise(N, 32, 23, 2)
    return {'height': h * pitch, 'shade': shade, 'rough': np.full((N, N), 0.92), 'metres': 0.02}


def denim():
    """
    Denim: 3/1 right-hand twill, the warp (indigo) over three wefts (https://www.heddels.com/?p=1523,
    https://dutildenim.com/blogs/jeans/right-hand-twill-what-does-it-mean), heavier warp than weft; c. 24 ends/cm, 32 ends
    and 32 picks to the 13.3 mm tile, the ring-spun warp slubbed (its streaks). The white weft shows paler.
    """
    count = 32
    pitch = 0.0133 / count
    over = np.array([[((a - b) % 4) != 0 for b in range(4)] for a in range(4)], bool)
    h, top = weave(over, count, count, width=0.92, lift=0.22, slub=0.22, twist=0.05, seed=31)
    h = h + fuzz(N, 32, 0.03)
    streak = line_noise(count, N, 33, cells=3)
    i = (grid()[0] * count).astype(int) % count
    shade = np.where(top > 0, 0.82 + 0.08 * streak[i, (grid()[1] * N).astype(int) % N], 1.0)
    return {'height': h * pitch, 'shade': shade, 'rough': np.full((N, N), 0.86), 'metres': 0.0133}


def cloth_ground(n, threads, seed, amp):
    """A fine plain weave laid over a larger form (a quilted coat's shell), in metres of `amp` per pitch."""
    over = np.array([[1, 0], [0, 1]], bool)
    h, _ = weave(over, threads, threads, width=0.9, lift=0.2, slub=0.2, seed=seed, n=n)
    return h * amp


def quilt():
    """
    Quilted padding in vertical channels, as European gambesons and aketons stood alone were stitched (tubes of 2-4 in:
    https://wiki.vikingsonline.org.uk/Gambeson; the Black Prince's and the Chartres pourpoint:
    https://myarmoury.com/feature_spot_quilted.html); the Ming padded cotton coat and the gladiator's quilted leg wraps the
    same. Two 40 mm channels to the 80 mm tile, the stuffing puffed between sunk lines of running stitch (4 mm stitches), the
    linen shell's weave over it and a puckering where the stitches draw it in.
    """
    metres = 0.08
    x, y = grid()
    u = (x * 2) % 1
    puff = np.sin(np.pi * u) ** 0.55
    pucker = 1 + 0.18 * periodic_noise(N, 16, 41, 2) * (1 - puff)
    depth = 0.0045
    h = depth * puff * pucker
    stitch = ((y * 20) % 1 < 0.62) & (np.abs(u - 0.5) > 0.47)
    h += np.where(stitch, 0.0004, 0.0)
    h += cloth_ground(N, 96, 42, 0.0003)
    shade = 0.8 + 0.2 * puff ** 0.5 + 0.03 * periodic_noise(N, 20, 43)
    return {'height': h, 'shade': shade, 'rough': np.full((N, N), 0.9), 'metres': metres}


def diamond_quilt():
    """
    Quilted cotton in diamonds: the Mexica ichcahuipilli, unspun cotton packed between two cloths a finger or two thick and
    sewn in diamond-shaped patterns (https://en.wikipedia.org/wiki/Ichcahuipilli; Hassig, Aztec Warfare), which the Spaniards
    took up as the escaupil. Diamonds 42 mm between stitch lines (the 60 mm tile, one line each way), deep puffs.
    """
    metres = 0.06
    x, y = grid()
    a = (x + y) % 1
    b = (x - y) % 1
    puff = (np.sin(np.pi * a) * np.sin(np.pi * b)) ** 0.45
    h = 0.006 * puff * (1 + 0.12 * periodic_noise(N, 12, 51, 2))
    line = np.minimum(np.minimum(a, 1 - a), np.minimum(b, 1 - b))
    along = np.where(np.minimum(a, 1 - a) < np.minimum(b, 1 - b), x - y, x + y) * 15
    h += np.where((line < 0.006) & ((along % 1) < 0.6), 0.0004, 0.0)
    h += cloth_ground(N, 80, 52, 0.0003)
    shade = 0.78 + 0.22 * puff ** 0.6
    return {'height': h, 'shade': shade, 'rough': np.full((N, N), 0.92), 'metres': metres}


def scatter_lines(n, count, length, seed, angle_spread=math.pi, angle=0.0, width=1, curl=0.0, value=1.0, mode='add', height_along=0.0, base=None, layer=None):
    """Thin lines (fibres, hairs) rasterised into an n x n periodic field, each `length` (tile units) long."""
    rng = np.random.default_rng(seed)
    field = np.zeros((n, n)) if base is None else base
    steps = max(4, int(length * n * 1.5))
    for _ in range(count):
        x0, y0 = rng.uniform(0, 1, 2)
        a = angle + rng.uniform(-angle_spread, angle_spread)
        bend = rng.uniform(-curl, curl)
        t = np.linspace(0, 1, steps)
        ang = a + bend * t
        dxs = np.cos(ang) * length / steps
        dys = np.sin(ang) * length / steps
        xs = x0 + np.cumsum(dxs)
        ys = y0 + np.cumsum(dys)
        lift = (layer if layer is not None else 0.0) + height_along * t
        for ox in range(-(width // 2), width // 2 + 1):
            ix = ((xs * n).astype(int) + ox) % n
            iy = (ys * n).astype(int) % n
            if mode == 'add':
                np.add.at(field, (iy, ix), value)
            else:
                np.maximum.at(field, (iy, ix), lift + value * (1 - abs(ox) / (width // 2 + 1)))
    return field


def felt():
    """
    Felt: wool not woven but pounded until its scaled fibres lock into a sheet (https://www.worldhistory.org/article/1455/
    clothing-in-the-mongol-empire/): a mat of short fibres every way, over a slow lumpiness where it was rolled. The steppe's
    hats, a Janissary's bork and his dolama's fulled broadcloth (çuha). 40 mm tile.
    """
    n = N
    density = scatter_lines(n, 26000, 0.012, 61, curl=1.2, width=1)
    density = blur(density, 1)
    density = (density - density.mean()) / (density.std() + 1e-6)
    lumps = periodic_noise(n, 6, 62, 3)
    h = 0.00004 * density + 0.00045 * lumps
    shade = 0.88 + 0.03 * np.tanh(density) + 0.06 * lumps
    return {'height': h, 'shade': shade, 'rough': np.full((n, n), 0.95), 'metres': 0.04}


def damask():
    """
    Silk damask and brocade: a satin ground with the figure woven in the reverse face, so the pattern shows only as the light
    catches it (warp floats against weft floats); the Japanese kinran's gold paper wefts, the Chinese and Ottoman figured silks
    (UMMA kinran and karaori panels, https://umma.umich.edu/objects/one-of-four-panels-of-textile-fragments-kinran-and-karaori-1972-2-44-1;
    Met Higashiyama-gire double vine arabesque, https://cultural.jp/en/item/metmuseum-67557). An 80 mm repeat: a roundel of
    six petals and arabesque scrolls between, half-dropped; the floats as fine ridges, warp-wise in the ground, weft-wise in
    the figure, the figure a little brighter and glossier.
    """
    metres = 0.08
    x, y = grid()
    figure = np.zeros((N, N), bool)
    for cx, cy in ((0.25, 0.25), (0.75, 0.75)):
        dx = (x - cx + 0.5) % 1 - 0.5
        dy = (y - cy + 0.5) % 1 - 0.5
        r = np.hypot(dx, dy)
        th = np.arctan2(dy, dx)
        petal = 0.15 * (0.55 + 0.45 * np.abs(np.cos(3 * th)))
        figure |= (r < petal) & ~((r > 0.035) & (r < 0.05))
    for cx, cy in ((0.75, 0.25), (0.25, 0.75)):
        dx = (x - cx + 0.5) % 1 - 0.5
        dy = (y - cy + 0.5) % 1 - 0.5
        r = np.hypot(dx, dy)
        th = np.arctan2(dy, dx)
        spiral = np.abs(((th / (2 * np.pi) + r * 4.5) % 0.5) - 0.25) < 0.05
        figure |= spiral & (r > 0.04) & (r < 0.2)
    fig = blur(figure.astype(float), 1)
    ridges_ground = np.sin(2 * np.pi * x * 160) * 0.5 + 0.5
    ridges_figure = np.sin(2 * np.pi * y * 160) * 0.5 + 0.5
    h = 0.00002 * (ridges_ground * (1 - fig) + ridges_figure * fig) + 0.00008 * fig
    shade = 0.86 + 0.035 * fig
    rough = 0.42 - 0.12 * fig
    return {'height': h, 'shade': shade, 'rough': rough, 'metres': metres}


def periodic_points(count, seed):
    rng = np.random.default_rng(seed)
    return rng.uniform(0, 1, (count, 2))


def cells_f1f2(n, points, cell_count):
    """Distances to the nearest and second-nearest of periodic points (tile units), by a grid of `cell_count` cells."""
    x, y = grid(n)
    f1 = np.full((n, n), 9.0)
    f2 = np.full((n, n), 9.0)
    for px, py in points:
        dx = (x - px + 0.5) % 1 - 0.5
        dy = (y - py + 0.5) % 1 - 0.5
        d = dx * dx + dy * dy
        closer = d < f1
        f2 = np.where(closer, f1, np.minimum(f2, d))
        f1 = np.where(closer, d, f1)
    return np.sqrt(f1), np.sqrt(f2)


def leather():
    """
    Vegetable-tanned cowhide, the grain side: the hair pores scattered over it (the follicle pattern is the species' own:
    https://leather-dictionary.com/index.php/Leather_hair_pores_-_Hair_follicles, https://www.ligatus.org.uk/lob/taxonomy/term/136)
    in a network of fine creases where the skin flexed, mottled in tone; belts, straps, pteruges, boots, the leather of a
    lamellar's backing, a gladiator's harness. 60 mm tile.
    """
    n = N
    metres = 0.06
    f1, f2 = cells_f1f2(n // 2, periodic_points(220, 71), 0)
    crease = np.clip((f2 - f1) / 0.012, 0, 1)
    crease = np.kron(crease, np.ones((2, 2)))
    f1b, f2b = cells_f1f2(n // 2, periodic_points(900, 72), 0)
    fine = np.kron(np.clip((f2b - f1b) / 0.006, 0, 1), np.ones((2, 2)))
    pores = np.zeros((n, n))
    rng = np.random.default_rng(73)
    px = rng.integers(0, n, 9000)
    py = rng.integers(0, n, 9000)
    pores[py, px] = 1
    pores = blur(pores, 1)
    pores = pores / pores.max()
    h = 0.00006 * (crease ** 0.5) + 0.00002 * fine ** 0.5 - 0.00005 * pores + 0.00008 * periodic_noise(n, 5, 74, 3)
    mottle = periodic_noise(n, 8, 75, 3)
    shade = 0.84 + 0.07 * mottle + 0.025 * crease ** 0.5 - 0.1 * pores
    rough = 0.58 + 0.12 * (1 - crease) + 0.05 * mottle
    return {'height': h, 'shade': shade, 'rough': rough, 'metres': metres}


def fur():
    """
    Fur: guard hairs over a dense underfur, lying one way (down the body) and parting into locks; the steppe's fox and wolf,
    a fur hat, a silverback's coat, Commodus's lion skin (and, scaled down, a jaguar's short pelt, its hair up to c. 45 mm
    where longest: https://journals.flvc.org/edis/article/download/108837/103992/151440). Strands 8-16 mm on the 40 mm tile,
    each higher towards its tip, in clumps that share a direction.
    """
    n = N
    rng = np.random.default_rng(81)
    h = np.zeros((n, n))
    shade_acc = np.zeros((n, n))
    clumps = 90
    for c in range(clumps):
        cx, cy = rng.uniform(0, 1, 2)
        a = -math.pi / 2 + rng.uniform(-0.35, 0.35)
        for s in range(60):
            length = rng.uniform(0.2, 0.4)
            x0 = cx + rng.normal(0, 0.03)
            y0 = cy + rng.normal(0, 0.03)
            ang = a + rng.normal(0, 0.06)
            steps = int(length * n * 1.2)
            t = np.linspace(0, 1, steps)
            bend = rng.uniform(-0.25, 0.25)
            xs = x0 + np.cumsum(np.cos(ang + bend * t) * length / steps)
            ys = y0 + np.cumsum(np.sin(ang + bend * t) * length / steps)
            ix = (xs * n).astype(int) % n
            iy = (ys * n).astype(int) % n
            lift = rng.uniform(0, 1.0) + 0.8 * t
            np.maximum.at(h, (iy, ix), lift)
            np.maximum.at(h, (iy, (ix + 1) % n), lift - 0.05)
            np.add.at(shade_acc, (iy, ix), 0.4 + 0.6 * t)
    h = blur(h, 1)
    h = h / h.max()
    shade = 0.62 + 0.38 * np.clip(blur(shade_acc, 1) / (np.percentile(shade_acc, 95) + 1e-6), 0, 1)
    return {'height': h * 0.0015, 'shade': shade, 'rough': np.full((n, n), 0.72), 'metres': 0.04}


def feathers():
    """
    Featherwork: contour feathers sewn in overlapping rows to a cotton backing, tips down, as the Mexica warrior suits
    (tlahuiztli) were made (feathers sewn to a backing fabric: https://www.wikipedia.org/wiki/Mexican_featherwork, after
    Hassig). Each feather c. 30 mm long and 15 mm wide, two to a row on the 30 mm tile, the rows half a feather apart and
    staggered; the upper row lies over the lower; a rachis down each, barbs slanting off it.
    """
    n = N
    x, y = grid()
    h = np.zeros((n, n))
    shade = np.full((n, n), 0.7)
    best = np.full((n, n), -9.0)
    length, width, pitch = 1.0, 0.62, 0.5
    for r in range(2):
        for wy in range(-1, 3):
            top = r * pitch + wy
            for k in range(2):
                cx = (k + 0.5 * r + 0.25) / 2
                dx = (x - cx + 0.5) % 1 - 0.5
                along = (top - y) / length
                halfw = width * 0.5 * np.sin(np.pi * np.clip(along, 0, 1) ** 0.6) ** 0.5
                inside = (along >= 0) & (along <= 1) & (np.abs(dx) < halfw)
                better = inside & (top > best)
                side = dx / np.maximum(halfw, 1e-3)
                barbs = np.sin(2 * np.pi * (along * 40 + np.abs(dx) * 55))
                z = 0.5 * along - 0.15 * side ** 2 + 0.005 * barbs + 0.03 * np.exp(-(dx / 0.008) ** 2)
                rachis = np.exp(-(dx / 0.008) ** 2)
                s = 0.8 + 0.07 * barbs + 0.12 * rachis - 0.1 * side ** 2
                h = np.where(better, z, h)
                shade = np.where(better, s, shade)
                best = np.where(better, top, best)
    return {'height': (h - h.mean()) * 0.006, 'shade': np.clip(shade, 0, 1), 'rough': np.full((n, n), 0.5), 'metres': 0.03}


def straw():
    """
    Plaited straw: rice straw beaten soft and plaited, as waraji soles and straw kasa are (https://en.wikipedia.org/wiki/Waraji;
    https://hatguide.co.uk/kasa; Horniman waraji, https://www.horniman.ac.uk/object/nn2369): flat strips c. 3 mm wide in a
    2/2 twill plait, each strip finely ribbed along its length. 10 strips each way on the 30 mm tile.
    """
    count = 10
    pitch = 0.03 / count
    over = np.array([[((a + b) % 4) < 2 for b in range(4)] for a in range(4)], bool)
    h, top = weave(over, count, count, width=0.96, lift=0.12, flat=0.25, slub=0.08, seed=91)
    x, y = grid()
    ribs = np.where(top > 0, np.sin(2 * np.pi * x * count * 7), np.sin(2 * np.pi * y * count * 7))
    h = h + 0.02 * ribs
    shade = 0.84 + 0.05 * ribs + 0.06 * top + 0.04 * periodic_noise(N, 10, 92)
    return {'height': h * pitch, 'shade': shade, 'rough': np.full((N, N), 0.66), 'metres': 0.03}


def cordura():
    """
    Cordura nylon (1000D / 500D), the face of plate carriers, duty vests, pouches and webbing: a coarse 2 x 2 basket weave of
    air-textured nylon (https://ripstopbytheroll.com/collections/all-products/products/1000d-cordura;
    https://www.carryology.com/insights/insights-1/ballistic-nylon-vs-cordura-heavy-duty-durable-fabrics/), c. 10 threads/cm:
    24 threads to the 24 mm tile, the textured yarn fuzzy.
    """
    count = 24
    pitch = 0.024 / count
    over = np.array([[((a // 2) + (b // 2)) % 2 == 0 for b in range(4)] for a in range(4)], bool)
    h, top = weave(over, count, count, width=0.9, lift=0.2, flat=0.6, slub=0.06, seed=101)
    h = h + fuzz(N, 102, 0.07)
    shade = 0.88 + 0.04 * top + 0.04 * periodic_noise(N, 64, 103)
    return {'height': h * pitch, 'shade': shade, 'rough': np.full((N, N), 0.7), 'metres': 0.024}


def ripstop():
    """
    Ripstop: a fine plain weave with doubled, thicker threads every few millimetres both ways, a square grid that stops a tear
    (https://www.rothco.com/blog/what-is-rip-stop; BDU 200 g/m2 cotton ripstop,
    https://vetsecurite.com/en/vests/58766-bdu-us-ripstop-jacket-olive-green-mil-tec.html): 36 threads to the 12 mm tile
    (30/cm), a pair of heavy threads every 18 (6 mm squares). Uniform trousers and shirts.
    """
    count = 36
    pitch = 0.012 / count
    over = np.array([[1, 0], [0, 1]], bool)
    scale = np.ones(18)
    scale[0] = scale[1] = 1.45
    h, top = weave(over, count, count, width=0.88, lift=0.18, slub=0.05, seed=111, warp_scale=scale, weft_scale=scale)
    shade = 0.9 + 0.04 * top
    return {'height': h * pitch, 'shade': shade, 'rough': np.full((N, N), 0.8), 'metres': 0.012}


def knit():
    """
    Single jersey knit, the face of T-shirts, sportswear, hoodies and socks: columns of V-shaped loops (wales) and rows
    (courses). A 28-gauge jersey has c. 11 wales/cm (https://organiccottonplus.com/products/medium-jersey-28-tubular; the gauge
    as needles per inch), courses c. 15/cm: 15 wales and 21 courses to the 14 mm tile.
    """
    n = N
    wales, courses = 15, 21
    x, y = grid()
    h = np.full((n, n), -0.5)
    fx = x * wales
    fy = y * courses
    c0 = np.floor(fx).astype(int)
    r0 = np.floor(fy).astype(int)
    for dc in (-1, 0, 1):
        for dr in (-1, 0, 1, 2):
            c = c0 + dc
            r = r0 + dr
            for side in (-1, 1):
                # A leg from the loop's foot (c + 0.5, r) up and out to (c + 0.5 + side * 0.32, r + 1.25).
                ax, ay = c + 0.5 + side * 0.04, r - 0.1
                bx, by = c + 0.5 + side * 0.34, r + 1.2
                vx, vy = bx - ax, (by - ay) * (wales / courses)
                px, py = fx - ax, (fy - ay) * (wales / courses)
                t = np.clip((px * vx + py * vy) / (vx * vx + vy * vy), 0, 1)
                d = np.hypot(px - vx * t, py - vy * t)
                q = np.clip(1 - (d / 0.24) ** 2, 0, None)
                z = np.where(q > 0, 0.3 * np.sqrt(q) + 0.12 * np.sin(np.pi * t), -1)
                h = np.maximum(h, z)
    h = h + fuzz(n, 121, 0.02)
    shade = 0.84 + 0.16 * np.clip(h + 0.2, 0, 0.5) * 2
    pitch = 0.014 / wales
    return {'height': h * pitch, 'shade': np.clip(shade, 0, 1), 'rough': np.full((n, n), 0.86), 'metres': 0.014}


def jack():
    """
    The jack: a coat of many layers of linen stitched through, not stuffed (the archers' and foot soldiers' armour of the
    15th c.). A French ordinance asks 25 to 30 linens and a buckskin, worn linens the best, the collar as strong as the rest
    (https://www.bookandsword.com/armour-in-texts/french-and-burgundian-military-ordinances/); Sir John Howard's books a doublet
    of fence of 21-23 folds of fustian and linen (https://myarmoury.com/feature_spot_quilted.html); 18-30 layers, high in the
    collar (https://en.wikipedia.org/wiki/Gambeson). Stitched through so many layers it is firm: shallow ribs between sunk
    rows of close running stitch (rows 20 mm apart, stitches 5 mm; the spacing of reproductions from period art, no surviving
    jack being measured), the layers' edges rippling the ribs a little, the coarse linen (12/cm) of its face over it all.
    """
    metres = 0.08
    rows = 4
    x, y = grid()
    u = (x * rows) % 1
    rib = np.sin(np.pi * u) ** 0.35
    wobble = periodic_noise(N, 10, 151, 2)
    h = 0.0016 * rib * (1 + 0.15 * wobble)
    # The running stitch down each row: the thread over the face 3.5 mm, under it 1.5 mm, drawn into the groove.
    near = np.abs(u - 0.5) > 0.48
    along = (y * metres / 0.005 + 0.3 * (np.floor(x * rows) % 2)) % 1
    over = along < 0.7
    h += np.where(near & over, 0.00035, np.where(near, -0.00025, 0.0))
    h += cloth_ground(N, 96, 152, 0.00035)
    shade = 0.82 + 0.13 * rib ** 0.6 + 0.03 * periodic_noise(N, 20, 153) + np.where(near & over, 0.06, 0.0)
    return {'height': h, 'shade': np.clip(shade, 0, 1), 'rough': np.full((N, N), 0.9), 'metres': metres}


def camo():
    """
    Printed woodland camouflage on cotton or NYCO ripstop, a rifleman's combat uniform: the US M81 Woodland, four colours
    (light green, brown, dark green, black) in broad horizontal blotches with black 'branches', a 1.6x enlargement of ERDL
    that repeats every 62 cm (https://camopedia.org/index.php/M81_Woodland); OCP (Scorpion W2) as worn since 2015 is the same
    idea in softer, smaller blotches (https://soldiersystems.net/2014/09/09/the-official-color-palette-for-ocp-scorpion-w2-vatiant/).
    The print as the shade (its four tones' lightness, the garment's colour the middle of them) on the ripstop's 6 mm grid
    of doubled threads (https://www.rothco.com/blog/what-is-rip-stop); the 0.4 m tile carries blotches 4-15 cm across.
    """
    metres = 0.4
    x, y = grid()

    def field(seed, cells_x, cells_y):
        # Stretched across (the woodland's horizontal lie): fewer lattice cells across than up the tile.
        return periodic_noise_xy(N, cells_x, cells_y, seed, 3)

    # The two broad colours laid over the light ground, each a third of the cloth; the black branches a tenth, over them.
    brown = field(161, 3, 6) > 0.12
    green = (field(162, 3, 6) > 0.1) & ~brown
    # The branches: the thin contours of a field, broken where a second is low.
    black = (np.abs(field(163, 4, 9)) < 0.06) & (field(164, 5, 10) > -0.05)
    tone = np.where(black, 0.25, np.where(brown, 0.6, np.where(green, 0.46, 0.9)))
    tone = blur(tone, 1)
    # The ripstop: plain weave too fine to draw at this scale; the reinforcing grid as low ridges.
    gx = np.abs(((x * metres / 0.006) % 1) - 0.5)
    gy = np.abs(((y * metres / 0.006) % 1) - 0.5)
    grid_ridge = np.clip(1 - np.minimum(0.5 - gx, 0.5 - gy) / 0.08, 0, 1)
    h = 0.00006 * grid_ridge + 0.00004 * periodic_noise(N, 160, 164) + 0.0004 * periodic_noise(N, 3, 165, 2)
    shade = tone * (1 - 0.03 * grid_ridge) + 0.015 * periodic_noise(N, 128, 166)
    rough = 0.8 + 0.04 * grid_ridge
    return {'height': h, 'shade': np.clip(shade, 0, 1), 'rough': rough, 'metres': metres}


def hexagon_lattice(x, y, columns, rows):
    """A flat-topped hexagon lattice periodic over the tile: `columns` (even) columns and `rows` rows of cells. Returns the
    position in its cell (dx, dy, in units of the hexagon's circumradius) and the distance to the cell's edge (same units)."""
    sx = x * columns * 1.5
    sy = y * rows * math.sqrt(3)
    best = np.full(x.shape, 1e9)
    bx = np.zeros(x.shape)
    by = np.zeros(x.shape)
    for dc in (-1, 0, 1, 2):
        c = np.floor(sx / 1.5) + dc
        for dr in (-1, 0, 1):
            r = np.floor(sy / math.sqrt(3)) + dr
            cx = c * 1.5
            cy = r * math.sqrt(3) + (c % 2) * math.sqrt(3) / 2
            d = (sx - cx) ** 2 + (sy - cy) ** 2
            better = d < best
            best = np.where(better, d, best)
            bx = np.where(better, sx - cx, bx)
            by = np.where(better, sy - cy, by)
    # Distance to the edge of a flat-topped hexagon of circumradius 1 (apothem sqrt(3)/2).
    a = math.sqrt(3) / 2
    ax, ay = np.abs(bx), np.abs(by)
    edge = np.minimum(a - ay, a - (ax * a + ay * 0.5))
    return bx, by, edge


def kikko():
    """
    Kikkō-hanabishi: hexagons of tortoiseshell linked over the cloth, a four-petalled flower in each, the courtly pattern
    (yūsoku mon'yō) of Heian robes and the brocade of a samurai's armour robe (MAK Vienna, kikkō tsunagi:
    https://sammlung.mak.at/en/collect/part-of-a-set-surface-pattern-waritsuke-monyo-割付文様-plant-pattern-shokubutsu-monyo-植物文様-kikko-tsunagi-亀甲繋-312433;
    Nelson-Atkins karaori with flowers in hexagons, hanabishi kikkō: https://art.nelson-atkins.org/objects/18701/fragment-from-no-robe-karaori-type-with-design-of-flowers;
    the Met's karaori, twill silk brocade with supplementary weft: https://www.metmuseum.org/art/collection/search/44883).
    Hexagons 17 mm across, 8 columns and 7 rows to the 100 mm tile (1% squeezed to close the tile); the figure (a double
    border and the flower) in weft floats, glossier and lighter than the twill ground's diagonal ribs.
    """
    metres = 0.1
    x, y = grid()
    bx, by, edge = hexagon_lattice(x, y, 8, 7)
    border = ((edge > 0.03) & (edge < 0.11)) | ((edge > 0.16) & (edge < 0.21))
    # The flower: four rhombic petals on the diagonals, a round heart.
    r = np.hypot(bx, by)
    th = np.arctan2(by, bx)
    petal_axis = np.abs(((th - math.pi / 4) % (math.pi / 2)) - math.pi / 4)
    petal = (r < 0.5) & (r > 0.08) & (petal_axis < 0.5 * (1 - r / 0.5) + 0.05)
    flower = petal | (r < 0.06)
    fig = blur((border | flower).astype(float), 1)
    # Twill ground ribs on the diagonal (silk, c. 0.25 mm pitch), weft floats across in the figure.
    ground = np.sin(2 * np.pi * (x + y) * metres / 0.0003) * 0.5 + 0.5
    floats = np.sin(2 * np.pi * y * metres / 0.00035) * 0.5 + 0.5
    h = 0.000015 * (ground * (1 - fig) + floats * fig) + 0.00009 * fig
    # The figure's wefts a lighter silk than the ground's (as the karaori's own coloured floats over their ground).
    shade = 0.76 + 0.2 * fig + 0.01 * periodic_noise(N, 32, 171)
    rough = 0.48 - 0.14 * fig
    return {'height': h, 'shade': shade, 'rough': rough, 'metres': metres}


def cloud_damask():
    """
    Chinese silk satin damask of auspicious clouds (xiangyun): ruyi-headed clouds, a three-lobed head curling in on itself
    and a trailing tail, scattered in staggered rows; the robes of officers and the elite (MFA Boston, Ming silk damask woven
    with auspicious clouds: https://collections.mfa.org/objects/9588; the Met, damask with cloud palmettes:
    https://www.metmuseum.org/art/collection/search/70996). Satin damask: the ground warp-faced, the figure weft-faced, both
    smooth, told apart by the sheen as the floats turn. Clouds c. 45 mm long, four to the 100 mm tile, half-dropped.
    """
    metres = 0.1
    x, y = grid()
    figure = np.zeros((N, N), bool)
    cut = np.zeros((N, N), bool)
    rng = np.random.default_rng(181)
    for cx, cy, flip in ((0.25, 0.22, 1), (0.75, 0.47, -1), (0.25, 0.72, -1), (0.75, 0.97, 1)):
        cx += rng.uniform(-0.03, 0.03)
        dx = ((x - cx + 0.5) % 1 - 0.5) * flip
        dy = (y - cy + 0.5) % 1 - 0.5
        # The ruyi head: a big lobe over two side lobes.
        for lx, ly, lr in ((0.0, 0.03, 0.075), (-0.075, -0.02, 0.055), (0.075, -0.02, 0.055)):
            d = np.hypot(dx - lx, dy - ly)
            figure |= d < lr
            # The curl in each lobe: a spiral groove of ground.
            th = np.arctan2(dy - ly, dx - lx)
            spiral = np.abs(((d / lr) * 2.0 - th / (2 * np.pi)) % 1 - 0.5) < 0.09
            cut |= (d < lr * 0.85) & (d > lr * 0.15) & spiral
        # The tail: a tapering band sweeping off to the side and down.
        t = np.clip((dx + 0.02) / 0.32, 0, 1)
        centre = -0.06 - 0.035 * np.sin(np.pi * t) + 0.05 * t * t
        width = 0.03 * (1 - t) + 0.004
        figure |= (dx > -0.02) & (dx < 0.3) & (np.abs(dy - centre) < width)
    fig = blur((figure & ~cut).astype(float), 1)
    ground = np.sin(2 * np.pi * x * metres / 0.0004) * 0.5 + 0.5
    floats = np.sin(2 * np.pi * y * metres / 0.0004) * 0.5 + 0.5
    h = 0.000015 * (ground * (1 - fig) + floats * fig) + 0.00006 * fig
    shade = 0.82 + 0.1 * fig
    rough = 0.4 - 0.12 * fig
    return {'height': h, 'shade': shade, 'rough': rough, 'metres': metres}


def tapestry():
    """
    Andean interlocked tapestry, the uncu's cloth: weft-faced, the camelid wefts packed down to hide the cotton warps, so the
    face is all weft in fine ribs over each warp. A Peabody tocapu band: cotton warp 11/cm, camelid wefts 30-60/cm
    (https://collections.peabody.harvard.edu/objects/details/90334); the Met: wefts turned at each colour and packed to cover
    the warp (https://www.metmuseum.org/art/collection/search/313152). Warps across the tunic as worn, as the Wari's and after
    them the Inca's were woven (https://www.clevelandart.org/art/126684): ribs running round the body, 4 warps to the
    3.6 mm tile (few to a tile, so the fine regular ribs fade out before they would shimmer), 16 weft passes across them,
    each weft's twist slanting it.
    """
    metres = 0.003636
    warps, wefts = 4, 16
    x, y = grid()
    # The warp ribs: horizontal on the body (along x), one per warp up the tile.
    v = (y * warps) % 1
    # Rounded (a raised cosine: no steep walls, whose normals would light differently from one mipmap level to the next).
    rib = 0.5 - 0.5 * np.cos(2 * np.pi * v)
    # Each weft pass a slanted bead over the rib (S-spun camelid).
    bead = 0.5 - 0.5 * np.cos(2 * np.pi * ((x * wefts + 0.25 * v) % 1))
    thick = 1 + 0.15 * line_noise(wefts, N, 191, 5)[(x * wefts).astype(int) % wefts, (y * N).astype(int) % N]
    hpitch = metres / warps
    # (The ribs kept low: packed weft rounds them over, and a rib this fine and this regular would shimmer far off.)
    h = hpitch * (0.12 * rib + 0.1 * bead * rib * thick) + fuzz(N, 192, 0.02) * hpitch
    shade = 0.84 + 0.08 * rib * bead + 0.03 * periodic_noise(N, 16, 193)
    return {'height': h, 'shade': np.clip(shade, 0, 1), 'rough': np.full((N, N), 0.88), 'metres': metres}


FAMILIES = {
    'plain': plain, 'twill': twill, 'denim': denim, 'quilt': quilt, 'diamondQuilt': diamond_quilt, 'felt': felt,
    'damask': damask, 'leather': leather, 'fur': fur, 'feathers': feathers, 'straw': straw, 'cordura': cordura,
    'ripstop': ripstop, 'knit': knit, 'jack': jack, 'camo': camo, 'kikko': kikko,
    'cloudDamask': cloud_damask, 'tapestry': tapestry,
}


def preview(name, out):
    from PIL import Image
    tile = FAMILIES[name]()
    h = tile['height']
    gy, gx = np.gradient(h, tile['metres'] / N)
    nrm = np.dstack([-gx, -gy, np.ones_like(h)])
    nrm /= np.linalg.norm(nrm, axis=2, keepdims=True)
    image = (np.clip(nrm * 0.5 + 0.5, 0, 1) * 255).astype(np.uint8)[::-1]
    Image.fromarray(image).save(f'{out}/{name}.preview.png')
    Image.fromarray((np.clip(tile['shade'], 0, 1) * 255).astype(np.uint8)[::-1]).save(f'{out}/{name}.shade.png')


if __name__ == '__main__':
    for family in sys.argv[2:] or FAMILIES:
        preview(family, sys.argv[1])
        print('preview', family, flush=True)
