import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import daylight from '../shared/daylight.json';

interface SkyTextures { background: THREE.Texture; environment: THREE.Texture }
const cache = new WeakMap<THREE.WebGLRenderer, SkyTextures>();

/** Horizon tint used for preview fog so it blends into the sky background. */
export const SKY_HORIZON = '#c6d3df';

/**
 * A procedural daytime sky rendered once: a sharp cube map for the view through
 * the windows and a PMREM of it for specular reflections. Diffuse interior
 * light comes from the bake, whose constants in daylight.json stay authoritative.
 */
export function skyEnvironment(renderer: THREE.WebGLRenderer): SkyTextures {
  let textures = cache.get(renderer);
  if (!textures) {
    const sky = new Sky();
    sky.scale.setScalar(50);
    const uniforms = sky.material.uniforms;
    uniforms.turbidity.value = 4;
    uniforms.rayleigh.value = 1.6;
    uniforms.mieCoefficient.value = 0.004;
    uniforms.mieDirectionalG.value = 0.8;
    uniforms.sunPosition.value.fromArray(daylight.sun.direction).normalize();
    const scene = new THREE.Scene();
    scene.add(sky);
    // Neutral warm-grey ground: ceilings face it, so any hue here tints every ceiling.
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(49, 24).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#d2cdc5' }),
    );
    ground.position.y = -0.5;
    scene.add(ground);
    const target = new THREE.WebGLCubeRenderTarget(512, { type: THREE.HalfFloatType });
    const cubeCamera = new THREE.CubeCamera(0.1, 100, target);
    const previousToneMapping = renderer.toneMapping;
    renderer.toneMapping = THREE.NoToneMapping;
    cubeCamera.update(renderer, scene);
    renderer.toneMapping = previousToneMapping;
    const generator = new THREE.PMREMGenerator(renderer);
    const environment = generator.fromCubemap(target.texture);
    generator.dispose();
    textures = { background: target.texture, environment: environment.texture };
    cache.set(renderer, textures);
    ground.geometry.dispose();
    (ground.material as THREE.Material).dispose();
    sky.material.dispose();
    sky.geometry.dispose();
  }
  return textures;
}
