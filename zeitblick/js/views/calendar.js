// Kalender im Google-Kalender-Stil: Tag, 3 Tage, Woche, Monat, Terminliste
import * as C from '../core.js';
import * as S from '../store.js';
import { esc, icon, popover, closePopover, toast, isMobile } from '../ui.js';
import { A } from '../app-api.js';
import { vibrate } from '../audio.js';
import { openEventEditor, openTaskEditor, deleteEventFlow, placeThumb } from '../editors.js';
import { catColor, areaName } from './common.js';

const HH = 48; // Pixel pro Stunde
let cur = null;
let firstScroll = true;

const VIEWS = [['d', 'Tag'], ['3', '3 Tage'], ['w', 'Woche'], ['m', 'Monat'], ['a', 'Termine']];
const ROUTE_VIEW = { tag: 'd', drei: '3', woche: 'w', monat: 'm', termine: 'a' };
export const VIEW_ROUTE = { d: 'tag', 3: 'drei', w: 'woche', m: 'monat', a: 'termine' };

export function getCur() { if (!cur) cur = C.startOfDay(A.now()); return cur; }
export function setCur(d) { cur = C.startOfDay(d); }
export function view() { return S.local.calView || 'w'; }
export function setView(v) { S.local.calView = v; S.saveLocal(); firstScroll = true; }

function inkFor(color) {
  if (!color) return '#fff';
  if (color.startsWith('#')) {
    const n = parseInt(color.slice(1), 16);
    const l = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
    return l > 0.62 ? '#1e2832' : '#fff';
  }
  const m = color.match(/hsl\([\d.]+\s+[\d.]+%\s+([\d.]+)%/);
  if (m) return Number(m[1]) > 50 ? '#1a0603' : '#ffe2d6';
  return '#fff';
}
export function evColor(ev, google = false) {
  if (google) return A.theme() === 'night' ? 'hsl(20 70% 45%)' : (A.theme() === 'dark' ? '#5598e7' : '#2a78d6');
  const c = S.cat(ev.cat);
  if (c) return catColor(c);
  return A.theme() === 'night' ? (ev.area === 'b' ? 'hsl(18 90% 55%)' : 'hsl(34 75% 50%)') : getComputedStyle(document.body).getPropertyValue(ev.area === 'b' ? '--biz' : '--priv').trim() || '#1b4f72';
}

function rangeFor(v, d) {
  if (v === 'd') return { start: C.startOfDay(d), days: 1 };
  if (v === '3') return { start: C.startOfDay(d), days: 3 };
  if (v === 'w') return { start: C.startOfWeek(d), days: 7 };
  return { start: C.startOfWeek(d), days: 7 };
}

function title(v, d) {
  if (v === 'm' || v === 'a') return `${C.MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  const { start, days } = rangeFor(v, d);
  const end = C.addDays(start, days - 1);
  if (days === 1) return `${d.getDate()}. ${C.MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  if (start.getMonth() === end.getMonth()) return `${C.MONTHS[start.getMonth()]} ${start.getFullYear()}`;
  return `${C.MONTHS_SHORT[start.getMonth()]} – ${C.MONTHS_SHORT[end.getMonth()]} ${end.getFullYear()}`;
}

function layers() { return S.local.calLayers || {}; }
function visibleEvents() {
  const L = layers();
  const area = A.area();
  return S.events(e => S.inArea(e, area) && (e.area === 'b' ? L.b !== false : L.p !== false));
}
function googleEvents() {
  const L = layers();
  if (L.google === false) return [];
  const area = A.area();
  return S.getGoogleEvents().filter(e => S.inArea(e, area));
}
function visibleTasks(dayKey) {
  const L = layers();
  if (L.tasks === false) return [];
  const area = A.area();
  return S.tasks(t => t.due === dayKey && S.inArea(t, area));
}
function focusBlocks(d0, d1) {
  if (!layers().focus) return [];
  const area = A.area();
  return S.focusSessions(f => f.s < d1.getTime() && (f.e || f.s) > d0.getTime() && S.inArea(f, area));
}

/* ---------------- Mini-Kalender ---------------- */
function miniCal(d) {
  const m0 = C.startOfMonth(d);
  const g0 = C.startOfWeek(m0);
  const today = C.ymd(A.now());
  const sel = C.ymd(getCur());
  const evDays = new Set(C.expandEvents(visibleEvents(), g0, C.addDays(g0, 42)).map(o => C.ymd(o.start)));
  let rows = '';
  for (let r = 0; r < 6; r++) {
    rows += '<tr>';
    for (let c = 0; c < 7; c++) {
      const day = C.addDays(g0, r * 7 + c);
      const k = C.ymd(day);
      rows += `<td><button data-goto="${k}" class="${day.getMonth() !== m0.getMonth() ? 'out' : ''} ${k === today ? 'today' : ''} ${k === sel ? 'sel' : ''} ${evDays.has(k) ? 'has' : ''}" aria-label="${esc(C.fmtDateLong(day))}">${day.getDate()}</button></td>`;
    }
    rows += '</tr>';
  }
  return `<div class="minical"><div class="mh"><span>${C.MONTHS[m0.getMonth()]} ${m0.getFullYear()}</span><span class="row" style="gap:0"><button class="icon-btn sm" data-mini="-1" aria-label="Vorheriger Monat">${icon('left', 16)}</button><button class="icon-btn sm" data-mini="1" aria-label="Nächster Monat">${icon('right', 16)}</button></span></div>
    <table><thead><tr>${C.WD_SHORT.map(w => `<th>${w[0]}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
}
let miniMonth = null;

/* ---------------- Zeitraster ---------------- */
function layoutDay(items) {
  // items: {startMin, endMin}
  items.sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);
  const groups = [];
  let g = null, gEnd = -1;
  for (const it of items) {
    if (!g || it.startMin >= gEnd) { g = []; groups.push(g); gEnd = it.endMin; }
    g.push(it); gEnd = Math.max(gEnd, it.endMin);
  }
  for (const grp of groups) {
    const cols = [];
    for (const it of grp) {
      let i = cols.findIndex(end => end <= it.startMin);
      if (i < 0) { i = cols.length; cols.push(it.endMin); } else cols[i] = it.endMin;
      it.col = i;
    }
    for (const it of grp) it.ncol = cols.length;
  }
  return items;
}

function timeGrid(v) {
  const { start, days } = rangeFor(v, getCur());
  const now = A.now();
  const todayKey = C.ymd(now);
  const end = C.addDays(start, days);
  const occ = C.expandEvents(visibleEvents(), start, end);
  const gocc = C.expandEvents(googleEvents(), start, end);
  const fblocks = focusBlocks(start, end);
  let head = '', allday = '', cols = '';
  for (let i = 0; i < days; i++) {
    const d = C.addDays(start, i);
    const k = C.ymd(d);
    const isToday = k === todayKey;
    const wkend = C.wdIdx(d) >= 5;
    head += `<div class="tg-dayh ${isToday ? 'today' : ''}" data-goto-day="${k}"><div class="wd">${C.WD_SHORT[C.wdIdx(d)]}</div><div class="dn">${d.getDate()}</div></div>`;
    // Ganztägig
    const d1 = C.addDays(d, 1);
    const ad = [];
    for (const o of occ) if (o.ev.allDay && o.start < d1 && o.end > d) ad.push(`<div class="chipev" style="--ec:${evColor(o.ev)};--ev-ink:${inkFor(evColor(o.ev))}" data-eid="${o.ev.id}" data-occ="${o.start.getTime()}" title="${esc(o.ev.title)}"><span class="ct">${esc(o.ev.title)}</span></div>`);
    for (const o of gocc) if (o.ev.allDay && o.start < d1 && o.end > d) ad.push(`<div class="chipev google" style="--ec:${evColor(o.ev, true)}" data-gid="${esc(o.ev.uid)}" data-occ="${o.start.getTime()}" title="${esc(o.ev.title)}"><span class="ct">${esc(o.ev.title)}</span></div>`);
    for (const t of visibleTasks(k).filter(t => !t.dueTime)) {
      const c = S.cat(t.cat);
      ad.push(`<div class="chipev task ${t.done ? 'done' : ''}" style="--ec:${c ? catColor(c) : 'var(--accent)'}" data-task="${t.id}" title="${esc(t.title)}"><button class="mini-chk" data-act="done" data-id="${t.id}" aria-label="Erledigen" style="padding:0;background:${t.done ? 'var(--ok)' : 'none'}"></button><span class="ct">${esc(t.title)}</span></div>`);
    }
    allday += `<div class="tg-adcol" data-ad-day="${k}">${ad.join('')}</div>`;
    // Zeitbezogene Elemente
    const items = [];
    for (const o of occ) {
      if (o.ev.allDay) continue;
      const s0 = o.start < d ? d : o.start;
      const e0 = o.end > d1 ? d1 : o.end;
      if (e0 <= d || s0 >= d1) continue;
      items.push({ type: 'ev', o, startMin: C.daysBetween(d, s0) > 0 ? 1440 : C.minutesOfDay(s0), endMin: e0 >= d1 ? 1440 : Math.max(C.minutesOfDay(e0), C.minutesOfDay(s0) + 15), cont: o.start < d });
    }
    for (const o of gocc) {
      if (o.ev.allDay) continue;
      const s0 = o.start < d ? d : o.start, e0 = o.end > d1 ? d1 : o.end;
      if (e0 <= d || s0 >= d1) continue;
      items.push({ type: 'g', o, startMin: C.minutesOfDay(s0), endMin: e0 >= d1 ? 1440 : Math.max(C.minutesOfDay(e0), C.minutesOfDay(s0) + 15) });
    }
    const taskItems = visibleTasks(k).filter(t => t.dueTime).map(t => { const m = C.minutesOfDay(C.parseLocal(k + 'T' + t.dueTime)); return { type: 'task', t, startMin: m, endMin: m + 28 }; });
    layoutDay(taskItems);
    for (const f of fblocks) {
      const fs = new Date(f.s), fe = new Date(f.e || f.s + (f.min || 25) * C.MIN);
      if (fe <= d || fs >= d1) continue;
      const s0 = fs < d ? d : fs, e0 = fe > d1 ? d1 : fe;
      items.push({ type: 'focus', f, startMin: C.minutesOfDay(s0), endMin: e0 >= d1 ? 1440 : Math.max(C.minutesOfDay(e0), C.minutesOfDay(s0) + 15) });
    }
    layoutDay(items);
    let inner = '';
    for (const it of [...items, ...taskItems]) {
      const top = it.startMin / 60 * HH;
      const h = Math.max(18, (it.endMin - it.startMin) / 60 * HH - 1);
      const w = 100 / it.ncol;
      const pos = `top:${top}px;height:${h}px;left:calc(${w * it.col}% + 2px);right:auto;width:calc(${w}% - 5px)`;
      if (it.type === 'ev') {
        const ev = it.o.ev; const col = evColor(ev);
        const short = h < 34;
        inner += `<div class="ev ${short ? 'short' : ''}" style="${pos};--ec:${col};--ev-ink:${inkFor(col)}" data-eid="${ev.id}" data-occ="${it.o.start.getTime()}" data-sm="${it.startMin}" data-em="${it.endMin}"><b>${esc(ev.title)}</b><span class="et">${C.hm(it.o.start)}–${C.hm(it.o.end)}${ev.loc && !short ? `, ${esc(ev.loc)}` : ''}</span>${ev.rec && ev.rec.f ? '' : ''}${!it.cont ? '<div class="rz" data-rz="1"></div>' : ''}</div>`;
      } else if (it.type === 'g') {
        const ev = it.o.ev; const col = evColor(ev, true);
        inner += `<div class="ev google ${h < 34 ? 'short' : ''}" style="${pos};--ec:${col}" data-gid="${esc(ev.uid)}" data-occ="${it.o.start.getTime()}"><b>${esc(ev.title)}</b><span class="et">${C.hm(it.o.start)}–${C.hm(it.o.end)}</span></div>`;
      } else if (it.type === 'task') {
        const t = it.t; const c = S.cat(t.cat);
        const tw = 62 / it.ncol;
        inner += `<div class="tk" style="top:${top}px;left:calc(${38 + tw * it.col}% - 2px);width:calc(${tw}% - 2px);border-color:${c ? catColor(c) : 'var(--accent)'}" data-task="${t.id}" title="${esc(t.title)}"><button class="mini-chk" data-act="done" data-id="${t.id}" aria-label="Erledigen" style="padding:0;border-color:${c ? catColor(c) : 'var(--accent)'};background:${t.done ? 'var(--ok)' : 'none'}"></button><span class="ellip" style="${t.done ? 'text-decoration:line-through;opacity:.6' : ''}">${esc(t.dueTime)} ${esc(t.title)}</span></div>`;
      } else {
        const f = it.f; const c = S.cat(f.cat); const col = c ? catColor(c) : 'var(--accent)';
        const tk = f.taskId ? S.task(f.taskId) : null;
        inner += `<div class="ev focusblk" style="${pos};--ec:${col}" title="Fokus ${Math.round(f.min || 0)} Min"><b>◆ Fokus ${Math.round(f.min || 0)} Min</b><span class="et">${tk ? esc(tk.title) : f.ok ? 'geschafft' : 'abgebrochen'}</span></div>`;
      }
    }
    if (isToday) inner += `<div class="nowline" style="top:${C.minutesOfDay(now) / 60 * HH}px" data-nowline></div>`;
    cols += `<div class="tg-col ${isToday ? 'today' : ''} ${wkend ? 'weekend' : ''}" data-day="${k}">${inner}</div>`;
  }
  let hours = '';
  for (let h = 0; h < 24; h++) hours += `<div>${h ? `<span>${C.pad(h)}:00</span>` : ''}</div>`;
  return `<div class="cal-body" style="--days:${days};--hh:${HH}px">
    <div class="tg-head"><div></div>${head}</div>
    <div class="tg-allday"><div class="lbl">ganzt.</div>${allday}</div>
    <div class="tg-scroll" data-keep-scroll="cal-${v}">
      <div class="tg-grid" style="height:${24 * HH}px">
        <div class="tg-hours">${hours}</div>${cols}
      </div>
    </div>
  </div>`;
}

/* ---------------- Monat ---------------- */
function monthGrid() {
  const d = getCur();
  const m0 = C.startOfMonth(d);
  const g0 = C.startOfWeek(m0);
  const g1 = C.addDays(g0, 42);
  const occ = C.expandEvents(visibleEvents(), g0, g1);
  const gocc = C.expandEvents(googleEvents(), g0, g1);
  const todayKey = C.ymd(A.now());
  const maxChips = isMobile() ? 3 : 4;
  let cells = '';
  for (let i = 0; i < 42; i++) {
    const day = C.addDays(g0, i);
    const k = C.ymd(day);
    const d1 = C.addDays(day, 1);
    const chips = [];
    for (const o of occ) if (o.start < d1 && o.end > day) {
      const col = evColor(o.ev);
      chips.push({ s: o.ev.allDay ? -1 : C.minutesOfDay(o.start), html: o.ev.allDay
        ? `<div class="chipev" style="--ec:${col};--ev-ink:${inkFor(col)}" data-eid="${o.ev.id}" data-occ="${o.start.getTime()}"><span class="ct">${esc(o.ev.title)}</span></div>`
        : `<div class="chipev" style="--ec:transparent;color:var(--ink);font-weight:500" data-eid="${o.ev.id}" data-occ="${o.start.getTime()}"><i class="catdot" style="background:${col};border-radius:50%"></i><span class="ct"><b>${C.hm(o.start)}</b> ${esc(o.ev.title)}</span></div>` });
    }
    for (const o of gocc) if (o.start < d1 && o.end > day) chips.push({ s: o.ev.allDay ? -1 : C.minutesOfDay(o.start), html: `<div class="chipev google" style="--ec:${evColor(o.ev, true)}" data-gid="${esc(o.ev.uid)}" data-occ="${o.start.getTime()}"><span class="ct">${o.ev.allDay ? '' : `<b>${C.hm(o.start)}</b> `}${esc(o.ev.title)}</span></div>` });
    for (const t of visibleTasks(k)) {
      const c = S.cat(t.cat);
      chips.push({ s: t.dueTime ? C.minutesOfDay(C.parseLocal(k + 'T' + t.dueTime)) : 1500, html: `<div class="chipev task ${t.done ? 'done' : ''}" style="--ec:${c ? catColor(c) : 'var(--accent)'}" data-task="${t.id}"><span class="mini-chk"></span><span class="ct">${esc(t.title)}</span></div>` });
    }
    chips.sort((a, b) => a.s - b.s);
    const shown = chips.slice(0, chips.length > maxChips ? maxChips - 1 : maxChips).map(c => c.html).join('');
    const more = chips.length > maxChips ? `<button class="more" data-more="${k}">+${chips.length - maxChips + 1} weitere</button>` : '';
    cells += `<div class="mcell ${day.getMonth() !== m0.getMonth() ? 'out' : ''} ${k === todayKey ? 'today' : ''}" data-mday="${k}"><span class="md" data-goto-day="${k}">${day.getDate()}</span>${shown}${more}</div>`;
  }
  return `<div class="month"><div class="month-h">${C.WD_SHORT.map(w => `<div>${w}</div>`).join('')}</div><div class="month-g" data-keep-scroll="cal-m">${cells}</div></div>`;
}

/* ---------------- Terminliste ---------------- */
function agendaList() {
  const d0 = C.startOfDay(getCur());
  const d1 = C.addDays(d0, 60);
  const occ = C.expandEvents(visibleEvents(), d0, d1).map(o => ({ k: C.ymd(o.start), o }));
  const gocc = C.expandEvents(googleEvents(), d0, d1).map(o => ({ k: C.ymd(o.start), o, g: true }));
  const L = layers();
  const area = A.area();
  const tks = L.tasks === false ? [] : S.tasks(t => t.due && !t.done && t.due >= C.ymd(d0) && t.due < C.ymd(d1) && S.inArea(t, area)).map(t => ({ k: t.due, t }));
  const all = [...occ, ...gocc, ...tks].sort((a, b) => a.k.localeCompare(b.k) || ((a.o ? (a.o.ev.allDay ? -1 : a.o.start.getTime()) : (a.t.dueTime ? C.parseLocal(a.k + 'T' + a.t.dueTime).getTime() : 9e15)) - (b.o ? (b.o.ev.allDay ? -1 : b.o.start.getTime()) : (b.t.dueTime ? C.parseLocal(b.k + 'T' + b.t.dueTime).getTime() : 9e15))));
  if (!all.length) return `<div class="agenda-list"><div class="empty"><div class="big">🗓️</div><b>Keine Termine in den nächsten 60 Tagen</b><div>Lege einen Termin mit „Erstellen“ an.</div></div></div>`;
  const todayKey = C.ymd(A.now());
  let html = '<div class="agenda-list" data-keep-scroll="cal-a">';
  let lastK = '';
  let group = '';
  const flush = () => { if (lastK) { const d = C.parseYmd(lastK); html += `<div class="agd ${lastK === todayKey ? 'today' : ''}"><div class="dl"><b>${d.getDate()}</b><span>${C.WD_SHORT[C.wdIdx(d)]}, ${C.MONTHS_SHORT[d.getMonth()]}</span></div><div>${group}</div></div>`; } };
  for (const it of all) {
    if (it.k !== lastK) { flush(); lastK = it.k; group = ''; }
    if (it.o) {
      const ev = it.o.ev; const col = evColor(ev, it.g);
      group += `<div class="age" ${it.g ? `data-gid="${esc(ev.uid)}"` : `data-eid="${ev.id}"`} data-occ="${it.o.start.getTime()}"><span class="dot" style="background:${col}"></span><span class="tm">${ev.allDay ? 'Ganztägig' : `${C.hm(it.o.start)} – ${C.hm(it.o.end)}`}</span><span class="grow"><b>${esc(ev.title)}</b>${ev.loc ? `<span class="muted small">, ${esc(ev.loc)}</span>` : ''}</span><span class="small muted">${it.g ? 'Google' : esc(areaName(ev.area))}</span></div>`;
    } else {
      const t = it.t; const c = S.cat(t.cat);
      group += `<div class="age" data-task="${t.id}"><span class="dot" style="background:transparent;border:2px solid ${c ? catColor(c) : 'var(--accent)'}"></span><span class="tm">${t.dueTime ? esc(t.dueTime) : 'Aufgabe'}</span><span class="grow">${esc(t.title)}</span><span class="small muted">${esc(areaName(t.area))}</span></div>`;
    }
  }
  flush();
  return html + '</div>';
}

/* ---------------- Render ---------------- */
export function render(route) {
  if (route && route.parts && route.parts[0] && ROUTE_VIEW[route.parts[0]]) {
    const v = ROUTE_VIEW[route.parts[0]];
    if (v !== view()) setView(v);
    if (route.parts[1] && /^\d{4}-\d{2}-\d{2}$/.test(route.parts[1])) setCur(C.parseYmd(route.parts[1]));
  }
  const v = view();
  const d = getCur();
  if (!miniMonth || miniMonth.getMonth() !== d.getMonth() || miniMonth.getFullYear() !== d.getFullYear()) miniMonth = C.startOfMonth(d);
  const L = layers();
  const body = v === 'm' ? monthGrid() : v === 'a' ? agendaList() : timeGrid(v);
  const viewsHtml = VIEWS.filter(([k]) => !(isMobile() && k === 'w')).map(([k, l]) => `<button data-view="${k}" aria-pressed="${v === k}">${l}</button>`).join('');
  return `<div class="cal">
    <aside class="cal-side">
      <button class="cal-create" data-act="create">${icon('plus', 22)}Erstellen</button>
      ${miniCal(miniMonth)}
      <div class="side-title" style="padding-left:4px">Meine Kalender</div>
      <label class="layer" style="--lc:var(--priv)"><input type="checkbox" data-layer="p" ${L.p !== false ? 'checked' : ''}>Privat</label>
      <label class="layer" style="--lc:var(--biz)"><input type="checkbox" data-layer="b" ${L.b !== false ? 'checked' : ''}>Geschäftlich</label>
      <label class="layer" style="--lc:var(--accent)"><input type="checkbox" data-layer="tasks" ${L.tasks !== false ? 'checked' : ''}>Aufgaben</label>
      <label class="layer" style="--lc:var(--q2)"><input type="checkbox" data-layer="focus" ${L.focus ? 'checked' : ''}>Fokus-Sitzungen</label>
      ${S.getGoogleEvents().length ? `<label class="layer" style="--lc:#2a78d6"><input type="checkbox" data-layer="google" ${L.google !== false ? 'checked' : ''}>Google Kalender</label>` : ''}
      <p class="tiny muted" style="margin-top:14px">Tipp: Ziehe im Raster, um einen Termin anzulegen. Termine lassen sich verschieben und unten in der Länge ändern. Tasten: T heute, D/W/M/A Ansicht, J/K blättern.</p>
    </aside>
    <section class="cal-main">
      <div class="cal-bar">
        <button class="btn sm" data-act="today">Heute</button>
        <button class="icon-btn" data-act="prev" aria-label="Zurück">${icon('left')}</button>
        <button class="icon-btn" data-act="next" aria-label="Weiter">${icon('right')}</button>
        <h2>${esc(title(v, d))}</h2>
        <div class="seg small vsel" data-viewseg role="group" aria-label="Ansicht"><span class="seg-thumb"></span>${viewsHtml}</div>
      </div>
      ${body}
    </section>
  </div>`;
}

function step(dir) {
  const v = view();
  const d = getCur();
  if (v === 'd') setCur(C.addDays(d, dir));
  else if (v === '3') setCur(C.addDays(d, 3 * dir));
  else if (v === 'w') setCur(C.addDays(d, 7 * dir));
  else if (v === 'm') setCur(C.addMonths(C.startOfMonth(d), dir));
  else setCur(C.addDays(d, 30 * dir));
  A.render();
}
export function keyNav(key) {
  if (key === 't') { setCur(A.now()); A.render(); return true; }
  if (key === 'j' || key === 'ArrowRight') { step(1); return true; }
  if (key === 'k' || key === 'ArrowLeft') { step(-1); return true; }
  const map = { d: 'd', w: 'w', m: 'm', a: 'a', x: '3' };
  if (map[key]) { setView(map[key]); A.nav('#/kalender/' + VIEW_ROUTE[map[key]]); return true; }
  return false;
}

/* ---------------- Popover für Termine ---------------- */
function eventPopover(anchor, ev, occStart, google = false) {
  const col = evColor(ev, google);
  const durMs = ev.allDay ? 0 : (C.parseLocal(ev.e) - C.parseLocal(ev.s));
  const occ = occStart ? new Date(Number(occStart)) : C.parseLocal(ev.s);
  const end = ev.allDay ? null : new Date(occ.getTime() + durMs);
  const c = S.cat(ev.cat);
  let when;
  if (ev.allDay) {
    const days = C.daysBetween(C.parseLocal(ev.s), C.parseLocal(ev.e || ev.s)) + 1;
    when = days > 1 ? `${C.fmtDateLong(occ)} bis ${C.fmtDateLong(C.addDays(occ, days - 1))}` : `${C.fmtDateLong(occ)}, ganztägig`;
  } else when = `${C.fmtDateLong(occ)}, ${C.hm(occ)} – ${C.hm(end)} Uhr`;
  const tk = ev.taskId ? S.task(ev.taskId) : null;
  const html = `<div class="ev-pop">
    <div class="ep-tools">
      ${!google ? `<button class="icon-btn sm" data-pact="edit" aria-label="Bearbeiten" title="Bearbeiten">${icon('edit', 17)}</button><button class="icon-btn sm" data-pact="del" aria-label="Löschen" title="Löschen">${icon('trash', 17)}</button>` : ''}
      <button class="icon-btn sm" data-pact="close" aria-label="Schließen">${icon('x', 17)}</button>
    </div>
    <div class="ep-head"><span class="ep-sq" style="background:${col}"></span><div><h3>${esc(ev.title)}</h3><div class="small muted" style="margin-top:2px">${esc(when)}</div>
      ${ev.rec && ev.rec.f ? `<div class="small muted">${esc(C.describeRule(ev.rec, ev.s))}</div>` : ''}</div></div>
    ${ev.loc ? `<div class="ep-line">${icon('pin', 17)}<span>${esc(ev.loc)}</span></div>` : ''}
    ${ev.notes ? `<div class="ep-line">${icon('notes', 17)}<span style="white-space:pre-wrap;max-height:120px;overflow:auto">${esc(ev.notes)}</span></div>` : ''}
    <div class="ep-line">${icon('calendar', 17)}<span>${google ? 'Google Kalender (nur lesen)' : esc(areaName(ev.area))}${c ? `, ${esc(c.icon || '')} ${esc(c.name)}` : ''}</span></div>
    ${ev.rem && ev.rem.length && !google ? `<div class="ep-line">${icon('bell', 17)}<span>${ev.rem.map(m => m === 0 ? 'Zum Beginn' : m >= 60 ? C.fmtDuration(m) + ' vorher' : m + ' Min vorher').join(', ')}</span></div>` : ''}
    ${tk ? `<div class="ep-line">${icon('link', 17)}<span class="grow">${esc(tk.title)}</span></div><div class="row" style="margin-top:10px;justify-content:flex-end"><button class="btn sm" data-pact="task">Aufgabe öffnen</button><button class="btn sm btn-primary" data-pact="focus">${icon('play', 14)}Fokus</button></div>` : ''}
  </div>`;
  popover(anchor, html, {
    width: 360, place: 'side',
    onMount: (el, close) => {
      el.addEventListener('click', async e => {
        const b = e.target.closest('[data-pact]'); if (!b) return;
        const a = b.dataset.pact;
        if (a === 'close') close();
        if (a === 'edit') { close(); openEventEditor(ev.id, {}, ev.rec && ev.rec.f ? occ : null); }
        if (a === 'del') { close(); await deleteEventFlow(ev, ev.rec && ev.rec.f ? occ : null); }
        if (a === 'task') { close(); openTaskEditor(tk.id); }
        if (a === 'focus') { close(); A.startFocus(tk.id, { autostart: true }); }
      });
    },
  });
}

/* ---------------- Schnell anlegen ---------------- */
function quickCreate(anchor, startDate, endDate, allDay = false) {
  const area0 = A.area() === 'all' ? 'p' : A.area();
  let kind = 'event';
  let area = area0;
  const when = allDay ? C.fmtDateLong(startDate) : `${C.fmtDateShort(startDate)}, ${C.hm(startDate)} – ${C.hm(endDate)}`;
  const html = `<div>
    <input class="input title-in" data-q="title" placeholder="Titel hinzufügen" aria-label="Titel" style="font-size:18px">
    <div class="chips" style="margin:10px 0"><button class="chip on" data-kind="event">Termin</button><button class="chip" data-kind="task">Aufgabe</button></div>
    <div class="small" style="margin-bottom:10px">${icon('clock', 14)} <span>${esc(when)}</span></div>
    <div class="seg small seg-area" data-areaseg><span class="seg-thumb"></span><button data-area="p" aria-pressed="${area === 'p'}"><span class="dotp"></span>Privat</button><button data-area="b" aria-pressed="${area === 'b'}"><span class="dotb"></span>Geschäftlich</button></div>
    <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn sm btn-ghost" data-q="more">Weitere Optionen</button><button class="btn sm btn-primary" data-q="save">Speichern</button></div>
  </div>`;
  popover(anchor, html, {
    width: 340, place: 'side',
    onMount: (el, close) => {
      const inp = el.querySelector('[data-q="title"]');
      setTimeout(() => inp.focus(), 30);
      requestAnimationFrame(() => placeThumb(el.querySelector('[data-areaseg]')));
      const preset = () => kind === 'event'
        ? { title: inp.value.trim(), area, allDay, s: allDay ? C.ymd(startDate) : C.fmtLocal(startDate), e: allDay ? C.ymd(startDate) : C.fmtLocal(endDate) }
        : { title: inp.value.trim(), area, due: C.ymd(startDate), dueTime: allDay ? null : C.hm(startDate), dur: allDay ? null : Math.round((endDate - startDate) / C.MIN) };
      const save = () => {
        const p = preset();
        if (!p.title) { inp.focus(); return; }
        if (kind === 'event') { S.put('events', p); toast('Termin erstellt'); }
        else { S.put('tasks', { ...p, prio: 3, imp: false, urg: false, autoUrg: true, esc: true, subs: [], no: S.nextTicketNo() }); toast('Aufgabe erstellt'); }
        close();
      };
      el.addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.kind) { kind = b.dataset.kind; el.querySelectorAll('[data-kind]').forEach(x => x.classList.toggle('on', x === b)); }
        if (b.dataset.area) { area = b.dataset.area; el.querySelectorAll('[data-area]').forEach(x => x.setAttribute('aria-pressed', x === b)); placeThumb(el.querySelector('[data-areaseg]')); }
        if (b.dataset.q === 'save') save();
        if (b.dataset.q === 'more') { const p = preset(); close(); if (kind === 'event') openEventEditor(null, p); else openTaskEditor(null, p); }
      });
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') save(); });
    },
  });
}

function dayPopover(anchor, k) {
  const day = C.parseYmd(k);
  const occ = C.expandEvents(visibleEvents(), day, C.addDays(day, 1));
  const gocc = C.expandEvents(googleEvents(), day, C.addDays(day, 1));
  const tks = visibleTasks(k);
  const html = `<div><div class="row" style="margin-bottom:8px"><b class="grow">${esc(C.fmtDateLong(day))}</b><button class="btn sm" data-goto-day="${k}">Tag öffnen</button></div>
    ${occ.map(o => `<div class="age" data-eid="${o.ev.id}" data-occ="${o.start.getTime()}"><span class="dot" style="background:${evColor(o.ev)}"></span><span class="tm">${o.ev.allDay ? 'Ganztägig' : C.hm(o.start)}</span><span class="grow">${esc(o.ev.title)}</span></div>`).join('')}
    ${gocc.map(o => `<div class="age" data-gid="${esc(o.ev.uid)}" data-occ="${o.start.getTime()}"><span class="dot" style="background:${evColor(o.ev, true)}"></span><span class="tm">${o.ev.allDay ? 'Ganztägig' : C.hm(o.start)}</span><span class="grow">${esc(o.ev.title)}</span></div>`).join('')}
    ${tks.map(t => `<div class="age" data-task="${t.id}"><span class="dot" style="border:2px solid var(--accent)"></span><span class="tm">${t.dueTime || 'Aufgabe'}</span><span class="grow">${esc(t.title)}</span></div>`).join('')}</div>`;
  popover(anchor, html, {
    width: 320, place: 'below',
    onMount: (el, close) => el.addEventListener('click', e => {
      const r = e.target.closest('[data-eid]');
      if (r) { const ev = S.event(r.dataset.eid); close(); if (ev) setTimeout(() => eventPopover(anchor, ev, r.dataset.occ), 0); return; }
      const g = e.target.closest('[data-gid]');
      if (g) { const ev = S.getGoogleEvents().find(x => x.uid === g.dataset.gid); close(); if (ev) setTimeout(() => eventPopover(anchor, ev, g.dataset.occ, true), 0); return; }
      const d = e.target.closest('[data-goto-day]');
      if (d) { close(); setCur(C.parseYmd(d.dataset.gotoDay)); setView('d'); A.nav('#/kalender/tag'); }
    }),
  });
}

/* ---------------- Interaktion ---------------- */
export function mount(root, ctx = {}) {
  const signal = ctx.signal;
  const seg = root.querySelector('[data-viewseg]');
  requestAnimationFrame(() => placeThumb(seg));
  const scroller = root.querySelector('.tg-scroll');
  if (scroller) {
    const sbw = scroller.offsetWidth - scroller.clientWidth;
    root.querySelectorAll('.tg-head, .tg-allday').forEach(x => x.style.setProperty('--sbw', sbw + 'px'));
    if (firstScroll) {
      const now = A.now();
      const s = S.settings();
      const { start, days } = rangeFor(view(), getCur());
      const showsToday = now >= start && now < C.addDays(start, days);
      const h = showsToday ? Math.max(0, now.getHours() - 2) : (s.dayStart ?? 7);
      scroller.scrollTop = h * HH;
      firstScroll = false;
    }
  }

  root.addEventListener('click', e => {
    const t = e.target;
    const b = t.closest('button');
    if (b && b.dataset.view) { setView(b.dataset.view); A.nav('#/kalender/' + VIEW_ROUTE[b.dataset.view]); return; }
    if (b && b.dataset.act === 'today') { setCur(A.now()); firstScroll = true; A.render(); return; }
    if (b && b.dataset.act === 'prev') return step(-1);
    if (b && b.dataset.act === 'next') return step(1);
    if (b && b.dataset.act === 'create') { const st = C.setTime(getCur(), `${Math.min(22, A.now().getHours() + 1)}:00`); openEventEditor(null, { s: C.fmtLocal(st), e: C.fmtLocal(C.addMinutes(st, 60)) }); return; }
    if (b && b.dataset.mini) { miniMonth = C.addMonths(miniMonth, Number(b.dataset.mini)); const box = root.querySelector('.minical'); box.outerHTML = miniCal(miniMonth); return; }
    if (b && b.dataset.goto) { setCur(C.parseYmd(b.dataset.goto)); firstScroll = true; A.render(); return; }
    const gd = t.closest('[data-goto-day]');
    if (gd) { closePopover(); setCur(C.parseYmd(gd.dataset.gotoDay)); setView('d'); A.nav('#/kalender/tag'); return; }
    if (b && b.dataset.more) { e.stopPropagation(); dayPopover(b, b.dataset.more); return; }
    const g = t.closest('[data-gid]');
    if (g) { const ev = S.getGoogleEvents().find(x => x.uid === g.dataset.gid); if (ev) eventPopover(g, ev, g.dataset.occ, true); return; }
    if (root.querySelector('.month') && !t.closest('[data-eid],[data-task],button')) {
      const cell = t.closest('[data-mday]');
      if (cell) { const d = C.parseYmd(cell.dataset.mday); quickCreate(cell, C.setTime(d, '09:00'), C.setTime(d, '10:00'), true); return; }
    }
    if (root.querySelector('.agenda-list')) {
      const ev = t.closest('[data-eid]');
      if (ev) { const x = S.event(ev.dataset.eid); if (x) eventPopover(ev, x, ev.dataset.occ); }
    }
    const adcol = t.closest('.tg-adcol');
    if (adcol && !t.closest('[data-eid],[data-task],[data-gid]')) { const d = C.parseYmd(adcol.dataset.adDay); quickCreate(adcol, d, d, true); return; }
    const chip = t.closest('.chipev[data-eid]');
    if (chip && !t.closest('.month-g')) { const x = S.event(chip.dataset.eid); if (x) eventPopover(chip, x, chip.dataset.occ); }
  });

  root.addEventListener('change', e => {
    const l = e.target.dataset && e.target.dataset.layer;
    if (l) { S.local.calLayers = { ...layers(), [l]: e.target.checked }; S.saveLocal(); A.render(); }
  });

  if (scroller) bindGridDrag(root, scroller, signal);
  const mg = root.querySelector('.month-g');
  if (mg) bindMonthDrag(mg, signal);
}

function snap(m, step = 15) { return Math.round(m / step) * step; }

function bindGridDrag(root, scroller, signal) {
  const grid = scroller.querySelector('.tg-grid');
  let st = null;
  const colAt = (x) => {
    const cols = [...grid.querySelectorAll('.tg-col')];
    for (const c of cols) { const r = c.getBoundingClientRect(); if (x >= r.left && x < r.right) return c; }
    return x < cols[0].getBoundingClientRect().left ? cols[0] : cols[cols.length - 1];
  };
  const minAt = (col, y) => { const r = col.getBoundingClientRect(); return Math.max(0, Math.min(1440, (y - r.top) / HH * 60)); };

  grid.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    if (e.target.closest('.tk, [data-gid], .focusblk, button')) return;
    const evEl = e.target.closest('.ev[data-eid]');
    const col = e.target.closest('.tg-col');
    if (!col) return;
    const touch = e.pointerType !== 'mouse';
    st = { id: e.pointerId, x0: e.clientX, y0: e.clientY, touch, active: false, moved: false, col, evEl, mode: evEl ? (e.target.closest('[data-rz]') ? 'resize' : 'move') : 'create', t0: Date.now() };
    if (evEl) {
      st.sm = Number(evEl.dataset.sm); st.em = Number(evEl.dataset.em);
      st.grabOff = minAt(col, e.clientY) - st.sm;
    } else st.m0 = minAt(col, e.clientY);
    if (touch && evEl) {
      st.timer = setTimeout(() => { if (st && !st.moved) { st.active = true; evEl.classList.add('dragging'); vibrate(15); } }, 380);
    }
  });
  grid.addEventListener('touchmove', e => { if (st && st.active) e.preventDefault(); }, { passive: false });

  window.addEventListener('pointermove', e => {
    if (!st || e.pointerId !== st.id) return;
    const dx = e.clientX - st.x0, dy = e.clientY - st.y0;
    if (!st.moved && Math.hypot(dx, dy) > 6) {
      st.moved = true;
      if (!st.touch) {
        st.active = true;
        if (st.evEl) st.evEl.classList.add('dragging');
      } else if (!st.active) { clearTimeout(st.timer); st = null; return; }
    }
    if (!st.active) return;
    e.preventDefault();
    A.dragging = true;
    const col = colAt(e.clientX);
    if (st.mode === 'move') {
      const len = st.em - st.sm;
      let ns = snap(minAt(col, e.clientY) - st.grabOff);
      ns = Math.max(0, Math.min(1440 - len, ns));
      st.ns = ns; st.ncol = col;
      if (st.evEl.parentElement !== col) col.appendChild(st.evEl);
      st.evEl.style.top = (ns / 60 * HH) + 'px';
      st.evEl.style.left = '2px'; st.evEl.style.width = 'calc(100% - 6px)';
      const et = st.evEl.querySelector('.et');
      if (et) et.textContent = `${C.pad(Math.floor(ns / 60))}:${C.pad(ns % 60)}–${C.pad(Math.floor((ns + len) / 60) % 24)}:${C.pad((ns + len) % 60)}`;
    } else if (st.mode === 'resize') {
      let ne = snap(minAt(st.col, e.clientY));
      ne = Math.max(st.sm + 15, Math.min(1440, ne));
      st.ne = ne;
      st.evEl.style.height = ((ne - st.sm) / 60 * HH - 1) + 'px';
      const et = st.evEl.querySelector('.et');
      if (et) et.textContent = `${C.pad(Math.floor(st.sm / 60))}:${C.pad(st.sm % 60)}–${C.pad(Math.floor(ne / 60) % 24)}:${C.pad(ne % 60)}`;
    } else if (st.mode === 'create' && !st.touch) {
      const m1 = minAt(st.col, e.clientY);
      const a = Math.floor(Math.min(st.m0, m1) / 15) * 15, b = Math.max(a + 15, Math.ceil(Math.max(st.m0, m1) / 15) * 15);
      st.a = a; st.b = b;
      if (!st.prev) { st.prev = document.createElement('div'); st.prev.className = 'ev sel-preview'; st.col.appendChild(st.prev); }
      st.prev.style.top = (a / 60 * HH) + 'px';
      st.prev.style.height = ((b - a) / 60 * HH) + 'px';
      st.prev.innerHTML = `<b>(Kein Titel)</b><span class="et">${C.pad(Math.floor(a / 60))}:${C.pad(a % 60)}–${C.pad(Math.floor(b / 60) % 24)}:${C.pad(b % 60)}</span>`;
    }
  }, { passive: false, signal });

  const finish = (e, cancelled) => {
    if (!st || (e && e.pointerId !== st.id)) return;
    const s0 = st; st = null;
    clearTimeout(s0.timer);
    A.dragging = false;
    if (s0.evEl) s0.evEl.classList.remove('dragging');
    if (cancelled) { if (s0.prev) s0.prev.remove(); A.render(); return; }
    const day = C.parseYmd(s0.col.dataset.day);
    if (!s0.moved) {
      // Klick
      if (s0.evEl) { const ev = S.event(s0.evEl.dataset.eid); if (ev) eventPopover(s0.evEl, ev, s0.evEl.dataset.occ); }
      else {
        const m = Math.floor(s0.m0 / 30) * 30;
        const start = C.addMinutes(day, m);
        const fake = { x: e.clientX, y: e.clientY };
        quickCreate(fake, start, C.addMinutes(start, 60), false);
      }
      return;
    }
    if (s0.mode === 'create') {
      if (s0.prev && s0.a !== undefined) {
        const start = C.addMinutes(day, s0.a), end = C.addMinutes(day, s0.b);
        const anchor = s0.prev;
        quickCreate(anchor, start, end, false);
        const obs = setInterval(() => { if (!document.querySelector('.popover')) { anchor.remove(); clearInterval(obs); } }, 300);
      }
      return;
    }
    if (!s0.active) return;
    const ev = S.event(s0.evEl.dataset.eid);
    if (!ev) { A.render(); return; }
    const occ = new Date(Number(s0.evEl.dataset.occ));
    const durMin = Math.round((C.parseLocal(ev.e) - C.parseLocal(ev.s)) / C.MIN);
    let newStart, newEnd;
    if (s0.mode === 'move' && s0.ns !== undefined) {
      const nday = C.parseYmd(s0.ncol.dataset.day);
      newStart = C.addMinutes(nday, s0.ns);
      newEnd = C.addMinutes(newStart, durMin);
    } else if (s0.mode === 'resize' && s0.ne !== undefined) {
      newStart = occ;
      newEnd = C.addMinutes(C.startOfDay(occ), s0.ne);
    } else { A.render(); return; }
    applyMove(ev, occ, newStart, newEnd);
  };
  window.addEventListener('pointerup', e => finish(e, false), { signal });
  window.addEventListener('pointercancel', e => finish(e, true), { signal });
}

function applyMove(ev, occ, newStart, newEnd) {
  if (ev.rec && ev.rec.f) {
    S.put('events', { ...ev, exd: [...(ev.exd || []), C.ymd(occ)] });
    const copy = { ...ev }; delete copy.id; delete copy.createdAt;
    S.put('events', { ...copy, rec: null, exd: [], seriesOf: ev.id, s: ev.allDay ? C.ymd(newStart) : C.fmtLocal(newStart), e: ev.allDay ? C.ymd(newEnd) : C.fmtLocal(newEnd) });
    toast('Nur dieser Serientermin wurde verschoben');
  } else {
    const prev = { ...ev };
    S.put('events', { ...ev, s: ev.allDay ? C.ymd(newStart) : C.fmtLocal(newStart), e: ev.allDay ? C.ymd(newEnd) : C.fmtLocal(newEnd) });
    toast(`Verschoben auf ${C.fmtDateShort(newStart)}${ev.allDay ? '' : ', ' + C.hm(newStart)}`, { action: 'Rückgängig', onAction: () => S.put('events', { ...S.event(ev.id), s: prev.s, e: prev.e }) });
  }
}

function bindMonthDrag(mg, signal) {
  let st = null;
  mg.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    const chip = e.target.closest('.chipev[data-eid]');
    if (!chip) return;
    st = { id: e.pointerId, chip, x0: e.clientX, y0: e.clientY, touch: e.pointerType !== 'mouse', moved: false, active: false };
    if (st.touch) st.timer = setTimeout(() => { if (st && !st.moved) st.active = true; }, 380);
  });
  mg.addEventListener('touchmove', e => { if (st && st.active) e.preventDefault(); }, { passive: false });
  window.addEventListener('pointermove', e => {
    if (!st || e.pointerId !== st.id) return;
    if (!st.moved && Math.hypot(e.clientX - st.x0, e.clientY - st.y0) > 6) {
      st.moved = true;
      if (!st.touch) st.active = true; else if (!st.active) { clearTimeout(st.timer); st = null; return; }
      if (st.active) { st.ghost = st.chip.cloneNode(true); st.ghost.style.cssText += ';position:fixed;z-index:120;pointer-events:none;width:' + st.chip.offsetWidth + 'px;box-shadow:var(--shadow-pop)'; document.body.appendChild(st.ghost); st.chip.style.opacity = '.35'; }
    }
    if (!st || !st.active || !st.ghost) return;
    e.preventDefault();
    A.dragging = true;
    st.ghost.style.left = (e.clientX - 20) + 'px'; st.ghost.style.top = (e.clientY - 10) + 'px';
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const cell = el && el.closest('[data-mday]');
    mg.querySelectorAll('.mcell.dropt').forEach(x => x !== cell && x.classList.remove('dropt'));
    if (cell) { cell.classList.add('dropt'); cell.style.outline = '2px solid var(--accent)'; st.target = cell; }
    mg.querySelectorAll('.mcell').forEach(x => { if (x !== cell) x.style.outline = ''; });
  }, { passive: false, signal });
  const end = (e, cancel) => {
    if (!st || e.pointerId !== st.id) return;
    const s0 = st; st = null; clearTimeout(s0.timer);
    A.dragging = false;
    if (s0.ghost) s0.ghost.remove();
    mg.querySelectorAll('.mcell').forEach(x => { x.style.outline = ''; x.classList.remove('dropt'); });
    s0.chip.style.opacity = '';
    if (!s0.moved) { const ev = S.event(s0.chip.dataset.eid); if (ev) eventPopover(s0.chip, ev, s0.chip.dataset.occ); return; }
    if (cancel || !s0.active || !s0.target) return;
    const ev = S.event(s0.chip.dataset.eid); if (!ev) return;
    const occ = new Date(Number(s0.chip.dataset.occ));
    const shift = C.daysBetween(occ, C.parseYmd(s0.target.dataset.mday));
    if (!shift) return;
    const ns = C.addDays(occ, shift);
    const dur = ev.allDay ? (C.daysBetween(C.parseLocal(ev.s), C.parseLocal(ev.e || ev.s))) : 0;
    const ne = ev.allDay ? C.addDays(ns, dur) : new Date(ns.getTime() + (C.parseLocal(ev.e) - C.parseLocal(ev.s)));
    applyMove(ev, occ, ns, ne);
  };
  window.addEventListener('pointerup', e => end(e, false), { signal });
  window.addEventListener('pointercancel', e => end(e, true), { signal });
}

/** Jetzt-Linie aktualisieren ohne neu zu rendern */
export function tickNow(root) {
  const nl = root && root.querySelector('[data-nowline]');
  if (nl) nl.style.top = (C.minutesOfDay(A.now()) / 60 * HH) + 'px';
}
