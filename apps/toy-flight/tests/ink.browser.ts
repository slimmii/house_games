import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import sharp from 'sharp';

async function difference(a:Buffer,b:Buffer):Promise<{pixels:number;sum:number}>{
 const [left,right]=await Promise.all([sharp(a).removeAlpha().raw().toBuffer(),sharp(b).removeAlpha().raw().toBuffer()]);
 let pixels=0,sum=0;for(let index=0;index<left.length;index+=3){const delta=Math.abs(left[index]-right[index])+Math.abs(left[index+1]-right[index+1])+Math.abs(left[index+2]-right[index+2]);if(delta>18)pixels++;sum+=delta;}return {pixels,sum};
}

const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:960,height:640}}),errors:string[]=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('console',message=>{if(message.type()==='error'&&!message.text().includes('Failed to load resource'))errors.push(message.text());});
const output='test-results/ink-review';await mkdir(output,{recursive:true});
try{
 await page.goto((process.env.GAME_URL??'http://127.0.0.1:5173')+'/tests/ink-review.html');
 await page.waitForFunction(()=>Boolean((window as any).reviewReady),{},{timeout:180000});
 const cleanInfo=await page.evaluate(()=>(window as any).inkReview.show('clean')) as {calls:number;triangles:number;objects:number};
 const clean=await page.screenshot({path:`${output}/before-clean-wall.png`});
 const inkInfo=await page.evaluate(()=>(window as any).inkReview.show('ink'));
 const ink=await page.screenshot({path:`${output}/after-layered-ink.png`});
 const visual=await difference(clean,ink);
 assert.ok(visual.pixels>4500&&visual.sum>250000,`ink changed only ${visual.pixels} pixels / ${visual.sum} RGB units`);
 const sprayCleanInfo=await page.evaluate(()=>(window as any).inkReview.show('spray-clean'));
 const sprayClean=await page.screenshot({path:`${output}/before-organic-spray.png`});
 const sprayInfo=await page.evaluate(()=>(window as any).inkReview.show('spray'));
 const spray=await page.screenshot({path:`${output}/organic-single-player-spray.png`});
 const sprayVisual=await difference(sprayClean,spray);
 assert.ok(sprayVisual.pixels>12000&&sprayVisual.sum>600000,
  `representative aimed spray changed only ${sprayVisual.pixels} pixels / ${sprayVisual.sum} RGB units`);
 const stress=await page.evaluate(()=>(window as any).inkReview.stress()) as {elapsed:number;averageFrame:number;maxObjects:number;maxCalls:number;marks:number};
 await page.screenshot({path:`${output}/unlimited-fire-10s.png`});
 assert.equal(stress.marks,75,'synthetic 600-frame load produces 75 observed impacts');
 assert.ok(stress.averageFrame<25,`simulated sustained-fire frame averaged ${stress.averageFrame.toFixed(2)}ms`);
 assert.ok(stress.maxObjects<80,`scene object pool grew to ${stress.maxObjects}`);
 const visibleBaseline=Math.max(cleanInfo.calls,(sprayCleanInfo as {calls:number}).calls);
 assert.ok(stress.maxCalls<=visibleBaseline+6,`ink added ${stress.maxCalls-visibleBaseline} draw calls over the visible house baseline`);
 assert.deepEqual(errors,[]);
 await writeFile(`${output}/diagnostics.json`,JSON.stringify({cleanInfo,inkInfo,visual,sprayCleanInfo,sprayInfo,sprayVisual,stress,errors},null,2));
 console.log(`Ink visual/load regression passed: ${sprayVisual.pixels} aimed-spray pixels; ${stress.averageFrame.toFixed(2)}ms simulated frame.`);
}finally{await browser.close();}
