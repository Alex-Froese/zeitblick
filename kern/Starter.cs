// Fenster von Zeitblick (Edge-App-Fenster), Verknüpfungen (Startmenü, Desktop) und Autostart. Übernommen aus Klarblick 1.1.0.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using Microsoft.Win32;

namespace Froese.Zeitblick
{
    class Starter
    {
        public const string FensterTitel = "Zeitblick";
        /// <summary>Nebenfenster (Entwurf, Notiz) heißen „… — Zeitblick“, Hauptfenster „Zeitblick“ oder „Zeitblick · Ansicht“.</summary>
        public const string NebenEnde = " — Zeitblick";

        public readonly string EdgePfad;
        readonly string adresse;
        /// <summary>„TEST · “ vor jedem Fenstertitel einer Testinstanz, damit das echte Zeitblick ihre Fenster nie für seine hält.</summary>
        public readonly string Praefix;

        public Starter(int port, bool test)
        {
            EdgePfad = EdgeFinden();
            adresse = "http://127.0.0.1:" + port + "/";
            Praefix = test ? "TEST · " : "";
        }

        static string EdgeFinden()
        {
            string[] schluessel = {
                @"HKEY_CURRENT_USER\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe",
                @"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe",
                @"HKEY_LOCAL_MACHINE\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe"
            };
            foreach (string s in schluessel)
            {
                string p = Registry.GetValue(s, "", null) as string;
                if (!string.IsNullOrEmpty(p) && File.Exists(p)) return p;
            }
            string std = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Microsoft\Edge\Application\msedge.exe");
            return File.Exists(std) ? std : null;
        }

        static void Starten(string programm, string argumente)
        {
            ProcessStartInfo i = new ProcessStartInfo(programm, argumente);
            i.UseShellExecute = false;
            using (Process.Start(i)) { }
        }

        public static void Shell(string ziel)
        {
            ProcessStartInfo i = new ProcessStartInfo(ziel);
            i.UseShellExecute = true;
            using (Process.Start(i)) { }
        }

        static string Argument(string s)
        {
            return "\"" + s.Replace("\"", "%22") + "\"";
        }

        // ---------- Verknüpfungen ----------

        public static string VerknuepfungsPfad(string ort)
        {
            Environment.SpecialFolder f;
            switch (ort)
            {
                case "autostart": f = Environment.SpecialFolder.Startup; break;
                case "desktop": f = Environment.SpecialFolder.DesktopDirectory; break;
                case "startmenue": f = Environment.SpecialFolder.Programs; break;
                default: throw new NutzerFehler(400, "Unbekannter Ort: " + ort);
            }
            return Path.Combine(Environment.GetFolderPath(f), "Zeitblick.lnk");
        }

        public static void VerknuepfungSetzen(string ort, bool an, string exe, string argumente)
        {
            string lnk = VerknuepfungsPfad(ort);
            if (!an)
            {
                if (File.Exists(lnk)) File.Delete(lnk);
                return;
            }
            Type t = Type.GetTypeFromProgID("WScript.Shell");
            object shell = Activator.CreateInstance(t);
            try
            {
                object l = t.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, shell, new object[] { lnk });
                Type lt = l.GetType();
                lt.InvokeMember("TargetPath", BindingFlags.SetProperty, null, l, new object[] { exe });
                lt.InvokeMember("Arguments", BindingFlags.SetProperty, null, l, new object[] { argumente ?? "" });
                lt.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, l, new object[] { Path.GetDirectoryName(exe) });
                lt.InvokeMember("Description", BindingFlags.SetProperty, null, l, new object[] { "Zeitblick – Lebenszentrale" });
                lt.InvokeMember("IconLocation", BindingFlags.SetProperty, null, l, new object[] { exe + ",0" });
                lt.InvokeMember("Save", BindingFlags.InvokeMethod, null, l, null);
                Marshal.FinalReleaseComObject(l);
            }
            finally { Marshal.FinalReleaseComObject(shell); }
        }

        // ---------- Fenster ----------

        delegate bool FensterRueckruf(IntPtr h, IntPtr l);
        [DllImport("user32.dll")] static extern bool EnumWindows(FensterRueckruf r, IntPtr l);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int max);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int max);
        [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
        [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
        [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int befehl);
        [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
        [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, IntPtr pid);
        [DllImport("user32.dll")] static extern bool AttachThreadInput(uint von, uint zu, bool an);
        [DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr h);
        [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();

        const int SW_MINIMIZE = 6, SW_RESTORE = 9;

        [DllImport("user32.dll")] static extern bool AllowSetForegroundWindow(int prozess);

        /// <summary>Hauptfenster: „Zeitblick“ oder „Zeitblick · Heute“ (Test: mit „TEST · “ davor).</summary>
        public bool IstHauptfenster(string t)
        {
            if (t.EndsWith(NebenEnde)) return false;
            return t == Praefix + FensterTitel || t.StartsWith(Praefix + FensterTitel + " ·");
        }

        /// <summary>Nebenfenster: „Neuer Vorgang — Zeitblick“, „#0018 Angebot — Zeitblick“ (Test: mit „TEST · “ davor).</summary>
        public bool IstNebenfenster(string t)
        {
            if (!t.EndsWith(NebenEnde)) return false;
            return Praefix.Length > 0 ? t.StartsWith(Praefix) : !t.StartsWith("TEST · ");
        }

        /// <summary>Alle sichtbaren Edge-Fenster (Klasse Chrome_WidgetWin_1) mit ihrem Titel, von vorne nach hinten.</summary>
        static List<KeyValuePair<IntPtr, string>> EdgeFenster()
        {
            List<KeyValuePair<IntPtr, string>> l = new List<KeyValuePair<IntPtr, string>>();
            StringBuilder titel = new StringBuilder(512), klasse = new StringBuilder(64);
            EnumWindows(delegate (IntPtr h, IntPtr x)
            {
                if (!IsWindowVisible(h)) return true;
                klasse.Length = 0; GetClassName(h, klasse, klasse.Capacity);
                if (klasse.ToString() != "Chrome_WidgetWin_1") return true;
                titel.Length = 0; GetWindowText(h, titel, titel.Capacity);
                l.Add(new KeyValuePair<IntPtr, string>(h, titel.ToString()));
                return true;
            }, IntPtr.Zero);
            return l;
        }

        /// <summary>Alle Zeitblick-Fenster dieser Instanz (Haupt- und Nebenfenster), für den Taskleisten-Ausweis.</summary>
        public List<IntPtr> AlleFenster()
        {
            List<IntPtr> l = new List<IntPtr>();
            foreach (KeyValuePair<IntPtr, string> f in EdgeFenster())
                if (IstHauptfenster(f.Value) || IstNebenfenster(f.Value)) l.Add(f.Key);
            return l;
        }

        /// <summary>Das vorderste Hauptfenster.</summary>
        public IntPtr FensterFinden()
        {
            foreach (KeyValuePair<IntPtr, string> f in EdgeFenster())
                if (IstHauptfenster(f.Value)) return f.Key;
            return IntPtr.Zero;
        }

        /// <summary>Wird gerufen, sobald ein neu geöffnetes Zeitblick-Fenster da ist (Ausweis setzen).</summary>
        public event Action<IntPtr> FensterDa;
        int versatz;

        /// <summary>Öffnet ein weiteres Zeitblick-Fenster. weg = "" (Hauptfenster), "#/vorgaenge" (Hauptfenster an dieser Stelle)
        /// oder "fenster.html#/entwurf/e-…" bzw. "fenster.html#/vorgang/<id>" (kleines Nebenfenster).
        /// Nebenfenster haben eine eigene Seite, damit Edge sich ihre Größe getrennt vom Hauptfenster merkt.</summary>
        public void FensterOeffnen(string weg)
        {
            bool neben = weg.StartsWith("fenster.html");
            HashSet<IntPtr> vorher = new HashSet<IntPtr>();
            foreach (KeyValuePair<IntPtr, string> f in EdgeFenster()) vorher.Add(f.Key);
            if (EdgePfad == null) { Shell(adresse + weg); return; }
            try { AllowSetForegroundWindow(-1); } catch { }
            Starten(EdgePfad, "--profile-directory=Default --app=" + Argument(adresse + weg));
            int v = neben ? (versatz = (versatz + 28) % 140) : 0;
            ThreadPool.QueueUserWorkItem(delegate
            {
                // Bis zu 8 Sekunden auf das neue Fenster warten (Edge-Kaltstart), dann platzieren und nach vorne holen.
                for (int i = 0; i < 64; i++)
                {
                    Thread.Sleep(125);
                    foreach (KeyValuePair<IntPtr, string> f in EdgeFenster())
                    {
                        if (vorher.Contains(f.Key) || !(IstHauptfenster(f.Value) || IstNebenfenster(f.Value))) continue;
                        if (neben) Taskleiste.NebenfensterPlatzieren(f.Key, 560, 680, v);
                        Action<IntPtr> da = FensterDa;
                        if (da != null) { try { da(f.Key); } catch { } }
                        NachVorne(f.Key);
                        return;
                    }
                }
            });
        }

        public void Zeigen()
        {
            IntPtr h = FensterFinden();
            if (h == IntPtr.Zero) { OberflaecheOeffnen(); return; }
            NachVorne(h);
        }

        public void Umschalten()
        {
            IntPtr h = FensterFinden();
            if (h != IntPtr.Zero && GetForegroundWindow() == h && !IsIconic(h)) ShowWindow(h, SW_MINIMIZE);
            else Zeigen();
        }

        static void NachVorne(IntPtr h)
        {
            if (IsIconic(h)) ShowWindow(h, SW_RESTORE);
            if (SetForegroundWindow(h) && GetForegroundWindow() == h) return;
            uint vorne = GetWindowThreadProcessId(GetForegroundWindow(), IntPtr.Zero);
            uint ich = GetCurrentThreadId();
            if (vorne != ich) AttachThreadInput(ich, vorne, true);
            BringWindowToTop(h);
            SetForegroundWindow(h);
            if (vorne != ich) AttachThreadInput(ich, vorne, false);
        }

        public void OberflaecheOeffnen()
        {
            if (EdgePfad != null) Starten(EdgePfad, "--profile-directory=Default --app=" + Argument(adresse));
            else Shell(adresse);
        }
    }
}
