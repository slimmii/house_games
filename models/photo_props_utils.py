import bpy, math
from mathutils import Vector
P='Photo props / '
COL=None
def mat(name,color,rough=.55):
 m=bpy.data.materials.get(P+name) or bpy.data.materials.new(P+name);m.use_nodes=True
 rgba=tuple((int(color[i:i+2],16)/255)**2.2 for i in (0,2,4))+(1,)
 m.diffuse_color=rgba;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=rgba;p.inputs['Roughness'].default_value=rough
 return m
def link(o,name,m):
 o.name=P+name
 for c in list(o.users_collection):c.objects.unlink(o)
 COL.objects.link(o)
 if m:o.data.materials.append(m)
 return o
def mesh(name,vs,fs,m):
 me=bpy.data.meshes.new(P+name);me.from_pydata(vs,[],fs);me.update()
 o=bpy.data.objects.new(P+name,me);COL.objects.link(o)
 if m:me.materials.append(m)
 return o
def box(name,p,dim,m,bev=.002):
 bpy.ops.mesh.primitive_cube_add(size=1,location=p);o=bpy.context.object;o.dimensions=dim;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);link(o,name,m)
 if bev:b=o.modifiers.new('Soft edges','BEVEL');b.width=bev;b.segments=3
 return o
def sphere(name,p,scale,m):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=16,location=p);o=bpy.context.object;o.scale=scale;link(o,name,m)
 for f in o.data.polygons:f.use_smooth=True
 return o
def rod(name,a,b,r,m):
 a,b=Vector(a),Vector(b);v=b-a;bpy.ops.mesh.primitive_cylinder_add(vertices=24,radius=r,depth=v.length,location=(a+b)/2)
 o=bpy.context.object;o.rotation_euler=v.to_track_quat('Z','Y').to_euler();link(o,name,m)
 for f in o.data.polygons:f.use_smooth=True
 return o
def line(name,pts,r,m,smooth=True):
 c=bpy.data.curves.new(P+name,'CURVE');c.dimensions='3D';c.bevel_depth=r;c.bevel_resolution=2;c.resolution_u=12
 s=c.splines.new('BEZIER' if smooth else 'POLY')
 if smooth:
  s.bezier_points.add(len(pts)-1)
  for p,v in zip(s.bezier_points,pts):p.co=v;p.handle_left_type='AUTO';p.handle_right_type='AUTO'
 else:
  s.points.add(len(pts)-1)
  for p,v in zip(s.points,pts):p.co=(*v,1)
 o=bpy.data.objects.new(P+name,c);COL.objects.link(o);c.materials.append(m);return o
def lathe(name,center,profile,m,N=64):
 vs=[];fs=[]
 for r,z in profile:vs.extend([(center[0]+r*math.cos(i*math.tau/N),center[1]+r*math.sin(i*math.tau/N),center[2]+z) for i in range(N)])
 for j in range(len(profile)-1):
  for i in range(N):fs.append((j*N+i,j*N+(i+1)%N,(j+1)*N+(i+1)%N,(j+1)*N+i))
 o=mesh(name,vs,fs,m)
 for f in o.data.polygons:f.use_smooth=True
 return o
def flat(name,poly,origin,U,V,m):
 origin,U,V=Vector(origin),Vector(U),Vector(V)
 return mesh(name,[origin+U*x+V*y for x,y in poly],[tuple(range(len(poly)))],m)
def board(name,poly,origin,U,V,thick,edge,front):
 O,U,V=Vector(origin),Vector(U),Vector(V);N=U.cross(V).normalized();n=len(poly)
 vs=[O+U*x+V*y+N*t for t in (-thick/2,thick/2) for x,y in poly]
 fs=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
 o=mesh(name,vs,fs,edge);o.data.materials.append(front);o.data.polygons[0].material_index=1;o.data.polygons[1].material_index=1
 return o
def text(name,body,p,size,m,rotation=(math.pi/2,0,0),align='CENTER'):
 c=bpy.data.curves.new(P+name,'FONT');c.body=body;c.size=size;c.align_x=align;c.align_y='CENTER';c.extrude=.00015
 o=bpy.data.objects.new(P+name,c);COL.objects.link(o);o.location=p;o.rotation_euler=rotation;c.materials.append(m);return o
def aim(o,p):o.rotation_euler=(Vector(p)-o.location).to_track_quat('-Z','Y').to_euler()
def review(name,source,cam,target,lens,light,energy,res):
 old=bpy.data.scenes.get(name)
 if old:bpy.data.scenes.remove(old)
 src=bpy.data.scenes[source];s=bpy.data.scenes.new(name);s.world=src.world
 for c in src.collection.children:s.collection.children.link(c)
 for o in src.collection.objects:
  if o.type=='LIGHT':s.collection.objects.link(o)
 d=bpy.data.cameras.new(P+name);o=bpy.data.objects.new(P+name+' camera',d);s.collection.objects.link(o);o.location=cam;d.lens=lens;d.clip_start=.02;aim(o,target);s.camera=o
 d=bpy.data.lights.new(P+name+' soft light','AREA');d.energy=energy;d.size=1.4
 o=bpy.data.objects.new(P+name+' soft light',d);s.collection.objects.link(o);o.location=light;aim(o,target)
 s.render.engine='BLENDER_EEVEE';s.render.resolution_x,s.render.resolution_y=res;s.render.resolution_percentage=100;s.render.image_settings.file_format='PNG';s.view_settings.view_transform='AgX'
 return s
