# Body-building helpers (numpy/scipy, no Blender): the base body's topology in the GAME frame (units of standing height,
# x forward, y up, z to the left), its measures as a tape takes them, smoothing, and skinning by the bone-heat weights.
import json, csv, os, numpy as np
import scipy.sparse as sp
from scipy.spatial import ConvexHull, cKDTree

# The work directory (README.md): emac/ and ansur/ hold what the scripts read, remodel/ what they make (they run from there).
S = os.environ.get('HACS_FAMILY_WORK') or os.path.dirname(os.getcwd())

def load(sex):
    d = json.load(open(f'{S}/emac/base-{sex}.json'))
    r = json.load(open(f'{S}/emac/base-rigged.json'))
    m = d['meshes']['full']
    n = len(m['part'])
    b = dict(sex=sex, V=np.array(m['positions'], float).reshape(-1, 3), T=np.array(m['triangles']).reshape(-1, 3), part=np.array(m['part']),
             part2=np.array(m['part2']), blend=np.array(m['blend'], float), parts=d['parts'], J={k: np.array(v, float) for k, v in d['joints'].items()})
    W = np.zeros((n, len(r['heatBones'])))
    hi = np.array(r[sex]['heatIndex']).reshape(n, 4); hw = np.array(r[sex]['heatWeight'], float).reshape(n, 4)
    for k in range(4): np.add.at(W, (np.arange(n), hi[:, k]), hw[:, k])
    b['W'] = W / W.sum(1, keepdims=True); b['bones'] = r['heatBones']
    return b

# ---- mesh operators -------------------------------------------------------------
def edges_of(T):
    e = np.concatenate([T[:, [0, 1]], T[:, [1, 2]], T[:, [2, 0]]]); e.sort(1)
    return np.unique(e, axis=0)

def laplacian(n, T):
    """Uniform graph Laplacian's averaging matrix (row-stochastic neighbour mean)."""
    e = edges_of(T)
    A = sp.coo_matrix((np.ones(len(e) * 2), (np.r_[e[:, 0], e[:, 1]], np.r_[e[:, 1], e[:, 0]])), shape=(n, n)).tocsr()
    return sp.diags(1 / np.maximum(1, np.asarray(A.sum(1)).ravel())) @ A

def smooth(X, M, passes=1, amount=0.5, weight=None):
    """`passes` steps of each value toward its neighbours' mean by `amount` (times a per-point `weight`)."""
    a = amount if weight is None else (amount * weight)[:, None] if X.ndim == 2 else amount * weight
    for _ in range(passes): X = X + a * (M @ X - X)
    return X

def normals(V, T):
    fn = np.cross(V[T[:, 1]] - V[T[:, 0]], V[T[:, 2]] - V[T[:, 0]])
    N = np.zeros_like(V)
    for k in range(3): np.add.at(N, T[:, k], fn)
    return N / np.maximum(1e-12, np.linalg.norm(N, axis=1, keepdims=True))

def weld_map(V, tol=1e-6):
    """Index of the first point at each position (the texture seams' doubled points move as one)."""
    tree = cKDTree(V); first = np.arange(len(V))
    for i, j in sorted(tree.query_pairs(tol)): first[j] = min(first[j], first[i])
    for i in range(len(V)): first[i] = first[first[i]]
    return first

def volume(V, T):
    return abs(np.einsum('ij,ij->i', V[T[:, 0]], np.cross(V[T[:, 1]], V[T[:, 2]])).sum()) / 6

# ---- a tape's measures ------------------------------------------------------------
def section(V, T, origin, normal, keep=None):
    """The points where the plane cuts the triangles (those whose three points pass `keep`)."""
    d = (V - origin) @ normal
    tri = T if keep is None else T[keep[T].all(1)]
    out = []
    for a, b in ((0, 1), (1, 2), (2, 0)):
        da, db = d[tri[:, a]], d[tri[:, b]]
        m = (da * db) < 0
        t = da[m] / (da[m] - db[m])
        out.append(V[tri[m, a]] + t[:, None] * (V[tri[m, b]] - V[tri[m, a]]))
    return np.concatenate(out) if out else np.zeros((0, 3))

def ring_at(V, T, origin, normal, keep=None):
    """The one ring of the plane's cut that goes round `origin` most nearly (its points' mean nearest it): a tape round a limb
    goes round the limb alone, and the limb's part runs on over the chest and the shoulder blade (the muscles that move it),
    which the same plane cuts as loose arcs."""
    d = (V - origin) @ normal
    tri = T if keep is None else T[keep[T].all(1)]
    s = d[tri] > 0; cut = tri[s.any(1) & ~s.all(1)]
    parent = {}
    def find(k):
        while parent.setdefault(k, k) != k: parent[k] = parent[parent[k]]; k = parent[k]
        return k
    for t in cut:
        keys = [(min(t[i], t[j]), max(t[i], t[j])) for i, j in ((0, 1), (1, 2), (2, 0)) if (d[t[i]] > 0) != (d[t[j]] > 0)]
        parent[find(keys[0])] = find(keys[1])
    groups = {}
    for (i, j) in list(parent):
        groups.setdefault(find((i, j)), []).append(V[i] + (V[j] - V[i]) * (d[i] / (d[i] - d[j])))
    if not groups: return np.zeros((0, 3))
    return min((np.array(g) for g in groups.values()), key=lambda g: np.linalg.norm(g.mean(0) - origin))

def girth(points, normal, centre=None, radius=None):
    """A tape's length round the cut (its convex hull's perimeter), the cut's breadth across and depth fore and aft."""
    if centre is not None and radius is not None: points = points[np.linalg.norm(points - centre, axis=1) < radius]
    if len(points) < 3: return np.nan, np.nan, np.nan
    n = normal / np.linalg.norm(normal)
    u = np.cross(n, [1.0, 0, 0]); u = u / np.linalg.norm(u) if np.linalg.norm(u) > 1e-6 else np.array([0, 0, 1.0])
    w = np.cross(n, u)
    P = np.stack([points @ u, points @ w], 1)
    h = ConvexHull(P)
    return h.area, np.ptp(points[:, 2]), np.ptp(points[:, 0])

def rings(V, T, y):
    """The separate rings a level plane cuts the surface in: each ring's points."""
    d = V[:, 1] - y; s = d[T] > 0; cut = T[s.any(1) & ~s.all(1)]
    parent = {}
    def find(k):
        while parent.setdefault(k, k) != k: parent[k] = parent[parent[k]]; k = parent[k]
        return k
    for t in cut:
        keys = [(min(t[i], t[j]), max(t[i], t[j])) for i, j in ((0, 1), (1, 2), (2, 0)) if (d[t[i]] > 0) != (d[t[j]] > 0)]
        parent[find(keys[0])] = find(keys[1])
    groups = {}
    for (i, j) in list(parent):
        groups.setdefault(find((i, j)), []).append(V[i] + (V[j] - V[i]) * (d[i] / (d[i] - d[j])))
    return [np.array(g) for g in groups.values()]

def measure(b, V=None, quick=False):
    """The body's measures in units of height (ANSUR II's names where it has them)."""
    V = b['V'] if V is None else V
    T, part, P, J = b['T'], b['part'], b['parts'], b['J']
    is_ = lambda *names: np.isin(part, [P.index(n) for n in names])
    up = np.array([0, 1.0, 0])
    trunk = is_('trunk', 'neck')
    out = {}
    def level(name, y, keep, side=None):
        pts = section(V, T, np.array([0, y, 0]), up, keep)
        if side is not None: pts = pts[pts[:, 2] * side > 0]
        g, br, dp = girth(pts, up)
        out[name + 'circumference'] = g; out[name + 'breadth'] = br; out[name + 'depth'] = dp
    f = b['sex'] == 'female'
    # the chest's tape passes under the arms: the ring about the middle line, where the arms' rings stand clear of it
    cuts = rings(V, T, 0.719 if f else 0.735)
    if len(cuts) >= 3:
        out['chestcircumference'], out['chestbreadth'], out['chestdepth'] = girth(min(cuts, key=lambda p: abs(p[:, 2].mean()) + (len(p) < 12)), up)
    else: level('chest', 0.719 if f else 0.735, trunk)
    # the armpit: the highest level at which the arms' cuts are still rings of their own (arms at the bind pose's angle)
    if not quick:
        ys_ = np.arange(0.66, 0.80, 0.0025); ok = [len(rings(V, T, y)) >= 3 for y in ys_]
        out['axillaheight'] = ys_[max(i for i, c in enumerate(ok) if c)] if any(ok) else np.nan
    level('waist', 0.60, trunk)
    # the buttock's level: where the trunk and thighs together stand furthest back
    lower = is_('trunk', 'lThigh', 'rThigh')
    ys = np.arange(0.47, 0.56, 0.005)
    back = [section(V, T, np.array([0, y, 0]), up, lower)[:, 0].min() for y in ys]
    level('buttock', ys[int(np.argmin(back))], lower)
    out['hipbreadth'] = out.pop('buttockbreadth')
    # the largest girth of the belly between the rib margin and the crotch, and where it stands (its depth)
    best = max(((girth(section(V, T, np.array([0, y, 0]), up, trunk), up), y) for y in np.arange(0.54, 0.66, 0.01)), key=lambda s: s[0][0])
    out['bellycircumference'], out['bellyheight'], out['bellydepth'] = best[0][0], best[1], best[0][2]
    def limb(name, a, c, at, keepn, most=False, least=False, ring=False):
        A, C = J[a], J[c]; ax = (C - A) / np.linalg.norm(C - A)
        vals = []
        for s in np.atleast_1d(at):
            o = A + (C - A) * s
            pts = ring_at(V, T, o, ax, is_(*keepn)) if ring else section(V, T, o, ax, is_(*keepn))
            vals.append(girth(pts, ax, o, 0.12)[0])
        out[name] = np.nanmax(vals) if most else np.nanmin(vals) if least else vals[0]
    limb('thighcircumference', 'lHip', 'lKnee', 0.3, ('lThigh', 'trunk'))
    limb('midthighcircumference', 'lHip', 'lKnee', 0.5, ('lThigh',))
    limb('lowerthighcircumference', 'lHip', 'lKnee', 0.85, ('lThigh', 'lShin'))
    limb('calfcircumference', 'lKnee', 'lFoot', np.arange(0.15, 0.5, 0.05), ('lShin',), most=True)
    limb('anklecircumference', 'lKnee', 'lFoot', np.arange(0.75, 0.96, 0.05), ('lShin',), least=True)
    limb('bicepscircumference', 'lShoulder', 'lElbow', np.arange(0.4, 0.7, 0.05), ('lUpper',), most=True, ring=True)
    limb('forearmcircumference', 'lElbow', 'lHand', np.arange(0.1, 0.45, 0.05), ('lFore', 'lUpper'), most=True)
    limb('wristcircumference', 'lElbow', 'lHand', np.arange(0.8, 0.96, 0.05), ('lFore',), least=True)
    limb('neckcircumference', 'neck', 'head', 0.45, ('neck', 'trunk'))
    # shoulders: the top of the shoulder at the acromion's place (half the biacromial breadth out), and the breadth over the deltoids
    upper = is_('trunk', 'neck', 'lUpper', 'rUpper')
    bia = 0.112 if f else 0.118
    near = upper & (np.abs(np.abs(V[:, 2]) - bia) < 0.006)
    out['acromialheight'] = V[near, 1].max()
    cap = upper & (V[:, 1] > 0.74) & (V[:, 1] < 0.80)
    out['bideltoidbreadth'] = 2 * np.abs(V[cap, 2]).max()
    out['neckbaseheight'] = V[upper & (np.abs(np.abs(V[:, 2]) - 0.045) < 0.006), 1].max()
    out['volume'] = volume(V, T)
    return out

# ---- ANSUR II (2012, public data): each measure over stature against BMI --------------
ANSUR_NAMES = ['chestcircumference', 'chestbreadth', 'chestdepth', 'waistcircumference', 'waistbreadth', 'waistdepth', 'buttockcircumference',
               'buttockdepth', 'hipbreadth', 'thighcircumference', 'lowerthighcircumference', 'calfcircumference', 'anklecircumference',
               'bicepscircumferenceflexed', 'forearmcircumferenceflexed', 'wristcircumference', 'neckcircumference', 'acromialheight',
               'bideltoidbreadth', 'biacromialbreadth', 'shouldercircumference', 'abdominalextensiondepthsitting']
_ansur = {}
def ansur(sex):
    if sex not in _ansur:
        rows = list(csv.DictReader(open(f'{S}/ansur/{sex.upper()}.csv', encoding='latin-1')))
        st = np.array([float(r['stature']) for r in rows]); wt = np.array([float(r['weightkg']) / 10 for r in rows])
        _ansur[sex] = (wt / (st / 1000) ** 2, {k: np.array([float(r[k]) for r in rows]) / st for k in ANSUR_NAMES})
    return _ansur[sex]

def ansur_at(sex, bmi):
    """Each measure's mean over stature at this BMI: a straight line through the survey (it holds to its edges; past them it
    carries on), fitted on the soldiers within 12 BMI points with weights falling off over 4."""
    x, table = ansur(sex)
    w = np.exp(-0.5 * ((x - np.clip(bmi, 18, 38)) / 4) ** 2)
    out = {}
    for k, y in table.items():
        A = np.stack([np.ones_like(x), x], 1) * w[:, None]
        c = np.linalg.lstsq(A, y * w, rcond=None)[0]
        out[k] = c[0] + c[1] * bmi
    # A relaxed arm's girth: the survey flexes the biceps and the forearm (a flexed upper arm is about 8% bigger round than a
    # relaxed one, a forearm about 4%: Gordon et al. 1989's two measures on the same soldiers).
    out['bicepscircumference'] = out['bicepscircumferenceflexed'] / 1.08
    out['forearmcircumference'] = out['forearmcircumferenceflexed'] / 1.04
    return out

def compare(b, V, bmi, names=None):
    m = measure(b, V); a = ansur_at(b['sex'], bmi)
    names = names or [k for k in m if k in a]
    return {k: (m[k], a[k], m[k] / a[k]) for k in names}

# ---- posing by the bone-heat weights ---------------------------------------------------
def _turn(a, b):
    """The rotation taking direction a to direction b (the shortest turn)."""
    a = a / np.linalg.norm(a); b = b / np.linalg.norm(b)
    v = np.cross(a, b); s = np.linalg.norm(v); c = a @ b
    if s < 1e-9: return np.eye(3)
    K = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]]) / s
    return np.eye(3) + s * K + (1 - c) * K @ K

def _about(R, p):
    M = np.eye(4); M[:3, :3] = R; M[:3, 3] = p - R @ p; return M

def limb_pose(b, aims):
    """Each bone's matrix when the limbs are turned so their bones point along `aims` ({'lUpperArm': direction, ...}); and the
    joints where they then stand. Bones not named keep their place (a forearm still follows its upper arm)."""
    J = b['J']; M = {k: np.eye(4) for k in b['bones']}; Jn = {k: v.copy() for k, v in J.items()}
    for s in 'lr':
        for root, mid, end, b1, b2 in ((s + 'Shoulder', s + 'Elbow', s + 'Hand', s + 'UpperArm', s + 'Forearm'), (s + 'Hip', s + 'Knee', s + 'Foot', s + 'Thigh', s + 'Shin')):
            d1 = J[mid] - J[root]; R1 = _turn(d1, aims.get(b1, d1)); M1 = _about(R1, J[root])
            Jn[mid] = (M1 @ np.r_[J[mid], 1])[:3]
            d2 = R1 @ (J[end] - J[mid]); R2 = _turn(d2, aims.get(b2, d2)); M2 = _about(R2, Jn[mid]) @ M1
            Jn[end] = (M2 @ np.r_[J[end], 1])[:3]
            M[b1], M[b2] = M1, M2
    return M, Jn

def blend_matrices(b, M):
    """Each point's own matrix: its bones' matrices mixed by its weights."""
    return np.einsum('vk,kij->vij', b['W'], np.stack([M[k] for k in b['bones']]))

def skin(B, V, back=False):
    """Points moved by their matrices (or, `back`, returned from the pose to where they were bound)."""
    if back: return np.einsum('vij,vj->vi', np.linalg.inv(B), np.c_[V, np.ones(len(V))])[:, :3]
    return np.einsum('vij,vj->vi', B, np.c_[V, np.ones(len(V))])[:, :3]
