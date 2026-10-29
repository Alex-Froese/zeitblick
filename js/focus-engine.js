// Zeitblick – Fokus-Logik (Timer, Pause, Abbruch, Protokoll). Läuft unabhängig von der Ansicht.
import * as C from './core.js';
import * as S from './store.js';
import { chime, startNoise, stopNoise, vibrate } from './audio.js';

const subs = new Set();
export function onChange(fn) { subs.add(fn); return () => subs.delete(fn); }
function changed(info) { for (const f of subs) { try { f(info); } catch (e) { console.error(e); } } }

export const prefs = {
  taskId: null,
  cat: null,
  min: null,
  mode: 'timer',
  sound: null,
};
export let lastResult = null; // { ok, min, taskId, cat, kind }
export function clearResult() { lastResult = null; }

export function run() {
  const af = S.getData().meta.activeFocus;
  return af && !af.deleted && af.run ? af.run : null;
}
function setRun(r) { S.put('meta', { id: 'activeFocus', run: r }); }

export function elapsedMs(r = run(), now = Date.now()) {
  if (!r) return 0;
  const end = r.paused ? r.pausedAt : now;
  return Math.max(0, end - r.startAt - (r.pauseMs || 0));
}
export function remainingMs(r = run(), now = Date.now()) {
  if (!r) return 0;
  if (r.mode === 'stopwatch') return 0;
  const planned = r.plan * C.MIN;
  return Math.max(0, planned - elapsedMs(r, now));
}
export function progress(r = run(), now = Date.now()) {
  if (!r) return 0;
  if (r.mode === 'stopwatch') return (elapsedMs(r, now) % (60 * C.MIN)) / (60 * C.MIN);
  return Math.min(1, elapsedMs(r, now) / (r.plan * C.MIN));
}

export function start(opts = {}) {
  const s = S.settings();
  const kind = opts.kind || 'focus';
  const plan = Math.max(1, Math.round(opts.min || (kind === 'break' ? s.focus.brk : prefs.min || s.focus.len)));
  const taskId = kind === 'break' ? null : (opts.taskId !== undefined ? opts.taskId : prefs.taskId);
  const t = taskId ? S.task(taskId) : null;
  const cat = t ? t.cat : (opts.cat !== undefined ? opts.cat : prefs.cat);
  const c = cat ? S.cat(cat) : null;
  const now = Date.now();
  const r = {
    id: C.uid('f'), kind, taskId: taskId || null, cat: cat || null, area: t ? t.area : c ? c.area : (S.local.area === 'b' ? 'b' : 'p'),
    plan, mode: kind === 'break' ? 'timer' : (opts.mode || prefs.mode || 'timer'), startAt: now, endAt: (opts.mode || prefs.mode) === 'stopwatch' && kind !== 'break' ? null : now + plan * C.MIN,
    paused: false, pausedAt: null, pauseMs: 0, strict: kind === 'break' ? false : !!(opts.strict ?? s.focus.strict), title: t ? t.title : (c ? c.name : ''),
    dev: S.local.deviceId,
  };
  lastResult = null;
  setRun(r);
  const snd = prefs.sound || s.focus.sound;
  if (kind === 'focus') startNoise(snd);
  chime('soft');
  changed({ started: true });
  return r;
}

export function pause() {
  const r = run(); if (!r || r.paused || r.strict) return;
  setRun({ ...r, paused: true, pausedAt: Date.now() });
  stopNoise();
  changed({ paused: true });
}
export function resume() {
  const r = run(); if (!r || !r.paused) return;
  const now = Date.now();
  const add = now - r.pausedAt;
  setRun({ ...r, paused: false, pausedAt: null, pauseMs: (r.pauseMs || 0) + add, endAt: r.endAt ? r.endAt + add : null });
  if (r.kind === 'focus') startNoise(prefs.sound || S.settings().focus.sound);
  changed({ resumed: true });
}
export function extend(min = 5) {
  const r = run(); if (!r || r.mode === 'stopwatch') return;
  setRun({ ...r, plan: r.plan + min, endAt: r.endAt ? r.endAt + min * C.MIN : null });
  changed({ extended: true });
}

function log(r, ok, now = Date.now()) {
  const min = Math.round(elapsedMs(r, now) / C.MIN * 10) / 10;
  if (r.kind === 'focus' && min >= 0.5) {
    S.put('focus', { id: r.id, taskId: r.taskId, cat: r.cat, area: r.area, s: r.startAt, e: now, plan: r.plan, min, ok, mode: r.mode });
    if (ok && r.taskId) { const t = S.task(r.taskId); if (t) S.put('tasks', { ...t, focusMin: Math.round(((t.focusMin || 0) + min) * 10) / 10 }); }
  }
  return min;
}

export function complete() {
  const r = run(); if (!r) return;
  const now = Date.now();
  const min = log(r, true, now);
  setRun(null);
  stopNoise();
  lastResult = { ok: true, min, taskId: r.taskId, cat: r.cat, kind: r.kind, id: r.id };
  chime(r.kind === 'break' ? 'soft' : 'focus');
  vibrate([120, 60, 120]);
  changed({ completed: true, result: lastResult });
}

export function stopStopwatch() {
  const r = run(); if (!r) return;
  const min = elapsedMs(r) / C.MIN;
  if (min >= 5) complete();
  else giveUp('zu kurz');
}

export function giveUp(reason = '') {
  const r = run(); if (!r) return;
  const now = Date.now();
  const min = r.kind === 'break' ? 0 : log(r, false, now);
  setRun(null);
  stopNoise();
  lastResult = r.kind === 'break' ? null : { ok: false, min, taskId: r.taskId, cat: r.cat, kind: r.kind, reason, id: r.id };
  if (r.kind !== 'break') chime('fail');
  changed({ failed: true, result: lastResult });
}

/** Wird jede Sekunde aufgerufen */
export function tick() {
  const r = run(); if (!r || r.paused) return;
  if (r.mode !== 'stopwatch' && r.endAt && Date.now() >= r.endAt) complete();
}

/* Strenger Modus: App verlassen → Kristall zerbricht */
let hiddenAt = 0;
export const STRICT_GRACE = 12000;
export function onVisibility(visible, notify) {
  const r = run();
  if (!r || !r.strict || r.paused || r.dev !== S.local.deviceId) { hiddenAt = 0; return; }
  if (!visible) {
    hiddenAt = Date.now();
    if (notify) notify();
  } else if (hiddenAt) {
    const away = Date.now() - hiddenAt;
    hiddenAt = 0;
    if (away > STRICT_GRACE) giveUp('App verlassen');
  }
}

/* Statistik */
export function stats(now = new Date(), area = 'all') {
  const list = S.focusSessions(f => S.inArea(f, area));
  const ok = list.filter(f => f.ok);
  const today = C.ymd(now);
  const ws = C.startOfWeek(now).getTime();
  const todayMin = ok.filter(f => C.ymd(new Date(f.s)) === today).reduce((a, f) => a + (f.min || 0), 0);
  const weekMin = ok.filter(f => f.s >= ws).reduce((a, f) => a + (f.min || 0), 0);
  const days = new Set(ok.map(f => C.ymd(new Date(f.s))));
  let streak = 0; let d = C.startOfDay(now);
  if (!days.has(C.ymd(d))) d = C.addDays(d, -1);
  while (days.has(C.ymd(d))) { streak++; d = C.addDays(d, -1); }
  const hours = new Array(24).fill(0);
  const cut = now.getTime() - 30 * C.DAY;
  for (const f of ok) if (f.s > cut) hours[new Date(f.s).getHours()] += f.min || 0;
  return { todayMin, weekMin, streak, total: ok.length, failed: list.length - ok.length, hours, list };
}
