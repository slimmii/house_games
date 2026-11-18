/** Room-level game modes. The round state is server-owned and sent with every snapshot. */
export type GameMode = 'free' | 'hideSeek';
export type RoundPhase = 'lobby' | 'hiding' | 'seeking' | 'ended';
export type RoundOutcome = 'allFound' | 'gaveUp' | 'aborted';

export type GameStatus = {
  mode: GameMode;
  phase: RoundPhase;
  /** Monotonic round number; clients use it to reset per-round UI. */
  round: number;
  seekerId: string;
  /** Pilots that must be found this round (late joiners are spectators). */
  hiders: string[];
  /** Hiders that signalled they are in place. */
  hidden: string[];
  /** Hiders tagged by the seeker, in order. */
  found: string[];
  /** Pilots whose house finished loading; a round only starts when everyone has. */
  loaded: string[];
  phaseStartedAt: number;
  /** Hiding ends automatically at this simulation time, even if someone forgot to signal. */
  hideDeadline: number;
  outcome?: RoundOutcome;
};

export const MIN_HIDE_SEEK_PLAYERS = 2;
export const HIDE_TIME_LIMIT = 120;

export function parseGameMode(value: unknown): GameMode {
  return value === 'hideSeek' ? 'hideSeek' : 'free';
}

export function initialGameStatus(mode: GameMode): GameStatus {
  return { mode, phase: 'lobby', round: 0, seekerId: '', hiders: [], hidden: [], found: [], loaded: [], phaseStartedAt: 0, hideDeadline: 0 };
}

export function cloneGameStatus(status: GameStatus): GameStatus {
  return { ...status, hiders: [...status.hiders], hidden: [...status.hidden], found: [...status.found], loaded: [...status.loaded] };
}

export type HideSeekRole = 'free' | 'waiting' | 'seeker' | 'hider' | 'found' | 'spectator';

/** What a pilot is in the current round, from their own point of view. */
export function roleOf(status: GameStatus | undefined, id: string): HideSeekRole {
  if (!status || status.mode !== 'hideSeek') return 'free';
  if (status.phase === 'lobby') return 'waiting';
  if (status.seekerId === id) return 'seeker';
  if (status.found.includes(id)) return 'found';
  if (status.hiders.includes(id)) return 'hider';
  return 'spectator';
}

/** The seeker cannot move or shoot while the others hide. */
export function isFrozen(status: GameStatus | undefined, id: string): boolean {
  return status?.mode === 'hideSeek' && status.phase === 'hiding' && status.seekerId === id;
}

/** Quick respawn would let a hider teleport away from an approaching seeker. */
export function canRespawn(status: GameStatus | undefined, id: string): boolean {
  if (isFrozen(status, id)) return false;
  return !(status?.mode === 'hideSeek' && status.phase === 'seeking' && roleOf(status, id) === 'hider');
}

/** Hiders still in play: these are the only targets on the seeker's radar. */
export function remainingHiders(status: GameStatus): string[] {
  return status.hiders.filter(id => !status.found.includes(id));
}

/** Server-side round rules. Pure apart from the injected random source. */
export class HideSeekRules {
  status: GameStatus;

  constructor(mode: GameMode, private readonly random: () => number = Math.random) {
    this.status = initialGameStatus(mode);
  }

  get active(): boolean {
    return this.status.mode === 'hideSeek' && (this.status.phase === 'hiding' || this.status.phase === 'seeking');
  }

  markLoaded(id: string, present: readonly string[]): void {
    if (!this.status.loaded.includes(id) && present.includes(id)) this.status.loaded.push(id);
  }

  canStart(players: readonly string[]): boolean {
    const { status } = this;
    return status.mode === 'hideSeek' && (status.phase === 'lobby' || status.phase === 'ended')
      && players.length >= MIN_HIDE_SEEK_PLAYERS && players.every(id => status.loaded.includes(id));
  }

  start(players: readonly string[], time: number): boolean {
    if (!this.canStart(players)) return false;
    const seekerId = players[Math.floor(this.random() * players.length) % players.length];
    Object.assign(this.status, {
      phase: 'hiding', round: this.status.round + 1, seekerId,
      hiders: players.filter(id => id !== seekerId), hidden: [], found: [],
      phaseStartedAt: time, hideDeadline: time + HIDE_TIME_LIMIT, outcome: undefined,
    } satisfies Partial<GameStatus>);
    return true;
  }

  setHidden(id: string, hidden: boolean, time: number): boolean {
    const { status } = this;
    if (status.phase !== 'hiding' || !status.hiders.includes(id)) return false;
    const index = status.hidden.indexOf(id);
    if (hidden && index < 0) status.hidden.push(id);
    else if (!hidden && index >= 0) status.hidden.splice(index, 1);
    else return false;
    if (status.hiders.every(hider => status.hidden.includes(hider))) this.beginSeeking(time);
    return true;
  }

  /** Returns true when this hit tagged a hider. */
  tag(shooterId: string, targetId: string, time: number): boolean {
    const { status } = this;
    if (status.phase !== 'seeking' || shooterId !== status.seekerId
      || !status.hiders.includes(targetId) || status.found.includes(targetId)) return false;
    status.found.push(targetId);
    if (remainingHiders(status).length === 0) this.end('allFound', time);
    return true;
  }

  giveUp(id: string, time: number): boolean {
    if (this.status.phase !== 'seeking' || id !== this.status.seekerId) return false;
    this.end('gaveUp', time);
    return true;
  }

  update(time: number): void {
    if (this.status.phase === 'hiding' && time >= this.status.hideDeadline) this.beginSeeking(time);
  }

  removePlayer(id: string, time: number): void {
    const { status } = this;
    status.loaded = status.loaded.filter(other => other !== id);
    if (!this.active) return;
    if (status.seekerId === id) {
      this.end('aborted', time);
      return;
    }
    status.hiders = status.hiders.filter(other => other !== id);
    status.hidden = status.hidden.filter(other => other !== id);
    status.found = status.found.filter(other => other !== id);
    if (status.hiders.length === 0) this.end('aborted', time);
    else if (status.phase === 'hiding' && status.hiders.every(hider => status.hidden.includes(hider))) this.beginSeeking(time);
    else if (status.phase === 'seeking' && remainingHiders(status).length === 0) this.end('allFound', time);
  }

  private beginSeeking(time: number): void {
    this.status.phase = 'seeking';
    this.status.phaseStartedAt = time;
  }

  private end(outcome: RoundOutcome, time: number): void {
    this.status.phase = 'ended';
    this.status.outcome = outcome;
    this.status.phaseStartedAt = time;
  }
}
