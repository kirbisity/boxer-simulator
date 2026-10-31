# The helmets' and masks' relief (the height fields helmforms.py and helmsheets.py authored) modelled as a mesh, one vertex a pixel, and
# rendered from above as tilebake.py does the tiles: its normal map and its occlusion. The colour, roughness, metalness and
# masks are the authoring scripts' own; packhelm.py puts them together.
#
#   Blender -b --factory-startup --python tools/blender/helmbake.py -- <dir> [names...]

import os
import sys

import bpy
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tilebake as tb  # noqa: E402

argv = sys.argv[sys.argv.index('--') + 1:]
OUT = argv[0]
NAMES = argv[1:] or ['formMurmillo', 'formThraex', 'formHoplomachus', 'formSecutor', 'formScissor', 'maskOni', 'maskRessei', 'maskTengu']

for name in NAMES:
    height = np.load(os.path.join(OUT, f'{name}_src_h.npy')).astype(np.float32)
    n = height.shape[0]
    scene = tb.reset()
    group = tb.out_group(ao_distance=0.02, h_lo=-0.02, h_hi=0.02)
    # One vertex at each pixel's centre, rows top first in the array (y down the picture), the sheet 1 x 1; mirrored a few
    # pixels on past its edges (where a helmet's halves fold), so the edge's normals are those of an unbroken surface.
    pad = 8
    height = np.pad(height, pad, mode='reflect')
    m = n + 2 * pad
    xs = (np.arange(m, dtype=np.float32) - pad + 0.5) / n
    gx, gy = np.meshgrid(xs, 1 - xs)
    verts = np.stack([gx, gy, height], axis=2).reshape(-1, 3)
    index = np.arange(m * m).reshape(m, m)
    a = index[:-1, :-1].reshape(-1)
    b = index[:-1, 1:].reshape(-1)
    c = index[1:, 1:].reshape(-1)
    d = index[1:, :-1].reshape(-1)
    # Wound so the faces look up (+z): the rows run down the picture.
    quads = np.stack([a, d, c, b], axis=1)
    mesh = bpy.data.meshes.new(name)
    mesh.vertices.add(len(verts))
    mesh.vertices.foreach_set('co', verts.reshape(-1))
    mesh.loops.add(quads.size)
    mesh.loops.foreach_set('vertex_index', quads.reshape(-1).astype(np.int32))
    mesh.polygons.add(len(quads))
    mesh.polygons.foreach_set('loop_start', (np.arange(len(quads)) * 4).astype(np.int32))
    mesh.polygons.foreach_set('loop_total', np.full(len(quads), 4, np.int32))
    mesh.polygons.foreach_set('use_smooth', np.ones(len(quads), bool))
    mesh.update(calc_edges=True)
    mesh.validate()
    mesh.materials.append(tb.material('relief', group, lambda nodes, links, geometry: ((0.8, 0.8, 0.8), 0.3, 1.0, 0.0, None)))
    tile = tb.new_collection()
    tb.link(bpy.data.objects.new(name, mesh), tile)
    tb.camera(1.0, 1.0, n, n)
    tb.render_maps(group, OUT, name, samples={'normal': 4, 'orm': 32}, modes=['normal', 'orm'])
