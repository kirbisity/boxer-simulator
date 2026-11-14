# The average woman on the game's own points. The reference 'Body' stands with her arms and legs wider than the game's bind
# pose and her rig cannot pose her, so the game's base is posed to HER by its own skin weights, drawn onto her there, and
# returned to the bind pose by the same weights.
import json, numpy as np, bodylib as bl, nricp
from scipy.spatial import cKDTree
from regE import border_rings, mirror_mean

def warp(P, src, dst):
    """A smooth warp taking the landmarks `src` onto `dst` (biharmonic spline r, with a linear part)."""
    n = len(src); K = np.linalg.norm(src[:, None] - src[None], axis=2)
    Q = np.c_[np.ones(n), src]
    A = np.block([[K, Q], [Q.T, np.zeros((4, 4))]])
    c = np.linalg.solve(A, np.r_[dst - src, np.zeros((4, 3))])
    return P + np.linalg.norm(P[:, None] - src[None], axis=2) @ c[:n] + np.c_[np.ones(len(P)), P] @ c[n:]

def crotch(V):
    """The lowest point of the trunk on the middle line."""
    m = (np.abs(V[:, 2]) < 0.006) & (V[:, 1] > 0.4) & (V[:, 1] < 0.56)
    i = np.where(m)[0][np.argmin(V[m, 1])]; return np.array([V[i, 0], V[i, 1], 0.0])

def capsule(P, a, c):
    d = c - a; t = np.clip((P - a) @ d / (d @ d), 0, 1); return np.linalg.norm(P - (a + t[:, None] * d), axis=1)

def limb_labels(P, J):
    """0 trunk, 1/2 left/right arm, 3/4 left/right leg: the nearest bone's, each bone given its usual thickness."""
    far = lambda a, c, k: c + (c - a) * k
    dist = [np.minimum(capsule(P, np.array([J['pelvis'][0], 0.5, 0]), np.array([J['neck'][0], 0.95, 0])) - 0.085,
                       capsule(P, J['lHip'] * [1, 1, 1.6], J['rHip'] * [1, 1, 1.6]) - 0.075)]
    for s in 'lr':
        dist.append(np.minimum(capsule(P, J[s + 'Shoulder'], J[s + 'Elbow']), capsule(P, J[s + 'Elbow'], far(J[s + 'Elbow'], J[s + 'Hand'], 0.6))) - 0.03)
    for s in 'lr':
        dist.append(np.minimum(capsule(P, J[s + 'Hip'] + (J[s + 'Knee'] - J[s + 'Hip']) * 0.25, J[s + 'Knee']), capsule(P, J[s + 'Knee'], far(J[s + 'Knee'], J[s + 'Foot'], 0.3))) - 0.045)
    return np.argmin(np.stack(dist, 1), 1)

if __name__ == '__main__':
    b = bl.load('female'); V0, T = b['V'], b['T']; J = b['J']
    z = np.load('body-rest.npz'); A, TA = z['V'].astype(float), z['T']; Jb = {k: np.array(v) for k, v in json.loads(str(z['joints'])).items()}
    # the game's skeleton with its limbs along hers
    aims = {}
    for s in 'lr':
        aims[s + 'UpperArm'] = Jb[s + 'Shoulder'] + (Jb[s + 'Elbow'] - Jb[s + 'Shoulder']) * (0.162 / 0.127) - J[s + 'Shoulder']; aims[s + 'Forearm'] = Jb[s + 'Hand'] - Jb[s + 'Elbow']
        aims[s + 'Thigh'] = Jb[s + 'Knee'] - J[s + 'Hip']; aims[s + 'Shin'] = Jb[s + 'Foot'] - Jb[s + 'Knee']
    M, Jp = bl.limb_pose(b, aims)
    B = bl.blend_matrices(b, M); Vp = bl.skin(B, V0)
    # her joints warped onto that skeleton's (her limbs are shorter for her height), her crotch onto the base's, head and floor kept
    names = [s + k for s in 'lr' for k in ('Shoulder', 'Elbow', 'Hand', 'Knee', 'Foot')]
    keep = [[A[np.argmax(A[:, 1]), 0], 1, 0], [0, 0, 0.07], [0, 0, -0.07]]
    src = np.array([Jb[k] for k in names] + [crotch(A)] + keep); dst = np.array([Jb[k] if 'Shoulder' in k else Jp[k] for k in names] + [crotch(V0)] + keep)
    print('crotch hers', crotch(A).round(3), 'base', crotch(V0).round(3))
    A = warp(A, src, dst)
    # without her head and hands
    past = np.zeros(len(A), bool)
    for s in 'lr':
        e, h = Jp[s + 'Elbow'], Jp[s + 'Hand']; u = (h - e) / np.linalg.norm(h - e)
        along = (A - h) @ u; off = np.linalg.norm((A - h) - along[:, None] * u, axis=1); past |= (along > 0.004) & (off < 0.012 + along)
    TA = TA[(A[TA].max(1)[:, 1] < 0.905) & ~past[TA].any(1)]
    np.savez('body-aligned.npz', V=A, T=TA, Vp=Vp)
    pts, nrm = nricp.sample_surface(A, TA)
    plabel = limb_labels(pts, Jp)
    P = b['parts']; part, part2, blend = b['part'], b['part2'], b['blend']
    group_of = {'trunk': 0, 'neck': 0, 'lUpper': 1, 'lFore': 1, 'rUpper': 2, 'rFore': 2, 'lThigh': 3, 'lShin': 3, 'rThigh': 4, 'rShin': 4}
    g1 = np.array([group_of[P[p]] for p in part]); g2 = np.array([group_of[P[p]] for p in part2])
    allowed = np.zeros((len(V0), 5), bool); allowed[np.arange(len(V0)), g1] = True
    mix = (blend > 0.1) & (blend < 0.9); allowed[np.where(mix)[0], g2[mix]] = True
    free = border_rings(len(V0), T, 2)
    Xp = nricp.register(Vp, T, pts, nrm, weight=(~free).astype(float), target_label=plabel, allowed=allowed, reach=0.07,
                        steps=((30, 4), (10, 4), (3, 5), (1, 5), (0.3, 5), (0.1, 5), (0.03, 4)))
    X = bl.skin(B, Xp, back=True)
    M_ = bl.laplacian(len(X), T)
    X = V0 + mirror_mean(V0, X - V0)
    X = bl.smooth(X, M_, passes=1, amount=0.5)
    np.save('N0-female.npy', X); np.save('N0p-female.npy', Xp)
    print('volume', bl.volume(V0, T), '->', bl.volume(X, T))
