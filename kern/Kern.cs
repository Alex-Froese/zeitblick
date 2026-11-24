// Kern: verbindet Ablage, Abgleich, Entwürfe und Server und lebt im Infobereich (neben der Uhr).
// Statusdatei für Launcher und Weitblick (_system-daten\zeitblick-status.json, nur Zahlen) und Markdown-Spiegel
// (C:\Obsidian\System\Zeitblick\…) schreibt nur der Kern. Eine Testinstanz schreibt beides in ihren Testordner.
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;
using Timer = System.Threading.Timer;

namespace Froese.Zeitblick
{
    class Kern
    {
        public readonly Optionen Opt;
        public readonly Ablage Ablage;
        public readonly Abgleich Abgleich;
        public readonly Entwuerfe Entwuerfe;
        public readonly Starter Starter;
        public readonly Server Server;
        public readonly TestgistSpeicher Testgist;
        public Infobereich Oberflaeche;
        readonly ManualResetEvent bereit = new ManualResetEvent(false);
        readonly DateTime gestartet = DateTime.UtcNow;
        Timer statusTimer;
        string appStatusTag = "";
        string letzterStatus = "";

        public Kern(Optionen opt)
        {
            Opt = opt;
            Directory.CreateDirectory(opt.Datenordner);
            Protokoll.Ort(opt.Datenordner);
            Ablage = new Ablage(opt.Datenordner);
            if (opt.Test) Testgist = new TestgistSpeicher(Path.Combine(opt.Datenordner, "testgist"));
            Abgleich = new Abgleich(Ablage, opt.Test ? "http://127.0.0.1:" + opt.Port + "/testgist" : "https://api.github.com", opt.Test);
            Entwuerfe = new Entwuerfe(Ablage.Ordner, Ablage.Sicherungsordner);
            Starter = new Starter(opt.Port, opt.Test);
            Server = new Server(this);
        }

        public string ExePfad { get { return Application.ExecutablePath; } }

        /// <summary>Taskleisten-Ausweis „Froese.Zeitblick“ (Muster in 01-systemlandschaft.md), Testinstanz mit eigenem.</summary>
        public string AppId { get { return Opt.Test ? "Froese.Zeitblick.Test" : "Froese.Zeitblick"; } }

        /// <summary>So startet genau diese Instanz wieder (angeheftete Taskleiste, Sprungliste).</summary>
        public string Neustartbefehl { get { return "\"" + ExePfad + "\"" + (Opt.Grundargumente.Length > 0 ? " " + Opt.Grundargumente : ""); } }

        public void Starten()
        {
            Server.Starten();
            if (!Opt.KeinFenster && Opt.Aktion.Length > 0) { try { FensterAktion(Opt.Aktion, Opt.AktionWert, ""); } catch { Starter.Zeigen(); } }
            else if (!Opt.KeinFenster && !Opt.Hintergrund) Starter.Zeigen();
            Oberflaeche = new Infobereich(this);
            bereit.Set();
            Dictionary<string, object> e = Ablage.Einstellungen();
            if (!Opt.KeinFenster)
            {
                Oberflaeche.KuerzelSetzen(Json.Text(e, "kuerzel"));
                Oberflaeche.VorgangKuerzelSetzen(Json.Text(e, "kuerzelVorgang"));
            }
            AutostartAnwenden(e);
            Abgleich.Starten();
            // Statusdatei: von der App nach jeder Änderung, sonst der Kern selbst alle 10 Minuten (z. B. beim Tageswechsel).
            statusTimer = new Timer(delegate { StatusSelbst(); }, null, 5000, 600000);
            Ablage.Geaendert += delegate (string q) { if (q != "app") statusTimer.Change(8000, 600000); };
        }

        public void Beenden()
        {
            Server.Stoppen();
            Abgleich.Stoppen();
            Ablage.BeimBeenden();
            Entwuerfe.BeimBeenden();
            Oberflaeche.Aufraeumen();
        }

        public void SpaeterBeenden()
        {
            ThreadPool.QueueUserWorkItem(delegate { Thread.Sleep(300); try { Oberflaeche.AufUiThread(delegate { Oberflaeche.ExitThread(); return null; }); } catch { } });
        }

        // ---------- Fenster ----------

        static readonly Regex VorgangId = new Regex("^[A-Za-z0-9_-]{1,40}$");

        /// <summary>"haupt" (weiteres Hauptfenster, optional an Stelle „ziel“, z. B. #/vorgaenge), "zeigen",
        /// "entwurf" (Neuer Vorgang als eigenes kleines Fenster, ohne Nummer ein neuer), "vorgang" (ein Vorgang im eigenen Fenster).</summary>
        public string FensterAktion(string art, string wert, string ziel)
        {
            if (Opt.KeinFenster) throw new NutzerFehler(409, "Diese Zeitblick-Instanz läuft ohne Fenster.");
            switch (art)
            {
                case "haupt":
                    Starter.FensterOeffnen(ziel != null && ziel.StartsWith("#/") && ziel.Length < 2000 ? ziel : "");
                    return "";
                case "zeigen":
                    Starter.Zeigen();
                    return "";
                case "entwurf":
                    string id = Entwuerfe.IdGueltig(wert) ? wert : Entwuerfe.NeueId();
                    Starter.FensterOeffnen("fenster.html#/entwurf/" + id);
                    return id;
                case "vorgang":
                    if (!VorgangId.IsMatch(wert ?? "")) throw new NutzerFehler(400, "Welcher Vorgang? Nummer fehlt.");
                    Starter.FensterOeffnen("fenster.html#/vorgang/" + wert);
                    return wert;
                default:
                    throw new NutzerFehler(400, "Unbekannte Fenster-Art: " + art);
            }
        }

        // ---------- Einstellungen, Autostart ----------

        public Dictionary<string, object> EinstellungenMitZustand()
        {
            Dictionary<string, object> e = Ablage.Einstellungen();
            Dictionary<string, object> z = new Dictionary<string, object>();
            if (Oberflaeche != null)
            {
                z["kuerzel"] = Oberflaeche.Kuerzel; z["kuerzelFehler"] = Oberflaeche.KuerzelFehler;
                z["kuerzelVorgang"] = Oberflaeche.VorgangKuerzel; z["kuerzelVorgangFehler"] = Oberflaeche.VorgangKuerzelFehler;
                z["sprungliste"] = Oberflaeche.SprunglisteFehler;
            }
            z["autostartAktiv"] = !Opt.Test && File.Exists(Starter.VerknuepfungsPfad("autostart"));
            z["test"] = Opt.Test;
            z["vaultDa"] = Directory.Exists(VaultPfad);
            e["zustand"] = z;
            return e;
        }

        public Dictionary<string, object> EinstellungenSetzen(Dictionary<string, object> neu)
        {
            if (Opt.Test && neu.ContainsKey("vault")) neu.Remove("vault");
            Dictionary<string, object> e = Ablage.EinstellungenSetzen(neu);
            if (!Opt.KeinFenster && Oberflaeche != null)
            {
                Oberflaeche.KuerzelSetzen(Json.Text(e, "kuerzel"));
                Oberflaeche.VorgangKuerzelSetzen(Json.Text(e, "kuerzelVorgang"));
            }
            AutostartAnwenden(e);
            return EinstellungenMitZustand();
        }

        /// <summary>Autostart über eine Verknüpfung im Autostart-Ordner (wie Klarblick). Testinstanzen ändern nie Verknüpfungen.</summary>
        void AutostartAnwenden(Dictionary<string, object> e)
        {
            if (Opt.Test || Opt.KeinFenster) return;
            try
            {
                bool an = !e.ContainsKey("autostart") || Json.Wahr(e, "autostart");
                bool da = File.Exists(Starter.VerknuepfungsPfad("autostart"));
                if (an != da) Starter.VerknuepfungSetzen("autostart", an, ExePfad, "--still");
            }
            catch (Exception x) { Protokoll.Schreiben("Autostart: " + x.Message); }
        }

        // ---------- Vault: Statusdatei und Spiegel ----------

        public string VaultPfad
        {
            get { return Opt.Vault ?? Environment.ExpandEnvironmentVariables(Json.Text(Ablage.Einstellungen(), "vault")); }
        }

        string StatusPfad { get { return Path.Combine(VaultPfad, "_system-daten", "zeitblick-status.json"); } }

        /// <summary>Die App schickt nach Änderungen den Stand von „Heute“. Übernommen werden nur ein kurzer Text, die Ampel
        /// und Zahlen – nie Titel oder Namen (Weitblick bekommt nur Zahlen).</summary>
        public Dictionary<string, object> StatusVonApp(Dictionary<string, object> e)
        {
            string text = Json.Text(e, "text");
            if (text.Length > 80) text = text.Substring(0, 80);
            string ampel = Json.Text(e, "ampel");
            if (ampel != "gruen" && ampel != "gelb" && ampel != "rot") ampel = "gruen";
            Dictionary<string, object> details = new Dictionary<string, object>();
            foreach (KeyValuePair<string, object> d in Json.Objekt(e, "details") ?? new Dictionary<string, object>())
                if (Regex.IsMatch(d.Key, "^[A-Za-z][A-Za-z0-9]{0,30}$") && (d.Value is int || d.Value is long || d.Value is double || d.Value is decimal)) details[d.Key] = d.Value;
            appStatusTag = DateTime.Now.ToString("yyyy-MM-dd");
            return StatusSchreiben(text, ampel, details, "app");
        }

        /// <summary>Ohne frische Zahlen aus der App (Fenster zu, neuer Tag) zählt der Kern selbst: offene Vorgänge bis heute.</summary>
        void StatusSelbst()
        {
            try
            {
                if (appStatusTag == DateTime.Now.ToString("yyyy-MM-dd")) return;
                long rev;
                Dictionary<string, string> d = Ablage.Lesen(new[] { "zb-tasks.json" }, out rev);
                int offen = 0, ueber = 0;
                string heute = DateTime.Now.ToString("yyyy-MM-dd");
                string t;
                if (d.TryGetValue("zb-tasks.json", out t))
                {
                    Dictionary<string, object> f = Json.Objekt(t);
                    Dictionary<string, object> items = Json.Objekt(f, "items") ?? new Dictionary<string, object>();
                    foreach (object o in items.Values)
                    {
                        Dictionary<string, object> v = o as Dictionary<string, object>;
                        if (v == null || Json.Wahr(v, "deleted")) continue;
                        string st = Json.Text(v, "status");
                        if (st == "erledigt" || st == "verworfen" || (st.Length == 0 && Json.Wahr(v, "done"))) continue;
                        string due = Json.Text(v, "due");
                        if (due.Length != 10) continue;
                        if (string.CompareOrdinal(due, heute) <= 0) offen++;
                        if (string.CompareOrdinal(due, heute) < 0) ueber++;
                    }
                }
                Dictionary<string, object> det = new Dictionary<string, object>();
                det["vorgaengeHeute"] = offen;
                det["ueberfaellig"] = ueber;
                StatusSchreiben(offen == 0 ? "Heute: nichts offen" : "Heute: " + offen + " Vorgänge offen", ueber > 0 ? "gelb" : "gruen", det, "kern");
            }
            catch (Exception e) { Protokoll.Schreiben("Status: " + e.Message); }
        }

        Dictionary<string, object> StatusSchreiben(string text, string ampel, Dictionary<string, object> details, string quelle)
        {
            Dictionary<string, object> s = new Dictionary<string, object>();
            s["text"] = text;
            s["ampel"] = ampel;
            s["aktualisiert"] = DateTime.Now.ToString("yyyy-MM-ddTHH:mm:sszzz", CultureInfo.InvariantCulture);
            Dictionary<string, object> z = Abgleich.Zustand();
            details["syncAktiv"] = Json.Wahr(z, "verbunden") ? 1 : 0;
            details["syncFehler"] = Json.Text(z, "status") == "fehler" ? 1 : 0;
            s["details"] = details;
            s["quelle"] = quelle;
            Dictionary<string, object> r = new Dictionary<string, object>();
            r["ok"] = true;
            if (!Json.Wahr(Ablage.Einstellungen(), "status")) { r["geschrieben"] = false; return r; }
            string pfad = StatusPfad;
            string dir = Path.GetDirectoryName(pfad);
            if (!Directory.Exists(dir))
            {
                if (Opt.Test) Directory.CreateDirectory(dir);
                else { r["geschrieben"] = false; r["hinweis"] = "Vault-Ordner fehlt: " + dir; return r; }
            }
            string json = Json.Schreiben(s);
            string vergleich = text + "|" + ampel + "|" + Json.Schreiben(details);
            if (vergleich != letzterStatus || !File.Exists(pfad))
            {
                Datei.AtomarSchreiben(pfad, json);
                letzterStatus = vergleich;
            }
            r["geschrieben"] = true;
            r["pfad"] = pfad;
            return r;
        }

        static readonly Regex SpiegelPfadMuster = new Regex(@"^[^<>:""|?*\\]{1,240}\.md$");

        /// <summary>Markdown-Spiegel nach &lt;Vault&gt;\Zeitblick\. Nur .md-Dateien in diesem Ordner, nie darüber hinaus.</summary>
        public Dictionary<string, object> SpiegelSchreiben(Dictionary<string, object> e)
        {
            Dictionary<string, object> r = new Dictionary<string, object>();
            if (!Json.Wahr(Ablage.Einstellungen(), "spiegel")) { r["ok"] = true; r["aus"] = true; return r; }
            string vault = VaultPfad;
            if (!Directory.Exists(vault))
            {
                if (Opt.Test) Directory.CreateDirectory(vault);
                else throw new NutzerFehler(409, "Der Vault-Ordner fehlt: " + vault);
            }
            string wurzel = Path.GetFullPath(Path.Combine(vault, "Zeitblick")).TrimEnd('\\');
            int geschrieben = 0, entfernt = 0;
            foreach (object o in Json.Liste(e, "dateien"))
            {
                Dictionary<string, object> f = o as Dictionary<string, object>;
                if (f == null) continue;
                string ziel = SpiegelZiel(wurzel, Json.Text(f, "pfad"));
                Directory.CreateDirectory(Path.GetDirectoryName(ziel));
                string inhalt = Json.Text(f, "inhalt");
                if (File.Exists(ziel) && Datei.Lesen(ziel) == inhalt) continue;
                Datei.AtomarSchreiben(ziel, inhalt);
                geschrieben++;
            }
            foreach (string p in Json.Texte(e, "loeschen"))
            {
                string ziel = SpiegelZiel(wurzel, p);
                // Nur Spiegel-Dateien, die Zeitblick selbst angelegt hat (Kennzeichen im Kopf), nie fremde Notizen.
                if (File.Exists(ziel) && Datei.Lesen(ziel).Contains("tags: [zeitblick")) { File.Delete(ziel); entfernt++; }
            }
            r["ok"] = true;
            r["geschrieben"] = geschrieben;
            r["entfernt"] = entfernt;
            r["ordner"] = wurzel;
            return r;
        }

        static string SpiegelZiel(string wurzel, string rel)
        {
            rel = (rel ?? "").Replace('\\', '/').Trim();
            if (!SpiegelPfadMuster.IsMatch(rel) || rel.StartsWith("/") || rel.Split('/').Any(t => t.Length == 0 || t == "." || t == ".."))
                throw new NutzerFehler(400, "Ungültiger Spiegel-Pfad: " + rel);
            string voll = Path.GetFullPath(Path.Combine(wurzel, rel.Replace('/', '\\')));
            if (!voll.StartsWith(wurzel + "\\", StringComparison.OrdinalIgnoreCase)) throw new NutzerFehler(400, "Ungültiger Spiegel-Pfad: " + rel);
            return voll;
        }

        // ---------- Umzug von der alten Adresse ----------

        /// <summary>Legt die übergebenen Daten der alten App (github.io) unverändert ab, nachdem der jetzige Stand gesichert ist.
        /// Zusammengeführt wird danach in der App (gleiche Regeln wie beim Sync). Die alte Ablage im Browser bleibt unberührt.</summary>
        public Dictionary<string, object> UmzugAblegen(Dictionary<string, object> e)
        {
            string text = Json.Text(e, "text");
            if (text.Length < 2) throw new NutzerFehler(400, "Keine Daten zum Umziehen.");
            string sicherung = Ablage.Sichern("vor-umzug");
            string ordner = Path.Combine(Ablage.Ordner, "umzug");
            Directory.CreateDirectory(ordner);
            string name = "umzug-" + DateTime.Now.ToString("yyyy-MM-dd_HHmmss") + ".json";
            Datei.AtomarSchreiben(Path.Combine(ordner, name), text);
            Protokoll.Schreiben("Umzug abgelegt: " + name + " (" + text.Length + " Zeichen, Herkunft " + Json.Text(e, "herkunft") + ")");
            Dictionary<string, object> r = new Dictionary<string, object>();
            r["ok"] = true;
            r["datei"] = name;
            r["sicherung"] = sicherung;
            return r;
        }

        public Dictionary<string, object> Info()
        {
            Dictionary<string, object> i = new Dictionary<string, object>();
            i["version"] = Programm.Version;
            i["port"] = Opt.Port;
            i["test"] = Opt.Test;
            i["programm"] = ExePfad;
            i["oberflaeche"] = Opt.Oberflaechenordner;
            i["daten"] = Ablage.Ordner;
            i["sicherungen"] = Ablage.Sicherungsordner;
            i["sicherungenAnzahl"] = Ablage.Sicherungen().Count;
            i["vault"] = VaultPfad;
            i["spiegel"] = Path.Combine(VaultPfad, "Zeitblick");
            i["statusdatei"] = StatusPfad;
            i["rev"] = Ablage.Rev;
            i["gestartet"] = Zeit.Iso(gestartet);
            i["appId"] = AppId;
            i["sync"] = Abgleich.Zustand();
            return i;
        }
    }

    class Infobereich : ApplicationContext
    {
        /// <summary>Z wie Zeitblick, A wie Aufgabe/Anliegen: auf der deutschen Tastatur keine AltGr-Zeichen und von keinem
        /// eigenen Programm belegt (C, K, N, P, W, L, R sind vergeben, siehe 01-systemlandschaft.md).</summary>
        public const string StandardKuerzel = "Strg+Alt+Z";
        public const string StandardVorgangKuerzel = "Strg+Alt+A";

        readonly Kern kern;
        readonly NotifyIcon symbol;
        readonly Empfaenger empfaenger;
        public string Kuerzel = "", KuerzelFehler = "";
        public string VorgangKuerzel = "", VorgangKuerzelFehler = "";
        public string SprunglisteFehler = "";
        readonly HashSet<IntPtr> ausgewiesen = new HashSet<IntPtr>();
        readonly System.Windows.Forms.Timer wache;

        [DllImport("user32.dll")] static extern bool RegisterHotKey(IntPtr h, int id, uint mod, uint vk);
        [DllImport("user32.dll")] static extern bool UnregisterHotKey(IntPtr h, int id);
        [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
        const int KuerzelId = 1, VorgangKuerzelId = 2;

        public Infobereich(Kern k)
        {
            kern = k;
            empfaenger = new Empfaenger(this);
            string name = kern.Starter.Praefix + "Zeitblick";

            ContextMenuStrip menue = new ContextMenuStrip();
            menue.Items.Add("Zeitblick öffnen", null, delegate { kern.Starter.Zeigen(); }).Font = new Font(menue.Font, FontStyle.Bold);
            menue.Items.Add("Neues Fenster", null, delegate { Versuchen(delegate { kern.FensterAktion("haupt", "", ""); }); });
            menue.Items.Add("Neuer Vorgang", null, delegate { Versuchen(delegate { kern.FensterAktion("entwurf", "", ""); }); });
            menue.Items.Add(new ToolStripSeparator());
            menue.Items.Add("Jetzt abgleichen", null, delegate
            {
                ThreadPool.QueueUserWorkItem(delegate
                {
                    Dictionary<string, object> z = kern.Abgleich.Jetzt();
                    string f = Json.Text(z, "fehler");
                    symbol.ShowBalloonTip(3000, name, !Json.Wahr(z, "verbunden") ? "Der Sync ist noch nicht eingerichtet (Einstellungen → Sync)." : f.Length > 0 ? f : "Abgeglichen.", f.Length > 0 ? ToolTipIcon.Warning : ToolTipIcon.Info);
                });
            });
            menue.Items.Add("Jetzt sichern", null, delegate
            {
                ThreadPool.QueueUserWorkItem(delegate
                {
                    try { symbol.ShowBalloonTip(3000, name, "Gesichert: " + kern.Ablage.Sichern("hand"), ToolTipIcon.Info); }
                    catch (Exception e) { symbol.ShowBalloonTip(5000, name, e.Message, ToolTipIcon.Warning); }
                });
            });
            menue.Items.Add("Datenordner öffnen", null, delegate { Starter.Shell(kern.Ablage.Ordner); });
            menue.Items.Add(new ToolStripSeparator());
            menue.Items.Add("Beenden", null, delegate { ExitThread(); });

            symbol = new NotifyIcon();
            symbol.Icon = SymbolLaden();
            symbol.Text = name;
            symbol.ContextMenuStrip = menue;
            symbol.MouseClick += delegate (object s, MouseEventArgs e) { if (e.Button == MouseButtons.Left) kern.Starter.Zeigen(); };
            symbol.Visible = true;

            if (!kern.Opt.KeinFenster)
            {
                // Rechtsklick auf Zeitblick in der Taskleiste: „Neues Fenster“ und „Neuer Vorgang“.
                List<Taskleiste.Aufgabe> aufgaben = new List<Taskleiste.Aufgabe>();
                aufgaben.Add(new Taskleiste.Aufgabe("Neues Fenster", "--neues-fenster", "Ein weiteres Zeitblick-Fenster öffnen"));
                aufgaben.Add(new Taskleiste.Aufgabe("Neuer Vorgang", "--neuer-vorgang", "Neuer Vorgang in einem eigenen kleinen Fenster"));
                SprunglisteFehler = Taskleiste.SprunglisteSetzen(kern.AppId, kern.ExePfad, kern.Opt.Grundargumente, aufgaben);

                // Wache: Jedes Zeitblick-Fenster bekommt den eigenen Ausweis, auch wenn es anders geöffnet wurde.
                kern.Starter.FensterDa += delegate (IntPtr h) { try { empfaenger.BeginInvoke((Action)delegate { Ausweisen(h); }); } catch { } };
                wache = new System.Windows.Forms.Timer();
                wache.Interval = 2000;
                wache.Tick += delegate { WacheRunde(); };
                wache.Start();
                WacheRunde();
            }
        }

        void Versuchen(Action a)
        {
            try { a(); }
            catch (Exception e) { symbol.ShowBalloonTip(4000, kern.Starter.Praefix + "Zeitblick", e.Message, ToolTipIcon.Warning); }
        }

        void Ausweisen(IntPtr h)
        {
            if (ausgewiesen.Contains(h)) return;
            string name = kern.Starter.Praefix + "Zeitblick";
            if (Taskleiste.AusweisSetzen(h, kern.AppId, kern.Neustartbefehl, kern.ExePfad + ",0", name)) ausgewiesen.Add(h);
        }

        void WacheRunde()
        {
            try
            {
                foreach (IntPtr h in kern.Starter.AlleFenster()) Ausweisen(h);
                ausgewiesen.RemoveWhere(h => !IsWindow(h));
            }
            catch { }
        }

        static Icon SymbolLaden()
        {
            Stream s = Assembly.GetExecutingAssembly().GetManifestResourceStream("zeitblick.ico");
            if (s == null) return SystemIcons.Application;
            using (s) return new Icon(s, SystemInformation.SmallIconSize);
        }

        public object AufUiThread(Func<object> f) { return empfaenger.Invoke(f); }

        string Anmelden(int id, string kombination)
        {
            UnregisterHotKey(empfaenger.Handle, id);
            if (kombination == "aus") return "";
            uint mod, vk;
            if (!KombinationLesen(kombination, out mod, out vk)) return "Unbekannte Tastenkombination: " + kombination;
            string anderes = id == KuerzelId ? VorgangKuerzel : Kuerzel;
            if (string.Equals(anderes, kombination, StringComparison.OrdinalIgnoreCase)) return kombination + " ist schon das andere Zeitblick-Kürzel.";
            if (!RegisterHotKey(empfaenger.Handle, id, mod | 0x4000, vk)) return kombination + " ist schon von einem anderen Programm belegt.";
            return "";
        }

        void SymbolTextSetzen()
        {
            string t = kern.Starter.Praefix + "Zeitblick";
            if (Kuerzel.Length > 0 && Kuerzel != "aus" && KuerzelFehler.Length == 0) t += " (" + Kuerzel + ")";
            symbol.Text = t.Length > 63 ? t.Substring(0, 63) : t;
        }

        public bool KuerzelSetzen(string kombination)
        {
            return (bool)AufUiThread(delegate
            {
                // Eine Testinstanz lässt „Zeitblick zeigen“ dem echten Zeitblick.
                if (string.IsNullOrEmpty(kombination)) kombination = kern.Opt.Test ? "aus" : StandardKuerzel;
                Kuerzel = kombination;
                KuerzelFehler = Anmelden(KuerzelId, kombination);
                SymbolTextSetzen();
                return KuerzelFehler.Length == 0;
            });
        }

        public bool VorgangKuerzelSetzen(string kombination)
        {
            return (bool)AufUiThread(delegate
            {
                if (string.IsNullOrEmpty(kombination)) kombination = StandardVorgangKuerzel;
                VorgangKuerzel = kombination;
                VorgangKuerzelFehler = Anmelden(VorgangKuerzelId, kombination);
                return VorgangKuerzelFehler.Length == 0;
            });
        }

        /// <summary>„Strg+Alt+Z“, „Alt+Leertaste“, „Strg+Umschalt+F2“ …</summary>
        public static bool KombinationLesen(string k, out uint mod, out uint vk)
        {
            mod = 0; vk = 0;
            foreach (string roh in k.Split('+'))
            {
                string t = roh.Trim().ToLowerInvariant();
                if (t == "strg" || t == "ctrl") mod |= 0x2;
                else if (t == "alt") mod |= 0x1;
                else if (t == "umschalt" || t == "shift") mod |= 0x4;
                else if (t == "win") mod |= 0x8;
                else if (t == "leertaste" || t == "space") vk = 0x20;
                else if (t.Length == 1 && char.IsLetterOrDigit(t[0]) && t[0] < 128) vk = char.ToUpperInvariant(t[0]);
                else if (t.Length >= 2 && t[0] == 'f')
                {
                    int n;
                    if (int.TryParse(t.Substring(1), out n) && n >= 1 && n <= 12) vk = (uint)(0x70 + n - 1);
                    else return false;
                }
                else return false;
            }
            return mod != 0 && vk != 0;
        }

        public void Aufraeumen()
        {
            if (wache != null) wache.Stop();
            if (kern.Opt.Test && !kern.Opt.KeinFenster) Taskleiste.SprunglisteEntfernen(kern.AppId);
            symbol.Visible = false;
            symbol.Dispose();
        }

        protected override void ExitThreadCore()
        {
            symbol.Visible = false;
            base.ExitThreadCore();
        }

        class Empfaenger : Form
        {
            readonly Infobereich ib;
            public Empfaenger(Infobereich i)
            {
                ib = i;
                ShowInTaskbar = false;
                FormBorderStyle = FormBorderStyle.None;
                CreateHandle();
            }

            protected override void SetVisibleCore(bool value) { base.SetVisibleCore(false); }

            protected override void WndProc(ref Message m)
            {
                if (m.Msg == 0x0312 && m.WParam.ToInt32() == KuerzelId)
                {
                    try { ib.kern.Starter.Umschalten(); } catch { }
                    return;
                }
                if (m.Msg == 0x0312 && m.WParam.ToInt32() == VorgangKuerzelId)
                {
                    try { ib.kern.FensterAktion("entwurf", "", ""); } catch { }
                    return;
                }
                base.WndProc(ref m);
            }
        }
    }
}
