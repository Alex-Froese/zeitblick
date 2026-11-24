// Zeitblick 4 – Entwürfe (Fenster-Regel aus 02-design-sprache.md, Muster aus Klarblick 1.1.0).
// Ein neuer Vorgang ist ab dem ersten Buchstaben ein Entwurf: jede Eingabe sofort im Gerät (localStorage, ein Eintrag je
// Entwurf) und kurz danach im Kern (entwuerfe.json mit früheren Fassungen). Fenster schließen nur über ✕ oder Esc, nie beim
// Klick daneben oder beim Wechsel in ein anderes Programm. Was nicht angelegt ist, wartet als Karte unten rechts.
// Ein Entwurf lebt an einer Stelle: Öffnet ihn ein anderes Fenster, gibt dieses ihn ab (Kanal zwischen den Fenstern).
import * as KR from './kern.js';

const PRAEFIX = 'zb.entwurf:';
const REV = 'zb.entwuerfe.rev';
export const FENSTER = 'f-' + Math.random().toString(36).slice(2, 10);
const kanal = typeof BroadcastChannel === 'function' ? new BroadcastChannel('zeitblick-entwuerfe') : null;
const zuhoerer = new Set();
const uhren = new Map();
const offenHier = new Set();

export function neueId() { return 'e-' + [...crypto.getRandomValues(new Uint8Array(6))].map(b => b.toString(16).padStart(2, '0')).join(''); }
export const leer = e => !e || (!String(e.titel || '').trim() && !String(e.text || '').trim());
export function name(e) {
  const t = String(e?.titel || '').trim() || String(e?.text || '').trim().split('\n')[0];
  return t ? (t.length > 60 ? t.slice(0, 58) + '…' : t) : 'Neuer Vorgang';
}

function lesen(id) { try { return JSON.parse(localStorage.getItem(PRAEFIX + id) || 'null'); } catch { return null; } }
function ablegen(e) { try { localStorage.setItem(PRAEFIX + e.id, JSON.stringify(e)); return true; } catch { return false; } }
function entfernen(id) { try { localStorage.removeItem(PRAEFIX + id); } catch { /* egal */ } }

export const holen = id => lesen(id);

/** Alle Entwürfe dieses Geräts, neueste zuerst. zustand: offen | verworfen | gespeichert | alle */
export function alle({ zustand = 'offen', auchLeere = false } = {}) {
  const l = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(PRAEFIX)) continue;
      const e = lesen(k.slice(PRAEFIX.length));
      if (e && (zustand === 'alle' || e.zustand === zustand) && (auchLeere || !leer(e))) l.push(e);
    }
  } catch { /* gesperrt */ }
  return l.sort((a, b) => (b.geaendert || 0) - (a.geaendert || 0));
}

/** fn(art, id): neu | geaendert | verworfen | gespeichert | wiederhergestellt | nimmt | kern */
export function beobachten(fn) { zuhoerer.add(fn); return () => zuhoerer.delete(fn); }
function melden(art, id, info = {}, weiter = true) {
  for (const f of zuhoerer) { try { f(art, id, info); } catch (err) { console.error(err); } }
  if (weiter && kanal) try { kanal.postMessage({ art, id, fenster: FENSTER, ...info }); } catch { }
}
if (kanal) kanal.onmessage = ev => { const m = ev.data || {}; if (m.fenster !== FENSTER) melden(m.art, m.id, m, false); };
if (typeof window !== 'undefined') window.addEventListener('storage', ev => { if (ev.key && ev.key.startsWith(PRAEFIX)) melden('geaendert', ev.key.slice(PRAEFIX.length), {}, false); });

/** Speichert eine Eingabe sofort im Gerät und kurz danach im Kern. */
export function setzen(patch) {
  const alt = lesen(patch.id) || { id: patch.id, erstellt: Date.now(), zustand: 'offen', art: 'vorgang' };
  if (alt.zustand === 'gespeichert') return alt;
  const e = { ...alt, ...patch, zustand: patch.zustand || (alt.zustand === 'verworfen' ? 'offen' : alt.zustand), geaendert: Date.now() };
  ablegen(e);
  melden(alt.geaendert ? 'geaendert' : 'neu', e.id);
  zumKern(e, 700);
  return e;
}

function zumKern(e, ms) {
  if (!KR.aktiv) return;
  clearTimeout(uhren.get(e.id));
  uhren.set(e.id, setTimeout(async () => {
    uhren.delete(e.id);
    const cur = lesen(e.id) || e;
    try {
      const pfad = cur.zustand === 'gespeichert' ? 'entwuerfe/gespeichert' : 'entwuerfe';
      await KR.api(pfad, { method: pfad === 'entwuerfe' ? 'PUT' : 'POST', body: { entwurf: { id: cur.id, titel: cur.titel || '', text: cur.text || '', extra: cur.extra || '', zustand: cur.zustand, erstellt: cur.erstellt, geaendert: cur.geaendert, ziel: cur.ziel || '' }, quelle: FENSTER } });
    } catch { /* Kern kurz weg: der Stand im Gerät bleibt, nächste Eingabe versucht es wieder */ }
  }, ms));
}

export function verwerfen(id) {
  const e = lesen(id); if (!e) return;
  if (leer(e)) { entfernen(id); melden('verworfen', id); return; }
  const n = { ...e, zustand: 'verworfen', verworfenAm: Date.now(), geaendert: Date.now() };
  ablegen(n); melden('verworfen', id); zumKern(n, 0);
}

export function zurueckholen(id) {
  const e = lesen(id); if (!e) return null;
  const n = { ...e, zustand: 'offen', geaendert: Date.now() };
  ablegen(n); melden('wiederhergestellt', id); zumKern(n, 0);
  return n;
}

/** Aus dem Entwurf ist ein Vorgang geworden. */
export function gespeichert(id, ziel) {
  const e = lesen(id) || { id, erstellt: Date.now() };
  const n = { ...e, zustand: 'gespeichert', ziel, gespeichertAm: Date.now(), geaendert: Date.now() };
  ablegen(n); melden('gespeichert', id, { ziel }); zumKern(n, 0);
}

/** Dieses Fenster arbeitet am Entwurf: Andere Fenster geben ihn ab. */
export function nehmen(id) { offenHier.add(id); melden('nimmt', id); }
export function abgeben(id) { offenHier.delete(id); melden('zu', id); }
export const istHierOffen = id => offenHier.has(id);

/** Holt Entwürfe vom Kern (anderes Fenster, Neustart, geleerter Browser-Speicher). Der neuere Stand gilt. */
export async function vomKern() {
  if (!KR.aktiv) return 0;
  let seit = 0; try { seit = Number(localStorage.getItem(REV) || 0); } catch { }
  let r;
  try { r = await KR.api('entwuerfe?seit=' + seit); } catch { return 0; }
  let n = 0;
  for (const k of r.entwuerfe || []) {
    const l = lesen(k.id);
    if (l && (l.geaendert || 0) >= (k.geaendert || 0)) continue;
    ablegen({ ...(l || {}), id: k.id, titel: k.titel, text: k.text, extra: k.extra, zustand: k.zustand, erstellt: k.erstellt, geaendert: k.geaendert, ziel: k.ziel || '', art: 'vorgang' });
    n++;
    melden('kern', k.id, {}, false);
  }
  try { localStorage.setItem(REV, String(r.rev || 0)); } catch { }
  return n;
}

/** Gespeicherte nach 14 Tagen, verworfene nach 30 Tagen, leere nach einem Tag aus dem Gerät (im Kern bleiben sie bis dahin auch). */
export function aufraeumen() {
  const jetzt = Date.now(), tag = 86400000;
  for (const e of alle({ zustand: 'alle', auchLeere: true })) {
    const stand = Math.max(e.geaendert || 0, e.gespeichertAm || 0, e.verworfenAm || 0);
    if ((e.zustand === 'gespeichert' && jetzt - stand > 14 * tag) || (e.zustand === 'verworfen' && jetzt - stand > 30 * tag) || (leer(e) && jetzt - (e.geaendert || 0) > tag)) entfernen(e.id);
  }
}
