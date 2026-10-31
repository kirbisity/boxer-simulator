# The textile and organic tiles (src/detailmaps.js CLOTH_FAMILIES): each family's height field (clothtiles.py, with the
# reference it is drawn from) built into a displaced mesh of real relief in metres and baked as the other tiles are
# (tilebake.py): its normals, its shade (the fibre's grey) as the albedo, Cycles' ambient occlusion and its roughness.
# pack.py lays them into the one cloth atlas the game embeds.
#
#   Blender -b --factory-startup --python tools/blender/cloth.py -- <out dir> [resolution scale] [family ...]

import os
import sys

import bpy
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import clothtiles as ct  # noqa: E402
import tilebake as tb  # noqa: E402

OUT, SCALE = tb.args()
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
WANTED = argv[2:] or list(ct.FAMILIES)


def heightfield_mesh(name, height, shade, rough, metres):
    """A grid of n x n points over the tile, z the height (m), with `shade` and `rough` as point attributes."""
    n = height.shape[0]
    # One more row and column than the tile, wrapped round (the last joins the first), so the copies laid round it close up.
    wrap = np.arange(n + 1) % n
    xs = (np.arange(n + 1) + 0.5) / n * metres
    gx, gy = np.meshgrid(xs, xs)
    z = height[np.ix_(wrap, wrap)]
    coords = np.stack([gx.ravel(), gy.ravel(), z.ravel()], axis=1).astype(np.float32)
    m = n + 1
    i = np.arange(n)
    a = (i[None, :] + m * i[:, None]).ravel()
    quads = np.stack([a, a + 1, a + m + 1, a + m], axis=1)
    shade = shade[np.ix_(wrap, wrap)]
    rough = rough[np.ix_(wrap, wrap)]
    mesh = bpy.data.meshes.new(name)
    mesh.vertices.add(len(coords))
    mesh.vertices.foreach_set('co', coords.ravel())
    mesh.loops.add(quads.size)
    mesh.loops.foreach_set('vertex_index', quads.ravel().astype(np.int32))
    mesh.polygons.add(len(quads))
    mesh.polygons.foreach_set('loop_start', (np.arange(len(quads)) * 4).astype(np.int32))
    mesh.polygons.foreach_set('use_smooth', np.ones(len(quads), bool))
    mesh.update(calc_edges=True)
    for key, values in (('shade', shade), ('rough', rough)):
        attribute = mesh.attributes.new(key, 'FLOAT', 'POINT')
        attribute.data.foreach_set('value', values.ravel().astype(np.float32))
    return mesh


def cloth_material(group):
    def build(nodes, links, geometry):
        shade = nodes.new('ShaderNodeAttribute')
        shade.attribute_name = 'shade'
        rough = nodes.new('ShaderNodeAttribute')
        rough.attribute_name = 'rough'
        colour = nodes.new('ShaderNodeCombineXYZ')
        for k in range(3):
            links.new(shade.outputs['Fac'], colour.inputs[k])
        return colour.outputs[0], rough.outputs['Fac'], 0.0, 0.0, None
    return tb.material('cloth', group, build)


for family in WANTED:
    tile = ct.FAMILIES[family]()
    metres = tile['metres']
    scene = tb.reset()
    span = float(tile['height'].max() - tile['height'].min())
    group = tb.out_group(ao_distance=max(span * 1.5, metres / 200), h_lo=float(tile['height'].min()), h_hi=float(tile['height'].max()))
    collection = tb.new_collection()
    mesh = heightfield_mesh(family, tile['height'], tile['shade'], tile['rough'], metres)
    mesh.materials.append(cloth_material(group))
    tb.link(bpy.data.objects.new(family, mesh), collection)
    tb.repeat_around(collection, metres, metres)
    size = int(1024 * SCALE)
    tb.camera(metres, metres, size, size)
    tb.render_maps(group, OUT, family, samples={'normal': 16, 'albedo': 4, 'orm': 48}, modes=['normal', 'albedo', 'orm'])
