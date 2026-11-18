"""Group the existing three wooden trains and add a small trailing houseplant."""
import bpy, math, json, shutil
from pathlib import Path
from mathutils import Vector, Matrix
R=Path(__file__).resolve().parent
MAIN=R/'Huis_Oude_Terelststraat_15.blend'
BACKUP=R/'Huis_before_grouped_trains_and_plant.blend'
if not BACKUP.exists():shutil.copy2(MAIN,BACKUP)
P='Shelf plant / '
for o in list(bpy.data.objects):
    if o.name.startswith(P):bpy.data.objects.remove(o,do_unlink=True)
scene=bpy.data.scenes['74 | CAMBER - Hedwig and wooden name trains']
bpy.context.window.scene=scene
col=bpy.data.collections['01 / Camber']
preserved={o.name:tuple(tuple(r) for r in o.matrix_world) for o in bpy.data.objects if not o.name.startswith('September29 / Train ')}
train_objects={}
for word,dx,dz in [('HANNA',-.088,0),('LOTTE',.042,.256),('LIENE',.115,.672)]:
    objs=[o for o in bpy.data.objects if o.name.startswith('September29 / Train '+word+' / ')]
    for o in objs:
        if 'separate_shelf_curved_matrix' not in o:o['separate_shelf_curved_matrix']=[v for row in o.matrix_world for v in row]
        a=list(o['separate_shelf_curved_matrix']);old=Matrix([a[i:i+4] for i in range(0,16,4)])
        o.matrix_world=Matrix.Translation(Vector((dx,0,dz)))@old
        o['arrangement']='Three curved trains grouped on one shelf, staggered front-to-back with natural occlusion.'
    train_objects[word]=objs

def mat(name,color,rough=.7):
    m=bpy.data.materials.get(P+name) or bpy.data.materials.new(P+name);m.use_nodes=True
    rgb=tuple((int(color[i:i+2],16)/255)**2.2 for i in (0,2,4))+(1,)
    m.diffuse_color=rgb;b=m.node_tree.nodes.get('Principled BSDF');b.inputs['Base Color'].default_value=rgb;b.inputs['Roughness'].default_value=rough
    return m
potmat=mat('warm ivory stoneware','D8CBB6',.78);soilmat=mat('dark potting soil','32281D',1)
green=mat('pothos deep green','37672F',.45);stemmat=mat('green stems','608044',.65)
veinmat=mat('subtle pale leaf veins','779452',.52)
for m,scale,strength,dist in ((potmat,120,.25,.0006),(soilmat,65,.6,.002)):
    n=m.node_tree.nodes;l=m.node_tree.links;t=n.new('ShaderNodeTexNoise');t.inputs['Scale'].default_value=scale
    b=n.new('ShaderNodeBump');b.inputs['Strength'].default_value=strength;b.inputs['Distance'].default_value=dist
    l.new(t.outputs['Fac'],b.inputs['Height']);l.new(b.outputs['Normal'],n.get('Principled BSDF').inputs['Normal'])
n=green.node_tree.nodes;l=green.node_tree.links;t=n.new('ShaderNodeTexNoise');t.inputs['Scale'].default_value=6;t.inputs['Detail'].default_value=3
ramp=n.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].position=.40;ramp.color_ramp.elements[0].color=(.027,.09,.015,1)
ramp.color_ramp.elements[1].position=.70;ramp.color_ramp.elements[1].color=(.25,.37,.095,1)
l.new(t.outputs['Fac'],ramp.inputs[0]);l.new(ramp.outputs[0],n.get('Principled BSDF').inputs['Base Color'])
def mesh(name,vs,fs,m):
    me=bpy.data.meshes.new(P+name);me.from_pydata(vs,[],fs);me.update();me.materials.append(m)
    o=bpy.data.objects.new(P+name,me);col.objects.link(o)
    for p in me.polygons:p.use_smooth=True
    return o
base=Vector((6.735,3.395,3.625))
def lathe(name,profile,m):
    vs=[];fs=[];N=64
    for rad,z in profile:
        vs.extend([base+Vector((rad*math.cos(math.tau*i/N),rad*math.sin(math.tau*i/N),z)) for i in range(N)])
    for j in range(len(profile)-1):
        for i in range(N):fs.append((j*N+i,j*N+(i+1)%N,(j+1)*N+(i+1)%N,(j+1)*N+i))
    return mesh(name,vs,fs,m)
lathe('ceramic planter',[(0,.003),(.048,.003),(.052,.009),(.067,.087),(.0675,.093),(.065,.096),(.061,.094),(.060,.088),(.048,.017),(0,.017)],potmat)
lathe('potting soil',[(0,.082),(.060,.082)],soilmat)
def curve(name,pts,radius,m):
    cu=bpy.data.curves.new(P+name,'CURVE');cu.dimensions='3D';cu.resolution_u=12;cu.bevel_depth=radius;cu.bevel_resolution=2
    sp=cu.splines.new('BEZIER');sp.bezier_points.add(len(pts)-1)
    for b,p in zip(sp.bezier_points,pts):b.co=base+Vector(p);b.handle_left_type='AUTO';b.handle_right_type='AUTO'
    o=bpy.data.objects.new(P+name,cu);col.objects.link(o);cu.materials.append(m);return o
def leaf(name,start,direction,length,width):
    a=Vector(start);d=Vector(direction).normalized()
    side=d.cross(Vector((0,0,1))).normalized()
    if side.length<.01:side=Vector((0,1,0))
    normal=side.cross(d).normalized()
    vs=[];fs=[];mid=[]
    for i in range(13):
        u=i/12;center=a+d*(length*u)+normal*(.013*math.sin(math.pi*u)-.014*u*u)
        half=width*.5*math.sin(math.pi*u)**.68*(1.16-.4*u)
        mid.append(center)
        for v in (-1,-.5,0,.5,1):
            p=center+side*(v*half)-normal*(.007*abs(v)**1.5*math.sin(math.pi*u))
            vs.append(base+p)
    for i in range(12):
        for j in range(4):k=i*5+j;fs.append((k,k+1,k+6,k+5))
    o=mesh(name,vs,fs,green);mod=o.modifiers.new('Thin living leaf','SOLIDIFY');mod.thickness=.00035
    curve(name+' midrib',[tuple(v+normal*.0004) for v in mid[::3]],.00035,veinmat)

# Asymmetric foliage, including a short vine that hangs clear of the shelf front.
for k in range(9):
    a=math.radians(k*137.5);reach=.035+.015*(k%3);height=.14+.025*(k%4)
    end=(math.cos(a)*reach,math.sin(a)*reach,height)
    curve('upright petiole '+str(k),[(0,0,.08),(end[0]*.25,end[1]*.25,height*.78),end],.0014,stemmat)
    leaf('upright leaf '+str(k),end,(math.cos(a),math.sin(a),.2-.16*(k%3)),.067+.009*(k%3),.045+.005*(k%2))
trailing=[(0,0,.09),(-.060,.035,.14),(-.130,.07,.115),(-.202,.095,.07),(-.222,.11,-.035),(-.225,.125,-.11)]
curve('trailing vine',trailing,.0016,stemmat)
for k in range(1,6):
    p=Vector(trailing[k]);direction=Vector((-.35,(-1 if k%2 else 1)*.9,-.35))
    tip=p+direction.normalized()*.012
    curve('trailing petiole '+str(k),[p,tip],.001,stemmat)
    leaf('trailing leaf '+str(k),tip,direction,.054,.037)

bpy.context.view_layer.update()
dep=bpy.context.evaluated_depsgraph_get()
def bounds(obs):
    pts=[]
    for o in obs:
        e=o.evaluated_get(dep);me=e.to_mesh();pts.extend(e.matrix_world@v.co for v in me.vertices);e.to_mesh_clear()
    return [[min(v[i] for v in pts),max(v[i] for v in pts)] for i in range(3)]
bb={w:bounds(obs) for w,obs in train_objects.items()}
for w,b in bb.items():
    assert b[0][0]>6.56 and b[0][1]<6.932,(w,b)
    assert b[1][0]>3.2261 and b[1][1]<3.6761,(w,b)
    assert abs(b[2][0]-4.297)<.0001,(w,b)
assert bb['HANNA'][0][1]<bb['LOTTE'][0][0]
assert bb['LOTTE'][0][1]<bb['LIENE'][0][0]
pb=bounds([o for o in col.objects if o.name.startswith(P)])
assert pb[2][1]<4.013,pb
assert pb[1][0]>3.2261 and pb[1][1]<3.6761,pb
for name,m in preserved.items():assert tuple(tuple(r) for r in bpy.data.objects[name].matrix_world)==m,name
report={'trains_share_shelf_z':4.297,'train_bounds':bb,'plant_bounds':pb,'plant':'Variegated trailing pothos in ivory stoneware pot','unrelated_objects_preserved':len(preserved)}
(R/'grouped_trains_plant_verification.json').write_text(json.dumps(report,indent=2))
scene.render.filepath=str(R/'camber_hedwig_name_trains.png')
bpy.ops.wm.save_as_mainfile(filepath=str(MAIN))
bpy.ops.render.render(write_still=True)
print('VERIFIED',json.dumps(report),flush=True)
