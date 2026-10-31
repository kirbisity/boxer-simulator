"""Slice the two average-face grids into labelled tiles and find each tile's eye centres and lip line.
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


def landmarks(tile, prior=None):
    """Eye centres (darkest blob each side, in the eye band) and the lip line (darkest row between the lips).
    `prior`: the grid's typical eye height and half-spread (fractions of the tile), to search close to them."""
    h, w, _ = tile.shape
    lum = tile[..., 0] * 0.3 + tile[..., 1] * 0.59 + tile[..., 2] * 0.11
    dark = nd.gaussian_filter(lum, 2.2)
    eyes = []
    ey0, spread = prior or (0.47, 0.13)
    band = 0.06 if prior else 0.11
    for side in (-1, 1):
        cx0 = 0.5 + side * spread
        ys = slice(int((ey0 - band) * h), int((ey0 + band) * h))
        xs = slice(int((cx0 - 0.07) * w), int((cx0 + 0.07) * w))
        y, x = np.unravel_index(np.argmin(dark[ys, xs]), dark[ys, xs].shape)
        eyes.append([int(x + xs.start), int(y + ys.start)])
    ey = (eyes[0][1] + eyes[1][1]) / 2
    ipd = eyes[1][0] - eyes[0][0]
    cx = (eyes[0][0] + eyes[1][0]) / 2
    rows = dark[int(ey + 0.75 * ipd): int(ey + 1.45 * ipd), int(cx - 0.2 * ipd): int(cx + 0.2 * ipd)].mean(axis=1)
    mouth = ey + 0.75 * ipd + int(np.argmin(rows))
    return {'eyes': eyes, 'mouth': float(mouth)}


def refine(meta, tiles):
    """Second pass: each grid's median eye height and spread as the prior."""
    for sex in ('male', 'female'):
        keys = [k for k in meta if meta[k]['sex'] == sex]
        ys = [((meta[k]['eyes'][0][1] + meta[k]['eyes'][1][1]) / 2) / tiles[k].shape[0] for k in keys]
        sp = [((meta[k]['eyes'][1][0] - meta[k]['eyes'][0][0]) / 2) / tiles[k].shape[1] for k in keys]
        prior = (float(np.median(ys)), float(np.median(sp)))
        for k in keys:
            meta[k].update(landmarks(tiles[k], prior))


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
            meta[key] = {'sex': sex, 'region': name, 'box': [t, l, b, r], **landmarks(tile)}
            tiles[key] = tile
    refine(meta, tiles)
    with open(f'{out}/tiles.json', 'w') as f:
        json.dump(meta, f, indent=0, default=int)
    print(len(meta), 'tiles')


main()
