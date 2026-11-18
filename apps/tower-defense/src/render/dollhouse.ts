import * as THREE from 'three';
import { FLOOR_HEIGHTS, HOUSE_BOUNDS } from '@huis/house/shared/world';
import { createSectionCap } from './sectionCaps';

/** Living-room floor level (first storey). */
export const FLOOR_Y = FLOOR_HEIGHTS[1];
/**
 * Everything above this height is cut away. It sits below the beam between
 * the living room and the veranda, the recessed ceiling lamps and the
 * kitchen's lowered ceiling, so nothing is left floating or spanning the room.
 */
export const CLIP_HEIGHT = 13.8;

/** Outer walls that open while the camera looks in over them. */
const NORTH_CUT = -0.92;
const SOUTH_CUT = -32.45;
const WEST_CUT = 1.4;
const FAR = 60;
/** Cut faces are drawn this far inside their plane, so the plane itself does not clip them. */
const CAP_INSET = 0.006;
/** Cut walls look like the plywood edge of a dollhouse. */
const CAP_COLOR = '#c4ad8a';

const top = new THREE.Plane(new THREE.Vector3(0, -1, 0), CLIP_HEIGHT);
const north = new THREE.Plane(new THREE.Vector3(0, 0, -1), FAR);
const south = new THREE.Plane(new THREE.Vector3(0, 0, 1), FAR);
const west = new THREE.Plane(new THREE.Vector3(1, 0, 0), FAR);
/**
 * The renderer's global clipping planes. The set never changes size (shader
 * programs are compiled for a fixed count); unused planes wait far outside.
 */
export const CUT_PLANES: THREE.Plane[] = [top, north, south, west];

type Side = { plane: THREE.Plane; constant: number; closed: number; cap?: THREE.Mesh; open: boolean };
const sides: Record<'north' | 'south' | 'west', Side> = {
  // Even with the front wall in place, the balcony outside it is cut away:
  // its thin railings only shimmer at this distance.
  north: { plane: north, constant: NORTH_CUT, closed: 0.02, open: false },
  south: { plane: south, constant: -SOUTH_CUT, closed: FAR, open: false },
  west: { plane: west, constant: -WEST_CUT, closed: FAR, open: false },
};

/**
 * Open the walls on the camera's side. `yaw` is the direction from the target
 * to the camera. A wall opens a little later than it closes, so it does not
 * flap while the camera sits near the switching angle.
 */
export function updateCutaway(yaw: number): void {
  const facing = { north: Math.cos(yaw), south: -Math.cos(yaw), west: -Math.sin(yaw) };
  const openAt = { north: 0.26, south: 0.26, west: 0.4 };
  for (const name of ['north', 'south', 'west'] as const) {
    const side = sides[name];
    side.open = facing[name] > openAt[name] - (side.open ? 0.12 : 0);
    side.plane.constant = side.open ? side.constant : side.closed;
    if (side.cap) side.cap.visible = side.open;
  }
}

/**
 * Things that reach up through the cut but are not walls: tall cupboards, the
 * fridge, hanging plants, the stair rail, drainpipes. They keep their own cut
 * look; counting them as walls would fill the space between them and the wall.
 */
const NOT_WALLS = /^(Camber|Kitchen (long|return|integrated|refrigerator|photo pendant|base|sink|bench)|Niche photo|September29 \/ Hedwig|Reference spiral|Garden photo \/ tree)|rainwater|downpipe/;

let sectionCaps: THREE.Group | undefined;

/**
 * Work out the solid cut faces from the named source objects. Called from the
 * house loader's `onSource` hook: after batching, walls and furniture share
 * meshes and can no longer be told apart.
 */
export function prepareWallSections(source: THREE.Object3D): void {
  source.updateMatrixWorld(true);
  const walls: THREE.Mesh[] = [];
  source.traverse(object => {
    if (!(object instanceof THREE.Mesh) || NOT_WALLS.test(object.userData.name ?? object.name)) return;
    const material = object.material as THREE.Material | THREE.Material[];
    // Glass is a single sheet, not a wall.
    if (Array.isArray(material) ? material.every(part => part.transparent) : material.transparent) return;
    if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
    walls.push(object);
  });
  const margin = 0.6;
  const minX = HOUSE_BOUNDS.min.x - margin;
  const maxX = HOUSE_BOUNDS.max.x + margin;
  const minZ = HOUSE_BOUNDS.min.z - margin;
  const maxZ = HOUSE_BOUNDS.max.z + margin;
  const minY = FLOOR_Y - 1.2;
  sectionCaps = new THREE.Group();
  sectionCaps.name = 'dollhouse-caps';
  sectionCaps.add(createSectionCap(walls, { axis: 'y', value: CLIP_HEIGHT, minU: minX, maxU: maxX, minV: minZ, maxV: maxZ }, -CAP_INSET, CAP_COLOR, true));
  sides.north.cap = createSectionCap(walls, { axis: 'z', value: NORTH_CUT, minU: minX, maxU: maxX, minV: minY, maxV: CLIP_HEIGHT }, -CAP_INSET, CAP_COLOR);
  sides.south.cap = createSectionCap(walls, { axis: 'z', value: SOUTH_CUT, minU: minX, maxU: maxX, minV: minY, maxV: CLIP_HEIGHT }, CAP_INSET, CAP_COLOR);
  sides.west.cap = createSectionCap(walls, { axis: 'x', value: WEST_CUT, minU: minZ, maxU: maxZ, minV: minY, maxV: CLIP_HEIGHT }, CAP_INSET, CAP_COLOR);
  for (const side of Object.values(sides)) {
    side.cap!.visible = side.open;
    sectionCaps.add(side.cap!);
  }
}

export type Dollhouse = { hidden: number; caps: number; shown: number };

/**
 * Show only the first floor of the loaded house, open at the top. Meshes that
 * lie fully above the cut, below the floor or outside the house footprint
 * (garden, street) are hidden. Walls are hollow shells, so each cut gets a
 * sheet that is opaque exactly where a wall is cut (see sectionCaps.ts) and
 * cut walls read as solid.
 */
export function applyDollhouse(scene: THREE.Scene): Dollhouse {
  const house = scene.getObjectByName('blender-house');
  if (!house) throw new Error('House is not loaded');
  if (!sectionCaps) throw new Error('prepareWallSections was not called while the house loaded');
  house.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const stats: Dollhouse = { hidden: 0, caps: sectionCaps.children.length, shown: 0 };
  const margin = 0.6;
  house.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const geometry = object.geometry as THREE.BufferGeometry;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    box.copy(geometry.boundingBox!).applyMatrix4(object.matrixWorld);
    const outside = box.min.y > CLIP_HEIGHT || box.max.y < FLOOR_Y - 0.12
      || box.min.x > HOUSE_BOUNDS.max.x + margin || box.max.x < HOUSE_BOUNDS.min.x - margin
      || box.min.z > HOUSE_BOUNDS.max.z + margin || box.max.z < HOUSE_BOUNDS.min.z - margin;
    object.visible = !outside;
    if (outside) stats.hidden += 1;
    else stats.shown += 1;
  });
  scene.add(sectionCaps);
  return stats;
}
