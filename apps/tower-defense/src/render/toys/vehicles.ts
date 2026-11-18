import { ToyBuilder, type ToyModel } from './kit';

// Enemy vehicles: moulded in one plastic colour picked at runtime. `plastic`
// parts are white/light grey and get multiplied by that colour; tyres, tracks,
// metal and lights keep their own colours. Every toy faces +z.

type V3 = [number, number, number];

const WHITE = '#ffffff';
const LIGHT = '#dedede';
const MID = '#c4c4c4';
const DARK = '#9a9a9a';
const TYRE = '#2a2a2a';
const STEEL = '#8d949a';
const GLASS = '#34414d';
const GOLD = '#e0b04a';
const LAMP = '#ffe9a8';
const HALF = Math.PI / 2;

/** Chunky tyre on an axle along x, with a moulded hub and a metal axle cap on the outside. */
function wheel(toy: ToyBuilder, at: V3, radius: number, width: number, side: number, segments = 12): void {
  const [x, y, z] = at;
  toy.cylinder(radius, radius, width, { at, rot: [0, 0, HALF], color: TYRE, finish: 'matte', segments });
  toy.cylinder(radius * 0.55, radius * 0.6, width + 0.016, { at, rot: [0, 0, HALF], color: MID, segments: 10 });
  toy.cylinder(radius * 0.2, radius * 0.2, 0.02, { at: [x + side * (width / 2 + 0.012), y, z], rot: [0, 0, HALF], color: STEEL, finish: 'metal', segments: 6 });
}

/** Rotor of `blades` flat blades lying in the XZ plane, centred on `at` (call after `spin`). */
function rotor(toy: ToyBuilder, at: V3, length: number, chord: number, blades: number, color = DARK): void {
  const [x, y, z] = at;
  for (let index = 0; index < blades; index += 1) {
    const angle = (index / blades) * Math.PI * 2;
    toy.box([length, 0.014, chord], {
      at: [x + Math.cos(angle) * length / 2, y, z - Math.sin(angle) * length / 2],
      rot: [0, angle, 0], color, round: 0,
    });
    // Rounded blade tip.
    toy.cylinder(chord / 2, chord / 2, 0.014, {
      at: [x + Math.cos(angle) * length, y, z - Math.sin(angle) * length], color, segments: 8,
    });
  }
  toy.cylinder(chord * 0.75, chord * 0.9, 0.04, { at: [x, y, z], color: MID, segments: 10 });
  toy.dome(chord * 0.5, { at: [x, y + 0.02, z], color: WHITE, segments: 8 });
}

function jeep(): ToyModel {
  const toy = new ToyBuilder();
  const r = 0.095;
  for (const sx of [-1, 1]) for (const z of [-0.23, 0.23]) wheel(toy, [sx * 0.17, r, z], r, 0.08, sx);
  // Axles.
  for (const z of [-0.23, 0.23]) toy.cylinder(0.014, 0.014, 0.3, { at: [0, r, z], rot: [0, 0, HALF], color: STEEL, finish: 'metal', segments: 6 });
  // Chassis tub and wheel arches.
  toy.box([0.3, 0.1, 0.7], { at: [0, 0.15, 0], color: WHITE, round: 0.035 });
  toy.box([0.33, 0.025, 0.72], { at: [0, 0.2, 0], color: LIGHT, round: 0 });
  for (const sx of [-1, 1]) {
    for (const z of [-0.23, 0.23]) toy.box([0.1, 0.03, 0.22], { at: [sx * 0.17, 0.205, z], color: WHITE, round: 0 });
    // Side tub walls with a step cut-out.
    toy.box([0.03, 0.07, 0.42], { at: [sx * 0.15, 0.245, -0.09], color: WHITE, round: 0 });
    // Pegs on the arches.
    toy.cylinder(0.012, 0.012, 0.02, { at: [sx * 0.17, 0.228, -0.23], color: MID, segments: 6 });
  }
  // Bonnet, grille, bumper and headlights.
  toy.box([0.3, 0.06, 0.2], { at: [0, 0.24, 0.25], color: WHITE, round: 0.02 });
  toy.box([0.26, 0.09, 0.02], { at: [0, 0.205, 0.355], color: DARK, round: 0 });
  for (let index = -2; index <= 2; index += 1) toy.box([0.02, 0.07, 0.008], { at: [index * 0.045, 0.205, 0.367], color: MID, round: 0 });
  toy.box([0.38, 0.035, 0.035], { at: [0, 0.12, 0.375], color: DARK, round: 0 });
  for (const sx of [-1, 1]) {
    toy.cylinder(0.026, 0.026, 0.02, { at: [sx * 0.105, 0.245, 0.358], rot: [HALF, 0, 0], color: MID, segments: 8 });
    toy.cylinder(0.019, 0.019, 0.02, { at: [sx * 0.105, 0.245, 0.364], rot: [HALF, 0, 0], color: LAMP, finish: 'glow', segments: 8 });
  }
  // Windscreen frame (open, folded up).
  toy.box([0.32, 0.02, 0.022], { at: [0, 0.27, 0.14], color: MID, round: 0 });
  toy.box([0.32, 0.022, 0.022], { at: [0, 0.39, 0.13], color: MID, round: 0 });
  for (const sx of [-1, 1]) toy.box([0.022, 0.12, 0.022], { at: [sx * 0.15, 0.33, 0.135], color: MID, round: 0 });
  toy.box([0.28, 0.1, 0.006], { at: [0, 0.33, 0.135], color: GLASS, finish: 'metal', round: 0 });
  // Seats.
  for (const sx of [-1, 1]) {
    toy.box([0.1, 0.03, 0.09], { at: [sx * 0.07, 0.225, -0.01], color: DARK, round: 0 });
    toy.box([0.1, 0.09, 0.025], { at: [sx * 0.07, 0.275, -0.06], rot: [-0.15, 0, 0], color: DARK, round: 0 });
  }
  toy.box([0.26, 0.03, 0.12], { at: [0, 0.225, -0.22], color: DARK, round: 0 });
  // Driver bust: torso, head, helmet with brim, steering wheel.
  const dx = 0.07;
  toy.box([0.11, 0.1, 0.07], { at: [dx, 0.29, -0.01], color: LIGHT, round: 0.025 });
  for (const sx of [-1, 1]) toy.cylinder(0.018, 0.018, 0.09, { at: [dx + sx * 0.045, 0.3, 0.04], rot: [1.2, 0, 0], color: LIGHT, segments: 6 });
  toy.sphere(0.04, { at: [dx, 0.375, 0], color: WHITE, segments: 10 });
  toy.dome(0.05, { at: [dx, 0.385, 0], color: MID, segments: 10 });
  toy.cylinder(0.058, 0.058, 0.008, { at: [dx, 0.386, 0], color: MID, segments: 10 });
  toy.torus(0.03, 0.006, { at: [dx, 0.3, 0.075], rot: [1.0, 0, 0], color: TYRE, finish: 'matte', segments: 8 });
  // Spare tyre on the tailgate.
  toy.box([0.28, 0.08, 0.02], { at: [0, 0.2, -0.355], color: LIGHT, round: 0 });
  toy.cylinder(0.08, 0.08, 0.055, { at: [0, 0.235, -0.39], rot: [HALF, 0, 0], color: TYRE, finish: 'matte', segments: 12 });
  toy.cylinder(0.045, 0.045, 0.065, { at: [0, 0.235, -0.39], rot: [HALF, 0, 0], color: MID, segments: 10 });
  toy.cylinder(0.014, 0.014, 0.075, { at: [0, 0.235, -0.39], rot: [HALF, 0, 0], color: STEEL, finish: 'metal', segments: 6 });
  // Jerry can and whip antenna.
  toy.box([0.06, 0.08, 0.05], { at: [-0.12, 0.27, -0.29], color: DARK, round: 0 });
  toy.cylinder(0.005, 0.007, 0.3, { at: [0.135, 0.37, -0.31], rot: [-0.25, 0, 0], color: STEEL, finish: 'metal', segments: 4 });
  return toy.build({ height: 0.43, radius: 0.42, muzzle: [0, 0.3, 0.38] });
}

function tank(): ToyModel {
  const toy = new ToyBuilder();
  for (const sx of [-1, 1]) {
    const x = sx * 0.235;
    // Track belt with tread blocks.
    toy.box([0.15, 0.19, 0.93], { at: [x, 0.095, 0], color: TYRE, finish: 'matte', round: 0.085 });
    // Road wheels on the outer face, plus drive sprocket and idler.
    for (let index = 0; index < 5; index += 1) {
      const z = -0.3 + index * 0.15;
      toy.cylinder(0.06, 0.06, 0.03, { at: [sx * 0.312, 0.085, z], rot: [0, 0, HALF], color: MID, segments: 10 });
      toy.cylinder(0.018, 0.018, 0.04, { at: [sx * 0.314, 0.085, z], rot: [0, 0, HALF], color: STEEL, finish: 'metal', segments: 5 });
    }
    for (const z of [-0.41, 0.41]) toy.cylinder(0.05, 0.05, 0.03, { at: [sx * 0.312, 0.12, z], rot: [0, 0, HALF], color: DARK, segments: 8 });
    // Track guard.
    toy.box([0.17, 0.028, 0.97], { at: [x, 0.218, -0.005], color: WHITE, round: 0 });
  }
  // Hull.
  toy.box([0.34, 0.14, 0.84], { at: [0, 0.16, 0], color: LIGHT, round: 0 });
  toy.box([0.56, 0.08, 0.74], { at: [0, 0.27, -0.04], color: WHITE, round: 0.03 });
  // Sloped glacis and nose.
  toy.box([0.56, 0.025, 0.2], { at: [0, 0.255, 0.38], rot: [0.42, 0, 0], color: WHITE, round: 0 });
  toy.box([0.52, 0.06, 0.04], { at: [0, 0.19, 0.465], color: LIGHT, round: 0 });
  for (const sx of [-1, 1]) {
    toy.box([0.03, 0.03, 0.04], { at: [sx * 0.16, 0.17, 0.48], color: STEEL, finish: 'metal', round: 0 });
    toy.cylinder(0.02, 0.02, 0.02, { at: [sx * 0.22, 0.29, 0.42], rot: [HALF - 0.42, 0, 0], color: LAMP, finish: 'glow', segments: 8 });
  }
  // Engine deck: grille slats, exhausts, pegs.
  for (let index = 0; index < 4; index += 1) toy.box([0.3, 0.012, 0.025], { at: [0, 0.316, -0.27 - index * 0.04], color: DARK, round: 0 });
  for (const sx of [-1, 1]) {
    toy.cylinder(0.022, 0.022, 0.07, { at: [sx * 0.16, 0.24, -0.43], rot: [HALF, 0, 0], color: STEEL, finish: 'metal', segments: 8 });
    toy.cylinder(0.016, 0.016, 0.02, { at: [sx * 0.2, 0.32, 0.22], color: MID, segments: 6 });
  }
  // Tool box on the rear deck.
  toy.box([0.12, 0.05, 0.08], { at: [0.18, 0.335, -0.33], color: MID, round: 0 });

  // Turret (pivot at the ring).
  const ring: V3 = [0, 0.31, -0.04];
  toy.turret(ring);
  toy.cylinder(0.2, 0.2, 0.025, { at: [0, 0.322, -0.04], color: DARK, segments: 14 });
  toy.cylinder(0.165, 0.2, 0.12, { at: [0, 0.395, -0.05], scale: [1, 1, 1.12], color: WHITE, segments: 14 });
  toy.cylinder(0.15, 0.165, 0.02, { at: [0, 0.465, -0.05], scale: [1, 1, 1.12], color: LIGHT, segments: 14 });
  // Bustle at the back.
  toy.box([0.24, 0.08, 0.1], { at: [0, 0.4, -0.25], color: LIGHT, round: 0 });
  // Hatch with handle, and a periscope.
  toy.cylinder(0.065, 0.065, 0.025, { at: [-0.06, 0.485, -0.09], color: MID, segments: 12 });
  toy.box([0.06, 0.012, 0.012], { at: [-0.06, 0.502, -0.09], color: STEEL, finish: 'metal', round: 0 });
  toy.box([0.04, 0.04, 0.03], { at: [0.08, 0.49, 0.02], color: DARK, round: 0 });
  // Plain raised discs as markings.
  for (const sx of [-1, 1]) toy.cylinder(0.05, 0.05, 0.012, { at: [sx * 0.19, 0.395, -0.06], rot: [0, 0, HALF + sx * 0.25], color: DARK, segments: 12 });
  // Mantlet and stubby barrel.
  toy.box([0.17, 0.1, 0.08], { at: [0, 0.39, 0.16], color: LIGHT, round: 0 });
  toy.cylinder(0.034, 0.04, 0.3, { at: [0, 0.39, 0.33], rot: [HALF, 0, 0], color: WHITE, segments: 12 });
  toy.cylinder(0.05, 0.05, 0.07, { at: [0, 0.39, 0.5], rot: [HALF, 0, 0], color: MID, segments: 12 });
  toy.cylinder(0.024, 0.024, 0.072, { at: [0, 0.39, 0.5], rot: [HALF, 0, 0], color: TYRE, finish: 'matte', segments: 8 });
  // Roof machine gun.
  toy.cylinder(0.012, 0.012, 0.16, { at: [0.08, 0.53, 0.06], rot: [HALF, 0, 0], color: STEEL, finish: 'metal', segments: 6 });
  toy.box([0.03, 0.04, 0.04], { at: [0.08, 0.51, -0.01], color: STEEL, finish: 'metal', round: 0 });
  toy.body();
  return toy.build({ height: 0.53, radius: 0.55, muzzle: [0, 0.39, 0.54] });
}

function helicopter(): ToyModel {
  const toy = new ToyBuilder();
  // Skids and struts.
  for (const sx of [-1, 1]) {
    toy.cylinder(0.017, 0.017, 0.52, { at: [sx * 0.15, 0.017, 0.0], rot: [HALF, 0, 0], color: MID, segments: 6 });
    toy.cylinder(0.017, 0.017, 0.06, { at: [sx * 0.15, 0.04, 0.275], rot: [0.9, 0, 0], color: MID, segments: 6 });
    for (const z of [-0.12, 0.16]) toy.cylinder(0.014, 0.014, 0.15, { at: [sx * 0.125, 0.09, z], rot: [0, 0, sx * 0.4], color: DARK, segments: 6 });
  }
  // Cabin and bubble canopy.
  toy.sphere(0.17, { at: [0, 0.27, -0.02], scale: [0.95, 1, 1.35], color: WHITE, segments: 14 });
  toy.sphere(0.14, { at: [0, 0.3, 0.13], scale: [0.95, 0.95, 1.15], color: GLASS, finish: 'metal', segments: 12 });
  // Canopy frame bar.
  toy.torus(0.14, 0.009, { at: [0, 0.3, 0.115], rot: [0, 0, HALF], scale: [0.95, 0.95, 1.15], color: MID, segments: 10, arc: Math.PI });
  // Engine housing, mast and exhausts.
  toy.box([0.17, 0.09, 0.28], { at: [0, 0.43, -0.07], color: LIGHT, round: 0.04 });
  toy.cylinder(0.025, 0.035, 0.07, { at: [0, 0.5, 0.0], color: DARK, segments: 8 });
  for (const sx of [-1, 1]) toy.cylinder(0.022, 0.022, 0.06, { at: [sx * 0.06, 0.44, -0.23], rot: [HALF, 0, 0], color: STEEL, finish: 'metal', segments: 8 });
  // Stub wings with rocket pods.
  toy.box([0.52, 0.025, 0.09], { at: [0, 0.24, -0.06], color: LIGHT, round: 0 });
  for (const sx of [-1, 1]) {
    toy.cylinder(0.035, 0.035, 0.16, { at: [sx * 0.24, 0.2, -0.04], rot: [HALF, 0, 0], color: MID, segments: 10 });
    toy.cylinder(0.028, 0.028, 0.164, { at: [sx * 0.24, 0.2, -0.04], rot: [HALF, 0, 0], color: TYRE, finish: 'matte', segments: 8 });
  }
  // Nose gun.
  toy.cylinder(0.012, 0.012, 0.14, { at: [0, 0.13, 0.27], rot: [HALF, 0, 0], color: STEEL, finish: 'metal', segments: 6 });
  toy.sphere(0.03, { at: [0, 0.14, 0.2], color: DARK, segments: 8 });
  // Tail boom, fin and stabiliser.
  toy.cylinder(0.03, 0.075, 0.52, { at: [0, 0.31, -0.42], rot: [-HALF, 0, 0], color: WHITE, segments: 10 });
  toy.extrude([[0, 0], [0.12, 0], [0.16, 0.2], [0.07, 0.2]], 0.02, { at: [0, 0.3, -0.57], rot: [0, HALF, 0], color: WHITE });
  toy.box([0.24, 0.016, 0.06], { at: [0, 0.32, -0.56], color: LIGHT, round: 0 });
  toy.sphere(0.012, { at: [0, 0.505, -0.72], color: '#ff5a4a', finish: 'glow', segments: 6 });
  // Tail rotor hub.
  toy.cylinder(0.02, 0.02, 0.03, { at: [0.02, 0.44, -0.68], rot: [0, 0, HALF], color: DARK, segments: 8 });
  toy.spin([0.045, 0.44, -0.68], [1, 0, 0], 9);
  toy.box([0.01, 0.2, 0.03], { at: [0.045, 0.44, -0.68], color: DARK, round: 0 });
  toy.box([0.01, 0.03, 0.2], { at: [0.045, 0.44, -0.68], color: DARK, round: 0 });
  toy.cylinder(0.018, 0.018, 0.02, { at: [0.045, 0.44, -0.68], rot: [0, 0, HALF], color: MID, segments: 8 });
  // Main rotor.
  toy.spin([0, 0.54, 0.0], [0, 1, 0], 6);
  rotor(toy, [0, 0.54, 0], 0.5, 0.06, 3);
  toy.body();
  return toy.build({ height: 0.57, radius: 0.5, muzzle: [0, 0.13, 0.35] });
}

function transport(): ToyModel {
  const toy = new ToyBuilder();
  // Sponsons with chunky landing wheels.
  for (const sx of [-1, 1]) {
    toy.box([0.16, 0.17, 1.0], { at: [sx * 0.29, 0.25, -0.02], color: LIGHT, round: 0.06 });
    for (const z of [0.38, -0.42]) {
      wheel(toy, [sx * 0.31, 0.105, z], 0.105, 0.09, sx, 14);
      toy.box([0.03, 0.08, 0.04], { at: [sx * 0.31, 0.18, z], color: DARK, round: 0 });
    }
  }
  // Fuselage.
  toy.box([0.5, 0.5, 1.7], { at: [0, 0.43, -0.05], color: WHITE, round: 0.17 });
  // Nose with cockpit glass.
  toy.sphere(0.25, { at: [0, 0.43, 0.8], scale: [1, 1, 0.75], color: WHITE, segments: 14 });
  for (const sx of [-1, 1]) toy.box([0.17, 0.12, 0.012], { at: [sx * 0.095, 0.55, 0.915], rot: [-0.75, sx * 0.35, 0], color: GLASS, finish: 'matte', round: 0 });
  for (const sx of [-1, 1]) toy.box([0.012, 0.1, 0.13], { at: [sx * 0.252, 0.52, 0.76], color: GLASS, finish: 'matte', round: 0 });
  // Round windows along both sides, and a door.
  for (const sx of [-1, 1]) {
    for (let index = 0; index < 6; index += 1) {
      const z = 0.45 - index * 0.19;
      toy.cylinder(0.05, 0.05, 0.012, { at: [sx * 0.25, 0.5, z], rot: [0, 0, HALF], color: MID, segments: 8 });
      toy.cylinder(0.038, 0.038, 0.02, { at: [sx * 0.25, 0.5, z], rot: [0, 0, HALF], color: GLASS, finish: 'metal', segments: 8 });
    }
  }
  toy.box([0.01, 0.24, 0.15], { at: [0.252, 0.34, 0.62], color: DARK, round: 0 });
  // Spine, front pylon, tall rear pylon.
  toy.box([0.2, 0.08, 1.3], { at: [0, 0.69, -0.05], color: LIGHT, round: 0 });
  toy.box([0.2, 0.14, 0.32], { at: [0, 0.73, 0.68], color: WHITE, round: 0.05 });
  toy.box([0.26, 0.24, 0.42], { at: [0, 0.76, -0.75], color: WHITE, round: 0.06 });
  // Engine pods beside the rear pylon.
  for (const sx of [-1, 1]) {
    toy.cylinder(0.07, 0.07, 0.38, { at: [sx * 0.22, 0.72, -0.62], rot: [HALF, 0, 0], color: LIGHT, segments: 12 });
    toy.cylinder(0.075, 0.075, 0.03, { at: [sx * 0.22, 0.72, -0.43], rot: [HALF, 0, 0], color: DARK, segments: 12 });
    toy.cylinder(0.045, 0.05, 0.05, { at: [sx * 0.22, 0.72, -0.83], rot: [HALF, 0, 0], color: STEEL, finish: 'metal', segments: 10 });
  }
  // Rear ramp, lowered halfway, with side rails.
  toy.box([0.44, 0.035, 0.36], { at: [0, 0.14, -1.02], rot: [-0.45, 0, 0], color: MID, round: 0 });
  for (let index = 0; index < 4; index += 1) toy.box([0.38, 0.008, 0.02], { at: [0, 0.164 - index * 0.032, -0.92 - index * 0.07], rot: [-0.45, 0, 0], color: DARK, round: 0 });
  toy.box([0.36, 0.3, 0.01], { at: [0, 0.34, -0.9], color: '#1e1e1e', finish: 'matte', round: 0 });
  for (const sx of [-1, 1]) toy.cylinder(0.012, 0.012, 0.3, { at: [sx * 0.2, 0.26, -1.02], rot: [-0.45 - HALF, 0, 0], color: STEEL, finish: 'metal', segments: 4 });
  // Lights.
  toy.sphere(0.02, { at: [0, 0.3, 0.955], color: LAMP, finish: 'glow', segments: 6 });
  toy.sphere(0.015, { at: [0.27, 0.6, 0.0], color: '#59ff7a', finish: 'glow', segments: 6 });
  toy.sphere(0.015, { at: [-0.27, 0.6, 0.0], color: '#ff5a4a', finish: 'glow', segments: 6 });
  // Rotor masts.
  toy.cylinder(0.04, 0.05, 0.06, { at: [0, 0.83, 0.7], color: DARK, segments: 10 });
  toy.cylinder(0.04, 0.05, 0.06, { at: [0, 0.91, -0.78], color: DARK, segments: 10 });
  // Twin rotors turning in opposite directions.
  toy.spin([0, 0.87, 0.7], [0, 1, 0], 4.5);
  rotor(toy, [0, 0.87, 0.7], 0.66, 0.09, 3);
  toy.spin([0, 0.95, -0.78], [0, 1, 0], -4.5);
  rotor(toy, [0, 0.95, -0.78], 0.66, 0.09, 3);
  toy.body();
  return toy.build({ height: 0.99, radius: 1.15, muzzle: [0, 0.3, 1.0] });
}

function general(): ToyModel {
  const toy = new ToyBuilder();
  const deck = 0.33;
  // Six driving wheels with dark tyres, tinted centres, crank pins and a coupling rod.
  const wheelZ = [0.42, 0.06, -0.3];
  for (const sx of [-1, 1]) {
    for (const z of wheelZ) {
      toy.cylinder(0.15, 0.15, 0.055, { at: [sx * 0.27, 0.15, z], rot: [0, 0, HALF], color: TYRE, finish: 'matte', segments: 14 });
      toy.cylinder(0.1, 0.1, 0.066, { at: [sx * 0.27, 0.15, z], rot: [0, 0, HALF], color: MID, segments: 10 });
      // Counterweight wedge.
      toy.box([0.07, 0.07, 0.07], { at: [sx * 0.302, 0.115, z], rot: [Math.PI / 4, 0, 0], color: DARK, round: 0 });
      toy.cylinder(0.025, 0.025, 0.02, { at: [sx * 0.31, 0.15, z], rot: [0, 0, HALF], color: STEEL, finish: 'metal', segments: 8 });
      toy.cylinder(0.014, 0.014, 0.05, { at: [sx * 0.315, 0.21, z], rot: [0, 0, HALF], color: STEEL, finish: 'metal', segments: 6 });
    }
    toy.box([0.018, 0.03, 0.8], { at: [sx * 0.33, 0.21, 0.06], color: STEEL, finish: 'metal', round: 0 });
    // Cylinder and piston rod to the front wheel.
    toy.cylinder(0.065, 0.065, 0.24, { at: [sx * 0.25, 0.27, 0.72], rot: [HALF, 0, 0], color: LIGHT, segments: 12 });
    toy.cylinder(0.07, 0.07, 0.02, { at: [sx * 0.25, 0.27, 0.6], rot: [HALF, 0, 0], color: DARK, segments: 12 });
    toy.cylinder(0.012, 0.012, 0.22, { at: [sx * 0.31, 0.24, 0.55], rot: [HALF + 0.15, 0, 0], color: STEEL, finish: 'metal', segments: 6 });
  }
  // Frame and footplate.
  toy.box([0.3, 0.12, 1.55], { at: [0, 0.22, 0.05], color: DARK, round: 0 });
  toy.box([0.58, 0.04, 1.72], { at: [0, deck - 0.02, 0.0], color: WHITE, round: 0 });
  // Buffer beam, buffers and cow-catcher.
  toy.box([0.6, 0.08, 0.05], { at: [0, 0.29, 0.87], color: LIGHT, round: 0 });
  for (const sx of [-1, 1]) {
    toy.cylinder(0.022, 0.022, 0.06, { at: [sx * 0.2, 0.29, 0.92], rot: [HALF, 0, 0], color: STEEL, finish: 'metal', segments: 8 });
    toy.cylinder(0.038, 0.038, 0.015, { at: [sx * 0.2, 0.29, 0.955], rot: [HALF, 0, 0], color: STEEL, finish: 'metal', segments: 10 });
  }
  toy.extrude([[0, 0.02], [0, 0.26], [0.2, 0.02]], 0.5, { at: [0, 0, 0.89], rot: [0, -HALF, 0], color: DARK });
  for (let index = -2; index <= 2; index += 1) {
    toy.box([0.025, 0.012, 0.3], { at: [index * 0.1, 0.148, 0.995], rot: [0.87, 0, 0], color: LIGHT, round: 0 });
  }
  // Boiler with bands, smokebox and door.
  const boilerY = deck + 0.2;
  toy.cylinder(0.2, 0.2, 0.92, { at: [0, boilerY, 0.33], rot: [HALF, 0, 0], color: WHITE, segments: 16 });
  for (const z of [0.0, 0.3, 0.6]) toy.cylinder(0.207, 0.207, 0.025, { at: [0, boilerY, z], rot: [HALF, 0, 0], color: GOLD, finish: 'metal', segments: 16 });
  toy.cylinder(0.21, 0.21, 0.12, { at: [0, boilerY, 0.82], rot: [HALF, 0, 0], color: DARK, segments: 16 });
  toy.cylinder(0.17, 0.18, 0.03, { at: [0, boilerY, 0.89], rot: [HALF, 0, 0], color: LIGHT, segments: 16 });
  toy.cylinder(0.025, 0.025, 0.03, { at: [0, boilerY, 0.91], rot: [HALF, 0, 0], color: STEEL, finish: 'metal', segments: 8 });
  // Headlamp.
  toy.box([0.1, 0.09, 0.09], { at: [0, boilerY + 0.25, 0.83], color: LIGHT, round: 0 });
  toy.cylinder(0.034, 0.034, 0.02, { at: [0, boilerY + 0.25, 0.88], rot: [HALF, 0, 0], color: LAMP, finish: 'glow', segments: 10 });
  // Balloon funnel.
  toy.lathe([[0.075, 0], [0.065, 0.14], [0.08, 0.2], [0.13, 0.3], [0.13, 0.34], [0.1, 0.345], [0, 0.345]], {
    at: [0, boilerY + 0.15, 0.68], color: LIGHT, segments: 16,
  });
  toy.cylinder(0.1, 0.1, 0.01, { at: [0, boilerY + 0.493, 0.68], color: TYRE, finish: 'matte', segments: 12 });
  // Steam dome, sand dome, bell and whistle.
  toy.cylinder(0.085, 0.095, 0.08, { at: [0, boilerY + 0.2, 0.32], color: WHITE, segments: 12 });
  toy.dome(0.085, { at: [0, boilerY + 0.24, 0.32], color: WHITE, segments: 12 });
  toy.cylinder(0.065, 0.075, 0.05, { at: [0, boilerY + 0.19, 0.1], color: WHITE, segments: 12 });
  toy.dome(0.065, { at: [0, boilerY + 0.215, 0.1], color: WHITE, segments: 12 });
  toy.lathe([[0.05, 0], [0.04, 0.02], [0.03, 0.06], [0.012, 0.075], [0, 0.08]], { at: [0, boilerY + 0.19, 0.5], color: GOLD, finish: 'metal', segments: 10 });
  toy.cylinder(0.006, 0.006, 0.05, { at: [0, boilerY + 0.19, 0.5], color: STEEL, finish: 'metal', segments: 4 });
  toy.cylinder(0.014, 0.014, 0.08, { at: [0.06, boilerY + 0.22, -0.04], color: GOLD, finish: 'metal', segments: 6 });
  // Handrails along the boiler.
  for (const sx of [-1, 1]) toy.cylinder(0.007, 0.007, 0.8, { at: [sx * 0.22, boilerY + 0.06, 0.38], rot: [HALF, 0, 0], color: STEEL, finish: 'metal', segments: 4 });
  // Open cab: spectacle plate, low side walls, corner posts, rear bunker.
  const cabZ = -0.47;
  toy.box([0.58, 0.4, 0.05], { at: [0, deck + 0.2, -0.14], color: WHITE, round: 0 });
  for (const sx of [-1, 1]) {
    toy.cylinder(0.045, 0.045, 0.024, { at: [sx * 0.15, deck + 0.29, -0.112], rot: [HALF, 0, 0], color: GLASS, finish: 'metal', segments: 10 });
    toy.cylinder(0.056, 0.056, 0.012, { at: [sx * 0.15, deck + 0.29, -0.112], rot: [HALF, 0, 0], color: MID, segments: 10 });
    toy.box([0.04, 0.22, 0.56], { at: [sx * 0.27, deck + 0.11, cabZ], color: WHITE, round: 0 });
    toy.box([0.05, 0.03, 0.58], { at: [sx * 0.27, deck + 0.235, cabZ], color: LIGHT, round: 0 });
    toy.box([0.04, 0.42, 0.04], { at: [sx * 0.27, deck + 0.21, -0.18], color: LIGHT, round: 0 });
  }
  // Coal bunker at the back.
  toy.box([0.58, 0.24, 0.16], { at: [0, deck + 0.12, -0.8], color: LIGHT, round: 0 });
  for (const [x, z] of [[-0.15, -0.79], [0.0, -0.81], [0.15, -0.78], [-0.07, -0.8], [0.08, -0.8]] as const) {
    toy.sphere(0.06, { at: [x, deck + 0.24, z], scale: [1, 0.6, 0.9], color: '#1f1f1f', finish: 'matte', segments: 6 });
  }
  toy.cylinder(0.018, 0.018, 0.04, { at: [0, 0.29, -0.89], rot: [HALF, 0, 0], color: STEEL, finish: 'metal', segments: 6 });

  // The General, standing in the cab facing forward.
  const gz = -0.47;
  const foot = deck + 0.07;
  toy.box([0.26, 0.07, 0.2], { at: [0, deck + 0.035, gz], color: DARK, round: 0 });
  for (const sx of [-1, 1]) {
    toy.cylinder(0.035, 0.032, 0.2, { at: [sx * 0.045, foot + 0.1, gz], color: MID, segments: 8 });
    toy.box([0.05, 0.03, 0.08], { at: [sx * 0.045, foot + 0.015, gz + 0.015], color: TYRE, finish: 'matte', round: 0 });
  }
  toy.cylinder(0.09, 0.1, 0.12, { at: [0, foot + 0.24, gz], scale: [1, 1, 0.75], color: LIGHT, segments: 12 });
  toy.box([0.18, 0.18, 0.12], { at: [0, foot + 0.37, gz], color: WHITE, round: 0.04 });
  toy.box([0.19, 0.025, 0.13], { at: [0, foot + 0.3, gz], color: DARK, round: 0 });
  toy.box([0.025, 0.028, 0.02], { at: [0, foot + 0.3, gz + 0.065], color: GOLD, finish: 'metal', round: 0 });
  for (let index = 0; index < 3; index += 1) toy.sphere(0.009, { at: [0.025, foot + 0.34 + index * 0.035, gz + 0.062], color: GOLD, finish: 'metal', segments: 6 });
  // Gold epaulettes.
  for (const sx of [-1, 1]) {
    toy.box([0.07, 0.022, 0.08], { at: [sx * 0.1, foot + 0.46, gz], color: GOLD, finish: 'metal', round: 0 });
    toy.box([0.075, 0.02, 0.085], { at: [sx * 0.1, foot + 0.44, gz], color: GOLD, finish: 'metal', round: 0 });
  }
  // Left arm down on the hip, right arm raised with a sabre.
  toy.cylinder(0.03, 0.026, 0.17, { at: [-0.115, foot + 0.35, gz + 0.01], rot: [0, 0, -0.35], color: LIGHT, segments: 8 });
  toy.cylinder(0.026, 0.03, 0.2, { at: [0.15, foot + 0.55, gz + 0.02], rot: [-0.25, 0, -0.35], color: LIGHT, segments: 8 });
  toy.sphere(0.034, { at: [0.185, foot + 0.65, gz + 0.045], color: WHITE, segments: 8 });
  toy.box([0.012, 0.22, 0.028], { at: [0.2, foot + 0.77, gz + 0.06], rot: [0.15, 0, -0.15], color: '#d8dde2', finish: 'metal', round: 0 });
  toy.box([0.06, 0.012, 0.02], { at: [0.19, foot + 0.665, gz + 0.045], color: GOLD, finish: 'metal', round: 0 });
  // Head, moustache, peaked officer's cap.
  toy.cylinder(0.03, 0.035, 0.04, { at: [0, foot + 0.47, gz], color: WHITE, segments: 8 });
  toy.sphere(0.06, { at: [0, foot + 0.53, gz], color: WHITE, segments: 12 });
  toy.box([0.06, 0.012, 0.012], { at: [0, foot + 0.51, gz + 0.056], color: TYRE, finish: 'matte', round: 0 });
  toy.cylinder(0.062, 0.058, 0.035, { at: [0, foot + 0.585, gz], color: LIGHT, segments: 12 });
  toy.cylinder(0.078, 0.066, 0.035, { at: [0, foot + 0.615, gz - 0.008], scale: [1, 1, 1.05], color: WHITE, segments: 14 });
  toy.cylinder(0.063, 0.063, 0.012, { at: [0, foot + 0.575, gz], color: TYRE, finish: 'matte', segments: 12 });
  toy.box([0.09, 0.008, 0.045], { at: [0, foot + 0.572, gz + 0.065], rot: [0.25, 0, 0], color: TYRE, finish: 'matte', round: 0 });
  toy.box([0.025, 0.022, 0.006], { at: [0, foot + 0.605, gz + 0.072], color: GOLD, finish: 'metal', round: 0 });
  // Flag on a pole at the rear corner of the cab.
  const poleX = -0.25;
  const poleZ = -0.74;
  toy.cylinder(0.012, 0.012, 0.98, { at: [poleX, deck + 0.24 + 0.49, poleZ], color: STEEL, finish: 'metal', segments: 6 });
  toy.sphere(0.022, { at: [poleX, 1.3, poleZ], color: GOLD, finish: 'metal', segments: 8 });
  const flagTop = 1.26;
  const panels = [0.45, -0.45, 0.45];
  let fz = poleZ;
  let fx = poleX;
  for (const yaw of panels) {
    const length = 0.12;
    const cx = fx - Math.sin(yaw) * length / 2;
    const cz = fz - Math.cos(yaw) * length / 2;
    toy.box([0.012, 0.19, length + 0.006], { at: [cx, flagTop - 0.095, cz], rot: [0, yaw, 0], color: '#c8262a', finish: 'matte', round: 0 });
    fx -= Math.sin(yaw) * length;
    fz -= Math.cos(yaw) * length;
  }
  return toy.build({ height: 1.3, radius: 1.0, muzzle: [0.2, 1.0, -0.4] });
}

export const VEHICLE_TOYS = {
  jeep,
  tank,
  helicopter,
  transport,
  general,
};
