import type { DoorState } from '@huis/house/shared/doors';
import { stepFlight } from '../shared/flight';
import { TICK_RATE, type Controls, type DroneState, type Snapshot } from '../shared/protocol';

export const FIXED_STEP = 1 / TICK_RATE;
export const cloneDrone = (state: DroneState): DroneState => ({
  ...state, position: { ...state.position }, velocity: { ...state.velocity },
});
export const lerpAngle = (from: number, to: number, amount: number): number =>
  from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * amount;

function interpolate(from: DroneState, to: DroneState, amount: number): DroneState {
  const result = cloneDrone(to);
  for (const axis of ['x', 'y', 'z'] as const) {
    result.position[axis] = from.position[axis] + (to.position[axis] - from.position[axis]) * amount;
    result.velocity[axis] = from.velocity[axis] + (to.velocity[axis] - from.velocity[axis]) * amount;
  }
  result.yaw = lerpAngle(from.yaw, to.yaw, amount);
  result.pitch = from.pitch + (to.pitch - from.pitch) * amount;
  return result;
}

/** Continuous local simulation. Network corrections never reset the movement clock. */
export class DronePredictor {
  public doors: readonly DoorState[] = [];
  private current: DroneState | undefined;
  private previous: DroneState | undefined;
  private pending: Controls[] = [];
  private correction = { x: 0, y: 0, z: 0 };

  reset(): void {
    this.current = this.previous = undefined;
    this.doors = [];
    this.pending = [];
    this.correction = { x: 0, y: 0, z: 0 };
  }

  advance(input: Controls): void {
    if (!this.current) return;
    this.previous = cloneDrone(this.current);
    this.pending.push({ ...input });
    // The connection watchdog stops play before this bound during a lost link.
    if (this.pending.length > 120) this.pending.shift();
    if (this.current.respawnAt <= 0) stepFlight(this.current, input, FIXED_STEP, this.doors);
  }

  reconcile(authoritative: DroneState): void {
    this.pending = this.pending.filter(input => input.seq > authoritative.lastSeq);
    const corrected = cloneDrone(authoritative);
    if (corrected.respawnAt <= 0) {
      for (const input of this.pending) stepFlight(corrected, input, FIXED_STEP, this.doors);
    }
    const previous = this.current;
    const teleport = !previous || previous.respawnAt !== corrected.respawnAt
      || Math.hypot(previous.position.x - corrected.position.x,
        previous.position.y - corrected.position.y, previous.position.z - corrected.position.z) > .75;
    if (teleport) {
      this.current = corrected;
      this.previous = cloneDrone(corrected);
      this.correction = { x: 0, y: 0, z: 0 };
      return;
    }
    // Only reconcile the error; don't ease ordinary forward motion or mouse look.
    for (const axis of ['x', 'y', 'z'] as const) {
      const difference = previous.position[axis] - corrected.position[axis];
      this.correction[axis] += difference;
      if (this.previous) this.previous.position[axis] -= difference;
    }
    this.current = corrected;
  }

  sample(alpha: number, dt: number): DroneState | undefined {
    if (!this.current || !this.previous) return undefined;
    const result = interpolate(this.previous, this.current, Math.max(0, Math.min(1, alpha)));
    const decay = Math.exp(-18 * dt);
    for (const axis of ['x', 'y', 'z'] as const) {
      this.correction[axis] *= decay;
      result.position[axis] += this.correction[axis];
    }
    return result;
  }
}

/** Render remote drones on a short server-time buffer, independent of packet arrival. */
export class SnapshotBuffer {
  private snapshots: Snapshot[] = [];
  private newestArrival = 0;
  private renderTime = -Infinity;
  private lastSampleAt = 0;

  clear(): void {
    this.snapshots = [];
    this.renderTime = -Infinity;
    this.lastSampleAt = 0;
  }

  push(snapshot: Snapshot, arrivalSeconds: number): void {
    if (snapshot.tick <= (this.snapshots.at(-1)?.tick ?? -1)) return;
    this.snapshots.push(snapshot);
    if (this.snapshots.length > 12) this.snapshots.shift();
    this.newestArrival = arrivalSeconds;
  }

  sample(nowSeconds: number): DroneState[] {
    const latest = this.snapshots.at(-1);
    if (!latest) return [];
    const targetTime = latest.time + nowSeconds - this.newestArrival - .1;
    if (!Number.isFinite(this.renderTime)) this.renderTime = targetTime;
    else {
      const dt = Math.max(0, Math.min(.25, nowSeconds - this.lastSampleAt));
      const clockRate = Math.max(.9, Math.min(1.1, 1 + (targetTime - this.renderTime) * 2));
      // Adjust clock speed gently instead of snapping the clock to each packet.
      this.renderTime = Math.min(latest.time, this.renderTime + dt * clockRate);
    }
    this.lastSampleAt = nowSeconds;
    const rightIndex = this.snapshots.findIndex(snapshot => snapshot.time >= this.renderTime);
    const right = this.snapshots[rightIndex < 0 ? this.snapshots.length - 1 : rightIndex];
    const left = this.snapshots[Math.max(0, rightIndex - 1)] ?? right;
    const alpha = right.time > left.time ? Math.max(0, Math.min(1, (this.renderTime - left.time) / (right.time - left.time))) : 1;
    return latest.players.map(player => {
      const to = right.players.find(candidate => candidate.id === player.id) ?? player;
      const from = left.players.find(candidate => candidate.id === player.id) ?? to;
      if (from.respawnAt !== to.respawnAt || Math.hypot(from.position.x - to.position.x, from.position.y - to.position.y, from.position.z - to.position.z) > 3) return cloneDrone(to);
      return interpolate(from, to, alpha);
    });
  }
}
