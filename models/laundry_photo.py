"""Clean ground-floor laundry reconstructed from the user's September 2026 photos."""
import bpy,math
from mathutils import Vector

def update_laundry_photo():
    root=bpy.data.collections['00 | GROUND - 2021']
    previous=bpy.data.collections.get('00 / Laundry photo fittings')
    if previous:
        for o in list(previous.objects):bpy.data.objects.remove(o,do_unlink=True)
        bpy.data.collections.remove(previous)
    for o in list(bpy.data.objects):
        if o.name.startswith(('Laundry appliance','Appliance circular door')):bpy.data.objects.remove(o,do_unlink=True)
    col=bpy.data.collections.new('00 / Laundry photo fittings');root.children.link(col)
    exploded=bpy.data.collections.get('EXPLODED source 0 - cutaway')
    if exploded:exploded.children.link(col)
    def rgb(h):return tuple((int(h[i:i+2],16)/255)**2.2 for i in (0,2,4))+(1,)
    def mat(name,color,rough=.5,metal=0):
        m=bpy.data.materials.get(name) or bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=rgb(color)
        p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=rgb(color);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal;return m
    white=bpy.data.materials['Camber - premium white matt W1000 ST9'];plaster=bpy.data.materials['Warm white plaster']
    enamel=mat('Laundry - white appliance enamel','EFF0EF',.25);metal=mat('Laundry - brushed stainless steel','AFB6B9',.26,.85);black=mat('Laundry - dark glass and controls','141B21',.18);rubber=mat('Laundry - rubber seal','303237',.65);red=mat('Laundry - red expansion vessel','942E27',.28);brass=mat('Laundry - brass plumbing','AD9060',.32,.65);niche=mat('Laundry - grey taupe appliance recess','817B73',.8)
    def link(o):
        for c in list(o.users_collection):c.objects.unlink(o)
        col.objects.link(o);return o
    def box(name,x0,x1,y0,y1,z0,z1,material=white,bevel=.003):
        bpy.ops.mesh.primitive_cube_add(size=1,location=((x0+x1)/2,(y0+y1)/2,(z0+z1)/2));o=link(bpy.context.object);o.name='Laundry photo / '+name;o.dimensions=(x1-x0,y1-y0,z1-z0);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(material)
        if bevel:m=o.modifiers.new('Soft edges','BEVEL');m.width=bevel;m.segments=3
        return o
    def cyl(name,loc,r,h,material,axis='Z'):
        bpy.ops.mesh.primitive_cylinder_add(vertices=48,radius=r,depth=h,location=loc);o=link(bpy.context.object);o.name='Laundry photo / '+name;o.data.materials.append(material)
        if axis=='X':o.rotation_euler.y=math.pi/2
        if axis=='Y':o.rotation_euler.x=math.pi/2
        for p in o.data.polygons:p.use_smooth=len(p.vertices)==4
        return o
    def rod(name,points,r,material):
        cu=bpy.data.curves.new(name,'CURVE');cu.dimensions='3D';cu.bevel_depth=r;cu.bevel_resolution=3;sp=cu.splines.new('POLY');sp.points.add(len(points)-1)
        for p,co in zip(sp.points,points):p.co=(*co,1)
        o=bpy.data.objects.new('Laundry photo / '+name,cu);col.objects.link(o);cu.materials.append(material);return o
    def ring(name,x,y,z,r,t,material):
        bpy.ops.mesh.primitive_torus_add(major_segments=64,minor_segments=12,location=(x,y,z),major_radius=r,minor_radius=t,rotation=(0,math.pi/2,0));o=link(bpy.context.object);o.name='Laundry photo / '+name;o.data.materials.append(material)
        for p in o.data.polygons:p.use_smooth=True
        return o
    # Full-height tower and open low basket space, then two machines on storage pedestals.
    box('tower body',.34,.93,7.32,7.98,.08,2.19)
    box('tower low cubby shadow',.934,.939,7.343,7.955,.10,.31,niche)
    box('tower main door',.942,.963,7.327,7.973,.33,1.61)
    box('tower upper door',.942,.963,7.327,7.973,1.625,2.182)
    for y in (7.985,9.265):box('machine niche side',.34,.99,y,y+.025,.08,2.19)
    box('appliance niche back',.342,.36,8.01,9.265,.35,1.42,niche)
    box('raised machine shelf',.35,1.00,8.01,9.265,.32,.35)
    box('storage pedestal',.35,.958,8.01,9.265,.075,.32)
    for j in range(2):
        ya=8.025+j*.62;yb=ya+.599;cy=(ya+yb)/2
        box('pedestal drawer %d'%j,.966,.991,ya,yb,.087,.302)
        box('pedestal pull %d'%j,.992,.995,ya+.025,yb-.025,.294,.306,niche,.001)
        box(('washing machine' if j==0 else 'dryer')+' enamel body',.365,.982,ya,yb,.354,1.204,enamel,.016)
        box('appliance front %d'%j,.984,.998,ya+.008,yb-.008,.37,1.19,enamel,.012)
        z=.775
        cyl('door recessed drum %d'%j,(1.005,cy,z),.199,.018,black,'X')
        ring('door outer rim %d'%j,1.023,cy,z,.222,.028,black if j==0 else enamel)
        ring('door chrome inner rim %d'%j,1.032,cy,z,.196,.009,metal)
        cyl('dark glass window %d'%j,(1.03,cy,z),.185,.008,black,'X')
        ring('inner drum rim %d'%j,1.036,cy,z,.143,.006,rubber)
        box('control panel %d'%j,1.001,1.007,ya+.015,yb-.015,1.07,1.181,enamel,.004)
        cyl('selector %d'%j,(1.028,cy-.03,1.132),.033,.034,metal if j==0 else enamel,'X')
        box('digital display %d'%j,1.010,1.016,cy+.06,cy+.252,1.091,1.164,black,.003)
        for k in range(4):box('display key',1.017,1.019,cy+.073+k*.04,cy+.093+k*.04,1.095,1.099,metal,.001)
        box('detergent drawer %d'%j,1.009,1.017,ya+.026,cy-.093,1.108,1.177,enamel,.002)
        box('detergent drawer line %d'%j,1.018,1.019,ya+.035,cy-.10,1.107,1.110,niche,.0005)
        if j==1:
            for k in range(8):box('dryer low vent',1.008,1.012,ya+.40,yb-.035,.417+k*.009,.421+k*.009,niche,.001)
        cu=bpy.data.curves.new('Laundry appliance label','FONT');cu.body='SAMSUNG' if j==0 else 'BOSCH';cu.size=.019;cu.extrude=.0001
        ob=bpy.data.objects.new('Laundry photo / appliance label %d'%j,cu);col.objects.link(ob);ob.location=(1.022,ya+.031,1.145);ob.rotation_euler=(math.pi/2,0,math.pi/2);cu.materials.append(niche)
    box('wide overhead flap door',.943,.974,8.01,9.264,1.41,1.616)
    box('overhead cupboard carcass',.345,.94,8.01,9.264,1.41,2.19)
    for j in range(2):box('upper cupboard door',.944,.969,8.017+j*.624,8.63+j*.624,1.63,2.182)
    # Worktop and white base cupboards turn beneath the high rear window.
    stone=mat('Laundry - pale grey worktop','C0BFBA',.6)
    n=stone.node_tree.nodes;l=stone.node_tree.links;p=n.get('Principled BSDF');noise=n.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=65;ramp=n.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].color=rgb('AAA9A4');ramp.color_ramp.elements[1].color=rgb('D1D0C9');l.new(noise.outputs['Fac'],ramp.inputs[0]);l.new(ramp.outputs[0],p.inputs['Base Color'])
    box('left return base',.34,.95,9.30,10.59,.08,.885)
    for y0,y1 in [(9.306,9.944),(9.95,10.58)]:
        box('left return door',.958,.984,y0,y1,.10,.868)
        box('left recessed pull',.961,.982,y0+.012,y1-.012,.869,.881,niche,.001)
    box('left return worktop',.33,1.015,9.30,10.61,.885,.915,stone,.006)
    box('rear sink cabinet',1.015,2.70,10.05,10.60,.08,.70)
    for i in range(3):
        x=1.02+i*.558;box('rear cabinet door',x,x+.55,10.016,10.044,.10,.869)
        box('rear recessed pull',x+.01,x+.54,10.019,10.045,.87,.881,niche,.001)
    # Four slabs leave a true opening for the metal sink.
    for name,x0,x1,y0,y1 in [('left',1.015,1.59,10.00,10.62),('right',2.23,2.72,10.00,10.62),('front',1.59,2.23,10.00,10.145),('rear',1.59,2.23,10.535,10.62)]:box('rear worktop '+name,x0,x1,y0,y1,.885,.915,stone,.003)
    box('sink recessed bottom',1.603,2.217,10.156,10.524,.701,.717,metal,.022)
    for x in (1.59,2.217):box('sink bowl side',x,x+.013,10.145,10.535,.71,.917,metal,.004)
    for y in (10.145,10.522):box('sink bowl end',1.59,2.23,y,y+.013,.71,.917,metal,.004)
    for x in (1.575,2.224):box('sink lip side',x,x+.021,10.132,10.547,.915,.921,metal,.004)
    for y in (10.13,10.531):box('sink lip end',1.575,2.245,y,y+.019,.915,.921,metal,.004)
    cyl('sink drain',(1.91,10.34,.718),.025,.003,metal)
    rod('mixer upright',[(1.92,10.575,.919),(1.92,10.575,1.135)],.017,metal)
    rod('mixer curved spout',[(1.92,10.575,1.11),(1.92,10.57,1.18),(1.92,10.53,1.205),(1.92,10.45,1.205),(1.92,10.43,1.17)],.012,metal)
    rod('mixer lever',[(1.92,10.577,1.12),(1.83,10.577,1.145)],.006,metal)
    box('short rear overhead cupboard',.35,.685,9.31,10.57,1.56,2.18)
    for i in range(2):box('rear upper cupboard door',.689,.711,9.32+i*.623,9.935+i*.623,1.571,2.172)
    # Existing horizontal rear window retains its surveyed opening; white frame and sill.
    for o in bpy.data.objects:
        if o.name.startswith('Laundry window') and 'glass' not in o.name.lower():
            o.data.materials.clear();o.data.materials.append(white)
    box('rear white window sill',.92,2.55,10.57,10.84,1.595,1.622)
    # Neat permanent utility corner: compact freezer, red expansion vessel and pipes.
    box('compact freezer body',.36,.95,6.60,7.20,.035,.885,enamel,.015)
    box('compact freezer door',.958,.983,6.606,7.194,.05,.864,enamel,.012)
    box('freezer vertical handle',.985,1.009,6.648,6.671,.56,.79,enamel,.006)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=40,ring_count=24,location=(.595,6.88,1.84));o=link(bpy.context.object);o.name='Laundry photo / red expansion vessel';o.scale=(.235,.24,.265);o.data.materials.append(red)
    for p in o.data.polygons:p.use_smooth=True
    # Metal wall straps wrap around the vessel.
    for yy in (6.74,7.02):
        pts=[(.595+.239*math.sin(a),yy,1.84+.27*math.cos(a)) for a in [j*2*math.pi/64 for j in range(65)]];rod('vessel retaining strap',pts,.009,metal)
    rod('vessel outlet',[(.59,6.88,1.58),(.59,6.88,1.48),(.40,6.88,1.48)],.018,brass)
    box('vessel valve handle',.54,.64,6.862,6.879,1.492,1.51,red,.002)
    for yy in (6.41,6.48):rod('vertical service pipe',[(.37,yy,.02),(.37,yy,2.18)],.014,white)
    # Pale oak-look planks distinct from the dark stone tiles in the entrance hall.
    floor=mat('Laundry - pale washed oak plank floor','C9C3B7',.62);n=floor.node_tree.nodes;l=floor.node_tree.links;p=n.get('Principled BSDF')
    g=n.new('ShaderNodeNewGeometry');mapping=n.new('ShaderNodeVectorMath');mapping.operation='MULTIPLY';mapping.inputs[1].default_value=(35,1.3,4);l.new(g.outputs['Position'],mapping.inputs[0])
    noise=n.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=2;noise.inputs['Detail'].default_value=4;l.new(mapping.outputs[0],noise.inputs['Vector'])
    ramp=n.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].color=rgb('ADA79B');ramp.color_ramp.elements[1].color=rgb('E1DACD');l.new(noise.outputs['Fac'],ramp.inputs[0])
    tiles=n.new('ShaderNodeTexBrick');tiles.inputs['Scale'].default_value=1;tiles.inputs['Brick Width'].default_value=.19;tiles.inputs['Row Height'].default_value=1.2;tiles.inputs['Mortar Size'].default_value=.0006;l.new(g.outputs['Position'],tiles.inputs['Vector'])
    mix=n.new('ShaderNodeMixRGB');l.new(tiles.outputs['Fac'],mix.inputs[0]);l.new(ramp.outputs[0],mix.inputs[1]);mix.inputs[2].default_value=rgb('9C978D');l.new(mix.outputs[0],p.inputs['Base Color'])
    box('washed oak laundry floor',.332,2.73,6.312,10.62,.001,.006,floor,0)
    # Black drum ceiling light, photographed above the aisle.
    blackshade=mat('Laundry - black drum lampshade','28292A',.65)
    cyl('black drum ceiling light',(1.61,8.65,2.075),.165,.20,blackshade)
    diffuser=mat('Laundry - lamp diffuser','F4F0E5',.3);pp=diffuser.node_tree.nodes.get('Principled BSDF');pp.inputs['Emission Color'].default_value=rgb('FFF3D9');pp.inputs['Emission Strength'].default_value=2
    cyl('ceiling lamp diffuser',(1.61,8.65,1.974),.146,.004,diffuser)
    ld=bpy.data.lights.new('Laundry ceiling warm light','AREA');ld.energy=38;ld.color=(1,.9,.77);ld.shape='DISK';ld.size=.28;lo=bpy.data.objects.new(ld.name,ld);col.objects.link(lo);lo.location=(1.61,8.65,1.96)
    # Two views of the same clean room, both use the existing first-floor slab as ceiling.
    scenes=[]
    for number,name,loc,target,lens in [(14,'LAUNDRY - clean photo layout',(2.60,7.14,1.63),(.94,9.33,1.08),22),(15,'LAUNDRY - sink and utility corner',(2.57,10.08,1.60),(.65,7.72,1.18),21)]:
        sc=bpy.data.scenes.get('%02d | %s'%(number,name)) or bpy.data.scenes.new('%02d | %s'%(number,name))
        for c in list(sc.collection.children):sc.collection.children.unlink(c)
        for o in list(sc.collection.objects):bpy.data.objects.remove(o,do_unlink=True)
        sc.collection.children.link(root);sc.collection.children.link(bpy.data.collections['01 / Slab'])
        sc.render.engine='CYCLES';sc.cycles.samples=16;sc.cycles.use_denoising=True;sc.render.resolution_x=1500;sc.render.resolution_y=1200;sc.render.resolution_percentage=80;sc.render.threads_mode='FIXED';sc.render.threads=8
        sc.world=bpy.data.worlds.new('Laundry daylight');sc.world.use_nodes=True;sc.world.node_tree.nodes['Background'].inputs[0].default_value=(.72,.8,.9,1);sc.world.node_tree.nodes['Background'].inputs[1].default_value=.3;sc.view_settings.view_transform='AgX'
        cam=bpy.data.objects.new('Laundry view camera',bpy.data.cameras.new('Laundry view camera'));sc.collection.objects.link(cam);cam.location=loc;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=lens;sc.camera=cam
        ld=bpy.data.lights.new('Laundry window daylight','AREA');ld.energy=85;ld.shape='RECTANGLE';ld.size=1.4;ld.size_y=.4
        lo=bpy.data.objects.new(ld.name,ld);sc.collection.objects.link(lo);lo.location=(1.73,10.55,1.82);lo.rotation_euler=(Vector((1.3,8.3,.8))-lo.location).to_track_quat('-Z','Y').to_euler()
        ld=bpy.data.lights.new('Laundry soft entry fill','AREA');ld.energy=45;ld.size=1.2
        lo=bpy.data.objects.new(ld.name,ld);sc.collection.objects.link(lo);lo.location=(2.25,6.50,1.7);lo.rotation_euler=(Vector((.6,8.8,1.0))-lo.location).to_track_quat('-Z','Y').to_euler()
        sc['reference_notes']='Photo-based fitted laundry, clean and uncluttered; cabinet sizes estimated, existing room footprint retained.';scenes.append(sc)
    return scenes
