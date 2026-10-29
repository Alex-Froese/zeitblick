// Ziele & Entwicklung – mit Fortschritt (manuell, Zahl, Meilensteine oder über Projekte/Vorgänge)
import * as C from '../core.js';
import * as S from '../store.js';
import { esc, icon, sheet, toast, isMobile, confirmDialog } from '../ui.js';
import { A } from '../app-api.js';
import { emptyState, lifeSelect, progressBar, pct, fmtDateTime, taskLine } from './common.js';
import { handleNewOption } from '../entities.js';

let tab = 'aktiv';
const MODES = [['manual', 'Selbst einschätzen', 'Du schiebst den Fortschritt in Prozent'], ['number', 'Zahl', 'Von einem Startwert zu einem Zielwert'], ['milestones', 'Meilensteine', 'Schritte abhaken'], ['linked', 'Über Projekte & Vorgänge', 'Rechnet aus verknüpften Projekten und Vorgängen']];

function deadlineTxt(g, now) {
  if (!g.deadline) return '';
  const d = C.daysBetween(C.startOfDay(now), C.parseYmd(g.deadline));
  return d < 0 ? `Frist überschritten (${C.fmtDateShort(C.parseYmd(g.deadline))})` : d === 0 ? 'Frist heute' : `noch ${d} ${d === 1 ? 'Tag' : 'Tage'}`;
}
function measureTxt(g) {
  const m = g.mode || 'manual';
  if (m === 'number') return `${g.current ?? g.startVal ?? 0} / ${g.target ?? 0} ${g.unit || ''}`.trim();
  if (m === 'milestones') { const ms = g.milestones || []; return `${ms.filter(x => x.d).length} von ${ms.length} Meilensteinen`; }
  if (m === 'linked') { const d = S.getData(); const p = S.projects(x => x.goal === g.id).length; const t = S.tasks(x => x.goal === g.id).length; void d; return `${p} Projekte · ${t} Vorgänge`; }
  return 'selbst eingeschätzt';
}

function cardHtml(g, now) {
  const p = C.goalProgress(g, S.getData());
  const l = g.life && S.get('life', g.life);
  const dl = deadlineTxt(g, now);
  return `<button class="ecard" data-goal="${g.id}">
    <div class="row" style="align-items:flex-start"><div class="et grow">${esc(g.title)}</div>${g.status !== 'aktiv' ? `<span class="pill">${C.GOAL_STATUS[g.status]}</span>` : ''}</div>
    ${g.why ? `<div class="eb">${esc(g.why)}</div>` : ''}
    <div class="pv">${progressBar(p)}<b>${pct(p)}</b></div>
    <div class="em">${l ? `<span>${esc(l.icon || '')} ${esc(l.name)}</span>` : ''}<span>${esc(measureTxt(g))}</span>${dl ? `<span class="${dl.startsWith('Frist überschritten') ? 'over' : ''}">${esc(dl)}</span>` : ''}</div>
  </button>`;
}

export function render() {
  const now = A.now();
  const area = A.area();
  const all = S.goals(g => S.inArea(g, area));
  const list = all.filter(g => tab === 'alle' || (tab === 'aktiv' ? g.status === 'aktiv' || g.status === 'pausiert' : g.status === tab)).sort((a, b) => (a.status === 'pausiert') - (b.status === 'pausiert') || (a.deadline || '9').localeCompare(b.deadline || '9') || a.title.localeCompare(b.title));
  const active = all.filter(g => g.status === 'aktiv');
  const y0 = new Date(now.getFullYear(), 0, 1).getTime();
  const reached = all.filter(g => g.status === 'erreicht' && (g.reachedAt || g.updatedAt || 0) >= y0).length;
  const avg = active.length ? active.reduce((a, g) => a + C.goalProgress(g, S.getData()), 0) / active.length : 0;
  // nach Lebensbereich gruppieren
  const groups = new Map();
  for (const g of list) { const k = g.life && S.get('life', g.life) ? g.life : ''; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(g); }
  const keys = [...groups.keys()].sort((a, b) => (a ? S.get('life', a).order ?? 99 : 999) - (b ? S.get('life', b).order ?? 99 : 999));
  return `<div class="page">
    <div class="page-head"><div class="grow"><h1>Ziele & Entwicklung</h1><div class="psub">Wohin du willst – und wie weit du schon gekommen bist.</div></div>
      <div class="page-actions"><button class="btn btn-primary" data-newg>${icon('plus', 15)}Ziel</button></div></div>
    ${all.length ? `<div class="stats">
      <div class="stat"><div class="l">Aktive Ziele</div><div class="v">${active.length}</div><div class="s">${all.filter(g => g.status === 'pausiert').length} pausiert</div></div>
      <div class="stat"><div class="l">Fortschritt</div><div class="v">${pct(avg)}</div><div class="s">im Schnitt</div></div>
      <div class="stat"><div class="l">Erreicht</div><div class="v">${reached}</div><div class="s">in ${now.getFullYear()}</div></div>
      <div class="stat"><div class="l">Mit Frist</div><div class="v">${active.filter(g => g.deadline).length}</div><div class="s">${active.filter(g => g.deadline && g.deadline < C.ymd(now)).length} überschritten</div></div>
    </div>
    <div class="tabs">${[['aktiv', 'Aktiv'], ['erreicht', 'Erreicht'], ['verworfen', 'Verworfen'], ['alle', 'Alle']].map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>
    ${list.length ? keys.map(k => `${keys.length > 1 || k ? `<div class="section-t">${k ? esc((S.get('life', k).icon || '') + ' ' + S.get('life', k).name) : 'Ohne Lebensbereich'}</div>` : ''}<div class="cards">${groups.get(k).map(g => cardHtml(g, now)).join('')}</div>`).join('') : `<div class="card">${emptyState('🎯', 'Keine Ziele in dieser Ansicht', '')}</div>`}`
    : `<div class="card">${emptyState('🎯', 'Noch keine Ziele', 'Ein Ziel beschreibt, wohin du dich entwickeln willst. Verknüpfe Projekte und Vorgänge, dann siehst du automatisch, wie weit du bist.', '<button class="btn btn-primary" data-newg>Erstes Ziel anlegen</button>')}</div>`}
  </div>`;
}

export function editGoal(g0) {
  const existing = g0 && g0.id ? S.get('goals', g0.id) : null;
  const area0 = A.area() === 'all' ? 'p' : A.area();
  const g = existing ? C.structuredCloneSafe(existing) : { title: '', why: '', area: area0, life: null, status: 'aktiv', mode: 'manual', progress: 0, startVal: 0, target: 100, current: 0, unit: '', milestones: [], deadline: '', log: [], ...(g0 || {}) };
  let ms = [...(g.milestones || [])];
  let mode = g.mode || 'manual';
  const msHtml = () => ms.map((m, i) => `<div class="sub ${m.d ? 'done' : ''}"><button type="button" class="check sq ${m.d ? 'on' : ''}" data-mst="${i}" aria-label="Abhaken">${icon('check', 11)}</button><input type="text" value="${esc(m.t)}" data-msi="${i}" aria-label="Meilenstein"><button type="button" class="icon-btn sm" data-msdel="${i}" aria-label="Entfernen">${icon('x', 13)}</button></div>`).join('');
  const linkedHtml = () => {
    if (!existing) return '<p class="hint">Nach dem Anlegen kannst du Projekte und Vorgänge mit diesem Ziel verknüpfen.</p>';
    const ps = S.projects(p => p.goal === existing.id);
    const ts = S.tasks(t => t.goal === existing.id && !t.deleted);
    return `${ps.map(p => `<a class="li" href="#/projekte/${p.id}" data-close><span class="dot ${p.status === 'abgeschlossen' ? 'green' : 'none'}"></span><div class="grow"><div class="lt">${esc(p.title)}</div><div class="lm">Projekt · ${pct(C.projectProgress(p, S.getData()))}</div></div></a>`).join('')}
      ${ts.map(t => taskLine(t, { focus: false })).join('')}
      ${!ps.length && !ts.length ? '<p class="hint">Noch nichts verknüpft. Wähle dieses Ziel in einem Projekt oder Vorgang aus.</p>' : ''}
      <div class="row" style="margin-top:8px"><button type="button" class="btn sm" data-gnewtask>${icon('plus', 13)}Vorgang zu diesem Ziel</button></div>`;
  };
  const logHtml = () => [...(g.log || [])].sort((a, b) => b.at - a.at).map(x => `<div class="log-item ${x.kind || 'note'}"><span class="lb"></span><div><div class="lt">${esc(x.text)}</div><div class="ld">${fmtDateTime(x.at)}</div></div></div>`).join('');
  const sh = sheet({
    title: existing ? 'Ziel' : 'Neues Ziel', side: !isMobile(),
    body: `<input class="title-in" data-f="title" value="${esc(g.title)}" placeholder="Was willst du erreichen?" ${existing ? '' : 'autofocus'} aria-label="Ziel">
      ${existing ? `<div style="margin:14px 0 4px" data-gprog>${progressBar(C.goalProgress(existing, S.getData()), 'lg')}<div class="small muted" style="margin-top:4px">${pct(C.goalProgress(existing, S.getData()))} · ${esc(measureTxt(existing))}</div></div>` : ''}
      <div class="field" style="margin-top:12px"><label>Warum ist dir das wichtig?</label><textarea class="textarea" data-f="why" rows="2" placeholder="Dein Antrieb – liest du immer wieder">${esc(g.why || '')}</textarea></div>
      <div class="props">
        <div class="k">Status</div><div class="v"><select class="select" data-f="status" style="width:auto">${Object.entries(C.GOAL_STATUS).map(([k, l]) => `<option value="${k}" ${g.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="k">Lebensbereich</div><div class="v">${lifeSelect(g.life, 'data-f="life" style="width:auto;max-width:100%"')}</div>
        <div class="k">Bereich</div><div class="v"><select class="select" data-f="area" style="width:auto"><option value="p" ${g.area !== 'b' ? 'selected' : ''}>Privat</option><option value="b" ${g.area === 'b' ? 'selected' : ''}>Geschäftlich</option></select></div>
        <div class="k">Frist</div><div class="v"><input class="input" type="date" data-f="deadline" value="${esc(g.deadline || '')}"></div>
      </div>
      <div class="section-t">Fortschritt messen</div>
      <div class="qpick" data-modes>${MODES.map(([k, l, h]) => `<button type="button" class="${mode === k ? 'on' : ''}" data-mode="${k}"><b>${l}</b><span>${h}</span></button>`).join('')}</div>
      <div data-mbox="manual" class="${mode === 'manual' ? '' : 'hide'}" style="margin-top:12px"><div class="row"><input type="range" min="0" max="100" step="5" data-f="progress" value="${Number(g.progress) || 0}" style="flex:1;accent-color:var(--accent)" aria-label="Fortschritt"><b class="num" data-pv style="width:44px;text-align:right">${Number(g.progress) || 0} %</b></div></div>
      <div data-mbox="number" class="${mode === 'number' ? '' : 'hide'}" style="margin-top:12px"><div class="fgrid" style="grid-template-columns:repeat(4,minmax(0,1fr))"><div class="field"><label>Start</label><input class="input" type="number" data-f="startVal" value="${esc(String(g.startVal ?? 0))}"></div><div class="field"><label>Aktuell</label><input class="input" type="number" data-f="current" value="${esc(String(g.current ?? g.startVal ?? 0))}"></div><div class="field"><label>Ziel</label><input class="input" type="number" data-f="target" value="${esc(String(g.target ?? 100))}"></div><div class="field"><label>Einheit</label><input class="input" data-f="unit" value="${esc(g.unit || '')}" placeholder="kg, €, km"></div></div></div>
      <div data-mbox="milestones" class="${mode === 'milestones' ? '' : 'hide'}" style="margin-top:12px"><div class="subs" data-ms>${msHtml()}</div><div class="sub"><span class="check sq" style="border-style:dashed"></span><input type="text" data-msadd placeholder="Meilenstein hinzufügen, Enter drücken"></div></div>
      <div data-mbox="linked" class="${mode === 'linked' ? '' : 'hide'}" style="margin-top:12px"><div class="list" data-linked>${linkedHtml()}</div></div>
      ${existing ? `<div class="section-t">Entwicklung & Reflexion</div>
        <div class="log-add"><textarea class="textarea" data-glog rows="1" placeholder="Was hat sich getan? Wird mit Datum gespeichert"></textarea><button type="button" class="btn" data-addglog>Hinzufügen</button></div>
        <div class="log" data-glogs>${logHtml()}</div>` : ''}`,
    footer: existing ? `<div class="left"><button class="btn btn-ghost" data-del>${icon('trash', 14)}Löschen</button></div><button class="btn" data-close>Schließen</button><button class="btn btn-primary" data-save>Speichern</button>` : `<button class="btn" data-close>Abbrechen</button><button class="btn btn-primary" data-save>Anlegen</button>`,
    onMount: (el, close) => {
      const v = n => el.querySelector(`[data-f="${n}"]`);
      const collect = () => ({
        title: v('title').value.trim(), why: v('why').value.trim(), status: v('status').value, life: v('life').value && v('life').value !== '__new' ? v('life').value : null, area: v('area').value, deadline: v('deadline').value || '',
        mode, progress: Number(v('progress').value) || 0, startVal: Number(v('startVal').value) || 0, current: Number(v('current').value) || 0, target: Number(v('target').value) || 0, unit: v('unit').value.trim(), milestones: ms.filter(m => m.t.trim()),
      });
      const save = () => {
        const f = collect();
        if (!f.title) { v('title').focus(); v('title').placeholder = 'Bitte einen Titel eingeben'; return null; }
        const prev = existing ? S.get('goals', existing.id) : null;
        let rec = { ...(prev || {}), ...f, log: (prev && prev.log) || [] };
        if (prev && prev.status !== f.status) { rec.log = [...rec.log, C.logEntry(`Status: ${C.GOAL_STATUS[prev.status]} → ${C.GOAL_STATUS[f.status]}`, 'status')]; if (f.status === 'erreicht') rec.reachedAt = Date.now(); }
        if (prev && f.mode === 'number' && Number(prev.current) !== f.current) rec.log = [...rec.log, C.logEntry(`Stand: ${f.current} ${f.unit}`.trim(), 'system')];
        rec = S.put('goals', rec);
        return rec;
      };
      el.addEventListener('click', async e => {
        const tl = e.target.closest('[data-task]');
        if (tl && !e.target.closest('button')) { close(); A.openTask(tl.dataset.task); return; }
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.mode) { mode = b.dataset.mode; el.querySelectorAll('[data-mode]').forEach(x => x.classList.toggle('on', x === b)); el.querySelectorAll('[data-mbox]').forEach(x => x.classList.toggle('hide', x.dataset.mbox !== mode)); return; }
        if (b.dataset.mst !== undefined) { const i = Number(b.dataset.mst); ms[i].d = !ms[i].d; el.querySelector('[data-ms]').innerHTML = msHtml(); if (existing) save(); return; }
        if (b.dataset.msdel !== undefined) { ms.splice(Number(b.dataset.msdel), 1); el.querySelector('[data-ms]').innerHTML = msHtml(); return; }
        if (b.hasAttribute('data-gnewtask')) { const r = save(); if (!r) return; close(); A.newTask({ goal: r.id, area: r.area }); return; }
        if (b.hasAttribute('data-addglog')) {
          const ta = el.querySelector('[data-glog]'); const txt = ta.value.trim(); if (!txt) { ta.focus(); return; }
          const r = save(); if (!r) return;
          S.put('goals', { ...S.get('goals', r.id), log: [...(S.get('goals', r.id).log || []), C.logEntry(txt, 'note')] });
          g.log = S.get('goals', r.id).log; ta.value = ''; el.querySelector('[data-glogs]').innerHTML = logHtml(); toast('Mit Datum gespeichert');
          return;
        }
        if (b.hasAttribute('data-save')) { const r = save(); if (r) { toast(existing ? 'Gespeichert' : 'Ziel angelegt'); close(); } return; }
        if (b.hasAttribute('data-del')) {
          if (await confirmDialog(`„${esc(existing.title)}“ löschen? Verknüpfte Projekte und Vorgänge bleiben erhalten.`, { ok: 'Löschen', danger: true, title: 'Ziel löschen?', cooldown: 3 })) { const prev = S.remove('goals', existing.id); toast('Ziel gelöscht', { action: 'Rückgängig', onAction: () => S.restore('goals', prev) }); close(); }
        }
      });
      el.addEventListener('input', e => {
        if (e.target === v('progress')) el.querySelector('[data-pv]').textContent = v('progress').value + ' %';
        if (e.target.dataset.msi !== undefined) ms[Number(e.target.dataset.msi)].t = e.target.value;
      });
      el.addEventListener('change', async e => { if (e.target === v('life') && e.target.value === '__new') await handleNewOption(e.target, 'life'); });
      const add = el.querySelector('[data-msadd]');
      add.addEventListener('keydown', e => { if (e.key === 'Enter' && add.value.trim()) { e.preventDefault(); ms.push({ id: C.uid('m', 5), t: add.value.trim(), d: false }); add.value = ''; el.querySelector('[data-ms]').innerHTML = msHtml(); } });
      v('title').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); const r = save(); if (r) { toast(existing ? 'Gespeichert' : 'Ziel angelegt'); close(); } } });
    },
  });
  return sh;
}

export function mount(root) {
  root.addEventListener('click', e => {
    const g = e.target.closest('[data-goal]');
    if (g) { editGoal(S.get('goals', g.dataset.goal)); return; }
    if (e.target.closest('[data-newg]')) { editGoal(null); return; }
    const t = e.target.closest('[data-tab]');
    if (t) { tab = t.dataset.tab; A.render(); }
  });
}
