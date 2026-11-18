import * as THREE from 'three';
import daylight from '../shared/daylight.json';
import type { GLTFParser } from 'three/addons/loaders/GLTFLoader.js';

const MANIFEST_URL = '/models/house-baked-lighting.json';
const ATTRIBUTE_NAME = 'bakedFixtureLight';
const SHADER_TAG = 'house-baked-irradiance-v3';

interface PrimitiveBake {
  node: number;
  mesh: number;
  primitive: number;
  sourceVertexCount: number;
  sourceIndexCount: number;
  triangleCount: number;
  subdivisionByteOffset: number;
  vertexCount: number;
  byteOffset: number;
}

interface BakedLightingManifest {
  version: 3;
  data: string;
  byteLength: number;
  dataSha256: string;
  channels: 4;
  maxFixture: number;
  maxDaylight: number;
  color: [number, number, number];
  skyColor: [number, number, number];
  sourceFiles: Record<string, string>;
  fixturesSha256: string;
  subdivision: {
    data: string;
    byteLength: number;
    sha256: string;
    targetSpacing: number;
    maxLevel: number;
    sourceTriangles: number;
    renderedTriangles: number;
    addedVertices: number;
  };
  volume: {
    data: string;
    byteLength: number;
    sha256: string;
    dims: [number, number, number];
    origin: [number, number, number];
    cellSize: number;
  };
  entries: PrimitiveBake[];
}

/** Baked irradiance parameters shared by the vertex bake and the probe volume. */
export interface BakedLightingParams {
  maxFixture: number;
  maxDaylight: number;
  fixtureColor: [number, number, number];
  skyColor: [number, number, number];
}

/** Probe grid for objects that carry no vertex bake (doors, drones, paint). */
export interface IrradianceVolume extends BakedLightingParams {
  data: Uint8Array;
  dims: [number, number, number];
  origin: [number, number, number];
  cellSize: number;
}

interface HouseGpuManifest {
  sourceSha256: string;
  outputSha256: string;
}

export interface BakedLightingStatus {
  applied: boolean;
  reason?: string;
  meshes: number;
  vertices: number;
  bytes: number;
  volume?: IrradianceVolume;
}

type ParserAssociations = Pick<GLTFParser, 'associations'>;

interface BakeTarget {
  object: THREE.Mesh;
  entry: PrimitiveBake;
  key: string;
}

function bakeKey(node: number, mesh: number, primitive: number): string {
  return `${node}:${mesh}:${primitive}`;
}

function forEachSubTriangle(
  level: number,
  visit: (a: number[], b: number[], c: number[], denominator: number) => void,
): void {
  const denominator = 1 << level;
  const recurse = (remaining: number, a: number[], b: number[], c: number[]): void => {
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

function subdivideGeometry(
  source: THREE.BufferGeometry,
  levels: Uint8Array,
  entry: PrimitiveBake,
): THREE.BufferGeometry {
  const result = new THREE.BufferGeometry();
  result.name = source.name;
  result.userData = { ...source.userData };
  const attributes = Object.entries(source.attributes) as Array<[
    string, THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  ]>;
  for (const [name, attribute] of attributes) {
    const ArrayType = attribute.array.constructor as new (length: number) => THREE.TypedArray;
    const output = new THREE.BufferAttribute(
      new ArrayType(entry.vertexCount * attribute.itemSize), attribute.itemSize, attribute.normalized,
    );
    if (attribute instanceof THREE.BufferAttribute) output.gpuType = attribute.gpuType;
    for (let vertex = 0; vertex < entry.sourceVertexCount; vertex++) {
      for (let component = 0; component < attribute.itemSize; component++) {
        output.setComponent(vertex, component, attribute.getComponent(vertex, component));
      }
    }
    result.setAttribute(name, output);
  }

  const sourceIndex = source.index;
  const outputIndices: number[] = [];
  let addedIndex = entry.sourceVertexCount;
  for (let triangleIndex = 0; triangleIndex < entry.triangleCount; triangleIndex++) {
    const offset = triangleIndex * 3;
    const sourceIndices = [
      sourceIndex ? sourceIndex.getX(offset) : offset,
      sourceIndex ? sourceIndex.getX(offset + 1) : offset + 1,
      sourceIndex ? sourceIndex.getX(offset + 2) : offset + 2,
    ];
    const level = levels[triangleIndex];
    if (!level) {
      outputIndices.push(...sourceIndices);
      continue;
    }
    const barycentricVertices = new Map<string, number>();
    const ensureBarycentric = (barycentric: number[], denominator: number): number => {
      if (barycentric[0] === denominator) return sourceIndices[0];
      if (barycentric[1] === denominator) return sourceIndices[1];
      if (barycentric[2] === denominator) return sourceIndices[2];
      const key = barycentric.join(',');
      const existing = barycentricVertices.get(key);
      if (existing !== undefined) return existing;
      const targetIndex = addedIndex++;
      barycentricVertices.set(key, targetIndex);
      for (const [name, attribute] of attributes) {
        const output = result.getAttribute(name) as THREE.BufferAttribute;
        for (let component = 0; component < attribute.itemSize; component++) {
          let value = 0;
          for (let corner = 0; corner < 3; corner++) {
            value += attribute.getComponent(sourceIndices[corner], component)
              * barycentric[corner] / denominator;
          }
          output.setComponent(targetIndex, component, value);
        }
      }
      return targetIndex;
    };
    forEachSubTriangle(level, (a, b, c, denominator) => {
      outputIndices.push(
        ensureBarycentric(a, denominator),
        ensureBarycentric(b, denominator),
        ensureBarycentric(c, denominator),
      );
    });
  }
  if (addedIndex !== entry.vertexCount) throw new Error(`subdivision mismatch for ${entry.node}:${entry.mesh}:${entry.primitive}`);
  const IndexArray = entry.vertexCount <= 65535 ? Uint16Array : Uint32Array;
  result.setIndex(new THREE.BufferAttribute(new IndexArray(outputIndices), 1));
  result.computeBoundingBox();
  result.computeBoundingSphere();
  return result;
}

const vec3 = (color: readonly number[]) => `vec3(${color.map(value => value.toFixed(6)).join(', ')})`;
/** Even base light on top of the bake (daylight.json ambientFill; `?fill=` overrides strength). */
export function ambientFillGlsl(): string {
  const fill = daylight.ambientFill;
  const query = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('fill');
  const strength = query !== null && Number.isFinite(Number(query)) ? Number(query) : fill.strength;
  return vec3(fill.color.map(value => value * strength));
}
/** ?show=daylight|fixture|nospec renders one baked term on its own for tuning. */
const SHOW = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('show');

/** GLSL that turns decoded fixture/daylight irradiance into the material's indirect light. */
export function bakedIrradianceGlsl(params: BakedLightingParams, fixture: string, daylight: string): string {
  return `
float bakedFixtureIrradiance = ${fixture} * ${fixture} * ${params.maxFixture.toFixed(6)};
float bakedDaylightIrradiance = ${daylight} * ${daylight} * ${params.maxDaylight.toFixed(6)};
// The bake is the only diffuse ambient term: it already contains sky, sun and bounce.
reflectedLight.indirectDiffuse = material.diffuseColor * (
  ${vec3(params.skyColor)} * bakedDaylightIrradiance + ${vec3(params.fixtureColor)} * bakedFixtureIrradiance
  + ${ambientFillGlsl()});
// Environment reflections are only visible where daylight reaches.
reflectedLight.indirectSpecular *= clamp(bakedDaylightIrradiance * ${(2 / Math.max(params.maxDaylight, 1e-3)).toFixed(6)}, 0.15, 1.0);
${SHOW === 'daylight' ? 'reflectedLight.indirectDiffuse = vec3(bakedDaylightIrradiance); reflectedLight.indirectSpecular = vec3(0.0);' : ''}
${SHOW === 'fixture' ? 'reflectedLight.indirectDiffuse = vec3(bakedFixtureIrradiance); reflectedLight.indirectSpecular = vec3(0.0);' : ''}
${SHOW === 'nospec' ? 'reflectedLight.indirectSpecular = vec3(0.0);' : ''}`;
}

let installedParams: BakedLightingParams | undefined;

export function installBakedShader(material: THREE.Material, params: BakedLightingParams): void {
  if (!(material instanceof THREE.MeshStandardMaterial) || material.userData.bakedFixtureLighting) return;
  material.userData.bakedFixtureLighting = { ...params };
  const previousCompile = material.onBeforeCompile;
  const previousCacheKey = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    previousCompile(shader, renderer);
    // Closed solids are already culled to one side. Avoid transporting and
    // selecting the invisible side's lighting on those materials.
    // ?show=front ignores gl_FrontFacing on double-sided materials (diagnostic).
    const fixtureValue = material.side === THREE.FrontSide || SHOW === 'front' ? 'vBakedFixtureLight.x'
      : material.side === THREE.BackSide ? 'vBakedFixtureLight.y'
        : '( gl_FrontFacing ? vBakedFixtureLight.x : vBakedFixtureLight.y )';
    const daylightValue = material.side === THREE.FrontSide || SHOW === 'front' ? 'vBakedFixtureLight.z'
      : material.side === THREE.BackSide ? 'vBakedFixtureLight.w'
        : '( gl_FrontFacing ? vBakedFixtureLight.z : vBakedFixtureLight.w )';
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nattribute vec4 ${ATTRIBUTE_NAME};\nvarying vec4 vBakedFixtureLight;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvBakedFixtureLight = ${ATTRIBUTE_NAME};`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec4 vBakedFixtureLight;')
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>${bakedIrradianceGlsl(params, fixtureValue, daylightValue)}`);
  };
  material.customProgramCacheKey = () => `${previousCacheKey()}|${SHADER_TAG}|${material.side}|${SHOW ?? ''}|${ambientFillGlsl()}`;
  material.needsUpdate = true;
}

/**
 * Clones made after the bake copy `userData` but not the compile hook. Call this
 * on such clones (moving cupboard fronts) so they keep the baked appearance.
 */
export function reinstallBakedShader(material: THREE.Material): void {
  if (!installedParams) return;
  delete material.userData.bakedFixtureLighting;
  installBakedShader(material, installedParams);
}

/**
 * Attach fixture irradiance and ambient visibility baked against the exact glTF node and
 * primitive layout. Returns disabled on any mismatch so callers can retain the
 * live-light fallback instead of showing a partially lit house.
 */
export async function applyBakedFixtureLighting(
  root: THREE.Group,
  parser: ParserAssociations,
  assetPath: string,
): Promise<BakedLightingStatus> {
  const disabled = (reason: string): BakedLightingStatus => {
    const status = { applied: false, reason, meshes: 0, vertices: 0, bytes: 0 };
    root.userData.bakedFixtureLighting = status;
    return status;
  };

  try {
    if (new URLSearchParams(location.search).get('lighting') === 'live') {
      return disabled('live fixture lighting requested');
    }
    if (new URLSearchParams(location.search).get('style') !== 'classic') {
      return disabled('unbaked style requested');
    }
    const [manifestResponse, houseManifestResponse] = await Promise.all([
      fetch(MANIFEST_URL), fetch('/models/house-gpu-manifest.json'),
    ]);
    if (!manifestResponse.ok) return disabled(`manifest HTTP ${manifestResponse.status}`);
    if (!houseManifestResponse.ok) return disabled(`house manifest HTTP ${houseManifestResponse.status}`);
    const [manifest, houseManifest] = await Promise.all([
      manifestResponse.json() as Promise<BakedLightingManifest>,
      houseManifestResponse.json() as Promise<HouseGpuManifest>,
    ]);
    if (manifest.version !== 3 || manifest.channels !== 4 || !manifest.sourceFiles[assetPath]) {
      return disabled(`bake does not match ${assetPath}`);
    }
    const currentAssetHash = assetPath === '/models/house.glb'
      ? houseManifest.sourceSha256 : houseManifest.outputSha256;
    if (manifest.sourceFiles[assetPath] !== currentAssetHash) {
      return disabled(`bake hash is stale for ${assetPath}`);
    }
    const dataUrl = new URL(manifest.data, new URL(MANIFEST_URL, location.origin));
    const topologyUrl = new URL(manifest.subdivision.data, new URL(MANIFEST_URL, location.origin));
    const volumeUrl = new URL(manifest.volume.data, new URL(MANIFEST_URL, location.origin));
    const [dataResponse, topologyResponse, volumeResponse] = await Promise.all([fetch(dataUrl), fetch(topologyUrl), fetch(volumeUrl)]);
    if (!dataResponse.ok) return disabled(`data HTTP ${dataResponse.status}`);
    if (!topologyResponse.ok) return disabled(`topology HTTP ${topologyResponse.status}`);
    if (!volumeResponse.ok) return disabled(`volume HTTP ${volumeResponse.status}`);
    const [buffer, topologyBuffer, volumeBuffer] = await Promise.all([
      dataResponse.arrayBuffer(), topologyResponse.arrayBuffer(), volumeResponse.arrayBuffer(),
    ]);
    if (volumeBuffer.byteLength !== manifest.volume.byteLength) {
      return disabled(`volume length ${volumeBuffer.byteLength} != ${manifest.volume.byteLength}`);
    }
    if (buffer.byteLength !== manifest.byteLength) {
      return disabled(`data length ${buffer.byteLength} != ${manifest.byteLength}`);
    }
    if (topologyBuffer.byteLength !== manifest.subdivision.byteLength) {
      return disabled(`topology length ${topologyBuffer.byteLength} != ${manifest.subdivision.byteLength}`);
    }
    // SubtleCrypto is absent on insecure LAN origins. The build-time verifier
    // always hashes this file; use the stronger runtime check when available.
    if (globalThis.crypto?.subtle) {
      const digest = await globalThis.crypto.subtle.digest('SHA-256', buffer);
      const actualDataHash = Array.from(new Uint8Array(digest))
        .map(value => value.toString(16).padStart(2, '0')).join('');
      if (actualDataHash !== manifest.dataSha256) return disabled('baked data hash mismatch');
      const topologyDigest = await globalThis.crypto.subtle.digest('SHA-256', topologyBuffer);
      const actualTopologyHash = Array.from(new Uint8Array(topologyDigest))
        .map(value => value.toString(16).padStart(2, '0')).join('');
      if (actualTopologyHash !== manifest.subdivision.sha256) return disabled('subdivision data hash mismatch');
      const volumeDigest = await globalThis.crypto.subtle.digest('SHA-256', volumeBuffer);
      const actualVolumeHash = Array.from(new Uint8Array(volumeDigest))
        .map(value => value.toString(16).padStart(2, '0')).join('');
      if (actualVolumeHash !== manifest.volume.sha256) return disabled('irradiance volume hash mismatch');
    }

    const entries = new Map(manifest.entries.map(entry => [
      bakeKey(entry.node, entry.mesh, entry.primitive), entry,
    ]));
    const used = new Set<string>();
    const targets: BakeTarget[] = [];
    let meshes = 0;
    let vertices = 0;
    let mismatch: string | undefined;

    root.traverse(object => {
      if (mismatch || !(object instanceof THREE.Mesh)) return;
      const association = parser.associations.get(object);
      // GLTFLoader records primitive indices, but its typings omit that field.
      const primitiveIndex = association && 'primitives' in association
        && typeof association.primitives === 'number' ? association.primitives : undefined;
      let ancestor: THREE.Object3D | null = object;
      let nodeIndex: number | undefined;
      while (ancestor && nodeIndex === undefined) {
        nodeIndex = parser.associations.get(ancestor)?.nodes;
        ancestor = ancestor.parent;
      }
      if (nodeIndex === undefined || association?.meshes === undefined || primitiveIndex === undefined) {
        mismatch = `missing glTF association for ${object.name}`;
        return;
      }
      const key = bakeKey(nodeIndex, association.meshes, primitiveIndex);
      const entry = entries.get(key);
      const sourceVertexCount = object.geometry.getAttribute('position')?.count;
      const sourceIndexCount = object.geometry.index?.count ?? sourceVertexCount;
      if (!entry || sourceVertexCount !== entry.sourceVertexCount || sourceIndexCount !== entry.sourceIndexCount) {
        mismatch = `primitive ${key} source layout does not match bake`;
        return;
      }
      if (entry.byteOffset < 0 || entry.byteOffset + entry.vertexCount * 4 > buffer.byteLength) {
        mismatch = `primitive ${key} points outside baked data`;
        return;
      }
      if (entry.subdivisionByteOffset < 0
        || entry.subdivisionByteOffset + entry.triangleCount > topologyBuffer.byteLength) {
        mismatch = `primitive ${key} points outside subdivision data`;
        return;
      }
      if (entry.vertexCount > entry.sourceVertexCount && Object.keys(object.geometry.morphAttributes).length) {
        mismatch = `primitive ${key} cannot subdivide morph targets`;
        return;
      }

      targets.push({ object, entry, key });
      used.add(key);
      meshes += 1;
      vertices += entry.vertexCount;
    });

    if (mismatch) return disabled(mismatch);
    if (used.size !== entries.size) {
      return disabled(`scene used ${used.size} of ${entries.size} baked primitives`);
    }
    // All source associations and byte ranges are validated before mutating
    // geometry or materials, so a stale companion cleanly falls back to live.
    const firstGeometryUse = new WeakMap<THREE.BufferGeometry, string>();
    const materials = new Set<THREE.Material>();
    for (const { object, entry, key } of targets) {
      // GLTFLoader shares geometry for instanced mesh definitions, while the
      // bake is node-specific. Clone only when another node needs distinct data.
      const levels = new Uint8Array(topologyBuffer, entry.subdivisionByteOffset, entry.triangleCount);
      if (entry.vertexCount > entry.sourceVertexCount) {
        object.geometry = subdivideGeometry(object.geometry, levels, entry);
      } else {
        const priorKey = firstGeometryUse.get(object.geometry);
        if (priorKey && priorKey !== key) object.geometry = object.geometry.clone();
        else firstGeometryUse.set(object.geometry, key);
      }
      object.geometry.setAttribute(ATTRIBUTE_NAME, new THREE.BufferAttribute(
        new Uint8Array(buffer, entry.byteOffset, entry.vertexCount * 4), 4, true,
      ));
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        materials.add(material);
      }
    }
    const params: BakedLightingParams = {
      maxFixture: manifest.maxFixture, maxDaylight: manifest.maxDaylight,
      fixtureColor: manifest.color, skyColor: manifest.skyColor,
    };
    installedParams = params;
    for (const material of materials) installBakedShader(material, params);
    const volume: IrradianceVolume = {
      ...params, data: new Uint8Array(volumeBuffer), dims: manifest.volume.dims,
      origin: manifest.volume.origin, cellSize: manifest.volume.cellSize,
    };
    const status: BakedLightingStatus = { applied: true, meshes, vertices, bytes: buffer.byteLength, volume };
    root.userData.bakedFixtureLighting = status;
    return status;
  } catch (error) {
    return disabled(error instanceof Error ? error.message : String(error));
  }
}
