# Turn the baked tiles' float maps (<dir>/<name>_<mode>.npy, from tilebake.py) into the images the game embeds, and write them
# into src/detailmaps-data.js (base64 WebP). Plain Python 3 with numpy and Pillow (built with WebP).
#
#   python3 tools/blender/pack.py <bake dir> [--preview]
#
# Every map is resampled to a power of two (`size`; the bakes are rendered larger and filtered down, which is also what keeps
# a normal map from sparkling), and is one of two kinds:
#   armour  `albedo` RGB (A: the first mask, where there is one), `normal` RGB (A: the second mask), `orm` R occlusion,
#           G roughness, B metalness (three's aoMap, roughnessMap and metalnessMap read those channels).
#   ground  `albedo` RGB with the occlusion multiplied in (A: roughness), `normal` RGB (A: height): two maps, as the
#           painted ground's layers are (ground/painted.js) and as the castle kit's stone reads them.

import base64
import io
import json
import os
import sys

import numpy as np
from PIL import Image

ARMOUR = {
    'mail': {'size': 1024, 'quality': 90},
    'kozane': {'size': 1024, 'quality': 90, 'masks': True},
    'lamellae': {'size': 1024, 'quality': 90, 'masks': True},
    'plate': {'size': 512, 'quality': 92},
}
# Ground tiles and the metres each covers (as baked).
GROUND = {name: {'size': 1024, 'quality': 86, 'metres': metres} for name, metres in (
    ('ashlar', 4), ('cobble', 3), ('setts', 2), ('slabs', 3), ('rubble', 3), ('planks', 2), ('earth', 2), ('grass', 1.5),
    ('drygrass', 1.6), ('gravel', 1.4), ('sand', 1.6), ('beach', 1.6), ('concrete', 2.4))}
# Colour corrections per tile (RGB gains), set by eye against the references and the places' lighting: the arena's sand yellow
# (Monte Mario sand), turf a living green. And how much the noisy normal maps of grass may be compressed.
GAIN = {'sand': (1.02, 0.93, 0.78), 'beach': (1.04, 0.98, 0.86), 'grass': (1.45, 1.4, 1.3), 'drygrass': (1.1, 1.05, 1.0)}
NORMAL_QUALITY = {'grass': 72, 'drygrass': 76, 'gravel': 80}
# How much of the occlusion goes into a ground tile's colour.
AO_IN_ALBEDO = 0.85

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def load(folder, name, mode):
    path = os.path.join(folder, f'{name}_{mode}.npy')
    return np.load(path) if os.path.exists(path) else None


def resample(array, size):
    """Each channel filtered down (Lanczos) to size x size."""
    if array.shape[0] == size and array.shape[1] == size:
        return array
    channels = [np.asarray(Image.fromarray(array[:, :, c].astype(np.float32), 'F').resize((size, size), Image.LANCZOS)) for c in range(array.shape[2])]
    return np.stack(channels, axis=2)


def to8(array):
    return (np.clip(array, 0, 1) * 255 + 0.5).astype(np.uint8)


def webp(array, quality):
    image = Image.fromarray(array, 'RGBA' if array.shape[2] == 4 else 'RGB')
    buffer = io.BytesIO()
    image.save(buffer, 'WEBP', quality=quality, method=6, exact=True)
    return buffer.getvalue()


def normals(array, size):
    n = resample(array * 2 - 1, size)
    n /= np.maximum(np.linalg.norm(n, axis=2, keepdims=True), 1e-6)
    return n * 0.5 + 0.5


def pack(folder, name, spec, kind, preview):
    normal, albedo, orm = (load(folder, name, mode) for mode in ('normal', 'albedo', 'orm'))
    if normal is None or albedo is None or orm is None:
        return None
    size = spec['size']
    n = normals(normal, size)
    colour = resample(albedo, size)
    o = resample(orm, size)
    out = {}
    if kind == 'armour':
        if spec.get('masks'):
            mask = resample(load(folder, name, 'mask'), size)
            out['albedo'] = webp(to8(np.concatenate([colour, mask[:, :, 0:1]], axis=2)), spec['quality'])
            out['normal'] = webp(to8(np.concatenate([n, mask[:, :, 1:2]], axis=2)), spec['quality'])
        else:
            out['albedo'] = webp(to8(colour), spec['quality'])
            out['normal'] = webp(to8(n), spec['quality'])
        # (Occlusion, roughness and metalness at half the size: they vary slowly, and it saves a quarter of the tile's memory.)
        out['orm'] = webp(to8(resample(o, size // 2)), spec['quality'])
    else:
        height = resample(load(folder, name, 'height'), size)[:, :, 0:1]
        colour = colour * (1 - AO_IN_ALBEDO * (1 - o[:, :, 0:1])) * np.asarray(GAIN.get(name, (1, 1, 1)))[None, None, :]
        out['albedo'] = webp(to8(np.concatenate([colour, o[:, :, 1:2]], axis=2)), spec['quality'])
        out['normal'] = webp(to8(np.concatenate([n, height], axis=2)), NORMAL_QUALITY.get(name, spec['quality']))
    if preview:
        for key, data in out.items():
            with open(os.path.join(folder, f'{name}.{key}.webp'), 'wb') as file:
                file.write(data)
        Image.fromarray(to8(n)).save(os.path.join(folder, f'{name}.normal.png'))
        Image.fromarray(to8(colour)).save(os.path.join(folder, f'{name}.albedo.png'))
    mean = [round(float(value), 4) for value in to8(colour).reshape(-1, 3).mean(axis=0) / 255]
    extra = {'metres': spec['metres']} if 'metres' in spec else {}
    return {'kind': kind, 'size': [size, size], 'mean': mean, **extra, **{key: base64.b64encode(data).decode('ascii') for key, data in out.items()}}


def main():
    folder = sys.argv[1]
    preview = '--preview' in sys.argv
    entries = {}
    for kind, table in (('armour', ARMOUR), ('ground', GROUND)):
        for name, spec in table.items():
            packed = pack(folder, name, spec, kind, preview)
            if packed:
                entries[name] = packed
                sizes = {key: len(packed[key]) * 3 // 4 for key in ('albedo', 'normal', 'orm') if key in packed}
                print(name, kind, packed['size'], sizes)
            else:
                print(name, 'missing')
    if preview:
        return
    lines = [
        '// Generated by tools/blender/pack.py from the tiles baked in Blender (tools/blender/*.py). Do not edit.',
        "// Each: `kind` ('armour': `albedo` RGB, A the first mask; `normal` RGB, A the second mask; `orm` occlusion, roughness,",
        "// metalness. 'ground': `albedo` RGB with the occlusion in, A roughness; `normal` RGB, A height), the size in pixels, the",
        "// albedo's mean colour (0..1), and the WebP images (base64). Normal maps are tangent space, OpenGL (green up).",
        'export const DETAIL_MAP_DATA = {',
    ]
    for name, entry in entries.items():
        lines.append(f'  {name}: {{')
        metres = f", metres: {entry['metres']}" if 'metres' in entry else ''
        lines.append(f"    kind: '{entry['kind']}', size: {json.dumps(entry['size'])}, mean: {json.dumps(entry['mean'])}{metres},")
        for key in ('albedo', 'normal', 'orm'):
            if key in entry:
                lines.append(f"    {key}: '{entry[key]}',")
        lines.append('  },')
    lines.append('};')
    with open(os.path.join(ROOT, 'src', 'detailmaps-data.js'), 'w') as file:
        file.write('\n'.join(lines) + '\n')
    print('wrote src/detailmaps-data.js')


if __name__ == '__main__':
    main()
