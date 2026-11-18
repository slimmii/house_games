"""Export original movable doors separately; never save or re-export the house.
Blender -b models/Huis_Oude_Terelststraat_15.blend --python packages/house/scripts/export-doors.py
"""
import bpy, json, math, runpy, sys
from pathlib import Path
from mathutils import Vector, Matrix
P = Path(__file__).resolve().parents[1]
source = runpy.run_path(str(P / 'scripts/export-house.py'), run_name='door_export')
# The authored bedroom and bathroom leaves are posed open by drivers.
for ob in bpy.data.objects:
    if 'Open angle' in ob:
        ob['Open angle'] = 0.0
        if ob.animation_data:
            ob.animation_data_clear()
        ob.rotation_euler.z = 0
bpy.context.view_layer.update()
objects = [o for o in bpy.data.objects if o.type in {'MESH', 'CURVE'} and source['is_door_leaf'](o)
           and 'reveal' not in o.name.lower()]
groups = {}
for o in objects:
    n=o.name
    if n.startswith('Upper reference door / '): key=n.split(' / ')[1]
    elif n.startswith('Ground bathroom'): key='Ground bathroom'
    elif n.startswith('Ground straight'): key='Ground bedroom'
    elif n.startswith('Ground room'): key='Laundry'
    elif n.startswith('Stair photo'): key='WC'
    elif n.startswith('Entrance') or n.startswith(('Street photo / pull handle', 'Street photo / long vertical stainless door pull')): key='Entrance'
    elif n.startswith(('Street photo','Garage','garage')): key='Garage'
    elif n.startswith(('Rear photo / black', 'Rear photo / door handle', 'Rear photo / door lever')): key='Rear laundry'
    elif n.startswith('Rear photo / veranda'):
        pts=[o.matrix_world@Vector(c) for c in o.bound_box]
        key='Veranda slider' if sum(p.x for p in pts)/8 < 4.99 else 'Veranda fixed panel'
    else: raise ValueError(n)
    groups.setdefault(key,[]).append(o)
# Evaluate all source meshes once, before switching to the export scene.
bpy.context.window.scene=bpy.data.scenes[source['SOURCE_SCENE']]
deps=bpy.context.evaluated_depsgraph_get()
meshes={o: bpy.data.meshes.new_from_object(o.evaluated_get(deps)) for o in objects}
scene=bpy.data.scenes.new('Game doors export')
bpy.context.window.scene=scene
manifest=[]
for idx,(label,items) in enumerate(sorted(groups.items())):
    door_id='door_'+str(idx)
    root=bpy.data.objects.new(door_id,None); scene.collection.objects.link(root)
    points=[]
    for o in items:
        if any(t in o.name.lower() for t in ('leaf','door vertical stile','door bottom rail','door top rail','backing','sliding doors')):
            points += [o.matrix_world@Vector(c) for c in o.bound_box]
    if not points: raise ValueError(label)
    lo=[min(p[i] for p in points) for i in range(3)]
    hi=[max(p[i] for p in points) for i in range(3)]
    pivot=[lo[0],(lo[1]+hi[1])/2,lo[2]]; angle=math.pi/2; slide=[0,0,0]; fixed=False
    if hi[1]-lo[1]>hi[0]-lo[0]: pivot=[(lo[0]+hi[0])/2,lo[1],lo[2]]; angle=-math.pi/2
    if label=='Ground bedroom': pivot=[2.955,5.900,0]; angle=-math.pi/2
    if label=='Ground bathroom': pivot=[4.365,5.75,0]; angle=-math.pi/2
    if label=='Entrance': pivot=[hi[0],(lo[1]+hi[1])/2,lo[2]]; angle=-math.pi/2
    if label=='Bedroom 3': angle=-math.pi/2
    if label=='Storage': angle=math.pi/2
    if label=='Garage': angle=0; slide=[0,0,0]
    if label=='Veranda slider': angle=0; slide=[(hi[0]-lo[0])*3,0,0]
    if label=='Veranda fixed panel': angle=0; fixed=True
    xyz=lambda p: [round(p[0]*3,6),round(p[2]*3,6),round(-p[1]*3,6)]
    world_lo=xyz([lo[0],hi[1],lo[2]]); world_hi=xyz([hi[0],lo[1],hi[2]])
    entry=dict(id=door_id,label=label,min=world_lo,max=world_hi,pivot=xyz(pivot),angle=angle,slide=slide,fixed=fixed)
    if label=='Garage':
        entry['motion']=dict(type='sectional',panelCount=12,panelGap=.025,curveRadius=.75,inward=[0,0,-1],duration=2.8)
    elif label=='Veranda slider':
        entry['motion']=dict(type='tracked-slide',unseat=[0,0,-.18],unseatFraction=.12,duration=1.6)
    manifest.append(entry)
    for original in items:
        # Evaluate in the source scene, then freeze modifiers and parent transforms.
        mesh=meshes[original]
        clone=bpy.data.objects.new(original.name,mesh)
        scene.collection.objects.link(clone)
        clone.matrix_world=Matrix.Scale(3,4)@original.matrix_world
        clone.parent=root
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(P/'public/models/doors.glb'),export_format='GLB',use_active_scene=True,export_cameras=False,export_lights=False,export_animations=False,export_apply=True)
(P/'src/shared/doors-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('Exported',len(manifest),'door assemblies')
