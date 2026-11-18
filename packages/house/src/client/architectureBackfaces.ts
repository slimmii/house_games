import * as THREE from 'three';
import backfaceManifest from './architecture-backfaces.json';

type SourceAttribute = THREE.BufferAttribute | THREE.InterleavedBufferAttribute;

type MeshRejection =
  | 'animated-or-instanced'
  | 'invalid-transform'
  | 'no-opaque-double-sided-material'
  | 'not-in-verified-manifest'
  | 'invalid-draw-ranges'
  | 'missing-or-invalid-geometry'
  | 'degenerate-triangle'
  | 'invalid-normals'
  | 'open-or-non-manifold'
  | 'inconsistent-winding'
  | 'inward-or-zero-volume';

type MaterialRejection =
  | 'already-single-sided'
  | 'non-standard-material'
  | 'transparent-or-cutout'
  | 'transmissive'
  | 'nonstandard-blending';

export interface ArchitectureBackfaceStats {
  disabled: boolean;
  manifestMatched: boolean;
  manifestReason?: string;
  meshesVisited: number;
  meshesEligible: number;
  meshesChanged: number;
  mirroredMeshes: number;
  geometriesAnalyzed: number;
  trianglesAnalyzed: number;
  trianglesEligible: number;
  closedComponents: number;
  materialAssignmentsConsidered: number;
  materialAssignmentsChanged: number;
  materialClones: number;
  skippedMeshes: Record<MeshRejection, number>;
  skippedMaterials: Record<MaterialRejection, number>;
}

export interface ArchitectureBackfaceOptions {
  /** Overrides the `?backfaces=off` development/diagnostic switch. */
  enabled?: boolean;
  /** Primarily useful outside a browser; defaults to `location.search`. */
  search?: string;
  /** Loaded model URL; defaults to the same texture query selection as world.ts. */
  assetPath?: string;
  /** Optional build-verified hashes, mainly for non-browser callers. */
  verifiedAssets?: Record<string, string>;
}

export interface ArchitectureBackfaceManifest {
  version: 1;
  assets: Record<string, string>;
  structureFingerprint: string;
  meshCount: number;
  eligibleMeshCount: number;
  eligibleTriangles: number;
  eligibleBitset: string;
}

interface DrawSpan {
  start: number;
  end: number;
}

interface TopologyResult {
  eligible: boolean;
  reason?: MeshRejection;
  triangles: number;
  components: number;
}

interface EdgeUse {
  direction: 1 | -1;
  firstTriangle: number;
  secondTriangle: number;
  count: number;
}

const NORMAL_ALIGNMENT_EPSILON = 1e-4;

function emptyRecord<T extends string>(keys: readonly T[]): Record<T, number> {
  return Object.fromEntries(keys.map(key => [key, 0])) as Record<T, number>;
}

function createStats(disabled: boolean): ArchitectureBackfaceStats {
  return {
    disabled,
    manifestMatched: false,
    meshesVisited: 0,
    meshesEligible: 0,
    meshesChanged: 0,
    mirroredMeshes: 0,
    geometriesAnalyzed: 0,
    trianglesAnalyzed: 0,
    trianglesEligible: 0,
    closedComponents: 0,
    materialAssignmentsConsidered: 0,
    materialAssignmentsChanged: 0,
    materialClones: 0,
    skippedMeshes: emptyRecord([
      'animated-or-instanced',
      'invalid-transform',
      'no-opaque-double-sided-material',
      'not-in-verified-manifest',
      'invalid-draw-ranges',
      'missing-or-invalid-geometry',
      'degenerate-triangle',
      'invalid-normals',
      'open-or-non-manifold',
      'inconsistent-winding',
      'inward-or-zero-volume',
    ] as const),
    skippedMaterials: emptyRecord([
      'already-single-sided',
      'non-standard-material',
      'transparent-or-cutout',
      'transmissive',
      'nonstandard-blending',
    ] as const),
  };
}

/** Whether selective architecture culling is enabled for this page load. */
export function architectureBackfacesEnabled(search?: string): boolean {
  const query = search ?? (typeof location === 'undefined' ? '' : location.search);
  return new URLSearchParams(query).get('backfaces') !== 'off';
}

/** Cheap guard against applying an offline decision table to a different scene. */
export function architectureStructureFingerprint(source: THREE.Object3D): {
  meshCount: number;
  fingerprint: string;
} {
  let fnv = 0x811c9dc5;
  let mix = 0x9e3779b9;
  let meshCount = 0;
  const add = (value: unknown): void => {
    const text = `${value}|`;
    for (let index = 0; index < text.length; index += 1) {
      const character = text.charCodeAt(index);
      fnv = Math.imul(fnv ^ character, 0x01000193) >>> 0;
      mix = (Math.imul(mix ^ character, 0x85ebca6b) + 0xc2b2ae35) >>> 0;
    }
  };
  source.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    meshCount += 1;
    const geometry = object.geometry;
    const position = geometry.getAttribute('position') as SourceAttribute | undefined;
    const normal = geometry.getAttribute('normal') as SourceAttribute | undefined;
    add(object.userData.name ?? object.name);
    add(position?.count ?? -1); add(position?.itemSize ?? -1);
    add(normal?.count ?? -1); add(normal?.itemSize ?? -1);
    add(geometry.index?.count ?? -1);
    add(geometry.drawRange.start); add(geometry.drawRange.count);
    add(geometry.groups.length);
    for (const group of geometry.groups) {
      add(group.start); add(group.count); add(group.materialIndex ?? 0);
    }
    // No position samples: house-gpu.glb positions are quantized, while the
    // manifest is shared with the float house.glb. Asset hashes cover the values.
    if (geometry.index?.count) {
      for (const sample of [0, Math.floor(geometry.index.count / 2), geometry.index.count - 1]) {
        add(geometry.index.getX(sample));
      }
    }
  });
  return {
    meshCount,
    fingerprint: `${fnv.toString(16).padStart(8, '0')}${mix.toString(16).padStart(8, '0')}`,
  };
}

function materialRejection(material: THREE.Material): MaterialRejection | undefined {
  if (material.side !== THREE.DoubleSide) return 'already-single-sided';
  // The house GLBs use glTF standard/physical materials. Custom shaders can
  // implement their own sidedness and must remain untouched.
  if (!(material instanceof THREE.MeshStandardMaterial)) return 'non-standard-material';
  if (material.transparent || material.opacity < 1 || material.alphaTest > 0
    || material.alphaHash || material.alphaToCoverage || material.alphaMap) {
    return 'transparent-or-cutout';
  }
  if (material instanceof THREE.MeshPhysicalMaterial && material.transmission > 0) {
    return 'transmissive';
  }
  if (material.blending !== THREE.NormalBlending || material.wireframe) {
    return 'nonstandard-blending';
  }
  return undefined;
}

function activeDrawSpans(mesh: THREE.Mesh): DrawSpan[] | undefined {
  const geometry = mesh.geometry;
  const position = geometry.getAttribute('position');
  if (!position) return undefined;
  const elementCount = geometry.index?.count ?? position.count;
  const drawStart = Math.max(0, Math.floor(geometry.drawRange.start));
  const requestedEnd = Number.isFinite(geometry.drawRange.count)
    ? drawStart + Math.floor(geometry.drawRange.count) : elementCount;
  const drawEnd = Math.min(elementCount, requestedEnd);
  if (drawStart >= drawEnd || drawStart % 3 !== 0 || drawEnd % 3 !== 0) return undefined;

  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const sourceSpans = geometry.groups.length && materials.length > 1
    ? geometry.groups
      .filter(group => materials[group.materialIndex ?? 0] !== undefined)
      .map(group => ({ start: group.start, end: group.start + group.count }))
    : [{ start: 0, end: elementCount }];
  const spans = sourceSpans.map(span => ({
    start: Math.max(drawStart, span.start),
    end: Math.min(drawEnd, span.end),
  })).filter(span => span.start < span.end).sort((a, b) => a.start - b.start);
  if (!spans.length) return undefined;

  const merged: DrawSpan[] = [];
  for (const span of spans) {
    if (span.start % 3 !== 0 || span.end % 3 !== 0) return undefined;
    const previous = merged[merged.length - 1];
    // Overlapping material groups render a triangle more than once. Treat them
    // as authored layering rather than trying to infer a closed solid.
    if (previous && span.start < previous.end) return undefined;
    if (previous && span.start === previous.end) previous.end = span.end;
    else merged.push({ ...span });
  }
  return merged;
}

function spanSignature(spans: readonly DrawSpan[]): string {
  return spans.map(span => `${span.start}:${span.end}`).join(',');
}

function find(parent: Int32Array, value: number): number {
  let root = value;
  while (parent[root] !== root) root = parent[root];
  while (parent[value] !== value) {
    const next = parent[value];
    parent[value] = root;
    value = next;
  }
  return root;
}

function unite(parent: Int32Array, ranks: Uint8Array, a: number, b: number): void {
  let rootA = find(parent, a);
  let rootB = find(parent, b);
  if (rootA === rootB) return;
  if (ranks[rootA] < ranks[rootB]) [rootA, rootB] = [rootB, rootA];
  parent[rootB] = rootA;
  if (ranks[rootA] === ranks[rootB]) ranks[rootA] += 1;
}

function topologyOf(mesh: THREE.Mesh, spans: readonly DrawSpan[]): TopologyResult {
  const geometry = mesh.geometry;
  const position = geometry.getAttribute('position') as SourceAttribute | undefined;
  const normal = geometry.getAttribute('normal') as SourceAttribute | undefined;
  if (!position || position.itemSize < 3 || !normal || normal.itemSize < 3) {
    return { eligible: false, reason: 'missing-or-invalid-geometry', triangles: 0, components: 0 };
  }

  const triangleCount = spans.reduce((total, span) => total + ((span.end - span.start) / 3), 0);
  if (!Number.isSafeInteger(triangleCount) || triangleCount < 4) {
    return { eligible: false, reason: 'missing-or-invalid-geometry', triangles: 0, components: 0 };
  }

  const triangleVertices = new Uint32Array(triangleCount * 3);
  const canonicalCoordinates: number[] = [];
  const canonicalByPosition = new Map<string, number>();
  const index = geometry.index;
  let triangle = 0;
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  const canonicalVertex = (sourceIndex: number): number => {
    if (!Number.isInteger(sourceIndex) || sourceIndex < 0 || sourceIndex >= position.count) return -1;
    const x = position.getX(sourceIndex);
    const y = position.getY(sourceIndex);
    const z = position.getZ(sourceIndex);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return -1;
    minX = Math.min(minX, x); minY = Math.min(minY, y); minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); maxZ = Math.max(maxZ, z);
    // Exact position welding joins UV/normal seams without guessing across a
    // geometric gap. Any exporter epsilon at a seam therefore fails closed.
    const key = `${x}|${y}|${z}`;
    let canonical = canonicalByPosition.get(key);
    if (canonical === undefined) {
      canonical = canonicalCoordinates.length / 3;
      canonicalByPosition.set(key, canonical);
      canonicalCoordinates.push(x, y, z);
    }
    return canonical;
  };

  for (const span of spans) {
    for (let offset = span.start; offset < span.end; offset += 3) {
      for (let corner = 0; corner < 3; corner += 1) {
        const sourceIndex = index ? index.getX(offset + corner) : offset + corner;
        const canonical = canonicalVertex(sourceIndex);
        if (canonical < 0) {
          return { eligible: false, reason: 'missing-or-invalid-geometry', triangles: triangleCount, components: 0 };
        }
        triangleVertices[triangle * 3 + corner] = canonical;
      }
      triangle += 1;
    }
  }

  const extent = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
  if (!(extent > 0) || !Number.isFinite(extent)) {
    return { eligible: false, reason: 'missing-or-invalid-geometry', triangles: triangleCount, components: 0 };
  }
  const areaSquaredEpsilon = extent ** 4 * 1e-24;
  const parent = new Int32Array(triangleCount);
  const ranks = new Uint8Array(triangleCount);
  const edges = new Map<number, EdgeUse>();
  const canonicalCount = canonicalCoordinates.length / 3;
  const face = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const authoredNormal = new THREE.Vector3();

  for (triangle = 0; triangle < triangleCount; triangle += 1) {
    parent[triangle] = triangle;
    const base = triangle * 3;
    const a = triangleVertices[base];
    const b = triangleVertices[base + 1];
    const c = triangleVertices[base + 2];
    if (a === b || b === c || c === a) {
      return { eligible: false, reason: 'degenerate-triangle', triangles: triangleCount, components: 0 };
    }
    ab.set(
      canonicalCoordinates[b * 3] - canonicalCoordinates[a * 3],
      canonicalCoordinates[b * 3 + 1] - canonicalCoordinates[a * 3 + 1],
      canonicalCoordinates[b * 3 + 2] - canonicalCoordinates[a * 3 + 2],
    );
    ac.set(
      canonicalCoordinates[c * 3] - canonicalCoordinates[a * 3],
      canonicalCoordinates[c * 3 + 1] - canonicalCoordinates[a * 3 + 1],
      canonicalCoordinates[c * 3 + 2] - canonicalCoordinates[a * 3 + 2],
    );
    face.crossVectors(ab, ac);
    const faceLength = face.length();
    if (!Number.isFinite(faceLength) || faceLength * faceLength <= areaSquaredEpsilon) {
      return { eligible: false, reason: 'degenerate-triangle', triangles: triangleCount, components: 0 };
    }

    const vertices = [a, b, c] as const;
    for (let edgeIndex = 0; edgeIndex < 3; edgeIndex += 1) {
      const from = vertices[edgeIndex];
      const to = vertices[(edgeIndex + 1) % 3];
      const low = Math.min(from, to);
      const high = Math.max(from, to);
      const key = low * canonicalCount + high;
      const direction: 1 | -1 = from === low ? 1 : -1;
      const edge = edges.get(key);
      if (!edge) {
        edges.set(key, { direction, firstTriangle: triangle, secondTriangle: -1, count: 1 });
      } else {
        edge.count += 1;
        if (edge.count > 2) {
          return { eligible: false, reason: 'open-or-non-manifold', triangles: triangleCount, components: 0 };
        }
        if (edge.direction === direction) {
          return { eligible: false, reason: 'inconsistent-winding', triangles: triangleCount, components: 0 };
        }
        edge.secondTriangle = triangle;
        unite(parent, ranks, edge.firstTriangle, triangle);
      }
    }
  }

  for (const edge of edges.values()) {
    if (edge.count !== 2 || edge.secondTriangle < 0) {
      return { eligible: false, reason: 'open-or-non-manifold', triangles: triangleCount, components: 0 };
    }
  }

  // Validate authored normals in a separate linear pass. Source vertex indices
  // are deliberately not welded here: every split normal must agree with its
  // own face, including vertices split at hard edges or UV seams.
  triangle = 0;
  for (const span of spans) {
    for (let offset = span.start; offset < span.end; offset += 3) {
      const base = triangle * 3;
      const a = triangleVertices[base];
      const b = triangleVertices[base + 1];
      const c = triangleVertices[base + 2];
      ab.set(
        canonicalCoordinates[b * 3] - canonicalCoordinates[a * 3],
        canonicalCoordinates[b * 3 + 1] - canonicalCoordinates[a * 3 + 1],
        canonicalCoordinates[b * 3 + 2] - canonicalCoordinates[a * 3 + 2],
      );
      ac.set(
        canonicalCoordinates[c * 3] - canonicalCoordinates[a * 3],
        canonicalCoordinates[c * 3 + 1] - canonicalCoordinates[a * 3 + 1],
        canonicalCoordinates[c * 3 + 2] - canonicalCoordinates[a * 3 + 2],
      );
      face.crossVectors(ab, ac);
      const faceLength = face.length();
      for (let corner = 0; corner < 3; corner += 1) {
        const sourceIndex = index ? index.getX(offset + corner) : offset + corner;
        if (sourceIndex >= normal.count) {
          return { eligible: false, reason: 'invalid-normals', triangles: triangleCount, components: 0 };
        }
        authoredNormal.fromBufferAttribute(normal, sourceIndex);
        const normalLength = authoredNormal.length();
        const alignment = face.dot(authoredNormal) / (faceLength * normalLength);
        if (!Number.isFinite(alignment) || alignment <= NORMAL_ALIGNMENT_EPSILON) {
          return { eligible: false, reason: 'invalid-normals', triangles: triangleCount, components: 0 };
        }
      }
      triangle += 1;
    }
  }

  const roots = new Set<number>();
  const componentReference = new Map<number, number>();
  const componentVolume = new Map<number, number>();
  const componentMin = new Map<number, THREE.Vector3>();
  const componentMax = new Map<number, THREE.Vector3>();
  const va = new THREE.Vector3();
  const vb = new THREE.Vector3();
  const vc = new THREE.Vector3();
  const reference = new THREE.Vector3();
  const cross = new THREE.Vector3();

  for (triangle = 0; triangle < triangleCount; triangle += 1) {
    const root = find(parent, triangle);
    roots.add(root);
    const base = triangle * 3;
    const a = triangleVertices[base];
    const b = triangleVertices[base + 1];
    const c = triangleVertices[base + 2];
    if (!componentReference.has(root)) componentReference.set(root, a);
    const referenceIndex = componentReference.get(root)!;
    reference.fromArray(canonicalCoordinates, referenceIndex * 3);
    va.fromArray(canonicalCoordinates, a * 3).sub(reference);
    vb.fromArray(canonicalCoordinates, b * 3).sub(reference);
    vc.fromArray(canonicalCoordinates, c * 3).sub(reference);
    const volume = va.dot(cross.crossVectors(vb, vc)) / 6;
    componentVolume.set(root, (componentVolume.get(root) ?? 0) + volume);

    let boundsMin = componentMin.get(root);
    let boundsMax = componentMax.get(root);
    if (!boundsMin || !boundsMax) {
      boundsMin = new THREE.Vector3(Infinity, Infinity, Infinity);
      boundsMax = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
      componentMin.set(root, boundsMin);
      componentMax.set(root, boundsMax);
    }
    boundsMin.min(va.add(reference)).min(vb.add(reference)).min(vc.add(reference));
    boundsMax.max(va).max(vb).max(vc);
  }

  for (const root of roots) {
    const boundsMin = componentMin.get(root)!;
    const boundsMax = componentMax.get(root)!;
    const componentExtent = Math.max(
      boundsMax.x - boundsMin.x,
      boundsMax.y - boundsMin.y,
      boundsMax.z - boundsMin.z,
    );
    const volumeEpsilon = componentExtent ** 3 * 1e-10;
    const volume = componentVolume.get(root)!;
    if (!Number.isFinite(volume) || volume <= volumeEpsilon) {
      return { eligible: false, reason: 'inward-or-zero-volume', triangles: triangleCount, components: roots.size };
    }
  }

  return { eligible: true, triangles: triangleCount, components: roots.size };
}

function materialCloneFactory(stats: ArchitectureBackfaceStats): (material: THREE.Material) => THREE.Material {
  const materialClones = new Map<THREE.Material, THREE.Material>();
  return material => {
    let clone = materialClones.get(material);
    if (!clone) {
      clone = material.clone();
      clone.side = THREE.FrontSide;
      // Preserve the source DoubleSide shadow behavior. Three otherwise maps
      // a null shadowSide on a FrontSide material to a back-face-only shadow
      // pass, which would be a separate visual change from color-pass culling.
      if (clone.shadowSide === null) clone.shadowSide = THREE.DoubleSide;
      clone.needsUpdate = true;
      materialClones.set(material, clone);
      stats.materialClones += 1;
    }
    return clone;
  };
}

function replaceEligibleMaterials(
  object: THREE.Mesh,
  eligibleSlots: readonly number[],
  frontMaterial: (material: THREE.Material) => THREE.Material,
): void {
  if (Array.isArray(object.material)) {
    const replacements = object.material.slice();
    for (const slot of eligibleSlots) replacements[slot] = frontMaterial(replacements[slot]);
    object.material = replacements;
  } else {
    object.material = frontMaterial(object.material);
  }
}

/** Expensive proof used only by the offline manifest preparation script. */
function proveArchitectureBackfaces(
  source: THREE.Object3D,
  onEligible?: (meshOrdinal: number, triangles: number) => void,
): ArchitectureBackfaceStats {
  const stats = createStats(false);
  source.updateMatrixWorld(true);
  const topologyCache = new WeakMap<THREE.BufferGeometry, Map<string, TopologyResult>>();
  const frontMaterial = materialCloneFactory(stats);
  let meshOrdinal = 0;

  source.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const ordinal = meshOrdinal++;
    stats.meshesVisited += 1;
    if (object instanceof THREE.SkinnedMesh || object instanceof THREE.InstancedMesh
      || Object.keys(object.geometry.morphAttributes).length > 0) {
      stats.skippedMeshes['animated-or-instanced'] += 1;
      return;
    }
    const determinant = object.matrixWorld.determinant();
    if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) {
      stats.skippedMeshes['invalid-transform'] += 1;
      return;
    }
    if (determinant < 0) stats.mirroredMeshes += 1;

    const materials = Array.isArray(object.material) ? object.material : [object.material];
    const eligibleSlots: number[] = [];
    materials.forEach((material, slot) => {
      stats.materialAssignmentsConsidered += 1;
      const rejection = materialRejection(material);
      if (rejection) stats.skippedMaterials[rejection] += 1;
      else eligibleSlots.push(slot);
    });
    if (!eligibleSlots.length) {
      stats.skippedMeshes['no-opaque-double-sided-material'] += 1;
      return;
    }

    const spans = activeDrawSpans(object);
    if (!spans) {
      stats.skippedMeshes['invalid-draw-ranges'] += 1;
      return;
    }
    const signature = spanSignature(spans);
    let geometryResults = topologyCache.get(object.geometry);
    if (!geometryResults) {
      geometryResults = new Map();
      topologyCache.set(object.geometry, geometryResults);
    }
    let topology = geometryResults.get(signature);
    if (!topology) {
      topology = topologyOf(object, spans);
      geometryResults.set(signature, topology);
      stats.geometriesAnalyzed += 1;
      stats.trianglesAnalyzed += topology.triangles;
      stats.closedComponents += topology.components;
    }
    if (!topology.eligible) {
      stats.skippedMeshes[topology.reason ?? 'missing-or-invalid-geometry'] += 1;
      return;
    }

    replaceEligibleMaterials(object, eligibleSlots, frontMaterial);
    stats.meshesEligible += 1;
    stats.meshesChanged += 1;
    stats.trianglesEligible += topology.triangles;
    stats.materialAssignmentsChanged += eligibleSlots.length;
    onEligible?.(ordinal, topology.triangles);
  });

  return stats;
}

/** Build the compact decision table consumed by the browser helper. */
export function prepareArchitectureBackfaceManifest(
  source: THREE.Object3D,
  assets: Record<string, string>,
): { manifest: ArchitectureBackfaceManifest; stats: ArchitectureBackfaceStats } {
  const structure = architectureStructureFingerprint(source);
  const bits = new Uint8Array(Math.ceil(structure.meshCount / 8));
  const stats = proveArchitectureBackfaces(source, ordinal => {
    bits[ordinal >> 3] |= 1 << (ordinal & 7);
  });
  let binary = '';
  for (const byte of bits) binary += String.fromCharCode(byte);
  return {
    manifest: {
      version: 1,
      assets,
      structureFingerprint: structure.fingerprint,
      meshCount: structure.meshCount,
      eligibleMeshCount: stats.meshesEligible,
      eligibleTriangles: stats.trianglesEligible,
      eligibleBitset: btoa(binary),
    },
    stats,
  };
}

function normalizedAssetPath(assetPath: string): string {
  try {
    return new URL(assetPath, 'https://local.invalid').pathname;
  } catch {
    return assetPath;
  }
}

async function currentVerifiedAssets(
  supplied?: Record<string, string>,
): Promise<Record<string, string> | undefined> {
  if (supplied) return supplied;
  if (typeof location === 'undefined') return undefined;
  try {
    const response = await fetch('/models/house-gpu-manifest.json');
    if (!response.ok) return undefined;
    const report = await response.json() as { sourceSha256?: string; outputSha256?: string };
    if (!report.sourceSha256 || !report.outputSha256) return undefined;
    return {
      '/models/house.glb': report.sourceSha256,
      '/models/house-gpu.glb': report.outputSha256,
    };
  } catch {
    return undefined;
  }
}

/**
 * Change only offline-verified closed, consistently outward-wound opaque source
 * meshes to front-face rendering. Geometry, textures, transforms and hitboxes
 * are not modified. A missing or stale manifest safely leaves every material
 * unchanged. Call after material customization and before shader hooks/batching.
 */
export async function applyArchitectureBackfaces(
  source: THREE.Object3D,
  options: ArchitectureBackfaceOptions = {},
): Promise<ArchitectureBackfaceStats> {
  const enabled = options.enabled ?? architectureBackfacesEnabled(options.search);
  const stats = createStats(!enabled);
  if (!enabled) return stats;

  const search = options.search ?? (typeof location === 'undefined' ? '' : location.search);
  const defaultAsset = new URLSearchParams(search).get('textures') === 'original'
    ? '/models/house.glb' : '/models/house-gpu.glb';
  const assetPath = normalizedAssetPath(options.assetPath ?? defaultAsset);
  const manifest = backfaceManifest as ArchitectureBackfaceManifest;
  const structure = architectureStructureFingerprint(source);
  const verifiedAssets = await currentVerifiedAssets(options.verifiedAssets);
  if (manifest.version !== 1) stats.manifestReason = 'unsupported manifest version';
  else if (!verifiedAssets) stats.manifestReason = 'asset hash report unavailable';
  else if (manifest.assets['/models/house.glb'] !== verifiedAssets['/models/house.glb']
    || manifest.assets['/models/house-gpu.glb'] !== verifiedAssets['/models/house-gpu.glb']) {
    stats.manifestReason = 'asset hashes changed';
  } else if (!manifest.assets[assetPath]) stats.manifestReason = `unverified asset: ${assetPath}`;
  else if (structure.meshCount !== manifest.meshCount) stats.manifestReason = 'mesh count changed';
  else if (structure.fingerprint !== manifest.structureFingerprint) stats.manifestReason = 'mesh structure changed';
  else if (atob(manifest.eligibleBitset).length * 8 < manifest.meshCount) stats.manifestReason = 'truncated eligibility table';
  if (stats.manifestReason) {
    stats.meshesVisited = structure.meshCount;
    return stats;
  }
  stats.manifestMatched = true;

  const eligibility = atob(manifest.eligibleBitset);
  const isEligibleOrdinal = (ordinal: number): boolean => (
    (eligibility.charCodeAt(ordinal >> 3) & (1 << (ordinal & 7))) !== 0
  );
  source.updateMatrixWorld(true);
  const frontMaterial = materialCloneFactory(stats);
  let meshOrdinal = 0;
  source.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const ordinal = meshOrdinal++;
    stats.meshesVisited += 1;
    if (object instanceof THREE.SkinnedMesh || object instanceof THREE.InstancedMesh
      || Object.keys(object.geometry.morphAttributes).length > 0) {
      stats.skippedMeshes['animated-or-instanced'] += 1;
      return;
    }
    const determinant = object.matrixWorld.determinant();
    if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) {
      stats.skippedMeshes['invalid-transform'] += 1;
      return;
    }
    if (determinant < 0) stats.mirroredMeshes += 1;

    const materials = Array.isArray(object.material) ? object.material : [object.material];
    const eligibleSlots: number[] = [];
    materials.forEach((material, slot) => {
      stats.materialAssignmentsConsidered += 1;
      const rejection = materialRejection(material);
      if (rejection) stats.skippedMaterials[rejection] += 1;
      else eligibleSlots.push(slot);
    });
    if (!eligibleSlots.length) {
      stats.skippedMeshes['no-opaque-double-sided-material'] += 1;
      return;
    }
    if (!isEligibleOrdinal(ordinal)) {
      stats.skippedMeshes['not-in-verified-manifest'] += 1;
      return;
    }
    const spans = activeDrawSpans(object);
    if (!spans) {
      stats.skippedMeshes['invalid-draw-ranges'] += 1;
      return;
    }
    const triangles = spans.reduce((total, span) => total + (span.end - span.start) / 3, 0);
    replaceEligibleMaterials(object, eligibleSlots, frontMaterial);
    stats.meshesEligible += 1;
    stats.meshesChanged += 1;
    stats.trianglesEligible += triangles;
    stats.materialAssignmentsChanged += eligibleSlots.length;
  });
  return stats;
}
