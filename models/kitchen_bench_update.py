"""User correction: cabinet-to-seat junction and bench/table to wall edge."""
import bpy
from mathutils import Vector

def update_kitchen_bench():
    F=2.41
    col=bpy.data.objects['Kitchen shaped corner bench seat'].users_collection[0]
    white=bpy.data.materials['Camber - premium white matt W1000 ST9']
    def bounds(o):
        vv=[o.matrix_basis@v.co for v in o.data.vertices]
        return [(min(v[i] for v in vv),max(v[i] for v in vv)) for i in range(3)]
    def remap(o,axis,lo,hi):
        a,b=bounds(o)[axis];inv=o.matrix_basis.inverted()
        for v in o.data.vertices:
            p=o.matrix_basis@v.co;p[axis]=lo+(p[axis]-a)*(hi-lo)/(b-a);v.co=inv@p
        o.data.update()
    def cube(name,x0,x1,y0,y1,z0,z1,mat):
        if name in bpy.data.objects:bpy.data.objects.remove(bpy.data.objects[name],do_unlink=True)
        mesh=bpy.data.meshes.new(name)
        verts=[(x,y,z) for z in (z0,z1) for y in (y0,y1) for x in (x0,x1)]
        mesh.from_pydata(verts,[],[(0,2,3,1),(4,5,7,6),(0,1,5,4),(2,6,7,3),(0,4,6,2),(1,3,7,5)])
        mesh.update();o=bpy.data.objects.new(name,mesh);col.objects.link(o);mesh.materials.append(mat)
        mod=o.modifiers.new('Soft cabinet edges','BEVEL');mod.width=.003;mod.segments=3
        return o
    cube('Kitchen bench junction - solid white block',.33,.964,9.90,10.65,F,F+.485,white)
    cube('Kitchen bench junction - raised cabinet',.33,.94,9.90,10.65,F+.485,F+.865,white)
    cube('Kitchen bench junction - short door',.943,.964,9.906,10.638,F+.485,F+.856,white)
    cube('Kitchen bench junction - handle',.972,.987,9.956,9.968,F+.59,F+.80,bpy.data.materials['Kitchen - champagne handles'])
    remap(bpy.data.objects['Kitchen long stone worktop'],1,6.67,10.65)
    seat=bpy.data.objects['Kitchen shaped corner bench seat'];inv=seat.matrix_basis.inverted()
    # Extend the straight end only; preserve the curved waist and rear section.
    for v in seat.data.vertices:
        p=seat.matrix_basis@v.co
        if p.y<9.27:p.y=8.640233333333+(p.y-8.97)*(9.27-8.640233333333)/(.30)
        if abs(p.x-1.0)<.001:p.x=.964
        v.co=inv@p
    seat.data.update()
    remap(bpy.data.objects['Kitchen bench side support'],1,8.67,10.50)
    remap(bpy.data.objects['Kitchen bench end support'],1,8.67,8.711)
    table=bpy.data.objects['Kitchen organic stone tabletop'];old=bounds(table)[1]
    remap(table,1,8.69,old[1])
    bpy.data.objects['Kitchen single white pedestal'].location.y-=.19
    seat['user_update']='Bench ends at wall edge y=8.640233 m; seat meets raised end cabinet at x=.964 m.'
    table['user_update']='Elongated towards bench end; front edge y=8.69 m.'

if __name__=='__main__':
    update_kitchen_bench()
