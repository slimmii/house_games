import * as THREE from 'three';

/** Soft round contact shadows: the room's toy lighting casts none, so these ground the toys. */
export class ShadowBatch {
  private readonly mesh: THREE.InstancedMesh;
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();
  private readonly flat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  private count = 0;

  constructor(scene: THREE.Scene, private readonly capacity = 1024) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const context = canvas.getContext('2d')!;
    const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.55, 'rgba(255,255,255,0.75)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.MeshBasicMaterial({
      color: '#1b140d', alphaMap: texture, transparent: true, opacity: 0.36, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(2, 2), material, capacity);
    this.mesh.name = 'toy-shadows';
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.renderOrder = 1;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.mesh);
  }

  begin(): void { this.count = 0; }

  /** `y` is the surface the shadow lies on; `lift` (height above it) spreads and fades the shadow. */
  add(x: number, y: number, z: number, radius: number, lift = 0): void {
    if (this.count >= this.capacity) return;
    // A toy high above the floor casts a smaller, lighter-looking spot.
    const spread = radius * (1.08 - Math.min(0.5, lift * 0.14));
    this.position.set(x, y + 0.012, z);
    this.scale.set(spread, spread, 1);
    this.matrix.compose(this.position, this.flat, this.scale);
    this.mesh.setMatrixAt(this.count++, this.matrix);
  }

  end(): void {
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
