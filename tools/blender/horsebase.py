# The horse from the user's model (lowPolyHorse.blend, 2026-11-10): its mesh in its rest pose (one subdivision level), in the
# game's horse frame (src/horsemesh.js: units of the height at the withers, x forward, y up, z to its left, the origin on the
# ground under its middle), each point's weights on the game's horse parts (its 45 bones' groups mapped onto the body, the neck,
# the head and each leg's upper leg, cannon and pastern), its texture coordinates and coat image, and each leg's joints (root,
# knee or hock, fetlock, the hoof's foot) as the model has them. Writes <out>/horsebase.json and <out>/horse.jpg, and with a
# second path packs them into it (src/horsebase-data.js).
#
# The coat image is stored as its brightness only (the game colours it each horse's coat, horseview.js), scaled so the horse's
# own coat (the image where the mesh's texture coordinates fall, by the mesh's area: not the photo's sky and grass) is
# 1 / COAT_GAIN of white: the coat's colour times COAT_GAIN is then each horse's own colour, its shading and markings kept as
# they are lighter or darker than it. Each point's share of the tail beyond its dock (`tail`) lets the game fold the solid tail
# into a stub for the hair tail to hang from.
#
#   Blender -b lowPolyHorse.blend --python tools/blender/horsebase.py -- <out dir> [src/horsebase-data.js]

import json
import os
import sys

import bpy
from mathutils import Vector

ARGS = sys.argv[sys.argv.index('--') + 1:]
OUT = ARGS[0]
# The coat's brightness stored as this share of white: room above it for the white of a sock or a blaze (up to twice the coat).
COAT_GAIN = 2
# The image's width in the game (px): the sandbox build's 15 MB budget (tools/custom.js) holds a 640 px grey JPEG easily.
IMAGE_WIDTH = 640
# The tail's bones beyond its dock: folded away in the game, the hair tail (horseview.js horseTail) drawn instead.
TAIL_BEYOND_DOCK = ['tail.001', 'tail.002', 'tail.003']
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
tail_share = []
for v in mesh.vertices:
    sums = {}
    # (Of the weights on the armature's bones only: the model's catch-all vertex group 'Group' is no bone and moves nothing.)
    deforming = [g for g in v.groups if g.group < len(names) and names[g.group] in bones]
    total_all = sum(g.weight for g in deforming) or 1
    tail_share.append(round(sum(g.weight for g in deforming if names[g.group] in TAIL_BEYOND_DOCK) / total_all, 4))
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
# The head bone's end, down the face towards the muzzle: the line the head's length is measured along.
joints['headTip'] = game(bones['head'][1])
# The dock: the tail's first bone, from its root at the croup to where the hair begins.
joints['dock'] = [game(bones['tail'][0]), game(bones['tail'][1])]

# The coat's brightness, over the horse as the mesh covers it (each triangle's corners, edge midpoints and middle sampled,
# weighted by its area): their weighted median, not their mean, as the coat's own level (the mesh's islands run a little past
# the photo's horse at its outline, onto bright sky and sand, and the white socks and blaze are no part of the coat either).
import numpy as np
image = bpy.data.images['horse.jpg']
width, height = image.size
pixels = np.array(image.pixels[:], dtype=np.float32).reshape(height, width, image.channels)[:, :, :3]
luminance = pixels @ np.array([0.3, 0.59, 0.11], dtype=np.float32)
values = []
shares = []
for tri in mesh.loop_triangles:
    corners = [Vector(uv_layer[loop].uv) for loop in tri.loops]
    a, b, c = (points[k] for k in tri.vertices)
    area = (b - a).cross(c - a).length / 2
    samples = corners + [(corners[0] + corners[1]) / 2, (corners[1] + corners[2]) / 2, (corners[2] + corners[0]) / 2, (corners[0] + corners[1] + corners[2]) / 3]
    for uv in samples:
        x = min(width - 1, max(0, int(uv.x * width)))
        y = min(height - 1, max(0, int(uv.y * height)))
        values.append(float(luminance[y, x]))
        shares.append(area / len(samples))
order = np.argsort(values)
cumulative = np.cumsum(np.array(shares)[order])
coat_luminance = float(np.array(values)[order][np.searchsorted(cumulative, cumulative[-1] / 2)])
grey = np.clip(luminance / (COAT_GAIN * coat_luminance), 0, 1)
# The photo outside the mesh's texture islands (its sky, grass and sand) set to the coat's own level: a far horse is drawn from
# the image's small mipmaps, each texel the average of a wide patch, and the bright sky round a leg's thin island would pale
# it. Each island grown by PAD_TEXELS first, so the edge of an island never averages in the fill either.
PAD_TEXELS = 4
mask = np.zeros((height, width), dtype=bool)
for tri in mesh.loop_triangles:
    uv = np.array([[uv_layer[loop].uv[0] * width, uv_layer[loop].uv[1] * height] for loop in tri.loops])
    x0, y0 = np.maximum(np.floor(uv.min(axis=0)).astype(int) - PAD_TEXELS, 0)
    x1, y1 = np.minimum(np.ceil(uv.max(axis=0)).astype(int) + PAD_TEXELS, [width - 1, height - 1])
    if x1 < x0 or y1 < y0:
        continue
    xs, ys = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
    (ax, ay), (bx, by), (cx, cy) = uv
    det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
    if abs(det) < 1e-9:
        continue
    l1 = ((by - cy) * (xs - cx) + (cx - bx) * (ys - cy)) / det
    l2 = ((cy - ay) * (xs - cx) + (ax - cx) * (ys - cy)) / det
    l3 = 1 - l1 - l2
    # (Within PAD_TEXELS of the triangle: each barycentric no more negative than the pad over the triangle's size.)
    slack = PAD_TEXELS / max(1.0, float(np.ptp(uv, axis=0).max()))
    mask[y0:y1 + 1, x0:x1 + 1] |= (l1 >= -slack) & (l2 >= -slack) & (l3 >= -slack)
grey[~mask] = 1 / COAT_GAIN
out =np.ones((height, width, 4), dtype=np.float32)
out[:, :, 0] = out[:, :, 1] = out[:, :, 2] = grey
image.pixels[:] = out.ravel()
image.scale(IMAGE_WIDTH, round(height * IMAGE_WIDTH / width))
# (Saved one channel deep: a grey image is a third of the colour one's bytes.)
settings = bpy.context.scene.render.image_settings
settings.file_format = 'JPEG'
settings.color_mode = 'BW'
settings.quality = 82
image.save_render(os.path.join(OUT, 'horse.jpg'), scene=bpy.context.scene)
data = {'parts': PARTS, 'positions': [game(p) for p in points], 'uvs': uvs, 'triangles': tris, 'weights': weights, 'joints': joints,
        'tail': tail_share, 'withersBlender': round(withers, 4), 'coatLuminance': round(float(coat_luminance), 4), 'coatGain': COAT_GAIN}
json.dump(data, open(os.path.join(OUT, 'horsebase.json'), 'w'))
print('HORSEBASE', len(points), 'verts', len(tris), 'tris', 'coat luminance', coat_luminance, json.dumps(joints))


def pack(json_path, jpg_path, js_path):
    # src/horsebase-data.js: the points × 16000 (signed 16-bit), the texture coordinates × 65535, the triangles (16-bit), each
    # point's two parts and the first's weight (bytes), each point's share of the tail beyond the dock (bytes), the joints, and
    # the coat image (a grey JPEG), all base64.
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
    tail = np.round(np.clip(np.array(data['tail']), 0, 1) * 255).astype(np.uint8)
    image = base64.b64encode(open(jpg_path, 'rb').read()).decode()
    lines = ["// Generated by tools/blender/horsebase.py from the user's lowPolyHorse.blend (do not edit by hand): the horse's mesh in the",
             "// game's horse frame (units of the withers' height, x forward, y up, z to its left, the origin on the ground under its",
             "// middle), its texture coordinates, triangles, each point's two parts (`parts` names them) and the first's weight, its",
             "// legs' joints as modelled, each point's share of the tail beyond the dock (`tail`, bytes), and its coat image (a grey",
             "// JPEG, base64: the horse's own coat at 1 / `coatGain` of white, so the coat's colour times `coatGain` colours it).",
             'export const HORSE_BASE_DATA = {',
             f"  parts: {json.dumps(data['parts'])},",
             f"  joints: {json.dumps(data['joints'])},",
             f"  coatGain: {data['coatGain']},",
             f"  points: '{b64(positions)}',", f"  uvs: '{b64(uvs)}',", f"  triangles: '{b64(tris)}',", f"  weights: '{b64(parts)}',", f"  tail: '{b64(tail)}',",
             f"  image: 'data:image/jpeg;base64,{image}',", '};']
    open(js_path, 'w').write('\n'.join(lines) + '\n')


if len(ARGS) > 1:
    pack(os.path.join(OUT, 'horsebase.json'), os.path.join(OUT, 'horse.jpg'), ARGS[1])
