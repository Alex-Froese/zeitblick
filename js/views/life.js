// Lebensbereiche – Überblick (Lebensrad) und ein Dashboard je Bereich
import * as C from '../core.js';
import * as S from '../store.js';
import { esc, icon, toast } from '../ui.js';
import { A } from '../app-api.js';
import { emptyState, taskLine, sortTasks, progressBar, pct, fmtDay } from './common.js';
import { editLife } from '../entities.js';
import { editGoal } from './goals.js';
import { habitCellState, toggleHabit } from './habits.js';

function tasksOf(l) { const d = S.getData(); return S.tasks(t => C.lifeOfTask(t, d) === l.id); }

function wheel(list) {
  const n = list.length;
  if (n < 3) return '';
  const R = 112, cx = 250, cy = 150;
  const pt = (i, r) => { const a = -Math.PI / 2 + (i / n) * Math.PI * 2; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; };
  const rings = [2, 4, 6, 8, 10].map(v => `<polygon class="rg" points="${list.map((_, i) => pt(i, R * v / 10).join(',')).join(' ')}"/>`).join('');
  const axes = list.map((_, i) => { const [x, y] = pt(i, R); return `<line class="ax" x1="${cx}" y1="${cy}" x2="${x}" y2="${y}"/>`; }).join('');
  const vals = list.map(l => { const r = C.lifeRating(l); return r ? r.v : 0; });
  const poly = `<polygon class="area" points="${vals.map((v, i) => pt(i, R * v / 10).join(',')).join(' ')}"/>`;
  const dots = vals.map((v, i) => { const [x, y] = pt(i, R * v / 10); return v ? `<circle class="pt" cx="${x}" cy="${y}" r="3.5"/>` : ''; }).join('');
  const labels = list.map((l, i) => { const [x, y] = pt(i, R + 18); const anchor = Math.abs(x - cx) < 8 ? 'middle' : x > cx ? 'start' : 'end'; return `<text x="${x}" y="${y + 4}" text-anchor="${anchor}">${esc(l.name.length > 24 ? l.name.slice(0, 23) + '…' : l.name)}${vals[i] ? ` · ${vals[i]}` : ''}</text>`; }).join('');
  return `<svg class="wheel" viewBox="0 0 500 300" width="560" role="img" aria-label="Lebensrad">${rings}${axes}${poly}${dots}${labels}</svg>`;
}

function rateHtml(l) {
  const r = C.lifeRating(l);
  return `<div class="rate" role="group" aria-label="Zufriedenheit 1 bis 10">${[...Array(10)].map((_, i) => `<button class="${r && r.v === i + 1 ? 'on' : ''}" data-rate="${l.id}" data-v="${i + 1}" aria-label="${i + 1}">${i + 1}</button>`).join('')}</div>`;
}

function overview(now) {
  const list = S.lifeAreas();
  if (!list.length) return `<div class="page"><div class="page-head"><div class="grow"><h1>Lebensbereiche</h1><div class="psub">Die großen Felder deines Lebens – und wie zufrieden du gerade mit ihnen bist.</div></div></div>
    <div class="card">${emptyState('🧭', 'Noch keine Lebensbereiche', 'Lege die Bereiche an, die dir wichtig sind (z. B. Gesundheit, Partnerschaft, Unternehmen). Kategorien, Projekte, Ziele, Gewohnheiten und Notizen ordnest du ihnen zu – so siehst du für jeden Bereich, was läuft.', '<button class="btn btn-primary" data-newl>Lebensbereiche anlegen</button>')}</div></div>`;
  const d = S.getData();
  const cards = list.map(l => {
    const open = tasksOf(l).filter(C.isOpen).length;
    const goals = S.goals(g => g.life === l.id && g.status === 'aktiv');
    const habits = S.habits(h => h.life === l.id && !h.archived).length;
    const r = C.lifeRating(l);
    const gp = goals.length ? goals.reduce((a, g) => a + C.goalProgress(g, d), 0) / goals.length : null;
    return `<div class="ecard" data-life="${l.id}" style="cursor:default">
      <a class="row" href="#/lebensbereiche/${l.id}" style="text-decoration:none;color:inherit"><span style="font-size:20px">${esc(l.icon || '•')}</span><div class="et grow">${esc(l.name)}</div>${icon('right', 16)}</a>
      <div class="em"><span>${open} offene Vorgänge</span><span>${goals.length} Ziele</span><span>${habits} Gewohnheiten</span></div>
      ${gp !== null ? `<div class="pv">${progressBar(gp)}<b>${pct(gp)}</b></div>` : ''}
      <div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:6px"><span class="small muted">Zufriedenheit${r ? ` · ${fmtDay(C.parseYmd(r.d).getTime())}` : ''}</span>${rateHtml(l)}</div>
    </div>`;
  }).join('');
  const rated = list.filter(l => C.lifeRating(l));
  const avg = rated.length ? rated.reduce((a, l) => a + C.lifeRating(l).v, 0) / rated.length : 0;
  const low = rated.slice().sort((a, b) => C.lifeRating(a).v - C.lifeRating(b).v)[0];
  return `<div class="page">
    <div class="page-head"><div class="grow"><h1>Lebensbereiche</h1><div class="psub">Die großen Felder deines Lebens – und wie zufrieden du gerade mit ihnen bist.</div></div>
      <div class="page-actions"><button class="btn" data-newl>${icon('plus', 15)}Lebensbereich</button></div></div>
    <div class="grid g-main" style="margin-bottom:20px;align-items:start">
      <div class="card" style="display:flex;justify-content:center;align-items:center;min-height:300px">${list.length >= 3 ? wheel(list) : '<p class="muted small">Ab drei Lebensbereichen erscheint hier dein Lebensrad.</p>'}</div>
      <div class="card"><div class="card-head"><h2>Dein Lebensrad</h2></div>
        <p class="small" style="color:var(--ink-2)">Bewerte regelmäßig (z. B. jeden Sonntag), wie zufrieden du mit jedem Bereich bist – 1 ist sehr unzufrieden, 10 rundum zufrieden. So erkennst du, wo du Zeit investieren willst.</p>
        <div class="stats" style="grid-template-columns:1fr 1fr;margin:14px 0 0"><div class="stat"><div class="l">Durchschnitt</div><div class="v">${rated.length ? avg.toFixed(1).replace('.', ',') : '–'}</div><div class="s">${rated.length} von ${list.length} bewertet</div></div><div class="stat"><div class="l">Braucht Aufmerksamkeit</div><div class="v" style="font-size:16px;padding-top:4px">${low ? esc(low.name) : '–'}</div><div class="s">${low ? 'niedrigste Bewertung' : ''}</div></div></div>
      </div>
    </div>
    <div class="cards">${cards}</div>
  </div>`;
}

function dashboard(l, now) {
  const d = S.getData();
  const tasks = tasksOf(l);
  const open = sortTasks(tasks.filter(C.isOpen), now);
  const cut = now.getTime() - 30 * C.DAY;
  const done30 = tasks.filter(t => C.statusOf(t) === 'erledigt' && (t.doneAt || 0) > cut).length;
  const goals = S.goals(g => g.life === l.id && g.status !== 'verworfen');
  const projects = S.projects(p => p.life === l.id && p.status !== 'abgeschlossen');
  const habits = S.habits(h => h.life === l.id && !h.archived);
  const notes = S.notes(n => n.life === l.id).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const cats = S.cats().filter(c => c.life === l.id);
  const ratings = (l.ratings || []).slice().sort((a, b) => a.d.localeCompare(b.d)).slice(-12);
  const k = C.ymd(now);
  return `<div class="page">
    <a class="small muted" href="#/lebensbereiche" style="display:inline-flex;align-items:center;gap:4px;margin-bottom:10px">${icon('left', 14)}Lebensbereiche</a>
    <div class="page-head"><div class="grow"><h1>${esc(l.icon || '')} ${esc(l.name)}</h1><div class="psub">${cats.length ? 'Kategorien: ' + cats.map(c => esc(c.name)).join(', ') : 'Ordne Kategorien diesem Bereich zu, damit ihre Vorgänge hier erscheinen.'}</div></div>
      <div class="page-actions"><button class="btn" data-editl="${l.id}">${icon('edit', 14)}Bearbeiten</button></div></div>
    <div class="stats">
      <div class="stat"><div class="l">Offen</div><div class="v">${open.length}</div><div class="s">Vorgänge</div></div>
      <div class="stat"><div class="l">Erledigt</div><div class="v">${done30}</div><div class="s">letzte 30 Tage</div></div>
      <div class="stat"><div class="l">Ziele</div><div class="v">${goals.filter(g => g.status === 'aktiv').length}</div><div class="s">${goals.filter(g => g.status === 'erreicht').length} erreicht</div></div>
      <div class="stat"><div class="l">Zufriedenheit</div><div class="v">${C.lifeRating(l) ? C.lifeRating(l).v : '–'}</div><div class="s">von 10</div></div>
    </div>
    <div class="grid g-main">
      <div class="stack">
        <div class="card"><div class="card-head"><h2>Offene Vorgänge</h2><a class="link" href="#/vorgaenge?life=${l.id}">Im Index</a></div>${open.length ? `<div class="list">${open.slice(0, 10).map(t => taskLine(t, { now })).join('')}</div>` : '<p class="small muted">Keine offenen Vorgänge.</p>'}</div>
        ${goals.length ? `<div class="card"><div class="card-head"><h2>Ziele</h2><a class="link" href="#/ziele">Alle Ziele</a></div>${goals.map(g => { const p = C.goalProgress(g, d); return `<div class="li" data-goal="${g.id}"><div class="grow"><div class="lt">${esc(g.title)}</div><div class="pv" style="display:flex;gap:10px;align-items:center;margin-top:4px">${progressBar(p, 'grow')}<span class="small num">${pct(p)}</span></div></div></div>`; }).join('')}</div>` : ''}
        ${projects.length ? `<div class="card"><div class="card-head"><h2>Projekte</h2></div>${projects.map(p => `<a class="li" href="#/projekte/${p.id}" style="text-decoration:none;color:inherit"><div class="grow"><div class="lt">${esc(p.title)}</div><div class="lm">${pct(C.projectProgress(p, d))} erledigt</div></div></a>`).join('')}</div>` : ''}
      </div>
      <div class="stack">
        <div class="card"><div class="card-head"><h2>Zufriedenheit</h2></div>${rateHtml(l)}
          ${ratings.length > 1 ? `<div class="spark">${ratings.map(r => `<i style="height:${r.v * 10}%" title="${esc(fmtDay(C.parseYmd(r.d).getTime()))}: ${r.v}"></i>`).join('')}</div>` : '<p class="hint" style="margin-top:10px">Bewerte regelmäßig, um die Entwicklung zu sehen.</p>'}</div>
        ${habits.length ? `<div class="card"><div class="card-head"><h2>Gewohnheiten</h2></div>${habits.map(h => { const st = habitCellState(h, k); return `<div class="habit-mini"><button class="hcell ${st.cls}" data-habit="${h.id}" data-day="${k}" ${st.disabled ? 'disabled' : ''} aria-label="${esc(h.title)}">${st.label}</button><div class="grow ellip">${esc(h.title)}</div><span class="small muted">${C.habitStreak(h, now) || ''}</span></div>`; }).join('')}</div>` : ''}
        ${notes.length ? `<div class="card"><div class="card-head"><h2>Notizen</h2></div>${notes.slice(0, 6).map(n => `<a class="li" href="#/notizen/${n.id}" style="text-decoration:none;color:inherit"><div class="grow"><div class="lt">${esc(n.title || 'Ohne Titel')}</div><div class="lm">${fmtDay(n.updatedAt)}</div></div></a>`).join('')}</div>` : ''}
      </div>
    </div>
  </div>`;
}

export function render(route) {
  const now = A.now();
  const id = route.parts[0];
  if (id) { const l = S.get('life', id); if (l) return dashboard(l, now); }
  return overview(now);
}

export function mount(root) {
  root.addEventListener('click', async e => {
    const r = e.target.closest('[data-rate]');
    if (r) {
      const l = S.get('life', r.dataset.rate); if (!l) return;
      const today = C.ymd(A.now());
      const ratings = (l.ratings || []).filter(x => x.d !== today);
      ratings.push({ d: today, v: Number(r.dataset.v) });
      S.put('life', { ...l, ratings: ratings.slice(-120) });
      toast(`${esc(l.name)}: ${r.dataset.v} von 10`, { ms: 1600 });
      return;
    }
    if (e.target.closest('[data-newl]')) { await editLife(null); return; }
    const el = e.target.closest('[data-editl]');
    if (el) { const res = await editLife(S.get('life', el.dataset.editl)); if (!S.get('life', el.dataset.editl)) A.nav('#/lebensbereiche'); void res; return; }
    const g = e.target.closest('[data-goal]');
    if (g) { editGoal(S.get('goals', g.dataset.goal)); return; }
    const h = e.target.closest('[data-habit]');
    if (h) toggleHabit(h.dataset.habit, h.dataset.day, h);
  });
}
