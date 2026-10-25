// Zeitblick – Server-Erinnerungen (läuft stündlich als GitHub Action, kostenlos)
// 1. Liest deine Daten aus dem privaten Sync-Gist
// 2. Plant Push-Erinnerungen bei ntfy ein (auch wenn alle Geräte aus sind)
// 3. Liest optional deinen Google Kalender (geheime iCal-Adresse) und legt die Termine im Gist ab
import * as C from '../js/core.js';
import * as N from '../js/ntfy.js';

const TOKEN = process.env.ZB_GIST_TOKEN || '';
const GIST_ID = process.env.ZB_GIST_ID || '';
const ICS = process.env.ZB_GOOGLE_ICS || '';
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

function hash(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }

async function importGoogle(files) {
  if (!ICS.trim()) return null;
  const out = [];
  const now = new Date();
  const from = C.addDays(now, -60), to = C.addDays(now, 400);
  for (const raw of ICS.split(/[,\n]/).map(x => x.trim()).filter(Boolean)) {
    let area = 'p', url = raw;
    const m = raw.match(/^(p|b|privat|geschaeftlich|geschäftlich)\|(.+)$/i);
    if (m) { area = /^b|gesch/i.test(m[1]) ? 'b' : 'p'; url = m[2].trim(); }
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'zeitblick-server' } });
      if (!r.ok) { fail(`Google-Kalender nicht lesbar (${r.status}). Prüfe die iCal-Adresse.`); continue; }
      const list = C.parseICS(await r.text());
      for (const ev of list) {
        const s = C.parseLocal(ev.s), e = C.parseLocal(ev.e || ev.s);
        const recurring = ev.rec && ev.rec.f && (!ev.rec.until || C.parseYmd(ev.rec.until) >= from);
        if (!recurring && (e < from || s > to)) continue;
        out.push({ id: 'g' + hash(ev.uid), uid: ev.uid, title: ev.title, s: ev.s, e: ev.e, allDay: ev.allDay, loc: ev.loc, notes: (ev.notes || '').slice(0, 500), rec: ev.rec || null, exd: ev.exd || [], area, google: true });
      }
      log(`Google-Kalender (${area === 'b' ? 'Geschäftlich' : 'Privat'}): ${list.length} Einträge gelesen`);
    } catch (e) { fail('Google-Kalender: ' + e.message); }
  }
  const before = files['zb-google.json'] && JSON.stringify(files['zb-google.json'].events);
  if (before === JSON.stringify(out)) { log('Google-Termine unverändert'); return null; }
  return { content: JSON.stringify({ v: 1, updatedAt: Date.now(), events: out }) };
}

async function main() {
  if (!TOKEN || !GIST_ID) { fail('ZB_GIST_TOKEN und ZB_GIST_ID fehlen. Lege sie unter Settings → Secrets and variables → Actions an.'); return; }
  const { data, files } = await readGist();
  const counts = Object.fromEntries(C.COLLECTIONS.map(c => [c, Object.values(data[c]).filter(x => x && !x.deleted).length]));
  log('Daten gelesen:', JSON.stringify(counts));

  const patch = {};
  const google = await importGoogle(files);
  if (google) patch['zb-google.json'] = google;

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
