# The photo heads' base model from the user's base meshes (Base_Male_Mesh.blend, female.blend, 2026-11-10): the head of the
# body, its modifiers applied (the mirror, the subdivision), cut at the neck, put in the game's head frame (x forward, y up,
# z to the left, in head radii: the vertex at +1.078, the chin at -1.158, the eyes about midway, as tools/headmodel.py's), and
# sampled as its outer surface's distance along each direction from the centre (the ears passed through: the game has its
# own). Writes <out>/<sex>.json in tools/headmodel.py's form (its `pack` makes src/headmodel-data.js).
#
#   Blender -b <file.blend> --python tools/blender/headfrombase.py -- <out dir> <male|female> [object name]

import json
import math
import os
import sys

import bpy
import bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree

args = sys.argv[sys.argv.index('--') + 1:]
OUT, SEX = args[0], args[1]
NAME = args[2] if len(args) > 2 else None
POLARS, AZIMUTHS = 96, 144
VERTEX, CHIN = 1.078, -1.158

obj = bpy.data.objects[NAME] if NAME else max((o for o in bpy.data.objects if o.type == 'MESH'), key=lambda o: len(o.data.vertices))
depsgraph = bpy.context.evaluated_depsgraph_get()
mesh = obj.evaluated_get(depsgraph).to_mesh()
world = obj.matrix_world
points = [world @ v.co for v in mesh.vertices]
top = max(p.z for p in points)
bottom = min(p.z for p in points)
height = top - bottom
# The midline profile over the top of the body: the front-most point at each height (the body faces -y).
band = [p for p in points if p.z > top - 0.17 * height and abs(p.x) < 0.01 * height]
def front_at(z, half=0.004):
    near = [p.y for p in band if abs(p.z - z) < half * height]
    return min(near) if near else None
zs = [top - k * 0.001 * height for k in range(170)]
profile = [(z, front_at(z)) for z in zs]
profile = [(z, y) for z, y in profile if y is not None]
nose = min(profile, key=lambda zy: zy[1])
# The chin: below the nose, the lowest height before the profile falls back steeply into the throat.
below = [(z, y) for z, y in profile if z < nose[0] - 0.02 * height]
chin = below[0]
for (z0, y0), (z1, y1) in zip(below, below[1:]):
    if y1 - y0 > 0.25 * (z0 - z1) * 4:
        chin = (z0, y0)
        break
    chin = (z1, y1)
# (A check on the chin found: the nose's tip sits about 0.68 of the way from the vertex to the chin (Farkas 1994: the vertex to
# the subnasale ~16.5 of 23.2 cm). Where the profile's fall misled it (a long throat, a hair cap), the chin is put by that.)
share = (top - nose[0]) / max(1e-9, top - chin[0])
if not 0.62 < share < 0.74:
    chin = (top - (top - nose[0]) / 0.68, None)
# The scale: the head's length (glabella to the back of the skull, at the brow's height) the hand-built head's, 2.06 radii (the
# vertex to the chin then as the mesh has it); the vertex at VERTEX.
head = [p for p in points if p.z > top - 0.2 * height]
back = max(p.y for p in head if p.z > top - 0.12 * height)
brow_z = top - 0.42 * (top - nose[0])
brow = front_at(brow_z, 0.01) or min(p.y for p in head)
scale = 2.06 / (back - brow)
chin_y = (chin[0] - top) * scale + VERTEX if chin[1] is not None else VERTEX - (top - nose[0]) * scale / 0.68
def to_game(p):
    return Vector(((back - p.y) * scale - 1.03, (p.z - top) * scale + VERTEX, p.x * scale))
CHIN = round(chin_y, 3)
bm = bmesh.new()
bm.from_mesh(mesh)
bm.transform(world)
for v in bm.verts:
    v.co = to_game(v.co)
# The neck kept down a little below the chin, as a stub under the jaw (the body's own neck covers it); the rest cut away.
cut = CHIN - 0.45
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.y < cut], context='VERTS')
tree = BVHTree.FromBMesh(bm)
def side_band(polar, azimuth):
    # Round the ears: the head's side from its centre outward (the first surface met is the skull's, the ear outside it).
    y = math.cos(polar)
    return 0.85 < abs(azimuth) < 2.3 and -0.65 < y < 0.4
radii = []
missing = 0
for row in range(POLARS + 1):
    polar = math.pi * row / POLARS
    for column in range(AZIMUTHS):
        azimuth = -math.pi + 2 * math.pi * column / AZIMUTHS
        d = Vector((math.sin(polar) * math.cos(azimuth), math.cos(polar), math.sin(polar) * math.sin(azimuth)))
        distance = None
        if side_band(polar, azimuth):
            hit = tree.ray_cast(d * 0.05, d)
            if hit[0] is not None:
                distance = hit[0].length
        else:
            hit = tree.ray_cast(d * 3, -d)
            if hit[0] is not None:
                distance = hit[0].length
        if distance is None:
            missing += 1
        radii.append(distance)
# Holes (an open eyelid, the neck's cut): read from the samples round them.
for _ in range(20):
    for index, value in enumerate(radii):
        if value is None:
            row, column = divmod(index, AZIMUTHS)
            near = [radii[r * AZIMUTHS + (c % AZIMUTHS)] for r, c in [(row - 1, column), (row + 1, column), (row, column - 1), (row, column + 1)] if 0 <= r <= POLARS]
            near = [v for v in near if v is not None]
            if near:
                radii[index] = sum(near) / len(near)
radii = [round(v if v is not None else 0.6, 4) for v in radii]
marks = {'vertex': VERTEX, 'chin': CHIN, 'scale': round(scale, 5), 'missing': missing, 'noseTip': round(to_game(Vector((0, nose[1], nose[0]))).x, 3)}
json.dump({'polars': POLARS, 'azimuths': AZIMUTHS, SEX: {'landmarks': marks, 'radii': radii}}, open(os.path.join(OUT, f'{SEX}.json'), 'w'))
print('HEADBASE', SEX, json.dumps(marks))
