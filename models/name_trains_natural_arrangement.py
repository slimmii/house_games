"""Articulate the existing wooden trains, preserving the toy and cabinet meshes."""
import bpy, math, json, shutil
from pathlib import Path
from mathutils import Vector, Matrix

ROOT=Path(__file__).resolve().parent
MAIN=ROOT/'Huis_Oude_Terelststraat_15.blend'
BACKUP=ROOT/'Huis_before_natural_name_train_arrangement.blend'
PREFIX='September29 / Train '

def arrange():
    if not BACKUP.exists():shutil.copy2(MAIN,BACKUP)
    before={o.name:tuple(tuple(r) for r in o.matrix_world) for o in bpy.data.objects if not o.name.startswith(PREFIX)}
    report={}
    # Distinct shallow curves with differing shelf setbacks. Angles are relative
    # to the left-to-right display axis; every wheel remains on its shelf.
    poses={
        'HANNA':(4.297,[-22,-14,-4,9,22,30],-.013,6.728),
        'LOTTE':(4.041,[24,21,14,2,-12,-22],.018,6.700),
        'LIENE':(3.625,[-34,-25,-9,8,20,26],-.005,6.765),
    }
    for word,(z,angles,across,setback) in poses.items():
        objects=[o for o in bpy.data.objects if o.name.startswith(PREFIX+word+' / ')]
        assert len(objects)>30,(word,len(objects))
        dirs=[Vector((math.cos(math.radians(a)),math.sin(math.radians(a)))) for a in angles]
        centers=[Vector((0,0))]
        for a,b in zip(dirs,dirs[1:]):
            # Chassis-end attachment points plus a 7mm articulated drawbar.
            centers.append(centers[-1]+.029*a+.029*b+.007*(a+b).normalized())
        middle=sum(centers,Vector((0,0)))/len(centers)
        centers=[v-middle+Vector((across,0)) for v in centers]
        def world(p,zz=z):return Vector((setback-p.y,3.4511-p.x,zz))
        groups=[[] for _ in range(6)];couplings=[]
        for o in objects:
            # Persist the straight reference so rerunning never accumulates drift.
            if 'straight_reference_matrix' not in o:
                o['straight_reference_matrix']=[v for row in o.matrix_world for v in row]
            values=list(o['straight_reference_matrix'])
            original=Matrix([values[i:i+4] for i in range(0,16,4)])
            o.matrix_world=original
            x=3.4511-original.translation.y
            if 'wooden coupling' in o.name:
                couplings.append((x,o));continue
            j=max(0,min(5,round((x+.150)/.060)))
            pivot=Vector((6.640,3.4511-(-.150+j*.060),z))
            transform=Matrix.Translation(world(centers[j]))@Matrix.Rotation(-math.radians(angles[j]),4,'Z')@Matrix.Translation(-pivot)
            o.matrix_world=transform@original
            o['carriage_index']=j;o['arrangement']='Articulated shallow curve, resting on shelf'
            groups[j].append(o.name)
        for j,(_,o) in enumerate(sorted(couplings,key=lambda p:p[0])):
            a=world(centers[j]+dirs[j]*.029,z+.024)
            b=world(centers[j+1]-dirs[j+1]*.029,z+.024)
            vec=b-a
            o.location=(a+b)/2;o.rotation_euler=vec.to_track_quat('Z','Y').to_euler();o.scale=(1,1,vec.length/.007)
        bpy.context.view_layer.update()
        dep=bpy.context.evaluated_depsgraph_get();pts=[]
        for o in objects:
            e=o.evaluated_get(dep);me=e.to_mesh();pts.extend(e.matrix_world@v.co for v in me.vertices);e.to_mesh_clear()
        bb=[[min(v[i] for v in pts),max(v[i] for v in pts)] for i in range(3)]
        assert bb[0][0]>6.56 and bb[0][1]<6.932,(word,bb)
        assert bb[1][0]>3.2261 and bb[1][1]<3.6761,(word,bb)
        assert abs(bb[2][0]-z)<.0001,(word,bb)
        assert len(couplings)==5 and all(groups),(word,len(couplings),groups)
        report[word]={'angles_degrees':angles,'bounds_m':bb,'all_wheels_on_shelf':True,'carriage_groups':groups}
    for name,matrix in before.items():assert tuple(tuple(r) for r in bpy.data.objects[name].matrix_world)==matrix,name
    report['unrelated_objects_unchanged']=len(before)
    report['material']='Existing unpainted wood preserved on every component'
    (ROOT/'name_trains_natural_verification.json').write_text(json.dumps(report,indent=2))
    note=bpy.data.texts.get('Name trains - natural arrangement') or bpy.data.texts.new('Name trains - natural arrangement')
    note.clear();note.write(json.dumps(report,indent=2))
    return report

if __name__=='__main__':
    scene=bpy.data.scenes['74 | CAMBER - Hedwig and wooden name trains']
    bpy.context.window.scene=scene
    report=arrange()
    scene.render.filepath=str(ROOT/'camber_hedwig_name_trains.png')
    bpy.ops.wm.save_as_mainfile(filepath=str(MAIN))
    bpy.ops.render.render(write_still=True)
    print('VERIFIED',json.dumps({k:v['angles_degrees'] for k,v in report.items() if isinstance(v,dict)}),flush=True)
