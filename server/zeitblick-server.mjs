// Zeitblick – Server-Erinnerungen (läuft stündlich als GitHub Action, kostenlos)
// 1. Liest deine Daten aus dem privaten Sync-Gist
// 2. Plant Push-Erinnerungen bei ntfy ein (auch wenn alle Geräte aus sind)
// (Zeitblick 2 hat einen eigenen, internen Kalender – es gibt keine Verbindung zu Google.)
import * as C from '../js/core.js';
import * as N from '../js/ntfy.js';

const TOKEN = process.env.ZB_GIST_TOKEN || '';
const GIST_ID = process.env.ZB_GIST_ID || '';
const APP_URL = process.env.ZB_APP_URL || '';
const API = 'https://api.github.com';

function log(...a) { console.log('[Zeitblick]', ...a); }
function fail(msg) { console.error('::error::' + msg); process.exitCode = 1; }

async function gh(method, path, body) {
  const r = await fetch(API + path, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'zeitblick-server', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`GitHub ${method} ${path}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

async function readGist() {
  const g = await gh('GET', `/gists/${GIST_ID}`);
  const files = {};
  for (const [name, f] of Object.entries(g.files || {})) {
    if (!name.startsWith('zb-')) continue;
    let content = f.content;
    if (f.truncated && f.raw_url) content = await (await fetch(f.raw_url)).text();
    try { files[name] = JSON.parse(content || 'null'); } catch { files[name] = null; }
  }
  const data = C.emptyData();
  for (const c of C.COLLECTIONS) { const v = files[`zb-${c}.json`]; if (v) data[c] = v.items || v; }
  return { data, files };
}

async function main() {
  if (!TOKEN || !GIST_ID) { fail('ZB_GIST_TOKEN und ZB_GIST_ID fehlen. Lege sie unter Settings → Secrets and variables → Actions an.'); return; }
  const { data, files } = await readGist();
  const counts = Object.fromEntries(C.COLLECTIONS.map(c => [c, Object.values(data[c]).filter(x => x && !x.deleted).length]));
  log('Daten gelesen:', JSON.stringify(counts));

  const patch = {};

  const s = C.settingsOf(data);
  if (s.ntfy.on && s.ntfy.topic) {
    const appUrl = s.appUrl || APP_URL;
    if (!appUrl) log('Hinweis: Keine App-Adresse bekannt – Benachrichtigungen haben keinen Deep Link. Setze ZB_APP_URL oder öffne die App einmal.');
    const srv = files['zb-server.json'] || { removed: {} };
    const cut = Date.now() - 14 * C.HOUR;
    const removed = new Set(Object.entries(srv.removed || {}).filter(([, t]) => t > cut).map(([k]) => k));
    const r = await N.reconcile(data, { server: s.ntfy.server, topic: s.ntfy.topic, appUrl, removed });
    log(`Push abgeglichen: ${r.published} neu geplant, ${r.cancelled} storniert, ${r.removed} entfernt, ${r.scheduled} anstehend${r.failed ? `, ${r.failed} Fehler (${r.lastError})` : ''}`);
    const map = {}; for (const k of removed) map[k] = (srv.removed && srv.removed[k]) || Date.now();
    if (JSON.stringify(Object.keys(map).sort()) !== JSON.stringify(Object.keys(srv.removed || {}).sort())) patch['zb-server.json'] = { content: JSON.stringify({ removed: map }) };
  } else log('Handy-Push ist in der App nicht aktiviert – nichts zu planen.');

  if (Object.keys(patch).length) { await gh('PATCH', `/gists/${GIST_ID}`, { files: patch }); log('Gist aktualisiert:', Object.keys(patch).join(', ')); }
}

main().catch(e => fail(e.message));
