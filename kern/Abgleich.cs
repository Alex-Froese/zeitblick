// Abgleich mit dem Sync-Speicher (privater GitHub-Gist), verschlüsselt. Läuft im Kern, auch wenn kein Fenster offen ist.
//   Gist-Dateien: zb4-meta.json (Kennzeichen, Schlüssel-Kennung, kein Geheimnis) und zb4-<sammlung>.json (Umschlag, Krypto.cs).
//   Bewusst ein NEUER Gist mit neuem Präfix: Der alte Zeitblick-3-Gist behält seinen Klartext im Versionsverlauf und wird
//   nicht weiterbenutzt (löschen nur nach Alexanders Ja). Eine alte App findet den neuen Gist nicht (sie sucht zb-meta.json).
//   Ablauf je Runde: Gist holen (ETag) → entschlüsseln → je Sammlung zusammenführen (RohJson, wie die App) →
//   lokal schreiben → was sich für den Gist geändert hat, verschlüsselt hochladen.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Text;
using System.Threading;
using Timer = System.Threading.Timer;

namespace Froese.Zeitblick
{
    class Abgleich
    {
        public const string Praefix = "zb4-";
        public const string MetaDatei = "zb4-meta.json";

        readonly Ablage ablage;
        readonly string api;
        readonly bool test;
        readonly object rundenSperre = new object();
        readonly Timer takt;
        string token, gistId, login, sid;
        byte[] schluessel;
        string etag;
        Dictionary<string, string> entferntKlar;   // zuletzt bekannter, entschlüsselter Stand im Gist (Dateiname lokal → Text)
        long abgeglichenRev = -1;
        DateTime pauseBis = DateTime.MinValue;

        public string Status = "aus";      // aus | bereit | laeuft | offline | fehler
        public string Fehler = "";
        public string Letzter = "";
        public int Hochgeladen, Geholt;

        public Abgleich(Ablage a, string apiBasis, bool test)
        {
            ablage = a;
            api = apiBasis.TrimEnd('/');
            this.test = test;
            takt = new Timer(delegate { Runde(false); }, null, Timeout.Infinite, Timeout.Infinite);
            ZugangLaden();
            ablage.Geaendert += delegate (string quelle) { if (quelle != "gist" && Verbunden) takt.Change(4000, 60000); };
        }

        public bool Verbunden { get { return !string.IsNullOrEmpty(token) && !string.IsNullOrEmpty(gistId) && schluessel != null; } }

        void ZugangLaden()
        {
            Dictionary<string, object> z = ablage.ZugangLesen();
            if (z == null) return;
            try
            {
                token = Datei.Utf8.GetString(Krypto.Oeffnen(Json.Text(z, "token")));
                schluessel = Krypto.Oeffnen(Json.Text(z, "schluessel"));
                gistId = Json.Text(z, "gist");
                login = Json.Text(z, "login");
                sid = Krypto.SchluesselId(schluessel);
                Status = "bereit";
            }
            catch (Exception e)
            {
                token = null; schluessel = null;
                Status = "fehler";
                Fehler = "Der gespeicherte Sync-Zugang lässt sich nicht öffnen (anderes Windows-Konto oder anderer Rechner?). Bitte neu verbinden.";
                Protokoll.Schreiben("Zugang: " + e.Message);
            }
        }

        public void Starten() { if (Verbunden) takt.Change(1500, 60000); }
        public void Stoppen() { takt.Change(Timeout.Infinite, Timeout.Infinite); }

        public Dictionary<string, object> Zustand()
        {
            Dictionary<string, object> z = new Dictionary<string, object>();
            z["verbunden"] = Verbunden;
            z["status"] = Status;
            z["fehler"] = Fehler;
            z["letzter"] = Letzter;
            z["login"] = login ?? "";
            z["gist"] = string.IsNullOrEmpty(gistId) ? "" : (gistId.Length > 8 ? gistId.Substring(0, 4) + "…" + gistId.Substring(gistId.Length - 4) : gistId);
            z["gistId"] = gistId ?? "";
            z["sid"] = sid ?? "";
            z["verschluesselt"] = true;
            z["test"] = test;
            z["hochgeladen"] = Hochgeladen;
            z["geholt"] = Geholt;
            return z;
        }

        // ---------- GitHub ----------

        class Antwort { public int Status; public string Text = ""; public string Etag = ""; }

        Antwort Anfrage(string methode, string pfad, string koerper, string tok, string wennNicht)
        {
            HttpWebRequest r = (HttpWebRequest)WebRequest.Create(pfad.StartsWith("http") ? pfad : api + pfad);
            r.Method = methode;
            r.Proxy = test ? null : WebRequest.DefaultWebProxy;
            r.Timeout = 30000;
            r.ReadWriteTimeout = 60000;
            r.UserAgent = "Zeitblick-Kern/" + Programm.Version;
            r.Accept = "application/vnd.github+json";
            r.AutomaticDecompression = DecompressionMethods.GZip | DecompressionMethods.Deflate;
            // Der Token geht nur an die GitHub-Schnittstelle selbst, nie an Rohdatei-Adressen.
            if (tok != null && !pfad.StartsWith("http")) r.Headers["Authorization"] = "Bearer " + tok;
            if (!string.IsNullOrEmpty(wennNicht)) r.Headers["If-None-Match"] = wennNicht;
            if (koerper != null)
            {
                byte[] b = Datei.Utf8.GetBytes(koerper);
                r.ContentType = "application/json; charset=utf-8";
                r.ContentLength = b.Length;
                using (Stream s = r.GetRequestStream()) s.Write(b, 0, b.Length);
            }
            HttpWebResponse w;
            try { w = (HttpWebResponse)r.GetResponse(); }
            catch (WebException e)
            {
                w = e.Response as HttpWebResponse;
                if (w == null) throw new IOException("Keine Verbindung zu GitHub (" + e.Status + ").", e);
            }
            using (w)
            {
                Antwort a = new Antwort();
                a.Status = (int)w.StatusCode;
                a.Etag = w.Headers["ETag"] ?? "";
                using (StreamReader sr = new StreamReader(w.GetResponseStream(), Encoding.UTF8)) a.Text = sr.ReadToEnd();
                return a;
            }
        }

        static string FehlerText(int status)
        {
            if (status == 401) return "Der GitHub-Token ist ungültig oder abgelaufen. Bitte einen neuen Token mit der Berechtigung „gist“ eintragen.";
            if (status == 403) return "GitHub verweigert den Zugriff (Berechtigung „gist“ fehlt oder Limit erreicht). Neuer Versuch in Kürze.";
            if (status == 404) return "Der Sync-Speicher wurde nicht gefunden. Bitte den Sync neu verbinden.";
            if (status == 422) return "GitHub hat die Daten abgelehnt (zu groß oder ungültig).";
            return "GitHub antwortet mit Fehler " + status + ".";
        }

        /// <summary>Dateien aus einer Gist-Antwort, abgeschnittene Inhalte über raw_url nachgeladen.</summary>
        Dictionary<string, string> GistDateien(string gistJson)
        {
            Dictionary<string, string> aus = new Dictionary<string, string>(StringComparer.Ordinal);
            Dictionary<string, object> files = Json.Objekt(Json.Objekt(gistJson), "files");
            if (files == null) return aus;
            foreach (KeyValuePair<string, object> kv in files)
            {
                if (!kv.Key.StartsWith(Praefix)) continue;
                Dictionary<string, object> f = kv.Value as Dictionary<string, object>;
                if (f == null) continue;
                string inhalt = Json.Text(f, "content");
                if (Json.Wahr(f, "truncated") && Json.Text(f, "raw_url").Length > 0)
                {
                    Antwort roh = Anfrage("GET", Json.Text(f, "raw_url"), null, null, null);
                    if (roh.Status != 200) throw new IOException("Datei " + kv.Key + " konnte nicht vollständig geladen werden.");
                    inhalt = roh.Text;
                }
                aus[kv.Key] = inhalt;
            }
            return aus;
        }

        static string Meta(string sid)
        {
            Dictionary<string, object> m = new Dictionary<string, object>();
            m["zb"] = 4;
            m["programm"] = "Zeitblick";
            m["sid"] = sid;
            m["verfahren"] = Krypto.Verfahren;
            m["hinweis"] = "Inhalt verschlüsselt. Ohne den Sync-Schlüssel nicht lesbar.";
            return Json.Schreiben(m);
        }

        static string LokalerName(string gistName) { return "zb-" + gistName.Substring(Praefix.Length); }
        static string GistName(string lokal) { return Praefix + lokal.Substring(3); }
        static string Sammlung(string lokal) { return lokal.Substring(3, lokal.Length - 8); }

        // ---------- Verbinden ----------

        /// <summary>Token prüfen, vorhandenen Zeitblick-4-Speicher suchen oder neu anlegen. Gibt es schon einen, braucht es den
        /// Wiederherstellungs-Schlüssel (Code „schluessel-noetig“). Gibt bei neuem Speicher den neuen Schlüssel als Text zurück.</summary>
        public Dictionary<string, object> Verbinden(string tok, string gist, string schluesselText)
        {
            tok = (tok ?? "").Trim();
            if (tok.Length < 8 || tok.Contains(" ")) throw new NutzerFehler(400, "Bitte einen GitHub-Token mit der Berechtigung „gist“ eingeben.");
            Antwort u = Anfrage("GET", "/user", null, tok, null);
            if (u.Status != 200) throw new NutzerFehler(400, FehlerText(u.Status));
            string benutzer = Json.Text(Json.Objekt(u.Text), "login");
            string id = (gist ?? "").Trim();
            string gefundenSid = "";
            if (id.Length == 0)
            {
                for (int seite = 1; seite <= 5 && id.Length == 0; seite++)
                {
                    Antwort l = Anfrage("GET", "/gists?per_page=100&page=" + seite, null, tok, null);
                    if (l.Status != 200) throw new NutzerFehler(400, FehlerText(l.Status));
                    object[] liste = Json.Lesen(l.Text) as object[];
                    if (liste == null) { System.Collections.ArrayList al = Json.Lesen(l.Text) as System.Collections.ArrayList; liste = al != null ? al.ToArray() : new object[0]; }
                    foreach (object o in liste)
                    {
                        Dictionary<string, object> g = o as Dictionary<string, object>;
                        Dictionary<string, object> files = g == null ? null : Json.Objekt(g, "files");
                        if (files != null && files.ContainsKey(MetaDatei)) { id = Json.Text(g, "id"); break; }
                    }
                    if (liste.Length < 100) break;
                }
            }
            byte[] k = null;
            bool neu = false;
            if (id.Length > 0)
            {
                Antwort ga = Anfrage("GET", "/gists/" + id, null, tok, null);
                if (ga.Status != 200) throw new NutzerFehler(400, FehlerText(ga.Status));
                Dictionary<string, string> d = GistDateien(ga.Text);
                string meta;
                if (!d.TryGetValue(MetaDatei, out meta)) throw new NutzerFehler(400, "Dieser Gist ist kein Zeitblick-4-Speicher.");
                gefundenSid = Json.Text(Json.Objekt(meta), "sid");
                if (string.IsNullOrWhiteSpace(schluesselText))
                {
                    if (schluessel != null && Krypto.SchluesselId(schluessel) == gefundenSid) k = schluessel;
                    else
                    {
                        NutzerFehler f = new NutzerFehler(409, "Es gibt schon einen verschlüsselten Zeitblick-Speicher. Bitte den Wiederherstellungs-Schlüssel eingeben.");
                        f.Data["code"] = "schluessel-noetig";
                        throw f;
                    }
                }
                else
                {
                    k = Krypto.AusText(schluesselText);
                    if (Krypto.SchluesselId(k) != gefundenSid) throw new NutzerFehler(400, "Dieser Wiederherstellungs-Schlüssel passt nicht zum Speicher.");
                }
            }
            else
            {
                k = Krypto.NeuerSchluessel();
                neu = true;
                Dictionary<string, object> files = new Dictionary<string, object>();
                files[MetaDatei] = Inhalt(Meta(Krypto.SchluesselId(k)));
                long r;
                foreach (KeyValuePair<string, string> f in ablage.Lesen(null, out r))
                    files[GistName(f.Key)] = Inhalt(Krypto.Verschluesseln(k, Sammlung(f.Key), f.Value));
                Dictionary<string, object> body = new Dictionary<string, object>();
                body["description"] = "Zeitblick 4 – verschlüsselter Sync-Speicher (bitte nicht löschen)";
                body["public"] = false;
                body["files"] = files;
                Antwort p = Anfrage("POST", "/gists", Json.Schreiben(body), tok, null);
                if (p.Status != 201 && p.Status != 200) throw new NutzerFehler(400, FehlerText(p.Status));
                id = Json.Text(Json.Objekt(p.Text), "id");
            }

            lock (rundenSperre)
            {
                Dictionary<string, object> z = new Dictionary<string, object>();
                z["schema"] = 1;
                z["gist"] = id;
                z["login"] = benutzer;
                z["token"] = Krypto.Schuetzen(Datei.Utf8.GetBytes(tok));
                z["schluessel"] = Krypto.Schuetzen(k);
                z["verbundenAm"] = Zeit.Iso(DateTime.UtcNow);
                ablage.ZugangSchreiben(z);
                token = tok; gistId = id; login = benutzer; schluessel = k; sid = Krypto.SchluesselId(k);
                etag = null; entferntKlar = null; abgeglichenRev = -1;
                Status = "bereit"; Fehler = "";
            }
            Protokoll.Schreiben(neu ? "Neuer verschlüsselter Sync-Speicher angelegt." : "Mit vorhandenem Sync-Speicher verbunden.");
            Runde(true);
            takt.Change(60000, 60000);
            Dictionary<string, object> a = Zustand();
            a["neu"] = neu;
            if (neu) a["wiederherstellung"] = Krypto.AlsText(k);
            return a;
        }

        static Dictionary<string, object> Inhalt(string text)
        {
            Dictionary<string, object> f = new Dictionary<string, object>();
            f["content"] = text;
            return f;
        }

        /// <summary>Trennt nur diesen Laptop vom Speicher. Der Gist bleibt, wie er ist.</summary>
        public void Trennen()
        {
            lock (rundenSperre)
            {
                ablage.ZugangSchreiben(null);
                token = null; gistId = null; login = null; schluessel = null; sid = null;
                etag = null; entferntKlar = null; abgeglichenRev = -1;
                Status = "aus"; Fehler = "";
            }
            Stoppen();
        }

        public string Wiederherstellung()
        {
            if (schluessel == null) throw new NutzerFehler(409, "Der Sync ist nicht eingerichtet.");
            return Krypto.AlsText(schluessel);
        }

        /// <summary>Kopplungs-Daten fürs Handy (QR-Code): Token, Gist und Schlüssel. Nur für die App am Laptop.</summary>
        public string Kopplung()
        {
            if (!Verbunden) throw new NutzerFehler(409, "Der Sync ist nicht eingerichtet.");
            Dictionary<string, object> p = new Dictionary<string, object>();
            p["v"] = 4;
            p["t"] = token;
            p["g"] = gistId;
            p["k"] = Krypto.AlsText(schluessel);
            string b64 = Convert.ToBase64String(Datei.Utf8.GetBytes(Json.Schreiben(p)));
            return b64.Replace('+', '-').Replace('/', '_').TrimEnd('=');
        }

        // ---------- Eine Runde ----------

        public Dictionary<string, object> Jetzt()
        {
            Runde(true);
            return Zustand();
        }

        void Runde(bool sofort)
        {
            if (!Verbunden) return;
            if (!sofort && DateTime.UtcNow < pauseBis) return;
            if (!Monitor.TryEnter(rundenSperre, sofort ? 20000 : 0)) return;
            try
            {
                Status = "laeuft";
                Antwort g = Anfrage("GET", "/gists/" + gistId, null, token, entferntKlar != null ? etag : null);
                if (g.Status == 200)
                {
                    etag = g.Etag;
                    Dictionary<string, string> klar = new Dictionary<string, string>(StringComparer.Ordinal);
                    foreach (KeyValuePair<string, string> f in GistDateien(g.Text))
                    {
                        if (f.Key == MetaDatei) { if (Json.Text(Json.Objekt(f.Value), "sid") != sid) throw new IOException("Der Sync-Speicher gehört zu einem anderen Schlüssel."); continue; }
                        string lokal = LokalerName(f.Key);
                        if (!Ablage.Dateiname.IsMatch(lokal)) continue;
                        klar[lokal] = Krypto.Entschluesseln(schluessel, Sammlung(lokal), f.Value);
                    }
                    entferntKlar = klar;
                }
                else if (g.Status == 304) { if (ablage.Rev == abgeglichenRev) { Fertig(); return; } }
                else throw new WebAntwortFehler(g.Status);

                // Zusammenführen unter der Sperre der Ablage, damit niemand dazwischen schreibt.
                Dictionary<string, string> hoch = new Dictionary<string, string>(StringComparer.Ordinal);
                long revNachher;
                lock (ablage.Sperre)
                {
                    long r;
                    Dictionary<string, string> lokal = ablage.Lesen(null, out r);
                    Dictionary<string, string> neuLokal = new Dictionary<string, string>(StringComparer.Ordinal);
                    double jetzt = Zeit.UnixMs(DateTime.UtcNow);
                    foreach (string name in lokal.Keys.Union(entferntKlar.Keys).ToList())
                    {
                        string l, e;
                        lokal.TryGetValue(name, out l);
                        entferntKlar.TryGetValue(name, out e);
                        string s = Sammlung(name);
                        Zusammenfuehrung z = RohJson.Zusammenfuehren(SyncDatei.Lesen(l, s), SyncDatei.Lesen(e, s), jetzt);
                        string text = z.Ergebnis.Schreiben();
                        if (z.LokalGeaendert || l == null) { neuLokal[name] = text; if (z.LokalGeaendert) Geholt++; }
                        if (z.EntferntGeaendert || e == null) hoch[name] = text;
                    }
                    ablage.Uebernehmen(neuLokal);
                    revNachher = ablage.Rev;
                }
                if (hoch.Count > 0)
                {
                    Dictionary<string, object> files = new Dictionary<string, object>();
                    foreach (KeyValuePair<string, string> f in hoch) files[GistName(f.Key)] = Inhalt(Krypto.Verschluesseln(schluessel, Sammlung(f.Key), f.Value));
                    Dictionary<string, object> body = new Dictionary<string, object>();
                    body["files"] = files;
                    Antwort p = Anfrage("PATCH", "/gists/" + gistId, Json.Schreiben(body), token, null);
                    if (p.Status != 200) throw new WebAntwortFehler(p.Status);
                    etag = p.Etag;
                    foreach (KeyValuePair<string, string> f in hoch) entferntKlar[f.Key] = f.Value;
                    Hochgeladen += hoch.Count;
                }
                abgeglichenRev = revNachher;
                ablage.AenderungMelden("gist");
                Fertig();
            }
            catch (WebAntwortFehler e)
            {
                if (e.Status == 403 || e.Status == 429) pauseBis = DateTime.UtcNow.AddMinutes(5);
                Status = "fehler"; Fehler = FehlerText(e.Status);
                Protokoll.Schreiben("Abgleich: " + Fehler);
            }
            catch (IOException e)
            {
                pauseBis = DateTime.UtcNow.AddSeconds(30);
                Status = "offline"; Fehler = e.Message;
            }
            catch (Exception e)
            {
                Status = "fehler"; Fehler = e.Message;
                Protokoll.Schreiben("Abgleich: " + e.Message);
            }
            finally
            {
                Monitor.Exit(rundenSperre);
            }
        }

        void Fertig()
        {
            Status = "bereit"; Fehler = ""; Letzter = Zeit.Iso(DateTime.UtcNow);
        }

        class WebAntwortFehler : Exception
        {
            public readonly int Status;
            public WebAntwortFehler(int s) : base("GitHub " + s) { Status = s; }
        }
    }
}
