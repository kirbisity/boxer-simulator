# The knights' helmets' relief (src/knighthelms.js): for each design, the height field, colour, roughness, metalness and
# cut-out over its sheet, every feature placed on the part's real surface in its own measures (tools/knighthelms-dump.mjs
# samples it), as each part's `bake` list says: rolled, roped and leather-bound edges, beads and seams, raised bands and
# plates, steps where plates lap, rivets, pivot bosses, vervelles, Gothic flutes, mail, and the sights, breaths and face
# openings cut through. Then helmbake.py bakes the normal map and occlusion and packknight.py packs them into
# src/knighthelms-data.js. Plain Python 3 (numpy, scipy, Pillow); the shapes are helmsheets.py's, the iron helmforms.py's.
#
#   node tools/knighthelms-dump.mjs > <dir>/knights.json
#   python3 tools/blender/knighthelms.py <dir> [designs...]
#   Blender -b --factory-startup --python tools/blender/helmbake.py -- <dir> knightGreatHelm knightHounskull ...
#   python3 tools/blender/packknight.py <dir>

import json
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from helmforms import IRON, region  # noqa: E402
from helmsheets import HOLE, Atlas, add_rivets, bead, cap, hammered, seg_dist, smooth  # noqa: E402

N = 1024
LEATHER = np.array([0.32, 0.2, 0.12])
MAIL_GAP = np.array([0.16, 0.16, 0.17])


def planished(reg, seed):
    """Plate raised with the hammer and planished smooth: the broad blows faint under a fine planishing, the polish even."""
    hammered(reg, 0.0016, 0.08, seed=seed)
    hammered(reg, 0.0006, 0.025, seed=seed + 50)
    rng = np.random.default_rng(seed + 100)
    blotch = reg.blur(rng.standard_normal(reg.x.shape).astype(np.float32), 0.15)
    blotch = smooth(blotch / (blotch.std() + 1e-9) * 0.5 + 0.5)
    reg.paint(blotch * 0.2, mul=(0.9, 0.89, 0.88), rough=0.42)


def view(s, name):
    """A view's coordinates (a, b), where it holds, and how a feature's first coordinate maps into a (for 'round': the share
    of the way round times the part's length round there)."""
    if name == 'front':
        return np.abs(s['Z']), s['Y'], s['X'] > 0.05, lambda a: a
    if name == 'side':
        return s['X'], s['Y'], np.abs(s['Z']) > 0.3, lambda a: a
    if name == 'round':
        end = np.maximum(s['SU_END'], 1e-3)
        return s['SU'], s['Y'], np.ones(s['X'].shape, bool), lambda a: a * end
    raise ValueError(name)


def box(A, B, a0, a1, b0, b1, rd):
    """Signed distance (negative inside) to a box a0..a1 x b0..b1 with corners rounded by rd."""
    ca, cb = (a0 + a1) / 2, (b0 + b1) / 2
    ha, hb = (a1 - a0) / 2 - rd, (b1 - b0) / 2 - rd
    qa = np.abs(A - ca) - ha
    qb = np.abs(B - cb) - hb
    return np.hypot(np.maximum(qa, 0), np.maximum(qb, 0)) + np.minimum(np.maximum(qa, qb), 0) - rd


def opening(reg, d, mask, lip=0.0, cut=True, sink=0.01):
    """An opening where the distance d < 0 (on the view's side only): sunk and dark, cut through, a lip raised round it."""
    d = np.where(mask, d, 9)
    hole = smooth(-d / 0.006)
    if lip:
        reg.add(bead(np.abs(d - 0.022), 0.02) * lip)
    reg.add(-hole * sink)
    reg.paint(hole, rgb=HOLE, rough=1.0, metal=0.0, **({'cut': 0.0} if cut else {}))


def edge_distance(s, at):
    if at == 'start':
        return s['SV']
    if at == 'end':
        return s['SV_END'] - s['SV']
    if at == 'side':
        return s['SU_END'] - s['SU']
    if at == 'top':
        return s['SU']
    raise ValueError(at)


def feature(reg, s, f):
    kind = f['kind']
    if kind == 'edge':
        d = edge_distance(s, f['at'])
        roll = cap(d, f['w'])
        if f.get('roped'):
            # Roped: the rolled edge filed in a twist of diagonal grooves.
            along = s['SU'] if f['at'] in ('start', 'end') else s['SV']
            roll = roll * (0.55 + 0.45 * np.cos((along + d) * 2 * np.pi / 0.05))
        reg.add(roll * f['h'])
        if f.get('leather'):
            reg.paint(smooth((f['w'] * 2.2 - d) / 0.01), rgb=LEATHER, rough=0.8, metal=0.0)
        return
    if kind == 'mail':
        # Riveted rings in rows, each row half a ring over, the dark between them.
        pitch = 0.075
        row = np.floor(s['SV'] / (pitch * 0.62))
        cy = (row + 0.5) * pitch * 0.62
        cx = (np.floor(s['SU'] / pitch - 0.5 * np.mod(row, 2)) + 0.5 + 0.5 * np.mod(row, 2)) * pitch
        d = np.hypot(s['SU'] - cx, (s['SV'] - cy) * 1.25)
        ring = bead(np.abs(d - pitch * 0.33), pitch * 0.13)
        reg.add(ring * 0.022)
        reg.paint(1 - smooth(ring * 3), rgb=MAIL_GAP, rough=0.9)
        reg.paint(smooth(ring), rough=0.42)
        return
    if kind == 'flutes':
        # Flutes fanning back from the brow (the share of the way round), fading in and out along the part.
        share = s['SU'] / np.maximum(s['SU_END'], 1e-3)
        t = np.clip((share - f['from']) / (f['to'] - f['from']), 0, 1)
        inside = smooth((share - f['from']) / 0.04) * smooth((f['to'] - share) / 0.04)
        rise = smooth(s['SV'] / 0.2) * smooth((s['SV_END'] - s['SV']) / 0.25)
        reg.add(np.cos(t * np.pi * 2 * f['count']) * f['h'] * inside * rise)
        return
    if kind == 'staples':
        # Vervelles: little staples standing through the skull's edge for the aventail's lace.
        end = np.maximum(s['SU_END'], 1e-3)
        field = np.zeros(s['X'].shape, np.float32)
        for a, _ in f['at']:
            d = box(s['SU'] - a * end, s['SV'], -f['w'] / 2, f['w'] / 2, f['above'] - f['l'] / 2, f['above'] + f['l'] / 2, 0.012)
            np.maximum(field, smooth(-d / 0.01), out=field)
        reg.add(field * f['h'])
        reg.paint(field * 0.6, mul=(0.75, 0.7, 0.62))
        return
    if kind == 'step':
        # Where one plate laps over the next: a step down below the line, the lapping edge turned.
        reg.add(smooth((s['Y'] - f['y']) / f['w']) * f['h'] + bead(np.abs(s['Y'] - f['y'] - f['w'] * 0.6), f['w']) * f['h'] * 0.6)
        return
    A, B, mask, at = view(s, f['view'])
    if kind == 'slot':
        z0, z1 = f['z']
        y0, y1 = f['y']
        opening(reg, box(A, B, z0, z1, y0, y1, f.get('round', 0.02)), mask, f.get('lip', 0.0), f.get('cut', True))
    elif kind == 'cutout':
        z0, z1 = f['z']
        y0, y1 = f['y']
        # The face opening reaches across the middle (a box mirrored about it).
        opening(reg, box(A, B, -z1, z1, y0, y1, f.get('round', 0.1)), mask, f.get('lip', 0.0), True, sink=0.0)
    elif kind == 'slots':
        z0, z1 = f['z']
        d = np.full(A.shape, 9.0, np.float32)
        for y in f['y']:
            d = np.minimum(d, box(A, B, z0, z1, y - f['h'] / 2, y + f['h'] / 2, f.get('round', 0.015)))
        opening(reg, d, mask, 0.008, f.get('cut', True))
    elif kind == 'holes':
        d = np.full(A.shape, 9.0, np.float32)
        for a, b in f['at']:
            d = np.minimum(d, np.hypot(A - at(a), B - b) - f['r'])
        opening(reg, d, mask, 0.0, f.get('cut', True))
    elif kind == 'cross':
        a, b = f['at']
        arm, w = f['arm'], f['w']
        d = np.minimum(box(A, B, a - w / 2, a + w / 2, b - arm, b + arm, 0.008), box(A, B, a - arm, a + arm, b - w / 2, b + w / 2, 0.008))
        opening(reg, d, mask, 0.0, f.get('cut', True))
    elif kind == 'rivets':
        far = np.where(mask, 0, 99)
        if f['view'] == 'round':
            end = np.maximum(s['SU_END'], 1e-3)
            field = np.zeros(A.shape, np.float32)
            for a, b in f['at']:
                np.maximum(field, cap(np.hypot(A - a * end, B - b), f['r']) * f['h'], out=field)
            reg.add(field)
        else:
            add_rivets(reg, A + far, B, [tuple(p) for p in f['at']], f['r'], f['h'])
    elif kind == 'boss':
        a, b = f['at']
        d = np.hypot(A - a, B - b) + np.where(mask, 0, 99)
        reg.add(cap(d, f['r']) * f['h'] + bead(np.abs(d - f['r'] * 1.2), 0.015) * f['h'] * 0.4)
    elif kind == 'bead':
        points = [(at(a) if f['view'] != 'round' else a, b) for a, b in f['line']]
        if f['view'] == 'round':
            end = np.maximum(s['SU_END'], 1e-3)
            d = seg_dist(A / end, B, points) * end
        else:
            d = seg_dist(A, B, points)
        d = np.where(mask, d, 9)
        reg.add(bead(d, f['w']) * f['h'])
    elif kind == 'band':
        z0, z1 = f['z']
        y0, y1 = f['y']
        d = np.where(mask, box(A, B, -z1, z1, y0, y1, 0.01), 9)
        reg.add(smooth(-d / 0.015) * f['h'] + bead(np.abs(d), 0.012) * f['h'] * 0.5)
    elif kind == 'plate':
        x0, x1 = f['x']
        y0, y1 = f['y']
        d = np.where(mask, box(A, B, x0, x1, y0, y1, 0.02), 9)
        reg.add(smooth(-d / 0.012) * f['h'])
    else:
        raise ValueError(kind)


def build(design):
    atlas = Atlas(design['sheet'], base=IRON, rough=0.32, n=N)
    for seed, (name, part) in enumerate(design['parts'].items()):
        reg = region(atlas, design, name)
        if part['look'] == 'metal':
            planished(reg, 41 + seed * 7)
        for f in part['bake']:
            feature(reg, reg.s, f)
    return atlas


def main():
    folder = sys.argv[1]
    with open(os.path.join(folder, 'knights.json')) as file:
        designs = json.load(file)
    for style in sys.argv[2:] or list(designs):
        design = designs[style]
        atlas = build(design)
        atlas.save(folder)
        shade = np.clip(0.75 + np.gradient(atlas.h, axis=1) * 3000, 0, 1.5)
        look = np.clip(atlas.alb * shade[..., None], 0, 1) * atlas.cut[..., None]
        Image.fromarray((look * 255).astype(np.uint8)).save(os.path.join(folder, f"{design['sheet']}_look.png"))


if __name__ == '__main__':
    main()
