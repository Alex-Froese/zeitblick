// Entwürfe: neue Vorgänge (und später Notizen, Routinen …), die noch nicht angelegt sind. Jede Eingabe kommt hierher
// (zusätzlich sofort im Gerät), frühere Fassungen bleiben erhalten, verworfene 30 Tage lang. So geht kein Text verloren,
// auch nicht, wenn ein Fenster abstürzt oder der Browser-Speicher geleert wird. Übernommen aus Klarblick 1.1.0.
// Datei: entwuerfe.json im Datenordner, Sicherungen alle 5 Minuten (die letzten 50) in sicherungen\entwuerfe-*.json.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading;

namespace Froese.Zeitblick
{
    class Entwuerfe
    {
        public const int Schema = 1;
        const int MaxFassungen = 20, MaxSicherungen = 50;
        static readonly Regex IdMuster = new Regex("^e-[a-z0-9]{6,32}$");
        static readonly string[] Felder = { "titel", "text", "extra" };

        readonly string datei, sicherungsordner;
        readonly object sperre = new object();
        readonly List<Dictionary<string, object>> liste;
        long rev;
        bool ungesichert;
        readonly Timer sicherungsTimer;

        public Entwuerfe(string ordner, string sicherungsordner)
        {
            datei = Path.Combine(ordner, "entwuerfe.json");
            this.sicherungsordner = sicherungsordner;
            liste = new List<Dictionary<string, object>>();
            if (File.Exists(datei))
            {
                Dictionary<string, object> d = null;
                try { d = Json.Objekt(Datei.Lesen(datei)); }
                catch { }
                if (d == null)
                {
                    // Beschädigte Datei nie überschreiben: beiseitelegen, damit nichts verloren geht.
                    try { File.Copy(datei, datei + ".beschaedigt-" + DateTime.Now.ToString("yyyyMMdd-HHmmss"), true); } catch { }
                }
                else
                {
                    rev = (long)Json.Zahl(d, "rev", 0);
                    foreach (object o in Json.Liste(d, "entwuerfe"))
                    {
                        Dictionary<string, object> e = o as Dictionary<string, object>;
                        if (e != null && IdMuster.IsMatch(Json.Text(e, "id"))) liste.Add(e);
                    }
                }
            }
            lock (sperre) { if (Aufraeumen()) Schreiben(); }
            sicherungsTimer = new Timer(delegate { AutoSicherung(); }, null, 300000, 300000);
        }

        public static bool IdGueltig(string id) { return id != null && IdMuster.IsMatch(id); }
        public static string NeueId() { return "e-" + Zufall.Hex(6); }

        static long JetztMs() { return Zeit.UnixMs(DateTime.UtcNow); }
        static long Ms(Dictionary<string, object> e, string feld) { return (long)Json.Zahl(e, feld, 0); }

        Dictionary<string, object> Finden(string id)
        {
            foreach (Dictionary<string, object> e in liste) if (Json.Text(e, "id") == id) return e;
            return null;
        }

        static bool Leer(Dictionary<string, object> e)
        {
            return Json.Text(e, "titel").Trim().Length == 0 && Json.Text(e, "text").Trim().Length == 0;
        }

        /// <summary>Für die Oberfläche: ohne die früheren Fassungen (nur ihre Anzahl), damit die Liste klein bleibt.</summary>
        static Dictionary<string, object> Kurz(Dictionary<string, object> e)
        {
            Dictionary<string, object> k = new Dictionary<string, object>();
            foreach (KeyValuePair<string, object> x in e) if (x.Key != "fassungen") k[x.Key] = x.Value;
            k["fassungenAnzahl"] = Json.Liste(e, "fassungen").Count;
            return k;
        }

        void Schreiben()
        {
            Dictionary<string, object> d = new Dictionary<string, object>();
            d["schema"] = Schema;
            d["programm"] = "zeitblick";
            d["rev"] = rev;
            d["entwuerfe"] = liste;
            Datei.AtomarSchreiben(datei, Json.Schreiben(d));
            ungesichert = true;
        }

        /// <summary>Gespeicherte nach 14 Tagen, verworfene nach 30 Tagen und leere nach einem Tag entfernen.
        /// Bis dahin liegen sie auch in den Sicherungen.</summary>
        bool Aufraeumen()
        {
            long jetzt = JetztMs(), tag = 86400000L;
            int vorher = liste.Count;
            liste.RemoveAll(e =>
            {
                string z = Json.Text(e, "zustand");
                long stand = Math.Max(Ms(e, "geaendert"), Ms(e, z == "gespeichert" ? "gespeichertAm" : "verworfenAm"));
                if (z == "gespeichert") return jetzt - stand > 14 * tag;
                if (z == "verworfen") return jetzt - stand > 30 * tag;
                return Leer(e) && Json.Liste(e, "fassungen").Count == 0 && jetzt - Ms(e, "geaendert") > tag;
            });
            return liste.Count != vorher;
        }

        // ---------- Lesen ----------

        public long Rev { get { lock (sperre) return rev; } }

        /// <summary>Alle Entwürfe mit einer Änderung nach „seit“ (0 = alle), auch gespeicherte und verworfene,
        /// damit jedes Gerät und jedes Fenster erfährt, was erledigt ist.</summary>
        public Dictionary<string, object> Liste(long seit)
        {
            Dictionary<string, object> a = new Dictionary<string, object>();
            List<object> l = new List<object>();
            lock (sperre)
            {
                if (Aufraeumen()) Schreiben();
                foreach (Dictionary<string, object> e in liste) if (Ms(e, "rev") > seit) l.Add(Kurz(e));
                a["rev"] = rev;
            }
            a["entwuerfe"] = l;
            return a;
        }

        public List<object> Fassungen(string id)
        {
            lock (sperre)
            {
                Dictionary<string, object> e = Finden(id);
                if (e == null) throw new NutzerFehler(404, "Diesen Entwurf gibt es nicht (mehr).");
                return Json.Liste(Json.Objekt(Json.Schreiben(e)), "fassungen");
            }
        }

        // ---------- Schreiben ----------

        static Dictionary<string, object> Fassung(Dictionary<string, object> e)
        {
            Dictionary<string, object> f = new Dictionary<string, object>();
            foreach (string k in Felder) f[k] = Json.Text(e, k);
            f["zeit"] = Ms(e, "geaendert");
            f["geraet"] = Json.Text(e, "geraet");
            return f;
        }

        static void FassungMerken(Dictionary<string, object> e)
        {
            if (Leer(e)) return;
            List<object> f = Json.Liste(e, "fassungen");
            Dictionary<string, object> neu = Fassung(e);
            Dictionary<string, object> letzte = f.Count > 0 ? f[f.Count - 1] as Dictionary<string, object> : null;
            if (letzte != null && Felder.All(k => Json.Text(letzte, k) == Json.Text(neu, k))) return;
            f.Add(neu);
            while (f.Count > MaxFassungen) f.RemoveAt(0);
            e["fassungen"] = f;
            e["fassungZeit"] = JetztMs();
        }

        /// <summary>Übernimmt eine Eingabe. Der zuletzt angekommene Stand gilt; was er überschreibt, bleibt als frühere
        /// Fassung erhalten, wenn ein anderes Fenster oder Gerät schreibt, seit der letzten Fassung 2 Minuten vergangen
        /// sind oder viel Text auf einmal verschwindet. Gespeicherte Entwürfe ändern sich nicht mehr.</summary>
        public Dictionary<string, object> Setzen(Dictionary<string, object> ein, string quelle, string geraet)
        {
            string id = Json.Text(ein, "id");
            if (!IdGueltig(id)) throw new NutzerFehler(400, "Ungültige Entwurfs-Nummer.");
            string zustand = Json.Text(ein, "zustand");
            if (zustand != "verworfen" && zustand != "gespeichert") zustand = "offen";
            Dictionary<string, object> a = new Dictionary<string, object>();
            lock (sperre)
            {
                Dictionary<string, object> e = Finden(id);
                if (e != null && Json.Text(e, "zustand") == "gespeichert")
                {
                    a["entwurf"] = Kurz(e);
                    a["schonGespeichert"] = true;
                    return a;
                }
                bool neu = e == null;
                if (neu)
                {
                    e = new Dictionary<string, object>();
                    e["id"] = id;
                    e["erstellt"] = Ms(ein, "erstellt") > 0 ? Ms(ein, "erstellt") : JetztMs();
                    e["fassungen"] = new List<object>();
                }
                bool gleich = !neu && Json.Text(e, "zustand") == zustand && Felder.All(k => Json.Text(e, k) == Json.Text(ein, k));
                if (!gleich)
                {
                    if (!neu)
                    {
                        bool andereQuelle = Json.Text(e, "quelle") != quelle;
                        bool lange = JetztMs() - Math.Max(Ms(e, "fassungZeit"), Ms(e, "erstellt")) > 120000;
                        bool weg = Json.Text(ein, "text").Length < Json.Text(e, "text").Length - 40;
                        if (andereQuelle || lange || weg) FassungMerken(e);
                    }
                    foreach (string k in Felder) e[k] = Json.Text(ein, k);
                    if (zustand == "verworfen" && Json.Text(e, "zustand") != "verworfen") e["verworfenAm"] = JetztMs();
                    e["zustand"] = zustand;
                    e["geaendert"] = Math.Max(Ms(ein, "geaendert"), 1);
                    e["aktualisiert"] = Zeit.Iso(DateTime.UtcNow);
                    e["quelle"] = quelle ?? "";
                    e["geraet"] = geraet ?? "";
                    e["rev"] = ++rev;
                    if (neu) liste.Add(e);
                    Schreiben();
                }
                a["entwurf"] = Kurz(e);
            }
            return a;
        }

        /// <summary>Aus dem Entwurf ist ein Vorgang geworden (die App legt ihn an und meldet die Nummer).
        /// Danach ändert sich der Entwurf nicht mehr; ein zweites „Anlegen“ aus einem anderen Fenster erkennt das.</summary>
        public Dictionary<string, object> AlsGespeichert(Dictionary<string, object> ein, string quelle, string geraet)
        {
            string id = Json.Text(ein, "id");
            string ziel = Json.Text(ein, "ziel");
            Dictionary<string, object> a = Setzen(ein, quelle, geraet);
            if (Json.Wahr(a, "schonGespeichert")) return a;
            lock (sperre)
            {
                Dictionary<string, object> e = Finden(id);
                FassungMerken(e);
                e["zustand"] = "gespeichert";
                e["ziel"] = ziel;
                e["gespeichertAm"] = JetztMs();
                e["aktualisiert"] = Zeit.Iso(DateTime.UtcNow);
                e["rev"] = ++rev;
                Schreiben();
                a["entwurf"] = Kurz(e);
            }
            return a;
        }

        public Dictionary<string, object> ZustandSetzen(string id, string zustand)
        {
            lock (sperre)
            {
                Dictionary<string, object> e = Finden(id);
                if (e == null) throw new NutzerFehler(404, "Diesen Entwurf gibt es nicht (mehr).");
                string alt = Json.Text(e, "zustand");
                if (alt == "gespeichert") throw new NutzerFehler(409, "Aus diesem Entwurf ist schon ein Vorgang geworden.");
                if (alt != zustand)
                {
                    if (zustand == "verworfen") e["verworfenAm"] = JetztMs();
                    e["zustand"] = zustand;
                    e["geaendert"] = Math.Max(JetztMs(), Ms(e, "geaendert") + 1);
                    e["aktualisiert"] = Zeit.Iso(DateTime.UtcNow);
                    e["rev"] = ++rev;
                    Schreiben();
                }
                return Kurz(e);
            }
        }

        /// <summary>Holt eine frühere Fassung zurück. Der jetzige Stand wird vorher selbst eine Fassung.</summary>
        public Dictionary<string, object> FassungZurueck(string id, int index)
        {
            lock (sperre)
            {
                Dictionary<string, object> e = Finden(id);
                if (e == null) throw new NutzerFehler(404, "Diesen Entwurf gibt es nicht (mehr).");
                List<object> f = Json.Liste(e, "fassungen");
                if (index < 0 || index >= f.Count) throw new NutzerFehler(400, "Diese Fassung gibt es nicht.");
                Dictionary<string, object> alt = f[index] as Dictionary<string, object>;
                FassungMerken(e);
                foreach (string k in Felder) e[k] = Json.Text(alt, k);
                if (Json.Text(e, "zustand") != "gespeichert") e["zustand"] = "offen";
                e["geaendert"] = Math.Max(JetztMs(), Ms(e, "geaendert") + 1);
                e["aktualisiert"] = Zeit.Iso(DateTime.UtcNow);
                e["rev"] = ++rev;
                Schreiben();
                return Kurz(e);
            }
        }

        // ---------- Sicherungen ----------

        void AutoSicherung()
        {
            try { lock (sperre) { if (ungesichert) SicherungAnlegen(); } }
            catch { }
        }

        void SicherungAnlegen()
        {
            if (!File.Exists(datei)) return;
            string ziel = Path.Combine(sicherungsordner, "entwuerfe-" + DateTime.Now.ToString("yyyy-MM-dd_HHmmss") + ".json");
            File.Copy(datei, ziel, true);
            ungesichert = false;
            FileInfo[] alle = new DirectoryInfo(sicherungsordner).GetFiles("entwuerfe-*.json").OrderByDescending(f => f.LastWriteTimeUtc).ToArray();
            for (int i = MaxSicherungen; i < alle.Length; i++) { try { alle[i].Delete(); } catch { } }
        }

        public void BeimBeenden()
        {
            try { lock (sperre) { if (ungesichert) SicherungAnlegen(); } }
            catch { }
            sicherungsTimer.Dispose();
        }
    }
}
