import sys, numpy as np
sys.path.insert(0, sys.argv[1])
import bodylib as bl
d = sys.argv[2] if len(sys.argv) > 2 else 'shaped'
for sex in ('female', 'male'):
    b = bl.load(sex); J = b['J']; part = np.asarray(b['part']); parts = b['parts']
    print(sex, 'parts', parts)
    print(' neck', np.round(J['neck'], 4), 'head', np.round(J['head'], 4), 'lShoulder', np.round(J['lShoulder'], 4), 'lElbow', np.round(J['lElbow'], 4), 'chest' , {k: np.round(v,3).tolist() for k, v in J.items() if k in ('chest','spine','pelvis')})
    for name in ('E', 'N', 'M', 'F1', 'F3'):
        V = np.load(f'{d}/{name}-{sex}.npy')
        print('  ', name, 'ymax', round(V[:,1].max(),4), 'neck part y', np.round([V[part == parts.index('neck'),1].min(), V[part == parts.index('neck'),1].max()], 4))
        rows = []
        for y in np.arange(0.80, 0.90, 0.01):
            m = (np.abs(V[:,1] - y) < 0.005) & (np.abs(V[:,2]) < 0.06) 
            if m.sum() < 4: continue
            rows.append(f'{y:.2f}: w{np.ptp(V[m,2])*1750:.0f} d{np.ptp(V[m,0])*1750:.0f} x[{V[m,0].min():.3f},{V[m,0].max():.3f}] n{m.sum()}')
        print('     neck sections (mm at 1.75):', ' | '.join(rows))
        prof = []
        for z in np.arange(0.02, 0.14, 0.01):
            m = np.abs(V[:,2] - z) < 0.005
            m &= V[:,1] < 0.9
            m &= V[:,1] > 0.7
            # top of the shoulder at this distance across (excluding the head: the neck column's skin counts)
            prof.append(f'{z:.2f}:{V[m,1].max():.3f}')
        print('     top line:', ' '.join(prof))
        up = part == parts.index('lUpper')
        s = J['lShoulder']
        print('     bideltoid mm', round(np.ptp(V[(V[:,1] > 0.72) & (V[:,1] < 0.80), 2]) * 1750), 'cap top over joint mm', round((V[(np.abs(V[:,2]-s[2])<0.006)][:,1].max()-s[1])*1750), 'cap out past joint mm', round((V[np.abs(V[:,1]-s[1])<0.006][:,2].max()-s[2])*1750), 'cap fore/aft mm', np.round([(V[(np.abs(V[:,1]-s[1])<0.006)&(np.abs(V[:,2]-s[2])<0.01)][:,0].max()-s[0])*1750, (V[(np.abs(V[:,1]-s[1])<0.006)&(np.abs(V[:,2]-s[2])<0.01)][:,0].min()-s[0])*1750]))
