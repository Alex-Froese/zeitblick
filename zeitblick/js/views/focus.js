// Fokus – eigene Fokus-App im Stil von Forest, ohne Bäume: ein lebendiger Fokus-Kern lädt sich auf
import * as C from '../core.js';
import * as S from '../store.js';
import * as F from '../focus-engine.js';
import { esc, icon, popover, closePopover, confirmDialog, reducedMotion, toast } from '../ui.js';
import { A } from '../app-api.js';
import { SOUNDS, startNoise, stopNoise } from '../audio.js';
import { columns, shareBar, hours24 } from '../charts.js';
import { catColor, gemSvg, sortTasks } from './common.js';

let raf = 0;
let fullscreen = false;
let dialMin = null;
let anim = { t0: performance.now(), burst: 0, crack: 0, lastP: 0 };

function curColor() {
  const r = F.run();
  const catId = r ? r.cat : (F.prefs.taskId ? (S.task(F.prefs.taskId) || {}).cat : F.prefs.cat);
  const c = catId ? S.cat(catId) : null;
  if (r && r.kind === 'break') return A.theme() === 'night' ? 'hsl(30 70% 45%)' : '#1baf7a';
  if (c) return catColor(c);
  const th = A.theme();
  return th === 'night' ? 'hsl(16 85% 52%)' : th === 'dark' ? '#3987e5' : '#2a78d6';
}

function fmtClock(ms) {
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return h ? `${h}:${C.pad(m)}:${C.pad(x)}` : `${C.pad(m)}:${C.pad(x)}`;
}

function planMin() { return dialMin ?? F.prefs.min ?? S.settings().focus.len; }

function taskButton() {
  const t = F.prefs.taskId ? S.task(F.prefs.taskId) : null;
  if (t) {
    const c = S.cat(t.cat);
    return `<button class="focus-task" data-fx="pick">${c ? `<span style="font-size:20px">${esc(c.icon || '')}</span>` : icon('list', 20)}<span class="grow"><b class="ellip">${esc(t.title)}</b><span>${c ? esc(c.name) + ', ' : ''}Aufgabe ändern</span></span>${icon('down', 16)}</button>`;
  }
  const c = F.prefs.cat ? S.cat(F.prefs.cat) : null;
  return `<button class="focus-task" data-fx="pick">${icon('list', 20)}<span class="grow"><b>Ohne Aufgabe</b><span>${c ? `${esc(c.icon || '')} ${esc(c.name)}` : 'Aufgabe oder Kategorie wählen'}</span></span>${icon('down', 16)}</button>`;
}

function sidePanel() {
  const r = F.run();
  const s = S.settings();
  const res = F.lastResult;
  if (r) {
    const paused = r.paused;
    return `<div><div class="lbl" style="margin-bottom:6px">${r.kind === 'break' ? 'Pause' : 'Fokus läuft'}</div>
      ${r.title ? `<div style="font-weight:700;font-family:var(--font-head);font-size:17px;line-height:1.3">${esc(r.title)}</div>` : ''}
      <div class="small muted" style="margin-top:4px">${r.mode === 'stopwatch' ? 'Stoppuhr' : `${r.plan} Min geplant`}${r.strict ? ', strenger Modus' : ''}</div></div>
      ${r.strict ? `<div class="banner warn small" style="margin:0">${icon('alert', 16)}<span>Strenger Modus: Wenn du die App länger als ${Math.round(F.STRICT_GRACE / 1000)} Sekunden verlässt, zerbricht dein Kristall.</span></div>` : ''}
      <div class="focus-actions">
        ${!r.strict ? `<button class="btn" data-fx="${paused ? 'resume' : 'pause'}">${icon(paused ? 'play' : 'pause', 16)}${paused ? 'Weiter' : 'Pause'}</button>` : ''}
        ${r.mode !== 'stopwatch' ? `<button class="btn" data-fx="extend">+5 Min</button>` : `<button class="btn btn-primary" data-fx="stopwatch">${icon('stop', 14)}Beenden</button>`}
      </div>
      <div class="focus-actions">
        <button class="btn btn-ghost" data-fx="full">${icon('expand', 16)}Vollbild</button>
        <button class="btn btn-ghost" data-fx="giveup" style="color:var(--bad)">${icon('x', 16)}${r.kind === 'break' ? 'Pause beenden' : 'Aufgeben'}</button>
      </div>
      <div class="field" style="margin:0"><label>${icon('sound', 15)}Klang</label>
        <div class="chips">${SOUNDS.map(x => `<button class="chip ${(F.prefs.sound || s.focus.sound) === x.id ? 'on' : ''}" data-snd="${x.id}">${x.name}</button>`).join('')}</div></div>`;
  }
  if (res) {
    const t = res.taskId ? S.task(res.taskId) : null;
    const c = res.cat ? S.cat(res.cat) : null;
    const col = c ? catColor(c) : 'var(--accent)';
    return `<div class="focus-done-card">
      <div class="gem-big">${gemSvg(res.ok ? col : '#9aa3ab', 96, !res.ok)}</div>
      <h2>${res.ok ? (res.kind === 'break' ? 'Pause vorbei' : 'Kristall gesammelt') : 'Kristall zerbrochen'}</h2>
      <p class="muted small" style="margin-top:4px">${res.ok ? `${esc(C.fmtDuration(res.min))} konzentriert gearbeitet.` : `${res.reason ? esc(res.reason) + '. ' : ''}Nach ${esc(C.fmtDuration(res.min))} abgebrochen. Beim nächsten Mal klappt’s.`}</p>
      </div>
      ${res.ok && t && !t.done ? `<button class="btn btn-primary" data-fx="donetask" style="width:100%">${icon('check', 16)}„${esc(t.title.length > 30 ? t.title.slice(0, 30) + '…' : t.title)}“ erledigt</button>` : ''}
      <div class="focus-actions">
        ${res.kind !== 'break' ? `<button class="btn" data-fx="break">☕ ${s.focus.brk} Min Pause</button>` : ''}
        <button class="btn" data-fx="again">${icon('repeat', 15)}Nochmal</button>
      </div>
      <button class="btn btn-ghost" data-fx="reset">Neue Einheit einstellen</button>`;
  }
  const m = planMin();
  return `<div class="field" style="margin:0"><label>Woran arbeitest du?</label>${taskButton()}</div>
    <div class="field" style="margin:0"><label>Dauer</label>
      <div class="presets">${[15, 25, 45, 60, 90, 120].map(x => `<button data-preset="${x}" class="${m === x ? 'on' : ''}">${x}</button>`).join('')}<button data-fx="mode" class="${F.prefs.mode === 'stopwatch' ? 'on' : ''}" style="grid-column:span 2">⏱ Stoppuhr</button></div>
      <span class="hint">Oder am Ring drehen.</span></div>
    <label class="switch small"><input type="checkbox" data-fx="strict" ${s.focus.strict ? 'checked' : ''}><span class="tr"></span>Strenger Modus (App nicht verlassen)</label>
    <div class="field" style="margin:0"><label>${icon('sound', 15)}Klang</label>
      <div class="chips">${SOUNDS.map(x => `<button class="chip ${(F.prefs.sound || s.focus.sound) === x.id ? 'on' : ''}" data-snd="${x.id}">${x.name}</button>`).join('')}</div></div>
    <button class="btn-start" data-fx="start">${icon('play', 20)}Fokus starten</button>`;
}

function orbCenter() {
  const r = F.run();
  const res = F.lastResult;
  if (r) {
    const ms = r.mode === 'stopwatch' ? F.elapsedMs(r) : F.remainingMs(r);
    return `<div><div class="orb-time" data-fclock>${fmtClock(ms)}</div><div class="orb-sub">${esc(r.title || (r.kind === 'break' ? 'Durchatmen' : 'Fokus'))}</div><div class="orb-state" data-fstate>${r.paused ? 'Pausiert' : r.kind === 'break' ? 'Pause' : 'Bleib dran'}</div></div>`;
  }
  if (res) return `<div><div class="orb-time">${res.ok ? '✓' : '✕'}</div><div class="orb-state">${res.ok ? 'Geschafft' : 'Abgebrochen'}</div></div>`;
  const m = F.prefs.mode === 'stopwatch' ? null : planMin();
  return `<div><div class="orb-time" data-fclock>${m ? `${m}:00` : '00:00'}</div><div class="orb-state">${m ? 'Minuten Fokus' : 'Stoppuhr'}</div></div>`;
}

function statsHtml() {
  const now = A.now();
  const area = A.area();
  const st = F.stats(now, area);
  const days14 = C.focusMinutesByDay(S.getData().focus, 14, now, f => S.inArea(f, area));
  const cut30 = now.getTime() - 30 * C.DAY;
  const byCat = new Map();
  for (const f of st.list) if (f.ok && f.s > cut30) byCat.set(f.cat || '', (byCat.get(f.cat || '') || 0) + Math.round(f.min || 0));
  const segs = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
  const top = segs.slice(0, 6), rest = segs.slice(6).reduce((a, x) => a + x[1], 0);
  const segData = top.map(([id, v]) => { const c = S.cat(id); return { label: c ? `${c.icon || ''} ${c.name}` : 'Ohne Kategorie', v, color: c ? catColor(c) : 'var(--q4)' }; });
  if (rest) segData.push({ label: 'Weitere', v: rest, color: 'var(--line-2)' });
  // Sammlung der letzten 7 Tage
  let coll = '';
  for (let i = 0; i < 7; i++) {
    const d = C.addDays(C.startOfDay(now), -i);
    const k = C.ymd(d);
    const list = st.list.filter(f => C.ymd(new Date(f.s)) === k).sort((a, b) => a.s - b.s);
    const mins = list.filter(f => f.ok).reduce((a, f) => a + (f.min || 0), 0);
    coll += `<div class="gems-day"><div class="gd">${i === 0 ? 'Heute' : i === 1 ? 'Gestern' : C.WD_LONG[C.wdIdx(d)]}<span>${mins ? C.fmtDuration(mins) : 'Kein Fokus'}</span></div>
      <div class="gems">${list.length ? list.map(f => { const c = S.cat(f.cat); const t = f.taskId ? S.task(f.taskId) : null; const sz = f.min >= 50 ? 26 : f.min >= 25 ? 22 : 17; return `<span class="gem ${f.ok ? '' : 'broken'}" data-tip="${esc(`${C.hm(new Date(f.s))} Uhr, ${Math.round(f.min)} Min${t ? ', ' + t.title : c ? ', ' + c.name : ''}${f.ok ? '' : ' (abgebrochen)'}`)}">${gemSvg(c ? catColor(c) : '#7d8791', sz, !f.ok)}</span>`; }).join('') : '<span class="tiny muted">–</span>'}</div></div>`;
  }
  return `<div class="kpis" style="margin:16px 0">
      <div class="kpi"><span class="k-l">Heute</span><span class="k-v">${esc(C.fmtDurShort(st.todayMin))}</span><span class="k-s">Fokuszeit</span></div>
      <div class="kpi"><span class="k-l">Diese Woche</span><span class="k-v">${esc(C.fmtDurShort(st.weekMin))}</span><span class="k-s">seit Montag</span></div>
      <div class="kpi"><span class="k-l">Serie</span><span class="k-v">${st.streak} ${st.streak === 1 ? 'Tag' : 'Tage'}</span><span class="k-s">am Stück fokussiert</span></div>
      <div class="kpi"><span class="k-l">Kristalle</span><span class="k-v">${st.total}</span><span class="k-s">${st.failed} zerbrochen</span></div>
      <div class="kpi"><span class="k-l">Erfolgsquote</span><span class="k-v">${st.total + st.failed ? Math.round(st.total / (st.total + st.failed) * 100) : 0} %</span><span class="k-s">abgeschlossen</span></div>
    </div>
    <div class="dgrid">
      <section class="panel c7"><div class="panel-head"><h2>Deine Kristall-Sammlung</h2><span class="small muted">letzte 7 Tage</span></div>${coll}</section>
      <section class="panel c5"><div class="panel-head"><h2>Fokus nach Kategorie</h2><span class="small muted">30 Tage</span></div>${shareBar(segData, { unit: ' Min' })}
        <div class="panel-head" style="margin-top:18px"><h2>Wann du dich fokussierst</h2></div>${hours24(st.hours)}</section>
      <section class="panel c12"><div class="panel-head"><h2>Fokuszeit, 14 Tage</h2></div>${columns(days14.map(d => ({ label: String(d.d.getDate()), v: d.v, tip: `${C.fmtDateShort(d.d)}: ${C.fmtDuration(d.v)}` })), { highlight: 13, unit: ' Min', fmt: v => C.fmtDurShort(v), minMax: 60, ariaLabel: 'Fokusminuten pro Tag' })}</section>
    </div>`;
}

export function render(route) {
  const q = route.params || {};
  if (q.task && S.task(q.task)) { F.prefs.taskId = q.task; F.prefs.cat = S.task(q.task).cat; }
  const col = curColor();
  return `<div class="focus-wrap ${fullscreen ? 'focus-full' : ''}" style="--fc:${col}">
    <div class="page-head" ${fullscreen ? 'style="display:none"' : ''}><div class="grow"><h1>Fokus</h1><div class="page-sub">Lade deinen Fokus-Kern auf. Bleib dran, bis er vollständig leuchtet.</div></div></div>
    <div class="focus-stage">
      ${fullscreen ? `<button class="icon-btn exit-full" data-fx="exitfull" aria-label="Vollbild verlassen">${icon('x', 22)}</button>` : ''}
      <div class="orb-zone">
        <canvas data-orb class="${!F.run() && !F.lastResult && F.prefs.mode !== 'stopwatch' ? 'dial' : ''}" role="img" aria-label="Fokus-Kern${!F.run() && !F.lastResult ? ', am Ring drehen, um die Dauer einzustellen' : ''}"></canvas>
        <div class="orb-center" aria-live="polite">${orbCenter()}</div>
      </div>
      <aside class="focus-side">${sidePanel()}</aside>
    </div>
    ${fullscreen ? '' : statsHtml()}
  </div>`;
}

function taskPicker(anchor) {
  const now = A.now();
  const s = S.settings();
  const list = sortTasks(S.tasks(t => !t.done && S.inArea(t)), now).sort((a, b) => C.quadrant(a, now, s) - C.quadrant(b, now, s)).slice(0, 60);
  const cats = S.cats(A.area());
  const html = `<div>
    <input class="input" data-tsearch placeholder="Aufgabe suchen" style="margin-bottom:8px">
    <div class="menu" data-tlist style="max-height:300px;overflow:auto;margin:0 -6px">
      ${list.map(t => { const q = C.quadrant(t, now, s); return `<button data-pick="${t.id}" data-title="${esc(t.title.toLowerCase())}"><span class="amp" style="background:var(--q${q})"></span><span class="grow ellip">${esc(t.title)}</span></button>`; }).join('') || '<div class="small muted" style="padding:8px">Keine offenen Aufgaben.</div>'}
    </div>
    <div class="lbl" style="margin:12px 0 6px">Oder nur eine Kategorie</div>
    <div class="chips"><button class="chip" data-pickcat="">Ohne</button>${cats.map(c => `<button class="chip ${F.prefs.cat === c.id && !F.prefs.taskId ? 'on' : ''}" data-pickcat="${c.id}">${esc(c.icon || '')} ${esc(c.name)}</button>`).join('')}</div>
  </div>`;
  popover(anchor, html, {
    width: 340, place: 'below',
    onMount: (el, close) => {
      const si = el.querySelector('[data-tsearch]');
      si.addEventListener('input', () => { const q = si.value.toLowerCase(); el.querySelectorAll('[data-pick]').forEach(b => b.style.display = b.dataset.title.includes(q) ? '' : 'none'); });
      el.addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.pick) { F.prefs.taskId = b.dataset.pick; F.prefs.cat = (S.task(b.dataset.pick) || {}).cat || null; close(); A.render(); }
        if (b.dataset.pickcat !== undefined) { F.prefs.taskId = null; F.prefs.cat = b.dataset.pickcat || null; close(); A.render(); }
      });
    },
  });
}

/* ---------------- Canvas: der Fokus-Kern ---------------- */
function readVars() {
  const cs = getComputedStyle(document.body);
  return { surface: cs.getPropertyValue('--surface').trim(), line: cs.getPropertyValue('--line').trim(), line2: cs.getPropertyValue('--line-2').trim(), ink: cs.getPropertyValue('--ink').trim(), muted: cs.getPropertyValue('--muted').trim(), bad: cs.getPropertyValue('--bad').trim() };
}
function toRgb(color) {
  const c = document.createElement('canvas').getContext('2d');
  c.fillStyle = '#000'; c.fillStyle = color;
  const v = c.fillStyle;
  if (v.startsWith('#')) { const n = parseInt(v.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  const m = v.match(/[\d.]+/g); return m ? m.slice(0, 3).map(Number) : [80, 100, 120];
}
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t].map(Math.round);

let particles = [];
function initParticles(n = 28) {
  particles = [];
  for (let i = 0; i < n; i++) particles.push({ a: Math.random() * Math.PI * 2, r: 0.55 + Math.random() * 0.45, sp: (0.08 + Math.random() * 0.22) * (Math.random() < 0.5 ? 1 : -1), sz: 0.6 + Math.random() * 1.6, ph: Math.random() * 6 });
}

function draw(cv, vars, colRgb, now) {
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height, dpr = cv._dpr || 1;
  const cx = W / 2, cy = H / 2;
  const R = Math.min(W, H) * 0.44;
  const t = (now - anim.t0) / 1000;
  const r = F.run();
  const res = F.lastResult;
  const reduce = reducedMotion();
  ctx.clearRect(0, 0, W, H);
  const lineRgb = toRgbCached(vars.line2);
  let p;
  if (r) p = F.progress(r);
  else if (res) p = 1;
  else p = F.prefs.mode === 'stopwatch' ? 0 : planMin() / 120;

  // Ticks
  const ticks = 60;
  for (let i = 0; i < ticks; i++) {
    const a = -Math.PI / 2 + (i / ticks) * Math.PI * 2;
    const major = i % 5 === 0;
    const on = (i / ticks) < p - 1e-6;
    const r1 = R + (major ? 0 : 4 * dpr), r2 = R + 12 * dpr;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
    ctx.strokeStyle = on ? rgba(colRgb, major ? 1 : 0.75) : rgba(lineRgb, major ? 1 : 0.8);
    ctx.lineWidth = (major ? 2.4 : 1.4) * dpr;
    ctx.lineCap = 'round';
    ctx.stroke();
  }
  // Fortschrittsbogen
  ctx.beginPath();
  ctx.arc(cx, cy, R - 10 * dpr, 0, Math.PI * 2);
  ctx.strokeStyle = rgba(lineRgb, 0.45);
  ctx.lineWidth = 3 * dpr;
  ctx.stroke();
  if (p > 0) {
    ctx.save();
    ctx.shadowColor = rgba(colRgb, 0.55);
    ctx.shadowBlur = 16 * dpr;
    ctx.beginPath();
    ctx.arc(cx, cy, R - 10 * dpr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, p));
    ctx.strokeStyle = rgba(colRgb, 1);
    ctx.lineWidth = 6 * dpr;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.restore();
    // Griff
    const ha = -Math.PI / 2 + Math.PI * 2 * Math.min(1, p);
    ctx.beginPath();
    ctx.arc(cx + Math.cos(ha) * (R - 10 * dpr), cy + Math.sin(ha) * (R - 10 * dpr), (r ? 6 : 10) * dpr, 0, Math.PI * 2);
    ctx.fillStyle = toCss(vars.surface);
    ctx.fill();
    ctx.lineWidth = 3 * dpr; ctx.strokeStyle = rgba(colRgb, 1); ctx.stroke();
  }

  // Kern
  const running = r && !r.paused;
  const ease = x => 1 - Math.pow(1 - x, 2.2);
  const prog = r ? F.progress(r) : res ? 1 : 0;
  let rad = R * (0.36 + 0.42 * ease(prog));
  const breath = reduce ? 0 : Math.sin(t * (running ? 1.6 : 0.9)) * (running ? 0.012 : 0.025);
  rad *= 1 + breath;
  let core = colRgb;
  if (res && !res.ok) core = mixc(colRgb, [150, 155, 160], 0.75);
  if (r && r.paused) core = mixc(colRgb, [150, 155, 160], 0.45);
  // Glühen
  const glow = ctx.createRadialGradient(cx, cy, rad * 0.6, cx, cy, rad * 1.7);
  glow.addColorStop(0, rgba(core, running ? 0.35 : 0.22));
  glow.addColorStop(1, rgba(core, 0));
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(cx, cy, rad * 1.7, 0, Math.PI * 2); ctx.fill();
  // flüssige Form
  ctx.beginPath();
  const N = 72;
  const wob = reduce ? 0 : (running ? 0.03 : 0.02);
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    const k = 1 + wob * Math.sin(a * 3 + t * 1.3) + wob * 0.7 * Math.sin(a * 5 - t * 0.9) + wob * 0.4 * Math.sin(a * 2 + t * 2.1);
    const x = cx + Math.cos(a) * rad * k, y = cy + Math.sin(a) * rad * k;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  const g = ctx.createRadialGradient(cx - rad * 0.35, cy - rad * 0.4, rad * 0.05, cx, cy, rad * 1.05);
  g.addColorStop(0, rgba(mixc(core, [255, 255, 255], 0.55), 0.95));
  g.addColorStop(0.45, rgba(core, 0.92));
  g.addColorStop(1, rgba(mixc(core, [0, 0, 0], 0.35), 0.95));
  ctx.fillStyle = g;
  ctx.fill();
  // innere Strömung
  if (!reduce) {
    ctx.save();
    ctx.clip();
    for (let j = 0; j < 3; j++) {
      ctx.beginPath();
      const rr = rad * (0.35 + j * 0.22);
      const st0 = t * (0.5 + j * 0.25) * (j % 2 ? -1 : 1);
      ctx.arc(cx, cy + rad * 0.08, rr, st0, st0 + Math.PI * (0.6 + 0.3 * j));
      ctx.strokeStyle = `rgba(255,255,255,${0.12 - j * 0.03})`;
      ctx.lineWidth = rad * 0.09;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
    ctx.restore();
  }
  // Glanzpunkt
  ctx.beginPath();
  ctx.ellipse(cx - rad * 0.33, cy - rad * 0.42, rad * 0.22, rad * 0.12, -0.6, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,.28)';
  ctx.fill();

  // Teilchen (werden während des Fokus eingesogen)
  if (!reduce) {
    for (const q of particles) {
      q.a += q.sp * 0.016 * (running ? 1.6 : 0.6);
      if (running) { q.r -= 0.0009; if (q.r < 0.40 + 0.38 * ease(prog)) { q.r = 0.95 + Math.random() * 0.1; q.a = Math.random() * Math.PI * 2; } }
      const pr = R * q.r * (0.98 + 0.02 * Math.sin(t + q.ph));
      const x = cx + Math.cos(q.a) * pr, y = cy + Math.sin(q.a) * pr;
      const alpha = running ? Math.min(0.8, Math.max(0, (q.r - 0.40 - 0.38 * ease(prog)) * 2.2)) : 0.35;
      ctx.beginPath(); ctx.arc(x, y, q.sz * dpr, 0, Math.PI * 2); ctx.fillStyle = rgba(core, alpha); ctx.fill();
    }
  }
  // Abschluss-Explosion
  if (anim.burst && !reduce) {
    const bt = (now - anim.burst) / 1000;
    if (bt < 1.6) {
      for (let k = 0; k < 3; k++) {
        const kt = bt - k * 0.18; if (kt <= 0) continue;
        ctx.beginPath(); ctx.arc(cx, cy, rad + kt * R * 0.9, 0, Math.PI * 2);
        ctx.strokeStyle = rgba(core, Math.max(0, 0.6 - kt * 0.45)); ctx.lineWidth = (6 - k * 1.5) * dpr; ctx.stroke();
      }
      for (let i = 0; i < 26; i++) {
        const a = (i / 26) * Math.PI * 2 + i;
        const d = rad + bt * R * (0.6 + (i % 5) * 0.12);
        ctx.beginPath(); ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, (2.5 - bt) * dpr, 0, Math.PI * 2);
        ctx.fillStyle = rgba(core, Math.max(0, 1 - bt * 0.7)); ctx.fill();
      }
    } else anim.burst = 0;
  }
  // Risse bei Abbruch
  if (res && !res.ok) {
    ctx.save();
    ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 2.2 * dpr; ctx.lineJoin = 'round';
    const cracks = [[[-0.1, -0.7], [0.05, -0.35], [-0.12, -0.05], [0.1, 0.25], [0, 0.6]], [[0.05, -0.35], [0.4, -0.2], [0.55, 0.1]], [[-0.12, -0.05], [-0.45, 0.1], [-0.6, 0.35]]];
    for (const cr of cracks) { ctx.beginPath(); cr.forEach(([x, y], i) => { const px = cx + x * rad, py = cy + y * rad; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }); ctx.stroke(); }
    ctx.restore();
  }
}
const rgbCache = new Map();
function toRgbCached(c) { if (!rgbCache.has(c)) rgbCache.set(c, toRgb(c)); return rgbCache.get(c); }
function toCss(c) { return c || '#fff'; }

function startLoop(root, signal) {
  cancelAnimationFrame(raf);
  const cv = root.querySelector('[data-orb]');
  if (!cv) return;
  const fit = () => {
    const rect = cv.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv._dpr = dpr;
    cv.width = Math.max(10, Math.round(rect.width * dpr));
    cv.height = Math.max(10, Math.round(rect.width * dpr));
  };
  fit();
  window.addEventListener('resize', fit, { signal });
  const vars = readVars();
  const colRgb = toRgb(curColor());
  if (!particles.length) initParticles();
  const clock = root.querySelector('[data-fclock]');
  let lastSec = -1;
  const loop = (ts) => {
    if (signal && signal.aborted) return;
    if (!document.body.contains(cv)) return;
    draw(cv, vars, colRgb, ts || performance.now());
    const r = F.run();
    if (r && clock) {
      const ms = r.mode === 'stopwatch' ? F.elapsedMs(r) : F.remainingMs(r);
      const sec = Math.ceil(ms / 1000);
      if (sec !== lastSec) { lastSec = sec; clock.textContent = fmtClock(ms); }
    }
    if (reducedMotion()) { raf = setTimeout(() => requestAnimationFrame(loop), 1000); return; }
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
}

export function onEngine(info) {
  if (info && info.completed) anim.burst = performance.now();
}

export function mount(root, ctx = {}) {
  const signal = ctx.signal;
  startLoop(root, signal);
  const cv = root.querySelector('[data-orb]');
  // Drehring zum Einstellen der Dauer
  if (cv && cv.classList.contains('dial')) {
    let drag = false;
    const setFrom = (e) => {
      const rect = cv.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2, y = e.clientY - rect.top - rect.height / 2;
      let a = Math.atan2(y, x) + Math.PI / 2; if (a < 0) a += Math.PI * 2;
      let m = Math.round((a / (Math.PI * 2)) * 120 / 5) * 5;
      m = Math.max(5, Math.min(120, m || 120));
      if (m !== dialMin) {
        dialMin = m; F.prefs.min = m;
        const clock = root.querySelector('[data-fclock]'); if (clock) clock.textContent = `${m}:00`;
        root.querySelectorAll('[data-preset]').forEach(b => b.classList.toggle('on', Number(b.dataset.preset) === m));
      }
    };
    cv.addEventListener('pointerdown', e => {
      const rect = cv.getBoundingClientRect();
      const d = Math.hypot(e.clientX - rect.left - rect.width / 2, e.clientY - rect.top - rect.height / 2);
      if (d < rect.width * 0.3) return;
      drag = true; cv.setPointerCapture(e.pointerId); setFrom(e);
    });
    cv.addEventListener('pointermove', e => { if (drag) setFrom(e); });
    cv.addEventListener('pointerup', () => { drag = false; });
    cv.addEventListener('pointercancel', () => { drag = false; });
  }

  root.addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b) return;
    const a = b.dataset.fx;
    if (b.dataset.preset) { dialMin = Number(b.dataset.preset); F.prefs.min = dialMin; F.prefs.mode = 'timer'; A.render(); return; }
    if (b.dataset.snd) {
      F.prefs.sound = b.dataset.snd; S.setSettingPath('focus.sound', b.dataset.snd);
      if (F.run() && F.run().kind === 'focus' && !F.run().paused) startNoise(b.dataset.snd); else if (b.dataset.snd === 'none') stopNoise();
      return;
    }
    if (!a) return;
    if (a === 'pick') return taskPicker(b);
    if (a === 'mode') { F.prefs.mode = F.prefs.mode === 'stopwatch' ? 'timer' : 'stopwatch'; A.render(); return; }
    if (a === 'start') { F.clearResult(); F.start({ min: planMin(), strict: S.settings().focus.strict }); return; }
    if (a === 'pause') return F.pause();
    if (a === 'resume') return F.resume();
    if (a === 'extend') { F.extend(5); toast('5 Minuten verlängert'); return; }
    if (a === 'stopwatch') return F.stopStopwatch();
    if (a === 'giveup') {
      const r = F.run();
      if (r && r.kind === 'break') { F.giveUp(); return; }
      if (await confirmDialog('Wenn du jetzt aufgibst, zerbricht dein Kristall. Die bisherige Zeit wird als abgebrochen gespeichert.', { ok: 'Aufgeben', danger: true, title: 'Fokus abbrechen?' })) F.giveUp('Aufgegeben');
      return;
    }
    if (a === 'full') { fullscreen = true; try { await document.documentElement.requestFullscreen(); } catch { } A.render(); return; }
    if (a === 'exitfull') { fullscreen = false; try { if (document.fullscreenElement) await document.exitFullscreen(); } catch { } A.render(); return; }
    if (a === 'break') { F.start({ kind: 'break' }); return; }
    if (a === 'again') { const res = F.lastResult; F.clearResult(); F.start({ taskId: res ? res.taskId : F.prefs.taskId, cat: res ? res.cat : F.prefs.cat, min: planMin() }); return; }
    if (a === 'reset') { F.clearResult(); A.render(); return; }
    if (a === 'donetask') { const res = F.lastResult; if (res && res.taskId) A.toggleDone(res.taskId, b); F.prefs.taskId = null; return; }
  });
  root.addEventListener('change', e => {
    if (e.target.dataset.fx === 'strict') S.setSettingPath('focus.strict', e.target.checked);
  });
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && fullscreen) { fullscreen = false; A.render(); } }, { signal });
  void closePopover;
}
