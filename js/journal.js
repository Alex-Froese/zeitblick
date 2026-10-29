// Tägliches Journal: eine Notiz vom Typ „Journal“ je Tag (jday = JJJJ-MM-TT)
import * as C from './core.js';
import * as S from './store.js';

export function journalTitle(key) { const d = C.parseYmd(key); return `Journal ${C.WD_LONG[C.wdIdx(d)]}, ${C.pad(d.getDate())}.${C.pad(d.getMonth() + 1)}.${d.getFullYear()}`; }
export function journalNote(key) { return S.notes(n => n.kind === 'journal' && n.jday === key)[0] || null; }
export function ensureJournal(key) {
  const ex = journalNote(key);
  if (ex) return ex;
  return S.put('notes', { title: journalTitle(key), body: '', kind: 'journal', jday: key, area: 'p', tags: [] });
}
/** Abschnitt ins Journal schreiben (ersetzt einen gleichnamigen Abschnitt) */
export function writeSection(key, heading, text) {
  const n = ensureJournal(key);
  const body = String(n.body || '');
  const h = `## ${heading}`;
  const clean = String(text || '').trim();
  const re = new RegExp(`(^|\\n)## ${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n[\\s\\S]*?(?=\\n## |$)`);
  let next;
  if (re.test(body)) next = body.replace(re, clean ? `$1${h}\n${clean}\n` : '$1');
  else next = clean ? (body.trim() ? body.trimEnd() + '\n\n' : '') + `${h}\n${clean}\n` : body;
  return S.put('notes', { ...n, body: next.replace(/\n{3,}/g, '\n\n') });
}
export function journalDays(limit = 400) { return S.notes(n => n.kind === 'journal' && n.jday).sort((a, b) => b.jday.localeCompare(a.jday)).slice(0, limit); }
