"""Replace procedural dragon with a packed transparent reference-derived decal."""
import bpy,json
from pathlib import Path
ROOT=Path(__file__).resolve().parent
P='Bedroom 1 / '
def update_bedroom1_dragon():
    removed=[]
    for ob in list(bpy.data.objects):
        if ob.name.startswith((P+'pink dragon flat wall decal',P+'dragon cream belly',P+'dragon small dark eye',P+'reference dragon decal')):
            removed.append(ob.name);bpy.data.objects.remove(ob,do_unlink=True)
    path=ROOT/'textures/bedroom1_pink_dragon.png'
    img=bpy.data.images.load(str(path),check_existing=True);img.name='Bedroom 1 - reference pink dragon';img.alpha_mode='STRAIGHT';img.pack()
    # Inspect alpha only; keep the generated asset intact and crop by UV coordinates.
    w,h=img.size;pixels=list(img.pixels);xs=[];ys=[];transparent=0
    for y in range(h):
        for x in range(w):
            a=pixels[4*(y*w+x)+3]
            if a>.1:xs.append(x);ys.append(y)
            if a<.01:transparent+=1
    assert transparent>w*h*.2,'Expected genuine transparent background'
    x0=max(0,min(xs)-4);x1=min(w,max(xs)+5);y0=max(0,min(ys)-4);y1=min(h,max(ys)+5)
    height=1.04;width=height*(x1-x0)/(y1-y0);cy=3.60;bottom=5.31+1.48
    verts=[(7.074,cy+width/2,bottom),(7.074,cy-width/2,bottom),(7.074,cy-width/2,bottom+height),(7.074,cy+width/2,bottom+height)]
    mesh=bpy.data.meshes.new(P+'reference dragon decal');mesh.from_pydata(verts,[],[(0,1,2,3)]);mesh.update()
    uv=mesh.uv_layers.new(name='DecalUV')
    for item,coord in zip(uv.data,[(x0/w,y0/h),(x1/w,y0/h),(x1/w,y1/h),(x0/w,y1/h)]):item.uv=coord
    mat=bpy.data.materials.get('Bedroom 1 - detailed dragon wall decal') or bpy.data.materials.new('Bedroom 1 - detailed dragon wall decal');mat.use_nodes=True
    nodes=mat.node_tree.nodes;nodes.clear();links=mat.node_tree.links
    tex=nodes.new('ShaderNodeTexImage');tex.image=img;tex.interpolation='Linear';tex.extension='CLIP'
    bs=nodes.new('ShaderNodeBsdfPrincipled');bs.inputs['Roughness'].default_value=.82;bs.inputs['Specular IOR Level'].default_value=.15
    transparent_bs=nodes.new('ShaderNodeBsdfTransparent');mix=nodes.new('ShaderNodeMixShader');out=nodes.new('ShaderNodeOutputMaterial')
    links.new(tex.outputs['Color'],bs.inputs['Base Color']);links.new(tex.outputs['Alpha'],mix.inputs[0]);links.new(transparent_bs.outputs[0],mix.inputs[1]);links.new(bs.outputs[0],mix.inputs[2]);links.new(mix.outputs[0],out.inputs['Surface'])
    mesh.materials.append(mat);ob=bpy.data.objects.new(P+'reference dragon decal',mesh);bpy.data.collections['02 / Bedroom 1 finishes'].objects.link(ob)
    ob['source']='User close-up 2026-09-26; imagegen background removal and glare cleanup';ob['dimensions_status']='Estimated 1.04 m height within existing decoration zone; artwork aspect from transparent image';ob['texture_packed']=True
    report={'removed_simplified_objects':len(removed),'image_size':[w,h],'transparent_pixels':transparent,'decal_size_m':[width,height],'texture_packed':bool(img.packed_file),'source':'User-supplied dragon close-up; reference-derived background removal, not a pixel-exact photographic extraction'}
    (ROOT/'bedroom1_dragon_verification.json').write_text(json.dumps(report,indent=2))
    notes='De eenvoudige roze draak is vervangen door een transparante referentietextuur op basis van de foto van 26 september: bloemen, sterren, witte contour, krulstaart en donkere stekels behouden. Vrijgemaakt met imagegen; kleine detailverschillen zijn mogelijk. Textuur ingepakt in het blend-bestand. Maat en positie geschat binnen de bestaande decoratiezone. Bron: bedroom1_dragon.py.'
    txt=bpy.data.texts.get('BEDROOM 1 - dragon decal') or bpy.data.texts.new('BEDROOM 1 - dragon decal');txt.clear();txt.write(notes)
    print('DRAGON DECAL VERIFIED',report,flush=True)
    return ob
def create_dragon_detail_view():
    from mathutils import Vector
    name='35 | SLAAPKAMER 1 - pink dragon detail'
    sc=bpy.data.scenes.get(name)
    if not sc:
        sc=bpy.data.scenes['28 | SLAAPKAMER 1 - tentbed and wardrobes'].copy();sc.name=name
        cam=sc.camera.copy();cam.data=cam.data.copy();cam.name='Bedroom 1 dragon detail camera';sc.collection.objects.link(cam);sc.camera=cam
    sc.camera.location=(7.068,3.60,7.31);sc.camera.rotation_euler=(Vector((7.074,3.60,7.31))-sc.camera.location).to_track_quat('-Z','Y').to_euler()
    sc.camera.data.type='ORTHO';sc.camera.data.ortho_scale=1.25;sc.camera.data.clip_start=.001
    sc.render.resolution_x=1000;sc.render.resolution_y=1200;sc.render.resolution_percentage=100;sc.cycles.samples=16
    return sc

if __name__=='__main__':
    import shutil
    main=ROOT/'Huis_Oude_Terelststraat_15.blend';backup=ROOT/'Huis_before_detailed_dragon.blend'
    if not backup.exists():shutil.copy2(main,backup)
    update_bedroom1_dragon();detail=create_dragon_detail_view()
    for name,filename in [('28 | SLAAPKAMER 1 - tentbed and wardrobes','bedroom1_tent.png'),(detail.name,'bedroom1_dragon_detail.png')]:
        sc=bpy.data.scenes[name];bpy.context.window.scene=sc;sc.cycles.samples=16;sc.render.resolution_percentage=75;sc.render.filepath=str(ROOT/filename)
        bpy.ops.render.render(write_still=True,scene=sc.name);sc.cycles.samples=28;sc.render.resolution_percentage=100
    bpy.context.window.scene=detail
    assert bpy.data.objects.get('Small bedroom / reference bear decal')
    bpy.ops.wm.save_as_mainfile(filepath=str(main))
