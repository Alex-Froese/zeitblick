// Ablage: Zeitblicks Daten am Laptop als Dateien (Launcher-Muster, 03-daten-und-sicherung.md).
//   %APPDATA%\Froese\Zeitblick\daten\zb-<sammlung>.json   eine Datei je Sammlung, Form wie im Sync { v, c, items }
//   stand.json        Revision (zählt jede Änderung), Gist-Stand
//   einstellungen.json  Einstellungen des Kerns (Kürzel, Autostart, Vault, Spiegel)
//   zugang.json       GitHub-Token und Sync-Schlüssel, beide mit Windows-DPAPI geschützt – nie in Sicherungen
//   kern-schluessel.txt  Schlüssel für die lokale Schnittstelle (App am Laptop, Kundenblick)
//   sicherungen\      ZIP etwa eine Minute nach Änderungen, beim Beenden und vor Übernahmen (die letzten 100)
// Jede Datei wird atomar geschrieben (neue Datei, dann austauschen). Speicherort austauschbar (speicherort.txt, --daten).
using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading;

namespace Froese.Zeitblick
{
    class Ablage
    {
        public const string SchluesselDatei = "kern-schluessel.txt";
        public const int Schema = 1;
        const int MaxSicherungen = 100;
        public static readonly Regex Dateiname = new Regex("^zb-[a-z][a-z0-9]{0,23}\\.json$");

        public readonly string Ordner, DatenOrdner, Sicherungsordner;
        public readonly string Schluessel;
        readonly object sperre = new object();
        readonly Dictionary<string, string> dateien = new Dictionary<string, string>(StringComparer.Ordinal);
        Dictionary<string, object> stand;
        Dictionary<string, object> einstellungen;
        long rev;
        bool ungesichert;
        readonly Timer sicherungsTimer;

        /// <summary>quelle = "app" | "kundenblick" | "gist" | "umzug"</summary>
        public event Action<string> Geaendert;

        public Ablage(string ordner)
        {
            Ordner = ordner;
            DatenOrdner = Path.Combine(ordner, "daten");
            Sicherungsordner = Path.Combine(ordner, "sicherungen");
            Directory.CreateDirectory(DatenOrdner);
            Directory.CreateDirectory(Sicherungsordner);

            string sd = Path.Combine(ordner, SchluesselDatei);
            if (!File.Exists(sd)) File.WriteAllText(sd, Zufall.Hex(24), Datei.Utf8);
            Schluessel = File.ReadAllText(sd).Trim();

            stand = JsonLesen(Path.Combine(ordner, "stand.json")) ?? new Dictionary<string, object>();
            rev = (long)Json.Zahl(stand, "rev", 0);
            einstellungen = JsonLesen(Path.Combine(ordner, "einstellungen.json")) ?? new Dictionary<string, object>();
            foreach (string pfad in Directory.GetFiles(DatenOrdner, "zb-*.json"))
            {
                string name = Path.GetFileName(pfad);
                if (!Dateiname.IsMatch(name)) continue;
                string text = Datei.Lesen(pfad);
                try { SyncDatei.Lesen(text, ""); dateien[name] = text; }
                catch
                {
                    // Beschädigte Datei nie überschreiben: beiseitelegen, damit nichts verloren geht, und Protokoll.
                    try { File.Copy(pfad, pfad + ".beschaedigt-" + DateTime.Now.ToString("yyyyMMdd-HHmmss"), true); } catch { }
                    Protokoll.Schreiben("Beschädigte Datei beiseitegelegt: " + name);
                    dateien[name] = text;
                }
            }
            sicherungsTimer = new Timer(delegate { AutoSicherung(); }, null, Timeout.Infinite, Timeout.Infinite);
        }

        static Dictionary<string, object> JsonLesen(string pfad)
        {
            if (!File.Exists(pfad)) return null;
            try { return Json.Objekt(Datei.Lesen(pfad)); }
            catch
            {
                try { File.Copy(pfad, pfad + ".beschaedigt-" + DateTime.Now.ToString("yyyyMMdd-HHmmss"), true); } catch { }
                return null;
            }
        }

        public long Rev { get { lock (sperre) return rev; } }
        public string Etag { get { return "\"r" + Rev + "\""; } }

        /// <summary>Alle Dateien (oder nur die genannten) mit der Revision, zu der sie gehören.</summary>
        public Dictionary<string, string> Lesen(IEnumerable<string> nur, out long r)
        {
            lock (sperre)
            {
                r = rev;
                Dictionary<string, string> d = new Dictionary<string, string>(StringComparer.Ordinal);
                foreach (KeyValuePair<string, string> f in dateien)
                    if (nur == null || nur.Contains(f.Key)) d[f.Key] = f.Value;
                return d;
            }
        }

        /// <summary>Schreibt Dateien, aber nur, wenn seit „basis“ niemand anderes geschrieben hat (sonst Konflikt:
        /// neu lesen, zusammenführen, nochmal). So überschreiben sich App, Kundenblick und Abgleich nie gegenseitig.</summary>
        public long Schreiben(long basis, Dictionary<string, string> neu, string quelle)
        {
            foreach (KeyValuePair<string, string> f in neu)
            {
                if (!Dateiname.IsMatch(f.Key)) throw new NutzerFehler(400, "Ungültiger Dateiname: " + f.Key);
                try { SyncDatei.Lesen(f.Value, ""); }
                catch (Exception e) { throw new NutzerFehler(400, f.Key + " ist kein gültiger Datenstand: " + e.Message); }
            }
            long r;
            lock (sperre)
            {
                if (basis != rev) throw new KonfliktAusnahme("Die Daten haben sich inzwischen geändert. Bitte neu abgleichen.");
                r = Uebernehmen(neu);
            }
            AenderungMelden(quelle);
            return r;
        }

        /// <summary>Nur für den Abgleich (hält selbst die Sperre über Lesen → Zusammenführen → Schreiben).</summary>
        public object Sperre { get { return sperre; } }

        /// <summary>Schreibt ohne Prüfung der Basis. Aufrufer hält die Sperre.</summary>
        public long Uebernehmen(Dictionary<string, string> neu)
        {
            bool etwas = false;
            foreach (KeyValuePair<string, string> f in neu)
            {
                string alt;
                if (dateien.TryGetValue(f.Key, out alt) && alt == f.Value) continue;
                Datei.AtomarSchreiben(Path.Combine(DatenOrdner, f.Key), f.Value);
                dateien[f.Key] = f.Value;
                etwas = true;
            }
            if (etwas)
            {
                rev++;
                stand["rev"] = rev;
                stand["geaendert"] = Zeit.Iso(DateTime.UtcNow);
                StandSchreiben();
                ungesichert = true;
                sicherungsTimer.Change(60000, Timeout.Infinite);
            }
            return rev;
        }

        public void AenderungMelden(string quelle)
        {
            Action<string> g = Geaendert;
            if (g != null) ThreadPool.QueueUserWorkItem(delegate { try { g(quelle); } catch { } });
        }

        // ---------- Stand (Revision, Gist) ----------

        void StandSchreiben()
        {
            stand["schema"] = Schema;
            Datei.AtomarSchreiben(Path.Combine(Ordner, "stand.json"), Json.Schreiben(stand));
        }

        public string StandText(string feld) { lock (sperre) return Json.Text(stand, feld); }

        public void StandSetzen(string feld, object wert)
        {
            lock (sperre) { stand[feld] = wert; StandSchreiben(); }
        }

        // ---------- Einstellungen des Kerns ----------

        public Dictionary<string, object> Einstellungen()
        {
            lock (sperre)
            {
                Dictionary<string, object> e = Json.Kopie(einstellungen);
                Dictionary<string, object> std = new Dictionary<string, object>();
                std["kuerzel"] = "";          // "" = Standard (Strg+Alt+Z), "aus" = keins
                std["kuerzelVorgang"] = "";   // "" = Standard (Strg+Alt+G)
                std["autostart"] = true;
                std["vault"] = @"C:\Obsidian\System";
                std["spiegel"] = true;
                std["status"] = true;
                Json.Ergaenzen(e, std);
                return e;
            }
        }

        public Dictionary<string, object> EinstellungenSetzen(Dictionary<string, object> neu)
        {
            string[] erlaubt = { "kuerzel", "kuerzelVorgang", "autostart", "vault", "spiegel", "status" };
            lock (sperre)
            {
                foreach (string k in erlaubt) if (neu.ContainsKey(k)) einstellungen[k] = neu[k];
                Datei.AtomarSchreiben(Path.Combine(Ordner, "einstellungen.json"), Json.Schreiben(einstellungen));
                ungesichert = true;
            }
            return Einstellungen();
        }

        // ---------- Zugang zum Gist (DPAPI) ----------

        string ZugangPfad { get { return Path.Combine(Ordner, "zugang.json"); } }

        public Dictionary<string, object> ZugangLesen()
        {
            lock (sperre) return JsonLesen(ZugangPfad);
        }

        public void ZugangSchreiben(Dictionary<string, object> z)
        {
            lock (sperre)
            {
                if (z == null) { if (File.Exists(ZugangPfad)) File.Delete(ZugangPfad); return; }
                Datei.AtomarSchreiben(ZugangPfad, Json.Schreiben(z));
            }
        }

        // ---------- Sicherungen ----------

        void AutoSicherung()
        {
            try { if (ungesichert) Sichern("auto"); } catch (Exception e) { Protokoll.Schreiben("Sicherung: " + e.Message); }
        }

        /// <summary>ZIP mit Daten, Stand, Einstellungen und Entwürfen. Der Zugang (Token, Schlüssel) kommt nie hinein.</summary>
        public string Sichern(string grund)
        {
            lock (sperre)
            {
                string name = "zeitblick-" + DateTime.Now.ToString("yyyy-MM-dd_HHmmss") + "-" + Regex.Replace(grund ?? "", "[^a-z0-9-]", "") + ".zip";
                string ziel = Path.Combine(Sicherungsordner, name);
                string tmp = ziel + ".neu";
                using (FileStream fs = new FileStream(tmp, FileMode.Create))
                using (ZipArchive z = new ZipArchive(fs, ZipArchiveMode.Create))
                {
                    foreach (KeyValuePair<string, string> f in dateien) Eintrag(z, "daten/" + f.Key, f.Value);
                    foreach (string extra in new[] { "stand.json", "einstellungen.json", "entwuerfe.json" })
                    {
                        string p = Path.Combine(Ordner, extra);
                        if (File.Exists(p)) Eintrag(z, extra, Datei.Lesen(p));
                    }
                }
                if (File.Exists(ziel)) File.Delete(ziel);
                File.Move(tmp, ziel);
                ungesichert = false;
                FileInfo[] alle = new DirectoryInfo(Sicherungsordner).GetFiles("zeitblick-*.zip").OrderByDescending(f => f.Name).ToArray();
                for (int i = MaxSicherungen; i < alle.Length; i++) { try { alle[i].Delete(); } catch { } }
                return name;
            }
        }

        static void Eintrag(ZipArchive z, string name, string inhalt)
        {
            ZipArchiveEntry e = z.CreateEntry(name, CompressionLevel.Optimal);
            using (Stream s = e.Open()) { byte[] b = Datei.Utf8.GetBytes(inhalt); s.Write(b, 0, b.Length); }
        }

        public List<object> Sicherungen()
        {
            List<object> l = new List<object>();
            foreach (FileInfo f in new DirectoryInfo(Sicherungsordner).GetFiles("zeitblick-*.zip").OrderByDescending(f => f.Name))
            {
                Dictionary<string, object> d = new Dictionary<string, object>();
                d["name"] = f.Name;
                d["groesse"] = f.Length;
                d["zeit"] = Zeit.Iso(f.LastWriteTimeUtc);
                l.Add(d);
            }
            return l;
        }

        /// <summary>Spielt eine Sicherung zurück. Vorher wird der jetzige Stand selbst gesichert (Rückweg).</summary>
        public long Wiederherstellen(string name)
        {
            if (!Regex.IsMatch(name ?? "", "^zeitblick-[0-9_-]+[a-z0-9-]*\\.zip$")) throw new NutzerFehler(400, "Ungültiger Name.");
            string pfad = Path.Combine(Sicherungsordner, name);
            if (!File.Exists(pfad)) throw new NutzerFehler(404, "Diese Sicherung gibt es nicht.");
            Sichern("vor-wiederherstellen");
            Dictionary<string, string> neu = new Dictionary<string, string>(StringComparer.Ordinal);
            using (ZipArchive z = ZipFile.OpenRead(pfad))
                foreach (ZipArchiveEntry e in z.Entries)
                {
                    if (!e.FullName.StartsWith("daten/")) continue;
                    string n = e.FullName.Substring(6);
                    if (!Dateiname.IsMatch(n)) continue;
                    using (StreamReader r = new StreamReader(e.Open(), Datei.Utf8)) neu[n] = r.ReadToEnd();
                }
            long r2;
            lock (sperre)
            {
                // Dateien, die es in der Sicherung nicht gab, bleiben stehen (nichts geht verloren).
                r2 = Uebernehmen(neu);
                rev++; stand["rev"] = rev; StandSchreiben();
                r2 = rev;
            }
            AenderungMelden("wiederherstellen");
            return r2;
        }

        public void BeimBeenden()
        {
            try { if (ungesichert) Sichern("beenden"); } catch { }
        }
    }

    static class Protokoll
    {
        static string datei;
        static readonly object sperre = new object();
        public static void Ort(string ordner) { datei = Path.Combine(ordner, "protokoll.txt"); }
        public static void Schreiben(string text)
        {
            if (datei == null) return;
            try
            {
                lock (sperre)
                {
                    FileInfo f = new FileInfo(datei);
                    if (f.Exists && f.Length > 512 * 1024) File.Delete(datei);
                    File.AppendAllText(datei, DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + "  " + text + Environment.NewLine, Datei.Utf8);
                }
            }
            catch { }
        }
    }
}
