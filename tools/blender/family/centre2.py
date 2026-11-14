# Section middles (the cut's hull, its area's middle) of each build against the base's along the limb chains: moved by [x, y, z] thousandths of height; and the girth ratio.
import numpy as np, bodylib as bl, sys
from scipy.spatial import ConvexHull
def middle(P, n):
    u = np.cross(n, [0.3, 0.5, 0.8]); u /= np.linalg.norm(u); v = np.cross(n, u)
    Q = np.c_[P @ u, P @ v]; h = ConvexHull(Q); q = Q[h.vertices]; x, y = q[:, 0], q[:, 1]; x1, y1 = np.roll(x, -1), np.roll(y, -1)
    cr = x * y1 - x1 * y; A = cr.sum() / 2; c = np.array([((x + x1) * cr).sum(), ((y + y1) * cr).sum()]) / (6 * A)
    per = np.hypot(x1 - x, y1 - y).sum()
    return P.mean(0) + (c[0] - Q[:, 0].mean()) * u + (c[1] - Q[:, 1].mean()) * v, per
limbs = {'lUpper': ('lShoulder', 'lElbow'), 'lFore': ('lElbow', 'lHand'), 'lThigh': ('lHip', 'lKnee'), 'lShin': ('lKnee', 'lFoot'), 'neck': ('neck', 'head')}
if __name__ == '__main__':
  for sex in ('male', 'female'):
    b = bl.load(sex); V = b['V']; T = b['T']
    for name in sys.argv[1:] or ('E', 'N', 'F3'):
        X = np.load(f'{name}-{sex}.npy'); print(sex, name)
        for limb, (ja, jb) in limbs.items():
            a, c = b['J'][ja], b['J'][jb]; ax = (c - a) / np.linalg.norm(c - a); L = np.linalg.norm(c - a)
            pid = b['parts'].index(limb); keep = (b['part'] == pid) | ((b['part2'] == pid) & (b['blend'] > 0))
            tv = ((V[keep] - a) @ ax) / L; row = []
            for t in (0.15, 0.4, 0.65, 0.9, tv.max() - 0.03):
                o = a + ax * t * L
                P0 = bl.section(V, T, o, ax, keep); P1 = bl.section(X, T, o, ax, keep)
                if len(P0) < 6 or len(P1) < 6: row.append('-'); continue
                m0, g0 = middle(P0, ax); m1, g1 = middle(P1, ax)
                row.append(f'{np.round((m1 - m0) * 1000).astype(int).tolist()} g×{g1 / g0:.2f}')
            print(f'   {limb:7s} tmax {tv.max():.2f} ', ' | '.join(row))
