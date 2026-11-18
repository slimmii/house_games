import {chromium} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true});
try{const page=await browser.newPage({viewport:{width:1280,height:800}});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
await mkdir('test-results/cupboard-edges',{recursive:true});
await page.goto('http://127.0.0.1:5175/tests/cupboard-edges-review.html');
await page.waitForFunction(()=>Boolean((window as any).reviewReady),{},{timeout:180000});
await page.screenshot({path:'test-results/cupboard-edges/after.png'});
for(const [index,offset] of [-.015,.03].entries()){
 await page.evaluate(offset=>(window as any).fridgeReview.shiftCamera(offset),offset);
 await page.screenshot({path:`test-results/cupboard-edges/after-angle-${index}.png`});
}
const diagnostics=await page.evaluate(()=>(window as any).fridgeReview.show(1));
assert.deepEqual(diagnostics.missingFronts,[]);
await page.screenshot({path:'test-results/cupboard-edges/open.png'});
assert.deepEqual(errors,[]);console.log('Closed, shifted-view and open cabinet captures passed with no missing fronts or browser errors.');
}finally{await browser.close();}
