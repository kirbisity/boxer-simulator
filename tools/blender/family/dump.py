# The family's targets as JSON for tools/basebody-family.js: each sex's base and its builds, points in the game's frame (units
# of height), in the full mesh's own order.
import json, sys
import numpy as np
import bodylib as bl
out = {}
for sex in ('female', 'male'):
    b = bl.load(sex)
    out[sex] = {'base': np.round(b['V'], 6).ravel().tolist()}
    for name in ('E', 'N', 'M', 'F1', 'F2', 'F3'):
        out[sex][name] = np.round(np.load(f'{sys.argv[2] if len(sys.argv) > 2 else "reg"}/{name}-{sex}.npy'), 6).ravel().tolist()
json.dump(out, open(sys.argv[1], 'w'))
