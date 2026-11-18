"""Photo reconstruction: plywood volcano toy, giraffe helper tower, kitchen bin."""
import bpy, math, random, shutil, sys, json, bmesh
from pathlib import Path
from mathutils import Vector
R=Path(__file__).resolve().parent;sys.path.insert(0,str(R))
import photo_props_utils as h
MAIN=R/'Huis_Oude_Terelststraat_15.blend';backup=R/'Huis_before_veranda_toys_kitchen_bin.blend'
if not backup.exists():shutil.copy2(MAIN,backup)
h.P='Family photo / ';h.COL=bpy.data.collections['01 / Furniture'];F=2.41
for o in list(bpy.data.objects):
 if o.name.startswith(h.P):bpy.data.objects.remove(o,do_unlink=True)
bpy.context.window.scene=bpy.data.scenes['69 | VERANDA - kast en kinderkeuken'];bpy.context.view_layer.update()
keep={o.name:tuple(tuple(r) for r in o.matrix_basis) for o in bpy.data.objects}
oak=h.mat('natural plywood','C6AD83',.68);edge=h.mat('exposed plywood edge','A8895C',.75)
ivory=h.mat('pale painted ply','E0D4B8',.8);black=h.mat('illustration charcoal','202B30',.82)
green=h.mat('island grass','75A85C',.86);darkgreen=h.mat('jungle dark','153D32',.86);leaf=h.mat('jungle leaves','509356',.86)
lime=h.mat('jungle light leaves','8CBD67',.85);sand=h.mat('sandy path','C8BB9A',.85)
water=h.mat('river turquoise','2487B1',.85);blue=h.mat('blue rock','245570',.85);deep=h.mat('deep blue rock','183F50',.86)
lava=h.mat('volcano red lava','A33E4E',.86);foam=h.mat('white printed highlights','E1DDC8',.85)
rust=h.mat('giraffe brown patches','916447',.8);rope=h.mat('toy orange rope','CB5423',.72)

# VOLCANO: layered printed plywood with exposed edges, not a solid mountain.
O=Vector((5.02,8.88,F+.480+.004))
def T(x,y,z):return O+Vector((x,y,z))
def xy(name,poly,z,m):return h.flat('Volcano / '+name,poly,T(0,0,z),(1,0,0),(0,1,0),m)
def xz(name,poly,y,m):return h.flat('Volcano / '+name,poly,T(0,y,0),(1,0,0),(0,0,1),m)
base=[(-.28,-.13),(-.26,-.20),(-.16,-.22),(-.08,-.205),(0,-.235),(.10,-.219),(.19,-.222),(.27,-.17),(.28,-.07),(.25,.04),(.27,.13),(.18,.205),(.05,.22),(-.07,.21),(-.19,.20),(-.27,.13)]
h.board('Volcano / island base',base,T(0,0,0),(1,0,0),(0,1,0),.006,edge,green)
xy('river',[(-.22,-.21),(-.17,-.19),(-.15,-.11),(-.095,-.04),(-.08,.05),(-.12,.15),(-.10,.21),(-.03,.215),(-.025,.13),(-.04,.06),(-.035,-.015),(-.10,-.12),(-.10,-.20),(-.08,-.21)],.0036,water)
xy('fossil sand patch',[(.00,-.17),(.08,-.205),(.19,-.18),(.23,-.10),(.19,-.03),(.07,-.025),(-.005,-.09)],.0037,sand)
for k in range(3):
 h.line('Volcano / river foam',[T(-.165+k*.009,-.19,.004),T(-.15+k*.009,-.13,.004),T(-.10+k*.009,-.07,.004)],.002,foam)
# Two irregular annular plateaus, painted with winding sandy paths.
for z,s in ((.18,.89),(.31,1)):
 poly=[(.08+s*.196*math.cos(a*math.tau/28),.03+s*.16*math.sin(a*math.tau/28)) for a in range(28)]
 h.board('Volcano / layered rock plateau',poly,T(0,0,z),(1,0,0),(0,1,0),.006,edge,blue)
 ring=[(.08+s*.155*math.cos(a*math.tau/42),.03+s*.12*math.sin(a*math.tau/42)) for a in range(43)]
 vs=[];fs=[]
 for k in range(43):
  a=k*math.tau/42
  for off in (-.018,.018):vs.append(T(.08+(s*.155+off)*math.cos(a),.03+(s*.12+off)*math.sin(a),z+.0036))
 for k in range(42):fs.append((k*2,k*2+1,k*2+3,k*2+2))
 h.mesh('Volcano / beige plateau walking path',vs,fs,sand)
 for k in range(5):
  a=1.8+k*.20;h.sphere('Volcano / printed rock',T(.08+s*.125*math.cos(a),.03+s*.090*math.sin(a),z+.005),(.014,.009,.0007),deep)
# Vertical front support has a tabbed, organically contoured silhouette.
support=[(-.045,.006),(-.073,.025),(-.072,.10),(-.081,.20),(-.085,.29),(-.075,.35),(-.052,.365),(-.018,.36),(.001,.32),(.01,.25),(.029,.18),(.009,.10),(-.004,.035),(-.025,.007)]
h.board('Volcano / front cliff support',support,T(.03,-.080,0),(1,0,0),(0,0,1),.006,edge,deep)
xz('support rock stripe',[(-.02,.035),(-.035,.07),(-.026,.14),(-.045,.23),(-.04,.32),(-.025,.344),(-.008,.32),(-.004,.20),(.02,.17),(-.003,.08)],-.0835,blue)
for x in (.18,.04):h.board('Volcano / rear rock leg',[(-.018,0),(.018,0),(.025,.19),(.01,.31),(-.02,.31)],T(x,.11,0),(1,0,0),(0,0,1),.005,edge,deep)
mount=[(-.11,.305),(-.135,.335),(-.12,.37),(-.11,.41),(-.08,.43),(-.073,.49),(-.082,.535),(-.060,.548),(-.020,.526),(.035,.516),(.085,.522),(.115,.545),(.14,.548),(.16,.53),(.158,.478),(.173,.421),(.187,.373),(.178,.31)]
h.board('Volcano / tall mountain backdrop',mount,T(0,.103,0),(1,0,0),(0,0,1),.006,edge,blue)
# Dark vertical rock strata, kept inside the mountain profile.
for k in range(5):
 x=-.093+k*.052
 xz('painted rock stratum',[(x,.315),(x-.003,.39),(x+.010,.45),(x+.005,.48),(x+.021,.48),(x+.025,.42),(x+.015,.355),(x+.023,.315)],.0994,deep)
lavaoutline=[(-.13,.335),(-.116,.37),(-.105,.40),(-.082,.426),(-.074,.488),(-.082,.535),(-.06,.548),(-.02,.526),(.035,.516),(.085,.522),(.115,.545),(.14,.548),(.16,.53),(.157,.48),(.174,.416),(.184,.375),(.174,.360),(.164,.382),(.148,.444),(.132,.477),(.10,.49),(.056,.478),(.02,.486),(-.025,.473),(-.04,.445),(-.041,.394),(-.055,.382),(-.066,.404),(-.06,.452),(-.086,.404),(-.101,.377),(-.11,.34)]
xz('red lava cap and drips',lavaoutline,.099,lava)
for path in [[(-.07,.524),(-.059,.536),(-.025,.518)],[(.11,.531),(.135,.538),(.146,.515),(.148,.476)],[(.162,.427),(.175,.382)], [(-.061,.452),(-.056,.42),(-.06,.40)]]:
 h.line('Volcano / cream lava highlight',[T(x,.0985,z) for x,z in path],.004,foam)
# Flat freestanding jungle panel on the left, leafy printed decoration.
jungle=[(-.27,.015),(-.26,.07),(-.273,.11),(-.26,.16),(-.244,.18),(-.23,.225),(-.207,.235),(-.19,.258),(-.16,.256),(-.148,.228),(-.116,.212),(-.103,.18),(-.104,.12),(-.09,.08),(-.108,.01),(-.153,.014),(-.16,.05),(-.18,.07),(-.202,.03),(-.208,.01)]
h.board('Volcano / jungle panel',jungle,T(0,.035,0),(1,0,0),(0,0,1),.006,edge,darkgreen)
rng=random.Random(49)
for k in range(55):
 x=rng.uniform(-.25,-.125);z=rng.uniform(.045,.218);a=rng.uniform(-1,1);L=rng.uniform(.013,.027)
 poly=[(x,z),(x-.008,z+L*.45),(x+a*.008,z+L),(x+.006,z+L*.35)]
 xz('jungle leaf',poly,.0312,leaf if k%3 else lime)
# Simple printed fossil on the base: spine and six ribs.
h.line('Volcano / fossil spine',[T(.095,-.157,.0048),T(.12,-.12,.0048),T(.126,-.071,.0048)],.0028,foam)
for k in range(4):
 y=-.145+k*.020
 h.line('Volcano / fossil rib',[T(.08,y-.01,.005),T(.11,y,.005),T(.15,y-.002,.005)],.0022,foam)
for x in (-.145,-.11):h.rod('Volcano / rope bridge post',T(x,-.055,.006),T(x,-.055,.044),.002,rope)
for i in range(6):h.box('Volcano / bridge plank',T(-.128,-.035+i*.009,.022),(.044,.007,.002),rust,.0003)

# GIRAFFE helper tower near the veranda play table, not in the kitchen doorway.
G=Vector((4.16,8.75,F));scale=.84
def GP(d,y,z):return G+Vector((d*scale,y,z*scale))
outline=[(-.22,0),(.17,0),(.18,.10),(.12,.23),(.05,.37),(-.01,.54),(.025,.66),(.075,.65),(.15,.61),(.22,.58),(.25,.595),(.255,.63),(.22,.67),(.14,.76),(.11,.82),(.08,.85),(.067,.90),(.040,.94),(.025,.96),(.02,1.02),(.035,1.10),(.02,1.125),(-.007,1.127),(-.024,1.105),(-.03,.99),(-.065,1.00),(-.065,1.085),(-.083,1.115),(-.11,1.115),(-.126,1.09),(-.108,.99),(-.15,1.04),(-.20,1.06),(-.232,1.047),(-.242,1.02),(-.208,.977),(-.17,.955),(-.16,.91),(-.17,.84),(-.185,.78),(-.20,.62),(-.23,.30)]
hole=[(-.10,.18),(.02,.18),(.018,.29),(-.055,.45),(-.098,.56),(-.126,.51),(-.125,.32)]
for side in (-1,1):
 y=side*.198
 ob=h.board('Giraffe / sculpted plywood side',outline,GP(0,y,0),(scale,0,0),(0,0,scale),.016,edge,oak)
 cutter=h.board('temporary giraffe opening',hole,GP(0,y,0),(scale,0,0),(0,0,scale),.10,edge,oak)
 # Robust closed-volume booleans for the opening beneath the platform.
 for meshob in (ob,cutter):
  bm=bmesh.new();bm.from_mesh(meshob.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(meshob.data);bm.free()
 mod=ob.modifiers.new('Open leg space','BOOLEAN');mod.operation='DIFFERENCE';mod.object=cutter
 bpy.context.view_layer.objects.active=ob;bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cutter,do_unlink=True)
 bevel=ob.modifiers.new('Rounded plywood silhouette','BEVEL');bevel.width=.003;bevel.segments=3
 # Exterior faces only: brown patches, closed eye, muzzle and nostril.
 yy=y+side*.0085
 for k in range(16):
  z=.05+k*.043;x=-.176+.012*math.sin(k*1.7)
  pts=[(x-.025,z-.02),(x+.018,z-.027),(x+.037,z+.006),(x+.008,z+.029),(x-.026,z+.018)]
  h.flat('Giraffe / neck patch',pts,GP(0,yy,0),(scale,0,0),(0,0,scale),rust)
 h.flat('Giraffe / muzzle patch',[(.14,.61),(.22,.58),(.25,.595),(.255,.63),(.22,.67),(.17,.687)],GP(0,yy,0),(scale,0,0),(0,0,scale),rust)
 h.line('Giraffe / sleepy eye',[GP(-.027,yy,.823),GP(.006,yy,.800),GP(.034,yy,.802)],.0018,black)
 h.sphere('Giraffe / nostril',GP(.218,yy,.632),(.004,.0008,.003),black)
for z,d,length in ((.35,-.027,.31),(.15,-.08,.22)):
 h.box('Giraffe / standing platform' if z==.35 else 'Giraffe / lower step',GP(d,0,z),(length,.38,.018),ivory,.004)
h.rod('Giraffe / front safety rail',GP(.223,-.208,.623),GP(.223,.208,.623),.013,oak)
h.rod('Giraffe / rear hand rail',GP(-.172,-.208,.79),GP(-.172,.208,.79),.012,oak)
for y in (-.198,.198):h.box('Giraffe / stabilizer foot',GP(-.018,y,.016),(.43,.041,.026),oak,.012)

# BIN: just outside the kitchen, in front of the short north entry return.
# The photographed table is visible through the opening to its left.
B=(3.075,8.427,F);charcoal=h.mat('bin charcoal plastic','303338',.38);rim=h.mat('bin rim','4A4E50',.48);bag=h.mat('bin liner folded edge','AFBFC3',.82)
h.lathe('Kitchen bin / tapered body',B,[(0,0),(.147,0),(.16,.015),(.18,.50),(.185,.525),(.174,.53),(.145,.03),(0,.03)],charcoal)
h.lathe('Kitchen bin / rim retaining band',B,[(.18,.502),(.188,.505),(.191,.525),(.188,.533),(.18,.535)],rim)
# Pale liner visible irregularly just under the lid, as in the photograph.
vs=[];fs=[]
for j in range(2):
 for i in range(96):
  a=math.tau*i/96;r=.188;z=.515+j*.012+.003*math.sin(i*.8)
  vs.append((B[0]+r*math.cos(a),B[1]+r*math.sin(a),F+z))
for i in range(96):fs.append((i,(i+1)%96,(i+1)%96+96,i+96))
h.mesh('Kitchen bin / visible bag cuff',vs,fs,bag)
h.lathe('Kitchen bin / domed lid surround',B,[(.187,.533),(.193,.555),(.188,.591),(.174,.630),(.151,.657),(.135,.665),(.13,.655),(.155,.628)],charcoal)
# Closed inset swing flap, slightly sloped down toward the room.
N=72;vs=[(B[0],B[1],F+.656)]
for i in range(N):
 a=math.tau*i/N;x=.137*math.cos(a);y=.14*math.sin(a);vs.append((B[0]+x,B[1]+y,F+.654+.085*y))
h.mesh('Kitchen bin / closed swing flap',vs,[(0,i+1,(i+1)%N+1) for i in range(N)],charcoal)
h.line('Kitchen bin / flap seam',vs[1:]+[vs[1]],.0022,black,False)
h.rod('Kitchen bin / rear hinge',(B[0]-.10,B[1]+.114,F+.665),(B[0]+.10,B[1]+.114,F+.665),.005,charcoal)

play=h.review('77 | VERANDA - volcano playset and giraffe','07 | LIVING + VERANDA - open room',(3.70,7.32,4.15),(4.80,8.88,3.10),36,(4.25,8.4,4.40),150,(1300,1000))
binview=h.review('78 | KITCHEN ENTRY - charcoal bin','05 | KITCHEN - shaped table and bench',(4.53,7.72,3.86),(2.93,8.59,2.96),31,(3.9,7.9,4.2),110,(1000,1100))
bpy.context.window.scene=play;bpy.context.view_layer.update()
for name,m in keep.items():assert tuple(tuple(r) for r in bpy.data.objects[name].matrix_basis)==m,name
assert B[1]+.193<8.6402
assert 4.47<5.02-.28 and 5.02+.28<5.65
assert 8.61<8.88-.235 and 8.88+.22<9.14
notes={'bin_center':B,'bin_wall_gap_m':8.6402-(B[1]+.193),'bin_location_reason':'Living-side north jamb of kitchen entry, table visible through opening to its left in photo.',
       'volcano_base_center':list(O),'volcano_footprint_m':[.56,.455],'tower_center':list(G),'dimensions':'Estimated from user photographs','preserved_objects':len(keep)}
(R/'veranda_toys_kitchen_bin_verification.json').write_text(json.dumps(notes,indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(MAIN))
for s,f in ((play,'veranda_volcano_giraffe.png'),(binview,'kitchen_entry_bin.png')):
 bpy.context.window.scene=s;s.render.filepath=str(R/f);bpy.ops.render.render(write_still=True)
bpy.context.window.scene=play;bpy.ops.wm.save_as_mainfile(filepath=str(MAIN));print('VERIFIED',json.dumps(notes),flush=True)
