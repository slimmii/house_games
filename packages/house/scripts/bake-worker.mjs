import { parentPort, workerData } from 'node:worker_threads';
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { createLightingSampler, prepareFixtures } from './daylight-gather.mjs';

// One worker per core. Each rebuilds the static BVH from the shared triangle
// positions (a few seconds) and then answers bake tasks until it is told to stop.
const { trianglePositions, triangleAlbedo, triangleVertexBase, triangleCorners, vertexDirect, fixtures, emitters, daylight, houseBox, sampling } = workerData;
const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(trianglePositions), 3));
const bvh = new MeshBVH(geometry, { targetLeafSize: 24 });
const sampler = createLightingSampler(bvh, {
  fixtures: prepareFixtures(fixtures, emitters),
  daylight,
  triangleAlbedo: new Float32Array(triangleAlbedo),
  trianglePositions: new Float32Array(trianglePositions),
  vertexDirect: new Float32Array(vertexDirect),
  triangleVertexBase: new Uint32Array(triangleVertexBase),
  triangleCorners: new Uint32Array(triangleCorners),
  houseBox,
  ...sampling,
});

const point = new THREE.Vector3();
const normal = new THREE.Vector3();
const localPoint = new THREE.Vector3();
const localNormal = new THREE.Vector3();
const corner = new THREE.Vector3();
const cornerNormal = new THREE.Vector3();
const matrix = new THREE.Matrix4();
const normalMatrix = new THREE.Matrix3();
const result = [0, 0];

function forEachSubTriangle(level, visit) {
  const denominator = 1 << level;
  const recurse = (remaining, a, b, c) => {
    if (remaining === 0) {
      visit(a, b, c, denominator);
      return;
    }
    const ab = a.map((value, i) => (value + b[i]) / 2);
    const bc = b.map((value, i) => (value + c[i]) / 2);
    const ca = c.map((value, i) => (value + a[i]) / 2);
    recurse(remaining - 1, a, ab, ca);
    recurse(remaining - 1, ab, b, bc);
    recurse(remaining - 1, ca, bc, c);
    recurse(remaining - 1, ab, bc, ca);
  };
  recurse(level, [denominator, 0, 0], [0, denominator, 0], [0, 0, denominator]);
}

/**
 * Bake one primitive: source vertices first, then the subdivision vertices in
 * exactly the order the runtime `subdivideGeometry` creates them. Output is
 * Float32 [fixtureFront, fixtureBack, dayFront, dayBack] per vertex.
 */
function bakePrimitive(task, mode) {
  const { positions, normals, indices, levels, vertexCount, sourceVertexCount, triangleCount, backSide } = task;
  // 'bounce' gathers from direct light, 'bounce2' from direct plus the first bounce.
  const evaluate = mode === 'direct' ? sampler.sampleDirect : sampler.gatherBounce;
  matrix.fromArray(task.matrix);
  normalMatrix.getNormalMatrix(matrix);
  const output = new Float32Array(vertexCount * 4);
  // The bounce pass also reports world positions/normals so the main thread can
  // smooth low-frequency daylight across neighbouring samples.
  const samples = mode === 'bounce' ? new Float32Array(vertexCount * 6) : null;
  const write = (vertexIndex, localPosition, localVertexNormal) => {
    point.copy(localPosition).applyMatrix4(matrix);
    normal.copy(localVertexNormal).applyMatrix3(normalMatrix).normalize();
    if (samples) {
      point.toArray(samples, vertexIndex * 6);
      normal.toArray(samples, vertexIndex * 6 + 3);
    }
    const offset = vertexIndex * 4;
    evaluate(point, normal, result);
    output[offset] = result[0];
    output[offset + 2] = result[1];
    // Front-culled closed solids never show their back faces; skip that work.
    if (!backSide) return;
    normal.negate();
    evaluate(point, normal, result);
    output[offset + 1] = result[0];
    output[offset + 3] = result[1];
  };
  for (let i = 0; i < sourceVertexCount; i++) {
    localPoint.fromArray(positions, i * 3);
    localNormal.fromArray(normals, i * 3);
    write(i, localPoint, localNormal);
  }
  let addedIndex = sourceVertexCount;
  for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex++) {
    const level = levels[triangleIndex];
    if (!level) continue;
    const offset = triangleIndex * 3;
    const sourceIndices = indices
      ? [indices[offset], indices[offset + 1], indices[offset + 2]]
      : [offset, offset + 1, offset + 2];
    const barycentricVertices = new Map();
    const ensureBarycentric = (barycentric, denominator) => {
      const key = barycentric.join(',');
      if (barycentric[0] === denominator) return sourceIndices[0];
      if (barycentric[1] === denominator) return sourceIndices[1];
      if (barycentric[2] === denominator) return sourceIndices[2];
      const existing = barycentricVertices.get(key);
      if (existing !== undefined) return existing;
      localPoint.set(0, 0, 0);
      localNormal.set(0, 0, 0);
      for (let c = 0; c < 3; c++) {
        const weight = barycentric[c] / denominator;
        corner.fromArray(positions, sourceIndices[c] * 3);
        cornerNormal.fromArray(normals, sourceIndices[c] * 3);
        localPoint.addScaledVector(corner, weight);
        localNormal.addScaledVector(cornerNormal, weight);
      }
      const index = addedIndex++;
      barycentricVertices.set(key, index);
      write(index, localPoint, localNormal);
      return index;
    };
    forEachSubTriangle(level, (a, b, c, denominator) => {
      ensureBarycentric(a, denominator);
      ensureBarycentric(b, denominator);
      ensureBarycentric(c, denominator);
    });
  }
  if (addedIndex !== vertexCount) throw new Error(`Subdivision vertex mismatch for primitive ${task.key}`);
  return { output, samples };
}

const probeResult = [0, 0, 0];
function bakeProbes(task) {
  const { centres } = task;
  const output = new Float32Array((centres.length / 3) * 3);
  for (let i = 0; i < centres.length / 3; i++) {
    point.fromArray(centres, i * 3);
    sampler.sampleProbe(point, probeResult);
    output[i * 3] = probeResult[0];
    output[i * 3 + 1] = probeResult[1];
    output[i * 3 + 2] = probeResult[2];
  }
  return output;
}

parentPort.on('message', message => {
  if (message.type === 'stop') {
    parentPort.postMessage({ type: 'stopped', stats: sampler.stats });
    parentPort.close();
    return;
  }
  if (message.type === 'primitives') {
    // The final gather carries the gain that stands in for further bounces.
    daylight.bounce.gain = message.gain ?? 1;
    const baked = message.tasks.map(task => bakePrimitive(task, message.mode));
    const results = baked.map(item => item.output);
    const samples = baked.map(item => item.samples);
    parentPort.postMessage(
      { type: 'primitives', mode: message.mode, keys: message.tasks.map(task => task.key), results, samples },
      [...results.map(output => output.buffer), ...samples.filter(Boolean).map(array => array.buffer)],
    );
    return;
  }
  if (message.type === 'probes') {
    const output = bakeProbes(message);
    parentPort.postMessage({ type: 'probes', id: message.id, output }, [output.buffer]);
  }
});
parentPort.postMessage({ type: 'ready', triangles: trianglePositions.byteLength / 36 });
