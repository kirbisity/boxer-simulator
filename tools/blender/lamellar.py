# Laced lamellar as tiling patches, in two styles, from museum and reconstruction references (credited on the comparison page):
#
# kozane  Japanese kebiki-odoshi (the o-yoroi's): four plates across and two rows up, 100 x 120 mm. Tall narrow plates with
#         rounded heads, overlapping sideways like shingles (the left edge under the plate to its left), brushed and a little
#         mottled; a pair of empty holes by the head, under them the small knot where the suspension braid comes through
#         from the row above, lower the oval knot of the row's binding cord (shita-garami); from under it the suspension
#         braid (odoshi-ito, about 20 mm wide) hangs as one fat, flat, braided loop per plate, packed close (kebiki), and
#         goes behind the next row's heads. Each row's heads stand in front of the bottom of the row above.
# steppe  Mongol, Chinese (Song, Jin, Yuan, Ming) and Tibetan iron lamellar: six plates across and two rows up, 90 x 100 mm.
#         Narrow plates about 20 x 72 mm (Met 788894: 70 x 19 mm, 13 holes; Carpini: a finger wide, a hand long, 8
#         holes) with rounded heads, overlapping a third sideways; flat thongs, a short vertical one through the head's
#         holes hanging the row, and the row's binding thong across the middle, showing as a stitch over each plate.
#
# Two masks (tilebake `mask`): R the suspension lacing, G the binding, so each can take the kit's colour.
#
#   Blender -b --factory-startup --python tools/blender/lamellar.py -- <out dir> [resolution scale] <kozane|steppe>

import math
import os
import random
import sys

import bpy
from mathutils import Vector, noise

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tilebake as tb  # noqa: E402

OUT, SCALE = tb.args()
STYLE = sys.argv[sys.argv.index('--') + 1:][2]
if STYLE == 'kozane':
    COLS, ROWS = 4, 2
    P = 0.025            # plate pitch across (m)
    RH = 0.06            # row pitch up
    PW = 0.030           # plate width (5 mm under the next plate)
    PH = RH * 1.3        # plate height (its foot behind the row below's heads)
else:
    COLS, ROWS = 6, 2
    P = 0.015
    RH = 0.05
    PW = 0.021
    PH = 0.072
W, H = COLS * P, ROWS * RH
BASE = 0.0015        # the plate's foot, out from the backing
TILT = 0.0034        # how much further out its head stands
SHINGLE = 0.0012     # how much higher its right edge stands than its left
THICK = 0.0010

rng = random.Random(23)
scene = tb.reset()
group = tb.out_group(ao_distance=0.006, h_lo=0.0, h_hi=0.012)
tile = tb.new_collection()


def plate_z(x, y):
    """The plate's front (plate-local: x across from its middle, y up from its foot)."""
    return BASE + TILT * (y / PH) + SHINGLE * (x / PW + 0.5) + 0.0004 * (1 - (2 * x / PW) ** 2) + THICK


def plate_mesh(name):
    radius = PW * 0.46
    shoulder = PH - radius
    nx, ny = 22, 70
    verts, faces = [], []
    for j in range(ny + 1):
        y = PH * j / ny
        for i in range(nx + 1):
            u = -1 + 2 * i / nx
            half = PW / 2
            if y > shoulder:
                d = (y - shoulder) / radius
                half *= math.sqrt(max(0.0, 1 - d * d)) * 0.998 + 0.002
            x = u * half
            verts.append((x, y, plate_z(x, y) - THICK))
    for j in range(ny):
        for i in range(nx):
            k = j * (nx + 1) + i
            faces.append((k, k + 1, k + nx + 2, k + nx + 1))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    for poly in mesh.polygons:
        poly.use_smooth = True
    return mesh


def tube_mesh(name, path, width, thick, n=48, m=18):
    """A flat braid along `path(t) -> (x, y, z)`, its half-width `width(t)` and half-thickness `thick(t)`, lying face up."""
    verts, faces = [], []
    for i in range(n + 1):
        t = i / n
        p = Vector(path(t))
        q = Vector(path(min(1.0, t + 1e-3))) - Vector(path(max(0.0, t - 1e-3)))
        tangent = q.normalized()
        side = tangent.cross(Vector((0, 0, 1)))
        if side.length < 1e-6:
            side = Vector((1, 0, 0))
        side.normalize()
        up = side.cross(tangent).normalized()
        if up.z < 0:
            up = -up
        a, b = width(t), thick(t)
        for j in range(m):
            s = math.tau * j / m
            verts.append(tuple(p + side * (math.cos(s) * a) + up * (math.sin(s) * b)))
    for i in range(n):
        for j in range(m):
            k = i * m + j
            faces.append((k, i * m + (j + 1) % m, (i + 1) * m + (j + 1) % m, (i + 1) * m + j))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    for poly in mesh.polygons:
        poly.use_smooth = True
    return mesh


def ellipsoid(name, rx, ry, rz):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=1)
    obj = bpy.context.object
    for collection in obj.users_collection:
        collection.objects.unlink(obj)
    obj.name = name
    obj.scale = (rx, ry, rz)
    for poly in obj.data.polygons:
        poly.use_smooth = True
    return obj


def steel(nodes, links, geometry):
    info = nodes.new('ShaderNodeObjectInfo')
    coord = nodes.new('ShaderNodeTexCoord')
    # Brushed along the plate (stretched noise), mottled across it.
    stretch = nodes.new('ShaderNodeVectorMath')
    stretch.operation = 'MULTIPLY'
    stretch.inputs[1].default_value = (1.0, 0.06, 1.0)
    links.new(coord.outputs['Object'], stretch.inputs[0])
    brush = nodes.new('ShaderNodeTexNoise')
    brush.inputs['Scale'].default_value = 900.0
    brush.inputs['Detail'].default_value = 4.0
    links.new(stretch.outputs[0], brush.inputs['Vector'])
    mottle = nodes.new('ShaderNodeTexNoise')
    mottle.inputs['Scale'].default_value = 70.0
    mottle.inputs['Detail'].default_value = 6.0
    links.new(coord.outputs['Object'], mottle.inputs['Vector'])
    bump = nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.12
    bump.inputs['Distance'].default_value = 0.0001
    links.new(brush.outputs['Fac'], bump.inputs['Height'])
    links.new(geometry.outputs['Normal'], bump.inputs['Normal'])
    tone = nodes.new('ShaderNodeMath')
    tone.operation = 'MULTIPLY_ADD'
    links.new(mottle.outputs['Fac'], tone.inputs[0])
    tone.inputs[1].default_value = 0.18
    tone.inputs[2].default_value = 0.74
    tone2 = nodes.new('ShaderNodeMath')
    tone2.operation = 'MULTIPLY_ADD'
    links.new(brush.outputs['Fac'], tone2.inputs[0])
    tone2.inputs[1].default_value = 0.1
    links.new(tone.outputs[0], tone2.inputs[2])
    shift = nodes.new('ShaderNodeMath')
    shift.operation = 'MULTIPLY_ADD'
    links.new(info.outputs['Random'], shift.inputs[0])
    shift.inputs[1].default_value = 0.06
    links.new(tone2.outputs[0], shift.inputs[2])
    colour = nodes.new('ShaderNodeCombineXYZ')
    for k in range(3):
        links.new(shift.outputs[0], colour.inputs[k])
    rough = nodes.new('ShaderNodeMapRange')
    rough.inputs['To Min'].default_value = 0.22
    rough.inputs['To Max'].default_value = 0.42
    links.new(mottle.outputs['Fac'], rough.inputs['Value'])
    return colour.outputs[0], rough.outputs['Result'], 1.0, 0.0, bump.outputs['Normal'], 0.0


def braid(scale, which):
    """A braided cord: two crossing diagonal ridges (a herringbone), shaded in the grooves; `which` its mask (1 or 2)."""
    def build(nodes, links, geometry):
        coord = nodes.new('ShaderNodeTexCoord')
        waves = []
        for direction in ('DIAGONAL', 'Y'):
            wave = nodes.new('ShaderNodeTexWave')
            wave.wave_type = 'BANDS'
            wave.bands_direction = direction
            wave.inputs['Scale'].default_value = scale
            wave.inputs['Distortion'].default_value = 0.4
            links.new(coord.outputs['Object'], wave.inputs['Vector'])
            waves.append(wave)
        both = nodes.new('ShaderNodeMath')
        both.operation = 'MULTIPLY'
        links.new(waves[0].outputs['Fac'], both.inputs[0])
        links.new(waves[1].outputs['Fac'], both.inputs[1])
        bump = nodes.new('ShaderNodeBump')
        bump.inputs['Strength'].default_value = 0.7
        bump.inputs['Distance'].default_value = 0.0003
        links.new(both.outputs[0], bump.inputs['Height'])
        links.new(geometry.outputs['Normal'], bump.inputs['Normal'])
        tone = nodes.new('ShaderNodeMapRange')
        tone.inputs['To Min'].default_value = 0.62
        tone.inputs['To Max'].default_value = 0.95
        links.new(both.outputs[0], tone.inputs['Value'])
        colour = nodes.new('ShaderNodeCombineXYZ')
        for k in range(3):
            links.new(tone.outputs['Result'], colour.inputs[k])
        return colour.outputs[0], 0.82, 0.0, 1.0 if which == 1 else 0.0, bump.outputs['Normal'], 1.0 if which == 2 else 0.0
    return build


def dark(nodes, links, geometry):
    return (0.03, 0.025, 0.02), 0.9, 0.0, 0.0, None, 0.0


steel_mat = tb.material('steel', group, steel)
odoshi_mat = tb.material('odoshi', group, braid(1400.0, 1))
binding_mat = tb.material('binding', group, braid(1800.0, 2))
dark_mat = tb.material('dark', group, dark)

bpy.ops.mesh.primitive_plane_add(size=1, location=(W / 2, H / 2, 0))
backing = bpy.context.object
backing.scale = (W * 3, H * 3, 1)
backing.data.materials.append(dark_mat)

for row in range(ROWS):
    top = (row + 1) * RH
    foot = top - PH
    for col in range(COLS):
        cx = (col + 0.5) * P
        seed = rng.uniform(0, 100)
        mesh = plate_mesh(f'plate_{row}_{col}')
        mesh.materials.append(steel_mat)
        plate = bpy.data.objects.new(f'plate_{row}_{col}', mesh)
        plate.location = (cx + rng.uniform(-0.0002, 0.0002), foot, 0)
        plate.rotation_euler = (0, 0, rng.uniform(-0.01, 0.01))
        solid = plate.modifiers.new('solid', 'SOLIDIFY')
        solid.thickness = THICK
        solid.offset = -1
        bevel = plate.modifiers.new('bevel', 'BEVEL')
        bevel.width = 0.0003
        bevel.segments = 3
        bevel.limit_method = 'ANGLE'
        tb.link(plate, tile)

        def on_plate(x, y_from_top, lift=0.0):
            y = PH - y_from_top
            return (x, y, plate_z(x, y) + lift)

        if STYLE == 'steppe':
            # Holes: a pair by the head, a pair at the middle (the binding), a pair low (hidden by the row below).
            for at in (0.07, 0.2, 0.5, 0.82):
                for side in (-1, 1):
                    hole = ellipsoid(f'hole_{row}_{col}_{at}_{side}', 0.0009, 0.0009, 0.0002)
                    hole.data.materials.append(dark_mat)
                    hole.parent = plate
                    hole.location = on_plate(side * 0.0045, RH * at)
                    tb.link(hole, tile)
            # The suspension thong: down from the head's top hole to the next, a flat leather strip.
            def hang(t):
                y_from_top = RH * (0.05 + 0.17 * t)
                x, y, z = on_plate(0.0, y_from_top, 0.0006 + 0.0006 * math.sin(math.pi * t))
                return (x, y, z)
            thong = tube_mesh(f'hang_{row}_{col}', hang, lambda t: 0.0021, lambda t: 0.0006, n=16, m=12)
            thong.materials.append(odoshi_mat)
            obj = bpy.data.objects.new(f'hang_{row}_{col}', thong)
            obj.parent = plate
            tb.link(obj, tile)
            # The binding thong across the plate between its middle holes, over to the next plate.
            def bind_path(t):
                x = -0.0052 + 0.0104 * t
                x_, y, z = on_plate(x, RH * 0.5, 0.0005 + 0.0005 * math.sin(math.pi * t))
                return (x, y, z)
            binding = tube_mesh(f'bind_{row}_{col}', bind_path, lambda t: 0.0019, lambda t: 0.0006, n=16, m=12)
            binding.materials.append(binding_mat)
            obj = bpy.data.objects.new(f'bind_{row}_{col}', binding)
            obj.parent = plate
            tb.link(obj, tile)
            continue
        # The two small empty holes by the head.
        for side in (-1, 1):
            hole = ellipsoid(f'hole_{row}_{col}_{side}', 0.0011, 0.0011, 0.0002)
            hole.data.materials.append(dark_mat)
            hole.parent = plate
            hole.location = on_plate(side * 0.0052, RH * 0.1)
            tb.link(hole, tile)
        # The suspension braid's end coming through from the row above.
        knot = ellipsoid(f'knot_{row}_{col}', 0.0031, 0.0045, 0.0016)
        knot.data.materials.append(odoshi_mat)
        knot.parent = plate
        knot.location = on_plate(0.0008, RH * 0.25, 0.0004)
        knot.rotation_euler = (0, 0, rng.uniform(-0.15, 0.15))
        tb.link(knot, tile)
        # The binding cord's knot.
        bind = ellipsoid(f'bind_{row}_{col}', 0.0036, 0.0052, 0.0020)
        bind.data.materials.append(binding_mat)
        bind.parent = plate
        bind.location = on_plate(0.0006, RH * 0.43, 0.0006)
        bind.rotation_euler = (0, 0, rng.uniform(-0.12, 0.12))
        tb.link(bind, tile)
        # The suspension braid: from under the binding knot down over the plate, bunched, behind the next row's head.
        start = PH - RH * 0.56
        end = start - RH * 0.58
        sway = rng.uniform(-0.0012, 0.0012)
        bunch = rng.uniform(0.85, 1.15)

        def path(t, start=start, end=end, sway=sway):
            y = start + (end - start) * t
            surface = plate_z(0.0, max(0.0, y)) if y > 0 else BASE + THICK
            bulge = 0.0036 * math.sin(math.pi * min(1.0, t * 1.15)) ** 0.8
            tuck = -0.0034 * max(0.0, (t - 0.78) / 0.22) ** 1.5
            return (sway * math.sin(math.pi * t) + 0.0006 * noise.noise(Vector((t * 3, seed, 0))), y, surface + 0.0012 + bulge + tuck)

        loop = tube_mesh(f'odoshi_{row}_{col}', path,
                         lambda t, b=bunch: 0.0095 * b * (0.82 + 0.3 * math.sin(math.pi * t)) * (1 - 0.25 * max(0.0, t - 0.8) / 0.2),
                         lambda t: 0.0017 * (0.9 + 0.3 * math.sin(math.pi * t)))
        loop.materials.append(odoshi_mat)
        braid_obj = bpy.data.objects.new(f'odoshi_{row}_{col}', loop)
        braid_obj.parent = plate
        tb.link(braid_obj, tile)

tb.repeat_around(tile, W, H)
size = int(2048 * SCALE)
tb.camera(W, H, size, round(size * H / W))
tb.render_maps(group, OUT, 'kozane' if STYLE == 'kozane' else 'lamellae', samples={'normal': 24, 'albedo': 16, 'orm': 96, 'height': 8, 'mask': 16})
