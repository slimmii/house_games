// Synthesized toy-box sound for Little Defenders: Web Audio only, no files, no libraries.
// Every sound is a function of (voice, start time) so the same code drives the live AudioContext
// and the OfflineAudioContext measurements in tests/defense-audio-review.html.
import type { GameEvent } from './sim/sim';

export type UiSound = 'click' | 'pick' | 'deny' | 'select' | 'pause' | 'start';
export type GameAudio = {
  /** Call from a user gesture (first click/tap/key): creates/resumes the AudioContext. Safe to call repeatedly. */
  unlock(): void;
  setMuted(muted: boolean): void;
  /** Play the sound for one simulation event. Called for every event, possibly hundreds per second. */
  handle(event: GameEvent): void;
  ui(sound: UiSound): void;
  /** Game speed 1, 2 or 3: use it to thin out repeated sounds, not to change pitch. */
  setSpeed(speed: number): void;
  /** Start or stop the quiet looping background tune (a music box). */
  setMusic(playing: boolean): void;
  dispose(): void;
};

type Ctx = BaseAudioContext;
/** One playing sound: its sources feed `out`, which is disconnected when the last source ends. */
type Voice = { ctx: Ctx; out: GainNode; live: number };

const MAX_VOICES = 24;
/** Frequent sounds may use only this many slots, so rare important ones always find room. */
const BUSY_VOICES = 20;
const MUSIC_LOOP = 16;

const rand = (low: number, high: number) => low + Math.random() * (high - low);
const vary = (value: number, amount = 0.05) => value * (1 + (Math.random() * 2 - 1) * amount);
const midi = (note: number) => 440 * 2 ** ((note - 69) / 12);

const noiseBuffers = new WeakMap<Ctx, AudioBuffer>();
function noiseBuffer(ctx: Ctx): AudioBuffer {
  let buffer = noiseBuffers.get(ctx);
  if (!buffer) {
    buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noiseBuffers.set(ctx, buffer);
  }
  return buffer;
}

function track(voice: Voice, source: AudioScheduledSourceNode, nodes: AudioNode[]): void {
  voice.live++;
  source.onended = () => {
    source.disconnect();
    for (const node of nodes) node.disconnect();
    if (--voice.live === 0) voice.out.disconnect();
  };
}

function envelope(param: AudioParam, start: number, peak: number, attack: number, duration: number): void {
  param.setValueAtTime(0.0001, start);
  param.linearRampToValueAtTime(peak, start + attack);
  param.exponentialRampToValueAtTime(0.0001, start + duration);
}

type Shape = { at?: number; dur: number; gain: number; attack?: number; filter?: BiquadFilterType; ff?: number; fto?: number; q?: number };
type ToneShape = Shape & { type?: OscillatorType; f: number; to?: number; glide?: number };

/** Envelope + optional filter after `source`; returns the end time. */
function finish(voice: Voice, t: number, source: AudioScheduledSourceNode, o: Shape, defaultFilter?: BiquadFilterType): number {
  const { ctx } = voice;
  const start = t + (o.at ?? 0), end = start + o.dur;
  const gain = ctx.createGain();
  envelope(gain.gain, start, o.gain, o.attack ?? 0.003, o.dur);
  const filterType = o.filter ?? defaultFilter;
  if (filterType) {
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(o.ff ?? 2000, start);
    if (o.fto) filter.frequency.exponentialRampToValueAtTime(o.fto, end);
    filter.Q.value = o.q ?? 1;
    source.connect(filter).connect(gain);
    track(voice, source, [filter, gain]);
  } else {
    source.connect(gain);
    track(voice, source, [gain]);
  }
  gain.connect(voice.out);
  source.stop(end + 0.02);
  return end;
}

function tone(voice: Voice, t: number, o: ToneShape): number {
  const oscillator = voice.ctx.createOscillator();
  const start = t + (o.at ?? 0);
  oscillator.type = o.type ?? 'sine';
  oscillator.frequency.setValueAtTime(o.f, start);
  if (o.to) oscillator.frequency.exponentialRampToValueAtTime(o.to, start + (o.glide ?? o.dur));
  oscillator.start(start);
  return finish(voice, t, oscillator, o);
}

function noise(voice: Voice, t: number, o: Shape): number {
  const source = voice.ctx.createBufferSource();
  source.buffer = noiseBuffer(voice.ctx);
  source.loop = true;
  source.start(t + (o.at ?? 0), Math.random() * 0.9);
  return finish(voice, t, source, o, 'bandpass');
}

/** A music-box tine: sine fundamental, a short metallic partial and a tiny pluck. */
function bell(voice: Voice, t: number, freq: number, gain: number, dur = 1.1): number {
  tone(voice, t, { f: freq * 4.07, dur: dur * 0.18, gain: gain * 0.18, attack: 0.001 });
  tone(voice, t, { type: 'triangle', f: freq * 2, dur: 0.05, gain: gain * 0.25, attack: 0.001 });
  return tone(voice, t, { f: freq, dur, gain, attack: 0.002 });
}

/** A toy horn: triangle body with a little sawtooth buzz. */
function horn(voice: Voice, t: number, freq: number, dur: number, gain: number, to?: number): number {
  tone(voice, t, { type: 'sawtooth', f: freq, to, dur, gain: gain * 0.35, attack: 0.025, filter: 'lowpass', ff: freq * 4 });
  return tone(voice, t, { type: 'triangle', f: freq, to, dur, gain, attack: 0.02 });
}

function tick(voice: Voice, t: number, f: number, gain: number, wet = false): number {
  if (wet) return tone(voice, t, { f: vary(f, 0.1), to: f * 0.5, dur: 0.05, gain });
  noise(voice, t, { filter: 'highpass', ff: 4000, dur: 0.012, gain: gain * 0.6 });
  return tone(voice, t, { type: 'triangle', f: vary(f, 0.1), to: f * 0.8, dur: 0.03, gain });
}

function clack(voice: Voice, t: number, f: number, gain: number): number {
  noise(voice, t, { ff: vary(f), q: 4, dur: 0.025, gain });
  return tone(voice, t, { type: 'triangle', f: vary(f * 0.4), dur: 0.03, gain: gain * 0.35 });
}

function drumHit(voice: Voice, t: number, gain: number, ff: number, body: number): number {
  noise(voice, t, { ff, q: 0.8, dur: 0.07, gain });
  return tone(voice, t, { type: 'triangle', f: body, to: body * 0.8, dur: 0.04, gain: gain * 0.4 });
}

function pings(voice: Voice, t: number, count: number, span: number, gain: number, curve: number): number {
  let end = t;
  for (let i = 0; i < count; i++) {
    const at = span * (i / count) ** curve + rand(0, span / count);
    const f = rand(2200, 5200);
    end = Math.max(end, tone(voice, t, { type: i % 2 ? 'triangle' : 'sine', at, f, to: f * 0.96, dur: rand(0.035, 0.08), gain: gain * rand(0.5, 1) * (1 - 0.6 * at / span) }));
  }
  return end;
}

function tune(voice: Voice, t: number, notes: Array<[number, number]>, beat: number, gain: number, dur = 1.1): number {
  let end = t;
  for (const [note, at] of notes) end = Math.max(end, bell(voice, t + at * beat, midi(note), note < 60 ? gain * 0.7 : gain, dur));
  return end;
}

type Note = { t: number; note: number; gain: number };
const SCALE = [60, 62, 64, 67, 69, 72, 74, 76, 79, 81];
const MELODY = [7, -1, 5, -1, 6, -1, 4, -1, 5, -1, -1, 3, 4, -1, -1, -1, 7, -1, 8, -1, 6, -1, 5, 4, 5, -1, 3, -1, 2, -1, -1, -1];
const BASS = [48, 45, 41, 43, 48, 45, 41, 43];

/** One 16 s pass of the music box, slightly different every time. */
function musicPhrase(): Note[] {
  const notes: Note[] = [];
  const step = MUSIC_LOOP / MELODY.length;
  BASS.forEach((note, bar) => notes.push({ t: bar * 2 + rand(0, 0.02), note, gain: vary(0.028, 0.15) }));
  MELODY.forEach((degree, index) => {
    if (degree < 0 || Math.random() < 0.12) return;
    const shifted = Math.random() < 0.15 ? Math.min(SCALE.length - 1, Math.max(0, degree + (Math.random() < 0.5 ? -1 : 1))) : degree;
    const t = index * step + rand(-0.015, 0.015) + 0.02;
    notes.push({ t, note: SCALE[shifted], gain: vary(0.045, 0.2) });
    if (Math.random() < 0.08) notes.push({ t: t + step / 2, note: SCALE[shifted] + 12, gain: 0.02 });
  });
  return notes.sort((a, b) => a.t - b.t);
}

type SoundFn = (voice: Voice, t: number) => number;
const hit = (f: number, gain: number, wet = false): SoundFn => (v, t) => tick(v, t, f, gain, wet);

const SOUNDS = {
  'fire:popgun': (v, t) => {
    noise(v, t, { filter: 'highpass', ff: 3000, dur: 0.015, gain: 0.12 });
    return tone(v, t, { f: vary(900), to: 180, dur: 0.06, gain: 0.14 });
  },
  'fire:dart': (v, t) => {
    tone(v, t, { f: vary(1400, 0.1), to: 700, dur: 0.03, gain: 0.03 });
    return noise(v, t, { ff: vary(2600, 0.1), fto: 900, q: 1.2, dur: 0.07, gain: 0.24 });
  },
  'fire:mortar': (v, t) => {
    noise(v, t, { filter: 'lowpass', ff: 400, dur: 0.06, gain: 0.25 });
    tone(v, t, { at: 0.04, f: vary(1100), to: 1900, dur: 0.22, gain: 0.035, attack: 0.1 });
    return tone(v, t, { f: vary(170), to: 60, dur: 0.14, gain: 0.32 });
  },
  'fire:glue': (v, t) => {
    noise(v, t, { ff: 900, fto: 2500, q: 3, dur: 0.09, gain: 0.35 });
    tone(v, t, { at: 0.03, f: vary(300), to: 700, dur: 0.07, gain: 0.22 });
    return tone(v, t, { at: 0.1, f: vary(500), to: 250, dur: 0.05, gain: 0.12 });
  },
  'fire:ballista': (v, t) => {
    const f = vary(340);
    noise(v, t, { filter: 'highpass', ff: 2500, dur: 0.012, gain: 0.12 });
    tone(v, t, { type: 'triangle', f: f * 1.01, to: f * 0.47, glide: 0.1, dur: 0.22, gain: 0.08 });
    return tone(v, t, { type: 'triangle', f, to: f * 0.48, glide: 0.12, dur: 0.26, gain: 0.17 });
  },
  'fire:robot': (v, t) => {
    tone(v, t, { type: 'square', f: vary(360), dur: 0.1, gain: 0.08, filter: 'lowpass', ff: 3000 });
    return tone(v, t, { type: 'sawtooth', f: vary(180), to: 150, dur: 0.12, gain: 0.22, filter: 'bandpass', ff: 1500, q: 1.5 });
  },
  'hit:popgun': hit(1800, 0.1),
  'hit:dart': hit(1300, 0.09),
  'hit:mortar': hit(800, 0.11),
  'hit:glue': hit(620, 0.12, true),
  'hit:ballista': hit(1100, 0.1),
  'hit:robot': hit(2400, 0.08),
  burst: (v, t) => {
    tone(v, t, { f: vary(120), to: 50, dur: 0.12, gain: 0.28 });
    noise(v, t, { filter: 'lowpass', ff: 800, dur: 0.1, gain: 0.2 });
    return pings(v, t, 5, 0.2, 0.12, 1);
  },
  puddle: (v, t) => {
    tone(v, t, { f: vary(220), to: 90, dur: 0.1, gain: 0.2 });
    return noise(v, t, { filter: 'lowpass', ff: 1800, fto: 300, q: 0.7, dur: 0.14, gain: 0.4 });
  },
  'die:soldier': (v, t) => {
    clack(v, t, 2200, 0.45);
    return clack(v, t + rand(0.06, 0.08), 1700, 0.32);
  },
  'die:vehicle': (v, t) => {
    tone(v, t, { f: vary(140), to: 60, dur: 0.22, gain: 0.4 });
    clack(v, t, 900, 0.4);
    clack(v, t + 0.09, 650, 0.35);
    clack(v, t + 0.15, 1500, 0.15);
    return clack(v, t + 0.2, 1300, 0.12);
  },
  'die:boss': (v, t) => {
    tone(v, t, { f: 90, to: 35, dur: 0.7, gain: 0.6 });
    noise(v, t, { filter: 'lowpass', ff: 1200, fto: 200, dur: 1, gain: 0.5, attack: 0.01 });
    let end = t + 1;
    for (let i = 0; i < 10; i++) end = Math.max(end, clack(v, t + rand(0, 0.8), rand(600, 2400), 0.3 * (1 - i / 14)));
    return end;
  },
  leak: (v, t) => {
    tone(v, t, { f: 420, to: 260, dur: 0.12, gain: 0.42 });
    tone(v, t, { type: 'triangle', f: 210, dur: 0.1, gain: 0.15 });
    tone(v, t, { type: 'triangle', at: 0.16, f: midi(72), dur: 0.22, gain: 0.3 });
    return tone(v, t, { type: 'triangle', at: 0.36, f: midi(68), dur: 0.35, gain: 0.3 });
  },
  land: (v, t) => {
    noise(v, t, { filter: 'lowpass', ff: 500, dur: 0.05, gain: 0.2 });
    return tone(v, t, { f: vary(180), to: 70, dur: 0.08, gain: 0.3 });
  },
  stomp: (v, t) => {
    noise(v, t, { filter: 'lowpass', ff: 300, dur: 0.2, gain: 0.45 });
    for (let i = 0; i < 6; i++) noise(v, t, { at: 0.05 + i * 0.035, ff: rand(2000, 3200), q: 8, dur: 0.02, gain: 0.25 });
    return tone(v, t, { f: 75, to: 35, dur: 0.35, gain: 0.75 });
  },
  'spawn:boss': (v, t) => {
    horn(v, t, midi(48), 0.18, 0.45);
    horn(v, t + 0.22, midi(48), 0.18, 0.45);
    horn(v, t + 0.44, midi(51), 0.2, 0.45);
    return horn(v, t + 0.7, midi(46), 0.7, 0.55, midi(43));
  },
  wave: (v, t) => {
    const hits = [0, 0.12, 0.24, 0.36, 0.39, 0.42, 0.45, 0.48, 0.51, 0.54, 0.57, 0.6, 0.72];
    hits.forEach((at, i) => drumHit(v, t + at + rand(0, 0.006), i === hits.length - 1 || i < 3 ? 0.55 : 0.2 + i * 0.02, 3000, 230));
    horn(v, t + 0.85, midi(67), 0.18, 0.45);
    return horn(v, t + 1.05, midi(72), 0.45, 0.5);
  },
  'wave:boss': (v, t) => {
    const hits = [0, 0.2, 0.4, 0.52, 0.56, 0.6, 0.64, 0.68, 0.72, 0.76, 0.9];
    hits.forEach((at, i) => drumHit(v, t + at, i === hits.length - 1 || i < 3 ? 0.4 : 0.14 + i * 0.015, 1800, 140));
    tone(v, t + 0.9, { f: 80, to: 45, dur: 0.3, gain: 0.5 });
    horn(v, t + 1.05, midi(62), 0.3, 0.42);
    return horn(v, t + 1.4, midi(56), 0.6, 0.45, midi(55));
  },
  waveClear: (v, t) => tune(v, t, [[84, 0], [88, 1], [91, 2]], 0.12, 0.32, 0.8),
  build: (v, t) => {
    noise(v, t, { ff: vary(800), q: 6, dur: 0.05, gain: 0.45 });
    tone(v, t, { f: vary(300), to: 260, dur: 0.09, gain: 0.35 });
    return noise(v, t, { at: 0.09, ff: 1000, q: 6, dur: 0.04, gain: 0.15 });
  },
  upgrade: (v, t) => {
    noise(v, t, { filter: 'highpass', ff: 7000, dur: 0.4, gain: 0.05, attack: 0.1 });
    return tune(v, t, [[84, 0], [88, 1], [91, 2], [96, 3]], 0.06, 0.22, 0.35);
  },
  sell: (v, t) => {
    noise(v, t, { at: 0.06, filter: 'highpass', ff: 6000, dur: 0.1, gain: 0.05 });
    tone(v, t, { type: 'square', f: midi(95), dur: 0.08, gain: 0.14, filter: 'lowpass', ff: 5000 });
    return tone(v, t, { type: 'square', at: 0.07, f: midi(100), dur: 0.3, gain: 0.14, filter: 'lowpass', ff: 6000 });
  },
  'ability:footsteps': (v, t) => {
    [0.25, 0.45, 0.75].forEach((gain, i) => {
      noise(v, t, { at: i * 0.55, filter: 'lowpass', ff: 250, dur: 0.15, gain: gain * 0.6 });
      tone(v, t, { at: i * 0.55, f: 70, to: 40, dur: 0.25, gain });
    });
    return tone(v, t, { type: 'sawtooth', at: 1.25, f: 48, to: 62, dur: 0.45, gain: 0.25, attack: 0.08, filter: 'bandpass', ff: 900, q: 3 });
  },
  'ability:marbles': (v, t) => {
    noise(v, t, { ff: 1500, dur: 0.15, gain: 0.3 });
    noise(v, t, { filter: 'lowpass', ff: 400, dur: 1.3, gain: 0.35, attack: 0.05 });
    return pings(v, t, 28, 1.2, 0.35, 1.6);
  },
  won: (v, t) => tune(v, t, [[48, 0], [72, 0], [76, 1], [79, 2], [76, 3], [55, 4], [81, 4], [79, 5], [60, 6], [84, 6]], 0.28, 0.28, 1.2),
  lost: (v, t) => tune(v, t, [[57, 0], [76, 0], [74, 1], [72, 2], [52, 3], [71, 3], [45, 4.5], [69, 4.5]], 0.34, 0.26, 1.4),
  'ui:click': (v, t) => {
    noise(v, t, { filter: 'highpass', ff: 5000, dur: 0.008, gain: 0.1 });
    return tone(v, t, { type: 'triangle', f: 2500, dur: 0.015, gain: 0.15 });
  },
  'ui:pick': (v, t) => tone(v, t, { f: vary(600), to: 300, dur: 0.06, gain: 0.3 }),
  'ui:deny': (v, t) => {
    tone(v, t, { type: 'square', f: 110, dur: 0.07, gain: 0.2, filter: 'lowpass', ff: 600 });
    return tone(v, t, { type: 'square', at: 0.1, f: 104, dur: 0.08, gain: 0.2, filter: 'lowpass', ff: 600 });
  },
  'ui:select': (v, t) => tone(v, t, { f: 880, to: 990, dur: 0.06, gain: 0.2 }),
  'ui:pause': (v, t) => {
    tone(v, t, { type: 'triangle', f: 660, dur: 0.08, gain: 0.2 });
    return tone(v, t, { type: 'triangle', at: 0.09, f: 440, dur: 0.1, gain: 0.2 });
  },
  'ui:start': (v, t) => tune(v, t, [[79, 0], [84, 1]], 0.1, 0.25, 0.5),
  music: (v, t) => {
    let end = t;
    for (const n of musicPhrase()) end = Math.max(end, bell(v, t + n.t, midi(n.note), n.gain, 1.6));
    return Math.max(end, t + MUSIC_LOOP);
  },
} satisfies Record<string, SoundFn>;

export type SoundName = keyof typeof SOUNDS;
/** Test-only: every sound the review page renders. */
export const SOUND_NAMES = Object.keys(SOUNDS) as SoundName[];

function voiceOn(ctx: Ctx, destination: AudioNode, gain: number): Voice {
  const out = ctx.createGain();
  out.gain.value = gain;
  out.connect(destination);
  return { ctx, out, live: 0 };
}

/** Test-only entry point: render one sound into `destination` at `when`. Returns its end time. */
export function renderSound(ctx: BaseAudioContext, destination: AudioNode, name: SoundName, when: number, gain = 1): number {
  return SOUNDS[name](voiceOn(ctx, destination, gain), when);
}

/** Master chain: input -> compressor -> soft limiter -> master gain (mute) -> destination. */
export function createMasterChain(ctx: BaseAudioContext, destination: AudioNode) {
  const input = ctx.createGain();
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -12;
  compressor.knee.value = 6;
  compressor.ratio.value = 6;
  compressor.attack.value = 0.002;
  compressor.release.value = 0.15;
  const trim = ctx.createGain();
  trim.gain.value = 0.6; // offsets the compressor's automatic makeup gain
  const limiter = ctx.createWaveShaper();
  const curve = new Float32Array(1025);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1, a = Math.abs(x);
    curve[i] = Math.sign(x) * (a < 0.7 ? a : 0.7 + 0.25 * Math.tanh((a - 0.7) / 0.25));
  }
  limiter.curve = curve;
  limiter.oversample = '2x';
  const master = ctx.createGain();
  input.connect(compressor).connect(trim).connect(limiter).connect(master).connect(destination);
  return { input, master };
}

type Pick = { name: SoundName; family: string; gap: number; priority: boolean; gain?: number };
const VEHICLES = new Set(['jeep', 'tank', 'helicopter']);

function pick(event: GameEvent): Pick | null {
  switch (event.type) {
    case 'fire': return { name: `fire:${event.tower}`, family: `fire:${event.tower}`, gap: event.tower === 'dart' ? 0.07 : 0.055, priority: false };
    case 'hit': return { name: `hit:${event.tower}`, family: 'hit', gap: 0.045, priority: false };
    case 'die':
      if (event.boss) return { name: 'die:boss', family: 'die:boss', gap: 0.3, priority: true };
      return VEHICLES.has(event.kind)
        ? { name: 'die:vehicle', family: 'die:vehicle', gap: 0.09, priority: false }
        : { name: 'die:soldier', family: 'die', gap: 0.06, priority: false };
    case 'burst': return { name: 'burst', family: 'burst', gap: 0.07, priority: false };
    case 'puddle': return { name: 'puddle', family: 'puddle', gap: 0.08, priority: false };
    case 'land': return { name: 'land', family: 'land', gap: 0.1, priority: false, gain: 0.8 };
    case 'spawn': return event.boss ? { name: 'spawn:boss', family: 'spawn', gap: 1, priority: true } : null;
    case 'leak': return { name: 'leak', family: 'leak', gap: 0.25, priority: true };
    case 'stomp': return { name: 'stomp', family: 'stomp', gap: 0.3, priority: true };
    case 'wave': return { name: event.boss ? 'wave:boss' : 'wave', family: 'wave', gap: 0.5, priority: true };
    case 'waveClear': return { name: 'waveClear', family: 'waveClear', gap: 0.5, priority: true };
    case 'build': case 'upgrade': return { name: event.type, family: event.type, gap: 0.05, priority: true };
    case 'sell': return { name: 'sell', family: 'sell', gap: 0.05, priority: true };
    case 'ability': return { name: `ability:${event.kind}`, family: 'ability', gap: 0.2, priority: true };
    case 'won': case 'lost': return { name: event.type, family: 'end', gap: 2, priority: true };
  }
}

export type Mixer = {
  /** Applies family rate limits and the voice cap; `now` is the audio-clock time. Returns true if a voice was scheduled. */
  handle(event: GameEvent, now: number): boolean;
  play(name: SoundName, now: number, priority?: boolean, gain?: number): boolean;
  setSpeed(speed: number): void;
  /** Test-only counters. */
  stats: { scheduled: number; dropped: number; maxActive: number };
};

/** Rate-limited voice allocator shared by the live game and the offline stress test. */
export function createMixer(ctx: BaseAudioContext, destination: AudioNode): Mixer {
  const slots = Array.from({ length: MAX_VOICES }, () => ({ end: 0, out: null as GainNode | null }));
  const families = new Map<string, { last: number; skipped: number }>();
  const stats = { scheduled: 0, dropped: 0, maxActive: 0 };
  let thin = 1;

  function play(name: SoundName, now: number, priority = true, gain = 1): boolean {
    const limit = priority ? MAX_VOICES : BUSY_VOICES;
    let slot: (typeof slots)[number] | undefined;
    for (let i = 0; i < limit && !slot; i++) if (slots[i].end <= now) slot = slots[i];
    if (!slot && priority) {
      slot = slots.reduce((a, b) => (b.end < a.end ? b : a));
      slot.out?.gain.setTargetAtTime(0, now, 0.015);
    }
    if (!slot) { stats.dropped++; return false; }
    const when = now + 0.005 + (priority ? 0 : rand(0, 0.012));
    const voice = voiceOn(ctx, destination, gain);
    slot.end = SOUNDS[name](voice, when) + 0.03;
    slot.out = voice.out;
    stats.scheduled++;
    let active = 0;
    for (const s of slots) if (s.end > now) active++;
    stats.maxActive = Math.max(stats.maxActive, active);
    return true;
  }

  return {
    stats, play,
    setSpeed(speed) { thin = 1 + 0.5 * (Math.min(3, Math.max(1, speed)) - 1); },
    handle(event, now) {
      const choice = pick(event);
      if (!choice) return false;
      let family = families.get(choice.family);
      if (!family) families.set(choice.family, family = { last: -1e9, skipped: 0 });
      if (now - family.last < choice.gap * (choice.priority ? 1 : thin)) { family.skipped++; return false; }
      const boost = Math.min(1.5, 1 + 0.15 * Math.log2(1 + family.skipped));
      family.last = now;
      family.skipped = 0;
      return play(choice.name, now, choice.priority, boost * (choice.gain ?? 1));
    },
  };
}

export function createAudio(): GameAudio {
  let ctx: AudioContext | undefined;
  let chain: ReturnType<typeof createMasterChain> | undefined;
  let mixer: Mixer | undefined;
  let muted = false, speed = 1, wantMusic = false;
  let musicBus: GainNode | undefined, musicTimer: ReturnType<typeof setInterval> | undefined;
  let phrase: Note[] = [], phraseStart = 0, noteIndex = 0;

  const ready = () => !!ctx && !muted && ctx.state === 'running';

  function musicTick(): void {
    if (!ctx || !musicBus) return;
    const now = ctx.currentTime, horizon = now + 1.2;
    if (phraseStart + MUSIC_LOOP < now) { phraseStart = now + 0.1; phrase = musicPhrase(); noteIndex = 0; }
    for (;;) {
      if (noteIndex >= phrase.length) { phraseStart += MUSIC_LOOP; phrase = musicPhrase(); noteIndex = 0; }
      const note = phrase[noteIndex], t = phraseStart + note.t;
      if (t > horizon) break;
      if (t >= now) bell(voiceOn(ctx, musicBus, 1), t, midi(note.note), note.gain, 1.6);
      noteIndex++;
    }
  }

  function startMusic(): void {
    if (!ctx || !chain || musicBus) return;
    musicBus = ctx.createGain();
    musicBus.gain.value = 1;
    musicBus.connect(chain.input);
    phrase = musicPhrase(); noteIndex = 0; phraseStart = ctx.currentTime + 0.2;
    musicTick();
    musicTimer = setInterval(() => { try { musicTick(); } catch { /* audio unavailable */ } }, 250);
  }

  function stopMusic(): void {
    if (musicTimer !== undefined) clearInterval(musicTimer);
    musicTimer = undefined;
    const bus = musicBus;
    musicBus = undefined;
    if (!bus || !ctx) return;
    bus.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
    setTimeout(() => { try { bus.disconnect(); } catch { /* already gone */ } }, 1500);
  }

  return {
    unlock() {
      try {
        if (ctx) { if (ctx.state === 'suspended') void ctx.resume(); return; }
        const Audio = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Audio) return;
        ctx = new Audio();
        chain = createMasterChain(ctx, ctx.destination);
        chain.master.gain.value = muted ? 0 : 1;
        mixer = createMixer(ctx, chain.input);
        mixer.setSpeed(speed);
        if (ctx.state === 'suspended') void ctx.resume();
        if (wantMusic) startMusic();
      } catch { ctx = undefined; }
    },
    setMuted(value) {
      muted = value;
      try { chain?.master.gain.setTargetAtTime(muted ? 0 : 1, ctx!.currentTime, 0.04); } catch { /* audio unavailable */ }
    },
    handle(event) {
      if (!ready()) return;
      try { mixer!.handle(event, ctx!.currentTime); } catch { /* audio unavailable */ }
    },
    ui(sound) {
      if (!ready()) return;
      try { mixer!.play(`ui:${sound}`, ctx!.currentTime, true, 1); } catch { /* audio unavailable */ }
    },
    setSpeed(value) { speed = value; mixer?.setSpeed(value); },
    setMusic(playing) {
      wantMusic = playing;
      try { if (playing) startMusic(); else stopMusic(); } catch { /* audio unavailable */ }
    },
    dispose() {
      stopMusic();
      try { void ctx?.close(); } catch { /* already closed */ }
      ctx = undefined; chain = undefined; mixer = undefined;
    },
  };
}
