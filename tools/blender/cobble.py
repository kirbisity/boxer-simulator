# Cobbles (the castle road's): rounded field and river stones of 12-21 cm, packed close and bedded in dark earth,
# each domed and worn smooth on top, a tiling patch of 3 m square. The stones are laid by dart throwing with the
# distances taken round the tile (so the packing wraps), each its own heightfield.
#
#   Blender -b --factory-startup --python tools/blender/cobble.py -- <out dir> [resolution scale]

import math
import os
import random
import sys

import bpy
from mathutils import Vector, noise

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tilebake as tb  # noqa: E402

OUT, SCALE = tb.args()
S = 3.0
rng = random.Random(15)
scene = tb.reset()
group = tb.out_group(ao_distance=0.04, h_lo=0.0, h_hi=0.08)
tile = tb.new_collection()


def stone(nodes, links, geometry):
    info = nodes.new('ShaderNodeObjectInfo')
    coord = nodes.new('ShaderNodeTexCoord')
    fine = nodes.new('ShaderNodeTexNoise')
    fine.inputs['Scale'].default_value = 90.0
    fine.inputs['Detail'].default_value = 8.0
    links.new(coord.outputs['Object'], fine.inputs['Vector'])
    bump = nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.35
    bump.inputs['Distance'].default_value = 0.002
    links.new(fine.outputs['Fac'], bump.inputs['Height'])
    links.new(geometry.outputs['Normal'], bump.inputs['Normal'])
    ramp = nodes.new('ShaderNodeValToRGB')
    elements = ramp.color_ramp.elements
    elements[0].position = 0.0
    elements[0].color = (0.19, 0.19, 0.2, 1)
    elements[1].position = 1.0
    elements[1].color = (0.40, 0.385, 0.36, 1)
    for at, colour in ((0.25, (0.26, 0.27, 0.29, 1)), (0.5, (0.31, 0.29, 0.27, 1)), (0.72, (0.34, 0.29, 0.26, 1)), (0.88, (0.35, 0.35, 0.33, 1))):
        element = elements.new(at)
        element.color = colour
    mottle = nodes.new('ShaderNodeTexNoise')
    mottle.inputs['Scale'].default_value = 22.0
    mottle.inputs['Detail'].default_value = 5.0
    links.new(coord.outputs['Object'], mottle.inputs['Vector'])
    pick = nodes.new('ShaderNodeMath')
    pick.operation = 'MULTIPLY_ADD'
    links.new(mottle.outputs['Fac'], pick.inputs[0])
    pick.inputs[1].default_value = 0.18
    links.new(info.outputs['Random'], pick.inputs[2])
    links.new(pick.outputs[0], ramp.inputs['Fac'])
    # Worn tops smoother than the sides (height from the object's own z).
    sep = nodes.new('ShaderNodeSeparateXYZ')
    links.new(coord.outputs['Object'], sep.inputs[0])
    rough = nodes.new('ShaderNodeMapRange')
    rough.inputs['From Min'].default_value = 0.0
    rough.inputs["From Max"].default_value = 0.06
    rough.inputs['To Min'].default_value = 0.85
    rough.inputs['To Max'].default_value = 0.5
    links.new(sep.outputs['Z'], rough.inputs['Value'])
    return ramp.outputs['Color'], rough.outputs['Result'], 0.0, 0.0, bump.outputs['Normal']


def earth(nodes, links, geometry):
    bumped, fac = tb.noise_bump(nodes, links, geometry, scale=60.0, strength=0.7, distance=0.006, coords='Object')
    tone = nodes.new('ShaderNodeMapRange')
    tone.inputs['To Min'].default_value = 0.08
    tone.inputs['To Max'].default_value = 0.15
    links.new(fac, tone.inputs['Value'])
    colour = nodes.new('ShaderNodeCombineXYZ')
    for k, f in enumerate((1.0, 0.86, 0.7)):
        m = nodes.new('ShaderNodeMath')
        m.operation = 'MULTIPLY'
        m.inputs[1].default_value = f
        links.new(tone.outputs['Result'], m.inputs[0])
        links.new(m.outputs[0], colour.inputs[k])
    return colour.outputs[0], 0.92, 0.0, 0.0, bumped


stone_mat = tb.material('stone', group, stone)
earth_mat = tb.material('earth', group, earth)
bpy.ops.mesh.primitive_plane_add(size=1, location=(S / 2, S / 2, 0.006))
bed = bpy.context.object
bed.scale = (S * 3, S * 3, 1)
bed.data.materials.append(earth_mat)

# Dart throwing on the torus: big stones first, then smaller ones into the gaps; two stones may lie a little into each
# other's outline (they are jammed together), never more. A grid of cells keeps the neighbour search short.
stones = []
CELL = 0.2
CELLS = int(S / CELL)
grid = {}
for attempt in range(160000):
    big = attempt < 40000
    a = rng.uniform(0.062, 0.105) if big else rng.uniform(0.04, 0.068)
    b = a * rng.uniform(0.7, 0.95)
    x, y = rng.uniform(0, S), rng.uniform(0, S)
    r = (a + b) / 2
    gx, gy = int(x / CELL), int(y / CELL)
    ok = True
    for ox in (-1, 0, 1):
        for oy in (-1, 0, 1):
            for (sx, sy, sr) in grid.get(((gx + ox) % CELLS, (gy + oy) % CELLS), ()):
                dx = abs(x - sx)
                dy = abs(y - sy)
                dx = min(dx, S - dx)
                dy = min(dy, S - dy)
                if dx * dx + dy * dy < (0.9 * (r + sr) + 0.004) ** 2:
                    ok = False
                    break
            if not ok:
                break
        if not ok:
            break
    if ok:
        stones.append((x, y, a, b, rng.uniform(0, math.pi)))
        grid.setdefault((gx % CELLS, gy % CELLS), []).append((x, y, r))
print('cobble: stones', len(stones), flush=True)

SPACING = 0.0045
for index, (x, y, a, b, turn) in enumerate(stones):
    dome = rng.uniform(0.035, 0.06)
    seed = rng.uniform(0, 100)
    flat = rng.uniform(0.35, 0.6)
    n = max(8, int(2 * a / SPACING))
    verts = []
    faces = []
    c, s = math.cos(turn), math.sin(turn)
    for j in range(n + 1):
        for i in range(n + 1):
            u = -1 + 2 * i / n
            v = -1 + 2 * j / n
            # Lumpy outline: the radius wobbles round the stone.
            ang = math.atan2(v, u)
            wobble = 1 + 0.12 * noise.noise(Vector((math.cos(ang) * 1.5, math.sin(ang) * 1.5, seed)))
            rho = math.hypot(u, v) / wobble
            px, py = u * a, v * b
            if rho >= 1:
                z = 0.0
            else:
                z = dome * (1 - rho ** 2) ** flat
                z += 0.004 * noise.fractal(Vector((px * 30 + seed, py * 30, seed)), 0.6, 2.0, 3) * (1 - rho)
            verts.append((px * c - py * s, px * s + py * c, max(0.0, z)))
    for j in range(n):
        for i in range(n):
            k = j * (n + 1) + i
            faces.append((k, k + 1, k + n + 2, k + n + 1))
    mesh = bpy.data.meshes.new(f'stone{index}')
    mesh.from_pydata(verts, [], faces)
    for poly in mesh.polygons:
        poly.use_smooth = True
    mesh.materials.append(stone_mat)
    obj = bpy.data.objects.new(f'stone{index}', mesh)
    obj.location = (x, y, 0.0)
    tb.link(obj, tile)

tb.repeat_around(tile, S, S)
size = int(2048 * SCALE)
tb.camera(S, S, size, size)
tb.render_maps(group, OUT, 'cobble', samples={'normal': 24, 'albedo': 16, 'orm': 96, 'height': 8}, modes=['normal', 'albedo', 'orm', 'height'])
