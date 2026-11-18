import * as THREE from 'three';
import fixtures from './house-light-fixtures.json';
import lampEmitters from './house-lamp-emitters.json';
import drafts from './house-light-drafts.json';
import { expandDraftFixtures } from '../shared/draftFixtures';

const LENS_OFFSET = 0.06;
let haloTexture: THREE.CanvasTexture | null = null;

function getHaloTexture(): THREE.CanvasTexture {
  if (haloTexture) return haloTexture;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const context = canvas.getContext('2d')!;
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.25, 'rgba(255,255,255,0.6)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  haloTexture = new THREE.CanvasTexture(canvas);
  haloTexture.colorSpace = THREE.SRGBColorSpace;
  return haloTexture;
}

/** Additive halo sprites in front of every luminous fixture and lamp emitter. */
export function createFixtureGlow(parent: THREE.Object3D): { dispose(): void } {
  if (typeof document === 'undefined') return { dispose() {} };
  const createdTexture = !haloTexture;
  const map = getHaloTexture();
  const group = new THREE.Group();
  group.name = 'Fixture glow';
  const materials = new Map<string, THREE.SpriteMaterial>();

  const addSprite = (color: number[], position: THREE.Vector3, scale: number) => {
    const key = color.join(',');
    let material = materials.get(key);
    if (!material) {
      material = new THREE.SpriteMaterial({
        map, color: new THREE.Color().fromArray(color), opacity: 0.55, transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true, toneMapped: false,
      });
      materials.set(key, material);
    }
    const sprite = new THREE.Sprite(material);
    sprite.position.copy(position);
    sprite.scale.setScalar(scale);
    group.add(sprite);
  };
  const lensPosition = (position: number[], direction: number[]) =>
    new THREE.Vector3().fromArray(position).addScaledVector(new THREE.Vector3().fromArray(direction).normalize(), LENS_OFFSET);

  // Strips are long emissive surfaces already; a row of halos reads as dots.
  for (const fixture of [...fixtures, ...expandDraftFixtures(drafts.drafts as Parameters<typeof expandDraftFixtures>[0])]) {
    if (fixture.type !== 'spot') continue;
    addSprite(fixture.color, lensPosition(fixture.position, fixture.direction), 0.5);
  }
  for (const emitter of lampEmitters.emitters) {
    addSprite(emitter.color, lensPosition(emitter.position, emitter.direction), Math.max(0.35, emitter.radius * 1.4));
  }
  parent.add(group);

  return {
    dispose() {
      group.removeFromParent();
      for (const material of materials.values()) material.dispose();
      if (createdTexture && haloTexture === map) {
        map.dispose();
        haloTexture = null;
      }
    },
  };
}
