# The emaciated man. Her sculpt drawn on his points (E0) keeps a woman's frame: narrow shoulders, a broad pelvis. Wasting takes
# the same share of soft tissue from either sex and leaves the bones, so his tape reads hers times the ratio by which men's
# measures differ from women's at the lean end of ANSUR (BMI 19.5, inside both samples).
import numpy as np, bodylib as bl, fit
LEAN_END = 19.5
b = bl.load('male'); f = fit.Fit(b, np.load('E0-male.npy'), fat=False)
her = fit.Fit(bl.load('female'), np.load('E0-female.npy'), fat=False); hers = her.read(her.V0)
m, w = fit.tape_at('male', LEAN_END), fit.tape_at('female', LEAN_END)
target = {k: hers[k] * m[k] / w[k] for k in fit.TAPE}; target['wristcircumference'] = f.read(f.V0)['wristcircumference']
a = f.solve(target, log=True); fit.report(f, a, target); print({n: round(v, 3) for n, v in zip(f.names, a)})
np.save('E-male.npy', f.shape(a)); np.save('E-female.npy', her.V0)
