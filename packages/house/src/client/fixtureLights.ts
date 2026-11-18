import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import definitions from './house-light-fixtures.json';

const MAX_SPOT_LIGHTS = 4;

/** Keep every luminous fixture visible, but bound the cost of nearby light/shadow work. */
export function createFixtureLights(scene: THREE.Scene): { dispose(): void } {
  const group = new THREE.Group();
  group.name = 'Reference fixture illumination';
  scene.add(group);
  RectAreaLightUniformsLib.init();
  const spots = definitions.filter(definition => definition.type === 'spot').map(definition => ({
    definition,
    position: new THREE.Vector3().fromArray(definition.position),
    score: 0,
  }));
  for (const definition of definitions.filter(definition => definition.type === 'area')) {
    const light = new THREE.RectAreaLight(
      new THREE.Color().fromArray(definition.color), definition.intensity, definition.width, definition.height,
    );
    light.name = definition.name;
    light.position.fromArray(definition.position);
    const right = new THREE.Vector3().fromArray(definition.right!);
    const back = new THREE.Vector3().fromArray(definition.direction).negate();
    const up = new THREE.Vector3().crossVectors(back, right);
    light.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, back));
    group.add(light);
  }
  const slots = Array.from({ length: MAX_SPOT_LIGHTS }, () => {
    const light = new THREE.SpotLight('#fff0d6', 0);
    light.castShadow = true;
    light.shadow.mapSize.set(512, 512);
    light.shadow.camera.near = 0.025;
    light.shadow.normalBias = 0.025;
    light.shadow.bias = -0.0004;
    light.shadow.autoUpdate = false;
    group.add(light, light.target);
    return { light, fixture: undefined as typeof spots[number] | undefined, strength: 0 };
  });
  const cameraPosition = new THREE.Vector3();
  const previousBeforeRender = scene.onBeforeRender;
  let previousTime = performance.now();
  const beforeRender: THREE.Scene['onBeforeRender'] = function (...args) {
    previousBeforeRender.apply(scene, args);
    const now = performance.now();
    const fadeStep = Math.min((now - previousTime) / 200, 1);
    previousTime = now;
    args[2].getWorldPosition(cameraPosition);
    for (const fixture of spots) {
      // A small preference for assigned fixtures avoids flickering selections
      // around the midpoint between two lamps.
      fixture.score = fixture.position.distanceToSquared(cameraPosition)
        * (slots.some(slot => slot.fixture === fixture) ? 0.8 : 1);
    }
    spots.sort((a, b) => a.score - b.score);
    const desired = spots.slice(0, MAX_SPOT_LIGHTS).filter(fixture =>
      fixture.score < (fixture.definition.distance! + 3) ** 2);
    for (const slot of slots) {
      const retained = slot.fixture !== undefined && desired.includes(slot.fixture);
      slot.strength = THREE.MathUtils.clamp(slot.strength + (retained ? fadeStep : -fadeStep), 0, 1);
      if (!retained && slot.strength === 0) {
        const fixture = desired.find(candidate => !slots.some(other => other.fixture === candidate));
        slot.fixture = fixture;
        if (fixture) {
          const { definition, position } = fixture;
          slot.light.name = definition.name;
          slot.light.position.copy(position);
          slot.light.target.position.copy(position).add(new THREE.Vector3().fromArray(definition.direction));
          slot.light.color.fromArray(definition.color);
          slot.light.distance = definition.distance!;
          slot.light.angle = definition.angle!;
          slot.light.penumbra = definition.penumbra!;
          slot.light.shadow.camera.far = definition.distance!;
          slot.light.updateMatrixWorld(true);
          slot.light.target.updateMatrixWorld(true);
          // Static architecture: recompute only when a slot moves to another lamp.
          slot.light.shadow.needsUpdate = true;
        }
      }
      slot.light.intensity = (slot.fixture?.definition.intensity ?? 0) * slot.strength;
    }
  };
  scene.onBeforeRender = beforeRender;
  return {
    dispose() {
      if (scene.onBeforeRender === beforeRender) scene.onBeforeRender = previousBeforeRender;
      scene.remove(group);
      for (const { light } of slots) light.shadow.map?.dispose();
    },
  };
}
