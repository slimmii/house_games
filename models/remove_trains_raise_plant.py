"""Remove the name trains and raise the plant beneath Hedwig."""
import bpy, shutil, json
from pathlib import Path
from mathutils import Vector
R=Path(__file__).resolve().parent
main=R/'Huis_Oude_Terelststraat_15.blend'
backup=R/'Huis_before_removing_trains_raising_plant.blend'
if not backup.exists():shutil.copy2(main,backup)
removed=[]
for o in list(bpy.data.objects):
    if o.name.startswith('September29 / Train '):
        removed.append(o.name);bpy.data.objects.remove(o,do_unlink=True)
plant=[o for o in bpy.data.objects if o.name.startswith('Shelf plant / ')]
assert plant
# Planter mesh was authored in world coordinates. Its bottom is 3mm above
# the shelf; use that support datum to make this script safe to rerun.
pot=bpy.data.objects['Shelf plant / ceramic planter']
bottom=min((pot.matrix_world@v.co).z for v in pot.data.vertices)
delta=4.297+.003-bottom
for o in plant:o.location.z+=delta
scene=bpy.data.scenes['74 | CAMBER - Hedwig and wooden name trains']
scene.name='74 | CAMBER - Hedwig and plant'
bpy.context.window.scene=scene;bpy.context.view_layer.update()
dep=bpy.context.evaluated_depsgraph_get();pts=[]
for o in plant:
    e=o.evaluated_get(dep);me=e.to_mesh();pts.extend(e.matrix_world@v.co for v in me.vertices);e.to_mesh_clear()
top=max(p.z for p in pts)
# The shelf under Hedwig starts at 4.525. Lower the tallest leaves slightly
# only if needed, preserving the pot and the hanging vine.
if top>=4.518:
    # Scale all plant geometry about its support by a small uniform factor.
    from mathutils import Matrix
    pivot=Vector((6.735,3.395,4.297))
    factor=(4.515-4.297)/(top-4.297)
    transform=Matrix.Translation(pivot)@Matrix.Scale(factor,4)@Matrix.Translation(-pivot)
    for o in plant:o.matrix_world=transform@o.matrix_world
    top=4.515
assert top<4.525
assert not any(o.name.startswith('September29 / Train ') for o in bpy.data.objects)
scene.render.filepath=str(R/'camber_hedwig_plant.png')
bpy.ops.wm.save_as_mainfile(filepath=str(main))
bpy.ops.render.render(write_still=True)
print(json.dumps({'removed_train_parts':len(removed),'plant_shelf_z':4.297,'plant_top_z':top,'backup':str(backup)}))
