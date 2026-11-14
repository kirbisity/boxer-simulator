# Shared: the head of a base mesh in the game's head frame (as tools/blender/headfrombase.py puts it), as a bmesh.
import bpy, bmesh, math
from mathutils import Vector
VERTEX = 1.078
def head_bmesh(name=None, levels=None):
    obj = bpy.data.objects[name] if name else max((o for o in bpy.data.objects if o.type == 'MESH'), key=lambda o: len(o.data.vertices))
    if levels and not any(m.type == 'SUBSURF' for m in obj.modifiers): obj.modifiers.new('subdivide', 'SUBSURF')
    for modifier in obj.modifiers:
        if modifier.type == 'SUBSURF':
            modifier.levels = levels if levels is not None else (0 if len(obj.data.vertices) > 8000 else 1)
    depsgraph = bpy.context.evaluated_depsgraph_get()
    mesh = obj.evaluated_get(depsgraph).to_mesh()
    world = obj.matrix_world
    points = [world @ v.co for v in mesh.vertices]
    top = max(p.z for p in points); bottom = min(p.z for p in points); height = top - bottom
    band = [p for p in points if p.z > top - 0.17 * height and abs(p.x) < 0.01 * height]
    def front_at(z, half=0.004):
        near = [p.y for p in band if abs(p.z - z) < half * height]
        return min(near) if near else None
    zs = [top - k * 0.001 * height for k in range(170)]
    profile = [(z, front_at(z)) for z in zs]
    profile = [(z, y) for z, y in profile if y is not None]
    nose = min(profile, key=lambda zy: zy[1])
    head = [p for p in points if p.z > top - 0.2 * height]
    back = max(p.y for p in head if p.z > top - 0.12 * height)
    brow_z = top - 0.42 * (top - nose[0])
    brow = front_at(brow_z, 0.01) or min(p.y for p in head)
    scale = 2.06 / (back - brow)
    def to_game(p):
        return Vector(((back - p.y) * scale - 1.03, (p.z - top) * scale + VERTEX, p.x * scale))
    bm = bmesh.new(); bm.from_mesh(mesh); bm.transform(world)
    for v in bm.verts: v.co = to_game(v.co)
    return bm, to_game, depsgraph, scale
def boundary_loops(bm):
    edges = [e for e in bm.edges if e.is_boundary]
    seen = set(); loops = []
    for e in edges:
        if e in seen: continue
        loop = [e.verts[0], e.verts[1]]; seen.add(e)
        while True:
            v = loop[-1]
            nxt = [x for x in v.link_edges if x.is_boundary and x not in seen]
            if not nxt: break
            seen.add(nxt[0]); o = nxt[0].other_vert(v)
            if o is loop[0]: break
            loop.append(o)
        loops.append(loop)
    return loops
