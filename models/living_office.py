"""Photo-based living/office correction; safe to apply to the existing shared model."""
import bpy, math
from mathutils import Vector

def update_living_office():
    F=2.41
    col=bpy.data.collections['01 / Furniture']
    white=bpy.data.materials['Camber - premium white matt W1000 ST9']
    dark=bpy.data.materials['Dark metal']
    screen=bpy.data.materials['TV screen']
    def mat(name,color):
        m=bpy.data.materials.get(name) or bpy.data.materials.new(name);m.use_nodes=True
        rgba=tuple((v/255)**2.2 for v in color)+(1,)
        m.diffuse_color=rgba;m.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=rgba
        m.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.82
        return m
    for ob in list(bpy.data.objects):
        if ob.name.startswith(('Office /','Living / coffee')):bpy.data.objects.remove(ob,do_unlink=True)
    def box(name,loc,size,material=white,parent=None,bevel=.003):
        bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name='Office / '+name;o.dimensions=size
        bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
        for c in list(o.users_collection):c.objects.unlink(o)
        col.objects.link(o);o.data.materials.append(material)
        if parent:o.parent=parent
        if bevel:
            mod=o.modifiers.new('Soft edges','BEVEL');mod.width=bevel;mod.segments=3
            o.modifiers.new('Corner normals','WEIGHTED_NORMAL')
        return o
    roots=[o for o in bpy.data.objects if o.type=='EMPTY' and o.name.startswith(('Z1 /','Z2 /'))]
    for o in roots:
        if o.name.startswith('Z1'):
            o.location=(3.65,.65,F);o.rotation_euler.z=math.pi/2
        else:
            o.location=(2.65,3.25,F);o.rotation_euler.z=0
        o['placement_status']='L arrangement facing Camber TV; photo-based estimate, not surveyed'
    for o in list(bpy.data.objects):
        if o.parent and ' arm' in o.name:
            if (o.parent.name.startswith('Z1 /') and o.location.x>2) or (o.parent.name.startswith('Z2 /') and o.location.x<.2):bpy.data.objects.remove(o,do_unlink=True)
    # The long run faces +X towards the television; the return faces the street.
    upholstery=bpy.data.materials['Sofas - muted aubergine from photos']
    cushion=bpy.data.materials['Soft upholstery cushions']
    for m,c in [(upholstery,(76,65,75)),(cushion,(89,79,88))]:
        rgba=tuple((v/255)**2.2 for v in c)+(1,);m.diffuse_color=rgba;m.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=rgba
    # Photo shows two mirrored corner stations against the left side wall.
    # IKEA 502.507.13: maximum width/depth 100 cm, overall height 142 cm.
    board=mat('Office - pale grey magnetic noticeboard',(208,211,207))
    for index,y,mirror in [(1,.48,1),(2,3.20,-1)]:
        root=bpy.data.objects.new('Office / MICKE %d - 100 x 100 x 142 cm'%index,None);col.objects.link(root);root.location=(.36,y,F)
        root.scale.y=mirror;root['source']='IKEA MICKE 502.507.13; 1.00 x 1.00 x 1.42 m'
        def b(n,loc,size,m=white):return box('MICKE %d / '%index+n,loc,size,m,root)
        # Plan is a corner polygon with a recessed, diagonal working edge.
        pts=[(0,0),(1,0),(1,.40),(.64,.40),(.40,.64),(.40,1),(0,1)]
        verts=[(x,y,z) for z in [.735,.765] for x,y in pts];n=len(pts)
        faces=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]+[(j,(j+1)%n,(j+1)%n+n,j+n) for j in range(n)]
        mesh=bpy.data.meshes.new('MICKE corner desktop');mesh.from_pydata(verts,[],faces);mesh.materials.append(white);mesh.update()
        o=bpy.data.objects.new('Office / MICKE %d / shaped corner worktop'%index,mesh);col.objects.link(o);o.parent=root
        b('back left',(.012,.5,1.077),(.024,1,.634),board)
        b('back right',(.5,.012,1.077),(1,.024,.634),board)
        b('top left',(.14,.5,1.407),(.28,1,.026));b('top right',(.64,.14,1.407),(.72,.28,.026))
        b('outer side left',(.20,.987,1.077),(.40,.026,.634));b('outer side right',(.987,.20,1.077),(.026,.40,.634))
        b('inner shelf divider left',(.14,.71,1.09),(.28,.022,.66));b('inner shelf divider right',(.71,.14,1.09),(.022,.28,.66))
        for z in [.95,1.16]:
            b('left shelf',(.14,.85,z),(.28,.27,.018));b('right shelf',(.85,.14,z),(.27,.28,.018))
        b('slab support',(.20,.975,.367),(.40,.035,.735))
        for x in [.61,.97]:b('steel leg',(x,.20,.36),(.022,.022,.72))
        b('steel lower rail',(.79,.20,.02),(.38,.022,.022));b('rear leg',(.04,.04,.367),(.055,.055,.735))
        # Monitor angled across the corner, with keyboard on the work surface.
        mon=b('monitor',(.35,.35,1.0),(.49,.035,.285),dark);mon.rotation_euler.z=-math.pi/4
        mon=b('display',(.365,.365,1.0),(.455,.007,.25),screen);mon.rotation_euler.z=-math.pi/4
        b('monitor stand',(.35,.35,.80),(.05,.05,.08),dark)
        key=b('keyboard',(.52,.52,.778),(.30,.12,.018));key.rotation_euler.z=-math.pi/4
    # Open steel workstation between the two desks, printer below the desktop.
    cx,cy=.64,1.845
    for x in [cx-.265,cx+.265]:
        for y in [cy-.30,cy+.30]:box('printer shelf upright',(x,y,F+.39),(.022,.022,.78))
    for z in [.035,.77]:box('printer shelf horizontal',(cx,cy,F+z),(.56,.64,.024))
    linen=mat('Office - woven storage drawer',(174,167,146))
    box('woven drawer above printer',(cx,cy,F+.645),(.49,.56,.20),linen)
    box('Brother printer body',(cx+.03,cy,F+.305),(.40,.43,.43),white,bevel=.025)
    box('printer dark output recess',(cx+.03,cy,F+.524),(.31,.34,.025),dark)
    box('printer top rim',(cx+.195,cy,F+.53),(.05,.43,.025))
    box('printer front paper drawer',(cx+.235,cy,F+.255),(.008,.37,.19))
    box('printer drawer handle',(cx+.242,cy,F+.36),(.008,.13,.018),board)
    for j in range(5):
        box('black document tray',(cx,cy,F+.80+j*.055),(.27,.34,.015),dark)
        box('document tray rear',(cx-.13,cy,F+.82+j*.055),(.012,.34,.04),dark)
    # Interior veneer only: facade material is unchanged. World position keeps real brick scale.
    brick=mat('Office - reference warm buff brick and dark recessed mortar',(146,116,84))
    n=brick.node_tree.nodes;l=brick.node_tree.links;p=n.get('Principled BSDF')
    for node in list(n):
        if node.type not in ['BSDF_PRINCIPLED','OUTPUT_MATERIAL']:n.remove(node)
    geo=n.new('ShaderNodeNewGeometry');sep=n.new('ShaderNodeSeparateXYZ');vec=n.new('ShaderNodeCombineXYZ')
    l.new(geo.outputs['Position'],sep.inputs[0]);l.new(sep.outputs['Y'],vec.inputs['X']);l.new(sep.outputs['Z'],vec.inputs['Y'])
    noise=n.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=85;noise.inputs['Detail'].default_value=3;l.new(geo.outputs['Position'],noise.inputs['Vector'])
    tex=n.new('ShaderNodeTexBrick');tex.inputs['Scale'].default_value=1;tex.inputs['Brick Width'].default_value=.225;tex.inputs['Row Height'].default_value=.063;tex.inputs['Mortar Size'].default_value=.0055;tex.inputs['Mortar Smooth'].default_value=.002
    for key,c in [('Color1',(170,139,102)),('Color2',(118,93,68)),('Mortar',(57,51,44))]:tex.inputs[key].default_value=tuple((v/255)**2.2 for v in c)+(1,)
    l.new(vec.outputs[0],tex.inputs['Vector']);l.new(tex.outputs['Color'],p.inputs['Base Color'])
    bump=n.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.65;bump.inputs['Distance'].default_value=.008;bump.invert=True;l.new(tex.outputs['Fac'],bump.inputs['Height'])
    fine=n.new('ShaderNodeBump');fine.inputs['Strength'].default_value=.32;fine.inputs['Distance'].default_value=.002;l.new(noise.outputs['Fac'],fine.inputs['Height']);l.new(bump.outputs[0],fine.inputs['Normal']);l.new(fine.outputs[0],p.inputs['Normal'])
    ob=box('reference brick wall',(.326,2.88,F+1.33),(.025,5.14,2.66),brick,bevel=0)
    # Keep wall in the left-wall collection so the established cutaway remains open.
    col.objects.unlink(ob);bpy.data.collections['01 / Walls left'].objects.link(ob)
    # Dedicated view shows all requested changes in context.
    sc=bpy.data.scenes.get('08 | LIVING + OFFICE - photo layout')
    if not sc:
        sc=bpy.data.scenes['04 | LIVING - Camber perspective'].copy();sc.name='08 | LIVING + OFFICE - photo layout'
    sc.use_fake_user=True
    data=bpy.data.cameras.new('Living office overview camera');cam=bpy.data.objects.new('Living office overview camera',data);sc.collection.objects.link(cam)
    cam.location=(6.4,5.15,F+3.7);target=Vector((2.8,1.95,F+.60));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();data.lens=24;sc.camera=cam
    sc.render.resolution_x=1800;sc.render.resolution_y=1200;sc.render.resolution_percentage=100
    return sc

if __name__=='__main__':update_living_office()
