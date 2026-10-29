// Beispieldaten zum Ausprobieren (lassen sich in den Einstellungen mit einem Klick wieder entfernen)
import * as C from './core.js';
import * as S from './store.js';
import { journalTitle } from './journal.js';

const COLS = ['tasks', 'events', 'focus', 'cats', 'life', 'goals', 'projects', 'people', 'habits', 'notes', 'inbox', 'reviews'];

export function hasDemo() {
  const d = S.getData();
  return COLS.some(c => Object.values(d[c] || {}).some(x => x && !x.deleted && x.demo));
}

export function removeDemo() {
  const d = S.getData();
  let n = 0;
  for (const c of COLS) for (const x of Object.values(d[c] || {})) if (x && !x.deleted && x.demo) { S.purge(c, x.id); n++; }
  return n;
}

export function seedDemo(now = new Date()) {
  const day = n => C.ymd(C.addDays(now, n));
  const at = (n, t) => C.fmtLocal(C.setTime(C.addDays(C.startOfDay(now), n), t));
  const ago = (days, h = 10) => C.setTime(C.addDays(C.startOfDay(now), -days), `${h}:00`).getTime();
  const put = (col, o) => S.put(col, { demo: true, ...o }, { silent: true });

  // Lebensbereiche
  const L = {};
  [['ges', 'Gesundheit & Körper', '🫀', 7], ['kar', 'Ausbildung & Karriere', '🎓', 6], ['unt', 'Unternehmen', '🏢', 6], ['par', 'Partnerschaft', '❤️', 8], ['fam', 'Familie & Freunde', '👪', 5], ['fin', 'Finanzen', '💶', 4], ['ent', 'Persönliche Entwicklung', '🌱', 7]].forEach(([k, n, ic, v], i) => {
    L[k] = put('life', { name: n, icon: ic, desc: '', order: i, ratings: [{ d: day(-14), v: Math.max(1, v - 1) }, { d: day(-7), v }] }).id;
  });

  // Kategorien (aus den Vorschlägen)
  const K = {};
  const cat = (key, name, area, life) => { const sg = [...C.SUGGESTED_CATS.p, ...C.SUGGESTED_CATS.b].find(x => x[0] === name) || [name, '', '#616161']; K[key] = put('cats', { name, icon: sg[1], color: sg[2], area, life, order: Object.keys(K).length }).id; };
  cat('sport', 'Sport', 'p', L.ges); cat('hyg', 'Hygiene', 'p', L.ges); cat('part', 'Partnerschaft', 'p', L.par); cat('fam', 'Familie', 'p', L.fam);
  cat('aus', 'Ausbildung', 'p', L.kar); cat('fin', 'Finanzen', 'p', L.fin); cat('frei', 'Freizeit', 'p', L.ent); cat('haus', 'Haushalt', 'p', null);
  cat('vert', 'Vertrieb', 'b', L.unt); cat('mark', 'Marketing', 'b', L.unt); cat('auf', 'Aufträge', 'b', L.unt); cat('buch', 'Buchhaltung', 'b', L.unt); cat('web', 'Website & SEO', 'b', L.unt);

  // Personen
  const P = {};
  P.frau = put('people', { name: 'Meine Frau', rel: 'Ehefrau', area: 'p', birthday: C.ymd(C.addDays(now, 19)).slice(5), rhythm: 1, lastContact: day(0), important: true, notes: 'Will gehört werden, nicht gleich Lösungen. Freut sich über kleine Überraschungen und gemeinsame Zeit ohne Handy.', log: [C.logEntry('Schönes Gespräch beim Spaziergang über den Urlaub.', 'contact', ago(2, 20))] }).id;
  P.bruder = put('people', { name: 'Jonas', rel: 'Bruder', area: 'p', rhythm: 14, lastContact: day(-20), notes: '', log: [] }).id;
  P.mama = put('people', { name: 'Mama', rel: 'Mutter', area: 'p', rhythm: 7, lastContact: day(-5), birthday: '1968-' + C.ymd(C.addDays(now, 60)).slice(5), log: [] }).id;
  P.weber = put('people', { name: 'Dr. Weber', rel: 'Kundin', area: 'b', rhythm: 30, lastContact: day(-12), notes: 'Praxis, Fensterreinigung monatlich. Bevorzugt E-Mail.', log: [] }).id;

  // Ziele
  const G = {};
  G.kunden = put('goals', { title: '10 feste Reinigungskunden bis Jahresende', why: 'Damit das Unternehmen sicher trägt.', area: 'b', life: L.unt, status: 'aktiv', mode: 'number', startVal: 3, current: 6, target: 10, unit: 'Kunden', deadline: C.ymd(new Date(now.getFullYear(), 11, 31)), log: [C.logEntry('Stand: 6 Kunden', 'system', ago(4))] }).id;
  G.fit = put('goals', { title: 'Fit in den Sommer', why: 'Mehr Energie im Alltag.', area: 'p', life: L.ges, status: 'aktiv', mode: 'milestones', milestones: [{ id: 'm1', t: '3× pro Woche trainieren – 4 Wochen am Stück', d: true }, { id: 'm2', t: '5 km unter 30 Minuten', d: false }, { id: 'm3', t: 'Zucker unter der Woche weglassen', d: false }], log: [] }).id;
  G.pruef = put('goals', { title: 'Abschlussprüfung mit „gut“ bestehen', area: 'p', life: L.kar, status: 'aktiv', mode: 'linked', log: [] }).id;

  // Projekte
  const PR = {};
  PR.web = put('projects', { title: 'Website neu', desc: 'Neue Website mit Leistungen, Preisen und Kontaktformular.', area: 'b', cat: K.web, life: L.unt, goal: G.kunden, status: 'aktiv', due: day(21), log: [C.logEntry('Domain und Hosting stehen.', 'note', ago(6))] }).id;
  PR.pruef = put('projects', { title: 'Prüfungsvorbereitung', desc: 'Lernplan bis zur Abschlussprüfung.', area: 'p', cat: K.aus, life: L.kar, goal: G.pruef, status: 'aktiv', due: day(40), log: [] }).id;

  // Vorgänge
  let no = S.nextTicketNo();
  const T = (o) => put('tasks', { type: 'aufgabe', status: 'neu', prio: 3, imp: false, urg: false, autoUrg: true, esc: true, subs: [], people: [], log: [], no: no++, createdAt: ago(5), ...o });
  const t1 = T({ title: 'Angebot für Praxis Dr. Weber erstellen', area: 'b', cat: K.vert, prio: 1, imp: true, due: day(1), dueTime: '15:00', dur: 60, people: [P.weber], status: 'aktiv', notes: 'Fensterreinigung, monatlich. Ansprechpartnerin: Frau Dr. Weber.', subs: [{ id: 's1', t: 'Flächen aus Besichtigung übernehmen', d: true }, { id: 's2', t: 'Pauschalpreis kalkulieren', d: false }, { id: 's3', t: 'PDF senden', d: false }], log: [C.logEntry('Besichtigung war gut, sie will bis Freitag ein Angebot.', 'note', ago(2, 17))] });
  T({ title: 'Rechnung Unterhaltsreinigung Oktober schreiben', area: 'b', cat: K.buch, prio: 2, imp: true, due: day(-1), dueTime: '18:00', createdAt: ago(9) });
  T({ title: 'Google-Profil: fünf Vorher-nachher-Fotos hochladen', area: 'b', cat: K.mark, prio: 3, imp: true, due: day(5), dur: 30 });
  T({ title: 'Kaltakquise: zehn Büros anrufen', area: 'b', cat: K.vert, prio: 2, imp: true, due: day(3), dueTime: '17:00', dur: 90, goal: G.kunden, rec: { f: 'w', i: 1, wd: [C.wdIdx(C.addDays(now, 3))] } });
  T({ title: 'Glasreiniger und Abzieher nachbestellen', area: 'b', cat: K.auf, prio: 3, urg: true, due: day(2), status: 'wartet', delegate: 'Lieferant' });
  T({ title: 'Startseite texten', area: 'b', cat: K.web, project: PR.web, prio: 2, imp: true, dur: 90 });
  T({ title: 'Kontaktformular testen', area: 'b', cat: K.web, project: PR.web, prio: 3, imp: true });
  const wdone = T({ title: 'Domain registrieren', area: 'b', cat: K.web, project: PR.web, prio: 3, imp: true });
  T({ title: 'Lernplan für die nächsten 6 Wochen', area: 'p', cat: K.aus, project: PR.pruef, goal: G.pruef, prio: 2, imp: true, due: day(2), dur: 45 });
  T({ title: 'Berichtsheft für diese Woche schreiben', area: 'p', cat: K.aus, prio: 1, imp: true, urg: true, due: day(0), dueTime: '20:00', dur: 30 });
  T({ title: 'Steuerunterlagen sortieren', area: 'p', cat: K.fin, prio: 2, imp: true, due: day(-3), createdAt: ago(14) });
  T({ title: 'Paket zur Post bringen', area: 'p', cat: K.haus, prio: 3, urg: true, due: day(1), dur: 15 });
  T({ title: 'Date-Night planen', area: 'p', cat: K.part, prio: 2, imp: true, due: day(3), people: [P.frau] });
  T({ title: 'Mit Jonas den Streit vom Wochenende klären', type: 'klaerung', area: 'p', cat: K.fam, prio: 2, imp: true, people: [P.bruder], notes: 'Ruhig bleiben, erst zuhören. Nicht am Telefon, lieber persönlich.', log: [C.logEntry('Hab ihm geschrieben, ob wir uns Sonntag sehen.', 'note', ago(1, 19))] });
  T({ title: 'Bei meiner Frau zuhören, statt gleich Lösungen anzubieten', type: 'vorsatz', area: 'p', cat: K.part, prio: 2, imp: true, esc: false, people: [P.frau] });
  T({ title: 'Zahnseide', area: 'p', cat: K.hyg, prio: 3, imp: true, due: day(0), dueTime: '21:30', rec: { f: 'd', i: 1 }, hist: [day(-5), day(-4), day(-3), day(-2), day(-1)], dur: 5 });
  T({ title: 'Wochenplanung mit Leerraum', area: 'b', cat: K.vert, prio: 2, imp: true, due: day(((6 - C.wdIdx(now)) + 7) % 7), dueTime: '18:00', dur: 45, rec: { f: 'w', i: 1 } });
  const closed1 = T({ title: 'Fahrzeug zur Inspektion anmelden', area: 'b', cat: K.auf, prio: 3, imp: true, due: day(-1), createdAt: ago(6) });
  S.put('tasks', { ...C.completeTask(S.task(closed1.id), new Date(ago(1, 11))), demo: true }, { silent: true });
  S.put('tasks', { ...C.completeTask(S.task(wdone.id), new Date(ago(3, 15))), demo: true }, { silent: true });
  const closed2 = T({ title: 'Alte Visitenkarten aufbrauchen', area: 'b', cat: K.mark, prio: 4, createdAt: ago(12) });
  S.put('tasks', { ...C.setStatus(S.task(closed2.id), 'verworfen', new Date(ago(2, 9))), demo: true }, { silent: true });

  // Termine und Zeitblöcke
  const E = (o) => put('events', { rem: null, loc: '', notes: '', ...o });
  const wd = n => ((n - C.wdIdx(now)) + 7) % 7;
  E({ title: 'Berufsschule', area: 'p', cat: K.aus, s: at(-30, '07:30'), e: at(-30, '15:15'), rec: { f: 'w', i: 1, wd: [3] }, rem: [] });
  E({ title: 'Besichtigung Büro Schmidt', area: 'b', cat: K.auf, s: at(1, '17:00'), e: at(1, '18:00'), loc: 'Teningen' });
  E({ title: 'Fensterreinigung Praxis Müller', area: 'b', cat: K.auf, s: at(2, '08:30'), e: at(2, '11:00'), loc: 'Emmendingen' });
  E({ title: 'Abendessen mit Freunden', area: 'p', cat: K.frei, s: at(wd(4) || 7, '19:00'), e: at(wd(4) || 7, '22:00') });
  E({ title: 'Gym', area: 'p', cat: K.sport, s: at(-14, '18:30'), e: at(-14, '19:45'), rec: { f: 'w', i: 1, wd: [0, 2, 4] } });
  E({ title: 'Zeit zu zweit (ohne Handy)', area: 'p', cat: K.part, s: at(wd(5), '15:00'), e: at(wd(5), '18:00') });
  E({ title: t1.title, area: 'b', cat: K.vert, s: at(0, '10:00'), e: at(0, '11:00'), taskId: t1.id });
  S.put('tasks', { ...C.addLog(S.task(t1.id), `Eingeplant: ${C.fmtDateShort(now)}, 10:00–11:00 Uhr`, 'system', ago(1, 9)), demo: true }, { silent: true });

  // Gewohnheiten, Routinen, Grenzen
  const logOf = (fn) => { const o = {}; for (let i = 1; i <= 21; i++) { const v = fn(i, C.addDays(now, -i)); if (v !== undefined) o[day(-i)] = v; } return o; };
  const mr = put('habits', { title: 'Morgenroutine', kind: 'routine', color: '#33b679', freq: { type: 'daily' }, time: '04:50', area: 'p', life: L.ges, note: 'Ruhig in den Tag, bevor die Ausbildung startet.', steps: [{ id: 'r1', t: 'Glas Wasser', min: 2, body: 'Ein großes Glas, langsam trinken.' }, { id: 'r2', t: 'Stretching', min: 8, body: 'Nacken, Schultern, Hüfte – je 1 Minute.', link: '' }, { id: 'r3', t: 'Duschen & anziehen', min: 15 }, { id: 'r4', t: 'Frühstück', min: 15 }, { id: 'r5', t: 'Heute ansehen: die 3 wichtigsten Dinge', min: 5, body: 'Tagesring, Termine, Q1 – was zählt heute wirklich?' }, { id: 'r6', t: 'Tasche packen, los', min: 5 }], log: logOf(i => i % 6 === 0 ? ['r1', 'r2'] : ['r1', 'r2', 'r3', 'r4', 'r5', 'r6']), runs: [...Array(10)].map((_, i) => ({ d: day(-i - 1), at: ago(i + 1, 6), dur: 2700 + (i % 4) * 240, steps: 6 })), order: 0 });
  put('habits', { title: 'Abendroutine', kind: 'routine', color: '#14a38b', freq: { type: 'daily' }, time: '21:15', area: 'p', life: L.ges, steps: [{ id: 'a1', t: 'Handy weglegen', min: 1 }, { id: 'a2', t: 'Zähne & Zahnseide', min: 5 }, { id: 'a3', t: 'Kleidung für morgen', min: 4 }, { id: 'a4', t: '10 Minuten lesen', min: 10 }], log: logOf(i => i % 5 === 0 ? undefined : ['a1', 'a2', 'a3', 'a4']), order: 1 });
  E({ title: 'Morgenroutine', area: 'p', color: '#33b679', s: at(-7, '04:50'), e: at(-7, '06:10'), rec: { f: 'w', i: 1, wd: [0, 1, 2, 3, 4] }, rem: [], link: { c: 'habits', id: mr.id } });
  E({ title: 'Business: Vertrieb', area: 'b', theme: true, color: '#1b4f72', s: at(-7, '16:50'), e: at(-7, '19:00'), rec: { f: 'w', i: 1, wd: [3] }, rem: [] });
  put('habits', { title: 'Training', kind: 'check', freq: { type: 'week', times: 3 }, area: 'p', cat: K.sport, life: L.ges, log: logOf((i, d) => [0, 2, 4].includes(C.wdIdx(d)) && i !== 9 ? true : undefined), order: 1 });
  put('habits', { title: 'Handyzeit', kind: 'limit', target: 60, unit: 'Min', freq: { type: 'daily' }, time: '21:30', area: 'p', life: L.ent, note: 'Mehr Zeit für meine Frau und für mich.', log: logOf(i => [45, 70, 55, 40, 90, 50, 35][i % 7]), order: 2 });
  put('habits', { title: 'Wasser trinken', kind: 'count', target: 8, unit: 'Gläser', freq: { type: 'daily' }, area: 'p', life: L.ges, log: logOf(i => [8, 6, 9, 8, 5, 8, 7][i % 7]), order: 3 });
  put('habits', { title: '20 Minuten lesen', kind: 'check', freq: { type: 'days', days: [0, 1, 2, 3, 4] }, area: 'p', life: L.ent, log: logOf((i, d) => C.wdIdx(d) < 5 && i % 4 !== 0 ? true : undefined), order: 4 });

  // Notizen (eine mit Lese-Rhythmus zum Einprägen)
  put('notes', { title: 'Wie ich mit meiner Frau sprechen will', body: 'Erst zuhören, dann nachfragen: „Was brauchst du gerade?“\nKeine Lösungen, wenn sie nur erzählen will.\nJeden Tag eine kleine Aufmerksamkeit.\nStreit nie per Nachricht klären.', area: 'p', life: L.par, tags: ['Partnerschaft', 'Vorsatz'], pinned: true, read: { on: true, mode: 'times', times: ['08:00', '18:00'], every: 2, from: '08:00', to: '21:00', days: null, push: true }, reads: { [day(-1)]: 2, [day(-2)]: 1 } });
  const preis = put('notes', { title: 'Preisliste Reinigung (Stand)', kind: 'wissen', body: 'Fenster: ab 2,80 €/m²\nUnterhaltsreinigung Büro: 26 €/Std\nAnfahrt bis 15 km frei', area: 'b', life: L.unt, tags: ['Preise'] });
  put('notes', { title: 'Reflexion: was diese Woche gut lief', kind: 'reflexion', body: 'Zwei neue Anfragen über das Google-Profil. Morgenroutine fast jeden Tag geschafft. Zu viel am Handy am Wochenende.', area: 'p', life: L.ent, tags: ['Reflexion'] });
  const idee = put('notes', { title: 'Idee: Winter-Paket für Praxen', kind: 'idee', body: 'Fenster + Eingangsbereich im Paket, Rabatt bei 6 Monaten Laufzeit.\nFlyer an alle Praxen in Lahr verteilen.', area: 'b', life: L.unt, tags: ['Vertrieb'] });
  put('notes', { title: journalTitle(day(-1)), kind: 'journal', jday: day(-1), body: '## Tagesabschluss\nStimmung: 🙂 · Energie: Gut · In einem Wort: Fokus\n\n**Was lief gut?**\nAngebot vorbereitet, Training geschafft.\n\n**Wofür bist du dankbar?**\nSpaziergang mit meiner Frau.', area: 'p' });
  T({ title: 'Flyer Winter-Paket entwerfen', area: 'b', cat: K.mark, prio: 3, imp: true, fromNote: idee.id, fromQuote: 'Flyer an alle Praxen in Lahr verteilen.', due: day(6) });
  S.put('tasks', { ...C.addLink(S.task(t1.id), 'notes', preis.id), demo: true }, { silent: true });
  T({ title: 'Geschäftliche Mails prüfen', area: 'b', cat: K.vert, prio: 3, imp: false, urg: true, due: day(0), rec: { f: 'w', i: 1, wd: [0, 1, 2, 3, 4] }, multi: { on: true, mode: 'remind', type: 'times', times: ['12:30', '16:30', '19:00'] } });
  T({ title: 'Kurz aufstehen & dehnen', area: 'p', cat: K.sport, prio: 3, imp: true, due: day(0), rec: { f: 'd', i: 1 }, multi: { on: true, mode: 'each', type: 'interval', every: 2, from: '09:00', to: '15:00' } });
  // Rückblicke
  put('reviews', { type: 'day', key: day(-1), date: day(-1), done: true, startedAt: ago(1, 21), doneAt: ago(1, 21) + 11 * C.MIN, word: 'Fokus', data: { mood: 4, energy: 4, word: 'Fokus', good: 'Angebot vorbereitet, Training geschafft.', thanks: 'Spaziergang mit meiner Frau.' } });
  put('reviews', { type: 'day', key: day(-2), date: day(-2), done: true, startedAt: ago(2, 21), doneAt: ago(2, 21) + 9 * C.MIN, word: 'zäh', data: { mood: 3, energy: 2, word: 'zäh' } });

  // Inbox
  put('inbox', { text: 'Idee: Rabatt für Stammkunden im Winter', prio: 3, createdAt: ago(3) });
  put('inbox', { text: 'Mama wegen Weihnachten fragen', prio: 2, createdAt: ago(5) });
  put('inbox', { text: 'Autoversicherung vergleichen', prio: 1, createdAt: ago(2) });

  // Fokus-Verlauf
  const fc = [K.vert, K.mark, K.web, K.aus, K.buch];
  let seed = 7;
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  for (let d = 20; d >= 1; d--) {
    const n = Math.floor(rnd() * 4);
    for (let i = 0; i < n; i++) {
      const start = C.setTime(C.addDays(C.startOfDay(now), -d), `${16 + i * 2}:${rnd() < 0.5 ? '00' : '30'}`).getTime();
      const plan = rnd() < 0.3 ? 50 : 25;
      const ok = rnd() > 0.12;
      const min = ok ? plan : Math.round(plan * rnd());
      const c = fc[Math.floor(rnd() * fc.length)];
      put('focus', { s: start, e: start + min * C.MIN, plan, min, ok, cat: c, area: S.cat(c) ? S.cat(c).area : 'p', mode: 'timer' });
    }
  }
  S.touch({ local: true, many: true, col: 'tasks' });
}


/* ---------------- Beispiel-Vorlagen (einmalig, frei anpassbar; nichts wird in den Kalender eingetragen) ---------------- */
const COL = { sleep: '#616161', mr: '#33b679', ar: '#14a38b', commute: '#9aa1a9', work: '#3f51b5', meal: '#f6bf26', school: '#8e24aa', biz: '#1b4f72', two: '#e67c73', review: '#039be5', free: '#0b8043' };
const B = (s, e, title, color, o = {}) => ({ s, e, title, color, area: 'p', ...o });
const evening = (sleepTo = '04:50', sleepFrom = '21:45') => [B('19:00', '19:30', 'Abendessen', COL.meal), B('19:30', '21:00', 'Zeit zu zweit / Freizeit', COL.two), B('21:00', '21:15', 'Tagesabschluss', COL.review), B('21:15', sleepFrom, 'Abendroutine', COL.ar, { linkName: 'Abendroutine' }), B(sleepFrom, sleepTo, 'Schlaf', COL.sleep)];
const biz = (theme, from = '16:50') => B(from, '19:00', `Business: ${theme}`, COL.biz, { area: 'b', theme: true });
export const DAY_TPL = {
  ausbildung: (theme = 'Selbstständigkeit') => [B('04:50', '06:10', 'Morgenroutine', COL.mr, { linkName: 'Morgenroutine', rem: true }), B('06:10', '06:40', 'Pendeln nach Herbolzheim', COL.commute), B('06:40', '08:30', 'Ausbildung Prodinger', COL.work), B('08:30', '08:45', 'Mahlzeit 1', COL.meal), B('08:45', '13:00', 'Ausbildung Prodinger', COL.work), B('13:00', '13:30', 'Mittagspause', COL.meal), B('13:30', '16:15', 'Ausbildung Prodinger', COL.work), B('16:15', '16:50', 'Zug nach Lahr + Schritte', COL.commute), biz(theme), ...evening()],
  schule: (theme = 'Selbstständigkeit') => [B('04:50', '06:10', 'Morgenroutine', COL.mr, { linkName: 'Morgenroutine', rem: true }), B('06:20', '07:20', 'Pendeln zur Berufsschule', COL.commute), B('07:30', '13:00', 'Berufsschule', COL.school), B('13:00', '13:45', 'Mittagspause', COL.meal), B('13:45', '15:15', 'Berufsschule', COL.school), B('15:15', '16:15', 'Heimweg + Lernen', COL.commute), biz(theme, '16:30'), ...evening()],
  frei: () => [B('07:00', '08:00', 'Morgenroutine', COL.mr, { linkName: 'Morgenroutine' }), B('08:00', '09:00', 'Frühstück', COL.meal), B('09:00', '12:00', 'Erledigungen & eigene Projekte', COL.free), B('12:00', '13:00', 'Mittagessen', COL.meal), B('14:00', '18:00', 'Familie & Freunde', COL.two), B('19:00', '21:00', 'Zeit zu zweit', COL.two), B('21:30', '21:45', 'Tagesabschluss', COL.review), B('21:45', '22:30', 'Abendroutine', COL.ar, { linkName: 'Abendroutine' }), B('22:30', '07:00', 'Schlaf', COL.sleep)],
  wochenende: (sunday = false) => [B('07:00', '08:00', 'Morgenroutine', COL.mr, { linkName: 'Morgenroutine' }), B('08:00', '09:00', 'Frühstück', COL.meal), ...(sunday ? [] : [B('09:00', '12:00', 'Business: optional', COL.biz, { area: 'b', theme: true })]), B('12:00', '13:00', 'Mittagessen', COL.meal), B('13:00', sunday ? '17:45' : '18:00', 'Freizeit & Familie', COL.free), ...(sunday ? [B('18:00', '18:45', 'Wochenrückblick & Woche planen', COL.review)] : []), B('19:00', '21:00', 'Zeit zu zweit', COL.two), B('21:00', '21:15', 'Tagesabschluss', COL.review), ...(sunday ? [B('21:15', '21:45', 'Abendroutine', COL.ar, { linkName: 'Abendroutine' }), B('21:45', '04:50', 'Schlaf', COL.sleep)] : [B('21:30', '22:15', 'Abendroutine', COL.ar, { linkName: 'Abendroutine' }), B('22:30', '07:00', 'Schlaf', COL.sleep)])],
};
const THEMES = ['Akquise & Anfragen', 'Aufträge & Planung', 'Marketing & Website', 'Vertrieb', 'Buchhaltung & Verwaltung'];
function weekBlocks(kinds) {
  const out = [];
  kinds.forEach((k, d) => { const list = k === 'schule' ? DAY_TPL.schule(THEMES[d]) : k === 'ausbildung' ? DAY_TPL.ausbildung(THEMES[d]) : k === 'sa' ? DAY_TPL.wochenende(false) : DAY_TPL.wochenende(true); list.forEach((b, i) => out.push({ ...b, id: `b${d}${i}`, d })); });
  return out;
}
export function exampleTemplates() {
  const withIds = (list, p) => list.map((b, i) => ({ ...b, id: `${p}${i}`, d: 0 }));
  return [
    { id: 'tpl-a', kind: 'week', name: 'A-Woche', note: 'Berufsschule Montag und Donnerstag', order: 0, example: true, blocks: weekBlocks(['schule', 'ausbildung', 'ausbildung', 'schule', 'ausbildung', 'sa', 'so']) },
    { id: 'tpl-b', kind: 'week', name: 'B-Woche', note: 'Berufsschule nur Donnerstag', order: 1, example: true, blocks: weekBlocks(['ausbildung', 'ausbildung', 'ausbildung', 'schule', 'ausbildung', 'sa', 'so']) },
    { id: 'tpl-f', kind: 'week', name: 'Ferienwoche', note: 'Schulferien: Ausbildung ohne Berufsschule', order: 2, example: true, blocks: weekBlocks(['ausbildung', 'ausbildung', 'ausbildung', 'ausbildung', 'ausbildung', 'sa', 'so']) },
    { id: 'tpl-d-aus', kind: 'day', name: 'Ausbildungstag', note: 'Prodinger 06:40–16:15, danach Business', order: 3, example: true, blocks: withIds(DAY_TPL.ausbildung(), 'da') },
    { id: 'tpl-d-sch', kind: 'day', name: 'Schultag', note: 'Berufsschule, danach Business', order: 4, example: true, blocks: withIds(DAY_TPL.schule(), 'ds') },
    { id: 'tpl-d-frei', kind: 'day', name: 'Freier Tag', note: 'Urlaub oder Feiertag', order: 5, example: true, blocks: withIds(DAY_TPL.frei(), 'df') },
    { id: 'tpl-d-we', kind: 'day', name: 'Wochenende', note: 'Samstag mit optionalem Business-Block', order: 6, example: true, blocks: withIds(DAY_TPL.wochenende(false), 'dw') },
  ];
}

/** Einmalig: Beispiel-Vorlagen, Regeln (A/B aus, Ferien BW) und Beispiel-Ansichten für Vorgänge */
export async function seedTemplates() {
  const d = S.getData();
  if (d.meta && d.meta.seed3 && !d.meta.seed3.deleted) return;
  for (const t of exampleTemplates()) if (!d.templates[t.id]) S.put('templates', t, { silent: true });
  const cal = S.settings().cal || {};
  const { BW_HOLIDAYS } = await import('./views/calendar-tpl.js');
  const patch = { ...cal, ab: { on: false, anchor: '', ...(cal.ab || {}), a: (cal.ab && cal.ab.a) || 'tpl-a', b: (cal.ab && cal.ab.b) || 'tpl-b' }, holidayTpl: cal.holidayTpl || 'tpl-f', holidays: (cal.holidays && cal.holidays.length) ? cal.holidays : BW_HOLIDAYS.map(h => ({ ...h })) };
  S.setSettingPath('cal', patch);
  if (!S.vgViews().length) { const { DEFAULT_VIEWS } = await import('./views/vorgaenge.js'); S.setVgViews(DEFAULT_VIEWS); }
  S.put('meta', { id: 'seed3', at: Date.now() });
}
