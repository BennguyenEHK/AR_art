"""
generate_character.py — Blender 4.x script
AR Gun Violence Awareness Art Project

Creates two stylized low-poly 3D characters and exports each as GLB:
  character-mode-a.glb  — Mode A: young man sitting curled up in war-zone misery
  character-mode-b.glb  — Mode B: same man standing as a white-robed angel with wings

Run with:
  blender --background --python generate_character.py
"""

import bpy
import bmesh
import os
import math

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_A = os.path.normpath(os.path.join(SCRIPT_DIR, '../models/character-mode-a.glb'))
OUTPUT_B = os.path.normpath(os.path.join(SCRIPT_DIR, '../models/character-mode-b.glb'))


# ---------------------------------------------------------------------------
# Utilities
# ---------------------------------------------------------------------------

def hex_to_linear(hex_color):
    """Convert a '#RRGGBB' hex string to a linear-space (r, g, b, a) tuple."""
    hex_color = hex_color.lstrip('#')
    r = int(hex_color[0:2], 16) / 255.0
    g = int(hex_color[2:4], 16) / 255.0
    b = int(hex_color[4:6], 16) / 255.0
    # Convert sRGB -> linear (Blender expects linear for Base Color)
    def srgb_to_linear(c):
        if c <= 0.04045:
            return c / 12.92
        return ((c + 0.055) / 1.055) ** 2.4
    return (srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b), 1.0)


def make_material(name, color_hex, roughness=0.9, metalness=0.0, emissive_strength=0.0):
    """Create (or reuse) a Principled BSDF material from a hex color string."""
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    nodes.clear()

    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.location = (0, 0)
    bsdf.inputs['Base Color'].default_value = hex_to_linear(color_hex)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metalness

    # Emission (Blender 4.x uses 'Emission Color' + 'Emission Strength')
    if emissive_strength > 0.0:
        base = hex_to_linear(color_hex)
        if 'Emission Color' in bsdf.inputs:
            bsdf.inputs['Emission Color'].default_value = base
        elif 'Emission' in bsdf.inputs:
            bsdf.inputs['Emission'].default_value = base
        if 'Emission Strength' in bsdf.inputs:
            bsdf.inputs['Emission Strength'].default_value = emissive_strength

    output = nodes.new('ShaderNodeOutputMaterial')
    output.location = (300, 0)
    mat.node_tree.links.new(bsdf.outputs['BSDF'], output.inputs['Surface'])
    return mat


def assign_material(obj, mat):
    """Assign a material to an object, replacing any existing slots."""
    obj.data.materials.clear()
    obj.data.materials.append(mat)


def clear_scene():
    """Delete all objects and orphaned data in the current scene."""
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    # Purge orphaned mesh/material data
    for block in bpy.data.meshes:
        if block.users == 0:
            bpy.data.meshes.remove(block)
    for block in bpy.data.materials:
        if block.users == 0:
            bpy.data.materials.remove(block)


def add_uv_sphere(name, location, rotation=(0, 0, 0), radius=0.12,
                  segments=6, rings=6, material=None):
    """Add a UV sphere and return the object."""
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segments,
        ring_count=rings,
        radius=radius,
        location=location,
        rotation=rotation
    )
    obj = bpy.context.active_object
    obj.name = name
    if material:
        assign_material(obj, material)
    return obj


def add_cube(name, location, rotation=(0, 0, 0), dimensions=(1, 1, 1), material=None):
    """Add a cube scaled to the given dimensions and return the object."""
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=rotation)
    obj = bpy.context.active_object
    obj.name = name
    # 'dimensions' in Blender is full size (not half-extents)
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(scale=True)
    if material:
        assign_material(obj, material)
    return obj


def add_cylinder(name, location, rotation=(0, 0, 0),
                 radius=0.085, depth=0.28, vertices=5, material=None):
    """Add a cylinder and return the object."""
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=depth,
        location=location,
        rotation=rotation
    )
    obj = bpy.context.active_object
    obj.name = name
    if material:
        assign_material(obj, material)
    return obj


def add_torus(name, location, rotation=(0, 0, 0),
              major_radius=0.14, minor_radius=0.012,
              major_segments=16, minor_segments=6, material=None):
    """Add a torus and return the object."""
    bpy.ops.mesh.primitive_torus_add(
        location=location,
        rotation=rotation,
        major_radius=major_radius,
        minor_radius=minor_radius,
        major_segments=major_segments,
        minor_segments=minor_segments
    )
    obj = bpy.context.active_object
    obj.name = name
    if material:
        assign_material(obj, material)
    return obj


def add_wing_mesh(name, location, rotation=(0, 0, 0), flip_x=False, material=None):
    """
    Build a simple triangular wing from a custom mesh (4 verts, 2 tris).
    The wing is roughly 0.9 wide and 0.8 tall, pointing outward and upward.
    flip_x=True mirrors for the right wing.
    """
    mesh = bpy.data.meshes.new(name + '_mesh')
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)

    bm = bmesh.new()
    sign = -1.0 if flip_x else 1.0

    # Verts relative to local origin: tip inward at shoulder, spread outward/up
    v0 = bm.verts.new((0.0,         0.0,   0.0))   # shoulder attach
    v1 = bm.verts.new((sign * 0.9,  0.05,  0.3))   # outer tip
    v2 = bm.verts.new((sign * 0.55, 0.0,  -0.7))   # lower tip
    v3 = bm.verts.new((sign * 0.3,  0.0,   0.5))   # upper-middle point

    bm.faces.new([v0, v3, v1])
    bm.faces.new([v0, v2, v1])

    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()

    obj.location = location
    obj.rotation_euler = rotation
    if material:
        assign_material(obj, material)
    return obj


def add_wound_cracks(material):
    """
    Build the Mode A face wound cracks as one mesh of thin quad ribbons.
    Endpoints mirror the procedural crack segments, converted from the
    Three.js Y-up (x, y_up, z) frame to Blender Z-up (x, y_depth, z_up).
    FRONT_OFFSET nudges the ribbons toward the face front so the low-poly
    head facets do not occlude them; tune in Blender if needed.
    """
    # Mapping: Three.js (x, y_up, z) -> Blender (x, y_depth, z_up)
    #   i.e. Three.js Y becomes Blender Z; Three.js Z becomes Blender Y.
    # (start_xyz, end_xyz) in Blender Z-up coordinates
    segments = [
        ((0.02, 0.14, 0.76), (0.09, 0.14, 0.71)),
        ((0.09, 0.14, 0.71), (0.12, 0.12, 0.67)),
        ((0.05, 0.14, 0.73), (0.02, 0.13, 0.68)),
        ((0.02, 0.14, 0.69), (-0.03, 0.12, 0.65)),
    ]
    WIDTH = 0.006
    FRONT_OFFSET = 0.06

    mesh = bpy.data.meshes.new('wound_cracks_mesh')
    obj = bpy.data.objects.new('wound_cracks', mesh)
    bpy.context.collection.objects.link(obj)

    bm = bmesh.new()
    for (p0, p1) in segments:
        # Crack direction projected onto the X-Z face plane, and the
        # in-plane perpendicular used to give each segment ribbon width.
        dx = p1[0] - p0[0]
        dz = p1[2] - p0[2]
        length = math.hypot(dx, dz) or 1.0
        px = -dz / length
        pz = dx / length
        hw = WIDTH / 2.0
        y0 = p0[1] + FRONT_OFFSET
        y1 = p1[1] + FRONT_OFFSET
        v0 = bm.verts.new((p0[0] + px * hw, y0, p0[2] + pz * hw))
        v1 = bm.verts.new((p0[0] - px * hw, y0, p0[2] - pz * hw))
        v2 = bm.verts.new((p1[0] - px * hw, y1, p1[2] - pz * hw))
        v3 = bm.verts.new((p1[0] + px * hw, y1, p1[2] + pz * hw))
        bm.faces.new([v0, v1, v2, v3])
    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()

    if material:
        assign_material(obj, material)
    return obj


def parent_to_empty(children, empty_name, empty_location=(0, 0, 0)):
    """Create an Empty, parent all children to it, return the Empty."""
    bpy.ops.object.empty_add(type='PLAIN_AXES', location=empty_location)
    empty = bpy.context.active_object
    empty.name = empty_name
    # Deselect all
    bpy.ops.object.select_all(action='DESELECT')
    for child in children:
        child.select_set(True)
    bpy.context.view_layer.objects.active = empty
    bpy.ops.object.parent_set(type='OBJECT', keep_transform=True)
    return empty


def select_hierarchy(root):
    """Select the root empty and all its children recursively."""
    bpy.ops.object.select_all(action='DESELECT')
    root.select_set(True)
    for obj in bpy.data.objects:
        if is_child_of(obj, root):
            obj.select_set(True)


def is_child_of(obj, potential_parent):
    """Check if obj is a direct or indirect child of potential_parent."""
    current = obj.parent
    while current is not None:
        if current == potential_parent:
            return True
        current = current.parent
    return False


# ---------------------------------------------------------------------------
# Mode A — War-zone victim (sitting)
# ---------------------------------------------------------------------------

def build_mode_a():
    print("Building Mode A — War-zone victim (sitting)...")
    clear_scene()

    skin_dark   = make_material('a_skin',    '#5C3D2E', roughness=0.9)
    cloth_dark  = make_material('a_cloth',   '#2A2218', roughness=1.0)
    gun_mat     = make_material('a_gun',     '#1A1A1A', roughness=0.6, metalness=0.4)
    wood_mat    = make_material('a_gun_wood','#5C3010', roughness=0.85)

    parts = []

    # --- Head ---
    head = add_uv_sphere(
        'head',
        location=(0, 0.08, 0.68),
        rotation=(0.5, 0, 0),
        radius=0.12,
        segments=6, rings=6,
        material=skin_dark
    )
    parts.append(head)

    # --- Torso ---
    torso = add_cube(
        'torso',
        location=(0, 0.02, 0.38),
        rotation=(0.25, 0, 0),
        dimensions=(0.30, 0.18, 0.32),
        material=cloth_dark
    )
    parts.append(torso)

    # --- Upper legs ---
    # Left
    ul_left = add_cylinder(
        'upper_leg_l',
        location=(-0.1, 0.25, 0.30),
        rotation=(-1.1, 0, 0.12),
        radius=0.085, depth=0.28, vertices=5,
        material=cloth_dark
    )
    parts.append(ul_left)
    # Right (mirrored X)
    ul_right = add_cylinder(
        'upper_leg_r',
        location=(0.1, 0.25, 0.30),
        rotation=(-1.1, 0, -0.12),
        radius=0.085, depth=0.28, vertices=5,
        material=cloth_dark
    )
    parts.append(ul_right)

    # --- Lower legs ---
    # Left
    ll_left = add_cylinder(
        'lower_leg_l',
        location=(-0.1, 0.42, 0.14),
        rotation=(0.5, 0, 0.1),
        radius=0.07, depth=0.25, vertices=5,
        material=cloth_dark
    )
    parts.append(ll_left)
    # Right (mirrored X)
    ll_right = add_cylinder(
        'lower_leg_r',
        location=(0.1, 0.42, 0.14),
        rotation=(0.5, 0, -0.1),
        radius=0.07, depth=0.25, vertices=5,
        material=cloth_dark
    )
    parts.append(ll_right)

    # --- Arms ---
    # Left arm
    arm_left = add_cylinder(
        'arm_l',
        location=(-0.2, 0.18, 0.38),
        rotation=(0.8, 0, -0.5),
        radius=0.065, depth=0.26, vertices=5,
        material=skin_dark
    )
    parts.append(arm_left)
    # Right arm (mirrored X)
    arm_right = add_cylinder(
        'arm_r',
        location=(0.2, 0.18, 0.38),
        rotation=(0.8, 0, 0.5),
        radius=0.065, depth=0.26, vertices=5,
        material=skin_dark
    )
    parts.append(arm_right)

    # --- AK-47 rifle (resting across knees) ---
    # Character sits with upper-leg centres at Z=0.30, Y=0.25.
    # Lap surface sits ~0.065 above that → gun centred at Z=0.365, Y=0.27.
    # Gun is oriented along the X-axis (barrel toward -X, stock toward +X).
    GX, GY, GZ = -0.02, 0.27, 0.365   # receiver centre on the lap

    # Receiver — the main body of the rifle
    gun_body = add_cube(
        'gun_body',
        location=(GX, GY, GZ),
        rotation=(0, 0, 0.06),
        dimensions=(0.26, 0.055, 0.068),
        material=gun_mat
    )
    parts.append(gun_body)

    # Barrel — long thin cylinder from front of receiver toward muzzle (−X)
    gun_barrel = add_cylinder(
        'gun_barrel',
        location=(GX - 0.205, GY - 0.006, GZ + 0.004),
        rotation=(0, math.pi / 2, 0.06),
        radius=0.015, depth=0.21, vertices=6,
        material=gun_mat
    )
    parts.append(gun_barrel)

    # Gas tube — thin cylinder above barrel (AK-47 characteristic detail)
    gun_gas_tube = add_cylinder(
        'gun_gas_tube',
        location=(GX - 0.155, GY - 0.009, GZ + 0.038),
        rotation=(0, math.pi / 2, 0.06),
        radius=0.009, depth=0.16, vertices=5,
        material=gun_mat
    )
    parts.append(gun_gas_tube)

    # Curved 30-round magazine — hangs below receiver, angled slightly forward
    gun_magazine = add_cube(
        'gun_magazine',
        location=(GX - 0.02, GY + 0.014, GZ - 0.082),
        rotation=(-0.20, 0, 0.06),
        dimensions=(0.068, 0.042, 0.13),
        material=gun_mat
    )
    parts.append(gun_magazine)

    # Pistol grip — angled wood grip below rear of receiver
    gun_grip = add_cube(
        'gun_grip',
        location=(GX + 0.065, GY + 0.012, GZ - 0.072),
        rotation=(-0.32, 0, 0.06),
        dimensions=(0.042, 0.038, 0.088),
        material=wood_mat
    )
    parts.append(gun_grip)

    # Wooden stock — extends from the right of the receiver (butt-end)
    gun_stock = add_cube(
        'gun_stock',
        location=(GX + 0.185, GY - 0.002, GZ - 0.004),
        rotation=(0.04, 0, 0.06),
        dimensions=(0.145, 0.038, 0.052),
        material=wood_mat
    )
    parts.append(gun_stock)

    # --- Wound cracks (face) ---
    wound_mat = make_material('a_wound', '#8B2020', roughness=0.8)
    wound_cracks = add_wound_cracks(wound_mat)
    parts.append(wound_cracks)

    # Parent everything to an empty
    empty = parent_to_empty(parts, 'character_a', (0, 0, 0))

    print(f"  Mode A: {len(parts)} mesh objects created.")
    return empty


# ---------------------------------------------------------------------------
# Mode B — Angel (standing)
# ---------------------------------------------------------------------------

def build_mode_b():
    print("Building Mode B — Angel (standing)...")
    clear_scene()

    skin_light  = make_material('b_skin',    '#C8A882', roughness=0.4)
    robe        = make_material('b_robe',    '#F5F0E8', roughness=0.3)
    wing_mat    = make_material('b_wings',   '#FFFFFF',  roughness=0.2, emissive_strength=0.3)
    halo_mat    = make_material('b_halo',    '#D4A843',  roughness=0.2, metalness=0.5, emissive_strength=0.5)

    parts = []

    # --- Head ---
    head = add_uv_sphere(
        'head',
        location=(0, 0, 1.38),
        rotation=(-0.2, 0, 0),
        radius=0.12,
        segments=6, rings=6,
        material=skin_light
    )
    parts.append(head)

    # --- Torso ---
    torso = add_cube(
        'torso',
        location=(0, 0, 0.96),
        rotation=(0, 0, 0),
        dimensions=(0.28, 0.16, 0.36),
        material=robe
    )
    parts.append(torso)

    # --- Upper legs ---
    # Left
    ul_left = add_cylinder(
        'upper_leg_l',
        location=(-0.09, 0, 0.61),
        rotation=(0, 0, 0),
        radius=0.082, depth=0.34, vertices=5,
        material=robe
    )
    parts.append(ul_left)
    # Right (mirrored X)
    ul_right = add_cylinder(
        'upper_leg_r',
        location=(0.09, 0, 0.61),
        rotation=(0, 0, 0),
        radius=0.082, depth=0.34, vertices=5,
        material=robe
    )
    parts.append(ul_right)

    # --- Lower legs ---
    # Left
    ll_left = add_cylinder(
        'lower_leg_l',
        location=(-0.09, 0, 0.28),
        rotation=(0, 0, 0),
        radius=0.068, depth=0.30, vertices=5,
        material=robe
    )
    parts.append(ll_left)
    # Right (mirrored X)
    ll_right = add_cylinder(
        'lower_leg_r',
        location=(0.09, 0, 0.28),
        rotation=(0, 0, 0),
        radius=0.068, depth=0.30, vertices=5,
        material=robe
    )
    parts.append(ll_right)

    # --- Arms ---
    # Left arm (slightly raised and spread)
    arm_left = add_cylinder(
        'arm_l',
        location=(-0.22, 0, 0.98),
        rotation=(0, 0, -0.3),
        radius=0.06, depth=0.28, vertices=5,
        material=robe
    )
    parts.append(arm_left)
    # Right arm (mirrored X)
    arm_right = add_cylinder(
        'arm_r',
        location=(0.22, 0, 0.98),
        rotation=(0, 0, 0.3),
        radius=0.06, depth=0.28, vertices=5,
        material=robe
    )
    parts.append(arm_right)

    # --- Wings ---
    # Left wing: attach near left shoulder, angled upward and outward
    wing_left = add_wing_mesh(
        'wing_l',
        location=(-0.15, -0.12, 1.05),
        rotation=(0.15, -0.2, 0.1),
        flip_x=False,
        material=wing_mat
    )
    parts.append(wing_left)
    # Right wing: mirrored
    wing_right = add_wing_mesh(
        'wing_r',
        location=(0.15, -0.12, 1.05),
        rotation=(0.15, 0.2, -0.1),
        flip_x=True,
        material=wing_mat
    )
    parts.append(wing_right)

    # --- Halo ---
    halo = add_torus(
        'halo',
        location=(0, 0, 1.58),
        rotation=(0, 0, 0),
        major_radius=0.14,
        minor_radius=0.012,
        major_segments=16,
        minor_segments=6,
        material=halo_mat
    )
    parts.append(halo)

    # Parent everything to an empty
    empty = parent_to_empty(parts, 'character_b', (0, 0, 0))

    print(f"  Mode B: {len(parts)} mesh objects created.")
    return empty


# ---------------------------------------------------------------------------
# Export helper
# ---------------------------------------------------------------------------

def export_glb(filepath):
    """Export the entire scene as a binary GLTF 2.0 (.glb) file."""
    # Ensure the output directory exists
    os.makedirs(os.path.dirname(filepath), exist_ok=True)

    print(f"  Exporting to: {filepath}")
    bpy.ops.export_scene.gltf(
        filepath=filepath,
        export_format='GLB',
        use_selection=False,
        export_apply=True,
        export_materials='EXPORT',
    )


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

build_mode_a()
export_glb(OUTPUT_A)
print(f"Exported Mode A -> {OUTPUT_A}")

build_mode_b()
export_glb(OUTPUT_B)
print(f"Exported Mode B -> {OUTPUT_B}")

print("Done.")
