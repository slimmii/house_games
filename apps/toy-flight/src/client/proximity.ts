import type { DroneState, Vec3 } from '../shared/protocol';
import { floorIndex } from '@huis/house/shared/world';

export const WARMTH_NEAR_DISTANCE = 1.5;
export const WARMTH_FAR_DISTANCE = 42;
/** Each storey between pilots counts as this much extra distance, so a pilot
 * straight above you through the ceiling never reads as close. */
export const FLOOR_PENALTY = 20;
export const WARMTH_SMOOTHING = 0.28;
export const TREND_DEADBAND = 0.4;
/** HUD samples at 10 Hz, so seven updates keep a meaningful trend legible for about 0.7 s. */
export const TREND_HOLD_UPDATES = 7;

export type ProximityTrend = 'warmer' | 'colder' | 'steady';
export type ProximityReading =
  | { status: 'active'; targetId: string; distance: number; warmth: number; trend: ProximityTrend }
  | { status: 'waiting' | 'paused'; warmth: null; trend: 'steady' };

export function distance3d(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** Distance the warmer/colder radar uses: straight-line plus a penalty per storey apart. */
export function radarDistance(a: Vec3, b: Vec3): number {
  return distance3d(a, b) + Math.abs(floorIndex(a.y) - floorIndex(b.y)) * FLOOR_PENALTY;
}

export function warmthForDistance(distance: number): number {
  const normalized = (distance - WARMTH_NEAR_DISTANCE) / (WARMTH_FAR_DISTANCE - WARMTH_NEAR_DISTANCE);
  return Math.max(0, Math.min(100, (1 - normalized) * 100));
}

export type ProximityFilter = (player: DroneState) => boolean;

export function nearestEligiblePlayer(
  players: DroneState[], selfId: string, selfPosition: Vec3, serverTime: number, eligible?: ProximityFilter,
): { player: DroneState; distance: number } | undefined {
  let nearest: { player: DroneState; distance: number } | undefined;
  for (const player of players) {
    if (player.id === selfId || player.respawnAt > serverTime || (eligible && !eligible(player))) continue;
    const distance = radarDistance(selfPosition, player.position);
    if (!nearest || distance < nearest.distance || (distance === nearest.distance && player.id < nearest.player.id)) {
      nearest = { player, distance };
    }
  }
  return nearest;
}

/** Keeps network correction jitter from flipping the warmer/colder message. */
export class ProximityTracker {
  private targetId: string | undefined;
  private smoothedDistance: number | undefined;
  private trendAnchor: number | undefined;
  private trend: ProximityTrend = 'steady';
  private trendHold = 0;

  reset(): void {
    this.targetId = undefined;
    this.smoothedDistance = undefined;
    this.trendAnchor = undefined;
    this.trend = 'steady';
    this.trendHold = 0;
  }

  update(
    players: DroneState[], selfId: string, selfPosition: Vec3, serverTime: number, available = true,
    eligible?: ProximityFilter,
  ): ProximityReading {
    if (!available) {
      this.reset();
      return { status: 'paused', warmth: null, trend: 'steady' };
    }
    const self = players.find(player => player.id === selfId);
    if (!self || self.respawnAt > serverTime) {
      this.reset();
      return { status: 'paused', warmth: null, trend: 'steady' };
    }
    const nearest = nearestEligiblePlayer(players, selfId, selfPosition, serverTime, eligible);
    if (!nearest) {
      this.reset();
      return { status: 'waiting', warmth: null, trend: 'steady' };
    }
    if (nearest.player.id !== this.targetId || this.smoothedDistance === undefined) {
      this.targetId = nearest.player.id;
      this.smoothedDistance = nearest.distance;
      this.trendAnchor = nearest.distance;
      this.trend = 'steady';
      this.trendHold = 0;
      return this.reading(nearest.player.id, 'steady');
    }

    this.smoothedDistance += (nearest.distance - this.smoothedDistance) * WARMTH_SMOOTHING;
    const change = this.smoothedDistance - (this.trendAnchor ?? this.smoothedDistance);
    if (Math.abs(change) >= TREND_DEADBAND) {
      this.trend = change < 0 ? 'warmer' : 'colder';
      this.trendHold = TREND_HOLD_UPDATES;
      this.trendAnchor = this.smoothedDistance;
    } else if (this.trendHold > 0) {
      this.trendHold -= 1;
    } else {
      this.trend = 'steady';
    }
    return this.reading(nearest.player.id, this.trend);
  }

  private reading(targetId: string, trend: ProximityTrend): ProximityReading {
    const distance = this.smoothedDistance!;
    return { status: 'active', targetId, distance, warmth: warmthForDistance(distance), trend };
  }
}
