"""Cabinet decoration from the user's latest real-life cabinet photograph."""
import bpy, math, sys, shutil, json
from pathlib import Path
from mathutils import Vector, Matrix
R=Path(__file__).resolve().parent;sys.path.insert(0,str(R))
import photo_props_utils as h
MAIN=R/'Huis_Oude_Terelststraat_15.blend';backup=R/'Huis_before_camber_personal_decor.blend'
if not backup.exists():shutil.copy2(MAIN,backup)
h.P='Cabinet photo decor / ';h.COL=bpy.data.collections['01 / Camber']
for o in list(bpy.data.objects):
 if o.name.startswith(h.P):bpy.data.objects.remove(o,do_unlink=True)
bpy.context.window.scene=bpy.data.scenes['74 | CAMBER - Hedwig and plant'];bpy.context.view_layer.update()
def S(u,d,z):return Vector((6.932-d,3.4511-u,z))
def box(name,u,d,z,w,dep,height,m,bev=.001):return h.box(name,S(u,d,z),(dep,w,height),m,bev)
def face(name,poly,u,d,z,m):return h.flat(name,poly,S(u,d,z),(0,-1,0),(0,0,1),m)
def txt(name,body,u,d,z,size,m):return h.text(name,body,S(u,d,z),size,m,(math.pi/2,0,-math.pi/2))
white=h.mat('warm porcelain','E9E5DD',.35);black=h.mat('soft black','242426',.58);oak=h.mat('frame natural oak','AC8259',.65)
gold=h.mat('antique brass lettering','B69C68',.5);red=h.mat('red petals','AB3846',.55);pink=h.mat('pink petals','CA787F',.58)
green=h.mat('flower leaves','456E4D',.7);yellow=h.mat('yellow flowers','D0A53F',.55);blue=h.mat('tiny blue toy','376B86',.5)
taupe=h.mat('calendar grey green','8C958C',.7);teal=h.mat('BRICK green box','244B45',.7);brown=h.mat('box corners','704E43',.72)
purple=h.mat('photo frame violet','695879',.65);cream=h.mat('miniature planter yellow','DCBC57',.65)

# Hedwig sits towards the right, as in the real cabinet photograph. Preserve
# the user-added plant above; no other personal decorations are displaced.
for o in bpy.data.objects:
 if o.name.startswith('September29 / Hedwig /') and 'envelope' not in o.name:
  if 'cabinet_photo_y_shift' not in o:o.location.y-=.090;o['cabinet_photo_y_shift']=.090

# Tiny blue-and-white brick-built ornament beside the plant on second shelf.
z=4.297
box('tiny LEGO ornament blue body',.185,.10,z+.012,.024,.018,.024,blue)
box('tiny LEGO ornament roof',.185,.10,z+.027,.028,.022,.006,white)
for u in (.177,.187):box('tiny LEGO white front tiles',u,.111,z+.011,.006,.002,.011,white,.0002)
box('tiny LEGO top stud',.187,.10,z+.032,.008,.008,.003,white,.0004)

# Small hand-painted pot, with a red dotted rim and colourful leaf motifs.
z=4.041;u=-.155;d=.255
h.lathe('colourful hand-painted pot',S(u,d,z),[(0,0),(.023,0),(.033,.066),(.036,.068),(.036,.077),(.029,.077),(.026,.065),(.016,.012),(0,.012)],cream)
h.lathe('pot red rim',S(u,d,z),[(.033,.066),(.036,.068),(.036,.077),(.030,.077)],red)
for i in range(11):
 a=i*math.tau/11;h.sphere('pot white rim dot',S(u,d,z)+Vector((.0362*math.cos(a),.0362*math.sin(a),.072)),(.0035,.0035,.004),white)
for j in range(3):
 for i in range(10):
  a=i*math.tau/10+j*.3;r=.024+j*.003
  ob=h.sphere('pot painted leaf',S(u,d,z)+Vector((r*math.cos(a),r*math.sin(a),.016+j*.017)),(.004,.004,.010),green if i%2 else blue);ob.rotation_euler.y=.45

# Upright green BRICK box with contrasting corner details and framed title.
z=4.041;u=.130;d=.075
box('BRICK presentation box',u,d,z+.100,.110,.048,.200,teal,.002)
for du in (-.052,.052):box('BRICK vertical frame',u+du,d+.025,z+.100,.004,.001,.187,brown,.0002)
for zz in (.009,.191):box('BRICK horizontal frame',u,d+.025,z+zz,.106,.001,.004,brown,.0002)
box('BRICK title backing',u,d+.026,z+.112,.092,.001,.052,brown,.0002)
for zz in (.088,.137):box('BRICK gold rule',u,d+.027,z+zz,.090,.001,.0012,gold,.0001)
txt('BRICK title','BRICK',u,d+.028,z+.112,.026,white)
txt('BRICK small subtitle','COLLECTION',u,d+.028,z+.082,.006,gold)
for du in (-.045,.045):
 for zz in (.02,.18):h.sphere('BRICK corner stud',S(u+du,d+.027,z+zz),(.0008,.002,.002),gold)

# Spacious middle-lower compartment: round quote clock and two face vases.
z=3.625;cu=-.10;cd=.135;cz=z+.166
h.rod('clock black rim',S(cu,cd-.008,cz),S(cu,cd+.008,cz),.115,black)
h.rod('clock ivory face',S(cu,cd+.008,cz),S(cu,cd+.010,cz),.108,white)
for body,zz,size in [('WE WERE',cz+.027,.017),('ON A',cz+.008,.016),('B R E A K',cz-.014,.015)]:txt('clock quote '+body,body,cu,cd+.011,zz,size,black)
for end in [(cu-.065,cz+.048),(cu+.029,cz+.078)]:h.line('clock hand',[S(cu,cd+.013,cz),S(end[0],cd+.013,end[1])],.001,black,False)
h.sphere('clock hand pivot',S(cu,cd+.014,cz),(.001,.002,.002),black)
for i,(u,emotion) in enumerate(((.065,'smile'),(.145,'sad'))):
 d=.160
 # Two stubby feet and an arched gap under the cylindrical body.
 for uu in (u-.018,u+.018):h.lathe('face vase foot',S(uu,d,z),[(0,0),(.009,0),(.010,.027),(0,.029)],white,32)
 h.lathe('face vase tall body',S(u,d,z),[(0,.024),(.026,.024),(.030,.034),(.029,.160),(.026,.165),(.023,.165),(.023,.154),(.020,.035),(0,.035)],white)
 for du in (-.010,.010):h.sphere('vase eye',S(u+du,d+.0285,z+.128),(.0013,.0022,.0023),black)
 mouth=[S(u-.011,d+.0295,z+.111),S(u,d+.030,z+(.105 if emotion=='smile' else .117)),S(u+.011,d+.0295,z+.111)]
 h.line('vase '+emotion,mouth,.0012,black)
 # Stylised toy flowers: stems, paired leaves, concentric petals.
 for k in range(3):
  fu=u+(k-1)*.024;fd=d+(k%2)*.015;fz=z+.204+(k%2)*.038
  h.rod('flower green stem',S(u,d,z+.154),S(fu,fd,fz),.0018,green)
  for t in (-1,1):h.sphere('flower leaf',S((fu+u)/2+t*.009,fd,z+.183),(.003,.012,.005),green)
  m=red if k==1 else pink if i==0 else yellow
  for ring in range(2):
   for j in range(6):
    a=j*math.tau/6+ring*.4;rr=.009+ring*.004
    h.sphere('flower sculpted petal',S(fu+rr*math.cos(a),fd+.001*ring,fz+rr*math.sin(a)),(.005,.006,.009),m)
  h.sphere('flower centre',S(fu,fd+.006,fz),(.004,.004,.005),m)

# Block calendar exactly as shown: 21 September, in front of the clock.
cu=-.125;d=.294
box('calendar plinth',cu,d,z+.009,.140,.060,.018,taupe,.002)
for i,ch in enumerate('21'):
 u=cu+(i-.5)*.061
 box('calendar number block '+ch,u,d,z+.055,.058,.054,.072,taupe,.002)
 txt('calendar number '+ch,ch,u,d+.028,z+.055,.059,white)
txt('calendar month','September',cu,d+.031,z+.008,.012,white)

# Use the user's own photo as a packed texture only for the tiny photographs.
# UV corner mapping extracts the photographed image without creating an
# invented family portrait or an external image file.
imagepath='/var/folders/wm/5wgx685d5310ysc57vngm5vw0000gn/T/codex-clipboard-42a4e83d-4ee1-49de-a318-075fd494cab6.png'
img=bpy.data.images.load(imagepath,check_existing=True);img.pack()
photo=bpy.data.materials.get(h.P+'user photograph print') or bpy.data.materials.new(h.P+'user photograph print');photo.use_nodes=True
n=photo.node_tree.nodes;tex=n.new('ShaderNodeTexImage');tex.image=img;photo.node_tree.links.new(tex.outputs['Color'],n.get('Principled BSDF').inputs['Base Color']);n.get('Principled BSDF').inputs['Roughness'].default_value=.6
def photoquad(name,u,d,z,w,height,corners):
 ob=face(name,[(-w/2,0),(w/2,0),(w/2,height),(-w/2,height)],u,d,z,photo)
 uv=ob.data.uv_layers.new(name='User photo crop');iw,ih=img.size
 for poly in ob.data.polygons:
  for li in poly.loop_indices:
   index=ob.data.loops[li].vertex_index;x,y=corners[index];uv.data[li].uv=(x/iw,1-y/ih)
 return ob
# Mini-figure family display card in front of the face vases.
box('small family display frame',.060,.308,z+.042,.102,.008,.073,oak,.001)
photoquad('family minifig photograph',.060,.313,z+.010,.096,.063,[(355,822),(419,822),(415,784),(355,784)])
# Bottom framed photograph, placed behind the single HANNA train.
zb=3.379
box('bottom portrait frame',-.141,.12,zb+.089,.095,.012,.165,purple,.003)
photoquad('bottom family photograph',-.141,.127,zb+.017,.079,.137,[(248,938),(303,926),(287,870),(239,877)])

# Latest photo explicitly places ONE HANNA train on the bottom shelf.
for o in list(bpy.data.objects):
 if o.name.startswith('September29 / Train HANNA /'):bpy.data.objects.remove(o,do_unlink=True)
source=R/'Huis_before_removing_trains_raising_plant.blend'
with bpy.data.libraries.load(str(source),link=False) as (a,b):b.objects=[n for n in a.objects if n.startswith('September29 / Train HANNA /')]
for o in b.objects:
 h.COL.objects.link(o);o.matrix_world=Matrix.Translation((.025,0,-.918))@o.matrix_basis
 o['restored_reason']='Latest real cabinet photo, one HANNA train on bottom shelf; LOTTE and LIENE remain removed.'

scene=bpy.data.scenes['74 | CAMBER - Hedwig and plant'];scene.name='74 | CAMBER - personal photo decorations'
bpy.context.window.scene=scene;bpy.context.view_layer.update()
scene.render.filepath=str(R/'camber_personal_decor.png')
assert not any(o.name.startswith(('September29 / Train LOTTE /','September29 / Train LIENE /')) for o in bpy.data.objects)
report={'top':'Hedwig moved right','second':'Existing plant retained with tiny blue LEGO ornament','third':'Painted pot and BRICK box','fourth':'Quote clock, 21 September calendar, two face vases and toy flowers, family display','bottom':'Family photo and one HANNA train','family_images':'Packed user photograph, UV-mapped crops','photo_source':imagepath}
(R/'camber_personal_decor_verification.json').write_text(json.dumps(report,indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(MAIN));bpy.ops.render.render(write_still=True);print('VERIFIED',json.dumps(report),flush=True)
