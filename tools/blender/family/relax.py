# Each build's points set evenly on its own surface: python3 relax.py [passes]   (reg/<build>-<sex>.npy -> even/<build>-<sex>.npy)
#
# A build is the base mesh's points moved (register.py, famE.py, fit.py). The fits left each point free to slide along the
# surface, and neighbours slid by different amounts: 5 to 6 mm rms against the neighbours' mean on a trunk whose points are
# 25 mm apart. The skin map is laid on the base mesh's points, so what is drawn on it (the rules' ribs 25 mm apart, her bone
# relief) came out in zigzags on every build but the base. Here the move from the base is smoothed over neighbours and each
# point put back on the build's own surface, `passes` times: the shape is the build's, the points are spread as the base's are.
import os, sys
import numpy as np
import scipy.sparse as sp
from scipy.spatial import cKDTree
import bodylib as bl

RELAX = {
    # Passes of half the way to the neighbours' mean move: 12 take out what is shorter than about 4 edges (10 cm) and leave
    # the build's own proportions (a longer trunk, a belly's spread) where the fit put them.
    'passes': int(sys.argv[1]) if len(sys.argv) > 1 else 12, 'amount': 0.5,
    # A point is put back on the nearest of the surface's triangles within this many rings of its own (not through an armpit
    # onto the arm, nor across the fold between the thighs).
    'rings': 3,
    # A fold's own points stay on it (the armpit, under a breast, between the buttocks: 25 mm apart, a point slid off a fold
    # cuts its corner): none of the move where the surface turns by `fold[1]` degrees at a point's sharpest edge, all of it
    # under `fold[0]`.
    'fold': (25, 50),
}


def closest_on_triangles(p, a, b, c):
    """The closest point to p on each triangle abc (Ericson, Real-Time Collision Detection 5.1.5), rows together."""
    ab, ac, ap = b - a, c - a, p - a
    d1, d2 = (ab * ap).sum(1), (ac * ap).sum(1)
    bp = p - b
    d3, d4 = (ab * bp).sum(1), (ac * bp).sum(1)
    cp = p - c
    d5, d6 = (ab * cp).sum(1), (ac * cp).sum(1)
    va, vb, vc = d3 * d6 - d5 * d4, d5 * d2 - d1 * d6, d1 * d4 - d3 * d2
    with np.errstate(divide='ignore', invalid='ignore'):
        den = 1 / (va + vb + vc)
        v, w = vb * den, vc * den
        out = a + ab * v[:, None] + ac * w[:, None]
        t = d1 / (d1 - d3)
        out = np.where(((vc <= 0) & (d1 >= 0) & (d3 <= 0))[:, None], a + ab * t[:, None], out)
        t = d2 / (d2 - d6)
        out = np.where(((vb <= 0) & (d2 >= 0) & (d6 <= 0))[:, None], a + ac * t[:, None], out)
        t = (d4 - d3) / ((d4 - d3) + (d5 - d6))
        out = np.where(((va <= 0) & (d4 - d3 >= 0) & (d5 - d6 >= 0))[:, None], b + (c - b) * t[:, None], out)
    out = np.where(((d6 >= 0) & (d5 <= d6))[:, None], c, out)
    out = np.where(((d3 >= 0) & (d4 <= d3))[:, None], b, out)
    out = np.where(((d1 <= 0) & (d2 <= 0))[:, None], a, out)
    return out


def sharpest(B, T):
    """Each point's sharpest edge: the most the surface turns across an edge at it, degrees."""
    fn = np.cross(B[T[:, 1]] - B[T[:, 0]], B[T[:, 2]] - B[T[:, 0]])
    fn /= np.maximum(1e-12, np.linalg.norm(fn, axis=1, keepdims=True))
    e = np.concatenate([T[:, [0, 1]], T[:, [1, 2]], T[:, [2, 0]]]); e.sort(1)
    tri = np.tile(np.arange(len(T)), 3)
    order = np.lexsort((e[:, 1], e[:, 0])); e, tri = e[order], tri[order]
    pair = (e[:-1] == e[1:]).all(1)
    turn = np.degrees(np.arccos(np.clip((fn[tri[:-1][pair]] * fn[tri[1:][pair]]).sum(1), -1, 1)))
    out = np.zeros(len(B))
    for k in range(2):
        np.maximum.at(out, e[:-1][pair][:, k], turn)
    return out


def relax(V, T, B, passes=RELAX['passes']):
    n = len(V)
    M = bl.laplacian(n, T)
    # The open borders (neck, wrists, ankles: the head, hands and feet join there) stay where they are.
    e = np.concatenate([T[:, [0, 1]], T[:, [1, 2]], T[:, [2, 0]]]); e.sort(1)
    pairs, count = np.unique(e, axis=0, return_counts=True)
    free = np.ones(n, bool); free[np.unique(pairs[count == 1])] = False
    lo, hi = RELAX['fold']
    amount = RELAX['amount'] * np.clip((hi - sharpest(B, T)) / (hi - lo), 0, 1) * free
    # Each point's triangles within `rings` of it, padded with its first.
    A = sp.coo_matrix((np.ones(len(pairs) * 2), (np.r_[pairs[:, 0], pairs[:, 1]], np.r_[pairs[:, 1], pairs[:, 0]])), shape=(n, n)).tocsr() + sp.identity(n, format='csr')
    reach = A
    for _ in range(RELAX['rings'] - 1):
        reach = (reach @ A).tocsr()
    inc = sp.coo_matrix((np.ones(len(T) * 3), (T.ravel(), np.repeat(np.arange(len(T)), 3))), shape=(n, len(T))).tocsr()
    near = ((reach > 0).astype(float) @ inc).tocsr()
    most = int(np.diff(near.indptr).max())
    table = np.zeros((n, most), int)
    for v in range(n):
        own = near.indices[near.indptr[v]:near.indptr[v + 1]]
        table[v, :len(own)] = own; table[v, len(own):] = own[0]
    X = B.copy()
    for _ in range(passes):
        d = X - V
        Y = V + d + amount[:, None] * (M @ d - d)
        best = np.full(n, np.inf); put = X.copy()
        for k in range(most):
            tri = table[:, k]
            q = closest_on_triangles(Y, B[T[tri, 0]], B[T[tri, 1]], B[T[tri, 2]])
            dist = np.linalg.norm(q - Y, axis=1)
            better = dist < best
            best[better] = dist[better]; put[better] = q[better]
        X = np.where((amount > 0)[:, None], put, X)
    return X


def roughness(V, T, B, sel):
    M = bl.laplacian(len(V), T)
    d = B - V; r = M @ d - d; N = bl.normals(B, T)
    rn = (r * N).sum(1); rt = r - rn[:, None] * N
    return np.sqrt((rt[sel] ** 2).sum(1).mean()) * 1750, np.sqrt((rn[sel] ** 2).mean()) * 1750


if __name__ == '__main__':
    os.makedirs('even', exist_ok=True)
    for sex in ('female', 'male'):
        b = bl.load(sex); V, T = b['V'], b['T']
        trunk = (V[:, 1] > 0.5) & (V[:, 1] < 0.82) & (np.abs(V[:, 2]) < 0.11)
        for name in ('E', 'N', 'M', 'F1', 'F2', 'F3'):
            B = np.load(f'reg/{name}-{sex}.npy')
            X = relax(V, T, B)
            np.save(f'even/{name}-{sex}.npy', X)
            # How far the old points stand off the new surface (the shape lost), and the trunk's roughness before and after.
            tree = cKDTree(X[T].mean(1)); _, near = tree.query(B, k=16)
            off = np.full(len(B), np.inf)
            for k in range(16):
                tri = near[:, k]
                off = np.minimum(off, np.linalg.norm(closest_on_triangles(B, X[T[tri, 0]], X[T[tri, 1]], X[T[tri, 2]]) - B, axis=1))
            before, after = roughness(V, T, B, trunk), roughness(V, T, X, trunk)
            print(f'{sex} {name}: slide rms {before[0]:.2f} -> {after[0]:.2f} mm, moved rms {np.sqrt(((X - B) ** 2).sum(1).mean()) * 1750:.1f} most {np.linalg.norm(X - B, axis=1).max() * 1750:.1f} mm, old points off the new surface rms {np.sqrt((off ** 2).mean()) * 1750:.2f} most {off.max() * 1750:.1f} mm')
