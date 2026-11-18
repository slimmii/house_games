import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  createLightingSampler,
  decodeIrradiance,
  encodeIrradiance,
  hemisphereDirections,
  prepareFixtures,
} from '../scripts/daylight-gather.mjs';
import { allocateLightingSubdivision } from '../scripts/lighting-subdivision.mjs';

const SAMPLE_SPACING = 1.4;
const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);
const v = (x, y, z) => new THREE.Vector3(x, y, z);

// Floor slab whose top face sits at y = 0.
const floorSlab = () => new THREE.BoxGeometry(40, 0.2, 40).translate(0, -0.1, 0);
const roofSlab = (width = 40) => new THREE.BoxGeometry(width, 0.2, 40).translate(0, 6, 0);

/** Merge, de-index and return the flat world-space triangle corner array (9 floats per triangle). */
function trianglePositionsOf(geometries) {
  const merged = mergeGeometries(geometries.map(geometry => geometry.index ? geometry.toNonIndexed() : geometry));
  const flat = merged.index ? merged.toNonIndexed() : merged;
  return new Float32Array(flat.getAttribute('position').array);
}

const DAYLIGHT = {
  sun: { direction: [-0.45, 0.78, 0.43], color: [1, 0.96, 0.9], irradiance: 0, angularRadius: 0.08 },
  sky: { color: [0.78, 0.86, 1.0], irradiance: 1 },
  bounce: { gain: 1.35 },
  fixtureColor: [1, 0.88, 0.69],
};

/**
 * Build a sampler over the given geometries the same way the bake worker does:
 * a non-indexed BufferGeometry whose position attribute is exactly `trianglePositions`.
 */
function makeSampler(geometries, overrides = {}) {
  const { albedo = 0.5, sun = {}, sky = {}, fixtures = [], emitters = [], ...options } = overrides;
  const trianglePositions = trianglePositionsOf(geometries);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(trianglePositions.slice(), 3));
  const bvh = new MeshBVH(geometry);
  const triangleAlbedo = new Float32Array(trianglePositions.length / 3).fill(albedo);
  const daylight = {
    ...DAYLIGHT,
    sun: { ...DAYLIGHT.sun, ...sun },
    sky: { ...DAYLIGHT.sky, ...sky },
  };
  const sampler = createLightingSampler(bvh, {
    fixtures: prepareFixtures(fixtures, emitters),
    daylight,
    triangleAlbedo,
    trianglePositions,
    houseBox: { min: [-30, -10, -30], max: [30, 20, 30] },
    insideRays: 64,
    outsideRays: 16,
    centroidRays: 32,
    sunRays: 4,
    ...options,
  });
  return { ...sampler, bvh, trianglePositions };
}

const near = (actual, expected, tolerance, message) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: expected ${expected} ± ${tolerance}, got ${actual}`);

test('Narrow wall sections receive the same sample spacing as broad adjacent walls', () => {
  const candidates = [20, 1.7, 18, 1.8].map(area => ({
    area, maxEdge: 8, level: 3, priority: 1, levels: new Uint8Array(1), triangleIndex: 0,
  }));
  const result = allocateLightingSubdivision(candidates, 60, SAMPLE_SPACING);
  assert.ok(result.addedTriangles <= 60);
  for (const candidate of candidates) {
    assert.equal(candidate.levels[0], 2, 'Every tall wall has interior samples, including small end faces');
  }
  const constrained = allocateLightingSubdivision(candidates, 12, SAMPLE_SPACING);
  assert.ok(constrained.addedTriangles <= 12);
  assert.ok(candidates.every(candidate => candidate.levels[0] === 1), 'Budget pressure relaxes all panels together');
});

test('Irradiance encoding round-trips with a square-root curve', () => {
  const max = 8;
  for (const value of [0, 0.01, 0.5, max]) {
    const byte = encodeIrradiance(value, max);
    assert.ok(Number.isInteger(byte) && byte >= 0 && byte <= 255);
    near(decodeIrradiance(byte, max), value, 0.02 * max, `round-trip of ${value}`);
  }
  assert.equal(encodeIrradiance(max, max), 255);
  assert.equal(encodeIrradiance(max * 3, max), 255, 'Values above max clamp');
  assert.equal(encodeIrradiance(-1, max), 0, 'Negative values encode to 0');
  assert.equal(encodeIrradiance(NaN, max), 0, 'NaN encodes to 0');
  assert.equal(Math.round(0.004 / max * 255), 0, 'Linear encoding would lose this dim value');
  assert.ok(encodeIrradiance(0.004, max) > 0, 'Square-root curve keeps dim tails');
});

test('Hemisphere directions are unit, upper-hemisphere and cosine-weighted', () => {
  const directions = hemisphereDirections(64);
  assert.equal(directions.length, 64);
  let meanZ = 0;
  for (const [x, y, z] of directions) {
    near(Math.hypot(x, y, z), 1, 1e-9, 'direction length');
    assert.ok(z >= 0);
    meanZ += z / directions.length;
  }
  near(meanZ, 2 / 3, 0.05, 'cosine-weighted mean z');
});

test('Open floor sees the full sky; its underside sees none', () => {
  const sampler = makeSampler([floorSlab()]);
  const [fixture, day] = sampler.sampleSurface(v(0, 0, 0), UP);
  assert.equal(fixture, 0);
  near(day, 1, 0.05, 'up-facing open floor daylight');
  const [, under] = sampler.sampleSurface(v(0, 0, 0), DOWN);
  assert.ok(under < 0.05, `underside daylight ${under}`);
});

test('A roof blocks the sky; a narrow roof lets light in from the open sides', () => {
  const covered = makeSampler([floorSlab(), roofSlab(40)]);
  const [, coveredDay] = covered.sampleSurface(v(0, 0, 0), UP);
  // Only grazing rays escape past the 20-unit overhang, and the roof underside is unlit.
  assert.ok(coveredDay < 0.1, `fully covered floor daylight ${coveredDay}`);

  const open = makeSampler([floorSlab(), roofSlab(10)]);
  const [, centre] = open.sampleSurface(v(0, 0, 0), UP);
  const [, side] = open.sampleSurface(v(8, 0, 0), UP);
  assert.ok(centre > 0.15 && centre < 0.9, `centre daylight under narrow roof ${centre}`);
  assert.ok(side > centre, `beside the roof (${side}) is brighter than under it (${centre})`);
});

test('Sun light reaches the open floor and is blocked by a roof', () => {
  const sunOnly = { sun: { irradiance: 3, direction: [0, 1, 0] }, sky: { irradiance: 0 } };
  const open = makeSampler([floorSlab()], sunOnly);
  near(open.sampleSurface(v(0, 0, 0), UP)[1], 3, 0.1, 'sunlit floor');
  near(open.sunIrradiance(v(0, 0, 0), UP), 3, 0.1, 'direct sun term');
  const covered = makeSampler([floorSlab(), roofSlab(40)], sunOnly);
  assert.equal(covered.sampleSurface(v(0, 0, 0), UP)[1], 0);
  assert.equal(covered.sunIrradiance(v(0, 0, 0), UP), 0);
});

test('A sky-lit wall bounces daylight onto a surface facing it', () => {
  const wall = new THREE.BoxGeometry(0.2, 10, 40).translate(-0.1, 5, 0);
  const sampler = makeSampler([floorSlab(), wall], { albedo: 0.8 });
  const [, open] = sampler.sampleSurface(v(0.5, 2, 0), v(1, 0, 0));
  const [, facingWall] = sampler.sampleSurface(v(0.5, 2, 0), v(-1, 0, 0));
  assert.ok(facingWall > 0.1, `wall-facing side receives bounce: ${facingWall}`);
  assert.ok(open > 0, `open side ${open}`);
  assert.ok(open > facingWall, `open side (${open}) is brighter than wall-facing side (${facingWall})`);
});

test('Spot fixtures and lamp discs light the floor and are shadowed by occluders', () => {
  const spot = {
    type: 'spot', position: [0, 3, 0], direction: [0, -1, 0], color: [1, 0.88, 0.69],
    intensity: 36.8, distance: 9.3, angle: 0.663, penumbra: 0.65,
  };
  const lit = makeSampler([floorSlab()], { fixtures: [spot] });
  const centre = lit.fixtureIrradiance(v(0, 0, 0), UP);
  const offAxis = lit.fixtureIrradiance(v(2, 0, 0), UP);
  assert.ok(centre > 0.5, `spot centre ${centre}`);
  assert.ok(offAxis < centre, `spot falls off away from its axis (${offAxis} < ${centre})`);
  assert.ok(lit.sampleSurface(v(0, 0, 0), UP)[0] >= centre, 'sampleSurface includes the direct fixture term');

  const disc = { name: 'lamp', type: 'disc', position: [5, 3, 0], direction: [0, -1, 0], radius: 0.5, intensity: 3, color: [1, 0.8, 0.5] };
  const lamp = makeSampler([floorSlab()], { emitters: [disc] });
  assert.ok(lamp.fixtureIrradiance(v(5, 0, 0), UP) > 0, 'floor under the lamp is lit');
  assert.equal(lamp.fixtureIrradiance(v(5, 3.5, 0), UP), 0, 'a surface above the disc facing away receives nothing');
  const front = lamp.fixtureIrradiance(v(5, 2.5, 0), UP);
  const back = lamp.fixtureIrradiance(v(5, 3.5, 0), DOWN);
  assert.ok(back > 0, 'the diffuser leaks light toward its mounting side');
  assert.ok(back < front, `back side (${back}) is dimmer than the front (${front}) at equal distance`);

  const blocker = new THREE.BoxGeometry(1, 0.2, 1).translate(0, 1.5, 0);
  const shadowed = makeSampler([floorSlab(), blocker], { fixtures: [spot] });
  const inShadow = shadowed.fixtureIrradiance(v(0, 0, 0), UP);
  assert.ok(inShadow < 0.05, `floor under the blocker is shadowed: ${inShadow}`);
});

test('Probes flag cells inside solid geometry and light open air', () => {
  // Probe enclosure rays are 0.35 long, so the box must be smaller than that half-extent.
  const solid = makeSampler([new THREE.BoxGeometry(0.5, 0.5, 0.5)]);
  assert.equal(solid.sampleProbe(v(0, 0, 0))[2], 1, 'probe inside a closed box is enclosed');
  const air = makeSampler([floorSlab()]);
  const [, day, enclosed] = air.sampleProbe(v(0, 2, 0));
  assert.equal(enclosed, 0);
  assert.ok(day > 0, `open-air probe daylight ${day}`);
});

test('Surface samples are deterministic', () => {
  const wall = new THREE.BoxGeometry(0.2, 10, 40).translate(-0.1, 5, 0);
  const sampler = makeSampler([floorSlab(), wall], { albedo: 0.8, sun: { irradiance: 3 } });
  const first = [...sampler.sampleSurface(v(0.5, 0, 0), UP)];
  const second = [...sampler.sampleSurface(v(0.5, 0, 0), UP)];
  assert.deepEqual(second, first);
});

test('BVH faceIndex indexes the reordered BVH index, not trianglePositions directly', () => {
  // MeshBVH generates an index for non-indexed geometry and then reorders it, so the
  // triangle ordinal in trianglePositions is index[faceIndex * 3] / 3.
  const wall = new THREE.BoxGeometry(0.2, 10, 40).translate(-0.1, 5, 0);
  const { bvh, trianglePositions } = makeSampler([floorSlab(), wall]);
  const hit = bvh.raycastFirst(new THREE.Ray(v(3, 2, 1), v(-1, 0, 0)), THREE.DoubleSide);
  assert.ok(hit);
  const ordinal = bvh.geometry.index.getX(hit.faceIndex * 3) / 3;
  const triangle = new THREE.Triangle(
    v(0, 0, 0).fromArray(trianglePositions, ordinal * 9),
    v(0, 0, 0).fromArray(trianglePositions, ordinal * 9 + 3),
    v(0, 0, 0).fromArray(trianglePositions, ordinal * 9 + 6),
  );
  const closest = triangle.closestPointToPoint(hit.point, new THREE.Vector3());
  assert.ok(closest.distanceTo(hit.point) < 1e-4, 'the hit point lies on trianglePositions[index[faceIndex * 3] / 3]');
});
