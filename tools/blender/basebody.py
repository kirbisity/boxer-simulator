# The fighters' bodies from the modelled base meshes (Base_Male_Mesh.blend, female.blend; 2026-11-10): each mesh
# without its head, hands and feet (the game's own head, hands and feet cover those, face.js and wardrobe.js), its arms turned
# down into the rig's A-pose, decimated to a fighter's and a crowd's count of triangles, in the game's frame (units of standing
# height, x forward, y up, z to the left, the ground at y 0), with its joints as modelled and each point's skin part (and the
# neighbouring part it blends into across a joint). What the game does with it is src/basebody.js; tools/basebody-pack.js
# packs the output into src/basebody-data.js.
#
#   node tools/basebody-ref.js > ref.json
#   Blender -b <file.blend> --python tools/blender/basebody.py -- <ref.json> <sex> <object> <out.json> [<check.png>]
#
# The joints: the heights of the knee, ankle, hip, neck and shoulder are the game's own (rig.js bindPoints, as fractions of
# height: the game's body is built from the same anthropometric tables a modeller follows), placed across and fore and aft at
# the middle of the mesh's own cross-sections there. The arm's lengths are the base mesh's own (its reach to the fingertip),
# split by the segment tables, so the elbow sits where the modeller put it.

import json
import math
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:]
REF = json.load(open(args[0]))[args[1]]
SEX, NAME, OUT = args[1], args[2], args[3]
CHECK = args[4] if len(args) > 4 else None
J = {name: np.array(point) for name, point in REF['joints'].items()}

BASE = {
    # Subdivision before decimating: the male's trunk is a coarse cage under a dense head, and two levels let the belly and the
    # flanks bend smoothly (the experiment, tools/blender/bodybuilds.py); the female's cage is even, and already at two.
    'subdivide': 2,
    # Points this close (a share of the model's height) are one point (the mirror's seam).
    'weld': 1e-5,
    # Triangles kept: a fighter's body about V7's skin (bodystyles.js: about 9k with its neck and limbs), a crowd's about the
    # low-detail loft's (about 2.2k: crowdlod.js).
    'triangles': {'full': 8000, 'crowd': 2500},
    # The arms in the bind pose: 25 degrees out from hanging (rig.js bindPoints).
    'armAngle': math.radians(25),
    # Segment lengths as fractions of standing height (Drillis and Contini 1966, the tables body.js follows): upper arm, forearm
    # (elbow to wrist), hand (wrist to fingertip); the fist's middle sits this share of the hand past the wrist (its knuckles
    # are about two-fifths of the hand's length).
    'upperArm': 0.186, 'forearm': 0.146, 'hand': 0.108,
    # Where the loft's bare forearm ends, as a share of the elbow-to-fist line (loftbody.js: it runs into the back of the fist).
    'wristAt': 0.98,
    # The arm turned down by a weight that rises from the shoulder joint into the arm (along it, in upper-arm lengths) and, near
    # the shoulder, falls off away from its axis (in the arm's own radius), so the trunk under the armpit and the trapezius stay
    # put (the shoulder's cap and the armpit turn part way, as they deform when an arm is lowered); from `turnWhole` of the
    # upper arm on, below the armpit, the whole limb turns.
    'turnAlong': (-0.5, 0.1), 'turnAcross': (1.4, 2.6), 'turnWhole': (0.1, 0.4),
    # The forearm's own turn about the elbow, rising over this span (forearm lengths from the elbow).
    'elbowTurn': (-0.25, 0.3),
    # How far out (fractions of height) the modelled arm lies clear of the trunk: both A-poses hold the arms out past this
    # from above the elbow (the trunk's half-breadth is at most 0.1 of height).
    'clearOfTrunk': 0.15,
    # The shoulder's turn smoothed within `reach` of the joint over `breadth` (fractions of height: 18 cm, about the deltoid's
    # length; 2 cm, the fold's).
    'shoulderSmooth': (0.1, 0.011),
    # Rounds of measuring the upper arm's line and turning it by what is left (the weight bends the arm a little each time).
    'turnRounds': 4,
    # Where each part is cut, as the loft's own parts end (loftbody.js): the neck at 0.6 of the way to the head's centre
    # (the head overlaps it there), the shin at 0.97 of the way to the ankle (the foot's shoe or skin covers it).
    'neckCut': 0.6, 'ankleCut': 0.97,
    # The loft's trunk ends this far below the hip joint (t, trunk lengths: loftbody.js lofts it from -0.12): below it the
    # thighs' rings, and the clothes on them, take over.
    'trunkEnd': -0.12,
    # Each joint's blend between its two parts: this far (fractions of height, about 4.5 cm) either side of the cut, so a part
    # scaled by its own girth meets its neighbour without a step.
    'blend': 0.025,
}

obj = bpy.data.objects[NAME]
for modifier in obj.modifiers:
    if modifier.type == 'SUBSURF':
        modifier.levels = BASE['subdivide']
        modifier.render_levels = BASE['subdivide']
dg = bpy.context.evaluated_depsgraph_get()
mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(dg))
mesh.transform(obj.matrix_world)
bm = bmesh.new()
bm.from_mesh(mesh)
# The base meshes face -y with +z up; the game faces +x with +y up and +z to the left: x = -y, y = z, z = -x.
for v in bm.verts:
    x, y, z = v.co
    v.co = Vector((-y, z, -x))


def keep_body():
    # The body is the island standing tallest: the male's file carries a dense detail piece in the head (eyebrows and lashes,
    # 9k points: the "dense head") and a few stray triangles, the female's two loose points; the cuts leave the pieces they cut off.
    bm.verts.ensure_lookup_table()
    seen = np.zeros(len(bm.verts), bool)
    islands = []
    for v in bm.verts:
        if seen[v.index]:
            continue
        stack, island = [v], []
        seen[v.index] = True
        while stack:
            u = stack.pop()
            island.append(u)
            for e in u.link_edges:
                w = e.other_vert(u)
                if not seen[w.index]:
                    seen[w.index] = True
                    stack.append(w)
        islands.append(island)
    islands.sort(key=lambda island: max(u.co[1] for u in island) - min(u.co[1] for u in island))
    for island in islands[:-1]:
        bmesh.ops.delete(bm, geom=island, context='VERTS')


keep_body()
# The female's mirror leaves its two halves unjoined down the middle (a seam of doubled points that splits the normals): points
# closer than `weld` (fractions of the model's height: a hundredth of a millimetre) are merged.
bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=BASE['weld'] * (max(v.co[1] for v in bm.verts) - min(v.co[1] for v in bm.verts)))
V = np.array([v.co[:] for v in bm.verts])
low, high = V.min(axis=0), V.max(axis=0)
H = high[1] - low[1]
shift = Vector((0, -low[1], -(low[2] + high[2]) / 2))
for v in bm.verts:
    v.co = (v.co + shift) / H


def points():
    return np.array([v.co[:] for v in bm.verts])


def middle(P):
    return (P.min(axis=0) + P.max(axis=0)) / 2


def slab(P, y, half=0.006):
    return P[np.abs(P[:, 1] - y) < half]


P = points()
# The trunk's axis: the middle of its sections at the hips and at the neck's foot, as the game's pelvis and neck points.
pelvis = middle(slab(P[np.abs(P[:, 2]) < 0.08], J['pelvis'][1]))
pelvis[1:] = [J['pelvis'][1], 0]
neck = middle(slab(P[np.abs(P[:, 2]) < 0.04], J['neck'][1]))
neck[1:] = [J['neck'][1], 0]
head = middle(slab(P[np.abs(P[:, 2]) < 0.06], J['head'][1]))
head[1:] = [J['head'][1], 0]
joints = {'pelvis': pelvis, 'neck': neck, 'head': head}
# The crotch: the lowest point on the middle line.
mid = P[np.abs(P[:, 2]) < 0.004]
crotch = mid[mid[:, 1] > J['knee' if 'knee' in J else 'lKnee'][1] + 0.05][:, 1].min()

turned = {}
for side, sign in (('l', 1), ('r', -1)):
    # The leg: knee and ankle at the game's heights, in the middle of the leg's sections; the hip on the line up the thigh.
    leg = P[(P[:, 2] * sign > 0.005) & (P[:, 1] < crotch)]
    knee = middle(slab(leg, J[f'{side}Knee'][1]))
    knee[1] = J[f'{side}Knee'][1]
    ankle = middle(slab(leg, J[f'{side}Foot'][1] + 0.03))
    ankle[1] = J[f'{side}Foot'][1]
    upper_thigh = middle(slab(leg, crotch - 0.03))
    up = (upper_thigh - knee) / (upper_thigh[1] - knee[1])
    hip = knee + up * (J[f'{side}Hip'][1] - knee[1])
    hip[0] = pelvis[0]
    joints.update({f'{side}Hip': hip, f'{side}Knee': knee, f'{side}Foot': ankle})
    # The arm as modelled: the shoulder joint at the game's height and breadth (a line fitted through an arm held out this far
    # misses the joint by centimetres for a millimetre's slope), fore and aft on the line through the arm's points well
    # outside the trunk (their principal axis); the arm's direction from the joint to their middle; its reach to the farthest
    # fingertip.
    arm = P[(P[:, 2] * sign > 0.17) & (P[:, 1] > crotch)]
    centre = arm.mean(axis=0)
    line = np.linalg.svd(arm - centre)[2][0]
    shoulder = np.array(J[f'{side}Shoulder'], float)
    shoulder[0] = (centre + line * (shoulder[2] - centre[2]) / line[2])[0]
    direction = (centre - shoulder) / np.linalg.norm(centre - shoulder)
    reach = ((arm - shoulder) @ direction).max()
    scale = reach / (BASE['upperArm'] + BASE['forearm'] + BASE['hand'])
    target = np.array([0, -math.cos(BASE['armAngle']), sign * math.sin(BASE['armAngle'])])
    turned[side] = dict(shoulder=shoulder, direction=direction, target=target, scale=scale, reach=reach)
    print('ARM', side, 'shoulder', shoulder.round(4), 'out from hanging', round(math.degrees(math.acos(-direction[1])), 1), 'reach', round(reach, 4), 'scale', round(scale, 3))
print('JOINTS', {k: v.round(4).tolist() for k, v in joints.items()}, 'crotch', round(crotch, 4))


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def rotate(vectors, axis, angles):
    # Rodrigues, each vector by its own angle about one unit axis.
    c, s = np.cos(angles)[:, None], np.sin(angles)[:, None]
    return vectors * c + np.cross(axis, vectors) * s + axis * (vectors @ axis)[:, None] * (1 - c)


def arm_axis(P, s, d, upper, sign):
    # The upper arm's own centre line: through the middles of its sections (points within 6 cm of the guessed axis, from a fifth
    # of the way down to the elbow), as a point and a direction; and its radius, the median distance from that line.
    rel = P - s
    along = rel @ d
    across = np.linalg.norm(rel - np.outer(along, d), axis=1)
    near = (P[:, 2] * sign > 0) & (across < 0.06)
    centres = []
    for share in np.linspace(0.2, 0.95, 10):
        ring = near & (np.abs(along - share * upper) < upper * 0.04)
        if ring.sum() >= 4:
            centres.append(P[ring].mean(axis=0))
    centres = np.array(centres)
    middle = centres.mean(axis=0)
    line = np.linalg.svd(centres - middle)[2][0]
    line = line if line @ d > 0 else -line
    rel = P - middle
    along = rel @ line
    across = np.linalg.norm(rel - np.outer(along, line), axis=1)
    return middle, line, np.median(across[near & (np.abs((P - s) @ line - upper * 0.5) < upper * 0.2)])


# Turn each arm down into the bind pose about its shoulder joint, by the weight (BASE turnAlong, turnAcross): measured on the
# upper arm's own centre line and turned again by what is left, until it lies on the rig's line (BASE turnRounds); the joint
# moved fore and aft onto that line.
P = points()
P0 = P.copy()
for side, sign in (('l', 1), ('r', -1)):
    arm = turned[side]
    s, d, target = arm['shoulder'], arm['direction'], arm['target']
    upper = BASE['upperArm'] * arm['scale']
    # The limb: the points out beyond the trunk in the pose as modelled (the arm held well clear of it) and all of the arm's
    # root near its axis (the weight's `near`), kept by index through the turns.
    out_arm = (P[:, 2] * sign > BASE['clearOfTrunk']) & (P[:, 1] > crotch)
    for _ in range(BASE['turnRounds']):
        middle, d, radius = arm_axis(P, s, d, upper, sign)
        s[0] = (middle + d * ((s - middle) @ d))[0]
        rel = P - s
        along = rel @ d
        across = np.linalg.norm(rel - np.outer(along, d), axis=1)
        near = 1 - smoothstep(BASE['turnAcross'][0] * radius, BASE['turnAcross'][1] * radius, across)
        whole = np.where(out_arm, smoothstep(*BASE['turnWhole'], along / upper), 0)
        weight = smoothstep(*BASE['turnAlong'], along / upper) * np.maximum(near, whole) * (P[:, 2] * sign > 0)
        axis = np.cross(d, target)
        if np.linalg.norm(axis) < 1e-6:
            break
        axis /= np.linalg.norm(axis)
        angle = math.acos(np.clip(d @ target, -1, 1))
        print('TURN', side, round(math.degrees(angle), 2), 'shoulder x', round(s[0], 4), 'radius', round(radius, 4))
        P = s + rotate(rel, axis, weight * angle)
        d = target
    arm['radius'] = radius
    elbow = s + target * upper
    # The forearm straightened onto the same line about the elbow (the rig's forearm runs on from the upper arm in the bind
    # pose; a modelled arm carries a bend and a carrying angle), by a weight rising across the elbow (BASE elbowTurn).
    fore = BASE['forearm'] * arm['scale']
    rel = P - elbow
    along = rel @ target
    across = np.linalg.norm(rel - np.outer(along, target), axis=1)
    limb = out_arm
    line = arm_axis(P, elbow, target, fore, sign)[1]
    axis = np.cross(line, target)
    if np.linalg.norm(axis) > 1e-6:
        axis /= np.linalg.norm(axis)
        weight = smoothstep(*BASE['elbowTurn'], along / fore) * limb
        P = elbow + rotate(rel, axis, weight * math.acos(np.clip(line @ target, -1, 1)))
    print('FOREARM', side, 'straightened by', round(math.degrees(math.acos(np.clip(line @ target, -1, 1))), 1))
    wrist_reach = (BASE['upperArm'] + BASE['forearm']) * arm['scale']
    joints[f'{side}Shoulder'] = s
    joints[f'{side}Elbow'] = elbow
    # The rig's hand point is the fist, whose back the loft's bare forearm runs into at `wristAt` of the way from the elbow
    # (loftbody.js): the mesh's wrist is put there.
    joints[f'{side}Hand'] = elbow + target * (wrist_reach - upper) / BASE['wristAt']
# The shoulder's turn smoothed over the surface (the cap and the armpit fold where the weight changes quickly): the move each
# point made, averaged with its neighbours' (BASE shoulderSmooth: within this reach of a shoulder joint, over this breadth).
reach, breadth = BASE['shoulderSmooth']
bm.verts.ensure_lookup_table()
edges = np.array([[e.verts[0].index, e.verts[1].index] for e in bm.edges])
zone = np.zeros(len(P), bool)
for side in ('l', 'r'):
    zone |= np.linalg.norm(P0 - turned[side]['shoulder'], axis=1) < reach
lengths = np.linalg.norm(P0[edges[:, 0]] - P0[edges[:, 1]], axis=1)
degree = np.maximum(np.bincount(edges.ravel(), minlength=len(P)), 1)[:, None]
move = P - P0
for _ in range(int(round((breadth / lengths.mean()) ** 2))):
    total = np.zeros_like(move)
    np.add.at(total, edges[:, 0], move[edges[:, 1]])
    np.add.at(total, edges[:, 1], move[edges[:, 0]])
    move[zone] += 0.5 * (total[zone] / degree[zone] - move[zone])
P = P0 + move
for v, p in zip(bm.verts, P):
    v.co = Vector(p)

# The wrist, where the hand is cut off: the tables' length from the shoulder, on the arm's own scale (a search for the narrowest
# section found the forearm's middle as often as the wrist: the forearm's flat section reads narrow end on).
for side in ('l', 'r'):
    arm = turned[side]
    arm['wrist'] = (BASE['upperArm'] + BASE['forearm']) * arm['scale']


def cut(point, normal, keep_near=None):
    # Everything beyond the plane (on the normal's side) goes; `keep_near` limits the cut to points that test true.
    geom = [f for f in bm.faces if keep_near is None or keep_near(np.array(f.calc_center_median()[:]))]
    edges = list({e for f in geom for e in f.edges})
    verts = list({v for f in geom for v in f.verts})
    bmesh.ops.bisect_plane(bm, geom=verts + edges + geom, plane_co=Vector(point), plane_no=Vector(normal), clear_outer=True)


neck_axis = joints['head'] - joints['neck']
cut(joints['neck'] + neck_axis * BASE['neckCut'], neck_axis / np.linalg.norm(neck_axis))
for side, sign in (('l', 1), ('r', -1)):
    arm = turned[side]
    s, target = arm['shoulder'], arm['target']
    cut(s + target * arm['wrist'], target, lambda c, s=s, target=target, sign=sign, r=arm['radius']: c[2] * sign > 0 and (c - s) @ target > arm['reach'] * 0.3 and np.linalg.norm((c - s) - ((c - s) @ target) * target) < r * 4)
    knee, ankle = joints[f'{side}Knee'], joints[f'{side}Foot']
    shin = ankle - knee
    cut(knee + shin * BASE['ankleCut'], shin / np.linalg.norm(shin), lambda c, sign=sign: c[2] * sign > 0 and c[1] < 0.2)
# Only the body itself: loose pieces left by the cuts go.
keep_body()
bmesh.ops.triangulate(bm, faces=bm.faces[:])
cut_mesh = bpy.data.meshes.new('cut')
bm.to_mesh(cut_mesh)
print('CUT', len(cut_mesh.vertices), len(cut_mesh.polygons))
# The cut mesh at full resolution, before decimating, for the proof sheet (tools/blender/baseproof.py): <out>-cut.obj, in the
# game's frame and units of height.
with open(OUT.replace('.json', '-cut.obj'), 'w') as obj_file:
    for v in cut_mesh.vertices:
        obj_file.write('v %.5f %.5f %.5f\n' % tuple(v.co))
    for poly in cut_mesh.polygons:
        obj_file.write('f ' + ' '.join(str(i + 1) for i in poly.vertices) + '\n')

PARTS = ['trunk', 'neck', 'lUpper', 'lFore', 'rUpper', 'rFore', 'lThigh', 'lShin', 'rThigh', 'rShin']


def segment(P, edges):
    # Each point's part: the neck above its foot and near its axis; an arm beyond its shoulder joint and near its axis, or far
    # down it; a leg below the crotch; the trunk the rest. Then each part's share diffused over the mesh, so a point near a joint
    # carries both of its parts (BASE blend).
    part = np.zeros(len(P), int)
    rel = P - joints['neck']
    up = neck_axis / np.linalg.norm(neck_axis)
    t_neck = rel @ up
    r_neck = np.linalg.norm(rel - np.outer(t_neck, up), axis=1)
    part[(t_neck > 0) & (r_neck < 0.045)] = PARTS.index('neck')
    for side, sign in (('l', 1), ('r', -1)):
        arm = turned[side]
        rel = P - arm['shoulder']
        along = rel @ arm['target']
        across = np.linalg.norm(rel - np.outer(along, arm['target']), axis=1)
        upper = BASE['upperArm'] * arm['scale']
        # (The deltoid's cap is the arm's, as the loft's arm starts inside the shoulder: from one arm's radius above the joint,
        # within the cap's breadth of the axis there; further down, within the arm's own girth and a little.)
        is_arm = (P[:, 2] * sign > 0) & (along > -arm['radius']) & (across < arm['radius'] * np.where(along > upper * 0.15, 2.0, 1.7))
        part[is_arm & (along <= upper)] = PARTS.index(f'{side}Upper')
        part[is_arm & (along > upper)] = PARTS.index(f'{side}Fore')
        # (The legs begin where the loft's trunk ends, `trunkEnd` below the hip joint, or at the crotch if that is higher: the
        # buttocks' lower half is the thigh's, as the clothes on the thigh cover it.)
        hip_line = joints['pelvis'][1] + BASE['trunkEnd'] * (joints['neck'][1] - joints['pelvis'][1])
        # (Points on the middle line itself go to the left leg, so none is left on the trunk below its end.)
        is_leg = ((P[:, 2] * sign > 0) | ((P[:, 2] == 0) & (sign > 0))) & (P[:, 1] < max(crotch, hip_line)) & ~is_arm
        part[is_leg & (P[:, 1] >= joints[f'{side}Knee'][1])] = PARTS.index(f'{side}Thigh')
        part[is_leg & (P[:, 1] < joints[f'{side}Knee'][1])] = PARTS.index(f'{side}Shin')
    share = np.zeros((len(P), len(PARTS)))
    share[np.arange(len(P)), part] = 1
    lengths = np.linalg.norm(P[edges[:, 0]] - P[edges[:, 1]], axis=1)
    # Diffusion spreads as the square root of its steps: steps for the blend's reach at this mesh's edge length.
    steps = max(1, int(round((BASE['blend'] / lengths.mean()) ** 2)))
    degree = np.bincount(edges.ravel(), minlength=len(P)).astype(float)
    for _ in range(steps):
        total = np.zeros_like(share)
        np.add.at(total, edges[:, 0], share[edges[:, 1]])
        np.add.at(total, edges[:, 1], share[edges[:, 0]])
        share = 0.5 * share + 0.5 * total / np.maximum(degree, 1)[:, None]
    order = np.argsort(-share, axis=1)
    first, second = order[:, 0], order[:, 1]
    a = share[np.arange(len(P)), first]
    b = share[np.arange(len(P)), second]
    blend = np.where(b > 1e-3, b / (a + b), 0)
    second = np.where(b > 1e-3, second, first)
    return first, second, blend, steps


out = {'sex': SEX, 'parts': PARTS, 'joints': {k: v.round(5).tolist() for k, v in joints.items()}, 'meshes': {}}
total = len(cut_mesh.polygons)
for key, count in BASE['triangles'].items():
    ob = bpy.data.objects.new(f'base-{key}', cut_mesh.copy())
    bpy.context.scene.collection.objects.link(ob)
    decimate = ob.modifiers.new('decimate', 'DECIMATE')
    decimate.ratio = count / total
    decimate.use_symmetry = True
    decimate.symmetry_axis = 'Z'
    decimate.use_collapse_triangulate = True
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    P = np.array([v.co[:] for v in me.vertices])
    tris = np.array([p.vertices[:] for p in me.polygons])
    edges = np.array([e.vertices[:] for e in me.edges])
    first, second, blend, steps = segment(P, edges)
    out['meshes'][key] = {
        'positions': P.round(5).ravel().tolist(),
        'triangles': tris.ravel().tolist(),
        'part': first.tolist(),
        'part2': second.tolist(),
        'blend': blend.round(3).tolist(),
    }
    print('MESH', key, len(P), 'points', len(tris), 'triangles', 'blend steps', steps, 'parts', {PARTS[i]: int((first == i).sum()) for i in range(len(PARTS))})
    if CHECK and key == 'full':
        # A check: the parts in colours, front and side.
        colours = np.array([[0.8, 0.7, 0.6], [0.9, 0.9, 0.3], [0.3, 0.6, 0.9], [0.2, 0.3, 0.8], [0.9, 0.4, 0.3], [0.7, 0.2, 0.2], [0.4, 0.8, 0.4], [0.2, 0.5, 0.2], [0.8, 0.4, 0.8], [0.5, 0.2, 0.5]])
        mixed = colours[first] * (1 - blend[:, None]) + colours[second] * blend[:, None]
        attr = me.color_attributes.new('part', 'FLOAT_COLOR', 'POINT')
        for i, c in enumerate(mixed):
            attr.data[i].color = (*c, 1)
        view = bpy.data.objects.new('check', me)
        bpy.context.scene.collection.objects.link(view)
json.dump(out, open(OUT, 'w'))

if CHECK:
    scene = bpy.context.scene
    for o in scene.objects:
        if o.type == 'MESH':
            o.hide_render = o.name != 'check'
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.display.shading.light = 'STUDIO'
    scene.display.shading.color_type = 'VERTEX'
    scene.display.shading.show_cavity = True
    scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage = 900, 900, 100
    cam_data = bpy.data.cameras.new('check')
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = 1.1
    cam = bpy.data.objects.new('check-cam', cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    # The game frame in Blender's axes: y up becomes Blender's y here (the mesh was moved into game axes), so look along -x and z.
    for label, location, rotation in (('front', (3, 0.5, 0), (0, math.pi / 2, 0)), ('side', (0, 0.5, 3), (0, 0, 0))):
        cam.location = location
        cam.rotation_euler = rotation
        scene.render.filepath = CHECK.replace('.png', f'-{label}.png')
        bpy.ops.render.render(write_still=True)
