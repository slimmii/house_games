import * as THREE from 'three';
import { configureToneMapping } from '@huis/house/client/comicStyle';
import { LOW_QUALITY } from '@huis/house/client/quality';
import { createHouse, onHouseLoadProgress, type HouseLoadProgress } from '@huis/house/client/world';
import { skyEnvironment } from '@huis/house/client/skyEnvironment';
import { CUT_PLANES, applyDollhouse, prepareWallSections, type Dollhouse } from './dollhouse';

/** Sharper than the drone game (capped at 1): small toys need the pixels. */
export const MAX_PIXEL_RATIO = Math.min(devicePixelRatio, LOW_QUALITY ? 1 : 2);

export type Stage = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  /** Sky reflections for toy materials (the house itself skips them on low quality). */
  environment: THREE.Texture;
  dollhouse: Dollhouse;
};

/** The swivel chair blocks the lane along the cabinet wall; this game rolls it away. */
const REMOVED_FURNITURE = /^Living LOMSK \//;

export function createRenderer(): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({ antialias: !LOW_QUALITY, powerPreference: 'high-performance' });
  renderer.debug.checkShaderErrors = import.meta.env.DEV;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  configureToneMapping(renderer);
  renderer.shadowMap.enabled = false;
  renderer.setPixelRatio(MAX_PIXEL_RATIO);
  // Set before anything is compiled: programs are built for a fixed number of
  // clipping planes, so adding one later recompiles every house shader.
  renderer.clippingPlanes = CUT_PLANES;
  return renderer;
}

/** Load the house and turn it into an open-topped dollhouse of the first floor. */
export async function createStage(
  renderer: THREE.WebGLRenderer,
  camera: THREE.Camera,
  onProgress: (progress: HouseLoadProgress) => void,
): Promise<Stage> {
  const scene = new THREE.Scene();
  const stopProgress = onHouseLoadProgress(onProgress);
  const house = createHouse(scene, renderer, {
    paintSurfaces: false,
    collision: false,
    visibility: false,
    onSource(source) {
      const removed: THREE.Object3D[] = [];
      source.traverse(object => {
        if (REMOVED_FURNITURE.test(object.userData.name ?? object.name)) removed.push(object);
      });
      for (const object of removed) object.removeFromParent();
      prepareWallSections(source);
    },
  });
  await house.ready;
  stopProgress();
  const dollhouse = applyDollhouse(scene);
  const environment = skyEnvironment(renderer).environment;
  // Compile and upload everything now, so the first camera move does not stall.
  await renderer.compileAsync(scene, camera).catch(() => undefined);
  const uploaded = new Set<THREE.Texture>();
  scene.traverse(object => {
    if (!(object instanceof THREE.Mesh) || !object.visible) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture && !uploaded.has(value)) {
          uploaded.add(value);
          renderer.initTexture(value);
        }
      }
    }
  });
  return { renderer, scene, environment, dollhouse };
}
