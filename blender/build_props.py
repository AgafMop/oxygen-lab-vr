"""Bench props → blender/cache/props_raw.glb (optimize → assets/props.glb).

Every prop's origin is at its base centre so three.js can parent it to an A_* anchor.
Glass meshes carry custom property glass=1 (glTF extras → userData.glass).
Run: blender -b --factory-startup --python blender/build_props.py [-- --preview]
"""
import bpy, math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *  # noqa

A = args()
sc = reset()

M = {
    'glass': mat('M_glass', (0.85, 0.93, 0.97), 0.04, 0, alpha=0.22),
    'steel': mat('M_steel', (0.72, 0.74, 0.77), 0.28, 1.0),
    'steelDark': mat('M_steelDark', (0.25, 0.27, 0.3), 0.35, 0.8),
    'plastic': mat('M_plasticWhite', (0.88, 0.88, 0.86), 0.4),
    'plasticBlue': mat('M_plasticBlue', (0.12, 0.35, 0.65), 0.4),
    'rubber': mat('M_rubber', (0.05, 0.05, 0.055), 0.75),
    'amber': mat('M_amber', (0.35, 0.14, 0.03), 0.12, 0, alpha=0.85),
    'labelBlue': mat('M_labelBlue', (0.9, 0.92, 0.95), 0.5),
    'labelRed': mat('M_labelRed', (0.85, 0.08, 0.05), 0.5),
    'cap': mat('M_cap', (0.92, 0.92, 0.9), 0.5),
    'yeast': mat('M_yeast', (0.78, 0.62, 0.36), 0.9),
    'red': mat('M_thermoRed', (0.85, 0.08, 0.05), 0.3),
    'orange': mat('M_orange', (0.9, 0.38, 0.1), 0.4),
    'screen': mat('M_lcd', (0.05, 0.12, 0.1), 0.2, 0, (0.3, 0.9, 0.7), 1.5),
    'tealGlow': mat('M_tealGlow', (0.1, 0.6, 0.6), 0.3, 0, (0.24, 0.9, 0.85), 4.0),
    'goggleLens': mat('M_goggleLens', (0.75, 0.9, 1.0), 0.05, 0, alpha=0.35),
    'strap': mat('M_strap', (0.95, 0.45, 0.12), 0.7),
}
props = []

def tag_glass(o):
    o['glass'] = 1
    return o

def group(name, parts, base=(0, 0, 0)):
    """Join parts into one mesh named `name` with origin at `base`."""
    o = join(parts, name)
    bpy.context.scene.cursor.location = base
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    o.location = (0, 0, 0)
    props.append(o)
    return o

def sub(o, parent, offset):
    """Sub-part with its own pivot; three attaches it to `parent` at Blender-space `offset`."""
    o['parent'] = parent
    o['offset3'] = [offset[0], offset[2], -offset[1]]  # Blender → three coords
    o.location = (offset[0] + 10, offset[1], offset[2])  # parked aside for preview/export
    props.append(o)
    return o

# lay props out on a grid only for the preview; three re-parents them anyway
def at(o, x, y=0.0):
    o.location = (x, y, 0); return o

# ---- water bath (open top) + dial + display ----
W, D, Hh, T = 0.36, 0.27, 0.085, 0.01
parts = [box('bb', (W, D, T), (0, 0, T / 2), M['steel'], 0.004)]
for (sx, sy, x, y) in [(W, T, 0, D / 2 - T / 2), (W, T, 0, -D / 2 + T / 2), (T, D, W / 2 - T / 2, 0), (T, D, -W / 2 + T / 2, 0)]:
    parts.append(box('bw', (sx, sy, Hh), (x, y, Hh / 2), M['steel'], 0.003))
parts.append(box('bpanel', (W * 0.9, 0.03, 0.07), (0, -D / 2 - 0.015, 0.042), M['steelDark'], 0.006))
parts.append(box('brim', (W + 0.01, D + 0.01, 0.012), (0, 0, Hh), M['steelDark'], 0.004))
at(group('P_bath', parts), 0)
dial = cyl('P_bathDial', 0.022, 0.02, (0, 0, 0), M['plasticBlue'], 28)
dial.rotation_euler = (math.pi / 2, 0, 0)
bpy.context.view_layer.objects.active = dial
for x in bpy.context.selected_objects: x.select_set(False)
dial.select_set(True)
bpy.ops.object.transform_apply(rotation=True)
sub(dial, 'P_bath', (0.1, -0.165, 0.042))
disp = box('P_bathDisplay', (0.09, 0.004, 0.045), (0, 0, 0), M['screen'])
sub(disp, 'P_bath', (-0.07, -0.168, 0.042))

# ---- 250 ml Erlenmeyer ----
fl = lathe('P_flask', [(0.0, 0.0), (0.042, 0.0), (0.045, 0.006), (0.043, 0.02), (0.017, 0.105), (0.0165, 0.14), (0.019, 0.143), (0.0185, 0.146)], (0, 0, 0), M['glass'], 40)
at(group('P_flask', [fl]), 0.35); tag_glass(props[-1])

# ---- trough (open top) ----
TW, TD, TH = 0.3, 0.22, 0.11
tparts = [box('tb', (TW, TD, 0.006), (0, 0, 0.003), M['glass'])]
for (sx, sy, x, y) in [(TW, 0.006, 0, TD / 2), (TW, 0.006, 0, -TD / 2), (0.006, TD, TW / 2, 0), (0.006, TD, -TW / 2, 0)]:
    tparts.append(box('tw', (sx, sy, TH), (x, y, TH / 2), M['glass']))
tag_glass(at(group('P_trough', tparts), 0.75))

# ---- 50 ml graduated cylinder, inverted (open end down, foot on top) ----
cy = lathe('cyl', [(0.0145, 0.0), (0.0145, 0.215), (0.012, 0.222), (0.0, 0.224)], (0, 0, 0), M['glass'], 32)
foot = cyl('foot', 0.032, 0.012, (0, 0, 0.23), M['plasticBlue'], 6)
tag_glass(at(group('P_cylinder', [cy, foot]), 1.1))

# clamp stand
sparts = [box('sbase', (0.16, 0.11, 0.012), (0, 0, 0.006), M['steelDark'], 0.004),
          cyl('srod', 0.006, 0.5, (0.05, 0.03, 0.25), M['steel'], 12),
          box('sarm', (0.075, 0.012, 0.012), (0.012, 0.03, 0.17), M['steel'], 0.003),
          cyl('sclamp', 0.018, 0.02, (-0.026, 0.03, 0.17), M['rubber'], 16)]
at(group('P_stand', sparts), 1.4)

# ---- thermometer ----
tg = cyl('tglass', 0.0045, 0.26, (0, 0, 0.13), M['glass'], 12)
tag_glass(at(group('P_thermometer', [tg]), 1.6))
bulbo = cyl('P_thermoBulb', 0.0055, 0.016, (0, 0, 0), M['red'], 12)
sub(bulbo, 'P_thermometer', (0, 0, 0.012))

# ---- reagent bottles (amber glass) ----
def bottle(name, label):
    body = lathe('body', [(0.0, 0.0), (0.035, 0.0), (0.037, 0.006), (0.037, 0.1), (0.03, 0.118), (0.014, 0.128), (0.014, 0.14)], (0, 0, 0), M['amber'], 32)
    capo = cyl('cap', 0.017, 0.022, (0, 0, 0.15), M['cap'], 24)
    lab = cyl('label', 0.0376, 0.055, (0, 0, 0.055), label, 32, cap=False)
    return group(name, [body, capo, lab])
at(bottle('P_bottle3', M['labelBlue']), 1.85)
at(bottle('P_bottle30', M['labelRed']), 2.0)
hz = box('P_hazardDiamond', (0.03, 0.002, 0.03), (0, 0, 0), M['orange'])
hz.rotation_euler = (0, math.pi / 4, 0); sub(hz, 'P_bottle30', (0, -0.039, 0.055))

# ---- yeast jar ----
jparts = [lathe('jar', [(0.0, 0.0), (0.045, 0.0), (0.047, 0.006), (0.047, 0.075), (0.042, 0.08)], (0, 0, 0), M['glass'], 32),
          cyl('jy', 0.043, 0.045, (0, 0, 0.025), M['yeast'], 32),
          cyl('jlid', 0.05, 0.015, (0, 0, 0.088), M['orange'], 32)]
at(group('P_yeastJar', jparts), 2.2)

# ---- spoon / spatula ----
sp = [box('handle', (0.006, 0.12, 0.003), (0, -0.04, 0.003), M['steel'], 0.001),
      cyl('bowl', 0.012, 0.005, (0, 0.03, 0.004), M['steel'], 16, r2=0.009)]
at(group('P_spoon', sp), 2.4)

# ---- stirring rod (lying) ----
rod = cyl('rod', 0.004, 0.2, (0, 0, 0), M['glass'], 10)
rod.rotation_euler = (0, math.pi / 2, 0)
tag_glass(at(group('P_rod', [rod], (0, 0, -0.004)), 2.6))

# ---- stoppers ----
st = cyl('st', 0.0195, 0.03, (0, 0, 0.015), M['rubber'], 24, r2=0.0145)
tub = cyl('stt', 0.0035, 0.07, (0, 0, 0.05), M['glass'], 10)
at(group('P_stopperTube', [st, tub]), 2.8)
st2 = cyl('st2', 0.0195, 0.03, (0, 0, 0.015), M['rubber'], 24, r2=0.0145)
at(group('P_stopperSealed', [st2]), 2.95)

# ---- timer ----
tm = [box('tbody', (0.1, 0.05, 0.065), (0, 0, 0.0325), M['plastic'], 0.01),
      cyl('tbtn', 0.012, 0.012, (0.025, 0, 0.07), M['orange'], 16)]
at(group('P_timer', tm), 3.15)
tdisp = box('P_timerDisplay', (0.07, 0.003, 0.028), (0, 0, 0), M['screen'])
sub(tdisp, 'P_timer', (0, -0.0265, 0.035))

# ---- goggles ----
lens = cyl('lens', 0.085, 0.05, (0, 0, 0), M['goggleLens'], 32, cap=False)
import bmesh as _bm
bmv = _bm.new(); bmv.from_mesh(lens.data)
_bm.ops.delete(bmv, geom=[v for v in bmv.verts if v.co.y > -0.03], context='VERTS')
bmv.to_mesh(lens.data); bmv.free()
lens.location = (0, 0, 0.03)
strap = cyl('strap', 0.088, 0.018, (0, 0, 0.03), M['strap'], 32, cap=False)
tag_glass(at(group('P_goggles', [lens, strap]), 3.4))

# ---- generator (big bioreactor) ----
gparts = [cyl('gbase', 0.55, 0.18, (0, 0, 0.09), M['steelDark'], 48),
          cyl('gtop', 0.52, 0.16, (0, 0, 1.86), M['steelDark'], 48),
          cyl('gring', 0.5, 0.03, (0, 0, 1.0), M['steel'], 48)]
for k in range(4):
    a = k * math.pi / 2 + math.pi / 4
    gparts.append(cyl('gstrut', 0.025, 1.7, (0.49 * math.cos(a), 0.49 * math.sin(a), 0.95), M['steel'], 12))
    gparts.append(cyl('gpipe', 0.035, 0.6, (0.3 * math.cos(a), 0.3 * math.sin(a), 2.2), M['steelDark'], 12))
at(group('P_generatorTank', gparts), 4.2)
gglass = cyl('gg', 0.46, 1.6, (0, 0, 0.98), M['glass'], 48, cap=False)
tag_glass(at(group('P_generatorGlass', [gglass]), 4.2))
gliq = cyl('gl', 0.43, 1.45, (0, 0, 0.9), M['tealGlow'], 40)
at(group('P_generatorLiquid', [gliq]), 4.2, 1.4)
gd = [box('gdcon', (0.4, 0.3, 1.0), (0, 0, 0.5), M['steelDark'], 0.02),
      box('gdface', (0.36, 0.02, 0.28), (0, -0.16, 0.85), M['steel'], 0.01)]
at(group('P_generatorConsole', gd), 5.4)
gdial = cyl('P_generatorDial', 0.09, 0.05, (0, 0, 0), M['orange'], 40)
gdial.rotation_euler = (math.pi / 2, 0, 0)
for x in bpy.context.selected_objects: x.select_set(False)
gdial.select_set(True); bpy.context.view_layer.objects.active = gdial
bpy.ops.object.transform_apply(rotation=True)
sub(gdial, 'P_generatorConsole', (0, -0.195, 0.85))

for o in props:
    o.data.name = o.name

if A.get('preview'):
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
    w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.5, 0.52, 0.55, 1)
    l = bpy.data.lights.new('key', 'AREA'); l.energy = 300; l.size = 2
    lo = link(bpy.data.objects.new('key', l)); lo.location = (1.6, -2, 2.5)
    lo.rotation_euler = (math.radians(45), 0, math.radians(20))
    floor = box('pfloor', (12, 6, 0.01), (2, 0, -0.005), mat('pf', (0.3, 0.3, 0.32), 0.5))
    preview_camera((1.6, -1.6, 0.55), (1.6, 0.0, 0.08), 32)
    render_preview(os.path.join(CACHE, 'preview_props.png'), 1280, 540, samples=32)
    preview_camera((4.8, -4.2, 1.6), (4.8, 0.6, 1.0), 26)
    render_preview(os.path.join(CACHE, 'preview_generator.png'), 960, 540, samples=32)
    bpy.data.objects.remove(floor)

export_glb(os.path.join(CACHE, 'props_raw.glb'), props)
print('[props] exported', len(props))
