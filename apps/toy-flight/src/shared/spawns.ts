import { FLOOR_HEIGHTS } from '@huis/house/shared/world';
import { overlapsWorld, rayWorld } from '@huis/house/shared/collision';
import { DRONE_RADIUS, type Vec3 } from './protocol';

// Source coordinates: Blender x/y, floor index, heading, expected surface above floor.
const SPAWN_CANDIDATES = [
  [1.75, 1.55, 0, Math.PI, 0],
  [4.45, 7.30, 0, 0, 0],
  [1.70, 8.25, 0, 0, 0],
  [5.25, 4.40, 1, 0, 0],
  [3.73, 2.20, 1, Math.PI, .45], // The measured sofa seat is a safe raised launch surface.
  [1.65, 1.90, 1, Math.PI, 0],
  [1.60, 8.35, 1, 0, 0],
  [5.50, 9.70, 1, 0, 0],
  [3.50, 3.75, 2, Math.PI / 2, 0],
  [3.45, 5.65, 2, Math.PI / 2, 0],
  [1.60, 2.30, 2, 0, 0],
  [1.55, 7.30, 2, 0, 0],
] as const;

let spawns: { position: Vec3; yaw: number }[] | undefined;
/** Snap each candidate to the actual exported surface, including floor finishes (needs installed collision). */
export const getSpawns = (): readonly { position: Vec3; yaw: number }[] => spawns ??= SPAWN_CANDIDATES.flatMap(([x, y, floor, yaw, surface]) => {
  const height = FLOOR_HEIGHTS[floor] + surface * 3;
  const top = { x: x * 3, y: height + 0.9, z: -y * 3 };
  const hit = rayWorld(top, { ...top, y: height - 0.6 });
  if (!hit || hit.normal.y < .8) return [];
  const position = { ...hit.position, y: hit.position.y + DRONE_RADIUS + .04 };
  if (overlapsWorld(position, DRONE_RADIUS + .02)) return [];
  return [{ position, yaw }];
});
