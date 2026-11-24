// Schnittstelle des Zeitblick-Kerns. Alles unter /api/ außer „ping“ braucht den Kern-Schlüssel (Kopfzeile X-Schluessel).
//   Daten:     GET /api/sync (ETag, ?namen=zb-tasks.json,…) · PUT /api/sync { basis, dateien } (409 = neu abgleichen)
//   Gist:      GET /api/sync/zustand · POST /api/sync/verbinden|trennen|jetzt · GET /api/sync/kopplung|schluessel
//   Entwürfe:  GET/PUT /api/entwuerfe · POST /api/entwuerfe/gespeichert|zustand|zurueck · GET /api/entwuerfe/fassungen
//   Laptop:    PUT /api/status · PUT /api/spiegel · GET/PUT /api/einstellungen · POST /api/fenster|zeigen|beenden
//   Sicherung: POST /api/sicherung · GET /api/sicherungen · POST /api/umzug · GET /api/info
// Kundenblick (Kopfzeile X-Programm: kundenblick) darf nur zb-tasks.json und zb-events.json schreiben.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;

namespace Froese.Zeitblick
{
    partial class Server
    {
        static readonly HashSet<string> Einzeldateien = new HashSet<string>(StringComparer.OrdinalIgnoreCase) {
            "/index.html", "/fenster.html", "/sw.js", "/manifest.webmanifest", "/test.html" };
        static readonly string[] Ordner = { "/css/", "/js/", "/icons/", "/vendor/" };

        bool HostErlaubt(string host) { return host == "127.0.0.1:" + port || host == "localhost:" + port; }

        /// <summary>Nur die Seite unter 127.0.0.1 ist „die App am Laptop“ und bekommt den Kern-Schlüssel.
        /// Eine Testinstanz liefert unter localhost dieselbe App ohne Kern aus: so lässt sich das Handy nachstellen.</summary>
        bool IstKernHost(string host) { return host == "127.0.0.1:" + port; }

        void Bearbeiten(Anfrage a)
        {
            try
            {
                if (a.Weitergeleitet || !HostErlaubt(a.Host)) { Fehler(a, 403, "Falscher Host."); return; }
                if (a.Pfad.StartsWith("/api/")) Api(a, a.Pfad.Substring(5));
                else if (a.Pfad.StartsWith("/testgist/") && kern.Testgist != null) Testgist(a, a.Pfad.Substring(10));
                else DateiSenden(a);
            }
            catch (NutzerFehler e) { FehlerMitCode(a, e.Status, e.Message, e.Data["code"] as string); }
            catch (KonfliktAusnahme e) { FehlerMitCode(a, 409, e.Message, "konflikt"); }
            catch (IOException) { throw; }
            catch (Exception e) { Fehler(a, 500, e.Message); }
        }

        static readonly Dictionary<string, string> Typen = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase) {
            { ".html", "text/html; charset=utf-8" }, { ".css", "text/css; charset=utf-8" },
            { ".js", "text/javascript; charset=utf-8" }, { ".mjs", "text/javascript; charset=utf-8" }, { ".json", "application/json; charset=utf-8" },
            { ".svg", "image/svg+xml" }, { ".png", "image/png" }, { ".ico", "image/x-icon" },
            { ".woff2", "font/woff2" }, { ".webmanifest", "application/manifest+json; charset=utf-8" }
        };

        void DateiSenden(Anfrage a)
        {
            if (a.Methode != "GET" && a.Methode != "HEAD") { Fehler(a, 405, "Nur GET."); return; }
            string pfad = a.Pfad == "/" ? "/index.html" : a.Pfad;
            if (pfad == "/test.html" && !kern.Opt.Test) { Fehler(a, 404, "Nicht gefunden."); return; }
            // Nur die App selbst: kein Quelltext des Kerns, keine STATUS.md, keine Werkzeuge.
            if (!Einzeldateien.Contains(pfad) && !Ordner.Any(o => pfad.StartsWith(o, StringComparison.OrdinalIgnoreCase))) { Fehler(a, 404, "Nicht gefunden."); return; }
            string wurzel = Path.GetFullPath(kern.Opt.Oberflaechenordner).TrimEnd('\\');
            string voll = Path.GetFullPath(Path.Combine(wurzel, pfad.TrimStart('/').Replace('/', '\\')));
            if (!voll.StartsWith(wurzel + "\\", StringComparison.OrdinalIgnoreCase) || !File.Exists(voll)) { Fehler(a, 404, "Nicht gefunden."); return; }

            string typ;
            if (!Typen.TryGetValue(Path.GetExtension(voll), out typ)) typ = "application/octet-stream";
            byte[] daten = File.ReadAllBytes(voll);
            Dictionary<string, string> extra = new Dictionary<string, string>();
            if (pfad == "/index.html" || pfad == "/fenster.html" || pfad == "/test.html")
            {
                if (IstKernHost(a.Host))
                {
                    Dictionary<string, object> k = new Dictionary<string, object>();
                    k["schluessel"] = kern.Ablage.Schluessel;
                    k["port"] = port;
                    k["version"] = Programm.Version;
                    k["test"] = kern.Opt.Test;
                    k["praefix"] = kern.Starter.Praefix;
                    string s = "<script>window.ZB_KERN=" + Json.Schreiben(k) + ";</script>\n</head>";
                    string html = Datei.Utf8.GetString(daten);
                    int i = html.IndexOf("</head>", StringComparison.OrdinalIgnoreCase);
                    if (i > 0) html = html.Substring(0, i) + s + html.Substring(i + 7);
                    daten = Datei.Utf8.GetBytes(html);
                }
                extra["Content-Security-Policy"] = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' data: blob:; connect-src 'self' https:; frame-ancestors 'none'; base-uri 'none'";
            }
            if (pfad == "/sw.js") extra["Service-Worker-Allowed"] = "/";
            Senden(a, 200, typ, daten, extra);
        }

        void Api(Anfrage a, string name)
        {
            string m = a.Methode;
            if (name == "ping" && m == "GET")
            {
                Dictionary<string, object> p = new Dictionary<string, object>();
                p["programm"] = "zeitblick";
                p["version"] = Programm.Version;
                p["test"] = kern.Opt.Test;
                Antwort(a, p);
                return;
            }
            if (a.K("X-Schluessel") != kern.Ablage.Schluessel) { Fehler(a, 401, "Kern-Schlüssel fehlt oder falsch."); return; }
            Dictionary<string, object> r = new Dictionary<string, object>();
            Dictionary<string, object> e = a.Objekt;

            switch (m + " " + name)
            {
                // ---------- Daten ----------
                case "GET sync":
                    {
                        string wennNicht = a.K("If-None-Match");
                        string etag = kern.Ablage.Etag;
                        Dictionary<string, string> h = new Dictionary<string, string>();
                        h["ETag"] = etag;
                        if (wennNicht.Length > 0 && wennNicht == etag) { KopfSchreiben(a, 304, "application/json", 0, h); a.Netz.Flush(); return; }
                        List<string> nur = a.A("namen").Length > 0 ? a.A("namen").Split(',').Select(x => x.Trim()).ToList() : null;
                        long rev;
                        Dictionary<string, string> d = kern.Ablage.Lesen(nur, out rev);
                        r["rev"] = rev;
                        r["dateien"] = d;
                        h["ETag"] = "\"r" + rev + "\"";
                        AntwortMit(a, r, h);
                        return;
                    }
                case "PUT sync":
                    {
                        long basis = (long)Json.Zahl(e, "basis", -1);
                        Dictionary<string, object> roh = Json.Objekt(e, "dateien") ?? new Dictionary<string, object>();
                        bool kb = a.K("X-Programm").ToLowerInvariant() == "kundenblick";
                        Dictionary<string, string> neu = new Dictionary<string, string>(StringComparer.Ordinal);
                        foreach (KeyValuePair<string, object> f in roh)
                        {
                            if (kb && f.Key != "zb-tasks.json" && f.Key != "zb-events.json") throw new NutzerFehler(403, "Kundenblick schreibt nur Vorgänge: " + f.Key);
                            neu[f.Key] = Convert.ToString(f.Value);
                        }
                        if (neu.Count == 0) throw new NutzerFehler(400, "Keine Dateien.");
                        long rev = kern.Ablage.Schreiben(basis, neu, kb ? "kundenblick" : "app");
                        r["ok"] = true;
                        r["rev"] = rev;
                        Dictionary<string, string> h = new Dictionary<string, string>();
                        h["ETag"] = "\"r" + rev + "\"";
                        AntwortMit(a, r, h);
                        return;
                    }

                // ---------- Sync-Speicher (Gist) ----------
                case "GET sync/zustand": Antwort(a, kern.Abgleich.Zustand()); return;
                case "POST sync/verbinden": Antwort(a, kern.Abgleich.Verbinden(Json.Text(e, "token"), Json.Text(e, "gist"), Json.Text(e, "schluessel"))); return;
                case "POST sync/trennen": kern.Abgleich.Trennen(); Antwort(a, kern.Abgleich.Zustand()); return;
                case "POST sync/jetzt": Antwort(a, kern.Abgleich.Jetzt()); return;
                case "GET sync/kopplung": r["payload"] = kern.Abgleich.Kopplung(); Antwort(a, r); return;
                case "GET sync/schluessel": r["text"] = kern.Abgleich.Wiederherstellung(); Antwort(a, r); return;

                // ---------- Entwürfe ----------
                case "GET entwuerfe": Antwort(a, kern.Entwuerfe.Liste((long)Json.Zahl(ZahlAus(a.A("seit")), "x", 0))); return;
                case "PUT entwuerfe": Antwort(a, kern.Entwuerfe.Setzen(Json.Objekt(e, "entwurf") ?? new Dictionary<string, object>(), Json.Text(e, "quelle"), "Laptop")); return;
                case "POST entwuerfe/gespeichert": Antwort(a, kern.Entwuerfe.AlsGespeichert(Json.Objekt(e, "entwurf") ?? new Dictionary<string, object>(), Json.Text(e, "quelle"), "Laptop")); return;
                case "POST entwuerfe/zustand": Antwort(a, kern.Entwuerfe.ZustandSetzen(Json.Text(e, "id"), Json.Text(e, "zustand") == "verworfen" ? "verworfen" : "offen")); return;
                case "GET entwuerfe/fassungen": r["fassungen"] = kern.Entwuerfe.Fassungen(a.A("id")); Antwort(a, r); return;
                case "POST entwuerfe/zurueck": Antwort(a, kern.Entwuerfe.FassungZurueck(Json.Text(e, "id"), (int)Json.Zahl(e, "index", -1))); return;

                // ---------- Laptop: Statusdatei, Spiegel, Einstellungen, Fenster ----------
                case "PUT status": Antwort(a, kern.StatusVonApp(e)); return;
                case "PUT spiegel": Antwort(a, kern.SpiegelSchreiben(e)); return;
                case "GET einstellungen": Antwort(a, kern.EinstellungenMitZustand()); return;
                case "PUT einstellungen": Antwort(a, kern.EinstellungenSetzen(e)); return;
                case "POST fenster": r["id"] = kern.FensterAktion(Json.Text(e, "art"), Json.Text(e, "id"), Json.Text(e, "ziel")); r["ok"] = true; Antwort(a, r); return;
                case "POST zeigen": kern.Starter.Zeigen(); r["ok"] = true; Antwort(a, r); return;
                case "POST beenden": r["ok"] = true; Antwort(a, r); kern.SpaeterBeenden(); return;
                case "GET info": Antwort(a, kern.Info()); return;

                // ---------- Sicherung und Umzug ----------
                case "POST sicherung": r["name"] = kern.Ablage.Sichern(Json.Text(e, "grund").Length > 0 ? Json.Text(e, "grund") : "hand"); Antwort(a, r); return;
                case "GET sicherungen": r["sicherungen"] = kern.Ablage.Sicherungen(); r["ordner"] = kern.Ablage.Sicherungsordner; Antwort(a, r); return;
                case "POST umzug": Antwort(a, kern.UmzugAblegen(e)); return;

                // ---------- nur Testinstanz: Zusammenführung des Kerns gegen die der App prüfen ----------
                case "POST test/zusammenfuehren":
                    if (!kern.Opt.Test) break;
                    {
                        string s = Json.Text(e, "sammlung");
                        Zusammenfuehrung z = RohJson.Zusammenfuehren(SyncDatei.Lesen(Json.Text(e, "lokal"), s), SyncDatei.Lesen(Json.Text(e, "entfernt"), s), Json.Zahl(e, "jetzt", Zeit.UnixMs(DateTime.UtcNow)));
                        r["ergebnis"] = z.Ergebnis.Schreiben();
                        r["lokalGeaendert"] = z.LokalGeaendert;
                        r["entferntGeaendert"] = z.EntferntGeaendert;
                        Antwort(a, r);
                        return;
                    }
            }
            Fehler(a, 404, "Unbekannte Schnittstelle: " + m + " /api/" + name);
        }

        static Dictionary<string, object> ZahlAus(string s)
        {
            Dictionary<string, object> d = new Dictionary<string, object>();
            long n;
            d["x"] = long.TryParse(s, out n) ? n : 0;
            return d;
        }
    }
}
