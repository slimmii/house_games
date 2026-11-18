"""White entrance doors for ground-floor laundry and bedroom, existing plan openings."""
import bpy,math
from mathutils import Vector

def update_ground_room_doors():
    col=bpy.data.collections['00 / Joinery'];part=bpy.data.collections['00 / Partitions']
    for o in list(bpy.data.objects):
        if o.name.startswith('Ground room doors /'):bpy.data.objects.remove(o,do_unlink=True)
    white=bpy.data.materials['Camber - premium white matt W1000 ST9'];chrome=bpy.data.materials['Door - brushed nickel hardware'];shadow=bpy.data.materials['Door - dark reveal and key slot'];plaster=bpy.data.materials['Warm white plaster'];brick=bpy.data.materials['Office - reference warm buff brick and dark recessed mortar']
    def door(label,origin,width,angle,depth,wallmat):
        ca,sa=math.cos(angle),math.sin(angle)
        def point(u,v,z):return Vector((origin[0]+ca*u-sa*v,origin[1]+sa*u+ca*v,z))
        def box(name,u,v,z,w,d,h,mat=white,collection=col):
            bpy.ops.mesh.primitive_cube_add(size=1,location=point(u,v,z));o=bpy.context.object;o.name='Ground room doors / '+label+' / '+name;o.dimensions=(w,d,h);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.rotation_euler.z=angle
            for c in list(o.users_collection):c.objects.unlink(o)
            collection.objects.link(o);o.data.materials.append(mat);m=o.modifiers.new('Eased painted edge','BEVEL');m.width=.002;m.segments=3;return o
        def rod(name,a,b,r):
            a=point(*a);b=point(*b);bpy.ops.mesh.primitive_cylinder_add(vertices=24,radius=r,depth=(b-a).length,location=(a+b)/2);o=bpy.context.object;o.name='Ground room doors / '+label+' / '+name;o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler()
            for c in list(o.users_collection):c.objects.unlink(o)
            col.objects.link(o);o.data.materials.append(chrome)
        box('lintel',width/2,0,2.145,width,depth,.15,wallmat,part)
        box('reveal',width/2,-.017,1.035,width,.018,2.07,shadow)
        for u in (.0225,width-.0225):box('white jamb',u,0,1.023,.045,depth+.016,2.046)
        box('white head',width/2,0,2.0475,width,depth+.016,.045)
        for v in (-depth/2-.013,depth/2+.013):
            for u in (-.009,width+.009):box('white architrave',u,v,1.039,.064,.022,2.078)
            box('white architrave head',width/2,v,2.089,width+.082,.022,.064)
        leaf=box('white flush door leaf',width/2,-.017,1.018,width-.10,.040,2.012)
        leaf['room']=label;leaf['opening_width_m']=width;leaf['reference']='Existing ground-floor plan opening; white flush leaf and silver lever hardware.'
        for z in (.22,1.02,1.81):rod('hinge',(.049,-.044,z-.029),(.049,-.044,z+.029),.008)
        for side in (-1,1):
            v=-.017+side*.023;u=width-.145
            rod('handle rose',(u,v,1.02),(u,v+side*.01,1.02),.026)
            rod('handle spindle',(u,v,1.02),(u,v+side*.05,1.02),.009)
            rod('silver lever',(u,v+side*.05,1.02),(u-.115,v+side*.05,1.026),.009)
            rod('key rose',(u,v,.86),(u,v+side*.008,.86),.018)
            box('key slot',u,v+side*.010,.86,.004,.002,.014,shadow)
        return leaf
    door('Laundry',(1.976,6.255),.800,0,.11,plaster)
    door('Bedroom',(2.875,5.50),.700,math.pi/2,.15,brick)
    name='16 | GROUND FLOOR - white room doors';sc=bpy.data.scenes.get(name) or bpy.data.scenes.new(name)
    for c in list(sc.collection.children):sc.collection.children.unlink(c)
    for o in list(sc.collection.objects):bpy.data.objects.remove(o,do_unlink=True)
    sc.collection.children.link(bpy.data.collections['00 | GROUND - 2021']);sc.collection.children.link(bpy.data.collections['01 / Slab'])
    sc.render.engine='CYCLES';sc.cycles.samples=16;sc.cycles.use_denoising=True;sc.render.resolution_x=1300;sc.render.resolution_y=1200;sc.render.resolution_percentage=80;sc.render.threads_mode='FIXED';sc.render.threads=8
    sc.world=bpy.data.worlds.new('Door preview daylight');sc.world.use_nodes=True;sc.world.node_tree.nodes['Background'].inputs[1].default_value=.25;sc.view_settings.view_transform='AgX'
    cam=bpy.data.objects.new('Ground door camera',bpy.data.cameras.new('Ground door camera'));sc.collection.objects.link(cam);cam.location=(1.98,5.04,1.57);cam.rotation_euler=(Vector((2.58,6.04,1.05))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=16;cam.data.clip_start=.025;sc.camera=cam
    ld=bpy.data.lights.new('Ground door soft light','AREA');ld.energy=65;ld.size=.9;lo=bpy.data.objects.new(ld.name,ld);sc.collection.objects.link(lo);lo.location=(2.15,5.42,2.05);lo.rotation_euler=(Vector((2.48,6.12,1.0))-lo.location).to_track_quat('-Z','Y').to_euler()
    return sc
