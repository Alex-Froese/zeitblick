// Lokaler Server: liefert die App am Laptop aus und bietet die Schnittstelle /api/… an (nur 127.0.0.1, kein Administrator,
// keine Firewall-Freigabe). Gelesen und geschrieben wird nur mit dem Kern-Schlüssel (X-Schluessel): die App am Laptop
// bekommt ihn beim Laden der Seite, Kundenblick liest ihn aus kern-schluessel.txt. HTTP-Teil übernommen aus Klarblick 1.1.0.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;

namespace Froese.Zeitblick
{
    class Anfrage
    {
        public string Methode = "", Pfad = "", Host = "";
        public Dictionary<string, string> Abfrage = new Dictionary<string, string>();
        public Dictionary<string, string> Kopf = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        public byte[] Koerper = new byte[0];
        public Stream Netz;
        public bool Weitergeleitet; // kam über Tailscale (privates Netz), nicht direkt vom Laptop

        public string K(string name) { string v; return Kopf.TryGetValue(name, out v) ? v : ""; }
        public string A(string name) { string v; return Abfrage.TryGetValue(name, out v) ? v : ""; }
        public string Text { get { return Datei.Utf8.GetString(Koerper); } }
        public Dictionary<string, object> Objekt { get { return Json.Objekt(Text) ?? new Dictionary<string, object>(); } }
    }

    partial class Server
    {
        const int MaxKopf = 64 * 1024;
        const int MaxKoerper = 16 * 1024 * 1024;

        readonly Kern kern;
        readonly TcpListener listener;
        readonly int port;
        volatile bool laeuft;


        public Server(Kern k)
        {
            kern = k;
            port = k.Opt.Port;
            listener = new TcpListener(IPAddress.Loopback, port);
        }

        public void Starten()
        {
            try { listener.Start(64); }
            catch (SocketException e)
            {
                throw new Exception("Port " + port + " ist belegt (" + e.Message + ").\nStarte Zeitblick mit --port <andere Nummer>.");
            }
            laeuft = true;
            Thread t = new Thread(Schleife);
            t.IsBackground = true;
            t.Name = "Server";
            t.Start();
        }

        public void Stoppen()
        {
            laeuft = false;
            try { listener.Stop(); } catch { }
        }

        void Schleife()
        {
            while (laeuft)
            {
                TcpClient c;
                try { c = listener.AcceptTcpClient(); }
                catch { if (!laeuft) return; continue; }
                ThreadPool.QueueUserWorkItem(delegate { Verbindung(c); });
            }
        }

        // ---------- HTTP lesen ----------

        void Verbindung(TcpClient c)
        {
            using (c)
            {
                Anfrage a = null;
                try
                {
                    c.NoDelay = true;
                    NetworkStream ns = c.GetStream();
                    ns.ReadTimeout = 30000;
                    ns.WriteTimeout = 60000;
                    a = Lesen(ns);
                    if (a == null) return;
                    Bearbeiten(a);
                }
                catch (IOException) { }
                catch (Exception e)
                {
                    if (a != null) try { Fehler(a, 500, e.Message); } catch { }
                }
            }
        }

        static Anfrage Lesen(Stream s)
        {
            // Kopfzeilen byteweise bis zur Leerzeile lesen (klein, daher unkritisch).
            MemoryStream kopf = new MemoryStream();
            int b, zustand = 0;
            while ((b = s.ReadByte()) >= 0)
            {
                kopf.WriteByte((byte)b);
                if (kopf.Length > MaxKopf) return null;
                zustand = (b == '\r' && (zustand == 0 || zustand == 2)) ? zustand + 1 : (b == '\n' && (zustand == 1 || zustand == 3)) ? zustand + 1 : 0;
                if (zustand == 4) break;
            }
            if (zustand != 4) return null;
            string[] zeilen = Encoding.ASCII.GetString(kopf.ToArray()).Split(new[] { "\r\n" }, StringSplitOptions.None);
            string[] start = zeilen[0].Split(' ');
            if (start.Length < 2) return null;
            Anfrage a = new Anfrage();
            a.Netz = s;
            a.Methode = start[0].ToUpperInvariant();
            string ziel = start[1];
            int f = ziel.IndexOf('?');
            a.Pfad = Uri.UnescapeDataString(f >= 0 ? ziel.Substring(0, f) : ziel);
            if (f >= 0)
                foreach (string teil in ziel.Substring(f + 1).Split('&'))
                {
                    if (teil.Length == 0) continue;
                    int g = teil.IndexOf('=');
                    string k = Uri.UnescapeDataString((g >= 0 ? teil.Substring(0, g) : teil).Replace('+', ' '));
                    string v = g >= 0 ? Uri.UnescapeDataString(teil.Substring(g + 1).Replace('+', ' ')) : "";
                    a.Abfrage[k] = v;
                }
            for (int i = 1; i < zeilen.Length; i++)
            {
                int d = zeilen[i].IndexOf(':');
                if (d > 0) a.Kopf[zeilen[i].Substring(0, d).Trim()] = zeilen[i].Substring(d + 1).Trim();
            }
            // Kopfzeilen sind ASCII, Werte wie Gerätenamen dürfen UTF-8 sein – die stehen aber im Körper.
            a.Host = a.K("Host").ToLowerInvariant();
            // Tailscale (tailscale serve) leitet weiter und setzt dabei diese Kopfzeilen. Dann ist es nie „direkt am Laptop“.
            if (a.K("Tailscale-User-Login").Length > 0 || a.K("X-Forwarded-For").Length > 0 || a.K("X-Forwarded-Host").Length > 0)
            {
                a.Weitergeleitet = true;
                if (a.K("X-Forwarded-Host").Length > 0) a.Host = a.K("X-Forwarded-Host").Split(',')[0].Trim().ToLowerInvariant();
            }

            long laenge;
            if (long.TryParse(a.K("Content-Length"), out laenge) && laenge > 0)
            {
                if (laenge > MaxKoerper) throw new NutzerFehler(413, "Anfrage zu groß.");
                byte[] k = new byte[laenge];
                int gelesen = 0;
                while (gelesen < laenge)
                {
                    int n = s.Read(k, gelesen, (int)laenge - gelesen);
                    if (n <= 0) throw new IOException("Verbindung abgebrochen.");
                    gelesen += n;
                }
                a.Koerper = k;
            }
            else if (a.K("Transfer-Encoding").ToLowerInvariant().Contains("chunked"))
            {
                MemoryStream m = new MemoryStream();
                while (true)
                {
                    string z = ZeileLesen(s);
                    int groesse = int.Parse(z.Split(';')[0].Trim(), NumberStyles.HexNumber);
                    if (groesse == 0) { ZeileLesen(s); break; }
                    if (m.Length + groesse > MaxKoerper) throw new NutzerFehler(413, "Anfrage zu groß.");
                    byte[] stueck = new byte[groesse];
                    int gelesen = 0;
                    while (gelesen < groesse) { int n = s.Read(stueck, gelesen, groesse - gelesen); if (n <= 0) throw new IOException(); gelesen += n; }
                    m.Write(stueck, 0, groesse);
                    ZeileLesen(s);
                }
                a.Koerper = m.ToArray();
            }
            return a;
        }

        static string ZeileLesen(Stream s)
        {
            StringBuilder b = new StringBuilder();
            int c;
            while ((c = s.ReadByte()) >= 0 && c != '\n') if (c != '\r') b.Append((char)c);
            return b.ToString();
        }

        // ---------- HTTP schreiben ----------

        static string StatusText(int s)
        {
            switch (s)
            {
                case 200: return "OK"; case 204: return "No Content"; case 304: return "Not Modified";
                case 400: return "Bad Request"; case 401: return "Unauthorized"; case 402: return "Payment Required";
                case 403: return "Forbidden"; case 404: return "Not Found"; case 405: return "Method Not Allowed";
                case 409: return "Conflict"; case 413: return "Payload Too Large"; case 422: return "Unprocessable Entity";
                case 429: return "Too Many Requests"; case 502: return "Bad Gateway"; case 503: return "Service Unavailable";
                default: return "Error";
            }
        }

        static void KopfSchreiben(Anfrage a, int status, string typ, long laenge, Dictionary<string, string> extra)
        {
            StringBuilder h = new StringBuilder();
            h.Append("HTTP/1.1 ").Append(status).Append(' ').Append(StatusText(status)).Append("\r\n");
            h.Append("Content-Type: ").Append(typ).Append("\r\n");
            if (laenge >= 0) h.Append("Content-Length: ").Append(laenge).Append("\r\n");
            h.Append("Connection: close\r\nX-Content-Type-Options: nosniff\r\nReferrer-Policy: no-referrer\r\n");
            if (extra != null) foreach (KeyValuePair<string, string> k in extra) h.Append(k.Key).Append(": ").Append(k.Value).Append("\r\n");
            if (extra == null || !extra.ContainsKey("Cache-Control")) h.Append("Cache-Control: no-cache\r\n");
            h.Append("\r\n");
            byte[] b = Encoding.UTF8.GetBytes(h.ToString());
            a.Netz.Write(b, 0, b.Length);
        }

        static void Senden(Anfrage a, int status, string typ, byte[] daten, Dictionary<string, string> extra)
        {
            bool packen = daten.Length > 4096 && a.K("Accept-Encoding").Contains("gzip") &&
                (typ.StartsWith("application/json") || typ.StartsWith("text/") || typ.StartsWith("application/manifest"));
            if (packen)
            {
                using (MemoryStream m = new MemoryStream())
                {
                    using (GZipStream g = new GZipStream(m, CompressionLevel.Fastest, true)) g.Write(daten, 0, daten.Length);
                    daten = m.ToArray();
                }
                if (extra == null) extra = new Dictionary<string, string>();
                extra["Content-Encoding"] = "gzip";
                extra["Vary"] = "Accept-Encoding";
            }
            KopfSchreiben(a, status, typ, daten.Length, extra);
            if (a.Methode != "HEAD" && daten.Length > 0) a.Netz.Write(daten, 0, daten.Length);
            a.Netz.Flush();
        }

        static void Antwort(Anfrage a, object o)
        {
            Senden(a, 200, "application/json; charset=utf-8", Datei.Utf8.GetBytes(Json.Schreiben(o)), null);
        }

        static void Fehler(Anfrage a, int status, string text)
        {
            Dictionary<string, object> f = new Dictionary<string, object>();
            f["ok"] = false;
            f["fehler"] = text;
            Senden(a, status, "application/json; charset=utf-8", Datei.Utf8.GetBytes(Json.Schreiben(f)), null);
        }


        static void FehlerMitCode(Anfrage a, int status, string text, string code)
        {
            Dictionary<string, object> f = new Dictionary<string, object>();
            f["ok"] = false;
            f["fehler"] = text;
            if (!string.IsNullOrEmpty(code)) f["code"] = code;
            Senden(a, status, "application/json; charset=utf-8", Datei.Utf8.GetBytes(Json.Schreiben(f)), null);
        }

        static void AntwortMit(Anfrage a, object o, Dictionary<string, string> extra)
        {
            Senden(a, 200, "application/json; charset=utf-8", Datei.Utf8.GetBytes(Json.Schreiben(o)), extra);
        }
    }
}
