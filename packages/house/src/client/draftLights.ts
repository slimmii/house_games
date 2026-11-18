import * as THREE from 'three';
import drafts from './house-light-drafts.json';
import daylight from '../shared/daylight.json';
import { expandDraftFixtures, type DraftLike } from '../shared/draftFixtures';
import { installProbeShader } from './probeLighting';

export interface DraftFixture extends DraftLike {
  fixture: 'recessed-spot' | 'ceiling-lamp' | 'wall-washer' | 'spiral-spots' | 'torch-sconce';
  /** Wall fixtures: outward wall normal the backplate mounts against. */
  mountNormal?: number[];
}

export const DRAFT_FIXTURES = drafts.drafts as DraftFixture[];

const DOWN = new THREE.Vector3(0, -1, 0);

/**
 * Proposed fixtures from house-light-drafts.json. Their bodies are always shown;
 * with `live` every head also runs as a real (unshadowed) spotlight, scaled like the
 * bake, so a proposal can be judged before `npm run bake:lighting`.
 */
export function createDraftLights(parent: THREE.Object3D, options: { live: boolean }): { dispose(): void } {
  const group = new THREE.Group();
  group.name = 'Draft fixtures';
  const disposables: Array<{ dispose(): void }> = [];
  const own = <T extends { dispose(): void }>(item: T): T => { disposables.push(item); return item; };
  const darkMetal = own(new THREE.MeshStandardMaterial({ color: '#2b2d30', roughness: 0.4, metalness: 0.6 }));
  const whitePaint = own(new THREE.MeshStandardMaterial({ color: '#f1efea', roughness: 0.55 }));
  const brushedSteel = own(new THREE.MeshStandardMaterial({ color: '#b9bcbf', roughness: 0.35, metalness: 0.85 }));
  const frosted = own(new THREE.MeshStandardMaterial({
    color: '#f6f4ef', emissive: '#fff3df', emissiveIntensity: 1.6, roughness: 0.6, side: THREE.DoubleSide,
  }));
  const lens = own(new THREE.MeshStandardMaterial({
    color: '#fff6e6', emissive: '#fff0d6', emissiveIntensity: 6, roughness: 0.3,
  }));
  for (const material of [darkMetal, whitePaint, brushedSteel]) installProbeShader(material);

  for (const draft of DRAFT_FIXTURES) {
    const fixture = new THREE.Group();
    fixture.name = draft.name;
    fixture.position.fromArray(draft.position);
    group.add(fixture);
    const add = (geometry: THREE.BufferGeometry, material: THREE.Material, at: THREE.Vector3, quaternion?: THREE.Quaternion) => {
      const mesh = new THREE.Mesh(own(geometry), material);
      mesh.position.copy(at);
      if (quaternion) mesh.quaternion.copy(quaternion);
      fixture.add(mesh);
      return mesh;
    };

    if (draft.fixture === 'spiral-spots') {
      // Ceiling canopy, a curled arm, and one gimballed spot per head.
      add(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 32), darkMetal, new THREE.Vector3(0, -0.025, 0));
      add(new THREE.CylinderGeometry(0.02, 0.02, 0.22, 8), darkMetal, new THREE.Vector3(0, -0.15, 0));
      const points: THREE.Vector3[] = [];
      for (let i = 0; i <= 64; i++) {
        const t = i / 64;
        const angle = Math.PI / 2 + t * Math.PI * 2.15;
        const radius = 0.12 + t * 0.5;
        points.push(new THREE.Vector3(Math.cos(angle) * radius, -0.26, Math.sin(angle) * radius));
      }
      add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 96, 0.022, 8), darkMetal, new THREE.Vector3());
      for (const head of draft.heads ?? []) {
        const at = new THREE.Vector3().fromArray(head.offset);
        const aim = new THREE.Quaternion().setFromUnitVectors(DOWN, new THREE.Vector3().fromArray(head.direction).normalize());
        add(new THREE.CylinderGeometry(0.075, 0.06, 0.2, 20), darkMetal, at, aim);
        const face = new THREE.Vector3(0, -0.101, 0).applyQuaternion(aim).add(at);
        add(new THREE.CircleGeometry(0.068, 20).rotateX(Math.PI / 2), lens, face, aim);
        add(new THREE.CylinderGeometry(0.012, 0.012, 0.18, 6), darkMetal,
          at.clone().add(new THREE.Vector3(0, 0.1, 0)));
      }
    } else if (draft.fixture === 'torch-sconce') {
      // Brushed-steel wall torch: round wall cup, short arm, a long steel cone
      // pointing down and a frosted glass cone flaring up and out of it.
      const normal = new THREE.Vector3().fromArray(draft.mountNormal ?? [1, 0, 0]).normalize();
      const toWall = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
      add(new THREE.CylinderGeometry(0.17, 0.2, 0.12, 28), brushedSteel, normal.clone().multiplyScalar(0.06), toWall);
      add(new THREE.CylinderGeometry(0.035, 0.035, 0.3, 10), brushedSteel, normal.clone().multiplyScalar(0.27), toWall);
      // The torch leans slightly away from the wall, like the photo.
      const lean = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 1, 0).addScaledVector(normal, 0.12).normalize());
      const axis = normal.clone().multiplyScalar(0.45);
      add(new THREE.ConeGeometry(0.12, 0.9, 24, 1, true).rotateX(Math.PI), brushedSteel,
        axis.clone().add(new THREE.Vector3(0, -0.15, 0)), lean);
      add(new THREE.CylinderGeometry(0.22, 0.11, 0.75, 28, 1, true), frosted,
        axis.clone().add(new THREE.Vector3(0, 0.62, 0).applyQuaternion(lean)), lean);
    } else if (draft.fixture === 'wall-washer') {
      // White box on the wall, open at top and bottom: light only spills up and down.
      const normal = new THREE.Vector3().fromArray(draft.mountNormal ?? [1, 0, 0]).normalize();
      const facing = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
      add(new THREE.BoxGeometry(0.75, 0.45, 0.2), whitePaint, normal.clone().multiplyScalar(0.1), facing);
      for (const sign of [1, -1]) {
        const slit = normal.clone().multiplyScalar(0.1).add(new THREE.Vector3(0, sign * 0.226, 0));
        add(new THREE.BoxGeometry(0.7, 0.004, 0.16), lens, slit, facing);
      }
    } else if (draft.fixture === 'ceiling-lamp') {
      add(new THREE.CylinderGeometry(0.6, 0.6, 0.12, 40), whitePaint, new THREE.Vector3(0, 0.06, 0));
      add(new THREE.CircleGeometry(0.52, 40).rotateX(Math.PI / 2), lens, new THREE.Vector3(0, -0.005, 0));
    } else {
      add(new THREE.CylinderGeometry(0.15, 0.15, 0.04, 32, 1, true), darkMetal, new THREE.Vector3(0, 0.02, 0));
      add(new THREE.CircleGeometry(0.1, 32).rotateX(Math.PI / 2), lens, new THREE.Vector3(0, -0.002, 0));
    }
  }

  if (options.live) {
    for (const spot of expandDraftFixtures(DRAFT_FIXTURES)) {
      const position = new THREE.Vector3().fromArray(spot.position);
      const direction = new THREE.Vector3().fromArray(spot.direction).normalize();
      // Scaled like the bake: daylight.json's fixtureGain, physical decay.
      const light = new THREE.SpotLight(
        new THREE.Color().fromArray(spot.color), spot.intensity * daylight.fixtureGain,
        spot.distance, spot.angle, spot.penumbra, 2,
      );
      light.name = `${spot.name} (live preview)`;
      light.position.copy(position);
      light.target.position.copy(position).add(direction);
      // No shadow maps: a dozen shadowed spots exceed the 16 texture units a
      // shader may use. The preview judges placement and brightness; the bake
      // adds shadows.
      light.castShadow = false;
      group.add(light, light.target);
    }
  }

  parent.add(group);
  return {
    dispose() {
      group.removeFromParent();
      for (const item of disposables) item.dispose();
    },
  };
}
