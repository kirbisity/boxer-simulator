# One fitting machine for every build. A body is its starting surface plus a layer of tissue whose thickness varies smoothly
# over it: round the trunk by height and by side (front, flank, back), along each limb by its length. The layer's thickness is
# solved so a tape on the result reads what ANSUR II's soldiers read at the wanted BMI. A thick layer then behaves as fat does:
# it hides the relief under it, hangs under its own weight, and flattens where the thighs meet.
import numpy as np, bodylib as bl

# Heights (of standing height) at which the trunk's layer has a value of its own, straight lines between: crotch, buttock
# (ANSUR 0.51), lower belly, waist at the navel (0.60), under the ribs' margin, chest (0.72 at the bust), shoulder, neck's root.
TRUNK_LEVELS = [0.47, 0.512, 0.555, 0.60, 0.66, 0.72, 0.775, 0.83]
# Places along each limb's bone (0 at its root, 1 at its end) with a value of their own. The knee and elbow each have one value
# shared by the two bones that meet there.
THIGH, SHIN, UPPER, FORE = [0.0, 0.3, 0.6, 0.85], [0.3, 0.65, 0.92], [0.0, 0.5], [0.3, 0.65, 0.92]
# Of a level's growth in depth, the share that goes on at the back (the rest goes on in front). Fat in front of the belly lies
# both under the skin and inside the wall (the viscera's), on the loins only under the skin over the erectors' fascia; the
# buttock's is behind; the chest's is shared by the breast and the pad under the shoulder blade. Skinfold sites agree in kind
# (abdomen about twice the subscapular in the fat: Durnin & Womersley 1974), no survey gives the split of depth itself.
BACK_SHARE = [0.5, 0.65, 0.3, 0.2, 0.25, 0.35, 0.4, 0.5]
# A soft layer of depth t hanging on a wall sags by rho g t^2 / (2 G): fat's density 900 kg/m3 and a shear stiffness near 2 kPa
# (subcutaneous fat in vivo, 1-3 kPa) give 2.2 per metre, 4 per standing height of 1.8 m.
SAG = 4.0
# The layer hides what lies under it: at this thickness (5 cm) the surface relief below is fully smoothed over.
HIDE = 0.028
# Passes of smoothing each unknown's push gets over the mesh (edges of 2.5 cm: three passes reach about 5 cm)
SPREAD = 3
THIGH_GAP = 0.0012     # the thighs press flat against each other, they do not pass through

def hats(x, knots):
    """Each knot's tent over x (flat beyond the end knots): the columns sum to one."""
    k = np.asarray(knots, float); x = np.clip(x, k[0], k[-1]); out = np.zeros((len(x), len(k)))
    i = np.clip(np.searchsorted(k, x, side='right') - 1, 0, len(k) - 2); f = (x - k[i]) / (k[i + 1] - k[i])
    out[np.arange(len(x)), i] = 1 - f; out[np.arange(len(x)), i + 1] = f
    return out

def frame(b, V):
    """The directions each unknown moves the points in: `D` (unknowns x points x 3), with the unknowns' names."""
    J, W, bones = b['J'], b['W'], b['bones']; n = len(V); w = lambda *k: sum(W[:, bones.index(x)] for x in k)
    names, D = [], []
    # trunk: straight out from the spine's line, level
    ax = J['pelvis'][0] + (J['neck'][0] - J['pelvis'][0]) * np.clip((V[:, 1] - J['pelvis'][1]) / (J['neck'][1] - J['pelvis'][1]), 0, 1)
    out = np.stack([V[:, 0] - ax, 0 * ax, V[:, 2]], 1); rho = np.linalg.norm(out, axis=1); r = out / np.maximum(rho, 1e-4)[:, None]
    c = r[:, 0] * np.minimum(1, rho / 0.02)
    lobes = {'front': np.maximum(c, 0) ** 2, 'back': np.maximum(-c, 0) ** 2, 'side': 1 - c ** 2}
    H = hats(V[:, 1], TRUNK_LEVELS); g = w('trunk', 'lClavicle', 'rClavicle')
    for i, y in enumerate(TRUNK_LEVELS):
        for side, L in lobes.items():
            names.append(f'trunk {y} {side}'); D.append((g * H[:, i] * L)[:, None] * r)
    def radial(a, c_):
        d = c_ - a; t = (V - a) @ d / (d @ d); off = V - (a + t[:, None] * d); return t, off / np.maximum(np.linalg.norm(off, axis=1), 1e-4)[:, None]
    t, rn = radial(J['neck'], J['head']); names.append('neck'); D.append(w('neck')[:, None] * rn)
    limb = {}
    for s in 'lr':
        for bone, a, c_ in (('UpperArm', 'Shoulder', 'Elbow'), ('Forearm', 'Elbow', 'Hand'), ('Thigh', 'Hip', 'Knee'), ('Shin', 'Knee', 'Foot')):
            t, rn = radial(J[s + a], J[s + c_]); limb[s + bone] = (t, w(s + bone)[:, None] * rn)
    def along(label, bone, knots, joint_before=None, joint_after=None):
        # the knots' tents along this bone on both sides at once; the joints' shared values take the ends
        full = ([0.0] if joint_before else []) + knots + ([1.0] if joint_after else [])
        cols = {}
        for s in 'lr':
            t, R = limb[s + bone]; Hh = hats(t, full)
            for i, k in enumerate(full):
                key = joint_before if (joint_before and i == 0) else joint_after if (joint_after and i == len(full) - 1) else f'{label} {k}'
                cols[key] = cols.get(key, 0) + Hh[:, i][:, None] * R
        return cols
    cols = {}
    for part in (along('thigh', 'Thigh', THIGH, None, 'knee'), along('shin', 'Shin', SHIN, 'knee', None),
                 along('upper arm', 'UpperArm', UPPER, None, 'elbow'), along('forearm', 'Forearm', FORE, 'elbow', None)):
        for k, v in part.items(): cols[k] = cols.get(k, 0) + v
    for k, v in cols.items(): names.append(k); D.append(v)
    # the shoulders' height: their tops (out from the neck, above the armpit) lift or drop together
    az = np.abs(V[:, 2]); ramp = lambda x, a, c_: np.clip((x - a) / (c_ - a), 0, 1) ** 2 * (3 - 2 * np.clip((x - a) / (c_ - a), 0, 1))
    names.append('shoulder height'); D.append((ramp(az, 0.035, 0.10) * ramp(V[:, 1], 0.72, 0.79))[:, None] * np.array([0, 1.0, 0]))
    return names, np.array(D)

class Fit:
    def __init__(self, b, V0, fat=True, cover=0.0):
        """`fat`: the layer behaves as fat (hangs, hides relief). `cover`: a thin even coat of fat over the whole start surface
        that changes no girth to speak of but hides relief like the layer does (a lean athlete's body turned an ordinary one)."""
        self.b, self.V0, self.fat, self.cover = b, V0, fat, cover
        self.names, self.D = frame(b, V0); self.M = bl.laplacian(len(V0), b['T'])
        # each unknown's push spreads a little over the surface, so where one bone's skin meets another's (the armpit, the
        # groin) the layer thins out across the seam rather than shearing along it
        self.D = np.array([bl.smooth(d, self.M, passes=SPREAD, amount=0.5) for d in self.D])
        W, bones = b['W'], b['bones']; leg = sum(W[:, bones.index(k)] for k in ('lThigh', 'lShin', 'rThigh', 'rShin'))
        self.leg = leg > 0.5; self.sign = np.sign(V0[:, 2]); self.down = self._arms_down()
        self.layer = np.array([n != 'shoulder height' for n in self.names])
    def _arms_down(self):
        Mx, _ = bl.limb_pose(self.b, {s + 'UpperArm': np.array([0, -1.0, 0]) for s in 'lr'}); return bl.blend_matrices(self.b, Mx)
    def thickness(self, a):
        """The layer's depth at each point (outward positive)."""
        return np.einsum('k,kn->n', a[self.layer], np.linalg.norm(self.D[self.layer], axis=2))
    def shape(self, a):
        V = self.V0 + np.einsum('k,knj->nj', a, self.D)
        t = np.maximum(self.thickness(a), 0) if self.fat else np.zeros(len(V))
        if self.fat: V = V - np.array([0, 1.0, 0]) * (SAG * bl.smooth(t, self.M, 2) ** 2)[:, None]
        if self.fat or self.cover: V = bl.smooth(V, self.M, passes=6, amount=0.5, weight=np.clip((t + self.cover) / HIDE, 0, 1))
        z = V[:, 2] * self.sign; m = self.leg & (z < THIGH_GAP) & (np.abs(self.V0[:, 2]) > THIGH_GAP)
        V[m, 2] = self.sign[m] * THIGH_GAP
        return V
    def read(self, V, quick=True):
        m = bl.measure(self.b, V, quick=quick)
        Vd = bl.skin(self.down, V); part, P = self.b['part'], self.b['parts']
        cap = np.isin(part, [P.index(k) for k in ('trunk', 'neck', 'lUpper', 'rUpper')]) & (Vd[:, 1] > 0.70) & (Vd[:, 1] < 0.80)
        m['bideltoidbreadth'] = 2 * np.abs(Vd[cap, 2]).max()      # ANSUR's stand with the arms at the sides
        return m
    def solve(self, target, rounds=8, smooth=0.6, slope=0.2, prior=0.5, small=0.03, log=False):
        """The layer for which the tape reads `target` ({measure: value}); returns the unknowns. The layer is held smooth: along
        the trunk's height on each side, round it from side to side, and along each limb (a tape reads only a few levels, and
        between them the layer runs on evenly rather than swinging)."""
        keys = [k for k in target if not np.isnan(target[k])]
        scale = np.array([0.02 if k == 'acromialheight' else target[k] for k in keys]); goal = np.array([target[k] for k in keys])
        wt = np.array([1.0 if 'circumference' in k else 0.7 for k in keys])
        def res(a):
            m = self.read(self.shape(a)); return (np.array([m[k] for k in keys]) - goal) / scale * wt
        K = len(self.names); rows = []; at = self.names.index
        def chain(idx):
            for j in range(1, len(idx) - 1):
                r = np.zeros(K); r[idx[j - 1]], r[idx[j]], r[idx[j + 1]] = 1, -2, 1; rows.append(r * smooth)
            for j in range(1, len(idx)):
                r = np.zeros(K); r[idx[j - 1]], r[idx[j]] = 1, -1; rows.append(r * slope)
        for side in ('front', 'back', 'side'): chain([at(f'trunk {y} {side}') for y in TRUNK_LEVELS])
        chain([at(f'thigh {k}') for k in THIGH] + [at('knee')] + [at(f'shin {k}') for k in SHIN])
        chain([at(f'upper arm {k}') for k in UPPER] + [at('elbow')] + [at(f'forearm {k}') for k in FORE])
        for i, y in enumerate(TRUNK_LEVELS):
            f, k, sd = at(f'trunk {y} front'), at(f'trunk {y} back'), at(f'trunk {y} side'); s = BACK_SHARE[i] if self.fat else 0.5
            r = np.zeros(K); r[k] = 1 - s; r[f] = -s; rows.append(r * prior)              # front and back share the depth as fat does
            r = np.zeros(K); r[sd] = 1; r[f] = r[k] = -0.5; rows.append(r * slope)        # the flank's layer near the mean of the two
        r = np.zeros(K); r[at('shoulder height')] = 1; rows.append(r)
        r = np.zeros(K); r[at('upper arm 0.0')] = 1; r[at(f'trunk 0.775 side')] = -1; rows.append(r * slope)   # the deltoid's layer runs on from the shoulder's
        R = np.vstack(rows + [np.eye(K) * small])
        cost = lambda a, r: (r ** 2).sum() + ((R @ a) ** 2).sum()
        a = np.zeros(K); r0 = res(a); c0 = cost(a, r0); mu = 0.3
        for it in range(rounds):
            Jm = np.zeros((len(keys), K)); h = 0.003
            for k in range(K):
                e = np.zeros(K); e[k] = h; Jm[:, k] = (res(a + e) - r0) / h
            for attempt in range(6):          # Levenberg-Marquardt: a shorter step when the full one does not pay
                A = np.vstack([Jm, R, np.eye(K) * mu]); y = np.r_[-r0, -R @ a, np.zeros(K)]
                step = np.linalg.lstsq(A, y, rcond=None)[0]; new = a + step
                if self.fat: new[self.layer] = np.maximum(new[self.layer], 0)     # fat is added to a body, never dug out of it
                r1 = res(new); c1 = cost(new, r1)
                if c1 < c0: a, r0, c0, mu = new, r1, c1, mu * 0.4; break
                mu *= 4
            if log: print(it, 'cost %.5f' % c0, 'misfit', np.abs(r0).max().round(4), 'mu', round(mu, 3))
            if attempt == 5: break
        return a

def report(f, a, target):
    m = f.read(f.shape(a), quick=False)
    print('  ' + '  '.join(f"{k.replace('circumference', 'C').replace('breadth', 'B').replace('depth', 'D')} {m[k]:.3f}/{target[k]:.3f}" for k in target if k in m))
    print('  axilla %.3f volume %.5f' % (m['axillaheight'], m['volume']))

TAPE = ['chestcircumference', 'chestdepth', 'waistcircumference', 'waistbreadth', 'waistdepth', 'buttockcircumference', 'buttockdepth',
        'hipbreadth', 'thighcircumference', 'lowerthighcircumference', 'calfcircumference', 'anklecircumference', 'bicepscircumference',
        'forearmcircumference', 'wristcircumference', 'neckcircumference', 'acromialheight', 'bideltoidbreadth']
# ANSUR's chest breadth is left out: its calliper sits on the rib cage inside the latissimus, so it is not the breadth of the
# section the tape goes round (the men's tape reads 97% of the box breadth x depth, which no one section can do).
def tape_at(sex, bmi):
    a = bl.ansur_at(sex, bmi); return {k: a[k] for k in TAPE}
def tape_for(f, sex, bmi, lean):
    """The tape at `bmi` for a fit that starts from a body at `lean`. The wrist is bone under skin, and the start surface's own
    is kept (it is where the hand joins): ANSUR says only how much it thickens with the build."""
    t = tape_at(sex, bmi); own = f.read(f.V0)['wristcircumference']
    t['wristcircumference'] = own * t['wristcircumference'] / tape_at(sex, lean)['wristcircumference']
    return t

# A trained, dieted physique carries 3-4 mm of fat under the skin, an ordinary young man 10-12 mm (abdominal and subscapular
# skinfolds halved: Durnin & Womersley 1974): the difference, of standing height.
MALE_COVER = 0.0045

if __name__ == '__main__':
    import sys
    sex = sys.argv[1]; b = bl.load(sex)
    if sex == 'female': start, lean, cover = np.load('N0-female.npy'), 21.5, 0.0
    else: start, lean, cover = b['V'], 22.5, MALE_COVER
    if 'N' in sys.argv[2:]:
        f = Fit(b, start, fat=False, cover=cover); t = tape_for(f, sex, lean, lean); a = f.solve(t, log=True); report(f, a, t)
        print({n: round(v, 3) for n, v in zip(f.names, a)}); np.save(f'N-{sex}.npy', f.shape(a))
    N = np.load(f'N-{sex}.npy')
    for name, bmi in (('F1', 27), ('F2', 33), ('F3', 40)):
        if name not in sys.argv[2:]: continue
        f = Fit(b, N, fat=True); t = tape_for(f, sex, bmi, lean); a = f.solve(t, log=True); report(f, a, t)
        print({n: round(v, 3) for n, v in zip(f.names, a)})
        np.save(f'{name}-{sex}.npy', f.shape(a))
