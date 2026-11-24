// Verschlüsselung des Sync-Speichers: AES-256 (CBC) + HMAC-SHA256, wie Klarblick und Postblick.
// Gleiches Verfahren in der App (js/krypto.js, WebCrypto) und hier im Kern (.NET 4 hat kein AES-GCM).
//   Hauptschlüssel: 32 zufällige Bytes, erzeugt beim Einrichten, nur auf Alexanders Geräten.
//   AES-Schlüssel = HMAC-SHA256(haupt, "zeitblick-aes"), MAC-Schlüssel = HMAC-SHA256(haupt, "zeitblick-mac"),
//   Schlüssel-Kennung = die ersten 4 Bytes von HMAC-SHA256(haupt, "zeitblick-id") als Hex (verrät den Schlüssel nicht).
//   Umschlag je Datei: {"zb":4,"alg":"A256CBC-HS256","sid":…,"iv":…,"ct":…,"mac":…} (Base64),
//   mac = HMAC(MAC-Schlüssel, "zb4|<sammlung>|" + iv + ct) – bindet den Inhalt an seine Sammlung.
//   Wiederherstellungs-Schlüssel: der Hauptschlüssel in Base32 (A–Z, 2–7), in Vierergruppen zum Aufschreiben.
// Am Laptop liegt der Schlüssel mit Windows-DPAPI geschützt in zugang.json (nur dieses Windows-Konto kann ihn lesen).
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;

namespace Froese.Zeitblick
{
    static class Krypto
    {
        public const string Verfahren = "A256CBC-HS256";
        const string Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

        public static byte[] NeuerSchluessel()
        {
            byte[] b = new byte[32];
            using (RandomNumberGenerator r = RandomNumberGenerator.Create()) r.GetBytes(b);
            return b;
        }

        static byte[] Ableiten(byte[] haupt, string zweck)
        {
            using (HMACSHA256 h = new HMACSHA256(haupt)) return h.ComputeHash(Encoding.ASCII.GetBytes(zweck));
        }

        public static string SchluesselId(byte[] haupt)
        {
            byte[] h = Ableiten(haupt, "zeitblick-id");
            return BitConverter.ToString(h, 0, 4).Replace("-", "").ToLowerInvariant();
        }

        static byte[] Mac(byte[] macKey, string sammlung, byte[] iv, byte[] ct)
        {
            byte[] kopf = Encoding.UTF8.GetBytes("zb4|" + sammlung + "|");
            byte[] alles = new byte[kopf.Length + iv.Length + ct.Length];
            Buffer.BlockCopy(kopf, 0, alles, 0, kopf.Length);
            Buffer.BlockCopy(iv, 0, alles, kopf.Length, iv.Length);
            Buffer.BlockCopy(ct, 0, alles, kopf.Length + iv.Length, ct.Length);
            using (HMACSHA256 h = new HMACSHA256(macKey)) return h.ComputeHash(alles);
        }

        public static string Verschluesseln(byte[] haupt, string sammlung, string klartext)
        {
            byte[] aesKey = Ableiten(haupt, "zeitblick-aes"), macKey = Ableiten(haupt, "zeitblick-mac");
            byte[] iv, ct;
            using (Aes aes = Aes.Create())
            {
                aes.Key = aesKey;
                aes.Mode = CipherMode.CBC;
                aes.Padding = PaddingMode.PKCS7;
                aes.GenerateIV();
                iv = aes.IV;
                byte[] klar = Datei.Utf8.GetBytes(klartext);
                using (ICryptoTransform t = aes.CreateEncryptor()) ct = t.TransformFinalBlock(klar, 0, klar.Length);
            }
            Dictionary<string, object> u = new Dictionary<string, object>();
            u["zb"] = 4;
            u["alg"] = Verfahren;
            u["sid"] = SchluesselId(haupt);
            u["iv"] = Convert.ToBase64String(iv);
            u["ct"] = Convert.ToBase64String(ct);
            u["mac"] = Convert.ToBase64String(Mac(macKey, sammlung, iv, ct));
            return Json.Schreiben(u);
        }

        public static bool IstUmschlag(string text)
        {
            Dictionary<string, object> u = null;
            try { u = Json.Objekt(text); } catch { }
            return u != null && Json.Zahl(u, "zb", 0) == 4 && Json.Text(u, "ct").Length > 0;
        }

        /// <summary>Entschlüsselt einen Umschlag. Falscher Schlüssel oder veränderter Inhalt → Ausnahme, nie Datenmüll.</summary>
        public static string Entschluesseln(byte[] haupt, string sammlung, string umschlag)
        {
            Dictionary<string, object> u = Json.Objekt(umschlag);
            if (u == null || Json.Zahl(u, "zb", 0) != 4) throw new CryptographicException("Keine verschlüsselte Zeitblick-Datei.");
            if (Json.Text(u, "alg") != Verfahren) throw new CryptographicException("Unbekanntes Verfahren: " + Json.Text(u, "alg"));
            if (Json.Text(u, "sid") != SchluesselId(haupt)) throw new CryptographicException("Der Sync-Schlüssel passt nicht zu diesem Speicher.");
            byte[] iv = Convert.FromBase64String(Json.Text(u, "iv")), ct = Convert.FromBase64String(Json.Text(u, "ct"));
            byte[] mac = Convert.FromBase64String(Json.Text(u, "mac"));
            byte[] soll = Mac(Ableiten(haupt, "zeitblick-mac"), sammlung, iv, ct);
            if (!GleichZeitkonstant(mac, soll)) throw new CryptographicException("Prüfsumme falsch: Datei verändert oder falscher Schlüssel.");
            using (Aes aes = Aes.Create())
            {
                aes.Key = Ableiten(haupt, "zeitblick-aes");
                aes.IV = iv;
                aes.Mode = CipherMode.CBC;
                aes.Padding = PaddingMode.PKCS7;
                using (ICryptoTransform t = aes.CreateDecryptor())
                {
                    byte[] klar = t.TransformFinalBlock(ct, 0, ct.Length);
                    return Datei.Utf8.GetString(klar);
                }
            }
        }

        static bool GleichZeitkonstant(byte[] a, byte[] b)
        {
            if (a.Length != b.Length) return false;
            int d = 0;
            for (int i = 0; i < a.Length; i++) d |= a[i] ^ b[i];
            return d == 0;
        }

        // ---------- Wiederherstellungs-Schlüssel ----------

        public static string AlsText(byte[] haupt)
        {
            StringBuilder b = new StringBuilder();
            int puffer = 0, bits = 0;
            foreach (byte x in haupt)
            {
                puffer = (puffer << 8) | x; bits += 8;
                while (bits >= 5) { b.Append(Alphabet[(puffer >> (bits - 5)) & 31]); bits -= 5; }
            }
            if (bits > 0) b.Append(Alphabet[(puffer << (5 - bits)) & 31]);
            StringBuilder g = new StringBuilder();
            for (int i = 0; i < b.Length; i++) { if (i > 0 && i % 4 == 0) g.Append('-'); g.Append(b[i]); }
            return g.ToString();
        }

        public static byte[] AusText(string text)
        {
            string t = new string((text ?? "").ToUpperInvariant().Where(c => Alphabet.IndexOf(c) >= 0).ToArray());
            if (t.Length != 52) throw new NutzerFehler(400, "Der Wiederherstellungs-Schlüssel hat 52 Zeichen (13 Vierergruppen).");
            List<byte> l = new List<byte>();
            int puffer = 0, bits = 0;
            foreach (char c in t)
            {
                puffer = (puffer << 5) | Alphabet.IndexOf(c); bits += 5;
                if (bits >= 8) { l.Add((byte)((puffer >> (bits - 8)) & 255)); bits -= 8; }
            }
            if (l.Count < 32) throw new NutzerFehler(400, "Der Wiederherstellungs-Schlüssel ist unvollständig.");
            return l.Take(32).ToArray();
        }

        // ---------- Windows-DPAPI ----------

        public static string Schuetzen(byte[] klar)
        {
            return Convert.ToBase64String(ProtectedData.Protect(klar, Encoding.ASCII.GetBytes("Froese.Zeitblick"), DataProtectionScope.CurrentUser));
        }

        public static byte[] Oeffnen(string geschuetzt)
        {
            return ProtectedData.Unprotect(Convert.FromBase64String(geschuetzt), Encoding.ASCII.GetBytes("Froese.Zeitblick"), DataProtectionScope.CurrentUser);
        }

        // ---------- Werkzeug ----------

        /// <summary>Zeitblick.exe --entschluesseln &lt;Datei&gt; &lt;Zieldatei&gt; &lt;Wiederherstellungs-Schlüssel&gt;
        /// Macht eine verschlüsselte Gist-Datei (zb4-…json) ohne laufenden Kern wieder lesbar.</summary>
        public static int EntschluesselnBefehl(string[] args)
        {
            try
            {
                if (args.Length < 4) throw new ArgumentException("Aufruf: Zeitblick.exe --entschluesseln <zb4-sammlung.json> <ziel.json> <Wiederherstellungs-Schlüssel>");
                string quelle = args[1], ziel = args[2];
                byte[] k = AusText(args[3]);
                string name = Path.GetFileNameWithoutExtension(quelle);
                string sammlung = name.StartsWith("zb4-") ? name.Substring(4) : name;
                File.WriteAllText(ziel, Entschluesseln(k, sammlung, File.ReadAllText(quelle)), Datei.Utf8);
                return 0;
            }
            catch (Exception e)
            {
                System.Windows.Forms.MessageBox.Show(e.Message, "Zeitblick", System.Windows.Forms.MessageBoxButtons.OK, System.Windows.Forms.MessageBoxIcon.Warning);
                return 1;
            }
        }
    }
}
