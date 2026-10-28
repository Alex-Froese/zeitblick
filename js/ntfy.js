// Zeitblick – Push-Benachrichtigungen aufs Handy (und Laptop) über ntfy
// Plant Erinnerungen bis zu ~70 Std im Voraus auf dem ntfy-Server ein, aktualisiert und storniert sie.
// Erledigte Aufgaben → zugestellte Benachrichtigungen werden vom Handy entfernt.
import * as C from './core.js';

export const HORIZON_H = 70;
export const ESC_AHEAD_H = 24;
export const MAX_PLANNED = 40;
export const PREFIX = 'zb-';

export function cleanServer(server) { return String(server || 'https://ntfy.sh').trim().replace(/\/+$/, ''); }
export function randomTopic() { return 'zeitblick-' + C.uid('', 14).toLowerCase(); }

function ridFromClick(click) {
  const m = click && String(click).match(/[?&]r=([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}

/** Liest geplante + zugestellte Nachrichten. Ergebnis: Map seq → { at, deleted } (jeweils das neueste Ereignis) */
export async function listKnown(server, topic, fetchFn = fetch) {
  const since = Math.floor((Date.now() - 13 * C.HOUR) / 1000);
  const res = await fetchFn(`${cleanServer(server)}/${encodeURIComponent(topic)}/json?poll=1&sched=1&since=${since}`, { cache: 'no-store' });
  if (!res.ok) throw Object.assign(new Error(`ntfy antwortet mit ${res.status}`), { status: res.status });
  const text = await res.text();
  const map = new Map();
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let m; try { m = JSON.parse(line); } catch { continue; }
    const seq = m.sequence_id || ridFromClick(m.click);
    if (!seq || !seq.startsWith(PREFIX)) continue;
    const at = (m.time || 0) * 1000;
    const isDel = m.event === 'message_delete';
    if (m.event !== 'message' && !isDel) continue;
    const prev = map.get(seq);
    if (!prev || at > prev.at || (at === prev.at && isDel)) map.set(seq, { at, deleted: isDel });
  }
  return map;
}

export function withRid(url, rid) {
  if (!url) return url;
  return url + (url.includes('?') ? '&' : '?') + 'r=' + rid;
}

export async function publish(server, topic, r, fetchFn = fetch, now = Date.now()) {
  const body = {
    topic,
    title: r.title,
    message: r.message,
    priority: r.priority || 3,
    tags: r.tags && r.tags.length ? r.tags : undefined,
    click: withRid(r.click, r.rid),
    actions: (r.actions || []).slice(0, 3).map(a => ({ ...a })),
    sequence_id: r.rid,
  };
  if (r.at > now + 15000) body.delay = String(Math.floor(r.at / 1000));
  // Ohne Content-Type-Header → einfache Anfrage ohne CORS-Vorabprüfung
  const res = await fetchFn(cleanServer(server) + '/', { method: 'POST', body: JSON.stringify(body) });
  if (!res.ok) {
    let t = ''; try { t = await res.text(); } catch { }
    throw Object.assign(new Error(`ntfy ${res.status} ${t.slice(0, 120)}`), { status: res.status });
  }
  return true;
}

export async function cancel(server, topic, seq, fetchFn = fetch) {
  const res = await fetchFn(`${cleanServer(server)}/${encodeURIComponent(topic)}/${encodeURIComponent(seq)}/delete`, { cache: 'no-store' });
  if (!res.ok && res.status !== 404) throw Object.assign(new Error(`ntfy ${res.status}`), { status: res.status });
  return true;
}

function parseTaskRid(seq) {
  const m = seq.match(/^zb-t-([A-Za-z0-9]+)-[a-z]+\d*-(\d{10})$/);
  return m ? { id: m[1], stamp: m[2] } : null;
}
function parseEventRid(seq) {
  const m = seq.match(/^zb-e-([A-Za-z0-9]+)-/);
  return m ? { id: m[1] } : null;
}
function stampToDate(st) { return new Date(2000 + Number(st.slice(0, 2)), Number(st.slice(2, 4)) - 1, Number(st.slice(4, 6)), Number(st.slice(6, 8)), Number(st.slice(8, 10))); }
function stampOf(t) { const d = C.taskDueAt(t); if (!d) return null; return `${String(d.getFullYear()).slice(2)}${C.pad(d.getMonth() + 1)}${C.pad(d.getDate())}${C.pad(d.getHours())}${C.pad(d.getMinutes())}`; }

/**
 * Abgleich: gewünschte Erinnerungen vs. Server. Gibt einen Plan zurück (für Tests) und führt ihn aus.
 */
export function plan(desired, known, data, now = Date.now(), keepIds = null) {
  const publishList = [], cancelList = [], removeDelivered = [];
  const want = new Map(desired.map(d => [d.rid, d]));
  for (const d of desired) {
    const k = known.get(d.rid);
    if (k && !k.deleted) {
      // schon zugestellt (Zeit in der Vergangenheit) oder richtig geplant
      if (k.at <= now + 60000) continue;
      if (Math.abs(k.at - d.at) <= 60000) continue;
      publishList.push(d); // anders geplant → ersetzen
      continue;
    }
    if (k && k.deleted) {
      // nach Löschung erneut gewünscht (z. B. Aufgabe wieder geöffnet) – nur Zukünftiges neu planen
      if (d.at > now + 60000) publishList.push(d);
      continue;
    }
    // unbekannt
    if (d.at <= now + 60000 && d.at < now - 10 * C.MIN) continue; // zu alt
    publishList.push(d);
  }
  for (const [seq, k] of known) {
    if (k.deleted) continue;
    if (k.at > now + 60000) {
      if (!want.has(seq) && !(keepIds && keepIds.has(seq))) cancelList.push(seq);
      continue;
    }
    // zugestellt: nur entfernen, wenn erledigt/gelöscht/verschoben
    const tr = parseTaskRid(seq);
    if (tr) {
      const t = data.tasks[tr.id];
      if (!t || t.deleted || t.done || stampOf(t) !== tr.stamp) removeDelivered.push(seq);
      continue;
    }
    const er = parseEventRid(seq);
    if (er) {
      const e = data.events[er.id];
      if (!e || e.deleted) removeDelivered.push(seq);
      continue;
    }
    const m = seq.match(/^zb-([nhi])-(?:([A-Za-z0-9]+)-)?(\d{10})$/);
    if (m) {
      const at = stampToDate(m[3]);
      const key = C.ymd(at);
      if (m[1] === 'n') {
        const n = data.notes && data.notes[m[2]];
        if (!n || n.deleted || !n.read || !n.read.on) { removeDelivered.push(seq); continue; }
        const upTo = C.noteSlots(n, C.startOfDay(at)).filter(x => x <= at).length;
        if (C.noteReadsOn(n, key) >= Math.max(1, upTo)) removeDelivered.push(seq);
      } else if (m[1] === 'h') {
        const h = data.habits && data.habits[m[2]];
        if (!h || h.deleted || h.archived || C.habitDoneOn(h, key)) removeDelivered.push(seq);
      } else if (m[1] === 'i') {
        const red = Object.values(data.inbox || {}).filter(x => x && !x.deleted && C.inboxAmpel(x, new Date(now)) === 'red').length;
        if (!red) removeDelivered.push(seq);
      }
    }
  }
  publishList.sort((a, b) => a.at - b.at);
  return { publishList, cancelList, removeDelivered };
}

export async function reconcile(data, opts) {
  const { server, topic, appUrl, fetchFn = fetch, maxOps = 30, removed: removedSet = new Set() } = opts;
  const now = Date.now();
  const all = C.buildReminders(data, new Date(now), { appUrl, horizonH: HORIZON_H, max: 400 });
  // Volumen begrenzen (ntfy.sh: 60 Anfragen am Stück, dann 1 je 10 s): Eskalationen nur 24 Std im Voraus, höchstens 40 nächste
  const desired = all.filter(r => !(r.level === 'red' || r.level === 'alarm') || r.at <= now + ESC_AHEAD_H * C.HOUR).slice(0, MAX_PLANNED);
  const allIds = new Set(all.map(r => r.rid));
  const known = await listKnown(server, topic, fetchFn);
  const p = plan(desired, known, data, now, allIds);
  p.removeDelivered = p.removeDelivered.filter(seq => !removedSet.has(seq));
  let ops = 0, published = 0, cancelled = 0, removed = 0, failed = 0;
  let lastError = '';
  for (const seq of [...p.cancelList, ...p.removeDelivered]) {
    if (ops++ >= maxOps) break;
    try {
      await cancel(server, topic, seq, fetchFn);
      if (p.cancelList.includes(seq)) cancelled++; else { removed++; removedSet.add(seq); }
    } catch (e) { failed++; lastError = e.message; }
  }
  for (const d of p.publishList) {
    if (ops++ >= maxOps) break;
    try { await publish(server, topic, d, fetchFn, now); published++; } catch (e) { failed++; lastError = e.message; if (e.status === 429) break; }
  }
  const scheduled = desired.filter(d => d.at > now).length;
  return { published, cancelled, removed, failed, scheduled, lastError, removedSet, pending: Math.max(0, p.publishList.length + p.cancelList.length + p.removeDelivered.length - ops) };
}

export async function sendTest(server, topic, appUrl, fetchFn = fetch) {
  return publish(server, topic, {
    rid: 'zb-test-' + Date.now(),
    at: Date.now(),
    title: '✅ Zeitblick ist verbunden',
    message: 'So sehen deine Erinnerungen aus. Tippen öffnet die App.',
    priority: 4,
    tags: [],
    click: C.deepLink(appUrl, { open: 'start' }),
    actions: [],
  }, fetchFn);
}
