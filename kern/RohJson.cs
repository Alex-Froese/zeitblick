// Sync-Dateien ohne Umschreiben: Eine Datei { "v":4, "c":"tasks", "items": { "<id>": {…}, … } } wird in die Texte der
// einzelnen Datensätze zerlegt und genau so wieder zusammengesetzt. Der Kern vergleicht damit wie die App
// (neuere Änderung gewinnt, bei Gleichstand der größere JSON-Text) und verändert beim Durchreichen nichts
// (Zahlenformat, Reihenfolge der Felder, Sonderzeichen). Regeln: js/core.js → mergeData.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace Froese.Zeitblick
{
    class Datensatz
    {
        public string Id;
        public string Text;
        public double Geaendert;
        public bool Geloescht;
    }

    class SyncDatei
    {
        public int Version = 4;
        public string Sammlung = "";
        public readonly List<Datensatz> Liste = new List<Datensatz>();
        public readonly Dictionary<string, Datensatz> NachId = new Dictionary<string, Datensatz>(StringComparer.Ordinal);

        public void Setzen(Datensatz d)
        {
            Datensatz alt;
            if (NachId.TryGetValue(d.Id, out alt)) Liste[Liste.IndexOf(alt)] = d;
            else Liste.Add(d);
            NachId[d.Id] = d;
        }

        public static SyncDatei Lesen(string text, string sammlung)
        {
            SyncDatei f = new SyncDatei();
            f.Sammlung = sammlung;
            if (string.IsNullOrWhiteSpace(text) || text.Trim() == "null") return f;
            List<KeyValuePair<string, string>> oben = RohJson.Glieder(text, 0);
            string items = null;
            bool hatV = false;
            foreach (KeyValuePair<string, string> g in oben)
            {
                if (g.Key == "items") items = g.Value;
                else if (g.Key == "v") { hatV = true; int v; if (int.TryParse(g.Value, NumberStyles.Integer, CultureInfo.InvariantCulture, out v)) f.Version = v; }
                else if (g.Key == "c" && g.Value.StartsWith("\"")) f.Sammlung = RohJson.TextLesen(g.Value);
            }
            // Ganz alte Form (Version 1): die Datei ist selbst die Sammlung.
            if (items == null && !hatV) items = text;
            if (items == null || !items.TrimStart().StartsWith("{")) return f;
            foreach (KeyValuePair<string, string> g in RohJson.Glieder(items, 0))
            {
                if (!g.Value.TrimStart().StartsWith("{")) continue;
                Datensatz d = new Datensatz();
                d.Id = g.Key;
                d.Text = g.Value;
                foreach (KeyValuePair<string, string> feld in RohJson.Glieder(g.Value, 0))
                {
                    if (feld.Key == "updatedAt") { double z; if (double.TryParse(feld.Value, NumberStyles.Float, CultureInfo.InvariantCulture, out z)) d.Geaendert = z; }
                    else if (feld.Key == "deleted") d.Geloescht = feld.Value.Trim() == "true";
                }
                f.Setzen(d);
            }
            return f;
        }

        public string Schreiben()
        {
            StringBuilder b = new StringBuilder();
            b.Append("{\"v\":").Append(Version.ToString(CultureInfo.InvariantCulture)).Append(",\"c\":").Append(RohJson.TextSchreiben(Sammlung)).Append(",\"items\":{");
            bool erst = true;
            foreach (Datensatz d in Liste)
            {
                if (!erst) b.Append(',');
                erst = false;
                b.Append(RohJson.TextSchreiben(d.Id)).Append(':').Append(d.Text);
            }
            return b.Append("}}").ToString();
        }
    }

    class Zusammenfuehrung
    {
        public SyncDatei Ergebnis;
        public bool LokalGeaendert, EntferntGeaendert;
    }

    static class RohJson
    {
        const double LoeschmarkerTage = 120;

        /// <summary>Wie recordWins in core.js: neuere Änderung gewinnt, bei Gleichstand der größere JSON-Text.</summary>
        public static bool Gewinnt(Datensatz a, Datensatz b)
        {
            if (b == null) return a != null;
            if (a == null) return false;
            if (a.Geaendert != b.Geaendert) return a.Geaendert > b.Geaendert;
            return string.CompareOrdinal(a.Text, b.Text) > 0;
        }

        /// <summary>Wie mergeData in core.js, für eine Sammlung. jetztMs = Unix-Millisekunden.</summary>
        public static Zusammenfuehrung Zusammenfuehren(SyncDatei lokal, SyncDatei entfernt, double jetztMs)
        {
            Zusammenfuehrung z = new Zusammenfuehrung();
            SyncDatei m = new SyncDatei();
            m.Sammlung = lokal.Sammlung.Length > 0 ? lokal.Sammlung : entfernt.Sammlung;
            m.Version = Math.Max(lokal.Version, entfernt.Version);
            List<string> ids = new List<string>();
            HashSet<string> gesehen = new HashSet<string>(StringComparer.Ordinal);
            foreach (Datensatz d in lokal.Liste) if (gesehen.Add(d.Id)) ids.Add(d.Id);
            foreach (Datensatz d in entfernt.Liste) if (gesehen.Add(d.Id)) ids.Add(d.Id);
            foreach (string id in ids)
            {
                Datensatz a, b;
                lokal.NachId.TryGetValue(id, out a);
                entfernt.NachId.TryGetValue(id, out b);
                Datensatz w = Gewinnt(a, b) ? a : b;
                if (w != null && w.Geloescht && jetztMs - w.Geaendert > LoeschmarkerTage * 86400000.0)
                {
                    if (a != null) z.LokalGeaendert = true;
                    if (b != null) z.EntferntGeaendert = true;
                    continue;
                }
                m.Setzen(w);
                if (a == null || a.Text != w.Text) z.LokalGeaendert = true;
                if (b == null || b.Text != w.Text) z.EntferntGeaendert = true;
            }
            z.Ergebnis = m;
            return z;
        }

        // ---------- kleiner JSON-Zerleger (nur so viel wie nötig) ----------

        static int Leer(string s, int i)
        {
            while (i < s.Length && (s[i] == ' ' || s[i] == '\t' || s[i] == '\r' || s[i] == '\n' || s[i] == '﻿')) i++;
            return i;
        }

        static int TextEnde(string s, int i)
        {
            i++;
            while (i < s.Length)
            {
                char c = s[i];
                if (c == '\\') { i += 2; continue; }
                if (c == '"') return i + 1;
                i++;
            }
            throw new FormatException("Ein Text in der Sync-Datei hat kein Ende.");
        }

        /// <summary>Ende des Werts, der bei i beginnt (Text, Objekt, Liste, Zahl, true/false/null).</summary>
        public static int WertEnde(string s, int i)
        {
            i = Leer(s, i);
            if (i >= s.Length) throw new FormatException("In der Sync-Datei fehlt ein Wert.");
            char c = s[i];
            if (c == '"') return TextEnde(s, i);
            if (c == '{' || c == '[')
            {
                int tiefe = 0;
                while (i < s.Length)
                {
                    char d = s[i];
                    if (d == '"') { i = TextEnde(s, i); continue; }
                    if (d == '{' || d == '[') tiefe++;
                    else if (d == '}' || d == ']') { tiefe--; if (tiefe == 0) return i + 1; }
                    i++;
                }
                throw new FormatException("In der Sync-Datei fehlt eine schließende Klammer.");
            }
            int start = i;
            while (i < s.Length && ",}] \t\r\n".IndexOf(s[i]) < 0) i++;
            if (i == start) throw new FormatException("Unerwartetes Zeichen in der Sync-Datei.");
            return i;
        }

        /// <summary>Die Glieder eines Objekts als (Schlüssel, roher Wert-Text).</summary>
        public static List<KeyValuePair<string, string>> Glieder(string s, int i)
        {
            List<KeyValuePair<string, string>> l = new List<KeyValuePair<string, string>>();
            i = Leer(s, i);
            if (i >= s.Length || s[i] != '{') throw new FormatException("Die Sync-Datei ist kein JSON-Objekt.");
            i = Leer(s, i + 1);
            if (i < s.Length && s[i] == '}') return l;
            while (true)
            {
                if (i >= s.Length || s[i] != '"') throw new FormatException("In der Sync-Datei fehlt ein Name.");
                int e = TextEnde(s, i);
                string k = TextLesen(s.Substring(i, e - i));
                i = Leer(s, e);
                if (i >= s.Length || s[i] != ':') throw new FormatException("In der Sync-Datei fehlt ein Doppelpunkt.");
                i = Leer(s, i + 1);
                int ve = WertEnde(s, i);
                l.Add(new KeyValuePair<string, string>(k, s.Substring(i, ve - i)));
                i = Leer(s, ve);
                if (i < s.Length && s[i] == ',') { i = Leer(s, i + 1); continue; }
                if (i < s.Length && s[i] == '}') return l;
                throw new FormatException("In der Sync-Datei fehlt ein Komma.");
            }
        }

        /// <summary>Liest ein JSON-Textliteral ("…") mit Escape-Folgen.</summary>
        public static string TextLesen(string lit)
        {
            StringBuilder b = new StringBuilder(lit.Length);
            for (int i = 1; i < lit.Length - 1; i++)
            {
                char c = lit[i];
                if (c != '\\') { b.Append(c); continue; }
                char n = lit[++i];
                switch (n)
                {
                    case 'n': b.Append('\n'); break;
                    case 'r': b.Append('\r'); break;
                    case 't': b.Append('\t'); break;
                    case 'b': b.Append('\b'); break;
                    case 'f': b.Append('\f'); break;
                    case 'u': b.Append((char)int.Parse(lit.Substring(i + 1, 4), NumberStyles.HexNumber)); i += 4; break;
                    default: b.Append(n); break;
                }
            }
            return b.ToString();
        }

        /// <summary>Schreibt einen Text wie JSON.stringify (nur ", \ und Steuerzeichen werden maskiert).</summary>
        public static string TextSchreiben(string s)
        {
            StringBuilder b = new StringBuilder(s.Length + 2);
            b.Append('"');
            foreach (char c in s)
            {
                switch (c)
                {
                    case '"': b.Append("\\\""); break;
                    case '\\': b.Append("\\\\"); break;
                    case '\n': b.Append("\\n"); break;
                    case '\r': b.Append("\\r"); break;
                    case '\t': b.Append("\\t"); break;
                    case '\b': b.Append("\\b"); break;
                    case '\f': b.Append("\\f"); break;
                    default:
                        if (c < 0x20) b.Append("\\u").Append(((int)c).ToString("x4"));
                        else b.Append(c);
                        break;
                }
            }
            return b.Append('"').ToString();
        }
    }
}
