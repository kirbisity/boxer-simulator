# The hard armour tiles that are not mail, lamellae or plain plate: each a periodic height field in metres (numpy) made into a
# displaced mesh in Blender, its colour, roughness, metalness and masks carried as the mesh's own attributes, and rendered as
# the other tiles are (tilebake.py: normal, albedo, orm with Cycles' occlusion, mask). The references each tile was measured
# from are cited beside it (and in src/detailmaps.js, where the tiles' sizes in metres are kept).
#
#   Blender -b --factory-startup --python tools/blender/hardtiles.py -- <out dir> [resolution scale] [family ...]
#
# Masks (tilebake `mask`): R the first (the fittings or cords: drawn in the kit's gilt or lacing colour by the game), G the second.

import math
import os
import sys

import bpy
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tilebake as tb  # noqa: E402

TAU = 2 * math.pi


def smooth(edge0, edge1, x):
    t = np.clip((x - edge0) / (edge1 - edge0), 0, 1)
    return t * t * (3 - 2 * t)


def waves(X, Y, W, H, rng, count, low, high, amp):
    """Periodic noise: `count` plane waves of whole numbers of cycles over the tile (low..high cycles), summed, about ±amp."""
    out = np.zeros_like(X)
    for _ in range(count):
        p = rng.integers(-high, high + 1)
        q = rng.integers(-high, high + 1)
        if max(abs(p), abs(q)) < low:
            continue
        out += np.sin(TAU * (p * X / W + q * Y / H) + rng.uniform(0, TAU))
    return out * amp / math.sqrt(max(count, 1))


def wrap(d, period):
    return (d + period / 2) % period - period / 2


def dome(X, Y, W, H, cx, cy, r, h):
    """A rivet's domed head at (cx, cy) on the torus: radius r, height h; and where it is (0..1)."""
    dx = wrap(X - cx, W)
    dy = wrap(Y - cy, H)
    q = (dx * dx + dy * dy) / (r * r)
    head = np.where(q < 1, h * np.sqrt(np.clip(1 - q, 0, 1)), 0.0)
    return head, smooth(1.05, 0.9, q)


class Tile:
    """A tile's fields over its grid: height z, albedo (RGB), roughness, metalness, mask1, mask2."""

    def __init__(self, W, H, n, seed):
        self.W, self.H = W, H
        self.nx = n
        self.ny = max(8, round(n * H / W))
        xs = np.linspace(0, W, self.nx + 1)
        ys = np.linspace(0, H, self.ny + 1)
        self.X, self.Y = np.meshgrid(xs, ys)
        self.rng = np.random.default_rng(seed)
        shape = self.X.shape
        self.z = np.zeros(shape)
        self.albedo = np.ones(shape + (3,)) * 0.85
        self.rough = np.full(shape, 0.35)
        self.metal = np.ones(shape)
        self.mask1 = np.zeros(shape)
        self.mask2 = np.zeros(shape)

    def noise(self, count, low, high, amp):
        return waves(self.X, self.Y, self.W, self.H, self.rng, count, low, high, amp)

    def grey(self, value):
        self.albedo = np.repeat(np.asarray(value, dtype=float)[..., None], 3, axis=-1) if np.ndim(value) else np.full(self.X.shape + (3,), value)


def segmentata(n):
    # Lorica segmentata, Corbridge type (Corbridge hoard, cuirasses A and B; Bishop, Lorica Segmentata vol. I, 2002, and
    # https://lorseg.mcbishop.co.uk/the-kalkriese-type): iron girth hoops some 50-55 mm deep, each lapping over the top of the
    # one below, held on internal leathers by domed copper-alloy rivets with rosette washers (about 7 mm heads) a hand's
    # breadth apart. Tile: 180 mm round, three 52 mm hoops up.
    W, H, hoop = 0.18, 0.156, 0.052
    t = Tile(W, H, n, 51)
    yl = t.Y % hoop
    s = yl / hoop
    t.z = 0.0013 * (1 - s) - 0.0006 * (1 - smooth(0, 0.0014, yl)) + t.noise(40, 2, 14, 0.00003)
    tone = 0.8 + t.noise(30, 1, 10, 0.035)
    for hi in range(3):
        for cx in (0.045, 0.135):
            washer, wmask = dome(t.X, t.Y, W, H, cx, hi * hoop + 0.62 * hoop, 0.0058, 0.00035)
            head, hmask = dome(t.X, t.Y, W, H, cx, hi * hoop + 0.62 * hoop, 0.0034, 0.0014)
            t.z = t.z + np.maximum(washer, head)
            t.mask1 = np.maximum(t.mask1, wmask)
    t.grey(np.where(t.mask1 > 0.5, 0.95, tone))
    t.rough = np.where(t.mask1 > 0.5, 0.3, 0.36 + t.noise(20, 1, 8, 0.05))
    return t


def scale(n):
    # Scale armour (lorica squamata, the Parthian and Sasanian cataphract's coat): copper-alloy and iron scales about 35 x 22
    # mm (Dura-Europos, Yale University Art Gallery horse trappers, 3rd c.; scales of 35 x 25 mm noted in
    # https://www.romanarmytalk.com/rat/showthread.php?tid=12652; Simon James, Excavations at Dura-Europos, Final Report VII,
    # 2004), a raised medial rib, the round foot hanging down and over the heads of the row below; each row half a scale
    # off the last. Tile: six scales across at 20 mm, two rows up at 24 mm (detailmaps.js `scale`).
    P, R, Wd, L = 0.02, 0.024, 0.022, 0.036
    W, H = 6 * P, 2 * R
    t = Tile(W, H, n, 52)
    best = np.full(t.X.shape, -1.0)
    tone = np.full(t.X.shape, 0.8)
    for row in range(-1, 4):
        top = (row + 1) * R + 0.006
        for col in range(-1, 8):
            cx = (col + 0.5 * (row % 2)) * P
            ddx = t.X - cx
            s = (top - t.Y) / L
            foot_c = top - L + Wd / 2
            inside_body = (np.abs(ddx) < Wd / 2) & (s >= 0) & (t.Y >= foot_c)
            q = np.hypot(ddx, t.Y - foot_c)
            inside = inside_body | ((q < Wd / 2) & (t.Y < foot_c))
            edge = np.where(t.Y < foot_c, Wd / 2 - q, np.minimum(Wd / 2 - np.abs(ddx), top - t.Y))
            z = 0.0005 + 0.0022 * np.clip(s, 0, 1) + 0.00045 * np.exp(-(ddx / 0.0028) ** 2) - 0.0005 * (1 - smooth(0, 0.0012, edge))
            take = inside & (z > best)
            best = np.where(take, z, best)
            tone = np.where(take, 0.74 + 0.1 * (((row % 2) * 6 + col % 6) * 0.618 % 1.0), tone)
    gap = best < 0
    t.z = np.where(gap, 0.0, best) + t.noise(30, 3, 20, 0.00004)
    t.grey(np.where(gap, 0.18, tone + t.noise(20, 2, 12, 0.04)))
    t.rough = np.where(gap, 0.85, 0.32 + t.noise(16, 2, 10, 0.05))
    return t


def mountain(n):
    # Mountain-pattern armour (shanwen jia), as Song and Ming statues and paintings show it and its modern reconstructions
    # (https://lbas.lboro.ac.uk/pattern/mountain-pattern-armour.html; https://dragonsarmory.blogspot.com/2017/07/heavy-song-dynasty-armor.html;
    # Ming guardian figures at the Ming tombs): small iron plates each shaped as a three-armed star (the 山 / Y), the arms
    # of each plate locking between its neighbours' so the plates close up without lacing on the face, each arm with a raised
    # rib, its arm's end in the fork between two arms of the next plate: the plates on a triangular lattice along their arms.
    # Lattice step 24 mm (plates ~30 mm across): tile 83 x 72 mm.
    d = 0.024
    W, H = 2 * math.sqrt(3) * d, 3 * d
    t = Tile(W, H, n, 53)
    a1 = np.array([0.0, d])
    a2 = np.array([math.sqrt(3) * d / 2, d / 2])
    reach = 0.56 * d
    arms = [reach * np.array([math.cos(a), math.sin(a)]) for a in (math.pi / 2, math.pi * 7 / 6, math.pi * 11 / 6)]
    pts = np.stack([t.X.ravel(), t.Y.ravel()], axis=1)
    d1 = np.full(len(pts), 1e9)
    d2 = np.full(len(pts), 1e9)
    owner = np.zeros(len(pts))
    k = 0
    for m in range(-8, 8):
        for nn in range(-2, 7):
            c = m * a1 + nn * a2
            if not (-d < c[0] < W + d and -d < c[1] < H + d):
                continue
            # (Each plate known by its place on the torus, so its tone and tilt repeat with the tile.)
            k = round((c[0] % W) / (math.sqrt(3) * d / 2)) * 13 + round((c[1] % H) / (d / 2)) * 7 + 1
            dist = np.full(len(pts), 1e9)
            for arm in arms:
                rel = pts - c
                tt = np.clip((rel @ arm) / (arm @ arm), 0, 1)
                dist = np.minimum(dist, np.linalg.norm(rel - tt[:, None] * arm[None, :], axis=1))
            closer = dist < d1
            d2 = np.where(closer, d1, np.minimum(d2, dist))
            owner = np.where(closer, k, owner)
            d1 = np.where(closer, dist, d1)
    shape = t.X.shape
    b = ((d2 - d1) / 2).reshape(shape)
    d1 = d1.reshape(shape)
    owner = owner.reshape(shape)
    t.z = 0.0013 * smooth(0.00012, 0.0016, b) + 0.0006 * np.clip(1 - d1 / 0.0035, 0, 1) ** 1.5 + 0.0003 * np.sin(owner * 2.7) * smooth(0, 0.002, b) + t.noise(30, 3, 20, 0.00004)
    gap = b < 0.00018
    tone = 0.76 + 0.07 * np.sin(owner * 1.9) + t.noise(20, 2, 12, 0.03)
    t.grey(np.where(gap, 0.2, tone))
    t.rough = np.where(gap, 0.8, 0.34 + 0.04 * np.cos(owner * 1.3))
    return t


def brigandine(n):
    # Brigandine (Ming bumian jia, and the European foot soldier's): cloth over small overlapping iron plates, the plates riveted
    # to the cloth from inside, so the face shows rows of domed copper-alloy rivet heads, each plate's foot standing a little
    # out through the cloth (https://greatmingmilitary.blogspot.com/2024/09/brigandine-armours-of-ming-dynasty.html: iron plates
    # fixed to the cloth with copper rivets, two to three to a plate; the Hangzhou Arts and Crafts Museum brigandine,
    # doi:10.1080/17416124.2024.2316985; the Met's dingjia 36.25.1a-c, https://www.metmuseum.org/art/collection/search/24010).
    # Plates 48 x 24 mm in rows half a plate off the last, two 9 mm heads to a plate: rivets on a 24 mm staggered grid.
    W = H = 0.096
    pw, ph = 0.048, 0.024
    t = Tile(W, H, n, 54)
    row = np.floor(t.Y / ph)
    yl = t.Y - row * ph
    xs = (t.X + (row % 2) * pw / 2) % pw
    steps = 0.0008 * (1 - smooth(0, ph, yl)) - 0.0005 * (1 - smooth(0, 0.002, yl))
    seam = -0.00025 * np.exp(-((np.minimum(xs, pw - xs)) / 0.0012) ** 2)
    weave = 0.00007 * np.sin(TAU * t.X / 0.0008) * np.sin(TAU * t.Y / 0.0008) + 0.00004 * np.sin(TAU * (t.X + t.Y) / 0.0024)
    t.z = steps + seam + weave + t.noise(20, 1, 8, 0.0002)
    heads = np.zeros_like(t.z)
    for r in range(4):
        for c in range(2):
            for sx in (0.012, 0.036):
                cx = c * pw + sx - (r % 2) * pw / 2
                cy = r * ph + 0.015
                head, mask = dome(t.X, t.Y, W, H, cx, cy, 0.0045, 0.0022)
                ring, _ = dome(t.X, t.Y, W, H, cx, cy, 0.0068, 0.0003)
                heads = np.maximum(heads, head)
                t.z = t.z - 0.6 * ring * (1 - mask)
                t.mask1 = np.maximum(t.mask1, mask)
    t.z = np.maximum(t.z, heads + 0.0002 * (t.mask1 > 0.5))
    cloth = 0.84 - 0.08 * (0.5 + 0.5 * np.sin(TAU * t.X / 0.0008) * np.sin(TAU * t.Y / 0.0008)) + t.noise(16, 1, 6, 0.03)
    t.grey(np.where(t.mask1 > 0.5, 0.95, cloth))
    t.rough = np.where(t.mask1 > 0.5, 0.33, 0.9)
    t.metal = np.where(t.mask1 > 0.5, 1.0, 0.0)
    return t


def harness_edge(n):
    # The edges of a plate harness (the Met's Gothic and Milanese armours, e.g. 29.150.3 and the Helmschmid backplate
    # https://www.metmuseum.org/art/collection/search/22875 with its roped turned neck edge; Royal Armouries II.3; the Wallace
    # Collection A21): the plate's edge turned out over a wire into a roll some 6-7 mm deep, roped (filed in diagonal
    # twists ~5 mm apart), a file line sunk beside it, and inside it the rivets that hold the lining and the leathers, about
    # every 50 mm (brass-capped). A strip, not a field: u along the edge (50 mm a tile), v from the edge (0) inward 25 mm.
    W, H = 0.05, 0.025
    t = Tile(W, H, n, 55)
    roll_r = 0.0034
    yc = 0.0036
    q = np.clip(1 - ((t.Y - yc) / roll_r) ** 2, 0, 1)
    bead = np.where(t.Y < yc + roll_r, 0.0007 + 0.0024 * np.sqrt(q), 0.0)
    twist = 0.5 + 0.5 * np.cos(TAU * (t.X + (t.Y - yc) * 1.0) / 0.005)
    bead = bead - np.where(bead > 0.0009, 0.0007 * twist ** 3, 0.0)
    plate = 0.0009 + t.noise(30, 2, 12, 0.00004)
    line = -0.00035 * np.exp(-((t.Y - 0.0105) / 0.0006) ** 2)
    t.z = np.maximum(bead, plate) + np.where(t.Y > 0.008, line, 0.0)
    head, mask = dome(t.X, t.Y, W, H, 0.025, 0.0175, 0.0034, 0.0017)
    t.z = t.z + head
    t.mask1 = mask
    t.grey(np.where(mask > 0.5, 0.95, np.where(bead > 0.0009, 0.88 - 0.25 * twist ** 3, 0.9)))
    t.rough = np.where(mask > 0.5, 0.3, 0.24 + 0.1 * (bead > 0.0009) * twist ** 3)
    return t


def krug(n):
    # Ottoman mail and plate (the Met's Shirt of Mail and Plate, Turkish, late 15th-16th c., 04.3.456,
    # https://www.metmuseum.org/art/collection/search/24193): rows of small rectangular steel plates, slightly domed, set in
    # the mail and joined to one another by its rings. Plates 30 x 55 mm with ~6 mm of mail between; rings ~6 mm.
    pw, ph, gap = 0.030, 0.055, 0.006
    W, H = 2 * (pw + gap), ph + 0.008
    t = Tile(W, H, n, 56)
    xs = t.X % (pw + gap) - gap / 2
    ys = t.Y - 0.004
    inside = (xs > 0) & (xs < pw) & (ys > 0) & (ys < ph)
    edge = np.minimum(np.minimum(xs, pw - xs), np.minimum(ys, ph - ys))
    plate = 0.0016 + 0.0006 * (1 - ((2 * xs / pw) - 1) ** 2) - 0.0008 * (1 - smooth(0, 0.0014, edge))
    # The rings: a staggered grid of tori seen from above.
    ring = np.zeros_like(t.z)
    sx, sy = 0.0045, 0.0034
    for k in range(2):
        gx = (t.X + k * sx / 2) % sx - sx / 2
        gy = (t.Y + k * sy) % (2 * sy) - sy
        dist = np.hypot(gx, gy)
        ring = np.maximum(ring, 0.0008 * np.exp(-((dist - 0.0021) / 0.0006) ** 2))
    t.z = np.where(inside, plate, ring) + t.noise(24, 2, 12, 0.00003)
    t.grey(np.where(inside, 0.84 + t.noise(16, 1, 6, 0.04), 0.35 + 0.5 * ring / 0.0008))
    t.rough = np.where(inside, 0.3, 0.45)
    return t


def iyozane(n):
    # Tosei gusoku's riveted cuirass (byo-toji yokohagi okegawa-do: MFAH 2010.1126,
    # https://emuseum.mfah.org/objects/139649; the Koelliker collection, Fortuny museum): horizontal iron lames about 45 mm
    # deep, each riveted over the next with domed rivet heads (byo) about every 30 mm along its foot, lacquered over (a
    # smooth, faintly orange-peeled skin). Tile 120 mm round, two lames up.
    W, H, lame = 0.12, 0.09, 0.045
    t = Tile(W, H, n, 57)
    yl = t.Y % lame
    s = yl / lame
    t.z = 0.0011 * (1 - s) - 0.0005 * (1 - smooth(0, 0.0012, yl)) + t.noise(60, 10, 40, 0.000012) + t.noise(10, 1, 4, 0.00008)
    for li in range(2):
        for k in range(4):
            head, mask = dome(t.X, t.Y, W, H, 0.015 + k * 0.03, li * lame + 0.008, 0.003, 0.0013)
            t.z = t.z + head
            t.mask1 = np.maximum(t.mask1, mask)
    t.grey(np.where(t.mask1 > 0.5, 0.9, 0.9 + t.noise(10, 1, 6, 0.02)))
    t.rough = np.where(t.mask1 > 0.5, 0.35, 0.26)
    t.metal = np.where(t.mask1 > 0.5, 1.0, 0.0)
    return t


def sugake(n):
    # Sugake odoshi (sparse lacing) over solid lames (itazane) cut along the top to look like kozane (kiritsuke kozane),
    # as late Sengoku and Edo tosei gusoku and ashigaru okashi gusoku are laced (Bonhams 17816 lot 61, okegawa-do laced in
    # dark blue sugake odoshi, https://www.bonhams.com/auction/17816/lot/61/an-okegawa-do-tosei-gusoku-armour-late-edo-period-19th-century):
    # pairs of flat braids ~7 mm wide run down each lame, a pair every ~50 mm, from the holes under its top to behind the next
    # row's head. Laced tile (detailmaps.js `sugake`): two pairs across at 50 mm, two rows up at 50 mm.
    P, R = 0.05, 0.05
    W, H = 2 * P, 2 * R
    t = Tile(W, H, n, 58)
    yl = t.Y % R
    s = yl / R
    notch = 0.012
    top_cut = R - 0.0025 * np.abs(np.sin(math.pi * t.X / notch))
    lame = (yl < top_cut)
    groove = -0.0002 * np.exp(-((wrap(t.X, notch)) / 0.0005) ** 2) * smooth(R * 0.6, R * 0.9, yl)
    t.z = np.where(lame, 0.0004 + 0.0012 * s + groove - 0.0004 * (1 - smooth(0, 0.001, top_cut - yl)), 0.0) + t.noise(40, 6, 30, 0.00001)
    cords = np.zeros_like(t.z)
    for c in range(2):
        for side in (-1, 1):
            cx = c * P + P / 2 + side * 0.0048
            dx = wrap(t.X - cx, W)
            q = np.clip(1 - (dx / 0.0034) ** 2, 0, 1)
            run = (yl > 0.002) & (yl < R - 0.006)
            braid = 0.5 + 0.5 * np.sin(TAU * (t.Y + side * dx * 1.6) / 0.0024)
            h = np.where(run, 0.0016 + 0.0011 * np.sqrt(q) * (0.85 + 0.15 * braid), 0.0) * (q > 0)
            cords = np.maximum(cords, h)
    holes = np.zeros_like(t.z, dtype=bool)
    for c in range(2):
        for side in (-1, 1):
            cx = c * P + P / 2 + side * 0.0048
            holes |= (np.hypot(wrap(t.X - cx, W), (yl - (R - 0.007))) < 0.0022)
    t.mask1 = (cords > 0).astype(float)
    t.z = np.where(cords > 0, np.maximum(t.z, cords + 0.0012 * s), np.where(holes, t.z - 0.0006, t.z))
    t.grey(np.where(cords > 0, 0.82, np.where(lame, np.where(holes, 0.1, 0.9), 0.12)))
    t.rough = np.where(cords > 0, 0.85, 0.28)
    t.metal = np.zeros_like(t.z)
    return t


def etched(n):
    # Etched bands on munition and better Spanish-market armour of the later 16th century (Milanese and Brescian morions and
    # breastplates: the Met's pointed morion 14.25.629, https://www.metmuseum.org/art/collection/search/26437; the Royal
    # Collection's Spanish morions, ten narrow bands radiating from the apex, trophies on a stippled and blackened ground,
    # https://col.rct.uk/collection/67373/spanish-morion; Fitzwilliam 'Spanish' morions with bands of foliage): a band ~30 mm
    # wide of scrolling foliage left bright on a sunk, blackened ground between two border lines, the rest planished bright.
    W = H = 0.12
    t = Tile(W, H, n, 59)
    cx = 0.06
    dx = t.X - cx
    band = np.abs(dx) < 0.015
    vine_x = 0.0075 * np.sin(TAU * t.Y / 0.04)
    vine = np.abs(dx - vine_x) < 0.0011
    leaves = np.zeros_like(t.z, dtype=bool)
    for k in range(6):
        ly = k * 0.02 + 0.005
        side = 1 if k % 2 else -1
        lx = 0.0075 * math.sin(TAU * ly / 0.04) + side * 0.006
        ddx = dx - lx
        ddy = wrap(t.Y - ly, H)
        ang = side * 0.6
        u = ddx * math.cos(ang) + ddy * math.sin(ang)
        v = -ddx * math.sin(ang) + ddy * math.cos(ang)
        leaves |= (u / 0.0052) ** 2 + (v / 0.0022) ** 2 < 1
        leaves |= np.hypot(ddx + side * 0.004, ddy - 0.006) < 0.0014
    borders = (np.abs(np.abs(dx) - 0.0135) < 0.0007)
    bright = vine | leaves | borders
    ground = band & ~bright
    stipple = t.noise(60, 30, 80, 0.00002)
    t.z = 0.0003 + t.noise(30, 2, 12, 0.00005) - np.where(ground, 0.00015 - stipple, 0.0)
    t.grey(np.where(ground, 0.16, 0.92 + t.noise(16, 1, 6, 0.03)))
    t.rough = np.where(ground, 0.65, 0.22)
    t.metal = np.where(ground, 0.6, 1.0)
    return t


def polymer(n):
    # Moulded and coated shells: riot armour's polycarbonate and ABS plates, a ballistic helmet's painted aramid/UHMWPE shell
    # (the coated matte finish of an ACH/ECH or FAST-type shell, and riot suit hard parts as e.g. NIJ 0115/HOSDB-rated kits are
    # made): a fine orange-peel stipple ~0.6 mm, a slower moulding ripple, matte. Tile 100 mm.
    W = H = 0.1
    t = Tile(W, H, n, 60)
    t.z = t.noise(160, 60, 180, 0.000025) + t.noise(40, 8, 30, 0.00002) + t.noise(8, 1, 3, 0.00006)
    t.grey(0.86 + t.noise(20, 2, 10, 0.012))
    t.rough = 0.62 + t.noise(30, 20, 60, 0.05)
    t.metal = np.zeros_like(t.z)
    return t


def panels(n):
    # A machine's shells (Unitree G1 and H1, Boston Dynamics Atlas, Sarcos Guardian XO publicity photographs:
    # https://www.unitree.com/g1, https://www.sarcos.com/products/guardian-xo/): pressed and machined aluminium panels with
    # ~1 mm seams, countersunk hex-socket screws ~4 mm at their corners, anodised or painted over a fine brushed grain, a
    # louvred vent here and there. Tile 160 mm.
    W = H = 0.16
    t = Tile(W, H, n, 61)
    grain = sum(np.sin(TAU * (t.rng.integers(0, 3) * t.X / W + t.rng.integers(40, 220) * t.Y / H) + t.rng.uniform(0, TAU)) for _ in range(40)) * 0.000004
    z = 0.0008 + grain
    seams = np.zeros_like(z)

    def seam_line(d):
        return np.exp(-(d / 0.00045) ** 2)

    seams = np.maximum(seams, seam_line(wrap(t.Y, 0.08)))
    upper = (t.Y % 0.16) >= 0.08
    xs = np.where(upper, wrap(t.X - 0.05, 0.16), wrap(t.X, 0.16))
    seams = np.maximum(seams, seam_line(xs))
    seams = np.maximum(seams, np.where(upper, seam_line(wrap(t.X - 0.13, 0.16)), seam_line(wrap(t.X - 0.09, 0.16))))
    z = z - 0.0006 * seams
    for (cx, cy) in [(0.008, 0.008), (0.082, 0.008), (0.098, 0.008), (0.152, 0.008), (0.058, 0.088), (0.122, 0.088), (0.138, 0.088), (0.042, 0.072), (0.152, 0.152), (0.008, 0.072)]:
        dx = wrap(t.X - cx, W)
        dy = wrap(t.Y - cy, H)
        rr = np.hypot(dx, dy)
        head = rr < 0.0022
        ang = np.arctan2(dy, dx)
        hexr = 0.0009 / np.cos(((ang + math.pi / 6) % (math.pi / 3)) - math.pi / 6)
        socket = rr < hexr
        z = np.where(head, 0.0008 - 0.00015 * (rr / 0.0022) ** 2, z) - np.where(socket, 0.0006, 0.0)
        z = z - 0.0002 * np.exp(-((rr - 0.0023) / 0.0002) ** 2)
        t.mask2 = np.maximum(t.mask2, head.astype(float))
    vent_x = (t.X > 0.02) & (t.X < 0.06)
    for k in range(4):
        slot = vent_x & (np.abs(t.Y - (0.025 + k * 0.007)) < 0.0012)
        z = np.where(slot, z - 0.0009, z)
        seams = np.maximum(seams, slot.astype(float))
    t.z = z
    t.grey(np.where(seams > 0.5, 0.35, np.where(t.mask2 > 0.5, 0.72, 0.9)))
    t.rough = np.where(seams > 0.5, 0.6, np.where(t.mask2 > 0.5, 0.3, 0.4))
    return t


FAMILIES = {
    'segmentata': segmentata, 'scale': scale, 'mountain': mountain, 'brigandine': brigandine, 'harnessEdge': harness_edge,
    'krug': krug, 'iyozane': iyozane, 'sugake': sugake, 'etched': etched, 'polymer': polymer, 'panels': panels,
}


def build_mesh(name, t):
    ny, nx = t.X.shape
    verts = np.stack([t.X, t.Y, t.z], axis=-1).reshape(-1, 3).astype(np.float32)
    i = np.arange(nx - 1)
    j = np.arange(ny - 1)
    I, J = np.meshgrid(i, j)
    k = (J * nx + I).ravel()
    faces = np.stack([k, k + 1, k + nx + 1, k + nx], axis=1).astype(np.int32)
    mesh = bpy.data.meshes.new(name)
    mesh.vertices.add(len(verts))
    mesh.vertices.foreach_set('co', verts.ravel())
    mesh.loops.add(faces.size)
    mesh.loops.foreach_set('vertex_index', faces.ravel())
    mesh.polygons.add(len(faces))
    mesh.polygons.foreach_set('loop_start', np.arange(0, faces.size, 4, dtype=np.int32))
    mesh.update(calc_edges=True)
    mesh.shade_smooth()

    def attribute(key, rgb):
        attr = mesh.color_attributes.new(key, 'FLOAT_COLOR', 'POINT')
        rgba = np.concatenate([rgb.reshape(-1, 3), np.ones((rgb.size // 3, 1))], axis=1).astype(np.float32)
        attr.data.foreach_set('color', rgba.ravel())

    attribute('albedo', np.clip(t.albedo, 0, 1))
    attribute('orm', np.stack([np.zeros_like(t.rough), np.clip(t.rough, 0, 1), np.clip(t.metal, 0, 1)], axis=-1))
    attribute('masks', np.stack([np.clip(t.mask1, 0, 1), np.clip(t.mask2, 0, 1), np.zeros_like(t.mask1)], axis=-1))
    return mesh


def from_attributes(nodes, links, geometry):
    def attr(name):
        node = nodes.new('ShaderNodeAttribute')
        node.attribute_type = 'GEOMETRY'
        node.attribute_name = name
        return node
    albedo = attr('albedo')
    orm = attr('orm')
    masks = attr('masks')
    so = nodes.new('ShaderNodeSeparateXYZ')
    links.new(orm.outputs['Vector'], so.inputs[0])
    sm = nodes.new('ShaderNodeSeparateXYZ')
    links.new(masks.outputs['Vector'], sm.inputs[0])
    return albedo.outputs['Color'], so.outputs['Y'], so.outputs['Z'], sm.outputs['X'], None, sm.outputs['Y']


def bake(name, out, scale_factor):
    tb.reset()
    size = int(1024 * scale_factor)
    t = FAMILIES[name](size)
    group = tb.out_group(ao_distance=0.004, h_lo=float(t.z.min()), h_hi=float(t.z.max()) + 1e-6)
    tile = tb.new_collection()
    mesh = build_mesh(name, t)
    mesh.materials.append(tb.material(name, group, from_attributes))
    obj = bpy.data.objects.new(name, mesh)
    tb.link(obj, tile)
    tb.repeat_around(tile, t.W, t.H)
    px_x = size if t.W >= t.H else round(size * t.W / t.H)
    px_y = size if t.H >= t.W else round(size * t.H / t.W)
    tb.camera(t.W, t.H, px_x, px_y)
    tb.render_maps(group, out, name, samples={'normal': 16, 'albedo': 4, 'orm': 48, 'height': 2, 'mask': 4})


OUT, SCALE = tb.args()
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
NAMES = ARGS[2:] or list(FAMILIES)
for family in NAMES:
    bake(family, OUT, SCALE)
