import assert from 'node:assert/strict';
import test, { before } from 'node:test';
import { readFile } from 'node:fs/promises';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import * as THREE from 'three';
import { decodePaintSurfaces, installPaintSurfaces, rayPaintSurfaces } from '@huis/house/shared/paint-surfaces';
import { rayWorld } from '@huis/house/shared/collision';
import { PaintBatch } from '../src/client/paintBatch';
import { GameSimulation } from '../src/server/simulation';
import { houseModelPath } from '@huis/house/node/paths';

before(async () => {
  const file = await readFile(houseModelPath('paint-surfaces.meshopt.bin'));
  installPaintSurfaces(await decodePaintSurfaces(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength)));
});

test('solid details and printed overlays receive authoritative ink and visible splats', async () => {
  await MeshoptDecoder.ready;
  const document = await new NodeIO().registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
    .read(houseModelPath('house.glb'));
  const names = ['Bedroom 2 / pleated grey curtain', 'Bedroom 1 entry corner / dollhouse small rug',
    'Small bedroom / reference bear decal', 'Living craft desk / mushroom stool domed cushion'];
  let solidFlightHits = 0;
  for (const name of names) {
    const node = document.getRoot().listNodes().find(node => node.getName() === name)!;
    assert.ok(node, name);
    const matrix = new THREE.Matrix4().fromArray(node.getWorldMatrix());
    let area = 0, center = new THREE.Vector3(), normal = new THREE.Vector3();
    for (const primitive of node.getMesh()!.listPrimitives()) {
      const attribute = primitive.getAttribute('POSITION')!, indices = primitive.getIndices();
      for (let i = 0; i < (indices?.getCount() ?? attribute.getCount()); i += 3) {
        const points = [0, 1, 2].map(offset => {
          const value: number[] = [];
          attribute.getElement(indices ? indices.getScalar(i + offset) : i + offset, value);
          return new THREE.Vector3().fromArray(value).applyMatrix4(matrix);
        });
        const triangle = new THREE.Triangle(...points as [THREE.Vector3, THREE.Vector3, THREE.Vector3]);
        if (triangle.getArea() > area) {
          area = triangle.getArea(); triangle.getMidpoint(center); triangle.getNormal(normal);
        }
      }
    }
    const start = center.clone().addScaledVector(normal, .025), end = center.clone().addScaledVector(normal, -.025);
    const hit = rayPaintSurfaces(start, end);
    assert.ok(hit, `${name} must accept shots`);
    assert.ok(center.distanceTo(new THREE.Vector3(hit.position.x, hit.position.y, hit.position.z)) < .003, `${name} hits visible geometry`);
    if (!name.includes('decal')) {
      assert.ok(rayWorld(start, end), `${name} also blocks flight`);
      solidFlightHits++;
    }
    const game = new GameSimulation(() => .5);
    game.projectiles.push({ id: 1, owner: 'test', color: '#ff2200', position: start,
      velocity: end.clone().sub(start).multiplyScalar(60), bornAt: game.time });
    game.update(1 / 60);
    assert.equal(game.paints.length, 1, `${name} creates authoritative paint`);
    const scene = new THREE.Scene(), batch = new PaintBatch(scene);
    batch.reconcile(game.paints);
    const mesh = scene.getObjectByName('paint-batch') as THREE.Mesh;
    const positions = mesh.geometry.getAttribute('position');
    const origin = new THREE.Vector3().fromBufferAttribute(positions, 0);
    let radius = 0;
    for (let i = 1; i <= 48; i++) radius = Math.max(radius, origin.distanceTo(new THREE.Vector3().fromBufferAttribute(positions, i)));
    assert.ok(radius > .015, `${name} ink must not collapse to an invisible point (${radius})`);
    batch.dispose();
  }
  assert.equal(solidFlightHits, 3, 'physical details now participate in flight collision');
});


test('entrance niche brick aligns flight collision with its paintable surface', () => {
  const game = new GameSimulation(() => .5);
  for (const [y, z] of [[5.4, -7.75], [5.1, -6], [4, -8.4]]) {
    const start = { x: 3, y, z }, end = { x: 0, y, z };
    const visual = rayPaintSurfaces(start, end), flight = rayWorld(start, end);
    assert.ok(visual && flight);
    assert.ok(Math.abs(visual.position.x - 1.035) < .00001, 'hit the visible brick lining');
    assert.ok(Math.abs(visual.position.x - flight.position.x) < .00001, 'flight now reaches the visible brick lining');
    game.projectiles.push({ id: game.paints.length + 1, owner: 'test', color: '#f27654', position: start,
      velocity: { x: -90, y: 0, z: 0 }, bornAt: game.time });
    game.update(.04);
  }
  assert.equal(game.paints.length, 3);
  const scene = new THREE.Scene(), batch = new PaintBatch(scene);
  batch.reconcile(game.paints);
  const mesh = scene.getObjectByName('paint-batch') as THREE.Mesh;
  const positions = mesh.geometry.getAttribute('position');
  assert.ok(positions.getX(0) > 1.035, 'ink is drawn on the room side of the visible wall');
  const center = new THREE.Vector3().fromBufferAttribute(positions, 0);
  for (let i = 1; i <= 24; i++) {
    assert.ok(center.distanceTo(new THREE.Vector3().fromBufferAttribute(positions, i)) > .08,
      'the surface support probe must not collapse the outline against the old collider');
  }
  batch.dispose();
});
