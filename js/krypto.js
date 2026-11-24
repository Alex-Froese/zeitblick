// Zeitblick 4 – Verschlüsselung des Sync-Speichers im Gerät (WebCrypto), gleiches Verfahren wie der Kern (kern/Krypto.cs):
//   AES-256-CBC + HMAC-SHA256. Schlüssel aus dem Hauptschlüssel abgeleitet (HMAC mit „zeitblick-aes“ / „zeitblick-mac“),
//   Kennung = erste 4 Bytes von HMAC(„zeitblick-id“) als Hex. mac = HMAC(MAC-Schlüssel, „zb4|<sammlung>|“ + iv + ct).
//   Umschlag: {"zb":4,"alg":"A256CBC-HS256","sid":…,"iv":…,"ct":…,"mac":…}. Wiederherstellungs-Schlüssel: Base32 in Vierergruppen.
const ALG = 'A256CBC-HS256';
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const enc = new TextEncoder();
const dec = new TextDecoder();
const cs = () => globalThis.crypto && globalThis.crypto.subtle;

export function verfuegbar() { return !!cs(); }

export function neuerSchluessel() { return crypto.getRandomValues(new Uint8Array(32)); }

const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = s => { const b = atob(s); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };

async function hmac(keyBytes, data) {
  const k = await cs().importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await cs().sign('HMAC', k, data));
}
const ableiten = (haupt, zweck) => hmac(haupt, enc.encode(zweck));

const schluesselCache = new Map();
async function schluessel(haupt) {
  const id = b64(haupt);
  if (schluesselCache.has(id)) return schluesselCache.get(id);
  const aesRoh = await ableiten(haupt, 'zeitblick-aes');
  const macRoh = await ableiten(haupt, 'zeitblick-mac');
  const sidRoh = await ableiten(haupt, 'zeitblick-id');
  const k = {
    aes: await cs().importKey('raw', aesRoh, { name: 'AES-CBC' }, false, ['encrypt', 'decrypt']),
    mac: await cs().importKey('raw', macRoh, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']),
    sid: [...sidRoh.slice(0, 4)].map(b => b.toString(16).padStart(2, '0')).join(''),
  };
  schluesselCache.set(id, k);
  return k;
}

export async function schluesselId(haupt) { return (await schluessel(haupt)).sid; }

function macDaten(sammlung, iv, ct) {
  const kopf = enc.encode(`zb4|${sammlung}|`);
  const a = new Uint8Array(kopf.length + iv.length + ct.length);
  a.set(kopf, 0); a.set(iv, kopf.length); a.set(ct, kopf.length + iv.length);
  return a;
}

export async function verschluesseln(haupt, sammlung, klartext) {
  const k = await schluessel(haupt);
  const iv = crypto.getRandomValues(new Uint8Array(16));
  const ct = new Uint8Array(await cs().encrypt({ name: 'AES-CBC', iv }, k.aes, enc.encode(klartext)));
  const mac = new Uint8Array(await cs().sign('HMAC', k.mac, macDaten(sammlung, iv, ct)));
  return JSON.stringify({ zb: 4, alg: ALG, sid: k.sid, iv: b64(iv), ct: b64(ct), mac: b64(mac) });
}

export function istUmschlag(text) {
  try { const u = JSON.parse(text); return !!(u && u.zb === 4 && u.ct); } catch { return false; }
}

function gleich(a, b) { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i]; return d === 0; }

export async function entschluesseln(haupt, sammlung, umschlag) {
  const u = typeof umschlag === 'string' ? JSON.parse(umschlag) : umschlag;
  if (!u || u.zb !== 4) throw new Error('Keine verschlüsselte Zeitblick-Datei.');
  if (u.alg !== ALG) throw new Error('Unbekanntes Verfahren: ' + u.alg);
  const k = await schluessel(haupt);
  if (u.sid !== k.sid) throw new Error('Der Sync-Schlüssel passt nicht zu diesem Speicher.');
  const iv = unb64(u.iv), ct = unb64(u.ct), mac = unb64(u.mac);
  const soll = new Uint8Array(await cs().sign('HMAC', k.mac, macDaten(sammlung, iv, ct)));
  if (!gleich(mac, soll)) throw new Error('Prüfsumme falsch: Datei verändert oder falscher Schlüssel.');
  return dec.decode(await cs().decrypt({ name: 'AES-CBC', iv }, k.aes, ct));
}

// ---------- Wiederherstellungs-Schlüssel ----------

export function alsText(haupt) {
  let out = '', puffer = 0, bits = 0;
  for (const x of haupt) {
    puffer = ((puffer << 8) | x) & 0xffff; bits += 8;
    while (bits >= 5) { out += B32[(puffer >> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(puffer << (5 - bits)) & 31];
  return out.match(/.{1,4}/g).join('-');
}

export function ausText(text) {
  const t = String(text || '').toUpperCase().split('').filter(c => B32.includes(c)).join('');
  if (t.length !== 52) throw new Error('Der Wiederherstellungs-Schlüssel hat 52 Zeichen (13 Vierergruppen).');
  const out = [];
  let puffer = 0, bits = 0;
  for (const c of t) {
    puffer = ((puffer << 5) | B32.indexOf(c)) & 0xffff; bits += 5;
    if (bits >= 8) { out.push((puffer >> (bits - 8)) & 255); bits -= 8; }
  }
  return new Uint8Array(out.slice(0, 32));
}
