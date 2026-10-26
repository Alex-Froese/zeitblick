# Zeitblick – dein System für Kalender, Aufgaben und Fokus

Zeitblick ist eine installierbare Web-App (PWA) für Handy und Laptop:

- **Kalender** im Stil von Google Kalender: Tag, 3 Tage, Woche, Monat, Terminliste, Termine aufziehen, verschieben, in der Länge ändern, Serientermine
- **Eisenhower-Matrix** mit Drag & Drop (Maus und Touch), automatischer Dringlichkeit und „Jetzt erledigen“-Knopf, der direkt den Fokus startet
- **To-do-Liste** mit Schnelleingabe in normaler Sprache („Angebot morgen 15 Uhr #vertrieb !1“), Unteraufgaben, Wiederholungen und Wischgesten
- **Fokus** im Stil von Forest, ohne Bäume: ein lebendiger Fokus-Kern lädt sich auf, Kristall-Sammlung, strenger Modus, Stoppuhr, Hintergrundklänge
- **Privat / Alles / Geschäftlich** oben umschalten, Dashboards für alles, je Bereich und je Kategorie
- **Ampel-Tickets** mit Eskalation: Grün → Gelb → Rot → Alarm, wiederholte Push-Nachrichten, rotes Alarm-Fenster
- **Benachrichtigungen**, die bleiben, bis du sie wegwischst, mit Deep Link direkt zur Aufgabe
- **Sync** über alle Geräte, **Backups** lokal + Cloud, **Ablage in Obsidian**
- Hell, Dunkel und **Nachtmodus mit Rotlicht**

Alles läuft kostenlos: GitHub (Hosting, Sync, Server-Erinnerungen) und ntfy (Push).

---

## 1. Online stellen (einmalig, ca. 10 Minuten)

1. Kostenlosen Account auf [github.com](https://github.com/signup) anlegen (falls noch keiner da ist).
2. Oben rechts **+ → New repository**: Name `zeitblick`, Sichtbarkeit **Public**, **Create repository**.
3. Auf der leeren Repo-Seite **uploading an existing file** wählen und den **Inhalt** dieses Ordners hineinziehen (alle Dateien und Ordner, auch `.github`). Unten **Commit changes**.
   - Hinweis: Unter Windows ist der Ordner `.github` sichtbar. Falls der Upload ihn auslässt, lege die Datei `.github/workflows/zeitblick.yml` über **Add file → Create new file** an und kopiere den Inhalt hinein.
4. Im Repo **Settings → Pages**: bei *Branch* `main` und `/ (root)` wählen, **Save**.
5. Nach ein bis zwei Minuten läuft die App unter `https://DEIN-NAME.github.io/zeitblick/`.

## 2. Am Laptop einrichten

1. Adresse in **Chrome oder Edge** öffnen.
2. Rechts in der Adressleiste auf **Installieren** klicken – Zeitblick startet ab jetzt wie ein eigenes Programm.
3. **Einstellungen → Einrichtung** öffnen und die Schritte abhaken.

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
5. Für Alarm-Tickets in den ntfy-Einstellungen **„Bei höchster Priorität dauerhaft alarmieren“** (engl. *Keep alerting for highest priority*) einschalten.

So funktioniert es: Zeitblick plant jede Erinnerung bis zu drei Tage im Voraus auf dem ntfy-Server ein. Die Nachricht kommt also auch, wenn die App geschlossen ist. Tippst du darauf, öffnet sich die Aufgabe direkt. Erledigst du die Aufgabe, verschwindet die Nachricht wieder vom Handy.

**Laptop:** Erinnerungen erscheinen als Windows-Benachrichtigung und bleiben stehen, solange Zeitblick geöffnet ist. Wer sie auch bei geschlossener App möchte: [ntfy.sh/app](https://ntfy.sh/app) im Browser öffnen, denselben Kanal abonnieren und Benachrichtigungen erlauben.

## 6. Obsidian

**Einstellungen → Obsidian → Vault-Ordner wählen** (am Laptop in Chrome/Edge). Zeitblick legt darin den Ordner `Zeitblick` an:

| Datei/Ordner | Inhalt |
|---|---|
| `Zeitblick Übersicht.md` | Ampel, Überfälliges, Heute, Matrix, Termine, Fokus |
| `Aufgaben/` | eine Notiz pro Aufgabe mit Eigenschaften für Dataview (`ticket`, `status`, `bereich`, `kategorie`, `prioritaet`, `quadrant`, `ampel`, `faellig` …) |
| `Kalender/` | Termine je Monat |
| `Fokus/` | Fokus-Log je Monat |
| `Tage/` | Tagesnotizen |
| `Daten/zeitblick-daten.json` | kompletter Datenstand |
| `Backups/` | tägliche Sicherung (30 Tage) |

Beispiel für Dataview:

```dataview
TABLE faellig, ampel, kategorie FROM "Zeitblick/Aufgaben" WHERE status = "offen" AND bereich = "Geschäftlich" SORT faellig ASC
```

Nach einem Browser-Neustart fragt Chrome einmal nach dem Zugriff – in Zeitblick erscheint dann **Zugriff erlauben**.

## 7. Server-Erinnerungen und Google Kalender (optional, empfohlen)

Damit Erinnerungen auch nach mehreren Tagen ohne geöffnete App kommen und dein Google Kalender automatisch einfließt, läuft stündlich ein kostenloser Helfer (GitHub Action) in deinem Repository.

1. Im Repo **Settings → Secrets and variables → Actions → New repository secret**:
   - `ZB_GIST_TOKEN` = dein Token aus Schritt 3
   - `ZB_GIST_ID` = die Gist-ID (Zeitblick → Einstellungen → Sync & Cloud → Gist-ID kopieren)
   - optional `ZB_GOOGLE_ICS` = geheime iCal-Adresse deines Google Kalenders (Google Kalender → Einstellungen → dein Kalender → *Privatadresse im iCal-Format*). Mehrere Kalender mit Komma trennen, Bereich davor schreiben: `p|https://…basic.ics,b|https://…basic.ics` (p = Privat, b = Geschäftlich).
2. Reiter **Variables → New repository variable**: `ZB_APP_URL` = `https://DEIN-NAME.github.io/zeitblick/`
3. Reiter **Actions** öffnen, Workflows erlauben, **Zeitblick Erinnerungen → Run workflow**.

Google-Termine erscheinen danach im Kalender als eigene Ebene (nur lesen).

## Datensicherung

Automatisch, ohne dass du etwas tun musst:

1. **Lokal**: täglicher Schnappschuss auf jedem Gerät (21 Tage, Einstellungen → Datensicherung).
2. **Cloud**: jede Änderung als Version im privaten Gist.
3. **Obsidian**: täglich eine Sicherungsdatei im Vault (30 Tage).

Zusätzlich jederzeit: **Sicherung herunterladen** / **Sicherung einspielen**.

## Bedienung

- **N** neue Aufgabe, **E** neuer Termin, **F** Fokus, **/** oder **Strg+K** Suche, **1–6** Ansichten
- Kalender: **T** heute, **D/W/M/A** Ansicht, **X** 3 Tage, **J/K** blättern
- Handy: in der Liste nach rechts wischen = erledigt, nach links = auf morgen; Karten in der Matrix lange drücken und ziehen

## Updates

Neue Dateien einfach wieder ins Repository hochladen (bestehende ersetzen). Zeitblick meldet sich dann mit „Neue Version ist bereit“.

## Technik

Reines HTML/CSS/JavaScript ohne Build-Schritt. Daten liegen zuerst lokal (IndexedDB) und werden pro Datensatz zusammengeführt (neuere Änderung gewinnt), sodass Handy und Laptop auch offline weiterarbeiten können.
