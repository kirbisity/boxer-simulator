# Laced iron lamellae (the steppe's and the Ming's) as a tiling patch: two plates across and two rows up, each row
# offset half a plate from the next, every plate a hammered, slightly dished iron leaf with a rounded top, its foot
# standing out over the top of the row below; two bands of lacing across each row (a short stitch over each plate
# between its punched holes), the leather backing showing between the plates. The tile is 60 mm square (a plate's
# column 30 mm, a row 30 mm), as the game's UVs give it: u round the piece by plate columns, v up it by rows.
#
#   Blender -b --factory-startup --python tools/blender/lamellae.py -- <out dir> [resolution scale]

import math
import os
import random
import sys

import bmesh
import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tilebake as tb  # noqa: E402

OUT, SCALE = tb.args()
COL = 0.03
ROW = 0.03
W, H = 2 * COL, 2 * ROW
PLATE_W = COL * 0.88
OVERLAP = 0.3          # of a row, below the plate's own row (lying under the foot of... the row below lies under it)
PLATE_H = ROW * (1 + OVERLAP)
TOP_Z = 0.0016         # the plate's top, out from the backing (m)
TILT = 0.0036          # how much further out its foot stands
DISH = 0.0016          # how much the middle stands out over the edges
THICK = 0.0011
HOLES = [0.36, 0.62]   # heights up the plate of the two rows of holes (share of the plate)
HOLE_X = 0.3           # the holes, either side of the middle (share of the plate's width)
CORD_R = 0.00062

rng = random.Random(7)
scene = tb.reset()
group = tb.out_group(ao_distance=0.006, h_lo=0.0, h_hi=0.008)
tile = tb.new_collection()


def surface_z(x, y):
    """The plate's front, out from the backing, at (x across, y up the plate from its foot), plate-local."""
    s = y / PLATE_H
    across = x / (PLATE_W / 2)
    return TOP_Z + TILT * (1 - s) + DISH * (1 - across * across) + THICK


def plate_mesh(seed):
    """One plate: a grid squeezed into the rounded-top outline, bent to the plate's surface, given thickness."""
    mesh = bpy.data.meshes.new(f'plate{seed}')
    bm = bmesh.new()
    nx, ny = 20, 44
    radius = PLATE_W * 0.5
    shoulder = PLATE_H - radius
    grid = []
    for j in range(ny + 1):
        y = PLATE_H * j / ny
        row = []
        for i in range(nx + 1):
            u = -1 + 2 * i / nx
            half = PLATE_W / 2
            if y > shoulder:
                d = (y - shoulder) / radius
                half *= math.sqrt(max(0.0, 1 - d * d)) * 0.999 + 0.001
            x = u * half
            row.append(bm.verts.new((x, y, surface_z(x, y) - THICK)))
        grid.append(row)
    for j in range(ny):
        for i in range(nx):
            bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = True
    return mesh


def iron(nodes, links, geometry):
    info = nodes.new('ShaderNodeObjectInfo')
    bumped, fac = tb.noise_bump(nodes, links, geometry, scale=140.0, strength=0.3, distance=0.0003, detail=8.0, coords='Object')
    tone = nodes.new('ShaderNodeMapRange')
    tone.inputs['To Min'].default_value = 0.86
    tone.inputs['To Max'].default_value = 1.0
    mix = nodes.new('ShaderNodeMath')
    mix.operation = 'MULTIPLY_ADD'
    mix.inputs[1].default_value = 0.6
    links.new(info.outputs['Random'], mix.inputs[0])
    links.new(fac, mix.inputs[2])
    links.new(mix.outputs[0], tone.inputs['Value'])
    tone.inputs['From Max'].default_value = 1.6
    colour = nodes.new('ShaderNodeCombineXYZ')
    for k, f in enumerate((1.0, 1.0, 1.03)):
        m = nodes.new('ShaderNodeMath')
        m.operation = 'MULTIPLY'
        m.inputs[1].default_value = f
        links.new(tone.outputs['Result'], m.inputs[0])
        links.new(m.outputs[0], colour.inputs[k])
    rough = nodes.new('ShaderNodeMapRange')
    rough.inputs['To Min'].default_value = 0.2
    rough.inputs['To Max'].default_value = 0.42
    links.new(fac, rough.inputs['Value'])
    rough.inputs['From Min'].default_value = 0.3
    rough.inputs['From Max'].default_value = 0.7
    return colour.outputs[0], rough.outputs['Result'], 1.0, 0.0, bumped


def cord(nodes, links, geometry):
    # A twisted cord: a wave along it for the twist.
    coord = nodes.new('ShaderNodeTexCoord')
    wave = nodes.new('ShaderNodeTexWave')
    wave.wave_type = 'BANDS'
    wave.bands_direction = 'DIAGONAL'
    wave.inputs['Scale'].default_value = 900.0
    wave.inputs['Distortion'].default_value = 1.5
    links.new(coord.outputs['Object'], wave.inputs['Vector'])
    bump = nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.6
    bump.inputs['Distance'].default_value = 0.0002
    links.new(wave.outputs['Fac'], bump.inputs['Height'])
    links.new(geometry.outputs['Normal'], bump.inputs['Normal'])
    tone = nodes.new('ShaderNodeMapRange')
    tone.inputs['To Min'].default_value = 0.6
    tone.inputs['To Max'].default_value = 0.85
    links.new(wave.outputs['Fac'], tone.inputs['Value'])
    colour = nodes.new('ShaderNodeCombineXYZ')
    for k in range(3):
        links.new(tone.outputs['Result'], colour.inputs[k])
    return colour.outputs[0], 0.85, 0.0, 1.0, bump.outputs['Normal']


def leather(nodes, links, geometry):
    bumped, fac = tb.noise_bump(nodes, links, geometry, scale=300.0, strength=0.3, distance=0.0002, coords='Object')
    return (0.09, 0.065, 0.045), 0.8, 0.0, 0.0, bumped


def hole(nodes, links, geometry):
    return (0.02, 0.018, 0.015), 0.9, 0.0, 0.0, None


iron_mat = tb.material('iron', group, iron)
cord_mat = tb.material('cord', group, cord)
leather_mat = tb.material('leather', group, leather)
hole_mat = tb.material('hole', group, hole)

bpy.ops.mesh.primitive_plane_add(size=1, location=(W / 2, H / 2, 0))
backing = bpy.context.object
backing.scale = (W * 3, H * 3, 1)
backing.data.materials.append(leather_mat)


def cord_curve(name, points):
    """A round cord through the points (x, y, z), its ends tucked into the holes."""
    data = bpy.data.curves.new(name, 'CURVE')
    data.dimensions = '3D'
    data.bevel_depth = CORD_R
    data.bevel_resolution = 4
    data.resolution_u = 8
    spline = data.splines.new('BEZIER')
    spline.bezier_points.add(len(points) - 1)
    for point, (x, y, z) in zip(spline.bezier_points, points):
        point.co = (x, y, z)
        point.handle_left_type = 'AUTO'
        point.handle_right_type = 'AUTO'
    data.materials.append(cord_mat)
    obj = bpy.data.objects.new(name, data)
    obj.scale = (1, 1, 1)
    return obj


hole_mesh = bpy.data.meshes.new('hole')
bm = bmesh.new()
bmesh.ops.create_circle(bm, cap_ends=True, segments=16, radius=0.00075)
bm.to_mesh(hole_mesh)
bm.free()
hole_mesh.materials.append(hole_mat)

for row in range(2):
    for col in range(2):
        seed = row * 2 + col
        mesh = plate_mesh(seed)
        mesh.materials.append(iron_mat)
        plate = bpy.data.objects.new(f'plate_{row}_{col}', mesh)
        cx = (col + 0.5 + 0.5 * row) * COL
        foot = row * ROW - OVERLAP * ROW
        jitter = (rng.uniform(-0.0003, 0.0003), rng.uniform(-0.0004, 0.0004))
        plate.location = (cx + jitter[0], foot + jitter[1], rng.uniform(-0.0001, 0.0002))
        plate.rotation_euler = (0, 0, rng.uniform(-0.012, 0.012))
        solid = plate.modifiers.new('solid', 'SOLIDIFY')
        solid.thickness = THICK
        solid.offset = -1
        solid.use_even_offset = True
        bevel = plate.modifiers.new('bevel', 'BEVEL')
        bevel.width = 0.00035
        bevel.segments = 3
        bevel.limit_method = 'ANGLE'
        tb.link(plate, tile)
        # The holes and the stitches over the plate, in the plate's own frame (parented, so they move with it).
        for at in HOLES:
            y = PLATE_H * at
            for side in (-1, 1):
                x = side * HOLE_X * PLATE_W / 2 * 2
                disc = bpy.data.objects.new(f'hole_{seed}_{at}_{side}', hole_mesh)
                disc.parent = plate
                disc.location = (x, y, surface_z(x, y) + 0.00003)
                tb.link(disc, tile)
            x0 = -HOLE_X * PLATE_W
            x1 = HOLE_X * PLATE_W
            points = []
            for k in range(7):
                x = x0 + (x1 - x0) * k / 6
                lift = CORD_R * (0.15 if k in (0, 6) else 0.85)
                points.append((x, y, surface_z(x, y) + lift))
            stitch = cord_curve(f'cord_{seed}_{at}', points)
            stitch.parent = plate
            tb.link(stitch, tile)

tb.repeat_around(tile, W, H)
size = int(1024 * SCALE)
tb.camera(W, H, size, size)
tb.render_maps(group, OUT, 'lamellae', samples={'normal': 32, 'albedo': 16, 'orm': 128, 'height': 16, 'mask': 16})
