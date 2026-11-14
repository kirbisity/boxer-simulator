# The builds' limbs set on the base's bones. A build is a body of another kind on the same skeleton: fat and muscle do not move
# a bone, so where a limb is all bone under the skin (elbow, wrist, knee, ankle, the neck's top) its section's middle is where
# the base's is. The sculpt and the tape fits do not hold to that (the emaciated sculpt's arm hangs 4 cm further back and ends
# 3.5 cm higher than the base's; the tape fits spread the wrist's cut ring 9 thousandths sideways), so each chain is moved back:
# a correction that is nothing at its root (the trunk is left alone), the joint's own miss at the joint and the open ring's
# miss at the limb's end, straight between.
# The emaciated build is drawn on a sculpt, and its shoulders are the sculpt's: set 4 cm behind the base's shoulder joints and
# 1 cm inside them, so an arm raised about the joint swung the whole shoulder up and back with it (in the guard
# the emaciated shoulder stood too high, a round tube). A wasted arm is its bone and little else: its section's middle runs
# beside the bone's line as the base's does at the elbow. So that build's arms and shoulder girdles are first moved whole onto
# the joints (root_field), by the model's own bone-heat weights: the arm all of it, the collarbone's share by how far out along
# it, the trunk none.
import sys, numpy as np, bodylib as bl
from centre2 import middle
from borders import loops

CHAINS = {'arm': ('Shoulder', 'Elbow', 'Hand', 'Upper', 'Fore'), 'leg': ('Hip', 'Knee', 'Foot', 'Thigh', 'Shin')}
# Where the joint's section is read: this share of the way down the upper part and into the lower one.
NEAR = (0.9, 0.1)
# The builds drawn on a sculpt (their shoulders set on the joints first), and where down the upper arm its section is read for
# that: the first closed ring under the armpit.
SCULPTED = ('E',)
ROOT = 0.3

def root_field(b, V, X, T, side):
    """Each point's move to set one arm's root on its shoulder joint (zeros off the arm and its girdle), and the miss."""
    J = b['J']; a, m = J[side + 'Shoulder'], J[side + 'Elbow']; L = np.linalg.norm(m - a); ax = (m - a) / L
    on = (b['part'] == b['parts'].index(side + 'Upper')) | (b['part'] == b['parts'].index(side + 'Fore'))
    across = lambda d: d - ax * (d @ ax)
    own = across(middle(bl.ring_at(X, T, a + ax * ROOT * L, ax), ax)[0] - a)
    bone = across(middle(bl.section(V, T, a + ax * NEAR[0] * L, ax, on), ax)[0] - a)
    W = b['W']; at = b['bones'].index
    out = np.clip(V[:, 2] / a[2], 0, 1)
    share = W[:, at(side + 'UpperArm')] + W[:, at(side + 'Forearm')] + W[:, at(side + 'Clavicle')] * out
    return -share[:, None] * (own - bone), own - bone

def chain_field(b, V, X, T, side, kind, ring):
    """Each point's correction for one limb (zeros off it)."""
    root, mid, end, upper, lower = (side + n for n in CHAINS[kind])
    J = b['J']; pu, pl = b['parts'].index(upper), b['parts'].index(lower)
    a, m, e = J[root], J[mid], J[end]
    au, al = (m - a) / np.linalg.norm(m - a), (e - m) / np.linalg.norm(e - m); Lu, Ll = np.linalg.norm(m - a), np.linalg.norm(e - m)
    on = (b['part'] == pu) | (b['part'] == pl)
    miss = []
    for o, ax in ((a + au * NEAR[0] * Lu, au), (m + al * NEAR[1] * Ll, al)):
        P0, P1 = bl.section(V, T, o, ax, on), bl.section(X, T, o, ax, on)
        d = middle(P1, ax)[0] - middle(P0, ax)[0]; miss.append(d - ax * (d @ ax))
    d_mid = np.mean(miss, 0)
    d_end = X[ring].mean(0) - V[ring].mean(0)
    t_end = ((V[ring].mean(0) - m) @ al) / Ll
    tu = np.clip(((V - a) @ au) / Lu, 0, 1); tl = np.clip(((V - m) @ al) / Ll, 0, t_end) / t_end
    c_up = -tu[:, None] * d_mid; c_low = -(d_mid + tl[:, None] * (d_end - d_mid))
    share = lambda p: np.where(b['part'] == p, 1 - b['blend'] * (b['part2'] != p), b['blend'] * (b['part2'] == p))
    return share(pu)[:, None] * c_up + share(pl)[:, None] * c_low, d_mid, d_end

def neck_field(b, V, X, ring):
    J = b['J']; a, e = J['neck'], J['head']; ax = (e - a) / np.linalg.norm(e - a); L = np.linalg.norm(e - a); p = b['parts'].index('neck')
    d_end = X[ring].mean(0) - V[ring].mean(0); t_end = ((V[ring].mean(0) - a) @ ax) / L
    t = np.clip(((V - a) @ ax) / L, 0, t_end) / t_end
    share = np.where(b['part'] == p, 1 - b['blend'] * (b['part2'] != p), b['blend'] * (b['part2'] == p))
    return -(share * t)[:, None] * d_end, d_end

if __name__ == '__main__':
    for sex in ('male', 'female'):
        b = bl.load(sex); V, T = b['V'], b['T']; w = bl.weld_map(V); TW = w[T]; TW = TW[(TW[:, 0] != TW[:, 1]) & (TW[:, 1] != TW[:, 2]) & (TW[:, 0] != TW[:, 2])]
        rings = {}
        for l in loops(TW):
            c = V[l].mean(0); name = min(('head', 'lHand', 'rHand', 'lFoot', 'rFoot'), key=lambda n: np.linalg.norm(b['J'][n] - c)); rings[name] = np.flatnonzero(np.isin(w, l))
        for name in ('E', 'N', 'M', 'F1', 'F2', 'F3'):
            X = np.load(f'{name}-{sex}.npy'); C = np.zeros_like(X); notes = []
            if name in SCULPTED:
                for side in 'lr':
                    c, d = root_field(b, V, X, T, side); X = X + c[w]
                    if side == 'l': notes.append(f'arm root {np.round(d * 1000).astype(int).tolist()}')
            for side in 'lr':
                for kind in CHAINS:
                    c, d_mid, d_end = chain_field(b, V, X, T, side, kind, rings[side + CHAINS[kind][2]]); C += c
                    if side == 'l': notes.append(f'{kind} joint {np.round(d_mid * 1000).astype(int).tolist()} end {np.round(d_end * 1000).astype(int).tolist()}')
            c, d_end = neck_field(b, V, X, rings['head']); C += c; notes.append(f'neck top {np.round(d_end * 1000).astype(int).tolist()}')
            # (the seams' doubled points move as one)
            C = C[w]
            np.save(f'reg/{name}-{sex}.npy', X + C); print(sex, name, ' | '.join(notes))
