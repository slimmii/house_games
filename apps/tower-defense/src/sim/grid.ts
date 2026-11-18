/**
 * Placement grid of the first-floor play area: which floor cells toys can
 * stand on. Baked from the house collision mesh by `npm run bake:defense-grid`
 * into grid.generated.json; nothing here touches the collision mesh.
 */
export const FLOOR_Y = 7.23;

export const GRID_SPEC = {
  /** Cell size in world units (5 cm of the real house). */
  cell: 0.15,
  minX: 0.6,
  minZ: -33,
  width: 140,
  height: 218,
} as const;

/** `#` blocked, `.` open floor, `n` floor under low furniture (soldiers fit, towers do not). */
export type CellKind = '#' | '.' | 'n';

export type GridFile = {
  collisionSha256: string;
  cell: number;
  minX: number;
  minZ: number;
  width: number;
  height: number;
  /** One string per row, from `minZ` upward; one character per cell from `minX` upward. */
  rows: string[];
};

export type Grid = {
  cell: number;
  minX: number;
  minZ: number;
  width: number;
  height: number;
  /** 0 blocked, 1 open, 2 low clearance; index = column + row * width. */
  cells: Uint8Array;
};

const CODES: Record<string, number> = { '#': 0, '.': 1, n: 2 };

export function decodeGrid(file: GridFile): Grid {
  if (file.rows.length !== file.height || file.rows.some(row => row.length !== file.width)) {
    throw new Error('Defense grid file has the wrong size');
  }
  const cells = new Uint8Array(file.width * file.height);
  file.rows.forEach((row, rowIndex) => {
    for (let column = 0; column < file.width; column += 1) cells[column + rowIndex * file.width] = CODES[row[column]] ?? 0;
  });
  return { cell: file.cell, minX: file.minX, minZ: file.minZ, width: file.width, height: file.height, cells };
}

export const cellColumn = (grid: Grid, x: number) => Math.floor((x - grid.minX) / grid.cell);
export const cellRow = (grid: Grid, z: number) => Math.floor((z - grid.minZ) / grid.cell);

/** Cell value at a world position (0 outside the grid). */
export function cellAt(grid: Grid, x: number, z: number): number {
  const column = cellColumn(grid, x);
  const row = cellRow(grid, z);
  if (column < 0 || row < 0 || column >= grid.width || row >= grid.height) return 0;
  return grid.cells[column + row * grid.width];
}

/**
 * True when every cell touched by a disc is acceptable.
 * `allowLow` accepts cells under low furniture as well as open floor.
 */
export function discFits(grid: Grid, x: number, z: number, radius: number, allowLow: boolean): boolean {
  const c0 = cellColumn(grid, x - radius);
  const c1 = cellColumn(grid, x + radius);
  const r0 = cellRow(grid, z - radius);
  const r1 = cellRow(grid, z + radius);
  if (c0 < 0 || r0 < 0 || c1 >= grid.width || r1 >= grid.height) return false;
  for (let row = r0; row <= r1; row += 1) {
    for (let column = c0; column <= c1; column += 1) {
      // Skip corner cells whose nearest point lies outside the disc.
      const nearX = Math.max(grid.minX + column * grid.cell, Math.min(x, grid.minX + (column + 1) * grid.cell));
      const nearZ = Math.max(grid.minZ + row * grid.cell, Math.min(z, grid.minZ + (row + 1) * grid.cell));
      if ((nearX - x) ** 2 + (nearZ - z) ** 2 > radius * radius) continue;
      const value = grid.cells[column + row * grid.width];
      if (value === 0 || (value === 2 && !allowLow)) return false;
    }
  }
  return true;
}
