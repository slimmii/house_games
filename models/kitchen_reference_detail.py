"""Kitchen refined from user plan crops and terrazzo photograph, 24 Sep 2026.
Plan width 248 cm used to fit traced shapes; furniture dimensions remain inferred.
"""
import bpy,bmesh,math
from mathutils import Vector

def refine_kitchen_reference():
    F=2.41
    seat=bpy.data.objects['Kitchen shaped corner bench seat'];col=seat.users_collection[0]
    white=bpy.data.materials['Camber - premium white matt W1000 ST9']
    def rgb(h):
        return tuple((int(h[i:i+2],16)/255)**2.2 for i in (0,2,4))+(1,)
    def mat(name,color):
        m=bpy.data.materials.get(name) or bpy.data.materials.new(name);m.diffuse_color=rgb(color);m.use_nodes=True
        m.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=rgb(color)
        return m
    terra=mat('Kitchen - reference ivory terrazzo black ochre and tan chips','E7DDC8')
    n=terra.node_tree.nodes;l=terra.node_tree.links;n.clear()
    out=n.new('ShaderNodeOutputMaterial');p=n.new('ShaderNodeBsdfPrincipled');p.inputs['Roughness'].default_value=.31;l.new(p.outputs[0],out.inputs[0])
    geo=n.new('ShaderNodeNewGeometry')
    last=None
    for scale,density,edge in [(55,.48,.14),(155,.35,.20)]:
        v=n.new('ShaderNodeTexVoronoi');v.feature='F1';v.inputs['Scale'].default_value=scale
        e=n.new('ShaderNodeTexVoronoi');e.feature='DISTANCE_TO_EDGE';e.inputs['Scale'].default_value=scale
        for tex in (v,e):l.new(geo.outputs['Position'],tex.inputs['Vector'])
        sep=n.new('ShaderNodeSeparateColor');l.new(v.outputs['Color'],sep.inputs[0])
        select=n.new('ShaderNodeMath');select.operation='LESS_THAN';select.inputs[1].default_value=density;l.new(sep.outputs['Red'],select.inputs[0])
        inset=n.new('ShaderNodeMath');inset.operation='GREATER_THAN';inset.inputs[1].default_value=edge;l.new(e.outputs['Distance'],inset.inputs[0])
        mask=n.new('ShaderNodeMath');mask.operation='MULTIPLY';l.new(select.outputs[0],mask.inputs[0]);l.new(inset.outputs[0],mask.inputs[1])
        ramp=n.new('ShaderNodeValToRGB');ramp.color_ramp.interpolation='CONSTANT'
        colors=[(0,'28231F'),(.24,'60402B'),(.36,'A77943'),(.59,'CBB18D'),(.82,'F7EAD3')]
        ramp.color_ramp.elements.remove(ramp.color_ramp.elements[1])
        for i,(pos,c) in enumerate(colors):
            el=ramp.color_ramp.elements[0] if i==0 else ramp.color_ramp.elements.new(pos);el.position=pos;el.color=rgb(c)
        l.new(sep.outputs['Green'],ramp.inputs[0])
        mix=n.new('ShaderNodeMixRGB');l.new(mask.outputs[0],mix.inputs[0]);mix.inputs[1].default_value=rgb('E7DDC8')
        if last:l.new(last,mix.inputs[1])
        l.new(ramp.outputs['Color'],mix.inputs[2]);last=mix.outputs[0]
    l.new(last,p.inputs['Base Color'])
    for name in ['Kitchen long stone worktop','Kitchen return stone worktop','Kitchen organic stone tabletop']:
        o=bpy.data.objects[name];o.data.materials.clear();o.data.materials.append(terra)
    def mesh_object(name,pts,z,h,material):
        old=bpy.data.objects.get(name)
        collections=list(old.users_collection) if old else [col]
        if old:bpy.data.objects.remove(old,do_unlink=True)
        count=len(pts);verts=[(x,y,zz) for zz in (z,z+h) for x,y in pts]
        faces=[tuple(reversed(range(count))),tuple(range(count,2*count))]+[(i,(i+1)%count,(i+1)%count+count,i+count) for i in range(count)]
        mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
        bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free()
        o=bpy.data.objects.new(name,mesh)
        for c in collections:c.objects.link(o)
        o.data.materials.append(material)
        bevel=o.modifiers.new('Fine eased edge','BEVEL');bevel.width=.002;bevel.segments=3
        return o
    def box(name,x0,x1,y0,y1,z0,z1,material=white):
        return mesh_object(name,[(x0,y0),(x1,y0),(x1,y1),(x0,y1)],z0,z1-z0,material)
    def bezier(a,b,c,d,steps=20):
        return [tuple((1-t)**3*a[i]+3*(1-t)**2*t*b[i]+3*(1-t)*t*t*c[i]+t**3*d[i] for i in (0,1)) for t in [j/steps for j in range(steps)]]
    # Digitized silhouette from enlarged plan, mapped to the dimensioned kitchen crop.
    segments=[((240,355),(240,285),(361,181),(474,205)),((474,205),(604,220),(645,297),(643,413)),((643,413),(646,499),(620,634),(600,697)),((600,697),(591,731),(571,749),(536,766)),((536,766),(452,805),(341,861),(309,832)),((309,832),(278,810),(291,713),(294,639)),((294,639),(304,513),(283,470),(260,414)),((260,414),(248,390),(239,372),(240,355))]
    outline=[]
    for seg in segments:outline+=bezier(*seg)
    outline=[(1.485+(x-238)*.00236,10.217-(y-204)*.00236) for x,y in outline]
    table=mesh_object('Kitchen organic stone tabletop',outline,F+.755,.035,terra)
    table['reference']='Silhouette traced from user enlarged plan and scaled to 248 cm kitchen width.'
    # Bench wraps the rear and right windows, following the table's convex side.
    curve=[]
    for seg in [((2.43,9.01),(2.48,9.25),(2.57,9.68),(2.49,9.96)),((2.49,9.96),(2.40,10.29),(1.95,10.35),(1.48,10.11))]:curve+=bezier(*seg)
    pts=[(.964,10.65),(2.80,10.65),(2.80,8.640233333333)]+curve+[(1.48,10.11),(.964,10.11)]
    mesh_object('Kitchen shaped corner bench seat',pts,F+.44,.045,white)
    ped=bpy.data.objects['Kitchen single white pedestal'];ped.location.x=1.995;ped.location.y=9.51
    # Side support kept behind the new narrow curve; diagonal end panel follows plan.
    for name in ['Kitchen bench side support','Kitchen bench end support']:
        if name in bpy.data.objects:bpy.data.objects.remove(bpy.data.objects[name],do_unlink=True)
    box('Kitchen bench side support',2.75,2.79,8.70,10.49,F,F+.44)
    mesh_object('Kitchen bench end support',[(2.43,9.01),(2.80,8.640233333333),(2.80,8.685),(2.46,9.035)],F,.44,white)
    # Integrated recessed edge pulls, matching the junction photograph.
    recess=mat('Kitchen - recessed edge pull shadow','95856F')
    for o in list(bpy.data.objects):
        if o.name.startswith('Kitchen base handle') or o.name=='Kitchen bench junction - handle':bpy.data.objects.remove(o,do_unlink=True)
    for o in [obj for obj in col.objects if obj.name.startswith('Kitchen base door') or obj.name=='Kitchen bench junction - short door']:
        coords=[o.matrix_basis@v.co for v in o.data.vertices];y=min(p.y for p in coords);z0=min(p.z for p in coords);z1=max(p.z for p in coords)
        box('Kitchen reference edge pull '+o.name,.964,.9655,y+.012,y+.022,max(z0+.06,z1-.33),z1-.012,recess)
    # Rear convector: continuous seat grille and matching low front ventilation.
    dark=mat('Kitchen - convector vent shadow','5B5852')
    box('Kitchen convector top grille recess',1.02,2.72,10.49,10.60,F+.484,F+.4855,dark)
    for i in range(113):
        x=1.02+i*.015
        box('Kitchen convector top grille slat %03d'%i,x,x+.009,10.489,10.601,F+.4855,F+.489)
    box('Kitchen convector front white casing',1.03,2.70,10.465,10.48,F+.02,F+.41)
    for i in range(105):
        x=1.05+i*.0155
        box('Kitchen convector front vent %03d'%i,x,x+.005,10.463,10.465,F+.035,F+.09,dark)
    # User correction: closed white bench base, recessed behind the seat edge.
    # Preserve wall/cabinet contact edges; offset only exposed inner edges by 7 cm.
    inset=.07
    def cross(a,b):return a.x*b.y-a.y*b.x
    lines=[]
    for i,a in enumerate(pts):
        a=Vector(a);b=Vector(pts[(i+1)%len(pts)]);d=(b-a).normalized()
        offset=0 if i in (0,1,len(pts)-1) else inset
        lines.append((a+Vector((d.y,-d.x))*offset,d))
    basepts=[]
    for i in range(len(lines)):
        a,u=lines[i-1];b,v=lines[i];den=cross(u,v)
        q=b if abs(den)<1e-8 else a+u*(cross(b-a,v)/den)
        basepts.append(tuple(q))
    for name in ['Kitchen bench rear support','Kitchen bench side support','Kitchen bench end support','Kitchen convector front white casing']:
        if name in bpy.data.objects:bpy.data.objects.remove(bpy.data.objects[name],do_unlink=True)
    base=mesh_object('Kitchen bench - closed recessed white base',basepts,F,.44,white)
    base['seat_overhang_m']=inset
    base['user_reference']='Closed below, with exposed seat overhang; 7 cm inset estimated from reference.'
    # Low ventilation follows the closed rear front, rather than sitting inside it.
    for o in list(bpy.data.objects):
        if o.name.startswith('Kitchen convector front vent'):bpy.data.objects.remove(o,do_unlink=True)
    for i in range(88):
        x=1.025+i*.0155
        ys=[]
        for j,(ax,ay) in enumerate(basepts):
            bx,by=basepts[(j+1)%len(basepts)]
            if min(ax,bx)<=x<max(ax,bx) and abs(bx-ax)>1e-8:
                ys.append(ay+(by-ay)*(x-ax)/(bx-ax))
        y=min(ys)
        box('Kitchen convector front vent %03d'%i,x,x+.005,y-.002,y+.001,F+.035,F+.09,dark)
    return table
