import * as THREE from 'three';

/** Size of one mask pixel in world units (2 cm in the game, under 1 cm of the real house). */
const PIXEL = 0.02;
/**
 * The thickest wall that is filled (the outer walls are about 40 cm, 1.2
 * units). Two wall faces closer together than this are one solid wall;
 * anything wider is a room and stays open.
 */
const MAX_WALL = 1.3;

/** A cut through the house: the plane `axis = value`, seen in the two other axes. */
export type Section = {
  axis: 'x' | 'y' | 'z';
  value: number;
  /** World extent of the mask along the two in-plane axes (u, v). */
  minU: number;
  maxU: number;
  minV: number;
  maxV: number;
};

const IN_PLANE: Record<Section['axis'], [number, number]> = { x: [2, 1], y: [0, 2], z: [0, 1] };
const AXIS_INDEX: Record<Section['axis'], number> = { x: 0, y: 1, z: 2 };

/**
 * Where is the house solid on a cutting plane?
 *
 * Walls in the model are hollow shells, sometimes of several loose surfaces,
 * so a cut wall shows its inside. This finds every line where a surface
 * crosses the plane and then fills the narrow gaps between such lines: two
 * faces of one wall close up into a solid band, while rooms stay open. It
 * depends only on where surfaces are, not on how they were modelled. Pass
 * walls only: furniture standing close to a wall would be filled in with it.
 */
export function sectionMask(meshes: readonly THREE.Mesh[], section: Section): { data: Uint8Array; width: number; height: number } {
  const width = Math.ceil((section.maxU - section.minU) / PIXEL);
  const height = Math.ceil((section.maxV - section.minV) / PIXEL);
  const lines = new Uint8Array(width * height);
  const axis = AXIS_INDEX[section.axis];
  const [uAxis, vAxis] = IN_PLANE[section.axis];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const corners = [a, b, c];
  const cut: number[] = [];

  const draw = (u0: number, v0: number, u1: number, v1: number) => {
    const x0 = (u0 - section.minU) / PIXEL;
    const y0 = (v0 - section.minV) / PIXEL;
    const x1 = (u1 - section.minU) / PIXEL;
    const y1 = (v1 - section.minV) / PIXEL;
    // Steps shorter than a pixel leave no diagonal gaps for the fill to leak through.
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2.5));
    for (let step = 0; step <= steps; step += 1) {
      const x = Math.floor(x0 + ((x1 - x0) * step) / steps);
      const y = Math.floor(y0 + ((y1 - y0) * step) / steps);
      if (x >= 0 && y >= 0 && x < width && y < height) lines[x + y * width] = 1;
    }
  };

  for (const mesh of meshes) {
    const geometry = mesh.geometry as THREE.BufferGeometry;
    const position = geometry.getAttribute('position');
    const index = geometry.getIndex();
    const world = mesh.matrixWorld;
    const identity = world.equals(IDENTITY);
    const box = geometry.boundingBox;
    if (identity && box && (box.min.getComponent(axis) > section.value || box.max.getComponent(axis) < section.value)) continue;
    const count = index ? index.count : position.count;
    for (let start = 0; start < count; start += 3) {
      for (let corner = 0; corner < 3; corner += 1) {
        corners[corner].fromBufferAttribute(position, index ? index.getX(start + corner) : start + corner);
        if (!identity) corners[corner].applyMatrix4(world);
      }
      const da = a.getComponent(axis) - section.value;
      const db = b.getComponent(axis) - section.value;
      const dc = c.getComponent(axis) - section.value;
      if ((da > 0 && db > 0 && dc > 0) || (da < 0 && db < 0 && dc < 0) || (da === 0 && db === 0 && dc === 0)) continue;
      // The triangle crosses the plane along one segment, between two of its edges.
      cut.length = 0;
      const edge = (p: THREE.Vector3, dp: number, q: THREE.Vector3, dq: number) => {
        if ((dp > 0) === (dq > 0)) return;
        const t = dp / (dp - dq);
        cut.push(p.getComponent(uAxis) + (q.getComponent(uAxis) - p.getComponent(uAxis)) * t, p.getComponent(vAxis) + (q.getComponent(vAxis) - p.getComponent(vAxis)) * t);
      };
      edge(a, da, b, db);
      edge(b, db, c, dc);
      edge(c, dc, a, da);
      if (cut.length === 4) draw(cut[0], cut[1], cut[2], cut[3]);
    }
  }

  // Fill the gap between two surfaces that face each other across a wall, along
  // rows and along columns. Straight scans leave room corners square, where a
  // round brush would fill them in.
  const reach = Math.round(MAX_WALL / PIXEL);
  const data = new Uint8Array(width * height);
  const scan = (start: number, stride: number, count: number) => {
    let previous = -1;
    for (let step = 0; step < count; step += 1) {
      const index = start + step * stride;
      if (!lines[index]) continue;
      data[index] = 255;
      if (previous >= 0 && step - previous > 1 && step - previous <= reach) {
        for (let fill = previous + 1; fill < step; fill += 1) data[start + fill * stride] = 255;
      }
      previous = step;
    }
  };
  for (let y = 0; y < height; y += 1) scan(y * width, 1, width);
  for (let x = 0; x < width; x += 1) scan(x, width, height);
  return { data, width, height };
}

const IDENTITY = new THREE.Matrix4();

/**
 * A flat sheet on the cutting plane, opaque only where the house is solid.
 * `inset` moves it a hair to the kept side so the plane does not clip it away.
 * `onTop` is for the horizontal cut seen from above.
 */
export function createSectionCap(meshes: readonly THREE.Mesh[], section: Section, inset: number, color: THREE.ColorRepresentation, onTop = false): THREE.Mesh {
  const mask = sectionMask(meshes, section);
  // Alpha maps are read from the green channel, so the mask goes into a two-channel texture.
  const texels = new Uint8Array(mask.data.length * 2);
  for (let index = 0; index < mask.data.length; index += 1) texels[index * 2] = texels[index * 2 + 1] = mask.data[index];
  const texture = new THREE.DataTexture(texels, mask.width, mask.height, THREE.RGFormat);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  const [uAxis, vAxis] = IN_PLANE[section.axis];
  const axis = AXIS_INDEX[section.axis];
  const maxU = section.minU + mask.width * PIXEL;
  const maxV = section.minV + mask.height * PIXEL;
  const positions: number[] = [];
  const uvs: number[] = [];
  const vertex = (u: number, v: number, s: number, t: number) => {
    const point = [0, 0, 0];
    point[axis] = section.value + inset;
    point[uAxis] = u;
    point[vAxis] = v;
    positions.push(point[0], point[1], point[2]);
    uvs.push(s, t);
  };
  vertex(section.minU, section.minV, 0, 0);
  vertex(maxU, section.minV, 1, 0);
  vertex(maxU, maxV, 1, 1);
  vertex(section.minU, maxV, 0, 1);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  // The sheet spans the whole house but is see-through away from the walls.
  // Those pixels must be discarded, not just drawn invisible: otherwise the
  // sheet still writes depth there and hides the tape, shadows and placing
  // markers on the floor beneath it.
  const material = new THREE.MeshBasicMaterial({ color, alphaMap: texture, alphaTest: 0.02, transparent: true, side: THREE.DoubleSide });
  // Turn the mask into an edge that is exactly one screen pixel soft at any
  // zoom. A hard cut-off would crawl along every wall as the camera moves.
  material.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <alphamap_fragment>', `#include <alphamap_fragment>
diffuseColor.a = clamp( ( diffuseColor.a - 0.5 ) / max( fwidth( diffuseColor.a ), 1e-4 ) + 0.5, 0.0, 1.0 );`);
  };
  material.customProgramCacheKey = () => 'section-cap-edge';
  const mesh = new THREE.Mesh(geometry, material);
  // Drawn before the other see-through things (glass, shadows, sparks), right after the solid room.
  mesh.renderOrder = -1;
  if (onTop) {
    // Nothing in the room can stand between a camera above the cut and the
    // cut itself, so this sheet may simply be drawn over the wall edges that
    // would otherwise show through it as hairlines.
    // (Always passing still writes depth, so the tape and shadows behind a wall stay hidden.)
    material.depthFunc = THREE.AlwaysDepth;
  }
  mesh.name = `section-cap-${section.axis}`;
  mesh.matrixAutoUpdate = false;
  return mesh;
}
