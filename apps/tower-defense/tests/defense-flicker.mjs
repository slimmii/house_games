// Measures shimmer in the defense room view: renders the same view twice with the camera
// moved by a small fraction of a pixel and counts pixels that change a lot. A stable image
// changes only along anti-aliased edges; surfaces fighting for the same depth flip colour.
//   node tests/defense-flicker.mjs            (needs the dev server on port 5174)
import { chromium } from '@playwright/test';

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(process.env.DEFENSE_URL ?? 'http://localhost:5174/?debug=1');
await page.waitForFunction(() => document.body.dataset.ready === 'true', null, { timeout: 120000 });
await page.evaluate(() => window.defense.start('easy'));
await page.waitForTimeout(1500);
const views = {
  overview: { x: 12.2, z: -16.2, yaw: -Math.PI / 2, pitch: 0.98, distance: 45 },
  north: { x: 13, z: -12, yaw: 0, pitch: 1.0, distance: 44 },
  south: { x: 13, z: -18, yaw: -Math.PI, pitch: 0.9, distance: 40 },
  close: { x: 12.5, z: -17, yaw: -1.2, pitch: 0.8, distance: 18 },
};
let worst = 0;
for (const [name, view] of Object.entries(views)) {
  const result = await page.evaluate(async view => {
    const game = window.defense;
    const gl = game.renderer.getContext();
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    game.commander.frame(view, true);
    // Let the wall cutaways settle for this direction.
    await new Promise(resolve => setTimeout(resolve, 900));
    const snap = shift => {
      game.commander.frame({ ...view, x: view.x + shift, z: view.z + shift * 0.7 }, true);
      game.renderer.render(game.stage.scene, game.commander.camera);
      const pixels = new Uint8Array(width * height * 4);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      return pixels;
    };
    let changed = 0;
    let previous = snap(0);
    for (let step = 1; step <= 4; step += 1) {
      const next = snap(step * 0.004);
      for (let index = 0; index < next.length; index += 4) {
        const diff = Math.max(Math.abs(next[index] - previous[index]), Math.abs(next[index + 1] - previous[index + 1]), Math.abs(next[index + 2] - previous[index + 2]));
        if (diff > 70) changed += 1;
      }
      previous = next;
    }
    return { changed: Math.round(changed / 4), pixels: width * height };
  }, view);
  worst = Math.max(worst, result.changed);
  console.log(`${name}: ${result.changed} of ${result.pixels} pixels flip per tiny camera move`);
}
await browser.close();
console.log(`worst view: ${worst}`);
