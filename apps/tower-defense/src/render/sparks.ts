import * as THREE from 'three';

const CAPACITY = 1600;

export type SparkOptions = {
  count: number;
  color: THREE.ColorRepresentation;
  /** Second colour to mix in at random (confetti). */
  color2?: THREE.ColorRepresentation;
  speed: number;
  /** Upward bias of the launch direction, 0 (ring on the floor) to 1 (fountain). */
  lift?: number;
  life: number;
  size: number;
  gravity?: number;
  /** Start radius around the origin. */
  spread?: number;
};

/** Pooled point particles for pops, confetti, splats and dust. */
export class Sparks {
  private readonly positions = new Float32Array(CAPACITY * 3);
  private readonly colors = new Float32Array(CAPACITY * 3);
  /** x: size, y: remaining life share. */
  private readonly looks = new Float32Array(CAPACITY * 2);
  private readonly velocities = new Float32Array(CAPACITY * 3);
  private readonly lives = new Float32Array(CAPACITY);
  private readonly spans = new Float32Array(CAPACITY);
  private readonly gravities = new Float32Array(CAPACITY);
  private readonly floors = new Float32Array(CAPACITY);
  private readonly geometry = new THREE.BufferGeometry();
  private readonly points: THREE.Points;
  private cursor = 0;
  private readonly a = new THREE.Color();
  private readonly b = new THREE.Color();

  constructor(scene: THREE.Scene) {
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('look', new THREE.BufferAttribute(this.looks, 2).setUsage(THREE.DynamicDrawUsage));
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { scale: { value: 600 } },
      vertexShader: `
        attribute vec2 look;
        attribute vec3 color;
        uniform float scale;
        varying vec3 vColor;
        varying float vLife;
        void main() {
          vColor = color;
          vLife = look.y;
          vec4 view = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * view;
          gl_PointSize = look.y > 0.0 ? look.x * scale / -view.z : 0.0;
        }`,
      fragmentShader: `
        varying vec3 vColor;
        varying float vLife;
        void main() {
          vec2 offset = gl_PointCoord - 0.5;
          float distance = length(offset);
          if (distance > 0.5) discard;
          float edge = smoothstep(0.5, 0.36, distance);
          gl_FragColor = vec4(vColor * (0.82 + 0.18 * smoothstep(0.4, 0.0, distance)), edge * smoothstep(0.0, 0.35, vLife));
          #include <colorspace_fragment>
        }`,
    });
    this.points = new THREE.Points(this.geometry, material);
    this.points.name = 'sparks';
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
    scene.add(this.points);
  }

  /** Points are sized in world units; keep them in step with the canvas height and lens. */
  setViewport(height: number, fovDegrees: number): void {
    (this.points.material as THREE.ShaderMaterial).uniforms.scale.value = height / (2 * Math.tan(THREE.MathUtils.degToRad(fovDegrees) / 2));
  }

  emit(x: number, y: number, z: number, floorY: number, options: SparkOptions): void {
    this.a.set(options.color);
    this.b.set(options.color2 ?? options.color);
    const lift = options.lift ?? 0.6;
    for (let index = 0; index < options.count; index += 1) {
      const slot = this.cursor;
      this.cursor = (this.cursor + 1) % CAPACITY;
      const angle = Math.random() * Math.PI * 2;
      const up = lift * (0.5 + Math.random() * 0.8);
      const out = Math.sqrt(Math.max(0, 1 - Math.min(1, up) ** 2)) * (0.5 + Math.random() * 0.5);
      const speed = options.speed * (0.55 + Math.random() * 0.7);
      const spread = (options.spread ?? 0) * Math.sqrt(Math.random());
      this.positions[slot * 3] = x + Math.cos(angle) * spread;
      this.positions[slot * 3 + 1] = y;
      this.positions[slot * 3 + 2] = z + Math.sin(angle) * spread;
      this.velocities[slot * 3] = Math.cos(angle) * out * speed;
      this.velocities[slot * 3 + 1] = up * speed;
      this.velocities[slot * 3 + 2] = Math.sin(angle) * out * speed;
      const color = Math.random() < 0.5 ? this.a : this.b;
      this.colors[slot * 3] = color.r;
      this.colors[slot * 3 + 1] = color.g;
      this.colors[slot * 3 + 2] = color.b;
      this.looks[slot * 2] = options.size * (0.7 + Math.random() * 0.6);
      this.looks[slot * 2 + 1] = 1;
      this.spans[slot] = this.lives[slot] = options.life * (0.7 + Math.random() * 0.6);
      this.gravities[slot] = options.gravity ?? 6;
      this.floors[slot] = floorY + 0.02;
    }
  }

  update(dt: number): void {
    for (let slot = 0; slot < CAPACITY; slot += 1) {
      if (this.lives[slot] <= 0) continue;
      this.lives[slot] -= dt;
      const life = Math.max(0, this.lives[slot] / this.spans[slot]);
      this.looks[slot * 2 + 1] = life;
      this.velocities[slot * 3 + 1] -= this.gravities[slot] * dt;
      this.positions[slot * 3] += this.velocities[slot * 3] * dt;
      this.positions[slot * 3 + 1] += this.velocities[slot * 3 + 1] * dt;
      this.positions[slot * 3 + 2] += this.velocities[slot * 3 + 2] * dt;
      if (this.positions[slot * 3 + 1] < this.floors[slot]) {
        // Bounce once or twice like bits of plastic, losing most of the energy.
        this.positions[slot * 3 + 1] = this.floors[slot];
        this.velocities[slot * 3 + 1] *= -0.35;
        this.velocities[slot * 3] *= 0.6;
        this.velocities[slot * 3 + 2] *= 0.6;
      }
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.look.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
  }
}
