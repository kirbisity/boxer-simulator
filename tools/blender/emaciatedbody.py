# The starved body from the emaciated reference itself (ax_model.blend, object "anabelle.001", 21k points;
# 2026-11-11: "simply use the provided emaciated model"): for every point of the base meshes, the whole of her surface
# along the ring's radius at its place on its part (t along, its angle round), against the female base's there, arms included:
# her girth and her contour, not her contour alone (tools/blender/emaciated.py kept only the contour, each ring's mean taken
# off). The game blends the base body to this by how wasted a body is (src/basebody.js, loftbody.js baseWasting).
#
#   Blender -b ax_model.blend --python tools/blender/emaciatedbody.py -- <ref.json> <base-female.json> <base-male.json> <out.json> <her-joints.json>
#
# her-joints.json: her limbs' joints placed by eye (shoulder, elbow, wrist, hip, knee, ankle, each side) in her mesh's frame.
#
# Her pose: she stands with one hand on her hip and her weight on one leg. She is re-posed: an armature on her placed joints,
# weighted by geodesic distance from seeds on its bones (Blender's bone heat finds no solution on her mesh), her arms brought
# to the base's hang and her legs straightened; then each base point's place on its part (t, angle) is carried to the same
# place on hers and a ray from her part's axis finds her surface. The man's: her surface with his trunk's width and flat chest
# (see male_width).

import json
import math
import sys

import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

args = sys.argv[sys.argv.index('--') + 1:]
REF = json.load(open(args[0]))
FEMALE = json.load(open(args[1]))
MALE = json.load(open(args[2]))
OUT = args[3]

EMACIATED = {
    # The parts the delta covers (the arms take the game's own thinning).
    # (The upper arms too, from her free arm, but not the forearms: hers lies against her hip, merged with it in every section.)
    'parts': ['trunk', 'neck', 'lThigh', 'lShin', 'rThigh', 'rShin', 'lUpper', 'rUpper', 'lFore', 'rFore'],
    # Her limbs' joints, placed by eye (round 19).
    'placedJoints': args[4],
    # Rounds of neighbour averaging over her weights (see the re-pose).
    'weightSmooth': 6,
    # Her upper arm's section on her free side: the outermost this much (fractions of height, 5.5 cm) of the section there.
    'armWide': 0.033,
    # The farthest a ray looks for her surface (fractions of height: 0.2 is past any part's radius).
    'reach': 0.2,
    # The most a delta may be (fractions of height, 7 cm: her waist and belly lie up to 6 cm inside the base body's before each
    # ring's mean is taken off): a ray that slips out between the legs or past the neck finds nothing
    # nearer than this and gives no delta.
    'most': 0.08,
    # Rings binned along each part (t) for their middle, and smoothing passes over the mesh after (the rays' noise).
    'bin': 0.04, 'smooth': 8, 'fill': 40, 'capSmooth': 30, 'capNear': (0.06, 0.1),
    # The man's adjustments (see male_width below): his trunk's width over hers clamped to this, and his flat chest over this
    # band of the trunk's t, within this angle of its front (radians: about 50 degrees either side).
    'sexWidth': (0.9, 1.1), 'chestBand': (0.6, 0.9), 'chestFront': 0.9,
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
AXES = {'trunk': ('pelvis', 'neck'), 'neck': ('neck', 'head'), 'lThigh': ('lHip', 'lKnee'), 'lShin': ('lKnee', 'lFoot'), 'rThigh': ('rHip', 'rKnee'), 'rShin': ('rKnee', 'rFoot'),
        'lUpper': ('lShoulder', 'lElbow'), 'lFore': ('lElbow', 'lHand'), 'rUpper': ('rShoulder', 'rElbow'), 'rFore': ('rElbow', 'rHand')}
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
ZSHIFT = float(np.median(hips[:, 2]))
V[:, 2] -= ZSHIFT
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
# Her free arm's joints: the middle of its section (the points out past the gap from her trunk's) at heights down it, the
# upper arm's line carried up to the shoulder's height, the forearm's down to the hand's.
def arm_middle(y):
    # (The outermost `armWide` of her section on that side: her upper arm lies against her ribs, no gap between them.)
    P = slab(V, y, 0.006)
    P = P[P[:, 2] * FREE > 0]
    out = np.abs(P[:, 2])
    return middle(P[out > out.max() - EMACIATED['armWide']])
FREE_SIDE = 'l' if FREE == 1 else 'r'
ye, ys = J[f'{FREE_SIDE}Elbow'][1], J[f'{FREE_SIDE}Shoulder'][1]
u1, u2 = arm_middle(0.71), arm_middle(0.655)
shoulder = u1 + (u1 - u2) * (ys - u1[1]) / (u1[1] - u2[1])
elbow = u2 + (u2 - u1) * (ye - u2[1]) / (u2[1] - u1[1])
joints.update({f'{FREE_SIDE}Shoulder': shoulder, f'{FREE_SIDE}Elbow': elbow})
print('HER ARM', FREE_SIDE, shoulder.round(4).tolist(), elbow.round(4).tolist())
print('EMACIATED', 'height (blend units)', round(H, 3), 'free side', FREE, elbows, 'straight leg', STRAIGHT, {k: round(v, 4) for k, v in bend.items()}, {k: v.round(4).tolist() for k, v in joints.items()})


# ---- Re-posed (2026-11-11: "align that through the regular posture and then just use it") -------------------------
# An armature fitted to her own joints, bound with Blender's automatic (bone heat) weights; her arms brought to the base
# model's hang and her legs to its stance, each bone turned from where it points on her to where the female base's points.
# Her limbs' joints placed by eye (scratchpad joints/her-joints.json, in her.npz's raw frame: the free arm and the standing
# leg on -z, the game's right; the hip-hand arm and the bent leg on +z, its left).
PLACED = json.load(open(EMACIATED['placedJoints']))
FREE_SIDE, HIP_SIDE, STRAIGHT = 'r', 'l', 'r'
FREE = -1


def placed(key):
    g = (np.array(PLACED[key]) - [0, low[1], 0]) / H
    g[2] -= ZSHIFT
    return g


for side, kind in (('r', 'free'), ('l', 'hip')):
    joints[f'{side}Shoulder'], joints[f'{side}Elbow'], joints[f'{side}Hand'] = placed(f'shoulder_{kind}'), placed(f'elbow_{kind}'), placed(f'wrist_{kind}')
for side, kind in (('r', 'stand'), ('l', 'bent')):
    joints[f'{side}Hip'], joints[f'{side}Knee'], joints[f'{side}Foot'] = placed(f'hip_{kind}'), placed(f'knee_{kind}'), placed(f'ankle_{kind}')
# (Her trunk's line through the placed joints' middles: the hips' at the pelvis, the shoulders' at the neck. Her weight on one
# leg tilts her pelvis, and her middle measured by her hips' points sat 3-6 cm to one side of them.)
joints['pelvis'][2] = (joints['lHip'][2] + joints['rHip'][2]) / 2
joints['neck'][2] = (joints['lShoulder'][2] + joints['rShoulder'][2]) / 2
joints['head'][2] = joints['neck'][2]
print('PLACED', {k: v.round(3).tolist() for k, v in joints.items()})


def to_world(g):
    return Vector((-(g[2] + ZSHIFT) * H, -g[0] * H, g[1] * H + low[1]))


def to_game(w):
    return np.array([-w[1] / H, (w[2] - low[1]) / H, -w[0] / H - ZSHIFT])


BONES = [('trunk', 'pelvis', 'neck', None), ('neck', 'neck', 'head', 'trunk')]
for side in ('l', 'r'):
    BONES += [(f'{side}Upper', f'{side}Shoulder', f'{side}Elbow', 'trunk'), (f'{side}Fore', f'{side}Elbow', f'{side}Hand', f'{side}Upper'),
              (f'{side}Thigh', f'{side}Hip', f'{side}Knee', 'trunk'), (f'{side}Shin', f'{side}Knee', f'{side}Foot', f'{side}Thigh')]
arm_data = bpy.data.armatures.new('her_rig')
rig_obj = bpy.data.objects.new('her_rig', arm_data)
bpy.context.scene.collection.objects.link(rig_obj)
bpy.context.view_layer.objects.active = rig_obj
bpy.ops.object.mode_set(mode='EDIT')
for name, a, b, parent in BONES:
    eb = arm_data.edit_bones.new(name)
    eb.head, eb.tail = to_world(joints[a]), to_world(joints[b])
    if parent:
        eb.parent = arm_data.edit_bones[parent]
bpy.ops.object.mode_set(mode='OBJECT')
for o in bpy.context.view_layer.objects:
    o.select_set(False)
obj.select_set(True)
rig_obj.select_set(True)
bpy.context.view_layer.objects.active = rig_obj
bpy.ops.object.parent_set(type='ARMATURE_NAME')
# (Blender's bone heat finds no solution on her mesh (it is not one closed surface: her eyes and teeth are separate), so her
# weights are made the way bone heat spreads them: each point goes to the bone whose seeds it is nearest to over her surface
# (geodesic distance along her edges, so her upper arm lying against her ribs is not the ribs' and the ribs are not the arm's:
# they meet only at the armpit), then the hand-over between bones softened by `weightSmooth` rounds of neighbour averaging.)
import heapq
WV = np.array([(obj.matrix_world @ v.co)[:] for v in obj.data.vertices])
nbr = [[] for _ in range(len(WV))]
for e in obj.data.edges:
    i, j = e.vertices
    d = float(np.linalg.norm(WV[i] - WV[j]))
    nbr[i].append((j, d)); nbr[j].append((i, d))
names = [b[0] for b in BONES]
dist = np.full(len(WV), np.inf); owner = np.full(len(WV), -1)
heap = []
for k, (name, a_, b_, parent) in enumerate(BONES):
    A, B = np.array(to_world(joints[a_])), np.array(to_world(joints[b_]))
    # (An arm's seeds on its outer side, a little out from its bone away from her middle: her free arm lies against her ribs,
    # and the point nearest its bone may be a rib's. The armpit's plane keeps the rest apart: a point above the shoulder or
    # inside it across never seeds an arm.)
    out_dir = np.zeros(3)
    if 'Upper' in name or 'Fore' in name:
        mid_w = np.array(to_world(np.array([0, 0.5, 0])))
        out_dir = np.array([mid_w[0], 0, 0]) - np.array([(A[0] + B[0]) / 2, 0, 0])
        out_dir = -out_dir / (np.linalg.norm(out_dir) or 1)
    for f in np.linspace(0.25, 0.75, 5):
        q = A + (B - A) * f + out_dir * 0.015 * H
        i = int(np.argmin(np.linalg.norm(WV - q, axis=1)))
        if dist[i] > 0:
            dist[i] = 0; owner[i] = k; heapq.heappush(heap, (0.0, i))
while heap:
    d, i = heapq.heappop(heap)
    if d > dist[i]:
        continue
    for j, w in nbr[i]:
        if d + w < dist[j]:
            dist[j] = d + w; owner[j] = owner[i]; heapq.heappush(heap, (d + w, j))
Wt = np.zeros((len(WV), len(BONES)))
Wt[owner >= 0, owner[owner >= 0]] = 1
for _ in range(EMACIATED['weightSmooth']):
    nxt = Wt.copy()
    for i in range(len(WV)):
        if nbr[i]:
            nxt[i] = 0.5 * Wt[i] + 0.5 * np.mean([Wt[j] for j, _ in nbr[i]], axis=0)
    Wt = nxt
for k, name in enumerate(names):
    g = obj.vertex_groups.get(name) or obj.vertex_groups.new(name=name)
    for i in np.nonzero(Wt[:, k] > 0.001)[0]:
        g.add([int(i)], float(Wt[i, k]), 'REPLACE')
# The targets: each bone's direction on the female base (its rest pose, arms at the game's hang).
FJ = {k: np.array(v) for k, v in FEMALE['joints'].items()}
bpy.context.view_layer.objects.active = rig_obj
bpy.ops.object.mode_set(mode='POSE')
for name, a, b, parent in BONES:
    if name in ('trunk', 'neck'):
        continue
    bpy.context.view_layer.update()
    pb = rig_obj.pose.bones[name]
    head_w = rig_obj.matrix_world @ pb.head
    tail_w = rig_obj.matrix_world @ pb.tail
    current = (tail_w - head_w).normalized()
    target_g = FJ[b] - FJ[a]
    target = (to_world(target_g) - to_world(np.zeros(3))).normalized()
    q = current.rotation_difference(target)
    print('DIR', name, [round(x, 3) for x in current], [round(x, 3) for x in target], 'game', [round(float(x), 3) for x in target_g / np.linalg.norm(target_g)])
    M = rig_obj.matrix_world @ pb.matrix
    from mathutils import Matrix
    R = Matrix.Translation(head_w) @ q.to_matrix().to_4x4() @ Matrix.Translation(-head_w)
    pb.matrix = rig_obj.matrix_world.inverted() @ (R @ M)
    bpy.context.view_layer.update()
    print('AFTER', name, [round(x, 3) for x in ((rig_obj.matrix_world @ pb.tail) - (rig_obj.matrix_world @ pb.head)).normalized()])
bpy.context.view_layer.update()
print('POSE', {pb.name: [round(x, 3) for x in pb.rotation_quaternion] for pb in rig_obj.pose.bones})
bpy.ops.object.mode_set(mode='OBJECT')
dg = bpy.context.evaluated_depsgraph_get()
posed = obj.evaluated_get(dg).to_mesh()
PV = np.array([(obj.matrix_world @ v.co)[:] for v in posed.vertices])
V = np.stack([-PV[:, 1], PV[:, 2], -PV[:, 0]], axis=1)
V = (V - [0, low[1], 0]) / H
V[:, 2] -= ZSHIFT
for name, a, b, parent in BONES:
    pb = rig_obj.pose.bones[name]
    joints[a] = to_game(rig_obj.matrix_world @ pb.head)
    joints[b] = to_game(rig_obj.matrix_world @ pb.tail)
posed.calc_loop_triangles()
REPOSE = OUT.replace('.json', '-repose.npz')
np.savez(REPOSE, V=V, T=np.array([t.vertices[:] for t in posed.loop_triangles]))
print('REPOSED', REPOSE)
# Her re-posed body rendered, to be checked by eye before anything is read from it.
import math as _m
from mathutils import Vector as _V
scene = bpy.context.scene
for o in bpy.data.objects:
    if o.type in ('MESH', 'CURVE') and o != obj:
        o.hide_render = True
rig_obj.hide_render = True
scene.render.engine = 'BLENDER_WORKBENCH'
scene.display.shading.light = 'STUDIO'
scene.display.shading.color_type = 'SINGLE'
scene.display.shading.single_color = (0.78, 0.55, 0.39)
scene.render.resolution_x, scene.render.resolution_y = 500, 900
cx, cy = float(PV[:, 0].mean()), float(PV[:, 1].mean())
target = (cx, cy, low[1] + 0.5 * H)
cam_data = bpy.data.cameras.new('c'); cam_data.type = 'ORTHO'; cam_data.ortho_scale = 1.05 * H
cam = bpy.data.objects.new('c', cam_data); scene.collection.objects.link(cam); scene.camera = cam
for label, ang in (('front', 0), ('front3q', 35), ('side', 90)):
    a = _m.radians(ang); d = 3 * H
    cam.location = (target[0] - _m.sin(a) * d, target[1] - _m.cos(a) * d, target[2])
    cam.rotation_euler = (_V(target) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = OUT.replace('.json', f'-repose-{label}.png')
    bpy.ops.render.render(write_still=True)
if __import__('os').environ.get('REPOSE_ONLY'):
    raise SystemExit


def read_as(part, phi):
    # Where a base point of `part` at angle `phi` is read on her: her own part and angle, or the mirrored one (see FREE, STRAIGHT).
    if part in ('trunk', 'neck'):
        return part, (phi if math.sin(phi) * FREE >= 0 else -phi)
    # (Re-posed, each limb is read on her own limb of that side.)
    return part, phi
posed.calc_loop_triangles()
tris = np.array([t.vertices[:] for t in posed.loop_triangles])
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


def trunk_widths(base):
    # A base body's trunk half-width (across, its width axis) by its t: the widest of its points in each `bin` of t,
    # smoothed over three bins.
    m = base['meshes']['full']
    P = np.array(m['positions']).reshape(-1, 3)
    trunk_index = base['parts'].index('trunk')
    rows = {}
    for vertex in range(len(P)):
        if m['part'][vertex] != trunk_index or m['blend'][vertex] > 0:
            continue
        t, phi, r = place(base['joints'], 'trunk', P[vertex])
        b = int(math.floor(t / EMACIATED['bin']))
        rows[b] = max(rows.get(b, 0), abs(r * math.sin(phi)))
    return lambda t: np.mean([rows.get(int(math.floor(t / EMACIATED['bin'])) + k, 0) or rows.get(int(math.floor(t / EMACIATED['bin'])), 1e-3) for k in (-1, 0, 1)])


# The man's starved body (2026-11-11: "just use the same emaciated body and adjust it to the male body's shape a
# bit ... the size of the shoulder and the hip"): her surface, with the trunk's width (across, not its depth) scaled at each t
# by his base trunk's over the female base's there (`sexWidth`, clamped: his wider shoulders and ribcage, his narrower hips),
# and her chest flattened to his base's front where her breasts stand out past it (`chestBand`, t of the trunk, the front
# within `chestFront` of the middle). His limbs take her radii; his height and limb lengths are his skeleton's.
male_width = trunk_widths(MALE)
female_width = trunk_widths(FEMALE)



def to_frame(js, part, p):
    a, axis, length, depth, width = frame(js, part)
    rel = p - a
    return np.array([rel @ axis / length, rel @ depth, rel @ width])


def from_frame(js, part, c):
    a, axis, length, depth, width = frame(js, part)
    return a + axis * c[0] * length + depth * c[1] + width * c[2]


ROOT = {'lUpper': 'lShoulder', 'lFore': 'lShoulder', 'rUpper': 'rShoulder', 'rFore': 'rShoulder', 'lThigh': 'lHip', 'lShin': 'lHip', 'rThigh': 'rHip', 'rShin': 'rHip'}


def sex_width(base, t):
    if base['sex'] == 'female':
        return 1.0
    return min(EMACIATED['sexWidth'][1], max(EMACIATED['sexWidth'][0], male_width(t) / max(female_width(t), 1e-4)))


def read_her(part, phi):
    # Her free arm read for both (her other is re-posed from her hip, its shoulder shrugged), mirrored for the left.
    if part in ('lUpper', 'lFore'):
        return 'r' + part[1:], -phi, True
    her_part, her_phi = read_as(part, phi)
    return her_part, her_phi, her_phi != phi


def girdle(base, part):
    # Where her limb's root joint sits on her trunk (t along it, out fore and aft, out across; a man's across by his trunk's
    # width), placed on the base's trunk, less the base's own joint there: her shoulders lower and further in, her hips.
    if part not in ROOT:
        return np.zeros(3)
    own = ROOT[part]
    mirrored = own == 'lShoulder'
    c = to_frame(joints, 'trunk', np.array(joints['rShoulder' if mirrored else own]))
    if mirrored:
        c[2] = -c[2]
    c[2] *= sex_width(base, c[0])
    return from_frame(base['joints'], 'trunk', c) - np.array(base['joints'][ROOT[part]])


def frames_of(js, name):
    return frame(js, name)


def drop(base):
    # Her shoulders' line brought down to the base's: her shoulder joints stand up to 4.5 cm higher on her trunk than the base's
    # (whose arms D lowered), so above `DROP_FROM` (t of the trunk) her trunk is drawn down by the difference, eased in to the
    # shoulders' height and all of it above: her neck the longer, the slope of her shoulders kept, her arm's root on the bone.
    hers = to_frame(joints, 'trunk', np.array(joints['rShoulder']))[0]
    mine = to_frame(base['joints'], 'trunk', np.array(base['joints']['rShoulder']))[0]
    def remap(t):
        u = np.clip((t - DROP_FROM) / (hers - DROP_FROM), 0, 1)
        return t - (hers - mine) * u * u * (3 - 2 * u)
    return remap


DROP_FROM = 0.6


def aligned(base, shifted=True):
    # Her re-posed body laid on the base's skeleton: each of her points carried from each of her bones' frames to the base's
    # same bone (along it at its share of the bone's length, across at its own distance; a man's trunk across by his width),
    # by her weights; a limb's root shift (girdle) eased out down the limb.
    out = np.zeros_like(V)
    total = Wt.sum(axis=1)
    for k, (name, a_, b_, parent) in enumerate(BONES):
        w = Wt[:, k]
        sel = w > 1e-4
        ha, hax, hlen, hdep, hwid = frame(joints, name)
        ba, bax, blen, bdep, bwid = frame(base['joints'], name)
        rel = V[sel] - ha
        c0, c1, c2 = rel @ hax / hlen, rel @ hdep, rel @ hwid
        if name == 'trunk':
            c2 = c2 * np.array([sex_width(base, t) for t in c0])
            c0 = drop(base)(c0)
        p = ba + np.outer(c0 * blen, bax) + np.outer(c1, bdep) + np.outer(c2, bwid)
        if name in ROOT and shifted:
            down = np.clip(c0, 0, 1)
            ease = (1 - 0.5 * down) if name[1:] in ('Upper', 'Thigh') else 0.5 * (1 - down)
            p += np.outer(ease, girdle_own(base, name))
        out[sel] += w[sel, None] * p
    known = total > 1e-6
    out[known] /= total[known, None]
    out[~known] = V[~known]
    return out


def girdle_own(base, part):
    c = to_frame(joints, 'trunk', np.array(joints[ROOT[part]]))
    c[2] *= sex_width(base, c[0])
    c[0] = drop(base)(c[0])
    return from_frame(base['joints'], 'trunk', c) - np.array(base['joints'][ROOT[part]])


tri_owner = owner[tris[:, 0]]


def vertex_normals(P, T, passes=10):
    edges = np.concatenate([T[:, [0, 1]], T[:, [1, 2]], T[:, [2, 0]]])
    degree = np.maximum(np.bincount(edges.ravel(), minlength=len(P)), 1)
    Q = P.copy()
    for _ in range(passes):
        acc = np.zeros_like(Q)
        np.add.at(acc, edges[:, 0], Q[edges[:, 1]])
        np.add.at(acc, edges[:, 1], Q[edges[:, 0]])
        Q = 0.5 * Q + 0.5 * acc / degree[:, None]
    f = np.cross(Q[T[:, 1]] - Q[T[:, 0]], Q[T[:, 2]] - Q[T[:, 0]])
    n = np.zeros_like(P)
    for i in range(3):
        np.add.at(n, T[:, i], f)
    return n / np.maximum(np.linalg.norm(n, axis=1), 1e-12)[:, None]


NEAR = {'trunk': lambda s: ['neck', 'rUpper'], 'neck': lambda s: ['trunk'], 'Upper': lambda s: ['trunk'], 'Fore': lambda s: [s + 'Upper'], 'Thigh': lambda s: ['trunk'], 'Shin': lambda s: [s + 'Thigh']}
LINE = {'Upper': (0.4, 0.95), 'Fore': (0.1, 0.9), 'Thigh': (0.3, 0.9), 'Shin': (0.1, 0.9)}
LIMB_FROM = -0.3
SWAP = lambda name: ('r' + name[1:]) if name[0] == 'l' and name not in ('neck',) else name


def positions3d(base, key):
    # Each base point's place on her body laid on the base's skeleton (aligned): the nearest of her surface along the point's
    # (smoothed) normal, in or out, on her own parts that are the point's; her free side for both (her other arm's shoulder
    # shrugged, her other leg bent), mirrored. As a 3D offset from the point in units of height, in its part's frame.
    m = base['meshes'][key]
    P = np.array(m['positions']).reshape(-1, 3)
    T = np.array(m['triangles']).reshape(-1, 3)
    names = base['parts']
    # (Her limbs found on their own axes, the base's, unshifted: shifted, a ray from the far side of the base's arm met the
    # near side of hers. Each hit on a limb is shifted after, by its place down the limb.)
    A = aligned(base)
    A0 = aligned(base, shifted=False)
    groups = {}
    for k, name in enumerate([b[0] for b in BONES]):
        sel = tri_owner == k
        if sel.any():
            groups[name] = BVHTree.FromPolygons([Vector(p) for p in A], tris[sel].tolist())

    def shift_of(name, h):
        if True:
            return h
        down = min(1, max(0, to_frame(base['joints'], name, h)[0]))
        ease = (1 - 0.5 * down) if name[1:] in ('Upper', 'Thigh') else 0.5 * (1 - down)
        return h + girdle_own(base, name) * ease
    N = vertex_normals(P, T)
    # (A limb's points found by rays out from its middle line, the base's and hers each fitted through its own points (a line
    # in t over `LINE`): her limb sits up to a radius off the base's axis, and a ray along the base's normal from its far side
    # met the near side of hers, folding the limb flat.)
    def line(X, lo, hi, js, name):
        c = np.array([to_frame(js, name, x) for x in X])
        k = (c[:, 0] > lo) & (c[:, 0] < hi)
        fx = np.polyfit(c[k, 0], c[k, 1], 1)
        fy = np.polyfit(c[k, 0], c[k, 2], 1)
        return lambda t: (np.polyval(fx, t), np.polyval(fy, t))
    lines = {}
    for name in ('rUpper', 'rFore', 'rThigh', 'rShin'):
        lo, hi = LINE[name[1:]]
        lines[name] = (line(P[np.array(m['part']) == names.index(name)], lo, hi, base['joints'], name), line(A[owner == [b[0] for b in BONES].index(name)], lo, hi, base['joints'], name))
    out = np.zeros((len(P), 3))
    known = np.zeros(len(P), bool)
    stats = {'ray': 0, 'near': 0, 'any': 0, 'miss': 0}
    hows = np.zeros(len(P), int)
    most = EMACIATED['most']
    for vertex in range(len(P)):
        own = [names[m['part'][vertex]]] + ([names[m['part2'][vertex]]] if m['blend'][vertex] > 0 else [])
        mirror = own[0][0] == 'l' or (own[0] in ('trunk', 'neck') and P[vertex][2] > 0)
        flip = np.array([1, 1, -1.0]) if mirror else np.ones(3)
        q, n = P[vertex] * flip, N[vertex] * flip
        allowed = [SWAP(name) if mirror else name for name in own]
        # (And the parts beside them: her bones' share of her surface is not the base's (her neck's reaches down her chest).)
        allowed = list(dict.fromkeys(allowed + [near for name in allowed for near in NEAR[name[1:] if name[0] in 'lr' else name](name[0])]))
        best = None
        limb = SWAP(own[0]) if mirror else own[0]
        t_q = to_frame(base['joints'], limb, q)[0] if limb in lines else None
        if limb in lines and (limb[1:] in ('Fore', 'Shin') or t_q > LIMB_FROM):
            c = to_frame(base['joints'], limb, q)
            mine, hers = lines[limb]
            bx, by = mine(c[0])
            hx, hy = hers(c[0])
            phi = math.atan2(c[2] - by, c[1] - bx)
            a, axis, length, depth, width = frame(base['joints'], limb)
            origin = from_frame(base['joints'], limb, [c[0], hx, hy])
            hit = groups[limb].ray_cast(Vector(origin), Vector(depth * math.cos(phi) + width * math.sin(phi)), most)
            if hit[0] is not None:
                best = (shift_of(limb, np.array(hit[0][:])), 0.0)
        for name in (allowed if best is None else []):
            tree = groups.get(name)
            if tree is None:
                continue
            for d in (n, -n):
                hit = tree.ray_cast(Vector(q), Vector(d), most)
                if hit[0] is not None and (best is None or hit[3] < best[1]):
                    best = (shift_of(name, np.array(hit[0][:])), hit[3])
        how = 'ray'
        if best is None:
            how = 'near'
            for name in allowed:
                tree = groups.get(name)
                hit = tree.find_nearest(Vector(q), most) if tree else (None,)
                if hit[0] is not None and (best is None or hit[3] < best[1]):
                    best = (shift_of(name, np.array(hit[0][:])), hit[3])
        if best is None:
            how = 'any'
            for name, tree in groups.items():
                hit = tree.find_nearest(Vector(q), most)
                if hit[0] is not None and (best is None or hit[3] < best[1]):
                    best = (shift_of(name, np.array(hit[0][:])), hit[3])
        if best is None:
            stats['miss'] += 1
            continue
        stats[how] += 1
        hows[vertex] = ['ray', 'near', 'any'].index(how) + 1
        h = best[0] * flip
        if base['sex'] == 'male' and own[0] == 'trunk':
            t, phi, r_own = place(base['joints'], 'trunk', P[vertex])
            if EMACIATED['chestBand'][0] < t < EMACIATED['chestBand'][1] and abs(phi) < EMACIATED['chestFront']:
                c = to_frame(base['joints'], 'trunk', h)
                r = math.hypot(c[1], c[2])
                if r > r_own:
                    c[1:] *= r_own / r
                    h = from_frame(base['joints'], 'trunk', c)
        out[vertex] = h - P[vertex]
        known[vertex] = True
    edges = np.concatenate([T[:, [0, 1]], T[:, [1, 2]], T[:, [2, 0]]])
    for _ in range(EMACIATED['fill']):
        acc = np.zeros((len(P), 3)); count = np.zeros(len(P))
        np.add.at(acc, edges[:, 0], np.where(known[edges[:, 1]][:, None], out[edges[:, 1]], 0)); np.add.at(count, edges[:, 0], known[edges[:, 1]])
        np.add.at(acc, edges[:, 1], np.where(known[edges[:, 0]][:, None], out[edges[:, 0]], 0)); np.add.at(count, edges[:, 1], known[edges[:, 0]])
        grow = (~known) & (count > 0)
        out[grow] = acc[grow] / count[grow][:, None]
        known = known | grow
    degree = np.maximum(np.bincount(edges.ravel(), minlength=len(P)), 1)
    for _ in range(EMACIATED['smooth']):
        acc = np.zeros((len(P), 3))
        np.add.at(acc, edges[:, 0], out[edges[:, 1]])
        np.add.at(acc, edges[:, 1], out[edges[:, 0]])
        out = 0.5 * out + 0.5 * acc / degree[:, None]
    # (Round the shoulders, where the trunk's points (found along their normals) meet the arm's (found from its middle line),
    # the offsets smoothed `capSmooth` rounds more, eased out from `capNear[0]` to `[1]` (units of height) off the joint: the two
    # ways met in slits there.)
    near = np.min([np.linalg.norm(P - np.array(base['joints'][j]), axis=1) for j in ('lShoulder', 'rShoulder')], axis=0)
    lo, hi = EMACIATED['capNear']
    keep = np.clip((near - lo) / (hi - lo), 0, 1)[:, None]
    for _ in range(EMACIATED['capSmooth']):
        acc = np.zeros((len(P), 3))
        np.add.at(acc, edges[:, 0], out[edges[:, 1]])
        np.add.at(acc, edges[:, 1], out[edges[:, 0]])
        out = keep * out + (1 - keep) * (0.5 * out + 0.5 * acc / degree[:, None])
    size = np.linalg.norm(out, axis=1)
    local = np.zeros_like(out)
    for vertex in range(len(P)):
        a, axis, length, depth, width = frame(base['joints'], names[m['part'][vertex]])
        local[vertex] = [out[vertex] @ axis, out[vertex] @ depth, out[vertex] @ width]
    print('MOVE', base['sex'], key, stats, 'largest (cm at 1.7 m)', round(float(size.max()) * 170, 2), 'mean', round(float(size.mean()) * 170, 2))
    if True:
        np.savez(OUT.replace('.json', '-aligned.npz' if base['sex'] == 'female' else '-aligned-male.npz'), A=A, T=tris, P=P + out, BT=T, A0=A0, how=hows, owner=owner, raw=P + np.where(known[:, None], out, 0))
    return local.round(6).ravel().tolist()


result = {sex: {key: positions3d(base, key) for key in base['meshes']} for sex, base in (('female', FEMALE), ('male', MALE))}
json.dump(result, open(OUT, 'w'))
