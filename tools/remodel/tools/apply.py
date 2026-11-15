# python3 apply.py <label> <slim> : the worktree's game set to a variant (its data file, LOFT.neck.slim, LOFT.family's places and swell).
import sys, re, ast, shutil
SP = '/private/tmp/claude-501/-Users-yanlinzhu-Documents-unix-workspace/cb91ac51-ebd4-462b-b4be-1c0ef0c9dfb9/scratchpad/unit-remodel'
WT = '/Users/yanlinzhu/Documents/unix_workspace/boxer-simulator/.claude/worktrees/unit-remodel'
label, slim = sys.argv[1], sys.argv[2]
shutil.copy(f'{SP}/body/data/{label}.js', f'{WT}/src/basebody-data.js')
places = {}; swell = {}
if label == 'current':
    places = {'male': {'E': [0.66, 12.62], 'N': [4.07, 18.62], 'M': [2.85, 23.08], 'F1': [6.22, 20.75], 'F2': [9.83, 22.93], 'F3': [14.94, 24.43]}, 'female': {'E': [1.2, 12.11], 'N': [5.91, 15.67], 'M': [4.71, 18.83], 'F1': [9.08, 17.81], 'F2': [13.62, 19.45], 'F3': [19.14, 20.18]}}
    swell = {'male': [0.02345, 0.01071, 0.001684], 'female': [0.02607, 0.01163, 0.001549]}
else:
    for line in open(f'{SP}/body/data/{label}.composition.txt'):
        m = re.match(r'(male|female) (\{.*\})', line)
        if m: places[m.group(1)] = ast.literal_eval(m.group(2))
    for line in open(f'{SP}/body/data/{label}.swell.txt'):
        m = re.match(r'(male|female) .*swell (\[.*?\])', line)
        if m: swell[m.group(1)] = ast.literal_eval(m.group(2))
row = lambda d: '{ ' + ', '.join(f'{k}: [{v[0]:g}, {v[1]:g}]' for k, v in d.items()) + ' }'
p = f'{WT}/src/loftbody.js'; s = open(p).read()
s, n1 = re.subn(r"    male: \{ E: \[[^\n]*\n    female: \{ E: \[[^\n]*\n", f"    male: {row(places['male'])},\n    female: {row(places['female'])},\n", s)
s, n2 = re.subn(r"swell: \{ male: \[[^\]]*\], female: \[[^\]]*\] \}", "swell: { male: [" + ', '.join(f'{v:g}' for v in swell['male']) + "], female: [" + ', '.join(f'{v:g}' for v in swell['female']) + "] }", s)
s, n3 = re.subn(r"neck: \{ slim: [0-9.]+,", f"neck: {{ slim: {slim},", s)
assert (n1, n2, n3) == (1, 1, 1), (n1, n2, n3)
open(p, 'w').write(s)
