// Start-Dashboard (Gesamt, Privat oder Geschäftlich – je nach Umschalter oben)
import * as C from '../core.js';
import * as S from '../store.js';
import { esc, icon } from '../ui.js';
import { A } from '../app-api.js';
import { columns, heatmap, ring } from '../charts.js';
import { catColor, taskRow, greetingLine, leitsatz, areaName, sortTasks, emptyState } from './common.js';

export function agendaItems(day, area) {
  const d0 = C.startOfDay(day), d1 = C.addDays(d0, 1);
  const L = S.local.calLayers;
  const evs = C.expandEvents(S.events(e => S.inArea(e, area)), d0, d1).map(o => ({ kind: 'event', o, start: o.start, end: o.end, allDay: o.ev.allDay }));
  const g = L.google !== false ? C.expandEvents(S.getGoogleEvents().filter(e => S.inArea(e, area)), d0, d1).map(o => ({ kind: 'google', o, start: o.start, end: o.end, allDay: o.ev.allDay })) : [];
  const key = C.ymd(d0);
  const tks = S.tasks(t => t.due === key && S.inArea(t, area)).map(t => ({ kind: 'task', t, start: t.dueTime ? C.parseLocal(key + 'T' + t.dueTime) : null, allDay: !t.dueTime }));
  return [...evs, ...g, ...tks].sort((a, b) => (a.allDay === b.allDay ? 0 : a.allDay ? -1 : 1) || ((a.start || 0) - (b.start || 0)));
}

function agendaHtml(items, now) {
  if (!items.length) return emptyState('☀️', 'Heute ist nichts geplant', 'Leg einen Termin an oder plane eine Aufgabe in deinen Tag.', `<button class="btn sm" data-act="newEvent">${icon('plus', 15)}Termin</button>`);
  let html = '';
  let nowPlaced = false;
  for (const it of items) {
    if (!nowPlaced && !it.allDay && it.start && it.start > now) { html += `<div class="ag-now">Jetzt ${C.hm(now)}</div>`; nowPlaced = true; }
    if (it.kind === 'task') {
      const t = it.t; const c = S.cat(t.cat);
      html += `<div class="ag-item ${t.done ? 'past' : ''}" data-task="${t.id}">
        <div class="ag-time">${it.allDay ? 'Heute' : esc(t.dueTime)}</div>
        <div class="ag-bar" style="background:${c ? catColor(c) : 'var(--line-2)'};opacity:.5"></div>
        <div><div class="ag-title">${t.done ? '✓ ' : '☐ '}${esc(t.title)}</div><div class="ag-sub">Aufgabe${c ? `, ${esc(c.icon || '')} ${esc(c.name)}` : ''}</div></div>
        <div>${!t.done ? `<button class="icon-btn sm" data-act="focus" data-id="${t.id}" aria-label="Fokus starten">${icon('play', 14)}</button>` : ''}</div>
      </div>`;
    } else {
      const ev = it.o.ev; const c = S.cat(ev.cat);
      const past = !it.allDay && it.end < now;
      const color = it.kind === 'google' ? 'var(--q2)' : (c ? catColor(c) : (ev.area === 'b' ? 'var(--biz)' : 'var(--priv)'));
      html += `<div class="ag-item ${past ? 'past' : ''}" ${it.kind === 'event' ? `data-event="${ev.id}" data-occ="${it.o.start.getTime()}"` : ''}>
        <div class="ag-time">${it.allDay ? 'Ganztags' : `${C.hm(it.start)}<br><span class="muted">${C.hm(it.end)}</span>`}</div>
        <div class="ag-bar" style="background:${color}"></div>
        <div><div class="ag-title">${esc(ev.title)}</div><div class="ag-sub">${it.kind === 'google' ? 'Google Kalender' : esc(areaName(ev.area))}${c ? `, ${esc(c.icon || '')} ${esc(c.name)}` : ''}${ev.loc ? `, ${esc(ev.loc)}` : ''}</div></div>
        <div></div>
      </div>`;
    }
  }
  if (!nowPlaced) html += `<div class="ag-now">Jetzt ${C.hm(now)}</div>`;
  return html;
}

export function catStats(c, now) {
  const s = S.settings();
  const tasks = S.tasks(t => t.cat === c.id);
  const open = tasks.filter(t => !t.done);
  const over = open.filter(t => { const l = C.ampel(t, now, s).level; return l === 'red' || l === 'alarm'; }).length;
  const weekAgo = now.getTime() - 7 * C.DAY;
  const done7 = tasks.filter(t => (t.done && t.doneAt > weekAgo)).length + tasks.reduce((a, t) => a + (t.hist || []).filter(h => C.parseYmd(h).getTime() > weekAgo).length, 0);
  const next = sortTasks(open.filter(t => t.due), now)[0];
  return { open: open.length, over, done7, next };
}

function catTiles(list, now) {
  if (!list.length) return '<div class="muted small">Keine Kategorien.</div>';
  return `<div class="cat-tiles">${list.map(c => {
    const st = catStats(c, now);
    const p = st.done7 + st.open ? st.done7 / (st.done7 + st.open) : 0;
    return `<a class="cat-tile" href="#/kategorie/${c.id}" style="--cc:${catColor(c)}">
      <div class="top"><span class="em">${esc(c.icon || '•')}</span><span class="grow ellip">${esc(c.name)}</span></div>
      <div class="meta"><span>${st.open} offen</span>${st.over ? `<span class="red">${st.over} überfällig</span>` : ''}<span>${st.done7} erledigt</span></div>
      <div class="pbar"><i style="width:${Math.round(p * 100)}%"></i></div>
    </a>`;
  }).join('')}</div>`;
}

export function render() {
  const now = A.now();
  const area = A.area();
  const s = S.settings();
  const today = C.ymd(now);
  const tasksArea = S.tasks(t => S.inArea(t, area));
  const open = tasksArea.filter(t => !t.done);
  const dueToday = tasksArea.filter(t => t.due === today || (t.done && t.doneAt && C.ymd(new Date(t.doneAt)) === today && t.due === today));
  const doneToday = tasksArea.filter(t => (t.done && t.doneAt && C.ymd(new Date(t.doneAt)) === today) || (t.hist || []).includes(today)).length;
  const openToday = open.filter(t => t.due && t.due <= today).length;
  const totalToday = doneToday + openToday;
  const levels = { alarm: [], red: [], yellow: [], green: [], none: [] };
  for (const t of open) levels[C.ampel(t, now, s).level].push(t);
  const overdue = levels.alarm.length + levels.red.length;
  const fdays = C.focusMinutesByDay(S.getData().focus, 14, now, f => S.inArea(f, area));
  const focusToday = fdays[fdays.length - 1].v;
  const avg7 = Math.round(fdays.slice(-8, -1).reduce((a, d) => a + d.v, 0) / 7);
  const ddays = C.doneByDay(S.getData().tasks, 14, now, t => S.inArea(t, area));
  const doneWeek = C.doneByDay(S.getData().tasks, C.wdIdx(now) + 1, now, t => S.inArea(t, area)).reduce((a, d) => a + d.v, 0);
  const agenda = agendaItems(now, area);
  const evToday = agenda.filter(i => i.kind !== 'task').length;
  const nextEv = agenda.find(i => i.kind !== 'task' && !i.allDay && i.start > now);
  const heat = C.focusMinutesByDay(S.getData().focus, 7 * 52 - (6 - C.wdIdx(now)), now, f => S.inArea(f, area));
  const chartColor = area === 'all' ? 'var(--q2)' : 'var(--accent)';
  const critical = sortTasks([...levels.alarm, ...levels.red, ...levels.yellow], now).slice(0, 5);
  const qCount = [0, 0, 0, 0, 0];
  for (const t of open) qCount[C.quadrant(t, now, s)]++;
  const areaTitle = area === 'all' ? 'Gesamtüberblick' : area === 'b' ? 'Geschäftlich' : 'Privat';
  const showSetup = !S.local.gist && !S.local.setupHidden;

  const catsHtml = area === 'all'
    ? `<div class="area-cols">
        <div><div class="area-h"><i style="background:var(--priv)"></i>Privat</div>${catTiles(S.cats('p'), now)}</div>
        <div><div class="area-h"><i style="background:var(--biz)"></i>Geschäftlich</div>${catTiles(S.cats('b'), now)}</div>
      </div>`
    : catTiles(S.cats(area), now);

  return `
  <section class="hello">
    <div class="grow">
      <h1>${esc(greetingLine())}</h1>
      <div class="date">${esc(C.fmtDateLong(now))} ${now.getFullYear()}, ${esc(areaTitle)}</div>
      <div class="leit">${esc(leitsatz(now))}</div>
    </div>
    <div class="hello-right">
      <div class="hero-day panel" style="padding:12px 16px">
        <div class="ring-wrap">${ring(totalToday ? doneToday / totalToday : 0, { size: 74, stroke: 8, label: 'Tagesfortschritt' })}<div class="num"><span>${doneToday}<span class="muted" style="font-size:13px">/${totalToday}</span></span></div></div>
        <div><b class="num" style="font-size:15px">Heute erledigt</b><div class="small muted">${totalToday ? (doneToday >= totalToday ? 'Alles geschafft. Stark!' : `Noch ${totalToday - doneToday} offen`) : 'Nichts fällig'}</div>
        ${nextEv ? `<div class="small" style="margin-top:4px">${icon('calendar', 13)} <b>${esc(nextEv.o.ev.title)}</b> ${esc(C.fmtRelTime(nextEv.start.getTime(), now.getTime()))}</div>` : ''}</div>
      </div>
    </div>
  </section>

  ${A.preview ? `<div class="banner warn">${icon('alert', 18)}<div class="grow"><b>Vorschau</b><div class="small muted">Du siehst Zeitblick in einer Vorschau. Sync, Push und Offline-Betrieb funktionieren erst in der installierten App (Anleitung in der README). Daten in der Vorschau können verloren gehen.</div></div></div>` : ''}
  ${showSetup && !A.preview ? `<div class="banner">${icon('cloud', 18)}<div class="grow"><b>Sync und Handy-Push einrichten</b><div class="small muted">Damit alles auf Handy und Laptop gleich ist und du Erinnerungen bekommst, die bleiben, bis du sie wegwischst.</div></div><a class="btn sm btn-primary" href="#/einstellungen/einrichtung">Einrichten</a><button class="icon-btn sm" data-act="hideSetup" aria-label="Ausblenden">${icon('x', 15)}</button></div>` : ''}

  <div class="kpis" style="margin-bottom:16px">
    <a class="kpi" href="#/aufgaben/heute"><span class="k-l">${icon('list', 15)}Heute fällig</span><span class="k-v">${openToday}</span><span class="k-s">${doneToday} erledigt</span></a>
    <a class="kpi ${overdue ? 'alert' : ''}" href="#/tickets"><span class="k-l">${icon('ampel', 15)}Überfällig</span><span class="k-v">${overdue}</span><span class="k-s">${levels.alarm.length ? `${levels.alarm.length} im Alarm` : 'Ampel im Griff'}</span></a>
    <a class="kpi" href="#/fokus"><span class="k-l">${icon('focus', 15)}Fokus heute</span><span class="k-v">${esc(C.fmtDurShort(focusToday))}</span><span class="k-s">Ø ${esc(C.fmtDurShort(avg7))} pro Tag</span></a>
    <a class="kpi" href="#/aufgaben/erledigt"><span class="k-l">${icon('check', 15)}Diese Woche</span><span class="k-v">${doneWeek}</span><span class="k-s">Aufgaben erledigt</span></a>
    <a class="kpi" href="#/kalender/tag"><span class="k-l">${icon('calendar', 15)}Termine heute</span><span class="k-v">${evToday}</span><span class="k-s">${nextEv ? `Nächster um ${C.hm(nextEv.start)}` : 'Keine weiteren'}</span></a>
  </div>

  <div class="dgrid">
    <section class="panel c7">
      <div class="panel-head"><h2>Heute</h2><a class="link" href="#/kalender/tag">Kalender öffnen</a></div>
      <div class="agenda">${agendaHtml(agenda, now)}</div>
    </section>
    <section class="panel c5">
      <div class="panel-head"><h2>Ampel & Eskalation</h2><a class="link" href="#/tickets">Alle Tickets</a></div>
      <div class="amp-summary">
        <a class="amp-cell alarm ${levels.alarm.length ? 'has' : ''}" href="#/tickets"><span class="l"><i class="amp alarm"></i>Alarm</span><span class="n">${levels.alarm.length}</span></a>
        <a class="amp-cell red ${levels.red.length ? 'has' : ''}" href="#/tickets"><span class="l"><i class="amp red"></i>Rot</span><span class="n">${levels.red.length}</span></a>
        <a class="amp-cell" href="#/tickets"><span class="l"><i class="amp yellow"></i>Gelb</span><span class="n">${levels.yellow.length}</span></a>
        <a class="amp-cell" href="#/tickets"><span class="l"><i class="amp green"></i>Im Plan</span><span class="n">${levels.green.length + levels.none.length}</span></a>
      </div>
      <div class="tlist">${critical.length ? critical.map(t => taskRow(t)).join('') : emptyState('🟢', 'Alles im grünen Bereich', 'Keine Aufgabe ist bald fällig oder überfällig.')}</div>
    </section>

    <section class="panel c4">
      <div class="panel-head"><h2>Eisenhower-Matrix</h2><a class="link" href="#/matrix">Öffnen</a></div>
      <div class="mini-matrix">
        ${[1, 2, 3, 4].map(k => `<a class="mm q${k}c" href="#/matrix"><div class="n num">${qCount[k]}</div><div class="l">${C.QUADRANTS[k].name}</div><div class="s">${C.QUADRANTS[k].sub}</div></a>`).join('')}
      </div>
      ${qCount[1] ? `<button class="btn btn-primary" style="width:100%;margin-top:12px;background:var(--q1);border-color:var(--q1);color:#fff" data-act="focusTop">${icon('play', 15)}Wichtigste Aufgabe jetzt fokussieren</button>` : ''}
    </section>
    <section class="panel c4">
      <div class="panel-head"><h2>Fokuszeit, 14 Tage</h2></div>
      <div class="chart-cap"><span class="num">${esc(C.fmtDuration(fdays.reduce((a, d) => a + d.v, 0)))}</span><span class="muted small">gesamt</span></div>
      ${columns(fdays.map(d => ({ label: String(d.d.getDate()), v: d.v, tip: `${C.fmtDateShort(d.d)}: ${C.fmtDuration(d.v)}` })), { height: 130, highlight: 13, unit: ' Min', color: chartColor, fmt: v => C.fmtDurShort(v), minMax: 60, ariaLabel: 'Fokusminuten pro Tag' })}
    </section>
    <section class="panel c4">
      <div class="panel-head"><h2>Erledigt, 14 Tage</h2></div>
      <div class="chart-cap"><span class="num">${ddays.reduce((a, d) => a + d.v, 0)}</span><span class="muted small">Aufgaben</span></div>
      ${columns(ddays.map(d => ({ label: String(d.d.getDate()), v: d.v, tip: `${C.fmtDateShort(d.d)}: ${d.v} erledigt` })), { height: 130, highlight: 13, color: 'var(--ok)', ariaLabel: 'Erledigte Aufgaben pro Tag' })}
    </section>
    <section class="panel c12">
      <div class="panel-head"><h2>Kategorien</h2><a class="link" href="#/einstellungen/kategorien">Verwalten</a></div>
      ${catsHtml}
    </section>
    <section class="panel c12">
      <div class="panel-head"><h2>Fokus-Aktivität</h2><span class="small muted">letzte 12 Monate</span></div>
      ${heatmap(heat, { label: 'Fokusminuten je Tag', color: chartColor })}
    </section>
  </div>`;
}

export function mount(el) {
  el.querySelectorAll('.heat-wrap').forEach(w => { w.scrollLeft = w.scrollWidth; });
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (b && b.dataset.act === 'hideSetup') { S.local.setupHidden = true; S.saveLocal(); A.render(); }
    if (b && b.dataset.act === 'newEvent') A.newEvent();
    if (b && b.dataset.act === 'focusTop') {
      const s = S.settings(); const now = A.now();
      const q1 = sortTasks(S.tasks(t => !t.done && S.inArea(t) && C.quadrant(t, now, s) === 1), now)[0];
      if (q1) A.startFocus(q1.id, { autostart: true });
    }
  });
}
