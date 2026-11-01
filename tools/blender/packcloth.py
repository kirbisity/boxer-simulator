# Lay the baked cloth tiles (tools/blender/cloth.py: <dir>/<family>_<mode>.npy) into the one cloth atlas the game embeds and
# write it into src/clothmaps-data.js (base64 WebP). Plain Python 3 with numpy and Pillow.
#
#   python3 tools/blender/packcloth.py <bake dir> [--preview]
#
# A family not baked in <bake dir> keeps its cell (and its means) from the atlas already in src/clothmaps-data.js, so a new
# family can be baked alone and added (its cells re-encoded once more).
#
# The atlas is 8 x 8 cells of CELL pixels (2048² in all: the GPU budget, and a power of two so every mipmap level halves
# every cell exactly), each family's tile filtered down to CELL - 2 PAD and wrapped PAD pixels round on
# every side (so the coarser mipmaps of a cell blend only its own tile, never its neighbour's); cell k at column k % 8 and
# row k // 8 counted up from the bottom of the picture (texture v up, as three flips it). One RGBA picture:
#   R, G  the normal's x and y (tangent space, OpenGL, green up; z = sqrt(1 - x² - y²))
#   B     the shade: the fibre's own grey times the occlusion (the garment's colour is multiplied by it over its mean)
#   A     the roughness
# Cells past the families are flat (normal up, shade and roughness even): the pieces whose material has no tile.

import base64
import io
import json
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pack import normals, resample, to8  # noqa: E402

# In the order of src/detailmaps.js CLOTH_FAMILIES (each one's cell is its index); the tile's side in metres as baked.
FAMILIES = ['plain', 'twill', 'denim', 'quilt', 'diamondQuilt', 'felt', 'damask', 'leather', 'fur', 'feathers', 'straw', 'cordura', 'ripstop', 'knit',
            'jack', 'camo', 'kikko', 'cloudDamask', 'tapestry', 'aluminized', 'aluminizedQuilt']
# 256 px a cell (224 of tile): finer than a garment is ever seen (a 13 mm weave tile at 60 µm a pixel, its threads 9 px).
CELL = 256
PAD = 16
GRID = 8
QUALITY = 90
# How much of the occlusion goes into the shade.
AO_IN_SHADE = 0.8
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def cell_of(folder, family):
    """A family's cell (CELL x CELL x 4, 0..1) and its means."""
    inner = CELL - 2 * PAD
    normal = np.load(os.path.join(folder, f'{family}_normal.npy'))
    albedo = np.load(os.path.join(folder, f'{family}_albedo.npy'))
    orm = np.load(os.path.join(folder, f'{family}_orm.npy'))
    n = normals(normal, inner)
    shade = resample(albedo, inner)[:, :, 0] * (1 - AO_IN_SHADE * (1 - resample(orm, inner)[:, :, 0]))
    rough = resample(orm, inner)[:, :, 1]
    tile = np.dstack([n[:, :, 0], n[:, :, 1], shade, rough])
    # Wrapped round by PAD on every side.
    index = (np.arange(CELL) - PAD) % inner
    return tile[np.ix_(index, index)], [round(float(shade.mean()), 4), round(float(rough.mean()), 4)]


def current_atlas():
    """The atlas in src/clothmaps-data.js (RGBA 0..1, as the picture is laid out) and its families' means, or (None, {})."""
    path = os.path.join(ROOT, 'src', 'clothmaps-data.js')
    if not os.path.exists(path):
        return None, {}
    text = open(path).read()
    data = text.split("atlas: '", 1)[1].split("'", 1)[0]
    families = json.loads(text.split('families: ', 1)[1].split(',\n', 1)[0])
    means = json.loads(text.split('means: ', 1)[1].split(',\n', 1)[0])
    image = Image.open(io.BytesIO(base64.b64decode(data))).convert('RGBA')
    return np.asarray(image).astype(np.float64) / 255, {family: means[k] for k, family in enumerate(families)}


def old_cell(atlas, k):
    """Cell k of an atlas laid out as this one is."""
    col, row = k % GRID, k // GRID
    top = (GRID - 1 - row) * CELL
    return atlas[top:top + CELL, col * CELL:(col + 1) * CELL]


def main():
    folder = sys.argv[1]
    preview = '--preview' in sys.argv
    atlas = np.zeros((CELL * GRID, CELL * GRID, 4))
    atlas[:, :] = (0.5, 0.5, 0.9, 0.85)
    means = []
    old, old_means = current_atlas()
    old_families = list(old_means)
    for k, family in enumerate(FAMILIES):
        if os.path.exists(os.path.join(folder, f'{family}_normal.npy')):
            cell, mean = cell_of(folder, family)
        else:
            cell, mean = old_cell(old, old_families.index(family)), old_means[family]
        col, row = k % GRID, k // GRID
        top = (GRID - 1 - row) * CELL
        atlas[top:top + CELL, col * CELL:(col + 1) * CELL] = cell
        means.append(mean)
        print(family, mean, flush=True)
    image = Image.fromarray(to8(atlas), 'RGBA')
    buffer = io.BytesIO()
    image.save(buffer, 'WEBP', quality=QUALITY, alpha_quality=90, method=6, exact=True)
    data = buffer.getvalue()
    print('atlas', len(data), 'bytes WebP,', len(data) * 4 // 3, 'base64')
    if preview:
        image.save(os.path.join(folder, 'cloth-atlas.png'))
        with open(os.path.join(folder, 'cloth-atlas.webp'), 'wb') as file:
            file.write(data)
        return
    lines = [
        '// Generated by tools/blender/packcloth.py from the cloth tiles baked in Blender (tools/blender/cloth.py, clothtiles.py). Do not edit.',
        '// One atlas of the textile and organic tiles (src/detailmaps.js CLOTH_FAMILIES): `grid` x `grid` cells of `cell` pixels, each',
        '// tile `cell` - 2 `pad` across and wrapped `pad` round; cell k at column k % grid, row k // grid up from the bottom. RGBA:',
        '// R, G the tangent-space normal\'s x and y (OpenGL, green up), B the shade (fibre grey times occlusion), A the roughness.',
        '// `means`: each cell\'s mean shade and roughness (what the cloth fades to far off). WebP, base64.',
        'export const CLOTH_MAP_DATA = {',
        f"  families: {json.dumps(FAMILIES)},",
        f'  size: [{CELL * GRID}, {CELL * GRID}], grid: {GRID}, cell: {CELL}, pad: {PAD},',
        f'  means: {json.dumps(means)},',
        f"  atlas: '{base64.b64encode(data).decode('ascii')}',",
        '};',
    ]
    with open(os.path.join(ROOT, 'src', 'clothmaps-data.js'), 'w') as file:
        file.write('\n'.join(lines) + '\n')
    print('wrote src/clothmaps-data.js')


if __name__ == '__main__':
    main()
