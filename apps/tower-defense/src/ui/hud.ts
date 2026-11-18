import './hud.css';
import type {
  Hud,
  HudAbility,
  HudActions,
  HudBuildItem,
  HudDifficulty,
  HudResult,
  HudScreen,
  HudSelection,
  HudStat,
  HudView,
  HudWaveGroup,
} from './hudTypes';
import type { TargetMode, TowerKind } from '../sim/towers';

/*
 * DOM layer for Little Defenders. Everything is built once; `update(view)` runs
 * every frame and only writes where a value differs from what was last drawn.
 * Lists (build bar, wave chips, abilities, stats, difficulty cards) are rebuilt
 * only when their content changes; their per-frame state (affordable, selected,
 * cooldown…) is patched in place.
 */

// ---------------------------------------------------------------- icons

const INK = '#25231f';
const ICONS = {
  cushion: `<path d="M4 4.5Q12 7.6 20 4.5 17 12 20 19.5 12 16.4 4 19.5 7 12 4 4.5z" fill="#f27654" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/><path d="M8.2 9.2q3.8 1.4 7.6 0" fill="none" stroke="${INK}" stroke-width="1.2" stroke-linecap="round" opacity=".45"/><circle cx="12" cy="12.6" r="1.6" fill="#f7c948" stroke="${INK}" stroke-width="1.2"/><circle cx="4" cy="4.5" r="1.3" fill="${INK}"/><circle cx="20" cy="4.5" r="1.3" fill="${INK}"/><circle cx="4" cy="19.5" r="1.3" fill="${INK}"/><circle cx="20" cy="19.5" r="1.3" fill="${INK}"/>`,
  button: `<circle cx="12" cy="12" r="9" fill="#f7c948" stroke="${INK}" stroke-width="1.8"/><circle cx="12" cy="12" r="6" fill="none" stroke="${INK}" stroke-width="1.2" opacity=".45"/><circle cx="10" cy="10" r="1.25" fill="${INK}"/><circle cx="14" cy="10" r="1.25" fill="${INK}"/><circle cx="10" cy="14" r="1.25" fill="${INK}"/><circle cx="14" cy="14" r="1.25" fill="${INK}"/>`,
  flag: `<path d="M6 21V3.5" stroke="${INK}" stroke-width="2" stroke-linecap="round"/><path d="M6.6 4.2h11.6l-3 4 3 4H6.6z" fill="#5aa9e0" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>`,
  soldier: `<path d="M8.6 8.2a3.4 3.4 0 0 1 6.8 0v.6H8.6z" fill="#5f8f3e" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/><circle cx="12" cy="10.6" r="2" fill="#5f8f3e" stroke="${INK}" stroke-width="1.5"/><path d="M8.4 13.6h7.2l-1.1 4.4h-1.3l-.4 3h-1.6l-.4-3H9.5z" fill="#5f8f3e" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/>`,
  speed: `<path d="M4.5 6.5 10 12l-5.5 5.5M12.5 6.5 18 12l-5.5 5.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`,
  pause: `<rect x="6" y="5" width="4.2" height="14" rx="1.6" fill="currentColor"/><rect x="13.8" y="5" width="4.2" height="14" rx="1.6" fill="currentColor"/>`,
  play: `<path d="M7.5 5.2v13.6c0 .8.9 1.3 1.6.8l10-6.8c.6-.4.6-1.2 0-1.6l-10-6.8c-.7-.5-1.6 0-1.6.8z" fill="currentColor"/>`,
  soundOn: `<path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z" fill="currentColor" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M15.2 9a4.2 4.2 0 0 1 0 6M17.8 6.6a7.6 7.6 0 0 1 0 10.8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
  soundOff: `<path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z" fill="currentColor" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="m15.5 9.5 5 5m0-5-5 5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>`,
  star: `<path d="M12 2.9l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.7l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>`,
  close: `<path d="m7 7 10 10M17 7 7 17" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/>`,
  crown: `<path d="M4 17.5 3 7.5l5 4 4-6.5 4 6.5 5-4-1 10z" fill="#f7c948" stroke="${INK}" stroke-width="1.7" stroke-linejoin="round"/><path d="M4.4 20h15.2" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>`,
  toy: `<rect x="4" y="4" width="16" height="16" rx="3" fill="#ece2cd" stroke="${INK}" stroke-width="1.6" stroke-dasharray="3 2.4"/><path d="M9.8 9.6a2.3 2.3 0 1 1 3.2 2.1c-.6.3-1 .8-1 1.4v.6" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="16.6" r="1.1" fill="${INK}"/>`,
  up: `<path d="M12 19V6M6.5 11.5 12 6l5.5 5.5" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>`,
  plane: `<path d="M3.5 13.5 10 11l3.6-6.3c.4-.7 1.6-.5 1.6.3l-.6 5.8 5.2-2c.6 4.2-4.3 6-10.5 7.2l-1.6 3.2H6.2l.3-3.8-3-1.9z" fill="currentColor"/>`,
  boot: `<path d="M7 3.5h6v8.2l5.8 2.6c1 .5 1.7 1.5 1.7 2.6V19H4.5v-4.5c0-1.3.6-2 1.4-2.6L7 11z" fill="currentColor"/>`,
  floor: `<path d="M3 19h18M5 15h14v4H5zM8 15V9m8 6V9M6 9h12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`,
  restart: `<path d="M5.5 12a6.5 6.5 0 1 0 2-4.7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M6.5 3.8v4.4h4.4" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`,
  home: `<path d="M4 11.5 12 4.5l8 7M6.5 9.5V19.5h11v-10" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`,
  footsteps: `<ellipse cx="8.5" cy="9" rx="2.8" ry="4.3" fill="currentColor"/><ellipse cx="8.5" cy="16.2" rx="2" ry="1.7" fill="currentColor"/><ellipse cx="15.5" cy="6.2" rx="2.8" ry="4.3" fill="currentColor" opacity=".7"/><ellipse cx="15.5" cy="13.4" rx="2" ry="1.7" fill="currentColor" opacity=".7"/>`,
  marbles: `<circle cx="8" cy="15" r="4" fill="#5aa9e0" stroke="${INK}" stroke-width="1.6"/><circle cx="16" cy="15.5" r="3.4" fill="#f27654" stroke="${INK}" stroke-width="1.6"/><circle cx="12.4" cy="8" r="3.4" fill="#58bdb0" stroke="${INK}" stroke-width="1.6"/><circle cx="6.8" cy="13.6" r="1" fill="#fff"/><circle cx="11.2" cy="6.8" r=".9" fill="#fff"/>`,
  bolt: `<path d="M13.5 3 6 13.5h5L9.8 21 18 10h-5.2z" fill="currentColor" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/>`,
  bulb: `<path d="M12 3.5a5.8 5.8 0 0 0-3.4 10.5c.7.5 1 1.2 1 2V17h4.8v-1c0-.8.3-1.5 1-2A5.8 5.8 0 0 0 12 3.5z" fill="#f7c948" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/><path d="M9.8 19.6h4.4" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/>`,
  warn: `<path d="M12 4 2.8 19.5h18.4z" fill="#f7c948" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 10v4.2" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="16.9" r="1.2" fill="${INK}"/>`,
  tape: `<path d="M4 8h16v8H4z" fill="#efe3bf" stroke="${INK}" stroke-width="1.5" stroke-dasharray="2.5 2"/>`,
  move: `<path d="M12 3v18M3 12h18M12 3 9.2 5.8M12 3l2.8 2.8M12 21l-2.8-2.8M12 21l2.8-2.8M3 12l2.8-2.8M3 12l2.8 2.8M21 12l-2.8-2.8M21 12l-2.8 2.8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>`,
  wrench: `<path d="M14.5 3.6a4.6 4.6 0 0 0-4.2 6.2l-6.1 6.1a1.9 1.9 0 1 0 2.7 2.7l6.1-6.1a4.6 4.6 0 0 0 6.2-4.2l-2.6 2.1-2.8-.5-.5-2.8z" fill="currentColor"/>`,
} as const;
type IconName = keyof typeof ICONS;

const iconTemplates = new Map<IconName, SVGSVGElement>();
function icon(name: IconName, cls = 'ld-ico'): SVGSVGElement {
  let template = iconTemplates.get(name);
  if (!template) {
    const holder = document.createElement('div');
    holder.innerHTML = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;
    template = holder.firstElementChild as SVGSVGElement;
    iconTemplates.set(name, template);
  }
  const node = template.cloneNode(true) as SVGSVGElement;
  node.setAttribute('class', cls);
  return node;
}

// ---------------------------------------------------------------- DOM helpers

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, parent?: Node | null, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  if (parent) parent.appendChild(node);
  return node;
}

function button(cls: string, parent: Node | null, label: string): HTMLButtonElement {
  const node = h('button', cls, parent);
  node.type = 'button';
  node.setAttribute('aria-label', label);
  node.title = label;
  return node;
}

const drawnText = new WeakMap<Node, string>();
function setText(node: Node, text: string): void {
  if (drawnText.get(node) === text) return;
  drawnText.set(node, text);
  node.textContent = text;
}
function flag(node: Element, cls: string, on: boolean): void {
  if (node.classList.contains(cls) !== on) node.classList.toggle(cls, on);
}
function attr(node: Element, name: string, value: string | null): void {
  if (node.getAttribute(name) === value) return;
  if (value === null) node.removeAttribute(name);
  else node.setAttribute(name, value);
}
function show(node: HTMLElement, on: boolean): void {
  if (node.hidden === on) node.hidden = !on;
}
function label(node: HTMLElement, text: string): void {
  attr(node, 'aria-label', text);
  attr(node, 'title', text);
}

function sameList<T extends object>(a: readonly T[], b: readonly T[] | null, keys: readonly (keyof T)[]): boolean {
  if (!b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    for (const key of keys) if (a[i][key] !== b[i][key]) return false;
  }
  return true;
}
const copyList = <T extends object>(list: readonly T[]): T[] => list.map(item => ({ ...item }));

const TOWER_COLOURS: Partial<Record<TowerKind, string>> = {
  popgun: 'var(--coral)',
  dart: 'var(--sky)',
  glue: 'var(--mint)',
  mortar: 'var(--sun)',
  ballista: 'var(--wood)',
  robot: 'var(--tin)',
};
const FALLBACK_COLOURS = ['var(--coral)', 'var(--sky)', 'var(--mint)', 'var(--sun)', 'var(--wood)', 'var(--tin)'];
const TIER_COLOURS = ['#4f9a3c', '#c9a66b', '#8f98a0'];
const MODES: readonly { mode: TargetMode; name: string; hint: string }[] = [
  { mode: 'first', name: 'First', hint: 'Aim at the soldier closest to the fort' },
  { mode: 'last', name: 'Last', hint: 'Aim at the soldier furthest from the fort' },
  { mode: 'strong', name: 'Strong', hint: 'Aim at the toughest soldier in range' },
  { mode: 'close', name: 'Close', hint: 'Aim at the nearest soldier' },
];
const WORDMARK_TILT = [-5, 3, -2, 4, -3, 2, -4, 3, -1];

function thumb(src: string, parent: HTMLElement, cls: string): void {
  if (src) {
    const img = h('img', cls, parent);
    img.alt = '';
    img.decoding = 'async';
    img.draggable = false;
    img.src = src;
  } else {
    parent.appendChild(icon('toy', `${cls} ld-ph`));
  }
}

function starsRow(parent: HTMLElement, count: number, cls: string): HTMLElement {
  const row = h('span', cls, parent);
  row.setAttribute('role', 'img');
  row.setAttribute('aria-label', `${count} of 3 stars`);
  for (let i = 0; i < 3; i++) row.appendChild(icon('star', i < count ? 'ld-star is-lit' : 'ld-star'));
  return row;
}

// ---------------------------------------------------------------- HUD

type BuildRef = { item: HudBuildItem; btn: HTMLButtonElement; drawn: boolean };
type AbilityRef = { item: HudAbility; btn: HTMLButtonElement; num: HTMLElement; sweep: HTMLElement; drawnP: number; drawnN: string };
type Tip = { title: string; body: string; badges: { text: string; tone: string; icon: IconName }[] };

export function createHud(root: HTMLElement, actions: HudActions): Hud {
  root.classList.add('ld');
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const calm = () => motion.matches;
  const cleanups: (() => void)[] = [];
  const timers = new Set<number>();
  const later = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
    return id;
  };
  const listen = (target: EventTarget, type: string, fn: (event: Event) => void, options?: AddEventListenerOptions) => {
    target.addEventListener(type, fn, options);
    cleanups.push(() => target.removeEventListener(type, fn, options));
  };

  // ------------------------------------------------------------ layers
  const play = h('div', 'ld-play', root);
  const title = h('div', 'ld-title', root);
  const overlay = h('div', 'ld-overlay', root);
  const toastHost = h('div', 'ld-toasts', root);
  toastHost.setAttribute('aria-live', 'polite');
  toastHost.setAttribute('role', 'status');
  const bannerHost = h('div', 'ld-banner-host', root);
  bannerHost.setAttribute('aria-live', 'assertive');
  const tip = h('div', 'ld-tip', root);
  tip.id = `ld-tip-${Math.random().toString(36).slice(2, 8)}`;
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  play.hidden = true;
  title.hidden = true;
  overlay.hidden = true;

  // ------------------------------------------------------------ top-left: status + next wave
  const topLeft = h('div', 'ld-tl', play);
  const status = h('div', 'ld-status', topLeft);
  const stat = (cls: string, iconName: IconName, srText: string, hint: string) => {
    const node = h('div', `ld-stat ${cls}`, status);
    node.title = hint;
    node.appendChild(icon(iconName, 'ld-stat-ico'));
    h('span', 'ld-sr', node, `${srText} `);
    return { node, value: h('span', 'ld-stat-val', node) };
  };
  const livesStat = stat('ld-stat--lives', 'cushion', 'Cushions', 'Cushions left: each soldier who reaches the fort takes some');
  const moneyStat = stat('ld-stat--money', 'button', 'Buttons', 'Buttons to spend on toys and upgrades');
  const waveStat = stat('ld-stat--wave', 'flag', 'Wave', 'Wave');
  const enemyStat = stat('ld-stat--foes', 'soldier', 'Soldiers left', 'Soldiers still marching');

  const wavePanel = h('section', 'ld-wave ld-card', topLeft);
  wavePanel.setAttribute('aria-label', 'Next wave');
  h('span', 'ld-tape ld-tape--wave', wavePanel);
  const waveHead = h('div', 'ld-wave-head', wavePanel);
  const waveTitle = h('h2', 'ld-wave-title', waveHead);
  const bossFlag = h('span', 'ld-boss', waveHead);
  bossFlag.appendChild(icon('crown', 'ld-boss-ico'));
  h('span', '', bossFlag, 'Boss');
  const chipList = h('ul', 'ld-chips', wavePanel);
  chipList.setAttribute('aria-label', 'Soldiers in the next wave');
  const sendBtn = button('ld-btn ld-send', wavePanel, 'Send the next wave');
  const sendMain = h('span', 'ld-send-main', sendBtn);
  const sendLabel = h('span', 'ld-send-label', sendMain);
  const sendSub = h('span', 'ld-send-sub', sendMain);
  const sendBonus = h('span', 'ld-send-bonus', sendBtn);
  sendBonus.appendChild(icon('button', 'ld-ico ld-ico--sm'));
  const sendBonusNum = h('span', '', sendBonus);
  const sendTimer = h('span', 'ld-send-timer', sendBtn);
  listen(sendBtn, 'click', () => {
    if (sendBtn.getAttribute('aria-disabled') !== 'true') actions.callWave();
  });

  // ------------------------------------------------------------ top-right: controls
  const controls = h('div', 'ld-controls', play);
  const speedBtn = button('ld-btn ld-ctrl ld-speed', controls, 'Game speed');
  speedBtn.appendChild(icon('speed', 'ld-ico'));
  const speedNum = h('span', 'ld-speed-num', speedBtn);
  const pauseBtn = button('ld-btn ld-ctrl', controls, 'Pause');
  pauseBtn.appendChild(icon('pause', 'ld-ico'));
  const muteBtn = button('ld-btn ld-ctrl ld-mute', controls, 'Mute sound');
  const muteOn = icon('soundOn', 'ld-ico ld-mute-on');
  const muteOff = icon('soundOff', 'ld-ico ld-mute-off');
  muteBtn.append(muteOn, muteOff);
  let drawnSpeed: 1 | 2 | 3 = 1;
  listen(speedBtn, 'click', () => actions.setSpeed(drawnSpeed === 3 ? 1 : ((drawnSpeed + 1) as 2 | 3)));
  listen(pauseBtn, 'click', () => actions.pause());
  listen(muteBtn, 'click', () => actions.toggleMute());

  // ------------------------------------------------------------ bottom: abilities, hint, placing, selection, build
  const bottom = h('div', 'ld-bottom', play);
  const abilityBar = h('div', 'ld-abilities', bottom);
  abilityBar.setAttribute('role', 'group');
  abilityBar.setAttribute('aria-label', 'Tricks');
  const center = h('div', 'ld-center', bottom);

  const hint = h('div', 'ld-hint', center);
  hint.appendChild(icon('bulb', 'ld-hint-ico'));
  const hintText = h('span', 'ld-hint-text', hint);
  hint.hidden = true;

  const placing = h('div', 'ld-placing ld-card', center);
  const placingText = h('p', 'ld-placing-text', placing);
  const placingName = h('strong', '', placingText);
  const placingHelp = h('span', 'ld-placing-help', placingText);
  const fineHelp = h('span', 'ld-help-fine', placingHelp);
  h('span', 'ld-sep', fineHelp, ' · ');
  fineHelp.append('click the floor');
  h('span', 'ld-sep', fineHelp, ' · ');
  fineHelp.append('Esc to cancel');
  const touchHelp = h('span', 'ld-help-touch', placingHelp);
  h('span', 'ld-sep', touchHelp, ' · ');
  touchHelp.append('tap the floor to put it down');
  const placingWarn = h('p', 'ld-placing-warn', placing);
  placingWarn.appendChild(icon('warn', 'ld-ico ld-ico--sm'));
  const placingReason = h('span', '', placingWarn);
  const placingCancel = button('ld-btn ld-btn--small ld-placing-cancel', placing, 'Cancel placing');
  placingCancel.appendChild(icon('close', 'ld-ico ld-ico--sm'));
  h('span', '', placingCancel, 'Cancel');
  listen(placingCancel, 'click', () => actions.pickBuild(null));
  placing.hidden = true;

  // Selection panel
  const sel = h('section', 'ld-sel ld-card', center);
  sel.setAttribute('aria-label', 'Selected toy');
  sel.hidden = true;
  const selHead = h('div', 'ld-sel-head', sel);
  const selThumb = h('div', 'ld-sel-thumb', selHead);
  const selTitleBox = h('div', 'ld-sel-titles', selHead);
  const selName = h('h2', 'ld-sel-name', selTitleBox);
  const selLevelRow = h('div', 'ld-sel-level', selTitleBox);
  const selPips = h('span', 'ld-pips', selLevelRow);
  const selLevelText = h('span', 'ld-sel-level-text', selLevelRow);
  const selKills = h('p', 'ld-sel-kills', selTitleBox);
  const selClose = button('ld-btn ld-btn--icon ld-sel-close', selHead, 'Close');
  selClose.appendChild(icon('close', 'ld-ico'));
  listen(selClose, 'click', () => actions.deselect());
  const selNotes = h('div', 'ld-sel-notes', sel);
  const noteHigh = h('span', 'ld-note ld-note--high', selNotes, 'On furniture: +20% range');
  const noteStun = h('span', 'ld-note ld-note--stun', selNotes);
  noteStun.appendChild(icon('bolt', 'ld-ico ld-ico--sm'));
  h('span', '', noteStun, 'Jammed!');
  const selStats = h('dl', 'ld-stats', sel);
  const selModes = h('div', 'ld-modes', sel);
  h('span', 'ld-modes-label', selModes, 'Aim at');
  const modeGroup = h('div', 'ld-mode-group', selModes);
  modeGroup.setAttribute('role', 'group');
  modeGroup.setAttribute('aria-label', 'Which soldier to aim at');
  const modeBtns = MODES.map(({ mode, name, hint: modeHint }) => {
    const btn = button('ld-mode', modeGroup, modeHint);
    btn.textContent = name;
    btn.setAttribute('aria-pressed', 'false');
    listen(btn, 'click', () => actions.setMode(mode));
    return { mode, btn };
  });
  const selActions = h('div', 'ld-sel-actions', sel);
  const upBtn = button('ld-btn ld-up', selActions, 'Upgrade');
  upBtn.appendChild(icon('up', 'ld-ico'));
  const upLabel = h('span', 'ld-up-label', upBtn, 'Upgrade');
  const upCost = h('span', 'ld-price', upBtn);
  upCost.appendChild(icon('button', 'ld-ico ld-ico--sm'));
  const upCostNum = h('span', '', upCost);
  const sellBtn = button('ld-btn ld-sell', selActions, 'Sell');
  h('span', '', sellBtn, 'Sell');
  const sellPrice = h('span', 'ld-price', sellBtn);
  sellPrice.appendChild(icon('button', 'ld-ico ld-ico--sm'));
  const sellNum = h('span', '', sellPrice);
  listen(upBtn, 'click', () => actions.upgrade());
  listen(sellBtn, 'click', () => actions.sell());

  // Build bar
  const buildBar = h('div', 'ld-build', center);
  buildBar.setAttribute('role', 'toolbar');
  buildBar.setAttribute('aria-label', 'Toys to place');
  const buildTrack = h('div', 'ld-build-track', buildBar);

  // ------------------------------------------------------------ tooltip (build items, abilities)
  let tipAnchor: HTMLElement | null = null;
  const showTip = (anchor: HTMLElement, content: Tip) => {
    tip.replaceChildren();
    h('strong', 'ld-tip-title', tip, content.title);
    if (content.body) h('p', 'ld-tip-body', tip, content.body);
    if (content.badges.length) {
      const row = h('div', 'ld-tip-badges', tip);
      for (const badge of content.badges) {
        const node = h('span', `ld-badge ld-badge--${badge.tone}`, row);
        node.appendChild(icon(badge.icon, 'ld-ico ld-ico--sm'));
        h('span', '', node, badge.text);
      }
    }
    if (tipAnchor && tipAnchor !== anchor) tipAnchor.removeAttribute('aria-describedby');
    tipAnchor = anchor;
    anchor.setAttribute('aria-describedby', tip.id);
    tip.hidden = false;
    // Measured only on hover/focus, never per frame.
    const a = anchor.getBoundingClientRect();
    const r = root.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    const margin = 10;
    let left = a.left + a.width / 2 - t.width / 2 - r.left;
    left = Math.max(margin, Math.min(r.width - t.width - margin, left));
    let top = a.top - r.top - t.height - 12;
    if (top < margin) top = a.bottom - r.top + 12;
    tip.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  };
  const hideTip = () => {
    if (tipAnchor) tipAnchor.removeAttribute('aria-describedby');
    tipAnchor = null;
    tip.hidden = true;
  };

  /** Hover, focus and long-press (touch) on items of a list container. */
  const tipEvents = (container: HTMLElement, selector: string, content: (anchor: HTMLElement) => Tip | null) => {
    let pressTimer = 0;
    let pressStart: { x: number; y: number } | null = null;
    const open = (target: EventTarget | null) => {
      const anchor = target instanceof Element ? (target.closest(selector) as HTMLElement | null) : null;
      if (!anchor || !container.contains(anchor)) return;
      const tipContent = content(anchor);
      if (tipContent) showTip(anchor, tipContent);
    };
    listen(container, 'pointerover', event => {
      if ((event as PointerEvent).pointerType === 'mouse') open(event.target);
    });
    listen(container, 'pointerleave', event => {
      if ((event as PointerEvent).pointerType === 'mouse') hideTip();
    });
    listen(container, 'focusin', event => {
      if ((event.target as Element).matches(':focus-visible')) open(event.target);
    });
    listen(container, 'focusout', hideTip);
    listen(container, 'pointerdown', event => {
      const pointer = event as PointerEvent;
      if (pointer.pointerType === 'mouse') return;
      pressStart = { x: pointer.clientX, y: pointer.clientY };
      window.clearTimeout(pressTimer);
      pressTimer = later(() => {
        pressStart = null;
        container.dataset.longpress = 'true';
        open(pointer.target);
      }, 450);
    });
    const cancelPress = () => {
      window.clearTimeout(pressTimer);
      pressStart = null;
    };
    listen(container, 'pointermove', event => {
      const pointer = event as PointerEvent;
      if (pressStart && Math.hypot(pointer.clientX - pressStart.x, pointer.clientY - pressStart.y) > 10) cancelPress();
    });
    listen(container, 'pointerup', cancelPress);
    listen(container, 'pointercancel', cancelPress);
    listen(container, 'contextmenu', event => {
      if (container.dataset.longpress === 'true') event.preventDefault();
    });
  };
  /** A click right after a long-press only showed the info, so swallow it. */
  const consumeLongPress = (container: HTMLElement) => {
    if (container.dataset.longpress !== 'true') return false;
    delete container.dataset.longpress;
    return true;
  };
  listen(document, 'pointerdown', event => {
    if (tipAnchor && !(event.target instanceof Node && tipAnchor.contains(event.target))) hideTip();
  }, { capture: true });
  listen(buildBar, 'scroll', hideTip, { passive: true });

  // ------------------------------------------------------------ build bar
  let buildRefs: BuildRef[] = [];
  let drawnBuild: HudBuildItem[] | null = null;
  const BUILD_KEYS = ['kind', 'name', 'blurb', 'cost', 'hotkey', 'icon', 'hitsAir', 'heavy'] as const;

  const rebuildBuild = (items: readonly HudBuildItem[]) => {
    drawnBuild = copyList(items);
    buildRefs = drawnBuild.map((item, index) => {
      const btn = button('ld-block', null, `${item.name}, ${item.cost} buttons${item.hotkey ? `, key ${item.hotkey}` : ''}`);
      btn.dataset.index = String(index);
      btn.setAttribute('aria-pressed', 'false');
      btn.style.setProperty('--block', TOWER_COLOURS[item.kind] ?? FALLBACK_COLOURS[index % FALLBACK_COLOURS.length]);
      if (item.hotkey) h('span', 'ld-key', btn, item.hotkey);
      const face = h('span', 'ld-block-face', btn);
      thumb(item.icon, face, 'ld-block-img');
      const cost = h('span', 'ld-block-cost', btn);
      cost.appendChild(icon('button', 'ld-ico ld-ico--sm'));
      h('span', '', cost, String(item.cost));
      btn.title = '';
      return { item: { ...item }, btn, drawn: false };
    });
    buildTrack.replaceChildren(...buildRefs.map(ref => ref.btn));
  };
  listen(buildTrack, 'click', event => {
    if (consumeLongPress(buildTrack)) return;
    const btn = (event.target as Element).closest('.ld-block') as HTMLElement | null;
    if (!btn) return;
    const ref = buildRefs[Number(btn.dataset.index)];
    if (ref) actions.pickBuild(ref.item.selected ? null : ref.item.kind);
  });
  tipEvents(buildTrack, '.ld-block', anchor => {
    const ref = buildRefs[Number(anchor.dataset.index)];
    if (!ref) return null;
    const { item } = ref;
    const badges: Tip['badges'] = [item.hitsAir ? { text: 'Hits aircraft', tone: 'air', icon: 'plane' } : { text: 'Ground only', tone: 'ground', icon: 'boot' }];
    if (item.heavy) badges.push({ text: 'Floor only', tone: 'heavy', icon: 'floor' });
    const poor = item.affordable ? '' : ` You need ${item.cost} buttons.`;
    return { title: `${item.name} · ${item.cost}`, body: item.blurb + poor, badges };
  });

  // ------------------------------------------------------------ abilities
  let abilityRefs: AbilityRef[] = [];
  let drawnAbilities: HudAbility[] | null = null;
  const ABILITY_KEYS = ['kind', 'name', 'blurb', 'hotkey', 'cooldown'] as const;
  const rebuildAbilities = (items: readonly HudAbility[]) => {
    drawnAbilities = copyList(items);
    abilityRefs = drawnAbilities.map((item, index) => {
      const btn = button('ld-ab', null, `${item.name}${item.hotkey ? ` (key ${item.hotkey})` : ''}`);
      btn.title = '';
      btn.dataset.index = String(index);
      const disc = h('span', 'ld-ab-disc', btn);
      const iconName: IconName = item.kind === 'footsteps' ? 'footsteps' : item.kind === 'marbles' ? 'marbles' : 'star';
      disc.appendChild(icon(iconName, 'ld-ab-ico'));
      const sweep = h('span', 'ld-ab-sweep', disc);
      const num = h('span', 'ld-ab-num', disc);
      if (item.hotkey) h('span', 'ld-key ld-key--round', btn, item.hotkey);
      h('span', 'ld-ab-name', btn, item.name);
      return { item: { ...item }, btn, num, sweep, drawnP: -1, drawnN: '' };
    });
    abilityBar.replaceChildren(...abilityRefs.map(ref => ref.btn));
  };
  listen(abilityBar, 'click', event => {
    if (consumeLongPress(abilityBar)) return;
    const btn = (event.target as Element).closest('.ld-ab') as HTMLElement | null;
    if (!btn) return;
    const ref = abilityRefs[Number(btn.dataset.index)];
    if (ref && (ref.item.ready || ref.item.armed)) actions.ability(ref.item.kind);
  });
  tipEvents(abilityBar, '.ld-ab', anchor => {
    const ref = abilityRefs[Number(anchor.dataset.index)];
    if (!ref) return null;
    const { item } = ref;
    const state = item.armed ? 'Now tap a spot on the floor.' : item.ready ? 'Ready.' : `Ready in ${Math.ceil(item.remaining)} s.`;
    return { title: item.name, body: `${item.blurb} ${state}`, badges: [] };
  });

  // ------------------------------------------------------------ wave chips
  let drawnGroups: HudWaveGroup[] | null = null;
  const GROUP_KEYS = ['kind', 'name', 'blurb', 'tier', 'tierName', 'count', 'lane', 'laneName', 'boss', 'icon'] as const;
  const rebuildChips = (groups: readonly HudWaveGroup[]) => {
    drawnGroups = copyList(groups);
    chipList.replaceChildren(
      ...drawnGroups.map(group => {
        const chip = h('li', group.boss ? 'ld-chip is-boss' : 'ld-chip');
        chip.style.setProperty('--tier', TIER_COLOURS[group.tier] ?? TIER_COLOURS[0]);
        const lane = group.lane === 'air' ? 'by air' : `on the ${group.laneName} route`;
        chip.title = `${group.count} ${group.tierName} ${group.name}, ${lane}. ${group.blurb}`;
        const well = h('span', 'ld-chip-well', chip);
        thumb(group.icon, well, 'ld-chip-img');
        h('span', 'ld-chip-count', chip, `×${group.count}`);
        h('span', 'ld-chip-lane', chip, group.laneName);
        h('span', 'ld-sr', chip, chip.title);
        return chip;
      }),
    );
  };

  // ------------------------------------------------------------ selection
  let drawnSel: { id: number; kind: TowerKind; name: string; icon: string; maxLevel: number } | null = null;
  let drawnStats: HudStat[] | null = null;
  let pips: HTMLElement[] = [];
  const STAT_KEYS = ['label', 'value', 'next'] as const;
  const rebuildStats = (stats: readonly HudStat[]) => {
    drawnStats = copyList(stats);
    selStats.replaceChildren();
    for (const stat of drawnStats) {
      const row = h('div', stat.next ? 'ld-stat-row has-next' : 'ld-stat-row', selStats);
      h('dt', '', row, stat.label);
      const dd = h('dd', '', row);
      h('span', 'ld-stat-now', dd, stat.value);
      if (stat.next && stat.next !== stat.value) {
        const next = h('span', 'ld-stat-next', dd);
        next.appendChild(icon('up', 'ld-ico ld-ico--xs'));
        h('span', '', next, stat.next);
        h('span', 'ld-sr', next, ' after upgrade');
      }
    }
  };
  const drawSelection = (s: HudSelection | null) => {
    show(sel, !!s);
    flag(play, 'has-sel', !!s);
    if (!s) {
      drawnSel = null;
      return;
    }
    if (!drawnSel || drawnSel.id !== s.id || drawnSel.kind !== s.kind || drawnSel.name !== s.name || drawnSel.icon !== s.icon || drawnSel.maxLevel !== s.maxLevel) {
      const fresh = !drawnSel || drawnSel.id !== s.id;
      drawnSel = { id: s.id, kind: s.kind, name: s.name, icon: s.icon, maxLevel: s.maxLevel };
      setText(selName, s.name);
      selThumb.replaceChildren();
      selThumb.style.setProperty('--block', TOWER_COLOURS[s.kind] ?? 'var(--sun)');
      thumb(s.icon, selThumb, 'ld-sel-img');
      selPips.replaceChildren();
      pips = [];
      for (let i = 0; i < s.maxLevel; i++) pips.push(h('span', 'ld-pip', selPips));
      sel.title = s.blurb;
      if (fresh && !calm()) sel.animate([{ transform: 'translateY(10px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 180, easing: 'cubic-bezier(.2,.9,.3,1.3)' });
    }
    for (let i = 0; i < pips.length; i++) flag(pips[i], 'is-on', i < s.level);
    setText(selLevelText, s.level >= s.maxLevel ? `Level ${s.level}, the top` : `Level ${s.level} of ${s.maxLevel}`);
    setText(selKills, s.kills === 1 ? '1 soldier beaten' : `${s.kills} soldiers beaten`);
    if (!sameList(s.stats, drawnStats, STAT_KEYS)) rebuildStats(s.stats);
    show(noteHigh, s.high);
    show(noteStun, s.stunned);
    show(selNotes, s.high || s.stunned);
    show(selModes, s.hasTargeting);
    for (const { mode, btn } of modeBtns) {
      const on = mode === s.mode;
      flag(btn, 'is-on', on);
      attr(btn, 'aria-pressed', on ? 'true' : 'false');
    }
    const maxed = s.upgradeCost === null;
    flag(upBtn, 'is-max', maxed);
    show(upCost, !maxed);
    setText(upLabel, maxed ? 'Max level' : 'Upgrade');
    if (s.upgradeCost !== null) setText(upCostNum, String(s.upgradeCost));
    const canUp = !maxed && s.canAffordUpgrade;
    if (upBtn.disabled === canUp) upBtn.disabled = !canUp;
    label(upBtn, maxed ? 'Already at max level' : s.canAffordUpgrade ? `Upgrade for ${s.upgradeCost} buttons` : `Upgrade costs ${s.upgradeCost} buttons, not enough yet`);
    setText(sellNum, `+${s.sellValue}`);
    label(sellBtn, `Sell for ${s.sellValue} buttons`);
  };

  // ------------------------------------------------------------ title screen
  const titleInner = h('div', 'ld-title-inner', title);
  const wordmark = h('h1', 'ld-wordmark', titleInner);
  wordmark.setAttribute('aria-label', 'Little Defenders');
  const little = h('span', 'ld-word-little', wordmark, 'Little');
  little.setAttribute('aria-hidden', 'true');
  const blocks = h('span', 'ld-word-blocks', wordmark);
  blocks.setAttribute('aria-hidden', 'true');
  'Defenders'.split('').forEach((letter, i) => {
    const block = h('span', 'ld-letter', blocks, letter);
    block.style.setProperty('--tilt', `${WORDMARK_TILT[i % WORDMARK_TILT.length]}deg`);
    block.style.setProperty('--block', FALLBACK_COLOURS[i % 4]);
  });
  h('p', 'ld-premise', titleInner, 'The plastic army is marching on Fort Cushion. Line the taped routes with your toys and hold them off.');
  const diffList = h('div', 'ld-diffs', titleInner);
  diffList.setAttribute('role', 'group');
  diffList.setAttribute('aria-label', 'Choose how hard');
  const howto = h('ul', 'ld-howto', titleInner);
  howto.setAttribute('aria-label', 'How to play');
  const howtoItems: [IconName, string, string][] = [
    ['tape', 'Place toys', 'beside the taped routes'],
    ['up', 'Click a toy', 'to upgrade or sell it'],
    ['button', 'Send waves early', 'for bonus buttons'],
    ['move', 'Drag to pan,', 'right-drag to turn, scroll to zoom'],
  ];
  for (const [iconName, strong, rest] of howtoItems) {
    const li = h('li', 'ld-howto-item', howto);
    li.appendChild(icon(iconName, 'ld-howto-ico'));
    const text = h('span', '', li);
    h('strong', '', text, strong);
    text.append(` ${rest}`);
  }
  let drawnDiffs: HudDifficulty[] | null = null;
  const DIFF_KEYS = ['id', 'name', 'blurb', 'lives', 'bestWave', 'bestStars'] as const;
  const rebuildDiffs = (list: readonly HudDifficulty[]) => {
    drawnDiffs = copyList(list);
    diffList.replaceChildren(
      ...drawnDiffs.map((d, index) => {
        const best = d.bestWave > 0 ? `Best: wave ${d.bestWave}, ${d.bestStars} of 3 stars` : 'Not played yet';
        const card = button(`ld-diff ld-diff--${index % 3}`, null, `Play ${d.name}. ${d.blurb} ${d.lives} cushions. ${best}.`);
        card.title = '';
        h('span', 'ld-tape ld-tape--diff', card);
        h('span', 'ld-diff-name', card, d.name);
        h('span', 'ld-diff-blurb', card, d.blurb);
        const meta = h('span', 'ld-diff-meta', card);
        const lives = h('span', 'ld-diff-lives', meta);
        lives.appendChild(icon('cushion', 'ld-ico'));
        h('span', '', lives, `${d.lives} cushions`);
        const bestNode = h('span', 'ld-diff-best', meta);
        if (d.bestWave > 0) {
          h('span', '', bestNode, `Best: wave ${d.bestWave}`);
          starsRow(bestNode, d.bestStars, 'ld-stars ld-stars--sm');
        } else {
          bestNode.textContent = 'Not played yet';
          bestNode.classList.add('is-new');
        }
        const go = h('span', 'ld-diff-go', card);
        go.appendChild(icon('play', 'ld-ico ld-ico--sm'));
        h('span', '', go, 'Play');
        listen(card, 'click', () => actions.start(d.id));
        return card;
      }),
    );
  };

  // ------------------------------------------------------------ overlays (pause / result)
  const pauseCard = h('section', 'ld-modal ld-card ld-pause', overlay);
  pauseCard.setAttribute('role', 'dialog');
  pauseCard.setAttribute('aria-modal', 'true');
  pauseCard.setAttribute('aria-label', 'Paused');
  h('span', 'ld-tape ld-tape--modal', pauseCard);
  h('h2', 'ld-modal-title', pauseCard, 'Paused');
  const pauseSub = h('p', 'ld-modal-sub', pauseCard);
  const pauseActions = h('div', 'ld-modal-actions', pauseCard);
  const resumeBtn = button('ld-btn ld-btn--go ld-btn--big', pauseActions, 'Resume');
  resumeBtn.appendChild(icon('play', 'ld-ico'));
  h('span', '', resumeBtn, 'Resume');
  const restartBtn = button('ld-btn', pauseActions, 'Restart this game');
  restartBtn.appendChild(icon('restart', 'ld-ico'));
  h('span', '', restartBtn, 'Restart');
  const quitBtn = button('ld-btn', pauseActions, 'Quit to title');
  quitBtn.appendChild(icon('home', 'ld-ico'));
  h('span', '', quitBtn, 'Quit to title');
  listen(resumeBtn, 'click', () => actions.resume());
  listen(restartBtn, 'click', () => actions.restart());
  listen(quitBtn, 'click', () => actions.quit());

  const resultCard = h('section', 'ld-modal ld-card ld-result', overlay);
  resultCard.setAttribute('role', 'dialog');
  resultCard.setAttribute('aria-modal', 'true');
  let drawnResult: HudResult | null = null;
  const rebuildResult = (r: HudResult, difficultyName: string) => {
    drawnResult = { ...r };
    resultCard.replaceChildren();
    flag(resultCard, 'is-won', r.won);
    flag(resultCard, 'is-lost', !r.won);
    const heading = r.won ? 'Fort Cushion is safe!' : 'They reached the fort';
    resultCard.setAttribute('aria-label', heading);
    h('span', 'ld-tape ld-tape--modal', resultCard);
    if (r.newBest) h('span', 'ld-sticker', resultCard, 'New best!');
    starsRow(resultCard, r.stars, 'ld-stars ld-stars--big');
    h('h2', 'ld-modal-title', resultCard, heading);
    h('p', 'ld-modal-sub', resultCard, r.won
      ? `Every wave on ${difficultyName} beaten. The cushions are still standing.`
      : `The army got past your toys on wave ${r.wave}. Rearrange and try again.`);
    const facts = h('dl', 'ld-facts', resultCard);
    const fact = (name: string, value: string, iconName: IconName) => {
      const row = h('div', 'ld-fact', facts);
      row.appendChild(icon(iconName, 'ld-fact-ico'));
      h('dd', 'ld-fact-val', row, value);
      h('dt', 'ld-fact-name', row, name);
    };
    fact('Wave reached', `${r.wave} / ${r.totalWaves}`, 'flag');
    fact('Soldiers beaten', String(r.kills), 'soldier');
    fact('Got through', String(r.leaked), 'cushion');
    const row = h('div', 'ld-modal-actions', resultCard);
    if (r.won && r.canContinue) {
      const endless = button('ld-btn ld-btn--sun ld-btn--big', row, 'Keep going in endless mode');
      endless.appendChild(icon('speed', 'ld-ico'));
      h('span', '', endless, 'Keep going (endless)');
      endless.addEventListener('click', () => actions.continueEndless());
    }
    const again = button(`ld-btn ${r.won && r.canContinue ? '' : 'ld-btn--go ld-btn--big'}`, row, 'Play again');
    again.appendChild(icon('restart', 'ld-ico'));
    h('span', '', again, 'Play again');
    again.addEventListener('click', () => actions.restart());
    const back = button('ld-btn', row, 'Back to title');
    back.appendChild(icon('home', 'ld-ico'));
    h('span', '', back, 'Back to title');
    back.addEventListener('click', () => actions.quit());
  };

  // ------------------------------------------------------------ drawn state
  let drawnScreen: HudScreen | null = null;
  let drawnLives = NaN;
  let drawnMaxLives = NaN;
  let moneyTarget = NaN;
  let moneyShown = NaN;
  let moneyFrom = 0;
  let moneyAt = 0;
  let drawnWaveKey = '';
  let drawnEnemies = NaN;
  let drawnMuted: boolean | null = null;
  let drawnDifficultyName = '';
  let drawnPlacing = '';
  let drawnHint: string | null | undefined;
  let drawnSendKey = '';

  const bump = (node: HTMLElement, colour: string) => {
    if (calm()) return;
    node.getAnimations().forEach(a => a.cancel());
    node.animate(
      [{ transform: 'translateY(0) scale(1)' }, { transform: 'translateY(-3px) scale(1.12)', color: colour, offset: 0.35 }, { transform: 'translateY(0) scale(1)' }],
      { duration: 260, easing: 'ease-out' },
    );
  };

  const drawScreen = (screen: HudScreen) => {
    drawnScreen = screen;
    root.dataset.screen = screen;
    show(title, screen === 'title');
    show(play, screen !== 'title');
    show(overlay, screen === 'paused' || screen === 'won' || screen === 'lost');
    show(pauseCard, screen === 'paused');
    show(resultCard, screen === 'won' || screen === 'lost');
    play.inert = screen !== 'playing';
    hideTip();
    const focusTarget = screen === 'paused' ? resumeBtn : screen === 'won' || screen === 'lost' ? (resultCard.querySelector('.ld-btn--big') as HTMLElement | null) : null;
    if (focusTarget) requestAnimationFrame(() => focusTarget.focus({ preventScroll: true }));
  };

  const drawStatus = (v: HudView, now: number) => {
    if (v.lives !== drawnLives || v.maxLives !== drawnMaxLives) {
      const dropped = v.lives < drawnLives;
      drawnLives = v.lives;
      drawnMaxLives = v.maxLives;
      setText(livesStat.value, `${v.lives} / ${v.maxLives}`);
      flag(livesStat.node, 'is-low', v.lives <= Math.max(3, Math.ceil(v.maxLives * 0.25)));
      if (dropped && !calm()) {
        livesStat.node.getAnimations().forEach(a => a.cancel());
        livesStat.node.animate(
          [
            { transform: 'scale(1)', backgroundColor: 'var(--paper-soft)' },
            { transform: 'scale(1.1) rotate(-2deg)', backgroundColor: '#ffd3c4', offset: 0.25 },
            { transform: 'scale(0.97) rotate(1deg)', offset: 0.55 },
            { transform: 'scale(1)', backgroundColor: 'var(--paper-soft)' },
          ],
          { duration: 520, easing: 'ease-out' },
        );
      }
    }
    // Money rolls toward its new value over ~300 ms (instantly with reduced motion).
    if (v.money !== moneyTarget) {
      const first = Number.isNaN(moneyTarget);
      if (!first) bump(moneyStat.value, v.money > moneyTarget ? '#2f8a57' : '#c8452b');
      moneyFrom = first || calm() ? v.money : moneyShown;
      moneyTarget = v.money;
      moneyAt = now;
    }
    if (moneyShown !== moneyTarget) {
      const t = Math.min(1, (now - moneyAt) / 300);
      moneyShown = t >= 1 ? moneyTarget : Math.round(moneyFrom + (moneyTarget - moneyFrom) * (1 - (1 - t) * (1 - t)));
      setText(moneyStat.value, String(moneyShown));
    }
    const waveKey = v.endless ? `e${v.wave}` : `${v.wave}/${v.totalWaves}`;
    if (waveKey !== drawnWaveKey) {
      drawnWaveKey = waveKey;
      setText(waveStat.value, v.endless ? `Endless · wave ${v.wave}` : `${v.wave} / ${v.totalWaves}`);
      flag(waveStat.node, 'is-endless', v.endless);
    }
    if (v.enemiesLeft !== drawnEnemies) {
      drawnEnemies = v.enemiesLeft;
      setText(enemyStat.value, String(v.enemiesLeft));
    }
  };

  const drawControls = (v: HudView) => {
    if (v.speed !== drawnSpeed || !speedNum.textContent) {
      drawnSpeed = v.speed;
      setText(speedNum, `${v.speed}×`);
      flag(speedBtn, 'is-fast', v.speed > 1);
      label(speedBtn, `Game speed ${v.speed}×. Click for ${v.speed === 3 ? 1 : v.speed + 1}×`);
    }
    if (v.muted !== drawnMuted) {
      drawnMuted = v.muted;
      flag(muteBtn, 'is-muted', v.muted);
      attr(muteBtn, 'aria-pressed', v.muted ? 'true' : 'false');
      label(muteBtn, v.muted ? 'Sound is off. Click to turn it on' : 'Sound is on. Click to mute');
    }
  };

  const drawWave = (v: HudView) => {
    const next = v.nextWave;
    show(wavePanel, !!next);
    if (!next) return;
    const start = v.wave === 0;
    flag(wavePanel, 'is-start', start);
    flag(wavePanel, 'is-boss', next.boss);
    show(bossFlag, next.boss);
    setText(waveTitle, start ? 'Ready when you are' : `Next up: wave ${next.number}`);
    if (!sameList(next.groups, drawnGroups, GROUP_KEYS)) rebuildChips(next.groups);
    show(chipList, next.groups.length > 0);

    const sendKey = `${start}|${v.canCallWave}|${v.callBonus}|${v.countdown}|${next.number}`;
    if (sendKey === drawnSendKey) return;
    drawnSendKey = sendKey;
    flag(sendBtn, 'is-start', start);
    attr(sendBtn, 'aria-disabled', v.canCallWave ? null : 'true');
    const number = next.number;
    if (start) {
      setText(sendLabel, 'Start');
      setText(sendSub, `wave ${number} of ${v.totalWaves}`);
      label(sendBtn, `Start wave ${number}`);
    } else if (!v.canCallWave) {
      setText(sendLabel, 'On its way');
      setText(sendSub, '');
      label(sendBtn, 'The next wave cannot be sent yet');
    } else {
      setText(sendLabel, v.countdown !== null ? 'Send now' : `Send wave ${number}`);
      setText(sendSub, v.countdown !== null ? `wave ${number}` : '');
      const bonus = v.callBonus > 0 ? `, earn ${v.callBonus} bonus buttons` : '';
      const timer = v.countdown !== null ? `. It starts by itself in ${v.countdown} seconds` : '';
      label(sendBtn, `Send wave ${number} now${bonus}${timer}`);
    }
    show(sendSub, !!sendSub.textContent);
    show(sendBonus, v.canCallWave && v.callBonus > 0);
    setText(sendBonusNum, `+${v.callBonus}`);
    show(sendTimer, v.countdown !== null && !start);
    setText(sendTimer, v.countdown !== null ? `${v.countdown}s` : '');
  };

  const drawBuild = (items: readonly HudBuildItem[]) => {
    if (!sameList(items, drawnBuild, BUILD_KEYS)) rebuildBuild(items);
    for (let i = 0; i < buildRefs.length; i++) {
      const ref = buildRefs[i];
      const item = items[i];
      if (ref.item.affordable !== item.affordable || !ref.drawn) {
        ref.item.affordable = item.affordable;
        flag(ref.btn, 'is-poor', !item.affordable);
      }
      if (ref.item.selected !== item.selected || !ref.drawn) {
        ref.item.selected = item.selected;
        flag(ref.btn, 'is-on', item.selected);
        attr(ref.btn, 'aria-pressed', item.selected ? 'true' : 'false');
      }
      ref.drawn = true;
    }
  };

  const drawAbilities = (items: readonly HudAbility[]) => {
    if (!sameList(items, drawnAbilities, ABILITY_KEYS)) rebuildAbilities(items);
    show(abilityBar, items.length > 0);
    for (let i = 0; i < abilityRefs.length; i++) {
      const ref = abilityRefs[i];
      const item = items[i];
      ref.item.ready = item.ready;
      ref.item.armed = item.armed;
      ref.item.remaining = item.remaining;
      flag(ref.btn, 'is-ready', item.ready && !item.armed);
      flag(ref.btn, 'is-armed', item.armed);
      flag(ref.btn, 'is-cooling', !item.ready && !item.armed);
      attr(ref.btn, 'aria-disabled', item.ready || item.armed ? null : 'true');
      attr(ref.btn, 'aria-pressed', item.armed ? 'true' : 'false');
      // Quantised so a slow cooldown does not restyle every frame.
      const p = item.ready || item.cooldown <= 0 ? 0 : Math.round(Math.min(1, item.remaining / item.cooldown) * 200) / 200;
      if (p !== ref.drawnP) {
        ref.drawnP = p;
        ref.sweep.style.setProperty('--p', String(p));
      }
      const n = item.ready || item.armed ? '' : String(Math.ceil(item.remaining));
      if (n !== ref.drawnN) {
        ref.drawnN = n;
        setText(ref.num, n);
        attr(ref.btn, 'aria-label', `${item.name}${item.hotkey ? ` (key ${item.hotkey})` : ''}${n ? `, ready in ${n} seconds` : item.armed ? ', tap the floor to use it' : ', ready'}`);
      }
    }
  };

  const drawPlacing = (p: HudView['placing']) => {
    const key = p ? `${p.kind}|${p.name}|${p.valid}|${p.reason ?? ''}` : '';
    if (key === drawnPlacing) return;
    drawnPlacing = key;
    show(placing, !!p);
    if (!p) return;
    setText(placingName, `Placing ${p.name}`);
    const warn = !p.valid && !!p.reason;
    flag(placing, 'is-bad', !p.valid);
    show(placingWarn, warn);
    setText(placingReason, p.reason ?? '');
  };

  const drawHint = (text: string | null) => {
    if (text === drawnHint) return;
    drawnHint = text;
    show(hint, !!text);
    setText(hintText, text ?? '');
  };

  // ------------------------------------------------------------ toasts and banners
  const toastQueue: { text: string; tone: 'good' | 'bad' | 'info' }[] = [];
  let toastsShown = 0;
  const MAX_TOASTS = 3;
  const pumpToasts = () => {
    while (toastsShown < MAX_TOASTS && toastQueue.length) {
      const next = toastQueue.shift()!;
      toastsShown++;
      const node = h('div', `ld-toast ld-toast--${next.tone}`, toastHost);
      node.appendChild(icon(next.tone === 'good' ? 'star' : next.tone === 'bad' ? 'warn' : 'bulb', 'ld-toast-ico'));
      h('span', '', node, next.text);
      if (!calm()) node.animate([{ transform: 'translateY(-12px) rotate(-2deg)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 220, easing: 'cubic-bezier(.2,.9,.3,1.4)' });
      later(() => {
        const finish = () => {
          node.remove();
          toastsShown--;
          pumpToasts();
        };
        if (calm()) finish();
        else node.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateY(-8px)' }], { duration: 260, fill: 'forwards' }).finished.then(finish, finish);
      }, 2600 + Math.min(2000, next.text.length * 25));
    }
  };

  let bannerNode: HTMLElement | null = null;
  let bannerTimer = 0;

  const hud: Hud = {
    update(v: HudView) {
      const now = performance.now();
      if (v.screen !== drawnScreen) drawScreen(v.screen);
      if (v.screen === 'title') {
        if (!sameList(v.difficulties, drawnDiffs, DIFF_KEYS)) rebuildDiffs(v.difficulties);
        return;
      }
      if (v.screen === 'paused') {
        const where = v.endless ? `endless wave ${v.wave}` : `wave ${v.wave} of ${v.totalWaves}`;
        const key = `${v.difficultyName}|${where}`;
        if (key !== drawnDifficultyName) {
          drawnDifficultyName = key;
          setText(pauseSub, `${v.difficultyName}, ${where}. The soldiers stand frozen until you come back.`);
        }
      }
      if ((v.screen === 'won' || v.screen === 'lost') && v.result) {
        const r = v.result;
        const d = drawnResult;
        if (!d || d.won !== r.won || d.stars !== r.stars || d.wave !== r.wave || d.totalWaves !== r.totalWaves || d.kills !== r.kills || d.leaked !== r.leaked || d.newBest !== r.newBest || d.canContinue !== r.canContinue) {
          rebuildResult(r, v.difficultyName);
          if (drawnScreen === v.screen) requestAnimationFrame(() => (resultCard.querySelector('.ld-btn--big') as HTMLElement | null)?.focus({ preventScroll: true }));
        }
      }
      drawStatus(v, now);
      drawControls(v);
      drawWave(v);
      drawBuild(v.build);
      drawAbilities(v.abilities);
      drawSelection(v.selection);
      drawPlacing(v.placing);
      drawHint(v.hint);
    },

    toast(text, tone = 'info') {
      toastQueue.push({ text, tone });
      pumpToasts();
    },

    banner(heading, subtitle, tone = 'wave') {
      if (bannerNode) bannerNode.remove();
      window.clearTimeout(bannerTimer);
      const node = h('div', `ld-banner ld-banner--${tone}`, bannerHost);
      bannerNode = node;
      if (tone === 'boss') node.appendChild(icon('crown', 'ld-banner-ico'));
      h('strong', 'ld-banner-title', node, heading);
      if (subtitle) h('span', 'ld-banner-sub', node, subtitle);
      const duration = 2600;
      if (!calm()) {
        node.animate(
          [
            { transform: 'translateY(-24px) scale(.7) rotate(-6deg)', opacity: 0 },
            { transform: 'translateY(0) scale(1.06) rotate(1deg)', opacity: 1, offset: 0.1 },
            { transform: 'scale(1) rotate(-1.5deg)', opacity: 1, offset: 0.18 },
            { transform: 'scale(1) rotate(-1.5deg)', opacity: 1, offset: 0.85 },
            { transform: 'translateY(-14px) scale(.96) rotate(-1.5deg)', opacity: 0 },
          ],
          { duration, easing: 'ease-out', fill: 'forwards' },
        );
      } else {
        node.animate([{ opacity: 0 }, { opacity: 1, offset: 0.08 }, { opacity: 1, offset: 0.9 }, { opacity: 0 }], { duration, fill: 'forwards' });
      }
      bannerTimer = later(() => {
        node.remove();
        if (bannerNode === node) bannerNode = null;
      }, duration + 50);
    },

    dispose() {
      for (const id of timers) window.clearTimeout(id);
      timers.clear();
      for (const fn of cleanups) fn();
      cleanups.length = 0;
      root.replaceChildren();
      root.classList.remove('ld');
      delete root.dataset.screen;
    },
  };
  return hud;
}
