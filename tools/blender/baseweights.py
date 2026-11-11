# The base meshes' skin weights from Blender's own automatic (bone heat) weighting (the user's call, 2026-11-11: arms that read
# as hinged at real joints, not a bent rubber tube). The game's distance weights (bodymesh.js skinWeights, to their sixth
# power) hand each point to its nearest bone over a centimetre or two; bone heat spreads each bone's share over the surface
# by diffusion, so the shoulder, the armpit and the elbow turn as one surface and a raised arm no longer creases the chest.
#
#   Blender -b --factory-startup --python tools/blender/baseweights.py -- <mesh.json> <out.json>
#
# <mesh.json>: { positions: [x, y, z, ...] (the base mesh's points in the game's frame, units of height, in the game's order),
# triangles: [...], joints: { name: [x, y, z] } } (tools/baseweights-pack.js writes it from src/basebody-data.js). The skeleton
# is the mesh's own joints: one bone for the trunk (pelvis to neck), the neck, and each side's clavicle (neck to shoulder),
# upper arm, forearm (elbow to wrist), thigh and shin. <out.json>: per point its four strongest bones and their weights.

import json
import sys

import bpy
from mathutils import Vector

src, out = sys.argv[sys.argv.index('--') + 1:][:2]
data = json.load(open(src))
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o)
P = data['positions']
verts = [tuple(P[i:i + 3]) for i in range(0, len(P), 3)]
T = data['triangles']
faces = [tuple(T[i:i + 3]) for i in range(0, len(T), 3)]
me = bpy.data.meshes.new('base')
me.from_pydata(verts, [], faces)
me.update()
ob = bpy.data.objects.new('base', me)
bpy.context.scene.collection.objects.link(ob)
J = {k: Vector(v) for k, v in data['joints'].items()}
arm = bpy.data.armatures.new('rig')
rig = bpy.data.objects.new('rig', arm)
bpy.context.scene.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='EDIT')
BONES = {}


def bone(name, a, b, parent=None):
    e = arm.edit_bones.new(name)
    e.head, e.tail = J[a], J[b]
    if parent:
        e.parent = arm.edit_bones[parent]
    BONES[name] = (a, b)


bone('trunk', 'pelvis', 'neck')
bone('neck', 'neck', 'head', 'trunk')
for s in 'lr':
    bone(s + 'Clavicle', 'neck', s + 'Shoulder', 'trunk')
    bone(s + 'UpperArm', s + 'Shoulder', s + 'Elbow', s + 'Clavicle')
    bone(s + 'Forearm', s + 'Elbow', s + 'Hand', s + 'UpperArm')
    bone(s + 'Thigh', s + 'Hip', s + 'Knee', 'trunk')
    bone(s + 'Shin', s + 'Knee', s + 'Foot', s + 'Thigh')
bpy.ops.object.mode_set(mode='OBJECT')
bpy.ops.object.select_all(action='DESELECT')
ob.select_set(True)
rig.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
names = [g.name for g in ob.vertex_groups]
weights = []
missing = 0
for v in me.vertices:
    pairs = sorted(((g.weight, names[g.group]) for g in v.groups if g.weight > 0), reverse=True)[:4]
    if not pairs:
        missing += 1
    total = sum(w for w, _ in pairs) or 1
    weights.append([[n, round(w / total, 4)] for w, n in pairs])
json.dump({'weights': weights, 'missing': missing}, open(out, 'w'))
print('WEIGHTS', len(weights), 'points', missing, 'without a bone')
