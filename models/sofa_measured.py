"""User-corrected L sofa: 265 x 235 cm, 64 cm from window, 83 cm from TV."""
import bpy, math
from mathutils import Vector

def update_measured_sofa():
    F=2.41;col=bpy.data.collections['01 / Furniture']
    for o in list(bpy.data.objects):
        if o.name.startswith(('Z1 /','Z2 /','Measured sofa /')):bpy.data.objects.remove(o,do_unlink=True)
    # Measure the actual foremost low TV-unit surface, including drawer fronts.
    tv=[o for o in bpy.data.objects if o.type=='MESH' and o.name.startswith(('Camber drawing / C low white front','Camber drawing / C white cable end panel','Camber C low TV','Camber C drawer front','Camber C end cable','Camber C oak top'))]
    assert tv, 'TV cabinet reference missing'
    front=min((o.matrix_world@Vector(v)).x for o in tv for v in o.bound_box)
    window=[o for o in bpy.data.objects if o.type=='MESH' and o.name.startswith('1 front 0') and not any(t in o.name for t in ('glass','sill'))]
    assert window, 'Living window frame reference missing'
    # Persisted local transforms also work when the facade is absent from the active view.
    window_front=max((o.matrix_basis@Vector(v)).y for o in window for v in o.bound_box)
    xmax=front-.83;xmin=xmax-2.65;ymin=window_front+.64;ymax=ymin+2.35;depth=1.0
    upholstery=bpy.data.materials['Sofas - muted aubergine from photos'];cushion=bpy.data.materials['Soft upholstery cushions'];dark=bpy.data.materials['Dark metal']
    root=bpy.data.objects.new('Measured sofa / 265 x 235 cm L sofa',None);col.objects.link(root)
    root['size_TV_direction_m']=2.65;root['size_veranda_direction_m']=2.35;root['clearance_to_TV_unit_m']=.83
    root['clearance_to_window_m']=.64;root['window_inner_frame_y_m']=window_front
    root['measurement_status']='User correction: 265 x 235 cm, 83 cm to TV cabinet front, 64 cm to inner window frame. Depth 100 cm, seat height 45 cm and overall height 98 cm remain photo estimates.'
    root['seat_height_m']=.45;root['overall_height_m']=.98;root['depth_m']=depth
    # Lower proportions and broad stitched microfibre panels visible in the photos.
    for m in (upholstery,cushion):
        m.use_nodes=True;n=m.node_tree.nodes;l=m.node_tree.links
        for nd in list(n):
            if nd.type not in ('BSDF_PRINCIPLED','OUTPUT_MATERIAL'):n.remove(nd)
        p=n.get('Principled BSDF');p.inputs['Roughness'].default_value=.92
        p.inputs['Sheen Weight'].default_value=.18
        rgb=lambda h:tuple((int(h[i:i+2],16)/255)**2.2 for i in (0,2,4))+(1,)
        m.diffuse_color=rgb('55494F')
        geo=n.new('ShaderNodeTexCoord');noise=n.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=7;noise.inputs['Detail'].default_value=3
        ramp=n.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].color=rgb('463D43');ramp.color_ramp.elements[1].color=rgb('62565C')
        l.new(geo.outputs['Object'],noise.inputs['Vector']);l.new(noise.outputs['Fac'],ramp.inputs[0]);l.new(ramp.outputs[0],p.inputs['Base Color'])
        fine=n.new('ShaderNodeTexNoise');fine.inputs['Scale'].default_value=280
        bump=n.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.13;bump.inputs['Distance'].default_value=.00045
        l.new(geo.outputs['Object'],fine.inputs['Vector']);l.new(fine.outputs['Fac'],bump.inputs['Height']);l.new(bump.outputs[0],p.inputs['Normal'])
    seam=bpy.data.materials.get('Sofa contrast stitching') or bpy.data.materials.new('Sofa contrast stitching')
    seam.diffuse_color=(.23,.20,.17,1);seam.use_nodes=True;seam.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=seam.diffuse_color
    chrome=bpy.data.materials.get('Sofa brushed chrome feet') or bpy.data.materials.new('Sofa brushed chrome feet')
    chrome.use_nodes=True;bs=chrome.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(.45,.46,.47,1);bs.inputs['Metallic'].default_value=.85;bs.inputs['Roughness'].default_value=.25
    def box(name,x,y,z,w,d,h,mat=upholstery,bevel=.065):
        bpy.ops.mesh.primitive_cube_add(size=1,location=(x,y,F+z));o=bpy.context.object;o.name='Measured sofa / '+name;o.dimensions=(w,d,h)
        bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
        for c in list(o.users_collection):c.objects.unlink(o)
        col.objects.link(o);o.parent=root;o.data.materials.append(mat)
        mod=o.modifiers.new('Rounded upholstery','BEVEL');mod.width=bevel;mod.segments=6;o.modifiers.new('Weighted normals','WEIGHTED_NORMAL');return o
    # Joined base, with one shared corner: lengths are overall, not summed modules.
    # End panels overlap the base volume, but their visible outside faces must
    # not coincide: coplanar faces previously produced black render patches.
    pts=[(xmin+.012,ymin+.012),(xmin+depth-.012,ymin+.012),(xmin+depth-.012,ymin+.26),(xmin+depth,ymin+.26),(xmin+depth,ymax-depth),(xmax-.26,ymax-depth),(xmax-.26,ymax-depth+.012),(xmax-.012,ymax-depth+.012),(xmax-.012,ymax-.012),(xmin+.012,ymax-.012)]
    verts=[(x,y,F+z) for z in [.045,.325] for x,y in pts];n=len(pts)
    mesh=bpy.data.meshes.new('Continuous L sofa base');mesh.from_pydata(verts,[],[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]+[(j,(j+1)%n,(j+1)%n+n,j+n) for j in range(n)]);mesh.materials.append(upholstery);mesh.update()
    o=bpy.data.objects.new('Measured sofa / continuous L base',mesh);col.objects.link(o);o.parent=root
    mod=o.modifiers.new('Rounded base edge','BEVEL');mod.width=.06;mod.segments=4;o.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
    # Continuous upholstered back carcass closes the space below the cushions.
    box('rear continuous upholstered shell',(xmin+xmax)/2-.12,ymax-.107,.432,2.65-.265,.190,.768,upholstery,.025)
    box('side continuous upholstered shell',xmin+.107,(ymin+ymax)/2+.12,.429,.190,2.35-.265,.762,upholstery,.025)
    def stitch(name,points,r=.00085):
        cu=bpy.data.curves.new(name,'CURVE');cu.dimensions='3D';cu.bevel_depth=r;cu.bevel_resolution=2
        sp=cu.splines.new('POLY');sp.points.add(len(points)-1)
        for p,v in zip(sp.points,points):p.co=(*v,1)
        ob=bpy.data.objects.new('Measured sofa / '+name,cu);col.objects.link(ob);ob.parent=root;cu.materials.append(seam)
    def back_panel(name,a,b,side=False):
        w=b-a
        # Broad back panel with a paired horizontal seam, plus one rounded headrest.
        if side:
            box(name+' back',xmin+.145,(a+b)/2,.667,.28,w-.012,.446,cushion,.055)
            box(name+' headrest',xmin+.15,(a+b)/2,.902,.29,w-.016,.156,upholstery,.072)
            for dz in (-.003,.003):stitch(name+' double horizontal seam',[(xmin+.286,a+.04,F+.664+dz),(xmin+.286,b-.04,F+.664+dz)])
            for dy in (-.003,.003):stitch(name+' double vertical seam',[(xmin+.286,(a+b)/2+dy,F+.49),(xmin+.286,(a+b)/2+dy,F+.85)])
        else:
            box(name+' back',(a+b)/2,ymax-.145,.667,w-.012,.28,.446,cushion,.055)
            box(name+' headrest',(a+b)/2,ymax-.15,.902,w-.016,.29,.156,upholstery,.072)
            for dz in (-.003,.003):stitch(name+' double horizontal seam',[(a+.04,ymax-.286,F+.664+dz),(b-.04,ymax-.286,F+.664+dz)])
            for dx in (-.003,.003):stitch(name+' double vertical seam',[((a+b)/2+dx,ymax-.286,F+.49),((a+b)/2+dx,ymax-.286,F+.85)])
    # Joined double seats with stitched divisions, and a separate shared corner.
    box('shared corner cushion',xmin+.638,ymax-.638,.379,.72,.72,.142,cushion,.060)
    back_panel('corner rear',xmin+.29,xmin+depth)
    back_panel('corner side',ymax-depth,ymax-.29,True)
    a=xmin+depth;b=xmax-.255
    box('TV-direction double seat',(a+b)/2,ymax-.647,.379,b-a-.010,.702,.142,cushion,.060)
    for i in range(2):back_panel('TV-direction '+str(i+1),a+(b-a)*i/2,a+(b-a)*(i+1)/2)
    for dx in (-.003,.003):stitch('TV seat double seam',[((a+b)/2+dx,ymax-.93,F+.427),((a+b)/2+dx,ymax-.36,F+.451)])
    a=ymin+.255;b=ymax-depth
    box('veranda-direction double seat',xmin+.647,(a+b)/2,.379,.702,b-a-.010,.142,cushion,.060)
    for i in range(2):back_panel('veranda-direction '+str(i+1),a+(b-a)*i/2,a+(b-a)*(i+1)/2,True)
    for dy in (-.003,.003):stitch('veranda seat double seam',[(xmin+.36,(a+b)/2+dy,F+.451),(xmin+.93,(a+b)/2+dy,F+.427)])
    box('TV end arm',xmax-.125,ymax-.5,.344,.25,1.0,.598,upholstery,.075)
    box('window end arm',xmin+.5,ymin+.125,.344,1.0,.25,.598,upholstery,.075)
    # Low polished runners visible below the two end arms in the photographs.
    box('TV end chrome runner',xmax-.125,ymax-.5,.021,.20,.87,.042,chrome,.012)
    box('window end chrome runner',xmin+.5,ymin+.125,.021,.87,.20,.042,chrome,.012)
    box('hidden corner foot',xmin+.15,ymax-.15,.023,.07,.07,.046,dark,.004)
    bpy.context.view_layer.update()
    coords=[o.matrix_world@Vector(v) for o in root.children if o.type=='MESH' for v in o.bound_box]
    actual=(max(v.x for v in coords)-min(v.x for v in coords),max(v.y for v in coords)-min(v.y for v in coords),front-max(v.x for v in coords))
    assert all(abs(a-b)<1e-5 for a,b in zip(actual,(2.65,2.35,.83))),actual
    assert abs(min(v.y for v in coords)-window_front-.64)<1e-5
    print('VERIFIED SOFA: TV axis %.3f m, veranda axis %.3f m, clear TV gap %.3f m'%actual,flush=True)
    # Plan view makes the supplied dimensions directly reviewable.
    sc=bpy.data.scenes.get('10 | SOFA - measured layout')
    if not sc:
        sc=bpy.data.scenes['02 | FIRST FLOOR - furnished cutaway'].copy();sc.name='10 | SOFA - measured layout'
    sc.use_fake_user=True
    cam=bpy.data.objects.new('Measured sofa plan camera',bpy.data.cameras.new('Measured sofa plan camera'));sc.collection.objects.link(cam)
    cam.location=(4.8,2.05,12);cam.rotation_euler=(0,0,0);cam.data.type='ORTHO';cam.data.ortho_scale=5.45;sc.camera=cam
    sc.render.resolution_x=1600;sc.render.resolution_y=1200;sc.render.resolution_percentage=100
    # Only this scene receives dimension graphics, above the furniture.
    old=bpy.data.collections.get('Measured sofa plan dimensions')
    if old:
        for ob in list(old.objects):bpy.data.objects.remove(ob,do_unlink=True)
        bpy.data.collections.remove(old)
    dimcol=bpy.data.collections.new('Measured sofa plan dimensions');sc.collection.children.link(dimcol)
    ink=bpy.data.materials.get('Drawing labels')
    def line(a,b):
        curve=bpy.data.curves.new('Dimension line','CURVE');curve.dimensions='3D';curve.bevel_depth=.006;curve.bevel_resolution=1
        sp=curve.splines.new('POLY');sp.points.add(1);sp.points[0].co=(*a,1);sp.points[1].co=(*b,1)
        o=bpy.data.objects.new('Dimension line',curve);dimcol.objects.link(o);curve.materials.append(ink)
    def label(txt,x,y,rotation=0):
        c=bpy.data.curves.new(txt,'FONT');c.body=txt;c.size=.13;c.align_x='CENTER'
        o=bpy.data.objects.new(txt,c);dimcol.objects.link(o);o.location=(x,y,F+1.45);o.rotation_euler.z=rotation;c.materials.append(ink)
    z=F+1.4
    for a,b in [((xmin,ymax+.27,z),(xmax,ymax+.27,z)),((xmin-.25,ymin,z),(xmin-.25,ymax,z)),((xmax,1.90,z),(front,1.90,z))]:
        line(a,b)
        if a[1]==b[1]:
            for p in [a,b]:line((p[0],p[1]-.06,z),(p[0],p[1]+.06,z))
        else:
            for p in [a,b]:line((p[0]-.06,p[1],z),(p[0]+.06,p[1],z))
    label('2,65 m - richting tv',(xmin+xmax)/2,ymax+.35)
    label('2,35 m - richting veranda',xmin-.34,(ymin+ymax)/2,math.pi/2)
    label('83 cm',(xmax+front)/2,2.04)
    line((xmin+.32,window_front,z),(xmin+.32,ymin,z))
    label('64 cm raam',xmin+.72,(window_front+ymin)/2)
    return sc
