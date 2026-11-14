# The muscular woman. Training grows the same muscles in either sex, so her tape changes as his does between his ordinary body
# (N) and his trained one (his base), by the share of a limb's section that is muscle in her. The layer is smooth: under a
# woman's thicker fat the muscles fill her out more than they show (the man's own relief is his sculpt's).
import numpy as np, bodylib as bl, fit
# A woman's limb has about 0.6 of a man's muscle section inside nearly the same girth (upper arm: Miller et al. 1993, biceps
# section 45% smaller; thigh about 30%): the same fractional growth of the muscle changes her girth about 0.6 as much.
FEMALE_MUSCLE_SHARE = 0.6
bm = bl.load('male'); fm = fit.Fit(bm, np.load('N-male.npy'), fat=False); his, trained = fm.read(fm.V0), fm.read(bm['V'])
f = fit.Fit(bl.load('female'), np.load('N-female.npy'), fat=False); hers = f.read(f.V0)
target = {k: hers[k] * (1 + FEMALE_MUSCLE_SHARE * (trained[k] / his[k] - 1)) for k in fit.TAPE}
target['wristcircumference'] = hers['wristcircumference']; target['acromialheight'] = hers['acromialheight']
a = f.solve(target, log=True); fit.report(f, a, target); print({n: round(v, 3) for n, v in zip(f.names, a)})
np.save('M-female.npy', f.shape(a)); np.save('M-male.npy', bm['V'])
