import * as THREE from 'three';
import { installProbeShader } from '@huis/house/client/probeLighting';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { DroneState } from '../shared/protocol';

// A palm-sized toy quadcopter. Rounded guards fit inside the shared collision sphere.
// Geometry and materials are cached across lobby/game transitions and all pilots.
const box = new RoundedBoxGeometry(1, 1, 1, 2, 0.12);
const sphere = new THREE.SphereGeometry(1, 12, 8);
const guard = new THREE.TorusGeometry(0.043, 0.004, 6, 24);
const motor = new THREE.CylinderGeometry(0.009, 0.01, 0.022, 10);
const templates = new Map<string, THREE.Group>();

function part(parent: THREE.Group, geometry: THREE.BufferGeometry, material: THREE.Material,
  position: [number, number, number], scale: [number, number, number]): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

/** Merge stationary parts by material: four guards cost one draw, not four. */
function batchFrame(frame: THREE.Group): void {
  frame.updateMatrixWorld(true);
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const child of [...frame.children]) {
    if (!(child instanceof THREE.Mesh)) continue;
    const material = child.material as THREE.Material;
    const geometry = (child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone())
      .applyMatrix4(child.matrix);
    const batch = batches.get(material) ?? [];
    batch.push(geometry);
    batches.set(material, batch);
    frame.remove(child);
  }
  for (const [material, geometries] of batches) {
    const mesh = new THREE.Mesh(mergeGeometries(geometries), material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    frame.add(mesh);
    for (const geometry of geometries) geometry.dispose();
  }
}

function buildTemplate(color: string): THREE.Group {
  const shell = new THREE.MeshStandardMaterial({ color, roughness: 0.42 });
  const cream = new THREE.MeshStandardMaterial({ color: '#fff5df', roughness: 0.6 });
  const rubber = new THREE.MeshStandardMaterial({ color: '#303844', roughness: 0.86 });
  const lens = new THREE.MeshStandardMaterial({ color: '#193e4a', roughness: 0.15, metalness: 0.25 });
  const light = new THREE.MeshBasicMaterial({ color: '#a6ffdf' });
  for (const material of [shell, cream, rubber, lens]) installProbeShader(material);
  const root = new THREE.Group();
  root.name = 'drone';
  const frame = new THREE.Group();
  frame.name = 'frame';
  root.add(frame);
  part(frame, box, shell, [0, 0, 0], [.080, .048, .090]);
  part(frame, box, cream, [0, .026, -.006], [.058, .014, .060]);
  part(frame, box, rubber, [0, -.027, 0], [.066, .014, .070]);
  // Friendly top stripe and forward status lights make orientation easy to read.
  part(frame, box, shell, [0, .034, .004], [.012, .004, .044]);
  for (const x of [-.023, .023]) part(frame, sphere, light, [x, .007, .045], [.008, .005, .003]);
  for (const x of [-1, 1]) for (const z of [-1, 1]) {
    const cx = x * .073;
    const cz = z * .073;
    const arm = part(frame, box, shell, [cx * .64, -.003, cz * .64], [.019, .018, .071]);
    arm.rotation.y = x * z * Math.PI / 4;
    const rim = part(frame, guard, rubber, [cx, .008, cz], [1, 1, 1]);
    rim.rotation.x = Math.PI / 2;
    part(frame, motor, cream, [cx, .004, cz], [1, 1, 1]);
    part(frame, box, rubber, [cx, -.025, cz], [.018, .022, .019]);
    const rotor = new THREE.Group();
    rotor.name = `rotor-${x}-${z}`;
    rotor.position.set(cx, .019, cz);
    rotor.userData.direction = x * z;
    part(rotor, box, rubber, [0, 0, 0], [.073, .003, .010]);
    part(frame, sphere, shell, [cx, .022, cz], [.009, .005, .009]);
    frame.add(rotor);
  }
  batchFrame(frame);
  const gimbal = new THREE.Group();
  gimbal.name = 'paint-camera';
  gimbal.position.set(0, -.012, .051);
  part(gimbal, sphere, cream, [0, 0, 0], [.024, .018, .019]);
  part(gimbal, sphere, lens, [0, 0, .015], [.013, .011, .006]);
  root.add(gimbal);
  return root;
}

export function createDrone(color: string): THREE.Group {
  let template = templates.get(color);
  if (!template) {
    template = buildTemplate(color);
    templates.set(color, template);
  }
  const drone = template.clone(true);
  drone.userData.frame = drone.getObjectByName('frame');
  drone.userData.gimbal = drone.getObjectByName('paint-camera');
  drone.userData.rotors = drone.userData.frame.children.filter((child: THREE.Object3D) => child.name.startsWith('rotor-'));
  return drone;
}

export function updateDroneVisual(drone: THREE.Group, state: DroneState, timeSeconds: number): void {
  drone.position.set(state.position.x, state.position.y, state.position.z);
  drone.rotation.set(0, state.yaw, 0);
  drone.visible = state.respawnAt <= 0;
  const frame = drone.userData.frame as THREE.Group;
  // Tilt is cosmetic; the camera and movement remain level and independent.
  const forwardSpeed = Math.sin(state.yaw) * state.velocity.x + Math.cos(state.yaw) * state.velocity.z;
  const rightSpeed = -Math.cos(state.yaw) * state.velocity.x + Math.sin(state.yaw) * state.velocity.z;
  frame.rotation.set(forwardSpeed * .065, 0, rightSpeed * .065);
  (drone.userData.gimbal as THREE.Group).rotation.x = -state.pitch;
  for (const rotor of drone.userData.rotors as THREE.Group[]) {
    rotor.rotation.y = timeSeconds * (48 + state.speed * 7) * rotor.userData.direction;
  }
}

/** Shared template resources remain cached for subsequent joins. */
export function disposeDrone(drone: THREE.Group): void {
  drone.removeFromParent();
}
