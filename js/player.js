// Routine-Player: Vollbild mit Startbildschirm, Timer pro Schritt, Ring, Gesamtzeit und Inhalten
import * as C from './core.js';
import * as S from './store.js';
import { esc, icon, toast, burst, reducedMotion } from './ui.js';
import { chime, vibrate } from './audio.js';
import { A } from './app-api.js';

let st = null; // { h, k, idx, started, stepStart, pausedAt, pausedMs, done:Set, timer, el }

const RING_R = 92, RING_C = 2 * Math.PI * RING_R;

function stepsOf(h) { return (h.steps || []).filter(x => x && x.t); }
function plannedMin(h) { return stepsOf(h).reduce((a, s0) => a + (Number(s0.min) || 0), 0); }
function fmtClock(sec) { sec = Math.max(0, Math.round(sec)); const m = Math.floor(sec / 60), s = sec % 60; return m >= 60 ? `${Math.floor(m / 60)}:${C.pad(m % 60)}:${C.pad(s)}` : `${C.pad(m)}:${C.pad(s)}`; }
function safeUrl(u) { const s = String(u || '').trim(); return /^(https?:|data:image\/)/i.test(s) ? s : ''; }

function saveDone() {
  const cur = S.get('habits', st.h.id); if (!cur) return;
  const log = { ...(cur.log || {}) };
  const steps = stepsOf(cur);
  const ids = steps.map(x => x.id).filter(id => st.done.has(id));
  if (ids.length) log[st.k] = ids; else delete log[st.k];
  S.put('habits', { ...cur, log }, { noRender: true });
}

function now() { return Date.now(); }
function elapsedStep() { if (!st.stepStart) return 0; const end = st.pausedAt || now(); return (end - st.stepStart - st.pausedMs) / 1000; }
function elapsedTotal() { if (!st.started) return 0; const end = st.pausedAt || now(); return (end - st.started - st.totalPaused - (st.pausedAt ? 0 : 0)) / 1000; }

/** Routine starten (Startbildschirm) */
export function startRoutine(id, k) {
  const h = S.get('habits', id);
  if (!h) return;
  if (h.kind !== 'routine') { A.nav('#/gewohnheiten?h=' + id); return; }
  close(true);
  const key = k || C.ymd(new Date());
  const v = C.habitValue(h, key);
  const steps = stepsOf(h);
  st = { h, k: key, idx: 0, started: 0, stepStart: 0, pausedAt: 0, pausedMs: 0, totalPaused: 0, done: new Set(Array.isArray(v) ? v : v === true ? steps.map(x => x.id) : []), timer: null, el: null, phase: 'intro', alerted: false };
  const firstOpen = steps.findIndex(x => !st.done.has(x.id));
  st.idx = firstOpen < 0 ? 0 : firstOpen;
  const el = document.createElement('div');
  el.className = 'rp-back';
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Routine ' + h.title);
  el.style.setProperty('--rp', h.color || 'var(--accent)');
  document.body.appendChild(el);
  st.el = el;
  el.addEventListener('click', onClick);
  document.addEventListener('keydown', onKey, true);
  draw();
  requestAnimationFrame(() => el.classList.add('in'));
}

function close(silent) {
  if (!st) return;
  clearInterval(st.timer);
  document.removeEventListener('keydown', onKey, true);
  const el = st.el;
  if (el) { el.classList.remove('in'); setTimeout(() => el.remove(), reducedMotion() ? 0 : 220); }
  const wasRunning = st.phase === 'run';
  const h = st.h, doneN = st.done.size, total = stepsOf(h).length;
  st = null;
  if (!silent) { if (wasRunning && doneN < total) toast(`Routine pausiert: ${doneN} von ${total} Schritten erledigt`, { ms: 2400 }); A.render(); }
}

function introHtml() {
  const h = st.h; const steps = stepsOf(h);
  const pm = plannedMin(h);
  const runs = (h.runs || []).filter(r => r.dur);
  const avg = runs.length ? runs.slice(-10).reduce((a, r) => a + r.dur, 0) / Math.min(10, runs.length) : 0;
  const streak = C.habitStreak(h, new Date());
  return `<div class="rp-intro">
    <button class="icon-btn rp-x" data-rp="close" aria-label="Schließen">${icon('x', 20)}</button>
    <div class="rp-kicker">Routine</div>
    <h1>${esc(h.title)}</h1>
    <div class="rp-meta">${steps.length} Schritte${pm ? ` · geplant ${esc(C.fmtDuration(pm))}` : ''}${avg ? ` · im Schnitt ${esc(C.fmtDuration(Math.round(avg / 60)))}` : ''}${streak ? ` · ${streak} Tage in Folge` : ''}</div>
    ${h.note ? `<p class="rp-why">„${esc(h.note)}“</p>` : ''}
    <ol class="rp-steps-intro">${steps.map((s0, i) => `<li class="${st.done.has(s0.id) ? 'done' : ''}"><span class="n">${st.done.has(s0.id) ? icon('check', 13) : i + 1}</span><span class="grow">${esc(s0.t)}</span>${s0.min ? `<span class="m">${s0.min} Min</span>` : ''}</li>`).join('')}</ol>
    <div class="rp-cta"><button class="btn btn-primary rp-start" data-rp="start">${icon('play', 16)}${st.done.size && st.done.size < steps.length ? 'Weitermachen' : st.done.size === steps.length && steps.length ? 'Nochmal durchgehen' : 'Starten'}</button>
    <button class="btn btn-ghost" data-rp="quick">Ohne Timer abhaken</button></div>
    <div class="tiny rp-keys">Leertaste Pause · Enter Schritt fertig · ← zurück · Esc schließen</div>
  </div>`;
}

function runHtml() {
  const h = st.h; const steps = stepsOf(h); const s0 = steps[st.idx];
  if (!s0) return '';
  const img = safeUrl(s0.img), link = safeUrl(s0.link);
  return `<div class="rp-run">
    <header class="rp-top"><button class="icon-btn" data-rp="close" aria-label="Schließen">${icon('x', 20)}</button><div class="grow"><b>${esc(h.title)}</b><div class="tiny" data-rp-total></div></div><span class="rp-count">Schritt ${st.idx + 1} von ${steps.length}</span></header>
    <div class="rp-bar">${steps.map((x, i) => `<i class="${st.done.has(x.id) ? 'on' : ''} ${i === st.idx ? 'cur' : ''}" data-rp-go="${i}" title="${esc(x.t)}"></i>`).join('')}</div>
    <div class="rp-stage" data-rp-stage>
      <div class="rp-ring"><svg viewBox="0 0 200 200" aria-hidden="true"><circle cx="100" cy="100" r="${RING_R}" class="bg"/><circle cx="100" cy="100" r="${RING_R}" class="fg" data-rp-ring stroke-dasharray="${RING_C}" stroke-dashoffset="${RING_C}"/></svg>
        <div class="rp-time"><b data-rp-clock>00:00</b><span data-rp-sub>${s0.min ? `von ${s0.min}:00` : 'Stoppuhr'}</span></div></div>
      <h2 class="rp-title">${esc(s0.t)}</h2>
      ${s0.body ? `<div class="rp-body">${esc(s0.body).replace(/\n/g, '<br>')}</div>` : ''}
      ${img ? `<img class="rp-img" src="${esc(img)}" alt="">` : ''}
      ${link ? `<a class="btn sm" href="${esc(link)}" target="_blank" rel="noopener">${icon('open', 13)}Link öffnen</a>` : ''}
      ${steps[st.idx + 1] ? `<div class="rp-next tiny">Danach: ${esc(steps[st.idx + 1].t)}${steps[st.idx + 1].min ? ` · ${steps[st.idx + 1].min} Min` : ''}</div>` : '<div class="rp-next tiny">Letzter Schritt</div>'}
    </div>
    <footer class="rp-ctl">
      <button class="icon-btn lg" data-rp="prev" aria-label="Vorheriger Schritt" ${st.idx === 0 ? 'disabled' : ''}>${icon('left', 22)}</button>
      <button class="icon-btn lg" data-rp="pause" aria-label="Pause">${icon(st.pausedAt ? 'play' : 'pause', 22)}</button>
      <button class="btn btn-primary rp-done" data-rp="done">${icon('check', 18)}${st.done.has(s0.id) ? 'Weiter' : 'Schritt fertig'}</button>
      <button class="icon-btn lg" data-rp="skip" aria-label="Überspringen" title="Überspringen">${icon('right', 22)}</button>
    </footer>
  </div>`;
}

function finishHtml() {
  const h = st.h; const steps = stepsOf(h);
  const dur = st.finalDur || 0;
  const pm = plannedMin(h) * 60;
  const streak = C.habitStreak(S.get('habits', h.id) || h, new Date());
  return `<div class="rp-intro rp-fin">
    <div class="rp-badge">${icon('check', 40)}</div>
    <h1>Geschafft!</h1>
    <div class="rp-meta">${esc(h.title)} · ${st.done.size}/${steps.length} Schritte · ${esc(fmtClock(dur))}${pm ? ` (geplant ${esc(fmtClock(pm))})` : ''}</div>
    ${streak > 1 ? `<p class="rp-why">${streak} Tage in Folge – weiter so.</p>` : ''}
    <div class="rp-cta"><button class="btn btn-primary" data-rp="close">Fertig</button></div>
  </div>`;
}

function draw() {
  if (!st) return;
  const el = st.el;
  el.innerHTML = `<div class="rp">${st.phase === 'intro' ? introHtml() : st.phase === 'fin' ? finishHtml() : runHtml()}</div>`;
  tick();
}

function tick() {
  if (!st || st.phase !== 'run') return;
  const el = st.el;
  const s0 = stepsOf(st.h)[st.idx]; if (!s0) return;
  const sec = elapsedStep();
  const plan = (Number(s0.min) || 0) * 60;
  const clock = el.querySelector('[data-rp-clock]');
  const ring = el.querySelector('[data-rp-ring]');
  if (plan) {
    const left = plan - sec;
    clock.textContent = left >= 0 ? fmtClock(left) : '+' + fmtClock(-left);
    clock.classList.toggle('over', left < 0);
    ring.setAttribute('stroke-dashoffset', String(RING_C * Math.max(0, 1 - Math.min(1, sec / plan))));
    if (left < 0 && !st.alerted) { st.alerted = true; if (S.local.sound) chime('soft'); vibrate([60, 60, 60]); }
  } else {
    clock.textContent = fmtClock(sec);
    ring.setAttribute('stroke-dashoffset', String(RING_C * (1 - ((sec % 60) / 60))));
  }
  const tot = el.querySelector('[data-rp-total]');
  if (tot) { const pm = plannedMin(st.h); tot.textContent = `Gesamt ${fmtClock(elapsedTotal())}${pm ? ' / ' + fmtClock(pm * 60) : ''}${st.pausedAt ? ' · pausiert' : ''}`; }
  el.classList.toggle('paused', !!st.pausedAt);
}

function startRun() {
  st.phase = 'run';
  st.started = now(); st.totalPaused = 0;
  st.stepStart = now(); st.pausedMs = 0; st.pausedAt = 0; st.alerted = false;
  clearInterval(st.timer);
  st.timer = setInterval(tick, 250);
  draw();
}

function goStep(i) {
  const steps = stepsOf(st.h);
  if (i < 0 || i >= steps.length) return;
  if (st.pausedAt) { st.totalPaused += now() - st.pausedAt; st.pausedAt = 0; }
  st.idx = i; st.stepStart = now(); st.pausedMs = 0; st.alerted = false;
  draw();
  const stage = st.el.querySelector('[data-rp-stage]'); if (stage && !reducedMotion()) { stage.classList.add('enter'); }
}

function stepDone(btn) {
  const steps = stepsOf(st.h); const s0 = steps[st.idx];
  if (!s0) return;
  const was = st.done.has(s0.id);
  st.done.add(s0.id);
  if (!was) { saveDone(); burst(btn, 'var(--rp, var(--accent))'); vibrate(10); if (S.local.sound) chime('done'); }
  const next = steps.findIndex((x, i) => i > st.idx && !st.done.has(x.id));
  const anyOpen = steps.findIndex(x => !st.done.has(x.id));
  if (next >= 0) goStep(next);
  else if (anyOpen >= 0) goStep(anyOpen);
  else finish();
}

function finish() {
  clearInterval(st.timer);
  const dur = Math.round(elapsedTotal());
  st.finalDur = dur;
  const cur = S.get('habits', st.h.id);
  if (cur) {
    const runs = [...(cur.runs || []), { d: st.k, at: Date.now(), dur, steps: st.done.size }].slice(-200);
    const log = { ...(cur.log || {}) }; log[st.k] = stepsOf(cur).map(x => x.id);
    S.put('habits', { ...cur, log, runs }, { noRender: true });
  }
  st.phase = 'fin';
  draw();
  if (!reducedMotion()) burst(st.el.querySelector('.rp-badge'), 'var(--rp, var(--accent))');
}

function togglePause() {
  if (st.phase !== 'run') return;
  if (st.pausedAt) { const d = now() - st.pausedAt; st.pausedMs += d; st.totalPaused += d; st.pausedAt = 0; }
  else st.pausedAt = now();
  const b = st.el.querySelector('[data-rp="pause"]'); if (b) b.innerHTML = icon(st.pausedAt ? 'play' : 'pause', 22);
  tick();
}

function quickCheck() {
  const steps = stepsOf(st.h);
  const prev = new Set(st.done);
  steps.forEach(x => st.done.add(x.id));
  saveDone();
  const id = st.h.id, k = st.k;
  close(true);
  A.render();
  toast('Routine abgehakt', { action: 'Rückgängig', onAction: () => { const cur = S.get('habits', id); if (!cur) return; const log = { ...(cur.log || {}) }; if (prev.size) log[k] = [...prev]; else delete log[k]; S.put('habits', { ...cur, log }); } });
}

function onClick(e) {
  if (!st) return;
  const go = e.target.closest('[data-rp-go]');
  if (go && st.phase === 'run') { goStep(Number(go.dataset.rpGo)); return; }
  const b = e.target.closest('[data-rp]'); if (!b) return;
  const a = b.dataset.rp;
  if (a === 'close') close();
  else if (a === 'start') startRun();
  else if (a === 'quick') quickCheck();
  else if (a === 'done') stepDone(b);
  else if (a === 'skip') { const n = st.idx + 1; if (n < stepsOf(st.h).length) goStep(n); else if (st.done.size) finish(); }
  else if (a === 'prev') goStep(st.idx - 1);
  else if (a === 'pause') togglePause();
}

function onKey(e) {
  if (!st) return;
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
  if (/input|textarea/i.test((e.target && e.target.tagName) || '')) return;
  if (st.phase === 'intro' && e.key === 'Enter') { e.preventDefault(); startRun(); return; }
  if (st.phase === 'fin' && e.key === 'Enter') { e.preventDefault(); close(); return; }
  if (st.phase !== 'run') return;
  if (e.key === ' ') { e.preventDefault(); togglePause(); }
  else if (e.key === 'Enter' || e.key === 'ArrowRight') { e.preventDefault(); stepDone(st.el.querySelector('[data-rp="done"]')); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); goStep(st.idx - 1); }
}

export function isOpen() { return !!st; }
