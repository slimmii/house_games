// Browser smoke test of the tower defense page. Needs the dev server (`npm run dev`)
// or a built server; set DEFENSE_URL to point elsewhere (the page needs `?debug=1`
// outside dev for the test hooks).
//   node --import tsx tests/defense.browser.ts
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';

const url = process.env.DEFENSE_URL ?? 'http://localhost:5174/?debug=1';
const out = new URL('../test-results/defense/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const problems: string[] = [];
page.on('console', message => { if (message.type() === 'error') problems.push(message.text()); });
page.on('pageerror', error => problems.push(error.message));

try {
  // tsx wraps named functions in a helper that does not exist inside the page.
  await page.addInitScript('window.__name = fn => fn');
  await page.goto(url);
  await page.waitForFunction(() => document.body.dataset.ready === 'true', null, { timeout: 120_000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}smoke-title.png` });

  // The title screen offers the three difficulties; start the middle one through the real button.
  await page.getByRole('button', { name: /Rainy Day/i }).first().click();
  await page.waitForFunction(() => (window as any).defense.screen === 'playing');

  const built = await page.evaluate(() => {
    const game = (window as any).defense;
    game.game.money = 2000;
    // One on the coffee table, the rest on the first free floor spots beside the veranda route.
    const placed = [!!game.place('popgun', 14.3, -4.1)];
    const kinds = ['popgun', 'dart', 'popgun'];
    for (let z = -20; z < -13 && kinds.length; z += 0.6) {
      for (const x of [13.6, 10.9]) {
        if (kinds.length && game.place(kinds[0], x, z)) {
          kinds.shift();
          placed.push(true);
        }
      }
    }
    return placed;
  });
  assert.deepEqual(built, [true, true, true, true], 'towers could be placed on the floor and on the coffee table');
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}smoke-built.png` });

  // The route tape and the placing preview must actually show on screen: hiding
  // each one has to change a fair number of pixels.
  await page.keyboard.press('1');
  const spot = await page.evaluate(() => {
    const game = (window as any).defense;
    const point = new game.THREE.Vector3(15.6, 7.23, -11.4).project(game.commander.camera);
    return [(point.x * 0.5 + 0.5) * innerWidth, (-point.y * 0.5 + 0.5) * innerHeight];
  });
  await page.mouse.move(spot[0], spot[1]);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}smoke-placing.png` });
  const shown = await page.evaluate(() => {
    const game = (window as any).defense;
    const gl = game.renderer.getContext();
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    const grab = () => {
      game.renderer.render(game.stage.scene, game.commander.camera);
      const pixels = new Uint8Array(width * height * 4);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      return pixels;
    };
    const battle = game.stage.scene.getObjectByName('battle');
    const base = grab();
    const changedWithout = (names: string[]) => {
      const parts = battle.children.filter((child: any) => names.includes(child.name) && child.visible);
      for (const part of parts) part.visible = false;
      const without = grab();
      for (const part of parts) part.visible = true;
      let changed = 0;
      for (let index = 0; index < base.length; index += 4) {
        if (Math.abs(base[index] - without[index]) + Math.abs(base[index + 1] - without[index + 1]) + Math.abs(base[index + 2] - without[index + 2]) > 40) changed += 1;
      }
      return changed;
    };
    return { tape: changedWithout(['tape-east']), preview: changedWithout(['placing-ghost', 'range-ring', 'range-disc']) };
  });
  assert.ok(shown.tape > 1500, `the route tape is visible (${shown.tape} pixels)`);
  assert.ok(shown.preview > 1500, `the placing preview is visible (${shown.preview} pixels)`);
  await page.keyboard.press('Escape');

  // Send the first wave with the keyboard, watch a little in real time, then fast-forward.
  await page.keyboard.press('Space');
  await page.waitForFunction(() => (window as any).defense.game.wave === 1);
  await page.waitForTimeout(1500);
  await page.evaluate(() => (window as any).defense.skip(24));
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}smoke-wave1.png` });
  const mid = await page.evaluate(() => {
    const state = (window as any).defense.game;
    return { kills: state.stats.kills, lives: state.lives, enemies: state.enemies.length, wave: state.wave };
  });
  assert.ok(mid.kills > 0, `soldiers were beaten (${JSON.stringify(mid)})`);

  // Jump ahead to a busy wave with both routes, aircraft and upgraded toys.
  await page.evaluate(() => {
    const game = (window as any).defense;
    game.game.money = 20000;
    const kinds = ['mortar', 'ballista', 'robot', 'glue', 'dart', 'popgun', 'ballista', 'mortar', 'robot', 'dart'];
    for (let x = 9; x < 19.5 && kinds.length; x += 0.7) {
      for (const z of [-10.9, -13.9, -5.9, -2.6]) {
        if (kinds.length && game.place(kinds[0], x, z)) kinds.shift();
      }
    }
    for (const tower of game.game.towers.slice(0, 6)) tower.level = 3;
    game.game.wave = 12;
    game.callWave();
    game.skip(11);
  });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}smoke-wave13.png` });
  const late = await page.evaluate(() => {
    const game = (window as any).defense;
    const info = game.renderer.info.render;
    return { enemies: game.game.enemies.length, towers: game.game.towers.length, calls: info.calls, triangles: info.triangles, phase: game.game.phase };
  });
  assert.ok(late.enemies > 0 && late.towers >= 10, JSON.stringify(late));
  console.log('late wave:', JSON.stringify(late));

  // Pause and resume with the keyboard.
  await page.keyboard.press('KeyP');
  await page.waitForFunction(() => (window as any).defense.screen === 'paused');
  await page.screenshot({ path: `${out}smoke-paused.png` });
  await page.keyboard.press('KeyP');
  await page.waitForFunction(() => (window as any).defense.screen === 'playing');

  // Losing shows the result screen.
  await page.evaluate(() => {
    const game = (window as any).defense;
    game.game.lives = 1;
    for (const tower of [...game.game.towers]) tower.stunned = 999;
    game.skip(90);
  });
  await page.waitForFunction(() => (window as any).defense.screen === 'lost', null, { timeout: 20_000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}smoke-lost.png` });

  assert.deepEqual(problems, [], 'no console errors');
  console.log(`Defense smoke test passed. Screenshots in ${out}`);
} catch (error) {
  await page.screenshot({ path: `${out}smoke-failure.png` }).catch(() => undefined);
  console.error(problems.join('\n'));
  throw error;
} finally {
  await browser.close();
}
