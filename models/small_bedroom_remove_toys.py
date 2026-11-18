"""Remove loose toys, plush animals and doll/play accessories from the bedroom."""
import bpy,shutil
from pathlib import Path
root=Path(__file__).resolve().parent
main=root/'Huis_Oude_Terelststraat_15.blend'
backup=root/'Huis_before_bedroom_toy_removal.blend'
if not backup.exists():shutil.copy2(main,backup)
col=bpy.data.collections['02 / Small bedroom furniture']
prefix='Small bedroom / '
parts=('white rabbit','rabbit ','purple yellow toy','toy yellow face','purple toy','blue dinosaur','dinosaur ','yellow purple bear','small red doll','doll face','styling doll','doll cot','little picture book')
removed=[]
for o in list(col.objects):
    if o.name.startswith(tuple(prefix+p for p in parts)):
        removed.append(o.name);bpy.data.objects.remove(o,do_unlink=True)
assert not any(o.name.startswith(tuple(prefix+p for p in parts)) for o in col.objects)
assert col.get('shelf_rows')==5
assert len([o for o in col.objects if o.name.startswith(prefix+'sofa seat cushion')])==2
col['toy_status']='Toys, stuffed animals, styling doll head, doll cot and its play accessories removed at user request.'
notes_path=root/'SMALL_BEDROOM_NOTES.txt'
s=notes_path.read_text().replace('witte schommelstoel en klein poppenbedje/boekenbak nabij deur.','witte schommelstoel. Speelgoed, knuffels, poppenbedje en bijbehorende speelaccessoires zijn op verzoek verwijderd.').replace('teddy-muursticker, zachte knuffels, stoffering','teddy-muursticker, stoffering').replace('Speelgoed vereenvoudigd.','Speelgoed en knuffels volledig verwijderd op verzoek.')
notes_path.write_text(s)
t=bpy.data.texts.get('SMALL BEDROOM - photo reconstruction notes')
if t:t.clear();t.write(s)
views=[('21 | SMALL BEDROOM - photo reconstruction','small_bedroom_view.png'),('22 | SMALL BEDROOM - sofa and rocking chair','small_bedroom_seating.png'),('23 | SMALL BEDROOM - complete overhead','small_bedroom_overhead.png')]
bpy.context.window.scene=bpy.data.scenes[views[0][0]]
bpy.ops.wm.save_as_mainfile(filepath=str(main))
print('REMOVED',len(removed),'toy and play-accessory objects; five-row shelf retained.',flush=True)
for name,filename in views:
    sc=bpy.data.scenes[name];bpy.context.window.scene=sc
    previous=(sc.cycles.samples,sc.cycles.max_bounces,sc.render.resolution_percentage)
    sc.cycles.samples=12;sc.cycles.max_bounces=6;sc.render.resolution_percentage=70
    sc.render.filepath=str(root/filename);sc.render.image_settings.file_format='PNG'
    print('RENDERING',filename,flush=True)
    bpy.ops.render.render(write_still=True,scene=sc.name)
    sc.cycles.samples,sc.cycles.max_bounces,sc.render.resolution_percentage=previous
bpy.context.window.scene=bpy.data.scenes[views[0][0]]
bpy.ops.wm.save_as_mainfile(filepath=str(main))
print('TOY REMOVAL COMPLETE',flush=True)
