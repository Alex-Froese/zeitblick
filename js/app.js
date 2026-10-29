// Zeitblick 3 – Lebenszentrale: Start, Navigation, Rahmen, Aktionen, Tastenkürzel
import * as C from './core.js';
import * as S from './store.js';
import * as SY from './sync.js';
import * as N from './notify.js';
import * as O from './obsidian.js';
import * as F from './focus-engine.js';
import * as K from './actions.js';
import { esc, icon, toast, sheet, popover, closePopover, topSheet, closeAllSheets, initTooltips, burst, isMobile, confirmDialog, setConfirmSec } from './ui.js';
import { chime, vibrate } from './audio.js';
import { A } from './app-api.js';
import { openEventEditor, placeThumb } from './editors.js';
import { openVorgang } from './detail.js';
import { openBell } from './bell.js';
import { startRoutine } from './player.js';
import { openLinkPicker } from './links.js';
import { seedDemo, removeDemo, hasDemo, seedTemplates } from './demo.js';
import * as Heute from './views/heute.js';
import * as Inbox from './views/inbox.js';
import * as Vg from './views/vorgaenge.js';
import * as Cal from './views/calendar.js';
import * as Fo from './views/focus.js';
import * as Hab from './views/habits.js';
import * as Nt from './views/notes.js';
import * as Gl from './views/goals.js';
import * as Pj from './views/projects.js';
import * as Lf from './views/life.js';
import * as Pp from './views/people.js';
import * as Rv from './views/rueckblick.js';
import * as Vl from './views/verlauf.js';
import * as Ar from './views/archive.js';
import * as Gd from './views/guide.js';
import * as Se from './views/settings.js';

/* ---------------- Module ---------------- */
export const MODULES = [
  { id: 'heute', name: 'Heute', icon: 'home', group: 'main', view: Heute },
  { id: 'inbox', name: 'Inbox', icon: 'inbox', group: 'main', view: Inbox },
  { id: 'vorgaenge', name: 'Vorgänge', icon: 'list', group: 'main', view: Vg },
  { id: 'kalender', name: 'Kalender', icon: 'calendar', group: 'main', view: Cal, full: true },
  { id: 'fokus', name: 'Fokus', icon: 'focus', group: 'main', view: Fo },
  { id: 'gewohnheiten', name: 'Gewohnheiten', icon: 'repeat', group: 'leben', view: Hab },
  { id: 'notizen', name: 'Notizen', icon: 'notes', group: 'leben', view: Nt },
  { id: 'lebensbereiche', name: 'Lebensbereiche', icon: 'layers', group: 'leben', view: Lf },
  { id: 'ziele', name: 'Ziele', icon: 'flag', group: 'leben', view: Gl },
  { id: 'projekte', name: 'Projekte', icon: 'folder', group: 'leben', view: Pj },
  { id: 'beziehungen', name: 'Beziehungen', icon: 'person', group: 'leben', view: Pp },
  { id: 'rueckblick', name: 'Rückblicke', icon: 'book', group: 'reflexion', view: Rv },
  { id: 'verlauf', name: 'Verlauf', icon: 'clock', group: 'reflexion', view: Vl },
  { id: 'archiv', name: 'Archiv', icon: 'archive', group: 'system', view: Ar },
  { id: 'anleitung', name: 'Anleitung', icon: 'gem', group: 'system', view: Gd },
  { id: 'einstellungen', name: 'Einstellungen', icon: 'settings', group: 'system', view: Se },
];
export const NAV_GROUPS = [['main', ''], ['leben', 'Leben'], ['reflexion', 'Reflexion'], ['system', 'System']];
const BY_ID = Object.fromEntries(MODULES.map(m => [m.id, m]));
const ALIASES = { start: 'heute', cockpit: 'heute', aufgaben: 'vorgaenge', tickets: 'vorgaenge', kategorie: 'vorgaenge', matrix: 'vorgaenge', journal: 'notizen', historie: 'verlauf', rueckblicke: 'rueckblick' };
A.modules = MODULES; A.navGroups = NAV_GROUPS;

/** Navigation in der eingestellten Reihenfolge (Einstellungen → Navigation) */
export function navModules() {
  const n = S.settings().nav || {};
  const order = n.order || [];
  const hidden = new Set(n.hidden || []);
  const groups = n.groups || {};
  const idx = id => { const i = order.indexOf(id); return i < 0 ? 100 + MODULES.findIndex(m => m.id === id) : i; };
  return NAV_GROUPS.map(([g, label]) => ({ g, label, items: MODULES.filter(m => (groups[m.id] || m.group) === g && !hidden.has(m.id) && (m.id !== 'einstellungen' || true)).sort((a, b) => idx(a.id) - idx(b.id)) })).filter(x => x.items.length);
}
A.navModules = navModules;
function flatNav() { return navModules().flatMap(g => g.items); }

let viewAbort = null;
let renderQueued = false;
let pendingAfterDrag = false;
let lastMinute = -1;

/* ---------------- Routing ---------------- */
function parseRoute() {
  const h = (location.hash || '').replace(/^#\/?/, '');
  const [path, qs] = h.split('?');
  const parts = path.split('/').filter(Boolean);
  const params = Object.fromEntries(new URLSearchParams(qs || ''));
  let first = parts[0];
  if (first === 'matrix') params.mode = 'matrix';
  if (first === 'journal') { parts.splice(1, 0, 'journal'); }
  let name = first ? (ALIASES[first] || first) : (S.local.startPage || 'heute');
  if (ALIASES[name]) name = ALIASES[name];
  if (!BY_ID[name]) name = 'heute';
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
A.startRoutine = (id) => startRoutine(id);
A.openLinkPicker = openLinkPicker;
A.startReview = (type = 'day', date) => Rv.startReview(type, date);
A.markNoteRead = (id) => Nt.markRead(id);
A.openHabit = (id) => { const h = S.get('habits', id); if (!h) return; if (h.kind === 'routine') startRoutine(id); else A.nav('#/gewohnheiten?h=' + id); };
A.dragging = false;
A.preview = (() => { try { return window.top !== window.self; } catch { return true; } })();

/* ---------------- Darstellung ---------------- */
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
/** Oberflächengröße und Dichte anwenden (geräteweise) */
A.applyUi = () => {
  const sc = Math.max(0.65, Math.min(1.2, Number(S.local.uiScale) || 0.86));
  document.documentElement.style.setProperty('--ui-scale', String(sc));
  const d = S.local.density || 'normal';
  document.body.classList.toggle('dens-compact', d === 'kompakt');
  document.body.classList.toggle('dens-airy', d === 'luftig');
  document.body.classList.toggle('cal-full', !!S.local.calFull && parseRoute().name === 'kalender');
  setConfirmSec(S.settings().confirmSec ?? 3);
};
function cycleTheme() {
  const order = ['light', 'dark', 'night', 'auto'];
  S.local.theme = order[(order.indexOf(S.local.theme || 'auto') + 1) % order.length];
  S.saveLocal(); A.applyTheme();
  toast(`Farbmodus: ${{ light: 'Hell', dark: 'Dunkel', night: 'Nacht (Rotlicht)', auto: 'Wie System' }[S.local.theme]}`, { ms: 1800 });
  render();
}
function themeIcon() { const t = S.local.theme || 'auto'; return t === 'light' ? 'sun' : t === 'dark' ? 'moon' : t === 'night' ? 'night' : 'auto'; }
function setArea(a) { S.local.area = a; S.saveLocal(); render(); toast(a === 'p' ? 'Privat' : a === 'b' ? 'Geschäftlich' : 'Alles', { ms: 900 }); }

/* ---------------- Rahmen ---------------- */
function shellHtml() {
  return `
  <header class="topbar">
    <a class="brand" href="#/heute" aria-label="Zeitblick – Heute">
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
      <button class="icon-btn hide-m" data-global="search" aria-label="Suchen" title="Suchen und Befehle (Strg+K)">${icon('search', 18)}</button>
      <button class="icon-btn hide-m" data-global="theme" aria-label="Farbmodus wechseln" title="Farbmodus" id="themeBtn">${icon('sun', 18)}</button>
      <button class="icon-btn" data-global="bell" aria-label="Mitteilungen" title="Mitteilungen" id="bellBtn">${icon('bell', 18)}<span class="badge hide" id="bellBadge">0</span></button>
      <button class="btn btn-primary hide-m" data-global="new" style="margin-left:6px">${icon('plus', 15)}Neu</button>
    </div>
  </header>
  <div class="layout">
    <nav class="sidebar" id="sidebar" aria-label="Hauptnavigation"></nav>
    <main class="main" id="main" tabindex="-1"></main>
  </div>
  <nav class="bottomnav" id="bottomnav" aria-label="Navigation"></nav>
  <button class="fab" data-global="capture" aria-label="In die Inbox schreiben (lange drücken für mehr)">${icon('plus', 24)}</button>
  <button class="calfull-exit" data-global="calfull" aria-label="Vollbild verlassen" title="Vollbild verlassen (V)">${icon('x', 18)}</button>`;
}

function counts() {
  const now = new Date();
  const s = S.settings();
  const area = A.area();
  const open = S.openTasks(t => S.inArea(t, area));
  const red = open.filter(t => { const l = C.ampel(t, now, s).level; return l === 'red' || l === 'alarm'; }).length;
  const inbox = S.inboxItems();
  const inboxRed = inbox.filter(x => C.inboxAmpel(x, now) === 'red').length;
  const klar = S.openTasks(t => C.typeOf(t) === 'klaerung').length;
  const ag = C.agendaFor(S.getData(), now, now);
  const open2 = k => { const x = ag.kinds[k]; return x ? x[1] - x[0] : 0; };
  return { open: open.length, red, inbox: inbox.length, inboxRed, klar, ag, habitsOpen: open2('habit') + open2('routine'), notesOpen: open2('note'), todayOpen: ag.total - ag.done };
}

function sidebarHtml(route) {
  const c = counts();
  const compact = route.name === 'kalender' || !!S.local.sideCompact;
  const cnt = {
    heute: c.todayOpen ? `<span class="cnt">${c.todayOpen}</span>` : '',
    inbox: c.inbox ? `<span class="cnt ${c.inboxRed ? 'red' : ''}">${c.inbox}</span>` : '',
    vorgaenge: c.red ? `<span class="cnt red">${c.red}</span>` : c.open ? `<span class="cnt">${c.open}</span>` : '',
    gewohnheiten: c.habitsOpen ? `<span class="cnt">${c.habitsOpen}</span>` : '',
    notizen: c.notesOpen ? `<span class="cnt">${c.notesOpen}</span>` : '',
    beziehungen: c.klar ? `<span class="cnt">${c.klar}</span>` : '',
  };
  return navModules().map(g => `${g.label ? `<div class="nav-label">${g.label}</div>` : ''}<div class="nav">${g.items.map(m => `<a href="#/${m.id}" class="${route.name === m.id ? 'on' : ''}" data-nav="${m.id}" ${compact ? `title="${m.name}"` : ''}>${icon(m.icon, 16)}<span>${m.name}</span>${cnt[m.id] || ''}</a>`).join('')}</div>`).join('')
    + `<div class="side-foot"><button class="icon-btn sm" data-global="sidetoggle" title="${S.local.sideCompact ? 'Navigation ausklappen' : 'Navigation einklappen'} ([)" aria-label="Navigation ein- oder ausklappen" ${route.name === 'kalender' ? 'hidden' : ''}>${icon(S.local.sideCompact ? 'right' : 'left', 15)}</button></div>`;
}

function bottomHtml(route) {
  const items = flatNav().filter(m => m.id !== 'einstellungen').slice(0, 4);
  const c = counts();
  return items.map(m => `<a href="#/${m.id}" data-nav="${m.id}" class="${route.name === m.id ? 'on' : ''}">${icon(m.icon, 20)}<span>${m.name}</span>${m.id === 'inbox' && c.inbox ? `<i class="bn-badge">${c.inbox}</i>` : m.id === 'heute' && c.todayOpen ? `<i class="bn-badge soft">${c.todayOpen}</i>` : ''}</a>`).join('')
    + `<button data-global="more" data-nav="more" class="${items.some(m => m.id === route.name) ? '' : 'on'}">${icon('menu', 20)}<span>Mehr</span></button>`;
}

function updateShell(route) {
  document.body.dataset.area = A.area();
  const seg = document.getElementById('areaSeg');
  seg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.setarea === A.area()));
  placeThumb(seg);
  document.body.classList.toggle('side-compact', route.name === 'kalender' || !!S.local.sideCompact);
  document.getElementById('sidebar').innerHTML = sidebarHtml(route);
  document.getElementById('bottomnav').innerHTML = bottomHtml(route);
  document.getElementById('themeBtn').innerHTML = icon(themeIcon(), 18);
  const c = counts();
  const unread = N.unreadCount();
  const n = unread || (c.red + c.inboxRed);
  const bb = document.getElementById('bellBadge');
  bb.textContent = n > 99 ? '99+' : String(n);
  bb.classList.toggle('hide', !n);
  bb.classList.toggle('soft', !unread && !c.red && !c.inboxRed);
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
  A.applyUi();
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
  const M = BY_ID[route.name];
  const V = M.view;
  let html = '';
  try { html = V.render(route); } catch (e) { console.error(e); html = `<div class="empty"><div class="em">⚠️</div><b>Diese Ansicht konnte nicht geladen werden</b><div class="small">${esc(e.message)}</div></div>`; }
  const root = document.createElement('div');
  root.className = 'view view-' + route.name;
  root.innerHTML = html;
  main.replaceChildren(root);
  main.classList.toggle('full', !!M.full);
  main.dataset.view = route.name + '/' + (route.parts[0] || '');
  for (const [k, v] of Object.entries(scrolls)) { const el = main.querySelector(`[data-keep-scroll="${k}"]`); if (el) el.scrollTop = v; }
  try { V.mount && V.mount(root, { signal: viewAbort.signal }, route); } catch (e) { console.error(e); }
  if (sameView) window.scrollTo(0, winY);
  if (keep) {
    const el = document.getElementById(keep.id);
    if (el) { try { el.focus({ preventScroll: true }); if (keep.v !== undefined && el.value !== undefined && el.value !== keep.v) el.value = keep.v; if (el.setSelectionRange && keep.s != null) el.setSelectionRange(keep.s, keep.e); } catch { } }
  }
  updateShell(route);
  document.title = `${M.name} – Zeitblick`;
}

/* ---------------- Vorgänge: Erledigen / Verwerfen / Löschen (immer mit Rückfrage) ---------------- */
A.completeTask = async (id, el) => {
  const t = S.task(id); if (!t) return false;
  if (C.isClosed(t)) return false;
  const rec = t.rec && t.rec.f;
  const ok = await confirmDialog(`„${esc(t.title)}“ ${rec ? 'für dieses Mal als erledigt markieren? Der nächste Termin wird automatisch angelegt.' : 'als erledigt markieren? Der Vorgang wandert danach ins Archiv.'}`, { ok: 'Erledigen', title: 'Vorgang erledigen?', cooldown: 3 });
  if (!ok) return false;
  const prev = C.structuredCloneSafe(S.task(id) || t);
  burst(el && el.isConnected ? el : null, 'var(--accent)');
  if (S.local.sound) chime('done');
  vibrate(12);
  const next = C.completeTask(prev, new Date());
  S.put('tasks', next);
  N.resolveRef('task', id);
  toast(next.done ? '✓ Erledigt – im Archiv' : `✓ Erledigt. Nächstes Mal: ${esc(C.fmtDue(next.due, next.dueTime))}`, { action: 'Rückgängig', onAction: () => S.put('tasks', { ...prev, log: prev.log }) });
  return true;
};
/** Mehrmals-täglich: einen Durchgang abhaken; beim letzten wird der Vorgang (mit Rückfrage) erledigt */
A.multiTick = async (id, el) => {
  const t = S.task(id); if (!t || !t.multi || !t.multi.on) return;
  const key = C.ymd(new Date());
  const total = t.multi.mode === 'remind' ? 1 : Math.max(1, C.multiSlots(t, new Date()).length);
  const n = C.multiDoneOn(t, key);
  if (n + 1 >= total) { const ok = await A.completeTask(id, el); return ok; }
  const md = { ...(t.multiDone || {}) }; md[key] = n + 1;
  for (const k of Object.keys(md)) if (k < C.ymd(C.addDays(new Date(), -30))) delete md[k];
  S.put('tasks', { ...t, multiDone: md });
  burst(el && el.isConnected ? el : null, 'var(--accent)');
  toast(`${esc(t.title)}: ${n + 1} von ${total}`, { ms: 1600, action: 'Rückgängig', onAction: () => { const x = S.task(id); if (x) S.put('tasks', { ...x, multiDone: { ...(x.multiDone || {}), [key]: n } }); } });
  N.resolveRef('task', id);
  return true;
};
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
/** Quadrant 3: an eine Person abgeben */
A.delegateTask = (id, anchor) => {
  const t = S.task(id); if (!t) return;
  const people = S.people().sort((a, b) => a.name.localeCompare(b.name));
  const html = `<div><b>Delegieren</b><div class="small muted" style="margin:2px 0 10px">${esc(t.title)}</div>
    <input class="input" data-dn list="zb-dpeople" placeholder="An wen? (Name)" value="${esc(t.delegate || '')}" aria-label="Name"><datalist id="zb-dpeople">${people.map(p => `<option value="${esc(p.name)}">`).join('')}</datalist>
    <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn sm btn-primary" data-dok>Delegieren</button></div></div>`;
  const go = (el, close) => {
    const name = el.querySelector('[data-dn]').value.trim(); if (!name) { el.querySelector('[data-dn]').focus(); return; }
    const p = people.find(x => C.norm(x.name) === C.norm(name));
    let x = { ...S.task(id), delegate: name, people: p ? [...new Set([...(t.people || []), p.id])] : (t.people || []) };
    if (C.statusOf(x) !== 'wartet') x = C.setStatus(x, 'wartet', new Date());
    S.put('tasks', C.addLog(x, `Delegiert an ${name}`, 'system'));
    toast(`An ${esc(name)} delegiert – Status „Wartet“`);
    close();
  };
  popover(anchor, html, { width: 280, place: 'below', onMount: (el, close) => { const i = el.querySelector('[data-dn]'); setTimeout(() => i.focus(), 30); el.querySelector('[data-dok]').addEventListener('click', () => go(el, close)); i.addEventListener('keydown', e => { if (e.key === 'Enter') go(el, close); }); } });
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
      <p class="hint" style="margin-top:12px">Einfach reinschreiben. Einsortieren kannst du später in der Inbox. Umschalt+Enter speichert und lässt das Feld offen.</p>`,
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

const NEW_ITEMS = [
  ['capture', 'In die Inbox', 'inbox', 'new.capture'], ['task', 'Vorgang', 'list', 'new.task'], ['event', 'Termin', 'calendar', 'new.event'],
  null, ['note', 'Notiz', 'notes', 'new.note'], ['journal', 'Journal heute', 'book', 'new.journal'], ['habit', 'Gewohnheit / Routine', 'repeat', 'new.habit'],
  ['goal', 'Ziel', 'flag', 'new.goal'], ['project', 'Projekt', 'folder', 'new.project'], ['person', 'Person', 'person', 'new.person'],
];
function newMenu(anchor) {
  const html = `<div class="menu">${NEW_ITEMS.map(x => x ? `<button data-new="${x[3]}">${icon(x[2], 16)}${x[1]}<span class="sp"></span>${K.keyOf(x[3]) ? K.prettyCombo(K.keyOf(x[3])) : ''}</button>` : '<hr>').join('')}</div>`;
  const run = id => { closePopover(); K.run(id); };
  if (isMobile() || !anchor) sheet({ title: 'Neu anlegen', cls: 'sheet-sm', body: html, onMount: (el, close) => el.addEventListener('click', e => { const b = e.target.closest('[data-new]'); if (b) { close(); run(b.dataset.new); } }) });
  else popover(anchor, html, { width: 250, place: 'below', onMount: el => el.addEventListener('click', e => { const b = e.target.closest('[data-new]'); if (b) run(b.dataset.new); }) });
}

function moreMenu() {
  const c = counts();
  const shown = new Set(flatNav().filter(m => m.id !== 'einstellungen').slice(0, 4).map(m => m.id));
  const items = flatNav().filter(m => !shown.has(m.id));
  sheet({
    title: 'Mehr', cls: 'sheet-sm',
    body: `<div class="menu">${items.map(m => `<a href="#/${m.id}">${icon(m.icon, 17)}${m.name}${m.id === 'gewohnheiten' && c.habitsOpen ? `<span class="sp"></span><span class="small muted">${c.habitsOpen}</span>` : ''}${m.id === 'notizen' && c.notesOpen ? `<span class="sp"></span><span class="small muted">${c.notesOpen}</span>` : ''}</a>`).join('')}
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

function openRef(ref) {
  if (!ref) return;
  if (ref.type === 'task' && S.task(ref.id)) openVorgang(ref.id);
  else if (ref.type === 'event' && S.event(ref.id)) openEventEditor(ref.id);
  else if (ref.type === 'note') A.nav('#/notizen/' + ref.id + '?lesen=1');
  else if (ref.type === 'habit') A.openHabit(ref.id);
  else if (ref.type === 'person') A.nav('#/beziehungen/' + ref.id);
  else if (ref.type === 'inbox') A.nav('#/inbox');
  else if (ref.type === 'review') A.startReview(ref.id);
  else if (ref.type === 'focus') A.nav('#/fokus');
}
A.openRef = openRef;
/** Beliebigen Eintrag öffnen (Verknüpfungen, Suche, Verlauf) */
A.openItem = (c, id) => {
  if (c === 'tasks') openVorgang(id);
  else if (c === 'notes') A.nav('#/notizen/' + id);
  else if (c === 'people') A.nav('#/beziehungen/' + id);
  else if (c === 'projects') A.nav('#/projekte/' + id);
  else if (c === 'goals') Gl.editGoal(S.get('goals', id));
  else if (c === 'life') A.nav('#/lebensbereiche/' + id);
  else if (c === 'habits') Hab.openHabitDetail(id);
  else if (c === 'events') openEventEditor(id);
  else if (c === 'reviews') A.nav('#/rueckblick/' + id);
};

/* ---------------- Suche & Befehle ---------------- */
function openSearch() {
  closePopover();
  const cmds = K.ACTIONS.filter(a => a.palette !== false).map(a => ({ k: K.keyOf(a.id) ? K.keyOf(a.id) : a.group, t: a.name, run: () => a.run(), cmd: true }));
  sheet({
    title: null, cls: 'sheet-sm sheet-search', label: 'Suche',
    body: `<div class="search-box">${icon('search', 18)}<input data-sq placeholder="Suchen oder Befehl eingeben …" autofocus aria-label="Suchen"></div><div data-sres style="margin-top:8px;max-height:62vh;overflow:auto"></div>`,
    onMount: (el, close) => {
      const inp = el.querySelector('[data-sq]'); const box = el.querySelector('[data-sres]');
      let results = [], act = 0;
      const n = x => C.norm(x);
      const runQ = () => {
        const q = n(inp.value);
        results = [];
        if (q) {
          for (const c of cmds) if (n(c.t).includes(q)) results.push(c);
          for (const t of S.tasks()) if (n(t.title + ' ' + (t.notes || '') + ' ' + (t.log || []).map(l => l.text).join(' ')).includes(q)) results.push({ k: C.isClosed(t) ? 'Archiv' : `#${String(t.no || 0).padStart(4, '0')}`, t: t.title, run: () => openVorgang(t.id) });
          for (const e of S.events()) if (n(e.title + ' ' + (e.loc || '')).includes(q)) results.push({ k: 'Termin ' + C.fmtDateShort(C.parseLocal(e.s)), t: e.title, run: () => openEventEditor(e.id) });
          let nn = 0;
          for (const x of S.notes()) { if (nn > 60) break; if (n(x.title + ' ' + (x.body || '') + ' ' + (x.tags || []).join(' ')).includes(q)) { nn++; results.push({ k: C.NOTE_KINDS[C.noteKind(x)].name, t: x.title || 'Ohne Titel', run: () => A.nav('#/notizen/' + x.id) }); } }
          for (const x of S.people()) if (n(x.name + ' ' + (x.rel || '')).includes(q)) results.push({ k: 'Person', t: x.name, run: () => A.nav('#/beziehungen/' + x.id) });
          for (const x of S.projects()) if (n(x.title).includes(q)) results.push({ k: 'Projekt', t: x.title, run: () => A.nav('#/projekte/' + x.id) });
          for (const x of S.goals()) if (n(x.title).includes(q)) results.push({ k: 'Ziel', t: x.title, run: () => Gl.editGoal(x) });
          for (const x of S.habits()) if (n(x.title).includes(q)) results.push({ k: x.kind === 'routine' ? 'Routine' : 'Gewohnheit', t: x.title, run: () => Hab.openHabitDetail(x.id) });
          for (const x of S.lifeAreas()) if (n(x.name).includes(q)) results.push({ k: 'Lebensbereich', t: x.name, run: () => A.nav('#/lebensbereiche/' + x.id) });
          for (const x of S.inboxItems()) if (n(x.text).includes(q)) results.push({ k: 'Inbox', t: x.text, run: () => A.nav('#/inbox') });
        } else results = [...flatNav().map(m => ({ k: 'Seite', t: m.name, run: () => A.nav('#/' + m.id) })), ...cmds.slice(0, 12)];
        results = results.slice(0, 60); act = 0;
        box.innerHTML = results.map((r, i) => `<div class="sres ${i === act ? 'act' : ''}" data-i="${i}">${r.cmd ? icon('bolt', 13) : ''}<span class="grow ellip">${esc(r.t)}</span><span class="k">${r.cmd && K.keyOf ? K.prettyCombo(r.k.includes('+') || r.k.length <= 3 || r.k.includes(' ') ? r.k : '') || esc(r.k) : esc(r.k)}</span></div>`).join('') || '<div class="muted small" style="padding:10px">Nichts gefunden.</div>';
      };
      inp.addEventListener('input', runQ);
      inp.addEventListener('keydown', e => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); act = Math.max(0, Math.min(results.length - 1, act + (e.key === 'ArrowDown' ? 1 : -1))); box.querySelectorAll('.sres').forEach((x, i) => x.classList.toggle('act', i === act)); box.querySelector('.sres.act')?.scrollIntoView({ block: 'nearest' }); }
        if (e.key === 'Enter' && results[act]) { const r = results[act]; close(); r.run(); }
      });
      box.addEventListener('click', e => { const r = e.target.closest('[data-i]'); if (r) { const x = results[Number(r.dataset.i)]; close(); x.run(); } });
      runQ();
    },
  });
}

/* ---------------- Aktionen (Tastenkürzel, Befehlspalette) ---------------- */
const NAV_KEYS = { heute: 'g h', inbox: 'g i', vorgaenge: 'g v', kalender: 'g k', fokus: 'g f', gewohnheiten: 'g g', notizen: 'g n', lebensbereiche: 'g l', ziele: 'g z', projekte: 'g p', beziehungen: 'g b', rueckblick: 'g r', verlauf: 'g o', archiv: 'g a', anleitung: 'g x', einstellungen: 'g e' };
function registerActions() {
  K.register([
    { id: 'search', name: 'Suchen & Befehle', group: 'Allgemein', keys: 'Strg+k', run: openSearch, palette: false },
    { id: 'search2', name: 'Suchen (alternativ)', group: 'Allgemein', keys: '/', run: openSearch, palette: false },
    { id: 'bell', name: 'Mitteilungen öffnen', group: 'Allgemein', keys: 'm', run: () => openBell(counts()) },
    { id: 'theme', name: 'Farbmodus wechseln', group: 'Allgemein', keys: 'Umschalt+t', run: cycleTheme },
    { id: 'area.p', name: 'Bereich: Privat', group: 'Allgemein', keys: 'Umschalt+p', run: () => setArea('p') },
    { id: 'area.all', name: 'Bereich: Alles', group: 'Allgemein', keys: 'Umschalt+a', run: () => setArea('all') },
    { id: 'area.b', name: 'Bereich: Geschäftlich', group: 'Allgemein', keys: 'Umschalt+b', run: () => setArea('b') },
    { id: 'keys', name: 'Alle Tastenkürzel zeigen', group: 'Allgemein', keys: '?', run: K.openShortcuts },
    { id: 'side', name: 'Navigation ein-/ausklappen', group: 'Allgemein', keys: '[', run: () => { S.local.sideCompact = !S.local.sideCompact; S.saveLocal(); render(); } },
    { id: 'focus.start', name: 'Fokus starten', group: 'Allgemein', keys: 'f', run: () => A.startFocus(null) },
    { id: 'review.day', name: 'Tagesabschluss starten', group: 'Allgemein', keys: 'Umschalt+r', run: () => A.startReview('day') },
    { id: 'new.capture', name: 'In die Inbox schreiben', group: 'Erstellen', keys: 'i', run: () => A.capture() },
    { id: 'new.task', name: 'Neuer Vorgang', group: 'Erstellen', keys: 'n', run: () => A.newTask() },
    { id: 'new.event', name: 'Neuer Termin', group: 'Erstellen', keys: 'e', run: () => A.newEvent() },
    { id: 'new.note', name: 'Neue Notiz', group: 'Erstellen', keys: 'Umschalt+n', run: () => Nt.editNote() },
    { id: 'new.journal', name: 'Journal von heute', group: 'Erstellen', keys: 'j', run: () => A.nav('#/notizen/journal') },
    { id: 'new.habit', name: 'Neue Gewohnheit oder Routine', group: 'Erstellen', keys: 'Umschalt+h', run: () => Hab.editHabit(null) },
    { id: 'new.goal', name: 'Neues Ziel', group: 'Erstellen', keys: '', run: () => Gl.editGoal(null) },
    { id: 'new.project', name: 'Neues Projekt', group: 'Erstellen', keys: '', run: () => Pj.editProject(null) },
    { id: 'new.person', name: 'Neue Person', group: 'Erstellen', keys: '', run: () => Pp.editPerson(null) },
    ...MODULES.map(m => ({ id: 'go.' + m.id, name: 'Gehe zu ' + m.name, group: 'Navigation', keys: NAV_KEYS[m.id] || '', run: () => A.nav('#/' + m.id) })),
    ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => ({ id: 'go.n' + i, name: `Gehe zu Modul ${i} der Navigation`, group: 'Navigation', keys: String(i), palette: false, run: () => { const m = flatNav()[i - 1]; if (m) A.nav('#/' + m.id); } })),
    { id: 'cal.today', name: 'Kalender: Heute', group: 'Kalender', ctx: 'kalender', keys: 't', run: () => Cal.keyNav('t') },
    { id: 'cal.next', name: 'Kalender: Weiter', group: 'Kalender', ctx: 'kalender', keys: 'j', run: () => Cal.keyNav('j') },
    { id: 'cal.prev', name: 'Kalender: Zurück', group: 'Kalender', ctx: 'kalender', keys: 'k', run: () => Cal.keyNav('k') },
    { id: 'cal.next2', name: 'Kalender: Weiter (Pfeil)', group: 'Kalender', ctx: 'kalender', keys: '→', palette: false, run: () => Cal.keyNav('j') },
    { id: 'cal.prev2', name: 'Kalender: Zurück (Pfeil)', group: 'Kalender', ctx: 'kalender', keys: '←', palette: false, run: () => Cal.keyNav('k') },
    { id: 'cal.d', name: 'Kalender: Tag', group: 'Kalender', ctx: 'kalender', keys: 'd', run: () => Cal.keyNav('d') },
    { id: 'cal.x', name: 'Kalender: 3 Tage', group: 'Kalender', ctx: 'kalender', keys: 'x', run: () => Cal.keyNav('x') },
    { id: 'cal.w', name: 'Kalender: Woche', group: 'Kalender', ctx: 'kalender', keys: 'w', run: () => Cal.keyNav('w') },
    { id: 'cal.m', name: 'Kalender: Monat', group: 'Kalender', ctx: 'kalender', keys: 'Umschalt+m', run: () => Cal.keyNav('m') },
    { id: 'cal.a', name: 'Kalender: Terminliste', group: 'Kalender', ctx: 'kalender', keys: 'a', run: () => Cal.keyNav('a') },
    { id: 'cal.full', name: 'Kalender: Vollbild an/aus', group: 'Kalender', ctx: 'kalender', keys: 'v', run: () => toggleCalFull() },
    { id: 'cal.tpl', name: 'Kalender: Vorlagen', group: 'Kalender', ctx: 'kalender', keys: 'o', run: () => Cal.openTemplates() },
    { id: 'cal.plan', name: 'Kalender: Woche aus Vorlage planen', group: 'Kalender', ctx: 'kalender', keys: 'p', run: () => Cal.planWeek() },
    { id: 'cal.copy', name: 'Kalender: Woche kopieren', group: 'Kalender', ctx: 'kalender', keys: 'c', run: () => Cal.copyWeek() },
    { id: 'cal.squeeze', name: 'Kalender: Nacht stauchen an/aus', group: 'Kalender', ctx: 'kalender', keys: 'z', run: () => Cal.toggleSqueeze() },
    { id: 'vg.list', name: 'Vorgänge: Liste', group: 'Vorgänge', ctx: 'vorgaenge', keys: 'l', run: () => Vg.setMode('list') },
    { id: 'vg.matrix', name: 'Vorgänge: Matrix', group: 'Vorgänge', ctx: 'vorgaenge', keys: 'x', run: () => Vg.setMode('matrix') },
    { id: 'vg.kanban', name: 'Vorgänge: Kanban', group: 'Vorgänge', ctx: 'vorgaenge', keys: 'k', run: () => Vg.setMode('kanban') },
    { id: 'vg.filter', name: 'Vorgänge: Filter öffnen', group: 'Vorgänge', ctx: 'vorgaenge', keys: 'Umschalt+f', run: () => Vg.openFilter() },
    { id: 'vg.save', name: 'Vorgänge: Ansicht speichern', group: 'Vorgänge', ctx: 'vorgaenge', keys: 'Umschalt+s', run: () => Vg.saveView() },
    { id: 'task.done', name: 'Offenen Vorgang erledigen', group: 'Im Vorgang', ctx: 'vorgang', keys: 'Strg+Umschalt+Enter', palette: false, run: () => { const sh = topSheet(); const id = sh && sh.el.dataset.task; if (id) A.completeTask(id).then(ok => { if (ok) sh.close(); }); } },
    { id: 'task.focus', name: 'Offenen Vorgang im Fokus bearbeiten', group: 'Im Vorgang', ctx: 'vorgang', keys: 'Strg+Umschalt+f', palette: false, run: () => { const sh = topSheet(); const id = sh && sh.el.dataset.task; if (id) { sh.close(); A.startFocus(id, { autostart: true }); } } },
    { id: 'task.plan', name: 'Offenen Vorgang einplanen', group: 'Im Vorgang', ctx: 'vorgang', keys: 'Strg+Umschalt+p', palette: false, run: () => { const sh = topSheet(); const id = sh && sh.el.dataset.task; if (id) { sh.close(); A.nav('#/kalender/woche'); setTimeout(() => Cal.planTaskById(id), 250); } } },
  ]);
}
function toggleCalFull() { S.local.calFull = !S.local.calFull; S.saveLocal(); render(); }
A.toggleCalFull = toggleCalFull;
A.actions = K;

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
  else if (o === 'habit') { A.nav('#/gewohnheiten'); if (params.id) setTimeout(() => A.openHabit(params.id), 150); }
  else if (o === 'person' && params.id) A.nav('#/beziehungen/' + params.id);
  else if (o === 'inbox') A.nav('#/inbox');
  else if (o === 'review') setTimeout(() => A.startReview(params.id || 'day'), 150);
  else if (o === 'journal') A.nav('#/notizen/journal');
  else if (o === 'capture' || o === 'newtask') setTimeout(() => (o === 'capture' ? A.capture() : A.newTask()), 100);
  else if (o === 'newevent') setTimeout(() => A.newEvent(), 100);
  else if (o === 'start' || o === 'heute') A.nav('#/heute');
  return true;
}
function handleUrlOpen(url) { try { const u = new URL(url, location.href); handleOpen(Object.fromEntries(u.searchParams)); } catch { } }

async function handlePair() {
  const m = location.hash.match(/#pair=([A-Za-z0-9_-]+)/);
  if (!m) return;
  history.replaceState(null, '', location.pathname + '#/heute');
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
    body: `<p class="confirm-text">Zeitblick ist dein Kontrollzentrum: Vorgänge, Kalender, Gewohnheiten, Routinen, Notizen, Ziele, Projekte, Beziehungen und Rückblicke – alles verbunden.</p>
      <ul class="small" style="padding-left:18px;color:var(--ink-2);line-height:1.8;margin:8px 0 12px"><li><b>Heute</b> zeigt dir alles Verbindliche des Tages auf einen Blick.</li><li>Gedanken landen zuerst in der <b>Inbox</b>, daraus werden <b>Vorgänge</b>.</li><li>Im <b>Kalender</b> planst du mit Vorlagen und Zeitblöcken, abends schließt du mit dem <b>Rückblick</b> ab.</li></ul>
      <p class="small muted">Möchtest du erst mit Beispielen schauen? Sie lassen sich später mit einem Klick entfernen.</p>`,
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

/* ---------------- FAB: tippen = Inbox, lange drücken = Schnellmenü ---------------- */
function bindFab() {
  const fab = document.querySelector('.fab');
  let timer = null, long = false;
  fab.addEventListener('pointerdown', () => { long = false; timer = setTimeout(() => { long = true; vibrate(15); newMenu(null); }, 450); });
  const cancel = () => clearTimeout(timer);
  fab.addEventListener('pointerup', cancel); fab.addEventListener('pointerleave', cancel); fab.addEventListener('pointercancel', cancel);
  fab.addEventListener('click', e => { if (long) { e.stopImmediatePropagation(); e.preventDefault(); long = false; } }, true);
}

/* ---------------- Start ---------------- */
async function boot() {
  A.applyTheme();
  document.getElementById('app').innerHTML = shellHtml();
  initTooltips();
  registerActions();
  await S.init();
  seedTemplates();
  const params = Object.fromEntries(new URLSearchParams(location.search));
  if (params.open || params.r) history.replaceState(null, '', location.pathname + (location.hash && !location.hash.startsWith('#pair') ? location.hash : '#/' + (S.local.startPage || 'heute')));
  render();
  bindFab();

  S.subscribe(info => {
    if (info.local) SY.schedulePush();
    N.scheduleReconcile(info.remote ? 6000 : 3500);
    O.schedule();
    if (info.col === 'tasks' && info.rec && (C.isClosed(info.rec) || info.rec.deleted)) N.resolveRef('task', info.id);
    if (info.col === 'notes' && info.rec && info.rec.reads) { const n = info.rec; if (!C.noteOpenToday(n, new Date())) N.resolveRef('note', n.id); }
    if (info.col === 'habits' && info.rec && C.habitDoneOn(info.rec, C.ymd(new Date()))) N.resolveRef('habit', info.id);
    if (info.col === 'reviews' && info.rec && info.rec.done) N.resolveRef('review', info.rec.type);
    if (info.noRender) { updateShell(parseRoute()); return; }
    scheduleRender();
  });
  SY.onState(() => updateSyncDot());
  N.onState(() => { if (parseRoute().name === 'einstellungen') scheduleRender(); });
  O.onState(() => { if (parseRoute().name === 'einstellungen') scheduleRender(); });
  F.onChange(info => {
    Fo.onEngine(info); N.scheduleReconcile(800);
    if (info && info.started) {
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
      if (k === 'bell') openBell(counts());
      if (k === 'more') moreMenu();
      if (k === 'capture') A.capture();
      if (k === 'sidetoggle') { S.local.sideCompact = !S.local.sideCompact; S.saveLocal(); render(); }
      if (k === 'calfull') toggleCalFull();
      return;
    }
    const ar = t.closest('[data-setarea]');
    if (ar) { S.local.area = ar.dataset.setarea; S.saveLocal(); render(); return; }
    if (t.closest('#syncBtn')) { if (SY.configured()) { SY.syncNow({ force: true }); toast('Synchronisiere …', { ms: 1200 }); } else A.nav('#/einstellungen/sync'); return; }
    if (t.closest('.sheet')) return;
    const act = t.closest('[data-act][data-id]');
    if (act && ['done', 'focus', 'multi', 'delegate', 'plan', 'discard'].includes(act.dataset.act)) {
      e.preventDefault(); e.stopPropagation();
      const id = act.dataset.id;
      if (act.dataset.act === 'done') A.completeTask(id, act);
      else if (act.dataset.act === 'multi') A.multiTick(id, act);
      else if (act.dataset.act === 'delegate') A.delegateTask(id, act);
      else if (act.dataset.act === 'discard') A.discardTask(id);
      else if (act.dataset.act === 'plan') Cal.planTaskPopover(act, S.task(id));
      else { closePopover(); A.startFocus(id, { autostart: true }); }
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
      if (S.local.calFull && parseRoute().name === 'kalender') { toggleCalFull(); return; }
    }
    if (alarmEl || e.repeat) return;
    if (document.querySelector('.rp-back')) return; // Routine-Player hat eigene Tasten
    K.handleKey(e, parseRoute().name);
  });

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
      if (['heute', 'vorgaenge', 'inbox'].includes(r.name) && !document.querySelector('.sheet-back, .popover') && !A.dragging) {
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
