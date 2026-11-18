"""Reference stair sconces and recessed spots. Run on the canonical house with --save.

Fixture sizes/layout are estimates from the supplied photos and existing rooms.
Existing architecture/materials stay intact; the obsolete ground WC surface lamp
is replaced. Game geometry and light positions export from these same objects.
"""
import bpy, bmesh, math, json, shutil, sys
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parent
PREFIX='Reference lighting / '
scene=bpy.data.scenes['01 | HOUSE - exterior'];bpy.context.window.scene=scene
source=ROOT/'Huis_Oude_Terelststraat_15.blend'
backup=ROOT/'Huis_before_reference_lights_20261002.blend'
if '--save' in sys.argv and not backup.exists():shutil.copy2(source,backup)
for o in list(bpy.data.objects):
    if o.name.startswith(PREFIX) or o.name=='Ground bathroom photo / ceiling lamp':bpy.data.objects.remove(o,do_unlink=True)
cols={}
for level,parent in [('ground','00 | GROUND - 2021'),('first','01 | FIRST - 2021 + Camber 2025'),('upper','02 | SECOND - archive reconstruction')]:
    name=f'{PREFIX}{level} fixtures';col=bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if name not in bpy.data.collections[parent].children:bpy.data.collections[parent].children.link(col)
    cols[level]=col
# The kitchen's authored lowered ceiling previously existed only in room views.
# Link that same object into the canonical house so the spots are mounted in both.
ceiling=bpy.data.objects['Kitchen ceiling for interior view']
if ceiling.name not in bpy.data.collections['01 / Fittings'].objects:bpy.data.collections['01 / Fittings'].objects.link(ceiling)
bpy.context.view_layer.update()

def material(name,hex,rough=.5,metal=0,emission=0):
    m=bpy.data.materials.get(PREFIX+name) or bpy.data.materials.new(PREFIX+name);m.use_nodes=True
    c=[int(hex[i:i+2],16)/255 for i in (0,2,4)];c=[v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in c]
    m.diffuse_color=(*c,1);bs=m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value=(*c,1);bs.inputs['Roughness'].default_value=rough;bs.inputs['Metallic'].default_value=metal
    if emission:bs.inputs['Emission Color'].default_value=(*c,1);bs.inputs['Emission Strength'].default_value=emission
    return m
metal=material('satin brushed stainless steel','BCC0C2',.32,.82)
white=material('warm white spot trim','F4F1E9',.4)
dark=material('recessed reflector shadow','373938',.42,.3)
glass=material('warm opal diffuser','FFF0D6',.4,0,.7)
led=material('warm white LED lens','FFF0D6',.3,0,1.6)
fixtures=[]
def mesh(name,vs,fs,mat,col):
    me=bpy.data.meshes.new(PREFIX+name);me.from_pydata(vs,[],fs);me.update()
    bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free()
    o=bpy.data.objects.new(PREFIX+name,me);col.objects.link(o);me.materials.append(mat);return o

def cylinder(name,center,radius,depth,mat,col):
    bpy.ops.mesh.primitive_cylinder_add(vertices=32,radius=radius,depth=depth,location=center)
    o=bpy.context.object;o.name=PREFIX+name
    for c in list(o.users_collection):c.objects.unlink(o)
    col.objects.link(o);o.data.materials.append(mat)
    for f in o.data.polygons:f.use_smooth=abs(f.normal.z)<.5
    return o

def light(name,pos,direction,col,watts,angle,range_m):
    data=bpy.data.lights.new(PREFIX+name,'SPOT');data.energy=watts;data.color=(1,.88,.69)
    data.spot_size=math.radians(angle);data.spot_blend=.65;data.shadow_soft_size=.035
    o=bpy.data.objects.new(PREFIX+name,data);col.objects.link(o);o.location=pos;o.rotation_euler=Vector(direction).to_track_quat('-Z','Y').to_euler()
    o['game_light']=True;o['game_range_m']=range_m;o['game_candela']=watts*1.15
    fixtures.append(o)

def spot(name,x,y,z,level):
    col=cols[level];n=40;vs=[]
    # Annular trim, with a dark reflector and luminous lens just inside it.
    for zz,r in [(z-.006,.05),(z+.002,.05),(z-.006,.037),(z+.002,.037)]:
        vs.extend((x+r*math.cos(i*math.tau/n),y+r*math.sin(i*math.tau/n),zz) for i in range(n))
    fs=[]
    for a,b in [(0,1),(0,2),(1,3),(2,3)]:
        fs.extend((a*n+i,a*n+(i+1)%n,b*n+(i+1)%n,b*n+i) for i in range(n))
    rim=mesh(name+' trim',vs,fs,white,col)
    cylinder(name+' dark reflector',(x,y,z-.002),.0368,.002,dark,col)
    cylinder(name+' opal lens',(x,y,z-.0035),.028,.0015,led,col)
    light(name+' light',(x,y,z-.018),(0,0,-1),col,32,76,3.1)
    rim['ceiling_z']=z;rim['fixture_type']='recessed spotlight';rim['estimated_dimensions']=True

for i,(x,y) in enumerate([(1.05,7.65),(2.32,7.65),(1.05,8.65),(2.32,8.65),(1.05,10.05),(2.32,10.05)],1):spot(f'kitchen spot {i}',x,y,4.85,'first')
for i,x in enumerate((1.05,2.30),1):spot(f'first WC spot {i}',x,5.82,5.12,'first')
for i,y in enumerate((4.45,5.35),1):spot(f'ground WC spot {i}',4.30,y,2.22,'ground')


def strip(name,center,length,along_y):
    col=cols['first'];x,y,z=center
    def bar(label,width,depth,height,material,offset):
        dims=(width,depth,height)
        vs=[(x+a*width/2,y+b*depth/2,z+offset+c*height/2) for c in (-1,1) for b in (-1,1) for a in (-1,1)]
        fs=[(0,2,3,1),(4,5,7,6),(0,1,5,4),(2,6,7,3),(0,4,6,2),(1,3,7,5)]
        return mesh(name+' '+label,vs,fs,material,col)
    bar('slim aluminium channel',.020 if along_y else length,length if along_y else .020,.007,metal,-.0035)
    bar('continuous opal LED strip',.012 if along_y else length-.008,length-.008 if along_y else .012,.002,led,-.008)
    data=bpy.data.lights.new(PREFIX+name+' light','AREA');data.shape='RECTANGLE';data.energy=18*length;data.color=(1,.88,.69)
    data.size=length;data.size_y=.045
    o=bpy.data.objects.new(PREFIX+name+' light',data);col.objects.link(o);o.location=(x,y,z-.014)
    o.rotation_euler.z=math.pi/2 if along_y else 0
    o['game_light']=True;o['game_area_intensity']=80
    fixtures.append(o)
strip('long cabinet strip',(.665,8.46,3.990),2.84,True)
strip('sink cabinet strip',(1.43,6.998,3.990),1.46,False)
# The Camber model already has the exact concealed diffuser. Reuse it, adding
# its missing illumination instead of stacking a second strip on the same face.
existing=bpy.data.objects['Camber drawing / B concealed LED below uppers']
bpy.context.view_layer.update()
points=[existing.matrix_world@Vector(v) for v in existing.bound_box]
center=sum(points,Vector())/8
living_data=bpy.data.lights.new(PREFIX+'living acoustic strip light','AREA')
living_data.shape='RECTANGLE';living_data.size=2.935;living_data.size_y=.045
living_data.energy=48;living_data.color=(1,.88,.69)
living_light=bpy.data.objects.new(PREFIX+'living acoustic strip light',living_data)
cols['first'].objects.link(living_light);living_light.location=(center.x,center.y,min(p.z for p in points)-.006)
living_light.rotation_euler.z=math.pi/2
living_light['game_light']=True;living_light['game_area_intensity']=25;fixtures.append(living_light)


def sconce(name,z,level,square=False):
    col=cols[level];dg=bpy.context.evaluated_depsgraph_get()
    hit,loc,normal,idx,wall,mat=scene.ray_cast(dg,Vector((.80,4.50,z)),Vector((0,1,0)))
    assert hit and ('masonry' in wall.name or 'surround' in wall.name),(name,wall.name)
    normal.z=0;normal.normalize();right=Vector((-normal.y,normal.x,0));up=Vector((0,0,1))
    def panel(label,x0,x1,z0,z1,depth,material,curve=True):
        vs=[];steps=20
        for v in (z0,z1):
            for i in range(steps+1):
                u=x0+(x1-x0)*i/steps
                bow=.026*(1-(u/.18)**2) if curve else 0
                vs.append(tuple(loc+right*u+up*v+normal*(depth+bow)))
        fs=[(i,i+1,steps+2+i,steps+1+i) for i in range(steps)]
        o=mesh(name+' '+label,vs,fs,material,col)
        thick=o.modifiers.new('Manufactured sheet thickness','SOLIDIFY');thick.thickness=.0015
        for p in o.data.polygons:p.use_smooth=True
        return o
    panel('concealed wall mount',-.065,.065,-.11,.11,.015,metal,False)
    if square:
        panel('frosted square',-.13,.13,-.13,.13,.045,glass,False)
        panel('central metal shield',-.070,.070,-.087,.087,.050,metal,False)
        for x in (-.114,.114):
            for h in (-.114,.114):
                o=cylinder(name+' corner fixing',loc+right*x+up*h+normal*.050,.006,.005,metal,col)
                o.rotation_euler=normal.to_track_quat('Z','Y').to_euler()
    else:
        panel('opal rectangular diffuser',-.124,.124,-.124,.124,.055,glass)
        for label,x0,x1,z0,z1 in [('top border',-.18,.18,.124,.18),('bottom border',-.18,.18,-.18,-.124),('left border',-.18,-.124,-.124,.124),('right border',.124,.18,-.124,.124),('center shield',-.089,.089,-.075,.081),('bottom bridge',-.034,.034,-.126,-.072)]:
            panel(label,x0,x1,z0,z1,.058,metal)
    light(name+' light',loc+normal*.12+up*.13,normal*.65+up*.76,col,18,115,2.4)
    return {'name':name,'wall':wall.name,'position':list(loc),'height':z}
mounts=[sconce('lower stair sconce',1.65,'ground'),sconce('middle stair sconce',4.15,'first'),sconce('upper stair sconce',7.10,'upper',True)]
bpy.context.view_layer.update()
# Link lights into the existing inspection scenes that contain their floor objects.
for sc in bpy.data.scenes:
    if sc==scene:continue
    for level,col in cols.items():
        anchor={'ground':'Ground bathroom photo / square shower tray','first':'Kitchen base carcass','upper':'Upper correction / rounded north stair surround'}[level]
        if anchor in sc.objects and col.name not in sc.collection.children:sc.collection.children.link(col)
report={'spotlights':10,'sconces':3,'strips':3,'mounts':mounts,'meshCount':sum(o.type=='MESH' for col in cols.values() for o in col.objects),'lightCount':len(fixtures),'ceilingHeights':{'kitchen':4.85,'firstWC':5.12,'groundWC':2.22},'layout':'Estimated, six kitchen spots and two per WC; original kitchen pendant retained.'}
(ROOT/'reference_light_fixtures_verification.json').write_text(json.dumps(report,indent=2))
if '--save' in sys.argv:bpy.ops.wm.save_as_mainfile(filepath=str(source))
print('REFERENCE_LIGHTS',json.dumps(report),flush=True)
