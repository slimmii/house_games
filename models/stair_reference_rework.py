"""Open spiral stair matching supplied photos, connected to real floor levels."""
import bpy, bmesh, math, json
from mathutils import Vector, Matrix
from pathlib import Path

ROOT=Path(__file__).resolve().parent
P='Reference spiral / '
CX,CY=1.24,4.25
R=.805
RAIL=.833
HOLE=.89
START=math.radians(28)
END=math.tau-START

def update_reference_stair():
    main=bpy.data.scenes['01 | HOUSE - exterior']
    bpy.context.window.scene=main
    for ob in list(bpy.data.objects):
        if ob.name.startswith(P) or any(c.name in ('00 / Stair','01 / Stair') for c in ob.users_collection):
            bpy.data.objects.remove(ob,do_unlink=True)
    cols=[bpy.data.collections['00 / Stair'],bpy.data.collections['01 / Stair'],bpy.data.collections['02 / Stair']]

    def material(name,hexcolor,rough=.4,metal=0):
        m=bpy.data.materials.get(P+name) or bpy.data.materials.new(P+name);m.use_nodes=True
        rgb=tuple((int(hexcolor[i:i+2],16)/255)**2.2 for i in (0,2,4))
        m.diffuse_color=(*rgb,1);p=m.node_tree.nodes.get('Principled BSDF')
        p.inputs['Base Color'].default_value=(*rgb,1);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
        return m
    steel=material('charcoal painted tubular steel','303537',.36,.48)
    treadmat=material('warm beige painted open treads','C7BEAB',.52)
    brass=material('satin aged bronze handrail','98865C',.3,.75)
    boltmat=material('flush nickel screw heads','B9B8AE',.29,.8)
    trim=material('ivory stair opening edge','E9E3D5',.52)
    wood=bpy.data.materials['Light timber living-room floor']

    def mesh(name,verts,faces,mat,col,smooth=False):
        me=bpy.data.meshes.new(P+name);me.from_pydata(verts,[],faces);me.update()
        bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free()
        ob=bpy.data.objects.new(P+name,me);col.objects.link(ob);me.materials.append(mat)
        if smooth:
            for f in me.polygons:f.use_smooth=True
        return ob
    def prism(name,xy,z0,z1,mat,col,bevel=0):
        n=len(xy);ob=mesh(name,[(x,y,z) for z in (z0,z1) for x,y in xy],
            [tuple(range(n-1,-1,-1)),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)],mat,col)
        if bevel:
            b=ob.modifiers.new('Rounded clean edges','BEVEL');b.width=bevel;b.segments=3
        return ob
    def polar(r,a,z):return (CX+r*math.cos(a),CY+r*math.sin(a),z)
    def rod(name,a,b,r,mat,col):
        a,b=Vector(a),Vector(b);axis=(b-a).normalized()
        u=axis.cross(Vector((0,1,0)))
        if u.length<.1:u=axis.cross(Vector((1,0,0)))
        u.normalize();v=axis.cross(u).normalized();n=20
        vs=[tuple(pt+r*(math.cos(t*math.tau/n)*u+math.sin(t*math.tau/n)*v)) for pt in (a,b) for t in range(n)]
        return mesh(name,vs,[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)],mat,col,True)
    def tube(name,points,r,mat,col):
        cu=bpy.data.curves.new(P+name,'CURVE');cu.dimensions='3D';cu.resolution_u=12;cu.bevel_depth=r;cu.bevel_resolution=3
        sp=cu.splines.new('POLY');sp.points.add(len(points)-1)
        for p,co in zip(sp.points,points):p.co=(*co,1)
        ob=bpy.data.objects.new(P+name,cu);col.objects.link(ob);cu.materials.append(mat);return ob
    def caprail(name,points,col):
        # Oval bronze cap following the helix, broad across its top as in the photo.
        vs=[];n=12
        for x,y,z in points:
            radial=Vector((x-CX,y-CY,0)).normalized()
            for k in range(n):
                t=k*math.tau/n
                vs.append(tuple(Vector((x,y,z))+radial*(.023*math.cos(t))+Vector((0,0,.013*math.sin(t)))))
        fs=[tuple(range(n-1,-1,-1)),tuple((len(points)-1)*n+j for j in range(n))]
        fs += [(i*n+j,i*n+(j+1)%n,(i+1)*n+(j+1)%n,(i+1)*n+j) for i in range(len(points)-1) for j in range(n)]
        return mesh(name,vs,fs,brass,col,True)
    def sector(r0,r1,a,b,steps=40):
        return [(CX+r0*math.cos(a),CY+r0*math.sin(a))]+[(CX+r1*math.cos(a+(b-a)*j/steps),CY+r1*math.sin(a+(b-a)*j/steps)) for j in range(steps+1)]+[(CX+r0*math.cos(b),CY+r0*math.sin(b))]
    def fitted_landing():
        # Match the exact 128-sided Boolean hole, edge for edge. Extending a
        # coplanar floor patch past this edge caused a black z-fighting seam.
        step=math.tau/128;a=END;b=math.tau+START
        angles=[a]+[j*step for j in range(math.ceil(a/step),math.floor(b/step)+1)]+[b]
        outer=[]
        for t in angles:
            r=HOLE*math.cos(step/2)/math.cos((t%step)-step/2)
            outer.append(polar(r,t,0)[:2])
        return [polar(.067,a,0)[:2]]+outer+[polar(.067,b,0)[:2]]

    # Correct the old hole's offset to match the measured/traced curved enclosure.
    # Rebuild only the two simple slab/finish meshes, preserving their outline,
    # finished elevation, materials and all object links to overview scenes.
    slabs=[]
    work=bpy.data.scenes.new(P+'temporary geometry workspace')
    for level in (1,2):
        for suffix in ('slab','finish'):
            ob=bpy.data.objects[f'{level} / floor {suffix}']
            coords=[ob.matrix_basis@v.co for v in ob.data.vertices]
            lo=[min(v[k] for v in coords) for k in range(3)];hi=[max(v[k] for v in coords) for k in range(3)]
            material0=ob.data.materials[0]
            replacement=bpy.data.meshes.new(ob.name+' aligned stair opening')
            replacement.from_pydata([(x,y,z) for z in (lo[2],hi[2]) for y in (lo[1],hi[1]) for x in (lo[0],hi[0])],[],[(0,2,3,1),(4,5,7,6),(0,1,5,4),(2,6,7,3),(0,4,6,2),(1,3,7,5)])
            replacement.materials.append(material0);ob.data=replacement;ob.matrix_world=Matrix.Identity(4)
            for m in list(ob.modifiers):ob.modifiers.remove(m)
            work.collection.objects.link(ob);bpy.context.window.scene=work
            bpy.ops.mesh.primitive_cylinder_add(vertices=128,radius=HOLE,depth=.6,location=(CX,CY,(lo[2]+hi[2])/2))
            cutter=bpy.context.object
            mod=ob.modifiers.new('Aligned circular stair opening','BOOLEAN');mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=cutter
            bpy.context.view_layer.objects.active=ob;bpy.ops.object.modifier_apply(modifier=mod.name)
            bpy.data.objects.remove(cutter,do_unlink=True)
            # The photographed reveal is ivory, including the visible slab edge.
            ob.data.materials.append(trim)
            for f in ob.data.polygons:
                if abs(f.normal.z)<.1 and math.hypot(f.center.x-CX,f.center.y-CY)<HOLE+.02:f.material_index=1
            slabs.append(ob)
    bpy.context.window.scene=main;bpy.data.scenes.remove(work)

    def matched_floor_wood(level):
        source=bpy.data.objects[f'{level} / floor finish']
        lo=[min(v.co[k] for v in source.data.vertices) for k in range(3)]
        hi=[max(v.co[k] for v in source.data.vertices) for k in range(3)]
        name=P+f'landing matches floor {level} timber coordinates'
        m=bpy.data.materials.get(name)
        if not m:m=wood.copy();m.name=name
        nodes=m.node_tree.nodes;links=m.node_tree.links
        coord=nodes.get('Continuous floor position') or nodes.new('ShaderNodeNewGeometry');coord.name='Continuous floor position'
        shift=nodes.get('Floor origin') or nodes.new('ShaderNodeVectorMath');shift.name='Floor origin';shift.operation='SUBTRACT';shift.inputs[1].default_value=lo
        scale=nodes.get('Floor size') or nodes.new('ShaderNodeVectorMath');scale.name='Floor size';scale.operation='MULTIPLY';scale.inputs[1].default_value=[1/max(hi[k]-lo[k],.001) for k in range(3)]
        links.new(coord.outputs['Position'],shift.inputs[0]);links.new(shift.outputs[0],scale.inputs[0])
        for tc in [n for n in nodes if n.type=='TEX_COORD']:
            for link in list(tc.outputs['Generated'].links):
                destination=link.to_socket;links.remove(link);links.new(scale.outputs[0],destination)
        return m

    records=[];treads=[]
    for flight,(z0,z1,n,col) in enumerate(((0,2.41,14,cols[0]),(2.41,5.31,16,cols[1]))):
        rise=(z1-z0)/n;da=(END-START)/(n-1)
        rod(f'{flight} central column', (CX,CY,z0),(CX,CY,z1),.067,steel,col)
        for i in range(n-1):
            a=START+i*da;b=a+da;mid=(a+b)/2;z=z0+(i+1)*rise
            # Straight outside tread edge and gently rounded corners, not a thick oak sector.
            xy=[polar(.074,a,0)[:2],polar(R,a,0)[:2],polar(R,b,0)[:2],polar(.074,b,0)[:2]]
            tread=prism(f'{flight} beige tread {i+1:02d}',xy,z-.035,z,treadmat,col,.003)
            tread['tread_top_m']=z;tread['riser_m']=rise;treads.append(tread)
            # Bent steel cradle: tube from column, under tread, then up into spindle.
            points=[polar(.067,mid,z-.08),polar(.10,mid,z-.12)]
            points += [polar(.15+.60*j/12,mid,z-.135) for j in range(13)]
            points += [polar(.75+.083*math.sin(t*math.pi/2),mid,z-.052-.083*math.cos(t*math.pi/2)) for t in [j/12 for j in range(1,13)]]
            points += [polar(RAIL,mid,z)]
            tube(f'{flight} bent tread support {i+1:02d}',points,.016,steel,col)
            railz=z0+(mid-START)/(END-START)*(z1-z0)+.95
            rod(f'{flight} outer spindle {i+1:02d}',polar(RAIL,mid,z-.052),polar(RAIL,mid,railz),.010,steel,col)
            rod(f'{flight} centre sleeve {i+1:02d}',(CX,CY,z-.07),(CX,CY,z-.033),.072,steel,col)
            for r,theta in ((.17,a+.22*da),(.17,b-.22*da),(.715,a+.20*da),(.715,b-.20*da)):
                rod(f'{flight} tread fixing {i+1:02d}',polar(r,theta,z+.0005),polar(r,theta,z+.002),.0055,boltmat,col)
        pts=[polar(RAIL,START+(END-START)*j/240,z0+(z1-z0)*j/240+.95) for j in range(241)]
        # Round vertical nose at the beginning of the handrail.
        first=Vector(pts[0]);tangent=Vector((-math.sin(START),math.cos(START),0))
        curl=[tuple(first-tangent*.035+Vector((0,0,-.12))) ,tuple(first-tangent*.035+Vector((0,0,-.035)))]
        caprail(f'{flight} continuous bronze handrail',curl+pts,col)
        # A real landing sector reaches the solid floor, exactly at its finished level.
        landingcol=cols[flight+1]
        landing=prism(f'{flight} flush landing infill',fitted_landing(),z1-.19,z1-.012,trim,landingcol)
        prism(f'{flight} landing timber finish',fitted_landing(),z1-.012,z1,matched_floor_wood(flight+1),landingcol)
        # Flat bronze guards on the two accessible sides of the circular floor edge.
        for side,a,b in [('north',START,math.pi/2),('south',3*math.pi/2,END)]:
            rr=HOLE+.012;points=[polar(rr,a+(b-a)*j/50,z1+.95) for j in range(51)]
            caprail(f'{flight} landing {side} bronze guard',points,landingcol)
            tube(f'{flight} landing {side} lower rail',[polar(rr,a+(b-a)*j/50,z1+.065) for j in range(51)],.012,steel,landingcol)
            for j in range(7):
                theta=a+(b-a)*j/6
                rod(f'{flight} landing {side} spindle {j}',polar(rr,theta,z1+.02),polar(rr,theta,z1+.95),.010,steel,landingcol)
            # Short curved continuation joins the spiral rail to the floor-edge guard.
            if side=='south':
                caprail(f'{flight} handrail landing connection',[polar(RAIL+(rr-RAIL)*j/16,END,z1+.95) for j in range(17)],landingcol)
            elif flight==0:
                caprail('upper ascent landing connection',[polar(RAIL+(rr-RAIL)*j/16,START,z1+.95) for j in range(17)],cols[1])
        # Opening trim sits just below the floor, never across the walking surface.
        tube(f'{flight} ivory opening edge',[polar(HOLE+.003,START+(END-START)*j/180,z1-.015) for j in range(181)],.012,trim,landingcol)
        records.append({'flight':flight,'start_z_m':z0,'landing_z_m':z1,'risers':n,'riser_m':rise,'individual_treads':n-1,'sweep_degrees':math.degrees(END-START),'landing_meets_floor':True})

    # At the highest landing the middle pole becomes the guard's terminal post.
    rod('upper landing terminal post',(CX,CY,5.31),(CX,CY,6.285),.067,steel,cols[2])
    radial=[polar(.067+(HOLE-.067)*j/30,START,6.26) for j in range(31)]
    caprail('upper landing radial guard bronze cap',radial,cols[2])
    tube('upper landing radial guard lower rail',[polar(.067,START,5.375),polar(HOLE,START,5.375)],.012,steel,cols[2])
    for j in range(1,8):
        r=.067+(HOLE-.067)*j/8
        rod(f'upper landing radial spindle {j}',polar(r,START,5.375),polar(r,START,6.26),.010,steel,cols[2])

    # Geometric checks: finished levels, empty stair holes and solid landing sectors.
    verification=[]
    for i,z in enumerate((2.41,5.31),1):
        ob=bpy.data.objects[f'{i} / floor finish']
        for a in (math.pi/2,math.pi,3*math.pi/2):
            assert not ob.ray_cast(Vector(polar(.60,a,z+.1)),Vector((0,0,-1)))[0], 'Stair opening is obstructed'
        assert ob.ray_cast(Vector(polar(HOLE+.04,0,z+.1)),Vector((0,0,-1)))[0], 'Floor missing outside stair opening'
        landing=bpy.data.objects[P+f'{i-1} landing timber finish']
        for r in (.10,.45,.88,.889):assert landing.ray_cast(Vector(polar(r,0,z+.1)),Vector((0,0,-1)))[0]
        assert not landing.ray_cast(Vector(polar(.891,0,z+.1)),Vector((0,0,-1)))[0], 'Landing overlaps the existing floor finish'
        assert abs(max(v.co.z for v in landing.data.vertices)-z)<1e-5
        verification.append({'floor':i,'finished_z':z,'landing_flush':True,'hole_open':True,'landing_spans_to_floor':True})
    assert len(treads)==28
    report={'center_xy_m':[CX,CY],'tread_outer_radius_m':R,'hole_radius_m':HOLE,'rail_outer_radius_m':RAIL+.023,'clearance_to_nominal_curved_wall_m':.91-(RAIL+.023),'flights':records,'connections':verification,'dimensions_from_model_and_photo_estimates':True}
    (ROOT/'stair_reference_verification.json').write_text(json.dumps(report,indent=2))

    # Share the upper guard with the existing full-height inspection scene as well.
    inspect=bpy.data.scenes.get('11 | STAIR HALL - full height brick')
    if inspect and cols[2].name not in inspect.collection.children:inspect.collection.children.link(cols[2])
    scenes=[]
    views=[(38,'TRAP - foto en aansluiting eerste verdieping',(3.22,2.55,3.85),(1.26,4.28,3.78),30),
           (39,'TRAP - bovenste overloop aansluiting',(2.51,3.83,6.78),(1.30,4.26,5.10),23),
           (40,'TRAP - beide aangesloten verdiepingen',(8,-5,8.8),(1.25,4.25,3.12),None)]
    for n,label,loc,target,lens in views:
        name=f'{n:02d} | {label}';sc=bpy.data.scenes.get(name) or bpy.data.scenes.new(name)
        for c in list(sc.collection.children):sc.collection.children.unlink(c)
        if n==40:
            sc.collection.children.link(bpy.data.collections['Full height stair hall inspection'])
            for c in cols:sc.collection.children.link(c)
            # Local sections of the real horizontal floor extents make the
            # flush connections readable in this cutaway, without whole rooms.
            section=bpy.data.collections.get(P+'sectional floor context')
            if not section:section=bpy.data.collections.new(P+'sectional floor context')
            sc.collection.children.link(section)
            for floor,z in enumerate((0,2.41,5.31)):
                if floor==0:
                    prism('section ground floor',[(.28,3.20),(2.95,3.20),(2.95,5.29),(.28,5.29)],-.19,0,wood,section)
                    continue
                count=128;vs=[]
                for zz in (z-.19,z):
                    for j in range(count):
                        a=j*math.tau/count;c,s=math.cos(a),math.sin(a)
                        limits=[(2.95-CX)/c if c>0 else (.28-CX)/c if c<0 else 1e6,
                                (5.29-CY)/s if s>0 else (3.20-CY)/s if s<0 else 1e6]
                        r=min(limits)
                        vs.extend([polar(HOLE,a,zz),polar(r,a,zz)])
                fs=[]
                for j in range(count):
                    a=2*j;b=2*((j+1)%count);off=count*2
                    fs.extend([(a,b,b+1,a+1),(a+off,a+1+off,b+1+off,b+off),
                               (a,a+off,b+off,b),(a+1,b+1,b+1+off,a+1+off)])
                ob=mesh(f'section floor {floor}',vs,fs,trim,section)
                ob.data.materials.append(matched_floor_wood(floor))
                for f in ob.data.polygons:
                    if f.normal.z>.5:f.material_index=1
        else:
            for root in ('00 | GROUND - 2021','01 | FIRST - 2021 + Camber 2025','02 | SECOND - archive reconstruction'):
                if root in bpy.data.collections:sc.collection.children.link(bpy.data.collections[root])
            sc.collection.children.link(bpy.data.collections['03 | ROOFS - removable'])
        sc.render.engine='CYCLES';sc.cycles.device='CPU';sc.cycles.samples=32;sc.cycles.use_denoising=True
        sc.render.resolution_x=1100;sc.render.resolution_y=1300;sc.render.resolution_percentage=100
        sc.render.threads_mode='FIXED';sc.render.threads=8;sc.render.image_settings.file_format='PNG'
        sc.world=bpy.data.worlds.new(P+label);sc.world.use_nodes=True
        sc.world.node_tree.nodes['Background'].inputs[0].default_value=(.65,.74,.9,1);sc.world.node_tree.nodes['Background'].inputs[1].default_value=.4
        sc.view_settings.view_transform='AgX';sc.unit_settings.system='METRIC'
        d=bpy.data.cameras.new(P+label);cam=bpy.data.objects.new(P+label,d);sc.collection.objects.link(cam);cam.location=loc
        cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();d.clip_start=.015;sc.camera=cam
        if lens:d.lens=lens
        else:d.type='ORTHO';d.ortho_scale=7.8
        for title,loc,aim,energy,size in [('skylight',(1.24,4.25,8),(1.24,4.25,3),180,1),('landing daylight',(3,2.2,4.5),(1.24,4.25,3.8),130,2),('upper bounce',(2.35,4.6,7.3),(1.24,4.25,5),85,1.3)]:
            ld=bpy.data.lights.new(P+title+str(n),'AREA');ld.energy=energy;ld.shape='DISK';ld.size=size
            ob=bpy.data.objects.new(ld.name,ld);sc.collection.objects.link(ob);ob.location=loc
            ob.rotation_euler=(Vector(aim)-ob.location).to_track_quat('-Z','Y').to_euler()
        scenes.append(sc)
    notes='''TRAP HERWERKT NAAR FOTO'S
Lichte beige open treden, donkere stalen middenkolom, gebogen buissteunen, slanke spijlen en doorlopende bronskleurige ovale leuningen. Geen kleding of losse spullen.
Bestaande verdiepingsniveaus 0,00 / 2,41 / 5,31 m. Onderste trap 14 optredes van 17,21 cm; bovenste trap 16 optredes van 18,125 cm. De laatste optrede eindigt op een volwaardig vloerhoog bordes. De bordessen sluiten zonder verticale sprong aan op de bestaande afgewerkte vloeren.
Middenas afgestemd op de afgeronde traphal (1,24 / 4,25 m). Beide oude excentrische trapgaten vervangen door gaten op diezelfde as, straal 89 cm. Treden circa 3,5 cm dik, buitenstraal 80,5 cm. Ronde kolom diameter 13,4 cm. Leuning en borstwering circa 95 cm hoog. Detailmaten en draairichting afgeleid van foto en bestaande modelgeometrie, geen nieuwe opmeting of uitvoeringsberekening.
Scenes 38–40: eerste overloop, bovenste overloop en opengewerkt overzicht. Aansluitingen, vlakke bordessen en vrije trapgaten gecontroleerd met raycasts.
Bron stair_reference_rework.py. Reservekopie Huis_before_stair_reference_rework.blend.
'''
    t=bpy.data.texts.get('TRAP - photo rework and landing connections') or bpy.data.texts.new('TRAP - photo rework and landing connections');t.clear();t.write(notes)
    (ROOT/'STAIR_REFERENCE_NOTES.txt').write_text(notes)
    print('STAIR REFERENCE VERIFIED',json.dumps(report),flush=True)
    return scenes

if __name__=='__main__':
    import shutil,sys
    main=ROOT/'Huis_Oude_Terelststraat_15.blend';backup=ROOT/'Huis_before_stair_reference_rework.blend'
    if not backup.exists():shutil.copy2(main,backup)
    scenes=update_reference_stair();bpy.context.window.scene=scenes[0]
    for screen in bpy.data.screens:
        for a in screen.areas:
            if a.type=='VIEW_3D':a.spaces.active.region_3d.view_perspective='CAMERA';a.spaces.active.shading.type='RENDERED';a.spaces.active.overlay.show_overlays=False
    bpy.ops.wm.save_as_mainfile(filepath=str(main))
    if '--no-render' not in sys.argv:
        for sc,fn in zip(scenes,['stair_reference_first_landing.png','stair_reference_upper_landing.png','stair_reference_complete.png']):
            if '--draft' in sys.argv:sc.cycles.samples=16;sc.render.resolution_percentage=65
            bpy.context.window.scene=sc;sc.render.filepath=str(ROOT/fn);bpy.ops.render.render(write_still=True,scene=sc.name)
            sc.cycles.samples=32;sc.render.resolution_percentage=100
    bpy.context.window.scene=scenes[0];bpy.ops.wm.save_as_mainfile(filepath=str(main))
