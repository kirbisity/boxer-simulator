# Starvation from the user's emaciated reference (ax_model.blend, object "anabelle.001", 21k points; the user's call,
# 2026-11-10): for every point of the base meshes (tools/blender/basebody.py's output) on the trunk, the neck, the thighs and the
# shins, how far the emaciated body's surface lies in or out from the regular body's along the ring's radius (the starved
# delta); and the emaciated body's rib and spine detail (its normal map) as slopes on the skin map's trunk tile. The game blends
# both in by how starved a fighter is (src/basebody.js). tools/basebody-pack.js packs the output into src/basebody-data.js.
#
#   Blender -b ax_model.blend --python tools/blender/emaciated.py -- <ref.json> <base-female.json> <base-male.json> <normal.png> <out.json>
#
# Lining up: the emaciated figure stands casually (a hand on her hip, her weight on one leg), so she is matched part by part:
# her height to the base body's, and each part's axis (trunk, neck, each thigh and shin) found on her as on the base meshes, from
# the game's joint heights and the middles of her sections there. A base point's place on its part (t along, its direction
# round) is carried to the same place on her part, and a ray from her axis that way finds her surface: the first hit from inside,
# so the hand on her hip (outside her trunk) is never taken for it. The arms are left out: the hip-hand arm is posed, and the
# game thins the arms by its own builds.
#
# The delta kept is her contour, not her girth: each ring's mean delta is taken off (the game's own starved rings already take
# the girth in, loftbody.js), leaving the ribs, the sunk belly, the hip bones and collarbones. For the male mesh it is scaled by
# each ray's girth ratio (his radius over the female base's on the same ray): a male emaciated reference can replace this later.

import json
import math
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

args = sys.argv[sys.argv.index('--') + 1:]
REF = json.load(open(args[0]))
FEMALE = json.load(open(args[1]))
MALE = json.load(open(args[2]))
NORMAL_PATH, OUT = args[3], args[4]

EMACIATED = {
    # The parts the delta covers (the arms take the game's own thinning).
    'parts': ['trunk', 'neck', 'lThigh', 'lShin', 'rThigh', 'rShin'],
    # The farthest a ray looks for her surface (fractions of height: 0.2 is past any part's radius).
    'reach': 0.2,
    # The most a delta may be (fractions of height, 7 cm: her waist and belly lie up to 6 cm inside the base body's before each
    # ring's mean is taken off): a ray that slips out between the legs or past the neck finds nothing
    # nearer than this and gives no delta.
    'most': 0.04,
    # Rings binned along each part (t) for their middle, and smoothing passes over the mesh after (the rays' noise).
    'bin': 0.04, 'smooth': 3,
    # A ray this far from its ring's middle (fractions of height, 3.4 cm) met a fold of her pose, not her contour; and the most a
    # contour may stand in or out (2.5 cm: the belly sunk under the ribs is the deepest, a rib or a hip bone stands about 1 cm).
    'stray': 0.02, 'contour': 0.015,
    # The trunk's contour fades in from the first t to the second (the hip joints' height is 0, the iliac crest about 0.15).
    'trunkFrom': (-0.05, 0.05),
    # Her free side found by the elbow standing out from her waist: points this far out (fractions of height) within this band
    # above her hips.
    'elbowOut': 0.17, 'elbowBand': 0.2,
    # The trunk tile's slopes, baked at half the skin atlas's resolution (skindetail.js DETAIL_TILES trunk 512 x 384: 3.5 mm a
    # texel round a man's trunk, finer than a rib's 2 cm), and the steepest slope kept (a rib's flank is about 45 degrees).
    'tile': (256, 192), 'span': (-0.2, 1.15), 'steepest': 1.5,
}
AXES = {'trunk': ('pelvis', 'neck'), 'neck': ('neck', 'head'), 'lThigh': ('lHip', 'lKnee'), 'lShin': ('lKnee', 'lFoot'), 'rThigh': ('rHip', 'rKnee'), 'rShin': ('rKnee', 'rFoot')}
J = {name: np.array(point) for name, point in REF['female']['joints'].items()}

# Her mesh, in the game's frame (as basebody.py: x = -y, y = z, z = -x), units of her height, ground at 0.
obj = bpy.data.objects['anabelle.001']
mesh = obj.data
mesh.calc_loop_triangles()
V = np.array([(obj.matrix_world @ v.co)[:] for v in mesh.vertices])
V = np.stack([-V[:, 1], V[:, 2], -V[:, 0]], axis=1)
low, high = V.min(axis=0), V.max(axis=0)
H = high[1] - low[1]
V = (V - [0, low[1], 0]) / H


def middle(P):
    return (P.min(axis=0) + P.max(axis=0)) / 2


def slab(P, y, half=0.006):
    return P[np.abs(P[:, 1] - y) < half]


# Her middle across, at her hips (the arms' reach left out: the hand on her hip is outside the trunk's breadth there).
hips = slab(V, J['pelvis'][1])
V[:, 2] -= np.median(hips[:, 2])
pelvis = middle(slab(V[np.abs(V[:, 2]) < 0.08], J['pelvis'][1]))
pelvis[1:] = [J['pelvis'][1], 0]
neck = middle(slab(V[np.abs(V[:, 2]) < 0.04], J['neck'][1]))
neck[1:] = [J['neck'][1], 0]
head = middle(slab(V[np.abs(V[:, 2]) < 0.06], J['head'][1]))
head[1:] = [J['head'][1], 0]
mid = V[np.abs(V[:, 2]) < 0.004]
crotch = mid[mid[:, 1] > J['lKnee'][1] + 0.05][:, 1].min()
joints = {'pelvis': pelvis, 'neck': neck, 'head': head}
for side, sign in (('l', 1), ('r', -1)):
    leg = V[(V[:, 2] * sign > 0.005) & (V[:, 1] < crotch)]
    knee = middle(slab(leg, J[f'{side}Knee'][1]))
    knee[1] = J[f'{side}Knee'][1]
    ankle = middle(slab(leg, J[f'{side}Foot'][1] + 0.03))
    ankle[1] = J[f'{side}Foot'][1]
    # (The hip joint is the pelvis's, at the base body's breadth: her weight-bearing thigh crosses towards the middle, and a line
    # up it misses the socket.)
    hip = np.array([pelvis[0], J[f'{side}Hip'][1], FEMALE['joints'][f'{side}Hip'][2]])
    joints.update({f'{side}Hip': hip, f'{side}Knee': knee, f'{side}Foot': ankle})
# Her free side: the arm that hangs (the other's elbow stands out from her waist, its hand on her hip): the trunk and the neck
# are read on that side only, the other side's points read mirrored across her middle. Her straight leg (the one bearing her
# weight, its knee on the line from hip to ankle): both legs are read on it, the other's points mirrored.
waist = V[(V[:, 1] > J['pelvis'][1]) & (V[:, 1] < J['pelvis'][1] + EMACIATED['elbowBand'])]
elbows = {sign: int((waist[:, 2] * sign > EMACIATED['elbowOut']).sum()) for sign in (1, -1)}
FREE = 1 if elbows[1] < elbows[-1] else -1
bend = {side: abs(joints[f'{side}Knee'][0] - (joints[f'{side}Hip'][0] + joints[f'{side}Foot'][0]) / 2) for side in ('l', 'r')}
STRAIGHT = 'l' if bend['l'] < bend['r'] else 'r'
print('EMACIATED', 'height (blend units)', round(H, 3), 'free side', FREE, elbows, 'straight leg', STRAIGHT, {k: round(v, 4) for k, v in bend.items()}, {k: v.round(4).tolist() for k, v in joints.items()})


def read_as(part, phi):
    # Where a base point of `part` at angle `phi` is read on her: her own part and angle, or the mirrored one (see FREE, STRAIGHT).
    if part in ('trunk', 'neck'):
        return part, (phi if math.sin(phi) * FREE >= 0 else -phi)
    side, kind = part[0], part[1:]
    return (part, phi) if side == STRAIGHT else (STRAIGHT + kind, -phi)
tris = np.array([t.vertices[:] for t in mesh.loop_triangles])
her = BVHTree.FromPolygons([Vector(p) for p in V], tris.tolist())


def frame(js, part):
    a, b = np.array(js[AXES[part][0]]), np.array(js[AXES[part][1]])
    axis = b - a
    length = np.linalg.norm(axis)
    axis /= length
    forward = np.array([1.0, 0, 0])
    depth = forward - axis * (forward @ axis)
    depth /= np.linalg.norm(depth)
    return a, axis, length, depth, np.cross(axis, depth)


def place(js, part, p):
    a, axis, length, depth, width = frame(js, part)
    rel = p - a
    t = rel @ axis / length
    x, y = rel @ depth, rel @ width
    return t, math.atan2(y, x), math.hypot(x, y)


def cast(tree, js, part, t, phi):
    a, axis, length, depth, width = frame(js, part)
    origin = a + axis * t * length
    direction = depth * math.cos(phi) + width * math.sin(phi)
    hit = tree.ray_cast(Vector(origin), Vector(direction), EMACIATED['reach'])
    return (hit[3], hit) if hit[0] is not None else (None, None)


female_tree = BVHTree.FromPolygons([Vector(p) for p in np.array(FEMALE['meshes']['full']['positions']).reshape(-1, 3)], np.array(FEMALE['meshes']['full']['triangles']).reshape(-1, 3).tolist())


def deltas(base, key):
    m = base['meshes'][key]
    P = np.array(m['positions']).reshape(-1, 3)
    names = base['parts']
    out = np.zeros(len(P))
    covered = np.zeros(len(P))
    per_part = {}
    misses = {}
    for vertex in range(len(P)):
        for part_index, share in ((m['part'][vertex], 1 - m['blend'][vertex]), (m['part2'][vertex], m['blend'][vertex])):
            part = names[part_index]
            if share <= 0 or part not in EMACIATED['parts']:
                continue
            t, phi, own = place(base['joints'], part, P[vertex])
            her_part, her_phi = read_as(part, phi)
            r_her, _ = cast(her, joints, her_part, t, her_phi)
            r_reg, _ = cast(female_tree, FEMALE['joints'], part, t, phi)
            reason = 'her' if r_her is None else 'regular' if r_reg is None else 'far' if abs(r_her - r_reg) > EMACIATED['most'] else None
            misses[(part, reason)] = misses.get((part, reason), 0) + 1
            if reason:
                continue
            d = (r_her - r_reg) * own / max(r_reg, 1e-4)
            # (Below her hip joints the trunk's rays meet the buttocks' fold and the thighs' tops: faded out there.)
            if part == 'trunk':
                share *= min(1, max(0, (t - EMACIATED['trunkFrom'][0]) / (EMACIATED['trunkFrom'][1] - EMACIATED['trunkFrom'][0])))
            out[vertex] += share * d
            covered[vertex] += share
            per_part.setdefault(part, []).append((vertex, t, share, d))
    # Each ring's middle taken off (her contour, not her girth), part by part: the median, and a ray far from it (past `stray`:
    # a ray that met a fold of her pose) gives no contour.
    for part, rows in per_part.items():
        rows = np.array(rows)
        bins = np.floor(rows[:, 1] / EMACIATED['bin'])
        for b in np.unique(bins):
            sel = rows[bins == b]
            mean = float(np.median(sel[:, 3]))
            for vertex, _, share, d in sel:
                out[int(vertex)] -= share * (mean if abs(d - mean) <= EMACIATED['stray'] else d)
    # Smoothed over the mesh (the rays' noise), fading where it covers less than the whole point (towards the arms).
    tris = np.array(m['triangles']).reshape(-1, 3)
    edges = np.concatenate([tris[:, [0, 1]], tris[:, [1, 2]], tris[:, [2, 0]]])
    degree = np.maximum(np.bincount(edges.ravel(), minlength=len(P)), 1)
    for _ in range(EMACIATED['smooth']):
        total = np.zeros(len(P))
        np.add.at(total, edges[:, 0], out[edges[:, 1]])
        np.add.at(total, edges[:, 1], out[edges[:, 0]])
        out = 0.5 * out + 0.5 * total / degree
    out = np.clip(out, -EMACIATED['contour'], EMACIATED['contour'])
    print('MISSES', base['sex'], key, sorted(misses.items(), key=str))
    print('DELTA', base['sex'], key, 'covered', int((covered > 0).sum()), 'of', len(P), 'range (cm at 1.7 m)', round(out.min() * 170, 2), round(out.max() * 170, 2))
    return out.round(6).tolist()


result = {sex: {key: deltas(base, key) for key in base['meshes']} for sex, base in (('female', FEMALE), ('male', MALE))}

# The rib and spine detail: her normal map, read where each texel of the trunk tile lands on her, as slopes in the tile's frame.
image = bpy.data.images.load(NORMAL_PATH)
size = image.size[:]
pixels = np.array(image.pixels[:]).reshape(size[1], size[0], image.channels)
uv_layer = mesh.uv_layers['UVMap'].data
loop_uv = np.array([uv_layer[i].uv[:] for i in range(len(uv_layer))])
tri_loops = np.array([t.loops[:] for t in mesh.loop_triangles])
vertex_normals = np.array([v.normal[:] for v in mesh.vertices])
rot = np.array(obj.matrix_world.to_3x3())
vertex_normals = vertex_normals @ rot.T
vertex_normals = np.stack([-vertex_normals[:, 1], vertex_normals[:, 2], -vertex_normals[:, 0]], axis=1)
vertex_normals /= np.linalg.norm(vertex_normals, axis=1, keepdims=True)
fP = np.array(FEMALE['meshes']['full']['positions']).reshape(-1, 3)
fpart = np.array(FEMALE['meshes']['full']['part'])
trunk_points = fP[fpart == FEMALE['parts'].index('trunk')]
a, axis, length, depth, width = frame(FEMALE['joints'], 'trunk')
# The female base's trunk section at each t (its depth and width out from the axis): the ring's shape that turns the tile's
# angle (the loft's parametric one) into a direction.
rel = trunk_points - a
tt = rel @ axis / length
xs, ys = rel @ depth, rel @ width
W, Hh = EMACIATED['tile']
t0, t1 = EMACIATED['span']
slopes = np.zeros((Hh, W, 2))
for row in range(Hh):
    t = t0 + (t1 - t0) * row / (Hh - 1)
    near = np.abs(tt - t) < 0.03
    d = np.abs(xs[near]).max() if near.sum() > 4 else 0.1
    w = np.abs(ys[near]).max() if near.sum() > 4 else 0.1
    for column in range(W):
        ang = 2 * math.pi * column / (W - 1)
        phi = math.atan2(w * math.sin(ang), d * math.cos(ang))
        # (Her hip-hand side read mirrored, its round slope turned with it.)
        mirrored = math.sin(phi) * FREE < 0
        _, hit = cast(her, joints, 'trunk', t, -phi if mirrored else phi)
        if hit is None:
            continue
        face = hit[2]
        corners = tris[face]
        p = np.array(hit[0][:])
        A, B, C = V[corners]
        # Barycentric weights of the hit in its triangle.
        v0, v1, v2 = B - A, C - A, p - A
        d00, d01, d11, d20, d21 = v0 @ v0, v0 @ v1, v1 @ v1, v2 @ v0, v2 @ v1
        den = d00 * d11 - d01 * d01 or 1e-12
        wb = (d11 * d20 - d01 * d21) / den
        wc = (d00 * d21 - d01 * d20) / den
        bary = np.array([1 - wb - wc, wb, wc])
        uvs = loop_uv[tri_loops[face]]
        uv = bary @ uvs
        px = pixels[int(np.clip(uv[1], 0, 1) * (size[1] - 1)), int(np.clip(uv[0], 0, 1) * (size[0] - 1))]
        n_tan = px[:3] * 2 - 1
        # Her tangent frame at the hit: the smooth normal, and the directions of the texture's u and v on the triangle.
        N = bary @ vertex_normals[corners]
        N /= np.linalg.norm(N)
        du1, du2 = uvs[1] - uvs[0], uvs[2] - uvs[0]
        det = du1[0] * du2[1] - du2[0] * du1[1] or 1e-12
        T = (v0 * du2[1] - v1 * du1[1]) / det
        Bt = (v1 * du1[0] - v0 * du2[0]) / det
        T -= N * (T @ N)
        Bt -= N * (Bt @ N)
        T /= np.linalg.norm(T) or 1
        Bt /= np.linalg.norm(Bt) or 1
        n_world = n_tan[0] * T + n_tan[1] * Bt + n_tan[2] * N
        # The tile's frame there: round the part (the angle increasing) and along it (t increasing), on her tangent plane.
        around = -math.sin(ang) * d * depth + math.cos(ang) * w * width
        around -= N * (around @ N)
        around /= np.linalg.norm(around) or 1
        up = axis - N * (axis @ N)
        up /= np.linalg.norm(up) or 1
        nz = max(n_world @ N, 0.2)
        # (Mirrored, round is the way the mirrored point moves as the tile's angle grows.)
        if mirrored:
            around = -math.sin(ang) * d * depth - math.cos(ang) * w * width
            around -= N * (around @ N)
            around /= np.linalg.norm(around) or 1
        slopes[row, column] = [-(n_world @ around) / nz, -(n_world @ up) / nz]
slopes = np.clip(slopes, -EMACIATED['steepest'], EMACIATED['steepest'])
result['trunkSlopes'] = {'width': W, 'height': Hh, 'span': list(EMACIATED['span']), 'steepest': EMACIATED['steepest'], 'slopes': slopes.round(4).ravel().tolist()}
print('SLOPES', W, Hh, 'mean |slope|', round(float(np.abs(slopes).mean()), 4))
json.dump(result, open(OUT, 'w'))
