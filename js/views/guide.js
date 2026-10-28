// Anleitung – was ein Vorgang ist und wie die Lebenszentrale zusammenspielt
import { icon } from '../ui.js';

const SECTIONS = [
  ['vorgang', 'Was ist ein Vorgang?', 'list'],
  ['ablauf', 'Der Ablauf', 'repeat'],
  ['status', 'Status & Ampel', 'ampel'],
  ['kalender', 'Timeboxing & Leerraum', 'calendar'],
  ['matrix', 'Matrix & Fokus', 'matrix'],
  ['leben', 'Gewohnheiten & Notizen', 'notes'],
  ['ziele', 'Ziele, Projekte, Lebensbereiche', 'flag'],
  ['beziehungen', 'Beziehungen & Klärungen', 'person'],
  ['mitteilungen', 'Mitteilungen & Push', 'bell'],
  ['daten', 'Archiv, Sync & Sicherung', 'cloud'],
  ['tasten', 'Tastenkürzel', 'bolt'],
];

export function render(route) {
  const sel = route.parts[0] || 'vorgang';
  return `<div class="page">
    <div class="page-head"><div class="grow"><h1>Anleitung</h1><div class="psub">So arbeitest du mit deiner Lebenszentrale.</div></div></div>
    <div class="set-grid">
      <nav class="set-nav" aria-label="Kapitel">${SECTIONS.map(([k, l, ic]) => `<a href="#/anleitung/${k}" data-sec="${k}" class="${sel === k ? 'on' : ''}">${icon(ic, 15)}${l}</a>`).join('')}</nav>
      <div class="card doc">
        <section id="g-vorgang" class="set-sec">
          <h2>Was ist ein Vorgang?</h2>
          <p>Ein <b>Vorgang</b> ist alles, was in deinem Leben offen ist und deine Aufmerksamkeit braucht – wie ein Ticket. Nicht nur Aufgaben, sondern auch Gespräche, Konflikte, Grenzen und Vorsätze. Jeder Vorgang hat eine Nummer, einen Status und einen Verlauf mit Datum.</p>
          <p>Es gibt drei Arten:</p>
          <ul>
            <li><b>Aufgabe</b> – etwas, das du erledigst. „Steuererklärung abgeben“, „Angebot an Kunde Müller“.</li>
            <li><b>Klärung</b> – ein Gespräch oder Konflikt mit einer Person. „Mit meiner Schwester den Streit vom Wochenende klären“, „Gehaltsgespräch führen“.</li>
            <li><b>Vorsatz</b> – etwas, worauf du achten willst. „Bei meiner Frau zuhören, statt Lösungen anzubieten“, „Nur eine Stunde Handyzeit am Tag“.</li>
          </ul>
          <div class="box">Faustregel: Wenn etwas länger als einen Moment in deinem Kopf herumgeht, mach einen Vorgang daraus. Dann ist es aus dem Kopf und an einem sicheren Ort.</div>
          <p>Im Vorgang findest du alles: Status, Bereich, Kategorie, Priorität, Frist, Dauer, Projekt, Ziel, beteiligte Personen, Unteraufgaben, Wiederholung und Erinnerungen. Unten im <b>Verlauf</b> schreibst du später Notizen dazu – jede bekommt automatisch Datum und Uhrzeit. So siehst du auch nach Monaten, was wann passiert ist.</p>
        </section>
        <section id="g-ablauf" class="set-sec">
          <h2>Der Ablauf</h2>
          <ol>
            <li><b>Inbox</b> – schreib alles rein, was dir einfällt. Nur Text und Priorität, sonst nichts. Die Inbox sortiert nach Priorität, nicht nach Datum.</li>
            <li><b>Einsortieren</b> – mach aus einem Eintrag einen Vorgang, einen Termin oder eine Notiz – oder entferne ihn.</li>
            <li><b>Planen</b> – lege Vorgänge im Kalender als Zeitblock ab (Timeboxing) oder ordne sie in der Matrix ein.</li>
            <li><b>Erledigen</b> – starte den Fokus direkt aus dem Vorgang, der Matrix oder dem Cockpit.</li>
            <li><b>Archiv</b> – erledigte und verworfene Vorgänge verschwinden aus allen Übersichten und liegen sauber sortiert im Archiv.</li>
          </ol>
          <p>Das <b>Cockpit</b> ist deine Startseite zum Arbeiten: was sofort zu tun ist, was heute ansteht, dein Tagesplan, die heutigen Gewohnheiten und Notizen zum Einprägen.</p>
        </section>
        <section id="g-status" class="set-sec">
          <h2>Status & Ampel</h2>
          <p>Der Status zeigt, wo ein Vorgang steht. Du kannst ihn jederzeit ändern – in der Liste direkt in der Spalte „Status“ oder im Vorgang selbst.</p>
          <ul>
            <li><b>Neu</b> – gerade angelegt.</li>
            <li><b>Geplant</b> – hat einen Zeitblock im Kalender (wird automatisch gesetzt).</li>
            <li><b>In Bearbeitung</b> – du bist dran (wird beim Start einer Fokuseinheit gesetzt).</li>
            <li><b>Wartet</b> – du wartest auf jemanden oder etwas.</li>
            <li><b>Erledigt</b> oder <b>Verworfen</b> – abgeschlossen, landet im Archiv.</li>
          </ul>
          <div class="box">Erledigen, Verwerfen und Löschen fragen immer nach und lassen sich erst nach 3 Sekunden bestätigen. So geht durch einen schnellen Fehlklick nichts verloren. Gelöschtes liegt außerdem 120 Tage im Papierkorb.</div>
          <p>Die <b>Ampel</b> zeigt die Frist: grün im Plan, gelb bald fällig, rot überfällig, blinkend rot im Alarm. Ab Rot wirst du wiederholt erinnert (Eskalation), bis du den Vorgang erledigst, verschiebst oder die Eskalation abschaltest.</p>
        </section>
        <section id="g-kalender" class="set-sec">
          <h2>Timeboxing & Leerraum</h2>
          <p>Der Kalender ist dein eigener – ohne Verbindung zu Google, aber genauso aufgebaut: Tag, 3 Tage, Woche, Monat und Terminliste. Ziehe im Raster, um einen Termin anzulegen; ziehe Termine, um sie zu verschieben, und am unteren Rand, um die Dauer zu ändern.</p>
          <p><b>Timeboxing:</b> Links unter „Zum Einplanen“ stehen alle offenen Vorgänge ohne Zeitblock. Ziehe sie in den Kalender – oder tippe auf ${icon('bolt', 12, 'inl')}, dann sucht Zeitblick die nächste freie Zeit. Ein Zeitblock ist mit seinem Vorgang verbunden: Abhaken im Kalender erledigt auch den Vorgang.</p>
          <p><b>Leerraum:</b> Unter jedem Tag zeigt ein feiner Balken, wie voll der Tag ist. Ab 80 % (einstellbar) wird er gelb und du bekommst einen Hinweis. Plane auch Freizeit als Zeitblock ein – aber lass bewusst Luft.</p>
          <p><b>Kategorien</b> legst du selbst an, mit eigener Farbe (auch als Hex-Code). Beim Anlegen bekommst du Vorschläge. Unter „Meine Kalender“ blendest du Kategorien ein und aus.</p>
        </section>
        <section id="g-matrix" class="set-sec">
          <h2>Matrix & Fokus</h2>
          <p>Die <b>Eisenhower-Matrix</b> sortiert nach wichtig und dringend. Ziehe Karten zwischen den Quadranten. Ein Vorgang wird automatisch dringend, wenn seine Frist näher als 48 Stunden ist.</p>
          <p>Bei Quadrant 1 „Sofort erledigen“ steht <b>Jetzt erledigen</b> – das startet sofort eine Fokuseinheit für genau diesen Vorgang.</p>
          <p>Im <b>Fokus</b> lädst du einen Kristall auf: Bleib dran, bis die Zeit um ist. Im strengen Modus zerbricht er, wenn du die App verlässt. Die Fokuszeit wird am Vorgang gespeichert.</p>
        </section>
        <section id="g-leben" class="set-sec">
          <h2>Gewohnheiten & Notizen</h2>
          <p>Unter <b>Gewohnheiten</b> findest du alles, was regelmäßig ist: einfache Gewohnheiten zum Abhaken, Routinen mit mehreren Schritten, Zähler („8 Gläser Wasser“) und Grenzen („höchstens 60 Min Handyzeit“). Darunter stehen deine wiederkehrenden Vorgänge mit Rhythmus und Serie.</p>
          <p>Unter <b>Notizen</b> hältst du Gedanken fest. Was du dir einprägen willst, bekommt einen <b>Lese-Rhythmus</b> – z. B. einmal täglich um 8 Uhr oder alle zwei Stunden von 8 bis 21 Uhr. Dann kommt eine Push-Nachricht; ein Tipp darauf öffnet die Notiz direkt im Lesemodus. „Gelesen“ zählt mit, bis das Tagesziel erreicht ist.</p>
        </section>
        <section id="g-ziele" class="set-sec">
          <h2>Ziele, Projekte, Lebensbereiche</h2>
          <p><b>Lebensbereiche</b> sind die großen Felder deines Lebens (Gesundheit, Partnerschaft, Unternehmen …). Du bewertest sie regelmäßig von 1 bis 10 und siehst dein Lebensrad. Jeder Bereich hat ein eigenes Dashboard.</p>
          <p><b>Ziele</b> beschreiben, wohin du willst – mit Fortschritt als Prozent, Zahl, Meilensteinen oder automatisch über verknüpfte Projekte und Vorgänge. <b>Projekte</b> bündeln mehrere Vorgänge und zeigen, was als Nächstes kommt.</p>
          <p>Zuordnung: Ein Vorgang gehört über seine Kategorie oder sein Projekt zu einem Lebensbereich. Ordne also Kategorien und Projekte einem Lebensbereich zu – dann erscheint alles automatisch am richtigen Ort.</p>
        </section>
        <section id="g-beziehungen" class="set-sec">
          <h2>Beziehungen & Klärungen</h2>
          <p>Jede wichtige Person bekommt eine Karte: Beziehung, Geburtstag, gewünschter Kontakt-Rhythmus und was dir an der Beziehung wichtig ist. Die Ampel zeigt, wann du dich mal wieder melden solltest. Auf der Karte siehst du alle offenen Klärungen und Vorsätze mit dieser Person und einen Verlauf deiner Kontakte und Notizen.</p>
        </section>
        <section id="g-mitteilungen" class="set-sec">
          <h2>Mitteilungen & Push</h2>
          <p>Die <b>Glocke</b> oben zeigt zuerst, was gerade Aufmerksamkeit braucht – Überfälliges, zu lange liegende Inbox-Einträge, Notizen zum Einprägen, offene Gewohnheiten und Klärungen. Darunter stehen deine Erinnerungen. Sie bleiben, bis du sie entfernst oder die Sache erledigt ist.</p>
          <p>Push auf Handy und Laptop läuft über ntfy (Einstellungen → Benachrichtigungen). Jede Nachricht hat einen Link, der direkt an die richtige Stelle springt. Ist etwas erledigt, verschwindet die Nachricht auch vom Handy.</p>
        </section>
        <section id="g-daten" class="set-sec">
          <h2>Archiv, Sync & Sicherung</h2>
          <p>Alle Daten liegen zuerst auf deinem Gerät und werden über deinen privaten GitHub-Speicher zwischen allen Geräten abgeglichen. Jeden Tag entsteht automatisch eine lokale Sicherung; der Cloud-Speicher hat einen Versionsverlauf. Auf Wunsch schreibt Zeitblick alles zusätzlich als Markdown in deinen Obsidian-Ordner.</p>
        </section>
        <section id="g-tasten" class="set-sec">
          <h2>Tastenkürzel</h2>
          <ul>
            <li><span class="kbd">I</span> in die Inbox schreiben · <span class="kbd">N</span> neuer Vorgang · <span class="kbd">E</span> neuer Termin · <span class="kbd">F</span> Fokus</li>
            <li><span class="kbd">/</span> oder <span class="kbd">Strg</span>+<span class="kbd">K</span> suchen</li>
            <li><span class="kbd">1</span>–<span class="kbd">9</span> Bereiche wechseln (Cockpit, Inbox, Vorgänge, Kalender, Matrix, Fokus, Gewohnheiten, Notizen, Ziele)</li>
            <li>Im Kalender: <span class="kbd">T</span> heute, <span class="kbd">D</span>/<span class="kbd">X</span>/<span class="kbd">W</span>/<span class="kbd">M</span>/<span class="kbd">A</span> Ansicht, <span class="kbd">J</span>/<span class="kbd">K</span> blättern</li>
          </ul>
        </section>
      </div>
    </div>
  </div>`;
}

export function mount(root, ctx, route) {
  const sel = route.parts[0];
  if (sel) { const el = root.querySelector('#g-' + sel); if (el) setTimeout(() => el.scrollIntoView({ block: 'start', behavior: 'instant' }), 30); }
}
