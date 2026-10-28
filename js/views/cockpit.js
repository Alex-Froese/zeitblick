// Cockpit – die Startseite zum Arbeiten: was jetzt zählt, heute ansteht und was offen ist
import * as C from '../core.js';
import * as S from '../store.js';
import * as F from '../focus-engine.js';
import { esc, icon } from '../ui.js';
import { A } from '../app-api.js';
import { taskLine, emptyState, sortTasks, greetingLine, leitsatz, ampDot, ampLevel, catColor, dueInfo } from './common.js';
import { evColor, dayLoad } from './calendar.js';
import { toggleHabit, habitCellState } from './habits.js';
import { markRead } from './notes.js';

function nowCard(now, s, area) {
  const open = S.openTasks(t => S.inArea(t, area));
  const q1 = sortTasks(open.filter(t => C.quadrant(t, now, s) === 1), now);
  const todayKey = C.ymd(now);
  const today = sortTasks(open.filter(t => C.quadrant(t, now, s) !== 1 && ((t.due && t.due <= todayKey && (!t.start || t.start <= todayKey)) || C.statusOf(t) === 'aktiv')), now);
  const q1Html = q1.slice(0, 5).map(t => {
    const d = dueInfo(t, now); const c = S.cat(t.cat);
    return `<div class="li" data-task="${t.id}" tabindex="0">${ampDot(ampLevel(t, now))}<div class="grow"><div class="lt">${esc(t.title)}</div><div class="lm">${d ? `<span class="${d.cls}">${esc(d.txt)}</span>` : ''}${c ? `<span class="tag"><i class="catdot" style="background:${catColor(c)}"></i>${esc(c.name)}</span>` : ''}${C.statusOf(t) !== 'neu' ? `<span>${esc(C.STATUS[C.statusOf(t)].name)}</span>` : ''}</div></div>
      <button class="btn-now" data-act="focus" data-id="${t.id}">${icon('play', 11)}<span>Jetzt erledigen</span></button></div>`;
  }).join('');
  return `${q1.length ? `<div class="card"><div class="card-head"><h2>Sofort erledigen</h2><a class="link" href="#/matrix">Matrix</a></div><div class="list">${q1Html}</div>${q1.length > 5 ? `<a class="small" href="#/matrix" style="display:block;margin-top:8px">+ ${q1.length - 5} weitere</a>` : ''}</div>` : ''}
    <div class="card"><div class="card-head"><h2>Heute</h2><a class="link" href="#/vorgaenge?f=today">Alle Vorgänge</a></div>
    ${today.length ? `<div class="list">${today.slice(0, 8).map(t => taskLine(t, { now })).join('')}</div>${today.length > 8 ? `<a class="small" href="#/vorgaenge?f=today" style="display:block;margin-top:8px">+ ${today.length - 8} weitere</a>` : ''}`
      : emptyState('☀️', q1.length ? 'Sonst steht heute nichts an' : 'Heute ist nichts fällig', 'Plane etwas aus der Inbox oder nimm dir einen wichtigen Vorgang aus Quadrant 2 vor.', '<a class="btn sm" href="#/kalender">Zum Kalender</a>')}</div>`;
}

function dayPlan(now, area) {
  const d0 = C.startOfDay(now), d1 = C.addDays(d0, 1);
  const occ = C.expandEvents(S.events(e => S.inArea(e, area)), d0, d1).sort((a, b) => (a.ev.allDay ? -1 : a.start) - (b.ev.allDay ? -1 : b.start));
  const load = dayLoad(d0);
  let nowShown = false;
  const rows = [];
  for (const o of occ) {
    const ev = o.ev;
    const past = !ev.allDay && o.end <= now;
    if (!nowShown && !ev.allDay && o.start > now) { rows.push('<div class="tl-now">Jetzt</div>'); nowShown = true; }
    const t = ev.taskId ? S.task(ev.taskId) : null;
    const done = ev.taskId && (ev.boxDone || !t || C.isClosed(t));
    rows.push(`<div class="tl-item ${past ? 'past' : ''}" data-event="${ev.id}" data-occ="${o.start.getTime()}"><div class="tl-time">${ev.allDay ? 'ganzt.' : `${C.hm(o.start)}<br><span class="faint">${C.hm(o.end)}</span>`}</div><div class="tl-bar" style="background:${evColor(ev)}"></div>
      <div><div class="tl-t" style="${done ? 'text-decoration:line-through;color:var(--muted)' : ''}">${esc(ev.title)}</div><div class="tl-s">${ev.taskId ? 'Zeitblock' : ev.loc ? esc(ev.loc) : ''}</div></div>
      ${t && !done && !past ? `<button class="icon-btn sm" data-act="focus" data-id="${t.id}" aria-label="Fokus starten" title="Fokus starten">${icon('play', 13)}</button>` : '<span></span>'}</div>`);
  }
  if (!nowShown && occ.length) rows.push('<div class="tl-now">Jetzt</div>');
  const free = Math.max(0, load.total - load.used);
  return `<div class="card"><div class="card-head"><h2>Tagesplan</h2><span class="small muted">${esc(C.fmtDuration(Math.round(free)))} frei</span><a class="link" href="#/kalender/tag/${C.ymd(now)}">Kalender</a></div>
    ${occ.length ? `<div class="tl">${rows.join('')}</div>` : emptyState('🗓️', 'Noch nichts geplant', 'Ziehe Vorgänge im Kalender in deinen Tag – mit etwas Leerraum dazwischen.', '<a class="btn sm" href="#/kalender/tag">Tag planen</a>')}</div>`;
}

function habitsCard(now) {
  const k = C.ymd(now);
  const list = S.habits(h => !h.archived && C.habitDueOn(h, now)).sort((a, b) => (a.time || '99').localeCompare(b.time || '99') || (a.order ?? 99) - (b.order ?? 99));
  if (!list.length) return '';
  const open = list.filter(h => !C.habitDoneOn(h, k)).length;
  return `<div class="card"><div class="card-head"><h2>Gewohnheiten</h2><span class="small muted">${list.length - open}/${list.length}</span><a class="link" href="#/gewohnheiten">Alle</a></div>
    ${list.slice(0, 7).map(h => { const st = habitCellState(h, k); return `<div class="habit-mini"><button class="hcell ${st.cls}" data-habit="${h.id}" data-day="${k}" aria-label="${esc(h.title)} heute">${st.label}</button><div class="grow ellip">${esc(h.title)}</div><span class="small muted">${h.time ? esc(h.time) : ''}</span></div>`; }).join('')}</div>`;
}

function notesCard(now) {
  const list = S.notes(n => C.noteOpenToday(n, now));
  if (!list.length) return '';
  return `<div class="card"><div class="card-head"><h2>Zum Einprägen</h2><a class="link" href="#/notizen">Notizen</a></div>
    ${list.slice(0, 3).map(n => `<div class="li" style="cursor:default"><div class="grow"><a class="lt" href="#/notizen/${n.id}" style="color:var(--ink)">${esc(n.title)}</a><div class="lm">${esc(String(n.body || '').replace(/\s+/g, ' ').slice(0, 90))}${(n.body || '').length > 90 ? ' …' : ''}</div></div><button class="btn sm" data-read="${n.id}">${icon('check', 13)}Gelesen</button></div>`).join('')}</div>`;
}

function klaerCard(now, area) {
  const list = S.openTasks(t => C.typeOf(t) !== 'aufgabe' && S.inArea(t, area));
  if (!list.length) return '';
  sortTasks(list, now);
  return `<div class="card"><div class="card-head"><h2>Klärungen & Vorsätze</h2><a class="link" href="#/vorgaenge?type=klaerung,vorsatz">Alle</a></div><div class="list">${list.slice(0, 4).map(t => taskLine(t, { now, focus: false })).join('')}</div></div>`;
}

export function render() {
  const now = A.now();
  const s = S.settings();
  const area = A.area();
  const open = S.openTasks(t => S.inArea(t, area));
  const todayKey = C.ymd(now);
  const due = open.filter(t => t.due && t.due <= todayKey).length;
  const red = open.filter(t => { const l = C.ampel(t, now, s).level; return l === 'red' || l === 'alarm'; }).length;
  const inbox = S.inboxItems();
  const inboxRed = inbox.filter(x => C.inboxAmpel(x, now) === 'red').length;
  const st = F.stats(now);
  const run = F.run();
  return `<div class="page">
    <div class="hello"><h1>${esc(greetingLine())}</h1><div class="date">${esc(C.fmtDateLong(now))} · KW ${weekNo(now)}</div><div class="leit">„${esc(leitsatz(now))}“</div></div>
    ${run ? `<a class="banner" href="#/fokus" style="text-decoration:none;color:inherit">${icon('focus', 16)}<span class="grow">Fokus läuft${run.title ? ': <b>' + esc(run.title) + '</b>' : ''}</span><span class="link-btn">Öffnen</span></a>` : ''}
    <div class="stats">
      <a class="stat" href="#/vorgaenge?f=today"><div class="l">Heute fällig</div><div class="v">${due}</div><div class="s">${open.length} offen insgesamt</div></a>
      <a class="stat" href="#/vorgaenge?f=over"><div class="l">Überfällig</div><div class="v ${red ? 'red' : ''}">${red}</div><div class="s">${red ? 'Ampel rot' : 'Alles im Plan'}</div></a>
      <a class="stat" href="#/inbox"><div class="l">Inbox</div><div class="v ${inboxRed ? 'red' : ''}">${inbox.length}</div><div class="s">${inboxRed ? `${inboxRed} warten zu lange` : 'zum Einsortieren'}</div></a>
      <a class="stat" href="#/fokus"><div class="l">Fokus heute</div><div class="v">${esc(C.fmtDurShort(st.todayMin || 0))}</div><div class="s">${st.streak ? `${st.streak} Tage in Folge` : 'Starte eine Einheit'}</div></a>
    </div>
    <div class="grid g-main">
      <div class="stack">${nowCard(now, s, area)}${klaerCard(now, area)}</div>
      <div class="stack">${dayPlan(now, area)}${habitsCard(now)}${notesCard(now)}</div>
    </div>
  </div>`;
}

function weekNo(d) {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = x.getUTCDay() || 7;
  x.setUTCDate(x.getUTCDate() + 4 - day);
  return Math.ceil(((x - new Date(Date.UTC(x.getUTCFullYear(), 0, 1))) / C.DAY + 1) / 7);
}

export function mount(root) {
  root.addEventListener('click', e => {
    const h = e.target.closest('[data-habit]');
    if (h) { toggleHabit(h.dataset.habit, h.dataset.day, h); return; }
    const r = e.target.closest('[data-read]');
    if (r) { markRead(r.dataset.read); }
  });
}
