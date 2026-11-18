import type { DoorState } from '@huis/house/shared/doors';
import { INK_MARK_CAP } from './ink';
import type { GameStatus } from './hideSeek';
/** Wire contracts are plain data: no rendering or transport dependency. */
export type { Vec3 } from '@huis/house/shared/vec';
import type { Vec3 } from '@huis/house/shared/vec';
export type Controls = { seq: number; lookYaw?: number; lookPitch?: number; yaw: number; pitch: number; forward: number; strafe: number; lift: number; precision: boolean; fire: boolean; reset: boolean };
/** All timestamps are seconds on the room's monotonic simulation clock. */
export type DroneState = {
  id: string; name: string; color: string; position: Vec3;
  yaw: number; pitch: number; speed: number; velocity: Vec3;
  lastSeq: number; respawnAt: number; invulnerableUntil: number;
  paintedUntil: number; paintColor: string; shots: number; tags: number;
};
export type ProjectileState = { id: number; owner: string; color: string; position: Vec3; velocity: Vec3; bornAt: number };
/** Moving support plus impact position/normal expressed in its closed-pose world coordinates. */
export type PaintAttachment = {
  doorId: string;
  /** Stable articulated component struck by the paint. Omitted for rigid assemblies. */
  partIndex?: number;
  position: Vec3;
  normal: Vec3;
};
/** position/normal retain the original world-space impact for wire compatibility. */
export type PaintMark = { id: number; position: Vec3; normal: Vec3; color: string; size: number; attachment?: PaintAttachment };
export type Snapshot = { doors?: DoorState[]; game?: GameStatus; tick: number; time: number; players: DroneState[]; projectiles: ProjectileState[]; paints: PaintMark[] };
/** Omitted paints means unchanged; an empty list explicitly clears paint. */
export type SnapshotUpdate = Omit<Snapshot, 'paints'> & { paints?: PaintMark[]; paintAdds?: PaintMark[] };
export const PLAYER_COLORS = ['#f27654', '#58bdb0', '#b096e7', '#e9b949', '#5b8def', '#e86fa8'] as const;
export const MAX_PILOTS = PLAYER_COLORS.length;
export const ROOM_NAME_MIN = 3;
export const ROOM_NAME_MAX = 24;
/** Lowercase letters, digits and single dashes, so names stay easy to type and safe in a URL. */
export function sanitizeRoomName(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+/, '').slice(0, ROOM_NAME_MAX).replace(/-+$/, '');
}
export const TICK_RATE = 60;
export const SNAPSHOT_RATE = 20;
export const DRONE_RADIUS = 0.16;
export const MAX_PAINTS = INK_MARK_CAP;
export const NEUTRAL_CONTROLS: Controls = { seq: 0, yaw: 0, pitch: 0, forward: 0, strafe: 0, lift: 0, precision: false, fire: false, reset: false };

/** WebSocket updates are ordered. Full history on join, small additions thereafter. */
export function applySnapshotUpdate(previous: Snapshot | undefined | null, update: SnapshotUpdate): Snapshot {
  let paints = update.paints ?? previous?.paints ?? [];
  if (update.paints === undefined && update.paintAdds?.length) {
    const lastId = paints.at(-1)?.id ?? 0;
    const additions = update.paintAdds.filter(paint => paint.id > lastId);
    if (additions.length) paints = [...paints, ...additions].slice(-MAX_PAINTS);
  }
  return { doors: update.doors ?? previous?.doors, game: update.game ?? previous?.game, tick: update.tick, time: update.time, players: update.players, projectiles: update.projectiles, paints };
}

/** World coordinates: y up, yaw 0 points toward +z. */
export function forwardVector(yaw: number, pitch: number): Vec3 {
  const horizontal = Math.cos(pitch);
  return { x: Math.sin(yaw) * horizontal, y: Math.sin(pitch), z: Math.cos(yaw) * horizontal };
}
