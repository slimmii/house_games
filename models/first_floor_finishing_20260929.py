"""Targeted, reversible first-floor updates; no house rebuild."""
import bpy, math, random, json, shutil
from pathlib import Path
from mathutils import Vector, Matrix

ROOT=Path(__file__).resolve().parent
MAIN=ROOT/'Huis_Oude_Terelststraat_15.blend'
BACKUP=ROOT/'Huis_before_toilet_mat_shelf_decor.blend'
if not BACKUP.exists(): shutil.copy2(MAIN,BACKUP)
F=2.41
P='September29 / '
for o in list(bpy.data.objects):
    if o.name.startswith(P): bpy.data.objects.remove(o,do_unlink=True)
preserved={o.name:tuple(tuple(r) for r in o.matrix_world) for o in bpy.data.objects
           if o.name not in ('WC cistern','WC pedestal','WC bowl','WC seat')}
furn=bpy.data.collections['01 / Furniture']
camber=bpy.data.collections['01 / Camber']
fittings=bpy.data.collections['01 / Fittings']

def mat(name,h,rough=.7):
    m=bpy.data.materials.get(P+name) or bpy.data.materials.new(P+name)
    m.use_nodes=True
    rgb=tuple((int(h[i:i+2],16)/255)**2.2 for i in (0,2,4))+(1,)
    m.diffuse_color=rgb
    b=m.node_tree.nodes.get('Principled BSDF');b.inputs['Base Color'].default_value=rgb;b.inputs['Roughness'].default_value=rough
    return m
def noise_bump(m,scale,strength,distance):
    n=m.node_tree.nodes;lk=m.node_tree.links
    t=n.new('ShaderNodeTexNoise');t.inputs['Scale'].default_value=scale;t.inputs['Detail'].default_value=2
    b=n.new('ShaderNodeBump');b.inputs['Strength'].default_value=strength;b.inputs['Distance'].default_value=distance
    lk.new(t.outputs['Fac'],b.inputs['Height']);lk.new(b.outputs[0],n.get('Principled BSDF').inputs['Normal'])
def link(o,name,m,col):
    o.name=P+name
    if m:o.data.materials.append(m)
    for c in list(o.users_collection):c.objects.unlink(o)
    col.objects.link(o)
    return o
def box(name,loc,size,m,col=furn,bev=.001):
    bpy.ops.mesh.primitive_cube_add(location=loc);o=bpy.context.object;o.dimensions=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    link(o,name,m,col)
    if bev:
        b=o.modifiers.new('Rounded edges','BEVEL');b.width=bev;b.segments=3
    return o
def sphere(name,loc,size,m,col=camber):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32,ring_count=20,location=loc)
    o=bpy.context.object;o.scale=size
    link(o,name,m,col)
    for p in o.data.polygons:p.use_smooth=True
    return o
def rod(name,a,b,r,m,col=camber,vertices=20):
    a,b=Vector(a),Vector(b);v=b-a
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=r,depth=v.length,location=(a+b)/2)
    o=bpy.context.object;o.rotation_euler=v.to_track_quat('Z','Y').to_euler()
    link(o,name,m,col)
    for p in o.data.polygons:p.use_smooth=True
    return o
def mesh(name,vs,fs,m,col=furn):
    me=bpy.data.meshes.new(P+name);me.from_pydata(vs,[],fs);me.update()
    o=bpy.data.objects.new(P+name,me);col.objects.link(o);me.materials.append(m);return o

# WC: back of the shallow room is the west end, opposite its entry and vanity.
# The source fixture points -Y; quarter-turn points it +X, out into the room.
for name,loc in {'WC cistern':(1,6.03,3.06),'WC pedestal':(1,5.81,2.61),
                 'WC bowl':(1,5.73,2.81),'WC seat':(1,5.70,2.91)}.items():
    o=bpy.data.objects[name]
    o.location=loc;o.rotation_euler=(0,0,0)
    o.matrix_world=Matrix.Translation(Vector((.65,5.85,0)))@Matrix.Rotation(math.pi/2,4,'Z')@Matrix.Translation(Vector((-1,-5.83,0)))@o.matrix_world
    o['placement_note']='Cistern against back (west) wall; bowl faces entrance, +X.'
plaster=bpy.data.materials['Warm white plaster']
# Independent thin internal skins conceal the office finish spill and leave
# all brick surfaces outside the toilet untouched.
box('WC white back wall',(.345,5.85,F+1.33),(.020,1.10,2.66),plaster,fittings,0)
box('WC white north wall',(1.648,6.390,F+1.33),(2.606,.020,2.66),plaster,fittings,0)
box('WC white south return',(1.14,5.311,F+1.33),(1.59,.020,2.66),plaster,fittings,0)

# A flat woven green traffic play rug, native editable geometry (no photograph
# projection); dimensions estimated from the reference, 150 x 100 cm.
green=mat('rug grass green','73A544');road=mat('rug asphalt grey','878B88')
chalk=mat('rug printed ivory','EAE8D2');rail=mat('rug railway charcoal','4A504B')
yellow=mat('rug sunny yellow','E6BF4B');blue=mat('rug pond blue','599CAC')
roof=mat('rug terracotta roofs','BA6E4C');cream=mat('rug buildings','E4D49B')
tree=mat('rug trees dark green','407640');trunk=mat('rug tree trunks','8A6846')
for m in (green,road,chalk,rail,yellow,blue,roof,cream,tree,trunk):noise_bump(m,170,.22,.0005)
cx,cy=5.40,9.81
base=box('Veranda traffic mat 150 x 100 cm',(cx,cy,F+.003),(1.5,1,.006),green,bev=.002)
base['dimensions_status']='Estimated from user photo, 150 x 100 cm.'
base['reference']='codex-clipboard-72e44176-0ee2-40d8-bee6-43ce7c0977cd.png'
layers={}
def poly(pts,m,z=0):
    vs,fs=layers.setdefault(m.name,([],[]));k=len(vs)
    vs.extend([(cx+x,cy+y,F+.0063+z*.00011) for x,y in pts]);fs.append(tuple(range(k,k+len(pts))))
def rect(x,y,w,h,m,z=0):poly([(x-w/2,y-h/2),(x+w/2,y-h/2),(x+w/2,y+h/2),(x-w/2,y+h/2)],m,z)
def disk(x,y,r,m,z=0):poly([(x+r*math.cos(t*math.tau/32),y+r*math.sin(t*math.tau/32)) for t in range(32)],m,z)
def strip(points,w,m,z=1,closed=False):
    points=list(points)
    if closed:points.append(points[0])
    for a,b in zip(points,points[1:]):
        dx,dy=b[0]-a[0],b[1]-a[1];l=math.hypot(dx,dy)
        if not l:continue
        nx,ny=-dy/l*w/2,dx/l*w/2
        poly([(a[0]+nx,a[1]+ny),(b[0]+nx,b[1]+ny),(b[0]-nx,b[1]-ny),(a[0]-nx,a[1]-ny)],m,z)
    for x,y in points:disk(x,y,w/2,m,z)
def dashed(points,w=.007,step=.044,length=.024,z=4):
    total=0
    for a,b in zip(points,points[1:]):
        dx,dy=b[0]-a[0],b[1]-a[1];d=math.hypot(dx,dy)
        if not d:continue
        for j in range(int(math.ceil((total+d)/step))):
            st=j*step-total;en=min(st+length,d)
            if en<=0 or st>=d:continue
            st=max(st,0)
            strip([(a[0]+dx*st/d,a[1]+dy*st/d),(a[0]+dx*en/d,a[1]+dy*en/d)],w,chalk,z)
        total=(total+d)%step
loop=[]
for x,y,start in ((.47,.20,0),(-.47,.20,90),(-.47,-.20,180),(.47,-.20,270)):
    for i in range(13):
        a=math.radians(start+i*90/12);loop.append((x+.125*math.cos(a),y+.125*math.sin(a)))
loop.append(loop[0])
strip(loop,.112,chalk,1);strip(loop,.099,road,2);dashed(loop)
cross=[(0,-.47),(0,.47)];strip(cross,.108,chalk,1);strip(cross,.096,road,2);dashed(cross)
cross2=[(-.7,.03),(.7,.03)];strip(cross2,.108,chalk,1);strip(cross2,.096,road,2);dashed(cross2)
for x in (-.22,.25):
    for y in (-.032,-.017,-.002,.013,.028):rect(x,y,.032,.007,chalk,5)
# Parking bays, pond, railway, printed houses and trees.
rect(.28,.145,.23,.112,road,2)
for x in (.18,.23,.28,.33,.38):rect(x,.16,.004,.066,chalk,4)
rect(.28,.193,.20,.004,chalk,4)
poly([(-.42,.09),(-.33,.08),(-.23,.14),(-.20,.23),(-.26,.255),(-.41,.23),(-.46,.17)],blue,2)
for k in range(4):strip([(-.405+k*.045,.145),(-.393+k*.045,.151),(-.379+k*.045,.145)],.003,chalk,4)
track=[(-.7,-.43),(-.50,-.42),(-.36,-.39),(-.28,-.32),(-.27,-.16)]
strip(track,.047,rail,1)
for shift in (-.014,.014):strip([(x+shift,y) for x,y in track],.003,yellow,3)
for i in range(15):
    x=-.68+i*.026;rect(x,-.425+(max(x+.50,0)*.3),.005,.032,cream,2)
for x,y in ((.30,-.17),(.44,-.17),(-.42,-.15),(-.58,.425),(.18,.42)):
    rect(x,y,.074,.061,cream,2);poly([(x-.045,y+.02),(x,y+.052),(x+.045,y+.02)],roof,3)
    rect(x-.018,y,.014,.016,blue,4);rect(x+.018,y,.014,.016,blue,4);rect(x,y-.021,.012,.019,trunk,4)
for x,y in ((-.65,.13),(-.53,.10),(-.13,.17),(.13,-.14),(.56,-.41),(.60,.43),(-.12,-.43),(.4,.42)):
    rect(x,y-.016,.01,.043,trunk,2);disk(x,y+.015,.026,tree,3);disk(x-.014,y,.018,tree,3);disk(x+.017,y,.020,tree,3)
for name,(vs,fs) in layers.items():mesh('Veranda mat print / '+name.split(' / ')[-1],vs,fs,bpy.data.materials[name])

# Top oak compartment: 45 cm clear width, shelf z=4.553, soffit z=4.909.
# Local toy coordinates: x across display, y towards viewer, z above shelf.
origin=Vector((6.735,3.4511,4.553))
def W(x,y,z):return origin+Vector((-y,-x,z))
white=mat('Hedwig soft snowy plush','F0F0E9',.97);noise_bump(white,145,.45,.0012)
feather=mat('Hedwig grey feather marks','62645F',.99)
dark=mat('Hedwig black beak and pupils','111314',.24)
gold=mat('Hedwig amber eyes','AC812E',.22)
brass=mat('Hedwig antique gold perch','9D7C38',.38)
brass.node_tree.nodes.get('Principled BSDF').inputs['Metallic'].default_value=.65
paper=mat('Hogwarts parchment','E6DDC5',.86);seal=mat('Hogwarts wax seal','8C2831',.42)
def ell(name,xyz,size,m=white):
    # Spheres' x axis in world is toy depth, y is toy width.
    return sphere('Hedwig / '+name,W(*xyz),(size[1],size[0],size[2]),m)
def line(name,a,b,r,m=brass):return rod('Hedwig / '+name,W(*a),W(*b),r,m)
ell('perch foot',(0,0,.010),(.083,.065,.010),brass)
for x in (-.055,.055):
    line('perch upright',(x,0,.01),(x,0,.063),.005)
    ell('perch finial',(x,0,.067),(.008,.008,.008),brass)
line('perch crossbar',(-.065,0,.052),(.065,0,.052),.006)
ell('pear shaped body',(0,-.003,.138),(.078,.058,.094))
ell('broad rounded head',(0,.008,.221),(.079,.064,.068))
ell('left facial disk',(-.035,.055,.218),(.038,.018,.043))
ell('right facial disk',(.035,.055,.218),(.038,.018,.043))
for s in (-1,1):
    ell('folded wing',(s*.064,-.002,.136),(.027,.050,.077))
    for j in range(6):
        # Long layered primary feathers, contained within the wing outline.
        ell('layered flight feather',(s*(.058+j*.002),.02-j*.008,.105+j*.008),(.017,.009,.045))
    for j in range(5):
        for k in range(2):
            ell('dark wing speckle',(s*(.071+k*.007),.025-j*.010,.115+j*.013),(.004,.0045,.007),feather)
    ell('eye socket',(s*.033,.071,.231),(.019,.007,.019),feather)
    ell('amber iris',(s*.033,.076,.231),(.016,.006,.016),gold)
    ell('deep glossy pupil',(s*.033,.081,.232),(.0115,.0035,.0128),dark)
    ell('eye highlight',(s*.033-.003,.084,.238),(.003,.0015,.003),white)
    for t in (-1,0,1):line('curled claw',(s*.027+t*.008,.002,.061),(s*.027+t*.008,.021,.047),.003,feather)
ell('beak upper',(0,.080,.211),(.010,.013,.017),dark)
ell('hooked beak point',(0,.086,.199),(.006,.007,.010),dark)
# Fine down strands on the crown and breast give a plush silhouette.
rng=random.Random(29)
cu=bpy.data.curves.new(P+'Hedwig fine down','CURVE');cu.dimensions='3D';cu.bevel_depth=.00015;cu.bevel_resolution=0
for i in range(850):
    a=rng.uniform(0,math.tau);v=rng.uniform(-.6,1);rr=math.sqrt(1-v*v)
    ishead=i<500
    ax,ay,az=(.079,.064,.068) if ishead else (.078,.058,.094)
    cent=(0,.008,.221) if ishead else (0,-.003,.138)
    x,y,z=ax*rr*math.cos(a),ay*rr*math.sin(a),az*v
    # Keep the central face clear so the eyes remain readable.
    if ishead and y>.037 and z<.040:continue
    n=Vector((x/ax,y/ay,z/az)).normalized();start=Vector(cent)+Vector((x,y,z));end=start+n*rng.uniform(.0018,.0040)
    sp=cu.splines.new('POLY');sp.points.add(1)
    sp.points[0].co=(*W(*start),1);sp.points[1].co=(*W(*end),1)
fur=bpy.data.objects.new(P+'Hedwig / plush down',cu);camber.objects.link(fur);cu.materials.append(white)
# Small sealed envelope beside the perch, not covering the owl.
env=box('Hedwig / Hogwarts envelope',W(.103,.025,.005),(.065,.082,.003),paper,camber,.001)
ell('red envelope seal',(.103,.025,.008),(.009,.009,.0018),seal)

# Unpainted full-wood name trains. Same pale wood for locomotive, letters,
# wheels and coupling links. Each five-letter train is 35 cm long.
wood=mat('name trains natural unfinished beech','CEAA75',.64)
n=wood.node_tree.nodes;lk=wood.node_tree.links
tex=n.new('ShaderNodeTexNoise');tex.inputs['Scale'].default_value=5;tex.inputs['Detail'].default_value=2
coord=n.new('ShaderNodeTexCoord');mapping=n.new('ShaderNodeVectorMath');mapping.operation='MULTIPLY';mapping.inputs[1].default_value=(2,2,32)
lk.new(coord.outputs['Generated'],mapping.inputs[0]);lk.new(mapping.outputs[0],tex.inputs['Vector'])
ramp=n.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].color=(.46,.285,.125,1);ramp.color_ramp.elements[1].color=(.70,.50,.28,1)
lk.new(tex.outputs['Fac'],ramp.inputs[0]);lk.new(ramp.outputs[0],n.get('Principled BSDF').inputs['Base Color'])
trains={}
for word,z0 in (('HANNA',4.297),('LOTTE',4.041),('LIENE',3.625)):
    train_start=set(bpy.data.objects)
    def T(x,y,z):return Vector((6.640-y,3.4511-x,z0+z))
    def B(label,xyz,size):return box('Train '+word+' / '+label,T(*xyz),(size[1],size[0],size[2]),wood,camber,.002)
    def R(label,a,b,r):return rod('Train '+word+' / '+label,T(*a),T(*b),r,wood)
    for j in range(6):
        x=-.150+j*.060
        B('locomotive chassis' if j==0 else 'letter wagon '+str(j),(x,0,.026),(.052,.034,.012))
        for wx in (x-.017,x+.017):
            for y in (-.021,.021):R('wooden wheel',(wx,y-.004,.012),(wx,y+.004,.012),.012)
        if j<5:R('wooden coupling',(x+.027,0,.024),(x+.034,0,.024),.004)
        if j==0:
            R('rounded wooden boiler',(x-.023,0,.049),(x+.005,0,.049),.017)
            B('engine cab',(x+.014,0,.052),(.018,.031,.040))
            B('engine cab roof',(x+.014,0,.074),(.026,.040,.007))
            R('chimney',(x-.016,0,.057),(x-.016,0,.080),.006)
        else:
            c=bpy.data.curves.new(P+word+' letter '+str(j),'FONT');c.body=word[j-1];c.align_x='CENTER';c.size=.064;c.extrude=.006;c.bevel_depth=.0008;c.bevel_resolution=2
            o=bpy.data.objects.new(P+'Train '+word+' / solid wood '+word[j-1]+' '+str(j),c);camber.objects.link(o);c.materials.append(wood)
            # Text local +X -> world -Y; local +Y -> world +Z;
            # local front -> world -X, facing out of the cabinet.
            o.matrix_world=Matrix(((0,0,-1,6.618),(-1,0,0,3.4511-x),(0,1,0,z0+.033),(0,0,0,1)))
    trains[word]=[o.name for o in set(bpy.data.objects)-train_start]

def aim(o,target):o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
def review(name,source,camloc,target,lens,lightloc,power,size,res):
    old=bpy.data.scenes.get(name)
    if old:bpy.data.scenes.remove(old)
    s=bpy.data.scenes.new(name);src=bpy.data.scenes[source];s.world=src.world
    for c in src.collection.children:s.collection.children.link(c)
    s.view_settings.view_transform='AgX';s.view_settings.exposure=0
    data=bpy.data.cameras.new(P+name);o=bpy.data.objects.new(P+name+' camera',data);s.collection.objects.link(o);o.location=camloc;data.lens=lens;data.clip_start=.02;aim(o,target);s.camera=o
    d=bpy.data.lights.new(P+name+' softbox','AREA');d.energy=power;d.shape='DISK';d.size=size
    l=bpy.data.objects.new(P+name+' softbox',d);s.collection.objects.link(l);l.location=lightloc;aim(l,target)
    s.render.engine='BLENDER_EEVEE';s.render.resolution_x,s.render.resolution_y=res;s.render.resolution_percentage=100;s.render.image_settings.file_format='PNG'
    return s
toilet_scene=review('72 | FIRST FLOOR WC - back wall and white finish','08 | LIVING + OFFICE - photo layout',
                   (2.57,5.63,3.62),(.74,5.85,2.98),24,(1.65,5.8,4.60),110,.7,(1100,900))
mat_scene=review('73 | VERANDA - green traffic mat','07 | LIVING + VERANDA - open room',
                (4.10,9.05,4.25),(5.25,9.82,2.75),22,(4.8,9.6,4.10),180,1.2,(1200,900))
shelf_scene=review('74 | CAMBER - Hedwig and wooden name trains','08 | LIVING + OFFICE - photo layout',
                  (4.90,3.4511,4.24),(6.70,3.4511,4.18),34,(5.65,3.6,4.65),65,.9,(800,1200))

# Verify preservation and support/clearance; write evidence alongside the blend.
bpy.context.window.scene=shelf_scene;bpy.context.view_layer.update()
for name,m in preserved.items():
    assert name in bpy.data.objects and tuple(tuple(r) for r in bpy.data.objects[name].matrix_world)==m,name
def bounds(names,scene):
    bpy.context.window.scene=scene;bpy.context.view_layer.update();dep=bpy.context.evaluated_depsgraph_get();pts=[]
    for name in names:
        o=bpy.data.objects[name]
        if o.type not in ('MESH','CURVE','FONT'):continue
        e=o.evaluated_get(dep);me=e.to_mesh();pts.extend(e.matrix_world@v.co for v in me.vertices);e.to_mesh_clear()
    return [[round(min(v[i] for v in pts),5),round(max(v[i] for v in pts),5)] for i in range(3)]
tb=bounds(['WC cistern','WC pedestal','WC bowl','WC seat'],toilet_scene)
assert tb[0][0]>=.355-1e-4 and tb[1][0]>5.321 and tb[1][1]<6.38,tb
hb=bounds([o.name for o in camber.objects if o.name.startswith(P+'Hedwig /')],shelf_scene)
assert hb[2][1]<4.909 and hb[0][0]>6.56 and hb[0][1]<6.932,hb
trainbounds={word:bounds(names,shelf_scene) for word,names in trains.items()}
for word,b in trainbounds.items():assert b[1][0]>3.2261 and b[1][1]<3.6761,(word,b)
report={'preserved_object_transforms':len(preserved),'WC_bounds':tb,'WC_back_wall_clearance_m':round(tb[0][0]-.355,4),
        'mat_dimensions_m':[1.50,1.00,.006],'mat_bounds_xy':[[4.65,6.15],[9.31,10.31]],'mat_size_estimated':True,
        'Hedwig_bounds':hb,'Hedwig_model':'Editable modeled approximation from product reference; no external mesh asset',
        'name_trains':trainbounds,'train_material':'All components natural unpainted beech','backup':str(BACKUP)}
(ROOT/'first_floor_finishing_verification.json').write_text(json.dumps(report,indent=2))
notes=bpy.data.texts.get('29 September - first floor updates') or bpy.data.texts.new('29 September - first floor updates')
notes.clear();notes.write(json.dumps(report,indent=2))
bpy.context.window.scene=shelf_scene
bpy.ops.wm.save_as_mainfile(filepath=str(MAIN))
for s,file in ((toilet_scene,'first_floor_toilet_corrected.png'),(mat_scene,'veranda_traffic_mat.png'),(shelf_scene,'camber_hedwig_name_trains.png')):
    bpy.context.window.scene=s;s.render.filepath=str(ROOT/file);bpy.ops.render.render(write_still=True)
bpy.context.window.scene=shelf_scene
bpy.ops.wm.save_as_mainfile(filepath=str(MAIN))
print('FINISHED',json.dumps(report),flush=True)
