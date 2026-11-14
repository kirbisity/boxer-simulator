# Blender -b <file.blend> --python cast.py -- <object name or -> <subsurf levels> <out.npz>
# The head in the game's head frame, cast along rays from its centre on an even (polar, azimuth) lattice: the outermost
# surface (`outer`, 0 where a ray meets none), its smooth normal there (`normal`: the corners' normals, read across the
# triangle met, so the mesh's facets do not show) and the first surface from inside (`inner`).
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy, bmesh, numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.interpolate import poly_3d_calc
from frame import head_bmesh, boundary_loops
args = sys.argv[sys.argv.index('--') + 1:]
name = args[0] if args[0] != '-' else None
POLARS, AZIMUTHS, CUT = 720, 1440, -2.0
bm, to_game, depsgraph, scale = head_bmesh(name, int(args[1]))
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.y < CUT], context='VERTS')
print('VERTS', len(bm.verts))
loops = boundary_loops(bm)
described = []
for loop in loops:
    points = np.array([v.co[:] for v in loop])
    centre = points.mean(axis=0)
    described.append(dict(count=len(loop), centre=centre, low=points.min(axis=0), high=points.max(axis=0), points=points))
    print('LOOP', len(loop), np.round(centre, 3), np.round(points.min(axis=0), 3), np.round(points.max(axis=0), 3))
# every opening but the neck's and the eyes' is closed by a fan from its middle (nostrils, a slit of a mouth, the back of a mouth)
for loop, about in zip(loops, described):
    neck = about['low'][1] < CUT + 0.15
    eye = abs(about['centre'][2]) > 0.15 and about['centre'][0] > 0.5 and -0.4 < about['centre'][1] < 0.3 and about['high'][2] - about['low'][2] > 0.15
    about['kind'] = 'neck' if neck else 'eye' if eye else 'closed'
    if about['kind'] != 'closed': continue
    middle = bm.verts.new(Vector(about['centre']))
    for a, b in zip(loop, loop[1:] + loop[:1]):
        try: bm.faces.new((a, b, middle))
        except ValueError: pass
print('KINDS', [(a['count'], a['kind']) for a in described])
bmesh.ops.triangulate(bm, faces=bm.faces[:])
bm.normal_update(); bm.faces.ensure_lookup_table(); bm.faces.index_update()
tree = BVHTree.FromBMesh(bm)
outer = np.zeros((POLARS, AZIMUTHS), np.float32); inner = np.zeros((POLARS, AZIMUTHS), np.float32)
normal = np.zeros((POLARS, AZIMUTHS, 3), np.float16)
origin = Vector((0, 0, 0))
for row in range(POLARS):
    polar = (row + 0.5) / POLARS * math.pi
    for column in range(AZIMUTHS):
        azimuth = (column + 0.5) / AZIMUTHS * 2 * math.pi - math.pi
        d = Vector((math.sin(polar) * math.cos(azimuth), math.cos(polar), math.sin(polar) * math.sin(azimuth)))
        hit = tree.ray_cast(d * 4, -d, 4)
        if hit[0] is not None:
            outer[row, column] = hit[0].length
            corners = bm.faces[hit[2]].verts; shares = poly_3d_calc([v.co for v in corners], hit[0])
            smooth = sum((v.normal * w for v, w in zip(corners, shares)), Vector((0, 0, 0)))
            normal[row, column] = smooth.normalized()[:] if smooth.length > 1e-9 else hit[1][:]
        hit = tree.ray_cast(origin, d, 4)
        if hit[0] is not None: inner[row, column] = hit[0].length
spheres = []
for o in bpy.data.objects:
    if o.type == 'MESH' and len(o.data.vertices) < 3000 and o.name != (name or ''):
        corners = [to_game(o.matrix_world @ Vector(c)) for c in o.bound_box]
        low = np.min([c[:] for c in corners], axis=0); high = np.max([c[:] for c in corners], axis=0)
        spheres.append((o.name, (low + high) / 2, (high - low) / 2)); print('OBJECT', o.name, np.round((low + high) / 2, 3), np.round((high - low) / 2, 3))
np.savez_compressed(args[2], outer=outer, inner=inner, normal=normal, scale=scale,
    eyes=np.array([np.concatenate([a['centre'], a['low'], a['high']]) for a in described if a['kind'] == 'eye']),
    eyeLoops=np.array([a['points'] for a in described if a['kind'] == 'eye'], dtype=object),
    objects=np.array([np.concatenate([c, h]) for _, c, h in spheres]), objectNames=np.array([n for n, _, _ in spheres]))
