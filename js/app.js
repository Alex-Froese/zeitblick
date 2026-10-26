// Zeitblick – App-Steuerung: Start, Navigation, Shell, globale Aktionen
import * as C from './core.js';
import * as S from './store.js';
import * as SY from './sync.js';
import * as N from './notify.js';
import * as O from './obsidian.js';
import * as F from './focus-engine.js';
import { esc, icon, toast, sheet, popover, closePopover, topSheet, closeAllSheets, initTooltips, burst, isMobile } from './ui.js';
import { chime, vibrate } from './audio.js';
import { A } from './app-api.js';
import { openTaskEditor, openEventEditor, placeThumb } from './editors.js';
import * as Dash from './views/dashboard.js';
import * as Cal from './views/calendar.js';
import * as Mx from './views/matrix.js';
import * as Tk from './views/tasks.js';
import * as Fo from './views/focus.js';
import * as Ti from './views/tickets.js';
import * as Ca from './views/category.js';
import * as Se from './views/settings.js';
import { seedDemo, removeDemo, hasDemo } from './demo.js';

const VIEWS = { start: Dash, kalender: Cal, matrix: Mx, aufgaben: Tk, fokus: Fo, tickets: Ti, kategorie: Ca, einstellungen: Se };
const FULL = new Set(['kalender']);
const NAV = [
  ['start', 'Start', 'home', '#/start'],
  ['kalender', 'Kalender', 'calendar', '#/kalender'],
  ['matrix', 'Matrix', 'matrix', '#/matrix'],
  ['aufgaben', 'Aufgaben', 'list', '#/aufgaben'],
  ['fokus', 'Fokus', 'focus', '#/fokus'],
  ['tickets', 'Ampel', 'ampel', '#/tickets'],
];

let viewAbort = null;
let renderQueued = false;
let pendingAfterDrag = false;
let lastMinute = -1;

/* ---------------- Routing ---------------- */
function parseRoute() {
  const h = (location.hash || '#/start').replace(/^#\/?/, '');
  const [path, qs] = h.split('?');
  const parts = path.split('/').filter(Boolean);
  const name = VIEWS[parts[0]] ? parts[0] : 'start';
  const params = Object.fromEntries(new URLSearchParams(qs || ''));
  return { name, parts: parts.slice(1), params };
}
A.nav = (hash) => { closePopover(); if (location.hash === hash) render(); else location.hash = hash; };
A.render = () => scheduleRender();
A.area = () => S.local.area || 'all';
A.now = () => new Date();
A.theme = () => document.documentElement.dataset.theme || 'light';
A.openTask = (id) => openTaskEditor(id);
A.newTask = (preset = {}) => openTaskEditor(null, preset);
A.openEvent = (id, occ) => openEventEditor(id, {}, occ || null);
A.newEvent = (preset = {}) => {
  const now = new Date();
  const st = C.setTime(now, `${Math.min(22, now.getHours() + 1)}:00`);
  openEventEditor(null, { s: C.fmtLocal(st), e: C.fmtLocal(C.addMinutes(st, 60)), ...preset });
};
A.dragging = false;
A.preview = (() => { try { return window.top !== window.self; } catch { return true; } })();

/* ---------------- Thema ---------------- */
function resolveTheme() {
  const t = S.local.theme || 'auto';
  const h = new Date().getHours();
  if (S.local.nightAuto && (h >= 21 || h < 6)) return 'night';
  if (t === 'auto') return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  return t;
}
A.applyTheme = () => {
  const t = resolveTheme();
  const changed = document.documentElement.dataset.theme !== t;
  document.documentElement.dataset.theme = t;
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute('content', t === 'dark' ? '#1a2027' : t === 'night' ? '#160806' : '#ffffff');
  return changed;
};
function cycleTheme() {
  const order = ['light', 'dark', 'night', 'auto'];
  const i = order.indexOf(S.local.theme || 'auto');
  S.local.theme = order[(i + 1) % order.length];
  S.saveLocal();
  A.applyTheme();
  const names = { light: 'Hell', dark: 'Dunkel', night: 'Nacht (Rotlicht)', auto: 'Wie System' };
  toast(`Farbmodus: ${names[S.local.theme]}`, { ms: 1800 });
  render();
}
function themeIcon() { const t = S.local.theme || 'auto'; return t === 'light' ? 'sun' : t === 'dark' ? 'moon' : t === 'night' ? 'night' : 'auto'; }

/* ---------------- Shell ---------------- */
function shellHtml() {
  return `
  <header class="topbar">
    <a class="brand" href="#/start" aria-label="Zeitblick Start">
      <svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true"><rect x="1" y="1" width="30" height="30" rx="9" fill="var(--accent)"/><circle cx="16" cy="16" r="8.5" fill="none" stroke="var(--accent-ink)" stroke-width="2.4"/><path d="M16 10.5V16l3.6 2.2" fill="none" stroke="var(--accent-ink)" stroke-width="2.4" stroke-linecap="round"/></svg>
      <b>Zeitblick</b>
    </a>
    <div class="seg seg-area" id="areaSeg" role="group" aria-label="Bereich">
      <span class="seg-thumb"></span>
      <button data-setarea="p"><span class="dotp"></span>Privat</button>
      <button data-setarea="all">Alles</button>
      <button data-setarea="b"><span class="dotb"></span>Geschäftlich</button>
    </div>
    <div class="top-right">
      <span id="focusMini"></span>
      <button class="icon-btn hide-m" id="syncBtn" aria-label="Sync-Status" title="Sync"><span class="sync-dot off" id="syncDot"></span></button>
      <button class="icon-btn hide-m" data-global="search" aria-label="Suchen (/)" title="Suchen (/)">${icon('search')}</button>
      <button class="icon-btn hide-m" data-global="theme" aria-label="Farbmodus wechseln" title="Farbmodus" id="themeBtn">${icon('sun')}</button>
      <button class="icon-btn" data-global="inbox" aria-label="Benachrichtigungen" title="Benachrichtigungen" id="bellBtn">${icon('bell')}<span class="badge hide" id="bellBadge">0</span></button>
      <button class="icon-btn" data-global="more" aria-label="Mehr" title="Mehr" id="moreBtn" style="display:none">${icon('more')}</button>
      <button class="btn btn-primary btn-new hide-m" data-global="new">${icon('plus', 18)}Neu</button>
    </div>
  </header>
  <div class="layout">
    <nav class="sidebar" id="sidebar" aria-label="Hauptnavigation"></nav>
    <main class="main" id="main" tabindex="-1"></main>
  </div>
  <nav class="bottomnav" id="bottomnav" aria-label="Navigation">
    ${NAV.slice(0, 5).map(([k, n, ic, h]) => `<a href="${h}" data-nav="${k}">${icon(ic, 22)}<span>${n}</span>${k === 'aufgaben' ? '<i class="bn-badge hide" id="bnBadge"></i>' : ''}</a>`).join('')}
  </nav>
  <button class="fab" data-global="new" aria-label="Neu anlegen">${icon('plus', 26)}</button>`;
}

function sidebarHtml(route) {
  const now = new Date();
  const s = S.settings();
  const area = A.area();
  const open = S.tasks(t => !t.done && S.inArea(t, area));
  const today = C.ymd(now);
  const dueToday = open.filter(t => t.due && t.due <= today).length;
  const red = open.filter(t => { const l = C.ampel(t, now, s).level; return l === 'red' || l === 'alarm'; }).length;
  const cats = S.cats(area);
  const counts = {};
  for (const t of open) if (t.cat) counts[t.cat] = (counts[t.cat] || 0) + 1;
  const items = NAV.map(([k, n, ic, h]) => {
    const cnt = k === 'aufgaben' ? dueToday : k === 'tickets' ? red : 0;
    return `<a href="${h}" class="${route.name === k ? 'on' : ''}" data-nav="${k}">${icon(ic, 19)}<span>${n}</span>${cnt ? `<span class="cnt ${k === 'tickets' ? 'red' : ''}">${cnt}</span>` : ''}</a>`;
  }).join('');
  const catItems = cats.map(c => `<a href="#/kategorie/${c.id}" class="${route.name === 'kategorie' && route.parts[0] === c.id ? 'on' : ''}"><span class="ci">${esc(c.icon || '•')}</span><span class="ellip">${esc(c.name)}</span>${counts[c.id] ? `<span class="cnt">${counts[c.id]}</span>` : ''}</a>`).join('');
  return `<div class="nav">${items}</div>
    <div class="side-title">${area === 'all' ? 'Kategorien' : area === 'b' ? 'Geschäftlich' : 'Privat'}</div>
    <div class="nav side-cats">${catItems}</div>
    <div class="side-foot nav"><a href="#/einstellungen" class="${route.name === 'einstellungen' ? 'on' : ''}">${icon('settings', 19)}<span>Einstellungen</span></a></div>`;
}

function updateShell(route) {
  document.body.dataset.area = A.area();
  const seg = document.getElementById('areaSeg');
  seg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.setarea === A.area()));
  placeThumb(seg);
  document.getElementById('sidebar').innerHTML = sidebarHtml(route);
  document.querySelectorAll('#bottomnav a').forEach(a => a.classList.toggle('on', a.dataset.nav === route.name));
  document.getElementById('themeBtn').innerHTML = icon(themeIcon());
  const unread = N.unreadCount();
  const bb = document.getElementById('bellBadge');
  bb.textContent = unread > 99 ? '99+' : String(unread);
  bb.classList.toggle('hide', !unread);
  const hasAlarm = N.inbox().some(x => !x.read && (x.level === 'alarm' || x.level === 'red'));
  bb.classList.toggle('pulse', hasAlarm);
  const now = new Date();
  const dueToday = S.tasks(t => !t.done && t.due && t.due <= C.ymd(now) && S.inArea(t)).length;
  const bn = document.getElementById('bnBadge'); if (bn) bn.classList.toggle('hide', !dueToday);
  document.getElementById('moreBtn').style.display = isMobile() ? '' : 'none';
  updateSyncDot();
  updateFocusMini();
}

function updateSyncDot() {
  const d = document.getElementById('syncDot'); if (!d) return;
  const st = SY.state;
  d.className = 'sync-dot ' + (!SY.configured() ? 'off' : st.busy ? 'busy' : st.status === 'error' ? 'err' : st.status === 'offline' ? 'busy' : 'ok');
  const btn = document.getElementById('syncBtn');
  if (btn) btn.title = !SY.configured() ? 'Sync nicht eingerichtet' : st.status === 'error' ? 'Sync-Fehler: ' + st.error : st.lastSync ? 'Synchronisiert ' + C.fmtRelTime(st.lastSync) : 'Synchronisiere …';
}

function updateFocusMini() {
  const el = document.getElementById('focusMini'); if (!el) return;
  const r = F.run();
  const route = parseRoute();
  if (!r || route.name === 'fokus') { if (el.innerHTML) el.innerHTML = ''; return; }
  const ms = r.mode === 'stopwatch' ? F.elapsedMs(r) : F.remainingMs(r);
  const s = Math.ceil(ms / 1000);
  const txt = `${C.pad(Math.floor(s / 60))}:${C.pad(s % 60)}`;
  const c = r.cat ? S.cat(r.cat) : null;
  el.innerHTML = `<a class="focus-mini" href="#/fokus" style="--fc:${c ? c.color : 'var(--accent)'}" title="Zur laufenden Fokuseinheit"><i></i>${r.paused ? 'Pause ' : ''}${txt}</a>`;
}

/* ---------------- Rendern ---------------- */
function scheduleRender() {
  if (A.dragging) { pendingAfterDrag = true; return; }
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; render(); });
}

function render() {
  if (A.dragging) { pendingAfterDrag = true; return; }
  const route = parseRoute();
  A.route = route;
  const main = document.getElementById('main');
  if (!main) return;
  // Fokus & Scroll sichern
  const ae = document.activeElement;
  const keep = ae && main.contains(ae) && ae.id ? { id: ae.id, v: ae.value, s: ae.selectionStart, e: ae.selectionEnd } : null;
  const scrolls = {};
  main.querySelectorAll('[data-keep-scroll]').forEach(el => { scrolls[el.dataset.keepScroll] = el.scrollTop; });
  const sameView = main.dataset.view === route.name + '/' + (route.parts[0] || '');
  const winY = window.scrollY;
  if (viewAbort) viewAbort.abort();
  viewAbort = new AbortController();
  const V = VIEWS[route.name];
  let html = '';
  try { html = V.render(route); } catch (e) { console.error(e); html = `<div class="empty"><div class="big">⚠️</div><b>Diese Ansicht konnte nicht geladen werden</b><div>${esc(e.message)}</div></div>`; }
  const root = document.createElement('div');
  root.className = 'view view-' + route.name;
  root.innerHTML = html;
  main.replaceChildren(root);
  main.classList.toggle('full', FULL.has(route.name));
  main.dataset.view = route.name + '/' + (route.parts[0] || '');
  for (const [k, v] of Object.entries(scrolls)) { const el = main.querySelector(`[data-keep-scroll="${k}"]`); if (el) el.scrollTop = v; }
  try { V.mount && V.mount(root, { signal: viewAbort.signal }, route); } catch (e) { console.error(e); }
  if (sameView) window.scrollTo(0, winY);
  if (keep) {
    const el = document.getElementById(keep.id);
    if (el) { try { el.focus({ preventScroll: true }); if (keep.v !== undefined && el.value !== undefined && el.value !== keep.v) el.value = keep.v; if (el.setSelectionRange && keep.s != null) el.setSelectionRange(keep.s, keep.e); } catch { } }
  }
  updateShell(route);
  const titles = { start: 'Start', kalender: 'Kalender', matrix: 'Matrix', aufgaben: 'Aufgaben', fokus: 'Fokus', tickets: 'Ampel', kategorie: 'Kategorie', einstellungen: 'Einstellungen' };
  document.title = `${titles[route.name] || ''} – Zeitblick`;
}

/* ---------------- Globale Aktionen ---------------- */
A.toggleDone = (id, el) => {
  const t = S.task(id); if (!t) return;
  if (t.done) {
    S.put('tasks', { ...t, done: false, doneAt: null });
    toast('Wieder geöffnet');
    return;
  }
  const prev = C.structuredCloneSafe(t);
  const row = el && el.closest && el.closest('.trow, .qcard');
  burst(el && el.closest ? (el.closest('.chk, .mini-chk, button') || el) : null, 'var(--accent)');
  if (S.local.sound) chime('done');
  vibrate(12);
  const doIt = () => {
    const next = C.completeTask(S.task(id) || t, new Date());
    S.put('tasks', next);
    N.resolveRef('task', id);
    const msg = next.done ? 'Erledigt' : `Erledigt. Nächstes Mal: ${C.fmtDue(next.due, next.dueTime)}`;
    toast(`✓ ${esc(msg)}`, { action: 'Rückgängig', onAction: () => S.put('tasks', { ...prev, updatedAt: undefined }) });
  };
  if (row && !(t.rec && t.rec.f)) { row.classList.add('leaving'); setTimeout(doIt, 360); }
  else doIt();
};

A.startFocus = (taskId, opts = {}) => {
  const t = taskId ? S.task(taskId) : null;
  if (F.run()) {
    if (taskId && F.run().taskId !== taskId) toast('Es läuft bereits eine Fokuseinheit');
    A.nav('#/fokus');
    return;
  }
  F.clearResult();
  F.prefs.taskId = t ? t.id : null;
  F.prefs.cat = t ? t.cat : F.prefs.cat;
  if (opts.autostart) F.start({ taskId: F.prefs.taskId, min: F.prefs.min || S.settings().focus.len });
  A.nav('#/fokus');
};

function newMenu(anchor) {
  const html = `<div class="menu">
    <button data-new="task">${icon('list', 18)}Neue Aufgabe<span class="sp"></span><span class="tiny muted">N</span></button>
    <button data-new="event">${icon('calendar', 18)}Neuer Termin<span class="sp"></span><span class="tiny muted">E</span></button>
    <button data-new="focus">${icon('focus', 18)}Fokus starten<span class="sp"></span><span class="tiny muted">F</span></button>
  </div>`;
  const run = k => { closePopover(); if (k === 'task') A.newTask(); if (k === 'event') A.newEvent(); if (k === 'focus') A.startFocus(null); };
  if (isMobile()) {
    sheet({ title: 'Neu anlegen', cls: 'sheet-sm', body: html, onMount: (el, close) => el.addEventListener('click', e => { const b = e.target.closest('[data-new]'); if (b) { close(); run(b.dataset.new); } }) });
  } else popover(anchor, html, { width: 240, place: 'below', onMount: el => el.addEventListener('click', e => { const b = e.target.closest('[data-new]'); if (b) run(b.dataset.new); }) });
}

function moreMenu(anchor) {
  const html = `<div class="menu">
    <a href="#/tickets">${icon('ampel', 18)}Ampel & Tickets</a>
    <button data-m="search">${icon('search', 18)}Suchen</button>
    <button data-m="theme">${icon(themeIcon(), 18)}Farbmodus wechseln</button>
    <button data-m="sync">${icon('sync', 18)}Jetzt synchronisieren</button>
    <a href="#/einstellungen">${icon('settings', 18)}Einstellungen</a>
  </div>`;
  popover(anchor, html, { width: 250, place: 'below', onMount: (el, close) => el.addEventListener('click', e => {
    const b = e.target.closest('[data-m], a'); if (!b) return;
    close();
    if (b.dataset.m === 'search') openSearch();
    if (b.dataset.m === 'theme') cycleTheme();
    if (b.dataset.m === 'sync') { if (SY.configured()) SY.syncNow({ force: true }); else A.nav('#/einstellungen/sync'); }
  }) });
}

function inboxPopover(anchor) {
  const list = N.inbox();
  const html = `<div class="inbox"><div class="row" style="margin-bottom:6px"><b class="grow">Benachrichtigungen</b>${list.length ? `<button class="btn sm btn-ghost" data-ib="clear">Alle entfernen</button>` : ''}</div>
    ${list.length ? list.map(x => `<div class="inbox-item lvl-${esc(x.level || '')}"><div class="ib-body" data-ibopen="${esc(x.id)}"><b>${esc(x.title)}</b><span>${esc(x.message || '')}\n${esc(C.fmtRelTime(x.firedAt || x.at))}</span></div><button class="icon-btn sm" data-ibdel="${esc(x.id)}" aria-label="Entfernen">${icon('x', 15)}</button></div>`).join('')
      : `<div class="empty" style="padding:20px 8px"><div class="big">🔕</div><b>Keine Benachrichtigungen</b><div class="small">Erinnerungen bleiben hier, bis du sie entfernst.</div></div>`}</div>`;
  const el = popover(anchor, html, { width: 360, place: 'below', onMount: (el, close) => el.addEventListener('click', e => {
    const d = e.target.closest('[data-ibdel]');
    if (d) { N.removeInbox(d.dataset.ibdel); d.closest('.inbox-item').remove(); return; }
    if (e.target.closest('[data-ib="clear"]')) { N.clearInbox(); close(); return; }
    const o = e.target.closest('[data-ibopen]');
    if (o) { const it = N.inbox().find(x => x.id === o.dataset.ibopen); close(); if (it && it.ref) openRef(it.ref); }
  }) });
  setTimeout(() => { N.markInboxRead(); }, 600);
  return el;
}

function openRef(ref) {
  if (!ref) return;
  if (ref.type === 'task' && S.task(ref.id)) openTaskEditor(ref.id);
  else if (ref.type === 'event' && S.event(ref.id)) openEventEditor(ref.id);
  else if (ref.type === 'focus') A.nav('#/fokus');
}

/* ---------------- Suche ---------------- */
function openSearch() {
  closePopover();
  const cmds = [
    { k: 'Befehl', t: 'Neue Aufgabe', run: () => A.newTask() },
    { k: 'Befehl', t: 'Neuer Termin', run: () => A.newEvent() },
    { k: 'Befehl', t: 'Fokus starten', run: () => A.startFocus(null) },
    { k: 'Befehl', t: 'Farbmodus wechseln', run: cycleTheme },
    { k: 'Ansicht', t: 'Kalender', run: () => A.nav('#/kalender') },
    { k: 'Ansicht', t: 'Eisenhower-Matrix', run: () => A.nav('#/matrix') },
    { k: 'Ansicht', t: 'Ampel & Tickets', run: () => A.nav('#/tickets') },
    { k: 'Ansicht', t: 'Einstellungen', run: () => A.nav('#/einstellungen') },
  ];
  sheet({
    title: null, cls: 'sheet-sm', label: 'Suche',
    body: `<div class="search-box">${icon('search', 20)}<input data-sq placeholder="Aufgaben, Termine, Kategorien, Befehle …" autofocus aria-label="Suchen"></div><div data-sres style="margin-top:8px;max-height:60vh;overflow:auto"></div>`,
    onMount: (el, close) => {
      const inp = el.querySelector('[data-sq]');
      const box = el.querySelector('[data-sres]');
      let results = [], act = 0;
      const q2 = s => C.norm(s);
      const run = () => {
        const q = q2(inp.value);
        results = [];
        if (q) {
          for (const t of S.tasks()) if (q2(t.title + ' ' + (t.notes || '')).includes(q)) results.push({ k: t.done ? 'Erledigt' : 'Aufgabe', t: t.title, run: () => openTaskEditor(t.id) });
          for (const e of S.events()) if (q2(e.title + ' ' + (e.loc || '')).includes(q)) results.push({ k: 'Termin ' + C.fmtDateShort(C.parseLocal(e.s)), t: e.title, run: () => openEventEditor(e.id) });
          for (const c of S.cats()) if (q2(c.name).includes(q)) results.push({ k: 'Kategorie', t: `${c.icon || ''} ${c.name}`, run: () => A.nav('#/kategorie/' + c.id) });
          for (const c of cmds) if (q2(c.t).includes(q)) results.push(c);
        } else results = cmds;
        results = results.slice(0, 40); act = 0;
        box.innerHTML = results.map((r, i) => `<div class="sres ${i === act ? 'act' : ''}" data-i="${i}"><span class="grow ellip">${esc(r.t)}</span><span class="k">${esc(r.k)}</span></div>`).join('') || '<div class="muted small" style="padding:10px">Nichts gefunden.</div>';
      };
      inp.addEventListener('input', run);
      inp.addEventListener('keydown', e => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); act = Math.max(0, Math.min(results.length - 1, act + (e.key === 'ArrowDown' ? 1 : -1))); box.querySelectorAll('.sres').forEach((x, i) => x.classList.toggle('act', i === act)); }
        if (e.key === 'Enter' && results[act]) { const r = results[act]; close(); r.run(); }
      });
      box.addEventListener('click', e => { const r = e.target.closest('[data-i]'); if (r) { const x = results[Number(r.dataset.i)]; close(); x.run(); } });
      run();
    },
  });
}

/* ---------------- Alarm-Overlay ---------------- */
let alarmEl = null;
function showAlarm(list) {
  if (alarmEl || !list.length) return;
  const s = S.settings();
  const now = new Date();
  alarmEl = document.createElement('div');
  alarmEl.className = 'alarm-back';
  alarmEl.setAttribute('role', 'alertdialog');
  alarmEl.setAttribute('aria-label', 'Alarm: überfällige Aufgaben');
  const items = list.slice(0, 6).map(t => {
    const a = C.ampel(t, now, s);
    const h = a.overdueH || 0;
    return `<div class="alarm-item" data-aid="${t.id}"><div class="t">${esc(t.title)}</div><div class="m">Seit ${h >= 48 ? Math.round(h / 24) + ' Tagen' : Math.round(h) + ' Stunden'} überfällig</div>
      <div class="acts"><button class="btn sm btn-danger" data-al="focus">${icon('play', 14)}Jetzt erledigen</button><button class="btn sm" data-al="done">${icon('check', 14)}Erledigt</button><button class="btn sm" data-al="tomorrow">Auf morgen</button><button class="btn sm btn-ghost" data-al="snooze">1 Std später</button></div></div>`;
  }).join('');
  alarmEl.innerHTML = `<div class="alarm-box"><h2><span class="siren">${icon('alert', 24)}</span>${list.length === 1 ? 'Ein Ticket ist im Alarm' : `${list.length} Tickets sind im Alarm`}</h2>
    <p class="small muted" style="margin:8px 0 2px">Diese Aufgaben sind deutlich überfällig. Kümmere dich jetzt darum oder plane sie bewusst neu.</p>
    ${items}
    <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn" data-al="ack">Ich kümmere mich gleich</button></div></div>`;
  document.body.appendChild(alarmEl);
  if (S.local.sound) chime('alert');
  vibrate([300, 120, 300, 120, 300]);
  alarmEl.addEventListener('click', e => {
    const b = e.target.closest('[data-al]'); if (!b) return;
    const a = b.dataset.al;
    if (a === 'ack') { N.ackAlarm(); closeAlarm(); return; }
    const item = b.closest('[data-aid]'); const id = item && item.dataset.aid;
    const t = S.task(id); if (!t) return;
    if (a === 'focus') { closeAlarm(); N.ackAlarm(); A.startFocus(id, { autostart: true }); return; }
    if (a === 'done') A.toggleDone(id, b);
    if (a === 'tomorrow') S.put('tasks', { ...t, due: C.ymd(C.addDays(new Date(), 1)), snooze: null });
    if (a === 'snooze') S.put('tasks', { ...t, snooze: Date.now() + C.HOUR });
    item.remove();
    if (!alarmEl.querySelector('[data-aid]')) closeAlarm();
  });
}
function closeAlarm() { if (alarmEl) { alarmEl.remove(); alarmEl = null; } }

/* ---------------- Deep Links ---------------- */
function handleOpen(params) {
  const o = params.open;
  if (!o) return false;
  if (o === 'task' && params.id) { if (S.task(params.id)) { if (parseRoute().name === 'einstellungen') location.hash = '#/start'; setTimeout(() => openTaskEditor(params.id), 50); } else toast('Diese Aufgabe gibt es nicht mehr'); }
  else if (o === 'event' && params.id) {
    const ev = S.event(params.id);
    if (ev) { if (params.d) Cal.setCur(C.parseYmd(params.d)); Cal.setView('d'); A.nav('#/kalender/tag'); setTimeout(() => openEventEditor(params.id, {}, ev.rec && params.d ? C.parseLocal(params.d + 'T' + (ev.s.slice(11, 16) || '00:00')) : null), 120); }
  }
  else if (o === 'focus') { if (params.task && S.task(params.task)) A.startFocus(params.task, { autostart: params.start === '1' && !F.run() }); else A.nav('#/fokus'); }
  else if (o === 'start') A.nav('#/start');
  else if (o === 'newtask') setTimeout(() => A.newTask(), 100);
  else if (o === 'newevent') setTimeout(() => A.newEvent(), 100);
  return true;
}
function handleUrlOpen(url) {
  try { const u = new URL(url, location.href); handleOpen(Object.fromEntries(u.searchParams)); } catch { }
}

async function handlePair() {
  const m = location.hash.match(/#pair=([A-Za-z0-9_-]+)/);
  if (!m) return;
  history.replaceState(null, '', location.pathname + '#/start');
  let p;
  try { p = SY.readPairPayload(m[1]); } catch { toast('Der Kopplungscode ist ungültig', { kind: 'bad' }); return; }
  const ok = await new Promise(res => {
    let r = false;
    sheet({ title: 'Gerät verbinden', cls: 'sheet-sm', body: '<p class="confirm-text">Dieses Gerät mit deinem Zeitblick-Sync verbinden? Danach sind Aufgaben, Termine und Fokus-Daten auf allen Geräten gleich.</p>', footer: '<button class="btn" data-close>Abbrechen</button><button class="btn btn-primary" data-ok>Verbinden</button>', onMount: (el, close) => el.querySelector('[data-ok]').addEventListener('click', () => { r = true; close(); }), onClose: () => res(r) });
  });
  if (!ok) return;
  try {
    await SY.connect(p.t, p.g);
    if (p.n && !S.settings().ntfy.topic) S.setSettingPath('ntfy.topic', p.n);
    toast('Gerät verbunden – alles wird synchronisiert');
  } catch (e) { toast(esc(e.message), { kind: 'bad', ms: 7000 }); }
  render();
}

/* ---------------- Willkommen ---------------- */
function welcome() {
  if (S.local.onboarded || S.tasks().length || S.events().length) return;
  sheet({
    title: 'Willkommen bei Zeitblick', cls: 'sheet-sm',
    body: `<p class="confirm-text">Dein System für Kalender, Eisenhower-Matrix, To-dos und Fokus – privat und geschäftlich, auf allen Geräten.</p>
      <ul class="small" style="padding-left:18px;color:var(--ink-2);line-height:1.7"><li>Oben schaltest du zwischen <b>Privat</b>, <b>Alles</b> und <b>Geschäftlich</b>.</li><li>Aufgaben bekommen eine <b>Ampel</b>, die bei Überfälligkeit eskaliert.</li><li><b>Jetzt erledigen</b> startet direkt den Fokus-Timer.</li></ul>
      <p class="small muted">Möchtest du mit ein paar Beispielen starten? Du kannst sie später in den Einstellungen mit einem Klick entfernen.</p>`,
    footer: `<button class="btn" data-w="empty">Leer starten</button><button class="btn btn-primary" data-w="demo">Mit Beispielen starten</button>`,
    onMount: (el, close) => el.addEventListener('click', e => {
      const b = e.target.closest('[data-w]'); if (!b) return;
      S.local.onboarded = true; S.saveLocal();
      if (b.dataset.w === 'demo') { seedDemo(); toast('Beispiele angelegt'); }
      close();
    }),
    onClose: () => { S.local.onboarded = true; S.saveLocal(); },
  });
}
A.seedDemo = seedDemo; A.removeDemo = removeDemo; A.hasDemo = hasDemo;

/* ---------------- Start ---------------- */
async function boot() {
  A.applyTheme();
  document.getElementById('app').innerHTML = shellHtml();
  initTooltips();
  await S.init();

  // Deep Link aus Benachrichtigung (?open=…)
  const params = Object.fromEntries(new URLSearchParams(location.search));
  if (params.open || params.r) history.replaceState(null, '', location.pathname + (location.hash && !location.hash.startsWith('#pair') ? location.hash : '#/start'));

  render();

  S.subscribe(info => {
    if (info.local) { SY.schedulePush(); }
    N.scheduleReconcile(info.remote ? 6000 : 3500);
    O.schedule();
    if (info.col === 'tasks' && info.rec && (info.rec.done || info.rec.deleted)) N.resolveRef('task', info.id);
    scheduleRender();
  });
  SY.onState(() => updateSyncDot());
  N.onState(() => { if (parseRoute().name === 'einstellungen') scheduleRender(); });
  O.onState(() => { if (parseRoute().name === 'einstellungen') scheduleRender(); });
  F.onChange(info => { Fo.onEngine(info); N.scheduleReconcile(800); if (info && (info.completed || info.failed) && document.visibilityState !== 'visible') N.showSystem({ rid: 'zb-focusend-' + Date.now(), title: info.completed ? '✨ Fokuszeit geschafft' : 'Fokus abgebrochen', message: info.completed ? 'Dein Kristall ist voll aufgeladen.' : 'Dein Kristall ist zerbrochen.', ref: { type: 'focus', id: 'f' } }); scheduleRender(); });
  N.setHooks({
    onFire: r => {
      if (S.local.sound) chime(r.priority >= 5 ? 'alert' : 'soft');
      toast(`${esc(r.title)}`, { action: r.ref && r.ref.type !== 'focus' ? 'Öffnen' : undefined, onAction: () => openRef(r.ref), ms: 8000, kind: r.priority >= 5 ? 'bad' : '' });
      updateShell(parseRoute());
    },
    onAlarm: list => { if (F.run()) return; showAlarm(list); },
    onInbox: () => updateShell(parseRoute()),
    onOpen: url => handleUrlOpen(url),
  });
  O.setAppUrl(() => N.appUrl());

  window.addEventListener('hashchange', () => { closePopover(); closeAllSheets(); render(); window.scrollTo(0, 0); });
  window.addEventListener('resize', () => { const seg = document.getElementById('areaSeg'); placeThumb(seg); });
  if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (A.applyTheme()) render(); });
  document.addEventListener('visibilitychange', () => {
    const vis = document.visibilityState === 'visible';
    F.onVisibility(vis, () => N.showSystem({ rid: 'zb-strict-' + Date.now(), title: '⚠️ Zurück zum Fokus!', message: 'Kehre innerhalb von 10 Sekunden zurück, sonst zerbricht dein Kristall.', ref: { type: 'focus', id: 'f' } }));
    if (vis) { SY.syncNow(); N.checkLocal(); setTimeout(() => N.checkAlarm(), 1200); if (A.applyTheme()) render(); }
    else S.saveNow();
  });
  window.addEventListener('pagehide', () => { S.saveNow(); S.saveLocalNow(); });
  window.addEventListener('online', () => { SY.syncNow(); N.scheduleReconcile(500); });

  // Globale Klicks
  document.addEventListener('click', e => {
    const t = e.target;
    const g = t.closest('[data-global]');
    if (g) {
      const k = g.dataset.global;
      if (k === 'new') newMenu(g);
      if (k === 'search') openSearch();
      if (k === 'theme') cycleTheme();
      if (k === 'inbox') inboxPopover(g);
      if (k === 'more') moreMenu(g);
      return;
    }
    const ar = t.closest('[data-setarea]');
    if (ar) { S.local.area = ar.dataset.setarea; S.saveLocal(); render(); return; }
    if (t.closest('#syncBtn')) { if (SY.configured()) { SY.syncNow({ force: true }); toast('Synchronisiere …', { ms: 1200 }); } else A.nav('#/einstellungen/sync'); return; }
    if (t.closest('.sheet, .task-editor')) return; // Editoren behandeln ihre Klicks selbst
    const act = t.closest('[data-act][data-id]');
    if (act && (act.dataset.act === 'done' || act.dataset.act === 'focus')) {
      e.preventDefault(); e.stopPropagation();
      if (act.dataset.act === 'done') A.toggleDone(act.dataset.id, act);
      else { closePopover(); A.startFocus(act.dataset.id, { autostart: true }); }
      return;
    }
    if (t.closest('button, a, input, select, textarea, label')) { if (!t.closest('[data-task],[data-event]') || t.closest('button:not([data-task]), a, input, select, textarea, label')) return; }
    const tk = t.closest('[data-task]');
    if (tk) { closePopover(); openTaskEditor(tk.dataset.task); return; }
    const ev = t.closest('[data-event]');
    if (ev) { closePopover(); const x = S.event(ev.dataset.event); if (x) openEventEditor(x.id, {}, x.rec && ev.dataset.occ ? new Date(Number(ev.dataset.occ)) : null); }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (alarmEl) return;
      if (document.querySelector('.popover')) { closePopover(); return; }
      const s = topSheet(); if (s) { s.close('esc'); return; }
    }
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;
    if (topSheet() || alarmEl || e.ctrlKey || e.metaKey || e.altKey) { if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); openSearch(); } return; }
    const route = parseRoute();
    if (route.name === 'kalender' && Cal.keyNav(e.key)) { e.preventDefault(); return; }
    const map = { 1: '#/start', 2: '#/kalender', 3: '#/matrix', 4: '#/aufgaben', 5: '#/fokus', 6: '#/tickets' };
    if (map[e.key]) { A.nav(map[e.key]); return; }
    if (e.key === 'n') { e.preventDefault(); A.newTask(); }
    if (e.key === 'e') { e.preventDefault(); A.newEvent(); }
    if (e.key === 'f') { e.preventDefault(); A.startFocus(null); }
    if (e.key === '/') { e.preventDefault(); openSearch(); }
  });

  // Service Worker
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    try {
      const hadController = !!navigator.serviceWorker.controller;
      const reg = await navigator.serviceWorker.register('sw.js');
      navigator.serviceWorker.addEventListener('message', ev => { if (ev.data && ev.data.type === 'open') handleUrlOpen(ev.data.url); });
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (hadController) toast('Neue Version von Zeitblick ist bereit', { action: 'Neu laden', onAction: () => location.reload(), ms: 15000 });
      });
      setInterval(() => reg.update().catch(() => { }), 60 * 60000);
    } catch (err) { console.info('Service Worker nicht verfügbar:', err.message); }
  }
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); Se.setInstallPrompt(e); });

  // Hintergrunddienste
  SY.start();
  if (SY.configured()) SY.syncNow({ force: true });
  N.start();
  await O.init();
  S.dailySnapshot();

  // Sekundentakt
  setInterval(() => {
    F.tick();
    updateFocusMini();
    const now = new Date();
    if (now.getMinutes() !== lastMinute) {
      lastMinute = now.getMinutes();
      const r = parseRoute();
      if (r.name === 'kalender') Cal.tickNow(document.getElementById('main'));
      if ((r.name === 'start' || r.name === 'tickets' || r.name === 'matrix') && !document.querySelector('.sheet-back, .popover') && !A.dragging) {
        const ae = document.activeElement; if (!(ae && /input|textarea|select/i.test(ae.tagName))) scheduleRender();
      }
      if (now.getMinutes() === 0) { S.dailySnapshot(); if (A.applyTheme()) render(); }
    }
    if (!A.dragging && pendingAfterDrag) { pendingAfterDrag = false; scheduleRender(); }
  }, 1000);

  // Deep Links und Kopplung
  if (params.open) handleOpen(params);
  await handlePair();
  setTimeout(() => { welcome(); N.checkAlarm(true); }, 900);
}

boot().catch(e => {
  console.error(e);
  const app = document.getElementById('app');
  if (app) app.innerHTML = `<div class="empty" style="padding:60px 20px"><div class="big">⚠️</div><b>Zeitblick konnte nicht starten</b><div>${esc(e.message)}</div></div>`;
});
