"""Apply the user's five-row shelf correction to the existing furnished house."""
import bpy, shutil
from pathlib import Path
F=5.31
root=Path(__file__).resolve().parent
main=root/'Huis_Oude_Terelststraat_15.blend'
backup=root/'Huis_before_shelf_five_rows.blend'
if not backup.exists():shutil.copy2(main,backup)
col=bpy.data.collections['02 / Small bedroom furniture']
prefix='Small bedroom / '
def zs(o):return [v.co.z for v in o.data.vertices]
def copy_up(o):
    n=o.copy();n.data=o.data.copy();col.objects.link(n)
    for v in n.data.vertices:v.co.z+=.35
    return n
if col.get('shelf_rows')!=5:
    uprights=[o for o in col.objects if o.name.startswith((prefix+'KALLAX outer upright',prefix+'KALLAX vertical divider'))]
    assert len(uprights)==5
    for o in uprights:
        for v in o.data.vertices:
            if v.co.z>F+1.44:v.co.z+=.35
    tops=[o for o in col.objects if o.name.startswith(prefix+'KALLAX outer horizontal') and min(zs(o))>F+1.4]
    assert len(tops)==1
    for v in tops[0].data.vertices:v.co.z+=.35
    shelves=[o for o in col.objects if o.name.startswith(prefix+'KALLAX shelf')]
    assert len(shelves)==3
    copy_up(max(shelves,key=lambda o:max(zs(o))))
    bins=[o for o in col.objects if o.name.startswith(prefix+'fabric bin') and max(zs(o))>F+1.38]
    assert len(bins)==20,len(bins)
    for o in bins:copy_up(o)
    col['shelf_rows']=5
    col['shelf_columns']=4
    col['shelf_height_status']='Five rows confirmed by user; estimated overall height 1.82 m.'
assert len([o for o in col.objects if o.name.startswith(prefix+'KALLAX shelf')])==4
assert len([o for o in col.objects if o.name.startswith(prefix+'fabric bin front')])==16
note_path=root/'SMALL_BEDROOM_NOTES.txt'
notes=note_path.read_text()
old='Meubelmaten en precieze typen zijn geschat. Vakkenkast gebaseerd op KALLAX 147 x 147 x 39 cm (IKEA België https://www.ikea.com/be/en/p/kallax-shelving-unit-white-30275861/), geen bevestigde identificatie.'
new='Gebruiker bevestigt dat de vakkenkast vijf vakken hoog is; vier kolommen behouden. Geschatte buitenmaat nu 147 cm breed x 182 cm hoog x 39 cm diep, met één extra bovenste rij witte bakken. KALLAX-achtige vakverhoudingen, geen bevestigde productidentificatie. De overige meubelmaten en precieze typen zijn geschat.'
notes=notes.replace(old,new);note_path.write_text(notes)
t=bpy.data.texts.get('SMALL BEDROOM - photo reconstruction notes')
if t:t.clear();t.write(notes)
views=[('21 | SMALL BEDROOM - photo reconstruction','small_bedroom_view.png'),('22 | SMALL BEDROOM - sofa and rocking chair','small_bedroom_seating.png'),('23 | SMALL BEDROOM - complete overhead','small_bedroom_overhead.png')]
bpy.context.window.scene=bpy.data.scenes[views[0][0]]
bpy.ops.wm.save_as_mainfile(filepath=str(main))
print('SAVED: five rows, four columns; 1.82 m estimated height; four inner shelves and 16 bins.',flush=True)
for name,filename in views:
    s=bpy.data.scenes[name];bpy.context.window.scene=s
    samples=s.cycles.samples;s.cycles.samples=16
    s.render.filepath=str(root/filename);s.render.image_settings.file_format='PNG'
    print('RENDERING',filename,flush=True)
    bpy.ops.render.render(write_still=True,scene=s.name)
    s.cycles.samples=samples
bpy.context.window.scene=bpy.data.scenes[views[0][0]]
bpy.ops.wm.save_as_mainfile(filepath=str(main))
print('FIVE ROW CORRECTION COMPLETE',flush=True)
