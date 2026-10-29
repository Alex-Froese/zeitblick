# Zeitblick 3 – deine Lebenszentrale

Zeitblick ist eine installierbare Web-App (PWA) für Handy und Laptop – dein Kontrollzentrum für das ganze Leben, privat und geschäftlich:

- **Heute** – die eine verbindliche Tagesansicht: Tagesring über alles (Vorgänge, Mehrmals täglich, Routinen, Gewohnheiten, Einprägen, Rückblick), Jetzt & Nächstes mit Themenblock-Vorschlägen, Tagesplan, Von gestern offen. Blöcke frei anordnen.
- **Kalender** im Google-Stil: Woche 0–24 Uhr auf einen Blick („Alles sichtbar“, Nacht gestaucht), Vollbild mit **V**, saubere Darstellung kurzer und überlappender Blöcke, Timeboxing.
- **Vorlagen**: Tages- und Wochenvorlagen (Beispiele: A-Woche, B-Woche, Ferienwoche, Ausbildungstag, Schultag, Freier Tag, Wochenende), aus einer Woche speichern, mit Vorschau ergänzen oder ersetzen, **Woche kopieren**, **A/B-Wochen** und **Ferien** als Regel. Nichts wird von selbst eingetragen.
- **Themenblöcke** als Hintergrundfläche mit passenden Vorgängen; Kalenderblöcke mit **Routinen und Gewohnheiten verknüpft** (ein Klick startet die Routine).
- **Vorgänge** wie Tickets: gespeicherte **Ansichten als Reiter**, **Liste | Matrix | Kanban**, Matrix mit Handlung je Quadrant (Fokus, Einplanen, Delegieren, Eliminieren), **Mehrmals täglich** (Intervall oder feste Zeiten).
- **Verknüpfungs-Netz**: Vorgänge, Notizen, Personen, Projekte, Ziele, Lebensbereiche, Gewohnheiten und Termine – in beide Richtungen.
- **Notizen** mit Clean-Editor (Rest hinter „Mehr“), Typen Notiz/Journal/Wissen/Reflexion/Idee, **Notiz oder Textstelle → Vorgang**, tägliches **Journal**.
- **Routine-Player** im Vollbild: Timer je Schritt, Ring, Gesamtzeit, Text/Bild/Link je Schritt; Historie mit Heatmap und Durchschnittsdauer.
- **Lebensbereiche als Säulen** mit Lebensrad und eigenem Raum (Notizen, persönliche Projekte, Vorgänge, Gewohnheiten, Ziele).
- **Rückblicke**: geführter Tagesabschluss (~10 Min, 21:00), Wochenrückblick (So 18:00), Monatsrückblick – mit Archiv. **Verlauf** über alles mit Filtern.
- **Glocke** mit Tageszeitachse, **Benachrichtigungs-Zentrale** mit Arten, Ruhezeiten und Vorschau, Push über ntfy.
- **Oberflächengröße** und **Dichte** je Gerät, Navigation sortier- und ausblendbar, **alle Tastenkürzel frei belegbar** (Strg+K für alles), einheitliche **Countdown-Bestätigungen**.
- Inbox, Fokus mit Kristall, Ziele, Projekte, Beziehungen, Archiv & Papierkorb, Sync, Backups, Obsidian-Ablage (inkl. Journal und Rückblicken), Hell/Dunkel/Nacht-Rotlicht.
- **Bauplan und Versionsverlauf** in der App (Einstellungen → Info & Bauplan), eigenes Regelwerk unter **Anleitung → Mein System**.

Alles läuft kostenlos: GitHub (Hosting, Sync, Server-Erinnerungen) und ntfy (Push).

---

## Update von Version 2

Alle Dateien im Repository ersetzen (siehe „Updates“). Beim ersten Start übernimmt Zeitblick deine Daten vollständig und ergänzt einmalig:

- **Beispiel-Vorlagen** (A-Woche, B-Woche, Ferienwoche und vier Tagesvorlagen) – frei anpass- oder löschbar. Im Kalender wird nichts eingetragen.
- **Regeln**: A/B-Wochen sind vorbereitet, aber aus. Unter Kalender → Vorlagen & Regeln „Diese Woche ist A-Woche“ wählen und einschalten. Die Schulferien Baden-Württemberg sind als Vorschlag eingetragen – bitte mit der Schule abgleichen.
- **Ansichten** für Vorgänge (Bis heute, Überfällig, Business, Wartet, Klärungen).
- Startseite „Cockpit“ wird zu **Heute**, die Matrix ist jetzt eine Ansicht in **Vorgänge**.
- Damit verknüpfte Vorlagen-Blöcke deine Routinen finden, heißen sie „Morgenroutine“ und „Abendroutine“ – lege Routinen mit genau diesen Namen an oder verknüpfe die Blöcke im Vorlagen-Editor.

## Update von Version 1 (ältere Installationen)

Einfach alle Dateien im Repository ersetzen (siehe „Updates“ unten). Beim ersten Start übernimmt Zeitblick deine Daten automatisch:

- Aufgaben werden zu Vorgängen mit Status („Neu“ bzw. „Erledigt“), Erledigtes landet im Archiv.
- Standard-Kategorien aus Version 1, die du nie benutzt hast, werden entfernt. Benutzte bleiben mit ihrer Farbe.
- Die Verbindung zu Google Kalender gibt es nicht mehr – der Kalender ist jetzt dein eigener. Das Secret `ZB_GOOGLE_ICS` kannst du löschen.

## 1. Online stellen (einmalig, ca. 10 Minuten)

1. Kostenlosen Account auf [github.com](https://github.com/signup) anlegen (falls noch keiner da ist).
2. Oben rechts **+ → New repository**: Name `zeitblick`, Sichtbarkeit **Public**, **Create repository**.
3. Auf der leeren Repo-Seite **uploading an existing file** wählen und den **Inhalt** dieses Ordners hineinziehen (alle Dateien und Ordner, auch `.github`). Unten **Commit changes**.
   - Hinweis: Falls der Upload den Ordner `.github` auslässt, lege die Datei `.github/workflows/zeitblick.yml` über **Add file → Create new file** an und kopiere den Inhalt hinein.
4. Im Repo **Settings → Pages**: bei *Branch* `main` und `/ (root)` wählen, **Save**.
5. Nach ein bis zwei Minuten läuft die App unter `https://DEIN-NAME.github.io/zeitblick/`.

## 2. Am Laptop einrichten

1. Adresse in **Chrome oder Edge** öffnen.
2. Rechts in der Adressleiste auf **Installieren** klicken – Zeitblick startet ab jetzt wie ein eigenes Programm.
3. **Einstellungen → Einrichtung** öffnen und die Schritte abhaken.
4. **Einstellungen → Kategorien & Lebensbereiche**: lege deine Kategorien und Lebensbereiche an (mit Vorschlägen).

## 3. Sync zwischen allen Geräten

1. [Token erstellen](https://github.com/settings/tokens/new?scopes=gist&description=Zeitblick): Haken bei **gist** ist gesetzt, Ablauf **No expiration**, unten **Generate token**, Token kopieren.
2. In Zeitblick **Einstellungen → Sync & Cloud** einfügen und **Verbinden**.
3. Zeitblick legt einen privaten Gist an. Jede Änderung wird dort als Version gespeichert (Cloud-Backup mit Verlauf).

## 4. Handy verbinden

1. Am Laptop **Einstellungen → Sync & Cloud → Weiteres Gerät verbinden**.
2. Den QR-Code mit der Handy-Kamera scannen, im Browser **Verbinden** tippen.
3. Im Browser-Menü **Zum Startbildschirm hinzufügen** bzw. **App installieren**.

## 5. Push aufs Handy (bleibt, bis du sie wegwischst)

1. App **ntfy** aus dem Play Store oder App Store installieren.
2. In Zeitblick **Einstellungen → Benachrichtigungen → Handy-Push aktiv** einschalten.
3. In ntfy auf **+** tippen und den angezeigten Kanal abonnieren (oder QR-Code scannen).
4. **Test-Push senden** drücken.
5. Für Alarm-Vorgänge in den ntfy-Einstellungen **„Bei höchster Priorität dauerhaft alarmieren“** (engl. *Keep alerting for highest priority*) einschalten.

Push gibt es für: fällige und überfällige Vorgänge (mit Eskalation), Termine, Notizen zum Einprägen, Gewohnheiten mit Uhrzeit, zu lange liegende Inbox-Einträge und Geburtstage. Jede Nachricht öffnet per Tipp direkt die richtige Stelle. Ist etwas erledigt oder gelesen, verschwindet die Nachricht wieder vom Handy.

**Laptop:** Erinnerungen erscheinen als Systembenachrichtigung und bleiben stehen, solange Zeitblick geöffnet ist. Wer sie auch bei geschlossener App möchte: [ntfy.sh/app](https://ntfy.sh/app) im Browser öffnen, denselben Kanal abonnieren und Benachrichtigungen erlauben.

## 6. Obsidian

**Einstellungen → Obsidian → Vault-Ordner wählen** (am Laptop in Chrome/Edge). Zeitblick legt darin den Ordner `Zeitblick` an:

| Datei/Ordner | Inhalt |
|---|---|
| `Zeitblick Übersicht.md` | Ampel, Überfälliges, Heute, Matrix, Termine, Fokus |
| `Vorgänge/` | eine Datei pro offenem Vorgang mit Eigenschaften für Dataview und dem datierten Verlauf |
| `Archiv/2026/` | abgeschlossene Vorgänge je Jahr |
| `Notizen/`, `Ziele/`, `Projekte/`, `Personen/` | je eine Datei, untereinander verlinkt |
| `Gewohnheiten.md`, `Lebensbereiche.md`, `Inbox.md` | Übersichten |
| `Kalender/`, `Fokus/`, `Tage/` | Termine je Monat, Fokus-Log, Tagesnotizen |
| `Daten/zeitblick-daten.json` | kompletter Datenstand |
| `Backups/` | tägliche Sicherung (30 Tage) |

Beispiel für Dataview:

```dataview
TABLE status, faellig, ampel, kategorie FROM "Zeitblick/Vorgänge" WHERE bereich = "Geschäftlich" SORT faellig ASC
```

Nach einem Browser-Neustart fragt Chrome einmal nach dem Zugriff – in Zeitblick erscheint dann **Zugriff erlauben**.

## 7. Server-Erinnerungen (optional, empfohlen)

Damit Erinnerungen auch nach mehreren Tagen ohne geöffnete App kommen, läuft stündlich ein kostenloser Helfer (GitHub Action) in deinem Repository.

1. Im Repo **Settings → Secrets and variables → Actions → New repository secret**:
   - `ZB_GIST_TOKEN` = dein Token aus Schritt 3
   - `ZB_GIST_ID` = die Gist-ID (Zeitblick → Einstellungen → Sync & Cloud → Gist-ID kopieren)
2. Reiter **Variables → New repository variable**: `ZB_APP_URL` = `https://DEIN-NAME.github.io/zeitblick/`
3. Reiter **Actions** öffnen, Workflows erlauben, **Zeitblick Erinnerungen → Run workflow**.

## Datensicherung

Automatisch, ohne dass du etwas tun musst:

1. **Lokal**: täglicher Schnappschuss auf jedem Gerät (21 Tage, Einstellungen → Datensicherung).
2. **Cloud**: jede Änderung als Version im privaten Gist.
3. **Obsidian**: täglich eine Sicherungsdatei im Vault (30 Tage).

Zusätzlich jederzeit: **Sicherung herunterladen** / **Sicherung einspielen**.

## Bedienung

- **Strg+K** Suche und alle Befehle, **?** alle Tastenkürzel, **M** Mitteilungen
- **I** Inbox, **N** Vorgang, **E** Termin, **J** Journal, **Umschalt+N** Notiz, **Umschalt+R** Tagesabschluss, **F** Fokus
- Navigation mit Folgen: **G dann H** Heute, **G dann K** Kalender, **G dann V** Vorgänge … oder **1–9** für die Reihenfolge der Navigation
- Kalender: **T** heute, **J/K** blättern, **D/X/W** Tag/3 Tage/Woche, **V** Vollbild, **O** Vorlagen, **P** Woche planen, **C** Woche kopieren, **Z** Nacht stauchen
- Vorgänge: **L/X/K** Liste/Matrix/Kanban, **Umschalt+S** Ansicht speichern
- Alles änderbar unter Einstellungen → Tastenkürzel
- Handy: **+** antippen = Inbox, **lange drücken** = Schnellmenü; im Kalender wischen zum Blättern

Ausführlich: in der App unter **Anleitung**.

## Updates

Neue Dateien einfach wieder ins Repository hochladen (bestehende ersetzen). Zeitblick meldet sich dann mit „Neue Version ist bereit“.

## Technik

Reines HTML/CSS/JavaScript ohne Build-Schritt. Daten liegen zuerst lokal (IndexedDB) und werden pro Datensatz zusammengeführt (neuere Änderung gewinnt), sodass Handy und Laptop auch offline weiterarbeiten können.
