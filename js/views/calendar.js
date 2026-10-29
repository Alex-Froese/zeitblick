// Kalender im Stil von Google Kalender – eigener, interner Kalender mit Timeboxing
import * as C from '../core.js';
import * as S from '../store.js';
import { esc, icon, popover, closePopover, toast, isMobile, tint } from '../ui.js';
import { A } from '../app-api.js';
import { vibrate } from '../audio.js';
import { openEventEditor, deleteEventFlow, placeThumb, createTimebox } from '../editors.js';
import { editCategory, handleNewOption } from '../entities.js';
import { catColor, areaName, ampDot, ampLevel, catSelect, sortTasks } from './common.js';
import { openTemplates, planWeek, copyWeek } from './calendar-tpl.js';
export { openTemplates, planWeek, copyWeek };

/* Zeitmaßstab: Stundenhöhe je Gerät (Alles sichtbar / kompakt / normal / groß), Nachtstunden gestaucht */
let SC = null;
let fitPx = 0;
const ZOOMS = [['fit', 'Alles sichtbar'], ['kompakt', 'Kompakt'], ['normal', 'Normal'], ['gross', 'Groß']];
function rootPx() { return parseFloat(getComputedStyle(document.documentElement).fontSize) || 13.76; }
function zoomMode() { return S.local.calHour || (isMobile() ? 'normal' : 'fit'); }
function buildScale(v) {
  const c = calS();
  const rp = rootPx();
  const mode = zoomMode();
  const squeeze = c.squeeze !== false;
  const nf = Number(c.nightFrom ?? 22), nt = Number(c.nightTo ?? 5);
  const isNight = h => squeeze && (nf > nt ? (h >= nf || h < nt) : (h >= nf && h < nt));
  const weights = [...Array(24)].map((_, h) => isNight(h) ? 0.32 : 1);
  const wsum = weights.reduce((a, b) => a + b, 0);
  let base;
  if (mode === 'fit') {
    const avail = fitPx || Math.max(18 * rp, window.innerHeight - (S.local.calFull ? 7.2 : 12) * rp);
    base = Math.max(1.15 * rp, (avail - 2) / wsum);
  } else base = ({ kompakt: 2.3, normal: 3, gross: 3.9 }[mode] || 3) * rp;
  const hh = weights.map(w => w * base);
  const top = [0]; for (let h = 0; h < 24; h++) top.push(top[h] + hh[h]);
  const y = m => { m = Math.max(0, Math.min(1440, m)); const h = Math.min(23, Math.floor(m / 60)); return top[h] + (m - h * 60) / 60 * hh[h]; };
  const min = px => { px = Math.max(0, Math.min(top[24], px)); let h = 0; while (h < 23 && top[h + 1] <= px) h++; return h * 60 + (px - top[h]) / hh[h] * 60; };
  return { base, hh, top, total: top[24], y, min, isNight, rp, minH: 1.2 * rp, mode, squeeze, v };
}
function sc() { if (!SC) SC = buildScale(view()); return SC; }
let cur = null;
let firstScroll = true;
let panelOpen = false;

const VIEWS = [['d', 'Tag'], ['3', '3 Tage'], ['w', 'Woche'], ['m', 'Monat'], ['a', 'Termine']];
const ROUTE_VIEW = { tag: 'd', drei: '3', woche: 'w', monat: 'm', termine: 'a' };
export const VIEW_ROUTE = { d: 'tag', 3: 'drei', w: 'woche', m: 'monat', a: 'termine' };

export function getCur() { if (!cur) cur = C.startOfDay(A.now()); return cur; }
export function setCur(d) { cur = C.startOfDay(d); }
export function view() { const v = S.local.calView || 'w'; return isMobile() && v === 'w' ? '3' : v; }
export function setView(v) { S.local.calView = v; S.saveLocal(); firstScroll = true; }

function calS() { return S.settings().cal || {}; }
function inkFor(color) {
  if (!color) return '#fff';
  if (color.startsWith('#')) {
    const n = parseInt(color.slice(1), 16);
    const l = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
    return l > 0.66 ? '#1e2832' : '#fff';
  }
  const m = color.match(/hsl\([\d.]+\s+[\d.]+%\s+([\d.]+)%/);
  if (m) return Number(m[1]) > 50 ? '#1a0603' : '#ffe2d6';
  return '#fff';
}
export function areaColor(area) { const c = calS(); return tint(area === 'b' ? (c.b || '#3f51b5') : (c.p || '#039be5'), A.theme()); }
export function evColor(ev) {
  if (ev.color) return tint(ev.color, A.theme());
  const c = S.cat(ev.cat);
  if (c) return catColor(c);
  return areaColor(ev.area);
}
function taskColor(t) { const c = S.cat(t.cat); return c ? catColor(c) : areaColor(t.area); }

function isoWeek(d) {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = x.getUTCDay() || 7;
  x.setUTCDate(x.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
  return Math.ceil(((x - y0) / C.DAY + 1) / 7);
}

function rangeFor(v, d) {
  if (v === 'd') return { start: C.startOfDay(d), days: 1 };
  if (v === '3') return { start: C.startOfDay(d), days: 3 };
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

/* ---------------- Sichtbarkeit ---------------- */
function layers() { return S.local.calLayers || {}; }
function hidden() { return S.local.calHidden || {}; }
function isHidden(rec) {
  const h = hidden();
  const c = rec.cat && S.cat(rec.cat);
  return c ? !!h[c.id] : !!h['_' + (rec.area === 'b' ? 'b' : 'p')];
}
function visibleEvents() { const area = A.area(); return S.events(e => S.inArea(e, area) && !isHidden(e)); }
function visibleTasks(dayKey) {
  if (layers().tasks === false) return [];
  const area = A.area();
  return S.openTasks(t => t.due === dayKey && S.inArea(t, area) && !isHidden(t));
}
function focusBlocks(d0, d1) {
  if (!layers().focus) return [];
  const area = A.area();
  return S.focusSessions(f => f.s < d1.getTime() && (f.e || f.s) > d0.getTime() && S.inArea(f, area));
}
function boxDone(ev) { if (!ev.taskId) return false; if (ev.boxDone) return true; const t = S.task(ev.taskId); return !t || C.isClosed(t); }

/* ---------------- Planung: Auslastung & freie Zeit ---------------- */
function busyIntervals(day) {
  const d1 = C.addDays(day, 1);
  const out = [];
  for (const o of C.expandEvents(S.events(e => !e.allDay && !e.theme), day, d1)) {
    const s = Math.max(0, (o.start - day) / C.MIN), e = Math.min(1440, (o.end - day) / C.MIN);
    if (e > s) out.push([s, e]);
  }
  out.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const iv of out) { const last = merged[merged.length - 1]; if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]); else merged.push([...iv]); }
  return merged;
}
function dayWindow() { const s = S.settings(); return [(s.dayStart ?? 7) * 60, (calS().dayEnd ?? 22) * 60]; }
export function dayLoad(day) {
  const [w0, w1] = dayWindow();
  let used = 0;
  for (const [a, b] of busyIntervals(day)) used += Math.max(0, Math.min(b, w1) - Math.max(a, w0));
  const total = Math.max(60, w1 - w0);
  return { used, total, pct: used / total };
}
/** nächster freier Zeitraum (15-Minuten-Raster) im Planungsfenster */
export function freeSlot(day, dur, fromMin = 0) {
  const [w0, w1] = dayWindow();
  let t = Math.max(w0, Math.ceil(fromMin / 15) * 15);
  for (const [a, b] of busyIntervals(day)) {
    if (b <= t) continue;
    if (a - t >= dur) break;
    t = Math.max(t, Math.ceil(b / 15) * 15);
  }
  return t + dur <= w1 ? C.addMinutes(day, t) : null;
}
function nextFree(dur) {
  const now = A.now();
  for (let i = 0; i < 14; i++) {
    const day = C.addDays(C.startOfDay(now), i);
    const st = freeSlot(day, dur, i === 0 ? C.minutesOfDay(now) + 5 : 0);
    if (st) return st;
  }
  return null;
}
function warnLoad(start) {
  const l = dayLoad(C.startOfDay(start));
  const max = (calS().maxLoad ?? 80) / 100;
  if (l.pct > max) toast(`Dieser Tag ist schon zu ${Math.round(l.pct * 100)} % verplant – lass dir Leerraum`, { ms: 5000 });
}
function planned(t) { return S.events(e => e.taskId === t.id && C.parseLocal(e.e || e.s) >= A.now()).length > 0; }
function planList() {
  const area = A.area();
  const now = A.now();
  const s = S.settings();
  const boxed = new Set(S.events(e => e.taskId && C.parseLocal(e.e || e.s) >= now).map(e => e.taskId));
  const list = S.openTasks(t => S.inArea(t, area) && !boxed.has(t.id) && C.statusOf(t) !== 'wartet');
  sortTasks(list, now);
  return list.sort((a, b) => C.quadrant(a, now, s) - C.quadrant(b, now, s));
}
function boxLen(t) { return t.dur && t.dur < 480 ? t.dur : (calS().boxLen || 30); }
function doPlan(t, start, dur) {
  createTimebox(S.task(t.id) || t, start, dur || boxLen(t));
  toast(`„${esc(t.title)}“ eingeplant: ${C.WD_SHORT[C.wdIdx(start)]} ${C.hm(start)} Uhr`);
  warnLoad(start);
}

/* ---------------- Seitenleiste ---------------- */
function miniCal(d) {
  const m0 = C.startOfMonth(d);
  const g0 = C.startOfWeek(m0);
  const today = C.ymd(A.now());
  const sel = C.ymd(getCur());
  let rows = '';
  for (let r = 0; r < 6; r++) {
    rows += '<tr>';
    for (let c = 0; c < 7; c++) {
      const day = C.addDays(g0, r * 7 + c);
      const k = C.ymd(day);
      rows += `<td><button data-goto="${k}" class="${day.getMonth() !== m0.getMonth() ? 'out' : ''} ${k === today ? 'today' : ''} ${k === sel ? 'sel' : ''}" aria-label="${esc(C.fmtDateLong(day))}">${day.getDate()}</button></td>`;
    }
    rows += '</tr>';
  }
  return `<div class="minical"><div class="mh"><span>${C.MONTHS[m0.getMonth()]} ${m0.getFullYear()}</span><span class="row" style="gap:0"><button class="icon-btn sm" data-mini="-1" aria-label="Vorheriger Monat">${icon('left', 16)}</button><button class="icon-btn sm" data-mini="1" aria-label="Nächster Monat">${icon('right', 16)}</button></span></div>
    <table><thead><tr>${C.WD_SHORT.map(w => `<th>${w[0]}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
}
let miniMonth = null;

function sideHtml() {
  const L = layers(), H = hidden();
  const area = A.area();
  const now = A.now();
  const list = planList();
  const items = list.slice(0, 40).map(t => {
    const due = t.due ? C.fmtDue(t.due, t.dueTime, now) : '';
    return `<div class="plan-item" data-plan="${t.id}" title="Ziehen zum Einplanen · Klicken für Optionen">${ampDot(ampLevel(t, now))}<div class="grow"><div class="ellip">${esc(t.title)}</div><div class="pm">${C.fmtDurShort(boxLen(t))}${due ? ' · ' + esc(due) : ''}</div></div><button class="icon-btn sm" data-autoplan="${t.id}" aria-label="In die nächste freie Zeit legen" title="Nächste freie Zeit">${icon('bolt', 14)}</button></div>`;
  }).join('');
  const calRow = (key, name, color, checked, edit) => `<div class="layer-row"><label class="layer" style="--lc:${color}"><input type="checkbox" data-calhide="${key}" ${checked ? 'checked' : ''}><span class="ellip">${esc(name)}</span></label>${edit}</div>`;
  const areas = area === 'all' ? ['p', 'b'] : [area];
  const cats = S.cats(area === 'all' ? null : area);
  return `<aside class="cal-side">
    <button class="cal-create" data-act="create">${icon('plus', 22)}Erstellen</button>
    ${miniCal(miniMonth)}
    <div class="side-h"><span>Zum Einplanen${list.length ? ` · ${list.length}` : ''}</span></div>
    <div class="plan-list">${items || '<div class="tiny muted" style="padding:2px 4px 6px">Alle offenen Vorgänge sind eingeplant.</div>'}${list.length > 40 ? `<div class="tiny muted" style="padding:2px 4px">… und ${list.length - 40} weitere</div>` : ''}</div>
    <p class="tiny faint" style="margin:4px 2px 0">In den Kalender ziehen oder ${icon('bolt', 11, 'inl')} für die nächste freie Zeit.</p>
    <div class="side-h"><span>Meine Kalender</span><button class="icon-btn sm" data-act="newcat" aria-label="Neue Kategorie" title="Neue Kategorie">${icon('plus', 15)}</button></div>
    ${areas.map(a => calRow('_' + a, areaName(a) + (cats.length ? ' (ohne Kategorie)' : ''), areaColor(a), !H['_' + a], `<button class="icon-btn sm" data-areacolor="${a}" aria-label="Farbe ändern">${icon('more', 15)}</button>`)).join('')}
    ${cats.map(c => calRow(c.id, c.name, catColor(c), !H[c.id], `<button class="icon-btn sm" data-editcat="${c.id}" aria-label="Kategorie bearbeiten">${icon('more', 15)}</button>`)).join('')}
    <div class="side-h"><span>Weitere</span></div>
    <label class="layer" style="--lc:var(--muted)"><input type="checkbox" data-layer="tasks" ${L.tasks !== false ? 'checked' : ''}>Fälligkeiten von Vorgängen</label>
    <label class="layer" style="--lc:var(--muted)"><input type="checkbox" data-layer="focus" ${L.focus ? 'checked' : ''}>Fokus-Sitzungen</label>
  </aside>`;
}

/* ---------------- Zeitraster ---------------- */
/**
 * Überschneidungen wie bei Google: gleichzeitig beginnende Blöcke (< 30 Min Abstand) nebeneinander,
 * später beginnende Blöcke eingerückt darüber – der Hauptblock bleibt breit.
 * Kurze Blöcke bekommen eine Mindesthöhe; wird ein folgender Block davon verdeckt, rückt sein Text nach unten.
 */
function layoutItems(items, S0) {
  items.sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);
  const clusters = [];
  let cl = null, clEnd = -1;
  for (const it of items) {
    if (!cl || it.startMin >= clEnd) { cl = []; clusters.push(cl); clEnd = it.endMin; }
    cl.push(it); clEnd = Math.max(clEnd, it.endMin);
  }
  let z = 3;
  for (const c of clusters) {
    const placed = [];
    let i = 0;
    while (i < c.length) {
      const g = [c[i]]; let j = i + 1;
      while (j < c.length && c[j].startMin - c[i].startMin < 30) { g.push(c[j]); j++; }
      const over = placed.filter(p => p.endMin > c[i].startMin);
      const L = over.length ? Math.min(0.7, Math.max(...over.map(p => p.left)) + (over.length > 2 ? 0.08 : 0.12)) : 0;
      const w = (1 - L) / g.length;
      g.forEach((it, k) => { it.left = L + k * w; it.width = w; it.z = z++; it.nested = L > 0; });
      placed.push(...g);
      i = j;
    }
  }
  // Mindesthöhe kurzer Blöcke: verdeckte Nachfolger rücken ihren Text nach unten
  for (const it of items) {
    it.top = S0.y(it.startMin);
    it.h = Math.max(S0.minH, S0.y(it.endMin) - it.top);
  }
  for (let a = 0; a < items.length; a++) {
    const p = items[a];
    if (S0.y(p.endMin) - p.top >= S0.minH - 0.5) continue;
    const vEnd = p.top + p.h;
    for (let b = 0; b < items.length; b++) {
      const q = items[b];
      if (q === p || q.startMin < p.endMin || q.top >= vEnd) continue;
      if (q.left >= p.left + p.width || p.left >= q.left + q.width) continue;
      q.padTop = Math.max(q.padTop || 0, vEnd - q.top);
      p.z = Math.max(p.z, q.z + 1);
    }
  }
  return items;
}

function weekTypeShort(mon) { const t = C.weekType(S.settings(), mon); return t === 'a' ? 'A' : t === 'b' ? 'B' : t === 'ferien' ? '🏖️' : ''; }

function timeGrid(v) {
  SC = buildScale(v);
  const S0 = SC;
  const { start, days } = rangeFor(v, getCur());
  const now = A.now();
  const todayKey = C.ymd(now);
  const end = C.addDays(start, days);
  const occ = C.expandEvents(visibleEvents(), start, end);
  const fblocks = focusBlocks(start, end);
  const maxLoad = (calS().maxLoad ?? 80) / 100;
  const [w0, w1] = dayWindow();
  const rp = S0.rp;
  const st = S.settings();
  let head = '', allday = '', cols = '';
  for (let i = 0; i < days; i++) {
    const d = C.addDays(start, i);
    const k = C.ymd(d);
    const isToday = k === todayKey;
    const load = dayLoad(d);
    const free = Math.max(0, load.total - load.used);
    head += `<div class="tg-dayh ${isToday ? 'today' : ''} ${k < todayKey ? 'past' : ''}" data-goto-day="${k}"><div class="wd">${C.WD_SHORT[C.wdIdx(d)]}</div><div class="dn">${d.getDate()}</div>
      <div class="load ${load.pct > maxLoad ? 'full' : ''}" title="${esc(C.fmtDuration(Math.round(load.used)))} verplant · ${esc(C.fmtDuration(Math.round(free)))} frei (${C.pad(w0 / 60)}–${C.pad(w1 / 60)} Uhr)"><i style="width:${Math.min(100, Math.round(load.pct * 100))}%"></i></div></div>`;
    const d1 = C.addDays(d, 1);
    const ad = [];
    const hol = C.inHoliday(st, d);
    if (hol) ad.push(`<div class="chipev hol" title="${esc(hol.name || 'Ferien')}"><span class="ct">🏖️ ${esc(hol.name || 'Ferien')}</span></div>`);
    for (const o of occ) if (o.ev.allDay && o.start < d1 && o.end > d) { const col = evColor(o.ev); ad.push(`<div class="chipev" style="--ec:${col};--ev-ink:${inkFor(col)}" data-eid="${o.ev.id}" data-occ="${o.start.getTime()}" title="${esc(o.ev.title)}"><span class="ct">${esc(o.ev.title)}</span></div>`); }
    const dayTasks = visibleTasks(k);
    const boxedToday = new Set(occ.filter(o => o.ev.taskId && C.sameDay(o.start, d)).map(o => o.ev.taskId));
    for (const t of dayTasks.filter(t => !t.dueTime && !boxedToday.has(t.id))) {
      ad.push(`<div class="chipev task" style="--ec:${taskColor(t)}" data-task="${t.id}" title="Fällig: ${esc(t.title)}"><button class="mini-chk" data-act="done" data-id="${t.id}" aria-label="Erledigen" style="border-color:${taskColor(t)}"></button><span class="ct">${esc(t.title)}</span></div>`);
    }
    allday += `<div class="tg-adcol ${hol ? 'hol' : ''}" data-ad-day="${k}">${ad.join('')}</div>`;
    const items = [], themes = [];
    for (const o of occ) {
      if (o.ev.allDay) continue;
      const s0 = o.start < d ? d : o.start;
      const e0 = o.end > d1 ? d1 : o.end;
      if (e0 <= d || s0 >= d1) continue;
      const it = { type: 'ev', o, startMin: C.minutesOfDay(s0), endMin: e0 >= d1 ? 1440 : Math.max(C.minutesOfDay(e0), C.minutesOfDay(s0) + 5), cont: o.start < d };
      (o.ev.theme ? themes : items).push(it);
    }
    for (const f of fblocks) {
      const fs = new Date(f.s), fe = new Date(f.e || f.s + (f.min || 25) * C.MIN);
      if (fe <= d || fs >= d1) continue;
      const s0 = fs < d ? d : fs, e0 = fe > d1 ? d1 : fe;
      items.push({ type: 'focus', f, startMin: C.minutesOfDay(s0), endMin: e0 >= d1 ? 1440 : Math.max(C.minutesOfDay(e0), C.minutesOfDay(s0) + 5) });
    }
    layoutItems(items, S0);
    let inner = '';
    // Themenblöcke: dezente Fläche + schmale Leiste rechts (zum Anklicken/Verschieben)
    for (const it of themes) {
      const ev = it.o.ev; const col = evColor(ev);
      const top = S0.y(it.startMin), h = Math.max(S0.minH, S0.y(it.endMin) - top);
      inner += `<div class="theme-band" style="top:${top}px;height:${h}px;--ec:${col}"></div><div class="ev theme-tab" style="top:${top}px;height:${h}px;--ec:${col}" data-eid="${ev.id}" data-occ="${it.o.start.getTime()}" data-sm="${it.startMin}" data-em="${it.endMin}" title="Themenblock: ${esc(ev.title)} ${C.hm(it.o.start)}–${C.hm(it.o.end)}"><span>${esc(ev.title)}</span></div>`;
    }
    for (const it of items) {
      const inset = themes.some(t => t.startMin < it.endMin && t.endMin > it.startMin);
      const gapR = it.left + it.width >= 0.999 ? (inset ? (isMobile() ? 0.65 : 1.15) * rp : 0.4 * rp) : 2;
      const pos = `top:${it.top}px;height:${Math.max(1, it.h - 1)}px;left:calc(${(it.left * 100).toFixed(3)}% + 1px);width:calc(${(it.width * 100).toFixed(3)}% - ${gapR.toFixed(1)}px);z-index:${it.z}${it.padTop ? `;--pt:${Math.round(it.padTop)}px` : ''}`;
      const short = it.h < 2.15 * rp;
      if (it.type === 'ev') {
        const ev = it.o.ev; const col = evColor(ev);
        const box = !!ev.taskId;
        const done = box && boxDone(ev);
        const lk = ev.link && ev.link.c === 'habits' ? S.get('habits', ev.link.id) : null;
        const lkDone = lk && C.habitDoneOn(lk, k);
        inner += `<div class="ev ${short ? 'short' : ''} ${box ? 'box' : ''} ${done || lkDone ? 'done' : ''} ${it.nested ? 'nested' : ''} ${it.padTop ? 'padded' : ''}" style="${pos};--ec:${col};--ev-ink:${inkFor(col)}" data-eid="${ev.id}" data-occ="${it.o.start.getTime()}" data-sm="${it.startMin}" data-em="${it.endMin}">${box ? `<button class="bxchk" data-boxdone="${ev.id}" aria-label="${done ? 'Erledigt' : 'Als erledigt markieren'}"></button>` : ''}${lk ? `<button class="evlk" data-evroutine="${lk.id}" title="${lk.kind === 'routine' ? 'Routine starten' : 'Abhaken'}: ${esc(lk.title)}" aria-label="${esc(lk.title)}">${icon(lkDone ? 'check' : lk.kind === 'routine' ? 'play' : 'check', 10)}</button>` : ''}<b>${esc(ev.title)}</b><span class="et">${C.hm(it.o.start)}${short ? '' : '–' + C.hm(it.o.end)}${ev.loc && !short ? `, ${esc(ev.loc)}` : ''}</span>${!it.cont ? '<div class="rz" data-rz="1"></div>' : ''}</div>`;
      } else {
        const f = it.f; const c = S.cat(f.cat); const col = c ? catColor(c) : 'var(--accent)';
        const tk = f.taskId ? S.task(f.taskId) : null;
        inner += `<div class="ev focusblk ${short ? 'short' : ''}" style="${pos};--ec:${col}" title="Fokus ${Math.round(f.min || 0)} Min"><b>Fokus ${Math.round(f.min || 0)} Min</b><span class="et">${tk ? esc(tk.title) : f.ok ? 'geschafft' : 'abgebrochen'}</span></div>`;
      }
    }
    const taskItems = dayTasks.filter(t => t.dueTime && !boxedToday.has(t.id)).map(t => { const m = C.minutesOfDay(C.parseLocal(k + 'T' + t.dueTime)); return { t, startMin: m, endMin: m + 28 }; });
    taskItems.sort((a, b) => a.startMin - b.startMin);
    taskItems.forEach((it, i) => { it.col = 0; for (let j = 0; j < i; j++) if (taskItems[j].endMin > it.startMin && taskItems[j].col === it.col) it.col++; });
    for (const it of taskItems) {
      const t = it.t; const col = taskColor(t);
      inner += `<div class="tk" style="top:${S0.y(it.startMin)}px;left:calc(${40 + it.col * 12}%);right:${it.col ? 0 : 4}px;border-color:${col}" data-task="${t.id}" title="Fällig ${esc(t.dueTime)}: ${esc(t.title)}"><button class="mini-chk" data-act="done" data-id="${t.id}" aria-label="Erledigen" style="border-color:${col}"></button><span class="ellip">${esc(t.dueTime)} ${esc(t.title)}</span></div>`;
    }
    if (isToday) inner += `<div class="nowline" style="top:${S0.y(C.minutesOfDay(now))}px" data-nowline></div>`;
    cols += `<div class="tg-col ${isToday ? 'today' : ''} ${hol ? 'hol' : ''}" data-day="${k}"><div class="win" style="top:0;height:${S0.y(w0)}px"></div><div class="win" style="top:${S0.y(w1)}px;bottom:0"></div>${inner}</div>`;
  }
  let hours = '', lines = '';
  for (let h = 0; h < 24; h++) {
    const night = S0.isNight(h);
    const showLbl = h && (S0.hh[h] >= 0.95 * rp || h % 2 === 0 || !S0.isNight(h - 1));
    hours += `<div class="${night ? 'night' : ''}" style="height:${S0.hh[h]}px">${showLbl ? `<span>${C.pad(h)}:00</span>` : ''}</div>`;
    lines += `<i class="${night ? 'night' : ''}" style="top:${S0.top[h]}px;height:${S0.hh[h]}px"></i>`;
  }
  const wt = days > 1 ? weekTypeShort(start) : '';
  return `<div class="cal-body ${S0.mode === 'fit' ? 'fit' : ''}" style="--days:${days}">
    <div class="tg-head"><div class="kw">${days > 1 ? `KW ${isoWeek(start)}${wt ? `<b>${wt}</b>` : ''}` : ''}</div>${head}</div>
    <div class="tg-allday"><div class="lbl">ganzt.</div>${allday}</div>
    <div class="tg-scroll" data-keep-scroll="cal-${v}-${S0.mode}">
      <div class="tg-grid" style="height:${S0.total}px">
        <div class="tg-hours">${hours}</div><div class="tg-lines" aria-hidden="true">${lines}</div>${cols}
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
      const done = boxDone(o.ev);
      chips.push({ s: o.ev.allDay ? -1 : C.minutesOfDay(o.start), html: o.ev.allDay
        ? `<div class="chipev" style="--ec:${col};--ev-ink:${inkFor(col)}" data-eid="${o.ev.id}" data-occ="${o.start.getTime()}"><span class="ct">${esc(o.ev.title)}</span></div>`
        : `<div class="chipev plain ${done ? 'done' : ''}" data-eid="${o.ev.id}" data-occ="${o.start.getTime()}"><i class="catdot" style="background:${col};border-radius:50%"></i><span class="ct"><b>${C.hm(o.start)}</b> ${esc(o.ev.title)}</span></div>` });
    }
    for (const t of visibleTasks(k)) {
      chips.push({ s: t.dueTime ? C.minutesOfDay(C.parseLocal(k + 'T' + t.dueTime)) : 1500, html: `<div class="chipev task" data-task="${t.id}"><span class="mini-chk" style="border-color:${taskColor(t)}"></span><span class="ct">${esc(t.title)}</span></div>` });
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
  const occ = C.expandEvents(visibleEvents(), d0, d1).map(o => ({ k: C.ymd(o.start), o, at: o.ev.allDay ? -1 : o.start.getTime() }));
  const area = A.area();
  const tks = layers().tasks === false ? [] : S.openTasks(t => t.due && t.due >= C.ymd(d0) && t.due < C.ymd(d1) && S.inArea(t, area) && !isHidden(t)).map(t => ({ k: t.due, t, at: t.dueTime ? C.parseLocal(t.due + 'T' + t.dueTime).getTime() : 9e15 }));
  const all = [...occ, ...tks].sort((a, b) => a.k.localeCompare(b.k) || a.at - b.at);
  if (!all.length) return `<div class="agenda-list"><div class="empty"><div class="em">🗓️</div><b>Keine Termine in den nächsten 60 Tagen</b><div class="small">Lege einen Termin mit „Erstellen“ an oder plane einen Vorgang ein.</div></div></div>`;
  const todayKey = C.ymd(A.now());
  let html = '<div class="agenda-list" data-keep-scroll="cal-a">';
  let lastK = '', group = '';
  const flush = () => { if (lastK) { const d = C.parseYmd(lastK); html += `<div class="agd ${lastK === todayKey ? 'today' : ''}"><div class="dl"><b>${d.getDate()}</b><span>${C.WD_SHORT[C.wdIdx(d)]}, ${C.MONTHS_SHORT[d.getMonth()]}</span></div><div>${group}</div></div>`; } };
  for (const it of all) {
    if (it.k !== lastK) { flush(); lastK = it.k; group = ''; }
    if (it.o) {
      const ev = it.o.ev; const col = evColor(ev);
      group += `<div class="age ${boxDone(ev) ? 'done' : ''}" data-eid="${ev.id}" data-occ="${it.o.start.getTime()}"><span class="dot" style="background:${col}"></span><span class="tm">${ev.allDay ? 'Ganztägig' : `${C.hm(it.o.start)} – ${C.hm(it.o.end)}`}</span><span class="grow">${esc(ev.title)}${ev.loc ? `<span class="muted small">, ${esc(ev.loc)}</span>` : ''}</span><span class="small muted">${ev.taskId ? 'Zeitblock' : esc(areaName(ev.area))}</span></div>`;
    } else {
      const t = it.t;
      group += `<div class="age" data-task="${t.id}"><span class="dot" style="background:transparent;border:2px solid ${taskColor(t)}"></span><span class="tm">${t.dueTime ? 'fällig ' + esc(t.dueTime) : 'fällig'}</span><span class="grow">${esc(t.title)}</span><span class="small muted">Vorgang</span></div>`;
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
  const body = v === 'm' ? monthGrid() : v === 'a' ? agendaList() : timeGrid(v);
  const viewsHtml = VIEWS.filter(([k]) => !(isMobile() && k === 'w')).map(([k, l]) => `<button data-view="${k}" aria-pressed="${v === k}">${l}</button>`).join('');
  const nPlan = planList().length;
  const full = !!S.local.calFull;
  const mon = C.startOfWeek(d);
  const wt = C.weekType(S.settings(), mon);
  const tplId = C.templateForWeek(S.settings(), mon);
  const grid = v !== 'm' && v !== 'a';
  return `<div class="cal ${panelOpen ? 'panel-open' : ''} ${full ? 'is-full' : ''}">
    ${sideHtml()}
    <section class="cal-main">
      <div class="cal-bar">
        <button class="icon-btn panel-tg" data-act="panel" aria-label="Seitenleiste" title="Einplanen & Kalender">${icon('menu')}${nPlan ? `<span class="badge soft">${nPlan > 99 ? '99+' : nPlan}</span>` : ''}</button>
        <button class="btn sm" data-act="today">Heute</button>
        <button class="icon-btn" data-act="prev" aria-label="Zurück">${icon('left')}</button>
        <button class="icon-btn" data-act="next" aria-label="Weiter">${icon('right')}</button>
        <h2>${esc(title(v, d))}${wt && v !== 'm' && v !== 'a' ? ` <span class="wtype ${wt}" title="Wochenregel">${wt === 'ferien' ? 'Ferien' : wt.toUpperCase() + '-Woche'}</span>` : ''}</h2>
        <div class="cal-tools">
          <button class="btn sm ${tplId ? 'btn-primary' : ''}" data-act="planweek" title="Woche aus Vorlage planen (P)">${icon('calendar', 13)}<span class="hide-s">Woche planen</span></button>
          <button class="icon-btn" data-act="templates" title="Vorlagen & Regeln (O)" aria-label="Vorlagen">${icon('layers', 17)}</button>
          ${grid ? `<button class="icon-btn" data-act="zoom" title="Stundenhöhe und Nacht" aria-label="Zoom">${icon('sort', 17)}</button>` : ''}
          <button class="icon-btn ${full ? 'on' : ''}" data-act="full" title="${full ? 'Vollbild verlassen' : 'Vollbild'} (V)" aria-label="Vollbild">${icon('expand', 17)}</button>
        </div>
        <div class="seg vsel" data-viewseg role="group" aria-label="Ansicht"><span class="seg-thumb"></span>${viewsHtml}</div>
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
  if (key === 't') { setCur(A.now()); firstScroll = true; A.render(); return true; }
  if (key === 'j' || key === 'ArrowRight') { step(1); return true; }
  if (key === 'k' || key === 'ArrowLeft') { step(-1); return true; }
  const map = { d: 'd', w: 'w', m: 'm', a: 'a', x: '3' };
  if (map[key]) { setView(map[key]); A.nav('#/kalender/' + VIEW_ROUTE[map[key]]); return true; }
  return false;
}
export function toggleSqueeze() {
  const on = calS().squeeze !== false;
  S.setSettingPath('cal.squeeze', !on);
  toast(on ? 'Nachtstunden in voller Höhe' : `Nacht gestaucht (${calS().nightFrom ?? 22}–${calS().nightTo ?? 5} Uhr)`, { ms: 1600 });
}
function zoomPopover(anchor) {
  const c = calS();
  const html = `<div><b>Darstellung</b><div class="tiny muted" style="margin:2px 0 10px">Gilt auf diesem Gerät</div>
    <div class="col" style="gap:4px">${ZOOMS.map(([k, l]) => `<button class="btn sm ${zoomMode() === k ? 'btn-primary' : ''}" data-z="${k}" style="justify-content:flex-start">${l}${k === 'fit' ? '<span class="tiny" style="margin-left:auto;opacity:.75">0–24 Uhr ohne Scrollen</span>' : ''}</button>`).join('')}</div>
    <label class="optrow" style="margin-top:12px"><span class="grow">Nacht stauchen</span><label class="switch sm"><input type="checkbox" data-sq ${c.squeeze !== false ? 'checked' : ''}><span class="tr"></span></label></label>
    <div class="row" style="gap:6px;margin-top:6px"><span class="small muted">von</span><input class="input sm" type="number" min="0" max="23" data-nf value="${c.nightFrom ?? 22}" style="width:4rem"><span class="small muted">bis</span><input class="input sm" type="number" min="0" max="23" data-nt value="${c.nightTo ?? 5}" style="width:4rem"><span class="small muted">Uhr</span></div></div>`;
  popover(anchor, html, {
    width: 270, place: 'below',
    onMount: (el, close) => {
      el.addEventListener('click', e => { const z = e.target.closest('[data-z]'); if (z) { S.local.calHour = z.dataset.z; S.saveLocal(); fitPx = 0; firstScroll = true; close(); A.render(); } });
      el.addEventListener('change', e => {
        if (e.target.matches('[data-sq]')) S.setSettingPath('cal.squeeze', e.target.checked);
        if (e.target.matches('[data-nf]')) S.setSettingPath('cal.nightFrom', Math.max(0, Math.min(23, Number(e.target.value) || 0)));
        if (e.target.matches('[data-nt]')) S.setSettingPath('cal.nightTo', Math.max(0, Math.min(23, Number(e.target.value) || 0)));
      });
    },
  });
}

/* ---------------- Popover für Termine ---------------- */
function themeSuggestions(ev) {
  const now = A.now();
  const s = S.settings();
  const list = S.openTasks(t => (ev.cat ? t.cat === ev.cat : (t.area || 'p') === (ev.area || 'p')) && C.statusOf(t) !== 'wartet' && !planned(t));
  sortTasks(list, now);
  return list.sort((a, b) => C.quadrant(a, now, s) - C.quadrant(b, now, s)).slice(0, 5);
}
function eventPopover(anchor, ev, occStart) {
  const col = evColor(ev);
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
  const done = boxDone(ev);
  const lk = ev.link && ev.link.id ? S.get(ev.link.c, ev.link.id) : null;
  const tpl = ev.fromTpl ? S.get('templates', ev.fromTpl) : null;
  const sug = ev.theme ? themeSuggestions(ev) : [];
  const lkDone = lk && ev.link.c === 'habits' && C.habitDoneOn(lk, C.ymd(occ));
  const html = `<div class="ev-pop">
    <div class="ep-tools">
      <button class="icon-btn sm" data-pact="edit" aria-label="Bearbeiten" title="Bearbeiten">${icon('edit', 17)}</button><button class="icon-btn sm" data-pact="del" aria-label="Löschen" title="Löschen">${icon('trash', 17)}</button>
      <button class="icon-btn sm" data-pact="close" aria-label="Schließen">${icon('x', 17)}</button>
    </div>
    <div class="ep-head"><span class="ep-sq" style="background:${col}"></span><div><h3 style="${done ? 'text-decoration:line-through' : ''}">${esc(ev.title)}</h3><div class="small muted" style="margin-top:2px">${esc(when)}</div>
      ${ev.rec && ev.rec.f ? `<div class="small muted">${esc(C.describeRule(ev.rec, ev.s))}</div>` : ''}</div></div>
    ${ev.theme ? `<div class="ep-line">${icon('layers', 17)}<span>Themenblock – Hintergrundfläche für passende Vorgänge</span></div>` : ''}
    ${ev.loc ? `<div class="ep-line">${icon('pin', 17)}<span>${esc(ev.loc)}</span></div>` : ''}
    ${ev.notes ? `<div class="ep-line">${icon('notes', 17)}<span style="white-space:pre-wrap;max-height:120px;overflow:auto">${esc(ev.notes)}</span></div>` : ''}
    <div class="ep-line">${icon('calendar', 17)}<span>${esc(areaName(ev.area))}${c ? ` · ${esc(c.name)}` : ''}${ev.taskId ? ' · Zeitblock' : ''}${tpl ? ` · aus Vorlage „${esc(tpl.name)}“` : ev.fromCopy ? ' · kopiert' : ''}</span></div>
    ${ev.rem && ev.rem.length ? `<div class="ep-line">${icon('bell', 17)}<span>${ev.rem.map(m => m === 0 ? 'Zum Beginn' : m >= 60 ? C.fmtDuration(m) + ' vorher' : m + ' Min vorher').join(', ')}</span></div>` : ''}
    ${lk ? `<div class="ep-line">${icon('link', 17)}<span class="grow">${esc(C.LINKABLE[ev.link.c].name)}: <b>${esc(C.titleOf(ev.link.c, lk))}</b>${lkDone ? ' <span class="muted">· heute erledigt</span>' : ''}</span></div>
      <div class="row" style="margin-top:10px;justify-content:flex-end">${ev.link.c === 'habits' && lk.kind === 'routine' ? `<button class="btn sm btn-primary" data-pact="routine">${icon('play', 12)}Routine starten</button>` : ev.link.c === 'habits' ? `<button class="btn sm btn-primary" data-pact="habit">${icon('check', 12)}${lkDone ? 'Ansehen' : 'Abhaken'}</button>` : `<button class="btn sm" data-pact="link">Öffnen</button>`}</div>` : ''}
    ${tk ? `<div class="ep-line">${icon('link', 17)}<span class="grow">Vorgang: ${esc(tk.title)} <span class="muted">(${esc(C.STATUS[C.statusOf(tk)].name)})</span></span></div>
      <div class="row" style="margin-top:12px;justify-content:flex-end;flex-wrap:wrap"><button class="btn sm" data-pact="task">Vorgang öffnen</button>${!C.isClosed(tk) ? `<button class="btn sm" data-pact="focus">${icon('play', 12)}Fokus</button>${done ? '' : `<button class="btn sm btn-primary" data-pact="done">${icon('check', 13)}Erledigt</button>`}` : ''}</div>` : ''}
    ${ev.theme ? `<div class="ep-sug"><div class="lbl">Passt in diesen Block</div>${sug.length ? sug.map(t => `<div class="ep-s">${ampDot(ampLevel(t))}<span class="grow ellip">${esc(t.title)}</span><button class="btn sm" data-tplan="${t.id}" title="In diesem Block einplanen">${icon('bolt', 12)}Einplanen</button></div>`).join('') : '<div class="tiny muted">Keine offenen Vorgänge in dieser Kategorie.</div>'}</div>` : ''}
  </div>`;
  popover(anchor, html, {
    width: 360, place: 'side',
    onMount: (el, close) => {
      el.addEventListener('click', async e => {
        const tp = e.target.closest('[data-tplan]');
        if (tp) {
          const t = S.task(tp.dataset.tplan); if (!t) return;
          const day = C.startOfDay(occ);
          const from = Math.max(C.minutesOfDay(occ), C.sameDay(occ, A.now()) ? C.minutesOfDay(A.now()) + 5 : 0);
          const st = freeInRange(day, boxLen(t), from, C.minutesOfDay(end) || 1440);
          if (!st) { toast('In diesem Block ist keine freie Zeit mehr'); return; }
          close(); doPlan(t, st, boxLen(t));
          return;
        }
        const b = e.target.closest('[data-pact]'); if (!b) return;
        const a = b.dataset.pact;
        if (a === 'close') close();
        if (a === 'edit') { close(); openEventEditor(ev.id, {}, ev.rec && ev.rec.f ? occ : null); }
        if (a === 'del') { close(); await deleteEventFlow(ev, ev.rec && ev.rec.f ? occ : null); }
        if (a === 'task') { close(); A.openTask(tk.id); }
        if (a === 'focus') { close(); A.startFocus(tk.id, { autostart: true }); }
        if (a === 'done') { close(); await completeBox(ev); }
        if (a === 'routine') { close(); A.startRoutine(lk.id, C.ymd(occ)); }
        if (a === 'habit') { close(); A.nav('#/gewohnheiten?h=' + lk.id); }
        if (a === 'link') { close(); A.openItem(ev.link.c, ev.link.id); }
      });
    },
  });
}
/** freie Zeit innerhalb eines Zeitfensters (für Themenblöcke) */
function freeInRange(day, dur, fromMin, toMin) {
  let t = Math.ceil(fromMin / 15) * 15;
  const busy = busyIntervals(day, true);
  for (const [a, b] of busy) {
    if (b <= t) continue;
    if (a - t >= dur) break;
    t = Math.max(t, Math.ceil(b / 15) * 15);
  }
  return t + dur <= toMin ? C.addMinutes(day, t) : null;
}

async function completeBox(ev) {
  if (!ev.taskId) return;
  if (boxDone(ev)) { toast('Dieser Zeitblock ist schon erledigt'); return; }
  const t = S.task(ev.taskId);
  if (!t) return;
  const ok = await A.completeTask(t.id);
  if (ok) { const cur2 = S.event(ev.id); if (cur2) S.put('events', { ...cur2, boxDone: true }); }
}

/* ---------------- Einplanen (Popover / mobil) ---------------- */
function planPopover(anchor, t) {
  const dur0 = boxLen(t);
  const now = A.now();
  const opts = [];
  const today = freeSlot(C.startOfDay(now), dur0, C.minutesOfDay(now) + 5);
  if (today) opts.push(['Heute', today]);
  const tm = freeSlot(C.addDays(C.startOfDay(now), 1), dur0, 0);
  if (tm) opts.push(['Morgen', tm]);
  const sel = getCur();
  if (!C.sameDay(sel, now) && !C.sameDay(sel, C.addDays(now, 1))) { const x = freeSlot(sel, dur0, 0); if (x) opts.push([C.WD_SHORT[C.wdIdx(sel)] + ' ' + sel.getDate() + '.', x]); }
  const DUR = [15, 30, 45, 60, 90, 120, 180];
  const html = `<div>
    <div class="row" style="align-items:flex-start;margin-bottom:10px"><b class="grow" style="line-height:1.35">${esc(t.title)}</b><button class="icon-btn sm" data-pp="close" aria-label="Schließen">${icon('x', 15)}</button></div>
    <div class="lbl" style="margin-bottom:6px">Dauer</div>
    <div class="chips" data-ppdur>${DUR.map(m => `<button class="chip ${m === dur0 ? 'on' : ''}" data-d="${m}">${C.fmtDurShort(m)}</button>`).join('')}</div>
    <div class="lbl" style="margin:12px 0 6px">Nächste freie Zeit</div>
    <div class="col" style="gap:6px" data-ppopts>${opts.map(([l, d], i) => `<button class="btn" style="justify-content:flex-start" data-slot="${i}">${icon('bolt', 14)}${esc(l)}, ${C.hm(d)} Uhr</button>`).join('') || '<span class="small muted">In den nächsten Tagen ist im Planungsfenster nichts mehr frei.</span>'}</div>
    <div class="lbl" style="margin:12px 0 6px">Oder selbst wählen</div>
    <div class="row"><input class="input" type="date" data-ppd value="${C.ymd(today || now)}" aria-label="Tag"><input class="input" type="time" data-ppt value="${today ? C.hm(today) : '09:00'}" step="900" aria-label="Uhrzeit" style="width:110px"></div>
    <div class="row" style="justify-content:space-between;margin-top:14px"><button class="btn sm btn-ghost" data-pp="open">Vorgang öffnen</button><button class="btn sm btn-primary" data-pp="set">Einplanen</button></div>
  </div>`;
  popover(anchor, html, {
    width: 320, place: isMobile() ? 'below' : 'side',
    onMount: (el, close) => {
      let dur = dur0;
      let slots = opts.map(o => o[1]);
      el.addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.d) {
          dur = Number(b.dataset.d);
          el.querySelectorAll('[data-d]').forEach(x => x.classList.toggle('on', x === b));
          // freie Zeiten für die neue Dauer neu suchen
          slots = slots.map(s0 => freeSlot(C.startOfDay(s0), dur, C.sameDay(s0, now) ? C.minutesOfDay(now) + 5 : 0));
          el.querySelectorAll('[data-slot]').forEach((x, i) => { const s1 = slots[i]; if (s1) x.innerHTML = `${icon('bolt', 14)}${esc(opts[i][0])}, ${C.hm(s1)} Uhr`; x.disabled = !s1; });
          return;
        }
        if (b.dataset.slot !== undefined) { const s1 = slots[Number(b.dataset.slot)]; if (s1) { close(); doPlan(t, s1, dur); } return; }
        if (b.dataset.pp === 'close') close();
        if (b.dataset.pp === 'open') { close(); A.openTask(t.id); }
        if (b.dataset.pp === 'set') {
          const d = el.querySelector('[data-ppd]').value, tm2 = el.querySelector('[data-ppt]').value || '09:00';
          const st = d ? C.parseLocal(d + 'T' + tm2) : null;
          if (!st) return;
          close(); doPlan(t, st, dur);
        }
      });
    },
  });
}

/* ---------------- Schnell anlegen ---------------- */
function quickCreate(anchor, startDate, endDate, allDay = false) {
  let kind = 'event';
  let area = A.area() === 'all' ? 'p' : A.area();
  const when = allDay ? C.fmtDateLong(startDate) : `${C.fmtDateShort(startDate)}, ${C.hm(startDate)} – ${C.hm(endDate)}`;
  const html = `<div>
    <input class="input title-in" data-q="title" placeholder="Titel hinzufügen" aria-label="Titel" style="font-size:18px">
    <div class="chips" style="margin:10px 0"><button class="chip on" data-kind="event">Termin</button>${allDay ? '' : '<button class="chip" data-kind="theme" title="Dezente Fläche im Hintergrund, z. B. Vertrieb">Themenblock</button>'}<button class="chip" data-kind="task">Vorgang einplanen</button></div>
    <div class="small row" style="margin-bottom:10px;gap:6px;color:var(--ink-2)">${icon('clock', 14)}<span>${esc(when)}</span></div>
    <div class="row" style="gap:8px;flex-wrap:wrap">
      <div class="seg seg-area" data-areaseg><span class="seg-thumb"></span><button data-area="p" aria-pressed="${area === 'p'}">Privat</button><button data-area="b" aria-pressed="${area === 'b'}">Geschäftlich</button></div>
      <span data-qcat class="grow">${catSelect(area, null, 'data-q="cat" style="height:30px"')}</span>
    </div>
    <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn sm btn-ghost" data-q="more">Weitere Optionen</button><button class="btn sm btn-primary" data-q="save">Speichern</button></div>
  </div>`;
  popover(anchor, html, {
    width: 360, place: 'side',
    onMount: (el, close) => {
      const inp = el.querySelector('[data-q="title"]');
      setTimeout(() => inp.focus(), 30);
      requestAnimationFrame(() => placeThumb(el.querySelector('[data-areaseg]')));
      const cat = () => { const v = el.querySelector('[data-q="cat"]').value; return v && v !== '__new' ? v : null; };
      const save = (more) => {
        const title = inp.value.trim();
        if (!title && !more) { inp.focus(); return; }
        if (kind === 'event' || kind === 'theme') {
          const p = { title, area, cat: cat(), allDay, theme: kind === 'theme', s: allDay ? C.ymd(startDate) : C.fmtLocal(startDate), e: allDay ? C.ymd(startDate) : C.fmtLocal(endDate) };
          close();
          if (more) { openEventEditor(null, p); return; }
          S.put('events', { ...p, loc: '', notes: '', rem: kind === 'theme' ? [] : null, rec: null });
          toast(kind === 'theme' ? 'Themenblock erstellt' : 'Termin erstellt');
        } else {
          const dur = allDay ? null : Math.round((endDate - startDate) / C.MIN);
          const base = { title, area, cat: cat(), type: 'aufgabe', prio: 3, imp: true, urg: false, autoUrg: true, esc: true, due: C.ymd(startDate), dueTime: null, dur, subs: [], people: [], log: [] };
          close();
          if (more || allDay) { A.newTask(base); return; }
          const t = S.put('tasks', { ...base, status: 'neu', no: S.nextTicketNo() });
          createTimebox(t, startDate, dur);
          toast(`Vorgang #${String(t.no).padStart(4, '0')} angelegt und eingeplant`);
          warnLoad(startDate);
        }
      };
      el.addEventListener('change', async e => {
        const s0 = e.target.closest('[data-q="cat"]');
        if (s0 && s0.value === '__new') await handleNewOption(s0, 'cat', area);
      });
      el.addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.kind) { kind = b.dataset.kind; el.querySelectorAll('[data-kind]').forEach(x => x.classList.toggle('on', x === b)); inp.placeholder = kind === 'task' ? 'Was willst du in dieser Zeit erledigen?' : kind === 'theme' ? 'Thema, z. B. Vertrieb' : 'Titel hinzufügen'; inp.focus(); }
        if (b.dataset.area) {
          area = b.dataset.area; el.querySelectorAll('[data-area]').forEach(x => x.setAttribute('aria-pressed', x === b)); placeThumb(el.querySelector('[data-areaseg]'));
          el.querySelector('[data-qcat]').innerHTML = catSelect(area, null, 'data-q="cat" style="height:30px"');
        }
        if (b.dataset.q === 'save') save(false);
        if (b.dataset.q === 'more') save(true);
      });
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') save(false); });
    },
  });
}

function dayPopover(anchor, k) {
  const day = C.parseYmd(k);
  const occ = C.expandEvents(visibleEvents(), day, C.addDays(day, 1));
  const tks = visibleTasks(k);
  const html = `<div><div class="row" style="margin-bottom:8px"><b class="grow">${esc(C.fmtDateLong(day))}</b><button class="btn sm" data-goto-day="${k}">Tag öffnen</button></div>
    ${occ.map(o => `<div class="age" data-eid="${o.ev.id}" data-occ="${o.start.getTime()}"><span class="dot" style="background:${evColor(o.ev)}"></span><span class="tm">${o.ev.allDay ? 'Ganztägig' : C.hm(o.start)}</span><span class="grow">${esc(o.ev.title)}</span></div>`).join('')}
    ${tks.map(t => `<div class="age" data-task="${t.id}"><span class="dot" style="background:transparent;border:2px solid ${taskColor(t)}"></span><span class="tm">${t.dueTime || 'fällig'}</span><span class="grow">${esc(t.title)}</span></div>`).join('')}</div>`;
  popover(anchor, html, {
    width: 320, place: 'below',
    onMount: (el, close) => el.addEventListener('click', e => {
      const r = e.target.closest('[data-eid]');
      if (r) { const ev = S.event(r.dataset.eid); close(); if (ev) setTimeout(() => eventPopover(anchor, ev, r.dataset.occ), 0); return; }
      const d = e.target.closest('[data-goto-day]');
      if (d) { close(); setCur(C.parseYmd(d.dataset.gotoDay)); setView('d'); A.nav('#/kalender/tag'); }
    }),
  });
}

function areaColorPopover(anchor, a) {
  const curC = (calS()[a]) || (a === 'b' ? '#3f51b5' : '#039be5');
  const html = `<div><b>${esc(areaName(a))}</b><div class="small muted" style="margin:2px 0 10px">Farbe für Termine ohne Kategorie</div>
    <div class="color-pick">${C.CAT_COLORS.map(c => `<button style="background:${c}" class="${c.toLowerCase() === curC.toLowerCase() ? 'on' : ''}" data-col="${c}" aria-label="${c}"></button>`).join('')}<input type="color" value="${curC}" data-colin aria-label="Eigene Farbe"></div></div>`;
  popover(anchor, html, {
    width: 260, place: 'below',
    onMount: (el, close) => {
      const set = c => { S.setSettingPath('cal.' + a, c); close(); };
      el.addEventListener('click', e => { const b = e.target.closest('[data-col]'); if (b) set(b.dataset.col); });
      el.querySelector('[data-colin]').addEventListener('change', e => set(e.target.value));
    },
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
    if (zoomMode() === 'fit' && !isMobile()) {
      const hgt = scroller.clientHeight;
      if (hgt > 100 && Math.abs(hgt - (fitPx || 0)) > 3 && !mount._refit) { fitPx = hgt; mount._refit = true; requestAnimationFrame(() => { A.render(); mount._refit = false; }); }
    } else if (firstScroll) {
      const now = A.now();
      const s = S.settings();
      const { start, days } = rangeFor(view(), getCur());
      const showsToday = now >= start && now < C.addDays(start, days);
      const h = showsToday ? Math.max(0, now.getHours() - 2) : (s.dayStart ?? 7);
      scroller.scrollTop = sc().y(h * 60);
      firstScroll = false;
    }
  }

  root.addEventListener('click', async e => {
    const t = e.target;
    const b = t.closest('button');
    if (b && b.dataset.view) { setView(b.dataset.view); A.nav('#/kalender/' + VIEW_ROUTE[b.dataset.view]); return; }
    if (b && b.dataset.act === 'today') { setCur(A.now()); firstScroll = true; A.render(); return; }
    if (b && b.dataset.act === 'planweek') { planWeek(getCur()); return; }
    if (b && b.dataset.act === 'templates') { openTemplates(getCur()); return; }
    if (b && b.dataset.act === 'zoom') { zoomPopover(b); return; }
    if (b && b.dataset.act === 'full') { A.toggleCalFull(); return; }
    if (b && b.dataset.evroutine) { e.stopPropagation(); const h = S.get('habits', b.dataset.evroutine); const evEl = b.closest('[data-occ]'); const day = evEl ? C.ymd(new Date(Number(evEl.dataset.occ))) : C.ymd(A.now()); if (h && h.kind === 'routine') A.startRoutine(h.id, day); else if (h) A.nav('#/gewohnheiten?h=' + h.id); return; }
    if (b && b.dataset.act === 'prev') return step(-1);
    if (b && b.dataset.act === 'next') return step(1);
    if (b && b.dataset.act === 'panel') { panelOpen = !panelOpen; root.querySelector('.cal').classList.toggle('panel-open', panelOpen); return; }
    if (b && b.dataset.act === 'create') { const st = C.setTime(getCur(), `${Math.min(22, A.now().getHours() + 1)}:00`); openEventEditor(null, { s: C.fmtLocal(st), e: C.fmtLocal(C.addMinutes(st, 60)) }); return; }
    if (b && b.dataset.act === 'newcat') { const area = A.area() === 'all' ? 'p' : A.area(); await editCategory(null, { area }); return; }
    if (b && b.dataset.editcat) { const c = S.cat(b.dataset.editcat); if (c) await editCategory(c); return; }
    if (b && b.dataset.areacolor) { areaColorPopover(b, b.dataset.areacolor); return; }
    if (b && b.dataset.autoplan) {
      const tk = S.task(b.dataset.autoplan); if (!tk) return;
      const st = nextFree(boxLen(tk));
      if (!st) { toast('In den nächsten zwei Wochen ist im Planungsfenster nichts frei'); return; }
      doPlan(tk, st, boxLen(tk));
      return;
    }
    if (b && b.dataset.boxdone) { const ev = S.event(b.dataset.boxdone); if (ev) await completeBox(ev); return; }
    if (b && b.dataset.mini) { miniMonth = C.addMonths(miniMonth, Number(b.dataset.mini)); const box = root.querySelector('.minical'); box.outerHTML = miniCal(miniMonth); return; }
    if (b && b.dataset.goto) { setCur(C.parseYmd(b.dataset.goto)); firstScroll = true; if (isMobile()) { panelOpen = false; } A.render(); return; }
    const gd = t.closest('[data-goto-day]');
    if (gd) { closePopover(); setCur(C.parseYmd(gd.dataset.gotoDay)); setView('d'); A.nav('#/kalender/tag'); return; }
    if (b && b.dataset.more) { e.stopPropagation(); dayPopover(b, b.dataset.more); return; }
    const pi = t.closest('[data-plan]');
    if (pi && !pi._dragged) { const tk = S.task(pi.dataset.plan); if (tk) planPopover(pi, tk); return; }
    if (root.querySelector('.month') && !t.closest('[data-eid],[data-task],button')) {
      const cell = t.closest('[data-mday]');
      if (cell) { const d = C.parseYmd(cell.dataset.mday); quickCreate(cell, C.setTime(d, '09:00'), C.setTime(d, '10:00'), true); return; }
    }
    if (root.querySelector('.agenda-list')) {
      const ev = t.closest('[data-eid]');
      if (ev) { const x = S.event(ev.dataset.eid); if (x) eventPopover(ev, x, ev.dataset.occ); }
    }
    const adcol = t.closest('.tg-adcol');
    if (adcol && !t.closest('[data-eid],[data-task]')) { const d = C.parseYmd(adcol.dataset.adDay); quickCreate(adcol, d, d, true); return; }
    const chip = t.closest('.chipev[data-eid]');
    if (chip && !t.closest('.month-g')) { const x = S.event(chip.dataset.eid); if (x) eventPopover(chip, x, chip.dataset.occ); }
  });

  root.addEventListener('change', e => {
    const l = e.target.dataset && e.target.dataset.layer;
    if (l) { S.local.calLayers = { ...layers(), [l]: e.target.checked }; S.saveLocal(); A.render(); return; }
    const h = e.target.dataset && e.target.dataset.calhide;
    if (h) { const H = { ...hidden() }; if (e.target.checked) delete H[h]; else H[h] = true; S.local.calHidden = H; S.saveLocal(); A.render(); }
  });

  if (scroller) bindGridDrag(root, scroller, signal);
  // Wischen (Handy): links/rechts blättert
  const swipeEl = scroller || root.querySelector('.month-g') || root.querySelector('.agenda-list');
  if (swipeEl) {
    let sx = null, sy = 0;
    swipeEl.addEventListener('touchstart', e => { if (e.touches.length !== 1) { sx = null; return; } sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true, signal });
    swipeEl.addEventListener('touchend', e => {
      if (sx === null || A.dragging) { sx = null; return; }
      const t = e.changedTouches[0]; const dx = t.clientX - sx, dy = t.clientY - sy; sx = null;
      if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.6) step(dx < 0 ? 1 : -1);
    }, { passive: true, signal });
  }
  const mg = root.querySelector('.month-g');
  if (mg) bindMonthDrag(mg, signal);
  bindPlanDrag(root, signal);
}

function snap(m, step = 15) { return Math.round(m / step) * step; }

/* Vorgang aus „Zum Einplanen“ in den Kalender ziehen */
function bindPlanDrag(root, signal) {
  const side = root.querySelector('.cal-side');
  if (!side) return;
  let st = null;
  side.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    const it = e.target.closest('[data-plan]');
    if (!it || e.target.closest('button')) return;
    st = { id: e.pointerId, it, x0: e.clientX, y0: e.clientY, touch: e.pointerType !== 'mouse', moved: false, active: false };
    it._dragged = false;
    if (st.touch) st.timer = setTimeout(() => { if (st && !st.moved) { st.active = true; vibrate(15); begin(); } }, 380);
  });
  side.addEventListener('touchmove', e => { if (st && st.active) e.preventDefault(); }, { passive: false });
  const begin = () => {
    const t = S.task(st.it.dataset.plan); if (!t) { st = null; return; }
    st.t = t; st.dur = boxLen(t);
    st.ghost = document.createElement('div'); st.ghost.className = 'plan-ghost'; st.ghost.textContent = t.title;
    document.body.appendChild(st.ghost);
    st.it.style.opacity = '.4';
    A.dragging = true;
    if (window.innerWidth <= 1180) { root.querySelector('.cal').classList.remove('panel-open'); }
  };
  window.addEventListener('pointermove', e => {
    if (!st || e.pointerId !== st.id) return;
    if (!st.moved && Math.hypot(e.clientX - st.x0, e.clientY - st.y0) > 6) {
      st.moved = true;
      if (!st.touch) { st.active = true; begin(); } else if (!st.active) { clearTimeout(st.timer); st = null; return; }
    }
    if (!st || !st.active || !st.ghost) return;
    e.preventDefault();
    st.ghost.style.left = (e.clientX + 12) + 'px'; st.ghost.style.top = (e.clientY - 14) + 'px';
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const col = el && el.closest('.tg-col');
    const ad = el && el.closest('[data-ad-day], [data-mday]');
    if (st.prev && (!col || st.prev.parentElement !== col)) { st.prev.remove(); st.prev = null; }
    root.querySelectorAll('.drop-hint').forEach(x => x !== ad && x.classList.remove('drop-hint'));
    st.target = null;
    if (col) {
      const r = col.getBoundingClientRect();
      const m = Math.max(0, Math.min(1440 - st.dur, Math.floor(sc().min(e.clientY - r.top) / 15) * 15));
      if (!st.prev) { st.prev = document.createElement('div'); st.prev.className = 'ev sel-preview'; col.appendChild(st.prev); }
      st.prev.style.top = sc().y(m) + 'px';
      st.prev.style.height = Math.max(sc().minH, sc().y(m + st.dur) - sc().y(m) - 1) + 'px';
      st.prev.innerHTML = `<b>${esc(st.t.title)}</b><span class="et">${C.pad(Math.floor(m / 60))}:${C.pad(m % 60)}–${C.pad(Math.floor((m + st.dur) / 60) % 24)}:${C.pad((m + st.dur) % 60)}</span>`;
      st.target = { kind: 'time', day: col.dataset.day, m };
    } else if (ad) {
      ad.classList.add('drop-hint');
      st.target = { kind: 'day', day: ad.dataset.adDay || ad.dataset.mday };
    }
  }, { passive: false, signal });
  const end = (e, cancel) => {
    if (!st || e.pointerId !== st.id) return;
    const s0 = st; st = null; clearTimeout(s0.timer);
    A.dragging = false;
    if (s0.ghost) s0.ghost.remove();
    if (s0.prev) s0.prev.remove();
    root.querySelectorAll('.drop-hint').forEach(x => x.classList.remove('drop-hint'));
    s0.it.style.opacity = '';
    if (s0.moved) { s0.it._dragged = true; setTimeout(() => { s0.it._dragged = false; }, 50); }
    if (cancel || !s0.active || !s0.target || !s0.t) { if (s0.active) A.render(); return; }
    if (s0.target.kind === 'time') doPlan(s0.t, C.addMinutes(C.parseYmd(s0.target.day), s0.target.m), s0.dur);
    else {
      const t = S.task(s0.t.id);
      S.put('tasks', C.addLog({ ...t, due: s0.target.day, snooze: null }, `Fällig gesetzt auf ${C.fmtDateShort(C.parseYmd(s0.target.day))}`, 'system'));
      toast(`Fällig am ${C.fmtDateShort(C.parseYmd(s0.target.day))}`);
    }
  };
  window.addEventListener('pointerup', e => end(e, false), { signal });
  window.addEventListener('pointercancel', e => end(e, true), { signal });
}

function bindGridDrag(root, scroller, signal) {
  const grid = scroller.querySelector('.tg-grid');
  let st = null;
  const colAt = (x) => {
    const cols = [...grid.querySelectorAll('.tg-col')];
    for (const c of cols) { const r = c.getBoundingClientRect(); if (x >= r.left && x < r.right) return c; }
    return x < cols[0].getBoundingClientRect().left ? cols[0] : cols[cols.length - 1];
  };
  const minAt = (col, y) => { const r = col.getBoundingClientRect(); return Math.max(0, Math.min(1440, sc().min(y - r.top))); };

  grid.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    if (e.target.closest('.tk, .focusblk, button')) return;
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
      st.evEl.style.top = sc().y(ns) + 'px';
      if (!st.evEl.classList.contains('theme-tab')) { st.evEl.style.left = '1px'; st.evEl.style.width = 'calc(100% - 8px)'; st.evEl.style.height = Math.max(sc().minH, sc().y(ns + len) - sc().y(ns) - 1) + 'px'; }
      else st.evEl.style.height = Math.max(sc().minH, sc().y(ns + len) - sc().y(ns)) + 'px';
      const et = st.evEl.querySelector('.et');
      if (et) et.textContent = `${C.pad(Math.floor(ns / 60))}:${C.pad(ns % 60)}–${C.pad(Math.floor((ns + len) / 60) % 24)}:${C.pad((ns + len) % 60)}`;
    } else if (st.mode === 'resize') {
      let ne = snap(minAt(st.col, e.clientY));
      ne = Math.max(st.sm + 15, Math.min(1440, ne));
      st.ne = ne;
      st.evEl.style.height = Math.max(sc().minH, sc().y(ne) - sc().y(st.sm) - 1) + 'px';
      const et = st.evEl.querySelector('.et');
      if (et) et.textContent = `${C.pad(Math.floor(st.sm / 60))}:${C.pad(st.sm % 60)}–${C.pad(Math.floor(ne / 60) % 24)}:${C.pad(ne % 60)}`;
    } else if (st.mode === 'create' && !st.touch) {
      const m1 = minAt(st.col, e.clientY);
      const a = Math.floor(Math.min(st.m0, m1) / 15) * 15, b = Math.max(a + 15, Math.ceil(Math.max(st.m0, m1) / 15) * 15);
      st.a = a; st.b = b;
      if (!st.prev) { st.prev = document.createElement('div'); st.prev.className = 'ev sel-preview'; st.col.appendChild(st.prev); }
      st.prev.style.top = sc().y(a) + 'px';
      st.prev.style.height = Math.max(sc().minH, sc().y(b) - sc().y(a)) + 'px';
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
      if (s0.evEl) { const ev = S.event(s0.evEl.dataset.eid); if (ev) eventPopover(s0.evEl, ev, s0.evEl.dataset.occ); }
      else {
        const m = Math.floor(s0.m0 / 30) * 30;
        const start = C.addMinutes(day, m);
        quickCreate({ x: e.clientX, y: e.clientY }, start, C.addMinutes(start, 60), false);
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
    toast(`${ev.taskId ? 'Zeitblock' : 'Termin'}: ${C.WD_SHORT[C.wdIdx(newStart)]} ${C.fmtDateShort(newStart)}${ev.allDay ? '' : ', ' + C.hm(newStart) + '–' + C.hm(newEnd)}`, { action: 'Rückgängig', onAction: () => { const x = S.event(ev.id); if (x) S.put('events', { ...x, s: prev.s, e: prev.e }); } });
    if (!ev.allDay && C.ymd(newStart) !== C.ymd(occ)) warnLoad(newStart);
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
      if (st.active) { st.ghost = st.chip.cloneNode(true); st.ghost.style.cssText += ';position:fixed;z-index:120;pointer-events:none;width:' + st.chip.offsetWidth + 'px;box-shadow:var(--shadow-pop);background:var(--surface)'; document.body.appendChild(st.ghost); st.chip.style.opacity = '.35'; }
    }
    if (!st || !st.active || !st.ghost) return;
    e.preventDefault();
    A.dragging = true;
    st.ghost.style.left = (e.clientX - 20) + 'px'; st.ghost.style.top = (e.clientY - 10) + 'px';
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const cell = el && el.closest('[data-mday]');
    mg.querySelectorAll('.mcell.drop-hint').forEach(x => x !== cell && x.classList.remove('drop-hint'));
    if (cell) { cell.classList.add('drop-hint'); st.target = cell; }
  }, { passive: false, signal });
  const end = (e, cancel) => {
    if (!st || e.pointerId !== st.id) return;
    const s0 = st; st = null; clearTimeout(s0.timer);
    A.dragging = false;
    if (s0.ghost) s0.ghost.remove();
    mg.querySelectorAll('.mcell.drop-hint').forEach(x => x.classList.remove('drop-hint'));
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
  if (nl) nl.style.top = sc().y(C.minutesOfDay(A.now())) + 'px';
}
export { planned as isPlanned, nextFree };
/** Vorgang einplanen (Popover mit freien Zeiten) – z. B. aus der Matrix, Quadrant 2 */
export function planTaskPopover(anchor, t) { if (!t) return; planPopover(anchor || { x: window.innerWidth / 2, y: window.innerHeight / 3 }, t); }
export function planTaskById(id) { const t = S.task(id); if (t) planPopover({ x: window.innerWidth / 2, y: window.innerHeight / 3 }, t); }
/** Pixel-Position einer Uhrzeit im Raster (für Tests und Hilfsfunktionen) */
export function yOfMin(m) { return sc().y(m); }
