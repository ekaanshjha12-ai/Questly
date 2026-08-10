"""
Headless inspection: imports a GLB, reports basic stats, and renders a
front-view preview PNG so the model can be looked at without opening Blender.

Run with:
    blender --background --python inspect_model.py -- <input.glb> <output_preview.png>
"""

import bpy
import sys
import math
import mathutils

argv = sys.argv[sys.argv.index("--") + 1:]
IN_PATH = argv[0]
OUT_PATH = argv[1]


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
    total_verts = sum(len(o.data.vertices) for o in mesh_objs)
    total_tris = sum(len(o.data.polygons) for o in mesh_objs)
    mats = set()
    for o in mesh_objs:
        for slot in o.material_slots:
            if slot.material:
                mats.add(slot.material.name)

    # Bounding box across all mesh objects, in world space.
    min_v = mathutils.Vector((1e9, 1e9, 1e9))
    max_v = mathutils.Vector((-1e9, -1e9, -1e9))
    for o in mesh_objs:
        for corner in o.bound_box:
            world_co = o.matrix_world @ mathutils.Vector(corner)
            min_v.x, min_v.y, min_v.z = min(min_v.x, world_co.x), min(min_v.y, world_co.y), min(min_v.z, world_co.z)
            max_v.x, max_v.y, max_v.z = max(max_v.x, world_co.x), max(max_v.y, world_co.y), max(max_v.z, world_co.z)

    size = max_v - min_v
    center = (min_v + max_v) / 2

    print("MESH_OBJECTS:", [o.name for o in mesh_objs])
    print("VERTS:", total_verts, "TRIS:", total_tris)
    print("MATERIALS:", list(mats))
    print("BOUNDS_MIN:", tuple(min_v), "BOUNDS_MAX:", tuple(max_v))
    print("SIZE:", tuple(size))
    print("CENTER:", tuple(center))

    # Camera framed to fit the whole model, roughly front-on.
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
    scene.render.filepath = OUT_PATH
    scene.render.image_settings.file_format = "PNG"
    bpy.ops.render.render(write_still=True)
    print("PREVIEW_SAVED:", OUT_PATH)


main()
