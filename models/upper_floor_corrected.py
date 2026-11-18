"""Upper floor correction against archive: curved stair surround; storage side door."""
import bpy,math,json
from mathutils import Vector
from pathlib import Path

def update_upper_floor():
    F=5.31;H=2.8
    col=bpy.data.collections['02 / Partitions'];join=bpy.data.collections['02 / Joinery']
    brick=bpy.data.materials['Office - reference warm buff brick and dark recessed mortar'];plaster=bpy.data.materials['Warm white plaster']
    for o in list(bpy.data.objects):
        if o.name.startswith(('Berging front','Berging side','Berging door','Upper correction /')):bpy.data.objects.remove(o,do_unlink=True)
    walls=[]
    def prism(name,pts,z=F,h=H):
        n=len(pts);verts=[(x,y,zz) for zz in [z,z+h] for x,y in pts]
        mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]);mesh.materials.append(brick);mesh.update()
        o=bpy.data.objects.new('Upper correction / '+name,mesh);col.objects.link(o);walls.append(o);return o
    def rect(name,x0,x1,y0,y1,z=F,h=H):return prism(name,[(x0,y0),(x1,y0),(x1,y1),(x0,y1)],z,h)
    # Smooth half-round on the left of the upper stair, as drawn in the archive.
    cx,cy,r=1.24,4.25,.91
    upper=[(.28,cy),(.28,5.30),(cx,5.30),(cx,cy+r)]+[(cx+r*math.cos(math.pi/2+i*math.pi/2/40),cy+r*math.sin(math.pi/2+i*math.pi/2/40)) for i in range(1,41)]
    lower=[(.28,cy),(.28,3.34),(cx,3.34),(cx,cy-r)]+[(cx+r*math.cos(3*math.pi/2-i*math.pi/2/40),cy+r*math.sin(3*math.pi/2-i*math.pi/2/40)) for i in range(1,41)]
    prism('rounded north stair surround',upper);prism('rounded south stair surround',lower)
    rect('solid wall below storage',cx,1.91,5.16,5.30)
    rect('storage side front pier',1.80,1.91,5.30,5.43)
    rect('storage side rear pier',1.80,1.91,6.19,6.49)
    rect('storage side door lintel',1.80,1.91,5.43,6.19,F+2.07,H-2.07)
    # Clone the approved cream door detailing and rotate it into the correct side opening.
    for original in list(bpy.data.objects):
        if not original.name.startswith('Stair photo /') or any(s in original.name for s in ['brick lintel','switch']):continue
        o=original.copy();o.data=original.data.copy();join.objects.link(o);o.name='Upper correction / storage '+original.name.split(' / ',1)[1]
        dx=(original.location.x-2.345)*.95;dy=original.location.y-5.23
        o.location=(1.855-dy,5.81+dx,F+original.location.z-2.41)
        o.rotation_euler=original.rotation_euler.copy();o.rotation_euler.rotate_axis('Z',math.pi/2)
        # Scale planar frame parts across the opening; metal hardware keeps its proportions.
        if original.type=='MESH' and any(s in original.name for s in ['frame head','architrave head','door leaf','dark door reveal']):
            for v in o.data.vertices:v.co.x*=.95
    # The archive also has a bathroom door; the earlier model left this opening empty.
    for original in list(bpy.data.objects):
        if not original.name.startswith('Stair photo /') or any(s in original.name for s in ['brick lintel','switch']):continue
        o=original.copy();o.data=original.data.copy();join.objects.link(o);o.name='Upper correction / bathroom '+original.name.split(' / ',1)[1]
        o.location=(2.27+original.location.x-2.345,6.49+original.location.y-5.23,F+original.location.z-2.41)
    # Recalculate normals for the curved wall meshes.
    import bmesh
    for o in walls:
        bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(o.data);bm.free()
    # Stale detail scene: restore all corrected surfaces and show the side door in context.
    detail=bpy.data.collections.get('Full height stair hall inspection')
    if detail:
        for o in walls:detail.objects.link(o)
        for o in join.objects:
            if o.name.startswith('Upper correction /'):detail.objects.link(o)
    sc=bpy.data.scenes.get('12 | UPPER FLOOR - corrected complete layout')
    if not sc:
        sc=bpy.data.scenes['02 | FIRST FLOOR - furnished cutaway'].copy();sc.name='12 | UPPER FLOOR - corrected complete layout'
    sc.use_fake_user=True
    for c in list(sc.collection.children):sc.collection.children.unlink(c)
    for c in bpy.data.collections['02 | SECOND - archive reconstruction'].children:
        if not c.name.endswith(('Walls left','Walls front','Labels')):sc.collection.children.link(c)
    cam=bpy.data.objects.new('Upper complete camera',bpy.data.cameras.new('Upper complete camera'));sc.collection.objects.link(cam)
    cam.location=(-8,-9,19);cam.rotation_euler=(Vector((3.6,4.5,F+.65))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=13.6;sc.camera=cam
    sc.render.resolution_x=1600;sc.render.resolution_y=1500;sc.render.resolution_percentage=100
    # Export the same horizontal wall section used by the PDF plans; avoids independent redrawing.
    polygons=[]
    for c in bpy.data.collections['02 | SECOND - archive reconstruction'].children:
        if not any(k in c.name for k in ['Walls','Partitions']):continue
        for o in c.objects:
            if o.type!='MESH':continue
            verts=[o.matrix_basis@v.co for v in o.data.vertices]
            zs=[v.z for v in verts]
            if min(zs)>F+1.1 or max(zs)<F+1.1:continue
            # Vertical wall prisms have an ordered bottom face.
            zmin=min(zs)
            face=next((p for p in o.data.polygons if all(abs(verts[i].z-zmin)<.005 for i in p.vertices)),None)
            if face:polygons.append({'name':o.name,'points':[[verts[i].x,verts[i].y] for i in face.vertices]})
    data={'width':7.381,'depth':9.0,'walls':polygons,'stair':{'x':1.2,'y':4.3,'radius':.96},'doors':[{'x':1.855,'y':5.81,'width':.76,'axis':'y','room':'berging'},{'x':2.84,'y':3.79,'width':.78,'axis':'y'},{'x':2.84,'y':5.51,'width':.78,'axis':'y'},{'x':2.25,'y':3.29,'width':.8,'axis':'x'},{'x':2.27,'y':6.49,'width':.8,'axis':'x','room':'badkamer'}]}
    Path(__file__).with_name('upper_floor_geometry.json').write_text(json.dumps(data,indent=2))
    assert not bpy.data.objects.get('Berging door - NOT WC')
    print('UPPER RESTORED:',len(bpy.data.collections['02 | SECOND - archive reconstruction'].all_objects),'objects; storage SIDE door; curved surround',flush=True)
    return sc
