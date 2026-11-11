# The photo heads' base model (src/headmodel-data.js, read by src/photohead.js): a real head's shape in place of the drawn
# head's stretched sphere, built from blended ellipsoids (a signed distance field: the cranium, the face, the cheekbones,
# the jaw and its corners, the chin, the brow ridge, the nose, the lips; the eye sockets carved out) and sampled as its outer
# surface's distance along each direction from the head's centre. One for a man, one for a woman; every region's face is this
# head changed by the region's own measures (faceregions.js REGION_SHAPES, photohead.js).
#
# Units: the head's radius r (~10 cm); the game's head axes (x forward, y up, z to the left), the centre where the drawn
# head's was (the eyes at y = -0.064). An adult man (Farkas, Anthropometry of the Head and Face, 1994; ANSUR II): the head
# 19.6 cm long, 15.2 cm broad, 23.2 cm from the vertex to the chin with the eyes about midway; the face (nasion to chin)
# 12.2 cm; the cheekbones 14 cm across, the jaw's corners 10.8 cm; the nose 5.3 cm long, standing 2-2.5 cm proud. A woman's
# jaw, its corners, the brow ridge and the chin smaller, the forehead more upright (the game scales her head as a whole).
#
#   python3 tools/headmodel.py <out dir> [preview]   →  headmodel.json (and front / three-quarter / side previews)

import json
import os
import sys

import numpy as np

# (centre (x, y, z), radii (x, y, z), blend, mirrored, carved): the parts, in order; each blended into what is there.
MALE = {
    'cranium': ((-0.05, 0.22, 0), (0.98, 0.86, 0.76), 0.0, False, False),
    'face': ((0.34, -0.20, 0), (0.62, 0.74, 0.64), 0.22, False, False),
    'cheekbone': ((0.50, -0.20, 0.47), (0.28, 0.14, 0.16), 0.18, True, False),
    'jaw': ((0.26, -0.80, 0), (0.58, 0.38, 0.54), 0.22, False, False),
    'gonion': ((0.06, -0.84, 0.43), (0.18, 0.18, 0.09), 0.18, True, False),
    'chin': ((0.73, -1.03, 0), (0.20, 0.16, 0.27), 0.14, False, False),
    'browRidge': ((0.84, 0.07, 0.26), (0.09, 0.06, 0.24), 0.10, True, False),
    'nose': ((0.96, -0.31, 0), (0.12, 0.27, 0.075), 0.09, False, False),
    'noseTip': ((1.05, -0.52, 0), (0.095, 0.08, 0.105), 0.08, False, False),
    'nostril': ((0.97, -0.565, 0.10), (0.07, 0.055, 0.07), 0.06, True, False),
    'upperLip': ((0.86, -0.735, 0), (0.08, 0.055, 0.19), 0.08, False, False),
    'lowerLip': ((0.84, -0.84, 0), (0.08, 0.055, 0.17), 0.08, False, False),
    'socket': ((0.97, -0.07, 0.30), (0.17, 0.10, 0.14), 0.10, True, True),
}
FEMALE_CHANGES = {
    'browRidge': ((0.83, 0.06, 0.26), (0.07, 0.045, 0.22)),
    'jaw': ((0.28, -0.79, 0), (0.55, 0.36, 0.49)),
    'gonion': ((0.08, -0.82, 0.39), (0.15, 0.15, 0.07)),
    'chin': ((0.71, -1.02, 0), (0.18, 0.14, 0.22)),
    'face': ((0.38, -0.20, 0), (0.60, 0.74, 0.64)),
    'nose': ((0.96, -0.31, 0), (0.11, 0.25, 0.07)),
    'noseTip': ((1.03, -0.51, 0), (0.085, 0.075, 0.095)),
}


def parts_for(sex):
    out = []
    for name, (centre, radii, blend, mirror, carve) in MALE.items():
        if sex == 'female' and name in FEMALE_CHANGES:
            centre, radii = FEMALE_CHANGES[name]
        for side in ([1, -1] if mirror else [1]):
            out.append((np.array([centre[0], centre[1], centre[2] * side]), np.array(radii), blend, carve))
    return out


def ellipsoid(p, centre, radii):
    # The usual bound for an ellipsoid's distance (Quilez): exact enough near its surface.
    q = (p - centre) / radii
    k0 = np.linalg.norm(q, axis=-1)
    k1 = np.linalg.norm(q / radii, axis=-1)
    return k0 * (k0 - 1) / np.maximum(k1, 1e-9)


def smin(a, b, k):
    if k <= 0:
        return np.minimum(a, b)
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0, 1)
    return b + (a - b) * h - k * h * (1 - h)


def field(p, parts):
    d = None
    for centre, radii, blend, carve in parts:
        e = ellipsoid(p, centre, radii)
        if d is None:
            d = e
        elif carve:
            d = -smin(-d, e, blend)
        else:
            d = smin(d, e, blend)
    return d


POLARS, AZIMUTHS = 96, 144


def sample(parts):
    polar = np.linspace(0, np.pi, POLARS + 1)
    azimuth = -np.pi + 2 * np.pi * np.arange(AZIMUTHS) / AZIMUTHS
    P, A = np.meshgrid(polar, azimuth, indexing='ij')
    dirs = np.stack([np.sin(P) * np.cos(A), np.cos(P), np.sin(P) * np.sin(A)], axis=-1).reshape(-1, 3)
    # From outside inward: the first place the field turns negative is the outer surface; then bisected.
    t = np.full(len(dirs), 2.5)
    hit = np.zeros(len(dirs), bool)
    for _ in range(600):
        inside = field(dirs * t[:, None], parts) < 0
        hit |= inside
        t = np.where(hit, t, t - 0.005)
    lo, hi = t, t + 0.005
    for _ in range(20):
        mid = (lo + hi) / 2
        inside = field(dirs * mid[:, None], parts) < 0
        lo, hi = np.where(inside, mid, lo), np.where(inside, hi, mid)
    return np.round((lo + hi) / 2, 4).reshape(POLARS + 1, AZIMUTHS)


def landmarks(parts):
    def front_at(y):
        xs = np.linspace(1.6, 0, 1601)
        d = field(np.stack([xs, np.full_like(xs, y), np.zeros_like(xs)], -1), parts)
        index = np.argmax(d < 0)
        return round(float(xs[index]), 3)
    ys = np.linspace(1.4, -1.6, 3001)
    column = field(np.stack([np.zeros_like(ys), ys, np.zeros_like(ys)], -1), parts)
    vertex = float(ys[np.argmax(column < 0)])
    ys2 = np.linspace(-0.8, -1.6, 801)
    below = field(np.stack([np.full_like(ys2, 0.5), ys2, np.zeros_like(ys2)], -1), parts)
    chin = float(ys2[np.argmax(below > 0)])
    widths = {}
    for y in [0.3, -0.2, -0.85]:
        zs = np.linspace(1.2, 0, 1201)
        best = 0
        for x in np.linspace(-0.6, 0.6, 25):
            d = field(np.stack([np.full_like(zs, x), np.full_like(zs, y), zs], -1), parts)
            if (d < 0).any():
                best = max(best, float(zs[np.argmax(d < 0)]))
        widths[f'{y:.2f}'] = round(best, 3)
    xs = np.linspace(-1.6, 0, 1601)
    back = float(xs[np.argmax(field(np.stack([xs, np.full_like(xs, 0.2), np.zeros_like(xs)], -1), parts) < 0)])
    return {'vertex': round(vertex, 3), 'chin': round(float(chin), 3), 'back': round(back, 3), 'halfWidths': widths,
            'profile': {f'{y:.2f}': front_at(y) for y in [0.6, 0.3, 0.07, -0.07, -0.3, -0.53, -0.74, -0.85, -0.95, -1.05]}}


def render(parts, view, size=240):
    # Orthographic, sphere-traced, Lambert under one key light and a fill: a quick clay preview.
    span = 1.5
    u = np.linspace(-span, span, size)
    U, V = np.meshgrid(u, -u)
    if view == 'front':
        origin = np.stack([np.full_like(U, 3), V - 0.1, -U], -1); ray = np.array([-1, 0, 0])
    elif view == 'side':
        origin = np.stack([-U, V - 0.1, np.full_like(U, 3)], -1); ray = np.array([0, 0, -1])
    else:
        c, s = np.cos(0.7), np.sin(0.7)
        ray = -np.array([c, 0, s])
        right = np.array([s, 0, -c])
        origin = 3 * -ray + U[..., None] * right + (V[..., None] - 0.1) * np.array([0, 1, 0])
    p = origin.reshape(-1, 3).astype(float)
    # Marched in even steps to the first point inside (the ellipsoid bound is not a true distance), then bisected.
    t = np.zeros(len(p))
    hit = np.zeros(len(p), bool)
    for _ in range(400):
        inside = field(p + ray * t[:, None], parts) < 0
        hit |= inside
        t = np.where(hit, t, t + 0.015)
    lo, hi = t - 0.015, t
    for _ in range(12):
        mid = (lo + hi) / 2
        inside = field(p + ray * mid[:, None], parts) < 0
        lo, hi = np.where(inside, lo, mid), np.where(inside, mid, hi)
    t = hi
    q = p + ray * t[:, None]
    eps = 1e-3
    n = np.stack([field(q + np.eye(3)[i] * eps, parts) - field(q - np.eye(3)[i] * eps, parts) for i in range(3)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True) + 1e-9
    key = np.array([0.6, 0.6, 0.5]); key /= np.linalg.norm(key)
    shade = 0.25 + 0.65 * np.clip(n @ key, 0, 1) + 0.15 * np.clip(n @ np.array([0.3, -0.2, -0.9]), 0, 1)
    img = np.where(hit, shade, 0.16).reshape(size, size)
    rgb = np.stack([img * 0.95, img * 0.78, img * 0.66], -1)
    return (np.clip(rgb, 0, 1) * 255).astype(np.uint8)


if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else '.'
    result = {'polars': POLARS, 'azimuths': AZIMUTHS}
    for sex in ['male', 'female']:
        parts = parts_for(sex)
        result[sex] = {'landmarks': landmarks(parts), 'radii': sample(parts).ravel().tolist()}
        print(sex, json.dumps(result[sex]['landmarks']))
        if 'preview' in sys.argv:
            from PIL import Image
            Image.fromarray(np.concatenate([render(parts, v) for v in ['front', 'three', 'side']], axis=1)).save(os.path.join(out, f'{sex}.png'))
    with open(os.path.join(out, 'headmodel.json'), 'w') as handle:
        json.dump(result, handle)


def pack(json_path, js_path):
    # The table as the game reads it (src/headmodel-data.js): each radius × 10000 as an unsigned 16-bit integer, base64.
    import base64
    data = json.load(open(json_path))
    lines = ['// Generated by tools/headmodel.py from its blended-ellipsoid head (do not edit by hand): the photo heads\' base model, each',
             '// sex\'s outer surface as its distance (head radii) from the head\'s centre along each direction, row by row from the crown',
             '// (polar 0..π in `polars` steps) and round from the back (azimuth -π..π in `azimuths` steps; 0 the face, + to the left).',
             'export const HEAD_MODEL_DATA = {',
             f"  polars: {data['polars']},", f"  azimuths: {data['azimuths']},"]
    for sex in ['male', 'female']:
        radii = np.round(np.array(data[sex]['radii']) * 10000).astype('<u2')
        marks = data[sex]['landmarks']
        lines.append(f"  {sex}: {{ chin: {marks['chin']}, vertex: {marks['vertex']}, radii: '{base64.b64encode(radii.tobytes()).decode()}' }},")
    lines.append('};')
    open(js_path, 'w').write('\n'.join(lines) + '\n')


if __name__ == '__main__' and 'pack' in sys.argv:
    pack(os.path.join(sys.argv[1], 'headmodel.json'), 'src/headmodel-data.js')


def pack_bases(male_json, female_json, js_path):
    # The user's base meshes' heads (tools/blender/headfrombase.py): spikes (into parted lips, an eyelid's gap) taken out by a
    # median of their neighbours; each head's own eye line (its sockets' deepest, beside the nose) and lip line (the seam: the
    # front's least between the nose and the chin) measured for the texture to be laid on.
    import base64
    from scipy.ndimage import median_filter
    out = {}
    for sex, path in [('male', male_json), ('female', female_json)]:
        data = json.load(open(path))
        P, A = data['polars'], data['azimuths']
        R = np.array(data[sex]['radii']).reshape(P + 1, A)
        med = median_filter(R, size=(3, 3), mode='wrap')
        R = np.where(np.abs(R - med) > 0.04, med, R)
        polar = np.linspace(0, np.pi, P + 1)
        def column(azimuth):
            return int(round((azimuth + np.pi) / (2 * np.pi) * A)) % A
        ys_front = np.cos(polar) * R[:, column(0)]
        xs_front = np.sin(polar) * R[:, column(0)]
        nose = int(np.argmax(xs_front))
        chin_y = data[sex]['landmarks']['chin']
        # The lip seam: of the hollows in the front's profile below the nose, the one nearest where the stomion is in a face
        # (about 0.795 of the way from the vertex to the chin: Farkas 1994).
        vertex_y = data[sex]['landmarks']['vertex']
        expected = vertex_y - 0.795 * (vertex_y - chin_y)
        hollows = [row for row in range(nose + 1, P - 1) if xs_front[row] < xs_front[row - 1] and xs_front[row] <= xs_front[row + 1] and ys_front[row] > chin_y]
        mouth = float(ys_front[min(hollows, key=lambda row: abs(ys_front[row] - expected))]) if hollows else expected
        # The eye line: the pupils about half way from the vertex to the chin (0.505 of it: Farkas 1994), the sockets' own
        # hollow too shallow on these meshes to find reliably.
        eye = vertex_y - 0.505 * (vertex_y - chin_y)
        out[sex] = {'radii': R.ravel(), 'chin': chin_y, 'vertex': data[sex]['landmarks']['vertex'], 'eye': round(eye, 3), 'mouth': round(mouth, 3)}
        print(sex, 'eye', out[sex]['eye'], 'mouth', out[sex]['mouth'], 'noseTip x', round(float(xs_front[nose]), 3))
    lines = ['// Generated by tools/headmodel.py (pack_bases) from the user\'s base meshes\' heads (Base_Male_Mesh.blend, female.blend;',
             '// tools/blender/headfrombase.py; do not edit by hand): each sex\'s outer surface as its distance (head radii) from the',
             '// head\'s centre along each direction, row by row from the crown (polar 0..π in `polars` steps) and round from the back',
             '// (azimuth -π..π in `azimuths` steps; 0 the face, + to the left); its eye line and lip line (y) for the face\'s texture.',
             'export const HEAD_MODEL_DATA = {', f'  polars: {P},', f'  azimuths: {A},']
    for sex in ['male', 'female']:
        o = out[sex]
        packed = base64.b64encode(np.round(o['radii'] * 10000).astype('<u2').tobytes()).decode()
        lines.append(f"  {sex}: {{ chin: {o['chin']}, vertex: {o['vertex']}, eye: {o['eye']}, mouth: {o['mouth']}, radii: '{packed}' }},")
    lines.append('};')
    open(js_path, 'w').write('\n'.join(lines) + '\n')
