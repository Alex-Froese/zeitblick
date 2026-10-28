// Vorgänge – der Index aller offenen Tickets: sortierbar, wenig Infos, Filter hinter einem Symbol
import * as C from '../core.js';
import * as S from '../store.js';
import { esc, icon, popover, debounce, isMobile } from '../ui.js';
import { A } from '../app-api.js';
import { ampDot, ampLevel, statusPill, prioLabel, catTag, dueInfo, fmtDay, fmtDueShort, areaShort, emptyState, catColor, sortTasks } from './common.js';

let q = '';
const OPEN = C.OPEN_STATUS || ['neu', 'geplant', 'aktiv', 'wartet'];
const DUE = [['', 'Alle'], ['over', 'Überfällig'], ['today', 'Bis heute'], ['week', 'Diese Woche'], ['later', 'Später'], ['none', 'Ohne Frist']];
const AMPS = [['alarm', 'Alarm'], ['red', 'Rot'], ['yellow', 'Gelb'], ['green', 'Grün'], ['none', 'Ohne Frist']];
const COLS = [['amp', '', 't-amp'], ['no', 'Nr.', 't-no'], ['title', 'Titel', ''], ['cat', 'Kategorie', ''], ['area', 'Bereich', ''], ['created', 'Erstellt', ''], ['due', 'Fällig', ''], ['prio', 'Prio', ''], ['status', 'Status', '']];

function flt() { return S.local.vgFilter || {}; }
function setFlt(f) { S.local.vgFilter = f; S.saveLocal(); }
function sortState() { return S.local.vgSort || { k: 'due', d: 1 }; }
function nFilters(f = flt()) { return ['status', 'type', 'prio', 'amp', 'cat'].reduce((a, k) => a + ((f[k] || []).length ? 1 : 0), 0) + (f.due ? 1 : 0) + (f.project ? 1 : 0) + (f.person ? 1 : 0) + (f.life ? 1 : 0) + (f.rec ? 1 : 0); }

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
    if (f.project && t.project !== f.project) return false;
    if (f.person && !(t.people || []).includes(f.person)) return false;
    if (f.life && C.lifeOfTask(t, S.getData()) !== f.life) return false;
    if (f.rec && !(t.rec && t.rec.f)) return false;
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
  if (k === 'due') sortTasks(list, now); // Grundordnung (Ampel, Frist, Priorität)
  return list.sort((a, b) => { const va = val(a), vb = val(b); return (va < vb ? -1 : va > vb ? 1 : 0) * d || (a.prio || 3) - (b.prio || 3) || (a.no || 0) - (b.no || 0); });
}

function shortInfo(t) {
  const bits = [];
  const ty = C.typeOf(t);
  if (ty !== 'aufgabe') bits.push(C.TYPES[ty].name);
  const p = t.project && S.get('projects', t.project); if (p) bits.push(`${icon('folder', 11, 'inl')} ${esc(p.title)}`);
  const ppl = (t.people || []).map(id => S.get('people', id)).filter(Boolean); if (ppl.length) bits.push(`${icon('person', 11, 'inl')} ${ppl.map(x => esc(x.name)).join(', ')}`);
  if ((t.subs || []).length) bits.push(`${t.subs.filter(x => x.d).length}/${t.subs.length} Schritte`);
  if (t.rec && t.rec.f) bits.push(`${icon('repeat', 11, 'inl')} ${esc(C.describeRule(t.rec, t.due))}`);
  if (t.delegate) bits.push(`wartet auf ${esc(t.delegate)}`);
  if (!bits.length && t.notes) bits.push(esc(String(t.notes).replace(/\s+/g, ' ').slice(0, 80)));
  return bits.join(' · ');
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
    <td class="t-act"><button class="icon-btn sm" data-act="focus" data-id="${t.id}" aria-label="Fokus starten" title="Fokus starten">${icon('play', 13)}</button><button class="icon-btn sm" data-act="done" data-id="${t.id}" aria-label="Erledigen" title="Erledigen">${icon('check', 15)}</button></td>
  </tr>`;
}

function cardHtml(t, now) {
  const d = dueInfo(t, now); const c = S.cat(t.cat);
  return `<div class="li" data-task="${t.id}" tabindex="0">${ampDot(ampLevel(t, now))}<div class="grow"><div class="lt">${esc(t.title)}</div>
    <div class="lm"><span class="faint">#${String(t.no || 0).padStart(4, '0')}</span>${statusPill(t, { select: true })}${d ? `<span class="${d.cls}">${esc(d.txt)}</span>` : ''}${c ? `<span class="tag"><i class="catdot" style="background:${catColor(c)}"></i>${esc(c.name)}</span>` : ''}${(t.prio || 3) <= 2 ? prioLabel(t.prio) : ''}</div></div>
    <button class="icon-btn sm" data-act="done" data-id="${t.id}" aria-label="Erledigen">${icon('check', 15)}</button></div>`;
}

function chipsHtml() {
  const f = flt();
  const out = [];
  const add = (label, key, val) => out.push(`<span class="chip on">${label}<button class="icon-btn sm x" data-unf="${key}" data-unv="${esc(String(val ?? ''))}" aria-label="Filter entfernen" style="width:18px;height:18px">${icon('x', 11)}</button></span>`);
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

export function render(route) {
  // Filter aus Links übernehmen (z. B. #/vorgaenge?f=over)
  const p = (route && route.params) || {};
  if (Object.keys(p).length) {
    const f = {};
    if (p.f) f.due = p.f;
    if (p.type) f.type = p.type.split(',').filter(x => C.TYPES[x]);
    if (p.cat) f.cat = [p.cat];
    if (p.project) f.project = p.project;
    if (p.person) f.person = p.person;
    if (p.life) f.life = p.life;
    if (p.rec) f.rec = true;
    if (p.status) f.status = p.status.split(',').filter(x => C.STATUS[x]);
    setFlt(f);
    history.replaceState(null, '', '#/vorgaenge');
  }
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
  const head = COLS.filter(([k]) => k !== 'area' || showArea).map(([k, l, cls]) => `<th class="sortable ${cls}" data-sort="${k}" aria-sort="${st.k === k ? (st.d > 0 ? 'ascending' : 'descending') : 'none'}">${l}${st.k === k ? `<span class="arr">${st.d > 0 ? '↑' : '↓'}</span>` : ''}</th>`).join('') + '<th class="t-act"></th>';
  const mobile = isMobile();
  return `<div class="page">
    <div class="page-head"><div class="grow"><h1>Vorgänge${area !== 'all' ? ` <span class="muted" style="font-weight:500">· ${area === 'b' ? 'Geschäftlich' : 'Privat'}</span>` : ''}</h1>
      <div class="psub">${base.length} offen${red ? ` · <span style="color:var(--bad);font-weight:600">${red} überfällig</span>` : ''}${active ? ` · ${active} in Bearbeitung` : ''}${waiting ? ` · ${waiting} wartend` : ''} · <a href="#/anleitung/vorgang">Was ist ein Vorgang?</a></div></div>
      <div class="page-actions"><a class="btn" href="#/archiv">${icon('archive', 15)}Archiv</a><button class="btn btn-primary" data-newt>${icon('plus', 15)}Vorgang</button></div></div>
    ${oneCat ? catSummary(oneCat, now, area) : ''}
    <div class="toolbar">
      <label class="search grow" style="max-width:420px">${icon('search', 15)}<input id="vg-q" data-vq value="${esc(q)}" placeholder="Titel, Notizen, Verlauf oder #Nr." aria-label="Vorgänge durchsuchen"></label>
      <button class="btn ${nf ? 'on-f' : ''}" data-flt aria-label="Filter">${icon('filter', 15)}Filter${nf ? ` <span class="cnt-b">${nf}</span>` : ''}</button>
      ${mobile ? `<select class="select" data-msort style="width:auto;height:32px" aria-label="Sortierung">${COLS.filter(([k]) => k !== 'amp' || true).map(([k, l]) => `<option value="${k}" ${st.k === k ? 'selected' : ''}>${l || 'Ampel'}</option>`).join('')}</select>` : ''}
      <span class="sp"></span><span class="small muted">${list.length === base.length ? `${list.length} Vorgänge` : `${list.length} von ${base.length}`}</span>
    </div>
    ${chipsHtml()}
    ${list.length ? (mobile ? `<div class="card pad-sm"><div class="list">${list.map(t => cardHtml(t, now)).join('')}</div></div>`
      : `<div class="card flush"><div class="table-wrap"><table class="tbl vg"><thead><tr>${head}</tr></thead><tbody>${list.map(t => rowHtml(t, now, showArea)).join('')}</tbody></table></div></div>`)
    : `<div class="card">${base.length ? emptyState('🔎', 'Keine Vorgänge für diese Filter', 'Ändere die Suche oder setze die Filter zurück.', '<button class="btn" data-freset>Filter zurücksetzen</button>') : emptyState('✨', 'Keine offenen Vorgänge', 'Alles erledigt. Neue Vorgänge entstehen aus der Inbox oder über „+ Vorgang“.', '<button class="btn btn-primary" data-newt>Vorgang anlegen</button>')}</div>`}
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
    <div class="flt-sec"><label class="switch small"><input type="checkbox" data-frec ${f.rec ? 'checked' : ''}><span class="tr"></span>Nur wiederkehrende</label></div>
    <div class="row" style="justify-content:space-between;border-top:1px solid var(--line);padding-top:10px"><button class="link-btn" data-freset>Zurücksetzen</button><button class="btn sm btn-primary" data-fclose>Fertig</button></div>
  </div>`;
  popover(anchor, html, {
    width: 380, place: 'below',
    onMount: (el, close) => {
      el.addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b) return;
        const cur = { ...flt() };
        if (b.dataset.fk) {
          const k = b.dataset.fk; let v = b.dataset.fv; if (k === 'prio') v = Number(v);
          const set = new Set(cur[k] || []); if (set.has(v)) set.delete(v); else set.add(v);
          cur[k] = [...set]; b.classList.toggle('on', set.has(v));
        } else if (b.dataset.fdue !== undefined) {
          cur.due = b.dataset.fdue; el.querySelectorAll('[data-fdue]').forEach(x => x.classList.toggle('on', x === b));
        } else if (b.hasAttribute('data-freset')) { setFlt({}); close(); A.render(); return; }
        else if (b.hasAttribute('data-fclose')) { close(); return; }
        else return;
        setFlt(cur); A.render();
      });
      el.addEventListener('change', e => {
        const cur = { ...flt() };
        if (e.target.dataset.fsel) cur[e.target.dataset.fsel] = e.target.value || '';
        if (e.target.hasAttribute('data-frec')) cur.rec = e.target.checked;
        setFlt(cur); A.render();
      });
    },
  });
}

export function mount(root) {
  const qi = root.querySelector('[data-vq]');
  if (qi) qi.addEventListener('input', debounce(() => { q = qi.value; A.render(); }, 200));
  root.addEventListener('click', e => {
    const th = e.target.closest('th[data-sort]');
    if (th) { const k = th.dataset.sort; const st = sortState(); S.local.vgSort = { k, d: st.k === k ? -st.d : (k === 'created' || k === 'no' ? -1 : 1) }; S.saveLocal(); A.render(); return; }
    if (e.target.closest('[data-flt]')) { filterPopover(e.target.closest('[data-flt]')); return; }
    if (e.target.closest('[data-freset]')) { setFlt({}); q = ''; A.render(); return; }
    if (e.target.closest('[data-newt]')) { A.newTask(); return; }
    const un = e.target.closest('[data-unf]');
    if (un) {
      const f = { ...flt() }; const k = un.dataset.unf;
      if (Array.isArray(f[k])) f[k] = f[k].filter(x => String(x) !== un.dataset.unv); else delete f[k];
      setFlt(f); A.render();
    }
  });
  root.addEventListener('change', e => {
    if (e.target.matches('[data-msort]')) { const k = e.target.value; S.local.vgSort = { k, d: k === 'created' || k === 'no' ? -1 : 1 }; S.saveLocal(); A.render(); }
  });
  root.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.matches('tr[data-task], .li[data-task]')) A.openTask(e.target.dataset.task);
  });
}
