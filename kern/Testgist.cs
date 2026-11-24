// Gist-Attrappe – nur in Testinstanzen. Spielt die paar GitHub-Schnittstellen nach, die Zeitblick braucht
// (/user, /gists, /gists/<id> mit ETag und 304), und speichert im Testordner. So testen Kern und App (auch die
// Handy-Form unter http://localhost:<port>/) den verschlüsselten Abgleich, ohne je GitHub oder den echten Gist zu berühren.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;

namespace Froese.Zeitblick
{
    class TestgistSpeicher
    {
        public readonly string Ordner;
        public readonly object Sperre = new object();
        public TestgistSpeicher(string ordner) { Ordner = ordner; Directory.CreateDirectory(ordner); }

        public Dictionary<string, object> Holen(string id)
        {
            if (!System.Text.RegularExpressions.Regex.IsMatch(id ?? "", "^[a-f0-9]{8,40}$")) return null;
            string p = Path.Combine(Ordner, id + ".json");
            return File.Exists(p) ? Json.Objekt(Datei.Lesen(p)) : null;
        }

        public void Ablegen(Dictionary<string, object> g)
        {
            Datei.AtomarSchreiben(Path.Combine(Ordner, Json.Text(g, "id") + ".json"), Json.Schreiben(g));
        }

        public List<Dictionary<string, object>> Alle()
        {
            return Directory.GetFiles(Ordner, "*.json").Select(p => Json.Objekt(Datei.Lesen(p))).Where(g => g != null).ToList();
        }
    }

    partial class Server
    {
        static string Etag(string text)
        {
            using (SHA1 s = SHA1.Create()) return "\"" + BitConverter.ToString(s.ComputeHash(Datei.Utf8.GetBytes(text))).Replace("-", "").ToLowerInvariant() + "\"";
        }

        /// <summary>Gist in der Form von GitHub: files[name] = { filename, content, truncated, raw_url }.</summary>
        Dictionary<string, object> GistAntwort(Dictionary<string, object> g, bool inhalt)
        {
            Dictionary<string, object> aus = new Dictionary<string, object>();
            aus["id"] = Json.Text(g, "id");
            aus["description"] = Json.Text(g, "description");
            aus["public"] = false;
            Dictionary<string, object> files = new Dictionary<string, object>();
            foreach (KeyValuePair<string, object> f in Json.Objekt(g, "files") ?? new Dictionary<string, object>())
            {
                Dictionary<string, object> x = new Dictionary<string, object>();
                x["filename"] = f.Key;
                if (inhalt) { x["content"] = Convert.ToString(f.Value); x["truncated"] = false; }
                files[f.Key] = x;
            }
            aus["files"] = files;
            return aus;
        }

        void Testgist(Anfrage a, string pfad)
        {
            if (!a.K("Authorization").StartsWith("Bearer ") || a.K("Authorization").Length < 15) { Fehler(a, 401, "Bad credentials"); return; }
            TestgistSpeicher sp = kern.Testgist;
            lock (sp.Sperre)
            {
                if (pfad == "user" && a.Methode == "GET")
                {
                    Dictionary<string, object> u = new Dictionary<string, object>();
                    u["login"] = "test-alexander";
                    Antwort(a, u);
                    return;
                }
                if (pfad == "gists" && a.Methode == "GET")
                {
                    int seite = 1; int.TryParse(a.A("page"), out seite); if (seite < 1) seite = 1;
                    List<object> l = sp.Alle().Skip((seite - 1) * 100).Take(100).Select(g => (object)GistAntwort(g, false)).ToList();
                    Antwort(a, l);
                    return;
                }
                if (pfad == "gists" && a.Methode == "POST")
                {
                    Dictionary<string, object> e = a.Objekt;
                    Dictionary<string, object> g = new Dictionary<string, object>();
                    g["id"] = Zufall.Hex(10);
                    g["description"] = Json.Text(e, "description");
                    Dictionary<string, object> files = new Dictionary<string, object>();
                    foreach (KeyValuePair<string, object> f in Json.Objekt(e, "files") ?? new Dictionary<string, object>())
                    {
                        Dictionary<string, object> x = f.Value as Dictionary<string, object>;
                        if (x != null) files[f.Key] = Json.Text(x, "content");
                    }
                    g["files"] = files;
                    sp.Ablegen(g);
                    string text = Json.Schreiben(GistAntwort(g, true));
                    Dictionary<string, string> h = new Dictionary<string, string>();
                    h["ETag"] = Etag(text);
                    Senden(a, 201, "application/json; charset=utf-8", Datei.Utf8.GetBytes(text), h);
                    return;
                }
                if (pfad.StartsWith("gists/"))
                {
                    Dictionary<string, object> g = sp.Holen(pfad.Substring(6));
                    if (g == null) { Fehler(a, 404, "Not Found"); return; }
                    if (a.Methode == "PATCH")
                    {
                        Dictionary<string, object> files = Json.Objekt(g, "files") ?? new Dictionary<string, object>();
                        foreach (KeyValuePair<string, object> f in Json.Objekt(a.Objekt, "files") ?? new Dictionary<string, object>())
                        {
                            Dictionary<string, object> x = f.Value as Dictionary<string, object>;
                            if (x == null) files.Remove(f.Key);
                            else files[f.Key] = Json.Text(x, "content");
                        }
                        g["files"] = files;
                        sp.Ablegen(g);
                    }
                    else if (a.Methode != "GET") { Fehler(a, 405, "Method Not Allowed"); return; }
                    string text = Json.Schreiben(GistAntwort(g, true));
                    string etag = Etag(text);
                    Dictionary<string, string> h = new Dictionary<string, string>();
                    h["ETag"] = etag;
                    if (a.Methode == "GET" && a.K("If-None-Match") == etag) { KopfSchreiben(a, 304, "application/json", 0, h); a.Netz.Flush(); return; }
                    Senden(a, 200, "application/json; charset=utf-8", Datei.Utf8.GetBytes(text), h);
                    return;
                }
            }
            Fehler(a, 404, "Not Found");
        }
    }
}
