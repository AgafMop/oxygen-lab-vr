"""Robi the lab robot → blender/cache/robi_raw.glb (optimize → assets/robi.glb).

Faces Blender -Y (three +Z, so Object3D.lookAt aims its face). Root origin on the floor;
the body floats ~0.35 m up (bobbing is done in three).
Pivots: R_head at the neck, R_armL/R_armR at the shoulders, R_face on the visor front.
Run: blender -b --factory-startup --python blender/build_robi.py [-- --preview]
"""
import bpy, math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *  # noqa

A = args()
sc = reset()
M = {
    'shell': mat('M_robiShell', (0.93, 0.93, 0.92), 0.22),
    'dark': mat('M_robiDark', (0.06, 0.07, 0.08), 0.3, 0.4),
    'visor': mat('M_robiVisor', (0.02, 0.03, 0.04), 0.08),
    'orange': mat('M_robiOrange', (0.95, 0.4, 0.1), 0.35),
    'glow': mat('M_robiGlow', (0.1, 0.6, 0.6), 0.3, 0, (0.24, 0.9, 0.85), 5.0),
    'joint': mat('M_robiJoint', (0.55, 0.57, 0.6), 0.3, 0.9),
}

def pivot(o, p):
    bpy.context.scene.cursor.location = p
    for x in bpy.context.selected_objects: x.select_set(False)
    o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    return o

def parent(child, par):
    child.parent = par
    child.matrix_parent_inverse = par.matrix_world.inverted()

root = empty('R_root', (0, 0, 0))

# body: teardrop shell with an orange band and a chest light
Z0 = 0.36
body = lathe('b', [(0.0, Z0), (0.07, Z0 + 0.01), (0.15, Z0 + 0.05), (0.195, Z0 + 0.14), (0.2, Z0 + 0.24), (0.18, Z0 + 0.33), (0.12, Z0 + 0.39), (0.0, Z0 + 0.4)], (0, 0, 0), M['shell'], 48)
band = cyl('band', 0.203, 0.035, (0, 0, Z0 + 0.2), M['orange'], 48, cap=False)
chest = cyl('chest', 0.035, 0.01, (0, -0.197, Z0 + 0.28), M['glow'], 24)
chest.rotation_euler = (math.pi / 2, 0, 0)
skirt = cyl('skirt', 0.09, 0.05, (0, 0, Z0 - 0.01), M['dark'], 32, r2=0.07)
body = join([body, band, chest, skirt], 'R_body')
pivot(body, (0, 0, Z0)); parent(body, root)

thr = cyl('R_thruster', 0.065, 0.08, (0, 0, Z0 - 0.07), M['glow'], 32, r2=0.03)
thr.rotation_euler = (math.pi, 0, 0)
pivot(thr, (0, 0, Z0 - 0.03)); parent(thr, body)

# head: rounded box with a dark visor; antenna
HZ = Z0 + 0.47
neck = cyl('neck', 0.045, 0.06, (0, 0, Z0 + 0.42), M['joint'], 20)
head = box('h', (0.34, 0.25, 0.23), (0, 0, HZ + 0.1), M['shell'], 0.07, 4)
visor = box('v', (0.29, 0.02, 0.16), (0, -0.122, HZ + 0.1), M['visor'], 0.04, 3)
ear_l = cyl('earL', 0.04, 0.03, (-0.18, 0, HZ + 0.1), M['orange'], 24); ear_l.rotation_euler = (0, math.pi / 2, 0)
ear_r = cyl('earR', 0.04, 0.03, (0.18, 0, HZ + 0.1), M['orange'], 24); ear_r.rotation_euler = (0, math.pi / 2, 0)
ant = cyl('ant', 0.006, 0.12, (0.08, 0.02, HZ + 0.27), M['joint'], 8)
antb = cyl('antb', 0.018, 0.03, (0.08, 0.02, HZ + 0.34), M['orange'], 16)
head = join([head, visor, ear_l, ear_r, ant, antb, neck], 'R_head')
pivot(head, (0, 0, Z0 + 0.42)); parent(head, root)

face = box('R_face', (0.25, 0.004, 0.13), (0, -0.134, HZ + 0.1), M['glow'])
pivot(face, (0, -0.134, HZ + 0.1)); parent(face, head)

# arms: shoulder ball + capsule + two-finger claw, hanging down from the pivot
def arm(side):
    x = 0.215 * side
    sh = cyl('sh', 0.045, 0.05, (x, 0, Z0 + 0.27), M['joint'], 20); sh.rotation_euler = (0, math.pi / 2, 0)
    up = cyl('up', 0.035, 0.2, (x + 0.02 * side, 0, Z0 + 0.15), M['shell'], 20)
    cuff = cyl('cuff', 0.038, 0.025, (x + 0.02 * side, 0, Z0 + 0.04), M['orange'], 20)
    f1 = box('f1', (0.012, 0.022, 0.05), (x + 0.02 * side - 0.016, 0, Z0 + 0.0), M['dark'], 0.004)
    f2 = box('f2', (0.012, 0.022, 0.05), (x + 0.02 * side + 0.016, 0, Z0 + 0.0), M['dark'], 0.004)
    a = join([sh, up, cuff, f1, f2], 'R_armL' if side < 0 else 'R_armR')
    pivot(a, (x, 0, Z0 + 0.27)); parent(a, body)
    return a

arm_l, arm_r = arm(-1), arm(1)
parts = [root, body, thr, head, face, arm_l, arm_r]
for o in parts:
    if o.data: o.data.name = o.name

if A.get('preview'):
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
    w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.42, 0.45, 0.5, 1)
    l = bpy.data.lights.new('key', 'AREA'); l.energy = 120; l.size = 1.5
    lo = link(bpy.data.objects.new('key', l)); lo.location = (0.8, -1.4, 1.6)
    lo.rotation_euler = (math.radians(50), 0, math.radians(30))
    floor = box('pf', (6, 6, 0.01), (0, 0, -0.005), mat('pfm', (0.25, 0.26, 0.28), 0.6))
    preview_camera((0.55, -1.5, 0.95), (0, 0, 0.62), 40)
    render_preview(os.path.join(CACHE, 'preview_robi.png'), 720, 720, samples=48)
    bpy.data.objects.remove(floor)

export_glb(os.path.join(CACHE, 'robi_raw.glb'), parts)
print('[robi] exported')
