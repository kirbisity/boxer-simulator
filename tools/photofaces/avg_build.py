"""Project each average face (a frontal photo) into the game's cylindrical head atlas, synthesise the rest of the head,
flatten its light, and write its albedo and normal map, a shared roughness map, and a manifest.

Usage: python3 -I avg_build.py <tiles dir (avg_tiles.py's out)> <out dir>

Atlas (W x H, as src/photoface.js PHOTO_ATLAS): column = u (0 and 1 the back of the head, 0.5 the face), row = 1 - v.
The albedo is stored relative to the face's own skin: its cheeks are NEUTRAL grey, so the game multiplies it by the
fighter's skin colour (the body's) and face and body match by construction.
"""
import base64
import io
import json
import zlib
import os
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter, map_coordinates

W, H = 512, 256
U_EYE, U_EAR = 0.0668, 0.258
R_EYE, R_MOUTH, R_CHIN = 0.44, 0.70, 0.88
MOUTH_SHARE = 0.56
NEUTRAL = 0.45  # (low, so whites of the eyes can be brighter than a dark skin: up to 1/NEUTRAL of it)
RELIEF_GAIN = 3.0  # (half the 1024-wide atlas' 6: the same slopes at half the texels)
DELIGHT = 0.6  # how much of the face's broad light is divided out


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def lum(img):
    return img[..., 0] * 0.3 + img[..., 1] * 0.59 + img[..., 2] * 0.11


def gauss(xx, yy, x, y, sx, sy, a):
    return a * np.exp(-(((xx - x) / sx) ** 2 + ((yy - y) / sy) ** 2) / 2)


def segment(xx, yy, p, q, width, a0, a1):
    p, q = np.array(p, float), np.array(q, float)
    d = q - p
    t = np.clip(((xx - p[0]) * d[0] + (yy - p[1]) * d[1]) / (d @ d), 0, 1)
    dist2 = (xx - p[0] - t * d[0]) ** 2 + (yy - p[1] - t * d[1]) ** 2
    return (a0 + (a1 - a0) * t) * np.exp(-dist2 / (2 * width ** 2))


YY, XX = np.mgrid[0:H, 0:W].astype(float)
CX, E = W / 2, U_EYE * W
ER, MR, CR = R_EYE * H, R_MOUTH * H, R_CHIN * H
NR = ER + 0.55 * (MR - ER)


# The big forms (nose, brow, cheekbones, lips, chin) are in the head's geometry now (src/photohead.js): the map keeps a share.
GEOMETRY_SHARE = 0.3


def eye_mask(soft=1.0):
    """The eyes' openings (atlas), 1 inside."""
    m = np.zeros((H, W))
    for side in (-1, 1):
        d = ((XX - (CX + side * E)) / (0.027 * W)) ** 2 + ((YY - ER) / (0.013 * H)) ** 2
        m = np.maximum(m, np.clip((1.0 - d) / (0.25 * soft), 0, 1))
    return m


def strokes(rng, hair_dark, brow_rows=(None, None)):
    """Brow hairs and lashes, drawn at four times the atlas and brought down: the composite's blur gets a drawn line."""
    k = 4
    canvas = Image.new('L', (W * k, H * k), 0)
    draw = ImageDraw.Draw(canvas)
    for side, brow_row in zip((-1, 1), brow_rows):
        inner, outer = CX + side * (E - 0.6 * 0.0668 * W * 0.35), CX + side * (E + 0.03 * W)
        base = brow_row if brow_row is not None else ER - 0.048 * H
        for _ in range(150):
            t = rng.random()
            x = inner + (outer - inner) * t
            y = base - 2.2 * np.sin(np.pi * min(1, t * 1.4)) + (rng.random() - 0.5) * (3.2 - 1.8 * t)
            angle = np.radians(25 + 30 * (1 - t)) if side > 0 else np.radians(155 - 30 * (1 - t))
            length = 2.5 + 2.0 * rng.random()
            draw.line([(x * k, y * k), ((x + np.cos(angle) * length * 0.8 * (1 if side > 0 else 1)) * k, (y - np.sin(angle) * length * 0.5) * k)], fill=int(150 * hair_dark), width=2)
        # The upper lash line: the top of the eye's opening, flicked out at the corner.
        cx, ex, ey = CX + side * E, 0.027 * W, 0.013 * H
        points = [((cx + side * ex * 0.95 * np.cos(a)) * k, (ER - ey * np.sin(a) * 0.75) * k) for a in np.linspace(np.pi * 0.95, 0.02, 20)]
        points.append(((cx + side * ex * 1.15) * k, (ER - ey * 0.85) * k))
        draw.line(points, fill=200, width=3)
        lower = [((cx + side * ex * np.cos(a)) * k, (ER + ey * np.sin(a) * 0.95) * k) for a in np.linspace(np.pi * 0.85, 0.1, 14)]
        draw.line(lower, fill=90, width=3)
    return np.asarray(canvas.resize((W, H), Image.LANCZOS), dtype=np.float32) / 255


def unsharp(img, sigma, amount):
    return img + (img - np.stack([gaussian_filter(img[..., c], sigma) for c in range(3)], axis=2)) * amount


def relief(nose=1.0, brow=1.0):
    """The generic face's height (the 3D.sk pilot's), with the nose's width and the brow's depth as knobs."""
    xx, yy, cx, e, er, mr, cr, nr = XX, YY, CX, E, ER, MR, CR, NR
    z = np.zeros((H, W))
    for s in (-1, 1):
        ex = cx + s * e
        z += gauss(xx, yy, ex, er - 0.5 * e, 0.75 * e, 0.25 * e, 0.6 * brow)
        z += gauss(xx, yy, ex, er, 0.55 * e, 0.32 * e, -0.6 * brow)
        z += gauss(xx, yy, ex, er + 0.02 * e, 0.3 * e, 0.17 * e, 0.4)
        z += gauss(xx, yy, cx + s * 0.34 * e * nose, nr + 0.05 * e, 0.17 * e * nose, 0.15 * e, 0.8)
        z += gauss(xx, yy, cx + s * 1.05 * e, er + 0.5 * e, 0.45 * e, 0.3 * e, 0.7)
        z += segment(xx, yy, (cx + s * 0.42 * e * nose, nr + 0.15 * e), (cx + s * 0.75 * e, mr + 0.2 * e), 0.07 * e, -0.5, -0.2)
        ear = cx + s * U_EAR * W
        z += gauss(xx, yy, ear, er + 0.35 * e, 0.38 * e, 0.75 * e, 1.6)
        z += gauss(xx, yy, ear - s * 0.05 * e, er + 0.45 * e, 0.16 * e, 0.3 * e, -1.1)
    z += segment(xx, yy, (cx, er - 0.1 * e), (cx, nr - 0.05 * e), 0.24 * e * nose, 0.4, 1.4)
    z += gauss(xx, yy, cx, nr, 0.3 * e * nose, 0.26 * e, 1.4)
    z += gauss(xx, yy, cx, nr + 0.3 * e, 0.3 * e, 0.09 * e, -0.3)
    z += gauss(xx, yy, cx, mr - 0.13 * e, 0.45 * e, 0.1 * e, 0.6)
    z += gauss(xx, yy, cx, mr + 0.15 * e, 0.4 * e, 0.12 * e, 0.7)
    z += gauss(xx, yy, cx, mr, 0.32 * e, 0.035 * e, -0.35)
    z += gauss(xx, yy, cx, mr + 0.45 * e, 0.35 * e, 0.08 * e, -0.35)
    z += gauss(xx, yy, cx, cr - 0.35 * e, 0.45 * e, 0.3 * e, 0.9)
    return z


def normals_from(height):
    gy, gx = np.gradient(height)
    n = np.stack([-gx, gy, np.ones_like(height)], axis=2)
    return n / np.linalg.norm(n, axis=2, keepdims=True)


def roughness():
    """Shared by every face: satin skin, an oily T-zone and lips, wet eyes (a glint)."""
    xx, yy, cx, e, er, mr, cr = XX, YY, CX, E, ER, MR, CR
    rough = np.full((H, W), 0.62)
    tzone = np.maximum.reduce([gauss(xx, yy, cx, er - 1.3 * e, 1.1 * e, 0.6 * e, 1), gauss(xx, yy, cx, er + 0.5 * (mr - er), 0.35 * e, 0.9 * e, 1), gauss(xx, yy, cx, cr - 0.4 * e, 0.45 * e, 0.3 * e, 1)])
    rough -= 0.2 * tzone
    rough = np.minimum(rough, 0.62 - 0.25 * gauss(xx, yy, cx, mr + 0.02 * e, 0.42 * e, 0.16 * e, 1))
    for s in (-1, 1):
        rough = np.minimum(rough, 0.62 - 0.5 * gauss(xx, yy, cx + s * e, er, 0.24 * e, 0.09 * e, 1))
    return rough


def project(tile, mark):
    """The atlas sampled from the frontal photo: u by azimuth (x = centre + R sin(azimuth)), rows through eye, lip line, chin."""
    (x1, y1), (x2, y2) = mark['eyes']
    cx, ey, half = (x1 + x2) / 2, (y1 + y2) / 2, (x2 - x1) / 2
    my = mark['mouth']
    chin = ey + (my - ey) / MOUTH_SHARE
    radius = half / np.sin(U_EYE * 2 * np.pi)
    az = ((np.arange(W) + 0.5) / W - 0.5) * 2 * np.pi
    px = cx + radius * np.sin(np.clip(az, -np.pi / 2, np.pi / 2))
    rows = (np.arange(H) + 0.5) / H
    knots_r = [R_EYE, R_MOUTH, R_CHIN]
    knots_y = [ey, my, chin]
    py = np.interp(rows, knots_r, knots_y, left=np.nan, right=np.nan)
    above = rows < R_EYE
    py[above] = ey - (R_EYE - rows[above]) * (my - ey) / (R_MOUTH - R_EYE)
    below = rows > R_CHIN
    py[below] = chin + (rows[below] - R_CHIN) * (chin - my) / (R_CHIN - R_MOUTH)
    yy, xx = np.meshgrid(py, px, indexing='ij')
    face = np.stack([map_coordinates(tile[..., c], [yy, xx], order=1, mode='nearest') for c in range(3)], axis=2)
    # The face oval (photo space): forehead below the hair, cheeks inside the outline, down past the chin.
    top, bottom = ey - 0.85 * (my - ey), chin - 0.03 * (chin - ey)
    oy, ob, oa = (top + bottom) / 2, (bottom - top) / 2, 1.6 * half
    d = np.sqrt(((xx - cx) / oa) ** 2 + ((yy - oy) / ob) ** 2)
    mask = smoothstep(1.0, 0.78, d) * smoothstep(1.15, 0.85, np.abs(az))[None, :] * smoothstep(tile.shape[0] - 1, tile.shape[0] - 6, yy)
    return face, mask, (cx, ey, half, my, chin)


def colour_at(tile, x, y, r):
    patch = tile[int(y - r): int(y + r) + 1, int(x - r): int(x + r) + 1].reshape(-1, 3)
    return np.median(patch, axis=0)


def build(key, mark, tiles_dir, out):
    tile = np.asarray(Image.open(f'{tiles_dir}/tiles/{key}.png').convert('RGB'), dtype=np.float32) / 255
    face, mask, (cx, ey, half, my, chin) = project(tile, mark)
    # The skin: the cheeks under the eyes; the hair: the blur over the forehead (the composite's hair line).
    skin = np.mean([colour_at(tile, cx + s * half, ey + 0.5 * (my - ey), max(2, half * 0.25)) for s in (-1, 1)], axis=0)
    band = tile[max(0, int(ey - 1.8 * (my - ey))): max(2, int(ey - 1.25 * (my - ey))), int(cx - 1.3 * half): int(cx + 1.3 * half)].reshape(-1, 3)
    dark = lum(band) <= np.median(lum(band))
    hair = np.median(band[dark], axis=0) * 0.85
    # (The blur over the head is part background: no hair lighter than 0.6 of the skin, no grey cast.)
    warm = hair[0] - hair[2] > 0.08  # blond or brown, not the grey of a background
    cap = 0.6 * lum(skin[None, None])[0, 0] if warm else 0.12
    hair = hair * min(1.0, cap / max(1e-3, lum(hair[None, None])[0, 0]))
    hair = lum(hair[None, None])[0, 0] + (hair - lum(hair[None, None])[0, 0]) * 1.3
    # Light flattened: the face's broad luminance divided out (frequency separation), its fine detail kept.
    lo = gaussian_filter(lum(face) * mask, 10) / np.maximum(gaussian_filter(mask, 10), 1e-3)
    ref = lum(skin[None, None])[0, 0]
    flat = face * np.clip((ref / np.maximum(lo, 1e-3)) ** DELIGHT, 0.75, 1.4)[..., None]
    flat = flat * mask[..., None] + skin * (1 - mask[..., None])
    # The rest of the head: the face's colours pushed out (blur over the mask) and eased to the skin's mean.
    reach = gaussian_filter(mask, 14)
    ext = np.stack([gaussian_filter(flat[..., c] * mask, 14) for c in range(3)], axis=2) / np.maximum(reach, 1e-3)[..., None]
    near = np.clip(reach / 0.3, 0, 1)[..., None]
    rest = skin + (ext - skin) * near * 0.8
    albedo = flat * mask[..., None] + rest * (1 - mask[..., None])
    # Ears (no photo of them): a shared patch, the skin a little redder, the hollow darker.
    for s in (-1, 1):
        ear = CX + s * U_EAR * W
        lobe = gauss(XX, YY, ear, ER + 0.35 * E, 0.4 * E, 0.8 * E, 1)
        hollow = gauss(XX, YY, ear - s * 0.05 * E, ER + 0.45 * E, 0.16 * E, 0.3 * E, 1)
        albedo = albedo * (1 - lobe[..., None] * np.array([0.0, 0.07, 0.1])) * (1 - 0.12 * hollow[..., None])
    # Sharper than the composite: the eyes (iris and whites) and the lips' edges, brought out of the blur.
    eyes = eye_mask()[..., None]
    mouth = gauss(XX, YY, CX, MR, 0.05 * W, 0.03 * H, 1)[..., None]
    albedo = albedo + (unsharp(albedo, 1.2, 1.6) - albedo) * eyes + (unsharp(albedo, 1.5, 0.9) - albedo) * mouth
    white = np.clip((lum(albedo) - gaussian_filter(lum(albedo), 3)) * 6, 0, 1)[..., None] * eyes
    albedo = albedo + (np.array([0.93, 0.92, 0.9]) - albedo) * white * 0.55
    rel = albedo / skin
    # Kept to a skin's range: no blue sheen or background bled in from the composite's edges, no blown highlights (but the eyes).
    level = np.clip(lum(rel), 0.3, 1.12 + 1.0 * eyes[..., 0])
    tint = np.clip(rel / np.maximum(lum(rel), 1e-3)[..., None], [0.85, 0.85, 0.6], [1.3, 1.08, 1.05])
    rel = tint * level[..., None]
    # Drawn brow hairs and lashes in the composite's brow colour (darkened), seeded per face.
    rng = np.random.default_rng(zlib.crc32(key.encode()))
    brow_tone = np.array([colour_at(tile, cx + s * half, ey - 0.33 * (my - ey), max(1.5, half * 0.12)) for s in (-1, 1)]).mean(axis=0)
    hair_rel = np.minimum(brow_tone, hair * 1.2 + 0.02) / skin * 0.75
    # Where the composite's brows are: the darkest row over each eye.
    band = gaussian_filter(lum(albedo), 1.0)
    brow_rows = []
    for side in (-1, 1):
        x0, x1 = int(CX + side * E - 0.02 * W), int(CX + side * E + 0.02 * W)
        y0, y1 = int(ER - 0.09 * H), int(ER - 0.025 * H)
        brow_rows.append(y0 + float(np.argmin(band[y0:y1, min(x0, x1):max(x0, x1)].mean(axis=1))))
    lines = strokes(rng, 1.0, brow_rows)
    rel = rel + (hair_rel - rel) * (lines[..., None] * 0.6)
    rel = rel * NEUTRAL
    # Normal map: the generic relief and the photo's fine detail (soft: the source is about 40 px between the eyes).
    l = lum(rel)
    fine = (l - gaussian_filter(l, 1.2)) * mask
    height = relief() * RELIEF_GAIN * GEOMETRY_SHARE + fine * 2.0 + lines * 1.5
    nrm = normals_from(height)
    Image.fromarray((np.clip(rel, 0, 1) * 255 + 0.5).astype(np.uint8)).save(f'{out}/{key}-albedo.jpg', quality=90)
    Image.fromarray(((nrm * 0.5 + 0.5) * 255 + 0.5).astype(np.uint8)).save(f'{out}/{key}-normal.png')
    thumb = Image.fromarray((np.clip(rel, 0, 1) * 255 + 0.5).astype(np.uint8)).resize((32, 16), Image.BOX)
    # A lit preview, the skin applied, for the contact sheet.
    light = np.array([0.4, 0.45, 0.8])
    shade = np.clip(nrm @ (light / np.linalg.norm(light)), 0, 1) * 0.7 + 0.35
    preview = np.clip(rel / NEUTRAL * skin * shade[..., None], 0, 1)
    Image.fromarray((preview * 255).astype(np.uint8)).save(f'{out}/{key}-preview.jpg', quality=85)
    hexed = lambda c: '#%02x%02x%02x' % tuple(int(round(min(1, max(0, v)) * 255)) for v in c)
    return {'sex': mark['sex'], 'region': mark['region'], 'skin': hexed(skin), 'hair': hexed(hair), 'measured': mark.get('measured', {}), 'thumb': base64.b64encode(np.asarray(thumb).tobytes()).decode()}


def main():
    tiles_dir, out = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    marks = json.load(open(f'{tiles_dir}/tiles.json'))
    faces = {key: build(key, mark, tiles_dir, out) for key, mark in marks.items()}
    for sex in ('male', 'female'):
        keys = [k for k in faces if faces[k]['sex'] == sex]
        values = np.array([faces[k]['measured'].get('noseWidth', 0) for k in keys])
        mid, spread = np.median(values), np.std(values) + 1e-6
        for k, v in zip(keys, values):
            faces[k]['measured'] = {'noseWidth': float(np.clip((v - mid) / spread, -1.5, 1.5))}
    r8 = (np.clip(roughness(), 0, 1) * 255 + 0.5).astype(np.uint8)
    Image.fromarray(r8).convert('RGB').save(f'{out}/rough.png')
    with open(f'{out}/manifest.json', 'w') as f:
        json.dump({'size': [W, H], 'neutral': NEUTRAL, 'thumb': [32, 16], 'faces': faces}, f)
    print(len(faces), 'faces')


main()
