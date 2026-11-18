import { FLOOR_Y, GRID_SPEC, type CellKind } from './grid';

type Point = { x: number; y: number; z: number };
export type WorldQueries = {
  /** First hit along a segment, or null. */
  ray(start: Point, end: Point): { position: Point } | null;
  /** True when a sphere touches world geometry. */
  overlaps(center: Point, radius: number): boolean;
};

/** A soldier's body: lower than this and nothing walks there. */
const MIN_CLEARANCE = 0.62;
/** Towers need this much headroom; less counts as "under furniture". */
const OPEN_CLEARANCE = 1.75;
/** The kitchen and veranda floors sit a little above the living-room floor. */
const FLOOR_TOLERANCE = 0.06;
/** A point of open living-room floor; cells not connected to it are dropped. */
const SEED = { x: 15.75, z: -13.2 };
/**
 * Footprints cleared by hand: furniture this game removes from the room
 * (the swivel chair by the cabinets, see REMOVED_FURNITURE in render/scene.ts).
 */
const CLEARED: readonly { minX: number; maxX: number; minZ: number; maxZ: number }[] = [
  { minX: 17.05, maxX: 19.2, minZ: -9.45, maxZ: -7.25 },
];

/**
 * Classify every cell of the play area from the collision mesh.
 * Rays start inside thick walls report a false floor, so only cells connected
 * to the living room over walkable floor are kept (4-neighbour flood fill).
 */
export function rasteriseGrid(world: WorldQueries): string[] {
  const { cell, minX, minZ, width, height } = GRID_SPEC;
  const kinds: CellKind[] = new Array(width * height).fill('#');
  for (let row = 0; row < height; row += 1) {
    const z = minZ + (row + 0.5) * cell;
    for (let column = 0; column < width; column += 1) {
      const x = minX + (column + 0.5) * cell;
      if (CLEARED.some(area => x > area.minX && x < area.maxX && z > area.minZ && z < area.maxZ)) {
        kinds[column + row * width] = '.';
        continue;
      }
      const floor = world.ray({ x, y: FLOOR_Y + 0.3, z }, { x, y: FLOOR_Y - 0.5, z });
      if (!floor || Math.abs(floor.position.y - FLOOR_Y) > FLOOR_TOLERANCE) continue;
      if (world.overlaps({ x, y: FLOOR_Y + 0.2, z }, 0.13) || world.overlaps({ x, y: FLOOR_Y + 0.45, z }, 0.13)) continue;
      const above = world.ray({ x, y: FLOOR_Y + 0.07, z }, { x, y: FLOOR_Y + 9, z });
      const clearance = above ? above.position.y - FLOOR_Y : Infinity;
      if (clearance < MIN_CLEARANCE) continue;
      kinds[column + row * width] = clearance < OPEN_CLEARANCE ? 'n' : '.';
    }
  }
  const seedIndex = Math.floor((SEED.x - minX) / cell) + Math.floor((SEED.z - minZ) / cell) * width;
  if (kinds[seedIndex] === '#') throw new Error('Defense grid seed is not on open floor');
  const reached = new Uint8Array(width * height);
  const queue = [seedIndex];
  reached[seedIndex] = 1;
  while (queue.length) {
    const index = queue.pop()!;
    const column = index % width;
    const row = (index - column) / width;
    const visit = (nextColumn: number, nextRow: number) => {
      if (nextColumn < 0 || nextRow < 0 || nextColumn >= width || nextRow >= height) return;
      const next = nextColumn + nextRow * width;
      if (reached[next] || kinds[next] === '#') return;
      reached[next] = 1;
      queue.push(next);
    };
    visit(column + 1, row);
    visit(column - 1, row);
    visit(column, row + 1);
    visit(column, row - 1);
  }
  const rows: string[] = [];
  for (let row = 0; row < height; row += 1) {
    let text = '';
    for (let column = 0; column < width; column += 1) {
      const index = column + row * width;
      text += reached[index] ? kinds[index] : '#';
    }
    rows.push(text);
  }
  return rows;
}
