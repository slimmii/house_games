import { nearbyOpenCloset, targetedDoor } from '../shared/interaction';
import { closetEscape } from '../shared/closet-escape';
import { DOORS, type DoorState } from '@huis/house/shared/doors';
import * as THREE from 'three';
import { Client, type Room } from '@colyseus/sdk';
import './style.css';
import {
  type Controls,
  type PaintMark,
  type DroneState,
  type ProjectileState,
  type Snapshot,
  type SnapshotUpdate,
  applySnapshotUpdate,
  MAX_PILOTS,
  ROOM_NAME_MIN,
  sanitizeRoomName,
  NEUTRAL_CONTROLS,
} from '../shared/protocol';
import { MIN_HIDE_SEEK_PLAYERS, canRespawn, isFrozen, remainingHiders, roleOf, type GameMode, type GameStatus } from '../shared/hideSeek';
import { DronePredictor, SnapshotBuffer, FIXED_STEP } from './movement';
import { chaseCameraPose } from '../shared/aim';
import { houseCollisionInstalled } from '@huis/house/shared/collision';
import { paintSurfacesInstalled } from '@huis/house/shared/paint-surfaces';
import { HOUSE_BOUNDS, ROOMS, getRoomName } from '@huis/house/shared/world';
import { createHouse, onHouseLoadProgress, preloadHouse, type HouseLoadProgress } from '@huis/house/client/world';
import { createDrone, updateDroneVisual, disposeDrone } from './drone';
import { PaintBatch } from './paintBatch';
import { ProjectileBatch } from './projectileBatch';
import { InkAudio, InkEffects } from './inkEffects';
import { INK_FIRE_INTERVAL } from '../shared/ink';
import { ProximityTracker, type ProximityReading } from './proximity';
import { COMIC_STYLE, TOY_STYLE, configureToneMapping, createOutlinePass, installComicShading } from '@huis/house/client/comicStyle';
import daylight from '@huis/house/shared/daylight.json';
import { LOW_QUALITY, QUALITY_FORCED, rememberLowQuality } from '@huis/house/client/quality';

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const lobby = byId<HTMLElement>('lobby');
const game = byId<HTMLElement>('game');
const gameMount = byId<HTMLElement>('gameCanvas');
const joinForm = byId<HTMLFormElement>('joinForm');
const nameInput = byId<HTMLInputElement>('playerName');
const roomNameInput = byId<HTMLInputElement>('roomName');
const roomNameField = byId<HTMLElement>('roomNameField');
const createButton = byId<HTMLButtonElement>('createButton');
const joinButton = byId<HTMLButtonElement>('joinButton');
const joinLabel = byId<HTMLElement>('joinLabel');
const modePicker = byId<HTMLFieldSetElement>('modePicker');
const inviteBanner = byId<HTMLElement>('inviteBanner');
const inviteCode = byId<HTMLElement>('inviteCode');
const planStack = byId<HTMLElement>('planStack');
const loadCard = byId<HTMLElement>('loadCard');
const loadTitle = byId<HTMLElement>('loadTitle');
const loadPercent = byId<HTMLElement>('loadPercent');
const loadBar = byId<HTMLElement>('loadBar');
const loadDetail = byId<HTMLElement>('loadDetail');
const houseLoading = byId<HTMLElement>('houseLoading');
const houseLoadingTitle = byId<HTMLElement>('houseLoadingTitle');
const houseLoadingBar = byId<HTMLElement>('houseLoadingBar');
const houseLoadingDetail = byId<HTMLElement>('houseLoadingDetail');
const seekerBlind = byId<HTMLElement>('seekerBlind');
const blindBody = byId<HTMLElement>('blindBody');
const blindPilots = byId<HTMLElement>('blindPilots');
const blindTimer = byId<HTMLElement>('blindTimer');
const roundCard = byId<HTMLElement>('roundCard');
const roundTag = byId<HTMLElement>('roundTag');
const roundTitle = byId<HTMLElement>('roundTitle');
const roundDetail = byId<HTMLElement>('roundDetail');
const roundAction = byId<HTMLButtonElement>('roundAction');
const joinHint = byId<HTMLElement>('joinHint');
const roomBadge = byId<HTMLElement>('roomBadge');
const connectionDot = byId<HTMLElement>('connectionDot');
const connectionText = byId<HTMLElement>('connectionText');
const rosterElement = byId<HTMLElement>('roster');
const pilotCount = byId<HTMLElement>('pilotCount');
const locationName = byId<HTMLElement>('locationName');
const speedValue = byId<HTMLElement>('speedValue');
const altitudeValue = byId<HTMLElement>('altitudeValue');
const fpsValue = byId<HTMLElement>('fpsValue');
const pingValue = byId<HTMLElement>('pingValue');
const paintWash = byId<HTMLElement>('paintWash');
const inkMuzzleFlash = byId<HTMLElement>('inkMuzzleFlash');
const notice = byId<HTMLElement>('notice');
const noticeEyebrow = byId<HTMLElement>('noticeEyebrow');
const noticeTitle = byId<HTMLElement>('noticeTitle');
const noticeBody = byId<HTMLElement>('noticeBody');
const noticeActions = byId<HTMLElement>('noticeActions');
const retryButton = byId<HTMLButtonElement>('retryButton');
const lobbyButton = byId<HTMLButtonElement>('lobbyButton');
const leaveButton = byId<HTMLButtonElement>('leaveButton');
const copyInvite = byId<HTMLButtonElement>('copyInvite');
const minimap = byId<HTMLCanvasElement>('minimap');
const toast = byId<HTMLElement>('toast');
const fatalError = byId<HTMLElement>('fatalError');
const crosshair = document.querySelector<HTMLElement>('.crosshair')!;
const proximityMeter = byId<HTMLElement>('proximityMeter');
const proximityTrend = byId<HTMLElement>('proximityTrend');
const proximityDetail = byId<HTMLElement>('proximityDetail');
const proximityThumb = byId<HTMLElement>('proximityThumb');
const proximityTracker = new ProximityTracker();
const inkAudio = new InkAudio();

const query = new URLSearchParams(location.search);
const queryRoom = query.get('room')?.trim() ?? '';
roomNameInput.value = queryRoom;
nameInput.value = localStorage.getItem('little-rotors-name') ?? '';

let renderer: THREE.WebGLRenderer;
try {
  // Low quality skips MSAA: on integrated GPUs the 4x multisampled buffer
  // costs more than the rest of the frame's pixel work.
  renderer = new THREE.WebGLRenderer({ antialias: !LOW_QUALITY, powerPreference: 'high-performance' });
  // Reading every program's info log forces a synchronous compile; release
  // builds let the driver compile in parallel instead.
  renderer.debug.checkShaderErrors = import.meta.env.DEV;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  configureToneMapping(renderer);
  renderer.transmissionResolutionScale = query.get('glass') === 'full' ? 1 : 0.5;
  renderer.shadowMap.enabled = !COMIC_STYLE && !TOY_STYLE;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  if (COMIC_STYLE) installComicShading();
  // Native CSS resolution avoids spending 2.25× the pixels on retina displays.
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1));
} catch (error) {
  console.error(error);
  lobby.hidden = true;
  fatalError.hidden = false;
  throw new Error('WebGL unavailable');
}

const comicRenderer = createOutlinePass();
// Dynamic resolution: if frames average over ~15 ms for a second, render at a
// lower pixel ratio (down to 0.7, or 0.5 on low quality); step back up once
// there is clear headroom.
const MAX_PIXEL_RATIO = Math.min(devicePixelRatio, 1);
const MIN_PIXEL_RATIO = LOW_QUALITY ? 0.5 : 0.7;
// High quality that still runs under ~40 FPS at its lowest resolution for
// this long switches the next page load to low quality.
const SLOW_FLOOR_MS = 8000;
let slowSince = 0;
let pixelRatio = MAX_PIXEL_RATIO;
let frameTimeAverage = 1000 / 60;
let lastResolutionChange = 0;
function adaptResolution(frameMs: number, now: number): void {
  if (frameMs <= 0 || frameMs > 100) return;
  frameTimeAverage += (frameMs - frameTimeAverage) * 0.05;
  if (!LOW_QUALITY && !QUALITY_FORCED && slowSince >= 0) {
    if (pixelRatio > MIN_PIXEL_RATIO || frameTimeAverage < 25) slowSince = 0;
    else if (!slowSince) slowSince = now;
    else if (now - slowSince > SLOW_FLOOR_MS) {
      slowSince = -1;
      rememberLowQuality();
      showToast('Slow GPU: low graphics from the next load');
    }
  }
  if (now - lastResolutionChange < 1000) return;
  let next = pixelRatio;
  if (frameTimeAverage > 15.5 && pixelRatio > MIN_PIXEL_RATIO) next = Math.max(MIN_PIXEL_RATIO, pixelRatio - 0.1);
  else if (frameTimeAverage < 11 && pixelRatio < MAX_PIXEL_RATIO) next = Math.min(MAX_PIXEL_RATIO, pixelRatio + 0.1);
  if (next === pixelRatio) return;
  pixelRatio = next;
  lastResolutionChange = now;
  renderer.setPixelRatio(pixelRatio);
  setRendererSize(gameMount);
}

type VisualDrone = { group: THREE.Group };
type HouseHandle = ReturnType<typeof createHouse>;

const FLOOR_NAMES = ['Ground', 'First', 'Second', 'Third', 'Fourth'];
type FloorBand = { key: string; min: number; max: number; rooms: typeof ROOMS };

function floorBands(): FloorBand[] {
  const bands = new Map<string, FloorBand>();
  for (const roomArea of ROOMS) {
    const key = `${roomArea.min.y.toFixed(2)}:${roomArea.max.y.toFixed(2)}`;
    const existing = bands.get(key);
    if (existing) existing.rooms.push(roomArea);
    else bands.set(key, { key, min: roomArea.min.y, max: roomArea.max.y, rooms: [roomArea] });
  }
  return [...bands.values()].sort((a, b) => a.min - b.min);
}
const FLOOR_BANDS = floorBands();

function floorFor(y: number): { band: FloorBand | undefined; label: string } {
  const bands = FLOOR_BANDS;
  let index = bands.findIndex((band) => y >= band.min - .25 && y <= band.max + .25);
  if (index < 0 && bands.length) {
    index = bands.reduce((best, band, candidate) => {
      const distance = Math.abs(y - (band.min + band.max) / 2);
      const bestBand = bands[best];
      return distance < Math.abs(y - (bestBand.min + bestBand.max) / 2) ? candidate : best;
    }, 0);
  }
  return { band: bands[index], label: FLOOR_NAMES[index] ?? `Floor ${index + 1}` };
}

let activeScene: THREE.Scene | undefined;
let activeCamera: THREE.PerspectiveCamera | undefined;
let houseLoadFailed = false;
let inGame = false;
let animationFrame = 0;
let previousFrame = performance.now();
let fpsFrames = 0;
let fpsStarted = performance.now();
let currentFps = 0;
let lastHudAt = 0;

function setRendererSize(mount: HTMLElement): void {
  if (!activeCamera) return;
  const width = Math.max(1, mount.clientWidth);
  const height = Math.max(1, mount.clientHeight);
  renderer.setSize(width, height, false);
  activeCamera.aspect = width / height;
  activeCamera.updateProjectionMatrix();
}

const formatMb = (bytes: number) => `${Math.round(bytes / 1048576)} MB`;

/** The lobby is plain HTML: the house only downloads in the background, nothing renders. */
function renderLoadProgress(progress: HouseLoadProgress): void {
  if (houseLoadFailed) return;
  const fraction = progress.stage === 'ready' ? 1 : progress.total > 0 ? Math.min(1, progress.loaded / progress.total) : 0;
  const percent = progress.stage === 'download' ? Math.round(fraction * 92) : progress.stage === 'prepare' ? 96 : 100;
  const indeterminate = progress.stage === 'download' && progress.total === 0;
  for (const bar of [loadBar, houseLoadingBar]) {
    bar.style.setProperty('--progress', `${percent}%`);
    bar.parentElement!.classList.toggle('indeterminate', indeterminate);
  }
  loadPercent.textContent = indeterminate ? formatMb(progress.loaded) : `${percent}%`;
  loadCard.classList.toggle('ready', progress.stage === 'ready');
  if (progress.stage === 'download') {
    loadTitle.textContent = 'Unpacking the house';
    loadDetail.textContent = progress.total
      ? `Downloading every room · ${formatMb(progress.loaded)} of ${formatMb(progress.total)}`
      : `Downloading every room · ${formatMb(progress.loaded)}`;
  } else if (progress.stage === 'prepare') {
    loadTitle.textContent = 'Arranging the furniture';
    loadDetail.textContent = 'Preparing rooms, doors and cupboards…';
  } else {
    loadTitle.textContent = 'House ready';
    loadDetail.textContent = 'Every room is open. Take off whenever you like.';
  }
  houseLoadingTitle.textContent = loadTitle.textContent;
  houseLoadingDetail.textContent = loadDetail.textContent;
}

function startHousePreload(): void {
  houseLoadFailed = false;
  loadCard.classList.remove('error');
  onHouseLoadProgress(renderLoadProgress);
  preloadHouse(renderer).catch((error: unknown) => {
    houseLoadFailed = true;
    loadCard.classList.add('error');
    loadTitle.textContent = houseLoadingTitle.textContent = 'The front door is stuck';
    loadDetail.textContent = houseLoadingDetail.textContent = `Reload to try again (${error instanceof Error ? error.message : 'unknown error'}).`;
  });
}

/** Exploded axonometric of the floors, drawn once from the room list. */
function drawPlanStack(): void {
  const width = HOUSE_BOUNDS.max.x - HOUSE_BOUNDS.min.x;
  const depth = HOUSE_BOUNDS.max.z - HOUSE_BOUNDS.min.z;
  const svg = 'http://www.w3.org/2000/svg';
  const droneColors = ['#f27654', '#58bdb0', '#b096e7'];
  FLOOR_BANDS.slice(0, 3).forEach((band, index) => {
    const floor = document.createElement('div');
    floor.className = 'plan-floor';
    floor.style.setProperty('--lift', `${(1 - index) * 11}vh`);
    floor.style.setProperty('--delay', `${index * 120}ms`);
    const plan = document.createElementNS(svg, 'svg');
    plan.setAttribute('viewBox', `-0.5 -0.5 ${width + 1} ${depth + 1}`);
    const slab = document.createElementNS(svg, 'rect');
    slab.setAttribute('class', 'slab');
    slab.setAttribute('width', String(width));
    slab.setAttribute('height', String(depth));
    slab.setAttribute('rx', '.3');
    plan.append(slab);
    const centers: [number, number][] = [];
    for (const area of band.rooms) {
      const rect = document.createElementNS(svg, 'rect');
      const x = area.min.x - HOUSE_BOUNDS.min.x, y = HOUSE_BOUNDS.max.z - area.max.z;
      const w = area.max.x - area.min.x, h = area.max.z - area.min.z;
      rect.setAttribute('class', 'room');
      rect.setAttribute('x', String(x));
      rect.setAttribute('y', String(y));
      rect.setAttribute('width', String(w));
      rect.setAttribute('height', String(h));
      rect.setAttribute('fill', `${area.color}aa`);
      plan.append(rect);
      centers.push([x + w / 2, y + h / 2]);
    }
    if (centers.length > 1) {
      // One drone wanders between room centres on each floor (SMIL: no script per frame).
      const route = [...centers, centers[0]].map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');
      const drone = document.createElementNS(svg, 'circle');
      drone.setAttribute('r', '.42');
      drone.setAttribute('fill', droneColors[index % droneColors.length]);
      drone.setAttribute('stroke', '#fff');
      drone.setAttribute('stroke-width', '.12');
      const motion = document.createElementNS(svg, 'animateMotion');
      motion.setAttribute('dur', `${14 + index * 5}s`);
      motion.setAttribute('repeatCount', 'indefinite');
      motion.setAttribute('path', route);
      drone.append(motion);
      plan.append(drone);
    }
    floor.append(plan);
    planStack.append(floor);
  });
  const label = document.createElement('span');
  label.className = 'plan-label';
  label.textContent = 'OUDE TERELSTSTRAAT · 3 FLOORS';
  planStack.append(label);
}

function selectedMode(): GameMode {
  return (modePicker.querySelector<HTMLInputElement>('input[name=mode]:checked')?.value === 'free') ? 'free' : 'hideSeek';
}

/** Invite links lead with the room; otherwise the mode picker and "Create room" lead. */
function refreshLobbyForm(): void {
  const invited = queryRoom && roomNameInput.value.trim() === queryRoom;
  inviteBanner.hidden = !invited;
  inviteCode.textContent = queryRoom;
  modePicker.hidden = Boolean(invited);
  roomNameField.hidden = Boolean(invited);
  createButton.hidden = !invited;
  joinLabel.textContent = invited ? 'Join room' : sanitizeRoomName(roomNameInput.value) ? 'Join or create room' : selectedMode() === 'hideSeek' ? 'Create hide & seek room' : 'Create free play room';
}

let room: Room | undefined;
let roomId = queryRoom;
let lastName = '';
let connectionEpoch = 0;
let deliberateLeave = false;
let gameScene: THREE.Scene | undefined;
let gameCamera: THREE.PerspectiveCamera | undefined;
let gameHouse: HouseHandle | undefined;
let displayedDoors: DoorState[] = [];
let doorSnapshotAt = 0;
let previousDoors: DoorState[] = [];
let displayedDoorTime = 0;
let previousDoorTime = 0;
let lastInteractedDoor = -1;
const doorPrompt = document.createElement('div');
doorPrompt.className = 'door-prompt';
doorPrompt.hidden = true;
game.append(doorPrompt);

let gameHouseDispose: (() => void) | undefined;
let gameHouseReady = false;
let lastRound = -1;
let lastFound: string[] = [];
let lastPhase = '';
let latestSnapshot: Snapshot | undefined;
let lastSnapshotAt = 0;
let connectedAt = 0;
let predicted: DroneState | undefined;
const predictor = new DronePredictor();
const snapshotBuffer = new SnapshotBuffer();
let movementAccumulator = 0;
let lookYaw = 0;
let lookPitch = 0;
const MOUSE_SENSITIVITY = .0022;
const cameraAnchor = new THREE.Vector3();
const cameraDesired = new THREE.Vector3();
const cameraTarget = new THREE.Vector3();
const cameraSweepCache = {
  valid: false,
  positionX: 0,
  positionY: 0,
  positionZ: 0,
  yaw: 0,
  pitch: 0,
};
const captureMouse = byId<HTMLButtonElement>('captureMouse');
const outbox: Controls[] = [];
let visuals = new Map<string, VisualDrone>();
let paintBatch: PaintBatch | undefined;
let projectileBatch: ProjectileBatch | undefined;
let inkEffects: InkEffects | undefined;
let seq = 0;
let currentControls: Controls = { ...NEUTRAL_CONTROLS };
let fireQueued = false;
let pointerFire = false;
let nextInkFeedbackAt = 0;
let inkFirePulseUntil = 0;
let inkHitPulseUntil = 0;
let resetQueued = false;
let resetHoldUntil = 0;
let lastPingSent = 0;
let latestPing = 0;
let noticeMode: 'none' | 'crash' | 'offline' = 'none';
let stale = false;
let toastTimer = 0;
const pressed = new Set<string>();

function serverEndpoint(): string {
  const configured = (import.meta.env.VITE_SERVER_URL as string | undefined)?.trim();
  const source = configured || location.origin;
  return source.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
}

function showToast(message: string): void {
  toast.textContent = message;
  toast.classList.add('visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('visible'), 1800);
}

function setConnection(label: string, state: 'connecting' | 'live' | 'offline'): void {
  connectionText.textContent = label;
  connectionDot.className = state === 'live' ? 'live' : state === 'offline' ? 'offline' : '';
}

function showNotice(mode: 'none' | 'crash' | 'offline', detail = ''): void {
  if (noticeMode === 'offline' && mode === 'crash') return;
  noticeMode = mode;
  if (mode === 'none') {
    notice.hidden = true;
    return;
  }
  notice.hidden = false;
  if (mode === 'offline') {
    noticeEyebrow.textContent = 'CONNECTION LOST';
    noticeTitle.textContent = 'The house went quiet.';
    noticeBody.textContent = detail || 'Your drone is paused until we can hear the room again.';
    noticeActions.hidden = false;
  } else {
    noticeEyebrow.textContent = 'FRESH START';
    noticeTitle.textContent = 'Moving to a new launch spot.';
    noticeBody.textContent = 'The clubhouse crew is placing you somewhere clear.';
    noticeActions.hidden = true;
  }
}

function inputAllowed(): boolean {
  const target = document.activeElement;
  return inGame && gameHouseReady && !document.hidden && document.hasFocus() && !stale
    && !(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement);
}

function localFrozen(): boolean {
  return isFrozen(latestSnapshot?.game, room?.sessionId ?? '');
}

function rebuildControls(): Controls {
  const enabled = inputAllowed() && !localFrozen();
  const down = (key: string) => enabled && pressed.has(key);
  return {
    seq,
    lookYaw,
    lookPitch,
    yaw: 0,
    pitch: 0,
    forward: (down('KeyW') ? 1 : 0) - (down('KeyS') ? 1 : 0),
    strafe: (down('KeyD') ? 1 : 0) - (down('KeyA') ? 1 : 0),
    lift: (down('Space') ? 1 : 0) - (down('ControlLeft') || down('ControlRight') || down('KeyC') ? 1 : 0),
    precision: down('ShiftLeft') || down('ShiftRight'),
    fire: enabled && (fireQueued || pointerFire || down('KeyF')),
    reset: enabled && (resetQueued || performance.now() < resetHoldUntil),
  };
}

function clearControls(): void {
  const wasActive = pressed.size > 0 || fireQueued || pointerFire || resetQueued || performance.now() < resetHoldUntil
    || currentControls.yaw !== 0 || currentControls.pitch !== 0 || currentControls.forward !== 0 || currentControls.strafe !== 0 || currentControls.lift !== 0 || currentControls.fire || currentControls.reset;
  pressed.clear();
  fireQueued = false;
  pointerFire = false;
  resetQueued = false;
  resetHoldUntil = 0;
  outbox.length = 0;
  currentControls = { ...NEUTRAL_CONTROLS, seq, lookYaw, lookPitch };
  // RAF can stop immediately when a tab is hidden. Release on the wire now so
  // the authoritative drone does not keep the previous movement for its timeout.
  if (wasActive && room && inGame && !stale) {
    currentControls.seq = ++seq;
    try {
      room.send('input', currentControls);
    } catch {
      // The room's leave/error callback owns the disconnected UI.
    }
  }
}

const flightCodes = new Set(['KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyQ', 'KeyE', 'KeyG', 'KeyC', 'ControlLeft', 'ControlRight', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight', 'KeyF', 'KeyR']);
window.addEventListener('keydown', (event) => {
  if (event.code === 'Escape') {
    clearControls();
    if (document.pointerLockElement) document.exitPointerLock();
    (document.activeElement as HTMLElement | null)?.blur?.();
    return;
  }
  // The mouse is locked while flying, so the round button is also reachable from the keyboard.
  if ((event.code === 'Enter' || event.code === 'NumpadEnter') && !event.repeat && inGame && inputAllowed() && !roundAction.hidden && !roundAction.disabled) {
    event.preventDefault();
    roundActionHandler?.();
    return;
  }
  if (event.code === 'KeyH' && !event.repeat && inGame && inputAllowed()) {
    toggleHidden();
    return;
  }
  if (!inGame || !inputAllowed() || !flightCodes.has(event.code)) return;
  event.preventDefault();
  pressed.add(event.code);
  if (event.code === 'KeyG' && !event.repeat && room && predicted?.respawnAt === 0 && !localFrozen()) {
    room.send('toggleDoor', { yaw: lookYaw, pitch: lookPitch, viewTime: displayedDoorTime });
  }
  if (event.code === 'KeyF' && !event.repeat) fireQueued = true;
  if (event.code === 'KeyF') inkAudio.unlock();
  if (event.code === 'KeyR' && !event.repeat && !canRespawn(latestSnapshot?.game, room?.sessionId ?? '')) {
    showToast('No quick respawn while the seeker is looking. Fly out of trouble!');
  } else if (event.code === 'KeyR' && !event.repeat) {
    resetQueued = true;
    // Keep the one-shot live across several server ticks. A quick neutral input
    // must not overwrite reset before the authoritative simulation consumes it.
    resetHoldUntil = performance.now() + 120;
  }
});
window.addEventListener('keyup', (event) => pressed.delete(event.code));
function releaseFlightInput(): void {
  clearControls();
  if (document.pointerLockElement) document.exitPointerLock();
}
window.addEventListener('blur', releaseFlightInput);
document.addEventListener('visibilitychange', () => { if (document.hidden) releaseFlightInput(); });
function requestMouseControl(): void {
  if (!inGame || stale || document.pointerLockElement === renderer.domElement) return;
  // Pointer lock must begin in the trusted click handler; acquisition never fires paint.
  try {
    const request = renderer.domElement.requestPointerLock();
    if (request) void request.catch(() => showToast('Mouse capture unavailable. Arrow keys still steer. Aim at a door or cupboard handle and press G.'));
  } catch {
    showToast('Mouse capture unavailable. Arrow keys still steer. Aim at a door or cupboard handle and press G.');
  }
}
captureMouse.addEventListener('click', requestMouseControl);
gameMount.addEventListener('pointerdown', event => {
  if (event.button !== 0 || !inputAllowed()) return;
  inkAudio.unlock();
  if (document.pointerLockElement !== renderer.domElement) {
    requestMouseControl();
    return;
  }
  pointerFire = true;
  fireQueued = true;
});
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === renderer.domElement;
  captureMouse.hidden = locked;
  if (!locked) clearControls();
});
document.addEventListener('mousemove', event => {
  if (document.pointerLockElement !== renderer.domElement || !inputAllowed()) return;
  lookYaw -= event.movementX * MOUSE_SENSITIVITY;
  lookYaw = Math.atan2(Math.sin(lookYaw), Math.cos(lookYaw));
  lookPitch = THREE.MathUtils.clamp(lookPitch - event.movementY * MOUSE_SENSITIVITY, -Math.PI * .36, Math.PI * .36);
});
window.addEventListener('pointerup', event => { if (event.button === 0) pointerFire = false; });

function syncDroneTransform(group: THREE.Group, drone: DroneState): void {
  updateDroneVisual(group, drone, performance.now() / 1000);
}

function reconcileDrones(snapshot: Snapshot): void {
  if (!gameScene || !room) return;
  const found = new Set(snapshot.players.map(drone => drone.id));
  for (const drone of snapshot.players) {
    if (visuals.has(drone.id)) continue;
    const group = createDrone(drone.color);
    gameScene.add(group);
    visuals.set(drone.id, { group });
    syncDroneTransform(group, drone);
  }
  for (const [id, visual] of visuals) {
    if (found.has(id)) continue;
    disposeDrone(visual.group);
    visuals.delete(id);
  }
  const authoritative = snapshot.players.find(drone => drone.id === room?.sessionId);
  if (authoritative) {
    if (!predicted || predicted.respawnAt !== authoritative.respawnAt) {
      lookYaw = authoritative.yaw;
      lookPitch = authoritative.pitch;
      movementAccumulator = 0;
    }
    // Prediction sweeps the house mesh, which may still be downloading.
    if (houseCollisionInstalled()) predictor.reconcile(authoritative);
  }
}

function reconcilePaints(paints: PaintMark[]): void {
  // Clipping needs the house mesh; snapshots repeat the full list once it has loaded.
  if (houseCollisionInstalled() && paintSurfacesInstalled()) paintBatch?.reconcile(paints);
  const localColor = latestSnapshot?.players.find(player => player.id === room?.sessionId)?.color;
  const paintStates = displayedDoors.length ? displayedDoors : (latestSnapshot?.doors ?? []);
  if (inkEffects?.reconcile(paints, localColor, paintStates)) {
    inkHitPulseUntil = performance.now() + 180;
    inkAudio.splat();
  }
}

function reconcileProjectiles(projectiles: ProjectileState[]): void {
  projectileBatch?.reconcile(projectiles);
}

function updateRoster(players: DroneState[], status: GameStatus | undefined): void {
  pilotCount.textContent = `${players.length} / ${MAX_PILOTS}`;
  const hideSeek = status?.mode === 'hideSeek';
  rosterElement.replaceChildren(...players.map((drone) => {
    const row = document.createElement('div');
    row.className = 'pilot-row';
    const dot = document.createElement('i');
    dot.style.background = drone.color;
    const label = document.createElement('span');
    label.textContent = drone.id === room?.sessionId ? `${drone.name} (you)` : drone.name;
    const score = document.createElement('small');
    score.textContent = hideSeek ? '' : `${drone.tags} TAG${drone.tags === 1 ? '' : 'S'}`;
    const badge = document.createElement('b');
    const role = roleOf(status, drone.id);
    if (hideSeek && status) {
      if (role === 'seeker') { badge.textContent = 'SEEKER'; badge.className = 'seeker'; }
      else if (role === 'found') { badge.textContent = 'FOUND'; badge.className = 'found'; }
      else if (role === 'hider') {
        const ready = status.phase === 'hiding' && status.hidden.includes(drone.id);
        badge.textContent = status.phase === 'hiding' ? (ready ? 'HIDDEN' : 'HIDING') : status.phase === 'ended' ? 'SAFE' : 'HIDDEN';
        if (ready || status.phase !== 'hiding') badge.className = 'hidden-ok';
      } else if (role === 'spectator') badge.textContent = 'WATCHING';
      else if (!status.loaded.includes(drone.id)) badge.textContent = 'LOADING';
    }
    row.append(dot, label, score);
    if (badge.textContent) row.append(badge);
    return row;
  }));
}

function handleSnapshot(update: SnapshotUpdate): void {
  if (!update || !Array.isArray(update.players) || !Number.isFinite(update.time)) return;
  const snapshot = applySnapshotUpdate(latestSnapshot, update);
  cameraSweepCache.valid = false;
  previousDoorTime = displayedDoors.length ? displayedDoorTime : snapshot.time;
  previousDoors = displayedDoors.map(door => ({ ...door }));
  doorSnapshotAt = performance.now();
  predictor.doors = snapshot.doors ?? [];
  latestSnapshot = snapshot;
  snapshotBuffer.push(snapshot, performance.now() / 1000);
  lastSnapshotAt = performance.now();
  stale = false;
  setConnection('Connected', 'live');
  if (noticeMode === 'offline') showNotice('none');
  reconcileDrones(snapshot);
  reconcilePaints(snapshot.paints);
  reconcileProjectiles(snapshot.projectiles);
  updateRoster(snapshot.players, snapshot.game);
  announceRoundEvents(snapshot);
}

function handlePong(payload: unknown): void {
  const sentAt = typeof payload === 'number'
    ? payload
    : typeof payload === 'object' && payload !== null && typeof (payload as { sentAt?: unknown }).sentAt === 'number'
      ? (payload as { sentAt: number }).sentAt
      : 0;
  if (sentAt > 0) latestPing = Math.max(0, Math.round(Date.now() - sentAt));
}

async function connect(joinId: string, createNew: boolean, mode: GameMode = 'hideSeek', roomName = ''): Promise<void> {
  const epoch = ++connectionEpoch;
  const previousRoom = room;
  room = undefined;
  if (previousRoom) void previousRoom.leave().catch(() => undefined);
  if (inGame) {
    cleanupGame();
    setupGameScene();
    setRendererSize(gameMount);
  }
  deliberateLeave = false;
  if (document.pointerLockElement) document.exitPointerLock();
  clearControls();
  joinButton.disabled = true;
  createButton.disabled = true;
  joinHint.classList.remove('error');
  joinHint.textContent = createNew ? 'Preparing your private clubhouse…' : `Joining room ${joinId}…`;
  setConnection('Connecting', 'connecting');
  const name = nameInput.value.trim().slice(0, 18) || 'Pocket Pilot';
  nameInput.value = name;
  lastName = name;
  localStorage.setItem('little-rotors-name', name);

  try {
    const client = new Client(serverEndpoint());
    let joined: Room;
    if (!createNew) joined = await client.joinById(joinId, { name });
    else if (!roomName) joined = await client.create('house', { name, mode });
    else {
      // A room name is the whole address: join it if it exists, otherwise open it under that name.
      try {
        joined = await client.joinById(roomName, { name });
      } catch (error) {
        if (!(error instanceof Error) || !error.message.includes('not found')) throw error;
        joined = await client.create('house', { name, mode, roomName });
      }
    }
    if (epoch !== connectionEpoch) {
      void joined.leave();
      return;
    }
    room = joined;
    roomId = joined.roomId;
    connectedAt = performance.now();
    lastSnapshotAt = 0;
    latestSnapshot = undefined;
    predicted = undefined;
    predictor.reset();
    snapshotBuffer.clear();
    movementAccumulator = 0;
    outbox.length = 0;
    stale = false;
    seq = 0;
    joined.onMessage('snapshot', handleSnapshot);
    joined.onMessage('pong', handlePong);
    lastInteractedDoor = -1;
    joined.onMessage('doorInteraction', (index: unknown) => {
      if (epoch === connectionEpoch && typeof index === 'number' && Number.isInteger(index) && DOORS[index]) {
        lastInteractedDoor = index;
      }
    });
    joined.onError((code, message) => {
      if (epoch !== connectionEpoch) return;
      enterOffline(`Room error ${code}: ${message || 'connection interrupted'}`);
    });
    joined.onLeave((code) => {
      if (epoch !== connectionEpoch || deliberateLeave) return;
      enterOffline(code ? `The room closed the connection (${code}).` : 'The room closed the connection.');
    });
    joined.send('ready');
    lastRound = -1;
    lastFound = [];
    lastPhase = '';
    startGame();
    if (gameHouseReady) joined.send('houseLoaded');
    roomBadge.textContent = joined.roomId;
    const url = new URL(location.href);
    url.searchParams.set('room', joined.roomId);
    history.replaceState(null, '', url);
    setConnection('Syncing', 'connecting');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not reach that room.';
    joinHint.textContent = message.includes('already taken') || message.includes('at least')
      ? message
      : message.includes('seat') || message.includes('full')
        ? `That room is full (${MAX_PILOTS} pilots).`
        : message.includes('not found')
          ? `No room called "${joinId}" exists right now.`
          : `Could not join: ${message}`;
    joinHint.classList.add('error');
    if (inGame) enterOffline(message);
  } finally {
    joinButton.disabled = false;
    createButton.disabled = false;
  }
}

function enterOffline(detail: string): void {
  stale = true;
  proximityTracker.reset();
  renderProximity({ status: 'paused', warmth: null, trend: 'steady' });
  if (document.pointerLockElement) document.exitPointerLock();
  clearControls();
  setConnection('Disconnected', 'offline');
  showNotice('offline', detail);
}

function setupGameScene(): void {
  cameraSweepCache.valid = false;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, 1, 0.06, 90);
  camera.position.set(0, 5, -8);
  const house = createHouse(scene, renderer) as HouseHandle;
  gameHouse = house;
  gameHouseDispose = house.dispose;
  gameHouseReady = false;
  houseLoading.hidden = false;
  house.ready?.then(async () => {
    if (gameScene !== scene) return;
    // Compile every material's shader up front; otherwise the first look at a
    // new room stalls a frame while its programs compile.
    await renderer.compileAsync(scene, camera).catch(() => undefined);
    if (gameScene !== scene) return;
    // Upload every texture now as well. Three uploads lazily on first use,
    // which stalls frames whenever a new room comes into view.
    const uploaded = new Set<THREE.Texture>();
    scene.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        for (const value of Object.values(material)) {
          if (value instanceof THREE.Texture && !uploaded.has(value)) {
            uploaded.add(value);
            renderer.initTexture(value);
          }
        }
      }
    });
    gameHouseReady = true;
    houseLoading.hidden = true;
    try { room?.send('houseLoaded'); } catch { /* the leave handler owns this */ }
  }).catch((error: unknown) => enterOffline(`The house could not be loaded: ${error instanceof Error ? error.message : 'unknown error'}`));
  gameScene = scene;
  gameCamera = camera;
  paintBatch = new PaintBatch(scene);
  projectileBatch = new ProjectileBatch(scene);
  inkEffects = new InkEffects(scene);
  activeScene = scene;
  activeCamera = camera;
}

function startGame(): void {
  if (!inGame) {
    renderer.domElement.setAttribute('aria-label', 'Little Rotors flight view');
    gameMount.append(renderer.domElement);
    setupGameScene();
    lobby.hidden = true;
    game.hidden = false;
    inGame = true;
  }
  showNotice('none');
  setRendererSize(gameMount);
}

function cleanupGame(): void {
  cameraSweepCache.valid = false;
  for (const visual of visuals.values()) disposeDrone(visual.group);
  visuals.clear();
  paintBatch?.dispose();
  paintBatch = undefined;
  projectileBatch?.dispose();
  projectileBatch = undefined;
  inkEffects?.dispose();
  inkEffects = undefined;
  gameHouseDispose?.();
  gameHouseDispose = undefined;
  gameHouse = undefined;
  displayedDoors = previousDoors = [];
  displayedDoorTime = previousDoorTime = 0;
  lastInteractedDoor = -1;
  doorPrompt.hidden = true;
  gameScene = undefined;
  gameCamera = undefined;
  latestSnapshot = undefined;
  predicted = undefined;
  predictor.reset();
  snapshotBuffer.clear();
  movementAccumulator = 0;
  nextInkFeedbackAt = 0;
  inkFirePulseUntil = inkHitPulseUntil = 0;
  crosshair.classList.remove('ink-firing', 'ink-hit');
  inkMuzzleFlash.classList.remove('active');
  outbox.length = 0;
  proximityTracker.reset();
  renderProximity({ status: 'waiting', warmth: null, trend: 'steady' });
  gameHouseReady = false;
  seekerBlind.hidden = true;
  roundCard.hidden = true;
  delete game.dataset.mode;
}

async function returnToLobby(): Promise<void> {
  deliberateLeave = true;
  if (document.pointerLockElement) document.exitPointerLock();
  connectionEpoch += 1;
  const leaving = room;
  room = undefined;
  if (leaving) await leaving.leave().catch(() => undefined);
  clearControls();
  cleanupGame();
  inGame = false;
  game.hidden = true;
  lobby.hidden = false;
  renderer.domElement.remove();
  activeScene = undefined;
  activeCamera = undefined;
  const url = new URL(location.href);
  url.searchParams.delete('room');
  history.replaceState(null, '', url.pathname + url.search + url.hash);
  roomNameInput.value = '';
  joinHint.textContent = '';
  joinHint.classList.remove('error');
  refreshLobbyForm();
}

function updateDroneVisuals(now: number, dt: number): DroneState | undefined {
  if (!room) return undefined;
  if (!stale && latestSnapshot) {
    movementAccumulator += dt;
    // Floating-point remainders must not drop a tick at rates such as 24 FPS.
    while (movementAccumulator + 1e-12 >= FIXED_STEP) {
      const enabled = inputAllowed();
      const key = (code: string) => enabled && pressed.has(code);
      // Keyboard steering remains available when pointer lock is unavailable.
      // The blindfolded seeker cannot turn either; the server ignores it anyway.
      if (localFrozen()) {
        currentControls = { ...rebuildControls(), seq: ++seq };
        predictor.advance(currentControls);
        outbox.push(currentControls);
        fireQueued = false;
        resetQueued = false;
        movementAccumulator = Math.max(0, movementAccumulator - FIXED_STEP);
        continue;
      }
      lookYaw -= ((key('KeyE') || key('ArrowRight') ? 1 : 0) - (key('KeyQ') || key('ArrowLeft') ? 1 : 0)) * 1.8 * FIXED_STEP;
      lookPitch = THREE.MathUtils.clamp(lookPitch + ((key('ArrowUp') ? 1 : 0) - (key('ArrowDown') ? 1 : 0)) * 1.2 * FIXED_STEP, -Math.PI * .36, Math.PI * .36);
      currentControls = { ...rebuildControls(), seq: ++seq };
      const feedbackNow = now / 1000;
      if (currentControls.fire && feedbackNow + 1e-9 >= nextInkFeedbackAt) {
        nextInkFeedbackAt = feedbackNow + INK_FIRE_INTERVAL;
        inkFirePulseUntil = now + 88;
        inkAudio.shot();
      } else if (!currentControls.fire) {
        nextInkFeedbackAt = feedbackNow;
      }
      predictor.advance(currentControls);
      outbox.push(currentControls);
      fireQueued = false;
      resetQueued = false;
      movementAccumulator = Math.max(0, movementAccumulator - FIXED_STEP);
    }
    predicted = predictor.sample(movementAccumulator / FIXED_STEP, dt);
    if (predicted) {
      // Mouse look is immediate and never dragged back by network corrections.
      predicted.yaw = lookYaw;
      predicted.pitch = lookPitch;
    }
  }
  for (const state of snapshotBuffer.sample(now / 1000)) {
    const visual = visuals.get(state.id);
    if (visual) syncDroneTransform(visual.group, state.id === room.sessionId && predicted ? predicted : state);
  }
  return predicted;
}

function updateCameraPosition(drone: DroneState): void {
  const { x, y, z } = drone.position;
  if (!cameraSweepCache.valid
    || cameraSweepCache.positionX !== x
    || cameraSweepCache.positionY !== y
    || cameraSweepCache.positionZ !== z
    || cameraSweepCache.yaw !== drone.yaw
    || cameraSweepCache.pitch !== drone.pitch) {
    const pose = chaseCameraPose(drone, displayedDoors);
    cameraDesired.set(pose.position.x, pose.position.y, pose.position.z);
    cameraTarget.set(pose.target.x, pose.target.y, pose.target.z);
    cameraSweepCache.valid = true;
    cameraSweepCache.positionX = x;
    cameraSweepCache.positionY = y;
    cameraSweepCache.positionZ = z;
    cameraSweepCache.yaw = drone.yaw;
    cameraSweepCache.pitch = drone.pitch;
  }
}

function updateCamera(drone: DroneState): void {
  if (!gameCamera) return;
  cameraAnchor.set(drone.position.x, drone.position.y + .035, drone.position.z);
  updateCameraPosition(drone);
  gameCamera.position.copy(cameraDesired);
  gameCamera.lookAt(cameraTarget);
  gameCamera.updateMatrixWorld();
  const localVisual = room ? visuals.get(room.sessionId) : undefined;
  if (localVisual) localVisual.group.visible = drone.respawnAt <= 0
    && gameCamera.position.distanceToSquared(cameraAnchor) > .055;
  // Shooting resolves this shared camera's center ray, including its collision offset.
  crosshair.style.left = '50%';
  crosshair.style.top = '50%';
  crosshair.hidden = false;
}

function updateStatus(drone: DroneState | undefined, now: number): void {
  if (!drone || !latestSnapshot) {
    renderProximity({ status: stale ? 'paused' : 'waiting', warmth: null, trend: 'steady' });
    return;
  }
  speedValue.textContent = drone.speed.toFixed(1);
  byId('flightMode').textContent = currentControls.precision ? 'PRECISION' : drone.speed < .03 ? 'HOVER' : 'MOVING';
  altitudeValue.textContent = Math.max(0, drone.position.y).toFixed(1);
  locationName.textContent = `${floorFor(drone.position.y).label} · ${getRoomName(drone.position)}`;
  const serverNow = latestSnapshot.time + (now - lastSnapshotAt) / 1000;
  paintWash.classList.toggle('active', drone.paintedUntil > serverNow);
  paintWash.style.setProperty('--paint', drone.paintColor || '#f27654');
  if (!stale && drone.respawnAt > serverNow) showNotice('crash');
  else if (noticeMode === 'crash') showNotice('none');
  const authoritativeLocal = latestSnapshot.players.find(player => player.id === room?.sessionId);
  const status = latestSnapshot.game;
  const selfId = room?.sessionId ?? '';
  renderRound(status, latestSnapshot.players, serverNow);
  const radar = radarFor(status, selfId);
  proximityMeter.hidden = radar === null;
  if (!radar) {
    proximityTracker.reset();
    return;
  }
  proximityDetail.dataset.label = radar.label;
  renderProximity(proximityTracker.update(
    latestSnapshot.players,
    selfId,
    authoritativeLocal?.position ?? drone.position,
    serverNow,
    !stale,
    radar.eligible,
  ));
}

/** Free play tracks the nearest pilot. In a round the seeker tracks hiders still in play,
 * and hiders feel the seeker coming; found pilots are off the radar entirely. */
function radarFor(status: GameStatus | undefined, selfId: string): { label: string; eligible?: (player: DroneState) => boolean } | null {
  const role = roleOf(status, selfId);
  if (role === 'free') return { label: 'NEAREST PILOT' };
  if (!status || status.phase !== 'seeking') return null;
  if (role === 'seeker') {
    const remaining = new Set(remainingHiders(status));
    return { label: 'NEAREST HIDDEN PILOT', eligible: player => remaining.has(player.id) };
  }
  if (role === 'hider') return { label: 'THE SEEKER', eligible: player => player.id === status.seekerId };
  return null;
}

let roundActionHandler: (() => void) | undefined;

function setRoundAction(label: string | null, handler?: () => void, options: { disabled?: boolean; variant?: 'ghost' | 'done' } = {}): void {
  roundAction.hidden = label === null;
  roundActionHandler = handler;
  if (label === null) return;
  roundAction.textContent = `${label} · ↵`;
  roundAction.disabled = Boolean(options.disabled);
  roundAction.classList.toggle('ghost', options.variant === 'ghost');
  roundAction.classList.toggle('done', options.variant === 'done');
}

function toggleHidden(): void {
  const status = latestSnapshot?.game;
  const selfId = room?.sessionId ?? '';
  if (!room || !status || status.phase !== 'hiding' || roleOf(status, selfId) !== 'hider') return;
  room.send('hidden', { hidden: !status.hidden.includes(selfId) });
}

const clock = (seconds: number) => {
  const whole = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};

function renderRound(status: GameStatus | undefined, players: DroneState[], serverNow: number): void {
  const selfId = room?.sessionId ?? '';
  const role = roleOf(status, selfId);
  game.dataset.mode = status?.mode ?? 'free';
  if (!status || status.mode !== 'hideSeek') {
    roundCard.hidden = true;
    seekerBlind.hidden = true;
    return;
  }
  roundCard.hidden = false;
  roundCard.dataset.role = role;
  const nameOf = (id: string) => players.find(player => player.id === id)?.name ?? 'A pilot';
  const remaining = remainingHiders(status).length;
  seekerBlind.hidden = !(role === 'seeker' && status.phase === 'hiding');
  if (!seekerBlind.hidden) {
    const hiders = status.hiders.map(id => players.find(player => player.id === id)).filter(Boolean) as DroneState[];
    blindBody.textContent = `${status.hidden.length} of ${status.hiders.length} hider${status.hiders.length === 1 ? '' : 's'} in place. Your screen clears once everyone is hidden.`;
    blindPilots.replaceChildren(...hiders.map(hider => {
      const chip = document.createElement('span');
      if (status.hidden.includes(hider.id)) chip.className = 'hidden-ok';
      const dot = document.createElement('i');
      dot.style.background = hider.color;
      chip.append(dot, hider.name);
      return chip;
    }));
    blindTimer.textContent = `SEEKING STARTS AUTOMATICALLY IN ${clock(status.hideDeadline - serverNow)}`;
  }

  if (status.phase === 'lobby' || status.phase === 'ended') {
    const notLoaded = players.filter(player => !status.loaded.includes(player.id));
    const enough = players.length >= MIN_HIDE_SEEK_PLAYERS;
    const again = status.phase === 'ended';
    roundTag.textContent = again ? `ROUND ${status.round} OVER` : 'HIDE & SEEK';
    if (again) {
      const seeker = status.seekerId === selfId ? 'You' : nameOf(status.seekerId);
      roundTitle.textContent = status.outcome === 'allFound' ? `${seeker} found everyone!`
        : status.outcome === 'gaveUp' ? 'The hiders win!' : 'Round stopped.';
    } else {
      roundTitle.textContent = enough ? 'Ready when you are' : 'Waiting for pilots';
    }
    roundDetail.textContent = !enough
      ? `Hide & seek needs at least ${MIN_HIDE_SEEK_PLAYERS} pilots. Copy the invite and send it to a friend.`
      : notLoaded.length
        ? `Waiting for ${notLoaded.map(player => player.name).join(', ')} to finish loading the house.`
        : 'A random pilot becomes the seeker. Everyone else gets time to hide.';
    setRoundAction(again ? 'Play again' : 'Start round', () => room?.send('startRound'), { disabled: !enough || notLoaded.length > 0 });
    return;
  }

  if (status.phase === 'hiding') {
    roundTag.textContent = `ROUND ${status.round} · HIDING`;
    const left = clock(status.hideDeadline - serverNow);
    if (role === 'seeker') {
      roundTitle.textContent = 'You are the seeker';
      roundDetail.textContent = `Eyes closed while the others hide · ${left}`;
      setRoundAction(null);
    } else if (role === 'hider') {
      const ready = status.hidden.includes(selfId);
      roundTitle.textContent = ready ? 'You’re hidden' : `Hide from ${nameOf(status.seekerId)}!`;
      roundDetail.textContent = ready
        ? `Waiting for ${status.hiders.length - status.hidden.length} more pilot${status.hiders.length - status.hidden.length === 1 ? '' : 's'} · ${left}`
        : `Find a good spot, then press H or the button · ${left}`;
      setRoundAction(ready ? 'Hidden ✓' : 'I’m hidden', toggleHidden, { variant: ready ? 'done' : undefined });
    } else {
      roundTitle.textContent = 'Round in progress';
      roundDetail.textContent = 'You joined mid-round. Fly around and watch; you’re in the next one.';
      setRoundAction(null);
    }
    return;
  }

  roundTag.textContent = `ROUND ${status.round} · SEEKING · ${clock(serverNow - status.phaseStartedAt)}`;
  if (role === 'seeker') {
    roundTitle.textContent = `Find them! ${status.found.length} of ${status.hiders.length} found`;
    roundDetail.textContent = 'Follow the radar and hit a pilot with paint to tag them.';
    setRoundAction('Give up', () => room?.send('giveUp'), { variant: 'ghost' });
  } else if (role === 'hider') {
    roundTitle.textContent = 'Stay hidden…';
    roundDetail.textContent = `${nameOf(status.seekerId)} is looking. ${remaining} pilot${remaining === 1 ? '' : 's'} still hidden.`;
    setRoundAction(null);
  } else if (role === 'found') {
    roundTitle.textContent = 'You were found!';
    roundDetail.textContent = `You’re out of this round: fly freely. ${remaining} still hidden.`;
    setRoundAction(null);
  } else {
    roundTitle.textContent = 'Round in progress';
    roundDetail.textContent = `${status.found.length} of ${status.hiders.length} found so far. You’re in the next round.`;
    setRoundAction(null);
  }
}

/** One-off toasts for round transitions and tags, driven by snapshot diffs. */
function announceRoundEvents(snapshot: Snapshot): void {
  const status = snapshot.game;
  if (!status || status.mode !== 'hideSeek') return;
  const selfId = room?.sessionId ?? '';
  const nameOf = (id: string) => id === selfId ? 'You' : snapshot.players.find(player => player.id === id)?.name ?? 'A pilot';
  const phaseKey = `${status.round}:${status.phase}`;
  if (lastPhase && phaseKey !== lastPhase) {
    if (status.phase === 'hiding') {
      showToast(status.seekerId === selfId ? 'You are the seeker. Eyes closed!' : `${nameOf(status.seekerId)} is the seeker. Go hide!`);
      if (status.seekerId === selfId && document.pointerLockElement) document.exitPointerLock();
    } else if (status.phase === 'seeking') {
      showToast(status.seekerId === selfId ? 'Everyone is hidden. Go find them!' : 'Seeking has started. Stay quiet…');
    } else if (status.phase === 'ended' && status.outcome === 'aborted') {
      showToast('The round stopped because a pilot left.');
    }
  }
  if (status.round !== lastRound) lastFound = [];
  for (const id of status.found) {
    if (!lastFound.includes(id) && lastPhase) {
      showToast(id === selfId ? 'Splat! You were found.' : `${nameOf(id)} was found!`);
    }
  }
  lastFound = [...status.found];
  lastRound = status.round;
  lastPhase = phaseKey;
}

function renderProximity(reading: ProximityReading): void {
  proximityMeter.dataset.status = reading.status;
  if (reading.status !== 'active') {
    proximityMeter.removeAttribute('aria-valuenow');
    const paused = reading.status === 'paused';
    proximityTrend.textContent = paused ? 'PAUSED' : 'WAITING';
    proximityDetail.textContent = paused ? 'SIGNAL UNAVAILABLE' : 'FOR ANOTHER PILOT';
    proximityMeter.setAttribute('aria-valuetext', paused ? 'Proximity paused' : 'Waiting for another pilot');
    proximityThumb.style.setProperty('--warmth', '50%');
    return;
  }
  const warmth = Math.round(reading.warmth);
  proximityMeter.setAttribute('aria-valuenow', String(warmth));
  proximityTrend.textContent = reading.trend === 'steady' ? 'STEADY' : reading.trend.toUpperCase();
  proximityDetail.textContent = proximityDetail.dataset.label ?? 'NEAREST PILOT';
  proximityMeter.setAttribute('aria-valuetext', `${warmth} percent warm, ${reading.trend}`);
  proximityThumb.style.setProperty('--warmth', `${warmth}%`);
}

function drawMinimap(players: DroneState[]): void {
  const context = minimap.getContext('2d');
  if (!context) return;
  const width = minimap.width;
  const height = minimap.height;
  context.clearRect(0, 0, width, height);
  const pad = 10;
  const scaleX = (width - pad * 2) / (HOUSE_BOUNDS.max.x - HOUSE_BOUNDS.min.x);
  const scaleZ = (height - pad * 2) / (HOUSE_BOUNDS.max.z - HOUSE_BOUNDS.min.z);
  const point = (x: number, z: number) => ({
    x: pad + (x - HOUSE_BOUNDS.min.x) * scaleX,
    y: height - pad - (z - HOUSE_BOUNDS.min.z) * scaleZ,
  });
  context.fillStyle = 'rgba(255,255,255,.22)';
  context.fillRect(pad, pad, width - pad * 2, height - pad * 2);
  const local = players.find((player) => player.id === room?.sessionId);
  const localFloor = local ? floorFor(local.position.y).band : undefined;
  const roomsOnLevel = localFloor?.rooms ?? ROOMS;
  for (const roomArea of roomsOnLevel.length ? roomsOnLevel : ROOMS) {
    const a = point(roomArea.min.x, roomArea.min.z);
    const b = point(roomArea.max.x, roomArea.max.z);
    context.fillStyle = `${roomArea.color}80`;
    context.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  }
  context.strokeStyle = 'rgba(37,35,31,.28)';
  context.lineWidth = 1;
  context.strokeRect(pad + .5, pad + .5, width - pad * 2 - 1, height - pad * 2 - 1);
  for (const player of players) {
    if (player.id !== room?.sessionId) continue;
    if (player.respawnAt > 0) continue;
    if (localFloor && floorFor(player.position.y).band?.key !== localFloor.key) continue;
    const at = point(player.position.x, player.position.z);
    context.save();
    context.translate(at.x, at.y);
    context.rotate(-player.yaw);
    context.beginPath();
    context.moveTo(0, -6);
    context.lineTo(4.5, 5);
    context.lineTo(0, 3);
    context.lineTo(-4.5, 5);
    context.closePath();
    context.fillStyle = player.color;
    context.shadowColor = 'rgba(0,0,0,.24)';
    context.shadowBlur = 3;
    context.fill();
    if (player.id === room?.sessionId) {
      context.strokeStyle = '#25231f';
      context.stroke();
    }
    context.restore();
  }
}

function sendInput(now: number): void {
  if (!room || stale) return;
  if (outbox.length) {
    room.send('inputs', outbox.splice(0, 16));
  }
  if (now - lastPingSent > 2000) {
    room.send('ping', { sentAt: Date.now() });
    lastPingSent = now;
  }
}

function render(now: number): void {
  animationFrame = requestAnimationFrame(render);
  const dt = Math.min(0.25, Math.max(0, (now - previousFrame) / 1000));
  if (!inGame || !activeScene || !activeCamera) {
    // The lobby is HTML only; the GPU idles while the house downloads.
    previousFrame = now;
    return;
  }
  {
    if (room && !stale && ((lastSnapshotAt > 0 && now - lastSnapshotAt > 1500) || (lastSnapshotAt === 0 && now - connectedAt > 3500))) {
      enterOffline('Snapshots stopped arriving, so flight is paused.');
    }
    const alpha = Math.min(1, (now - doorSnapshotAt) / 50);
    const doorStates = latestSnapshot?.doors ?? [];
    for (let i = 0; i < doorStates.length; i++) {
      const door = doorStates[i];
      const displayed = displayedDoors[i] ?? (displayedDoors[i] = { ...door });
      displayed.opening = door.opening;
      displayed.fraction = (previousDoors[i]?.fraction ?? door.fraction) * (1-alpha) + door.fraction * alpha;
    }
    displayedDoorTime = previousDoorTime*(1-alpha)+(latestSnapshot?.time ?? previousDoorTime)*alpha;
    if (doorStates.some((state,index)=>Math.abs(state.fraction-(previousDoors[index]?.fraction ?? state.fraction))>1e-8)) cameraSweepCache.valid = false;
    gameHouse?.updateDoors(displayedDoors, dt);
    paintBatch?.update(displayedDoors);
    inkEffects?.update(dt);
    const local = updateDroneVisuals(now, dt);
    sendInput(now);
    if (local && !stale) updateCamera(local);
    const canInteract = local && !stale && local.respawnAt <= 0;
    const escape = canInteract ? closetEscape(local.position, displayedDoors) : null;
    const aimed = canInteract && !escape ? targetedDoor(local, displayedDoors, latestSnapshot?.game?.mode === 'hideSeek') : -1;
    const target = escape?.index ?? (aimed >= 0 ? aimed : canInteract ? nearbyOpenCloset(local.position, displayedDoors, lastInteractedDoor) : -1);
    doorPrompt.hidden = target < 0;
    crosshair.classList.toggle('can-interact', aimed >= 0);
    crosshair.classList.toggle('ink-firing', now < inkFirePulseUntil);
    crosshair.classList.toggle('ink-hit', now < inkHitPulseUntil);
    inkMuzzleFlash.classList.toggle('active', now < inkFirePulseUntil);
    if (target >= 0) doorPrompt.textContent = escape
      ? `G · ${escape.opening ? 'Open' : 'Close'} ${DOORS[target].label} from inside`
      : `G · ${latestSnapshot?.doors?.[target]?.opening ? 'Close' : 'Open'} ${DOORS[target].label}${DOORS[target].kind === 'door' ? ' door' : ''}`;
    if (now - lastHudAt >= 100) {
      updateStatus(local, now);
      if (latestSnapshot) drawMinimap(latestSnapshot.players);
      lastHudAt = now;
    }
  }
  adaptResolution(now - previousFrame, now);
  if (activeScene === gameScene) gameHouse?.updateVisibility(activeCamera.position);
  if (comicRenderer) comicRenderer.render(renderer, activeScene, activeCamera);
  else renderer.render(activeScene, activeCamera);
  fpsFrames += 1;
  if (now - fpsStarted >= 750) {
    currentFps = Math.round((fpsFrames * 1000) / (now - fpsStarted));
    fpsFrames = 0;
    fpsStarted = now;
    fpsValue.textContent = `${currentFps} FPS`;
    pingValue.textContent = latestPing ? `${latestPing} MS` : '— MS';
  }
  previousFrame = now;
}

joinForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const invited = !inviteBanner.hidden;
  if (invited) void connect(queryRoom, false);
  else {
    const roomName = sanitizeRoomName(roomNameInput.value);
    if (roomName && roomName.length < ROOM_NAME_MIN) {
      joinHint.classList.add('error');
      joinHint.textContent = `Room names need at least ${ROOM_NAME_MIN} letters or digits.`;
      roomNameInput.focus();
      return;
    }
    void connect('', true, selectedMode(), roomName);
  }
});
createButton.addEventListener('click', () => {
  roomNameInput.value = '';
  refreshLobbyForm();
});
modePicker.addEventListener('change', refreshLobbyForm);
roundAction.addEventListener('click', () => {
  roundActionHandler?.();
  roundAction.blur();
});
retryButton.addEventListener('click', () => {
  if (roomId) void connect(roomId, false);
});
lobbyButton.addEventListener('click', () => void returnToLobby());
leaveButton.addEventListener('click', () => void returnToLobby());
copyInvite.addEventListener('click', async () => {
  if (!roomId) return;
  const invite = new URL(location.href);
  invite.searchParams.set('room', roomId);
  try {
    await navigator.clipboard.writeText(invite.toString());
    showToast('Invite copied — send it to your fellow pilots.');
  } catch {
    window.prompt('Copy this invite:', invite.toString());
  }
});
byId<HTMLButtonElement>('hideInstructions').addEventListener('click', () => byId('instructions').classList.add('hidden'));
roomNameInput.addEventListener('input', () => {
  joinHint.classList.remove('error');
  refreshLobbyForm();
});
roomNameInput.addEventListener('blur', () => { roomNameInput.value = sanitizeRoomName(roomNameInput.value); });
window.addEventListener('resize', () => setRendererSize(gameMount));

refreshLobbyForm();
drawPlanStack();
startHousePreload();
animationFrame = requestAnimationFrame(render);

window.addEventListener('beforeunload', () => {
  cancelAnimationFrame(animationFrame);
  deliberateLeave = true;
  if (document.pointerLockElement) document.exitPointerLock();
  inkAudio.dispose();
  void room?.leave();
});
