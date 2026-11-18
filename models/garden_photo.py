"""Editable side/rear garden reconstructed from user photos; no vehicles.
SIDE is measured while looking at the front door from the street.
Garden-only distances are photographic estimates, kept separate from house survey.
"""
import bpy, math, random, json, sys, shutil
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parent
P='Garden photo / ';W=7.3808;SIDE=1
FENCE_START=0.0
AERIAL_STREET_SPLAY=.24
FENCE_EDGE_U=14.20
HEDGE_EDGE_U=13.60
FRONT_CX=8.75;FRONT_CY=.30;FRONT_RADIUS=5.5;FRONT_EDGE=-5.20
def front_y(u):
 return FRONT_EDGE if u<=FRONT_CX else FRONT_CY-math.sqrt(max(0,FRONT_RADIUS**2-(u-FRONT_CX)**2))
def prism(name,outline,z0,z1,m,col):
 n=len(outline);vs=[(x,y,z) for z in (z0,z1) for x,y in outline]
 return mesh(name,vs,[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)],m,col)
def arc_strip(name,r0,r1,z0,z1,m,col):
 vs=[]
 for i in range(65):
  a=-math.pi/2+i*math.pi/128
  for z in (z0,z1):
   for r in (r0,r1):vs.append((FRONT_CX+r*math.cos(a),FRONT_CY+r*math.sin(a),z))
 fs=[(0,1,3,2),(256,258,259,257)]
 for i in range(64):
  k=i*4;fs.extend([(k,k+4,k+5,k+1),(k+2,k+3,k+7,k+6),(k,k+2,k+6,k+4),(k+1,k+5,k+7,k+3)])
 return mesh(name,vs,fs,m,col)
ROOTS=['00 | GROUND - 2021','01 | FIRST - 2021 + Camber 2025','02 | SECOND - archive reconstruction','03 | ROOFS - removable','04 | SITE and rear stair - indicative extent']

def rgb(h):return tuple((int(h[i:i+2],16)/255)**2.2 for i in (0,2,4))+(1,)
def material(name,h,rough=.6,metal=0):
 m=bpy.data.materials.get(P+name) or bpy.data.materials.new(P+name);m.use_nodes=True;m.diffuse_color=rgb(h);n=m.node_tree.nodes;l=m.node_tree.links;n.clear();p=n.new('ShaderNodeBsdfPrincipled');out=n.new('ShaderNodeOutputMaterial');l.new(p.outputs[0],out.inputs[0]);p.inputs['Base Color'].default_value=rgb(h);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal;return m
def mesh(name,vs,fs,m,col):
 me=bpy.data.meshes.new(P+name);me.from_pydata(vs,[],fs);me.update();o=bpy.data.objects.new(P+name,me);col.objects.link(o)
 if m:me.materials.append(m)
 return o
def box(name,x0,x1,y0,y1,z0,z1,m,col,bevel=0):
 vs=[(x,y,z) for z in (z0,z1) for y in (y0,y1) for x in (x0,x1)];o=mesh(name,vs,[(0,2,3,1),(4,5,7,6),(0,1,5,4),(2,6,7,3),(0,4,6,2),(1,3,7,5)],m,col)
 if bevel:b=o.modifiers.new('Rounded edges','BEVEL');b.width=bevel;b.segments=2
 return o
def rods(name,paths,r,m,col,res=2):
 cu=bpy.data.curves.new(P+name,'CURVE');cu.dimensions='3D';cu.bevel_depth=r;cu.bevel_resolution=res;cu.use_fill_caps=True
 for points in paths:
  s=cu.splines.new('POLY');s.points.add(len(points)-1)
  for p,v in zip(s.points,points):p.co=(*v,1)
 cu.materials.append(m);o=bpy.data.objects.new(P+name,cu);col.objects.link(o);return o
def rod(name,a,b,r,m,col):return rods(name,[[a,b]],r,m,col)
def ring(name,center,radius,tube,m,col):return rods(name,[[(center[0]+radius*math.cos(i*math.tau/120),center[1]+radius*math.sin(i*math.tau/120),center[2]) for i in range(121)]],tube,m,col,3)
def noise_finish(m,a,b,scale,depth=.001):
 n=m.node_tree.nodes;l=m.node_tree.links;p=n.get('Principled BSDF');g=n.new('ShaderNodeNewGeometry');t=n.new('ShaderNodeTexNoise');t.inputs['Scale'].default_value=scale;t.inputs['Detail'].default_value=4;l.new(g.outputs['Position'],t.inputs[0]);r=n.new('ShaderNodeValToRGB');r.color_ramp.elements[0].color=rgb(a);r.color_ramp.elements[1].color=rgb(b);l.new(t.outputs['Fac'],r.inputs[0]);l.new(r.outputs[0],p.inputs['Base Color']);bm=n.new('ShaderNodeBump');bm.inputs['Distance'].default_value=depth;bm.inputs['Strength'].default_value=.5;l.new(t.outputs['Fac'],bm.inputs['Height']);l.new(bm.outputs[0],p.inputs['Normal'])
def net_material(name,diagonal=True):
 m=material(name,'252B25',.7);n=m.node_tree.nodes;l=m.node_tree.links;uv=n.new('ShaderNodeTexCoord');sep=n.new('ShaderNodeSeparateXYZ');l.new(uv.outputs['UV'],sep.inputs[0]);signals=[]
 for sign in (1,-1):
  if diagonal:
   mult=n.new('ShaderNodeMath');mult.operation='MULTIPLY';l.new(sep.outputs['Y'],mult.inputs[0]);mult.inputs[1].default_value=sign
   add=n.new('ShaderNodeMath');add.operation='ADD';l.new(sep.outputs['X'],add.inputs[0]);l.new(mult.outputs[0],add.inputs[1]);sig=add.outputs[0]
  else:sig=sep.outputs['X' if sign==1 else 'Y']
  mult=n.new('ShaderNodeMath');mult.operation='MULTIPLY';mult.inputs[1].default_value=1/(.075 if diagonal else .018);l.new(sig,mult.inputs[0]);frac=n.new('ShaderNodeMath');frac.operation='FRACT';l.new(mult.outputs[0],frac.inputs[0]);test=n.new('ShaderNodeMath');test.operation='LESS_THAN';test.inputs[1].default_value=.04 if diagonal else .075;l.new(frac.outputs[0],test.inputs[0]);signals.append(test.outputs[0])
 ma=n.new('ShaderNodeMath');ma.operation='MAXIMUM';l.new(signals[0],ma.inputs[0]);l.new(signals[1],ma.inputs[1]);trans=n.new('ShaderNodeBsdfTransparent');mix=n.new('ShaderNodeMixShader');l.new(ma.outputs[0],mix.inputs[0]);l.new(trans.outputs[0],mix.inputs[1]);l.new(n.get('Principled BSDF').outputs[0],mix.inputs[2]);l.new(mix.outputs[0],n.get('Material Output').inputs[0]);return m

def update_garden(side=SIDE):
 random.seed(150926);bpy.context.window.scene=bpy.data.scenes['01 | HOUSE - exterior']
 for o in list(bpy.data.objects):
  if o.name.startswith(P) or o.name in ('Ground context','Garden context','Street photo / clean paved pavement','Street photo / street surface context','Street photo / pavement curb'):bpy.data.objects.remove(o,do_unlink=True)
 parent=bpy.data.collections[ROOTS[4]];cols=[]
 for name in ('terrain and paving','fences and gates','planting','play equipment','side cladding','street context'):
  c=bpy.data.collections.get(P+name) or bpy.data.collections.new(P+name)
  if c.name not in parent.children:parent.children.link(c)
  cols.append(c)
 terrain,fences,plants,play,cladding,context=cols
 soil=material('earth','594B35',.95);grass=material('mixed green lawn','42612A',.9);noise_finish(grass,'344B1F','7B8044',.62,.008)
 concrete=material('weathered concrete gravel boards','A0A18E',.85);noise_finish(concrete,'888B7E','B2B3A2',55,.002)
 black=material('black powder coated fence','1D2423',.46,.5);steel=material('galvanised steel','A4AAA6',.35,.75);bark=material('tree bark','615444',.95);noise_finish(bark,'40372C','7D7058',11,.007)
 wood=material('weathered garden timber','8A795F',.85);noise_finish(wood,'665B4B','A29279',28,.002)
 roofmat=material('playhouse dark shingles','303A40',.85);pink=material('trampoline berry padding','AF3C70',.48);red=material('red swing plastic','BA2832',.35);rose=material('pink swing plastic','CD5C9A',.4);rope=material('swing rope','A8A38D',.95);sand=material('clean pale sand','C8BE94',.97);noise_finish(sand,'B2A579','D9CEAC',80,.003)
 cladm=material('black vertical wall sheets','161C20',.5,.25);ribm=material('cladding raised seams','697071',.5,.55)
 net=net_material('diamond chain link mesh');tnet=net_material('fine trampoline net',False)
 paving=material('small grey street pavers','91928A',.91);n=paving.node_tree.nodes;l=paving.node_tree.links;t=n.new('ShaderNodeTexBrick');t.inputs['Scale'].default_value=1;t.inputs['Brick Width'].default_value=.20;t.inputs['Row Height'].default_value=.10;t.inputs['Mortar Size'].default_value=.002;t.inputs['Color1'].default_value=rgb('898C86');t.inputs['Color2'].default_value=rgb('A0A29B');t.inputs['Mortar'].default_value=rgb('666E67');g=n.new('ShaderNodeNewGeometry');l.new(g.outputs['Position'],t.inputs[0]);l.new(t.outputs['Color'],n.get('Principled BSDF').inputs['Base Color'])
 asphalt=material('empty side street','5A6061',.95);noise_finish(asphalt,'484F51','676D6E',160,.001)
 # Lawn footprint: broad side garden plus narrower rear garden beyond the existing terrace drain.
 box('subsoil context',-W-1,23.5,FRONT_EDGE-.02,30,-.26,-.19,soil,terrain)
 def curved_lawn(name,u0,u1,depth,z,col):
  front=[(u0+(u1-u0)*i/100,front_y(u0+(u1-u0)*i/100)) for i in range(101)]
  return prism(name,front+[(u1,depth),(u0,depth)],-.19,z,grass,col)
 curved_lawn('side lawn base',.03,14.25,26,-.018,terrain)
 box('rear lawn meets terrace drain',-W+.08,-.01,16.40,24.85,-.19,-.018,grass,terrain)
 box('grass beyond rear boundary',11.85,14.25,26,29,-.19,-.018,grass,context)
 box('side footpath',14.25,15.7,FRONT_CY,29,-.16,-.065,paving,context)
 box('street planting verge',15.7,17.15,FRONT_CY,29,-.20,-.075,soil,context)
 box('side street without cars',17.15,23.5,FRONT_CY,30,-.23,-.14,asphalt,context)
 box('curved street corner underlay',FRONT_CX,23.5,FRONT_EDGE-2.9,FRONT_CY,-.23,-.14,asphalt,context)
 arc_strip('curved front footpath',5.5,6.95,-.16,-.065,paving,context)
 arc_strip('curved front planting verge',6.95,8.4,-.20,-.075,soil,context)
 for x,r in ((14.20,5.45),(15.70,6.95),(17.10,8.35)):
  box('side path curb',x,x+.06,FRONT_CY,29,-.18,-.055,concrete,context,.008)
  arc_strip('curved front curb',r,r+.06,-.18,-.055,concrete,context)
 # Driveway from the garage/entrance to the public footpath, restored from the photos.
 drive=material('driveway grey concrete pavers','777A76',.90)
 nd=drive.node_tree.nodes;lk=drive.node_tree.links;pr=nd.get('Principled BSDF');ge=nd.new('ShaderNodeNewGeometry');br=nd.new('ShaderNodeTexBrick')
 br.offset=.5;br.inputs['Scale'].default_value=1;br.inputs['Brick Width'].default_value=.20;br.inputs['Row Height'].default_value=.10;br.inputs['Mortar Size'].default_value=.0015
 br.inputs['Color1'].default_value=rgb('727775');br.inputs['Color2'].default_value=rgb('92958D');br.inputs['Mortar'].default_value=rgb('5B605B');lk.new(ge.outputs['Position'],br.inputs[0]);lk.new(br.outputs['Color'],pr.inputs['Base Color'])
 bump=nd.new('ShaderNodeBump');bump.inputs['Distance'].default_value=.0015;bump.inputs['Strength'].default_value=.35;lk.new(br.outputs['Fac'],bump.inputs['Height']);lk.new(bump.outputs[0],pr.inputs['Normal'])
 # u=-W..0 is exactly the front facade width, with garden immediately to its right.
 box('full width driveway before garage and front door',-W,0,FRONT_EDGE,-.031,-.20,-.105,drive,terrain)
 box('driveway lawn edging',0,.055,FRONT_EDGE,-.02,-.18,-.07,concrete,terrain,.004)
 box('front public footpath',-W-20,FRONT_CX,FRONT_EDGE-1.45,FRONT_EDGE,-.20,-.105,paving,context)
 box('front street planting strip',.06,FRONT_CX,FRONT_EDGE-2.9,FRONT_EDGE-1.45,-.21,-.105,soil,context)
 box('driveway pavement crossing',-W,0,FRONT_EDGE-2.9,FRONT_EDGE-1.45,-.21,-.125,drive,terrain)
 box('neighbour frontage pavement context',-W-20,-W,FRONT_EDGE,-.031,-.22,-.105,paving,context)
 box('neighbour street edge pavement',-W-20,-W,FRONT_EDGE-2.9,FRONT_EDGE-1.45,-.22,-.105,paving,context)
 box('front street without cars',-W-30,40, -50,FRONT_EDGE-2.9,-.26,-.175,asphalt,context)
 for a,b,z in ((-W-20,-W,-.105),(-W,0,-.135),(0,FRONT_CX,-.055)):
  box('street curb with lowered driveway access',a,b,FRONT_EDGE-2.96,FRONT_EDGE-2.90,-.23,z,concrete,context,.006)
 box('front lawn footpath edging',0,FRONT_CX,FRONT_EDGE-.045,FRONT_EDGE+.015,-.18,-.055,concrete,context,.003)
 # Dark vertically seamed side wall, including the lower rear extension.
 box('tall black side elevation',.006,.045,.03,9.0,0,8.33,cladm,cladding)
 extension_h=5.18 if side==1 else 5.65
 box('lower black extension side',.006,.045,9.0,10.96,0,extension_h,cladm,cladding)
 for i in range(27):
  y=.075+i*.415
  if y>10.96:continue
  h=8.33 if y<9 else extension_h;box('narrow vertical cladding seam',.045,.067,y,y+.018,0,h,ribm,cladding,.002)
 for y,h in ((.025,8.33),(10.96,extension_h)):box('cladding corner flashing',.004,.08,y,y+.07,0,h,steel,cladding,.002)
 # Mesh fence panels use metric UVs and true transparent diamond openings.
 def panel(name,a,b,height=1.65,base=.20,privacy=False):
  a=Vector((a[0],a[1],base));b=Vector((b[0],b[1],base));length=(b-a).length
  o=mesh(name,[a,b,b+Vector((0,0,height-base)),a+Vector((0,0,height-base))],[(0,1,2,3)],black if privacy else net,fences)
  uv=o.data.uv_layers.new(name='metric mesh spacing');uvs=[(0,0),(length,0),(length,height-base),(0,height-base)]
  for loop in o.data.loops:uv.data[loop.index].uv=uvs[loop.vertex_index]
  rod('fence top rail',a+Vector((0,0,height-base)),b+Vector((0,0,height-base)),.018,black,fences)
  d=(b-a).normalized();perp=Vector((-d.y,d.x,0))*.035;vs=[tuple(p+q) for p in (a+Vector((0,0,-base-.03)),b+Vector((0,0,-base-.03)),b,a) for q in (-perp,perp)]
  mesh('concrete fence gravel board',vs,[(0,1,3,2),(6,4,5,7),(0,2,4,6),(1,7,5,3),(0,6,7,1),(2,3,5,4)],concrete,fences)
  count=max(1,math.ceil(length/2.0))
  for j in range(count+1):
   pt=a+(b-a)*j/count;rod('fence upright',(pt.x,pt.y,-.04),(pt.x,pt.y,height+.035),.024,black,fences)
  if privacy:
   # Diagonal bands reproduce the privacy weaving without leaving a solid flat sheet.
   paths=[]
   for j in range(math.ceil(length/.13)+12):
    start=-height+j*.13;pts=[]
    for z in (.24,height-.025):
     s=max(0,min(length,start+z*.45));p=a+d*s;pts.append((p.x+.006,p.y+.006,z))
    if (Vector(pts[1])-Vector(pts[0])).length>.05:paths.append(pts)
   rods('privacy diagonal weave',paths,.019,cladm,fences,1)
 def gate(name,a,b,height=1.05):
  a=Vector((*a,0));b=Vector((*b,0));v=(b-a).normalized();aa=a+v*.07;bb=b-v*.07
  for pt in (a,b):box(name+' square post',pt.x-.035,pt.x+.035,pt.y-.035,pt.y+.035,-.04,height+.09,black,fences,.004)
  rods(name+' frame',[[(aa.x,aa.y,.055),(bb.x,bb.y,.055),(bb.x,bb.y,height),(aa.x,aa.y,height),(aa.x,aa.y,.055)]],.017,black,fences)
  length=(bb-aa).length
  for j in range(1,math.ceil(length/.07)):
   p=aa+(bb-aa)*j/math.ceil(length/.07);rod(name+' vertical wire',(p.x,p.y,.08),(p.x,p.y,height-.02),.0035,black,fences)
  for z in (.28,.52,.76):rod(name+' horizontal wire',(aa.x,aa.y,z),(bb.x,bb.y,z),.003,black,fences)
  p=bb-v*.07;rod(name+' latch',(p.x,p.y-.04,.80),(p.x-.1*v.x,p.y-.04-.1*v.y,.80),.008,steel,fences)
 panel('facade aligned garden fence',(1.42,FENCE_START),(FENCE_EDGE_U,FENCE_START),1.05,.03);gate('facade aligned access gate',(.18,FENCE_START),(1.42,FENCE_START))
 panel('rear far side chain link',(-W+.04,11.0),(-W+.04,24.85),1.72,.22)
 panel('terrace privacy boundary',(0,10.98),(0,17.4),1.72,.22,True)
 gate('rear to side garden gate',(0,17.4),(0,18.42),1.40)
 panel('rear lawn side wire',(0,18.42),(0,24.85),1.72,.22)
 panel('rear lawn end wire',(-W+.04,24.85),(0,24.85),1.72,.22)
 panel('outer side garden wire',(FENCE_EDGE_U,FENCE_START),(FENCE_EDGE_U,26),1.1,.035)
 # Real short blades, aggregated into one mesh, over mottled lawn material.
 blades=[];faces=[]
 for i in range(65000):
  if random.random()<.83:x=random.uniform(.07,14.20);y=random.uniform(FRONT_EDGE+.04,25.95)
  else:x=random.uniform(-W+.12,-.06);y=random.uniform(16.44,24.81)
  if y<front_y(x)+.015:continue
  for j in range(2):
   z=-.018;h=random.uniform(.025,.075);w=.003;ang=random.random()*math.tau;dx=math.cos(ang)*w;dy=math.sin(ang)*w;k=len(blades);blades.extend([(x-dx,y-dy,z),(x+dx,y+dy,z),(x+dx*3,y+dy*3,z+h)]);faces.append((k,k+1,k+2))
 o=mesh('mown grass blades',blades,faces,grass,plants)
 # Leaf meshes are grouped by plant, rather than thousands of separate Blender objects.
 leafmats=[material('leaf '+str(i),h,.79) for i,h in enumerate(['304422','455D2D','5B7138','6C7D43','83915B','653C37','ABC39A','D4DDC1'])]
 def foliage(name,centres,rx,ry,rz,leaves=450,variegated=False,purple=False):
  vs=[];fs=[];ids=[]
  for c in centres:
   for j in range(leaves):
    az=random.random()*math.tau;zz=random.uniform(-1,1);rr=(1-zz*zz)**.5*random.uniform(.5,1);pos=Vector((c[0]+rx*rr*math.cos(az),c[1]+ry*rr*math.sin(az),c[2]+rz*zz*random.uniform(.75,1)))
    normal=Vector((random.uniform(-1,1),random.uniform(-1,1),random.uniform(-.6,1)));normal.normalize();u=normal.cross(Vector((0,0,1)))
    if u.length<.02:u=Vector((1,0,0))
    u.normalize();v=normal.cross(u);le=random.uniform(.075,.15);wi=le*.4;k=len(vs)
    vs.extend([tuple(pos-v*le),tuple(pos-u*wi),tuple(pos+normal*.009),tuple(pos+v*le),tuple(pos+u*wi)])
    fs.extend([(k,k+1,k+2),(k+1,k+3,k+2),(k+3,k+4,k+2),(k+4,k,k+2)])
    idx=random.choice([1,2,3,4,6,7,7] if variegated else [0,0,1,2,3,4,5] if not purple else [0,5,5,5]);ids.extend([idx]*4)
  ob=mesh(name,vs,fs,None,plants)
  for m in leafmats:ob.data.materials.append(m)
  for f,idx in zip(ob.data.polygons,ids):f.material_index=idx
  return ob
 def hedge(name,a,b,height=1.6,width=.65,variegated=False):
  length=(Vector(b)-Vector(a)).length;count=max(2,round(length/.48));centres=[]
  for j in range(count):
   p=Vector(a)+(Vector(b)-Vector(a))*(j+.5)/count;centres.append((p.x,p.y,height*.61+random.uniform(-.08,.08)))
   rod('hedge woody stem',(p.x,p.y,-.02),(p.x,p.y,height*.75),.014,bark,plants)
  foliage(name,centres,width*.65,width*.65,height*.47,420,variegated)
 hedge('white tipped rear boundary hedge',(-W+.2,24.65),(-.15,24.65),1.85,.95,True)
 hedge('side boundary mixed evergreen hedge',(HEDGE_EDGE_U,FENCE_START+.1),(HEDGE_EDGE_U,25.8),1.65,.9)
 hedge('front right photinia hedge',(7.5,FENCE_START+.55),(HEDGE_EDGE_U,FENCE_START+.55),1.35,.9)
 hedge('public low clipped hedge',(16.35,.4),(16.35,27.7),.62,1.05)
 hedge('public front curved hedge approach',(.65,FRONT_EDGE-2.2),(FRONT_CX,FRONT_EDGE-2.2),.62,1.05)
 hedge('public curved corner hedge',(16.35,FRONT_CY-FRONT_RADIUS+.2),(16.35,FRONT_CY),.62,1.05)
 # Rear side garden has a looser twiggy hedge, matching the photos behind the playhouse.
 twigpaths=[]
 for j in range(150):
  x=random.uniform(.3,11.5);y=random.uniform(25.2,26);h=random.uniform(1.3,2.0);twigpaths.append([(x,y,-.02),(x+random.uniform(-.2,.2),y,h*.7),(x+random.uniform(-.3,.3),y+random.uniform(-.2,.2),h)])
 rods('twiggy rear boundary hedge',twigpaths,.009,bark,plants,1)
 foliage('loose rear shrubs',[(i+.5,25.65,1.25) for i in range(11)],.55,.4,.55,240)
 def tree(name,x,y,h=5,crown=1.8,purple=False,fruit=False):
  rod(name+' trunk',(x,y,-.04),(x+.05,y,h*.68),.065 if fruit else .15,bark,plants)
  centres=[]
  for j in range(16 if not fruit else 9):
   a=j*2.4;z=h*.48+(j%4)*h*.10;end=(x+math.cos(a)*crown*.72,y+math.sin(a)*crown*.72,z+h*.14);rod(name+' branch',(x+.035,y,z-.5),end,.016 if fruit else .038,bark,plants);centres.append(end)
  foliage(name+' canopy',centres,crown*.58,crown*.58,h*.18,140 if fruit else 350,False,purple)
  if fruit:
   for j in range(18):
    a=j*2.4;xx=x+math.cos(a)*random.uniform(.20,.85);yy=y+math.sin(a)*random.uniform(.2,.85);zz=random.uniform(1.1,2.2)
    # Small octahedral apples with subdivided, rounded silhouettes.
    vs=[(xx+.055,yy,zz),(xx-.055,yy,zz),(xx,yy+.055,zz),(xx,yy-.055,zz),(xx,yy,zz+.065),(xx,yy,zz-.06)];ob=mesh('red apple',vs,[(0,2,4),(2,1,4),(1,3,4),(3,0,4),(2,0,5),(1,2,5),(3,1,5),(0,3,5)],red,plants);m=ob.modifiers.new('Round apple','SUBSURF');m.levels=1
 tree('small apple tree',10.0,16.0,2.8,1.0,fruit=True)
 for j,y in enumerate((4.0,13.0,23.0)):tree('street deciduous tree '+str(j+1),16.4,y,6.5,2.25)
 tree('rear burgundy garden tree',10.2,25.7,5.8,1.7,True)
 tree('far rear leafy tree',1.3,26.7,5.0,1.7)
 # Playhouse: raised floor, real porch opening, four-pane window, half-height gate and pitched roof.
 hx,hy=11.1,20.0
 for x in (hx-.72,hx+.72):
  for y in (hy-.70,hy+.70):box('playhouse support post',x-.06,x+.06,y-.06,y+.06,-.04,2.55,wood,play,.004)
 for j in range(12):
  x=hx-.8+j*1.6/12;box('playhouse raised deck plank',x+.002,x+1.6/12-.002,hy-1.00,hy+.80,.86,.91,wood,play,.003)
 # horizontal timber boards on rear and side faces
 for j in range(12):
  z=.93+j*.133;box('hut back cladding',hx-.76,hx+.76,hy+.70,hy+.76,z,z+.128,wood,play,.002)
  for x in (hx-.78,hx+.72):box('hut side cladding',x,x+.06,hy-.58,hy+.72,z,z+.128,wood,play,.002)
  # front wall: left window opening and right door opening.
  for xa,xb in ((hx-.76,hx-.63),(hx-.08,hx+.12),(hx+.68,hx+.76)):box('hut front wall board',xa,xb,hy-.62,hy-.56,z,z+.128,wood,play,.002)
  if j<5 or j>9:box('hut front below above window',hx-.63,hx-.08,hy-.62,hy-.56,z,z+.128,wood,play,.002)
  if j>10:box('hut front door lintel',hx+.12,hx+.68,hy-.62,hy-.56,z,z+.128,wood,play,.002)
 for x in (hx-.64,hx-.36,hx-.09):box('playhouse window vertical',x,x+.025,hy-.645,hy-.60,1.60,2.28,wood,play,.002)
 for z in (1.60,1.94,2.27):box('playhouse window horizontal',hx-.64,hx-.06,hy-.645,hy-.60,z,z+.025,wood,play,.002)
 for j in range(5):box('playhouse half door slat',hx+.135+j*.106,hx+.23+j*.106,hy-.65,hy-.61,.94,1.49,wood,play,.003)
 for j in range(8):box('porch baluster',hx-.75+j*.10,hx-.723+j*.10,hy-.97,hy-.94,.93,1.55,wood,play,.002)
 box('porch handrail',hx-.78,hx+.015,hy-.99,hy-.92,1.53,1.58,wood,play,.003)
 for x in (hx+.18,hx+.72):rod('playhouse ladder side',(x,hy-1.65,0),(x,hy-.94,.96),.028,wood,play)
 for j in range(4):
  z=.12+j*.23;y=hy-1.65+(z/.96)*.71;box('playhouse ladder rung',hx+.16,hx+.75,y-.07,y+.07,z,z+.035,wood,play,.004)
 for yy in (hy-.61,hy+.74):mesh('playhouse timber gable',[(hx-.78,yy,2.52),(hx+.78,yy,2.52),(hx,yy,3.055)],[(0,1,2)],wood,play)
 # Two roof planes, overlapping dark shingle strips.
 for sign in (-1,1):
  for j in range(7):
   xa=hx+sign*j*.145;xb=hx+sign*(j+1)*.145;za=3.08-j*.075;zb=3.08-(j+1)*.075
   mesh('playhouse shingle roof strip',[(xa,hy-.84,za),(xb,hy-.84,zb),(xb,hy+.88,zb),(xa,hy+.88,za)],[(0,1,2,3)],roofmat,play)
 rod('roof ridge cap',(hx,hy-.86,3.086),(hx,hy+.90,3.086),.026,roofmat,play)
 # Twin swings, weathered timber A-frame, red and pink seats.
 beamz=2.60;x0=hx+.80;x1=hx+4.95;sy=hy+.05
 rod('swing top timber beam',(x0,sy,beamz),(x1,sy,beamz),.07,wood,play)
 for xx in (x0,x1):
  for yy in (sy-.75,sy+.75):rod('swing A frame leg',(xx,yy,-.03),(xx,sy,beamz),.052,wood,play)
  rod('swing A crossbrace',(xx,sy-.47,1),(xx,sy+.47,1),.03,wood,play)
 for i,xx in enumerate((hx+2.0,hx+3.7)):
  for dx in (-.22,.22):rod('swing suspension rope',(xx+dx,sy,.43),(xx+dx,sy,2.57),.007,rope,play)
  box('red swing seat' if i==0 else 'pink swing seat',xx-.26,xx+.26,sy-.13,sy+.13,.39,.445,red if i==0 else rose,play,.04)
 # A-frame picnic bench.
 px,py=10.2,17.3
 for j in range(6):box('picnic tabletop plank',px-.85,px+.85,py-.36+j*.12,py-.248+j*.12,.70,.745,wood,play,.004)
 for yy in (py-.65,py+.65):
  for j in range(2):box('picnic bench plank',px-.96,px+.96,yy-.12+j*.12,yy-.009+j*.12,.405,.447,wood,play,.003)
 for xx in (px-.60,px+.60):
  for sign in (-1,1):rod('picnic A leg',(xx,py+sign*.69,0),(xx,py+sign*.23,.70),.043,wood,play)
  rod('picnic bench cross support',(xx,py-.80,.38),(xx,py+.80,.38),.034,wood,play)
 # Round trampoline: magenta padded rim, black jumping bed, fine transparent net, six legs.
 tx,ty=12.2,12.9;radius=1.60
 ring('trampoline padded berry ring',(tx,ty,.76),radius,.085,pink,play)
 vs=[(tx,ty,.745)]+[(tx+1.54*math.cos(i*math.tau/96),ty+1.54*math.sin(i*math.tau/96),.745) for i in range(96)]
 mesh('black trampoline jumping mat',vs,[(0,i+1,(i+1)%96+1) for i in range(96)],black,play)
 for i in range(6):
  a=i*math.tau/6;x=tx+radius*math.cos(a);y=ty+radius*math.sin(a);rod('trampoline net pole',(x,y,.04),(x,y,2.72),.017,steel,play);rod('trampoline foam sleeve',(x,y,.8),(x,y,2.68),.024,black,play)
  b=a+.40;xx=tx+radius*math.cos(b);yy=ty+radius*math.sin(b);rods('trampoline U support',[[(x,y,.69),(x,y,.06),(xx,yy,.06),(xx,yy,.69)]],.015,steel,play)
 ring('trampoline top net seam',(tx,ty,2.7),radius,.014,black,play)
 vs=[];fs=[]
 for i in range(97):
  a=i*math.tau/96;vs.extend([(tx+radius*math.cos(a),ty+radius*math.sin(a),.80),(tx+radius*math.cos(a),ty+radius*math.sin(a),2.70)])
 for i in range(96):fs.append((i*2,i*2+2,i*2+3,i*2+1))
 ob=mesh('trampoline net enclosure',vs,fs,tnet,play);uv=ob.data.uv_layers.new(name='metric net')
 for loop in ob.data.loops:
  idx=loop.vertex_index;uv.data[loop.index].uv=((idx//2)*math.tau*radius/96,(idx%2)*1.90)
 # Visible blue entrance zipper on the front side of the net.
 blue=material('blue trampoline zip','477C96',.6);rod('blue net entrance seam',(tx,ty-radius,.79),(tx,ty-radius,2.68),.01,blue,play)
 # Small pink slide beside the clad wall, as in the side-garden photograph.
 verts=[(.44,7.08,.84),(.44,7.62,.84),(1.73,7.62,.06),(1.73,7.08,.06)];ob=mesh('small pink slide chute',verts,[(0,1,2,3)],rose,play);sol=ob.modifiers.new('Plastic thickness','SOLIDIFY');sol.thickness=.025
 for y in (7.08,7.62):rods('small slide raised side',[[ (.44,y,.92),(.70,y,.87),(1.30,y,.31),(1.73,y,.14)]],.035,rose,play)
 green=material('slide pale green handle','A2B280',.5)
 for y in (7.08,7.62):rods('slide ladder handrail',[[ (.13,y,.02),(.28,y,.96),(.42,y,1.14),(.58,y,1.02)]],.024,green,play)
 for j in range(3):box('slide ladder step',.18,.42,7.08,7.62,.19+j*.22,.225+j*.22,green,play,.01)
 # Rear lawn's sandbox and covered low timber box; no loose toys or storage clutter.
 sx,sy=-1.40,23.1;box('sandbox clean sand',sx-.59,sx+.59,sy-.59,sy+.59,-.02,.06,sand,play)
 yellow=material('sandbox yellow edge','B8A52C',.6);sgreen=material('sandbox green edge','487F4F',.6)
 for x,m in ((sx-.65,red),(sx+.60,blue)):box('sandbox painted rim',x,x+.05,sy-.65,sy+.65,-.025,.13,m,play,.004)
 for y,m in ((sy-.65,yellow),(sy+.60,sgreen)):box('sandbox painted rim',sx-.60,sx+.60,y,y+.05,-.025,.13,m,play,.004)
 bx,by=-W+1.55,23.1;box('covered timber garden box',bx-1.,bx+1.,by-.76,by+.76,-.025,.20,wood,play,.01)
 cover=material('taupe flat garden box cover','9C9D8C',.93)
 box('tidy garden box cover',bx-1.025,bx+1.025,by-.785,by+.785,.20,.225,cover,play,.007)
 for j in range(5):box('garden box lid batten',bx-1.03,bx+1.03,by-.70+j*.35,by-.67+j*.35,.225,.25,wood,play,.003)
 # Follow the curved street corner with the public planting, preserving the tree shape.
 def corner_point(u,y):
  if y>=FRONT_CY:return u,y
  a=max(-math.pi/2,(y-FRONT_CY)/FRONT_RADIUS*math.pi/2);r=u-FRONT_CX
  return FRONT_CX+r*math.cos(a),FRONT_CY+r*math.sin(a)
 tu,ty=corner_point(16.4,4.0)
 for ob in plants.objects:
  tree_first=ob.name.startswith(P+'street deciduous tree 1')
  hedge_public=ob.name.startswith((P+'public low clipped hedge',P+'public curved corner hedge'))
  if ob.type=='MESH':points=[v.co for v in ob.data.vertices]
  elif ob.type=='CURVE':points=[p.co for sp in ob.data.splines for p in sp.points]
  else:continue
  if tree_first:
   for v in points:v.x+=tu-16.4;v.y+=ty-4.0
  elif hedge_public or (ob.name.startswith(P+'hedge woody stem') and points and points[0].x>15.7):
   for v in points:v.x,v.y=corner_point(v.x,v.y)
 # Hedge reaches the inner edge of the path, directly behind the relocated fence.
 for ob in plants.objects:
  if ob.type=='MESH' and ob.name.startswith((P+'side boundary mixed evergreen hedge',P+'front right photinia hedge')):
   for v in ob.data.vertices:v.co.x=min(v.co.x,FENCE_EDGE_U-.025)
 # Aerial image: side street diverges from the house side wall by about 13 degrees.
 # Keep house, driveway, rear terrace and rigid play equipment unchanged.
 for col in (terrain,fences,plants,context):
  for ob in col.objects:
   if ob.type=='MESH':points=[v.co for v in ob.data.vertices]
   elif ob.type=='CURVE':points=[p.co for sp in ob.data.splines for p in sp.points]
   else:continue
   for v in points:
    v.x+=AERIAL_STREET_SPLAY*max(0,v.y-FRONT_CY)*max(0,min(1,v.x/11.85))
 # All garden components were built in local coordinates: +u points away from the side wall.
 # Mirror only the garden, never the original house or its interior.
 for col in cols:
  for ob in col.objects:
   if ob.type=='MESH':
    for v in ob.data.vertices:v.co.x=(0 if side==-1 else W)+side*v.co.x
    if side==-1:
     import bmesh
     bm=bmesh.new();bm.from_mesh(ob.data);bmesh.ops.reverse_faces(bm,faces=list(bm.faces));bm.to_mesh(ob.data);bm.free()
   elif ob.type=='CURVE':
    for sp in ob.data.splines:
     for pt in sp.points:pt.co.x=(0 if side==-1 else W)+side*pt.co.x
 def pt(u,y,z):return ((0 if side==-1 else W)+side*u,y,z)
 views=[]
 for number,title,loc,target,lens,size in [
  (45,'TUIN - zij en achter overzicht',pt(29,39,25),pt(1.7,13,.8),45,(1550,1200)),
  (46,'ZIJTUIN - gazon en speelgedeelte',pt(5.8,2.0,2.15),pt(5.9,20.1,1.25),25,(1500,1000)),
  (47,'ACHTERTUIN - vanaf veranda',(-.5*W if side==-1 else 1.5*W,11.30,4.0),pt(-2.8,23.0,.65),29,(1450,1050)),
  (48,'VOORTUIN - open gebogen gazon',pt(25,-20,21),pt(5,7,1.0),39,(1600,1200)),
  (49,'OPRIT - garage en open voortuin',(15,-13.5,5.8),(4.5,-1.7,1.2),39,(1500,1100)),
  (50,'TERREIN - bovenaanzicht luchtfoto',(10,10,55),(10,10,0),45,(1500,1500))]:
  # Rear view starts above the existing veranda, inside the correct house footprint.
  if number==47:loc=(4.95,11.30,3.8)
  sc=bpy.data.scenes.get(f'{number} | {title}') or bpy.data.scenes.new(f'{number} | {title}')
  for c in list(sc.collection.children):sc.collection.children.unlink(c)
  for r in ROOTS:sc.collection.children.link(bpy.data.collections[r])
  sc.render.engine='CYCLES';sc.cycles.device='CPU';sc.cycles.samples=32;sc.cycles.use_denoising=True;sc.cycles.max_bounces=10;sc.cycles.transparent_max_bounces=32;sc.render.threads_mode='FIXED';sc.render.threads=8;sc.render.resolution_x,sc.render.resolution_y=size;sc.render.resolution_percentage=100;sc.render.image_settings.file_format='PNG';sc.view_settings.view_transform='AgX';sc.world=bpy.data.worlds['Rear photo / soft rear daylight']
  d=bpy.data.cameras.new(P+title);cam=bpy.data.objects.new(P+title,d);sc.collection.objects.link(cam);cam.location=loc;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();d.lens=lens;sc.camera=cam
  if number==50:d.type='ORTHO';d.ortho_scale=43;cam.rotation_euler=(0,0,0)
  ld=bpy.data.lights.new(P+'cloudy daylight '+str(number),'AREA');ld.energy=1800;ld.shape='DISK';ld.size=15;ob=bpy.data.objects.new(ld.name,ld);sc.collection.objects.link(ob);ob.location=pt(8,8,14);ob.rotation_euler=(Vector(pt(4,14,0))-ob.location).to_track_quat('-Z','Y').to_euler();ob.visible_glossy=False;views.append(sc)
 assert bpy.data.objects.get('Rear photo / black laundry door leaf')
 assert bpy.data.objects.get('Entrance photo / full height sidelight frosted layer')
 assert len([o for o in bpy.data.objects if o.name.startswith('Reference spiral / ') and 'beige tread' in o.name])==28
 assert len([o for o in play.objects if o.name.startswith(P+'swing suspension rope')])==4
 report={'side_from_street':'left' if side==-1 else 'right','garden_dimensions_estimated':True,'side_lawn_width_front_m':FENCE_EDGE_U,'side_lawn_width_rear_m':round(FENCE_EDGE_U+AERIAL_STREET_SPLAY*(26-FRONT_CY),3),'fence_and_hedge_reach_path':True,'fence_to_path_inner_edge_m':round(14.25-FENCE_EDGE_U,3),'side_lawn_depth_m':26,'rear_lawn_from_y_m':16.4,'rear_lawn_to_y_m':24.85,'rear_lawn_width_m':W-.09,'rear_lawn_to_terrace_gap_m':0,'aerial_reference_used':True,'side_street_divergence_degrees':round(math.degrees(math.atan(AERIAL_STREET_SPLAY)),2),'playhouse_centre_local_m':[11.1,20.0],'picnic_centre_local_m':[10.2,17.3],'driveway_restored':True,'driveway_width_m':W,'driveway_depth_m':5.169,'driveway_and_lawn_front_y_m':FRONT_EDGE,'front_open_lawn':True,'fence_start_y_m':FENCE_START,'curved_front_radius_m':FRONT_RADIUS,'front_gate_aligned_with_facade':True,'rear_side_gate':True,'playhouse':True,'swings':2,'trampoline_diameter_m':3.2,'picnic_table':True,'pink_slide':True,'sandbox':True,'grass_blades':len(faces),'cars':0,'previous_house_and_terrace_preserved':True}
 (ROOT/'garden_photo_verification.json').write_text(json.dumps(report,indent=2));notes='TUIN VOLGENS FOTO\'S\nZijtuin '+('rechts' if side==1 else 'links')+' gezien vanaf de straat: breed gazon, open gazon vooraan met gebogen rand en gebogen voetpad; zwarte gaasafsluiting en poort staan exact in het verlengde van de voorgevel op y0,00 m (het open gazon loopt tot y-5,20 m), hagen en bomen langs voetpad, speelhuis op palen met twee schommels, trampoline met roze rand en net, picknicktafel, fruitboom en kleine roze glijbaan. Achtertuin sluit zonder gat aan op de terrasgoot; gaasafsluitingen met betonnen onderplaten, privacyweving bij terras, witbonte achterhaag, zandbak en lage afgedekte houten bak. Zwarte verticale bekleding op de zijgevel. Geen auto\'s of los speelgoed/rommel.\nTuinmaten en plantplaatsing zijn foto-inschattingen, geen perceelopmeting. Omheining en haag sluiten direct aan op de binnenrand van het pad, zonder de eerdere tussenliggende grasstrook. Breedte omheinde zijtuin ca. 14,20 m vooraan en 20,37 m achteraan, lengte ca. 26 m plus de open voorzone van ca. 5,20 m; achtergazon vanaf bestaande terrasrand y16,40 tot y24,85. Huis en terras behouden hun bestaande maatvoering.\nOprit voor garage en voordeur hersteld: volledige gevelbreedte 7,38 m en circa 5,20 m diep, grijze betonklinkers, rand naast gazon en verlaagde toegang over het voetpad. Geen auto of vuilnisbakken. Open voorzone zonder hek; afrondingsstraal circa 5,50 m blijft een foto-inschatting; het hek ligt exact op de voorgevellijn en sluit aan op het pad. Scenes 45 overzicht, 46 zijtuin, 47 achtertuin, 48 open gebogen voortuin, 49 oprit en garage, 50 terrein in bovenaanzicht. Luchtbeeld gebruikt voor de schuin lopende zijstraat, bredere tuin achteraan en plaatsing van speelhuis en picknicktafel; dit blijft een visuele benadering en geen kadastrale opmeting. Bron garden_photo.py. Reservekopie Huis_before_garden_photo.blend.\n'
 t=bpy.data.texts.get('TUIN - photo notes') or bpy.data.texts.new('TUIN - photo notes');t.clear();t.write(notes);(ROOT/'GARDEN_PHOTO_NOTES.txt').write_text(notes)
 refpath=ROOT/'references/aerial_garden_2026-09-27.png'
 if refpath.exists():
  rc=bpy.data.collections.get(P+'reference only - hidden') or bpy.data.collections.new(P+'reference only - hidden')
  if rc.name not in parent.children:parent.children.link(rc)
  rc.hide_viewport=True;rc.hide_render=True
  im=bpy.data.images.load(str(refpath),check_existing=True);im.pack()
  ob=bpy.data.objects.new(P+'aerial image - approximate alignment',None);rc.objects.link(ob);ob.empty_display_type='IMAGE';ob.data=im;ob.empty_display_size=1326/19;ob.location=(W-.835,17.89,-.4);ob.rotation_euler.z=math.atan2(-.546,.838);ob.color[3]=.55;ob.hide_render=True
 print('GARDEN VERIFIED' ,json.dumps(report),flush=True);return views

if __name__=='__main__':
 main=ROOT/'Huis_Oude_Terelststraat_15.blend';backup=ROOT/'Huis_before_garden_photo.blend'
 if not backup.exists():shutil.copy2(main,backup)
 side=-1 if '--left' in sys.argv else 1
 views=update_garden(side);bpy.context.window.scene=views[0]
 for screen in bpy.data.screens:
  for a in screen.areas:
   if a.type=='VIEW_3D':a.spaces.active.region_3d.view_perspective='CAMERA';a.spaces.active.shading.type='MATERIAL';a.spaces.active.overlay.show_overlays=False
 bpy.ops.wm.save_as_mainfile(filepath=str(main))
 if '--no-render' not in sys.argv:
  jobs=list(zip(views,['garden_overview.png','side_garden_photo.png','rear_garden_photo.png','garden_open_curved_front.png','driveway_restored.png','garden_aerial_layout.png']))
  if '--hero-only' in sys.argv:jobs=jobs[:1]
  for sc,name in jobs:
   if '--draft' in sys.argv:sc.cycles.samples=20;sc.render.resolution_percentage=70
   sc.render.filepath=str(ROOT/name);bpy.ops.render.render(write_still=True,scene=sc.name);sc.cycles.samples=32;sc.render.resolution_percentage=100
 bpy.context.window.scene=views[0];bpy.ops.wm.save_as_mainfile(filepath=str(main))
