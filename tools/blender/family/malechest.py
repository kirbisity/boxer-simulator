# A man's chest out of her sculpt: her hanging breasts taken off and the rib cage under them carried across.
import numpy as np
from scipy.sparse import identity
from scipy.sparse.linalg import spsolve
import bodylib as bl

CHEST = {
    # Where a breast can be, units of height: up the body, in front of the neck's joint by this, and this far to either side.
    'up': (0.64, 0.775), 'front': 0.01, 'across': 0.105,
    # A point is of a breast (its mound, or the fold under it) where her skin stands this far off the cage carried across
    # under it (4 mm at 1.68 m: her ribs stand 2 to 3 off their own grooves), and the rings of points round those taken too.
    'off': 0.0024, 'rings': 2, 'rounds': 3,
}

def carried(A, M, hole):
    """The surface carried across a hole as a thin plate would lie (its bending least): the points round it stay."""
    L = (M - identity(len(A))).tocsr(); B = (L @ L).tocsr()
    inside = np.flatnonzero(hole); outside = np.flatnonzero(~hole)
    X = A.copy()
    X[inside] = np.column_stack([spsolve(B[inside][:, inside].tocsc(), -(B[inside][:, outside] @ A[outside, k])) for k in range(3)])
    return X

def grown(mask, T, rings):
    e = bl.edges_of(T)
    for _ in range(rings):
        more = mask.copy(); more[e[mask[e[:, 1]], 0]] = True; more[e[mask[e[:, 0]], 1]] = True; mask = more
    return mask

def without_breasts(A, T, neck_front):
    """(her sculpt with a man's chest, which of its points were remade)."""
    M = bl.laplacian(len(A), T)
    used = np.zeros(len(A), bool); used[np.unique(T)] = True
    box = used & (A[:, 1] > CHEST['up'][0]) & (A[:, 1] < CHEST['up'][1]) & (A[:, 0] > neck_front + CHEST['front']) & (np.abs(A[:, 2]) < CHEST['across'])
    hole = box
    for _ in range(CHEST['rounds']):
        cage = carried(A, M, hole)
        off = np.einsum('ij,ij->i', A - cage, bl.normals(cage, T))
        hole = box & grown(box & (np.abs(off) > CHEST['off']), T, CHEST['rings'])
    return carried(A, M, hole), hole
