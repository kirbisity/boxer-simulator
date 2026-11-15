import bpy, sys
for o in bpy.data.objects:
    if o.type == 'MESH':
        zs = [ (o.matrix_world @ v.co).z for v in o.data.vertices ]
        keys = [k.name for k in o.data.shape_keys.key_blocks] if o.data.shape_keys else []
        print('INFO', o.name, len(o.data.vertices), round(min(zs),4), round(max(zs),4), keys)
