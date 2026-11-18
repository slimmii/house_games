"""Use scene geometry for the bathroom mirror, instead of Material Preview's HDRI."""
import bpy
from pathlib import Path

def update_bathroom_mirror_view(focus=True):
    # The physically reflective material is already correct. The studio HDRI in
    # Material Preview caused the outside-building reflection reported by user.
    m=bpy.data.materials['Bathroom - silver mirror']
    p=m.node_tree.nodes.get('Principled BSDF')
    assert p.inputs['Metallic'].default_value==1
    assert p.inputs['Transmission Weight'].default_value==0
    for scene in bpy.data.scenes:
        if 'BATHROOM' in scene.name or 'SMALL BEDROOM' in scene.name:
            scene.render.engine='CYCLES'
            scene.cycles.preview_samples=16
            scene.cycles.use_preview_denoising=True
    views=0
    for screen in bpy.data.screens:
        for area in screen.areas:
            for space in area.spaces:
                if space.type=='VIEW_3D':
                    space.shading.type='RENDERED'
                    space.shading.use_scene_world_render=True
                    space.shading.use_scene_lights_render=True
                    views+=1
    if focus:
        bpy.context.window.scene=bpy.data.scenes['17 | BATHROOM - bath and double vanity']
        for area in bpy.context.screen.areas:
            if area.type=='VIEW_3D':
                area.spaces.active.region_3d.view_perspective='CAMERA'
                area.spaces.active.overlay.show_overlays=False
    note='Bathroom mirror preview: Rendered mode uses the actual scene geometry and lights. Material Preview studio HDRI previously showed an outdoor reflection. Mirror material is opaque reflective metal, not a transparent pane or exterior image.'
    m['reflection_note']=note
    t=bpy.data.texts.get('BATHROOM - photo reconstruction notes')
    if t and 'MIRROR VIEW CORRECTION' not in t.as_string():t.write('\nMIRROR VIEW CORRECTION: '+note+'\n')
    print('MIRROR VIEW FIXED:',views,'saved 3D views use rendered scene reflections.',flush=True)

if __name__=='__main__':
    import shutil
    root=Path(__file__).resolve().parent
    main=root/'Huis_Oude_Terelststraat_15.blend'
    backup=root/'Huis_before_mirror_view_fix.blend'
    if not backup.exists():shutil.copy2(main,backup)
    update_bathroom_mirror_view()
    bpy.ops.wm.save_as_mainfile(filepath=str(main))
    print('SAVED: bathroom rendered view, with five-row shelf retained.',flush=True)
