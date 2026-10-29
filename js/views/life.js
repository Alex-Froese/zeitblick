// Lebensbereiche als Säulen – Überblick mit Lebensrad und ein eigener Raum je Bereich
import * as C from '../core.js';
import * as S from '../store.js';
import { esc, icon, toast, makeSortable, isMobile } from '../ui.js';
import { A } from '../app-api.js';
import { emptyState, taskLine, sortTasks, progressBar, pct, fmtDay } from './common.js';
import { editLife } from '../entities.js';
import { editGoal } from './goals.js';
import { editProject } from './projects.js';
import { habitCellState, toggleHabit } from './habits.js';

let sortMode = false;
const TABS = [['uebersicht', 'Überblick'], ['notizen', 'Notizen'], ['projekte', 'Projekte'], ['vorgaenge', 'Vorgänge'], ['gewohnheiten', 'Gewohnheiten'], ['ziele', 'Ziele']];

function tasksOf(l) { const d = S.getData(); return S.tasks(t => C.lifeOfTask(t, d) === l.id || (t.links || []).some(x => x.c === 'life' && x.id === l.id)); }
function habitRate7(l, now) {
  const hs = S.habits(h => h.life === l.id && !h.archived);
  let due = 0, done = 0;
  for (const h of hs) for (let i = 0; i < 7; i++) { const d = C.addDays(C.startOfDay(now), -i); if (!C.habitDueOn(h, d)) continue; if (i === 0 && !C.habitDoneOn(h, C.ymd(d))) continue; due++; if (C.habitDoneOn(h, C.ymd(d))) done++; }
  return due ? done / due : null;
}
function lifeColor(l, i) { return l.color || C.CAT_COLORS[(i * 3) % C.CAT_COLORS.length]; }
export function nextStep(p, data) {
  if (p.next) return p.next;
  const open = C.projectTasks(p, data).filter(C.isOpen);
  sortTasks(open, A.now());
  return open[0] ? open[0].title : '';
}

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
  const labels = list.map((l, i) => { const [x, y] = pt(i, R + 18); const anchor = Math.abs(x - cx) < 8 ? 'middle' : x > cx ? 'start' : 'end'; return `<text x="${x}" y="${y + 4}" text-anchor="${anchor}">${esc(l.name.length > 22 ? l.name.slice(0, 21) + '…' : l.name)}${vals[i] ? ` · ${vals[i]}` : ''}</text>`; }).join('');
  return `<svg class="wheel" viewBox="0 0 500 300" role="img" aria-label="Lebensrad">${rings}${axes}${poly}${dots}${labels}</svg>`;
}

function rateHtml(l) {
  const r = C.lifeRating(l);
  return `<div class="rate" role="group" aria-label="Zufriedenheit 1 bis 10">${[...Array(10)].map((_, i) => `<button class="${r && r.v === i + 1 ? 'on' : ''}" data-rate="${l.id}" data-v="${i + 1}" aria-label="${i + 1}">${i + 1}</button>`).join('')}</div>`;
}

function pillar(l, i, now) {
  const r = C.lifeRating(l);
  const open = tasksOf(l).filter(C.isOpen).length;
  const hr = habitRate7(l, now);
  const col = lifeColor(l, i);
  const v = r ? r.v : 0;
  const prev = (l.ratings || []).slice().sort((a, b) => a.d.localeCompare(b.d)).slice(-2)[0];
  const trend = r && prev && prev !== r ? (r.v > prev.v ? '↑' : r.v < prev.v ? '↓' : '') : '';
  return `<a class="pillar ${v && v <= 4 ? 'low' : ''}" href="#/lebensbereiche/${l.id}" data-sort-id="${l.id}" style="--pc:${col}" title="${esc(l.name)}${r ? ` · ${r.v}/10` : ''}">
    <span class="pl-ic">${esc(l.icon || '•')}</span>
    <span class="pl-bar"><i style="height:${v * 10}%"></i><b>${v || '–'}${trend ? `<small>${trend}</small>` : ''}</b></span>
    <span class="pl-n">${esc(l.name)}</span>
    <span class="pl-m">${open ? `<span title="Offene Vorgänge">${open}</span>` : ''}${hr != null ? `<span title="Gewohnheiten 7 Tage">${Math.round(hr * 100)}%</span>` : ''}</span>
  </a>`;
}

function overview(now) {
  const list = S.lifeAreas();
  if (!list.length) return `<div class="page"><div class="page-head"><div class="grow"><h1>Lebensbereiche</h1><div class="psub">Die Säulen deines Lebens – und wie zufrieden du gerade mit ihnen bist.</div></div></div>
    <div class="card">${emptyState('🧭', 'Noch keine Lebensbereiche', 'Lege die Säulen an, die dir wichtig sind (z. B. Gesundheit, Partnerschaft, Unternehmen). Jeder Bereich bekommt einen eigenen Raum mit Notizen, Projekten, Vorgängen, Gewohnheiten und Zielen.', '<button class="btn btn-primary" data-newl>Lebensbereiche anlegen</button><button class="btn" data-suggest>Vorschläge übernehmen</button>')}</div></div>`;
  const rated = list.filter(l => C.lifeRating(l));
  const avg = rated.length ? rated.reduce((a, l) => a + C.lifeRating(l).v, 0) / rated.length : 0;
  const low = rated.slice().sort((a, b) => C.lifeRating(a).v - C.lifeRating(b).v)[0];
  const stale = list.filter(l => { const r = C.lifeRating(l); return !r || C.daysBetween(C.parseYmd(r.d), now) > 14; }).length;
  const hist = list.map((l, i) => { const rs = (l.ratings || []).slice().sort((a, b) => a.d.localeCompare(b.d)).slice(-10); return `<div class="lh-row"><span class="ic">${esc(l.icon || '•')}</span><span class="ellip">${esc(l.name)}</span><span class="spark sm" style="--pc:${lifeColor(l, i)}">${rs.map(r => `<i style="height:${r.v * 10}%" title="${esc(fmtDay(C.parseYmd(r.d).getTime()))}: ${r.v}"></i>`).join('') || '<span class="tiny faint">noch keine Bewertung</span>'}</span><b class="num">${rs.length ? rs[rs.length - 1].v : '–'}</b></div>`; }).join('');
  return `<div class="page page-wide">
    <div class="page-head"><div class="grow"><h1>Lebensbereiche</h1><div class="psub">${list.length} Säulen · Ø ${rated.length ? avg.toFixed(1).replace('.', ',') : '–'}${low ? ` · braucht Aufmerksamkeit: <b>${esc(low.name)}</b>` : ''}${stale ? ` · ${stale} länger nicht bewertet` : ''}</div></div>
      <div class="page-actions"><button class="btn ${sortMode ? 'btn-primary' : 'btn-ghost'}" data-sortmode>${icon('sort', 14)}${sortMode ? 'Fertig' : 'Reihenfolge'}</button><button class="btn" data-newl>${icon('plus', 15)}Lebensbereich</button></div></div>
    ${sortMode ? '<div class="banner">Ziehe die Säulen in die Reihenfolge, die für dich stimmt.</div>' : ''}
    <div class="pillars ${sortMode ? 'sorting' : ''}" data-pillars>${list.map((l, i) => pillar(l, i, now)).join('')}</div>
    <div class="grid g2" style="margin-top:18px;align-items:start">
      <div class="card"><div class="card-head"><h2>Lebensrad</h2><span class="small muted">${rated.length} von ${list.length} bewertet</span></div><div style="display:flex;justify-content:center">${list.length >= 3 ? wheel(list) : '<p class="muted small">Ab drei Lebensbereichen erscheint hier dein Lebensrad.</p>'}</div></div>
      <div class="card"><div class="card-head"><h2>Verlauf der Bewertungen</h2><button class="link-btn" data-wreview>Im Wochenrückblick bewerten</button></div><div class="lh">${hist}</div></div>
    </div>
  </div>`;
}

function projWin(p, d) {
  const prog = C.projectProgress(p, d);
  const ns = nextStep(p, d);
  return `<a class="pwin" href="#/projekte/${p.id}"><div class="row"><b class="grow ellip">${esc(p.title)}</b><span class="small num">${pct(prog)}</span></div>${progressBar(prog)}<div class="tiny muted ellip" style="margin-top:6px">${ns ? `Nächster Schritt: ${esc(ns)}` : 'Noch kein nächster Schritt'}</div></a>`;
}

function room(l, now, tab) {
  const d = S.getData();
  const tasks = tasksOf(l);
  const open = sortTasks(tasks.filter(C.isOpen), now);
  const cut = now.getTime() - 30 * C.DAY;
  const done30 = tasks.filter(t => C.statusOf(t) === 'erledigt' && (t.doneAt || 0) > cut).length;
  const goals = S.goals(g => g.life === l.id && g.status !== 'verworfen');
  const projects = S.projects(p => p.life === l.id && p.status !== 'abgeschlossen');
  const habits = S.habits(h => h.life === l.id && !h.archived);
  const notes = S.notes(n => n.life === l.id || (n.links || []).some(x => x.c === 'life' && x.id === l.id)).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.updatedAt || 0) - (a.updatedAt || 0));
  const cats = S.cats().filter(c => c.life === l.id);
  const ratings = (l.ratings || []).slice().sort((a, b) => a.d.localeCompare(b.d)).slice(-12);
  const k = C.ymd(now);
  const hr = habitRate7(l, now);
  const counts = { notizen: notes.length, projekte: projects.length, vorgaenge: open.length, gewohnheiten: habits.length, ziele: goals.filter(g => g.status === 'aktiv').length };
  const noteList = (list, max) => list.slice(0, max).map(n => `<a class="li" href="#/notizen/${n.id}" style="text-decoration:none;color:inherit"><span class="nk">${C.NOTE_KINDS[C.noteKind(n)].icon}</span><div class="grow"><div class="lt">${esc(n.title || 'Ohne Titel')}</div><div class="lm ellip">${esc(String(n.body || '').replace(/\s+/g, ' ').slice(0, 120))}</div></div><span class="tiny muted">${fmtDay(n.updatedAt)}</span></a>`).join('');
  const quickNote = `<div class="qnote"><input class="input" data-qnote placeholder="Notiz in „${esc(l.name)}“ festhalten … (Enter)" aria-label="Schnelle Notiz"></div>`;
  const habitsHtml = habits.map(h => { const st = habitCellState(h, k); return `<div class="habit-mini"><button class="hcell ${st.cls}" data-habit="${h.id}" data-day="${k}" ${st.disabled ? 'disabled' : ''} aria-label="${esc(h.title)}">${st.label}</button><div class="grow ellip">${esc(h.title)}</div><span class="small muted">${C.habitStreak(h, now) || ''}</span></div>`; }).join('');
  const goalsHtml = goals.map(g => { const p = C.goalProgress(g, d); return `<div class="li" data-goal="${g.id}"><div class="grow"><div class="lt">${esc(g.title)}</div><div class="pv" style="display:flex;gap:10px;align-items:center;margin-top:4px">${progressBar(p, 'grow')}<span class="small num">${pct(p)}</span></div></div><span class="pill">${esc(C.GOAL_STATUS[g.status] || '')}</span></div>`; }).join('');
  let body;
  if (tab === 'notizen') body = `<div class="card">${quickNote}${notes.length ? `<div class="list" style="margin-top:8px">${noteList(notes, 200)}</div>` : '<p class="small muted" style="margin-top:8px">Noch keine Notizen in diesem Bereich.</p>'}</div>`;
  else if (tab === 'projekte') body = `<div class="pwins">${projects.map(p => projWin(p, d)).join('')}<button class="pwin add" data-newp>${icon('plus', 18)}<span>Persönliches Projekt</span></button></div>`;
  else if (tab === 'vorgaenge') body = `<div class="card"><div class="card-head"><h2>Offene Vorgänge</h2><a class="link" href="#/vorgaenge?life=${l.id}">Im Index filtern</a></div>${open.length ? `<div class="list">${open.map(t => taskLine(t, { now })).join('')}</div>` : '<p class="small muted">Keine offenen Vorgänge.</p>'}</div>`;
  else if (tab === 'gewohnheiten') body = `<div class="card">${habits.length ? habitsHtml : emptyState('🔁', 'Keine Gewohnheiten', 'Ordne Gewohnheiten diesem Bereich zu – im Bearbeiten-Fenster unter „Lebensbereich“.', '<button class="btn sm" data-newh>Gewohnheit anlegen</button>')}</div>`;
  else if (tab === 'ziele') body = `<div class="card">${goals.length ? goalsHtml : emptyState('🎯', 'Keine Ziele', 'Was willst du in diesem Bereich erreichen?', '<button class="btn sm" data-newg>Ziel anlegen</button>')}</div>`;
  else body = `<div class="stats">
      <div class="stat"><div class="l">Zufriedenheit</div><div class="v">${C.lifeRating(l) ? C.lifeRating(l).v : '–'}</div><div class="s">von 10</div></div>
      <div class="stat"><div class="l">Offen</div><div class="v">${open.length}</div><div class="s">${done30} erledigt (30 T.)</div></div>
      <div class="stat"><div class="l">Gewohnheiten</div><div class="v">${hr == null ? '–' : Math.round(hr * 100) + '%'}</div><div class="s">letzte 7 Tage</div></div>
      <div class="stat"><div class="l">Ziele</div><div class="v">${goals.filter(g => g.status === 'aktiv').length}</div><div class="s">${goals.filter(g => g.status === 'erreicht').length} erreicht</div></div>
    </div>
    <div class="grid g-main">
      <div class="stack">
        <div class="card"><div class="card-head"><h2>Notizen</h2><button class="link-btn" data-tab="notizen">Alle ${notes.length}</button></div>${quickNote}${notes.length ? `<div class="list" style="margin-top:6px">${noteList(notes, 5)}</div>` : ''}</div>
        <div class="card"><div class="card-head"><h2>Persönliche Projekte</h2><button class="link-btn" data-tab="projekte">Alle</button></div><div class="pwins sm">${projects.slice(0, 4).map(p => projWin(p, d)).join('')}<button class="pwin add" data-newp>${icon('plus', 16)}<span>Projekt</span></button></div></div>
        <div class="card"><div class="card-head"><h2>Offene Vorgänge</h2><button class="link-btn" data-tab="vorgaenge">Alle ${open.length}</button></div>${open.length ? `<div class="list">${open.slice(0, 6).map(t => taskLine(t, { now })).join('')}</div>` : '<p class="small muted">Keine offenen Vorgänge.</p>'}</div>
      </div>
      <div class="stack">
        <div class="card"><div class="card-head"><h2>Zufriedenheit</h2></div>${rateHtml(l)}
          ${ratings.length > 1 ? `<div class="spark">${ratings.map(r => `<i style="height:${r.v * 10}%" title="${esc(fmtDay(C.parseYmd(r.d).getTime()))}: ${r.v}"></i>`).join('')}</div>` : '<p class="hint" style="margin-top:10px">Bewerte regelmäßig, um die Entwicklung zu sehen.</p>'}</div>
        ${habits.length ? `<div class="card"><div class="card-head"><h2>Gewohnheiten</h2></div>${habitsHtml}</div>` : ''}
        ${goals.length ? `<div class="card"><div class="card-head"><h2>Ziele</h2></div>${goalsHtml}</div>` : ''}
      </div>
    </div>`;
  return `<div class="page page-wide">
    <a class="small muted" href="#/lebensbereiche" style="display:inline-flex;align-items:center;gap:4px;margin-bottom:10px">${icon('left', 14)}Alle Säulen</a>
    <div class="page-head"><div class="grow"><h1>${esc(l.icon || '')} ${esc(l.name)}</h1><div class="psub">${cats.length ? 'Kategorien: ' + cats.map(c => esc(c.name)).join(', ') : 'Tipp: Ordne Kategorien diesem Bereich zu, dann erscheinen ihre Vorgänge automatisch hier.'}</div></div>
      <div class="page-actions"><button class="btn" data-editl="${l.id}">${icon('edit', 14)}Bearbeiten</button></div></div>
    <div class="tabs room-tabs">${TABS.map(([k, n]) => `<button class="${tab === k ? 'on' : ''}" data-tab="${k}">${n}${counts[k] ? ` <span class="faint">${counts[k]}</span>` : ''}</button>`).join('')}</div>
    ${body}
  </div>`;
}

export function render(route) {
  const now = A.now();
  const id = route.parts[0];
  if (id) { const l = S.get('life', id); if (l) return room(l, now, route.parts[1] || 'uebersicht'); }
  return overview(now);
}

export function mount(root, ctx, route) {
  const id = route && route.parts[0];
  const pl = root.querySelector('[data-pillars]');
  if (pl && sortMode) {
    pl.addEventListener('click', e => { if (e.target.closest('.pillar')) e.preventDefault(); }, { signal: ctx.signal, capture: true });
    makeSortable(pl, { item: '.pillar', signal: ctx.signal, onDrop: ids => { ids.forEach((lid, i) => { const l = S.get('life', lid); if (l && l.order !== i) S.put('life', { ...l, order: i }, { noRender: true }); }); toast('Reihenfolge gespeichert', { ms: 1200 }); } });
  }
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
    if (e.target.closest('[data-sortmode]')) { sortMode = !sortMode; A.render(); return; }
    if (e.target.closest('[data-newl]')) { await editLife(null); return; }
    if (e.target.closest('[data-wreview]')) { A.startReview('week'); return; }
    if (e.target.closest('[data-suggest]')) { C.SUGGESTED_LIFE.forEach(([name, ic], i) => S.put('life', { name, icon: ic, order: i, ratings: [] })); toast('Lebensbereiche angelegt – passe sie frei an'); return; }
    const tb = e.target.closest('[data-tab]');
    if (tb && id) { A.nav(`#/lebensbereiche/${id}${tb.dataset.tab === 'uebersicht' ? '' : '/' + tb.dataset.tab}`); return; }
    const el = e.target.closest('[data-editl]');
    if (el) { await editLife(S.get('life', el.dataset.editl)); if (!S.get('life', el.dataset.editl)) A.nav('#/lebensbereiche'); return; }
    if (e.target.closest('[data-newp]') && id) { editProject({ life: id }); return; }
    if (e.target.closest('[data-newg]') && id) { editGoal({ life: id }); return; }
    if (e.target.closest('[data-newh]') && id) { (await import('./habits.js')).editHabit({ life: id }); return; }
    const g = e.target.closest('[data-goal]');
    if (g) { editGoal(S.get('goals', g.dataset.goal)); return; }
    const h = e.target.closest('[data-habit]');
    if (h) toggleHabit(h.dataset.habit, h.dataset.day, h);
  }, { signal: ctx.signal });
  const qn = root.querySelector('[data-qnote]');
  if (qn && id) qn.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || !qn.value.trim()) return;
    const l = S.get('life', id);
    const txt = qn.value.trim();
    S.put('notes', { title: txt.slice(0, 80), body: txt.length > 80 ? txt : '', life: id, area: 'p', tags: [], kind: 'notiz' });
    qn.value = '';
    toast(`Notiz in „${esc(l ? l.name : '')}“ gespeichert`);
  }, { signal: ctx.signal });
  void isMobile;
}
