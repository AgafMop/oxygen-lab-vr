"""Shared helpers for headless Blender asset builds (Blender 5.1).

Coordinates: Blender Z-up. glTF export converts (x, y, z) -> three (x, z, -y).
A Blender direction (dx, dy) on the floor maps to three (dx, 0, -dy).
"""
import bpy, bmesh, json, math, os, sys, urllib.request
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, 'cache')
UA = {'User-Agent': 'oxygen-lab-build/0.1'}


def args():
    """Parse `-- --out DIR` style args after Blender's `--`."""
    a = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    out = {}
    for i, k in enumerate(a):
        if k.startswith('--'):
            out[k[2:]] = a[i + 1] if i + 1 < len(a) and not a[i + 1].startswith('--') else True
    return out


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.unit_settings.system = 'METRIC'
    return sc


# ---------- Poly Haven (CC0) ----------
def polyhaven_texture(asset_id, res='1k', maps=('Diffuse', 'nor_gl', 'arm')):
    """Download texture maps for a CC0 Poly Haven asset. Returns {map: path}."""
    os.makedirs(CACHE, exist_ok=True)
    req = urllib.request.Request(f'https://api.polyhaven.com/files/{asset_id}', headers=UA)
    files = json.load(urllib.request.urlopen(req, timeout=30))
    paths = {}
    for m in maps:
        if m not in files:
            continue
        entry = files[m][res].get('jpg') or files[m][res].get('png')
        url = entry['url']
        p = os.path.join(CACHE, f'{asset_id}_{m}_{res}{os.path.splitext(url)[1]}')
        if not os.path.exists(p):
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r, open(p, 'wb') as f:
                f.write(r.read())
        paths[m] = p
    return paths


# ---------- materials ----------
def mat(name, color=(0.8, 0.8, 0.8), rough=0.5, metal=0.0, emit=None, emit_strength=0.0, alpha=1.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if emit:
        b.inputs['Emission Color'].default_value = (*emit, 1)
        b.inputs['Emission Strength'].default_value = emit_strength
    if alpha < 1:
        b.inputs['Alpha'].default_value = alpha
        m.surface_render_method = 'BLENDED'
    return m


def pbr_material(name, maps, tint=(1, 1, 1)):
    """Principled material from Poly Haven maps (Diffuse, nor_gl, arm)."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    def img(path, non_color=False):
        n = nt.nodes.new('ShaderNodeTexImage')
        n.image = bpy.data.images.load(path, check_existing=True)
        if non_color:
            n.image.colorspace_settings.name = 'Non-Color'
        return n
    if 'Diffuse' in maps:
        d = img(maps['Diffuse'])
        if tint != (1, 1, 1):
            mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'
            mix.inputs['Factor'].default_value = 1
            mix.inputs[7].default_value = (*tint, 1)
            nt.links.new(d.outputs['Color'], mix.inputs[6]); nt.links.new(mix.outputs[2], b.inputs['Base Color'])
        else:
            nt.links.new(d.outputs['Color'], b.inputs['Base Color'])
    if 'arm' in maps:
        a = img(maps['arm'], True)
        sep = nt.nodes.new('ShaderNodeSeparateColor')
        nt.links.new(a.outputs['Color'], sep.inputs['Color'])
        nt.links.new(sep.outputs['Green'], b.inputs['Roughness'])
        nt.links.new(sep.outputs['Blue'], b.inputs['Metallic'])
    if 'nor_gl' in maps:
        n = img(maps['nor_gl'], True)
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nt.links.new(n.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], b.inputs['Normal'])
    return m


# ---------- geometry ----------
def link(obj, coll=None):
    (coll or bpy.context.scene.collection).objects.link(obj)
    return obj


def box(name, size, loc, material=None, bevel=0.0, segments=2):
    """Axis-aligned box; size=(sx,sy,sz), loc=center."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=bm.edges[:], offset=bevel, segments=segments, affect='EDGES', profile=0.5)
    bm.to_mesh(me); bm.free()
    o = link(bpy.data.objects.new(name, me))
    o.location = loc
    if material:
        me.materials.append(material)
    smooth(o, 40)
    return o


def cyl(name, r, h, loc, material=None, verts=32, r2=None, cap=True):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=cap, segments=verts, radius1=r, radius2=r if r2 is None else r2, depth=h)
    bm.to_mesh(me); bm.free()
    o = link(bpy.data.objects.new(name, me))
    o.location = loc
    if material:
        me.materials.append(material)
    smooth(o, 40)
    return o


def lathe(name, profile, loc, material=None, steps=40, close=False):
    """Revolve [(r, z), ...] around Z."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    rings = []
    for i in range(steps):
        a = 2 * math.pi * i / steps
        rings.append([bm.verts.new((r * math.cos(a), r * math.sin(a), z)) for r, z in profile])
    for i in range(steps):
        r0, r1 = rings[i], rings[(i + 1) % steps]
        for j in range(len(profile) - 1):
            bm.faces.new((r0[j], r1[j], r1[j + 1], r0[j + 1]))
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(me); bm.free()
    o = link(bpy.data.objects.new(name, me))
    o.location = loc
    if material:
        me.materials.append(material)
    smooth(o, 50)
    return o


def smooth(o, angle_deg=40):
    me = o.data
    for p in me.polygons:
        p.use_smooth = True
    try:
        me.set_sharp_from_angle(angle=math.radians(angle_deg))
    except Exception:
        pass


def empty(name, loc, yaw=None, extras=None):
    """Named node. `yaw` (radians, three.js convention) stored in extras."""
    o = link(bpy.data.objects.new(name, None))
    o.location = loc
    o.empty_display_size = 0.1
    if yaw is not None:
        o['yaw'] = yaw
    for k, v in (extras or {}).items():
        o[k] = v
    return o


def yaw_facing(dx, dy):
    """three.js camera yaw for a viewer facing Blender floor direction (dx, dy)."""
    return math.atan2(-dx, dy)


def yaw_normal(dx, dy):
    """three.js rotation.y so a +Z-facing plane's normal points along Blender (dx, dy)."""
    return math.atan2(dx, -dy)


def uv_box_project(o, scale=1.0):
    """World-space box-ish UVs in UV0 for tiling textures."""
    me = o.data
    if not me.uv_layers:
        me.uv_layers.new(name='UVMap')
    uv = me.uv_layers[0].data
    mw = o.matrix_world
    for p in me.polygons:
        n = p.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for li in p.loop_indices:
            co = mw @ me.vertices[me.loops[li].vertex_index].co
            u, v = [(co.y, co.z), (co.x, co.z), (co.x, co.y)][ax]
            uv[li].uv = (u * scale, v * scale)


def join(objs, name):
    for o in bpy.context.selected_objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    for o in objs:  # ensure every mesh has UV0 so join keeps it
        if not o.data.uv_layers:
            o.data.uv_layers.new(name='UVMap')
    bpy.ops.object.join()
    j = bpy.context.view_layer.objects.active
    j.name = name; j.data.name = name
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return j


def lightmap_uv(o, margin=0.02):
    me = o.data
    uv1 = me.uv_layers.get('UV1') or me.uv_layers.new(name='UV1')
    me.uv_layers.active = uv1
    for x in bpy.context.selected_objects:
        x.select_set(False)
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=margin, area_weight=0.0, scale_to_bounds=True)
    bpy.ops.object.mode_set(mode='OBJECT')
    me.uv_layers.active = me.uv_layers[0]
    return uv1


def bake_lightmap(o, size=2048, samples=128, name='lightmap'):
    """Bake diffuse direct+indirect lighting (no albedo) of `o` into UV1."""
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = samples
    sc.cycles.use_denoising = False
    img = bpy.data.images.new(name, size, size, float_buffer=True)
    for m in o.data.materials:
        nt = m.node_tree
        n = nt.nodes.new('ShaderNodeTexImage')
        n.image = img
        n.name = '__bake'
        nt.nodes.active = n
    me = o.data
    me.uv_layers.active = me.uv_layers['UV1']
    for x in bpy.context.selected_objects:
        x.select_set(False)
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    b = sc.render.bake
    b.margin = 8
    b.use_pass_direct = True
    b.use_pass_indirect = True
    b.use_pass_color = False
    bpy.ops.object.bake(type='DIFFUSE', pass_filter={'DIRECT', 'INDIRECT'}, margin=8)
    for m in o.data.materials:
        m.node_tree.nodes.remove(m.node_tree.nodes['__bake'])
    me.uv_layers.active = me.uv_layers[0]
    return img


def save_image(img, path, fmt='WEBP', quality=88, scale=1.0):
    """Save with the Standard view transform (linear→sRGB only); `scale` multiplies RGB for headroom."""
    sc = bpy.context.scene
    sc.view_settings.view_transform = 'Standard'
    sc.view_settings.look = 'None'
    if scale != 1.0:
        import numpy as np
        px = np.empty(len(img.pixels), dtype=np.float32); img.pixels.foreach_get(px)
        px = px.reshape(-1, 4); px[:, :3] *= scale; img.pixels.foreach_set(px.ravel())
    s = sc.render.image_settings
    s.file_format = fmt
    if fmt in ('WEBP', 'JPEG'):
        s.quality = quality
    s.color_mode = 'RGB'
    img.save_render(path, scene=sc)


def export_glb(path, objs=None):
    if objs is not None:
        for o in bpy.context.scene.objects:
            o.select_set(o in objs)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=objs is not None,
        export_extras=True, export_yup=True, export_apply=True,
        export_lights=False, export_cameras=False, export_texcoords=True, export_normals=True,
        export_image_format='AUTO')


def preview_camera(loc, look_at, lens=20):
    cam = bpy.data.objects.new('PreviewCam', bpy.data.cameras.new('PreviewCam'))
    link(cam)
    cam.location = loc
    d = Vector(look_at) - Vector(loc)
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    cam.data.lens = lens
    bpy.context.scene.camera = cam
    return cam


def render_preview(path, w=1280, h=720, engine='CYCLES', samples=24):
    sc = bpy.context.scene
    sc.render.resolution_x, sc.render.resolution_y = w, h
    sc.render.resolution_percentage = 100
    sc.render.engine = engine
    if engine == 'CYCLES':
        sc.cycles.samples = samples
        sc.cycles.use_denoising = True
    sc.render.image_settings.file_format = 'PNG'
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
