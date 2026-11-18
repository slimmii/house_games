"""Dining furniture, keyboard and storage rack from user photos, 29 Sep 2026."""
import bpy, math, json, shutil, random
from pathlib import Path
from mathutils import Vector
R=Path(__file__).resolve().parent
MAIN=R/'Huis_Oude_Terelststraat_15.blend'
backup=R/'Huis_before_dining_and_keyboard_photos.blend'
if not backup.exists():shutil.copy2(MAIN,backup)
P='Dining photo / ';K='Sofa keyboard / ';O='Sofa organiser / ';F=2.41
bpy.context.window.scene=bpy.data.scenes['82 | EETTAFEL - plafondlamp met vier ringen'];bpy.context.view_layer.update()
col=bpy.data.collections['01 / Furniture']
oldchairs=[o for o in bpy.data.objects if o.name.startswith('Dining chair - indicative') and o.type=='EMPTY']
placements=[(tuple(o.location),o.rotation_euler.z) for o in oldchairs]
if not placements:
 placements=[(tuple(o.location),o.rotation_euler.z) for o in bpy.data.objects if o.name.startswith(P+'chair ') and o.type=='EMPTY']
removals=set(o.name for o in bpy.data.objects if o.name.startswith((P,K,O,'Table angled leg')))
for o in oldchairs:
 removals.add(o.name);removals.update(c.name for c in o.children_recursive)
table=bpy.data.objects['T / Dining table - estimated 260 x 100']
preserved={o.name:tuple(tuple(r) for r in o.matrix_world) for o in bpy.data.objects if o.name not in removals and o!=table}
for n in removals:bpy.data.objects.remove(bpy.data.objects[n],do_unlink=True)
def mat(name,h,rough=.45,metal=0):
 m=bpy.data.materials.get(name) or bpy.data.materials.new(name);m.use_nodes=True
 rgba=tuple((int(h[i:i+2],16)/255)**2.2 for i in (0,2,4))+(1,);m.diffuse_color=rgba
 b=m.node_tree.nodes.get('Principled BSDF');b.inputs['Base Color'].default_value=rgba;b.inputs['Roughness'].default_value=rough;b.inputs['Metallic'].default_value=metal
 return m
white=mat(P+'warm white moulded plastic','E9E9E3',.32);pad=mat(P+'ivory inset cushion','E3DFD3',.57);seam=mat(P+'cushion fine seam','BDB9AE',.65)
wood=mat(P+'natural oak legs','C39D6F',.52);dark=mat(P+'satin black metal','202327',.32,.5)
silver=mat(K+'silver control deck','A9AFB0',.36,.38);black=mat(K+'charcoal keyboard body','292E32',.4)
keywhite=mat(K+'ivory keys','F4F2E7',.27);keyblack=mat(K+'black keys','101216',.27);screen=mat(K+'LCD blue grey','354D58',.27)
plastic=mat(O+'white rack and bins','E6E8E4',.45);grey=mat(O+'support rods','BFC2BE',.45,.25)
colors=[mat(O+n,h,.52) for n,h in [('green','45B677'),('blue','3987B9'),('orange','D89431'),('pink','D686A7'),('yellow','E2C253')]]
def mesh(name,vs,fs,m,parent=None,collection=col,smooth=False):
 me=bpy.data.meshes.new(name);me.from_pydata(vs,[],fs);me.materials.append(m);me.update();o=bpy.data.objects.new(name,me);collection.objects.link(o);o.parent=parent
 if smooth:
  for f in me.polygons:f.use_smooth=True
 return o
def bevel(o,width=.003,segments=3):
 b=o.modifiers.new('Soft manufactured edges','BEVEL');b.width=width;b.segments=segments;o.modifiers.new('Weighted surface normals','WEIGHTED_NORMAL');return o
def box(name,loc,size,m,parent=None,bev=.003,collection=col):
 vs=[(sx*size[0]/2,sy*size[1]/2,sz*size[2]/2) for sz in (-1,1) for sy in (-1,1) for sx in (-1,1)]
 o=mesh(name,vs,[(0,2,3,1),(4,5,7,6),(0,1,5,4),(2,6,7,3),(0,4,6,2),(1,3,7,5)],m,parent,collection);o.location=loc
 return bevel(o,bev) if bev else o
def cyl(name,a,b,r,m,parent=None,r2=None,N=24):
 a,b=Vector(a),Vector(b);d=b-a;r2=r if r2 is None else r2
 vs=[(rr*math.cos(i*math.tau/N),rr*math.sin(i*math.tau/N),z) for rr,z in ((r,-d.length/2),(r2,d.length/2)) for i in range(N)]
 fs=[tuple(reversed(range(N))),tuple(range(N,2*N))]+[(i,(i+1)%N,(i+1)%N+N,i+N) for i in range(N)]
 ob=mesh(name,vs,fs,m,parent,smooth=True);ob.location=(a+b)/2;ob.rotation_euler=d.to_track_quat('Z','Y').to_euler();bevel(ob,.0015,2);return ob
def bar(name,a,b,w,d,m,parent=None):
 a,b=Vector(a),Vector(b);v=b-a;o=box(name,(a+b)/2,(w,d,v.length),m,parent,.003);o.rotation_euler=v.to_track_quat('Z','Y').to_euler();return o
def line(name,pts,r,m,parent=None,closed=False):
 cu=bpy.data.curves.new(name,'CURVE');cu.dimensions='3D';cu.bevel_depth=r;cu.bevel_resolution=2;sp=cu.splines.new('POLY');sp.points.add(len(pts)-1)
 for p,co in zip(sp.points,pts):p.co=(*co,1)
 sp.use_cyclic_u=closed;o=bpy.data.objects.new(name,cu);col.objects.link(o);cu.materials.append(m);o.parent=parent;return o
def root(name,loc,angle=0):
 o=bpy.data.objects.new(name,None);col.objects.link(o);o.location=loc;o.rotation_euler.z=angle;return o
def superellipse(a,b,n=3.2,N=128):
 return [(a*math.copysign(abs(math.cos(t))**(2/n),math.cos(t)),b*math.copysign(abs(math.sin(t))**(2/n),math.sin(t))) for t in (i*math.tau/N for i in range(N))]
# Barrel-shaped top, with broad curved ends and visibly bowed sides.
cx,cy,cz=table.location;top=cz+.0325;thickness=.03
poly=superellipse(.5,1.3,3.25);N=len(poly)
vs=[(x,y,z) for z in (-thickness/2,thickness/2) for x,y in poly]
fs=[tuple(reversed(range(N))),tuple(range(N,2*N))]+[(i,(i+1)%N,(i+1)%N+N,i+N) for i in range(N)]
me=bpy.data.meshes.new(P+'barrel outline tabletop');me.from_pydata(vs,[],fs);me.update()
oak=mat(P+'pale natural oak tabletop','C4AA8B',.5);nodes=oak.node_tree.nodes;links=oak.node_tree.links
for nd in list(nodes):
 if nd.type not in ('BSDF_PRINCIPLED','OUTPUT_MATERIAL'):nodes.remove(nd)
tc=nodes.new('ShaderNodeTexCoord');scale=nodes.new('ShaderNodeVectorMath');scale.operation='MULTIPLY';scale.inputs[1].default_value=(24,1.3,5)
noise=nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=2.8;noise.inputs['Detail'].default_value=4;noise.inputs['Roughness'].default_value=.65
ramp=nodes.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].position=.17;ramp.color_ramp.elements[0].color=(.37,.26,.165,1);ramp.color_ramp.elements[1].position=.84;ramp.color_ramp.elements[1].color=(.66,.51,.35,1)
links.new(tc.outputs['Generated'],scale.inputs[0]);links.new(scale.outputs[0],noise.inputs['Vector']);links.new(noise.outputs['Fac'],ramp.inputs[0]);links.new(ramp.outputs[0],nodes.get('Principled BSDF').inputs['Base Color'])
bump=nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.12;bump.inputs['Distance'].default_value=.0004;links.new(noise.outputs['Fac'],bump.inputs['Height']);links.new(bump.outputs[0],nodes.get('Principled BSDF').inputs['Normal'])
me.materials.append(oak);table.data=me;table.location.z=top-thickness/2
for m in list(table.modifiers):table.modifiers.remove(m)
bevel(table,.003,3);table['shape']='Barrel outline with bowed long edges and rounded broad ends, photo reference';table['dimensions_status']='Existing estimated 260 x 100 cm retained; 3 cm thickness estimated from photos'
# Black rectangular spider base, four diagonal branches around a central junction.
tbase=root(P+'table black spider base',(cx,cy,F))
box(P+'central steel hub',(0,0,.34),(.18,.22,.16),dark,tbase,.012)
for sx in (-1,1):
 for sy in (-1,1):
  bar(P+'spider floor branch',(sx*.055,sy*.04,.35),(sx*.36,sy*.76,.035),.08,.05,dark,tbase)
  bar(P+'spider upper branch',(sx*.045,sy*.03,.36),(sx*.28,sy*.74,top-F-.04),.065,.045,dark,tbase)
  box(P+'table floor protector',(sx*.36,sy*.76,.014),(.09,.12,.024),black,tbase,.005)
# One continuous scooped shell per chair. Local +X faces the tabletop.
profile=[(.25,.465,.166),(.23,.457,.211),(.17,.448,.232),(.07,.444,.236),(-.065,.446,.226),(-.145,.464,.203),(-.195,.502,.183),(-.221,.565,.176),(-.235,.66,.179),(-.259,.78,.19),(-.288,.895,.195),(-.302,.93,.184),(-.305,.94,.167)]
for idx,(loc,angle) in enumerate(placements,1):
 cr=root(P+f'chair {idx} white shell and oak legs',loc,angle);cr['dimensions_status']='Estimated: 47 cm wide, seat 46 cm high, back approximately 95 cm high'
 vs=[];cross=17
 for j,(x,z,w) in enumerate(profile):
  for k in range(cross):
   u=-1+2*k/(cross-1);back=max(0,min(1,(z-.5)/.4));xx=x+back*.04*u*u
   if j==0:xx-=.022*u*u
   zz=z+(.025*(1-back))*u**4
   if j>=len(profile)-2:zz-=.02*u**4
   vs.append((xx,w*u,zz))
 fs=[(j*cross+k,j*cross+k+1,(j+1)*cross+k+1,(j+1)*cross+k) for j in range(len(profile)-1) for k in range(cross-1)]
 shell=mesh(P+f'chair {idx} continuous curved shell',vs,fs,white,cr,smooth=True)
 sub=shell.modifiers.new('Smooth moulded curvature','SUBSURF');sub.levels=2;sub.render_levels=2
 sol=shell.modifiers.new('Shell wall thickness 9 mm','SOLIDIFY');sol.thickness=.009;sol.offset=-1
 b=shell.modifiers.new('Soft shell rim','BEVEL');b.width=.0015;b.segments=2
 # Independent thin padded insert, with a subtle perimeter seam.
 outline=superellipse(.201,.208,2.8,96);N=len(outline);vs=[]
 for r,z in ((.0,.467),(.35,.468),(.78,.467),(.96,.462),(1,.454),(.98,.45)):
  vs.extend([(.022+x*r,y*r,z) for x,y in outline])
 fs=[(j*N+i,j*N+(i+1)%N,(j+1)*N+(i+1)%N,(j+1)*N+i) for j in range(5) for i in range(N)]
 cushion=mesh(P+f'chair {idx} inset seat cushion',vs,fs,pad,cr,smooth=True)
 line(P+f'chair {idx} cushion seam',[(.022+x*.99,y*.99,.456) for x,y in outline],.0007,seam,cr,True)
 box(P+f'chair {idx} underside support',(0,0,.416),(.285,.285,.03),white,cr,.015)
 for sx in (-1,1):
  for sy in (-1,1):
   cyl(P+f'chair {idx} splayed wooden leg',(sx*.22,sy*.205,.013),(sx*.14,sy*.145,.43),.013,wood,cr,.024,32)
   cyl(P+f'chair {idx} felt pad',(sx*.22,sy*.205,.002),(sx*.22,sy*.205,.01),.012,seam,cr,N=20)
print('DINING FURNITURE BUILT',flush=True)
# The new reverse view exposed coplanar base/back faces in the existing sofa.
# Inset only the internal base surface; the upholstered outer shells stay fixed.
sofa_base=bpy.data.objects.get('Measured sofa / continuous L base')
if sofa_base and not sofa_base.get('rear_surface_fix'):
 xmin=min(v.co.x for v in sofa_base.data.vertices);ymax=max(v.co.y for v in sofa_base.data.vertices)
 for v in sofa_base.data.vertices:
  if abs(v.co.x-xmin)<1e-5:v.co.x+=.004
  if abs(v.co.y-ymax)<1e-5:v.co.y-=.004
 sofa_base.data.update();sofa_base['rear_surface_fix']='Base inset 4 mm behind existing upholstered rear and side shells; exterior sofa size unchanged.'
# Keyboard against rear (dining-facing) side of sofa; existing office storage remains on other side.
kr=root(K+'keyboard and X stand',(4.88,3.455,F));kr['estimated_dimensions_m']=[1.08,.37,.84]
# Local front is +Y, with keyboard keys facing the dining room.
box(K+'lower charcoal body',(0,0,.786),(1.08,.365,.085),black,kr,.035)
box(K+'silver top deck',(0,-.058,.833),(1.045,.223,.035),silver,kr,.015)
for sx in (-1,1):box(K+'curved silver end cheek',(sx*.52,.003,.806),(.042,.33,.09),silver,kr,.019)
keywidth=.0245;start=-36*keywidth/2
for i in range(36):box(K+f'white key {i+1:02}',(start+(i+.5)*keywidth,.105,.83),(keywidth-.001,.137,.018),keywhite,kr,.001)
# Five octaves, ending with C: 36 white and 25 black = 61 keys.
for i in range(35):
 if i%7 in (0,1,3,4,5):box(K+f'black key {i:02}',(start+(i+1)*keywidth,.068,.849),(.014,.079,.022),keyblack,kr,.001)
box(K+'LCD display',(0,-.077,.853),(.14,.056,.004),screen,kr,.003)
for sx in (-1,1):
 for j in range(12):box(K+'speaker grille slot',(sx*.386,-.135+j*.007,.852),(.16,.002,.0012),black,kr,.0002)
for i in range(10):box(K+'tone selection button',(-.21+i*.046,-.027,.854),(.026,.011,.004),black,kr,.002)
for i in range(5):box(K+'rhythm button',(-.24+i*.037,-.089,.854),(.018,.01,.004),keywhite,kr,.002)
cyl(K+'volume knob',(-.278,-.098,.85),(-.278,-.098,.861),.011,black,kr)
for y in (-.11,.11):
 bar(K+'crossed stand tube',(-.42,y,.05),(.32,y,.75),.026,.022,dark,kr)
 bar(K+'crossed stand tube',(.42,y,.05),(-.32,y,.75),.026,.022,dark,kr)
for x in (-.42,.42):
 cyl(K+'floor crossbar',(x,-.27,.028),(x,.27,.028),.019,dark,kr)
 for y in (-.265,.265):cyl(K+'rubber foot cap',(x,y-.022,.028),(x,y+.022,.028),.022,black,kr)
for x in (-.32,.32):cyl(K+'keyboard support bar',(x,-.20,.744),(x,.20,.744),.018,black,kr)
cyl(K+'pivot bolt',(0,-.15,.405),(0,.16,.405),.027,black,kr)
# Three rows of tilted open white bins, between two rounded side panels.
org=root(O+'three tier open organiser',(3.69,3.405,F));org['estimated_dimensions_m']=[.63,.32,.80]
for x in (-.315,.315):
 box(O+'rounded white side panel',(x,0,.40),(.019,.315,.80),plastic,org,.015)
 for z in (.17,.38,.59):
  for y in (-.105,.105):cyl(O+'side fixing screw',(x-.011,y,z),(x+.011,y,z),.0025,grey,org,N=12)
# Bins open toward +Y, with a low front lip and a rolled upper rim.
def binmesh(name,parent,w=.186,d=.27,h=.116):
 outline=superellipse(w/2,d/2,7,48);N=len(outline);vs=[]
 for r,z in ((.83,0),(1,h-.006),(1.025,h),(1.025,h+.004),(.98,h+.004),(.96,h-.004),(.79,.007)):
  vs.extend([(x*r,y*r,z) for x,y in outline])
 fs=[tuple(reversed(range(N))),tuple((6*N+i) for i in range(N))]
 fs +=[(j*N+i,j*N+(i+1)%N,(j+1)*N+(i+1)%N,(j+1)*N+i) for j in range(6) for i in range(N)]
 return mesh(name,vs,fs,plastic,parent,smooth=True)
rng=random.Random(29)
for row,z in enumerate((.085,.315,.545),1):
 for y in (-.104,.108):cyl(O+f'row {row} support rail',(-.304,y,z+.065),(.304,y,z+.065),.009,grey,org)
 for bay,x in enumerate((-.203,0,.203),1):
  br=root(O+f'row {row} bin {bay}',(x,0,z));br.parent=org;br.rotation_euler.x=math.radians(-16)
  binmesh(O+f'open tilted tub {row}-{bay}',br)
  # A few simple colourful play items show the storage function.
  if row==2 and bay==1:
   for k in range(3):cyl(O+'stacked play cups',(0,0,.037+k*.018),(0,0,.07+k*.018),.042-k*.004,colors[0],br,.044-k*.004)
  elif row==3:
   for k in range(3):
    ob=box(O+'book or craft pouch',(-.045+k*.046,-.045,.105),(.032,.10,.12),colors[(bay+k)%5],br,.006);ob.rotation_euler.y=(k-1)*.13
  else:
   for k in range(4):
    ob=box(O+'toy block',(-.043+(k%2)*.074,-.055+(k//2)*.10,.07),(.05,.06,.055),colors[(bay+row+k)%5],br,.006);ob.rotation_euler.z=rng.uniform(-.25,.25)
# Camera scenes retain shared house geometry.
def review(name,camloc,target,lens,path,res=(1300,1050),ceiling=True):
 old=bpy.data.scenes.get(name)
 if old:bpy.data.scenes.remove(old)
 source=bpy.data.scenes['82 | EETTAFEL - plafondlamp met vier ringen'];s=bpy.data.scenes.new(name);s.world=source.world
 for c in source.collection.children:
  if ceiling or not c.name.startswith('Dining ceiling lamp / interior ceiling'):s.collection.children.link(c)
 for o in source.collection.objects:
  if o.type=='LIGHT':s.collection.objects.link(o)
 cam=bpy.data.objects.new(name+' camera',bpy.data.cameras.new(name+' camera'));s.collection.objects.link(cam);cam.location=camloc;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=lens;s.camera=cam
 s.render.engine='CYCLES';s.cycles.samples=32;s.cycles.use_denoising=True;s.cycles.device='CPU';s.render.threads_mode='FIXED';s.render.threads=8;s.render.resolution_x,s.render.resolution_y=res;s.render.resolution_percentage=100;s.view_settings.view_transform='AgX';s.render.image_settings.file_format='PNG';s.render.filepath=str(R/path)
 return s
s1=review('83 | EETTAFEL - tafel en kuipstoelen naar foto',(3.22,3.9,4.42),(5.48,6.25,3.13),35,'dining_furniture_photo.png')
s2=review('84 | EETTAFEL - gebogen bladvorm',(5.77,6.3,7.9),(5.77,6.3,2.8),42,'dining_table_outline.png',(1000,1300),False)
s2.camera.data.type='ORTHO';s2.camera.data.ortho_scale=4.1
# Exclude the lamp only from the overhead inspection layer so the outline is unobstructed.
for o in s2.objects:
 if o.name.startswith('Dining ceiling lamp /'):o.hide_set(True,view_layer=s2.view_layers[0])
s3=review('85 | LIVING - keyboard en bakjesrek achter zetel',(6.30,5.50,4.02),(4.38,3.25,2.95),37,'sofa_keyboard_organiser.png',(1400,1100),False)
# Gentle fill from dining room for the reverse sofa view.
ld=bpy.data.lights.new(K+'review soft light','AREA');ld.energy=100;ld.shape='DISK';ld.size=2.5
lo=bpy.data.objects.new(ld.name,ld);s3.collection.objects.link(lo);lo.location=(4.7,5.2,4.6);lo.rotation_euler=(Vector((4.4,3.3,2.9))-lo.location).to_track_quat('-Z','Y').to_euler()
bpy.context.window.scene=s1;bpy.context.view_layer.update()
for n,m in preserved.items():assert tuple(tuple(r) for r in bpy.data.objects[n].matrix_world)==m,n
assert len(placements)==5
assert abs(table.dimensions.x-1)<1e-4 and abs(table.dimensions.y-2.6)<1e-4
report={'table_outline':'barrel / softly squared oval','table_estimated_dimensions_m':[1,2.6,.03],'chair_count':len(placements),'chairs':'white continuous moulded shells, inset ivory cushion, four splayed oak legs','keyboard':'61 keys, silver and charcoal body, black X stand','keyboard_estimated_dimensions_m':[1.08,.37,.84],'organiser':'white side panels, 3 tiers x 3 tilted open tubs','organiser_estimated_dimensions_m':[.65,.32,.80],'preserved_original_transforms':len(preserved),'dimension_status':'Photo-based estimates, prior tabletop width and length retained'}
(R/'dining_and_sofa_photo_verification.json').write_text(json.dumps(report,indent=2))
tx=bpy.data.texts.get('Dining and sofa photo updates') or bpy.data.texts.new('Dining and sofa photo updates');tx.clear();tx.write(json.dumps(report,indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(MAIN));print('SAVED PHOTO UPDATES',flush=True)
for s in (s1,s2,s3):
 bpy.context.window.scene=s;print('RENDERING',s.name,flush=True);bpy.ops.render.render(write_still=True,scene=s.name)
print('VERIFIED',json.dumps(report),flush=True)
