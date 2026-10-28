// Zeitblick 2 – Lebenszentrale: Start, Navigation, Rahmen, globale Aktionen
import * as C from './core.js';
import * as S from './store.js';
import * as SY from './sync.js';
import * as N from './notify.js';
import * as O from './obsidian.js';
import * as F from './focus-engine.js';
import { esc, icon, toast, sheet, popover, closePopover, topSheet, closeAllSheets, initTooltips, burst, isMobile, confirmDialog } from './ui.js';
import { chime, vibrate } from './audio.js';
import { A } from './app-api.js';
import { openEventEditor, placeThumb } from './editors.js';
import { openVorgang } from './detail.js';
import { seedDemo, removeDemo, hasDemo } from './demo.js';
import * as Cockpit from './views/cockpit.js';
import * as Inbox from './views/inbox.js';
import * as Vg from './views/vorgaenge.js';
import * as Cal from './views/calendar.js';
import * as Mx from './views/matrix.js';
import * as Fo from './views/focus.js';
import * as Hab from './views/habits.js';
import * as Nt from './views/notes.js';
import * as Gl from './views/goals.js';
import * as Pj from './views/projects.js';
import * as Lf from './views/life.js';
import * as Pp from './views/people.js';
import * as Ar from './views/archive.js';
import * as Gd from './views/guide.js';
import * as Se from './views/settings.js';

const VIEWS = { cockpit: Cockpit, inbox: Inbox, vorgaenge: Vg, kalender: Cal, matrix: Mx, fokus: Fo, gewohnheiten: Hab, notizen: Nt, ziele: Gl, projekte: Pj, lebensbereiche: Lf, beziehungen: Pp, archiv: Ar, anleitung: Gd, einstellungen: Se };
const ALIASES = { start: 'cockpit', aufgaben: 'vorgaenge', tickets: 'vorgaenge', kategorie: 'vorgaenge' };
const FULL = new Set(['kalender']);
const TITLES = { cockpit: 'Cockpit', inbox: 'Inbox', vorgaenge: 'Vorgänge', kalender: 'Kalender', matrix: 'Matrix', fokus: 'Fokus', gewohnheiten: 'Gewohnheiten', notizen: 'Notizen', ziele: 'Ziele', projekte: 'Projekte', lebensbereiche: 'Lebensbereiche', beziehungen: 'Beziehungen', archiv: 'Archiv', anleitung: 'Anleitung', einstellungen: 'Einstellungen' };
const NAV = [
  { items: [['cockpit', 'Cockpit', 'home'], ['inbox', 'Inbox', 'inbox'], ['vorgaenge', 'Vorgänge', 'list'], ['kalender', 'Kalender', 'calendar'], ['matrix', 'Matrix', 'matrix'], ['fokus', 'Fokus', 'focus']] },
  { label: 'Leben', items: [['gewohnheiten', 'Gewohnheiten', 'repeat'], ['notizen', 'Notizen', 'notes'], ['ziele', 'Ziele', 'flag'], ['projekte', 'Projekte', 'folder'], ['lebensbereiche', 'Lebensbereiche', 'layers'], ['beziehungen', 'Beziehungen', 'person']] },
  { label: 'System', items: [['archiv', 'Archiv', 'archive'], ['anleitung', 'Anleitung', 'book'], ['einstellungen', 'Einstellungen', 'settings']] },
];

let viewAbort = null;
let renderQueued = false;
let pendingAfterDrag = false;
let lastMinute = -1;

/* ---------------- Routing ---------------- */
function parseRoute() {
  const h = (location.hash || '').replace(/^#\/?/, '');
  const [path, qs] = h.split('?');
  const parts = path.split('/').filter(Boolean);
  let name = parts[0] ? (ALIASES[parts[0]] || parts[0]) : (S.local.startPage || 'cockpit');
  if (!VIEWS[name]) name = 'cockpit';
  const params = Object.fromEntries(new URLSearchParams(qs || ''));
  return { name, parts: parts.slice(1), params };
}
A.nav = (hash) => { closePopover(); if (location.hash === hash) render(); else location.hash = hash; };
A.render = () => scheduleRender();
A.area = () => S.local.area || 'all';
A.now = () => new Date();
A.theme = () => document.documentElement.dataset.theme || 'light';
A.openTask = (id) => openVorgang(id);
A.newTask = (preset = {}) => openVorgang(null, preset);
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
  if (m) m.setAttribute('content', t === 'dark' ? '#1a1d21' : t === 'night' ? '#150806' : '#ffffff');
  return changed;
};
function cycleTheme() {
  const order = ['light', 'dark', 'night', 'auto'];
  S.local.theme = order[(order.indexOf(S.local.theme || 'auto') + 1) % order.length];
  S.saveLocal(); A.applyTheme();
  toast(`Farbmodus: ${{ light: 'Hell', dark: 'Dunkel', night: 'Nacht (Rotlicht)', auto: 'Wie System' }[S.local.theme]}`, { ms: 1800 });
  render();
}
function themeIcon() { const t = S.local.theme || 'auto'; return t === 'light' ? 'sun' : t === 'dark' ? 'moon' : t === 'night' ? 'night' : 'auto'; }

/* ---------------- Rahmen ---------------- */
function shellHtml() {
  return `
  <header class="topbar">
    <a class="brand" href="#/cockpit" aria-label="Zeitblick Cockpit">
      <svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true"><rect x="1" y="1" width="30" height="30" rx="8" fill="var(--accent)"/><circle cx="16" cy="16" r="8" fill="none" stroke="var(--accent-ink)" stroke-width="2.4"/><path d="M16 11v5l3.4 2" fill="none" stroke="var(--accent-ink)" stroke-width="2.4" stroke-linecap="round"/></svg>
      <b>Zeitblick</b><span>Lebenszentrale</span>
    </a>
    <div class="seg seg-area" id="areaSeg" role="group" aria-label="Bereich">
      <span class="seg-thumb"></span>
      <button data-setarea="p">Privat</button>
      <button data-setarea="all">Alles</button>
      <button data-setarea="b">Geschäftlich</button>
    </div>
    <div class="top-right">
      <span id="focusMini"></span>
      <button class="icon-btn hide-m" id="syncBtn" aria-label="Sync-Status" title="Sync"><span class="sync-dot" id="syncDot"></span></button>
      <button class="icon-btn hide-m" data-global="search" aria-label="Suchen (/)" title="Suchen  /">${icon('search', 18)}</button>
      <button class="icon-btn hide-m" data-global="theme" aria-label="Farbmodus wechseln" title="Farbmodus" id="themeBtn">${icon('sun', 18)}</button>
      <button class="icon-btn" data-global="bell" aria-label="Mitteilungen" title="Mitteilungen" id="bellBtn">${icon('bell', 18)}<span class="badge hide" id="bellBadge">0</span></button>
      <button class="btn btn-primary hide-m" data-global="new" style="margin-left:6px">${icon('plus', 15)}Neu</button>
    </div>
  </header>
  <div class="layout">
    <nav class="sidebar" id="sidebar" aria-label="Hauptnavigation"></nav>
    <main class="main" id="main" tabindex="-1"></main>
  </div>
  <nav class="bottomnav" id="bottomnav" aria-label="Navigation">
    <a href="#/cockpit" data-nav="cockpit">${icon('home', 20)}<span>Cockpit</span></a>
    <a href="#/inbox" data-nav="inbox">${icon('inbox', 20)}<span>Inbox</span><i class="bn-badge hide" id="bnInbox"></i></a>
    <a href="#/vorgaenge" data-nav="vorgaenge">${icon('list', 20)}<span>Vorgänge</span></a>
    <a href="#/kalender" data-nav="kalender">${icon('calendar', 20)}<span>Kalender</span></a>
    <button data-global="more" data-nav="more">${icon('menu', 20)}<span>Mehr</span></button>
  </nav>
  <button class="fab" data-global="capture" aria-label="In die Inbox schreiben">${icon('plus', 24)}</button>`;
}

function counts() {
  const now = new Date();
  const s = S.settings();
  const area = A.area();
  const open = S.openTasks(t => S.inArea(t, area));
  const red = open.filter(t => { const l = C.ampel(t, now, s).level; return l === 'red' || l === 'alarm'; }).length;
  const inbox = S.inboxItems();
  const inboxRed = inbox.filter(x => C.inboxAmpel(x, now) === 'red').length;
  const habitsOpen = S.habits(h => !h.archived && C.habitDueOn(h, now) && !C.habitDoneOn(h, C.ymd(now)) && !((h.freq || {}).type === 'week' && C.habitWeekCount(h, now) >= ((h.freq || {}).times || 1))).length;
  const notesOpen = S.notes(n => C.noteOpenToday(n, now)).length;
  const klar = S.openTasks(t => C.typeOf(t) === 'klaerung').length;
  return { open: open.length, red, inbox: inbox.length, inboxRed, habitsOpen, notesOpen, klar };
}

function sidebarHtml(route) {
  const c = counts();
  const compact = route.name === 'kalender' || !!S.local.sideCompact;
  const cnt = { inbox: c.inbox ? `<span class="cnt ${c.inboxRed ? 'red' : ''}">${c.inbox}</span>` : '', vorgaenge: c.red ? `<span class="cnt red">${c.red}</span>` : c.open ? `<span class="cnt">${c.open}</span>` : '', gewohnheiten: c.habitsOpen ? `<span class="cnt">${c.habitsOpen}</span>` : '', notizen: c.notesOpen ? `<span class="cnt">${c.notesOpen}</span>` : '', beziehungen: c.klar ? `<span class="cnt">${c.klar}</span>` : '' };
  return NAV.map(g => `${g.label ? `<div class="nav-label">${g.label}</div>` : ''}<div class="nav">${g.items.map(([k, n, ic]) => `<a href="#/${k}" class="${route.name === k ? 'on' : ''}" data-nav="${k}" ${compact ? `title="${n}"` : ''}>${icon(ic, 16)}<span>${n}</span>${cnt[k] || ''}</a>`).join('')}</div>`).join('') + `<div class="side-foot"><button class="icon-btn sm" data-global="sidetoggle" title="${S.local.sideCompact ? 'Navigation ausklappen' : 'Navigation einklappen'}" ${route.name === 'kalender' ? 'hidden' : ''} aria-label="Navigation ein- oder ausklappen">${icon(S.local.sideCompact ? 'right' : 'left', 15)}</button></div>`;
}

function updateShell(route) {
  document.body.dataset.area = A.area();
  document.body.classList.toggle('side-compact', route.name === 'kalender' || !!S.local.sideCompact);
  const seg = document.getElementById('areaSeg');
  seg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.setarea === A.area()));
  placeThumb(seg);
  document.getElementById('sidebar').innerHTML = sidebarHtml(route);
  document.querySelectorAll('#bottomnav [data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === route.name || (a.dataset.nav === 'more' && !['cockpit', 'inbox', 'vorgaenge', 'kalender'].includes(route.name))));
  document.getElementById('themeBtn').innerHTML = icon(themeIcon(), 18);
  const c = counts();
  const unread = N.unreadCount();
  const attention = c.red + c.inboxRed + c.notesOpen;
  const bb = document.getElementById('bellBadge');
  const n = unread || attention;
  bb.textContent = n > 99 ? '99+' : String(n);
  bb.classList.toggle('hide', !n);
  bb.classList.toggle('soft', !unread && !c.red && !c.inboxRed);
  const bi = document.getElementById('bnInbox'); if (bi) { bi.textContent = c.inbox; bi.classList.toggle('hide', !c.inbox); }
  updateSyncDot();
  updateFocusMini();
}

function updateSyncDot() {
  const d = document.getElementById('syncDot'); if (!d) return;
  const st = SY.state;
  d.className = 'sync-dot ' + (!SY.configured() ? '' : st.busy ? 'busy' : st.status === 'error' ? 'err' : st.status === 'offline' ? 'busy' : 'ok');
  const btn = document.getElementById('syncBtn');
  if (btn) btn.title = !SY.configured() ? 'Sync nicht eingerichtet' : st.status === 'error' ? 'Sync-Fehler: ' + st.error : st.lastSync ? 'Synchronisiert ' + C.fmtRelTime(st.lastSync) : 'Synchronisiere …';
}

function updateFocusMini() {
  const el = document.getElementById('focusMini'); if (!el) return;
  const r = F.run();
  if (!r || parseRoute().name === 'fokus') { if (el.innerHTML) el.innerHTML = ''; return; }
  const ms = r.mode === 'stopwatch' ? F.elapsedMs(r) : F.remainingMs(r);
  const sec = Math.ceil(ms / 1000);
  el.innerHTML = `<a class="focus-mini" href="#/fokus" title="Zur laufenden Fokuseinheit"><i></i>${r.paused ? 'Pause ' : ''}${C.pad(Math.floor(sec / 60))}:${C.pad(sec % 60)}</a>`;
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
  try { html = V.render(route); } catch (e) { console.error(e); html = `<div class="empty"><div class="em">⚠️</div><b>Diese Ansicht konnte nicht geladen werden</b><div class="small">${esc(e.message)}</div></div>`; }
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
  document.title = `${TITLES[route.name] || ''} – Zeitblick`;
}

/* ---------------- Vorgänge: Erledigen / Verwerfen / Löschen (immer mit Rückfrage) ---------------- */
A.completeTask = async (id, el) => {
  const t = S.task(id); if (!t) return false;
  if (C.isClosed(t)) return false;
  const rec = t.rec && t.rec.f;
  const ok = await confirmDialog(`„${esc(t.title)}“ ${rec ? 'für dieses Mal als erledigt markieren? Der nächste Termin wird automatisch angelegt.' : 'als erledigt markieren? Der Vorgang wandert danach ins Archiv.'}`, { ok: 'Erledigen', title: 'Vorgang erledigen?', cooldown: 3 });
  if (!ok) return false;
  const prev = C.structuredCloneSafe(S.task(id) || t);
  const row = el && el.closest && el.closest('.li, .qcard, tr');
  burst(el && el.isConnected ? el : null, 'var(--accent)');
  if (S.local.sound) chime('done');
  vibrate(12);
  const next = C.completeTask(prev, new Date());
  S.put('tasks', next);
  N.resolveRef('task', id);
  toast(next.done ? '✓ Erledigt – im Archiv' : `✓ Erledigt. Nächstes Mal: ${esc(C.fmtDue(next.due, next.dueTime))}`, { action: 'Rückgängig', onAction: () => S.put('tasks', { ...prev, log: prev.log }) });
  void row;
  return true;
};
// künftige Zeitblöcke eines Vorgangs entfernen (beim Verwerfen/Löschen) – mit Rückgängig
function dropFutureBoxes(id) {
  const now = new Date();
  const list = S.events(e => e.taskId === id && C.parseLocal(e.s) > now && !(e.rec && e.rec.f));
  for (const e of list) S.purge('events', e.id);
  return list;
}
function restoreBoxes(list) { for (const e of list) { const x = { ...e }; delete x.deleted; S.put('events', x); } }
A.discardTask = async (id) => {
  const t = S.task(id); if (!t) return false;
  const ok = await confirmDialog(`„${esc(t.title)}“ wird verworfen und ins Archiv verschoben. Du kannst ihn dort wieder öffnen.`, { ok: 'Verwerfen', title: 'Vorgang verwerfen?', cooldown: 3 });
  if (!ok) return false;
  const prev = C.structuredCloneSafe(t);
  S.put('tasks', C.setStatus(t, 'verworfen', new Date()));
  const boxes = dropFutureBoxes(id);
  N.resolveRef('task', id);
  toast('Verworfen – im Archiv', { action: 'Rückgängig', onAction: () => { S.put('tasks', prev); restoreBoxes(boxes); } });
  return true;
};
A.deleteTask = async (id) => {
  const t = S.task(id); if (!t) return false;
  const ok = await confirmDialog(`„${esc(t.title)}“ wird gelöscht. Im Archiv unter „Papierkorb“ kannst du ihn 120 Tage lang wiederherstellen.`, { ok: 'Löschen', danger: true, title: 'Vorgang löschen?', cooldown: 3 });
  if (!ok) return false;
  const prev = S.remove('tasks', id);
  const boxes = dropFutureBoxes(id);
  N.resolveRef('task', id);
  toast('Gelöscht', { action: 'Rückgängig', onAction: () => { S.restore('tasks', prev); restoreBoxes(boxes); } });
  return true;
};
A.setStatus = (id, status) => {
  const t = S.task(id); if (!t) return;
  if (status === 'erledigt') return A.completeTask(id);
  if (status === 'verworfen') return A.discardTask(id);
  S.put('tasks', C.setStatus(t, status, new Date()));
  toast(`Status: ${C.STATUS[status].name}`, { ms: 1600 });
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

/* ---------------- Schnellerfassung (Inbox) ---------------- */
A.capture = (text = '') => {
  let prio = 3;
  sheet({
    title: 'In die Inbox schreiben', cls: 'sheet-sm',
    body: `<div class="capture" style="margin:0"><input data-cap placeholder="Was geht dir durch den Kopf?" value="${esc(text)}" autofocus aria-label="Gedanke"></div>
      <div class="row" style="margin-top:12px"><span class="lbl">Priorität</span><div class="prio-pick" data-cprio>${[1, 2, 3, 4].map(p => `<button type="button" class="p${p} ${p === prio ? 'on' : ''}" data-p="${p}">P${p}</button>`).join('')}</div></div>
      <p class="hint" style="margin-top:12px">Einfach reinschreiben. Einsortieren kannst du später in der Inbox.</p>`,
    footer: `<button class="btn" data-close>Abbrechen</button><button class="btn btn-primary" data-save>In die Inbox</button>`,
    onMount: (el, close) => {
      const inp = el.querySelector('[data-cap]');
      const save = (again) => {
        const v = inp.value.trim(); if (!v) { inp.focus(); return; }
        S.put('inbox', { text: v, prio });
        toast('In der Inbox');
        if (again) { inp.value = ''; inp.focus(); } else close();
      };
      el.addEventListener('click', e => {
        const b = e.target.closest('[data-p]');
        if (b) { prio = Number(b.dataset.p); el.querySelectorAll('[data-p]').forEach(x => x.classList.toggle('on', x === b)); inp.focus(); }
        if (e.target.closest('[data-save]')) save(false);
      });
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); save(e.shiftKey); } });
    },
  });
};

function newMenu(anchor) {
  const html = `<div class="menu">
    <button data-new="capture">${icon('inbox', 16)}In die Inbox<span class="sp"></span><span class="kbd">I</span></button>
    <button data-new="task">${icon('list', 16)}Vorgang<span class="sp"></span><span class="kbd">N</span></button>
    <button data-new="event">${icon('calendar', 16)}Termin<span class="sp"></span><span class="kbd">E</span></button>
    <hr>
    <button data-new="note">${icon('notes', 16)}Notiz</button>
    <button data-new="habit">${icon('repeat', 16)}Gewohnheit</button>
    <button data-new="goal">${icon('flag', 16)}Ziel</button>
    <button data-new="project">${icon('folder', 16)}Projekt</button>
    <button data-new="person">${icon('person', 16)}Person</button>
  </div>`;
  const run = k => {
    closePopover();
    if (k === 'capture') A.capture();
    if (k === 'task') A.newTask();
    if (k === 'event') A.newEvent();
    if (k === 'note') Nt.editNote(null);
    if (k === 'habit') Hab.editHabit(null);
    if (k === 'goal') Gl.editGoal(null);
    if (k === 'project') Pj.editProject(null);
    if (k === 'person') Pp.editPerson(null);
  };
  if (isMobile()) sheet({ title: 'Neu anlegen', cls: 'sheet-sm', body: html, onMount: (el, close) => el.addEventListener('click', e => { const b = e.target.closest('[data-new]'); if (b) { close(); run(b.dataset.new); } }) });
  else popover(anchor, html, { width: 230, place: 'below', onMount: el => el.addEventListener('click', e => { const b = e.target.closest('[data-new]'); if (b) run(b.dataset.new); }) });
}

function moreMenu() {
  const c = counts();
  const items = NAV.flatMap(g => g.items).filter(([k]) => !['cockpit', 'inbox', 'vorgaenge', 'kalender'].includes(k));
  sheet({
    title: 'Mehr', cls: 'sheet-sm',
    body: `<div class="menu">${items.map(([k, n, ic]) => `<a href="#/${k}">${icon(ic, 17)}${n}${k === 'gewohnheiten' && c.habitsOpen ? `<span class="sp"></span><span class="small muted">${c.habitsOpen}</span>` : ''}${k === 'notizen' && c.notesOpen ? `<span class="sp"></span><span class="small muted">${c.notesOpen}</span>` : ''}</a>`).join('')}
      <hr><button data-m="new">${icon('plus', 17)}Neu anlegen</button><button data-m="search">${icon('search', 17)}Suchen</button><button data-m="theme">${icon(themeIcon(), 17)}Farbmodus wechseln</button><button data-m="sync">${icon('sync', 17)}Jetzt synchronisieren</button></div>`,
    onMount: (el, close) => el.addEventListener('click', e => {
      const b = e.target.closest('a, [data-m]'); if (!b) return;
      close();
      if (b.dataset.m === 'new') newMenu(null);
      if (b.dataset.m === 'search') openSearch();
      if (b.dataset.m === 'theme') cycleTheme();
      if (b.dataset.m === 'sync') { if (SY.configured()) SY.syncNow({ force: true }); else A.nav('#/einstellungen/sync'); }
    }),
  });
}

/* ---------------- Mitteilungen (Glocke) ---------------- */
const MSG_ICON = { reminder: '⏰', due: '🔔', yellow: '🟡', red: '🔴', alarm: '🚨', event: '📅', note: '📌', habit: '🔁', inbox: '📥', person: '🎂', focus: '✨' };
function openBell() {
  const c = counts();
  const list = N.messages();
  const attn = [
    ['Überfällig', c.red, '#/vorgaenge?f=over', c.red ? 'red' : ''],
    ['Inbox wartet zu lange', c.inboxRed, '#/inbox', c.inboxRed ? 'red' : ''],
    ['Notizen einprägen', c.notesOpen, '#/notizen', ''],
    ['Gewohnheiten offen', c.habitsOpen, '#/gewohnheiten', ''],
    ['Offene Klärungen', c.klar, '#/beziehungen', ''],
    ['In der Inbox', c.inbox, '#/inbox', ''],
  ];
  const sh = sheet({
    title: 'Mitteilungen', side: !isMobile(),
    body: `<div class="section-t" style="margin-top:0">Braucht deine Aufmerksamkeit</div>
      <div class="notif-attn">${attn.map(([l, n, h, cls]) => `<a class="attn ${cls} ${n ? '' : 'zero'}" href="${h}" data-close><b>${n}</b><span>${l}</span></a>`).join('')}</div>
      <div class="row"><div class="section-t grow" style="margin:0">Erinnerungen</div>${list.length ? '<button class="link-btn" data-clear>Alle entfernen</button>' : ''}</div>
      <div data-list>${list.length ? list.map(x => `<div class="notif lvl-${esc(x.level || '')}" data-id="${esc(x.id)}"><div class="ni">${MSG_ICON[x.level] || '🔔'}</div><div class="nb" data-open="${esc(x.id)}"><b>${esc(x.title)}</b><span>${esc(x.message || '')}\n${esc(C.fmtRelTime(x.firedAt || x.at))}</span>
          <div class="nacts">${x.ref && x.ref.type === 'note' ? `<button class="btn sm" data-read="${esc(x.ref.id)}">Gelesen</button>` : ''}${x.ref && x.ref.type === 'task' && S.task(x.ref.id) && C.isOpen(S.task(x.ref.id)) ? `<button class="btn sm" data-snooze="${esc(x.ref.id)}">1 Std später</button><button class="btn sm" data-focus="${esc(x.ref.id)}">${icon('play', 12)}Fokus</button>` : ''}</div></div>
          <button class="icon-btn sm" data-del="${esc(x.id)}" aria-label="Entfernen">${icon('x', 14)}</button></div>`).join('')
      : '<div class="empty" style="padding:24px 8px"><b>Keine Erinnerungen</b><div class="small">Erinnerungen bleiben hier stehen, bis du sie entfernst.</div></div>'}</div>`,
    onMount: (el, close) => el.addEventListener('click', e => {
      const d = e.target.closest('[data-del]');
      if (d) { N.removeMessage(d.dataset.del); d.closest('.notif').remove(); return; }
      if (e.target.closest('[data-clear]')) { N.clearMessages(); close(); return; }
      const rd = e.target.closest('[data-read]');
      if (rd) { Nt.markRead(rd.dataset.read); rd.closest('.notif').remove(); return; }
      const sn = e.target.closest('[data-snooze]');
      if (sn) { const t = S.task(sn.dataset.snooze); if (t) S.put('tasks', { ...t, snooze: Date.now() + C.HOUR }); toast('Erinnerung in 1 Std'); sn.closest('.notif').remove(); return; }
      const fc = e.target.closest('[data-focus]');
      if (fc) { close(); A.startFocus(fc.dataset.focus, { autostart: true }); return; }
      const o = e.target.closest('[data-open]');
      if (o) { const it = N.messages().find(x => x.id === o.dataset.open); close(); if (it) openRef(it.ref); }
    }),
  });
  setTimeout(() => N.markRead(), 500);
  return sh;
}

function openRef(ref) {
  if (!ref) return;
  if (ref.type === 'task' && S.task(ref.id)) openVorgang(ref.id);
  else if (ref.type === 'event' && S.event(ref.id)) openEventEditor(ref.id);
  else if (ref.type === 'note') A.nav('#/notizen/' + ref.id + '?lesen=1');
  else if (ref.type === 'habit') A.nav('#/gewohnheiten' + (ref.id ? '?h=' + ref.id : ''));
  else if (ref.type === 'person') A.nav('#/beziehungen/' + ref.id);
  else if (ref.type === 'inbox') A.nav('#/inbox');
  else if (ref.type === 'focus') A.nav('#/fokus');
}

/* ---------------- Suche ---------------- */
function openSearch() {
  closePopover();
  const cmds = [
    { k: 'Befehl', t: 'In die Inbox schreiben', run: () => A.capture() },
    { k: 'Befehl', t: 'Neuer Vorgang', run: () => A.newTask() },
    { k: 'Befehl', t: 'Neuer Termin', run: () => A.newEvent() },
    { k: 'Befehl', t: 'Fokus starten', run: () => A.startFocus(null) },
    { k: 'Befehl', t: 'Farbmodus wechseln', run: cycleTheme },
    ...NAV.flatMap(g => g.items).map(([k, n]) => ({ k: 'Seite', t: n, run: () => A.nav('#/' + k) })),
  ];
  sheet({
    title: null, cls: 'sheet-sm', label: 'Suche',
    body: `<div class="search-box">${icon('search', 18)}<input data-sq placeholder="Vorgänge, Termine, Notizen, Personen …" autofocus aria-label="Suchen"></div><div data-sres style="margin-top:8px;max-height:60vh;overflow:auto"></div>`,
    onMount: (el, close) => {
      const inp = el.querySelector('[data-sq]'); const box = el.querySelector('[data-sres]');
      let results = [], act = 0;
      const n = x => C.norm(x);
      const run = () => {
        const q = n(inp.value);
        results = [];
        if (q) {
          for (const t of S.tasks()) if (n(t.title + ' ' + (t.notes || '') + ' ' + (t.log || []).map(l => l.text).join(' ')).includes(q)) results.push({ k: C.isClosed(t) ? 'Archiv' : `#${String(t.no || 0).padStart(4, '0')}`, t: t.title, run: () => openVorgang(t.id) });
          for (const e of S.events()) if (n(e.title + ' ' + (e.loc || '')).includes(q)) results.push({ k: 'Termin ' + C.fmtDateShort(C.parseLocal(e.s)), t: e.title, run: () => openEventEditor(e.id) });
          for (const x of S.notes()) if (n(x.title + ' ' + (x.body || '')).includes(q)) results.push({ k: 'Notiz', t: x.title, run: () => A.nav('#/notizen/' + x.id) });
          for (const x of S.people()) if (n(x.name + ' ' + (x.rel || '')).includes(q)) results.push({ k: 'Person', t: x.name, run: () => A.nav('#/beziehungen/' + x.id) });
          for (const x of S.projects()) if (n(x.title).includes(q)) results.push({ k: 'Projekt', t: x.title, run: () => A.nav('#/projekte/' + x.id) });
          for (const x of S.goals()) if (n(x.title).includes(q)) results.push({ k: 'Ziel', t: x.title, run: () => Gl.editGoal(x) });
          for (const x of S.habits()) if (n(x.title).includes(q)) results.push({ k: 'Gewohnheit', t: x.title, run: () => Hab.editHabit(x) });
          for (const x of S.inboxItems()) if (n(x.text).includes(q)) results.push({ k: 'Inbox', t: x.text, run: () => A.nav('#/inbox') });
          for (const c of cmds) if (n(c.t).includes(q)) results.push(c);
        } else results = cmds;
        results = results.slice(0, 50); act = 0;
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
  const s = S.settings(); const now = new Date();
  alarmEl = document.createElement('div');
  alarmEl.className = 'alarm-back';
  alarmEl.setAttribute('role', 'alertdialog');
  alarmEl.setAttribute('aria-label', 'Alarm: überfällige Vorgänge');
  alarmEl.innerHTML = `<div class="alarm-box"><h2><span class="siren">${icon('alert', 20)}</span>${list.length === 1 ? 'Ein Vorgang ist im Alarm' : `${list.length} Vorgänge sind im Alarm`}</h2>
    <p class="small muted" style="margin:8px 0 2px">Diese Vorgänge sind deutlich überfällig. Kümmere dich jetzt darum oder plane sie bewusst neu.</p>
    ${list.slice(0, 6).map(t => { const h = C.ampel(t, now, s).overdueH || 0; return `<div class="alarm-item" data-aid="${t.id}"><div class="t">${esc(t.title)}</div><div class="m">Seit ${h >= 48 ? Math.round(h / 24) + ' Tagen' : Math.round(h) + ' Stunden'} überfällig</div>
      <div class="acts"><button class="btn sm btn-danger" data-al="focus">${icon('play', 12)}Jetzt erledigen</button><button class="btn sm" data-al="done">${icon('check', 13)}Erledigt</button><button class="btn sm" data-al="tomorrow">Auf morgen</button><button class="btn sm btn-ghost" data-al="snooze">1 Std später</button></div></div>`; }).join('')}
    <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn" data-al="ack">Ich kümmere mich gleich</button></div></div>`;
  document.body.appendChild(alarmEl);
  if (S.local.sound) chime('alert');
  vibrate([300, 120, 300]);
  alarmEl.addEventListener('click', async e => {
    const b = e.target.closest('[data-al]'); if (!b) return;
    const a = b.dataset.al;
    if (a === 'ack') { N.ackAlarm(); closeAlarm(); return; }
    const item = b.closest('[data-aid]'); const id = item && item.dataset.aid;
    const t = S.task(id); if (!t) return;
    if (a === 'focus') { closeAlarm(); N.ackAlarm(); A.startFocus(id, { autostart: true }); return; }
    if (a === 'done') { alarmEl.style.visibility = 'hidden'; const ok = await A.completeTask(id, b); if (alarmEl) alarmEl.style.visibility = ''; if (!ok) return; }
    if (a === 'tomorrow') S.put('tasks', C.addLog({ ...t, due: C.ymd(C.addDays(new Date(), 1)), snooze: null }, 'Auf morgen verschoben (Alarm)', 'system'));
    if (a === 'snooze') S.put('tasks', { ...t, snooze: Date.now() + C.HOUR });
    item.remove();
    if (alarmEl && !alarmEl.querySelector('[data-aid]')) closeAlarm();
  });
}
function closeAlarm() { if (alarmEl) { alarmEl.remove(); alarmEl = null; } }

/* ---------------- Deep Links ---------------- */
function handleOpen(params) {
  const o = params.open;
  if (!o) return false;
  if (o === 'task' && params.id) { if (S.task(params.id)) setTimeout(() => openVorgang(params.id), 60); else toast('Diesen Vorgang gibt es nicht mehr'); }
  else if (o === 'event' && params.id) {
    const ev = S.event(params.id);
    if (ev) { if (params.d) Cal.setCur(C.parseYmd(params.d)); Cal.setView('d'); A.nav('#/kalender/tag'); setTimeout(() => openEventEditor(params.id, {}, ev.rec && params.d ? C.parseLocal(params.d + 'T' + (ev.s.slice(11, 16) || '00:00')) : null), 120); }
  }
  else if (o === 'focus') { if (params.task && S.task(params.task)) A.startFocus(params.task, { autostart: params.start === '1' && !F.run() }); else A.nav('#/fokus'); }
  else if (o === 'note' && params.id) A.nav('#/notizen/' + params.id + '?lesen=1');
  else if (o === 'habit') A.nav('#/gewohnheiten' + (params.id ? '?h=' + params.id : ''));
  else if (o === 'person' && params.id) A.nav('#/beziehungen/' + params.id);
  else if (o === 'inbox') A.nav('#/inbox');
  else if (o === 'capture' || o === 'newtask') setTimeout(() => (o === 'capture' ? A.capture() : A.newTask()), 100);
  else if (o === 'newevent') setTimeout(() => A.newEvent(), 100);
  else if (o === 'start') A.nav('#/cockpit');
  return true;
}
function handleUrlOpen(url) { try { const u = new URL(url, location.href); handleOpen(Object.fromEntries(u.searchParams)); } catch { } }

async function handlePair() {
  const m = location.hash.match(/#pair=([A-Za-z0-9_-]+)/);
  if (!m) return;
  history.replaceState(null, '', location.pathname + '#/cockpit');
  let p;
  try { p = SY.readPairPayload(m[1]); } catch { toast('Der Kopplungscode ist ungültig', { kind: 'bad' }); return; }
  const ok = await confirmDialog('Dieses Gerät mit deinem Zeitblick-Sync verbinden? Danach sind alle Daten auf allen Geräten gleich.', { ok: 'Verbinden', title: 'Gerät verbinden' });
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
  if (S.local.onboarded || S.tasks().length || S.events().length || S.inboxItems().length) return;
  sheet({
    title: 'Willkommen in deiner Lebenszentrale', cls: 'sheet-sm',
    body: `<p class="confirm-text">Zeitblick bündelt alles, was in deinem Leben passiert: Vorgänge, Termine, Gewohnheiten, Notizen, Ziele, Projekte und Beziehungen.</p>
      <ul class="small" style="padding-left:18px;color:var(--ink-2);line-height:1.8;margin:8px 0 12px"><li>Gedanken landen zuerst in der <b>Inbox</b>.</li><li>Daraus werden <b>Vorgänge</b> – jedes Anliegen ist ein Ticket mit Status.</li><li>Im <b>Kalender</b> planst du sie per Timeboxing ein, im <b>Fokus</b> erledigst du sie.</li></ul>
      <p class="small muted">Kategorien und Lebensbereiche legst du selbst an – beim Anlegen bekommst du Vorschläge. Möchtest du erst mit Beispielen schauen? Sie lassen sich später mit einem Klick entfernen.</p>`,
    footer: `<button class="btn" data-w="empty">Leer starten</button><button class="btn btn-primary" data-w="demo">Mit Beispielen ansehen</button>`,
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
  const params = Object.fromEntries(new URLSearchParams(location.search));
  if (params.open || params.r) history.replaceState(null, '', location.pathname + (location.hash && !location.hash.startsWith('#pair') ? location.hash : '#/' + (S.local.startPage || 'cockpit')));
  render();

  S.subscribe(info => {
    if (info.local) SY.schedulePush();
    N.scheduleReconcile(info.remote ? 6000 : 3500);
    O.schedule();
    if (info.col === 'tasks' && info.rec && (C.isClosed(info.rec) || info.rec.deleted)) N.resolveRef('task', info.id);
    if (info.col === 'notes' && info.rec && info.rec.reads) { const n = info.rec; if (!C.noteOpenToday(n, new Date())) N.resolveRef('note', n.id); }
    if (info.col === 'habits' && info.rec && C.habitDoneOn(info.rec, C.ymd(new Date()))) N.resolveRef('habit', info.id);
    if (info.noRender) { updateShell(parseRoute()); return; }
    scheduleRender();
  });
  SY.onState(() => updateSyncDot());
  N.onState(() => { if (parseRoute().name === 'einstellungen') scheduleRender(); });
  O.onState(() => { if (parseRoute().name === 'einstellungen') scheduleRender(); });
  F.onChange(info => {
    Fo.onEngine(info); N.scheduleReconcile(800);
    if (info && info.started) {
      // Fokus gestartet: Vorgang ist jetzt „In Bearbeitung“
      const r = F.run(); const t = r && r.kind === 'focus' && r.taskId ? S.task(r.taskId) : null;
      if (t && ['neu', 'geplant'].includes(C.statusOf(t))) S.put('tasks', C.setStatus(t, 'aktiv', new Date()));
    }
    if (info && (info.completed || info.failed) && document.visibilityState !== 'visible') N.showSystem({ rid: 'zb-focusend-' + Date.now(), title: info.completed ? '✨ Fokuszeit geschafft' : 'Fokus abgebrochen', message: info.completed ? 'Dein Kristall ist voll aufgeladen.' : 'Dein Kristall ist zerbrochen.', ref: { type: 'focus', id: 'f' } });
    scheduleRender();
  });
  N.setHooks({
    onFire: r => {
      if (S.local.sound) chime(r.priority >= 5 ? 'alert' : 'soft');
      toast(esc(r.title), { action: r.ref && r.ref.type !== 'focus' ? 'Öffnen' : undefined, onAction: () => openRef(r.ref), ms: 8000, kind: r.priority >= 5 ? 'bad' : '' });
      updateShell(parseRoute());
    },
    onAlarm: list => { if (F.run()) return; showAlarm(list); },
    onMessages: () => updateShell(parseRoute()),
    onOpen: url => handleUrlOpen(url),
  });
  O.setAppUrl(() => N.appUrl());

  window.addEventListener('hashchange', () => { closePopover(); closeAllSheets(); render(); window.scrollTo(0, 0); });
  let wasMobile = isMobile();
  window.addEventListener('resize', () => { placeThumb(document.getElementById('areaSeg')); const m = isMobile(); if (m !== wasMobile) { wasMobile = m; scheduleRender(); } });
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
      if (k === 'bell') openBell();
      if (k === 'more') moreMenu();
      if (k === 'capture') A.capture();
      if (k === 'sidetoggle') { S.local.sideCompact = !S.local.sideCompact; S.saveLocal(); render(); }
      return;
    }
    const ar = t.closest('[data-setarea]');
    if (ar) { S.local.area = ar.dataset.setarea; S.saveLocal(); render(); return; }
    if (t.closest('#syncBtn')) { if (SY.configured()) { SY.syncNow({ force: true }); toast('Synchronisiere …', { ms: 1200 }); } else A.nav('#/einstellungen/sync'); return; }
    if (t.closest('.sheet')) return; // Dialoge behandeln ihre Klicks selbst
    const act = t.closest('[data-act][data-id]');
    if (act && (act.dataset.act === 'done' || act.dataset.act === 'focus')) {
      e.preventDefault(); e.stopPropagation();
      if (act.dataset.act === 'done') A.completeTask(act.dataset.id, act);
      else { closePopover(); A.startFocus(act.dataset.id, { autostart: true }); }
      return;
    }
    if (t.closest('select, input, textarea, label')) return;
    const btn = t.closest('button, a');
    if (btn && !btn.matches('[data-task], [data-event]')) return;
    const tk = t.closest('[data-task]');
    if (tk) { closePopover(); openVorgang(tk.dataset.task); return; }
    const ev = t.closest('[data-event]');
    if (ev) { closePopover(); const x = S.event(ev.dataset.event); if (x) openEventEditor(x.id, {}, x.rec && ev.dataset.occ ? new Date(Number(ev.dataset.occ)) : null); }
  });
  // Status direkt in Listen ändern
  document.addEventListener('change', e => {
    const sel = e.target.closest && e.target.closest('select[data-status]');
    if (!sel || sel.closest('.sheet')) return;
    const id = sel.dataset.status;
    const t = S.task(id); if (!t) return;
    const val = sel.value;
    sel.value = C.statusOf(t);
    A.setStatus(id, val);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (alarmEl) return;
      if (document.querySelector('.popover')) { closePopover(); return; }
      const s = topSheet(); if (s) { s.close('esc'); return; }
    }
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;
    if (topSheet() || alarmEl || e.altKey) return;
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); openSearch(); return; }
    if (e.ctrlKey || e.metaKey) return;
    const route = parseRoute();
    if (route.name === 'kalender' && Cal.keyNav(e.key)) { e.preventDefault(); return; }
    const map = { 1: 'cockpit', 2: 'inbox', 3: 'vorgaenge', 4: 'kalender', 5: 'matrix', 6: 'fokus', 7: 'gewohnheiten', 8: 'notizen', 9: 'ziele' };
    if (map[e.key]) { A.nav('#/' + map[e.key]); return; }
    if (e.key === 'n') { e.preventDefault(); A.newTask(); }
    if (e.key === 'i') { e.preventDefault(); A.capture(); }
    if (e.key === 'e') { e.preventDefault(); A.newEvent(); }
    if (e.key === 'f') { e.preventDefault(); A.startFocus(null); }
    if (e.key === '/') { e.preventDefault(); openSearch(); }
  });

  // Service Worker
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !A.preview) {
    try {
      const hadController = !!navigator.serviceWorker.controller;
      const reg = await navigator.serviceWorker.register('sw.js');
      navigator.serviceWorker.addEventListener('message', ev => { if (ev.data && ev.data.type === 'open') handleUrlOpen(ev.data.url); });
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) toast('Neue Version von Zeitblick ist bereit', { action: 'Neu laden', onAction: () => location.reload(), ms: 15000 }); });
      setInterval(() => reg.update().catch(() => { }), 60 * 60000);
    } catch (err) { console.info('Service Worker nicht verfügbar:', err.message); }
  }
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); Se.setInstallPrompt(e); });

  SY.start();
  if (SY.configured()) SY.syncNow({ force: true });
  N.start();
  await O.init();
  S.dailySnapshot();

  setInterval(() => {
    F.tick();
    updateFocusMini();
    const now = new Date();
    if (now.getMinutes() !== lastMinute) {
      lastMinute = now.getMinutes();
      const r = parseRoute();
      if (r.name === 'kalender') Cal.tickNow(document.getElementById('main'));
      if (['cockpit', 'vorgaenge', 'matrix', 'inbox'].includes(r.name) && !document.querySelector('.sheet-back, .popover') && !A.dragging) {
        const ae = document.activeElement; if (!(ae && /input|textarea|select/i.test(ae.tagName))) scheduleRender();
      }
      if (now.getMinutes() === 0) { S.dailySnapshot(); if (A.applyTheme()) render(); }
    }
    if (!A.dragging && pendingAfterDrag) { pendingAfterDrag = false; scheduleRender(); }
  }, 1000);

  if (params.open) handleOpen(params);
  await handlePair();
  setTimeout(() => { welcome(); N.checkAlarm(true); }, 900);
}

boot().catch(e => {
  console.error(e);
  const app = document.getElementById('app');
  if (app) app.innerHTML = `<div class="empty" style="padding:60px 20px"><div class="em">⚠️</div><b>Zeitblick konnte nicht starten</b><div class="small">${esc(e.message)}</div></div>`;
});
