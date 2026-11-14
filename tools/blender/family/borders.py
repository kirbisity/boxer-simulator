# Each build's open borders (neck, wrists, ankles) against the base's: the ring's middle moved (thousandths of height) and its radius ratio.
import numpy as np, bodylib as bl
def loops(T):
    e = np.concatenate([T[:, [0, 1]], T[:, [1, 2]], T[:, [2, 0]]]); s = np.sort(e, axis=1)
    u, c = np.unique(s, axis=0, return_counts=True); b = u[c == 1]
    nxt = {}; 
    for a, d in b: nxt.setdefault(a, []).append(d); nxt.setdefault(d, []).append(a)
    seen = set(); out = []
    for start in nxt:
        if start in seen: continue
        loop = [start]; seen.add(start); stack = [start]
        while stack:
            for n in nxt[stack.pop()]:
                if n not in seen: seen.add(n); loop.append(n); stack.append(n)
        out.append(np.array(loop))
    return out
if __name__ == '__main__':
    for sex in ('male', 'female'):
        b = bl.load(sex); V = b['V']; w = bl.weld_map(V); T = w[b['T']]; T = T[(T[:, 0] != T[:, 1]) & (T[:, 1] != T[:, 2]) & (T[:, 0] != T[:, 2])]
        L = loops(T)
        print(sex, 'loops', [(len(l), np.round(V[l].mean(0), 3).tolist()) for l in L])
        for name in ('E', 'N', 'M', 'F1', 'F2', 'F3'):
            X = np.load(f'{name}-{sex}.npy'); row = []
            for l in L:
                c0, c1 = V[l].mean(0), X[l].mean(0); r0 = np.linalg.norm(V[l] - c0, axis=1).mean(); r1 = np.linalg.norm(X[l] - c1, axis=1).mean()
                row.append(f'{np.round((c1 - c0) * 1000, 1).tolist()} r×{r1 / r0:.2f}')
            print(' ', name, ' | '.join(row))
