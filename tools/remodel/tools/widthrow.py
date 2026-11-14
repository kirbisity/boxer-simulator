import json,sys
d=json.loads(sys.stdin.read()); f=lambda x: ' '.join(f'{k}={x[k]}' for k in ('shoulders','chest','chestDepth','waist','hips','armFore','armAcross','thighFore','thighAcross'))
print(sys.argv[1], '\n   bare   ', f(d['bare']), '\n   dressed', f(d['dressed']))
