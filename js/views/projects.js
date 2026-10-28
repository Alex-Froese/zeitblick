// Projekte – bündeln mehrere Vorgänge zu einem Vorhaben, optional mit Ziel
import * as C from '../core.js';
import * as S from '../store.js';
import { esc, icon, sheet, toast, isMobile, confirmDialog } from '../ui.js';
import { A } from '../app-api.js';
import { emptyState, catSelect, lifeSelect, goalSelect, progressBar, pct, taskLine, sortTasks, fmtDateTime, catColor } from './common.js';
import { handleNewOption } from '../entities.js';

let tab = 'aktiv';

function stats(p) {
  const list = C.projectTasks(p, S.getData()).filter(t => C.statusOf(t) !== 'verworfen');
  const open = list.filter(C.isOpen);
  return { total: list.length, open: open.length, done: list.length - open.length, prog: C.projectProgress(p, S.getData()), openList: open };
}

function cardHtml(p, now) {
  const st = stats(p);
  const g = p.goal && S.get('goals', p.goal);
  const c = p.cat && S.cat(p.cat);
  const next = sortTasks(st.openList, now)[0];
  const over = p.due && p.due < C.ymd(now) && p.status !== 'abgeschlossen';
  return `<a class="ecard" href="#/projekte/${p.id}" style="text-decoration:none">
    <div class="row" style="align-items:flex-start"><div class="et grow">${c ? `<i class="catdot" style="background:${catColor(c)};margin-right:7px;vertical-align:1px"></i>` : ''}${esc(p.title)}</div>${p.status !== 'aktiv' ? `<span class="pill">${C.PROJECT_STATUS[p.status]}</span>` : ''}</div>
    ${p.desc ? `<div class="eb">${esc(p.desc)}</div>` : ''}
    <div class="pv">${progressBar(st.prog)}<b>${pct(st.prog)}</b></div>
    <div class="em"><span>${st.open} offen · ${st.done} erledigt</span>${p.due ? `<span class="${over ? 'over' : ''}">bis ${esc(C.fmtDateShort(C.parseYmd(p.due)))}</span>` : ''}${g ? `<span>${icon('flag', 11, 'inl')} ${esc(g.title)}</span>` : ''}</div>
    ${next ? `<div class="small" style="color:var(--ink-2);border-top:1px solid var(--line);padding-top:8px">Als Nächstes: ${esc(next.title)}</div>` : ''}
  </a>`;
}

function listView(now, area) {
  const all = S.projects(p => S.inArea(p, area));
  const list = all.filter(p => tab === 'alle' || p.status === tab).sort((a, b) => (a.due || '9').localeCompare(b.due || '9') || a.title.localeCompare(b.title));
  return `<div class="page">
    <div class="page-head"><div class="grow"><h1>Projekte</h1><div class="psub">Vorhaben mit mehreren Vorgängen – mit Fortschritt und nächstem Schritt.</div></div>
      <div class="page-actions"><button class="btn btn-primary" data-newp>${icon('plus', 15)}Projekt</button></div></div>
    ${all.length ? `<div class="tabs">${[['aktiv', 'Aktiv'], ['pausiert', 'Pausiert'], ['abgeschlossen', 'Abgeschlossen'], ['alle', 'Alle']].map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-tab="${k}">${l} <span class="faint">${k === 'alle' ? all.length : all.filter(p => p.status === k).length}</span></button>`).join('')}</div>
      ${list.length ? `<div class="cards">${list.map(p => cardHtml(p, now)).join('')}</div>` : `<div class="card">${emptyState('📁', 'Keine Projekte in dieser Ansicht', '')}</div>`}`
    : `<div class="card">${emptyState('📁', 'Noch keine Projekte', 'Ein Projekt fasst mehrere Vorgänge zusammen – z. B. „Website neu“, „Umzug“ oder „Hochzeitstag planen“.', '<button class="btn btn-primary" data-newp>Erstes Projekt anlegen</button>')}</div>`}
  </div>`;
}

function detailView(p, now) {
  const st = stats(p);
  const g = p.goal && S.get('goals', p.goal);
  const l = p.life && S.get('life', p.life);
  const c = p.cat && S.cat(p.cat);
  const all = C.projectTasks(p, S.getData());
  const open = sortTasks(all.filter(C.isOpen), now);
  const closed = all.filter(t => C.isClosed(t)).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
  const log = [...(p.log || [])].sort((a, b) => b.at - a.at);
  return `<div class="page narrow">
    <a class="small muted" href="#/projekte" style="display:inline-flex;align-items:center;gap:4px;margin-bottom:10px">${icon('left', 14)}Projekte</a>
    <div class="page-head" style="margin-bottom:14px"><div class="grow"><h1>${esc(p.title)}</h1>
      <div class="psub">${C.PROJECT_STATUS[p.status]}${p.due ? ` · bis ${esc(C.fmtDateLong(C.parseYmd(p.due)))}` : ''}${c ? ` · ${esc(c.name)}` : ''}${l ? ` · ${esc(l.name)}` : ''}${g ? ` · Ziel: <a href="#/ziele">${esc(g.title)}</a>` : ''}</div></div>
      <div class="page-actions"><button class="btn" data-editp="${p.id}">${icon('edit', 14)}Bearbeiten</button></div></div>
    <div class="card pad-sm" style="margin-bottom:16px"><div class="row" style="gap:14px">${progressBar(st.prog, 'lg grow')}<b class="num">${pct(st.prog)}</b><span class="small muted">${st.done} von ${st.total} erledigt</span></div>${p.desc ? `<p style="margin:12px 0 0;color:var(--ink-2);white-space:pre-wrap">${esc(p.desc)}</p>` : ''}</div>
    <div class="card"><div class="card-head"><h2>Vorgänge</h2><button class="btn sm" data-ptask="${p.id}">${icon('plus', 13)}Vorgang</button></div>
      <form class="qadd" data-pquick style="margin:0 0 6px;padding:0 4px">${icon('plus', 14)}<input data-pq placeholder="Schnell hinzufügen und Enter drücken" aria-label="Vorgang hinzufügen"></form>
      <div class="list">${open.map(t => taskLine(t, { now })).join('') || '<div class="small muted" style="padding:10px 4px">Keine offenen Vorgänge.</div>'}</div>
      ${closed.length ? `<details style="margin-top:10px"><summary class="small muted" style="cursor:pointer">${closed.length} abgeschlossen</summary><div class="list">${closed.map(t => taskLine(t, { now, focus: false })).join('')}</div></details>` : ''}
    </div>
    <div class="card" style="margin-top:16px"><div class="card-head"><h2>Notizen & Verlauf</h2></div>
      <div class="log-add"><textarea class="textarea" data-plog rows="1" placeholder="Notiz zum Projekt – wird mit Datum gespeichert"></textarea><button class="btn" data-addplog="${p.id}">Hinzufügen</button></div>
      <div class="log">${log.map(x => `<div class="log-item ${esc(x.kind || 'note')}"><span class="lb"></span><div><div class="lt">${esc(x.text)}</div><div class="ld">${fmtDateTime(x.at)}</div></div></div>`).join('')}${p.createdAt ? `<div class="log-item system"><span class="lb"></span><div><div class="lt">Projekt angelegt</div><div class="ld">${fmtDateTime(p.createdAt)}</div></div></div>` : ''}</div>
    </div>
  </div>`;
}

export function render(route) {
  const now = A.now();
  const id = route.parts[0];
  if (id) { const p = S.get('projects', id); if (p) return detailView(p, now); }
  return listView(now, A.area());
}

export function editProject(p0) {
  const existing = p0 && p0.id ? S.get('projects', p0.id) : null;
  const area0 = A.area() === 'all' ? 'p' : A.area();
  const p = existing ? { ...existing } : { title: '', desc: '', area: area0, cat: null, life: null, goal: null, status: 'aktiv', due: '', log: [], ...(p0 || {}) };
  sheet({
    title: existing ? 'Projekt bearbeiten' : 'Neues Projekt', side: !isMobile(),
    body: `<input class="title-in" data-f="title" value="${esc(p.title)}" placeholder="Wie heißt das Projekt?" ${existing ? '' : 'autofocus'} aria-label="Titel">
      <div class="field" style="margin-top:12px"><label>Beschreibung</label><textarea class="textarea" data-f="desc" rows="3" placeholder="Was soll am Ende dabei herauskommen?">${esc(p.desc || '')}</textarea></div>
      <div class="props">
        <div class="k">Status</div><div class="v"><select class="select" data-f="status" style="width:auto">${Object.entries(C.PROJECT_STATUS).map(([k, l]) => `<option value="${k}" ${p.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="k">Bereich</div><div class="v"><select class="select" data-f="area" style="width:auto"><option value="p" ${p.area !== 'b' ? 'selected' : ''}>Privat</option><option value="b" ${p.area === 'b' ? 'selected' : ''}>Geschäftlich</option></select></div>
        <div class="k">Kategorie</div><div class="v" data-catbox>${catSelect(p.area, p.cat, 'data-f="cat" style="width:auto;max-width:100%"')}</div>
        <div class="k">Lebensbereich</div><div class="v">${lifeSelect(p.life, 'data-f="life" style="width:auto;max-width:100%"')}</div>
        <div class="k">Ziel</div><div class="v">${goalSelect(p.goal, 'data-f="goal" style="width:auto;max-width:100%"')}</div>
        <div class="k">Abschluss bis</div><div class="v"><input class="input" type="date" data-f="due" value="${esc(p.due || '')}"></div>
      </div>`,
    footer: existing ? `<div class="left"><button class="btn btn-ghost" data-del>${icon('trash', 14)}Löschen</button></div><button class="btn" data-close>Abbrechen</button><button class="btn btn-primary" data-save>Speichern</button>` : `<button class="btn" data-close>Abbrechen</button><button class="btn btn-primary" data-save>Anlegen</button>`,
    onMount: (el, close) => {
      const v = n => el.querySelector(`[data-f="${n}"]`);
      const save = () => {
        const title = v('title').value.trim();
        if (!title) { v('title').focus(); v('title').placeholder = 'Bitte einen Titel eingeben'; return; }
        const val = x => (x && x !== '__new' ? x : null);
        const prev = existing ? S.get('projects', existing.id) : null;
        let rec = { ...(prev || {}), title, desc: v('desc').value, status: v('status').value, area: v('area').value, cat: val(v('cat').value), life: val(v('life').value), goal: val(v('goal').value), due: v('due').value || '', log: (prev && prev.log) || [] };
        if (prev && prev.status !== rec.status) rec.log = [...rec.log, C.logEntry(`Status: ${C.PROJECT_STATUS[prev.status]} → ${C.PROJECT_STATUS[rec.status]}`, 'status')];
        rec = S.put('projects', rec);
        toast(existing ? 'Gespeichert' : 'Projekt angelegt');
        close();
        if (!existing) A.nav('#/projekte/' + rec.id);
      };
      el.addEventListener('change', async e => {
        if (e.target === v('area')) el.querySelector('[data-catbox]').innerHTML = catSelect(e.target.value, null, 'data-f="cat" style="width:auto;max-width:100%"');
        if (e.target === v('cat') && e.target.value === '__new') await handleNewOption(e.target, 'cat', v('area').value);
        if (e.target === v('life') && e.target.value === '__new') await handleNewOption(e.target, 'life');
      });
      el.addEventListener('click', async e => {
        if (e.target.closest('[data-save]')) save();
        if (e.target.closest('[data-del]')) {
          const n = C.projectTasks(existing, S.getData()).filter(C.isOpen).length;
          if (await confirmDialog(`„${esc(existing.title)}“ löschen?${n ? ` Die ${n} offenen Vorgänge bleiben erhalten, nur ohne Projekt.` : ''}`, { ok: 'Löschen', danger: true, title: 'Projekt löschen?', cooldown: 3 })) {
            const prev = S.remove('projects', existing.id);
            toast('Projekt gelöscht', { action: 'Rückgängig', onAction: () => S.restore('projects', prev) });
            close(); A.nav('#/projekte');
          }
        }
      });
      v('title').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
    },
  });
}

export function mount(root) {
  root.addEventListener('click', e => {
    if (e.target.closest('[data-newp]')) { editProject(null); return; }
    const t = e.target.closest('[data-tab]');
    if (t) { tab = t.dataset.tab; A.render(); return; }
    const ed = e.target.closest('[data-editp]');
    if (ed) { editProject(S.get('projects', ed.dataset.editp)); return; }
    const pt = e.target.closest('[data-ptask]');
    if (pt) { const p = S.get('projects', pt.dataset.ptask); A.newTask({ project: p.id, area: p.area, cat: p.cat, goal: p.goal || null }); return; }
    const al = e.target.closest('[data-addplog]');
    if (al) {
      const ta = root.querySelector('[data-plog]'); const txt = ta.value.trim(); if (!txt) { ta.focus(); return; }
      const p = S.get('projects', al.dataset.addplog);
      S.put('projects', { ...p, log: [...(p.log || []), C.logEntry(txt, 'note')] });
      toast('Mit Datum gespeichert');
    }
  });
  const f = root.querySelector('[data-pquick]');
  if (f) f.addEventListener('submit', e => {
    e.preventDefault();
    const inp = f.querySelector('[data-pq]'); const v = inp.value.trim(); if (!v) return;
    const p = S.get('projects', A.route.parts[0]); if (!p) return;
    const parsed = C.parseQuick ? C.parseQuick(v, A.now()) : { title: v };
    S.put('tasks', { title: parsed.title || v, due: parsed.due || null, dueTime: parsed.dueTime || null, prio: parsed.prio || 3, imp: true, urg: false, autoUrg: true, esc: true, area: p.area, cat: p.cat || null, project: p.id, goal: p.goal || null, status: 'neu', type: 'aufgabe', subs: [], people: [], log: [], no: S.nextTicketNo() });
    inp.value = '';
    setTimeout(() => { const x = document.querySelector('[data-pq]'); if (x) x.focus(); }, 20);
  });
}
