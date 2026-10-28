# Zeitblick 2 – deine Lebenszentrale

Zeitblick ist eine installierbare Web-App (PWA) für Handy und Laptop, mit der du dein ganzes Leben organisierst, planst und steuerst:

- **Vorgänge** statt nur Aufgaben: Aufgaben, Klärungen (z. B. ein offenes Gespräch) und Vorsätze („darauf achten, …“). Jeder Vorgang hat Nummer, Status (Neu, Geplant, In Bearbeitung, Wartet, Erledigt, Verworfen) und einen Verlauf, in dem jede Notiz automatisch datiert wird.
- **Vorgangs-Index** wie ein Ticketsystem: Titel, kurze Info, Kategorie, Erstellt, Fällig, Ampel, Priorität, Status – sortierbar, Status direkt änderbar, Filter hinter einem Filter-Symbol.
- **Erledigen und Löschen nur mit Rückfrage und 3-Sekunden-Sperre.** Abgeschlossenes wandert ins **Archiv** (nach Privat/Geschäftlich, Kategorie und Datum), Gelöschtes 120 Tage in den **Papierkorb**.
- **Cockpit** als ruhige Startseite zum Arbeiten, **Inbox** nur mit Text und Priorität (sortiert nach Priorität, Ampel nach Liegezeit).
- **Eigener Kalender im Google-Kalender-Stil** mit **Timeboxing**: Vorgänge in den Kalender ziehen oder per Blitz in die nächste freie Zeit legen, Auslastungsbalken je Tag, damit Leerraum bleibt. Eigene Kategorien mit Farben (auch Hex-Code), am Anfang leer, mit Vorschlägen.
- **Eisenhower-Matrix** mit Drag & Drop; Quadrant 1 hat **Jetzt erledigen** und startet direkt den **Fokus** (wie Forest, mit Kristall statt Baum).
- **Gewohnheiten & Routinen**: Gewohnheiten, Routinen mit Schritten, Zähler und Grenzen (z. B. höchstens 60 Min Handyzeit), dazu alle wiederkehrenden Vorgänge.
- **Notizen zum Einprägen** mit Lese-Rhythmus (z. B. 1× täglich oder alle 2 Stunden) und Push mit Deep Link direkt in den Lesemodus.
- **Ziele & Entwicklung** mit Fortschritt, **Projekte** mit mehreren Vorgängen, **Lebensbereiche** mit Lebensrad und eigenem Dashboard, **Beziehungen & Klärungen** mit einer Karte je Person.
- **Mitteilungen** (Glocke): zuerst, was Aufmerksamkeit braucht, darunter Erinnerungen, die bleiben, bis du sie entfernst.
- **Ampel-Eskalation** mit wiederholten Push-Nachrichten und rotem Alarm-Fenster.
- **Sync** über alle Geräte, **Backups** lokal + Cloud, **Ablage in Obsidian**.
- Hell, Dunkel und **Nachtmodus mit Rotlicht**. Eine **Anleitung** ist in der App eingebaut.

Alles läuft kostenlos: GitHub (Hosting, Sync, Server-Erinnerungen) und ntfy (Push).

---

## Update von Version 1

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

- **I** in die Inbox schreiben, **N** neuer Vorgang, **E** neuer Termin, **F** Fokus, **/** oder **Strg+K** Suche
- **1–9**: Cockpit, Inbox, Vorgänge, Kalender, Matrix, Fokus, Gewohnheiten, Notizen, Ziele
- Kalender: **T** heute, **D/X/W/M/A** Ansicht, **J/K** blättern
- Handy: der runde **+**-Knopf schreibt in die Inbox, „Mehr“ unten rechts öffnet alle Bereiche

Ausführlich: in der App unter **Anleitung**.

## Updates

Neue Dateien einfach wieder ins Repository hochladen (bestehende ersetzen). Zeitblick meldet sich dann mit „Neue Version ist bereit“.

## Technik

Reines HTML/CSS/JavaScript ohne Build-Schritt. Daten liegen zuerst lokal (IndexedDB) und werden pro Datensatz zusammengeführt (neuere Änderung gewinnt), sodass Handy und Laptop auch offline weiterarbeiten können.
