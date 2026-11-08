"""Crew member in a white work suit with a dark visor → blender/cache/crew_raw.glb (→ assets/crew.glb).

Faces Blender -Y (three +Z). Pivots: C_armL/C_armR at the shoulders, C_legL/C_legR at the hips, C_head at the neck.
Run: blender -b --factory-startup --python blender/build_crew.py [-- --preview]
"""
import bpy, math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *  # noqa

A = args()
FEMALE = A.get('variant') == 'female'    # Dr. Azoulay: narrower shoulders, a waist, hip proportions — body shape only
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
PROFILE = ([(0.0, 0.88), (0.2, 0.89), (0.228, 0.95), (0.2, 1.03), (0.135, 1.13), (0.162, 1.22), (0.18, 1.3), (0.162, 1.39), (0.115, 1.46), (0.0, 1.48)]
           if FEMALE else [(0.0, 0.92), (0.17, 0.93), (0.2, 1.05), (0.22, 1.25), (0.21, 1.4), (0.15, 1.48), (0.0, 1.5)])
torso = lathe('t', PROFILE, (0, 0, 0), M['suit'], 48)
torso.scale = (1.0, 0.7 if FEMALE else 0.72, 1.0)
pack = box('pack', (0.28 if FEMALE else 0.32, 0.13, 0.4), (0, 0.18, 1.24), M['suitDark'], 0.03)
belt = cyl('belt', 0.158 if FEMALE else 0.205, 0.05, (0, 0, 1.12 if FEMALE else 0.98), M['suitDark'], 32); belt.scale = (1, 0.72, 1)
stripe = cyl('stripe', 0.196 if FEMALE else 0.222, 0.03, (0, 0, 1.3), M['orange'], 32, cap=False); stripe.scale = (1, 0.72, 1)
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

def ball(name, r, loc, m):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=24, ring_count=12)
    o = bpy.context.active_object; o.name = name; o.data.materials.append(m); smooth(o); return o

def limb(name, x, top, length, r, side_tilt=0.0, boot=False, hand=False):
    # tapered, padded segments (lathe profile from the joint at `top` downwards), rounded joints
    L = length
    prof = [(0.0, 0.0), (r * 1.02, -0.01), (r * 1.08, -L * 0.18), (r * 0.98, -L * 0.45), (r * 0.9, -L * 0.52),
            (r * 0.92, -L * 0.6), (r * 0.86, -L * 0.85), (r * 0.78, -L), (0.0, -L - 0.005)]
    seg = lathe('seg', [(a, top + b) for a, b in prof], (x, 0, 0), M['suit'], 24)
    joint = ball('j', r * 1.05, (x, 0, top - L * 0.5), M['suitDark'])
    parts = [seg, joint]
    if hand: parts.append(ball('pad', r * 1.08, (x, 0, top - 0.01), M['suit']))      # rounded shoulder
    if boot: parts.append(box('boot', (r * 2.2, r * 3.2, 0.09), (x, -r * 0.6, top - L - 0.04), M['suitDark'], 0.03))
    if hand:
        g = ball('glove', r * 0.95, (x, 0, top - L - 0.05), M['orange']); g.scale = (1, 0.8, 1.25); parts.append(g)
    o = join(parts, name)
    pivot(o, (x, 0, top))
    return o

SX, ARM_R, LEG_X, LEG_R = (0.215, 0.05, 0.105, 0.072) if FEMALE else (0.25, 0.055, 0.1, 0.075)
arm_l = limb('C_armL', -SX, 1.4 if FEMALE else 1.42, 0.58 if FEMALE else 0.6, ARM_R, hand=True); parent(arm_l, torso)
arm_r = limb('C_armR', SX, 1.4 if FEMALE else 1.42, 0.58 if FEMALE else 0.6, ARM_R, hand=True); parent(arm_r, torso)
leg_l = limb('C_legL', -LEG_X, 0.9 if FEMALE else 0.92, 0.82 if FEMALE else 0.84, LEG_R, boot=True); parent(leg_l, root)
leg_r = limb('C_legR', LEG_X, 0.9 if FEMALE else 0.92, 0.82 if FEMALE else 0.84, LEG_R, boot=True); parent(leg_r, root)

if FEMALE:                 # arms angled slightly out, clear of the hips
    arm_l.rotation_euler = (0, 0.09, 0); arm_r.rotation_euler = (0, -0.09, 0)
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
    render_preview(os.path.join(CACHE, 'preview_crew_f.png' if FEMALE else 'preview_crew.png'), 640, 800, samples=32)
    bpy.data.objects.remove(floor)

export_glb(os.path.join(CACHE, 'crew_f_raw.glb' if FEMALE else 'crew_raw.glb'), parts)
print('[crew] exported')
