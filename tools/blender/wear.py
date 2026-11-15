# The used look of the armour's maps, put into the maps themselves: kit that has been worn, cleaned and worn again, not ruined.
# One recipe per material (WEAR_KINDS), the same for every tile and helmet sheet of that material and so for every man who
# wears it; nothing here knows a unit, a place on the body or a story. Plain Python 3 with numpy and Pillow (built with WebP).
#
#   pack.py and packhelm.py (and packknight.py through it) call `worn(name, colour, normal, orm)` on every armour tile and
#   helmet sheet they pack from a bake, so a fresh bake comes out worn.
#   python3 tools/blender/wear.py <clean dir> [name ...]
#       for maps whose bakes are not at hand: the named tiles' and sheets' clean images are read from the data files in
#       <clean dir> (detailmaps-data.js, helmmaps-data.js and knighthelms-data.js as packed without wear, e.g.
#       `git show 70afbbc:src/<file>`), worn, and put in place of the images the same files in src/ hold for them;
#       everything else there stays as it is. No names: everything in WEAR. Always from the clean images, never from the
#       worn files: the wear would be laid on twice. (The clean images have been through WebP once already and go through
#       it again here: where the bakes are at hand, pack them afresh instead.)
#   python3 tools/blender/wear.py <clean dir> --preview <dir> [name ...]   the worn maps as PNGs, nothing written.
#
# What a tile's wear is made of (each a layer over the baked maps; all of them repeat with the tile):
#   scratches  fine straight scores, mostly a few centimetres long, every way round but more of them across than along (the
#              cloth and sand a harness is scoured with): each a shallow groove in the normal map, rougher and a shade darker
#   dulling    the polish no longer one mirror: the roughness raised a little all over, and more in soft patches a hand
#              across where it has been handled and wiped, with a fine grain over it
#   tarnish    those patches a shade darker and warmer (oil, old polish and the first bloom of oxide)
#   grime      dark dirt lying where a cloth does not reach: in the tile's own hollows (its baked occlusion: between the rings
#              of mail, in the roping of a turned edge, round rivet heads, in the roots of flutes), rough and not metal
#   rust       a few pin-head freckles in loose clusters, brown, rough, not metal, each with a faint stain round it
#   chips      (lacquer) small flakes off the surface at the lames' feet and edges, the dark ground showing, matte
#   dust       (lacquer) a pale matte film in the hollows and thinly over the whole
# The amounts are per material kind below; each is 0 for none. They are set so the knight's harness reads as used at a full
# figure's distance and shows its scratches and freckles only in a close-up.

import base64
import io
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

# Per material: `scratches` [how many to a square metre, least and greatest length (m), least and greatest width (m), how deep
# (the groove's slope in the normal map), how much rougher, how much darker]; `across` how many times likelier a scratch runs
# round the piece than along it; `dull` [roughness added all over, added in the patches, the fine grain's]; `patch` the
# patches' sizes (m, least and greatest wavelength); `tarnish` [how much darker in the patches, its tint]; `grime` [how
# strongly the hollows fill, its colour, how rough]; `rust` [freckles to a square metre, least and greatest radius (m), how
# opaque, colour]; `chips` [flakes to a square metre of edge (the ground within 2 mm of where the tile's relief turns; a
# twentieth as many elsewhere), least and greatest radius (m), colour]; `dust` [in the hollows, over the whole, colour].
# A scratch thinner than a pixel of the tile is drawn as faint as the share of the pixel it covers.
WEAR_KINDS = {
    # Bright plate (a knight's harness, a helmet's skull): ground and polished, kept by a squire, never quite a mirror again.
    'steel': {
        'scratches': [4200, 0.006, 0.06, 0.00008, 0.0003, 0.5, 0.34, 0.1], 'across': 2.2,
        'dull': [0.045, 0.09, 0.02], 'patch': [0.03, 0.11],
        'tarnish': [0.06, (0.92, 0.85, 0.76)],
        'grime': [0.5, (0.2, 0.17, 0.14), 0.75],
        'rust': [1200, 0.0003, 0.001, 0.6, (0.4, 0.24, 0.14)],
    },
    # Mail: tumbled bright where the rings rub, oil and dirt between them, rust first where they do not move.
    'mail': {
        'scratches': None, 'across': 1,
        'dull': [0.04, 0.08, 0.02], 'patch': [0.02, 0.06],
        'tarnish': [0.12, (0.88, 0.8, 0.7)],
        'grime': [0.45, (0.2, 0.16, 0.12), 0.8],
        'rust': [2500, 0.0004, 0.0012, 0.5, (0.42, 0.25, 0.14)],
    },
    # Lacquer over iron or rawhide (a tosei do's lames): hard and glossy, so it keeps its shine but gathers fine scratches and
    # dust, and flakes in small chips where edges knock.
    'lacquer': {
        'scratches': [3600, 0.005, 0.04, 0.00008, 0.00025, 0.35, 0.26, 0.0], 'across': 1.6,
        'dull': [0.03, 0.07, 0.02], 'patch': [0.03, 0.1],
        'tarnish': [0.04, (0.95, 0.93, 0.9)],
        'grime': [0.0, (0.2, 0.17, 0.14), 0.75],
        'rust': None,
        'chips': [5000, 0.00025, 0.0009, (0.5, 0.44, 0.4)],
        'dust': [0.45, 0.04, (1.12, 1.1, 1.05)],
    },
}

# Each tile's material, and the tile's side in metres round and up (detailmaps.js DETAIL_ARMOUR), which sizes the wear. A
# helmet's sheet (helmmaps.js, knighthelms.js) is an atlas of one half of the helmet, about 0.4 m of its surface to a side; its marks do not
# need to repeat, and the two halves of the helmet wear the same ones.
WEAR = {
    'plate': ('steel', (0.2, 0.2)),
    'fluted': ('steel', (0.06, 0.06)),
    'harnessEdge': ('steel', (0.05, 0.025)),
    'mail': ('mail', (0.048, 0.048)),
    'yokohagi': ('lacquer', (0.12, 0.08)),
    'kozane': ('lacquer', (0.1, 0.12)),
    'sugake': ('lacquer', (0.1, 0.1)),
    'knightSallet': ('steel', (0.4, 0.4)),
    'knightHounskull': ('steel', (0.4, 0.4)),
    'knightCloseHelmet': ('steel', (0.4, 0.4)),
    # (A war mask's sheet is half a face, about 0.2 m to a side.)
    'maskOni': ('lacquer', (0.2, 0.2)),
    'maskRessei': ('lacquer', (0.2, 0.2)),
    'maskTengu': ('lacquer', (0.2, 0.2)),
}

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def seed_of(name):
    return sum((index + 1) * ord(letter) for index, letter in enumerate(name)) % 100000


def band_noise(shape, metres, shortest, longest, rng):
    """Noise that repeats with the tile, of wavelengths between shortest and longest (m), scaled to a deviation of 1."""
    rows, columns = shape
    fy = np.fft.fftfreq(rows)[:, None] * rows / metres[1]
    fx = np.fft.fftfreq(columns)[None, :] * columns / metres[0]
    f = np.hypot(fx, fy)
    lowest = 1 / max(longest, 1e-6)
    # (A tile shorter than the longest wavelength still has its first harmonic.)
    lowest = min(lowest, 1 / min(metres) * 1.01) if min(metres) < longest else lowest
    keep = ((f >= lowest * 0.999) & (f <= 1 / shortest)).astype(float)
    spectrum = np.fft.fft2(rng.standard_normal(shape)) * keep / np.maximum(f, lowest) ** 1.0
    field = np.real(np.fft.ifft2(spectrum))
    deviation = field.std()
    return field / deviation if deviation > 1e-12 else field * 0


def smooth(edge0, edge1, x):
    t = np.clip((x - edge0) / (edge1 - edge0), 0, 1)
    return t * t * (3 - 2 * t)


def blur_wrap(field, radius):
    """A Gaussian blur (pixels) that wraps round the tile."""
    if radius <= 0:
        return field
    rows, columns = field.shape
    fy = np.fft.fftfreq(rows)[:, None]
    fx = np.fft.fftfreq(columns)[None, :]
    return np.real(np.fft.ifft2(np.fft.fft2(field) * np.exp(-2 * (np.pi * radius) ** 2 * (fx * fx + fy * fy))))


def marks(shape, metres, rng, draw_one, count, oversample=4):
    """`count` marks drawn (draw_one(draw, x, y, pixels per metre), on a canvas `oversample` times the tile) so they wrap."""
    rows, columns = shape
    big = Image.new('F', (columns * oversample, rows * oversample), 0.0)
    canvas = ImageDraw.Draw(big)
    per_metre = columns * oversample / metres[0], rows * oversample / metres[1]
    for _ in range(count):
        x, y = rng.random() * columns * oversample, rng.random() * rows * oversample
        shapes = draw_one(rng, per_metre)
        for dx in (-columns * oversample, 0, columns * oversample):
            for dy in (-rows * oversample, 0, rows * oversample):
                for kind, points, value, width in shapes:
                    moved = [(px + x + dx, py + y + dy) for px, py in points]
                    if kind == 'line':
                        canvas.line(moved, fill=value, width=width)
                    else:
                        (ax, ay), (bx, by) = moved
                        canvas.ellipse([ax, ay, bx, by], fill=value)
    return np.asarray(big.resize((columns, rows), Image.BOX), dtype=np.float64)


def laced_tiles():
    """The tiles whose two masks are lacing (src/detailmaps.js DETAIL_ARMOUR, `masks: 'lace'`): drawn in the cords' colours."""
    import re
    with open(os.path.join(ROOT, 'src', 'detailmaps.js')) as file:
        return set(re.findall(r"^  (\w+): \{[^\n]*masks: 'lace'", file.read(), re.M))


def worn(name, colour, normal, orm, keep=None):
    """
    A tile's maps worn: `colour` (h, w, 3), `normal` (h, w, 3: 0..1, as packed), `orm` (h, w, 3: occlusion, roughness,
    metalness), floats 0..1, all one size. Returns the three, the same shapes. A tile not in WEAR comes back as it was.
    `keep` (h, w; 0..1): how much of each pixel is another material than the map's kind, which keeps its clean maps: a laced
    tile's lacing (its two masks; the shader draws the cords there in their own colours over this albedo), a war mask's
    teeth, gilt and hair (all but its lacquer, the albedo's alpha). The plates' scratches, chips and dust are not theirs.
    """
    if name not in WEAR:
        return colour, normal, orm
    clean = (colour.astype(np.float64).copy(), normal.astype(np.float64).copy(), orm.astype(np.float64).copy())
    kind, metres = WEAR[name]
    spec = WEAR_KINDS[kind]
    rng = np.random.default_rng(seed_of(name))
    shape = colour.shape[:2]
    area = metres[0] * metres[1]
    colour = colour.astype(np.float64).copy()
    orm = orm.astype(np.float64).copy()
    n = normal.astype(np.float64) * 2 - 1
    occlusion, roughness, metal = orm[:, :, 0], orm[:, :, 1], orm[:, :, 2]
    per_metre = shape[1] / metres[0], shape[0] / metres[1]
    height = np.zeros(shape)

    # Dulling and tarnish: soft patches.
    base, patches, grain = spec['dull']
    patch = smooth(-1.3, 1.9, band_noise(shape, metres, spec['patch'][0], spec['patch'][1], rng))
    fine = band_noise(shape, metres, 0.0008, 0.004, rng)
    roughness += base + patches * patch + grain * fine
    darker, tint = spec['tarnish']
    colour *= 1 - darker * patch[:, :, None] * (1 - np.asarray(tint))[None, None, :] / max(1e-6, 1 - min(tint))

    # Scratches.
    if spec.get('scratches'):
        density, shortest, longest, thin, thick, deep, rougher, dark = spec['scratches']
        across = spec['across']

        def scratch(rng, scale):
            # (More short ones than long: the length's square falls evenly.)
            length = shortest + (longest - shortest) * rng.random() ** 2.5
            angle = rng.random() * np.pi
            if rng.random() < (across - 1) / (across + 1):
                angle = (rng.random() - 0.5) * 0.7
            wide = (thin + (thick - thin) * rng.random() ** 2) * (scale[0] + scale[1]) / 2
            # (Thinner than the canvas's pixel: one pixel wide, and that much fainter.)
            faint = min(1, wide)
            return [('line', [(0, 0), (np.cos(angle) * length * scale[0], np.sin(angle) * length * scale[1])], float((0.4 + 0.6 * rng.random()) * faint), max(1, int(round(wide))))]

        scored = np.clip(marks(shape, metres, rng, scratch, int(density * area)), 0, 1)
        roughness += rougher * scored
        colour *= 1 - dark * scored[:, :, None]
        height -= deep * scored

    # Grime in the hollows the tile already has.
    strength, grime_colour, grime_rough = spec['grime']
    if strength > 0:
        hollow = blur_wrap(np.clip((1 - occlusion) * 2.5, 0, 1), 0.8)
        # (Broken up a little, so it is dirt and not a drawn shadow.)
        hollow = np.clip(hollow * (0.75 + 0.35 * band_noise(shape, metres, 0.002, 0.02, rng)), 0, 1) * strength
        colour = colour * (1 - hollow[:, :, None]) + np.asarray(grime_colour)[None, None, :] * hollow[:, :, None]
        roughness = roughness * (1 - hollow) + grime_rough * hollow
        metal *= 1 - 0.8 * hollow

    # Rust freckles, in loose clusters, each with a stain round it.
    if spec.get('rust'):
        density, least, most, opaque, rust_colour = spec['rust']
        cluster = smooth(0.2, 1.6, band_noise(shape, metres, min(0.02, min(metres) / 2), min(0.08, max(metres)), rng))

        def freckle(rng, scale):
            radius = least + (most - least) * rng.random() ** 2
            rx, ry = max(0.6, radius * scale[0]), max(0.6, radius * scale[1])
            return [('dot', [(-rx, -ry), (rx, ry)], float(0.5 + 0.5 * rng.random()), 0)]

        dots = np.clip(marks(shape, metres, rng, freckle, int(density * area * 2.5)), 0, 1) * cluster
        stain = np.clip(blur_wrap(dots, 0.0012 * per_metre[0]) * 2.2, 0, 1) * 0.35
        rust = np.clip(dots * opaque + stain, 0, 1)
        colour = colour * (1 - rust[:, :, None]) + np.asarray(rust_colour)[None, None, :] * rust[:, :, None]
        roughness = roughness * (1 - rust) + 0.85 * rust
        metal *= 1 - 0.85 * np.clip(dots * opaque, 0, 1)

    # Lacquer: chips at the knocked edges (where the tile's relief turns), dust in the hollows and thinly over all.
    if spec.get('chips'):
        density, least, most, chip_colour = spec['chips']
        # (The relief's turns: where the normal leaves the tile's general lie.)
        lie = np.median(n.reshape(-1, 3), axis=0)
        edges = np.clip((np.hypot(n[:, :, 0] - lie[0], n[:, :, 1] - lie[1]) - 0.08) * 8, 0, 1)
        near_edges = np.clip(blur_wrap(edges, 0.002 * per_metre[1]) * 4, 0, 1) > 0.3

        def chip(rng, scale):
            radius = least + (most - least) * rng.random() ** 2
            rx, ry = max(0.7, radius * scale[0] * (0.6 + 0.8 * rng.random())), max(0.7, radius * scale[1] * (0.6 + 0.8 * rng.random()))
            return [('dot', [(-rx, -ry), (rx, ry)], 1.0, 0)]

        flakes = np.clip(marks(shape, metres, rng, chip, int(density * area)), 0, 1)
        few = np.clip(marks(shape, metres, rng, chip, int(density * area / 20)), 0, 1)
        chipped = np.maximum(flakes * near_edges, few)
        colour = colour * (1 - chipped[:, :, None]) + np.asarray(chip_colour)[None, None, :] * chipped[:, :, None]
        roughness = roughness * (1 - chipped) + 0.7 * chipped
        height -= 0.3 * chipped
    if spec.get('dust'):
        in_hollows, over_all, dust_colour = spec['dust']
        hollow = blur_wrap(np.clip((1 - occlusion) * 3.0, 0, 1), 1.0)
        dust = np.clip(hollow * in_hollows + over_all * (0.6 + 0.4 * patch), 0, 1)
        colour = colour * (1 - dust[:, :, None]) + np.minimum(1, colour * np.asarray(dust_colour)[None, None, :] + 0.25) * dust[:, :, None]
        roughness = roughness * (1 - dust) + 0.8 * dust

    # The grooves and pits as slopes of the normal map (the height is in units of the slope a full mark has at its edge).
    if np.any(height):
        soft = blur_wrap(height, 0.5)
        gx = (np.roll(soft, -1, axis=1) - np.roll(soft, 1, axis=1)) * 0.5
        gy = (np.roll(soft, -1, axis=0) - np.roll(soft, 1, axis=0)) * 0.5
        # (Image rows run down; the map's green runs up.)
        n[:, :, 0] -= gx * 2.0
        n[:, :, 1] += gy * 2.0
        n /= np.maximum(np.linalg.norm(n, axis=2, keepdims=True), 1e-6)

    orm[:, :, 1] = np.clip(roughness, 0.04, 1)
    orm[:, :, 2] = np.clip(metal, 0, 1)
    colour, n = np.clip(colour, 0, 1), n * 0.5 + 0.5
    if keep is not None:
        share = np.clip(keep, 0, 1)[:, :, None]
        colour, n, orm = (worn_map * (1 - share) + clean_map * share for worn_map, clean_map in zip((colour, n, orm), clean))
    return colour, n, orm


def images_of(block):
    """A data file entry's images (key -> PIL image) and the text of each (key -> its base64)."""
    images, texts = {}, {}
    for key in ('albedo', 'normal', 'orm'):
        start = block.index(f"{key}: '") + len(key) + 3
        texts[key] = block[start:block.index("'", start)]
        images[key] = Image.open(io.BytesIO(base64.b64decode(texts[key])))
    return images, texts


def main():
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import re
    import pack
    import packhelm
    import packknight

    arguments = sys.argv[1:]
    preview = None
    if '--preview' in arguments:
        at = arguments.index('--preview')
        preview = arguments[at + 1]
        del arguments[at:at + 2]
        os.makedirs(preview, exist_ok=True)
    clean_dir, names = arguments[0], arguments[1:] or list(WEAR)
    laced = laced_tiles()
    for file_name, table, quality in (
        ('detailmaps-data.js', pack.ARMOUR, lambda name, key: pack.ARMOUR[name]['quality']),
        ('helmmaps-data.js', packhelm.SHEETS, lambda name, key: packhelm.QUALITY[key]),
        ('knighthelms-data.js', packknight.SHEETS, lambda name, key: packhelm.QUALITY[key]),
    ):
        mine = [name for name in names if name in table]
        if not mine:
            continue
        with open(os.path.join(clean_dir, file_name)) as file:
            clean = file.read()
        target = os.path.join(ROOT, 'src', file_name)
        with open(target) as file:
            text = file.read()
        for name in mine:
            def block_of(whole):
                start = whole.index(f'\n  {name}: {{\n') + 1
                return start, whole.index('\n  },\n', start)

            start, end = block_of(clean)
            images, _ = images_of(clean[start:end])
            size = images['albedo'].size
            albedo = np.asarray(images['albedo'], dtype=np.float64) / 255
            normal = np.asarray(images['normal'], dtype=np.float64) / 255
            orm = np.asarray(images['orm'].convert('RGB').resize(size, Image.BICUBIC), dtype=np.float64) / 255
            keep = None
            if name in laced and albedo.shape[2] == 4 and normal.shape[2] == 4:
                keep = np.maximum(albedo[:, :, 3], normal[:, :, 3])
            elif packhelm.SHEETS.get(name, {}).get('alpha') and albedo.shape[2] == 4:
                keep = 1 - albedo[:, :, 3]
            colour, n, o = worn(name, albedo[:, :, :3], normal[:, :, :3], orm, keep)
            if preview:
                for key, array in (('albedo', colour), ('normal', n), ('orm', o)):
                    Image.fromarray(pack.to8(array)).save(os.path.join(preview, f'{name}.{key}.png'))
                continue
            # (The masks in the alpha channels as they were.)
            out = {
                'albedo': pack.webp(pack.to8(np.concatenate([colour, albedo[:, :, 3:]], axis=2)), quality(name, 'albedo')),
                'normal': pack.webp(pack.to8(np.concatenate([n, normal[:, :, 3:]], axis=2)), quality(name, 'normal')),
                'orm': pack.webp(pack.to8(pack.resample(o, size[0] // 2)), quality(name, 'orm')),
            }
            mean = [round(float(value), 4) for value in pack.to8(colour).reshape(-1, 3).mean(axis=0) / 255]
            start, end = block_of(text)
            block = text[start:end]
            _, texts = images_of(block)
            # (A map the wear leaves as it was keeps its packed image: packing it again would only lose a little of it.)
            same = {'normal': np.array_equal(pack.to8(n), pack.to8(normal[:, :, :3]))}
            for key, data in out.items():
                if not same.get(key):
                    block = block.replace(f"{key}: '{texts[key]}'", f"{key}: '{base64.b64encode(data).decode('ascii')}'")
            block = re.sub(r'mean: \[[^\]]*\]', f'mean: {mean}', block, count=1)
            text = text[:start] + block + text[end:]
            print(name, WEAR[name][0], 'mean', mean, {key: 'kept' if same.get(key) else len(data) for key, data in out.items()})
        if not preview:
            with open(target, 'w') as file:
                file.write(text)
            print('wrote', os.path.relpath(target, ROOT))


if __name__ == '__main__':
    main()
