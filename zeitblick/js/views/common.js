// Gemeinsame Bausteine für Ansichten
import * as C from '../core.js';
import * as S from '../store.js';
import { esc, icon, tint } from '../ui.js';
import { A } from '../app-api.js';

export function catColor(c) { return tint((c && c.color) || '#7d8791', A.theme()); }
export function areaColor(area) { return area === 'b' ? 'var(--biz)' : 'var(--priv)'; }
export function areaName(area) { return area === 'b' ? 'Geschäftlich' : 'Privat'; }

export function ampLevel(t, now = A.now()) { return C.ampel(t, now, S.settings()).level; }

export function dueInfo(t, now = A.now()) {
  if (!t.due) return null;
  const s = S.settings();
  const a = C.ampel(t, now, s);
  let cls = '';
  if (a.level === 'red' || a.level === 'alarm') cls = 'over';
  else if (a.level === 'yellow') cls = 'soon';
  let txt = C.fmtDue(t.due, t.dueTime, now);
  if (cls === 'over') {
    const h = a.overdueH;
    txt = h < 24 ? `Überfällig seit ${Math.max(1, Math.round(h))} Std` : `Überfällig seit ${Math.round(h / 24)} ${Math.round(h / 24) === 1 ? 'Tag' : 'Tagen'}`;
  }
  return { txt, cls, level: a.level };
}

export function taskMeta(t, { showCat = true, showArea = false, now = A.now() } = {}) {
  const parts = [];
  const d = dueInfo(t, now);
  if (d && !t.done) parts.push(`<span class="${d.cls}">${icon('clock', 13)}${esc(d.txt)}</span>`);
  if (t.done && t.doneAt) parts.push(`<span>${icon('check', 13)}Erledigt ${esc(C.fmtRelTime(t.doneAt, now.getTime()))}</span>`);
  if (t.rec && t.rec.f) {
    const st = C.streakOf(t.hist, now);
    parts.push(`<span>${icon('repeat', 13)}${esc(C.describeRule(t.rec, t.due))}${st > 1 ? `, 🔥 ${st}` : ''}</span>`);
  }
  if (showCat && t.cat) { const c = S.cat(t.cat); if (c) parts.push(`<span><i class="catdot" style="background:${catColor(c)}"></i>${esc(c.icon || '')} ${esc(c.name)}</span>`); }
  if (showArea) parts.push(`<span>${esc(areaName(t.area))}</span>`);
  if (t.subs && t.subs.length) { const n = t.subs.filter(x => x.d).length; parts.push(`<span>${icon('sub', 13)}${n}/${t.subs.length}</span>`); }
  if (t.dur) parts.push(`<span>${icon('focus', 13)}${esc(C.fmtDurShort(t.dur))}</span>`);
  if (t.focusMin >= 1) parts.push(`<span title="Fokuszeit">${icon('gem', 13)}${esc(C.fmtDurShort(t.focusMin))}</span>`);
  if (t.delegate) parts.push(`<span>${icon('person', 13)}${esc(t.delegate)}</span>`);
  return parts.join('');
}

export function taskRow(t, opts = {}) {
  const lvl = ampLevel(t);
  return `<div class="trow ${t.done ? 'done' : ''}" data-task="${t.id}" tabindex="0">
    <button class="chk p${t.prio || 3} ${t.done ? 'on' : ''}" data-act="done" data-id="${t.id}" aria-label="${t.done ? 'Wieder öffnen' : 'Erledigen'}">${icon('check', 13)}</button>
    <div class="grow">
      <div class="ttitle">${esc(t.title)}</div>
      <div class="tmeta">${taskMeta(t, opts)}</div>
    </div>
    <div class="tright">
      ${!t.done ? `<button class="icon-btn sm play" data-act="focus" data-id="${t.id}" aria-label="Fokus starten" title="Fokus starten">${icon('play', 15)}</button>` : ''}
      ${lvl !== 'none' && lvl !== 'done' ? `<span class="amp ${lvl}" title="${esc(C.AMPEL[lvl].name)}"></span>` : ''}
    </div>
  </div>`;
}

export function emptyState(emoji, title, text, action = '') {
  return `<div class="empty"><div class="big">${emoji}</div><b>${esc(title)}</b><div>${esc(text)}</div>${action ? `<div style="margin-top:14px">${action}</div>` : ''}</div>`;
}

export function openTasks(area = A.area()) { return S.tasks(t => !t.done && S.inArea(t, area)); }

export function sortTasks(list, now = A.now()) {
  const s = S.settings();
  return list.sort((a, b) => {
    const ra = C.AMPEL[C.ampel(a, now, s).level].rank, rb = C.AMPEL[C.ampel(b, now, s).level].rank;
    if (ra !== rb && (ra >= 3 || rb >= 3)) return rb - ra;
    const da = C.taskDueAt(a), db = C.taskDueAt(b);
    if (da && db && da - db) return da - db;
    if (da && !db) return -1;
    if (!da && db) return 1;
    return (a.prio || 3) - (b.prio || 3) || (a.order || 0) - (b.order || 0) || (a.createdAt || 0) - (b.createdAt || 0);
  });
}

export function greetingLine() {
  const now = A.now();
  const s = S.settings();
  return `${C.greeting(now)}, ${s.name || 'Alexander'}`;
}

export function leitsatz(now = A.now()) {
  const list = S.leitsaetze();
  const idx = Math.floor(C.startOfDay(now).getTime() / C.DAY) % list.length;
  return list[(idx + list.length) % list.length];
}

/** Gem-SVG (für Fokus-Sammlung) */
export function gemSvg(color, size = 24, broken = false) {
  const id = 'g' + Math.random().toString(36).slice(2, 8);
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".55"/><stop offset="1" stop-color="${color}"/></linearGradient></defs>
    <path d="M12 2 20 8.2 17.2 20H6.8L4 8.2z" fill="url(#${id})"/>
    <path d="M4 8.2 12 12.5 20 8.2M12 12.5V20M8 3.5l4 9 4-9" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="1"/>
    ${broken ? '<path d="M7 6l4 5-2 3 4 4" fill="none" stroke="rgba(0,0,0,.55)" stroke-width="1.4"/>' : ''}
  </svg>`;
}
