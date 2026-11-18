"""Coffee table revised from seventeen reference photographs."""
import bpy, json, math, shutil, sys
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parent
P='Living / coffee table reference / '
TABLE_SIZE=(.90,.90,.33)  # Width/depth estimated; height measured by user.
GAP=.35

def bounds(objects):
    vs=[o.matrix_world@Vector(v) for o in objects if o.type=='MESH' for v in o.bound_box]
    return [[min(v[i] for v in vs),max(v[i] for v in vs)] for i in range(3)]

def update_living_coffee_table():
    F=2.41;col=bpy.data.collections['01 / Furniture']
    for ob in list(bpy.data.objects):
        if ob.name.startswith(P):bpy.data.objects.remove(ob,do_unlink=True)
    def rgb(h):return tuple((int(h[i:i+2],16)/255)**2.2 for i in (0,2,4))+(1,)
    def material(name,h,rough):
        m=bpy.data.materials.get(name) or bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=rgb(h)
        p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=rgb(h);p.inputs['Roughness'].default_value=rough
        return m
    white=material('Living coffee table - satin white','ECECE7',.57)
    oak=material('Living coffee table - light oak look','BCA487',.66)
    n=oak.node_tree.nodes;l=oak.node_tree.links
    for nd in list(n):
        if nd.type not in ('BSDF_PRINCIPLED','OUTPUT_MATERIAL'):n.remove(nd)
    tc=n.new('ShaderNodeTexCoord');mul=n.new('ShaderNodeVectorMath');mul.operation='MULTIPLY';mul.inputs[1].default_value=(1.7,32,4)
    noise=n.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=3;noise.inputs['Detail'].default_value=3
    ramp=n.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].position=.18;ramp.color_ramp.elements[0].color=rgb('958068');ramp.color_ramp.elements[1].position=.82;ramp.color_ramp.elements[1].color=rgb('CBB69A')
    l.new(tc.outputs['Object'],mul.inputs[0]);l.new(mul.outputs[0],noise.inputs['Vector']);l.new(noise.outputs['Fac'],ramp.inputs[0]);l.new(ramp.outputs[0],n.get('Principled BSDF').inputs['Base Color'])
    bump=n.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.18;bump.inputs['Distance'].default_value=.0004;l.new(noise.outputs['Fac'],bump.inputs['Height']);l.new(bump.outputs[0],n.get('Principled BSDF').inputs['Normal'])
    sofa=bounds([o for o in bpy.data.objects if o.name.startswith('Measured sofa /')])
    root=bpy.data.objects.new(P+'square table - approx 90 x 90 cm - confirmed height 33 cm',None);col.objects.link(root)
    root.location=(sofa[0][0]+1.0+GAP+TABLE_SIZE[0]/2,sofa[1][1]-1.0-GAP-TABLE_SIZE[1]/2,F)
    root.scale.z=TABLE_SIZE[2]/.45
    root['estimated_dimensions_m']=TABLE_SIZE;root['placement_gap_m']=GAP
    root['height_user_m']=.33
    root['measurement_status']='User measured height 33 cm; 90 x 90 cm width/depth estimated from photos; 35 cm gap is a placement choice'
    def box(name,loc,size,mat,bevel=.0015):
        bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=P+name;o.dimensions=size
        bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
        for c in list(o.users_collection):c.objects.unlink(o)
        col.objects.link(o);o.parent=root;o.data.materials.append(mat)
        if bevel:
            md=o.modifiers.new('Small furniture edge radius','BEVEL');md.width=bevel;md.segments=3;o.modifiers.new('Corner normals','WEIGHTED_NORMAL')
        return o
    # Flat continuous top and bottom; photo evidence does not show a lift mechanism.
    box('continuous oak top',(0,0,.439),(.90,.90,.022),oak)
    box('continuous oak bottom',(0,0,.151),(.90,.90,.022),oak)
    for y in (-.432,.432):box('plain white side panel',(0,y,.295),(.872,.018,.266),white)
    box('white central divider',(0,0,.295),(.866,.018,.266),white)
    box('open compartment oak back',(-.427,.219,.295),(.018,.42,.266),oak)
    box('drawer box floor',(-.01,-.219,.187),(.81,.393,.012),oak)
    box('drawer box back',(-.407,-.219,.292),(.012,.393,.21),oak)
    for y in (-.407,-.03):box('drawer box side',(-.01,y,.292),(.81,.012,.21),oak)
    box('closed white drawer front',(.432,-.218,.295),(.019,.412,.258),white,.002)
    for y in (-.29,-.15):box('handle mounting block',(.451,y,.31),(.022,.024,.022),oak)
    box('horizontal oak drawer pull',(.467,-.22,.31),(.018,.19,.025),oak,.002)
    box('opposite white end',(-.432,-.218,.295),(.019,.412,.266),white)
    for sx in (-1,1):
        for sy in (-1,1):
            top=Vector((sx*.365,sy*.365,.141));bottom=Vector((sx*.386,sy*.386,0))
            verts=[(c.x+dx*w/2,c.y+dy*w/2,c.z) for c,w in ((bottom,.042),(top,.062)) for dx,dy in ((-1,-1),(1,-1),(1,1),(-1,1))]
            me=bpy.data.meshes.new(P+'tapered leg');me.from_pydata(verts,[],[(3,2,1,0),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]);me.materials.append(oak);me.update()
            ob=bpy.data.objects.new(P+'splayed oak leg',me);col.objects.link(ob);ob.parent=root
            md=ob.modifiers.new('Leg edge radius','BEVEL');md.width=.002;md.segments=2;ob.modifiers.new('Leg normals','WEIGHTED_NORMAL')
    bpy.context.view_layer.update();table=bounds(root.children)
    assert abs(table[2][1]-table[2][0]-.33)<1e-5, table[2]
    gap_x=table[0][0]-(sofa[0][0]+1.0);gap_y=sofa[1][1]-1.0-table[1][1]
    assert abs(gap_x-GAP)<1e-4 and abs(gap_y-GAP)<1e-4,(gap_x,gap_y)
    tv=bounds([o for o in bpy.data.objects if o.name.startswith('Camber drawing / C low white front')])
    sofa_root=next(o for o in bpy.data.objects if o.name.startswith('Measured sofa /') and o.type=='EMPTY')
    window_y=sofa_root['window_inner_frame_y_m']
    report={'reference':'17 user photos and corrected measurements, 2026-09-27','table_body_m':TABLE_SIZE,'table_user_height_m':.33,'verified_table_height_m':table[2][1]-F,'estimated_table_width_depth_m':TABLE_SIZE[:2],'table_bounds_including_handle_m':table,'sofa_bounds_m':sofa,'clearance_to_sofa_m':{'long_front':gap_x,'return_front':gap_y},'sofa_footprint_m':[sofa[0][1]-sofa[0][0],sofa[1][1]-sofa[1][0]],'sofa_height_m':sofa[2][1]-F,'sofa_to_tv_m':tv[0][0]-sofa[0][1],'sofa_to_window_m':sofa[1][0]-window_y,'window_reference_y_m':window_y,'dimension_status':'User: sofa 265 x 235 cm, window gap 64 cm, TV gap 83 cm, table height 33 cm. Table width/depth and sofa height estimated; table gap is a placement choice'}
    (ROOT/'living_coffee_table_verification.json').write_text(json.dumps(report,indent=2))
    source=bpy.data.scenes['04 | LIVING - Camber perspective']
    def make_scene(name,loc,target,lens=48,ortho=None):
        old=bpy.data.scenes.get(name)
        if old:bpy.data.scenes.remove(old)
        sc=source.copy();sc.name=name;sc.use_fake_user=True
        cam=bpy.data.objects.new(P+name,bpy.data.cameras.new(P+name));sc.collection.objects.link(cam);cam.location=loc;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=lens;sc.camera=cam
        if ortho:cam.data.type='ORTHO';cam.data.ortho_scale=ortho
        sc.render.resolution_x=1600;sc.render.resolution_y=1200;sc.render.resolution_percentage=100
        sc.render.engine='CYCLES';sc.cycles.samples=32;sc.cycles.use_denoising=True;sc.cycles.device='CPU';sc.render.threads_mode='FIXED';sc.render.threads=8
        return sc
    scene=make_scene('54 | LIVING - photo coffee table',(7.12,-1.78,5.18),(4.51,1.57,2.91),48)
    plan=make_scene('55 | LIVING - sofa and table clearances',(4.7,1.8,11),(4.7,1.8,F),ortho=5.25)
    anno=bpy.data.collections.get('Living table and sofa dimensions')
    if anno:
        for o in list(anno.objects):bpy.data.objects.remove(o,do_unlink=True)
        bpy.data.collections.remove(anno)
    anno=bpy.data.collections.new('Living table and sofa dimensions');plan.collection.children.link(anno)
    ink=material('Living plan dark ink','153E45',.8);z=F+1.32
    def line(a,b):
        cu=bpy.data.curves.new('Dimension','CURVE');cu.dimensions='3D';cu.bevel_depth=.004
        sp=cu.splines.new('POLY');sp.points.add(1);sp.points[0].co=(*a,z,1);sp.points[1].co=(*b,z,1)
        ob=bpy.data.objects.new('Dimension',cu);anno.objects.link(ob);cu.materials.append(ink)
    def label(text,x,y,size=.095,rotation=0):
        cu=bpy.data.curves.new(text,'FONT');cu.body=text;cu.size=size;cu.align_x='CENTER'
        ob=bpy.data.objects.new(text,cu);anno.objects.link(ob);ob.location=(x,y,z+.01);ob.rotation_euler.z=rotation;cu.materials.append(ink)
    def dim(a,b,text,offset=(0,.055),rotation=0):
        line(a,b)
        for p in (a,b):
            d=(.035,0) if a[0]==b[0] else (0,.035)
            line((p[0]-d[0],p[1]-d[1]),(p[0]+d[0],p[1]+d[1]))
        label(text,(a[0]+b[0])/2+offset[0],(a[1]+b[1])/2+offset[1],rotation=rotation)
    sx,sy=sofa[0],sofa[1]
    dim((sx[0],sy[1]+.17),(sx[1],sy[1]+.17),'265 cm')
    dim((sx[0]-.20,sy[0]),(sx[0]-.20,sy[1]),'235 cm',(-.07,0),math.pi/2)
    dim((sx[0]+1.0,1.09),(table[0][0],1.09),'35 cm',(0,-.15))
    dim((4.97,table[1][1]),(4.97,sy[1]-1.0),'35 cm',(.18,0))
    dim((sx[1],2.25),(tv[0][0],2.25),'83 cm')
    dim((sx[0]+.32,window_y),(sx[0]+.32,sy[0]),'64 cm',(.20,0))
    line((sx[0],window_y),(sx[1],window_y));label('binnenzijde raamkader',4.48,window_y+.06,.077)
    label('Tafel ca. 90 x 90 cm',root.location.x,root.location.y-.02,.075)
    label('hoogte 33 cm',root.location.x,root.location.y-.15,.075)
    label('Tafelmaten geschat - tussenruimte gekozen',4.73,-.10,.077)
    notes='''LIVING — SALONTAFEL EN ZETEL HERZIEN NA 17 FOTO'S
Tafel: doorlopend vlak eiklook blad en onderplaat, vier licht schuine taps toelopende houten poten, witte zijpanelen, open vak naast gesloten lade met horizontale houten greep. De eerdere interpretatie als heftafel met lager zijplateau is vervallen.
Tafelhoogte door gebruiker bevestigd: 33 cm vanaf de vloer. Breedte en diepte voorlopig geschat op 90 x 90 cm; greep steekt ca. 2,6 cm uit. Vrije afstand tot beide binnenzijden van de L-zetel gekozen op 35 cm.
Zetel: gecorrigeerde gebruikersmaten 265 x 235 cm vervangen 250 x 227 cm. De vrije afstand tot het voorvlak van het tv-meubel is 83 cm, tot de binnenzijde van het raamkader 64 cm. Geschatte diepte 100 cm. Zithoogte 45 cm, rughoogte 98 cm, brede armleuningen, verbonden zitvlakken, dubbele stiknaden en lage metalen voeten volgen de referentiefoto's.
Vorige zetel was 121,5 cm hoog met zithoogte 58,5 cm; de vorige tafelhoek stond slechts 13,1 cm van de zetel. Die aannames zijn gecorrigeerd. Maatvoering in scene 55 maakt het verschil controleerbaar zonder perspectiefvertekening.
Scenes 54 (perspectief), 55 (bovenaanzicht). Bronnen: living_coffee_table.py en sofa_measured.py. Backup: Huis_before_living_seating_refinement.blend.
'''
    (ROOT/'LIVING_COFFEE_TABLE_NOTES.txt').write_text(notes)
    tx=bpy.data.texts.get('LIVING - photo coffee table notes') or bpy.data.texts.new('LIVING - photo coffee table notes');tx.clear();tx.write(notes)
    print('LIVING REFINED:',json.dumps(report),flush=True)
    return scene

if __name__=='__main__':
    main=ROOT/'Huis_Oude_Terelststraat_15.blend';backup=ROOT/'Huis_before_living_seating_refinement.blend'
    if not backup.exists():shutil.copy2(main,backup)
    sys.path.insert(0,str(ROOT))
    from sofa_measured import update_measured_sofa
    update_measured_sofa()
    if not bpy.data.scenes.get('53 | LIVING - Botanical Green TV wall'):
        from living_botanical_green import update_living_botanical_green
        update_living_botanical_green()
    scene=update_living_coffee_table();bpy.context.window.scene=scene
    start=bpy.data.texts.get('START HERE - model assumptions')
    if start:start.clear();start.write((ROOT/'MODEL_NOTES.txt').read_text())
    bpy.ops.wm.save_as_mainfile(filepath=str(main))
    views=[(scene,'living_coffee_table.png'),(bpy.data.scenes['55 | LIVING - sofa and table clearances'],'living_seating_plan.png'),(bpy.data.scenes['10 | SOFA - measured layout'],'sofa_measured_plan.png'),(bpy.data.scenes['53 | LIVING - Botanical Green TV wall'],'living_botanical_green.png')]
    for sc,name in views:
        sc.render.resolution_percentage=75;sc.cycles.samples=16;sc.cycles.max_bounces=6;sc.cycles.use_denoising=True;sc.render.filepath=str(ROOT/name)
        bpy.ops.render.render(write_still=True,scene=sc.name)
        sc.render.resolution_percentage=100;sc.cycles.samples=32
    bpy.context.window.scene=scene;bpy.ops.wm.save_as_mainfile(filepath=str(main))
