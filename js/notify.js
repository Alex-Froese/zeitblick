// Zeitblick – lokale Benachrichtigungen, Benachrichtigungszentrale, Alarm-Eskalation, ntfy-Planung
import * as C from './core.js';
import * as S from './store.js';
import * as N from './ntfy.js';

export const nstate = {
  ntfy: { status: 'off', last: 0, scheduled: 0, error: '', published: 0, pending: 0 },
  perm: (typeof Notification !== 'undefined') ? Notification.permission : 'unsupported',
};
const subs = new Set();
export function onState(fn) { subs.add(fn); return () => subs.delete(fn); }
function changed() { for (const f of subs) { try { f(nstate); } catch { } } }

let hooks = { onFire: () => { }, onAlarm: () => { }, onMessages: () => { } };
export function setHooks(h) { hooks = { ...hooks, ...h }; }

export function baseUrl() {
  if (typeof location === 'undefined') return '';
  return location.origin + location.pathname.replace(/index\.html$/, '');
}
export function appUrl() {
  const s = S.settings();
  return s.appUrl || baseUrl();
}

/* ---------------- Benachrichtigungszentrale (persistent bis manuell entfernt) ---------------- */
export function messages() { return S.local.inbox || []; }
export function addMessage(item) {
  const list = (S.local.inbox || []).filter(x => x.id !== item.id);
  list.unshift({ ...item, read: false, firedAt: Date.now() });
  S.local.inbox = list.slice(0, 80);
  S.saveLocal();
  hooks.onMessages();
}
export function removeMessage(id) { S.local.inbox = messages().filter(x => x.id !== id); S.saveLocal(); hooks.onMessages(); }
export function clearMessages() { S.local.inbox = []; S.saveLocal(); hooks.onMessages(); closeSystem(() => true); }
export function markRead() { S.local.inbox = messages().map(x => ({ ...x, read: true })); S.saveLocal(); hooks.onMessages(); }
export function unreadCount() { return messages().filter(x => !x.read).length; }

/* ---------------- Systembenachrichtigungen ---------------- */
export async function requestPermission() {
  if (typeof Notification === 'undefined') { nstate.perm = 'unsupported'; changed(); return 'unsupported'; }
  try { nstate.perm = await Notification.requestPermission(); } catch { nstate.perm = Notification.permission; }
  changed();
  return nstate.perm;
}

async function swReg() {
  try { if ('serviceWorker' in navigator) return await navigator.serviceWorker.getRegistration(); } catch { }
  return null;
}

export async function showSystem(r) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false;
  const base = baseUrl();
  const t = r.ref && r.ref.type;
  const url = t && ['task', 'event', 'note', 'habit', 'person'].includes(t) ? C.deepLink(base, { open: t, id: r.ref.id }) : t === 'inbox' ? C.deepLink(base, { open: 'inbox' }) : t === 'focus' ? C.deepLink(base, { open: 'focus' }) : C.deepLink(base, { open: 'start' });
  const focusUrl = r.ref && r.ref.type === 'task' ? C.deepLink(base, { open: 'focus', task: r.ref.id, start: 1 }) : url;
  const opts = {
    body: r.message,
    tag: r.rid,
    requireInteraction: true,
    icon: 'icons/icon-192.png',
    badge: 'icons/badge-96.png',
    data: { url, focusUrl, ref: r.ref || null },
    renotify: false,
    silent: false,
  };
  const reg = await swReg();
  try {
    if (reg && reg.showNotification) {
      opts.actions = t === 'task' ? [{ action: 'focus', title: '▶ Fokus starten' }, { action: 'open', title: 'Öffnen' }] : t === 'note' ? [{ action: 'open', title: 'Jetzt lesen' }] : [{ action: 'open', title: 'Öffnen' }];
      await reg.showNotification(r.title, opts);
    } else {
      const n = new Notification(r.title, opts);
      n.onclick = () => { try { window.focus(); } catch { } hooks.onOpen && hooks.onOpen(url); };
    }
    return true;
  } catch (e) { console.warn('Benachrichtigung fehlgeschlagen', e); return false; }
}

export async function closeSystem(pred) {
  const reg = await swReg();
  if (!reg || !reg.getNotifications) return;
  try { const list = await reg.getNotifications(); for (const n of list) if (pred(n.data && n.data.ref, n)) n.close(); } catch { }
}

export async function testSystem() {
  return showSystem({ rid: 'zb-test-' + Date.now(), title: '✅ Benachrichtigungen aktiv', message: 'So erscheinen Erinnerungen auf diesem Gerät. Sie bleiben, bis du sie wegklickst.', ref: null });
}

/* ---------------- Lokale Prüfschleife ---------------- */
function fire(r) {
  S.local.fired[r.rid] = Date.now();
  addMessage({ id: r.rid, title: r.title, message: r.message, at: r.at, ref: r.ref, level: r.level, priority: r.priority });
  if (S.local.sysNotif) showSystem(r);
  hooks.onFire(r);
}

export function checkLocal() {
  const now = Date.now();
  let list = [];
  try { list = C.buildReminders(S.getData(), new Date(now), { appUrl: appUrl(), horizonH: 0.05, catchupMin: 10 }); } catch (e) { console.error(e); return; }
  let n = 0;
  for (const r of list) {
    if (r.at > now || S.local.fired[r.rid]) continue;
    fire(r);
    if (++n > 6) break;
  }
  // Aufräumen
  const cut = now - 4 * C.DAY;
  let pruned = false;
  for (const [k, v] of Object.entries(S.local.fired)) if (v < cut) { delete S.local.fired[k]; pruned = true; }
  if (n || pruned) S.saveLocal();
}

/** Aufgaben im Alarm-Zustand (für das rote Vollbild-Overlay) */
export function alarmTasks(now = new Date()) {
  const s = S.settings();
  if (!s.amp.escOn) return [];
  return S.tasks(t => C.isOpen(t) && t.esc !== false && S.inArea(t, 'all') && !(t.snooze && t.snooze > now.getTime()))
    .map(t => ({ t, a: C.ampel(t, now, s) }))
    .filter(x => x.a.level === 'alarm')
    .sort((a, b) => b.a.overdueH - a.a.overdueH)
    .map(x => x.t);
}

export function checkAlarm(force = false) {
  const list = alarmTasks();
  if (!list.length) return;
  if (!force && Date.now() - (S.local.alarmAck || 0) < 45 * C.MIN) return;
  hooks.onAlarm(list);
}
export function ackAlarm() { S.local.alarmAck = Date.now(); S.saveLocal(); }

/** Aufgabe erledigt/gelöscht → passende Benachrichtigungen schließen */
export function resolveRef(type, id) {
  closeSystem(ref => ref && ref.type === type && ref.id === id);
  const before = messages().length;
  S.local.inbox = messages().filter(x => !(x.ref && x.ref.type === type && x.ref.id === id));
  if (S.local.inbox.length !== before) { S.saveLocal(); hooks.onMessages(); }
}

/* ---------------- ntfy (Handy-Push) ---------------- */
let ntfyTimer = null, ntfyBusy = false, ntfyAgain = false;
const REMOVED_KEY = 'zb.ntfy.removed';
function loadRemoved() { try { const o = JSON.parse(localStorage.getItem(REMOVED_KEY) || '{}'); const cut = Date.now() - 14 * C.HOUR; return new Map(Object.entries(o).filter(([, v]) => v > cut)); } catch { return new Map(); } }
function saveRemoved(set, map) { const o = {}; for (const k of set) o[k] = map.get(k) || Date.now(); try { localStorage.setItem(REMOVED_KEY, JSON.stringify(o)); } catch { } }

export function ntfyConfigured() { const s = S.settings(); return !!(s.ntfy.on && s.ntfy.topic); }

export function scheduleReconcile(delay = 4000) {
  clearTimeout(ntfyTimer);
  if (!ntfyConfigured()) { if (nstate.ntfy.status !== 'off') { nstate.ntfy.status = 'off'; changed(); } return; }
  ntfyTimer = setTimeout(runReconcile, delay);
}

export async function runReconcile() {
  if (!ntfyConfigured()) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) { nstate.ntfy = { ...nstate.ntfy, status: 'offline' }; changed(); return; }
  if (ntfyBusy) { ntfyAgain = true; return; }
  ntfyBusy = true;
  nstate.ntfy = { ...nstate.ntfy, status: 'busy' }; changed();
  const s = S.settings();
  const map = loadRemoved();
  const removed = new Set(map.keys());
  try {
    const r = await N.reconcile(S.getData(), { server: s.ntfy.server, topic: s.ntfy.topic, appUrl: appUrl(), removed });
    saveRemoved(removed, map);
    nstate.ntfy = { status: r.failed ? 'error' : 'ok', last: Date.now(), scheduled: r.scheduled, published: r.published, pending: r.pending, error: r.failed ? r.lastError : '' };
    if (r.pending > 0) setTimeout(() => scheduleReconcile(1000), 60000);
  } catch (e) {
    nstate.ntfy = { ...nstate.ntfy, status: 'error', last: Date.now(), error: e.message || String(e) };
  } finally {
    ntfyBusy = false; changed();
    if (ntfyAgain) { ntfyAgain = false; scheduleReconcile(1500); }
  }
}

let loop = null;
export function start() {
  clearInterval(loop);
  checkLocal();
  let tick = 0;
  loop = setInterval(() => {
    tick++;
    checkLocal();
    if (tick % 20 === 0) checkAlarm();          // alle ~5 Min
    if (tick % 40 === 0) scheduleReconcile(100); // alle ~10 Min
  }, 15000);
  scheduleReconcile(2500);
}
