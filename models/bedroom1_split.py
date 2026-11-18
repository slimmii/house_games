"""Slaapkamer 1: two zones divided by SMÅSTAD plus bespoke white privacy panels.
User sketch supersedes the first placement: perpendicular beds, opposite cabinet and dollhouse, connection around the inner divider end.
Stock SMÅSTAD outer dimensions from IKEA 895.201.58; other sizes are estimated.
"""
import bpy,bmesh,math,random,json
from mathutils import Vector, Matrix
from pathlib import Path
F=5.31
P='Bedroom 1 / '
ROOT=Path(__file__).resolve().parent
IKEA='https://www.ikea.com/be/nl/p/smastad-hoogslaper-wit-wit-met-bureau-met-2-planken-s89520158/'

def update_bedroom1():
    random.seed(347)
    bpy.context.window.scene=bpy.data.scenes['01 | HOUSE - exterior']
    floor_root=bpy.data.collections['02 | SECOND - archive reconstruction']
    for o in list(bpy.data.objects):
        if o.name.startswith(P) and o.name!='Bedroom 1 / 2 dividing wall':bpy.data.objects.remove(o,do_unlink=True)
    # The shared structural wall name overlaps this room's prefix: preserve it.
    if not bpy.data.objects.get('Bedroom 1 / 2 dividing wall'):
        with bpy.data.libraries.load(str(ROOT/'Huis_before_bedroom1_split.blend'),link=False) as (source,target):
            target.objects=['Bedroom 1 / 2 dividing wall']
        bpy.data.collections['02 / Partitions'].objects.link(target.objects[0])
    names=['02 / Bedroom 1 furniture','02 / Bedroom 1 finishes','02 / Bedroom 1 custom divider','Bedroom 1 interior ceiling']
    for name in names:
        c=bpy.data.collections.get(name)
        if c:bpy.data.collections.remove(c)
    col=bpy.data.collections.new(names[0]);finishes=bpy.data.collections.new(names[1]);divider=bpy.data.collections.new(names[2]);ceiling=bpy.data.collections.new(names[3])
    for c in (col,finishes,divider):
        floor_root.children.link(c)
        bpy.data.collections['EXPLODED source 2 - cutaway'].children.link(c)
        bpy.data.scenes['12 | UPPER FLOOR - corrected complete layout'].collection.children.link(c)
    removed=[]
    for o in list(bpy.data.collections['02 / Furniture'].objects):
        if o.name.startswith('Archive 60 cm zone') or (o.name.startswith(('Bed base','Mattress','Headboard','Pillow','Folded blanket','Bedroom storage shelf')) and o.location.x>2.92 and o.location.y<4.99):
            removed.append(o.name);bpy.data.objects.remove(o,do_unlink=True)
    for o in list(bpy.data.collections['02 / Walls front'].objects):
        if o.name.startswith('2 front 1 '):bpy.data.objects.remove(o,do_unlink=True)
    def rgb(h):return tuple((int(h[i:i+2],16)/255)**2.2 for i in (0,2,4))+(1,)
    def mat(name,h,rough=.65,fabric=False,metal=0):
        m=bpy.data.materials.get(P+name) or bpy.data.materials.new(P+name);m.use_nodes=True;m.diffuse_color=rgb(h)
        ns=m.node_tree.nodes;ls=m.node_tree.links;ns.clear();out=ns.new('ShaderNodeOutputMaterial');p=ns.new('ShaderNodeBsdfPrincipled');ls.new(p.outputs['BSDF'],out.inputs['Surface'])
        p.inputs['Base Color'].default_value=rgb(h);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
        if fabric:
            n=ns.new('ShaderNodeTexNoise');n.inputs['Scale'].default_value=230;n.inputs['Detail'].default_value=2
            b=ns.new('ShaderNodeBump');b.inputs['Strength'].default_value=.18;b.inputs['Distance'].default_value=.0009
            ls.new(n.outputs['Fac'],b.inputs['Height']);ls.new(b.outputs[0],p.inputs['Normal'])
        return m
    def wood(name,a,b,axis='X'):
        m=mat(name,b,.53);ns=m.node_tree.nodes;ls=m.node_tree.links;p=ns.get('Principled BSDF')
        tc=ns.new('ShaderNodeTexCoord');v=ns.new('ShaderNodeVectorMath');v.operation='MULTIPLY';v.inputs[1].default_value={'X':(1.5,38,18),'Y':(32,1.5,18),'Z':(35,22,1.5)}[axis];ls.new(tc.outputs['Object'],v.inputs[0])
        n=ns.new('ShaderNodeTexNoise');n.inputs['Scale'].default_value=2.2;n.inputs['Detail'].default_value=2;n.inputs['Roughness'].default_value=.68;ls.new(v.outputs[0],n.inputs['Vector'])
        ramp=ns.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].color=rgb(a);ramp.color_ramp.elements[1].color=rgb(b);ls.new(n.outputs['Fac'],ramp.inputs[0]);ls.new(ramp.outputs[0],p.inputs['Base Color'])
        bump=ns.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.13;bump.inputs['Distance'].default_value=.001;ls.new(n.outputs['Fac'],bump.inputs['Height']);ls.new(bump.outputs[0],p.inputs['Normal'])
        return m
    white=mat('warm white cabinet lacquer','EFEDE6',.36)
    doorwhite=mat('opaque pearl sliding door panels','E7E8E4',.24)
    greenwall=mat('apple green reference walls','95B956',.91)
    creamwall=mat('warm ivory reference walls','E4DFD1',.91)
    ceilingwhite=mat('ceiling white','F4F1E9',.85)
    black=mat('charcoal hardware and reveals','282A2C',.52)
    silver=mat('satin aluminium sliding door frames','B9BDC0',.25,metal=.78)
    oakx=wood('light oak grain along length','AE9675','CBB794','X')
    oaky=wood('light oak horizontal headboard grain','B7A083','D3C1A6','Y')
    oakz=wood('light oak vertical cupboard grain','B2A083','D5C4A4','Z')
    bookoak=wood('warm honey oak bookcase','B18D58','D0AC76','Z')
    floormat=wood('light washed oak laminate','C6C0AD','E0DCCD','Y')
    curtainmat=mat('charcoal grey curtain fabric','585653',.96,True)
    ivory=mat('ivory cotton duvet','E9E5DB',.95,True)
    mustard=mat('ochre fitted sheet and pillows','C2A25B',.94,True)
    stone=mat('grey stone sill','A7A49C',.50)
    glass=mat('clear window glazing','EEF2F4',.05);g=glass.node_tree.nodes.get('Principled BSDF');g.inputs['Transmission Weight'].default_value=1;g.inputs['IOR'].default_value=1.45
    def mesh(name,vs,fs,m,c=col,smooth=False):
        me=bpy.data.meshes.new(P+name);me.from_pydata([(x,y,F+z) for x,y,z in vs],[],fs);me.update()
        if m:me.materials.append(m)
        bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free()
        o=bpy.data.objects.new(P+name,me);c.objects.link(o)
        for p in me.polygons:p.use_smooth=smooth
        return o
    def box(name,x0,x1,y0,y1,z0,z1,m=white,b=.003,c=col):
        o=mesh(name,[(x,y,z) for z in (z0,z1) for y in (y0,y1) for x in (x0,x1)],[(0,2,3,1),(4,5,7,6),(0,1,5,4),(2,6,7,3),(0,4,6,2),(1,3,7,5)],m,c)
        if b:mod=o.modifiers.new('Soft manufactured edges','BEVEL');mod.width=b;mod.segments=4
        return o
    def rod(name,pts,r,m=white,c=col):
        cu=bpy.data.curves.new(P+name,'CURVE');cu.dimensions='3D';cu.bevel_depth=r;cu.bevel_resolution=3;cu.use_fill_caps=True
        sp=cu.splines.new('POLY');sp.points.add(len(pts)-1)
        for p,(x,y,z) in zip(sp.points,pts):p.co=(x,y,F+z,1)
        o=bpy.data.objects.new(P+name,cu);c.objects.link(o);cu.materials.append(m);return o
    def ell(name,loc,scale,m=white):
        n=24;k=16;vs=[]
        for j in range(k+1):
            a=math.pi*j/k
            for i in range(n):
                t=math.tau*i/n;vs.append((loc[0]+scale[0]*math.sin(a)*math.cos(t),loc[1]+scale[1]*math.sin(a)*math.sin(t),loc[2]+scale[2]*math.cos(a)))
        fs=[(j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i) for j in range(k) for i in range(n)]
        return mesh(name,vs,fs,m,smooth=True)
    def parent_keep(o,p):o.parent=p;o.matrix_parent_inverse=p.matrix_world.inverted()
    def empty(name):
        o=bpy.data.objects.new(P+name,None);col.objects.link(o);o.empty_display_size=.12;return o
    sage=mat('sage canopy print and green handles','78956B',.7)
    rose=mat('soft pink textile bins','CD9DB4',.85,True)
    bedding=mat('muted lavender bedding','BAB6CE',.94,True)
    tentmat=mat('ivory canopy cotton','F2EFE5',.94,True)
    curtainbase=mat('cream patterned curtains','D8CCAE',.92,True)
    yellow=mat('crescent moon yellow','F2C957',.42)
    blue=mat('cloud decal blue','5E9DC1',.82)
    # Keep the archive shell; only add a thin finish on its interior faces.
    for i in range(22):
        xa=2.926+i*.1896;xb=min(7.086,xa+.1884)
        for j in range(5):
            ya=.291+j*1.14-(i%3)*.33;yb=ya+1.138
            ya=max(.291,ya);yb=min(4.967,yb)
            if yb>ya:box('washed oak floor plank',xa,xb,ya,yb,.001,.013,floormat,.0007,finishes)
    box('green bed-side wall finish',7.083,7.094,.281,4.972,.015,2.795,greenwall,.0,finishes)
    box('cream rear wall finish',2.93,7.083,4.966,4.978,.015,2.795,creamwall,0,finishes)
    for ya,yb,za,zb in [(.28,3.38,.015,2.795),(4.20,4.978,.015,2.795),(3.38,4.20,2.11,2.795)]:
        box('cream entry wall finish',2.921,2.933,ya,yb,za,zb,creamwall,0,finishes)
    for xa,xb,za,zb in [(2.932,3.10,.015,2.795),(6.62,7.084,.015,2.795),(3.10,6.62,.015,.90),(3.10,6.62,2.38,2.795)]:
        box('green window wall finish',xa,xb,.280,.292,za,zb,greenwall,0,finishes)
    box('room ceiling',2.921,7.10,.28,4.98,2.799,2.827,ceilingwhite,0,ceiling)
    box('right wall white skirting',7.065,7.084,.29,4.963,.015,.093,white,.002,finishes)
    box('window white skirting',2.933,7.065,.292,.311,.015,.093,white,.002,finishes)
    for a,b in [(.31,3.38),(4.20,4.966)]:box('entry white skirting',2.933,2.949,a,b,.015,.093,white,.002,finishes)
    # Three-pane window, shutter, stone sill and radiator as in the photos.
    for x in (3.10,3.81,5.87,6.55):box('window white vertical frame',x,x+.07,.12,.271,.97,2.31,white,.004,finishes)
    for z in (.90,2.31):box('window white horizontal frame',3.1,6.62,.12,.271,z,z+.07,white,.004,finishes)
    for xa,xb in [(3.17,3.81),(3.88,5.87),(5.94,6.55)]:
        box('window glazing',xa,xb,.168,.175,.97,2.31,glass,0,finishes)
        for z in (1.035,2.248):box('window sash horizontal',xa,xb,.225,.28,z,z+.025,white,.002,finishes)
    for x in (3.741,6.00):rod('white window handle',[(x,.30,1.54),(x,.325,1.54),(x,.325,1.65)],.008,white,finishes)
    shutter=mat('warm grey roller shutter','B8B8AC',.72)
    for i in range(36):
        z=1.01+i*.036;box('roller shutter slat',3.13,6.59,.087,.105,z,z+.031,shutter,.003,finishes)
    box('stone windowsill',3.059,6.661,.071,.375,.865,.905,stone,.006,finishes)
    box('white panel radiator',3.435,6.35,.318,.46,.14,.681,white,.01,finishes)
    box('radiator dark top grille',3.46,6.325,.328,.447,.681,.684,black,.002,finishes)
    for i in range(96):
        x=3.47+i*.0298;box('radiator top grille strip',x,x+.014,.321,.457,.684,.691,white,.001,finishes)
    for z in (.27,.40,.53):box('radiator subtle horizontal groove',3.46,6.326,.460,.461,z,z+.003,stone,.0005,finishes)
    # Gathered owl-pattern curtain impression: restrained small motifs, no loose objects.
    for xa,xb in [(3.06,3.43),(6.33,6.71)]:
        vs=[(xa+(xb-xa)*i/48,.344+.053*math.sin(i*math.tau/8),z) for z in (.78,2.52) for i in range(49)]
        obj=mesh('gathered cream curtain',vs,[(i,i+1,50+i,49+i) for i in range(48)],curtainbase,finishes,True)
        sol=obj.modifiers.new('Curtain thickness','SOLIDIFY');sol.thickness=.0015
        for j in range(9):
            for i in range(3):
                x=xa+(i+.5)*(xb-xa)/3;z=.90+j*.175
                o=ell('curtain printed oval',(x,.405,z),(.026,.001,.035),(sage,rose,blue)[(i+j)%3]);col.objects.unlink(o);finishes.objects.link(o)
    rod('curtain rod',[(3.0,.335,2.55),(6.78,.335,2.55)],.012,sage,finishes)
    # Full-height white wardrobe wall. Each compartment has an empty interior and closed doors.
    wy0,wy1=4.43,4.965;wx0,wx1=2.954,7.063
    wardrobe=empty('Rear wardrobe wall CONTROL');wardrobe['storage_contents']='Empty';wardrobe['doors']='Closed'
    for i in range(6):
        a=wx0+(wx1-wx0)*i/6;b=wx0+(wx1-wx0)*(i+1)/6
        before=set(col.objects)
        for x in (a,b-.018):box('rear wardrobe upright',x,x+.018,wy0,wy1,.035,2.73)
        box('rear wardrobe empty back',a+.018,b-.018,wy1-.013,wy1,.07,2.71)
        for z in (.055,.62,1.18,1.84,2.712):box('rear wardrobe empty shelf',a+.018,b-.018,wy0+.02,wy1-.013,z,z+.018)
        for za,zb in [(.066,1.825),(1.845,2.72)]:
            box('rear wardrobe closed door',a+.004,b-.004,wy0-.020,wy0-.002,za,zb,white,.004)
            hx=b-.066 if i%2==0 else a+.066;hz=.99 if za<1 else 2.13
            rod('rear wardrobe pale green U handle',[(hx,wy0-.022,hz-.09),(hx,wy0-.052,hz-.09),(hx,wy0-.052,hz+.09),(hx,wy0-.022,hz+.09)],.007,sage)
        for obj in set(col.objects)-before:parent_keep(obj,wardrobe)
    # A few blue cloud graphics preserve the character of the photographed doors.
    for x,z in [(3.43,.45),(4.16,1.32),(5.68,.54),(6.48,1.17)]:
        for dx,dz,r in [(-.04,0,.033),(0,.018,.044),(.043,0,.029)]:ell('small cloud door decal',(x+dx,wy0-.023,z+dz),(r,.001,r*.75),blue)
    # Separate white mid-sleeper beside the green wall, with rear ladder and open underside.
    bed=empty('Separate tent bed CONTROL');bed['estimated_outer_dimensions_m']=[1.04,2.07,1.32]
    before=set(col.objects);xa,xb,ya,yb=6.025,7.065,2.34,4.41
    for x in (xa,xb-.055):
        for y in (ya,yb-.055):box('tent bed square corner post',x,x+.055,y,y+.055,.013,1.32,white,.004)
    for x in (xa,xb-.037):box('tent bed long mattress rail',x,x+.037,ya+.055,yb-.055,.90,1.055)
    for y in (ya,yb-.037):box('tent bed end mattress rail',xa+.055,xb-.055,y,y+.037,.90,1.055)
    box('tent bed mattress support',xa+.037,xb-.037,ya+.037,yb-.037,.923,.942,white,.002)
    box('tent bed neatly fitted mattress',xa+.07,xb-.07,ya+.035,yb-.035,.946,1.069,bedding,.048)
    box('tent bed folded duvet',xa+.077,xb-.077,ya+.055,yb-.43,1.062,1.097,ivory,.033)
    box('tent bed pillow',xa+.14,xb-.14,yb-.56,yb-.105,1.081,1.168,bedding,.07)
    for z in (1.14,1.265):
        box('tent bed front guardrail',xa,xa+.036,ya+.055,3.974,z,z+.055)
        box('tent bed rear guardrail',xb-.036,xb,ya+.055,yb-.055,z,z+.055)
        for y in (ya,yb-.036):box('tent bed end guardrail',xa+.055,xb-.055,y,y+.036,z,z+.055)
    for y in (3.974,4.355):box('tent bed ladder upright',xa-.042,xa+.015,y,y+.042,.015,1.32)
    for z in (.225,.452,.679,.906):box('tent bed ladder step',xa-.13,xa+.012,4.016,4.354,z,z+.035,white,.006)
    # Curved tunnel canopy and botanical print; both ends remain open.
    def canopy(y,t,extra=0):return (6.545+(.46+extra)*math.cos(t),y,1.079+(.73+extra)*math.sin(t))
    vs=[canopy(2.365+1.08*i/18,math.pi*j/48) for i in range(19) for j in range(49)]
    tent=mesh('tent bed ivory floral tunnel',vs,[(i*49+j,(i+1)*49+j,(i+1)*49+j+1,i*49+j+1) for i in range(18) for j in range(48)],tentmat,smooth=True)
    mod=tent.modifiers.new('Cotton canopy thickness','SOLIDIFY');mod.thickness=.0015
    for y in (2.365,3.445):rod('tent bed flexible canopy arch',[canopy(y,j*math.pi/64,.005) for j in range(65)],.007,oaky)
    for t in (.035,math.pi-.035):rod('tent bed canopy sewn hem',[canopy(y,t,.005) for y in (2.365,3.445)],.005,oaky)
    for k in range(6):
        y0=2.39+k*.20
        rod('tent bed printed vine',[canopy(y0+.018*math.sin(t*7),t,.003) for t in [i*.05 for i in range(62)]],.0023,sage)
        for j in range(18):
            t=.1+j*.16;y=y0+.018*math.sin(t*7);sgn=1 if j%2 else -1
            mesh('tent bed printed leaf',[canopy(y,t,.005),canopy(y+sgn*.026,t+.015,.005),canopy(y+sgn*.040,t+.055,.005),canopy(y+sgn*.011,t+.06,.005)],[(0,1,2,3)],sage)
    for y,t in [(2.59,.5),(2.90,2.6),(3.18,1.35)]:
        for s in (-1,1):mesh('tent bed printed butterfly',[canopy(y,t,.007),canopy(y+s*.046,t+.06,.007),canopy(y+s*.035,t-.06,.007)],[(0,1,2)],rose)
    for obj in set(col.objects)-before:parent_keep(obj,bed)
    from bedroom1_dragon import update_bedroom1_dragon
    update_bedroom1_dragon()
    # IKEA SMÅSTAD envelope 207 x 104 x 182 cm: editable manufactured components.
    loft=empty('SMÅSTAD loft assembly CONTROL');loft['IKEA_reference']=IKEA;loft['outer_size_m']=[1.04,2.07,1.82];loft['mattress_size_m']=[.9,2.0];loft['underbed_clearance_m']=1.42
    before=set(col.objects);sx0,sx1,sy0,sy1=3.90,4.94,1.18,3.25
    for x in (sx0,sx1-.045):
        for y in (sy0,sy1-.045):box('SMÅSTAD structural post',x,x+.045,y,y+.045,.013,1.82)
    for x in (sx0,sx1-.030):
        box('SMÅSTAD long bed rail',x,x+.030,sy0+.045,sy1-.045,1.42,1.53)
        box('SMÅSTAD solid safety guard',x,x+.027,sy0+.045,sy1-.045,1.62,1.82)
    for y in (sy0,sy1-.030):box('SMÅSTAD end guard panel',sx0+.045,sx1-.045,y,y+.030,1.42,1.82)
    box('SMÅSTAD mattress base',sx0+.03,sx1-.03,sy0+.035,sy1-.035,1.42,1.446)
    box('SMÅSTAD 90 x 200 mattress',3.97,4.87,1.215,3.215,1.447,1.575,ivory,.035)
    box('SMÅSTAD made sage duvet',3.97,4.87,1.235,2.73,1.57,1.608,sage,.025)
    box('SMÅSTAD ivory pillow',4.04,4.80,2.745,3.14,1.572,1.685,ivory,.06)
    # Integrated storage at the window end; shelf/desk configuration faces the other half.
    for y in (1.18,1.69):box('SMÅSTAD cupboard side',3.94,4.922,y,y+.018,.035,1.418)
    box('SMÅSTAD cupboard back',4.91,4.928,1.20,1.69,.05,1.418)
    for z in (.052,.31,.58,.92,1.40):box('SMÅSTAD empty cupboard shelf',3.96,4.91,1.20,1.69,z,z+.018)
    for y0,y1 in [(1.186,1.436),(1.442,1.694)]:
        box('SMÅSTAD closed cupboard door',3.918,3.938,y0,y1,.615,1.414)
        rod('SMÅSTAD white cupboard pull',[(3.908,y1-.037,.93),(3.885,y1-.037,.93),(3.885,y1-.037,1.045),(3.908,y1-.037,1.045)],.006,white)
    for z in (.064,.246,.428):
        box('SMÅSTAD closed drawer',3.918,3.938,1.188,1.692,z,z+.174)
        rod('SMÅSTAD drawer handle',[(3.914,1.36,z+.11),(3.887,1.36,z+.11),(3.887,1.52,z+.11),(3.914,1.52,z+.11)],.006,white)
    # Stock 148 x 60 cm desk at 73 cm, turned along the long side under the bed.
    box('SMÅSTAD 148 x 60 desk top',4.32,4.92,1.735,3.215,.704,.73,white,.004)
    for y in (1.756,3.179):
        for x in (4.35,4.885):box('SMÅSTAD desk leg',x,x+.027,y,y+.027,.015,.705,white,.003)
    for z in (1.01,1.25):box('SMÅSTAD empty desk shelf',4.71,4.92,1.754,2.67,z,z+.020,white,.002)
    box('SMÅSTAD desk empty backboard',4.921,4.938,1.735,3.215,.73,1.415)
    # Vertical ladder at entry end, offset outward as in the modular assembly.
    for y in (2.72,3.183):box('SMÅSTAD ladder stile',3.848,3.895,y,y+.045,.012,1.82)
    for z in (.24,.48,.72,.96,1.20,1.44):box('SMÅSTAD ladder tread',3.77,3.915,2.765,3.183,z,z+.035,white,.005)
    for obj in set(col.objects)-before:parent_keep(obj,loft)
    # Custom divider: separate objects from the stock loft, to allow future adjustment.
    # 4 columns x 5 rows; cubby mouths point toward the tent side.
    for y in [1.18+i*1.47/4 for i in range(5)]:box('divider cubby vertical panel',4.958,5.348,y,y+.022,.018,1.838,white,.003,divider)
    for z in [i*1.82/5+.018 for i in range(6)]:
        for i in range(4):box('divider cubby horizontal shelf',4.958,5.348,1.202+i*1.47/4,1.18+(i+1)*1.47/4,z,z+.022,white,.003,divider)
    box('divider cubby solid backing',4.942,4.958,1.18,2.672,.018,1.862,white,.001,divider)
    # Fabric storage inserts have closed fronts, empty physical shells behind them.
    for row in (1,2,3):
        z=.048+row*1.82/5;ya=1.219;yb=1.514
        box('divider pink insert front',5.327,5.342,ya,yb,z,z+.303,rose,.009,divider)
        for y in (ya,yb-.009):box('divider empty pink insert side',4.989,5.333,y,y+.009,z,z+.303,rose,.002,divider)
        box('divider empty pink insert bottom',4.989,5.335,ya,yb,z,z+.009,rose,.001,divider)
        box('divider empty pink insert back',4.989,4.998,ya,yb,z,z+.303,rose,.001,divider)
        rod('divider pink insert pull',[(5.347,1.321,z+.235),(5.347,1.413,z+.235)],.004,ivory,divider)
    box('custom upper privacy extension',5.326,5.348,1.18,2.694,1.862,2.797,white,.002,divider)
    box('custom rear full-height partition',5.326,5.348,2.694,4.411,.013,2.797,white,.002,divider)
    box('custom top connecting cap',4.94,5.326,1.18,2.694,2.774,2.797,white,.002,divider)
    box('custom front return above bookshelf',4.941,5.348,1.16,1.18,1.86,2.797,white,.002,divider)
    for z in (.038,.397,.756,1.115,1.474,1.822):box('divider window-facing end bookcase shelf',4.961,5.333,.864,1.16,z,z+.020,white,.002,divider)
    for x in (4.939,5.333):box('divider window-facing end bookcase side',x,x+.022,.864,1.18,.018,1.842,white,.002,divider)
    box('divider window-facing end bookcase back',4.961,5.333,1.147,1.165,.038,1.84,white,.001,divider)
    # Small crescent lamp on the bookshelf, matched to the visible yellow lamp.
    pts=[]
    for i in range(49):
        t=math.radians(70)+math.radians(220)*i/48;pts.append((5.14+.145*math.cos(t),2.066+.145*math.sin(t)))
    for i in range(49):
        t=math.radians(285)-math.radians(210)*i/48;pts.append((5.203+.123*math.cos(t),2.066+.123*math.sin(t)))
    vs=[(x,y,z) for y in (.978,1.028) for x,z in pts];n=len(pts)
    mesh('yellow crescent lamp',vs,[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)],yellow,divider)
    box('moon lamp foot',4.997,5.262,.945,1.063,1.842,1.867,white,.009,divider)
    # Empty honey-pine dollhouse shelving on the cream side, loose toys omitted.
    xa,xb,ya,yb=2.962,3.315,1.28,2.21
    for x in (xa,xb-.027):
        for y in (ya,yb-.027):box('pine dollhouse upright',x,x+.027,y,y+.027,.014,1.52,bookoak,.003)
    for z in (.043,.370,.702,1.033,1.362):
        box('pine dollhouse empty white shelf',xa+.024,xb-.024,ya+.027,yb-.027,z,z+.017,white,.002)
        box('pine dollhouse front edge',xb-.027,xb,ya,yb,z-.014,z+.021,bookoak,.002)
    for y in (ya,yb-.014):box('pine dollhouse inset white end',xa+.023,xb-.025,y,y+.014,.073,1.358,white,.002)
    box('pine dollhouse empty white back',xa+.008,xa+.021,ya+.027,yb-.027,.073,1.36,white,.001)
    # Low white unit tucked against the foot of the separate tent bed.
    for x in (6.09,6.735):box('low white tent-side shelf side',x,x+.02,1.995,2.313,.015,.72)
    box('low white tent-side shelf back',6.11,6.735,2.299,2.313,.034,.698)
    for z in (.034,.357,.70):box('low white tent-side empty shelf',6.11,6.735,1.995,2.299,z,z+.020)
    # Authoritative layout correction: user's hand-drawn plan, 24 September 21:17.
    # Sketch top = green right wall (+X); sketch right = window (-Y).
    # Tent bed remains along the green wall. Loft turns 90 degrees into the room.
    loft.matrix_world=Matrix.Translation((8.258,-3.01,0)) @ Matrix.Rotation(math.pi/2,4,'Z')
    loft['layout_reference']='User sketch: perpendicular to the separate tent bed, far end at green wall.'
    # The custom shelving occupies the bed-facing side, ending with the loft.
    # Swap horizontal axes so the mouths face the tent zone (+Y).
    swap=Matrix(((0,1,0,3.828),(1,0,0,-3.012),(0,0,1,0),(0,0,0,1)))
    for obj in divider.objects:
        if obj.name==P+'custom rear full-height partition':
            for v in obj.data.vertices:
                if v.co.y>4.40:v.co.y=3.247
        obj.matrix_world=swap
    # Opposite wall: closed white cabinet and an empty dollhouse beside its entry end.
    # The dollhouse is perpendicular to the cabinet front, as drawn in the plan.
    for obj in list(col.objects):
        if obj.name.startswith(P+'pine dollhouse'):
            obj.matrix_world=Matrix(((0,1,0,1.682),(1,0,0,.018),(0,0,1,0),(0,0,0,1)))
        if obj.name.startswith(P+'low white tent-side'):
            obj.matrix_world=Matrix.Translation((12.005,4.663,0)) @ Matrix.Rotation(math.pi,4,'Z')
    cabinet=empty('Opposite wall white cupboard CONTROL')
    before=set(col.objects)
    ax,bx,ay,by=2.954,3.514,1.48,2.952
    for y in (ay,2.414,by-.018):box('opposite cupboard side',ax,bx,y,y+.018,.024,1.94)
    box('opposite cupboard empty back',ax,ax+.013,ay+.018,by-.018,.06,1.922)
    for z in (.06,.59,1.04,1.48,1.922):
        for ya,yb in ((ay+.018,2.414),(2.432,by-.018)):
            box('opposite cupboard empty shelf',ax+.013,bx-.020,ya,yb,z,z+.018)
    for ya,yb in ((ay+.004,2.410),(2.436,by-.004)):
        box('opposite cupboard closed door',bx-.016,bx+.003,ya,yb,.62,1.922)
        hy=yb-.072
        rod('opposite cupboard white door pull',[(bx+.005,hy,1.16),(bx+.035,hy,1.16),(bx+.035,hy,1.28),(bx+.005,hy,1.28)],.006,white)
        for z in (.065,.247,.429):
            box('opposite cupboard closed drawer',bx-.016,bx+.003,ya,yb,z,z+.174)
            mid=(ya+yb)/2
            rod('opposite cupboard drawer pull',[(bx+.006,mid-.066,z+.11),(bx+.035,mid-.066,z+.11),(bx+.035,mid+.066,z+.11),(bx+.006,mid+.066,z+.11)],.006,white)
    for obj in set(col.objects)-before:parent_keep(obj,cabinet)
    cabinet['storage_contents']='Empty; doors and drawers closed.'
    # All scene cameras are review views of these same editable objects.
    def light(sc,name,loc,target,power,size,color):
        d=bpy.data.lights.new(P+name,'AREA');d.energy=power;d.shape='DISK';d.size=size;d.color=color
        o=bpy.data.objects.new(P+name,d);sc.collection.objects.link(o);o.location=(loc[0],loc[1],F+loc[2]);o.rotation_euler=(Vector((target[0],target[1],F+target[2]))-o.location).to_track_quat('-Z','Y').to_euler()
    views=[(28,'SLAAPKAMER 1 - tentbed and wardrobes',(3.66,4.19,2.04),(6.22,3.14,1.18),20),
           (29,'SLAAPKAMER 1 - divider and opposite cupboard',(6.86,4.15,2.39),(5.55,2.02,1.25),19),
           (30,'SLAAPKAMER 1 - SMÅSTAD side',(3.86,.78,2.16),(6.14,1.48,1.10),19),
           (31,'SLAAPKAMER 1 - both zones overhead',(5.01,2.63,7.0),(5.01,2.63,0),None)]
    scenes=[]
    for number,label,loc,target,lens in views:
        name='%02d | %s'%(number,label);sc=bpy.data.scenes.get(name) or bpy.data.scenes.new(name)
        for c in list(sc.collection.children):sc.collection.children.unlink(c)
        for o in list(sc.collection.objects):
            if o.name.startswith('Upper reference door / '):sc.collection.objects.unlink(o)
            else:bpy.data.objects.remove(o,do_unlink=True)
        for c in (col,finishes,divider):sc.collection.children.link(c)
        if lens:sc.collection.children.link(ceiling)
        for original in bpy.data.collections['02 / Joinery'].objects:
            if original.name.startswith('Upper reference door / Bedroom 1 / '):sc.collection.objects.link(original)
        sc.render.engine='CYCLES';sc.cycles.device='CPU';sc.cycles.samples=32;sc.cycles.use_denoising=True;sc.cycles.preview_samples=16;sc.cycles.use_preview_denoising=True;sc.cycles.max_bounces=8
        sc.render.resolution_x=1500;sc.render.resolution_y=1125 if lens else 1320;sc.render.resolution_percentage=100;sc.render.threads_mode='FIXED';sc.render.threads=8
        sc.world=bpy.data.worlds.new(P+label);sc.world.use_nodes=True;sc.world.node_tree.nodes['Background'].inputs[0].default_value=(.78,.86,1,1);sc.world.node_tree.nodes['Background'].inputs[1].default_value=.15
        sc.view_settings.view_transform='AgX';sc.unit_settings.system='METRIC'
        d=bpy.data.cameras.new(P+label);cam=bpy.data.objects.new(P+label,d);sc.collection.objects.link(cam);cam.location=(loc[0],loc[1],F+loc[2]);cam.rotation_euler=(Vector((target[0],target[1],F+target[2]))-cam.location).to_track_quat('-Z','Y').to_euler();sc.camera=cam;d.clip_start=.015
        if lens:d.lens=lens
        else:
            d.type='ORTHO';d.ortho_scale=5.3;cam.rotation_euler=(0,0,-math.pi/2)
            for label,x,y,size in [('BED',6.54,3.38,.15),('HOOGSLAPER',6.04,1.39,.13),('KAST',3.24,2.09,.14),('POPPENHUIS',3.43,3.16,.10),('DEUR',3.16,3.79,.10),('RAAM',5.1,.22,.11)]:
                cu=bpy.data.curves.new(P+'plan label '+label,'FONT');cu.body=label;cu.align_x='CENTER';cu.align_y='CENTER';cu.size=size;cu.extrude=0
                obj=bpy.data.objects.new(P+'plan label '+label,cu);sc.collection.objects.link(obj);obj.location=(x,y,F+2.88);obj.rotation_euler=(0,0,-math.pi/2);cu.materials.append(black)
                obj.visible_shadow=False

        light(sc,'window daylight '+str(number),(4.85,.54,2.13),(5.20,3.90,.67),195,2.8,(.87,.94,1))
        light(sc,'right ceiling bounce '+str(number),(6.29,2.77,2.65),(6.2,2.77,.4),105,2.2,(1,.97,.90))
        light(sc,'left ceiling bounce '+str(number),(3.62,2.70,2.61),(4.05,2.25,.5),100,1.6,(1,.96,.90))
        if not lens:light(sc,'overhead plan softbox',(5.01,2.63,5.0),(5.01,2.63,0),350,4.5,(1,.98,.94))
        sc['reference_notes']='User sketch 2026-09-24 21:17 overrides prior placement: two perpendicular beds, loft extends from green wall; cupboard and dollhouse opposite; access around inner loft end. Eleven photos determine finishes. Dimensions estimated except stock IKEA envelope.'
        scenes.append(sc)
    col['reference_photos']='20260924_170347;170332;170333;170334;170335;170336;170338;170339;170340;170343;170345'
    col['storage_status']='Closed doors and drawers, empty interiors and open shelves; no toys or loose clutter.'
    divider['construction']='Custom addition, distinct from IKEA SMÅSTAD stock components.'
    divider['layout_status']='Corrected to user sketch: transverse loft and divider; cupboard and dollhouse opposite.'
    # Verification of both bed envelopes, room bounds, and prior requested room changes.
    assert all(abs(a-b)<1e-6 for a,b in zip((sx1-sx0,sy1-sy0,1.82),(1.04,2.07,1.82)))
    bpy.context.view_layer.update()
    def bounds(objects):
        points=[o.matrix_world@Vector(p) for o in objects if o.type in ('MESH','CURVE') for p in o.bound_box]
        return [min(p[i] for p in points) for i in range(3)],[max(p[i] for p in points) for i in range(3)]
    low_bed,high_bed=bounds([o for o in col.objects if o.parent==bed])
    low_loft,high_loft=bounds([o for o in col.objects if o.parent==loft])
    assert high_bed[1]-low_bed[1]>high_bed[0]-low_bed[0]
    assert high_loft[0]-low_loft[0]>high_loft[1]-low_loft[1]
    assert high_loft[1]<low_bed[1], 'Perpendicular beds must not overlap'
    divider_low,divider_high=bounds(divider.objects)
    opposite_low,opposite_high=bounds([o for o in col.objects if o.parent==cabinet or o.name.startswith(P+'pine dollhouse')])
    assert divider_low[0]-opposite_high[0]>.70, 'Connection between the zones must stay free'
    assert high_loft[0]<7.084 and divider_high[0]<7.084

    assert bpy.data.collections['02 / Small bedroom furniture'].get('shelf_rows')==5
    assert bpy.data.collections['02 / Bedroom 2 furniture'].get('bedsides_equal')
    verification={'two_separate_beds':True,'smastad_outer_m':[1.04,2.07,1.82],'mattress_m':[.9,2.0],'desk_m':[1.48,.60,.73],'custom_divider_separate':True,'layout':'user sketch: perpendicular beds, cupboard and dollhouse opposite','reference_sketch':'Screenshot 2026-09-24 at 21.17.04.png','inner_end_connection_m':round(divider_low[0]-opposite_high[0],3),'perpendicular_beds_verified':True,'closed_storage':True,'empty_open_shelves':True,'prior_small_bedroom_rows':5,'prior_bedroom2_bedsides_equal':True}
    (ROOT/'bedroom1_verification.json').write_text(json.dumps(verification,indent=2))
    notes='''SLAAPKAMER 1 — gedeelde kamer, elf gebruikersfoto’s van 24 september 2026.
Scenes 28–31: tentbed en kastwand; afscheiding en kast; SMÅSTAD-zijde; beide delen van boven.
Bestaand kamervolume behouden: x 2.92–7.101 m, y 0.28–4.98 m, vloer +5.31 m, hoogte 2.80 m.
De gebruikersschets van 24 september om 21:17 bepaalt de gecorrigeerde indeling: het tentbed ligt langs de groene wand; de SMÅSTAD staat er dwars op en steekt vanaf diezelfde wand de kamer in. De hoge vakkenwand met panelen volgt de hoogslaper. Kast en poppenhuis staan tegen de tegenoverliggende wand, met een doorgang tussen deze meubels en het vrije uiteinde van de hoogslaper. De eerdere parallelle plaatsing is vervallen.
Het bovenaanzicht is in dezelfde richting als de schets: bed linksboven, hoogslaper bovenaan in het midden/rechts, kast en poppenhuis onderaan, deur linksonder, raam rechts. De kastwand langs de linker schetsrand is behouden. De schets bepaalt de onderlinge plaatsing; meubelmaten en precieze afstanden blijven schattingen.
IKEA SMÅSTAD: buitenmaat 207 x 104 x 182 cm, matras 90 x 200 cm, onderbedruimte 142 cm; bureau 148 x 60 x 73 cm. Componentdetails zijn vereenvoudigd, opgesteld voor de fotoreconstructie. De extra kastenwand en panelen horen niet bij het standaardproduct.
Bron: https://www.ikea.com/be/nl/p/smastad-hoogslaper-wit-wit-met-bureau-met-2-planken-s89520158/
Groene accent- en raamwand, overige wanden warm ivoor. Lichte laminaatvloer. Witte raamprofielen, rolluik, radiator en gordijnen met vereenvoudigd kleurpatroon.
Apart wit halfhoog tentbed, open ruimte eronder, ladder, opgemaakt bed en gebogen stoffen kap met botanisch patroon. Roze draak met bloemen en sterren als ingepakte referentietextuur op de groene wand.
Witte kastwand met bovenkasten en groene grepen. Lage witte kast en vakkenwand met lege open vakken en enkele lege roze bakken. Geel maanlampje. Houten poppenhuiskast als lege rekstructuur. Speelgoed, knuffels, kleding en losse spullen weggelaten.
Alle kastdeuren en laden standaard gesloten, alle zichtbare binnenvakken leeg. Maatwerkafscheiding in eigen collectie: 02 / Bedroom 1 custom divider. De vrije verbinding rond het uiteinde van de afscheiding is gecontroleerd. Meubelmaten zijn visuele schattingen; nog niet ter plaatse opgemeten.
De slaapkamer-2 correcties en vijf vakken hoogte in de kleinste slaapkamer zijn behouden.
Broncode: bedroom1_split.py. Reservekopie vóór schetscorrectie: Huis_before_bedroom1_sketch.blend.
'''
    txt=bpy.data.texts.get('SLAAPKAMER 1 - split room notes') or bpy.data.texts.new('SLAAPKAMER 1 - split room notes');txt.clear();txt.write(notes)
    (ROOT/'BEDROOM1_NOTES.txt').write_text(notes)
    start=bpy.data.texts.get('START HERE - model assumptions')
    if start and (ROOT/'MODEL_NOTES.txt').exists():start.clear();start.write((ROOT/'MODEL_NOTES.txt').read_text())
    print('BEDROOM 1 COMPLETE',len(col.objects),'furniture;',len(divider.objects),'divider;',len(finishes.objects),'finishes; replaced',removed,flush=True)
    from bedroom1_dragon import create_dragon_detail_view
    create_dragon_detail_view()
    return scenes

if __name__=='__main__':
    import shutil,sys
    main=ROOT/'Huis_Oude_Terelststraat_15.blend';backup=ROOT/'Huis_before_bedroom1_sketch.blend'
    if not backup.exists():shutil.copy2(main,backup)
    scenes=update_bedroom1();bpy.context.window.scene=scenes[-1]
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type=='VIEW_3D':
                area.spaces.active.region_3d.view_perspective='CAMERA';area.spaces.active.shading.type='RENDERED';area.spaces.active.shading.use_scene_world_render=True;area.spaces.active.shading.use_scene_lights_render=True;area.spaces.active.overlay.show_overlays=False
    bpy.ops.wm.save_as_mainfile(filepath=str(main))
    if '--no-render' not in sys.argv:
        for sc,fn in zip(scenes,['bedroom1_tent.png','bedroom1_divider.png','bedroom1_smastad.png','bedroom1_overhead.png']):
            bpy.context.window.scene=sc;sc.cycles.samples=10;sc.cycles.max_bounces=6;sc.render.resolution_percentage=70
            sc.render.image_settings.file_format='PNG';sc.render.filepath=str(ROOT/fn)
            print('RENDERING',fn,flush=True);bpy.ops.render.render(write_still=True,scene=sc.name)
            sc.cycles.samples=32;sc.cycles.max_bounces=8;sc.render.resolution_percentage=100
    bpy.context.window.scene=scenes[-1];bpy.ops.wm.save_as_mainfile(filepath=str(main))
    print('BEDROOM 1 SAVED',flush=True)
