// Kategorie-Dashboard (z. B. alles zu Marketing, Vertrieb, Hygiene, Sport …)
import * as C from '../core.js';
import * as S from '../store.js';
import { esc, icon } from '../ui.js';
import { A } from '../app-api.js';
import { columns, shareBar } from '../charts.js';
import { taskRow, sortTasks, catColor, emptyState, areaName } from './common.js';

export function render(route) {
  const id = route.parts[0];
  const c = S.cat(id);
  if (!c) return emptyState('🤔', 'Kategorie nicht gefunden', 'Vielleicht wurde sie gelöscht.', '<a class="btn" href="#/start">Zum Start</a>');
  const now = A.now();
  const s = S.settings();
  const col = catColor(c);
  const tasks = S.tasks(t => t.cat === id);
  const open = sortTasks(tasks.filter(t => !t.done), now);
  const lv = { alarm: 0, red: 0, yellow: 0, green: 0, none: 0 };
  for (const t of open) lv[C.ampel(t, now, s).level]++;
  const done30 = C.doneByDay(S.getData().tasks, 30, now, t => t.cat === id);
  const done30n = done30.reduce((a, d) => a + d.v, 0);
  const f14 = C.focusMinutesByDay(S.getData().focus, 14, now, f => f.cat === id);
  const f30 = C.focusMinutesByDay(S.getData().focus, 30, now, f => f.cat === id).reduce((a, d) => a + d.v, 0);
  const evs = C.expandEvents(S.events(e => e.cat === id), C.startOfDay(now), C.addDays(now, 30)).slice(0, 12);
  const qCount = [0, 0, 0, 0, 0];
  for (const t of open) qCount[C.quadrant(t, now, s)]++;
  const recurring = tasks.filter(t => t.rec && t.rec.f && !t.done);
  return `
  <div class="page-head" style="align-items:center">
    <div style="width:54px;height:54px;border-radius:14px;display:grid;place-items:center;font-size:28px;background:color-mix(in srgb, ${col} 16%, var(--surface));border:1px solid color-mix(in srgb, ${col} 35%, transparent)">${esc(c.icon || '•')}</div>
    <div class="grow"><h1>${esc(c.name)}</h1><div class="page-sub">${esc(areaName(c.area))}, ${open.length} offen, ${done30n} in 30 Tagen erledigt</div></div>
    <button class="btn" data-act="newEventCat">${icon('calendar', 16)}Termin</button>
    <button class="btn btn-primary" data-act="newTaskCat">${icon('plus', 16)}Aufgabe</button>
  </div>
  <div class="kpis" style="margin-bottom:16px">
    <div class="kpi"><span class="k-l">Offen</span><span class="k-v">${open.length}</span><span class="k-s">${qCount[1]} sofort erledigen</span></div>
    <div class="kpi ${lv.red + lv.alarm ? 'alert' : ''}"><span class="k-l">Überfällig</span><span class="k-v">${lv.red + lv.alarm}</span><span class="k-s">${lv.alarm} im Alarm</span></div>
    <div class="kpi"><span class="k-l">Erledigt</span><span class="k-v">${done30n}</span><span class="k-s">letzte 30 Tage</span></div>
    <div class="kpi"><span class="k-l">Fokuszeit</span><span class="k-v">${esc(C.fmtDurShort(f30))}</span><span class="k-s">letzte 30 Tage</span></div>
    <div class="kpi"><span class="k-l">Termine</span><span class="k-v">${evs.length}</span><span class="k-s">nächste 30 Tage</span></div>
  </div>
  <div class="dgrid">
    <section class="panel c7"><div class="panel-head"><h2>Offene Aufgaben</h2></div>
      <div style="margin-bottom:12px">${shareBar([
        { label: 'Alarm', v: lv.alarm, color: 'var(--alarm)' }, { label: 'Überfällig', v: lv.red, color: 'var(--bad)' },
        { label: 'Bald fällig', v: lv.yellow, color: 'var(--warn)' }, { label: 'Im Plan', v: lv.green + lv.none, color: 'var(--ok)' }])}</div>
      <div class="tlist">${open.length ? open.map(t => taskRow(t, { showCat: false })).join('') : emptyState('🎉', 'Alles erledigt', 'In dieser Kategorie ist nichts offen.')}</div>
    </section>
    <section class="panel c5"><div class="panel-head"><h2>Nächste Termine</h2></div>
      ${evs.length ? evs.map(o => `<div class="age" data-event="${o.ev.id}" data-occ="${o.start.getTime()}"><span class="dot" style="background:${col}"></span><span class="tm">${C.fmtDateShort(o.start)}${o.ev.allDay ? '' : ', ' + C.hm(o.start)}</span><span class="grow ellip">${esc(o.ev.title)}</span></div>`).join('') : '<div class="muted small">Keine Termine in den nächsten 30 Tagen.</div>'}
      ${recurring.length ? `<div class="panel-head" style="margin-top:16px"><h2>Routinen</h2></div>${recurring.map(t => `<div class="age" data-task="${t.id}"><span class="dot" style="background:${col}"></span><span class="grow ellip">${esc(t.title)}</span>${C.streakOf(t.hist, now) ? `<span class="small muted">🔥 ${C.streakOf(t.hist, now)}</span>` : ''}</div>`).join('')}` : ''}
    </section>
    <section class="panel c6"><div class="panel-head"><h2>Erledigt pro Tag</h2><span class="small muted">30 Tage</span></div>
      ${columns(done30.map(d => ({ label: d.d.getDate() % 5 === 0 ? String(d.d.getDate()) : '', v: d.v, tip: `${C.fmtDateShort(d.d)}: ${d.v}` })), { color: col, highlight: 29, ariaLabel: 'Erledigte Aufgaben pro Tag' })}
    </section>
    <section class="panel c6"><div class="panel-head"><h2>Fokuszeit</h2><span class="small muted">14 Tage</span></div>
      ${columns(f14.map(d => ({ label: String(d.d.getDate()), v: d.v, tip: `${C.fmtDateShort(d.d)}: ${C.fmtDuration(d.v)}` })), { color: col, highlight: 13, unit: ' Min', fmt: v => C.fmtDurShort(v), minMax: 60, ariaLabel: 'Fokus pro Tag' })}
    </section>
  </div>`;
}

export function mount(root, ctx, route) {
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const c = S.cat(route.parts[0]); if (!c) return;
    if (b.dataset.act === 'newTaskCat') A.newTask({ cat: c.id, area: c.area });
    if (b.dataset.act === 'newEventCat') A.newEvent({ cat: c.id, area: c.area });
  });
}
