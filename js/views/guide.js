// Anleitung – „Mein System“ (eigenes Regelwerk, anpassbar mit Vorschlägen) und wie die Lebenszentrale zusammenspielt
import * as C from '../core.js';
import * as S from '../store.js';
import { esc, icon, toast, confirmDialog, makeSortable } from '../ui.js';
import { A } from '../app-api.js';

const SECTIONS = [
  ['system', 'Mein System', 'gem'],
  ['heute', 'Heute & Tagesring', 'home'],
  ['vorgang', 'Was ist ein Vorgang?', 'list'],
  ['ablauf', 'Der Ablauf', 'repeat'],
  ['status', 'Status & Ampel', 'ampel'],
  ['kalender', 'Kalender & Vorlagen', 'calendar'],
  ['matrix', 'Ansichten, Matrix & Kanban', 'matrix'],
  ['leben', 'Gewohnheiten, Routinen, Notizen', 'notes'],
  ['netz', 'Verknüpfungen', 'link'],
  ['ziele', 'Ziele, Projekte, Lebensbereiche', 'flag'],
  ['rueckblicke', 'Rückblicke & Verlauf', 'book'],
  ['beziehungen', 'Beziehungen & Klärungen', 'person'],
  ['mitteilungen', 'Mitteilungen & Push', 'bell'],
  ['daten', 'Archiv, Sync & Sicherung', 'cloud'],
  ['tasten', 'Tastenkürzel', 'bolt'],
];

export const SUGGESTIONS = [
  { t: 'Alles zuerst in die Inbox', b: 'Was mir durch den Kopf geht, schreibe ich sofort mit + in die Inbox – ohne nachzudenken. Einsortiert wird später, spätestens im Tagesabschluss.' },
  { t: 'Gewohnheit, Routine oder Vorgang?', b: 'Gewohnheit = kleine Sache zum Abhaken. Routine = Ablauf mit Schritten (Morgen, Abend). Vorgang = etwas mit Verlauf, das ich erledige. Wiederkehrende Kleinigkeiten werden Gewohnheiten.' },
  { t: 'Heute ist verbindlich', b: 'Was in „Heute“ steht, ist mein Tag. Die Glocke erinnert nur – entscheidend ist der Tagesring.' },
  { t: 'Morgens: Routine starten', b: 'Der Kalenderblock „Morgenroutine“ ist mit der Routine verknüpft. Ein Klick startet den Player – Schritt für Schritt, ohne Handy-Ablenkung.' },
  { t: 'Business-Block = Themenblock', b: 'Nach der Ausbildung (ab ca. 16:50) ist Zeit für Froese Fensterreinigung. Der Themenblock schlägt mir passende Vorgänge vor; Donnerstag ist Vertrieb.' },
  { t: 'Quadrant 2 jeden Tag', b: 'Mindestens ein wichtiger, nicht dringender Vorgang bekommt jeden Tag einen Kalenderblock (Matrix → Kalender-Symbol).' },
  { t: 'Tagesabschluss um 21:00', b: 'Zehn Minuten: Was lief, Offenes entscheiden, Journal, die drei wichtigsten Dinge für morgen.' },
  { t: 'Sonntag: Woche planen', b: 'Wochenrückblick um 18:00: Lebensbereiche bewerten, Ziele prüfen, nächste Woche aus der passenden Vorlage (A/B/Ferien) eintragen.' },
  { t: 'Notiz mit Handlung → Vorgang', b: 'Steckt in einer Notiz etwas zu tun, markiere ich die Stelle und mache mit „Vorgang“ daraus einen Vorgang. Wissen und Journal bleiben Notizen.' },
  { t: 'Verbinden statt suchen', b: 'Personen, Projekte, Notizen und Lebensbereiche verknüpfe ich mit den Vorgängen – dann finde ich alles von jeder Seite aus.' },
];

function myList() { return S.myGuide() || []; }

function systemHtml() {
  const list = myList();
  const have = new Set(list.map(x => x.t));
  const sug = SUGGESTIONS.filter(x => !have.has(x.t));
  return `<section id="g-system" class="set-sec">
    <div class="row"><h2 class="grow">Mein System</h2><button class="btn sm btn-primary" data-gnew>${icon('plus', 13)}Regel</button></div>
    <p>Hier steht, <b>wie du arbeitest</b> – deine eigenen Regeln. Schreib sie in deinen Worten, sortiere sie und passe sie an, wenn sich dein Leben ändert.</p>
    <div class="gs-list" data-glist>${list.map(x => `<div class="gs-i" data-sort-id="${x.id}"><span class="grip" data-grip>${icon('grip', 14)}</span><div class="grow"><input class="gs-t" data-gt="${x.id}" value="${esc(x.t)}" aria-label="Regel"><textarea class="gs-b" data-gb="${x.id}" rows="2" aria-label="Beschreibung">${esc(x.b || '')}</textarea></div><button class="icon-btn sm" data-gdel="${x.id}" aria-label="Entfernen">${icon('trash', 13)}</button></div>`).join('') || '<div class="box">Noch leer. Übernimm unten Vorschläge oder schreib deine erste Regel.</div>'}</div>
    ${sug.length ? `<div class="section-t">Vorschläge – passend zu deinem Alltag</div><div class="gs-sug">${sug.map(x => `<div class="gs-s"><div class="grow"><b>${esc(x.t)}</b><div class="small muted">${esc(x.b)}</div></div><button class="btn sm" data-gtake="${esc(x.t)}">${icon('plus', 12)}Übernehmen</button></div>`).join('')}</div>${sug.length > 1 ? '<button class="link-btn" data-gall style="margin-top:6px">Alle Vorschläge übernehmen</button>' : ''}` : ''}
  </section>`;
}

export function render(route) {
  const sel = route.parts[0] || 'system';
  return `<div class="page">
    <div class="page-head"><div class="grow"><h1>Anleitung</h1><div class="psub">Dein Regelwerk und wie die Lebenszentrale zusammenspielt.</div></div></div>
    <div class="set-grid">
      <nav class="set-nav" aria-label="Kapitel">${SECTIONS.map(([k, l, ic]) => `<a href="#/anleitung/${k}" data-sec="${k}" class="${sel === k ? 'on' : ''}">${icon(ic, 15)}${l}</a>`).join('')}</nav>
      <div class="card doc">
        ${systemHtml()}
        <section id="g-heute" class="set-sec">
          <h2>Heute & Tagesring</h2>
          <p><b>Heute</b> ist deine Startseite und die eine verbindliche Ansicht des Tages – unabhängig von der Glocke. Der <b>Tagesring</b> zeigt, wie viel von allem Verbindlichen erledigt ist: Vorgänge, Mehrmals-täglich, Routinen, Gewohnheiten, Notizen zum Einprägen und Rückblicke. Jede Farbe steht für eine Art.</p>
          <ul><li><b>Jetzt & Nächstes</b>: laufender Block, aktueller Themenblock mit Vorschlägen, nächster Termin.</li><li><b>Routinen</b> mit Start-Knopf öffnen den Routine-Player im Vollbild.</li><li><b>Gewohnheiten</b> hakst du mit einem Tipp ab – mit Rückgängig.</li><li><b>Von gestern offen</b> zeigt, was gestern liegen blieb: nichts verschwindet stillschweigend.</li></ul>
          <p>Mit „Anpassen“ ordnest du die Blöcke in zwei Spalten an und blendest aus, was du nicht brauchst.</p>
        </section>
        <section id="g-vorgang" class="set-sec">
          <h2>Was ist ein Vorgang?</h2>
          <p>Ein <b>Vorgang</b> ist alles, was offen ist und deine Aufmerksamkeit braucht – wie ein Ticket mit Nummer, Status und Verlauf. Drei Arten: <b>Aufgabe</b> (etwas erledigen), <b>Klärung</b> (Gespräch oder Konflikt mit einer Person), <b>Vorsatz</b> (worauf du achten willst).</p>
          <div class="box">Faustregel: Geht etwas länger als einen Moment im Kopf herum, wird es ein Vorgang. Kleine wiederkehrende Dinge werden Gewohnheiten.</div>
          <p>Im Vorgang: Status, Bereich, Kategorie, Priorität, Frist, Dauer, Projekt, Ziel, Personen, Unteraufgaben, Wiederholung, <b>Mehrmals täglich</b>, Erinnerungen und <b>Verbunden mit</b>. Im Verlauf bekommt jede Notiz Datum und Uhrzeit.</p>
        </section>
        <section id="g-ablauf" class="set-sec">
          <h2>Der Ablauf</h2>
          <ol>
            <li><b>Inbox</b> – alles rein, nur Text und Priorität.</li>
            <li><b>Einsortieren</b> – Vorgang, Termin oder Notiz – oder entfernen.</li>
            <li><b>Planen</b> – im Kalender als Zeitblock (Timeboxing), in Themenblöcken oder über die Matrix.</li>
            <li><b>Erledigen</b> – in „Heute“, im Fokus oder direkt in der Liste.</li>
            <li><b>Abschließen</b> – im Tagesabschluss entscheidest du über alles Offene.</li>
          </ol>
        </section>
        <section id="g-status" class="set-sec">
          <h2>Status & Ampel</h2>
          <p>Neu → Geplant → In Bearbeitung → Wartet → Erledigt oder Verworfen. „Geplant“ setzt der Kalender, „In Bearbeitung“ der Fokus, „Wartet“ das Delegieren.</p>
          <div class="box">Alles, was schließt, verwirft oder löscht, fragt nach und ist erst nach einem kurzen Countdown bestätigbar (Länge unter Einstellungen → Darstellung). Gewohnheiten und Routine-Schritte hakst du dagegen sofort ab – mit Rückgängig.</div>
          <p>Die <b>Ampel</b> zeigt die Frist: grün im Plan, gelb bald fällig, rot überfällig, Alarm bei langer Überfälligkeit.</p>
        </section>
        <section id="g-kalender" class="set-sec">
          <h2>Kalender & Vorlagen</h2>
          <p>Die Woche zeigt <b>0–24 Uhr auf einen Blick</b>: „Alles sichtbar“ passt die Stundenhöhe an den Bildschirm an, die Nacht wird gestaucht. <span class="kbd">V</span> schaltet den <b>Vollbildmodus</b> ohne Seitenleiste.</p>
          <p>Kurze Blöcke werden einzeilig mit Mindesthöhe gezeigt. Überschneiden sich Termine, bleibt der Hauptblock breit und der später beginnende liegt eingerückt darüber; gleichzeitig beginnende stehen nebeneinander.</p>
          <p><b>Vorlagen</b> (<span class="kbd">O</span>): Tages- und Wochenvorlagen, aus einer bestehenden Woche speichern, mit Vorschau anwenden – <b>ergänzen</b> oder <b>ersetzen</b>. Ersetzen entfernt nur Blöcke aus früheren Vorlagen oder Kopien; eigene Termine bleiben. <b>Woche kopieren</b> (<span class="kbd">C</span>) übernimmt eine frühere Woche.</p>
          <p><b>Regeln</b>: A/B-Wochen (z. B. Berufsschule montags jede zweite Woche) und Ferien. „Woche planen“ (<span class="kbd">P</span>) schlägt dann automatisch die richtige Vorlage vor. Nichts wird von selbst eingetragen.</p>
          <p><b>Themenblöcke</b> sind dezente Hintergrundflächen (z. B. Donnerstag Vertrieb). Ein Klick zeigt passende Vorgänge, die du direkt hineinplanst. <b>Verknüpfte Blöcke</b> starten mit einem Klick die Routine oder haken die Gewohnheit ab.</p>
        </section>
        <section id="g-matrix" class="set-sec">
          <h2>Ansichten, Matrix & Kanban</h2>
          <p>In den Vorgängen speicherst du Filter und Sortierung als <b>Ansicht</b> – sie erscheinen als Reiter oben. Umschalten zwischen <b>Liste</b>, <b>Matrix</b> und <b>Kanban</b>.</p>
          <ul><li><b>Q1 Sofort</b> → Fokus starten.</li><li><b>Q2 Planen</b> → Kalenderblock vorschlagen lassen.</li><li><b>Q3 Delegieren</b> → an eine Person abgeben, Status „Wartet“.</li><li><b>Q4 Eliminieren</b> → verwerfen (mit Countdown, landet im Archiv).</li></ul>
          <p>Im Kanban ziehst du Vorgänge zwischen den Status-Spalten.</p>
        </section>
        <section id="g-leben" class="set-sec">
          <h2>Gewohnheiten, Routinen, Notizen</h2>
          <p><b>Routinen</b> haben Schritte mit Minuten, Text, Bild und Link. „Starten“ öffnet den <b>Routine-Player</b>: Timer je Schritt, Fortschrittsring, Gesamtzeit. Die Historie zeigt Heatmap, Serien, Quote und Durchschnittsdauer.</p>
          <p><b>Notizen</b> haben Typen: Notiz, Journal, Wissen, Reflexion, Idee. Der Editor zeigt nur Titel und Text – alles andere liegt hinter „Mehr“. Markiere eine Textstelle und tippe „Vorgang“: daraus wird ein Vorgang, der weiß, woher er kommt. Das <b>Journal</b> hat eine eigene Tagesansicht; der Tagesabschluss schreibt hinein.</p>
          <p><b>Mehrmals täglich</b> gibt es für Vorgänge (z. B. alle 2 Stunden): jedes Mal abhaken oder nur erinnern und einmal abhaken.</p>
        </section>
        <section id="g-netz" class="set-sec">
          <h2>Verknüpfungen</h2>
          <p>Fast alles lässt sich verbinden: Vorgänge, Notizen, Personen, Projekte, Ziele, Lebensbereiche, Gewohnheiten und Termine. Eine Verknüpfung wirkt in beide Richtungen – im Panel „Verbunden mit“ siehst du auch, was auf den Eintrag verweist.</p>
        </section>
        <section id="g-ziele" class="set-sec">
          <h2>Ziele, Projekte, Lebensbereiche</h2>
          <p><b>Lebensbereiche</b> sind die Säulen deines Lebens. Oben siehst du alle Säulen mit Bewertung, darunter Lebensrad und Verlauf. Jeder Bereich hat einen eigenen <b>Raum</b>: Notizen direkt im Bereich, persönliche Projekte als Fenster, Vorgänge, Gewohnheiten, Ziele.</p>
          <p><b>Projekte</b> zeigen zuerst nur Titel, Fortschritt und nächsten Schritt. <b>Ziele</b> geben die Richtung.</p>
        </section>
        <section id="g-rueckblicke" class="set-sec">
          <h2>Rückblicke & Verlauf</h2>
          <p><b>Tagesabschluss</b> (Vorschlag 21:00, ca. 10 Min): Wie war der Tag, Offenes entscheiden, Gewohnheiten nachtragen, Journal, die drei wichtigsten Dinge für morgen. <b>Wochenrückblick</b> (Sonntag 18:00): Zahlen, Erfolge, Lebensbereiche bewerten, Ziele, nächste Woche planen. <b>Monatsrückblick</b> am Monatsende. Alles landet im Archiv unter Rückblicke.</p>
          <p>Der <b>Verlauf</b> zeigt alles, was passiert ist, an einem Ort – filterbar nach Zeitraum, Art, Kategorie, Lebensbereich und Person.</p>
        </section>
        <section id="g-beziehungen" class="set-sec">
          <h2>Beziehungen & Klärungen</h2>
          <p>Jede wichtige Person hat eine Karte mit Rhythmus, Geburtstag, offenen Klärungen, <b>Notizen zur Person</b> und einem Verlauf deiner Kontakte.</p>
        </section>
        <section id="g-mitteilungen" class="set-sec">
          <h2>Mitteilungen & Push</h2>
          <p>Die <b>Glocke</b> zeigt oben den Tagesring, darunter was Aufmerksamkeit braucht, die Zeitachse „Heute noch“ und deine Erinnerungen mit Direktaktionen. In den Einstellungen schaltest du jede Art einzeln an oder aus und legst <b>Ruhezeiten</b> fest (z. B. Ausbildung, abends zu zweit, Nacht) – mit Vorschau.</p>
        </section>
        <section id="g-daten" class="set-sec">
          <h2>Archiv, Sync & Sicherung</h2>
          <p>Alle Daten liegen zuerst auf deinem Gerät und werden über deinen privaten GitHub-Speicher abgeglichen. Täglich entsteht eine lokale Sicherung, auf Wunsch schreibt Zeitblick alles als Markdown in deinen Obsidian-Ordner – inklusive Journal und Rückblicken.</p>
        </section>
        <section id="g-tasten" class="set-sec">
          <h2>Tastenkürzel</h2>
          <p><span class="kbd">Strg</span>+<span class="kbd">K</span> öffnet Suche und Befehle, <span class="kbd">?</span> zeigt alle Kürzel. Navigation mit Folgen: <span class="kbd">G</span> dann <span class="kbd">H</span> (Heute), <span class="kbd">G</span> dann <span class="kbd">K</span> (Kalender) … Alles ist frei belegbar unter <a href="#/einstellungen/tastenkuerzel">Einstellungen → Tastenkürzel</a>.</p>
        </section>
      </div>
    </div>
  </div>`;
}

export function mount(root, ctx, route) {
  const sel = route.parts[0];
  if (sel && sel !== 'system' && !mount._keep) { const el = root.querySelector('#g-' + sel); if (el) setTimeout(() => el.scrollIntoView({ block: 'start', behavior: 'instant' }), 30); }
  mount._keep = false;
  const save = (list) => { mount._keep = true; S.setMyGuide(list); };
  const box = root.querySelector('[data-glist]');
  if (box) makeSortable(box, { handle: '[data-grip]', signal: ctx.signal, onDrop: ids => { const by = Object.fromEntries(myList().map(x => [x.id, x])); save(ids.map(id => by[id]).filter(Boolean)); } });
  root.addEventListener('change', e => {
    const t = e.target.closest('[data-gt]'), b = e.target.closest('[data-gb]');
    if (t) save(myList().map(x => x.id === t.dataset.gt ? { ...x, t: t.value.trim() || x.t } : x));
    if (b) save(myList().map(x => x.id === b.dataset.gb ? { ...x, b: b.value } : x));
  }, { signal: ctx.signal });
  root.addEventListener('click', async e => {
    if (e.target.closest('[data-gnew]')) { save([...myList(), { id: C.uid('g', 5), t: 'Neue Regel', b: '' }]); setTimeout(() => { const ins = document.querySelectorAll('[data-gt]'); const last = ins[ins.length - 1]; if (last) { last.focus(); last.select(); } }, 60); return; }
    const tk = e.target.closest('[data-gtake]');
    if (tk) { const x = SUGGESTIONS.find(s0 => s0.t === tk.dataset.gtake); if (x) { save([...myList(), { id: C.uid('g', 5), ...x }]); toast('Übernommen – passe den Text an, wie er für dich stimmt', { ms: 2200 }); } return; }
    if (e.target.closest('[data-gall]')) { const have = new Set(myList().map(x => x.t)); save([...myList(), ...SUGGESTIONS.filter(x => !have.has(x.t)).map(x => ({ id: C.uid('g', 5), ...x }))]); return; }
    const d = e.target.closest('[data-gdel]');
    if (d) { const x = myList().find(y => y.id === d.dataset.gdel); if (x && await confirmDialog(`Regel „${esc(x.t)}“ entfernen?`, { ok: 'Entfernen', danger: true, title: 'Regel entfernen?', cooldown: 3 })) { const prev = myList(); save(prev.filter(y => y.id !== x.id)); toast('Entfernt', { action: 'Rückgängig', onAction: () => S.setMyGuide(prev) }); } }
  }, { signal: ctx.signal });
  void A;
}
