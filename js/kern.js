// Zeitblick 4 – Verbindung zum Zeitblick-Kern am Laptop.
// Liefert der Kern die App aus (http://127.0.0.1:42480), steht window.ZB_KERN mit dem Kern-Schlüssel bereit. Dann ist der
// Kern das Zuhause der Daten: Die App gleicht mit ihm ab, er gleicht verschlüsselt mit dem Gist ab, schreibt Statusdatei
// und Markdown-Spiegel. Ohne Kern (Handy, alte Adresse github.io) gleicht die App selbst verschlüsselt mit dem Gist ab.
export const K = (typeof window !== 'undefined' && window.ZB_KERN) || null;
export const aktiv = !!(K && K.schluessel);
export const test = !!(K && K.test);
export const praefix = (K && K.praefix) || '';
/** Nebenfenster (fenster.html): eigenes kleines Fenster für einen Vorgang oder Entwurf. */
export const fenster = typeof document !== 'undefined' && !!document.documentElement.dataset.fenster;

/** Adresse des Kerns am Laptop. Eine Testinstanz unter localhost:<port> spricht mit „ihrem“ Kern unter 127.0.0.1:<port>. */
export function kernUrl() {
  if (aktiv) return location.origin + '/';
  if (typeof location !== 'undefined' && location.hostname === 'localhost' && location.port) return `http://127.0.0.1:${location.port}/`;
  return 'http://127.0.0.1:42480/';
}

/** Herkunft, von der ein Umzug angenommen wird: die alte Adresse (GitHub Pages), in Testinstanzen localhost. */
export function umzugHerkunft() {
  const l = ['https://alex-froese.github.io'];
  if (test && K.port) l.push(`http://localhost:${K.port}`);
  return l;
}

export class KernFehler extends Error {
  constructor(text, status, code) { super(text); this.status = status; this.code = code || ''; }
}

/** Ruft die Schnittstelle des Kerns. pfad ohne „/api/“. */
export async function api(pfad, { method = 'GET', body, headers = {}, roh = false } = {}) {
  if (!aktiv) throw new KernFehler('Kein Zeitblick-Kern', 0);
  let r;
  try {
    r = await fetch('/api/' + pfad, {
      method,
      headers: { 'X-Schluessel': K.schluessel, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
  } catch (e) { throw new KernFehler('Der Zeitblick-Kern antwortet nicht. Läuft Zeitblick im Infobereich?', 0, 'offline'); }
  if (roh) return r;
  if (r.status === 304) return { nichtGeaendert: true, etag: r.headers.get('ETag') };
  let j = null;
  try { j = await r.json(); } catch { j = null; }
  if (!r.ok) throw new KernFehler((j && j.fehler) || `Kern antwortet mit ${r.status}`, r.status, j && j.code);
  if (j && typeof j === 'object' && !Array.isArray(j)) Object.defineProperty(j, '_etag', { value: r.headers.get('ETag'), enumerable: false });
  return j;
}

/** Fenster über den Kern öffnen (eigenes Edge-App-Fenster mit Taskleisten-Ausweis). art: haupt | entwurf | vorgang */
export async function fensterOeffnen(art, id = '', ziel = '') {
  if (aktiv) return api('fenster', { method: 'POST', body: { art, id, ziel } });
  // Ohne Kern: ein Browser-Fenster (am Handy ein neuer Tab).
  const url = art === 'haupt' ? (ziel || './') : art === 'vorgang' ? `fenster.html#/vorgang/${encodeURIComponent(id)}` : `fenster.html#/entwurf/${encodeURIComponent(id)}`;
  const w = window.open(url, '_blank', art === 'haupt' ? '' : 'popup,width=560,height=720');
  return { ok: !!w };
}
