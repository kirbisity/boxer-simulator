# Plate armour's surface as a tiling patch of 200 mm square: steel raised and planished by hand, so its face is not flat but
# a field of shallow, overlapping hammer facets (6-14 mm across, a few hundredths of a millimetre deep) over a slow waviness,
# then polished, the polish leaving faint streaks one way. The plate's real shape (ridges, lames, rolled edges, rivets) stays
# geometry; this only takes the CAD-flat look off it.
#
#   Blender -b --factory-startup --python tools/blender/plate.py -- <out dir> [resolution scale]

import math
import os
import random
import sys

import bpy
from mathutils import Vector, noise

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tilebake as tb  # noqa: E402

OUT, SCALE = tb.args()
S = 0.2
rng = random.Random(31)
scene = tb.reset()
group = tb.out_group(ao_distance=0.002, h_lo=-0.0004, h_hi=0.0004)
tile = tb.new_collection()

# Hammer blows: centres scattered over the torus, each a shallow spherical cap pressed in.
blows = [(rng.uniform(0, S), rng.uniform(0, S), rng.uniform(0.003, 0.007), rng.uniform(0.00006, 0.00014)) for _ in range(900)]
CELL = 0.02
grid = {}
for blow in blows:
    grid.setdefault((int(blow[0] / CELL), int(blow[1] / CELL)), []).append(blow)
N = int(S / CELL)


def height(x, y):
    h = 0.00025 * noise.fractal(Vector((x * 9, y * 9, 0.3)), 0.5, 2.0, 3)
    gx, gy = int(x / CELL), int(y / CELL)
    deepest = 0.0
    for ox in (-1, 0, 1):
        for oy in (-1, 0, 1):
            for (bx, by, r, d) in grid.get(((gx + ox) % N, (gy + oy) % N), ()):
                dx = (x - bx + S / 2) % S - S / 2
                dy = (y - by + S / 2) % S - S / 2
                q = (dx * dx + dy * dy) / (r * r)
                if q < 1:
                    deepest = min(deepest, -d * (1 - q))
    return h + deepest


n = 400
verts, faces = [], []
for j in range(n + 1):
    for i in range(n + 1):
        x, y = S * i / n, S * j / n
        verts.append((x, y, height(x % S, y % S)))
for j in range(n):
    for i in range(n):
        k = j * (n + 1) + i
        faces.append((k, k + 1, k + n + 2, k + n + 1))
mesh = bpy.data.meshes.new('plate')
mesh.from_pydata(verts, [], faces)
for poly in mesh.polygons:
    poly.use_smooth = True


def steel(nodes, links, geometry):
    coord = nodes.new('ShaderNodeTexCoord')
    stretch = nodes.new('ShaderNodeVectorMath')
    stretch.operation = 'MULTIPLY'
    stretch.inputs[1].default_value = (1.0, 0.04, 1.0)
    links.new(coord.outputs['Object'], stretch.inputs[0])
    polish = nodes.new('ShaderNodeTexNoise')
    polish.inputs['Scale'].default_value = 300.0
    links.new(stretch.outputs[0], polish.inputs['Vector'])
    bump = nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.05
    bump.inputs['Distance'].default_value = 0.00002
    links.new(polish.outputs['Fac'], bump.inputs['Height'])
    links.new(geometry.outputs['Normal'], bump.inputs['Normal'])
    mottle = nodes.new('ShaderNodeTexNoise')
    mottle.inputs['Scale'].default_value = 18.0
    links.new(coord.outputs['Object'], mottle.inputs['Vector'])
    tone = nodes.new('ShaderNodeMapRange')
    tone.inputs['To Min'].default_value = 0.86
    tone.inputs['To Max'].default_value = 0.98
    links.new(mottle.outputs['Fac'], tone.inputs['Value'])
    colour = nodes.new('ShaderNodeCombineXYZ')
    for k in range(3):
        links.new(tone.outputs['Result'], colour.inputs[k])
    rough = nodes.new('ShaderNodeMapRange')
    rough.inputs['To Min'].default_value = 0.2
    rough.inputs['To Max'].default_value = 0.34
    links.new(polish.outputs['Fac'], rough.inputs['Value'])
    return colour.outputs[0], rough.outputs['Result'], 1.0, 0.0, bump.outputs['Normal']


mesh.materials.append(tb.material('steel', group, steel))
obj = bpy.data.objects.new('plate', mesh)
tb.link(obj, tile)
tb.repeat_around(tile, S, S)
size = int(1024 * SCALE)
tb.camera(S, S, size, size)
tb.render_maps(group, OUT, 'plate', samples={'normal': 16, 'albedo': 8, 'orm': 32, 'height': 4}, modes=['normal', 'albedo', 'orm', 'height'])
