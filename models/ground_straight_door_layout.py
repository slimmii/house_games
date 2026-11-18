"""Straight-wall bedroom doorway correction; supersedes the rejected laundry alcove."""
import bpy, math, json, shutil
from pathlib import Path
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

ROOT=Path(__file__).resolve().parent
P='Ground straight doorway / '


def bounds(ob):
    pts=[ob.matrix_world@Vector(p) for p in ob.bound_box]
    return (Vector(tuple(min(p[i] for p in pts) for i in range(3))),
            Vector(tuple(max(p[i] for p in pts) for i in range(3))))


def overlaps(a,b,epsilon=.00001):
    return all(min(a[1][i],b[1][i])-max(a[0][i],b[0][i])>epsilon for i in range(3))


def close_laundry_exterior_seam():
    """Continue the west exterior wall through the old laundry T-junction.

    CAD objects are triangular prisms, not duplicate rectangular walls.
    Both triangles of the southern wall must therefore be extended together.
    The former transverse partition filled this 112 mm gap before it moved.
    """
    bpy.context.window.scene=bpy.data.scenes['01 | HOUSE - exterior']
    bpy.context.view_layer.update()
    north=bpy.data.objects['ground / source masonry 028']
    join_y=bounds(north)[0].y
    for n in (34,35):
        ob=bpy.data.objects[f'ground / source masonry {n:03d}']
        inv=ob.matrix_world.inverted()
        for v in ob.data.vertices:
            world=ob.matrix_world@v.co
            if world.y>6.19:
                world.y=join_y;v.co=inv@world
        ob.data.update()
        ob['laundry_wall_seam_repair']='Extended to adjoining north wall at the former laundry wall junction; straight exterior face retained.'
    bpy.context.view_layer.update()
    walls=bpy.data.collections['00 / Walls left'].objects
    checked=0
    for j in range(61):
        y=6.18+j*.0025
        for z in (.01,.5,1.,1.5,2.,2.21):
            hits=[]
            for ob in walls:
                if ob.type!='MESH':continue
                inv=ob.matrix_world.inverted()
                a=inv@Vector((.5,y,z));b=inv@Vector((-.1,y,z))
                hit,*_=ob.ray_cast(a,(b-a).normalized(),distance=(b-a).length)
                if hit:hits.append(ob.name)
            assert hits,('Open exterior seam',y,z)
            checked+=1
    return {'west_exterior_seam_closed':True,'wall_join_y_m':join_y,
            'wall_continuity_rays_passed':checked,'door_layout_unchanged':True}


def update_ground_straight_door_layout():
    bpy.context.window.scene=bpy.data.scenes['01 | HOUSE - exterior'];bpy.context.view_layer.update()
    root=bpy.data.collections['00 | GROUND - 2021']
    part=bpy.data.collections['00 / Partitions'];joinery=bpy.data.collections['00 / Joinery']
    laundry=bpy.data.collections['00 / Laundry photo fittings'];hall=bpy.data.collections['00 / Hall photo joinery']
    oldfloor=bpy.data.objects.get('Laundry photo / washed oak laundry floor')
    floor_mat=oldfloor.data.materials[0] if oldfloor else bpy.data.materials[P+'laundry floor retained']
    if not bpy.data.materials.get(P+'laundry floor retained'):
        floor_mat=floor_mat.copy();floor_mat.name=P+'laundry floor retained'
    old_door_prefix='Ground bedroom refinement / '
    old_door_suffixes=('white plaster door lintel','white doorway','white architrave','thin perimeter','thin top',
                       'rebated','bedroom door CONTROL','single white door leaf','door hinge','handle','horizontal lever','key')
    removed=[]
    for ob in list(bpy.data.objects):
        if (ob.name.startswith(P) or ob.name.startswith('Ground room doors / Bedroom /')
                or (ob.name.startswith(old_door_prefix) and ob.name[len(old_door_prefix):].startswith(old_door_suffixes))
                or ob.name=='Ground circulation correction / solid laundry bedroom infill'
                or ob.name=='Laundry photo / washed oak laundry floor'
                or ob.name in {f'ground / source masonry {n:03d}' for n in (97,98,99,100)}):
            removed.append(ob.name);bpy.data.objects.remove(ob,do_unlink=True)
    plaster=bpy.data.materials['Warm white plaster'];white=bpy.data.materials['Camber - premium white matt W1000 ST9']
    chrome=bpy.data.materials['Door - brushed nickel hardware'];dark=bpy.data.materials['Door - dark reveal and key slot']
    floor_hall=bpy.data.objects['Hall photo / hall stone tile floor'].data.materials[0]
    wall_objects=[]

    def mesh(name,verts,faces,mat,col):
        me=bpy.data.meshes.new(P+name);me.from_pydata(verts,[],faces);me.update();me.materials.append(mat)
        ob=bpy.data.objects.new(P+name,me);col.objects.link(ob);return ob

    def box(name,lo,hi,mat=white,col=joinery,bevel=0):
        x0,y0,z0=lo;x1,y1,z1=hi
        ob=mesh(name,[(x,y,z) for z in (z0,z1) for y in (y0,y1) for x in (x0,x1)],
                [(0,2,3,1),(4,5,7,6),(0,1,5,4),(2,6,7,3),(0,4,6,2),(1,3,7,5)],mat,col)
        if bevel:
            b=ob.modifiers.new('Eased painted edges','BEVEL');b.width=bevel;b.segments=3
        if col==part:wall_objects.append(ob)
        return ob

    def rod(name,a,b,r,mat=chrome):
        a,b=Vector(a),Vector(b);direction=(b-a).normalized()
        u=direction.cross(Vector((0,0,1)))
        if u.length<.01:u=direction.cross(Vector((0,1,0)))
        u.normalize();v=direction.cross(u);n=20
        vertices=[tuple(p+r*(u*math.cos(i*math.tau/n)+v*math.sin(i*math.tau/n))) for p in (a,b) for i in range(n)]
        faces=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
        return mesh(name,vertices,faces,mat,joinery)

    # Keep the original rectangular rooms: translate the complete laundry
    # front wall 385 mm north, never introduce an alcove or return.
    dy=.385
    for n in (30,31):
        ob=bpy.data.objects[f'ground / source masonry {n:03d}']
        if 'straight_original_y' not in ob:ob['straight_original_y']=float(ob.location.y)
        ob.location.y=ob['straight_original_y']+dy
        wall_objects.append(ob)
    seam_report=close_laundry_exterior_seam()
    box('laundry front corner pier',(2.776,6.585,0),(2.8004,6.695,2.22),plaster,part)
    box('bedroom south pier extension',(2.8004,5.4999,0),(2.9506,5.86,2.22),plaster,part)
    box('continuous laundry bedroom wall',(2.8004,6.51,0),(2.9506,7.89,2.22),plaster,part)
    box('bedroom opening white lintel',(2.8004,5.86,2.07),(2.9506,6.51,2.22),plaster,part)
    for ob in bpy.data.objects:
        if ob.name.startswith('Ground room doors / Laundry /'):
            if 'straight_original_y' not in ob:ob['straight_original_y']=float(ob.location.y)
            ob.location.y=ob['straight_original_y']+dy
    # The freezer and its vessel need only 105 mm to clear the shifted wall.
    # Keep their actual sizes and leave the tower, washer and dryer untouched.
    moved_fixtures=[]
    for ob in laundry.objects:
        suffix=ob.name.removeprefix('Laundry photo / ')
        shift=Vector((0,0,0))
        if any(k in suffix for k in ('freezer','vessel')):shift.y=.105
        elif 'vertical service pipe' in suffix:shift=Vector((-.025,.30,0))
        if shift.length:
            if 'straight_original_location' not in ob:ob['straight_original_location']=list(ob.location)
            ob.location=Vector(ob['straight_original_location'])+shift
            moved_fixtures.append(ob.name)
    box('rectangular laundry floor',(.332,6.695,.001),(2.73,10.62,.006),floor_mat,laundry)
    box('straight hall tile extension',(.332,6.31,.001),(2.8004,6.585,.005),floor_hall,hall)
    box('bedroom threshold extension',(2.8004,6.31,.001),(2.9506,6.51,.005),floor_hall,hall)
    box('laundry threshold',(1.976,6.585,.001),(2.776,6.695,.005),floor_hall,hall)
    bpy.context.view_layer.update()
    # Trim the laundry casing at its straight T-junction with the side wall.
    # The old oversized end extended 17 mm into that wall.
    for ob in joinery.objects:
        if ob.name.startswith('Ground room doors / Laundry / white architrave'):
            inv=ob.matrix_world.inverted()
            for v in ob.data.vertices:
                world=ob.matrix_world@v.co
                if world.x>2.7994:world.x=2.7994;v.co=inv@world
            ob.data.update()

    # 650 mm masonry opening, 580 mm between jambs and a 558 mm leaf.
    # The hinge axis is at the bedroom-side edge, so the thick leaf can swing
    # clear of the jamb instead of rotating through the surrounding wall.
    for ya,yb in ((5.86,5.895),(6.475,6.51)):
        box('white door jamb',(2.8004,ya,.005),(2.9506,yb,2.062),bevel=.001)
    box('white door head',(2.8004,5.86,2.038),(2.9506,6.51,2.07),bevel=.001)
    for xa,xb in ((2.7784,2.8004),(2.9506,2.9726)):
        for ya,yb in ((5.828,5.876),(6.494,6.542)):
            box('white door casing',(xa,ya,.005),(xb,yb,2.076),bevel=.001)
        box('white casing head',(xa,5.828,2.07),(xb,6.542,2.118),bevel=.001)
    for ya,yb in ((5.895,5.901),(6.469,6.475)):
        box('slim rebated stop',(2.892,ya,.016),(2.902,yb,2.036))
        box('perimeter rubber seal',(2.902,ya,.016),(2.905,yb,2.036),dark)
    box('head rebated stop',(2.892,5.901,2.030),(2.902,6.469,2.038))
    control=bpy.data.objects.new(P+'bedroom door CONTROL',None);joinery.objects.link(control)
    pivot=Vector((2.955,5.900,0));control.location=pivot;control.empty_display_size=.09
    control['Open angle']=75.0;control.id_properties_ui('Open angle').update(min=0,max=90,description='Inward swing into bedroom, verified from closed to 90 degrees')
    control['rough_opening_m']=.65;control['jamb_clear_width_m']=.58
    leaf=box('bedroom door leaf',(2.911,5.906,.016),(2.949,6.464,2.034),bevel=.0015)
    moving=[leaf]
    for z in (.23,1.02,1.81):rod('fixed hinge barrel',(2.955,5.900,z-.028),(2.955,5.900,z+.028),.006)
    for sign in (-1,1):
        x=2.93+sign*.021;y=6.364
        moving.append(rod('handle rose',(x,y,1.02),(x+sign*.009,y,1.02),.024))
        moving.append(rod('handle spindle',(x,y,1.02),(x+sign*.049,y,1.02),.007))
        moving.append(rod('horizontal lever',(x+sign*.049,y,1.02),(x+sign*.049,y-.10,1.02),.007))
        moving.append(rod('privacy rose',(x,y,.865),(x+sign*.007,y,.865),.016))
        moving.append(box('key slot',(x+sign*.008-.0005,y-.0015,.859),(x+sign*.008+.0005,y+.0015,.871),dark))
    bpy.context.view_layer.update()
    for ob in moving:
        # Vertices were authored in world coordinates; use a fixed inverse
        # parent offset, then rotate their parent about the hinge axis.
        ob.parent=control;ob.matrix_parent_inverse=Matrix.Translation(-pivot)
    drv=control.driver_add('rotation_euler',2).driver;drv.expression='-angle*0.017453292519943295'
    variable=drv.variables.new();variable.name='angle';variable.targets[0].id=control;variable.targets[0].data_path='["Open angle"]'
    # Collision checks use world-space copies and analytical hinge transforms,
    # avoiding dependency-graph updates for every sample of the full swing.
    envelope=(Vector((2.73,5.80,0)),Vector((3.60,6.60,2.04)))
    bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get()
    static=[]
    for ob in root.all_objects:
        if ob.type!='MESH' or ob in moving or ob.name.startswith(P+'fixed hinge'):continue
        if not overlaps(bounds(ob),envelope):continue
        evaluated=ob.evaluated_get(deps);me=evaluated.to_mesh()
        vs=[ob.matrix_world@v.co for v in me.vertices];fs=[tuple(p.vertices) for p in me.polygons]
        static.append((ob.name,bounds(ob),BVHTree.FromPolygons(vs,fs)))
        evaluated.to_mesh_clear()
    shapes=[]
    for ob in moving:
        # Original mesh coordinates are still in the closed-door world frame.
        shapes.append((ob.name,[v.co.copy() for v in ob.data.vertices],[tuple(p.vertices) for p in ob.data.polygons]))
    collisions=[]
    for angle in range(91):
        trans=Matrix.Translation(pivot) @ Matrix.Rotation(-math.radians(angle),4,'Z') @ Matrix.Translation(-pivot)
        for name,original,faces in shapes:
            vs=[trans@v for v in original]
            bb=(Vector(tuple(min(v[i] for v in vs) for i in range(3))),Vector(tuple(max(v[i] for v in vs) for i in range(3))))
            tree=None
            for other,otherbb,bvh in static:
                if not overlaps(bb,otherbb):continue
                if tree is None:tree=BVHTree.FromPolygons(vs,faces)
                if tree.overlap(bvh):collisions.append((angle,name,other))
    assert not collisions,collisions[:20]

    # Independently check passage rays through the entire wall thickness.
    for y in (5.93,6.18,6.44):
        for z in (.10,1.0,2.0):
            for ob in part.objects:
                if ob.type!='MESH':continue
                inv=ob.matrix_world.inverted();a=inv@Vector((2.70,y,z));b=inv@Vector((3.12,y,z))
                hit,*_=ob.ray_cast(a,(b-a).normalized(),distance=(b-a).length)
                assert not hit,('blocked bedroom passage',ob.name,y,z)
    fixture_clashes=[]
    fixtures=[o for o in laundry.objects if o.type in {'MESH','CURVE'} and 'floor' not in o.name.lower()]
    for wall in wall_objects:
        for ob in fixtures:
            if overlaps(bounds(wall),bounds(ob)):fixture_clashes.append((wall.name,ob.name))
    assert not fixture_clashes,fixture_clashes
    assert bpy.data.objects.get('Dressing door') is None
    assert bpy.data.objects.get('Ground bathroom photo / bathroom entry door CONTROL')
    report={'rough_door_opening_m':.65,'clear_between_jambs_m':.58,'door_leaf_width_m':.558,
            'bedroom_opening_y_m':[5.86,6.51],'bathroom_wall_unchanged':True,
            'laundry_front_wall_shift_m':dy,'layout':'original rectangular rooms; straight walls, no alcove',
            'freezer_and_vessel_shift_m':.105,'moved_fixtures':moved_fixtures,
            'swing_checked_degrees':list(range(91)),
            'swing_mesh_collision_count':len(collisions),'new_wall_fixture_collision_count':len(fixture_clashes),
            'full_passage_rays_clear':True,'bathroom_door_preserved':True,'dressing_still_open':True}
    report.update(seam_report)
    (ROOT/'ground_straight_door_layout_verification.json').write_text(json.dumps(report,indent=2))
    print('DOOR CLEARANCE VERIFIED',json.dumps(report),flush=True)

    # Review the real room from above and from inside the enlarged hallway.
    scenes=[]
    for name,loc,target,lens,fn in [
        ('66 | GROUND FLOOR - straight bedroom doorway',(4.9,8.1,5.0),(2.45,6.3,.85),37,'ground_straight_door_layout_overview.png'),
        ('67 | GROUND HALL - compact straight doorway',(2.11,5.54,1.73),(3.02,6.17,1.04),20,'ground_straight_door_layout_eye.png')]:
        sc=bpy.data.scenes.get(name) or bpy.data.scenes.new(name)
        for c in list(sc.collection.children):sc.collection.children.unlink(c)
        for ob in list(sc.collection.objects):
            sc.collection.objects.unlink(ob)
            if not ob.users_collection:bpy.data.objects.remove(ob)
        sc.collection.children.link(root);sc.render.engine='CYCLES';sc.cycles.device='CPU';sc.cycles.samples=8;sc.cycles.use_denoising=True
        sc.render.threads_mode='FIXED';sc.render.threads=8;sc.render.resolution_x=800;sc.render.resolution_y=700;sc.render.resolution_percentage=100
        sc.render.image_settings.file_format='PNG';sc.render.filepath=str(ROOT/fn)
        sc.world=bpy.data.worlds.new(P+name);sc.world.use_nodes=True;sc.world.node_tree.nodes['Background'].inputs[1].default_value=.30
        cd=bpy.data.cameras.new(P+name);cam=bpy.data.objects.new(cd.name,cd);sc.collection.objects.link(cam)
        cam.location=loc;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();cd.lens=lens;cd.clip_start=.02;sc.camera=cam
        ld=bpy.data.lights.new(P+name+' light','AREA');ld.energy=220;ld.size=2.5
        light=bpy.data.objects.new(ld.name,ld);sc.collection.objects.link(light);light.location=(2.20,6.35,4.0)
        scenes.append(sc)
    note='BENEDEN — terug naar rechte wanden, zonder nis of hoek. Volledige voorwand waskot 38,5 cm verschoven. Slaapkameropening y 5,86–6,51 m: 65 cm ruwbouw, 58 cm tussen kozijnstijlen, deurblad 55,8 cm. Diepvries en expansievat 10,5 cm verschoven; leidingen achter de toestellen gelegd. Grote kasten, wasmachine en droger onveranderd. Badkamerwand en badkamerdeur behouden, dressing open. Deurblad en beslag gecontroleerd van 0–90 graden. Dit zijn modelmaten, geen uitvoeringsadvies. Vervangt de afgewezen nisoplossing.\\n'
    (ROOT/'GROUND_STRAIGHT_DOOR_LAYOUT_NOTES.txt').write_text(note)
    txt=bpy.data.texts.get('GROUND - straight bedroom doorway') or bpy.data.texts.new('GROUND - straight bedroom doorway');txt.clear();txt.write(note)
    assumptions=bpy.data.texts.get('START HERE - model assumptions')
    if assumptions and note not in assumptions.as_string():assumptions.write('\n'+note)
    if assumptions:(ROOT/'MODEL_NOTES.txt').write_text(assumptions.as_string())
    return scenes


if __name__=='__main__':
    import sys
    main=ROOT/'Huis_Oude_Terelststraat_15.blend'
    scenes=update_ground_straight_door_layout();bpy.context.window.scene=scenes[0]
    bpy.ops.wm.save_as_mainfile(filepath=str(main))
    if '--render-preview' in sys.argv:
        bpy.ops.render.render(write_still=True,scene=scenes[0].name)
