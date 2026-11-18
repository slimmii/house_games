"""Street facade and dual-colour entrance from the user's exterior photographs."""
import bpy, bmesh, math, json, random, sys
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parent
if str(ROOT) not in sys.path:sys.path.insert(0,str(ROOT))
P='Street photo / '
W=7.3808

def update_front_exterior():
    from entrance_door_photo import update_entrance_door
    door_views=update_entrance_door()
    bpy.context.window.scene=bpy.data.scenes['01 | HOUSE - exterior']
    for ob in list(bpy.data.objects):
        if ob.name.startswith(P) or ob.name.startswith(('Front guardrail','Garage door joint','Garage / bicycle room door','Front floor band')):
            bpy.data.objects.remove(ob,do_unlink=True)
        elif ob.name=='Roof front / rear parapet':bpy.data.objects.remove(ob,do_unlink=True)
        elif ob.name.startswith('Bedroom 1 / roller shutter slat'):bpy.data.objects.remove(ob,do_unlink=True)
    cols=[]
    for name,parent in [('ground','00 / Walls front'),('living','01 / Walls front'),('upper','02 / Walls front'),('roof','03 | ROOFS - removable'),('pavement','04 | SITE and rear stair - indicative extent')]:
        name=P+name;col=bpy.data.collections.get(name)
        if not col:col=bpy.data.collections.new(name)
        if col.name not in bpy.data.collections[parent].children:bpy.data.collections[parent].children.link(col)
        cols.append(col)
    ground,living,upper,roof,site=cols
    def rgb(h):return tuple((int(h[i:i+2],16)/255)**2.2 for i in (0,2,4))+(1,)
    def mat(name,color,rough=.5,metal=0):
        m=bpy.data.materials.get(P+name) or bpy.data.materials.new(P+name);m.use_nodes=True;m.diffuse_color=rgb(color)
        n=m.node_tree.nodes;l=m.node_tree.links;n.clear();p=n.new('ShaderNodeBsdfPrincipled');out=n.new('ShaderNodeOutputMaterial');l.new(p.outputs[0],out.inputs[0])
        p.inputs['Base Color'].default_value=rgb(color);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
        return m
    charcoal=mat('anthracite exterior aluminium','41454D',.34,.32)
    nickel=mat('brushed stainless pull handle','B5B9B9',.24,.86)
    railmat=mat('pale satin metal balcony railing','C9C9BF',.32,.68)
    white=mat('white balcony fascia and shutter','DDDFD9',.6)
    stone=mat('grey textured stone sill','8D8D86',.78)
    concrete=mat('grey roof edge concrete','8B8B83',.85)
    mortar=mat('light weathered lime mortar','ADA18A',.94)
    garage=mat('weathered graphite sectional garage','52585D',.45,.3)
    seal=mat('dark joints and glazing seals','181D22',.7)
    brick=mat('rough reddish facade brick','865542',.91)
    clear=mat('clear facade window glass','F2F7FA',.018)
    bs=clear.node_tree.nodes.get('Principled BSDF');bs.inputs['Transmission Weight'].default_value=1;bs.inputs['IOR'].default_value=1.45
    def grain(m,scale,distance):
        n=m.node_tree.nodes;l=m.node_tree.links;p=n.get('Principled BSDF');geo=n.new('ShaderNodeNewGeometry')
        noise=n.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=scale;noise.inputs['Detail'].default_value=4;l.new(geo.outputs['Position'],noise.inputs[0])
        bump=n.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.6;bump.inputs['Distance'].default_value=distance;l.new(noise.outputs['Fac'],bump.inputs['Height']);l.new(bump.outputs[0],p.inputs['Normal'])
    grain(stone,180,.002);grain(concrete,140,.002);grain(garage,90,.0005)
    # The photograph shows a thin flat roof edge, not the tall guessed side upstands.
    for ob in bpy.data.objects:
        if ob.name.startswith('Roof side parapet'):
            matrix=ob.matrix_basis.copy();inverse=matrix.inverted()
            for v in ob.data.vertices:
                p0=matrix@v.co
                if p0.z>8.33:p0.z=8.33
                v.co=inverse@p0
            ob.data.materials.clear();ob.data.materials.append(stone)
    n=brick.node_tree.nodes;l=brick.node_tree.links;p=n.get('Principled BSDF')
    geo=n.new('ShaderNodeNewGeometry');sep=n.new('ShaderNodeSeparateXYZ');l.new(geo.outputs['Position'],sep.inputs[0])
    vec=n.new('ShaderNodeCombineXYZ');l.new(sep.outputs['X'],vec.inputs['X']);l.new(sep.outputs['Z'],vec.inputs['Y']);l.new(sep.outputs['Y'],vec.inputs['Z'])
    tex=n.new('ShaderNodeTexBrick');tex.inputs['Scale'].default_value=1;tex.inputs['Brick Width'].default_value=.205;tex.inputs['Row Height'].default_value=.059
    tex.inputs['Mortar Size'].default_value=.0034;tex.inputs['Mortar Smooth'].default_value=.001;tex.inputs['Color1'].default_value=rgb('643D30');tex.inputs['Color2'].default_value=rgb('915A40');tex.inputs['Mortar'].default_value=rgb('AA9E88');l.new(vec.outputs[0],tex.inputs[0])
    noise=n.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=125;noise.inputs['Detail'].default_value=4;l.new(geo.outputs['Position'],noise.inputs[0])
    ramp=n.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].color=(.42,.37,.32,1);ramp.color_ramp.elements[1].color=(1,1,1,1);l.new(noise.outputs['Fac'],ramp.inputs[0])
    mix=n.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=.42;l.new(tex.outputs['Color'],mix.inputs[1]);l.new(ramp.outputs[0],mix.inputs[2]);l.new(mix.outputs[0],p.inputs['Base Color'])
    bump=n.new('ShaderNodeBump');bump.invert=True;bump.inputs['Distance'].default_value=.005;bump.inputs['Strength'].default_value=.7;l.new(tex.outputs['Fac'],bump.inputs['Height'])
    fine=n.new('ShaderNodeBump');fine.inputs['Distance'].default_value=.002;fine.inputs['Strength'].default_value=.5;l.new(noise.outputs['Fac'],fine.inputs['Height']);l.new(bump.outputs[0],fine.inputs['Normal']);l.new(fine.outputs[0],p.inputs['Normal'])
    def box(name,x0,x1,y0,y1,z0,z1,material,col,bevel=0):
        vs=[(x,y,z) for z in (z0,z1) for y in (y0,y1) for x in (x0,x1)]
        fs=[(0,2,3,1),(4,5,7,6),(0,1,5,4),(2,6,7,3),(0,4,6,2),(1,3,7,5)]
        me=bpy.data.meshes.new(P+name);me.from_pydata(vs,[],fs);me.update();ob=bpy.data.objects.new(P+name,me);col.objects.link(ob);me.materials.append(material)
        if bevel:b=ob.modifiers.new('Small worn edges','BEVEL');b.width=bevel;b.segments=3
        return ob
    def rod(name,a,b,r,material,col):
        a,b=Vector(a),Vector(b);axis=(b-a).normalized();u=axis.cross(Vector((0,1,0)))
        if u.length<.1:u=axis.cross(Vector((1,0,0)))
        u.normalize();v=axis.cross(u);n=24
        vs=[tuple(pt+r*(math.cos(i*math.tau/n)*u+math.sin(i*math.tau/n)*v)) for pt in (a,b) for i in range(n)]
        fs=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
        me=bpy.data.meshes.new(P+name);me.from_pydata(vs,[],fs);me.materials.append(material);ob=bpy.data.objects.new(P+name,me);col.objects.link(ob)
        for f in me.polygons:f.use_smooth=True
        return ob
    # Split frame side faces across their depth, retaining the confirmed white interior.
    def exterior_finish(ob,plane=.135):
        if ob.type!='MESH':return
        matrix=ob.matrix_basis.copy();inv=matrix.inverted();point=inv@Vector((0,plane,0));normal=(matrix.to_3x3().transposed()@Vector((0,1,0))).normalized()
        bm=bmesh.new();bm.from_mesh(ob.data)
        bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=.000001,plane_co=point,plane_no=normal,clear_inner=False,clear_outer=False)
        bm.to_mesh(ob.data);bm.free();ob.data.update()
        idx=len(ob.data.materials);ob.data.materials.append(charcoal)
        for f in ob.data.polygons:
            if (matrix@f.center).y<plane-.00001:f.material_index=idx
    doorcol=bpy.data.collections['00 / Entrance door - frosted glass and clear 15']
    for ob in list(doorcol.objects):
        if ob.type=='MESH' and any(m and m.name=='Entrance photo / white satin profiles' for m in ob.data.materials):exterior_finish(ob)
        if ob.name.startswith(('Entrance photo / outside handle rosette','Entrance photo / outside lever')):
            bpy.data.objects.remove(ob,do_unlink=True);continue
        if ob.name=='Entrance photo / tiled reveal flush with hall floor':
            for v in ob.data.vertices:
                if v.co.y<.3:v.co.y=.303
        else:ob.location.y+=.10
    pullx=.741+(1.408-.77)*(1.82/1.42)
    for z in (.76,1.35):rod('pull handle stand-off',(pullx,.174,z),(pullx,.09,z),.010,nickel,ground)
    rod('long vertical stainless door pull',(pullx,.087,.62),(pullx,.087,1.49),.0105,nickel,ground)
    box('entrance blue-grey stone doorstep',.65,2.67,-.34,.31,-.105,.008,stone,ground,.003)

    # Outside window profiles are dark, including the window already detailed from inside.
    for ob in list(bpy.data.objects):
        if ob.name.startswith(('1 front 0 glass','2 front 0 glass')):
            ob.data.materials.clear();ob.data.materials.append(clear)
        elif ob.name.startswith(('1 front 0','2 front 0')) and not any(t in ob.name for t in ('glass','sill')):exterior_finish(ob,.14)
        elif ob.name.startswith(('Bedroom 1 / window white vertical frame','Bedroom 1 / window white horizontal frame')):exterior_finish(ob,.18)

    # A continuous metric brick skin covers the simplified facade strips; openings stay put.
    apertures=[[(.741,2.561,0,2.01),(3.29,6.74,-.11,2.0)],[(.90,6.81,2.41,4.75)],[(.92,2.67,6.21,7.69),(3.10,6.62,6.21,7.69)]]
    for level,(col,z0,z1) in enumerate(((ground,-.11,2.22),(living,2.22,5.31),(upper,5.31,8.11))):
        opens=apertures[level];xs=sorted({0,W,*[v for a,b,c,d in opens for v in (a,b)]});zs=sorted({z0,z1,*[max(z0,min(z1,v)) for a,b,c,d in opens for v in (c,d)]})
        for a,b in zip(xs,xs[1:]):
            for c,d in zip(zs,zs[1:]):
                if not any(x<(a+b)/2<xx and z<(c+d)/2<zz for x,xx,z,zz in opens):box(f'{level} continuous red brick face',a,b,-.030,-.010,c,d,brick,col)
    # Exposed brick returns of the recessed doorway.
    box('left entrance brick reveal',.72,.741,-.025,.165,0,2.01,brick,ground)
    box('right entrance brick reveal',2.561,2.584,-.025,.165,0,2.01,brick,ground)
    box('entrance brick soffit',.741,2.561,-.025,.165,2.01,2.045,brick,ground)
    palette=[mat('header brick '+str(i),h,.9) for i,h in enumerate(('7E4638','8B5543','A27054','714236','97634D'))]
    for label,a,b,z,col in [('entrance',.741,2.561,2.01,ground),('garage',3.29,6.74,2.0,ground),('living window',.90,6.81,4.75,living)]:
        box(label+' header mortar',a-.025,b+.025,-.040,-.028,z,z+.195,mortar,col)
        count=round((b-a)/.060);step=(b-a)/count
        for i in range(count):box(label+' vertical header brick',a+i*step+.003,a+(i+1)*step-.003,-.046,-.039,z+.003,z+.192,palette[(i*7)%5],col,.0015)

    # Sectional garage with five shallow, broad panels and thin dark horizontal joints.
    box('garage recessed backing',3.29,6.74,.060,.145,-.105,2.0,seal,ground)
    for i in range(5):
        z=-.10+i*2.10/5;box('garage horizontal section '+str(i+1),3.335,6.695,.047,.084,z+.005,z+.415,garage,ground,.004)
    for x in (3.29,6.695):box('garage side frame',x,x+.045,.035,.11,-.105,2.0,charcoal,ground,.002)
    box('garage header frame',3.29,6.74,.030,.11,1.965,2.0,charcoal,ground,.002)
    box('garage stone threshold',3.25,6.78,-.21,.16,-.125,-.10,stone,ground,.002)

    # Shallow projecting concrete balcony, white underside fascia and fine metal pickets.
    box('balcony projecting slab',.65,6.98,-.46,.20,2.22,2.37,white,living,.002)
    box('balcony weathered stone top',.63,7.0,-.49,.20,2.37,2.411,stone,living,.003)
    box('balcony lower drip edge',.63,7.0,-.482,-.450,2.22,2.236,concrete,living,.001)
    rail_y=-.405
    for x in (.82,2.29,3.79,5.29,6.81):
        rod('balcony main upright',(x,rail_y,2.40),(x,rail_y,3.42),.016,railmat,living)
        box('balcony post base',x-.043,x+.043,rail_y-.035,rail_y+.035,2.404,2.421,railmat,living,.002)
    for z in (2.57,3.40):rod('balcony horizontal rail',(.82,rail_y,z),(6.81,rail_y,z),.013,railmat,living)
    for i in range(43):
        x=.85+(6.78-.85)*i/42;rod('balcony thin vertical spindle',(x,rail_y,2.57),(x,rail_y,3.40),.006,railmat,living)
    for x in (.82,6.81):
        for z in (2.57,3.40):rod('balcony return rail',(x,rail_y,z),(x,.03,z),.013,railmat,living)
        for j in range(1,3):rod('balcony return spindle',(x,rail_y+j*.14,2.57),(x,rail_y+j*.14,3.40),.006,railmat,living)

    # Closed white roller shutter photographed above the garage. The left window is out of frame.
    box('upper right shutter dark backing',3.105,6.615,.043,.085,6.215,7.69,seal,upper)
    for i in range(56):
        z=6.245+i*(1.40/56);box('white roller shutter slat '+str(i+1),3.145,6.575,.021,.045,z,z+.022,white,upper,.001)
    for x in (3.10,6.575):box('shutter anthracite guide',x,x+.045,-.008,.11,6.21,7.69,charcoal,upper,.002)
    box('shutter dark projecting top casing',3.07,6.65,-.105,.11,7.665,7.825,charcoal,upper,.004)
    box('shutter bottom rail',3.145,6.575,.017,.055,6.225,6.245,white,upper,.001)
    box('upper right stone sill',3.055,6.665,-.115,.12,6.172,6.21,stone,upper,.002)

    # Flat overhanging eaves, thin weathered coping and right-hand rainwater pipe.
    box('flat roof projecting soffit',-.045,W+.045,-.36,.19,8.095,8.295,concrete,roof,.003)
    box('flat roof thin top coping',-.055,W+.055,-.37,.21,8.295,8.325,stone,roof,.002)
    box('roof underside pale finish',-.02,W+.02,-.34,.13,8.086,8.097,white,roof)
    rod('right facade rainwater pipe',(W-.12,-.075,-.105),(W-.12,-.075,8.12),.033,garage,ground)
    for z in (.35,1.85,3.35,4.85,6.35,7.85):
        rod('rainwater pipe fixing band',(W-.12,-.075,z-.012),(W-.12,-.075,z+.012),.038,nickel,ground)

    paving=mat('grey square pavement slabs','898A83',.9)
    n=paving.node_tree.nodes;l=paving.node_tree.links;p=n.get('Principled BSDF');geo=n.new('ShaderNodeNewGeometry')
    tex=n.new('ShaderNodeTexBrick');tex.offset=0;tex.inputs['Scale'].default_value=1;tex.inputs['Brick Width'].default_value=.40;tex.inputs['Row Height'].default_value=.40;tex.inputs['Mortar Size'].default_value=.002
    tex.inputs['Color1'].default_value=rgb('858880');tex.inputs['Color2'].default_value=rgb('A2A49A');tex.inputs['Mortar'].default_value=rgb('666B65');l.new(geo.outputs['Position'],tex.inputs[0]);l.new(tex.outputs['Color'],p.inputs['Base Color']);grain(paving,190,.0015)
    box('clean paved pavement',-20,25,-3.4,-.031,-.17,-.105,paving,site)
    asphalt=mat('quiet street foreground','565B5D',.95);grain(asphalt,250,.0015)
    box('street surface context',-40,40,-50,-3.4,-.22,-.175,asphalt,site)
    box('pavement curb',-20,25,-3.48,-3.35,-.23,-.105,stone,site,.01)

    # Photo-like exterior daylight is shared by the door detail and full facade view.
    views=[]
    sc=bpy.data.scenes.get('41 | VOORGEVEL - buitenfoto') or bpy.data.scenes.new('41 | VOORGEVEL - buitenfoto')
    for c in list(sc.collection.children):sc.collection.children.unlink(c)
    for root in ('00 | GROUND - 2021','01 | FIRST - 2021 + Camber 2025','02 | SECOND - archive reconstruction','03 | ROOFS - removable','04 | SITE and rear stair - indicative extent'):sc.collection.children.link(bpy.data.collections[root])
    for old in list(door_views[1].collection.objects):
        if old.type=='LIGHT' and old.name.startswith('Entrance photo /'):bpy.data.objects.remove(old,do_unlink=True)
    for view,location,target,lens in [(sc,(5.8,-18.5,3.2),(3.65,.1,4.1),60),(door_views[1],(1.65,-3.75,1.55),(1.65,.15,1.05),49)]:
        view.render.engine='CYCLES';view.cycles.samples=40;view.cycles.use_denoising=True;view.cycles.device='CPU';view.cycles.max_bounces=12;view.cycles.transmission_bounces=10
        view.render.resolution_x=1300 if view==sc else 1050;view.render.resolution_y=1400 if view==sc else 1250;view.render.resolution_percentage=100;view.render.threads_mode='FIXED';view.render.threads=8;view.render.image_settings.file_format='PNG'
        view.world=bpy.data.worlds.new(P+view.name+' soft cloudy daylight');view.world.use_nodes=True
        n=view.world.node_tree.nodes;l=view.world.node_tree.links;bg=n.get('Background');sky=n.new('ShaderNodeTexSky');sky.sky_type='MULTIPLE_SCATTERING';sky.sun_elevation=math.radians(38);sky.sun_rotation=math.radians(225);sky.sun_disc=False;l.new(sky.outputs[0],bg.inputs[0]);bg.inputs[1].default_value=.35
        view.view_settings.view_transform='AgX'
        if view==sc:
            d=bpy.data.cameras.new(P+'facade camera');cam=bpy.data.objects.new(P+'facade camera',d);view.collection.objects.link(cam);view.camera=cam
        cam=view.camera;cam.location=location;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=lens;cam.data.clip_start=.01
        ld=bpy.data.lights.new(P+'soft street daylight '+view.name,'AREA');ld.energy=700;ld.shape='DISK';ld.size=7
        ob=bpy.data.objects.new(ld.name,ld);view.collection.objects.link(ob);ob.location=(1,-5,9);ob.rotation_euler=(Vector((3,0,3))-ob.location).to_track_quat('-Z','Y').to_euler();ob.visible_glossy=False;ob.visible_transmission=False
        views.append(view)
    # Include the full balcony in the close door view and retain the interior inspection.
    if living.name not in door_views[1].collection.children:door_views[1].collection.children.link(living)
    door_views[0].camera.location.x=1.65
    profile=bpy.data.objects['Entrance photo / outer jamb sidelight']
    assert any(m==charcoal for m in profile.data.materials)
    assert any(m and 'white satin profiles' in m.name for m in profile.data.materials)
    assert len([o for o in upper.objects if 'white roller shutter slat' in o.name])==56
    assert bpy.data.objects.get('Entrance photo / full height sidelight frosted layer')
    assert len([o for o in bpy.data.objects if o.name.startswith('Reference spiral / ') and 'beige tread' in o.name])==28
    report={'door_exterior':'anthracite','door_interior':'white','clear_15_preserved':True,'door_recess_shift_m':.10,'pull_handle_length_m':.87,'facade_brick_module_m':[.205,.059],'closed_shutter_slats':56,'balcony_fine_vertical_spindles':43,'stair_28_treads_preserved':True,'photo_unseen_geometry':'existing model retained','dimensions_estimated_from_photos':True}
    (ROOT/'front_exterior_verification.json').write_text(json.dumps(report,indent=2))
    notes='''VOORGEVEL EN VOORDEUR VOLGENS BUITENFOTO'S
Deur buiten antraciet, binnen wit; verticale RVS-trekstang van circa 87 cm buiten, gewone klink binnen. Glas mat en lichtdoorlatend, de 15 blijft helder uitgespaard. De deur ligt 10 cm dieper in de bestaande muuropening. Grijze stenen opstap sluit aan op de dorpel; tegelvloer sluit aan aan de binnenzijde.
Roodbruine ruwe baksteen met lichte voegen, verticale stenen boven de openingen, grafietgrijze sectionale garagepoort, ondiep uitstekend balkon met witte boeiboord en fijn lichtmetalen hekwerk, gesloten wit rolluik boven de garage met donkere kast en geleiders, vlakke overstekende dakrand en regenpijp rechts. Geen auto, opbergdoos, verlichtingstrings of rommel.
De bestaande gevelbreedte, verdiepingshoogtes en raamopeningen blijven behouden. Het linker bovenraam valt buiten de foto en blijft in zijn bestaande vorm; materiaal van de buitenprofielen aangepast. Detailmaten en kleuren zijn foto-inschattingen. Achter- en zijgevelindeling behouden.
Scene 41: voorgevel; scene 37: deur buiten; scene 36: deur binnen. Bron front_exterior_photo.py. Reservekopie Huis_before_front_exterior_photo.blend.
'''
    t=bpy.data.texts.get('VOORGEVEL - exterior photo notes') or bpy.data.texts.new('VOORGEVEL - exterior photo notes');t.clear();t.write(notes);(ROOT/'FRONT_EXTERIOR_NOTES.txt').write_text(notes)
    print('FRONT EXTERIOR VERIFIED',json.dumps(report),flush=True)
    return [sc,door_views[1],door_views[0]]

if __name__=='__main__':
    import shutil,sys
    main=ROOT/'Huis_Oude_Terelststraat_15.blend';backup=ROOT/'Huis_before_front_exterior_photo.blend'
    if not backup.exists():shutil.copy2(main,backup)
    views=update_front_exterior();bpy.context.window.scene=views[0]
    for screen in bpy.data.screens:
        for a in screen.areas:
            if a.type=='VIEW_3D':a.spaces.active.region_3d.view_perspective='CAMERA';a.spaces.active.shading.type='RENDERED';a.spaces.active.overlay.show_overlays=False
    bpy.ops.wm.save_as_mainfile(filepath=str(main))
    if '--no-render' not in sys.argv:
        for sc,fn in zip(views,['front_exterior_photo.png','entrance_door_outside.png','entrance_door_inside.png']):
            samples=sc.cycles.samples
            if '--draft' in sys.argv:sc.cycles.samples=24;sc.render.resolution_percentage=80
            bpy.context.window.scene=sc;sc.render.filepath=str(ROOT/fn);bpy.ops.render.render(write_still=True,scene=sc.name)
            sc.cycles.samples=samples;sc.render.resolution_percentage=100
    bpy.context.window.scene=views[0];bpy.ops.wm.save_as_mainfile(filepath=str(main))
