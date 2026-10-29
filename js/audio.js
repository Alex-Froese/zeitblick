// Zeitblick – Klänge (WebAudio, keine Dateien nötig)
let ctx = null;
function ac() {
  if (!ctx) {
    const A = window.AudioContext || window.webkitAudioContext;
    if (!A) return null;
    ctx = new A();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => { });
  return ctx;
}

function tone(freq, start, dur, gain = 0.12, type = 'sine') {
  const c = ac(); if (!c) return;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0, c.currentTime + start);
  g.gain.linearRampToValueAtTime(gain, c.currentTime + start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
  o.connect(g).connect(c.destination);
  o.start(c.currentTime + start); o.stop(c.currentTime + start + dur + 0.05);
}

export function chime(kind = 'done') {
  try {
    if (kind === 'done') { tone(880, 0, 0.25, 0.09); tone(1318.5, 0.08, 0.35, 0.07); }
    else if (kind === 'focus') { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * 0.14, 0.9, 0.08)); }
    else if (kind === 'alert') { tone(988, 0, 0.18, 0.12, 'triangle'); tone(988, 0.25, 0.18, 0.12, 'triangle'); tone(1318, 0.5, 0.3, 0.12, 'triangle'); }
    else if (kind === 'soft') { tone(660, 0, 0.3, 0.06); }
    else if (kind === 'fail') { tone(330, 0, 0.4, 0.08, 'triangle'); tone(247, 0.2, 0.6, 0.08, 'triangle'); }
  } catch { }
}

/* Hintergrundklänge für den Fokus */
let noise = null;
export const SOUNDS = [
  { id: 'none', name: 'Stille' },
  { id: 'rain', name: 'Regen' },
  { id: 'brown', name: 'Tiefes Rauschen' },
  { id: 'waves', name: 'Wellen' },
];
export function startNoise(kind) {
  stopNoise();
  if (!kind || kind === 'none') return;
  const c = ac(); if (!c) return;
  const len = 2 * c.sampleRate;
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'brown' || kind === 'waves') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    else d[i] = w * 0.5;
  }
  const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
  const filter = c.createBiquadFilter();
  filter.type = kind === 'rain' ? 'highpass' : 'lowpass';
  filter.frequency.value = kind === 'rain' ? 900 : 700;
  const g = c.createGain(); g.gain.value = kind === 'rain' ? 0.07 : 0.18;
  src.connect(filter).connect(g).connect(c.destination);
  let lfo = null;
  if (kind === 'waves') {
    lfo = c.createOscillator(); const lg = c.createGain();
    lfo.frequency.value = 0.08; lg.gain.value = 0.12;
    lfo.connect(lg).connect(g.gain); lfo.start();
  }
  src.start();
  noise = { src, g, lfo };
}
export function stopNoise() {
  if (!noise) return;
  try { noise.src.stop(); if (noise.lfo) noise.lfo.stop(); } catch { }
  noise = null;
}
export function vibrate(p) {
  try {
    if (!navigator.vibrate || !window.matchMedia('(pointer: coarse)').matches) return;
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
    navigator.vibrate(p);
  } catch { }
}
