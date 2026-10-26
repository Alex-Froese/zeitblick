// Zeitblick – automatische Ablage im Obsidian-Vault (Markdown + JSON + tägliche Backups)
import * as C from './core.js';
import * as S from './store.js';

export const ostate = { status: 'off', last: 0, error: '', folder: '', written: 0 };
export const supported = typeof window !== 'undefined' && 'showDirectoryPicker' in window;
const subs = new Set();
export function onState(fn) { subs.add(fn); return () => subs.delete(fn); }
function set(p) { Object.assign(ostate, p); for (const f of subs) { try { f(ostate); } catch { } } }

let handle = null;
let timer = null, busy = false, again = false;
let appUrlFn = () => '';
export function setAppUrl(fn) { appUrlFn = fn; }

export async function init() {
  if (!supported) { set({ status: 'unsupported' }); return; }
  handle = await S.kvGet('obsHandle');
  if (!handle || !handle.queryPermission) { set({ status: 'off' }); return; }
  try {
    const p = await handle.queryPermission({ mode: 'readwrite' });
    set({ folder: handle.name, status: p === 'granted' ? 'ok' : 'needs-permission' });
    if (p === 'granted') schedule(3000);
  } catch (e) { set({ status: 'error', error: e.message }); }
}

export async function choose() {
  if (!supported) throw new Error('Dieser Browser kann nicht direkt in Ordner schreiben. Nutze Chrome oder Edge am Laptop.');
  const h = await window.showDirectoryPicker({ id: 'zeitblick-obsidian', mode: 'readwrite' });
  handle = h;
  await S.kvSet('obsHandle', h);
  S.local.obsidian.on = true; S.saveLocal();
  await S.kvSet('obsCache', {});
  set({ folder: h.name, status: 'ok', error: '' });
  await exportAll(true);
}

/** nur für Tests */
export function _setHandle(h) { handle = h; set({ status: h ? 'ok' : 'off', folder: h ? h.name : '' }); }

export async function regrant() {
  if (!handle) return choose();
  const p = await handle.requestPermission({ mode: 'readwrite' });
  set({ status: p === 'granted' ? 'ok' : 'needs-permission' });
  if (p === 'granted') await exportAll(true);
}

export async function disconnect() {
  handle = null;
  await S.kvDel('obsHandle');
  S.local.obsidian.on = false; S.saveLocal();
  set({ status: 'off', folder: '' });
}

export function schedule(delay = 8000) {
  if (!handle || ostate.status !== 'ok') return;
  clearTimeout(timer);
  timer = setTimeout(() => exportAll(false), delay);
}

function fnv(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36) + ':' + str.length; }
function safeName(s) { return String(s || '').replace(/[\\/:*?"<>|#^[\]{}]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 70) || 'Ohne Titel'; }
function yamlStr(s) { return JSON.stringify(String(s ?? '')); }

async function dirAt(root, parts, create = true) {
  let d = root;
  for (const p of parts) d = await d.getDirectoryHandle(p, { create });
  return d;
}
async function writeFile(root, path, content) {
  const parts = path.split('/');
  const name = parts.pop();
  const dir = await dirAt(root, parts);
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(content);
  await w.close();
}
async function removeFile(root, path) {
  const parts = path.split('/');
  const name = parts.pop();
  try { const dir = await dirAt(root, parts, false); await dir.removeEntry(name); } catch { /* existiert nicht */ }
}

export function taskFileName(t) { return `Aufgaben/#${String(t.no || 0).padStart(4, '0')} ${safeName(t.title)}.md`; }

export function buildFiles(data, now = new Date(), appUrl = '') {
  const s = C.settingsOf(data);
  const files = new Map();
  const cats = data.cats;
  const catName = id => { const c = id && cats[id]; return c && !c.deleted ? c.name : ''; };
  const catIcon = id => { const c = id && cats[id]; return c && !c.deleted ? (c.icon || '') : ''; };
  const areaName = a => a === 'b' ? 'Geschäftlich' : 'Privat';
  const ampName = { none: 'offen', green: 'grün', yellow: 'gelb', red: 'rot', alarm: 'alarm', done: 'erledigt' };
  const ampEmoji = { none: '⚪', green: '🟢', yellow: '🟡', red: '🔴', alarm: '🚨', done: '✅' };
  const allTasks = Object.values(data.tasks).filter(t => t && !t.deleted);
  const keepDone = now.getTime() - 60 * C.DAY;
  const exportTasks = allTasks.filter(t => !t.done || (t.doneAt || 0) > keepDone);
  const link = t => `[[${taskFileName(t).replace(/\.md$/, '')}|${t.title.replace(/[|\]]/g, ' ')}]]`;

  // Aufgaben als einzelne Notizen (Dataview-freundlich)
  if (S.local.obsidian.notes !== false) {
    for (const t of exportTasks) {
      const a = C.ampel(t, now, s);
      const q = C.quadrant(t, now, s);
      const fm = [
        '---',
        `ticket: ${t.no || 0}`,
        `titel: ${yamlStr(t.title)}`,
        `status: ${t.done ? 'erledigt' : 'offen'}`,
        `bereich: ${areaName(t.area)}`,
        `kategorie: ${yamlStr(catName(t.cat))}`,
        `prioritaet: P${t.prio || 3}`,
        `quadrant: ${yamlStr(C.QUADRANTS[q].name)}`,
        `ampel: ${ampName[a.level]}`,
        `faellig: ${t.due || ''}`,
        `uhrzeit: ${yamlStr(t.dueTime || '')}`,
        `beginn: ${t.start || ''}`,
        `dauer_min: ${t.dur || ''}`,
        `wiederholung: ${yamlStr(C.describeRule(t.rec, t.due))}`,
        `fokus_min: ${Math.round(t.focusMin || 0)}`,
        `erstellt: ${t.createdAt ? C.ymd(new Date(t.createdAt)) : ''}`,
        `erledigt_am: ${t.doneAt ? C.ymd(new Date(t.doneAt)) : ''}`,
        `delegiert_an: ${yamlStr(t.delegate || '')}`,
        `zeitblick_id: ${t.id}`,
        'tags: [zeitblick, aufgabe]',
        '---',
      ];
      const body = [`# ${ampEmoji[a.level]} ${t.title}`, ''];
      if (t.notes) body.push(t.notes, '');
      if (t.subs && t.subs.length) { body.push('## Unteraufgaben'); for (const x of t.subs) body.push(`- [${x.d ? 'x' : ' '}] ${x.t}`); body.push(''); }
      if (t.hist && t.hist.length) body.push(`Serie: ${C.streakOf(t.hist, now)} Tage, ${t.hist.length}× erledigt`, '');
      if (appUrl) body.push(`[In Zeitblick öffnen](${C.deepLink(appUrl, { open: 'task', id: t.id })})`);
      body.push('', '> Automatisch von Zeitblick erzeugt. Bearbeite die Aufgabe in der App – diese Notiz wird überschrieben.');
      files.set(taskFileName(t), fm.join('\n') + '\n' + body.join('\n') + '\n');
    }
  }

  // Übersicht
  const open = allTasks.filter(t => !t.done);
  const byLevel = { alarm: [], red: [], yellow: [], green: [], none: [] };
  for (const t of open) byLevel[C.ampel(t, now, s).level].push(t);
  const today = C.ymd(now);
  const line = t => `- [ ] ${ampEmoji[C.ampel(t, now, s).level]} ${link(t)}${t.due ? ` (${C.fmtDue(t.due, t.dueTime, now)})` : ''}${t.cat ? `, ${catIcon(t.cat)} ${catName(t.cat)}` : ''}`;
  const ov = [
    '---', `aktualisiert: ${C.ymd(now)} ${C.hm(now)}`, 'tags: [zeitblick]', '---',
    '# Zeitblick – Übersicht', '',
    `Stand ${C.fmtDateLong(now)}, ${C.hm(now)} Uhr.`, '',
    '## Ampel',
    `🚨 Alarm: ${byLevel.alarm.length}  |  🔴 Überfällig: ${byLevel.red.length}  |  🟡 Bald fällig: ${byLevel.yellow.length}  |  🟢 Im Plan: ${byLevel.green.length + byLevel.none.length}`, '',
  ];
  if (byLevel.alarm.length || byLevel.red.length) { ov.push('## Überfällig'); for (const t of [...byLevel.alarm, ...byLevel.red]) ov.push(line(t)); ov.push(''); }
  const dueToday = open.filter(t => t.due === today);
  ov.push('## Heute fällig'); if (!dueToday.length) ov.push('Nichts mehr fällig.'); for (const t of dueToday) ov.push(line(t)); ov.push('');
  ov.push('## Eisenhower-Matrix');
  for (const q of [1, 2, 3, 4]) {
    const list = open.filter(t => C.quadrant(t, now, s) === q);
    ov.push(`### ${C.QUADRANTS[q].name} (${list.length})`);
    for (const t of list.slice(0, 30)) ov.push(line(t));
    ov.push('');
  }
  const evs = C.expandEvents(Object.values(data.events), C.startOfDay(now), C.addDays(C.startOfDay(now), 14));
  ov.push('## Termine der nächsten 14 Tage');
  if (!evs.length) ov.push('Keine Termine.');
  else { ov.push('| Tag | Zeit | Termin | Bereich |', '|---|---|---|---|'); for (const o of evs) ov.push(`| ${C.fmtDateShort(o.start)} | ${o.ev.allDay ? 'ganztägig' : C.hm(o.start) + '–' + C.hm(o.end)} | ${o.ev.title.replace(/\|/g, '/')} | ${areaName(o.ev.area)} |`); }
  ov.push('');
  const fm7 = C.focusMinutesByDay(data.focus, 7, now);
  ov.push('## Fokus der letzten 7 Tage', '| Tag | Minuten |', '|---|---|');
  for (const d of fm7) ov.push(`| ${C.fmtDateShort(d.d)} | ${d.v} |`);
  ov.push('', '> Automatisch von Zeitblick erzeugt.');
  files.set('Zeitblick Übersicht.md', ov.join('\n') + '\n');

  // Kalender pro Monat (Vormonat bis +2)
  for (let k = -1; k <= 2; k++) {
    const m0 = new Date(now.getFullYear(), now.getMonth() + k, 1);
    const m1 = new Date(now.getFullYear(), now.getMonth() + k + 1, 1);
    const occ = C.expandEvents(Object.values(data.events), m0, m1);
    const L = ['---', 'tags: [zeitblick, kalender]', '---', `# Kalender ${C.MONTHS[m0.getMonth()]} ${m0.getFullYear()}`, ''];
    if (!occ.length) L.push('Keine Termine.');
    let lastDay = '';
    for (const o of occ) {
      const dk = C.ymd(o.start);
      if (dk !== lastDay) { L.push('', `## ${C.fmtDateLong(o.start)}`); lastDay = dk; }
      L.push(`- ${o.ev.allDay ? 'ganztägig' : C.hm(o.start) + '–' + C.hm(o.end)}: **${o.ev.title}**${o.ev.loc ? ' (' + o.ev.loc + ')' : ''}, ${areaName(o.ev.area)}${o.ev.cat ? ', ' + catName(o.ev.cat) : ''}`);
    }
    files.set(`Kalender/${m0.getFullYear()}-${C.pad(m0.getMonth() + 1)}.md`, L.join('\n') + '\n');
  }

  // Fokus-Log pro Monat (letzte 3 Monate)
  for (let k = -2; k <= 0; k++) {
    const m0 = new Date(now.getFullYear(), now.getMonth() + k, 1);
    const m1 = new Date(now.getFullYear(), now.getMonth() + k + 1, 1);
    const list = Object.values(data.focus).filter(f => f && !f.deleted && f.s >= m0.getTime() && f.s < m1.getTime()).sort((a, b) => a.s - b.s);
    if (!list.length) continue;
    const total = list.filter(f => f.ok).reduce((a, f) => a + (f.min || 0), 0);
    const L = ['---', 'tags: [zeitblick, fokus]', `fokus_min_gesamt: ${Math.round(total)}`, '---', `# Fokus ${C.MONTHS[m0.getMonth()]} ${m0.getFullYear()}`, '', `Gesamt: ${C.fmtDuration(total)} in ${list.filter(f => f.ok).length} Einheiten.`, '', '| Datum | Start | Minuten | Ergebnis | Aufgabe | Kategorie |', '|---|---|---|---|---|---|'];
    for (const f of list) {
      const t = f.taskId && data.tasks[f.taskId];
      L.push(`| ${C.ymd(new Date(f.s))} | ${C.hm(new Date(f.s))} | ${Math.round(f.min || 0)} | ${f.ok ? '✅ geschafft' : '❌ abgebrochen'} | ${t && !t.deleted ? t.title.replace(/\|/g, '/') : ''} | ${catName(f.cat)} |`);
    }
    files.set(`Fokus/${m0.getFullYear()}-${C.pad(m0.getMonth() + 1)}.md`, L.join('\n') + '\n');
  }

  // Tagesnotizen (letzte 14 Tage bis +7)
  if (S.local.obsidian.daily !== false) {
    for (let k = -14; k <= 7; k++) {
      const d = C.addDays(C.startOfDay(now), k);
      const key = C.ymd(d);
      const due = allTasks.filter(t => t.due === key && !t.done);
      const done = allTasks.filter(t => (t.doneAt && C.ymd(new Date(t.doneAt)) === key) || (t.hist || []).includes(key));
      const ev = C.expandEvents(Object.values(data.events), d, C.addDays(d, 1));
      const fo = Object.values(data.focus).filter(f => f && !f.deleted && f.ok && C.ymd(new Date(f.s)) === key);
      if (!due.length && !done.length && !ev.length && !fo.length) continue;
      const fmin = fo.reduce((a, f) => a + (f.min || 0), 0);
      const L = ['---', `datum: ${key}`, `fokus_min: ${Math.round(fmin)}`, `erledigt: ${done.length}`, 'tags: [zeitblick, tag]', '---', `# ${C.fmtDateLong(d)} ${d.getFullYear()}`, ''];
      if (ev.length) { L.push('## Termine'); for (const o of ev) L.push(`- ${o.ev.allDay ? 'ganztägig' : C.hm(o.start) + '–' + C.hm(o.end)}: ${o.ev.title}`); L.push(''); }
      if (due.length) { L.push('## Fällig'); for (const t of due) L.push(`- [ ] ${link(t)}${t.dueTime ? ' um ' + t.dueTime : ''}`); L.push(''); }
      if (done.length) { L.push('## Erledigt'); for (const t of done) L.push(`- [x] ${link(t)}`); L.push(''); }
      if (fo.length) { L.push('## Fokus', `${C.fmtDuration(fmin)} in ${fo.length} Einheiten.`, ''); }
      files.set(`Tage/${key}.md`, L.join('\n') + '\n');
    }
  }

  files.set('Daten/zeitblick-daten.json', JSON.stringify({ app: 'Zeitblick', version: C.APP_VERSION, exportedAt: now.toISOString(), data }, null, 1));
  return files;
}

export async function exportAll(force = false) {
  if (!handle) return;
  if (busy) { again = true; return; }
  busy = true;
  try {
    const p = await handle.queryPermission({ mode: 'readwrite' });
    if (p !== 'granted') { set({ status: 'needs-permission' }); return; }
    const root = await handle.getDirectoryHandle('Zeitblick', { create: true });
    const now = new Date();
    const files = buildFiles(S.getData(), now, appUrlFn());
    const cache = force ? {} : ((await S.kvGet('obsCache')) || {});
    const next = {};
    let written = 0;
    for (const [path, content] of files) {
      const h = fnv(content);
      next[path] = h;
      if (cache[path] === h) continue;
      await writeFile(root, path, content);
      written++;
    }
    for (const path of Object.keys(cache)) {
      if (!next[path] && (path.startsWith('Aufgaben/') || path.startsWith('Tage/'))) { await removeFile(root, path); }
    }
    // Tägliches Backup (30 Tage aufbewahren)
    const bname = `zeitblick-${C.ymd(now)}.json`;
    const bdir = await dirAt(root, ['Backups']);
    let exists = false;
    try { await bdir.getFileHandle(bname); exists = true; } catch { }
    if (!exists) {
      await writeFile(root, 'Backups/' + bname, S.exportJson());
      written++;
      const names = [];
      for await (const [n] of bdir.entries()) if (/^zeitblick-\d{4}-\d{2}-\d{2}\.json$/.test(n)) names.push(n);
      names.sort();
      while (names.length > 30) { const n = names.shift(); try { await bdir.removeEntry(n); } catch { } }
    }
    await S.kvSet('obsCache', next);
    set({ status: 'ok', last: Date.now(), error: '', written });
  } catch (e) {
    set({ status: e && e.name === 'NotAllowedError' ? 'needs-permission' : 'error', error: e.message || String(e) });
  } finally {
    busy = false;
    if (again) { again = false; schedule(2000); }
  }
}
