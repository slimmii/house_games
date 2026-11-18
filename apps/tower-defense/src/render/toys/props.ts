import { ToyBuilder, type ToyModel } from './kit';

// Props keep their own colours (never tinted). Projectiles are centred on the
// origin and point along +z.

const HALF = Math.PI / 2;
const CARD = '#b98a55';
const CARD_EDGE = '#d2a874';
const CARD_FLOOR = '#c79a62';

function fort(): ToyModel {
  const toy = new ToyBuilder();
  const W = 2.6;
  const D = 1.9;
  const H = 0.9;
  const t = 0.05;
  const hx = W / 2;
  const hz = D / 2;
  const door = 0.52;
  const doorH = 0.56;
  const card = { color: CARD, finish: 'matte' as const, round: 0 };

  // Cardboard floor and walls.
  toy.box([W - 0.04, 0.016, D - 0.04], { at: [0, 0.008, 0], color: CARD_FLOOR, finish: 'matte', round: 0 });
  toy.box([W, H, t], { at: [0, H / 2, -hz + t / 2], ...card });
  for (const sx of [-1, 1]) toy.box([t, H, D - 2 * t], { at: [sx * (hx - t / 2), H / 2, 0], ...card });
  const segment = (W - door) / 2;
  for (const sx of [-1, 1]) toy.box([segment, H, t], { at: [sx * (door / 2 + segment / 2), H / 2, hz - t / 2], ...card });
  toy.box([door, H - doorH, t], { at: [0, doorH + (H - doorH) / 2, hz - t / 2], ...card });
  // Lighter cut edges along the wall tops.
  toy.box([W, 0.012, t + 0.004], { at: [0, H, -hz + t / 2], color: CARD_EDGE, finish: 'matte', round: 0 });
  toy.box([W, 0.012, t + 0.004], { at: [0, H, hz - t / 2], color: CARD_EDGE, finish: 'matte', round: 0 });
  for (const sx of [-1, 1]) toy.box([t + 0.004, 0.012, D], { at: [sx * (hx - t / 2), H, 0], color: CARD_EDGE, finish: 'matte', round: 0 });

  // Cut-out battlements (merlons) on every wall, skipping the corners that carry the cup tower.
  const merlon = (x: number, z: number, alongX: boolean) => {
    toy.box(alongX ? [0.2, 0.15, t] : [t, 0.15, 0.2], { at: [x, H + 0.075, z], ...card });
  };
  for (let index = 0; index < 6; index += 1) {
    const x = -1.05 + index * 0.42;
    merlon(x, -hz + t / 2, true);
    if (x < 0.95) merlon(x, hz - t / 2, true);
  }
  for (const sx of [-1, 1]) for (let index = 0; index < 4; index += 1) {
    const z = -0.6 + index * 0.4;
    if (sx > 0 && z > 0.5) continue;
    merlon(sx * (hx - t / 2), z, false);
  }

  // Crayon paint on the outside: battlement stripe, windows with crosses, a door frame, bricks.
  const paint = (size: [number, number, number], at: [number, number, number], color: string) => {
    toy.box(size, { at, color, finish: 'matte', round: 0 });
  };
  const fz = hz + 0.003;
  paint([W - 0.04, 0.035, 0.004], [0, H - 0.07, fz], '#d8402f');
  paint([W - 0.04, 0.035, 0.004], [0, H - 0.07, -fz], '#d8402f');
  for (const sx of [-1, 1]) {
    paint([0.004, 0.035, D - 0.04], [sx * (hx + 0.003), H - 0.07, 0], '#d8402f');
    // Front windows.
    paint([0.26, 0.24, 0.004], [sx * 0.78, 0.5, fz], '#2f5fb8');
    paint([0.3, 0.025, 0.006], [sx * 0.78, 0.5, fz + 0.001], '#f4d24a');
    paint([0.025, 0.28, 0.006], [sx * 0.78, 0.5, fz + 0.001], '#f4d24a');
    // Side windows (arched look: window + round top).
    paint([0.004, 0.22, 0.2], [sx * (hx + 0.003), 0.45, -0.45], '#2f5fb8');
    toy.cylinder(0.1, 0.1, 0.004, { at: [sx * (hx + 0.003), 0.56, -0.45], rot: [0, 0, HALF], color: '#2f5fb8', finish: 'matte', segments: 10 });
    // Door frame strokes.
    paint([0.035, doorH + 0.03, 0.004], [sx * (door / 2 + 0.03), doorH / 2, fz], '#3a9a4a');
    // Bricks.
    for (const [x, y] of [[0.42, 0.22], [0.62, 0.3], [1.08, 0.24], [0.95, 0.72], [0.45, 0.7]] as const) {
      paint([0.12, 0.05, 0.004], [sx * x, y, fz], '#c0563a');
    }
  }
  paint([door + 0.1, 0.035, 0.004], [0, doorH + 0.02, fz], '#3a9a4a');
  // Back wall windows.
  for (const x of [-0.7, 0, 0.7]) paint([0.22, 0.2, 0.004], [x, 0.5, -fz], '#2f5fb8');

  // Drawbridge flap lying in front of the doorway, with strings up to the lintel.
  toy.box([door, 0.02, 0.46], { at: [0, 0.03, hz + 0.24], rot: [0.06, 0, 0], color: CARD_EDGE, finish: 'matte', round: 0 });
  for (const sx of [-1, 1]) {
    toy.cylinder(0.006, 0.006, 0.75, { at: [sx * 0.23, 0.33, hz + 0.235], rot: [-0.68, 0, 0], color: '#f0ece0', finish: 'matte', segments: 4 });
  }

  // Mustard cushion leaning against the left wall.
  toy.box([0.24, 0.86, 1.05], { at: [-1.55, 0.42, 0.25], rot: [0, 0, -0.32], color: '#e0a332', finish: 'matte', round: 0.11 });
  for (const z of [0.0, 0.5]) toy.sphere(0.03, { at: [-1.68, 0.42, z], scale: [0.6, 1, 1], color: '#b87d1e', finish: 'matte', segments: 6 });
  // Coral cushion laid across the back-right corner as a roof.
  toy.box([1.0, 0.22, 0.9], { at: [0.85, H + 0.15 + 0.11, -0.52], rot: [0, 0.08, 0.04], color: '#e8705a', finish: 'matte', round: 0.1 });
  toy.sphere(0.035, { at: [0.85, H + 0.37, -0.52], scale: [1, 0.5, 1], color: '#c4523e', finish: 'matte', segments: 6 });

  // Blue blanket draped over the right wall.
  const blanket = '#4f7fc9';
  toy.box([0.16, 0.03, 0.72], { at: [hx - t / 2, H + 0.165, 0.18], color: blanket, finish: 'matte', round: 0.012 });
  toy.box([0.03, 0.78, 0.72], { at: [hx + 0.08, 0.6, 0.18], rot: [0, 0, 0.09], color: blanket, finish: 'matte', round: 0.012 });
  toy.box([0.03, 0.18, 0.74], { at: [hx + 0.155, 0.12, 0.18], rot: [0, 0, 0.5], color: blanket, finish: 'matte', round: 0.012 });
  toy.box([0.03, 0.5, 0.72], { at: [hx - 0.09, 0.82, 0.18], rot: [0, 0, 0.06], color: blanket, finish: 'matte', round: 0.012 });
  for (const z of [-0.06, 0.18, 0.42]) {
    toy.box([0.036, 0.78, 0.05], { at: [hx + 0.08, 0.6, z], rot: [0, 0, 0.09], color: '#f2efe6', finish: 'matte', round: 0 });
  }

  // Pencil flagpole in the back-left corner, stuck in a lump of modelling clay.
  const px = -1.08;
  const pz = -0.72;
  toy.sphere(0.11, { at: [px, 0.04, pz], scale: [1, 0.55, 1], color: '#4cae5c', finish: 'matte', segments: 10 });
  toy.cone(0.042, 0.1, { at: [px, 0.08, pz], rot: [Math.PI, 0, 0], color: '#e9c896', finish: 'matte', segments: 6 });
  toy.cylinder(0.043, 0.043, 1.3, { at: [px, 0.78, pz], color: '#f2bf22', finish: 'matte', segments: 6 });
  toy.cylinder(0.046, 0.046, 0.07, { at: [px, 1.465, pz], color: '#c9ccd0', finish: 'metal', segments: 10 });
  toy.cylinder(0.044, 0.044, 0.06, { at: [px, 1.53, pz], color: '#f08fa8', finish: 'matte', segments: 10 });
  toy.dome(0.044, { at: [px, 1.56, pz], scale: [1, 0.4, 1], color: '#f08fa8', finish: 'matte', segments: 10 });
  toy.extrude([[0, 0], [0.5, 0.15], [0, 0.3]], 0.012, { at: [px + 0.04, 1.08, pz], color: '#d6312b', finish: 'matte' });

  // Paper-cup watchtower on the front-right corner.
  const cx = hx - 0.17;
  const cz = hz - 0.17;
  toy.lathe([[0.17, 0], [0.125, 0.34], [0, 0.34]], { at: [cx, H, cz], color: '#f5f2ea', finish: 'matte', segments: 16 });
  toy.cylinder(0.153, 0.16, 0.05, { at: [cx, H + 0.1, cz], color: '#d8402f', finish: 'matte', segments: 16 });
  toy.cylinder(0.137, 0.143, 0.03, { at: [cx, H + 0.25, cz], color: '#2f5fb8', finish: 'matte', segments: 16 });
  toy.box([0.09, 0.07, 0.03], { at: [cx, H + 0.18, cz + 0.14], rot: [-0.13, 0, 0], color: '#2a2622', finish: 'matte', round: 0 });
  toy.cylinder(0.006, 0.006, 0.2, { at: [cx, H + 0.44, cz], color: '#8a6a3b', finish: 'matte', segments: 4 });
  toy.extrude([[0, 0], [0.12, 0.04], [0, 0.08]], 0.008, { at: [cx, H + 0.46, cz], color: '#f4d24a', finish: 'matte' });

  // String of fairy lights swagged along the front wall.
  const bulbs = ['#ffd84a', '#ff5a7a', '#5ad1ff', '#7aff6a'];
  const lightZ = hz + 0.03;
  const swags: [number, number][] = [[-1.25, -0.3], [0.3, 1.25]];
  let count = 0;
  for (const [from, to] of swags) {
    const steps = 6;
    let previous: [number, number] | null = null;
    for (let index = 0; index <= steps; index += 1) {
      const f = index / steps;
      const x = from + (to - from) * f;
      const y = H - 0.02 - Math.sin(f * Math.PI) * 0.2;
      if (previous) {
        const dx = x - previous[0];
        const dy = y - previous[1];
        const length = Math.hypot(dx, dy);
        toy.cylinder(0.005, 0.005, length, {
          at: [(x + previous[0]) / 2, (y + previous[1]) / 2, lightZ], rot: [0, 0, -Math.atan2(dx, dy)],
          color: '#2d3a2a', finish: 'matte', segments: 3,
        });
      }
      if (index > 0 && index < steps) {
        toy.sphere(0.024, { at: [x, y - 0.025, lightZ], color: bulbs[count % bulbs.length], finish: 'glow', segments: 6 });
        count += 1;
      }
      previous = [x, y];
    }
  }
  return toy.build({ height: 1.6, radius: 1.6, muzzle: [0, 1.0, hz] });
}

function cork(): ToyModel {
  const toy = new ToyBuilder();
  // Narrow end goes in the barrel; the wide end leads.
  toy.lathe([[0, -0.05], [0.036, -0.05], [0.049, 0.044], [0.044, 0.05], [0, 0.05]], { rot: [HALF, 0, 0], color: '#c9965c', finish: 'matte', segments: 14 });
  toy.box([0.006, 0.006, 0.04], { at: [0, 0, -0.068], color: '#efe6cf', finish: 'matte', round: 0 });
  return toy.build({ height: 0.1, radius: 0.06, muzzle: [0, 0, 0.05] });
}

function dart(): ToyModel {
  const toy = new ToyBuilder();
  toy.cylinder(0.024, 0.024, 0.16, { at: [0, 0, -0.03], rot: [HALF, 0, 0], color: '#ff7f2a', finish: 'matte', segments: 12 });
  // Suction cup at the +z end.
  toy.lathe([[0.02, 0], [0.017, 0.02], [0.036, 0.056], [0.03, 0.06], [0, 0.054]], { at: [0, 0, 0.05], rot: [HALF, 0, 0], color: '#2b2b2e', finish: 'plastic', segments: 10 });
  return toy.build({ height: 0.07, radius: 0.12, muzzle: [0, 0, 0.11] });
}

function marble(): ToyModel {
  const toy = new ToyBuilder();
  toy.sphere(0.08, { color: '#8fd3ff', finish: 'metal', segments: 8 });
  toy.cylinder(0.0815, 0.0815, 0.028, { rot: [0.5, 0, 0.3], color: '#ff6a3d', finish: 'plastic', segments: 8 });
  toy.cylinder(0.0812, 0.0812, 0.018, { rot: [-0.6, 0, -0.7], color: '#ffffff', finish: 'plastic', segments: 8 });
  return toy.build({ height: 0.16, radius: 0.08, muzzle: [0, 0, 0.08] });
}

function glueBlob(): ToyModel {
  const toy = new ToyBuilder();
  // Teardrop: round head leading (+z), tail trailing.
  toy.lathe([[0, -0.07], [0.012, -0.055], [0.03, -0.025], [0.045, 0.01], [0.048, 0.035], [0.038, 0.058], [0, 0.07]], {
    rot: [HALF, 0, 0], scale: [1, 1, 0.85], color: '#f7f5ee', segments: 10,
  });
  return toy.build({ height: 0.09, radius: 0.07, muzzle: [0, 0, 0.07] });
}

function band(): ToyModel {
  const toy = new ToyBuilder();
  const red = '#d2372b';
  const r = 0.03;
  const tube = 0.0085;
  const straight = 0.24;
  toy.torus(r, tube, { at: [0, 0, straight / 2], arc: Math.PI, color: red, finish: 'matte', segments: 4 });
  toy.torus(r, tube, { at: [0, 0, -straight / 2], rot: [0, Math.PI, 0], arc: Math.PI, color: red, finish: 'matte', segments: 4 });
  for (const sx of [-1, 1]) toy.cylinder(tube, tube, straight, { at: [sx * r, 0, 0], rot: [HALF, 0, 0], color: red, finish: 'matte', segments: 6 });
  return toy.build({ height: 0.02, radius: 0.16, muzzle: [0, 0, 0.15] });
}

function button(): ToyModel {
  const toy = new ToyBuilder();
  // Raised rim and a dished centre.
  toy.lathe([[0, -0.01], [0.07, -0.01], [0.07, 0.006], [0.058, 0.01], [0.046, 0.002], [0, 0.002]], { color: '#f5c518', segments: 10 });
  for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
    toy.cone(0.011, 0.01, { at: [x * 0.017, -0.002, z * 0.017], rot: [Math.PI, 0, 0], color: '#5a4300', finish: 'matte', segments: 6 });
  }
  return toy.build({ height: 0.02, radius: 0.07, muzzle: [0, 0, 0] });
}

export const PROP_TOYS = {
  fort,
  cork,
  dart,
  marble,
  glueBlob,
  band,
  button,
};
