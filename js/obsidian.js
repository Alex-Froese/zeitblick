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

export function taskFileName(t) {
  const name = `#${String(t.no || 0).padStart(4, '0')} ${safeName(t.title)}.md`;
  if (C.isClosed(t)) { const y = new Date(t.doneAt || t.updatedAt || Date.now()).getFullYear(); return `Archiv/${y}/${name}`; }
  return `Vorgänge/${name}`;
}

const REMOVABLE = ['Aufgaben/', 'Vorgänge/', 'Archiv/', 'Tage/', 'Notizen/', 'Ziele/', 'Projekte/', 'Personen/'];

export function buildFiles(data, now = new Date(), appUrl = '') {
  const s = C.settingsOf(data);
  const files = new Map();
  const live = col => Object.values(data[col] || {}).filter(x => x && !x.deleted);
  const getL = (col, id) => { const x = id && data[col] && data[col][id]; return x && !x.deleted ? x : null; };
  const catName = id => { const c = getL('cats', id); return c ? c.name : ''; };
  const areaName = a => a === 'b' ? 'Geschäftlich' : 'Privat';
  const ampName = { none: 'offen', green: 'grün', yellow: 'gelb', red: 'rot', alarm: 'alarm', done: 'erledigt' };
  const ampEmoji = { none: '⚪', green: '🟢', yellow: '🟡', red: '🔴', alarm: '🚨', done: '✅' };
  const dt = ms => { const d = new Date(ms); return `${C.ymd(d)} ${C.hm(d)}`; };
  const allTasks = live('tasks');
  const used = new Set();
  const uniq = (folder, base, id) => { let p = `${folder}/${safeName(base)}.md`; if (used.has(p)) p = `${folder}/${safeName(base)} (${String(id).slice(-4)}).md`; used.add(p); return p; };
  const link = t => `[[${taskFileName(t).replace(/\.md$/, '')}|${String(t.title).replace(/[|\]]/g, ' ')}]]`;
  const goalFile = {}, projFile = {}, personFile = {};
  for (const g of live('goals')) goalFile[g.id] = uniq('Ziele', g.title, g.id);
  for (const p of live('projects')) projFile[p.id] = uniq('Projekte', p.title, p.id);
  for (const p of live('people')) personFile[p.id] = uniq('Personen', p.name, p.id);
  const wl = (file, label) => `[[${file.replace(/\.md$/, '')}|${String(label).replace(/[|\]]/g, ' ')}]]`;
  const logLines = list => [...(list || [])].sort((a, b) => a.at - b.at).map(x => `- **${dt(x.at)}**${x.kind && x.kind !== 'note' ? ` _(${x.kind === 'contact' ? 'Kontakt' : x.kind === 'status' ? 'Status' : 'System'})_` : ''} ${String(x.text || '').replace(/\n/g, ' ')}`);

  // Vorgänge (offen) und Archiv (geschlossen) – eine Datei pro Vorgang, Dataview-freundlich
  if (S.local.obsidian.notes !== false) {
    for (const t of allTasks) {
      const a = C.ampel(t, now, s);
      const q = C.quadrant(t, now, s);
      const lifeId = C.lifeOfTask(t, data);
      const ppl = (t.people || []).map(id => getL('people', id)).filter(Boolean);
      const fm = [
        '---',
        `ticket: ${t.no || 0}`,
        `titel: ${yamlStr(t.title)}`,
        `typ: ${C.TYPES[C.typeOf(t)].name}`,
        `status: ${C.STATUS[C.statusOf(t)].name}`,
        `bereich: ${areaName(t.area)}`,
        `kategorie: ${yamlStr(catName(t.cat))}`,
        `lebensbereich: ${yamlStr((getL('life', lifeId) || {}).name || '')}`,
        `projekt: ${yamlStr((getL('projects', t.project) || {}).title || '')}`,
        `ziel: ${yamlStr((getL('goals', t.goal) || {}).title || '')}`,
        `personen: [${ppl.map(p => yamlStr(p.name)).join(', ')}]`,
        `prioritaet: P${t.prio || 3}`,
        `quadrant: ${yamlStr(C.QUADRANTS[q].name)}`,
        `ampel: ${ampName[a.level]}`,
        `faellig: ${t.due || ''}`,
        `uhrzeit: ${yamlStr(t.dueTime || '')}`,
        `dauer_min: ${t.dur || ''}`,
        `wiederholung: ${yamlStr(C.describeRule(t.rec, t.due))}`,
        `fokus_min: ${Math.round(t.focusMin || 0)}`,
        `erstellt: ${t.createdAt ? C.ymd(new Date(t.createdAt)) : ''}`,
        `geschlossen: ${C.isClosed(t) && t.doneAt ? C.ymd(new Date(t.doneAt)) : ''}`,
        `wartet_auf: ${yamlStr(t.delegate || '')}`,
        `zeitblick_id: ${t.id}`,
        `tags: [zeitblick, vorgang, ${C.typeOf(t)}]`,
        '---',
      ];
      const body = [`# ${ampEmoji[C.isClosed(t) ? 'done' : a.level]} ${t.title}`, ''];
      if (t.notes) body.push(t.notes, '');
      if (ppl.length) body.push(`Personen: ${ppl.map(p => wl(personFile[p.id], p.name)).join(', ')}`, '');
      if (t.project && projFile[t.project]) body.push(`Projekt: ${wl(projFile[t.project], getL('projects', t.project).title)}`, '');
      if (t.subs && t.subs.length) { body.push('## Unteraufgaben'); for (const x of t.subs) body.push(`- [${x.d ? 'x' : ' '}] ${x.t}`); body.push(''); }
      if (t.hist && t.hist.length) body.push(`Serie: ${C.streakOf(t.hist, now)} Tage, ${t.hist.length}× erledigt`, '');
      body.push('## Verlauf');
      if (t.createdAt) body.push(`- **${dt(t.createdAt)}** _(System)_ Vorgang erstellt`);
      body.push(...logLines(t.log), '');
      if (appUrl) body.push(`[In Zeitblick öffnen](${C.deepLink(appUrl, { open: 'task', id: t.id })})`);
      body.push('', '> Automatisch von Zeitblick erzeugt. Bearbeite den Vorgang in der App – diese Datei wird überschrieben.');
      files.set(taskFileName(t), fm.join('\n') + '\n' + body.join('\n') + '\n');
    }
  }

  // Notizen
  for (const n of live('notes')) {
    const l = getL('life', n.life);
    const fm = ['---', `titel: ${yamlStr(n.title)}`, `bereich: ${areaName(n.area)}`, `lebensbereich: ${yamlStr(l ? l.name : '')}`, `einpraegen: ${yamlStr(C.describeRead(n))}`, `erstellt: ${n.createdAt ? C.ymd(new Date(n.createdAt)) : ''}`, `geaendert: ${n.updatedAt ? dt(n.updatedAt) : ''}`, `zeitblick_id: ${n.id}`, `tags: [zeitblick, notiz${(n.tags || []).map(t => ', ' + yamlStr(t)).join('')}]`, '---'];
    const body = [`# ${n.title || 'Ohne Titel'}`, '', n.body || '', ''];
    if (appUrl) body.push(`[In Zeitblick öffnen](${C.deepLink(appUrl, { open: 'note', id: n.id })})`);
    files.set(uniq('Notizen', n.title || 'Ohne Titel', n.id), fm.join('\n') + '\n' + body.join('\n') + '\n');
  }

  // Ziele
  for (const g of live('goals')) {
    const p = C.goalProgress(g, data);
    const l = getL('life', g.life);
    const L = ['---', `titel: ${yamlStr(g.title)}`, `status: ${C.GOAL_STATUS[g.status] || g.status}`, `fortschritt: ${Math.round(p * 100)}`, `lebensbereich: ${yamlStr(l ? l.name : '')}`, `frist: ${g.deadline || ''}`, `tags: [zeitblick, ziel]`, '---', `# 🎯 ${g.title}`, '', `**Fortschritt:** ${Math.round(p * 100)} %`, ''];
    if (g.why) L.push(`**Warum:** ${g.why}`, '');
    if ((g.milestones || []).length) { L.push('## Meilensteine'); for (const m of g.milestones) L.push(`- [${m.d ? 'x' : ' '}] ${m.t}`); L.push(''); }
    const ps = live('projects').filter(x => x.goal === g.id), ts = allTasks.filter(t => t.goal === g.id);
    if (ps.length || ts.length) { L.push('## Verknüpft'); for (const x of ps) L.push(`- Projekt ${wl(projFile[x.id], x.title)}`); for (const t of ts) L.push(`- ${C.isClosed(t) ? '[x]' : '[ ]'} ${link(t)}`); L.push(''); }
    if ((g.log || []).length) L.push('## Entwicklung', ...logLines(g.log), '');
    files.set(goalFile[g.id], L.join('\n') + '\n');
  }

  // Projekte
  for (const p of live('projects')) {
    const ts = allTasks.filter(t => t.project === p.id);
    const g = getL('goals', p.goal);
    const L = ['---', `titel: ${yamlStr(p.title)}`, `status: ${C.PROJECT_STATUS[p.status] || p.status}`, `fortschritt: ${Math.round(C.projectProgress(p, data) * 100)}`, `bis: ${p.due || ''}`, `tags: [zeitblick, projekt]`, '---', `# 📁 ${p.title}`, ''];
    if (p.desc) L.push(p.desc, '');
    if (g) L.push(`Ziel: ${wl(goalFile[g.id], g.title)}`, '');
    L.push('## Vorgänge'); for (const t of ts) L.push(`- ${C.isClosed(t) ? '[x]' : '[ ]'} ${link(t)}`); if (!ts.length) L.push('Noch keine.'); L.push('');
    if ((p.log || []).length) L.push('## Notizen & Verlauf', ...logLines(p.log), '');
    files.set(projFile[p.id], L.join('\n') + '\n');
  }

  // Personen
  for (const p of live('people')) {
    const ts = allTasks.filter(t => (t.people || []).includes(p.id));
    const L = ['---', `name: ${yamlStr(p.name)}`, `beziehung: ${yamlStr(p.rel || '')}`, `geburtstag: ${p.birthday || ''}`, `kontakt_rhythmus_tage: ${p.rhythm || ''}`, `letzter_kontakt: ${p.lastContact || ''}`, `tags: [zeitblick, person]`, '---', `# ${p.name}`, ''];
    if (p.notes) L.push('## Was mir wichtig ist', p.notes, '');
    const open = ts.filter(C.isOpen), closed = ts.filter(t => C.isClosed(t));
    if (open.length) { L.push('## Offen'); for (const t of open) L.push(`- [ ] ${C.TYPES[C.typeOf(t)].name}: ${link(t)}`); L.push(''); }
    if (closed.length) { L.push('## Abgeschlossen'); for (const t of closed) L.push(`- [x] ${link(t)}`); L.push(''); }
    if ((p.log || []).length) L.push('## Verlauf', ...logLines(p.log), '');
    files.set(personFile[p.id], L.join('\n') + '\n');
  }

  // Gewohnheiten, Inbox, Lebensbereiche
  {
    const hs = live('habits').filter(h => !h.archived);
    const days = [...Array(14)].map((_, i) => C.ymd(C.addDays(now, i - 13)));
    const L = ['---', 'tags: [zeitblick, gewohnheiten]', '---', '# Gewohnheiten & Routinen', '', `| Gewohnheit | Art | Rhythmus | Serie | Quote 30 T. | ${days.slice(-7).map(k => k.slice(8)).join(' | ')} |`, `|---|---|---|---|---|${days.slice(-7).map(() => '---').join('|')}|`];
    for (const h of hs) L.push(`| ${h.title.replace(/\|/g, '/')} | ${C.HABIT_KINDS[h.kind || 'check'].name} | ${C.describeHabitFreq(h)} | ${C.habitStreak(h, now)} | ${Math.round(C.habitRate(h, 30, now) * 100)} % | ${days.slice(-7).map(k => { const v = C.habitValue(h, k); return C.habitDoneOn(h, k) ? '✅' + (typeof v === 'number' ? ' ' + v : '') : C.habitFailedOn(h, k) ? '❌ ' + v : '·'; }).join(' | ')} |`);
    if (!hs.length) L.push('', 'Noch keine Gewohnheiten.');
    files.set('Gewohnheiten.md', L.join('\n') + '\n');
    const inbox = C.sortInbox(live('inbox'));
    files.set('Inbox.md', ['---', 'tags: [zeitblick, inbox]', '---', '# Inbox', '', ...(inbox.length ? inbox.map(x => `- [ ] P${x.prio || 3} ${String(x.text).replace(/\n/g, ' ')} _(seit ${x.createdAt ? C.ymd(new Date(x.createdAt)) : '?'})_`) : ['Leer.'])].join('\n') + '\n');
    const life = live('life').sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
    const LL = ['---', 'tags: [zeitblick, lebensbereiche]', '---', '# Lebensbereiche', '', '| Bereich | Zufriedenheit | Bewertet am | Offene Vorgänge |', '|---|---|---|---|'];
    for (const l of life) { const r = C.lifeRating(l); LL.push(`| ${l.icon || ''} ${l.name} | ${r ? r.v + '/10' : '–'} | ${r ? r.d : ''} | ${allTasks.filter(t => C.isOpen(t) && C.lifeOfTask(t, data) === l.id).length} |`); }
    files.set('Lebensbereiche.md', LL.join('\n') + '\n');
  }

  // Übersicht
  const open = allTasks.filter(C.isOpen);
  const byLevel = { alarm: [], red: [], yellow: [], green: [], none: [], done: [] };
  for (const t of open) byLevel[C.ampel(t, now, s).level].push(t);
  const today = C.ymd(now);
  const line = t => `- [ ] ${ampEmoji[C.ampel(t, now, s).level]} ${link(t)}${t.due ? ` (${C.fmtDue(t.due, t.dueTime, now)})` : ''}${t.cat ? `, ${catName(t.cat)}` : ''}${C.statusOf(t) !== 'neu' ? ` · ${C.STATUS[C.statusOf(t)].name}` : ''}`;
  const ov = [
    '---', `aktualisiert: ${C.ymd(now)} ${C.hm(now)}`, 'tags: [zeitblick]', '---',
    '# Zeitblick – Übersicht', '',
    `Stand ${C.fmtDateLong(now)}, ${C.hm(now)} Uhr. ${open.length} offene Vorgänge, ${live('inbox').length} in der [[Inbox]].`, '',
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
  const evs = C.expandEvents(live('events'), C.startOfDay(now), C.addDays(C.startOfDay(now), 14));
  ov.push('## Termine der nächsten 14 Tage');
  if (!evs.length) ov.push('Keine Termine.');
  else { ov.push('| Tag | Zeit | Termin | Bereich |', '|---|---|---|---|'); for (const o of evs) ov.push(`| ${C.fmtDateShort(o.start)} | ${o.ev.allDay ? 'ganztägig' : C.hm(o.start) + '–' + C.hm(o.end)} | ${o.ev.taskId ? '⏱ ' : ''}${o.ev.title.replace(/\|/g, '/')} | ${areaName(o.ev.area)} |`); }
  ov.push('');
  const fm7 = C.focusMinutesByDay(data.focus, 7, now);
  ov.push('## Fokus der letzten 7 Tage', '| Tag | Minuten |', '|---|---|');
  for (const d of fm7) ov.push(`| ${C.fmtDateShort(d.d)} | ${d.v} |`);
  ov.push('', 'Weitere Seiten: [[Gewohnheiten]] · [[Lebensbereiche]] · [[Inbox]]', '', '> Automatisch von Zeitblick erzeugt.');
  files.set('Zeitblick Übersicht.md', ov.join('\n') + '\n');

  // Kalender pro Monat (Vormonat bis +2)
  for (let k = -1; k <= 2; k++) {
    const m0 = new Date(now.getFullYear(), now.getMonth() + k, 1);
    const m1 = new Date(now.getFullYear(), now.getMonth() + k + 1, 1);
    const occ = C.expandEvents(live('events'), m0, m1);
    const L = ['---', 'tags: [zeitblick, kalender]', '---', `# Kalender ${C.MONTHS[m0.getMonth()]} ${m0.getFullYear()}`, ''];
    if (!occ.length) L.push('Keine Termine.');
    let lastDay = '';
    for (const o of occ) {
      const dk = C.ymd(o.start);
      if (dk !== lastDay) { L.push('', `## ${C.fmtDateLong(o.start)}`); lastDay = dk; }
      L.push(`- ${o.ev.allDay ? 'ganztägig' : C.hm(o.start) + '–' + C.hm(o.end)}: **${o.ev.title}**${o.ev.taskId ? ' (Zeitblock)' : ''}${o.ev.loc ? ' (' + o.ev.loc + ')' : ''}, ${areaName(o.ev.area)}${o.ev.cat ? ', ' + catName(o.ev.cat) : ''}`);
    }
    files.set(`Kalender/${m0.getFullYear()}-${C.pad(m0.getMonth() + 1)}.md`, L.join('\n') + '\n');
  }

  // Fokus-Log pro Monat (letzte 3 Monate)
  for (let k = -2; k <= 0; k++) {
    const m0 = new Date(now.getFullYear(), now.getMonth() + k, 1);
    const m1 = new Date(now.getFullYear(), now.getMonth() + k + 1, 1);
    const list = live('focus').filter(f => f.s >= m0.getTime() && f.s < m1.getTime()).sort((a, b) => a.s - b.s);
    if (!list.length) continue;
    const total = list.filter(f => f.ok).reduce((a, f) => a + (f.min || 0), 0);
    const L = ['---', 'tags: [zeitblick, fokus]', `fokus_min_gesamt: ${Math.round(total)}`, '---', `# Fokus ${C.MONTHS[m0.getMonth()]} ${m0.getFullYear()}`, '', `Gesamt: ${C.fmtDuration(total)} in ${list.filter(f => f.ok).length} Einheiten.`, '', '| Datum | Start | Minuten | Ergebnis | Vorgang | Kategorie |', '|---|---|---|---|---|---|'];
    for (const f of list) {
      const t = getL('tasks', f.taskId);
      L.push(`| ${C.ymd(new Date(f.s))} | ${C.hm(new Date(f.s))} | ${Math.round(f.min || 0)} | ${f.ok ? '✅ geschafft' : '❌ abgebrochen'} | ${t ? t.title.replace(/\|/g, '/') : ''} | ${catName(f.cat)} |`);
    }
    files.set(`Fokus/${m0.getFullYear()}-${C.pad(m0.getMonth() + 1)}.md`, L.join('\n') + '\n');
  }

  // Tagesnotizen (letzte 14 Tage bis +7)
  if (S.local.obsidian.daily !== false) {
    const hs = live('habits');
    for (let k = -14; k <= 7; k++) {
      const d = C.addDays(C.startOfDay(now), k);
      const key = C.ymd(d);
      const due = allTasks.filter(t => t.due === key && C.isOpen(t));
      const done = allTasks.filter(t => (C.statusOf(t) === 'erledigt' && t.doneAt && C.ymd(new Date(t.doneAt)) === key) || (t.hist || []).includes(key));
      const ev = C.expandEvents(live('events'), d, C.addDays(d, 1));
      const fo = live('focus').filter(f => f.ok && C.ymd(new Date(f.s)) === key);
      const hDone = hs.filter(h => C.habitDoneOn(h, key));
      if (!due.length && !done.length && !ev.length && !fo.length && !hDone.length) continue;
      const fmin = fo.reduce((a, f) => a + (f.min || 0), 0);
      const L = ['---', `datum: ${key}`, `fokus_min: ${Math.round(fmin)}`, `erledigt: ${done.length}`, `gewohnheiten: ${hDone.length}`, 'tags: [zeitblick, tag]', '---', `# ${C.fmtDateLong(d)} ${d.getFullYear()}`, ''];
      if (ev.length) { L.push('## Termine'); for (const o of ev) L.push(`- ${o.ev.allDay ? 'ganztägig' : C.hm(o.start) + '–' + C.hm(o.end)}: ${o.ev.title}`); L.push(''); }
      if (due.length) { L.push('## Fällig'); for (const t of due) L.push(`- [ ] ${link(t)}${t.dueTime ? ' um ' + t.dueTime : ''}`); L.push(''); }
      if (done.length) { L.push('## Erledigt'); for (const t of done) L.push(`- [x] ${link(t)}`); L.push(''); }
      if (hDone.length) { L.push('## Gewohnheiten'); for (const h of hDone) L.push(`- [x] ${h.title}`); L.push(''); }
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
      if (!next[path] && REMOVABLE.some(p => path.startsWith(p))) { await removeFile(root, path); }
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
