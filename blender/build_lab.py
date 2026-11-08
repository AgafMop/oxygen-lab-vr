"""Build the Mars-base lab room → assets/lab.glb + assets/lab_lightmap.webp.

Run: blender -b --factory-startup --python blender/build_lab.py -- --out assets/ [--draft] [--preview]
Layout (Blender coords, metres): room x[-4,4] y[-3,3] z[0,3]. Window wall at +y (three -z).
"""
import bpy, math, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *  # noqa

A = args()
OUT = os.path.abspath(A.get('out', 'assets'))
DRAFT = bool(A.get('draft'))
os.makedirs(OUT, exist_ok=True)
sc = reset()
t0 = time.time()

X0, X1, Y0, Y1, H = -4.0, 4.0, -3.0, 3.0, 3.0
static = []          # meshes merged + baked
def S(o):
    static.append(o); return o

# ---------------- materials ----------------
M = {
    'panel': mat('M_panel', (0.80, 0.81, 0.83), 0.45),
    'panelWarm': mat('M_panelWarm', (0.74, 0.72, 0.69), 0.5),
    'panelLow': mat('M_panelLow', (0.13, 0.17, 0.22), 0.4, 0.25),
    'ceil': mat('M_ceil', (0.22, 0.23, 0.25), 0.6, 0.2),
    'orange': mat('M_orange', (0.85, 0.33, 0.1), 0.35),
    'alarm': mat('M_alarm', (0.5, 0.05, 0.03), 0.2),
    'leaf': mat('M_leaf', (0.18, 0.5, 0.15), 0.6),
    'leaf2': mat('M_leaf2', (0.35, 0.62, 0.2), 0.6),
    'red': mat('M_red', (0.7, 0.06, 0.04), 0.35),
    'green': mat('M_green', (0.05, 0.55, 0.25), 0.4),
    'stencil': mat('M_stencil', (0.85, 0.33, 0.1), 0.5),
    'screenOn': mat('M_screenOn', (0.02, 0.08, 0.09), 0.2, 0, (0.15, 0.55, 0.6), 2.0),
    'backing': mat('M_backing', (0.06, 0.065, 0.075), 0.7),
    'rib': mat('M_rib', (0.16, 0.17, 0.19), 0.38, 0.7),
    'kick': mat('M_kick', (0.10, 0.11, 0.12), 0.5, 0.3),
    'accent': mat('M_accent', (0.9, 0.35, 0.12), 0.4, 0, (1.0, 0.42, 0.15), 4.0),
    'led': mat('M_led', (0.9, 0.95, 1.0), 0.3, 0, (0.86, 0.93, 1.0), 12.0),
    'benchTop': mat('M_benchTop', (0.90, 0.90, 0.88), 0.28),
    'cabinet': mat('M_cabinet', (0.20, 0.23, 0.27), 0.45, 0.2),
    'handle': mat('M_handle', (0.7, 0.72, 0.75), 0.25, 1.0),
    'bezel': mat('M_bezel', (0.03, 0.035, 0.04), 0.35, 0.3),
    'screenOff': mat('M_screenOff', (0.02, 0.05, 0.06), 0.15),
    'teal': mat('M_teal', (0.1, 0.6, 0.6), 0.3, 0, (0.24, 0.85, 0.8), 6.0),
    'hazard': mat('M_hazard', (0.95, 0.72, 0.1), 0.5),
    'crateA': mat('M_crateA', (0.85, 0.42, 0.18), 0.6),
    'crateB': mat('M_crateB', (0.35, 0.42, 0.5), 0.6),
    'crateC': mat('M_crateC', (0.85, 0.85, 0.82), 0.5),
    'reagentA': mat('M_reagentA', (0.3, 0.5, 0.7), 0.2),
    'reagentB': mat('M_reagentB', (0.7, 0.55, 0.3), 0.2),
    'alcove': mat('M_alcove', (0.12, 0.13, 0.15), 0.5, 0.5),
    'door': mat('M_door', (0.55, 0.58, 0.62), 0.4, 0.6),
}
floor_maps = polyhaven_texture('concrete_floor_01', '1k')
M['floor'] = pbr_material('M_floor', floor_maps, tint=(0.36, 0.38, 0.42))
try:                                   # riveted metal plating on the dark lower walls and the ceiling (CC0, Poly Haven)
    plate = polyhaven_texture('metal_plate', '1k')
    M['panelLow'] = pbr_material('M_panelLow', plate, tint=(0.16, 0.2, 0.26))
    M['ceil'] = pbr_material('M_ceil', plate, tint=(0.24, 0.25, 0.27))
except Exception as e:
    print('[lab] metal_plate texture unavailable, flat panels kept:', e)

# ---------------- shell ----------------
floor = S(box('floor', (X1 - X0, Y1 - Y0, 0.1), (0, 0, -0.05), M['floor']))
uv_box_project(floor, 0.5)
ceil = S(box('ceiling', (X1 - X0, Y1 - Y0, 0.1), (0, 0, H + 0.05), M['ceil']))

def wall(axis, fixed, a0, a1, openings, inward):
    """Panelled wall. axis 'x' => wall along x at y=fixed; 'y' => along y at x=fixed.
    openings: [(a_from, a_to, z_from, z_to)]. inward: +1/-1 normal direction into room."""
    col = 1.0
    a = a0
    while a < a1 - 1e-6:
        b = min(a + col, a1)
        spans = [(0.0, H)]
        for (o0, o1, z0, z1) in openings:
            if o0 < b - 1e-6 and o1 > a + 1e-6:
                nxt = []
                for s0, s1 in spans:
                    if z0 > s0: nxt.append((s0, min(z0, s1)))
                    if z1 < s1: nxt.append((max(z1, s0), s1))
                spans = [s for s in nxt if s[1] - s[0] > 0.01]
        mid = (a + b) / 2
        for (s0, s1) in spans:
            # backing (fills gaps), panel (inset), kick plate at the floor
            def place(name, w, z0_, z1_, depth, off, m, bev=0.0):
                zc, hz = (z0_ + z1_) / 2, (z1_ - z0_)
                if axis == 'x':
                    S(box(name, (w, depth, hz), (mid, fixed - inward * off, zc), m, bev))
                else:
                    S(box(name, (depth, w, hz), (fixed - inward * off, mid, zc), m, bev))
            place('back', b - a, s0, s1, 0.06, 0.03, M['backing'])
            G = 0.022  # joint gap between columns
            segs = []  # (z0, z1, material, bevel, depth)
            if s0 < 0.01:
                place('kick', b - a - 0.004, 0.0, 0.14, 0.035, 0.078, M['kick'])
                place('acc', b - a - 0.004, 0.145, 0.16, 0.01, 0.097, M['accent'])
                lo = 0.18
            else:
                lo = s0 + G / 2
            hi = s1 - G / 2
            for z0_, z1_, m in [(lo, min(hi, 0.98), M['panelLow']), (max(lo, 0.98), min(hi, 1.02), M['orange']), (max(lo, 1.02), hi, M['panelWarm'] if round(a) % 4 == 1 else M['panel'])]:
                if z1_ - z0_ > 0.015:
                    gap = 0.0 if m is M['orange'] else G / 2
                    place('panel', b - a - G, z0_ + gap, z1_ - gap, 0.05, 0.085 if m is not M['orange'] else 0.092, m, 0.0 if m is M['orange'] else 0.012)
        a = b

# window wall (+y): opening x -2..2, z 0.95..2.75
wall('x', Y1, X0, X1, [(-2.0, 2.0, 0.95, 2.75)], +1)
# south wall (-y): door x -3..-2
wall('x', Y0, X0, X1, [(-3.0, -2.0, 0.0, 2.3)], -1)
# west wall (-x): generator window y 0..2
wall('y', X0, Y0, Y1, [(0.0, 2.0, 0.6, 2.5)], -1)
# east wall (+x)
wall('y', X1, Y0, Y1, [], +1)

# structural ribs (habitat frames) at x=±3, running up walls and across ceiling
for x in (-3.0, 3.0):
    for y in (Y0 + 0.07, Y1 - 0.07):
        S(box('ribV', (0.16, 0.14, H), (x, y, H / 2), M['rib'], 0.01))
    S(box('ribC', (0.16, Y1 - Y0, 0.14), (x, 0, H - 0.07), M['rib'], 0.01))
for (x, y) in [(X1 - 0.07, -1.5), (X1 - 0.07, 1.5), (X0 + 0.07, -1.5), (X0 + 0.07, 2.45)]:
    S(box('ribVy', (0.14, 0.16, H), (x, y, H / 2), M['rib'], 0.01))

# ceiling LED troughs along x
for y in (-1.0, 1.2):
    S(box('ledHousing', (6.4, 0.34, 0.08), (0, y, H - 0.04), M['rib'], 0.01))
    S(box('led', (6.2, 0.2, 0.02), (0, y, H - 0.085), M['led']))
# pipes along the window wall top and east wall
for (ax, fixed, a0, a1, z, r, m) in [('x', Y1 - 0.18, X0, X1, 2.88, 0.045, M['rib']), ('x', Y1 - 0.30, X0, X1, 2.86, 0.03, M['accent']),
                                     ('y', X1 - 0.18, Y0, Y1, 2.88, 0.045, M['rib'])]:
    p = cyl('pipe', r, a1 - a0, (0, 0, z), m, 16)
    if ax == 'x':
        p.rotation_euler = (0, math.pi / 2, 0); p.location = ((a0 + a1) / 2, fixed, z)
    else:
        p.rotation_euler = (math.pi / 2, 0, 0); p.location = (fixed, (a0 + a1) / 2, z)
    S(p)

# ---------------- window ----------------
WD = 0.3  # frame depth
for (sx, sz, loc) in [((4.2, WD, 0.12), None, (0, Y1 - 0.08, 0.95 - 0.06)), ((4.2, WD, 0.12), None, (0, Y1 - 0.08, 2.75 + 0.06))]:
    S(box('winFrameH', sx, loc, M['rib'], 0.015))
for x in (-2.06, 2.06):
    S(box('winFrameV', (0.12, WD, 1.92), (x, Y1 - 0.08, 1.85), M['rib'], 0.015))
for x in (-1.0, 0.0, 1.0):
    S(box('mullion', (0.05, 0.08, 1.8), (x, Y1 + 0.02, 1.85), M['rib'], 0.006))
S(box('sill', (4.3, 0.4, 0.05), (0, Y1 - 0.22, 0.93), M['benchTop'], 0.01))

# ---------------- door (south wall) ----------------
S(box('doorFrame', (1.2, 0.18, 0.1), (-2.5, Y0 + 0.02, 2.35), M['rib'], 0.01))
for x in (-3.04, -1.96):
    S(box('doorJamb', (0.1, 0.18, 2.4), (x, Y0 + 0.02, 1.2), M['rib'], 0.01))
S(box('door', (1.0, 0.06, 2.28), (-2.5, Y0 - 0.02, 1.14), M['door'], 0.01))
S(box('doorStripe', (1.0, 0.065, 0.06), (-2.5, Y0 - 0.02, 1.1), M['accent']))

# ---------------- bench station (centre) ----------------
BY, BTOP = 1.42, 0.72
S(box('benchTop', (2.3, 0.78, 0.04), (0, BY, BTOP - 0.02), M['benchTop'], 0.012))
S(box('benchBase', (2.2, 0.66, 0.6), (0, BY + 0.04, 0.38), M['cabinet'], 0.01))
S(box('benchKick', (2.16, 0.6, 0.08), (0, BY + 0.06, 0.04), M['kick']))
for x in (-0.82, -0.27, 0.27, 0.82):
    S(box('drawerLine', (0.5, 0.005, 0.004), (x, BY - 0.29, 0.5), M['backing']))
    S(box('handle', (0.16, 0.02, 0.015), (x, BY - 0.30, 0.6), M['handle'], 0.004))
S(box('riser', (2.3, 0.08, 0.3), (0, BY + 0.35, BTOP + 0.15), M['cabinet'], 0.008))
S(box('riserShelf', (2.3, 0.22, 0.025), (0, BY + 0.3, BTOP + 0.31), M['benchTop'], 0.006))
for i, x in enumerate((-1.0, -0.8, 0.85, 1.0)):
    S(cyl('reagent', 0.035, 0.12, (x, BY + 0.31, BTOP + 0.38), M['reagentA'] if i % 2 else M['reagentB'], 20))
# overhead lamp bar
S(box('lampBar', (1.8, 0.16, 0.05), (0, BY, 2.15), M['rib'], 0.01))
S(box('lampLed', (1.7, 0.1, 0.01), (0, BY, 2.122), M['led']))
for x in (-0.8, 0.8):
    S(cyl('lampRod', 0.008, H - 2.17, (x, BY, (H + 2.17) / 2), M['handle'], 8))

# ---------------- robot bay + graph wall (east) ----------------
RX, RY = 2.92, 0.55
S(box('robotTop', (0.72, 1.5, 0.04), (RX, RY, BTOP - 0.02), M['benchTop'], 0.012))
S(box('robotBase', (0.64, 1.42, 0.6), (RX + 0.03, RY, 0.38), M['cabinet'], 0.01))
S(cyl('dockPad', 0.42, 0.03, (3.6, RY, 0.015), M['rib'], 48))
S(cyl('dockRing', 0.44, 0.012, (3.6, RY, 0.02), M['teal'], 48, cap=False))
GY, GZ = -1.55, 1.55
S(box('graphBezel', (0.06, 2.4, 1.45), (X1 - 0.14, GY, GZ), M['bezel'], 0.02))
S(box('graphScreen', (0.01, 2.26, 1.31), (X1 - 0.175, GY, GZ), M['screenOff']))

# ---------------- entry: goggle rack (west wall, south) ----------------
S(box('rackBack', (0.04, 0.9, 0.6), (X0 + 0.13, -2.0, 1.35), M['cabinet'], 0.008))
S(box('rackSign', (0.02, 0.9, 0.16), (X0 + 0.14, -2.0, 1.78), M['hazard'], 0.004))
for y in (-2.3, -2.0, -1.7):
    S(cyl('hook', 0.012, 0.1, (X0 + 0.19, y, 1.45), M['handle'], 8)).rotation_euler = (0, math.pi / 2, 0)

# ---------------- generator alcove (behind west glass) ----------------
S(box('alcFloor', (2.0, 2.4, 0.1), (X0 - 1.0, 1.0, -0.05), M['alcove']))
S(box('alcCeil', (2.0, 2.4, 0.1), (X0 - 1.0, 1.0, H + 0.05), M['alcove']))
S(box('alcBack', (0.1, 2.4, H), (X0 - 2.05, 1.0, H / 2), M['alcove']))
for y in (-0.25, 2.25):
    S(box('alcSide', (2.0, 0.1, H), (X0 - 1.0, y, H / 2), M['alcove']))
S(box('alcLed', (0.02, 2.0, 0.08), (X0 - 1.99, 1.0, 2.6), M['teal']))
for (sy, sz, loc) in [((0.1, 2.12, 0.1), None, (X0 + 0.07, 1.0, 0.55)), ((0.1, 2.12, 0.1), None, (X0 + 0.07, 1.0, 2.55))]:
    S(box('genFrameH', sy, loc, M['rib'], 0.012))
for y in (-0.05, 2.05):
    S(box('genFrameV', (0.14, 0.1, 2.0), (X0 + 0.07, y, 1.55), M['rib'], 0.012))
# hazard floor stripes in front of the generator window
for i in range(8):
    S(box('stripe', (0.5, 0.12, 0.004), (X0 + 0.45, -0.05 + i * 0.3, 0.002), M['hazard'] if i % 2 == 0 else M['backing']))

# ---------------- storage shelves (east wall north, south wall) ----------------
def shelving(x, y, along, length, rot_x):
    for z in (0.35, 0.85, 1.35, 1.85):
        if along == 'y':
            S(box('shelf', (0.4, length, 0.025), (x, y, z), M['rib'], 0.005))
        else:
            S(box('shelf', (length, 0.4, 0.025), (x, y, z), M['rib'], 0.005))
    for k, d in enumerate((-length / 2 + 0.02, length / 2 - 0.02)):
        loc = (x, y + d, 1.0) if along == 'y' else (x + d, y, 1.0)
        S(box('upright', (0.4, 0.03, 2.0) if along == 'y' else (0.03, 0.4, 2.0), loc, M['rib'], 0.004))
    import random
    rnd = random.Random(7 + int(x * 10))
    for z in (0.35, 0.85, 1.35, 1.85):
        t = -length / 2 + 0.12
        while t < length / 2 - 0.15:
            w = rnd.uniform(0.14, 0.32); h = rnd.uniform(0.12, 0.34)
            m = rnd.choice([M['crateA'], M['crateB'], M['crateC'], M['crateB']])
            if rnd.random() < 0.35:
                loc = (x, y + t + 0.05, z + 0.0125 + h / 2) if along == 'y' else (x + t + 0.05, y, z + 0.0125 + h / 2)
                S(cyl('jar', 0.05, h * 0.8, (loc[0], loc[1], z + 0.0125 + h * 0.4), rnd.choice([M['reagentA'], M['reagentB']]), 16))
                t += 0.14
            else:
                loc = (x, y + t + w / 2, z + 0.0125 + h / 2) if along == 'y' else (x + t + w / 2, y, z + 0.0125 + h / 2)
                S(box('crate', (0.3, w, h) if along == 'y' else (w, 0.3, h), loc, m, 0.01))
                t += w + rnd.uniform(0.02, 0.08)

shelving(X1 - 0.25, 2.0, 'y', 1.6, 0)
shelving(1.4, Y0 + 0.25, 'x', 2.2, 0)

# ---------------- detail pass ----------------
dynamic = []  # exported as separate meshes (animated / canvas-driven in three)

# red emergency light domes (pulsed in three during the storm)
for i, (x, y, rz) in enumerate([(0, Y0 + 0.11, 0), (X0 + 0.11, -1.5 + 3.0, 0), (X1 - 0.11, -0.2, 0), (-2.6, Y1 - 0.11, 0), (2.6, Y1 - 0.11, 0)]):
    S(cyl('alarmBase', 0.09, 0.03, (x, y, 2.62), M['rib'], 20)).rotation_euler = (math.pi / 2 if abs(y) > 2.8 else 0, 0 if abs(y) > 2.8 else math.pi / 2, 0)
    d = lathe(f'FX_alarm_{i}', [(0.0, 0.0), (0.07, 0.0), (0.068, 0.03), (0.05, 0.06), (0.0, 0.07)], (x, y, 2.62), M['alarm'], 20)
    if abs(y) > 2.8:
        d.rotation_euler = (math.radians(90) * (1 if y < 0 else -1), 0, 0)
    else:
        d.rotation_euler = (0, math.radians(90) * (1 if x < 0 else -1), 0)
    dynamic.append(d)

# wall consoles with screens (canvas UI in three)
def console(name, x, y, z, nx, w=0.7, h=0.42):
    if abs(nx) > 0:  # on an x-wall (east/west)
        S(box(name + 'Bezel', (0.05, w + 0.06, h + 0.06), (x, y, z), M['bezel'], 0.012))
        s_ = box(f'SCR_{name}', (0.006, w, h), (x + nx * 0.028, y, z), M['screenOn'])
    else:
        S(box(name + 'Bezel', (w + 0.06, 0.05, h + 0.06), (x, y, z), M['bezel'], 0.012))
        s_ = box(f'SCR_{name}', (w, 0.006, h), (x, y + (-1 if y > 0 else 1) * 0.028, z), M['screenOn'])
    dynamic.append(s_)

console('door', -1.45, Y0 + 0.135, 1.45, 0, 0.5, 0.32)
console('gen', X0 + 0.135, -0.75, 1.55, 1, 0.55, 0.38)

# hydroponic planters on the window sill ends (life on Mars)
import random
rp = random.Random(3)
for cx in (-1.75, 1.75):
    S(box('planter', (0.5, 0.22, 0.1), (cx, Y1 - 0.14, 1.0), M['bezel'], 0.01))
    S(box('planterLed', (0.5, 0.02, 0.01), (cx, Y1 - 0.25, 1.06), M['teal']))
    for k in range(9):
        lx, ly = cx + rp.uniform(-0.2, 0.2), Y1 - 0.14 + rp.uniform(-0.06, 0.06)
        leaf = cyl('leaf', rp.uniform(0.035, 0.06), rp.uniform(0.05, 0.11), (lx, ly, 1.08), rp.choice([M['leaf'], M['leaf2']]), 7, r2=0.005)
        leaf.rotation_euler = (rp.uniform(-0.5, 0.5), rp.uniform(-0.5, 0.5), 0)
        S(leaf)

# fire extinguisher + eyewash station near the door
S(cyl('extinguisher', 0.075, 0.5, (-1.85, Y0 + 0.2, 0.45), M['red'], 20))
S(cyl('extTop', 0.03, 0.08, (-1.85, Y0 + 0.2, 0.74), M['bezel'], 12))
S(box('eyewashSign', (0.3, 0.015, 0.3), (-3.55, Y0 + 0.12, 1.7), M['green'], 0.005))
S(box('eyewashBowl', (0.36, 0.22, 0.06), (-3.55, Y0 + 0.22, 1.05), M['handle'], 0.02))

# vents
for (x, y) in [(2.5, Y0 + 0.125), (-0.5, Y0 + 0.125)]:
    S(box('vent', (0.6, 0.03, 0.3), (x, y, 2.45), M['bezel'], 0.006))
    for k in range(6):
        S(box('slat', (0.56, 0.035, 0.012), (x, y + 0.01, 2.33 + k * 0.045), M['rib']))

# cable tray along the east wall top
S(box('cableTray', (0.25, Y1 - Y0 - 0.4, 0.06), (X1 - 0.35, 0, 2.7), M['rib'], 0.006))

# stencilled signage (Latin glyphs from Blender's built-in font)
def stencil(text, loc, rot, size):
    cu = bpy.data.curves.new('txt', 'FONT'); cu.body = text; cu.size = size; cu.extrude = 0.002
    cu.align_x = 'CENTER'; cu.align_y = 'CENTER'
    o = link(bpy.data.objects.new('stencil', cu)); o.location = loc; o.rotation_euler = rot
    bpy.context.view_layer.objects.active = o
    for x_ in bpy.context.selected_objects: x_.select_set(False)
    o.select_set(True)
    bpy.ops.object.convert(target='MESH')
    o = bpy.context.view_layer.objects.active
    o.data.materials.append(M['stencil'])
    S(o)

stencil('BIO-LAB 02', (-2.5, Y0 + 0.113, 2.55), (math.pi / 2, 0, math.pi), 0.16)
stencil('O2 GENERATOR  /  BACKUP', (X0 + 0.113, 1.0, 2.68), (math.pi / 2, 0, math.pi / 2), 0.12)
stencil('TAMAR BASE', (X1 - 0.113, 1.95, 2.25), (math.pi / 2, 0, -math.pi / 2), 0.2)

# ---------------- emptied anchors & stations ----------------
def station(name, x, y, fx, fy):
    empty(name, (x, y, 0), yaw=yaw_facing(fx, fy))

station('ST_bench', 0.0, 0.72, 0, 1)
station('ST_entry', -2.5, -2.0, -1, 0)
station('ST_robot', 1.55, -0.35, 1, 0.12)
station('ST_generator', -2.7, 1.0, -1, 0)

anchors = {
    'A_bath': (0.38, BY - 0.02, BTOP), 'A_flask': (0.38, BY - 0.02, BTOP + 0.02),
    'A_trough': (-0.38, BY, BTOP), 'A_cylinder': (-0.38, BY, BTOP + 0.015),
    'A_bottle3': (0.82, BY - 0.14, BTOP), 'A_bottle30': (0.98, BY + 0.12, BTOP),
    'A_yeastJar': (0.02, BY - 0.12, BTOP), 'A_spoon': (0.12, BY - 0.22, BTOP),
    'A_rod': (0.62, BY - 0.24, BTOP), 'A_stopperTube': (0.18, BY + 0.05, BTOP),
    'A_stopperSealed': (0.3, BY + 0.14, BTOP), 'A_timer': (-0.82, BY - 0.15, BTOP),
    'A_robotBench': (RX, RY, BTOP), 'A_window': (0, Y1, 1.85),
    'A_generator': (X0 - 1.0, 1.0, 0.0),
}
for n, loc in anchors.items():
    empty(n, loc)
empty('A_goggleRack', (X0 + 0.22, -2.0, 1.35), yaw=yaw_normal(1, 0))
empty('A_graphWall', (X1 - 0.185, GY, GZ), yaw=yaw_normal(-1, 0), extras={'w': 2.26, 'h': 1.31})
empty('A_hypBoard', (-1.45, 1.3, 1.22), yaw=yaw_normal(1.45, -0.58))

tp = mat('M_tp', (0.1, 0.5, 0.5), 0.4, 0, (0.24, 0.85, 0.8), 1.5)
tps = []
for n, (x, y) in {'TP_bench': (0.0, 0.72), 'TP_entry': (-2.5, -2.0), 'TP_robot': (1.55, -0.35), 'TP_generator': (-2.7, 1.0)}.items():
    o = cyl(n, 0.32, 0.012, (x, y, 0.006), tp, 40, cap=True)
    tps.append(o)

# ---------------- lighting for the bake ----------------
w = bpy.data.worlds.new('MarsDusk'); sc.world = w
w.use_nodes = True
bg = w.node_tree.nodes['Background']
bg.inputs['Color'].default_value = (0.85, 0.5, 0.32, 1); bg.inputs['Strength'].default_value = 1.4

def area(name, loc, size, power, color, rot=(0, 0, 0), shape='RECTANGLE', size_y=None):
    l = bpy.data.lights.new(name, 'AREA'); l.energy = power; l.color = color; l.shape = shape
    l.size = size[0]; l.size_y = size[1]
    o = link(bpy.data.objects.new(name, l)); o.location = loc; o.rotation_euler = rot
    return o

for y in (-1.0, 1.2):
    area('ceilLed', (0, y, H - 0.1), (6.2, 0.25), 520, (0.86, 0.93, 1.0))
area('benchLamp', (0, BY, 2.1), (1.7, 0.12), 160, (0.95, 0.97, 1.0))
area('alcoveGlow', (X0 - 1.0, 1.0, 2.5), (1.6, 2.0), 260, (0.3, 0.95, 0.9))
area('windowFill', (0, Y1 + 0.3, 1.85), (4.0, 1.8), 650, (1.0, 0.62, 0.42), rot=(math.radians(-90), 0, 0))
sun = bpy.data.lights.new('marsSun', 'SUN'); sun.energy = 2.2; sun.color = (1.0, 0.72, 0.5); sun.angle = math.radians(2)
so = link(bpy.data.objects.new('marsSun', sun)); so.rotation_euler = (math.radians(75), 0, math.radians(200))

print(f'[lab] geometry built: {len(static)} static parts in {time.time() - t0:.1f}s')

# ---------------- merge, unwrap, bake ----------------
def big(o):
    d = o.dimensions
    return max(d) > 0.45 and sorted(d)[1] > 0.12
bake_set = [o for o in static if big(o)]
detail_set = [o for o in static if not big(o)]
detail = join(detail_set, 'LAB_detail')
lab = join(bake_set, 'LAB_static')
lightmap_uv(lab, 0.004 if not DRAFT else 0.006)
print(f'[lab] uv done {time.time() - t0:.1f}s, baked parts={len(bake_set)} detail parts={len(detail_set)}')

if A.get('preview'):
    preview_camera((0, 0.15, 1.2), (0, 3, 1.15), 18)
    render_preview(os.path.join(CACHE, 'preview_lab.png'), 960, 540, samples=16 if DRAFT else 48)
    preview_camera((-3.4, -2.55, 1.9), (1.8, 1.4, 1.0), 16)
    render_preview(os.path.join(CACHE, 'preview_lab_wide2.png'), 960, 540, samples=16 if DRAFT else 48)
    preview_camera((1.55, -0.35, 1.2), (4.0, -0.2, 1.3), 16)
    render_preview(os.path.join(CACHE, 'preview_lab_wide.png'), 960, 540, samples=16 if DRAFT else 48)
    print(f'[lab] previews {time.time() - t0:.1f}s')

img = bake_lightmap(lab, 1024 if DRAFT else 2048, 32 if DRAFT else 512)
print(f'[lab] bake done {time.time() - t0:.1f}s')
save_image(img, os.path.join(OUT, 'lab_lightmap.webp'), 'WEBP', 90)   # full 2048: crisper contact shadows
save_image(img, os.path.join(CACHE, 'lab_lightmap.png'), 'PNG')

export_glb(os.path.join(CACHE, 'lab_raw.glb'),
           [lab, detail] + tps + dynamic + [o for o in sc.objects if o.type == 'EMPTY'])
print(f'[lab] exported {time.time() - t0:.1f}s')
