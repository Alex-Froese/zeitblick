// Zeitblick – Kernlogik (läuft im Browser und in Node für die GitHub Action)
// Keine DOM-Abhängigkeiten in dieser Datei.

export const APP_VERSION = '1.0.0';
export const DATA_VERSION = 1;
export const COLLECTIONS = ['tasks', 'events', 'cats', 'focus', 'meta'];

/* ------------------------------------------------------------------ */
/* Datum & Zeit (immer lokale Zeit, Strings im Format YYYY-MM-DD[THH:MM]) */
/* ------------------------------------------------------------------ */
export const pad = n => String(n).padStart(2, '0');
export const DAY = 86400000;
export const HOUR = 3600000;
export const MIN = 60000;

export function ymd(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
export function hm(d) { return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
export function parseYmd(s) { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); }
export function parseLocal(s) {
  if (!s) return null;
  const [date, time] = String(s).split('T');
  const [y, m, d] = date.split('-').map(Number);
  let h = 0, mi = 0;
  if (time) { const p = time.split(':').map(Number); h = p[0] || 0; mi = p[1] || 0; }
  return new Date(y, m - 1, d, h, mi);
}
export function fmtLocal(d, withTime = true) { return withTime ? `${ymd(d)}T${hm(d)}` : ymd(d); }
export function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
export function addMinutes(d, n) { return new Date(d.getTime() + n * MIN); }
export function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
export function endOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1); }
export function wdIdx(d) { return (d.getDay() + 6) % 7; } // 0 = Montag
export function startOfWeek(d) { const x = startOfDay(d); return addDays(x, -wdIdx(x)); }
export function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
export function sameDay(a, b) { return a && b && ymd(a) === ymd(b); }
export function daysBetween(a, b) { return Math.round((startOfDay(b) - startOfDay(a)) / DAY); }
export function monthsBetween(a, b) { return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()); }
export function addMonths(d, n) {
  const x = new Date(d.getFullYear(), d.getMonth() + n, 1, d.getHours(), d.getMinutes());
  const last = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate();
  x.setDate(Math.min(d.getDate(), last));
  return x;
}
export function minutesOfDay(d) { return d.getHours() * 60 + d.getMinutes(); }
export function setTime(d, hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h || 0, m || 0);
}

export const WD_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
export const WD_LONG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
export const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
export const MONTHS_SHORT = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sept.', 'Okt.', 'Nov.', 'Dez.'];

export function fmtDateLong(d) { return `${WD_LONG[wdIdx(d)]}, ${d.getDate()}. ${MONTHS[d.getMonth()]}`; }
export function fmtDateShort(d) { return `${WD_SHORT[wdIdx(d)]}, ${d.getDate()}. ${MONTHS_SHORT[d.getMonth()]}`; }
export function fmtDuration(min) {
  min = Math.round(min || 0);
  if (min < 60) return `${min} Min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} Std ${m} Min` : `${h} Std`;
}
export function fmtDurShort(min) {
  min = Math.round(min || 0);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** Relative Beschreibung eines Fälligkeitsdatums ("heute 15:00", "morgen", "überfällig seit 2 T") */
export function fmtDue(due, dueTime, now = new Date()) {
  if (!due) return '';
  const d = parseYmd(due);
  const diff = daysBetween(now, d);
  let day;
  if (diff === 0) day = 'Heute';
  else if (diff === 1) day = 'Morgen';
  else if (diff === 2) day = 'Übermorgen';
  else if (diff === -1) day = 'Gestern';
  else if (diff > 2 && diff < 7) day = WD_LONG[wdIdx(d)];
  else day = `${d.getDate()}. ${MONTHS_SHORT[d.getMonth()]}${d.getFullYear() !== now.getFullYear() ? ' ' + d.getFullYear() : ''}`;
  return dueTime ? `${day}, ${dueTime}` : day;
}

export function fmtRelTime(ms, now = Date.now()) {
  const diff = ms - now; const a = Math.abs(diff);
  const fut = diff > 0;
  let s;
  if (a < MIN) s = 'wenigen Sekunden';
  else if (a < HOUR) { const m = Math.round(a / MIN); s = `${m} Min`; }
  else if (a < DAY) { const h = Math.round(a / HOUR); s = `${h} Std`; }
  else { const d = Math.round(a / DAY); s = d === 1 ? '1 Tag' : `${d} Tagen`; }
  return fut ? `in ${s}` : `vor ${s}`;
}

/* ------------------------------------------------------------------ */
/* IDs                                                                 */
/* ------------------------------------------------------------------ */
const ALPH = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
export function uid(prefix = '', len = 10) {
  let s = '';
  const c = (globalThis.crypto && globalThis.crypto.getRandomValues) ? globalThis.crypto.getRandomValues(new Uint8Array(len)) : null;
  for (let i = 0; i < len; i++) s += ALPH[(c ? c[i] : Math.floor(Math.random() * 256)) % ALPH.length];
  return prefix + s;
}

/* ------------------------------------------------------------------ */
/* Standard-Kategorien & Einstellungen                                  */
/* ------------------------------------------------------------------ */
// Kategoriefarben: validierte kategoriale Palette (Reihenfolge = CVD-sicher benachbart)
export const PALETTE = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];

export const DEFAULT_CATS = [
  // Privat
  { id: 'c_hyg', name: 'Hygiene', icon: '🧼', area: 'p', color: '#1baf7a' },
  { id: 'c_spo', name: 'Sport', icon: '🏋️', area: 'p', color: '#eb6834' },
  { id: 'c_soz', name: 'Soziale Treffen', icon: '👥', area: 'p', color: '#2a78d6' },
  { id: 'c_par', name: 'Partnerschaft', icon: '❤️', area: 'p', color: '#e34948' },
  { id: 'c_ges', name: 'Gesundheit', icon: '🌿', area: 'p', color: '#008300' },
  { id: 'c_hau', name: 'Haushalt', icon: '🏠', area: 'p', color: '#eda100' },
  { id: 'c_fin', name: 'Finanzen', icon: '💶', area: 'p', color: '#6250d6' },
  { id: 'c_aus', name: 'Ausbildung', icon: '🎓', area: 'p', color: '#2a78d6' },
  { id: 'c_ent', name: 'Persönliche Entwicklung', icon: '🧠', area: 'p', color: '#e87ba4' },
  { id: 'c_fre', name: 'Freizeit', icon: '🎮', area: 'p', color: '#1baf7a' },
  // Geschäftlich
  { id: 'c_mar', name: 'Marketing', icon: '📣', area: 'b', color: '#eb6834' },
  { id: 'c_ver', name: 'Vertrieb', icon: '🤝', area: 'b', color: '#2a78d6' },
  { id: 'c_auf', name: 'Aufträge', icon: '🧽', area: 'b', color: '#1baf7a' },
  { id: 'c_buc', name: 'Buchhaltung', icon: '🧾', area: 'b', color: '#6250d6' },
  { id: 'c_vwa', name: 'Verwaltung', icon: '🗂️', area: 'b', color: '#eda100' },
  { id: 'c_web', name: 'Website & SEO', icon: '🌐', area: 'b', color: '#e87ba4' },
  { id: 'c_str', name: 'Strategie', icon: '🧭', area: 'b', color: '#008300' },
  { id: 'c_ein', name: 'Einkauf & Material', icon: '🧴', area: 'b', color: '#e34948' },
];

export const DEFAULT_LEITSAETZE = [
  'Erst das Wichtige, dann das Dringende.',
  'Kleine Schritte jeden Tag schlagen große Pläne irgendwann.',
  'Was du heute fokussiert schaffst, musst du morgen nicht verschieben.',
  'Disziplin ist die Brücke zwischen Zielen und Ergebnissen.',
  'Zuverlässig. Gründlich. Sauber. Auch bei dir selbst.',
  'Ein klarer Plan macht den Kopf frei.',
  'Fang an, bevor du bereit bist.',
];

export const DEFAULT_SETTINGS = {
  name: 'Alexander',
  appUrl: '',
  amp: { yellowH: 24, alarmH: 24, repeatH: 3, escOn: true, autoUrgH: 48, quietOn: true, quietFrom: '22:30', quietTo: '07:00' },
  rem: {
    task: { 1: [1440, 60, 0], 2: [60, 0], 3: [0], 4: [0] },
    event: [15],
    allDayAt: '07:30',
  },
  focus: { len: 25, brk: 5, longBrk: 15, strict: false, sound: 'none', autoBreak: true },
  ntfy: { server: 'https://ntfy.sh', topic: '', on: false },
  dayStart: 7,
};

export function mergeDeep(base, over) {
  if (over === undefined || over === null) return structuredCloneSafe(base);
  if (typeof base !== 'object' || base === null || Array.isArray(base)) return structuredCloneSafe(over);
  const out = {};
  for (const k of Object.keys(base)) out[k] = mergeDeep(base[k], over[k]);
  for (const k of Object.keys(over)) if (!(k in base)) out[k] = structuredCloneSafe(over[k]);
  return out;
}
export function structuredCloneSafe(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }

export function settingsOf(data) {
  const rec = data && data.meta && data.meta.settings;
  const over = rec && !rec.deleted ? rec.v : null;
  return mergeDeep(DEFAULT_SETTINGS, over || {});
}

export function emptyData() {
  const d = { v: DATA_VERSION };
  for (const c of COLLECTIONS) d[c] = {};
  return d;
}

/* ------------------------------------------------------------------ */
/* Wiederholungen                                                      */
/* rule: { f: 'd'|'w'|'m'|'y', i: Intervall, wd: [0..6], until: 'YYYY-MM-DD'|null, n: Anzahl|null } */
/* ------------------------------------------------------------------ */
export function* occIter(base, rule, from) {
  const i = Math.max(1, Number(rule.i) || 1);
  const until = rule.until ? parseYmd(rule.until) : null;
  const useCount = !!rule.n;
  const ff = !useCount && from && from > base;
  let idx = 0;
  const ok = d => !(until && startOfDay(d) > until) && !(useCount && idx >= rule.n);
  if (rule.f === 'd') {
    let k = ff ? Math.max(0, Math.floor(daysBetween(base, from) / i) - 1) : 0;
    for (let guard = 0; guard < 200000; guard++, k++) {
      const d = addDays(base, k * i);
      if (!ok(d)) return;
      yield d; idx++;
    }
  } else if (rule.f === 'w') {
    const wds = (rule.wd && rule.wd.length ? [...new Set(rule.wd.map(Number))] : [wdIdx(base)]).sort((a, b) => a - b);
    const ws0 = startOfWeek(base);
    let w = ff ? Math.max(0, Math.floor(daysBetween(ws0, from) / 7 / i) - 1) : 0;
    for (let guard = 0; guard < 30000; guard++, w++) {
      const ws = addDays(ws0, w * 7 * i);
      for (const wd of wds) {
        const day = addDays(ws, wd);
        const d = new Date(day.getFullYear(), day.getMonth(), day.getDate(), base.getHours(), base.getMinutes());
        if (d < base) continue;
        if (!ok(d)) return;
        yield d; idx++;
      }
    }
  } else if (rule.f === 'm' || rule.f === 'y') {
    const step = rule.f === 'm' ? i : 12 * i;
    let k = ff ? Math.max(0, Math.floor(monthsBetween(base, from) / step) - 1) : 0;
    for (let guard = 0; guard < 20000; guard++, k++) {
      const d = addMonths(base, k * step);
      if (!ok(d)) return;
      yield d; idx++;
    }
  }
}

/** Alle Vorkommen-Startzeiten im Bereich [rs, re) */
export function occurrencesInRange(startStr, rule, rs, re, exd) {
  const base = parseLocal(startStr);
  if (!base) return [];
  const ex = new Set(exd || []);
  if (!rule || !rule.f) return (base >= rs && base < re && !ex.has(ymd(base))) ? [base] : [];
  const out = [];
  for (const d of occIter(base, rule, rs)) {
    if (d >= re) break;
    if (d >= rs && !ex.has(ymd(d))) out.push(d);
    if (out.length > 3000) break;
  }
  return out;
}

/** Erstes Vorkommen strikt nach `after` */
export function nextOccurrence(startStr, rule, after, exd) {
  const base = parseLocal(startStr);
  if (!base || !rule || !rule.f) return null;
  const ex = new Set(exd || []);
  for (const d of occIter(base, rule, after)) {
    if (d > after && !ex.has(ymd(d))) return d;
  }
  return null;
}

export function describeRule(rule, startStr) {
  if (!rule || !rule.f) return '';
  const i = Number(rule.i) || 1;
  let s = '';
  if (rule.f === 'd') s = i === 1 ? 'Täglich' : `Alle ${i} Tage`;
  if (rule.f === 'w') {
    const wds = (rule.wd && rule.wd.length) ? [...rule.wd].sort((a, b) => a - b) : null;
    const isWork = wds && wds.join(',') === '0,1,2,3,4';
    if (isWork && i === 1) s = 'Werktags';
    else {
      s = i === 1 ? 'Wöchentlich' : `Alle ${i} Wochen`;
      if (wds) s += ' am ' + wds.map(w => WD_SHORT[w]).join(', ');
    }
  }
  if (rule.f === 'm') {
    const d = startStr ? parseLocal(startStr).getDate() : null;
    s = (i === 1 ? 'Monatlich' : `Alle ${i} Monate`) + (d ? ` am ${d}.` : '');
  }
  if (rule.f === 'y') s = i === 1 ? 'Jährlich' : `Alle ${i} Jahre`;
  if (rule.until) { const u = parseYmd(rule.until); s += ` bis ${u.getDate()}.${u.getMonth() + 1}.${u.getFullYear()}`; }
  if (rule.n) s += `, ${rule.n}×`;
  return s;
}

/* ------------------------------------------------------------------ */
/* Aufgaben: Fälligkeit, Eisenhower, Ampel                              */
/* ------------------------------------------------------------------ */
export function taskDueAt(t) {
  if (!t || !t.due) return null;
  return parseLocal(t.due + 'T' + (t.dueTime || '23:59'));
}

export function isOpen(t) { return t && !t.deleted && !t.done; }

export function isUrgent(t, now, s) {
  if (t.urg) return true;
  if (t.autoUrg === false) return false;
  const due = taskDueAt(t);
  if (!due) return false;
  return (due - now) <= (s.amp.autoUrgH || 48) * HOUR;
}

export function quadrant(t, now, s) {
  const u = isUrgent(t, now, s);
  const i = !!t.imp;
  return i && u ? 1 : i ? 2 : u ? 3 : 4;
}

export const QUADRANTS = {
  1: { key: 1, name: 'Sofort erledigen', sub: 'Dringend und wichtig', verb: 'Jetzt erledigen', imp: true, urg: true },
  2: { key: 2, name: 'Planen', sub: 'Wichtig, nicht dringend', verb: 'Einplanen', imp: true, urg: false },
  3: { key: 3, name: 'Delegieren', sub: 'Dringend, nicht wichtig', verb: 'Abgeben', imp: false, urg: true },
  4: { key: 4, name: 'Eliminieren', sub: 'Weder dringend noch wichtig', verb: 'Streichen', imp: false, urg: false },
};

export const PRIOS = {
  1: { key: 1, name: 'Kritisch', short: 'P1' },
  2: { key: 2, name: 'Hoch', short: 'P2' },
  3: { key: 3, name: 'Mittel', short: 'P3' },
  4: { key: 4, name: 'Niedrig', short: 'P4' },
};

const ALARM_FACTOR = { 1: 0.25, 2: 0.5, 3: 1, 4: 2 };
const YELLOW_FACTOR = { 1: 2, 2: 1, 3: 1, 4: 0.5 };

export function yellowH(t, s) { return (s.amp.yellowH || 24) * (YELLOW_FACTOR[t.prio || 3] || 1); }
export function alarmH(t, s) { return (s.amp.alarmH || 24) * (ALARM_FACTOR[t.prio || 3] || 1); }

/** Ampelstufe einer Aufgabe: none | green | yellow | red | alarm | done */
export function ampel(t, now, s) {
  if (!t || t.deleted) return { level: 'none' };
  if (t.done) return { level: 'done' };
  const due = taskDueAt(t);
  if (!due) return { level: 'none' };
  const diffH = (due - now) / HOUR;
  if (diffH < 0) {
    const over = -diffH;
    return { level: over >= alarmH(t, s) ? 'alarm' : 'red', overdueH: over, due };
  }
  return { level: diffH <= yellowH(t, s) ? 'yellow' : 'green', hoursLeft: diffH, due };
}

export const AMPEL = {
  none: { name: 'Ohne Termin', short: 'Offen', rank: 0 },
  green: { name: 'Im Plan', short: 'Grün', rank: 1 },
  yellow: { name: 'Bald fällig', short: 'Gelb', rank: 2 },
  red: { name: 'Überfällig', short: 'Rot', rank: 3 },
  alarm: { name: 'Alarm', short: 'Alarm', rank: 4 },
  done: { name: 'Erledigt', short: 'Erledigt', rank: -1 },
};

/** Erledigen einer Aufgabe. Wiederkehrende Aufgaben springen zum nächsten Termin. Gibt das neue Objekt zurück. */
export function completeTask(t, now = new Date()) {
  const x = structuredCloneSafe(t);
  if (x.rec && x.rec.f && x.due) {
    const anchor = x.recStart || (x.due + (x.dueTime ? 'T' + x.dueTime : ''));
    if (!x.recStart) x.recStart = anchor;
    x.hist = [...(x.hist || []), ymd(now)].slice(-400);
    const cur = parseLocal(x.due + (x.dueTime ? 'T' + x.dueTime : 'T00:00'));
    const after = new Date(Math.max(cur.getTime(), now.getTime()));
    const next = nextOccurrence(anchor.includes('T') ? anchor : anchor + 'T00:00', x.rec, after, x.exd);
    if (next) {
      x.due = ymd(next);
      if (x.start) {
        const shift = daysBetween(cur, next);
        x.start = ymd(addDays(parseYmd(x.start), shift));
      }
      x.subs = (x.subs || []).map(s => ({ ...s, d: false }));
      x.snooze = null;
      x.lastDoneAt = now.getTime();
      return x;
    }
  }
  x.done = true;
  x.doneAt = now.getTime();
  if (x.rec) x.hist = [...(x.hist || []), ymd(now)].slice(-400);
  return x;
}

/** Serie (Streak) für wiederkehrende Aufgaben: aufeinanderfolgende Tage mit Erledigung bis heute/gestern */
export function streakOf(hist, now = new Date()) {
  if (!hist || !hist.length) return 0;
  const set = new Set(hist);
  let d = startOfDay(now);
  if (!set.has(ymd(d))) d = addDays(d, -1);
  let n = 0;
  while (set.has(ymd(d))) { n++; d = addDays(d, -1); }
  return n;
}

/* ------------------------------------------------------------------ */
/* Termine                                                             */
/* ------------------------------------------------------------------ */
export function eventDurationMin(ev) {
  const s = parseLocal(ev.s), e = parseLocal(ev.e || ev.s);
  if (ev.allDay) return (daysBetween(s, e) + 1) * 1440;
  return Math.max(15, Math.round((e - s) / MIN));
}

/** Expandiert Termine (inkl. Wiederholungen) in [rs, re). Ergebnis: { ev, start: Date, end: Date, key } */
export function expandEvents(events, rs, re) {
  const out = [];
  for (const ev of events) {
    if (!ev || ev.deleted || !ev.s) continue;
    const durMs = ev.allDay ? (daysBetween(parseLocal(ev.s), parseLocal(ev.e || ev.s)) + 1) * DAY : Math.max(15 * MIN, parseLocal(ev.e || ev.s) - parseLocal(ev.s));
    const sStr = ev.allDay ? ev.s.slice(0, 10) + 'T00:00' : ev.s;
    const occ = occurrencesInRange(sStr, ev.rec, new Date(rs.getTime() - durMs + 1), re, ev.exd);
    for (const start of occ) {
      const end = ev.allDay ? addDays(start, Math.round(durMs / DAY)) : new Date(start.getTime() + durMs);
      if (end <= rs) continue;
      out.push({ ev, start, end, key: ev.id + '@' + ymd(start) });
    }
  }
  out.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
  return out;
}

/* ------------------------------------------------------------------ */
/* Erinnerungsplan (für Push via ntfy und lokale Benachrichtigungen)     */
/* ------------------------------------------------------------------ */
function inQuiet(d, s) {
  if (!s.amp.quietOn) return false;
  const m = minutesOfDay(d);
  const [fh, fm] = s.amp.quietFrom.split(':').map(Number);
  const [th, tm] = s.amp.quietTo.split(':').map(Number);
  const f = fh * 60 + fm, t = th * 60 + tm;
  return f <= t ? (m >= f && m < t) : (m >= f || m < t);
}

function compactStamp(d) { return `${String(d.getFullYear()).slice(2)}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}`; }

export function deepLink(appUrl, params) {
  const base = (appUrl || '').split('#')[0].split('?')[0];
  const q = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  return `${base}?${q}`;
}

function catLabel(data, catId) {
  const c = catId && data.cats[catId];
  return c && !c.deleted ? `${c.icon || ''} ${c.name}`.trim() : '';
}

/**
 * Baut die gewünschte Liste von Erinnerungen im Zeitfenster.
 * Rückgabe: [{ rid, at(ms), title, message, priority(1-5), tags[], click, actions[], ref:{type,id}, level }]
 */
export function buildReminders(data, now = new Date(), opts = {}) {
  const s = settingsOf(data);
  const horizon = (opts.horizonH || 72) * HOUR;
  const catchup = (opts.catchupMin == null ? 10 : opts.catchupMin) * MIN;
  const appUrl = opts.appUrl || s.appUrl || '';
  const t0 = now.getTime() - catchup, t1 = now.getTime() + horizon;
  const out = [];
  const add = r => { if (r.at > t0 && r.at <= t1) out.push(r); };

  for (const t of Object.values(data.tasks || {})) {
    if (!isOpen(t) || !t.due) continue;
    const due = taskDueAt(t);
    const stamp = compactStamp(due);
    const prio = t.prio || 3;
    const click = deepLink(appUrl, { open: 'task', id: t.id });
    const focus = deepLink(appUrl, { open: 'focus', task: t.id, start: 1 });
    const cat = catLabel(data, t.cat);
    const area = t.area === 'b' ? 'Geschäftlich' : 'Privat';
    const actions = [
      { action: 'view', label: '▶ Fokus starten', url: focus },
      { action: 'view', label: 'Öffnen', url: click },
    ];
    const snooze = t.snooze || 0;
    const created = t.createdAt || 0;
    const timeTxt = t.dueTime ? `um ${t.dueTime}` : 'heute';
    const remList = Array.isArray(t.rem) ? t.rem : (s.rem.task[prio] || [0]);
    const used = [];
    for (const m of remList) {
      const at = due.getTime() - m * MIN;
      if (at < snooze || at < created - MIN) continue;
      used.push(at);
      const when = m === 0 ? 'Jetzt fällig' : m >= 1440 ? `Fällig in ${Math.round(m / 1440)} ${Math.round(m / 1440) === 1 ? 'Tag' : 'Tagen'}` : m >= 60 ? `Fällig in ${Math.round(m / 60)} Std` : `Fällig in ${m} Min`;
      add({
        rid: `zb-t-${t.id}-r${m}-${stamp}`, at, priority: m === 0 ? 4 : 3,
        title: `${m === 0 ? '🔔' : '⏰'} ${t.title}`,
        message: `${when}.\n${area}${cat ? ', ' + cat : ''}`,
        tags: [], click, actions, ref: { type: 'task', id: t.id }, level: m === 0 ? 'due' : 'reminder',
      });
    }
    if (t.esc !== false && s.amp.escOn) {
      const yAt = due.getTime() - yellowH(t, s) * HOUR;
      if (yAt >= created && yAt >= snooze && !used.some(u => Math.abs(u - yAt) < 45 * MIN)) {
        add({
          rid: `zb-t-${t.id}-y-${stamp}`, at: yAt, priority: 3,
          title: `🟡 Bald fällig: ${t.title}`,
          message: `Ampel springt auf Gelb. Fällig ${fmtDue(t.due, t.dueTime, new Date(yAt))}.`,
          tags: [], click, actions, ref: { type: 'task', id: t.id }, level: 'yellow',
        });
      }
      const rep = Math.max(0.5, s.amp.repeatH || 3) * HOUR;
      const aH = alarmH(t, s);
      let count = 0;
      for (let k = 1; k <= 200 && count < 24; k++) {
        const at = due.getTime() + k * rep;
        if (at > t1) break;
        if (at <= t0 || at < snooze) continue;
        const d = new Date(at);
        if (inQuiet(d, s)) continue;
        const overH = (at - due.getTime()) / HOUR;
        const isAlarm = overH >= aH;
        count++;
        add({
          rid: `zb-t-${t.id}-e${k}-${stamp}`, at, priority: 5,
          title: `${isAlarm ? '🚨 ALARM' : '🔴 Überfällig'}: ${t.title}`,
          message: `Seit ${overH >= 48 ? Math.round(overH / 24) + ' Tagen' : Math.round(overH) + ' Std'} überfällig. Tippen zum Erledigen.`,
          tags: isAlarm ? ['rotating_light'] : ['red_circle'], click, actions, ref: { type: 'task', id: t.id }, level: isAlarm ? 'alarm' : 'red',
        });
      }
    }
  }

  const events = Object.values(data.events || {}).filter(e => e && !e.deleted);
  const maxRem = 2 * DAY;
  const occ = expandEvents(events, new Date(t0), new Date(t1 + maxRem));
  for (const o of occ) {
    const ev = o.ev;
    const click = deepLink(appUrl, { open: 'event', id: ev.id, d: ymd(o.start) });
    const area = ev.area === 'b' ? 'Geschäftlich' : 'Privat';
    const cat = catLabel(data, ev.cat);
    const actions = [{ action: 'view', label: 'Im Kalender öffnen', url: click }];
    if (ev.allDay) {
      const at = setTime(o.start, s.rem.allDayAt || '07:30').getTime();
      if (Array.isArray(ev.rem) && ev.rem.length === 0) continue;
      add({ rid: `zb-e-${ev.id}-${compactStamp(o.start)}-ad`, at, priority: 3, title: `📅 Heute: ${ev.title}`, message: `Ganztägig.\n${area}${cat ? ', ' + cat : ''}`, tags: [], click, actions, ref: { type: 'event', id: ev.id }, level: 'event' });
      continue;
    }
    const remList = Array.isArray(ev.rem) ? ev.rem : s.rem.event;
    for (const m of remList) {
      const at = o.start.getTime() - m * MIN;
      add({
        rid: `zb-e-${ev.id}-${compactStamp(o.start)}-${m}`, at, priority: m <= 15 ? 4 : 3,
        title: `📅 ${ev.title}`,
        message: `${m === 0 ? 'Beginnt jetzt' : m >= 60 ? `Beginnt in ${fmtDuration(m)}` : `Beginnt in ${m} Min`}, ${hm(o.start)}–${hm(o.end)} Uhr.\n${area}${cat ? ', ' + cat : ''}${ev.loc ? '\nOrt: ' + ev.loc : ''}`,
        tags: [], click, actions, ref: { type: 'event', id: ev.id }, level: 'event',
      });
    }
  }

  const af = data.meta && data.meta.activeFocus;
  if (af && !af.deleted && af.run && af.run.endAt && !af.run.paused) {
    const click = deepLink(appUrl, { open: 'focus' });
    add({ rid: `zb-f-${af.run.id}`, at: af.run.endAt, priority: 4, title: af.run.kind === 'break' ? '☕ Pause vorbei' : '✨ Fokuszeit geschafft', message: af.run.kind === 'break' ? 'Weiter geht’s – starte die nächste Fokuseinheit.' : `${af.run.plan} Min Fokus abgeschlossen${af.run.title ? ': ' + af.run.title : ''}.`, tags: [], click, actions: [{ action: 'view', label: 'Öffnen', url: click }], ref: { type: 'focus', id: af.run.id }, level: 'focus' });
  }

  out.sort((a, b) => a.at - b.at);
  return out.slice(0, opts.max || 120);
}

/* ------------------------------------------------------------------ */
/* Sync-Merge (Last-Writer-Wins pro Datensatz, Tombstones)              */
/* ------------------------------------------------------------------ */
export function recordWins(a, b) {
  if (!b) return !!a;
  if (!a) return false;
  const ua = a.updatedAt || 0, ub = b.updatedAt || 0;
  if (ua !== ub) return ua > ub;
  return JSON.stringify(a) > JSON.stringify(b);
}

const TOMBSTONE_TTL = 120 * DAY;

export function mergeData(local, remote, now = Date.now()) {
  const merged = emptyData();
  let localChanged = false, remoteChanged = false;
  for (const c of COLLECTIONS) {
    const L = (local && local[c]) || {}, R = (remote && remote[c]) || {};
    const ids = new Set([...Object.keys(L), ...Object.keys(R)]);
    for (const id of ids) {
      const a = L[id], b = R[id];
      let w = recordWins(a, b) ? a : b;
      if (w && w.deleted && now - (w.updatedAt || 0) > TOMBSTONE_TTL) {
        // abgelaufene Löschmarker entfernen
        if (a) localChanged = true;
        if (b) remoteChanged = true;
        continue;
      }
      merged[c][id] = w;
      if (w !== a && JSON.stringify(w) !== JSON.stringify(a)) localChanged = true;
      if (w !== b && JSON.stringify(w) !== JSON.stringify(b)) remoteChanged = true;
    }
  }
  return { merged, localChanged, remoteChanged };
}

/* ------------------------------------------------------------------ */
/* ICS (Google Kalender) Import/Export                                  */
/* ------------------------------------------------------------------ */
function tzOffsetMs(utcMs, tz) {
  try {
    const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const p = Object.fromEntries(f.formatToParts(new Date(utcMs)).map(x => [x.type, x.value]));
    const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
    return asUtc - utcMs;
  } catch { return null; }
}

function icsDate(val, params) {
  // liefert { str: lokale Zeit 'YYYY-MM-DD' oder 'YYYY-MM-DDTHH:MM', allDay }
  const v = String(val).trim();
  if (/^\d{8}$/.test(v) || (params && /VALUE=DATE(?!-)/i.test(params))) {
    const s = v.slice(0, 8);
    return { str: `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`, allDay: true };
  }
  const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);
  if (!m) return null;
  const [, Y, Mo, D, H, Mi, S, Z] = m;
  let d;
  if (Z) d = new Date(Date.UTC(+Y, +Mo - 1, +D, +H, +Mi, +(S || 0)));
  else {
    const tzm = params && params.match(/TZID=([^;:]+)/i);
    const tz = tzm ? tzm[1].replace(/^"|"$/g, '') : null;
    if (tz) {
      const guess = Date.UTC(+Y, +Mo - 1, +D, +H, +Mi, +(S || 0));
      const off1 = tzOffsetMs(guess, tz);
      if (off1 === null) d = new Date(+Y, +Mo - 1, +D, +H, +Mi);
      else {
        let inst = guess - off1;
        const off2 = tzOffsetMs(inst, tz);
        if (off2 !== null && off2 !== off1) inst = guess - off2;
        d = new Date(inst);
      }
    } else d = new Date(+Y, +Mo - 1, +D, +H, +Mi);
  }
  return { str: fmtLocal(d), allDay: false };
}

function unescapeIcs(s) { return String(s || '').replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\'); }
function escapeIcs(s) { return String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;'); }

const ICS_WD = { MO: 0, TU: 1, WE: 2, TH: 3, FR: 4, SA: 5, SU: 6 };

function parseRRule(val) {
  const p = Object.fromEntries(String(val).split(';').map(x => x.split('=')));
  const f = { DAILY: 'd', WEEKLY: 'w', MONTHLY: 'm', YEARLY: 'y' }[p.FREQ];
  if (!f) return null;
  const r = { f, i: Number(p.INTERVAL) || 1 };
  if (p.BYDAY && f === 'w') r.wd = p.BYDAY.split(',').map(x => ICS_WD[x.replace(/^[-+\d]+/, '')]).filter(x => x !== undefined);
  if (p.BYDAY && f === 'd') { r.f = 'w'; r.wd = p.BYDAY.split(',').map(x => ICS_WD[x.replace(/^[-+\d]+/, '')]).filter(x => x !== undefined); }
  if (p.UNTIL) { const u = icsDate(p.UNTIL, ''); if (u) r.until = u.str.slice(0, 10); }
  if (p.COUNT) r.n = Number(p.COUNT);
  return r;
}

/** Parst ICS-Text in Zeitblick-Termine (ohne id/area – die setzt der Aufrufer) */
export function parseICS(text) {
  const lines = String(text).replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  const evs = [];
  let cur = null;
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line === 'BEGIN:VEVENT') { cur = { exd: [] }; continue; }
    if (line === 'END:VEVENT') { if (cur) evs.push(cur); cur = null; continue; }
    if (!cur) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const left = line.slice(0, idx), val = line.slice(idx + 1);
    const semi = left.indexOf(';');
    const name = (semi < 0 ? left : left.slice(0, semi)).toUpperCase();
    const params = semi < 0 ? '' : left.slice(semi + 1);
    if (name === 'UID') cur.uid = val;
    else if (name === 'SUMMARY') cur.title = unescapeIcs(val);
    else if (name === 'DESCRIPTION') cur.notes = unescapeIcs(val).slice(0, 2000);
    else if (name === 'LOCATION') cur.loc = unescapeIcs(val);
    else if (name === 'DTSTART') cur._s = icsDate(val, params);
    else if (name === 'DTEND') cur._e = icsDate(val, params);
    else if (name === 'DURATION') cur._dur = val;
    else if (name === 'RRULE') cur.rec = parseRRule(val);
    else if (name === 'EXDATE') for (const v of val.split(',')) { const d = icsDate(v, params); if (d) cur.exd.push(d.str.slice(0, 10)); }
    else if (name === 'RECURRENCE-ID') cur._rid = icsDate(val, params);
    else if (name === 'STATUS') cur.status = val.toUpperCase();
  }
  const out = [];
  const byUid = {};
  for (const e of evs) {
    if (!e._s || e.status === 'CANCELLED') continue;
    const allDay = e._s.allDay;
    let s = e._s.str, en;
    if (e._e) {
      if (allDay) en = ymd(addDays(parseYmd(e._e.str.slice(0, 10)), -1));
      else en = e._e.str;
    } else if (e._dur) {
      const m = e._dur.match(/P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?/);
      const mins = m ? ((+m[1] || 0) * 7 * 1440 + (+m[2] || 0) * 1440 + (+m[3] || 0) * 60 + (+m[4] || 0)) : 60;
      en = allDay ? ymd(addDays(parseYmd(s), Math.max(0, Math.round(mins / 1440) - 1))) : fmtLocal(addMinutes(parseLocal(s), mins));
    } else en = allDay ? s : fmtLocal(addMinutes(parseLocal(s), 60));
    if (allDay && en < s) en = s;
    const ev = { uid: e.uid || uid('ics'), title: e.title || '(Ohne Titel)', notes: e.notes || '', loc: e.loc || '', allDay, s, e: en, rec: e.rec || null, exd: e.exd };
    if (e._rid) ev._override = e._rid.str.slice(0, 10);
    out.push(ev);
    if (!ev._override) byUid[ev.uid] = ev;
  }
  // Überschriebene Einzeltermine: Ausnahme beim Master eintragen
  for (const ev of out) {
    if (ev._override && byUid[ev.uid]) byUid[ev.uid].exd.push(ev._override);
  }
  return out.map(ev => { if (ev._override) { ev.uid = ev.uid + '_' + ev._override; delete ev._override; } return ev; });
}

function icsStamp(d) { return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`; }
function icsDay(s) { return s.slice(0, 10).replace(/-/g, ''); }
const WD_ICS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

export function toICS(events, calName = 'Zeitblick') {
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Zeitblick//DE', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${escapeIcs(calName)}`];
  const stamp = icsStamp(new Date());
  for (const ev of events) {
    if (!ev || ev.deleted) continue;
    L.push('BEGIN:VEVENT', `UID:${ev.id}@zeitblick`, `DTSTAMP:${stamp}`);
    if (ev.allDay) {
      L.push(`DTSTART;VALUE=DATE:${icsDay(ev.s)}`, `DTEND;VALUE=DATE:${icsDay(ymd(addDays(parseYmd((ev.e || ev.s).slice(0, 10)), 1)))}`);
    } else {
      L.push(`DTSTART:${icsStamp(parseLocal(ev.s))}`, `DTEND:${icsStamp(parseLocal(ev.e || ev.s))}`);
    }
    L.push(`SUMMARY:${escapeIcs(ev.title)}`);
    if (ev.loc) L.push(`LOCATION:${escapeIcs(ev.loc)}`);
    if (ev.notes) L.push(`DESCRIPTION:${escapeIcs(ev.notes)}`);
    if (ev.rec && ev.rec.f) {
      const F = { d: 'DAILY', w: 'WEEKLY', m: 'MONTHLY', y: 'YEARLY' }[ev.rec.f];
      let r = `RRULE:FREQ=${F};INTERVAL=${ev.rec.i || 1}`;
      if (ev.rec.f === 'w' && ev.rec.wd && ev.rec.wd.length) r += `;BYDAY=${ev.rec.wd.map(w => WD_ICS[w]).join(',')}`;
      if (ev.rec.until) r += `;UNTIL=${icsDay(ev.rec.until)}T235959Z`;
      if (ev.rec.n) r += `;COUNT=${ev.rec.n}`;
      L.push(r);
      for (const x of ev.exd || []) L.push(ev.allDay ? `EXDATE;VALUE=DATE:${icsDay(x)}` : `EXDATE:${icsStamp(setTime(parseYmd(x), ev.s.slice(11, 16)))}`);
    }
    L.push('END:VEVENT');
  }
  L.push('END:VCALENDAR');
  return L.map(foldIcs).join('\r\n');
}
function foldIcs(line) {
  if (line.length <= 74) return line;
  const parts = [];
  for (let i = 0; i < line.length; i += 73) parts.push((i ? ' ' : '') + line.slice(i, i + 73));
  return parts.join('\r\n');
}

/* ------------------------------------------------------------------ */
/* Schnelleingabe (deutsche natürliche Sprache)                         */
/* ------------------------------------------------------------------ */
export function norm(s) {
  return String(s || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '');
}

const WD_WORDS = [['montag', 0], ['dienstag', 1], ['mittwoch', 2], ['donnerstag', 3], ['freitag', 4], ['samstag', 5], ['sonnabend', 5], ['sonntag', 6]];
const MONTH_WORDS = { jan: 0, januar: 0, feb: 1, februar: 1, mär: 2, märz: 2, maerz: 2, mar: 2, apr: 3, april: 3, mai: 4, jun: 5, juni: 5, jul: 6, juli: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8, okt: 9, oktober: 9, nov: 10, november: 10, dez: 11, dezember: 11 };

function nextWeekday(now, wd, forceNext = false) {
  const cur = wdIdx(now);
  let diff = (wd - cur + 7) % 7;
  if (diff === 0 && forceNext) diff = 7;
  if (diff === 0 && !forceNext) diff = 0;
  return addDays(startOfDay(now), diff);
}

/**
 * parseQuick("Angebot schreiben morgen 15 Uhr #vertrieb !1")
 * → { title, due, dueTime, prio, cat, area, rec, dur, imp, urg, chips: [{k, label}] }
 */
export function parseQuick(input, now = new Date(), cats = []) {
  let s = ' ' + String(input || '') + ' ';
  const r = { title: '', due: null, dueTime: null, prio: null, cat: null, area: null, rec: null, dur: null, imp: null, urg: null, chips: [] };
  const take = (re, fn) => {
    const m = s.match(re);
    if (m) { const ok = fn(m); if (ok !== false) s = s.replace(m[0], ' '); return ok !== false; }
    return false;
  };
  // Bereich
  take(/\s@(privat|priv)\b/i, () => { r.area = 'p'; r.chips.push({ k: 'area', label: 'Privat' }); });
  take(/\s@(gesch(ä|ae)ftlich|business|firma|job|biz)\b/i, () => { r.area = 'b'; r.chips.push({ k: 'area', label: 'Geschäftlich' }); });
  // Priorität
  take(/\s(?:!|p)([1-4])(?=\s)/i, m => { r.prio = Number(m[1]); r.chips.push({ k: 'prio', label: PRIOS[r.prio].name }); });
  // Quadrant
  take(/\sq([1-4])(?=\s)/i, m => { const q = QUADRANTS[m[1]]; r.imp = q.imp; r.urg = q.urg; r.chips.push({ k: 'quad', label: q.name }); });
  take(/\s!wichtig(?=\s)/i, () => { r.imp = true; r.chips.push({ k: 'quad', label: 'Wichtig' }); });
  take(/\s!dringend(?=\s)/i, () => { r.urg = true; r.chips.push({ k: 'quad', label: 'Dringend' }); });
  // Kategorie
  take(/\s#([\wäöüÄÖÜß&-]+)/i, m => {
    const q = norm(m[1]);
    if (!q) return false;
    const list = cats.filter(c => !c.deleted);
    const hit = list.find(c => norm(c.name) === q) || list.find(c => norm(c.name).startsWith(q)) || list.find(c => norm(c.name).includes(q));
    if (!hit) return false;
    r.cat = hit.id; if (!r.area) r.area = hit.area;
    r.chips.push({ k: 'cat', label: `${hit.icon || ''} ${hit.name}`.trim() });
  });
  // Wiederholung
  const recPats = [
    [/\s(t(ä|ae)glich|jeden tag)(?=\s)/i, () => ({ f: 'd', i: 1 })],
    [/\s(werktags|jeden werktag|mo-fr)(?=\s)/i, () => ({ f: 'w', i: 1, wd: [0, 1, 2, 3, 4] })],
    [/\salle (\d+) tage(?=\s)/i, m => ({ f: 'd', i: Number(m[1]) })],
    [/\salle (\d+) wochen(?=\s)/i, m => ({ f: 'w', i: Number(m[1]) })],
    [/\salle (\d+) monate(?=\s)/i, m => ({ f: 'm', i: Number(m[1]) })],
    [/\s(w(ö|oe)chentlich|jede woche)(?=\s)/i, () => ({ f: 'w', i: 1 })],
    [/\s(monatlich|jeden monat)(?=\s)/i, () => ({ f: 'm', i: 1 })],
    [/\s(j(ä|ae)hrlich|jedes jahr)(?=\s)/i, () => ({ f: 'y', i: 1 })],
  ];
  for (const [re, fn] of recPats) { if (take(re, m => { r.rec = fn(m); })) break; }
  if (!r.rec) {
    for (const [w, idx] of WD_WORDS) {
      const re = new RegExp(`\\s(jeden ${w}|${w}s)(?=\\s)`, 'i');
      if (take(re, () => { r.rec = { f: 'w', i: 1, wd: [idx] }; if (!r.due) r.due = ymd(nextWeekday(now, idx)); })) break;
    }
  }
  if (r.rec) r.chips.push({ k: 'rec', label: describeRule(r.rec) });

  // Relativ "in X min/std" → Fälligkeit mit Uhrzeit
  take(/\sin (\d+) ?(min|minuten|m)(?=\s)/i, m => { const d = addMinutes(now, Number(m[1])); r.due = ymd(d); r.dueTime = hm(d); });
  take(/\sin (\d+|einer|einem) ?(std|stunden|stunde|h)(?=\s)/i, m => { const n = /^\d+$/.test(m[1]) ? Number(m[1]) : 1; const d = addMinutes(now, n * 60); r.due = ymd(d); r.dueTime = hm(d); });
  // Datum
  take(/\s(heute)(?=\s)/i, () => { r.due = ymd(now); });
  take(/\s(übermorgen|uebermorgen)(?=\s)/i, () => { r.due = ymd(addDays(now, 2)); });
  take(/\s(morgen)(?=\s)/i, () => { r.due = ymd(addDays(now, 1)); });
  take(/\sin (\d+|einem|einer) ?(tag|tagen)(?=\s)/i, m => { r.due = ymd(addDays(now, /^\d+$/.test(m[1]) ? Number(m[1]) : 1)); });
  take(/\sin (\d+|einer) ?(woche|wochen)(?=\s)/i, m => { r.due = ymd(addDays(now, 7 * (/^\d+$/.test(m[1]) ? Number(m[1]) : 1))); });
  take(/\s(nächste|naechste) woche(?=\s)/i, () => { r.due = ymd(nextWeekday(now, 0, true)); });
  take(/\s(ende der woche|wochenende|am wochenende)(?=\s)/i, () => { r.due = ymd(nextWeekday(now, 5)); });
  for (const [w, idx] of WD_WORDS) {
    const re = new RegExp(`\\s(?:(am|nächsten|naechsten|kommenden)\\s)?${w}(?=\\s)`, 'i');
    if (take(re, m => { r.due = ymd(nextWeekday(now, idx, !!m[1] && m[1].toLowerCase() !== 'am' || wdIdx(now) === idx)); })) break;
  }
  take(/\s(?:am\s)?(\d{1,2})\.(\d{1,2})\.(\d{2,4})?(?=\s)/, m => {
    const d = Number(m[1]), mo = Number(m[2]) - 1;
    if (d < 1 || d > 31 || mo < 0 || mo > 11) return false;
    let y = m[3] ? Number(m[3]) : now.getFullYear();
    if (y < 100) y += 2000;
    let dt = new Date(y, mo, d);
    if (!m[3] && dt < startOfDay(now)) dt = new Date(y + 1, mo, d);
    r.due = ymd(dt);
  });
  take(/\s(?:am\s)?(\d{1,2})\.?\s(jan|januar|feb|februar|märz|maerz|mär|mar|apr|april|mai|jun|juni|jul|juli|aug|august|sep|sept|september|okt|oktober|nov|november|dez|dezember)\.?(?:\s(\d{4}))?(?=\s)/i, m => {
    const d = Number(m[1]), mo = MONTH_WORDS[m[2].toLowerCase()];
    if (mo === undefined) return false;
    let y = m[3] ? Number(m[3]) : now.getFullYear();
    let dt = new Date(y, mo, d);
    if (!m[3] && dt < startOfDay(now)) dt = new Date(y + 1, mo, d);
    r.due = ymd(dt);
  });
  // Uhrzeit
  const setT = (h, mi) => { if (h > 23 || mi > 59) return false; r.dueTime = `${pad(h)}:${pad(mi)}`; };
  take(/\s(?:um\s)?(\d{1,2}):(\d{2})(?:\s?uhr)?(?=\s)/i, m => setT(Number(m[1]), Number(m[2])));
  if (!r.dueTime) take(/\s(?:um\s)?(\d{1,2})\s?uhr(?=\s)/i, m => setT(Number(m[1]), 0));
  if (!r.dueTime) take(/\sum (\d{1,2})(?=\s)/i, m => setT(Number(m[1]), 0));
  if (!r.dueTime) take(/\s(morgens|früh|frueh)(?=\s)/i, () => setT(8, 0));
  if (!r.dueTime) take(/\s(mittags)(?=\s)/i, () => setT(12, 0));
  if (!r.dueTime) take(/\s(nachmittags)(?=\s)/i, () => setT(15, 0));
  if (!r.dueTime) take(/\s(abends)(?=\s)/i, () => setT(19, 0));
  // Dauer
  take(/\s(?:für\s|fuer\s)?(\d+)\s?(min|minuten)(?=\s)/i, m => { r.dur = Number(m[1]); r.chips.push({ k: 'dur', label: fmtDuration(r.dur) }); });
  if (!r.dur) take(/\s(?:für\s|fuer\s)?(\d+(?:[.,]\d)?)\s?(std|stunden|h)(?=\s)/i, m => { r.dur = Math.round(parseFloat(m[1].replace(',', '.')) * 60); r.chips.push({ k: 'dur', label: fmtDuration(r.dur) }); });

  if (r.dueTime && !r.due) {
    const t = setTime(now, r.dueTime);
    r.due = ymd(t < now ? addDays(now, 1) : now);
  }
  if (r.rec && !r.due) r.due = ymd(now);
  if (r.due) r.chips.unshift({ k: 'due', label: fmtDue(r.due, r.dueTime, now) });
  r.title = s.replace(/\s+/g, ' ').trim();
  return r;
}

/* ------------------------------------------------------------------ */
/* Statistik-Helfer                                                    */
/* ------------------------------------------------------------------ */
export function focusMinutesByDay(focus, days, now = new Date(), filter = () => true) {
  const out = [];
  const start = addDays(startOfDay(now), -(days - 1));
  const map = {};
  for (const f of Object.values(focus || {})) {
    if (!f || f.deleted || !f.ok || !filter(f)) continue;
    const k = ymd(new Date(f.s));
    map[k] = (map[k] || 0) + (f.min || 0);
  }
  for (let i = 0; i < days; i++) { const d = addDays(start, i); out.push({ d, key: ymd(d), v: Math.round(map[ymd(d)] || 0) }); }
  return out;
}

export function doneByDay(tasks, days, now = new Date(), filter = () => true) {
  const start = addDays(startOfDay(now), -(days - 1));
  const map = {};
  for (const t of Object.values(tasks || {})) {
    if (!t || t.deleted || !filter(t)) continue;
    if (t.done && t.doneAt) { const k = ymd(new Date(t.doneAt)); map[k] = (map[k] || 0) + 1; }
    for (const h of t.hist || []) { if (t.done && t.doneAt && h === ymd(new Date(t.doneAt))) continue; map[h] = (map[h] || 0) + 1; }
  }
  const out = [];
  for (let i = 0; i < days; i++) { const d = addDays(start, i); out.push({ d, key: ymd(d), v: map[ymd(d)] || 0 }); }
  return out;
}

export function greeting(now = new Date()) {
  const h = now.getHours();
  if (h >= 5 && h < 11) return 'Guten Morgen';
  if (h >= 11 && h < 14) return 'Mahlzeit';
  if (h >= 14 && h < 18) return 'Guten Tag';
  if (h >= 18 && h < 22) return 'Guten Abend';
  return 'Gute Nacht';
}
