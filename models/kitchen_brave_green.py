"""Kitchen wall paint from Colora's published WE M198 Brave Green RGB swatch."""
import bpy,json
from mathutils import Vector
from pathlib import Path
ROOT=Path(__file__).resolve().parent
URL='https://colora.be/nl/kleuren/we-m198-brave-green'
HEX='74846D'
P='Kitchen paint / '

def update_kitchen_brave_green():
    bpy.context.window.scene=bpy.data.scenes['01 | HOUSE - exterior']
    for ob in list(bpy.data.objects):
        if ob.name.startswith(P):bpy.data.objects.remove(ob,do_unlink=True)
    name='01 / Kitchen wall paint';old=bpy.data.collections.get(name)
    if old:bpy.data.collections.remove(old)
    col=bpy.data.collections.new(name);bpy.data.collections['01 | FIRST - 2021 + Camber 2025'].children.link(col)
    bpy.data.collections['EXPLODED source 1 - cutaway'].children.link(col)
    for sc in bpy.data.scenes:
        if '01 / Fittings' in sc.collection.children:sc.collection.children.link(col)
    def linear(s):return s/12.92 if s<=.04045 else ((s+.055)/1.055)**2.4
    rgba=tuple(linear(int(HEX[i:i+2],16)/255) for i in (0,2,4))+(1,)
    m=bpy.data.materials.get('Kitchen walls - Colora WE M198 Brave Green') or bpy.data.materials.new('Kitchen walls - Colora WE M198 Brave Green')
    m.use_nodes=True;m.diffuse_color=rgba;bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=rgba;bs.inputs['Roughness'].default_value=.86
    m['manufacturer']='BOSS paints / Colora';m['color_code']='WE M198';m['color_name']='Brave Green';m['published_srgb_hex']='#'+HEX;m['source_url']=URL
    # Thin paint faces follow actual masonry, clipped to this room only.
    # This preserves shared facade/partition materials outside the kitchen.
    def clip(points,axis,value,keep_above):
        if not points:return []
        out=[]
        for a,b in zip(points,points[1:]+points[:1]):
            da=(a[axis]-value)*(1 if keep_above else -1);db=(b[axis]-value)*(1 if keep_above else -1)
            ina=da>=-1e-8;inb=db>=-1e-8
            if ina:out.append(a)
            if ina!=inb:out.append(a+(b-a)*(da/(da-db)))
        return out
    bounds=[(0,.295,True),(0,2.823,False),(1,6.539,True),(1,10.685,False),(2,2.412,True),(2,5.071,False)]
    records=[]
    for cn in ('01 / Walls left','01 / Walls right','01 / Walls rear','01 / Partitions'):
        for source in list(bpy.data.collections[cn].objects):
            if source.type!='MESH':continue
            vs=[];faces=[]
            for poly in source.data.polygons:
                material=source.data.materials[poly.material_index] if source.data.materials else None
                if not material or material.name!='Warm white plaster':continue
                normal=(source.matrix_world.to_3x3().inverted().transposed()@poly.normal).normalized()
                if abs(normal.z)>.2:continue
                points=[source.matrix_world@source.data.vertices[i].co for i in poly.vertices]
                for axis,value,above in bounds:points=clip(points,axis,value,above)
                if len(points)<3:continue
                area=sum((points[i]-points[0]).cross(points[i+1]-points[0]).length/2 for i in range(1,len(points)-1))
                if area<.00001:continue
                c=sum(points,Vector())/len(points)
                inward=(normal.x>.5 and c.x<.65) or (normal.x<-.5 and c.x>2.5) or (normal.y<-.5 and c.y>10.4) or (normal.y>.5 and c.y<6.9)
                if not inward:continue
                start=len(vs);vs += [tuple(p+normal*.0015) for p in points];faces.append(tuple(range(start,len(vs))))
            if not faces:continue
            mesh=bpy.data.meshes.new(P+source.name);mesh.from_pydata(vs,[],faces);mesh.update();mesh.materials.append(m)
            ob=bpy.data.objects.new(P+source.name,mesh);col.objects.link(ob);ob['paint_source_wall']=source.name
            records.append({'wall':source.name,'painted_faces':len(faces)})
    assert len(records)>=4,records
    # User-confirmed separate beige/white backsplash beneath the upper cabinets.
    backsplash_name='Kitchen backsplash - original warm beige white'
    backsplash=bpy.data.materials.get(backsplash_name)
    if not backsplash:
        backsplash=bpy.data.materials['Warm white plaster'].copy();backsplash.name=backsplash_name
    backsplash['finish']='Separate kitchen backsplash; original beige/white colour, not wall paint'
    def panel(name,x0,x1,y0,y1,z0,z1):
        verts=[(x,y,z) for z in (z0,z1) for y in (y0,y1) for x in (x0,x1)]
        faces=[(0,2,3,1),(4,5,7,6),(0,1,5,4),(2,6,7,3),(0,4,6,2),(1,3,7,5)]
        mesh=bpy.data.meshes.new(P+name);mesh.from_pydata(verts,[],faces);mesh.update();mesh.materials.append(backsplash)
        ob=bpy.data.objects.new(P+name,mesh);col.objects.link(ob);ob['finish_role']='beige/white backsplash'
    panel('long beige white backsplash',.333,.344,6.54,9.894,3.240,3.990)
    panel('sink beige white backsplash',.344,2.179,6.542,6.553,3.240,3.990)
    col['color']='Colora WE M198 Brave Green';col['published_srgb_hex']='#'+HEX;col['source_url']=URL
    report={'paint':'WE M198 Brave Green','manufacturer':'Colora / BOSS paints','source_url':URL,'published_srgb_hex':'#'+HEX,'source_field':'props.pageProps.color.rgb in official page HTML, read 2026-09-24','wall_objects':records,'cabinet_and_stone_materials_unchanged':True,'backsplash':'Original warm beige/white beneath upper cabinets on both runs'}
    (ROOT/'kitchen_brave_green_verification.json').write_text(json.dumps(report,indent=2))
    notes='''KEUKEN — WE M198 Brave Green van Colora / BOSS paints.
Bron: https://colora.be/nl/kleuren/we-m198-brave-green
De officiële pagina publiceert RGB #74846D in props.pageProps.color.rgb. Deze sRGB-kleur is naar lineaire Blender-waarden omgerekend en als matte muurverf toegepast op de keukenwanden.
De verfvlakken volgen de bestaande binnenwandgeometrie en zijn tot de keuken begrensd. Kasten, terrazzo, raamprofielen, vloeren en aangrenzende kamers behouden hun materialen. De achterwand onder de bovenkasten blijft apart beige/wit in de oorspronkelijke kleur, zowel achter het kookgedeelte als de spoelbak. De uiteindelijke render wordt mede bepaald door de scèneverlichting.
Scenes 05 en 06 tonen de twee keukenrichtingen. Bron: kitchen_brave_green.py. Reservekopie: Huis_before_kitchen_brave_green.blend.
'''
    text=bpy.data.texts.get('KEUKEN - Brave Green notes') or bpy.data.texts.new('KEUKEN - Brave Green notes');text.clear();text.write(notes);(ROOT/'KITCHEN_BRAVE_GREEN_NOTES.txt').write_text(notes)
    start=bpy.data.texts.get('START HERE - model assumptions')
    if start:start.clear();start.write((ROOT/'MODEL_NOTES.txt').read_text())
    print('KITCHEN BRAVE GREEN:',json.dumps(records),flush=True)
    return [bpy.data.scenes['05 | KITCHEN - shaped table and bench'],bpy.data.scenes['06 | KITCHEN - cabinets and appliances']]

if __name__=='__main__':
    import shutil
    main=ROOT/'Huis_Oude_Terelststraat_15.blend';backup=ROOT/'Huis_before_kitchen_brave_green.blend'
    if not backup.exists():shutil.copy2(main,backup)
    scenes=update_kitchen_brave_green();bpy.context.window.scene=scenes[0];bpy.ops.wm.save_as_mainfile(filepath=str(main))
    for sc,filename in zip(scenes,['kitchen_table_bench.png','kitchen_cabinets.png']):
        bpy.context.window.scene=sc;sc.cycles.samples=12;sc.cycles.max_bounces=6;sc.cycles.use_denoising=True;sc.render.resolution_percentage=65;sc.render.threads_mode='FIXED';sc.render.threads=8
        sc.render.filepath=str(ROOT/filename);bpy.ops.render.render(write_still=True,scene=sc.name)
        sc.cycles.samples=32;sc.cycles.max_bounces=8;sc.render.resolution_percentage=100
    bpy.context.window.scene=scenes[0];bpy.ops.wm.save_as_mainfile(filepath=str(main))
