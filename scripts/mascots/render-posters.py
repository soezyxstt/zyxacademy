"""Render real maskot thumbnails with Blender, no generated imagery.

blender -b -t 4 --python render-posters.py -- SOURCE_DIRECTORY OUTPUT_DIRECTORY
SOURCE_DIRECTORY must contain models/base-full.glb, models/tiger-full.glb, etc.
The output contains transparent PNG intermediates. Convert them to WebP using
the companion convert-posters.mjs script. Camera, light and framing are shared.
"""
import bpy, json, sys
from pathlib import Path
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:]
source, output = [Path(value).resolve() for value in args[:2]]
output.mkdir(parents=True, exist_ok=True)
characters = [('cat', 'base'), ('tiger', 'tiger'), ('rhino', 'rhino'), ('crocodile', 'crocodile')]
reports = []

def point_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z','Y').to_euler()

for character, slug in characters:
    for variant in ['full', 'head']:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        scene = bpy.context.scene
        bpy.ops.import_scene.gltf(filepath=str(source/'models'/f'{slug}-{variant}.glb'))
        imported = list(scene.objects)
        helpers = {bone.custom_shape for obj in imported if obj.type == 'ARMATURE' for bone in obj.pose.bones if bone.custom_shape}
        for helper in helpers:
            helper.hide_render = True
            helper.hide_viewport = True
        for obj in imported:
            data_sets = [obj.animation_data]
            if obj.type == 'MESH' and obj.data.shape_keys:
                data_sets.append(obj.data.shape_keys.animation_data)
            for data in data_sets:
                if not data: continue
                selected = None
                for track in data.nla_tracks:
                    track.mute = True
                    if track.name == 'idle' and track.strips:
                        selected = track.strips[0].action
                data.action = selected
        scene.frame_set(0)
        scene.render.engine = 'CYCLES'
        scene.cycles.device = 'CPU'
        scene.cycles.samples = 32
        scene.cycles.use_denoising = False
        scene.render.resolution_x = 640
        scene.render.resolution_y = 640
        scene.render.resolution_percentage = 100
        scene.render.film_transparent = True
        scene.render.image_settings.file_format = 'PNG'
        scene.render.image_settings.color_mode = 'RGBA'
        scene.view_settings.view_transform = 'AgX'
        scene.world = bpy.data.worlds.new('Soft neutral studio')
        scene.world.use_nodes = True
        scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.79,.78,.74,1)
        scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .55
        graph = bpy.context.evaluated_depsgraph_get()
        points = []
        for obj in imported:
            if obj.type != 'MESH' or obj in helpers or obj.hide_render: continue
            evaluated = obj.evaluated_get(graph)
            points.extend(evaluated.matrix_world @ Vector(point) for point in evaluated.bound_box)
        lo = Vector(tuple(min(p[i] for p in points) for i in range(3)))
        hi = Vector(tuple(max(p[i] for p in points) for i in range(3)))
        center = (lo + hi) * .5
        data = bpy.data.cameras.new('Mascot poster camera')
        data.type = 'ORTHO'
        data.clip_start = .01
        data.clip_end = 100
        camera = bpy.data.objects.new('Mascot poster camera', data)
        scene.collection.objects.link(camera)
        camera.location = center + Vector((3.2,-9,1.9)).normalized()*20
        point_at(camera,center)
        scene.camera = camera
        bpy.context.view_layer.update()
        projected = [camera.matrix_world.inverted() @ point for point in points]
        minx,maxx = min(p.x for p in projected),max(p.x for p in projected)
        miny,maxy = min(p.y for p in projected),max(p.y for p in projected)
        data.ortho_scale = max(maxx-minx,maxy-miny)*1.13
        camera.location += camera.rotation_euler.to_matrix() @ Vector(((minx+maxx)*.5,(miny+maxy)*.5,0))
        for name, offset, energy, size, color in [
            ('Key',(-4,-6,5),650,5,(1,.95,.86)),
            ('Fill',(4,-3,2),300,4,(.89,.94,1)),
            ('Rim',(2,3,4),500,3,(1,.96,.88)),
        ]:
            light_data = bpy.data.lights.new(name, 'AREA')
            light_data.energy,light_data.size,light_data.color = energy,size,color
            light_data.shape = 'DISK'
            light = bpy.data.objects.new(name,light_data)
            scene.collection.objects.link(light)
            light.location = center + Vector(offset)
            point_at(light,center)
        target = output / (f'{character}.png' if variant == 'full' else f'{character}-head.png')
        scene.render.filepath = str(target)
        bpy.ops.render.render(write_still=True)
        reports.append({'character':character,'variant':variant,'path':target.name,'bounds':[list(lo),list(hi)],'resolution':[640,640],'renderedFrom':'web derivative with decoded lossless meshopt and PNG representations of the WebP pixels'})
        print('POSTER_RENDERED',target,flush=True)
(output/'render-report.json').write_text(json.dumps(reports,indent=2)+'\n')
