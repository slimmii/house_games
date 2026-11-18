"""Metric cylindrical brick UVs on the curved stair enclosure; aligned planar returns."""
import bpy,math,json
from mathutils import Vector,Matrix
from pathlib import Path
ROOT=Path(__file__).resolve().parent
UV='StairBrickMetres'

def update_stair_brick_mapping():
    original=bpy.data.materials['Office - reference warm buff brick and dark recessed mortar']
    name='Stair brick - metre-scale curved and planar mapping'
    material=bpy.data.materials.get(name)
    if not material:material=original.copy();material.name=name
    nodes=material.node_tree.nodes;links=material.node_tree.links
    tex=next(n for n in nodes if n.type=='TEX_BRICK')
    mapping=next((n for n in nodes if n.type=='UVMAP' and n.uv_map==UV),None) or nodes.new('ShaderNodeUVMap');mapping.uv_map=UV;mapping.label='Metres along the wall and world height'
    for link in list(tex.inputs['Vector'].links):links.remove(link)
    links.new(mapping.outputs['UV'],tex.inputs['Vector'])
    material['brick_module_m']=[.225,.063];material['mapping']='Cylindrical arc length on curved masonry; world-height courses; planar metric mapping on flat returns.'
    plan=json.loads((ROOT/'plan_geometry.json').read_text())
    circles={'upper':(1.24,4.25,.91),'slab':(1.20,4.30,.96)}
    for floor,indices in [('first',range(38,87)),('ground',range(36,84))]:
        points=set()
        for i in indices:
            for x,y in plan['floors'][floor]['wall_polygons'][i]:
                if .335<x<1.19 and 4.34<y<5.16 and abs(math.hypot(x-1.24,y-4.25)-.91)<.04:points.add((x,y))
        matrix=Matrix(((sum(x*x for x,y in points),sum(x*y for x,y in points),sum(x for x,y in points)),(sum(x*y for x,y in points),sum(y*y for x,y in points),sum(y for x,y in points)),(sum(x for x,y in points),sum(y for x,y in points),len(points))))
        rhs=Vector(tuple(-sum((x*x+y*y)*v for x,y in points for v in [x if i==0 else y if i==1 else 1]) for i in range(3)))
        a,b,c=matrix.inverted()@rhs;cx,cy=-a/2,-b/2;circles[floor]=(cx,cy,math.sqrt(cx*cx+cy*cy-c))
    records=[];ratios=[]
    prefixes=('ground / source masonry','first / source masonry','Upper correction /','Stair full height /','Stair photo /','1 / floor','2 / floor')
    for ob in bpy.data.objects:
        if ob.type!='MESH' or not ob.name.startswith(prefixes):continue
        slots=[i for i,m in enumerate(ob.data.materials) if m==original or (m and m.name.startswith(name))]
        if not slots:continue
        uv=ob.data.uv_layers.get(UV) or ob.data.uv_layers.new(name=UV)
        newslot=len(ob.data.materials);ob.data.materials.append(material)
        group='ground' if ob.name.startswith('ground /') else 'first' if ob.name.startswith('first /') else 'slab' if ob.name.startswith(('1 / floor','2 / floor')) else 'upper'
        cx,cy,r=circles[group];curved=0;flat=0
        for face in ob.data.polygons:
            if face.material_index not in slots:continue
            normal=(ob.matrix_world.to_3x3().inverted().transposed()@face.normal).normalized()
            if abs(normal.z)>.15:continue
            points=[ob.matrix_world@ob.data.vertices[ob.data.loops[li].vertex_index].co for li in face.loop_indices]
            center=sum(points,Vector())/len(points)
            if center.x>3.12 or not (3.30<center.y<6.51):continue
            radial=Vector((center.x-cx,center.y-cy,0));radial.normalize()
            cylindrical=all(abs(math.hypot(p.x-cx,p.y-cy)-r)<.035 for p in points) and normal.dot(radial)<-.90
            angles=[math.atan2(p.y-cy,p.x-cx)%(2*math.pi) for p in points]
            if max(angles)-min(angles)>math.pi:angles=[a+2*math.pi if a<math.pi else a for a in angles]
            coords=[]
            for point,angle in zip(points,angles):
                u=r*(angle-math.pi/2) if cylindrical else (point.y if abs(normal.x)>=abs(normal.y) else point.x)
                coords.append((u,point.z))
            for li,coord in zip(face.loop_indices,coords):uv.data[li].uv=coord
            face.material_index=newslot
            if cylindrical:
                curved+=1
                for i,a in enumerate(points):
                    b=points[(i+1)%len(points)];dist=math.hypot(a.x-b.x,a.y-b.y)
                    if dist>.005:ratios.append(abs(coords[i][0]-coords[(i+1)%len(coords)][0])/dist)
            else:flat+=1
        if curved or flat:records.append({'object':ob.name,'curved_faces':curved,'planar_faces':flat})
    assert sum(r['curved_faces'] for r in records)>50
    # Survey-derived polygon outlines deviate slightly from their fitted circle; allow 5% metric variation.
    assert min(ratios)>.95 and max(ratios)<1.05,(min(ratios),max(ratios))
    report={'cylindrical_faces':sum(r['curved_faces'] for r in records),'planar_return_faces':sum(r['planar_faces'] for r in records),'brick_module_m':[.225,.063],'horizontal_uv_to_wall_edge_ratio_range':[min(ratios),max(ratios)],'fitted_stair_circles':circles,'objects':records}
    (ROOT/'stair_brick_mapping_verification.json').write_text(json.dumps(report,indent=2))
    notes='''TRAPHAL — correctie baksteenprojectie.
Het oorspronkelijke materiaal projecteerde alle stenen via de wereld-Y-as. Daardoor werden stenen breder wanneer de gebogen muur parallel aan die richting kwam te liggen. Dit was ook zichtbaar in echte renders.
De gebogen binnenvlakken gebruiken nu UV-coördinaten in meters langs de omtrek van de muur. De verticale coördinaat blijft de wereldhoogte, zodat de voegen horizontaal en op dezelfde hoogte doorlopen. Vlakke aansluitingen gebruiken hun eigen juiste horizontale richting.
Bestaande materiaalmodule behouden: 22,5 cm breed en 6,3 cm per rij, inclusief voegindeling. Dit zijn modelwaarden, geen nieuwe opmeting van de stenen. De textuurschaal is op alle behandelde gebogen randen geometrisch gecontroleerd.
De correctie geldt voor de gebogen gemetselde delen over de drie verdiepingen en de ronde trapgatranden. Baksteenkleuren blijven behouden. De koepel- en traphalrenders zijn opnieuw gemaakt.
Bron: stair_brick_mapping.py. Reservekopie: Huis_before_stair_brick_mapping.blend.
'''
    txt=bpy.data.texts.get('TRAPHAL - brick mapping correction') or bpy.data.texts.new('TRAPHAL - brick mapping correction');txt.clear();txt.write(notes);(ROOT/'STAIR_BRICK_MAPPING_NOTES.txt').write_text(notes)
    print('STAIR MAPPING VERIFIED',report['cylindrical_faces'],'curved faces;',report['horizontal_uv_to_wall_edge_ratio_range'],flush=True)
    return material

if __name__=='__main__':
    import shutil
    main=ROOT/'Huis_Oude_Terelststraat_15.blend';backup=ROOT/'Huis_before_stair_brick_mapping.blend'
    if not backup.exists():shutil.copy2(main,backup)
    update_stair_brick_mapping()
    start=bpy.data.texts['START HERE - model assumptions'];start.clear();start.write((ROOT/'MODEL_NOTES.txt').read_text())
    for name,filename in [('32 | TRAPHAL - looking up at roof dome','stair_roof_dome_inside.png'),('11 | STAIR HALL - full height brick','stair_full_height.png')]:
        sc=bpy.data.scenes[name];bpy.context.window.scene=sc;sc.cycles.samples=12;sc.cycles.use_denoising=True;sc.render.resolution_percentage=60;sc.render.threads_mode='FIXED';sc.render.threads=8;sc.render.filepath=str(ROOT/filename)
        bpy.ops.render.render(write_still=True,scene=sc.name);sc.cycles.samples=32;sc.render.resolution_percentage=100
    bpy.context.window.scene=bpy.data.scenes['32 | TRAPHAL - looking up at roof dome'];bpy.ops.wm.save_as_mainfile(filepath=str(main))
