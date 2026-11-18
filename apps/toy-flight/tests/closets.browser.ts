/** Visual smoke against npm run dev; screenshots remain in ignored test-results. */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1280,height:900}});
const errors:string[]=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('console',msg=>{if(msg.type()==='warning'||msg.type()==='error')console.log(msg.text());});
await mkdir('test-results/closets',{recursive:true});
try{
 await page.goto((process.env.GAME_URL??'http://127.0.0.1:5173')+'/tests/closets-review.html');
 await page.waitForFunction(()=>Boolean((window as any).reviewReady),{},{timeout:180000});
 const diagnostics=await page.evaluate(()=>(window as any).closetReview.diagnostics);
 console.log(JSON.stringify(diagnostics,null,2));
 const entries=await page.evaluate(()=>(window as any).closetReview.entries) as {id:string;label:string;unitId:string;kind:string}[];
 const examples=[
  ['kitchen','kitchen-base'],['kitchen-upper','kitchen-upper'],['camber-drawer','camber-a-bench'],
  ['bathroom','bathroom-vanity'],['laundry','laundry-tower'],['hall','hall-tall'],
  ['bedroom1','bedroom1-rear-wardrobe'],['bedroom1-entry','bedroom1-entry-wardrobe'],
  ['bedroom2','bedroom2-wardrobe'],['bedroom3','small-bedroom-cubes'],
  ['craft-desk','living-craft-desk'],
 ];
 const fixedViews:Record<string,{
  camera:number[];target:number[];fov:number;openFraction?:number;id?:string;openOverrides?:Record<string,number>;
 }>={
  // These two large Bedroom 1 units are occluded by the bunk and room walls from
  // the generic camera. Keep fixed indoor views so their complete production
  // context remains useful during visual review.
  bedroom1:{camera:[15.02,20.7,-7.3],target:[15.02,20.1,-13.25],fov:108},
  'bedroom1-entry':{camera:[14.6,19.28,-7.7],target:[12.03,19.28,-6.84],fov:120,openFraction:.7},
  bedroom2:{
   id:'closet_123',camera:[16.16,20,-21],target:[16.16,19.7,-16.8],fov:105,
   openOverrides:{closet_124:0,closet_100:1,closet_101:1},
  },
  bedroom3:{camera:[2,20.5,-5.1],target:[2,17.6,-9],fov:75},
 };
 for(const [label,unit] of examples){
  const entry=entries.find(d=>d.unitId.startsWith(unit));assert.ok(entry,unit);
  for(const fraction of [0,1]){
   const fixed=fixedViews[label];
   if(fixed){
    const shownFraction=fraction?(fixed.openFraction??1):0;
    const overrides=fraction?(fixed.openOverrides??{}):{};
    await page.evaluate(({id,fraction,camera,target,fov,overrides})=>(window as any).closetReview.fixed(id,fraction,camera,target,fov,overrides),{
     id:fixed.id??entry.id,fraction:shownFraction,camera:fixed.camera,target:fixed.target,fov:fixed.fov,overrides,
    });
   }else{
    await page.evaluate(({id,fraction})=>(window as any).closetReview.show(id,fraction),{id:entry.id,fraction});
   }
   await page.screenshot({path:`test-results/closets/${label}-${fraction?'open':'closed'}.png`});
  }
 }
 const entry=entries.find(d=>d.unitId==='bedroom1-entry-wardrobe');assert.ok(entry);
 await page.evaluate(({id})=>(window as any).closetReview.fixed(id,.7,[14.6,17.35,-7.7],[12.03,17.2,-6.84],82),{id:entry.id});
 await page.screenshot({path:'test-results/closets/bedroom1-entry-drawers-open.png'});
 await writeFile('test-results/closets/diagnostics.json',JSON.stringify({diagnostics,errors},null,2));
 assert.equal(diagnostics.missingFronts.length,0,'all authored fronts must be found');
 assert.equal(diagnostics.missingAttachments.length,0,'all moving attachments must be found');
 assert.deepEqual(errors,[]);
 console.log('Closet browser visual smoke passed.');
}finally{await browser.close();}
