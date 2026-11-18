import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Surface finishes. Each is one shared material (see toyMaterial.ts); the
 * colour of every part is baked into vertex colours, so a whole toy costs one
 * draw call per finish it uses.
 */
export type Finish = 'plastic' | 'matte' | 'metal' | 'glow';
export const FINISHES: readonly Finish[] = ['plastic', 'matte', 'metal', 'glow'];

/**
 * A rigid part of a toy.
 * - `body`: fixed to the toy.
 * - `turret`: turns around the vertical axis through `pivot` to aim.
 * - `spin`: turns continuously around `axis` through `pivot` (rotors, wind-up keys).
 * A toy may have several `spin` pieces; it has at most one `turret`.
 */
export type PieceKind = 'body' | 'turret' | 'spin';
export type ToyPiece = {
  kind: PieceKind;
  /** Model-space point the piece turns around. Geometry is stored relative to it. */
  pivot: [number, number, number];
  /** Spin axis (unit vector) for `spin` pieces. */
  axis: [number, number, number];
  /** Spin speed in turns per second for `spin` pieces. */
  speed: number;
  geometry: Partial<Record<Finish, THREE.BufferGeometry>>;
};

/**
 * A finished toy. Model space: the origin is the centre of the toy's footprint
 * on the floor, +y is up, and the toy faces +z (walking and firing direction).
 * Sizes are world units (1 unit = 33 cm of the real house; a soldier is 0.5 tall).
 */
export type ToyModel = {
  pieces: ToyPiece[];
  height: number;
  /** Footprint radius, used for shadows and selection rings. */
  radius: number;
  /** Where shots leave the toy, in model space with the turret at rest. */
  muzzle: [number, number, number];
};

export type PartOptions = {
  /** Centre of the part in model space. */
  at?: [number, number, number];
  /** Euler rotation in radians (XYZ order). */
  rot?: [number, number, number];
  /** Extra non-uniform scale applied before rotation. */
  scale?: [number, number, number];
  /** CSS colour. For tinted toys (soldiers) use greys: the instance tint multiplies it. */
  color: string;
  finish?: Finish;
  /** Radial segments for round shapes (default 12). Keep toys light: aim under 3000 triangles each. */
  segments?: number;
};

type PieceDraft = { kind: PieceKind; pivot: THREE.Vector3; axis: THREE.Vector3; speed: number; parts: Map<Finish, THREE.BufferGeometry[]> };

/** Builds a toy from primitive shapes with baked colours. */
export class ToyBuilder {
  private readonly pieces: PieceDraft[] = [];
  private current: PieceDraft;
  private readonly matrix = new THREE.Matrix4();
  private readonly color = new THREE.Color();

  constructor() {
    this.current = this.newPiece('body', [0, 0, 0], [0, 1, 0], 0);
  }

  /** Start the aiming piece; later shapes belong to it until the next piece call. */
  turret(pivot: [number, number, number]): this {
    this.current = this.newPiece('turret', pivot, [0, 1, 0], 0);
    return this;
  }

  /** Start a continuously spinning piece. */
  spin(pivot: [number, number, number], axis: [number, number, number], turnsPerSecond: number): this {
    this.current = this.newPiece('spin', pivot, axis, turnsPerSecond);
    return this;
  }

  /** Go back to adding fixed shapes. */
  body(): this {
    this.current = this.pieces[0];
    return this;
  }

  /** Box with softly rounded edges (`round` is the edge radius; 0 gives a sharp box). */
  box(size: [number, number, number], options: PartOptions & { round?: number }): this {
    const round = Math.min(options.round ?? Math.min(...size) * 0.18, Math.min(...size) / 2 - 1e-4);
    const geometry = round > 0.002
      ? new RoundedBoxGeometry(size[0], size[1], size[2], 2, round)
      : new THREE.BoxGeometry(size[0], size[1], size[2]);
    return this.add(geometry, options);
  }

  /** Cylinder or cone frustum standing along +y (before `rot`). */
  cylinder(radiusTop: number, radiusBottom: number, height: number, options: PartOptions): this {
    return this.add(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, options.segments ?? 12), options);
  }

  cone(radius: number, height: number, options: PartOptions): this {
    return this.add(new THREE.ConeGeometry(radius, height, options.segments ?? 12), options);
  }

  sphere(radius: number, options: PartOptions): this {
    const segments = options.segments ?? 12;
    return this.add(new THREE.SphereGeometry(radius, segments, Math.max(6, Math.round(segments * 0.7))), options);
  }

  /** Upper half of a sphere (helmets, domes). */
  dome(radius: number, options: PartOptions): this {
    const segments = options.segments ?? 12;
    return this.add(new THREE.SphereGeometry(radius, segments, Math.max(4, Math.round(segments * 0.4)), 0, Math.PI * 2, 0, Math.PI / 2), options);
  }

  /** Capsule along +y; `length` is the straight section between the round ends. */
  capsule(radius: number, length: number, options: PartOptions): this {
    return this.add(new THREE.CapsuleGeometry(radius, length, 4, options.segments ?? 10), options);
  }

  /** Ring lying flat in the XZ plane (before `rot`). */
  torus(radius: number, tube: number, options: PartOptions & { arc?: number }): this {
    const geometry = new THREE.TorusGeometry(radius, tube, 6, options.segments ?? 16, options.arc ?? Math.PI * 2);
    geometry.rotateX(Math.PI / 2);
    return this.add(geometry, options);
  }

  /** Solid of revolution around +y from a profile of [radius, height] points, bottom to top. */
  lathe(profile: readonly (readonly [number, number])[], options: PartOptions): this {
    const points = profile.map(([radius, height]) => new THREE.Vector2(radius, height));
    return this.add(new THREE.LatheGeometry(points, options.segments ?? 14), options);
  }

  /** Flat shape in the XY plane from [x, y] outline points, pushed out along +z by `depth` (centred). */
  extrude(outline: readonly (readonly [number, number])[], depth: number, options: PartOptions): this {
    const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
    const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
    geometry.translate(0, 0, -depth / 2);
    return this.add(geometry, options);
  }

  build(meta: { height: number; radius: number; muzzle?: [number, number, number] }): ToyModel {
    const pieces: ToyPiece[] = [];
    for (const draft of this.pieces) {
      const geometry: ToyPiece['geometry'] = {};
      for (const [finish, parts] of draft.parts) {
        const merged = mergeGeometries(parts);
        merged.translate(-draft.pivot.x, -draft.pivot.y, -draft.pivot.z);
        merged.computeBoundingSphere();
        geometry[finish] = merged;
        for (const part of parts) part.dispose();
      }
      if (Object.keys(geometry).length === 0) continue;
      pieces.push({ kind: draft.kind, pivot: draft.pivot.toArray(), axis: draft.axis.toArray(), speed: draft.speed, geometry });
    }
    return { pieces, height: meta.height, radius: meta.radius, muzzle: meta.muzzle ?? [0, meta.height * 0.8, meta.radius] };
  }

  private newPiece(kind: PieceKind, pivot: [number, number, number], axis: [number, number, number], speed: number): PieceDraft {
    const piece: PieceDraft = {
      kind, pivot: new THREE.Vector3(...pivot), axis: new THREE.Vector3(...axis).normalize(), speed, parts: new Map(),
    };
    this.pieces.push(piece);
    return piece;
  }

  private add(source: THREE.BufferGeometry, options: PartOptions): this {
    const geometry = source.index ? source.toNonIndexed() : source;
    if (geometry !== source) source.dispose();
    geometry.deleteAttribute('uv');
    const scale = options.scale ?? [1, 1, 1];
    const rot = options.rot ?? [0, 0, 0];
    const at = options.at ?? [0, 0, 0];
    this.matrix.compose(
      new THREE.Vector3(...at),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2])),
      new THREE.Vector3(...scale),
    );
    geometry.applyMatrix4(this.matrix);
    this.color.set(options.color);
    const count = geometry.getAttribute('position').count;
    const colors = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) this.color.toArray(colors, index * 3);
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const finish = options.finish ?? 'plastic';
    const list = this.current.parts.get(finish) ?? [];
    list.push(geometry);
    this.current.parts.set(finish, list);
    return this;
  }
}

export function triangleCount(model: ToyModel): number {
  let total = 0;
  for (const piece of model.pieces) {
    for (const geometry of Object.values(piece.geometry)) total += geometry.getAttribute('position').count / 3;
  }
  return total;
}
