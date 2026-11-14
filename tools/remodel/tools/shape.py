# python3 shape.py <family scripts dir> <out dir> rise keep deltoid slim : girdle.py's last step with these dials (run from <work>/remodel).
import sys, os, numpy as np
args = sys.argv[1:]; sys.argv = sys.argv[:1]
sys.path.insert(0, args[0])
import bodylib as bl, girdle as g
out = args[1]; rise, keep, deltoid, slim = map(float, args[2:6])
g.GIRDLE['rise'] = rise; g.TRAPEZIUS['keep'] = keep; g.DELTOID['keep'] = deltoid; g.NECK['slim'] = slim
os.makedirs(out, exist_ok=True)
for sex in ('female', 'male'):
    b = bl.load(sex)
    for name in ('E', 'N', 'M', 'F1', 'F2', 'F3'):
        V = np.load(f'even/{name}-{sex}.npy'); X = (g.girdle if name == 'E' else g.top_line)(V, b['J'], np.asarray(b['T']), b['V'])
        if name == 'E': X = g.arms(g.waist(X, np.asarray(b['part']) == b['parts'].index('trunk')), b)
        X = g.column(X, b['J'])
        np.save(f'{out}/{name}-{sex}.npy', X)
