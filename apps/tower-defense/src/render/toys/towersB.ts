import * as THREE from 'three';
import { ToyBuilder, type Finish, type ToyModel } from './kit';

// Towers B: glue bottle, rubber-band ballista, tin robot (three levels each).
// Model space: origin at the footprint centre on the floor, +y up, facing +z.

type V3 = [number, number, number];

// ---------------------------------------------------------------- palette
const GLUE = '#fbfaf4';
const GLUE_BOTTLE = '#f4f2ea';
const ORANGE = '#ff8a1c';
const ORANGE_DARK = '#e2660c';
const LABEL_BLUE = '#2f6fe0';
const STAND_BLUE = '#2a64d8';
const WOOD = '#d6a061';
const WOOD_LIGHT = '#ecc58e';
const WOOD_DARK = '#9a6a3a';
const PENCIL = '#ffc61e';
const ERASER = '#f78fb3';
const FERRULE = '#c9ced6';
const GRAPHITE = '#3b3b40';
const BAND = '#e2302b';
const GUN_YELLOW = '#ffd21a';
const BLACK = '#26262b';
const TIN = '#9fc1df';
const TIN_DARK = '#6d8db0';
const PANEL_RED = '#e43a2c';
const PANEL_YELLOW = '#ffc52a';
const KEY_GOLD = '#e8b437';
const EYE_CYAN = '#62f3ff';

// ---------------------------------------------------------------- geometry helpers
const UP = new THREE.Vector3(0, 1, 0);

function add3(a: V3, b: V3, s = 1): V3 {
  return [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
}

/** Rotation that turns +y into the direction a -> b, plus length and midpoint. */
function along(a: V3, b: V3) {
  const dir = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = dir.length();
  dir.normalize();
  const euler = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir), 'XYZ');
  return {
    len,
    dir: [dir.x, dir.y, dir.z] as V3,
    rot: [euler.x, euler.y, euler.z] as V3,
    mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2] as V3,
  };
}

/** Cylinder (or frustum) from a (radius ra) to b (radius rb). */
function rod(toy: ToyBuilder, a: V3, b: V3, ra: number, rb: number, color: string, finish: Finish = 'plastic', segments = 8) {
  const { len, rot, mid } = along(a, b);
  toy.cylinder(rb, ra, len, { at: mid, rot, color, finish, segments });
}

/** Unit direction from yaw (around y, 0 = +z) and tilt from vertical. */
function aim(yaw: number, tilt: number): V3 {
  return [Math.sin(yaw) * Math.sin(tilt), Math.cos(tilt), Math.cos(yaw) * Math.sin(tilt)];
}

/** Local frame for placing sub-assemblies (pegs, spools) at any orientation. */
function frame(at: V3, rot: V3, local: V3 = [0, 0, 0]): THREE.Matrix4 {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...at), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(1, 1, 1));
  return m.multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...local)));
}

function xf(m: THREE.Matrix4, at: V3, rot: V3 = [0, 0, 0]): { at: V3; rot: V3 } {
  const local = new THREE.Matrix4().compose(new THREE.Vector3(...at), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(1, 1, 1));
  const out = m.clone().multiply(local);
  const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  out.decompose(p, q, s);
  const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
  return { at: [p.x, p.y, p.z], rot: [e.x, e.y, e.z] };
}

/** Rubber band / ring wrapped around an axis direction. */
function wrap(toy: ToyBuilder, at: V3, axis: V3, radius: number, tube: number, color = BAND, segments = 6) {
  const { rot } = along([0, 0, 0], axis);
  toy.cylinder(radius, radius, tube * 2, { at, rot, color, finish: 'matte', segments });
}

/** Finish a toy: height is measured from the real geometry. */
function done(toy: ToyBuilder, muzzle: V3, radius = 0.4): ToyModel {
  const model = toy.build({ height: 1, radius, muzzle });
  let top = 0;
  const box = new THREE.Box3();
  for (const piece of model.pieces) {
    for (const geometry of Object.values(piece.geometry)) {
      geometry.computeBoundingBox();
      box.copy(geometry.boundingBox!).translate(new THREE.Vector3(...piece.pivot));
      top = Math.max(top, box.max.y);
    }
  }
  model.height = +top.toFixed(3);
  return model;
}

// ---------------------------------------------------------------- school things

type PencilOptions = { sharpen?: boolean; eraser?: boolean; color?: string; plain?: boolean };

/** Hexagonal pencil from a (eraser end) to b (point). */
function pencil(toy: ToyBuilder, a: V3, b: V3, r: number, options: PencilOptions = {}) {
  if (options.plain) {
    rod(toy, a, b, r, r, options.color ?? PENCIL, 'plastic', 6);
    return;
  }
  const { len, dir } = along(a, b);
  const at = (t: number) => add3(a, dir, t);
  let s = 0;
  if (options.eraser !== false) {
    const e = r * 1.7, f = r * 1.4;
    rod(toy, at(0), at(e), r * 0.92, r * 0.92, ERASER, 'matte', 6);
    rod(toy, at(e), at(e + f), r * 1.07, r * 1.07, FERRULE, 'metal', 6);
    s = e + f;
  } else {
    rod(toy, at(-0.003), at(0.004), r * 0.8, r * 0.8, WOOD_LIGHT, 'matte', 6);
  }
  const tip = options.sharpen === false ? 0 : r * 3.4;
  rod(toy, at(s), at(len - tip), r, r, options.color ?? PENCIL, 'plastic', 6);
  if (tip) {
    rod(toy, at(len - tip), at(len - tip * 0.32), r * 0.97, r * 0.34, WOOD_LIGHT, 'matte', 6);
    rod(toy, at(len - tip * 0.32), at(len), r * 0.34, 0.003, GRAPHITE, 'matte', 6);
  } else {
    rod(toy, at(len - 0.004), at(len + 0.003), r * 0.8, r * 0.8, WOOD_LIGHT, 'matte', 6);
  }
}

/** Wooden clothes peg, local +y from `base` along its length. */
function peg(toy: ToyBuilder, base: V3, rot: V3, len: number, turnGap = false) {
  const m = frame(base, rot, turnGap ? [0, Math.PI / 2, 0] : [0, 0, 0]);
  for (const side of [-1, 1]) {
    toy.box([0.066, len, 0.028], { ...xf(m, [0, len / 2, side * 0.016]), color: WOOD, finish: 'matte', round: 0 });
    // the grip notch: a slightly wider pad near the bottom end
    toy.box([0.07, len * 0.22, 0.01], { ...xf(m, [0, len * 0.18, side * 0.034]), color: WOOD_DARK, finish: 'matte', round: 0 });
  }
  toy.cylinder(0.017, 0.017, 0.088, { ...xf(m, [0, len * 0.5, 0], [0, 0, Math.PI / 2]), color: FERRULE, finish: 'metal', segments: 8 });
  for (const x of [-0.022, 0.022]) {
    toy.cylinder(0.023, 0.023, 0.01, { ...xf(m, [x, len * 0.5, 0], [0, 0, Math.PI / 2]), color: FERRULE, finish: 'metal', segments: 8 });
  }
}

/** Thread spool centred at `at`, axis along local +y rotated by `rot`. */
function spool(toy: ToyBuilder, at: V3, rot: V3, r: number, len: number, thread: string, segments = 12) {
  const m = frame(at, rot);
  const flange = len * 0.16;
  for (const side of [-1, 1]) {
    toy.cylinder(r, r, flange, { ...xf(m, [0, side * (len / 2 - flange / 2), 0]), color: WOOD_LIGHT, finish: 'matte', segments });
  }
  toy.cylinder(r * 0.8, r * 0.8, len - flange * 2, { ...xf(m, [0, 0, 0]), color: thread, finish: 'matte', segments });
  toy.cylinder(r * 0.24, r * 0.24, len + 0.004, { ...xf(m, [0, 0, 0]), color: '#4a3220', finish: 'matte', segments: 8 });
}

/** Flat glossy glue puddle made of overlapping blobs [x, z, r]. */
function puddle(toy: ToyBuilder, blobs: readonly (readonly [number, number, number])[], thickness = 0.07) {
  for (const [x, z, r] of blobs) {
    const t = r * thickness;
    toy.lathe([[r, 0], [r * 0.82, t * 0.75], [r * 0.45, t], [0, t]], { at: [x, 0.001, z], color: GLUE, finish: 'plastic', segments: 12 });
  }
}

/** A drop of glue hanging from `at`. */
function drip(toy: ToyBuilder, at: V3, size: number) {
  toy.sphere(size, { at, scale: [1, 1.15, 1], color: GLUE, finish: 'plastic', segments: 8 });
  toy.sphere(size * 0.7, { at: add3(at, [0, -size * 1.3, 0]), scale: [1, 1.4, 1], color: GLUE, finish: 'plastic', segments: 8 });
}

/** School-glue bottle body (no cap) standing at `base`, scaled by s. Returns the neck top. */
function glueBottle(toy: ToyBuilder, base: V3, s: number, tall = 1): V3 {
  const h = (y: number) => y * tall;
  const profile: [number, number][] = [
    [0, 0], [0.13, 0], [0.15, 0.012], [0.155, 0.045], [0.155, h(0.3)], [0.148, h(0.34)],
    [0.12, h(0.38)], [0.08, h(0.41)], [0.06, h(0.425)], [0.06, h(0.45)], [0, h(0.45)],
  ];
  toy.lathe(profile.map(([r, y]) => [r * s, y * s] as const), { at: base, color: GLUE_BOTTLE, finish: 'plastic', segments: 16 });
  // blue paper label with an orange band and a white glue-drop emblem
  toy.cylinder(0.158 * s, 0.158 * s, h(0.16) * s, { at: add3(base, [0, h(0.17) * s, 0]), color: LABEL_BLUE, finish: 'matte', segments: 16 });
  toy.cylinder(0.16 * s, 0.16 * s, 0.022 * s, { at: add3(base, [0, h(0.23) * s, 0]), color: ORANGE, finish: 'matte', segments: 16 });
  toy.sphere(0.042 * s, { at: add3(base, [0, h(0.15) * s, 0.155 * s]), scale: [1, 1.3, 0.35], color: '#ffffff', finish: 'matte', segments: 8 });
  // orange collar on the neck
  toy.cylinder(0.072 * s, 0.075 * s, 0.03 * s, { at: add3(base, [0, h(0.45) * s, 0]), color: ORANGE_DARK, finish: 'plastic', segments: 12 });
  return add3(base, [0, h(0.45) * s + 0.015 * s, 0]);
}

/** Orange twist cap with nozzles, all on the current piece. Returns nozzle tips. */
function twistCap(toy: ToyBuilder, base: V3, r: number, nozzles: { yaw: number; tilt: number; off: number }[], len: number): V3[] {
  const capH = r * 1.05;
  toy.cylinder(r * 0.94, r, capH, { at: add3(base, [0, capH / 2, 0]), color: ORANGE, finish: 'plastic', segments: 14 });
  for (const y of [0.25, 0.6]) {
    toy.cylinder(r * 1.03, r * 1.03, r * 0.18, { at: add3(base, [0, capH * y, 0]), color: ORANGE_DARK, finish: 'plastic', segments: 14 });
  }
  const top = add3(base, [0, capH, 0]);
  toy.dome(r * 0.75, { at: top, scale: [1, 0.5, 1], color: ORANGE, finish: 'plastic', segments: 12 });
  const tips: V3[] = [];
  for (const nozzle of nozzles) {
    const start = add3(top, [Math.sin(nozzle.yaw) * nozzle.off, 0, Math.cos(nozzle.yaw) * nozzle.off * 0.4]);
    const dir = aim(nozzle.yaw, nozzle.tilt);
    const tip = add3(start, dir, len);
    rod(toy, start, tip, r * 0.62, r * 0.2, ORANGE, 'plastic', 10);
    toy.sphere(r * 0.2, { at: tip, color: ORANGE_DARK, finish: 'plastic', segments: 8 });
    drip(toy, add3(tip, [0, -r * 0.12, r * 0.08]), r * 0.24);
    tips.push(tip);
  }
  return tips;
}

// ---------------------------------------------------------------- glue

function glue1(): ToyModel {
  const toy = new ToyBuilder();
  // wooden alphabet block with painted side panels
  toy.box([0.46, 0.15, 0.46], { at: [0, 0.075, 0], color: WOOD, finish: 'matte', round: 0.025 });
  toy.box([0.3, 0.095, 0.012], { at: [0, 0.075, 0.232], color: '#e8463c', finish: 'matte', round: 0 });
  toy.box([0.3, 0.095, 0.012], { at: [0, 0.075, -0.232], color: '#3f9b4b', finish: 'matte', round: 0 });
  toy.box([0.012, 0.095, 0.3], { at: [0.232, 0.075, 0], color: '#f2b632', finish: 'matte', round: 0 });
  toy.box([0.012, 0.095, 0.3], { at: [-0.232, 0.075, 0], color: LABEL_BLUE, finish: 'matte', round: 0 });
  const neck = glueBottle(toy, [0, 0.15, 0], 1.0);
  // a little glue run down the bottle and a drop on the block
  toy.capsule(0.016, 0.07, { at: [0.095, 0.42, 0.125], color: GLUE, finish: 'plastic', segments: 6 });
  toy.sphere(0.02, { at: [0.095, 0.37, 0.125], color: GLUE, finish: 'plastic', segments: 6 });
  toy.lathe([[0.06, 0], [0.045, 0.008], [0, 0.011]], { at: [0.12, 0.15, 0.17], color: GLUE, finish: 'plastic', segments: 10 });

  toy.turret(neck);
  const [tip] = twistCap(toy, neck, 0.072, [{ yaw: 0, tilt: 0.7, off: 0 }], 0.15);
  return done(toy, tip);
}

function glue2(): ToyModel {
  const toy = new ToyBuilder();
  puddle(toy, [[0, 0.02, 0.33], [0.19, 0.19, 0.14], [-0.23, 0.13, 0.13], [0.04, 0.29, 0.11], [-0.14, -0.25, 0.12], [0.25, -0.14, 0.12], [-0.27, -0.06, 0.1]]);
  // blue plastic stand: a cup on a wide foot
  toy.lathe([[0, 0], [0.27, 0], [0.285, 0.02], [0.27, 0.045], [0.235, 0.06], [0.24, 0.17], [0.215, 0.17], [0.215, 0.08], [0, 0.08]],
    { color: STAND_BLUE, finish: 'plastic', segments: 18 });
  toy.torus(0.235, 0.014, { at: [0, 0.17, 0], color: '#5b8ff0', finish: 'plastic', segments: 18 });
  const neck = glueBottle(toy, [0, 0.08, 0], 1.32, 1.12);
  // glue runs down the bottle shoulder
  for (const [angle, y, len] of [[0.5, 0.45, 0.1], [2.6, 0.47, 0.06], [-1.1, 0.48, 0.05]] as const) {
    const r = 0.21;
    const at: V3 = [Math.sin(angle) * r, y, Math.cos(angle) * r];
    toy.capsule(0.017, len, { at, color: GLUE, finish: 'plastic', segments: 6 });
    toy.sphere(0.022, { at: add3(at, [0, -len / 2 - 0.01, 0]), color: GLUE, finish: 'plastic', segments: 6 });
  }

  toy.turret(neck);
  const tips = twistCap(toy, neck, 0.095, [{ yaw: -0.55, tilt: 0.75, off: 0.045 }, { yaw: 0.55, tilt: 0.75, off: 0.045 }], 0.17);
  return done(toy, [(tips[0][0] + tips[1][0]) / 2, (tips[0][1] + tips[1][1]) / 2, (tips[0][2] + tips[1][2]) / 2]);
}

function glue3(): ToyModel {
  const toy = new ToyBuilder();
  puddle(toy, [[0, 0, 0.36], [0.19, 0.19, 0.15], [-0.18, 0.2, 0.14], [0.2, -0.17, 0.14], [-0.2, -0.17, 0.14], [0, 0.3, 0.11], [0.31, 0.02, 0.1]]);
  // swivel stand: blue foot, chrome post, black swivel cup
  toy.lathe([[0, 0], [0.22, 0], [0.235, 0.025], [0.2, 0.065], [0.07, 0.085], [0, 0.085]], { color: STAND_BLUE, finish: 'plastic', segments: 18 });
  toy.cylinder(0.042, 0.042, 0.68, { at: [0, 0.42, 0], color: FERRULE, finish: 'metal', segments: 10 });
  toy.cylinder(0.052, 0.052, 0.04, { at: [0, 0.45, 0], color: BLACK, finish: 'plastic', segments: 10 });
  toy.cylinder(0.055, 0.06, 0.04, { at: [0, 0.1, 0], color: BLACK, finish: 'plastic', segments: 10 });
  toy.cylinder(0.082, 0.064, 0.07, { at: [0, 0.76, 0], color: BLACK, finish: 'plastic', segments: 14 });
  // rack of spare glue sticks
  toy.box([0.2, 0.07, 0.11], { at: [-0.2, 0.035, -0.19], rot: [0, 0.6, 0], color: WOOD, finish: 'matte', round: 0 });
  for (const t of [-1, 0, 1]) {
    const x = -0.2 + Math.cos(0.6) * t * 0.06, z = -0.19 - Math.sin(0.6) * t * 0.06;
    const h = 0.3 - Math.abs(t) * 0.04;
    toy.cylinder(0.026, 0.026, h, { at: [x, 0.06 + h / 2, z], color: '#f3efe2', finish: 'plastic', segments: 8 });
    toy.sphere(0.026, { at: [x, 0.06 + h, z], scale: [1, 0.5, 1], color: '#f3efe2', finish: 'plastic', segments: 8 });
  }
  // a little school-glue bottle keeps the family colours
  const miniNeck = glueBottle(toy, [0.23, 0, -0.17], 0.55);
  toy.cylinder(0.035, 0.04, 0.05, { at: add3(miniNeck, [0, 0.025, 0]), color: ORANGE, finish: 'plastic', segments: 10 });
  toy.cone(0.02, 0.05, { at: add3(miniNeck, [0, 0.075, 0]), color: ORANGE, finish: 'plastic', segments: 8 });

  // hot-glue gun standing on its handle in the swivel cup
  const pivot: V3 = [0, 0.795, 0];
  toy.turret(pivot);
  const tiltHandle = 0.16;
  toy.box([0.1, 0.3, 0.14], { at: [0, 0.93, -0.035], rot: [tiltHandle, 0, 0], color: GUN_YELLOW, finish: 'plastic', round: 0.04 });
  toy.box([0.105, 0.12, 0.1], { at: [0, 0.85, -0.045], rot: [tiltHandle, 0, 0], color: BLACK, finish: 'plastic', round: 0 });
  // housing
  const bodyY = 1.17;
  toy.box([0.17, 0.25, 0.4], { at: [0, bodyY, -0.01], color: GUN_YELLOW, finish: 'plastic', round: 0.075 });
  toy.box([0.06, 0.035, 0.3], { at: [0, bodyY + 0.125, -0.02], color: BLACK, finish: 'plastic', round: 0 });
  for (const side of [-1, 1]) {
    for (const z of [-0.1, -0.04, 0.02]) toy.box([0.01, 0.1, 0.025], { at: [side * 0.086, bodyY + 0.02, z], color: BLACK, finish: 'plastic', round: 0 });
  }
  // trigger and guard
  toy.box([0.045, 0.1, 0.045], { at: [0, 1.0, 0.075], rot: [0.25, 0, 0], color: BLACK, finish: 'plastic', round: 0 });
  toy.torus(0.065, 0.013, { at: [0, 1.0, 0.04], rot: [0, 0, Math.PI / 2], color: BLACK, finish: 'plastic', segments: 10, arc: Math.PI });
  // rear cap and glue stick
  toy.cylinder(0.08, 0.085, 0.05, { at: [0, bodyY + 0.02, -0.22], rot: [Math.PI / 2, 0, 0], color: BLACK, finish: 'plastic', segments: 14 });
  toy.cylinder(0.034, 0.034, 0.12, { at: [0, bodyY + 0.02, -0.3], rot: [Math.PI / 2, 0, 0], color: '#f3efe2', finish: 'plastic', segments: 10 });
  // front: black nose, brass nozzle, hot glue drip
  rod(toy, [0, bodyY - 0.01, 0.17], [0, bodyY - 0.02, 0.25], 0.075, 0.05, BLACK, 'plastic', 12);
  rod(toy, [0, bodyY - 0.02, 0.25], [0, bodyY - 0.04, 0.35], 0.032, 0.01, '#d9a63a', 'metal', 10);
  const tip: V3 = [0, bodyY - 0.04, 0.35];
  drip(toy, add3(tip, [0, -0.012, 0.004]), 0.018);
  // power light
  toy.sphere(0.018, { at: [0.07, bodyY + 0.08, 0.12], color: '#ff5a1a', finish: 'glow', segments: 8 });
  return done(toy, tip);
}

// ---------------------------------------------------------------- ballista

/** One bow: riser across x at (y, zBow), limbs to the tips, band to the nock, loaded bolt. */
function bow(toy: ToyBuilder, y: number, opts: { zBow: number; half: number; limb?: number; sweep?: number; nockZ: number; boltFrom: number; boltTo: number; r: number }): V3 {
  const { zBow, half, r } = opts;
  const tips: V3[] = [];
  if (opts.limb) {
    pencil(toy, [-half, y, zBow], [half, y, zBow], r, { sharpen: false, eraser: false });
    for (const side of [-1, 1]) {
      const root: V3 = [side * (half - 0.02), y, zBow - 0.005];
      const tip: V3 = [side * (half - 0.02 + opts.limb * Math.cos(opts.sweep!)), y, zBow - opts.limb * Math.sin(opts.sweep!)];
      pencil(toy, root, tip, r * 0.95);
      wrap(toy, add3(root, [side * 0.015, 0, 0]), [1, 0, 0], r * 1.12, r * 0.45);
      tips.push(add3(root, [tip[0] - root[0], 0, tip[2] - root[2]], 0.82));
    }
  } else {
    pencil(toy, [-half, y, zBow], [half, y, zBow], r);
    tips.push([-half + 0.06, y, zBow], [half - 0.07, y, zBow]);
  }
  // band loops at the tips and the stretched string
  const nock: V3 = [0, y + r * 1.2, opts.nockZ];
  for (const tip of tips) {
    wrap(toy, tip, [1, 0, 0], r * 1.1, r * 0.35);
    rod(toy, tip, nock, 0.009, 0.009, BAND, 'matte', 5);
  }
  toy.sphere(0.014, { at: nock, color: BAND, finish: 'matte', segments: 5 });
  // lashing where the bolt rail crosses the bow
  wrap(toy, [0, y, zBow], [1, 0, 1], r * 1.25, r * 0.3);
  wrap(toy, [0, y, zBow], [-1, 0, 1], r * 1.25, r * 0.3);
  // loaded bolt
  const boltR = r * 0.8;
  const boltY = y + r + boltR * 0.9;
  pencil(toy, [0, boltY, opts.boltFrom], [0, boltY, opts.boltTo], boltR);
  return [0, boltY, opts.boltTo];
}

function ruler(toy: ToyBuilder, at: V3, length: number, width: number, alongZ: boolean, color = '#efd08a', ticks = true) {
  const size: V3 = alongZ ? [width, 0.026, length] : [length, 0.026, width];
  toy.box(size, { at, color, finish: 'matte', round: 0 });
  const count = ticks ? Math.floor(length / 0.05) : 0;
  for (let i = 1; i < count; i += 1) {
    const t = -length / 2 + i * 0.05;
    const long = i % 2 === 0 ? 0.05 : 0.028;
    const edge = width / 2 - long / 2 - 0.004;
    const pos: V3 = alongZ ? [at[0] + edge, at[1] + 0.013, at[2] + t] : [at[0] + t, at[1] + 0.013, at[2] + edge];
    toy.box(alongZ ? [long, 0.003, 0.006] : [0.006, 0.003, long], { at: pos, color: '#4a3422', finish: 'matte', round: 0 });
  }
}

function ballista1(): ToyModel {
  const toy = new ToyBuilder();
  // pink eraser block with a blue sleeve end
  toy.box([0.38, 0.12, 0.25], { at: [0, 0.06, 0], color: ERASER, finish: 'matte', round: 0.03 });
  toy.box([0.13, 0.125, 0.255], { at: [-0.13, 0.062, 0], color: '#3e7fe0', finish: 'matte', round: 0 });
  // two clothes pegs leaning together as the stand
  const lean = 0.2, len = 0.6;
  peg(toy, [-0.13, 0.08, 0], [0, 0, -lean], len);
  peg(toy, [0.13, 0.08, 0], [0, 0, lean], len);
  const topY = 0.08 + len * Math.cos(lean);
  wrap(toy, [0, topY - 0.03, 0], [0, 1, 0], 0.05, 0.012);
  toy.cylinder(0.05, 0.05, 0.025, { at: [0, topY + 0.01, 0], color: FERRULE, finish: 'metal', segments: 12 });

  const pivot: V3 = [0, topY + 0.022, 0];
  toy.turret(pivot);
  const r = 0.034;
  const y = pivot[1] + r;
  // stock pencil along z
  pencil(toy, [0, y, -0.25], [0, y, 0.16], r, { sharpen: false });
  const tip = bow(toy, y + r * 0.6, { zBow: 0.1, half: 0.31, nockZ: -0.14, boltFrom: -0.15, boltTo: 0.3, r });
  return done(toy, tip);
}

function ballista2(): ToyModel {
  const toy = new ToyBuilder();
  // crossed rulers
  ruler(toy, [0, 0.013, 0], 0.8, 0.16, false);
  ruler(toy, [0, 0.039, 0], 0.68, 0.15, true, '#9fd3f0');
  // four pegs leaning into a pyramid
  const len = 0.76, foot = 0.17, head = 0.03;
  const lean = Math.asin((foot - head) / len);
  peg(toy, [-foot, 0.05, 0], [0, 0, -lean], len);
  peg(toy, [foot, 0.05, 0], [0, 0, lean], len);
  peg(toy, [0, 0.05, -foot], [lean, 0, 0], len, true);
  peg(toy, [0, 0.05, foot], [-lean, 0, 0], len, true);
  const topY = 0.05 + len * Math.cos(lean);
  wrap(toy, [0, topY - 0.05, 0], [0, 1, 0], 0.062, 0.014);
  spool(toy, [0, topY + 0.03, 0], [0, 0, 0], 0.075, 0.08, PANEL_RED);
  // spare bolts standing in an eraser, and a pencil sharpener
  toy.box([0.12, 0.08, 0.11], { at: [0.31, 0.066, 0], color: ERASER, finish: 'matte', round: 0 });
  for (const [dx, dz, tx, tz] of [[-0.025, -0.025, -0.03, -0.02], [0.025, -0.025, 0.03, -0.03], [-0.02, 0.025, -0.02, 0.04], [0.025, 0.025, 0.02, 0.03]] as const) {
    pencil(toy, [0.31 + dx, 0.08, dz], [0.31 + dx + tx, 0.44, dz + tz], 0.022, { eraser: false });
  }
  toy.box([0.09, 0.07, 0.07], { at: [-0.31, 0.061, 0.0], color: '#2f6fd6', finish: 'plastic', round: 0 });
  toy.box([0.07, 0.05, 0.004], { at: [-0.31, 0.065, 0.036], color: FERRULE, finish: 'metal', round: 0 });
  toy.cylinder(0.016, 0.016, 0.03, { at: [-0.31, 0.06, -0.035], rot: [Math.PI / 2, 0, 0], color: '#1d2b44', finish: 'matte', segments: 8 });

  const pivot: V3 = [0, topY + 0.07, 0];
  toy.turret(pivot);
  // wooden ruler stock with a clothes-peg nock clip
  const y0 = pivot[1];
  toy.box([0.08, 0.026, 0.5], { at: [0, y0 + 0.013, -0.02], color: WOOD_LIGHT, finish: 'matte', round: 0 });
  for (let i = 0; i < 8; i += 1) toy.box([0.03, 0.003, 0.005], { at: [0.022, y0 + 0.027, -0.24 + i * 0.05], color: '#4a3422', finish: 'matte', round: 0 });
  peg(toy, [0, y0 + 0.045, -0.27], [Math.PI / 2, 0, 0], 0.17);
  const r = 0.036;
  const tip = bow(toy, y0 + 0.026 + r, { zBow: 0.15, half: 0.17, limb: 0.24, sweep: 0.45, nockZ: -0.18, boltFrom: -0.2, boltTo: 0.38, r });
  return done(toy, tip);
}

function ballista3(): ToyModel {
  const toy = new ToyBuilder();
  // cart: two rulers on pencil axles with thread-spool wheels
  ruler(toy, [0, 0.21, 0.1], 0.62, 0.19, false);
  ruler(toy, [0, 0.21, -0.1], 0.62, 0.19, false, '#9fd3f0', false);
  for (const z of [-0.15, 0.15]) {
    pencil(toy, [-0.36, 0.1, z], [0.36, 0.1, z], 0.026, { sharpen: false });
    for (const x of [-0.29, 0.29]) {
      spool(toy, [x, 0.1, z], [0, 0, Math.PI / 2], 0.098, 0.085, z > 0 ? PANEL_RED : '#3e7fe0', 10);
      toy.box([0.055, 0.075, 0.05], { at: [x * 0.6, 0.16, z], color: WOOD, finish: 'matte', round: 0 });
    }
  }
  // big spool as the swivel
  spool(toy, [0, 0.31, 0], [0, 0, 0], 0.13, 0.17, PANEL_YELLOW, 14);

  const pivot: V3 = [0, 0.395, 0];
  toy.turret(pivot);
  toy.box([0.36, 0.03, 0.22], { at: [0, 0.41, 0], color: WOOD_LIGHT, finish: 'matte', round: 0 });
  // pencil frame: four posts (erasers up) and crossbars
  const postTop = 1.27;
  for (const x of [-0.13, 0.13]) {
    for (const z of [-0.075, 0.075]) pencil(toy, [x, postTop, z], [x, 0.4, z], 0.026);
  }
  for (const y of [0.64, 1.0, 1.2]) {
    for (const z of [-0.075, 0.075]) pencil(toy, [-0.16, y, z], [0.16, y, z], 0.02, { plain: true });
  }
  // the crank: winding drum between the posts and a handle on the side
  spool(toy, [0, 0.82, -0.075], [0, 0, Math.PI / 2], 0.05, 0.2, BAND, 10);
  toy.cylinder(0.01, 0.01, 0.12, { at: [0.18, 0.82, -0.075], rot: [0, 0, Math.PI / 2], color: FERRULE, finish: 'metal', segments: 6 });
  toy.box([0.016, 0.13, 0.025], { at: [0.235, 0.77, -0.075], color: FERRULE, finish: 'metal', round: 0 });
  toy.cylinder(0.022, 0.022, 0.07, { at: [0.27, 0.72, -0.075], rot: [0, 0, Math.PI / 2], color: PANEL_RED, finish: 'plastic', segments: 8 });
  // two decks
  const r = 0.032;
  for (const y of [0.64, 1.0]) {
    toy.box([0.07, 0.024, 0.52], { at: [0, y + 0.032, 0.0], color: WOOD_LIGHT, finish: 'matte', round: 0 });
  }
  bow(toy, 0.64 + 0.044 + r, { zBow: 0.17, half: 0.16, limb: 0.24, sweep: 0.42, nockZ: -0.2, boltFrom: -0.22, boltTo: 0.36, r });
  const tip = bow(toy, 1.0 + 0.044 + r, { zBow: 0.17, half: 0.16, limb: 0.24, sweep: 0.42, nockZ: -0.2, boltFrom: -0.22, boltTo: 0.38, r });
  // flag on top
  rod(toy, [0, 1.2, 0], [0, 1.5, 0], 0.008, 0.008, WOOD_LIGHT, 'matte', 5);
  toy.extrude([[0, 0], [0.16, -0.045], [0, -0.09]], 0.006, { at: [0.008, 1.5, 0], color: BAND, finish: 'matte' });
  toy.extrude([[0, 0], [0.09, -0.025], [0, -0.05]], 0.008, { at: [0.008, 1.48, 0], color: PENCIL, finish: 'matte' });
  return done(toy, tip);
}

// ---------------------------------------------------------------- robot

/** Wind-up key on its own spin piece, shaft entering the back at `at` (z points out of the toy). */
function windKey(toy: ToyBuilder, at: V3, size: number) {
  toy.spin(at, [0, 0, 1], 0.6);
  rod(toy, add3(at, [0, 0, 0.01]), add3(at, [0, 0, -size * 0.7]), size * 0.14, size * 0.14, KEY_GOLD, 'metal', 8);
  const z = at[2] - size * 0.8;
  for (const side of [-1, 1]) {
    toy.cylinder(size * 0.42, size * 0.42, size * 0.14, { at: [at[0], at[1] + side * size * 0.45, z], rot: [0, 0, Math.PI / 2], color: KEY_GOLD, finish: 'metal', segments: 10 });
  }
  toy.cylinder(size * 0.2, size * 0.2, size * 0.24, { at: [at[0], at[1], z], rot: [0, 0, Math.PI / 2], color: KEY_GOLD, finish: 'metal', segments: 8 });
  toy.body();
}

function rivet(toy: ToyBuilder, at: V3, normal: V3, r = 0.011) {
  const { rot } = along([0, 0, 0], normal);
  toy.cylinder(r * 0.7, r, r * 0.9, { at, rot, color: '#d8e6f2', finish: 'metal', segments: 4 });
}

/** Clamp hand at the end of a forearm. */
function clamp(toy: ToyBuilder, at: V3, size: number) {
  toy.cylinder(size * 0.55, size * 0.55, size * 0.6, { at, color: PANEL_YELLOW, finish: 'plastic', segments: 10 });
  for (const side of [-1, 1]) {
    toy.box([size * 0.3, size * 1.1, size * 0.8], { at: [at[0] + side * size * 0.38, at[1] - size * 0.75, at[2] + size * 0.1], rot: [0, 0, side * 0.25], color: PANEL_RED, finish: 'plastic', round: 0 });
  }
}

function robot1(): ToyModel {
  const toy = new ToyBuilder();
  for (const x of [-0.085, 0.085]) {
    toy.box([0.11, 0.07, 0.17], { at: [x, 0.035, 0.02], color: PANEL_RED, finish: 'plastic', round: 0.025 });
    toy.cylinder(0.04, 0.042, 0.15, { at: [x, 0.14, 0], color: TIN, finish: 'metal', segments: 10 });
  }
  toy.box([0.26, 0.06, 0.18], { at: [0, 0.225, 0], color: TIN_DARK, finish: 'metal', round: 0 });
  // torso
  toy.box([0.32, 0.28, 0.22], { at: [0, 0.39, 0], color: TIN, finish: 'metal', round: 0.04 });
  toy.box([0.21, 0.17, 0.014], { at: [0, 0.39, 0.111], color: PANEL_RED, finish: 'plastic', round: 0 });
  toy.cylinder(0.055, 0.055, 0.02, { at: [0, 0.405, 0.122], rot: [Math.PI / 2, 0, 0], color: PANEL_YELLOW, finish: 'plastic', segments: 14 });
  toy.cylinder(0.062, 0.062, 0.012, { at: [0, 0.405, 0.117], rot: [Math.PI / 2, 0, 0], color: '#d8e6f2', finish: 'metal', segments: 14 });
  toy.box([0.008, 0.045, 0.006], { at: [0.012, 0.418, 0.134], rot: [0, 0, -0.55], color: BLACK, finish: 'plastic', round: 0 });
  for (const [x, c] of [[-0.06, '#5dff7a'], [0, '#ffd23a'], [0.06, '#ff4a3a']] as const) {
    toy.sphere(0.012, { at: [x, 0.33, 0.12], color: c, finish: 'glow', segments: 6 });
  }
  for (const x of [-0.14, 0.14]) for (const y of [0.28, 0.5]) rivet(toy, [x, y, 0.111], [0, 0, 1]);
  // arms with clamp hands
  for (const side of [-1, 1]) {
    toy.sphere(0.05, { at: [side * 0.19, 0.48, 0], color: PANEL_RED, finish: 'plastic', segments: 10 });
    rod(toy, [side * 0.2, 0.47, 0], [side * 0.22, 0.32, 0.08], 0.034, 0.03, TIN, 'metal', 8);
    clamp(toy, [side * 0.22, 0.31, 0.085], 0.05);
  }
  windKey(toy, [0, 0.4, -0.11], 0.13);
  toy.cylinder(0.045, 0.05, 0.05, { at: [0, 0.55, 0], color: TIN_DARK, finish: 'metal', segments: 10 });

  // head
  const pivot: V3 = [0, 0.56, 0];
  toy.turret(pivot);
  const hy = 0.675;
  toy.box([0.25, 0.21, 0.21], { at: [0, hy, 0], color: TIN, finish: 'metal', round: 0.04 });
  toy.box([0.255, 0.035, 0.215], { at: [0, hy + 0.07, 0], color: PANEL_YELLOW, finish: 'plastic', round: 0 });
  for (const side of [-1, 1]) {
    toy.cylinder(0.047, 0.047, 0.014, { at: [side * 0.057, hy + 0.01, 0.106], rot: [Math.PI / 2, 0, 0], color: '#d8e6f2', finish: 'metal', segments: 12 });
    toy.sphere(0.036, { at: [side * 0.057, hy + 0.01, 0.106], scale: [1, 1, 0.7], color: EYE_CYAN, finish: 'glow', segments: 10 });
    toy.cylinder(0.035, 0.035, 0.03, { at: [side * 0.135, hy, 0], rot: [0, 0, Math.PI / 2], color: PANEL_RED, finish: 'plastic', segments: 10 });
  }
  toy.box([0.12, 0.035, 0.012], { at: [0, hy - 0.06, 0.106], color: '#2b3440', finish: 'metal', round: 0 });
  for (const x of [-0.03, 0, 0.03]) toy.box([0.008, 0.03, 0.006], { at: [x, hy - 0.06, 0.113], color: '#d8e6f2', finish: 'metal', round: 0 });
  rod(toy, [0, hy + 0.1, 0], [0, hy + 0.2, 0], 0.008, 0.008, '#d8e6f2', 'metal', 6);
  toy.sphere(0.026, { at: [0, hy + 0.21, 0], color: '#ff4a3a', finish: 'glow', segments: 8 });
  return done(toy, [0, hy + 0.01, 0.13]);
}

function robot2(): ToyModel {
  const toy = new ToyBuilder();
  for (const x of [-0.1, 0.1]) {
    toy.box([0.13, 0.085, 0.21], { at: [x, 0.0425, 0.025], color: PANEL_RED, finish: 'plastic', round: 0.03 });
    toy.cylinder(0.042, 0.046, 0.14, { at: [x, 0.15, 0], color: TIN, finish: 'metal', segments: 10 });
    toy.sphere(0.05, { at: [x, 0.23, 0], color: PANEL_YELLOW, finish: 'plastic', segments: 10 });
    toy.cylinder(0.046, 0.042, 0.12, { at: [x, 0.31, 0], color: TIN, finish: 'metal', segments: 10 });
  }
  toy.box([0.3, 0.07, 0.2], { at: [0, 0.37, 0], color: TIN_DARK, finish: 'metal', round: 0 });
  // torso with light panel and yellow belt
  const ty = 0.565;
  toy.box([0.36, 0.34, 0.25], { at: [0, ty, 0], color: TIN, finish: 'metal', round: 0.05 });
  toy.box([0.365, 0.045, 0.255], { at: [0, 0.43, 0], color: PANEL_YELLOW, finish: 'plastic', round: 0 });
  toy.box([0.23, 0.15, 0.016], { at: [0, ty + 0.04, 0.126], color: '#24303c', finish: 'metal', round: 0 });
  const lights = ['#ff4a3a', '#ffd23a', '#5dff7a', '#62f3ff', '#ff4a3a', '#ffd23a'];
  lights.forEach((c, i) => {
    toy.box([0.05, 0.045, 0.012], { at: [-0.065 + (i % 3) * 0.065, ty + 0.07 - Math.floor(i / 3) * 0.06, 0.134], color: c, finish: 'glow', round: 0 });
  });
  toy.box([0.07, 0.035, 0.012], { at: [0.12, 0.48, 0.126], color: PANEL_RED, finish: 'plastic', round: 0 });
  toy.cylinder(0.022, 0.022, 0.015, { at: [-0.12, 0.48, 0.127], rot: [Math.PI / 2, 0, 0], color: PANEL_YELLOW, finish: 'plastic', segments: 10 });
  for (const x of [-0.155, 0.155]) for (const y of [0.47, 0.69]) rivet(toy, [x, y, 0.126], [0, 0, 1]);
  // shoulder pads with antennae, arms with clamp hands
  for (const side of [-1, 1]) {
    toy.dome(0.075, { at: [side * 0.2, 0.69, 0], color: PANEL_RED, finish: 'plastic', segments: 12 });
    toy.sphere(0.05, { at: [side * 0.2, 0.67, 0], color: TIN_DARK, finish: 'metal', segments: 8 });
    rod(toy, [side * 0.215, 0.75, 0], [side * 0.235, 0.95, -0.01], 0.009, 0.007, '#d8e6f2', 'metal', 6);
    toy.sphere(0.025, { at: [side * 0.236, 0.96, -0.01], color: PANEL_YELLOW, finish: 'glow', segments: 8 });
    rod(toy, [side * 0.22, 0.66, 0], [side * 0.245, 0.5, 0.02], 0.038, 0.035, TIN, 'metal', 8);
    toy.sphere(0.042, { at: [side * 0.245, 0.5, 0.02], color: PANEL_YELLOW, finish: 'plastic', segments: 8 });
    rod(toy, [side * 0.245, 0.5, 0.02], [side * 0.25, 0.43, 0.14], 0.034, 0.032, TIN, 'metal', 8);
    clamp(toy, [side * 0.25, 0.42, 0.15], 0.058);
  }
  windKey(toy, [0, 0.57, -0.125], 0.16);
  for (const y of [0.745, 0.775]) toy.cylinder(0.055, 0.055, 0.025, { at: [0, y, 0], color: y < 0.76 ? TIN_DARK : '#d8e6f2', finish: 'metal', segments: 10 });

  const pivot: V3 = [0, 0.77, 0];
  toy.turret(pivot);
  const hy = 0.9;
  toy.box([0.28, 0.23, 0.24], { at: [0, hy, 0], color: TIN, finish: 'metal', round: 0.05 });
  // visor with two big eyes
  toy.box([0.24, 0.095, 0.02], { at: [0, hy + 0.015, 0.118], color: '#1f2a36', finish: 'metal', round: 0 });
  for (const side of [-1, 1]) {
    toy.box([0.085, 0.06, 0.016], { at: [side * 0.055, hy + 0.015, 0.128], color: EYE_CYAN, finish: 'glow', round: 0 });
    toy.cylinder(0.04, 0.04, 0.035, { at: [side * 0.15, hy, 0], rot: [0, 0, Math.PI / 2], color: PANEL_RED, finish: 'plastic', segments: 10 });
    rod(toy, [side * 0.165, hy, 0], [side * 0.165, hy + 0.08, 0], 0.007, 0.007, '#d8e6f2', 'metal', 5);
  }
  for (const y of [-0.06, -0.085]) toy.box([0.1, 0.01, 0.012], { at: [0, hy + y, 0.12], color: '#2b3440', finish: 'metal', round: 0 });
  // crest
  toy.box([0.045, 0.06, 0.2], { at: [0, hy + 0.13, 0], color: PANEL_YELLOW, finish: 'plastic', round: 0 });
  return done(toy, [0, hy + 0.015, 0.14]);
}

function robot3(): ToyModel {
  const toy = new ToyBuilder();
  // tank treads
  for (const side of [-1, 1]) {
    const x = side * 0.15;
    const loop: [number, number][] = [];
    for (let i = 0; i <= 8; i += 1) { const a = -Math.PI / 2 + (i / 8) * Math.PI; loop.push([0.125 + Math.cos(a) * 0.075, Math.sin(a) * 0.075]); }
    for (let i = 0; i <= 8; i += 1) { const a = Math.PI / 2 + (i / 8) * Math.PI; loop.push([-0.125 + Math.cos(a) * 0.075, Math.sin(a) * 0.075]); }
    toy.extrude(loop, 0.13, { at: [x, 0.075, 0.02], rot: [0, Math.PI / 2, 0], color: '#2a2d33', finish: 'matte' });
    for (let i = 0; i < 5; i += 1) toy.box([0.134, 0.012, 0.024], { at: [x, 0.152, -0.09 + i * 0.055], color: '#4a4e57', finish: 'matte', round: 0 });
    for (const z of [-0.11, 0.02, 0.15]) {
      toy.cylinder(0.05, 0.05, 0.02, { at: [x + side * 0.068, 0.075, z], rot: [0, 0, Math.PI / 2], color: TIN_DARK, finish: 'metal', segments: 9 });
      toy.cylinder(0.022, 0.022, 0.024, { at: [x + side * 0.072, 0.075, z], rot: [0, 0, Math.PI / 2], color: PANEL_RED, finish: 'plastic', segments: 6 });
    }
    toy.box([0.15, 0.025, 0.36], { at: [x, 0.168, 0.02], color: PANEL_RED, finish: 'plastic', round: 0 });
  }
  toy.box([0.2, 0.12, 0.2], { at: [0, 0.22, 0], color: TIN_DARK, finish: 'metal', round: 0 });
  // barrel chest (oval lathe)
  const oz = 0.78;
  toy.lathe([[0, 0.25], [0.16, 0.25], [0.2, 0.29], [0.218, 0.38], [0.218, 0.64], [0.2, 0.72], [0.15, 0.77], [0, 0.78]],
    { scale: [1, 1, oz], color: TIN, finish: 'metal', segments: 16 });
  toy.cylinder(0.222, 0.222, 0.045, { at: [0, 0.36, 0], scale: [1, 1, oz], color: PANEL_RED, finish: 'plastic', segments: 16 });
  for (let i = 0; i < 10; i += 1) {
    const a = (i / 10) * Math.PI * 2 + 0.3;
    const n: V3 = [Math.sin(a), 0, Math.cos(a)];
    rivet(toy, [n[0] * 0.219, 0.66, n[2] * 0.219 * oz], n, 0.012);
  }
  // chest plate: yellow, big dial and lights
  toy.box([0.22, 0.17, 0.03], { at: [0, 0.52, 0.163], rot: [-0.05, 0, 0], color: PANEL_YELLOW, finish: 'plastic', round: 0 });
  toy.cylinder(0.055, 0.055, 0.02, { at: [-0.04, 0.525, 0.182], rot: [Math.PI / 2, 0, 0], color: '#f7f2e4', finish: 'plastic', segments: 14 });
  toy.cylinder(0.064, 0.064, 0.012, { at: [-0.04, 0.525, 0.177], rot: [Math.PI / 2, 0, 0], color: PANEL_RED, finish: 'plastic', segments: 14 });
  toy.box([0.008, 0.045, 0.006], { at: [-0.03, 0.535, 0.194], rot: [0, 0, -0.7], color: BLACK, finish: 'plastic', round: 0 });
  for (const [y, c] of [[0.565, '#ff4a3a'], [0.525, '#5dff7a'], [0.485, '#62f3ff']] as const) {
    toy.sphere(0.016, { at: [0.06, y, 0.182], color: c, finish: 'glow', segments: 6 });
  }
  // arms
  for (const side of [-1, 1]) {
    toy.sphere(0.08, { at: [side * 0.24, 0.68, 0], color: PANEL_RED, finish: 'plastic', segments: 9 });
    rod(toy, [side * 0.25, 0.66, 0], [side * 0.29, 0.48, 0.04], 0.048, 0.044, TIN, 'metal', 10);
    toy.sphere(0.052, { at: [side * 0.29, 0.48, 0.04], color: PANEL_YELLOW, finish: 'plastic', segments: 8 });
    rod(toy, [side * 0.29, 0.48, 0.04], [side * 0.3, 0.41, 0.17], 0.044, 0.04, TIN, 'metal', 10);
    clamp(toy, [side * 0.3, 0.4, 0.18], 0.07);
  }
  windKey(toy, [-0.09, 0.55, -0.165], 0.15);
  windKey(toy, [0.09, 0.55, -0.165], 0.15);
  toy.cylinder(0.1, 0.12, 0.05, { at: [0, 0.79, 0], color: TIN_DARK, finish: 'metal', segments: 14 });

  // domed head
  const pivot: V3 = [0, 0.8, 0];
  toy.turret(pivot);
  const base = 0.81, hr = 0.175;
  toy.cylinder(hr, hr, 0.16, { at: [0, base + 0.08, 0], color: TIN, finish: 'metal', segments: 16 });
  toy.dome(hr, { at: [0, base + 0.16, 0], color: TIN, finish: 'metal', segments: 16 });
  toy.cylinder(hr + 0.008, hr + 0.008, 0.022, { at: [0, base + 0.16, 0], color: PANEL_YELLOW, finish: 'plastic', segments: 16 });
  toy.cylinder(hr + 0.006, hr + 0.006, 0.018, { at: [0, base + 0.01, 0], color: PANEL_RED, finish: 'plastic', segments: 16 });
  // single wide red visor wrapped around the front
  const arc = 2.3;
  const visorY = base + 0.085;
  toy.torus(hr - 0.004, 0.032, { at: [0, visorY, 0], rot: [0, -(Math.PI / 2 - arc / 2), 0], scale: [1, 1.45, 1], arc, color: '#ff3b2f', finish: 'glow', segments: 14 });
  for (const side of [-1, 1]) {
    toy.cylinder(0.05, 0.05, 0.04, { at: [side * (hr + 0.005), visorY, 0], rot: [0, 0, Math.PI / 2], color: PANEL_RED, finish: 'plastic', segments: 10 });
    toy.cylinder(0.022, 0.022, 0.05, { at: [side * (hr + 0.02), visorY, 0], rot: [0, 0, Math.PI / 2], color: PANEL_YELLOW, finish: 'plastic', segments: 8 });
  }
  for (let i = 0; i < 6; i += 1) {
    const a = Math.PI + (i - 2.5) * 0.5;
    rivet(toy, [Math.sin(a) * hr, base + 0.085, Math.cos(a) * hr], [Math.sin(a), 0, Math.cos(a)], 0.012);
  }
  // dish antenna on a stalk
  const dishAt: V3 = [0, base + 0.43, -0.05];
  const tilt = 0.55;
  rod(toy, [0, base + 0.3, -0.02], dishAt, 0.016, 0.012, '#d8e6f2', 'metal', 6);
  toy.dome(0.13, { at: dishAt, rot: [Math.PI + tilt, 0, 0], scale: [1, 0.45, 1], color: '#eef3f8', finish: 'metal', segments: 14 });
  toy.cylinder(0.02, 0.02, 0.02, { at: dishAt, rot: [tilt, 0, 0], color: PANEL_RED, finish: 'plastic', segments: 8 });
  rod(toy, dishAt, add3(dishAt, [0, Math.cos(tilt) * 0.1, Math.sin(tilt) * 0.1]), 0.008, 0.006, '#d8e6f2', 'metal', 5);
  toy.sphere(0.022, { at: add3(dishAt, [0, Math.cos(tilt) * 0.105, Math.sin(tilt) * 0.105]), color: '#ff4a3a', finish: 'glow', segments: 8 });
  return done(toy, [0, visorY, hr + 0.03]);
}

export const TOWER_TOYS_B = {
  'glue-1': glue1,
  'glue-2': glue2,
  'glue-3': glue3,
  'ballista-1': ballista1,
  'ballista-2': ballista2,
  'ballista-3': ballista3,
  'robot-1': robot1,
  'robot-2': robot2,
  'robot-3': robot3,
};
