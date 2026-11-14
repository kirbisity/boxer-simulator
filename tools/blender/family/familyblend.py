# The family of builds as one mesh a sex with a shape key a build (Basis: the base mesh as modelled).
#   Blender -b --python familyblend.py -- <family.json> <base-sex.json> <sex> <stature m> <out.blend>
# family.json: dump.py's (each sex's base and builds, points in the game's frame); base-sex.json: export.mjs's (the triangles).
import json
import sys

import bpy
import numpy as np

SRC, BASE, SEX, STATURE, OUT = sys.argv[sys.argv.index('--') + 1:][:5]
# What each key is, for whoever opens the file.
BUILDS = {'E': 'emaciated', 'N': 'ordinary', 'M': 'muscular', 'F1': 'fat 1', 'F2': 'fat 2', 'F3': 'fat 3', 'F4': 'fat 4'}
z = {key: np.array(points, float).reshape(-1, 3) for key, points in json.load(open(SRC))[SEX].items()}
triangles = np.array(json.load(open(BASE))['meshes']['full']['triangles']).reshape(-1, 3)
# The game's frame (units of height, x forward, y up) to Blender's (m, facing -Y, Z up), a rotation.
to_blender = lambda V: np.stack([-V[:, 2], -V[:, 0], V[:, 1]], axis=1) * float(STATURE)

bpy.ops.wm.read_factory_settings(use_empty=True)
mesh = bpy.data.meshes.new('family')
mesh.from_pydata(to_blender(z['base']).tolist(), [], triangles.tolist())
mesh.update()
for polygon in mesh.polygons:
    polygon.use_smooth = True
body = bpy.data.objects.new('family', mesh)
bpy.context.scene.collection.objects.link(body)
body.shape_key_add(name='Basis')
for key, name in BUILDS.items():
    shape = body.shape_key_add(name=f'{key} {name}')
    shape.data.foreach_set('co', to_blender(z[key]).ravel())
bpy.ops.wm.save_as_mainfile(filepath=OUT)
print('SAVED', OUT, len(mesh.vertices), 'points', len(body.data.shape_keys.key_blocks) - 1, 'builds')
