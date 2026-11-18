import type { Vec3 } from './vec';

/** The source house is in meters; the game uses a uniform 3× export. */
export const HOUSE_SCALE = 3;
export const FLOOR_HEIGHTS = [0, 2.41, 5.31].map(height => height * HOUSE_SCALE);
export const HOUSE_BOUNDS = {
  min: { x: -0.3, y: -0.6, z: -33.2 },
  // A small front apron connects the entrance and the open bicycle-room door.
  max: { x: 22.5, y: 25.5, z: 2.1 },
};

export type HouseRoom = { name: string; floor: number; min: Vec3; max: Vec3; color: string };

function room(name: string, floor: number, x0: number, x1: number, y0: number, y1: number, color: string): HouseRoom {
  return {
    name, floor, color,
    min: { x: x0 * 3, y: FLOOR_HEIGHTS[floor], z: -y1 * 3 },
    max: { x: x1 * 3, y: FLOOR_HEIGHTS[floor] + [2.22, 2.66, 2.8][floor] * 3, z: -y0 * 3 },
  };
}

/** Room labels follow the existing plan; these bounds label the map, not collisions. */
export const ROOMS: HouseRoom[] = [
  room('Entrance', 0, .30, 2.80, .30, 3.32, '#ead7b8'),
  room('Cloakroom & stairs', 0, .30, 2.80, 3.32, 6.50, '#dbb598'),
  room('Laundry', 0, .30, 2.80, 6.65, 10.68, '#c9dfd9'),
  room('Ground bedroom', 0, 2.95, 7.10, 5.86, 10.68, '#ddc9de'),
  room('Shower room', 0, 3.24, 5.05, 3.95, 5.75, '#d7e3dd'),
  room('Dressing', 0, 5.08, 7.10, 3.95, 5.75, '#e4d4be'),
  room('Bicycle room', 0, 2.95, 7.10, .30, 3.92, '#d2d9e1'),
  room('Office', 1, .30, 2.80, .30, 3.30, '#dfc7ac'),
  room('Living room', 1, 2.95, 7.10, .30, 8.64, '#dbc8da'),
  room('First-floor landing', 1, .30, 2.80, 3.34, 5.75, '#dcb79c'),
  room('WC', 1, .30, 1.92, 5.35, 6.49, '#d8e2d8'),
  room('Kitchen', 1, .30, 2.80, 6.65, 10.68, '#c4d8b9'),
  room('Veranda', 1, 2.95, 7.10, 8.95, 10.68, '#dfddb8'),
  room('Bedroom 1', 2, 2.95, 7.10, .30, 4.99, '#c1d2ba'),
  room('Bedroom 2', 2, 2.95, 7.10, 5.12, 8.70, '#dbc5da'),
  room('Bedroom 3', 2, .30, 2.80, .30, 3.24, '#cbd8e2'),
  room('Upper landing', 2, 1.92, 2.80, 3.34, 6.44, '#d9ba9d'),
  room('Storage', 2, .30, 1.80, 5.33, 6.44, '#e1d3bb'),
  room('Bathroom', 2, .30, 2.80, 6.55, 8.70, '#d9e4e0'),
];

/** Storey index (0 ground, 1 first, 2 second) from a world height. */
export function floorIndex(y: number): number {
  let floor = 0;
  for (let i = 1; i < FLOOR_HEIGHTS.length; i++) if (y >= FLOOR_HEIGHTS[i]) floor = i;
  return floor;
}

export function getRoomName(position: Vec3): string {
  return ROOMS.find(({ min, max }) => position.x >= min.x && position.x <= max.x && position.y >= min.y && position.y <= max.y && position.z >= min.z && position.z <= max.z)?.name ?? 'Stairwell';
}
