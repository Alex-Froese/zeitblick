// Beispieldaten zum Ausprobieren (lassen sich in den Einstellungen wieder entfernen)
import * as C from './core.js';
import * as S from './store.js';

export function hasDemo() {
  const d = S.getData();
  return ['tasks', 'events', 'focus'].some(c => Object.values(d[c]).some(x => x && !x.deleted && x.demo));
}

export function removeDemo() {
  const d = S.getData();
  let n = 0;
  for (const c of ['tasks', 'events', 'focus']) for (const x of Object.values(d[c])) if (x && !x.deleted && x.demo) { S.remove(c, x.id); n++; }
  return n;
}

export function seedDemo(now = new Date()) {
  const day = n => C.ymd(C.addDays(now, n));
  let no = S.nextTicketNo();
  const T = (o) => S.put('tasks', { prio: 3, imp: false, urg: false, autoUrg: true, esc: true, subs: [], demo: true, no: no++, createdAt: Date.now() - 5 * C.DAY, ...o }, { silent: true });
  const E = (o) => S.put('events', { demo: true, rem: null, ...o }, { silent: true });
  T({ title: 'Angebot für Praxis Dr. Weber erstellen', area: 'b', cat: 'c_ver', prio: 1, imp: true, due: day(1), dueTime: '15:00', dur: 60, notes: 'Fensterreinigung PO 1, monatlich. Ansprechpartnerin: Frau Weber.', subs: [{ id: 's1', t: 'Flächen aus Besichtigung übernehmen', d: true }, { id: 's2', t: 'Pauschalpreis kalkulieren', d: false }, { id: 's3', t: 'PDF senden', d: false }] });
  T({ title: 'Rechnung Unterhaltsreinigung Oktober schreiben', area: 'b', cat: 'c_buc', prio: 2, imp: true, due: day(-1), dueTime: '18:00' });
  T({ title: 'Google-Profil: fünf neue Vorher-nachher-Fotos hochladen', area: 'b', cat: 'c_mar', prio: 3, imp: true, due: day(5) });
  T({ title: 'Kaltakquise: zehn Büros in Emmendingen anrufen', area: 'b', cat: 'c_ver', prio: 2, imp: true, due: day(3), dueTime: '17:00', rec: { f: 'w', i: 1, wd: [C.wdIdx(C.addDays(now, 3))] } });
  T({ title: 'Glasreiniger und Abzieher nachbestellen', area: 'b', cat: 'c_ein', prio: 3, urg: true, due: day(2), delegate: '' });
  T({ title: 'Über-uns-Seite fertig texten', area: 'b', cat: 'c_web', prio: 2, imp: true });
  T({ title: 'Visitenkarten-Entwürfe vergleichen', area: 'b', cat: 'c_mar', prio: 4 });
  T({ title: 'Zahnseide', area: 'p', cat: 'c_hyg', prio: 3, imp: true, due: day(0), dueTime: '21:30', rec: { f: 'd', i: 1 }, hist: [day(-5), day(-4), day(-3), day(-2), day(-1)], dur: 5 });
  T({ title: 'Gym: Oberkörper', area: 'p', cat: 'c_spo', prio: 2, imp: true, due: day(1), dueTime: '18:30', rec: { f: 'w', i: 1, wd: [0, 3] }, dur: 75 });
  T({ title: 'Date-Night planen', area: 'p', cat: 'c_par', prio: 2, imp: true, due: day(3) });
  T({ title: 'Berichtsheft für diese Woche schreiben', area: 'p', cat: 'c_aus', prio: 1, imp: true, urg: true, due: day(0), dueTime: '20:00', dur: 30 });
  T({ title: 'Steuerunterlagen sortieren', area: 'p', cat: 'c_fin', prio: 2, imp: true, due: day(-3) });
  T({ title: 'Paket zur Post bringen', area: 'p', cat: 'c_hau', prio: 3, urg: true, due: day(1) });
  T({ title: 'Serie weiterschauen', area: 'p', cat: 'c_fre', prio: 4 });
  const done = T({ title: 'Fahrzeug zur Inspektion anmelden', area: 'b', cat: 'c_vwa', prio: 3, imp: true, due: day(0) });
  S.put('tasks', { ...done, done: true, doneAt: Date.now() - 2 * C.HOUR }, { silent: true });

  const at = (n, t) => C.fmtLocal(C.setTime(C.addDays(C.startOfDay(now), n), t));
  E({ title: 'Ausbildung', area: 'p', cat: 'c_aus', s: at(-30, '07:30'), e: at(-30, '16:00'), rec: { f: 'w', i: 1, wd: [0, 1, 2, 3, 4] }, rem: [] });
  E({ title: 'Besichtigung Büro Schmidt', area: 'b', cat: 'c_auf', s: at(1, '17:00'), e: at(1, '18:00'), loc: 'Teningen' });
  E({ title: 'Fensterreinigung Praxis Müller', area: 'b', cat: 'c_auf', s: at(2, '16:30'), e: at(2, '18:30'), loc: 'Emmendingen' });
  E({ title: 'Abendessen mit Freunden', area: 'p', cat: 'c_soz', s: at(((5 - C.wdIdx(now)) + 7) % 7 || 7, '19:00'), e: at(((5 - C.wdIdx(now)) + 7) % 7 || 7, '22:00') });
  E({ title: 'Laufen', area: 'p', cat: 'c_spo', s: at(((6 - C.wdIdx(now)) + 7) % 7, '10:00'), e: at(((6 - C.wdIdx(now)) + 7) % 7, '11:00'), rec: { f: 'w', i: 1 } });
  E({ title: 'Wochenplanung', area: 'b', cat: 'c_str', s: at(((6 - C.wdIdx(now)) + 7) % 7, '18:00'), e: at(((6 - C.wdIdx(now)) + 7) % 7, '18:45'), rec: { f: 'w', i: 1 } });

  // Fokus-Verlauf der letzten Tage
  const cats = ['c_ver', 'c_mar', 'c_web', 'c_aus', 'c_buc', 'c_ent'];
  let seed = 7;
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  for (let d = 20; d >= 1; d--) {
    const n = Math.floor(rnd() * 4);
    for (let i = 0; i < n; i++) {
      const start = C.setTime(C.addDays(C.startOfDay(now), -d), `${16 + i * 2}:${rnd() < 0.5 ? '00' : '30'}`).getTime();
      const plan = rnd() < 0.3 ? 50 : 25;
      const ok = rnd() > 0.12;
      const min = ok ? plan : Math.round(plan * rnd());
      const cat = cats[Math.floor(rnd() * cats.length)];
      S.put('focus', { s: start, e: start + min * C.MIN, plan, min, ok, cat, area: S.cat(cat) ? S.cat(cat).area : 'p', mode: 'timer', demo: true }, { silent: true });
    }
  }
  S.touch({ local: true, many: true, col: 'tasks' });
}
