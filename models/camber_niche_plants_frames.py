"""Add the two photographed niche arrangements without altering the cabinet."""
import bpy,math,random,sys,shutil,json
from pathlib import Path
from mathutils import Vector
R=Path(__file__).resolve().parent;sys.path.insert(0,str(R))
import photo_props_utils as h
MAIN=R/'Huis_Oude_Terelststraat_15.blend';backup=R/'Huis_before_niche_plants_frames.blend'
if not backup.exists():shutil.copy2(MAIN,backup)
h.P='Niche photo / ';h.COL=bpy.data.collections['01 / Camber']
for o in list(bpy.data.objects):
 if o.name.startswith(h.P):bpy.data.objects.remove(o,do_unlink=True)
bpy.context.window.scene=bpy.data.scenes['08 | LIVING + OFFICE - photo layout'];bpy.context.view_layer.update()
keep={o.name:tuple(tuple(r) for r in o.matrix_basis) for o in bpy.data.objects}
white=h.mat('ivory picture frames','DBDAD4',.56);paper=h.mat('warm blank inserts','C8C3B9',.9)
stem=h.mat('fine green stems','3C5030',.8);wood=h.mat('woody flower stem','645447',.9)
greens=[h.mat('foliage '+str(i),c,.7) for i,c in enumerate(['304736','3C5540','4B6349','5B7050','293F33'])]
pot=h.mat('hidden dark plant pot','494A40',.8);soil=h.mat('pot soil','2D2921',1)
stone=h.mat('mossy square vase','6C6950',.88)
n=stone.node_tree.nodes;l=stone.node_tree.links;t=n.new('ShaderNodeTexNoise');t.inputs['Scale'].default_value=12
r=n.new('ShaderNodeValToRGB');r.color_ramp.elements[0].color=(.075,.080,.041,1);r.color_ramp.elements[1].color=(.24,.22,.12,1)
l.new(t.outputs['Fac'],r.inputs[0]);l.new(r.outputs[0],n.get('Principled BSDF').inputs['Base Color'])
petalwhite=h.mat('soft ivory petals','E9DED1',.72);petalpink=h.mat('dusty pink petals','C59C9B',.75);petaldark=h.mat('rose buds','9D7376',.75);pollen=h.mat('flower centres','BD9B55',.75)

# Front-facing coordinates in the two existing recesses. +u is right in
# elevation, +d is towards the room; all measurements derive from the cabinet.
YU=6.0621;YS=4.7671
def U(u,d,z):return Vector((6.951-d,YU-u,z))
def S(u,d,z):return Vector((6.951-d,YS-u,z))

# Dense trailing foliage: one mesh per colour rather than hundreds of objects.
rng=random.Random(2909);leafmesh={i:([],[]) for i in range(len(greens))}
def leaf(a,direction,L,w,index):
 a=Vector(a);direction=Vector(direction).normalized();side=direction.cross(Vector((1,0,.2))).normalized()
 if side.length<.01:side=Vector((0,1,0))
 normal=side.cross(direction).normalized();vs,fs=leafmesh[index];start=len(vs)
 for i in range(9):
  t=i/8;half=w*.5*math.sin(math.pi*t)**.8
  centre=a+direction*(t*L)+normal*(.004*math.sin(math.pi*t))
  for v in (-1,0,1):vs.append(centre+side*(v*half)-normal*(abs(v)*.002*math.sin(math.pi*t)))
 for i in range(8):
  for j in range(2):k=start+i*3+j;fs.append((k,k+1,k+4,k+3))

zplant=4.574
h.lathe('upper concealed planter',U(-.025,.19,zplant),[(0,0),(.049,0),(.064,.086),(.063,.09),(.057,.09),(.051,.017),(0,.017)],pot)
h.lathe('upper potting soil',U(-.025,.19,zplant),[(0,.080),(.057,.080)],soil)
# Crown sprays fill the upper cell, with small individual oval leaves.
for k in range(28):
 a=k*2.399;u=-.025+.105*math.cos(a);d=.20+.09*math.sin(a);z=zplant+.10+rng.uniform(.055,.165)
 points=[U(-.025,.19,zplant+.073),U(u*.6,d,zplant+.15),U(u,d,z)]
 h.line('upper foliage crown stem',points,.00085,stem)
 for j in range(5):
  f=(j+1)/5;p=points[1].lerp(points[2],f)
  for sign in (-1,1):
   direction=Vector((-rng.uniform(.2,.8),sign*rng.uniform(.4,1),rng.uniform(-.5,.55)))
   leaf(p,direction,rng.uniform(.026,.043),rng.uniform(.012,.024),rng.randrange(len(greens)))
# The cascade passes in front of the shelf edge rather than through the shelf.
for k in range(15):
 u=-.12+k*.015;length=.30+.25*(1-abs(k-7)/8)+rng.uniform(-.05,.025)
 points=[U(-.025,.19,zplant+.09),U(u,.38,zplant+.11),U(u+.012,.433,zplant+.008)]
 for j in range(1,10):
  t=j/9;points.append(U(u+.017*math.sin(t*6+k),.435+.012*math.sin(t*4+k),zplant-length*t))
 h.line('upper hanging vine',points,.0008,stem)
 # Irregularly spaced leaves continue from the pot over the lip, avoiding
 # bare arcs and regimented horizontal rows at the shared control points.
 for j in range(24):
  t=(j+rng.uniform(.05,.95))/24*(len(points)-1)
  segment=min(int(t),len(points)-2);p=points[segment].lerp(points[segment+1],t-segment)
  for sign in (-1,1):
   leaf(p,(-rng.uniform(.08,.6),sign*rng.uniform(.35,1),rng.uniform(-.9,.5)),rng.uniform(.023,.041),rng.uniform(.013,.023),rng.randrange(len(greens)))

# Framed family photograph on lower shelf. Pack the user's reference as a
# texture, using UVs for the visible photo area; no invented faces.
z=4.211;u=.050;d=.17;w=.214;ht=.283
h.box('upper lower-shelf photo backing',U(u,d,z+ht/2),(.012,w,ht),white,.002)
for du in (-w/2+.005,w/2-.005):h.box('portrait vertical frame',U(u+du,d+.009,z+ht/2),(.012,.010,ht),white,.001)
for zz in (.005,ht-.005):h.box('portrait horizontal frame',U(u,d+.009,z+zz),(.012,w,.010),white,.001)
img=bpy.data.images.load('/var/folders/wm/5wgx685d5310ysc57vngm5vw0000gn/T/codex-clipboard-490c478d-0dbc-4548-bce1-fe4dd66573a4.png',check_existing=True);img.pack()
m=bpy.data.materials.new(h.P+'user family photo');m.use_nodes=True;n=m.node_tree.nodes;tex=n.new('ShaderNodeTexImage');tex.image=img;m.node_tree.links.new(tex.outputs['Color'],n.get('Principled BSDF').inputs['Base Color']);n.get('Principled BSDF').inputs['Roughness'].default_value=.65
ob=h.flat('family photo print',[(-.087,0),(.087,0),(.087,.231),(-.087,.231)],U(u,d+.016,z+.025),(0,-1,0),(0,0,1),m)
uv=ob.data.uv_layers.new(name='Reference photograph corners');corners=[(287,620),(435,616),(428,464),(284,468)]
for p in ob.data.polygons:
 for li in p.loop_indices:
  x,y=corners[ob.data.loops[li].vertex_index];uv.data[li].uv=(x/img.size[0],1-y/img.size[1])
# A small dark keepsake beside the frame, visible in the reference.
dark=h.mat('dark little keepsake','46453F',.6)
h.box('small keepsake base',U(-.14,.24,z+.009),(.034,.035,.018),dark,.002)
h.rod('small keepsake upright',U(-.14,.24,z+.018),U(-.14,.24,z+.061),.005,dark)

# Lower narrow recess: square green-grey vase and pale pink/white blossoms.
zs=3.571;fu=-.075;fd=.20
h.box('small niche square stone vase',S(fu,fd,zs+.036),(.070,.066,.072),stone,.004)
h.box('small niche vase soil',S(fu,fd,zs+.073),(.055,.051,.002),soil,.001)
branches=[(-.105,.20,.185),(-.06,.19,.240),(-.005,.19,.315),(-.035,.23,.14),(-.13,.21,.245)]
for k,(u,d,height) in enumerate(branches):
 end=S(u,d,zs+height)
 h.line('flower branch',[S(fu,fd,zs+.07),S(fu+(u-fu)*.6,d,zs+height*.70),end],.0015,wood)
 for j in (0,1):
  p=S(fu+(u-fu)*(.45+j*.25),d,zs+height*(.58+j*.14))
  leaf(p,(-.1,(-1 if j else 1),.5),.040,.023,k%len(greens))
 # Each blossom has five rounded petals around a warm small centre.
 for b in range(2 if k%2 else 3):
  center=end+Vector((rng.uniform(-.007,.007),(b-1)*.018,rng.uniform(-.008,.008)))
  for j in range(5):
   a=j*math.tau/5+.25*b;v=center+Vector((-.001,.012*math.cos(a),.012*math.sin(a)))
   pet=h.sphere('blossom petal',v,(.0035,.010,.013),petalwhite if k%2==0 else petalpink);pet.rotation_euler.x=-a
  h.sphere('blossom centre',center+Vector((-.004,0,0)),(.003,.0045,.0045),pollen)
 if k%2:h.sphere('small unopened rosebud',end+Vector((.004,.01,.018)),(.007,.006,.009),petaldark)

# Tall three-opening frame leaning gently back, with empty inset squares,
# exactly as supplied. Its solid board and raised rails remain editable.
u=.112;d=.19;theta=math.radians(7);V=Vector((math.sin(theta),0,math.cos(theta)));X=Vector((0,-1,0));N=X.cross(V).normalized();O=S(u,d,zs)
def plane(name,poly,depth,material):return h.flat(name,poly,O+N*depth,X,V,material)
h.board('three-opening white frame',[(-.054,0),(.054,0),(.054,.285),(-.054,.285)],O,X,V,.010,white,white)
for k in range(3):
 zz=.019+k*.087
 plane('empty inset square',[(-.037,zz),(.037,zz),(.037,zz+.068),(-.037,zz+.068)],.0056,paper)
 for a,b in [(-.042,-.036),(.036,.042)]:plane('square vertical bevel',[(a,zz-.005),(b,zz-.005),(b,zz+.073),(a,zz+.073)],.0064,white)
 for a,b in [(zz-.005,zz+.001),(zz+.067,zz+.073)]:plane('square horizontal bevel',[(-.042,a),(.042,a),(.042,b),(-.042,b)],.0064,white)

for index,(vs,fs) in leafmesh.items():
 ob=h.mesh('individual oval foliage '+str(index),vs,fs,greens[index])
 for p in ob.data.polygons:p.use_smooth=True
 mod=ob.modifiers.new('Thin leaf surfaces','SOLIDIFY');mod.thickness=.00025

s=h.review('79 | CAMBER - trailing plant and family frame','08 | LIVING + OFFICE - photo layout',(5.30,6.12,4.64),(6.75,6.06,4.50),40,(5.8,6.00,4.75),48,(1000,1200))
t=h.review('80 | CAMBER - flowers and triple frame','08 | LIVING + OFFICE - photo layout',(5.68,4.83,3.93),(6.73,4.76,3.79),48,(5.9,4.95,4.12),30,(1000,1100))
wide=h.review('81 | CAMBER - two decorated niches','08 | LIVING + OFFICE - photo layout',(4.05,5.74,4.41),(6.73,5.42,4.13),42,(5.45,5.58,4.65),100,(1400,1100))
bpy.context.window.scene=wide;bpy.context.view_layer.update()
for name,transform in keep.items():assert tuple(tuple(r) for r in bpy.data.objects[name].matrix_basis)==transform,name
report={'upper_niche_center_y':YU,'plant_support_z':zplant,'portrait_support_z':z,'small_niche_center_y':YS,'vase_and_frame_support_z':zs,'reference_photo_packed':True,'existing_objects_preserved':len(keep),'size_status':'Estimated ornaments fitted to existing measured cabinet geometry'}
(R/'camber_niche_plants_frames_verification.json').write_text(json.dumps(report,indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(MAIN))
for sc,f in ((s,'camber_upper_plant_photo.png'),(t,'camber_small_flowers_frame.png'),(wide,'camber_two_decorated_niches.png')):
 bpy.context.window.scene=sc;sc.render.filepath=str(R/f);bpy.ops.render.render(write_still=True)
bpy.context.window.scene=wide;bpy.ops.wm.save_as_mainfile(filepath=str(MAIN));print('VERIFIED',json.dumps(report),flush=True)
