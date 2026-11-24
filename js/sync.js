// Zeitblick 4 – Synchronisation. Zwei Wege, gleiche Regeln (je Datensatz gewinnt die neuere Änderung, Löschmarker bleiben):
//   Am Laptop (vom Kern ausgeliefert): App ↔ Zeitblick-Kern (lokal, sofort). Der Kern gleicht verschlüsselt mit dem Gist ab,
//     auch wenn kein Fenster offen ist, und Kundenblick spricht ebenfalls nur mit dem Kern.
//   Am Handy (GitHub Pages): App ↔ verschlüsselter Gist (zb4-*.json, AES-256 + HMAC, js/krypto.js).
// Der alte Zeitblick-3-Gist (zb-*.json, Klartext) wird nicht mehr benutzt und nicht verändert.
import * as C from './core.js';
import * as S from './store.js';
import * as KR from './kern.js';
import * as Z from './krypto.js';

const GH = 'https://api.github.com';
export const FILE_PREFIX = 'zb-';
export const GIST_PREFIX = 'zb4-';
export const MARKER_FILE = 'zb4-meta.json';
const fileOf = c => `${FILE_PREFIX}${c}.json`;
const gistFileOf = c => `${GIST_PREFIX}${c}.json`;

export const state = { status: 'off', lastSync: 0, error: '', login: '', busy: false, lastPush: 0, ziel: KR.aktiv ? 'kern' : 'gist', gist: null };
const subs = new Set();
export function onState(fn) { subs.add(fn); return () => subs.delete(fn); }
function setState(p) { Object.assign(state, p); for (const f of subs) { try { f(state); } catch { } } }

let remoteCache = null;   // zuletzt bekannter Stand im Ziel (Kern oder Gist), als Daten
let etag = null;
let kernRev = -1;
let pollTimer = null, pushTimer = null, gistInfoTimer = null;
let inFlight = false, again = false;
let backoffUntil = 0;

const g4 = () => (S.local.gist && S.local.gist.v === 4 ? S.local.gist : null);
/** Der alte, unverschlüsselte Zeitblick-3-Sync ist auf diesem Gerät noch eingetragen (wird nicht mehr benutzt). */
export function altEingetragen() { return !KR.aktiv && !!(S.local.gist && S.local.gist.v !== 4 && S.local.gist.token); }
export function configured() { if (KR.aktiv) return true; const g = g4(); return !!(g && g.token && g.id && g.k); }

/** Nur Testinstanzen (http://localhost:<port>) dürfen eine andere Gist-Schnittstelle nehmen: die Attrappe im Kern. */
function api() {
  if (typeof location !== 'undefined' && location.hostname === 'localhost' && S.local.testApi) return S.local.testApi.replace(/\/$/, '');
  return GH;
}

/* -------------------- gemeinsame Helfer -------------------- */

function filesToData(texts) {
  const d = C.emptyData();
  for (const c of C.COLLECTIONS) {
    const t = texts[fileOf(c)];
    if (t == null) continue;
    let v = null;
    try { v = typeof t === 'string' ? JSON.parse(t || 'null') : t; } catch { v = null; }
    if (v && typeof v === 'object') d[c] = v.items || (v.v ? {} : v);
  }
  return d;
}

function dataToTexts(d, onlyChangedVs) {
  const out = {};
  for (const c of C.COLLECTIONS) {
    if (onlyChangedVs && JSON.stringify(onlyChangedVs[c] || {}) === JSON.stringify(d[c] || {})) continue;
    out[fileOf(c)] = JSON.stringify({ v: C.DATA_VERSION, c, items: d[c] || {} });
  }
  return out;
}

function errText(status) {
  if (status === 401) return 'Der GitHub-Token ist ungültig oder abgelaufen. Erstelle einen neuen Token mit der Berechtigung „gist“.';
  if (status === 403) return 'GitHub verweigert den Zugriff (Berechtigung „gist“ fehlt oder Limit erreicht). Neuer Versuch in Kürze.';
  if (status === 404) return 'Der Sync-Speicher wurde nicht gefunden. Verbinde den Sync in den Einstellungen neu.';
  if (status === 422) return 'GitHub hat die Daten abgelehnt (zu groß oder ungültig).';
  return `GitHub antwortet mit Fehler ${status}.`;
}

/* -------------------- Ziel 1: Zeitblick-Kern -------------------- */

async function kernRunde(opts) {
  const j = await KR.api('sync', { headers: (!opts.force && etag && remoteCache) ? { 'If-None-Match': etag } : {} });
  let remote = remoteCache;
  if (!j.nichtGeaendert) {
    remote = filesToData(j.dateien || {});
    remoteCache = remote;
    etag = j._etag || null;
    kernRev = j.rev;
  }
  if (!remote) remote = C.emptyData();
  const { merged, localChanged, remoteChanged } = C.mergeData(S.getData(), remote);
  S.clearDirty();
  if (localChanged) S.applyMerged(merged);
  if (remoteChanged) {
    const dateien = dataToTexts(merged, remote);
    if (Object.keys(dateien).length) {
      try {
        const p = await KR.api('sync', { method: 'PUT', body: { basis: kernRev, dateien } });
        kernRev = p.rev; etag = p._etag || `"r${p.rev}"`;
        remoteCache = C.structuredCloneSafe(merged);
        setState({ lastPush: Date.now() });
      } catch (e) {
        if (e.status === 409) { remoteCache = null; etag = null; again = true; return; }
        throw e;
      }
    }
  }
}

async function gistInfo() {
  if (!KR.aktiv) return;
  try { setState({ gist: await KR.api('sync/zustand') }); } catch { /* Kern kurz weg */ }
}

/* -------------------- Ziel 2: verschlüsselter Gist (Handy) -------------------- */

async function gh(method, path, body, headers = {}, token = g4() && g4().token) {
  return fetch((path.startsWith('http') ? '' : api()) + path, {
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

async function gistTexte(gist) {
  const out = {};
  for (const [name, f] of Object.entries(gist.files || {})) {
    if (!name.startsWith(GIST_PREFIX)) continue;
    let content = f.content;
    if (f.truncated && f.raw_url) {
      const r = await fetch(f.raw_url, { cache: 'no-store' });
      if (!r.ok) throw new Error('Datei konnte nicht vollständig geladen werden');
      content = await r.text();
    }
    out[name] = content;
  }
  return out;
}

async function entschluesselt(texte, key, sid) {
  const meta = texte[MARKER_FILE];
  if (meta) { let m = null; try { m = JSON.parse(meta); } catch { } if (m && m.sid && m.sid !== sid) throw new Error('Der Sync-Speicher gehört zu einem anderen Schlüssel. Bitte neu koppeln.'); }
  const lokal = {};
  for (const [name, t] of Object.entries(texte)) {
    if (name === MARKER_FILE) continue;
    const c = name.slice(GIST_PREFIX.length, -5);
    lokal[fileOf(c)] = await Z.entschluesseln(key, c, t);
  }
  return lokal;
}

async function verschluesselt(texte, key) {
  const files = {};
  for (const [name, t] of Object.entries(texte)) {
    const c = name.slice(FILE_PREFIX.length, -5);
    files[gistFileOf(c)] = { content: await Z.verschluesseln(key, c, t) };
  }
  return files;
}

async function gistRunde(opts) {
  const g = g4();
  const key = Z.ausText(g.k);
  const headers = (!opts.force && etag && remoteCache) ? { 'If-None-Match': etag } : {};
  const res = await gh('GET', `/gists/${g.id}`, null, headers);
  let remote = remoteCache;
  if (res.status === 304) { /* unverändert */ }
  else if (res.ok) {
    const gist = await res.json();
    etag = res.headers.get('ETag') || null;
    remote = filesToData(await entschluesselt(await gistTexte(gist), key, g.sid));
    remoteCache = remote;
  } else throw Object.assign(new Error(errText(res.status)), { status: res.status });
  if (!remote) remote = C.emptyData();
  const { merged, localChanged, remoteChanged } = C.mergeData(S.getData(), remote);
  S.clearDirty();
  if (localChanged) S.applyMerged(merged);
  if (remoteChanged) {
    const texte = dataToTexts(merged, remote);
    if (Object.keys(texte).length) {
      const p = await gh('PATCH', `/gists/${g.id}`, { files: await verschluesselt(texte, key) });
      if (!p.ok) throw Object.assign(new Error(errText(p.status)), { status: p.status });
      etag = p.headers.get('ETag') || null;
      remoteCache = C.structuredCloneSafe(merged);
      setState({ lastPush: Date.now() });
    }
  }
}

/* -------------------- Verbinden -------------------- */

/** Am Laptop verbindet der Kern (Token und Schlüssel bleiben im Kern, DPAPI-geschützt). Am Handy das Gerät selbst.
 *  Gibt es schon einen verschlüsselten Speicher, braucht es den Wiederherstellungs-Schlüssel (Fehler mit code „schluessel-noetig“).
 *  Ergebnis: { neu, wiederherstellung? } – bei einem neuen Speicher den Schlüssel zum Aufschreiben. */
export async function connect(token, gistId, schluesselText) {
  token = String(token || '').trim();
  if (!token) throw new Error('Bitte einen GitHub-Token eingeben.');
  if (KR.aktiv) {
    const r = await KR.api('sync/verbinden', { method: 'POST', body: { token, gist: gistId || '', schluessel: schluesselText || '' } });
    setState({ gist: r, error: '' });
    syncNow({ force: true });
    return r;
  }
  const u = await gh('GET', '/user', null, {}, token);
  if (!u.ok) throw new Error(errText(u.status));
  const user = await u.json();
  let id = gistId || null;
  if (!id) {
    for (let page = 1; page <= 5 && !id; page++) {
      const r = await gh('GET', `/gists?per_page=100&page=${page}`, null, {}, token);
      if (!r.ok) throw new Error(errText(r.status));
      const list = await r.json();
      const hit = list.find(x => x.files && x.files[MARKER_FILE]);
      if (hit) id = hit.id;
      if (list.length < 100) break;
    }
  }
  let key, neu = false;
  if (id) {
    const r = await gh('GET', `/gists/${id}`, null, {}, token);
    if (!r.ok) throw new Error(errText(r.status));
    const texte = await gistTexte(await r.json());
    if (!texte[MARKER_FILE]) throw new Error('Dieser Gist ist kein Zeitblick-4-Speicher.');
    const sid = JSON.parse(texte[MARKER_FILE]).sid;
    if (!schluesselText) throw Object.assign(new Error('Es gibt schon einen verschlüsselten Zeitblick-Speicher. Bitte den Wiederherstellungs-Schlüssel eingeben oder den QR-Code vom Laptop scannen.'), { code: 'schluessel-noetig' });
    key = Z.ausText(schluesselText);
    if (await Z.schluesselId(key) !== sid) throw new Error('Dieser Wiederherstellungs-Schlüssel passt nicht zum Speicher.');
  } else {
    key = schluesselText ? Z.ausText(schluesselText) : Z.neuerSchluessel();
    neu = true;
    const files = { [MARKER_FILE]: { content: JSON.stringify({ zb: 4, programm: 'Zeitblick', sid: await Z.schluesselId(key), verfahren: 'A256CBC-HS256', hinweis: 'Inhalt verschlüsselt. Ohne den Sync-Schlüssel nicht lesbar.' }) }, ...(await verschluesselt(dataToTexts(S.getData()), key)) };
    const r = await gh('POST', '/gists', { description: 'Zeitblick 4 – verschlüsselter Sync-Speicher (bitte nicht löschen)', public: false, files }, {}, token);
    if (!r.ok) throw new Error(errText(r.status));
    id = (await r.json()).id;
  }
  const alt = S.local.gist && S.local.gist.v !== 4 ? { id: S.local.gist.id, login: S.local.gist.login } : (S.local.altGist || null);
  S.local.gist = { v: 4, token, id, login: user.login || '', k: Z.alsText(key), sid: await Z.schluesselId(key) };
  if (alt) S.local.altGist = alt;   // nur Kennung des alten Gists merken, ohne Token
  S.saveLocalNow();
  remoteCache = null; etag = null;
  setState({ status: 'idle', error: '', login: user.login || '' });
  await syncNow({ force: true });
  start();
  return { neu, wiederherstellung: neu ? Z.alsText(key) : undefined };
}

export async function disconnect() {
  if (KR.aktiv) { setState({ gist: await KR.api('sync/trennen', { method: 'POST' }) }); return; }
  S.local.gist = null;
  S.saveLocalNow();
  remoteCache = null; etag = null;
  stop();
  setState({ status: 'off', error: '', lastSync: 0, login: '' });
}

/** Wiederherstellungs-Schlüssel zum Aufschreiben (am Laptop vom Kern). */
export async function wiederherstellung() {
  if (KR.aktiv) return (await KR.api('sync/schluessel')).text;
  const g = g4(); if (!g) throw new Error('Der Sync ist nicht eingerichtet.');
  return g.k;
}

/* -------------------- Abgleich -------------------- */

export async function syncNow(opts = {}) {
  if (!configured()) { setState({ status: altEingetragen() ? 'alt' : 'off' }); return; }
  if (!KR.aktiv && typeof navigator !== 'undefined' && navigator.onLine === false) { setState({ status: 'offline' }); return; }
  if (Date.now() < backoffUntil && !opts.force) return;
  if (inFlight) { again = true; return; }
  inFlight = true;
  setState({ busy: true, status: state.status === 'error' ? 'error' : 'syncing' });
  try {
    if (KR.aktiv) await kernRunde(opts);
    else await gistRunde(opts);
    backoffUntil = 0;
    setState({ status: 'idle', error: '', lastSync: Date.now() });
  } catch (e) {
    const offline = e instanceof TypeError || e.code === 'offline' || /Failed to fetch|NetworkError|Load failed/i.test(e.message || '');
    if (e.status === 403 || e.status === 429) backoffUntil = Date.now() + 5 * 60000;
    if (offline) backoffUntil = Date.now() + (KR.aktiv ? 5000 : 30000);
    setState({ status: offline ? 'offline' : 'error', error: offline ? (KR.aktiv ? 'Der Zeitblick-Kern antwortet nicht – Änderungen bleiben im Gerät und gehen später an den Kern.' : 'Keine Verbindung – Änderungen werden später übertragen.') : (e.message || String(e)) });
  } finally {
    inFlight = false;
    setState({ busy: false });
    if (again) { again = false; setTimeout(() => syncNow(), 300); }
  }
}

/** nach lokalen Änderungen kurz warten und dann abgleichen */
export function schedulePush() {
  if (!configured()) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => syncNow(), KR.aktiv ? 400 : 1500);
}

export function start() {
  stop();
  if (!configured()) { setState({ status: altEingetragen() ? 'alt' : 'off' }); return; }
  setState({ status: state.status === 'off' ? 'idle' : state.status, login: (g4() && g4().login) || '' });
  const tick = () => { if (typeof document === 'undefined' || document.visibilityState === 'visible') syncNow(); };
  // Der Kern ist lokal: kurze Abstände kosten nichts (meist 304). Der Gist: alle 20 Sekunden.
  pollTimer = setInterval(tick, KR.aktiv ? 4000 : 20000);
  if (KR.aktiv) { gistInfo(); gistInfoTimer = setInterval(() => { if (document.visibilityState === 'visible') gistInfo(); }, 15000); }
}
export function stop() { clearInterval(pollTimer); pollTimer = null; clearInterval(gistInfoTimer); gistInfoTimer = null; clearTimeout(pushTimer); }
export function gistInfoJetzt() { return gistInfo(); }

/* -------------------- Kopplung (QR-Code fürs Handy) -------------------- */

/** Base64url-JSON { v:4, t: Token, g: Gist, k: Schlüssel, n?: ntfy-Kanal }. Am Laptop liefert der Kern Token und Schlüssel. */
export async function pairPayload(extra = {}) {
  let p;
  if (KR.aktiv) p = JSON.parse(decodeURIComponent(escape(atob((await KR.api('sync/kopplung')).payload.replace(/-/g, '+').replace(/_/g, '/')))));
  else { const g = g4() || {}; p = { v: 4, t: g.token, g: g.id, k: g.k }; }
  Object.assign(p, extra);
  return btoa(unescape(encodeURIComponent(JSON.stringify(p)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function readPairPayload(b64) {
  const s = b64.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(decodeURIComponent(escape(atob(s))));
}
