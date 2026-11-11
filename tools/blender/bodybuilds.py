# An experiment (the user's call, 2026-11-10): the user's base bodies (Base_Male_Mesh.blend, female.blend) reshaped to the
# game's body builds, starved to very obese, each part's girth by the game's own figures (body.js: every segment's skin
# radius, the fat its skin over its muscle), and drawn side by side. Not the game's mesh: a look at whether the base mesh
# carries the builds.
#
#   Blender -b <file.blend> --python tools/blender/bodybuilds.py -- <builds.json> <sex> <object> <out.png>
#
# The body is split by where its parts are in its A-pose (as fractions of its height): the head and the neck kept; the arms
# beyond the shoulders' breadth, upper arm to the elbow; the legs below the crotch, thigh to the knee; the trunk the rest. Each
# part is scaled out from its own axis (the middle of each slice along it) by its girth over the average build's, the trunk's
# front (the belly) and its sides by its fat more than its back; the change is then smoothed over the mesh, so the joins blend.

import json
import math
import sys

import bpy
import bmesh
import numpy as np
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:]
BUILDS = json.load(open(args[0]))[args[1]]
SEX, NAME, OUT = args[1], args[2], args[3]

obj = bpy.data.objects[NAME]
for modifier in obj.modifiers:
    if modifier.type == 'SUBSURF':
        # (The male's trunk is coarse under a dense head: two levels, so the belly and the flanks bend smoothly.)
        modifier.levels = 2 if len(obj.data.vertices) > 8000 else 1
dg = bpy.context.evaluated_depsgraph_get()
mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(dg))
mesh.transform(obj.matrix_world)
V = np.array([v.co[:] for v in mesh.vertices])
bottom, top = V[:, 2].min(), V[:, 2].max()
H = top - bottom
Z = (V[:, 2] - bottom) / H
X = V[:, 0] / H
# The parts.
crotch, knee, neck, chin = 0.47, 0.28, 0.82, 0.875
shoulder_x, elbow_reach = 0.105, 0.17
part = np.full(len(V), 'trunk', dtype=object)
part[Z > neck] = 'head'
arm = (np.abs(X) > shoulder_x + 0.02 * np.clip((neck - Z) / 0.3, 0, 1)) & (Z > 0.42) & (Z <= neck)
shoulder = np.stack([np.sign(X) * shoulder_x * H, np.zeros(len(V)), np.full(len(V), bottom + 0.80 * H)], 1)
reach = np.linalg.norm((V - shoulder)[:, [0, 2]], axis=1) / H
part[arm & (reach <= elbow_reach)] = 'upper'
part[arm & (reach > elbow_reach)] = 'fore'
leg = (Z < crotch) & ~arm
part[leg & (Z >= knee)] = 'thigh'
part[leg & (Z < knee)] = 'shin'
# The hands and the feet kept (their own size does not follow the build).
part[arm & (reach > 0.33)] = 'hand'
part[leg & (Z < 0.05)] = 'foot'


def axis_points(mask, along):
    # The part's axis: the middle of its slices along `along` (a value per vertex), as a point per vertex.
    centre = np.zeros((len(V), 3))
    idx = np.where(mask)[0]
    if not len(idx):
        return centre
    bins = np.linspace(along[idx].min(), along[idx].max() + 1e-9, 30)
    which = np.clip(np.digitize(along[idx], bins) - 1, 0, len(bins) - 2)
    for b in range(len(bins) - 1):
        sel = idx[which == b]
        if len(sel):
            centre[sel] = V[sel].mean(axis=0)
    return centre


def displacement(build):
    ref = BUILDS['average']
    D = np.zeros_like(V)
    for name, key in [('upper', 'upper'), ('fore', 'fore'), ('thigh', 'thigh'), ('shin', 'shin')]:
        for side in (1, -1):
            mask = (part == name) & (np.sign(X) == side)
            along = reach if name in ('upper', 'fore') else Z
            c = axis_points(mask, along)
            k = build[key][0] / ref[key][0]
            D[mask] = (V[mask] - c[mask]) * (k - 1)
            # (Only across the limb: the slice's spread along it kept.)
    mask = part == 'trunk'
    c = axis_points(mask, Z)
    skin, muscle = build['trunk']
    rskin, rmuscle = ref['trunk']
    width = skin / rskin
    fat_gain = (skin - muscle) / max(1e-6, rskin - rmuscle)
    rel = V - c
    front = rel[:, 1] < 0  # the body faces -y
    # (Depth: a fat man's belly carries most of it, his back little: the front by the width and the fat gain over the belly's
    # height, the back by half the width's change.)
    def ease(t):
        t = np.clip(t, 0, 1)
        return t * t * (3 - 2 * t)
    belly_band = ease((0.74 - Z) / 0.16) * ease((Z - 0.43) / 0.1)
    # (How much a point faces forward, 0 at the sides and behind: the belly's swell rounds off round the flanks.)
    facing = np.clip(-rel[:, 1] / (np.hypot(rel[:, 0], rel[:, 1]) + 1e-9), 0, 1)
    back = 1 + 0.5 * (width - 1)
    fore = width * (1 + 0.45 * (fat_gain - 1) * belly_band)
    depth = back + (fore - back) * facing ** 0.8
    D[mask, 0] = rel[mask, 0] * (width - 1)
    D[mask, 1] = rel[mask, 1] * (depth[mask] - 1)
    return D


# The mesh's neighbours, for smoothing the change across the joins.
bm = bmesh.new()
bm.from_mesh(mesh)
bm.verts.ensure_lookup_table()
neighbours = [[e.other_vert(v).index for e in v.link_edges] for v in bm.verts]


def smooth(D, rounds=12):
    for _ in range(rounds):
        D = np.array([D[n].mean(axis=0) if n else D[i] for i, n in enumerate(neighbours)]) * 0.5 + D * 0.5
    return D


scene = bpy.context.scene
for o in list(scene.objects):
    if o.type == 'MESH':
        o.hide_render = True
scene.render.engine = 'BLENDER_WORKBENCH'
scene.display.shading.light = 'STUDIO'
scene.display.shading.color_type = 'SINGLE'
scene.display.shading.single_color = (0.80, 0.64, 0.54)
scene.render.film_transparent = False
keys = list(BUILDS.keys())
spacing = 0.95 * H
copies = []
for k, key in enumerate(keys):
    D = smooth(displacement(BUILDS[key]))
    me = mesh.copy()
    for i, v in enumerate(me.vertices):
        v.co = Vector(V[i] + D[i] + np.array([k * spacing, 0, 0]))
    ob = bpy.data.objects.new(f'build-{key}', me)
    scene.collection.objects.link(ob)
    copies.append(ob)
cam_data = bpy.data.cameras.new('cam')
cam_data.type = 'ORTHO'
width = spacing * len(keys)
cam_data.ortho_scale = width * 1.02
cam = bpy.data.objects.new('cam', cam_data)
scene.collection.objects.link(cam)
scene.camera = cam
scene.render.resolution_x = 360 * len(keys)
scene.render.resolution_y = int(360 * len(keys) * 1.05 * H / (width * 1.02))
# Front, then from the side (each body turned to face the camera's left).
cam.location = ((len(keys) - 1) * spacing / 2, -10 * H, bottom + 0.5 * H)
cam.rotation_euler = (math.pi / 2, 0, 0)
scene.render.filepath = OUT.replace('.png', '-front.png')
bpy.ops.render.render(write_still=True)
for k, ob in enumerate(copies):
    pivot = Vector((k * spacing, 0, 0))
    for v in ob.data.vertices:
        rel = v.co - pivot
        v.co = pivot + Vector((rel.y, -rel.x, rel.z))
scene.render.filepath = OUT.replace('.png', '-side.png')
bpy.ops.render.render(write_still=True)
print('BUILDS', SEX, keys, 'parts', {p: int((part == p).sum()) for p in set(part)})
