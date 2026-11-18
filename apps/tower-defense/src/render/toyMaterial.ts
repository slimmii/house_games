import * as THREE from 'three';
import daylight from '@huis/house/shared/daylight.json';
import { installProbeShader } from '@huis/house/client/probeLighting';
import type { Finish } from './toys/kit';

const glslVec3 = (values: readonly number[]) => `vec3(${values.map(value => value.toFixed(4)).join(', ')})`;
const unit = (values: readonly number[]) => new THREE.Vector3().fromArray(values).normalize().toArray();

/**
 * The house's toy lighting is diffuse only: it removes direct highlights and
 * dims reflections, which suits walls but leaves plastic looking like chalk.
 * This adds, for toys only, a highlight from the key light, full-strength sky
 * reflections and a soft rim, on top of the same diffuse light as the room.
 */
function installGloss(material: THREE.MeshStandardMaterial, gloss: { highlight: number; shininess: number; reflections: number; rim: number }): void {
  const previousCompile = material.onBeforeCompile;
  const previousCacheKey = material.customProgramCacheKey.bind(material);
  const key = `toy-gloss-v1|${gloss.highlight}|${gloss.shininess}|${gloss.reflections}|${gloss.rim}`;
  material.onBeforeCompile = (shader, renderer) => {
    previousCompile(shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace('#include <aomap_fragment>', `
{
  vec3 glossLight = normalize( ( viewMatrix * vec4( ${glslVec3(unit(daylight.toy.keyDirection))}, 0.0 ) ).xyz );
  vec3 glossHalf = normalize( glossLight + geometryViewDir );
  float glossSpec = pow( max( dot( normal, glossHalf ), 0.0 ), ${gloss.shininess.toFixed(1)} );
  float glossRim = pow( 1.0 - max( dot( normal, geometryViewDir ), 0.0 ), 3.0 );
  reflectedLight.directSpecular += vec3( glossSpec * ${gloss.highlight.toFixed(3)} );
  reflectedLight.indirectSpecular *= ${(gloss.reflections / daylight.toy.reflections).toFixed(3)};
  reflectedLight.indirectDiffuse += material.diffuseColor * glossRim * ${gloss.rim.toFixed(3)};
}
#include <aomap_fragment>`);
  };
  material.customProgramCacheKey = () => `${previousCacheKey()}|${key}`;
  material.needsUpdate = true;
}

export type ToyMaterials = Record<Finish, THREE.Material>;

/** One shared material per finish; colours come from vertex colours and instance tints. */
export function createToyMaterials(environment: THREE.Texture | null): ToyMaterials {
  const plastic = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0, envMap: environment, envMapIntensity: 1 });
  const matte = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, envMap: environment, envMapIntensity: 0.4 });
  const metal = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.85, envMap: environment, envMapIntensity: 1.3 });
  const glow = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  installProbeShader(plastic);
  installGloss(plastic, { highlight: 0.55, shininess: 48, reflections: 1.0, rim: 0.22 });
  installProbeShader(matte);
  installGloss(matte, { highlight: 0.05, shininess: 12, reflections: 0.35, rim: 0.1 });
  installProbeShader(metal);
  installGloss(metal, { highlight: 0.8, shininess: 70, reflections: 1.6, rim: 0.1 });
  for (const material of [plastic, matte, metal, glow]) material.name = 'toy';
  plastic.name = 'toy plastic';
  matte.name = 'toy matte';
  metal.name = 'toy metal';
  glow.name = 'toy glow';
  return { plastic, matte, metal, glow };
}
