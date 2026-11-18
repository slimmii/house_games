import * as THREE from 'three';
import { FINISHES, type Finish, type ToyModel, type ToyPiece } from './toys/kit';
import type { ToyMaterials } from './toyMaterial';

type Pool = { mesh: THREE.InstancedMesh; count: number; capacity: number };

const WHITE = new THREE.Color(1, 1, 1);

/**
 * Draws every toy of the frame with instancing: one InstancedMesh per
 * (model piece, finish). Call `begin`, `add` each toy, then `end`.
 */
export class ToyBatch {
  private readonly pools = new Map<THREE.BufferGeometry, Pool>();
  private readonly group = new THREE.Group();
  private readonly local = new THREE.Matrix4();
  private readonly world = new THREE.Matrix4();
  private readonly rotation = new THREE.Quaternion();
  private readonly axis = new THREE.Vector3();
  private readonly pivot = new THREE.Vector3();
  private readonly one = new THREE.Vector3(1, 1, 1);
  private readonly tinted = new THREE.Color();
  private readonly plain = new THREE.Color();

  constructor(scene: THREE.Scene, private readonly materials: ToyMaterials) {
    this.group.name = 'toys';
    scene.add(this.group);
  }

  begin(): void {
    for (const pool of this.pools.values()) pool.count = 0;
  }

  /**
   * @param matrix world transform of the toy's floor origin
   * @param tint multiplies the baked colours of `plastic` parts only (the plastic colour of a soldier)
   * @param turretYaw radians, relative to the toy's facing
   * @param time seconds, drives spinning pieces
   * @param flash 0..1 brightens every part (hit feedback)
   */
  add(model: ToyModel, matrix: THREE.Matrix4, tint: THREE.Color = WHITE, turretYaw = 0, time = 0, flash = 0): void {
    const boost = 1 + flash * 1.6;
    this.tinted.copy(tint).multiplyScalar(boost);
    this.plain.setScalar(boost);
    for (const piece of model.pieces) {
      this.pivot.fromArray(piece.pivot);
      if (piece.kind === 'turret') this.rotation.setFromAxisAngle(this.axis.set(0, 1, 0), turretYaw);
      else if (piece.kind === 'spin') this.rotation.setFromAxisAngle(this.axis.fromArray(piece.axis), time * piece.speed * Math.PI * 2);
      else this.rotation.identity();
      this.local.compose(this.pivot, this.rotation, this.one);
      this.world.multiplyMatrices(matrix, this.local);
      for (const finish of FINISHES) {
        const geometry = piece.geometry[finish];
        if (!geometry) continue;
        const pool = this.poolFor(geometry, finish, piece);
        if (pool.count >= pool.capacity) this.grow(geometry, pool, finish);
        const target = this.pools.get(geometry)!;
        target.mesh.setMatrixAt(target.count, this.world);
        target.mesh.setColorAt(target.count, finish === 'plastic' ? this.tinted : this.plain);
        target.count += 1;
      }
    }
  }

  end(): void {
    for (const pool of this.pools.values()) {
      pool.mesh.count = pool.count;
      pool.mesh.visible = pool.count > 0;
      if (pool.count === 0) continue;
      pool.mesh.instanceMatrix.needsUpdate = true;
      if (pool.mesh.instanceColor) pool.mesh.instanceColor.needsUpdate = true;
    }
  }

  dispose(): void {
    for (const pool of this.pools.values()) pool.mesh.dispose();
    this.pools.clear();
    this.group.removeFromParent();
  }

  private poolFor(geometry: THREE.BufferGeometry, finish: Finish, _piece: ToyPiece): Pool {
    let pool = this.pools.get(geometry);
    if (!pool) {
      pool = this.create(geometry, finish, 16);
      this.pools.set(geometry, pool);
    }
    return pool;
  }

  private create(geometry: THREE.BufferGeometry, finish: Finish, capacity: number): Pool {
    const mesh = new THREE.InstancedMesh(geometry, this.materials[finish], capacity);
    mesh.count = 0;
    // Instances are spread over the whole room; culling by the source geometry's bounds would hide them.
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.setColorAt(0, WHITE);
    mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    this.group.add(mesh);
    return { mesh, count: 0, capacity };
  }

  private grow(geometry: THREE.BufferGeometry, pool: Pool, finish: Finish): void {
    const bigger = this.create(geometry, finish, pool.capacity * 2);
    bigger.mesh.instanceMatrix.array.set(pool.mesh.instanceMatrix.array);
    bigger.mesh.instanceColor!.array.set(pool.mesh.instanceColor!.array);
    bigger.count = pool.count;
    pool.mesh.removeFromParent();
    pool.mesh.dispose();
    this.pools.set(geometry, bigger);
  }
}
