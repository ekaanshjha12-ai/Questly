"""
Headless Blender script: builds a smooth, organically-blended humanoid body
from metaballs (rather than hard-edged primitive stacking), converts it to a
mesh, and exports it as GLB for the web app to load. Also renders a quick
preview PNG so the result can be inspected without opening Blender.

Blender's native convention is Z-up, X-right, Y-depth. To keep the body
coordinates readable, P(x, up, depth) builds points in that native order.

Run with:
    blender --background --python generate_avatar.py
"""

import bpy
import math
import os
import mathutils

OUT_DIR = r"C:\Users\bikra\OneDrive\Desktop\habit app\blender"
GLB_PATH = os.path.join(OUT_DIR, "avatar_body.glb")
PREVIEW_PATH = os.path.join(OUT_DIR, "preview.png")


def P(x, up, depth=0.0):
    return (x, depth, up)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.metaballs, bpy.data.cameras, bpy.data.lights):
        for block in list(coll):
            if block.users == 0:
                coll.remove(block)


def build_body():
    mb_data = bpy.data.metaballs.new("BodyMeta")
    mb_data.resolution = 0.028
    mb_data.render_resolution = 0.02
    mb_data.threshold = 0.6
    obj = bpy.data.objects.new("BodyMetaObj", mb_data)
    bpy.context.collection.objects.link(obj)

    def ball(co, radius):
        el = mb_data.elements.new()
        el.co = co
        el.radius = radius
        el.type = "BALL"

    def lerp3(a, b, t):
        return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t)

    def bone(p0, r0, p1, r1, spacing=0.035):
        # Dense chain of overlapping balls so metaballs actually fuse into a
        # continuous, tapered limb instead of floating disconnected joints.
        dx, dy, dz = p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]
        dist = math.sqrt(dx * dx + dy * dy + dz * dz)
        samples = max(2, int(math.ceil(dist / spacing)) + 1)
        for i in range(samples):
            t = i / (samples - 1)
            ball(lerp3(p0, p1, t), r0 + (r1 - r0) * t)

    # Figure is ~1m tall (up axis), feet at up=0.
    head = P(0, 0.90)
    neck = P(0, 0.805)
    chest = P(0, 0.70)
    waist = P(0, 0.585)
    pelvis = P(0, 0.47)

    l_shoulder, r_shoulder = P(-0.165, 0.745), P(0.165, 0.745)
    l_elbow, r_elbow = P(-0.235, 0.585, 0.02), P(0.235, 0.585, 0.02)
    l_wrist, r_wrist = P(-0.275, 0.43, 0.03), P(0.275, 0.43, 0.03)
    l_hand, r_hand = P(-0.29, 0.40, 0.035), P(0.29, 0.40, 0.035)

    l_hip, r_hip = P(-0.095, 0.455), P(0.095, 0.455)
    l_knee, r_knee = P(-0.105, 0.25), P(0.105, 0.25)
    l_ankle, r_ankle = P(-0.105, 0.06, 0.02), P(0.105, 0.06, 0.02)
    l_foot, r_foot = P(-0.105, 0.02, 0.06), P(0.105, 0.02, 0.06)

    ball(head, 0.115)
    bone(neck, 0.058, chest, 0.145)
    bone(chest, 0.145, waist, 0.125)
    bone(waist, 0.125, pelvis, 0.13)

    for shoulder, elbow, wrist, hand in (
        (l_shoulder, l_elbow, l_wrist, l_hand),
        (r_shoulder, r_elbow, r_wrist, r_hand),
    ):
        bone(chest, 0.145, shoulder, 0.078)
        bone(shoulder, 0.078, elbow, 0.058)
        bone(elbow, 0.058, wrist, 0.052)
        ball(hand, 0.062)

    for hip, knee, ankle, foot in (
        (l_hip, l_knee, l_ankle, l_foot),
        (r_hip, r_knee, r_ankle, r_foot),
    ):
        bone(pelvis, 0.13, hip, 0.095)
        bone(hip, 0.095, knee, 0.075)
        bone(knee, 0.075, ankle, 0.058)
        ball(foot, 0.06)

    depsgraph = bpy.context.evaluated_depsgraph_get()
    eval_obj = obj.evaluated_get(depsgraph)
    mesh = bpy.data.meshes.new_from_object(eval_obj)
    mesh_obj = bpy.data.objects.new("Body", mesh)
    bpy.context.collection.objects.link(mesh_obj)
    bpy.data.objects.remove(obj, do_unlink=True)

    bpy.context.view_layer.objects.active = mesh_obj
    mesh_obj.select_set(True)
    bpy.ops.object.shade_smooth()

    mod = mesh_obj.modifiers.new("Subsurf", "SUBSURF")
    mod.levels = 2
    mod.render_levels = 2
    bpy.ops.object.modifier_apply(modifier=mod.name)

    mat = bpy.data.materials.new("Body")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (0.24, 0.24, 0.36, 1.0)
        bsdf.inputs["Roughness"].default_value = 0.55
    mesh_obj.data.materials.append(mat)

    return mesh_obj


def aim(obj, target):
    direction = mathutils.Vector(target) - mathutils.Vector(obj.location)
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def setup_preview_scene():
    cam_data = bpy.data.cameras.new("PreviewCam")
    cam_data.lens = 50
    cam_obj = bpy.data.objects.new("PreviewCam", cam_data)
    cam_obj.location = P(0, 0.55, -2.4)
    aim(cam_obj, P(0, 0.5, 0))
    bpy.context.collection.objects.link(cam_obj)
    bpy.context.scene.camera = cam_obj

    sun_data = bpy.data.lights.new("Sun", type="SUN")
    sun_data.energy = 3.0
    sun_obj = bpy.data.objects.new("Sun", sun_data)
    sun_obj.location = P(1.5, 2.0, -2.0)
    aim(sun_obj, P(0, 0.5, 0))
    bpy.context.collection.objects.link(sun_obj)

    fill_data = bpy.data.lights.new("Fill", type="AREA")
    fill_data.energy = 40.0
    fill_data.size = 1.5
    fill_obj = bpy.data.objects.new("Fill", fill_data)
    fill_obj.location = P(-1.2, 0.7, -1.5)
    aim(fill_obj, P(0, 0.5, 0))
    bpy.context.collection.objects.link(fill_obj)

    scene = bpy.context.scene
    for engine in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
        try:
            scene.render.engine = engine
            break
        except TypeError:
            continue

    scene.render.resolution_x = 640
    scene.render.resolution_y = 640
    scene.render.filepath = PREVIEW_PATH
    scene.render.image_settings.file_format = "PNG"


def export_glb():
    bpy.ops.export_scene.gltf(filepath=GLB_PATH, export_format="GLB", use_selection=False)


def main():
    clear_scene()
    build_body()
    setup_preview_scene()
    bpy.ops.render.render(write_still=True)
    export_glb()
    print("DONE")
    print("GLB:", GLB_PATH)
    print("PREVIEW:", PREVIEW_PATH)


main()
