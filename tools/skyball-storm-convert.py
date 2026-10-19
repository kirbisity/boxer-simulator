# Turn Poly Haven HDRI panoramas (CC0, see docs/credits-scenery-photo.md) of real skies (thunderstorms, and fair weather for the sandbox's
# looks) into src/levelmode/stormsky-data.js, the photographic skies of Stage 1's looks (levelmode/stagesky.js).
#
# Each panorama becomes ONE equirectangular JPEG of the upper hemisphere only (elevation 90 degrees at the top row, the horizon at the
# bottom row; 2048 x 512), tone-mapped from the HDR (an exposure and a filmic shoulder, so the dark cloud base keeps its texture and the
# bright break and horizon band do not clip), with the skyline taken out: the photographs were taken from a bridge, and trees, roofs and
# cranes stand up to about 12 degrees round the horizon. For every column the sky above the skyline is stretched down over it (see SKYLINE),
# a smooth haze of cloud and not a drawn-over silhouette, nothing is invented. Beside the picture go the horizon colour (0..1, the
# median of the picture's own horizon band) and where its bright break (the sun, or the hole in the cloud) stands: u across 0..1, elevation.
#
#   python3 -I tools/skyball-storm-convert.py src/levelmode/stormsky-data.js \
#       stormA=cedar_bridge_sunset_1.4k.hdr stormB=cedar_bridge.4k.hdr dayClear=rustig_koppie_puresky.2k.hdr ... [preview-dir]
#
# Run once; the output is committed. Needs numpy and Pillow. Input files are untrusted data: read as bytes, never executed.

import base64
import io
import os
import sys

import numpy as np
from PIL import Image

# Skyline top (degrees up) at columns (u across 0..1 of the 4096 px panorama, as x of a 2048 px view), piecewise linear, wrapping round.
SKYLINE = {
    'stormA': [(0, 5.5), (60, 7), (130, 7.5), (330, 10), (470, 9), (520, 4.8), (580, 4.4), (1417, 4.4), (1560, 5.2), (1660, 7.5), (1760, 10.8), (1960, 11), (2048, 6.5)],
    'stormB': [(0, 6), (110, 7), (130, 12), (280, 12), (300, 7), (440, 5.5), (470, 4.2), (1440, 4.2), (1500, 5), (1650, 6.8), (1800, 7.2), (1830, 5.5), (2048, 6)],
}
# Down to this elevation the picture is remapped (the sky over a column's skyline is stretched to fill the whole way down).
REMAP_TO = 30.0
# ...and the sky is lifted this much (degrees): the lowest few degrees are the skyline's own haze, held flat, so the break stands higher over the sea.
LIFT = 3.0
OUT_WIDTH = 2048
OUT_ROWS = 512
QUALITY = {'stormA': 84, 'stormB': 84}
QUALITY_DEFAULT = 80
EXPOSURE_KEY = 0.26
# Exposure (multiplies the linear picture before the tone curve): chosen so that the horizon band is bright and the cloud base is readable.
EXPOSURE = {'stormA': 0.22, 'stormB': 0.22}


def read_hdr(path):
    """Radiance RGBE (.hdr, new-style run-length) as float32 (rows, columns, 3)."""
    with open(path, 'rb') as handle:
        data = handle.read()
    pos = 0
    while True:
        end = data.index(b'\n', pos)
        line = data[pos:end]
        pos = end + 1
        if line == b'':
            break
    end = data.index(b'\n', pos)
    fields = data[pos:end].decode().split()
    pos = end + 1
    height, width = int(fields[1]), int(fields[3])
    out = np.zeros((height, width, 4), dtype=np.uint8)
    for y in range(height):
        head = data[pos:pos + 4]
        if head[0] != 2 or head[1] != 2 or (head[2] << 8 | head[3]) != width:
            raise ValueError('unsupported scanline %d' % y)
        pos += 4
        for channel in range(4):
            x = 0
            while x < width:
                count = data[pos]
                pos += 1
                if count > 128:
                    count -= 128
                    out[y, x:x + count, channel] = data[pos]
                    pos += 1
                else:
                    out[y, x:x + count, channel] = np.frombuffer(data, dtype=np.uint8, count=count, offset=pos)
                    pos += count
                x += count
    exponent = out[:, :, 3].astype(np.int32)
    scale = np.where(exponent == 0, 0.0, np.ldexp(1.0, exponent - 136)).astype(np.float32)
    return out[:, :, :3].astype(np.float32) * scale[:, :, None]


def skyline_per_column(name, columns):
    points = SKYLINE[name]
    xs = np.array([p[0] for p in points], dtype=np.float64) / 2048.0 * columns
    ys = np.array([p[1] for p in points], dtype=np.float64)
    skyline = np.interp(np.arange(columns), xs, ys)
    # Smooth (wrapping), so that no column of the stretch stands out.
    radius = max(2, columns // 200)
    kernel = np.exp(-0.5 * (np.arange(-3 * radius, 3 * radius + 1) / radius) ** 2)
    kernel /= kernel.sum()
    padded = np.concatenate([skyline[-3 * radius:], skyline, skyline[:3 * radius]])
    return np.convolve(padded, kernel, mode='valid')


def remap_skyline(sky, name):
    """`sky`: float (rows, columns, 3), row 0 at 90 degrees, the last row at the horizon. The sky over the skyline stretched down over it."""
    rows, columns, _ = sky.shape
    per_row = 90.0 / rows
    skyline = skyline_per_column(name, columns)
    elevation = 90.0 - (np.arange(rows) + 0.5) * per_row
    out = sky.copy()
    low = int((90.0 - REMAP_TO) / per_row)
    for_rows = np.arange(low, rows)
    el = elevation[for_rows][:, None]
    # [LIFT, REMAP_TO] -> [skyline, REMAP_TO], and the lowest LIFT degrees hold the skyline's colour
    source_el = skyline[None, :] + np.maximum(el - LIFT, 0) * (REMAP_TO - skyline[None, :]) / (REMAP_TO - LIFT)
    source_row = (90.0 - source_el) / per_row - 0.5
    r0 = np.clip(np.floor(source_row).astype(int), 0, rows - 1)
    r1 = np.clip(r0 + 1, 0, rows - 1)
    f = (source_row - np.floor(source_row))[:, :, None]
    cols = np.arange(columns)[None, :]
    out[for_rows] = sky[r0, cols] * (1 - f) + sky[r1, cols] * f
    # The held lowest degrees, smeared sideways into a soft haze, not a comb of columns (fading into the picture a degree above).
    smooth = blur_along(out, 10)
    weight = np.clip((LIFT + 1.5 - elevation) / 1.5, 0, 1)[:, None, None]
    return out * (1 - weight) + smooth * weight


def blur_along(a, sigma):
    from scipy.ndimage import gaussian_filter1d
    return gaussian_filter1d(a, sigma, axis=1, mode='wrap')


def tone(linear, exposure):
    x = np.maximum(linear * exposure, 0.0)
    # A filmic shoulder (ACES fit), then sRGB.
    a, b, c, d, e = 2.51, 0.03, 2.43, 0.59, 0.14
    x = np.clip((x * (a * x + b)) / (x * (c * x + d) + e), 0, 1)
    return np.where(x <= 0.0031308, x * 12.92, 1.055 * np.power(x, 1 / 2.4) - 0.055)


def box_down(image, width, rows):
    h, w, _ = image.shape
    fx, fy = w // width, h // rows
    return image[:rows * fy, :width * fx].reshape(rows, fy, width, fx, 3).mean(axis=(1, 3))


def blur(a, sigma):
    from scipy.ndimage import gaussian_filter
    return gaussian_filter(a, sigma, mode=('nearest', 'wrap'))


def main(out, entries, preview_dir=None):
    lines = [
        '// Generated by tools/skyball-storm-convert.py from Poly Haven HDRI panoramas (CC0; credits in docs/credits-scenery-photo.md). Do not edit.',
        '// Each: the upper hemisphere of a real thunderstorm sky as an equirectangular JPEG (the top row straight up, the bottom row the horizon; the',
        "// skyline taken out), the horizon colour (0..1) and where the picture's bright break stands (u across 0..1, el degrees up).",
        'export const STORM_SKY_DATA = {',
    ]
    total = 0
    for entry in entries:
        name, source = entry.split('=', 1)
        hdr = read_hdr(source)
        rows_full = hdr.shape[0] // 2
        # (The "pure sky" panoramas have no skyline: the sky is used as it is.)
        sky = remap_skyline(hdr[:rows_full], name) if name in SKYLINE else hdr[:rows_full]
        small = box_down(sky, OUT_WIDTH, OUT_ROWS)
        # The bright break: the sun's disc if the picture has one, else the brightest broad place in the lower sky (the hole in the cloud).
        luminance = small.mean(axis=2)
        if float(luminance.max()) > 50:
            blurred = blur(luminance, 2)
            iy, ix = np.unravel_index(np.argmax(blurred), blurred.shape)
        else:
            blurred = blur(luminance, 14)
            top = int(OUT_ROWS * (90 - 20) / 90)
            iy, ix = np.unravel_index(np.argmax(blurred[top:]), blurred[top:].shape)
            iy += top
        sun_u = (ix + 0.5) / OUT_WIDTH
        sun_el = 90.0 - (iy + 0.5) * 90.0 / OUT_ROWS
        exposure = EXPOSURE.get(name)
        if exposure is None:
            # Auto: the geometric mean of the luminance between 5 and 60 degrees up, to a mid grey of 0.2, times the scale (daylight is brighter than a storm).
            band = luminance[int(OUT_ROWS * 30 / 90):int(OUT_ROWS * 85 / 90)]
            exposure = EXPOSURE_KEY / float(np.exp(np.log(band + 1e-4).mean()))
        ldr = tone(small, exposure)
        picture = (ldr * 255 + 0.5).astype(np.uint8)
        # The horizon band: the median of the picture's colour between 2 and 6 degrees, all the way round.
        band = ldr[int((90 - 6) / 90 * OUT_ROWS):int((90 - 2) / 90 * OUT_ROWS)].reshape(-1, 3)
        horizon = [round(float(np.median(band[:, k])), 3) for k in range(3)]
        buffer = io.BytesIO()
        Image.fromarray(picture).save(buffer, 'JPEG', quality=QUALITY.get(name, QUALITY_DEFAULT), optimize=True, progressive=True)
        size = len(buffer.getvalue())
        total += size
        print(f'{name}: {size} B, break u {sun_u:.4f} el {sun_el:.1f}, horizon {horizon}, peak {float(hdr.max()):.0f}, exposure {exposure:.3f}')
        if preview_dir:
            Image.fromarray(picture).save(os.path.join(preview_dir, name + '.png'))
        lines.append(f'  {name}: {{')
        lines.append(f'    width: {OUT_WIDTH}, rows: {OUT_ROWS}, horizon: {horizon}, breakU: {sun_u:.4f}, breakEl: {sun_el:.1f},')
        lines.append(f"    jpeg: '{base64.b64encode(buffer.getvalue()).decode('ascii')}',")
        lines.append('  },')
    lines.append('};')
    with open(out, 'w') as handle:
        handle.write('\n'.join(lines) + '\n')
    print(f'total JPEG {total} B')


if __name__ == '__main__':
    args = sys.argv[1:]
    preview = None
    if args and os.path.isdir(args[-1]):
        preview = args.pop()
    main(args[0], args[1:], preview)
