import json
import sys

for path in sys.argv[1:]:
    for line in open(path):
        if not line.startswith('{'):
            continue
        d = json.loads(line)
        if d['step'].startswith('stats') and not d['step'].endswith(':30'):
            print(path, d['step'], d['frameMs']['avg'], d['renderMs']['avg'], d['triangles'], d['drawCalls'], d['faces']['total'])
