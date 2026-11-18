import * as THREE from 'three';
import { installProbeShader } from '@huis/house/client/probeLighting';
import { INK_PROJECTILE_CAP } from '../shared/ink';
import type { ProjectileState } from '../shared/protocol';

export const INK_TRAIL_BLOBS = 4;
const INSTANCES_PER_PROJECTILE = INK_TRAIL_BLOBS + 1;
const POOL_CAPACITY = INK_PROJECTILE_CAP * INSTANCES_PER_PROJECTILE;

type ColorPool = {
  mesh: THREE.InstancedMesh;
  material: THREE.MeshStandardMaterial;
  count: number;
};

/** Pooled glossy ink capsules with a short chain of fluid droplets. */
export class ProjectileBatch {
  private readonly geometry = new THREE.SphereGeometry(1, 10, 7);
  private readonly pools = new Map<string, ColorPool>();
  private readonly position = new THREE.Vector3();
  private readonly velocity = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly lateral = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();
  private readonly quaternion = new THREE.Quaternion();
  private readonly matrix = new THREE.Matrix4();
  private readonly color = new THREE.Color();

  constructor(private readonly scene: THREE.Scene) {}

  reconcile(projectiles: ProjectileState[]): void {
    for (const pool of this.pools.values()) pool.count = 0;
    let total = 0;
    for (const projectile of projectiles) {
      if (total++ >= INK_PROJECTILE_CAP) break;
      const pool = this.poolFor(projectile.color);
      this.velocity.set(projectile.velocity.x, projectile.velocity.y, projectile.velocity.z);
      const speed = this.velocity.length();
      if (speed < 1e-6) this.direction.set(0, 0, 1); else this.direction.copy(this.velocity).multiplyScalar(1 / speed);
      this.quaternion.setFromUnitVectors(ProjectileBatch.Y_AXIS, this.direction);
      this.lateral.crossVectors(this.direction, Math.abs(this.direction.y) < .9 ? ProjectileBatch.Y_AXIS : ProjectileBatch.X_AXIS).normalize();

      for (let blob = 0; blob <= INK_TRAIL_BLOBS; blob += 1) {
        const trail = blob / INK_TRAIL_BLOBS;
        const back = blob === 0 ? 0 : .08 + trail * .3;
        const wobble = blob === 0 ? 0 : Math.sin(projectile.id * 2.17 + blob * 1.9) * .018 * trail;
        this.position.set(
          projectile.position.x - this.direction.x * back + this.lateral.x * wobble,
          projectile.position.y - this.direction.y * back + this.lateral.y * wobble,
          projectile.position.z - this.direction.z * back + this.lateral.z * wobble,
        );
        const radius = blob === 0 ? .064 : .043 * (1 - trail * .48);
        const length = blob === 0 ? .16 : radius * (1.18 + (1 - trail) * .65);
        this.scale.set(radius, length, radius);
        this.matrix.compose(this.position, this.quaternion, this.scale);
        pool.mesh.setMatrixAt(pool.count++, this.matrix);
      }
    }
    for (const pool of this.pools.values()) {
      pool.mesh.count = pool.count;
      if (pool.count > 0) pool.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  dispose(): void {
    for (const pool of this.pools.values()) {
      pool.mesh.removeFromParent();
      pool.mesh.dispose();
      pool.material.dispose();
    }
    this.pools.clear();
    this.geometry.dispose();
  }

  private poolFor(colorValue: string): ColorPool {
    let pool = this.pools.get(colorValue);
    if (pool) return pool;
    this.color.set(colorValue);
    const material = new THREE.MeshStandardMaterial({
      color: this.color,
      emissive: this.color,
      emissiveIntensity: .18,
      roughness: .16,
      metalness: 0,
    });
    installProbeShader(material);
    const mesh = new THREE.InstancedMesh(this.geometry, material, POOL_CAPACITY);
    mesh.name = `ink-projectiles-${colorValue}`;
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    pool = { mesh, material, count: 0 };
    this.pools.set(colorValue, pool);
    this.scene.add(mesh);
    return pool;
  }

  private static readonly X_AXIS = new THREE.Vector3(1, 0, 0);
  private static readonly Y_AXIS = new THREE.Vector3(0, 1, 0);
}
