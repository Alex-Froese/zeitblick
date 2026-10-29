// Heute – die eine verbindliche Tagesansicht: Ring, Jetzt & Nächstes, Tagesplan und alles, was heute dran ist
import * as C from '../core.js';
import * as S from '../store.js';
import * as F from '../focus-engine.js';
import { esc, icon, sheet, toast, makeSortable, burst } from '../ui.js';
import { A } from '../app-api.js';
import { greetingLine, leitsatz, ampDot, catColor, dueInfo, emptyState } from './common.js';
import { evColor } from './calendar.js';
import { toggleHabit, habitCellState } from './habits.js';
import { markRead } from './notes.js';

export const BLOCKS = {
  now: { name: 'Jetzt & Nächstes', hint: 'Was gerade läuft und was als Nächstes kommt' },
  tasks: { name: 'Vorgänge heute', hint: 'Fällig, überfällig und mehrmals täglich' },
  routines: { name: 'Routinen', hint: 'Mit Start-Knopf für den Routine-Player' },
  habits: { name: 'Gewohnheiten', hint: 'Schnell abhaken, mit Rückgängig' },
  plan: { name: 'Tagesplan', hint: 'Termine, Zeitblöcke und Themenblöcke' },
  notes: { name: 'Einprägen', hint: 'Notizen, die du heute lesen willst' },
  yesterday: { name: 'Von gestern offen', hint: 'Was gestern liegen blieb' },
  review: { name: 'Rückblick', hint: 'Tagesabschluss und Wochen-/Monatsrückblick' },
};
const DEFAULT_COLS = { a: ['now', 'tasks', 'routines', 'habits'], b: ['plan', 'notes', 'yesterday', 'review'] };

export function layout() {
  const h = S.settings().heute || {};
  const cols = h.cols && h.cols.a ? { a: [...h.cols.a], b: [...(h.cols.b || [])] } : { a: [...DEFAULT_COLS.a], b: [...DEFAULT_COLS.b] };
  const known = new Set([...cols.a, ...cols.b]);
  for (const k of Object.keys(BLOCKS)) if (!known.has(k)) (DEFAULT_COLS.a.includes(k) ? cols.a : cols.b).push(k);
  cols.a = cols.a.filter(k => BLOCKS[k]); cols.b = cols.b.filter(k => BLOCKS[k]);
  return { cols, hidden: new Set(h.hidden || []) };
}

function kw(now) { const w = C.isoWeek(now); const t = C.weekType(S.settings(), now); return `KW ${w.week}${t === 'a' ? ' · A-Woche' : t === 'b' ? ' · B-Woche' : t === 'ferien' ? ' · Ferien' : ''}`; }

/* ---------------- Tagesring ---------------- */
function bigRing(ag) {
  const size = 132, stroke = 11, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const order = ['task', 'multi', 'routine', 'habit', 'note', 'review'];
  const total = ag.total || 1;
  let off = 0;
  const segs = [];
  for (const k of order) {
    const x = ag.kinds[k]; if (!x) continue;
    const len = (x[1] / total) * c, doneLen = (x[0] / total) * c;
    const gap = ag.total > 1 ? Math.min(3, len * 0.25) : 0;
    segs.push(`<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--surface-3)" stroke-width="${stroke}" stroke-dasharray="${Math.max(0, len - gap).toFixed(1)} ${c.toFixed(1)}" stroke-dashoffset="${(-off).toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>`);
    if (doneLen > 0) segs.push(`<circle class="ring-seg" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${C.AGENDA_KINDS[k].color}" stroke-width="${stroke}" stroke-linecap="butt" stroke-dasharray="${Math.max(0, doneLen - (doneLen >= len ? gap : 0)).toFixed(1)} ${c.toFixed(1)}" stroke-dashoffset="${(-off).toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>`);
    off += len;
  }
  if (!ag.total) segs.push(`<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--surface-3)" stroke-width="${stroke}"/>`);
  const p = ag.total ? Math.round((ag.done / ag.total) * 100) : 0;
  return `<div class="day-ring ${ag.total && ag.done >= ag.total ? 'full' : ''}"><svg viewBox="0 0 ${size} ${size}" aria-hidden="true">${segs.join('')}</svg><div class="dr-c"><b>${ag.total ? p + '%' : '–'}</b><span>${ag.done} von ${ag.total}</span></div></div>`;
}

function heroHtml(now, ag, s) {
  const area = A.area();
  const open = S.openTasks(t => S.inArea(t, area));
  const red = open.filter(t => { const l = C.ampel(t, now, s).level; return l === 'red' || l === 'alarm'; }).length;
  const inbox = S.inboxItems();
  const inboxRed = inbox.filter(x => C.inboxAmpel(x, now) === 'red').length;
  const fs = F.stats(now);
  const kinds = ['task', 'multi', 'routine', 'habit', 'note', 'review'].filter(k => ag.kinds[k]);
  return `<div class="hero card">
    ${bigRing(ag)}
    <div class="hero-mid">
      <div class="hero-kinds">${kinds.map(k => { const [d, t] = ag.kinds[k]; return `<a class="hk ${d >= t ? 'ok' : ''}" href="#/heute" data-jump="${k}"><i style="background:${C.AGENDA_KINDS[k].color}"></i><span>${esc(C.AGENDA_KINDS[k].name)}</span><b>${d}/${t}</b></a>`; }).join('') || '<span class="small muted">Für heute ist noch nichts Verbindliches geplant.</span>'}</div>
    </div>
    <div class="hero-tiles">
      <a class="htile ${red ? 'red' : ''}" href="#/vorgaenge?f=over"><b>${red}</b><span>Überfällig</span></a>
      <a class="htile ${inboxRed ? 'red' : ''}" href="#/inbox"><b>${inbox.length}</b><span>Inbox</span></a>
      <a class="htile" href="#/fokus"><b>${esc(C.fmtDurShort(fs.todayMin || 0))}</b><span>Fokus</span></a>
    </div>
  </div>`;
}

/* ---------------- Blöcke ---------------- */
function card(id, title, body, { extra = '', count = '', cls = '' } = {}) {
  return `<section class="card hb ${cls}" data-block="${id}" id="hb-${id}"><div class="card-head"><h2>${title}</h2>${count ? `<span class="small muted">${count}</span>` : ''}<span class="sp"></span>${extra}</div>${body}</section>`;
}

function occToday(now) {
  const area = A.area();
  const d0 = C.startOfDay(now), d1 = C.addDays(d0, 1);
  return C.expandEvents(S.events(e => S.inArea(e, area)), d0, d1).filter(o => !o.ev.allDay || true).sort((a, b) => (a.ev.allDay ? -1 : a.start) - (b.ev.allDay ? -1 : b.start));
}

function evLinkBtn(ev) {
  const l = ev.link;
  if (!l || !l.id) return '';
  const r = S.get(l.c, l.id); if (!r) return '';
  if (l.c === 'habits' && r.kind === 'routine') return `<button class="btn sm btn-go" data-routine="${r.id}">${icon('play', 11)}Routine</button>`;
  if (l.c === 'habits') return `<button class="btn sm" data-hopen="${r.id}">${icon('check', 11)}${esc(r.title)}</button>`;
  if (l.c === 'tasks' && C.isOpen(r)) return `<button class="btn sm" data-act="focus" data-id="${r.id}">${icon('play', 11)}Fokus</button>`;
  return `<button class="btn sm btn-ghost" data-item="${l.c}:${l.id}">${icon(C.LINKABLE[l.c].icon, 12)}Öffnen</button>`;
}

function suggestionsFor(ev, now) {
  // Themenblock: passende offene Vorgänge (gleiche Kategorie, verknüpft, gleicher Bereich)
  const list = S.openTasks(t => (ev.cat && t.cat === ev.cat) || (ev.link && ev.link.c === 'tasks' && ev.link.id === t.id) || (ev.link && ev.link.c === 'projects' && t.project === ev.link.id));
  const s = S.settings();
  return list.sort((a, b) => (C.quadrant(a, now, s) - C.quadrant(b, now, s)) || (a.prio || 3) - (b.prio || 3) || (a.due || '9').localeCompare(b.due || '9')).slice(0, 3);
}

function nowBlock(now, ag) {
  const occ = occToday(now).filter(o => !o.ev.allDay);
  const curTheme = occ.find(o => o.ev.theme && o.start <= now && o.end > now);
  const cur = occ.find(o => !o.ev.theme && o.start <= now && o.end > now);
  const next = occ.find(o => !o.ev.theme && o.start > now);
  const nextItem = ag.items.filter(x => !x.done && x.at && x.at > now.getTime()).sort((a, b) => a.at - b.at)[0];
  const overdue = ag.items.filter(x => !x.done && x.overdue).length;
  const run = F.run();
  const rows = [];
  if (run) rows.push(`<a class="nx run" href="#/fokus"><span class="nx-k">Fokus läuft</span><span class="nx-t">${esc(run.title || 'Fokuseinheit')}</span><span class="nx-m">${icon('focus', 13)}</span></a>`);
  if (cur) {
    const left = Math.round((cur.end - now) / C.MIN);
    rows.push(`<div class="nx cur" data-event="${cur.ev.id}" data-occ="${cur.start.getTime()}"><span class="nx-bar" style="background:${evColor(cur.ev)}"></span><span class="nx-k">Jetzt</span><span class="nx-t">${esc(cur.ev.title)}</span><span class="nx-m">noch ${esc(C.fmtDuration(left))}</span>${evLinkBtn(cur.ev)}</div>`);
  }
  if (curTheme) {
    const sug = suggestionsFor(curTheme.ev, now);
    rows.push(`<div class="nx theme" data-event="${curTheme.ev.id}" data-occ="${curTheme.start.getTime()}"><span class="nx-bar" style="background:${evColor(curTheme.ev)}"></span><span class="nx-k">Thema</span><span class="nx-t">${esc(curTheme.ev.title)} <span class="faint">bis ${C.hm(curTheme.end)}</span></span>${evLinkBtn(curTheme.ev)}</div>
      ${sug.length ? `<div class="nx-sug">${sug.map(t => `<div class="nx-s" data-task="${t.id}">${ampDot(C.ampel(t, now, S.settings()).level)}<span class="grow ellip">${esc(t.title)}</span><button class="icon-btn sm" data-act="focus" data-id="${t.id}" title="Im Fokus bearbeiten" aria-label="Fokus">${icon('play', 12)}</button></div>`).join('')}</div>` : ''}`);
  }
  if (next) rows.push(`<div class="nx" data-event="${next.ev.id}" data-occ="${next.start.getTime()}"><span class="nx-bar" style="background:${evColor(next.ev)}"></span><span class="nx-k">Um ${C.hm(next.start)}</span><span class="nx-t">${esc(next.ev.title)}</span><span class="nx-m">in ${esc(C.fmtDuration(Math.round((next.start - now) / C.MIN)))}</span>${evLinkBtn(next.ev)}</div>`);
  if (nextItem) rows.push(`<div class="nx soft"><span class="nx-k">${C.hm(new Date(nextItem.at))}</span><span class="nx-t">${esc(nextItem.title)}</span><span class="nx-m">${esc(C.AGENDA_KINDS[nextItem.kind].name)}</span>${actionFor(nextItem)}</div>`);
  if (overdue) rows.push(`<a class="nx warn" href="#hb-tasks" data-jump="task"><span class="nx-k">Achtung</span><span class="nx-t">${overdue} ${overdue === 1 ? 'Sache ist' : 'Sachen sind'} überfällig</span><span class="nx-m">${icon('alert', 13)}</span></a>`);
  return card('now', 'Jetzt & Nächstes', rows.length ? `<div class="nx-list">${rows.join('')}</div>` : `<div class="small muted">Gerade ist nichts geplant. ${ag.total - ag.done ? `Noch ${ag.total - ag.done} offen für heute.` : 'Genieß den Freiraum.'}</div>`);
}

function actionFor(it) {
  if (it.kind === 'task') return `<button class="icon-btn sm" data-act="focus" data-id="${it.id}" aria-label="Fokus starten" title="Fokus starten">${icon('play', 12)}</button>`;
  if (it.kind === 'multi') return `<button class="btn sm" data-act="multi" data-id="${it.id}">${icon('check', 12)}${it.prog ? `${it.prog[0] + 1}/${it.prog[1]}` : ''}</button>`;
  if (it.kind === 'routine') return `<button class="btn sm btn-go" data-routine="${it.id}">${icon('play', 11)}Start</button>`;
  if (it.kind === 'habit') return `<button class="btn sm" data-hopen="${it.id}">${icon('check', 12)}</button>`;
  if (it.kind === 'note') return `<button class="btn sm" data-read="${it.id}">${icon('check', 12)}Gelesen</button>`;
  if (it.kind === 'review') return `<button class="btn sm" data-review="${it.id}">Starten</button>`;
  return '';
}

function tasksBlock(now, ag) {
  const area = A.area();
  const s = S.settings();
  const list = ag.items.filter(x => (x.kind === 'task' || x.kind === 'multi') && S.inArea(x.rec, area));
  const open = list.filter(x => !x.done).sort((a, b) => (b.overdue ? 1 : 0) - (a.overdue ? 1 : 0) || C.quadrant(a.rec, now, s) - C.quadrant(b.rec, now, s) || (a.at || 9e15) - (b.at || 9e15));
  const done = list.filter(x => x.done);
  const row = x => {
    const t = x.rec; const d = dueInfo(t, now); const c = S.cat(t.cat);
    if (x.kind === 'multi') {
      return `<div class="ag-row ${x.done ? 'done' : ''}" data-task="${t.id}"><button class="mchk ${x.done ? 'on' : ''}" ${x.done ? 'disabled' : `data-act="multi" data-id="${t.id}"`} aria-label="Durchgang abhaken">${x.done ? icon('check', 12) : `${x.prog[0]}/${x.prog[1]}`}</button><div class="grow"><div class="lt">${esc(t.title)}</div><div class="lm"><span>${icon('repeat', 11)} ${esc(C.describeMulti(t))}</span>${x.at && !x.done ? `<span>nächstes ${C.hm(new Date(x.at))}</span>` : ''}</div></div><div class="pdots">${[...Array(Math.min(12, x.prog[1]))].map((_, i) => `<i class="${i < x.prog[0] ? 'on' : ''}"></i>`).join('')}</div></div>`;
    }
    return `<div class="ag-row ${x.done ? 'done' : ''}" data-task="${t.id}">${x.done ? `<span class="chk on">${icon('check', 11)}</span>` : `<button class="chk" data-act="done" data-id="${t.id}" aria-label="Erledigen">${icon('check', 11)}</button>`}<div class="grow"><div class="lt">${esc(t.title)}</div><div class="lm">${!x.done ? ampDot(x.level) : ''}${d && !x.done ? `<span class="${d.cls}">${esc(d.txt)}</span>` : ''}${c ? `<span class="tag"><i class="catdot" style="background:${catColor(c)}"></i>${esc(c.name)}</span>` : ''}${t.delegate ? `<span>→ ${esc(t.delegate)}</span>` : ''}</div></div>${!x.done ? `<button class="icon-btn sm" data-act="focus" data-id="${t.id}" aria-label="Fokus starten" title="Fokus starten">${icon('play', 12)}</button>` : ''}</div>`;
  };
  const body = open.length || done.length ? `<div class="ag-list">${open.map(row).join('')}</div>${done.length ? `<details class="ag-done"><summary>${done.length} erledigt</summary><div class="ag-list">${done.map(row).join('')}</div></details>` : ''}`
    : emptyState('☀️', 'Heute ist kein Vorgang fällig', 'Nimm dir etwas Wichtiges aus Quadrant 2 vor oder plane die Woche.', '<a class="btn sm" href="#/vorgaenge?mode=matrix">Zur Matrix</a>');
  return card('tasks', 'Vorgänge heute', body, { count: list.length ? `${done.length}/${list.length}` : '', extra: `<button class="icon-btn sm" data-newtask title="Neuer Vorgang für heute" aria-label="Neuer Vorgang">${icon('plus', 15)}</button><a class="link" href="#/vorgaenge">Alle</a>` });
}

function routinesBlock(now, ag) {
  const list = ag.items.filter(x => x.kind === 'routine' && S.inArea(x.rec, A.area()));
  if (!list.length) return card('routines', 'Routinen', `<div class="small muted">Heute keine Routine geplant. <a href="#/gewohnheiten" data-newroutine>Routine anlegen</a></div>`, { cls: 'thin' });
  return card('routines', 'Routinen', `<div class="rt-list">${list.sort((a, b) => (a.at || 9e15) - (b.at || 9e15)).map(x => {
    const h = x.rec; const pm = (h.steps || []).reduce((a, s0) => a + (Number(s0.min) || 0), 0);
    return `<div class="rt ${x.done ? 'done' : ''}" style="--rc:${h.color || 'var(--accent)'}"><div class="rt-ring">${miniRing(x.prog[0], x.prog[1])}</div><div class="grow"><div class="lt">${esc(h.title)}</div><div class="lm">${x.at ? `<span>${C.hm(new Date(x.at))}</span>` : ''}<span>${x.prog[1]} Schritte</span>${pm ? `<span>${esc(C.fmtDuration(pm))}</span>` : ''}</div></div>${x.done ? `<span class="pill st-erledigt">${icon('check', 11)} geschafft</span>` : `<button class="btn sm btn-go" data-routine="${h.id}">${icon('play', 11)}${x.prog[0] ? 'Weiter' : 'Start'}</button>`}</div>`;
  }).join('')}</div>`, { count: `${list.filter(x => x.done).length}/${list.length}` });
}
function miniRing(d, t) {
  const size = 34, stroke = 4, r = (size - stroke) / 2, c = 2 * Math.PI * r, p = t ? d / t : 0;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--surface-3)" stroke-width="${stroke}"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--rc, var(--accent))" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${(c * p).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/></svg>`;
}

function habitsBlock(now, ag) {
  const k = C.ymd(now);
  const list = ag.items.filter(x => x.kind === 'habit' && S.inArea(x.rec, A.area())).sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0) || (a.at || 9e15) - (b.at || 9e15));
  if (!list.length) return card('habits', 'Gewohnheiten', `<div class="small muted">Heute keine Gewohnheit fällig. <a href="#/gewohnheiten">Gewohnheiten</a></div>`, { cls: 'thin' });
  return card('habits', 'Gewohnheiten', `<div class="hb-grid">${list.map(x => { const h = x.rec; const st = habitCellState(h, k); const streak = C.habitStreak(h, now); return `<div class="hb-i ${x.done ? 'done' : ''} ${x.failed ? 'fail' : ''}"><button class="hcell ${st.cls}" data-habit="${h.id}" data-day="${k}" aria-label="${esc(h.title)} abhaken">${st.label}</button><div class="grow ellip"><span>${esc(h.title)}</span>${h.kind === 'count' || h.kind === 'limit' ? `<span class="tiny muted"> ${h.kind === 'limit' ? '≤' : '≥'}${h.target} ${esc(h.unit || '')}</span>` : ''}</div>${streak > 1 ? `<span class="streak tiny">${streak}${icon('bolt', 10, 'inl')}</span>` : x.at ? `<span class="tiny muted">${C.hm(new Date(x.at))}</span>` : ''}</div>`; }).join('')}</div>`, { count: `${list.filter(x => x.done).length}/${list.length}`, extra: '<a class="link" href="#/gewohnheiten">Alle</a>' });
}

function planBlock(now) {
  const occ = occToday(now);
  const allDay = occ.filter(o => o.ev.allDay);
  const timed = occ.filter(o => !o.ev.allDay);
  const hol = C.inHoliday(S.settings(), now);
  let nowShown = false;
  const rows = [];
  for (const o of timed) {
    const ev = o.ev;
    const past = o.end <= now;
    if (!nowShown && o.start > now) { rows.push(`<div class="tl-now">Jetzt ${C.hm(now)}</div>`); nowShown = true; }
    const t = ev.taskId ? S.task(ev.taskId) : null;
    const done = ev.taskId && (ev.boxDone || !t || C.isClosed(t));
    const linkH = ev.link && ev.link.c === 'habits' ? S.get('habits', ev.link.id) : null;
    const linkDone = linkH && C.habitDoneOn(linkH, C.ymd(now));
    rows.push(`<div class="tl-item ${past ? 'past' : ''} ${ev.theme ? 'theme' : ''}" data-event="${ev.id}" data-occ="${o.start.getTime()}"><div class="tl-time">${C.hm(o.start)}<br><span class="faint">${C.hm(o.end)}</span></div><div class="tl-bar" style="background:${evColor(ev)}"></div>
      <div class="grow"><div class="tl-t" style="${done || linkDone ? 'text-decoration:line-through;color:var(--muted)' : ''}">${esc(ev.title)}</div><div class="tl-s">${ev.theme ? 'Themenblock' : ev.taskId ? 'Zeitblock' : ev.loc ? esc(ev.loc) : ''}${linkH ? ` · ${esc(linkH.title)}` : ''}</div></div>
      ${!past ? (t && !done ? `<button class="icon-btn sm" data-act="focus" data-id="${t.id}" aria-label="Fokus starten" title="Fokus starten">${icon('play', 12)}</button>` : evLinkBtn(ev)) : ''}</div>`);
  }
  if (!nowShown && timed.length) rows.push(`<div class="tl-now">Jetzt ${C.hm(now)}</div>`);
  const head = `${hol ? `<div class="chip-hol">🏖️ ${esc(hol.name || 'Ferien')}</div>` : ''}${allDay.map(o => `<div class="chipev" data-event="${o.ev.id}" style="--ec:${evColor(o.ev)}">${esc(o.ev.title)}</div>`).join('')}`;
  const tplHint = !timed.length ? `<a class="btn sm" href="#/kalender/woche" data-tplplan>${icon('calendar', 13)}Woche aus Vorlage planen</a>` : '';
  return card('plan', 'Tagesplan', `${head ? `<div class="chips" style="margin-bottom:8px">${head}</div>` : ''}${timed.length ? `<div class="tl">${rows.join('')}</div>` : emptyState('🗓️', 'Noch nichts geplant', 'Plane deinen Tag im Kalender oder nutze eine Vorlage.', `<a class="btn sm" href="#/kalender/tag">Tag planen</a>${tplHint}`)}`, { extra: `<a class="link" href="#/kalender/tag/${C.ymd(now)}">Kalender</a>` });
}

function notesBlock(now, ag) {
  const list = ag.items.filter(x => x.kind === 'note');
  if (!list.length) return '';
  return card('notes', 'Einprägen', `${list.sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0)).map(x => { const n = x.rec; return `<div class="ag-row ${x.done ? 'done' : ''}"><span class="np">${x.prog[0]}/${x.prog[1]}</span><div class="grow"><a class="lt" href="#/notizen/${n.id}?lesen=1" style="color:var(--ink)">${esc(n.title || 'Notiz')}</a><div class="lm ellip">${esc(String(n.body || '').replace(/\s+/g, ' ').slice(0, 110))}</div></div>${x.done ? icon('check', 14) : `<button class="btn sm" data-read="${n.id}">${icon('check', 12)}Gelesen</button>`}</div>`; }).join('')}`, { count: `${list.filter(x => x.done).length}/${list.length}` });
}

function yesterdayItems(now) {
  const y = C.addDays(C.startOfDay(now), -1);
  const ag = C.agendaFor(S.getData(), y, now);
  return { y, items: ag.items.filter(x => !x.done && (x.kind === 'habit' || x.kind === 'routine' || x.kind === 'review' || x.kind === 'note')) };
}
function yesterdayBlock(now) {
  if (S.local.yDismiss === C.ymd(now)) return '';
  const { y, items } = yesterdayItems(now);
  const overdue = S.openTasks(t => t.due && t.due === C.ymd(y) && S.inArea(t, A.area()));
  if (!items.length && !overdue.length) return '';
  const yk = C.ymd(y);
  return card('yesterday', 'Von gestern offen', `<div class="ag-list">
    ${overdue.map(t => `<div class="ag-row" data-task="${t.id}"><button class="chk" data-act="done" data-id="${t.id}" aria-label="Erledigen">${icon('check', 11)}</button><div class="grow"><div class="lt">${esc(t.title)}</div><div class="lm"><span class="over">gestern fällig</span></div></div><button class="btn sm btn-ghost" data-totoday="${t.id}">Auf heute</button></div>`).join('')}
    ${items.map(x => {
      if (x.kind === 'habit') { const st = habitCellState(x.rec, yk); return `<div class="ag-row"><button class="hcell ${st.cls}" data-habit="${x.id}" data-day="${yk}" aria-label="${esc(x.title)} gestern">${st.label}</button><div class="grow"><div class="lt">${esc(x.title)}</div><div class="lm"><span>Gewohnheit · nachtragen</span></div></div></div>`; }
      if (x.kind === 'routine') return `<div class="ag-row"><span class="np">${x.prog[0]}/${x.prog[1]}</span><div class="grow"><div class="lt">${esc(x.title)}</div><div class="lm"><span>Routine</span></div></div><button class="btn sm" data-routine="${x.id}" data-rday="${yk}">Nachtragen</button></div>`;
      if (x.kind === 'review') return `<div class="ag-row"><span class="np">🌙</span><div class="grow"><div class="lt">${esc(x.title)}</div><div class="lm"><span>von gestern</span></div></div><button class="btn sm" data-review="${x.id}" data-rday="${yk}">Nachholen</button></div>`;
      return `<div class="ag-row"><span class="np">${x.prog[0]}/${x.prog[1]}</span><div class="grow"><div class="lt">${esc(x.title)}</div><div class="lm"><span>Einprägen</span></div></div></div>`;
    }).join('')}</div>`, { extra: '<button class="link-btn" data-ydismiss>Ausblenden</button>' });
}

function reviewBlock(now, ag) {
  const list = ag.items.filter(x => x.kind === 'review');
  const last = S.reviews().filter(r => r.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0))[0];
  if (!list.length && !last) return '';
  return card('review', 'Rückblick', `${list.map(x => `<div class="ag-row ${x.done ? 'done' : ''}"><span class="np">${C.REVIEW_TYPES[x.id].icon}</span><div class="grow"><div class="lt">${esc(x.title)}</div><div class="lm"><span>${C.hm(new Date(x.at))} Uhr</span><span>${x.id === 'day' ? 'ca. 10 Min' : 'ca. 15–20 Min'}</span></div></div>${x.done ? `<a class="btn sm btn-ghost" href="#/rueckblick">Ansehen</a>` : `<button class="btn sm ${x.at <= now.getTime() ? 'btn-primary' : ''}" data-review="${x.id}">Starten</button>`}</div>`).join('')}
    ${last ? `<div class="tiny muted" style="margin-top:6px">Zuletzt: ${esc(C.REVIEW_TYPES[last.type].name)} · ${esc(C.fmtRelTime(last.doneAt))}${last.word ? ` · „${esc(last.word)}“` : ''}</div>` : ''}`, { extra: '<a class="link" href="#/rueckblick">Archiv</a>' });
}

const RENDER = { now: nowBlock, tasks: tasksBlock, routines: routinesBlock, habits: habitsBlock, plan: planBlock, notes: notesBlock, yesterday: yesterdayBlock, review: reviewBlock };

export function render() {
  const now = A.now();
  const s = S.settings();
  const ag = C.agendaFor(S.getData(), now, now);
  const { cols, hidden } = layout();
  const col = ids => ids.filter(id => !hidden.has(id)).map(id => { try { return RENDER[id](now, ag); } catch (e) { console.error(e); return ''; } }).join('');
  return `<div class="page page-heute">
    <div class="hello row"><div class="grow"><h1>${esc(greetingLine())}</h1><div class="date">${esc(C.fmtDateLong(now))} · ${esc(kw(now))}</div><div class="leit">„${esc(leitsatz(now))}“</div></div>
      <div class="page-actions"><button class="btn btn-ghost sm" data-customize title="Blöcke anpassen">${icon('settings', 14)}<span class="hide-s">Anpassen</span></button></div></div>
    ${heroHtml(now, ag, s)}
    <div class="heute-cols"><div class="stack">${col(cols.a)}</div><div class="stack">${col(cols.b)}</div></div>
  </div>`;
}

/* ---------------- Anpassen ---------------- */
export function openCustomize() {
  const { cols, hidden } = layout();
  const state = { a: [...cols.a], b: [...cols.b], hidden: new Set(hidden) };
  const listHtml = c => state[c].map(id => `<div class="cust-i ${state.hidden.has(id) ? 'off' : ''}" data-sort-id="${id}"><span class="grip" data-grip>${icon('grip', 14)}</span><div class="grow"><b>${esc(BLOCKS[id].name)}</b><div class="tiny muted">${esc(BLOCKS[id].hint)}</div></div><button type="button" class="icon-btn sm" data-mv="${id}" title="In die andere Spalte" aria-label="Spalte wechseln">${icon(c === 'a' ? 'right' : 'left', 14)}</button><label class="switch sm"><input type="checkbox" data-vis="${id}" ${state.hidden.has(id) ? '' : 'checked'}><span class="tr"></span></label></div>`).join('');
  sheet({
    title: 'Heute anpassen', cls: 'sheet-md',
    body: `<p class="small muted" style="margin-top:0">Ziehe die Blöcke in die Reihenfolge, die dir passt. Mit dem Pfeil wechselst du die Spalte, mit dem Schalter blendest du aus. Auf dem Handy stehen beide Spalten untereinander.</p>
      <div class="cust-cols"><div><div class="section-t">Linke Spalte</div><div class="cust-list" data-col="a">${listHtml('a')}</div></div><div><div class="section-t">Rechte Spalte</div><div class="cust-list" data-col="b">${listHtml('b')}</div></div></div>`,
    footer: `<button class="btn btn-ghost" data-reset>Standard</button><span class="sp"></span><button class="btn" data-close>Abbrechen</button><button class="btn btn-primary" data-save>Speichern</button>`,
    onMount: (el, close) => {
      const ac = new AbortController();
      const bind = () => {
        for (const c of ['a', 'b']) {
          const box = el.querySelector(`[data-col="${c}"]`);
          box.innerHTML = listHtml(c);
          makeSortable(box, { handle: '[data-grip]', signal: ac.signal, onDrop: ids => { state[c] = ids; } });
        }
      };
      bind();
      el.addEventListener('click', e => {
        const mv = e.target.closest('[data-mv]');
        if (mv) { const id = mv.dataset.mv; const from = state.a.includes(id) ? 'a' : 'b'; const to = from === 'a' ? 'b' : 'a'; state[from] = state[from].filter(x => x !== id); state[to].push(id); ac.abort(); bindAgain(); return; }
        if (e.target.closest('[data-reset]')) { state.a = [...DEFAULT_COLS.a]; state.b = [...DEFAULT_COLS.b]; state.hidden = new Set(); ac.abort(); bindAgain(); return; }
        if (e.target.closest('[data-save]')) { S.setSettingPath('heute', { ...(S.settings().heute || {}), cols: { a: state.a, b: state.b }, hidden: [...state.hidden] }); toast('Heute angepasst'); close(); }
      });
      el.addEventListener('change', e => { const v = e.target.closest('[data-vis]'); if (v) { if (v.checked) state.hidden.delete(v.dataset.vis); else state.hidden.add(v.dataset.vis); v.closest('.cust-i').classList.toggle('off', !v.checked); } });
      let ctrl = ac;
      function bindAgain() { ctrl = new AbortController(); for (const c of ['a', 'b']) { const box = el.querySelector(`[data-col="${c}"]`); box.innerHTML = listHtml(c); makeSortable(box, { handle: '[data-grip]', signal: ctrl.signal, onDrop: ids => { state[c] = ids; } }); } }
    },
  });
}

export function mount(root) {
  root.addEventListener('click', e => {
    const h = e.target.closest('[data-habit]');
    if (h) { toggleHabit(h.dataset.habit, h.dataset.day, h); return; }
    const ho = e.target.closest('[data-hopen]');
    if (ho) { const x = S.get('habits', ho.dataset.hopen); if (x) toggleHabit(x.id, C.ymd(A.now()), ho); return; }
    const r = e.target.closest('[data-read]');
    if (r) { markRead(r.dataset.read); burst(r, 'var(--warn)'); return; }
    const rt = e.target.closest('[data-routine]');
    if (rt) { e.stopPropagation(); A.startRoutine(rt.dataset.routine, rt.dataset.rday); return; }
    const rv = e.target.closest('[data-review]');
    if (rv) { e.stopPropagation(); A.startReview(rv.dataset.review, rv.dataset.rday ? C.parseYmd(rv.dataset.rday) : undefined); return; }
    const it = e.target.closest('[data-item]');
    if (it) { e.stopPropagation(); const [c, id] = it.dataset.item.split(':'); A.openItem(c, id); return; }
    if (e.target.closest('[data-customize]')) { openCustomize(); return; }
    if (e.target.closest('[data-newtask]')) { A.newTask({ due: C.ymd(A.now()) }); return; }
    if (e.target.closest('[data-ydismiss]')) { S.local.yDismiss = C.ymd(A.now()); S.saveLocal(); A.render(); return; }
    const tt = e.target.closest('[data-totoday]');
    if (tt) { e.stopPropagation(); const t = S.task(tt.dataset.totoday); if (t) { S.put('tasks', C.addLog({ ...t, due: C.ymd(A.now()) }, 'Auf heute verschoben', 'system')); toast('Auf heute verschoben'); } return; }
    const j = e.target.closest('[data-jump]');
    if (j) {
      e.preventDefault();
      const map = { task: 'tasks', multi: 'tasks', routine: 'routines', habit: 'habits', note: 'notes', review: 'review' };
      const el = root.querySelector('#hb-' + map[j.dataset.jump]);
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1200); }
    }
  });
}
