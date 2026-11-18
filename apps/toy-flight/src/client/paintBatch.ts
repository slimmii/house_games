import * as THREE from 'three';
import { installProbeShader } from '@huis/house/client/probeLighting';
import { rayPaintSurfaces } from '@huis/house/shared/paint-surfaces';
import { doorComponentBoxes, doorPartPose, type DoorState, type SolidBox } from '@huis/house/shared/doors';
import { paintAttachmentDoorIndex } from '../shared/paint';
import { MAX_PAINTS, type PaintMark, type Vec3 } from '../shared/protocol';

const CORE_LOBES = 24;
const DROPLETS = 6;
const DROP_LOBES = 9;
const CORE_CENTER = 0;
const CORE_INNER = 1;
const CORE_OUTER = CORE_INNER + CORE_LOBES;
const DROP_START = CORE_OUTER + CORE_LOBES;
export const INK_VERTICES_PER_MARK = DROP_START + DROPLETS * (DROP_LOBES + 1);
export const INK_INDICES_PER_MARK = CORE_LOBES * 9 + DROPLETS * DROP_LOBES * 3;
const SURFACE_OFFSET = .009;
const STATIC_PROBE = .04;
const STATIC_EPSILON = .018;

type SurfaceSupport = {
  box?: SolidBox;
  normalAxis: 0 | 1 | 2;
  tangentAxes: [0 | 1 | 2, 0 | 1 | 2];
};

const components = (value: Vec3): [number, number, number] => [value.x, value.y, value.z];
const distance = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

function seeded(seed: number): () => number {
  let state = (seed ^ 0x9e3779b9) >>> 0;
  return () => {
    state = Math.imul(state ^ state >>> 16, 0x21f0aaad);
    state = Math.imul(state ^ state >>> 15, 0x735a2d97);
    state ^= state >>> 15;
    return (state >>> 0) / 0x100000000;
  };
}

function dominantAxis(normal: Vec3): 0 | 1 | 2 {
  const a = [Math.abs(normal.x), Math.abs(normal.y), Math.abs(normal.z)];
  return a[1] > a[0] && a[1] >= a[2] ? 1 : a[2] > a[0] ? 2 : 0;
}

function supportFor(mark: PaintMark, doorIndex: number, partIndex: number): SurfaceSupport {
  const position = mark.attachment?.position ?? mark.position;
  const normal = mark.attachment?.normal ?? mark.normal;
  const normalAxis = dominantAxis(normal);
  const normalValues = components(normal);
  const tangentAxes = [0, 1, 2].filter(axis => axis !== normalAxis) as Array<0 | 1 | 2>;
  let nearest: SolidBox | undefined;
  let nearestScore = Infinity;
  if (doorIndex >= 0) {
    const values = components(position);
    for (const box of doorComponentBoxes(doorIndex, partIndex, 'collision')) {
      const face = normalValues[normalAxis] >= 0 ? box.max[normalAxis] : box.min[normalAxis];
      let score = Math.abs(values[normalAxis] - face);
      for (const axis of tangentAxes) {
        if (values[axis] < box.min[axis]) score += box.min[axis] - values[axis];
        else if (values[axis] > box.max[axis]) score += values[axis] - box.max[axis];
      }
      if (score < nearestScore) { nearestScore = score; nearest = box; }
    }
  }
  return { box: nearest, normalAxis, tangentAxes: [tangentAxes[0], tangentAxes[1]] };
}

function staticSurfaceSupports(point: Vec3, normal: Vec3): boolean {
  const start = { x: point.x + normal.x * STATIC_PROBE, y: point.y + normal.y * STATIC_PROBE, z: point.z + normal.z * STATIC_PROBE };
  const end = { x: point.x - normal.x * STATIC_PROBE, y: point.y - normal.y * STATIC_PROBE, z: point.z - normal.z * STATIC_PROBE };
  const hit = rayPaintSurfaces(start, end);
  return !!hit && distance(hit.position, point) <= STATIC_EPSILON
    && hit.normal.x * normal.x + hit.normal.y * normal.y + hit.normal.z * normal.z > .78;
}

function clampAttachedRay(center: Vec3, candidate: Vec3, support: SurfaceSupport): Vec3 {
  if (!support.box) return { ...center };
  const source = components(center), target = components(candidate);
  let scale = 1;
  for (const axis of support.tangentAxes) {
    const delta = target[axis] - source[axis];
    if (delta > 1e-9) scale = Math.min(scale, (support.box.max[axis] - .003 - source[axis]) / delta);
    else if (delta < -1e-9) scale = Math.min(scale, (support.box.min[axis] + .003 - source[axis]) / delta);
  }
  scale = Math.max(0, Math.min(1, scale));
  return {
    x: center.x + (candidate.x - center.x) * scale,
    y: center.y + (candidate.y - center.y) * scale,
    z: center.z + (candidate.z - center.z) * scale,
  };
}

function clipStaticRay(center: Vec3, candidate: Vec3, normal: Vec3): Vec3 {
  if (staticSurfaceSupports(candidate, normal)) return candidate;
  let low = 0, high = 1;
  for (let iteration = 0; iteration < 7; iteration += 1) {
    const fraction = (low + high) * .5;
    const point = {
      x: center.x + (candidate.x - center.x) * fraction,
      y: center.y + (candidate.y - center.y) * fraction,
      z: center.z + (candidate.z - center.z) * fraction,
    };
    if (staticSurfaceSupports(point, normal)) low = fraction;
    else high = fraction;
  }
  return {
    x: center.x + (candidate.x - center.x) * low,
    y: center.y + (candidate.y - center.y) * low,
    z: center.z + (candidate.z - center.z) * low,
  };
}

function attachedDropFits(center: Vec3, radius: number, support: SurfaceSupport): boolean {
  if (!support.box) return false;
  const values = components(center);
  return support.tangentAxes.every(axis => values[axis] - radius >= support.box!.min[axis] + .003
    && values[axis] + radius <= support.box!.max[axis] - .003);
}

function staticDropFits(center: Vec3, radius: number, tangent: Vec3, bitangent: Vec3, normal: Vec3): boolean {
  if (!staticSurfaceSupports(center, normal)) return false;
  for (let edge = 0; edge < DROP_LOBES; edge += 1) {
    const angle = edge / DROP_LOBES * Math.PI * 2;
    const x = Math.cos(angle), y = Math.sin(angle);
    if (!staticSurfaceSupports({
      x: center.x + (tangent.x * x + bitangent.x * y) * radius,
      y: center.y + (tangent.y * x + bitangent.y * y) * radius,
      z: center.z + (tangent.z * x + bitangent.z * y) * radius,
    }, normal)) return false;
  }
  return true;
}

/** Fixed-capacity opaque ink renderer with deterministic, surface-clipped patches. */
export class PaintBatch {
  private readonly geometry = new THREE.BufferGeometry();
  private readonly material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: .24,
    metalness: 0,
    // Alpha remains one, but joining the transparent render queue lets wet ink
    // coat alpha-blended wall illustrations instead of being composited behind them.
    transparent: true,
    opacity: 1,
    side: THREE.DoubleSide,
    // Marks are indexed oldest-to-newest. Keep world depth testing while
    // allowing the newest wet color to coat an older coplanar patch cleanly.
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -1,
  });
  private readonly mesh = new THREE.Mesh(this.geometry, (installProbeShader(this.material), this.material));
  private readonly positions = new Float32Array(MAX_PAINTS * INK_VERTICES_PER_MARK * 3);
  private readonly closedPositions = new Float32Array(MAX_PAINTS * INK_VERTICES_PER_MARK * 3);
  private readonly normals = new Float32Array(MAX_PAINTS * INK_VERTICES_PER_MARK * 3);
  private readonly closedNormals = new Float32Array(MAX_PAINTS * INK_VERTICES_PER_MARK * 3);
  private readonly colors = new Float32Array(MAX_PAINTS * INK_VERTICES_PER_MARK * 3);
  private readonly indices = new Uint32Array(MAX_PAINTS * INK_INDICES_PER_MARK);
  private readonly positionAttribute = new THREE.BufferAttribute(this.positions, 3);
  private readonly normalAttribute = new THREE.BufferAttribute(this.normals, 3);
  private readonly colorAttribute = new THREE.BufferAttribute(this.colors, 3);
  private readonly indexAttribute = new THREE.BufferAttribute(this.indices, 1);
  private readonly slotsById = new Map<number, number>();
  private readonly ids = new Float64Array(MAX_PAINTS);
  private readonly seen = new Uint32Array(MAX_PAINTS);
  private readonly centers = new Float64Array(MAX_PAINTS * 3);
  private readonly closedCenters = new Float64Array(MAX_PAINTS * 3);
  private readonly doorIndices = new Int16Array(MAX_PAINTS);
  private readonly partIndices = new Int16Array(MAX_PAINTS);
  private readonly displayedFractions = new Float64Array(MAX_PAINTS);
  private readonly activeSlots: number[] = [];
  private readonly freeSlots: number[] = [];
  private readonly normal = new THREE.Vector3();
  private readonly tangent = new THREE.Vector3();
  private readonly bitangent = new THREE.Vector3();
  private readonly color = new THREE.Color();
  private readonly rimColor = new THREE.Color();
  private generation = 0;

  constructor(scene: THREE.Scene) {
    this.doorIndices.fill(-1);
    this.partIndices.fill(-1);
    this.displayedFractions.fill(Number.NaN);
    for (let slot = MAX_PAINTS - 1; slot >= 0; slot -= 1) this.freeSlots.push(slot);
    this.positionAttribute.setUsage(THREE.DynamicDrawUsage);
    this.normalAttribute.setUsage(THREE.DynamicDrawUsage);
    this.colorAttribute.setUsage(THREE.DynamicDrawUsage);
    this.indexAttribute.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('position', this.positionAttribute);
    this.geometry.setAttribute('normal', this.normalAttribute);
    this.geometry.setAttribute('color', this.colorAttribute);
    this.geometry.setIndex(this.indexAttribute);
    this.geometry.setDrawRange(0, 0);
    this.mesh.name = 'paint-batch';
    this.mesh.renderOrder = 3;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  reconcile(marks: PaintMark[]): void {
    this.generation = (this.generation + 1) >>> 0;
    if (this.generation === 0) { this.seen.fill(0); this.generation = 1; }
    for (const mark of marks) {
      const slot = this.slotsById.get(mark.id);
      if (slot !== undefined) this.seen[slot] = this.generation;
    }
    let kept = 0, topologyChanged = false;
    for (const slot of this.activeSlots) {
      if (this.seen[slot] === this.generation) { this.activeSlots[kept++] = slot; continue; }
      this.slotsById.delete(this.ids[slot]);
      this.doorIndices[slot] = -1;
      this.partIndices[slot] = -1;
      this.displayedFractions[slot] = Number.NaN;
      this.freeSlots.push(slot);
      topologyChanged = true;
    }
    this.activeSlots.length = kept;
    for (const mark of marks) {
      if (this.slotsById.has(mark.id)) continue;
      const slot = this.freeSlots.pop();
      if (slot === undefined) break;
      this.slotsById.set(mark.id, slot);
      this.ids[slot] = mark.id;
      this.seen[slot] = this.generation;
      this.activeSlots.push(slot);
      this.writeMark(slot, mark);
      topologyChanged = true;
    }
    if (topologyChanged) this.writeIndices();
  }

  /** Move attached vertices and glossy normals with the exact articulated component pose. */
  update(states: readonly DoorState[]): void {
    let changed = false;
    for (const slot of this.activeSlots) {
      const doorIndex = this.doorIndices[slot];
      if (doorIndex < 0) continue;
      const fraction = states[doorIndex]?.fraction ?? 0;
      if (fraction === this.displayedFractions[slot]) continue;
      const pose = doorPartPose(doorIndex, fraction, this.partIndices[slot]);
      const cx = Math.cos(pose.rotationX), sx = Math.sin(pose.rotationX);
      const cy = Math.cos(pose.rotationY), sy = Math.sin(pose.rotationY);
      const cz = Math.cos(pose.rotationZ), sz = Math.sin(pose.rotationZ);
      const vertexOffset = slot * INK_VERTICES_PER_MARK * 3;
      for (let vertexIndex = 0; vertexIndex < INK_VERTICES_PER_MARK; vertexIndex += 1) {
        const offset = vertexOffset + vertexIndex * 3;
        const x = this.closedPositions[offset] - pose.origin[0];
        const y = this.closedPositions[offset + 1] - pose.origin[1];
        const z = this.closedPositions[offset + 2] - pose.origin[2];
        const ry = cx * y - sx * z, rz = sx * y + cx * z;
        const rx = cy * x + sy * rz, rzz = -sy * x + cy * rz;
        this.positions[offset] = cz * rx - sz * ry + pose.position[0];
        this.positions[offset + 1] = sz * rx + cz * ry + pose.position[1];
        this.positions[offset + 2] = rzz + pose.position[2];
        const nx = this.closedNormals[offset], ny = this.closedNormals[offset + 1], nz = this.closedNormals[offset + 2];
        const nry = cx * ny - sx * nz, nrz = sx * ny + cx * nz;
        const nrx = cy * nx + sy * nrz, nrzz = -sy * nx + cy * nrz;
        this.normals[offset] = cz * nrx - sz * nry;
        this.normals[offset + 1] = sz * nrx + cz * nry;
        this.normals[offset + 2] = nrzz;
      }
      const centerOffset = slot * 3;
      const x = this.closedCenters[centerOffset] - pose.origin[0];
      const y = this.closedCenters[centerOffset + 1] - pose.origin[1];
      const z = this.closedCenters[centerOffset + 2] - pose.origin[2];
      const ry = cx * y - sx * z, rz = sx * y + cx * z;
      const rx = cy * x + sy * rz, rzz = -sy * x + cy * rz;
      this.centers[centerOffset] = cz * rx - sz * ry + pose.position[0];
      this.centers[centerOffset + 1] = sz * rx + cz * ry + pose.position[1];
      this.centers[centerOffset + 2] = rzz + pose.position[2];
      this.displayedFractions[slot] = fraction;
      changed = true;
    }
    if (changed) { this.positionAttribute.needsUpdate = true; this.normalAttribute.needsUpdate = true; }
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
    this.slotsById.clear();
    this.activeSlots.length = 0;
    this.freeSlots.length = 0;
    this.doorIndices.fill(-1);
    this.partIndices.fill(-1);
  }

  private setVertex(slot: number, index: number, position: Vec3, normal: Vec3, color: THREE.Color): void {
    const offset = (slot * INK_VERTICES_PER_MARK + index) * 3;
    this.positions[offset] = this.closedPositions[offset] = position.x;
    this.positions[offset + 1] = this.closedPositions[offset + 1] = position.y;
    this.positions[offset + 2] = this.closedPositions[offset + 2] = position.z;
    this.normals[offset] = this.closedNormals[offset] = normal.x;
    this.normals[offset + 1] = this.closedNormals[offset + 1] = normal.y;
    this.normals[offset + 2] = this.closedNormals[offset + 2] = normal.z;
    this.colors[offset] = color.r;
    this.colors[offset + 1] = color.g;
    this.colors[offset + 2] = color.b;
  }

  private raised(point: Vec3, normal: Vec3, height: number): Vec3 {
    return { x: point.x + normal.x * height, y: point.y + normal.y * height, z: point.z + normal.z * height };
  }

  private writeMark(slot: number, mark: PaintMark): void {
    const attachment = mark.attachment;
    const doorIndex = paintAttachmentDoorIndex(mark);
    const partIndex = attachment?.partIndex ?? 0;
    const position = doorIndex >= 0 ? attachment!.position : mark.position;
    const sourceNormal = doorIndex >= 0 ? attachment!.normal : mark.normal;
    this.doorIndices[slot] = doorIndex;
    this.partIndices[slot] = doorIndex >= 0 ? partIndex : -1;
    this.displayedFractions[slot] = Number.NaN;
    this.normal.set(sourceNormal.x, sourceNormal.y, sourceNormal.z);
    if (this.normal.lengthSq() < 1e-8) this.normal.set(0, 1, 0); else this.normal.normalize();
    const helper = Math.abs(this.normal.y) < .86 ? PaintBatch.Y_AXIS : PaintBatch.X_AXIS;
    this.tangent.crossVectors(helper, this.normal).normalize();
    this.bitangent.crossVectors(this.normal, this.tangent).normalize();
    const normal = { x: this.normal.x, y: this.normal.y, z: this.normal.z };
    const tangent = { x: this.tangent.x, y: this.tangent.y, z: this.tangent.z };
    const bitangent = { x: this.bitangent.x, y: this.bitangent.y, z: this.bitangent.z };
    const support = supportFor(mark, doorIndex, partIndex);
    const random = seeded(mark.id);
    const baseRadius = Math.max(.13, mark.size * (1.62 + random() * .3));
    this.color.set(mark.color);
    const hsl = { h: 0, s: 0, l: 0 };
    this.color.getHSL(hsl);
    this.color.setHSL(hsl.h, Math.min(1, hsl.s * 1.12 + .04), Math.min(.68, Math.max(.34, hsl.l * 1.02)));
    this.rimColor.copy(this.color).multiplyScalar(.78);
    const center = { ...position };
    this.setVertex(slot, CORE_CENTER, this.raised(center, normal, SURFACE_OFFSET + .006), normal, this.color);
    const rawRadii = Array.from({ length: CORE_LOBES }, (_value, lobe) => {
      const angle = lobe / CORE_LOBES * Math.PI * 2;
      return baseRadius * (
        .76 + random() * .28
        + .14 * Math.sin(angle * 2 + mark.id * .73)
        + .075 * Math.sin(angle * 3 - mark.id * .41)
      );
    });
    const radii = rawRadii.map((radius, lobe) => (
      rawRadii[(lobe + CORE_LOBES - 1) % CORE_LOBES] + radius * 2 + rawRadii[(lobe + 1) % CORE_LOBES]
    ) / 4);
    for (let lobe = 0; lobe < CORE_LOBES; lobe += 1) {
      const angle = lobe / CORE_LOBES * Math.PI * 2;
      const radius = radii[lobe];
      let candidate = {
        x: center.x + (tangent.x * Math.cos(angle) + bitangent.x * Math.sin(angle)) * radius,
        y: center.y + (tangent.y * Math.cos(angle) + bitangent.y * Math.sin(angle)) * radius,
        z: center.z + (tangent.z * Math.cos(angle) + bitangent.z * Math.sin(angle)) * radius,
      };
      candidate = doorIndex >= 0 ? clampAttachedRay(center, candidate, support) : clipStaticRay(center, candidate, normal);
      const innerScale = .94 + .012 * Math.sin(angle * 3 + mark.id * .29);
      const inner = {
        x: center.x + (candidate.x - center.x) * innerScale,
        y: center.y + (candidate.y - center.y) * innerScale,
        z: center.z + (candidate.z - center.z) * innerScale,
      };
      const radial = new THREE.Vector3(candidate.x - center.x, candidate.y - center.y, candidate.z - center.z);
      if (radial.lengthSq() > 1e-10) radial.normalize().multiplyScalar(.04);
      radial.add(this.normal).normalize();
      this.setVertex(slot, CORE_INNER + lobe, this.raised(inner, normal, SURFACE_OFFSET + .004), normal, this.color);
      this.setVertex(slot, CORE_OUTER + lobe, this.raised(candidate, normal, SURFACE_OFFSET), radial, this.rimColor);
    }
    for (let droplet = 0; droplet < DROPLETS; droplet += 1) {
      const angle = random() * Math.PI * 2;
      const spread = baseRadius * (1.18 + random() * .82);
      const radius = baseRadius * (.105 + random() * .105);
      const dropCenter = {
        x: center.x + (tangent.x * Math.cos(angle) + bitangent.x * Math.sin(angle)) * spread,
        y: center.y + (tangent.y * Math.cos(angle) + bitangent.y * Math.sin(angle)) * spread,
        z: center.z + (tangent.z * Math.cos(angle) + bitangent.z * Math.sin(angle)) * spread,
      };
      const visible = doorIndex >= 0 ? attachedDropFits(dropCenter, radius, support)
        : staticDropFits(dropCenter, radius, tangent, bitangent, normal);
      const shownCenter = visible ? dropCenter : center;
      const shownRadius = visible ? radius : 0;
      const first = DROP_START + droplet * (DROP_LOBES + 1);
      this.setVertex(slot, first, this.raised(shownCenter, normal, SURFACE_OFFSET + .005), normal, this.color);
      for (let edge = 0; edge < DROP_LOBES; edge += 1) {
        const a = edge / DROP_LOBES * Math.PI * 2;
        const point = {
          x: shownCenter.x + (tangent.x * Math.cos(a) + bitangent.x * Math.sin(a)) * shownRadius,
          y: shownCenter.y + (tangent.y * Math.cos(a) + bitangent.y * Math.sin(a)) * shownRadius,
          z: shownCenter.z + (tangent.z * Math.cos(a) + bitangent.z * Math.sin(a)) * shownRadius,
        };
        this.setVertex(slot, first + edge + 1, this.raised(point, normal, SURFACE_OFFSET), normal, this.rimColor);
      }
    }
    const centerOffset = slot * 3;
    const raisedCenter = this.raised(center, normal, SURFACE_OFFSET + .006);
    this.centers[centerOffset] = this.closedCenters[centerOffset] = raisedCenter.x;
    this.centers[centerOffset + 1] = this.closedCenters[centerOffset + 1] = raisedCenter.y;
    this.centers[centerOffset + 2] = this.closedCenters[centerOffset + 2] = raisedCenter.z;
    this.positionAttribute.needsUpdate = true;
    this.normalAttribute.needsUpdate = true;
    this.colorAttribute.needsUpdate = true;
  }

  private writeIndices(): void {
    let output = 0;
    for (const slot of this.activeSlots) {
      const vertex = slot * INK_VERTICES_PER_MARK;
      for (let lobe = 0; lobe < CORE_LOBES; lobe += 1) {
        const next = (lobe + 1) % CORE_LOBES;
        this.indices[output++] = vertex + CORE_CENTER;
        this.indices[output++] = vertex + CORE_INNER + lobe;
        this.indices[output++] = vertex + CORE_INNER + next;
        this.indices[output++] = vertex + CORE_INNER + lobe;
        this.indices[output++] = vertex + CORE_OUTER + lobe;
        this.indices[output++] = vertex + CORE_OUTER + next;
        this.indices[output++] = vertex + CORE_INNER + lobe;
        this.indices[output++] = vertex + CORE_OUTER + next;
        this.indices[output++] = vertex + CORE_INNER + next;
      }
      for (let droplet = 0; droplet < DROPLETS; droplet += 1) {
        const first = vertex + DROP_START + droplet * (DROP_LOBES + 1);
        for (let edge = 0; edge < DROP_LOBES; edge += 1) {
          this.indices[output++] = first;
          this.indices[output++] = first + edge + 1;
          this.indices[output++] = first + (edge + 1) % DROP_LOBES + 1;
        }
      }

    }
    this.geometry.setDrawRange(0, output);
    this.indexAttribute.needsUpdate = true;
  }

  private static readonly X_AXIS = new THREE.Vector3(1, 0, 0);
  private static readonly Y_AXIS = new THREE.Vector3(0, 1, 0);
}
