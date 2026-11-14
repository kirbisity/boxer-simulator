# Non-rigid registration: one mesh's points drawn onto another's surface, the displacement kept smooth over the mesh
# (a membrane: neighbouring points move alike), the stiffness let go step by step.
import numpy as np, scipy.sparse as sp
from scipy.sparse.linalg import factorized
from scipy.spatial import cKDTree
import bodylib as bl

def sample_surface(V, T, per=3):
    """Points over the triangles (corners, middles and a few inside) with the triangles' normals."""
    fn = np.cross(V[T[:, 1]] - V[T[:, 0]], V[T[:, 2]] - V[T[:, 0]]); fn /= np.maximum(1e-12, np.linalg.norm(fn, axis=1, keepdims=True))
    vn = bl.normals(V, T)
    pts, nrm = [V], [vn]
    for w in ((1/3, 1/3, 1/3), (0.6, 0.2, 0.2), (0.2, 0.6, 0.2), (0.2, 0.2, 0.6), (0.5, 0.5, 0), (0, 0.5, 0.5), (0.5, 0, 0.5))[:1 + 2 * per]:
        pts.append(w[0] * V[T[:, 0]] + w[1] * V[T[:, 1]] + w[2] * V[T[:, 2]]); nrm.append(fn)
    return np.concatenate(pts), np.concatenate(nrm)

def register(V0, T, target_pts, target_nrm, steps=((30, 4), (10, 4), (3, 5), (1, 6), (0.3, 6)), reach=0.06, agree=0.2, fixed=None, weight=None, start=None, both=True, target_label=None, allowed=None):
    """V0 (n,3) moved onto the target samples. steps: (stiffness, iterations). `weight`: each point's trust in its match."""
    n = len(V0)
    e = bl.edges_of(T)
    G = sp.coo_matrix((np.r_[np.ones(len(e)), np.ones(len(e)), -np.ones(len(e)), -np.ones(len(e))],
                       (np.r_[e[:, 0], e[:, 1], e[:, 0], e[:, 1]], np.r_[e[:, 0], e[:, 1], e[:, 1], e[:, 0]])), shape=(n, n)).tocsc()
    tree = cKDTree(target_pts)
    X = V0.copy() if start is None else start.copy()
    base_w = np.ones(n) if weight is None else weight
    for stiff, iters in steps:
        for _ in range(iters):
            N = bl.normals(X, T)
            d, idx = tree.query(X, k=6)
            # the nearest sample whose normal agrees with the point's own
            ok = (np.einsum('ikj,ij->ik', target_nrm[idx], N) > agree) & (d < reach)
            # a point only takes samples of its own limb (`allowed` (n, labels) against each sample's `target_label`)
            if allowed is not None: ok &= allowed[np.arange(n)[:, None], target_label[idx]]
            first = np.argmax(ok, 1); has = ok.any(1)
            c = target_pts[idx[np.arange(n), first]]
            w = base_w * has
            rows_w, rhs = w.copy(), w[:, None] * (c - V0)
            if both:
                # each target sample also draws the mesh point nearest it (so a narrow ridge of the target is not passed over)
                src = cKDTree(X); d2, j = src.query(target_pts)
                okb = (d2 < reach * 0.5) & (np.einsum('ij,ij->i', target_nrm, N[j]) > agree)
                if allowed is not None: okb &= allowed[j, target_label]
                cnt = np.bincount(j[okb], minlength=n).astype(float)
                acc = np.zeros((n, 3)); np.add.at(acc, j[okb], target_pts[okb])
                wb = 0.5 * base_w * (cnt > 0)
                rows_w = rows_w + wb; rhs = rhs + wb[:, None] * (acc / np.maximum(1, cnt)[:, None] - V0)
            if fixed is not None:
                rows_w = rows_w + 100 * fixed; 
            A = (sp.diags(rows_w + 1e-6) + stiff * G).tocsc()
            solve = factorized(A)
            D = np.stack([solve(rhs[:, k]) for k in range(3)], 1)
            X = V0 + D
    return X
