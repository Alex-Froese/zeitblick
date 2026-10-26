// Zeitblick – Synchronisation über einen privaten GitHub Gist (Cloud-Speicher mit Versionsverlauf)
import * as C from './core.js';
import * as S from './store.js';

const API = 'https://api.github.com';
export const FILE_PREFIX = 'zb-';
export const GCAL_FILE = 'zb-google.json';
export const MARKER_FILE = 'zb-meta.json';
const fileOf = c => `${FILE_PREFIX}${c}.json`;

export const state = { status: 'off', lastSync: 0, error: '', login: '', busy: false, lastPush: 0 };
const subs = new Set();
export function onState(fn) { subs.add(fn); return () => subs.delete(fn); }
function setState(p) { Object.assign(state, p); for (const f of subs) { try { f(state); } catch { } } }

let remoteCache = null;   // zuletzt bekannter Stand im Gist
let etag = null;
let pollTimer = null, pushTimer = null;
let inFlight = false, again = false;
let backoffUntil = 0;

export function configured() { return !!(S.local.gist && S.local.gist.token && S.local.gist.id); }

async function gh(method, path, body, headers = {}) {
  const token = S.local.gist && S.local.gist.token;
  return fetch(API + path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
}

async function ghWith(token, method, path, body) {
  return fetch(API + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
}

function errText(status) {
  if (status === 401) return 'Der GitHub-Token ist ungültig oder abgelaufen. Erstelle einen neuen Token mit der Berechtigung „gist“.';
  if (status === 403) return 'GitHub verweigert den Zugriff (Berechtigung „gist“ fehlt oder Limit erreicht). Neuer Versuch in Kürze.';
  if (status === 404) return 'Der Sync-Speicher wurde nicht gefunden. Verbinde den Sync in den Einstellungen neu.';
  if (status === 422) return 'GitHub hat die Daten abgelehnt (zu groß oder ungültig).';
  return `GitHub antwortet mit Fehler ${status}.`;
}

async function readFiles(gist) {
  const out = {};
  const files = gist.files || {};
  for (const [name, f] of Object.entries(files)) {
    if (!name.startsWith(FILE_PREFIX)) continue;
    let content = f.content;
    if (f.truncated && f.raw_url) {
      const r = await fetch(f.raw_url, { cache: 'no-store' });
      if (!r.ok) throw new Error('Datei konnte nicht vollständig geladen werden');
      content = await r.text();
    }
    try { out[name] = JSON.parse(content || 'null'); } catch { out[name] = null; }
  }
  return out;
}

function filesToData(files) {
  const d = C.emptyData();
  for (const c of C.COLLECTIONS) {
    const v = files[fileOf(c)];
    if (v && typeof v === 'object') d[c] = v.items || v;
  }
  return d;
}

function dataToFiles(d, onlyChangedVs) {
  const files = {};
  for (const c of C.COLLECTIONS) {
    if (onlyChangedVs && JSON.stringify(onlyChangedVs[c] || {}) === JSON.stringify(d[c] || {})) continue;
    files[fileOf(c)] = { content: JSON.stringify({ v: C.DATA_VERSION, c, items: d[c] || {} }) };
  }
  return files;
}

/** Token prüfen, vorhandenen Speicher suchen oder neu anlegen */
export async function connect(token, gistId) {
  token = String(token || '').trim();
  if (!token) throw new Error('Bitte einen GitHub-Token eingeben.');
  const u = await ghWith(token, 'GET', '/user');
  if (!u.ok) throw new Error(errText(u.status));
  const user = await u.json();
  let id = gistId || null;
  if (!id) {
    for (let page = 1; page <= 5 && !id; page++) {
      const r = await ghWith(token, 'GET', `/gists?per_page=100&page=${page}`);
      if (!r.ok) throw new Error(errText(r.status));
      const list = await r.json();
      const hit = list.find(g => g.files && g.files[MARKER_FILE]);
      if (hit) id = hit.id;
      if (list.length < 100) break;
    }
  }
  if (!id) {
    const r = await ghWith(token, 'POST', '/gists', {
      description: 'Zeitblick – Sync-Speicher (bitte nicht löschen)',
      public: false,
      files: dataToFiles(S.getData()),
    });
    if (!r.ok) throw new Error(errText(r.status));
    const g = await r.json();
    id = g.id;
  }
  S.local.gist = { token, id, login: user.login || '' };
  S.saveLocalNow();
  remoteCache = null; etag = null;
  setState({ status: 'idle', error: '', login: user.login || '' });
  await syncNow({ force: true });
  start();
  return { id, login: user.login };
}

export function disconnect() {
  S.local.gist = null;
  S.saveLocalNow();
  remoteCache = null; etag = null;
  stop();
  setState({ status: 'off', error: '', lastSync: 0, login: '' });
}

export async function syncNow(opts = {}) {
  if (!configured()) { setState({ status: 'off' }); return; }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) { setState({ status: 'offline' }); return; }
  if (Date.now() < backoffUntil && !opts.force) return;
  if (inFlight) { again = true; return; }
  inFlight = true;
  setState({ busy: true, status: state.status === 'error' ? 'error' : 'syncing' });
  try {
    const id = S.local.gist.id;
    const headers = (!opts.force && etag && remoteCache) ? { 'If-None-Match': etag } : {};
    const res = await gh('GET', `/gists/${id}`, null, headers);
    let remote = remoteCache;
    if (res.status === 304) {
      // unverändert
    } else if (res.ok) {
      const g = await res.json();
      etag = res.headers.get('ETag') || null;
      const files = await readFiles(g);
      remote = filesToData(files);
      if (files[GCAL_FILE] !== undefined) S.setGoogleEvents((files[GCAL_FILE] && files[GCAL_FILE].events) || []);
      remoteCache = remote;
    } else {
      throw Object.assign(new Error(errText(res.status)), { status: res.status });
    }
    if (!remote) remote = C.emptyData();
    const local = S.getData();
    const { merged, localChanged, remoteChanged } = C.mergeData(local, remote);
    S.clearDirty();
    if (localChanged) S.applyMerged(merged);
    if (remoteChanged) {
      const files = dataToFiles(merged, remote);
      if (Object.keys(files).length) {
        const p = await gh('PATCH', `/gists/${id}`, { files });
        if (!p.ok) throw Object.assign(new Error(errText(p.status)), { status: p.status });
        etag = p.headers.get('ETag') || null;
        remoteCache = C.structuredCloneSafe(merged);
        setState({ lastPush: Date.now() });
      }
    }
    backoffUntil = 0;
    setState({ status: 'idle', error: '', lastSync: Date.now() });
  } catch (e) {
    const offline = e instanceof TypeError || /Failed to fetch|NetworkError|Load failed/i.test(e.message || '');
    if (e.status === 403 || e.status === 429) backoffUntil = Date.now() + 5 * 60000;
    if (offline) backoffUntil = Date.now() + 30000;
    setState({ status: offline ? 'offline' : 'error', error: offline ? 'Keine Verbindung – Änderungen werden später übertragen.' : (e.message || String(e)) });
  } finally {
    inFlight = false;
    setState({ busy: false });
    if (again) { again = false; setTimeout(() => syncNow(), 300); }
  }
}

/** nach lokalen Änderungen kurz warten und dann hochladen */
export function schedulePush() {
  if (!configured()) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => syncNow(), 1500);
}

export function start() {
  stop();
  if (!configured()) { setState({ status: 'off' }); return; }
  setState({ status: state.status === 'off' ? 'idle' : state.status, login: (S.local.gist && S.local.gist.login) || '' });
  const tick = () => {
    if (typeof document === 'undefined' || document.visibilityState === 'visible') syncNow();
  };
  pollTimer = setInterval(tick, 20000);
}
export function stop() { clearInterval(pollTimer); pollTimer = null; clearTimeout(pushTimer); }

/** Kopplungslink (für QR-Code) */
export function pairPayload(extra = {}) {
  const g = S.local.gist || {};
  const p = { t: g.token, g: g.id, ...extra };
  const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(p)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return b64;
}
export function readPairPayload(b64) {
  const s = b64.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(decodeURIComponent(escape(atob(s))));
}
