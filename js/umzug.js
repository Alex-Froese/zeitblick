// Zeitblick 4 – Umzug der Daten von der alten Adresse (alex-froese.github.io, Edge-Speicher am Laptop) zum Zeitblick-Kern.
// Ein Klick in der alten App öffnet den Kern (http://127.0.0.1:42480/#/umzug) und reicht die Daten per postMessage weiter
// (kein Netzwerk, keine Freigabe nötig). Der Kern sichert vorher seinen Stand und legt die übergebenen Daten unverändert ab;
// zusammengeführt wird wie beim Sync (je Datensatz gewinnt die neuere Änderung). Rückweg: Die alte Ablage im Browser bleibt
// unangetastet, die alte App zeigt danach nur einen Hinweis und plant keine Erinnerungen mehr.
import * as C from './core.js';
import * as S from './store.js';
import * as SY from './sync.js';
import * as KR from './kern.js';
import { esc, icon } from './ui.js';

const LOKAL_UEBERNEHMEN = ['theme', 'nightAuto', 'uiScale', 'density', 'startPage', 'calView', 'calLayers', 'calHidden', 'vgMode', 'vgSort', 'vgFilter', 'taskList', 'taskGroup', 'sideCompact', 'sound', 'sysNotif', 'heute'];

/** Am Laptop unter der alten Adresse mit Daten: Umzug anbieten. */
export function moeglich() {
  if (KR.aktiv || KR.fenster) return false;
  const laptop = typeof matchMedia !== 'undefined' && matchMedia('(pointer: fine)').matches;
  const c = S.countData(S.getData());
  return laptop && (c.tasks + c.events + c.notes + c.habits + c.inbox) > 0;
}
export const umgezogen = () => !KR.aktiv && S.local.umgezogen ? S.local.umgezogen : null;

/** Alte Adresse: Daten an den Kern übergeben. Löst mit { anzahl } auf. */
export function starten() {
  const ziel = KR.kernUrl();
  const zielOrigin = new URL(ziel).origin;
  const w = window.open(ziel + '#/umzug', 'zeitblick-umzug', 'popup,width=640,height=760');
  if (!w) return Promise.reject(new Error('Der Browser hat das Fenster blockiert. Bitte Pop-ups für diese Seite erlauben.'));
  return new Promise((resolve, reject) => {
    let fertig = false;
    const aufraeumen = () => { fertig = true; clearTimeout(uhr); window.removeEventListener('message', an); };
    const uhr = setTimeout(() => { if (!fertig) { aufraeumen(); reject(new Error('Der Zeitblick-Kern antwortet nicht. Läuft Zeitblick am Laptop (Symbol neben der Uhr)?')); } }, 45000);
    const an = ev => {
      if (ev.origin !== zielOrigin || ev.source !== w) return;
      const m = ev.data || {};
      if (m.typ === 'zb-umzug-bereit') {
        const lokal = {};
        for (const k of LOKAL_UEBERNEHMEN) if (S.local[k] !== undefined) lokal[k] = S.local[k];
        w.postMessage({ typ: 'zb-umzug-daten', daten: S.getData(), lokal, herkunft: location.origin, version: C.APP_VERSION, anzahl: S.countData(S.getData()) }, zielOrigin);
      }
      if (m.typ === 'zb-umzug-fertig') {
        aufraeumen();
        S.local.umgezogen = { am: Date.now(), ziel, anzahl: m.anzahl || null };
        S.saveLocalNow();
        resolve(m);
      }
      if (m.typ === 'zb-umzug-fehler') { aufraeumen(); reject(new Error(m.fehler || 'Umzug fehlgeschlagen')); }
    };
    window.addEventListener('message', an);
  });
}

/** c = Zählung wie S.countData */
function zaehlen(c) {
  return [[c.tasks, 'Vorgänge'], [c.events, 'Termine'], [c.habits, 'Gewohnheiten und Routinen'], [c.notes, 'Notizen'], [c.inbox, 'Inbox'], [c.goals, 'Ziele'], [c.projects, 'Projekte'], [c.people, 'Personen'], [c.templates, 'Vorlagen']]
    .filter(([n]) => n > 0).map(([n, l]) => `${n} ${l}`).join(' · ') || 'keine Einträge';
}

/** Übernimmt Daten der alten Adresse in den Kern: erst unverändert ablegen (der Kern sichert vorher), dann
 *  zusammenführen wie beim Sync. Gemeinsamer Weg für die Übergabe per Klick und den Ersatzweg per Sicherungsdatei. */
export async function uebernehmen(daten, { lokal = null, herkunft = '', version = '' } = {}) {
  await KR.api('umzug', { method: 'POST', body: { text: JSON.stringify({ app: 'Zeitblick', version, herkunft, exportedAt: new Date().toISOString(), data: daten }), herkunft } });
  const ein = C.emptyData();
  for (const c of C.COLLECTIONS) ein[c] = (daten && daten[c]) || {};
  const { merged } = C.mergeData(S.getData(), ein);
  S.applyMerged(merged);
  if (!S.local.umzugEinst && lokal) { for (const [k, v] of Object.entries(lokal)) if (LOKAL_UEBERNEHMEN.includes(k)) S.local[k] = v; S.local.umzugEinst = Date.now(); }
  S.local.onboarded = true;
  S.saveLocalNow();
  await S.saveNow();
  await SY.syncNow({ force: true });
  return S.countData(ein);
}

/** Kern-Seite #/umzug: wartet auf die Daten der alten Adresse (oder nimmt eine Sicherungsdatei). */
export function kernSeite(root) {
  if (!KR.aktiv) return false;
  const erlaubt = KR.umzugHerkunft();
  const zeige = (html) => { root.innerHTML = `<div class="page umzug"><div class="card umzug-karte"><div class="umzug-symbol">${icon('upload', 28)}</div>${html}</div></div>`; };
  const fertig = (n) => {
    zeige(`<h1>Umzug fertig</h1><p>Übernommen: ${esc(zaehlen(n))}.</p><p class="small muted">Gesichert wurde vorher automatisch. Die alte Adresse behält ihre Daten (Rückweg) und plant keine Erinnerungen mehr. Ab jetzt öffnest du Zeitblick über das Symbol neben der Uhr, die Taskleiste oder Strg+Alt+Z.</p><button class="btn btn-primary" data-umzugzu>Fertig</button>`);
    root.querySelector('[data-umzugzu]').addEventListener('click', () => { if (window.opener) window.close(); setTimeout(() => { location.hash = '#/heute'; }, 200); });
  };
  const schief = (e) => zeige(`<h1>Umzug nicht geklappt</h1><p class="status-line err">${esc(e.message || String(e))}</p><p class="small muted">Es wurde nichts verändert, was verloren gehen könnte: Die alte Adresse hat alle Daten, und hier wurde vorher gesichert.</p><a class="btn" href="#/heute">Zu Zeitblick</a>`);
  if (!window.opener) {
    // Ersatzweg, falls der Browser kein eigenes Fenster öffnet: Sicherungsdatei der alten Adresse einspielen.
    zeige(`<h1>Umzug ans Laptop-Zuhause</h1><p>Öffne Zeitblick unter der alten Adresse (<span class="code">alex-froese.github.io/zeitblick</span>) und wähle dort <b>Daten umziehen</b> (Band oben oder Einstellungen → Sync). Dieses Fenster öffnet sich dann von selbst.</p>
      <p class="small muted">Klappt das nicht: dort Einstellungen → Datensicherung → <b>Sicherung herunterladen</b> und die Datei hier einspielen.</p>
      <div class="row wrap" style="justify-content:center"><button class="btn" data-umzugdatei>${icon('upload', 15)}Sicherungsdatei einspielen</button><a class="btn btn-primary" href="#/heute">Zu Zeitblick</a></div>`);
    root.querySelector('[data-umzugdatei]').addEventListener('click', async () => {
      const { pickFile } = await import('./ui.js');
      const f = await pickFile('.json,application/json'); if (!f) return;
      try {
        const daten = S.parseImport(await f.text());
        zeige(`<h1>Daten werden übernommen …</h1><p class="small muted">Einen Moment. Vorher wird der jetzige Stand gesichert.</p>`);
        fertig(await uebernehmen(daten, { herkunft: 'datei:' + f.name }));
      } catch (e) { schief(e); }
    });
    return true;
  }
  zeige(`<h1>Daten werden übernommen …</h1><p class="small muted">Einen Moment. Vorher wird der jetzige Stand gesichert.</p>`);
  const an = async ev => {
    if (!erlaubt.includes(ev.origin)) return;
    const m = ev.data || {};
    if (m.typ !== 'zb-umzug-daten' || !m.daten) return;
    window.removeEventListener('message', an);
    const antwort = (x) => { try { ev.source.postMessage(x, ev.origin); } catch { } };
    try {
      const n = await uebernehmen(m.daten, { lokal: m.lokal, herkunft: m.herkunft, version: m.version });
      antwort({ typ: 'zb-umzug-fertig', ok: true, anzahl: n });
      fertig(n);
    } catch (e) {
      antwort({ typ: 'zb-umzug-fehler', fehler: e.message || String(e) });
      schief(e);
    }
  };
  window.addEventListener('message', an);
  for (const o of erlaubt) { try { window.opener.postMessage({ typ: 'zb-umzug-bereit' }, o); } catch { } }
  return true;
}
