"""White entrance door, frosted glazing and clear house number, from user photo."""
import bpy, bmesh, math, json
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parent
P = 'Entrance photo / '

def update_entrance_door():
    bpy.context.window.scene = bpy.data.scenes['01 | HOUSE - exterior']
    for o in list(bpy.data.objects):
        if o.name.startswith(('0 front 0', P)):
            bpy.data.objects.remove(o, do_unlink=True)
    name = '00 / Entrance door - frosted glass and clear 15'
    old = bpy.data.collections.get(name)
    if old: bpy.data.collections.remove(old)
    col = bpy.data.collections.new(name)
    # Link beneath the original facade so all existing house views share this door.
    bpy.data.collections['00 / Walls front'].children.link(col)

    def mat(name, color, rough=.4, metal=0, transmission=0):
        m = bpy.data.materials.get(P+name) or bpy.data.materials.new(P+name)
        m.use_nodes=True; m.diffuse_color=(*color,1)
        p=m.node_tree.nodes.get('Principled BSDF')
        p.inputs['Base Color'].default_value=(*color,1)
        p.inputs['Roughness'].default_value=rough
        p.inputs['Metallic'].default_value=metal
        p.inputs['Transmission Weight'].default_value=transmission
        p.inputs['IOR'].default_value=1.45
        return m
    white=mat('white satin profiles',(.82,.84,.82),.3)
    seal=mat('charcoal glazing gasket',(.025,.031,.034),.72)
    metal=mat('satin nickel hardware',(.48,.51,.53),.24,.82)
    glass=mat('clear safety glass - including 15',(.99,1,1),.012,0,1)
    frost=mat('semitransparent frosted surface',(.95,.97,.97),.46,0,1)

    def box(name,x0,x1,y0,y1,z0,z1,material,bevel=0):
        vs=[(x,y,z) for z in (z0,z1) for y in (y0,y1) for x in (x0,x1)]
        fs=[(0,2,3,1),(4,5,7,6),(0,1,5,4),(2,6,7,3),(0,4,6,2),(1,3,7,5)]
        me=bpy.data.meshes.new(P+name);me.from_pydata(vs,[],fs);me.update()
        ob=bpy.data.objects.new(P+name,me);col.objects.link(ob);me.materials.append(material)
        if bevel:
            mod=ob.modifiers.new('Soft profile edges','BEVEL');mod.width=bevel;mod.segments=3
        return ob
    def bar(name,a,b,r,material):
        a,b=Vector(a),Vector(b)
        bpy.ops.mesh.primitive_cylinder_add(vertices=24,radius=r,depth=(b-a).length,location=(a+b)/2)
        ob=bpy.context.object;ob.name=P+name
        for c in list(ob.users_collection): c.objects.unlink(ob)
        col.objects.link(ob);ob.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();ob.data.materials.append(material)
        mod=ob.modifiers.new('Hardware rounded edge','BEVEL');mod.width=.002;mod.segments=3
        return ob

    # Existing opening: x .77..2.19, height 2.01 m. Photo seen from inside:
    # operable leaf on left (world +X), full-height sidelight on right (world -X).
    box('outer jamb sidelight',.77,.825,.066,.192,.012,2.01,white,.003)
    box('outer jamb hinge side',2.135,2.19,.066,.192,.012,2.01,white,.003)
    box('outer head',.825,2.135,.066,.192,1.952,2.01,white,.003)
    box('threshold',.77,2.19,.05,.23,.008,.031,metal,.002)
    box('sidelight lower rail',.825,1.35,.066,.192,.031,.099,white,.003)
    box('central fixed mullion',1.30,1.37,.066,.192,.031,1.952,white,.003)
    # Dark narrow seal around the moving leaf, visible in the clearance gap.
    for x in (1.371,2.128):box('leaf edge weatherseal',x,x+.006,.10,.18,.035,1.951,seal)
    for x in (1.380,2.071):box('door vertical stile',x,x+.058,.077,.203,.041,1.944,white,.003)
    box('door top rail',1.438,2.071,.077,.203,1.881,1.944,white,.003)
    box('door bottom rail',1.438,2.071,.077,.203,.041,.122,white,.003)
    for z in (.642,1.266):box('door horizontal transom',1.438,2.071,.077,.203,z,z+.059,white,.003)

    panes=[]
    def pane(name,x0,x1,z0,z1):
        # Clear substrate is continuous; frosting is a separate thin, editable layer.
        for x in (x0-.005,x1):box(name+' gasket vertical',x,x+.005,.121,.143,z0-.005,z1+.005,seal)
        for z in (z0-.005,z1):box(name+' gasket horizontal',x0,x1,.121,.143,z,z+.005,seal)
        clear=box(name+' clear substrate',x0,x1,.123,.129,z0,z1,glass)
        film=box(name+' frosted layer',x0,x1,.1291,.1301,z0,z1,frost)
        panes.append(clear)
        return film
    for i,(z0,z1) in enumerate(((.127,.637),(.706,1.261),(1.330,1.876))):
        pane('door pane '+str(i+1),1.443,2.066,z0,z1)
    film=pane('full height sidelight',.830,1.295,.104,1.947)

    # Real geometry opening in the frosted film; NOT an opaque number decal.
    curve=bpy.data.curves.new(P+'editable house number 15','FONT')
    curve.body='15';curve.align_x='CENTER';curve.align_y='CENTER';curve.size=.23
    font_path=Path('/System/Library/Fonts/Supplemental/Arial.ttf')
    if font_path.exists():
        curve.font=bpy.data.fonts.load(str(font_path),check_existing=True)
        curve.font.pack()
    curve.extrude=.025;curve.resolution_u=16
    text=bpy.data.objects.new(P+'15 cutter',curve);col.objects.link(text)
    # Save a hidden editable source after using a converted copy as a mesh cutter.
    source=text.copy();source.data=curve.copy();col.objects.link(source)
    source.name=P+'15 editable typography (hidden source)';source.hide_render=True;source.hide_viewport=True
    bpy.ops.object.select_all(action='DESELECT');text.select_set(True);bpy.context.view_layer.objects.active=text
    bpy.ops.object.convert(target='MESH');cutter=bpy.context.object
    # Work from the actual glyph vertices, not stale evaluated object dimensions.
    # The earlier dependency-graph dimensions measured the extrusion as height.
    xs=[v.co.x for v in cutter.data.vertices];ys=[v.co.y for v in cutter.data.vertices]
    scale=.175/(max(ys)-min(ys));mx=(max(xs)+min(xs))/2;my=(max(ys)+min(ys))/2
    for v in cutter.data.vertices:
        x,y,z=v.co;v.co=(1.0625+(x-mx)*scale,.13-z,1.715+(y-my)*scale)
    source.location=(1.0625,.13,1.715);source.rotation_euler=(math.pi/2,0,0);source.scale=(scale,scale,1)
    cutter.data.update()
    glyph_bounds=[[min(v.co[k] for v in cutter.data.vertices),max(v.co[k] for v in cutter.data.vertices)] for k in range(3)]
    assert abs(glyph_bounds[2][1]-glyph_bounds[2][0]-.175)<1e-5
    assert glyph_bounds[0][0]>.85 and glyph_bounds[0][1]<1.275
    mod=film.modifiers.new('Clear 15 cut through frosted surface','BOOLEAN');mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=cutter
    bpy.context.view_layer.objects.active=film
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(cutter,do_unlink=True)
    film['finish']='Frosted transmissive surface with genuine 15-shaped opening; continuous clear glazing underneath.'
    # Carry the hall tiles right to the threshold so the doorway meets the floor.
    tile=bpy.data.materials['Hall photo - charcoal mottled stone tiles 40cm']
    box('tiled reveal flush with hall floor',.77,2.19,.19,.495,.001,.005,tile)

    for z in (.23,.99,1.77):
        bar('white hinge barrel',(2.137,.211,z-.047),(2.137,.211,z+.047),.015,white)
        box('hinge fixing tab',2.103,2.17,.19,.211,z-.024,z+.024,white,.003)
    for side,y,direction in (('inside',.217,1),('outside',.063,-1)):
        bar(side+' handle rosette',(1.408,y-.008,1.04),(1.408,y+.008,1.04),.023,metal)
        bar(side+' lever stem',(1.408,y,1.04),(1.408,y+direction*.043,1.04),.009,metal)
        bar(side+' lever',(1.408,y+direction*.043,1.04),(1.535,y+direction*.043,1.04),.009,metal)
        bar(side+' key rosette',(1.408,y-.005,.936),(1.408,y+.005,.936),.018,metal)
        box(side+' key slot',1.405,1.411,min(y+direction*.006,y+direction*.007),max(y+direction*.006,y+direction*.007),.929,.943,seal,.001)

    scenes=[]
    for n,label,loc,target,lens in [
        (36,'INKOM - mat glas en heldere 15',(1.70,2.85,1.53),(1.48,.13,1.03),35),
        (37,'VOORDEUR - 15 vanaf buiten',(1.48,-3.0,1.35),(1.48,.13,1.04),51)]:
        name=f'{n:02d} | {label}';sc=bpy.data.scenes.get(name) or bpy.data.scenes.new(name)
        for c in list(sc.collection.children):sc.collection.children.unlink(c)
        sc.collection.children.link(bpy.data.collections['00 | GROUND - 2021'])
        sc.collection.children.link(bpy.data.collections['01 / Slab'])
        sc.collection.children.link(bpy.data.collections['04 | SITE and rear stair - indicative extent'])
        sc.render.engine='CYCLES';sc.cycles.device='CPU';sc.cycles.samples=48;sc.cycles.use_denoising=True
        sc.cycles.max_bounces=16;sc.cycles.transmission_bounces=12
        sc.render.resolution_x=1100;sc.render.resolution_y=1200;sc.render.resolution_percentage=100
        sc.render.threads_mode='FIXED';sc.render.threads=8;sc.render.image_settings.file_format='PNG'
        sc.world=bpy.data.worlds.new(P+label);sc.world.use_nodes=True
        sc.world.node_tree.nodes['Background'].inputs[0].default_value=(.65,.76,.95,1)
        sc.world.node_tree.nodes['Background'].inputs[1].default_value=.65
        sc.view_settings.view_transform='AgX';sc.unit_settings.system='METRIC'
        d=bpy.data.cameras.new(P+label);cam=bpy.data.objects.new(P+label,d);sc.collection.objects.link(cam)
        cam.location=loc;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();d.lens=lens;d.clip_start=.01;sc.camera=cam
        for title,pos,aim,power,size in [('outside daylight',(1.4,-1.8,3.1),(1.5,.3,1),180,3),('hall bounce',(1.55,2.2,2.08),(1.5,.1,1),65,1.5)]:
            ld=bpy.data.lights.new(P+title+str(n),'AREA');ld.energy=power;ld.shape='DISK';ld.size=size
            ob=bpy.data.objects.new(ld.name,ld);sc.collection.objects.link(ob);ob.location=pos
            ob.rotation_euler=(Vector(aim)-ob.location).to_track_quat('-Z','Y').to_euler();ob.visible_glossy=False;ob.visible_transmission=False
        scenes.append(sc)

    # Check the frost has actual holes but the clear substrate stays continuous.
    bm=bmesh.new();bm.from_mesh(film.data)
    assert not any(not e.is_manifold for e in bm.edges),'Frost layer must be a closed mesh'
    bm.free()
    clear=panes[-1];hits=holes=0
    for i in range(60):
        for j in range(50):
            x=.91+i*.005;z=1.59+j*.005
            origin=Vector((x,.30,z));direction=Vector((0,-1,0))
            if not film.ray_cast(origin,direction)[0]:
                holes+=1;assert clear.ray_cast(origin,direction)[0], 'Number must retain clear glazing'
            else:hits+=1
    assert holes>40 and hits>100
    assert len(panes)==4
    # Use the actual traced masonry opening (.741..2.561 m), rather than the
    # narrow 1.42 m facade placeholder used by the original simplified model.
    sx=1.82/1.42
    for ob in col.objects:
        ob.location.x=.741+(ob.location.x-.77)*sx
        ob.scale.x*=sx
    for ob in bpy.data.objects:
        if ob.name.startswith('0 / front infill') and ob.type=='MESH':
            matrix=ob.matrix_basis.copy();inverse=matrix.inverted()
            for v in ob.data.vertices:
                p=matrix@v.co
                if abs(p.x-.77)<.002:p.x=.741
                elif abs(p.x-2.19)<.002:p.x=2.561
                v.co=inverse@p
    for sc in scenes:
        sc.camera.location.x=1.651
        target=Vector((1.651,.13,1.03))
        sc.camera.rotation_euler=(target-sc.camera.location).to_track_quat('-Z','Y').to_euler()
    col['reference']='User photo of entrance; white frame, three door panes, full-height sidelight, clear 15.'
    col['dimensions']='Traced masonry opening 182 cm wide, height 201 cm estimated; frame proportions from photo.'
    report={'glass_panes':4,'frost_hole_ray_samples':holes,'frost_surface_ray_samples':hits,'clear_glass_behind_all_hole_samples':True,'opening_m':[1.82,2.01],'number_height_m':.175,'glyph_bounds_before_width_correction':glyph_bounds,'number_readable_from':'outside','dimensions_estimated':True}
    (ROOT/'entrance_door_verification.json').write_text(json.dumps(report,indent=2))
    notes='Voordeur volgens foto: witte profielen, drie matte semitransparante glasvakken, vast zijlicht met heldere 15. De 15 is geometrisch uitgespaard in de matte laag; er blijft echt helder glas achter. Leesbaar van buiten, gespiegeld van binnen. Deurbreedte 182 cm volgens bestaande getraceerde muuropening; hoogte 201 cm, profielen en nummerhoogte 17,5 cm geschat. Tegelvloer doorgetrokken tot dorpel. Scenes 36 en 37. Bron entrance_door_photo.py.'
    txt=bpy.data.texts.get('ENTRANCE - frosted glass and clear 15') or bpy.data.texts.new('ENTRANCE - frosted glass and clear 15');txt.clear();txt.write(notes)
    print('ENTRANCE VERIFIED',report,flush=True)
    return scenes

if __name__=='__main__':
    import shutil,sys
    main=ROOT/'Huis_Oude_Terelststraat_15.blend';backup=ROOT/'Huis_before_entrance_door_photo.blend'
    if not backup.exists():shutil.copy2(main,backup)
    scenes=update_entrance_door();bpy.context.window.scene=scenes[0]
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type=='VIEW_3D':
                area.spaces.active.region_3d.view_perspective='CAMERA'
                area.spaces.active.shading.type='RENDERED';area.spaces.active.overlay.show_overlays=False
    bpy.ops.wm.save_as_mainfile(filepath=str(main))
    if '--no-render' not in sys.argv:
        for sc,fn in zip(scenes,['entrance_door_inside.png','entrance_door_outside.png']):
            if '--draft' in sys.argv:sc.cycles.samples=20;sc.render.resolution_percentage=70
            bpy.context.window.scene=sc;sc.render.filepath=str(ROOT/fn);bpy.ops.render.render(write_still=True,scene=sc.name)
            sc.cycles.samples=48;sc.render.resolution_percentage=100
    bpy.context.window.scene=scenes[0];bpy.ops.wm.save_as_mainfile(filepath=str(main))
