# List emoji code points in the interface's sources: python3 emoji.py [-v] [files...]
# (tools/uikit/: droppable.) Run from the repo root. The count must reach the allowed remainder named in the roll-out plan.
import re, sys, os, collections
EMO = re.compile('[\U0001F000-\U0001FAFF☀-➿⬀-⯿⌀-⏿←-⇿■-◿①-⓿〰〽㊗㊙️⃣ℹ]+')
# Plain typographic marks that are not emoji (arrows, bullets, stars as text) are listed apart.
TEXT = set('←→↑↓↔↕↗↘↙↖⇧⇄⇆▲▼◀▶●○◆◇■□▪▫★☆✓✕✗✔✖×·•…─│⌫⏎▸▾◂▴⟳↺↻⌘⇥⌥➜➤➔✦✧❯❮⚑')
verbose = '-v' in sys.argv
args = [a for a in sys.argv[1:] if a != '-v']
files = args
if not files:
    for root, _, names in os.walk('src'):
        for n in names:
            if n.endswith('.js'): files.append(os.path.join(root, n))
    files += ['index.html', 'boxer.css', 'fightui.css', 'tools/custom.js']
tot = collections.Counter(); perfile = {}
for f in sorted(files):
    c = collections.Counter(); lines = []
    for i, line in enumerate(open(f, encoding='utf8'), 1):
        code = line
        for m in EMO.finditer(code):
            g = m.group().replace('️', '')
            if not g or all(ch in TEXT for ch in g): continue
            c[g] += 1; lines.append((i, g, line.strip()[:150]))
    if c:
        perfile[f] = c; tot.update(c)
        print(f, sum(c.values()), ' '.join(f'{k}{v}' for k, v in c.most_common(40)))
        if verbose:
            for i, g, l in lines: print('   ', i, g, l)
print('TOTAL', sum(tot.values()), len(tot), 'distinct')
print(' '.join(f'{k}{v}' for k, v in tot.most_common()))
