"""Editable house model. Run: blender -b --factory-startup --python build_house.py
Geometry: 2021 plan vectors; upper floor reconstructed from archive; furniture indicative.
"""
import bpy, bmesh, math, json, random
from pathlib import Path
from mathutils import Vector, Quaternion

ROOT=Path(__file__).resolve().parent
DATA=json.loads((ROOT/'plan_geometry.json').read_text())
W=DATA['width']; D=DATA['depth']; F1=2.41; F2=5.31; ROOF=8.31
random.seed(15)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
for c in list(bpy.data.collections):
    if c.name!='Collection':bpy.data.collections.remove(c)
base=bpy.context.scene;base.name='01 | HOUSE - exterior'
for c in list(base.collection.children):base.collection.children.unlink(c)

def collection(name,parent=None):
    c=bpy.data.collections.new(name)
    (parent.children if parent else base.collection.children).link(c)
    return c
def move(obj,col):
    for c in list(obj.users_collection):c.objects.unlink(obj)
    col.objects.link(obj)
    return obj
def rgb(h):
    h=h.lstrip('#');return tuple((int(h[i:i+2],16)/255)**2.2 for i in (0,2,4))+(1,)
def material(name,color,rough=.5,metal=0):
    m=bpy.data.materials.new(name);m.diffuse_color=rgb(color);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=rgb(color)
    p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
    return m
plaster=material('Warm white plaster','#EEECE6',.8)
white=material('Camber - premium white matt W1000 ST9','#F2F0EA',.42)
oak=material('Camber - natural Casella oak H1385 ST40','#B58C5C',.5)
wood=material('Dining table - pale oak, indicative','#C6AA81',.48)
floorwood=material('Light timber living-room floor','#BCAE97',.6)
brick=material('Red-brown brick - archive facade','#815C47',.85)
stone=material('Blue-grey stone thresholds','#6C7579',.7)
tile=material('Ground-floor warm grey tile','#B7B4AA',.72)
terrace=material('Terrace paving','#ADABA1',.9)
metal=material('Satin aluminium frames','#CACCCB',.3,.65)
dark=material('Dark metal','#303638',.4,.5)
sofa_mat=material('Sofas - muted aubergine from photos','#66566D',.86)
cushion=material('Soft upholstery cushions','#7A6A80',.95)
chairmat=material('Neutral dining chairs, indicative','#BCB3A9',.8)
ceramic=material('Sanitary ceramic','#F5F4EF',.22)
fabric=material('Neutral bedding','#D5D2C8',.88)
glass=material('Clear glazing','#D4E7E5',.12)
bs=glass.node_tree.nodes.get('Principled BSDF');bs.inputs['Transmission Weight'].default_value=.96;bs.inputs['IOR'].default_value=1.45
screen=material('TV screen','#162126',.18)
led=material('Warm cabinet lighting','#FFD5A0',.3)
p=led.node_tree.nodes.get('Principled BSDF');p.inputs['Emission Color'].default_value=rgb('#FFD5A0');p.inputs['Emission Strength'].default_value=4
roofmat=material('Flat roof membrane','#545755',.9)
grass=material('Garden context - indicative','#849079',.95)
accent=material('Drawing labels','#236C66',.65)

def grain(m,c1,c2,scale=(4,35,4)):
    n=m.node_tree.nodes;l=m.node_tree.links;p=n.get('Principled BSDF')
    tc=n.new('ShaderNodeTexCoord');mapping=n.new('ShaderNodeVectorMath');mapping.operation='MULTIPLY';mapping.inputs[1].default_value=scale
    noise=n.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=2;noise.inputs['Detail'].default_value=2.5
    ramp=n.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].position=.18;ramp.color_ramp.elements[0].color=rgb(c1);ramp.color_ramp.elements[1].position=.83;ramp.color_ramp.elements[1].color=rgb(c2)
    l.new(tc.outputs['Generated'],mapping.inputs[0]);l.new(mapping.outputs[0],noise.inputs['Vector']);l.new(noise.outputs['Fac'],ramp.inputs[0]);l.new(ramp.outputs['Color'],p.inputs['Base Color'])
grain(oak,'#977345','#C4A77A',(3,40,2));grain(wood,'#B99E76','#DEC6A0',(30,2,3));grain(floorwood,'#9F9584','#D5CBB8',(40,2,3))
def brick_shader(m):
    n=m.node_tree.nodes;l=m.node_tree.links;p=n.get('Principled BSDF')
    geo=n.new('ShaderNodeNewGeometry');sep=n.new('ShaderNodeSeparateXYZ');vec=n.new('ShaderNodeCombineXYZ')
    l.new(geo.outputs['Position'],sep.inputs[0]);horizontal=n.new('ShaderNodeMath');horizontal.operation='ADD';l.new(sep.outputs['X'],horizontal.inputs[0]);l.new(sep.outputs['Y'],horizontal.inputs[1]);l.new(horizontal.outputs[0],vec.inputs['X']);l.new(sep.outputs['Z'],vec.inputs['Y'])
    tex=n.new('ShaderNodeTexBrick');tex.inputs['Scale'].default_value=1;tex.inputs['Brick Width'].default_value=.215;tex.inputs['Row Height'].default_value=.066
    tex.inputs['Mortar Size'].default_value=.005;tex.inputs['Color1'].default_value=rgb('#946650');tex.inputs['Color2'].default_value=rgb('#705344');tex.inputs['Mortar'].default_value=rgb('#AC9C89')
    l.new(vec.outputs[0],tex.inputs['Vector']);l.new(tex.outputs['Color'],p.inputs['Base Color'])
    bump=n.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.3;bump.inputs['Distance'].default_value=.006;l.new(tex.outputs['Fac'],bump.inputs['Height']);l.new(bump.outputs[0],p.inputs['Normal'])
brick_shader(brick)

def box(name,loc,size,mat,col,bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.dimensions=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if mat:o.data.materials.append(mat)
    if bevel:
        mod=o.modifiers.new('Soft edges','BEVEL');mod.width=bevel;mod.segments=3
        mod=o.modifiers.new('Weighted corner normals','WEIGHTED_NORMAL')
    return move(o,col)
def span(name,x0,x1,y0,y1,z0,z1,mat,col,bevel=0):return box(name,((x0+x1)/2,(y0+y1)/2,(z0+z1)/2),(x1-x0,y1-y0,z1-z0),mat,col,bevel)
def cylinder(name,loc,radius,depth,mat,col,vertices=32):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius,depth=depth,location=loc);o=bpy.context.object;o.name=name;o.data.materials.append(mat);return move(o,col)
def rod(name,a,b,r,mat,col):
    a=Vector(a);b=Vector(b);o=cylinder(name,(a+b)/2,r,(b-a).length,mat,col,12);o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();return o
def text(name,body,loc,size,col,mat=accent,rotation=(0,0,0)):
    curve=bpy.data.curves.new(name,'FONT');curve.body=body;curve.size=size;curve.extrude=.0003
    o=bpy.data.objects.new(name,curve);col.objects.link(o);o.location=loc;o.rotation_euler=rotation;o.data.materials.append(mat);return o
def polyprism(name,pts,z,h,mat,col):
    # The original CAD consists of closed triangular wall fills and a few polygons.
    clean=[]
    for p in pts:
        if not clean or (Vector(p)-Vector(clean[-1])).length>1e-6:clean.append(p)
    if len(clean)>2 and (Vector(clean[0])-Vector(clean[-1])).length<1e-6:clean.pop()
    if len(clean)<3:return
    # Sub-millimetre inset prevents coincident CAD and reconstructed infill faces.
    cx=sum(p[0] for p in clean)/len(clean);cy=sum(p[1] for p in clean)/len(clean)
    clean=[(cx+(x-cx)*.9995,cy+(y-cy)*.9995) for x,y in clean]
    n=len(clean);verts=[(x,y,zz) for zz in (z+.0005,z+h-.0005-.00001*(int(name.rsplit(" ",1)[-1]) if "source masonry" in name else 0)) for x,y in clean]
    faces=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.materials.append(mat);mesh.materials.append(brick);mesh.update()
    o=bpy.data.objects.new(name,mesh);col.objects.link(o)
    for f in mesh.polygons:
        vs=[verts[i] for i in f.vertices]
        if all(abs(v[0])<.004 or abs(v[0]-W)<.004 for v in vs):f.material_index=1
    return o

floors=[];parts=[]
for name in ['00 | GROUND - 2021','01 | FIRST - 2021 + Camber 2025','02 | SECOND - archive reconstruction']:
    root=collection(name);floors.append(root)
    parts.append({key:collection(name.split(' |')[0]+' / '+key,root) for key in ['Slab','Walls left','Walls right','Walls front','Walls rear','Partitions','Joinery','Stair','Fittings','Furniture','Camber','Labels']})
levels=[0,F1,F2];heights=[2.22,2.66,2.80]
for i,key in [(0,'ground'),(1,'first')]:
    for j,pts in enumerate(DATA['floors'][key]['wall_polygons']):
        cx=sum(p[0] for p in pts)/len(pts);cy=sum(p[1] for p in pts)/len(pts)
        category='Walls left' if cx<.34 else 'Walls right' if cx>W-.45 else 'Walls front' if cy<.48 else 'Walls rear' if cy>D-.6 else 'Partitions'
        if i==1 and j in [10,11,12,13,91,92,97,98]:
            pts=[(x,8.640233333333+(y-8.640233333333)*(.44/(8.950325-8.640233333333))) for x,y in pts]
        polyprism(f'{key} / source masonry {j:03}',pts,levels[i],heights[i],plaster,parts[i][category])

def cut_hole(obj,x,y,r):
    bpy.ops.mesh.primitive_cylinder_add(vertices=64,radius=r,depth=2,location=(x,y,obj.location.z));cutter=bpy.context.object
    mod=obj.modifiers.new('Stair opening','BOOLEAN');mod.object=cutter;mod.operation='DIFFERENCE';mod.solver='EXACT'
    bpy.context.view_layer.objects.active=obj;bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cutter,do_unlink=True)
for i,depth in enumerate([D,D,9.0]):
    slab=span(f'{i} / floor slab',0,W,0,depth,levels[i]-.19,levels[i]-.012,plaster,parts[i]['Slab'])
    finish=span(f'{i} / floor finish',.30,W-.40,.30,depth-.28,levels[i]-.012,levels[i],floorwood if i else tile,parts[i]['Slab'])
    if i:
        cut_hole(slab,1.20,4.30,.96);cut_hole(finish,1.20,4.30,.96)

def wall_openings(name,x0,x1,y,thick,z,h,openings,col,mat=plaster):
    xs=sorted(set([x0,x1]+[v for a,b,c,d in openings for v in (a,b)]));zs=sorted(set([z,z+h]+[v for a,b,c,d in openings for v in (c,d)]))
    for a,b in zip(xs,xs[1:]):
        for c,d in zip(zs,zs[1:]):
            if b-a<.005 or d-c<.005:continue
            cx=(a+b)/2;cz=(c+d)/2
            if not any(aa<cx<bb and cc<cz<dd for aa,bb,cc,dd in openings):
                o=span(name,a,b,y-thick/2,y+thick/2,c,d,mat,col)
                if mat==plaster:
                    o.data.materials.append(brick)
                    for face in o.data.polygons:
                        if (y<1 and face.normal.y<-.9) or (y>8 and face.normal.y>.9):face.material_index=1
def window(name,x0,x1,y,z0,z1,col,divisions=2,door=False,ratios=None):
    fw=.045;frame=.09
    for x in (x0,x1):span(name+' jamb',x-fw/2,x+fw/2,y-frame/2,y+frame/2,z0,z1,metal,col,.007)
    for z in (z0,z1):span(name+' rail',x0,x1,y-frame/2,y+frame/2,z-fw/2,z+fw/2,metal,col,.006)
    for k in range(divisions):
        a=x0+(x1-x0)*(ratios[k] if ratios else k/divisions);b=x0+(x1-x0)*(ratios[k+1] if ratios else (k+1)/divisions)
        span(name+' glass',a+.025,b-.025,y-.006,y+.006,z0+.035,z1-.035,glass,col)
        if k:span(name+' mullion',a-.022,a+.022,y-.05,y+.05,z0,z1,metal,col,.006)
    if not door:span(name+' sill',x0-.06,x1+.06,y-.13,y+.13,z0-.055,z0-.02,stone,col,.005)
def door(name,x,y,z,width,col,angle=0):
    obj=box(name,(x,y,z+1.015),(width,.045,2.03),white,col,.007);obj.rotation_euler.z=angle
    return obj

# Front facade: archive rhythm, current lower-storey structure.
front_open=[[(.77,2.19,0,2.01),(3.29,6.74,-.10,2.00)],[(.90,6.81,F1,F1+2.34)],[(.92,2.67,F2+.90,F2+2.38),(3.10,6.62,F2+.90,F2+2.38)]]
for i in range(3):
    wall_openings(f'{i} / front infill',0,W,.14,.28,levels[i],heights[i],front_open[i],parts[i]['Walls front'])
    for j,(a,b,c,d) in enumerate(front_open[i]):
        if i==0 and j==1:
            span('Garage / bicycle room door',a,b,.08,.16,-.1,2.0,metal,parts[i]['Walls front'],.01)
            for zz in [.3,.65,1,1.35,1.7]:span('Garage door joint',a+.03,b-.03,.065,.077,zz,zz+.012,dark,parts[i]['Walls front'])
        else:window(f'{i} front {j}',a,b,.12,c,d,parts[i]['Walls front'],3 if b-a>3 else 2,i==0)
    span('Front floor band',0,W,-.03,.17,levels[i]+heights[i],levels[i]+heights[i]+.12,stone,parts[i]['Walls front'])
# Rear extensions, doors and upper facade.
wall_openings('Laundry rear',0,2.92,D-.14,.28,0,2.22,[(.96,2.50,1.62,2.0)],parts[0]['Walls rear'])
window('Laundry window',.96,2.5,D-.13,1.62,2.0,parts[0]['Walls rear'])
wall_openings('Bedroom terrace wall',2.94,W-.3,8.70,.18,0,2.22,[(3.48,5.90,0,2.04)],parts[0]['Partitions'])
window('Bedroom terrace doors',3.48,5.90,8.70,.02,2.04,parts[0]['Joinery'],2,True)
wall_openings('Kitchen rear',0,2.94,D-.14,.28,F1,2.66,[(.96,2.51,F1+.91,F1+2.12)],parts[1]['Walls rear'])
window('Kitchen rear window',.96,2.51,D-.12,F1+.91,F1+2.12,parts[1]['Walls rear'],2,ratios=[0,.28,1])
window('Veranda garden glazing',3.00,W-.40,D-.10,F1+.02,4.65,parts[1]['Walls rear'],3,True)
# Living and veranda form one room: no glazing or frame in this opening.
span('Living veranda retained structural beam',2.96,W-.4,8.640233333333,9.055233333333,F1+2.22,F1+2.66,plaster,parts[1]['Partitions'])

# New ground-floor room partitions, doors and finishes.
g=parts[0]
span('Ground shower / garage partition',2.99,6.94,3.83,3.94,0,2.15,plaster,g['Partitions'])
wall_openings('Bedroom partition',2.99,6.94,5.75,.12,0,2.15,[(3.60,4.40,0,2.03)],g['Partitions'])
span('Shower / dressing partition',5.05,5.15,3.94,5.75,0,2.15,plaster,g['Partitions'])
door('Bedroom internal door',4.00,5.75,0,.8,g['Joinery'])
door('Shower internal door',3.34,4.03,0,.73,g['Joinery'],math.pi/2)
door('Dressing door',5.82,5.73,0,.75,g['Joinery'])

# Upper-floor archive layout. The separate storage room remains BERGING; bathroom WC is added from photos.
u=parts[2];ud=9.0
span('Upper party wall left',0,.28,.281,ud-.281,F2,F2+2.8,plaster,u['Walls left'])
span('Upper party wall right',W-.28,W,.281,ud-.281,F2,F2+2.8,plaster,u['Walls right'])
wall_openings('Upper rear facade',0,W,ud-.14,.28,F2,2.80,[(.90,2.65,F2+1.85,F2+2.40),(3.15,6.45,F2+.65,F2+2.25)],u['Walls rear'])
window('Bathroom rear window',.90,2.65,ud-.11,F2+1.85,F2+2.40,u['Walls rear'])
window('Bedroom 2 rear window',3.15,6.45,ud-.11,F2+.65,F2+2.25,u['Walls rear'],3)
# Long dividing wall with two bedroom doors.
for a,b in [(.28,3.38),(4.20,5.10),(5.92,8.72)]:span('Upper hallway divider',2.78,2.92,a,b,F2,F2+2.8,plaster,u['Partitions'])
for yy in [3.79,5.51]:
    span('Upper door lintel',2.78,2.92,yy-.41,yy+.41,F2+2.05,F2+2.8,plaster,u['Partitions'])
    door('Upper bedroom door',2.84,yy,F2,.78,u['Joinery'],math.pi/2)
wall_openings('Bedroom 3 partition',.28,2.78,3.29,.10,F2,2.8,[(1.83,2.68,F2,F2+2.05)],u['Partitions'])
door('Bedroom 3 door',2.25,3.29,F2,.8,u['Joinery'])
span('Bedroom 1 / 2 dividing wall',2.92,W-.28,4.98,5.12,F2,F2+2.8,plaster,u['Partitions'])
# The historical 60 cm strip is represented by shallow storage, not asserted masonry.
span('Archive 60 cm zone - indicative storage',3.05,W-.40,4.42,4.98,F2,F2+2.35,white,u['Furniture'])
wall_openings('Bathroom partition',.28,2.78,6.49,.10,F2,2.8,[(1.85,2.69,F2,F2+2.05)],u['Partitions'])
span('Berging side',1.80,1.91,5.24,6.49,F2,F2+2.8,plaster,u['Partitions'])
span('Berging rear / duct wall',.28,1.91,6.35,6.49,F2,F2+2.8,plaster,u['Partitions'])
wall_openings('Berging front',.28,1.91,5.25,.10,F2,2.8,[(1.02,1.78,F2,F2+2.05)],u['Partitions'])
door('Berging door - NOT WC',1.40,5.25,F2,.72,u['Joinery'])
for z in [.4,.8,1.2,1.6,2.0]:span('Berging storage shelf',.36,.80,5.42,6.25,F2+z,F2+z+.025,oak,u['Fittings'])

def stair(col,z0,z1):
    cx,cy=1.20,4.30;n=round((z1-z0)/.175);rise=(z1-z0)/n
    cylinder('Spiral stair central post',(cx,cy,(z0+z1)/2),.055,z1-z0+.04,dark,col)
    for i in range(n):
        a=-math.pi/2+i*2*math.pi/n;b=a+2*math.pi/n*.94
        pts=[(cx+.08*math.cos(a),cy+.08*math.sin(a))]+[(cx+.86*math.cos(a+(b-a)*k/8),cy+.86*math.sin(a+(b-a)*k/8)) for k in range(9)]+[(cx+.08*math.cos(b),cy+.08*math.sin(b))]
        zz=z0+(i+1)*rise;polyprism('Spiral oak tread',pts,zz-.045,.045,oak,col)
        xx=cx+.82*math.cos((a+b)/2);yy=cy+.82*math.sin((a+b)/2);rod('Stair baluster',(xx,yy,zz),(xx,yy,zz+.92),.009,dark,col)
    curve=bpy.data.curves.new('Spiral handrail','CURVE');curve.dimensions='3D';curve.bevel_depth=.024;curve.bevel_resolution=3
    sp=curve.splines.new('POLY');sp.points.add(n*6)
    for j,p in enumerate(sp.points):
        t=j/(n*6);a=-math.pi/2+t*2*math.pi;p.co=(cx+.82*math.cos(a),cy+.82*math.sin(a),z0+rise+t*(z1-z0-rise)+.92,1)
    ob=bpy.data.objects.new('Spiral handrail',curve);col.objects.link(ob);curve.materials.append(dark)
stair(parts[0]['Stair'],0,F1);stair(parts[1]['Stair'],F1,F2)

def toilet(col,x,y,z):
    box('WC cistern',(x,y+.20,z+.65),(.38,.18,.68),ceramic,col,.06)
    box('WC pedestal',(x,y-.02,z+.20),(.25,.35,.4),ceramic,col,.09)
    bowl=box('WC bowl',(x,y-.10,z+.40),(.38,.56,.18),ceramic,col,.14)
    box('WC seat',(x,y-.13,z+.5),(.36,.48,.04),white,col,.10)
def basin(col,x,y,z,w=.65):
    box('Vanity',(x,y,z+.40),(w,.48,.75),oak,col,.012)
    box('Basin',(x,y,z+.82),(w+.015,.49,.12),ceramic,col,.05)
    rod('Tap',(x,y+.15,z+.85),(x,y+.15,z+1.07),.018,metal,col)
def bed(col,x,y,z,w=1.6,l=2):
    box('Bed base - indicative',(x,y,z+.21),(w,l,.34),oak,col,.035)
    box('Mattress',(x,y,z+.48),(w-.04,l-.03,.25),fabric,col,.09)
    box('Headboard',(x,y+l/2-.03,z+.69),(w+.06,.1,1.22),fabric,col,.025)
    for xx in [x-w*.24,x+w*.24]:box('Pillow',(xx,y+l*.31,z+.66),(w*.42,.42,.14),ceramic,col,.10)
    box('Folded blanket',(x,y-l*.22,z+.635),(w-.06,l*.43,.045),chairmat,col,.015)
toilet(parts[1]['Fittings'],1.0,5.83,F1);basin(parts[1]['Fittings'],2.31,6.05,F1,.38)
toilet(g['Fittings'],4.56,4.34,0);basin(g['Fittings'],3.5,4.41,0,.62)
span('Shower tray',3.05,3.98,4.8,5.70,0,.055,ceramic,g['Fittings'],.01)
span('Shower glass',3.99,4.003,4.8,5.70,.055,2.05,glass,g['Fittings'])
bed(g['Furniture'],5.20,7.10,0,1.6,2)
for z in [.15,.65,1.15,1.65]:span('Dressing shelves',6.35,6.91,4.04,5.57,z,z+.026,oak,g['Fittings'])
for x in [.80,1.46]:
    box('Laundry appliance',(x,10.18,.43),(.60,.62,.86),white,g['Fittings'],.025)
    o=cylinder('Appliance circular door',(x,9.86,.46),.19,.035,dark,g['Fittings']);o.rotation_euler.x=math.pi/2
bed(u['Furniture'],5.30,2.05,F2,1.8,2);bed(u['Furniture'],5.36,7.06,F2,1.6,2);bed(u['Furniture'],1.45,1.61,F2,1.0,2)
box('Upper bathtub',( .83,7.6,F2+.29),(.78,1.75,.57),ceramic,u['Fittings'],.13)
basin(u['Fittings'],1.85,8.28,F2,.65);basin(u['Fittings'],2.53,8.28,F2,.55)
for z in [.55,1.10,1.65,2.15]:span('Bedroom storage shelf',6.65,7.01,.45,2.95,F2+z,F2+z+.025,oak,u['Furniture'])

# Kitchen reconstructed from the two user-supplied kitchen perspectives.
k=parts[1]['Fittings']
span('Kitchen floor finish - continuous with living',.31,2.80,6.64,10.65,F1+.001,F1+.008,floorwood,k)
quartz=material('Kitchen - pale warm speckled stone','#C9C9BD',.63)
grain(quartz,'#B9BAB0','#DDDDD3',(95,95,95))
handle=material('Kitchen - champagne handles','#B3A582',.3,.65)
# Long cabinet run and return, with an oven directly below the hob.
for j in range(5):
    a=6.70+j*.64;b=a+.633
    span('Kitchen base carcass',.33,.94,a,b,F1+.10,F1+.865,white,k,.004)
    if j==1:
        span('Kitchen oven black front',.944,.96,a+.025,b-.025,F1+.18,F1+.79,screen,k,.008)
        rod('Kitchen oven handle',(.978,a+.10,F1+.73),(.978,b-.10,F1+.73),.009,metal,k)
        span('Kitchen oven control strip',.946,.969,a+.025,b-.025,F1+.79,F1+.855,dark,k)
    else:
        span('Kitchen base door',.943,.964,a+.006,b-.006,F1+.15,F1+.856,white,k,.003)
        rod('Kitchen base handle',(.982,a+.05,F1+.51),(.982,a+.05,F1+.79),.005,handle,k)
span('Kitchen long plinth',.38,.90,6.70,9.90,F1,F1+.10,white,k)
span('Kitchen long stone worktop',.31,1.00,6.67,9.93,F1+.865,F1+.91,quartz,k,.009)
for a,b in [(.96,1.55),(1.56,2.17)]:
    span('Kitchen sink base',a,b,6.68,7.27,F1+.10,F1+.865,white,k,.004)
    span('Kitchen sink cabinet door',a+.005,b-.005,7.27,7.29,F1+.15,F1+.855,white,k,.003)
    rod('Kitchen return handle',(b-.05,7.307,F1+.53),(b-.05,7.307,F1+.8),.005,handle,k)
work=span('Kitchen return stone worktop',.97,2.18,6.66,7.31,F1+.865,F1+.91,quartz,k,.007)
# Recessed sink instead of a solid metal block on the worktop.
cutter=box('Sink opening cutter',(1.60,6.99,F1+.90),(.57,.39,.30),None,k,.04)
bpy.context.view_layer.objects.active=cutter;bpy.ops.object.modifier_apply(modifier=cutter.modifiers[0].name)
mod=work.modifiers.new('Sink cutout','BOOLEAN');mod.object=cutter;mod.operation='DIFFERENCE';bpy.context.view_layer.objects.active=work;bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cutter,do_unlink=True)
span('Sink recessed bowl bottom',1.32,1.88,6.80,7.18,F1+.75,F1+.765,metal,k,.025)
for a,b in [(1.315,1.33),(1.87,1.885)]:span('Sink bowl side',a,b,6.80,7.18,F1+.755,F1+.90,metal,k)
for a,b in [(6.795,6.81),(7.17,7.185)]:span('Sink bowl end',1.32,1.88,a,b,F1+.755,F1+.90,metal,k)
rod('Kitchen mixer upright',(1.6,6.72,F1+.91),(1.6,6.72,F1+1.20),.014,metal,k)
rod('Kitchen mixer spout',(1.6,6.72,F1+1.20),(1.6,6.98,F1+1.20),.013,metal,k)
span('Kitchen black induction hob',.40,.91,7.39,7.96,F1+.912,F1+.919,screen,k,.006)
# Integrated refrigerator and ceiling-height upper cupboards.
span('Kitchen integrated refrigerator',2.18,2.78,6.68,7.29,F1+.04,F1+2.43,white,k,.006)
for a,b in [(.10,1.78),(1.79,2.42)]:span('Kitchen refrigerator door',2.185,2.775,7.291,7.314,F1+a,F1+b,white,k,.003)
rod('Kitchen refrigerator handle',(2.24,7.33,F1+1.12),(2.24,7.33,F1+1.57),.006,handle,k)
for j in range(5):
    a=6.70+j*.64;b=a+.634
    span('Kitchen long upper cabinet',.33,.69,a,b,F1+1.58,F1+2.43,white,k,.003)
    rod('Kitchen upper handle',(.71,a+.045,F1+1.61),(.71,a+.045,F1+1.95),.005,handle,k)
for a,b in [(.70,1.43),(1.44,2.17)]:
    span('Kitchen return upper cabinet',a,b,6.68,7.025,F1+1.58,F1+2.43,white,k,.003)
    rod('Kitchen return upper handle',(b-.045,7.044,F1+1.61),(b-.045,7.044,F1+1.95),.005,handle,k)
# Smooth closed outlines for the shaped table and continuous curved corner bench.
def smooth_outline(points,steps=10):
    result=[]
    for i in range(len(points)):
        a=Vector(points[(i-1)%len(points)]);b=Vector(points[i]);c=Vector(points[(i+1)%len(points)]);d=Vector(points[(i+2)%len(points)])
        for j in range(steps):
            t=j/steps;v=.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t);result.append(tuple(v))
    return result
outline=smooth_outline([(1.20,9.32),(1.43,9.08),(1.99,9.09),(2.26,9.38),(2.20,9.86),(1.92,10.07),(1.43,10.07),(1.22,9.93),(1.39,9.71)])
polyprism('Kitchen organic stone tabletop',outline,F1+.745,.05,quartz,k)
cylinder('Kitchen single white pedestal',(1.78,9.62,F1+.38),.105,.73,white,k,48)
# The bench turns along both window walls; its inward edge has a curved waist.
benchpts=[(1.00,10.65),(2.80,10.65),(2.80,8.97),(2.36,8.97),(2.34,9.27),(2.30,9.49),(2.16,9.72),(2.16,9.94),(1.00,10.16)]
# Round only the inner transition to retain straight edges along the walls.
curvepts=[]
for j in range(25):
    t=j/24;curvepts.append((2.34-.18*math.sin(t*math.pi/2),9.27+.67*t))
benchpts=[(1.00,10.65),(2.80,10.65),(2.80,8.97),(2.36,8.97)]+curvepts+[(1.00,10.16)]
polyprism('Kitchen shaped corner bench seat',benchpts,F1+.44,.045,white,k)
span('Kitchen bench rear support',1.02,2.77,10.48,10.62,F1,F1+.44,white,k)
span('Kitchen bench side support',2.63,2.77,9.0,10.5,F1,F1+.44,white,k)
span('Kitchen bench end support',2.37,2.78,8.999,9.04,F1,F1+.44,white,k)
import sys
sys.path.insert(0,str(ROOT))
from kitchen_bench_update import update_kitchen_bench
update_kitchen_bench()
from kitchen_reference_detail import refine_kitchen_reference
refine_kitchen_reference()
# Side opening is a window with masonry below, not a doorway.
span('Kitchen veranda window breast wall',2.812,3.109,9.13,9.92,F1+.001,F1+.93,plaster,parts[1]['Partitions'])
span('Kitchen veranda window lintel',2.812,3.109,9.13,9.92,F1+2.16,F1+2.659,plaster,parts[1]['Partitions'])
for yy in [9.15,9.90]:span('Kitchen veranda window jamb',2.95,3.02,yy-.02,yy+.02,F1+.93,F1+2.16,metal,k,.004)
for zz in [.93,2.16]:span('Kitchen veranda window rail',2.95,3.02,9.13,9.92,F1+zz-.02,F1+zz+.02,metal,k,.004)
span('Kitchen veranda window glass',2.981,2.993,9.17,9.88,F1+.95,F1+2.14,glass,k)
span('Kitchen veranda stone sill',2.76,3.14,9.10,9.95,F1+.90,F1+.93,quartz,k,.005)

exec((ROOT/'veranda_furniture.py').read_text())

# Camber cabinet corrected from the technical drawings and cabinet-only user renders.
c=parts[1]['Camber'];X=6.951;Y=.3006
from camber_drawing_rework import update_camber
camber_views=update_camber()

# Furniture from the last approved PDF: placeholder dimensions, editable objects.
f=parts[1]['Furniture'];left=X-6.620
tx=X-.530-.150-1.0;ty=Y+4.7
table=box('T / Dining table - estimated 260 x 100',(tx+.5,ty+1.30,F1+.76),(1,2.6,.065),wood,f,.20);table['dimensions_status']='Estimated from photos; not surveyed'
for yy in [ty+.55,ty+2.05]:
    rod('Table angled leg',(tx+.20,yy-.12,F1+.02),(tx+.73,yy+.10,F1+.73),.035,dark,f)
    rod('Table angled leg',(tx+.78,yy-.12,F1+.02),(tx+.25,yy+.10,F1+.73),.035,dark,f)
def dining_chair(x,y,angle):
    root=bpy.data.objects.new('Dining chair - indicative',None);f.objects.link(root);root.location=(x,y,F1);root.rotation_euler.z=angle
    for name,loc,size,mat0 in [('Seat',(0,0,.46),(.46,.45,.085),chairmat),('Back',(-.205,0,.73),(.065,.45,.52),chairmat)]:
        ob=box(name,loc,size,mat0,f,.04);ob.parent=root
    for xx in [-.16,.16]:
        for yy in [-.16,.16]:
            ob=rod('Chair leg',(xx,yy,.03),(xx,yy,.43),.015,dark,f);ob.parent=root
for yy in [ty+.43,ty+1.3,ty+2.17]:dining_chair(tx-.353,yy,0)
dining_chair(tx+.5,ty-.353,math.pi/2);dining_chair(tx+.5,ty+2.953,-math.pi/2)
def sofa(name,x,y,length,angle=0):
    root=bpy.data.objects.new(name,None);f.objects.link(root);root.location=(x,y,F1);root.rotation_euler.z=angle
    root['dimensions_status']='Indicative interpretation of photos';root['length_m']=length
    def part(n,loc,size,m,b):
        o=box(n,loc,size,m,f,b);o.parent=root;return o
    part(name+' base',(length/2,.5,.23),(length,1,.38),sofa_mat,.095)
    for xx in [.09,length-.09]:part(name+' arm',(xx,.5,.52),(.18,.93,.58),sofa_mat,.075)
    for i in range(3):
        sw=(length-.36)/3;xx=.18+(i+.5)*sw
        part(name+' seat cushion',(xx,.42,.49),(sw-.015,.69,.19),cushion,.07)
        part(name+' back cushion',(xx,.87,.81),(sw-.015,.24,.67),cushion,.075)
        part(name+' headrest',(xx,.91,1.13),(sw-.02,.29,.19),sofa_mat,.075)
    for xx in [.19,length-.19]:
        for yy in [.15,.85]:part(name+' foot',(xx,yy,.06),(.055,.055,.12),dark,.006)
sofa('Z1 / sofa - estimated 260 x 100',left+1.43,Y+2.35,2.6)
sofa('Z2 / sofa - estimated 230 x 100',left+.22+1,Y+.30,2.3,math.pi/2)

# Flat roof, parapets, sloping veranda glazing and rear access.
roofs=collection('03 | ROOFS - removable')
span('Main flat roof',0,W,0,9,8.11,ROOF,roofmat,roofs)
for a,b in [(0,.16),(W-.16,W)]:span('Roof side parapet',a,b,.181,8.819,ROOF,8.66,brick,roofs)
for a,b in [(0,.18),(8.82,9)]:span('Roof front / rear parapet',0,W,a,b,ROOF,8.56,brick,roofs)
span('Kitchen extension roof',0,2.98,9,D,5.07,5.31,roofmat,roofs)
span('Kitchen rear parapet',0,2.98,D-.16,D,5.31,5.61,brick,roofs)
verts=[(2.98,9,5.16),(W-.27,9,5.16),(W-.27,D,4.85),(2.98,D,4.85)]
mesh=bpy.data.meshes.new('Veranda glazed roof');mesh.from_pydata(verts,[],[(0,1,2,3)]);mesh.materials.append(glass)
o=bpy.data.objects.new('Veranda glazed roof',mesh);roofs.objects.link(o);mod=o.modifiers.new('Glass thickness','SOLIDIFY');mod.thickness=.012
for i in range(7):
    xx=2.98+(W-.27-2.98)*i/6;rod('Veranda roof glazing bar',(xx,9,5.16),(xx,D,4.85),.035,metal,roofs)
for yy,zz in [(9,5.16),(D,4.85)]:rod('Veranda roof rail',(2.98,yy,zz),(W-.27,yy,zz),.04,metal,roofs)
outside=collection('04 | SITE and rear stair - indicative extent')
span('Ground context',-2,W+2,-2,D+7,-.24,-.20,terrace,outside)
span('Garden context',-.2,W+.2,D+1,D+7,-.20,-.17,grass,outside)
span('Rear balcony',1.1,W-.4,D,D+.86,F1-.14,F1,stone,outside)
for xx in [1.13,W-.43]:rod('Balcony handrail',(xx,D,F1+1.02),(xx,D+.86,F1+1.02),.022,dark,outside)
rod('Balcony rear handrail',(2.12,D+.83,F1+1.02),(W-.43,D+.83,F1+1.02),.022,dark,outside)
for j in range(14):
    yy=D+.86+j*.245;zz=F1-(j+1)*F1/14
    span('Rear stair tread',1.1,2.10,yy,yy+.25,zz-.06,zz,stone,outside)
    for xx in [1.12,2.08]:rod('Rear stair baluster',(xx,yy+.12,zz),(xx,yy+.12,zz+.98),.012,dark,outside)
for xx in [1.12,2.08]:rod('Rear stair handrail',(xx,D+.98,F1-.172+.98),(xx,D+.86+13*.245+.12,.98),.022,dark,outside)
# Front first-floor guardrail as visible in the archive and photographs.
for xx in [.98,2.5,4.1,5.6,6.75]:rod('Front guardrail post',(xx,-.05,F1+.05),(xx,-.05,F1+1.02),.012,dark,parts[1]['Walls front'])
for zz in [F1+.48,F1+.99]:rod('Front guardrail rail',(.94,-.05,zz),(6.79,-.05,zz),.016,dark,parts[1]['Walls front'])

# Optional floor labels are hidden from beauty views but remain editable in the file.
for i,names in enumerate([[('Inkom',1.1,2.1),('Fietsenberging',4.7,2.3),('Douchecel',3.6,4.8),('Dressing',5.6,4.8),('Slaapkamer',4.6,7.7),('Wasplaats',1.1,8.8)], [('Leefruimte',3.5,4.1),('Keuken',1.0,8.5),('Veranda',4.6,9.8)], [('Slaapkamer 1',4.7,1.0),('Slaapkamer 2',4.7,6.0),('Slaapkamer 3',.6,.8),('Berging',.6,5.6),('Badkamer',.8,6.9)]]):
    for label,x,y in names:text(label,label,(x,y,levels[i]+.012),.13,parts[i]['Labels'])
    parts[i]['Labels'].hide_render=True

def camera(scene,name,location,target,ortho=None):
    data=bpy.data.cameras.new(name);obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);obj.location=location;obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()
    if ortho:data.type='ORTHO';data.ortho_scale=ortho
    else:data.lens=24
    data.clip_end=300;scene.camera=obj;return obj
def area(scene,name,loc,power,size,target,color=(1,.9,.8)):
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size;data.color=color
    obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);obj.location=loc;obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler();return obj
def setup(scene):
    scene.unit_settings.system='METRIC';scene.unit_settings.length_unit='METERS'
    scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True;scene.cycles.device='CPU'
    scene.render.resolution_x=1600;scene.render.resolution_y=1200;scene.render.resolution_percentage=100
    scene.world=bpy.data.worlds.new(scene.name+' world');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.58,.64,.68,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.45
    scene.view_settings.view_transform='AgX'
    area(scene,'Large soft daylight',(1,-3,16),2200,9,(W/2,5,3))
    area(scene,'Garden daylight',(5,15,12),1800,7,(4,6,3),(1,.97,.89))
    area(scene,'Soft fill',(-7,5,8),1500,8,(3,5,3),(.76,.86,1))
setup(base);camera(base,'Exterior camera',(-15,-20,16),(W/2,5.7,3.4),24)

cut=bpy.data.scenes.new('02 | FIRST FLOOR - furnished cutaway');setup(cut)
for key,col in parts[1].items():
    if key not in ['Walls left','Walls front','Labels']:cut.collection.children.link(col)
camera(cut,'First-floor cutaway camera',(-8,-7,15.5),(3.7,5.5,3.25),15.5)
cut.render.resolution_x=1800;cut.render.resolution_y=1500
area(cut,'Camber warm interior',(5.65,6.2,F1+2.35),90,2,(6.8,6.2,F1+.6),(1,.68,.38))

expl=bpy.data.scenes.new('03 | EXPLODED FLOORS');setup(expl)
for i in range(3):
    cc=bpy.data.collections.new(f'EXPLODED source {i} - cutaway')
    for key,col in parts[i].items():
        if key not in ['Walls left','Walls front','Labels']:cc.children.link(col)
    inst=bpy.data.objects.new(f'Exploded floor {i}',None);inst.instance_type='COLLECTION';inst.instance_collection=cc;inst.location=(i*.9,0,i*3.3);expl.collection.objects.link(inst)
    text(f'Level {i}', ['00  GROUND','01  FIRST + CAMBER','02  SECOND / BERGING'][i],(W+1+i*.9,1.5,levels[i]+i*3.3+.1),.32,expl.collection,accent,(math.pi/2,0,0))
camera(expl,'Exploded camera',(-20,-26,23),(4.0,5.4,7.0),28)
expl.render.resolution_x=1600;expl.render.resolution_y=1800

living=bpy.data.scenes.new('04 | LIVING - Camber perspective');setup(living)
for key,col in parts[1].items():
    if key not in ['Walls front','Labels','Stair']:living.collection.children.link(col)
camera(living,'Living perspective camera',(1.12,1.0,F1+1.65),(6.1,5.85,F1+1.30))
living.camera.data.lens=22;living.render.resolution_x=1800;living.render.resolution_y=1200
area(living,'Interior ceiling softbox',(3.7,5.0,F1+2.6),260,4,(5.4,5,F1),(1,.88,.73))

kitchen_views=[]
for scene_name,loc,target,file in [
    ('05 | KITCHEN - shaped table and bench',(2.02,7.43,F1+1.65),(1.63,10.05,F1+1.10),'kitchen_table_bench.png'),
    ('06 | KITCHEN - cabinets and appliances',(2.02,10.18,F1+1.64),(1.39,7.28,F1+1.30),'kitchen_cabinets.png')]:
    sc=bpy.data.scenes.new(scene_name);setup(sc)
    for key,col in parts[1].items():
        if key not in ['Labels','Stair']:sc.collection.children.link(col)
    camera(sc,scene_name+' camera',loc,target);sc.camera.data.lens=19
    sc.render.resolution_x=1600;sc.render.resolution_y=1200
    area(sc,'Kitchen ceiling soft light',(1.6,8.75,F1+2.35),120,2,(1.3,8.6,F1+.5),(1,.96,.90))
    ceilingcol=collection(scene_name+' ceiling')
    base.collection.children.unlink(ceilingcol);sc.collection.children.link(ceilingcol)
    span('Kitchen ceiling for interior view',.28,2.81,6.60,10.68,F1+2.44,F1+2.48,plaster,ceilingcol)
    kitchen_views.append((sc,file))

veranda=bpy.data.scenes.new('07 | LIVING + VERANDA - open room');setup(veranda)
for key,col in parts[1].items():
    if key not in ['Labels','Stair','Walls front']:veranda.collection.children.link(col)
vr=bpy.data.collections.new('Veranda roof for interior view');veranda.collection.children.link(vr)
for ob in roofs.objects:
    if ob.name.startswith('Veranda'):vr.objects.link(ob)
camera(veranda,'Open living veranda camera',(3.65,6.6,F1+1.65),(5.1,10.15,F1+1.24))
veranda.camera.data.lens=20;veranda.render.resolution_x=1600;veranda.render.resolution_y=1200
area(veranda,'Veranda soft interior',(4.5,8.0,F1+2.4),180,3,(5.0,9.2,F1+.5),(1,.95,.85))
kitchen_views.append((veranda,'living_veranda_open.png'))

# Shared photo-based correction also used for updating an existing .blend.
import sys
sys.path.insert(0,str(ROOT))
from living_office import update_living_office
office_view=update_living_office()
kitchen_views.append((office_view,'living_office.png'))
from stair_door import update_stair_door
stair_view=update_stair_door()
kitchen_views.append((stair_view,'stair_brick_door.png'))
from sofa_measured import update_measured_sofa
measured_view=update_measured_sofa()
kitchen_views.append((measured_view,'sofa_measured_plan.png'))
from stair_full_height import update_full_height_stair
full_stair_view=update_full_height_stair()
kitchen_views.append((full_stair_view,'stair_full_height.png'))
from upper_floor_corrected import update_upper_floor
upper_view=update_upper_floor()
kitchen_views.append((upper_view,'upper_floor_corrected.png'))
from upper_wall_finishes import update_upper_wall_finishes
update_upper_wall_finishes()
from ground_hall_photo import update_ground_hall
hall_view=update_ground_hall()
kitchen_views.append((hall_view,'ground_hall_photo.png'))
from laundry_photo import update_laundry_photo
laundry_views=update_laundry_photo()
kitchen_views.extend(zip(laundry_views,['laundry_photo.png','laundry_utility.png']))
from ground_room_doors import update_ground_room_doors
door_view=update_ground_room_doors()
kitchen_views.append((door_view,'ground_room_doors.png'))
from ground_bathroom_photo import update_ground_bathroom_photo
ground_bathroom_views=update_ground_bathroom_photo()
kitchen_views.extend(zip(ground_bathroom_views,['ground_bathroom_photo.png','ground_bathroom_overhead.png','ground_bathroom_door.png']))
from ground_openings_correction import update_ground_openings
ground_openings_view=update_ground_openings()
kitchen_views.append((ground_openings_view,'ground_closed_wall_open_dressing.png'))
from bathroom_photo import update_bathroom_photo
bathroom_views=update_bathroom_photo()
kitchen_views.extend(zip(bathroom_views,['bathroom_vanity.png','bathroom_niche_wc.png','bathroom_overhead.png','bathroom_radiator.png']))
from upper_reference_doors import update_upper_reference_doors
upper_door_view=update_upper_reference_doors()
kitchen_views.append((upper_door_view,'upper_doors_pale_oak_reference.png'))
from small_bedroom_photo import update_small_bedroom
small_bedroom_views=update_small_bedroom()
kitchen_views.extend(zip(small_bedroom_views,['small_bedroom_view.png','small_bedroom_seating.png','small_bedroom_overhead.png']))
kitchen_views.append((bpy.data.scenes['34 | SMALL BEDROOM - reference bear detail'],'small_bedroom_bear_detail.png'))
from bedroom2_photo import update_bedroom2
bedroom2_views=update_bedroom2()
kitchen_views.extend(zip(bedroom2_views,['bedroom2_view.png','bedroom2_storage.png','bedroom2_overhead.png','bedroom2_door_clearance.png']))
from bedroom1_split import update_bedroom1
bedroom1_views=update_bedroom1()
kitchen_views.extend(zip(bedroom1_views,['bedroom1_tent.png','bedroom1_divider.png','bedroom1_smastad.png','bedroom1_overhead.png']))
kitchen_views.append((bpy.data.scenes['35 | SLAAPKAMER 1 - pink dragon detail'],'bedroom1_dragon_detail.png'))
from bedroom1_dollhouse import update_bedroom1_dollhouse
bedroom1_dollhouse_view=update_bedroom1_dollhouse()
kitchen_views.append((bedroom1_dollhouse_view,'bedroom1_dollhouse.png'))
from bedroom1_entry_corner import update_bedroom1_entry_corner
bedroom1_corner_views=update_bedroom1_entry_corner()
kitchen_views.extend(zip(bedroom1_corner_views,['bedroom1_entry_corner.png','bedroom1_seating_corner.png','bedroom1_corner_plan.png']))
from stair_roof_dome import update_stair_roof_dome
stair_dome_views=update_stair_roof_dome()
kitchen_views.extend(zip(stair_dome_views,['stair_roof_dome_inside.png','stair_roof_dome_outside.png']))
from kitchen_brave_green import update_kitchen_brave_green
update_kitchen_brave_green()
from living_botanical_green import update_living_botanical_green
living_botanical_view=update_living_botanical_green()
kitchen_views.append((living_botanical_view,'living_botanical_green.png'))
from living_coffee_table import update_living_coffee_table
living_coffee_table_view=update_living_coffee_table()
kitchen_views.append((living_coffee_table_view,'living_coffee_table.png'))
kitchen_views.append((bpy.data.scenes['55 | LIVING - sofa and table clearances'],'living_seating_plan.png'))
from stair_brick_mapping import update_stair_brick_mapping
update_stair_brick_mapping()
from stair_flat_wall_white import update_stair_flat_wall_white
stair_white_wall_view=update_stair_flat_wall_white()
kitchen_views.append((stair_white_wall_view,'stair_white_flat_wall.png'))
from ground_bedroom_refinement import update_ground_bedroom_refinement
ground_bedroom_views=update_ground_bedroom_refinement()
kitchen_views.extend(zip(ground_bedroom_views,['ground_bedroom_rotated_bed.png','ground_bedroom_white_door.png']))
from ground_straight_door_layout import update_ground_straight_door_layout
ground_straight_views=update_ground_straight_door_layout()
kitchen_views.extend(zip(ground_straight_views,['ground_straight_door_layout_overview.png','ground_straight_door_layout_eye.png']))
from entrance_door_photo import update_entrance_door
entrance_views=update_entrance_door()
kitchen_views.extend(zip(entrance_views,['entrance_door_inside.png','entrance_door_outside.png']))
from stair_reference_rework import update_reference_stair
reference_stair_views=update_reference_stair()
kitchen_views.extend(zip(reference_stair_views,['stair_reference_first_landing.png','stair_reference_upper_landing.png','stair_reference_complete.png']))
from front_exterior_photo import update_front_exterior
front_photo_views=update_front_exterior()
kitchen_views.append((front_photo_views[0],'front_exterior_photo.png'))
from rear_terrace_photo import update_rear_terrace
rear_photo_views=update_rear_terrace()
kitchen_views.extend(zip(rear_photo_views,['rear_exterior_photo.png','rear_stair_detail.png','terrace_laundry_door.png']))
from garden_photo import update_garden
garden_views=update_garden()
kitchen_views.extend(zip(camber_views,['camber_corrected_front.png','camber_corrected_perspective.png']))
kitchen_views.extend(zip(garden_views,['garden_overview.png','side_garden_photo.png','rear_garden_photo.png','garden_open_curved_front.png','driveway_restored.png','garden_aerial_layout.png']))

notes='''OUDE TERELSTSTRAAT 15 - EDITABLE CONCEPT MODEL\n\nUnits: metres. Origin: front-left outer corner, ground floor finished level 0.\n2021 floor vectors establish width 7.381 m and depth 10.960 m.\nLevels: GF 0; first +2.41; second +5.31 (inferred: 2.41 + 2.66 clear + .24 slab); roof +8.31.\nGround/first existing masonry traced directly from filled CAD wall polygons. New ground partitions, opening heights, roof connections and stair details are simplified.\nSecond floor uses the archive arrangement fitted to the common building width. It is NOT a new survey. The 60 cm archive zone is indicative storage.\nIMPORTANT: the room beside the second-floor stair is BERGING (storage); the bathroom includes a WC confirmed by user photos; the separate storage room is not a WC.\nCamber 02.05.2025: 8.297 m overall, height 2.579 m, lower units .489 m. Right wall, TV towards street, bench towards veranda. End fitting closes the veranda connection. Detailed carcass construction is schematic, not a workshop specification.\nDining table 2.60 x 1.00; sofas 2.60 x 1.00 and 2.30 x 1.00: estimated photo-based furniture sizes/placement. Other bedroom and sanitary furnishings are illustrative.\nFacade front is based on the archive, rear on 2021 elevations. Glass roof and external stair connections are interpretive. Garden extent is context only.\n\nSCENES\n01 HOUSE: assembled exterior\n02 FIRST FLOOR: cutaway without front/left wall and upper storeys\n03 EXPLODED FLOORS: collection instances; edits propagate\n04 LIVING: furnished first-floor perspective\n\nKitchen revised from user reference images: L-shaped pale stone worktop, integrated fridge, oven under hob, ceiling-height upper cupboards, organic pedestal table and shaped corner bench. Side window sill 0.93 m and opening height 1.23 m from section. Kitchen furniture dimensions estimated. Scenes 05 and 06 show both kitchen directions.\nUser-confirmed living/veranda beam: height 0.44 m, depth 0.415 m; adjoining transverse wall/piers depth 0.44 m. Beam top stays at existing model ceiling +2.66 m above first floor; underside +2.22 m. Front plane retained.\nLiving and veranda now form one open room, per user photo: interior sliding glazing removed; structural beam and piers retained. White shelving and low play table follow user sketch: cabinet 76 x 39 x 181 cm, 68.5 cm wide upper opening, six 33 cm square cubbies; table 118 x 57 x 51 cm, apron 21 cm. Four lower satin metal bins have round pull holes; hole diameter estimated at 36 mm. Cabinet right side is against the right wall and table right side aligns with cabinet left side. Scene 07 shows this area.\nAll materials are procedural. Objects and collections are individually editable. No external textures required.\n'''
notes += '\nLIVING/OFFICE PHOTO UPDATE: L-shaped sofa arrangement faces the Camber TV; two mirrored MICKE 502.507.13 desks (100 x 100 x 142 cm) and a printer shelving workstation occupy the left street-side wall. Warm buff brick and dark mortar follow user photographs. Sofa placement and printer shelf dimensions estimated. Scene 08 shows this area.\n'
notes += '\nSTAIR PHOTO UPDATE: brick finish wraps the curved stair return, door wall, lintel and exposed end. Flush ivory door, matching flat casing, left hinges and nickel lever/key hardware. Opening width from plan, heights/details estimated from photograph. Scene 09.\n'
notes += '\nUSER-CORRECTED SOFA: overall L footprint 2.65 m towards TV and 2.35 m towards veranda; shared corner counted once. Nearest sofa end 83 cm from low TV drawer-front plane and 64 cm from inner window frame. Depth 1 m, seat height 45 cm and total height 98 cm remain photo estimates. Supersedes 250 x 227 cm and 79 cm TV gap; scenes 10 and 55.\n'
notes += '\nFULL HEIGHT STAIR HALL: continuous reference brick on stair-hall walls from ground floor through upper landing, elevation 0.00 to 8.11 m; inter-storey wall bands and circular slab reveals included. Scene 11.\n'
notes += '\nUPPER FLOOR REVIEW: restored curved stair surround; storage doorway moved from stair-facing wall to landing SIDE wall per archive. Missing bathroom door added. Entire upper floor retained, scene 12. PDF uses exported Blender wall geometry.\n'
notes += '\nUPPER WALL FINISH CORRECTION: White transverse walls stop at the bathroom doorway wall. The landing wall with both bedroom doors and their lintels is also white plaster. Storage walls and the entire curved stair surround retain brick.\n'
notes += '\nBATHROOM PHOTO UPDATE: scenes 17-19, editable fitted bathroom with bath, twin basins, mirror cabinet, tall cabinet, niche and WC. Former rear window closed, confirmed by user. Dimensions estimated; see BATHROOM - photo reconstruction notes.\n'
notes += '\nSLAAPKAMER 2 PHOTO UPDATE: scenes 24-27; light oak double bed with equal 49 cm bedside units. Cabinet block moved toward door for about 2 cm clearance; large wardrobe shortened at bed end to 205 cm width, clearing bedside top by 3.1 cm. Adjacent cabinet 75 cm wide. Closed cupboards and empty storage, navy bed wall and blue-grey other walls. Full 0-90 degree entry door and handle sweep checked; inspection scene 27. Furniture dimensions estimated. See SLAAPKAMER 2 notes.\n'
notes += '\nUPPER DOOR REFERENCE UPDATE: all five internal doors on the highest floor use a pale greige horizontal-oak finish, matching flat casing, narrow charcoal shadow gap, satin nickel lever, dark round key escutcheon and three visible hinges. User photo reference; scene 20.\n'
notes += '\nSMALL BEDROOM PHOTO UPDATE: scenes 21-23; smallest bedroom furnished from six user photos. Existing 2.50 x 2.96 m footprint retained. Furniture dimensions estimated; KALLAX-family shelf proportions; see SMALL BEDROOM notes.\n'
notes += '\nSLAAPKAMER 1 SKETCH CORRECTION: user sketch of 24 September 21:17 supersedes the previous parallel layout. Tent bed along green wall, SMÅSTAD rotated perpendicular and projecting from the same wall; attached cubby divider stops with the loft. Closed cupboard and empty dollhouse stand opposite, with a checked 80 cm connection around the free divider end. Scene 31 uses the sketch orientation and labels. Other furniture sizes remain estimates. Scenes 28-31; bedroom1_split.py; BEDROOM1_NOTES.txt.\n'
notes += '\nSTAIR ROOF DOME: user photo confirms a round skylight at the top of the brick stair hall. Genuine circular roof opening, broad white tapered curb, transparent shallow curved cap and taupe ceiling surround. Estimated clear diameter 121 cm, white lower rim 164 cm, apex +8.691 m; centre x 1.24, y 4.25 m. Roof opening verified. Scenes 32-33; stair_roof_dome.py; STAIR_DOME_NOTES.txt.\n'
notes += '\nKITCHEN BRAVE GREEN: Colora / BOSS paints WE M198 wall paint. Official page RGB #74846D converted from sRGB to linear material colour. Paint restricted to kitchen interior masonry; cabinets and terrazzo retained. Separate beige/white backsplash beneath upper cabinets on both runs. Scenes 05-06; kitchen_brave_green.py; KITCHEN_BRAVE_GREEN_NOTES.txt.\n'
notes += '\nLIVING TV ACCENT WALL: Colora / BOSS paints WE M187 Botanical Green. Official page RGB #445940 converted from sRGB to linear material colour. Paint restricted to the wall segment behind the TV, from the street side to the start of the tall Camber return. Cabinet and other living walls unchanged. Scene 53; living_botanical_green.py; LIVING_BOTANICAL_GREEN_NOTES.txt.\n'
notes += '\nLIVING PHOTO REFINEMENT: 17 photos supersede initial table. Flat oak-look top and base, four tapered splayed legs, white panels, open compartment beside drawer. User table height 33 cm; width/depth estimated 90 x 90 cm; chosen 35 cm gap to both inner sofa fronts. Corrected user sofa footprint 265 x 235 cm, TV gap 83 cm, window gap 64 cm; estimated seat height 45 cm and total height 98 cm replace oversized earlier model. Scenes 54-55; sofa_measured.py; living_coffee_table.py; LIVING_COFFEE_TABLE_NOTES.txt.\n'
notes += '\nSTAIR BRICK MAPPING: fixed planar world-axis projection that stretched brickwork on curved surfaces. Curved stair walls and circular slab reveals now use metric arc-length UVs, with world-height courses; flat returns use correct planar axes. Existing 22.5 x 6.3 cm brick module retained. Checked UV scale against actual surface edges. stair_brick_mapping.py; STAIR_BRICK_MAPPING_NOTES.txt.\n'
notes += '\nREAR PHOTO UPDATE: scenes 42-44; smooth orange-red rear masonry, revised veranda and windows, fourteen-rise curved/straight stone exterior stair with stainless horizontal railing, tiled terrace, dining table and six chairs, black laundry side door. All three existing second-floor exterior window openings now have roller shutters. Former bathroom opening stays closed. See REAR_TERRACE_NOTES.txt for estimates and details.\n'
notes += '\nGARDEN PHOTO UPDATE: right side garden looking from the street and rear lawn connected to the existing terrace. Fences, gates, hedges, trees, playhouse, two swings, trampoline, picnic bench and sandbox. No cars; garden dimensions estimated. Scenes 45-47; GARDEN_PHOTO_NOTES.txt.\n'
notes += '\nGROUND-FLOOR BATHROOM — PHOTO + PLAN UPDATE: detailed 1.80 x 1.62 m douchecel with 90 x 90 cm corner shower, wall-hung WC, floating oak vanity, vessel basin, mirror cabinet and towel radiator. Real framed 80 cm door opening with operable leaf, privacy hardware and user-adjustable Open angle; default 72 degrees into bedroom as drawn. Four photos and plan crop supplied 2026-09-28; unsupplied fixture dimensions estimated. Scenes 56-58; ground_bathroom_photo.py; GROUND_BATHROOM_NOTES.txt.\n'
notes += '\nSTAIR WALL FINISH CORRECTION: straight first-floor stair-door wall and lintel changed from brick to white plaster per user markup 2026-09-28. Curved stair enclosure remains brick. stair_flat_wall_white.py; STAIR_FLAT_WALL_WHITE_NOTES.txt.\n'
notes += '\nSLAAPKAMER 1 DOLLHOUSE: the shelf-like proxy beside the white cupboard is a photographed four-storey open dollhouse, now detailed with pitched roof, peach timber frame, white/pastel rooms, pink balcony rails and representative miniature furniture. Existing footprint and circulation retained. Scene 59; bedroom1_dollhouse.py; BEDROOM1_DOLLHOUSE_NOTES.txt.\n'
notes += '\nSLAAPKAMER 1 ENTRY CORNER: seven new detail photos supersede the earlier cupboard/dollhouse layout. Dollhouse directly right of entry, perpendicular single-door white wardrobe with three knobbed drawers, horse-photo cupboard, blue corduroy beanbag armchair and separate ottoman, three-drawer wire-mesh steel cabinet and oak mirror. Three dollhouse play levels and low gable. Sizes/placement estimated from photos; scenes 60–62; bedroom1_entry_corner.py.\n'
notes += '\nGROUND CIRCULATION CORRECTION: laundry/bedroom separating wall is continuous, no opening at y 7.04–7.89. Dressing has an 85 cm open passage without door or frame. Hall entrances and bathroom door retained. Scene 63; ground_openings_correction.py.\n'
notes += '\nGROUND BEDROOM REFINEMENT: bed rotated 90 degrees with headboard against the solid wall opposite the entrance; framed single-leaf hall door corrected, handle moved away from adjacent laundry door, former solid reveal plane removed. Hall-side straight wall and lintel finished white. Scenes 64–65; ground_bedroom_refinement.py.\n'
notes += '\nGROUND STRAIGHT DOOR LAYOUT: rejected alcove removed. Original rectangular layout retained; entire laundry front wall shifted 38.5 cm, bedroom rough opening narrowed to 65 cm (58 cm clear). Freezer and vessel shifted 10.5 cm; major appliances and bathroom wall unchanged. Full 0–90 degree bedroom door swing checked. Scenes 66–67; ground_straight_door_layout.py.\n'
bpy.data.texts.new('START HERE - model assumptions').write(notes)
(ROOT/'MODEL_NOTES.txt').write_text(notes)
for obj in bpy.data.objects:
    if obj.type=='MESH':
        obj['model_status']='Concept reconstruction; see START HERE notes'
        bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free()
for scene in bpy.data.scenes:scene.render.image_settings.file_format='PNG'
bpy.context.window.scene=cut
for screen0 in bpy.data.screens:
    for area0 in screen0.areas:
        if area0.type=='VIEW_3D':
            area0.spaces.active.region_3d.view_perspective='CAMERA';area0.spaces.active.shading.type='RENDERED';area0.spaces.active.overlay.show_overlays=False
from bathroom_mirror_view import update_bathroom_mirror_view
update_bathroom_mirror_view(focus=False)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'Huis_Oude_Terelststraat_15.blend'))
print('MODEL_SAVED',len(bpy.data.objects),'objects',flush=True)
for scene,filename in [(cut,'first_floor_cutaway.png'),(base,'house_exterior.png'),(expl,'exploded_floors.png'),(living,'living_camber.png')]+kitchen_views:
    bpy.context.window.scene=scene;scene.render.filepath=str(ROOT/filename)
    bpy.ops.render.render(write_still=True,scene=scene.name)
    print('RENDERED',filename,flush=True)
bpy.context.window.scene=garden_views[0]
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'Huis_Oude_Terelststraat_15.blend'))
print('FINISHED',flush=True)
