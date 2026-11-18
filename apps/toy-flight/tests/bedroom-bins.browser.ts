import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from '@playwright/test';
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1100,height:850}}),errors:string[]=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 await mkdir('test-results/bedroom-bins',{recursive:true});
 await page.goto((process.env.GAME_URL??'http://127.0.0.1:5175')+'/tests/bedroom-bins-review.html');
 await page.waitForFunction(()=>Boolean((window as any).reviewReady),{},{timeout:180000});
 const diagnostics=await page.evaluate(()=>(window as any).binReview.diagnostics());
 for(const key of ['missingFronts','missingAttachments','missingRemovals'])assert.deepEqual(diagnostics[key].filter((s:string)=>/closet_1(?:3[2-9]|4[0-7])/.test(s)),[],key);
 await page.screenshot({path:'test-results/bedroom-bins/closed.png'});
 const bins=await page.evaluate(()=>(window as any).binReview.show(1));
 assert.equal(bins.length,16);for(const bin of bins)assert.ok(bin.meshes>=6,bin.id);
 await page.screenshot({path:'test-results/bedroom-bins/open.png'});
 await page.evaluate(()=>(window as any).binReview.show(0));
 await page.screenshot({path:'test-results/bedroom-bins/reclosed.png'});
 assert.deepEqual(errors,[]);console.log(JSON.stringify({bins,diagnostics,errors}));
}finally{await browser.close();}
