import { sweepWorld } from '@huis/house/shared/collision';
import { rayPaintSurfaces } from '@huis/house/shared/paint-surfaces';
import { sweepDoors, type DoorState } from '@huis/house/shared/doors';
import { DRONE_RADIUS, forwardVector, type DroneState, type Vec3 } from './protocol';

export const PROJECTILE_SPEED = 90;
export const PROJECTILE_LIFETIME = 2.4;
const AIM_RANGE = PROJECTILE_SPEED * PROJECTILE_LIFETIME;
type AimPose = Pick<DroneState, 'position' | 'yaw' | 'pitch'>;

/** Shared by rendering and shooting so the center of the view defines the aim. */
export function chaseCameraPose(drone: AimPose, doors: readonly DoorState[]): { position: Vec3; target: Vec3 } {
  const anchor = { ...drone.position, y: drone.position.y + .04 };
  const desired = {
    x: anchor.x - Math.sin(drone.yaw) * 1.15,
    y: anchor.y + .42,
    z: anchor.z - Math.cos(drone.yaw) * 1.15,
  };
  const wall = sweepWorld(anchor, desired, .10);
  const door = sweepDoors(anchor, desired, .10, doors);
  const hit = door && (!wall || door.t < wall.t) ? door : wall;
  const fraction = hit ? Math.max(0, hit.t - .035) : 1;
  const forward = forwardVector(drone.yaw, drone.pitch);
  return {
    position: {
      x: anchor.x + (desired.x - anchor.x) * fraction,
      y: anchor.y + (desired.y - anchor.y) * fraction,
      z: anchor.z + (desired.z - anchor.z) * fraction,
    },
    target: {
      x: anchor.x + forward.x * 1.4,
      y: anchor.y + forward.y * 1.4,
      z: anchor.z + forward.z * 1.4,
    },
  };
}

export function segmentSphereT(start: Vec3, end: Vec3, center: Vec3, radius: number): number | null {
  const d = { x: end.x - start.x, y: end.y - start.y, z: end.z - start.z };
  const m = { x: start.x - center.x, y: start.y - center.y, z: start.z - center.z };
  const a = d.x * d.x + d.y * d.y + d.z * d.z;
  const b = m.x * d.x + m.y * d.y + m.z * d.z;
  const c = m.x * m.x + m.y * m.y + m.z * m.z - radius * radius;
  if (c <= 0) return 0;
  if (a <= 1e-12 || b > 0) return null;
  const discriminant = b * b - a * c;
  if (discriminant < 0) return null;
  const t = (-b - Math.sqrt(discriminant)) / a;
  return t >= 0 && t <= 1 ? t : null;
}

/** Resolve the nearest surface or pilot under the crosshair on the server. */
export function crosshairTarget(drone: DroneState, doors: readonly DoorState[], players: Iterable<DroneState>, time: number): Vec3 {
  const camera = chaseCameraPose(drone, doors);
  const direction = {
    x: camera.target.x - camera.position.x,
    y: camera.target.y - camera.position.y,
    z: camera.target.z - camera.position.z,
  };
  const scale = AIM_RANGE / Math.hypot(direction.x, direction.y, direction.z);
  const end = {
    x: camera.position.x + direction.x * scale,
    y: camera.position.y + direction.y * scale,
    z: camera.position.z + direction.z * scale,
  };
  const wall = rayPaintSurfaces(camera.position, end);
  const door = sweepDoors(camera.position, end, 0, doors);
  let t = Math.min(wall?.t ?? 1, door?.t ?? 1);
  for (const player of players) {
    if (player.id === drone.id || player.respawnAt > 0 || time < player.invulnerableUntil) continue;
    const hit = segmentSphereT(camera.position, end, player.position, DRONE_RADIUS);
    if (hit !== null) t = Math.min(t, hit);
  }
  return {
    x: camera.position.x + (end.x - camera.position.x) * t,
    y: camera.position.y + (end.y - camera.position.y) * t,
    z: camera.position.z + (end.z - camera.position.z) * t,
  };
}
