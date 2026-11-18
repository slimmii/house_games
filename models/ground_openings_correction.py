"""User correction: closed laundry/bedroom wall and doorless dressing access."""
import bpy, json, shutil, sys
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parent
P='Ground circulation correction / '


def update_ground_openings():
    bpy.context.window.scene=bpy.data.scenes['01 | HOUSE - exterior']
    bpy.context.view_layer.update()
    part=bpy.data.collections['00 / Partitions']
    for ob in list(bpy.data.objects):
        if ob.name.startswith(P) or ob.name=='Dressing door':
            bpy.data.objects.remove(ob,do_unlink=True)
    plaster=bpy.data.materials['Warm white plaster']

    def wall(name,x0,x1,y0,y1,z0,z1):
        bpy.ops.mesh.primitive_cube_add(size=1,location=((x0+x1)/2,(y0+y1)/2,(z0+z1)/2))
        ob=bpy.context.object; ob.name=P+name; ob.dimensions=(x1-x0,y1-y0,z1-z0)
        bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
        for c in list(ob.users_collection):c.objects.unlink(ob)
        part.objects.link(ob); ob.data.materials.append(plaster)
        ob['user_correction']='2026-09-28: no opening between laundry and bedroom; dressing open without a door.'
        return ob

    # The CAD gap lies between source masonry 097/098 and 004/005, not at
    # the hall entrance to the bedroom (which remains a separate doorway).
    wall('solid laundry bedroom infill',2.8004,2.9506,7.0398,7.8901,0,2.22)
    # An old placeholder door was embedded in an unbroken wall. Split only
    # that wall segment, keeping its lintel and the adjacent bathroom door.
    old=bpy.data.objects.get('Bedroom partition.003')
    if old:bpy.data.objects.remove(old,do_unlink=True)
    # 85 cm dressing passage from the user's ground-floor plan crop.
    a,b=5.395,6.245
    wall('dressing left pier',4.40,a,5.69,5.81,0,2.03)
    wall('dressing right pier',b,6.94,5.69,5.81,0,2.03)

    name='63 | GROUND FLOOR - closed laundry wall and open dressing'
    sc=bpy.data.scenes.get(name) or bpy.data.scenes.new(name)
    for c in list(sc.collection.children):sc.collection.children.unlink(c)
    for ob in list(sc.collection.objects):
        sc.collection.objects.unlink(ob)
        if not ob.users_collection:bpy.data.objects.remove(ob)
    sc.collection.children.link(bpy.data.collections['00 | GROUND - 2021'])
    # The storey above is deliberately absent in this inspection view.
    sc.render.engine='CYCLES';sc.cycles.device='CPU';sc.cycles.samples=20;sc.cycles.use_denoising=True
    sc.render.resolution_x=1250;sc.render.resolution_y=1150;sc.render.resolution_percentage=85
    sc.render.threads_mode='FIXED';sc.render.threads=8;sc.render.image_settings.file_format='PNG'
    sc.world=bpy.data.worlds.new(P+'review daylight');sc.world.use_nodes=True
    sc.world.node_tree.nodes['Background'].inputs[1].default_value=.35
    sc.view_settings.view_transform='AgX'
    cd=bpy.data.cameras.new(P+'review camera');cam=bpy.data.objects.new(cd.name,cd);sc.collection.objects.link(cam)
    cam.location=(3.7,6.65,11);cam.rotation_euler=(0,0,0);cd.type='ORTHO';cd.ortho_scale=7.2;sc.camera=cam
    ld=bpy.data.lights.new(P+'review light','AREA');ld.energy=500;ld.size=6
    light=bpy.data.objects.new(ld.name,ld);sc.collection.objects.link(light);light.location=(3.7,6.65,8)
    sc.render.filepath=str(ROOT/'ground_closed_wall_open_dressing.png')
    bpy.context.window.scene=bpy.data.scenes['01 | HOUSE - exterior'];bpy.context.view_layer.update()

    # Ray checks through the full ground partition collection: the laundry
    # gap must hit wall at all heights; the dressing centre must stay clear.
    def hits(origin,direction,distance):
        found=[]
        for ob in part.objects:
            if ob.type!='MESH':continue
            inv=ob.matrix_world.inverted()
            start=inv@Vector(origin); end=inv@(Vector(origin)+Vector(direction)*distance)
            hit,point,normal,index=ob.ray_cast(start,(end-start).normalized(),distance=(end-start).length)
            if hit:found.append(ob.name)
        return found
    for y in (7.05,7.46,7.88):
        for z in (.05,1.0,2.15):assert hits((2.6,y,z),(1,0,0),.6),(y,z)
    for x in (a+.02,(a+b)/2,b-.02):
        for z in (.05,1.0,2.0):assert not hits((x,5.5,z),(0,1,0),.5),(x,z)
    assert bpy.data.objects.get('Dressing door') is None
    assert bpy.data.objects.get('Ground bathroom photo / bathroom entry door CONTROL')
    assert bpy.data.objects.get('Ground room doors / Laundry / white flush door leaf')
    assert (bpy.data.objects.get('Ground room doors / Bedroom / white flush door leaf')
            or bpy.data.objects.get('Ground bedroom refinement / single white door leaf')
            or bpy.data.objects.get('Ground door clearance / bedroom door leaf'))
    report={'laundry_bedroom_wall_closed':True,'infill_bounds_m':[[2.8004,2.9506],[7.0398,7.8901],[0,2.22]],
            'dressing_door_removed':True,'dressing_clear_opening_m':.85,'dressing_opening_height_m':2.03,
            'wall_and_passage_ray_checks_passed':True,'hall_room_doors_retained':True,'bathroom_door_retained':True}
    (ROOT/'ground_openings_verification.json').write_text(json.dumps(report,indent=2))
    note='BENEDENVERDIEPING — gebruikerscorrectie 28 september 2026: opening tussen waskot en slaapkamer volledig dichtgemetseld over 85 cm, wanddikte 15 cm en hoogte 222 cm. De afzonderlijke toegangen vanuit de hal blijven behouden. Dressing heeft een echte open doorgang van 85 cm breed en 203 cm hoog, zonder deur of kozijn. Badkamerdeur behouden. Scene 63; ground_openings_correction.py.\n'
    txt=bpy.data.texts.get('GROUND FLOOR - circulation correction') or bpy.data.texts.new('GROUND FLOOR - circulation correction')
    txt.clear();txt.write(note)
    (ROOT/'GROUND_OPENINGS_NOTES.txt').write_text(note)
    return sc


if __name__=='__main__':
    main=ROOT/'Huis_Oude_Terelststraat_15.blend';backup=ROOT/'Huis_before_ground_openings_correction.blend'
    if not backup.exists():shutil.copy2(main,backup)
    sc=update_ground_openings();bpy.context.window.scene=sc
    bpy.ops.wm.save_as_mainfile(filepath=str(main))
    if '--no-render' not in sys.argv:bpy.ops.render.render(write_still=True,scene=sc.name)
    bpy.ops.wm.save_as_mainfile(filepath=str(main))
