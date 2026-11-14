# The emaciated reference's bone relief (ribs, breastbone, collarbones, spine, shoulder blades, hip bones) as heights on the skin
# map's trunk tile (ax_model.blend, object "anabelle.001"; the remodel of 2026-11). The family's emaciated build is her on the
# base mesh's points, 2 to 3 cm apart on the trunk: her frame and her sunk belly, but no rib (2 cm from one to the next). The
# ribs are drawn by the skin's normal map instead, from here.
#
#   python3 emaciateddetail.py <map.json> <even.npy> <reg.npy> <pre.npy> <aligned.npz> <out.json> [side]
#
#   map.json     where the sex's base mesh is drawn on the trunk tile (tools/basebody-trunk.js)
#   even.npy     the emaciated build as the game holds it (relax.py's: its points slid over its own surface)
#   reg.npy      the same build before they slid (register.py's): the same surface, each point where the registration put it
#   pre.npy      the base mesh drawn onto her sculpt, before its two sides were made the same (regE.py's X ahead of mirror_mean)
#   aligned.npz  her sculpt set in the base body's pose and on its joints (A its points, T its triangles; units of height)
#   out.json     {width, height, span, deepest, heights, remade}: for tools/basebody-detail.js
#
# A texel is followed back onto her by the registration, not by nearness: its place on the drawn triangle is a place on the
# evened build, that a place on the build before it was evened (the nearest of its surface), that the same place on the mesh
# as it lay on her sculpt, one side at a time. The build itself stands 6 mm off her at the median and 2 to 3 cm at the chest
# and the flanks (it is the mean of her two sides and she stands turned, a hand on one hip; the man's is refitted to a man's
# tape besides): read along its normal, a rib landed a rib's spacing off, differently on either side, and the two sides
# averaged cancelled.
#
# What is kept is what the build's points cannot carry: how far each point of her sculpt stands out of her own sculpt smoothed
# (RELIEF['smooth']: what points 2 to 3 cm apart would still show), a height in units of stature. A height and not a normal: it
# has no frame to get wrong, the game lays it on its own texels' sizes (skintex.js), and its hollows darken as the rules' do.
#
# Where her sculpt was remade (the man's chest, malechest.py: her breasts carried away, and with them whatever lay under) there
# is nothing of her bones to keep. `remade` is the share of each texel that lies there, for tools/basebody-detail.js to draw
# the skin rules' own ribs in: her flank's ribs have no one spacing or slope on the tile to carry across a chest (the rules'
# form fitted to them agrees with a tenth to a third of their relief; lines drawn on along their own direction met as a V).
import json
import sys

import numpy as np
from scipy.ndimage import distance_transform_edt
from scipy.spatial import cKDTree

MAP, EVEN, REG, PRE, ALIGNED, OUT = sys.argv[1:7]
SIDE = sys.argv[7] if len(sys.argv) > 7 else None
DUMP = sys.argv[8] if len(sys.argv) > 8 else None

RELIEF = {
    # The tile's heights: 256 x 192 over the trunk tile's span (skindetail.js DETAIL.spans.trunk), 3.5 mm a texel round a trunk;
    # read `over` times finer each way and averaged down.
    'tile': (256, 192), 'span': (-0.2, 1.15), 'over': 2,
    # Smoothing passes over her sculpt (its points 7 mm apart at 1.68 m: 16 passes of half the way to the neighbours' mean blur
    # about 2 cm, a rib's spacing).
    'smooth': 16,
    # The fine texels blurred by this many (her sculpt's points are 2 texels apart: the facets between them, not her).
    'blur': 1.5,
    # The build is the same on both sides and she is not (her trunk turned and bent to the hip her hand is on: her ribs lie up to
    # a centimetre apart from one side to the other, half their spacing): one side's relief is drawn on both, 'a' the side of
    # the tile's first half or 'b' the other's ('mean' both averaged, None each its own). Within `seam` fine texels of the
    # middle, front and back, the two are averaged, so the relief has no crease there.
    'side': 'a', 'seam': 10,
    # The deepest relief kept, units of stature (1 cm at 1.68 m: a starved hip bone's crest over the hollow beside it).
    'deepest': 0.006,
    # Fine texels over which what was remade of her comes in from its edge (2 cm: a rib's spacing, the width over which the
    # remade surface runs into her own).
    'margin': 12,
}
if SIDE:
    RELIEF['side'] = None if SIDE == 'none' else SIDE


def closest_on_mesh(points, V, T, k=16):
    """Each point's nearest place on a triangle mesh: (triangle, its three weights, the place). Among the k nearest by centre."""
    _, cand = cKDTree(V[T].mean(1)).query(points, k=k)
    a, b, c = V[T[cand, 0]], V[T[cand, 1]], V[T[cand, 2]]
    p = points[:, None, :]
    best = np.full(cand.shape, np.inf)
    weights = np.zeros(cand.shape + (3,))
    # (Inside the triangle's own plane where the foot of the perpendicular is in it; else the nearest of its three edges.)
    v0, v1, v2 = b - a, c - a, p - a
    d00, d01, d11 = (v0 * v0).sum(-1), (v0 * v1).sum(-1), (v1 * v1).sum(-1)
    d20, d21 = (v2 * v0).sum(-1), (v2 * v1).sum(-1)
    den = np.where(np.abs(d00 * d11 - d01 * d01) < 1e-18, 1e-18, d00 * d11 - d01 * d01)
    wb, wc = (d11 * d20 - d01 * d21) / den, (d00 * d21 - d01 * d20) / den
    inside = (wb >= 0) & (wc >= 0) & (wb + wc <= 1)
    foot = a + wb[..., None] * v0 + wc[..., None] * v1
    best = np.where(inside, np.linalg.norm(p - foot, axis=-1), best)
    weights = np.where(inside[..., None], np.stack([1 - wb - wc, wb, wc], -1), weights)
    for (i, j), (s, e) in zip(((0, 1), (1, 2), (2, 0)), ((a, b), (b, c), (c, a))):
        along = np.clip(((p - s) * (e - s)).sum(-1) / np.maximum(1e-18, ((e - s) ** 2).sum(-1)), 0, 1)
        far = np.linalg.norm(p - (s + along[..., None] * (e - s)), axis=-1)
        w = np.zeros(cand.shape + (3,))
        w[..., i], w[..., j] = 1 - along, along
        nearer = far < best
        best = np.where(nearer, far, best)
        weights = np.where(nearer[..., None], w, weights)
    pick = best.argmin(1)
    rows = np.arange(len(points))
    tri, w = cand[rows, pick], weights[rows, pick]
    return tri, w, np.einsum('ik,ikj->ij', w, V[T[tri]])


def vertex_normals(V, T):
    fn = np.cross(V[T[:, 1]] - V[T[:, 0]], V[T[:, 2]] - V[T[:, 0]])
    N = np.zeros_like(V)
    for k in range(3):
        np.add.at(N, T[:, k], fn)
    return N / np.maximum(1e-12, np.linalg.norm(N, axis=1, keepdims=True))


def smoothed(V, T, passes):
    edges = np.unique(np.sort(np.concatenate([T[:, [0, 1]], T[:, [1, 2]], T[:, [2, 0]]]), axis=1), axis=0)
    degree = np.maximum(np.bincount(edges.ravel(), minlength=len(V)), 1)[:, None]
    for _ in range(passes):
        acc = np.zeros_like(V)
        np.add.at(acc, edges[:, 0], V[edges[:, 1]])
        np.add.at(acc, edges[:, 1], V[edges[:, 0]])
        V = 0.5 * V + 0.5 * acc / degree
    return V


# Each of her points' height over her smoothed self, along the smoothed surface's normal.
z = np.load(ALIGNED)
A, TA = z['A'].astype(float), z['T']
A_smooth = smoothed(A, TA, RELIEF['smooth'])
relief = np.einsum('ij,ij->i', A - A_smooth, vertex_normals(A_smooth, TA))

# Each drawn point's place on her: on the evened build, then on the build before it was evened, then on the mesh as registered.
drawn = json.load(open(MAP))
TU = np.array(drawn['TU']).reshape(-1, 2)
GT = np.array(drawn['T']).reshape(-1, 3)
mix = np.array(drawn['S']).reshape(-1, 3)
even, reg, pre = np.load(EVEN), np.load(REG), np.load(PRE)
assert len(even) == len(reg) == len(pre) == drawn['count'], 'the builds are not this mesh'
i, j, s = mix[:, 0].astype(int), mix[:, 1].astype(int), mix[:, 2:3]
# (The base mesh's own triangles: the drawn ones' corners are its points but for a seam's splits, which lie on its edges.)
whole = (i == j)
BT = np.array([[i[t[0]], i[t[1]], i[t[2]]] for t in GT if whole[t].all()])
BT = np.unique(np.sort(BT, axis=1), axis=0)
tri, w, _ = closest_on_mesh(even[i] * (1 - s) + even[j] * s, reg, BT)
on_her = np.einsum('ik,ikj->ij', w, pre[BT[tri]])

# The drawn triangles laid into the tile: each fine texel's place on her.
over = RELIEF['over']
W, H = RELIEF['tile'][0] * over, RELIEF['tile'][1] * over
t0, t1 = RELIEF['span']
col = TU[:, 1] * (W - 1)
row = (TU[:, 0] - t0) / (t1 - t0) * (H - 1)
place = np.full((H, W, 3), np.nan)
for corners in GT:
    x, y = col[corners], row[corners]
    den = (y[1] - y[2]) * (x[0] - x[2]) + (x[2] - x[1]) * (y[0] - y[2])
    if abs(den) < 1e-9:
        continue
    rr, cc = np.mgrid[max(0, int(np.ceil(y.min()))):min(H - 1, int(np.floor(y.max()))) + 1, max(0, int(np.ceil(x.min()))):min(W - 1, int(np.floor(x.max()))) + 1]
    a = ((y[1] - y[2]) * (cc - x[2]) + (x[2] - x[1]) * (rr - y[2])) / den
    b = ((y[2] - y[0]) * (cc - x[2]) + (x[0] - x[2]) * (rr - y[2])) / den
    inside = np.minimum(np.minimum(a, b), 1 - a - b) >= -1e-6
    place[rr[inside], cc[inside]] = a[inside, None] * on_her[corners[0]] + b[inside, None] * on_her[corners[1]] + (1 - a - b)[inside, None] * on_her[corners[2]]
found = ~np.isnan(place[..., 0])
tri, w, at = closest_on_mesh(place[found], A, TA, k=12)
off = np.linalg.norm(at - place[found], axis=1)
height = np.zeros((H, W))
height[found] = np.einsum('ik,ik->i', w, relief[TA[tri]])
# (Which texels lie on what was remade of her: a man's chest, where her breasts were. Nothing of her bones is there.)
remade = np.zeros((H, W), bool)
if 'remade' in z:
    remade[found] = np.einsum('ik,ik->i', w, z['remade'][TA[tri]].astype(float)) > 0.5
if DUMP:
    np.savez(DUMP, height=height, found=found, remade=remade, across=place[..., 2])


def neighbours(grid):
    """The mean of a texel's four neighbours: round the trunk the tile closes on itself, along it the edge is repeated."""
    padded = np.pad(grid, ((1, 1), (0, 0)), mode='edge')
    return (np.roll(grid, 1, axis=1) + np.roll(grid, -1, axis=1) + padded[:-2] + padded[2:]) / 4


# Where the game draws nothing of her (the shoulders' caps, in the arm's tile; past the hem), the height runs on smoothly from
# what is beside it: an edge there would be drawn as a ridge.
for _ in range(400):
    height[~found] = neighbours(height)[~found]
if RELIEF['side']:
    mean = (height + height[:, ::-1]) / 2
    if RELIEF['side'] == 'mean':
        height = mean
    else:
        columns = np.arange(W)
        first = columns < W / 2
        one = np.where(first[None, :] == (RELIEF['side'] == 'a'), height, height[:, ::-1])
        # (The middle of the front is the tile's two ends, of the back its middle.)
        from_middle = np.minimum(np.minimum(columns, W - 1 - columns), np.abs(columns - (W - 1) / 2))
        u = np.clip(from_middle / RELIEF['seam'], 0, 1)
        own = (u * u * (3 - 2 * u))[None, :]
        height = mean * (1 - own) + one * own
for _ in range(int(round(RELIEF['blur'] ** 2 * 2))):
    height = (height + neighbours(height)) / 2

Wd, Hd = RELIEF['tile']
small = np.clip(height.reshape(Hd, over, Wd, over).mean(axis=(1, 3)), -RELIEF['deepest'], RELIEF['deepest'])
out = {'width': Wd, 'height': Hd, 'span': list(RELIEF['span']), 'deepest': RELIEF['deepest'], 'heights': small.round(6).ravel().tolist()}
if remade.any():
    if RELIEF['side'] in ('a', 'b'):
        remade = np.where((np.arange(W) < W / 2)[None, :] == (RELIEF['side'] == 'a'), remade, remade[:, ::-1])
    # (How far inside the remade part, the tile turned so that the front's middle, where it lies, is not the tile's edge.)
    inside = np.roll(distance_transform_edt(np.roll(remade, W // 2, axis=1)), -(W // 2), axis=1)
    u = np.clip(inside / RELIEF['margin'], 0, 1)
    out['remade'] = (u * u * (3 - 2 * u)).reshape(Hd, over, Wd, over).mean(axis=(1, 3)).round(4).ravel().tolist()
json.dump(out, open(OUT, 'w'))
print('RELIEF', Wd, Hd, 'side', RELIEF['side'], 'found', round(float(found.mean()), 3), 'off her mm at 1.68 m: median', round(float(np.median(off)) * 1680, 2), 'most', round(float(off.max()) * 1680, 1),
      '| mean |height| mm', round(float(np.abs(small).mean()) * 1680, 3), 'most', round(float(np.abs(height).max()) * 1680, 2))
