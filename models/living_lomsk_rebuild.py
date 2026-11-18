"""Photo reconstruction: white bucket, red plastic seat, folding fabric hood."""
import bpy, math, json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parent
P='Living LOMSK / '
F=2.41
CX,CY=6.04,2.78
for o in list(bpy.data.objects):
    if o.name.startswith(P):bpy.data.objects.remove(o,do_unlink=True)
col=bpy.data.collections['01 / Furniture']
root=bpy.data.objects.new(P+'CONTROL',None);col.objects.link(root);root.location=(CX,CY,F)
root['Product']='IKEA PS LÖMSK 104.071.36 — photo reconstruction'

def mat(name,color,rough=.4,metal=0):
    m=bpy.data.materials.get(name) or bpy.data.materials.new(name);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
    return m
white=mat('LOMSK revised moulded white',(.83,.83,.80),.29)
red=mat('LOMSK revised red plastic seat',(.72,.039,.022),.38)
fabric=mat('LOMSK revised white woven canopy',(.88,.875,.84),.83)
chrome=mat('LOMSK hinge steel',(.42,.44,.45),.24,.85)
grey=mat('LOMSK recessed swivel seam',(.17,.18,.18),.5)
nodes=fabric.node_tree.nodes;links=fabric.node_tree.links
tex=nodes.new('ShaderNodeTexNoise');tex.inputs['Scale'].default_value=650
bump=nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.13;bump.inputs['Distance'].default_value=.0005
links.new(tex.outputs['Fac'],bump.inputs['Height']);links.new(bump.outputs['Normal'],nodes.get('Principled BSDF').inputs['Normal'])
def mesh(name,verts,faces,material):
    me=bpy.data.meshes.new(P+name);me.from_pydata(verts,[],faces);me.update();me.materials.append(material)
    o=bpy.data.objects.new(P+name,me);col.objects.link(o);o.parent=root
    for p in me.polygons:p.use_smooth=True
    return o
def tube(name,pts,r,material,closed=False):
    cu=bpy.data.curves.new(P+name,'CURVE');cu.dimensions='3D';cu.bevel_depth=r;cu.bevel_resolution=4
    s=cu.splines.new('POLY');s.points.add(len(pts)-1);s.use_cyclic_u=closed
    for a,b in zip(s.points,pts):a.co=(*b,1)
    cu.materials.append(material);o=bpy.data.objects.new(P+name,cu);col.objects.link(o);o.parent=root;return o
def lathe(name,profile,material):
    N=96;v=[(r*math.cos(2*math.pi*j/N),r*math.sin(2*math.pi*j/N),z) for r,z in profile for j in range(N)]
    f=[(i*N+j,i*N+(j+1)%N,(i+1)*N+(j+1)%N,(i+1)*N+j) for i in range(len(profile)-1) for j in range(N)]
    return mesh(name,v,f,material)
lathe('flared white pedestal',[(0,0),(.22,0),(.245,.008),(.25,.017),(.248,.027),(.236,.038),(.208,.047),(.177,.066),(.155,.095),(.147,.12),(.14,.136),(0,.136)],white)
lathe('recessed swivel joint',[(0,.133),(.134,.133),(.134,.141),(0,.141)],grey)

# Deep half-ellipsoid, cut along a tilted oval rim. Front faces -Y.
n=Vector((0,-.8,.6));up=Vector((0,.6,.8));side=Vector((1,0,0));c=Vector((0,0,.425))
N=128;M=48;v=[tuple(c-n*.32)]
for i in range(1,M+1):
    a=math.pi*i/(2*M)
    for j in range(N):
        t=2*math.pi*j/N
        v.append(tuple(c+math.sin(a)*(.283*math.cos(t)*side+.32*math.sin(t)*up)-.32*math.cos(a)*n))
faces=[(0,1+(j+1)%N,1+j) for j in range(N)]
for i in range(M-1):
    for j in range(N):
        a=1+i*N+j;b=1+i*N+(j+1)%N;faces.append((a,b,b+N,a+N))
o=mesh('white bucket inside and outside',v,faces,white)
mod=o.modifiers.new('Moulded wall 7 mm','SOLIDIFY');mod.thickness=.007;mod.offset=1
rim=[tuple(c+.283*math.cos(2*math.pi*j/N)*side+.32*math.sin(2*math.pi*j/N)*up) for j in range(N)]
tube('rounded continuous oval lip',rim,.008,white,True)

# Red plastic insert follows the low seat; no red back cushion.
v=[(0,.015,.173)];rings=18;segments=96
for i in range(1,rings+1):
    r=i/rings
    for j in range(segments):
        t=2*math.pi*j/segments
        v.append((.203*r*math.cos(t),.015+.171*r*math.sin(t),.173+.018*r*r))
f=[(0,1+j,1+(j+1)%segments) for j in range(segments)]
for i in range(rings-1):
    for j in range(segments):
        a=1+i*segments+j;b=1+i*segments+(j+1)%segments;f.append((a,a+segments,b+segments,b))
o=mesh('red moulded seat insert',v,f,red);so=o.modifiers.new('Seat thickness','SOLIDIFY');so.thickness=.006

# White canopy arches pivot at the side hinges, opened as in the product photo.
angles=[math.radians(x) for x in (-23,-4,15,34,45)]
def canopy(u,a,ripple=0):
    return (.284*math.cos(u),.003+(.387+ripple)*math.sin(u)*math.sin(a),.427+(.387+ripple)*math.sin(u)*math.cos(a))
for panel in range(len(angles)-1):
    nu,nv=72,18;v=[]
    for i in range(nv+1):
        q=i/nv;a=angles[panel]*(1-q)+angles[panel+1]*q
        for j in range(nu+1):
            u=math.pi*j/nu
            ripple=.008*math.sin(math.pi*q)*math.sin(u)*math.sin(24*u+panel*.8)
            v.append(canopy(u,a,ripple))
    f=[(i*(nu+1)+j,i*(nu+1)+j+1,(i+1)*(nu+1)+j+1,(i+1)*(nu+1)+j) for i in range(nv) for j in range(nu)]
    o=mesh('white fabric hood panel '+str(panel+1),v,f,fabric)
    so=o.modifiers.new('Double-sided fabric','SOLIDIFY');so.thickness=.0008
for i,a in enumerate(angles):
    tube('fabric covered folding rib '+str(i+1),[canopy(math.pi*j/96,a) for j in range(97)],.0048 if i==0 else .0032,fabric)
for s in (-1,1):
    for dz,dy,r in [(0,0,.022),(-.04,.022,.006),(-.024,.044,.006)]:
        bpy.ops.mesh.primitive_uv_sphere_add(segments=32,ring_count=16)
        o=bpy.context.object;o.name=P+('hood pivot' if r>.01 else 'hinge screw')
        for coll in list(o.users_collection):coll.objects.unlink(o)
        col.objects.link(o);o.parent=root;o.location=(s*(.285 if r>.01 else .28),dy,.427+dz);o.scale=(.009,r,r)
        o.data.materials.append(white if r>.01 else chrome)
        for p in o.data.polygons:p.use_smooth=True

# Match the official outer envelope, using evaluated meshes including rims.
bpy.context.window.scene=bpy.data.scenes['70 | LIVING - IKEA PS LOMSK chair']
bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get()
parts=[o for o in root.children if o.type in {'MESH','CURVE'}]
def evaluated_points(local=False):
    result=[]
    for obj in parts:
        eo=obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
        me=eo.to_mesh()
        transform=(root.matrix_world.inverted() @ eo.matrix_world) if local else eo.matrix_world
        result.extend(transform @ v.co for v in me.vertices)
        eo.to_mesh_clear()
    return result
pts=evaluated_points(True)
lo=Vector(tuple(min(p[k] for p in pts) for k in range(3)));hi=Vector(tuple(max(p[k] for p in pts) for k in range(3)))
root.scale=(.59/(hi.x-lo.x),.62/(hi.y-lo.y),.82/(hi.z-lo.z))
root.location=(CX-(lo.x+hi.x)*root.scale.x/2,CY-(lo.y+hi.y)*root.scale.y/2,F-lo.z*root.scale.z)
name='70 | LIVING - IKEA PS LOMSK chair';scene=bpy.data.scenes.get(name) or bpy.data.scenes.new(name)
source=bpy.data.scenes['54 | LIVING - photo coffee table'];scene.world=source.world
for coll in source.collection.children:
    if coll.name not in scene.collection.children:scene.collection.children.link(coll)
def look(o,p):o.rotation_euler=(Vector(p)-o.location).to_track_quat('-Z','Y').to_euler()
cam=bpy.data.objects.new(P+'verification camera',bpy.data.cameras.new(P+'camera'));scene.collection.objects.link(cam)
cam.location=(5.55,.92,F+1.18);cam.data.lens=43;look(cam,(CX,CY,F+.40));scene.camera=cam
light=bpy.data.objects.new(P+'verification softbox',bpy.data.lights.new(P+'softbox','AREA'));scene.collection.objects.link(light)
light.location=(5.1,1.7,F+2.3);light.data.energy=220;light.data.size=2.5;look(light,(CX,CY,F+.4))
scene.render.engine='BLENDER_EEVEE'
scene.render.resolution_x=1000;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.filepath=str(ROOT/'living_lomsk_chair.png')
bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get()
pts=evaluated_points()
lo=[min(p[k] for p in pts) for k in range(3)];hi=[max(p[k] for p in pts) for k in range(3)]
assert lo[0]>5.63 and hi[0]<6.46
report={'product':'IKEA PS LÖMSK 104.071.36','source':'https://www.ikea.com/be/nl/p/ikea-ps-loemsk-draaifauteuil-wit-rood-10407136/','construction':'White bucket, red plastic seat, white fabric canopy and flared pedestal','model_dimensions_m':[round(hi[k]-lo[k],4) for k in range(3)],'bounds':[lo,hi],'clearance_to_sofa_m':lo[0]-5.63,'clearance_to_tv_m':6.46-hi[0],'geometry_status':'Photo-based reconstruction, not official IKEA CAD','scene':name}
(ROOT/'living_lomsk_chair_verification.json').write_text(json.dumps(report,indent=2))
notes='IKEA PS LÖMSK opnieuw opgebouwd naar officiële voor- en zijfoto: witte kuip binnen/buiten, rode kunststof zitplaat, witte stoffen vouwkap met baleinen, scharnierkapjes en uitlopende draaivoet. Buitenmaat 59 x 62 x 82 cm. Fotoreconstructie, geen officieel CAD-model. Plaatsing behouden. Scene 70; living_lomsk_rebuild.py.\n'
(ROOT/'LIVING_LOMSK_NOTES.txt').write_text(notes)
tx=bpy.data.texts.get('LIVING - IKEA PS LOMSK chair notes') or bpy.data.texts.new('LIVING - IKEA PS LOMSK chair notes');tx.clear();tx.write(notes)
bpy.context.window.scene=scene
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'Huis_Oude_Terelststraat_15.blend'))
print(json.dumps(report,indent=2),flush=True)
bpy.ops.render.render(write_still=True)
