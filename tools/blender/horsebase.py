# The horse from the user's model (lowPolyHorse.blend, 2026-11-10): its mesh in its rest pose (one subdivision level), in the
# game's horse frame (src/horsemesh.js: units of the height at the withers, x forward, y up, z to its left, the origin on the
# ground under its middle), each point's weights on the game's horse parts (its 45 bones' groups mapped onto the body, the neck,
# the head and each leg's upper leg, cannon and pastern), its texture coordinates and coat image, and each leg's joints (root,
# knee or hock, fetlock, the hoof's foot) as the model has them. Writes <out>/horsebase.json and <out>/horse.jpg.
#
#   Blender -b lowPolyHorse.blend --python tools/blender/horsebase.py -- <out dir>

import json
import os
import sys

import bpy
from mathutils import Vector

OUT = sys.argv[sys.argv.index('--') + 1]
mesh_obj = bpy.data.objects['Cylinder']
arm = bpy.data.objects['Armature']

# The game's parts, in order (photohead-style indices the view reads): the trunk, the neck, the head, then each leg's three.
PARTS = ['body', 'neck', 'head']
LEGS = [('lFore', 'front', '.l'), ('rFore', 'front', '.r'), ('lHind', 'back', '.l'), ('rHind', 'back', '.r')]
for key, _, _ in LEGS:
    PARTS += [f'{key}.upper', f'{key}.cannon', f'{key}.pastern']
GROUP_PART = {}
for name in ['main', 'spine', 'spine.001', 'back', 'butt', 'chest.l', 'chest.r', 'frontShoulder.l', 'frontShoulder.r', 'hip.l', 'hip.r',
             'shoulder.l', 'shoulder.r', 'tail', 'tail.001', 'tail.002', 'tail.003', 'Group']:
    GROUP_PART[name] = 'body'
for name in ['neck', 'neck.001', 'neck.002', 'neck.003']:
    GROUP_PART[name] = 'neck'
for name in ['head', 'lip', 'jaw', 'ear.l', 'ear.r']:
    GROUP_PART[name] = 'head'
LEG_BONES = {'front': ['frontUpperLeg', 'frontCalf', 'frontAnkle'], 'back': ['thigh', 'backCalf', 'backAnkle']}
for key, end, side in LEGS:
    for piece, bone in zip(['upper', 'cannon', 'pastern'], LEG_BONES[end]):
        GROUP_PART[bone + side] = f'{key}.{piece}'

# The rest pose: the armature left out, one subdivision level.
for modifier in mesh_obj.modifiers:
    if modifier.type == 'ARMATURE':
        modifier.show_viewport = False
    if modifier.type == 'SUBSURF':
        modifier.levels = 1
dg = bpy.context.evaluated_depsgraph_get()
evaluated = mesh_obj.evaluated_get(dg)
mesh = evaluated.to_mesh()
world = mesh_obj.matrix_world
points = [world @ v.co for v in mesh.vertices]

# The frame: up is +z; forward from the rump towards the head (the bones' heads, level).
bones = {b.name: (arm.matrix_world @ b.head_local, arm.matrix_world @ b.tail_local) for b in arm.data.bones}
forward = bones['head'][0] - bones['butt'][0]
forward.z = 0
forward.normalize()
up = Vector((0, 0, 1))
left = up.cross(forward)
ground = min(p.z for p in points)
# The withers: the top of the back over the fore legs' roots.
fore_root = (bones['frontUpperLeg.l'][0] + bones['frontUpperLeg.r'][0]) / 2
hind_root = (bones['thigh.l'][0] + bones['thigh.r'][0]) / 2
over = [p for p in points if abs((p - fore_root).dot(forward)) < 0.08 * (fore_root - hind_root).length]
withers = max(p.z for p in over) - ground
middle = (fore_root + hind_root) / 2


def game(p):
    d = p - middle
    return [round(d.dot(forward) / withers, 5), round((p.z - ground) / withers, 5), round(d.dot(left) / withers, 5)]


names = [g.name for g in mesh_obj.vertex_groups]
part_index = {name: k for k, name in enumerate(PARTS)}
weights = []
for v in mesh.vertices:
    sums = {}
    for g in v.groups:
        part = GROUP_PART.get(names[g.group]) if g.group < len(names) else None
        if part and g.weight > 0:
            sums[part] = sums.get(part, 0) + g.weight
    best = sorted(sums.items(), key=lambda kv: -kv[1])[:2] or [('body', 1.0)]
    total = sum(w for _, w in best)
    weights.append([[part_index[p], round(w / total, 4)] for p, w in best])
uv_layer = mesh.uv_layers.active.data
tris = []
uvs = [0.0] * (2 * len(mesh.vertices))
mesh.calc_loop_triangles()
for tri in mesh.loop_triangles:
    # (The game's axes are Blender's mirrored: each triangle wound the other way so it faces out.)
    tris.append([tri.vertices[0], tri.vertices[2], tri.vertices[1]])
    for loop, vertex in zip(tri.loops, tri.vertices):
        uvs[2 * vertex], uvs[2 * vertex + 1] = round(uv_layer[loop].uv[0], 5), round(uv_layer[loop].uv[1], 5)
joints = {}
for key, end, side in LEGS:
    upper, cannon, pastern = (bones[name + side] for name in LEG_BONES[end])
    joints[key] = {'root': game(upper[0]), 'knee': game(upper[1]), 'fetlock': game(cannon[1]), 'hoof': game(pastern[1])}
joints['neckPivot'] = game(bones['neck'][0])
joints['poll'] = game(bones['head'][0])
data = {'parts': PARTS, 'positions': [game(p) for p in points], 'uvs': uvs, 'triangles': tris, 'weights': weights, 'joints': joints,
        'withersBlender': round(withers, 4)}
json.dump(data, open(os.path.join(OUT, 'horsebase.json'), 'w'))
image = bpy.data.images['horse.jpg']
image.filepath_raw = os.path.join(OUT, 'horse.jpg')
image.file_format = 'JPEG'
image.save()
print('HORSEBASE', len(points), 'verts', len(tris), 'tris', json.dumps(joints))


def pack(json_path, jpg_path, js_path):
    # src/horsebase-data.js: the points × 16000 (signed 16-bit), the texture coordinates × 65535, the triangles (16-bit), each
    # point's two parts and the first's weight (bytes), the leg joints, and the coat image (JPEG), all base64.
    import base64
    import numpy as np
    data = json.load(open(json_path))
    b64 = lambda array: base64.b64encode(array.tobytes()).decode()
    positions = np.round(np.array(data['positions']) * 16000).astype('<i2')
    uvs = np.round(np.clip(np.array(data['uvs']), 0, 1) * 65535).astype('<u2')
    tris = np.array(data['triangles']).astype('<u2')
    parts = np.zeros((len(data['weights']), 3), dtype=np.uint8)
    for k, pairs in enumerate(data['weights']):
        parts[k, 0] = pairs[0][0]
        parts[k, 1] = pairs[1][0] if len(pairs) > 1 else pairs[0][0]
        parts[k, 2] = round(pairs[0][1] * 255)
    image = base64.b64encode(open(jpg_path, 'rb').read()).decode()
    lines = ["// Generated by tools/blender/horsebase.py from the user's lowPolyHorse.blend (do not edit by hand): the horse's mesh in the",
             "// game's horse frame (units of the withers' height, x forward, y up, z to its left, the origin on the ground under its",
             "// middle), its texture coordinates, triangles, each point's two parts (`parts` names them) and the first's weight, its",
             "// legs' joints as modelled, and its coat image (a JPEG, base64); the image's mean colour is `coatMean`.",
             'export const HORSE_BASE_DATA = {',
             f"  parts: {json.dumps(data['parts'])},",
             f"  joints: {json.dumps(data['joints'])},",
             "  coatMean: [0.549, 0.514, 0.384],",
             f"  points: '{b64(positions)}',", f"  uvs: '{b64(uvs)}',", f"  triangles: '{b64(tris)}',", f"  weights: '{b64(parts)}',",
             f"  image: 'data:image/jpeg;base64,{image}',", '};']
    open(js_path, 'w').write('\n'.join(lines) + '\n')
