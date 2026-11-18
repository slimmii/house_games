"""Rear exterior, curved garden stair, terrace and shutters from user photographs.
Metric project geometry is retained; photo-only detailing is estimated.
"""
import bpy, math, json, sys, shutil
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parent
P='Rear photo / '
W=7.3808; D=10.9601; F1=2.41
ROOTS=['00 | GROUND - 2021','01 | FIRST - 2021 + Camber 2025','02 | SECOND - archive reconstruction','03 | ROOFS - removable','04 | SITE and rear stair - indicative extent']

def rgb(h):return tuple((int(h[i:i+2],16)/255)**2.2 for i in (0,2,4))+(1,)
def mat(name,h,rough=.5,metal=0):
 m=bpy.data.materials.get(P+name) or bpy.data.materials.new(P+name);m.use_nodes=True;m.diffuse_color=rgb(h)
 n=m.node_tree.nodes;l=m.node_tree.links;n.clear();p=n.new('ShaderNodeBsdfPrincipled');out=n.new('ShaderNodeOutputMaterial');l.new(p.outputs[0],out.inputs[0]);p.inputs['Base Color'].default_value=rgb(h);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
 return m
def box(name,x0,x1,y0,y1,z0,z1,m,col,bevel=0):
 return prism(name,[(x0,y0),(x1,y0),(x1,y1),(x0,y1)],z0,z1,m,col,bevel)
def prism(name,xy,z0,z1,m,col,bevel=0):
 n=len(xy);vs=[(x,y,z) for z in (z0,z1) for x,y in xy];fs=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
 me=bpy.data.meshes.new(P+name);me.from_pydata(vs,[],fs);me.update();me.materials.append(m);o=bpy.data.objects.new(P+name,me);col.objects.link(o)
 if bevel:b=o.modifiers.new('Soft manufactured edges','BEVEL');b.width=bevel;b.segments=3
 return o
def tube(name,pts,r,m,col):
 cu=bpy.data.curves.new(P+name,'CURVE');cu.dimensions='3D';cu.resolution_u=2;cu.bevel_depth=r;cu.bevel_resolution=4;cu.use_fill_caps=True;s=cu.splines.new('POLY');s.points.add(len(pts)-1)
 for p,v in zip(s.points,pts):p.co=(*v,1)
 cu.materials.append(m);o=bpy.data.objects.new(P+name,cu);col.objects.link(o);return o
def grain(m,scale=80,depth=.001,c1=None,c2=None):
 n=m.node_tree.nodes;l=m.node_tree.links;p=n.get('Principled BSDF');g=n.new('ShaderNodeNewGeometry');noise=n.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=scale;noise.inputs['Detail'].default_value=3;l.new(g.outputs['Position'],noise.inputs[0]);b=n.new('ShaderNodeBump');b.inputs['Distance'].default_value=depth;b.inputs['Strength'].default_value=.4;l.new(noise.outputs['Fac'],b.inputs['Height']);l.new(b.outputs[0],p.inputs['Normal'])
 if c1:
  ramp=n.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].color=rgb(c1);ramp.color_ramp.elements[1].color=rgb(c2);l.new(noise.outputs['Fac'],ramp.inputs[0]);l.new(ramp.outputs[0],p.inputs['Base Color'])
def brick_material(name,c1,c2,mortar,side=False):
 m=mat(name,c1,.85);n=m.node_tree.nodes;l=m.node_tree.links;p=n.get('Principled BSDF');g=n.new('ShaderNodeNewGeometry');sep=n.new('ShaderNodeSeparateXYZ');l.new(g.outputs['Position'],sep.inputs[0]);v=n.new('ShaderNodeCombineXYZ');l.new(sep.outputs['Y' if side else 'X'],v.inputs['X']);l.new(sep.outputs['Z'],v.inputs['Y'])
 t=n.new('ShaderNodeTexBrick');t.inputs['Scale'].default_value=1;t.inputs['Brick Width'].default_value=.205;t.inputs['Row Height'].default_value=.061;t.inputs['Mortar Size'].default_value=.003;t.inputs['Mortar Smooth'].default_value=.001;t.inputs['Color1'].default_value=rgb(c1);t.inputs['Color2'].default_value=rgb(c2);t.inputs['Mortar'].default_value=rgb(mortar);l.new(v.outputs[0],t.inputs[0]);l.new(t.outputs['Color'],p.inputs['Base Color'])
 b=n.new('ShaderNodeBump');b.invert=True;b.inputs['Distance'].default_value=.003;b.inputs['Strength'].default_value=.5;l.new(t.outputs['Fac'],b.inputs['Height']);noise=n.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=180;l.new(g.outputs['Position'],noise.inputs[0]);fine=n.new('ShaderNodeBump');fine.inputs['Distance'].default_value=.0005;fine.inputs['Strength'].default_value=.35;l.new(noise.outputs['Fac'],fine.inputs['Height']);l.new(b.outputs[0],fine.inputs['Normal']);l.new(fine.outputs[0],p.inputs['Normal']);return m

def update_rear_terrace():
 bpy.context.window.scene=bpy.data.scenes['01 | HOUSE - exterior']
 for o in list(bpy.data.objects):
  if o.name.startswith((P,'Rear balcony','Rear stair tread','Rear stair baluster','Rear stair handrail','Balcony handrail','Balcony rear handrail','Veranda garden glazing','Kitchen rear window','Laundry window','Bedroom terrace doors')):bpy.data.objects.remove(o,do_unlink=True)
 cols=[]
 for suffix,parent in [('ground facade',ROOTS[0]),('first facade',ROOTS[1]),('upper shutters and brick',ROOTS[2]),('roof trim',ROOTS[3]),('terrace and garden stair',ROOTS[4])]:
  c=bpy.data.collections.get(P+suffix) or bpy.data.collections.new(P+suffix)
  if c.name not in bpy.data.collections[parent].children:bpy.data.collections[parent].children.link(c)
  cols.append(c)
 ground,first,upper,roof,site=cols
 anth=mat('anthracite aluminium','383E46',.31,.4);black=mat('black laundry door','171B20',.35,.3);white=mat('white window and shutter enamel','E0E1DD',.4,.12);steel=mat('brushed stainless handrails','B8BEC2',.25,.88);support=mat('galvanised stringers','9A9FA0',.52,.72);dark=mat('rubber and deep joints','171D22',.65)
 stone=mat('blue grey stone treads','565B60',.74);grain(stone,95,.0008,'4E5358','666C70')
 tile=mat('dark square natural stone terrace','4D555D',.62);grain(tile,3.5,.001,'414649','62676B')
 grout=mat('pale stone grout','A8A393',.93);wood=mat('warm taupe slatted table','9D876A',.6);grain(wood,48,.0003,'7A6046','A58B69');furniture=mat('graphite table and chair frame','626A6F',.4,.65)
 clear=mat('clear rear glazing','EFF4F7',.025);bs=clear.node_tree.nodes.get('Principled BSDF');bs.inputs['Transmission Weight'].default_value=1;bs.inputs['IOR'].default_value=1.45
 orange=brick_material('smooth orange red rear brick','983E28','B44E30','94806F');blue=brick_material('painted charcoal brick below veranda','414B54','465059','353F49');blueside=brick_material('painted charcoal return brick','414B54','465059','353F49',True)
 pale=mat('white slab fascia','D8DAD7',.78);pipe=mat('pale grey downpipe','A7ACAA',.43,.2)
 def skin(label,x0,x1,y,z0,z1,opens,m,col):
  xs=sorted({x0,x1,*[v for a,b,c,d in opens for v in (a,b)]});zs=sorted({z0,z1,*[v for a,b,c,d in opens for v in (c,d)]})
  for a,b in zip(xs,xs[1:]):
   for c,d in zip(zs,zs[1:]):
    if not any(aa<(a+b)/2<bb and cc<(c+d)/2<dd for aa,bb,cc,dd in opens):box(label,a,b,y,y+.016,c,d,m,col)
 skin('laundry continuous rear brick',0,2.98,D+.002,0,2.41,[(.96,2.50,1.62,2.0)],orange,ground)
 skin('kitchen continuous rear brick',0,2.98,D+.002,2.41,5.61,[(.96,2.51,3.69,4.53)],orange,first)
 skin('upper smooth red rear facade',0,W,9.002,5.31,8.31,[(3.15,6.45,5.96,7.56)],orange,upper)
 skin('covered terrace painted back wall',3.11,7.10,8.795,0,2.22,[(3.48,5.9,0,2.04)],blue,ground)
 # Exposed source masonry projects beyond the simplified rear wall skin. Paint only patio-facing surfaces.
 for o in list(bpy.data.objects):
  if o.type!='MESH' or not o.name.startswith('ground / source masonry'):continue
  idx=len(o.data.materials);o.data.materials.append(blue)
  for face in o.data.polygons:
   c=o.matrix_basis@face.center;normal=o.matrix_basis.to_3x3()@face.normal
   if 3.11<c.x<7.11 and c.y>8.70 and normal.y>.5:face.material_index=idx
   if 3.0<c.x<3.14 and 8.79<c.y<10.96 and normal.x>.5:face.material_index=idx
 # Painted return has the existing plan's door opening: y9.16..10.00.
 for a,b,z0,z1 in [(8.79,9.16,0,2.22),(10,10.962,0,2.22),(9.16,10,2.04,2.22)]:box('painted laundry side wall',3.109,3.127,a,b,z0,z1,blueside,ground)
 box('laundry door true masonry lintel',2.80,3.11,9.16,10,2.04,2.22,bpy.data.materials['Warm white plaster'],ground)
 # Existing architectural doorway is empty, so no boolean cuts or cabinet movements are needed.
 for y in (9.16,9.948):box('black door jamb',2.986,3.132,y,y+.052,0,2.04,black,ground,.003)
 box('black door head',2.986,3.132,9.212,9.948,1.987,2.04,black,ground,.003)
 box('black laundry door leaf',3.048,3.098,9.217,9.943,.008,1.982,black,ground,.003)
 box('laundry flush stone threshold',2.76,3.16,9.16,10,-.028,.002,stone,ground,.002)
 for x in (3.018,3.133):
  tube('door handle rosette',[(x-.004,9.845,1.01),(x+.004,9.845,1.01)],.025,steel,ground)
  tube('door lever',[(x,9.845,1.01),(x+(.032 if x>3.1 else -.032),9.845,1.01),(x+(.032 if x>3.1 else -.032),9.72,1.01)],.008,steel,ground)
 for z in (.24,1.0,1.78):tube('black door hinge',[(3.124,9.215,z),(3.124,9.215,z+.07)],.007,steel,ground)
 def window(label,a,b,y,c,d,frame,col,panes=1):
  f=.048
  for x in (a,b-f):box(label+' outer jamb',x,x+f,y-.06,y+.05,c,d,frame,col,.003)
  for z in (c,d-f):box(label+' outer rail',a+f,b-f,y-.06,y+.05,z,z+f,frame,col,.002)
  for k in range(panes):
   xa=a+f+(b-a-2*f)*k/panes;xb=a+f+(b-a-2*f)*(k+1)/panes
   for x in (xa,xb-.024):box(label+' sash',x,x+.024,y-.025,y+.022,c+f,d-f,frame,col,.002)
   for z in (c+f,d-f-.024):box(label+' sash rail',xa+.024,xb-.024,y-.025,y+.022,z,z+.024,frame,col,.002)
   box(label+' glass',xa+.026,xb-.026,y-.005,y+.005,c+f+.025,d-f-.025,clear,col)
  box(label+' dark stone sill',a-.045,b+.045,y-.05,y+.15,c-.046,c-.012,stone,col,.003)
 infill=box('kitchen revised window sill masonry',.96,2.51,D-.28,D,3.32,3.69,bpy.data.materials['Warm white plaster'],first)
 infill.data.materials.append(bpy.data.materials['Kitchen walls - Colora WE M198 Brave Green'])
 for face in infill.data.polygons:
  if face.normal.y<-.9:face.material_index=1
 window('kitchen single white casement',.96,2.51,D-.072,3.69,4.53,white,first)
 window('laundry horizontal black window',.96,2.5,D-.072,1.62,2,anth,ground)
 window('ground terrace two panel sliding glazing',3.48,5.9,8.74,.015,2.04,anth,ground,2)
 window('veranda two panel sliding doors',3,6.98,D-.10,2.41,4.79,anth,first,2)
 tube('veranda sliding door pull',[(3.10,D-.019,3.37),(3.10,D-.019,3.68)],.008,white,first)
 # Roof-front profile meets the taller glazing instead of leaving an open strip above it.
 box('veranda deep charcoal fascia',2.97,7.115,D-.14,D+.09,4.77,4.95,anth,roof,.008)
 tube('veranda front gutter',[(2.97,D+.065,4.92),(7.12,D+.065,4.92)],.068,anth,roof)
 for o in bpy.data.objects:
  if o.name.startswith(('Veranda roof glazing bar','Veranda roof rail')):o.data.materials.clear();o.data.materials.append(anth)
  if o.name.startswith('Roof front / rear parapet'):
   matrix=o.matrix_basis;inv=matrix.inverted()
   for v in o.data.vertices:
    pt=matrix@v.co
    if pt.z>8.33:pt.z=8.33
    v.co=inv@pt
   o.data.materials.clear();o.data.materials.append(anth)
 box('kitchen rear parapet coping',-.03,3.015,D-.23,D+.055,5.61,5.66,anth,roof,.004)
 box('upper rear coping',-.04,W+.04,8.8,9.07,8.31,8.35,anth,roof,.003)
 for x,y,z0,z1 in [(.11,D+.11,0,5.61),(7.10,D+.04,0,4.91),(.11,9.10,5.65,8.28)]:
  tube('rainwater downpipe',[(x,y,z0),(x,y,z1)],.034,pipe,ground)
  for z in (z0+.45,(z0+z1)/2,z1-.25):tube('downpipe clip',[(x,y,z-.01),(x,y,z+.01)],.039,steel,ground)
 tube('kitchen roof offset drain',[(.11,9.10,5.65),(.11,9.32,5.46),(.11,10.68,5.46),(.11,D+.11,5.25)],.034,pipe,roof)
 # Vertical soldier brick lintels use the same orange family as the rear masonry.
 header=mat('orange lintel brick','B26142',.85);mortar=mat('rear lintel mortar','9E8A78',.95)
 for label,a,b,z,col in [('laundry',.96,2.5,2.,ground),('kitchen',.96,2.51,4.53,first),('bedroom',3.15,6.45,7.56,upper)]:
  yy=D+.019 if col!=upper else 9.019;box(label+' lintel mortar',a-.025,b+.025,yy,yy+.004,z,z+.17,mortar,col)
  count=round((b-a)/.06)
  for i in range(count):box(label+' soldier brick',a+i*(b-a)/count+.003,a+(i+1)*(b-a)/count-.003,yy+.004,yy+.01,z+.003,z+.168,header,col,.001)
 # All extant second-floor openings: front left + front right (already fitted) + rear bedroom.
 def shutter(label,a,b,y,z0,z1,outsign):
  def sb(n,x0,x1,ya,yb,za,zb,m,bev=0):return box(label+' '+n,x0,x1,min(ya,yb),max(ya,yb),za,zb,m,upper,bev)
  sb('dark backing',a,b,y,y+outsign*.018,z0,z1,dark)
  count=math.ceil((z1-z0-.065)/.026);pitch=(z1-z0-.065)/count
  for j in range(count):
   z=z0+.031+j*pitch;sb('white roller shutter slat '+str(j+1),a+.045,b-.045,y+outsign*.020,y+outsign*.042,z,z+pitch-.0025,white,.001)
  for x in (a,b-.045):sb('anthracite side guide',x,x+.045,y-outsign*.035,y+outsign*.062,z0,z1,anth,.002)
  sb('anthracite roller box',a-.03,b+.03,y-outsign*.04,y+outsign*.16,z1-.035,z1+.12,anth,.004)
  sb('white bottom bar',a+.045,b-.045,y+outsign*.021,y+outsign*.049,z0+.011,z0+.031,white,.001)
  sb('stone sill',a-.055,b+.055,y-outsign*.055,y+outsign*.16,z0-.05,z0-.014,stone,.003)
  return count
 frontslats=shutter('upper front left',.92,2.67,.055,6.21,7.69,-1)
 rearslats=shutter('upper rear bedroom',3.15,6.45,9.025,5.96,7.56,1)
 # Paving: real 60 cm square slabs with 4 mm joints and no clutter.
 # Trim the old indoor floor surface only under the already outdoor covered terrace.
 finish=bpy.data.objects.get('0 / floor finish')
 if finish and not finish.get('rear_patio_cut'):
  cutter=box('temporary patio floor cutter',3.11,7.11,8.79,D+.1,-.025,.02,dark,ground)
  mod=finish.modifiers.new('Outdoor patio finish opening','BOOLEAN');mod.object=cutter;mod.operation='DIFFERENCE';mod.solver='EXACT';bpy.context.view_layer.objects.active=finish;bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cutter,do_unlink=True);finish['rear_patio_cut']=True
 box('terrace continuous grout foundation',.08,7.30,D,16.3,-.15,-.004,grout,site)
 box('covered terrace grout foundation',3.13,7.10,8.79,D,-.012,-.004,grout,site)
 tiles=0
 for ix in range(13):
  xa=.08+ix*.6;xb=min(xa+.6,7.30)
  if xb-xa<.01:continue
  for iy in range(13):
   ya=8.5+iy*.6;yb=min(ya+.6,16.3)
   if ya>=16.3:continue
   # Clip each module against the L-shaped patio footprint.
   for x0,x1,y0,y1 in [(max(xa,.08),xb,max(ya,D),yb),(max(xa,3.13),min(xb,7.1),max(ya,8.79),min(yb,D))]:
    if x1-x0>.008 and y1-y0>.008:box('60cm terrace stone slab',x0+.002,x1-.002,y0+.002,y1-.002,-.025,0,tile,site,.001);tiles+=1
 box('garden edge drainage channel',.08,7.30,16.30,16.40,-.08,-.018,dark,site)
 for j in range(180):box('drain grate crossbar',.085+j*.04,.095+j*.04,16.30,16.40,-.023,-.014,support,site,.001)
 # Balcony's slim exposed strip, supported by the existing slab.
 box('balcony white fascia',3.1,7.11,10.86,11.03,2.22,2.36,pale,site,.002)
 box('balcony stone landing flush with veranda',3.1,7.11,10.84,11.03,2.36,F1,stone,site,.002)
 # Fourteen equal rises, 3 curved winder treads + 10 straight treads, then patio at 0.
 rise=F1/14;cx=3.;cy=11.03;ri=.10;ro=.96;treads=[]
 for k in range(3):
  a0=k*math.pi/6;a1=(k+1)*math.pi/6;xy=[(cx+ri*math.cos(a0),cy+ri*math.sin(a0))]+[(cx+ro*math.cos(a0+(a1-a0)*j/12),cy+ro*math.sin(a0+(a1-a0)*j/12)) for j in range(13)]+[(cx+ri*math.cos(a1),cy+ri*math.sin(a1))]
  z=F1-(k+1)*rise;treads.append(prism('curved stone winder '+str(k+1),xy,z-.045,z,stone,site,.002))
 for j in range(10):
  x1=3-j*.25;x0=x1-.25;z=F1-(j+4)*rise;treads.append(box('straight stone tread '+str(j+1),x0,x1+.013,cy+ri,cy+ro,z-.045,z,stone,site,.002))
 def path(rad,offset):
  pts=[]
  for k in range(49):
   a=(math.pi/2)*k/48;pts.append((cx+rad*math.cos(a),cy+rad*math.sin(a),F1-(3*rise)*k/48+offset))
  pts.extend((3-2.5*j/40,cy+rad,F1-3*rise-10*rise*j/40+offset) for j in range(1,41));return pts
 # Side stringers are formed plates following both the turn and the straight flight.
 for rad in (ri+.028,ro-.028):
  pts=path(rad,-.26);vs=[]
  for x,y,z in pts:vs.extend([(x,y-.014,z-.09),(x,y+.014,z-.09),(x,y+.014,z+.07),(x,y-.014,z+.07)])
  fs=[(0,3,2,1),(len(vs)-4,len(vs)-3,len(vs)-2,len(vs)-1)]
  for j in range(len(pts)-1):
   for k in range(4):fs.append((j*4+k,j*4+(k+1)%4,(j+1)*4+(k+1)%4,(j+1)*4+k))
  me=bpy.data.meshes.new(P+'stringer');me.from_pydata(vs,[],fs);me.materials.append(support);o=bpy.data.objects.new(P+'formed steel stringer',me);site.objects.link(o)
 for j in range(10):
  x=2.875-j*.25;z=F1-(j+4)*rise;tube('tread underside bracket',[(x,cy+ri+.025,z-.053),(x,cy+ro-.025,z-.053)],.018,support,site)
 # Short welded vertical seats connect every tread underside to the sloping stringers.
 for j in range(10):
  x=2.875-j*.25;z=F1-(j+4)*rise
  for rad in (ri+.028,ro-.028):tube('vertical tread support seat',[(x,cy+rad,z-.15),(x,cy+rad,z-.045)],.015,support,site)
 for k in range(3):
  a=(k+.5)*math.pi/6;z=F1-(k+1)*rise
  for rad in (ri+.028,ro-.028):
   x=cx+rad*math.cos(a);y=cy+rad*math.sin(a);tube('vertical curved tread support seat',[(x,y,z-.15),(x,y,z-.045)],.015,support,site)
 for rad in (ri+.018,ro-.018):
  tube('continuous curved stair handrail',path(rad,1.0),.020,steel,site)
  for off in (.25,.47,.69):tube('horizontal stair infill rod',path(rad,off),.006,steel,site)
  for t in (0,.5,1):
   a=math.pi/2*t;z=F1-3*rise*t;x=cx+rad*math.cos(a);y=cy+rad*math.sin(a);tube('curved stair vertical post',[(x,y,z-.15),(x,y,z+1.0)],.014,steel,site)
  for j in (3,6,10):
   x=3-j*.25;z=F1-(3+j)*rise;tube('straight stair vertical post',[(x,cy+rad,z-.12),(x,cy+rad,z+1)],.014,steel,site)
  box('stair bottom anchor',.46,.60,cy+rad-.065,cy+rad+.065,0,.012,support,site,.002)
  tube('bottom support foot',[(.53,cy+rad,.01),(.53,cy+rad,.17)],.023,support,site)
 # Balcony rails join the upper curved rail at x3.942, y11.03, z3.41.
 for off in (.25,.47,.69,1.0):tube('balcony horizontal stainless rail',[(cx+ro-.018,cy,F1+off),(7.03,cy,F1+off),(7.03,10.90,F1+off)],.020 if off==1 else .006,steel,site)
 for x in (4.30,5.65,7.03):
  tube('balcony stainless post',[(x,cy,2.30),(x,cy,3.41)],.014,steel,site);box('balcony post base',x-.045,x+.045,cy-.045,cy+.045,2.408,2.42,steel,site,.002)
 # Clean outdoor dining set: six chairs, slatted timber/composite surfaces and metal frames.
 tx,ty=5.15,13.2;tw,td=2.2,1.0
 for j in range(16):
  xa=tx-tw/2+j*tw/16;box('table top slat '+str(j+1),xa+.003,xa+tw/16-.003,ty-td/2,ty+td/2,.737,.765,wood,site,.003)
 for x in (tx-tw/2+.07,tx+tw/2-.07):
  for y in (ty-td/2+.07,ty+td/2-.07):box('table square metal leg',x-.032,x+.032,y-.032,y+.032,0,.74,furniture,site,.003)
 for y in (ty-td/2+.035,ty+td/2-.035):box('table long apron',tx-tw/2+.03,tx+tw/2-.03,y-.023,y+.023,.66,.738,furniture,site,.002)
 for x in (tx-tw/2+.035,tx+tw/2-.035):box('table short apron',x-.023,x+.023,ty-td/2+.03,ty+td/2-.03,.66,.738,furniture,site,.002)
 def chair(x,y,ang,index):
  before=set(site.objects)
  for xx in (-.25,.25):
   for yy in (-.24,.24):box('chair leg',xx-.016,xx+.016,yy-.016,yy+.016,.012,.465,furniture,site,.003)
   box('chair rear upright',xx-.016,xx+.016,.224,.256,.44,.94,furniture,site,.003)
   box('chair arm upright',xx-.016,xx+.016,-.216,-.184,.43,.68,furniture,site,.002)
   box('chair armrest',xx-.025,xx+.025,-.25,.27,.665,.685,wood,site,.004)
   box('chair side seat rail',xx-.016,xx+.016,-.25,.25,.413,.442,furniture,site,.002)
  for j in range(4):box('chair seat slat',-.23,.23,-.23+j*.12,-.122+j*.12,.443,.465,wood,site,.003)
  for j in range(3):box('chair backrest slat',-.231,.231,.230,.258,.58+j*.115,.68+j*.115,wood,site,.003)
  for o in set(site.objects)-before:o.location=(x,y,0);o.rotation_euler.z=ang;o['outdoor_chair']=index
 for idx,(x,y,a) in enumerate([(tx-.62,ty-.83,math.pi),(tx+.62,ty-.83,math.pi),(tx-.62,ty+.83,0),(tx+.62,ty+.83,0),(tx-1.45,ty,math.pi/2),(tx+1.45,ty,-math.pi/2)]):chair(x,y,a,idx+1)
 # Useful viewpoints of the entire rear, stair connections and actual terrace/laundry door.
 views=[]
 for num,title,loc,target,lens,size in [
  (42,'ACHTERGEVEL - terras en buitentrap',(5.4,24.4,4.1),(3.55,10.85,3.0),43,(1440,1440)),
  (43,'BUITENTRAP - aansluiting veranda',(6.8,14.5,6.0),(2.6,11.6,1.50),42,(1440,1120)),
  (44,'TERRAS - zwarte deur wasruimte',(6.0,12.5,1.63),(3.10,9.66,1.09),30,(1400,1050))]:
  name=f'{num} | {title}';sc=bpy.data.scenes.get(name) or bpy.data.scenes.new(name)
  for c in list(sc.collection.children):sc.collection.children.unlink(c)
  for r in ROOTS:sc.collection.children.link(bpy.data.collections[r])
  sc.render.engine='CYCLES';sc.cycles.samples=48;sc.cycles.use_denoising=True;sc.cycles.device='CPU';sc.cycles.max_bounces=12;sc.cycles.transmission_bounces=10;sc.render.resolution_x,sc.render.resolution_y=size;sc.render.resolution_percentage=100;sc.render.threads_mode='FIXED';sc.render.threads=8;sc.render.image_settings.file_format='PNG';sc.view_settings.view_transform='AgX'
  sc.world=bpy.data.worlds.get(P+'soft rear daylight') or bpy.data.worlds.new(P+'soft rear daylight');sc.world.use_nodes=True
  n=sc.world.node_tree.nodes;l=sc.world.node_tree.links
  if not n.get('Sky Texture'):
   sky=n.new('ShaderNodeTexSky');sky.sky_type='MULTIPLE_SCATTERING';sky.sun_elevation=math.radians(48);sky.sun_rotation=math.radians(30);sky.sun_disc=False;l.new(sky.outputs[0],n.get('Background').inputs[0]);n.get('Background').inputs[1].default_value=.42
  d=bpy.data.cameras.new(P+title);cam=bpy.data.objects.new(P+title,d);sc.collection.objects.link(cam);cam.location=loc;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();d.lens=lens;d.clip_start=.01;sc.camera=cam
  ld=bpy.data.lights.new(P+'soft rear fill '+str(num),'AREA');ld.energy=650;ld.shape='DISK';ld.size=8;ob=bpy.data.objects.new(ld.name,ld);sc.collection.objects.link(ob);ob.location=(4,17,9);ob.rotation_euler=(Vector((3,10,3))-ob.location).to_track_quat('-Z','Y').to_euler();ob.visible_glossy=False;ob.visible_transmission=False;views.append(sc)
 # Geometric checks: stair rise and endpoints, unobstructed doorway and prior work.
 heights=sorted(max(v.co.z for v in t.data.vertices) for t in treads)
 assert max(v.co.z for ob in site.objects if ob.name.startswith(P+'formed steel stringer') for v in ob.data.vertices)<F1-rise
 assert len(treads)==13 and all(abs(b-a-rise)<1e-5 for a,b in zip([0]+heights,heights+[F1]))
 assert abs(heights[0]-rise)<1e-5 and abs(heights[-1]+rise-F1)<1e-5
 assert .0 < 9.217-9.16 < .06 and 9.943<10.0
 assert bpy.data.objects.get('Entrance photo / full height sidelight frosted layer')
 assert len([o for o in bpy.data.objects if o.name.startswith('Reference spiral / ') and 'beige tread' in o.name])==28
 assert len([o for o in bpy.data.objects if o.name.startswith('Street photo / white roller shutter slat')])==56
 report={'rear_brick':'smooth orange red stretcher bond, 205 x 61 mm module','stair':{'risers':14,'rise_m':rise,'curved_winders':3,'straight_treads':10,'width_m':ro-ri,'straight_going_m':.25,'upper_level_m':F1,'patio_level_m':0,'connections_checked':True},'terrace':{'square_tile_module_m':.6,'joints_m':.004,'tile_objects':tiles},'dining_table_m':[2.2,1.0,.765],'chairs':6,'second_floor_shutters':{'front_left_slats':frontslats,'front_right_slats':56,'rear_bedroom_slats':rearslats,'all_existing_window_openings_covered':True,'bathroom_former_window_stays_closed':True},'laundry_door':{'black':True,'existing_side_opening_y_m':[9.16,10.0],'opening_head_m':2.04,'leaf_m':[.726,1.974],'sink_and_cabinets_clear':True},'previous_front_door_and_indoor_stair_preserved':True,'photo_detail_dimensions_estimated':True}
 (ROOT/'rear_terrace_verification.json').write_text(json.dumps(report,indent=2))
 notes='''ACHTERGEVEL EN TERRAS VOLGENS FOTO'S
Oranjerode gladde baksteen achteraan; antraciet veranda met twee schuifpanelen, wit enkel keukenraam en smal donker wasraam. Donker geschilderde baksteen onder de veranda. De eerder gesloten badkameropening blijft gesloten; alle drie bestaande buitenramen op de tweede verdieping hebben nu gesloten witte rolluiken met donkere kasten en geleiders.
Buitentrap langs de achtergevel: 14 gelijke optredes van 172 mm, drie gebogen boventreden, tien rechte treden van 250 mm diep, breedte 860 mm, natuursteen op verzinkte stalen dragers en RVS-leuningen met drie horizontale tussenstaven. Bovenaansluiting op veranda +2.41 m en onderaansluiting op terras 0 zijn gecontroleerd.
Donker natuurstenen terras met 60 cm tegels, lichte voegen en afvoergoot; latten-tafel 220 x 100 cm met zes stoelen. Geen los speelgoed, kleren of rommel. Zwarte deur in de bestaande zijopening van de wasruimte naar het overdekte terras, zonder de spoelbak of kasten te verplaatsen.
Scenes 42 achtergevel, 43 trapdetail, 44 terrasdeur. Alle details op foto's zonder maat zijn schattingen; dit is een conceptmodel, geen uitvoeringsplan. Terrasdiepte en tafelmaten zijn indicatief.
Bron rear_terrace_photo.py. Reservekopie Huis_before_rear_terrace_photo.blend.
'''
 t=bpy.data.texts.get('ACHTERGEVEL - rear photo notes') or bpy.data.texts.new('ACHTERGEVEL - rear photo notes');t.clear();t.write(notes);(ROOT/'REAR_TERRACE_NOTES.txt').write_text(notes)
 print('REAR VERIFIED',json.dumps(report),flush=True)
 return views

if __name__=='__main__':
 main=ROOT/'Huis_Oude_Terelststraat_15.blend';backup=ROOT/'Huis_before_rear_terrace_photo.blend'
 if not backup.exists():shutil.copy2(main,backup)
 views=update_rear_terrace();bpy.context.window.scene=views[0]
 for screen in bpy.data.screens:
  for a in screen.areas:
   if a.type=='VIEW_3D':a.spaces.active.region_3d.view_perspective='CAMERA';a.spaces.active.shading.type='RENDERED';a.spaces.active.overlay.show_overlays=False
 bpy.ops.wm.save_as_mainfile(filepath=str(main))
 if '--no-render' not in sys.argv:
  jobs=list(zip(views,['rear_exterior_photo.png','rear_stair_detail.png','terrace_laundry_door.png']))
  if '--hero-only' in sys.argv:jobs=jobs[:1]
  else:jobs.append((bpy.data.scenes['41 | VOORGEVEL - buitenfoto'],'front_exterior_photo.png'))
  for sc,fn in jobs:
   samples=sc.cycles.samples
   if '--draft' in sys.argv:sc.cycles.samples=24;sc.render.resolution_percentage=75
   bpy.context.window.scene=sc;sc.render.filepath=str(ROOT/fn);bpy.ops.render.render(write_still=True,scene=sc.name);sc.cycles.samples=samples;sc.render.resolution_percentage=100
 bpy.context.window.scene=views[0];bpy.ops.wm.save_as_mainfile(filepath=str(main))
