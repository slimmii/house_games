import { laundryCollisionPositions } from './laundry';
import {
  Box3,
  BufferGeometry,
  BufferAttribute,
  DoubleSide,
  Ray,
  Sphere,
  Vector3,
} from 'three';
import { MeshBVH, type ExtendedTriangle } from 'three-mesh-bvh';
import { MeshoptDecoder } from 'meshoptimizer/decoder';
import windowCollision from './window-collision.json';
import { CLOSET_STATIC_BOXES } from './closet-interiors';
import type { Vec3 } from './vec.js';

export type WorldHit = { t: number; position: Vec3; normal: Vec3 };

/** 'HCM1': header of u32 magic, vertices, indices, encoded vertex bytes, encoded index bytes, position scale.
 * Scale > 0 stores int32 positions in 1/scale units (int32 minimum = -0); 0 stores float64. */
export const HOUSE_COLLISION_MAGIC = 0x314d4348;
export type HouseCollision = { positions: Float64Array; indices: Uint32Array };

/** Unpacks house-collision.meshopt.bin to exactly the values JSON.parse yields for house-collision.json. */
export async function decodeHouseCollision(file: ArrayBuffer): Promise<HouseCollision> {
  const [magic, vertices, indexCount, vertexBytes, indexBytes, scale] = new Uint32Array(file, 0, Math.min(6, file.byteLength >> 2));
  if (magic !== HOUSE_COLLISION_MAGIC || file.byteLength !== 24 + vertexBytes + indexBytes) throw new Error('Invalid house collision asset');
  await MeshoptDecoder.ready;
  const stride = scale ? 12 : 24, raw = new ArrayBuffer(vertices * stride);
  MeshoptDecoder.decodeVertexBuffer(new Uint8Array(raw), vertices, stride, new Uint8Array(file, 24, vertexBytes));
  let positions: Float64Array;
  if (scale) {
    const fixed = new Int32Array(raw);
    positions = new Float64Array(fixed.length);
    for (let i = 0; i < fixed.length; i++) positions[i] = fixed[i] === -0x80000000 ? -0 : fixed[i] / scale;
  } else positions = new Float64Array(raw);
  const indices = new Uint32Array(indexCount);
  MeshoptDecoder.decodeIndexSequence(new Uint8Array(indices.buffer), indexCount, 4, new Uint8Array(file, 24 + vertexBytes, indexBytes));
  return { positions, indices };
}

let worldBVH: MeshBVH | undefined;
export let WORLD_TRIANGLE_COUNT = 0;
export let WORLD_COLLISION_BOUNDS = { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };

export function houseCollisionInstalled(): boolean { return !!worldBVH; }

function world(): MeshBVH {
  if (!worldBVH) throw new Error('House collision is not installed: call installHouseCollision() before querying the world');
  return worldBVH;
}

/** Builds the world BVH from the house mesh plus fixed panes, laundry and closet boards. */
export function installHouseCollision(data: { positions: ArrayLike<number>; indices: ArrayLike<number> }): void {
  // Fixed panes use their actual geometry, preserving any authored open gaps.
  // Operable veranda/entrance panels remain in the moving-door collision system.
  const extra: number[] = [...windowCollision.positions, ...laundryCollisionPositions()];
  // Rendering and collision share the same hollow shells and shelves. Each board
  // is solid; the cabinet's usable cavity is deliberately left empty.
  for (const box of CLOSET_STATIC_BOXES) {
    const corners = [
      [box.min[0],box.min[1],box.min[2]], [box.max[0],box.min[1],box.min[2]],
      [box.max[0],box.max[1],box.min[2]], [box.min[0],box.max[1],box.min[2]],
      [box.min[0],box.min[1],box.max[2]], [box.max[0],box.min[1],box.max[2]],
      [box.max[0],box.max[1],box.max[2]], [box.min[0],box.max[1],box.max[2]],
    ];
    for (const face of [[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[3,7,6],[3,6,2],[0,4,7],[0,7,3],[1,2,6],[1,6,5]]) {
      for (const index of face) extra.push(...corners[index]);
    }
  }
  const houseVertices = data.positions.length / 3, vertexCount = houseVertices + extra.length / 3;
  const positions = new Float32Array(vertexCount * 3);
  const indices = new Uint32Array(data.indices.length + extra.length / 3);
  for (let i = 0; i < data.positions.length; i++) positions[i] = data.positions[i];
  positions.set(extra, data.positions.length);
  let valid = data.indices.length > 0 && data.positions.length % 3 === 0 && data.indices.length % 3 === 0;
  for (let i = 0; valid && i < data.indices.length; i++) {
    const index = data.indices[i];
    valid = Number.isInteger(index) && index >= 0 && index < houseVertices;
    indices[i] = index;
  }
  for (let i = 0; i < extra.length / 3; i++) indices[data.indices.length + i] = houseVertices + i;
  if (!valid || positions.some(value => !Number.isFinite(value))) {
    throw new Error('House collision must contain finite vertices and valid triangle indices');
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  const next = new MeshBVH(geometry, { targetLeafSize: 12 });
  const bounds = next.getBoundingBox(new Box3());
  worldBVH?.geometry.dispose();
  worldBVH = next;
  WORLD_TRIANGLE_COUNT = indices.length / 3;
  WORLD_COLLISION_BOUNDS = {
    min: { x: bounds.min.x, y: bounds.min.y, z: bounds.min.z },
    max: { x: bounds.max.x, y: bounds.max.y, z: bounds.max.z },
  };
}

const EPSILON = 1e-8;

function smallestRoots(a: number, b: number, c: number, roots: Float64Array): number {
  if (Math.abs(a) < EPSILON) {
    if (Math.abs(b) < EPSILON) return 0;
    roots[0] = -c / b;
    return 1;
  }
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return 0;
  const root = Math.sqrt(Math.max(0, discriminant));
  const first = (-b - root) / (2 * a);
  const second = (-b + root) / (2 * a);
  roots[0] = first <= second ? first : second;
  roots[1] = first <= second ? second : first;
  return 2;
}

// BVH queries are synchronous and expose no user callbacks. Reuse their working
// storage; only successful public hits allocate data owned by the caller.
class SweepScratch {
  readonly start = new Vector3();
  readonly end = new Vector3();
  readonly delta = new Vector3();
  readonly bounds = new Box3();
  readonly center = new Vector3();
  readonly closest = new Vector3();
  readonly normal = new Vector3();
  readonly faceNormal = new Vector3();
  readonly edge = new Vector3();
  readonly fromA = new Vector3();
  readonly perpendicularStart = new Vector3();
  readonly perpendicularDelta = new Vector3();
  readonly fromVertex = new Vector3();
  readonly roots = new Float64Array(2);
  readonly triangleNormal = new Vector3();
  readonly bestNormal = new Vector3();
  radius = 0;
  bestT = Infinity;
  triangleT = Infinity;

  consider(t: number, candidateNormal: Vector3): void {
    if (t < -EPSILON || t > 1 + EPSILON || t >= this.triangleT) return;
    const lengthSquared = candidateNormal.lengthSq();
    if (lengthSquared < EPSILON) return;
    this.triangleT = Math.max(0, Math.min(1, t));
    this.triangleNormal.copy(candidateNormal).multiplyScalar(1 / Math.sqrt(lengthSquared));
    if (this.triangleNormal.dot(this.delta) > 0) this.triangleNormal.negate();
  }

  readonly callbacks = {
    intersectsBounds: (box: Box3) => box.intersectsBox(this.bounds),
    intersectsTriangle: (triangle: ExtendedTriangle) => {
      sweepTriangle(this, triangle);
      if (this.triangleT < this.bestT) {
        this.bestT = this.triangleT;
        this.bestNormal.copy(this.triangleNormal);
      }
      return false;
    },
  };
}

/** Exact moving-point vs triangle-expanded-by-radius time of impact. */
function sweepTriangle(scratch: SweepScratch, triangle: ExtendedTriangle): void {
  const { start, delta, radius, center, closest, normal, faceNormal, edge,
    fromA, perpendicularStart, perpendicularDelta, fromVertex, roots } = scratch;
  scratch.triangleT = Infinity;
  const radiusSquared = radius * radius;

  // A sweep beginning in contact must report t=0 so callers cannot tunnel out.
  triangle.closestPointToPoint(start, closest);
  if (closest.distanceToSquared(start) <= radiusSquared + EPSILON) {
    normal.subVectors(start, closest);
    if (normal.lengthSq() < EPSILON) triangle.getNormal(normal);
    scratch.consider(0, normal);
  }

  triangle.getNormal(normal);
  if (normal.lengthSq() >= EPSILON) {
    const startDistance = normal.dot(start) - normal.dot(triangle.a);
    const directionDistance = normal.dot(delta);
    if (Math.abs(directionDistance) > EPSILON) {
      // Both faces matter because exported collision triangles are double-sided.
      for (let side = -1; side <= 1; side += 2) {
        const t = (side * radius - startDistance) / directionDistance;
        if (t < -EPSILON || t > 1 + EPSILON || t >= scratch.triangleT) continue;
        center.copy(delta).multiplyScalar(t).add(start);
        closest.copy(normal).multiplyScalar(side * radius);
        closest.subVectors(center, closest);
        if (triangle.containsPoint(closest)) scratch.consider(t, faceNormal.copy(normal).multiplyScalar(side));
      }
    }
  }

  for (let index = 0; index < 3; index++) {
    const a = index === 0 ? triangle.a : index === 1 ? triangle.b : triangle.c;
    const b = index === 0 ? triangle.b : index === 1 ? triangle.c : triangle.a;
    edge.subVectors(b, a);
    const edgeLengthSquared = edge.lengthSq();
    if (edgeLengthSquared > EPSILON) {
      fromA.subVectors(start, a);
      const startProjection = fromA.dot(edge) / edgeLengthSquared;
      const deltaProjection = delta.dot(edge) / edgeLengthSquared;
      perpendicularStart.copy(fromA).addScaledVector(edge, -startProjection);
      perpendicularDelta.copy(delta).addScaledVector(edge, -deltaProjection);
      const rootCount = smallestRoots(
        perpendicularDelta.lengthSq(),
        2 * perpendicularStart.dot(perpendicularDelta),
        perpendicularStart.lengthSq() - radiusSquared,
        roots,
      );
      for (let rootIndex = 0; rootIndex < rootCount; rootIndex++) {
        const t = roots[rootIndex];
        if (t < -EPSILON || t > 1 + EPSILON || t >= scratch.triangleT) continue;
        const edgePosition = startProjection + deltaProjection * t;
        if (edgePosition < -EPSILON || edgePosition > 1 + EPSILON) continue;
        center.copy(delta).multiplyScalar(t).add(start);
        closest.copy(edge).multiplyScalar(edgePosition).add(a);
        scratch.consider(t, normal.subVectors(center, closest));
      }
    }

    // Vertices close the spherical ends of the three edge capsules.
    fromVertex.subVectors(start, a);
    const rootCount = smallestRoots(
      delta.lengthSq(),
      2 * fromVertex.dot(delta),
      fromVertex.lengthSq() - radiusSquared,
      roots,
    );
    for (let rootIndex = 0; rootIndex < rootCount; rootIndex++) {
      const t = roots[rootIndex];
      if (t < -EPSILON || t > 1 + EPSILON || t >= scratch.triangleT) continue;
      center.copy(delta).multiplyScalar(t).add(start);
      scratch.consider(t, normal.subVectors(center, a));
    }
  }
}

const sweep = new SweepScratch();
const overlapPosition = new Vector3();
const overlapSphere = new Sphere(overlapPosition);
const overlapCallbacks = {
  intersectsBounds: (box: Box3) => box.intersectsSphere(overlapSphere),
  intersectsTriangle: (triangle: ExtendedTriangle) => triangle.distanceToPoint(overlapPosition) < overlapSphere.radius - EPSILON,
};

/** Sweeps a sphere through the exact exported house triangle mesh. */
export function sweepWorld(startValue: Vec3, endValue: Vec3, radius: number): WorldHit | null {
  if (!Number.isFinite(radius) || radius < 0) return null;
  sweep.start.set(startValue.x, startValue.y, startValue.z);
  sweep.end.set(endValue.x, endValue.y, endValue.z);
  sweep.delta.copy(sweep.end).sub(sweep.start);
  sweep.radius = radius;
  sweep.bestT = Infinity;
  sweep.bounds.makeEmpty().expandByPoint(sweep.start).expandByPoint(sweep.end).expandByScalar(radius + EPSILON);
  world().shapecast(sweep.callbacks);

  if (sweep.bestT === Infinity) return null;
  const hitNormal = sweep.bestNormal;
  const position = sweep.center.copy(sweep.delta).multiplyScalar(sweep.bestT).add(sweep.start);
  return {
    t: sweep.bestT,
    position: { x: position.x, y: position.y, z: position.z },
    normal: { x: hitNormal.x, y: hitNormal.y, z: hitNormal.z },
  };
}

/** Tests a sphere against the exact exported house mesh. Tangency is safe. */
export function overlapsWorld(positionValue: Vec3, radius: number): boolean {
  if (!Number.isFinite(radius) || radius <= 0) return false;
  overlapPosition.set(positionValue.x, positionValue.y, positionValue.z);
  overlapSphere.radius = radius;
  return world().shapecast(overlapCallbacks);
}

const worldRay = new Ray();

/** Traverse the BVH along the ray, rather than sweeping its entire bounding box. */
export function rayWorld(start: Vec3, end: Vec3): WorldHit | null {
  worldRay.origin.set(start.x, start.y, start.z);
  worldRay.direction.set(end.x - start.x, end.y - start.y, end.z - start.z);
  const length = worldRay.direction.length();
  if (length < EPSILON) return sweepWorld(start, end, 0);
  worldRay.direction.multiplyScalar(1 / length);
  const hit = world().raycastFirst(worldRay, DoubleSide, 0, length);
  if (!hit?.face) return null;
  const normal = hit.face.normal;
  if (normal.dot(worldRay.direction) > 0) normal.negate();
  return {
    t: hit.distance / length,
    position: { x: hit.point.x, y: hit.point.y, z: hit.point.z },
    normal: { x: normal.x, y: normal.y, z: normal.z },
  };
}
