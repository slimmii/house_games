"""Continue reference brick finish around first-floor stair and add flush cream door."""
import bpy, math
from mathutils import Vector

def update_stair_door():
    F=2.41
    brick=bpy.data.materials['Office - reference warm buff brick and dark recessed mortar']
    # X+Y gives identical horizontal course scale on perpendicular wall faces.
    n=brick.node_tree.nodes;l=brick.node_tree.links
    sep=next(n0 for n0 in n if n0.type=='SEPXYZ');vec=next(n0 for n0 in n if n0.type=='COMBXYZ')
    horizontal=n.get('Brick around corner') or n.new('ShaderNodeMath');horizontal.name='Brick around corner';horizontal.operation='ADD'
    l.new(sep.outputs['X'],horizontal.inputs[0]);l.new(sep.outputs['Y'],horizontal.inputs[1]);l.new(horizontal.outputs[0],vec.inputs['X'])
    for ob in list(bpy.data.objects):
        if ob.name.startswith('Stair photo /'):bpy.data.objects.remove(ob,do_unlink=True)
    # Existing traced wall includes the rounded stair return and the door opening.
    for i in range(38,87):
        ob=bpy.data.objects.get('first / source masonry %03d'%i)
        if not ob:continue
        idx=len(ob.data.materials);ob.data.materials.append(brick)
        for face in ob.data.polygons:
            if face.normal.y<-.05 or face.normal.x>.05:face.material_index=idx
    def material(name,color,metal=0):
        m=bpy.data.materials.get(name) or bpy.data.materials.new(name);m.use_nodes=True
        c=tuple((v/255)**2.2 for v in color)+(1,);m.diffuse_color=c
        p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=c;p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=.33 if metal else .52
        return m
    cream=material('Door - warm ivory painted timber',(225,215,193))
    chrome=material('Door - brushed nickel hardware',(172,176,177),.8)
    shadow=material('Door - dark reveal and key slot',(45,42,36))
    partition=bpy.data.collections['01 / Partitions'];joinery=bpy.data.collections['01 / Joinery']
    def box(name,loc,size,mat=cream,col=joinery,bevel=.002):
        bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name='Stair photo / '+name;o.dimensions=size
        bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
        for c in list(o.users_collection):c.objects.unlink(o)
        col.objects.link(o);o.data.materials.append(mat)
        if bevel:
            m=o.modifiers.new('Soft painted edges','BEVEL');m.width=bevel;m.segments=3;o.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
        return o
    def rod(name,a,b,r,mat=chrome):
        a,b=Vector(a),Vector(b);bpy.ops.mesh.primitive_cylinder_add(vertices=32,radius=r,depth=(b-a).length,location=(a+b)/2)
        o=bpy.context.object;o.name='Stair photo / '+name;o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler()
        for c in list(o.users_collection):c.objects.unlink(o)
        joinery.objects.link(o);o.data.materials.append(mat)
        m=o.modifiers.new('Machined edge','BEVEL');m.width=.0015;m.segments=2
        return o
    # Door opening comes from plan: x 1.945–2.745 m. Height is estimated from photograph.
    box('brick lintel above door',(2.345,5.23,F+2.365),(.80,.14,.59),brick,partition,0)
    box('dark door reveal',(2.345,5.245,F+1.035),(.80,.035,2.07),shadow)
    for x in [1.9675,2.7225]:box('frame jamb',(x,5.23,F+1.0125),(.045,.17,2.025))
    box('frame head',(2.345,5.23,F+2.0475),(.80,.17,.045))
    for y in [5.13,5.33]:
        for x in [1.948,2.742]:box('flat architrave upright',(x,y,F+1.025),(.062,.024,2.05))
        box('flat architrave head',(2.345,y,F+2.081),(.856,.024,.062))
    leaf=box('plain flush ivory door leaf',(2.345,5.205,F+1.015),(.706,.040,2.008))
    leaf['reference']='User stair photograph: flush cream door, rectangular casing, left hinges, silver lever and key escutcheon'
    leaf['dimensions_status']='Opening width traced from plan; height and hardware dimensions estimated'
    for z in [.22,1.02,1.82]:rod('left hinge',(1.985,5.177,F+z-.027),(1.985,5.177,F+z+.027),.008)
    for y,sign in [(5.177,-1),(5.233,1)]:
        rod('round handle rose',(2.63,y,F+1.01),(2.63,y+sign*.009,F+1.01),.027)
        rod('handle spindle',(2.63,y,F+1.01),(2.63,y+sign*.054,F+1.01),.009)
        rod('silver lever',(2.63,y+sign*.054,F+1.01),(2.505,y+sign*.064,F+1.028),.009)
        rod('round key escutcheon',(2.63,y,F+.855),(2.63,y+sign*.008,F+.855),.019)
        box('key slot',(2.63,y+sign*.010,F+.855),(.005,.003,.016),shadow)
    # Wall switch visible beside the door in the reference.
    box('white switch plate',(2.865,5.138,F+.97),(.135,.018,.078),bpy.data.materials['Camber - premium white matt W1000 ST9'])
    for x in [2.825,2.865,2.905]:box('switch rocker',(x,5.126,F+.97),(.035,.009,.055),bpy.data.materials['Camber - premium white matt W1000 ST9'])
    sc=bpy.data.scenes.get('09 | STAIR - brick return and cream door')
    if not sc:
        sc=bpy.data.scenes['04 | LIVING - Camber perspective'].copy();sc.name='09 | STAIR - brick return and cream door'
    sc.use_fake_user=True
    if '01 / Furniture' in sc.collection.children:sc.collection.children.unlink(bpy.data.collections['01 / Furniture'])
    if '01 / Stair' not in sc.collection.children:sc.collection.children.link(bpy.data.collections['01 / Stair'])
    cam=bpy.data.objects.new('Stair detail camera',bpy.data.cameras.new('Stair detail camera'));sc.collection.objects.link(cam)
    cam.location=(4.20,2.72,F+1.85);cam.rotation_euler=(Vector((1.65,5.0,F+1.13))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=26;sc.camera=cam
    sc.render.resolution_x=1600;sc.render.resolution_y=1400;sc.render.resolution_percentage=100
    return sc
