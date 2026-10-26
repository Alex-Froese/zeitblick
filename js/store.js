// Zeitblick – lokaler Speicher (IndexedDB), Zustand, Änderungen, Backups
import * as C from './core.js';

/* -------------------- IndexedDB-Wrapper mit Fallback -------------------- */
const DB_NAME = 'zeitblick';
let dbp = null;
function openDb() {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    try {
      if (!('indexedDB' in globalThis)) return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
        if (!db.objectStoreNames.contains('backups')) db.createObjectStore('backups');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  return dbp;
}
const memKv = new Map();
export async function kvGet(key, store = 'kv') {
  const db = await openDb();
  if (!db) {
    if (memKv.has(store + ':' + key)) return memKv.get(store + ':' + key);
    try { const v = localStorage.getItem('zb.' + store + '.' + key); return v ? JSON.parse(v) : undefined; } catch { return undefined; }
  }
  return new Promise((res) => {
    try {
      const tx = db.transaction(store, 'readonly');
      const r = tx.objectStore(store).get(key);
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(undefined);
    } catch { res(undefined); }
  });
}
export async function kvSet(key, val, store = 'kv') {
  const db = await openDb();
  if (!db) {
    memKv.set(store + ':' + key, val);
    try { if (typeof val !== 'object' || val === null || !('kind' in val)) localStorage.setItem('zb.' + store + '.' + key, JSON.stringify(val)); } catch { /* voll oder gesperrt */ }
    return;
  }
  return new Promise((res) => {
    try {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).put(val, key);
      tx.oncomplete = () => res(true);
      tx.onerror = () => res(false);
      tx.onabort = () => res(false);
    } catch { res(false); }
  });
}
export async function kvDel(key, store = 'kv') {
  const db = await openDb();
  if (!db) { memKv.delete(store + ':' + key); try { localStorage.removeItem('zb.' + store + '.' + key); } catch { } return; }
  return new Promise((res) => {
    try { const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).delete(key); tx.oncomplete = () => res(true); tx.onerror = () => res(false); } catch { res(false); }
  });
}
export async function kvKeys(store = 'kv') {
  const db = await openDb();
  if (!db) return [...memKv.keys()].filter(k => k.startsWith(store + ':')).map(k => k.slice(store.length + 1));
  return new Promise((res) => {
    try { const tx = db.transaction(store, 'readonly'); const r = tx.objectStore(store).getAllKeys(); r.onsuccess = () => res(r.result || []); r.onerror = () => res([]); } catch { res([]); }
  });
}

/* -------------------- Gerätelokale Einstellungen -------------------- */
const LS_KEY = 'zb.local.v1';
function loadLocal() {
  let v = {};
  try { v = JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {}; } catch { v = {}; }
  const isMobile = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  return Object.assign({
    deviceId: C.uid('dev', 8),
    theme: 'auto',            // light | dark | night | auto
    nightAuto: false,         // automatisch Nachtmodus 21–6 Uhr
    area: 'all',              // p | all | b
    gist: null,               // { token, id, login }
    sysNotif: !isMobile,      // Systembenachrichtigungen von diesem Gerät
    sound: true,
    fired: {},
    inbox: [],                // Benachrichtigungszentrale
    alarmAck: 0,
    calView: isMobile ? '3' : 'w',
    calLayers: { p: true, b: true, tasks: true, focus: false, google: true },
    taskList: 'heute',
    taskGroup: 'date',
    matrixShowDone: false,
    lastBackupDay: '',
    onboarded: false,
    obsidian: { on: false, notes: true, daily: true },
  }, v);
}
export const local = loadLocal();
let lsTimer = null;
export function saveLocal() {
  clearTimeout(lsTimer);
  lsTimer = setTimeout(() => { try { localStorage.setItem(LS_KEY, JSON.stringify(local)); } catch { } }, 50);
}
export function saveLocalNow() { try { localStorage.setItem(LS_KEY, JSON.stringify(local)); } catch { } }

/* -------------------- Datenzustand -------------------- */
let data = C.emptyData();
export const getData = () => data;
const listeners = new Set();
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit(info) { for (const fn of listeners) { try { fn(info); } catch (e) { console.error(e); } } }

export let dirty = false;
export function clearDirty() { dirty = false; }

export async function init() {
  const stored = await kvGet('data');
  if (stored && typeof stored === 'object') {
    data = C.emptyData();
    for (const c of C.COLLECTIONS) data[c] = stored[c] || {};
  }
  ensureDefaults();
  saveLocal();
  return data;
}

function ensureDefaults() {
  const hasCats = Object.values(data.cats).some(c => c && !c.deleted);
  if (!hasCats && !Object.keys(data.cats).length) {
    C.DEFAULT_CATS.forEach((c, i) => { data.cats[c.id] = { ...c, order: i, updatedAt: 1, dev: 'seed' }; });
  }
  if (!data.meta.leitsaetze) data.meta.leitsaetze = { id: 'leitsaetze', list: C.DEFAULT_LEITSAETZE, updatedAt: 1, dev: 'seed' };
}

let saveTimer = null;
export function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 250);
}
export async function saveNow() {
  clearTimeout(saveTimer);
  await kvSet('data', data);
}

function stamp(rec, prev) {
  const t = Date.now();
  rec.updatedAt = Math.max(t, ((prev && prev.updatedAt) || 0) + 1);
  rec.dev = local.deviceId;
  return rec;
}

export function put(col, rec, opts = {}) {
  if (!rec.id) rec.id = C.uid(col.slice(0, 1));
  const prev = data[col][rec.id];
  if (!prev && !rec.createdAt && col !== 'meta') rec.createdAt = Date.now();
  stamp(rec, prev);
  data[col][rec.id] = rec;
  dirty = true;
  scheduleSave();
  if (!opts.silent) emit({ col, id: rec.id, prev, rec, local: true });
  return rec;
}

export function putMany(col, recs) {
  for (const r of recs) put(col, r, { silent: true });
  emit({ col, many: true, local: true });
}

export function remove(col, id) {
  const prev = data[col][id];
  if (!prev) return null;
  const tomb = stamp({ id, deleted: true }, prev);
  data[col][id] = tomb;
  dirty = true;
  scheduleSave();
  emit({ col, id, prev, rec: tomb, local: true, removed: true });
  return prev;
}

export function restore(col, rec) { const r = { ...rec }; delete r.deleted; return put(col, r); }

export function replaceAll(newData, info = {}) {
  const d = C.emptyData();
  for (const c of C.COLLECTIONS) d[c] = (newData && newData[c]) || {};
  data = d;
  ensureDefaults();
  scheduleSave();
  emit({ replaced: true, ...info });
}

/** Übernimmt zusammengeführte Daten aus dem Sync, ohne den dirty-Status zu setzen */
export function applyMerged(merged) {
  data = merged;
  ensureDefaults();
  scheduleSave();
  emit({ remote: true });
}

export function touch(info = {}) { emit(info); }

/* -------------------- Abfragen -------------------- */
export function settings() { return C.settingsOf(data); }
export function saveSettings(patch) {
  const cur = (data.meta.settings && !data.meta.settings.deleted && data.meta.settings.v) || {};
  const v = C.mergeDeep(cur, patch);
  // Arrays/Objekte, die komplett ersetzt werden sollen
  for (const k of Object.keys(patch)) if (Array.isArray(patch[k])) v[k] = patch[k];
  put('meta', { id: 'settings', v });
}
export function setSettingPath(path, value) {
  const cur = C.structuredCloneSafe((data.meta.settings && !data.meta.settings.deleted && data.meta.settings.v) || {});
  const parts = path.split('.');
  let o = cur;
  for (let i = 0; i < parts.length - 1; i++) { if (typeof o[parts[i]] !== 'object' || o[parts[i]] === null) o[parts[i]] = {}; o = o[parts[i]]; }
  o[parts[parts.length - 1]] = value;
  put('meta', { id: 'settings', v: cur });
}

export function cats(area) {
  return Object.values(data.cats).filter(c => c && !c.deleted && (!area || area === 'all' || c.area === area)).sort((a, b) => (a.area === b.area ? 0 : a.area === 'p' ? -1 : 1) || (a.order ?? 99) - (b.order ?? 99) || a.name.localeCompare(b.name));
}
export function cat(id) { const c = id && data.cats[id]; return c && !c.deleted ? c : null; }
export function task(id) { const t = id && data.tasks[id]; return t && !t.deleted ? t : null; }
export function event(id) { const e = id && data.events[id]; return e && !e.deleted ? e : null; }
export function tasks(filter) { return Object.values(data.tasks).filter(t => t && !t.deleted && (!filter || filter(t))); }
export function events(filter) { return Object.values(data.events).filter(e => e && !e.deleted && (!filter || filter(e))); }
export function focusSessions(filter) { return Object.values(data.focus).filter(f => f && !f.deleted && (!filter || filter(f))); }
export function inArea(rec, area = local.area) { return area === 'all' || !area || rec.area === area || (!rec.area && area === 'p'); }
export function nextTicketNo() {
  let max = 0;
  for (const t of Object.values(data.tasks)) if (t && t.no > max) max = t.no;
  return max + 1;
}
export function leitsaetze() { const l = data.meta.leitsaetze; return (l && !l.deleted && l.list && l.list.length) ? l.list : C.DEFAULT_LEITSAETZE; }

/* Google-Kalender (read-only, kommt aus dem Sync-Speicher) */
let googleEvents = [];
export function setGoogleEvents(list) { googleEvents = Array.isArray(list) ? list : []; emit({ google: true }); }
export function getGoogleEvents() { return googleEvents; }

/* -------------------- Backups -------------------- */
export async function dailySnapshot(force = false) {
  const today = C.ymd(new Date());
  if (!force && local.lastBackupDay === today) return false;
  await kvSet(today, { at: Date.now(), data }, 'backups');
  local.lastBackupDay = today;
  saveLocal();
  const keys = (await kvKeys('backups')).sort();
  while (keys.length > 21) await kvDel(keys.shift(), 'backups');
  return true;
}
export async function listSnapshots() {
  const keys = (await kvKeys('backups')).sort().reverse();
  const out = [];
  for (const k of keys) { const v = await kvGet(k, 'backups'); if (v) out.push({ key: k, at: v.at, counts: countData(v.data) }); }
  return out;
}
export async function getSnapshot(key) { const v = await kvGet(key, 'backups'); return v && v.data; }
export function countData(d) {
  const n = c => Object.values((d && d[c]) || {}).filter(x => x && !x.deleted).length;
  return { tasks: n('tasks'), events: n('events'), focus: n('focus'), cats: n('cats') };
}
export function exportJson() {
  return JSON.stringify({ app: 'Zeitblick', version: C.APP_VERSION, exportedAt: new Date().toISOString(), data }, null, 1);
}
export function parseImport(text) {
  const j = JSON.parse(text);
  const d = j && j.data ? j.data : j;
  if (!d || typeof d !== 'object' || !d.tasks) throw new Error('Keine Zeitblick-Sicherung');
  return d;
}
