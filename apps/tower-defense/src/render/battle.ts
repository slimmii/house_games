import * as THREE from 'three';
import { ENEMIES, type EnemyKind, type Tier } from '../sim/enemies';
import { FLOOR_Y } from '../sim/grid';
import { BASE, LANES, lanePoint, type LanePoint } from '../sim/map';
import { towerRange, type Enemy, type GameEvent, type GameState, type Tower } from '../sim/sim';
import { TOWERS, type TowerKind } from '../sim/towers';
import { WEST_LANE_WAVE } from '../sim/waves';
import { Floaters } from './floaters';
import { ShadowBatch } from './shadows';
import { Sparks } from './sparks';
import { createTapeRoute } from './tape';
import { ToyBatch } from './toyBatch';
import type { ToyMaterials } from './toyMaterial';
import { getToy, type ToyId } from './toys/index';
import { FINISHES, type ToyModel } from './toys/kit';

/** Plastic colours of the three soldier tiers. */
export const TIER_COLORS = ['#4f9a3c', '#c9a66b', '#8f98a0'] as const;
/**
 * Toys are drawn larger than they are modelled. At true toy size (a 17 cm
 * soldier in a 25-unit room) they are too small to read from the commander view.
 */
export const TOY_SCALE = 1.4;
const FORT_SCALE = 0.85;
const SHOT_SCALE = 1.7;
const SHOT_TOY: Record<TowerKind, ToyId> = { popgun: 'cork', dart: 'dart', mortar: 'marble', glue: 'glueBlob', ballista: 'band', robot: 'cork' };
const VEHICLES = new Set<EnemyKind>(['jeep', 'tank', 'general']);

type Fallen = { toy: ToyModel; x: number; y: number; z: number; yaw: number; tint: THREE.Color; age: number; side: number; scale: number };
type Ghost = { group: THREE.Group; material: THREE.MeshBasicMaterial; kind: TowerKind | null };

const UP = new THREE.Vector3(0, 1, 0);

function ringMesh(color: string, opacity: number): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.RingGeometry(0.965, 1, 72).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, depthTest: false }),
  );
  mesh.renderOrder = 4;
  mesh.visible = false;
  return mesh;
}

function discMesh(color: string, opacity: number): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(1, 64).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, depthTest: false }),
  );
  mesh.renderOrder = 3;
  mesh.visible = false;
  return mesh;
}

/** Draws the battle: toys, shots, effects and the markers for placing and selecting. */
export class Battle {
  readonly sparks: Sparks;
  readonly floaters: Floaters;
  private readonly toys: ToyBatch;
  private readonly shadows: ShadowBatch;
  private readonly group = new THREE.Group();
  private readonly tapeEast: THREE.Mesh;
  private readonly tapeWest: THREE.Mesh;
  private readonly fallen: Fallen[] = [];
  private readonly turretYaw = new Map<number, number>();
  private readonly topple = new Map<number, number>();
  private readonly tints = TIER_COLORS.map(color => new THREE.Color(color));
  private readonly gluey = new THREE.Color('#eef3e2');
  private readonly white = new THREE.Color(1, 1, 1);
  private readonly tint = new THREE.Color();
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly quaternion = new THREE.Quaternion();
  private readonly lean = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();
  private readonly euler = new THREE.Euler();
  private readonly point = {} as LanePoint;
  // Health bars, beams and glue puddles are simple instanced shapes.
  private readonly barBack: THREE.InstancedMesh;
  private readonly barFill: THREE.InstancedMesh;
  private readonly beams: THREE.InstancedMesh;
  private readonly puddles: THREE.InstancedMesh;
  private readonly rangeRing = ringMesh('#ffffff', 0.9);
  private readonly rangeDisc = discMesh('#ffffff', 0.12);
  private readonly selectRing = ringMesh('#f7c948', 1);
  private readonly aimRing = ringMesh('#58bdb0', 0.95);
  private readonly ghost: Ghost;
  private time = 0;
  private shake = 0;

  constructor(private readonly scene: THREE.Scene, materials: ToyMaterials, overlay: HTMLElement) {
    this.group.name = 'battle';
    scene.add(this.group);
    this.toys = new ToyBatch(scene, materials);
    this.shadows = new ShadowBatch(scene);
    this.sparks = new Sparks(scene);
    this.floaters = new Floaters(overlay);
    this.tapeEast = createTapeRoute(LANES.east, '#ead9a4', '#b5462f');
    this.tapeWest = createTapeRoute(LANES.west, '#8fc4e8', '#1f4e79');
    this.tapeWest.visible = false;
    this.group.add(this.tapeEast, this.tapeWest, this.rangeRing, this.rangeDisc, this.selectRing, this.aimRing);

    const bar = new THREE.PlaneGeometry(1, 1);
    const barMaterial = (color: string) => new THREE.MeshBasicMaterial({ color, depthTest: false, depthWrite: false, transparent: true });
    this.barBack = new THREE.InstancedMesh(bar, barMaterial('#2b2622'), 400);
    this.barFill = new THREE.InstancedMesh(bar, barMaterial('#ffffff'), 400);
    this.barBack.renderOrder = 5;
    this.barFill.renderOrder = 6;
    this.barFill.setColorAt(0, this.white);
    this.beams = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(1, 1, 1, 8, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5),
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
      64,
    );
    this.beams.setColorAt(0, this.white);
    this.puddles = new THREE.InstancedMesh(
      new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#fffdf2', transparent: true, opacity: 0.62, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
      96,
    );
    for (const mesh of [this.barBack, this.barFill, this.beams, this.puddles]) {
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(mesh);
    }
    this.puddles.renderOrder = 1;
    this.beams.renderOrder = 4;

    const ghostMaterial = new THREE.MeshBasicMaterial({ color: '#7be08a', transparent: true, opacity: 0.6, depthWrite: false });
    this.ghost = { group: new THREE.Group(), material: ghostMaterial, kind: null };
    this.ghost.group.visible = false;
    this.ghost.group.name = 'placing-ghost';
    this.rangeRing.name = 'range-ring';
    this.rangeDisc.name = 'range-disc';
    this.group.add(this.ghost.group);
  }

  resize(height: number, fov: number): void {
    this.sparks.setViewport(height, fov);
  }

  /** Clear everything left over from a previous game. */
  reset(): void {
    this.fallen.length = 0;
    this.turretYaw.clear();
    this.topple.clear();
    this.floaters.clear();
    this.tapeWest.visible = false;
    this.hideMarkers();
  }

  hideMarkers(): void {
    this.ghost.group.visible = false;
    this.rangeRing.visible = this.rangeDisc.visible = this.selectRing.visible = this.aimRing.visible = false;
  }

  /** Small camera jolt, in world units, that the caller adds to the camera. */
  get jolt(): number {
    return this.shake;
  }

  /** Translucent preview of a toy being placed, with its reach. */
  showGhost(kind: TowerKind, x: number, y: number, z: number, range: number, valid: boolean): void {
    if (this.ghost.kind !== kind) {
      this.ghost.group.clear();
      const model = getToy(`${kind}-1` as ToyId);
      for (const piece of model.pieces) {
        for (const finish of FINISHES) {
          const geometry = piece.geometry[finish];
          if (!geometry) continue;
          const mesh = new THREE.Mesh(geometry, this.ghost.material);
          mesh.position.fromArray(piece.pivot);
          mesh.renderOrder = 4;
          this.ghost.group.add(mesh);
        }
      }
      this.ghost.kind = kind;
    }
    this.ghost.material.color.set(valid ? '#7be08a' : '#ff6b5e');
    this.ghost.group.position.set(x, y, z);
    this.ghost.group.scale.setScalar(TOY_SCALE);
    this.ghost.group.visible = true;
    this.showRange(x, y, z, range, valid ? '#ffffff' : '#ff6b5e');
  }

  hideGhost(): void {
    this.ghost.group.visible = false;
  }

  showRange(x: number, y: number, z: number, range: number, color = '#ffffff'): void {
    for (const mesh of [this.rangeRing, this.rangeDisc]) {
      mesh.position.set(x, FLOOR_Y + 0.03, z);
      mesh.scale.setScalar(range);
      (mesh.material as THREE.MeshBasicMaterial).color.set(color);
      mesh.visible = true;
    }
    void y;
  }

  hideRange(): void {
    this.rangeRing.visible = this.rangeDisc.visible = false;
  }

  showSelection(tower: Tower | null): void {
    this.selectRing.visible = tower !== null;
    if (!tower) return;
    this.selectRing.position.set(tower.x, tower.y + 0.03, tower.z);
    this.selectRing.scale.setScalar(0.62 + Math.sin(this.time * 5) * 0.03);
    this.showRange(tower.x, tower.y, tower.z, towerRange(tower));
  }

  /** Marker for aiming an ability at the floor. */
  showAim(x: number, z: number, radius: number, valid: boolean): void {
    this.aimRing.visible = true;
    this.aimRing.position.set(x, FLOOR_Y + 0.03, z);
    this.aimRing.scale.setScalar(radius);
    (this.aimRing.material as THREE.MeshBasicMaterial).color.set(valid ? '#58bdb0' : '#ff6b5e');
  }

  hideAim(): void {
    this.aimRing.visible = false;
  }

  /** React to what happened in the simulation since the last frame. */
  handle(event: GameEvent, state: GameState): void {
    const sparks = this.sparks;
    switch (event.type) {
      case 'fire':
        if (event.tower === 'popgun' || event.tower === 'mortar') {
          sparks.emit(event.x, event.y, event.z, FLOOR_Y, { count: 4, color: '#fff4d6', speed: 1.1, life: 0.3, size: 0.09, gravity: 0, lift: 0.5 });
        }
        break;
      case 'hit':
        sparks.emit(event.x, event.y, event.z, FLOOR_Y, { count: 3, color: '#ffffff', color2: '#ffe08a', speed: 1.6, life: 0.3, size: 0.07, lift: 0.7 });
        break;
      case 'burst':
        sparks.emit(event.x, FLOOR_Y + 0.1, event.z, FLOOR_Y, { count: 26, color: '#4aa3ff', color2: '#b8e2ff', speed: 3.6, life: 0.6, size: 0.12, lift: 0.75, spread: event.radius * 0.3 });
        sparks.emit(event.x, FLOOR_Y + 0.05, event.z, FLOOR_Y, { count: 18, color: '#f3ead6', speed: event.radius * 2.6, life: 0.4, size: 0.16, lift: 0.08, gravity: 0 });
        break;
      case 'puddle':
        sparks.emit(event.x, FLOOR_Y + 0.08, event.z, FLOOR_Y, { count: 16, color: '#fffdf2', speed: 2.2, life: 0.5, size: 0.13, lift: 0.5, spread: event.radius * 0.4 });
        break;
      case 'die': {
        const def = ENEMIES[event.kind];
        const y = FLOOR_Y + event.altitude;
        const color = TIER_COLORS[event.tier];
        sparks.emit(event.x, y + 0.25, event.z, FLOOR_Y, {
          count: def.boss ? 90 : VEHICLES.has(event.kind) || def.flying ? 26 : 12,
          color, color2: def.boss ? '#f7c948' : '#fff4d6', speed: def.boss ? 5 : 2.8, life: def.boss ? 1.3 : 0.7,
          size: def.boss ? 0.2 : 0.11, lift: 0.9, spread: def.radius,
        });
        this.floaters.add(`+${event.bounty}`, event.x, y + 0.6, event.z, 'coin');
        if (def.boss) this.shake = 0.5;
        break;
      }
      case 'leak':
        sparks.emit(BASE.door.x, FLOOR_Y + 0.3, BASE.door.z, FLOOR_Y, { count: 22, color: '#f27654', color2: '#ffd2c2', speed: 3, life: 0.7, size: 0.14, lift: 0.8 });
        this.floaters.add(`−${event.lives}`, BASE.x, FLOOR_Y + 1.9, BASE.z, 'bad');
        this.shake = Math.max(this.shake, 0.25);
        break;
      case 'land':
        sparks.emit(event.x, FLOOR_Y + 0.05, event.z, FLOOR_Y, { count: 8, color: '#e9dcc4', speed: 1.4, life: 0.35, size: 0.12, lift: 0.15, gravity: 1 });
        break;
      case 'stomp':
        sparks.emit(event.x, FLOOR_Y + 0.05, event.z, FLOOR_Y, { count: 46, color: '#e9dcc4', color2: '#c9b28e', speed: event.radius * 2.2, life: 0.55, size: 0.2, lift: 0.1, gravity: 1 });
        this.shake = 0.45;
        break;
      case 'build':
        sparks.emit(event.x, event.y + 0.1, event.z, event.y, { count: 20, color: '#f3e6cf', color2: '#d9c7a4', speed: 2.2, life: 0.5, size: 0.14, lift: 0.3, gravity: 2 });
        break;
      case 'upgrade':
        sparks.emit(event.x, event.y + 0.3, event.z, event.y, { count: 30, color: '#f7c948', color2: '#fff6c9', speed: 2.6, life: 0.9, size: 0.11, lift: 1.4, gravity: 2.5, spread: 0.3 });
        break;
      case 'sell':
        sparks.emit(event.x, event.y + 0.3, event.z, event.y, { count: 14, color: '#f7c948', color2: '#e0a92e', speed: 2.6, life: 0.8, size: 0.13, lift: 1 });
        this.floaters.add(`+${event.refund}`, event.x, event.y + 0.9, event.z, 'coin');
        break;
      case 'waveClear':
        this.floaters.add(`Wave ${event.number} clear  +${event.bonus}`, BASE.x, FLOOR_Y + 2.3, BASE.z, 'info');
        break;
      case 'wave':
        if (event.number >= WEST_LANE_WAVE) this.tapeWest.visible = true;
        break;
      default:
        break;
    }
    void state;
  }

  /** Draw one frame of the game. `dt` is real time, for animation that should not follow game speed. */
  draw(state: GameState | null, dt: number, camera: THREE.Camera, width: number, height: number): void {
    this.time += dt;
    this.shake = Math.max(0, this.shake - dt * 1.8);
    this.toys.begin();
    this.shadows.begin();
    let bars = 0;
    let beams = 0;
    let puddles = 0;

    // The fort, door toward the room.
    this.matrix.compose(this.position.set(BASE.x, FLOOR_Y, BASE.z), this.quaternion.setFromAxisAngle(UP, Math.PI), this.scale.setScalar(FORT_SCALE));
    this.toys.add(getToy('fort'), this.matrix, this.white, 0, this.time);
    this.shadows.add(BASE.x, FLOOR_Y, BASE.z, 1.5);

    if (state) {
      this.tapeWest.visible = this.tapeWest.visible || state.wave >= WEST_LANE_WAVE - 1;
      for (const tower of state.towers) this.drawTower(tower, dt);
      for (const enemy of state.enemies) {
        if (enemy.health <= 0) continue;
        this.drawEnemy(enemy, dt);
        if (enemy.health < enemy.maxHealth && bars < 400) {
          const def = ENEMIES[enemy.kind];
          const widthUnits = def.boss ? 1.8 : Math.max(0.55, def.radius * 2.8);
          const top = FLOOR_Y + enemy.altitude + getToy(enemy.kind).height * TOY_SCALE + 0.22;
          this.addBar(bars, enemy.x, top, enemy.z, widthUnits, def.boss ? 0.16 : 0.09, enemy.health / enemy.maxHealth, camera);
          bars += 1;
        }
      }
      // Soldiers that have just been beaten tip over and sink away.
      for (const tower of state.towers) {
        if (tower.kind !== 'robot' || !tower.targetId || beams >= 64) continue;
        const target = state.enemies.find(enemy => enemy.id === tower.targetId);
        if (!target) continue;
        const model = getToy(`robot-${tower.level}` as ToyId);
        const yaw = this.turretYaw.get(tower.id) ?? tower.aim;
        const fromX = tower.x + Math.sin(yaw) * model.muzzle[2] * TOY_SCALE;
        const fromY = tower.y + model.muzzle[1] * TOY_SCALE;
        const fromZ = tower.z + Math.cos(yaw) * model.muzzle[2] * TOY_SCALE;
        const toY = FLOOR_Y + target.altitude + getToy(target.kind).height * TOY_SCALE * 0.55;
        const ramp = TOWERS.robot.levels[tower.level - 1].ramp!;
        const power = Math.min(1, tower.beamTime / ramp.time);
        this.position.set(fromX, fromY, fromZ);
        this.matrix.lookAt(this.position, this.scale.set(target.x, toY, target.z), UP);
        this.quaternion.setFromRotationMatrix(this.matrix);
        // lookAt points -z at the target; the beam geometry runs along +z.
        this.quaternion.multiply(this.lean.setFromAxisAngle(UP, Math.PI));
        const length = Math.hypot(target.x - fromX, toY - fromY, target.z - fromZ);
        const thickness = (0.035 + power * 0.06) * (1 + Math.sin(this.time * 40) * 0.12);
        this.matrix.compose(this.position, this.quaternion, this.scale.set(thickness, thickness, length));
        this.beams.setMatrixAt(beams, this.matrix);
        this.beams.setColorAt(beams, this.tint.setRGB(0.25 + power * 1.2, 1 - power * 0.55, 1 - power * 0.75));
        beams += 1;
        if (Math.random() < dt * 20) {
          this.sparks.emit(target.x, toY, target.z, FLOOR_Y, { count: 1, color: power > 0.6 ? '#ff8a6b' : '#9ff3ff', speed: 1.4, life: 0.25, size: 0.07, lift: 0.8 });
        }
      }
      for (const shot of state.shots) {
        const toy = getToy(SHOT_TOY[shot.kind]);
        this.position.set(shot.x, shot.y, shot.z);
        if (shot.type === 'homing') {
          this.matrix.lookAt(this.scale.set(shot.tx, shot.ty, shot.tz), this.position, UP);
          this.quaternion.setFromRotationMatrix(this.matrix);
        } else if (shot.type === 'bolt') {
          this.quaternion.setFromAxisAngle(UP, Math.atan2(shot.dirX, shot.dirZ));
        } else {
          this.quaternion.setFromEuler(this.euler.set(this.time * 9 + shot.id, this.time * 5, 0));
        }
        this.matrix.compose(this.position, this.quaternion, this.scale.setScalar(SHOT_SCALE * (shot.type === 'bolt' ? 1.3 : 1)));
        this.toys.add(toy, this.matrix, this.white);
        this.shadows.add(shot.x, FLOOR_Y, shot.z, 0.09, shot.y - FLOOR_Y);
      }
      for (const run of state.marbles) {
        const lane = LANES[run.lane];
        const marble = getToy('marble');
        for (let index = 0; index < 9; index += 1) {
          const distance = run.distance + (index % 3) * 0.22 + Math.sin(index * 5.1) * 0.1;
          if (distance < 0 || distance > lane.length) continue;
          lanePoint(lane, distance, ((index * 0.37) % 1 - 0.5) * 0.7, this.point);
          this.position.set(this.point.x, FLOOR_Y + 0.14, this.point.z);
          this.quaternion.setFromEuler(this.euler.set(-this.time * 22 - index, index, 0));
          this.matrix.compose(this.position, this.quaternion, this.scale.setScalar(1.6));
          this.toys.add(marble, this.matrix, this.white);
          this.shadows.add(this.point.x, FLOOR_Y, this.point.z, 0.14);
        }
      }
      for (const puddle of state.puddles) {
        if (puddles >= 96) break;
        const grow = Math.min(1, puddle.time * 5);
        const fade = Math.min(1, (puddle.duration - puddle.time) * 1.5);
        this.matrix.compose(
          this.position.set(puddle.x, FLOOR_Y + 0.012 + (puddles % 5) * 0.0015, puddle.z),
          this.quaternion.identity(),
          this.scale.setScalar(puddle.radius * grow * (0.6 + 0.4 * fade)),
        );
        this.puddles.setMatrixAt(puddles++, this.matrix);
      }
    }

    for (let index = this.fallen.length - 1; index >= 0; index -= 1) {
      const fallen = this.fallen[index];
      fallen.age += dt;
      if (fallen.age > 0.95) {
        this.fallen.splice(index, 1);
        continue;
      }
      const tip = Math.min(1, fallen.age / 0.28);
      const sink = Math.max(0, (fallen.age - 0.55) / 0.4);
      this.quaternion.setFromAxisAngle(UP, fallen.yaw);
      this.lean.setFromAxisAngle(this.scale.set(1, 0, 0), fallen.side * tip * tip * 1.5);
      this.quaternion.multiply(this.lean);
      this.matrix.compose(this.position.set(fallen.x, fallen.y + 0.05 * Math.sin(tip * Math.PI), fallen.z), this.quaternion, this.scale.setScalar(fallen.scale * (1 - sink)));
      this.toys.add(fallen.toy, this.matrix, fallen.tint);
    }

    this.toys.end();
    this.shadows.end();
    for (const [mesh, count] of [[this.barBack, bars], [this.barFill, bars], [this.beams, beams], [this.puddles, puddles]] as const) {
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    this.sparks.update(dt);
    this.floaters.update(dt, camera, width, height);
  }

  /** Remember a beaten soldier so it can topple before it disappears. */
  fell(enemy: { kind: EnemyKind; tier: Tier; x: number; z: number; altitude: number }, yaw: number): void {
    if (this.fallen.length > 60 || ENEMIES[enemy.kind].boss) return;
    this.fallen.push({
      toy: getToy(enemy.kind), x: enemy.x, y: FLOOR_Y + enemy.altitude * 0.4, z: enemy.z, yaw,
      tint: this.tints[enemy.tier], age: 0, side: Math.random() < 0.5 ? -1 : 1, scale: TOY_SCALE,
    });
  }

  private drawTower(tower: Tower, dt: number): void {
    const model = getToy(`${tower.kind}-${tower.level}` as ToyId);
    // Turrets swing round rather than snap.
    let yaw = this.turretYaw.get(tower.id) ?? tower.aim;
    let turn = tower.aim - yaw;
    turn -= Math.round(turn / (Math.PI * 2)) * Math.PI * 2;
    yaw += turn * Math.min(1, dt * 14);
    this.turretYaw.set(tower.id, yaw);
    // A quick squash when it fires; a dizzy wobble while jammed.
    const kick = tower.kind === 'robot' ? 0 : Math.max(0, 1 - tower.sinceShot / 0.16);
    const wobble = tower.stunned > 0 ? Math.sin(this.time * 18 + tower.id) * 0.12 : 0;
    this.quaternion.setFromEuler(this.euler.set(wobble, 0, wobble * 0.7));
    this.matrix.compose(this.position.set(tower.x, tower.y, tower.z), this.quaternion, this.scale.set(1 + kick * 0.06, 1 - kick * 0.08, 1 + kick * 0.06).multiplyScalar(TOY_SCALE));
    this.toys.add(model, this.matrix, this.white, yaw, this.time, tower.stunned > 0 ? 0.25 : 0);
    this.shadows.add(tower.x, tower.y, tower.z, model.radius * TOY_SCALE);
  }

  private drawEnemy(enemy: Enemy, dt: number): void {
    const def = ENEMIES[enemy.kind];
    const model = getToy(enemy.kind);
    const yaw = Math.atan2(enemy.dirX, enemy.dirZ);
    const y = FLOOR_Y + enemy.altitude;
    // Frozen toys topple over limp, then get back up.
    let down = this.topple.get(enemy.id) ?? 0;
    const wantDown = enemy.frozen > 0.25 && !enemy.flying && !def.boss && !VEHICLES.has(enemy.kind) ? 1 : 0;
    down += (wantDown - down) * Math.min(1, dt * 9);
    if (down > 0.001 || wantDown) this.topple.set(enemy.id, down);
    else this.topple.delete(enemy.id);

    this.quaternion.setFromAxisAngle(UP, yaw);
    let lift = 0;
    if (enemy.drop) {
      // Swinging under the canopy.
      this.lean.setFromEuler(this.euler.set(Math.sin(this.time * 2.2 + enemy.id) * 0.16, 0, Math.cos(this.time * 1.7 + enemy.id) * 0.16));
      this.quaternion.multiply(this.lean);
    } else if (def.flying) {
      lift = Math.sin(this.time * 2.4 + enemy.id) * 0.07;
      this.lean.setFromEuler(this.euler.set(0.14, 0, Math.sin(this.time * 1.3 + enemy.id) * 0.06));
      this.quaternion.multiply(this.lean);
    } else if (VEHICLES.has(enemy.kind)) {
      lift = Math.abs(Math.sin(enemy.distance * 9)) * 0.012;
    } else {
      // Rigid figures waddle: rock from side to side on the base plate with a little hop.
      const stride = enemy.distance * (def.boss ? 4.2 : 9.5) + enemy.id;
      const moving = enemy.frozen > 0 ? 0 : 1;
      lift = Math.abs(Math.sin(stride)) * (def.boss ? 0.06 : 0.035) * moving;
      this.lean.setFromEuler(this.euler.set(0.06 * moving - down * 1.45, 0, Math.sin(stride) * 0.2 * moving * (1 - down)));
      this.quaternion.multiply(this.lean);
    }
    this.matrix.compose(this.position.set(enemy.x, y + lift + down * 0.05, enemy.z), this.quaternion, this.scale.setScalar(TOY_SCALE));
    this.tint.copy(this.tints[enemy.tier]);
    if (enemy.slowFactor < 1) this.tint.lerp(this.gluey, 0.4);
    this.toys.add(model, this.matrix, this.tint, 0, this.time, enemy.flash > 0 ? enemy.flash / 0.12 : 0);
    if (enemy.drop) {
      this.matrix.compose(this.position.set(enemy.x, y, enemy.z), this.quaternion, this.scale.setScalar(TOY_SCALE));
      this.toys.add(getToy('parachute'), this.matrix, this.white);
    }
    this.shadows.add(enemy.x, FLOOR_Y, enemy.z, model.radius * TOY_SCALE, enemy.altitude);
  }

  private addBar(index: number, x: number, y: number, z: number, width: number, height: number, share: number, camera: THREE.Camera): void {
    this.quaternion.copy(camera.quaternion);
    this.matrix.compose(this.position.set(x, y, z), this.quaternion, this.scale.set(width + 0.04, height + 0.04, 1));
    this.barBack.setMatrixAt(index, this.matrix);
    // The fill shrinks toward the left edge as seen by the camera.
    this.position.set(-(1 - share) * width * 0.5, 0, 0).applyQuaternion(this.quaternion).add(this.scale.set(x, y, z));
    this.matrix.compose(this.position, this.quaternion, this.scale.set(Math.max(0.001, width * share), height, 1));
    this.barFill.setMatrixAt(index, this.matrix);
    this.barFill.setColorAt(index, this.tint.setHSL(0.02 + share * 0.31, 0.78, 0.5));
  }
}
