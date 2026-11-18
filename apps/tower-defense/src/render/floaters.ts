import * as THREE from 'three';

type Floater = { element: HTMLDivElement; position: THREE.Vector3; age: number; life: number };

/** Small texts that rise from a spot in the room and fade ("+5", "-1"). */
export class Floaters {
  private readonly layer = document.createElement('div');
  private readonly active: Floater[] = [];
  private readonly idle: HTMLDivElement[] = [];
  private readonly projected = new THREE.Vector3();

  constructor(mount: HTMLElement) {
    this.layer.className = 'floaters';
    mount.append(this.layer);
  }

  add(text: string, x: number, y: number, z: number, tone: 'coin' | 'bad' | 'info' = 'coin'): void {
    if (this.active.length >= 40) return;
    const element = this.idle.pop() ?? document.createElement('div');
    element.className = `floater floater-${tone}`;
    element.textContent = text;
    this.layer.append(element);
    this.active.push({ element, position: new THREE.Vector3(x, y, z), age: 0, life: 1.1 });
  }

  update(dt: number, camera: THREE.Camera, width: number, height: number): void {
    for (let index = this.active.length - 1; index >= 0; index -= 1) {
      const floater = this.active[index];
      floater.age += dt;
      if (floater.age >= floater.life) {
        floater.element.remove();
        this.idle.push(floater.element);
        this.active.splice(index, 1);
        continue;
      }
      const t = floater.age / floater.life;
      this.projected.copy(floater.position);
      this.projected.y += t * 0.9;
      this.projected.project(camera);
      const x = (this.projected.x * 0.5 + 0.5) * width;
      const y = (-this.projected.y * 0.5 + 0.5) * height;
      floater.element.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%) scale(${(0.8 + Math.min(1, t * 6) * 0.3).toFixed(2)})`;
      floater.element.style.opacity = (t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3).toFixed(2);
    }
  }

  clear(): void {
    for (const floater of this.active) floater.element.remove();
    this.active.length = 0;
  }
}
