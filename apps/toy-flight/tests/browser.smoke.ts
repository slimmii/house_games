/** Run against `npm start`: GAME_URL=http://127.0.0.1:2567 npm run test:browser */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, type Page } from '@playwright/test';

const base = process.env.GAME_URL ?? 'http://127.0.0.1:2567';
const lightweightAuxiliaryClients = process.env.LIGHTWEIGHT_AUXILIARY_CLIENTS === '1';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors: string[] = [];
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await mkdir('test-results', { recursive: true });

async function pilot(name: string, invite?: string, lightweightWorld = false) {
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(`${name}: ${error.message}`));
  // Keep the foreground pilot on the production house. Auxiliary clients only
  // need a valid scene to exercise the real browser/network/client path; loading
  // the 161 MB house three times makes this smoke unnecessarily memory-heavy.
  if (lightweightWorld) {
    await page.route(/\/models\/house(?:-gpu)?\.glb(?:\?.*)?$/, route => route.fulfill({
      contentType: 'model/gltf+json',
      body: JSON.stringify({ asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [] }] }),
    }));
  }
  await page.goto(invite ?? base);
  await page.locator('#createButton:enabled').waitFor({ timeout: 90000 });
  await page.locator('#playerName').fill(name);
  return page;
}

async function waitForPilots(page: Page, count: number) {
  await page.waitForFunction(n => document.querySelector('#pilotCount')?.textContent?.includes(`${n} / 3`), count);
}

async function numberFrom(page: Page, selector: string): Promise<number> {
  return Number(await page.locator(selector).textContent());
}

async function hold(page: Page, code: string, milliseconds: number): Promise<void> {
  await page.keyboard.down(code);
  await page.waitForTimeout(milliseconds);
  await page.keyboard.up(code);
}

async function peakWhileHeld(page: Page, code: string, milliseconds = 650): Promise<number> {
  await page.keyboard.down(code);
  let peak = 0;
  const samples = Math.ceil(milliseconds / 65);
  for (let sample = 0; sample < samples; sample++) {
    await page.waitForTimeout(65);
    peak = Math.max(peak, await numberFrom(page, '#speedValue'));
  }
  await page.keyboard.up(code);
  return peak;
}

async function minimapImage(page: Page): Promise<string> {
  return page.locator('#minimap').evaluate(canvas => (canvas as HTMLCanvasElement).toDataURL());
}

try {
  const first = await pilot('Coral Tester');
  await first.screenshot({ path: 'test-results/drone-lobby.png' });
  await first.locator('#createButton').click();
  await waitForPilots(first, 1);
  const room = (await first.locator('#roomBadge').textContent())?.trim();
  assert.ok(room && room !== '—');
  const invite = `${base}/?room=${encodeURIComponent(room)}`;

  const second = await pilot('Mint Tester', invite, lightweightAuxiliaryClients);
  await second.locator('#joinButton').click();
  await waitForPilots(second, 2);
  const third = await pilot('Lilac Tester', invite, lightweightAuxiliaryClients);
  await third.locator('#joinButton').click();
  await waitForPilots(third, 3);
  await waitForPilots(first, 3);

  await first.bringToFront();
  await first.waitForTimeout(1500);
  const instructions = (await first.locator('#instructions').innerText()).toLowerCase();
  for (const label of ['forward', 'back', 'slide left', 'look & steer', 'rise', 'descend', 'precision', 'release mouse', 'ink', 'respawn']) {
    assert.ok(instructions.includes(label), `controls should describe ${label}`);
  }
  await first.locator('#hideInstructions').click();

  // The acquisition click only captures the mouse. It must not also fire paint.
  await first.locator('#captureMouse').click();
  await first.waitForFunction(() => document.pointerLockElement instanceof HTMLCanvasElement);
  // The pointerlockchange handler can run after the lock itself becomes observable.
  await first.locator('#captureMouse').waitFor({ state: 'hidden' });
  const minimapBeforeMouse = await minimapImage(first);
  await first.mouse.move(960, 420, { steps: 4 });
  await first.waitForTimeout(350);
  const minimapAfterMouse = await minimapImage(first);
  assert.notEqual(minimapAfterMouse, minimapBeforeMouse, 'horizontal mouse movement should turn the drone heading');

  assert.equal((await first.locator('#cameraMode').textContent())?.trim(), 'CHASE VIEW');
  await first.keyboard.press('v');
  assert.equal((await first.locator('#cameraMode').textContent())?.trim(), 'CHASE VIEW', 'the camera must stay in chase view');

  const forwardPeak = await peakWhileHeld(first, 'w');
  assert.ok(forwardPeak > 0.2, 'W should move the drone forward');
  await first.waitForTimeout(850);
  const hoverSpeed = await numberFrom(first, '#speedValue');
  assert.ok(hoverSpeed < forwardPeak * 0.7, 'neutral controls should brake toward a hover');

  const backwardPeak = await peakWhileHeld(first, 's');
  assert.ok(backwardPeak > 0.15, 'S should move the drone backward');
  const altitudeBeforeLift = await numberFrom(first, '#altitudeValue');
  await hold(first, 'Space', 500);
  const altitudeAfterLift = await numberFrom(first, '#altitudeValue');
  assert.ok(altitudeAfterLift > altitudeBeforeLift + 0.03, 'Space should lift the drone');
  // Allow enough time to brake the prior upward velocity before descending.
  await hold(first, 'Control', 1000);
  const altitudeAfterDescent = await numberFrom(first, '#altitudeValue');
  assert.ok(altitudeAfterDescent < altitudeAfterLift - 0.01,
    `Ctrl should descend (${altitudeAfterLift} -> ${altitudeAfterDescent})`);

  // Exact directional response and latency/jitter recovery are covered by
  // deterministic predictor/simulation tests.
  for (const code of ['a', 'd', 'q', 'e', 'ArrowUp', 'ArrowDown']) await hold(first, code, 120);
  await first.keyboard.down('Shift');
  await hold(first, 'w', 220);
  await first.keyboard.up('Shift');

  // While locked, a primary click fires. Aim upward first to exercise mouse pitch.
  await first.mouse.move(960, 260, { steps: 3 });
  await first.mouse.down();
  await first.waitForTimeout(120);
  await first.mouse.up();
  await hold(first, 'f', 280);
  await first.waitForTimeout(400);
  await first.screenshot({ path: 'test-results/drone-flight.png' });

  await first.keyboard.press('r');
  await first.waitForTimeout(1200);
  assert.equal(await first.locator('#notice').isVisible(), false, 'manual respawn should return to flight');

  // Escape must both unlock and neutralize an active movement key.
  await first.keyboard.down('w');
  await first.waitForTimeout(220);
  await first.keyboard.press('Escape');
  await first.keyboard.up('w');
  await first.waitForFunction(() => document.pointerLockElement === null);
  await first.locator('#captureMouse').waitFor({ state: 'visible' });
  await first.waitForTimeout(850);
  assert.ok(await numberFrom(first, '#speedValue') < 0.2, 'Escape should neutralize movement and return to hover');

  await third.locator('#leaveButton').click();
  await waitForPilots(first, 2);
  await third.locator('#createButton:enabled').waitFor({ timeout: 90000 });
  await third.locator('#roomName').fill(room);
  await third.locator('#joinButton').click();
  await waitForPilots(third, 3);
  await waitForPilots(first, 3);
  await first.screenshot({ path: 'test-results/drone-multiplayer.png' });

  assert.deepEqual(errors, [], 'browser should not throw runtime errors');
  const frameRate = await first.locator('#fpsValue').textContent();
  console.log(JSON.stringify({
    result: 'passed', room, pilots: 3, frameRate, errors,
    fullHouseRenderers: lightweightAuxiliaryClients ? 1 : 3,
    lightweightAuxiliaryClients: lightweightAuxiliaryClients ? 2 : 0,
    pointerLock: { acquired: true, mouseHeadingChanged: true, cameraModes: ['CHASE'], escapeNeutralized: true },
    motion: { forwardPeak, backwardPeak, hoverSpeed, altitudeBeforeLift, altitudeAfterLift, altitudeAfterDescent },
    screenshots: ['test-results/drone-lobby.png', 'test-results/drone-flight.png', 'test-results/drone-multiplayer.png'],
  }, null, 2));
} finally {
  await browser.close();
}
