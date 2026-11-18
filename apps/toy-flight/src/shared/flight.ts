import { DOORS, overlapsDoor, sweepDoors, type DoorState } from '@huis/house/shared/doors';
import { overlapsWorld, sweepWorld } from '@huis/house/shared/collision';
import { DRONE_RADIUS, type Controls, type DroneState } from './protocol';
import { stepDrone } from './simulation';
import { HOUSE_BOUNDS } from '@huis/house/shared/world';

const CONTACT_GAP = 0.003;
const WORLD_MARGIN = 3;

/** Shared by prediction and the server: obstacles gently stop or slide the toy. */
export function stepFlight(drone: DroneState, controls: Controls, dt: number, doors: readonly DoorState[] = []): void {
  const previous = { ...drone.position };
  stepDrone(drone, controls, dt);
  let remaining = {
    x: drone.position.x - previous.x,
    y: drone.position.y - previous.y,
    z: drone.position.z - previous.z,
  };
  let position = { ...previous };


  // Resolve up to three surfaces so a corner cannot push the drone through a wall.
  for (let contact = 0; contact < 3; contact++) {
    if (Math.hypot(remaining.x, remaining.y, remaining.z) < 1e-7) break;
    const end = { x: position.x + remaining.x, y: position.y + remaining.y, z: position.z + remaining.z };
    const wallHit = sweepWorld(position, end, DRONE_RADIUS);
    const doorHit = sweepDoors(position, end, DRONE_RADIUS, doors);
    const hit = doorHit && (!wallHit || doorHit.t < wallHit.t) ? doorHit : wallHit;
    if (!hit) {
      position = end;
      break;
    }
    const inwardVelocity = Math.min(0, drone.velocity.x * hit.normal.x + drone.velocity.y * hit.normal.y + drone.velocity.z * hit.normal.z);
    drone.velocity.x -= hit.normal.x * inwardVelocity;
    drone.velocity.y -= hit.normal.y * inwardVelocity;
    drone.velocity.z -= hit.normal.z * inwardVelocity;
    position = {
      x: hit.position.x + hit.normal.x * CONTACT_GAP,
      y: hit.position.y + hit.normal.y * CONTACT_GAP,
      z: hit.position.z + hit.normal.z * CONTACT_GAP,
    };
    remaining = { x: remaining.x * (1 - hit.t), y: remaining.y * (1 - hit.t), z: remaining.z * (1 - hit.t) };
    const inward = Math.min(0, remaining.x * hit.normal.x + remaining.y * hit.normal.y + remaining.z * hit.normal.z);
    remaining.x -= hit.normal.x * inward;
    remaining.y -= hit.normal.y * inward;
    remaining.z -= hit.normal.z * inward;
  }

  for (const axis of ['x', 'y', 'z'] as const) {
    const bounded = Math.max(HOUSE_BOUNDS.min[axis] - WORLD_MARGIN, Math.min(HOUSE_BOUNDS.max[axis] + WORLD_MARGIN, position[axis]));
    if (bounded !== position[axis]) drone.velocity[axis] = 0;
    position[axis] = bounded;
  }
  if (overlapsWorld(position, DRONE_RADIUS * .99)
    || DOORS.some((_, index) => overlapsDoor(position, DRONE_RADIUS * .99, index, doors[index]?.fraction ?? 0))) {
    position = previous;
    drone.velocity = { x: 0, y: 0, z: 0 };
  }
  drone.position = position;
  drone.speed = Math.hypot(drone.velocity.x, drone.velocity.y, drone.velocity.z);
}
