import manifestJson from './closets-manifest.json';
import type { DoorDefinition, SolidBox } from './door-types';

export type ClosetEntry = DoorDefinition & {
  kind: 'cupboard' | 'drawer' | 'sliding';
  frontNames: string[];
  handleNames: string[];
  attachedNames: string[];
  removeNames: string[];
  unitId: string;
  outward: number[];
  sourceSolidNames?: string[];
  sourceSolidBounds?: Array<SolidBox & { name: string }>;
  attachmentBounds?: Array<SolidBox & { name: string }>;
  /** Exact authored tray boards ordered bottom, left, right, back. */
  authoredTrayBounds?: Array<SolidBox & { name: string }>;
  /** The authored moving assembly already supplies the visible tray. */
  authoredTrayVisual?: boolean;
  notes?: string[];
};

export type ClosetUnit = {
  id: string;
  label: string;
  bodyNames: string[];
  interior: SolidBox & { shelves?: number[] };
  /** Exact retained source boards; generic shell/fixture geometry is omitted. */
  authoredStructureBounds?: Array<SolidBox & { name: string }>;
  /** Horizontal carcass sides omitted where perpendicular cabinets share an L-corner cavity. */
  openSides?: Array<'min' | 'max'>;
  /** Horizontal relief measured inward from an open L-corner side. */
  openSideShelfInset?: number;
  /** Neighboring perpendicular leaf's complete vertical sweep envelope. */
  cornerSweepY?: [number, number];
};

type ClosetManifest = {
  version: number;
  coordinateTransform: string;
  entries: ClosetEntry[];
  units: ClosetUnit[];
  excluded: unknown[];
};

const manifest = manifestJson as ClosetManifest;
const BOARD_THICKNESS = 0.045;

export const CLOSET_DOORS: readonly ClosetEntry[] = manifest.entries;
export const CLOSET_UNITS: readonly ClosetUnit[] = manifest.units;

const entriesByUnit = new Map<string, ClosetEntry[]>();
for (const entry of CLOSET_DOORS) {
  const entries = entriesByUnit.get(entry.unitId);
  if (entries) entries.push(entry);
  else entriesByUnit.set(entry.unitId, [entry]);
}

export function closetUnitEntry(unitId: string): ClosetEntry | undefined {
  const entries = entriesByUnit.get(unitId) ?? [];
  return entries.find(entry => entry.kind !== 'drawer') ?? entries[0];
}

function solidBox(min: readonly number[], max: readonly number[]): SolidBox {
  return { min: [...min], max: [...max] };
}

function depthAxis(entry: ClosetEntry): 0 | 2 {
  return Math.abs(entry.outward[0] ?? 0) >= Math.abs(entry.outward[2] ?? 0) ? 0 : 2;
}

function outwardSign(entry: ClosetEntry, axis: 0 | 2): number {
  return Math.sign(entry.outward[axis] ?? 0) || Math.sign(entry.slide[axis] ?? 0) || 1;
}

/** Generated carcasses stop behind the inner face of their closed fronts.
 * Unit interior bounds remain unchanged because containment describes the
 * usable bay, while physical shelves/sides need a small hinge reveal. */
function generatedBounds(unit:ClosetUnit,entries:readonly ClosetEntry[],entry:ClosetEntry):SolidBox {
  const min=[...unit.interior.min],max=[...unit.interior.max];
  const d=depthAxis(entry),sign=outwardSign(entry,d),reveal=.01;
  if (sign>0) max[d]=Math.min(max[d],Math.min(...entries.map(candidate=>candidate.min[d]))-reveal);
  else min[d]=Math.max(min[d],Math.max(...entries.map(candidate=>candidate.max[d]))+reveal);
  return {min,max};
}

export type ClosetInteriorKind = 'drawer' | 'wardrobe' | 'sink' | 'cold' | 'glass' | 'shelves';

export function closetInteriorKind(entry: ClosetEntry, unit?: ClosetUnit): ClosetInteriorKind {
  const text = `${entry.label} ${entry.frontNames.join(' ')} ${unit?.label ?? ''}`.toLowerCase();
  if (entry.kind === 'drawer') return 'drawer';
  if (/(wardrobe|armoire|clothes)/.test(text)) return 'wardrobe';
  if (/(sink|vanity)/.test(text)) return 'sink';
  if (/(refrigerator|freezer|fridge)/.test(text)) return 'cold';
  if (/(mirror|glass)/.test(text)) return 'glass';
  return 'shelves';
}

/** World-space shelf elevations used by both collision and client rendering. */
export function closetShelfHeights(unit: ClosetUnit, entry: ClosetEntry): readonly number[] {
  if (unit.interior.shelves?.length) return unit.interior.shelves;
  const height = unit.interior.max[1] - unit.interior.min[1];
  const kind = closetInteriorKind(entry, unit);
  let count: number;
  if (kind === 'drawer') count = 0;
  else if (kind === 'cold') count = height > 3 ? 4 : 2;
  else if (kind === 'wardrobe' || kind === 'sink') count = 1;
  else count = height > 4 ? 4 : height > 2.2 ? 3 : height > 1.1 ? 2 : 1;
  return Array.from({ length: count }, (_, index) =>
    unit.interior.min[1] + height * (index + 1) / (count + 1));
}

/** Thin carcass boards around the manifest's genuinely empty interior volume. */
function structuralBoxes(unit: ClosetUnit, entries: readonly ClosetEntry[]): SolidBox[] {
  if (unit.authoredStructureBounds?.length) return unit.authoredStructureBounds;
  const entry = entries.find(candidate => candidate.kind !== 'drawer') ?? entries[0];
  if (!entry) return [];
  const d = depthAxis(entry);
  const h: 0 | 2 = d === 0 ? 2 : 0;
  const sign = outwardSign(entry, d);
  const {min,max}=generatedBounds(unit,entries,entry);
  const boxes: SolidBox[] = [];
  const steppedClosures:SolidBox[]=[];
  const lo = [...min], hi = [...max];

  lo[h] = min[h] - BOARD_THICKNESS;
  hi[h] = min[h];
  lo[1] = min[1] - BOARD_THICKNESS;
  hi[1] = max[1] + BOARD_THICKNESS;
  if (!unit.openSides?.includes('min')) boxes.push(solidBox(lo, hi));

  lo[h] = max[h];
  hi[h] = max[h] + BOARD_THICKNESS;
  if (!unit.openSides?.includes('max')) boxes.push(solidBox(lo, hi));

  lo[h] = min[h];
  hi[h] = max[h];
  const cornerInset=unit.openSideShelfInset ?? 0;
  if (cornerInset>0) {
    if (unit.openSides?.includes('min')) lo[h]+=cornerInset;
    if (unit.openSides?.includes('max')) hi[h]-=cornerInset;
  }
  lo[1] = min[1] - BOARD_THICKNESS;
  hi[1] = min[1];
  boxes.push(solidBox(lo, hi));

  lo[1] = max[1];
  hi[1] = max[1] + BOARD_THICKNESS;
  boxes.push(solidBox(lo, hi));

  // The removed blind-corner span is still a closed shell: step its local
  // floor below and top above the perpendicular leaf's full swept Y envelope.
  // This preserves a solid exterior without putting either board in the swing.
  if (cornerInset>0&&unit.cornerSweepY) {
    const [sweepMinY,sweepMaxY]=unit.cornerSweepY;
    const addSteppedClosure=(side:'min'|'max') => {
      const closureMin=[...min],closureMax=[...max];
      if (side==='min') closureMax[h]=Math.min(max[h],min[h]+cornerInset);
      else closureMin[h]=Math.max(min[h],max[h]-cornerInset);
      const bottomMin=[...closureMin],bottomMax=[...closureMax];
      bottomMax[1]=sweepMinY-.01;
      bottomMin[1]=bottomMax[1]-BOARD_THICKNESS;
      steppedClosures.push(solidBox(bottomMin,bottomMax));
      const topMin=[...closureMin],topMax=[...closureMax];
      topMin[1]=sweepMaxY+.01;
      topMax[1]=topMin[1]+BOARD_THICKNESS;
      steppedClosures.push(solidBox(topMin,topMax));
    };
    if(unit.openSides?.includes('min')) addSteppedClosure('min');
    if(unit.openSides?.includes('max')) addSteppedClosure('max');
  }

  lo[h]=min[h];
  hi[h]=max[h];
  lo[1] = min[1];
  hi[1] = max[1];
  if (sign > 0) {
    lo[d] = min[d] - BOARD_THICKNESS;
    hi[d] = min[d];
  } else {
    lo[d] = max[d];
    hi[d] = max[d] + BOARD_THICKNESS;
  }
  boxes.push(solidBox(lo, hi));

  for (const shelfY of closetShelfHeights(unit, entry)) {
    const shelfMin = [...min], shelfMax = [...max];
    shelfMin[1] = shelfY - BOARD_THICKNESS * 0.5;
    shelfMax[1] = shelfY + BOARD_THICKNESS * 0.5;
    // Real adjustable shelves stop behind the face frame and closed front.
    // This also leaves the exact handle/door targeting volume unobstructed.
    const frontInset = unit.id === 'kitchen-fridge' ? .55 : Math.min(0.14, (max[d] - min[d]) * 0.18);
    if (sign > 0) shelfMax[d] -= frontInset;
    else shelfMin[d] += frontInset;
    // Blind-corner leaves swing through the shared perpendicular cavity.
    // Shelves use a rectangular kidney-shelf relief at that opening; stepped
    // closure boards above/below the leaf preserve the exterior shell.
    const sideInset=unit.openSideShelfInset ?? 0;
    if (sideInset>0) {
      if (unit.openSides?.includes('min')) shelfMin[h]+=sideInset;
      if (unit.openSides?.includes('max')) shelfMax[h]-=sideInset;
      if (shelfMax[h]-shelfMin[h]<BOARD_THICKNESS*2) continue;
    }
    boxes.push(solidBox(shelfMin, shelfMax));
  }
  // Long runs of adjacent fronts need actual vertical cabinet partitions. Treat
  // vertically stacked drawers as one span so they share a carcass bay.
  const horizontalSpans = new Map<string, [number, number]>();
  for (const candidate of entries) {
    const span: [number, number] = [candidate.min[h], candidate.max[h]];
    const key = `${span[0].toFixed(3)}:${span[1].toFixed(3)}`;
    horizontalSpans.set(key, span);
  }
  const spans = [...horizontalSpans.values()].sort((a, b) => a[0] - b[0]);
  for (let index = 1; index < spans.length; index++) {
    const previous = spans[index - 1], next = spans[index];
    if (next[0] < previous[1] - BOARD_THICKNESS) continue;
    const boundary = (previous[1] + next[0]) * 0.5;
    if (boundary <= min[h] + BOARD_THICKNESS || boundary >= max[h] - BOARD_THICKNESS) continue;
    const sideInset=unit.openSideShelfInset ?? 0;
    if (sideInset>0 && (
      (unit.openSides?.includes('min') && boundary<min[h]+sideInset)
      || (unit.openSides?.includes('max') && boundary>max[h]-sideInset)
    )) continue;
    const partitionMin = [...min], partitionMax = [...max];
    partitionMin[h] = boundary - BOARD_THICKNESS * 0.5;
    partitionMax[h] = boundary + BOARD_THICKNESS * 0.5;
    const frontInset = unit.id === 'kitchen-fridge' ? .55 : Math.min(0.14, (max[d] - min[d]) * 0.18);
    if (sign > 0) partitionMax[d] -= frontInset;
    else partitionMin[d] += frontInset;
    boxes.push(solidBox(partitionMin, partitionMax));
  }
  // Append relief closures so the long-standing side/floor/top/back/shelf
  // ordering remains stable for audits and renderer diagnostics.
  return [...boxes,...steppedClosures];
}

function fixtureBoxes(unit: ClosetUnit, entry: ClosetEntry): SolidBox[] {
  if (unit.authoredStructureBounds?.length) return [];
  const {min,max}=generatedBounds(unit,entriesByUnit.get(unit.id)??[entry],entry);
  const d = depthAxis(entry);
  const h: 0 | 2 = d === 0 ? 2 : 0;
  const sign = outwardSign(entry, d);
  const boxes: SolidBox[] = [];
  const kind = closetInteriorKind(entry, unit);
  const center = min.map((value, axis) => (value + max[axis]) * 0.5);
  const width = max[h] - min[h];
  const height = max[1] - min[1];
  const depth = max[d] - min[d];
  if (kind === 'wardrobe') {
    const railMin = [...center], railMax = [...center];
    railMin[h] = min[h] + BOARD_THICKNESS * 1.5;
    railMax[h] = max[h] - BOARD_THICKNESS * 1.5;
    railMin[1] = center[1] + height * 0.19 - 0.026;
    railMax[1] = center[1] + height * 0.19 + 0.026;
    railMin[d] = center[d] + sign * depth * 0.12 - 0.026;
    railMax[d] = center[d] + sign * depth * 0.12 + 0.026;
    boxes.push(solidBox(railMin, railMax));
  } else if (kind === 'sink') {
    const radius = Math.min(0.065, width * 0.06);
    const pipeMin = [...center], pipeMax = [...center];
    pipeMin[h] = center[h] - radius;
    pipeMax[h] = center[h] + radius;
    pipeMin[1] = center[1] + height * (0.23 - 0.17);
    pipeMax[1] = center[1] + height * (0.23 + 0.17);
    pipeMin[d] = center[d] - sign * depth * 0.18 - radius;
    pipeMax[d] = center[d] - sign * depth * 0.18 + radius;
    boxes.push(solidBox(pipeMin, pipeMax));
  } else if (kind === 'cold') {
    const drawerMin = [...center], drawerMax = [...center];
    drawerMin[h] = min[h] + BOARD_THICKNESS * 1.5;
    drawerMax[h] = max[h] - BOARD_THICKNESS * 1.5;
    drawerMin[1] = center[1] - height * 0.35 - Math.min(0.28, height * 0.12) * 0.5;
    drawerMax[1] = center[1] - height * 0.35 + Math.min(0.28, height * 0.12) * 0.5;
    drawerMin[d] = center[d] - depth * 0.36;
    drawerMax[d] = center[d] + depth * 0.36;
    boxes.push(solidBox(drawerMin, drawerMax));
  }
  return boxes;
}

/** Closed-pose bottom, two sides, and back for a drawer's moving tray. */
function drawerBoxes(entry: ClosetEntry, unit: ClosetUnit): SolidBox[] {
  if (entry.authoredTrayBounds?.length) return entry.authoredTrayBounds;
  const cavity = unit.interior;
  const d = depthAxis(entry);
  const h: 0 | 2 = d === 0 ? 2 : 0;
  const sign = outwardSign(entry, d);
  const width = cavity.max[h] - cavity.min[h];
  const depth = cavity.max[d] - cavity.min[d];
  const frontHeight = Math.max(0.12, entry.max[1] - entry.min[1]);
  const t = Math.min(BOARD_THICKNESS, width * 0.055, depth * 0.06);
  const trayDepth = Math.max(t * 4, depth - t * 2.6);
  const sideHeight = Math.max(t * 2.5,
    Math.min(frontHeight * 0.58, (cavity.max[1] - cavity.min[1]) * 0.22));
  const frontCenterY = (entry.min[1] + entry.max[1]) * 0.5;
  const bottomY = Math.max(cavity.min[1] + t * 1.5, Math.min(
    cavity.max[1] - sideHeight - t,
    frontCenterY - frontHeight * 0.5 + t * 1.4,
  ));
  const insideMin = [...cavity.min], insideMax = [...cavity.max];
  insideMin[h] = Math.max(cavity.min[h] + t * 1.75, entry.min[h] + t * 1.25);
  insideMax[h] = Math.min(cavity.max[h] - t * 1.75, entry.max[h] - t * 1.25);
  if (sign > 0) insideMin[d] = insideMax[d] - t - trayDepth;
  else insideMax[d] = insideMin[d] + t + trayDepth;

  const bottomMin = [...insideMin], bottomMax = [...insideMax];
  bottomMin[1] = bottomY;
  bottomMax[1] = bottomY + t;
  const boxes = [solidBox(bottomMin, bottomMax)];

  const leftMin = [...insideMin], leftMax = [...insideMax];
  leftMax[h] = leftMin[h] + t;
  leftMin[1] = bottomY;
  leftMax[1] = bottomY + sideHeight;
  boxes.push(solidBox(leftMin, leftMax));

  const rightMin = [...insideMin], rightMax = [...insideMax];
  rightMin[h] = rightMax[h] - t;
  rightMin[1] = bottomY;
  rightMax[1] = bottomY + sideHeight;
  boxes.push(solidBox(rightMin, rightMax));

  const backMin = [...insideMin], backMax = [...insideMax];
  if (sign > 0) backMax[d] = backMin[d] + t;
  else backMin[d] = backMax[d] - t;
  backMin[1] = bottomY;
  backMax[1] = bottomY + sideHeight;
  boxes.push(solidBox(backMin, backMax));
  return boxes;
}

export const CLOSET_UNIT_STATIC_BOXES: Readonly<Record<string, readonly SolidBox[]>> =
  Object.fromEntries(CLOSET_UNITS.map(unit => {
    const entries = entriesByUnit.get(unit.id) ?? [];
    const entry = closetUnitEntry(unit.id);
    return [unit.id, entry ? [...structuralBoxes(unit, entries), ...fixtureBoxes(unit, entry)] : []];
  }));

export const CLOSET_UNIT_STRUCTURE_BOXES: Readonly<Record<string, readonly SolidBox[]>> =
  Object.fromEntries(CLOSET_UNITS.map(unit => [
    unit.id,
    structuralBoxes(unit, entriesByUnit.get(unit.id) ?? []),
  ]));

export const CLOSET_STATIC_BOXES: readonly SolidBox[] =
  CLOSET_UNITS.flatMap(unit => CLOSET_UNIT_STATIC_BOXES[unit.id] ?? []);

export function getClosetStaticBoxes(unitId: string): readonly SolidBox[] {
  return CLOSET_UNIT_STATIC_BOXES[unitId] ?? [];
}

export function getClosetStructuralBoxes(unitId: string): readonly SolidBox[] {
  return CLOSET_UNIT_STRUCTURE_BOXES[unitId] ?? [];
}

export const CLOSET_DRAWER_BOXES: Readonly<Record<string, readonly SolidBox[]>> =
  Object.fromEntries(CLOSET_DOORS.map(entry => {
    const unit = CLOSET_UNITS.find(candidate => candidate.id === entry.unitId);
    return [entry.id, entry.kind === 'drawer' && unit ? drawerBoxes(entry, unit) : []];
  }));

/** Appliance door lining and bottle pockets follow the same hinge as the front. */
function fridgeDoorBoxes(entry: ClosetEntry): SolidBox[] {
  if (entry.unitId !== 'kitchen-fridge') return [];
  const width = entry.max[0] - entry.min[0], height = entry.max[1] - entry.min[1];
  const center = [(entry.min[0] + entry.max[0]) / 2, (entry.min[1] + entry.max[1]) / 2, entry.max[2] + .015];
  const boxes: SolidBox[] = [];
  const add = (size: number[], at: number[]) => boxes.push({
    min: center.map((value, axis) => value + at[axis] - size[axis] / 2),
    max: center.map((value, axis) => value + at[axis] + size[axis] / 2),
  });
  add([width - .17, height - .15, .075], [0, 0, .04]);
  if (height > 3) for (const y of [-height / 2 + .35, -.2, height / 2 - .95]) {
    const w = width - .43;
    add([w, .035, .32], [0, y, .23]);
    add([w, .32, .035], [0, y + .16, .39]);
    for (const side of [-1, 1]) add([.035, .32, .32], [side * w / 2, y + .16, .23]);
  }
  return boxes;
}

export const CLOSET_DYNAMIC_BOXES: Readonly<Record<string, readonly SolidBox[]>> =
  Object.fromEntries(CLOSET_DOORS.map(entry => [
    entry.id,
    // Target boxes are the exact authored handles (or the small generated grip
    // on a handleless front), so those pieces also participate in collision.
    [...entry.collisionBoxes, ...fridgeDoorBoxes(entry), ...entry.targetBoxes, ...(CLOSET_DRAWER_BOXES[entry.id] ?? [])],
  ]));

export function getClosetMovingBoxes(id: string): readonly SolidBox[] {
  return CLOSET_DYNAMIC_BOXES[id] ?? [];
}
