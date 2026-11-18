"""Editable bathroom reconstruction from five user photographs, 24 September 2026.
All dimensions are estimates fitted inside the existing archive room footprint.
Run on the current .blend; build_house.py also calls update_bathroom_photo().
"""
import bpy, math, bmesh
from mathutils import Vector
from pathlib import Path
F=5.31
PREFIX='Bathroom photo / '

def update_bathroom_photo():
    bpy.context.window.scene=bpy.data.scenes['01 | HOUSE - exterior']
    root=bpy.data.collections['02 | SECOND - archive reconstruction']
    for o in list(bpy.data.objects):
        if o.name.startswith(PREFIX): bpy.data.objects.remove(o,do_unlink=True)
    old=bpy.data.collections.get('02 / Bathroom photo fittings')
    if old: bpy.data.collections.remove(old)
    col=bpy.data.collections.new('02 / Bathroom photo fittings');root.children.link(col)
    for name in ['EXPLODED source 2 - cutaway']:
        c=bpy.data.collections.get(name)
        if c:c.children.link(col)
    sc=bpy.data.scenes.get('12 | UPPER FLOOR - corrected complete layout')
    if sc:sc.collection.children.link(col)
    for o in list(bpy.data.collections['02 / Fittings'].objects):
        if o.name.startswith(('Upper bathtub','Vanity','Basin','Tap')):bpy.data.objects.remove(o,do_unlink=True)
    def rgb(h):return tuple((int(h[i:i+2],16)/255)**2.2 for i in (0,2,4))+(1,)
    def mat(name,color,rough=.4,metal=0):
        m=bpy.data.materials.get('Bathroom - '+name) or bpy.data.materials.new('Bathroom - '+name);m.use_nodes=True;m.diffuse_color=rgb(color)
        p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=rgb(color);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
        return m
    white=mat('gloss white cabinetry','EEEDE7',.26);ceramic=mat('ivory glazed ceramic','F6F4EC',.15);chrome=mat('polished chrome','D6DCDE',.16,1);black=mat('black curved pulls','141313',.22,.45);grout=mat('warm wall grout','C6C0B5',.7);floorgrout=mat('dark floor grout','57534E',.8);floor=mat('ivory floor tiles','E7E3D8',.3);dark=mat('drain recess','242725',.45);plaster=mat('warm ceiling','ECE7DC',.9)
    tile=mat('cloudy cream marble wall tiles','DCD5C8',.23)
    n=tile.node_tree.nodes;l=tile.node_tree.links;p=n.get('Principled BSDF');geo=n.new('ShaderNodeTexCoord');noise=n.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=7;noise.inputs['Detail'].default_value=3;noise.inputs['Roughness'].default_value=.7
    mapping=n.new('ShaderNodeVectorMath');mapping.operation='MULTIPLY';mapping.inputs[1].default_value=(1.4,1.4,2.8);l.new(geo.outputs['Object'],mapping.inputs[0]);l.new(mapping.outputs[0],noise.inputs['Vector']);r=n.new('ShaderNodeValToRGB');r.color_ramp.elements[0].position=.23;r.color_ramp.elements[0].color=rgb('C5BCAF');r.color_ramp.elements[1].position=.72;r.color_ramp.elements[1].color=rgb('E9E3D9');l.new(noise.outputs['Fac'],r.inputs[0]);l.new(r.outputs[0],p.inputs['Base Color'])
    stone=mat('polished black vanity stone','141514',.19)
    ns=stone.node_tree.nodes;ls=stone.node_tree.links;noise=ns.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=65;rr=ns.new('ShaderNodeValToRGB');rr.color_ramp.elements[0].color=rgb('0B0C0C');rr.color_ramp.elements[1].color=rgb('292925');ls.new(noise.outputs['Fac'],rr.inputs[0]);ls.new(rr.outputs[0],ns.get('Principled BSDF').inputs['Base Color'])
    glass=mat('glass screen and niche shelves','DDE6DF',.08);p=glass.node_tree.nodes.get('Principled BSDF');p.inputs['Transmission Weight'].default_value=1;p.inputs['IOR'].default_value=1.45
    mirror=mat('silver mirror','EFF2F0',.018,1)
    curtain=mat('cream shower curtain','F0E9D4',.7);blue=mat('curtain aqua accents','80B6C0',.65);yellow=mat('curtain yellow accents','E6CD78',.65)
    navy=mat('navy towel','1C354D',.94);taupe=mat('taupe towel','958574',.98);pink=mat('dusty rose towel','B6878D',.98)
    def link(o,name):
        for c in list(o.users_collection):c.objects.unlink(o)
        col.objects.link(o);o.name=PREFIX+name;return o
    def box(name,x0,x1,y0,y1,z0,z1,m=white,bev=.002):
        verts=[(x,y,z) for z in (z0,z1) for y in (y0,y1) for x in (x0,x1)]
        faces=[(0,2,3,1),(4,5,7,6),(0,1,5,4),(2,6,7,3),(0,4,6,2),(1,3,7,5)]
        o=mesh(name,verts,faces,m)
        if bev:mod=o.modifiers.new('Soft manufactured edges','BEVEL');mod.width=bev;mod.segments=3
        return o
    def mesh(name,verts,faces,m,smooth=False):
        me=bpy.data.meshes.new(name);me.from_pydata([(x,y,F+z) for x,y,z in verts],[],faces);me.materials.append(m);me.update();o=bpy.data.objects.new(PREFIX+name,me);col.objects.link(o)
        bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free()
        for p in me.polygons:p.use_smooth=smooth
        return o
    def rod(name,points,r,m=chrome):
        cu=bpy.data.curves.new(name,'CURVE');cu.dimensions='3D';cu.bevel_depth=r;cu.bevel_resolution=3;sp=cu.splines.new('POLY');sp.points.add(len(points)-1)
        for p,(x,y,z) in zip(sp.points,points):p.co=(x,y,F+z,1)
        o=bpy.data.objects.new(PREFIX+name,cu);col.objects.link(o);cu.materials.append(m);return o
    def cyl(name,loc,r,h,m=chrome,axis='Z'):
        N=48
        verts=[(r*math.cos(i*2*math.pi/N),r*math.sin(i*2*math.pi/N),zz) for zz in (-h/2,h/2) for i in range(N)]
        faces=[tuple(range(N-1,-1,-1)),tuple(range(N,2*N))]+[(i,(i+1)%N,(i+1)%N+N,i+N) for i in range(N)]
        me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.materials.append(m);me.update()
        o=bpy.data.objects.new(PREFIX+name,me);col.objects.link(o);o.location=(loc[0],loc[1],F+loc[2])
        if axis=='X':o.rotation_euler.y=math.pi/2
        if axis=='Y':o.rotation_euler.x=math.pi/2
        for p in me.polygons:p.use_smooth=len(p.vertices)==4
        return o
    def shell(name,cx,cy,profiles,m,power=2,caps=True):
        # Closed cross-section from outer underside, over lip, into hollow inner bowl.
        N=96;verts=[]
        for rx,ry,z in profiles:
            for j in range(N):
                a=2*math.pi*j/N;co=math.cos(a);si=math.sin(a)
                verts.append((cx+rx*math.copysign(abs(co)**(2/power),co),cy+ry*math.copysign(abs(si)**(2/power),si),z))
        faces=[]
        for k in range(len(profiles)-1):
            for j in range(N):a=k*N+j;b=k*N+(j+1)%N;faces.append((a,b,b+N,a+N))
        
        if caps:faces.extend([tuple(range(N-1,-1,-1)),tuple((len(profiles)-1)*N+j for j in range(N))])
        return mesh(name,verts,faces,m,True)
    def pull(name,cx,y,z,w=.075):
        rod(name,[(cx+w*math.cos(math.pi+t*math.pi/24),y-.014*math.sin(t*math.pi/24),z+w*.50*math.sin(math.pi+t*math.pi/24)) for t in range(25)],.006,black)
        for x in (cx-w,cx+w):cyl(name+' fixing',(x,y+.003,z),.009,.012,chrome,'Y')
    def light(name,loc,target,energy,size,color=(1,.89,.75),collection=col):
        ld=bpy.data.lights.new(PREFIX+name,'AREA');ld.energy=energy;ld.size=size;ld.color=color;o=bpy.data.objects.new(ld.name,ld);collection.objects.link(o);o.visible_glossy=False;o.location=(loc[0],loc[1],F+loc[2]);o.rotation_euler=(Vector((target[0],target[1],F+target[2]))-o.location).to_track_quat('-Z','Y').to_euler();return o
    # Tiles remain separate editable pieces, regular grout and sparse black diamonds.
    wall_tiles={}
    def tiled_wall(name,axis,pos,a0,a1,z0,z1,step=.25):
        rows=math.ceil((z1-z0)/step);cols=math.ceil((a1-a0)/step)
        for i in range(cols):
            for j in range(rows):
                a=a0+i*step+.0014;b=min(a0+(i+1)*step-.0014,a1);z=z0+j*step+.0014;zz=min(z0+(j+1)*step-.0014,z1)
                if b<=a or zz<=z:continue
                if axis=='X':o=box(name+' tile',pos,pos+.011,a,b,z,zz,tile,.0007)
                else:o=box(name+' tile',a,b,pos,pos+.011,z,zz,tile,.0007)
                wall_tiles[(name,i,j)]=(o,axis,pos,(a+b)/2,(z+zz)/2)
    def diamond(wall,i,j):
        # Derive motif placement directly from its tile, including trimmed edge tiles.
        tile_object,axis,pos,a,z=wall_tiles[(wall,i,j)]
        surface=pos+.0116 if axis=='X' else pos-.0006
        outline=[]
        for radius in (.046,.037):
            for da,dz in [(0,radius),(radius,0),(0,-radius),(-radius,0)]:
                outline.append((surface,a+da,z+dz) if axis=='X' else (a+da,surface,z+dz))
        o=mesh('black diamond tile motif',outline,[(k,(k+1)%4,(k+1)%4+4,k+4) for k in range(4)],black)
        o['decor_tile']=tile_object.name;o['tile_center_m']=(a,z);o['pattern_position']='Exact tile centre; flat glazed decoration'
        tile_object['decorated']=True
    box('floor dark grout bed',.28,2.78,6.54,8.72,.001,.012,floorgrout,0)
    for i in range(10):
        for j in range(9):
            x=.28+i*.25;y=6.54+j*.25
            box('square ivory floor tile',x+.002,min(x+.248,2.778),y+.002,min(y+.248,8.718),.012,.022,floor,.001)
    tiled_wall('left bath wall','X',.283,6.54,8.71,.022,2.79)
    tiled_wall('right towel wall','X',2.755,6.54,8.71,.022,2.79)
    # User confirms former rear window was closed up; replace it with masonry.
    for o in list(bpy.data.objects):
        if o.name.startswith('Bathroom rear window'):bpy.data.objects.remove(o,do_unlink=True)
    infill=box('confirmed closed former window masonry',.90,2.65,8.718,9.0,1.85,2.40,bpy.data.materials['Warm white plaster'],0)
    box('closed rear wall tile substrate',.28,2.78,8.69,8.712,.02,2.80,grout,0)
    tiled_wall('rear tiled wall','Y',8.676,.294,2.755,.022,2.79)
    tiled_wall('entrance left wall','Y',6.542,.295,1.847,.022,2.79)
    tiled_wall('entrance right jamb','Y',6.542,2.693,2.755,.022,2.79)
    tiled_wall('entrance lintel','Y',6.542,1.847,2.693,2.10,2.79)
    for i,j in [(2,4),(4,7),(6,4),(6,9),(0,8)]:diamond('left bath wall',i,j)
    for i,j in [(3,7),(5,10),(7,9)]:diamond('rear tiled wall',i,j)
    # Bathtub 74 x 170 cm with true recessed bathing well, tiled apron and overflow.
    tub=shell('bathtub sculpted enamel and hollow bowl',.676,7.826,[(.364,.844,.075),(.371,.85,.55),(.371,.85,.586),(.330,.808,.596),(.300,.769,.570),(.255,.675,.205),(.195,.59,.17),(.005,.01,.17)],ceramic,5)
    tub['estimated_dimensions_m']='0.74 x 1.70 x 0.60'
    box('tub apron tile backing',1.025,1.053,6.978,8.675,.02,.55,grout,0)
    tiled_wall('tub front apron','X',1.054,6.981,8.673,.022,.55)
    box('tub foot backing',.298,1.054,6.964,6.983,.022,.55,grout,0)
    tiled_wall('tub foot apron','Y',6.951,.30,1.052,.022,.55)
    diamond('tub front apron',2,1)
    cyl('bath drain',(.676,8.37,.191),.028,.005,chrome)
    cyl('bath overflow',(.676,8.580,.455),.031,.010,chrome,'Y')
    # Mixer and riser on the long wall near the washbasins.
    for yy in (8.16,8.31):
        cyl('bath mixer wall rose',(.319,yy,.81),.029,.024,chrome,'X');rod('bath mixer wall elbow',[(.32,yy,.81),(.385,yy,.81)],.014)
    rod('thermostatic bath mixer',[(.395,8.095,.805),(.395,8.365,.805)],.022)
    rod('bath spout',[(.399,8.23,.805),(.49,8.23,.79),(.50,8.23,.755)],.014)
    for yy in (8.10,8.36):cyl('thermostat end grip',(.395,yy,.805),.024,.041,chrome,'Y')
    rod('shower riser rail',[(.335,8.31,1.08),(.335,8.31,2.22)],.012)
    for zz in (1.09,2.20):rod('rail wall bracket',[(.306,8.31,zz),(.346,8.31,zz)],.017)
    rod('shower head handle',[(.348,8.31,1.98),(.425,8.31,2.12)],.018)
    head=cyl('hand shower head',(.474,8.31,2.13),.055,.020,chrome);head.rotation_euler.y=-.40
    cyl('hand shower spray face',(.479,8.31,2.119),.047,.004,dark)
    rod('flexible shower hose',[(.407+.07*math.sin(i*math.pi/48),8.31-.10*math.sin(i*math.pi/48),1.98-1.4*i/48) for i in range(49)]+[(.40,8.16,.58),(.39,8.12,.67),(.40,8.16,.78)],.009)
    # Narrow aluminium-framed bath screen at head of bath, adjacent vanity.
    box('bath screen clear pane',1.037,1.045,8.10,8.665,.605,2.09,glass,.001)
    for y in (8.097,8.666):box('screen upright frame',1.025,1.055,y-.008,y+.008,.586,2.105,chrome,.002)
    for z in (.605,2.09):box('screen horizontal frame',1.025,1.055,8.09,8.675,z,z+.013,chrome,.002)
    rod('curtain pole',[(1.015,6.99,2.38),(1.015,8.67,2.38)],.012)
    # Folded curtain towards bath head: real folds and muted coloured print stripes.
    verts=[];faces=[];N=56
    for j in range(17):
        z=.65+j*1.69/16
        for i in range(N+1):
            t=i/N;verts.append((1.012+.024*math.sin(t*math.pi*16),8.35+t*.30,z))
    for j in range(16):
        for i in range(N):a=j*(N+1)+i;faces.append((a,a+1,a+N+2,a+N+1))
    o=mesh('gathered shower curtain',verts,faces,curtain,True);o.data.materials.append(blue);o.data.materials.append(yellow)
    for p in o.data.polygons:
        row=p.index//N;p.material_index=1 if row in (9,10) else 2 if row in (6,7) else 0
    for i in range(7):
        y=8.36+i*.046
        rod('curtain ring',[(1.015+.021*math.cos(t*2*math.pi/24),y,2.37+.025*math.sin(t*2*math.pi/24)) for t in range(25)],.0025,white)
    print('Bathroom: envelope, tiles, bath and shower complete',flush=True)
    # Three-door vanity, black counter, two truly concave oval washbasins.
    box('vanity recessed plinth',1.095,2.328,8.24,8.656,.04,.135,dark)
    # Open carcass leaves the basin undersides and actual bowl drains unobstructed.
    box('vanity carcass bottom',1.078,2.363,8.156,8.658,.12,.15)
    box('vanity carcass back',1.078,2.363,8.633,8.658,.15,.816)
    for x in (1.078,2.341):box('vanity carcass side',x,x+.022,8.156,8.658,.15,.816)
    for i in range(3):
        a=1.081+i*.427;box('vanity white door '+str(i+1),a,a+.420,8.128,8.154,.137,.811,white,.008);pull('vanity black U handle',a+.21,8.119,.765,.038)
    top=box('black stone counter with twin sink cutouts',1.057,2.375,8.097,8.674,.816,.89,stone,.006)
    # Boolean holes ensure the counter never fills the concave ceramic basins.
    for x in (1.390,2.045):
        bpy.ops.mesh.primitive_cylinder_add(vertices=96,radius=1,depth=.5,location=(x,8.361,F+.85));c=bpy.context.object;c.scale=(.240,.185,1);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
        mod=top.modifiers.new('Oval opening','BOOLEAN');mod.operation='DIFFERENCE';mod.object=c;bpy.context.view_layer.objects.active=top;bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(c,do_unlink=True)
        shell('oval inset ceramic washbasin',x,8.361,[(.005,.004,.708),(.180,.120,.72),(.260,.205,.896),(.267,.211,.905),(.251,.195,.912),(.231,.174,.878),(.145,.103,.745),(.025,.018,.735),(.001,.001,.735)],ceramic)
        cyl('basin pop-up drain',(x,8.342,.739),.021,.005,chrome)
        cyl('basin overflow',(x,8.531,.864),.009,.003,dark,'Y')
        box('basin mixer square base',x-.025,x+.025,8.557,8.604,.89,.918,chrome,.008)
        box('basin mixer upright',x-.019,x+.019,8.563,8.598,.913,1.027,chrome,.009)
        rod('basin mixer spout',[(x,8.58,1.02),(x,8.51,1.027),(x,8.483,1.006)],.015)
        box('basin tap lever',x-.014,x+.014,8.529,8.602,1.044,1.054,chrome,.006)
    # Mirror cabinet with sliding mirrored doors, aluminium tracks and light pelmet.
    box('mirror cabinet body',1.075,2.364,8.521,8.674,1.135,2.185,white,.004)
    for a,b in [(1.095,1.724),(1.731,2.344)]:box('sliding mirror',a,b,8.503,8.512,1.166,2.158,mirror,.001)
    for x in (1.076,2.349):box('mirror side frame',x,x+.015,8.487,8.525,1.14,2.181,chrome)
    for z in (1.145,2.164):box('mirror horizontal sliding track',1.076,2.364,8.484,8.53,z,z+.015,chrome)
    box('mirror sliding centre trim',1.719,1.729,8.485,8.515,1.166,2.16,chrome,.001)
    box('white over-mirror light canopy',1.058,2.377,8.335,8.678,2.183,2.383,white,.005)
    glow=mat('warm lamp glass','FFF1CD',.25);p=glow.node_tree.nodes.get('Principled BSDF');p.inputs['Emission Color'].default_value=rgb('FFE2AB');p.inputs['Emission Strength'].default_value=3
    for x in (1.40,2.04):
        cyl('canopy recessed spotlight rim',(x,8.408,2.179),.035,.009,chrome);cyl('canopy spotlight diffuser',(x,8.408,2.173),.025,.005,glow)
        light('canopy downward light',(x,8.408,2.166),(x,8.25,.85),7,.075)
    box('tall right cabinet carcass',2.386,2.741,8.283,8.678,.13,2.385)
    for z0,z1 in [(.15,.72),(.731,.883),(.895,2.375)]:
        box('tall cabinet door or drawer',2.386,2.741,8.257,8.281,z0,z1,white,.007);pull('tall cabinet black U pull',2.561,8.245,z1-.062 if z1<1 else 1.12,.035)
    # Electrical outlet visible to right of sinks.
    box('white electrical socket',2.241,2.317,8.655,8.674,1.041,1.118,white,.008)
    for x in (2.267,2.291):cyl('socket pin aperture',(x,8.651,1.078),.003,.002,dark,'Y')
    # Tiled service wall and open illuminated recess at tub foot.
    box('concealed cistern service wall',1.062,1.805,6.557,6.761,.022,1.11,grout,0)
    tiled_wall('WC service wall front','Y',6.766,1.064,1.803,.022,1.10)
    box('WC ledge slab',1.045,1.823,6.55,6.811,1.104,1.132,tile,.003)
    box('niche left pier',.298,.402,6.554,6.975,.02,2.79,tile)
    box('niche right pier',.92,1.064,6.554,6.975,.02,2.79,tile)
    box('niche back',.402,.92,6.557,6.58,.57,2.46,white)
    box('niche lower solid',.40,.921,6.554,6.976,.022,.575,tile)
    box('niche head',.40,.921,6.554,6.976,2.43,2.79,tile)
    for z in (.585,1.035,1.52,1.965):
        box('niche glass shelf',.406,.916,6.585,6.963,z,z+.008,glass,.001)
        for x in (.414,.908):cyl('niche shelf support',(x,6.867,z-.009),.008,.012,chrome,'X')
    cyl('niche downlight rim',(.66,6.79,2.428),.033,.010,chrome);cyl('niche downlight',(.66,6.79,2.421),.024,.006,glow)
    light('niche light',(.66,6.79,2.409),(.66,6.76,.65),4,.08)
    tiled_wall('niche right pier front','Y',6.976,.921,1.064,.022,2.79)
    tiled_wall('niche left pier front','Y',6.976,.298,.402,.022,2.79)
    tiled_wall('niche side facing WC','X',1.065,6.558,6.985,.022,2.79)
    # Wall-hung WC as seen in photographs, oval open seat and raised lid.
    wc=shell('wall hung toilet hollow bowl',1.445,7.026,[(.11,.16,.235),(.18,.26,.29),(.193,.294,.417),(.170,.267,.433),(.146,.228,.416),(.11,.15,.303),(.02,.035,.283)],ceramic)
    box('WC back connector',1.29,1.60,6.777,6.826,.265,.38,ceramic,.015)
    # Ring built as continuous annular tube profile.
    shell('WC oval seat open centre',1.445,7.026,[(.194,.296,.437),(.196,.298,.451),(.188,.288,.463),(.145,.234,.463),(.143,.232,.448),(.146,.237,.437),(.194,.296,.437)],white,caps=False)
    # Flattened oval lid, not a bevel-clamped rectangular box.
    vs=[];fs=[];N=64;M=16
    for j in range(M+1):
        phi=math.pi*j/M
        for i in range(N):
            a=2*math.pi*i/N;vs.append((1.445+.193*math.sin(phi)*math.cos(a),6.818+.017*math.cos(phi),.701+.254*math.sin(phi)*math.sin(a)))
    for j in range(M):
        for i in range(N):a=j*N+i;b=j*N+(i+1)%N;fs.append((a,b,b+N,a+N))
    mesh('WC raised oval lid',vs,fs,white,True)
    box('dual flush plate',1.305,1.585,6.782,6.798,.823,.997,white,.016)
    box('flush button division',1.446,1.449,6.799,6.801,.84,.98,grout,.001)
    cyl('toilet brush cup',(1.122,6.985,.15),.045,.255,chrome);rod('toilet brush handle',[(1.122,6.985,.24),(1.122,6.985,.48)],.009,black)
    cyl('paper holder round base',(1.797,7.124,.04),.119,.016,chrome)
    rod('freestanding toilet paper post',[(1.797,7.124,.045),(1.797,7.124,.635),(1.797,7.265,.635)],.008)
    cyl('toilet roll',(1.797,7.205,.636),.053,.11,white,'Y')
    cyl('pedal bin body',(2.532,8.017,.175),.115,.30,chrome);cyl('pedal bin lid',(2.532,8.017,.333),.119,.015,chrome);box('bin pedal',2.497,2.567,7.875,7.93,.04,.055,black,.005)
    # Empty white tubular ladder radiator, matching user's supplied reference.
    # Five uneven groups: 4 / 5 / 6 / 7 / 9 rungs from top to bottom.
    radiator_white=mat('radiator white powder coat','F1F3F2',.28)
    rx=2.696;ya=7.15;yb=7.71;bottom=.21;top=1.91
    for y in (ya,yb):
        cyl('radiator round vertical collector',(rx,y,(bottom+top)/2),.018,top-bottom,radiator_white)
        cyl('radiator end cap',(rx,y,top+.003),.015,.006,radiator_white)
    reference_rows=[[47,74,101,128],[229,255,283,310,337],[438,465,493,520,548,575],[676,704,731,758,786,813,841],[941,969,996,1023,1050,1076,1104,1130,1158]]
    for group,rows in enumerate(reference_rows,1):
        for row in rows:
            z=top-(row-24)*(top-bottom)/1160
            rung=cyl('radiator round rung group '+str(group),(rx,(ya+yb)/2,z),.0105,yb-ya,radiator_white,'Y')
            rung['group_top_to_bottom']=group
    for y,z in [(ya+.14,1.813),(yb-.14,1.813),((ya+yb)/2,.39)]:
        cyl('radiator wall mounting',(2.729,y,z),.014,.046,radiator_white,'X')
        cyl('radiator mounting collar',(rx-.012,y,z),.020,.012,radiator_white,'X')
    for y in ((ya+yb)/2-.028,(ya+yb)/2+.028):
        cyl('radiator lower central connector',(rx,y,.199),.012,.037,radiator_white)
    col['radiator_reference']='User image bcb9d8df: white round tubes, 5 groups 4/5/6/7/9, empty; estimated 60 x 170 cm.'
    # Small fixed reference accessories: cups, soap pump, stacked clean linens.
    aqua=mat('aqua accessories','69B6B0',.38);soap=mat('soap bottle','E5E1D7',.36)
    for x in (1.53,2.24):
        shell('black toothbrush cup',x,8.565,[(.03,.03,.893),(.033,.033,1.00),(.027,.027,1.00),(.026,.026,.902)],black)
        rod('toothbrush handle',[(x,8.565,.94),(x-.013,8.562,1.071)],.004,white)
    cyl('soap dispenser body',(1.72,8.56,.959),.032,.125,soap);rod('soap pump',[(1.72,8.56,1.02),(1.72,8.56,1.055),(1.755,8.56,1.055)],.006,black)
    for i,m in enumerate((taupe,pink,white)):box('folded niche towel',.455,.853,6.63,6.932,1.973+i*.042,2.009+i*.042,m,.012)
    for i,(x,m,h) in enumerate([(.48,soap,.16),(.60,pink,.19),(.77,yellow,.17)]):
        cyl('niche bottle',(x,6.82,1.046+h/2),.032,h,m);cyl('niche bottle cap',(x,6.82,1.049+h),.019,.025,black)
    # A clean floor makes the fitted room geometry legible; portable stool retained.
    box('folding step stool top',2.023,2.322,7.843,8.063,.235,.264,black,.007)
    for x in (2.045,2.285):box('folding stool side',x,x+.022,7.855,8.05,.023,.237,taupe,.003)
    for i in range(7):
        for j in range(5):cyl('stool grip dot',(2.044+i*.042,7.865+j*.042,.266),.006,.002,white)
    print('Bathroom: all fixtures and accessories complete',flush=True)
    # Room-specific ceiling only linked to interior scenes, so upper cutaway remains readable.
    ceil=box('bathroom ceiling',.28,2.78,6.54,8.72,2.80,2.825,plaster,0);col.objects.unlink(ceil)
    ceilingcol=bpy.data.collections.get('Bathroom interior ceiling') or bpy.data.collections.new('Bathroom interior ceiling');ceilingcol.objects.link(ceil)
    light('soft ceiling illumination',(1.72,7.55,2.67),(1.4,7.85,.2),65,1.25,(1,.90,.78))
    light('entry fill',(2.1,6.67,2.25),(1.1,8.3,1.1),30,.85,(.87,.93,1))
    scenes=[]
    views=[(17,'BATHROOM - bath and double vanity',(2.45,6.68,1.69),(1.48,8.22,1.25),19),
           (18,'BATHROOM - niche and toilet',(2.46,8.10,1.72),(1.03,6.94,1.12),19),
           (19,'BATHROOM - complete overhead',(1.53,7.60,5.1),(1.53,7.60,0),None),
           (20,'BATHROOM - empty towel radiator',(1.12,7.9,1.36),(2.70,7.45,1.10),22)]
    for number,name,loc,target,lens in views:
        name='%02d | %s'%(number,name);sc=bpy.data.scenes.get(name) or bpy.data.scenes.new(name)
        for c in list(sc.collection.children):sc.collection.children.unlink(c)
        for o in list(sc.collection.objects):bpy.data.objects.remove(o,do_unlink=True)
        if lens:sc.collection.children.link(root);sc.collection.children.link(ceilingcol)
        else:sc.collection.children.link(col)
        sc.render.engine='CYCLES';sc.cycles.preview_samples=16;sc.cycles.use_preview_denoising=True;sc.cycles.samples=32;sc.cycles.use_denoising=True;sc.cycles.max_bounces=10;sc.cycles.transmission_bounces=8;sc.render.resolution_x=1400;sc.render.resolution_y=1250;sc.render.resolution_percentage=85;sc.render.threads_mode='FIXED';sc.render.threads=8
        sc.world=bpy.data.worlds.new(name+' world');sc.world.use_nodes=True;sc.world.node_tree.nodes['Background'].inputs[0].default_value=(.8,.85,1,1);sc.world.node_tree.nodes['Background'].inputs[1].default_value=.18;sc.view_settings.view_transform='AgX';sc.unit_settings.system='METRIC'
        cam=bpy.data.objects.new(PREFIX+'camera '+str(number),bpy.data.cameras.new('Bathroom camera'));sc.collection.objects.link(cam);cam.location=(loc[0],loc[1],F+loc[2]);cam.rotation_euler=(Vector((target[0],target[1],F+target[2]))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.clip_start=.015
        if lens:cam.data.lens=lens
        else:cam.data.type='ORTHO';cam.data.ortho_scale=3.15
        sc.camera=cam;sc['reference_notes']='Five user photos 2026-09-24; footprint retained 2.50 x 2.18 m; fixtures estimated. WC in bathroom, storage room remains storage. Former rear window closed, confirmed by user.';scenes.append(sc)
    col['reference']='20260924_151210.jpg; 151225.jpg; 151213.jpg; 151223.jpg; clipboard niche photograph'
    col['measurement_status']='Photo-based estimated fixture dimensions, not surveyed.'
    notes='''BADKAMER — fotoreconstructie 24 september 2026
Scenes 17–20: bad/wastafels, toilet/nis, bovenaanzicht en lege handdoekradiator.
Bestaande ruimte: 2,50 x 2,18 m, plafond 2,80 m uit model; geen nieuwe opmeting.
Geschat: bad 74 x 170 cm; wastafelmeubel 132 x 58 cm; hoge kast 36 cm breed; wand- en vloertegels circa 25 cm.
Volledig bewerkbaar: hol bad, 2 holle ovale wastafels, zwart blad met openingen, drie kastdeuren, U-grepen, spiegelkast, spots, hoge kast, chroom douche/mengkranen/slang, scherm, gordijn, betegelde nis met glasplanken, hangtoilet met spoelplaat, lege witte buisradiator en vaste accessoires.
Decoratieve ruitmotieven liggen exact in het midden van hun tegel; vlakke decoratie. Radiator volgens extra gebruikersfoto: vijf groepen ronde buizen (4/5/6/7/9), zonder handdoeken of haken. Geschat circa 60 x 170 cm.
Toilet in badkamer volgens foto; naastliggende BERGING blijft berging. Dit vervangt de oude algemene melding dat op deze verdieping geen toilet is.
Gebruiker bevestigt dat het vroegere raam achter de wastafelwand dichtgemaakt is. Raam verwijderd en opening gevuld met muur en tegels.
Losse vloerrommel, speelgoed en persoon/spiegelbeeld niet gereconstrueerd.
'''
    txt=bpy.data.texts.get('BATHROOM - photo reconstruction notes') or bpy.data.texts.new('BATHROOM - photo reconstruction notes');txt.clear();txt.write(notes)
    general=bpy.data.texts.get('START HERE - model assumptions')
    if general:
        previous=general.as_string().replace('there is NO WC on that floor.','the bathroom has a WC visible in user photos; the separate storage room remains storage.')
        general.clear();general.write(previous+'\nBATHROOM: scenes 17-19; former window closed, user confirmed. See BATHROOM notes.\n')
    Path(__file__).with_name('BATHROOM_NOTES.txt').write_text(notes)
    for o in col.objects:o['model_status']='Photo reconstruction; dimensions estimated; see BATHROOM notes'
    return scenes

if __name__=='__main__':
    import sys,shutil
    root=Path(__file__).resolve().parent;main=root/'Huis_Oude_Terelststraat_15.blend';backup=root/'Huis_before_bathroom_photo.blend'
    if not backup.exists():shutil.copy2(main,backup)
    scenes=update_bathroom_photo();bpy.context.window.scene=scenes[0]
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type=='VIEW_3D':area.spaces.active.region_3d.view_perspective='CAMERA';area.spaces.active.shading.type='RENDERED'
    bpy.ops.wm.save_as_mainfile(filepath=str(main))
    for sc,filename in zip(scenes,['bathroom_vanity.png','bathroom_niche_wc.png','bathroom_overhead.png','bathroom_radiator.png']):
        bpy.context.window.scene=sc;sc.render.image_settings.file_format='PNG';sc.render.filepath=str(root/filename);bpy.ops.render.render(write_still=True,scene=sc.name)
    bpy.context.window.scene=scenes[0];bpy.ops.wm.save_as_mainfile(filepath=str(main))
