import * as THREE from 'three';
import { ToyBuilder, type PartOptions, type ToyModel } from './kit';

// Player towers, set A: the pop-gun block tower, the dart blaster and the
// marble mortar, three levels each. Every tower is a fixed base plus one
// turret; model space faces +z (see kit.ts).

type V3 = [number, number, number];
type Look = Omit<PartOptions, 'at' | 'rot' | 'scale'>;

const DEG = Math.PI / 180;
const UP = new THREE.Vector3(0, 1, 0);
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpM = new THREE.Matrix4();

// ---------------------------------------------------------------- palette
const WOOD = '#e2b06c';
const WOOD_DARK = '#b5763c';
const CORK = '#c99760';
const STRING = '#f3ecdc';
const BLOCK_RED = '#e0362c';
const BLOCK_BLUE = '#2b62d8';
const BLOCK_YELLOW = '#f7c425';
const CREAM = '#fff3d6';
const BRASS = '#e0ae3c';
const STEEL = '#c9ced6';

const ORANGE = '#ff7417';
const ORANGE_DEEP = '#e85a0c';
const BLUE = '#1f5fe8';
const BLUE_LIGHT = '#4b9bff';
const YELLOW = '#ffd21f';
const TYRE = '#1f1f22';
const WINDOW = '#7fd3ff';

const GREEN = '#35d46a';
const GREEN_LIGHT = '#8cf5a4';
const PURPLE = '#9a4fe6';
const PURPLE_LIGHT = '#c99bff';
const MARBLE = '#1ed6ea';
const MARBLE_DEEP = '#178dff';
const MARBLE_SWIRL = '#ffffff';

// ---------------------------------------------------------------- helpers
function rotFromUp(dir: THREE.Vector3): V3 {
  tmpQ.setFromUnitVectors(UP, dir.clone().normalize());
  tmpE.setFromQuaternion(tmpQ, 'XYZ');
  return [tmpE.x, tmpE.y, tmpE.z];
}

function rotFromBasis(x: THREE.Vector3, y: THREE.Vector3): V3 {
  const z = new THREE.Vector3().crossVectors(x, y);
  tmpM.makeBasis(x, y, z);
  tmpE.setFromRotationMatrix(tmpM, 'XYZ');
  return [tmpE.x, tmpE.y, tmpE.z];
}

/** Cylinder from `from` to `to`. */
function rod(toy: ToyBuilder, from: V3, to: V3, radius: number, look: Look, radiusTo = radius): void {
  const a = new THREE.Vector3(...from);
  const b = new THREE.Vector3(...to);
  const dir = b.clone().sub(a);
  const length = dir.length();
  toy.cylinder(radiusTo, radius, length, { ...look, at: a.add(b).multiplyScalar(0.5).toArray() as V3, rot: rotFromUp(dir) });
}

/** Polyline of rods (strings, belts). */
function polyline(toy: ToyBuilder, points: V3[], radius: number, look: Look): void {
  for (let index = 0; index + 1 < points.length; index += 1) rod(toy, points[index], points[index + 1], radius, look);
}

function add(a: V3, b: V3): V3 { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
function scaleV(a: V3, s: number): V3 { return [a[0] * s, a[1] * s, a[2] * s]; }

/** Straight-stroke glyphs in a unit square (-0.5..0.5). */
const GLYPHS: Record<string, [number, number, number, number][]> = {
  A: [[-0.28, -0.36, 0, 0.36], [0, 0.36, 0.28, -0.36], [-0.15, -0.08, 0.15, -0.08]],
  E: [[-0.22, -0.36, -0.22, 0.36], [-0.22, 0.36, 0.24, 0.36], [-0.22, 0, 0.14, 0], [-0.22, -0.36, 0.24, -0.36]],
  F: [[-0.2, -0.36, -0.2, 0.36], [-0.2, 0.36, 0.24, 0.36], [-0.2, 0.02, 0.14, 0.02]],
  H: [[-0.24, -0.36, -0.24, 0.36], [0.24, -0.36, 0.24, 0.36], [-0.24, 0, 0.24, 0]],
  K: [[-0.22, -0.36, -0.22, 0.36], [-0.22, -0.02, 0.24, 0.36], [-0.08, 0.08, 0.24, -0.36]],
  L: [[-0.18, -0.36, -0.18, 0.36], [-0.18, -0.36, 0.24, -0.36]],
  M: [[-0.28, -0.36, -0.28, 0.36], [-0.28, 0.36, 0, -0.02], [0, -0.02, 0.28, 0.36], [0.28, 0.36, 0.28, -0.36]],
  N: [[-0.24, -0.36, -0.24, 0.36], [-0.24, 0.36, 0.24, -0.36], [0.24, -0.36, 0.24, 0.36]],
  T: [[-0.28, 0.36, 0.28, 0.36], [0, 0.36, 0, -0.36]],
  V: [[-0.28, 0.36, 0, -0.36], [0, -0.36, 0.28, 0.36]],
  X: [[-0.26, 0.36, 0.26, -0.36], [-0.26, -0.36, 0.26, 0.36]],
  Y: [[-0.26, 0.36, 0, 0.02], [0.26, 0.36, 0, 0.02], [0, 0.02, 0, -0.36]],
  Z: [[-0.24, 0.36, 0.24, 0.36], [0.24, 0.36, -0.24, -0.36], [-0.24, -0.36, 0.24, -0.36]],
  '1': [[0, -0.36, 0, 0.36], [0, 0.36, -0.14, 0.22], [-0.14, -0.36, 0.14, -0.36]],
  '4': [[0.12, -0.36, 0.12, 0.36], [0.12, 0.36, -0.24, -0.06], [-0.24, -0.06, 0.24, -0.06]],
  '7': [[-0.24, 0.36, 0.24, 0.36], [0.24, 0.36, -0.06, -0.36]],
};

type BlockSpec = {
  /** Edge length of the cube. */
  s: number;
  /** Bottom centre. */
  at: V3;
  yaw: number;
  color: string;
  ink: string;
  /** One glyph per side face (+z, +x, -z, -x before yaw). */
  letters: string;
  frame?: boolean;
  top?: boolean;
  /** Rounded edges (default true). */
  round?: boolean;
};

/** Painted wooden alphabet block with raised letters and borders. */
function alphaBlock(toy: ToyBuilder, b: BlockSpec): void {
  const { s, yaw } = b;
  const centre = new THREE.Vector3(b.at[0], b.at[1] + s / 2, b.at[2]);
  toy.box([s, s, s], { at: centre.toArray() as V3, rot: [0, yaw, 0], color: b.color, finish: 'matte', round: b.round === false ? 0 : s * 0.07 });
  const depth = s * 0.03;
  const ink: Look = { color: b.ink, finish: 'matte' };
  const stroke = (faceYaw: number, x1: number, y1: number, x2: number, y2: number, thick: number) => {
    const n = new THREE.Vector3(Math.sin(faceYaw), 0, Math.cos(faceYaw));
    const right = new THREE.Vector3(Math.cos(faceYaw), 0, -Math.sin(faceYaw));
    const u = (x1 + x2) / 2 * s, v = (y1 + y2) / 2 * s;
    const length = Math.hypot(x2 - x1, y2 - y1) * s + thick;
    const p = centre.clone().addScaledVector(right, u).addScaledVector(UP, v).addScaledVector(n, s / 2 + depth / 2 - 0.004);
    toy.box([length, thick, depth], { ...ink, at: p.toArray() as V3, rot: [0, faceYaw, Math.atan2(y2 - y1, x2 - x1)], round: 0 });
  };
  for (let face = 0; face < 4; face += 1) {
    const faceYaw = yaw + face * Math.PI / 2;
    const glyph = GLYPHS[b.letters[face % b.letters.length]] ?? [];
    for (const [x1, y1, x2, y2] of glyph) stroke(faceYaw, x1 * 0.85, y1 * 0.85, x2 * 0.85, y2 * 0.85, s * 0.1);
    if (b.frame !== false) {
      const e = 0.39, t = s * 0.05;
      stroke(faceYaw, -e, -e, e, -e, t);
      stroke(faceYaw, -e, e, e, e, t);
      stroke(faceYaw, -e, -e + 0.05, -e, e - 0.05, t);
      stroke(faceYaw, e, -e + 0.05, e, e - 0.05, t);
    }
  }
  if (b.top) {
    const e = 0.39 * s, t = s * 0.05;
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const y = centre.y + s / 2 + depth / 2 - 0.004;
    for (const sign of [-1, 1]) {
      const p1 = centre.clone().addScaledVector(fwd, sign * e); p1.y = y;
      toy.box([2 * e + t, depth, t], { ...ink, at: p1.toArray() as V3, rot: [0, yaw, 0], round: 0 });
      const p2 = centre.clone().addScaledVector(right, sign * e); p2.y = y;
      toy.box([t, depth, 2 * e - t], { ...ink, at: p2.toArray() as V3, rot: [0, yaw, 0], round: 0 });
    }
  }
}

/** Builds the model with height and footprint measured from the geometry. */
function finish(toy: ToyBuilder, muzzle: V3, radius = 0.4): ToyModel {
  const model = toy.build({ height: 1, radius, muzzle });
  let top = 0;
  const p = new THREE.Vector3();
  for (const piece of model.pieces) {
    for (const geometry of Object.values(piece.geometry)) {
      const position = geometry.getAttribute('position');
      for (let index = 0; index < position.count; index += 1) {
        p.fromBufferAttribute(position, index);
        top = Math.max(top, p.y + piece.pivot[1]);
      }
    }
  }
  model.height = +top.toFixed(3);
  return model;
}

// ================================================================ POP-GUN
type GunOptions = { double?: boolean; brass?: boolean; flag?: boolean; barrel: string };

/** Wooden pop-gun on a swivel spool; turret pivot at `pivot`. Returns the muzzle. */
function popGun(toy: ToyBuilder, pivot: V3, k: number, o: GunOptions): V3 {
  const P = (x: number, y: number, z: number): V3 => [pivot[0] + x * k, pivot[1] + y * k, pivot[2] + z * k];
  toy.turret(pivot);
  const wood: Look = { color: WOOD, finish: 'matte' };
  const dark: Look = { color: WOOD_DARK, finish: 'matte' };
  // Swivel spool.
  toy.lathe([[0, 0], [0.095, 0], [0.095, 0.014], [0.07, 0.022], [0.07, 0.036], [0.095, 0.044], [0.095, 0.056], [0, 0.056]].map(([r, y]) => [r * k, y * k] as const),
    { ...wood, at: P(0, 0, 0), segments: 14 });
  toy.cylinder(0.072 * k, 0.072 * k, 0.012 * k, { color: BLOCK_RED, finish: 'matte', at: P(0, 0.029, 0), segments: 14 });
  const rb = (o.double ? 0.04 : 0.045);
  const by = 0.13; // barrel axis height above the pivot
  const xs = o.double ? [-0.048, 0.048] : [0];
  const zBack = -0.1, zFront = 0.27;
  const outer = (o.double ? 0.048 + rb : rb) + 0.016;
  // Cradle uprights and the brass pin.
  for (const side of [-1, 1]) {
    toy.box([0.026 * k, 0.09 * k, 0.07 * k], { ...dark, at: P(side * outer, 0.056 + 0.045, 0.02), round: 0 });
    toy.cylinder(0.016 * k, 0.016 * k, 0.012 * k, { color: BRASS, finish: 'metal', at: P(side * (outer + 0.016), by - 0.01, 0.02), rot: [0, 0, Math.PI / 2], segments: 8 });
  }
  if (o.double) toy.box([0.05 * k, 0.05 * k, 0.3 * k], { ...dark, at: P(0, by - 0.02, 0.08), round: 0 });
  for (const x of xs) {
    // Barrel with painted bands.
    toy.cylinder(rb * k, rb * k, (zFront - zBack) * k, { color: o.barrel, finish: 'matte', at: P(x, by, (zFront + zBack) / 2), rot: [Math.PI / 2, 0, 0], segments: 12 });
    toy.cylinder(rb * 1.14 * k, rb * 1.14 * k, 0.03 * k, { color: BLOCK_RED, finish: 'matte', at: P(x, by, zFront - 0.018), rot: [Math.PI / 2, 0, 0], segments: 14 });
    toy.cylinder(rb * 1.12 * k, rb * 1.12 * k, 0.024 * k, { color: BLOCK_BLUE, finish: 'matte', at: P(x, by, zBack + 0.03), rot: [Math.PI / 2, 0, 0], segments: 14 });
    if (o.brass) toy.cylinder(rb * 1.16 * k, rb * 1.16 * k, 0.04 * k, { color: BRASS, finish: 'metal', at: P(x, by, 0.12), rot: [Math.PI / 2, 0, 0], segments: 14 });
    // Cork plugged into the muzzle.
    toy.cylinder(rb * 1.02 * k, rb * 0.78 * k, 0.065 * k, { color: CORK, finish: 'matte', at: P(x, by, zFront + 0.02), rot: [Math.PI / 2, 0, 0], segments: 10 });
    // String from the cork, sagging, tied round the barrel.
    const sx = x + (x < 0 ? -1 : 1) * rb * 0.95;
    const sd = x < 0 ? -1 : 1;
    polyline(toy, [P(sx + sd * 0.004, by - rb * 0.3, zFront + 0.035), P(sx + sd * 0.006, by - rb * 0.9, zFront - 0.02), P(sx, by - rb * 0.75, zFront - 0.1)],
      0.0045 * k, { color: STRING, finish: 'matte', segments: 4 });
    toy.cylinder(rb * 1.04 * k, rb * 1.04 * k, 0.01 * k, { color: STRING, finish: 'matte', at: P(x, by, zFront - 0.1), rot: [Math.PI / 2, 0, 0], segments: 10 });
    // Plunger handle out of the back.
    rod(toy, P(x, by, zBack), P(x, by, zBack - 0.06), 0.012 * k, { color: WOOD, finish: 'matte', segments: 6 });
    toy.sphere(0.028 * k, { color: BLOCK_RED, finish: 'matte', at: P(x, by, zBack - 0.075), segments: 8 });
  }
  // Stock, angled down behind the barrel (profile in the z-y plane; outline x is -z).
  const stock: [number, number][] = [[-0.06, 0.02], [0.02, 0.02], [0.12, -0.005], [0.155, -0.02], [0.15, -0.085], [0.12, -0.09], [0.03, -0.045], [-0.06, -0.04]];
  toy.extrude(stock.map(([x, y]) => [x * k, y * k] as [number, number]), (o.double ? 0.12 : 0.065) * k, { ...dark, at: P(0, by - rb * 0.6, zBack), rot: [0, Math.PI / 2, 0] });
  if (o.flag) {
    const fx = -outer - 0.035, fz = -0.06, h = o.double ? 0.34 : 0.17;
    rod(toy, P(fx, 0.03, fz), P(fx, 0.03 + h, fz), 0.007 * k, { color: WOOD_DARK, finish: 'matte', segments: 5 });
    toy.sphere(0.012 * k, { color: BRASS, finish: 'metal', at: P(fx, 0.03 + h + 0.008, fz), segments: 6 });
    const w = o.double ? 0.17 : 0.13, fh = o.double ? 0.1 : 0.08;
    toy.extrude([[0, 0], [0, -fh * k], [-w * k, -fh * k / 2]], 0.006 * k, { color: BLOCK_YELLOW, finish: 'matte', at: P(fx, 0.03 + h - 0.005, fz) });
    toy.extrude([[0, 0], [0, -fh * k * 0.45], [-w * k * 0.45, -fh * k * 0.225]], 0.008 * k, { color: BLOCK_RED, finish: 'matte', at: P(fx, 0.03 + h - 0.005 - fh * 0.27, fz) });
  }
  toy.body();
  return P(o.double ? 0.048 : 0, by, zFront + 0.055);
}

function popgun1(): ToyModel {
  const toy = new ToyBuilder();
  alphaBlock(toy, { s: 0.38, at: [0, 0, 0], yaw: 0.08, color: BLOCK_RED, ink: BLOCK_YELLOW, letters: 'AKTE', top: true });
  alphaBlock(toy, { s: 0.31, at: [0.01, 0.38, -0.01], yaw: 0.42, color: BLOCK_BLUE, ink: CREAM, letters: 'HLNZ', top: true });
  const muzzle = popGun(toy, [0.01, 0.69, -0.01], 1, { barrel: WOOD });
  return finish(toy, muzzle, 0.36);
}

function popgun2(): ToyModel {
  const toy = new ToyBuilder();
  alphaBlock(toy, { s: 0.38, at: [0, 0, 0], yaw: -0.05, color: BLOCK_YELLOW, ink: BLOCK_RED, letters: 'MAVX', top: true });
  alphaBlock(toy, { s: 0.3, at: [0.035, 0.38, 0.03], yaw: -0.38, color: BLOCK_RED, ink: CREAM, letters: 'EYK1', top: true });
  alphaBlock(toy, { s: 0.25, at: [0.0, 0.68, 0.0], yaw: 0.3, color: BLOCK_BLUE, ink: BLOCK_YELLOW, letters: 'TH47', top: true });
  const muzzle = popGun(toy, [0.0, 0.93, 0.0], 1.15, { barrel: WOOD, brass: true, flag: true });
  return finish(toy, muzzle, 0.38);
}

function popgun3(): ToyModel {
  const toy = new ToyBuilder();
  const matte = (color: string): Look => ({ color, finish: 'matte' });
  // Keep: three stacked blocks.
  const kz = -0.02;
  alphaBlock(toy, { s: 0.32, at: [0, 0, kz], yaw: 0, color: BLOCK_BLUE, ink: BLOCK_YELLOW, letters: 'AHMN', frame: false, round: false });
  alphaBlock(toy, { s: 0.29, at: [0, 0.32, kz], yaw: 0.22, color: BLOCK_RED, ink: CREAM, letters: 'KTEV', frame: false, top: true });
  alphaBlock(toy, { s: 0.26, at: [0, 0.61, kz], yaw: -0.12, color: BLOCK_YELLOW, ink: BLOCK_BLUE, letters: 'XYZL', frame: false, top: true });
  // Corner towers: wooden cylinders with cone roofs.
  const tower = (x: number, z: number, h: number, body: string, roof: string) => {
    toy.cylinder(0.085, 0.085, h, { ...matte(body), at: [x, h / 2, z], segments: 11 });
    toy.cylinder(0.098, 0.098, 0.03, { ...matte(WOOD), at: [x, h + 0.015, z], segments: 11 });
    for (let index = 0; index < 4; index += 1) {
      const a = index * Math.PI / 2 + Math.PI / 4;
      toy.box([0.04, 0.04, 0.04], { ...matte(WOOD), at: [x + Math.cos(a) * 0.07, h + 0.05, z + Math.sin(a) * 0.07], rot: [0, -a, 0], round: 0 });
    }
    toy.cone(0.075, 0.2, { ...matte(roof), at: [x, h + 0.13, z], segments: 12 });
    toy.cone(0.02, 0.05, { ...matte(BLOCK_YELLOW), at: [x, h + 0.245, z], segments: 6 });
  };
  const c = 0.224;
  tower(-c, c, 0.26, BLOCK_YELLOW, BLOCK_RED);
  tower(c, c, 0.26, BLOCK_YELLOW, BLOCK_BLUE);
  tower(-c, -c, 0.36, BLOCK_RED, BLOCK_BLUE);
  tower(c, -c, 0.36, BLOCK_BLUE, BLOCK_RED);
  // Arch block across the front with a roof prism on top.
  const aw = 0.31, ah = 0.2, ar = 0.075;
  const arch: [number, number][] = [[-aw / 2, 0], [-ar, 0]];
  for (let index = 0; index <= 8; index += 1) {
    const a = Math.PI - index * Math.PI / 8;
    arch.push([Math.cos(a) * ar, Math.sin(a) * ar + 0.01]);
  }
  arch.push([ar, 0], [aw / 2, 0], [aw / 2, ah], [-aw / 2, ah]);
  toy.extrude(arch, 0.11, { ...matte(BLOCK_RED), at: [0, 0, 0.235] });
  toy.box([0.05, 0.05, 0.015], { ...matte(BLOCK_YELLOW), at: [0, ar + 0.055, 0.293], round: 0 });
  toy.extrude([[-0.14, 0], [0.14, 0], [0, 0.09]], 0.1, { ...matte(BLOCK_YELLOW), at: [0, ah, 0.235] });
  // Side and back walls with battlements.
  const wall = (at: V3, size: V3, along: 'x' | 'z') => {
    toy.box(size, { ...matte(WOOD), at, round: 0 });
    for (const t of [-1, 0, 1]) {
      const off: V3 = along === 'x' ? [t * 0.1, 0, 0] : [0, 0, t * 0.1];
      toy.box([0.06, 0.055, 0.06], { ...matte(t === 0 ? BLOCK_RED : BLOCK_BLUE), at: [at[0] + off[0], size[1] + 0.0275, at[2] + off[2]], round: 0 });
    }
  };
  wall([-0.235, 0.085, 0], [0.075, 0.17, 0.32], 'z');
  wall([0.235, 0.085, 0], [0.075, 0.17, 0.32], 'z');
  wall([0, 0.085, -0.235], [0.32, 0.17, 0.075], 'x');
  const muzzle = popGun(toy, [0, 0.87, kz], 1.3, { barrel: WOOD, double: true, brass: true, flag: true });
  return finish(toy, muzzle, 0.42);
}

// ================================================================ DART BLASTER
type BlasterOptions = { drum?: boolean; sight?: boolean; neck: number };

/** Foam-dart blaster on a swivel; returns the muzzle (dart tip). */
function blaster(toy: ToyBuilder, pivot: V3, k: number, o: BlasterOptions): V3 {
  const P = (x: number, y: number, z: number): V3 => [pivot[0] + x * k, pivot[1] + y * k, pivot[2] + z * k];
  const orange: Look = { color: ORANGE, finish: 'plastic' };
  const blue: Look = { color: BLUE, finish: 'plastic' };
  toy.turret(pivot);
  // Swivel collar and neck.
  toy.cylinder(0.07 * k, 0.075 * k, 0.035 * k, { ...orange, at: P(0, 0.0175, 0), segments: 14 });
  toy.cylinder(0.035 * k, 0.035 * k, o.neck * k, { ...blue, at: P(0, 0.035 + o.neck / 2, 0), segments: 10 });
  const bodyY = 0.035 + o.neck + 0.06;
  // Body.
  toy.box([0.14 * k, 0.13 * k, 0.29 * k], { ...orange, at: P(0, bodyY, -0.01), round: 0.035 * k });
  toy.box([0.146 * k, 0.03 * k, 0.2 * k], { ...blue, at: P(0, bodyY - 0.01, -0.02), round: 0 });
  // Top rail with ridges.
  toy.box([0.06 * k, 0.022 * k, 0.22 * k], { ...blue, at: P(0, bodyY + 0.075, -0.02), round: 0 });
  for (let index = 0; index < 4; index += 1) toy.box([0.07 * k, 0.012 * k, 0.018 * k], { ...blue, at: P(0, bodyY + 0.09, -0.1 + index * 0.05), round: 0 });
  // Barrel, muzzle ring and the loaded dart.
  const bz0 = 0.13, bz1 = 0.3;
  toy.cylinder(0.044 * k, 0.044 * k, (bz1 - bz0) * k, { ...blue, at: P(0, bodyY + 0.01, (bz0 + bz1) / 2), rot: [Math.PI / 2, 0, 0], segments: 14 });
  toy.cylinder(0.054 * k, 0.054 * k, 0.03 * k, { ...orange, at: P(0, bodyY + 0.01, bz1 - 0.012), rot: [Math.PI / 2, 0, 0], segments: 14 });
  toy.cylinder(0.026 * k, 0.026 * k, 0.07 * k, { color: ORANGE, finish: 'matte', at: P(0, bodyY + 0.01, bz1 + 0.02), rot: [Math.PI / 2, 0, 0], segments: 10 });
  toy.cylinder(0.028 * k, 0.026 * k, 0.025 * k, { color: BLUE, finish: 'matte', at: P(0, bodyY + 0.01, bz1 + 0.067), rot: [Math.PI / 2, 0, 0], segments: 10 });
  // Pump grip under the barrel.
  toy.box([0.075 * k, 0.05 * k, 0.11 * k], { ...blue, at: P(0, bodyY - 0.055, 0.19), round: 0.012 * k });
  // Pistol grip and trigger.
  toy.box([0.055 * k, 0.11 * k, 0.06 * k], { ...blue, at: P(0, bodyY - 0.1, -0.09), rot: [0.3, 0, 0], round: 0.015 * k });
  toy.box([0.016 * k, 0.04 * k, 0.016 * k], { color: YELLOW, finish: 'plastic', at: P(0, bodyY - 0.075, -0.035), round: 0 });
  // Priming handle at the back.
  toy.box([0.1 * k, 0.05 * k, 0.03 * k], { ...blue, at: P(0, bodyY + 0.02, -0.17), round: 0.01 * k });
  // Big screws on both sides.
  for (const side of [-1, 1]) {
    for (const z of [-0.1, 0.02, 0.1]) {
      toy.cylinder(0.013 * k, 0.013 * k, 0.012 * k, { color: STEEL, finish: 'metal', at: P(side * 0.072, bodyY + 0.025, z), rot: [0, 0, Math.PI / 2], segments: 6 });
    }
  }
  if (o.drum) {
    const dy = bodyY - 0.15, dz = 0.06;
    toy.cylinder(0.088 * k, 0.088 * k, 0.07 * k, { color: BLUE_LIGHT, finish: 'plastic', at: P(0, dy, dz), rot: [Math.PI / 2, 0, 0], segments: 14 });
    toy.cylinder(0.03 * k, 0.03 * k, 0.08 * k, { ...orange, at: P(0, dy, dz), rot: [Math.PI / 2, 0, 0], segments: 10 });
    for (let index = 0; index < 7; index += 1) {
      const a = index / 7 * Math.PI * 2;
      toy.cylinder(0.014 * k, 0.014 * k, 0.074 * k, { color: ORANGE, finish: 'matte', at: P(Math.cos(a) * 0.058, dy + Math.sin(a) * 0.058, dz), rot: [Math.PI / 2, 0, 0], segments: 6 });
    }
    toy.box([0.05 * k, 0.05 * k, 0.05 * k], { ...blue, at: P(0, bodyY - 0.07, dz), round: 0 });
  }
  if (o.sight) {
    const sy = bodyY + 0.14;
    for (const z of [-0.06, 0.06]) toy.box([0.025 * k, 0.05 * k, 0.025 * k], { ...orange, at: P(0, sy - 0.035, z), round: 0 });
    toy.cylinder(0.03 * k, 0.03 * k, 0.17 * k, { ...blue, at: P(0, sy, 0), rot: [Math.PI / 2, 0, 0], segments: 12 });
    toy.cylinder(0.034 * k, 0.034 * k, 0.03 * k, { ...orange, at: P(0, sy, 0.085), rot: [Math.PI / 2, 0, 0], segments: 12 });
    toy.cylinder(0.022 * k, 0.022 * k, 0.006 * k, { color: '#ff2a2a', finish: 'glow', at: P(0, sy, -0.087), rot: [Math.PI / 2, 0, 0], segments: 10 });
    toy.sphere(0.012 * k, { color: '#ff3030', finish: 'glow', at: P(0, sy + 0.03, 0.03), segments: 6 });
  }
  toy.body();
  return P(0, bodyY + 0.01, bz1 + 0.08);
}

function tripod(toy: ToyBuilder, hubY: number, legR: number, footR: number, foot: string): void {
  const blue: Look = { color: BLUE, finish: 'plastic', segments: 8 };
  toy.cylinder(0.065, 0.075, 0.08, { color: BLUE, finish: 'plastic', at: [0, hubY - 0.04, 0], segments: 14 });
  for (let index = 0; index < 3; index += 1) {
    const a = Math.PI / 2 + index * Math.PI * 2 / 3 + Math.PI;
    const dir: V3 = [Math.cos(a), 0, Math.sin(a)];
    const top: V3 = [dir[0] * 0.05, hubY - 0.06, dir[2] * 0.05];
    const bottom: V3 = [dir[0] * footR, 0.03, dir[2] * footR];
    rod(toy, top, bottom, legR, blue, legR * 1.1);
    toy.sphere(0.035, { color: foot, finish: 'plastic', at: [bottom[0], 0.035, bottom[2]], segments: 8 });
    // Leg knuckle at the hub.
    toy.sphere(legR * 1.5, { color: ORANGE, finish: 'plastic', at: top, segments: 8 });
  }
}

function dart1(): ToyModel {
  const toy = new ToyBuilder();
  tripod(toy, 0.52, 0.024, 0.3, ORANGE);
  const muzzle = blaster(toy, [0, 0.52, 0], 1.12, { neck: 0.02 });
  return finish(toy, muzzle, 0.36);
}

function dart2(): ToyModel {
  const toy = new ToyBuilder();
  // Yellow base plate with pegs.
  toy.cylinder(0.36, 0.37, 0.035, { color: YELLOW, finish: 'plastic', at: [0, 0.0175, 0], segments: 24 });
  for (let index = 0; index < 6; index += 1) {
    const a = index * Math.PI / 3;
    toy.cylinder(0.022, 0.022, 0.025, { color: YELLOW, finish: 'plastic', at: [Math.cos(a) * 0.2, 0.045, Math.sin(a) * 0.2], segments: 8 });
  }
  const hubY = 0.64;
  const blue: Look = { color: BLUE, finish: 'plastic', segments: 8 };
  toy.cylinder(0.075, 0.085, 0.1, { color: BLUE, finish: 'plastic', at: [0, hubY - 0.05, 0], segments: 14 });
  const feet: V3[] = [];
  for (let index = 0; index < 3; index += 1) {
    const a = Math.PI / 2 + index * Math.PI * 2 / 3 + Math.PI;
    const dir: V3 = [Math.cos(a), 0, Math.sin(a)];
    const top: V3 = [dir[0] * 0.06, hubY - 0.08, dir[2] * 0.06];
    const bottom: V3 = [dir[0] * 0.3, 0.05, dir[2] * 0.3];
    rod(toy, top, bottom, 0.03, blue, 0.032);
    toy.cylinder(0.05, 0.055, 0.03, { color: ORANGE, finish: 'plastic', at: [bottom[0], 0.05, bottom[2]], segments: 10 });
    toy.sphere(0.042, { color: ORANGE, finish: 'plastic', at: top, segments: 8 });
    feet.push(dir);
  }
  // Brace ring between the legs.
  const braceY = 0.3, braceR = 0.06 + (0.3 - 0.06) * ((hubY - 0.08 - braceY) / (hubY - 0.08 - 0.05));
  for (let index = 0; index < 3; index += 1) {
    const a = feet[index], b = feet[(index + 1) % 3];
    rod(toy, [a[0] * braceR, braceY, a[2] * braceR], [b[0] * braceR, braceY, b[2] * braceR], 0.014, { color: ORANGE, finish: 'plastic', segments: 6 });
  }
  const muzzle = blaster(toy, [0, hubY, 0], 1.18, { neck: 0.16, drum: true, sight: true });
  return finish(toy, muzzle, 0.38);
}

function dart3(): ToyModel {
  const toy = new ToyBuilder();
  const orange: Look = { color: ORANGE, finish: 'plastic' };
  const blue: Look = { color: BLUE, finish: 'plastic' };
  const yellow: Look = { color: YELLOW, finish: 'plastic' };
  // --- Dump-truck chassis.
  for (const z of [0.22, -0.2]) {
    rod(toy, [-0.19, 0.1, z], [0.19, 0.1, z], 0.014, { color: STEEL, finish: 'metal', segments: 6 });
    for (const side of [-1, 1]) {
      toy.cylinder(0.088, 0.088, 0.075, { color: TYRE, finish: 'matte', at: [side * 0.19, 0.1, z], rot: [0, 0, Math.PI / 2], segments: 12 });
      for (let index = 0; index < 6; index += 1) {
        const a = index / 6 * Math.PI * 2;
        toy.box([0.08, 0.03, 0.03], { color: TYRE, finish: 'matte', at: [side * 0.19, 0.1 + Math.cos(a) * 0.085, z + Math.sin(a) * 0.085], rot: [-a, 0, 0], round: 0 });
      }
      toy.cylinder(0.048, 0.048, 0.02, { ...yellow, at: [side * 0.232, 0.1, z], rot: [0, 0, Math.PI / 2], segments: 10 });
      toy.cylinder(0.014, 0.014, 0.012, { color: STEEL, finish: 'metal', at: [side * 0.245, 0.1, z], rot: [0, 0, Math.PI / 2], segments: 6 });
    }
  }
  toy.box([0.28, 0.07, 0.7], { ...blue, at: [0, 0.125, 0.0], round: 0 });
  // Cab.
  toy.box([0.34, 0.2, 0.17], { ...orange, at: [0, 0.26, 0.255], round: 0.04 });
  toy.box([0.3, 0.07, 0.012], { color: WINDOW, finish: 'plastic', at: [0, 0.3, 0.342], round: 0 });
  for (const side of [-1, 1]) toy.box([0.012, 0.07, 0.1], { color: WINDOW, finish: 'plastic', at: [side * 0.171, 0.3, 0.255], round: 0 });
  toy.box([0.36, 0.045, 0.04], { ...yellow, at: [0, 0.16, 0.35], round: 0 });
  for (const side of [-1, 1]) toy.cylinder(0.022, 0.022, 0.012, { color: '#fff3a0', finish: 'glow', at: [side * 0.12, 0.21, 0.345], rot: [Math.PI / 2, 0, 0], segments: 8 });
  toy.box([0.08, 0.025, 0.05], { color: '#ffb000', finish: 'glow', at: [0, 0.372, 0.255], round: 0 });
  // Dump bed.
  const bedZ0 = -0.35, bedZ1 = 0.15, bedY = 0.17;
  const bedL = bedZ1 - bedZ0, bedC = (bedZ0 + bedZ1) / 2;
  toy.box([0.34, 0.03, bedL], { ...blue, at: [0, bedY, bedC], round: 0 });
  for (const side of [-1, 1]) {
    toy.box([0.03, 0.13, bedL], { ...blue, at: [side * 0.155, bedY + 0.08, bedC], round: 0 });
    for (const z of [-0.25, -0.1, 0.05]) toy.box([0.012, 0.11, 0.03], { ...orange, at: [side * 0.173, bedY + 0.08, z], round: 0 });
  }
  toy.box([0.34, 0.13, 0.03], { ...blue, at: [0, bedY + 0.08, bedZ0 + 0.015], round: 0 });
  toy.box([0.34, 0.2, 0.035], { ...blue, at: [0, bedY + 0.115, bedZ1 - 0.0175], round: 0 });
  // Swivel mount.
  const pz = -0.1;
  toy.cylinder(0.13, 0.135, 0.04, { ...yellow, at: [0, bedY + 0.035, pz], segments: 20 });
  for (let index = 0; index < 4; index += 1) {
    const a = index * Math.PI / 2 + Math.PI / 4;
    toy.cylinder(0.014, 0.014, 0.012, { color: STEEL, finish: 'metal', at: [Math.cos(a) * 0.1, bedY + 0.06, pz + Math.sin(a) * 0.1], segments: 6 });
  }
  toy.cylinder(0.075, 0.09, 0.22, { ...orange, at: [0, bedY + 0.16, pz], segments: 12 });
  toy.cylinder(0.1, 0.1, 0.035, { ...blue, at: [0, bedY + 0.12, pz], segments: 12 });
  const pivot: V3 = [0, bedY + 0.27, pz];
  // --- Turret: triple-barrel rotary blaster.
  const P = (x: number, y: number, z: number): V3 => [pivot[0] + x, pivot[1] + y, pivot[2] + z];
  toy.turret(pivot);
  toy.cylinder(0.085, 0.085, 0.03, { ...yellow, at: P(0, 0.015, 0), segments: 14 });
  for (const side of [-1, 1]) toy.box([0.025, 0.2, 0.09], { ...blue, at: P(side * 0.105, 0.11, 0), round: 0 });
  const gy = 0.19;
  rod(toy, P(-0.125, gy, 0), P(0.125, gy, 0), 0.02, { color: STEEL, finish: 'metal', segments: 8 });
  // Motor housing.
  toy.cylinder(0.088, 0.088, 0.2, { ...orange, at: P(0, gy, -0.02), rot: [Math.PI / 2, 0, 0], segments: 14 });
  toy.cylinder(0.094, 0.094, 0.025, { ...blue, at: P(0, gy, 0.07), rot: [Math.PI / 2, 0, 0], segments: 14 });
  toy.cylinder(0.07, 0.088, 0.04, { ...blue, at: P(0, gy, -0.14), rot: [Math.PI / 2, 0, 0], segments: 14 });
  for (const a of [0, Math.PI / 2, Math.PI, 1.5 * Math.PI]) {
    toy.cylinder(0.012, 0.012, 0.012, { color: STEEL, finish: 'metal', at: P(Math.cos(a) * 0.06, gy + Math.sin(a) * 0.06, 0.084), rot: [Math.PI / 2, 0, 0], segments: 6 });
  }
  // Barrel cluster with clamps and darts.
  const bz0 = 0.08, bz1 = 0.38;
  rod(toy, P(0, gy, bz0), P(0, gy, bz1 + 0.01), 0.014, { color: STEEL, finish: 'metal', segments: 6 });
  for (const z of [0.2, bz1 - 0.012]) toy.cylinder(0.078, 0.078, 0.022, { ...orange, at: P(0, gy, z), rot: [Math.PI / 2, 0, 0], segments: 14 });
  for (let index = 0; index < 3; index += 1) {
    const a = Math.PI / 2 + index * Math.PI * 2 / 3;
    const x = Math.cos(a) * 0.046, y = gy + Math.sin(a) * 0.046;
    toy.cylinder(0.03, 0.03, bz1 - bz0, { ...blue, at: P(x, y, (bz0 + bz1) / 2), rot: [Math.PI / 2, 0, 0], segments: 10 });
    toy.cylinder(0.018, 0.018, 0.03, { color: ORANGE, finish: 'matte', at: P(x, y, bz1 + 0.012), rot: [Math.PI / 2, 0, 0], segments: 8 });
    toy.cylinder(0.019, 0.018, 0.016, { color: BLUE, finish: 'matte', at: P(x, y, bz1 + 0.034), rot: [Math.PI / 2, 0, 0], segments: 8 });
  }
  // Spade grips at the back.
  for (const side of [-1, 1]) {
    rod(toy, P(side * 0.04, gy - 0.02, -0.15), P(side * 0.05, gy - 0.02, -0.21), 0.012, { color: STEEL, finish: 'metal', segments: 6 });
    toy.capsule(0.02, 0.06, { ...blue, at: P(side * 0.05, gy - 0.02, -0.225), segments: 8 });
  }
  // Carry handle with red-dot sight on top.
  toy.torus(0.07, 0.014, { ...orange, at: P(0, gy + 0.075, -0.02), rot: [0, Math.PI / 2, Math.PI / 2], arc: Math.PI, segments: 8 });
  toy.box([0.05, 0.045, 0.07], { ...blue, at: P(0, gy + 0.165, -0.02), round: 0 });
  toy.cylinder(0.016, 0.016, 0.006, { color: '#ff2a2a', finish: 'glow', at: P(0, gy + 0.17, -0.057), rot: [Math.PI / 2, 0, 0], segments: 8 });
  // Ammo box on the left with a belt of darts feeding the housing.
  toy.box([0.085, 0.11, 0.13], { ...yellow, at: P(-0.17, gy - 0.04, -0.03), round: 0 });
  toy.box([0.09, 0.02, 0.135], { ...blue, at: P(-0.17, gy + 0.02, -0.03), round: 0 });
  const belt: V3[] = [];
  for (let index = 0; index < 6; index += 1) {
    const t = index / 5;
    const a = Math.PI * (0.95 - 0.75 * t);
    belt.push(P(-0.11 + Math.cos(a) * 0.065, gy + 0.03 + Math.sin(a) * 0.05, -0.03));
  }
  for (const point of belt) {
    toy.cylinder(0.014, 0.014, 0.075, { color: ORANGE, finish: 'matte', at: point, rot: [Math.PI / 2, 0, 0], segments: 6 });
    toy.cylinder(0.015, 0.015, 0.014, { color: BLUE, finish: 'matte', at: [point[0], point[1], point[2] + 0.044], rot: [Math.PI / 2, 0, 0], segments: 6 });
  }
  polyline(toy, belt.map(p => [p[0], p[1], p[2] - 0.02] as V3), 0.006, { color: '#2b2b33', finish: 'matte', segments: 4 });
  // Pennant antenna.
  rod(toy, P(0.06, gy + 0.05, -0.13), P(0.06, gy + 0.62, -0.13), 0.006, { color: STEEL, finish: 'metal', segments: 5 });
  toy.extrude([[0, 0], [0, -0.09], [0.15, -0.045]], 0.006, { color: ORANGE, finish: 'plastic', at: P(0.06, gy + 0.61, -0.13) });
  toy.sphere(0.016, { color: '#ff3a1a', finish: 'glow', at: P(0.06, gy + 0.63, -0.13), segments: 6 });
  toy.body();
  return finish(toy, P(0, gy, bz1 + 0.045), 0.42);
}

// ================================================================ MARBLE MORTAR
const TILT = 55 * DEG;
const AXIS = new THREE.Vector3(0, Math.sin(TILT), Math.cos(TILT));
const AXIS_ROT: V3 = [Math.PI / 2 - TILT, 0, 0];

function marble(toy: ToyBuilder, at: V3, r: number, color = MARBLE, swirl = true, segments = 10): void {
  toy.sphere(r, { color, finish: 'plastic', at, segments });
  if (swirl) toy.torus(r * 0.97, r * 0.15, { color: MARBLE_SWIRL, finish: 'plastic', at, rot: [0.5, 0, 0.7], segments: 8 });
}

/** Coil spring around `axis` (unit vector perpendicular to x) starting at `base`. */
function coil(toy: ToyBuilder, base: V3, axis: THREE.Vector3, radius: number, length: number, turns: number, wire: number): void {
  const u = new THREE.Vector3(1, 0, 0);
  const v = new THREE.Vector3().crossVectors(axis, u);
  const steps = Math.round(turns * 5);
  const points: V3[] = [];
  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps, a = t * turns * Math.PI * 2;
    const p = new THREE.Vector3(...base).addScaledVector(axis, t * length).addScaledVector(u, Math.cos(a) * radius).addScaledVector(v, Math.sin(a) * radius);
    points.push(p.toArray() as V3);
  }
  polyline(toy, points, wire, { color: STEEL, finish: 'metal', segments: 3 });
}

/** Spring-loaded launching cup from `base` along the 55-degree axis. Returns the marble centre. */
function launcher(toy: ToyBuilder, base: V3, k: number, cupColor: string, swirl = true): V3 {
  const along = (d: number): V3 => add(base, scaleV(AXIS.toArray() as V3, d * k));
  // Hinge block and pin.
  toy.box([0.06 * k, 0.05 * k, 0.06 * k], { color: GREEN, finish: 'plastic', at: add(base, [0, -0.02 * k, -0.01 * k]), rot: AXIS_ROT, round: 0 });
  toy.cylinder(0.01 * k, 0.01 * k, 0.085 * k, { color: STEEL, finish: 'metal', at: add(base, [0, -0.02 * k, -0.01 * k]), rot: [0, 0, Math.PI / 2], segments: 6 });
  // Spring seat, guide rod and coil.
  toy.cylinder(0.042 * k, 0.042 * k, 0.012 * k, { color: PURPLE, finish: 'plastic', at: along(0.01), rot: AXIS_ROT, segments: 10 });
  toy.cylinder(0.008 * k, 0.008 * k, 0.14 * k, { color: STEEL, finish: 'metal', at: along(0.08), rot: AXIS_ROT, segments: 5 });
  coil(toy, along(0.016), AXIS, 0.03 * k, 0.12 * k, 3.6, 0.006 * k);
  // Cup.
  const cupAt = along(0.15);
  toy.lathe([[0, 0], [0.028, 0], [0.052, 0.018], [0.064, 0.048], [0.056, 0.05], [0.044, 0.028], [0, 0.02]].map(([r, y]) => [r * k, y * k] as const),
    { color: cupColor, finish: 'plastic', at: cupAt, rot: AXIS_ROT, segments: 12 });
  const m = along(0.15 + 0.02 + 0.03);
  marble(toy, m, 0.042 * k, MARBLE, swirl);
  return m;
}

/** Helical chute (floor + outer rail) around the y axis, descending. */
function chute(toy: ToyBuilder, r: number, yTop: number, yBottom: number, a0: number, turns: number, color: string, rail: string, width = 0.06): void {
  const steps = Math.max(6, Math.round(turns * 10));
  const point = (t: number): THREE.Vector3 => {
    const a = a0 + t * turns * Math.PI * 2;
    return new THREE.Vector3(Math.cos(a) * r, yTop + (yBottom - yTop) * t, Math.sin(a) * r);
  };
  for (let index = 0; index < steps; index += 1) {
    const p0 = point(index / steps), p1 = point((index + 1) / steps);
    const tangent = p1.clone().sub(p0);
    const length = tangent.length() * 1.15;
    tangent.normalize();
    const mid = p0.clone().add(p1).multiplyScalar(0.5);
    const radial = new THREE.Vector3(mid.x, 0, mid.z).normalize();
    const normal = new THREE.Vector3().crossVectors(tangent, radial);
    if (normal.y < 0) normal.negate();
    const rot = rotFromBasis(tangent, normal);
    toy.box([length, 0.012, width], { color, finish: 'plastic', at: mid.toArray() as V3, rot, round: 0 });
    const railAt = mid.clone().addScaledVector(radial, width / 2).addScaledVector(normal, 0.018);
    toy.box([length, 0.036, 0.01], { color: rail, finish: 'plastic', at: railAt.toArray() as V3, rot, round: 0 });
  }
}

/** Square marble-run base plate with pegs round the edge. */
function basePlate(toy: ToyBuilder, half: number, pegs: number): void {
  toy.box([half * 2, 0.03, half * 2], { color: PURPLE, finish: 'plastic', at: [0, 0.03, 0], round: 0 });
  toy.box([half * 2 - 0.03, 0.015, half * 2 - 0.03], { color: '#7a36c4', finish: 'plastic', at: [0, 0.0075, 0], round: 0 });
  const step = (half * 2 - 0.08) / (pegs - 1);
  for (let ix = 0; ix < pegs; ix += 1) {
    for (let iz = 0; iz < pegs; iz += 1) {
      if (ix > 0 && ix < pegs - 1 && iz > 0 && iz < pegs - 1) continue;
      toy.cylinder(0.02, 0.02, 0.022, { color: PURPLE_LIGHT, finish: 'plastic', at: [-half + 0.04 + ix * step, 0.056, -half + 0.04 + iz * step], segments: 6 });
    }
  }
}

/** Stack of tube sections with connector rings; returns the top height. */
function tubeTower(toy: ToyBuilder, y0: number, sections: number[], r: number, stripes = true): number {
  let y = y0;
  sections.forEach((h, index) => {
    const color = index % 2 ? GREEN_LIGHT : GREEN;
    toy.cylinder(r, r, h, { color, finish: 'plastic', at: [0, y + h / 2, 0], segments: 12 });
    // Lighter band so the tube reads as see-through plastic.
    if (stripes) toy.cylinder(r * 1.01, r * 1.01, h * 0.35, { color: index % 2 ? GREEN : GREEN_LIGHT, finish: 'plastic', at: [0, y + h / 2, 0], segments: 12 });
    y += h;
    toy.cylinder(r * 1.22, r * 1.22, 0.04, { color: PURPLE, finish: 'plastic', at: [0, y + 0.02, 0], segments: 12 });
    y += 0.04;
  });
  return y;
}

function catchTray(toy: ToyBuilder, at: V3): void {
  toy.lathe([[0, 0], [0.045, 0], [0.055, 0.03], [0.047, 0.03], [0.038, 0.012], [0, 0.012]], { color: PURPLE_LIGHT, finish: 'plastic', at, segments: 8 });
  marble(toy, [at[0], at[1] + 0.04, at[2]], 0.03, MARBLE_DEEP, false, 7);
}

function mortarTurretDisk(toy: ToyBuilder, pivot: V3, r: number): void {
  toy.cylinder(r, r * 1.04, 0.04, { color: PURPLE, finish: 'plastic', at: [pivot[0], pivot[1] + 0.02, pivot[2]], segments: 14 });
  for (let index = 0; index < 4; index += 1) {
    const a = index * Math.PI / 2 + Math.PI / 4;
    toy.cylinder(0.013, 0.013, 0.012, { color: STEEL, finish: 'metal', at: [pivot[0] + Math.cos(a) * r * 0.8, pivot[1] + 0.045, pivot[2] + Math.sin(a) * r * 0.8], segments: 6 });
  }
}

function funnel(toy: ToyBuilder, at: V3, r: number, h: number, color: string, marbles: number): void {
  toy.lathe([[r * 0.22, 0], [r * 0.3, 0], [r * 0.3, h * 0.35], [r, h * 0.92], [r * 1.05, h], [r * 0.9, h], [r * 0.22, h * 0.4]],
    { color, finish: 'plastic', at, segments: 12 });
  const colors = [MARBLE, MARBLE_DEEP, '#ff4fa3', '#ffd21f', MARBLE, MARBLE_DEEP];
  for (let index = 0; index < marbles; index += 1) {
    const ring = index === 0 ? 0 : r * 0.52;
    const a = index * Math.PI * 2 / Math.max(1, marbles - 1);
    marble(toy, [at[0] + Math.cos(a) * ring, at[1] + h * (index === 0 ? 0.98 : 0.86), at[2] + Math.sin(a) * ring], r * 0.3, colors[index % colors.length], false, 6);
  }
}

function mortar1(): ToyModel {
  const toy = new ToyBuilder();
  basePlate(toy, 0.25, 3);
  const top = tubeTower(toy, 0.045, [0.2, 0.2], 0.1);
  chute(toy, 0.155, top - 0.07, 0.11, -Math.PI / 2, 0.85, PURPLE_LIGHT, PURPLE);
  catchTray(toy, [0.17, 0.045, 0.17]);
  const pivot: V3 = [0, top, 0];
  toy.turret(pivot);
  mortarTurretDisk(toy, pivot, 0.12);
  const m = launcher(toy, [0, top + 0.08, -0.03], 1, PURPLE);
  toy.body();
  return finish(toy, m, 0.36);
}

function mortar2(): ToyModel {
  const toy = new ToyBuilder();
  basePlate(toy, 0.27, 4);
  const top = tubeTower(toy, 0.045, [0.22, 0.2, 0.18], 0.105);
  chute(toy, 0.165, top - 0.08, 0.11, -Math.PI / 2, 1.5, PURPLE_LIGHT, PURPLE);
  catchTray(toy, [0.19, 0.045, 0.19]);
  const pivot: V3 = [0, top, 0];
  toy.turret(pivot);
  mortarTurretDisk(toy, pivot, 0.13);
  const m = launcher(toy, [0.03, top + 0.085, -0.02], 1.12, PURPLE);
  // Funnel hopper beside the cup, feeding it through a short tube.
  toy.cylinder(0.025, 0.025, 0.1, { color: GREEN, finish: 'plastic', at: [-0.085, top + 0.09, -0.04], segments: 8 });
  funnel(toy, [-0.085, top + 0.13, -0.04], 0.085, 0.13, GREEN_LIGHT, 4);
  rod(toy, [-0.085, top + 0.1, -0.04], [-0.01, top + 0.15, 0.03], 0.016, { color: PURPLE_LIGHT, finish: 'plastic', segments: 6 });
  toy.body();
  return finish(toy, m, 0.38);
}

function mortar3(): ToyModel {
  const toy = new ToyBuilder();
  basePlate(toy, 0.29, 3);
  const top = tubeTower(toy, 0.045, [0.24, 0.22, 0.2, 0.14], 0.11, false);
  // Four corner posts make a marble-run frame around the tower.
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    toy.cylinder(0.02, 0.02, top - 0.05, { color: PURPLE_LIGHT, finish: 'plastic', at: [x * 0.24, 0.045 + (top - 0.05) / 2, z * 0.24], segments: 5 });
    toy.cone(0.035, 0.06, { color: GREEN, finish: 'plastic', at: [x * 0.24, top + 0.02, z * 0.24], segments: 6 });
  }
  // Square top rail joining the posts.
  for (const [ax, az, bx, bz] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]]) {
    rod(toy, [ax * 0.24, top - 0.03, az * 0.24], [bx * 0.24, top - 0.03, bz * 0.24], 0.014, { color: PURPLE, finish: 'plastic', segments: 3 });
  }
  chute(toy, 0.17, top - 0.1, 0.12, -Math.PI / 2, 1.25, PURPLE_LIGHT, PURPLE, 0.055);
  chute(toy, 0.17, top - 0.1, 0.12, Math.PI / 2, 1.25, '#ff7ccf', '#e0409f', 0.055);
  catchTray(toy, [0.0, 0.045, 0.235]);
  const pivot: V3 = [0, top, 0];
  toy.turret(pivot);
  mortarTurretDisk(toy, pivot, 0.15);
  const k = 1.12;
  const m1 = launcher(toy, [0.08, top + 0.09, 0.0], k, PURPLE);
  launcher(toy, [-0.08, top + 0.09, 0.0], k, '#ff7ccf', false);
  toy.box([0.24, 0.03, 0.05], { color: GREEN, finish: 'plastic', at: [0, top + 0.06, -0.01], round: 0 });
  // Big funnel hopper behind the cups.
  toy.cylinder(0.03, 0.03, 0.17, { color: GREEN, finish: 'plastic', at: [0, top + 0.125, -0.11], segments: 8 });
  funnel(toy, [0, top + 0.19, -0.11], 0.13, 0.17, GREEN_LIGHT, 5);
  for (const side of [-1, 1]) rod(toy, [0, top + 0.21, -0.11], [side * 0.07, top + 0.2, -0.03], 0.016, { color: PURPLE_LIGHT, finish: 'plastic', segments: 6 });
  toy.body();
  return finish(toy, m1, 0.42);
}

export const TOWER_TOYS_A = {
  'popgun-1': popgun1,
  'popgun-2': popgun2,
  'popgun-3': popgun3,
  'dart-1': dart1,
  'dart-2': dart2,
  'dart-3': dart3,
  'mortar-1': mortar1,
  'mortar-2': mortar2,
  'mortar-3': mortar3,
};
