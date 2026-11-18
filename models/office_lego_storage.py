"""Photo-based stepped toy storage behind the sofa, facing the office."""
import bpy, math, random, shutil, json
from pathlib import Path
from mathutils import Vector, Matrix
R=Path(__file__).resolve().parent;MAIN=R/'Huis_Oude_Terelststraat_15.blend'
BACKUP=R/'Huis_before_office_lego_storage.blend'
if not BACKUP.exists():shutil.copy2(MAIN,BACKUP)
P='Office LEGO storage / ';F=2.41
for o in list(bpy.data.objects):
    if o.name.startswith(P):bpy.data.objects.remove(o,do_unlink=True)
bpy.context.window.scene=bpy.data.scenes['08 | LIVING + OFFICE - photo layout'];bpy.context.view_layer.update()
preserved={o.name:tuple(tuple(r) for r in o.matrix_world) for o in bpy.data.objects}
col=bpy.data.collections['01 / Furniture']
sofa=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.name.startswith('Measured sofa /')]
sp=[o.matrix_world@Vector(v) for o in sofa for v in o.bound_box]
BACK=min(p.x for p in sp)-.025;START=min(p.y for p in sp)+.055
def W(u,d,z):return Vector((BACK-d,START+u,F+z))
def mat(name,h,rough=.45):
    m=bpy.data.materials.get(P+name) or bpy.data.materials.new(P+name);m.use_nodes=True
    rgb=tuple((int(h[i:i+2],16)/255)**2.2 for i in (0,2,4))+(1,)
    m.diffuse_color=rgb;b=m.node_tree.nodes.get('Principled BSDF');b.inputs['Base Color'].default_value=rgb;b.inputs['Roughness'].default_value=rough;return m
white=mat('warm white frame','E5E2D7');pink=mat('pink plastic tubs','D87894');teal=mat('turquoise tubs','65BABD')
blue=mat('blue storage brick','58A4D0');yellow=mat('yellow storage brick','E9BF28');red=mat('red LEGO','B92128',.3)
cream=mat('ivory LEGO','D9D8BB',.35);dark=mat('charcoal LEGO','292D31',.36);green=mat('green LEGO','348354',.35)
oak=mat('natural wooden rack','BC935F',.66);cloth=mat('grey canvas pockets','9B9C94',.95);grey=mat('grey LEGO','808C8E',.35)
palette=[red,yellow,blue,green,cream,dark,grey,pink]
def link(o,name,m):
    o.name=P+name
    for c in list(o.users_collection):c.objects.unlink(o)
    col.objects.link(o);o.data.materials.append(m);return o
def box(name,u,d,z,w,depth,h,m=white,bevel=.003):
    bpy.ops.mesh.primitive_cube_add(size=1,location=W(u,d,z));o=bpy.context.object;o.dimensions=(depth,w,h)
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);link(o,name,m)
    if bevel:b=o.modifiers.new('Soft molded edges','BEVEL');b.width=bevel;b.segments=3
    return o
def cylinder(name,u,d,z,r,h,m,axis='Z'):
    bpy.ops.mesh.primitive_cylinder_add(vertices=32,radius=r,depth=h,location=W(u,d,z));o=bpy.context.object
    if axis=='U':o.rotation_euler.x=math.pi/2
    link(o,name,m)
    for p in o.data.polygons:p.use_smooth=True
    return o
def mesh(name,vs,fs,m):
    me=bpy.data.meshes.new(P+name);me.from_pydata(vs,[],fs);me.update();me.materials.append(m)
    o=bpy.data.objects.new(P+name,me);col.objects.link(o);return o
def rr(w,d,r,n=7):
    pts=[]
    for x,y,a in [(w/2-r,d/2-r,0),(-w/2+r,d/2-r,90),(-w/2+r,-d/2+r,180),(w/2-r,-d/2+r,270)]:
        for j in range(n):
            t=math.radians(a+j*90/(n-1));pts.append((x+r*math.cos(t),y+r*math.sin(t)))
    return pts
def tub(name,u,d,z,w,dep,h,m):
    # Tapered open bins with rounded corners, internal floor and rolled lip.
    profiles=[(w-.026,dep-.026,.012,0),(w,dep,.020,h-.007),(w+.009,dep+.009,.022,h-.003),
              (w+.009,dep+.009,.022,h+.003),(w-.007,dep-.007,.018,h+.003),(w-.010,dep-.010,.016,h-.007),(w-.036,dep-.036,.009,.005)]
    vs=[];fs=[]
    for a,b,r,zz in profiles:vs.extend([W(u+x,d+y,z+zz) for x,y in rr(a,b,r)])
    N=len(rr(w,dep,.02))
    fs.append(tuple(reversed(range(N))))
    for k in range(len(profiles)-1):
        for i in range(N):fs.append((k*N+i,k*N+(i+1)%N,(k+1)*N+(i+1)%N,(k+1)*N+i))
    fs.append(tuple((len(profiles)-1)*N+i for i in range(N)))
    return mesh(name,vs,fs,m)

# Three stepped 33cm bays; the tallest bay is nearest the front window.
heights=[.94,.67,.39]
box('continuous bottom',.495,.22,.024,.99,.44,.036)
for j,h in enumerate(heights):
    u=.165+j*.33
    box('bay '+str(j+1)+' top',u,.22,h-.010,.33,.44,.020)
    box('bay '+str(j+1)+' back',u,.009,h/2,.33,.018,h)
for j,h in enumerate([.94,.94,.67,.39]):box('vertical frame '+str(j),j*.33,.22,h/2,.020,.44,h)
bins=[]
for j,h in enumerate(heights):
    u=.165+j*.33
    bins.append((u,.235,.054,.245,teal,'deep turquoise bay '+str(j+1)))
    for k in range(3 if j==0 else 2 if j==1 else 0):
        z=.325+k*.165
        # Slightly open, as in the photo, especially the top right drawer.
        dep=.245+(.090 if j==0 and k==2 else .018 if k%2==0 else 0)
        bins.append((u,dep,z,.127,pink,'pink bay '+str(j+1)+' drawer '+str(k+1)))
for u,d,z,h,m,name in bins:
    tub(name,u,d,z,.282,.382,h,m)
    for side in (-1,1):box(name+' runner',u+side*.147,.22,z+h-.01,.008,.39,.011,white,.001)

# Shared, lightweight LEGO meshes with real raised studs. Mixture of regular
# bricks and chunky Duplo-style pieces reflects the contents of the photos.
brickcache={}
def brickdata(nx,ny,pitch,plate=False):
    key=(nx,ny,pitch,plate)
    if key in brickcache:return brickcache[key]
    w=nx*pitch-.001;d=ny*pitch-.001;h=.0032 if plate else pitch*.60
    vs=[(x,y,z) for z in (0,h) for y in (-d/2,d/2) for x in (-w/2,w/2)]
    fs=[(0,2,3,1),(4,5,7,6),(0,1,5,4),(2,6,7,3),(0,4,6,2),(1,3,7,5)]
    N=12
    for i in range(nx):
        for j in range(ny):
            cx=(i-(nx-1)/2)*pitch;cy=(j-(ny-1)/2)*pitch;k=len(vs)
            for z in (h,h+pitch*.20):vs.extend([(cx+pitch*.30*math.cos(a*math.tau/N),cy+pitch*.30*math.sin(a*math.tau/N),z) for a in range(N)])
            for a in range(N):fs.append((k+a,k+(a+1)%N,k+N+(a+1)%N,k+N+a))
            fs.append(tuple(k+N+a for a in range(N)))
    me=bpy.data.meshes.new(P+'brick geometry '+str(key));me.from_pydata(vs,[],fs);me.update()
    for m in palette:me.materials.append(m)
    brickcache[key]=me;return me
rng=random.Random(1515);brick_count=0
def brick(name,u,d,z,nx,ny,m,pitch=.016,plate=False,angle=0,tilt=0):
    global brick_count
    data=brickdata(nx,ny,pitch,plate)
    o=bpy.data.objects.new(P+name,data);col.objects.link(o);o.location=W(u,d,z)
    # Map brick width to bay width (world Y); local depth to world -X.
    o.rotation_euler=(tilt,tilt*.4,math.pi/2+angle)
    # Object-linked slots allow reuse of the same geometry across colors.
    for slot in o.material_slots:slot.link='OBJECT';slot.material=m
    brick_count+=1;return o
for bi,(u,d,z,h,m,name) in enumerate(bins):
    for layer in range(3):
        for ix in range(4):
            for iy in range(4):
                uu=u+(ix-1.5)*.057+rng.uniform(-.008,.008)
                dd=d+(iy-1.5)*.073+rng.uniform(-.010,.010)
                zz=z+h-.058+layer*.018+rng.uniform(-.004,.004)
                brick(name+' loose LEGO',uu,dd,zz,rng.choice([1,2,2]),rng.choice([2,3,4]),rng.choice(palette),
                      rng.choice([.008,.016,.016]),False,rng.uniform(-.7,.7),rng.uniform(-.12,.12))

# Oversized stackable brick-shaped storage boxes, as photographed.
def storagebrick(name,u,z,m):
    box(name+' body',u,.235,z+.095,.286,.390,.190,m,.012)
    box(name+' lid seam',u,.235,z+.180,.29,.394,.012,m,.005)
    for du in (-.069,.069):
        for dd in (.125,.345):
            cylinder(name+' stud',u+du,dd,z+.205,.049,.034,m)
    # Recessed semicircular finger opening on the visible lower front edge.
    pts=[W(u+.038*math.cos(t*math.pi/20),.432,z+.002+.031*math.sin(t*math.pi/20)) for t in range(21)]
    mesh(name+' finger notch',pts,[tuple(range(21))],dark)
storagebrick('large pink storage block',.825,.39,pink)
storagebrick('large blue storage block',.825,.39+.225,blue)
box('yellow lidded box',.495,.21,.77,.27,.33,.20,yellow,.016)
box('yellow box lid',.495,.21,.875,.29,.35,.035,yellow,.008)

# Loose studded baseplates stacked across the blue box; open red boat on top.
for k,m in enumerate([cream,grey,dark]):
    o=brick('stacked building baseplate',.825,.245,.844+k*.008,16,22,m,.016,True,[-.08,.04,-.025][k])
    # Dark road plate receives dashed white/yellow road markings.
for k in range(6):box('road plate lane dash',.81,.105+k*.047,.868,.006,.026,.0008,cream,.0002)
tub('red boat open hull',.825,.25,.874,.145,.365,.055,red)
for dd in (.11,.39):brick('boat ivory studded deck',.825,dd,.932,8,6,cream,.016,True)
brick('boat red floor',.825,.245,.880,8,14,red,.016,True)
# Cardboard parts tray on the yellow storage box.
card=mat('cardboard parts tray','655D56',.9)
tub('open parts tray',.495,.22,.90,.280,.34,.064,card)
for k in range(12):brick('parts tray loose brick',.495+rng.uniform(-.095,.095),.22+rng.uniform(-.12,.12),.93,2,3,rng.choice(palette),.016,False,rng.uniform(-1,1))

# Adjacent wooden sling rack holding upright road/building baseplates.
for u in (1.075,1.685):box('sling rack timber side',u,.135,.32,.025,.25,.64,oak,.012)
for k in range(5):
    z=.085+k*.113;d=.26-k*.033
    cylinder('sling rack crossbar',1.38,d,z,.009,.61,white,'U')
    # Folded fabric pocket between successive bars, open at the top.
    vs=[W(u,dd,zz) for u in (1.087,1.673) for dd,zz in [(d,z),(d-.04,z-.075),(d-.065,z-.035),(d-.033,z+.112)]]
    mesh('grey canvas sling '+str(k),vs,[(0,1,5,4),(1,2,6,5),(2,3,7,6)],cloth)
    if k in (1,3,4):
        o=brick('upright road baseplate',1.38+(k%2)*.065,d-.038,z+.01,24 if k==4 else 18,16,dark if k!=1 else cream,.016,True)
        o.rotation_euler=(math.radians(76),0,math.pi/2)

# Product grouping remains behind the office-facing side of the sofa.
scene_name='76 | OFFICE - LEGO storage behind sofa'
old=bpy.data.scenes.get(scene_name)
if old:bpy.data.scenes.remove(old)
src=bpy.data.scenes['08 | LIVING + OFFICE - photo layout'];s=bpy.data.scenes.new(scene_name);s.world=src.world
for c in src.collection.children:s.collection.children.link(c)
for o in src.collection.objects:
    if o.type=='LIGHT':s.collection.objects.link(o)
def aim(o,p):o.rotation_euler=(Vector(p)-o.location).to_track_quat('-Z','Y').to_euler()
data=bpy.data.cameras.new(P+'camera');cam=bpy.data.objects.new(P+'camera',data);s.collection.objects.link(cam)
cam.location=W(1.1,2.05,1.60);aim(cam,W(.80,.18,.54));data.lens=40;data.clip_start=.025;s.camera=cam
ld=bpy.data.lights.new(P+'softbox','AREA');ld.energy=170;ld.shape='DISK';ld.size=1.6
lo=bpy.data.objects.new(P+'softbox',ld);s.collection.objects.link(lo);lo.location=W(.5,1.15,2.20);aim(lo,W(.65,.22,.5))
s.render.engine='BLENDER_EEVEE';s.render.resolution_x=1400;s.render.resolution_y=1050;s.render.resolution_percentage=100
s.view_settings.view_transform='AgX';s.render.image_settings.file_format='PNG';s.render.filepath=str(R/'office_lego_storage.png')
bpy.context.window.scene=s;bpy.context.view_layer.update()
for name,m in preserved.items():assert tuple(tuple(r) for r in bpy.data.objects[name].matrix_world)==m,name
assert BACK<min(p.x for p in sp)
assert START+1.71<max(p.y for p in sp)
report={'frame_dimensions_m':[.99,.44,.94],'sling_rack_width_m':.635,'sofa_gap_m':.025,'frame_world_x':[BACK-.44,BACK],
        'frame_world_y':[START,START+.99],'bins':len(bins),'LEGO_parts_and_plates':brick_count,'dimensions_estimated_from_photos':True,'preserved_objects':len(preserved)}
(R/'office_lego_storage_verification.json').write_text(json.dumps(report,indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(MAIN));bpy.ops.render.render(write_still=True)
print('VERIFIED',json.dumps(report),flush=True)
