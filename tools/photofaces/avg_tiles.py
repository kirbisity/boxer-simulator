"""Slice the two average-face grids into labelled tiles and find each tile's marks: eye centres, brows, nostrils and
the nose's wings, lip line and the mouth's corners.
Usage: python3 -I avg_tiles.py <facetools dir> <out dir>   (writes <out>/tiles/<sex>-<region>.png and <out>/tiles.json)"""
import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage as nd

UPLOADS = '/Users/yanlinzhu/.claude/uploads/d811ffc0-bc97-4591-84a1-272e064dd93b/'
MEN = ('08d8846e-image.jpg', [
    'austria', 'afghanistan', 'argentina', 'burma', 'germany', 'greece', 'india', 'iran',
    'cambodia', 'england', 'ethiopia', 'france', 'iraq', 'ireland', 'israel', 'mexico',
    'mongolia', 'peru', 'poland', 'puertoRico', 'uzbekistan', 'africanAmerican', 'whiteAmerican', 'china',
    'romania', 'russia', 'samoa', 'saudiArabia', 'czechRepublic', 'philippines', 'hungary', 'italy',
    'serbia', 'southAfrica', 'southIndia', 'spain', 'japan', 'korea', 'thailand', 'brazil',
    'switzerland', 'taiwan', 'tibet', 'ukraine', 'vietnam', 'westAfrica'])
WOMEN = ('b4557e98-image.jpg', [
    'germany', 'france', 'england', 'netherlands',
    'mexico', 'peru', 'argentina', 'brazil',
    'philippines', 'cambodia', 'vietnam', 'thailand',
    'greece', 'italy', 'spain', 'israel',
    'china', 'korea', 'japan', 'mongolia',
    'ukraine', 'sweden', 'poland', 'russia',
    'serbia', 'czechRepublic', 'hungary', 'romania',
    'southIndia', 'india', 'burma', 'samoa',
    'turkey', 'lebanon', 'afghanistan', 'iran',
    'chadCameroon', 'ethiopia', 'southAfrica', 'westAfrica'])


def men_boxes(a):
    m = nd.binary_opening(a.min(axis=2) < 232 / 255, np.ones((7, 7)))
    lab, _ = nd.label(m)
    boxes = [(s[0].start, s[1].start, s[0].stop, s[1].stop) for s in nd.find_objects(lab) if (s[0].stop - s[0].start) * (s[1].stop - s[1].start) > 15000]
    rows = sorted(boxes, key=lambda b: (round(b[0] / 100), b[1]))
    return rows


def women_boxes(a):
    """Ten bands split by white rows; each band into four by its brightest gutter columns near the quarters."""
    white = (a.min(axis=2) > 235 / 255).mean(axis=1)
    cuts = [0] + [y for y in range(1, len(white) - 1) if white[y] > 0.6 and white[y - 1] <= 0.6] + [len(white)]
    bands = [(cuts[i], cuts[i + 1]) for i in range(len(cuts) - 1) if cuts[i + 1] - cuts[i] > 150]
    boxes = []
    width = a.shape[1]
    for top, bottom in bands:
        bright = a[top:bottom].min(axis=2).mean(axis=0)
        splits = [0]
        for k in (1, 2, 3):
            centre = k * width // 4
            window = range(centre - 40, centre + 40)
            splits.append(max(window, key=lambda x: bright[x]))
        splits.append(width)
        for i in range(4):
            boxes.append((top + 2, splits[i] + 2, bottom - 1, splits[i + 1] - 1))
    return boxes


# Where each mark is looked for, in eye spacings from the eye line (the composites are frontal and level, so the spacing
# is one scale for the whole face), and how clear a dark line has to be. Set against the 86 tiles, whose marks come out
# at: brow 0.16 to 0.33 spacings over the eyes, nostrils 0.58 to 0.84 under them, lip line 0.90 to 1.20, a nose's wing
# 0.17 to 0.35 out from the midline, a mouth's corner 0.40 to 0.50.
EYE_NOT_BROW = 0.4  # a row this near the eye patch's darkest (of the way to its median) may be the eye: a heavy brow is as dark, and the eye is the lower
BROW_OVER = (0.14, 0.55)  # from over the upper lid to under the hair line
NOSTRILS_UNDER = (0.5, 0.97)
NOSTRIL_COLUMNS = (0.08, 0.28)  # the nostrils' columns, out from the midline
BESIDE_NOSE = (0.36, 0.5)  # the cheek beside them: a moustache is dark there too, a nostril is not
LIPS_UNDER_NOSE = (0.15, 0.65)
LIP_COLUMNS = 0.2
SLIT_BY_LIPS = (0.14, 0.03)  # the lip line is this far over to this far under the lips' middle: a lower lip alone is red where a moustache hides the upper
CLEAR_DIP = 0.25  # of the profile's range: a dark line and not a ripple
WING_RISE = 0.5  # of the way from the nostril's dark to the cheek's level: the wing's edge
CORNER_RISE = 0.35  # of the way from the slit's dark to the skin's: a slit fades out to its end, and by half way the mark is 1.5 to 2 px past the end seen (five clear mouths)
CORNER_READ = (0.34, 0.5)  # outside it the slit's end was not read (a moustache over it, a skin as dark as the slit): the sex's median stands in

# Lip lines the rule misses, read by eye off the tile (rows of the tile): an open mouth, whose lower lip is the reddest
# thing and whose slit is the gap over the teeth, and three dark skins whose lower lip alone is pink.
READ_BY_EYE = {
    'male-cambodia': {'mouth': 128},
    'male-southAfrica': {'mouth': 135},
    'female-chadCameroon': {'mouth': 160},
    'female-ethiopia': {'mouth': 183},
}


def luminance(tile):
    return tile[..., 0] * 0.3 + tile[..., 1] * 0.59 + tile[..., 2] * 0.11


def eye_centres(tile, prior=None):
    """Eye centres: the dark blob each side, in the eye band. `prior`: the grid's typical eye height and half-spread
    (fractions of the tile), to search close to them; with it the eye is told from the brow over it."""
    h, w, _ = tile.shape
    dark = nd.gaussian_filter(luminance(tile), 2.2)
    eyes = []
    ey0, spread = prior or (0.47, 0.13)
    band = 0.075 if prior else 0.11
    for side in (-1, 1):
        cx0 = 0.5 + side * spread
        ys = slice(int((ey0 - band) * h), int((ey0 + band) * h))
        xs = slice(int((cx0 - 0.07) * w), int((cx0 + 0.07) * w))
        patch = dark[ys, xs]
        y, x = np.unravel_index(np.argmin(patch), patch.shape)
        if prior:
            rows = patch.min(axis=1)
            limit = rows.min() + EYE_NOT_BROW * (np.median(patch) - rows.min())
            y = max([i for i in range(1, len(rows) - 1) if rows[i] <= rows[i - 1] and rows[i] <= rows[i + 1] and rows[i] <= limit] or [y])
            x = np.argmin(patch[y])
        eyes.append([int(x + xs.start), int(y + ys.start)])
    return eyes


def first_clear_dip(profile, reach):
    """The first index of `profile` that is a dark line: lower than everything before it and than the next `reach`
    samples' highest by CLEAR_DIP of the profile's range. Failing one, the first dip of any depth, then the darkest."""
    scale = profile.max() - profile.min()
    dips = [i for i in range(1, len(profile) - 1) if profile[i] <= profile[i - 1] and profile[i] <= profile[i + 1]]
    clear = [i for i in dips if min(profile[:i].max(), profile[i: i + reach + 1].max()) - profile[i] >= CLEAR_DIP * scale]
    return (clear or dips or [int(np.argmin(profile))])[0]


def rise(profile, start, low, high, share):
    """Where `profile` (outward from the midline, a pixel a step) first rises `share` of the way from `low` to `high` after `start`."""
    mid = low + share * (high - low)
    if profile[start] >= mid:
        return float(start)
    for x in range(start, len(profile) - 1):
        if profile[x + 1] >= mid:
            return x + (mid - profile[x]) / max(profile[x + 1] - profile[x], 1e-6)
    return float(len(profile) - 1)


def landmarks(tile, eyes, read=None):
    """The marks the atlas is fitted through, from the eye centres down: the brows' row, the nostrils' row and the nose's
    half breadth at it (to the wing's edge), the lip line and the mouth's half breadth (to its corner). Rows and breadths
    in pixels of the tile; `read`: rows read by eye, in place of the rule's."""
    soft = nd.gaussian_filter(luminance(tile), 1.0)
    (x1, y1), (x2, y2) = eyes
    cx, ey, ipd = (x1 + x2) / 2, (y1 + y2) / 2, x2 - x1
    c = int(round(cx))
    def rows_of(image, a, b):
        """`image`'s mean over the columns `a` to `b` spacings out from the midline, both sides, a row at a time."""
        lo, hi = int(round(a * ipd)), int(round(b * ipd))
        if lo == 0:
            return image[:, c - hi: c + hi + 1].mean(axis=1)
        return (image[:, c + lo: c + hi + 1].mean(axis=1) + image[:, c - hi: c - lo + 1].mean(axis=1)) / 2
    def outward(band):
        """A row of the tile folded about the midline: the two sides' mean, a pixel a step out."""
        reach = int(ipd)
        right, left = band[c: c + reach], band[c - reach + 1: c + 1][::-1]
        n = min(len(right), len(left))
        return (right[:n] + left[:n]) / 2
    # The brows: the first dark line up from each lid (the hair line is the next).
    brows = []
    for (x, y) in eyes:
        band = soft[:, int(x - 0.18 * ipd): int(x + 0.18 * ipd) + 1].mean(axis=1)
        low, high = int(y - BROW_OVER[1] * ipd), int(y - BROW_OVER[0] * ipd)
        brows.append(high - first_clear_dip(band[low: high + 1][::-1], int(0.15 * ipd)))
    # The nostrils: the first line down the nose's two sides that is darker than the cheek beside it.
    top, bottom = int(ey + NOSTRILS_UNDER[0] * ipd), int(ey + NOSTRILS_UNDER[1] * ipd)
    nose = top + first_clear_dip((rows_of(soft, *NOSTRIL_COLUMNS) - rows_of(soft, *BESIDE_NOSE))[top:bottom], int(0.15 * ipd))
    # The lips: pinker (red and blue over green) than the skin over and under them, whatever the skin; the lip line the
    # darkest row by their middle.
    pink = nd.gaussian_filter((tile[..., 0] + tile[..., 2] - 2 * tile[..., 1]) / (tile.sum(axis=2) + 1e-3), 1.0)
    centre = rows_of(pink, 0, LIP_COLUMNS)
    top, bottom = int(nose + LIPS_UNDER_NOSE[0] * ipd), int(nose + LIPS_UNDER_NOSE[1] * ipd)
    lips = np.clip(centre[top:bottom] - np.median(centre[nose: int(nose + 0.8 * ipd)]), 0, None)
    lips = np.clip(lips - 0.4 * lips.max(), 0, None)
    middle = top + float((lips * np.arange(len(lips))).sum() / max(lips.sum(), 1e-6))
    a, b = int(round(middle - SLIT_BY_LIPS[0] * ipd)), int(round(middle + SLIT_BY_LIPS[1] * ipd))
    mouth = (read or {}).get('mouth', a + int(np.argmin(rows_of(soft, 0, LIP_COLUMNS)[a: b + 1])))
    # The wing: out from the nostril's darkest, up to the cheek's level.
    profile = outward(soft[nose - 2: nose + 2].mean(axis=0))
    nostril = int(0.08 * ipd) + int(np.argmin(profile[int(0.08 * ipd): int(0.45 * ipd)]))
    wing = rise(profile, nostril, profile[nostril], np.median(profile[int(0.6 * ipd): int(0.8 * ipd)]), WING_RISE)
    # The corner: out along the slit (the darkest of the rows by it: a mouth curves), up to the skin past it.
    profile = outward(soft[int(mouth - 0.06 * ipd): int(mouth + 0.06 * ipd) + 1].min(axis=0))
    start = int(LIP_COLUMNS * ipd)
    corner = rise(profile, start, np.median(profile[:start]), np.percentile(profile[int(0.3 * ipd): int(0.8 * ipd)], 90), CORNER_RISE)
    return {'eyes': eyes, 'brow': float(np.mean(brows)), 'nose': float(nose), 'wing': float(wing), 'mouth': float(mouth), 'corner': float(corner)}


def refine(meta, tiles):
    """Second pass: each grid's median eye height and spread as the prior, then the marks under the eyes; a mouth
    corner that was not read takes the grid's median (of the eye spacing)."""
    for sex in ('male', 'female'):
        keys = [k for k in meta if meta[k]['sex'] == sex]
        ys = [((meta[k]['eyes'][0][1] + meta[k]['eyes'][1][1]) / 2) / tiles[k].shape[0] for k in keys]
        sp = [((meta[k]['eyes'][1][0] - meta[k]['eyes'][0][0]) / 2) / tiles[k].shape[1] for k in keys]
        prior = (float(np.median(ys)), float(np.median(sp)))
        for k in keys:
            meta[k].update(landmarks(tiles[k], eye_centres(tiles[k], prior), READ_BY_EYE.get(k)))
        spacing = {k: meta[k]['eyes'][1][0] - meta[k]['eyes'][0][0] for k in keys}
        read = {k: meta[k]['corner'] / spacing[k] for k in keys if CORNER_READ[0] <= meta[k]['corner'] / spacing[k] <= CORNER_READ[1]}
        for k in keys:
            if k not in read:
                meta[k]['corner'] = float(np.median(list(read.values())) * spacing[k])


def measure(tile, mark):
    """Proportions read off the composite (of the eye spacing): face width at the cheeks, nose width (wing to wing),
    lip height (the rows redder than the skin)."""
    (x1, y1), (x2, y2) = mark['eyes']
    cx, ey, ipd = (x1 + x2) / 2, (y1 + y2) / 2, x2 - x1
    my = mark['mouth']
    span = my - ey
    h, w, _ = tile.shape
    cheek_row = int(ey + 0.5 * span)
    skin = np.median(tile[cheek_row - 2: cheek_row + 3, int(cx - 0.6 * ipd): int(cx - 0.4 * ipd)].reshape(-1, 3), axis=0)
    distance = np.linalg.norm(nd.gaussian_filter(tile, (1.5, 1.5, 0)) - skin, axis=2)
    def extent(row, step):
        x = cx
        while 0 < x + step < w - 1 and distance[row, int(x + step)] < 0.09:
            x += step
        return x
    face_width = (extent(cheek_row, 1) - extent(cheek_row, -1)) / ipd
    redness = tile[..., 0] - tile[..., 1]
    band = redness[int(my - 0.35 * span): int(my + 0.35 * span), int(cx - 0.15 * ipd): int(cx + 0.15 * ipd)].mean(axis=1)
    lips = float((band > (skin[0] - skin[1]) + 0.04).sum()) / ipd
    return {'faceWidth': float(face_width), 'noseWidth': float(2 * mark['wing'] / ipd), 'lips': lips}


def main():
    out = sys.argv[2]
    os.makedirs(f'{out}/tiles', exist_ok=True)
    meta = {}
    tiles = {}
    for sex, (file, names), finder in (('male', MEN, men_boxes), ('female', WOMEN, women_boxes)):
        a = np.asarray(Image.open(UPLOADS + file).convert('RGB')).astype(np.float32) / 255
        boxes = finder(a)
        assert len(boxes) == len(names), (sex, len(boxes))
        for name, (t, l, b, r) in zip(names, boxes):
            if sex == 'female':
                b = t + int((b - t) * 0.89)  # the label is written over the bottom of each women's tile
            if sex == 'female' and name in ('mongolia', 'russia'):
                l, r = l + int((r - l) * 0.18), r - int((r - l) * 0.18)  # the "VIA 9GAG" strip runs down these tiles' right edge: cut it and as much on the left
            tile = a[t:b, l:r]
            key = f'{sex}-{name}'
            Image.fromarray((tile * 255).astype(np.uint8)).save(f'{out}/tiles/{key}.png')
            meta[key] = {'sex': sex, 'region': name, 'box': [t, l, b, r], 'eyes': eye_centres(tile)}
            tiles[key] = tile
    refine(meta, tiles)
    for key in meta:
        meta[key]['measured'] = measure(tiles[key], meta[key])
    with open(f'{out}/tiles.json', 'w') as f:
        json.dump(meta, f, indent=0, default=int)
    print(len(meta), 'tiles')


main()
