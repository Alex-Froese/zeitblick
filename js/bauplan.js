// Bauplan und Versionsverlauf – im Programm (Einstellungen → Info), je Version aktualisiert
export const VERSIONS = [
  {
    v: '3.0.0', date: '2026-10-29', title: 'Lebenszentrale mit Nervensystem',
    items: [
      'Heute ersetzt das Cockpit: Tagesring, Jetzt & Nächstes, Tagesplan, Routinen mit Start-Knopf, Gewohnheiten, Vorgänge, Einprägen, Von gestern offen, Rückblick – Blöcke frei anordnen',
      'Ein Tages-Motor für alles Verbindliche: Heute, Glocke, Rückblick und Erinnerungen zeigen dasselbe',
      'Kalender neu: Woche 0–24 Uhr auf einen Blick, Vollbild, Nacht stauchen, bessere Darstellung kurzer und überlappender Blöcke',
      'Vorlagen für Tage und Wochen, A/B-Wochen, Ferienregel, Woche kopieren, Woche planen mit Vorschau (ergänzen oder ersetzen)',
      'Themenblöcke als Hintergrundfläche mit passenden Vorgängen; Kalenderblöcke mit Routinen und Gewohnheiten verknüpfbar',
      'Vorgänge: gespeicherte Ansichten als Reiter, Liste | Matrix | Kanban, Matrix mit Handlung je Quadrant (Fokus, Einplanen, Delegieren, Eliminieren)',
      'Mehrmals täglich: stündlich oder zu festen Zeiten, jedes Mal abhaken oder nur erinnern',
      'Verknüpfungs-Netz: Vorgänge, Notizen, Personen, Projekte, Ziele, Lebensbereiche, Gewohnheiten und Termine verbinden sich in beide Richtungen',
      'Notizen: Clean-Editor mit „Mehr“, Notiztypen (Notiz, Journal, Wissen, Reflexion, Idee), Notiz oder Textstelle → Vorgang, tägliches Journal',
      'Routine-Player im Vollbild: Timer je Schritt, Ring, Gesamtzeit, Farben, Text/Bild/Link je Schritt; Historie mit Heatmap und Durchschnittsdauer',
      'Lebensbereiche als Säulen mit eigenem Raum (Notizen, persönliche Projekte, Vorgänge, Gewohnheiten, Ziele)',
      'Rückblicke: geführter Tagesabschluss (~10 Min, 21:00), Wochenrückblick (So 18:00), Monatsrückblick – mit Archiv',
      'Zentraler Verlauf über alles mit Filtern; neue Glocke mit Tageszeitachse; Benachrichtigungs-Zentrale mit Ruhezeiten und Vorschau',
      'Oberflächengröße und Dichte einstellbar, Navigation sortier- und ausblendbar, alle Tastenkürzel frei belegbar, einheitliche Countdown-Bestätigungen',
    ],
  },
  {
    v: '2.0.0', date: '2026-10-27', title: 'Vorgänge, Inbox und Lebensbereiche',
    items: ['Vorgänge mit Status, Verlauf und Ticketnummer', 'Inbox mit Ampel', 'Gewohnheiten, Routinen, Grenzen, Zähler', 'Notizen zum Einprägen mit Push', 'Ziele, Projekte, Beziehungen, Lebensbereiche mit Lebensrad', 'Archiv und Papierkorb', 'Obsidian-Ablage, Sync über GitHub, ntfy-Push'],
  },
  {
    v: '1.0.0', date: '2026-10-25', title: 'Zeitblick – Kalender, Matrix, Fokus',
    items: ['Kalender im Stil von Google mit Timeboxing', 'Eisenhower-Matrix mit Drag & Drop', 'Fokus-Timer mit Kristall', 'Ampel und Eskalation', 'Offline-fähige App (PWA)'],
  },
];

export const PLAN = [
  { name: 'Fundament', status: 'fertig', text: 'Größe, Dichte, Navigation, Tastenkürzel-Zentrale, Befehlspalette, Countdown-Bestätigungen' },
  { name: 'Heute', status: 'fertig', text: 'Die eine verbindliche Tagesansicht, unabhängig von der Glocke' },
  { name: 'Kalender & Vorlagen', status: 'fertig', text: '7 Tage, 0–24 Uhr, Vollbild, Vorlagen, A/B-Wochen, Ferien, Themenblöcke, Verknüpfungen' },
  { name: 'Vorgänge', status: 'fertig', text: 'Ansichten als Reiter, Liste/Matrix/Kanban, Mehrmals täglich, Verknüpfungen' },
  { name: 'Notizen & Journal', status: 'fertig', text: 'Clean-Editor, Typen, Notiz → Vorgang, Journal' },
  { name: 'Gewohnheiten & Routinen', status: 'fertig', text: 'Routine-Player, Historie, Kalender-Verknüpfung' },
  { name: 'Lebensbereiche', status: 'fertig', text: 'Säulen, Lebensrad, eigener Raum je Bereich' },
  { name: 'Rückblicke, Verlauf, Glocke', status: 'fertig', text: 'Geführte Rückblicke mit Archiv, zentraler Verlauf, Benachrichtigungs-Zentrale' },
  { name: 'Einstellungen & Anleitung', status: 'fertig', text: 'Startseite je Gerät, „Mein System“, Bauplan und Versionen im Programm' },
  { name: 'Wissensdatenbank', status: 'später', text: 'Eigenes System für bis zu ~10.000 Notizen (Obsidian, Papier, Redmi) – Schnittstelle offen' },
  { name: 'Launcher', status: 'später', text: 'Zeitblick als Teil eines eigenen Launchers' },
  { name: 'ERP Froese Fensterreinigung', status: 'später', text: 'Live-Schnittstelle für geschäftliche Vorgänge und Kalender; Kunden und Angebote bleiben im ERP' },
  { name: 'Mehrbenutzer', status: 'später', text: 'Geteilte Bereiche, z. B. mit Partnerin oder Aushilfe' },
  { name: 'Eigener Server (NAS/PC)', status: 'später', text: 'App-Sperre, Verschlüsselung, große Dateien (Audio/Video)' },
];
