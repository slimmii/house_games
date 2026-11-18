"""Photo reconstruction of the entry / window corner, 28 September 2026.

Furniture sizes are photo estimates. Room shell and other furniture are retained.
"""
import bpy, math, json, shutil, sys
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parent
F = 5.31
P = 'Bedroom 1 entry corner / '
REF = ROOT / 'textures' / 'bedroom1_corner_horses_reference.png'


def update_bedroom1_entry_corner():
    col = bpy.data.collections['02 / Bedroom 1 furniture']
    for ob in list(bpy.data.objects):
        if ob.name.startswith((P, 'Bedroom 1 dollhouse / ', 'Bedroom 1 / pine dollhouse',
                               'Bedroom 1 / opposite cupboard', 'Bedroom 1 / Opposite wall white cupboard')):
            bpy.data.objects.remove(ob, do_unlink=True)

    def rgb(h):
        return tuple((int(h[i:i+2], 16)/255)**2.2 for i in (0, 2, 4)) + (1,)

    def mat(name, h, rough=.55, metal=0):
        m = bpy.data.materials.get(P+name) or bpy.data.materials.new(P+name)
        m.use_nodes = True; m.diffuse_color = rgb(h)
        ns=m.node_tree.nodes; ns.clear()
        bs=ns.new('ShaderNodeBsdfPrincipled'); out=ns.new('ShaderNodeOutputMaterial')
        m.node_tree.links.new(bs.outputs['BSDF'],out.inputs['Surface'])
        bs.inputs['Base Color'].default_value=rgb(h)
        bs.inputs['Roughness'].default_value=rough; bs.inputs['Metallic'].default_value=metal
        return m

    white=mat('ivory lacquer','EEECE6',.42)
    panelwhite=mat('toy white infill','E9E7E2',.65)
    wood=mat('warm peach pine','BC8051',.51)
    pink=mat('pink toy furniture','D887AD',.6)
    pale=mat('blush toy wallpaper','E8C7CF',.85)
    blue=mat('pastel blue toy wallpaper','AFC8D2',.83)
    cream=mat('toy cream upholstery','EFE0D0',.88)
    black=mat('dark handles and feet','24272A',.6)
    silver=mat('steel screws','A5AAAD',.25,.8)
    metal=mat('white powder coated steel','E3E2D9',.5,.25)
    red=mat('small fabric labels','B93C3B',.8)
    navy=mat('deep blue corduroy','334958',.94)
    ns=navy.node_tree.nodes; links=navy.node_tree.links; bs=ns.get('Principled BSDF')
    tc=ns.new('ShaderNodeTexCoord'); wave=ns.new('ShaderNodeTexWave')
    wave.wave_type='BANDS'; wave.bands_direction='X'; wave.inputs['Scale'].default_value=38
    wave.inputs['Distortion'].default_value=.12; wave.inputs['Detail Scale'].default_value=3
    links.new(tc.outputs['Generated'],wave.inputs['Vector'])
    ramp=ns.new('ShaderNodeValToRGB'); ramp.color_ramp.elements[0].color=rgb('111F2A'); ramp.color_ramp.elements[1].color=rgb('243845')
    links.new(wave.outputs['Color'],ramp.inputs[0]); links.new(ramp.outputs[0],bs.inputs['Base Color'])
    bump=ns.new('ShaderNodeBump'); bump.inputs['Strength'].default_value=.4; bump.inputs['Distance'].default_value=.003
    links.new(wave.outputs['Color'],bump.inputs['Height']); links.new(bump.outputs[0],bs.inputs['Normal'])
    bs.inputs['Sheen Weight'].default_value=.10

    def group(name, origin, angle=0, size=None):
        ob=bpy.data.objects.new(P+name+' CONTROL',None); col.objects.link(ob)
        ob.location=(origin[0],origin[1],F); ob.rotation_euler.z=angle
        ob['reference']='Seven user photographs, 2026-09-28'; ob['dimensions_are_estimated']=True
        if size: ob['estimated_size_m']=size
        ob.empty_display_size=.1
        return ob

    def attach(ob,name,material,parent):
        ob.name=P+name
        for c in list(ob.users_collection): c.objects.unlink(ob)
        col.objects.link(ob); ob.parent=parent
        if material: ob.data.materials.append(material)
        return ob

    def box(name,loc,size,material,parent,bevel=.003):
        bpy.ops.mesh.primitive_cube_add(size=1,location=loc)
        ob=bpy.context.object; ob.dimensions=size
        bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
        attach(ob,name,material,parent)
        if bevel:
            mod=ob.modifiers.new('Soft edges','BEVEL'); mod.width=bevel; mod.segments=4
            mod=ob.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
        return ob

    def rod(name,pts,r,material,parent):
        cu=bpy.data.curves.new(P+name,'CURVE'); cu.dimensions='3D'; cu.bevel_depth=r; cu.bevel_resolution=2; cu.use_fill_caps=True
        sp=cu.splines.new('POLY'); sp.points.add(len(pts)-1)
        for p,xyz in zip(sp.points,pts): p.co=(*xyz,1)
        ob=bpy.data.objects.new(P+name,cu); col.objects.link(ob); ob.parent=parent; cu.materials.append(material)
        return ob

    def ell(name,loc,size,material,parent):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=16,location=loc)
        ob=bpy.context.object; ob.scale=size; attach(ob,name,material,parent)
        for p in ob.data.polygons: p.use_smooth=True
        return ob

    def surface(name,vertices,faces,material,parent):
        me=bpy.data.meshes.new(P+name); me.from_pydata(vertices,[],faces); me.update()
        ob=bpy.data.objects.new(P+name,me); col.objects.link(ob); ob.parent=parent; me.materials.append(material)
        return ob

    def knob(name,x,y,z,parent):
        rod(name+' stem',[(x,y,z),(x,y-.018,z)],.006,white,parent)
        ell(name,(x,y-.022,z),(.014,.011,.014),white,parent)

    # One tall door, three low drawers, round white knobs and four short feet.
    cabinet=group('white wardrobe',(4.00,1.84),math.pi/2,[.88,.56,2.10])
    for x in (.024,.856):
        for y in (.04,.52): box('wardrobe square foot',(x,y,.065),(.043,.043,.13),white,cabinet)
    for x in (.009,.871):box('wardrobe full side',(x,.28,1.112),(.018,.56,1.976),white,cabinet)
    box('wardrobe back',(.44,.553,1.112),(.844,.014,1.976),white,cabinet)
    for z in (.133,.70,2.09):box('wardrobe shelf',(.44,.28,z),(.844,.54,.018),white,cabinet)
    for i in range(3):
        z=.149+i*.184
        box('wardrobe drawer %d'%(i+1),(.44,-.008,z+.086),(.85,.021,.174),white,cabinet)
        knob('drawer %d round knob'%(i+1),.44,-.02,z+.092,cabinet)
    box('wardrobe single tall door',(.44,-.009,1.396),(.851,.022,1.379),white,cabinet)
    knob('wardrobe door round knob',.79,-.024,1.19,cabinet)
    monkey_ref=ROOT/'textures'/'bedroom1_corner_monkey_reference.png'
    if monkey_ref.exists():
        decal=mat('black monkey door sticker','191919',.65)
        nodes=decal.node_tree.nodes; links=decal.node_tree.links
        im=bpy.data.images.load(str(monkey_ref),check_existing=True); im.pack()
        tex=nodes.new('ShaderNodeTexImage'); tex.image=im
        bw=nodes.new('ShaderNodeRGBToBW'); mask=nodes.new('ShaderNodeMath'); mask.operation='LESS_THAN'; mask.inputs[1].default_value=.09
        links.new(tex.outputs['Color'],bw.inputs[0]); links.new(bw.outputs[0],mask.inputs[0])
        trans=nodes.new('ShaderNodeBsdfTransparent'); mix=nodes.new('ShaderNodeMixShader')
        links.new(mask.outputs[0],mix.inputs[0]); links.new(trans.outputs[0],mix.inputs[1])
        links.new(nodes.get('Principled BSDF').outputs[0],mix.inputs[2]); links.new(mix.outputs[0],nodes.get('Material Output').inputs['Surface'])
        ob=surface('monkey silhouette on tall door',[(.48,-.0215,1.65),(.73,-.0215,1.65),(.73,-.0215,2.045),(.48,-.0215,2.045)],[(0,1,2,3)],decal,cabinet)
        uv=ob.data.uv_layers.new(); coords=[(318/646,1-365/1398),(527/646,1-365/1398),(527/646,1),(318/646,1)]
        for poly in ob.data.polygons:
            for li in poly.loop_indices:uv.data[li].uv=coords[ob.data.loops[li].vertex_index]
    # The second unit's door is visible from the seating corner.
    second=group('horse photo cupboard',(2.98,1.84),0,[.44,.88,2.10])
    box('horse cupboard recessed plinth',(.22,.44,.062),(.40,.84,.124),white,second)
    for x in (.01,.43):box('horse cupboard side',(x,.44,1.105),(.02,.88,1.99),white,second)
    for z in (.12,2.09):box('horse cupboard top or bottom',(.22,.44,z),(.42,.88,.02),white,second)
    box('horse cupboard rear',(.22,.869,1.105),(.42,.018,1.97),white,second)
    box('horse cupboard door',(.22,-.012,1.10),(.43,.024,1.98),white,second)
    rod('horse cupboard black vertical pull',[(.395,-.034,.90),(.395,-.064,.90),(.395,-.064,1.10),(.395,-.034,1.10)],.009,black,second)
    if REF.exists():
        pm=mat('user horse collage','FFFFFF',.87); im=bpy.data.images.load(str(REF),check_existing=True); im.pack()
        node=pm.node_tree.nodes.new('ShaderNodeTexImage'); node.image=im
        pm.node_tree.links.new(node.outputs['Color'],pm.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
        ob=surface('horse picture collage',[(.025,-.026,.31),(.377,-.026,.31),(.377,-.026,1.84),(.025,-.026,1.84)],[(0,1,2,3)],pm,second)
        uv=ob.data.uv_layers.new(); coords=[(282/646,1-889/1398),(499/646,1-915/1398),(493/646,1-166/1398),(246/646,1-181/1398)]
        for poly in ob.data.polygons:
            for li in poly.loop_indices:uv.data[li].uv=coords[ob.data.loops[li].vertex_index]

    # Three open play levels, white solid end panels and a shallow gable crest.
    doll=group('dollhouse',(3.90,3.16),math.pi,[.93,.40,1.55])
    for x in (.015,.915):
        for y in (.014,.386):box('dollhouse pine corner post',(x,y,.673),(.03,.028,1.34),wood,doll)
    for i,z in enumerate((.028,.44,.852,1.264)):
        box('dollhouse white floor %d'%(i+1),(.465,.20,z),(.89,.372,.018),panelwhite,doll)
        box('dollhouse pine floor front rail',(.465,.007,z),(.93,.031,.043),wood,doll)
        for x in (.012,.918):box('dollhouse side horizontal rail',(x,.20,z),(.03,.40,.041),wood,doll)
    for i,z in enumerate((.235,.647,1.059)):
        for x in (.014,.916):
            box('dollhouse white solid side panel',(x,.20,z),(.012,.35,.355),panelwhite,doll)
            box('dollhouse side joining plate',(x + (-.018 if x<.1 else .018),.20,z-.185),(.009,.048,.06),wood,doll)
        box('dollhouse pastel rear room',(.465,.388,z),(.878,.014,.372),(blue,pale,pale)[i],doll)
    # Wide white header with low pitch, rather than a roof covering the upper room.
    surface('dollhouse white gable',[(.05,-.004,1.28),(.88,-.004,1.28),(.88,-.004,1.40),(.465,-.004,1.55),(.05,-.004,1.40)],[(0,1,2,3,4)],panelwhite,doll)
    for a,b in [((.035,-.014,1.405),(.465,-.014,1.565)),((.465,-.014,1.565),(.895,-.014,1.405))]:rod('dollhouse peach sloped roof trim',[a,b],.019,wood,doll)
    for x in (.025,.905):box('dollhouse attic end frame',(x,.19,1.35),(.028,.39,.03),wood,doll)
    for t in range(9):
        a=math.pi*t/8
        rod('dollhouse fan window spoke',[(.465,-.018,1.34),(.465+.075*math.cos(a),-.018,1.34+.075*math.sin(a))],.0025,blue,doll)
    rod('dollhouse fan window surround',[(.465+.081*math.cos(math.pi*i/24),-.018,1.34+.081*math.sin(math.pi*i/24)) for i in range(25)],.004,cream,doll)
    for z in (.47,.882):
        for x0 in (.015,.765):
            box('dollhouse pink balcony upper rail',(x0+.075,-.021,z+.15),(.15,.02,.019),pink,doll)
            for j in range(4):ell('dollhouse shaped white baluster',(x0+.016+j*.039,-.018,z+.079),(.011,.008,.064),panelwhite,doll)
    box('dollhouse miniature bed',(.22,.16,.91),(.32,.25,.09),pink,doll,.012)
    box('dollhouse miniature mattress',(.22,.16,.97),(.32,.24,.045),cream,doll,.015)
    box('dollhouse miniature pillow',(.115,.16,1.004),(.095,.22,.04),pale,doll,.015)
    box('dollhouse miniature sofa seat',(.53,.25,.51),(.31,.16,.095),pink,doll,.018)
    box('dollhouse miniature sofa back',(.53,.32,.59),(.32,.044,.18),pink,doll,.015)
    for x in (.37,.69):box('dollhouse miniature sofa arm',(x,.25,.565),(.046,.17,.10),pink,doll,.017)
    box('dollhouse coffee table',(.53,.10,.505),(.24,.13,.018),cream,doll,.006)
    box('dollhouse ground kitchen',(.70,.32,.15),(.28,.10,.22),panelwhite,doll)
    box('dollhouse kitchen counter',(.70,.315,.265),(.29,.13,.015),blue,doll)
    for i in range(3):box('dollhouse cabinet front seam',(.595+i*.093,.262,.15),(.002,.002,.18),silver,doll,0)
    for x in (.64,.81):
        box('dollhouse upstairs chair seat',(x,.25,.925),(.095,.10,.02),cream,doll)
        box('dollhouse upstairs chair back',(x,.302,.985),(.095,.016,.14),cream,doll)
    box('dollhouse upstairs table',(.70,.12,.954),(.19,.13,.019),pink,doll)
    for z in (.449,.861):box('dollhouse small rug',(.46,.17,z),(.30,.21,.002),blue,doll,0)

    # Broad, soft, low seat with a separate ribbed ottoman and sewn piping.
    chair=group('blue beanbag armchair',(3.92,1.36),0,[.92,.86,.88])
    def cushion(name,loc,scale):
        # Rounded superellipsoid: flatter seat and squarer soft corners than spheres.
        n,k=64,32; vs=[]; fs=[]
        def sp(v,e):return math.copysign(abs(v)**e,v)
        for j in range(k+1):
            a=-math.pi/2+math.pi*j/k
            for i in range(n):
                t=math.tau*i/n
                vx=scale[0]*sp(math.cos(a),.65)*sp(math.cos(t),.62)
                vy=scale[1]*sp(math.cos(a),.65)*sp(math.sin(t),.62)
                vz=scale[2]*sp(math.sin(a),.65)
                ripple=1+.018*math.sin(9*t+3*a)+.009*math.cos(17*t-4*a)
                vs.append((loc[0]+vx*ripple,loc[1]+vy*ripple,loc[2]+vz))
        for j in range(k):
            for i in range(n):fs.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i))
        ob=surface(name,vs,fs,navy,chair)
        for p in ob.data.polygons:p.use_smooth=True
        return ob
    cushion('beanbag soft base',(0,0,.18),(.45,.40,.165))
    cushion('beanbag scooped seat',(0,-.045,.31),(.335,.32,.095))
    cushion('beanbag high padded back',(0,.265,.58),(.405,.14,.30))
    for x in (-.36,.36):cushion('beanbag soft side bolster',(x,-.035,.38),(.11,.33,.16))
    for x in (-.37,.37):
        rod('beanbag sewn side piping',[(x,-.34+.65*i/32,.40+.065*math.sin(math.pi*i/32)) for i in range(33)],.0025,navy,chair)
    cushion('separate soft footstool',(0,-.67,.18),(.375,.195,.16))
    rod('footstool edge piping',[(.375*math.copysign(abs(math.cos(t))**.62,math.cos(t)),-.67+.195*math.copysign(abs(math.sin(t))**.62,math.sin(t)),.18) for t in [math.tau*i/96 for i in range(97)]],.0025,navy,chair)
    for x in (-.41,.41):box('beanbag red fabric label',(x,-.23,.18),(.026,.006,.041),red,chair,.001)

    # White steel frame with three visible wire mesh basket drawers.
    cart=group('metal three drawer cabinet',(2.985,.435),0,[.42,.38,.68])
    for x in (.013,.407):
        for y in (.014,.366):
            box('metal cabinet square tube leg',(x,y,.34),(.018,.018,.66),metal,cart,.002)
            box('metal cabinet dark foot',(x,y,.014),(.024,.024,.025),black,cart,.002)
    for z in (.12,.29,.46,.64):
        for y in (.013,.367):rod('metal drawer support rail',[(.015,y,z),(.405,y,z)],.006,metal,cart)
    box('metal cabinet sheet top',(.21,.19,.668),(.424,.384,.013),metal,cart,.004)
    for i in range(3):
        z=.145+i*.171
        for y in (.036,.343):
            for dz in (0,.122):rod('basket horizontal rim',[(.037,y,z+dz),(.383,y,z+dz)],.004,metal,cart)
            for j in range(31):rod('basket fine vertical mesh',[(.038+j*.0115,y,z),(.038+j*.0115,y,z+.122)],.00065,metal,cart)
            for j in range(11):rod('basket fine horizontal mesh',[(.038,y,z+j*.012),(.383,y,z+j*.012)],.00065,metal,cart)
        for x in (.038,.383):
            for j in range(26):rod('basket side mesh',[(x,.038+j*.012,z),(x,.038+j*.012,z+.122)],.00065,metal,cart)
        for j in range(30):rod('basket wire bottom',[(.038+j*.0117,.036,z),(.038+j*.0117,.343,z)],.0007,metal,cart)
        rod('basket recessed handle',[(.16,.028,z+.115),(.16,.017,z+.091),(.26,.017,z+.091),(.26,.028,z+.115)],.0035,metal,cart)
    mirror=group('leaning oak mirror',(2.966,1.17),-math.pi/2,[.40,.03,1.58])
    mirrormat=mat('mirror glass','E7ECEE',.035,1)
    box('standing mirror reflective panel',(0,0,.82),(.37,.008,1.51),mirrormat,mirror,.001)
    for x in (-.201,.201):box('standing mirror oak side',(x,-.001,.82),(.028,.024,1.59),wood,mirror,.004)
    for z in (.039,1.601):box('standing mirror oak end',(0,-.001,z),(.429,.024,.028),wood,mirror,.004)
    mirror.rotation_euler.x=math.radians(-3)

    # Review scenes share actual room collections; only their cameras/lights are local.
    scenes=[]
    specs=[('60 | SLAAPKAMER 1 - entry corner photos',(4.60,4.03,1.80),(3.48,2.49,.94),26,'bedroom1_entry_corner.png'),
           ('61 | SLAAPKAMER 1 - blue seat and metal drawers',(4.78,.57,1.85),(3.55,1.20,.62),20,'bedroom1_seating_corner.png'),
           ('62 | SLAAPKAMER 1 - entry corner plan',(4.10,2.57,7),(4.10,2.57,0),None,'bedroom1_corner_plan.png')]
    for name,loc,target,lens,fn in specs:
        sc=bpy.data.scenes.get(name) or bpy.data.scenes.new(name)
        for c in list(sc.collection.children):sc.collection.children.unlink(c)
        for o in list(sc.collection.objects):
            sc.collection.objects.unlink(o)
            if not o.users_collection:bpy.data.objects.remove(o)
        for cname in ('02 / Bedroom 1 furniture','02 / Bedroom 1 finishes','02 / Bedroom 1 custom divider'):
            sc.collection.children.link(bpy.data.collections[cname])
        for ob in bpy.data.collections['02 / Joinery'].objects:
            if ob.name.startswith('Upper reference door / Bedroom 1 / '):sc.collection.objects.link(ob)
        sc.render.engine='CYCLES'; sc.cycles.device='CPU'; sc.cycles.samples=20; sc.cycles.use_denoising=True
        sc.cycles.max_bounces=6; sc.render.threads_mode='FIXED'; sc.render.threads=8
        sc.render.resolution_x=1200; sc.render.resolution_y=1000; sc.render.resolution_percentage=85
        sc.render.image_settings.file_format='PNG'; sc.view_settings.view_transform='AgX'
        sc.world=bpy.data.worlds.new(P+name); sc.world.use_nodes=True
        sc.world.node_tree.nodes['Background'].inputs[0].default_value=(.78,.84,.92,1)
        sc.world.node_tree.nodes['Background'].inputs[1].default_value=.25
        target=Vector((target[0],target[1],F+target[2]))
        cd=bpy.data.cameras.new(P+name); cam=bpy.data.objects.new(cd.name,cd); sc.collection.objects.link(cam)
        cam.location=(loc[0],loc[1],F+loc[2]); cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
        cd.clip_start=.015; sc.camera=cam
        if lens:cd.lens=lens
        else:cd.type='ORTHO'; cd.ortho_scale=5.15
        for label,pos,power,size in [('window',(4.4,.55,2.3),190,2.2),('ceiling',(3.8,2.8,2.7),140,2.0)]:
            ld=bpy.data.lights.new(P+name+label,'AREA'); ld.energy=power; ld.size=size
            lo=bpy.data.objects.new(ld.name,ld); sc.collection.objects.link(lo)
            lo.location=(pos[0],pos[1],F+pos[2]); lo.rotation_euler=(target-lo.location).to_track_quat('-Z','Y').to_euler()
        sc.render.filepath=str(ROOT/fn); sc['photo_dimensions']='Estimated, not measured'
        scenes.append(sc)
    # Update legacy dollhouse view and plan labels to the current position.
    sc=bpy.data.scenes.get('59 | SLAAPKAMER 1 - photographed dollhouse')
    if sc and sc.camera:
        sc.camera.location=(4.75,4.15,F+1.48)
        sc.camera.rotation_euler=(Vector((3.44,2.86,F+.85))-sc.camera.location).to_track_quat('-Z','Y').to_euler()
        sc.camera.data.lens=43
    for label,xy in [('POPPENHUIS',(3.43,2.96)),('KAST',(3.68,2.27))]:
        ob=bpy.data.objects.get('Bedroom 1 / plan label '+label)
        if ob:ob.location.x,ob.location.y=xy
    bpy.context.view_layer.update()
    def bounds(parent):
        pts=[o.matrix_world@Vector(v) for o in col.objects if o.parent==parent and o.type in {'MESH','CURVE'} for v in o.bound_box]
        return [[round(min(p[i] for p in pts),4),round(max(p[i] for p in pts),4)] for i in range(3)]
    furniture={o.name:bounds(o) for o in (cabinet,second,doll,chair,cart,mirror)}
    for name,bb in furniture.items():
        assert bb[0][0]>2.92 and bb[0][1]<4.94,(name,bb)
        assert bb[1][0]>.28 and bb[1][1]<3.38,(name,bb)
    assert furniture[doll.name][1][1]<3.38, 'Entry opening must stay clear'
    assert furniture[chair.name][1][0]>.46, 'Footstool must clear the radiator front'
    assert furniture[chair.name][1][1]<furniture[cabinet.name][1][0], 'Seat must clear wardrobe side'
    assert furniture[cart.name][0][1]<furniture[chair.name][0][0], 'Steel cabinet must clear chair and ottoman'
    assert furniture[cabinet.name][0][1]<4.10, 'Wardrobe front must retain access from the centre aisle'
    assert furniture[cabinet.name][1][1]<furniture[doll.name][1][0], 'Wardrobe and dollhouse must not overlap'
    assert not any(o.name.startswith('Bedroom 1 / opposite cupboard') for o in col.objects)
    report={'photo_reference_count':7,'dimensions':'Estimates from photographs','furniture_bounds_m':furniture,
            'door_clear_y':[3.38,4.20],'dollhouse_right_of_entry':True,'white_wardrobe_drawers':3,
            'dollhouse_open_levels':3,'steel_mesh_drawers':3,'separate_ottoman':True,
            'scenes':[s.name for s in scenes]}
    (ROOT/'bedroom1_entry_corner_verification.json').write_text(json.dumps(report,indent=2))
    notes='SLAAPKAMER 1 — zeven detailfoto’s 28 september 2026. Poppenhuis direct rechts bij binnenkomst; drie open niveaus, witte zijpanelen, houten frame en lage geveltop. Witte kast dwars erop: één hoge deur, drie laden, ronde witte knoppen en pootjes. Tweede kast met paardenfotocollage aan de zithoekzijde. Blauwe ribstoffen zitzakzetel met losse voetenbank, wit metalen kastje met drie draadmandladen en houten passpiegel. Alle meubelmaten en precieze afstanden zijn foto-inschattingen. Decoratie en miniatuurmeubels zijn vereenvoudigd. Scenes 60–62; bedroom1_entry_corner.py. Deze nieuwe foto-opstelling vervangt de eerdere overlappende kast-/poppenhuisproxy.\n'
    (ROOT/'BEDROOM1_ENTRY_CORNER_NOTES.txt').write_text(notes)
    txt=bpy.data.texts.get('SLAAPKAMER 1 - entry corner photos') or bpy.data.texts.new('SLAAPKAMER 1 - entry corner photos')
    txt.clear(); txt.write(notes)
    col['entry_corner_reference']=notes
    col['storage_status']='Photo corner includes miniature furniture and photographed decorative decals; storage doors closed.'
    start=bpy.data.texts.get('START HERE - model assumptions')
    if start:
        old='\n'.join(line for line in start.as_string().split('\n') if not line.startswith(('SLAAPKAMER 1 DOLLHOUSE:', 'SLAAPKAMER 1 ENTRY CORNER:')))
        start.clear(); start.write(old+'\nSLAAPKAMER 1 ENTRY CORNER: '+notes)
    oldnote=bpy.data.texts.get('SLAAPKAMER 1 - split room notes')
    if oldnote and 'ENTRY CORNER SUPERSEDES' not in oldnote.as_string():oldnote.write('\nENTRY CORNER SUPERSEDES earlier cupboard and empty dollhouse description: '+notes)
    return scenes


if __name__=='__main__':
    main=ROOT/'Huis_Oude_Terelststraat_15.blend'; backup=ROOT/'Huis_before_bedroom1_entry_corner.blend'
    if not backup.exists():shutil.copy2(main,backup)
    scenes=update_bedroom1_entry_corner(); bpy.context.window.scene=scenes[0]
    bpy.ops.wm.save_as_mainfile(filepath=str(main))
    if '--no-render' not in sys.argv:
        for sc in scenes:
            bpy.context.window.scene=sc
            bpy.ops.render.render(write_still=True,scene=sc.name)
    bpy.context.window.scene=scenes[0]
    bpy.ops.wm.save_as_mainfile(filepath=str(main))
