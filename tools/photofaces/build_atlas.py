"""Warp each supplied head unwrap into the game's canonical cylindrical head atlas and derive its normal and roughness maps.

Canonical atlas (W x H): column = u (0 and 1 the back of the head, 0.5 the face, u growing towards the subject's left);
row = 1 - v (row 0 the crown). Landmarks sit at fixed places, matching src/photoface.js PHOTO_ATLAS.
Usage: python3 -I build_atlas.py tools/photofaces <out dir>

The scans are licensed evaluation material (3D.sk): the atlases are written outside the repository and never committed.
Serve them to the game by linking the repository's (git-ignored) faces-local to <out dir>, then open index.html#faces=photo.
The shots: tools/serve.py on a free port, headless Chrome with --remote-debugging-port, then
  node tools/photofaces/drive.mjs <debug port> 'http://127.0.0.1:<port>/index.html?shoot&look=probe-lite' <shots dir> \
    faces:before shots:face-ring:before ... faces:after shots:face-ring:after ... stats:face-ring:300
"""
import json
import sys

import numpy as np
from PIL import Image
from scipy.interpolate import PchipInterpolator
from scipy.ndimage import gaussian_filter, map_coordinates

sys.path.insert(0, sys.argv[1])
from landmarks import FACES, UPLOADS  # noqa: E402

OUT = sys.argv[2]
W, H = 1024, 512
# Must match PHOTO_ATLAS in src/photoface.js.
U_EYE, U_EAR = 0.0668, 0.258
R_EYE, R_MOUTH, R_CHIN = 0.44, 0.70, 0.88
BOTTOM_BELOW_CHIN = 0.4  # of chin - mouth: how far below the chin the atlas' last row reaches in the photo
RELIEF_GAIN = 6.0
ROUGH_SIZE = (512, 256)


def warp(face, photo):
    h, w, _ = photo.shape
    (exr, ey), (exl, _) = face['eyes']
    ear_r, ear_l = face['ears']
    mid = (exr + exl) / 2
    cols = np.array([0, 0.5 - U_EAR, 0.5 - U_EYE, 0.5, 0.5 + U_EYE, 0.5 + U_EAR, 1]) * W
    xs = np.array([0, ear_r, exr, mid, exl, ear_l, w - 1])
    bottom = face['chin'] + BOTTOM_BELOW_CHIN * (face['chin'] - face['mouth'])
    # The watermark sits in the bottom 8% of each scan, inside the black unused area: never sampled.
    # (A scan cropped above its black area has no watermark: it may be read to its last row.)
    bottom = min(bottom, h - 1) if face.get('cropped') else bottom
    assert bottom < (h if face.get('cropped') else h * 0.92), (face['file'], bottom, h)
    rows = np.array([0, R_EYE, R_MOUTH, R_CHIN, 1]) * H
    ys = np.array([0, ey, face['mouth'], face['chin'], bottom])
    fx = PchipInterpolator(cols, xs)
    fy = PchipInterpolator(rows, ys)
    gx = fx(np.arange(W) + 0.5)
    gy = fy(np.arange(H) + 0.5)
    yy, xx = np.meshgrid(gy, gx, indexing='ij')
    # The unused black area below the jaw: each column carries its last real pixel down (only the band the atlas reaches).
    filled = photo.copy()
    # (Its anti-aliased rim too: the mask grows a few pixels upward, so no dark edge is carried down as a streak.)
    black = photo.max(axis=2) < 40 / 255
    grown = black.copy()
    for shift in range(1, 7):
        grown[:-shift] |= black[shift:]
    black = grown
    black[: int(face['mouth'])] = False
    for x in range(w):
        col = black[:, x]
        if not col.any():
            continue
        last = None
        for y in range(int(face['mouth']), int(min(h, bottom + 4))):
            if col[y]:
                if last is not None:
                    filled[y, x] = last
            else:
                last = filled[y, x]
    smooth = gaussian_filter(filled, sigma=(4, w / 300, 0))
    filled = np.where(black[..., None], smooth, filled)
    out = np.stack([map_coordinates(filled[..., c], [yy, xx], order=1, mode='nearest') for c in range(3)], axis=2)
    # The back seam: both edges are the back of the head; ease each half of the difference into its own side.
    k = 28
    diff = gaussian_filter(out[:, 0] - out[:, -1], sigma=(6, 0))
    ramp = np.linspace(1, 0, k)[None, :, None]
    out[:, :k] -= diff[:, None, :] * 0.5 * ramp
    out[:, -k:] += diff[:, None, :] * 0.5 * ramp[:, ::-1]
    return np.clip(out, 0, 1)


def gauss(xx, yy, x, y, sx, sy, a):
    return a * np.exp(-(((xx - x) / sx) ** 2 + ((yy - y) / sy) ** 2) / 2)


def segment(xx, yy, p, q, width, a0, a1):
    p, q = np.array(p, float), np.array(q, float)
    d = q - p
    t = np.clip(((xx - p[0]) * d[0] + (yy - p[1]) * d[1]) / (d @ d), 0, 1)
    dist2 = (xx - p[0] - t * d[0]) ** 2 + (yy - p[1] - t * d[1]) ** 2
    return (a0 + (a1 - a0) * t) * np.exp(-dist2 / (2 * width ** 2))


def relief():
    """A generic face's height in the canonical layout (atlas pixels): brow, sockets, nose, lips, chin, cheekbones, ears."""
    yy, xx = np.mgrid[0:H, 0:W].astype(float)
    cx = W / 2
    e = U_EYE * W
    er, mr, cr = R_EYE * H, R_MOUTH * H, R_CHIN * H
    nr = er + 0.55 * (mr - er)
    z = np.zeros((H, W))
    for s in (-1, 1):
        ex = cx + s * e
        z += gauss(xx, yy, ex, er - 0.5 * e, 0.75 * e, 0.25 * e, 0.6)  # brow ridge
        z += gauss(xx, yy, ex, er, 0.55 * e, 0.32 * e, -0.6)  # socket
        z += gauss(xx, yy, ex, er + 0.02 * e, 0.3 * e, 0.17 * e, 0.4)  # eyeball under the lids
        z += gauss(xx, yy, cx + s * 0.34 * e, nr + 0.05 * e, 0.17 * e, 0.15 * e, 0.8)  # nose wings
        z += gauss(xx, yy, cx + s * 1.05 * e, er + 0.5 * e, 0.45 * e, 0.3 * e, 0.7)  # cheekbones
        z += segment(xx, yy, (cx + s * 0.42 * e, nr + 0.15 * e), (cx + s * 0.75 * e, mr + 0.2 * e), 0.07 * e, -0.5, -0.2)  # nasolabial folds
        ear = cx + s * U_EAR * W
        z += gauss(xx, yy, ear, er + 0.35 * e, 0.38 * e, 0.75 * e, 1.6)  # ear
        z += gauss(xx, yy, ear - s * 0.05 * e, er + 0.45 * e, 0.16 * e, 0.3 * e, -1.1)  # concha
    z += segment(xx, yy, (cx, er - 0.1 * e), (cx, nr - 0.05 * e), 0.24 * e, 0.4, 1.4)  # bridge
    z += gauss(xx, yy, cx, nr, 0.3 * e, 0.26 * e, 1.4)  # tip
    z += gauss(xx, yy, cx, nr + 0.3 * e, 0.38 * e, 0.09 * e, -0.5)  # under the nose
    z += gauss(xx, yy, cx, mr - 0.13 * e, 0.45 * e, 0.1 * e, 0.6)  # upper lip
    z += gauss(xx, yy, cx, mr + 0.15 * e, 0.4 * e, 0.12 * e, 0.7)  # lower lip
    z += gauss(xx, yy, cx, mr, 0.5 * e, 0.035 * e, -0.6)  # lip line
    z += gauss(xx, yy, cx, mr + 0.45 * e, 0.35 * e, 0.08 * e, -0.35)  # mentolabial fold
    z += gauss(xx, yy, cx, cr - 0.35 * e, 0.45 * e, 0.3 * e, 0.9)  # chin
    return z


def luminance(img):
    return img[..., 0] * 0.3 + img[..., 1] * 0.59 + img[..., 2] * 0.11


def skin_mask(img):
    """How much each texel is skin, by its colour against the cheeks' (hair, brows and the dark eyes fall out)."""
    cx, e = W // 2, int(U_EYE * W)
    r0 = int(R_EYE * H + 0.5 * e)
    patch = np.concatenate([img[r0 - 6: r0 + 6, cx - e - 12: cx - e + 12].reshape(-1, 3), img[r0 - 6: r0 + 6, cx + e - 12: cx + e + 12].reshape(-1, 3)])
    ref = np.median(patch, axis=0)
    lum = luminance(img) + 1e-4
    chroma = img / lum[..., None]
    ref_chroma = ref / (luminance(ref[None, None])[0, 0] + 1e-4)
    dc = np.linalg.norm(chroma - ref_chroma, axis=2)
    dl = np.abs(np.log(lum / luminance(ref[None, None])[0, 0]))
    d = gaussian_filter(dc * 2.2 + dl * 0.9, 2)
    return np.clip(1.4 - d * 2.2, 0, 1), ref


def normals_from(height):
    gy, gx = np.gradient(height)
    n = np.stack([-gx, gy, np.ones_like(height)], axis=2)
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    return n


def build(name, face, base):
    photo = np.asarray(Image.open(UPLOADS + face['file']).convert('RGB'), dtype=np.float32) / 255
    albedo = warp(face, photo)
    skin, skin_ref = skin_mask(albedo)
    lum = luminance(albedo)
    # Fine detail: pores, stubble, hair strands, from the photo's high-pass luminance (stronger in hair).
    fine = lum - gaussian_filter(lum, 1.6)
    mid = gaussian_filter(lum, 1.6) - gaussian_filter(lum, 6)
    hair = 1 - skin
    height = base * RELIEF_GAIN + fine * (1.5 + 6 * hair) + mid * 2.5
    nrm = normals_from(height)
    # Roughness: skin a little satin, an oily T-zone and lips, matte hair, wet eyes for a glint.
    yy, xx = np.mgrid[0:H, 0:W].astype(float)
    cx, e = W / 2, U_EYE * W
    er, mr, cr = R_EYE * H, R_MOUTH * H, R_CHIN * H
    rough = np.full((H, W), 0.62)
    tzone = np.maximum.reduce([
        gauss(xx, yy, cx, er - 1.3 * e, 1.1 * e, 0.6 * e, 1),
        gauss(xx, yy, cx, er + 0.5 * (mr - er), 0.35 * e, 0.9 * e, 1),
        gauss(xx, yy, cx, cr - 0.4 * e, 0.45 * e, 0.3 * e, 1),
    ])
    rough -= 0.2 * tzone
    rough = np.minimum(rough, 0.62 - 0.25 * gauss(xx, yy, cx, mr + 0.02 * e, 0.42 * e, 0.16 * e, 1))
    rough = rough * skin + 0.85 * hair
    for s in (-1, 1):
        rough = np.minimum(rough, 0.62 - 0.5 * gauss(xx, yy, cx + s * e, er, 0.24 * e, 0.09 * e, 1))
    Image.fromarray((albedo * 255 + 0.5).astype(np.uint8)).save(f'{OUT}/{name}-albedo.jpg', quality=90)
    Image.fromarray(((nrm * 0.5 + 0.5) * 255 + 0.5).astype(np.uint8)).save(f'{OUT}/{name}-normal.png')
    r8 = (np.clip(rough, 0, 1) * 255 + 0.5).astype(np.uint8)
    Image.fromarray(r8).resize(ROUGH_SIZE, Image.BILINEAR).convert('RGB').save(f'{OUT}/{name}-rough.png')
    # A quick lit preview: key light from the upper right front.
    light = np.array([0.5, 0.4, 0.77])
    light /= np.linalg.norm(light)
    shade = np.clip(nrm @ light, 0, 1) * 0.75 + 0.3
    Image.fromarray((np.clip(albedo * shade[..., None], 0, 1) * 255).astype(np.uint8)).save(f'{OUT}/{name}-preview.jpg', quality=85)
    return {'sex': face['sex'], 'hair': face['hair'], 'skin': '#%02x%02x%02x' % tuple(int(c * 255) for c in skin_ref)}


def main():
    base = relief()
    meta = {name: build(name, face, base) for name, face in FACES.items()}
    with open(f'{OUT}/faces.json', 'w') as f:
        json.dump(meta, f, indent=1)
    print(json.dumps(meta))


main()
