// Gemeinsame Bausteine für alle Ansichten (Zeitblick 2)
import * as C from '../core.js';
import * as S from '../store.js';
import { esc, icon, tint } from '../ui.js';
import { A } from '../app-api.js';

export function catColor(c) { return tint((c && c.color) || '#9aa1a9', A.theme()); }
export function areaName(area) { return area === 'b' ? 'Geschäftlich' : 'Privat'; }
export function areaShort(area) { return area === 'b' ? 'Geschäftl.' : 'Privat'; }

export function ampLevel(t, now = A.now()) { return C.ampel(t, now, S.settings()).level; }
export function ampDot(level, title) {
  if (!level || level === 'done') return '<span class="dot none" title="Ohne Frist"></span>';
  const names = { none: 'Ohne Frist', green: 'Im Plan', yellow: 'Bald fällig', red: 'Überfällig', alarm: 'Alarm' };
  return `<span class="dot ${level === 'none' ? 'none' : level}" title="${esc(title || names[level] || '')}"></span>`;
}

export function statusPill(t, { select = false } = {}) {
  const st = C.statusOf(t);
  if (select) {
    return `<select class="pill st-${st}" data-status="${t.id}" aria-label="Status ändern">${C.STATUS_ORDER.map(k => `<option value="${k}" ${k === st ? 'selected' : ''}>${C.STATUS[k].name}</option>`).join('')}</select>`;
  }
  return `<span class="pill st-${st}"><span class="dot"></span>${C.STATUS[st].name}</span>`;
}

export function prioLabel(p) { p = p || 3; return `<span class="prio p${p}" title="${C.PRIOS[p].name}">P${p}</span>`; }

export function catTag(catId) {
  const c = S.cat(catId);
  if (!c) return '<span class="faint small">–</span>';
  return `<span class="tag"><i class="catdot" style="background:${catColor(c)}"></i>${esc(c.name)}</span>`;
}

export function dueInfo(t, now = A.now()) {
  if (!t.due) return null;
  const a = C.ampel(t, now, S.settings());
  let cls = '';
  if (a.level === 'red' || a.level === 'alarm') cls = 'over';
  else if (a.level === 'yellow') cls = 'soon';
  let txt = C.fmtDue(t.due, t.dueTime, now);
  if (cls === 'over') {
    const h = a.overdueH;
    txt = h < 24 ? `seit ${Math.max(1, Math.round(h))} Std` : `seit ${Math.round(h / 24)} ${Math.round(h / 24) === 1 ? 'Tag' : 'Tagen'}`;
  }
  return { txt, cls, level: a.level };
}

export function fmtDay(ms) {
  if (!ms) return '–';
  const d = new Date(ms);
  return `${C.pad(d.getDate())}.${C.pad(d.getMonth() + 1)}.${String(d.getFullYear()).slice(2)}`;
}
export function fmtDueShort(t) {
  if (!t.due) return '–';
  const d = C.parseYmd(t.due);
  return `${C.pad(d.getDate())}.${C.pad(d.getMonth() + 1)}.${t.dueTime ? ' ' + t.dueTime : ''}`;
}
export function fmtDateTime(ms) {
  const d = new Date(ms);
  return `${C.pad(d.getDate())}.${C.pad(d.getMonth() + 1)}.${d.getFullYear()}, ${C.hm(d)}`;
}

/** kompakte Listenzeile für einen Vorgang (Cockpit, Projekte, Personen …) */
export function taskLine(t, { showCat = true, now = A.now(), focus = true } = {}) {
  const lvl = ampLevel(t, now);
  const d = dueInfo(t, now);
  const c = S.cat(t.cat);
  const closed = C.isClosed(t);
  return `<div class="li ${closed ? 'done' : ''}" data-task="${t.id}" tabindex="0">
    ${ampDot(closed ? 'done' : lvl)}
    <div class="grow"><div class="lt">${esc(t.title)}</div>
      <div class="lm">${statusPillSmall(t)}${d && !closed ? `<span class="${d.cls}">${esc(d.txt)}</span>` : ''}${showCat && c ? `<span class="tag"><i class="catdot" style="background:${catColor(c)}"></i>${esc(c.name)}</span>` : ''}${t.rec && t.rec.f ? `<span>${icon('repeat', 12)}</span>` : ''}</div></div>
    ${focus && !closed ? `<button class="icon-btn sm" data-act="focus" data-id="${t.id}" aria-label="Fokus starten" title="Fokus starten">${icon('play', 13)}</button>` : ''}
  </div>`;
}
function statusPillSmall(t) { const st = C.statusOf(t); return st === 'neu' ? '' : `<span>${C.STATUS[st].name}</span>`; }

export function emptyState(emoji, title, text, action = '') {
  return `<div class="empty"><div class="em">${emoji}</div><b>${esc(title)}</b><div class="small">${esc(text)}</div>${action ? `<div style="margin-top:14px">${action}</div>` : ''}</div>`;
}

export function sortTasks(list, now = A.now()) {
  const s = S.settings();
  return list.sort((a, b) => {
    const ra = C.AMPEL[C.ampel(a, now, s).level].rank, rb = C.AMPEL[C.ampel(b, now, s).level].rank;
    if (ra !== rb && (ra >= 3 || rb >= 3)) return rb - ra;
    const da = C.taskDueAt(a), db = C.taskDueAt(b);
    if (da && db && da - db) return da - db;
    if (da && !db) return -1;
    if (!da && db) return 1;
    return (a.prio || 3) - (b.prio || 3) || (a.createdAt || 0) - (b.createdAt || 0);
  });
}

export function greetingLine() { const n = (S.settings().name || '').trim(); return `${C.greeting(A.now())}${n ? ', ' + n : ''}`; }
export function leitsatz(now = A.now()) {
  const list = S.leitsaetze();
  const idx = Math.floor(C.startOfDay(now).getTime() / C.DAY) % list.length;
  return list[(idx + list.length) % list.length];
}

export function gemSvg(color, size = 24, broken = false) {
  const id = 'g' + Math.random().toString(36).slice(2, 8);
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".55"/><stop offset="1" stop-color="${color}"/></linearGradient></defs>
    <path d="M12 2 20 8.2 17.2 20H6.8L4 8.2z" fill="url(#${id})"/>
    <path d="M4 8.2 12 12.5 20 8.2M12 12.5V20M8 3.5l4 9 4-9" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="1"/>
    ${broken ? '<path d="M7 6l4 5-2 3 4 4" fill="none" stroke="rgba(0,0,0,.55)" stroke-width="1.4"/>' : ''}
  </svg>`;
}

export function initials(name) { return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0].toUpperCase()).join(''); }
export function progressBar(p, cls = '') { return `<div class="progress ${cls}"><i style="width:${Math.round(Math.max(0, Math.min(1, p || 0)) * 100)}%"></i></div>`; }
export function pct(p) { return `${Math.round(Math.max(0, Math.min(1, p || 0)) * 100)} %`; }

/** Auswahl für Kategorien inkl. „+ Neue Kategorie“ */
export function catSelect(area, sel, attrs = '') {
  const list = S.cats(area && area !== 'all' ? area : null);
  return `<select class="select" ${attrs}>
    <option value="">Ohne Kategorie</option>
    ${list.map(c => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(c.name)}${area === 'all' || !area ? ` (${areaShort(c.area)})` : ''}</option>`).join('')}
    <option value="__new">+ Neue Kategorie …</option>
  </select>`;
}
export function lifeSelect(sel, attrs = '') {
  const list = S.lifeAreas();
  return `<select class="select" ${attrs}><option value="">Kein Lebensbereich</option>${list.map(l => `<option value="${l.id}" ${l.id === sel ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}<option value="__new">+ Neuer Lebensbereich …</option></select>`;
}
export function projectSelect(sel, attrs = '') {
  const list = S.projects(p => p.status !== 'abgeschlossen' || p.id === sel).sort((a, b) => a.title.localeCompare(b.title));
  return `<select class="select" ${attrs}><option value="">Kein Projekt</option>${list.map(p => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.title)}</option>`).join('')}</select>`;
}
export function goalSelect(sel, attrs = '') {
  const list = S.goals(g => g.status === 'aktiv' || g.status === 'pausiert' || g.id === sel).sort((a, b) => a.title.localeCompare(b.title));
  return `<select class="select" ${attrs}><option value="">Kein Ziel</option>${list.map(g => `<option value="${g.id}" ${g.id === sel ? 'selected' : ''}>${esc(g.title)}</option>`).join('')}</select>`;
}
