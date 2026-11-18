import * as THREE from 'three';
import { ToyBuilder, type Finish, type ToyModel } from './kit';

// Moulded plastic army men. Soldiers are cast in ONE plastic colour chosen at
// runtime: `plastic` parts are multiplied by it, so they are white or light grey
// (darker greys shade boots, straps and weapons). `matte` / `metal` parts keep
// their own colour and are used only for details that must not be tinted.
// Model space: feet on the floor at the origin, +y up, the figure faces +z, so
// its right hand is on the -x side.

type V3 = [number, number, number];
type Look = { color: string; finish?: Finish; segments?: number };

const WHITE = '#ffffff';
const LIGHT = '#e6e6e6';
const STRAP = '#c8c8c8';
const BOOT = '#b4b4b4';
const GEAR = '#a6a6a6';
const GUN = '#9a9a9a';
const PLATE = '#d4d4d4';
const RED = '#c8262a';
const CREAM_WHITE = '#f4f1e8';
const BRASS = '#d9a93a';

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const tmpQuat = new THREE.Quaternion();
const tmpEuler = new THREE.Euler();

/** Euler angles (XYZ) that turn `axis` onto the direction a → b, plus midpoint and length. */
function span(a: V3, b: V3, axis: THREE.Vector3): { at: V3; rot: V3; length: number } {
  const from = new THREE.Vector3(...a);
  const dir = new THREE.Vector3(...b).sub(from);
  const length = dir.length();
  tmpQuat.setFromUnitVectors(axis, dir.normalize());
  tmpEuler.setFromQuaternion(tmpQuat, 'XYZ');
  return {
    at: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2],
    rot: [tmpEuler.x, tmpEuler.y, tmpEuler.z],
    length,
  };
}

/** Rounded limb from joint a to joint b (the round ends are centred on the joints). */
function limb(toy: ToyBuilder, a: V3, b: V3, radius: number, look: Look): void {
  const s = span(a, b, Y_AXIS);
  toy.capsule(radius, Math.max(0.001, s.length), { at: s.at, rot: s.rot, color: look.color, finish: look.finish, segments: look.segments ?? 6 });
}

/** Cheap two-part arm: hexagonal upper and fore arm with an elbow ball and a round fist. */
function arm(toy: ToyBuilder, shoulder: V3, elbow: V3, fist: V3, radius: number, fistRadius = radius * 1.15, segments = 6): void {
  rod(toy, shoulder, elbow, radius, radius * 0.95, { color: WHITE, segments });
  toy.sphere(radius * 0.97, { at: elbow, color: WHITE, segments });
  rod(toy, elbow, fist, radius * 0.95, radius * 0.9, { color: WHITE, segments });
  if (fistRadius > 0) toy.sphere(fistRadius, { at: fist, color: WHITE, segments });
}

/** Bent leg: thigh, knee ball and shin. */
function bentLeg(toy: ToyBuilder, hip: V3, knee: V3, ankle: V3, radius: number): void {
  rod(toy, hip, knee, radius, radius * 0.97, { color: WHITE, segments: 7 });
  toy.sphere(radius * 0.98, { at: knee, color: WHITE, segments: 7 });
  rod(toy, knee, ankle, radius * 0.97, radius * 0.9, { color: WHITE, segments: 7 });
}

/** Rod from a to b (`radiusB` at the b end). */
function rod(toy: ToyBuilder, a: V3, b: V3, radiusA: number, radiusB: number, look: Look): void {
  const s = span(a, b, Y_AXIS);
  toy.cylinder(radiusB, radiusA, s.length, { at: s.at, rot: s.rot, color: look.color, finish: look.finish, segments: look.segments ?? 6 });
}

/** Box whose length runs from a to b. */
function bar(toy: ToyBuilder, a: V3, b: V3, width: number, height: number, look: Look, round = 0): void {
  const s = span(a, b, Z_AXIS);
  toy.box([width, height, s.length], { at: s.at, rot: s.rot, color: look.color, finish: look.finish, round });
}

/** Thin oval moulded base plate. */
function plate(toy: ToyBuilder, rx: number, rz: number, thickness = 0.02): void {
  toy.cylinder(1, 1, thickness, { at: [0, thickness / 2, 0], scale: [rx, 1, rz], color: PLATE, segments: 18 });
}

/** Chunky boot; `at` is the ankle point above the plate, `yaw` turns the toe. */
function boot(toy: ToyBuilder, at: V3, yaw = 0, size = 1, pitch = 0): void {
  const forward: V3 = [Math.sin(yaw) * 0.014 * size, 0, Math.cos(yaw) * 0.014 * size];
  toy.sphere(1, {
    at: [at[0] + forward[0], at[1], at[2] + forward[2]],
    rot: [pitch, yaw, 0],
    scale: [0.038 * size, 0.03 * size, 0.06 * size],
    color: BOOT,
    segments: 7,
  });
}

/** Round army helmet sitting with its rim at `at`. */
function helmet(toy: ToyBuilder, at: V3, radius: number, tilt = 0, look: Look = { color: LIGHT }): void {
  toy.dome(radius, { at, rot: [tilt, 0, 0], scale: [1, 0.9, 1.06], color: look.color, finish: look.finish, segments: 12 });
  toy.cylinder(radius * 1.12, radius * 1.14, radius * 0.13, { at, rot: [tilt, 0, 0], scale: [1, 1, 1.06], color: look.finish ? look.color : STRAP, finish: look.finish, segments: 12 });
}

/** Torso as a squashed capsule, leaning forward by `lean` radians. */
function torso(toy: ToyBuilder, at: V3, radius: number, length: number, lean: number, wide = 1.12, deep = 0.86, segments = 10): void {
  toy.capsule(radius, length, { at, rot: [lean, 0, 0], scale: [wide, 1, deep], color: WHITE, segments });
}

function belt(toy: ToyBuilder, at: V3, radius: number, lean: number, wide = 1.12, deep = 0.86): void {
  toy.cylinder(radius, radius, 0.024, { at, rot: [lean, 0, 0], scale: [wide, 1, deep], color: STRAP, segments: 10 });
}

// ---------------------------------------------------------------------------

function rifleman(): ToyModel {
  const toy = new ToyBuilder();
  plate(toy, 0.13, 0.13);
  // Striding legs: left (+x) forward, right back.
  limb(toy, [0.045, 0.18, 0.01], [0.05, 0.06, 0.07], 0.042, { color: WHITE });
  limb(toy, [-0.045, 0.18, -0.01], [-0.05, 0.06, -0.07], 0.042, { color: WHITE });
  boot(toy, [0.05, 0.047, 0.075], 0, 1.1);
  boot(toy, [-0.05, 0.047, -0.07], 0, 1.1, -0.15);
  // Torso leaning into the advance.
  const lean = 0.18;
  torso(toy, [0, 0.265, 0.012], 0.072, 0.06, lean);
  belt(toy, [0, 0.208, 0.0], 0.076, lean);
  // Backpack and bedroll.
  toy.box([0.11, 0.11, 0.055], { at: [0, 0.28, -0.072], rot: [lean, 0, 0], color: GEAR, round: 0 });
  rod(toy, [-0.065, 0.35, -0.065], [0.065, 0.35, -0.065], 0.026, 0.026, { color: STRAP, segments: 8 });
  // Big head and helmet.
  toy.sphere(0.064, { at: [0, 0.385, 0.04], color: WHITE, segments: 10 });
  helmet(toy, [0, 0.395, 0.035], 0.093, 0.12);
  // Rifle levelled forward at the hip, bayonet fixed.
  const stock: V3 = [-0.062, 0.232, -0.045];
  const muzzle: V3 = [-0.03, 0.298, 0.25];
  bar(toy, stock, [-0.052, 0.252, 0.04], 0.032, 0.058, { color: GUN });
  bar(toy, [-0.052, 0.252, 0.03], [-0.035, 0.29, 0.2], 0.03, 0.038, { color: GUN });
  rod(toy, [-0.035, 0.293, 0.19], muzzle, 0.011, 0.011, { color: GUN });
  bar(toy, [-0.04, 0.275, 0.07], [-0.044, 0.232, 0.082], 0.018, 0.026, { color: GUN });
  rod(toy, muzzle, [-0.027, 0.308, 0.33], 0.012, 0.001, { color: GUN, segments: 4 });
  // Arms: right hand on the grip, left hand on the fore-stock.
  const rightHand: V3 = [-0.052, 0.245, 0.06];
  const leftHand: V3 = [-0.036, 0.28, 0.15];
  arm(toy, [-0.08, 0.335, 0.01], [-0.105, 0.255, -0.01], rightHand, 0.03, 0.036);
  arm(toy, [0.08, 0.335, 0.025], [0.07, 0.265, 0.11], leftHand, 0.03, 0.036);
  return toy.build({ height: 0.5, radius: 0.13 });
}

function scout(): ToyModel {
  const toy = new ToyBuilder();
  plate(toy, 0.1, 0.145);
  // Long running stride, knees bent: left leg forward, right leg pushing off behind.
  const hipL: V3 = [0.036, 0.17, 0.0], hipR: V3 = [-0.036, 0.17, -0.01];
  const kneeL: V3 = [0.04, 0.12, 0.08], kneeR: V3 = [-0.04, 0.1, -0.06];
  const ankleL: V3 = [0.04, 0.045, 0.08], ankleR: V3 = [-0.04, 0.05, -0.12];
  bentLeg(toy, hipL, kneeL, ankleL, 0.031);
  bentLeg(toy, hipR, kneeR, ankleR, 0.031);
  toy.sphere(0.05, { at: [0, 0.18, -0.005], scale: [1.1, 0.8, 0.9], color: WHITE, segments: 8 });
  boot(toy, ankleL, 0, 0.85);
  boot(toy, ankleR, 0, 0.85, -0.5);
  // Slim torso leaning far forward.
  const lean = 0.55;
  torso(toy, [0, 0.235, 0.04], 0.052, 0.07, lean, 1.08, 0.82);
  belt(toy, [0, 0.185, 0.008], 0.054, lean, 1.08, 0.82);
  // Binoculars hanging on the chest.
  rod(toy, [0.016, 0.24, 0.1], [0.016, 0.21, 0.11], 0.012, 0.012, { color: GUN });
  rod(toy, [-0.016, 0.24, 0.1], [-0.016, 0.21, 0.11], 0.012, 0.012, { color: GUN });
  // Small canteen on the hip.
  toy.cylinder(0.022, 0.022, 0.04, { at: [0.06, 0.18, -0.02], rot: [0, 0, Math.PI / 2], color: GEAR, segments: 8 });
  // Head pushed forward, soft field cap with a long bill.
  toy.sphere(0.057, { at: [0, 0.335, 0.11], color: WHITE, segments: 10 });
  toy.cylinder(0.062, 0.06, 0.032, { at: [0, 0.362, 0.1], rot: [0.2, 0, 0], scale: [1, 1, 1.08], color: LIGHT, segments: 10 });
  toy.dome(0.062, { at: [0, 0.377, 0.097], rot: [0.2, 0, 0], scale: [1, 0.45, 1.08], color: LIGHT, segments: 10 });
  toy.box([0.08, 0.009, 0.06], { at: [0, 0.35, 0.18], rot: [0.12, 0, 0], color: STRAP, round: 0 });
  // Right arm thrust forward with a pistol, left arm swinging back.
  const pistolHand: V3 = [-0.03, 0.29, 0.25];
  arm(toy, [-0.055, 0.285, 0.08], [-0.05, 0.28, 0.17], pistolHand, 0.022, 0.025);
  toy.box([0.016, 0.024, 0.06], { at: [-0.03, 0.305, 0.28], color: GUN, round: 0 });
  arm(toy, [0.055, 0.28, 0.07], [0.075, 0.23, 0.0], [0.07, 0.25, -0.075], 0.022, 0.025);
  return toy.build({ height: 0.44, radius: 0.145 });
}

function shield(): ToyModel {
  const toy = new ToyBuilder();
  plate(toy, 0.17, 0.14);
  // Wide braced stance.
  rod(toy, [0.06, 0.22, -0.02], [0.085, 0.06, 0.03], 0.047, 0.042, { color: WHITE, segments: 8 });
  rod(toy, [-0.06, 0.22, -0.02], [-0.085, 0.06, -0.06], 0.047, 0.042, { color: WHITE, segments: 8 });
  boot(toy, [0.085, 0.05, 0.035], 0.2, 1.15);
  boot(toy, [-0.085, 0.05, -0.06], -0.2, 1.15);
  // Bulky body.
  const lean = 0.12;
  torso(toy, [0, 0.29, -0.02], 0.088, 0.07, lean, 1.2, 0.88, 8);
  belt(toy, [0, 0.22, -0.03], 0.092, lean, 1.2, 0.88);
  // Shoulder pads.
  toy.dome(0.05, { at: [0.1, 0.35, -0.01], rot: [0, 0, -0.5], scale: [1, 0.8, 1], color: STRAP, segments: 8 });
  toy.dome(0.05, { at: [-0.1, 0.35, -0.01], rot: [0, 0, 0.5], scale: [1, 0.8, 1], color: STRAP, segments: 8 });
  // Heavy pack.
  toy.box([0.13, 0.12, 0.05], { at: [0, 0.3, -0.115], rot: [lean, 0, 0], color: GEAR, round: 0 });
  // Big head, large helmet with neck guard.
  toy.sphere(0.064, { at: [0, 0.42, 0.0], color: WHITE, segments: 8 });
  helmet(toy, [0, 0.425, -0.005], 0.1, 0.05);
  toy.cylinder(0.105, 0.12, 0.04, { at: [0, 0.41, -0.012], scale: [1, 1, 1.05], color: STRAP, segments: 10 });
  // Arms reaching forward to the shield grip.
  arm(toy, [0.1, 0.35, 0.0], [0.12, 0.27, 0.05], [0.07, 0.26, 0.1], 0.032, 0);
  // Right hand pokes a stubby pistol round the shield edge.
  arm(toy, [-0.1, 0.35, 0.0], [-0.14, 0.28, 0.04], [-0.17, 0.3, 0.13], 0.032);
  toy.box([0.018, 0.026, 0.07], { at: [-0.17, 0.318, 0.17], color: GUN, round: 0 });
  // Big curved shield held in front: a bulging oval with a rim, boss and view slot.
  // It stops below the eyes so the helmet shows above it.
  const centre: V3 = [0, 0.23, 0.15];
  const tilt = -0.1;
  toy.sphere(1, { at: centre, rot: [tilt, 0, 0], scale: [0.18, 0.2, 0.055], color: LIGHT, segments: 12 });
  toy.torus(1, 0.075, { at: [0, 0.23, 0.145], rot: [Math.PI / 2 + tilt, 0, 0], scale: [0.18, 0.12, 0.2], color: STRAP, segments: 10 });
  toy.cylinder(0.026, 0.036, 0.016, { at: [0, 0.21, 0.2], rot: [Math.PI / 2 + tilt, 0, 0], color: STRAP, segments: 8 });
  toy.box([0.13, 0.014, 0.02], { at: [0, 0.32, 0.18], rot: [tilt, 0, 0], color: GUN, round: 0 });
  return toy.build({ height: 0.54, radius: 0.17 });
}

function medic(): ToyModel {
  const toy = new ToyBuilder();
  plate(toy, 0.13, 0.12);
  // Short step.
  limb(toy, [0.042, 0.18, 0.0], [0.05, 0.06, 0.05], 0.042, { color: WHITE });
  limb(toy, [-0.042, 0.18, 0.0], [-0.05, 0.06, -0.04], 0.042, { color: WHITE });
  boot(toy, [0.05, 0.047, 0.055], 0.15, 1.1);
  boot(toy, [-0.05, 0.047, -0.04], -0.15, 1.1);
  const lean = 0.05;
  torso(toy, [0, 0.265, 0.0], 0.072, 0.06, lean);
  belt(toy, [0, 0.208, -0.004], 0.076, lean);
  // Shoulder strap down to the satchel.
  bar(toy, [-0.055, 0.345, 0.048], [0.07, 0.21, 0.068], 0.02, 0.008, { color: STRAP });
  // Satchel on the left hip, turned to face front-left, with a white patch and red cross.
  const satchel: V3 = [0.088, 0.2, 0.045];
  const turn = 0.75;
  toy.box([0.095, 0.08, 0.042], { at: satchel, rot: [0, turn, 0], color: GEAR, round: 0 });
  const nx = Math.sin(turn), nz = Math.cos(turn);
  const face = (depth: number): V3 => [satchel[0] + nx * depth, satchel[1], satchel[2] + nz * depth];
  toy.box([0.066, 0.06, 0.006], { at: face(0.022), rot: [0, turn, 0], color: CREAM_WHITE, finish: 'matte', round: 0 });
  toy.box([0.046, 0.014, 0.006], { at: face(0.026), rot: [0, turn, 0], color: RED, finish: 'matte', round: 0 });
  toy.box([0.014, 0.046, 0.006], { at: face(0.026), rot: [0, turn, 0], color: RED, finish: 'matte', round: 0 });
  // Head and white helmet with red crosses on top and front.
  toy.sphere(0.064, { at: [0, 0.385, 0.025], color: WHITE, segments: 10 });
  helmet(toy, [0, 0.395, 0.02], 0.093, 0.05, { color: CREAM_WHITE, finish: 'matte' });
  toy.box([0.08, 0.008, 0.024], { at: [0, 0.479, 0.024], color: RED, finish: 'matte', round: 0 });
  toy.box([0.024, 0.008, 0.08], { at: [0, 0.479, 0.024], color: RED, finish: 'matte', round: 0 });
  toy.box([0.04, 0.013, 0.01], { at: [0, 0.455, 0.094], rot: [-0.75, 0, 0], color: RED, finish: 'matte', round: 0 });
  toy.box([0.013, 0.04, 0.01], { at: [0, 0.455, 0.094], rot: [-0.75, 0, 0], color: RED, finish: 'matte', round: 0 });
  // Right arm raised high and waving, with a white armband.
  arm(toy, [-0.08, 0.335, 0.0], [-0.135, 0.425, 0.0], [-0.12, 0.545, 0.03], 0.03, 0);
  toy.cylinder(0.034, 0.034, 0.028, { at: [-0.108, 0.38, 0.0], rot: [0, 0, 0.58], color: CREAM_WHITE, finish: 'matte', segments: 8 });
  toy.box([0.008, 0.02, 0.006], { at: [-0.106, 0.381, 0.033], rot: [0, 0, 0.58], color: RED, finish: 'matte', round: 0 });
  toy.box([0.02, 0.008, 0.006], { at: [-0.106, 0.381, 0.033], rot: [0, 0, 0.58], color: RED, finish: 'matte', round: 0 });
  toy.sphere(0.04, { at: [-0.12, 0.575, 0.03], scale: [0.9, 1.15, 0.6], color: WHITE, segments: 7 });
  // Left hand holding the satchel strap.
  arm(toy, [0.08, 0.335, 0.0], [0.112, 0.262, 0.03], [0.07, 0.262, 0.082], 0.03, 0.036);
  return toy.build({ height: 0.5, radius: 0.13 });
}

function bugler(): ToyModel {
  const toy = new ToyBuilder();
  plate(toy, 0.13, 0.12);
  // Standing tall, heels together, toes out.
  rod(toy, [0.04, 0.2, 0.0], [0.045, 0.06, 0.01], 0.044, 0.04, { color: WHITE, segments: 8 });
  rod(toy, [-0.04, 0.2, 0.0], [-0.045, 0.06, 0.0], 0.044, 0.04, { color: WHITE, segments: 8 });
  boot(toy, [0.05, 0.047, 0.02], 0.4, 1.1);
  boot(toy, [-0.05, 0.047, 0.01], -0.4, 1.1);
  // Chest out, leaning back a touch to blow.
  const lean = -0.12;
  torso(toy, [0, 0.265, -0.005], 0.072, 0.06, lean);
  belt(toy, [0, 0.208, 0.0], 0.076, lean);
  toy.box([0.1, 0.1, 0.05], { at: [0, 0.28, -0.085], rot: [lean, 0, 0], color: GEAR, round: 0 });
  // Head tipped back, helmet.
  toy.sphere(0.064, { at: [0, 0.385, 0.005], color: WHITE, segments: 10 });
  helmet(toy, [0, 0.4, -0.008], 0.093, -0.25);
  // Brass bugle raised to the mouth: mouthpiece tube, coiled loop and a wide bell.
  const mouth: V3 = [0, 0.37, 0.06];
  const bell: V3 = [0, 0.405, 0.2];
  rod(toy, mouth, bell, 0.008, 0.011, { color: BRASS, finish: 'metal' });
  toy.torus(0.032, 0.008, { at: [0, 0.358, 0.135], rot: [Math.PI / 2, 0, 0.0], scale: [1, 1, 1.4], color: BRASS, finish: 'metal', segments: 8 });
  rod(toy, bell, [0, 0.418, 0.25], 0.012, 0.036, { color: BRASS, finish: 'metal', segments: 12 });
  toy.cylinder(0.027, 0.027, 0.004, { at: [0, 0.4185, 0.2515], rot: [Math.PI / 2 - 0.26, 0, 0], color: '#5c4314', finish: 'matte', segments: 10 });
  // Right hand holding the bugle, left fist on the hip.
  arm(toy, [-0.08, 0.335, 0.0], [-0.12, 0.31, 0.09], [-0.012, 0.372, 0.15], 0.03, 0.036);
  arm(toy, [0.08, 0.335, -0.01], [0.142, 0.265, -0.02], [0.084, 0.22, 0.028], 0.03, 0.036);
  // Pennant on a pole strapped to the pack.
  const poleTop: V3 = [0.035, 0.65, -0.125];
  rod(toy, [0.035, 0.22, -0.105], poleTop, 0.007, 0.007, { color: GUN });
  toy.cone(0.012, 0.03, { at: [poleTop[0], poleTop[1] + 0.012, poleTop[2]], color: BRASS, finish: 'metal', segments: 6 });
  toy.extrude([[0, 0], [0, 0.085], [0.07, 0.06], [0.15, 0.045], [0.07, 0.03]], 0.006, {
    at: [0.035, 0.555, -0.125], rot: [0, Math.PI / 2 - 0.35, 0], color: '#e8b923', finish: 'matte',
  });
  return toy.build({ height: 0.5, radius: 0.13 });
}

function paratrooper(): ToyModel {
  const toy = new ToyBuilder();
  plate(toy, 0.12, 0.12);
  // Legs together, knees slightly bent, as if just landed or hanging.
  bentLeg(toy, [0.036, 0.2, 0.0], [0.042, 0.125, 0.035], [0.042, 0.055, 0.0], 0.041);
  bentLeg(toy, [-0.036, 0.2, 0.0], [-0.042, 0.125, 0.035], [-0.042, 0.055, 0.0], 0.041);
  boot(toy, [0.044, 0.047, 0.005], 0.1, 1.1);
  boot(toy, [-0.044, 0.047, 0.005], -0.1, 1.1);
  torso(toy, [0, 0.27, 0.0], 0.07, 0.06, 0.0);
  belt(toy, [0, 0.212, 0.0], 0.074, 0.0);
  // Harness: chest straps, chest reserve pack, main pack on the back.
  toy.box([0.09, 0.065, 0.042], { at: [0, 0.245, 0.075], color: GEAR, round: 0 });
  toy.box([0.014, 0.008, 0.02], { at: [0, 0.245, 0.098], color: GUN, round: 0 });
  toy.box([0.115, 0.13, 0.055], { at: [0, 0.285, -0.08], color: GEAR, round: 0 });
  bar(toy, [0.05, 0.345, 0.04], [0.022, 0.215, 0.075], 0.018, 0.006, { color: STRAP });
  bar(toy, [-0.05, 0.345, 0.04], [-0.022, 0.215, 0.075], 0.018, 0.006, { color: STRAP });
  // Risers from the shoulders up past the hands.
  const handL: V3 = [0.07, 0.465, 0.01], handR: V3 = [-0.07, 0.465, 0.01];
  rod(toy, [0.055, 0.34, 0.0], [0.07, 0.53, 0.01], 0.007, 0.007, { color: STRAP, segments: 4 });
  rod(toy, [-0.055, 0.34, 0.0], [-0.07, 0.53, 0.01], 0.007, 0.007, { color: STRAP, segments: 4 });
  // Arms raised, gripping the risers above the shoulders.
  arm(toy, [0.075, 0.335, 0.0], [0.125, 0.39, 0.02], handL, 0.029, 0.034);
  arm(toy, [-0.075, 0.335, 0.0], [-0.125, 0.39, 0.02], handR, 0.029, 0.034);
  // Head, close-fitting jump helmet with goggles pushed up on the front.
  toy.sphere(0.062, { at: [0, 0.385, 0.015], color: WHITE, segments: 10 });
  toy.dome(0.08, { at: [0, 0.39, 0.01], scale: [1, 0.95, 1.05], color: LIGHT, segments: 12 });
  toy.cylinder(0.082, 0.082, 0.018, { at: [0, 0.412, 0.01], scale: [1, 1, 1.05], color: STRAP, segments: 12 });
  for (const side of [-1, 1]) {
    toy.cylinder(0.021, 0.021, 0.018, { at: [side * 0.027, 0.43, 0.083], rot: [Math.PI / 2 - 0.45, 0, 0], color: '#7f97a6', finish: 'metal', segments: 8 });
  }
  return toy.build({ height: 0.48, radius: 0.12 });
}

/** Canopy above a paratrooper whose feet are at the origin: eight gores in alternating colours. */
function parachute(): ToyModel {
  const toy = new ToyBuilder();
  const gores = 8;
  const radius = 0.42;
  const rimY = 1.08;
  const topY = 1.42;
  // Profile of the canopy from the vent down to the hem: [horizontal radius, height].
  const ring: [number, number][] = [
    [0.07, topY - 0.005],
    [0.24, topY - 0.06],
    [0.36, topY - 0.17],
    [radius, rimY],
  ];
  const colors = ['#6f7a3c', '#efe6c8'];
  const corner = (r: number, y: number, angle: number) => new THREE.Vector3(Math.sin(angle) * r, y, Math.cos(angle) * r);
  const basis = new THREE.Matrix4();
  const euler = new THREE.Euler();
  for (let gore = 0; gore < gores; gore += 1) {
    const a0 = ((gore - 0.5) / gores) * Math.PI * 2;
    const a1 = ((gore + 0.5) / gores) * Math.PI * 2;
    const color = colors[gore % 2];
    for (let band = 0; band < ring.length - 1; band += 1) {
      const [rt, yt] = ring[band];
      const [rb, yb] = ring[band + 1];
      const tl = corner(rt, yt, a0), tr = corner(rt, yt, a1);
      const bl = corner(rb, yb, a0), br = corner(rb, yb, a1);
      const centre = tl.clone().add(tr).add(bl).add(br).multiplyScalar(0.25);
      const u = tr.clone().sub(tl).normalize();
      const down = bl.clone().add(br).multiplyScalar(0.5).sub(tl.clone().add(tr).multiplyScalar(0.5));
      const normal = new THREE.Vector3().crossVectors(down, u).normalize();
      if (normal.dot(centre.clone().setY(0)) < 0) normal.negate();
      const v = new THREE.Vector3().crossVectors(normal, u).normalize();
      const local = (p: THREE.Vector3): [number, number] => {
        const d = p.clone().sub(centre);
        return [d.dot(u), d.dot(v)];
      };
      const outline: [number, number][] = [local(bl)];
      const last = band === ring.length - 2;
      if (last) {
        // Scalloped hem: the cloth sags into a soft curve between two lines.
        for (let step = 1; step < 4; step += 1) {
          const t = step / 4;
          const p = bl.clone().lerp(br, t);
          const [x, y] = local(p);
          outline.push([x, y - Math.sin(t * Math.PI) * 0.045]);
        }
      }
      outline.push(local(br), local(tr), local(tl));
      basis.makeBasis(u, v, normal);
      euler.setFromRotationMatrix(basis, 'XYZ');
      toy.extrude(outline, 0.008, { at: centre.toArray() as V3, rot: [euler.x, euler.y, euler.z], color, finish: 'matte' });
    }
  }
  // Vent cap on top.
  toy.cylinder(0.075, 0.08, 0.012, { at: [0, topY, 0], color: colors[1], finish: 'matte', segments: 8 });
  // Suspension lines from each seam down to the two risers.
  for (let gore = 0; gore < gores; gore += 1) {
    const angle = ((gore + 0.5) / gores) * Math.PI * 2;
    const hem: V3 = [Math.sin(angle) * radius, rimY, Math.cos(angle) * radius];
    const riser: V3 = [hem[0] >= 0 ? 0.07 : -0.07, 0.53, 0.01];
    rod(toy, hem, riser, 0.0035, 0.0035, { color: '#d8d2bc', finish: 'matte', segments: 3 });
  }
  return toy.build({ height: 1.5, radius: 0.42 });
}

function colonel(): ToyModel {
  const toy = new ToyBuilder();
  plate(toy, 0.36, 0.32, 0.05);
  // Short, thick legs in tall riding boots, planted wide.
  const footL: V3 = [0.13, 0.08, 0.06], footR: V3 = [-0.13, 0.08, -0.04];
  limb(toy, [0.1, 0.42, 0.0], [0.13, 0.25, 0.04], 0.085, { color: WHITE, segments: 8 });
  limb(toy, [-0.1, 0.42, 0.0], [-0.13, 0.25, -0.03], 0.085, { color: WHITE, segments: 8 });
  toy.cylinder(0.082, 0.075, 0.2, { at: [footL[0], 0.18, footL[2] - 0.005], rot: [0.08, 0, 0], color: BOOT, segments: 12 });
  toy.cylinder(0.082, 0.075, 0.2, { at: [footR[0], 0.18, footR[2]], rot: [-0.05, 0, 0], color: BOOT, segments: 12 });
  toy.sphere(1, { at: [footL[0] + 0.01, 0.1, footL[2] + 0.04], rot: [0, 0.2, 0], scale: [0.085, 0.06, 0.13], color: BOOT, segments: 8 });
  toy.sphere(1, { at: [footR[0] - 0.01, 0.1, footR[2] + 0.04], rot: [0, -0.2, 0], scale: [0.085, 0.06, 0.13], color: BOOT, segments: 8 });
  // Coat skirt, big round belly, barrel chest.
  toy.cylinder(0.245, 0.27, 0.14, { at: [0, 0.47, 0.0], scale: [1.05, 1, 0.95], color: LIGHT, segments: 12 });
  toy.sphere(0.28, { at: [0, 0.62, 0.035], scale: [1.05, 1, 0.98], color: WHITE, segments: 12 });
  toy.sphere(0.25, { at: [0, 0.78, -0.01], scale: [1.12, 0.8, 0.86], color: WHITE, segments: 12 });
  // Belt with a brass buckle; Sam Browne strap across the chest.
  toy.cylinder(0.273, 0.278, 0.05, { at: [0, 0.54, 0.035], scale: [1.05, 1, 0.98], color: STRAP, segments: 14 });
  toy.box([0.08, 0.06, 0.02], { at: [0, 0.54, 0.31], color: BRASS, finish: 'metal', round: 0 });
  toy.torus(0.265, 0.016, { at: [0, 0.71, 0.02], rot: [0, 0, 0.7], scale: [1.05, 1, 1.05], color: STRAP, segments: 12 });
  // Coat buttons.
  for (const y of [0.64, 0.73]) toy.cylinder(0.018, 0.018, 0.012, { at: [0, y, y > 0.7 ? 0.285 : 0.31], rot: [Math.PI / 2 - (y > 0.7 ? 0.5 : 0.1), 0, 0], color: BRASS, finish: 'metal', segments: 6 });
  // Medals on the left breast: ribbons and brass discs.
  const ribbons = ['#b8282c', '#2f55a4', '#e1b52c'];
  ribbons.forEach((ribbon, index) => {
    const x = 0.07 + index * 0.05;
    const z = 0.23 - index * 0.012;
    toy.box([0.036, 0.04, 0.012], { at: [x, 0.83, z], rot: [-0.35, 0, 0], color: ribbon, finish: 'matte', round: 0 });
    toy.cylinder(0.019, 0.019, 0.01, { at: [x, 0.79, z + 0.016], rot: [Math.PI / 2 - 0.3, 0, 0], color: BRASS, finish: 'metal', segments: 8 });
  });
  // Epaulettes with fringe.
  for (const side of [-1, 1]) {
    toy.cylinder(0.075, 0.08, 0.03, { at: [side * 0.24, 0.9, -0.01], rot: [0, 0, side * -0.3], color: STRAP, segments: 12 });
    toy.cylinder(0.088, 0.088, 0.03, { at: [side * 0.247, 0.875, -0.01], rot: [0, 0, side * -0.3], color: GEAR, segments: 12 });
  }
  // Collar and big round head.
  toy.cylinder(0.11, 0.135, 0.06, { at: [0, 0.95, 0.0], color: STRAP, segments: 12 });
  toy.sphere(0.165, { at: [0, 1.08, 0.03], color: WHITE, segments: 12 });
  toy.sphere(0.04, { at: [0, 1.07, 0.2], color: WHITE, segments: 8 });
  for (const side of [-1, 1]) toy.sphere(0.017, { at: [side * 0.058, 1.105, 0.175], color: '#26221e', finish: 'matte', segments: 5 });
  // Huge handlebar moustache.
  for (const side of [-1, 1]) {
    toy.sphere(1, { at: [side * 0.065, 1.03, 0.18], rot: [0, -side * 0.6, side * 0.3], scale: [0.085, 0.036, 0.045], color: LIGHT, segments: 8 });
    toy.sphere(0.024, { at: [side * 0.145, 1.06, 0.115], color: LIGHT, segments: 6 });
  }
  // Upside-down red sand bucket as a helmet, with its rolled rim, ribs and wire handle as a chin strap.
  const rimY = 1.13;
  const bucketRed = '#d8322c', ribRed = '#b8241f';
  toy.cylinder(0.13, 0.18, 0.15, { at: [0, rimY + 0.075, 0.02], color: bucketRed, finish: 'matte', segments: 14 });
  toy.torus(0.182, 0.017, { at: [0, rimY + 0.004, 0.02], color: bucketRed, finish: 'matte', segments: 14 });
  toy.cylinder(0.166, 0.166, 0.014, { at: [0, rimY + 0.055, 0.02], color: ribRed, finish: 'matte', segments: 14 });
  toy.cylinder(0.125, 0.13, 0.012, { at: [0, rimY + 0.155, 0.02], color: ribRed, finish: 'matte', segments: 14 });
  for (const side of [-1, 1]) toy.sphere(0.018, { at: [side * 0.178, rimY + 0.03, 0.02], color: '#9aa3a8', finish: 'metal', segments: 6 });
  toy.torus(0.178, 0.006, { at: [0, rimY + 0.03, 0.02], rot: [Math.PI / 2 - 0.5, 0, 0], scale: [1, 1, 1.4], color: '#9aa3a8', finish: 'metal', segments: 8, arc: Math.PI });
  // Right arm thrust forward pointing the swagger stick; left fist on the hip.
  const stickHand: V3 = [-0.24, 0.8, 0.34];
  arm(toy, [-0.24, 0.86, 0.0], [-0.31, 0.74, 0.16], stickHand, 0.07, 0.075, 9);
  rod(toy, [-0.235, 0.75, 0.3], [-0.215, 0.98, 0.62], 0.014, 0.014, { color: GUN, segments: 8 });
  toy.sphere(0.022, { at: [-0.215, 0.98, 0.62], color: BRASS, finish: 'metal', segments: 6 });
  toy.sphere(0.02, { at: [-0.235, 0.75, 0.3], color: BRASS, finish: 'metal', segments: 6 });
  arm(toy, [0.24, 0.86, 0.0], [0.38, 0.7, -0.04], [0.285, 0.56, 0.07], 0.07, 0.075, 9);
  return toy.build({ height: 1.25, radius: 0.36 });
}

export const SOLDIER_TOYS = {
  rifleman,
  scout,
  shield,
  medic,
  bugler,
  paratrooper,
  parachute,
  colonel,
};
