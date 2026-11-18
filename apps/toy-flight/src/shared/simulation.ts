import {
  type Controls,
  type DroneState,
  type Vec3,
} from './protocol.js';

export type Box = { min: Vec3; max: Vec3 };
export type SegmentHit = { t: number; position: Vec3; normal: Vec3 };

export const DRONE_SPEED = 2.4;
export const DRONE_LIFT_SPEED = 1.8;
export const PRECISION_FACTOR = 0.35;
const ACCELERATION = 9;
const BRAKING = 14;
const YAW_RATE = 1.8;
const AIM_RATE = 1.2;
const MAX_AIM_PITCH = Math.PI * 0.36;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Assisted hover: heading, translation and altitude are independent. */
export function stepDrone(drone: DroneState, controls: Controls, dt: number): void {
  if (!Number.isFinite(dt) || dt <= 0) return;
  const step = Math.min(dt, 0.1);
  const precision = controls.precision ? PRECISION_FACTOR : 1;
  // +Z forward means pilot-right is -X at yaw zero.
  if (controls.lookYaw !== undefined && controls.lookPitch !== undefined) {
    drone.yaw = controls.lookYaw;
    drone.pitch = clamp(controls.lookPitch, -MAX_AIM_PITCH, MAX_AIM_PITCH);
  }
  drone.yaw -= clamp(controls.yaw, -1, 1) * YAW_RATE * precision * step;
  drone.yaw = Math.atan2(Math.sin(drone.yaw), Math.cos(drone.yaw));
  drone.pitch = clamp(drone.pitch + clamp(controls.pitch, -1, 1) * AIM_RATE * step, -MAX_AIM_PITCH, MAX_AIM_PITCH);

  let forward = clamp(controls.forward, -1, 1);
  let strafe = clamp(controls.strafe, -1, 1);
  let lift = clamp(controls.lift, -1, 1);
  const length = Math.max(1, Math.hypot(forward, strafe, lift));
  forward /= length;
  strafe /= length;
  lift /= length;
  const sin = Math.sin(drone.yaw);
  const cos = Math.cos(drone.yaw);
  const desired = {
    x: (sin * forward - cos * strafe) * DRONE_SPEED * precision,
    y: lift * DRONE_LIFT_SPEED * precision,
    z: (cos * forward + sin * strafe) * DRONE_SPEED * precision,
  };
  const delta = {
    x: desired.x - drone.velocity.x,
    y: desired.y - drone.velocity.y,
    z: desired.z - drone.velocity.z,
  };
  const distance = Math.hypot(delta.x, delta.y, delta.z);
  const braking = Math.hypot(desired.x, desired.y, desired.z) < drone.speed;
  const amount = distance > 0 ? Math.min(1, (braking ? BRAKING : ACCELERATION) * step / distance) : 1;
  drone.velocity.x += delta.x * amount;
  drone.velocity.y += delta.y * amount;
  drone.velocity.z += delta.z * amount;
  drone.speed = Math.hypot(drone.velocity.x, drone.velocity.y, drone.velocity.z);
  drone.position.x += drone.velocity.x * step;
  drone.position.y += drone.velocity.y * step;
  drone.position.z += drone.velocity.z * step;
}

export function sphereIntersectsBox(position: Vec3, radius: number, box: Box): boolean {
  const x = clamp(position.x, box.min.x, box.max.x);
  const y = clamp(position.y, box.min.y, box.max.y);
  const z = clamp(position.z, box.min.z, box.max.z);
  const dx = position.x - x;
  const dy = position.y - y;
  const dz = position.z - z;
  // Strict comparison deliberately considers a sphere resting on a surface safe.
  return dx * dx + dy * dy + dz * dz < radius * radius - 1e-10;
}

/** Slab test against a box expanded by radius. */
export function segmentBoxHit(start: Vec3, end: Vec3, box: Box, radius = 0): SegmentHit | null {
  const min = { x: box.min.x - radius, y: box.min.y - radius, z: box.min.z - radius };
  const max = { x: box.max.x + radius, y: box.max.y + radius, z: box.max.z + radius };
  const delta = { x: end.x - start.x, y: end.y - start.y, z: end.z - start.z };
  let enter = 0;
  let exit = 1;
  let normal: Vec3 = { x: 0, y: 0, z: 0 };

  for (const axis of ['x', 'y', 'z'] as const) {
    const d = delta[axis];
    if (Math.abs(d) < 1e-12) {
      if (start[axis] < min[axis] || start[axis] > max[axis]) return null;
      continue;
    }
    const inverse = 1 / d;
    let near = (min[axis] - start[axis]) * inverse;
    let far = (max[axis] - start[axis]) * inverse;
    let sign = -Math.sign(d);
    if (near > far) {
      [near, far] = [far, near];
    }
    if (near > enter) {
      enter = near;
      normal = { x: 0, y: 0, z: 0 };
      normal[axis] = sign;
    }
    exit = Math.min(exit, far);
    if (enter > exit) return null;
  }

  if (enter < 0 || enter > 1) return null;
  return {
    t: enter,
    position: {
      x: start.x + delta.x * enter,
      y: start.y + delta.y * enter,
      z: start.z + delta.z * enter,
    },
    normal,
  };
}
