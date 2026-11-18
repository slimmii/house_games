"""Add the user's photographed craft desk to the living-room kitchen wall.

Native editable geometry; only the leaning painting uses the supplied photograph,
through a local UV window. Dimensions are estimates constrained by the wall span.
Run in the canonical house .blend. --save saves with a one-time source backup.
"""
import bpy
import math
import json
import shutil
import sys
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parent
PREFIX = 'Living craft desk / '
COLLECTION = '01 / Furniture / living craft desk'
FLOOR = 2.41
WALL_X, LEFT_Y = 2.981, 5.355
WIDTH, DEPTH, HEIGHT = 1.68, .53, .745
scene = bpy.data.scenes['01 | HOUSE - exterior']
bpy.context.window.scene = scene
for obj in list(bpy.data.objects):
    if obj.name.startswith(PREFIX):
        bpy.data.objects.remove(obj, do_unlink=True)
collection = bpy.data.collections.get(COLLECTION) or bpy.data.collections.new(COLLECTION)
parent = bpy.data.collections['01 | FIRST - 2021 + Camber 2025']
if collection.name not in parent.children:
    parent.children.link(collection)


def xyz(u, depth, height):
    return (WALL_X + depth, LEFT_Y + u, FLOOR + height)


def material(name, color, roughness=.65, metallic=0):
    mat = bpy.data.materials.get(PREFIX + name) or bpy.data.materials.new(PREFIX + name)
    mat.use_nodes = True
    rgb = [int(color[i:i+2], 16) / 255 for i in (0, 2, 4)]
    rgb = [v/12.92 if v <= .04045 else ((v+.055)/1.055)**2.4 for v in rgb]
    mat.diffuse_color = (*rgb, 1)
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*rgb, 1)
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Metallic'].default_value = metallic
    return mat


white = material('satin white furniture', 'F2F0E9', .48)
shadow = material('recessed drawer gaps', 'C2C0B9')
paper = material('ivory paper', 'F4ECD9')
oak = material('pale wood box lids', 'BEA382')
red = material('mushroom red', 'B54743')
spot = material('mushroom cream spots', 'E5DDCB')
charcoal = material('marker caddy charcoal', '25282D')
blue = material('turquoise basket', '039FCA', .45)
gray = material('grey storage tub', '83929C', .45)
pink = material('pink notebook', 'D4A0B5')
purple = material('purple drawing mat', '837292')
green = material('green drawing mat', '729970')
aqua = material('blue drawing mat', '8DAFAE')
yellow = material('yellow craft details', 'E9C657')


def mesh(name, vertices, faces, mat, bevel=0):
    data = bpy.data.meshes.new(PREFIX + name)
    data.from_pydata(vertices, [], faces)
    data.update()
    obj = bpy.data.objects.new(PREFIX + name, data)
    collection.objects.link(obj)
    if mat:
        data.materials.append(mat)
    if bevel:
        modifier = obj.modifiers.new('Small softened edges', 'BEVEL')
        modifier.width = bevel
        modifier.segments = 2
    obj['reference'] = 'User photographs, 1 October 2026'
    return obj


def box(name, u, d, z, width, depth, height, mat, bevel=.002):
    vertices = [xyz(u+x*width/2, d+y*depth/2, z+h*height/2)
                for h in (-1, 1) for y in (-1, 1) for x in (-1, 1)]
    # Local (u,d,z) has reversed handedness relative to world (x,y,z).
    faces = [(1,3,2,0),(6,7,5,4),(4,5,1,0),(3,7,6,2),(2,6,4,0),(5,7,3,1)]
    return mesh(name, vertices, faces, mat, bevel)


def cylinder(name, a, b, radius, mat, segments=16, top_radius=None, floor_contact=False):
    a, b = Vector(xyz(*a)), Vector(xyz(*b))
    axis = (b-a).normalized()
    u = axis.cross(Vector((0,1,0)))
    if u.length < .01:
        u = axis.cross(Vector((1,0,0)))
    u.normalize()
    v = axis.cross(u)
    top_radius = radius if top_radius is None else top_radius
    vertices = [tuple(center+r*(u*math.cos(i*math.tau/segments)+v*math.sin(i*math.tau/segments)))
                for center,r in [(a,radius),(b,top_radius)] for i in range(segments)]
    if floor_contact:
        vertices[:segments] = [(x,y,FLOOR+.001) for x,y,z in vertices[:segments]]
    faces = [tuple(reversed(range(segments))), tuple(range(segments,segments*2))]
    faces += [(i,(i+1)%segments,(i+1)%segments+segments,i+segments) for i in range(segments)]
    obj = mesh(name, vertices, faces, mat)
    for face in obj.data.polygons[2:]:
        face.use_smooth = True
    return obj


# Two drawer pedestals and a broad open knee space.
for side,u in [('left',.205),('right',WIDTH-.205)]:
    box(side+' pedestal carcass',u,.263,.365,.37,.475,.68,white)
    for du in (-.151,.151):
        for dd in (-.195,.195):
            box(side+' pedestal foot',u+du,.263+dd,.027,.048,.043,.054,white,.001)
    for number,z in enumerate((.203,.530),1):
        box(f'{side} drawer {number} shadow reveal',u,.504,z,.351,.006,.321,shadow,.0005)
        box(f'{side} drawer {number} front',u,.512,z,.355,.020,.302,white,.003)
        box(f'{side} drawer {number} grip ledge',u,.527,z+.145,.354,.022,.014,white,.001)
box('white desktop',WIDTH/2,DEPTH/2,HEIGHT-.013,WIDTH,DEPTH,.026,white,.005)
box('back modesty panel',WIDTH/2,.028,.37,.94,.022,.65,white)
box('front support below desktop',WIDTH/2,.456,.707,.96,.035,.035,white)

# A few illustrated play mats; shallow native colored shapes avoid heavy textures.
for i,(u,w,mat) in enumerate(((.30,.50,aqua),(.865,.61,purple),(1.40,.43,green))):
    box(f'craft mat {i+1}',u,.273,HEIGHT+.0014,w,.454,.0028,mat,.006)
    for j in range(3):
        cylinder(f'mat {i+1} printed dot {j}',(u-w*.27+j*w*.25,.41,HEIGHT+.003),
                 (u-w*.27+j*w*.25,.41,HEIGHT+.00335),.020 if j!=1 else .032,[yellow,paper,pink][j],20)

# Two stacked shallow boxes and a marker holder on the left.
for i in range(2):
    z=HEIGHT+.064+i*.115
    box(f'stacked white organizer {i+1}',.255,.125,z,.41,.235,.108,white,.008)
    box(f'organizer wood lid {i+1}',.255,.125,z+.056,.418,.242,.011,oak,.003)
box('black marker caddy',.36,.115,HEIGHT+.325,.195,.127,.18,charcoal,.002)
marker_colors = [pink,green,yellow,blue,purple,red,aqua]
for row in range(3):
    for col in range(6):
        u=.282+col*.029; d=.077+row*.031
        top=HEIGHT+.435+(col%3)*.007
        cylinder(f'marker {row}-{col} white barrel',(u,d,HEIGHT+.32),(u,d,top),.009,paper,12)
        cylinder(f'marker {row}-{col} color cap',(u,d,top),(u,d,top+.013),.0092,marker_colors[(row*3+col)%7],12)

# A small notebook/paper stack, a drawing, and loose pencils.
for i,mat in enumerate((aqua,paper,pink)):
    box(f'notebook stack {i+1}',.235+i*.013,.395,HEIGHT+.013+i*.017,.245,.181,.015,mat,.003)
for i in range(9):
    cylinder(f'notebook binding {i}',(.132+i*.024,.487,HEIGHT+.049),(.132+i*.024,.49,HEIGHT+.06),.0038,paper,8)
box('loose drawing paper',.665,.343,HEIGHT+.009,.26,.235,.002,paper,.001)
box('turquoise drawing frame top',.665,.253,HEIGHT+.011,.19,.015,.002,aqua,0)
box('turquoise drawing frame bottom',.665,.402,HEIGHT+.011,.19,.015,.002,aqua,0)
for u in (.577,.753):
    box('turquoise drawing frame side',u,.327,HEIGHT+.011,.015,.149,.002,aqua,0)
for i,mat in enumerate((red,green,blue)):
    u=.99+i*.065
    cylinder(f'loose pencil {i}',(u,.39,HEIGHT+.007),(u+.034,.24,HEIGHT+.007),.0035,mat,10)
    cylinder(f'pencil {i} wood tip',(u+.034,.24,HEIGHT+.007),(u+.037,.226,HEIGHT+.007),.0035,oak,10,0)

# Painting: the original photo remains unchanged. UVs reference just the canvas.
image_path = ROOT/'textures/living_craft_desk_reference.png'
image = bpy.data.images.load(str(image_path), check_existing=True)
image.pack()
paint = material('original purple heart painting', 'FFFFFF', .88)
nodes=paint.node_tree.nodes
for node in list(nodes):
    if node.type == 'TEX_IMAGE': nodes.remove(node)
texture=nodes.new('ShaderNodeTexImage');texture.image=image
paint.node_tree.links.new(texture.outputs['Color'],nodes.get('Principled BSDF').inputs['Base Color'])
u0,u1=.735,1.165; z0,z1=HEIGHT+.010,HEIGHT+.500; d0,d1=.106,.022
corners=[xyz(u0,d0,z0),xyz(u1,d0,z0),xyz(u1,d1,z1),xyz(u0,d1,z1)]
vertices=corners+[(x-.014,y,z) for x,y,z in corners]
mesh('leaning canvas edges',vertices,[(7,6,5,4),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],paper)
# Reference pixels normalized from the supplied 2048 x 946 display.
uv_corners=[(805/2048,1-374/946),(1127/2048,1-351/946),(1148/2048,1-97/946),(816/2048,1-100/946)]
vertices=[];uvs=[];faces=[];steps=12
for j in range(steps+1):
    t=j/steps
    for i in range(steps+1):
        s=i/steps
        vertices.append(xyz(u0+(u1-u0)*s,d0+(d1-d0)*t,z0+(z1-z0)*t))
        uv=tuple((1-t)*((1-s)*uv_corners[0][k]+s*uv_corners[1][k])+t*((1-s)*uv_corners[3][k]+s*uv_corners[2][k]) for k in (0,1))
        uvs.append(uv)
for j in range(steps):
    for i in range(steps):
        k=j*(steps+1)+i;faces.append((k,k+1,k+steps+2,k+steps+1))
canvas=mesh('photographed heart canvas',vertices,faces,paint)
uv_layer=canvas.data.uv_layers.new(name='Painting photo UV')
for polygon in canvas.data.polygons:
    for loop in polygon.loop_indices:uv_layer.data[loop].uv=uvs[canvas.data.loops[loop].vertex_index]

# A lidded tub and a blue slotted basket on the right.
box('grey craft tub',1.195,.151,HEIGHT+.06,.245,.151,.105,gray,.006)
box('grey craft tub lid',1.195,.151,HEIGHT+.117,.259,.161,.013,gray,.003)
box('tub lid grip',1.195,.151,HEIGHT+.128,.055,.025,.010,white,.002)
u=1.477;d=.325;bw=.177;bd=.145;bh=.155
box('blue basket bottom',u,d,HEIGHT+.010,bw,bd,.012,blue,.005)
for side,dd in [('front',d+bd/2),('back',d-bd/2)]:
    for z in (HEIGHT+.021,HEIGHT+.087,HEIGHT+bh):
        box('basket '+side+' horizontal rim',u,dd,z,bw+.012,.008,.012,blue,.003)
    for i in range(9):
        box('basket '+side+' upright',u-bw/2+i*bw/8,dd,HEIGHT+bh/2,.008,.008,bh,blue,.003)
for side,uu in [('left',u-bw/2),('right',u+bw/2)]:
    for z in (HEIGHT+.021,HEIGHT+.087,HEIGHT+bh):
        box('basket '+side+' horizontal rim',uu,d,z,.008,bd,.012,blue,.003)
    for i in range(7):
        box('basket '+side+' upright',uu,d-bd/2+i*bd/6,HEIGHT+bh/2,.008,.008,bh,blue,.003)

# Red mushroom stool tucked into the knee space, with curved dotted cushion.
cu,cd=.96,.33
for angle in (45,135,225,315):
    t=math.radians(angle)
    cylinder('mushroom stool splayed leg',(cu+.126*math.cos(t),cd+.126*math.sin(t),.027),
             (cu+.079*math.cos(t),cd+.079*math.sin(t),.362),.027,red,16,.023,floor_contact=True)
cylinder('mushroom stool seat rim',(cu,cd,.35),(cu,cd,.386),.154,red,40,.157)
# Low dome: concentric rings with outward/upward normals.
vertices=[xyz(cu,cd,.417)];faces=[];rings=8;segments=48
for j in range(1,rings+1):
    r=.157*j/rings;z=.417-.031*(r/.157)**2
    for i in range(segments):
        t=i*math.tau/segments;vertices.append(xyz(cu+r*math.cos(t),cd+r*math.sin(t),z))
for i in range(segments):
    faces.append((0,1+(i+1)%segments,1+i))
for j in range(rings-1):
    for i in range(segments):
        k=1+j*segments+i;n=1+j*segments+(i+1)%segments
        faces.append((k,n,n+segments,k+segments))
obj=mesh('mushroom stool domed cushion',vertices,faces,red)
for p in obj.data.polygons:p.use_smooth=True
for number,(du,dd,r) in enumerate([(-.085,-.052,.033),(.048,-.081,.028),(.093,.012,.033),(.013,.091,.035),(-.078,.065,.027),(-.003,-.009,.031)]):
    points=[xyz(cu+du,cd+dd,.417-.031*((du*du+dd*dd)/(.157**2))+.0015)]
    for i in range(32):
        t=i*math.tau/32;x=du+r*math.cos(t);y=dd+r*.88*math.sin(t)
        points.append(xyz(cu+x,cd+y,.417-.031*((x*x+y*y)/(.157**2))+.0015))
    mesh(f'mushroom cream spot {number}',points,[(0,1+(i+1)%32,1+i) for i in range(32)],spot)

# Dedicated review scene linked to the actual first floor.
review_name='LIVING | reference craft desk'
old=bpy.data.scenes.get(review_name)
if old:bpy.data.scenes.remove(old)
review=bpy.data.scenes.new(review_name)
review.collection.children.link(parent)
world=bpy.data.worlds.new(PREFIX+'review daylight');world.use_nodes=True
world.node_tree.nodes['Background'].inputs['Color'].default_value=(.8,.85,1,1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value=.45
review.world=world
camera_data=bpy.data.cameras.new(PREFIX+'review camera')
camera=bpy.data.objects.new(PREFIX+'review camera',camera_data);review.collection.objects.link(camera)
camera.location=(5.25,6.15,3.97);target=Vector((3.20,6.195,3.13))
camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();camera_data.lens=37;camera_data.clip_start=.02;review.camera=camera
light_data=bpy.data.lights.new(PREFIX+'review softbox','AREA');light_data.energy=170;light_data.shape='DISK';light_data.size=3
light=bpy.data.objects.new(PREFIX+'review softbox',light_data);review.collection.objects.link(light)
light.location=(5.0,6.2,4.9);light.rotation_euler=(target-light.location).to_track_quat('-Z','Y').to_euler()
review.render.engine='CYCLES';review.cycles.samples=24;review.cycles.use_denoising=True
review.render.threads_mode='FIXED';review.render.threads=8
review.render.resolution_x=1200;review.render.resolution_y=900;review.render.resolution_percentage=100
review.render.image_settings.file_format='PNG';review.render.filepath=str(ROOT/'living_craft_desk.png');review.view_settings.view_transform='AgX'
objects=list(collection.objects)
report={'collection':COLLECTION,'objectCount':len(objects),'deskWidthMeters':WIDTH,'deskDepthMeters':DEPTH,'deskHeightMeters':HEIGHT,
        'dimensionsStatus':'Estimated from supplied photos and existing wall span','wall':'living side of kitchen/WC wall, between spiral stair and kitchen opening',
        'sourceBounds':{'min':[WALL_X,LEFT_Y,FLOOR],'max':[WALL_X+DEPTH,LEFT_Y+WIDTH,FLOOR+HEIGHT+.500]},
        'painting':'Original supplied photograph sampled through canvas-only UVs; original raster unchanged',
        'keptClutter':['two storage boxes','marker caddy','notebooks and drawing','loose pencils','lidded tub','blue basket'],
        'gameCollisionObjects':[o.name for o in objects if any(t in o.name for t in ('desktop','pedestal carcass','back modesty panel','stool seat'))]}
(ROOT/'living_craft_desk_verification.json').write_text(json.dumps(report,indent=2)+'\n')
assert LEFT_Y+WIDTH < 7.124, 'Keep the kitchen passage clear'
bpy.context.window.scene=review
if '--save' in sys.argv:
    source=Path(bpy.data.filepath)
    backup=ROOT/'Huis_before_living_craft_desk_20261001.blend'
    if not backup.exists():shutil.copy2(source,backup)
    bpy.ops.wm.save_as_mainfile(filepath=str(source))
    print('Saved desk to canonical house; backup:',backup,flush=True)
if '--render' in sys.argv:
    bpy.ops.render.render(write_still=True,scene=review.name)
print('CRAFT DESK',json.dumps(report),flush=True)
