import * as THREE from 'three';
import { installProbeShader } from './probeLighting';
import { LAUNDRY, LAUNDRY_SOURCE_NAMES, laundryAngularSpeed, laundryStaticParts } from '../shared/laundry';
import { DOORS, doorPartPose, type DoorState } from '../shared/doors';

export function prepareLaundry(source: THREE.Object3D): THREE.Group {
  const names = new Set(LAUNDRY_SOURCE_NAMES), remove: THREE.Object3D[] = [];
  source.traverse(object => { if (names.has(object.userData.name ?? object.name)) remove.push(object); });
  for (const object of remove) object.removeFromParent();
  const root = new THREE.Group(); root.name = 'operable-laundry';
  root.userData.removedSourceParts = remove.length;
  const enamel = new THREE.MeshStandardMaterial({ color: '#eff0ef', roughness: .28, side: THREE.DoubleSide });
  const metal = new THREE.MeshStandardMaterial({ color: '#afb6b9', metalness: .8, roughness: .32, side: THREE.DoubleSide });
  const rubber = new THREE.MeshStandardMaterial({ color: '#22272b', roughness: .6 });
  const glass = new THREE.MeshPhysicalMaterial({ color: '#b2ccd0', transparent: true, opacity: .22, roughness: .08, metalness: .08, depthWrite: false, side: THREE.DoubleSide });
  for (const material of [enamel, metal, rubber, glass]) installProbeShader(material);
  const finishes = { enamel, metal, rubber };
  for (const part of laundryStaticParts()) {
    const mesh = new THREE.Mesh(part.geometry, finishes[part.finish]); mesh.name = part.name; root.add(mesh);
  }
  for (const machine of LAUNDRY) {
    const index = DOORS.findIndex(door => door.id === machine.id), definition = DOORS[index];
    const pivot = new THREE.Group(); pivot.name = `${machine.id}:door`; pivot.position.fromArray(definition.pivot);
    root.add(pivot);
    function doorMesh(geometry: THREE.BufferGeometry, material: THREE.Material, x: number) {
      geometry.rotateY(Math.PI / 2);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x - definition.pivot[0], 0, machine.center[2] - definition.pivot[2]); pivot.add(mesh);
      return mesh;
    }
    doorMesh(new THREE.TorusGeometry(.666, .07, 12, 64), machine.index === 0 ? rubber : enamel, 3.069);
    doorMesh(new THREE.TorusGeometry(.588, .022, 10, 64), metal, 3.096);
    doorMesh(new THREE.CircleGeometry(.579, 64), glass, 3.10);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(.11, .25, .075), metal);
    grip.position.set(.045, 0, -1.35); pivot.add(grip);
    const rotor = new THREE.Group(); rotor.name = `${machine.id}:rotor`;
    rotor.position.set(2.25, 2.325, machine.center[2]); root.add(rotor);
    // Perforations and three lifters make rotation readable through the glass.
    const holes = new THREE.InstancedMesh(new THREE.SphereGeometry(.013, 5, 3), rubber, 360);
    const transform = new THREE.Matrix4();
    for (let row = 0; row < 9; row++) for (let col = 0; col < 40; col++) {
      const angle = (col + (row % 2) * .5) * Math.PI / 20;
      transform.makeTranslation(-.59 + row * .145, Math.cos(angle) * .56, Math.sin(angle) * .56);
      holes.setMatrixAt(row * 40 + col, transform);
    }
    rotor.add(holes);
    for (let i = 0; i < 3; i++) {
      const angle = i * Math.PI * 2 / 3;
      const lifter = new THREE.Mesh(new THREE.BoxGeometry(1.15, .06, .09), metal);
      lifter.position.set(0, Math.cos(angle) * .526, Math.sin(angle) * .526); lifter.rotation.x = angle;
      rotor.add(lifter);
    }
  }
  return root;
}

export function createLaundry(root: THREE.Object3D) {
  let elapsed = 0;
  const parts = LAUNDRY.map(machine => ({ machine, index: DOORS.findIndex(d => d.id === machine.id),
    door: root.getObjectByName(`${machine.id}:door`), rotor: root.getObjectByName(`${machine.id}:rotor`) }));
  return { update(states: readonly DoorState[], dt: number) {
    elapsed += dt;
    for (const { machine, index, door, rotor } of parts) {
      const state = states[index] ?? { fraction: 0, opening: false };
      const pose = doorPartPose(index, state.fraction);
      if (door) { door.position.fromArray(pose.position); door.rotation.set(pose.rotationX, pose.rotationY, pose.rotationZ); }
      if (rotor) rotor.rotation.x += laundryAngularSpeed(machine.index, state.fraction, state.opening, elapsed) * dt;
    }
  } };
}
