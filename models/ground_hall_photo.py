"""Ground-floor hallway joinery, artwork and tile finish from user photographs."""
import bpy,math
from pathlib import Path
from mathutils import Vector

def update_ground_hall():
    root=bpy.data.collections['00 | GROUND - 2021']
    old=bpy.data.collections.get('00 / Hall photo joinery')
    if old:
        for o in list(old.objects):bpy.data.objects.remove(o,do_unlink=True)
        bpy.data.collections.remove(old)
    col=bpy.data.collections.new('00 / Hall photo joinery');root.children.link(col)
    exploded=bpy.data.collections.get('EXPLODED source 0 - cutaway')
    if exploded:exploded.children.link(col)
    def rgb(h):return tuple((int(h[i:i+2],16)/255)**2.2 for i in (0,2,4))+(1,)
    def material(name,color,rough=.5,metal=0):
        m=bpy.data.materials.get(name) or bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=rgb(color)
        p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=rgb(color);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal;return m
    white=bpy.data.materials['Camber - premium white matt W1000 ST9'];brick=bpy.data.materials['Office - reference warm buff brick and dark recessed mortar']
    oak=bpy.data.materials['Camber - natural Casella oak H1385 ST40'];gold=material('Hall photo - satin brass','B89C60',.3,.7)
    wicker=material('Hall photo - warm white wicker','E8E3D7',.65);dark=material('Hall photo - basket interior shadow','3C3832',.9)
    def meshboxes(name,boxes,mat):
        verts=[];faces=[]
        for x0,x1,y0,y1,z0,z1 in boxes:
            off=len(verts);verts += [(x,y,z) for z in (z0,z1) for y in (y0,y1) for x in (x0,x1)]
            faces += [tuple(off+i for i in f) for f in [(0,2,3,1),(4,5,7,6),(0,1,5,4),(2,6,7,3),(0,4,6,2),(1,3,7,5)]]
        me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update();o=bpy.data.objects.new(name,me);col.objects.link(o);me.materials.append(mat);return o
    def box(name,x0,x1,y0,y1,z0,z1,mat=white,bevel=.002):
        o=meshboxes('Hall photo / '+name,[(x0,x1,y0,y1,z0,z1)],mat)
        if bevel:m=o.modifiers.new('Soft edges','BEVEL');m.width=bevel;m.segments=2
        return o
    def cylinder(name,x,y,z,r,h,mat):
        bpy.ops.mesh.primitive_cylinder_add(vertices=32,radius=r,depth=h,location=(x,y,z));o=bpy.context.object;o.name='Hall photo / '+name
        for c in list(o.users_collection):c.objects.unlink(o)
        col.objects.link(o);o.data.materials.append(mat);return o
    box('continuous reference brick side wall',.331,.345,.54,4.27,0,2.22,brick,0)
    # Two tall plain cupboard doors, open display niche, narrow end cupboard.
    box('continuous white plinth',.35,.735,.57,3.43,.015,.10)
    box('left full height carcass',.35,.72,.57,1.63,.10,2.18)
    for i in range(2):box('tall door %d'%i,.725,.745,.575+i*.525,1.094+i*.525,.105,2.175)
    for y in (1.64,3.095,3.415):box('vertical divider',.35,.75,y,y+.022,.10,2.18)
    box('narrow tower body',.35,.72,3.12,3.415,.10,1.88)
    box('narrow tower door',.725,.749,3.124,3.410,.105,1.865)
    box('narrow open top shelf',.35,.745,3.12,3.415,1.88,1.902)
    box('top fascia',.35,.75,.57,3.437,2.15,2.205)
    # Eight cubbies with all wicker baskets neatly pushed in.
    for z in (.10,.438,.785):box('basket horizontal shelf',.35,.746,1.66,3.095,z,z+.022)
    for i in range(5):
        y=1.66+i*.35875;box('basket divider',.35,.744,y,y+.021,.10,.81)
    box('oak niche worktop',.345,.775,1.65,3.115,.81,.845,oak)
    box('upper niche shelf',.35,.75,1.66,3.095,1.945,1.971)
    def basket(name,y,z,w=.324,h=.294,front=.736):
        back=front-.33
        box(name+' interior bottom',back,front-.015,y,y+w,z,z+.012,wicker,.003)
        box(name+' back',back,back+.012,y,y+w,z,z+h,wicker,.003)
        box(name+' left side',back,front,y,y+.012,z,z+h,wicker)
        box(name+' right side',back,front,y+w-.012,y+w,z,z+h,wicker)
        strips=[]
        for j in range(27):
            yy=y+.008+j*(w-.016)/26;strips.append((front,front+.006,yy,yy+.003,z+.006,z+h-.006))
        for j in range(32):
            zz=z+.008+j*(h-.016)/31;strips.append((front+.004,front+.009,y+.007,y+w-.007,zz,zz+.0035))
        for yy in (y,y+w-.009):strips.append((front,front+.012,yy,yy+.009,z,z+h))
        for zz in (z,z+h-.010):strips.append((front,front+.012,y,y+w,zz,zz+.010))
        meshboxes('Hall photo / '+name+' wicker weave',strips,wicker)
        box(name+' recessed handhold',front+.010,front+.012,y+w*.37,y+w*.63,z+h-.046,z+h-.02,dark,.004)
    for row in range(2):
        for i in range(4):basket('basket %d-%d'%(row,i),1.687+i*.359,.127+row*.344,front=.737)
    for i in range(3):basket('top storage basket %d'%i,1.94+i*.377,1.98,.355,.162,.705)
    # Small storage bench between tall cabinet and spiral stair.
    box('stair shoe unit',.35,.69,3.49,4.12,.10,.45)
    box('stair shoe unit oak top',.34,.72,3.48,4.13,.45,.476,oak)
    for y in (3.50,3.80):
        for z in (.13,.28):box('shoe unit drawer',.694,.711,y,y+.289,z,z+.139)
    # Gold frame with the actual supplied artwork mapped directly from the photo.
    cy=2.38;cz=1.425;w=.43;h=.48
    box('picture back',.347,.376,cy-w/2,cy+w/2,cz-h/2,cz+h/2,white)
    for y in (cy-w/2,cy+w/2-.017):box('picture gilt vertical',.377,.397,y,y+.017,cz-h/2,cz+h/2,gold,.003)
    for z in (cz-h/2,cz+h/2-.017):box('picture gilt horizontal',.377,.397,cy-w/2,cy+w/2,z,z+.017,gold,.003)
    photo_path='/Users/slimmii/Downloads/Photos-1-001 (1)/20260924_144222.jpg'
    pic=material('Hall photo - supplied framed artwork','EEE8D9',.85);n=pic.node_tree.nodes;l=pic.node_tree.links
    tex=n.get('Reference artwork') or n.new('ShaderNodeTexImage');tex.name='Reference artwork'
    img=bpy.data.images.load(photo_path,check_existing=True);img.pack();tex.image=img;l.new(tex.outputs['Color'],n.get('Principled BSDF').inputs['Base Color'])
    verts=[(.398,cy-w/2+.019,cz-h/2+.019),(.398,cy+w/2-.019,cz-h/2+.019),(.398,cy+w/2-.019,cz+h/2-.019),(.398,cy-w/2+.019,cz+h/2-.019)]
    me=bpy.data.meshes.new('Hall artwork plane');me.from_pydata(verts,[],[(0,1,2,3)]);me.materials.append(pic);uv=me.uv_layers.new()
    # In this view increasing Y reads left to right; four corners rectify the photographed mat.
    coords=[(1057/2048,1-409/944),(1191/2048,1-414/944),(1191/2048,1-296/944),(1059/2048,1-289/944)]
    for i,p in enumerate(coords):uv.data[i].uv=p
    o=bpy.data.objects.new('Hall photo / framed artwork from user image',me);col.objects.link(o)
    # Three warm brass downlights under the shelf.
    emiss=material('Hall photo - warm lamp diffuser','FFF1C6');bs=emiss.node_tree.nodes.get('Principled BSDF');bs.inputs['Emission Color'].default_value=rgb('FFD18A');bs.inputs['Emission Strength'].default_value=3
    box('picture light wall bracket',.35,.40,cy-.022,cy+.022,1.68,1.915,gold)
    for i in range(3):
        y=cy+(i-1)*.135;cylinder('brass picture lamp',.53,y,1.916,.064,.025,gold);cylinder('lamp diffuser',.53,y,1.901,.057,.007,emiss)
        ld=bpy.data.lights.new('Hall warm picture light','AREA');ld.energy=5;ld.color=(1,.60,.26);ld.shape='DISK';ld.size=.12
        lo=bpy.data.objects.new(ld.name,ld);col.objects.link(lo);lo.location=(.53,y,1.889);lo.rotation_euler=(Vector((.355,y,1.25))-lo.location).to_track_quat('-Z','Y').to_euler()
    # Charcoal square stone tiles with mottled pale mineral markings and fine grout.
    floor=material('Hall photo - charcoal mottled stone tiles 40cm','49484A',.52)
    n=floor.node_tree.nodes;l=floor.node_tree.links;p=n.get('Principled BSDF');g=n.new('ShaderNodeNewGeometry')
    noise=n.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=9;noise.inputs['Detail'].default_value=5;noise.inputs['Roughness'].default_value=.75;l.new(g.outputs['Position'],noise.inputs['Vector'])
    ramp=n.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].position=.22;ramp.color_ramp.elements[0].color=rgb('25262A');ramp.color_ramp.elements[1].position=.8;ramp.color_ramp.elements[1].color=rgb('777574');l.new(noise.outputs['Fac'],ramp.inputs[0])
    tiles=n.new('ShaderNodeTexBrick');tiles.offset=0;tiles.inputs['Scale'].default_value=1;tiles.inputs['Brick Width'].default_value=.40;tiles.inputs['Row Height'].default_value=.40;tiles.inputs['Mortar Size'].default_value=.0014;tiles.inputs['Mortar Smooth'].default_value=.0005;l.new(g.outputs['Position'],tiles.inputs['Vector'])
    mix=n.new('ShaderNodeMixRGB');l.new(tiles.outputs['Fac'],mix.inputs[0]);l.new(ramp.outputs['Color'],mix.inputs[1]);mix.inputs[2].default_value=rgb('8D8880');l.new(mix.outputs[0],p.inputs['Base Color'])
    bump=n.new('ShaderNodeBump');bump.inputs['Distance'].default_value=.001;bump.inputs['Strength'].default_value=.28;l.new(noise.outputs['Fac'],bump.inputs['Height']);l.new(bump.outputs[0],p.inputs['Normal'])
    box('hall stone tile floor',.332,2.95,.495,6.31,.001,.005,floor,0)
    # Dedicated ground-floor view, with every other floor retained in the model.
    sc=bpy.data.scenes.get('13 | GROUND HALL - photo reference') or bpy.data.scenes.new('13 | GROUND HALL - photo reference')
    for c in list(sc.collection.children):sc.collection.children.unlink(c)
    sc.collection.children.link(root)
    sc.collection.children.link(bpy.data.collections['01 / Slab'])
    for o in list(sc.collection.objects):bpy.data.objects.remove(o,do_unlink=True)
    sc.render.engine='CYCLES';sc.cycles.samples=16;sc.cycles.use_denoising=True;sc.render.resolution_x=1500;sc.render.resolution_y=1100;sc.render.resolution_percentage=80;sc.render.threads_mode='FIXED';sc.render.threads=8
    sc.world=bpy.data.worlds.new('Hall soft daylight');sc.world.use_nodes=True;sc.world.node_tree.nodes['Background'].inputs[0].default_value=(.70,.77,.88,1);sc.world.node_tree.nodes['Background'].inputs[1].default_value=.24
    sc.view_settings.view_transform='AgX'
    cam=bpy.data.objects.new('Ground hall photo camera',bpy.data.cameras.new('Ground hall photo camera'));sc.collection.objects.link(cam);cam.location=(2.65,.90,1.72);cam.rotation_euler=(Vector((.49,2.43,1.07))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=22;sc.camera=cam
    ld=bpy.data.lights.new('Ground hall entry daylight','AREA');ld.energy=95;ld.shape='RECTANGLE';ld.size=1.1;ld.size_y=1.7
    lo=bpy.data.objects.new(ld.name,ld);sc.collection.objects.link(lo);lo.location=(1.70,.65,1.65);lo.rotation_euler=(Vector((.4,2.8,1.0))-lo.location).to_track_quat('-Z','Y').to_euler()
    sc['reference_notes']='Built-in hall cabinetry and 40 cm tile size estimated from user photos; original floorplan retained.'
    return sc
