"""Replace the shelf-like proxy in Bedroom 1 with the photographed dollhouse."""
import bpy, math, json, shutil
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parent
F = 5.31
P = 'Bedroom 1 dollhouse / '


def update_bedroom1_dollhouse():
    col = bpy.data.collections['02 / Bedroom 1 furniture']
    for ob in list(bpy.data.objects):
        if ob.name.startswith('Bedroom 1 / pine dollhouse') or ob.name.startswith(P):
            bpy.data.objects.remove(ob, do_unlink=True)

    def rgb(h):
        h = h.lstrip('#'); return tuple((int(h[i:i+2],16)/255)**2.2 for i in (0,2,4))+(1,)
    def material(name, colour, rough=.55, metal=0):
        m = bpy.data.materials.get(P+name) or bpy.data.materials.new(P+name); m.use_nodes = True
        m.diffuse_color = rgb(colour); bs = m.node_tree.nodes.get('Principled BSDF')
        bs.inputs['Base Color'].default_value = rgb(colour); bs.inputs['Roughness'].default_value = rough; bs.inputs['Metallic'].default_value = metal
        return m
    pine = material('honey pine frame', 'C79B68', .48)
    peach = material('peach roof trim', 'D5A17A', .54)
    white = material('warm white room panels', 'F1ECE4', .72)
    pink = material('pink balcony and furniture', 'D792AC', .64)
    blush = material('blush wallpaper', 'E8C9CD', .84)
    blue = material('pale blue wallpaper', 'BFD3D8', .86)
    mint = material('mint room detail', 'AECDBE', .80)
    cream = material('miniature upholstery', 'EFE0CF', .91)
    dark = material('miniature dark detail', '4B4648', .60)
    silver = material('tiny metal fittings', 'BFC2C0', .28, .72)

    def box(name, x0,x1,y0,y1,z0,z1, mat=white, bevel=.002):
        bpy.ops.mesh.primitive_cube_add(size=1, location=((x0+x1)/2,(y0+y1)/2,F+(z0+z1)/2))
        ob=bpy.context.object; ob.name=P+name; ob.dimensions=(x1-x0,y1-y0,z1-z0); bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
        for c in list(ob.users_collection): c.objects.unlink(ob)
        col.objects.link(ob); ob.data.materials.append(mat)
        if bevel:
            mod=ob.modifiers.new('Rounded toy edge','BEVEL'); mod.width=bevel; mod.segments=3
        return ob
    def cyl(name, loc, radius, depth, mat=pink, axis='Z', vertices=20):
        bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius,depth=depth,location=(loc[0],loc[1],F+loc[2]))
        ob=bpy.context.object; ob.name=P+name
        if axis=='X': ob.rotation_euler.y=math.pi/2
        if axis=='Y': ob.rotation_euler.x=math.pi/2
        for c in list(ob.users_collection): c.objects.unlink(ob)
        col.objects.link(ob); ob.data.materials.append(mat); return ob
    def rod(name,a,b,r=.006,mat=pine):
        a=Vector((a[0],a[1],F+a[2])); b=Vector((b[0],b[1],F+b[2]))
        bpy.ops.mesh.primitive_cylinder_add(vertices=16,radius=r,depth=(b-a).length,location=(a+b)/2)
        ob=bpy.context.object; ob.name=P+name; ob.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler()
        for c in list(ob.users_collection): c.objects.unlink(ob)
        col.objects.link(ob); ob.data.materials.append(mat); return ob
    def panel(name, vertices, faces, mat):
        me=bpy.data.meshes.new(P+name); me.from_pydata([(x,y,F+z) for x,y,z in vertices],[],faces); me.materials.append(mat); me.update()
        ob=bpy.data.objects.new(P+name,me); col.objects.link(ob); return ob

    # Preserve the proxy's 93 x 35 cm footprint and circulation clearance.
    xr, xf = 2.962, 3.315
    y0, y1 = 1.28, 2.21
    ym = (y0+y1)/2
    floors = [.035, .365, .695, 1.025]
    ceiling = 1.335; apex = 1.56
    # White back and pastel room panels.
    box('white rear backing',xr,xr+.014,y0+.02,y1-.02,.04,ceiling,white,.001)
    for z0,z1,mat in ((.07,.355,blue),(.395,.685,blush),(.725,1.015,blue),(1.055,1.315,blush)):
        box('pastel rear room panel',xr+.014,xr+.021,y0+.045,y1-.045,z0,z1,mat,.001)
    # Floors and the characteristic light timber outer frame.
    for i,z in enumerate(floors):
        box(f'white storey floor {i+1}',xr+.018,xf-.018,y0+.018,y1-.018,z,z+.018,white,.002)
        box(f'pine front floor rail {i+1}',xf-.028,xf,y0,y1,z-.012,z+.028,pine,.003)
    for x in (xr,xf-.027):
        for y in (y0,y1-.027): box('full-height pine corner post',x,x+.027,y,y+.027,.015,ceiling+.03,pine,.003)
    # Interior dividers alternate slightly, like the photographed toy rooms.
    box('lower room divider',xr+.022,xf-.024,ym-.009,ym+.009,.055,.69,white,.001)
    box('upper room divider',xr+.022,xf-.024,ym+.08,ym+.098,.705,1.025,white,.001)

    # Front gable and pitched peach roof make the object unmistakably a dollhouse.
    gable = [(xf-.006,y0+.03,1.02),(xf-.006,y1-.03,1.02),(xf-.006,ym,apex)]
    panel('white front gable',gable,[(0,1,2)],white)
    rod('left roof edge',(xf+.002,y0+.015,1.02),(xf+.002,ym,apex),.018,peach)
    rod('right roof edge',(xf+.002,ym,apex),(xf+.002,y1-.015,1.02),.018,peach)
    rod('roof ridge',(xr,ym,apex),(xf+.012,ym,apex),.018,peach)
    # Thin roof planes extend to the rear wall.
    panel('left pitched roof',[(xr,y0,1.02),(xf,y0,1.02),(xf,ym,apex),(xr,ym,apex)],[(0,1,2,3)],peach)
    panel('right pitched roof',[(xr,ym,apex),(xf,ym,apex),(xf,y1,1.02),(xr,y1,1.02)],[(0,1,2,3)],peach)
    # Semicircle attic window and tiny sticker panel.
    for a in range(7):
        t0=math.pi*a/7; t1=math.pi*(a+1)/7
        rod('attic fanlight ray',(xf+.008,ym,1.20),(xf+.008,ym+.10*math.cos(t0),1.20+.10*math.sin(t0)),.004,blue)
    rod('attic fanlight sill',(xf+.008,ym-.105,1.20),(xf+.008,ym+.105,1.20),.006,blue)
    box('tiny attic sticker',xf+.007,xf+.013,y1-.22,y1-.08,1.18,1.31,pink,.004)

    # Pink-and-white balcony rails on the two main play floors.
    for z in (.38,.71):
        for ya,yb in ((y0+.02,y0+.19),(y1-.19,y1-.02)):
            rod('pink balcony top rail',(xf+.018,ya,z+.23),(xf+.018,yb,z+.23),.007,pink)
            rod('pink balcony bottom rail',(xf+.018,ya,z+.02),(xf+.018,yb,z+.02),.006,pink)
            for j in range(4):
                yy=ya+(yb-ya)*j/3; rod('pink balcony baluster',(xf+.018,yy,z+.03),(xf+.018,yy,z+.22),.004,pink)

    # Miniature furniture: bed, sofa, dining setting, kitchen and bath details.
    box('mini pink bed',xf-.17,xf-.045,y0+.09,ym-.04,.755,.825,pink,.014)
    box('mini cream mattress',xf-.18,xf-.035,y0+.10,ym-.05,.82,.858,cream,.012)
    box('mini pillow',xf-.19,xf-.025,y0+.12,y0+.24,.855,.895,cream,.015)
    box('mini pink sofa seat',xf-.16,xf-.045,ym+.08,y1-.08,.425,.505,pink,.018)
    box('mini pink sofa back',xf-.15,xf-.055,y1-.14,y1-.07,.49,.64,pink,.018)
    box('mini dining tabletop',xf-.18,xf-.05,ym-.12,ym+.11,.87,.89,cream,.008)
    for yy in (ym-.09,ym+.08): rod('mini table leg',(xf-.15,yy,.82),(xf-.15,yy,.87),.006,pine)
    box('mini lower kitchen',xf-.13,xf-.035,y0+.06,ym-.06,.10,.26,white,.006)
    box('mini kitchen counter',xf-.145,xf-.02,y0+.05,ym-.05,.26,.28,mint,.006)
    cyl('mini sink',(xf-.012,y0+.24,.286),.026,.008,silver,'X')
    box('mini bath tub',xf-.18,xf-.04,ym+.08,y1-.07,.11,.22,cream,.018)
    # A few miniature rugs help the rooms read at normal model scale.
    box('upper patterned rug',xf-.012,xf-.005,ym-.16,ym+.13,.735,.742,blush,.002)
    box('lower patterned rug',xf-.012,xf-.005,ym-.12,ym+.16,.405,.412,blue,.002)

    control=bpy.data.objects.new(P+'CONTROL',None); col.objects.link(control); control.empty_display_type='CUBE'; control.empty_display_size=.12
    control['identity']='Four-storey open-front dollhouse, not a cupboard or storage shelf'
    control['reference']='User photo supplied 2026-09-28'
    control['footprint_m']=[round(y1-y0,3),round(xf-xr,3)]; control['height_m']=apex

    # Dedicated close inspection scene; existing bedroom scenes inherit the same objects.
    name='59 | SLAAPKAMER 1 - photographed dollhouse'
    sc=bpy.data.scenes.get(name) or bpy.data.scenes.new(name)
    for child in list(sc.collection.children): sc.collection.children.unlink(child)
    for ob in list(sc.collection.objects): bpy.data.objects.remove(ob,do_unlink=True)
    sc.collection.children.link(col); sc.collection.children.link(bpy.data.collections['02 / Bedroom 1 finishes'])
    sc.render.engine='BLENDER_EEVEE'; sc.render.resolution_x=1200; sc.render.resolution_y=1100; sc.render.resolution_percentage=85
    sc.render.image_settings.file_format='PNG'; sc.view_settings.look='AgX - Medium High Contrast'
    sc.world=bpy.data.worlds.get(name+' world') or bpy.data.worlds.new(name+' world'); sc.world.use_nodes=True
    sc.world.node_tree.nodes['Background'].inputs[0].default_value=(.78,.84,.92,1); sc.world.node_tree.nodes['Background'].inputs[1].default_value=.25
    cd=bpy.data.cameras.new(name+' camera'); cam=bpy.data.objects.new(name+' camera',cd); sc.collection.objects.link(cam)
    cam.location=(5.78,1.73,F+1.12); target=Vector((3.12,1.74,F+.78)); cam.rotation_euler=(target-Vector(cam.location)).to_track_quat('-Z','Y').to_euler(); cd.lens=48; sc.camera=cam
    ld=bpy.data.lights.new(name+' softbox','AREA'); ld.energy=130; ld.size=1.0
    lo=bpy.data.objects.new(ld.name,ld); sc.collection.objects.link(lo); lo.location=(3.82,1.35,F+2.0); lo.rotation_euler=(target-Vector(lo.location)).to_track_quat('-Z','Y').to_euler()
    sc['reference_notes']='The former shelf-like proxy is the photographed multi-storey dollhouse. Footprint retained; detailed toy furniture is representative, not inventoried.'

    report={'identity':'dollhouse','not_a_cupboard':True,'storeys':4,'pitched_roof':True,'open_front':True,'pink_balconies':True,'miniature_rooms_furnished':True,'retained_footprint_m':[round(y1-y0,3),round(xf-xr,3)],'height_m':apex,'scene':name,'reference':'User photo supplied 2026-09-28'}
    (ROOT/'bedroom1_dollhouse_verification.json').write_text(json.dumps(report,indent=2))
    notes='SLAAPKAMER 1 POPPENHUIS: de eerdere kastachtige rek-proxy is vervangen door het gefotografeerde open poppenhuis met vier niveaus, zadeldak, perzik/houten kader, witte kamers, roze balkonhekjes en representatief miniatuurmeubilair. De bestaande voetafdruk en doorgang zijn behouden. Los speelgoed is vereenvoudigd; exacte speelgoedmaten zijn foto-inschattingen. Scene 59; bedroom1_dollhouse.py.\n'
    (ROOT/'BEDROOM1_DOLLHOUSE_NOTES.txt').write_text(notes)
    assert not any(o.name.startswith('Bedroom 1 / pine dollhouse') for o in bpy.data.objects)
    assert len([o for o in col.objects if o.name.startswith(P)]) >= 45
    return sc


if __name__=='__main__':
    main=ROOT/'Huis_Oude_Terelststraat_15.blend'; backup=ROOT/'Huis_before_bedroom1_dollhouse.blend'
    if main.exists() and not backup.exists(): shutil.copy2(main,backup)
    sc=update_bedroom1_dollhouse(); bpy.context.window.scene=sc
    bpy.ops.wm.save_as_mainfile(filepath=str(main)); sc.render.filepath=str(ROOT/'bedroom1_dollhouse.png'); bpy.ops.render.render(write_still=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(main)); print('SAVED: Bedroom 1 shelf proxy replaced by photographed dollhouse',flush=True)
