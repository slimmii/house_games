import type { DoorDefinition, DoorPartPose, SolidBox } from './door-types';
import type { Vec3 } from './vec';

const clamp01 = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
export const smoothDoorFraction = (fraction: number): number => {
  const value = clamp01(fraction);
  return value * value * (3 - 2 * value);
};

const values = (point: Vec3): [number, number, number] => [point.x, point.y, point.z];
const point = (value: readonly number[]): Vec3 => ({ x: value[0], y: value[1], z: value[2] });

export function doorMotionDuration(definition: DoorDefinition): number {
  if (definition.motion?.duration && definition.motion.duration > 0) return definition.motion.duration;
  if (definition.motion?.type === 'tracked-slide') return 1.6;
  if (definition.motion?.type === 'sectional') return 2.8;
  if (definition.motion?.type === 'flap') return 1.3;
  return 1.1;
}

export function doorMotionComponentCount(definition: DoorDefinition): number {
  return definition.motion?.type === 'sectional'
    ? Math.max(2, Math.floor(definition.motion.panelCount)) : 1;
}

export function doorMotionComponentBounds(definition: DoorDefinition, partIndex: number): SolidBox {
  const count = doorMotionComponentCount(definition);
  if (count === 1) return { min: [...definition.min], max: [...definition.max] };
  const index = Math.max(0, Math.min(count - 1, Math.floor(partIndex)));
  const step = (definition.max[1] - definition.min[1]) / count;
  return {
    min: [definition.min[0], definition.min[1] + step * index, definition.min[2]],
    max: [definition.max[0], definition.min[1] + step * (index + 1), definition.max[2]],
  };
}

function legacyTranslation(definition: DoorDefinition, fraction: number): [number, number, number] {
  const motion = definition.motion;
  if (motion?.type === 'tracked-slide') {
    const base=motion.baseOffset ?? [0,0,0];
    if(Math.hypot(...motion.unseat)<1e-8) {
      const progress=smoothDoorFraction(fraction);
      return base.map((value,axis)=>value+definition.slide[axis]*progress) as [number,number,number];
    }
    const split = Math.max(.02, Math.min(.45, motion.unseatFraction));
    if (fraction <= split) {
      const progress = smoothDoorFraction(fraction / split);
      return motion.unseat.map((value,axis) => base[axis]+value*progress) as [number, number, number];
    }
    const progress = smoothDoorFraction((fraction - split) / (1 - split));
    return motion.unseat.map((value, axis) => base[axis]+value+definition.slide[axis]*progress) as [number, number, number];
  }
  const progress = smoothDoorFraction(fraction);
  return definition.slide.map(value => value * progress) as [number, number, number];
}

/** Rigid pose of one stable bottom-to-top component in closed-world coordinates. */
export function doorMotionPartPose(
  definition: DoorDefinition,
  fraction: number,
  partIndex = 0,
): DoorPartPose {
  const motion = definition.motion;
  if (motion?.type === 'flap') {
    return {
      origin:[...definition.pivot],
      position:[...definition.pivot],
      rotationX:0,
      rotationY:0,
      rotationZ:motion.angle*smoothDoorFraction(fraction),
    };
  }
  if (motion?.type !== 'sectional') {
    const translation = legacyTranslation(definition, fraction);
    return {
      origin: [...definition.pivot],
      position: definition.pivot.map((value, axis) => value + translation[axis]),
      rotationX: 0,
      rotationY: definition.angle * smoothDoorFraction(fraction),
      rotationZ: 0,
    };
  }

  const count = doorMotionComponentCount(definition);
  const index = Math.max(0, Math.min(count - 1, Math.floor(partIndex)));
  const height = definition.max[1] - definition.min[1];
  const step = height / count;
  const closedCenter: [number, number, number] = [
    (definition.min[0] + definition.max[0]) * .5,
    definition.min[1] + step * (index + .5),
    (definition.min[2] + definition.max[2]) * .5,
  ];
  const radius = Math.max(step * .65, motion.curveRadius);
  const straight = height - step * .5;
  const arc = Math.PI * radius * .5;
  const travel = height + arc;
  const path = index * step + smoothDoorFraction(fraction) * travel;
  let y: number, inwardDistance: number, rotationX: number;
  if (path <= straight) {
    y = definition.min[1] + step * .5 + path;
    inwardDistance = 0;
    rotationX = 0;
  } else if (path < straight + arc) {
    const angle = (path - straight) / radius;
    y = definition.max[1] + radius * Math.sin(angle);
    inwardDistance = radius * (1 - Math.cos(angle));
    rotationX = -angle;
  } else {
    y = definition.max[1] + radius;
    inwardDistance = radius + path - straight - arc;
    rotationX = -Math.PI * .5;
  }
  const inward = motion.inward;
  return {
    origin: closedCenter,
    position: [
      closedCenter[0] + inward[0] * inwardDistance,
      y,
      closedCenter[2] + inward[2] * inwardDistance,
    ],
    rotationX,
    rotationY: 0,
    rotationZ: 0,
  };
}

function rotateX(value: readonly number[], angle: number): [number, number, number] {
  const c = Math.cos(angle), s = Math.sin(angle);
  return [value[0], c * value[1] - s * value[2], s * value[1] + c * value[2]];
}
function rotateY(value: readonly number[], angle: number): [number, number, number] {
  const c = Math.cos(angle), s = Math.sin(angle);
  return [c * value[0] + s * value[2], value[1], -s * value[0] + c * value[2]];
}
function rotateZ(value: readonly number[], angle: number): [number, number, number] {
  const c=Math.cos(angle),s=Math.sin(angle);
  return [c*value[0]-s*value[1],s*value[0]+c*value[1],value[2]];
}

export function doorMotionWorldPoint(
  definition: DoorDefinition,
  value: Vec3,
  fraction: number,
  partIndex = 0,
): Vec3 {
  const pose = doorMotionPartPose(definition, fraction, partIndex);
  const source = values(value).map((coordinate, axis) => coordinate - pose.origin[axis]);
  const rotated = rotateZ(rotateY(rotateX(source, pose.rotationX), pose.rotationY),pose.rotationZ);
  return point(rotated.map((coordinate, axis) => coordinate + pose.position[axis]));
}

export function doorMotionLocalPoint(
  definition: DoorDefinition,
  value: Vec3,
  fraction: number,
  partIndex = 0,
): Vec3 {
  const pose = doorMotionPartPose(definition, fraction, partIndex);
  const source = values(value).map((coordinate, axis) => coordinate - pose.position[axis]);
  const rotated = rotateX(rotateY(rotateZ(source,-pose.rotationZ), -pose.rotationY), -pose.rotationX);
  return point(rotated.map((coordinate, axis) => coordinate + pose.origin[axis]));
}

export function doorMotionWorldVector(
  definition: DoorDefinition,
  value: Vec3,
  fraction: number,
  partIndex = 0,
): Vec3 {
  const pose=doorMotionPartPose(definition,fraction,partIndex);
  return point(rotateZ(rotateY(rotateX(values(value),pose.rotationX),pose.rotationY),pose.rotationZ));
}

export function doorMotionLocalVector(
  definition: DoorDefinition,
  value: Vec3,
  fraction: number,
  partIndex = 0,
): Vec3 {
  const pose = doorMotionPartPose(definition, fraction, partIndex);
  return point(rotateX(rotateY(rotateZ(values(value),-pose.rotationZ), -pose.rotationY), -pose.rotationX));
}
