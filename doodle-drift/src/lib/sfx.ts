/**
 * Small synthesised sound effects (no audio files). The level is the player's game-sound
 * preference times Stellarr's per-listener Game audio slider.
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let prefLevel = 0.7;
let hostLevel = 1;

export type Sfx = "tick" | "go" | "done" | "page" | "pop" | "join";

function audio(): AudioContext | null {
  if (ctx) return ctx;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.connect(ctx.destination);
  apply();
  return ctx;
}

function apply() {
  if (master) master.gain.value = 0.5 * prefLevel * hostLevel;
}

export function setLevels(pref: number, host: number) {
  prefLevel = pref;
  hostLevel = host;
  apply();
}

export function unlockAudio() {
  const context = audio();
  if (context?.state === "suspended") void context.resume();
}

function tone(freq: number, duration: number, type: OscillatorType, gain: number, glideTo?: number, delay = 0) {
  const context = audio();
  if (!context || !master || prefLevel * hostLevel <= 0) return;
  const start = context.currentTime + delay;
  const osc = context.createOscillator();
  const env = context.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, start + duration);
  env.gain.setValueAtTime(0, start);
  env.gain.linearRampToValueAtTime(gain, start + 0.006);
  env.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(env).connect(master);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

function noise(duration: number, frequency: number, gain: number, delay = 0) {
  const context = audio();
  if (!context || !master || prefLevel * hostLevel <= 0) return;
  const start = context.currentTime + delay;
  const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const source = context.createBufferSource();
  source.buffer = buffer;
  const filter = context.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = frequency;
  const env = context.createGain();
  env.gain.setValueAtTime(gain, start);
  env.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.connect(filter).connect(env).connect(master);
  source.start(start);
}

export function play(name: Sfx) {
  switch (name) {
    case "tick": tone(1100, 0.07, "square", 0.22); break;
    case "go": tone(220, 0.18, "triangle", 0.35, 660); tone(880, 0.16, "triangle", 0.3, 1320, 0.1); break;
    case "done": tone(660, 0.12, "sine", 0.4); tone(990, 0.18, "sine", 0.35, undefined, 0.08); break;
    case "page": noise(0.18, 2400, 0.45); noise(0.12, 1200, 0.28, 0.07); break;
    case "pop": tone(520, 0.09, "sine", 0.3, 880); break;
    case "join": tone(523, 0.1, "sine", 0.35); tone(784, 0.14, "sine", 0.32, undefined, 0.06); break;
  }
}
