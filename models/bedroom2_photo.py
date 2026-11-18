"""Slaapkamer 2, reconstructed from the eight user photographs of 2026-09-24.
Editable furniture; clear surfaces; closed doors/drawers; empty storage interiors.
Two wall colours confirmed by user. Footprint retained from the archive model.
"""
import bpy, bmesh, math, random
from mathutils import Vector, Matrix
from pathlib import Path
F=5.31
P='Bedroom 2 / '
ROOT=Path(__file__).resolve().parent

def update_bedroom2():
    random.seed(256)
    bpy.context.window.scene=bpy.data.scenes['01 | HOUSE - exterior']
    floor_root=bpy.data.collections['02 | SECOND - archive reconstruction']
    for o in list(bpy.data.objects):
        if o.name.startswith(P):bpy.data.objects.remove(o,do_unlink=True)
    for name in ['02 / Bedroom 2 furniture','02 / Bedroom 2 finishes','Bedroom 2 interior ceiling','Bedroom 2 door clearance review']:
        c=bpy.data.collections.get(name)
        if c:bpy.data.collections.remove(c)
    col=bpy.data.collections.new('02 / Bedroom 2 furniture');floor_root.children.link(col)
    finishes=bpy.data.collections.new('02 / Bedroom 2 finishes');floor_root.children.link(finishes)
    ceiling=bpy.data.collections.new('Bedroom 2 interior ceiling')
    clearance=bpy.data.collections.new('Bedroom 2 door clearance review')
    cut=bpy.data.collections.get('EXPLODED source 2 - cutaway')
    if cut:cut.children.link(col);cut.children.link(finishes)
    sc=bpy.data.scenes.get('12 | UPPER FLOOR - corrected complete layout')
    if sc:sc.collection.children.link(col);sc.collection.children.link(finishes)
    removed=[]
    for o in list(bpy.data.collections['02 / Furniture'].objects):
        if o.name.startswith(('Bed base','Mattress','Headboard','Pillow','Folded blanket')) and o.location.x>2.92 and o.location.y>5.12:
            removed.append(o.name);bpy.data.objects.remove(o,do_unlink=True)
    for o in list(bpy.data.collections['02 / Walls rear'].objects):
        if o.name.startswith('Bedroom 2 rear window'):bpy.data.objects.remove(o,do_unlink=True)
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
    navy=mat('deep navy bed wall','26323D',.90)
    bluegrey=mat('light blue grey walls','AFBAC4',.91)
    ceilingwhite=mat('ceiling white','F4F1E9',.85)
    black=mat('charcoal hardware and reveals','282A2C',.52)
    silver=mat('satin aluminium sliding door frames','B9BDC0',.25,metal=.78)
    oakx=wood('light oak grain along length','AE9675','CBB794','X')
    oaky=wood('light oak horizontal headboard grain','B7A083','D3C1A6','Y')
    oakz=wood('light oak vertical cupboard grain','B2A083','D5C4A4','Z')
    bookoak=wood('warm honey oak bookcase','B18D58','D0AC76','Z')
    floormat=wood('warm oak parquet','B69560','D7B67D','X')
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
    # Continuous finish linings on the room side only, leaving neighbouring rooms intact.
    box('navy headboard wall',7.089,7.099,5.131,8.710,.009,2.80,navy,0,finishes)
    box('blue grey wardrobe wall',2.932,7.089,5.121,5.132,.009,2.80,bluegrey,0,finishes)
    box('blue grey entrance wall',2.921,2.932,5.932,8.710,.009,2.80,bluegrey,0,finishes)
    box('blue grey entrance lintel',2.921,2.932,5.132,5.932,2.06,2.80,bluegrey,0,finishes)
    for a,b,z0,z1 in [(2.932,3.15,.009,2.80),(6.45,7.089,.009,2.80),(3.15,6.45,.009,.65),(3.15,6.45,2.25,2.80)]:
        box('blue grey window wall',a,b,8.709,8.719,z0,z1,bluegrey,0,finishes)
    box('ceiling',2.92,7.101,5.12,8.72,2.80,2.825,ceilingwhite,0,ceiling)
    for x0,x1 in [(2.935,2.953),(7.067,7.087)]:
        box('side skirting',x0,x1,5.945 if x0<3 else 5.145,8.698,.009,.075,white,.002,finishes)
    for y in (5.135,8.689):box('end skirting',2.953,7.067,y,y+.018,.009,.075,white,.002,finishes)
    for j in range(20):
        y=5.133+j*.179
        for i in range(5):
            x=2.938+i*1.21-(j%3)*.4;xa=max(2.934,x);xb=min(7.086,x+1.208)
            if xb>xa:box('parquet plank %02d %02d'%(j,i),xa,xb,y,min(y+.1775,8.707),.002,.010,floormat,.0006,finishes)
    # Existing rear window opening: same 330 x 160 cm, now photographed wide-centre proportions.
    for x in (3.15,6.395):box('window outer jamb',x,x+.055,8.822,8.926,.65,2.25,white,.003)
    for z in (.65,2.195):box('window outer rail',3.205,6.395,8.822,8.926,z,z+.055,white,.003)
    for x in (3.846,5.699):box('window mullion',x,x+.075,8.816,8.926,.705,2.195,white,.003)
    panes=[(3.205,3.846),(3.921,5.699),(5.774,6.395)]
    for idx,(a,b) in enumerate(panes):
        box('window glass pane '+str(idx+1),a+.019,b-.019,8.897,8.903,.731,2.169,glass,.001)
        for x in (a,b-.022):box('window sash vertical',x,x+.022,8.828,8.895,.710,2.190,white,.002)
        for z in (.71,2.168):box('window sash horizontal',a+.022,b-.022,8.828,8.895,z,z+.022,white,.002)
    for x in (3.766,5.793):
        box('window handle backplate',x,x+.024,8.807,8.825,1.36,1.45,white,.006)
        rod('window lever',[(x+.012,8.794,1.407),(x+.012,8.779,1.315)],.009)
    box('stone windowsill',3.088,6.512,8.492,8.948,.612,.647,stone,.005)
    shutter=mat('pale grey roller shutter','BCBDB8',.66)
    for j in range(32):
        z=.72+j*.046
        box('roller shutter horizontal slat',3.179,6.421,8.957,8.975,z,z+.043,shutter,.002)
    box('roller shutter housing',3.11,6.49,8.695,8.954,2.268,2.405,white,.004)
    # White panel radiator fits below the retained sill height.
    box('radiator body',3.46,6.25,8.501,8.672,.13,.570,white,.010)
    for j in range(72):
        x=3.474+j*.0383
        box('radiator vertical grille',x,x+.018,8.527,8.646,.574,.582,black,.001)
    for z in (.23,.38):box('radiator pressed horizontal seam',3.478,6.232,8.496,8.505,z,z+.006,white,.002)
    rod('radiator thermostat pipe',[(6.30,8.60,.08),(6.30,8.60,.49),(6.247,8.60,.49)],.014,white)
    ell('radiator thermostat',(6.302,8.58,.49),(.026,.05,.025))
    rod('curtain pole',[(3.015,8.479,2.51),(6.70,8.479,2.51)],.016,silver)
    for xa,xb in [(3.045,3.38),(6.255,6.62)]:
        n=50;k=28;vs=[]
        for j in range(k+1):
            z=.623+(2.477-.623)*j/k
            for i in range(n+1):
                u=i/n;x=xa+(xb-xa)*u+.014*math.sin(j*.15)*math.sin(math.pi*u)
                y=8.465+.052*math.sin(u*math.pi*10);vs.append((x,y,z+.008*math.cos(u*math.pi*10)*(1-j/k)))
        fs=[(j*(n+1)+i,j*(n+1)+i+1,(j+1)*(n+1)+i+1,(j+1)*(n+1)+i) for j in range(k) for i in range(n)]
        o=mesh('pleated grey curtain',vs,fs,curtainmat,smooth=True);o.modifiers.new('Cloth thickness','SOLIDIFY').thickness=.002
        for i in range(7):ell('curtain eyelet',(xa+.018+i*(xb-xa-.036)/6,8.473,2.48),(.014,.019,.023),silver)
    # Low oak platform double bed, 160 x 200 cm mattress; wide headboard with integrated bedsides.
    bx0,bx1,by0,by1=4.77,6.91,6.235,7.945
    for x in (4.92,6.70):
        for y in (6.38,7.80):box('bed recessed foot',x,x+.09,y,y+.09,.010,.19,black,.006)
    for y in (by0,by1-.035):box('oak bed long side',bx0,bx1,y,y+.035,.145,.407,oakx,.008)
    box('oak bed footboard',bx0,bx0+.035,by0+.035,by1-.035,.145,.407,oaky,.006)
    box('bed mattress support',bx0+.035,bx1-.05,by0+.035,by1-.035,.319,.35,oakx,.003)
    box('ochre covered mattress',4.808,6.86,6.277,7.903,.349,.536,mustard,.045)
    box('continuous oak headboard',6.924,7.057,5.735,8.445,.10,1.035,oaky,.007)
    box('headboard top storage ledge',6.792,7.070,5.720,8.46,1.034,1.059,oaky,.004)
    # Shallow seam below the ledge, visible in the photographs.
    box('headboard upper shadow line',6.915,6.924,5.74,8.44,.841,.848,black,.001)
    # Equal 49 cm carcasses and identical tops on both sides of the bed.
    for a,b in [(5.735,6.225),(7.955,8.445)]:
        box('floating bedside drawer carcass',6.475,6.927,a,b,.356,.51,oakx,.004)
        box('closed floating bedside drawer front',6.458,6.478,a+.003,b-.003,.359,.493,oaky,.003)
        box('bedside clear top',6.445,6.93,a-.012,b+.012,.514,.548,oaky,.004)
    # Tailored duvet with small natural folds and a soft fall over three edges.
    n=55;k=42;vs=[]
    for j in range(k+1):
        v=j/k;y=6.191+1.837*v
        for i in range(n+1):
            u=i/n;x=4.691+1.76*u
            edge=min(1,max(0,(4.82-x)/.129));side=max(0,(6.287-y)/.096,(y-7.905)/.123)
            z=.561-.17*edge*edge-.15*side*side+.007*(math.sin(30*x+17*y)+.5*math.cos(48*y-8*x))
            z+=.022*math.exp(-((x-6.37)/.07)**2)
            vs.append((x,y,z))
    fs=[(j*(n+1)+i,j*(n+1)+i+1,(j+1)*(n+1)+i+1,(j+1)*(n+1)+i) for j in range(k) for i in range(n)]
    duvet=mesh('neatly made ivory duvet',vs,fs,ivory,smooth=True);duvet.modifiers.new('Cotton duvet thickness','SOLIDIFY').thickness=.018
    for a,b in [(6.34,7.00),(7.115,7.775)]:
        box('plump ochre bed pillow',6.29,6.814,a,b,.549,.724,mustard,.084)
        rod('pillow stitched piping',[(6.36,a+.035,.632),(6.749,a+.035,.632),(6.78,a+.07,.632),(6.78,b-.07,.632),(6.749,b-.035,.632),(6.36,b-.035,.632),(6.325,b-.07,.632),(6.325,a+.07,.632),(6.36,a+.035,.632)],.0025,ivory)
    # Actual framed art: UV-map only the artwork region of the supplied photograph; pack source.
    box('framed print backing',7.043,7.071,6.621,7.821,1.415,2.152,white,.003)
    for a,b in [(6.611,6.639),(7.803,7.831)]:box('print side frame',7.016,7.052,a,b,1.405,2.162,white,.003)
    for z in (1.405,2.133):box('print top bottom frame',7.016,7.052,6.639,7.803,z,z+.029,white,.003)
    artmat=mat('original framed artwork from user photo','AB9168',.80)
    source=Path('/Users/slimmii/Downloads/Photos-1-001 (3)/20260924_170315.jpg')
    if source.exists():
        im=bpy.data.images.load(str(source),check_existing=True);im.name=P+'supplied photograph for framed art';im.pack()
        nodes=artmat.node_tree.nodes;links=artmat.node_tree.links;tex=nodes.new('ShaderNodeTexImage');tex.image=im;links.new(tex.outputs['Color'],nodes.get('Principled BSDF').inputs['Base Color'])
    art=mesh('original artwork image surface',[(7.014,7.803,1.435),(7.014,6.639,1.435),(7.014,6.639,2.133),(7.014,7.803,2.133)],[(0,1,2,3)],artmat)
    # Source photo displayed as 2048 x 944; clockwise art corners, excluding white frame.
    uv=[(149/2048,1-326/944),(611/2048,1-359/944),(601/2048,1-103/944),(127/2048,1-58/944)]
    layer=art.data.uv_layers.new(name='Photo artwork region')
    for p in art.data.polygons:
        for li in p.loop_indices:layer.data[li].uv=uv[art.data.loops[li].vertex_index]
    # Main wardrobe: light oak carcass, empty shelves/rails/drawers, two opaque sliding fronts.
    # Shifted 32.5 cm toward the door; shortened at the painting-wall/bed end.
    # The resulting 205 cm wardrobe clears the enlarged bedside cabinet.
    # Carcass 60 cm deep; sliding rails project another 7.5 cm into the room.
    xa,xb,ya,yb,h=4.364,6.414,5.134,5.734,2.48;th=.022
    for x in (xa,xb-th):box('wardrobe side',x,x+th,ya,yb,.06,h,oakz)
    for z in (.06,h-th):box('wardrobe horizontal carcass',xa+th,xb-th,ya,yb,z,z+th,oakx)
    box('wardrobe rear backing',xa+th,xb-th,ya,ya+.010,.082,h-th,oakz,.001)
    box('wardrobe recessed plinth',xa+.04,xb-.04,ya+.02,yb-.075,.01,.06,oakx,.002)
    module=(xb-xa-2*th)/3
    for i in (1,2):
        x=xa+th+i*module;box('wardrobe internal divider',x-.010,x+.010,ya+.01,yb-.067,.082,h-th,oakz,.002)
    for i in range(3):
        a=xa+th+i*module+.012;b=xa+th+(i+1)*module-.012
        if i!=1:
            for z in (.54,.91,1.28,1.65,2.06):box('wardrobe empty shelf',a,b,ya+.014,yb-.078,z,z+.019,oakx,.0015)
        else:
            box('wardrobe empty top shelf',a,b,ya+.014,yb-.078,2.10,2.121,oakx,.0015)
            rod('wardrobe bare clothes rail',[(a+.015,(ya+yb)/2,1.99),(b-.015,(ya+yb)/2,1.99)],.013,silver)
        # Closed lower drawers have genuine empty bottoms, backs and sides.
        for z in (.09,.28):
            box('wardrobe empty drawer bottom',a+.008,b-.008,ya+.031,yb-.10,z,z+.012,oakx,.001)
            for x in (a+.008,b-.020):box('wardrobe empty drawer side',x,x+.012,ya+.031,yb-.104,z+.012,z+.172,oakz,.001)
            box('wardrobe empty drawer back',a+.02,b-.02,ya+.031,ya+.043,z+.012,z+.172,oakx,.001)
            box('wardrobe closed inner drawer front',a,b,yb-.10,yb-.080,z,z+.174,oakx,.002)
    for z in (.066,2.457):box('wardrobe aluminium running track',xa,xb,yb-.013,yb+.075,z,z+.019,silver,.002)
    doorw=(xb-xa)/2+.026
    for idx,a in enumerate((xa+.007,xb-doorw-.007)):
        travel=(xb-xa)/2-.074
        door=empty('Sliding wardrobe door '+str(idx+1)+' CONTROL');door['Slide distance']=0.0;door.id_properties_ui('Slide distance').update(min=0 if idx==0 else -travel,max=travel if idx==0 else 0,description='Metres to slide; default closed. Interior intentionally empty.')
        drv=door.driver_add('location',0).driver;var=drv.variables.new();var.name='slide';var.targets[0].id=door;var.targets[0].data_path='["Slide distance"]';drv.expression='slide'
        yy=yb+.017+idx*.029
        objects=[]
        for x in (a,a+doorw-.025):objects.append(box('sliding door aluminium stile',x,x+.025,yy,yy+.022,.097,2.449,silver,.002))
        for j in range(5):
            z=.097+j*(2.352/4);objects.append(box('sliding door horizontal aluminium rail',a+.025,a+doorw-.025,yy,yy+.022,z,min(z+.016,2.458),silver,.0015))
        for j in range(4):
            z=.113+j*(2.352/4);objects.append(box('sliding door opaque white panel',a+.025,a+doorw-.025,yy+.003,yy+.016,z,z+2.352/4-.016,doorwhite,.002))
        for o in objects:parent_keep(o,door)
        door['storage_contents']='Empty; no clothing, boxes or hangers.'
    # White cabinet by entry: two empty open shelves over two closed drawers.
    ca,cb=3.569,4.319;dy0,dy1=5.134,5.584
    for x in (ca,cb-.027):box('white storage side',x,x+.027,dy0,dy1,.015,1.04,white,.003)
    box('white storage back',ca+.027,cb-.027,dy0,dy0+.016,.10,1.037,white,.002)
    for z in (.075,.49,.755,1.021):box('white storage shelf',ca+.027,cb-.027,dy0+.016,dy1,z,z+.019,white,.002)
    for z in (.111,.298):
        box('white storage closed drawer face',ca+.032,cb-.032,dy1-.025,dy1+.002,z,z+.18,white,.003)
        for zz in (z+.057,z+.119):box('white storage drawer horizontal groove',ca+.049,cb-.049,dy1+.003,dy1+.004,zz,zz+.0025,stone,.0004)
        ell('white storage black drawer knob',((ca+cb)/2,dy1+.024,z+.101),(.011,.017,.011),black)
    # Open honey-oak bookcase against entrance wall, all six compartments empty.
    xa,xb,ya,yb=2.952,3.253,6.037,6.914
    for y in (ya,yb-.022):box('bookcase upright',xa,xb,y,y+.022,.012,2.325,bookoak,.002)
    box('bookcase empty backing',xa,xa+.012,ya+.022,yb-.022,.089,2.302,bookoak,.001)
    for z in (.089,.460,.832,1.204,1.576,1.948,2.303):box('bookcase empty shelf',xa+.012,xb,ya+.022,yb-.022,z,z+.020,bookoak,.002)
    # Narrow white cupboard with the distinctive curved/scalloped crown.
    xa,xb,ya,yb=2.954,3.484,7.000,7.832
    for y in (ya,yb-.022):box('white armoire side',xa,xb,y,y+.022,.085,1.90,white,.003)
    box('white armoire empty back',xa,xa+.014,ya+.022,yb-.022,.106,1.887,white,.002)
    for z in (.086,.53,.96,1.39,1.875):box('white armoire empty shelf',xa+.014,xb-.025,ya+.022,yb-.022,z,z+.021,white,.002)
    for y in (ya+.027,yb-.075):box('white armoire small foot',xa+.03,xb-.01,y,y+.05,.011,.088,white,.004)
    # Crown profile extruded across the front thickness.
    pts=[(ya,1.896),(ya,1.944),(ya+.12,1.944),(ya+.22,2.008),(ya+.325,2.019),(ya+.414,1.985),(ya+.510,2.019),(ya+.606,2.010),(ya+.709,1.949),(yb,1.944),(yb,1.896)]
    vs=[(x,y,z) for x in (xb-.027,xb+.011) for y,z in pts];n=len(pts)
    crown=mesh('white armoire scalloped crown',vs,[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)],white)
    mod=crown.modifiers.new('Soft crown edge','BEVEL');mod.width=.008;mod.segments=5
    for idx,(a,b) in enumerate([(ya+.005,(ya+yb)/2-.003),((ya+yb)/2+.003,yb-.005)]):
        door=empty('White armoire door '+str(idx+1)+' CONTROL')
        panel=box('white armoire closed door',xb-.006,xb+.015,a,b,.09,1.899,white,.003)
        knob=ell('white armoire round pull',(xb+.041,(b-.039 if idx==0 else a+.039),.954),(.020,.013,.013),white)
        parent_keep(panel,door);parent_keep(knob,door);door['storage_contents']='All shelves empty; default door closed.'
    # Small closed drawer table squeezed beside the cupboard, in the window corner.
    xa,xb,ya,yb=2.973,3.566,7.919,8.496
    for x in (xa+.035,xb-.06):
        for y in (ya+.035,yb-.06):box('small table leg',x,x+.028,y,y+.028,.010,.635,oakz,.003)
    box('small table closed drawer',xa+.02,xb-.020,ya+.025,yb-.025,.414,.592,oakx,.003)
    box('small table white top',xa-.004,xb+.008,ya-.009,yb+.008,.609,.643,white,.005)
    box('small table recessed drawer pull',xb-.020,xb-.015,ya+.23,ya+.36,.546,.553,black,.002)
    # Portable air conditioner retained as an appliance; floor and top are clear.
    acx,acy=3.858,8.100
    box('portable air conditioner rounded shell',acx-.195,acx+.195,acy-.175,acy+.175,.053,.759,white,.067)
    for x in (acx-.135,acx+.135):
        for y in (acy-.112,acy+.112):ell('air conditioner castor',(x,y,.047),(.025,.024,.025),black)
    box('air conditioner top grille inset',acx-.13,acx+.13,acy-.028,acy+.123,.754,.761,black,.013)
    for i in range(11):
        x=acx-.122+i*.023;box('air conditioner vent louvre',x,x+.010,acy-.02,acy+.115,.761,.769,white,.003)
    box('air conditioner control display',acx-.131,acx+.131,acy-.115,acy-.065,.757,.764,black,.007)
    for x in (acx-.08,acx,acx+.08):ell('air conditioner control button',(x,acy-.089,.766),(.013,.011,.002),silver)
    box('air conditioner recessed carry grip',acx-.079,acx+.079,acy-.179,acy-.176,.609,.646,stone,.012)
    rod('air conditioner tidy exhaust duct',[(acx,acy+.145,.215),(acx,8.383,.215),(acx,8.444,.27),(acx,8.46,.63)],.054,white)
    # Independent inspection copy of the real entry door at 90 degrees.
    # The assembled house keeps its existing closed room door, unchanged.
    door_prefix='Upper reference door / Bedroom 2 / '
    moving_parts=('flush pale oak leaf','round handle rose','handle spindle','straight satin lever','dark round key escutcheon','key slot')
    joinery=bpy.data.collections['02 / Joinery']
    hinges=[o for o in joinery.objects if o.name.startswith(door_prefix+'right hinge')]
    hinge=Vector((sum(o.location.x for o in hinges)/len(hinges),sum(o.location.y for o in hinges)/len(hinges),F))
    moving=[o for o in joinery.objects if o.name.startswith(tuple(door_prefix+s for s in moving_parts))]
    transform=Matrix.Translation(hinge) @ Matrix.Rotation(-math.pi/2,4,'Z') @ Matrix.Translation(-hinge)
    for original in joinery.objects:
        if not original.name.startswith(door_prefix):continue
        o=original.copy();o.data=original.data.copy();o.name=P+'Door clearance / '+original.name[len(door_prefix):];clearance.objects.link(o)
        if original in moving:o.matrix_world=transform @ original.matrix_world
    # Conservative sweep envelope: includes both lever handles, not just the leaf.
    bpy.context.view_layer.update()
    sweep_max_x=-1e9;min_gap=1e9
    obstacles=[]
    for o in col.objects:
        if o.type not in ('MESH','CURVE'):continue
        vs=[o.matrix_world@Vector(p) for p in o.bound_box]
        obstacles.append((o.name,[min(v[i] for v in vs) for i in range(3)],[max(v[i] for v in vs) for i in range(3)]))
    white_min_x=min((o.matrix_world@Vector(p)).x for o in col.objects if o.name.startswith(P+'white storage') for p in o.bound_box)
    for degree in range(91):
        rotate=Matrix.Translation(hinge) @ Matrix.Rotation(-math.radians(degree),4,'Z') @ Matrix.Translation(-hinge)
        for original in moving:
            vs=[rotate @ original.matrix_world @ Vector(p) for p in original.bound_box]
            lower=[min(v[i] for v in vs) for i in range(3)];upper=[max(v[i] for v in vs) for i in range(3)]
            for name,lo,hi in obstacles:
                assert any(upper[i]<lo[i] or lower[i]>hi[i] for i in range(3)),('Door sweep intersects furniture',degree,original.name,name)
            for v in vs:
                sweep_max_x=max(sweep_max_x,v.x)
                min_gap=min(min_gap,white_min_x-v.x)
    assert .015<min_gap<.025, ('Door should just clear furniture with about 2 cm allowance',min_gap)
    bedside_sizes=[]
    for o in col.objects:
        if o.name.startswith(P+'floating bedside drawer carcass'):
            vs=[o.matrix_world@Vector(p) for p in o.bound_box]
            bedside_sizes.append(tuple(max(v[i] for v in vs)-min(v[i] for v in vs) for i in range(3)))
    assert len(bedside_sizes)==2 and all(abs(a-b)<.00001 for a,b in zip(*bedside_sizes))
    wardrobe_max_x=max(hi[0] for name,lo,hi in obstacles if name.startswith(P+'wardrobe side'))
    bedside_min_x=min(lo[0] for name,lo,hi in obstacles if name.startswith(P+'bedside clear top'))
    assert bedside_min_x-wardrobe_max_x>.025, ('Wardrobe too close to enlarged bedside',bedside_min_x-wardrobe_max_x)
    col['wardrobe_width_m']=2.05;col['wardrobe_carcass_depth_m']=.6;col['wardrobe_painting_wall_gap_m']=.675
    col['bedside_carcass_width_m']=.49;col['bedsides_equal']=True;col['wardrobe_bedside_clearance_m']=round(bedside_min_x-wardrobe_max_x,4)
    col['cabinet_block_shift_toward_door_m']=.325
    col['adjacent_cabinet_width_m']=.75;col['adjacent_cabinet_depth_m']=.45
    col['door_sweep_degrees_checked']=90;col['door_sweep_min_x_clearance_m']=round(min_gap,4)
    guide=mat('door clearance guide','397D71',.78)
    leaf=next(o for o in moving if o.name.startswith(door_prefix+'flush pale oak leaf'))
    radius=max(math.hypot((leaf.matrix_world@Vector(p)).x-hinge.x,(leaf.matrix_world@Vector(p)).y-hinge.y) for p in leaf.bound_box)
    for start in range(0,90,6):
        rod('Door clearance / swing arc',[(hinge.x+radius*math.sin(math.radians(a)),hinge.y+radius*math.cos(math.radians(a)),.018) for a in range(start,start+4)],.006,guide,clearance)
    print('DOOR CLEARANCE: 0-90 degrees including handles; conservative free X gap',round(min_gap*100,1),'cm',flush=True)
    # Dedicated scenes share the same editable model used in the assembled house.
    def light(sc,name,loc,target,power,size,color):
        d=bpy.data.lights.new(P+name,'AREA');d.energy=power;d.shape='DISK';d.size=size;d.color=color
        o=bpy.data.objects.new(P+name,d);sc.collection.objects.link(o);o.location=(loc[0],loc[1],F+loc[2]);o.rotation_euler=(Vector((target[0],target[1],F+target[2]))-o.location).to_track_quat('-Z','Y').to_euler()
    views=[(24,'SLAAPKAMER 2 - bed and sliding wardrobe',(3.255,5.995,1.80),(5.91,7.13,1.03),18),
           (25,'SLAAPKAMER 2 - window and empty shelving',(6.656,6.110,1.91),(3.60,7.46,1.10),19),
           (26,'SLAAPKAMER 2 - complete overhead',(5.011,6.92,7.0),(5.011,6.92,0),None),
           (27,'SLAAPKAMER 2 - door clearance',(4.30,5.76,6.0),(4.30,5.76,0),None)]
    scenes=[]
    for number,label,loc,target,lens in views:
        name='%02d | %s'%(number,label);sc=bpy.data.scenes.get(name) or bpy.data.scenes.new(name)
        for c in list(sc.collection.children):sc.collection.children.unlink(c)
        for o in list(sc.collection.objects):bpy.data.objects.remove(o,do_unlink=True)
        if lens:sc.collection.children.link(floor_root);sc.collection.children.link(ceiling)
        else:sc.collection.children.link(col);sc.collection.children.link(finishes)
        if number==27:sc.collection.children.link(clearance)
        sc.render.engine='CYCLES';sc.cycles.device='CPU';sc.cycles.samples=32;sc.cycles.use_denoising=True;sc.cycles.preview_samples=16;sc.cycles.use_preview_denoising=True;sc.cycles.max_bounces=8
        sc.render.resolution_x=1500;sc.render.resolution_y=1125;sc.render.resolution_percentage=100;sc.render.threads_mode='FIXED';sc.render.threads=8
        sc.world=bpy.data.worlds.new(P+label);sc.world.use_nodes=True;sc.world.node_tree.nodes['Background'].inputs[0].default_value=(.78,.86,1,1);sc.world.node_tree.nodes['Background'].inputs[1].default_value=.15
        sc.view_settings.view_transform='AgX';sc.unit_settings.system='METRIC'
        d=bpy.data.cameras.new(P+label);cam=bpy.data.objects.new(P+label,d);sc.collection.objects.link(cam);cam.location=(loc[0],loc[1],F+loc[2]);cam.rotation_euler=(Vector((target[0],target[1],F+target[2]))-cam.location).to_track_quat('-Z','Y').to_euler();sc.camera=cam;d.clip_start=.015
        if lens:d.lens=lens
        else:d.type='ORTHO';d.ortho_scale=3.55 if number==27 else 5.6
        light(sc,'window daylight '+str(number),(4.90,8.36,2.04),(5.15,6.01,.6),170,2.8,(.85,.92,1))
        light(sc,'soft ceiling bounce '+str(number),(4.91,6.95,2.63),(5.2,6.9,.2),110,2.8,(1,.96,.89))
        light(sc,'entry bounce '+str(number),(3.44,5.97,2.21),(6.55,7.42,1.0),46,1.8,(1,.95,.87))
        sc['reference_notes']='Eight user photographs. Slaapkamer 2. Navy bed wall, blue-grey other walls, closed storage, empty interiors. Dimensions estimated within existing archive footprint.'
        scenes.append(sc)
    for c in (col,finishes):
        c['reference']='20260924_170256; 170259; 170301; 170302; 170314; 170312; 170313; 170315'
        c['storage_status']='All doors and drawers closed; all storage interiors and open shelves empty.'
        for o in c.objects:o['model_status']='Photo reconstruction; unmeasured furniture dimensions estimated.'
    notes='''SLAAPKAMER 2 — acht gebruikersfoto’s van 24 september 2026
Scenes 24–26: bed en schuifkast, raam en lege kasten, bovenaanzicht. Scene 27: controle van de vrije deurzwaai, met een afzonderlijke inspectiekopie op 90°.
Bestaande archiefkamer behouden: x 2.92–7.101 m, y 5.12–8.72 m; vloer +5.31 m; hoogte 2.80 m. Meubelmaten en plaatsing op de foto's geschat, geen nieuwe opmeting.
Twee door gebruiker bevestigde kleuren: donkerblauw achter het bed en licht blauwgrijs op de overige wanden.
Licht eiken tweepersoonsbed met brede kopwand en twee even grote zwevende nachtkastjes: rompen 49 cm breed, bladen circa 51.4 cm breed en 48.5 cm diep. Het nachtkastje aan de kastzijde en de kopwand zijn verbreed. Bed opgemaakt met ivoorkleurig dekbed en okergele kussens. Raam met breed middenvak, witte profielen, rolluik, grijze gordijnen, stenen vensterbank en witte radiator. Bestaande raamopening behouden. Mobiele airco met opgeruimde slang.
Eiken schuifkast circa 205 cm breed. Romp 60 cm diep, inclusief schuifrails circa 67.5 cm; hoogte 248 cm. Het kastenblok is 32.5 cm richting deur verschoven; de grote kast is vervolgens aan de bed-/schilderijwandzijde 35 cm ingekort, zodat het bredere nachtkastje past. Circa 3.1 cm vrije afstand tussen de kast en het nachtkastblad in X-richting. Twee gesloten, ondoorzichtige witte schuifdeuren met aluminium profielen. Alle binnenvakken en laden zijn leeg. In de Outliner hebben beide CONTROL-objecten een eigenschap ‘Slide distance’ om de deuren desgewenst te verschuiven; standaard 0 = gesloten.
Witte opbergkast naast de schuifkast circa 75 x 45 x 104 cm, samen met het kastenblok 32.5 cm naar de deur verplaatst. De volledige draaibeweging van de bestaande kamerdeur is in het model gecontroleerd van 0 tot 90 graden, inclusief krukken; circa 2 cm vrije marge tot het witte meubel in X-richting, op verzoek net voldoende om te openen. Maten zijn aangepaste schattingen, geen opgemeten meubelmaten. De echte kamerdeur blijft in de gewone scenes gesloten; scene 27 toont een inspectiekopie op 90 graden.
Witte kast met gekroonde bovenzijde, gesloten dubbele deuren en lege schappen. Houten boekenkast en witte opbergkast met lege open vakken; laden gesloten. Klein tafelkastje bij het raam: lade dicht, bovenzijde leeg. Geen kleding, speelgoed, papieren of losse spullen.
Meubels als afzonderlijke bewerkbare geometrie. De wandprent gebruikt alleen het kunstwerkgebied uit de aangeleverde foto via UV-coördinaten; bronafbeelding in het Blender-bestand verpakt. Overige materialen procedureel.
Bron: bedroom2_photo.py. Reservekopie vóór deze laatste wijziging: Huis_before_bedroom2_equal_bedsides.blend.
'''
    txt=bpy.data.texts.get('SLAAPKAMER 2 - photo reconstruction notes') or bpy.data.texts.new('SLAAPKAMER 2 - photo reconstruction notes');txt.clear();txt.write(notes)
    (ROOT/'BEDROOM2_NOTES.txt').write_text(notes)
    assert len([o for o in col.objects if o.name.startswith(P+'Sliding wardrobe door') and o.type=='EMPTY'])==2
    assert bpy.data.collections['02 / Small bedroom furniture'].get('shelf_rows')==5
    print('BEDROOM 2 COMPLETE:',len(col.objects),'furniture objects;',len(finishes.objects),'finish objects; replaced',removed,flush=True)
    return scenes

if __name__=='__main__':
    import shutil,sys
    main=ROOT/'Huis_Oude_Terelststraat_15.blend';backup=ROOT/'Huis_before_bedroom2_photo.blend'
    if not backup.exists():shutil.copy2(main,backup)
    scenes=update_bedroom2();bpy.context.window.scene=scenes[0]
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type=='VIEW_3D':
                area.spaces.active.region_3d.view_perspective='CAMERA';area.spaces.active.shading.type='RENDERED';area.spaces.active.shading.use_scene_world_render=True;area.spaces.active.shading.use_scene_lights_render=True;area.spaces.active.overlay.show_overlays=False
    bpy.ops.wm.save_as_mainfile(filepath=str(main))
    if '--no-render' not in sys.argv:
        for sc,fn in zip(scenes,['bedroom2_view.png','bedroom2_storage.png','bedroom2_overhead.png','bedroom2_door_clearance.png']):
            bpy.context.window.scene=sc
            sc.cycles.samples=10;sc.cycles.max_bounces=6;sc.render.resolution_percentage=70
            sc.render.image_settings.file_format='PNG';sc.render.filepath=str(ROOT/fn)
            print('RENDERING',fn,flush=True);bpy.ops.render.render(write_still=True,scene=sc.name)
            sc.cycles.samples=32;sc.cycles.max_bounces=8;sc.render.resolution_percentage=100
    bpy.context.window.scene=scenes[0];bpy.ops.wm.save_as_mainfile(filepath=str(main))
    print('BEDROOM 2 SAVED',flush=True)
