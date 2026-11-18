/** Full production-scene visual review against npm run dev:client. */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1280,height:900}});
const errors:string[]=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
await mkdir('test-results/closet-overlap',{recursive:true});
try{
  await page.goto((process.env.GAME_URL??'http://127.0.0.1:5173')+'/tests/closet-overlap-review.html');
  await page.waitForFunction(()=>Boolean((window as any).reviewReady),{},{timeout:180000});
  const cases=['entrance','entranceNarrow','smastad','camber','armoire','cubes'];
  for(const name of cases){
    for(const fraction of [0,1]){
      await page.evaluate(({name,fraction})=>(window as any).closetOverlapReview.render(name,fraction),{name,fraction});
      await page.screenshot({path:`test-results/closet-overlap/${name}-${fraction?'open':'closed'}.png`});
    }
  }
  await page.evaluate(()=>(window as any).closetOverlapReview.render('entrance',1));
  const entrancePatch=await page.evaluate(()=>(window as any).closetOverlapReview.pixelPatch([1.096,3.35,-2.6],16));
  // The sampled open-cupboard back is a stable light melamine surface. The
  // former coplanar brick/white faces produced a mottled brown patch here.
  assert.ok(entrancePatch.lightRatio>.55,`entrance back is not visibly light: ${JSON.stringify(entrancePatch)}`);
  assert.ok(entrancePatch.brownRatio<.16,`brick shows through the entrance back: ${JSON.stringify(entrancePatch)}`);
  await writeFile('test-results/closet-overlap/results.json',JSON.stringify({entrancePatch,errors},null,2));
  assert.deepEqual(errors,[]);
  console.log('Cabinet overlap full-scene review passed.',entrancePatch);
}finally{await browser.close();}
