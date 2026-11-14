# shaped/F4: the fattest build, the game's fattest body (physiology.js: a BMI of 100), past any tape: ANSUR II's soldiers end
# near a BMI of 40, and a fat build's step taken again and again (F3 + k (F3 - F2)) carries every point on along a straight
# line, which slides the shoulders out into a shelf and leaves the arms thin. So past F3 the body grows as fat does: each
# point out along the skin's own normal, by the share of the layer it already carries there over the ordinary build (where a
# body has put its fat it goes on putting it: the fat builds' own steps, F1 to F3, keep one pattern), the normals taken again
# each step, until the build holds the volume of that body.
import os, sys
import numpy as np
import bodylib as bl
from composition import closed_volume, HEIGHT, REST

SWELL = dict(
    bmi=100,          # the body the build is: the game's fattest
    step=0.0006,      # the most a point moves a step, statures (1 mm)
    fair=6,           # passes of smoothing on the layer's depth and on each step (the fit's layer is rough point to point)
    meet=0.002,       # the thighs meet at the mid-line and go no further: each kept this far its own side
    fold=(0.4, 0.75), # skin does not pass through skin: a point slows as its shortest edge closes to 0.75 of what it was on
                      # F3 and stops at 0.4, the bottom of a fold (under the chest, across the back, at the groin)
)

def volume_at(bmi, fat, lean, sex):
    """The trunk and limbs' volume (statures cubed) of a body of `bmi` with the fat and lean mass indices' share."""
    share = fat / (fat + lean)
    return (bmi - REST) * (share / 0.9 + (1 - share) / 1.1) / (HEIGHT[sex] * 1000)

def swell(F3, N, T, part, parts, volume, spec):
    weld = bl.weld_map(F3); TW = weld[T]; M = bl.laplacian(len(F3), TW)
    normal = lambda X: bl.normals(X, TW)[weld]
    depth = np.maximum(0, ((F3 - N) * normal(F3)).sum(1))
    depth = bl.smooth(depth[weld], M, spec['fair'])[weld]
    depth /= depth.max()
    side = np.zeros(len(F3))
    for name, sign in (('lThigh', 1), ('rThigh', -1), ('lShin', 1), ('rShin', -1)): side[part == parts.index(name)] = sign
    edges = bl.edges_of(TW); edges = edges[edges[:, 0] != edges[:, 1]]
    length = lambda X: np.linalg.norm(X[edges[:, 0]] - X[edges[:, 1]], axis=1)
    rest = length(F3)
    def open_still(X):
        closed = np.ones(len(X)); ratio = length(X) / rest
        for k in range(2): np.minimum.at(closed, edges[:, k], ratio)
        return np.clip((closed - spec['fold'][0]) / (spec['fold'][1] - spec['fold'][0]), 0, 1)
    X = F3.copy(); steps = 0
    while closed_volume(X, T) < volume:
        before = X
        move = bl.smooth((spec['step'] * depth * open_still(X))[:, None] * normal(X), M, spec['fair']) * open_still(X)[:, None]
        X = X + move[weld]
        X[:, 2] = np.where(side != 0, side * np.maximum(spec['meet'], side * X[:, 2]), X[:, 2])
        steps += 1
    # (The last step's part that lands on the volume.)
    low, high = 0.0, 1.0
    for _ in range(30):
        mid = (low + high) / 2
        if closed_volume(before + mid * (X - before), T) < volume: low = mid
        else: high = mid
    return before + high * (X - before), steps

if __name__ == '__main__':
    PLACE = {  # loftbody.js LOFT.family: F2 and F3's [fat, fat-free mass index], the line a fatter body goes on along
        'male': ([9.93, 22.97], [15.11, 24.46]), 'female': ([13.74, 19.48], [19.34, 20.19])}
    for sex in ('female', 'male'):
        b = bl.load(sex); T = np.asarray(b['T'])
        F2, F3 = (np.array(p) for p in PLACE[sex]); run = F3 - F2
        fat, lean = F3 + run * (SWELL['bmi'] - F3.sum()) / run.sum()
        volume = volume_at(SWELL['bmi'], fat, lean, sex)
        X3 = np.load(f'shaped/F3-{sex}.npy')
        X, steps = swell(X3, np.load(f'shaped/N-{sex}.npy'), T, np.asarray(b['part']), list(b['parts']), volume, SWELL)
        np.save(f'shaped/F4-{sex}.npy', X)
        # The volume of the blend from F3 to F4 is a cubic of the share exactly (every point moves in a line): its terms, for
        # loftbody.js LOFT.family.swell.
        share = np.arange(4) / 3; held = [closed_volume(X3 + s * (X - X3), T) for s in share]
        terms = np.polyfit(share, held, 3)[::-1]
        print(sex, 'fat', round(fat, 2), 'lean', round(lean, 2), 'volume', round(volume, 5), 'steps', steps, 'most', round(np.linalg.norm(X - X3, axis=1).max() * HEIGHT[sex] * 1000), 'mm',
              'swell', [float(f'{t:.4g}') for t in terms[1:]], 'from', round(terms[0], 5))
