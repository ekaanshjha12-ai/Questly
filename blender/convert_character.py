"""
Opens a .blend character, optimizes it for the web, exports a Draco-compressed
GLB, and renders a transparent-background preview PNG for the shop grid.

Run with:
    blender <input.blend> --background --python convert_character.py -- <slug> <out_dir> <target_tris> <max_tex>
"""

import bpy
import sys
import math
import mathutils
import os

argv = sys.argv[sys.argv.index("--") + 1:]
SLUG = argv[0]
OUT_DIR = argv[1]
TARGET_TRIS = int(argv[2])
MAX_TEX = int(argv[3])

GLB_PATH = os.path.join(OUT_DIR, f"{SLUG}.glb")
PNG_PATH = os.path.join(OUT_DIR, f"{SLUG}.png")


def mesh_objects():
    return [o for o in bpy.context.scene.objects if o.type == "MESH"]


def drop_non_mesh():
    """Cameras, lights and empties shipped inside the .blend would otherwise be
    exported into the GLB and light the scene twice in the browser."""
    for obj in list(bpy.context.scene.objects):
        if obj.type != "MESH":
            bpy.data.objects.remove(obj, do_unlink=True)


def total_tris():
    return sum(len(o.data.polygons) for o in mesh_objects())


def decimate(ratio):
    for obj in mesh_objects():
        if len(obj.data.polygons) < 200:
            continue
        bpy.context.view_layer.objects.active = obj
        mod = obj.modifiers.new("Decimate", "DECIMATE")
        mod.ratio = ratio
        try:
            bpy.ops.object.modifier_apply(modifier=mod.name)
        except RuntimeError:
            obj.modifiers.remove(mod)


def shrink_textures():
    for img in bpy.data.images:
        if img.name in ("Render Result", "Viewer Node"):
            continue
        w, h = img.size[0], img.size[1]
        if w == 0 or h == 0:
            continue
        if max(w, h) > MAX_TEX:
            scale = MAX_TEX / max(w, h)
            img.scale(max(1, round(w * scale)), max(1, round(h * scale)))


def world_bounds():
    lo = mathutils.Vector((1e9, 1e9, 1e9))
    hi = mathutils.Vector((-1e9, -1e9, -1e9))
    for o in mesh_objects():
        for corner in o.bound_box:
            p = o.matrix_world @ mathutils.Vector(corner)
            lo.x, lo.y, lo.z = min(lo.x, p.x), min(lo.y, p.y), min(lo.z, p.z)
            hi.x, hi.y, hi.z = max(hi.x, p.x), max(hi.y, p.y), max(hi.z, p.z)
    return lo, hi


def aim(obj, target):
    d = mathutils.Vector(target) - mathutils.Vector(obj.location)
    obj.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()


def render_preview():
    lo, hi = world_bounds()
    size = hi - lo
    center = (lo + hi) / 2

    cam_data = bpy.data.cameras.new("Cam")
    cam_data.lens = 60
    cam = bpy.data.objects.new("Cam", cam_data)
    dist = max(size.x, size.y, size.z) * 1.7 + 0.4
    # Slight 3/4 angle reads better than dead-on for character art.
    cam.location = (center.x + dist * 0.35, center.y - dist, center.z + size.z * 0.06)
    aim(cam, center)
    bpy.context.collection.objects.link(cam)
    bpy.context.scene.camera = cam

    key = bpy.data.lights.new("Key", type="AREA")
    key.energy = 900
    key.size = max(size.z, 1.0)
    key_obj = bpy.data.objects.new("Key", key)
    key_obj.location = (center.x + dist * 0.7, center.y - dist * 0.7, center.z + size.z * 0.7)
    aim(key_obj, center)
    bpy.context.collection.objects.link(key_obj)

    rim = bpy.data.lights.new("Rim", type="AREA")
    rim.energy = 500
    rim.size = max(size.z, 1.0)
    rim_obj = bpy.data.objects.new("Rim", rim)
    rim_obj.location = (center.x - dist * 0.8, center.y + dist * 0.5, center.z + size.z * 0.5)
    aim(rim_obj, center)
    bpy.context.collection.objects.link(rim_obj)

    fill = bpy.data.lights.new("Fill", type="AREA")
    fill.energy = 300
    fill.size = max(size.z, 1.0)
    fill_obj = bpy.data.objects.new("Fill", fill)
    fill_obj.location = (center.x - dist * 0.5, center.y - dist * 0.6, center.z)
    aim(fill_obj, center)
    bpy.context.collection.objects.link(fill_obj)

    scene = bpy.context.scene
    for engine in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
        try:
            scene.render.engine = engine
            break
        except TypeError:
            continue

    scene.render.film_transparent = True
    scene.render.resolution_x = 400
    scene.render.resolution_y = 520
    scene.render.filepath = PNG_PATH
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    bpy.ops.render.render(write_still=True)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    drop_non_mesh()

    meshes = mesh_objects()
    if not meshes:
        print("ERROR: no mesh objects in file")
        sys.exit(1)

    original = total_tris()
    print(f"SLUG={SLUG} MESHES={len(meshes)} ORIGINAL_TRIS={original}")

    if original > TARGET_TRIS:
        decimate(min(1.0, TARGET_TRIS / original))
    print(f"DECIMATED_TRIS={total_tris()}")

    shrink_textures()

    for o in mesh_objects():
        bpy.context.view_layer.objects.active = o
        o.select_set(True)
        try:
            bpy.ops.object.shade_smooth()
        except RuntimeError:
            pass

    bpy.ops.export_scene.gltf(
        filepath=GLB_PATH,
        export_format="GLB",
        use_selection=False,
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,
        export_image_format="AUTO",
        export_jpeg_quality=80,
    )
    print(f"GLB={GLB_PATH} BYTES={os.path.getsize(GLB_PATH)}")

    render_preview()
    print(f"PNG={PNG_PATH}")
    print("DONE")


main()
