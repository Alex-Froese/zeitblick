// Kleine Helfer für JSON, Zeitangaben, sicheres Schreiben und Zufallswerte.
using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;

namespace Froese.Zeitblick
{
    static class Json
    {
        static JavaScriptSerializer Neu()
        {
            JavaScriptSerializer s = new JavaScriptSerializer();
            s.MaxJsonLength = int.MaxValue;
            s.RecursionLimit = 200;
            return s;
        }

        public static string Schreiben(object o) { return Neu().Serialize(o); }

        public static object Lesen(string text)
        {
            if (string.IsNullOrEmpty(text)) return null;
            return Neu().DeserializeObject(text);
        }

        /// <summary>Liest ein JSON-Objekt. Gibt null zurück, wenn es kein Objekt ist.</summary>
        public static Dictionary<string, object> Objekt(string text)
        {
            return Lesen(text) as Dictionary<string, object>;
        }

        public static Dictionary<string, object> Objekt(Dictionary<string, object> d, string schluessel)
        {
            if (d == null) return null;
            object o;
            return d.TryGetValue(schluessel, out o) ? o as Dictionary<string, object> : null;
        }

        public static List<object> Liste(Dictionary<string, object> d, string schluessel)
        {
            List<object> l = new List<object>();
            if (d == null) return l;
            object o;
            if (!d.TryGetValue(schluessel, out o) || o == null || o is string) return l;
            IEnumerable e = o as IEnumerable;
            if (e != null) foreach (object x in e) l.Add(x);
            return l;
        }

        public static List<string> Texte(Dictionary<string, object> d, string schluessel)
        {
            List<string> l = new List<string>();
            foreach (object o in Liste(d, schluessel)) if (o != null) l.Add(Convert.ToString(o, CultureInfo.InvariantCulture));
            return l;
        }

        public static string Text(Dictionary<string, object> d, string schluessel)
        {
            if (d == null) return "";
            object o;
            if (!d.TryGetValue(schluessel, out o) || o == null) return "";
            return Convert.ToString(o, CultureInfo.InvariantCulture);
        }

        public static double Zahl(Dictionary<string, object> d, string schluessel, double standard)
        {
            if (d == null) return standard;
            object o;
            if (!d.TryGetValue(schluessel, out o) || o == null) return standard;
            try { return Convert.ToDouble(o, CultureInfo.InvariantCulture); }
            catch { return standard; }
        }

        public static bool Wahr(Dictionary<string, object> d, string schluessel)
        {
            if (d == null) return false;
            object o;
            return d.TryGetValue(schluessel, out o) && o is bool && (bool)o;
        }

        public static bool Hat(Dictionary<string, object> d, string schluessel)
        {
            return d != null && d.ContainsKey(schluessel);
        }

        /// <summary>Tiefe Kopie über Serialisieren – reicht für unsere kleinen Datenmengen.</summary>
        public static Dictionary<string, object> Kopie(Dictionary<string, object> d)
        {
            return Objekt(Schreiben(d));
        }

        /// <summary>Ergänzt fehlende Schlüssel aus den Standardwerten (rekursiv für Objekte, Listen bleiben wie sie sind).</summary>
        public static void Ergaenzen(Dictionary<string, object> ziel, Dictionary<string, object> standard)
        {
            foreach (KeyValuePair<string, object> k in standard)
            {
                object vorhanden;
                if (!ziel.TryGetValue(k.Key, out vorhanden) || vorhanden == null) ziel[k.Key] = k.Value;
                else
                {
                    Dictionary<string, object> a = vorhanden as Dictionary<string, object>;
                    Dictionary<string, object> b = k.Value as Dictionary<string, object>;
                    if (a != null && b != null) Ergaenzen(a, b);
                }
            }
        }
    }

    static class Zeit
    {
        /// <summary>ISO-8601 in UTC, wie JavaScript es versteht.</summary>
        public static string Iso(DateTime t)
        {
            return t.ToUniversalTime().ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);
        }

        public static long UnixMs(DateTime t)
        {
            return (long)(t.ToUniversalTime() - new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc)).TotalMilliseconds;
        }

        public static string Monat(DateTime t)
        {
            return t.ToLocalTime().ToString("yyyy-MM", CultureInfo.InvariantCulture);
        }
    }

    static class Datei
    {
        public static readonly Encoding Utf8 = new UTF8Encoding(false);

        /// <summary>Schreibt erst eine neue Datei und tauscht sie dann aus – so gibt es nie eine halbe Datei.</summary>
        public static void AtomarSchreiben(string pfad, string inhalt)
        {
            string neu = pfad + ".neu";
            File.WriteAllText(neu, inhalt, Utf8);
            for (int versuch = 0; ; versuch++)
            {
                try
                {
                    if (File.Exists(pfad)) File.Replace(neu, pfad, null);
                    else File.Move(neu, pfad);
                    return;
                }
                catch (IOException)
                {
                    if (versuch >= 4) throw;
                    Thread.Sleep(60 * (versuch + 1));
                }
            }
        }

        /// <summary>Liest eine Datei, auch wenn ein anderes Programm (Obsidian) sie gerade offen hat.</summary>
        public static string Lesen(string pfad)
        {
            for (int versuch = 0; ; versuch++)
            {
                try
                {
                    using (FileStream s = new FileStream(pfad, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
                    using (StreamReader r = new StreamReader(s, Encoding.UTF8, true))
                        return r.ReadToEnd();
                }
                catch (IOException)
                {
                    if (versuch >= 3 || !File.Exists(pfad)) throw;
                    Thread.Sleep(80 * (versuch + 1));
                }
            }
        }

        /// <summary>Entfernt Zeichen, die in Windows-Dateinamen nicht erlaubt sind.</summary>
        public static string Name(string s, int maxLaenge)
        {
            StringBuilder b = new StringBuilder();
            foreach (char c in s ?? "")
            {
                if (Array.IndexOf(Path.GetInvalidFileNameChars(), c) >= 0 || c == '#' || c == '^' || c == '[' || c == ']' || c == '|') b.Append(' ');
                else b.Append(c);
            }
            string t = System.Text.RegularExpressions.Regex.Replace(b.ToString(), @"\s+", " ").Trim().TrimEnd('.');
            if (t.Length > maxLaenge) t = t.Substring(0, maxLaenge).Trim();
            return t;
        }
    }

    static class Zufall
    {
        public static string Hex(int bytes)
        {
            byte[] b = new byte[bytes];
            using (RandomNumberGenerator r = RandomNumberGenerator.Create()) r.GetBytes(b);
            return BitConverter.ToString(b).Replace("-", "").ToLowerInvariant();
        }

        public static string Ziffern(int anzahl)
        {
            byte[] b = new byte[anzahl];
            using (RandomNumberGenerator r = RandomNumberGenerator.Create()) r.GetBytes(b);
            StringBuilder s = new StringBuilder();
            foreach (byte x in b) s.Append((char)('0' + x % 10));
            return s.ToString();
        }
    }

    class KonfliktAusnahme : Exception
    {
        public KonfliktAusnahme(string text) : base(text) { }
    }

    class NutzerFehler : Exception
    {
        public readonly int Status;
        public NutzerFehler(int status, string text) : base(text) { Status = status; }
    }
}
