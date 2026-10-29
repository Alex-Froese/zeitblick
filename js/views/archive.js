// Archiv – abgeschlossene Vorgänge nach Bereich und Kategorie, mit Datum. Dazu der Papierkorb.
import * as C from '../core.js';
import * as S from '../store.js';
import { esc, icon, toast, confirmDialog, debounce, popover } from '../ui.js';
import { A } from '../app-api.js';
import { emptyState, fmtDay, catColor, areaName } from './common.js';

let q = '';
let range = 'all';
let stFilter = '';
const RANGES = [['all', 'Alles'], ['7', '7 Tage'], ['30', '30 Tage'], ['90', '3 Monate'], ['year', 'Dieses Jahr']];
const TRASH_COLS = [['tasks', 'Vorgang', x => x.title], ['notes', 'Notiz', x => x.title || 'Ohne Titel'], ['events', 'Termin', x => x.title], ['habits', 'Gewohnheit', x => x.title], ['goals', 'Ziel', x => x.title], ['projects', 'Projekt', x => x.title], ['people', 'Person', x => x.name], ['inbox', 'Inbox', x => x.text]];

function closedList(area, now) {
  const qq = C.norm(q);
  let cut = 0;
  if (range === 'year') cut = new Date(now.getFullYear(), 0, 1).getTime();
  else if (range !== 'all') cut = now.getTime() - Number(range) * C.DAY;
  return S.tasks(t => C.isClosed(t) && S.inArea(t, area))
    .filter(t => (t.doneAt || t.updatedAt || 0) >= cut)
    .filter(t => !stFilter || C.statusOf(t) === stFilter)
    .filter(t => !qq || C.norm(`${t.title} ${t.notes || ''} #${t.no || ''}`).includes(qq))
    .sort((a, b) => (b.doneAt || b.updatedAt || 0) - (a.doneAt || a.updatedAt || 0));
}

function rowHtml(t) {
  const st = C.statusOf(t);
  const days = t.createdAt && t.doneAt ? Math.max(0, Math.round((t.doneAt - t.createdAt) / C.DAY)) : null;
  return `<tr data-task="${t.id}"><td class="t-no">#${String(t.no || 0).padStart(4, '0')}</td>
    <td class="t-title"><div class="tt" style="${st === 'verworfen' ? 'text-decoration:line-through;color:var(--muted)' : ''}">${esc(t.title)}</div>${C.typeOf(t) !== 'aufgabe' ? `<div class="ts">${C.TYPES[C.typeOf(t)].name}</div>` : ''}</td>
    <td class="t-date">${fmtDay(t.createdAt)}</td><td class="t-date">${fmtDay(t.doneAt)}</td>
    <td class="small muted">${days === null ? '–' : days === 0 ? 'am selben Tag' : days + ' T.'}</td>
    <td class="small muted">${t.focusMin ? esc(C.fmtDurShort(t.focusMin)) : '–'}</td>
    <td><span class="pill st-${st}"><span class="dot"></span>${C.STATUS[st].name}</span></td>
    <td class="t-act"><button class="btn sm btn-ghost" data-reopen="${t.id}">Öffnen</button></td></tr>`;
}

function archiveHtml(area, now) {
  const list = closedList(area, now);
  if (!list.length) return `<div class="card">${emptyState('🗄️', q || range !== 'all' || stFilter ? 'Nichts gefunden' : 'Das Archiv ist noch leer', 'Erledigte und verworfene Vorgänge landen automatisch hier – sortiert nach Bereich und Kategorie.')}</div>`;
  const areas = area === 'all' ? ['p', 'b'] : [area];
  let html = '';
  for (const a of areas) {
    const inA = list.filter(t => (t.area || 'p') === a);
    if (!inA.length) continue;
    const groups = new Map();
    for (const t of inA) { const k = t.cat && S.cat(t.cat) ? t.cat : ''; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(t); }
    const order = [...groups.keys()].sort((x, y) => (x ? S.cat(x).name : '￿').localeCompare(y ? S.cat(y).name : '￿'));
    html += `<div class="section-t">${areaName(a)} · ${inA.length}</div><div class="card flush" style="margin-bottom:16px"><div class="table-wrap"><table class="tbl"><thead><tr><th class="t-no">Nr.</th><th>Titel</th><th>Erstellt</th><th>Geschlossen</th><th>Dauer</th><th>Fokus</th><th>Status</th><th class="t-act"></th></tr></thead>`;
    for (const k of order) {
      const c = k ? S.cat(k) : null;
      html += `<tbody><tr class="grp"><td colspan="8">${c ? `<i class="catdot" style="background:${catColor(c)};margin-right:7px"></i>${esc(c.name)}` : 'Ohne Kategorie'} <span class="faint">· ${groups.get(k).length}</span></td></tr>${groups.get(k).map(rowHtml).join('')}</tbody>`;
    }
    html += '</table></div></div>';
  }
  return html;
}

function trashHtml() {
  const rows = [];
  for (const [col, label, name] of TRASH_COLS) for (const x of S.trash(col)) rows.push({ col, label, name: name(x) || '–', x });
  rows.sort((a, b) => b.x.deletedAt - a.x.deletedAt);
  if (!rows.length) return `<div class="card">${emptyState('🗑️', 'Der Papierkorb ist leer', 'Gelöschte Inhalte bleiben hier 120 Tage, bevor sie endgültig verschwinden.')}</div>`;
  return `<p class="hint" style="margin:0 2px 10px">Gelöschte Inhalte bleiben 120 Tage wiederherstellbar.</p>
    <div class="card flush"><div class="table-wrap"><table class="tbl"><thead><tr><th>Art</th><th>Titel</th><th>Gelöscht</th><th class="t-act" style="width:220px"></th></tr></thead><tbody>
    ${rows.map(r => `<tr style="cursor:default"><td class="small muted">${r.label}</td><td class="t-title"><div class="tt">${esc(r.name)}</div></td><td class="t-date">${fmtDay(r.x.deletedAt)} · ${esc(C.fmtRelTime(r.x.deletedAt))}</td>
      <td class="t-act" style="width:220px"><span class="row" style="justify-content:flex-end;gap:4px"><button class="btn sm" data-restore="${r.col}:${r.x.id}">${icon('undo', 13)}Wiederherstellen</button><button class="icon-btn sm" data-purge="${r.col}:${r.x.id}" aria-label="Endgültig löschen" title="Endgültig löschen">${icon('trash', 14)}</button></span></td></tr>`).join('')}
    </tbody></table></div></div>`;
}

export function render(route) {
  const now = A.now();
  const area = A.area();
  const tab = route.parts[0] === 'papierkorb' ? 'trash' : 'arch';
  const nClosed = S.tasks(t => C.isClosed(t) && S.inArea(t, area)).length;
  const nTrash = TRASH_COLS.reduce((a, [c]) => a + S.trash(c).length, 0);
  return `<div class="page">
    <div class="page-head"><div class="grow"><h1>Archiv</h1><div class="psub">Abgeschlossene Vorgänge – sauber nach Privat und Geschäftlich, Kategorie und Datum.</div></div></div>
    <div class="tabs"><a href="#/archiv" class="${tab === 'arch' ? 'on' : ''}">Abgeschlossen <span class="faint">${nClosed}</span></a><a href="#/archiv/papierkorb" class="${tab === 'trash' ? 'on' : ''}">Papierkorb <span class="faint">${nTrash}</span></a></div>
    ${tab === 'arch' ? `<div class="toolbar">
      <label class="search grow" style="max-width:380px">${icon('search', 15)}<input id="ar-q" data-aq value="${esc(q)}" placeholder="Im Archiv suchen" aria-label="Archiv durchsuchen"></label>
      <button class="btn ${range !== 'all' || stFilter ? 'on-f' : ''}" data-aflt>${icon('filter', 15)}${esc(RANGES.find(r => r[0] === range)[1])}${stFilter ? ' · ' + C.STATUS[stFilter].name : ''}</button>
    </div>${archiveHtml(area, now)}` : trashHtml()}
  </div>`;
}

function filterPop(anchor) {
  const html = `<div class="flt-pop"><div class="flt-sec"><div class="lbl">Geschlossen</div><div class="chips">${RANGES.map(([k, l]) => `<button class="chip ${range === k ? 'on' : ''}" data-ar="${k}">${l}</button>`).join('')}</div></div>
    <div class="flt-sec"><div class="lbl">Status</div><div class="chips">${[['', 'Alle'], ['erledigt', 'Erledigt'], ['verworfen', 'Verworfen']].map(([k, l]) => `<button class="chip ${stFilter === k ? 'on' : ''}" data-as="${k}">${l}</button>`).join('')}</div></div></div>`;
  popover(anchor, html, { width: 320, place: 'below', onMount: (el, close) => el.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.ar) range = b.dataset.ar; if (b.dataset.as !== undefined) stFilter = b.dataset.as; close(); A.render(); }) });
}

export function mount(root) {
  const qi = root.querySelector('[data-aq]');
  if (qi) qi.addEventListener('input', debounce(() => { q = qi.value; A.render(); }, 200));
  root.addEventListener('click', async e => {
    const f = e.target.closest('[data-aflt]');
    if (f) { filterPop(f); return; }
    const ro = e.target.closest('[data-reopen]');
    if (ro) { e.stopPropagation(); A.openTask(ro.dataset.reopen); return; }
    const rs = e.target.closest('[data-restore]');
    if (rs) {
      const [col, id] = rs.dataset.restore.split(':');
      const x = S.getData()[col][id]; if (!x) return;
      S.restore(col, x);
      toast('Wiederhergestellt');
      return;
    }
    const pg = e.target.closest('[data-purge]');
    if (pg) {
      const [col, id] = pg.dataset.purge.split(':');
      if (await confirmDialog('Das kann nicht rückgängig gemacht werden.', { ok: 'Endgültig löschen', danger: true, title: 'Endgültig löschen?', cooldown: 3 })) { S.purge(col, id); toast('Endgültig gelöscht'); }
    }
  });
}
