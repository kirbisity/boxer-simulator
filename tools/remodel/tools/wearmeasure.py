# python3 wearmeasure.py <clean dir> [<worn dir>=the worktree's src] [name ...]: how strong a map's wear is, in numbers:
# the colour's mean brightness and the mean roughness clean -> worn, and the share of the map's surface a mark darkens by
# more than a tenth. For keeping a new material's wear as slight as the ones already worn.
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..')) if os.path.basename(os.path.dirname(HERE)) == 'remodel' else \
    '/Users/yanlinzhu/Documents/unix_workspace/boxer-simulator/.claude/worktrees/unit-remodel'
sys.path.insert(0, os.path.join(ROOT, 'tools', 'blender'))
import wear  # noqa: E402

arguments = sys.argv[1:]
clean_dir = arguments[0]
worn_dir = arguments[1] if len(arguments) > 1 and os.path.isdir(arguments[1]) else os.path.join(ROOT, 'src')
names = [a for a in arguments[1:] if not os.path.isdir(a)] or list(wear.WEAR)


def maps(directory, name):
    for file_name in ('detailmaps-data.js', 'helmmaps-data.js', 'knighthelms-data.js'):
        with open(os.path.join(directory, file_name)) as file:
            whole = file.read()
        key = f'\n  {name}: {{\n'
        if key in whole:
            start = whole.index(key) + 1
            images, _ = wear.images_of(whole[start:whole.index('\n  },\n', start)])
            return {k: np.asarray(v.convert('RGBA'), dtype=np.float64) / 255 for k, v in images.items()}
    raise SystemExit(f'no map named {name}')


print(f'{"map":14} {"brightness":>17} {"roughness":>15} {"darkened > 10%":>15}')
for name in names:
    clean, worn = maps(clean_dir, name), maps(worn_dir, name)
    light = [m['albedo'][:, :, :3].mean() for m in (clean, worn)]
    rough = [m['orm'][:, :, 1].mean() for m in (clean, worn)]
    a, b = clean['albedo'][:, :, :3].mean(axis=2), worn['albedo'][:, :, :3].mean(axis=2)
    share = float((b < a * 0.9).mean())
    print(f'{name:14} {light[0]:7.3f} -> {light[1]:.3f} {rough[0]:6.3f} -> {rough[1]:.3f} {share * 100:13.1f} %')
