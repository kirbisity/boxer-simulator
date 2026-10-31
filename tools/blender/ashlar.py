# Coursed ashlar (the castle's dressed walling) as a tiling patch of 4 m square: courses of 0.26-0.42 m, blocks of
# 0.45-1.2 m in each, every block a slab with worn, chipped arrises and a pitched, tooled face standing a little proud
# of or back from its neighbours, set in a recessed lime mortar. Albedo grey-brown with each block its own tone.
#
#   Blender -b --factory-startup --python tools/blender/ashlar.py -- <out dir> [resolution scale]

import math
import os
import random
import sys

import bpy
from mathutils import Vector, noise

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tilebake as tb  # noqa: E402

OUT, SCALE = tb.args()
S = 4.0
JOINT = 0.014
DEPTH = 0.06
rng = random.Random(11)
scene = tb.reset()
group = tb.out_group(ao_distance=0.05, h_lo=0.0, h_hi=0.1)
tile = tb.new_collection()



def heightfield(name, w, h, top, spacing, profile):
    """A block's face as a grid of heights over [-w/2, w/2] x [-h/2, h/2]: `profile(x, y, d)` the height at a point
    `d` m in from the nearest edge; the outermost ring of points is set down at 0 (the joint)."""
    nx = max(4, int(round(w / spacing)))
    ny = max(4, int(round(h / spacing)))
    verts = []
    for j in range(ny + 1):
        y = -h / 2 + h * j / ny
        for i in range(nx + 1):
            x = -w / 2 + w * i / nx
            d = min(x + w / 2, w / 2 - x, y + h / 2, h / 2 - y)
            z = 0.0 if i in (0, nx) or j in (0, ny) else max(0.0, profile(x, y, d))
            verts.append((x, y, z))
    faces = []
    for j in range(ny):
        for i in range(nx):
            a = j * (nx + 1) + i
            faces.append((a, a + 1, a + nx + 2, a + nx + 1))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    for poly in mesh.polygons:
        poly.use_smooth = True
    return mesh


def stone(nodes, links, geometry):
    info = nodes.new('ShaderNodeObjectInfo')
    coord = nodes.new('ShaderNodeTexCoord')
    # Tooling and pitting: two noises for the bump.
    fine = nodes.new('ShaderNodeTexNoise')
    fine.inputs['Scale'].default_value = 60.0
    fine.inputs['Detail'].default_value = 10.0
    fine.inputs['Roughness'].default_value = 0.65
    links.new(coord.outputs['Generated' if False else 'Object'], fine.inputs['Vector'])
    pits = nodes.new('ShaderNodeTexVoronoi')
    pits.inputs['Scale'].default_value = 140.0
    links.new(coord.outputs['Object'], pits.inputs['Vector'])
    pit = nodes.new('ShaderNodeMapRange')
    pit.inputs['From Min'].default_value = 0.0
    pit.inputs['From Max'].default_value = 0.12
    pit.inputs['To Min'].default_value = -1.0
    pit.inputs['To Max'].default_value = 0.0
    pit.clamp = True
    links.new(pits.outputs['Distance'], pit.inputs['Value'])
    height = nodes.new('ShaderNodeMath')
    height.operation = 'MULTIPLY_ADD'
    links.new(pit.outputs['Result'], height.inputs[0])
    height.inputs[1].default_value = 0.6
    links.new(fine.outputs['Fac'], height.inputs[2])
    bump = nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.55
    bump.inputs['Distance'].default_value = 0.004
    links.new(height.outputs[0], bump.inputs['Height'])
    links.new(geometry.outputs['Normal'], bump.inputs['Normal'])
    # Colour: the block's own tone (Object Info random) through a ramp of grey-browns, mottled by a broad noise.
    ramp = nodes.new('ShaderNodeValToRGB')
    elements = ramp.color_ramp.elements
    elements[0].position = 0.0
    elements[0].color = (0.26, 0.245, 0.235, 1)
    elements[1].position = 1.0
    elements[1].color = (0.46, 0.42, 0.37, 1)
    mid = elements.new(0.45)
    mid.color = (0.35, 0.335, 0.33, 1)
    warm = elements.new(0.8)
    warm.color = (0.44, 0.36, 0.30, 1)
    mottle = nodes.new('ShaderNodeTexNoise')
    mottle.inputs['Scale'].default_value = 6.0
    mottle.inputs['Detail'].default_value = 6.0
    links.new(coord.outputs['Object'], mottle.inputs['Vector'])
    pick = nodes.new('ShaderNodeMath')
    pick.operation = 'MULTIPLY_ADD'
    links.new(mottle.outputs['Fac'], pick.inputs[0])
    pick.inputs[1].default_value = 0.35
    links.new(info.outputs['Random'], pick.inputs[2])
    shift = nodes.new('ShaderNodeMath')
    shift.operation = 'SUBTRACT'
    links.new(pick.outputs[0], shift.inputs[0])
    shift.inputs[1].default_value = 0.12
    links.new(shift.outputs[0], ramp.inputs['Fac'])
    # The pits and the tooling a little darker.
    shade = nodes.new('ShaderNodeMapRange')
    shade.inputs['From Min'].default_value = -0.6
    shade.inputs['From Max'].default_value = 1.0
    shade.inputs['To Min'].default_value = 0.72
    shade.inputs['To Max'].default_value = 1.08
    links.new(height.outputs[0], shade.inputs['Value'])
    colour = nodes.new('ShaderNodeVectorMath')
    colour.operation = 'SCALE'
    links.new(ramp.outputs['Color'], colour.inputs[0])
    links.new(shade.outputs['Result'], colour.inputs[3])
    rough = nodes.new('ShaderNodeMapRange')
    rough.inputs['To Min'].default_value = 0.78
    rough.inputs['To Max'].default_value = 0.97
    links.new(fine.outputs['Fac'], rough.inputs['Value'])
    return colour.outputs[0], rough.outputs['Result'], 0.0, 0.0, bump.outputs['Normal']


def mortar(nodes, links, geometry):
    bumped, fac = tb.noise_bump(nodes, links, geometry, scale=90.0, strength=0.6, distance=0.004, coords='Object')
    tone = nodes.new('ShaderNodeMapRange')
    tone.inputs['To Min'].default_value = 0.17
    tone.inputs['To Max'].default_value = 0.27
    links.new(fac, tone.inputs['Value'])
    colour = nodes.new('ShaderNodeCombineXYZ')
    for k, f in enumerate((1.0, 0.95, 0.86)):
        m = nodes.new('ShaderNodeMath')
        m.operation = 'MULTIPLY'
        m.inputs[1].default_value = f
        links.new(tone.outputs['Result'], m.inputs[0])
        links.new(m.outputs[0], colour.inputs[k])
    return colour.outputs[0], 0.97, 0.0, 0.0, bumped


stone_mat = tb.material('stone', group, stone)
mortar_mat = tb.material('mortar', group, mortar)

bpy.ops.mesh.primitive_plane_add(size=1, location=(S / 2, S / 2, 0))
bed = bpy.context.object
bed.scale = (S * 3, S * 3, 1)
bed.data.materials.append(mortar_mat)

# Courses up the wall: heights that add up to S.
heights = []
while sum(heights) < S - 0.45:
    heights.append(rng.uniform(0.26, 0.42))
heights.append(S - sum(heights))
y = 0.0
for course, height in enumerate(heights):
    lengths = []
    while sum(lengths) < S - 1.2:
        lengths.append(rng.uniform(0.45, 1.2))
    rest = S - sum(lengths)
    lengths.append(rest) if rest >= 0.45 else lengths.__setitem__(-1, lengths[-1] + rest)
    x = rng.uniform(0, 1.0)
    for index, length in enumerate(lengths):
        w, h = length - JOINT, height - JOINT
        top = DEPTH + rng.uniform(-0.01, 0.012)
        arris = rng.uniform(0.012, 0.03)
        seed = rng.uniform(0, 100)
        tilt = (rng.uniform(-0.012, 0.012), rng.uniform(-0.012, 0.012))
        cx, cy = x + length / 2, y + height / 2

        def profile(px, py, d, top=top, arris=arris, seed=seed, tilt=tilt, cx=cx, cy=cy):
            p = Vector(((cx + px) * 5.5, (cy + py) * 5.5, seed))
            lump = 0.022 * noise.fractal(p, 0.6, 2.0, 4)
            fine = 0.004 * noise.fractal(Vector(((cx + px) * 38, (cy + py) * 38, seed)), 0.55, 2.0, 3)
            # The arris: rounded off, and chipped where a second noise says so.
            chip = max(0.0, noise.noise(Vector(((cx + px) * 14, (cy + py) * 14, seed + 7)))) * 0.07
            reach = arris + chip
            edge = 0.0 if d >= reach else reach - math.sqrt(max(0.0, reach * reach - (reach - d) ** 2))
            return top + tilt[0] * px + tilt[1] * py + lump + fine - edge * 1.3

        mesh = heightfield(f'block_{course}_{index}', w, h, top, 0.007, profile)
        mesh.materials.append(stone_mat)
        block = bpy.data.objects.new(f'block_{course}_{index}', mesh)
        block.location = (cx, cy, 0)
        tb.link(block, tile)
        x += length
    y += height

tb.repeat_around(tile, S, S)
size = int(2048 * SCALE)
tb.camera(S, S, size, size)
tb.render_maps(group, OUT, 'ashlar', samples={'normal': 24, 'albedo': 16, 'orm': 96, 'height': 8}, modes=['normal', 'albedo', 'orm', 'height'])
