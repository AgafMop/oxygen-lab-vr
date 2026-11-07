"""Base corridor with four "life" alcoves → blender/cache/corridor_raw.glb + assets/corridor_lightmap.webp.

Placed away from the lab (x≈20) and reached by a fade-teleport through the lab door.
Corridor runs along -Y (three +Z). Stations ST_corr, ST_case1..4 (yaw extras), anchors A_case1..4, discs TP_*.
Run: blender -b --factory-startup --python blender/build_corridor.py -- --out assets [--draft] [--preview]
"""
import bpy, math, os, sys, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *  # noqa

A = args()
OUT = os.path.abspath(A.get('out', 'assets'))
DRAFT = bool(A.get('draft'))
sc = reset()
CX, W, H, L = 20.0, 2.4, 2.7, 11.0          # corridor centre x, width, height, length (y from 0 to -L)
X0, X1 = CX - W / 2, CX + W / 2
static, dynamic = [], []
S = lambda o: (static.append(o), o)[1]

M = {
    'panel': mat('M_panel', (0.80, 0.81, 0.83), 0.45), 'panelLow': mat('M_panelLow', (0.13, 0.17, 0.22), 0.4, 0.25),
    'orange': mat('M_orange', (0.85, 0.33, 0.1), 0.35), 'rib': mat('M_rib', (0.16, 0.17, 0.19), 0.38, 0.7),
    'ceil': mat('M_ceil', (0.22, 0.23, 0.25), 0.6, 0.2), 'led': mat('M_led', (0.9, 0.95, 1.0), 0.3, 0, (0.86, 0.93, 1.0), 10.0),
    'white': mat('M_white', (0.9, 0.9, 0.88), 0.35), 'steel': mat('M_steel', (0.7, 0.72, 0.75), 0.3, 1.0),
    'dark': mat('M_dark', (0.08, 0.09, 0.1), 0.4, 0.3), 'mattress': mat('M_mattress', (0.55, 0.75, 0.85), 0.7),
    'wood': mat('M_wood', (0.55, 0.38, 0.22), 0.6), 'dough': mat('M_dough', (0.93, 0.85, 0.68), 0.85),
    'green': mat('M_green', (0.05, 0.55, 0.25), 0.4), 'blue': mat('M_blue', (0.15, 0.35, 0.65), 0.4),
    'warm': mat('M_warm', (1, 0.85, 0.6), 0.3, 0, (1.0, 0.82, 0.55), 6.0), 'screen': mat('M_scr', (0.02, 0.08, 0.09), 0.2, 0, (0.15, 0.55, 0.6), 2.0),
    'basket': mat('M_basket', (0.7, 0.55, 0.3), 0.8), 'cloth': mat('M_cloth', (0.75, 0.3, 0.3), 0.9),
}
floor_maps = polyhaven_texture('concrete_floor_01', '1k')
M['floor'] = pbr_material('M_floor', floor_maps, tint=(0.36, 0.38, 0.42))

def wall_x(x, y0, y1, gaps, inward):
    """Wall at x from y0>y1 (descending), leaving openings [(ya, yb)]."""
    segs, cur = [], y0
    for (ga, gb) in sorted(gaps, reverse=True):
        if cur > ga: segs.append((cur, ga))
        cur = gb
    if cur > y1: segs.append((cur, y1))
    for (a, b) in segs:
        mid, ln = (a + b) / 2, a - b
        S(box('wl', (0.08, ln, 0.98), (x, mid, 0.49), M['panelLow'], 0.01))
        S(box('wo', (0.09, ln, 0.04), (x, mid, 1.0), M['orange']))
        S(box('wu', (0.08, ln, H - 1.02), (x, mid, 1.02 + (H - 1.02) / 2), M['panel'], 0.01))
        for k in range(int(ln // 1.2)):
            S(box('seam', (0.085, 0.015, H - 0.1), (x, a - 1.2 * (k + 1), H / 2), M['rib']))

# shell
fl = S(box('floor', (W, L, 0.1), (CX, -L / 2, -0.05), M['floor'])); uv_box_project(fl, 0.5)
S(box('ceil', (W, L, 0.1), (CX, -L / 2, H + 0.05), M['ceil']))
S(box('led', (0.25, L - 0.6, 0.02), (CX, -L / 2, H - 0.02), M['led']))
alcoves = [(-2.5, -1), (-4.8, 1), (-7.1, -1), (-9.4, 1)]   # (y, side): side -1 = west (x<X0), +1 = east
wall_x(X0, 0, -L, [(y + 0.95, y - 0.95) for (y, sd) in alcoves if sd < 0], 1)
wall_x(X1, 0, -L, [(y + 0.95, y - 0.95) for (y, sd) in alcoves if sd > 0], -1)
S(box('endWall', (W, 0.08, H), (CX, -L - 0.04, H / 2), M['panelLow'], 0.01))
S(box('startWall', (W, 0.08, H), (CX, 0.04, H / 2), M['panelLow'], 0.01))
S(box('doorFrame', (1.2, 0.12, 2.4), (CX, 0.0, 1.2), M['rib'], 0.02))
S(box('door', (1.0, 0.06, 2.28), (CX, 0.03, 1.14), M['steel'], 0.01))
S(box('doorStripe', (1.0, 0.065, 0.06), (CX, 0.0, 1.1), M['orange']))

def alcove(y, sd):
    xo = X0 - 0.8 if sd < 0 else X1 + 0.8          # alcove centre
    xb = X0 - 1.6 if sd < 0 else X1 + 1.6          # back wall
    S(box('aFloor', (1.6, 1.9, 0.1), (xo, y, -0.05), M['floor']))
    S(box('aCeil', (1.6, 1.9, 0.1), (xo, y, H + 0.05), M['ceil']))
    S(box('aBack', (0.08, 1.9, H), (xb, y, H / 2), M['panel'], 0.01))
    for dy in (0.95, -0.95):
        S(box('aSide', (1.6, 0.08, H), (xo, y + dy, H / 2), M['panelLow'], 0.01))
    S(box('aLamp', (0.5, 0.5, 0.03), (xo, y, H - 0.02), M['warm']))
    return xo, xb

random.seed(4)
# 1 clinic (west): bed, monitor, IV pole
xo, xb = alcove(*alcoves[0]); y = alcoves[0][0]
S(box('bedFrame', (0.9, 1.9, 0.08), (xo, y, 0.55), M['steel'], 0.02))
for dx, dy in ((0.4, 0.85), (-0.4, 0.85), (0.4, -0.85), (-0.4, -0.85)):
    S(cyl('bedLeg', 0.025, 0.55, (xo + dx, y + dy, 0.275), M['steel'], 10))
S(box('mattress', (0.85, 1.8, 0.14), (xo, y, 0.66), M['mattress'], 0.05))
S(box('pillow', (0.6, 0.3, 0.1), (xo, y + 0.7, 0.78), M['white'], 0.04))
mon = box('monitorBody', (0.06, 0.5, 0.36), (xb + 0.06, y - 0.4, 1.5), M['dark'], 0.02); S(mon)
dynamic.append(box('SCR_clinic', (0.01, 0.44, 0.3), (xb + 0.095, y - 0.4, 1.5), M['screen']))
S(cyl('ivPole', 0.015, 1.8, (xo + 0.55 * (-sd if False else 1) * (1 if alcoves[0][1] < 0 else -1), y - 0.75, 0.9), M['steel'], 8))
# 2 kitchen (east): counter, oven, bowl of flat dough, jars
xo, xb = alcove(*alcoves[1]); y = alcoves[1][0]
S(box('counter', (0.65, 1.8, 0.9), (xb - 0.35, y, 0.45), M['white'], 0.02))
S(box('counterTop', (0.7, 1.85, 0.04), (xb - 0.37, y, 0.92), M['wood'], 0.01))
S(box('ovenDoor', (0.02, 0.6, 0.5), (xb - 0.69, y - 0.5, 0.45), M['dark'], 0.01))
S(lathe('bowl', [(0.0, 0.0), (0.12, 0.0), (0.2, 0.05), (0.23, 0.13), (0.24, 0.135)], (xb - 0.4, y + 0.3, 0.94), M['steel'], 32))
S(lathe('doughFlat', [(0.0, 0.0), (0.19, 0.0), (0.2, 0.02), (0.0, 0.04)], (xb - 0.4, y + 0.3, 1.0), M['dough'], 24))
for k in range(4):
    S(cyl('jar', 0.05, 0.16, (xb - 0.15, y - 0.2 + k * 0.14, 1.02), random.choice([M['blue'], M['orange'], M['green']]), 14))
# 3 first aid (west): green cabinet with white cross, bench
xo, xb = alcove(*alcoves[2]); y = alcoves[2][0]
S(box('cabinet', (0.2, 0.7, 0.6), (xb + 0.12, y, 1.5), M['green'], 0.02))
S(box('crossV', (0.02, 0.1, 0.34), (xb + 0.23, y, 1.5), M['white']))
S(box('crossH', (0.02, 0.34, 0.1), (xb + 0.23, y, 1.5), M['white']))
S(box('bench', (0.5, 1.4, 0.06), (xo, y, 0.45), M['wood'], 0.02))
for dy in (0.6, -0.6):
    S(box('benchLeg', (0.45, 0.06, 0.45), (xo, y + dy, 0.225), M['steel'], 0.01))
# 4 laundry (east): washing machine with round door, basket, detergent box
xo, xb = alcove(*alcoves[3]); y = alcoves[3][0]
S(box('washer', (0.65, 0.65, 0.85), (xb - 0.38, y - 0.35, 0.425), M['white'], 0.03))
wd = cyl('washerDoor', 0.2, 0.04, (xb - 0.71, y - 0.35, 0.5), M['dark'], 32); wd.rotation_euler = (0, math.pi / 2, 0); S(wd)
S(cyl('basket', 0.25, 0.35, (xb - 0.4, y + 0.45, 0.175), M['basket'], 20, r2=0.2))
S(box('clothes', (0.3, 0.3, 0.08), (xb - 0.4, y + 0.45, 0.36), M['cloth'], 0.04))
S(box('detergent', (0.25, 0.15, 0.3), (xb - 0.35, y - 0.35, 1.0), M['orange'], 0.02))

# stations, anchors, discs
def station(name, x, y, fx, fy):
    empty(name, (x, y, 0), yaw=yaw_facing(fx, fy))
station('ST_corr', CX, -0.9, 0, -1)
tp = mat('M_tp', (0.1, 0.5, 0.5), 0.4, 0, (0.24, 0.85, 0.8), 1.5)
tps = [cyl('TP_corr', 0.3, 0.012, (CX, -0.9, 0.006), tp, 40)]
for i, (y, sd) in enumerate(alcoves, 1):
    station(f'ST_case{i}', CX + 0.15 * sd, y, sd, 0)
    xo = X0 - 0.8 if sd < 0 else X1 + 0.8
    empty(f'A_case{i}', (xo, y, 0), yaw=yaw_normal(-sd, 0))
    tps.append(cyl(f'TP_case{i}', 0.3, 0.012, (CX + 0.15 * sd, y, 0.006), tp, 40))

# lighting for the bake
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.05, 0.05, 0.06, 1)
def area(loc, size, power, color):
    l = bpy.data.lights.new('a', 'AREA'); l.energy = power; l.color = color; l.size = size[0]; l.shape = 'RECTANGLE'; l.size_y = size[1]
    o = link(bpy.data.objects.new('a', l)); o.location = loc
area((CX, -L / 2, H - 0.06), (0.3, L - 1), 700, (0.86, 0.93, 1.0))
for (y, sd) in alcoves:
    area((X0 - 0.8 if sd < 0 else X1 + 0.8, y, H - 0.06), (0.5, 0.5), 140, (1.0, 0.82, 0.6))

def big(o):
    d = o.dimensions
    return max(d) > 0.45 and sorted(d)[1] > 0.12
bake_set = [o for o in static if big(o)]
detail = join([o for o in static if not big(o)], 'CORR_detail')
corr = join(bake_set, 'CORR_static')
lightmap_uv(corr, 0.004)
if A.get('preview'):
    preview_camera((CX, -0.6, 1.25), (CX, -8, 1.0), 16)
    render_preview(os.path.join(CACHE, 'preview_corridor.png'), 960, 540, samples=24)
img = bake_lightmap(corr, 512 if DRAFT else 1024, 32 if DRAFT else 128)
save_image(img, os.path.join(OUT, 'corridor_lightmap.webp'), 'WEBP', 90, scale=0.5)
export_glb(os.path.join(CACHE, 'corridor_raw.glb'), [corr, detail] + tps + dynamic + [o for o in sc.objects if o.type == 'EMPTY'])
print('[corridor] exported')
