"""Equirectangular Mars vista around Base Tamar → assets/mars_pano.webp.

Camera at 1.6 m looking along Blender +Y (the lab window direction) at the image centre.
Run: blender -b --factory-startup --python blender/render_mars_pano.py -- [--draft]
"""
import bpy, bmesh, math, os, random, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *  # noqa

A = args()
DRAFT = bool(A.get('draft'))
OUT = os.path.abspath(A.get('out', 'assets'))
sc = reset()
rng = np.random.default_rng(11)

# ---------- fBm heightfield ----------
def value_noise(shape, cells, seed):
    r = np.random.default_rng(seed)
    g = r.random((cells + 3, cells + 3))
    ys, xs = np.linspace(0, cells, shape[0]), np.linspace(0, cells, shape[1])
    xi, yi = np.floor(xs).astype(int), np.floor(ys).astype(int)
    xf, yf = xs - xi, ys - yi
    sx, sy = xf * xf * (3 - 2 * xf), yf * yf * (3 - 2 * yf)
    a = g[np.ix_(yi, xi)]; b = g[np.ix_(yi, xi + 1)]; c = g[np.ix_(yi + 1, xi)]; d = g[np.ix_(yi + 1, xi + 1)]
    top = a + (b - a) * sx[None, :]; bot = c + (d - c) * sx[None, :]
    return top + (bot - top) * sy[:, None]

def fbm(n, octaves, base_cells, seed, gain=0.5):
    h = np.zeros((n, n)); amp = 1.0; tot = 0
    for o in range(octaves):
        h += amp * value_noise((n, n), base_cells * 2 ** o, seed + o); tot += amp; amp *= gain
    return h / tot

def terrain(name, size, n, height_fn, material):
    xs = np.linspace(-size / 2, size / 2, n)
    X, Y = np.meshgrid(xs, xs)
    Z = height_fn(X, Y)
    me = bpy.data.meshes.new(name)
    verts = np.stack([X.ravel(), Y.ravel(), Z.ravel()], 1)
    idx = np.arange(n * n).reshape(n, n)
    faces = np.stack([idx[:-1, :-1].ravel(), idx[:-1, 1:].ravel(), idx[1:, 1:].ravel(), idx[1:, :-1].ravel()], 1)
    me.from_pydata(verts.tolist(), [], faces.tolist())
    me.update()
    o = link(bpy.data.objects.new(name, me))
    me.materials.append(material)
    for p in me.polygons: p.use_smooth = True
    return o

# ---------- materials ----------
def ground_mat():
    m = bpy.data.materials.new('MarsGround'); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes['Principled BSDF']
    tc = nt.nodes.new('ShaderNodeTexCoord')
    n1 = nt.nodes.new('ShaderNodeTexNoise'); n1.inputs['Scale'].default_value = 0.08; n1.inputs['Detail'].default_value = 8
    n2 = nt.nodes.new('ShaderNodeTexNoise'); n2.inputs['Scale'].default_value = 2.5; n2.inputs['Detail'].default_value = 10
    nt.links.new(tc.outputs['Object'], n1.inputs['Vector']); nt.links.new(tc.outputs['Object'], n2.inputs['Vector'])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = (0.32, 0.12, 0.05, 1); ramp.color_ramp.elements[1].color = (0.62, 0.3, 0.14, 1)
    e = ramp.color_ramp.elements.new(0.6); e.color = (0.5, 0.22, 0.1, 1)
    mix_n = nt.nodes.new('ShaderNodeMath'); mix_n.operation = 'MULTIPLY_ADD'
    nt.links.new(n1.outputs['Fac'], mix_n.inputs[0]); mix_n.inputs[1].default_value = 0.6
    nt.links.new(n2.outputs['Fac'], mix_n.inputs[2])
    nt.links.new(mix_n.outputs[0], ramp.inputs['Fac'])
    # distance haze toward the sky colour
    cam = nt.nodes.new('ShaderNodeCameraData')
    mr = nt.nodes.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = 60; mr.inputs['From Max'].default_value = 2600
    nt.links.new(cam.outputs['View Distance'], mr.inputs['Value'])
    hz = nt.nodes.new('ShaderNodeMix'); hz.data_type = 'RGBA'
    hz.inputs[7].default_value = (0.86, 0.55, 0.38, 1)
    nt.links.new(mr.outputs['Result'], hz.inputs['Factor']); nt.links.new(ramp.outputs['Color'], hz.inputs[6])
    nt.links.new(hz.outputs[2], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = 0.95
    bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.4
    nt.links.new(n2.outputs['Fac'], bump.inputs['Height']); nt.links.new(bump.outputs['Normal'], b.inputs['Normal'])
    return m

G = ground_mat()
white = mat('Dome', (0.88, 0.87, 0.84), 0.35)
metal = mat('DomeMetal', (0.35, 0.37, 0.4), 0.35, 0.8)
solar = mat('Solar', (0.04, 0.06, 0.12), 0.15, 0.6)
lamp = mat('BaseLamp', (1, 0.8, 0.5), 0.3, 0, (1.0, 0.75, 0.45), 30)
orange = mat('Orange', (0.85, 0.35, 0.1), 0.4)

# ---------- terrain: near detailed patch + far ring with mountains ----------
nN = 220 if DRAFT else 420
def near_h(X, Y):
    h = fbm(X.shape[0], 6, 3, 1) * 6.0 - 3.0
    r = np.hypot(X, Y)
    flat = np.clip((r - 25) / 60, 0, 1)        # flatten the pad around the base
    return h * flat + (fbm(X.shape[0], 5, 20, 7) - 0.5) * 0.35
near = terrain('near', 400, nN, near_h, G)

nF = 200 if DRAFT else 360
def far_h(X, Y):
    r = np.hypot(X, Y); a = np.arctan2(Y, X)
    hills = fbm(X.shape[0], 7, 5, 3) * 90
    mes = fbm(X.shape[0], 5, 6, 9)
    ridge = np.clip((r - 420) / 650, 0, 1) ** 1.3 * (230 + 150 * np.sin(a * 3 + 1.0) + 90 * np.sin(a * 7 + 2) + 260 * mes)
    ridge = np.minimum(ridge, 300 + 140 * np.sin(a * 2))  # flat-topped mesas
    base = np.clip((r - 200) / 300, 0, 1) * hills
    return base + ridge - 4.0 - np.clip((210 - r) / 30, 0, 1) * 6
far = terrain('far', 6000, nF, far_h, G)

# rocks scattered near the camera
rr = random.Random(5)
for i in range(120 if DRAFT else 320):
    ang = rr.uniform(0, 2 * math.pi); dist = rr.uniform(5, 160)
    s = rr.uniform(0.1, 0.6) * (1 + dist / 80)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=s, location=(dist * math.cos(ang), dist * math.sin(ang), -s * 0.3))
    o = bpy.context.active_object
    o.scale = (rr.uniform(0.7, 1.4), rr.uniform(0.7, 1.4), rr.uniform(0.4, 0.8))
    o.rotation_euler = (rr.random(), rr.random(), rr.random())
    o.data.materials.append(G)

# ---------- Base Tamar in the window view (Blender +Y) ----------
def dome(x, y, r):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=(x, y, -r * 0.15), segments=48, ring_count=24)
    d = bpy.context.active_object; d.data.materials.append(white)
    for p in d.data.polygons: p.use_smooth = True
    ring = cyl('ring', r * 1.01, r * 0.08, (x, y, r * 0.1), orange, 48, cap=False)
    return d

domes = [(-24, 52, 7), (0, 66, 10), (21, 55, 6), (40, 80, 8), (-46, 84, 6)]
for (x, y, r) in domes:
    dome(x, y, r)
    lt = cyl('lamp', 0.5, 0.5, (x, y - r * 0.98, r * 0.35), lamp, 12)
for (a, b) in [(0, 1), (1, 2), (2, 3), (0, 4)]:
    (x0, y0, r0), (x1, y1, r1) = domes[a], domes[b]
    L = math.hypot(x1 - x0, y1 - y0); t = cyl('tube', 1.6, L, ((x0 + x1) / 2, (y0 + y1) / 2, 1.4), white, 20)
    t.rotation_euler = (math.pi / 2, 0, math.atan2(x1 - x0, -(y1 - y0)))
for i in range(6):  # solar arrays
    p = box('solar', (6, 2.8, 0.12), (34 + i * 7.5, 34, 1.4), solar, 0.04)
    p.rotation_euler = (math.radians(-25), 0, math.radians(15))
    box('post', (0.15, 0.15, 1.4), (34 + i * 7.5, 34, 0.7), metal)
mast = cyl('mast', 0.25, 18, (-14, 60, 9), metal, 12)
cyl('beacon', 0.5, 0.5, (-14, 60, 18.3), lamp, 12)

# ---------- sky + sun + storm front ----------
SUN_DIR = (0.334, 0.919, 0.208)  # matches the sun lamp below (low, behind the domes)
w = bpy.data.worlds.new('MarsSky'); sc.world = w; w.use_nodes = True
nt = w.node_tree; bg = nt.nodes['Background']
N = nt.nodes.new; L = nt.links.new
def math_(op, a=None, b=None, c=None):
    m = N('ShaderNodeMath'); m.operation = op
    for i, v in enumerate((a, b, c)):
        if v is None: continue
        if isinstance(v, (int, float)): m.inputs[i].default_value = v
        else: L(v, m.inputs[i])
    return m.outputs[0]
tc = N('ShaderNodeTexCoord'); sep = N('ShaderNodeSeparateXYZ'); L(tc.outputs['Generated'], sep.inputs['Vector'])
X_, Y_, Z_ = sep.outputs['X'], sep.outputs['Y'], sep.outputs['Z']
ramp = N('ShaderNodeValToRGB'); cr = ramp.color_ramp
cr.elements[0].position = 0.0; cr.elements[0].color = (0.95, 0.62, 0.40, 1)
cr.elements[1].position = 0.7; cr.elements[1].color = (0.20, 0.12, 0.13, 1)
e = cr.elements.new(0.06); e.color = (0.90, 0.55, 0.36, 1)
e = cr.elements.new(0.25); e.color = (0.58, 0.33, 0.25, 1)
L(Z_, ramp.inputs['Fac'])
# sun disc + bluish Mars-sunset halo
dot = N('ShaderNodeVectorMath'); dot.operation = 'DOT_PRODUCT'; dot.inputs[1].default_value = SUN_DIR
L(tc.outputs['Generated'], dot.inputs[0])
d = math_('MAXIMUM', dot.outputs['Value'], 0.0)
disc = math_('MULTIPLY', math_('POWER', d, 2500.0), 40.0)
halo = math_('MULTIPLY', math_('POWER', d, 18.0), 0.9)
haloC = N('ShaderNodeMix'); haloC.data_type = 'RGBA'; haloC.blend_type = 'ADD'
L(halo, haloC.inputs['Factor']); L(ramp.outputs['Color'], haloC.inputs[6]); haloC.inputs[7].default_value = (0.55, 0.68, 0.9, 1)
discC = N('ShaderNodeMix'); discC.data_type = 'RGBA'; discC.blend_type = 'ADD'
L(disc, discC.inputs['Factor']); L(haloC.outputs[2], discC.inputs[6]); discC.inputs[7].default_value = (1.0, 0.95, 0.85, 1)
# storm wall: azimuth window around 150°, billowy top edge
az = math_('ARCTAN2', Y_, X_)
daz = math_('ABSOLUTE', math_('SUBTRACT', az, 2.25))
wmask = N('ShaderNodeMapRange'); wmask.interpolation_type = 'SMOOTHSTEP'
wmask.inputs['From Min'].default_value = 0.3; wmask.inputs['From Max'].default_value = 1.1
wmask.inputs['To Min'].default_value = 1.0; wmask.inputs['To Max'].default_value = 0.0
L(daz, wmask.inputs['Value'])
nz = N('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 3.0; nz.inputs['Detail'].default_value = 6
L(tc.outputs['Generated'], nz.inputs['Vector'])
top = math_('MULTIPLY_ADD', nz.outputs['Fac'], 0.4, 0.12)
top = math_('MULTIPLY', top, wmask.outputs['Result'])
vmask = N('ShaderNodeMapRange'); vmask.interpolation_type = 'SMOOTHSTEP'
L(Z_, vmask.inputs['Value']); L(math_('SUBTRACT', top, 0.14), vmask.inputs['From Min']); L(top, vmask.inputs['From Max'])
vmask.inputs['To Min'].default_value = 1.0; vmask.inputs['To Max'].default_value = 0.0
storm = math_('MULTIPLY', math_('MULTIPLY', vmask.outputs['Result'], wmask.outputs['Result']), 0.8)
stormC = N('ShaderNodeMix'); stormC.data_type = 'RGBA'
L(storm, stormC.inputs['Factor']); L(discC.outputs[2], stormC.inputs[6]); stormC.inputs[7].default_value = (0.45, 0.22, 0.11, 1)
L(stormC.outputs[2], bg.inputs['Color']); bg.inputs['Strength'].default_value = 1.0
sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = 3.0; sun.color = (1.0, 0.82, 0.62); sun.angle = math.radians(1.5)
so = link(bpy.data.objects.new('sun', sun)); so.rotation_euler = (math.radians(78), 0, math.radians(160))

# ---------- equirect camera ----------
cam = bpy.data.objects.new('pano', bpy.data.cameras.new('pano')); link(cam)
cam.data.type = 'PANO'
cam.data.panorama_type = 'EQUIRECTANGULAR'
cam.location = (0, 0, 1.6)
cam.rotation_euler = (math.radians(90), 0, 0)  # looks along +Y
sc.camera = cam
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'
sc.cycles.samples = 12 if DRAFT else 48; sc.cycles.use_denoising = True
sc.render.resolution_x, sc.render.resolution_y = (2048, 1024) if DRAFT else (4096, 2048)
sc.view_settings.view_transform = 'AgX'
sc.view_settings.look = 'AgX - Medium High Contrast'
sc.render.image_settings.file_format = 'WEBP'; sc.render.image_settings.quality = 82
sc.render.filepath = os.path.join(CACHE if DRAFT else OUT, 'mars_pano.webp')
bpy.ops.render.render(write_still=True)
print('[pano] wrote', sc.render.filepath)
