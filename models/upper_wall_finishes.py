"""White transverse upper walls stop at bathroom doorway wall; storage and curved stair remain brick."""
import bpy

def update_upper_wall_finishes():
    white=bpy.data.materials['Warm white plaster']
    brick=bpy.data.materials['Office - reference warm buff brick and dark recessed mortar']
    white_names=('Upper hallway divider','Upper door lintel','Bedroom 3 partition','Bedroom 1 / 2 dividing wall','Bathroom partition')
    brick_names=('Berging rear / duct wall','Upper correction / solid wall below storage','Upper correction / storage side','Upper correction / rounded')
    changed=[]
    for o in bpy.data.collections['02 | SECOND - archive reconstruction'].all_objects:
        if o.type!='MESH':continue
        material=white if o.name.startswith(white_names) else brick if o.name.startswith(brick_names) else None
        if material:
            o.data.materials.clear();o.data.materials.append(material)
            for face in o.data.polygons:face.material_index=0
            o['wall_finish']='User clarification: white stops at bathroom door wall; storage and curved stair are brick'
            changed.append((o.name,material.name))
    print('UPPER FINISH BOUNDARY CORRECTED:',changed,flush=True)
