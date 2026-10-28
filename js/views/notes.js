// Notizen – Gedanken festhalten und Wichtiges regelmäßig einprägen (mit Push und Deep Link)
import * as C from '../core.js';
import * as S from '../store.js';
import { esc, icon, sheet, toast, isMobile, confirmDialog, popover, closePopover, debounce } from '../ui.js';
import { A } from '../app-api.js';
import { emptyState, lifeSelect, fmtDay, fmtDateTime } from './common.js';
import { handleNewOption } from '../entities.js';

let q = '';
let flt = { read: false, life: '', tag: '' };
let sortBy = 'upd';
let limit = 150;

function readDots(n, now) {
  const target = C.noteTarget(n, C.startOfDay(now));
  const done = C.noteReadsOn(n, C.ymd(now));
  if (!target) return '';
  return `<span class="read-count" title="Heute ${done} von ${target} Mal gelesen">${[...Array(Math.min(target, 12))].map((_, i) => `<i class="${i < done ? 'on' : ''}"></i>`).join('')}</span>`;
}
function snippet(n, len = 110) { const b = String(n.body || '').replace(/\s+/g, ' ').trim(); return b.length > len ? b.slice(0, len) + ' …' : b; }
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
    <div class="row" style="gap:6px"><b class="grow ellip" data-ntitle>${esc(n.title || 'Ohne Titel')}</b>${n.pinned ? icon('pin', 12) : ''}${n.read && n.read.on ? `<span class="nbadge ${open ? 'open' : ''}" title="${esc(C.describeRead(n))}">${icon('eye', 12)}</span>` : ''}</div>
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

function detail(n, now, isNew) {
  if (!n) return `<div class="note-empty">${emptyState('📝', 'Wähle eine Notiz', 'oder lege eine neue an. Notizen mit Lese-Rhythmus erinnern dich, sie dir einzuprägen.', '<button class="btn btn-primary" data-newn>Neue Notiz</button>')}</div>`;
  const last7 = [...Array(7)].map((_, i) => C.ymd(C.addDays(now, i - 6)));
  const hasRead = n.read && n.read.on;
  return `<div class="note-detail" data-note="${n.id}">
    <div class="row note-tools">${isMobile() ? `<a class="btn sm btn-ghost" href="#/notizen">${icon('left', 14)}Alle</a>` : ''}<span class="small muted grow">Geändert ${esc(fmtDateTime(n.updatedAt || n.createdAt || Date.now()))}</span>
      ${hasRead ? `<button class="btn sm" data-readmode>${icon('eye', 14)}Lesen</button>` : ''}
      <button class="icon-btn sm ${n.pinned ? 'on' : ''}" data-pin aria-label="Anheften" title="Anheften">${icon('pin', 15)}</button>
      <button class="icon-btn sm" data-nmore aria-label="Mehr">${icon('more', 16)}</button></div>
    <input class="title-in" id="note-title" data-nf="title" value="${esc(n.title)}" placeholder="Titel" ${isNew ? 'autofocus' : ''} aria-label="Titel" style="font-size:20px">
    <textarea class="note-body" id="note-body" data-nf="body" placeholder="Schreib einfach los …" aria-label="Notiz">${esc(n.body || '')}</textarea>
    <div class="props" style="margin-top:8px">
      <div class="k">${icon('tag', 14)}Schlagworte</div><div class="v"><input class="input" id="note-tags" data-nf="tags" value="${esc(tagsOf(n).join(', '))}" placeholder="z. B. Partnerschaft, Reflexion"></div>
      <div class="k">${icon('layers', 14)}Lebensbereich</div><div class="v">${lifeSelect(n.life, 'data-nf="life" style="width:auto;max-width:100%"')}</div>
      <div class="k">Bereich</div><div class="v"><select class="select" data-nf="area" style="width:auto"><option value="p" ${n.area !== 'b' ? 'selected' : ''}>Privat</option><option value="b" ${n.area === 'b' ? 'selected' : ''}>Geschäftlich</option></select></div>
    </div>
    <div class="section-t">Einprägen</div>
    ${readEditor(n)}
    ${hasRead ? `<div class="row small muted" style="margin-top:12px;gap:12px"><span>Letzte 7 Tage</span><span class="read-count">${last7.map(k => { const c = C.noteReadsOn(n, k); return `<i class="${c ? 'on' : ''}" title="${esc(C.fmtDateShort(C.parseYmd(k)))}: ${c}×"></i>`; }).join('')}</span><span>${n.lastReadAt ? 'zuletzt ' + esc(C.fmtRelTime(n.lastReadAt)) : ''}</span></div>` : ''}
  </div>`;
}

export function render(route) {
  const now = A.now();
  const area = A.area();
  const all = S.notes(n => S.inArea(n, area));
  const sel = route.parts[0] && S.get('notes', route.parts[0]) ? route.parts[0] : null;
  const list = filtered(area);
  const due = all.filter(n => C.noteOpenToday(n, now));
  const lifeAreas = S.lifeAreas();
  const tags = [...new Set(all.flatMap(tagsOf))].sort((a, b) => a.localeCompare(b));
  const nFlt = (flt.read ? 1 : 0) + (flt.life ? 1 : 0) + (flt.tag ? 1 : 0);
  const mobileDetail = isMobile() && sel;
  void lifeAreas; void tags;
  return `<div class="page">
    ${mobileDetail ? '' : `<div class="page-head"><div class="grow"><h1>Notizen</h1><div class="psub">${all.length} ${all.length === 1 ? 'Notiz' : 'Notizen'} · Gedanken festhalten und Wichtiges regelmäßig einprägen.</div></div>
      <div class="page-actions"><button class="btn btn-primary" data-newn>${icon('plus', 15)}Neue Notiz</button></div></div>
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
  popover(anchor, `<div class="menu"><button data-m="task">${icon('list', 15)}Als Vorgang anlegen</button><button data-m="copy">${icon('copy', 15)}Text kopieren</button><hr><button data-m="del">${icon('trash', 15)}Löschen</button></div>`, {
    width: 220, place: 'below',
    onMount: (el, close) => el.addEventListener('click', async e => {
      const b = e.target.closest('[data-m]'); if (!b) return;
      close();
      if (b.dataset.m === 'task') A.newTask({ title: n.title || snippet(n, 60), notes: n.body || '', area: n.area || 'p' });
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

  root.addEventListener('click', async e => {
    const b = e.target.closest('button');
    if (e.target.closest('[data-newn]')) { editNote(); return; }
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
