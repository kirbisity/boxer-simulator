# The proof sheet's renders (the user's call, 2026-11-11: the game's base body must look like the model): the user's base mesh as
# modelled, the same mesh as the game takes it (head, hands and feet cut off, arms turned into the rig's A-pose, at full
# resolution), and the game's body at the reference build (tools/baseproof-export.js), each from the front, the side and the
# back under one orthographic camera and one light, on a transparent ground so their silhouettes can be laid over each other
# (tools/baseproof-sheet.py composes the sheet).
#
#   Blender -b <file.blend> --python tools/blender/baseproof.py -- <object> <cut.obj> <game.obj> <out prefix>
#
# Everything is in the game's frame (x forward, y up, z to the left) and units of standing height, the model brought there as
# basebody.py brings it (x = -y, y = z, z = -x; the ground at 0, centred across).

import math
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Vector

NAME, CUT, GAME, OUT = sys.argv[sys.argv.index('--') + 1:][:4]
PROOF = {
    # The orthographic camera's breadth (units of height) and the image's size in pixels.
    'breadth': 1.1, 'pixels': 700,
    # The views: the camera's place looking at the middle of the figure (Blender's frame: the game's turned so its up is
    # Blender's z, its left Blender's -y).
    'views': {'front': (4, 0, 0.5), 'side': (0, -4, 0.5), 'back': (-4, 0, 0.5)},
}

scene = bpy.context.scene
source = bpy.data.objects[NAME]
dg = bpy.context.evaluated_depsgraph_get()
modelled = bpy.data.meshes.new_from_object(source.evaluated_get(dg))
modelled.transform(source.matrix_world)
bm = bmesh.new()
bm.from_mesh(modelled)
for v in bm.verts:
    x, y, z = v.co
    v.co = Vector((-y, z, -x))
P = np.array([v.co[:] for v in bm.verts])
low, high = P.min(axis=0), P.max(axis=0)
H = high[1] - low[1]
for v in bm.verts:
    v.co = (v.co - Vector((0, low[1], (low[2] + high[2]) / 2))) / H
bm.to_mesh(modelled)


def read_obj(path, name):
    verts, faces = [], []
    for line in open(path):
        if line.startswith('v '):
            verts.append(tuple(float(value) for value in line.split()[1:4]))
        elif line.startswith('f '):
            faces.append(tuple(int(value.split('/')[0]) - 1 for value in line.split()[1:]))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    return mesh


subjects = {'modelled': modelled, 'cut': read_obj(CUT, 'cut'), 'game': read_obj(GAME, 'game')}
for o in list(scene.objects):
    if o.type == 'MESH':
        o.hide_render = True
objects = {}
for key, mesh in subjects.items():
    ob = bpy.data.objects.new(f'proof-{key}', mesh)
    ob.rotation_euler = (math.pi / 2, 0, 0)
    scene.collection.objects.link(ob)
    for poly in mesh.polygons:
        poly.use_smooth = True
    objects[key] = ob
scene.render.engine = 'BLENDER_WORKBENCH'
scene.display.shading.light = 'STUDIO'
scene.display.shading.color_type = 'SINGLE'
scene.display.shading.single_color = (0.75, 0.72, 0.68)
scene.render.film_transparent = True
scene.render.image_settings.color_mode = 'RGBA'
scene.render.resolution_x = scene.render.resolution_y = PROOF['pixels']
scene.render.resolution_percentage = 100
cam_data = bpy.data.cameras.new('proof')
cam_data.type = 'ORTHO'
cam_data.ortho_scale = PROOF['breadth']
cam = bpy.data.objects.new('proof-cam', cam_data)
scene.collection.objects.link(cam)
scene.camera = cam
for view, place in PROOF['views'].items():
    cam.location = place
    direction = Vector((0, 0, 0.5)) - Vector(place)
    cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    for key, ob in objects.items():
        for other in objects.values():
            other.hide_render = other is not ob
        scene.render.filepath = f'{OUT}-{key}-{view}.png'
        bpy.ops.render.render(write_still=True)
print('PROOF', {key: (len(mesh.vertices), len(mesh.polygons)) for key, mesh in subjects.items()})
