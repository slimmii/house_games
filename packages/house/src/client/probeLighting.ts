import * as THREE from 'three';
import { ambientFillGlsl, type IrradianceVolume } from './bakedLighting';
import { TOY_STYLE } from './comicStyle';
import daylight from '../shared/daylight.json';

const SHADER_TAG = 'house-irradiance-probe-v1';
const glslVec3 = (values: readonly number[]) => `vec3(${values.map(value => value.toFixed(4)).join(', ')})`;
const unit = (values: readonly number[]) => new THREE.Vector3().fromArray(values).normalize().toArray();

/**
 * Toy style: smooth direction-based light (sky/ground tint, soft key and fill)
 * plus the lamp pools from the volume. No bake, no shadow maps; the same rule
 * lights the house, doors, drone and paint so they match.
 */
function toyGlsl(): string {
  const toy = daylight.toy;
  return `
vec3 toyNormal = normalize( inverseTransformDirection( normal, viewMatrix ) );
vec3 toyLight = mix( ${glslVec3(toy.groundColor)}, ${glslVec3(toy.skyColor)}, toyNormal.y * 0.5 + 0.5 )
  + ${glslVec3(toy.keyColor)} * ${toy.keyStrength.toFixed(4)} * max( dot( toyNormal, ${glslVec3(unit(toy.keyDirection))} ), 0.0 )
  + ${glslVec3(toy.fillColor)} * ${toy.fillStrength.toFixed(4)} * max( dot( toyNormal, ${glslVec3(unit(toy.fillDirection))} ), 0.0 );
float toyLamp = 0.0;
if (probeScale.w > 0.5) {
  float probeByte = texture(probeMap, clamp(vProbeUvw, 0.0, 1.0)).r;
  toyLamp = probeByte * probeByte * probeScale.x * ${toy.lampGain.toFixed(4)};
}
reflectedLight.directDiffuse = vec3( 0.0 );
reflectedLight.directSpecular = vec3( 0.0 );
reflectedLight.indirectDiffuse = material.diffuseColor * ( toyLight + probeFixtureColor * toyLamp );
reflectedLight.indirectSpecular *= ${toy.reflections.toFixed(4)};`;
}

// One shared uniform set: materials are created before the house finishes
// loading, so the volume is swapped in later and every material sees it.
const placeholder = new THREE.Data3DTexture(new Uint8Array([0, 0]), 1, 1, 1);
placeholder.format = THREE.RGFormat;
placeholder.type = THREE.UnsignedByteType;
placeholder.needsUpdate = true;
const uniforms = {
  probeMap: { value: placeholder as THREE.Data3DTexture },
  probeOrigin: { value: new THREE.Vector3() },
  probeInvSize: { value: new THREE.Vector3(1, 1, 1) },
  // x: maxFixture, y: maxDaylight, z: specular occlusion scale, w: enabled.
  probeScale: { value: new THREE.Vector4(0, 0, 0, 0) },
  probeSkyColor: { value: new THREE.Color(1, 1, 1) },
  probeFixtureColor: { value: new THREE.Color(1, 1, 1) },
};
let current: THREE.Data3DTexture | undefined;

/** Publish the baked irradiance volume to every probe-lit material. */
export function setIrradianceVolume(volume: IrradianceVolume | undefined): void {
  current?.dispose();
  current = undefined;
  if (!volume) {
    uniforms.probeMap.value = placeholder;
    uniforms.probeScale.value.set(0, 0, 0, 0);
    return;
  }
  const [width, height, depth] = volume.dims;
  const texture = new THREE.Data3DTexture(volume.data, width, height, depth);
  texture.format = THREE.RGFormat;
  texture.type = THREE.UnsignedByteType;
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.wrapS = texture.wrapT = texture.wrapR = THREE.ClampToEdgeWrapping;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  current = texture;
  uniforms.probeMap.value = texture;
  uniforms.probeOrigin.value.fromArray(volume.origin);
  uniforms.probeInvSize.value.set(
    1 / (width * volume.cellSize), 1 / (height * volume.cellSize), 1 / (depth * volume.cellSize),
  );
  uniforms.probeScale.value.set(volume.maxFixture, volume.maxDaylight, 2 / Math.max(volume.maxDaylight, 1e-3), 1);
  uniforms.probeSkyColor.value.fromArray(volume.skyColor);
  uniforms.probeFixtureColor.value.fromArray(volume.fixtureColor);
}

/** Clones made after installation keep userData but lose the hook; put it back. */
export function reinstallProbeShader(material: THREE.Material): void {
  delete material.userData.probeLighting;
  installProbeShader(material);
}

/** Toy style: the quick lamp-only volume written by `npm run bake:volume`. */
export async function loadLightVolume(): Promise<IrradianceVolume | undefined> {
  try {
    const manifestResponse = await fetch('/models/house-light-volume.json');
    if (!manifestResponse.ok) return undefined;
    const manifest = await manifestResponse.json() as {
      data: string; byteLength: number; dims: [number, number, number];
      origin: [number, number, number]; cellSize: number; maxFixture: number; fixtureColor: [number, number, number];
    };
    const dataResponse = await fetch(`/models/${manifest.data}`);
    if (!dataResponse.ok) return undefined;
    const buffer = await dataResponse.arrayBuffer();
    if (buffer.byteLength !== manifest.byteLength) return undefined;
    return {
      data: new Uint8Array(buffer), dims: manifest.dims, origin: manifest.origin, cellSize: manifest.cellSize,
      maxFixture: manifest.maxFixture, maxDaylight: 1, fixtureColor: manifest.fixtureColor, skyColor: [1, 1, 1],
    };
  } catch {
    return undefined;
  }
}

export function hasIrradianceVolume(): boolean {
  return current !== undefined;
}

/**
 * Light a dynamic object's material from the probe volume at its world
 * position, using the same formula as the baked architecture. Without a
 * volume (live-light fallback) the material renders unchanged.
 */
export function installProbeShader(material: THREE.Material): void {
  if (!(material instanceof THREE.MeshStandardMaterial) || material.userData.probeLighting) return;
  material.userData.probeLighting = true;
  const previousCompile = material.onBeforeCompile;
  const previousCacheKey = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    previousCompile(shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform vec3 probeOrigin;\nuniform vec3 probeInvSize;\nvarying vec3 vProbeUvw;')
      .replace('#include <project_vertex>', `#include <project_vertex>
vec4 probeWorld = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
probeWorld = instanceMatrix * probeWorld;
#endif
probeWorld = modelMatrix * probeWorld;
vProbeUvw = (probeWorld.xyz - probeOrigin) * probeInvSize;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
precision highp sampler3D;
uniform sampler3D probeMap;
uniform vec4 probeScale;
uniform vec3 probeSkyColor;
uniform vec3 probeFixtureColor;
varying vec3 vProbeUvw;`)
      .replace('#include <lights_fragment_end>', TOY_STYLE ? `#include <lights_fragment_end>${toyGlsl()}` : `#include <lights_fragment_end>
if (probeScale.w > 0.5) {
  vec2 probe = texture(probeMap, clamp(vProbeUvw, 0.0, 1.0)).rg;
  float probeFixture = probe.x * probe.x * probeScale.x;
  float probeDaylight = probe.y * probe.y * probeScale.y;
  reflectedLight.indirectDiffuse = material.diffuseColor * (probeSkyColor * probeDaylight + probeFixtureColor * probeFixture + ${ambientFillGlsl()});
  reflectedLight.indirectSpecular *= clamp(probeDaylight * probeScale.z, 0.15, 1.0);
}`);
  };
  material.customProgramCacheKey = () => `${previousCacheKey()}|${SHADER_TAG}|${TOY_STYLE ? 'toy' : ''}|${ambientFillGlsl()}`;
  material.needsUpdate = true;
}
