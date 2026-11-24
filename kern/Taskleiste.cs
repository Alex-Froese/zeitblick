// Taskleiste: eigener Ausweis für die Zeitblick-Fenster (eigenes Symbol, eigener Name, einzeln anheftbar)
// und die Sprungliste beim Rechtsklick auf Zeitblick in der Taskleiste („Neues Fenster“, „Neuer Vorgang“). Übernommen aus Klarblick 1.1.0.
// Muster für alle eigenen Programme: _system-wissen/01-systemlandschaft.md → „Taskleisten-Ausweis“.
// Alles hier läuft im UI-Thread des Kerns (STA), weil es COM benutzt.
using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

namespace Froese.Zeitblick
{
    static class Taskleiste
    {
        // ---------- COM-Schnittstellen der Windows-Shell ----------

        [StructLayout(LayoutKind.Sequential, Pack = 4)]
        struct PropertyKey
        {
            public Guid Fmtid;
            public uint Pid;
            public PropertyKey(Guid f, uint p) { Fmtid = f; Pid = p; }
        }

        [StructLayout(LayoutKind.Sequential)]
        struct PropVariant
        {
            public ushort Vt;
            ushort r1, r2, r3;
            public IntPtr Wert;
            IntPtr wert2;
        }

        [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IPropertyStore
        {
            [PreserveSig] int GetCount(out uint anzahl);
            [PreserveSig] int GetAt(uint i, out PropertyKey k);
            [PreserveSig] int GetValue(ref PropertyKey k, out PropVariant v);
            [PreserveSig] int SetValue(ref PropertyKey k, ref PropVariant v);
            [PreserveSig] int Commit();
        }

        [ComImport, Guid("92CA9DCD-5622-4BBA-A805-5E9F541BD8C9"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IObjectArray
        {
            void GetCount(out uint anzahl);
            void GetAt(uint i, ref Guid iid, [MarshalAs(UnmanagedType.Interface)] out object o);
        }

        [ComImport, Guid("5632B1A4-E38A-400A-928A-D4CD63230295"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IObjectCollection
        {
            void GetCount(out uint anzahl);
            void GetAt(uint i, ref Guid iid, [MarshalAs(UnmanagedType.Interface)] out object o);
            void AddObject([MarshalAs(UnmanagedType.Interface)] object o);
            void AddFromArray([MarshalAs(UnmanagedType.Interface)] IObjectArray quelle);
            void RemoveObjectAt(uint i);
            void Clear();
        }

        [ComImport, Guid("6332DEBF-87B5-4670-90C0-5E57B408A49E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface ICustomDestinationList
        {
            [PreserveSig] int SetAppID([MarshalAs(UnmanagedType.LPWStr)] string id);
            [PreserveSig] int BeginList(out uint plaetze, ref Guid iid, [MarshalAs(UnmanagedType.Interface)] out object entfernt);
            [PreserveSig] int AppendCategory([MarshalAs(UnmanagedType.LPWStr)] string name, [MarshalAs(UnmanagedType.Interface)] IObjectArray eintraege);
            [PreserveSig] int AppendKnownCategory(int kategorie);
            [PreserveSig] int AddUserTasks([MarshalAs(UnmanagedType.Interface)] IObjectArray aufgaben);
            [PreserveSig] int CommitList();
            [PreserveSig] int GetRemovedDestinations(ref Guid iid, [MarshalAs(UnmanagedType.Interface)] out object entfernt);
            [PreserveSig] int DeleteList([MarshalAs(UnmanagedType.LPWStr)] string id);
            [PreserveSig] int AbortList();
        }

        [ComImport, Guid("000214F9-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IShellLinkW
        {
            void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder datei, int max, IntPtr daten, uint flags);
            void GetIDList(out IntPtr pidl);
            void SetIDList(IntPtr pidl);
            void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder s, int max);
            void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string s);
            void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder s, int max);
            void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string s);
            void GetArguments([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder s, int max);
            void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string s);
            void GetHotkey(out short taste);
            void SetHotkey(short taste);
            void GetShowCmd(out int befehl);
            void SetShowCmd(int befehl);
            void GetIconLocation([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder s, int max, out int index);
            void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string s, int index);
            void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string s, uint reserviert);
            void Resolve(IntPtr fenster, uint flags);
            void SetPath([MarshalAs(UnmanagedType.LPWStr)] string s);
        }

        [ComImport, Guid("77F10CF0-3DB5-4966-B520-B7C54FD35ED6")] class DestinationList { }
        [ComImport, Guid("2D3468C1-36A7-43B6-AC24-D3F02FD9607A")] class EnumerableObjectCollection { }
        [ComImport, Guid("00021401-0000-0000-C000-000000000046")] class ShellLink { }

        [DllImport("shell32.dll")]
        static extern int SHGetPropertyStoreForWindow(IntPtr fenster, ref Guid iid, [MarshalAs(UnmanagedType.Interface)] out IPropertyStore ps);
        [DllImport("ole32.dll")] static extern int PropVariantClear(ref PropVariant v);

        static readonly Guid FmtAppModel = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3");
        static readonly PropertyKey NeustartBefehl = new PropertyKey(FmtAppModel, 2);
        static readonly PropertyKey NeustartSymbol = new PropertyKey(FmtAppModel, 3);
        static readonly PropertyKey NeustartName = new PropertyKey(FmtAppModel, 4);
        static readonly PropertyKey AppId = new PropertyKey(FmtAppModel, 5);
        static readonly PropertyKey Titel = new PropertyKey(new Guid("F29F85E0-4FF9-1068-AB91-08002B27B3D9"), 2);
        const ushort VtText = 31; // VT_LPWSTR

        static int Setzen(IPropertyStore ps, PropertyKey k, string wert)
        {
            PropVariant v = new PropVariant();
            v.Vt = VtText;
            v.Wert = Marshal.StringToCoTaskMemUni(wert);
            try { return ps.SetValue(ref k, ref v); }
            finally { PropVariantClear(ref v); }
        }

        /// <summary>Gibt einem Fenster den Zeitblick-Ausweis: Neustart-Befehl, Symbol, Name und zuletzt die ID.</summary>
        public static bool AusweisSetzen(IntPtr fenster, string appId, string befehl, string symbol, string name)
        {
            Guid iid = typeof(IPropertyStore).GUID;
            IPropertyStore ps;
            if (SHGetPropertyStoreForWindow(fenster, ref iid, out ps) < 0 || ps == null) return false;
            try
            {
                Setzen(ps, NeustartBefehl, befehl);
                Setzen(ps, NeustartSymbol, symbol);
                Setzen(ps, NeustartName, name);
                bool ok = Setzen(ps, AppId, appId) >= 0;
                ps.Commit();
                return ok;
            }
            finally { Marshal.ReleaseComObject(ps); }
        }

        /// <summary>Eine Aufgabe in der Sprungliste: Titel, Argumente für die EXE, Beschreibung (Tooltip).</summary>
        public class Aufgabe
        {
            public string Titel, Argumente, Beschreibung;
            public Aufgabe(string t, string a, string b) { Titel = t; Argumente = a; Beschreibung = b; }
        }

        /// <summary>Setzt die Sprungliste für alle Fenster mit dieser ID. Gibt "" zurück oder den Fehler.</summary>
        public static string SprunglisteSetzen(string appId, string exe, string grundArgumente, IList<Aufgabe> aufgaben)
        {
            ICustomDestinationList liste = null;
            try
            {
                liste = (ICustomDestinationList)new DestinationList();
                liste.SetAppID(appId);
                uint plaetze;
                object entfernt;
                Guid iid = typeof(IObjectArray).GUID;
                int hr = liste.BeginList(out plaetze, ref iid, out entfernt);
                if (hr < 0) return "Sprungliste: BeginList 0x" + hr.ToString("X8");
                IObjectCollection sammlung = (IObjectCollection)new EnumerableObjectCollection();
                foreach (Aufgabe a in aufgaben)
                {
                    IShellLinkW link = (IShellLinkW)new ShellLink();
                    link.SetPath(exe);
                    link.SetArguments((grundArgumente + " " + a.Argumente).Trim());
                    link.SetWorkingDirectory(Path.GetDirectoryName(exe));
                    link.SetIconLocation(exe, 0);
                    link.SetDescription(a.Beschreibung);
                    IPropertyStore ps = (IPropertyStore)link;
                    Setzen(ps, Titel, a.Titel);
                    ps.Commit();
                    sammlung.AddObject(link);
                }
                hr = liste.AddUserTasks((IObjectArray)sammlung);
                if (hr < 0) { liste.AbortList(); return "Sprungliste: AddUserTasks 0x" + hr.ToString("X8"); }
                hr = liste.CommitList();
                return hr < 0 ? "Sprungliste: CommitList 0x" + hr.ToString("X8") : "";
            }
            catch (Exception e) { return "Sprungliste: " + e.Message; }
            finally { if (liste != null) Marshal.ReleaseComObject(liste); }
        }

        /// <summary>Entfernt die Sprungliste wieder (Testinstanz beim Beenden).</summary>
        public static void SprunglisteEntfernen(string appId)
        {
            try
            {
                ICustomDestinationList liste = (ICustomDestinationList)new DestinationList();
                liste.DeleteList(appId);
                Marshal.ReleaseComObject(liste);
            }
            catch { }
        }

        // ---------- Fenster platzieren (in echten Bildschirmpunkten, auch bei 125 % oder 150 %) ----------

        [StructLayout(LayoutKind.Sequential)] struct Punkt { public int X, Y; }
        [StructLayout(LayoutKind.Sequential)] struct Rechteck { public int Links, Oben, Rechts, Unten; }
        [StructLayout(LayoutKind.Sequential)]
        struct MonitorInfo { public int Groesse; public Rechteck Monitor, Arbeit; public uint Flags; }

        [DllImport("user32.dll")] static extern bool GetCursorPos(out Punkt p);
        [DllImport("user32.dll")] static extern IntPtr MonitorFromPoint(Punkt p, uint flags);
        [DllImport("user32.dll")] static extern bool GetMonitorInfo(IntPtr monitor, ref MonitorInfo info);
        [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out Rechteck r);
        [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h, IntPtr nach, int x, int y, int b, int hoehe, uint flags);
        [DllImport("user32.dll")] static extern bool IsZoomed(IntPtr h);
        [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int befehl);
        [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr kontext);
        [DllImport("user32.dll")] static extern uint GetDpiForWindow(IntPtr h);

        static readonly IntPtr ProMonitorV2 = new IntPtr(-4); // DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2

        /// <summary>Ein kleines Nebenfenster (Entwurf, Notiz) in Wunschgröße mittig auf den Bildschirm mit dem Mauszeiger.
        /// Nur, wenn Edge es zu groß geöffnet hat: Hat Alexander die Größe einmal selbst gewählt, merkt Edge sie sich und bleibt so.</summary>
        public static void NebenfensterPlatzieren(IntPtr h, int breite, int hoehe, int versatz)
        {
            IntPtr alt = IntPtr.Zero;
            try { alt = SetThreadDpiAwarenessContext(ProMonitorV2); } catch { }
            try
            {
                Punkt p;
                GetCursorPos(out p);
                MonitorInfo mi = new MonitorInfo();
                mi.Groesse = Marshal.SizeOf(typeof(MonitorInfo));
                if (!GetMonitorInfo(MonitorFromPoint(p, 2), ref mi)) return;
                double skala = 1;
                try { uint dpi = GetDpiForWindow(h); if (dpi > 0) skala = dpi / 96.0; } catch { }
                int b = (int)(breite * skala), hh = (int)(hoehe * skala);
                int arbeitB = mi.Arbeit.Rechts - mi.Arbeit.Links, arbeitH = mi.Arbeit.Unten - mi.Arbeit.Oben;
                b = Math.Min(b, arbeitB - 40);
                hh = Math.Min(hh, arbeitH - 40);
                Rechteck r;
                GetWindowRect(h, out r);
                int jetztB = r.Rechts - r.Links;
                if (!IsZoomed(h) && jetztB > 0 && jetztB <= b * 1.6 && (r.Unten - r.Oben) <= hh * 1.6) return; // eigene Größe behalten
                if (IsZoomed(h)) ShowWindow(h, 9); // SW_RESTORE
                // Mittig, mehrere Fenster leicht versetzt, aber immer ganz im Arbeitsbereich (nie hinter der Taskleiste).
                int x = Math.Min(mi.Arbeit.Links + (arbeitB - b) / 2 + versatz, mi.Arbeit.Rechts - b - 8);
                int y = Math.Min(mi.Arbeit.Oben + (arbeitH - hh) / 2 + versatz, mi.Arbeit.Unten - hh - 8);
                x = Math.Max(x, mi.Arbeit.Links + 8);
                y = Math.Max(y, mi.Arbeit.Oben + 8);
                SetWindowPos(h, IntPtr.Zero, x, y, b, hh, 0x0014); // SWP_NOZORDER | SWP_NOACTIVATE
            }
            catch { }
            finally { if (alt != IntPtr.Zero) { try { SetThreadDpiAwarenessContext(alt); } catch { } } }
        }
    }
}
