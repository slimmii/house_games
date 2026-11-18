import { FLOOR_Y, cellAt, discFits, type Grid } from './grid';

export type Vec2 = { x: number; z: number };
export type LaneId = 'east' | 'west' | 'air';

/**
 * A route soldiers follow, sampled every LANE_STEP units along a smoothed
 * polyline. `height` is the altitude above the floor (air lanes only).
 */
export type Lane = {
  id: LaneId;
  name: string;
  air: boolean;
  height: number;
  length: number;
  xs: Float32Array;
  zs: Float32Array;
};

export const LANE_STEP = 0.1;
/** Towers keep this far from the centre line of a ground lane. */
export const LANE_HALF_WIDTH = 0.58;
/** Soldiers spread up to this far to either side of the centre line. */
export const LANE_SPREAD = 0.3;

/** The fort the player defends, in front of the TV unit; soldiers aim for its doorway. */
export const BASE = { x: 18.1, z: -1.95, halfX: 1.1, halfZ: 0.85, door: { x: 17.7, z: -3.95 } };

const EAST_WAYPOINTS: readonly (readonly [number, number])[] = [
  [17.4, -30.6], // on the veranda play mat
  [12.2, -29.7],
  [10.9, -28.2],
  [10.9, -25.2], // through the gap beside the play table
  [12.2, -22.6],
  [12.2, -13.7], // between the craft desk and the dining chairs
  [13.5, -12.3],
  [17.2, -12.3], // across the open floor
  [18.2, -11.1],
  [18.2, -6.4], // along the cabinet wall
  [BASE.door.x, BASE.door.z],
];

const WEST_WAYPOINTS: readonly (readonly [number, number])[] = [
  [5.3, -12.6], // top of the spiral stairs
  [6.9, -12.3],
  [6.9, -10.0],
  [6.2, -8.6],
  [6.2, -2.5], // through the office
  [7.4, -1.5],
  [15.8, -1.6], // along the front window
  [16.5, -3.1],
  [BASE.door.x, BASE.door.z],
];

const AIR_WAYPOINTS: readonly (readonly [number, number])[] = [
  [16.5, -31.5],
  [15.2, -22],
  [14.6, -11],
  [BASE.door.x, BASE.door.z],
];

/** Corner cutting: each pass replaces every corner by two points a quarter along its edges. */
function chaikin(points: readonly (readonly [number, number])[], passes: number): [number, number][] {
  let current = points.map(([x, z]) => [x, z] as [number, number]);
  for (let pass = 0; pass < passes; pass += 1) {
    const next: [number, number][] = [current[0]];
    for (let index = 0; index < current.length - 1; index += 1) {
      const [ax, az] = current[index];
      const [bx, bz] = current[index + 1];
      next.push([ax * 0.75 + bx * 0.25, az * 0.75 + bz * 0.25], [ax * 0.25 + bx * 0.75, az * 0.25 + bz * 0.75]);
    }
    next.push(current[current.length - 1]);
    current = next;
  }
  return current;
}

function buildLane(id: LaneId, name: string, waypoints: readonly (readonly [number, number])[], height: number): Lane {
  const smooth = chaikin(waypoints, 3);
  const xs: number[] = [smooth[0][0]];
  const zs: number[] = [smooth[0][1]];
  let carried = 0;
  for (let index = 0; index < smooth.length - 1; index += 1) {
    const [ax, az] = smooth[index];
    const [bx, bz] = smooth[index + 1];
    const segment = Math.hypot(bx - ax, bz - az);
    let along = LANE_STEP - carried;
    while (along <= segment) {
      xs.push(ax + ((bx - ax) * along) / segment);
      zs.push(az + ((bz - az) * along) / segment);
      along += LANE_STEP;
    }
    carried = segment - (along - LANE_STEP);
  }
  return { id, name, air: height > 0, height, length: (xs.length - 1) * LANE_STEP, xs: Float32Array.from(xs), zs: Float32Array.from(zs) };
}

export const LANES: Record<LaneId, Lane> = {
  east: buildLane('east', 'Veranda', EAST_WAYPOINTS, 0),
  west: buildLane('west', 'Stairs', WEST_WAYPOINTS, 0),
  air: buildLane('air', 'Air', AIR_WAYPOINTS, 3.4),
};
export const GROUND_LANES: readonly Lane[] = [LANES.east, LANES.west];

export type LanePoint = { x: number; z: number; dirX: number; dirZ: number };

/** Position and heading at a distance along a lane, shifted sideways by `lateral`. */
export function lanePoint(lane: Lane, distance: number, lateral: number, out: LanePoint): LanePoint {
  const last = lane.xs.length - 1;
  const scaled = Math.min(Math.max(distance / LANE_STEP, 0), last - 1e-4);
  const index = Math.floor(scaled);
  const blend = scaled - index;
  const ax = lane.xs[index];
  const az = lane.zs[index];
  const bx = lane.xs[index + 1];
  const bz = lane.zs[index + 1];
  // Heading over a wider span, so figures turn smoothly through corners.
  const behind = Math.max(0, index - 3);
  const ahead = Math.min(last, index + 4);
  let dirX = lane.xs[ahead] - lane.xs[behind];
  let dirZ = lane.zs[ahead] - lane.zs[behind];
  const length = Math.hypot(dirX, dirZ) || 1;
  dirX /= length;
  dirZ /= length;
  out.x = ax + (bx - ax) * blend + dirZ * lateral;
  out.z = az + (bz - az) * blend - dirX * lateral;
  out.dirX = dirX;
  out.dirZ = dirZ;
  return out;
}

/** Nearest point of a lane to a position: distance along the lane and how far away it is. */
export function nearestOnLane(lane: Lane, x: number, z: number): { distance: number; gap: number } {
  let best = Infinity;
  let bestIndex = 0;
  for (let index = 0; index < lane.xs.length; index += 1) {
    const gap = (lane.xs[index] - x) ** 2 + (lane.zs[index] - z) ** 2;
    if (gap < best) {
      best = gap;
      bestIndex = index;
    }
  }
  return { distance: bestIndex * LANE_STEP, gap: Math.sqrt(best) };
}

/** Furniture tops towers can stand on. Towers there see further. */
export type Surface = { id: string; name: string; minX: number; maxX: number; minZ: number; maxZ: number; y: number };
export const SURFACES: readonly Surface[] = [
  { id: 'coffee-table', name: 'Coffee table', minX: 13.05, maxX: 15.63, minZ: -5.37, maxZ: -2.79, y: 8.22 },
  { id: 'tv-unit', name: 'TV unit', minX: 19.45, maxX: 20.45, minZ: -9.5, maxZ: -1.05, y: 8.7 },
  { id: 'bench', name: 'Cabinet bench', minX: 19.4, maxX: 20.6, minZ: -23.85, maxZ: -13.7, y: 8.7 },
  { id: 'sofa-long', name: 'Sofa', minX: 12.0, maxX: 16.05, minZ: -8.5, maxZ: -6.6, y: 8.58 },
  { id: 'sofa-corner', name: 'Sofa', minX: 9.9, maxX: 11.9, minZ: -8.55, maxZ: -3.3, y: 8.58 },
  { id: 'dining-table', name: 'Dining table', minX: 16.15, maxX: 18.45, minZ: -22.1, maxZ: -15.7, y: 9.61 },
  { id: 'craft-desk', name: 'Craft desk', minX: 9.05, maxX: 10.45, minZ: -20.95, maxZ: -16.2, y: 9.47 },
];
export const HIGH_GROUND_RANGE = 1.2;

/** Floor that is reachable but not part of the playground (behind the closed WC door). */
const NO_BUILD: readonly { minX: number; maxX: number; minZ: number; maxZ: number }[] = [
  { minX: 0, maxX: 8.45, minZ: -19.3, maxZ: -15.5 },
];

export const TOWER_RADIUS = 0.5;
export const TOWER_SPACING = 1.1;

export type GameMap = {
  grid: Grid;
  /** 1 where a floor cell lies inside a ground lane's corridor. */
  laneMask: Uint8Array;
};

export function createMap(grid: Grid): GameMap {
  const laneMask = new Uint8Array(grid.width * grid.height);
  const reach = Math.ceil(LANE_HALF_WIDTH / grid.cell) + 1;
  for (const lane of GROUND_LANES) {
    for (let index = 0; index < lane.xs.length; index += 1) {
      const x = lane.xs[index];
      const z = lane.zs[index];
      const column = Math.floor((x - grid.minX) / grid.cell);
      const row = Math.floor((z - grid.minZ) / grid.cell);
      for (let dr = -reach; dr <= reach; dr += 1) {
        for (let dc = -reach; dc <= reach; dc += 1) {
          const c = column + dc;
          const r = row + dr;
          if (c < 0 || r < 0 || c >= grid.width || r >= grid.height) continue;
          const cx = grid.minX + (c + 0.5) * grid.cell;
          const cz = grid.minZ + (r + 0.5) * grid.cell;
          if ((cx - x) ** 2 + (cz - z) ** 2 <= LANE_HALF_WIDTH ** 2) laneMask[c + r * grid.width] = 1;
        }
      }
    }
  }
  return { grid, laneMask };
}

export type Site = { ok: true; y: number; surface: Surface | null } | { ok: false; reason: string };

export function surfaceAt(x: number, z: number): Surface | null {
  for (const surface of SURFACES) {
    if (x >= surface.minX && x <= surface.maxX && z >= surface.minZ && z <= surface.maxZ) return surface;
  }
  return null;
}

/**
 * Where a tower of the given weight would stand at (x, z), ignoring other
 * towers. A position over a furniture top means on that top: the floor
 * beneath is hidden from the commander view.
 */
export function siteAt(map: GameMap, x: number, z: number, heavy: boolean): Site {
  const surface = surfaceAt(x, z);
  if (surface) {
    if (heavy) return { ok: false, reason: 'Too heavy for furniture' };
    const r = TOWER_RADIUS;
    if (x - r < surface.minX || x + r > surface.maxX || z - r < surface.minZ || z + r > surface.maxZ) {
      return { ok: false, reason: 'Too close to the edge' };
    }
    return { ok: true, y: surface.y, surface };
  }
  if (NO_BUILD.some(area => x > area.minX && x < area.maxX && z > area.minZ && z < area.maxZ)) return { ok: false, reason: 'Out of bounds' };
  if (Math.abs(x - BASE.x) < BASE.halfX + TOWER_RADIUS && Math.abs(z - BASE.z) < BASE.halfZ + TOWER_RADIUS) {
    return { ok: false, reason: 'The fort is in the way' };
  }
  const { grid, laneMask } = map;
  if (cellAt(grid, x, z) === 0 || !discFits(grid, x, z, TOWER_RADIUS, false)) return { ok: false, reason: 'No room here' };
  const reach = Math.ceil(TOWER_RADIUS / grid.cell);
  const column = Math.floor((x - grid.minX) / grid.cell);
  const row = Math.floor((z - grid.minZ) / grid.cell);
  for (let dr = -reach; dr <= reach; dr += 1) {
    for (let dc = -reach; dc <= reach; dc += 1) {
      const c = column + dc;
      const r = row + dr;
      if (c < 0 || r < 0 || c >= grid.width || r >= grid.height) continue;
      if (laneMask[c + r * grid.width]) return { ok: false, reason: 'Soldiers march here' };
    }
  }
  return { ok: true, y: FLOOR_Y, surface: null };
}
