import sourceNames from './laundry-source-names.json';
import { BoxGeometry, CircleGeometry, CylinderGeometry, ExtrudeGeometry, Matrix4, Path, Shape, type BufferGeometry } from 'three';
import type { DoorDefinition } from './door-types';

/** Source Blender coordinates transformed to game meters (x,z,-y)*3. */
export const LAUNDRY = [0, 1].map(index => {
  const cy = (8.025 + index * .62 + .599 / 2) * -3;
  return { id: index === 0 ? 'laundry-washer' : 'laundry-dryer',
    label: index === 0 ? 'Washing machine' : 'Dryer', index, center: [3.069, 2.325, cy],
    min: [1.095, 1.062, cy - .8985], max: [2.946, 3.612, cy + .8985] };
});
export const LAUNDRY_SOURCE_NAMES: readonly string[] = sourceNames;

export const LAUNDRY_DOORS: DoorDefinition[] = LAUNDRY.map(machine => {
  const [x, y, z] = machine.center;
  // Thin strips approximate the round closed disk without a square invisible corner.
  const collisionBoxes = Array.from({ length: 24 }, (_, i) => {
    const bottom = -.735 + i * 1.47 / 24, top = bottom + 1.47 / 24;
    const half = Math.sqrt(Math.max(0, .735 ** 2 - Math.min(Math.abs(bottom), Math.abs(top)) ** 2));
    return { min: [x - .08, y + bottom, z - half], max: [x + .08, y + top, z + half] };
  });
  return { id: machine.id, label: machine.label, kind: 'door', fixed: false,
    min: [x - .08, y - .735, z - .735], max: [x + .08, y + .735, z + .735],
    pivot: [x, y, z + .735], angle: -Math.PI * .62, slide: [0, 0, 0],
    collisionBoxes, targetBoxes: collisionBoxes };
});

export type LaundryPart = { name: string; geometry: BufferGeometry; finish: 'enamel' | 'metal' | 'rubber' };
/** Hollow chassis and a true circular opening; shared by drawing, paint and flight. */
export function laundryStaticParts(): LaundryPart[] {
  const parts: LaundryPart[] = [];
  for (const m of LAUNDRY) {
    const z = m.center[2];
    function board(name: string, min: number[], max: number[]) {
      const g = new BoxGeometry(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
      g.translate(...min.map((v, i) => (v + max[i]) / 2) as [number, number, number]);
      parts.push({ name: `${m.id}:${name}`, geometry: g, finish: 'enamel' });
    }
    board('back', m.min, [1.15, m.max[1], m.max[2]]);
    board('bottom', m.min, [m.max[0], 1.12, m.max[2]]);
    board('top', [m.min[0], 3.55, m.min[2]], m.max);
    board('left', m.min, [m.max[0], m.max[1], m.min[2] + .05]);
    board('right', [m.min[0], m.min[1], m.max[2] - .05], m.max);
    const shape = new Shape();
    shape.moveTo(-.8745, -1.215); shape.lineTo(.8745, -1.215);
    shape.lineTo(.8745, 1.245); shape.lineTo(-.8745, 1.245); shape.closePath();
    const hole = new Path(); hole.absarc(0, 0, .57, 0, Math.PI * 2, true); shape.holes.push(hole);
    const face = new ExtrudeGeometry(shape, { depth: .042, bevelEnabled: false, curveSegments: 48 });
    face.rotateY(Math.PI / 2); face.translate(2.952, 2.325, z);
    parts.push({ name: `${m.id}:front`, geometry: face, finish: 'enamel' });
    const drum = new CylinderGeometry(.565, .565, 1.38, 64, 1, true);
    drum.rotateZ(Math.PI / 2); drum.translate(2.25, 2.325, z);
    parts.push({ name: `${m.id}:drum-wall`, geometry: drum, finish: 'metal' });
    const back = new CircleGeometry(.565, 64); back.rotateY(Math.PI / 2); back.translate(1.56, 2.325, z);
    parts.push({ name: `${m.id}:drum-back`, geometry: back, finish: 'metal' });
  }
  return parts;
}

export function laundryCollisionPositions(): number[] {
  const result: number[] = [];
  for (const part of laundryStaticParts()) {
    const position = part.geometry.getAttribute('position'), indices = part.geometry.index;
    for (let i = 0; i < (indices?.count ?? position.count); i++) {
      const index = indices ? indices.getX(i) : i;
      result.push(position.getX(index), position.getY(index), position.getZ(index));
    }
    part.geometry.dispose();
  }
  return result;
}

/** Wash agitation alternates; dryer tumbles slowly. Open doors always stop rotation. */
export function laundryAngularSpeed(index: number, fraction: number, opening: boolean, seconds: number): number {
  if (opening || fraction > .001) return 0;
  return index === 0 ? Math.sin(seconds * .35) * 2.4 : .8;
}
