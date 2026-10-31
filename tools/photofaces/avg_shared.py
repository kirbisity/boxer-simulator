"""The maps every photo face shares (synthetic: nothing read from a photo), in the atlas layout of src/photoface.js:
  detail.png    R where a beard grows (stubble), G where light skin reddens (nose, cheeks), B age lines' darkening, A the face's
                front (where freckles, moles and pores show)
  wrinkles.png  a normal map of the lines that come with age and fat: forehead lines, crow's feet, nasolabial folds, the lines
                under the eyes, the creases of the lips
  pores.png     a 128 x 128 tile repeated over the face: RG a normal of pores and skin grain, B small variations of colour
Usage: python3 -I avg_shared.py <out dir>"""
import sys

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter

W, H = 512, 256
U_EYE = 0.0668
R_EYE, R_MOUTH, R_CHIN = 0.44, 0.70, 0.88
YY, XX = np.mgrid[0:H, 0:W].astype(float)
CX, E = W / 2, U_EYE * W
ER, MR, CR = R_EYE * H, R_MOUTH * H, R_CHIN * H
NR = ER + 0.55 * (MR - ER)


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def gauss(x, y, sx, sy):
    return np.exp(-0.5 * (((XX - x) / sx) ** 2 + ((YY - y) / sy) ** 2))


def curve_line(points, width):
    """A soft line along a polyline (atlas pixels): 1 on it, falling off over `width`."""
    best = np.full((H, W), np.inf)
    for (x0, y0), (x1, y1) in zip(points[:-1], points[1:]):
        d = np.array([x1 - x0, y1 - y0])
        t = np.clip(((XX - x0) * d[0] + (YY - y0) * d[1]) / (d @ d), 0, 1)
        best = np.minimum(best, np.hypot(XX - x0 - t * d[0], YY - y0 - t * d[1]))
    return np.exp(-0.5 * (best / width) ** 2)


def main():
    out = sys.argv[1]
    du = np.abs(XX - CX)
    lips = gauss(CX, MR, 0.045 * W, 0.022 * H)
    # Beard: the upper lip, the chin and the jaw, the lower cheeks; not the lips.
    beard = np.maximum.reduce([
        gauss(CX, MR - 0.025 * H, 0.05 * W, 0.012 * H),
        smoothstep(MR + 0.01 * H, MR + 0.04 * H, YY) * smoothstep(CR + 0.07 * H, CR + 0.02 * H, YY) * smoothstep(0.16 * W, 0.11 * W, du),
        smoothstep(NR + 0.02 * H, MR, YY) * smoothstep(CR + 0.05 * H, CR, YY) * smoothstep(0.05 * W, 0.08 * W, du) * smoothstep(0.17 * W, 0.12 * W, du),
    ]) * (1 - lips)
    beard = gaussian_filter(beard, 2)
    red = np.maximum(gauss(CX, NR - 0.005 * H, 0.02 * W, 0.02 * H), np.maximum(gauss(CX - 0.085 * W, ER + 0.08 * H, 0.035 * W, 0.03 * H), gauss(CX + 0.085 * W, ER + 0.08 * H, 0.035 * W, 0.03 * H)))
    front = smoothstep(0.18 * W, 0.13 * W, du) * smoothstep(0.24 * H, 0.32 * H, YY) * smoothstep(0.93 * H, 0.86 * H, YY)
    eyes = np.maximum(gauss(CX - E, ER, 0.025 * W, 0.012 * H), gauss(CX + E, ER, 0.025 * W, 0.012 * H))
    front = front * (1 - eyes) * (1 - 0.7 * lips)
    # Lines: forehead (three, gently arched), crow's feet (four from each outer corner), under the eyes, the nasolabial folds, lip creases.
    lines = np.zeros((H, W))
    for k, row in enumerate([ER - 0.1 * H, ER - 0.125 * H, ER - 0.15 * H]):
        xs = np.linspace(CX - 0.085 * W, CX + 0.085 * W, 30)
        lines = np.maximum(lines, 0.8 * curve_line([(x, row + 3 * ((x - CX) / (0.085 * W)) ** 2) for x in xs], 0.9))
    for side in (-1, 1):
        corner = (CX + side * (E + 0.03 * W), ER)
        for angle in (-0.5, -0.15, 0.2, 0.5):
            end = (corner[0] + side * 0.03 * W * np.cos(angle), corner[1] + 0.03 * W * np.sin(angle) * 0.6)
            lines = np.maximum(lines, 0.7 * curve_line([corner, end], 0.7))
        under = [(CX + side * (E + 0.02 * W * np.cos(a)), ER + 0.022 * H + 0.012 * H * np.sin(a)) for a in np.linspace(0.2, np.pi - 0.2, 12)]
        lines = np.maximum(lines, 0.6 * curve_line(under, 0.8))
        fold = [(CX + side * (0.03 * W + 0.022 * W * t ** 0.8), NR + 0.01 * H + (MR + 0.03 * H - NR) * t) for t in np.linspace(0, 1, 12)]
        lines = np.maximum(lines, 1.0 * curve_line(fold, 1.4))
    for x in np.linspace(CX - 0.03 * W, CX + 0.03 * W, 7):
        lines = np.maximum(lines, 0.35 * curve_line([(x, MR - 0.02 * H), (x + 0.6, MR - 0.006 * H)], 0.5))
    detail = np.stack([beard, red, lines, front], axis=2)
    Image.fromarray((np.clip(detail, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA').save(f'{out}/detail.png')
    gy, gx = np.gradient(-lines * 3.0)
    n = np.stack([-gx, gy, np.ones_like(gx)], axis=2)
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    Image.fromarray(((n * 0.5 + 0.5) * 255 + 0.5).astype(np.uint8)).save(f'{out}/wrinkles.png')
    # Pores: fine pits in a grain, tiled (wrapped filters so the tile repeats).
    rng = np.random.default_rng(7)
    size = 128
    pits = (rng.random((size, size)) < 0.06).astype(float)
    height = -gaussian_filter(pits, 0.8, mode='wrap') * 2.2 + gaussian_filter(rng.standard_normal((size, size)), 1.2, mode='wrap') * 0.25
    gy, gx = np.gradient(height)
    n = np.stack([-gx, gy, np.ones_like(gx)], axis=2)
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    tone = gaussian_filter(rng.standard_normal((size, size)), 2.0, mode='wrap')
    tone = 0.5 + 0.5 * tone / np.abs(tone).max()
    tile = np.dstack([(n[..., 0] * 0.5 + 0.5), (n[..., 1] * 0.5 + 0.5), tone])
    Image.fromarray((tile * 255 + 0.5).astype(np.uint8)).save(f'{out}/pores.png')
    print('shared maps written')


main()
