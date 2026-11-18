"""Correct the flat first-floor stair-door wall to white plaster.

The curved stair enclosure remains brick. This correction follows the user's
viewport markup supplied 2026-09-28.
"""
import bpy, json
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def update_stair_flat_wall_white():
    plaster = bpy.data.materials['Warm white plaster']
    changed = []
    # These four traced wall pieces form the straight wall on both sides of the
    # 80 cm stair door. Curved pieces start at source masonry 042.
    for number in range(38, 42):
        ob = bpy.data.objects.get(f'first / source masonry {number:03d}')
        if not ob:
            continue
        slot = next((i for i, material in enumerate(ob.data.materials) if material == plaster), None)
        if slot is None:
            slot = len(ob.data.materials); ob.data.materials.append(plaster)
        for face in ob.data.polygons:
            face.material_index = slot
        ob['finish_correction'] = 'White plaster; user markup 2026-09-28. Curved stair wall remains brick.'
        changed.append(ob.name)
    lintel = bpy.data.objects.get('Stair photo / brick lintel above door')
    if lintel:
        if plaster.name not in lintel.data.materials:
            lintel.data.materials.append(plaster)
        slot = list(lintel.data.materials).index(plaster)
        for face in lintel.data.polygons:
            face.material_index = slot
        lintel.name = 'Stair photo / white plaster lintel above door'
        lintel['finish_correction'] = 'White plaster continuous with straight wall.'
        changed.append(lintel.name)
    report = {
        'white_flat_wall_objects': changed,
        'curved_stair_objects_start_at': 'first / source masonry 042',
        'curved_stair_finish_preserved': 'brick',
        'source': 'User viewport markup 2026-09-28'
    }
    (ROOT/'stair_flat_wall_white_verification.json').write_text(json.dumps(report, indent=2))
    notes = 'STRAIGHT STAIR-DOOR WALL FINISH: the flat first-floor wall and door lintel are white plaster per user markup of 2026-09-28. The adjoining curved stair enclosure remains brick. Source: stair_flat_wall_white.py.\n'
    (ROOT/'STAIR_FLAT_WALL_WHITE_NOTES.txt').write_text(notes)
    return bpy.data.scenes.get('09 | STAIR - brick return and cream door')


if __name__ == '__main__':
    import shutil
    main = ROOT/'Huis_Oude_Terelststraat_15.blend'; backup = ROOT/'Huis_before_stair_flat_wall_white.blend'
    if main.exists() and not backup.exists(): shutil.copy2(main, backup)
    scene = update_stair_flat_wall_white(); bpy.context.window.scene = scene
    scene.render.filepath = str(ROOT/'stair_white_flat_wall.png')
    bpy.ops.wm.save_as_mainfile(filepath=str(main)); bpy.ops.render.render(write_still=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(main))
    print('SAVED: flat stair-door wall white; curved stair enclosure remains brick', flush=True)
