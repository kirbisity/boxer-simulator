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
# The subdivision kept low (a head of a few thousand points: the game draws crowds of them): a dense mesh at none, a light one
# (the female's, mirrored) at one level.
for modifier in obj.modifiers:
    if modifier.type == 'SUBSURF':
        modifier.levels = 0 if len(obj.data.vertices) > 8000 else 1
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
# ---- The face's landmarks on the mesh (game frame) -------------------------------------------------------------------------
mid = [v.co for v in bm.verts if abs(v.co.z) < 0.02 and v.co.x > 0.3]
def front_x(y, half=0.015):
    near = [p.x for p in mid if abs(p.y - y) < half]
    return max(near) if near else None
steps = [CHIN - 0.45 + k * 0.005 for k in range(int((0.2 - CHIN + 0.45) / 0.005))]
prof = [(y, front_x(y)) for y in reversed(steps)]
prof = [(y, x) for y, x in prof if x is not None]
tip = max((yx for yx in prof if -0.8 < yx[0] < 0.0), key=lambda yx: yx[1])
below_tip = [yx for yx in prof if yx[0] < tip[0]]
below_tip.sort(key=lambda yx: -yx[0])
def turns(seq):
    out = []
    for a, b, c in zip(seq, seq[1:], seq[2:]):
        if b[1] < a[1] and b[1] <= c[1]:
            out.append(('min', b))
        elif b[1] > a[1] and b[1] >= c[1]:
            out.append(('max', b))
    return out
# The chin, measured: below the lips the chin's front (pogonion, the profile's most forward), then down it to where the
# surface has turned under (the profile 0.12 behind it): the menton. The vertex-to-chin scale and the cut were set from a
# first guess at it; the chin's landmark is this.
lower = [yx for yx in below_tip if yx[0] < tip[0] - 0.3]
pogonion = max(lower[:int(len(lower) * 0.7) or 1], key=lambda yx: yx[1]) if lower else (CHIN, None)
under = [yx for yx in lower if yx[0] < pogonion[0] and yx[1] < pogonion[1] - 0.12]
if under:
    CHIN = round(under[0][0], 3)
marks_seq = turns(below_tip)
mins = [m[1] for m in marks_seq if m[0] == 'min']
# The subnasale: the first hollow under the tip; the lip seam: the hollow nearest 0.795 of the way from the vertex to the chin.
subnasale = mins[0] if mins else (tip[0] - 0.12, tip[1])
expected = VERTEX - 0.795 * (VERTEX - CHIN)
seam = min(mins[1:] or mins, key=lambda yx: abs(yx[0] - expected)) if mins else (expected, None)
# The eyes: the eyeballs' centres (a cornea object in the file) or the middle of the eyelids' opening (the mesh's open edges
# in front of the face).
eye_points = []
cornea = bpy.data.objects.get('cornea')
if cornea is not None:
    cmesh = cornea.evaluated_get(depsgraph).to_mesh()
    cps = [to_game(cornea.matrix_world @ v.co) for v in cmesh.vertices]
    for sign in (1, -1):
        side = [p for p in cps if p.z * sign > 0]
        if side:
            eye_points.append(sum(side, Vector()) / len(side))
if not eye_points:
    edges = [e for e in bm.edges if e.is_boundary]
    open_verts = {v for e in edges for v in e.verts if v.co.x > 0.4 and -0.4 < v.co.y < 0.35 and abs(v.co.z) > 0.08}
    for sign in (1, -1):
        side = [v.co for v in open_verts if v.co.z * sign > 0]
        if side:
            eye_points.append(sum(side, Vector()) / len(side))
eye_y = sum(p.y for p in eye_points) / len(eye_points) if eye_points else VERTEX - 0.505 * (VERTEX - CHIN)
eye_z = sum(abs(p.z) for p in eye_points) / len(eye_points) if eye_points else None
# The skull's half breadth at the eyes' height (the ears not counted), as the game's texture lays a face across a head.
def half_breadth(y):
    best = 0
    for v in bm.verts:
        if abs(v.co.y - y) < 0.03 and -0.35 < v.co.x < 0.35 and abs(v.co.z) < 0.85:
            best = max(best, abs(v.co.z))
    return best
W = half_breadth(eye_y)
# ---- The warp: the face drawn in or out across so its eyes are where the photos' are (atlas eyeU 0.0668: an eye's centre at
# sin(2π · 0.0668) = 0.414 of the head's half breadth there), the change greatest at the eyes and the whole face in front.
ATLAS_EYE_ANGLE = 2 * math.pi * 0.0668
# (The photo is fitted to the mesh, not the mesh to the photo: the texture's u stretched so its eyes land on the mesh's
# eyes: its angle across the head at the eyes over the mesh's.)
mesh_eye_angle = math.asin(min(1.0, eye_z / W)) if eye_z else ATLAS_EYE_ANGLE
u_scale = ATLAS_EYE_ANGLE / mesh_eye_angle
across = 1.0
# ---- The head's own mesh, for the game to draw (the eyelids' openings closed: the photo has the eyes) --------------------------
open_edges = [e for e in bm.edges if e.is_boundary]
# (A mesh with its own eyeballs (the female's corneas) has its lids closed over the photo; one without keeps its lids open on
# the eyeballs put in below.)
if cornea is not None:
    bmesh.ops.holes_fill(bm, edges=open_edges, sides=60)
# A mesh without eyeballs (the male's open eyelids): an eyeball in each socket, ~1.2 cm across (0.12 head radii), its front
# just behind the lids' opening, for the photo's eye to lie on.
if cornea is None:
    for p in eye_points:
        ball = bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=12, radius=0.12)
        bmesh.ops.translate(bm, verts=ball['verts'], vec=Vector((p.x - 0.1, p.y, p.z)))
bmesh.ops.triangulate(bm, faces=bm.faces[:])
head_mesh = {'positions': [round(c, 4) for v in bm.verts for c in v.co], 'indices': [v.index for f in bm.faces for v in f.verts]}
bm.verts.index_update()
# (The game's axes are Blender's mirrored (x from -y, z from x): each triangle's winding reversed so it faces out.)
head_mesh['indices'] = [v.index for f in bm.faces for v in reversed(f.verts)]
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
marks = {'vertex': VERTEX, 'chin': CHIN, 'scale': round(scale, 5), 'missing': missing, 'noseTip': round(tip[1], 3), 'tipY': round(tip[0], 3), 'eye': round(eye_y, 3), 'eyeZ': round(eye_z or 0, 3), 'halfBreadth': round(W, 3), 'across': round(across, 3), 'uScale': round(u_scale, 4), 'verts': len(bm.verts), 'tris': len(bm.faces), 'subnasale': round(subnasale[0], 3), 'mouth': round(seam[0], 3)}
json.dump({'polars': POLARS, 'azimuths': AZIMUTHS, SEX: {'landmarks': marks, 'radii': radii, 'mesh': head_mesh}}, open(os.path.join(OUT, f'{SEX}.json'), 'w'))
print('HEADBASE', SEX, json.dumps(marks))
