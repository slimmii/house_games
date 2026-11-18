import * as THREE from 'three';

// Game units are three times metres. Everything here is deterministic so the
// bake reproduces byte-for-byte from the same inputs.

/** Fixture tails below this irradiance are not worth a shadow ray. */
const MIN_CONTRIBUTION = 1 / 255;
export const EPSILON = 0.018;

/** Encode irradiance into one byte with a square-root curve to keep dim tails smooth. */
export function encodeIrradiance(value, max) {
  if (!(value > 0) || !(max > 0)) return 0;
  return Math.round(Math.sqrt(Math.min(value, max) / max) * 255);
}

export function decodeIrradiance(byte, max) {
  const normalized = byte / 255;
  return normalized * normalized * max;
}

/** Cosine-weighted hemisphere directions (Fibonacci spiral), tangent space z = normal. */
export function hemisphereDirections(count) {
  return Array.from({ length: count }, (_, i) => {
    const r = Math.sqrt((i + 0.5) / count);
    const phi = i * Math.PI * (3 - Math.sqrt(5));
    return [r * Math.cos(phi), r * Math.sin(phi), Math.sqrt(Math.max(0, 1 - r * r))];
  });
}

/** Deterministic jitter offsets inside the sun disc, as [u, v] in the unit disc. */
export function sunJitter(count) {
  return Array.from({ length: count }, (_, i) => {
    const r = Math.sqrt((i + 0.5) / count);
    const phi = i * Math.PI * (3 - Math.sqrt(5)) + 0.7;
    return [r * Math.cos(phi), r * Math.sin(phi)];
  });
}

export function prepareFixtures(fixtures, emitters) {
  const prepared = fixtures.map(fixture => ({
    ...fixture,
    positionVector: new THREE.Vector3().fromArray(fixture.position),
    directionVector: new THREE.Vector3().fromArray(fixture.direction).normalize(),
    rightVector: fixture.right ? new THREE.Vector3().fromArray(fixture.right).normalize() : undefined,
  }));
  for (const emitter of emitters) {
    const directionVector = new THREE.Vector3().fromArray(emitter.direction).normalize();
    const helper = Math.abs(directionVector.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const rightVector = new THREE.Vector3().crossVectors(helper, directionVector).normalize();
    const upVector = new THREE.Vector3().crossVectors(directionVector, rightVector).normalize();
    prepared.push({
      ...emitter,
      type: 'disc',
      positionVector: new THREE.Vector3().fromArray(emitter.position),
      directionVector,
      rightVector,
      upVector,
      // Lamp diffusers are translucent: let some light reach the mounting surface behind them.
      backIntensity: emitter.intensity * 0.35,
    });
  }
  return prepared;
}

/**
 * Build the daylight/fixture sampler over a static occluder BVH.
 *
 * `triangleData` supplies per-BVH-triangle albedo (Float32, RGB) so a hit can
 * return bounced light. Direct irradiance at hit triangles is evaluated lazily
 * at the centroid and cached per side.
 */
export function createLightingSampler(bvh, options) {
  const {
    fixtures,
    daylight,
    triangleAlbedo,
    trianglePositions,
    // Optional two-pass lookup: direct irradiance per bake vertex plus each
    // BVH triangle's vertex base and corner indices. Without it, bounce sources
    // are evaluated lazily at triangle centroids (slower, used by tests).
    vertexDirect,
    triangleVertexBase,
    triangleCorners,
    houseBox,
    insideRays = 32,
    bounceRays = insideRays,
    outsideRays = 8,
    nearRays = outsideRays,
    nearMargin = 8,
    centroidRays = 16,
    sunRays = 4,
    escapeDistance = 250,
  } = options;
  const triangleCount = trianglePositions.length / 9;
  // MeshBVH reorders its index: map a hit's faceIndex back to the source triangle.
  const bvhIndex = bvh.geometry.index;
  const faceToTriangle = new Uint32Array(triangleCount);
  for (let face = 0; face < triangleCount; face++) faceToTriangle[face] = bvhIndex.getX(face * 3) / 3;
  // Lazy direct irradiance per triangle: [front fixture, front day, back fixture, back day].
  const triangleDirect = new Float32Array(triangleCount * 4).fill(NaN);
  const ray = new THREE.Ray();
  const origin = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const toLight = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const bitangent = new THREE.Vector3();
  const helper = new THREE.Vector3();
  const sample = new THREE.Vector3();
  const centroid = new THREE.Vector3();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const faceNormal = new THREE.Vector3();
  const sunOrigin = new THREE.Vector3();
  const sunRay = new THREE.Vector3();
  const centroidOrigin = new THREE.Vector3();
  const centroidRay = new THREE.Vector3();
  const centroidTangent = new THREE.Vector3();
  const centroidBitangent = new THREE.Vector3();
  const centroidHelper = new THREE.Vector3();
  const sunDirection = new THREE.Vector3().fromArray(daylight.sun.direction).normalize();
  const sunTangent = new THREE.Vector3();
  const sunBitangent = new THREE.Vector3();
  helper.set(0, Math.abs(sunDirection.y) < 0.9 ? 1 : 0, Math.abs(sunDirection.y) < 0.9 ? 0 : 1);
  sunTangent.crossVectors(helper, sunDirection).normalize();
  sunBitangent.crossVectors(sunDirection, sunTangent);
  const sunOffsets = sunJitter(sunRays);
  const sunSin = Math.sin(daylight.sun.angularRadius);
  const inside = hemisphereDirections(insideRays);
  const bounceInside = hemisphereDirections(bounceRays);
  const near = hemisphereDirections(nearRays);
  const outside = hemisphereDirections(outsideRays);
  const centroidDirections = hemisphereDirections(centroidRays);
  const stats = { rays: 0, triangleEvaluations: 0 };

  function castFirst(from, dir, far) {
    ray.origin.copy(from);
    ray.direction.copy(dir);
    stats.rays += 1;
    return bvh.raycastFirst(ray, THREE.DoubleSide, 0, far);
  }

  const shadowOrigin = new THREE.Vector3();
  const shadowRay = new THREE.Vector3();
  function visible(position, normal, lightPosition) {
    shadowOrigin.copy(position).addScaledVector(normal, EPSILON);
    shadowRay.copy(lightPosition).sub(shadowOrigin);
    const distance = shadowRay.length();
    shadowRay.multiplyScalar(1 / distance);
    return castFirst(shadowOrigin, shadowRay, Math.max(0, distance - EPSILON * 2)) === null;
  }

  function spotIrradiance(fixture, position, normal) {
    toLight.copy(fixture.positionVector).sub(position);
    const distance = toLight.length();
    if (distance <= EPSILON || distance >= fixture.distance) return 0;
    toLight.multiplyScalar(1 / distance);
    const normalCos = normal.dot(toLight);
    if (normalCos <= 0) return 0;
    const angleCos = -fixture.directionVector.dot(toLight);
    const outerCos = Math.cos(fixture.angle);
    const innerCos = Math.cos(fixture.angle * (1 - fixture.penumbra));
    if (angleCos <= outerCos) return 0;
    const t = THREE.MathUtils.clamp((angleCos - outerCos) / Math.max(1e-6, innerCos - outerCos), 0, 1);
    const cone = t * t * (3 - 2 * t);
    const cutoff = Math.max(0, 1 - (distance / fixture.distance) ** 4) ** 2;
    const candidate = fixture.intensity * cone * cutoff * normalCos / (Math.PI * Math.max(distance * distance, 0.01));
    return candidate > MIN_CONTRIBUTION && visible(position, normal, fixture.positionVector) ? candidate : 0;
  }

  function areaIrradiance(fixture, position, normal) {
    const samples = 5;
    let result = 0;
    for (let i = 0; i < samples; i++) {
      const across = ((i + 0.5) / samples - 0.5) * fixture.width;
      sample.copy(fixture.positionVector).addScaledVector(fixture.rightVector, across);
      toLight.copy(sample).sub(position);
      const distance = toLight.length();
      if (distance <= EPSILON) continue;
      toLight.multiplyScalar(1 / distance);
      const surfaceCos = normal.dot(toLight);
      const emitterCos = -fixture.directionVector.dot(toLight);
      if (surfaceCos <= 0 || emitterCos <= 0) continue;
      const candidate = fixture.intensity * fixture.width * fixture.height * surfaceCos * emitterCos
        / (samples * Math.PI * Math.max(distance * distance, 0.01));
      if (candidate > MIN_CONTRIBUTION && visible(position, normal, sample)) result += candidate;
    }
    return result;
  }

  // Five-point disc: centre plus four rim points. Light leaves both faces of the
  // diffuser, the mounting side at reduced strength.
  const discOffsets = [[0, 0], [0.7, 0], [-0.7, 0], [0, 0.7], [0, -0.7]];
  function discIrradiance(fixture, position, normal) {
    let result = 0;
    for (const [u, v] of discOffsets) {
      // Sample just in front of the diffuser (inside its rim) so the lamp's own
      // housing cannot shadow grazing rays and streak distant walls.
      sample.copy(fixture.positionVector)
        .addScaledVector(fixture.directionVector, 0.05)
        .addScaledVector(fixture.rightVector, u * fixture.radius * 0.8)
        .addScaledVector(fixture.upVector, v * fixture.radius * 0.8);
      toLight.copy(sample).sub(position);
      const distance = toLight.length();
      if (distance <= EPSILON) continue;
      toLight.multiplyScalar(1 / distance);
      const surfaceCos = normal.dot(toLight);
      if (surfaceCos <= 0) continue;
      const emitterCos = -fixture.directionVector.dot(toLight);
      const intensity = emitterCos >= 0 ? fixture.intensity : fixture.backIntensity;
      const candidate = intensity * surfaceCos * Math.abs(emitterCos)
        / (discOffsets.length * Math.PI * Math.max(distance * distance, 0.04));
      if (candidate > MIN_CONTRIBUTION && visible(position, normal, sample)) result += candidate;
    }
    return result;
  }

  const fixtureGain = daylight.fixtureGain ?? 1;
  function fixtureIrradiance(position, normal) {
    let total = 0;
    for (const fixture of fixtures) {
      total += fixture.type === 'spot' ? spotIrradiance(fixture, position, normal)
        : fixture.type === 'area' ? areaIrradiance(fixture, position, normal)
          : discIrradiance(fixture, position, normal);
    }
    return total * fixtureGain;
  }

  function sunIrradiance(position, normal) {
    const cosine = normal.dot(sunDirection);
    if (cosine <= 0) return 0;
    sunOrigin.copy(position).addScaledVector(normal, EPSILON);
    let lit = 0;
    for (const [u, v] of sunOffsets) {
      sunRay.copy(sunDirection)
        .addScaledVector(sunTangent, u * sunSin)
        .addScaledVector(sunBitangent, v * sunSin)
        .normalize();
      if (sunRay.dot(normal) <= 0) continue;
      if (castFirst(sunOrigin, sunRay, escapeDistance) === null) lit += 1;
    }
    return daylight.sun.irradiance * cosine * lit / sunOffsets.length;
  }

  function insideHouse(position, margin = 0) {
    return position.x >= houseBox.min[0] - margin && position.x <= houseBox.max[0] + margin
      && position.y >= houseBox.min[1] - margin && position.y <= houseBox.max[1] + margin
      && position.z >= houseBox.min[2] - margin && position.z <= houseBox.max[2] + margin;
  }
  /** Facades, roof and terrace get the full ray count; distant garden foliage gets few. */
  const directionsFor = (position, insideSet) => insideHouse(position) ? insideSet
    : insideHouse(position, nearMargin) ? near : outside;

  function frame(normal) {
    helper.set(0, Math.abs(normal.y) < 0.9 ? 1 : 0, Math.abs(normal.y) < 0.9 ? 0 : 1);
    tangent.crossVectors(helper, normal).normalize();
    bitangent.crossVectors(normal, tangent);
  }

  /** Direct fixture/daylight irradiance at a BVH triangle centroid, cached per side. */
  function triangleDirectIrradiance(faceIndex, towardRay) {
    const triangleIndex = faceToTriangle[faceIndex];
    const base = triangleIndex * 9;
    a.fromArray(trianglePositions, base);
    b.fromArray(trianglePositions, base + 3);
    c.fromArray(trianglePositions, base + 6);
    faceNormal.subVectors(b, a).cross(centroidHelper.subVectors(c, a)).normalize();
    // Light the side that faces the incoming ray.
    const back = faceNormal.dot(towardRay) > 0;
    const slot = triangleIndex * 4 + (back ? 2 : 0);
    if (!Number.isNaN(triangleDirect[slot])) return slot;
    centroid.copy(a).add(b).add(c).multiplyScalar(1 / 3);
    const normal = back ? faceNormal.negate() : faceNormal;
    stats.triangleEvaluations += 1;
    const fixture = fixtureIrradiance(centroid, normal);
    let sky = 0;
    centroidHelper.set(0, Math.abs(normal.y) < 0.9 ? 1 : 0, Math.abs(normal.y) < 0.9 ? 0 : 1);
    centroidTangent.crossVectors(centroidHelper, normal).normalize();
    centroidBitangent.crossVectors(normal, centroidTangent);
    centroidOrigin.copy(centroid).addScaledVector(normal, EPSILON);
    for (const [x, y, z] of centroidDirections) {
      centroidRay.copy(normal).multiplyScalar(z).addScaledVector(centroidTangent, x).addScaledVector(centroidBitangent, y);
      if (centroidRay.y > 0 && castFirst(centroidOrigin, centroidRay, escapeDistance) === null) sky += 1;
    }
    const day = daylight.sky.irradiance * sky / centroidDirections.length + sunIrradiance(centroid, normal);
    triangleDirect[slot] = fixture;
    triangleDirect[slot + 1] = day;
    return slot;
  }

  /** Direct irradiance only: fixtures, sky visibility and the soft sun. Returns [fixture, daylight]. */
  function sampleDirect(position, normal, out = [0, 0]) {
    const directions = directionsFor(position, inside);
    let sky = 0;
    frame(normal);
    origin.copy(position).addScaledVector(normal, EPSILON);
    for (const [x, y, z] of directions) {
      direction.copy(normal).multiplyScalar(z).addScaledVector(tangent, x).addScaledVector(bitangent, y);
      if (direction.y > 0 && castFirst(origin, direction, escapeDistance) === null) sky += 1;
    }
    out[0] = fixtureIrradiance(position, normal);
    out[1] = daylight.sky.irradiance * sky / directions.length + sunIrradiance(position, normal);
    return out;
  }

  /** Average direct irradiance of a hit triangle's corners on the side facing the ray. */
  function lookupDirect(faceIndex, towardRay, out) {
    const triangleIndex = faceToTriangle[faceIndex];
    const base = triangleIndex * 9;
    a.fromArray(trianglePositions, base);
    b.fromArray(trianglePositions, base + 3);
    c.fromArray(trianglePositions, base + 6);
    faceNormal.subVectors(b, a).cross(centroidHelper.subVectors(c, a));
    const back = faceNormal.dot(towardRay) > 0;
    if (vertexDirect) {
      const vertexBase = triangleVertexBase[triangleIndex];
      const fixtureChannel = back ? 1 : 0;
      const dayChannel = back ? 3 : 2;
      let fixture = 0;
      let day = 0;
      for (let corner = 0; corner < 3; corner++) {
        const vertex = (vertexBase + triangleCorners[triangleIndex * 3 + corner]) * 4;
        fixture += vertexDirect[vertex + fixtureChannel];
        day += vertexDirect[vertex + dayChannel];
      }
      out[0] = fixture / 3;
      out[1] = day / 3;
      return out;
    }
    const slot = triangleDirectIrradiance(faceIndex, towardRay);
    out[0] = triangleDirect[slot];
    out[1] = triangleDirect[slot + 1];
    return out;
  }

  /** One bounce gathered over the cosine-weighted hemisphere. Returns [fixture, daylight], already scaled by the gain. */
  const hitDirect = [0, 0];
  function gatherBounce(position, normal, out = [0, 0]) {
    const directions = directionsFor(position, bounceInside);
    let bounceFixture = 0;
    let bounceDay = 0;
    frame(normal);
    origin.copy(position).addScaledVector(normal, EPSILON);
    for (const [x, y, z] of directions) {
      direction.copy(normal).multiplyScalar(z).addScaledVector(tangent, x).addScaledVector(bitangent, y);
      const hit = castFirst(origin, direction, escapeDistance);
      // Coincident duplicate geometry would otherwise reflect light back onto itself.
      if (hit === null || hit.distance < EPSILON * 2) continue;
      lookupDirect(hit.faceIndex, direction, hitDirect);
      const albedoOffset = faceToTriangle[hit.faceIndex] * 3;
      const albedo = (triangleAlbedo[albedoOffset] + triangleAlbedo[albedoOffset + 1] + triangleAlbedo[albedoOffset + 2]) / 3;
      bounceFixture += albedo * hitDirect[0];
      bounceDay += albedo * hitDirect[1];
    }
    out[0] = daylight.bounce.gain * bounceFixture / directions.length;
    out[1] = daylight.bounce.gain * bounceDay / directions.length;
    return out;
  }

  /** Direct plus one bounce. Returns [fixture, daylight]. */
  const bounce = [0, 0];
  function sampleSurface(position, normal, out = [0, 0]) {
    sampleDirect(position, normal, out);
    gatherBounce(position, normal, bounce);
    out[0] += bounce[0];
    out[1] += bounce[1];
    return out;
  }

  /** Average irradiance over six axis directions for a free-space probe cell. */
  const axes = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  const probeNormal = new THREE.Vector3();
  const probeOut = [0, 0];
  function sampleProbe(position, out = [0, 0, 0]) {
    let fixture = 0;
    let day = 0;
    let enclosed = 0;
    for (const axis of axes) {
      probeNormal.fromArray(axis);
      // A short ray that enters a back face means the cell centre sits inside solid geometry.
      const hit = castFirst(position, probeNormal, 0.35);
      if (hit && hit.face && hit.face.normal.dot(probeNormal) > 0) enclosed += 1;
      sampleSurface(position, probeNormal, probeOut);
      fixture += probeOut[0];
      day += probeOut[1];
    }
    out[0] = fixture / axes.length;
    out[1] = day / axes.length;
    out[2] = enclosed >= 2 ? 1 : 0;
    return out;
  }

  return { sampleSurface, sampleDirect, gatherBounce, sampleProbe, fixtureIrradiance, sunIrradiance, stats };
}
