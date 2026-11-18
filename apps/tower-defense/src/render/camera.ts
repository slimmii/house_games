import * as THREE from 'three';
import { FLOOR_Y } from './dollhouse';

/** Horizontal rectangle the camera target may roam (the play area of the first floor). */
export const CAMERA_BOUNDS = { minX: 3, maxX: 20, minZ: -30, maxZ: -1.5 };
/** Close enough to watch one skirmish, far enough that the camera stays above the cut walls. */
const MIN_DISTANCE = 12;
const MAX_DISTANCE = 54;
/** Radians above the floor: lower would look through the outer walls. */
const MIN_PITCH = 0.66;
const MAX_PITCH = 1.42;
const DRAG_THRESHOLD = 6;
/** The cabinet wall on the east side cannot be cut away, so the camera stays off that side. */
const MIN_YAW = -Math.PI - 0.45;
const MAX_YAW = 0.3;

export type GroundPick = { x: number; z: number; y: number };
export type PickSurface = { minX: number; maxX: number; minZ: number; maxZ: number; y: number };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * A child's view of the floor: the camera orbits a point on the floor.
 * Mouse: left-drag pans, right-drag (or Alt-drag) turns, wheel zooms.
 * Touch: one finger pans, two fingers zoom and turn.
 * Keys: WASD or arrows pan, Q/E turn, +/- zoom.
 */
export class CommanderCamera {
  // A near plane this far out keeps depth precise at the distances this camera works at.
  readonly camera = new THREE.PerspectiveCamera(32, 1, 1, 150);
  /** Called for a click or tap that was not a drag, with normalised device coordinates. */
  onTap: (ndc: THREE.Vector2, event: PointerEvent) => void = () => undefined;
  /** Called while a mouse pointer hovers (no buttons down). */
  onHover: (ndc: THREE.Vector2) => void = () => undefined;

  private readonly target = new THREE.Vector3(14.6, FLOOR_Y, -11);
  private readonly goal = new THREE.Vector3(14.6, FLOOR_Y, -11);
  private yaw = -0.62;
  private goalYaw = -0.62;
  private pitch = 0.98;
  private goalPitch = 0.98;
  private distance = 36;
  private goalDistance = 36;
  private readonly pointers = new Map<number, { x: number; y: number; startX: number; startY: number; button: number }>();
  private dragging = false;
  private pinch: { distance: number; angle: number } | undefined;
  private readonly keys = new Set<string>();
  private readonly raycaster = new THREE.Raycaster();
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly hit = new THREE.Vector3();
  private readonly ndc = new THREE.Vector2();

  constructor(private readonly element: HTMLElement) {
    element.addEventListener('pointerdown', this.pointerDown);
    element.addEventListener('pointermove', this.pointerMove);
    element.addEventListener('pointerup', this.pointerUp);
    element.addEventListener('pointercancel', this.pointerUp);
    element.addEventListener('wheel', this.wheel, { passive: false });
    element.addEventListener('contextmenu', event => event.preventDefault());
    addEventListener('keydown', this.keyDown);
    addEventListener('keyup', this.keyUp);
    addEventListener('blur', () => this.keys.clear());
    this.apply();
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    // Portrait screens get a wider lens so the room still fits.
    this.camera.fov = width < height ? 46 : 32;
    this.camera.updateProjectionMatrix();
  }

  /** Direction from the target to the camera, for the wall cutaways. */
  get heading(): number { return this.yaw; }

  /** Jump (or glide) to a framing; used for the title screen and the start of a game. */
  frame(view: { x: number; z: number; yaw: number; pitch: number; distance: number }, instant = false): void {
    this.goal.set(view.x, FLOOR_Y, view.z);
    this.goalYaw = view.yaw;
    this.goalPitch = view.pitch;
    this.goalDistance = view.distance;
    if (instant) {
      this.target.copy(this.goal);
      this.yaw = view.yaw;
      this.pitch = view.pitch;
      this.distance = view.distance;
      this.apply();
    }
  }

  update(dt: number): void {
    const pan = 14 * dt * (this.goalDistance / 30);
    let forward = 0;
    let side = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) forward += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) forward -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) side += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) side -= 1;
    if (forward || side) this.panBy(side * pan, forward * pan);
    if (this.keys.has('KeyQ')) this.goalYaw += 1.6 * dt;
    if (this.keys.has('KeyE')) this.goalYaw -= 1.6 * dt;
    if (this.keys.has('Equal') || this.keys.has('NumpadAdd')) this.zoomBy(1 - 1.2 * dt);
    if (this.keys.has('Minus') || this.keys.has('NumpadSubtract')) this.zoomBy(1 + 1.2 * dt);
    this.goalYaw = clamp(this.goalYaw, MIN_YAW, MAX_YAW);
    const ease = 1 - Math.exp(-dt * 12);
    this.target.lerp(this.goal, ease);
    this.yaw += (this.goalYaw - this.yaw) * ease;
    this.pitch += (this.goalPitch - this.pitch) * ease;
    this.distance += (this.goalDistance - this.distance) * ease;
    this.apply();
  }

  /** Where a screen point meets the floor, or the highest listed surface under it. */
  pick(ndc: THREE.Vector2, surfaces: readonly PickSurface[] = []): GroundPick | undefined {
    this.raycaster.setFromCamera(ndc, this.camera);
    const ray = this.raycaster.ray;
    let best: GroundPick | undefined;
    for (const surface of surfaces) {
      this.plane.constant = -surface.y;
      if (!ray.intersectPlane(this.plane, this.hit)) continue;
      if (this.hit.x < surface.minX || this.hit.x > surface.maxX || this.hit.z < surface.minZ || this.hit.z > surface.maxZ) continue;
      if (!best || surface.y > best.y) best = { x: this.hit.x, z: this.hit.z, y: surface.y };
    }
    if (best) return best;
    this.plane.constant = -FLOOR_Y;
    if (!ray.intersectPlane(this.plane, this.hit)) return undefined;
    return { x: this.hit.x, z: this.hit.z, y: FLOOR_Y };
  }

  private apply(): void {
    const flat = Math.cos(this.pitch) * this.distance;
    this.camera.position.set(
      this.target.x + Math.sin(this.yaw) * flat,
      this.target.y + Math.sin(this.pitch) * this.distance,
      this.target.z + Math.cos(this.yaw) * flat,
    );
    this.camera.lookAt(this.target);
  }

  /** Move the target along the screen's right and up directions, flattened to the floor. */
  private panBy(right: number, forward: number): void {
    const sin = Math.sin(this.goalYaw);
    const cos = Math.cos(this.goalYaw);
    this.goal.x = clamp(this.goal.x + cos * right - sin * forward, CAMERA_BOUNDS.minX, CAMERA_BOUNDS.maxX);
    this.goal.z = clamp(this.goal.z - sin * right - cos * forward, CAMERA_BOUNDS.minZ, CAMERA_BOUNDS.maxZ);
  }

  private zoomBy(factor: number): void {
    this.goalDistance = clamp(this.goalDistance * factor, MIN_DISTANCE, MAX_DISTANCE);
  }

  private toNdc(event: { clientX: number; clientY: number }): THREE.Vector2 {
    const rect = this.element.getBoundingClientRect();
    return this.ndc.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
  }

  private readonly pointerDown = (event: PointerEvent): void => {
    this.element.setPointerCapture(event.pointerId);
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, button: event.button });
    this.dragging = this.pointers.size > 1;
    this.pinch = undefined;
  };

  private readonly pointerMove = (event: PointerEvent): void => {
    const pointer = this.pointers.get(event.pointerId);
    if (!pointer) {
      if (event.pointerType === 'mouse') this.onHover(this.toNdc(event));
      return;
    }
    const dx = event.clientX - pointer.x;
    const dy = event.clientY - pointer.y;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    if (this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const angle = Math.atan2(a.y - b.y, a.x - b.x);
      if (this.pinch) {
        this.zoomBy(this.pinch.distance / Math.max(distance, 1));
        let turn = angle - this.pinch.angle;
        if (turn > Math.PI) turn -= Math.PI * 2;
        if (turn < -Math.PI) turn += Math.PI * 2;
        this.goalYaw -= turn;
      }
      this.pinch = { distance, angle };
      return;
    }
    if (!this.dragging && Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) < DRAG_THRESHOLD) return;
    this.dragging = true;
    const height = this.element.clientHeight || 1;
    if (pointer.button === 2 || event.altKey) {
      this.goalYaw -= dx * 0.006;
      this.goalPitch = clamp(this.goalPitch + dy * 0.005, MIN_PITCH, MAX_PITCH);
    } else {
      // One screen height of drag moves about one view height of floor.
      const unitsPerPixel = (2 * this.goalDistance * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) / height;
      this.panBy(-dx * unitsPerPixel, dy * unitsPerPixel / Math.max(Math.sin(this.goalPitch), 0.5));
    }
  };

  private readonly pointerUp = (event: PointerEvent): void => {
    const pointer = this.pointers.get(event.pointerId);
    this.pointers.delete(event.pointerId);
    this.pinch = undefined;
    if (pointer && !this.dragging && event.type === 'pointerup' && pointer.button === 0) this.onTap(this.toNdc(event), event);
    if (this.pointers.size === 0) this.dragging = false;
  };

  private readonly wheel = (event: WheelEvent): void => {
    event.preventDefault();
    if (event.ctrlKey) this.zoomBy(Math.exp(event.deltaY * 0.01));
    else this.zoomBy(Math.exp(clamp(event.deltaY, -120, 120) * 0.0016));
  };

  private readonly keyDown = (event: KeyboardEvent): void => {
    if (event.target instanceof HTMLInputElement || event.metaKey || event.ctrlKey) return;
    this.keys.add(event.code);
  };

  private readonly keyUp = (event: KeyboardEvent): void => { this.keys.delete(event.code); };
}
