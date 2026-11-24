// Zeitblick-Kern: Einstieg, Optionen, Einzelinstanz.
// Gebaut mit dem in Windows eingebauten C#-Compiler (C# 5, .NET Framework 4.8), siehe bauen.cmd.
// Der Kern ist das Zuhause von Zeitblick am Laptop (Variante 1, 23.11.2026): Er liefert die App aus, hält die Daten als
// Dateien, gleicht verschlüsselt mit dem Gist ab, schreibt Statusdatei und Markdown-Spiegel und lebt im Infobereich.
using System;
using System.IO;
using System.Net;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

namespace Froese.Zeitblick
{
    static class Programm
    {
        public const string Version = "4.0.0";
        public const string Name = "Zeitblick";
        public const int StandardPort = 42480;

        [DllImport("user32.dll")]
        static extern bool AllowSetForegroundWindow(int prozessId);

        [STAThread]
        static int Main(string[] args)
        {
            // Werkzeug: eine verschlüsselte Sync-Datei ohne laufenden Kern lesbar machen (Rückweg, Prüfung).
            if (args.Length >= 1 && args[0].ToLowerInvariant() == "--entschluesseln")
                return Krypto.EntschluesselnBefehl(args);

            Optionen opt;
            try { opt = Optionen.Lesen(args); }
            catch (Exception e)
            {
                MessageBox.Show(e.Message, Name, MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return 2;
            }

            bool erste;
            Mutex mutex = new Mutex(true, "Froese.Zeitblick.Port" + opt.Port, out erste);
            if (!erste)
            {
                if (!opt.KeinFenster)
                {
                    AllowSetForegroundWindow(-1);
                    AndereInstanzZeigen(opt);
                }
                return 0;
            }

            ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12;
            ServicePointManager.DefaultConnectionLimit = 16;
            ThreadPool.SetMinThreads(24, 24);

            try
            {
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Kern kern = new Kern(opt);
                kern.Starten();
                Application.Run(kern.Oberflaeche);
                kern.Beenden();
            }
            catch (Exception e)
            {
                MessageBox.Show("Zeitblick konnte nicht starten:\n\n" + e.Message, Name, MessageBoxButtons.OK, MessageBoxIcon.Error);
                return 1;
            }
            finally
            {
                GC.KeepAlive(mutex);
            }
            return 0;
        }

        /// <summary>Zeitblick läuft schon: Fenster nach vorne holen oder das gewünschte Fenster öffnen
        /// (Sprungliste „Neues Fenster“ / „Neuer Vorgang“, Launcher-Kachel, „--vorgang &lt;id&gt;“).</summary>
        static void AndereInstanzZeigen(Optionen opt)
        {
            try
            {
                string schluessel = File.ReadAllText(Path.Combine(opt.Datenordner, Ablage.SchluesselDatei)).Trim();
                bool fenster = opt.Aktion.Length > 0;
                HttpWebRequest r = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:" + opt.Port + (fenster ? "/api/fenster" : "/api/zeigen"));
                r.Method = "POST";
                r.Proxy = null;
                r.Timeout = 3000;
                r.Headers["X-Schluessel"] = schluessel;
                if (fenster)
                {
                    System.Collections.Generic.Dictionary<string, object> d = new System.Collections.Generic.Dictionary<string, object>();
                    d["art"] = opt.Aktion;
                    d["id"] = opt.AktionWert;
                    byte[] b = Datei.Utf8.GetBytes(Json.Schreiben(d));
                    r.ContentType = "application/json; charset=utf-8";
                    r.ContentLength = b.Length;
                    using (Stream s = r.GetRequestStream()) s.Write(b, 0, b.Length);
                }
                else r.ContentLength = 0;
                using (r.GetResponse()) { }
            }
            catch
            {
                // Die andere Instanz antwortet nicht – dann gibt es nichts mehr zu tun.
            }
        }
    }

    /// <summary>Startoptionen. Alles hat sinnvolle Standardwerte.</summary>
    class Optionen
    {
        public int Port = Programm.StandardPort;
        public string Programmordner;
        public string Oberflaechenordner;
        public string Datenordner;
        /// <summary>Vault für Statusdatei und Markdown-Spiegel. null = aus den Einstellungen (Standard C:\Obsidian\System).</summary>
        public string Vault;
        public bool KeinFenster;
        public bool Hintergrund;
        /// <summary>Testinstanz: anderer Port als 42480 oder „--test“. Fenstertitel mit „TEST · “, eigener Taskleisten-Ausweis,
        /// kein Autostart, keine echten Ablagen (Vault, Statusdatei, GitHub): der Gist ist eine Attrappe im Testordner.</summary>
        public bool Test;
        /// <summary>Was beim Start geöffnet werden soll: "" (normal), "haupt", "entwurf", "vorgang".</summary>
        public string Aktion = "";
        public string AktionWert = "";
        /// <summary>Argumente, mit denen genau diese Instanz wieder gestartet wird (Sprungliste, Anheften).</summary>
        public string Grundargumente = "";

        public static Optionen Lesen(string[] args)
        {
            Optionen o = new Optionen();
            o.Programmordner = AppDomain.CurrentDomain.BaseDirectory;
            o.Oberflaechenordner = o.Programmordner;
            o.Datenordner = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Froese", "Zeitblick");

            // Speicherort austauschbar (z. B. später NAS): eine Zeile mit dem Pfad in speicherort.txt neben der exe.
            string speicherort = Path.Combine(o.Programmordner, "speicherort.txt");
            if (File.Exists(speicherort))
            {
                string pfad = File.ReadAllText(speicherort).Trim();
                if (pfad.Length > 0) o.Datenordner = Environment.ExpandEnvironmentVariables(pfad);
            }

            for (int i = 0; i < args.Length; i++)
            {
                string a = args[i].ToLowerInvariant();
                if (a == "--port" && i + 1 < args.Length) o.Port = int.Parse(args[++i]);
                else if (a == "--daten" && i + 1 < args.Length) o.Datenordner = Path.GetFullPath(args[++i]);
                else if (a == "--oberflaeche" && i + 1 < args.Length) o.Oberflaechenordner = Path.GetFullPath(args[++i]);
                else if (a == "--vault" && i + 1 < args.Length) o.Vault = Path.GetFullPath(args[++i]);
                else if (a == "--kein-fenster") o.KeinFenster = true;
                else if (a == "--still" || a == "--hintergrund" || a == "--autostart") o.Hintergrund = true;
                else if (a == "--test") o.Test = true;
                else if (a == "--neues-fenster") o.Aktion = "haupt";
                else if (a == "--neuer-vorgang") o.Aktion = "entwurf";
                else if (a == "--vorgang" && i + 1 < args.Length) { o.Aktion = "vorgang"; o.AktionWert = args[++i]; }
                else if (a == "--entwurf" && i + 1 < args.Length) { o.Aktion = "entwurf"; o.AktionWert = args[++i]; }
            }
            if (o.Port < 1024 || o.Port > 65535) throw new ArgumentException("Ungültiger Port: " + o.Port);
            if (o.Port != Programm.StandardPort) o.Test = true;
            if (o.Test)
            {
                // Eine Testinstanz darf nie in die echten Daten: ohne eigenen Datenordner startet sie nicht.
                string echt = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Froese", "Zeitblick");
                if (string.Equals(Path.GetFullPath(o.Datenordner).TrimEnd('\\'), echt, StringComparison.OrdinalIgnoreCase))
                    throw new ArgumentException("Eine Testinstanz braucht einen eigenen Datenordner (--daten …), nie den echten.");
                if (o.Vault == null) o.Vault = Path.Combine(o.Datenordner, "vault");
                System.Text.StringBuilder g = new System.Text.StringBuilder("--test --port " + o.Port + " --daten \"" + o.Datenordner + "\"");
                g.Append(" --vault \"").Append(o.Vault).Append("\"");
                if (!string.Equals(o.Oberflaechenordner, o.Programmordner, StringComparison.OrdinalIgnoreCase))
                    g.Append(" --oberflaeche \"").Append(o.Oberflaechenordner.TrimEnd('\\')).Append("\"");
                o.Grundargumente = g.ToString();
            }
            if (!File.Exists(Path.Combine(o.Oberflaechenordner, "index.html")))
                throw new DirectoryNotFoundException("Die App-Dateien fehlen (index.html in " + o.Oberflaechenordner + ").");
            return o;
        }
    }
}
