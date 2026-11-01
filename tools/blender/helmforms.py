# The remodelled arena helmets' relief (src/helmforms.js): for each kind, the height field, colour, roughness and metalness
# over its sheet, every feature placed on the part's real surface (tools/helmforms-dump.mjs samples it: the points in head
# radii and the distances along the surface), so a rivet is round and a grille hole where the eye is whatever the
# region's stretch. helmbake.py then bakes the normal map and occlusion; packhelm.py packs them into src/helmmaps-data.js.
# Plain Python 3 (numpy, scipy, Pillow); the shapes and motifs are helmsheets.py's.
#
#   node tools/helmforms-dump.mjs > <dir>/forms.json
#   python3 tools/blender/helmforms.py <dir> [kinds...]
#
# What is on each, from the surviving helmets (references in src/helmmaps.js):
#   murmillo   (Pompeii MANN 5672-5674, BM 1946,0514.1) a riveted band where the bowl meets the brim, Hercules' head
#              embossed on the bowl's front, a rolled brim edge, the crest's sides embossed in a framed frieze (Victory,
#              trophy), the visor's two halves each with a broad grille of small round holes in a beaded frame.
#   thraex     (Pompeii MANN 5649, the Gorgon helmet; Louvre Br 1108) a Gorgon on the bowl's front, the feather holders'
#              riveted plates, a palm on the side, the crest's beaded edges, the griffin's feathered neck, eye and beak, a
#              round grille of linked holes over each eye.
#   hoplomachus the same brimmed helmet, plain: the band, the feather holders, the plume ridge's rivets, round grilles.
#   secutor    (Pompeii MANN 5642) a smooth shell: the visor plate a step proud in a rolled edge, two small round eyeholes
#              (about 3 cm) in rims, the hinge bosses at the temples, the crest's foot riveted, the neck guard rolled.
#   scissor    a closed shell: the face plate in a rolled edge, a nose ridge, two round eye openings with grilles, a block
#              of breathing holes below, rivets round the plate.

import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from helmsheets import (  # noqa: E402
    HOLE, Atlas, add_rivets, bead, cap, dolphin, draw_mask, emboss, gorgon, hammered, hercules, laurel, palm, smooth,
    stamp, trophy, victory,
)

N = 1024


def grid_surface(grid):
    """A region's to_surface over a dumped grid: (x, y) in 0..1 -> X, Y, Z (head radii), SU, SV (along the surface), and
    SU_END, SV_END (the part's full length at that place, so a distance to the far edges is SU_END - SU)."""
    arrays = {key: np.asarray(grid[key], np.float32) for key in ('x', 'y', 'z', 'su', 'sv')}
    n = arrays['x'].shape[0] - 1

    def to(x, y):
        rows, cols = y * n, x * n
        out = {}
        for key, name in (('x', 'X'), ('y', 'Y'), ('z', 'Z'), ('su', 'SU'), ('sv', 'SV')):
            out[name] = ndimage.map_coordinates(arrays[key], [rows, cols], order=1, mode='nearest')
        out['SU_END'] = ndimage.map_coordinates(arrays['su'], [rows, np.full_like(cols, n)], order=1, mode='nearest')
        out['SV_END'] = ndimage.map_coordinates(arrays['sv'], [np.full_like(rows, n), cols], order=1, mode='nearest')
        out['u'], out['v'] = x, y
        return out
    return to, float(arrays['su'].max())


def region(atlas, kind, name, rect=None):
    part = kind['parts'][name]
    to, width = grid_surface(part['grid'])
    return atlas.region(rect or kind['regions'][part['region']], to, max(width, 0.2))


def nearest(s, mask, *targets):
    """The surface coordinates (SU, SV) of the pixel nearest to targets [(key, value), ...] where `mask` holds."""
    d = np.zeros(s['X'].shape, np.float32)
    for key, value in targets:
        d += (s[key] - value) ** 2
    d = np.where(mask, d, np.inf)
    index = np.unravel_index(np.argmin(d), d.shape)
    return float(s['SU'][index]), float(s['SV'][index])


def rolled(reg, d, width=0.06, height=0.04):
    """A rolled edge: a bead `width` wide along the line where `d` (distance from the edge) is 0."""
    reg.add(cap(d, width) * height)


def hex_holes(reg, X, Y, inside, pitch, hole, depth=0.02):
    """Holes in a hexagonal net (rows `pitch` apart) over the field `inside` (0..1), each in a raised ring: the grilles."""
    hx = X / pitch
    hy = Y / (pitch * 0.866)
    row = np.round(hy)
    col = np.round(hx - 0.5 * (np.mod(row, 2)))
    cx = (col + 0.5 * np.mod(row, 2)) * pitch
    cy = row * pitch * 0.866
    d = np.hypot(X - cx, Y - cy)
    holes = smooth((hole - d) / (hole * 0.25)) * inside
    rings = bead(np.abs(d - hole * 1.2), hole * 0.35) * inside
    reg.add(rings * 0.008 - holes * depth)
    reg.paint(holes, rgb=HOLE, rough=1.0, metal=0.0)


# ---- The brimmed helmets -----------------------------------------------------------------------------------------------

def brimmed(kind, style):
    atlas = Atlas(kind['sheet'], n=N)
    # The bowl: hammered, a band of two beads at its foot with rivets between, the crest's foot strap over the crown.
    bowl = region(atlas, kind, 'bowl')
    s = bowl.s
    hammered(bowl, 0.004, 0.05, seed=2)
    bowl.add(bead(np.abs(s['SV'] - 0.05), 0.035) * 0.03 + bead(np.abs(s['SV'] - 0.2), 0.022) * 0.02)
    end = float(s['SU_END'].max())
    add_rivets(bowl, s['SU'], s['SV'], [(su, 0.125) for su in np.arange(0.0, end, 0.34)], 0.042, 0.03)
    strap = smooth((0.15 - np.abs(s['Z'])) / 0.03) * smooth((s['Y'] - 1.0) / 0.12)
    bowl.add(strap * 0.016)
    # Feather holders' plates, riveted (thraex, hoplomachus).
    if kind['feathers']:
        fx, fy, _ = kind['feathers']['at']
        side = (s['Z'] > 0.4)
        plate = smooth((0.03 - np.maximum(np.abs(s['X'] - fx) - 0.1, np.abs(s['Y'] - fy) - 0.16)) / 0.02) * side
        bowl.add(plate * 0.014)
        add_rivets(bowl, s['X'], s['Y'], [(fx + dx, fy + dy) for dx in (-0.08, 0.08) for dy in (-0.13, 0.13)], 0.03, 0.022)
    front = s['X'] > 0
    if style == 'murmillo':
        # Hercules' head over the brow, below the crest (BM 1946,0514.1; MANN 5672's herm of Hercules).
        emboss(bowl, s['SU'], s['Y'], hercules, (-0.42, 0.34, 0.42, 1.12), 0.07, 0.012)
        emboss(bowl, s['SU'], s['SV'], lambda d, w, h: laurel(d, w, h, 30), (0, 0.27, end, 0.4), 0.018, 0.006, px=1400)
    elif style == 'thraex':
        # The Gorgon over the brow, a palm on each side (MANN 5649; the Gorgon helmet).
        emboss(bowl, s['SU'], s['Y'], gorgon, (-0.42, 0.36, 0.42, 1.12), 0.07, 0.012)
        su_side, _ = nearest(s, s["Z"] > 0, ('X', -0.35), ('Y', 0.55), ('Z', 0.85))
        emboss(bowl, s['SU'], s['Y'], palm, (su_side - 0.22, 0.02, su_side + 0.22, 1.0), 0.035, 0.008)
    # The brim: a heavy rolled lip, two raised rings, rivets along its join with the bowl.
    brim = region(atlas, kind, 'brim')
    s = brim.s
    hammered(brim, 0.003, 0.05, seed=3)
    rolled(brim, s['SV_END'] - s['SV'], 0.1, 0.05)
    brim.add(bead(np.abs(s['SV'] / np.maximum(s['SV_END'], 1e-3) - 0.4), 0.06) * 0.012)
    add_rivets(brim, s['SU'], s['SV'], [(su, 0.06) for su in np.arange(0.0, float(s['SU_END'].max()), 0.34)], 0.036, 0.024)
    if style == 'thraex':
        emboss(brim, s['SU'], s['SV'], lambda d, w, h: dolphin(d, w, h), (2.2, 0.18, 2.9, 0.42), 0.03, 0.008)
    # The visor: the seam down the middle, a rolled edge all round, the hinge plates, the grilles.
    visor = region(atlas, kind, 'visor')
    s = visor.s
    hammered(visor, 0.003, 0.05, seed=4)
    visor.add(bead(s['SU'], 0.04) * 0.03)
    edge = np.minimum(np.minimum(s['SV'], s['SV_END'] - s['SV']), s['SU_END'] - s['SU'])
    rolled(visor, edge, 0.06, 0.04)
    grille = kind['grille']
    if grille['shape'] == 'disc':
        cu, cv = nearest(s, s['X'] > 0, ('Y', grille['y']), ('Z', grille['z']))
        d = np.hypot(s['SU'] - cu, s['SV'] - cv)
        rad = grille['r']
        visor.add(smooth((rad - d) / 0.02) * 0.012 + bead(np.abs(d - rad), 0.035) * 0.035)
        hex_holes(visor, s['SU'] - cu, s['SV'] - cv, smooth((rad - 0.04 - d) / 0.01), grille['pitch'], grille['hole'])
    else:
        z0, y0, z1, y1 = grille['box']
        corner = grille['round']
        dz = np.maximum(np.maximum(z0 + corner - s['Z'], s['Z'] - (z1 - corner)), 0)
        dy = np.maximum(np.maximum(y0 + corner - s['Y'], s['Y'] - (y1 - corner)), 0)
        out = np.hypot(dz, dy) - corner
        frame = s['X'] > -0.2
        visor.add((smooth(-out / 0.02) * 0.012 + bead(np.abs(out), 0.03) * 0.035) * frame)
        hex_holes(visor, s['SU'], s['SV'], smooth((-out - 0.035) / 0.01) * frame, grille['pitch'], grille['hole'])
    hinge = s['SU_END'] - s['SU']
    for hy in (0.0, -0.9):
        cu, cv = nearest(s, s['SU_END'] - s['SU'] < 0.15, ('Y', hy))
        plate = smooth((0.02 - np.maximum(np.abs(hinge - 0.1) - 0.07, np.abs(s['SV'] - cv) - 0.12)) / 0.015)
        visor.add(plate * 0.012)
        add_rivets(visor, hinge, s['SV'], [(0.1, cv - 0.07), (0.1, cv + 0.07)], 0.032, 0.022)
    # The crest seen from its side (u ~ 0.5): beaded top edges; the murmillo's framed frieze, the thraex's feathered mane.
    crest = region(atlas, kind, 'crest')
    s = crest.s
    hammered(crest, 0.003, 0.05, seed=5)
    top_edge = np.abs(s['u'] - 0.22)
    crest.add(bead(top_edge, 0.05) * 0.018)
    if style == 'murmillo':
        X, Y = s['X'], s['Y']
        panel = (s['u'] > 0.3) & (s['u'] < 0.75)
        frieze = smooth((s['u'] - 0.32) / 0.02) * smooth((0.68 - s['u']) / 0.02) * smooth((s['v'] - 0.18) / 0.02) * smooth((0.86 - s['v']) / 0.02)
        crest.add(bead(np.abs(frieze - 0.5), 0.12) * 0.012 * panel)
        relief = np.zeros(X.shape, np.float32)
        for motif, rect in ((victory, (-0.95, 1.45, -0.15, 2.25)), (trophy, (0.0, 1.5, 0.75, 2.3))):
            relief += stamp(X, Y, draw_mask(400, 400, motif), *rect)
        crest.add(crest.blur(relief, 0.01) * frieze * 0.045)
    elif style == 'thraex':
        row = np.floor(s['SV'] / 0.09)
        scale = np.hypot(np.mod(s['SV'], 0.09) - 0.06, np.mod(s['SU'] + 0.045 * row, 0.09) - 0.045)
        crest.add(cap(scale, 0.07) * 0.012 * smooth((0.5 - s['u']) / 0.1))
    else:
        add_rivets(crest, s['SV'], s['u'], [(sv, 0.5) for sv in np.arange(0.3, float(s['SV_END'].max()), 0.4)], 0.04, 0.02)
    # The griffin's head and neck (thraex): feathers down the neck, a ridge round the eye, the hooked beak smooth.
    if 'griffin' in kind['parts']:
        tube = region(atlas, kind, 'griffin')
        s = tube.s
        hammered(tube, 0.002, 0.04, seed=6)
        X, Y = s['X'], s['Y']
        beak = smooth((X - 1.42) / 0.04)
        row = np.floor(s['SV'] / 0.07)
        feather = np.hypot(np.mod(s['SV'], 0.07) - 0.05, np.mod(s['SU'] + 0.035 * row, 0.07) - 0.035)
        tube.add(cap(feather, 0.06) * 0.014 * (1 - beak))
        eye = np.hypot(X - 1.24, Y - 2.27) + np.where(s['Z'] > 0.05, 0, 1)
        tube.add(bead(np.abs(eye - 0.05), 0.018) * 0.02 + cap(eye, 0.035) * 0.02)
        tube.add(bead(np.abs(X - 1.42), 0.02) * 0.015)
        tube.paint(beak * 0.4, rough=0.22)
    else:
        rect = kind['regions']['tube']
        plain = atlas.region(rect, lambda x, y: {'X': x, 'Y': y}, 1.0)
        hammered(plain, 0.003, 0.05, seed=6)
    return atlas


# ---- The closed helmets -------------------------------------------------------------------------------------------------

def closed(kind, style):
    atlas = Atlas(kind['sheet'], n=N)
    shell = region(atlas, kind, 'shell')
    s = shell.s
    X, Y, Z = s['X'], s['Y'], s['Z']
    hammered(shell, 0.003, 0.06, seed=7)
    front = smooth((X - 0.1) / 0.15)
    # The face plate's outline seen from the front (|z|, y): over the brow, down past the temples to the jaw, under the chin
    # (inside the shell's front, which is narrower than it is long).
    if style == 'secutor':
        outline = [(0.0, 0.7), (0.37, 0.64), (0.64, 0.38), (0.76, 0.0), (0.74, -0.6), (0.64, -1.1), (0.37, -1.38), (0.0, -1.44)]
    else:
        outline = [(0.0, 0.66), (0.47, 0.6), (0.72, 0.36), (0.81, -0.2), (0.75, -0.9), (0.53, -1.3), (0.0, -1.4)]
    pts = np.asarray(outline, np.float32)
    az = np.abs(Z)
    inside_y = np.interp(Y, pts[::-1, 1], pts[::-1, 0], left=0, right=0)
    d_edge = inside_y - az
    in_plate = smooth(d_edge / 0.02) * front * smooth((Y - pts[-1, 1]) / 0.02) * smooth((pts[0, 1] - Y) / 0.02)
    shell.add(shell.blur(in_plate, 0.012) * 0.014)
    top = np.abs(Y - pts[0, 1]) + np.where(az < pts[0, 0] + 0.5, 0, 1)
    rim = np.minimum(np.abs(d_edge) + np.where((Y < pts[0, 1]) & (Y > pts[-1, 1]), 0, 1), top) * front
    rim = np.where(front > 0.01, rim, 9)
    shell.add(bead(rim, 0.045) * 0.03)
    # Rivets round the plate, just inside its edge.
    inset = [(max(0.0, z - 0.1), y) for z, y in outline[1:-1]]
    for z, y in inset:
        shell.add(cap(np.hypot(az - z, Y - y) + np.where(X > 0, 0, 9), 0.04) * 0.024)
    eyes = kind['eyes']
    d_eye = np.hypot(az - eyes['z'], Y - eyes['y']) + np.where(X > 0, 0, 9)
    rad = eyes['r']
    if style == 'secutor':
        # Two small round eyeholes sunk in rims.
        shell.add(bead(np.abs(d_eye - rad), 0.03) * 0.028 - smooth((rad - d_eye) / 0.01) * 0.02)
        shell.paint(smooth((rad - 0.01 - d_eye) / 0.008), rgb=HOLE, rough=1.0, metal=0.0)
    else:
        # The scissor: larger eye openings with grilles, a nose ridge, a block of breathing holes below.
        shell.add(bead(np.abs(d_eye - rad), 0.04) * 0.035)
        hex_holes(shell, az - eyes['z'], Y - eyes['y'], smooth((rad - 0.03 - d_eye) / 0.01), 0.062, 0.022)
        shell.add(bead(az, 0.06) * smooth((0.42 - Y) / 0.05) * smooth((Y + 0.6) / 0.05) * front * 0.045)
        breath = smooth((0.03 - np.maximum(np.abs(az - 0.32) - 0.2, np.abs(Y + 0.78) - 0.2)) / 0.01) * front
        hex_holes(shell, az, Y, breath, 0.09, 0.026)
    # Hinge bosses at the temples, behind the plate's edge.
    side = np.hypot(X - 0.25, Y - 0.05) + np.where(az > 0.7, 0, 9)
    shell.add(cap(side, 0.14) * 0.03 + bead(np.abs(side - 0.14), 0.02) * 0.012)
    # The neck guard's rolled edge, and the crest's riveted foot over the crown.
    rolled(shell, s['SV'], 0.08, 0.045)
    foot = smooth((0.13 - az) / 0.03) * smooth((Y - 1.0) / 0.12)
    shell.add(foot * 0.012)
    # (Where the crest's foot stands: its sections' bottoms, just inside the shell.)
    feet = [station['bottom'] for station in kind['parts']['crest']['stations']]
    add_rivets(shell, X, Y + np.where(az < 0.2, 0, 9), [(x, y + 0.03) for x, y in (feet[1], feet[len(feet) // 2], feet[-2])], 0.04, 0.02)
    crest = region(atlas, kind, 'crest')
    s = crest.s
    hammered(crest, 0.003, 0.05, seed=8)
    crest.add(bead(np.abs(s['u'] - 0.25), 0.06) * 0.012)
    return atlas


# ---- The foot soldiers' helmets of the fifteenth century (src/helmforms.js DESIGN_FORMS) ---------------------------------
#
#   kettleRidged     (Cleveland 1916.1919; Met 04.3.234) raised in one piece: the medial ridge's line and the lining's rivets
#                    along it, a row of small rivets round the dome's foot (the lining band) and round the brim's outer edge,
#                    the brim's edge turned down, hammer marks and the planishing over them, the polish a little blotched.
#   kettleBurgundian (Met 04.3.228) the skull fluted to its point (the Met's flutes run in a spiral; a mirrored sheet draws
#                    them straight, as on other fluted war hats), a plain band at the foot with its rivets, the brim's sight
#                    across the eyes (two slits, a bar between, their lips raised), the edge turned.
#   salletGerman     (Met 29.158.11, 42.50.32) the sight across the eyes with the brow's stop-rib raised over it, the
#                    lining's rivets round the skull, the keel, the tail's edge turned; the bevor's edges turned, a ridge
#                    down its middle, its strap's rivets at the sides.
#   barbute          (Met 60.151, 25.188.20) the T opening in a turned edge, the lining's rivets round the foot and round the
#                    opening, the ridge's line from brow to nape, the foot's edge turned.

IRON = np.array([0.9, 0.9, 0.92])


def iron(reg, seed):
    """Raised and planished iron: broad hammer blows, finer planishing over them, a little blotching of the polish."""
    hammered(reg, 0.003, 0.07, seed=seed)
    hammered(reg, 0.0012, 0.022, seed=seed + 50)
    rng = np.random.default_rng(seed + 100)
    blotch = reg.blur(rng.standard_normal(reg.x.shape).astype(np.float32), 0.12)
    blotch = smooth(blotch / (blotch.std() + 1e-9) * 0.5 + 0.5)
    reg.paint(blotch * 0.35, mul=(0.86, 0.85, 0.84), rough=0.5)


def along(end, step, start=0.0):
    """Evenly spaced positions from `start` to `end`, about `step` apart (so a row of rivets meets itself at the back)."""
    count = max(1, int(round((end - start) / step)))
    return [start + (end - start) * (k + 0.5) / count for k in range(count)]


def sight(reg, s, spec, bar=0.035):
    """A sight cut across the front at the eyes: two slits (a bar between at the middle), the lips raised round them."""
    y, z, h = spec['y'], spec['z'], spec['h']
    az = np.abs(s['Z'])
    front = s['X'] > 0.2
    # Distance outside the slit (negative inside), in (|z|, y).
    dz = np.maximum(bar - az, az - z)
    dy = np.abs(s['Y'] - y) - h / 2
    out = np.where(front, np.maximum(dz, dy), 9)
    hole = smooth(-out / 0.006)
    reg.add(bead(np.abs(out - 0.025), 0.022) * 0.022 * front - hole * 0.01)
    reg.paint(hole, rgb=HOLE, rough=1.0, metal=0.0, cut=0.0)


def euro_kettle(kind, style):
    atlas = Atlas(kind['sheet'], base=IRON, rough=0.36, n=N)
    bowl = region(atlas, kind, 'bowl')
    s = bowl.s
    iron(bowl, 11)
    end = float(s['SU_END'].max())
    if style == 'kettleBurgundian':
        # Flutes from the band up to the point, eight a side, a ridge at the front and back middles.
        theta = np.arctan2(np.abs(s['Z']), s['X'])
        rise = smooth((s['SV'] - 0.16) / 0.12) * smooth((float(s['SV_END'].max()) - 0.05 - s['SV']) / 0.25)
        bowl.add(np.cos(theta * 16) * 0.016 * rise)
        # The plain band at the foot, a bead above it, its rivets.
        bowl.add(bead(np.abs(s['SV'] - 0.14), 0.02) * 0.015)
        add_rivets(bowl, s['SU'], s['SV'], [(su, 0.07) for su in along(end, 0.3)], 0.03, 0.02)
    else:
        # The lining's rivets beside the ridge (before and behind), the lining band's rivets round the foot.
        tall = float(s['SV_END'].max())
        add_rivets(bowl, s['SU'], s['SV'], [(su, tall * share) for su in (0.09, end - 0.09) for share in (0.45, 0.7)], 0.026, 0.016)
        add_rivets(bowl, s['SU'], s['SV'], [(su, 0.09) for su in along(end, 0.26)], 0.028, 0.018)
    # The brim: its edge turned down (a rolled bead), the rivets round its outer edge (the Cleveland hat's), its sight.
    brim = region(atlas, kind, 'brim')
    s = brim.s
    iron(brim, 12)
    edge = s['SV_END'] - s['SV']
    rolled(brim, edge, 0.06, 0.035)
    brim.add(bead(np.abs(s['SV'] - 0.02), 0.03) * 0.012)
    add_rivets(brim, s['SU'], edge, [(su, 0.14) for su in along(float(s['SU_END'].max()), 0.3)], 0.024, 0.016)
    if kind.get('sight'):
        sight(brim, s, kind['sight'])
    comb = region(atlas, kind, 'comb')
    iron(comb, 13)
    return atlas


def euro_sallet(kind, style):
    atlas = Atlas(kind['sheet'], base=IRON, rough=0.34, n=N)
    shell = region(atlas, kind, 'shell')
    s = shell.s
    iron(shell, 21)
    # The tail's (and the whole foot's) edge turned out; the lining's rivets round the skull above the ears.
    rolled(shell, s['SV'], 0.06, 0.035)
    end = float(s['SU_END'].max())
    add_rivets(shell, s['SU'], s['Y'], [(su, 0.32) for su in along(end, 0.3)], 0.028, 0.018)
    # The keel's line over the skull.
    shell.add(bead(np.abs(s['Z']), 0.05) * 0.01 * smooth((s['Y'] - 0.4) / 0.2))
    # The sight, the brow's stop-rib raised over it.
    spec = kind['sight']
    sight(shell, s, spec)
    front = smooth((s['X'] - 0.4) / 0.1) * smooth((spec['z'] + 0.12 - np.abs(s['Z'])) / 0.05)
    shell.add(bead(np.abs(s['Y'] - (spec['y'] + spec['h'] / 2 + 0.06)), 0.035) * 0.02 * front)
    # The bevor: edges turned, a ridge down the middle, the strap's rivets at its sides.
    bevor = region(atlas, kind, 'bevor')
    s = bevor.s
    iron(bevor, 22)
    edge = np.minimum(np.minimum(s['SV'], s['SV_END'] - s['SV']), s['SU_END'] - s['SU'])
    rolled(bevor, edge, 0.05, 0.03)
    bevor.add(bead(s['SU'], 0.06) * 0.018 * smooth((s['SV'] - 0.1) / 0.1))
    side = s['SU_END'] - s['SU']
    add_rivets(bevor, side, s['Y'], [(0.12, -0.75), (0.12, -1.05)], 0.032, 0.022)
    comb = region(atlas, kind, 'comb')
    iron(comb, 23)
    return atlas


def euro_barbute(kind, style):
    atlas = Atlas(kind['sheet'], base=IRON, rough=0.34, n=N)
    shell = region(atlas, kind, 'shell')
    s = shell.s
    iron(shell, 31)
    end = float(s['SU_END'].max())
    # The foot's edge turned, the lining band's rivets in a row above it; the ridge's line over the skull.
    rolled(shell, s['SV'], 0.06, 0.035)
    add_rivets(shell, s['SU'], s['SV'], [(su, 0.16) for su in along(end, 0.26)], 0.028, 0.018)
    shell.add(bead(np.abs(s['Z']), 0.05) * 0.01 * smooth((s['Y'] - 0.4) / 0.2))
    # The T opening: the eyes' bar and the mouth's slot, corners rounded, in a turned edge with the lining's rivets round it.
    o = kind['opening']
    az = np.abs(s['Z'])
    b0, b1 = o['bar']
    rd = o['round']

    def box(z1, y0, y1):
        """Signed distance (|z|, y) to a box from the middle out to z1, y0 to y1, its corners rounded by rd."""
        qz = az - (z1 - rd)
        qy = np.maximum(y0 + rd - s['Y'], s['Y'] - (y1 - rd))
        return np.hypot(np.maximum(qz, 0), np.maximum(qy, 0)) + np.minimum(np.maximum(qz, qy), 0) - rd

    out = np.minimum(box(o['wide'], b0, b1), box(o['slot'], -3.0, b1))
    out = np.where(s['X'] > 0, out, 9)
    hole = smooth(-out / 0.006)
    shell.add(bead(np.abs(out - 0.03), 0.03) * 0.03 - hole * 0.01)
    shell.paint(hole, rgb=HOLE, rough=1.0, metal=0.0, cut=0.0)
    # Rivets round the opening, a little outside its turned edge.
    ring = [(z, b1 + 0.11) for z in np.linspace(0.0, o['wide'] - 0.05, 4)]
    ring += [(o['wide'] + 0.1, y) for y in np.linspace(b0, b1, 2)]
    ring += [(o['slot'] + 0.11, y) for y in np.linspace(b0 - 0.2, -1.05, 4)]
    add_rivets(shell, az + np.where(s['X'] > 0, 0, 9), s['Y'], [(float(z), float(y)) for z, y in ring], 0.026, 0.018)
    comb = region(atlas, kind, 'comb')
    iron(comb, 33)
    return atlas


EURO = {'kettle': euro_kettle, 'sallet': euro_sallet, 'barbute': euro_barbute}


def main():
    folder = sys.argv[1]
    with open(os.path.join(folder, 'forms.json')) as file:
        forms = json.load(file)
    kinds = sys.argv[2:] or list(forms)
    for style in kinds:
        kind = forms[style]
        if kind.get('build'):
            atlas = EURO[kind['build']](kind, style)
        else:
            atlas = closed(kind, style) if 'shell' in kind['parts'] else brimmed(kind, style)
        atlas.save(folder)
        # A quick look: the colour lit from the left by the height's slope.
        shade = np.clip(0.75 + np.gradient(atlas.h, axis=1) * 3000, 0, 1.5)
        Image.fromarray((np.clip(atlas.alb * shade[..., None], 0, 1) * 255).astype(np.uint8)).save(os.path.join(folder, f"{kind['sheet']}_look.png"))


if __name__ == '__main__':
    main()
