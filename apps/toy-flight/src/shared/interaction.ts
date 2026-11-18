import { chaseCameraPose } from './aim';
import { rayWorld } from '@huis/house/shared/collision';
import {
  DOORS,
  DOOR_REACH,
  doorFixedTargetBoxes,
  doorLocalPoint,
  doorTargetComponents,
  intersectBox,
  sweepDoors,
  type DoorState,
} from '@huis/house/shared/doors';
import type { DroneState, Vec3 } from './protocol';

// A small physical allowance around the visible grip, never a whole cupboard face.
export const HANDLE_AIM_PADDING = .045;
const RAY_LENGTH = DOOR_REACH + 2;
const SURFACE_EPSILON = .012;
type Pose = Pick<DroneState, 'position' | 'yaw' | 'pitch'>;
type DoorTarget = { box: ReturnType<typeof doorFixedTargetBoxes>[number]; partIndex: number; fixed: boolean };

// Definitions are immutable. Flatten component ownership once instead of
// rebuilding up to 144 target lists every HUD frame and again on the server.
const targetsByDoor: readonly DoorTarget[][] = DOORS.map((_door, index) => {
  const targets: DoorTarget[] = [];
  for (const { partIndex, boxes } of doorTargetComponents(index)) {
    for (const box of boxes) targets.push({ box, partIndex, fixed: false });
  }
  for (const box of doorFixedTargetBoxes(index)) targets.push({ box, partIndex: 0, fixed: true });
  return targets;
});

/** A second untargeted press may close the pilot's last cupboard. Measure
 * proximity to its opening, so a swung-away handle need not be aimed at again. */
export function nearbyOpenCloset(position: Vec3, states: readonly DoorState[], lastIndex: number): number {
  const door = DOORS[lastIndex];
  if (!door || door.fixed || door.kind === 'door' || !states[lastIndex]?.opening) return -1;
  const point = {
    x: Math.max(door.min[0], Math.min(door.max[0], position.x)),
    y: Math.max(door.min[1], Math.min(door.max[1], position.y)),
    z: Math.max(door.min[2], Math.min(door.max[2], position.z)),
  };
  const distance = Math.hypot(position.x-point.x, position.y-point.y, position.z-point.z);
  if (distance > DOOR_REACH) return -1;
  if (distance < SURFACE_EPSILON) return lastIndex;
  const wall = rayWorld(position, point);
  if (wall && (1-wall.t)*distance > SURFACE_EPSILON) return -1;
  const panel = sweepDoors(position, point, 0, states);
  if (panel && panel.doorIndex !== lastIndex && (1-panel.t)*distance > SURFACE_EPSILON) return -1;
  return lastIndex;
}

/** Resolve the exact visible control. This function is shared by HUD and server.
 * `lockExterior` keeps pilots inside (hide and seek). */
export function targetedDoor(drone: Pose, states: readonly DoorState[], lockExterior = false): number {
  const camera = chaseCameraPose(drone, states);
  const direction = {
    x: camera.target.x-camera.position.x,
    y: camera.target.y-camera.position.y,
    z: camera.target.z-camera.position.z,
  };
  const length = Math.hypot(direction.x, direction.y, direction.z);
  if (length < 1e-9) return -1;
  const end = {
    x: camera.position.x+direction.x*RAY_LENGTH/length,
    y: camera.position.y+direction.y*RAY_LENGTH/length,
    z: camera.position.z+direction.z*RAY_LENGTH/length,
  };
  return targetDoorOnRay(drone.position, camera.position, end, states, lockExterior);
}

/** Also exposed for geometric regression tests with independently constructed rays. */
export function targetDoorOnRay(position: Vec3, start: Vec3, end: Vec3, states: readonly DoorState[], lockExterior = false): number {
  const rayLength = Math.hypot(end.x-start.x, end.y-start.y, end.z-start.z);
  if (rayLength < 1e-9) return -1;
  const wall = rayWorld(start, end), moving = sweepDoors(start, end, 0, states);
  const occlusion = Math.min(wall?.t ?? 1, moving?.t ?? 1);
  let nearest = -1, nearestT = 1;
  for (let i = 0; i < DOORS.length; i++) {
    const d = DOORS[i];
    if (d.fixed || (lockExterior && d.exterior)) continue;
    const fraction = states[i]?.fraction ?? 0;
    for (const { box, partIndex, fixed } of targetsByDoor[i]) {
      const a = fixed ? start : doorLocalPoint(start, i, fraction, partIndex);
      const b = fixed ? end : doorLocalPoint(end, i, fraction, partIndex);
      const hit = intersectBox(a, b, box, d.kind === 'door' ? 0 : HANDLE_AIM_PADDING, true);
      if (!hit || hit.t >= nearestT || (hit.t-occlusion)*rayLength > SURFACE_EPSILON) continue;
      const point = {
        x: start.x+(end.x-start.x)*hit.t,
        y: start.y+(end.y-start.y)*hit.t,
        z: start.z+(end.z-start.z)*hit.t,
      };
      const reach = Math.hypot(position.x-point.x, position.y-point.y, position.z-point.z);
      if (reach > DOOR_REACH) continue;
      // Chase view can see around an edge that still blocks the drone's reach.
      const cover = rayWorld(position, point), panel = sweepDoors(position, point, 0, states);
      if ((1-Math.min(cover?.t ?? 1, panel?.t ?? 1))*reach > HANDLE_AIM_PADDING+.015) continue;
      nearestT = hit.t;
      nearest = i;
    }
  }
  return nearest;
}
