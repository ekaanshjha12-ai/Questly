"""
Headless optimization: imports a high-poly textured GLB (e.g. from Meshy AI),
decimates the mesh, downsizes textures, and re-exports as a compact
Draco-compressed GLB suitable for a real-time web avatar.

Run with:
    blender --background --python optimize_model.py -- <in.glb> <out.glb> <target_tris> <max_tex_size> <preview.png>
"""

import bpy
import sys
import math
import mathutils

argv = sys.argv[sys.argv.index("--") + 1:]
IN_PATH = argv[0]
OUT_PATH = argv[1]
TARGET_TRIS = int(argv[2])
MAX_TEX = int(argv[3])
PREVIEW_PATH = argv[4]


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def aim(obj, target):
    direction = mathutils.Vector(target) - mathutils.Vector(obj.location)
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def main():
    clear_scene()
    bpy.ops.import_scene.gltf(filepath=IN_PATH)

    mesh_objs = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    total_tris = sum(len(o.data.polygons) for o in mesh_objs)
    print("ORIGINAL_TRIS:", total_tris)

    ratio = min(1.0, TARGET_TRIS / max(total_tris, 1))
    for o in mesh_objs:
        bpy.context.view_layer.objects.active = o
        mod = o.modifiers.new("Decimate", "DECIMATE")
        mod.ratio = ratio
        bpy.ops.object.modifier_apply(modifier=mod.name)
        o.data.update()

    new_tris = sum(len(o.data.polygons) for o in mesh_objs)
    print("DECIMATED_TRIS:", new_tris, "(ratio", ratio, ")")

    for img in bpy.data.images:
        if img.name in ("Render Result", "Viewer Node"):
            continue
        w, h = img.size[0], img.size[1]
        if w == 0 or h == 0:
            continue
        if max(w, h) > MAX_TEX:
            scale = MAX_TEX / max(w, h)
            new_w, new_h = max(1, round(w * scale)), max(1, round(h * scale))
            img.scale(new_w, new_h)
            print("RESIZED:", img.name, f"{w}x{h} -> {new_w}x{new_h}")

    for o in mesh_objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = mesh_objs[0]

    bpy.ops.export_scene.gltf(
        filepath=OUT_PATH,
        export_format="GLB",
        use_selection=False,
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,
        export_image_format="AUTO",
        export_jpeg_quality=82,
    )
    print("EXPORTED:", OUT_PATH)

    # Bounding box for a quick preview render.
    min_v = mathutils.Vector((1e9, 1e9, 1e9))
    max_v = mathutils.Vector((-1e9, -1e9, -1e9))
    for o in mesh_objs:
        for corner in o.bound_box:
            world_co = o.matrix_world @ mathutils.Vector(corner)
            min_v.x, min_v.y, min_v.z = min(min_v.x, world_co.x), min(min_v.y, world_co.y), min(min_v.z, world_co.z)
            max_v.x, max_v.y, max_v.z = max(max_v.x, world_co.x), max(max_v.y, world_co.y), max(max_v.z, world_co.z)
    size = max_v - min_v
    center = (min_v + max_v) / 2

    cam_data = bpy.data.cameras.new("PreviewCam")
    cam_data.lens = 50
    cam_obj = bpy.data.objects.new("PreviewCam", cam_data)
    dist = max(size.x, size.y, size.z) * 1.8 + 0.5
    cam_obj.location = (center.x, center.y - dist, center.z + size.z * 0.05)
    aim(cam_obj, center)
    bpy.context.collection.objects.link(cam_obj)
    bpy.context.scene.camera = cam_obj

    sun_data = bpy.data.lights.new("Sun", type="SUN")
    sun_data.energy = 3.0
    sun_obj = bpy.data.objects.new("Sun", sun_data)
    sun_obj.location = (center.x + 1.5, center.y - 2.0, center.z + 2.0)
    aim(sun_obj, center)
    bpy.context.collection.objects.link(sun_obj)

    fill_data = bpy.data.lights.new("Fill", type="AREA")
    fill_data.energy = 60.0
    fill_data.size = 1.5
    fill_obj = bpy.data.objects.new("Fill", fill_data)
    fill_obj.location = (center.x - 1.2, center.y - 1.5, center.z + 0.7)
    aim(fill_obj, center)
    bpy.context.collection.objects.link(fill_obj)

    scene = bpy.context.scene
    for engine in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
        try:
            scene.render.engine = engine
            break
        except TypeError:
            continue
    scene.render.resolution_x = 700
    scene.render.resolution_y = 700
    scene.render.filepath = PREVIEW_PATH
    scene.render.image_settings.file_format = "PNG"
    bpy.ops.render.render(write_still=True)
    print("PREVIEW_SAVED:", PREVIEW_PATH)


main()
