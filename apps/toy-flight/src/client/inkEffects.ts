import * as THREE from 'three';
import { resolvePaintPose } from '../shared/paint';
import type { DoorState } from '@huis/house/shared/doors';
import type { PaintMark, Vec3 } from '../shared/protocol';

const MAX_BURST_PARTICLES = 320;
const PARTICLES_PER_SPLAT = 11;
const BURST_LIFETIME = .46;

const seeded = (seed: number) => {
  let state = (seed ^ 0xa511e9b3) >>> 0;
  return () => {
    state = Math.imul(state ^ state >>> 16, 0x21f0aaad);
    state = Math.imul(state ^ state >>> 15, 0x735a2d97);
    state ^= state >>> 15;
    return (state >>> 0) / 0x100000000;
  };
};

/** Short, bounded point-sprite bursts for newly observed authoritative impacts. */
export class InkEffects {
  private readonly geometry = new THREE.BufferGeometry();
  private readonly material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    vertexColors: true,
    uniforms: {},
    vertexShader: `
      attribute float size;
      attribute float alpha;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vColor = color;
        vAlpha = alpha;
        vec4 view = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = max(1.0, size * 330.0 / max(0.25, -view.z));
        gl_Position = projectionMatrix * view;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vec2 p = gl_PointCoord * 2.0 - 1.0;
        float radius = dot(p, p);
        if (radius > 1.0) discard;
        float edge = smoothstep(1.0, 0.58, radius);
        vec3 glossy = mix(vColor * 0.72, min(vec3(1.0), vColor * 1.2 + 0.18), edge);
        gl_FragColor = vec4(glossy, vAlpha * smoothstep(1.0, 0.72, radius));
      }
    `,
  });
  private readonly points = new THREE.Points(this.geometry, this.material);
  private readonly positions = new Float32Array(MAX_BURST_PARTICLES * 3);
  private readonly velocities = new Float32Array(MAX_BURST_PARTICLES * 3);
  private readonly colors = new Float32Array(MAX_BURST_PARTICLES * 3);
  private readonly sizes = new Float32Array(MAX_BURST_PARTICLES);
  private readonly alphas = new Float32Array(MAX_BURST_PARTICLES);
  private readonly lives = new Float32Array(MAX_BURST_PARTICLES);
  private readonly positionAttribute = new THREE.BufferAttribute(this.positions, 3);
  private readonly colorAttribute = new THREE.BufferAttribute(this.colors, 3);
  private readonly sizeAttribute = new THREE.BufferAttribute(this.sizes, 1);
  private readonly alphaAttribute = new THREE.BufferAttribute(this.alphas, 1);
  private readonly color = new THREE.Color();
  private count = 0;
  private latestMarkId = 0;
  private initialized = false;

  constructor(scene: THREE.Scene) {
    this.positionAttribute.setUsage(THREE.DynamicDrawUsage);
    this.colorAttribute.setUsage(THREE.DynamicDrawUsage);
    this.sizeAttribute.setUsage(THREE.DynamicDrawUsage);
    this.alphaAttribute.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('position', this.positionAttribute);
    this.geometry.setAttribute('color', this.colorAttribute);
    this.geometry.setAttribute('size', this.sizeAttribute);
    this.geometry.setAttribute('alpha', this.alphaAttribute);
    this.geometry.setDrawRange(0, 0);
    this.points.name = 'ink-impact-bursts';
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
    scene.add(this.points);
  }

  /** Returns true when a newly observed surface impact belongs to the local color. */
  reconcile(marks: readonly PaintMark[], localColor?: string, states: readonly DoorState[] = []): boolean {
    const newest = marks.at(-1)?.id ?? 0;
    if (!this.initialized) {
      this.latestMarkId = newest;
      this.initialized = true;
      return false;
    }
    let localHit = false;
    const additions = marks.filter(mark => mark.id > this.latestMarkId).slice(-12);
    for (const mark of additions) {
      const pose = mark.attachment && states.length ? resolvePaintPose(mark, states) : { position: mark.position, normal: mark.normal };
      this.emit(mark, pose.position, pose.normal);
      if (localColor && mark.color.toLowerCase() === localColor.toLowerCase()) localHit = true;
    }
    this.latestMarkId = Math.max(this.latestMarkId, newest);
    return localHit;
  }

  reset(): void {
    this.count = 0;
    this.latestMarkId = 0;
    this.initialized = false;
    this.geometry.setDrawRange(0, 0);
  }

  update(dt: number): void {
    if (!this.count || dt <= 0) return;
    let write = 0;
    for (let read = 0; read < this.count; read += 1) {
      const life = this.lives[read] - dt;
      if (life <= 0) continue;
      const source = read * 3, target = write * 3;
      const vx = this.velocities[source], vy = this.velocities[source + 1] - 1.35 * dt, vz = this.velocities[source + 2];
      this.positions[target] = this.positions[source] + vx * dt;
      this.positions[target + 1] = this.positions[source + 1] + vy * dt;
      this.positions[target + 2] = this.positions[source + 2] + vz * dt;
      this.velocities[target] = vx;
      this.velocities[target + 1] = vy;
      this.velocities[target + 2] = vz;
      this.colors[target] = this.colors[source];
      this.colors[target + 1] = this.colors[source + 1];
      this.colors[target + 2] = this.colors[source + 2];
      this.sizes[write] = this.sizes[read];
      this.lives[write] = life;
      this.alphas[write] = Math.min(1, life / .16);
      write += 1;
    }
    this.count = write;
    this.geometry.setDrawRange(0, write);
    this.positionAttribute.needsUpdate = true;
    this.colorAttribute.needsUpdate = true;
    this.sizeAttribute.needsUpdate = true;
    this.alphaAttribute.needsUpdate = true;
  }

  dispose(): void {
    this.points.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }

  private emit(mark: PaintMark, position: Vec3, impactNormal: Vec3): void {
    const random = seeded(mark.id);
    const normal = new THREE.Vector3(impactNormal.x, impactNormal.y, impactNormal.z).normalize();
    const tangent = new THREE.Vector3().crossVectors(Math.abs(normal.y) < .86 ? InkEffects.Y_AXIS : InkEffects.X_AXIS, normal).normalize();
    const bitangent = new THREE.Vector3().crossVectors(normal, tangent).normalize();
    this.color.set(mark.color);
    for (let particle = 0; particle < PARTICLES_PER_SPLAT; particle += 1) {
      if (this.count >= MAX_BURST_PARTICLES) this.dropOldest();
      const index = this.count++, offset = index * 3;
      const angle = random() * Math.PI * 2;
      const tangentSpeed = .25 + random() * 1.1;
      const normalSpeed = .18 + random() * .7;
      this.positions[offset] = position.x + impactNormal.x * .025;
      this.positions[offset + 1] = position.y + impactNormal.y * .025;
      this.positions[offset + 2] = position.z + impactNormal.z * .025;
      this.velocities[offset] = normal.x * normalSpeed + (tangent.x * Math.cos(angle) + bitangent.x * Math.sin(angle)) * tangentSpeed;
      this.velocities[offset + 1] = normal.y * normalSpeed + (tangent.y * Math.cos(angle) + bitangent.y * Math.sin(angle)) * tangentSpeed;
      this.velocities[offset + 2] = normal.z * normalSpeed + (tangent.z * Math.cos(angle) + bitangent.z * Math.sin(angle)) * tangentSpeed;
      this.colors[offset] = this.color.r;
      this.colors[offset + 1] = this.color.g;
      this.colors[offset + 2] = this.color.b;
      this.sizes[index] = .025 + random() * .055;
      this.lives[index] = BURST_LIFETIME * (.68 + random() * .32);
      this.alphas[index] = 1;
    }
    this.geometry.setDrawRange(0, this.count);
  }

  private dropOldest(): void {
    this.positions.copyWithin(0, 3, this.count * 3);
    this.velocities.copyWithin(0, 3, this.count * 3);
    this.colors.copyWithin(0, 3, this.count * 3);
    this.sizes.copyWithin(0, 1, this.count);
    this.alphas.copyWithin(0, 1, this.count);
    this.lives.copyWithin(0, 1, this.count);
    this.count -= 1;
  }

  private static readonly X_AXIS = new THREE.Vector3(1, 0, 0);
  private static readonly Y_AXIS = new THREE.Vector3(0, 1, 0);
}

/** Gesture-gated, restrained synthesized feedback with no downloaded assets. */
export class InkAudio {
  private context?: AudioContext;
  private muted = false;

  get isMuted(): boolean { return this.muted; }

  unlock(): void {
    if (this.context) { void this.context.resume(); return; }
    const Audio = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Audio) return;
    this.context = new Audio();
  }

  toggle(): boolean {
    this.muted = !this.muted;
    if (!this.muted) this.unlock();
    return this.muted;
  }

  shot(): void { this.tone(155, 82, .045, .025, 'square'); }
  splat(): void { this.tone(92, 48, .09, .045, 'sine'); }

  dispose(): void { void this.context?.close(); this.context = undefined; }

  private tone(start: number, end: number, duration: number, gainValue: number, type: OscillatorType): void {
    if (this.muted || !this.context || this.context.state !== 'running') return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(start, now);
    oscillator.frequency.exponentialRampToValueAtTime(end, now + duration);
    gain.gain.setValueAtTime(gainValue, now);
    gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
    oscillator.connect(gain).connect(this.context.destination);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    oscillator.start(now);
    oscillator.stop(now + duration);
  }
}
