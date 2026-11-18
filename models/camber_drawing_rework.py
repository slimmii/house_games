"""Camber cabinet only, reconstructed from camber.pdf pp.5-12 and user renders.
S runs left-to-right in the front elevation; existing room/TV are preserved.
"""
import bpy,math,json,sys,shutil
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parent
P='Camber drawing / ';X=6.951;Y=.3006;F=2.41;L=8.297;H=2.579;T=.019

def rgb(h):return tuple((int(h[i:i+2],16)/255)**2.2 for i in (0,2,4))+(1,)
def mat(name,color,rough=.5):
 m=bpy.data.materials.get(P+name) or bpy.data.materials.new(P+name);m.use_nodes=True;m.diffuse_color=rgb(color)
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=rgb(color);p.inputs['Roughness'].default_value=rough;return m

def update_camber():
 c=bpy.data.collections['01 / Camber']
 preserved={o.name:(tuple(o.matrix_world),o.data.name if o.data else None) for o in bpy.data.objects if o not in list(c.objects) and not o.name.startswith(P)}
 for o in list(c.objects):
  if not o.name.startswith('TV '):bpy.data.objects.remove(o,do_unlink=True)
 for o in list(bpy.data.objects):
  if o.name.startswith(P):bpy.data.objects.remove(o,do_unlink=True)
 white=mat('premium white matt W1000 ST9','EEEDE8',.43);oak=mat('natural Casella oak H1385 ST40','B38C60',.48);acacia=mat('interior Acacia H1277 ST9','917354',.68);dark=mat('recessed shadows','39302A',.8)
 n=oak.node_tree.nodes;lk=oak.node_tree.links
 for nd in list(n):
  if nd.type not in ('BSDF_PRINCIPLED','OUTPUT_MATERIAL'):n.remove(nd)
 ge=n.new('ShaderNodeNewGeometry');mul=n.new('ShaderNodeVectorMath');mul.operation='MULTIPLY';mul.inputs[1].default_value=(19,45,1.6);lk.new(ge.outputs['Position'],mul.inputs[0]);no=n.new('ShaderNodeTexNoise');no.inputs['Scale'].default_value=3;no.inputs['Detail'].default_value=2;lk.new(mul.outputs[0],no.inputs[0]);ra=n.new('ShaderNodeValToRGB');ra.color_ramp.elements[0].color=rgb('96734F');ra.color_ramp.elements[1].color=rgb('C4A47D');lk.new(no.outputs['Fac'],ra.inputs[0]);lk.new(ra.outputs[0],n.get('Principled BSDF').inputs['Base Color'])
 def box(name,a,b,d0,d1,z0,z1,m=white,col=c,bev=.0007):
  xx=(X-d1,X-d0);yy=(Y+L-b,Y+L-a);zz=(F+z0,F+z1)
  vs=[(x,y,z) for z in zz for y in yy for x in xx];me=bpy.data.meshes.new(P+name);me.from_pydata(vs,[],[(0,2,3,1),(4,5,7,6),(0,1,5,4),(2,6,7,3),(0,4,6,2),(1,3,7,5)]);me.update();me.materials.append(m)
  ob=bpy.data.objects.new(P+name,me);col.objects.link(ob);ob['source']='camber.pdf 02.05.2025 pp.5-12';ob['elevation_s_mm']=[round(a*1000),round(b*1000)]
  if bev:mod=ob.modifiers.new('Panel edge radius','BEVEL');mod.width=bev;mod.segments=2
  return ob
 def carcass(name,a,b,depth,z0,z1,inside=acacia):
  box(name+' back',a,b,0,T,z0,z1,inside)
  for j,aa in enumerate((a,b-T)):
   if name=='A left full height cupboard' and j==1:
    box(name+' oak niche cheek',aa,aa+T,T,depth,z0,z1,oak)
   else:
    ob=box(name+' side',aa,aa+T,T,depth-T,z0,z1,inside);ob.data.materials.append(white);ob.data.polygons[3 if j==0 else 2].material_index=1
  for z in (z0,z1-T):box(name+' horizontal',a+T,b-T,T,depth-T,z,z+T,inside)
 def door(name,a,b,depth,z0,z1):return box(name,a+.0015,b-.0015,depth-T,depth,z0+.0015,z1-.0015)
 def cap(a,b,depth):box('61 mm top finishing strip',a,b,depth-T,depth,2.518,H)
 def niche(name,a,b,depth,z0,z1,clear_heights=None,wall=T):
  box(name+' oak back',a,b,0,T,z0,z1,oak)
  box(name+' left oak lining',a,a+wall,T,depth,z0,z1,oak);box(name+' right oak lining',b-wall,b,T,depth,z0,z1,oak)
  for z in (z0,z1-T):box(name+' oak bottom top',a+wall,b-wall,T,depth,z,z+T,oak)
  if clear_heights:
   z=z0+T
   for h in clear_heights[:-1]:
    z+=h;box(name+' 28 mm oak shelf',a+wall,b-wall,T,depth,z,z+.028,oak);z+=.028
 # A: 4061 mm floor run, 625 mm tall end and six equal bench drawers.
 carcass('A left full height cupboard',0,.625,.530,.070,2.518)
 door('A full height white door',0,.606,.530,.070,2.518);cap(0,.625,.530)
 box('A recessed plinth',0,4.061,.445,.458,0,.070)
 for i in range(6):
  a=.625+i*(4.061-.625)/6;b=.625+(i+1)*(4.061-.625)/6
  carcass('A bench drawer carcass '+str(i+1),a,b,.530,.070,.470)
  door('A bench drawer front '+str(i+1),a,b,.530,.089,.470)
 box('A 19 mm continuous oak seat',.625,4.061,0,.530,.470,.489,oak)
 # Six Tocca backing panels; narrow oak slats are a visual approximation of the profile.
 for i in range(6):
  a=.625+i*2.975/6;b=.625+(i+1)*2.975/6
  box('A Tocca backing panel '+str(i+1),a+.0005,b-.0005,.006,.024,.489,1.782,oak)
 for i in range(110):
  a=.625+i*2.975/110+.004;box('A Tocca vertical oak slat',a,a+.018,.024,.045,.489,1.782,oak,bev=.001)
 # B uppers: two pairs of doors, a two-compartment open niche, then one pair of doors.
 edges=[.625,1.472,2.319,2.752,3.600]
 for i,(a,b) in enumerate(zip(edges,edges[1:])):
  if i==2:
   niche('B upper two-cell open niche',a,b,.371,1.782,2.518,[(.736-2*T-.028)/2]*2)
  else:
   carcass('B upper closed cabinet '+str(i+1),a,b,.371,1.782,2.518)
   for j in range(2):door('B upper white door',a+(b-a)*j/2,a+(b-a)*(j+1)/2,.371,1.782,2.518)
 cap(.625,3.600,.371)
 led=mat('warm concealed LED','FFF0CF',.4);bs=led.node_tree.nodes.get('Principled BSDF');bs.inputs['Emission Color'].default_value=rgb('FFDDA1');bs.inputs['Emission Strength'].default_value=3
 box('B concealed LED below uppers',.645,3.580,.180,.192,1.777,1.780,led,bev=0)
 # Small book recess, with closed white doors above and below. Seat continues beneath it.
 a,b=3.600,4.061
 carcass('B book column lower cupboard',a,b,.391,.489,1.142)
 carcass('B book column upper cupboard',a,b,.391,1.635,2.518)
 door('B book column lower white door',a,b,.391,.489,1.142)
 door('B book column upper white door',a,b,.391,1.635,2.518)
 niche('B single book display recess',a,b,.391,1.142,1.635,wall=.0365)
 # 799 mm internal double-door tall cupboard, then 450 mm internal open tower.
 a,b=4.061,4.898
 carcass('B tall double cupboard',a,b,.391,.070,2.518)
 for j in range(2):door('B full height double door '+str(j+1),a+j*(b-a)/2,a+(j+1)*(b-a)/2,.391,.070,2.518)
 box('B recessed plinth',a,5.395,.306,.319,0,.070)
 a,b=4.898,5.395
 carcass('B four drawer pedestal',a,b,.391,.070,.950)
 dz=[.070,.306,.542,.746,.950]
 for i in range(4):door('B pedestal drawer '+str(i+1),a,b,.391,dz[i],dz[i+1])
 niche('B five-cell open oak tower',a,b,.391,.950,2.518,[.218,.388,.228,.228,.356],wall=.0235)
 cap(3.600,5.395,.391)
 # C: white TV top, four fronts and the 160 mm cable end panel.
 box('C recessed plinth',5.395,L,.406,.419,0,.070)
 span=(L-.160-5.395)/4
 for i in range(4):
  a=5.395+i*span;b=a+span;carcass('C low TV carcass '+str(i+1),a,b,.491,.070,.470)
  door('C low white front '+str(i+1),a,b,.491,.089,.470)
 box('C white cable end panel',L-.160,L,.472,.491,.070,.470)
 box('C white 19 mm TV top',5.395,L,0,.491,.470,.489)
 # C opbouw faces SIDEWAYS towards TV. Its front elevation is a closed white return.
 a,b=5.395,5.720
 box('C side opening front white return',a,b,.372,.391,.489,2.518)
 box('C side opening wall return',a,b,0,.019,.489,2.518)
 box('C side opening rear cheek',a,a+T,T,.372,.489,2.518)
 for z in (.489,2.499):box('C side opening bottom top',a+T,b,T,.372,z,z+T,oak)
 weights=[.347,.292,.388,.164,.356,.324];avail=2.029-2*T-5*.028;z=.489+T
 for h in weights[:-1]:
  z+=h/sum(weights)*avail;box('C side facing oak shelf',a+T,b,T,.372,z,z+.028,oak);z+=.028
 cap(a,b,.391)
 # Existing end fitting remains at the same position against the veranda.
 box('A existing veranda end fitting',-.0424,0,0,.530,0,H)
 # Preserve the existing TV. Only create the same stand-in if this is a clean full rebuild.
 if not bpy.data.objects.get('TV screen'):
  tv=box('temporary TV',L-2.11,L-.77,.040,.090,.655,1.425,dark);tv.name='TV screen'
  tv=box('temporary display',L-2.08,L-.80,.090,.094,.685,1.395,dark);tv.name='TV display'
  for yy in (1.00,1.88):
   tv=box('temporary foot',L-yy-.0225,L-yy+.0225,.05,.41,.50,.54,dark);tv.name='TV foot'
 # Separate neutral review studio; it is never linked into the house collections.
 studio=bpy.data.collections.get(P+'review studio only') or bpy.data.collections.new(P+'review studio only')
 wall=mat('review neutral backdrop','D1D0CA',.85);floor=mat('review neutral floor','A9A59D',.85)
 box('review backdrop',-.6,L+.6,-.16,-.04,0,3.1,wall,studio,0)
 box('review floor',-1,L+1,-.3,5.0,-.04,-.002,floor,studio,0)
 views=[]
 for number,title,loc,target,lens,size in [
  (51,'CAMBER - volledig vooraanzicht',(X-10,Y+L/2,F+1.32),(X,Y+L/2,F+1.32),50,(1900,780)),
  (52,'CAMBER - perspectief en zijvakken',(X-7.2,Y-1.8,F+2.2),(X-.2,Y+L/2,F+1.25),35,(1700,900))]:
  sc=bpy.data.scenes.get(f'{number} | {title}') or bpy.data.scenes.new(f'{number} | {title}')
  for col in list(sc.collection.children):sc.collection.children.unlink(col)
  sc.collection.children.link(c);sc.collection.children.link(studio)
  sc.render.engine='CYCLES';sc.cycles.device='CPU';sc.cycles.samples=32;sc.cycles.use_denoising=True;sc.render.threads_mode='FIXED';sc.render.threads=8;sc.render.resolution_x,sc.render.resolution_y=size;sc.render.resolution_percentage=100;sc.render.image_settings.file_format='PNG';sc.view_settings.view_transform='AgX'
  w=bpy.data.worlds.get(P+'neutral studio') or bpy.data.worlds.new(P+'neutral studio');w.use_nodes=True;w.node_tree.nodes.get('Background').inputs[0].default_value=(.7,.75,.8,1);w.node_tree.nodes.get('Background').inputs[1].default_value=.45;sc.world=w
  d=bpy.data.cameras.new(P+title);cam=bpy.data.objects.new(P+title,d);sc.collection.objects.link(cam);cam.location=loc;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();d.lens=lens;sc.camera=cam
  if number==51:d.type='ORTHO';d.ortho_scale=9.25
  for j,loc in enumerate(((X-3.5,Y+2,F+3.7),(X-3,Y+7,F+3.6))):
   ld=bpy.data.lights.new(P+'review softbox','AREA');ld.energy=350;ld.shape='DISK';ld.size=4;ob=bpy.data.objects.new(P+'review softbox',ld);sc.collection.objects.link(ob);ob.location=loc;ob.rotation_euler=(Vector((X-.2,loc[1],F+1.2))-ob.location).to_track_quat('-Z','Y').to_euler()
  views.append(sc)
 # Structural and scope checks: module/front counts, measured overall heights and unchanged room objects.
 assert len([o for o in c.objects if o.name.startswith(P+'A bench drawer front')])==6
 assert len([o for o in c.objects if o.name.startswith(P+'B upper white door')])==6
 assert len([o for o in c.objects if o.name.startswith(P+'B full height double door')])==2
 assert len([o for o in c.objects if o.name.startswith(P+'B pedestal drawer')])==4
 assert len([o for o in c.objects if o.name.startswith(P+'C low white front')])==4
 assert len([o for o in c.objects if o.name.startswith(P+'B five-cell open oak tower 28 mm oak shelf')])==4
 for name,state in preserved.items():
  ob=bpy.data.objects.get(name);assert ob and tuple(ob.matrix_world)==state[0] and (ob.data.name if ob.data else None)==state[1],name
 report={'source':'camber.pdf pp.5-12; user cabinet-only render references','overall_length_m':L,'height_m':H,'bench_and_tv_top_height_m':.489,'plinth_m':.070,'A_depth_m':.530,'B_upper_depth_m':.371,'B_tall_depth_m':.391,'C_depth_m':.491,'bench_drawer_fronts':6,'upper_white_doors':6,'upper_open_cells':2,'single_book_recess':True,'tall_white_doors':2,'tower_drawer_fronts':4,'tower_open_cells':5,'tv_fronts':4,'tv_top':'premium white matt','C_upper_opening_direction':'sideways towards TV; closed white front','unrelated_objects_preserved':len(preserved),'slat_profile':'visual estimate; six Tocca panels','module_fittings':'overall plan divisions retained; narrow fillers reconciled with clear dimensions'}
 (ROOT/'camber_drawing_verification.json').write_text(json.dumps(report,indent=2))
 notes='CAMBER CORRECTIE - camber.pdf 02.05.2025, pagina 5-12.\nAlleen de kast gewijzigd; kamer, tafel, stoelen, vloer, tuin en bestaande tv behouden. Totale lengte 8297 mm, hoogte 2579 mm, plint 70 mm, bank en tv-blad 489 mm. Zes bankfronten; bovenaan zes witte deuren en een open nis met twee vakken; kleine boekennis met gesloten witte vakken boven/onder; hoge kast met twee deuren; vier laden onder vijf open eikenvakken. Tv-blad wit. De opbouw bij de tv heeft een gesloten witte voorkant en opent zijdelings richting tv. Bestaande aansluiting aan veranda behouden. Buitenafwerking wit W1000 ST9 en eik H1385 ST40; interieur Acacia H1277 ST9. Zes Tocca panelen, lamelprofiel visueel benaderd. Buitenmaatvoering is leidend; kleine passtukken stemmen binnenmaten af op de totale tekening. Geen meubels of aankleding uit de renders overgenomen.\nScenes 51 vooraanzicht en 52 perspectief zijn aparte neutrale kaststudios; zij veranderen de kamer niet. Bron camber_drawing_rework.py. Reservekopie Huis_before_camber_drawing_rework.blend.\n'
 tx=bpy.data.texts.get('CAMBER - drawing correction') or bpy.data.texts.new('CAMBER - drawing correction');tx.clear();tx.write(notes);(ROOT/'CAMBER_DRAWING_NOTES.txt').write_text(notes)
 print('CAMBER VERIFIED',json.dumps(report),flush=True);return views

if __name__=='__main__':
 main=ROOT/'Huis_Oude_Terelststraat_15.blend';backup=ROOT/'Huis_before_camber_drawing_rework.blend'
 if not backup.exists():shutil.copy2(main,backup)
 views=update_camber();bpy.context.window.scene=views[0]
 for screen in bpy.data.screens:
  for a in screen.areas:
   if a.type=='VIEW_3D':a.spaces.active.region_3d.view_perspective='CAMERA';a.spaces.active.shading.type='MATERIAL';a.spaces.active.overlay.show_overlays=False
 bpy.ops.wm.save_as_mainfile(filepath=str(main))
 for sc,name in zip(views,['camber_corrected_front.png','camber_corrected_perspective.png']):
  sc.render.filepath=str(ROOT/name);bpy.ops.render.render(write_still=True,scene=sc.name)
 bpy.context.window.scene=views[0];bpy.ops.wm.save_as_mainfile(filepath=str(main))
