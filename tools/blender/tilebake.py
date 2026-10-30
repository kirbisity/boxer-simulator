# Shared helpers for baking seamlessly tiling surface maps in Blender (headless): a tile of real geometry (mail rings,
# lamellae, stones) is modelled in metres over [0, W] x [0, H], repeated once all round (so the occlusion and the shapes
# that cross an edge come out the same on both sides), and rendered from straight above with an orthographic camera,
# once per map, every material drawing that map as light (an emission) through one shared node group:
#
#   normal  the surface's normal (with any bump), in the tile's own frame: x right, y up the picture, z out of it.
#           That frame is the tangent frame of a flat tile, so it is the tangent-space map as it is (OpenGL: green up).
#   albedo  the base colour.
#   orm     R the ambient occlusion (Cycles' AO node, `ao_distance` m), G the roughness, B the metalness.
#   height  how far out of the tile's plane (0..1 over [h_lo, h_hi] m).
#   mask    a material's own mask (the lacing of lamellae: where the lace colour shows).
#
# Each is written as a float EXR (scene linear: the numbers as authored, no view transform) and turned into a .npy array
# (rows top first) for tools/blender/pack.py, which writes the images the game embeds.
#
# Run from a map's own script: Blender -b --factory-startup --python tools/blender/<map>.py -- <out dir> [resolution]

import math
import os
import sys

import bpy
import numpy as np

MODES = ['normal', 'albedo', 'orm', 'height', 'mask']


def args():
    """The script's own arguments (after --): the output directory and an optional resolution scale."""
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    out = argv[0] if argv else '/tmp/tilebake'
    scale = float(argv[1]) if len(argv) > 1 else 1.0
    os.makedirs(out, exist_ok=True)
    return out, scale


def reset():
    """An empty scene, Cycles on the GPU where there is one."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    prefs = bpy.context.preferences.addons['cycles'].preferences
    for kind in ('METAL', 'OPTIX', 'CUDA', 'HIP'):
        try:
            prefs.compute_device_type = kind
            prefs.get_devices()
            if any(device.type == kind for device in prefs.devices):
                for device in prefs.devices:
                    device.use = device.type == kind
                scene.cycles.device = 'GPU'
                break
        except TypeError:
            continue
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    scene.cycles.use_denoising = False
    scene.cycles.max_bounces = 1
    scene.cycles.diffuse_bounces = 0
    scene.cycles.glossy_bounces = 0
    scene.cycles.transmission_bounces = 0
    scene.cycles.filter_width = 1.2
    world = bpy.data.worlds.new('World')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0, 0, 0, 1)
    scene.world = world
    return scene


def out_group(ao_distance, h_lo, h_hi):
    """The node group every material ends in: the five maps, chosen by the group's MODE value."""
    group = bpy.data.node_groups.new('TileOut', 'ShaderNodeTree')
    iface = group.interface
    iface.new_socket('Color', in_out='INPUT', socket_type='NodeSocketColor')
    iface.new_socket('Roughness', in_out='INPUT', socket_type='NodeSocketFloat')
    iface.new_socket('Metal', in_out='INPUT', socket_type='NodeSocketFloat')
    iface.new_socket('Mask', in_out='INPUT', socket_type='NodeSocketFloat')
    iface.new_socket('Normal', in_out='INPUT', socket_type='NodeSocketVector')
    iface.new_socket('Shader', in_out='OUTPUT', socket_type='NodeSocketShader')
    nodes = group.nodes
    links = group.links
    gin = nodes.new('NodeGroupInput')
    gout = nodes.new('NodeGroupOutput')
    mode = nodes.new('ShaderNodeValue')
    mode.name = 'MODE'
    mode.outputs[0].default_value = 0

    def vmath(op, a, b=None, scale=None):
        node = nodes.new('ShaderNodeVectorMath')
        node.operation = op
        links.new(a, node.inputs[0])
        if b is not None:
            if isinstance(b, (tuple, list)):
                node.inputs[1].default_value = b
            else:
                links.new(b, node.inputs[1])
        if scale is not None:
            node.inputs[3].default_value = scale
        return node.outputs[0]

    def combine(r, g, b):
        node = nodes.new('ShaderNodeCombineXYZ')
        for index, value in enumerate((r, g, b)):
            if isinstance(value, float):
                node.inputs[index].default_value = value
            else:
                links.new(value, node.inputs[index])
        return node.outputs[0]

    def weight(k):
        node = nodes.new('ShaderNodeMath')
        node.operation = 'COMPARE'
        links.new(mode.outputs[0], node.inputs[0])
        node.inputs[1].default_value = float(k)
        node.inputs[2].default_value = 0.25
        return node.outputs[0]

    # normal: n * 0.5 + 0.5
    normal = vmath('MULTIPLY_ADD', gin.outputs['Normal'], (0.5, 0.5, 0.5))
    normal.node.inputs[2].default_value = (0.5, 0.5, 0.5)
    # albedo
    albedo = gin.outputs['Color']
    # orm: AO, roughness, metal
    ao = nodes.new('ShaderNodeAmbientOcclusion')
    ao.samples = 64
    ao.inputs['Distance'].default_value = ao_distance
    links.new(gin.outputs['Normal'], ao.inputs['Normal'])
    orm = combine(ao.outputs['AO'], gin.outputs['Roughness'], gin.outputs['Metal'])
    # height: (z - lo) / (hi - lo)
    geometry = nodes.new('ShaderNodeNewGeometry')
    sep = nodes.new('ShaderNodeSeparateXYZ')
    links.new(geometry.outputs['Position'], sep.inputs[0])
    hmap = nodes.new('ShaderNodeMapRange')
    hmap.inputs['From Min'].default_value = h_lo
    hmap.inputs['From Max'].default_value = h_hi
    links.new(sep.outputs['Z'], hmap.inputs['Value'])
    height = combine(hmap.outputs['Result'], hmap.outputs['Result'], hmap.outputs['Result'])
    mask = combine(gin.outputs['Mask'], gin.outputs['Mask'], gin.outputs['Mask'])

    total = None
    for k, value in enumerate([normal, albedo, orm, height, mask]):
        term = vmath('SCALE', value, None, None)
        links.new(weight(k), term.node.inputs[3])
        total = term if total is None else vmath('ADD', total, term)
    emission = nodes.new('ShaderNodeEmission')
    emission.inputs['Strength'].default_value = 1.0
    links.new(total, emission.inputs['Color'])
    links.new(emission.outputs[0], gout.inputs['Shader'])
    return group


def material(name, group, build):
    """A material ending in the shared group: `build(nodes, links, geometry_normal)` returns the group's inputs
    (color, roughness, metal, mask, normal): each a socket or a constant."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    out = nodes.new('ShaderNodeOutputMaterial')
    node = nodes.new('ShaderNodeGroup')
    node.node_tree = group
    geometry = nodes.new('ShaderNodeNewGeometry')
    values = build(nodes, links, geometry)
    for key, socket in zip(['Color', 'Roughness', 'Metal', 'Mask', 'Normal'], values):
        if socket is None:
            continue
        if isinstance(socket, (int, float)):
            node.inputs[key].default_value = float(socket)
        elif isinstance(socket, tuple):
            node.inputs[key].default_value = socket if len(socket) == 4 else (*socket, 1.0)
        else:
            links.new(socket, node.inputs[key])
    if values[4] is None:
        links.new(geometry.outputs['Normal'], node.inputs['Normal'])
    links.new(node.outputs[0], out.inputs['Surface'])
    return mat


def repeat_around(collection, width, height):
    """The tile's collection drawn again at the eight neighbouring places (instances, no copies of the meshes)."""
    scene = bpy.context.scene
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            if dx == 0 and dy == 0:
                continue
            empty = bpy.data.objects.new(f'repeat_{dx}_{dy}', None)
            empty.instance_type = 'COLLECTION'
            empty.instance_collection = collection
            empty.location = (dx * width, dy * height, 0)
            scene.collection.objects.link(empty)


def camera(width, height, px_x, px_y):
    """Straight down over the tile, orthographic, the picture exactly the tile."""
    scene = bpy.context.scene
    data = bpy.data.cameras.new('Top')
    data.type = 'ORTHO'
    data.ortho_scale = max(width, height)
    data.clip_start = 0.001
    data.clip_end = 100
    cam = bpy.data.objects.new('Top', data)
    cam.location = (width / 2, height / 2, 10)
    cam.rotation_euler = (0, 0, 0)
    scene.collection.objects.link(cam)
    scene.camera = cam
    scene.render.resolution_x = px_x
    scene.render.resolution_y = px_y
    scene.render.resolution_percentage = 100
    scene.render.pixel_aspect_x = 1
    scene.render.pixel_aspect_y = 1
    data.sensor_fit = 'AUTO'
    return cam


def render_maps(group, out, name, samples=None, modes=MODES):
    """Render each map and keep it as <out>/<name>_<mode>.npy (float32, rows top first, RGB)."""
    scene = bpy.context.scene
    scene.render.image_settings.file_format = 'OPEN_EXR'
    scene.render.image_settings.color_depth = '32'
    scene.render.image_settings.exr_codec = 'ZIP'
    for mode in modes:
        group.nodes['MODE'].outputs[0].default_value = MODES.index(mode)
        scene.cycles.samples = (samples or {}).get(mode, 16)
        path = os.path.join(out, f'{name}_{mode}.exr')
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        image = bpy.data.images.load(path)
        w, h = image.size
        pixels = np.array(image.pixels[:], dtype=np.float32).reshape(h, w, image.channels)[::-1, :, :3]
        np.save(os.path.join(out, f'{name}_{mode}.npy'), pixels)
        bpy.data.images.remove(image)
        print(f'tilebake: {name} {mode} {w}x{h}', flush=True)


def link(obj, collection):
    collection.objects.link(obj)
    return obj


def new_collection(name='tile'):
    collection = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(collection)
    return collection


def noise_bump(nodes, links, geometry, scale, strength, distance, detail=6.0, roughness=0.6, coords='Object'):
    """A bump from noise over the object's (or the world's) coordinates; returns the bumped normal socket."""
    coord = nodes.new('ShaderNodeTexCoord')
    noise = nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = scale
    noise.inputs['Detail'].default_value = detail
    noise.inputs['Roughness'].default_value = roughness
    links.new(coord.outputs[coords], noise.inputs['Vector'])
    bump = nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = strength
    bump.inputs['Distance'].default_value = distance
    links.new(noise.outputs['Fac'], bump.inputs['Height'])
    links.new(geometry.outputs['Normal'], bump.inputs['Normal'])
    return bump.outputs['Normal'], noise.outputs['Fac']


def tau():
    return math.tau
