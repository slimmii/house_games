# User sketch: cabinet 76 x 39 x 181 cm; 68.5 cm clear width; 33 cm square cubbies.
# Table 118 x 57 x 51 cm; front apron 21 cm high. Coordinates remain editable.
v=parts[1]['Furniture']
# The cabinet sits in the 41.5 cm deep recess beneath the living/veranda
# beam. Its living-side face aligns with the recess edge farthest from the
# garden window; it does not sit against the right-hand side wall.
# Shifted 5 cm towards the living side: the former x max 6.46 m overlapped
# the retained masonry pier beginning at x 6.451 m.
xa,xb=5.65,6.41
ya=8.640233333333
yb=ya+.39
for x0,x1 in [(xa,xa+.0375),(xb-.0375,xb)]:
    span('Veranda white shelving side',x0,x1,ya,yb,F1+.08,F1+1.81,white,v,.003)
for z0,z1 in [(.08,.1175),(.4475,.4665),(.7965,.8155),(1.1455,1.1705),(1.7725,1.81)]:
    span('Veranda white shelving shelf',xa+.0375,xb-.0375,ya,yb,F1+z0,F1+z1,white,v,.003)
for z0,z1 in [(.1175,.4475),(.4665,.7965),(.8155,1.1455)]:
    span('Veranda shelving central divider',xa+.3675,xa+.3925,ya,yb,F1+z0,F1+z1,white,v,.002)
for xx in [xa+.08,xb-.08]:
    for yy in [ya+.07,yb-.07]:
        cylinder('Veranda shelving oak foot',(xx,yy,F1+.04),.025,.08,oak,v,16)
# Four metal pull-out bins in the lower two rows, as in the photograph.
steel=material('Veranda - satin galvanized metal bins','#9CA4A7',.36,.82)
for xx in [xa+.0435,xa+.3985]:
    for zz in [.126,.475]:
        width=.318;depth=.356;h=.305;t=.002
        span('Veranda metal bin bottom',xx,xx+width,ya+.02,ya+.02+depth,F1+zz,F1+zz+t,steel,v)
        for a,b in [(xx,xx+t),(xx+width-t,xx+width)]:
            span('Veranda metal bin side',a,b,ya+.022,ya+.02+depth,F1+zz,F1+zz+h,steel,v)
        span('Veranda metal bin back',xx+t,xx+width-t,ya+.018+depth,ya+.02+depth,F1+zz,F1+zz+h,steel,v)
        front=span('Veranda metal bin front - round pull hole',xx,xx+width,ya+.018,ya+.022,F1+zz,F1+zz+h,steel,v)
        hx=xx+width/2;hz=F1+zz+h-.064;hy=ya+.020
        cutter=cylinder('Temporary round bin hole',(hx,hy,hz),.018,.08,steel,v,48);cutter.rotation_euler.x=math.pi/2
        bpy.context.view_layer.update()
        mod=front.modifiers.new('Round finger pull - 36 mm','BOOLEAN');mod.object=cutter;mod.operation='DIFFERENCE'
        bpy.context.view_layer.objects.active=front;bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cutter,do_unlink=True)
        bpy.ops.mesh.primitive_torus_add(major_radius=.0195,minor_radius=.0015,major_segments=48,minor_segments=8,location=(hx,ya+.017,hz),rotation=(math.pi/2,0,0))
        rim=bpy.context.object;rim.name='Veranda metal bin rolled pull-hole rim';rim.data.materials.append(steel);move(rim,v)
        front['pull_hole_diameter_m']=.036;front['pull_hole_size_status']='Estimated; user specified round hole without diameter'
# Low play table: overall 118 x 57 x 51 cm, front apron 21 cm high.
tx1=xa
tx0=tx1-1.18
ty0,ty1=8.59,9.16
span('Veranda play table top',tx0+.025,tx1-.025,ty0+.02,ty1-.02,F1+.46,F1+.48,white,v,.004)
for a,b in [(tx0,tx0+.025),(tx1-.025,tx1)]:
    span('Veranda play table slab leg',a,b,ty0,ty1,F1,F1+.51,white,v,.003)
span('Veranda play table front apron 21 cm',tx0+.025,tx1-.025,ty0,ty0+.02,F1+.30,F1+.51,white,v,.003)
span('Veranda play table rear rim',tx0+.025,tx1-.025,ty1-.02,ty1,F1+.48,F1+.51,white,v,.003)
