import './ui/defense.css';
import * as THREE from 'three';
import { configureToneMapping } from '@huis/house/client/comicStyle';
import { LOW_QUALITY } from '@huis/house/client/quality';
import { createAudio } from './audio';
import { Battle, TIER_COLORS } from './render/battle';
import { CommanderCamera } from './render/camera';
import { createGridOverlay } from './render/debugGrid';
import { updateCutaway } from './render/dollhouse';
import { renderToyIcons, type IconRequest } from './render/icons';
import { MAX_PIXEL_RATIO, createRenderer, createStage } from './render/scene';
import { createToyMaterials } from './render/toyMaterial';
import type { ToyId } from './render/toys/index';
import { ENEMIES, TIER_NAMES, type EnemyKind, type Tier } from './sim/enemies';
import { FLOOR_Y, decodeGrid, type GridFile } from './sim/grid';
import gridFile from './sim/grid.generated.json';
import { HIGH_GROUND_RANGE, LANES, SURFACES, createMap, surfaceAt } from './sim/map';
import {
  ABILITIES, DIFFICULTIES, STEP, callWave, canCallWave, checkPlacement, continueEndless, createGame, earlyBonus, marbleTarget,
  placeTower, sellTower, sellValue, setTargetMode, starsFor, stepGame, upgradeCost, upgradeTower, useAbility, waveNumbered,
  type AbilityKind, type Difficulty, type GameState, type Tower,
} from './sim/sim';
import { MAX_LEVEL, TARGET_MODES, TOWERS, TOWER_KINDS, type TowerKind } from './sim/towers';
import { CAMPAIGN_WAVES, WEST_LANE_WAVE } from './sim/waves';
import { createHud } from './ui/hud';
import type { HudAbility, HudBuildItem, HudScreen, HudSelection, HudStat, HudView, HudWaveGroup } from './ui/hudTypes';

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const stageMount = byId<HTMLDivElement>('stage');
const hudRoot = byId<HTMLDivElement>('hud');
const loading = byId<HTMLElement>('loading');
const loadingFill = byId<HTMLSpanElement>('loadingFill');
const loadingText = byId<HTMLParagraphElement>('loadingText');
const fatal = byId<HTMLElement>('fatal');
const query = new URLSearchParams(location.search);

const SAVE_KEY = 'little-defenders-save';
type Save = { best: Record<Difficulty, { wave: number; stars: number }>; muted: boolean };
function loadSave(): Save {
  const empty: Save = { best: { easy: { wave: 0, stars: 0 }, normal: { wave: 0, stars: 0 }, hard: { wave: 0, stars: 0 } }, muted: false };
  try {
    const stored = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null') as Partial<Save> | null;
    if (!stored) return empty;
    return { best: { ...empty.best, ...stored.best }, muted: stored.muted === true };
  } catch {
    return empty;
  }
}
function storeSave(save: Save): void {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* private mode: progress is kept for this visit only */ }
}

const HOTKEYS: Record<TowerKind, string> = { popgun: '1', dart: '2', glue: '3', mortar: '4', ballista: '5', robot: '6' };
const ABILITY_KEYS: Record<AbilityKind, string> = { footsteps: 'F', marbles: 'G' };
const OVERVIEW = { x: 12.2, z: -16.2, yaw: -Math.PI / 2, pitch: 0.98, distance: 45 };
const OVERVIEW_TALL = { x: 12.3, z: -15.5, yaw: 0, pitch: 1.12, distance: 54 };

const format = (value: number, digits = 1) => (Number.isInteger(value) ? String(value) : value.toFixed(digits));

/** Stat rows of a tower kind at a level (1-based), with the next level's values where they differ. */
function towerStats(kind: TowerKind, level: number, high: boolean): HudStat[] {
  const def = TOWERS[kind];
  const rows = (index: number): [string, string][] => {
    const data = def.levels[index];
    const list: [string, string][] = [];
    if (def.attack === 'beam') list.push(['Beam', `${data.damage}–${Math.round(data.damage * data.ramp!.factor)} / s`]);
    else if (data.damage > 0) list.push(['Damage', String(data.damage)]);
    if (data.cooldown > 0) list.push(['Rate', `${format(1 / data.cooldown)} / s`]);
    list.push(['Range', format(data.range * (high ? HIGH_GROUND_RANGE : 1))]);
    if (data.splash) list.push(['Burst', format(data.splash)]);
    if (data.pierce) list.push(['Pierces', String(data.pierce)]);
    if (data.slow) list.push(['Slows by', `${Math.round((1 - data.slow.factor) * 100)}%`], ['Puddle', `${format(data.slow.radius)} wide, ${format(data.slow.duration)} s`]);
    return list;
  };
  const now = rows(level - 1);
  const next = level < MAX_LEVEL ? rows(level) : null;
  return now.map(([label, value], index) => ({ label, value, next: next && next[index][1] !== value ? next[index][1] : undefined }));
}

async function boot(): Promise<void> {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = createRenderer();
  } catch (error) {
    console.error(error);
    loading.hidden = true;
    fatal.hidden = false;
    return;
  }
  stageMount.append(renderer.domElement);
  const overlay = document.createElement('div');
  overlay.className = 'floaters-mount';
  stageMount.append(overlay);
  const commander = new CommanderCamera(renderer.domElement);
  let width = 1;
  let height = 1;

  const stage = await createStage(renderer, commander.camera, progress => {
    if (progress.stage === 'download') {
      const share = progress.total ? progress.loaded / progress.total : 0;
      loadingFill.style.width = `${Math.round(share * 80)}%`;
      loadingText.textContent = progress.total
        ? `Opening the toy box · ${Math.round(progress.loaded / 1048576)} of ${Math.round(progress.total / 1048576)} MB`
        : 'Opening the toy box';
    } else if (progress.stage === 'prepare') {
      loadingFill.style.width = '88%';
      loadingText.textContent = 'Setting out the furniture';
    } else {
      loadingFill.style.width = '96%';
      loadingText.textContent = 'Winding up the toys';
    }
  });

  const map = createMap(decodeGrid(gridFile as GridFile));
  if (query.get('debug') === 'grid') stage.scene.add(createGridOverlay(map));
  const battle = new Battle(stage.scene, createToyMaterials(stage.environment), overlay);
  const audio = createAudio();
  const save = loadSave();
  audio.setMuted(save.muted);

  // Thumbnails for the HUD: every tower level, and every soldier in each plastic colour.
  const iconRequests: IconRequest[] = [];
  for (const kind of TOWER_KINDS) for (let level = 1; level <= MAX_LEVEL; level += 1) iconRequests.push({ key: `${kind}-${level}`, toy: `${kind}-${level}` as ToyId });
  for (const kind of Object.keys(ENEMIES) as EnemyKind[]) {
    TIER_COLORS.forEach((color, tier) => iconRequests.push({ key: `${kind}:${tier}`, toy: kind, tint: color }));
  }
  const icons = renderToyIcons(iconRequests);

  let screen: HudScreen = 'title';
  let game: GameState | null = null;
  let difficulty: Difficulty = 'normal';
  let speed: 1 | 2 | 3 = 1;
  let placing: TowerKind | null = null;
  let placingCheck: { valid: boolean; reason: string | null } = { valid: false, reason: null };
  let selectedId = 0;
  let armed: AbilityKind | null = null;
  let hover: THREE.Vector2 | null = null;
  let accumulator = 0;
  let newBest = false;
  let lastStompToast = 0;
  const baseExposure = renderer.toneMappingExposure;

  const selectedTower = (): Tower | null => game?.towers.find(tower => tower.id === selectedId) ?? null;
  const tall = () => width < height;
  const cancelModes = () => {
    placing = null;
    armed = null;
    battle.hideGhost();
    battle.hideAim();
  };

  function startGame(next: Difficulty): void {
    difficulty = next;
    game = createGame(next, (Math.random() * 0x7fffffff) | 0);
    screen = 'playing';
    speed = 1;
    selectedId = 0;
    newBest = false;
    accumulator = 0;
    cancelModes();
    battle.reset();
    commander.frame(tall() ? OVERVIEW_TALL : OVERVIEW);
    // Past Bedtime: the room lights are low.
    configureToneMapping(renderer);
    renderer.toneMappingExposure = baseExposure * (next === 'hard' ? 0.7 : 1);
    audio.setMusic(true);
    audio.ui('start');
  }

  function finish(won: boolean): void {
    if (!game) return;
    const stars = won ? starsFor(game) : 0;
    const best = save.best[difficulty];
    // A win counts as the whole campaign even though the wave counter stops at the last wave.
    const reached = won ? Math.max(game.wave, CAMPAIGN_WAVES) : Math.max(0, game.wave - 1);
    newBest = reached > best.wave || (reached === best.wave && stars > best.stars);
    if (newBest) {
      save.best[difficulty] = { wave: Math.max(best.wave, reached), stars: Math.max(best.stars, stars) };
      storeSave(save);
    }
    screen = won ? 'won' : 'lost';
    cancelModes();
    selectedId = 0;
    battle.hideMarkers();
    audio.setMusic(false);
  }

  const hud = createHud(hudRoot, {
    start: startGame,
    pickBuild(kind) {
      if (!game || screen !== 'playing') return;
      if (kind && kind !== placing && game.money < TOWERS[kind].levels[0].cost) {
        audio.ui('deny');
        hud.toast('Not enough buttons yet', 'bad');
        return;
      }
      armed = null;
      battle.hideAim();
      placing = kind === placing ? null : kind;
      selectedId = 0;
      if (!placing) battle.hideGhost();
      audio.ui('pick');
    },
    upgrade() {
      if (game && upgradeTower(game, selectedId)) return;
      audio.ui('deny');
    },
    sell() {
      if (game && sellTower(game, selectedId)) selectedId = 0;
    },
    setMode(mode) {
      if (game) setTargetMode(game, selectedId, mode);
      audio.ui('click');
    },
    deselect() { selectedId = 0; },
    callWave() {
      if (game && screen === 'playing' && callWave(game)) return;
      audio.ui('deny');
    },
    setSpeed(next) {
      speed = next;
      audio.setSpeed(next);
      audio.ui('click');
    },
    pause() {
      if (screen === 'playing') {
        screen = 'paused';
        audio.ui('pause');
      }
    },
    resume() {
      if (screen === 'paused') screen = 'playing';
      audio.ui('click');
    },
    restart() { startGame(difficulty); },
    quit() {
      game = null;
      screen = 'title';
      cancelModes();
      selectedId = 0;
      battle.reset();
      renderer.toneMappingExposure = baseExposure;
      audio.setMusic(false);
      audio.ui('click');
    },
    ability(kind) {
      if (!game || screen !== 'playing') return;
      if (game.cooldowns[kind] > 0) {
        audio.ui('deny');
        return;
      }
      if (kind === 'footsteps') {
        useAbility(game, 'footsteps');
        return;
      }
      placing = null;
      battle.hideGhost();
      armed = armed === kind ? null : kind;
      if (!armed) battle.hideAim();
      audio.ui('pick');
    },
    toggleMute() {
      save.muted = !save.muted;
      storeSave(save);
      audio.setMuted(save.muted);
    },
    continueEndless() {
      if (!game) return;
      continueEndless(game);
      screen = 'playing';
      audio.setMusic(true);
    },
  });

  const resize = () => {
    width = Math.max(1, stageMount.clientWidth);
    height = Math.max(1, stageMount.clientHeight);
    renderer.setSize(width, height, false);
    commander.resize(width, height);
    battle.resize(height * renderer.getPixelRatio(), commander.camera.fov);
  };
  resize();
  addEventListener('resize', resize);
  commander.frame(tall() ? OVERVIEW_TALL : OVERVIEW, true);

  const projected = new THREE.Vector3();
  /** The tower drawn nearest to a screen point, within a finger's width. */
  function towerAt(ndc: THREE.Vector2): Tower | null {
    if (!game) return null;
    let best: Tower | null = null;
    let bestGap = 46;
    for (const tower of game.towers) {
      projected.set(tower.x, tower.y + 0.6, tower.z).project(commander.camera);
      const gap = Math.hypot((projected.x - ndc.x) * width / 2, (projected.y - ndc.y) * height / 2);
      if (gap < bestGap) {
        bestGap = gap;
        best = tower;
      }
    }
    return best;
  }

  /** Where the pointer is on the floor or a furniture top, and whether the toy being placed fits there. */
  function placementAt(ndc: THREE.Vector2): { x: number; y: number; z: number; range: number; valid: boolean; reason: string | null } | null {
    if (!game || !placing) return null;
    const pick = commander.pick(ndc, SURFACES);
    if (!pick) return null;
    const range = TOWERS[placing].levels[0].range;
    // A floor hit beneath a furniture top is out of sight from above.
    if (pick.y === FLOOR_Y && surfaceAt(pick.x, pick.z)) return { ...pick, range, valid: false, reason: 'Hidden under furniture' };
    const check = checkPlacement(game, map, placing, pick.x, pick.z);
    if (!check.ok) return { ...pick, range, valid: false, reason: check.reason };
    return { x: pick.x, y: check.y, z: pick.z, range: range * (check.high ? HIGH_GROUND_RANGE : 1), valid: true, reason: null };
  }

  commander.onHover = ndc => { hover = (hover ?? new THREE.Vector2()).copy(ndc); };
  commander.onTap = (ndc, event) => {
    audio.unlock();
    if (!game || screen !== 'playing') return;
    if (event.pointerType !== 'mouse') hover = null;
    if (placing) {
      const spot = placementAt(ndc);
      if (spot?.valid && placeTower(game, map, placing, spot.x, spot.z)) {
        // Keep placing the same toy while there are buttons for another.
        if (game.money < TOWERS[placing].levels[0].cost) cancelModes();
      } else {
        audio.ui('deny');
        if (spot?.reason) hud.toast(spot.reason, 'bad');
      }
      return;
    }
    if (armed === 'marbles') {
      const pick = commander.pick(ndc);
      if (pick && useAbility(game, 'marbles', pick.x, pick.z)) {
        armed = null;
        battle.hideAim();
      } else {
        audio.ui('deny');
        hud.toast('Aim at a taped route', 'bad');
      }
      return;
    }
    const tower = towerAt(ndc);
    selectedId = tower?.id ?? 0;
    if (tower) audio.ui('select');
  };
  renderer.domElement.addEventListener('pointerdown', event => {
    audio.unlock();
    // Right click backs out of placing or aiming.
    if (event.button === 2 && (placing || armed)) cancelModes();
  });
  renderer.domElement.addEventListener('pointerleave', () => { hover = null; });

  addEventListener('keydown', event => {
    if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
    audio.unlock();
    const kind = TOWER_KINDS.find(candidate => HOTKEYS[candidate] === event.key);
    if (screen === 'playing' && game) {
      if (kind) {
        armed = null;
        battle.hideAim();
        placing = placing === kind ? null : kind;
        selectedId = 0;
        if (!placing) battle.hideGhost();
        audio.ui('pick');
      } else if (event.code === 'Escape') {
        if (placing || armed) cancelModes();
        else if (selectedId) selectedId = 0;
        else {
          screen = 'paused';
          audio.ui('pause');
        }
      } else if (event.code === 'Space') {
        event.preventDefault();
        if (!callWave(game)) audio.ui('deny');
      } else if (event.code === 'KeyP') {
        screen = 'paused';
        audio.ui('pause');
      } else if (event.code === 'KeyU') {
        if (!upgradeTower(game, selectedId)) audio.ui('deny');
      } else if (event.code === 'KeyX' || event.code === 'Delete' || event.code === 'Backspace') {
        if (sellTower(game, selectedId)) selectedId = 0;
      } else if (event.code === 'KeyT') {
        const tower = selectedTower();
        if (tower) setTargetMode(game, tower.id, TARGET_MODES[(TARGET_MODES.indexOf(tower.mode) + 1) % TARGET_MODES.length]);
      } else if (event.code === 'KeyF') {
        if (!useAbility(game, 'footsteps')) audio.ui('deny');
      } else if (event.code === 'KeyG') {
        if (game.cooldowns.marbles > 0) audio.ui('deny');
        else {
          placing = null;
          battle.hideGhost();
          armed = armed === 'marbles' ? null : 'marbles';
          if (!armed) battle.hideAim();
        }
      } else if (event.code === 'Tab') {
        event.preventDefault();
        speed = ((speed % 3) + 1) as 1 | 2 | 3;
        audio.setSpeed(speed);
      }
    } else if (screen === 'paused' && (event.code === 'Escape' || event.code === 'KeyP')) {
      screen = 'playing';
    }
    if (event.code === 'KeyM') {
      save.muted = !save.muted;
      storeSave(save);
      audio.setMuted(save.muted);
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === 'playing') screen = 'paused';
  });

  function hintFor(state: GameState): string | null {
    const quiet = state.pending.length === 0 && state.enemies.length === 0;
    if (state.wave === 0) {
      return state.towers.length === 0
        ? 'Pick a toy from the bar and put it beside the taped route.'
        : 'Ready? Press Start to send the first wave.';
    }
    if (state.wave <= 3 && state.towers.length > 0 && state.towers.every(tower => tower.level === 1)
      && state.money >= Math.min(...state.towers.map(tower => upgradeCost(tower) ?? Infinity))) {
      return 'Click one of your toys to upgrade it.';
    }
    if (state.wave === 2 && quiet) return 'Send the next wave early for bonus buttons.';
    if (state.wave === WEST_LANE_WAVE - 1 && quiet) return 'Blue tape: from the next wave soldiers also come up the stairs.';
    if (state.wave === 7 && quiet) return 'Helicopters next. Marbles and glue cannot reach aircraft.';
    if (state.wave === 9 && quiet) return 'A boss is coming. Footsteps! (F) freezes soldiers for a moment.';
    return null;
  }

  function buildView(): HudView {
    const state = game;
    const settings = DIFFICULTIES[difficulty];
    const build: HudBuildItem[] = TOWER_KINDS.map(kind => {
      const def = TOWERS[kind];
      return {
        kind, name: def.name, blurb: def.blurb, cost: def.levels[0].cost, affordable: !!state && state.money >= def.levels[0].cost,
        selected: placing === kind, hotkey: HOTKEYS[kind], icon: icons[`${kind}-1`] ?? '', hitsAir: def.hitsAir, heavy: def.heavy,
      };
    });
    const tower = selectedTower();
    let selection: HudSelection | null = null;
    if (tower && state) {
      const def = TOWERS[tower.kind];
      const cost = upgradeCost(tower);
      selection = {
        id: tower.id, kind: tower.kind, name: def.name, blurb: def.blurb, icon: icons[`${tower.kind}-${tower.level}`] ?? '',
        level: tower.level, maxLevel: MAX_LEVEL, stats: towerStats(tower.kind, tower.level, tower.high), upgradeCost: cost,
        canAffordUpgrade: cost !== null && state.money >= cost, sellValue: sellValue(tower), mode: tower.mode,
        hasTargeting: def.attack !== 'puddle', kills: tower.kills, high: tower.high, stunned: tower.stunned > 0,
      };
    }
    const abilities: HudAbility[] = (Object.keys(ABILITIES) as AbilityKind[]).map(kind => ({
      kind, name: ABILITIES[kind].name, blurb: ABILITIES[kind].blurb, hotkey: ABILITY_KEYS[kind],
      ready: !!state && state.cooldowns[kind] <= 0, remaining: state ? Math.ceil(state.cooldowns[kind]) : 0,
      cooldown: ABILITIES[kind].cooldown, armed: armed === kind,
    }));
    let nextWave: HudView['nextWave'] = null;
    if (state && canCallWave(state)) {
      const number = state.wave + 1;
      const wave = waveNumbered(state, number);
      // One chip per soldier type, colour and route.
      const merged = new Map<string, HudWaveGroup>();
      for (const squad of wave.squads) {
        const def = ENEMIES[squad.kind];
        const lane = def.flying ? 'air' : squad.lane;
        const key = `${squad.kind}:${squad.tier}:${lane}`;
        const group = merged.get(key);
        if (group) group.count += squad.count;
        else {
          merged.set(key, {
            kind: squad.kind, name: def.name, blurb: def.blurb, tier: squad.tier as Tier, tierName: TIER_NAMES[squad.tier], count: squad.count,
            lane, laneName: LANES[lane].name, boss: def.boss, icon: icons[`${squad.kind}:${squad.tier}`] ?? '',
          });
        }
      }
      nextWave = { number, boss: wave.boss, groups: [...merged.values()] };
    }
    const won = screen === 'won';
    return {
      screen, difficulty, difficultyName: settings.name,
      lives: state?.lives ?? settings.lives, maxLives: state?.maxLives ?? settings.lives, money: state?.money ?? settings.money,
      wave: state?.wave ?? 0, totalWaves: CAMPAIGN_WAVES, endless: state?.endless ?? false,
      enemiesLeft: state ? state.enemies.length + state.pending.length : 0,
      countdown: state && state.countdown > 0 ? Math.ceil(state.countdown) : null,
      canCallWave: !!state && screen === 'playing' && canCallWave(state), callBonus: state ? earlyBonus(state) : 0,
      speed, muted: save.muted, build, selection,
      placing: placing ? { kind: placing, name: TOWERS[placing].name, valid: placingCheck.valid, reason: placingCheck.reason } : null,
      abilities, nextWave, hint: state && screen === 'playing' && !placing && !selection ? hintFor(state) : null,
      difficulties: (Object.keys(DIFFICULTIES) as Difficulty[]).map(id => ({
        id, name: DIFFICULTIES[id].name, blurb: DIFFICULTIES[id].blurb, lives: DIFFICULTIES[id].lives,
        bestWave: save.best[id].wave, bestStars: save.best[id].stars,
      })),
      result: state && (won || screen === 'lost') ? {
        won, stars: won ? starsFor(state) : 0, wave: won ? Math.max(state.wave, CAMPAIGN_WAVES) : state.wave, totalWaves: CAMPAIGN_WAVES,
        kills: state.stats.kills, leaked: state.stats.leaked, newBest, canContinue: won && !state.endless,
      } : null,
    };
  }

  function drainEvents(state: GameState): void {
    for (const event of state.events) {
      battle.handle(event, state);
      audio.handle(event);
      if (event.type === 'wave') {
        hud.banner(state.endless ? `Endless wave ${event.number}` : `Wave ${event.number}`, event.boss ? 'Boss wave!' : undefined, event.boss ? 'boss' : 'wave');
        if (event.number === WEST_LANE_WAVE) hud.toast('Soldiers are coming up the stairs too!', 'bad');
      } else if (event.type === 'spawn' && event.boss) {
        hud.banner(ENEMIES[event.kind].name, ENEMIES[event.kind].blurb, 'boss');
      } else if (event.type === 'die') {
        battle.fell(event, Math.random() * Math.PI * 2);
      } else if (event.type === 'stomp' && state.time - lastStompToast > 3) {
        lastStompToast = state.time;
        hud.toast('Stomp! Nearby toys are jammed', 'bad');
      } else if (event.type === 'won') {
        finish(true);
      } else if (event.type === 'lost') {
        finish(false);
      }
    }
    state.events.length = 0;
  }

  // Dynamic resolution, as in the drone game: render fewer pixels while frames
  // run long, and step back up once there is clear headroom.
  const minPixelRatio = LOW_QUALITY ? 0.6 : Math.min(1, MAX_PIXEL_RATIO);
  let pixelRatio = MAX_PIXEL_RATIO;
  let frameAverage = 1000 / 60;
  let lastRatioChange = 0;
  /** After a step down, do not try the higher resolution again before this time. */
  let retryAfter = 0;
  let retryWait = 15_000;
  const adaptResolution = (frameMs: number, now: number) => {
    if (frameMs <= 0 || frameMs > 100) return;
    frameAverage += (frameMs - frameAverage) * 0.05;
    let next = pixelRatio;
    // Frame times are locked to the display, so "fast enough" only shows as
    // not missing refreshes; step up carefully and back off if that was wrong.
    if (frameAverage > 21 && pixelRatio > minPixelRatio && now - lastRatioChange > 1500) {
      next = Math.max(minPixelRatio, pixelRatio - 0.2);
      // Each failed attempt at a higher resolution doubles the wait before the next,
      // so a machine that cannot hold it is not nudged up and down for ever.
      retryWait = Math.min(retryWait * 2, 600_000);
      retryAfter = now + retryWait;
    } else if (frameAverage < 17.6 && pixelRatio < MAX_PIXEL_RATIO && now - lastRatioChange > 5000 && now > retryAfter) {
      next = Math.min(MAX_PIXEL_RATIO, pixelRatio + 0.2);
    }
    if (next === pixelRatio) return;
    pixelRatio = next;
    lastRatioChange = now;
    renderer.setPixelRatio(pixelRatio);
    resize();
  };

  let previous = performance.now();
  let titleTurn = 0;
  const frame = (now: number) => {
    // The first callback can carry a timestamp from before `previous` was taken.
    const dt = Math.min(0.1, Math.max(0, (now - previous) / 1000));
    adaptResolution(now - previous, now);
    previous = now;
    if (game && screen === 'playing') {
      accumulator += dt * speed;
      let steps = 0;
      while (accumulator >= STEP && steps < 14) {
        stepGame(game, STEP);
        accumulator -= STEP;
        steps += 1;
        // Stop stepping the moment the game ends, so its last frame stays on screen.
        if (game.phase !== 'playing') break;
      }
      if (steps === 14) accumulator = 0;
      drainEvents(game);
    }
    if (screen === 'title') {
      // A slow look around the room behind the menu.
      titleTurn += dt * 0.05;
      commander.frame({ x: 13, z: -12, yaw: -1.25 + Math.sin(titleTurn) * 0.55, pitch: 0.8, distance: 36 });
    }
    commander.update(dt);
    updateCutaway(commander.heading);
    if (battle.jolt > 0) {
      commander.camera.position.x += (Math.random() - 0.5) * battle.jolt * 0.35;
      commander.camera.position.y += (Math.random() - 0.5) * battle.jolt * 0.35;
    }

    // Markers follow the pointer and the selection.
    placingCheck = { valid: false, reason: null };
    if (game && screen === 'playing') {
      if (placing && hover) {
        const spot = placementAt(hover);
        if (spot) {
          battle.showGhost(placing, spot.x, spot.y, spot.z, spot.range, spot.valid);
          placingCheck = { valid: spot.valid, reason: spot.reason };
        } else battle.hideGhost();
      } else if (placing) {
        battle.hideGhost();
        battle.hideRange();
      }
      if (armed === 'marbles' && hover) {
        const pick = commander.pick(hover);
        if (pick) battle.showAim(pick.x, pick.z, 0.9, marbleTarget(pick.x, pick.z) !== null);
      }
      if (!placing) {
        const tower = selectedTower();
        if (!tower) selectedId = 0;
        battle.showSelection(tower);
        if (!tower) battle.hideRange();
      } else battle.showSelection(null);
    }
    battle.draw(game, screen === 'paused' ? 0 : dt, commander.camera, width, height);
    renderer.render(stage.scene, commander.camera);
    hud.update(buildView());
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  loadingFill.style.width = '100%';
  loading.classList.add('fade');
  setTimeout(() => { loading.hidden = true; }, 600);

  if (import.meta.env.DEV || query.has('debug')) {
    // Hooks for the browser smoke test and for poking at the game from the console.
    Object.assign(window, {
      defense: {
        THREE, renderer, stage, commander, battle, map,
        get frameMs() { return frameAverage; },
        get pixelRatio() { return pixelRatio; },
        get game() { return game; },
        get screen() { return screen; },
        start: startGame,
        place: (kind: TowerKind, x: number, z: number) => (game ? placeTower(game, map, kind, x, z) : null),
        callWave: () => (game ? callWave(game) : false),
        /** Run the simulation forward without drawing. */
        skip(seconds: number) {
          if (!game) return;
          for (let step = 0; step < seconds / STEP && game.phase === 'playing'; step += 1) {
            stepGame(game, STEP);
            if (step % 30 === 0) drainEvents(game);
          }
          drainEvents(game);
        },
      },
    });
  }
  document.body.dataset.ready = 'true';
}

boot().catch(error => {
  console.error(error);
  loadingText.textContent = `The room could not be loaded: ${error instanceof Error ? error.message : 'unknown error'}`;
});
