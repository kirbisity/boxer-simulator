# The emaciated body on the game's own points: each sex's base mesh drawn onto her sculpt (set in the base's pose and on its joints).
import sys, numpy as np, bodylib as bl, nricp, malechest
from scipy.spatial import cKDTree

def border_rings(n, T, rings):
    """True for the points within `rings` edges of an open edge (neck, wrists, ankles)."""
    E = np.sort(np.concatenate([T[:, [0, 1]], T[:, [1, 2]], T[:, [2, 0]]]), 1)
    U, c = np.unique(E, axis=0, return_counts=True)
    near = np.zeros(n, bool); near[np.unique(U[c == 1])] = True
    e = bl.edges_of(T)
    for _ in range(rings):
        grow = near.copy(); grow[e[near[e[:, 1]], 0]] = True; grow[e[near[e[:, 0]], 1]] = True; near = grow
    return near

def mirror_mean(V0, D):
    """The displacement made the same on both sides: each point's own and its mirror point's (the three nearest across the middle)."""
    tree = cKDTree(V0); d, j = tree.query(V0 * [1, 1, -1], k=3)
    w = 1 / np.maximum(1e-6, d); w /= w.sum(1, keepdims=True)
    other = np.einsum('ik,ikj->ij', w, D[j]) * [1, 1, -1]
    return (D + other) / 2

if __name__ == "__main__":
  for sex in ('female', 'male'):
      b = bl.load(sex); V0, T = b['V'], b['T']
      z = np.load(f'{bl.S}/emac/her3d-b-aligned{"-male" if sex == "male" else ""}.npz')
      A, TA = z['A'].astype(float), z['T']
      # without her head and hands (the game's body ends at the neck and wrists; a hand beside the thigh would draw the thigh's points)
      past = np.zeros(len(A), bool)
      for s_ in 'lr':
          e, h = b['J'][s_ + 'Elbow'], b['J'][s_ + 'Hand']; u = (h - e) / np.linalg.norm(h - e)
          along = (A - h) @ u; off = np.linalg.norm((A - h) - along[:, None] * u, axis=1)
          past |= (along > 0.004) & (off < 0.012 + along)
      TA = TA[(A[TA].max(1)[:, 1] < 0.93) & ~past[TA].any(1)]
      MA = bl.laplacian(len(A), TA)
      A = bl.smooth(A, MA, passes=1, amount=0.5)
      remade = np.zeros(len(A), bool)
      if sex == 'male':
          # a man has no hanging breast: hers taken off, the rib cage under them carried across (malechest.py)
          A, remade = malechest.without_breasts(A, TA, b['J']['neck'][0])
      # (what the mesh is drawn onto, for emaciateddetail.py: her sculpt as it stands here, and which of its points were remade)
      np.savez(f'{bl.S}/remodel/E0pre-{sex}-sculpt.npz', A=A, T=TA, remade=remade)
      pts, nrm = nricp.sample_surface(A, TA)
      free = border_rings(len(V0), T, 2)
      X = nricp.register(V0, T, pts, nrm, weight=(~free).astype(float), steps=((30, 4), (10, 4), (3, 5), (1, 5), (0.3, 5), (0.1, 5), (0.03, 5)))
      # relaxed over its own surface and set back on hers, so its points stay evenly spread
      M = bl.laplacian(len(X), T); tree = cKDTree(pts)
      for _ in range(3):
          Y = bl.smooth(X, M, passes=1, amount=0.5)
          N = bl.normals(Y, T); d, idx = tree.query(Y, k=6)
          ok = (np.einsum('ikj,ij->ik', nrm[idx], N) > 0.2) & (d < 0.03)
          c = pts[idx[np.arange(len(Y)), np.argmax(ok, 1)]]
          X = np.where((ok.any(1) & ~free)[:, None], c, Y)
      # (the mesh on her, each side its own: emaciateddetail.py follows a texel onto her sculpt by it)
      np.save(f'{bl.S}/remodel/E0pre-{sex}.npy', X)
      X = V0 + mirror_mean(V0, X - V0)
      X = bl.smooth(X, M, passes=1, amount=0.5)
      np.save(f'{bl.S}/remodel/E0-{sex}.npy', X)
      print(sex, 'volume', bl.volume(V0, T), '->', bl.volume(X, T))
