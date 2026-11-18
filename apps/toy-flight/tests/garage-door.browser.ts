import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1280,height:800}}),errors:string[]=[];
page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
const output='test-results/garage-door';await mkdir(output,{recursive:true});const results:unknown[]=[];
try{
 await page.goto((process.env.GAME_URL??'http://127.0.0.1:5173')+'/tests/garage-door-review.html');
 await page.waitForFunction(()=>Boolean((window as any).reviewReady),{},{timeout:180000});
 for(const [name,fraction,view] of [['closed',0,'outside'],['starting',.25,'outside'],['turning',.55,'outside'],['open',1,'inside']] as const){
  const result=await page.evaluate(({fraction,view})=>(window as any).garageReview.show(fraction,view),{fraction,view}) as any;
  assert.equal(result.count,12);assert.deepEqual(result.errors,[]);assert.equal(result.rails,2);assert.equal(result.motor,true);
  assert.equal(result.parts.length,12);assert.ok(result.parts.every((part:any)=>part.error<1e-7));
  if(fraction===1)assert.ok(result.parts.every((part:any)=>Math.abs(part.rotationX+Math.PI/2)<1e-7));
  await page.screenshot({path:`${output}/${name}.png`});results.push(result);
 }
 assert.deepEqual(errors,[]);await writeFile(`${output}/diagnostics.json`,JSON.stringify({results,errors},null,2));
 console.log('Sectional garage browser visual regression passed.');
}finally{await browser.close();}
