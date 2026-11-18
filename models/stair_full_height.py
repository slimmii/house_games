"""Continuous reference brick lining throughout the stair hall, all storeys."""
import bpy
from mathutils import Vector

def update_full_height_stair():
    brick=bpy.data.materials['Office - reference warm buff brick and dark recessed mortar']
    selected=[]
    def finish(ob,predicate,top=None):
        if not ob:return
        slot=next((i for i,m in enumerate(ob.data.materials) if m==brick),None)
        if slot is None:slot=len(ob.data.materials);ob.data.materials.append(brick)
        for p in ob.data.polygons:
            if predicate(p.normal):p.material_index=slot
        if top is not None:
            zmax=max(v.co.z for v in ob.data.vertices)
            for v in ob.data.vertices:
                if abs(v.co.z-zmax)<.005:v.co.z=top
        ob['stair_finish']='Continuous reference brick, ground floor to top landing'
        selected.append(ob)
    # Traced curved walls and front-facing rear wall; close the inter-storey plaster bands.
    for floor,indices,top in [('ground',range(36,84),2.41),('first',range(38,87),5.31)]:
        for i in indices:
            finish(bpy.data.objects.get('%s / source masonry %03d'%(floor,i)),lambda n:n.y<-.05 or n.x>.05,top)
    for i in [101,102]:finish(bpy.data.objects.get('ground / source masonry %03d'%i),lambda n:n.x<-.05)
    for ob in list(bpy.data.objects):
        name=ob.name
        if name.startswith('Upper hallway divider'):
            ys=[(ob.matrix_world@Vector(v)).y for v in ob.bound_box]
            if min(ys)<6.49 and max(ys)>3.29:finish(ob,lambda n:n.x<-.05 or abs(n.y)>.05)
        elif name.startswith('Upper door lintel'):finish(ob,lambda n:n.x<-.05)
        elif name.startswith('Bedroom 3 partition'):finish(ob,lambda n:n.y>.05 or abs(n.x)>.05)
        elif name.startswith(('Berging front','Bathroom partition')):finish(ob,lambda n:n.y<-.05 or abs(n.x)>.05)
        elif name.startswith('Berging side'):finish(ob,lambda n:n.x>.05)
    lintel=bpy.data.objects.get('Stair photo / brick lintel above door')
    if lintel:
        bottom=2.41+2.07;lintel.location.z=(bottom+5.31)/2;lintel.dimensions.z=5.31-bottom;selected.append(lintel)
    for ob in list(bpy.data.objects):
        if ob.name.startswith('Stair full height /'):bpy.data.objects.remove(ob,do_unlink=True)
    def panel(name,x0,x1,y0,y1,z0,z1,col):
        bpy.ops.mesh.primitive_cube_add(size=1,location=((x0+x1)/2,(y0+y1)/2,(z0+z1)/2));o=bpy.context.object;o.name='Stair full height / '+name;o.dimensions=(x1-x0,y1-y0,z1-z0)
        bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
        for c in list(o.users_collection):c.objects.unlink(o)
        bpy.data.collections[col].objects.link(o);o.data.materials.append(brick);selected.append(o)
    panel('ground left wall lining',.330,.339,3.32,4.28,0,2.41,'00 / Walls left')
    panel('first floor upper left band',.314,.339,3.32,5.16,5.07,5.31,'01 / Walls left')
    panel('upper landing left wall',.28,.292,3.34,6.49,5.31,8.11,'02 / Walls left')
    # Cover the circular slab reveals; preserve the real stair opening and horizontal floors.
    for prefix in ['1 / floor','2 / floor']:
        for ob in bpy.data.objects:
            if not ob.name.startswith(prefix) or ob.type!='MESH':continue
            slot=len(ob.data.materials);ob.data.materials.append(brick)
            for p in ob.data.polygons:
                c=ob.matrix_world@p.center
                if abs(p.normal.z)<.15 and abs(((c.x-1.2)**2+(c.y-4.3)**2)**.5-.96)<.03:p.material_index=slot
    # A continuous multi-storey view makes the requested top-to-bottom finish visible.
    sc=bpy.data.scenes.get('11 | STAIR HALL - full height brick')
    if not sc:
        sc=bpy.data.scenes['09 | STAIR - brick return and cream door'].copy();sc.name='11 | STAIR HALL - full height brick'
    sc.use_fake_user=True
    for c in list(sc.collection.children):sc.collection.children.unlink(c)
    detail=bpy.data.collections.new('Full height stair hall inspection');sc.collection.children.link(detail)
    for ob in selected:
        if ob.name not in detail.objects:detail.objects.link(ob)
    # Include the existing office-side lining and all stair flights and relevant doors.
    ob=bpy.data.objects.get('Office / reference brick wall')
    if ob:detail.objects.link(ob)
    for c in ['00 / Stair','01 / Stair']:sc.collection.children.link(bpy.data.collections[c])
    for ob in bpy.data.objects:
        if ob.name.startswith('Stair photo /') and ob.name not in detail.objects:detail.objects.link(ob)
        elif ob.name.startswith(('Upper bedroom door','Bedroom 3 door','Berging door')):detail.objects.link(ob)
    # Remove only foreground occluders from this inspection view, exposing hall-facing finishes.
    for ob in list(detail.objects):
        if ob.name.startswith(('Bedroom 3 partition','Bedroom 3 door','Upper hallway divider','Upper door lintel','Upper bedroom door')) or ob.name in ['ground / source masonry 101','ground / source masonry 102']:
            detail.objects.unlink(ob)
    cam=bpy.data.objects.new('Full height stair camera',bpy.data.cameras.new('Full height stair camera'));sc.collection.objects.link(cam)
    cam.location=(11,-10,10);cam.rotation_euler=(Vector((1.4,4.75,4.05))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=10.6;sc.camera=cam
    sc.render.resolution_x=1200;sc.render.resolution_y=1600;sc.render.resolution_percentage=100
    print('FULL HEIGHT BRICK:',len(selected),'wall pieces; elevations 0.00 to 8.11 m',flush=True)
    return sc
