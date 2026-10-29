// Vorgänge – Index aller offenen Vorgänge: gespeicherte Ansichten als Reiter, Liste | Matrix | Kanban
import * as C from '../core.js';
import * as S from '../store.js';
import { esc, icon, popover, debounce, isMobile, toast, reducedMotion, promptDialog, confirmDialog, makeSortable } from '../ui.js';
import { A } from '../app-api.js';
import { vibrate } from '../audio.js';
import { ampDot, ampLevel, statusPill, prioLabel, catTag, dueInfo, fmtDay, fmtDueShort, areaShort, emptyState, catColor, sortTasks } from './common.js';

let q = '';
const OPEN = C.OPEN_STATUS || ['neu', 'geplant', 'aktiv', 'wartet'];
const DUE = [['', 'Alle'], ['over', 'Überfällig'], ['today', 'Bis heute'], ['week', 'Diese Woche'], ['later', 'Später'], ['none', 'Ohne Frist']];
const AMPS = [['alarm', 'Alarm'], ['red', 'Rot'], ['yellow', 'Gelb'], ['green', 'Grün'], ['none', 'Ohne Frist']];
const COLS = [['amp', '', 't-amp'], ['no', 'Nr.', 't-no'], ['title', 'Titel', ''], ['cat', 'Kategorie', ''], ['area', 'Bereich', ''], ['created', 'Erstellt', ''], ['due', 'Fällig', ''], ['prio', 'Prio', ''], ['status', 'Status', '']];
const MODES = [['list', 'Liste', 'list'], ['matrix', 'Matrix', 'matrix'], ['kanban', 'Kanban', 'layers']];
const QHINT = { 1: 'Jetzt erledigen – Fokus starten', 2: 'Wichtig: einen Kalenderblock einplanen', 3: 'Dringend, aber nicht wichtig: delegieren', 4: 'Weder noch: eliminieren' };
const EMPTY = { 1: 'Nichts brennt gerade. Sehr gut.', 2: 'Plane hier, was dich langfristig voranbringt.', 3: 'Was kann jemand anderes übernehmen?', 4: 'Hier landet, was du streichen kannst.' };
export const DEFAULT_VIEWS = [
  { id: 'v-heute', name: 'Bis heute', filter: { due: 'today' } },
  { id: 'v-over', name: 'Überfällig', filter: { due: 'over' } },
  { id: 'v-biz', name: 'Business', filter: { area: 'b' } },
  { id: 'v-wartet', name: 'Wartet', filter: { status: ['wartet'] } },
  { id: 'v-klaer', name: 'Klärungen', filter: { type: ['klaerung'] } },
];

function flt() { return S.local.vgFilter || {}; }
function setFlt(f) { S.local.vgFilter = f; S.saveLocal(); }
function sortState() { return S.local.vgSort || { k: 'due', d: 1 }; }
function mode() { return S.local.vgMode || 'list'; }
function views() { return S.vgViews(); }
function nFilters(f = flt()) { return ['status', 'type', 'prio', 'amp', 'cat'].reduce((a, k) => a + ((f[k] || []).length ? 1 : 0), 0) + (f.due ? 1 : 0) + (f.project ? 1 : 0) + (f.person ? 1 : 0) + (f.life ? 1 : 0) + (f.rec ? 1 : 0) + (f.area ? 1 : 0) + (f.multi ? 1 : 0); }
function sameFilter(a, b) { const n = x => JSON.stringify(Object.fromEntries(Object.entries(x || {}).filter(([, v]) => v !== '' && v !== false && !(Array.isArray(v) && !v.length)).sort())); return n(a) === n(b); }

export function setMode(m) { S.local.vgMode = m; S.saveLocal(); if (A.route.name !== 'vorgaenge') A.nav('#/vorgaenge'); else A.render(); }
export function openFilter() { const b = document.querySelector('[data-flt]'); if (b) filterPopover(b); }
export async function saveView() {
  const name = await promptDialog('Unter welchem Namen soll diese Ansicht gespeichert werden?', { title: 'Ansicht speichern', placeholder: 'z. B. Business heute', value: '' });
  if (!name || !name.trim()) return;
  const list = [...views()];
  const v = { id: C.uid('v', 6), name: name.trim(), filter: flt(), sort: sortState(), mode: mode() };
  list.push(v);
  S.setVgViews(list);
  S.local.vgActive = v.id; S.saveLocal();
  toast(`Ansicht „${esc(v.name)}“ gespeichert`);
}

function applyFilter(list, now, s) {
  const f = flt();
  const todayKey = C.ymd(now);
  const weekEnd = C.ymd(C.addDays(C.startOfWeek(now), 6));
  const qq = C.norm(q);
  return list.filter(t => {
    if ((f.status || []).length && !f.status.includes(C.statusOf(t))) return false;
    if ((f.type || []).length && !f.type.includes(C.typeOf(t))) return false;
    if ((f.prio || []).length && !f.prio.includes(t.prio || 3)) return false;
    if ((f.cat || []).length && !f.cat.includes(t.cat || '')) return false;
    if ((f.amp || []).length && !f.amp.includes(C.ampel(t, now, s).level)) return false;
    if (f.area && (t.area || 'p') !== f.area) return false;
    if (f.project && t.project !== f.project) return false;
    if (f.person && !(t.people || []).includes(f.person)) return false;
    if (f.life && C.lifeOfTask(t, S.getData()) !== f.life) return false;
    if (f.rec && !(t.rec && t.rec.f)) return false;
    if (f.multi && !(t.multi && t.multi.on)) return false;
    if (f.due) {
      const lvl = C.ampel(t, now, s).level;
      if (f.due === 'over' && !(lvl === 'red' || lvl === 'alarm')) return false;
      if (f.due === 'today' && !(t.due && t.due <= todayKey)) return false;
      if (f.due === 'week' && !(t.due && t.due <= weekEnd)) return false;
      if (f.due === 'later' && !(t.due && t.due > weekEnd)) return false;
      if (f.due === 'none' && t.due) return false;
    }
    if (qq && !C.norm(`${t.title} ${t.notes || ''} #${t.no || ''} ${(t.log || []).map(l => l.text).join(' ')}`).includes(qq)) return false;
    return true;
  });
}

function sortList(list, now, s) {
  const { k, d } = sortState();
  const val = t => {
    switch (k) {
      case 'amp': return -C.AMPEL[C.ampel(t, now, s).level].rank;
      case 'no': return t.no || 0;
      case 'title': return (t.title || '').toLowerCase();
      case 'cat': { const c = S.cat(t.cat); return c ? c.name.toLowerCase() : '￿'; }
      case 'area': return t.area || 'p';
      case 'created': return t.createdAt || 0;
      case 'due': { const x = C.taskDueAt(t); return x ? x.getTime() : 9e15; }
      case 'prio': return t.prio || 3;
      case 'status': return C.STATUS_ORDER.indexOf(C.statusOf(t));
      default: return 0;
    }
  };
  if (k === 'due') sortTasks(list, now);
  return list.sort((a, b) => { const va = val(a), vb = val(b); return (va < vb ? -1 : va > vb ? 1 : 0) * d || (a.prio || 3) - (b.prio || 3) || (a.no || 0) - (b.no || 0); });
}

function shortInfo(t) {
  const bits = [];
  const ty = C.typeOf(t);
  if (ty !== 'aufgabe') bits.push(C.TYPES[ty].name);
  const p = t.project && S.get('projects', t.project); if (p) bits.push(`${icon('folder', 11, 'inl')} ${esc(p.title)}`);
  const ppl = (t.people || []).map(id => S.get('people', id)).filter(Boolean); if (ppl.length) bits.push(`${icon('person', 11, 'inl')} ${ppl.map(x => esc(x.name)).join(', ')}`);
  if ((t.subs || []).length) bits.push(`${t.subs.filter(x => x.d).length}/${t.subs.length} Schritte`);
  if (t.multi && t.multi.on) bits.push(`${icon('repeat', 11, 'inl')} ${esc(C.describeMulti(t))}`);
  else if (t.rec && t.rec.f) bits.push(`${icon('repeat', 11, 'inl')} ${esc(C.describeRule(t.rec, t.due))}`);
  if (t.delegate) bits.push(`wartet auf ${esc(t.delegate)}`);
  if ((t.links || []).length || t.fromNote) bits.push(`${icon('link', 11, 'inl')} ${(t.links || []).length + (t.fromNote ? 1 : 0)}`);
  if (!bits.length && t.notes) bits.push(esc(String(t.notes).replace(/\s+/g, ' ').slice(0, 80)));
  return bits.join(' · ');
}

function doneBtn(t) {
  if (t.multi && t.multi.on && t.multi.mode !== 'remind') { const k = C.ymd(A.now()); const n = C.multiDoneOn(t, k); const tot = Math.max(1, C.multiSlots(t, A.now()).length); return `<button class="icon-btn sm mchk-s" data-act="multi" data-id="${t.id}" aria-label="Durchgang abhaken" title="Durchgang abhaken (${n}/${tot})">${n}/${tot}</button>`; }
  return `<button class="icon-btn sm" data-act="done" data-id="${t.id}" aria-label="Erledigen" title="Erledigen">${icon('check', 15)}</button>`;
}

function rowHtml(t, now, showArea) {
  const d = dueInfo(t, now);
  return `<tr data-task="${t.id}" tabindex="0">
    <td class="t-amp">${ampDot(ampLevel(t, now))}</td>
    <td class="t-no">#${String(t.no || 0).padStart(4, '0')}</td>
    <td class="t-title"><div class="tt">${esc(t.title)}</div>${shortInfo(t) ? `<div class="ts">${shortInfo(t)}</div>` : ''}</td>
    <td>${catTag(t.cat)}</td>
    ${showArea ? `<td class="small muted">${areaShort(t.area)}</td>` : ''}
    <td class="t-date">${fmtDay(t.createdAt)}</td>
    <td class="t-date ${d ? d.cls : ''}" title="${d ? esc(d.txt) : ''}">${esc(fmtDueShort(t))}</td>
    <td>${prioLabel(t.prio)}</td>
    <td>${statusPill(t, { select: true })}</td>
    <td class="t-act"><button class="icon-btn sm" data-act="focus" data-id="${t.id}" aria-label="Fokus starten" title="Fokus starten">${icon('play', 13)}</button>${doneBtn(t)}</td>
  </tr>`;
}

function cardHtml(t, now) {
  const d = dueInfo(t, now); const c = S.cat(t.cat);
  return `<div class="li" data-task="${t.id}" tabindex="0">${ampDot(ampLevel(t, now))}<div class="grow"><div class="lt">${esc(t.title)}</div>
    <div class="lm"><span class="faint">#${String(t.no || 0).padStart(4, '0')}</span>${statusPill(t, { select: true })}${d ? `<span class="${d.cls}">${esc(d.txt)}</span>` : ''}${c ? `<span class="tag"><i class="catdot" style="background:${catColor(c)}"></i>${esc(c.name)}</span>` : ''}${(t.prio || 3) <= 2 ? prioLabel(t.prio) : ''}</div></div>
    ${doneBtn(t)}</div>`;
}

function chipsHtml() {
  const f = flt();
  const out = [];
  const add = (label, key, val) => out.push(`<span class="chip on">${label}<button class="icon-btn sm x" data-unf="${key}" data-unv="${esc(String(val ?? ''))}" aria-label="Filter entfernen" style="width:18px;height:18px">${icon('x', 11)}</button></span>`);
  if (f.area) add(f.area === 'b' ? 'Geschäftlich' : 'Privat', 'area');
  for (const v of f.status || []) add(C.STATUS[v].name, 'status', v);
  for (const v of f.type || []) add(C.TYPES[v].name, 'type', v);
  for (const v of f.prio || []) add('P' + v, 'prio', v);
  for (const v of f.amp || []) add('Ampel: ' + (AMPS.find(x => x[0] === v) || ['', v])[1], 'amp', v);
  for (const v of f.cat || []) { const c = S.cat(v); add(c ? esc(c.name) : 'Ohne Kategorie', 'cat', v); }
  if (f.due) add(DUE.find(x => x[0] === f.due)[1], 'due');
  if (f.project) { const p = S.get('projects', f.project); add('Projekt: ' + esc(p ? p.title : '?'), 'project'); }
  if (f.person) { const p = S.get('people', f.person); add('Person: ' + esc(p ? p.name : '?'), 'person'); }
  if (f.life) { const l = S.get('life', f.life); add(esc(l ? l.name : 'Lebensbereich'), 'life'); }
  if (f.rec) add('Wiederkehrend', 'rec');
  if (f.multi) add('Mehrmals täglich', 'multi');
  return out.length ? `<div class="filters">${out.join('')}<button class="link-btn" data-freset>Alle zurücksetzen</button></div>` : '';
}

function catSummary(c, now, area) {
  const all = S.tasks(t => t.cat === c.id && S.inArea(t, area));
  const open = all.filter(C.isOpen);
  const cut = now.getTime() - 30 * C.DAY;
  const done30 = all.filter(t => !(t.rec && t.rec.f) && C.statusOf(t) === 'erledigt' && (t.doneAt || 0) > cut).length + all.filter(t => t.rec && t.rec.f).reduce((a, t) => a + (t.hist || []).filter(k => C.parseYmd(k).getTime() > cut).length, 0);
  const focus = S.focusSessions(f => f.ok && f.cat === c.id && f.s > cut).reduce((a, f) => a + (f.min || 0), 0);
  const over = open.filter(t => { const l = C.ampel(t, now, S.settings()).level; return l === 'red' || l === 'alarm'; }).length;
  return `<div class="banner" style="background:var(--surface);border:1px solid var(--line)"><i class="catdot" style="background:${catColor(c)};width:12px;height:12px"></i><b class="grow">${esc(c.name)}</b>
    <span class="small muted">${open.length} offen · ${over ? `<b style="color:var(--bad)">${over} überfällig</b> · ` : ''}${done30} erledigt (30 T.) · ${esc(C.fmtDurShort(focus))} Fokus</span></div>`;
}

/* ---------------- Reiter (gespeicherte Ansichten) ---------------- */
function tabsHtml() {
  const vs = views();
  const act = S.local.vgActive || '';
  const cur = vs.find(v => v.id === act);
  const changed = cur ? !sameFilter(cur.filter, flt()) || (cur.mode && cur.mode !== mode()) : nFilters() > 0;
  return `<div class="vg-tabs" role="tablist"><div class="vg-tabs-in" data-vtabs>
    <button class="vtab ${!act ? 'on' : ''}" data-vtab="" role="tab">Alle</button>
    ${vs.map(v => `<button class="vtab ${act === v.id ? 'on' : ''}" data-vtab="${v.id}" data-sort-id="${v.id}" role="tab" title="Doppelklick: umbenennen">${esc(v.name)}${act === v.id && changed ? '<i class="vdot" title="Geändert"></i>' : ''}</button>`).join('')}
  </div>
  ${changed ? `<button class="btn sm btn-ghost" data-vsave>${icon('download', 12)}${cur ? 'Änderung speichern' : 'Als Ansicht speichern'}</button>` : `<button class="icon-btn sm" data-vnew title="Aktuelle Ansicht speichern (Umschalt+S)" aria-label="Ansicht speichern">${icon('plus', 15)}</button>`}
  ${act ? `<button class="icon-btn sm" data-vmenu="${act}" title="Ansicht verwalten" aria-label="Ansicht verwalten">${icon('more', 15)}</button>` : ''}</div>`;
}

function loadView(id) {
  const v = views().find(x => x.id === id);
  S.local.vgActive = v ? v.id : '';
  if (v) { S.local.vgFilter = { ...(v.filter || {}) }; if (v.sort) S.local.vgSort = v.sort; if (v.mode) S.local.vgMode = v.mode; }
  else S.local.vgFilter = {};
  S.saveLocal();
  A.render();
}

/* ---------------- Matrix ---------------- */
let lastRects = new Map();
let knownIds = new Set();
function qcard(t, k, now) {
  const c = S.cat(t.cat);
  const d = dueInfo(t, now);
  const lvl = C.ampel(t, now, S.settings()).level;
  const st = C.statusOf(t);
  const acts = {
    1: `<button class="btn-now" data-act="focus" data-id="${t.id}" title="Jetzt erledigen: Fokus starten">${icon('play', 11)}<span>Jetzt</span></button>`,
    2: `<button class="icon-btn sm qa" data-act="plan" data-id="${t.id}" title="Kalenderblock einplanen" aria-label="Einplanen">${icon('calendar', 14)}</button><button class="icon-btn sm" data-act="focus" data-id="${t.id}" aria-label="Fokus starten" title="Fokus starten">${icon('play', 12)}</button>`,
    3: `<button class="icon-btn sm qa" data-act="delegate" data-id="${t.id}" title="An eine Person delegieren" aria-label="Delegieren">${icon('person', 14)}</button>`,
    4: `<button class="icon-btn sm qa" data-act="discard" data-id="${t.id}" title="Eliminieren – verwerfen ins Archiv" aria-label="Eliminieren">${icon('x', 14)}</button>`,
  };
  return `<div class="qcard" data-task="${t.id}" data-drag="${t.id}" tabindex="0">
    <button class="check" data-act="${t.multi && t.multi.on && t.multi.mode !== 'remind' ? 'multi' : 'done'}" data-id="${t.id}" aria-label="Erledigen">${icon('check', 11)}</button>
    <div class="grow"><div class="qt">${esc(t.title)}</div>
      <div class="qmeta">${lvl !== 'none' && lvl !== 'done' ? ampDot(lvl) : ''}${d ? `<span class="${d.cls}">${esc(d.txt)}</span>` : ''}${c ? `<span><i class="catdot" style="background:${catColor(c)};margin-right:4px"></i>${esc(c.name)}</span>` : ''}${st !== 'neu' ? `<span>${esc(C.STATUS[st].name)}</span>` : ''}${t.subs && t.subs.length ? `<span>${t.subs.filter(x => x.d).length}/${t.subs.length}</span>` : ''}${t.delegate ? `<span>→ ${esc(t.delegate)}</span>` : ''}${t.rec && t.rec.f ? `<span>${icon('repeat', 11, 'inl')}</span>` : ''}</div></div>
    <div class="qacts">${acts[k]}</div></div>`;
}
function matrixHtml(list, now, s) {
  lastRects = new Map();
  document.querySelectorAll('.qcard[data-drag]').forEach(el => lastRects.set(el.dataset.drag, el.getBoundingClientRect()));
  const by = { 1: [], 2: [], 3: [], 4: [] };
  for (const t of list) by[C.quadrant(t, now, s)].push(t);
  for (const k of [1, 2, 3, 4]) sortTasks(by[k], now);
  const stack = isMobile() && S.local.matrixStack !== false;
  const qhead = k => {
    const extra = k === 1 && by[1].length ? `<button class="btn sm btn-danger" data-qall="1">${icon('play', 11)}Fokus</button>`
      : k === 2 && by[2].length ? `<button class="btn sm" data-qall="2">${icon('calendar', 12)}Alle einplanen</button>`
        : k === 4 && by[4].length ? `<button class="btn sm btn-ghost" data-qall="4">${icon('x', 12)}Alle eliminieren</button>` : '';
    return `<div class="qhead"><span class="qm" style="background:var(--q${k})"></span><span class="qn">${C.QUADRANTS[k].name}</span><span class="qc">${by[k].length}</span><span class="sp"></span>${extra}</div><div class="qhint">${QHINT[k]}</div>`;
  };
  return `${isMobile() ? `<div class="row" style="justify-content:flex-end;margin-bottom:6px"><button class="btn sm" data-mx="stack">${stack ? 'Raster' : 'Liste'}</button></div>` : ''}
  <div class="matrix ${stack ? 'stackm' : ''}">${[1, 2, 3, 4].map(k => `<section class="quad q${k}" data-quad="${k}" data-zone="${k}" aria-label="${C.QUADRANTS[k].name}">${qhead(k)}
      <div class="qbody">${by[k].length ? by[k].map(t => qcard(t, k, now)).join('') : `<div class="qempty">${EMPTY[k]}</div>`}</div>
      <label class="qadd">${icon('plus', 15)}<input data-qadd="${k}" placeholder="Vorgang hinzufügen" aria-label="Vorgang zu ${C.QUADRANTS[k].name} hinzufügen"></label></section>`).join('')}</div>`;
}

/* ---------------- Kanban ---------------- */
const KCOLS = [['neu', 'Neu'], ['geplant', 'Geplant'], ['aktiv', 'In Bearbeitung'], ['wartet', 'Wartet'], ['erledigt', 'Erledigt heute']];
function kanbanHtml(list, now) {
  const today = C.ymd(now);
  const area = A.area();
  const doneToday = S.tasks(t => S.inArea(t, area) && C.statusOf(t) === 'erledigt' && t.doneAt && C.ymd(new Date(t.doneAt)) === today);
  return `<div class="kanban">${KCOLS.map(([k, name]) => {
    const items = k === 'erledigt' ? doneToday : list.filter(t => C.statusOf(t) === k);
    if (k !== 'erledigt') sortTasks(items, now);
    return `<section class="kcol k-${k}" data-zone="${k}"><div class="khead"><span class="pill st-${k}"><span class="dot"></span>${name}</span><span class="qc">${items.length}</span></div>
      <div class="kbody">${items.map(t => { const d = dueInfo(t, now); const c = S.cat(t.cat); return `<div class="kcard ${k === 'erledigt' ? 'done' : ''}" data-task="${t.id}" ${k === 'erledigt' ? '' : `data-drag="${t.id}"`} tabindex="0"><div class="kt">${esc(t.title)}</div><div class="qmeta">${k !== 'erledigt' ? ampDot(ampLevel(t, now)) : ''}${d && k !== 'erledigt' ? `<span class="${d.cls}">${esc(d.txt)}</span>` : ''}${c ? `<span><i class="catdot" style="background:${catColor(c)};margin-right:4px"></i>${esc(c.name)}</span>` : ''}${t.delegate ? `<span>→ ${esc(t.delegate)}</span>` : ''}</div>${k !== 'erledigt' ? `<div class="kacts"><button class="icon-btn sm" data-act="focus" data-id="${t.id}" aria-label="Fokus" title="Fokus starten">${icon('play', 12)}</button>${doneBtn(t)}</div>` : ''}</div>`; }).join('') || '<div class="qempty">Leer</div>'}</div></section>`;
  }).join('')}</div>`;
}

/* ---------------- Render ---------------- */
export function render(route) {
  const p = (route && route.params) || {};
  if (p.mode && MODES.some(m => m[0] === p.mode)) { S.local.vgMode = p.mode; S.saveLocal(); }
  const fromLink = ['f', 'type', 'cat', 'project', 'person', 'life', 'rec', 'status', 'area'].some(k => p[k] !== undefined);
  if (fromLink) {
    const f = {};
    if (p.f) f.due = p.f;
    if (p.type) f.type = p.type.split(',').filter(x => C.TYPES[x]);
    if (p.cat) f.cat = [p.cat];
    if (p.project) f.project = p.project;
    if (p.person) f.person = p.person;
    if (p.life) f.life = p.life;
    if (p.rec) f.rec = true;
    if (p.area === 'p' || p.area === 'b') f.area = p.area;
    if (p.status) f.status = p.status.split(',').filter(x => C.STATUS[x]);
    setFlt(f); S.local.vgActive = ''; S.saveLocal();
  }
  if (Object.keys(p).length) history.replaceState(null, '', '#/vorgaenge');
  const now = A.now();
  const s = S.settings();
  const area = A.area();
  const base = S.openTasks(t => S.inArea(t, area));
  const list = sortList(applyFilter(base, now, s), now, s);
  const red = base.filter(t => { const l = C.ampel(t, now, s).level; return l === 'red' || l === 'alarm'; }).length;
  const active = base.filter(t => C.statusOf(t) === 'aktiv').length;
  const waiting = base.filter(t => C.statusOf(t) === 'wartet').length;
  const f = flt();
  const nf = nFilters();
  const showArea = area === 'all';
  const st = sortState();
  const oneCat = (f.cat || []).length === 1 && S.cat(f.cat[0]);
  const m = mode();
  const mobile = isMobile();
  const head = COLS.filter(([k]) => k !== 'area' || showArea).map(([k, l, cls]) => `<th class="sortable ${cls}" data-sort="${k}" aria-sort="${st.k === k ? (st.d > 0 ? 'ascending' : 'descending') : 'none'}">${l}${st.k === k ? `<span class="arr">${st.d > 0 ? '↑' : '↓'}</span>` : ''}</th>`).join('') + '<th class="t-act"></th>';
  let body;
  if (!list.length && m === 'list') body = `<div class="card">${base.length ? emptyState('🔎', 'Keine Vorgänge für diese Filter', 'Ändere die Suche oder setze die Filter zurück.', '<button class="btn" data-freset>Filter zurücksetzen</button>') : emptyState('✨', 'Keine offenen Vorgänge', 'Alles erledigt. Neue Vorgänge entstehen aus der Inbox oder über „+ Vorgang“.', '<button class="btn btn-primary" data-newt>Vorgang anlegen</button>')}</div>`;
  else if (m === 'matrix') body = matrixHtml(list, now, s);
  else if (m === 'kanban') body = kanbanHtml(list, now);
  else body = mobile ? `<div class="card pad-sm"><div class="list">${list.map(t => cardHtml(t, now)).join('')}</div></div>` : `<div class="card flush"><div class="table-wrap"><table class="tbl vg"><thead><tr>${head}</tr></thead><tbody>${list.map(t => rowHtml(t, now, showArea)).join('')}</tbody></table></div></div>`;
  return `<div class="page ${m !== 'list' ? 'page-wide' : ''}">
    <div class="page-head"><div class="grow"><h1>Vorgänge${area !== 'all' ? ` <span class="muted" style="font-weight:500">· ${area === 'b' ? 'Geschäftlich' : 'Privat'}</span>` : ''}</h1>
      <div class="psub">${base.length} offen${red ? ` · <span style="color:var(--bad);font-weight:600">${red} überfällig</span>` : ''}${active ? ` · ${active} in Bearbeitung` : ''}${waiting ? ` · ${waiting} wartend` : ''}</div></div>
      <div class="page-actions"><a class="btn btn-ghost" href="#/archiv">${icon('archive', 15)}<span class="hide-s">Archiv</span></a><button class="btn btn-primary" data-newt>${icon('plus', 15)}Vorgang</button></div></div>
    ${tabsHtml()}
    ${oneCat ? catSummary(oneCat, now, area) : ''}
    <div class="toolbar">
      <div class="seg sm vg-mode" role="group" aria-label="Darstellung">${MODES.map(([k, l, ic]) => `<button data-vmode="${k}" aria-pressed="${m === k}">${icon(ic, 13)}<span>${l}</span></button>`).join('')}</div>
      <label class="search grow" style="max-width:380px">${icon('search', 15)}<input id="vg-q" data-vq value="${esc(q)}" placeholder="Titel, Notizen, Verlauf oder #Nr." aria-label="Vorgänge durchsuchen"></label>
      <button class="btn ${nf ? 'on-f' : ''}" data-flt aria-label="Filter">${icon('filter', 15)}<span class="hide-s">Filter</span>${nf ? ` <span class="cnt-b">${nf}</span>` : ''}</button>
      ${mobile && m === 'list' ? `<select class="select" data-msort style="width:auto;height:32px" aria-label="Sortierung">${COLS.map(([k, l]) => `<option value="${k}" ${st.k === k ? 'selected' : ''}>${l || 'Ampel'}</option>`).join('')}</select>` : ''}
      <span class="sp"></span><span class="small muted">${list.length === base.length ? `${list.length} Vorgänge` : `${list.length} von ${base.length}`}</span>
    </div>
    ${chipsHtml()}
    ${body}
  </div>`;
}

function filterPopover(anchor) {
  const area = A.area();
  const cats = S.cats(area === 'all' ? null : area);
  const projects = S.projects(p => p.status !== 'abgeschlossen').sort((a, b) => a.title.localeCompare(b.title));
  const people = S.people().sort((a, b) => a.name.localeCompare(b.name));
  const life = S.lifeAreas();
  const f = flt();
  const multi = (key, opts) => `<div class="chips">${opts.map(([v, l]) => `<button class="chip ${(f[key] || []).map(String).includes(String(v)) ? 'on' : ''}" data-fk="${key}" data-fv="${esc(String(v))}">${l}</button>`).join('')}</div>`;
  const html = `<div class="flt-pop">
    <div class="flt-sec"><div class="lbl">Bereich</div><div class="chips">${[['', 'Wie oben'], ['p', 'Privat'], ['b', 'Geschäftlich']].map(([v, l]) => `<button class="chip ${(f.area || '') === v ? 'on' : ''}" data-farea="${v}">${l}</button>`).join('')}</div></div>
    <div class="flt-sec"><div class="lbl">Status</div>${multi('status', OPEN.map(k => [k, C.STATUS[k].name]))}</div>
    <div class="flt-sec"><div class="lbl">Fälligkeit</div><div class="chips">${DUE.map(([v, l]) => `<button class="chip ${(f.due || '') === v ? 'on' : ''}" data-fdue="${v}">${l}</button>`).join('')}</div></div>
    <div class="flt-sec"><div class="lbl">Ampel</div>${multi('amp', AMPS)}</div>
    <div class="flt-sec"><div class="lbl">Priorität</div>${multi('prio', [1, 2, 3, 4].map(p => [p, 'P' + p + ' ' + C.PRIOS[p].name]))}</div>
    <div class="flt-sec"><div class="lbl">Typ</div>${multi('type', Object.values(C.TYPES).map(x => [x.key, x.name]))}</div>
    ${cats.length ? `<div class="flt-sec"><div class="lbl">Kategorie</div>${multi('cat', [...cats.map(c => [c.id, `<i class="catdot" style="background:${catColor(c)}"></i>${esc(c.name)}`]), ['', 'Ohne Kategorie']])}</div>` : ''}
    ${projects.length || people.length || life.length ? `<div class="flt-sec fgrid">
      ${projects.length ? `<div class="field" style="margin:0 0 8px"><label>Projekt</label><select class="select" data-fsel="project"><option value="">Alle</option>${projects.map(p => `<option value="${p.id}" ${f.project === p.id ? 'selected' : ''}>${esc(p.title)}</option>`).join('')}</select></div>` : ''}
      ${people.length ? `<div class="field" style="margin:0 0 8px"><label>Person</label><select class="select" data-fsel="person"><option value="">Alle</option>${people.map(p => `<option value="${p.id}" ${f.person === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>` : ''}
      ${life.length ? `<div class="field" style="margin:0 0 8px"><label>Lebensbereich</label><select class="select" data-fsel="life"><option value="">Alle</option>${life.map(l => `<option value="${l.id}" ${f.life === l.id ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></div>` : ''}
    </div>` : ''}
    <div class="flt-sec row" style="gap:16px"><label class="switch small"><input type="checkbox" data-frec ${f.rec ? 'checked' : ''}><span class="tr"></span>Nur wiederkehrende</label><label class="switch small"><input type="checkbox" data-fmulti ${f.multi ? 'checked' : ''}><span class="tr"></span>Mehrmals täglich</label></div>
    <div class="row" style="justify-content:space-between;border-top:1px solid var(--line);padding-top:10px"><button class="link-btn" data-freset>Zurücksetzen</button><button class="btn sm btn-primary" data-fclose>Fertig</button></div>
  </div>`;
  popover(anchor, html, {
    width: 400, place: 'below',
    onMount: (el, close) => {
      el.addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b) return;
        const cur = { ...flt() };
        if (b.dataset.fk) {
          const k = b.dataset.fk; let v = b.dataset.fv; if (k === 'prio') v = Number(v);
          const set = new Set(cur[k] || []); if (set.has(v)) set.delete(v); else set.add(v);
          cur[k] = [...set]; b.classList.toggle('on', set.has(v));
        } else if (b.dataset.fdue !== undefined) { cur.due = b.dataset.fdue; el.querySelectorAll('[data-fdue]').forEach(x => x.classList.toggle('on', x === b)); }
        else if (b.dataset.farea !== undefined) { cur.area = b.dataset.farea; el.querySelectorAll('[data-farea]').forEach(x => x.classList.toggle('on', x === b)); }
        else if (b.hasAttribute('data-freset')) { setFlt({}); close(); A.render(); return; }
        else if (b.hasAttribute('data-fclose')) { close(); return; }
        else return;
        setFlt(cur); A.render();
      });
      el.addEventListener('change', e => {
        const cur = { ...flt() };
        if (e.target.dataset.fsel) cur[e.target.dataset.fsel] = e.target.value || '';
        if (e.target.hasAttribute('data-frec')) cur.rec = e.target.checked;
        if (e.target.hasAttribute('data-fmulti')) cur.multi = e.target.checked;
        setFlt(cur); A.render();
      });
    },
  });
}

function viewMenu(anchor, id) {
  const v = views().find(x => x.id === id); if (!v) return;
  popover(anchor, `<div class="menu"><button data-vm="update">${icon('download', 15)}Mit aktuellem Filter überschreiben</button><button data-vm="rename">${icon('edit', 15)}Umbenennen</button><button data-vm="left">${icon('left', 15)}Nach links</button><button data-vm="right">${icon('right', 15)}Nach rechts</button><hr><button data-vm="del" class="danger">${icon('trash', 15)}Ansicht löschen</button></div>`, {
    width: 260, place: 'below',
    onMount: (el, close) => el.addEventListener('click', async e => {
      const b = e.target.closest('[data-vm]'); if (!b) return;
      close();
      const list = [...views()]; const i = list.findIndex(x => x.id === id);
      if (b.dataset.vm === 'update') { list[i] = { ...v, filter: flt(), sort: sortState(), mode: mode() }; S.setVgViews(list); toast('Ansicht aktualisiert'); }
      if (b.dataset.vm === 'rename') { const n = await promptDialog('Neuer Name', { title: 'Ansicht umbenennen', value: v.name }); if (n && n.trim()) { list[i] = { ...v, name: n.trim() }; S.setVgViews(list); } }
      if (b.dataset.vm === 'left' && i > 0) { [list[i - 1], list[i]] = [list[i], list[i - 1]]; S.setVgViews(list); }
      if (b.dataset.vm === 'right' && i < list.length - 1) { [list[i + 1], list[i]] = [list[i], list[i + 1]]; S.setVgViews(list); }
      if (b.dataset.vm === 'del' && await confirmDialog(`Ansicht „${esc(v.name)}“ löschen? Die Vorgänge selbst bleiben unverändert.`, { ok: 'Löschen', danger: true, title: 'Ansicht löschen?', cooldown: 3 })) { S.setVgViews(list.filter(x => x.id !== id)); S.local.vgActive = ''; S.saveLocal(); toast('Ansicht gelöscht'); }
      A.render();
    }),
  });
}

/* ---------------- Ziehen zwischen Quadranten / Spalten ---------------- */
function bindCardDrag(root, signal, onDrop) {
  let st = null;
  const zoneAt = (x, y) => { const el = document.elementFromPoint(x, y); return el && el.closest('[data-zone]'); };
  root.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    const el = e.target.closest('[data-drag]');
    if (!el || e.target.closest('button, input, select')) return;
    st = { id: e.pointerId, el, x0: e.clientX, y0: e.clientY, touch: e.pointerType !== 'mouse', moved: false, active: false };
    if (st.touch) st.timer = setTimeout(() => { if (st && !st.moved) { activate(e.clientX, e.clientY); vibrate(15); } }, 300);
  }, { signal });
  root.addEventListener('touchmove', e => { if (st && st.active) e.preventDefault(); }, { passive: false, signal });
  const activate = (x, y) => {
    st.active = true; A.dragging = true;
    const r = st.el.getBoundingClientRect();
    st.offX = x - r.left; st.offY = y - r.top;
    st.clone = st.el.cloneNode(true); st.clone.classList.add('dragging');
    st.clone.style.width = r.width + 'px'; st.clone.style.left = r.left + 'px'; st.clone.style.top = r.top + 'px';
    document.body.appendChild(st.clone);
    st.el.classList.add('ghost');
    st.from = st.el.closest('[data-zone]');
  };
  window.addEventListener('pointermove', e => {
    if (!st || e.pointerId !== st.id) return;
    if (!st.moved && Math.hypot(e.clientX - st.x0, e.clientY - st.y0) > 5) {
      st.moved = true;
      if (!st.touch) activate(e.clientX, e.clientY);
      else if (!st.active) { clearTimeout(st.timer); st = null; return; }
    }
    if (!st.active) return;
    e.preventDefault();
    if (e.clientY < 120) window.scrollBy(0, -14); else if (e.clientY > window.innerHeight - 70) window.scrollBy(0, 14);
    st.clone.style.left = (e.clientX - st.offX) + 'px'; st.clone.style.top = (e.clientY - st.offY) + 'px';
    const z = zoneAt(e.clientX, e.clientY);
    root.querySelectorAll('[data-zone]').forEach(x => x.classList.toggle('drop', x === z && x !== st.from));
    st.target = z;
  }, { passive: false, signal });
  const end = (e, cancel) => {
    if (!st || e.pointerId !== st.id) return;
    const s0 = st; st = null; clearTimeout(s0.timer);
    root.querySelectorAll('[data-zone]').forEach(x => x.classList.remove('drop'));
    if (!s0.active) return;
    A.dragging = false;
    if (s0.clone) s0.clone.remove();
    s0.el.classList.remove('ghost');
    const kill = ev => { ev.stopPropagation(); ev.preventDefault(); };
    window.addEventListener('click', kill, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', kill, { capture: true }), 50);
    if (cancel || !s0.target || s0.target === s0.from) { A.render(); return; }
    onDrop(s0.el.dataset.drag, s0.target.dataset.zone);
  };
  window.addEventListener('pointerup', e => end(e, false), { signal });
  window.addEventListener('pointercancel', e => end(e, true), { signal });
}

export function mount(root, ctx = {}) {
  const signal = ctx.signal;
  const qi = root.querySelector('[data-vq]');
  if (qi) qi.addEventListener('input', debounce(() => { q = qi.value; A.render(); }, 200), { signal });
  const m = mode();
  root.addEventListener('click', async e => {
    const th = e.target.closest('th[data-sort]');
    if (th) { const k = th.dataset.sort; const st = sortState(); S.local.vgSort = { k, d: st.k === k ? -st.d : (k === 'created' || k === 'no' ? -1 : 1) }; S.saveLocal(); A.render(); return; }
    const vm = e.target.closest('[data-vmode]'); if (vm) { setMode(vm.dataset.vmode); return; }
    const vt = e.target.closest('[data-vtab]'); if (vt) { if (vt._dragged) return; loadView(vt.dataset.vtab); return; }
    if (e.target.closest('[data-vnew]')) { saveView(); return; }
    if (e.target.closest('[data-vsave]')) { const id = S.local.vgActive; if (id) { const list = views().map(v => v.id === id ? { ...v, filter: flt(), sort: sortState(), mode: mode() } : v); S.setVgViews(list); toast('Ansicht aktualisiert'); A.render(); } else saveView(); return; }
    const vmn = e.target.closest('[data-vmenu]'); if (vmn) { viewMenu(vmn, vmn.dataset.vmenu); return; }
    if (e.target.closest('[data-flt]')) { filterPopover(e.target.closest('[data-flt]')); return; }
    if (e.target.closest('[data-freset]')) { setFlt({}); q = ''; S.local.vgActive = ''; S.saveLocal(); A.render(); return; }
    if (e.target.closest('[data-newt]')) { A.newTask(); return; }
    if (e.target.closest('[data-mx="stack"]')) { S.local.matrixStack = S.local.matrixStack === false; S.saveLocal(); A.render(); return; }
    const qa = e.target.closest('[data-qall]');
    if (qa) {
      const k = Number(qa.dataset.qall);
      const now = A.now(); const s = S.settings();
      const ids = [...root.querySelectorAll(`[data-quad="${k}"] .qcard[data-drag]`)].map(x => x.dataset.drag);
      if (k === 1 && ids[0]) A.startFocus(ids[0], { autostart: true });
      if (k === 2 && ids.length) { const Cal = await import('./calendar.js'); let n = 0; for (const id of ids.slice(0, 10)) { const t = S.task(id); if (!t || Cal.isPlanned(t)) continue; const st = Cal.nextFree(t.dur && t.dur < 480 ? t.dur : (s.cal.boxLen || 30)); if (!st) break; (await import('../editors.js')).createTimebox(t, st, t.dur && t.dur < 480 ? t.dur : (s.cal.boxLen || 30)); n++; } toast(n ? `${n} Vorgänge in die nächsten freien Zeiten gelegt` : 'Keine freie Zeit gefunden oder schon eingeplant'); }
      if (k === 4 && ids.length) {
        const ok = await confirmDialog(`${ids.length} Vorgänge aus „${C.QUADRANTS[4].name}“ verwerfen? Sie landen im Archiv und lassen sich dort wieder öffnen.`, { ok: 'Alle eliminieren', danger: true, title: 'Quadrant 4 aufräumen?', cooldown: 3 });
        if (ok) { const prev = ids.map(id => C.structuredCloneSafe(S.task(id))).filter(Boolean); for (const t of prev) S.put('tasks', C.setStatus(t, 'verworfen', now)); toast(`${prev.length} eliminiert`, { action: 'Rückgängig', onAction: () => prev.forEach(t => S.put('tasks', t)) }); }
      }
      return;
    }
    const un = e.target.closest('[data-unf]');
    if (un) {
      const f = { ...flt() }; const k = un.dataset.unf;
      if (Array.isArray(f[k])) f[k] = f[k].filter(x => String(x) !== un.dataset.unv); else delete f[k];
      setFlt(f); A.render();
    }
  }, { signal });
  root.addEventListener('dblclick', async e => {
    const vt = e.target.closest('[data-vtab]'); if (!vt || !vt.dataset.vtab) return;
    const v = views().find(x => x.id === vt.dataset.vtab); if (!v) return;
    const n = await promptDialog('Neuer Name', { title: 'Ansicht umbenennen', value: v.name });
    if (n && n.trim()) { S.setVgViews(views().map(x => x.id === v.id ? { ...x, name: n.trim() } : x)); A.render(); }
  }, { signal });
  root.addEventListener('change', e => {
    if (e.target.matches('[data-msort]')) { const k = e.target.value; S.local.vgSort = { k, d: k === 'created' || k === 'no' ? -1 : 1 }; S.saveLocal(); A.render(); }
  }, { signal });
  root.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.matches('tr[data-task], .li[data-task], .qcard[data-task], .kcard[data-task]')) A.openTask(e.target.dataset.task);
  }, { signal });
  const tabs = root.querySelector('[data-vtabs]');
  if (tabs && !isMobile()) makeSortable(tabs, { item: '[data-sort-id]', signal, onDrop: ids => { const by = Object.fromEntries(views().map(v => [v.id, v])); S.setVgViews(ids.map(id => by[id]).filter(Boolean)); } });

  if (m === 'matrix') {
    if (!reducedMotion()) {
      root.querySelectorAll('.qcard[data-drag]').forEach(el => {
        const prev = lastRects.get(el.dataset.drag);
        if (prev) {
          const r = el.getBoundingClientRect();
          const dx = prev.left - r.left, dy = prev.top - r.top;
          if (Math.abs(dx) > 1 || Math.abs(dy) > 1) { el.style.transition = 'none'; el.style.transform = `translate(${dx}px, ${dy}px)`; requestAnimationFrame(() => { el.style.transition = 'transform .38s cubic-bezier(.3,1.2,.5,1)'; el.style.transform = ''; }); }
        } else if (knownIds.size) el.classList.add('enter');
      });
    }
    knownIds = new Set([...root.querySelectorAll('.qcard[data-drag]')].map(x => x.dataset.drag));
    root.querySelectorAll('[data-qadd]').forEach(inp => inp.addEventListener('keydown', e => {
      if (e.key !== 'Enter' || !inp.value.trim()) return;
      const k = Number(inp.dataset.qadd);
      const p = C.parseQuick(inp.value, A.now(), S.cats());
      const f = flt();
      const area = p.area || f.area || (A.area() === 'all' ? 'p' : A.area());
      S.put('tasks', { title: p.title || inp.value.trim(), area, cat: p.cat || ((f.cat || []).length === 1 ? f.cat[0] || null : null), prio: p.prio || (k === 1 ? 2 : 3), type: 'aufgabe', status: 'neu', log: [], imp: C.QUADRANTS[k].imp, urg: C.QUADRANTS[k].urg, autoUrg: !!C.QUADRANTS[k].urg, esc: true, due: p.due, dueTime: p.dueTime, rec: p.rec, dur: p.dur, subs: [], people: [], no: S.nextTicketNo() });
      S.local._refocusQadd = k;
      toast(`In „${C.QUADRANTS[k].name}“ angelegt`);
    }, { signal }));
    if (S.local._refocusQadd) { const i = root.querySelector(`[data-qadd="${S.local._refocusQadd}"]`); if (i) i.focus(); delete S.local._refocusQadd; }
    bindCardDrag(root, signal, (id, zone) => {
      const k = Number(zone); const t = S.task(id); if (!t) return;
      const prev = { ...t }; const qd = C.QUADRANTS[k];
      S.put('tasks', C.addLog({ ...t, imp: qd.imp, urg: qd.urg, autoUrg: !!qd.urg }, `Matrix: ${qd.name}`, 'system'));
      vibrate(10);
      toast(`Verschoben nach „${qd.name}“`, { action: 'Rückgängig', onAction: () => S.put('tasks', { ...S.task(prev.id), imp: prev.imp, urg: prev.urg, autoUrg: prev.autoUrg }) });
    });
  }
  if (m === 'kanban') {
    bindCardDrag(root, signal, async (id, zone) => {
      if (zone === 'erledigt') { await A.completeTask(id); A.render(); return; }
      const t = S.task(id); if (!t) return;
      const prev = C.structuredCloneSafe(t);
      S.put('tasks', C.setStatus(t, zone, A.now()));
      vibrate(10);
      toast(`Status: ${C.STATUS[zone].name}`, { action: 'Rückgängig', onAction: () => S.put('tasks', prev) });
    });
  }
}
