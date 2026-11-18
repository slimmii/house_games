import * as THREE from 'three';
import { configureToneMapping } from '@huis/house/client/comicStyle';
import { ToyBatch } from './toyBatch';
import { createToyMaterials } from './toyMaterial';
import { getToy, type ToyId } from './toys/index';

export type IconRequest = { key: string; toy: ToyId; tint?: THREE.ColorRepresentation };

/**
 * Render small transparent thumbnails of toys for the HUD. Uses a throwaway
 * renderer, so the main canvas and its clipping planes are left alone.
 */
export function renderToyIcons(requests: readonly IconRequest[], size = 128): Record<string, string> {
  const icons: Record<string, string> = {};
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  } catch {
    return icons;
  }
  renderer.setPixelRatio(1);
  renderer.setSize(size, size, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  configureToneMapping(renderer);
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const materials = createToyMaterials(null);
  const batch = new ToyBatch(scene, materials);
  const camera = new THREE.PerspectiveCamera(26, 1, 0.05, 60);
  const matrix = new THREE.Matrix4();
  const tint = new THREE.Color();
  for (const request of requests) {
    const model = getToy(request.toy);
    const reach = Math.max(model.height * 0.62, model.radius * 1.15, 0.12);
    const distance = (reach / Math.tan(THREE.MathUtils.degToRad(13))) * 1.08;
    const yaw = 0.62;
    const pitch = 0.42;
    const centre = model.height * 0.46;
    camera.position.set(Math.sin(yaw) * Math.cos(pitch) * distance, centre + Math.sin(pitch) * distance, Math.cos(yaw) * Math.cos(pitch) * distance);
    camera.lookAt(0, centre, 0);
    batch.begin();
    batch.add(model, matrix, tint.set(request.tint ?? '#ffffff'), 0.5, 0.11);
    batch.end();
    renderer.render(scene, camera);
    icons[request.key] = renderer.domElement.toDataURL('image/png');
  }
  batch.dispose();
  for (const material of Object.values(materials)) material.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
  return icons;
}
