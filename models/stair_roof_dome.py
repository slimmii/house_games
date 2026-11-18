"""Round glazed roof dome above the existing curved brick stair hall, from user photo."""
import bpy,bmesh,math,json
from mathutils import Vector
from pathlib import Path
ROOT=Path(__file__).resolve().parent
P='Stair dome / '
CX,CY=1.24,4.25

def update_stair_roof_dome():
    bpy.context.window.scene=bpy.data.scenes['01 | HOUSE - exterior']
    roof=bpy.data.objects['Main flat roof']
    for mod in list(roof.modifiers):
        if mod.name=='Round stair skylight opening':roof.modifiers.remove(mod)
    for o in list(bpy.data.objects):
        if o.name.startswith(P):bpy.data.objects.remove(o,do_unlink=True)
    old=bpy.data.collections.get('03 / Round stair roof dome')
    if old:bpy.data.collections.remove(old)
    col=bpy.data.collections.new('03 / Round stair roof dome');bpy.data.collections['03 | ROOFS - removable'].children.link(col)
    bpy.data.scenes['11 | STAIR HALL - full height brick'].collection.children.link(col)
    def mat(name,color,rough=.5):
        m=bpy.data.materials.get(P+name) or bpy.data.materials.new(P+name);m.diffuse_color=(*color,1);m.use_nodes=True
        p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough;return m
    white=mat('white moulded curb and splayed reveal',(.84,.84,.80),.31)
    ceiling=mat('warm taupe ceiling around opening',(.16,.135,.115),.85)
    seal=mat('dark EPDM dome gasket',(.018,.022,.023),.78)
    glass=mat('clear slightly blue acrylic dome',(.88,.95,1),.035)
    p=glass.node_tree.nodes.get('Principled BSDF');p.inputs['Transmission Weight'].default_value=1;p.inputs['IOR'].default_value=1.49
    def mesh(name,vs,fs,material,smooth=False):
        me=bpy.data.meshes.new(P+name);me.from_pydata(vs,[],fs);me.update();me.materials.append(material)
        bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free()
        ob=bpy.data.objects.new(P+name,me);col.objects.link(ob)
        for face in me.polygons:face.use_smooth=smooth
        return ob
    def lathe(name,profile,material):
        n=128;k=len(profile);vs=[(CX+r*math.cos(i*math.tau/n),CY+r*math.sin(i*math.tau/n),z) for r,z in profile for i in range(n)]
        fs=[(j*n+i,j*n+(i+1)%n,((j+1)%k)*n+(i+1)%n,((j+1)%k)*n+i) for j in range(k) for i in range(n)]
        return mesh(name,vs,fs,material,True)
    # The opening cuts the actual roof slab and the local underside finish.
    bpy.ops.mesh.primitive_cylinder_add(vertices=128,radius=.78,depth=1.8,location=(CX,CY,8.3))
    cutter=bpy.context.object;cutter.name=P+'roof opening cutter'
    for c in list(cutter.users_collection):c.objects.unlink(cutter)
    col.objects.link(cutter);cutter.hide_render=True;cutter.display_type='WIRE';cutter.hide_set(True)
    def cut(ob):
        mod=ob.modifiers.new('Round stair skylight opening','BOOLEAN');mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=cutter
    cut(roof)
    vs=[(x,y,z) for z in (8.099,8.113) for y in (3.34,5.30) for x in (.28,2.78)]
    patch=mesh('taupe ceiling surround',vs,[(0,2,3,1),(4,5,7,6),(0,1,5,4),(2,6,7,3),(0,4,6,2),(1,3,7,5)],ceiling);cut(patch)
    # Hollow white curb, with a broad lower rim and tapered interior light shaft.
    curb=lathe('white circular curb with splayed interior',[(.82,8.096),(.70,8.096),(.638,8.187),(.605,8.468),(.614,8.506),(.663,8.528),(.790,8.528),(.790,8.315),(.770,8.315),(.770,8.120),(.82,8.120)],white)
    sharp=curb.modifiers.new('Crisp moulding profile','EDGE_SPLIT');sharp.split_angle=math.radians(30)
    lathe('recessed dark glazing gasket',[(.614,8.519),(.635,8.519),(.635,8.529),(.614,8.529)],seal)
    # A real shallow curved transparent cap, not an opaque sky texture.
    n=128;nr=32;vs=[(CX,CY,8.691)]
    for j in range(1,nr+1):
        r=.628*j/nr;z=8.531+.160*(1-(r/.628)**2)
        for i in range(n):vs.append((CX+r*math.cos(i*math.tau/n),CY+r*math.sin(i*math.tau/n),z))
    fs=[(0,1+i,1+(i+1)%n) for i in range(n)]
    fs += [(1+(j-1)*n+i,1+j*n+i,1+j*n+(i+1)%n,1+(j-1)*n+(i+1)%n) for j in range(1,nr) for i in range(n)]
    dome=mesh('transparent shallow domed glazing',vs,fs,glass,True)
    mod=dome.modifiers.new('Acrylic shell thickness','SOLIDIFY');mod.thickness=.003;mod.offset=-1
    col['reference']='User photo codex-clipboard-867c1f1b-3107-47f2-9dc3-d007fb3ba993.png'
    col['estimated_dimensions']='Clear diameter 1.21 m, lower white rim outer diameter 1.64 m; roof underside 8.11 m, cap apex 8.691 m. Inferred from existing stair opening, not measured.'
    col['center_xy_m']=[CX,CY]
    # Shared editable roof geometry is visible in the house, stair detail and these views.
    views=[(32,'TRAPHAL - looking up at roof dome',(1.63,4.44,6.65),(1.24,4.25,8.28),20),
           (33,'DAK - round stair dome',(-.45,2.16,10.70),(1.24,4.25,8.30),44)]
    scenes=[]
    for number,label,loc,target,lens in views:
        name='%02d | %s'%(number,label);sc=bpy.data.scenes.get(name) or bpy.data.scenes.new(name)
        for c in list(sc.collection.children):sc.collection.children.unlink(c)
        for ob in list(sc.collection.objects):
            if ob.name.startswith(P):bpy.data.objects.remove(ob,do_unlink=True)
            else:sc.collection.objects.unlink(ob)
        sc.collection.children.link(bpy.data.collections['03 | ROOFS - removable'])
        for key in ('Walls left','Partitions','Joinery'):sc.collection.children.link(bpy.data.collections['02 / '+key])
        sc.render.engine='CYCLES';sc.cycles.device='CPU';sc.cycles.samples=32;sc.cycles.max_bounces=10;sc.cycles.transmission_bounces=8;sc.cycles.use_denoising=True
        sc.render.resolution_x=1500;sc.render.resolution_y=1125;sc.render.resolution_percentage=100;sc.render.threads_mode='FIXED';sc.render.threads=8;sc.render.image_settings.file_format='PNG'
        sc.world=bpy.data.worlds.new(P+label);sc.world.use_nodes=True
        sc.world.node_tree.nodes['Background'].inputs[0].default_value=(.53,.72,1,1);sc.world.node_tree.nodes['Background'].inputs[1].default_value=.65
        sc.view_settings.view_transform='AgX';sc.unit_settings.system='METRIC'
        d=bpy.data.cameras.new(P+label);cam=bpy.data.objects.new(P+label,d);sc.collection.objects.link(cam);cam.location=loc;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();d.lens=lens;d.clip_start=.015;sc.camera=cam
        def light(name,loc,target,power,size,color):
            sunlight=name.startswith('daylight above dome')
            d=bpy.data.lights.new(P+name,'SUN' if sunlight else 'AREA');d.energy=1.8 if sunlight else power;d.color=color
            if sunlight:d.angle=.08
            else:d.shape='DISK';d.size=size
            ob=bpy.data.objects.new(P+name,d);sc.collection.objects.link(ob);ob.location=loc;ob.rotation_euler=(Vector(target)-ob.location).to_track_quat('-Z','Y').to_euler();ob.visible_glossy=False;ob.visible_transmission=False
        light('daylight above dome '+str(number),(.8,3.30,11.3),(1.24,4.25,7.5),500,3.2,(1,.96,.86))
        if number==32:light('soft reflected stair light',(1.65,4.25,6.2),(1.24,4.25,8.15),48,1.35,(1,.9,.77))
        sc['reference_notes']='Round roof dome from user photo; dimensions estimated within existing curved brick stair enclosure. Roof has a genuine opening and transparent curved cap.'
        scenes.append(sc)
    # Check the roof is truly open at its centre and intact immediately beside it.
    bpy.context.view_layer.update();dg=bpy.context.evaluated_depsgraph_get();ev=roof.evaluated_get(dg);inv=ev.matrix_world.inverted()
    def hit(x,y):
        origin=inv@Vector((x,y,7.9));direction=(inv.to_3x3()@Vector((0,0,1))).normalized();return ev.ray_cast(origin,direction)[0]
    assert not hit(CX,CY),'Roof still blocks the skylight'
    assert hit(CX+.90,CY),'Roof around the skylight must stay intact'
    assert bpy.data.objects.get('Bedroom 1 / 2 dividing wall')
    assert bpy.data.collections['02 / Small bedroom furniture']['shelf_rows']==5
    assert bpy.data.collections['02 / Bedroom 2 furniture']['bedsides_equal']
    notes='''TRAPHAL — ronde lichtkoepel volgens gebruikersfoto.
Nieuwe scenes 32 (omhoog kijken vanuit de traphal) en 33 (dakdetail).
Ronde, transparante, licht gebogen koepel met brede witte onderrand en taps toelopende witte opstand. Rond de opening is het plafond warm taupe, zoals op de foto. De bestaande bakstenen traphal blijft behouden.
De koepel is geplaatst op de as van de gebogen trapomsluiting: x 1.24 m, y 4.25 m. Onderzijde dak +8.11 m, bovenzijde plat dak +8.31 m, koepeltop +8.691 m. Geschatte vrije diameter circa 121 cm, buitenmaat witte onderrand circa 164 cm. Geen opgemeten productmaten.
Het echte dakvlak heeft een ronde opening. De beglazing is een transparante gebogen schaal; het is geen geschilderde hemel. De opening en het intacte omliggende dak zijn met raycasts gecontroleerd.
De koepel hoort bij de verwijderbare dakcollectie en is ook zichtbaar in de volledige woning en de traphaldetailscene. In opengewerkte verdiepingsplannen blijft het dak weggelaten.
Bron: stair_roof_dome.py. Reservekopie: Huis_before_stair_roof_dome.blend.
'''
    txt=bpy.data.texts.get('TRAPHAL - roof dome notes') or bpy.data.texts.new('TRAPHAL - roof dome notes');txt.clear();txt.write(notes);(ROOT/'STAIR_DOME_NOTES.txt').write_text(notes)
    (ROOT/'stair_dome_verification.json').write_text(json.dumps({'roof_center_open':True,'roof_surround_intact':True,'center_m':[CX,CY],'clear_diameter_m':1.21,'outer_trim_diameter_m':1.64,'apex_z_m':8.691,'dimensions_estimated':True,'bedroom_wall_preserved':True},indent=2))
    print('STAIR ROOF DOME VERIFIED',flush=True)
    return scenes

if __name__=='__main__':
    import shutil,sys
    main=ROOT/'Huis_Oude_Terelststraat_15.blend';backup=ROOT/'Huis_before_stair_roof_dome.blend'
    if not backup.exists():shutil.copy2(main,backup)
    scenes=update_stair_roof_dome();bpy.context.window.scene=scenes[0]
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type=='VIEW_3D':area.spaces.active.region_3d.view_perspective='CAMERA';area.spaces.active.shading.type='RENDERED';area.spaces.active.overlay.show_overlays=False
    bpy.ops.wm.save_as_mainfile(filepath=str(main))
    if '--no-render' not in sys.argv:
        for sc,fn in zip(scenes,['stair_roof_dome_inside.png','stair_roof_dome_outside.png']):
            sc.cycles.samples=16;sc.render.resolution_percentage=70;sc.render.filepath=str(ROOT/fn);bpy.context.window.scene=sc
            bpy.ops.render.render(write_still=True,scene=sc.name);sc.cycles.samples=32;sc.render.resolution_percentage=100
    bpy.context.window.scene=scenes[0];bpy.ops.wm.save_as_mainfile(filepath=str(main))
