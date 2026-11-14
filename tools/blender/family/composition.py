# Each build's place in the (fat mass index, fat-free mass index) plane, kg/m2, for loftbody.js LOFT.family: its BMI by its own
# volume at the model's height (the mesh has no head, hands or feet: REST, a tenth of an ordinary body's mass, Winter 2009's
# segment table: head 6%, hands 1.2%, feet 2.9%; density by Siri's two compartments, fat 0.9 and lean 1.1 kg/L), its fat share
# Deurenberg, Weststrate and Seidell's 1991 line at age 30 (1.2 BMI + 0.23 age - 10.8 male - 5.4) for the ordinary and the fat
# builds, and stated for the muscular (the man's the game's reference build's own 11%; an athletic woman's 20%) and the
# emaciated (5% and 9%: essential fat nearly gone).
import numpy as np
import bodylib as bl
HEIGHT = {'male': 1.80, 'female': 1.68}
REST = 2.2
STATED = {'male': {'M': 0.11, 'E': 0.05}, 'female': {'M': 0.20, 'E': 0.09}}
def closed_volume(V, T):
    """The mesh's volume with its openings (neck, wrists, ankles) capped flat: each boundary loop fanned from its centre."""
    edges = {}
    for tri in T:
        for a, c in ((tri[0], tri[1]), (tri[1], tri[2]), (tri[2], tri[0])): edges[(a, c)] = True
    after = {a: c for (a, c) in edges if (c, a) not in edges}
    total = np.einsum('ij,ij->i', V[T[:, 0]], np.cross(V[T[:, 1]], V[T[:, 2]])).sum()
    seen = set()
    for start in after:
        if start in seen: continue
        loop = [start]
        while after[loop[-1]] != start: loop.append(after[loop[-1]])
        seen.update(loop)
        P = V[loop]; centre = P.mean(0)
        # (The cap runs against the boundary's own direction, to face out.)
        total += np.einsum('ij,ij->i', np.roll(P, -1, 0), np.cross(P, centre[None])).sum()
    return abs(total) / 6

if __name__ == '__main__':
    for sex in ('male', 'female'):
        b = bl.load(sex)
        row = {}
        for name in ('E', 'N', 'M', 'F1', 'F2', 'F3'):
            v = closed_volume(np.load(f'{name}-{sex}.npy'), b['T'])
            fat = STATED[sex].get(name, 0.2)
            for _ in range(30):
                bmi = v * HEIGHT[sex] * 1000 / (fat / 0.9 + (1 - fat) / 1.1) + REST
                if name not in STATED[sex]: fat = (1.2 * bmi + 0.23 * 30 - 10.8 * (sex == 'male') - 5.4) / 100
            row[name] = [round(bmi * fat, 2), round(bmi * (1 - fat), 2)]
            print(sex, name, 'volume', round(v, 5), 'bmi', round(bmi, 1), 'fat', round(fat, 3), row[name])
        print(sex, row)
