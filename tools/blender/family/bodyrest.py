# The reference woman ('Body') and her rig's joints written out in the game's frame, as she stands (her skin weights no longer
# match her points, so her rig cannot pose her: the game's body is posed to her instead, in regN.py).
#   Blender -b skeleton/body.blend --python bodyrest.py -- <emac/base-female.json> <remodel/body-rest.npz>
import bpy, sys, json, numpy as np
from mathutils import Vector, Matrix
BASE, OUT = sys.argv[sys.argv.index('--') + 1:][:2]
o = bpy.data.objects['Body']; arm = bpy.data.objects['Armature']
for m in o.modifiers:
    print('mod', m.type, m.show_viewport, m.show_render)
    if m.type == 'SUBSURF': m.show_viewport = False
J = json.load(open(BASE))['joints']
def surface():
    dg = bpy.context.evaluated_depsgraph_get(); ev = o.evaluated_get(dg); me = ev.to_mesh()
    V = np.array([ev.matrix_world @ v.co for v in me.vertices]); me.calc_loop_triangles()
    T = np.array([t.vertices[:] for t in me.loop_triangles]); ev.to_mesh_clear()
    e = np.linalg.norm(V[T[:, 0]] - V[T[:, 1]], axis=1); print('surface: edge median %.4f p99 %.4f max %.4f' % (np.median(e), np.percentile(e, 99), e.max()), 'bbox', V.min(0).round(2), V.max(0).round(2))
    return V, T
V, T = surface()
Hb = V[:, 2].max() - V[:, 2].min(); floor = V[:, 2].min()
print('stature', Hb, 'floor', floor)
pb = arm.pose.bones
head_of = lambda n: np.array(arm.matrix_world @ pb[n].head)
tail_of = lambda n: np.array(arm.matrix_world @ pb[n].tail)
# fore-aft: her shoulders over the game's shoulders
fore = head_of('upperarm_L')[1] + J['rShoulder'][0] * Hb
def target(name):       # a game joint in her Blender frame (the game's +z side is Blender's -x; her _L bones are on +x)
    g = J[name]; return np.array([-g[2] * Hb, -g[0] * Hb + fore, g[1] * Hb + floor])
def aim(bone, joint):
    b = pb[bone]; h = head_of(bone); cur = tail_of(bone) - h; want = target(joint) - h
    q = Vector(cur).rotation_difference(Vector(want))
    hl = arm.matrix_world.inverted() @ Vector(h)
    b.matrix = Matrix.Translation(hl) @ q.to_matrix().to_4x4() @ Matrix.Translation(-hl) @ b.matrix
    bpy.context.view_layer.update()
    print(bone, 'turned %.1f deg; end now %s, wanted %s' % (np.degrees(q.angle), np.round(tail_of(bone), 3), np.round(target(joint), 3)))
def b2g(P): P = np.atleast_2d(P); return np.stack([-(P[:, 1] - fore), P[:, 2] - floor, -P[:, 0]], 1) / Hb
names = {'neck': 'neck', 'head': 'head', 'pelvis': 'pelvis', 'spine03': 'spine03'}
for s in 'LR':
    g = {'L': 'r', 'R': 'l'}[s]
    names.update({'upperarm_' + s: g + 'Shoulder', 'lowerarm_' + s: g + 'Elbow', 'hand_' + s: g + 'Hand', 'thigh_' + s: g + 'Hip', 'calf_' + s: g + 'Knee', 'foot_' + s: g + 'Foot', 'clavicle_' + s: g + 'Clavicle'})
joints = {v: b2g(head_of(k))[0].tolist() for k, v in names.items()}
np.savez(OUT, V=b2g(V), T=T, joints=json.dumps(joints), stature=Hb)
for k in sorted(joints): print(k, np.round(joints[k], 3), 'game', np.round(J[k], 3) if k in J else '')
