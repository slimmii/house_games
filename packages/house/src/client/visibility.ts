import * as THREE from 'three';

/**
 * Precomputed visibility for the static house batches (`npm run bake:visibility`).
 *
 * The house box is split into voxels. For each voxel the bake records
 * which architecture batches can be seen from anywhere in it, or from a
 * neighbouring voxel. At runtime only those batches are drawn, so walls hide
 * the rooms behind them instead of the GPU shading them and throwing them away.
 * Doors, closets, glass and cut-out materials never count as occluders, so
 * opening a door can never reveal a missing room.
 *
 * The data matches one exact batch layout. A different layout (another style,
 * `?cells`, `?backfaces=off`, or an edited house) has a different fingerprint
 * and simply draws everything. `?visibility=off` disables it for comparison.
 */
export const VISIBILITY_FORMAT = 1;

export type VisibilityManifest = {
  version: number;
  data: string;
  byteLength: number;
  origin: [number, number, number];
  cellSize: number;
  dims: [number, number, number];
  batchCount: number;
  fingerprint: string;
};

/** The batch meshes `batchArchitecture` produced, in their stable child order. */
export function houseBatches(architecture: THREE.Object3D): THREE.Mesh[] {
  return architecture.children.filter((child): child is THREE.Mesh =>
    child instanceof THREE.Mesh && child.name.startsWith('architecture '));
}

/** FNV-1a over each batch's name, triangle count and material: enough to detect any re-batching. */
export function batchFingerprint(batches: readonly THREE.Mesh[]): string {
  let hash = 0x811c9dc5;
  const feed = (text: string) => {
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
  };
  batches.forEach((mesh, index) => {
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    feed(`${index}:${mesh.name}:${mesh.geometry.index?.count ?? 0}:${material?.name ?? ''}|`);
  });
  return (hash >>> 0).toString(16).padStart(8, '0');
}

async function gunzipIfNeeded(bytes: ArrayBuffer): Promise<ArrayBuffer> {
  // Vite serves .gz with Content-Encoding (fetch already decoded it); other hosts send the raw gzip file.
  const signature = new Uint8Array(bytes, 0, Math.min(2, bytes.byteLength));
  if (signature[0] !== 0x1f || signature[1] !== 0x8b) return bytes;
  return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
}

export type HouseVisibility = {
  /** Show only the batches visible from `position`; outside the voxel grid everything is shown. */
  update(position: THREE.Vector3): void;
  /** Show every batch again. */
  reset(): void;
};

export async function loadHouseVisibility(architecture: THREE.Object3D): Promise<HouseVisibility | undefined> {
  if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('visibility') === 'off') return undefined;
  const batches = houseBatches(architecture);
  try {
    const response = await fetch('/models/house-visibility.json');
    if (!response.ok) return undefined;
    const manifest = await response.json() as VisibilityManifest;
    if (manifest.version !== VISIBILITY_FORMAT || manifest.batchCount !== batches.length
      || manifest.fingerprint !== batchFingerprint(batches)) {
      console.warn('House visibility data does not match this house; drawing every room. Run npm run bake:visibility.');
      return undefined;
    }
    const dataResponse = await fetch(`/models/${manifest.data}`);
    if (!dataResponse.ok) return undefined;
    const bits = new Uint8Array(await gunzipIfNeeded(await dataResponse.arrayBuffer()));
    const [nx, ny, nz] = manifest.dims;
    const stride = Math.ceil(batches.length / 8);
    if (bits.byteLength !== nx * ny * nz * stride) return undefined;
    const [ox, oy, oz] = manifest.origin;
    const size = manifest.cellSize;
    let current = -2;
    const apply = (voxel: number) => {
      if (voxel === current) return;
      current = voxel;
      if (voxel < 0) {
        for (const mesh of batches) mesh.visible = true;
        return;
      }
      const offset = voxel * stride;
      for (let i = 0; i < batches.length; i += 1) batches[i].visible = (bits[offset + (i >> 3)] & (1 << (i & 7))) !== 0;
    };
    return {
      update(position) {
        const x = Math.floor((position.x - ox) / size);
        const y = Math.floor((position.y - oy) / size);
        const z = Math.floor((position.z - oz) / size);
        apply(x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz ? -1 : x + nx * (y + ny * z));
      },
      reset() { apply(-1); },
    };
  } catch (error) {
    console.warn('House visibility unavailable; drawing every room.', error);
    return undefined;
  }
}
