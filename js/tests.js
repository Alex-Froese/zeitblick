// Zeitblick 4 – Logik-Tests (test.html, nur in Testinstanzen). Ergebnis zusätzlich in window.ZB_TEST_ERGEBNIS.
import * as C from './core.js';
import * as Z from './krypto.js';
import * as E from './entwuerfe.js';
import { sheet, closeAllSheets, topSheet } from './ui.js';

const liste = [];
let ok = 0, fehler = 0;
function pruefe(name, bed, info = '') {
  liste.push({ name, ok: !!bed, info });
  if (bed) ok++; else { fehler++; console.error('Test fehlgeschlagen:', name, info); }
}
const K = window.ZB_KERN;
async function kern(pfad, opt = {}) {
  const r = await fetch('/api/' + pfad, { method: opt.method || 'GET', headers: { 'X-Schluessel': K.schluessel, 'Content-Type': 'application/json' }, body: opt.body ? JSON.stringify(opt.body) : undefined });
  return r.json();
}
async function gist(method, pfad, body) {
  const r = await fetch('/testgist' + pfad, { method, headers: { Authorization: 'Bearer test-token-zeitblick', 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return r.json();
}
const datei = (c, items) => JSON.stringify({ v: 4, c, items });

async function kryptoTests() {
  const k = Z.neuerSchluessel();
  const text = Z.alsText(k);
  pruefe('Base32: 13 Vierergruppen', /^([A-Z2-7]{4}-){12}[A-Z2-7]{4}$/.test(text), text.length);
  pruefe('Base32: hin und zurück', Z.alsText(Z.ausText(text.toLowerCase().replace(/-/g, ' '))) === text);
  const klar = datei('tasks', { a: { id: 'a', title: 'Umlaute äöü ß „Zitat“ 🚀', updatedAt: 1 } });
  const u = await Z.verschluesseln(k, 'tasks', klar);
  pruefe('Umschlag ohne Klartext', !u.includes('Umlaute') && Z.istUmschlag(u));
  pruefe('entschlüsseln = Klartext', (await Z.entschluesseln(k, 'tasks', u)) === klar);
  let wurf = false; try { await Z.entschluesseln(k, 'cats', u); } catch { wurf = true; }
  pruefe('an Sammlung gebunden', wurf);
  wurf = false; try { const x = JSON.parse(u); x.ct = x.ct.slice(0, -4) + 'AAAA'; await Z.entschluesseln(k, 'tasks', JSON.stringify(x)); } catch { wurf = true; }
  pruefe('veränderter Inhalt erkannt', wurf);
  wurf = false; try { await Z.entschluesseln(Z.neuerSchluessel(), 'tasks', u); } catch { wurf = true; }
  pruefe('falscher Schlüssel erkannt', wurf);
}

async function kreuzTests() {
  // Der Kern verschlüsselt, die App entschlüsselt – und umgekehrt (gleiches Verfahren in C# und JavaScript).
  const z = await kern('sync/zustand');
  if (!z.verbunden) { pruefe('Kern mit Gist-Attrappe verbunden (erst api-test.ps1 laufen lassen)', false); return; }
  const haupt = Z.ausText((await kern('sync/schluessel')).text);
  pruefe('Schlüssel-Kennung gleich (C# und JS)', (await Z.schluesselId(haupt)) === z.sid);
  const g = await gist('GET', '/gists/' + z.gistId);
  const tasks = await Z.entschluesseln(haupt, 'tasks', g.files['zb4-tasks.json'].content);
  pruefe('App entschlüsselt, was der Kern verschlüsselt', tasks.includes('"items"'));
  const lokal = JSON.parse(tasks);
  const id = 'tk_js_' + Date.now();
  lokal.items[id] = { id, title: 'Von der App verschlüsselt', status: 'neu', updatedAt: Date.now(), dev: 'js' };
  await gist('PATCH', '/gists/' + z.gistId, { files: { 'zb4-tasks.json': { content: await Z.verschluesseln(haupt, 'tasks', JSON.stringify(lokal)) } } });
  const j = await kern('sync/jetzt', { method: 'POST' });
  const s = await kern('sync');
  pruefe('Kern entschlüsselt, was die App verschlüsselt', j.status === 'bereit' && JSON.parse(s.dateien['zb-tasks.json']).items[id], j.fehler || '');
}

async function mergeParitaet() {
  // Gleiche Ergebnisse in App (core.js mergeData) und Kern (RohJson.Zusammenfuehren), auch bei Gleichstand.
  const jetzt = Date.now();
  const faelle = [
    [{ a: { id: 'a', t: 'L', updatedAt: 5 } }, { a: { id: 'a', t: 'R', updatedAt: 9 } }],
    [{ a: { id: 'a', t: 'L', updatedAt: 9 } }, { a: { id: 'a', t: 'R', updatedAt: 5 } }],
    [{ a: { id: 'a', t: 'Lb', updatedAt: 7 } }, { a: { id: 'a', t: 'La', updatedAt: 7 } }],   // Gleichstand
    [{ a: { id: 'a', t: 'x', updatedAt: 7, dev: 'b' } }, { a: { id: 'a', t: 'x', updatedAt: 7, dev: 'a' } }],
    [{ a: { id: 'a', deleted: true, updatedAt: 1 } }, {}],                                     // alter Löschmarker
    [{ a: { id: 'a', deleted: true, updatedAt: jetzt - 1000 } }, { a: { id: 'a', t: 'alt', updatedAt: jetzt - 5000 } }],
    [{}, { b: { id: 'b', t: 'neu', updatedAt: 3 } }],
    [{ c: { id: 'c', t: 'ä „ö“ \\ " \n', n: 1.5, updatedAt: 3 } }, { c: { id: 'c', t: 'ä „ö“ \\ " \n', n: 1.5, updatedAt: 3 } }],
  ];
  let gleich = 0;
  for (const [L, R] of faelle) {
    const js = C.mergeData({ tasks: L }, { tasks: R }, jetzt);
    const k = await kern('test/zusammenfuehren', { method: 'POST', body: { sammlung: 'tasks', lokal: datei('tasks', L), entfernt: datei('tasks', R), jetzt } });
    const kItems = JSON.parse(k.ergebnis).items;
    const same = JSON.stringify(Object.keys(js.merged.tasks).sort().map(i => [i, js.merged.tasks[i]])) === JSON.stringify(Object.keys(kItems).sort().map(i => [i, kItems[i]]))
      && js.localChanged === k.lokalGeaendert && js.remoteChanged === k.entferntGeaendert;
    if (same) gleich++; else console.warn('Abweichung', L, R, js, k);
  }
  pruefe(`Zusammenführung App = Kern (${gleich}/${faelle.length} Fälle)`, gleich === faelle.length);
}

function anwenden(d) {
  const l = C.migrations(d);
  for (const m of l) {
    if (m.remove) { const p = d[m.col][m.rec.id]; if (p && !p.deleted) d[m.col][m.rec.id] = { id: m.rec.id, deleted: true }; }
    else d[m.col][m.rec.id] = { ...m.rec };
  }
  return l.length;
}

function migrationsTests() {
  const v3 = C.emptyData();
  v3.life = {
    l1: { id: 'l1', name: 'Gesundheit & Körper', icon: '🫀', order: 0, ratings: [{ d: '2026-11-01', v: 7 }] },
    l2: { id: 'l2', name: 'Partnerschaft', icon: '❤️', order: 1, ratings: [] },
    l3: { id: 'l3', name: 'Familie & Freunde', icon: '👪', order: 2, ratings: [] },
    l4: { id: 'l4', name: 'Selbstreflexion', icon: '🪞', order: 3, ratings: [] },
  };
  v3.tasks = { t1: { id: 't1', title: 'Alt', status: 'neu', life: 'l1' }, t2: { id: 't2', title: 'Demo', status: 'neu', demo: true } };
  v3.templates = { 'tpl-a': { id: 'tpl-a', name: 'A-Woche', example: true }, 'tpl-x': { id: 'tpl-x', name: 'Eigene' } };
  const vorher = JSON.stringify(v3);
  anwenden(v3);
  const saeulen = Object.values(v3.life).filter(x => x && !x.deleted && x.saeule);
  pruefe('8 Säulen nach der Migration', new Set(saeulen.map(x => x.saeule)).size === 8);
  pruefe('eigener Bereich wird Säule (Bewertung bleibt)', v3.life.l1.saeule === 'gesundheit' && v3.life.l1.ratings.length === 1 && v3.life.l1.name === 'Gesundheit & Körper');
  pruefe('Partnerschaft → Beziehungen', v3.life.l2.saeule === 'beziehungen');
  pruefe('weitere eigene Bereiche bleiben, hinter den Säulen', v3.life.l3 && !v3.life.l3.deleted && v3.life.l4 && v3.life.l4.order >= 8 && !v3.life.l4.saeule);
  pruefe('fehlende Säulen ergänzt', v3.life.l_unternehmen && v3.life.l_unternehmen.saeule === 'unternehmen');
  pruefe('Verknüpfung Vorgang → Bereich bleibt', v3.tasks.t1.life === 'l1');
  pruefe('Demo wird Beispiel', v3.tasks.t2.beispiel === true && !v3.tasks.t1.beispiel);
  pruefe('Beispiel-Vorlage gekennzeichnet, eigene nicht', v3.templates['tpl-a'].beispiel === true && !v3.templates['tpl-x'].beispiel);
  pruefe('Datenstand 4 vermerkt', v3.meta.schema && v3.meta.schema.v === 4);
  pruefe('Migration ist idempotent', anwenden(v3) === 0);
  pruefe('nichts gelöscht', Object.keys(JSON.parse(vorher).life).every(id => v3.life[id] && !v3.life[id].deleted));
  // Übernommenes Beispiel wird nie wieder markiert
  v3.tasks.t2 = { ...v3.tasks.t2, beispiel: false }; delete v3.tasks.t2.demo;
  pruefe('übernommenes Beispiel bleibt übernommen', anwenden(v3) === 0 && v3.tasks.t2.beispiel === false);

  // Umzug: am Kern zuerst leer (Säulen vorbelegt), dann kommen die alten Bereiche dazu
  const kern = C.emptyData(); anwenden(kern);
  const alt = C.emptyData(); alt.life = { la: { id: 'la', name: 'Gesundheit & Körper', ratings: [{ d: '2026-10-01', v: 6 }], order: 0 } };
  const { merged } = C.mergeData(kern, alt);
  anwenden(merged);
  const ges = Object.values(merged.life).filter(x => x && !x.deleted && x.saeule === 'gesundheit');
  pruefe('Umzug: alter Bereich übernimmt die Säule, leere Vorbelegung geht', ges.length === 1 && ges[0].id === 'la' && merged.life.l_gesundheit.deleted === true);
  pruefe('Umzug: danach idempotent', anwenden(merged) === 0);
}

function einstTests() {
  const d = C.emptyData();
  d.meta.settings = { id: 'settings', v: { routinen: { ton: false } } };
  pruefe('Einstellung: global', C.einst(d, {}, 'routinen.ton') === false);
  pruefe('Einstellung: eigener Wert vor global', C.einst(d, { einst: { 'routinen.ton': true } }, 'routinen.ton') === true);
  pruefe('Einstellung: Standard ohne globale Änderung', C.einst(C.emptyData(), null, 'routinen.wachHalten') === true);
}

function entwurfTests() {
  const id = E.neueId();
  E.setzen({ id, titel: 'Testentwurf', text: 'Text', extra: '{}' });
  pruefe('Entwurf sofort im Gerät', E.holen(id).titel === 'Testentwurf' && E.alle().some(e => e.id === id));
  E.verwerfen(id);
  pruefe('verworfen, nicht weg', E.holen(id).zustand === 'verworfen' && E.alle({ zustand: 'verworfen' }).some(e => e.id === id));
  E.zurueckholen(id);
  pruefe('zurückgeholt', E.holen(id).zustand === 'offen');
  E.gespeichert(id, 'tk_x');
  E.setzen({ id, titel: 'nachträglich' });
  pruefe('gespeicherter Entwurf ändert sich nicht mehr', E.holen(id).titel === 'Testentwurf' && E.holen(id).zustand === 'gespeichert');
  const leer = E.neueId(); E.setzen({ id: leer, titel: '' }); E.verwerfen(leer);
  pruefe('leerer Entwurf verschwindet ganz', !E.holen(leer));
}

async function fensterRegelTests() {
  const s = sheet({ title: 'Test', body: '<input>' });
  s.back.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  s.back.click();
  pruefe('Dialog schließt nicht beim Klick daneben', !!topSheet() && topSheet() === s);
  closeAllSheets();
  pruefe('Dialog mit Eingaben bleibt beim Ansichtswechsel offen', topSheet() === s);
  s.close('test');
  const a = sheet({ title: 'Auswahl', body: '', auswahl: true });
  a.back.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  a.back.click();
  pruefe('Auswahl-Fenster schließt beim Klick daneben', topSheet() !== a);
  await new Promise(r => setTimeout(r, 300));
}

(async () => {
  try {
    await kryptoTests();
    migrationsTests();
    einstTests();
    entwurfTests();
    await fensterRegelTests();
    if (K) { await kreuzTests(); await mergeParitaet(); } else pruefe('Kern vorhanden (test.html unter 127.0.0.1 öffnen)', false);
  } catch (e) { pruefe('Testlauf ohne Ausnahme', false, e.stack || e.message); }
  document.getElementById('liste').innerHTML = liste.map(x => `<li class="${x.ok ? 't-ok' : 't-f'}">${x.ok ? '✓' : '✗'} ${x.name}${x.info && !x.ok ? ` – ${String(x.info).slice(0, 200)}` : ''}</li>`).join('');
  const z = document.getElementById('zusammenfassung');
  z.textContent = fehler ? `${ok} ok, ${fehler} Fehler` : `Alle ${ok} Prüfungen grün`;
  z.className = 'status-line ' + (fehler ? 'err' : 'ok');
  window.ZB_TEST_ERGEBNIS = { ok, fehler, liste };
})();
