"""Smallest bedroom: six user photos, 24 September 2026. Editable geometry.
Run against current main .blend. All unmeasured dimensions are estimates.
"""
import bpy, bmesh, math, random
from mathutils import Vector
from pathlib import Path
F=5.31
P='Small bedroom / '

def update_small_bedroom():
    random.seed(24)
    bpy.context.window.scene=bpy.data.scenes['01 | HOUSE - exterior']
    root=bpy.data.collections['02 | SECOND - archive reconstruction']
    for o in list(bpy.data.objects):
        if o.name.startswith(P):bpy.data.objects.remove(o,do_unlink=True)
    for name in ['02 / Small bedroom furniture','02 / Small bedroom finishes','Small bedroom interior ceiling']:
        c=bpy.data.collections.get(name)
        if c:bpy.data.collections.remove(c)
    col=bpy.data.collections.new('02 / Small bedroom furniture');root.children.link(col)
    col['shelf_rows']=5;col['shelf_columns']=4
    col['shelf_height_status']='Five rows confirmed by user; estimated overall height 1.82 m.'
    finishes=bpy.data.collections.new('02 / Small bedroom finishes');root.children.link(finishes)
    ceiling=bpy.data.collections.new('Small bedroom interior ceiling')
    for name in ['EXPLODED source 2 - cutaway']:
        c=bpy.data.collections.get(name)
        if c:c.children.link(col);c.children.link(finishes)
    sc=bpy.data.scenes.get('12 | UPPER FLOOR - corrected complete layout')
    if sc:sc.collection.children.link(col);sc.collection.children.link(finishes)
    furniture=bpy.data.collections['02 / Furniture']
    removed=[]
    for o in list(furniture.objects):
        if o.name.startswith(('Bed base','Mattress','Headboard','Pillow','Folded blanket')) and o.location.x<2.78 and o.location.y<3.24:
            removed.append(o.name);bpy.data.objects.remove(o,do_unlink=True)
    def rgb(h):return tuple((int(h[i:i+2],16)/255)**2.2 for i in (0,2,4))+(1,)
    def mat(name,h,rough=.65,texture=False):
        m=bpy.data.materials.get(P+name) or bpy.data.materials.new(P+name);m.use_nodes=True;m.diffuse_color=rgb(h)
        p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=rgb(h);p.inputs['Roughness'].default_value=rough
        if texture and not m.node_tree.nodes.get('Fabric weave'):
            n=m.node_tree.nodes.new('ShaderNodeTexNoise');n.name='Fabric weave';n.inputs['Scale'].default_value=190;n.inputs['Detail'].default_value=2
            b=m.node_tree.nodes.new('ShaderNodeBump');b.inputs['Strength'].default_value=.22;b.inputs['Distance'].default_value=.0013
            m.node_tree.links.new(n.outputs['Fac'],b.inputs['Height']);m.node_tree.links.new(b.outputs[0],p.inputs['Normal'])
        return m
    white=mat('warm white lacquer','EEEDE8',.38);cream=mat('canopy ivory fabric','F2EEE2',.91,True)
    pinkwall=mat('photographed pink wall','CA62AA',.92);pink=mat('pale pink bedding','E9BACD',.93,True)
    binpink=mat('pink fabric storage cubes','DFAAC9',.92,True);binwhite=mat('white fabric storage cubes','E8E7E1',.92,True)
    oak=mat('pale oak shelf edges','D3C5AE',.55);brown=mat('taupe brown sofa fabric','66524A',.94,True)
    dark=mat('charcoal details','272324',.73);seam=mat('brown cushion piping','625146',.94)
    sage=mat('canopy printed sage leaves','849B7D',.91);rose=mat('printed dusty rose','C28F9B',.85)
    purple=mat('plush lavender','AA87C3',.95,True);blue=mat('plush turquoise','51B4CA',.95,True)
    yellow=mat('plush yellow','E8C84D',.96,True);red=mat('plush red','C94238',.93,True)
    skin=mat('doll peach','EDC6AC',.94);green=mat('soft green','A5AF7D',.93);hair=mat('doll auburn hair','B06F45',.96,True)
    def mesh(name,vs,fs,m,c=col,smooth=False):
        me=bpy.data.meshes.new(P+name);me.from_pydata([(x,y,F+z) for x,y,z in vs],[],fs);me.update();me.materials.append(m)
        bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free()
        o=bpy.data.objects.new(P+name,me);c.objects.link(o)
        for p in me.polygons:p.use_smooth=smooth
        return o
    def box(name,x0,x1,y0,y1,z0,z1,m=white,b=.003,c=col):
        o=mesh(name,[(x,y,z) for z in (z0,z1) for y in (y0,y1) for x in (x0,x1)],[(0,2,3,1),(4,5,7,6),(0,1,5,4),(2,6,7,3),(0,4,6,2),(1,3,7,5)],m,c)
        if b:mod=o.modifiers.new('Rounded edges','BEVEL');mod.width=b;mod.segments=4
        return o
    def rod(name,pts,r,m=white,c=col):
        cu=bpy.data.curves.new(P+name,'CURVE');cu.dimensions='3D';cu.bevel_depth=r;cu.bevel_resolution=3;cu.use_fill_caps=True
        sp=cu.splines.new('POLY');sp.points.add(len(pts)-1)
        for p,(x,y,z) in zip(sp.points,pts):p.co=(x,y,F+z,1)
        o=bpy.data.objects.new(P+name,cu);c.objects.link(o);cu.materials.append(m);return o
    def ell(name,loc,scale,m,c=col):
        # Direct mesh, independent of current selection and active scene.
        n=24;k=16;vs=[]
        for j in range(k+1):
            a=math.pi*j/k
            for i in range(n):
                t=math.tau*i/n;vs.append((loc[0]+scale[0]*math.sin(a)*math.cos(t),loc[1]+scale[1]*math.sin(a)*math.sin(t),loc[2]+scale[2]*math.cos(a)))
        fs=[(j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i) for j in range(k) for i in range(n)]
        return mesh(name,vs,fs,m,c,True)
    def fabric_surface(name,x0,x1,y0,y1,z,m,amp=.015):
        n=28;k=20;vs=[]
        for j in range(k+1):
            y=y0+(y1-y0)*j/k
            for i in range(n+1):
                x=x0+(x1-x0)*i/n;zz=z+amp*(math.sin(x*23+y*11)+.43*math.sin(y*48-x*15))*math.sin(math.pi*i/n)
                vs.append((x,y,zz))
        fs=[(j*(n+1)+i,j*(n+1)+i+1,(j+1)*(n+1)+i+1,(j+1)*(n+1)+i) for j in range(k) for i in range(n)]
        o=mesh(name,vs,fs,m,smooth=True);s=o.modifiers.new('Fabric thickness','SOLIDIFY');s.thickness=.006;return o
    # Room is 2.50 x 2.96 m. Pink is on world -X, the right side when entering.
    box('pink accent wall lining',.280,.289,.281,3.24,.005,2.80,pinkwall,0,finishes)
    box('white rear wall lining',.291,1.79,3.231,3.239,.006,2.80,white,0,finishes)
    for x0,x1 in [(.29,.305),(2.757,2.777)]:box('side skirting',x0,x1,.291,3.225,.008,.073,white,.002,finishes)
    box('rear skirting',.305,1.79,3.212,3.23,.008,.073,white,.002,finishes)
    box('front skirting',.29,2.77,.282,.305,.008,.073,white,.002,finishes)
    floor=mat('pale grey whitewashed oak floor','D4D0C8',.68)
    ns=floor.node_tree.nodes;ls=floor.node_tree.links;p=ns.get('Principled BSDF')
    tc=ns.new('ShaderNodeTexCoord');v=ns.new('ShaderNodeVectorMath');v.operation='MULTIPLY';v.inputs[1].default_value=(35,1.4,3);ls.new(tc.outputs['Object'],v.inputs[0]);noise=ns.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=2;ls.new(v.outputs[0],noise.inputs['Vector'])
    ramp=ns.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].color=rgb('BFBAB3');ramp.color_ramp.elements[1].color=rgb('E3DFD8');ls.new(noise.outputs[0],ramp.inputs[0]);ls.new(ramp.outputs[0],p.inputs['Base Color'])
    for i in range(14):
        x=.291+i*.18
        for j in range(4):
            y=.29+j*.96-(i%3)*.31;ya=max(.29,y);yb=min(3.229,y+.958)
            if yb>ya:box('floor plank %02d %02d'%(i,j),x,min(x+.179,2.772),ya,yb,.001,.009,floor,.0005,finishes)
    box('ceiling',.28,2.78,.28,3.24,2.80,2.825,white,0,ceiling)
    # Existing front window opening is retained; its painted frame follows the photos.
    for o in bpy.data.collections['02 / Walls front'].objects:
        if o.name.startswith('2 front 0') and 'glass' not in o.name:
            o.data.materials.clear();o.data.materials.append(white)
    box('deep white windowsill',.865,2.72,.095,.43,.855,.885,white,.006)
    # White panel radiator and repeated convection fins below window.
    box('radiator body',1.00,2.58,.303,.412,.19,.76,white,.009)
    for i in range(43):
        x=1.013+i*.0363;box('radiator pressed rib',x,x+.019,.412,.425,.22,.735,white,.006)
        box('radiator top vent',x,x+.015,.328,.401,.762,.764,dark,.001)
    rod('radiator valve pipe',[(2.60,.35,.08),(2.60,.35,.49),(2.57,.35,.49)],.012)
    ell('radiator thermostat',(2.625,.36,.50),(.025,.039,.025),white)
    # Subtle zebra roller blind: translucent continuous cloth with alternating opaque bands.
    blind=mat('sheer roller blind','F4F1E8',.93);bs=blind.node_tree.nodes.get('Principled BSDF');bs.inputs['Transmission Weight'].default_value=.42
    for i in range(9):
        z=.94+i*.158;box('blind opaque band',.955,2.625,.206,.208,z,z+.086,cream,0)
        box('blind sheer band',.955,2.625,.207,.209,z+.086,z+.157,blind,0)
    rod('blind bottom rail',[(.95,.21,.932),(2.63,.21,.932)],.01,white)
    # User-confirmed five rows; four columns retained. Estimated 147 x 182 x 39 cm.
    xa=2.36;xb=2.75;ya=.47;yb=1.94;th=.037;step=.35
    for y in (ya,yb-th):box('KALLAX outer upright',xa,xb,y,y+th,.051,1.797,oak)
    for z in (.014,1.797):box('KALLAX outer horizontal',xa,xb,ya,yb,z,z+th,oak)
    for j in range(1,4):
        y=ya+th+j*step-.016;box('KALLAX vertical divider',xa,xb,y,y+.016,.051,1.797,oak,.001)
    for j in range(1,5):
        z=.051+j*step-.016;box('KALLAX shelf',xa,xb,ya+th,yb-th,z,z+.016,oak,.001)
    for j in range(4):
        y=ya+th+j*step+.005
        for row in (1,2,3,4):
            z=.055+row*.35;m=binpink if row==1 else binwhite
            box('fabric bin cavity',xa+.015,xb-.025,y,y+.324,z,z+.321,dark,.008)
            box('fabric bin front',xa-.008,xa+.008,y,y+.324,z,z+.319,m,.004)
            box('fabric bin left side',xa,xb-.03,y,y+.006,z,z+.32,m,.002)
            box('fabric bin right side',xa,xb-.03,y+.318,y+.324,z,z+.32,m,.002)
            # Narrow dark recessed handhold, near the top as visible in photos.
            box('fabric bin recessed handle',xa-.010,xa-.008,y+.113,y+.211,z+.279,z+.296,dark,.006)
    # Low white child's bed across the window; head at the shelf end.
    for x in (.375,2.085):
        for y in (.495,1.20):box('bed square leg',x-.025,x+.025,y-.025,y+.025,.012,.405,white,.005)
    for y in (.472,1.221):box('bed long rail',.35,2.11,y,y+.026,.265,.416,white,.005)
    box('bed headboard',2.10,2.135,.472,1.249,.30,.72,white,.015)
    box('bed low foot end',.333,.363,.472,1.249,.29,.53,white,.008)
    box('mattress',.366,2.095,.50,1.222,.351,.47,pink,.035)
    fabric_surface('pink fitted sheet',.38,2.08,.51,1.218,.478,pink,.006)
    pillow=box('white pillow',1.65,2.04,.56,1.16,.488,.592,binwhite,.05)
    fabric_surface('pink rumpled duvet',.51,1.52,.54,1.20,.511,pink,.026)
    for i in range(2):box('underbed storage box',.48+i*.71,1.13+i*.71,.52,1.19,.04,.235,binwhite,.025)
    # Half-length cream tunnel tent with real curved fabric, edging, arched print and vines.
    def canopy(x,t,extra=0):return (x,.855+(.379+extra)*math.cos(t),.51+(.75+extra)*math.sin(t))
    vs=[canopy(.36+1.04*i/18,math.pi*j/48) for i in range(19) for j in range(49)]
    fs=[(i*49+j,(i+1)*49+j,(i+1)*49+j+1,i*49+j+1) for i in range(18) for j in range(48)]
    tent=mesh('cream floral tunnel canopy',vs,fs,cream,smooth=True);sol=tent.modifiers.new('Sewn fabric','SOLIDIFY');sol.thickness=.0015
    for x in (.36,1.40):rod('canopy flexible arch',[canopy(x,j*math.pi/64,.006) for j in range(65)],.009,oak)
    for t in (.04,math.pi-.04):rod('canopy lower hem',[canopy(x,t,.005) for x in (.36,1.40)],.007,oak)
    # Printed arch in side of tent, and delicately distributed botanical leaves.
    arch=[(.55,0.12),(.55,.50)]+[(.82-.27*math.cos(t),.50+.44*math.sin(t)) for t in [i*math.pi/32 for i in range(33)]]+[(1.09,.12)]
    rod('canopy printed fairy doorway',[canopy(x,t,.003) for x,t in arch],.006,sage)
    for branch in range(5):
        x0=.41+branch*.22
        rod('printed trailing vine',[canopy(x0+.02*math.sin(t*7),t,.003) for t in [i*.055 for i in range(51)]],.0025,sage)
        for k in range(17):
            t=.10+k*.15;x=x0+.02*math.sin(t*7);side=1 if k%2 else -1
            ps=[canopy(x,t,.005),canopy(x+side*.027,t+.021,.005),canopy(x+side*.042,t+.061,.005),canopy(x+side*.011,t+.060,.005)]
            mesh('canopy sage printed leaf',ps,[(0,1,2,3)],sage)
    for x,t in [(.56,1.0),(1.16,.45),(.9,2.1),(1.25,1.65)]:
        for side in (-1,1):mesh('canopy butterfly',[canopy(x,t,.008),canopy(x+side*.05,t+.06,.008),canopy(x+side*.04,t-.05,.008)],[(0,1,2)],rose)
    # Compact two-seat brown sofa on the pink wall, with soft cushions and piping.
    for x in (.41,.94):
        for y in (1.46,2.52):box('sofa short wooden foot',x-.032,x+.032,y-.032,y+.032,.01,.12,oak,.004)
    box('sofa upholstered base',.34,1.06,1.35,2.64,.10,.285,brown,.05)
    box('sofa padded back',.31,.46,1.34,2.65,.24,.76,brown,.047)
    for y in (1.34,2.53):box('sofa armrest',.34,1.075,y,y+.12,.23,.61,brown,.044)
    for ya,yb in [(1.475,1.99),(2.00,2.525)]:
        box('sofa seat cushion',.44,1.035,ya,yb,.28,.405,brown,.045)
        rod('sofa cushion piping',[(1.034,ya+.032,.382),(1.044,ya+.08,.382),(1.044,yb-.08,.382),(1.034,yb-.032,.382)],.003,seam)
    # Portable two-by-three cube cupboard against rear white wall, black corner connectors.
    for a in range(2):
        for b in range(3):
            x=.315+a*.355;z=.025+b*.355
            box('modular cube back',x,x+.35,3.185,3.195,z,z+.35,binwhite,.001)
            for xx in (x,x+.345):box('modular cube side',xx,xx+.006,2.833,3.192,z,z+.35,binwhite,.001)
            for zz in (z,z+.345):box('modular cube shelf',x,x+.35,2.833,3.192,zz,zz+.006,binwhite,.001)
            box('modular cube illustrated door',x+.008,x+.342,2.825,2.831,z+.008,z+.342,binwhite,.007)
            ell('cube black finger hole',(x+.307,2.823,z+.17),(.009,.002,.009),dark)
            # Decorative woodland illustrations: trees, mushroom, hedgehog, leaves.
            cx=x+.17;cz=z+.17;idx=b*2+a
            if idx in (0,4):
                rod('printed tree trunk',[(cx,2.821,cz-.095),(cx,2.821,cz+.018)],.008,rose)
                for dx,dz in [(0,.056),(-.045,.025),(.044,.032),(-.027,.072),(.029,.073)]:ell('tree print',(cx+dx,2.821,cz+dz),(.042,.001,.041),rose)
            elif idx==5:
                box('mushroom printed stem',cx-.012,cx+.012,2.819,2.822,cz-.07,cz+.02,rose,.002)
                ell('mushroom printed cap',(cx,2.821,cz+.031),(.068,.001,.056),rose)
                for dx,dz in [(-.03,.032),(.02,.056),(.038,.017),(-.013,.072)]:ell('mushroom white spot',(cx+dx,2.818,cz+dz),(.008,.001,.011),white)
            elif idx==2:
                ell('hedgehog printed body',(cx,2.821,cz),(.067,.001,.049),rose)
                ell('hedgehog print snout',(cx+.059,2.819,cz-.019),(.031,.001,.020),skin)
            else:
                rod('printed leaf stalk',[(cx-.03,2.82,cz-.08),(cx+.028,2.82,cz+.08)],.003,rose)
                for side,zoff in [(-1,-.04),(1,0),(-1,.04)]:ell('woodland printed leaf',(cx+side*.032,2.819,cz+zoff),(.032,.001,.019),rose)
    for i in range(3):
        for j in range(4):
            for y in (2.822,3.198):ell('modular cube black connector',(.312+i*.355,y,.025+j*.355),(.020,.014,.020),dark)
    # White rocking chair, oriented into the room, turned slightly away from the sofa.
    chair=[]
    def cb(*a,**kw):o=box(*a,**kw);chair.append(o);return o
    def cr(*a,**kw):o=rod(*a,**kw);chair.append(o);return o
    cx=1.45;cy=2.68
    for x in (cx-.275,cx+.275):
        cr('rocker curved runner',[(x,cy-.48+j*.96/40,.027+.13*((j-20)/20)**2) for j in range(41)],.027)
        cr('rocker front leg',[(x,cy-.25,.055),(x,cy-.225,.69)],.024)
        cr('rocker rear upright',[(x,cy+.25,.059),(x,cy+.19,.45),(x,cy+.28,1.07)],.025)
        cr('rocker armrest',[(x,cy-.33,.68),(x,cy+.235,.71)],.037)
    for i in range(6):
        x=cx-.238+i*.095;cb('rocker seat slat',x,x+.07,cy-.255,cy+.22,.435,.463,white,.006)
    for i in range(6):
        x=cx-.218+i*.087;cr('rocker back spindle',[(x,cy+.206,.49),(x,cy+.272,.979)],.017)
    cr('rocker back curved crest',[(cx-.27+i*.54/30,cy+.28,1.002+.039*math.sin(math.pi*i/30)) for i in range(31)],.037)
    cr('rocker front seat rail',[(cx-.26,cy-.249,.426),(cx+.26,cy-.249,.426)],.022)
    # Oval woven basket on chair, explicitly open with woven sides and rim.
    wicker=mat('honey wicker basket','B78A55',.75)
    for j in range(9):
        z=.47+j*.018;rx=.17+j*.004;ry=.13+j*.003
        rod('basket woven horizontal',[(cx+rx*math.cos(t),cy+ry*math.sin(t),z) for t in [k*math.tau/64 for k in range(65)]],.004,wicker)
    for i in range(32):
        t=i*math.tau/32;rod('basket vertical weave',[(cx+(.17+j*.004)*math.cos(t),cy+(.13+j*.003)*math.sin(t),.47+j*.018) for j in range(9)],.003,wicker)
    ell('basket bottom',(cx,cy,.469),(.175,.134,.006),wicker)
    # User requested a toy-free room: no plush toys, doll cot or play accessories.
    # Detailed reference-derived transparent texture, packed in the blend file.
    from small_bedroom_bear import update_small_bedroom_bear
    update_small_bedroom_bear()
    # A small framed drawing remains on top of the modular cupboard.
    navy=mat('dark blue drawing background','263855',.8)
    box('drawing frame on cube',.39,.82,3.075,3.115,1.102,1.49,oak,.005)
    box('drawing blue paper',.405,.807,3.069,3.074,1.12,1.475,navy,.001)
    ell('drawing painted moon',(.72,3.067,1.39),(.04,.001,.05),yellow)
    # Dedicated interior and overhead scenes use the same original editable objects.
    def light(sc,name,loc,target,power,size,color=(1,.96,.90)):
        d=bpy.data.lights.new(P+name,'AREA');d.energy=power;d.shape='DISK';d.size=size;d.color=color
        o=bpy.data.objects.new(P+name,d);sc.collection.objects.link(o);o.location=(loc[0],loc[1],F+loc[2]);o.rotation_euler=(Vector((target[0],target[1],F+target[2]))-o.location).to_track_quat('-Z','Y').to_euler()
    scenes=[]
    views=[(21,'SMALL BEDROOM - photo reconstruction',(1.66,3.075,2.04),(1.50,1.22,.80),18),
           (22,'SMALL BEDROOM - sofa and rocking chair',(2.12,.78,1.78),(1.17,2.36,.93),20),
           (23,'SMALL BEDROOM - complete overhead',(1.53,1.75,5.8),(1.53,1.75,0),None)]
    for number,label,loc,target,lens in views:
        name='%02d | %s'%(number,label);sc=bpy.data.scenes.get(name) or bpy.data.scenes.new(name)
        for c in list(sc.collection.children):sc.collection.children.unlink(c)
        for o in list(sc.collection.objects):bpy.data.objects.remove(o,do_unlink=True)
        if lens:sc.collection.children.link(root);sc.collection.children.link(ceiling)
        else:sc.collection.children.link(col);sc.collection.children.link(finishes)
        sc.render.engine='CYCLES';sc.cycles.preview_samples=16;sc.cycles.use_preview_denoising=True;sc.cycles.samples=28;sc.cycles.use_denoising=True;sc.cycles.max_bounces=8;sc.cycles.device='CPU'
        sc.render.resolution_x=1500;sc.render.resolution_y=1220;sc.render.resolution_percentage=100;sc.render.threads_mode='FIXED';sc.render.threads=8
        sc.world=bpy.data.worlds.new(P+label);sc.world.use_nodes=True;sc.world.node_tree.nodes['Background'].inputs[0].default_value=(.78,.86,1,1);sc.world.node_tree.nodes['Background'].inputs[1].default_value=.18
        sc.view_settings.view_transform='AgX';sc.unit_settings.system='METRIC'
        d=bpy.data.cameras.new(P+label);cam=bpy.data.objects.new(P+label,d);sc.collection.objects.link(cam);cam.location=(loc[0],loc[1],F+loc[2]);cam.rotation_euler=(Vector((target[0],target[1],F+target[2]))-cam.location).to_track_quat('-Z','Y').to_euler();sc.camera=cam;d.clip_start=.015
        if lens:d.lens=lens
        else:d.type='ORTHO';d.ortho_scale=3.9
        light(sc,'window daylight '+str(number),(1.79,.44,2.03),(1.55,2.1,.48),80,1.5,(.86,.93,1))
        light(sc,'soft ceiling bounce '+str(number),(1.6,1.96,2.60),(1.3,1.2,.0),42,1.8)
        light(sc,'entry bounce '+str(number),(2.45,2.94,2.18),(.4,1.5,.9),16,1.2)
        sc['reference_notes']='Six user photos 2026-09-24. Smallest bedroom, existing footprint 2.50 x 2.96 m. Furniture estimated, KALLAX proportions reference only.';scenes.append(sc)
    notes='''KLEINSTE SLAAPKAMER — zes foto’s 24 september 2026
Scenes 21–23: zicht vanaf inkom, zeteltje/schommelstoel, bovenaanzicht.
Bestaande kamer behouden: x .28–2.78, y .28–3.24, vloer +5.31 m; circa 2.50 x 2.96 m; hoogte 2.80 m. Dit is de bestaande archiefreconstructie, geen nieuwe opmeting.
Roze accentwand links op het grondplan (= rechts bij binnenkijken richting raam). Bed dwars voor raam met hoofd aan vakkenkastzijde en gebogen stoffen tent aan roze wand. Bruin tweezitszeteltje langs roze wand, 2x3 kunststof kubuskast in achterhoek, witte schommelstoel. Speelgoed, knuffels, poppenbedje en bijbehorende speelaccessoires zijn op verzoek verwijderd.
Gebruiker bevestigt dat de vakkenkast vijf vakken hoog is; vier kolommen behouden. Geschatte buitenmaat nu 147 cm breed x 182 cm hoog x 39 cm diep, met één extra bovenste rij witte bakken. KALLAX-achtige vakverhoudingen, geen bevestigde productidentificatie. De overige meubelmaten en precieze typen zijn geschat. Bed buitenmaat circa 180 x 78 cm. Zeteltje circa 130 x 75 cm. Modulaire kunststofkast circa 71 x 37 x 107 cm. Bestaande raamopening en licht-eiken slaapkamerdeur behouden.
Tent en prints, teddy-muursticker, stoffering, witte radiator, rolgordijn, laminaat en schommelstoel volledig in bewerkbare geometrie/materialen. Speelgoed en knuffels volledig verwijderd op verzoek. Vloerrommel weggelaten. De beer met zes hartballonnen gebruikt een ingepakte transparante referentietextuur; zie SMALL BEDROOM - bear decal.
Herbouwscript: small_bedroom_photo.py. Voorafgaande versie: Huis_before_small_bedroom_photo.blend.
'''
    txt=bpy.data.texts.get('SMALL BEDROOM - photo reconstruction notes') or bpy.data.texts.new('SMALL BEDROOM - photo reconstruction notes');txt.clear();txt.write(notes)
    Path(__file__).with_name('SMALL_BEDROOM_NOTES.txt').write_text(notes)
    for c in (col,finishes):
        c['reference']='20260924_170328.jpg; 170244.jpg; 170247.jpg; 170323.jpg; 170323(0).jpg; 170329.jpg'
        for o in c.objects:o['model_status']='Photo reconstruction; dimensions estimated; see SMALL BEDROOM notes'
    from small_bedroom_bear import create_bear_detail_view
    create_bear_detail_view()
    print('SMALL BEDROOM COMPLETE:',len(col.objects),'furniture objects;',len(finishes.objects),'finish objects; replaced',removed,flush=True)
    return scenes

if __name__=='__main__':
    import shutil,sys
    root=Path(__file__).resolve().parent;main=root/'Huis_Oude_Terelststraat_15.blend';backup=root/'Huis_before_small_bedroom_photo.blend'
    if not backup.exists():shutil.copy2(main,backup)
    scenes=update_small_bedroom();bpy.context.window.scene=scenes[0]
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type=='VIEW_3D':
                area.spaces.active.region_3d.view_perspective='CAMERA';area.spaces.active.shading.type='RENDERED';area.spaces.active.overlay.show_overlays=False
    bpy.ops.wm.save_as_mainfile(filepath=str(main))
    for sc,fn in zip(scenes,['small_bedroom_view.png','small_bedroom_seating.png','small_bedroom_overhead.png']):
        bpy.context.window.scene=sc;sc.render.image_settings.file_format='PNG';sc.render.filepath=str(root/fn)
        bpy.ops.render.render(write_still=True,scene=sc.name)
    bpy.context.window.scene=scenes[0];bpy.ops.wm.save_as_mainfile(filepath=str(main))
