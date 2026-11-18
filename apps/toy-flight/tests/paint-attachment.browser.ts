/** Focused production-house visual and geometry regression against npm run dev. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import sharp from 'sharp';

async function changedPixels(visible:Buffer,hidden:Buffer,screen:{x:number;y:number}):Promise<{pixels:number;difference:number}> {
 const left=Math.max(0,Math.min(1199,Math.round(screen.x)-40));
 const top=Math.max(0,Math.min(819,Math.round(screen.y)-40));
 const [a,b]=await Promise.all([
  sharp(visible).extract({left,top,width:80,height:80}).removeAlpha().raw().toBuffer(),
  sharp(hidden).extract({left,top,width:80,height:80}).removeAlpha().raw().toBuffer(),
 ]);
 let pixels=0,difference=0;
 for(let offset=0;offset<a.length;offset+=3){
  const delta=Math.abs(a[offset]-b[offset])+Math.abs(a[offset+1]-b[offset+1])+Math.abs(a[offset+2]-b[offset+2]);
  if(delta>12)pixels++;
  difference+=delta;
 }
 return {pixels,difference};
}

const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1280,height:900}}),errors:string[]=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('console',message=>{if(message.type()==='warning'||message.type()==='error')console.log(message.text());});
const output='test-results/paint-attachments';await mkdir(output,{recursive:true});
const results:unknown[]=[];
try{
 await page.goto((process.env.GAME_URL??'http://127.0.0.1:5173')+'/tests/paint-attachment-review.html');
 await page.waitForFunction(()=>Boolean((window as any).reviewReady),{},{timeout:180000});
 for(const key of ['room-hinge','cupboard-hinge','drawer','sliding','garage-panel'])for(const fraction of [0,.5,1]){
  const result=await page.evaluate(({key,fraction})=>(window as any).paintReview.show(key,fraction),{key,fraction}) as {error:number;screen:{x:number;y:number};assemblyMeshes:number};
  assert.ok(result.error<5e-5,`${key} ${fraction}: splat center slipped by ${result.error}`);
  assert.ok(result.assemblyMeshes>0,`${key}: selected production assembly has no visible meshes`);
  const path=`${output}/${key}-${fraction===0?'closed':fraction===1?'open':'partial'}.png`;
  const visible=await page.screenshot({path});
  await page.evaluate(()=>(window as any).paintReview.setPaintVisible(false));
  const hidden=await page.screenshot();
  const visual=await changedPixels(visible,hidden,result.screen);
  assert.ok(visual.pixels>35&&visual.difference>1800,
   `${key} ${fraction}: hiding paint changed only ${visual.pixels} pixels / ${visual.difference} RGB units near impact`);
  results.push({...result,visual});
  await page.evaluate(()=>(window as any).paintReview.setPaintVisible(true));
 }
 await writeFile(`${output}/diagnostics.json`,JSON.stringify({results,errors},null,2));
 assert.deepEqual(errors,[]);
 console.log('Moving paint browser visual regression passed.');
}finally{await browser.close();}
