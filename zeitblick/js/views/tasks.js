// To-Do-Liste mit intelligenten Listen, Schnelleingabe (natürliche Sprache) und Wischgesten
import * as C from '../core.js';
import * as S from '../store.js';
import { esc, icon, toast, isMobile } from '../ui.js';
import { A } from '../app-api.js';
import { taskRow, sortTasks, emptyState, catColor } from './common.js';

export const LISTS = [
  { id: 'heute', name: 'Heute', icon: 'sun' },
  { id: 'demnaechst', name: 'Nächste 7 Tage', icon: 'calendar' },
  { id: 'ueberfaellig', name: 'Überfällig', icon: 'alert' },
  { id: 'eingang', name: 'Ohne Datum', icon: 'layers' },
  { id: 'alle', name: 'Alle offenen', icon: 'list' },
  { id: 'erledigt', name: 'Erledigt', icon: 'check' },
];
let catFilter = null;

function listTasks(id, area, now) {
  const s = S.settings();
  const today = C.ymd(now);
  const in7 = C.ymd(C.addDays(now, 7));
  const base = S.tasks(t => S.inArea(t, area) && (!catFilter || t.cat === catFilter));
  switch (id) {
    case 'heute': return base.filter(t => !t.done && t.due && t.due <= today);
    case 'demnaechst': return base.filter(t => !t.done && t.due && t.due <= in7);
    case 'ueberfaellig': return base.filter(t => { const l = C.ampel(t, now, s).level; return !t.done && (l === 'red' || l === 'alarm'); });
    case 'eingang': return base.filter(t => !t.done && !t.due);
    case 'erledigt': return base.filter(t => t.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0)).slice(0, 200);
    default: return base.filter(t => !t.done);
  }
}
export function listCount(id, area = A.area(), now = A.now()) { const cf = catFilter; catFilter = null; const n = listTasks(id, area, now).length; catFilter = cf; return n; }

function dateGroup(t, now) {
  const s = S.settings();
  if (!t.due) return { k: 'z', name: 'Ohne Datum' };
  const l = C.ampel(t, now, s).level;
  if (l === 'red' || l === 'alarm') return { k: 'a', name: 'Überfällig', red: true };
  const diff = C.daysBetween(now, C.parseYmd(t.due));
  if (diff <= 0) return { k: 'b', name: 'Heute' };
  if (diff === 1) return { k: 'c', name: 'Morgen' };
  if (diff < 7) { const d = C.parseYmd(t.due); return { k: 'd' + diff, name: C.WD_LONG[C.wdIdx(d)] + ', ' + d.getDate() + '. ' + C.MONTHS_SHORT[d.getMonth()] }; }
  if (diff < 14) return { k: 'e', name: 'Nächste Woche' };
  return { k: 'f', name: 'Später' };
}

function grouped(list, mode, now) {
  const s = S.settings();
  const groups = new Map();
  const add = (k, name, t, extra = {}) => { if (!groups.has(k)) groups.set(k, { name, items: [], ...extra }); groups.get(k).items.push(t); };
  for (const t of list) {
    if (mode === 'cat') { const c = S.cat(t.cat); add(c ? 'c' + (c.area === 'p' ? 0 : 1) + String(c.order ?? 99).padStart(3, '0') : 'zz', c ? `${c.icon || ''} ${c.name}` : 'Ohne Kategorie', t, { color: c ? catColor(c) : null }); }
    else if (mode === 'quad') { const q = C.quadrant(t, now, s); add('q' + q, C.QUADRANTS[q].name, t); }
    else if (mode === 'prio') add('p' + (t.prio || 3), `${C.PRIOS[t.prio || 3].short} ${C.PRIOS[t.prio || 3].name}`, t);
    else { const g = dateGroup(t, now); add(g.k, g.name, t, { red: g.red }); }
  }
  return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, g]) => g);
}

export function render(route) {
  const now = A.now();
  const area = A.area();
  const id = (route.parts[0] && LISTS.find(l => l.id === route.parts[0])) ? route.parts[0] : (S.local.taskList || 'heute');
  if (S.local.taskList !== id) { S.local.taskList = id; S.saveLocal(); }
  const L = LISTS.find(l => l.id === id);
  let list = listTasks(id, area, now);
  if (id !== 'erledigt') list = sortTasks(list, now);
  const mode = S.local.taskGroup || 'date';
  const groups = id === 'erledigt' ? [{ name: 'Zuletzt erledigt', items: list }] : grouped(list, mode, now);
  const doneToday = id === 'heute' ? S.tasks(t => S.inArea(t, area) && t.done && t.doneAt && C.ymd(new Date(t.doneAt)) === C.ymd(now)) : [];
  const cats = S.cats(area);
  const mobile = isMobile();
  const navHtml = LISTS.map(l => { const n = listCount(l.id, area, now); return `<a href="#/aufgaben/${l.id}" class="${l.id === id ? 'on' : ''}">${icon(l.icon, 18)}<span>${l.name}</span>${l.id !== 'erledigt' && n ? `<span class="cnt ${l.id === 'ueberfaellig' ? 'red' : ''}">${n}</span>` : ''}</a>`; }).join('');

  const body = `
    <div class="quick" data-quick>
      <span class="ic-lead">${icon('plus', 20)}</span>
      <input id="quick-in" data-quickin placeholder="Neue Aufgabe, z. B. „Angebot an Praxis Weber morgen 15 Uhr #vertrieb !1“" autocomplete="off" aria-label="Neue Aufgabe">
      <button class="btn sm btn-primary" data-act="quickadd">Hinzufügen</button>
    </div>
    <div class="qchips" data-qchips></div>
    <div class="row wrap" style="margin:14px 0 4px;gap:10px">
      <div class="chips scroll grow">
        <button class="chip ${!catFilter ? 'on' : ''}" data-fcat="">Alle</button>
        ${cats.map(c => `<button class="chip ${catFilter === c.id ? 'on' : ''}" data-fcat="${c.id}"><i class="cdot" style="background:${catColor(c)}"></i>${esc(c.icon || '')} ${esc(c.name)}</button>`).join('')}
      </div>
      ${id !== 'erledigt' ? `<select class="select" data-group style="width:auto;height:34px" aria-label="Gruppieren nach">
        <option value="date" ${mode === 'date' ? 'selected' : ''}>Nach Datum</option>
        <option value="cat" ${mode === 'cat' ? 'selected' : ''}>Nach Kategorie</option>
        <option value="quad" ${mode === 'quad' ? 'selected' : ''}>Nach Matrix</option>
        <option value="prio" ${mode === 'prio' ? 'selected' : ''}>Nach Priorität</option>
      </select>` : ''}
    </div>
    <div class="panel flush" style="padding:4px 6px 10px">
      ${list.length ? groups.map(g => `<div class="group-h ${g.red ? 'red' : ''}">${g.color ? `<i class="catdot" style="background:${g.color}"></i>` : ''}${esc(g.name)} <span class="n">${g.items.length}</span></div><div class="tlist">${g.items.map(t => taskRow(t, { showCat: mode !== 'cat', showArea: area === 'all' })).join('')}</div>`).join('')
        : emptyState(id === 'erledigt' ? '📭' : '✨', id === 'heute' ? 'Für heute ist alles erledigt' : id === 'ueberfaellig' ? 'Nichts überfällig' : 'Keine Aufgaben hier', id === 'heute' ? 'Gönn dir eine Pause oder plane den nächsten Schritt.' : 'Lege oben eine neue Aufgabe an.')}
      ${doneToday.length ? `<div class="group-h" style="color:var(--muted)">Heute erledigt <span class="n">${doneToday.length}</span></div><div class="tlist">${doneToday.map(t => taskRow(t)).join('')}</div>` : ''}
    </div>
    ${mobile ? '<p class="tiny muted" style="text-align:center;margin-top:10px">Nach rechts wischen erledigt, nach links verschiebt auf morgen.</p>' : ''}`;

  return `
  <div class="page-head"><div class="grow"><h1>${esc(L.name)}</h1><div class="page-sub">${list.length} ${list.length === 1 ? 'Aufgabe' : 'Aufgaben'}${area !== 'all' ? (area === 'b' ? ', geschäftlich' : ', privat') : ''}</div></div></div>
  ${mobile ? `<div class="chips scroll" style="margin-bottom:12px">${LISTS.map(l => `<a class="chip ${l.id === id ? 'on' : ''}" href="#/aufgaben/${l.id}" style="text-decoration:none">${l.name}${l.id !== 'erledigt' && listCount(l.id, area, now) ? ` ${listCount(l.id, area, now)}` : ''}</a>`).join('')}</div>${body}`
    : `<div style="display:grid;grid-template-columns:220px minmax(0,1fr);gap:20px;align-items:start"><nav class="nav panel" style="padding:8px;position:sticky;top:80px">${navHtml}</nav><div>${body}</div></div>`}`;
}

export function mount(root, ctx = {}) {
  const signal = ctx.signal;
  const inp = root.querySelector('[data-quickin]');
  const chipsBox = root.querySelector('[data-qchips]');
  const preview = () => {
    const p = C.parseQuick(inp.value, A.now(), S.cats());
    chipsBox.innerHTML = inp.value.trim() ? p.chips.map(c => `<span class="chip">${esc(c.label)}</span>`).join('') : '';
  };
  const add = () => {
    const raw = inp.value.trim(); if (!raw) return;
    const now = A.now();
    const p = C.parseQuick(raw, now, S.cats());
    const listId = S.local.taskList;
    const area = p.area || (A.area() === 'all' ? (p.cat ? S.cat(p.cat).area : 'p') : A.area());
    const due = p.due || (listId === 'heute' ? C.ymd(now) : null);
    S.put('tasks', {
      title: p.title || raw, area, cat: p.cat || catFilter || null, prio: p.prio || 3,
      imp: p.imp ?? (p.prio && p.prio <= 2 ? true : false), urg: p.urg ?? false, autoUrg: true, esc: true,
      due, dueTime: p.dueTime, rec: p.rec, dur: p.dur, subs: [], no: S.nextTicketNo(),
    });
    inp.value = ''; chipsBox.innerHTML = '';
    S.local._refocusQuick = true;
    toast('Aufgabe angelegt');
  };
  inp.addEventListener('input', preview);
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
  if (S.local._refocusQuick) { inp.focus(); delete S.local._refocusQuick; }
  root.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.act === 'quickadd') add();
    if (b.dataset.fcat !== undefined) { catFilter = b.dataset.fcat || null; A.render(); }
  });
  const g = root.querySelector('[data-group]');
  if (g) g.addEventListener('change', () => { S.local.taskGroup = g.value; S.saveLocal(); A.render(); });

  // Wischgesten (Touch)
  let sw = null;
  root.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse') return;
    const row = e.target.closest('.trow[data-task]');
    if (!row || e.target.closest('button')) return;
    sw = { row, x0: e.clientX, y0: e.clientY, id: e.pointerId, dx: 0, locked: null };
  });
  window.addEventListener('pointermove', e => {
    if (!sw || e.pointerId !== sw.id) return;
    const dx = e.clientX - sw.x0, dy = e.clientY - sw.y0;
    if (sw.locked === null && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) sw.locked = Math.abs(dx) > Math.abs(dy) * 1.3 ? 'x' : 'y';
    if (sw.locked !== 'x') return;
    sw.dx = dx;
    sw.row.style.transform = `translateX(${dx}px)`;
    sw.row.style.background = dx > 0 ? `color-mix(in srgb, var(--ok) ${Math.min(30, Math.abs(dx) / 4)}%, var(--surface))` : `color-mix(in srgb, var(--q2) ${Math.min(30, Math.abs(dx) / 4)}%, var(--surface))`;
  }, { signal });
  const end = (e) => {
    if (!sw || e.pointerId !== sw.id) return;
    const s0 = sw; sw = null;
    if (s0.locked !== 'x') return;
    s0.row.style.transition = 'transform .2s'; s0.row.style.transform = ''; s0.row.style.background = '';
    const id = s0.row.dataset.task;
    const kill = ev => { ev.stopPropagation(); ev.preventDefault(); };
    window.addEventListener('click', kill, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', kill, { capture: true }), 60);
    if (s0.dx > 90) A.toggleDone(id, s0.row);
    else if (s0.dx < -90) {
      const t = S.task(id); if (!t) return;
      const prev = { due: t.due, dueTime: t.dueTime };
      S.put('tasks', { ...t, due: C.ymd(C.addDays(A.now(), 1)) });
      toast('Auf morgen verschoben', { action: 'Rückgängig', onAction: () => S.put('tasks', { ...S.task(id), ...prev }) });
    }
  };
  window.addEventListener('pointerup', end, { signal });
  window.addEventListener('pointercancel', end, { signal });
}
