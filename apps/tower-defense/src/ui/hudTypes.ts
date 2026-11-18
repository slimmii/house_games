import type { EnemyKind, Tier } from '../sim/enemies';
import type { LaneId } from '../sim/map';
import type { AbilityKind, Difficulty } from '../sim/sim';
import type { TargetMode, TowerKind } from '../sim/towers';

/**
 * Contract between the game (main.ts) and the HUD (hud.ts).
 * The game calls `hud.update(view)` every frame with a fresh snapshot; the HUD
 * must compare with what it last drew and touch the DOM only where something
 * changed. The HUD never reads game state directly and never changes it: user
 * intent goes back through `HudActions`.
 */
export type HudScreen = 'title' | 'playing' | 'paused' | 'won' | 'lost';

export type HudBuildItem = {
  kind: TowerKind;
  name: string;
  blurb: string;
  cost: number;
  affordable: boolean;
  /** The player is currently placing this toy. */
  selected: boolean;
  /** Key shown on the button, e.g. "1". The game handles the key press itself. */
  hotkey: string;
  /** Data URL of a rendered thumbnail; may be an empty string (draw a neutral placeholder then). */
  icon: string;
  hitsAir: boolean;
  /** Cannot stand on furniture. */
  heavy: boolean;
};

export type HudStat = { label: string; value: string; /** Value after the next upgrade, when it differs. */ next?: string };

export type HudSelection = {
  id: number;
  kind: TowerKind;
  name: string;
  blurb: string;
  icon: string;
  level: number;
  maxLevel: number;
  stats: HudStat[];
  /** null at the top level. */
  upgradeCost: number | null;
  canAffordUpgrade: boolean;
  sellValue: number;
  mode: TargetMode;
  /** False for toys that do not pick single targets in a useful way (none yet; show the control when true). */
  hasTargeting: boolean;
  kills: number;
  /** Standing on furniture (range bonus). */
  high: boolean;
  /** Jammed by a boss stomp right now. */
  stunned: boolean;
};

export type HudWaveGroup = { kind: EnemyKind; name: string; blurb: string; tier: Tier; tierName: string; count: number; lane: LaneId; laneName: string; boss: boolean; icon: string };

export type HudAbility = {
  kind: AbilityKind;
  name: string;
  blurb: string;
  hotkey: string;
  ready: boolean;
  /** Seconds until ready. */
  remaining: number;
  /** Full cooldown in seconds. */
  cooldown: number;
  /** Waiting for the player to click a spot on the floor. */
  armed: boolean;
};

export type HudDifficulty = { id: Difficulty; name: string; blurb: string; lives: number; bestWave: number; bestStars: number };

export type HudResult = { won: boolean; stars: number; wave: number; totalWaves: number; kills: number; leaked: number; newBest: boolean; canContinue: boolean };

export type HudView = {
  screen: HudScreen;
  difficulty: Difficulty;
  difficultyName: string;
  lives: number;
  maxLives: number;
  money: number;
  /** Waves launched so far (0 before the first). */
  wave: number;
  totalWaves: number;
  endless: boolean;
  enemiesLeft: number;
  /** Whole seconds until the next wave launches by itself, or null when no timer runs. */
  countdown: number | null;
  canCallWave: boolean;
  /** Buttons paid for calling the wave now. */
  callBonus: number;
  speed: 1 | 2 | 3;
  muted: boolean;
  build: HudBuildItem[];
  selection: HudSelection | null;
  /** Set while the player is choosing a spot for a toy. */
  placing: { kind: TowerKind; name: string; valid: boolean; reason: string | null } | null;
  abilities: HudAbility[];
  /** What the next wave brings; null when there is none. */
  nextWave: { number: number; boss: boolean; groups: HudWaveGroup[] } | null;
  /** A short coaching line for new players, or null. */
  hint: string | null;
  difficulties: HudDifficulty[];
  /** Filled on the `won` and `lost` screens. */
  result: HudResult | null;
};

export type HudActions = {
  start(difficulty: Difficulty): void;
  /** Start placing a toy, or pass null to cancel. */
  pickBuild(kind: TowerKind | null): void;
  upgrade(): void;
  sell(): void;
  setMode(mode: TargetMode): void;
  deselect(): void;
  callWave(): void;
  setSpeed(speed: 1 | 2 | 3): void;
  pause(): void;
  resume(): void;
  restart(): void;
  /** Back to the title screen. */
  quit(): void;
  ability(kind: AbilityKind): void;
  toggleMute(): void;
  /** After a win: keep playing endless waves. */
  continueEndless(): void;
};

export type Hud = {
  update(view: HudView): void;
  /** A short message near the top of the screen that fades by itself. */
  toast(text: string, tone?: 'good' | 'bad' | 'info'): void;
  /** A big centred announcement that fades by itself ("Wave 5", "Boss!"). */
  banner(title: string, subtitle?: string, tone?: 'wave' | 'boss'): void;
  dispose(): void;
};
