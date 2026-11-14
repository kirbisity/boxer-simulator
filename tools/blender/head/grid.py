# python3 grid.py <sex> : the cast head (cast.py) laid out on the photo atlas, as a lattice of points.
import sys, json, numpy as np
from scipy.interpolate import PchipInterpolator, RBFInterpolator
from scipy.ndimage import map_coordinates, grey_closing, binary_dilation, gaussian_filter
from scipy.sparse import lil_matrix, csr_matrix
from scipy.sparse.linalg import spsolve
from PIL import Image

# Where the photo atlas keeps each landmark: [share of the way round from the face's middle, row down from the crown].
# The eye, nose-foot, mouth and chin rows are the atlas's own (src/photoface.js PHOTO_ATLAS, tools/photofaces/avg_build.py);
# the rest are read off the mean of the atlases.
ATLAS_MIDLINE = dict(hairline=0.22, brow=0.385, eye=0.443, tip=0.578, noseFoot=0.605, lipTop=0.670, mouth=0.695,
                     lowerLip=0.72, lipFold=0.762, chinFront=0.82, chin=0.88)
ATLAS_SIDE = dict(innerCorner=(0.036, 0.445), outerCorner=(0.098, 0.440), upperLid=(0.066, 0.418), lowerLid=(0.064, 0.461),
                  browMiddle=(0.065, 0.383), noseWing=(0.037, 0.598), mouthCorner=(0.055, 0.695))
# Where each source head has them, read off its unwrapped picture (unwrap.py, zoom.py): midline places as degrees from the
# crown, the others as [degrees round from the face's middle, degrees from the crown].
MODEL = dict(
    male=dict(midline=dict(tip=106.9, noseFoot=115.6, lipTop=120.9, mouth=123.4, lowerLip=125.6, lipFold=128.7, chinFront=132.4),
              side=dict(innerCorner=(11.0, 96.0), outerCorner=(29.7, 95.2), upperLid=(18.5, 91.8), lowerLid=(16.0, 98.3),
                        noseWing=(10.0, 110.5), mouthCorner=(14.0, 126.3)), brow=79.9),
    female=dict(midline=dict(tip=108.4, noseFoot=116.6, lipTop=122.1, mouth=128.5, lowerLip=129.9, lipFold=134.8, chinFront=137.5),
                side=dict(innerCorner=(13.8, 94.2), outerCorner=(29.6, 92.3), upperLid=(20.0, 89.4), lowerLid=(17.0, 95.0),
                          noseWing=(9.5, 113.5), mouthCorner=(14.5, 129.6)), brow=79.1))
GRID = dict(
    image=(1024, 2048),           # rows, columns of the fine picture the lattice and the normal map are both read from
    relief=dict(soft=1.0, tilt=60),   # the normal map: smoothed over this many of its own points, and leaning no further (degrees)
    bottom=0.3,                   # the head ends on a flat plane this far (head radii) under the chin, inside the neck
    nostril=dict(span=0.075, depth=0.025),   # a pit narrower than `span` (7 mm) is no deeper than `depth` (2.5 mm)
    mouth=dict(span=0.12, depth=0.02),      # the lip line: no deeper than `depth` (2 mm) under the lips' fronts `span` (the lips' height) apart
    # the nodes are read from the rays' picture smoothed over this many of the lattice's finest spacings, [round, down]: a
    # wall that falls between two columns (the nose's wing against the cheek) otherwise steps from one column to the next
    # as its outline curves, a comb of ridges a column apart; the normal map keeps the wall's own sharpness
    sample=(1.0, 0.25),
    hairlineAbove=0.70,           # the hairline over the eyes' level, head radii (trichion to nasion 67 mm, Farkas)
    # [share round, spacing there]: 2 mm over the nose and the inner eyes (the nose's sides are steep walls a coarser
    # lattice cuts across), 3.7 mm over the rest of the face, opening to 15 mm at the back
    columns=[(0, 0.003), (0.042, 0.003), (0.06, 0.006), (0.12, 0.006), (0.27, 0.0125), (0.5, 0.024)],
    rows=[(0, 0.035), (0.34, 0.03), (0.37, 0.0085), (0.80, 0.0085), (0.84, 0.025), (1, 0.03)],
    snapColumns=[0.036, 0.098], snapRows=[0.418, 0.461, 0.605, 0.695, 0.88],
    table=(64, 96),               # polars, azimuths of the hair's ground (photohead.js headModelPoint)
    plain=(16, 8))                # the normal map is flat this far (rays: 4 degrees) round the ears' places and the cut, faded over 2 degrees

def lattice_normals(points):
    """Each lattice point's normal as the game makes it (photohead.js gridNormals): its triangles' normals summed by their
    area, the seam's two columns and each pole's row made one."""
    a, a1, b, b1 = points[:-1, :-1], points[:-1, 1:], points[1:, :-1], points[1:, 1:]
    n1 = np.cross(a1 - a, b - a); n2 = np.cross(a1 - b, b1 - b)
    out = np.zeros_like(points)
    out[:-1, :-1] += n1; out[:-1, 1:] += n1 + n2; out[1:, :-1] += n1 + n2; out[1:, 1:] += n2
    seam = out[:, 0] + out[:, -1]; out[:, 0] = seam; out[:, -1] = seam
    out[0] = out[0].sum(axis=0); out[-1] = out[-1].sum(axis=0)
    return out / np.maximum(np.linalg.norm(out, axis=-1, keepdims=True), 1e-12)

def lattice_frames(points):
    """Each lattice point's frame for the normal map as the game makes it (headlattice.js gridNormals, gridTangents): its
    normal, its tangent (the way round the head, squared to the normal) and the bitangent three.js derives (cross(normal,
    tangent) by the tangent's sign, -1: up the head). The seam's two columns are one place, and a pole's row takes the way
    round from the row next to it."""
    N = lattice_normals(points)
    inner = points[:, :-1]                                       # the ring without the seam's second column
    Pu = np.roll(inner, -1, axis=1) - np.roll(inner, 1, axis=1); Pu = np.concatenate([Pu, Pu[:, :1]], axis=1)
    Pu[0] = Pu[1]; Pu[-1] = Pu[-2]
    T = Pu - (Pu * N).sum(-1, keepdims=True) * N
    flat = np.linalg.norm(T, axis=-1) < 1e-9; T[flat] = np.stack([N[flat][:, 2], 0 * N[flat][:, 0], -N[flat][:, 0]], -1)
    T /= np.maximum(np.linalg.norm(T, axis=-1, keepdims=True), 1e-12)
    return N, T, -np.cross(N, T)

def bake(ground, fineNormal, plain):
    """The model's normal over the ground's: `ground` is the surface the lattice's points were read from (the model's,
    smoothed to the lattice's spacing), at the fine picture's places, and the map holds what that smoothing took away, in
    the ground's own frames (its normal, the way round the head squared to it, and up the head: the lattice's frames,
    headlattice.js gridTangents, wherever the lattice follows its ground). Not over the lattice's own normals: a base
    moves the lattice's points, and a map that undid the mean lattice's every facet would draw those facets on the base.
    The picture [rows, columns, 3] 0..255, half the fine picture's size."""
    Pu = np.roll(ground, -1, axis=1) - np.roll(ground, 1, axis=1); Pv = np.gradient(ground, axis=0)
    N = np.cross(Pu, Pv); N *= np.sign((N * ground).sum(-1, keepdims=True)); N /= np.maximum(np.linalg.norm(N, axis=-1, keepdims=True), 1e-12)
    T = Pu - (Pu * N).sum(-1, keepdims=True) * N; T /= np.maximum(np.linalg.norm(T, axis=-1, keepdims=True), 1e-12)
    frame = np.stack([T, -np.cross(N, T), N], -1)   # columns: tangent, bitangent, normal
    flat = np.abs(np.linalg.det(frame)) < 1e-6
    frame[flat] = np.eye(3)
    m = np.linalg.solve(frame, fineNormal[..., None])[..., 0]
    m[flat] = [0, 0, 1]
    # the map holds nothing finer than its own points: a crease's two walls a point apart (the lips' line) would read as noise
    m = np.stack([gaussian_filter(m[..., axis], GRID['relief']['soft'] * 2, mode=('nearest', 'wrap')) for axis in range(3)], -1)
    # and leans no further than `tilt` from the lattice's normal: beyond it the lattice, not the map, is what is wrong
    lean = np.linalg.norm(m[..., :2], axis=-1); most = np.tan(np.radians(GRID['relief']['tilt'])) * np.maximum(m[..., 2], 1e-3)
    m[..., :2] *= np.minimum(1, most / np.maximum(lean, 1e-9))[..., None]; m[..., 2] = np.maximum(m[..., 2], 1e-3)
    # no relief where the surface is not the model's own skin (the ears' places, the cut under the chin): the lattice's shape alone
    m = m / np.linalg.norm(m, axis=-1, keepdims=True) * (1 - plain[..., None]) + np.array([0, 0, 1.0]) * plain[..., None]
    m /= np.linalg.norm(m, axis=-1, keepdims=True)
    H, W = m.shape[:2]; m = m.reshape(H // 2, 2, W // 2, 2, 3).mean(axis=(1, 3)); m /= np.linalg.norm(m, axis=-1, keepdims=True)
    lean = np.degrees(np.arccos(np.clip(m[..., 2], -1, 1))); print('relief lean, degrees: mean', lean.mean().round(1), '99%', np.percentile(lean, 99).round(1), 'most', lean.max().round(1))
    return np.clip(np.round((m * 0.5 + 0.5) * 255), 0, 255).astype(np.uint8)

def spaced(knots, snaps):
    """Places from the first knot to the last, their spacing running from knot to knot, the nearest one moved on to each snap."""
    xs = [k[0] for k in knots]; hs = [k[1] for k in knots]
    fine = np.linspace(xs[0], xs[-1], 4001); density = 1 / np.interp(fine, xs, hs)
    count = np.concatenate([[0], np.cumsum((density[1:] + density[:-1]) / 2 * np.diff(fine))])
    total = int(round(count[-1])); places = np.interp(np.arange(total + 1) * count[-1] / total, count, fine)
    for snap in snaps: places[np.abs(places - snap).argmin()] = snap
    return places

def main(sex):
    d = np.load(f'cast-{sex}.npz', allow_pickle=True); outer = d['outer'].astype(float); inner = d['inner'].astype(float)
    NP, NA = outer.shape; model = MODEL[sex]
    polar = (np.arange(NP) + 0.5) / NP * np.pi; azimuth = (np.arange(NA) + 0.5) / NA * 2 * np.pi - np.pi
    P, A = np.meshgrid(polar, azimuth, indexing='ij')
    rays = np.stack([np.sin(P) * np.cos(A), np.cos(P), np.sin(P) * np.sin(A)], -1)
    # the mesh's own smooth normals where the rays met it, turned outwards (the game's frame mirrors the model's, so its
    # winding's normals come pointing in) and made the same on both sides
    smooth = d['normal'].astype(float)
    if (smooth * rays).sum(-1)[outer > 0].mean() < 0: smooth = -smooth
    smooth = smooth + smooth[:, ::-1] * [1, 1, -1]
    def both(image): return np.where((image > 0) & (image[:, ::-1] > 0), (image + image[:, ::-1]) / 2, 0)
    outer = both(outer); inner = both(inner)
    # the ears: where the outermost surface stands off the first one, at the sides; left to the game's own ears
    side = (np.abs(A) > 0.85) & (np.abs(A) < 2.4) & (P > np.radians(55)) & (P < np.radians(130))
    ear = side & (outer - inner > 0.015)
    rows = np.where(ear.any(axis=1))[0]; columns = np.where(ear[:, NA // 2:].any(axis=0))[0] + NA // 2
    cp, ca = (rows[0] + rows[-1]) / 2, (columns[0] + columns[-1]) / 2; hp, ha = (rows[-1] - rows[0]) / 2 + 10, (columns[-1] - columns[0]) / 2 + 10
    I, J = np.meshgrid(np.arange(NP), np.arange(NA), indexing='ij')
    earMask = ((I - cp) / hp) ** 2 + ((np.abs(J - (NA - 1) / 2) - (ca - (NA - 1) / 2)) / ha) ** 2 < 1
    print('ear polar', np.degrees(polar[[rows[0], rows[-1]]]).round(1), 'azimuth', np.degrees(azimuth[[columns[0], columns[-1]]]).round(1))
    R = outer.copy(); R[earMask] = 0
    # the flat bottom, and the neck's opening closed on it
    profile = R[:, NA // 2 - 1:NA // 2 + 1].mean(axis=1); ys = profile * np.cos(polar); xs = profile * np.sin(polar)
    front = (polar > np.radians(70)) & (polar < np.radians(155)) & (profile > 0)
    chinY = ys[front].min(); chinPolar = polar[front][np.argmax(ys[front] < chinY + 0.012)]
    planeY = chinY - GRID['bottom']
    plane = np.where(P > np.pi / 2 + 0.01, planeY / np.minimum(np.cos(P), -1e-6), 1e9)
    # under that plane the head is cut, not cast: a ray that leaves the neck's skin above it stops there, the rest on the plane
    below = (P > np.radians(100)) & ((R == 0) | (R * np.cos(P) < planeY)) & ~earMask & ~((np.abs(A) < 0.7) & (P < np.radians(140)))
    R = np.where(below, np.minimum(np.where(inner > 0, inner, 1e9), plane), R)
    # every other opening (the eyes, the ears' places) is closed by a membrane from its rim
    holes = R == 0; index = -np.ones(R.shape, int); index[holes] = np.arange(holes.sum()); n = int(holes.sum())
    hi, hj = np.where(holes); M = lil_matrix((n, n)); b = np.zeros(n)
    data = []; rowsI = []; colsI = []
    for di, dj in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        ni = np.clip(hi + di, 0, NP - 1); nj = (hj + dj) % NA
        isHole = holes[ni, nj]
        rowsI.append(np.arange(n)[isHole]); colsI.append(index[ni, nj][isHole]); data.append(-np.ones(isHole.sum()))
        np.add.at(b, np.arange(n)[~isHole], R[ni, nj][~isHole])
    rowsI.append(np.arange(n)); colsI.append(np.arange(n)); data.append(4 * np.ones(n))
    M = csr_matrix((np.concatenate(data), (np.concatenate(rowsI), np.concatenate(colsI))), shape=(n, n))
    R[holes] = spsolve(M, b)
    # the nostrils
    tip, foot = model['midline']['tip'], model['midline']['noseFoot']
    nose = (np.abs(A) < np.radians(model['side']['noseWing'][0] + 4)) & (P > np.radians(tip - 1)) & (P < np.radians(foot + 3))
    span = int(round(GRID['nostril']['span'] / (np.pi / NP))) | 1
    R = np.where(nose, np.maximum(R, grey_closing(R, size=(span, span)) - GRID['nostril']['depth']), R)
    # the mouth: the sculpt's lips are parted, a slit some 6 mm deep and 2 mm tall whose walls the atlas has no texels for
    # (the lips' paint would be drawn down them); closed, top to bottom, to a lip line
    lips = (np.abs(A) < np.radians(model['side']['mouthCorner'][0] + 4)) & (P > np.radians(model['midline']['lipTop'] - 1)) & (P < np.radians(model['midline']['lowerLip'] + 1))
    span = int(round(GRID['mouth']['span'] / (np.pi / NP))) | 1
    R = np.where(lips, np.maximum(R, grey_closing(R, size=(span, 1)) - GRID['mouth']['depth']), R)
    # the surface's normal at each ray: the mesh's own, and where the surface was remade above (the ears' places, the eyes'
    # membranes, the nostrils, the bottom) the remade surface's
    def unit(v): return v / np.maximum(np.linalg.norm(v, axis=-1, keepdims=True), 1e-12)
    X = gaussian_filter(R, 1.5, mode=('nearest', 'wrap'))[..., None] * rays
    remade = np.cross(np.roll(X, -1, axis=1) - np.roll(X, 1, axis=1), np.gradient(X, axis=0))
    if (remade * rays).sum(-1).mean() < 0: remade = -remade
    share = np.clip(gaussian_filter(binary_dilation(np.abs(R - outer) > 1e-5, iterations=3).astype(float), 2, mode=('nearest', 'wrap')) * 1.5, 0, 1)[..., None]
    normalImage = unit(unit(smooth) * (1 - share) + unit(remade) * share)
    grow, blur = GRID['plain']
    plainImage = np.clip(gaussian_filter(binary_dilation(earMask | below, iterations=grow).astype(float), blur, mode=('nearest', 'wrap')) * 2, 0, 1)
    # midline places
    profile = R[:, NA // 2 - 1:NA // 2 + 1].mean(axis=1); ys = profile * np.cos(polar); xs = profile * np.sin(polar)
    def polarAtHeight(y, column=NA // 2, low=30, high=150):
        band = (polar > np.radians(low)) & (polar < np.radians(high)); h = (R[:, column] * np.cos(polar))[band]
        return np.degrees(polar[band][np.argmax(h < y)])
    eyeY = float(np.mean([e[1] for e in d['eyes']])); browY = float(np.interp(np.radians(model['brow']), polar, ys))
    midline = dict(model['midline'], eye=polarAtHeight(eyeY), brow=model['brow'], chin=float(np.degrees(chinPolar)),
                   hairline=polarAtHeight(eyeY + GRID['hairlineAbove']))
    names = sorted(ATLAS_MIDLINE, key=ATLAS_MIDLINE.get)
    rowToPolar = PchipInterpolator([0] + [ATLAS_MIDLINE[k] for k in names] + [1], [0] + [midline[k] for k in names] + [180])
    print('midline', {k: round(float(midline[k]), 1) for k in names}, 'eyeY', round(eyeY, 3), 'browY', round(browY, 3), 'chinY', round(float(chinY), 3))
    # the head's breadth over its length sets how a share round the atlas turns into degrees round the head
    z = (R * np.sin(P) * np.sin(A))[P < np.radians(100)]; breadth = float(z.max() - z.min()); squash = breadth / 2.06
    def baseAzimuth(du): return np.arctan2(squash * np.sin(2 * np.pi * du), np.cos(2 * np.pi * du))
    side = dict(model['side'])
    browColumn = int((np.radians(20) + np.pi) / (2 * np.pi) * NA); side['browMiddle'] = (20.0, polarAtHeight(browY, browColumn, 40, 110))
    # the departure from that plain layout which puts each side landmark on its place, fading to nothing round the back
    at = []; shift = []
    # The pupil: half way between the lids' marks, on the head as on the atlas. Without it the rows between the lids keep the
    # midline's pace, which turns at the eye row (253 degrees a row above it, 91 below): the upper half of a painted eye is
    # spread over 7.7 mm of the man's 10.4 mm opening and its lower half pressed into 2.7 mm.
    pupil = lambda marks: tuple((np.array(marks['upperLid']) + marks['lowerLid']) / 2)
    side['pupil'] = pupil(side)
    for name, (du, row) in dict(ATLAS_SIDE, pupil=pupil(ATLAS_SIDE)).items():
        az, pol = side[name]
        for sign in (1, -1):
            at.append((sign * du * 512, row * 256)); shift.append((sign * (az - np.degrees(baseAzimuth(du))), pol - float(rowToPolar(row))))
    for row in [0] + [ATLAS_MIDLINE[k] for k in names] + [1]: at.append((0, row * 256)); shift.append((0, 0))
    for du in (0.19, 0.26, 0.34, 0.42, 0.5):
        for row in np.linspace(0, 1, 9):
            for sign in (1, -1): at.append((sign * du * 512, row * 256)); shift.append((0, 0))
    for du in np.linspace(-0.15, 0.15, 7):
        for row in (0, 0.12, 0.96, 1): at.append((du * 512, row * 256)); shift.append((0, 0))
    at, index = np.unique(np.round(np.array(at), 6), axis=0, return_index=True); shift = np.array(shift)[index]
    warp = RBFInterpolator(at, shift, kernel='thin_plate_spline')
    print('side shifts', {name: np.round(shift[np.where((np.abs(at - (ATLAS_SIDE[name][0] * 512, ATLAS_SIDE[name][1] * 256)).sum(axis=1) < 1e-4))[0][0]], 1).tolist() for name in ATLAS_SIDE})
    def direction(du, row):
        """[degrees round, degrees from the crown] of the atlas place [signed share round, row]."""
        du = np.atleast_1d(np.asarray(du, float)); row = np.atleast_1d(np.asarray(row, float))
        moved = warp(np.stack([du.ravel() * 512, row.ravel() * 256], 1)).reshape(du.shape + (2,))
        return np.degrees(baseAzimuth(du)) + moved[..., 0], np.clip(rowToPolar(row) + moved[..., 1], 0, 180)
    def surface(du, row, image=None):
        az, pol = direction(du, row)
        i = np.radians(pol) / np.pi * NP - 0.5; j = (np.radians(az) + np.pi) / (2 * np.pi) * NA - 0.5
        r = map_coordinates(R if image is None else image, [np.clip(i, 0, NP - 1), j % NA], order=1, mode='grid-wrap')
        p, a = np.radians(pol), np.radians(az)
        return np.stack([r * np.sin(p) * np.cos(a), r * np.cos(p), r * np.sin(p) * np.sin(a)], -1)
    def normalAt(du, row):
        az, pol = direction(du, row)
        i = np.clip(np.radians(pol) / np.pi * NP - 0.5, 0, NP - 1); j = ((np.radians(az) + np.pi) / (2 * np.pi) * NA - 0.5) % NA
        return unit(np.stack([map_coordinates(normalImage[..., axis], [i, j], order=1, mode='grid-wrap') for axis in range(3)], -1))
    def plainAt(du, row):
        az, pol = direction(du, row)
        i = np.clip(np.radians(pol) / np.pi * NP - 0.5, 0, NP - 1); j = ((np.radians(az) + np.pi) / (2 * np.pi) * NA - 0.5) % NA
        return np.clip(map_coordinates(plainImage, [i, j], order=1, mode='grid-wrap'), 0, 1)
    H, W = GRID['image']
    fineRow, fineDu = np.meshgrid((np.arange(H) + 0.5) / H, (np.arange(W) + 0.5) / W - 0.5, indexing='ij')
    fine = surface(fineDu, fineRow); fineNormal = normalAt(fineDu, fineRow)
    columns = spaced(GRID['columns'], GRID['snapColumns']); rowsAt = spaced(GRID['rows'], GRID['snapRows'])
    finest = (min(step for _, step in GRID['columns']) * NA, min(step for _, step in GRID['rows']) * float(rowToPolar(0.55) - rowToPolar(0.45)) / 0.1 / 180 * NP)
    sampled = gaussian_filter(R, (finest[1] * GRID['sample'][1], finest[0] * GRID['sample'][0]), mode=('nearest', 'wrap'))
    print('finest spacing, rays: round', round(finest[0], 1), 'down', round(finest[1], 1))
    nodeRow, nodeDu = np.meshgrid(rowsAt, columns, indexing='ij'); nodes = surface(nodeDu, nodeRow, sampled)
    nodes[:, 0, 2] = 0; nodes[:, -1, 2] = 0; nodes[0] = nodes[0].mean(axis=0) * [0, 1, 0]; nodes[-1] = [0, planeY, 0]
    marks = {name: surface(du, row)[0].tolist() for name, (du, row) in ATLAS_SIDE.items()}
    marks.update({name: surface(0.0, row)[0].tolist() for name, row in ATLAS_MIDLINE.items()})
    print('lattice', nodes.shape, 'breadth', round(breadth, 3), 'planeY', round(float(planeY), 3))
    for name, p in marks.items(): print('  ', name, np.round(p, 3).tolist())
    # the hair's and the beard's ground: the same surface as distances from the centre, on an even lattice of directions
    tp, ta = GRID['table']; soft = gaussian_filter(R, (NP / tp / 2, NA / ta / 2), mode=('nearest', 'wrap'))
    ti, tj = np.meshgrid(np.arange(tp + 1) / tp * NP - 0.5, np.arange(ta) / ta * NA - 0.5, indexing='ij')
    table = map_coordinates(soft, [np.clip(ti, 0, NP - 1), tj % NA], order=1, mode='grid-wrap')
    relief = bake(surface(fineDu, fineRow, sampled), fineNormal, plainAt(fineDu, fineRow))
    Image.fromarray(relief).save(f'model-{sex}-normal.png', optimize=True)
    json.dump(dict(columns=columns.tolist(), rows=rowsAt.tolist(), nodes=np.round(nodes, 5).tolist(), marks=marks, planeY=float(planeY),
                   atlas=dict(midline=ATLAS_MIDLINE, side={name: list(at) for name, at in ATLAS_SIDE.items()}),
                   table=np.round(table, 4).tolist()), open(f'grid-{sex}.json', 'w'))
    np.savez_compressed(f'grid-{sex}.npz', nodes=nodes, columns=columns, rows=rowsAt, fine=fine.astype(np.float32), R=R.astype(np.float32), fineNormal=fineNormal.astype(np.float32),
                        marks=json.dumps(marks), planeY=planeY, breadth=breadth)

if __name__ == '__main__': main(sys.argv[1])
