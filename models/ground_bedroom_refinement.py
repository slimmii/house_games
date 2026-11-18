"""Ground bedroom bed orientation, hall-side white wall and corrected entry door."""
import bpy, math, json, shutil
from pathlib import Path
from mathutils import Vector, Matrix
ROOT=Path(__file__).resolve().parent
P='Ground bedroom refinement / '


def update_ground_bedroom_refinement():
    bpy.context.window.scene=bpy.data.scenes['01 | HOUSE - exterior'];bpy.context.view_layer.update()
    # Store the original matrices so repeat runs do not rotate the bed again.
    furniture=bpy.data.collections['00 / Furniture']
    names=('Bed base - indicative','Mattress','Headboard','Pillow','Pillow.001','Folded blanket')
    transform=Matrix.Translation((5.96,7.10,0)) @ Matrix.Rotation(-math.pi/2,4,'Z') @ Matrix.Translation((-5.20,-7.10,0))
    for name in names:
        ob=furniture.objects.get(name)
        assert ob is not None,name
        if 'bed_original_matrix' not in ob:ob['bed_original_matrix']=[v for row in ob.matrix_world for v in row]
        data=list(ob['bed_original_matrix']);original=Matrix([data[i:i+4] for i in range(0,16,4)])
        ob.matrix_world=transform@original
        ob['bed_placement']='Headboard against the solid wall opposite the entry, matching ground-floor plan; 90 degree rotation.'

    joinery=bpy.data.collections['00 / Joinery'];part=bpy.data.collections['00 / Partitions']
    for ob in list(bpy.data.objects):
        if ob.name.startswith((P,'Ground room doors / Bedroom /')):bpy.data.objects.remove(ob,do_unlink=True)
    plaster=bpy.data.materials['Warm white plaster'];white=bpy.data.materials['Camber - premium white matt W1000 ST9']
    silver=bpy.data.materials['Door - brushed nickel hardware'];dark=bpy.data.materials['Door - dark reveal and key slot']
    for n in (101,102):
        ob=bpy.data.objects[f'ground / source masonry {n:03d}']
        slot=next((i for i,m in enumerate(ob.data.materials) if m==plaster),None)
        if slot is None:slot=len(ob.data.materials);ob.data.materials.append(plaster)
        for face in ob.data.polygons:face.material_index=slot
        ob['hall_face_finish']='White plaster, user screenshot 2026-09-28'

    def box(name,loc,size,mat=white,col=joinery):
        bpy.ops.mesh.primitive_cube_add(size=1,location=loc);ob=bpy.context.object;ob.name=P+name;ob.dimensions=size
        bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
        for c in list(ob.users_collection):c.objects.unlink(ob)
        col.objects.link(ob);ob.data.materials.append(mat)
        b=ob.modifiers.new('Eased edges','BEVEL');b.width=.0015;b.segments=3
        return ob
    def rod(name,a,b,r,mat=silver):
        a,b=Vector(a),Vector(b)
        bpy.ops.mesh.primitive_cylinder_add(vertices=24,radius=r,depth=(b-a).length,location=(a+b)/2)
        ob=bpy.context.object;ob.name=P+name;ob.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler()
        for c in list(ob.users_collection):c.objects.unlink(ob)
        joinery.objects.link(ob);ob.data.materials.append(mat)
        return ob
    # A single real leaf, with seals limited to the frame perimeter. No solid
    # black rectangle fills the opening behind it. Handing keeps the handles
    # at the end away from the adjacent laundry entrance.
    box('white plaster door lintel',(2.875,5.85,2.145),(.15,.70,.15),plaster,part)
    for y in (5.519,6.181):box('white doorway jamb',(2.875,y,1.031),(.15,.038,2.062))
    box('white doorway head',(2.875,5.85,2.050),(.15,.70,.024))
    for x in (2.789,2.961):
        for y in (5.492,6.208):box('white architrave',(x,y,1.038),(.018,.048,2.076))
        box('white architrave head',(x,5.85,2.087),(.018,.764,.048))
    for y in (5.541,6.159):box('thin perimeter seal',(2.898,y,1.031),(.008,.004,2.02),dark)
    box('thin top seal',(2.898,5.85,2.038),(.008,.62,.004),dark)
    for y in (5.544,6.156):box('rebated door stop',(2.903,y,1.029),(.012,.009,2.022))
    box('rebated head stop',(2.903,5.85,2.033),(.012,.62,.012))
    control=bpy.data.objects.new(P+'bedroom door CONTROL',None);joinery.objects.link(control)
    control.location=(2.875,6.154,0);control.empty_display_size=.08
    control['Open angle']=0.0;control.id_properties_ui('Open angle').update(min=0,max=90,description='Door opens into the hall, away from the laundry doorway')
    moving=[box('single white door leaf',(2.875,5.85,1.025),(.038,.608,2.018))]
    for z in (.23,1.02,1.81):moving.append(rod('door hinge',(2.847,6.156,z-.028),(2.847,6.156,z+.028),.006))
    for sign in (-1,1):
        x=2.875+sign*.021;y=5.639
        moving.append(rod('handle round rose',(x,y,1.02),(x+sign*.009,y,1.02),.025))
        moving.append(rod('handle spindle',(x,y,1.02),(x+sign*.048,y,1.02),.007))
        moving.append(rod('horizontal lever',(x+sign*.048,y,1.02),(x+sign*.048,y+.10,1.02),.007))
        moving.append(rod('key escutcheon',(x,y,.865),(x+sign*.007,y,.865),.016))
        moving.append(box('keyhole',(x+sign*.008,y,.865),(.0015,.003,.011),dark))
    bpy.context.view_layer.update()
    for ob in moving:
        world=ob.matrix_world.copy();ob.parent=control;ob.matrix_world=world
    driver=control.driver_add('rotation_euler',2).driver;driver.expression='-angle*pi/180'
    var=driver.variables.new();var.name='angle';var.targets[0].id=control;var.targets[0].data_path='["Open angle"]'
    driver.expression='-angle*0.017453292519943295'

    scenes=[]
    specs=[('64 | GROUND BEDROOM - bed against rear wall',(3.60,7.98,1.94),(5.91,7.12,.68),29,'ground_bedroom_rotated_bed.png'),
           ('65 | GROUND HALL - white bedroom doorway',(1.98,5.04,1.72),(2.89,5.64,1.12),20,'ground_bedroom_white_door.png')]
    for name,loc,target,lens,fn in specs:
        sc=bpy.data.scenes.get(name) or bpy.data.scenes.new(name)
        for c in list(sc.collection.children):sc.collection.children.unlink(c)
        for ob in list(sc.collection.objects):
            sc.collection.objects.unlink(ob)
            if not ob.users_collection:bpy.data.objects.remove(ob)
        sc.collection.children.link(bpy.data.collections['00 | GROUND - 2021'])
        sc.render.engine='CYCLES';sc.cycles.device='CPU';sc.cycles.samples=20;sc.cycles.use_denoising=True
        sc.render.threads_mode='FIXED';sc.render.threads=8
        sc.render.resolution_x=1200;sc.render.resolution_y=950;sc.render.resolution_percentage=85
        sc.render.image_settings.file_format='PNG';sc.render.filepath=str(ROOT/fn)
        sc.world=bpy.data.worlds.new(P+name);sc.world.use_nodes=True;sc.world.node_tree.nodes['Background'].inputs[1].default_value=.3
        cd=bpy.data.cameras.new(P+name);cam=bpy.data.objects.new(cd.name,cd);sc.collection.objects.link(cam)
        cam.location=loc;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();cd.lens=lens;cd.clip_start=.02;sc.camera=cam
        ld=bpy.data.lights.new(P+name+' soft light','AREA');ld.energy=130;ld.size=2
        light=bpy.data.objects.new(ld.name,ld);sc.collection.objects.link(light);light.location=(loc[0],loc[1],2.7)
        light.rotation_euler=(Vector(target)-light.location).to_track_quat('-Z','Y').to_euler()
        scenes.append(sc)
    bpy.context.window.scene=bpy.data.scenes['01 | HOUSE - exterior'];bpy.context.view_layer.update()
    head=bpy.data.objects['Headboard'];points=[head.matrix_world@Vector(v) for v in head.bound_box]
    head_x=max(p.x for p in points);assert abs(head_x-6.98)<.002,head_x
    assert bpy.data.objects.get('Ground room doors / Bedroom / reveal') is None
    assert len([o for o in joinery.objects if o.name==P+'single white door leaf'])==1
    for n in (101,102):
        ob=bpy.data.objects[f'ground / source masonry {n:03d}']
        assert all(ob.data.materials[f.material_index]==plaster for f in ob.data.polygons)
    assert bpy.data.objects.get('Ground circulation correction / solid laundry bedroom infill')
    assert bpy.data.objects.get('Dressing door') is None
    report={'bed_rotated_deg':-90,'headboard_outer_x_m':round(head_x,3),'solid_wall_inner_x_m':7.001,
            'headboard_wall_gap_m':round(7.001-head_x,3),'single_framed_door':True,'full_opening_reveal_plane_removed':True,
            'door_handle_relocated_away_from_laundry':True,'door_default_angle_deg':0,'hall_side_wall_white':True,
            'laundry_partition_closed':True,'dressing_still_doorless':True}
    (ROOT/'ground_bedroom_refinement_verification.json').write_text(json.dumps(report,indent=2))
    note='BENEDEN SLAAPKAMER: bed 90 graden gedraaid, hoofdeinde tegen de dichte wand tegenover de ingang (zoals het grondplan), circa 2 cm wandspeling. Slaapkamerdeur opnieuw opgebouwd met één deurblad, passend kozijn, smalle aanslagen en beslag aan de zijde weg van de waskotdeur. Achterliggend vlak verwijderd; deurhoek instelbaar, standaard gesloten. Rechte halwand en deurlatei wit gepleisterd. Eerdere gesloten waskotwand en open dressing behouden. Scenes 64–65; ground_bedroom_refinement.py.\n'
    (ROOT/'GROUND_BEDROOM_REFINEMENT_NOTES.txt').write_text(note)
    txt=bpy.data.texts.get('GROUND BEDROOM - refinement') or bpy.data.texts.new('GROUND BEDROOM - refinement');txt.clear();txt.write(note)
    return scenes


if __name__=='__main__':
    main=ROOT/'Huis_Oude_Terelststraat_15.blend';backup=ROOT/'Huis_before_ground_bedroom_refinement.blend'
    if not backup.exists():shutil.copy2(main,backup)
    scenes=update_ground_bedroom_refinement();bpy.context.window.scene=scenes[0];bpy.ops.wm.save_as_mainfile(filepath=str(main))
    for sc in scenes:
        bpy.context.window.scene=sc;bpy.ops.render.render(write_still=True,scene=sc.name)
    bpy.context.window.scene=scenes[0];bpy.ops.wm.save_as_mainfile(filepath=str(main))
