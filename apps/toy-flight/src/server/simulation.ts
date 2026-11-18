import { nearbyOpenCloset, targetedDoor } from '../shared/interaction.js';
import { closetEscape } from '../shared/closet-escape.js';
import { createDoorStates, advanceDoors, insideDrawer, sweepDoors, type DoorState } from '@huis/house/shared/doors';
import {
  MAX_PAINTS,
  NEUTRAL_CONTROLS,
  DRONE_RADIUS,
  PLAYER_COLORS,
  type Controls,
  type PaintMark,
  type DroneState,
  type ProjectileState,
  type Snapshot,
  type SnapshotUpdate,
  type Vec3,
} from '../shared/protocol.js';
import { rayPaintSurfaces } from '@huis/house/shared/paint-surfaces';
import { stepFlight } from '../shared/flight.js';
import { getSpawns } from '../shared/spawns.js';
import { crosshairTarget, segmentSphereT, PROJECTILE_SPEED, PROJECTILE_LIFETIME } from '../shared/aim.js';
import { createPaintAttachment } from '../shared/paint.js';
import { HideSeekRules, canRespawn, cloneGameStatus, isFrozen, type GameMode } from '../shared/hideSeek.js';
import { INK_FIRE_INTERVAL, INK_MARK_SIZE_MIN, INK_MARK_SIZE_RANGE, INK_PROJECTILE_CAP } from '../shared/ink.js';

const INPUT_TIMEOUT = 0.32;
const INPUT_BURST = 90;
const INPUT_REFILL = 60;
const RESPAWN_DELAY = 0.65;
const SPAWN_INVULNERABILITY = 1.15;
const PAINT_DURATION = 2;

type RandomSource = () => number;

type PlayerRuntime = {
  drone: DroneState;
  input: Controls;
  pendingInputs: Controls[];
  lastReceivedSeq: number;
  lastInputAt: number;
  lastFireAt: number;
  inputTokens: number;
  tokenUpdatedAt: number;
  resetArmed: boolean;
};

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const copyVec = (value: Vec3): Vec3 => ({ x: value.x, y: value.y, z: value.z });

export function sanitizeName(value: unknown): string {
  if (typeof value !== 'string') return 'Pilot';
  const clean = value.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 18);
  return clean || 'Pilot';
}

function validControls(value: unknown): value is Controls {
  if (!value || typeof value !== 'object') return false;
  const input = value as Partial<Controls>;
  return Number.isSafeInteger(input.seq) && (input.seq as number) >= 0
    && finite(input.yaw) && finite(input.pitch) && finite(input.forward)
    && finite(input.strafe) && finite(input.lift) && typeof input.precision === 'boolean'
    && ((input.lookYaw === undefined && input.lookPitch === undefined)
      || (finite(input.lookYaw) && finite(input.lookPitch)))
    && typeof input.fire === 'boolean' && typeof input.reset === 'boolean';
}

export class GameSimulation {
  public readonly doors = createDoorStates();
  private readonly lastDoorUse = new Map<string, number>();
  private readonly lastDoorInteraction = new Map<string, number>();
  private readonly drawerEscape = new Map<string, number>();
  private readonly doorHistory: { time: number; doors: DoorState[] }[] = [{ time: 0, doors: createDoorStates() }];

  toggleDoor(id: string, aim?: unknown): boolean {
    const drone = this.players.get(id)?.drone;
    if (!drone || drone.respawnAt > 0 || isFrozen(this.rules.status, id) || this.time - (this.lastDoorUse.get(id) ?? -Infinity) < .25) return false;
    this.lastDoorUse.set(id, this.time);
    // An inside control uses current server-owned containment, even when the
    // outside handle is hidden or the client's rendered door pose is outdated.
    const escape = closetEscape(drone.position, this.doors);
    if (escape) {
      for (const change of escape.changes) this.doors[change.index].opening = change.opening;
      if (escape.drawerIndex >= 0) this.drawerEscape.set(id, escape.drawerIndex);
      else this.drawerEscape.delete(id);
      this.lastDoorInteraction.set(id, escape.index);
      return true;
    }
    // Orientation is input, like mouse look; position and the selected object
    // always come from authoritative simulation and shared collision.
    let pose = drone;
    let viewedDoors: readonly DoorState[] = this.doors;
    if (aim !== undefined) {
      if (!aim || typeof aim !== 'object') return false;
      const input = aim as { yaw?: unknown; pitch?: unknown; viewTime?: unknown };
      if (!finite(input.yaw) || !finite(input.pitch) || Math.abs(input.pitch) > 1.3) return false;
      pose = { ...drone, yaw: input.yaw % (Math.PI * 2), pitch: input.pitch };
      if (input.viewTime !== undefined) {
        if (!finite(input.viewTime) || input.viewTime < this.time-.25 || input.viewTime > this.time+.001) return false;
        // Reconstruct a recent server-owned pose, never client-supplied object
        // indices or transforms. This matches the visible interpolated handle.
        const history = this.doorHistory;
        const viewTime = input.viewTime;
        const after = history.findIndex(sample => sample.time >= viewTime);
        if (after >= 0) {
          const b = history[after], a = history[Math.max(0,after-1)];
          const alpha = b.time === a.time ? 1 : clamp((input.viewTime-a.time)/(b.time-a.time),0,1);
          viewedDoors = b.doors.map((door,index) => ({ ...door, fraction: a.doors[index].fraction*(1-alpha)+door.fraction*alpha }));
        }
      }
    }
    const selected = targetedDoor(pose, viewedDoors, this.rules.status.mode === 'hideSeek');
    const index = selected >= 0 ? selected : nearbyOpenCloset(drone.position, this.doors, this.lastInteractedDoor(id));
    if (index < 0) return false;
    this.doors[index].opening = selected >= 0 ? !this.doors[index].opening : false;
    this.drawerEscape.delete(id);
    this.lastDoorInteraction.set(id, index);
    return true;
  }

  lastInteractedDoor(id: string): number {
    return this.lastDoorInteraction.get(id) ?? -1;
  }

  public time = 0;
  public tick = 0;
  public readonly players = new Map<string, PlayerRuntime>();
  public readonly projectiles: ProjectileState[] = [];
  public readonly paints: PaintMark[] = [];
  private nextProjectileId = 1;
  private nextPaintId = 1;

  public readonly rules: HideSeekRules;

  constructor(private readonly random: RandomSource = Math.random, mode: GameMode = 'free') {
    this.rules = new HideSeekRules(mode, random);
  }

  markLoaded(id: string): void {
    this.rules.markLoaded(id, [...this.players.keys()]);
  }

  startRound(): boolean {
    return this.rules.start([...this.players.keys()], this.time);
  }

  setHidden(id: string, hidden: unknown): boolean {
    return typeof hidden === 'boolean' && this.rules.setHidden(id, hidden, this.time);
  }

  giveUp(id: string): boolean {
    return this.rules.giveUp(id, this.time);
  }

  addPlayer(id: string, name: unknown): DroneState {
    const used = new Set([...this.players.values()].map(({ drone }) => drone.color));
    const color = PLAYER_COLORS.find((candidate) => !used.has(candidate)) ?? PLAYER_COLORS[this.players.size % PLAYER_COLORS.length];
    const drone = this.makeDrone(id, sanitizeName(name), color);
    this.players.set(id, {
      drone,
      input: { ...NEUTRAL_CONTROLS },
      pendingInputs: [],
      lastReceivedSeq: 0,
      lastInputAt: this.time,
      lastFireAt: -INK_FIRE_INTERVAL,
      inputTokens: INPUT_BURST,
      tokenUpdatedAt: this.time,
      resetArmed: true,
    });
    return drone;
  }

  removePlayer(id: string): void {
    this.players.delete(id);
    this.rules.removePlayer(id, this.time);
    this.lastDoorUse.delete(id);
    this.lastDoorInteraction.delete(id);
    this.drawerEscape.delete(id);
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      if (this.projectiles[i].owner === id) this.projectiles.splice(i, 1);
    }
  }

  setInput(id: string, value: unknown): boolean {
    const player = this.players.get(id);
    if (!player || !validControls(value)) return false;

    const elapsed = Math.max(0, this.time - player.tokenUpdatedAt);
    player.inputTokens = Math.min(INPUT_BURST, player.inputTokens + elapsed * INPUT_REFILL);
    player.tokenUpdatedAt = this.time;
    if (player.inputTokens < 1 || value.seq <= player.lastReceivedSeq || player.pendingInputs.length >= 30) return false;
    player.inputTokens -= 1;

    const input: Controls = {
      seq: value.seq,
      ...(value.lookYaw === undefined ? {} : {
        lookYaw: Math.atan2(Math.sin(value.lookYaw), Math.cos(value.lookYaw)),
        lookPitch: clamp(value.lookPitch!, -Math.PI * .36, Math.PI * .36),
      }),
      yaw: clamp(value.yaw, -1, 1),
      pitch: clamp(value.pitch, -1, 1),
      forward: clamp(value.forward, -1, 1),
      strafe: clamp(value.strafe, -1, 1),
      lift: clamp(value.lift, -1, 1),
      precision: value.precision,
      fire: value.fire,
      reset: value.reset,
    };
    player.pendingInputs.push(input);
    player.lastReceivedSeq = value.seq;
    player.lastInputAt = this.time;
    return true;
  }

  update(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const step = Math.min(dt, 0.05);
    this.time += step;
    this.tick += 1;

    const active = [...this.players.values()].filter(p => p.drone.respawnAt <= 0);
    advanceDoors(this.doors, step, active.map(p => p.drone.position), DRONE_RADIUS,
      active.map(p => this.drawerEscape.get(p.drone.id) ?? -1));
    for (const runtime of this.players.values()) this.updatePlayer(runtime, step);
    for (const [id, index] of this.drawerEscape) {
      const drone = this.players.get(id)?.drone, door = this.doors[index];
      if (!drone || drone.respawnAt > 0 || !door
        || !insideDrawer(drone.position, index, door.fraction)) this.drawerEscape.delete(id);
    }
    this.updateProjectiles(step);
    this.rules.update(this.time);
    this.doorHistory.push({ time:this.time, doors:this.doors.map(door=>({...door})) });
    while (this.doorHistory.length > 2 && this.doorHistory[1].time < this.time-.25) this.doorHistory.shift();
  }

  snapshot(): Snapshot;
  snapshot(includePaints: true): Snapshot;
  snapshot(includePaints: false): SnapshotUpdate;
  snapshot(includePaints: boolean): SnapshotUpdate;
  snapshot(includePaints = true): Snapshot | SnapshotUpdate {
    const snapshot: SnapshotUpdate = {
      doors: this.doors.map(door => ({ ...door })),
      game: cloneGameStatus(this.rules.status),
      tick: this.tick,
      time: this.time,
      players: [...this.players.values()].map(({ drone }) => ({ ...drone, position: copyVec(drone.position), velocity: copyVec(drone.velocity) })),
      projectiles: this.projectiles.map((projectile) => ({
        ...projectile,
        position: copyVec(projectile.position),
        velocity: copyVec(projectile.velocity),
      })),
    };
    if (includePaints) {
      snapshot.paints = this.paints.map((paint) => ({
        ...paint,
        position: copyVec(paint.position),
        normal: copyVec(paint.normal),
        ...(paint.attachment ? { attachment: {
          ...paint.attachment,
          position: copyVec(paint.attachment.position),
          normal: copyVec(paint.attachment.normal),
        } } : {}),
      }));
    }
    return snapshot as Snapshot | SnapshotUpdate;
  }

  private makeDrone(id: string, name: string, color: string): DroneState {
    const spawns = getSpawns(), spawn = spawns[Math.floor(this.random() * spawns.length) % spawns.length];
    return {
      id,
      name,
      color,
      position: copyVec(spawn.position),
      yaw: spawn.yaw,
      pitch: 0,
      speed: 0,
      velocity: { x: 0, y: 0, z: 0 },
      lastSeq: 0,
      respawnAt: 0,
      invulnerableUntil: this.time + SPAWN_INVULNERABILITY,
      paintedUntil: 0,
      paintColor: '',
      shots: 0,
      tags: 0,
    };
  }

  private updatePlayer(runtime: PlayerRuntime, dt: number): void {
    const { drone } = runtime;
    if (drone.respawnAt > 0) {
      runtime.pendingInputs.length = 0;
      drone.lastSeq = runtime.lastReceivedSeq;
      if (this.time >= drone.respawnAt) this.respawn(runtime);
      return;
    }

    const timedOut = this.time - runtime.lastInputAt > INPUT_TIMEOUT;
    if (timedOut) {
      runtime.pendingInputs.length = 0;
      drone.lastSeq = runtime.lastReceivedSeq;
      runtime.input = { ...NEUTRAL_CONTROLS, seq: drone.lastSeq };
    } else {
      const next = runtime.pendingInputs.shift();
      if (next) {
        runtime.input = next;
        // Acknowledge only the command actually simulated in this fixed tick.
        drone.lastSeq = next.seq;
        if (!next.reset) runtime.resetArmed = true;
      }
    }
    // The seeker waits with eyes closed: inputs are acknowledged but do nothing.
    const controls = isFrozen(this.rules.status, drone.id)
      ? { ...NEUTRAL_CONTROLS, seq: runtime.input.seq, lookYaw: runtime.input.lookYaw, lookPitch: runtime.input.lookPitch }
      : runtime.input;

    if (controls.reset && runtime.resetArmed && canRespawn(this.rules.status, drone.id)) {
      runtime.resetArmed = false;
      runtime.input.reset = false;
      this.requestRespawn(runtime);
      return;
    }

    stepFlight(drone, controls, dt, this.doors);

    if (controls.fire && this.time + 1e-9 >= runtime.lastFireAt + INK_FIRE_INTERVAL) {
      const scheduled = runtime.lastFireAt + INK_FIRE_INTERVAL;
      this.fire(runtime);
      // Preserve the 8 Hz cadence across 60 Hz ticks without accumulating a
      // catch-up burst after the trigger has been released for a while.
      runtime.lastFireAt = this.time - scheduled > INK_FIRE_INTERVAL ? this.time : scheduled;
    }

  }

  private requestRespawn(runtime: PlayerRuntime): void {
    runtime.pendingInputs.length = 0;
    runtime.drone.lastSeq = runtime.lastReceivedSeq;
    runtime.drone.respawnAt = this.time + RESPAWN_DELAY;
    runtime.drone.speed = 0;
    runtime.drone.velocity = { x: 0, y: 0, z: 0 };
    runtime.input = { ...NEUTRAL_CONTROLS, seq: runtime.drone.lastSeq };
  }

  private respawn(runtime: PlayerRuntime): void {
    const spawns = getSpawns(), spawn = spawns[Math.floor(this.random() * spawns.length) % spawns.length];
    Object.assign(runtime.drone, {
      position: copyVec(spawn.position),
      yaw: spawn.yaw,
      pitch: 0,
      speed: 0,
      velocity: { x: 0, y: 0, z: 0 },
      respawnAt: 0,
      invulnerableUntil: this.time + SPAWN_INVULNERABILITY,
      paintedUntil: 0,
      paintColor: '',
    });
    // Inputs may arrive while the drone is waiting to respawn. In particular,
    // do not carry a held reset into the first live tick and immediately crash again.
    runtime.input = { ...NEUTRAL_CONTROLS, seq: runtime.drone.lastSeq };
    runtime.lastInputAt = this.time;
  }

  private fire(runtime: PlayerRuntime): void {
    const { drone } = runtime;
    const target = crosshairTarget(drone, this.doors, [...this.players.values()].map(player => player.drone), this.time);
    const direction = {
      x: target.x - drone.position.x,
      y: target.y - drone.position.y,
      z: target.z - drone.position.z,
    };
    const distance = Math.hypot(direction.x, direction.y, direction.z);
    if (distance < 1e-6) return;
    const forward = { x: direction.x / distance, y: direction.y / distance, z: direction.z / distance };
    // Keep the muzzle inside the drone's collision envelope: no spawning past cover.
    const muzzleOffset = Math.min(DRONE_RADIUS / 2, distance);
    this.projectiles.push({
      id: this.nextProjectileId++,
      owner: drone.id,
      color: drone.color,
      position: {
        x: drone.position.x + forward.x * muzzleOffset,
        y: drone.position.y + forward.y * muzzleOffset,
        z: drone.position.z + forward.z * muzzleOffset,
      },
      velocity: {
        x: forward.x * PROJECTILE_SPEED,
        y: forward.y * PROJECTILE_SPEED,
        z: forward.z * PROJECTILE_SPEED,
      },
      bornAt: this.time,
    });
    drone.shots += 1;
    while (this.projectiles.length > INK_PROJECTILE_CAP) this.projectiles.shift();
  }

  private updateProjectiles(dt: number): void {
    for (let index = this.projectiles.length - 1; index >= 0; index--) {
      const projectile = this.projectiles[index];
      if (this.time - projectile.bornAt > PROJECTILE_LIFETIME) {
        this.projectiles.splice(index, 1);
        continue;
      }
      const start = copyVec(projectile.position);
      // Straight flight keeps the impact at the crosshair's selected point.
      const end = {
        x: start.x + projectile.velocity.x * dt,
        y: start.y + projectile.velocity.y * dt,
        z: start.z + projectile.velocity.z * dt,
      };

      let bestT = Infinity;
      let worldHit: { position: Vec3; normal: Vec3 } | null = null;
      let droneHit: DroneState | null = null;

      // Sweep the shot's center all the way through the tick for precise impacts.
      const wallHit = rayPaintSurfaces(start, end);
      const doorHit = sweepDoors(start, end, 0, this.doors);
      const triangleHit = doorHit && (!wallHit || doorHit.t < wallHit.t) ? doorHit : wallHit;
      if (triangleHit) {
        bestT = triangleHit.t;
        worldHit = triangleHit;
        droneHit = null;
      }
      for (const { drone } of this.players.values()) {
        if (drone.id === projectile.owner || drone.respawnAt > 0 || this.time < drone.invulnerableUntil) continue;
        const hitT = segmentSphereT(start, end, drone.position, DRONE_RADIUS);
        if (hitT !== null && hitT < bestT) {
          bestT = hitT;
          droneHit = drone;
          worldHit = null;
        }
      }

      if (droneHit) {
        droneHit.paintedUntil = this.time + PAINT_DURATION;
        droneHit.paintColor = projectile.color;
        const owner = this.players.get(projectile.owner);
        if (owner) owner.drone.tags += 1;
        this.rules.tag(projectile.owner, droneHit.id, this.time);
        this.projectiles.splice(index, 1);
      } else if (worldHit) {
        this.paints.push({
          id: this.nextPaintId++,
          position: copyVec(worldHit.position),
          normal: copyVec(worldHit.normal),
          color: projectile.color,
          size: INK_MARK_SIZE_MIN + this.random() * INK_MARK_SIZE_RANGE,
          ...(triangleHit === doorHit && doorHit ? {
            attachment: createPaintAttachment(
              doorHit.doorIndex,
              this.doors[doorHit.doorIndex]?.fraction ?? 0,
              doorHit.position,
              doorHit.normal,
              doorHit.partIndex,
            ),
          } : {}),
        });
        if (this.paints.length > MAX_PAINTS) this.paints.splice(0, this.paints.length - MAX_PAINTS);
        this.projectiles.splice(index, 1);
      } else {
        projectile.position = end;
      }
    }
  }
}
