# The photo heads' base model (src/headmodel-data.js, src/photohead.js): a real head's shape, built in Blender from blended
# ellipsoids (metaballs: the cranium, the forehead, the cheekbones, the maxilla, the jaw and its corners, the chin, the brow
# ridge, the nose, the lips; the eye sockets and the hollows under the cheekbones carved out), meshed, smoothed, and sampled as
# its outer surface's distance along each direction from the head's centre: a table the game reads in place of the drawn
# head's sphere. One for a man and one for a woman; every region's faces are this head changed by its own measures
# (faceregions.js REGION_SHAPES).
#
# Units: the head's radius (r, ~10 cm), the game's head axes (x forward, y up, z to the left), the centre where the drawn head's
# was: the eyes at y = -0.064, the vertex at +1.06. Proportions of an adult man (Farkas, Anthropometry of the Head and Face,
# 1994; the ANSUR II head measures): head length 19.6 cm, breadth 15.2 cm, vertex to chin 23.2 cm (the eyes about midway), the
# face (nasion to chin) 12.2 cm, the cheekbones 14 cm across, the jaw's corners 10.8 cm, the nose 5.3 cm long and standing
# 2-2.5 cm proud; a woman's about 0.93 of a man's, her jaw and brow ridge less, her chin smaller.
#
#   /Applications/Blender.app/Contents/MacOS/Blender -b --python tools/blender/headmodel.py -- <out dir> [preview]

import json
import math
import os
import sys

import bpy
import bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = ARGS[0] if ARGS else '/tmp'
PREVIEW = 'preview' in ARGS

# Each part: (kind, centre (x, y, z), sizes (x, y, z), stiffness, mirrored to both sides, negative). Game axes; z to the left.
MALE = [
    ('cranium', (-0.08, 0.30, 0), (0.86, 0.72, 0.66), 2.0, False, False),
    ('forehead', (0.40, 0.42, 0), (0.48, 0.50, 0.52), 2.0, False, False),
    ('temple', (0.10, 0.05, 0.42), (0.55, 0.42, 0.22), 2.0, True, False),
    ('cheekbone', (0.46, -0.30, 0.48), (0.30, 0.17, 0.17), 2.0, True, False),
    ('maxilla', (0.48, -0.48, 0), (0.42, 0.34, 0.40), 2.0, False, False),
    ('jaw', (0.22, -0.82, 0), (0.42, 0.24, 0.46), 2.0, False, False),
    ('gonion', (-0.02, -0.80, 0.42), (0.20, 0.20, 0.12), 2.0, True, False),
    ('chin', (0.66, -1.06, 0), (0.22, 0.16, 0.24), 2.0, False, False),
    ('browRidge', (0.80, 0.10, 0.25), (0.14, 0.07, 0.22), 2.0, True, False),
    ('nose', (0.92, -0.33, 0), (0.14, 0.30, 0.09), 2.0, False, False),
    ('noseTip', (1.06, -0.55, 0), (0.10, 0.09, 0.11), 2.0, False, False),
    ('nostril', (0.96, -0.58, 0.10), (0.08, 0.06, 0.07), 2.0, True, False),
    ('upperLip', (0.86, -0.75, 0), (0.12, 0.06, 0.20), 2.0, False, False),
    ('lowerLip', (0.83, -0.85, 0), (0.11, 0.06, 0.18), 2.0, False, False),
    ('socket', (0.86, -0.06, 0.30), (0.17, 0.11, 0.15), 2.0, True, True),
    ('underCheek', (0.50, -0.62, 0.44), (0.18, 0.18, 0.12), 1.0, True, True),
]

# A woman's head: the same parts, the whole 0.93 of a man's (applied in the game as a scale), the brow ridge, jaw and its
# corners and the chin less, the cheeks fuller, the forehead more upright.
FEMALE_CHANGES = {
    'browRidge': {'size': (0.10, 0.05, 0.20)},
    'jaw': {'size': (0.38, 0.22, 0.40)},
    'gonion': {'size': (0.15, 0.16, 0.09), 'centre': (0.00, -0.78, 0.37)},
    'chin': {'size': (0.18, 0.13, 0.19)},
    'forehead': {'centre': (0.44, 0.42, 0)},
    'cheekbone': {'size': (0.30, 0.18, 0.18)},
    'nose': {'size': (0.12, 0.27, 0.08)},
    'noseTip': {'size': (0.09, 0.08, 0.10), 'centre': (1.02, -0.53, 0)},
    'underCheek': {'stiffness': 0.5},
}


def parts_for(sex):
    parts = []
    for kind, centre, size, stiff, mirror, negative in MALE:
        change = FEMALE_CHANGES.get(kind, {}) if sex == 'female' else {}
        parts.append((kind, change.get('centre', centre), change.get('size', size), change.get('stiffness', stiff), mirror, negative))
    return parts


def game_to_blender(p):
    # Game (x forward, y up, z left) to Blender (x forward, y left, z up).
    return Vector((p[0], p[2], p[1]))


def build(sex):
    meta = bpy.data.metaballs.new(f'head-{sex}')
    meta.resolution = 0.025
    meta.render_resolution = 0.025
    meta.threshold = 0.6
    obj = bpy.data.objects.new(f'head-{sex}', meta)
    bpy.context.scene.collection.objects.link(obj)
    for kind, centre, size, stiff, mirror, negative in parts_for(sex):
        for side in ([1, -1] if mirror else [1]):
            element = meta.elements.new(type='ELLIPSOID')
            element.co = game_to_blender((centre[0], centre[1], centre[2] * side))
            element.radius = 1.0
            element.size_x, element.size_y, element.size_z = size[0], size[2], size[1]
            element.stiffness = stiff
            element.use_negative = negative
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(depsgraph))
    out = bpy.data.objects.new(f'mesh-{sex}', mesh)
    bpy.context.scene.collection.objects.link(out)
    bm = bmesh.new()
    bm.from_mesh(mesh)
    for _ in range(4):
        bmesh.ops.smooth_vert(bm, verts=bm.verts, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    bm.to_mesh(mesh)
    bm.free()
    obj.hide_render = True
    return out


# The sampling grid: polar (0 at the crown) and azimuth (0 the face, + to the left), each step even.
POLARS, AZIMUTHS = 96, 144


def sample(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    tree = BVHTree.FromBMesh(bm)
    radii = []
    for row in range(POLARS + 1):
        polar = math.pi * row / POLARS
        for column in range(AZIMUTHS):
            azimuth = -math.pi + 2 * math.pi * column / AZIMUTHS
            d = (math.sin(polar) * math.cos(azimuth), math.cos(polar), math.sin(polar) * math.sin(azimuth))
            direction = game_to_blender(d)
            hit = tree.ray_cast(direction * 4, -direction)
            radii.append(round((4 - hit[3]) if hit[0] is not None else 0, 4))
    bm.free()
    return radii


def landmarks(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    tree = BVHTree.FromBMesh(bm)
    def front_at(y):
        hit = tree.ray_cast(game_to_blender((3, y, 0)), game_to_blender((-1, 0, 0)))
        return round(hit[0].x, 4) if hit[0] else None
    lowest = min((v.co.z, v.co.x) for v in bm.verts if abs(v.co.y) < 0.05 and v.co.x > 0.3)
    top = max(v.co.z for v in bm.verts)
    back = min(v.co.x for v in bm.verts)
    width = max(abs(v.co.y) for v in bm.verts)
    bm.free()
    return {'chin': round(lowest[0], 4), 'chinFront': round(lowest[1], 4), 'vertex': round(top, 4), 'back': round(back, 4), 'halfWidth': round(width, 4),
            'profile': {f'{y:.2f}': front_at(y) for y in [0.6, 0.3, 0.1, -0.06, -0.3, -0.55, -0.75, -0.9, -1.05]}}


def preview(obj, name):
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.display.shading.light = 'STUDIO'
    scene.display.shading.color_type = 'SINGLE'
    scene.display.shading.single_color = (0.78, 0.62, 0.52)
    scene.render.resolution_x, scene.render.resolution_y = 900, 450
    for other in scene.objects:
        if other.type == 'MESH':
            other.hide_render = other is not obj
    cam_data = bpy.data.cameras.new('cam')
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = 2.6
    shots = []
    for label, location, rotation in [('front', (6, 0, -0.05), (math.pi / 2, 0, math.pi / 2)), ('side', (0, 6, -0.05), (math.pi / 2, 0, math.pi))]:
        cam = bpy.data.objects.new(f'cam-{label}', cam_data)
        scene.collection.objects.link(cam)
        cam.location = location
        cam.rotation_euler = rotation
        scene.camera = cam
        scene.render.resolution_x, scene.render.resolution_y = 450, 450
        path = os.path.join(OUT, f'{name}-{label}.png')
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        shots.append(path)
    return shots


for thing in list(bpy.data.objects):
    bpy.data.objects.remove(thing, do_unlink=True)
result = {'polars': POLARS, 'azimuths': AZIMUTHS}
for sex in ['male', 'female']:
    mesh = build(sex)
    result[sex] = {'landmarks': landmarks(mesh), 'radii': sample(mesh)}
    if PREVIEW:
        preview(mesh, sex)
with open(os.path.join(OUT, 'headmodel.json'), 'w') as handle:
    json.dump(result, handle)
print('HEADMODEL', json.dumps({sex: result[sex]['landmarks'] for sex in ['male', 'female']}))
