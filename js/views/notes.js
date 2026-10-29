// Notizen – Gedanken festhalten und Wichtiges regelmäßig einprägen (mit Push und Deep Link)
import * as C from '../core.js';
import * as S from '../store.js';
import { esc, icon, sheet, toast, isMobile, confirmDialog, popover, closePopover, debounce } from '../ui.js';
import { A } from '../app-api.js';
import { emptyState, lifeSelect, fmtDay, fmtDateTime } from './common.js';
import { handleNewOption } from '../entities.js';
import { linkPanelHtml, bindLinkPanel } from '../links.js';
import { journalNote, ensureJournal, journalTitle, journalDays } from '../journal.js';

let q = '';
let flt = { read: false, life: '', tag: '', kind: '' };
let jDay = null;
let sortBy = 'upd';
let limit = 150;

function readDots(n, now) {
  const target = C.noteTarget(n, C.startOfDay(now));
  const done = C.noteReadsOn(n, C.ymd(now));
  if (!target) return '';
  return `<span class="read-count" title="Heute ${done} von ${target} Mal gelesen">${[...Array(Math.min(target, 12))].map((_, i) => `<i class="${i < done ? 'on' : ''}"></i>`).join('')}</span>`;
}
function snippet(n, len = 110) { const b = String(n.body || '').replace(/^#+\s*/gm, '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim(); return b.length > len ? b.slice(0, len) + ' …' : b; }
function tagsOf(n) { return (n.tags || []).filter(Boolean); }

/** Notiz einmal gelesen */
export function markRead(id) {
  const n = S.get('notes', id); if (!n) return;
  const k = C.ymd(A.now());
  const reads = { ...(n.reads || {}) };
  reads[k] = (reads[k] || 0) + 1;
  // alte Einträge kürzen (90 Tage)
  const cut = C.ymd(C.addDays(A.now(), -90));
  for (const key of Object.keys(reads)) if (key < cut) delete reads[key];
  const next = S.put('notes', { ...n, reads, lastReadAt: Date.now() });
  const target = C.noteTarget(next, C.startOfDay(A.now()));
  toast(target ? `Eingeprägt · heute ${reads[k]} von ${target}` : 'Als gelesen markiert', { ms: 2200 });
}

/** Lesemodus: groß, ruhig, mit „Gelesen“ */
export function readNote(id) {
  const n = S.get('notes', id); if (!n) { toast('Diese Notiz gibt es nicht mehr'); return; }
  const now = A.now();
  sheet({
    title: 'Einprägen', cls: 'sheet-read',
    body: `<h2 style="font-size:20px;margin-bottom:12px">${esc(n.title)}</h2><div class="note-read">${esc(n.body || '')}</div>
      <div class="row small muted" style="margin-top:18px;gap:10px">${readDots(n, now)}<span>${esc(C.describeRead(n) || 'Kein Lese-Rhythmus')}</span></div>`,
    footer: `<button class="btn btn-ghost" data-edit>${icon('edit', 14)}Bearbeiten</button><span class="sp"></span><button class="btn btn-primary lg" data-ok>${icon('check', 16)}Gelesen</button>`,
    onMount: (el, close) => el.addEventListener('click', e => {
      if (e.target.closest('[data-ok]')) { markRead(id); close(); }
      if (e.target.closest('[data-edit]')) { close(); A.nav('#/notizen/' + id); }
    }),
  });
}

/** Neue Notiz anlegen (aus Menü) */
export function editNote(preset) {
  const area = A.area() === 'all' ? 'p' : A.area();
  const n = S.put('notes', { title: '', body: '', area, tags: [], life: null, read: { on: false, mode: 'times', times: ['08:00'], every: 2, from: '08:00', to: '21:00', days: null, push: true }, reads: {}, ...(preset || {}) });
  A.nav('#/notizen/' + n.id + '?neu=1');
}

function filtered(area) {
  const qq = C.norm(q);
  let list = S.notes(n => S.inArea(n, area));
  if (flt.kind) list = list.filter(n => C.noteKind(n) === flt.kind);
  if (flt.read) list = list.filter(n => n.read && n.read.on);
  if (flt.life) list = list.filter(n => n.life === flt.life);
  if (flt.tag) list = list.filter(n => tagsOf(n).includes(flt.tag));
  if (qq) list = list.filter(n => C.norm(n.title + ' ' + (n.body || '') + ' ' + tagsOf(n).join(' ')).includes(qq));
  if (sortBy === 'title') list.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  else if (sortBy === 'created') list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  else list.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.updatedAt || 0) - (a.updatedAt || 0));
  return list;
}

function listItem(n, sel, now) {
  const open = C.noteOpenToday(n, now);
  return `<a class="note-li ${n.id === sel ? 'on' : ''}" href="#/notizen/${n.id}" data-nid="${n.id}">
    <div class="row" style="gap:6px"><span class="nk" title="${esc(C.NOTE_KINDS[C.noteKind(n)].name)}">${C.NOTE_KINDS[C.noteKind(n)].icon}</span><b class="grow ellip" data-ntitle>${esc(n.title || 'Ohne Titel')}</b>${n.pinned ? icon('pin', 12) : ''}${n.read && n.read.on ? `<span class="nbadge ${open ? 'open' : ''}" title="${esc(C.describeRead(n))}">${icon('eye', 12)}</span>` : ''}</div>
    <div class="ns" data-nsnip>${esc(snippet(n)) || '<span class="faint">Leer</span>'}</div>
    <div class="nd">${fmtDay(n.updatedAt)}${tagsOf(n).length ? ' · ' + tagsOf(n).slice(0, 3).map(t => '#' + esc(t)).join(' ') : ''}</div></a>`;
}

function readEditor(n) {
  const r = n.read || {};
  const times = r.times && r.times.length ? r.times : ['08:00'];
  const days = new Set(r.days && r.days.length ? r.days : [0, 1, 2, 3, 4, 5, 6]);
  return `<div class="read-box ${r.on ? '' : 'off'}">
    <label class="switch"><input type="checkbox" data-rf="on" ${r.on ? 'checked' : ''}><span class="tr"></span><b style="font-weight:550">Regelmäßig einprägen</b></label>
    <div class="read-opts ${r.on ? '' : 'hide'}">
      <div class="chips" style="margin:12px 0 10px">${[['times', 'Zu festen Uhrzeiten'], ['interval', 'In einem Intervall']].map(([k, l]) => `<button type="button" class="chip ${(r.mode || 'times') === k ? 'on' : ''}" data-rmode="${k}">${l}</button>`).join('')}</div>
      <div data-rm="times" class="${(r.mode || 'times') === 'times' ? '' : 'hide'}"><div class="chips" data-rtimes>${times.map((t, i) => `<span class="chip">${esc(t)}<button type="button" class="icon-btn sm x" data-rtdel="${i}" style="width:18px;height:18px" aria-label="Entfernen">${icon('x', 11)}</button></span>`).join('')}<input class="input" type="time" data-rtadd style="width:110px;height:28px" aria-label="Uhrzeit hinzufügen"><button type="button" class="btn sm" data-rtplus>Hinzufügen</button></div></div>
      <div data-rm="interval" class="${r.mode === 'interval' ? '' : 'hide'}"><div class="row wrap" style="gap:8px"><span class="small">Alle</span><select class="select" data-rf="every" style="width:auto">${[0.5, 1, 1.5, 2, 3, 4, 6].map(x => `<option value="${x}" ${Number(r.every || 2) === x ? 'selected' : ''}>${String(x).replace('.', ',')} Std</option>`).join('')}</select><span class="small">von</span><input class="input" type="time" data-rf="from" value="${esc(r.from || '08:00')}" style="width:110px"><span class="small">bis</span><input class="input" type="time" data-rf="to" value="${esc(r.to || '21:00')}" style="width:110px"></div></div>
      <div class="wd-pick" data-rdays style="margin-top:10px">${C.WD_SHORT.map((w, i) => `<button type="button" class="${days.has(i) ? 'on' : ''}" data-rdi="${i}">${w}</button>`).join('')}</div>
      <label class="switch small" style="margin-top:10px"><input type="checkbox" data-rf="push" ${r.push !== false ? 'checked' : ''}><span class="tr"></span>Push-Benachrichtigung mit Link zur Notiz</label>
      <div class="hint" style="margin-top:6px" data-rdesc>${esc(C.describeRead(n))}</div>
    </div>
  </div>`;
}

function peopleChips(n) {
  const ids = n.people || [];
  const rest = S.people(p => !ids.includes(p.id)).sort((a, b) => a.name.localeCompare(b.name));
  return `${ids.map(id => { const p = S.get('people', id); return p ? `<span class="chip">${esc(p.name)}<button type="button" class="icon-btn sm x" data-nunp="${id}" aria-label="Entfernen" style="width:18px;height:18px">${icon('x', 11)}</button></span>` : ''; }).join('')}<select class="select sm" data-nf="addperson" style="width:auto"><option value="">+ Person</option>${rest.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select>`;
}

function detail(n, now, isNew) {
  if (!n) return `<div class="note-empty">${emptyState('📝', 'Wähle eine Notiz', 'oder lege eine neue an. Aus jeder Notiz kannst du mit einem Klick einen Vorgang machen.', '<button class="btn btn-primary" data-newn>Neue Notiz</button>')}</div>`;
  const last7 = [...Array(7)].map((_, i) => C.ymd(C.addDays(now, i - 6)));
  const hasRead = n.read && n.read.on;
  const more = !!S.local.noteMore;
  const kind = C.noteKind(n);
  const tasks = C.linksOf(S.getData(), 'notes', n.id).filter(l => l.c === 'tasks');
  const life = n.life ? S.get('life', n.life) : null;
  const metaBits = [tagsOf(n).length ? `${icon('tag', 11, 'inl')} ${tagsOf(n).slice(0, 4).map(t => '#' + esc(t)).join(' ')}` : '', life ? `${esc(life.icon || '')} ${esc(life.name)}` : '', (n.people || []).length ? `${icon('person', 11, 'inl')} ${(n.people || []).map(id => S.get('people', id)).filter(Boolean).map(p => esc(p.name)).join(', ')}` : '', hasRead ? `${icon('eye', 11, 'inl')} ${esc(C.describeRead(n))}` : ''].filter(Boolean);
  return `<div class="note-detail" data-note="${n.id}">
    <div class="row note-tools">${isMobile() ? `<a class="btn sm btn-ghost" href="#/notizen">${icon('left', 14)}Alle</a>` : ''}
      <button class="btn sm btn-ghost nk-btn" data-nkind title="Notiztyp ändern">${C.NOTE_KINDS[kind].icon} ${esc(C.NOTE_KINDS[kind].name)}</button>
      <span class="small muted grow ellip">${esc(fmtDateTime(n.updatedAt || n.createdAt || Date.now()))}</span>
      ${hasRead ? `<button class="btn sm" data-readmode title="Lesemodus">${icon('eye', 14)}<span class="hide-s">Lesen</span></button>` : ''}
      <button class="btn sm" data-ntask title="Vorgang aus dieser Notiz – oder aus dem markierten Text">${icon('list', 13)}<span class="hide-s">Vorgang</span></button>
      <button class="icon-btn sm ${n.pinned ? 'on' : ''}" data-pin aria-label="Anheften" title="Anheften">${icon('pin', 15)}</button>
      <button class="icon-btn sm" data-nmore aria-label="Weitere Aktionen">${icon('more', 16)}</button></div>
    <input class="title-in note-title" id="note-title" data-nf="title" value="${esc(n.title)}" placeholder="Titel" ${isNew ? 'autofocus' : ''} aria-label="Titel">
    <textarea class="note-body" id="note-body" data-nf="body" placeholder="Schreib einfach los …" aria-label="Notiz">${esc(n.body || '')}</textarea>
    ${tasks.length ? `<div class="note-tasks">${tasks.map(l => `<button class="chip ${C.isClosed(l.rec) ? '' : 'on'}" data-lopen2="${l.id}">${icon('list', 11)}${esc(l.rec.title)}<span class="faint"> · ${esc(C.STATUS[C.statusOf(l.rec)].name)}</span></button>`).join('')}</div>` : ''}
    <button class="note-more-tg ${more ? 'on' : ''}" data-ntoggle aria-expanded="${more}">${icon('down', 13)}<span>Mehr</span>${!more && metaBits.length ? `<span class="nm-sum">${metaBits.join(' · ')}</span>` : ''}</button>
    ${more ? `<div class="note-more">
      <div class="nm-row"><span class="nm-ic" title="Schlagworte">${icon('tag', 15)}</span><input class="input sm grow" id="note-tags" data-nf="tags" value="${esc(tagsOf(n).join(', '))}" placeholder="Schlagworte, durch Komma getrennt"></div>
      <div class="nm-row"><span class="nm-ic" title="Lebensbereich">${icon('layers', 15)}</span>${lifeSelect(n.life, 'data-nf="life" style="width:auto;max-width:100%;height:1.9rem"')}<span class="nm-ic" title="Bereich" style="margin-left:8px">${icon('brief', 15)}</span><select class="select sm" data-nf="area" style="width:auto"><option value="p" ${n.area !== 'b' ? 'selected' : ''}>Privat</option><option value="b" ${n.area === 'b' ? 'selected' : ''}>Geschäftlich</option></select></div>
      <div class="nm-row wrap"><span class="nm-ic" title="Personen">${icon('person', 15)}</span><span data-npeople class="row wrap" style="gap:6px">${peopleChips(n)}</span></div>
      <div class="nm-row top"><span class="nm-ic" title="Einprägen">${icon('eye', 15)}</span><div class="grow">${readEditor(n)}
        ${hasRead ? `<div class="row small muted" style="margin-top:10px;gap:12px"><span>Letzte 7 Tage</span><span class="read-count">${last7.map(k => { const c = C.noteReadsOn(n, k); return `<i class="${c ? 'on' : ''}" title="${esc(C.fmtDateShort(C.parseYmd(k)))}: ${c}×"></i>`; }).join('')}</span><span>${n.lastReadAt ? 'zuletzt ' + esc(C.fmtRelTime(n.lastReadAt)) : ''}</span></div>` : ''}</div></div>
      <div class="nm-row top"><span class="nm-ic" title="Verknüpfungen">${icon('link', 15)}</span><div class="grow" data-nlinks>${linkPanelHtml('notes', n.id)}</div></div>
    </div>` : ''}
  </div>`;
}

function journalHtml(now) {
  const key = jDay || C.ymd(now);
  const d = C.parseYmd(key);
  const n = journalNote(key);
  const days = journalDays(120);
  const have = new Set(days.map(x => x.jday));
  const strip = [...Array(42)].map((_, i) => C.ymd(C.addDays(C.startOfDay(now), i - 41)));
  const rv = S.review('day', key);
  const prompts = ['Was beschäftigt mich gerade?', 'Wofür bin ich heute dankbar?', 'Was habe ich gelernt?', 'Was will ich morgen anders machen?'];
  return `<div class="page page-narrow">
    <div class="page-head"><div class="grow"><a class="small" href="#/notizen">${icon('left', 12)} Notizen</a><h1>📔 Journal</h1><div class="psub">Jeden Tag ein paar Zeilen – der Tagesabschluss schreibt automatisch mit hinein.</div></div>
      <div class="page-actions"><button class="btn" data-jreview>🌙 Tagesabschluss</button></div></div>
    <div class="j-strip">${strip.map(k => `<button class="${have.has(k) ? 'on' : ''} ${k === key ? 'cur' : ''}" data-jgo="${k}" title="${esc(C.fmtDateShort(C.parseYmd(k)))}"></button>`).join('')}</div>
    <div class="card j-card">
      <div class="row"><button class="icon-btn sm" data-jstep="-1" aria-label="Vorheriger Tag">${icon('left', 16)}</button><b class="grow" style="text-align:center">${esc(C.sameDay(d, now) ? 'Heute' : C.WD_LONG[C.wdIdx(d)])}, ${esc(C.fmtDateShort(d))}${rv && rv.data && rv.data.mood ? ` · ${['😞', '🙁', '😐', '🙂', '😄'][rv.data.mood - 1]}` : ''}</b><button class="icon-btn sm" data-jstep="1" aria-label="Nächster Tag" ${C.sameDay(d, now) ? 'disabled' : ''}>${icon('right', 16)}</button></div>
      <div class="chips" style="margin:10px 0">${prompts.map(p => `<button class="chip" data-jprompt="${esc(p)}">${icon('plus', 11)}${esc(p)}</button>`).join('')}</div>
      <textarea class="note-body j-body" id="journal-body" data-jkey="${key}" placeholder="Wie war dein Tag? Was geht dir durch den Kopf?">${esc(n ? n.body || '' : '')}</textarea>
      <div class="row small muted"><span class="grow" data-jstate>${n ? 'Gespeichert ' + esc(fmtDateTime(n.updatedAt || n.createdAt)) : 'Noch nichts geschrieben'}</span>${n ? `<a href="#/notizen/${n.id}">Als Notiz öffnen</a>` : ''}</div>
    </div>
    ${days.length ? `<div class="section-t">Frühere Einträge</div><div class="card pad-sm">${days.filter(x => x.jday !== key).slice(0, 30).map(x => `<button class="j-li" data-jgo="${x.jday}"><b>${esc(C.WD_SHORT[C.wdIdx(C.parseYmd(x.jday))])} ${esc(C.fmtDateShort(C.parseYmd(x.jday)))}</b><span class="ellip">${esc(snippet(x, 140)) || '<span class="faint">Leer</span>'}</span></button>`).join('')}</div>` : ''}
  </div>`;
}
export function render(route) {
  const now = A.now();
  if (route.parts[0] === 'journal') { if (route.parts[1] && /^\d{4}-\d{2}-\d{2}$/.test(route.parts[1])) jDay = route.parts[1]; return journalHtml(now); }
  jDay = null;
  const area = A.area();
  const all = S.notes(n => S.inArea(n, area));
  const sel = route.parts[0] && S.get('notes', route.parts[0]) ? route.parts[0] : null;
  const list = filtered(area);
  const due = all.filter(n => C.noteOpenToday(n, now));
  const lifeAreas = S.lifeAreas();
  const tags = [...new Set(all.flatMap(tagsOf))].sort((a, b) => a.localeCompare(b));
  const nFlt = (flt.read ? 1 : 0) + (flt.life ? 1 : 0) + (flt.tag ? 1 : 0);
  const kc = {}; for (const n of all) { const k = C.noteKind(n); kc[k] = (kc[k] || 0) + 1; }
  const kindChips = `<div class="chips note-kinds">${[['', 'Alle', ''], ...Object.values(C.NOTE_KINDS).map(k => [k.key, k.name, k.icon])].map(([k, l, ic]) => k === 'journal' ? `<a class="chip" href="#/notizen/journal">${ic} ${l}${kc.journal ? ` <span class="faint">${kc.journal}</span>` : ''}</a>` : `<button class="chip ${flt.kind === k ? 'on' : ''}" data-nkf="${k}">${ic ? ic + ' ' : ''}${l}${k && kc[k] ? ` <span class="faint">${kc[k]}</span>` : !k ? ` <span class="faint">${all.length}</span>` : ''}</button>`).join('')}</div>`;
  const mobileDetail = isMobile() && sel;
  void lifeAreas; void tags;
  return `<div class="page">
    ${mobileDetail ? '' : `<div class="page-head"><div class="grow"><h1>Notizen</h1><div class="psub">${all.length} ${all.length === 1 ? 'Notiz' : 'Notizen'} · Gedanken festhalten und Wichtiges regelmäßig einprägen.</div></div>
      <div class="page-actions"><a class="btn" href="#/notizen/journal">📔 Journal heute</a><button class="btn btn-primary" data-newn>${icon('plus', 15)}${flt.kind && flt.kind !== 'notiz' ? 'Neu: ' + esc(C.NOTE_KINDS[flt.kind].name) : 'Neue Notiz'}</button></div></div>
    ${kindChips}
    ${due.length ? `<div class="card pad-sm" style="margin-bottom:16px"><div class="row" style="margin-bottom:6px"><b class="grow">Heute einprägen</b><span class="small muted">${due.length}</span></div>
      <div class="due-notes">${due.slice(0, 6).map(n => `<button class="due-note" data-readn="${n.id}"><b class="ellip">${esc(n.title || 'Ohne Titel')}</b>${readDots(n, now)}</button>`).join('')}</div></div>` : ''}`}
    <div class="notes-wrap ${sel ? 'has-sel' : ''}">
      <div class="note-side">
        <div class="toolbar" style="margin-bottom:8px"><label class="search grow" style="min-width:0">${icon('search', 15)}<input id="note-q" data-nq value="${esc(q)}" placeholder="In allen Notizen suchen" aria-label="Notizen durchsuchen"></label><button class="icon-btn ${nFlt ? 'on' : ''}" data-nflt aria-label="Filter" title="Filter & Sortierung">${icon('filter', 17)}${nFlt ? `<span class="badge soft">${nFlt}</span>` : ''}</button></div>
        <div class="note-list" data-keep-scroll="notes">${list.slice(0, limit).map(n => listItem(n, sel, now)).join('') || `<div class="empty small" style="padding:30px 10px">${q || nFlt ? 'Keine Treffer.' : 'Noch keine Notizen.'}</div>`}
          ${list.length > limit ? `<button class="btn sm" data-more style="margin:10px auto;display:flex">Weitere ${Math.min(150, list.length - limit)} laden</button>` : ''}</div>
      </div>
      <div class="note-main card">${detail(sel ? S.get('notes', sel) : null, now, route.params && route.params.neu)}</div>
    </div>
  </div>`;
}

function filterPopover(anchor, area) {
  const all = S.notes(n => S.inArea(n, area));
  const tags = [...new Set(all.flatMap(tagsOf))].sort((a, b) => a.localeCompare(b));
  const lifeAreas = S.lifeAreas();
  const html = `<div class="flt-pop">
    <div class="flt-sec"><div class="lbl">Anzeigen</div><div class="chips"><button class="chip ${!flt.read ? 'on' : ''}" data-fr="0">Alle</button><button class="chip ${flt.read ? 'on' : ''}" data-fr="1">Nur zum Einprägen</button></div></div>
    <div class="flt-sec"><div class="lbl">Sortierung</div><div class="chips">${[['upd', 'Zuletzt geändert'], ['created', 'Neueste'], ['title', 'Titel A–Z']].map(([k, l]) => `<button class="chip ${sortBy === k ? 'on' : ''}" data-fs="${k}">${l}</button>`).join('')}</div></div>
    ${lifeAreas.length ? `<div class="flt-sec"><div class="lbl">Lebensbereich</div><div class="chips"><button class="chip ${!flt.life ? 'on' : ''}" data-fl="">Alle</button>${lifeAreas.map(l => `<button class="chip ${flt.life === l.id ? 'on' : ''}" data-fl="${l.id}">${esc(l.name)}</button>`).join('')}</div></div>` : ''}
    ${tags.length ? `<div class="flt-sec"><div class="lbl">Schlagwort</div><div class="chips"><button class="chip ${!flt.tag ? 'on' : ''}" data-ftag="">Alle</button>${tags.slice(0, 40).map(t => `<button class="chip ${flt.tag === t ? 'on' : ''}" data-ftag="${esc(t)}">#${esc(t)}</button>`).join('')}</div></div>` : ''}
    <div class="row" style="justify-content:flex-end"><button class="link-btn" data-freset>Zurücksetzen</button></div></div>`;
  popover(anchor, html, {
    width: 320, place: 'below',
    onMount: (el, close) => el.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.fr !== undefined) flt.read = b.dataset.fr === '1';
      else if (b.dataset.fs) sortBy = b.dataset.fs;
      else if (b.dataset.fl !== undefined) flt.life = b.dataset.fl;
      else if (b.dataset.ftag !== undefined) flt.tag = b.dataset.ftag;
      else if (b.hasAttribute('data-freset')) { flt = { read: false, life: '', tag: '' }; sortBy = 'upd'; }
      else return;
      close(); limit = 150; A.render();
    }),
  });
}

function moreMenu(anchor, n) {
  popover(anchor, `<div class="menu"><button data-m="task">${icon('list', 15)}Vorgang daraus machen</button><button data-m="link">${icon('link', 15)}Verknüpfen …</button><button data-m="copy">${icon('copy', 15)}Text kopieren</button><hr><button data-m="del">${icon('trash', 15)}Löschen</button></div>`, {
    width: 220, place: 'below',
    onMount: (el, close) => el.addEventListener('click', async e => {
      const b = e.target.closest('[data-m]'); if (!b) return;
      close();
      if (b.dataset.m === 'task') noteToTask(n, '');
      if (b.dataset.m === 'link') A.openLinkPicker(anchor, { col: 'notes', id: n.id, onPick: () => A.render() });
      if (b.dataset.m === 'copy') { try { await navigator.clipboard.writeText(`${n.title}\n\n${n.body || ''}`); toast('Kopiert'); } catch { toast('Kopieren nicht möglich'); } }
      if (b.dataset.m === 'del') {
        if (await confirmDialog(`„${esc(n.title || 'Ohne Titel')}“ löschen? Im Papierkorb kannst du sie wiederherstellen.`, { ok: 'Löschen', danger: true, title: 'Notiz löschen?', cooldown: 3 })) {
          const prev = S.remove('notes', n.id);
          toast('Notiz gelöscht', { action: 'Rückgängig', onAction: () => S.restore('notes', prev) });
          A.nav('#/notizen');
        }
      }
    }),
  });
}

export function mount(root, ctx, route) {
  const area = A.area();
  const box = root.querySelector('[data-note]');
  const id = box && box.dataset.note;
  const qi = root.querySelector('[data-nq]');
  if (qi) qi.addEventListener('input', debounce(() => { q = qi.value; limit = 150; A.render(); }, 220));

  if (route.parts[0] === 'journal') { mountJournal(root, ctx); return; }
  if (id) bindLinkPanel(root, 'notes', id, () => { const box2 = root.querySelector('[data-nlinks]'); if (box2) box2.innerHTML = linkPanelHtml('notes', id); }, ctx.signal);
  root.addEventListener('click', async e => {
    const b = e.target.closest('button');
    if (e.target.closest('[data-newn]')) { editNote(flt.kind ? { kind: flt.kind } : undefined); return; }
    const nk = e.target.closest('[data-nkf]');
    if (nk) { flt.kind = nk.dataset.nkf; limit = 150; A.render(); return; }
    const lo = e.target.closest('[data-lopen2]');
    if (lo) { A.openTask(lo.dataset.lopen2); return; }
    const rn = e.target.closest('[data-readn]');
    if (rn) { readNote(rn.dataset.readn); return; }
    if (!b) return;
    if (b.hasAttribute('data-nflt')) { filterPopover(b, area); return; }
    if (b.hasAttribute('data-more')) { limit += 150; A.render(); return; }
    if (!id) return;
    const n = S.get('notes', id); if (!n) return;
    if (b.hasAttribute('data-readmode')) { readNote(id); return; }
    if (b.hasAttribute('data-pin')) { S.put('notes', { ...n, pinned: !n.pinned }); return; }
    if (b.hasAttribute('data-nmore')) { moreMenu(b, n); return; }
    if (b.hasAttribute('data-ntoggle')) { S.local.noteMore = !S.local.noteMore; S.saveLocal(); A.render(); return; }
    if (b.hasAttribute('data-ntask')) { const bo = root.querySelector('[data-nf="body"]'); const sel = bo && bo.selectionEnd > bo.selectionStart ? bo.value.slice(bo.selectionStart, bo.selectionEnd).trim() : ''; noteToTask(S.get('notes', id), sel); return; }
    if (b.hasAttribute('data-nkind')) { kindPopover(b, n); return; }
    if (b.dataset.nunp) { S.put('notes', { ...n, people: (n.people || []).filter(x => x !== b.dataset.nunp) }, { noRender: true }); const pb = root.querySelector('[data-npeople]'); if (pb) pb.innerHTML = peopleChips(S.get('notes', id)); return; }
    // Lese-Rhythmus
    const r = { on: false, mode: 'times', times: ['08:00'], every: 2, from: '08:00', to: '21:00', days: null, push: true, ...(n.read || {}) };
    if (b.dataset.rmode) { r.mode = b.dataset.rmode; saveRead(n, r); return; }
    if (b.dataset.rtdel !== undefined) { r.times = r.times.filter((_, i) => i !== Number(b.dataset.rtdel)); if (!r.times.length) r.times = ['08:00']; saveRead(n, r); return; }
    if (b.hasAttribute('data-rtplus')) { const v = root.querySelector('[data-rtadd]').value; if (!v) { root.querySelector('[data-rtadd]').focus(); return; } r.times = [...new Set([...(r.times || []), v])].sort(); saveRead(n, r); return; }
    if (b.dataset.rdi !== undefined) { const set = new Set(r.days && r.days.length ? r.days : [0, 1, 2, 3, 4, 5, 6]); const i = Number(b.dataset.rdi); if (set.has(i)) set.delete(i); else set.add(i); if (!set.size) return; r.days = set.size === 7 ? null : [...set].sort(); saveRead(n, r); return; }
  });
  root.addEventListener('change', async e => {
    if (!id) return;
    const n = S.get('notes', id); if (!n) return;
    const t = e.target;
    if (t.dataset.rf) {
      const r = { on: false, mode: 'times', times: ['08:00'], every: 2, from: '08:00', to: '21:00', days: null, push: true, ...(n.read || {}) };
      if (t.dataset.rf === 'on' || t.dataset.rf === 'push') r[t.dataset.rf] = t.checked;
      else if (t.dataset.rf === 'every') r.every = Number(t.value);
      else r[t.dataset.rf] = t.value;
      saveRead(n, r);
      if (t.dataset.rf === 'on' && t.checked) toast('Du wirst erinnert, die Notiz zu lesen');
      return;
    }
    if (t.dataset.nf === 'life') { if (t.value === '__new') { await handleNewOption(t, 'life'); return; } S.put('notes', { ...S.get('notes', id), life: t.value && t.value !== '__new' ? t.value : null }, { noRender: true }); return; }
    if (t.dataset.nf === 'area') { S.put('notes', { ...n, area: t.value }); return; }
    if (t.dataset.nf === 'addperson') { if (t.value) { S.put('notes', { ...n, people: [...new Set([...(n.people || []), t.value])] }, { noRender: true }); const pb = root.querySelector('[data-npeople]'); if (pb) pb.innerHTML = peopleChips(S.get('notes', id)); } return; }
    if (t.dataset.nf === 'tags') { S.put('notes', { ...n, tags: t.value.split(/[,;]+/).map(x => x.trim().replace(/^#/, '')).filter(Boolean) }); }
  });
  // Text automatisch speichern, ohne die Ansicht neu aufzubauen
  if (id) {
    const ti = root.querySelector('[data-nf="title"]'), bo = root.querySelector('[data-nf="body"]');
    const li = root.querySelector(`[data-nid="${id}"]`);
    const grow = () => { bo.style.height = 'auto'; bo.style.height = Math.max(220, bo.scrollHeight + 4) + 'px'; };
    grow();
    const save = debounce(() => {
      const n = S.get('notes', id); if (!n) return;
      if (n.title === ti.value && (n.body || '') === bo.value) return;
      S.put('notes', { ...n, title: ti.value, body: bo.value }, { noRender: true });
      if (li) { li.querySelector('[data-ntitle]').textContent = ti.value || 'Ohne Titel'; li.querySelector('[data-nsnip]').textContent = snippet({ body: bo.value }); }
    }, 500);
    ti.addEventListener('input', save);
    bo.addEventListener('input', () => { grow(); save(); });
    ti.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); bo.focus(); } });
    ctx.signal.addEventListener('abort', () => {
      // beim Verlassen sofort sichern; leere neue Notizen verwerfen
      const n = S.get('notes', id); if (!n) return;
      const stillHere = (location.hash || '').startsWith('#/notizen/' + id);
      if (!stillHere && !ti.value.trim() && !bo.value.trim() && !(n.read && n.read.on)) { S.purge('notes', id); return; }
      if (n.title !== ti.value || (n.body || '') !== bo.value) S.put('notes', { ...n, title: ti.value, body: bo.value }, { noRender: true });
    });
  }
  if (route.params && route.params.lesen && id) { history.replaceState(null, '', '#/notizen/' + id); setTimeout(() => readNote(id), 80); }
  if (route.params && route.params.neu && id) history.replaceState(null, '', '#/notizen/' + id);
  void closePopover; void fmtDay;
}

function saveRead(n, r) {
  S.put('notes', { ...S.get('notes', n.id), read: r });
}

/** Notiz (oder markierte Textstelle) → Vorgang, beidseitig verknüpft */
export function noteToTask(n, sel) {
  if (!n) return;
  const quote = (sel || '').trim();
  const firstLine = quote ? quote.split('\n')[0].slice(0, 120) : (n.title || snippet(n, 80));
  A.newTask({ title: firstLine, notes: quote ? quote : (n.body || '').slice(0, 2000), area: n.area || 'p', fromNote: n.id, fromQuote: quote || '', people: n.people || [], links: n.life ? [{ c: 'life', id: n.life }] : [] });
}

function kindPopover(anchor, n) {
  const cur = C.noteKind(n);
  popover(anchor, `<div class="menu">${Object.values(C.NOTE_KINDS).map(k => `<button data-k="${k.key}" class="${k.key === cur ? 'on' : ''}">${k.icon} ${esc(k.name)}<span class="sp"></span>${k.key === cur ? icon('check', 13) : ''}</button>`).join('')}<div class="tiny muted" style="padding:6px 10px 2px">Wissen und Journal brauchen keinen nächsten Schritt.</div></div>`, {
    width: 240, place: 'below',
    onMount: (el, close) => el.addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (!b) return; close(); const x = S.get('notes', n.id); const patch = { kind: b.dataset.k }; if (b.dataset.k === 'journal' && !x.jday) patch.jday = C.ymd(new Date(x.createdAt || Date.now())); S.put('notes', { ...x, ...patch }); }),
  });
}

function mountJournal(root, ctx) {
  const ta = root.querySelector('[data-jkey]');
  const key = ta.dataset.jkey;
  const state = root.querySelector('[data-jstate]');
  const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.max(260, ta.scrollHeight + 4) + 'px'; };
  grow();
  const save = debounce(() => {
    const ex = journalNote(key);
    if (!ex && !ta.value.trim()) return;
    const n = ex || ensureJournal(key);
    if ((n.body || '') === ta.value) return;
    S.put('notes', { ...S.get('notes', n.id), body: ta.value, title: n.title || journalTitle(key) }, { noRender: true });
    if (state) state.textContent = 'Gespeichert ' + C.hm(new Date());
  }, 500);
  ta.addEventListener('input', () => { grow(); save(); }, { signal: ctx.signal });
  ctx.signal.addEventListener('abort', () => { const ex = journalNote(key); if (ex ? (ex.body || '') !== ta.value : ta.value.trim()) { const n = ex || ensureJournal(key); S.put('notes', { ...S.get('notes', n.id), body: ta.value }, { noRender: true }); } });
  root.addEventListener('click', e => {
    const g = e.target.closest('[data-jgo]'); if (g) { A.nav('#/notizen/journal/' + g.dataset.jgo); return; }
    const st = e.target.closest('[data-jstep]'); if (st) { const d = C.addDays(C.parseYmd(key), Number(st.dataset.jstep)); if (d > A.now()) return; A.nav('#/notizen/journal/' + C.ymd(d)); return; }
    const p = e.target.closest('[data-jprompt]'); if (p) { const add = (ta.value.trim() ? '\n\n' : '') + `**${p.dataset.jprompt}**\n`; ta.value = ta.value.replace(/\s*$/, '') + add; ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); grow(); save(); return; }
    if (e.target.closest('[data-jreview]')) A.startReview('day', C.parseYmd(key));
  }, { signal: ctx.signal });
  if (!ta.value) setTimeout(() => ta.focus(), 60);
}
