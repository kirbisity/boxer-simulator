# Riveted mail (European four-in-one) as a tiling patch: rows of flattened round-wire rings, each row leaning the
# other way from the next, every ring through two above and two below, alternate rows closed with a rivet; the
# padded coat under it showing through the gaps. 8 rings across, 12 rows up: a tile of 48 mm square.
#
#   Blender -b --factory-startup --python tools/blender/mail.py -- <out dir> [resolution scale]

import math
import os
import sys

import bmesh
import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tilebake as tb  # noqa: E402

OUT, SCALE = tb.args()
COLS, ROWS = 8, 12
PX = 0.0060            # ring pitch along a row (m)
W = COLS * PX
PY = W / ROWS          # row pitch
R = 0.0040             # ring's centre-line radius
WIRE_A, WIRE_B = 0.0008, 0.00045   # the wire's half-width in the ring's plane, and its half-thickness
LEAN = math.radians(40)

scene = tb.reset()
group = tb.out_group(ao_distance=0.0035, h_lo=0.0, h_hi=0.006)
tile = tb.new_collection()


def ring_mesh():
    """A flattened torus: an elliptical wire section swept round a circle."""
    mesh = bpy.data.meshes.new('ring')
    bm = bmesh.new()
    major, minor = 48, 12
    verts = []
    for i in range(major):
        a = math.tau * i / major
        ca, sa = math.cos(a), math.sin(a)
        row = []
        for j in range(minor):
            b = math.tau * j / minor
            rad = R + WIRE_A * math.cos(b)
            row.append(bm.verts.new((ca * rad, sa * rad, WIRE_B * math.sin(b))))
        verts.append(row)
    for i in range(major):
        for j in range(minor):
            bm.faces.new((verts[i][j], verts[(i + 1) % major][j], verts[(i + 1) % major][(j + 1) % minor], verts[i][(j + 1) % minor]))
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = True
    return mesh


def rivet_mesh():
    """The flattened head of a rivet where the ring's ends overlap."""
    mesh = bpy.data.meshes.new('rivet')
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=8, radius=1.0)
    bmesh.ops.scale(bm, vec=(0.0009, 0.0007, 0.00055), verts=bm.verts)
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = True
    return mesh


def metal(nodes, links, geometry):
    info = nodes.new('ShaderNodeObjectInfo')
    bumped, fac = tb.noise_bump(nodes, links, geometry, scale=900.0, strength=0.25, distance=0.00004, coords='Object')
    # Each ring a little brighter or darker, a little more or less worn.
    ramp = nodes.new('ShaderNodeMapRange')
    ramp.inputs['To Min'].default_value = 0.78
    ramp.inputs['To Max'].default_value = 0.95
    links.new(info.outputs['Random'], ramp.inputs['Value'])
    tint = nodes.new('ShaderNodeCombineXYZ')
    for k, f in enumerate((1.0, 1.01, 1.04)):
        m = nodes.new('ShaderNodeMath')
        m.operation = 'MULTIPLY'
        m.inputs[1].default_value = f
        links.new(ramp.outputs['Result'], m.inputs[0])
        links.new(m.outputs[0], tint.inputs[k])
    rough = nodes.new('ShaderNodeMapRange')
    rough.inputs['To Min'].default_value = 0.22
    rough.inputs['To Max'].default_value = 0.5
    mix = nodes.new('ShaderNodeMath')
    mix.operation = 'ADD'
    links.new(info.outputs['Random'], mix.inputs[0])
    links.new(fac, mix.inputs[1])
    half = nodes.new('ShaderNodeMath')
    half.operation = 'MULTIPLY'
    half.inputs[1].default_value = 0.5
    links.new(mix.outputs[0], half.inputs[0])
    links.new(half.outputs[0], rough.inputs['Value'])
    return tint.outputs[0], rough.outputs['Result'], 1.0, 0.0, bumped


def cloth(nodes, links, geometry):
    bumped, fac = tb.noise_bump(nodes, links, geometry, scale=2500.0, strength=0.4, distance=0.0002, coords='Object')
    return (0.16, 0.13, 0.10), 0.95, 0.0, 0.0, bumped


ring_mat = tb.material('ring', group, metal)
cloth_mat = tb.material('cloth', group, cloth)
ring = ring_mesh()
ring.materials.append(ring_mat)
rivet = rivet_mesh()
rivet.materials.append(ring_mat)

# The padded coat under the mail.
bpy.ops.mesh.primitive_plane_add(size=1, location=(W / 2, W / 2, 0))
plane = bpy.context.object
plane.scale = (W * 3, W * 3, 1)
plane.data.materials.append(cloth_mat)
for collection in plane.users_collection:
    collection.objects.unlink(plane)
scene.collection.objects.link(plane)

lift = R * math.sin(LEAN) + WIRE_B + 0.0003
for row in range(ROWS):
    lean = LEAN if row % 2 == 0 else -LEAN
    for col in range(COLS):
        x = (col + 0.5 * (row % 2)) * PX
        y = (row + 0.5) * PY
        obj = bpy.data.objects.new(f'ring_{row}_{col}', ring)
        obj.location = (x, y, lift)
        obj.rotation_euler = (0, lean, 0)
        tb.link(obj, tile)
        if row % 2 == 1:
            # The rivet on the ring's upper side, where the flattened ends overlap.
            head = bpy.data.objects.new(f'rivet_{row}_{col}', rivet)
            head.parent = obj
            head.location = (0, R, WIRE_B * 0.9)
            tb.link(head, tile)

tb.repeat_around(tile, W, W)
size = int(1024 * SCALE)
tb.camera(W, W, size, size)
tb.render_maps(group, OUT, 'mail', samples={'normal': 32, 'albedo': 16, 'orm': 128, 'height': 16, 'mask': 4}, modes=['normal', 'albedo', 'orm', 'height'])
