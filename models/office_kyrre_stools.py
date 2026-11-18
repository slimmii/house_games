"""Two birch KYRRE stools at the mirrored computer stations; additive update."""
import bpy, math, json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parent
P='Office KYRRE / '
F=2.41
URL='https://www.ikea.com/be/nl/p/kyrre-kruk-berken-60416925/'
for o in list(bpy.data.objects):
    if o.name.startswith(P):bpy.data.objects.remove(o,do_unlink=True)
col=bpy.data.collections['01 / Furniture']

def birch(name,scale,edge=False):
    m=bpy.data.materials.get(name) or bpy.data.materials.new(name);m.use_nodes=True
    ns=m.node_tree.nodes;ns.clear();ls=m.node_tree.links
    out=ns.new('ShaderNodeOutputMaterial');p=ns.new('ShaderNodeBsdfPrincipled');p.inputs['Roughness'].default_value=.4
    ls.new(p.outputs[0],out.inputs[0]);tc=ns.new('ShaderNodeTexCoord');v=ns.new('ShaderNodeVectorMath');v.operation='MULTIPLY';v.inputs[1].default_value=scale;ls.new(tc.outputs['Generated'],v.inputs[0])
    noise=ns.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=3;noise.inputs['Detail'].default_value=2;ls.new(v.outputs[0],noise.inputs['Vector'])
    ramp=ns.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].position=.18;ramp.color_ramp.elements[1].position=.82
    ramp.color_ramp.elements[0].color=(.48,.32,.17,1) if edge else (.61,.45,.28,1)
    ramp.color_ramp.elements[1].color=(.69,.53,.34,1) if edge else (.78,.63,.43,1)
    ls.new(noise.outputs['Fac'],ramp.inputs[0]);ls.new(ramp.outputs[0],p.inputs['Base Color'])
    return m
wood=birch('KYRRE pale birch veneer',(12,1,3))
legwood=birch('KYRRE leg lengthwise birch',(13,13,.45))
ply=birch('KYRRE plywood edge',(4,4,38),True)

def mesh(name,v,f,mat,parent,smooth=False):
    me=bpy.data.meshes.new(P+name);me.from_pydata(v,[],f);me.update();me.materials.append(mat)
    o=bpy.data.objects.new(P+name,me);col.objects.link(o);o.parent=parent
    for q in me.polygons:q.use_smooth=smooth
    return o
def bevel(o,width):
    b=o.modifiers.new('Soft lacquered edges','BEVEL');b.width=width;b.segments=3
    o.modifiers.new('Weighted corner normals','WEIGHTED_NORMAL')

def bezier(points,t):
    a,b,c,d=[Vector(p) for p in points];return (1-t)**3*a+3*(1-t)**2*t*b+3*(1-t)*t*t*c+t**3*d

# Polar rounded triangle with curved sides and three generous rounded tips.
N=120
outline=[]
for j in range(N):
    a=2*math.pi*j/N;r=1+.15*math.cos(3*(a+math.pi/2));outline.append((r*math.cos(a),r*math.sin(a)))
x0=min(p[0] for p in outline);x1=max(p[0] for p in outline);y0=min(p[1] for p in outline);y1=max(p[1] for p in outline)
outline=[((x-(x0+x1)/2)*.34/(x1-x0),(y-(y0+y1)/2)*.35/(y1-y0)) for x,y in outline]
roots=[]
for index,y,rotation in [(1,1.28,-math.pi/4),(2,2.40,-3*math.pi/4)]:
    root=bpy.data.objects.new(P+str(index)+' CONTROL — 604.169.25',None);col.objects.link(root)
    root.location=(1.28,y,F);root.rotation_euler.z=rotation;roots.append(root)
    root['product']='IKEA KYRRE berken 604.169.25';root['source']=URL
    root['dimensions_m']='42 x 48 x 45 cm; seat 34 x 35 cm'
    root['model_status']='Editable photograph reconstruction'
    v=[(x,y,z) for z in (.431,.450) for x,y in outline]
    faces=[tuple(range(N-1,-1,-1)),tuple(range(N,2*N))]+[(j,(j+1)%N,(j+1)%N+N,j+N) for j in range(N)]
    seat=mesh(str(index)+' rounded triangular seat',v,faces,wood,root);seat.data.materials.append(ply)
    for face in seat.data.polygons[2:]:face.material_index=1
    bevel(seat,.002)
    # Thin lamination lines around the exposed plywood edge.
    for k in range(1,6):
        z=.432+k*.0027
        verts=[(x*.999,y*.999,zz) for zz in (z,z+.00045) for x,y in outline]
        mesh(str(index)+' seat ply line '+str(k),verts,[(j,(j+1)%N,(j+1)%N+N,j+N) for j in range(N)],ply,root)
    legs=[]
    for leg in range(3):
        a=-math.pi/2+leg*2*math.pi/3;radial=Vector((math.cos(a),math.sin(a),0));tangent=Vector((-math.sin(a),math.cos(a),0))
        path=[]
        for j in range(49):
            t=j/48
            if t<.30:p=bezier([(.08,.422),(.145,.422),(.178,.419),(.190,.36)],t/.30)
            else:p=bezier([(.190,.36),(.207,.27),(.232,.085),(.240,.009)],(t-.30)/.70)
            path.append(p)
        verts=[]
        for j,p in enumerate(path):
            diff=path[min(j+1,len(path)-1)]-path[max(j-1,0)];diff.normalize()
            normal=radial*(-diff.y)+Vector((0,0,diff.x))
            center=radial*p.x+Vector((0,0,p.y));width=.047-(.014*j/(len(path)-1))
            for u,w in [(-1,-1),(1,-1),(1,1),(-1,1)]:verts.append(tuple(center+tangent*(u*width/2)+normal*(w*.009)))
        faces=[(3,2,1,0),(192,193,194,195)]+[(4*j+k,4*j+(k+1)%4,4*(j+1)+(k+1)%4,4*(j+1)+k) for j in range(48) for k in range(4)]
        o=mesh(str(index)+' bent birch leg '+str(leg+1),verts,faces,legwood,root,True);o.data.materials.append(ply)
        for j,q in enumerate(o.data.polygons):
            if j>=2 and (j-2)%4 in (1,3):q.material_index=1
        legs.append(o)
    # Match the official footprint for the three legs independently of the seat.
    pts=[v.co for o in legs for v in o.data.vertices]
    lo=[min(p[k] for p in pts) for k in range(3)];hi=[max(p[k] for p in pts) for k in range(3)]
    for o in legs:
        for v in o.data.vertices:
            v.co.x=(v.co.x-(lo[0]+hi[0])/2)*.42/(hi[0]-lo[0]);v.co.y=(v.co.y-(lo[1]+hi[1])/2)*.48/(hi[1]-lo[1]);v.co.z-=lo[2]
        bevel(o,.002)

name='71 | OFFICE - two IKEA KYRRE stools'
scene=bpy.data.scenes.get(name) or bpy.data.scenes.new(name)
source=bpy.data.scenes['08 | LIVING + OFFICE - photo layout'];scene.world=source.world
for c in source.collection.children:
    if c.name not in scene.collection.children:scene.collection.children.link(c)
def look(o,target):o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
cam=bpy.data.objects.new(P+'camera',bpy.data.cameras.new(P+'camera'));scene.collection.objects.link(cam)
cam.location=(3.5,3.85,F+2.30);cam.data.lens=38;look(cam,(.88,1.80,F+.64));scene.camera=cam
light=bpy.data.objects.new(P+'softbox',bpy.data.lights.new(P+'softbox','AREA'));scene.collection.objects.link(light)
light.location=(2.5,1.6,F+2.35);light.data.energy=220;light.data.size=2.5;look(light,(.8,1.8,F+.4))
scene.render.engine='BLENDER_EEVEE';scene.render.resolution_x=1300;scene.render.resolution_y=1050;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.filepath=str(ROOT/'office_kyrre_stools.png')
bpy.context.window.scene=scene;bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get()
def bounds(obs):
    pts=[]
    for o in obs:
        e=o.evaluated_get(deps);me=e.to_mesh();pts.extend(e.matrix_world@v.co for v in me.vertices);e.to_mesh_clear()
    return [[min(p[k] for p in pts) for k in range(3)],[max(p[k] for p in pts) for k in range(3)]]
report={'product':'IKEA KYRRE berken 604.169.25','source':URL,'count':2,'height_m':.45,'footprint_m':[.42,.48],'seat_m':[.34,.35],'scene':name,'stools':[]}
for r in roots:
    b=bounds([o for o in r.children if o.type=='MESH']);assert abs(b[1][2]-b[0][2]-.45)<.004
    collisions=[]
    for o in bpy.data.objects:
        if not o.name.startswith('Office /') or o.type!='MESH':continue
        ob=bounds([o]);over=[min(b[1][k],ob[1][k])-max(b[0][k],ob[0][k]) for k in range(3)]
        if min(over)>.001:collisions.append(o.name)
    assert not collisions,collisions
    report['stools'].append({'name':r.name,'position':list(r.location),'bounds':b,'desk_collisions':collisions})
(ROOT/'office_kyrre_verification.json').write_text(json.dumps(report,indent=2))
notes='Twee IKEA KYRRE berken krukjes (604.169.25), één voor elke MICKE-computerwerkplek. Afgeronde driehoekige zitting 34 x 35 cm, drie gebogen berken poten, totale maat 42 x 48 x 45 cm. Bewerkbare fotoreconstructie. Scene 71; office_kyrre_stools.py.\n'
(ROOT/'OFFICE_KYRRE_NOTES.txt').write_text(notes)
tx=bpy.data.texts.get('OFFICE - KYRRE notes') or bpy.data.texts.new('OFFICE - KYRRE notes');tx.clear();tx.write(notes)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'Huis_Oude_Terelststraat_15.blend'))
print(json.dumps(report,indent=2),flush=True);bpy.ops.render.render(write_still=True)
