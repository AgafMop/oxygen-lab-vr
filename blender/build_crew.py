"""Crew member in a white work suit with a dark visor → blender/cache/crew_raw.glb (→ assets/crew.glb).

Faces Blender -Y (three +Z). Pivots: C_armL/C_armR at the shoulders, C_legL/C_legR at the hips, C_head at the neck.
Run: blender -b --factory-startup --python blender/build_crew.py [-- --preview]
"""
import bpy, math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *  # noqa

A = args()
sc = reset()
M = {
    'suit': mat('M_suit', (0.86, 0.86, 0.84), 0.55),
    'suitDark': mat('M_suitDark', (0.25, 0.27, 0.3), 0.5, 0.2),
    'orange': mat('M_suitOrange', (0.92, 0.38, 0.1), 0.45),
    'visor': mat('M_visor', (0.02, 0.025, 0.03), 0.04, 0.9),
    'glow': mat('M_suitGlow', (0.1, 0.6, 0.6), 0.3, 0, (0.24, 0.9, 0.85), 3.0),
}

def pivot(o, p):
    bpy.context.scene.cursor.location = p
    for x in bpy.context.selected_objects: x.select_set(False)
    o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    return o

def parent(c, p):
    c.parent = p; c.matrix_parent_inverse = p.matrix_world.inverted()

root = empty('C_root', (0, 0, 0))

# torso + backpack + belt + chest light
torso = lathe('t', [(0.0, 0.92), (0.17, 0.93), (0.2, 1.05), (0.22, 1.25), (0.21, 1.4), (0.15, 1.48), (0.0, 1.5)], (0, 0, 0), M['suit'], 32)
torso.scale = (1.0, 0.72, 1.0)
pack = box('pack', (0.32, 0.14, 0.42), (0, 0.19, 1.22), M['suitDark'], 0.03)
belt = cyl('belt', 0.205, 0.06, (0, 0, 0.98), M['suitDark'], 32); belt.scale = (1, 0.74, 1)
stripe = cyl('stripe', 0.222, 0.03, (0, 0, 1.3), M['orange'], 32, cap=False); stripe.scale = (1, 0.74, 1)
light = cyl('light', 0.025, 0.01, (0.08, -0.15, 1.33), M['glow'], 16); light.rotation_euler = (math.pi / 2, 0, 0)
patch = box('patch', (0.07, 0.01, 0.05), (-0.09, -0.152, 1.34), M['orange'], 0.004)
torso = join([torso, pack, belt, stripe, light, patch], 'C_torso')
pivot(torso, (0, 0, 0.95)); parent(torso, root)

# head: helmet + visor + neck ring
ring = cyl('ring', 0.1, 0.05, (0, 0, 1.5), M['suitDark'], 24)
helm = bpy.data.objects.new('h', bpy.data.meshes.new('h')); link(helm)
bpy.ops.mesh.primitive_uv_sphere_add(radius=0.15, location=(0, 0, 1.65), segments=32, ring_count=16)
helm = bpy.context.active_object; helm.data.materials.append(M['suit']); smooth(helm)
bpy.ops.mesh.primitive_uv_sphere_add(radius=0.152, location=(0, -0.012, 1.655), segments=32, ring_count=16)
visor = bpy.context.active_object
import bmesh as _bm
bmv = _bm.new(); bmv.from_mesh(visor.data)
_bm.ops.delete(bmv, geom=[v for v in bmv.verts if v.co.y > -0.06 or abs(v.co.z) > 0.09], context='VERTS')
bmv.to_mesh(visor.data); bmv.free()
visor.data.materials.append(M['visor']); smooth(visor)
lamp = cyl('lamp', 0.02, 0.03, (0.12, -0.04, 1.73), M['glow'], 12); lamp.rotation_euler = (math.pi / 2, 0, 0)
head = join([helm, visor, ring, lamp], 'C_head')
pivot(head, (0, 0, 1.5)); parent(head, torso)

def limb(name, x, top, length, r, side_tilt=0.0, boot=False, hand=False):
    up = cyl('u', r, length * 0.5, (x, 0, top - length * 0.25), M['suit'], 18)
    lo = cyl('l', r * 0.92, length * 0.5, (x, 0, top - length * 0.75), M['suit'], 18)
    joint = cyl('j', r * 1.05, 0.04, (x, 0, top - length * 0.5), M['suitDark'], 18)
    parts = [up, lo, joint]
    if boot: parts.append(box('boot', (r * 2.3, r * 3.2, 0.08), (x, -r * 0.6, top - length - 0.04), M['suitDark'], 0.02))
    if hand: parts.append(box('glove', (r * 1.8, r * 1.4, 0.1), (x, 0, top - length - 0.05), M['orange'], 0.02))
    o = join(parts, name)
    pivot(o, (x, 0, top))
    return o

arm_l = limb('C_armL', -0.25, 1.42, 0.6, 0.055, hand=True); parent(arm_l, torso)
arm_r = limb('C_armR', 0.25, 1.42, 0.6, 0.055, hand=True); parent(arm_r, torso)
leg_l = limb('C_legL', -0.1, 0.92, 0.84, 0.075, boot=True); parent(leg_l, root)
leg_r = limb('C_legR', 0.1, 0.92, 0.84, 0.075, boot=True); parent(leg_r, root)

parts = [root, torso, head, arm_l, arm_r, leg_l, leg_r]
for o in parts:
    if o.data: o.data.name = o.name

if A.get('preview'):
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
    w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.4, 0.42, 0.46, 1)
    l = bpy.data.lights.new('key', 'AREA'); l.energy = 250; l.size = 2
    lo = link(bpy.data.objects.new('key', l)); lo.location = (1.2, -2.2, 2.4); lo.rotation_euler = (math.radians(50), 0, math.radians(25))
    floor = box('pf', (6, 6, 0.01), (0, 0, -0.005), mat('pfm', (0.25, 0.26, 0.28), 0.6))
    preview_camera((0.9, -2.6, 1.3), (0, 0, 1.0), 40)
    render_preview(os.path.join(CACHE, 'preview_crew.png'), 640, 800, samples=32)
    bpy.data.objects.remove(floor)

export_glb(os.path.join(CACHE, 'crew_raw.glb'), parts)
print('[crew] exported')
