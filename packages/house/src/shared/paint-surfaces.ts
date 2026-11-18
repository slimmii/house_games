import { BufferAttribute, BufferGeometry, DoubleSide, Mesh, Ray, Vector3, type Object3D } from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { MeshoptDecoder } from 'meshoptimizer/decoder';
import { rayWorld, type WorldHit } from './collision';
import type { Vec3 } from './vec';

let surfaces: MeshBVH | undefined;
const ray = new Ray();

/** 'PSM1': header of u32 magic, vertices, indices, encoded vertex bytes, encoded index bytes. */
export const PAINT_SURFACES_MAGIC = 0x314d5350;

/** Losslessly unpacks the meshopt asset into the raw layout installPaintSurfaces expects. */
export async function decodePaintSurfaces(file: ArrayBuffer): Promise<ArrayBuffer> {
  const [magic, vertices, indices, vertexBytes, indexBytes] = new Uint32Array(file, 0, Math.min(5, file.byteLength >> 2));
  if (magic !== PAINT_SURFACES_MAGIC || file.byteLength !== 20 + vertexBytes + indexBytes) throw new Error('Invalid paint surface asset');
  await MeshoptDecoder.ready;
  const bytes = new ArrayBuffer(8 + vertices * 12 + indices * 4);
  new Uint32Array(bytes, 0, 2).set([vertices, indices]);
  MeshoptDecoder.decodeVertexBuffer(new Uint8Array(bytes, 8, vertices * 12), vertices, 12, new Uint8Array(file, 20, vertexBytes));
  MeshoptDecoder.decodeIndexSequence(new Uint8Array(bytes, 8 + vertices * 12, indices * 4), indices, 4, new Uint8Array(file, 20 + vertexBytes, indexBytes));
  return bytes;
}

/** The packed visual geometry is shared by authoritative shots and splat clipping. */
export function installPaintSurfaces(bytes: ArrayBuffer): void {
  const header = new Uint32Array(bytes, 0, 2);
  const [vertices, indices] = header;
  if (!vertices || !indices || indices % 3 || bytes.byteLength !== 8 + vertices * 12 + indices * 4) {
    throw new Error('Invalid paint surface geometry');
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(bytes, 8, vertices * 3), 3));
  geometry.setIndex(new BufferAttribute(new Uint32Array(bytes, 8 + vertices * 12, indices), 1));
  const next = new MeshBVH(geometry, { targetLeafSize: 12, maxDepth: 64 });
  surfaces?.geometry.dispose();
  surfaces = next;
}

export function paintSurfacesInstalled(): boolean { return !!surfaces; }

/**
 * Pack the world-space triangles of already-loaded meshes into the layout
 * installPaintSurfaces expects, so the client reuses the house it rendered
 * instead of downloading the server's copy. `skip` prunes whole subtrees.
 */
export function packPaintSurfaces(roots: readonly Object3D[], skip: (object: Object3D) => boolean = () => false): ArrayBuffer {
  const meshes: Mesh[] = [];
  let vertexCount = 0, indexCount = 0;
  const visit = (object: Object3D): void => {
    if (skip(object)) return;
    if (object instanceof Mesh) {
      const geometry = object.geometry as BufferGeometry;
      const position = geometry.getAttribute('position');
      vertexCount += position.count;
      indexCount += geometry.index?.count ?? position.count;
      meshes.push(object);
    }
    for (const child of object.children) visit(child);
  };
  for (const root of roots) {
    root.updateMatrixWorld(true);
    visit(root);
  }
  const bytes = new ArrayBuffer(8 + vertexCount * 12 + indexCount * 4);
  new Uint32Array(bytes, 0, 2).set([vertexCount, indexCount]);
  const vertices = new Float32Array(bytes, 8, vertexCount * 3);
  const indices = new Uint32Array(bytes, 8 + vertexCount * 12, indexCount);
  const point = new Vector3();
  let vertexOffset = 0, indexOffset = 0;
  for (const mesh of meshes) {
    const geometry = mesh.geometry as BufferGeometry;
    const position = geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld).toArray(vertices, (vertexOffset + i) * 3);
    }
    const index = geometry.index;
    const count = index?.count ?? position.count;
    for (let i = 0; i < count; i++) indices[indexOffset + i] = vertexOffset + (index ? index.getX(i) : i);
    vertexOffset += position.count;
    indexOffset += count;
  }
  return bytes;
}

/** Flight keeps its forgiving collision mesh; ink hits the visible static surfaces. */
export function rayPaintSurfaces(start: Vec3, end: Vec3): WorldHit | null {
  // Supports isolated simulations before an application has loaded its assets.
  if (!surfaces) return rayWorld(start, end);
  ray.origin.set(start.x, start.y, start.z);
  ray.direction.set(end.x - start.x, end.y - start.y, end.z - start.z);
  const length = ray.direction.length();
  if (length < 1e-8) return null;
  ray.direction.multiplyScalar(1 / length);
  const hit = surfaces.raycastFirst(ray, DoubleSide, 0, length);
  if (!hit?.face) return null;
  const normal = hit.face.normal;
  if (normal.dot(ray.direction) > 0) normal.negate();
  return { t: hit.distance / length, position: { x: hit.point.x, y: hit.point.y, z: hit.point.z },
    normal: { x: normal.x, y: normal.y, z: normal.z } };
}
