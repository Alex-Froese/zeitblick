// Ampel-Board: Aufgaben als Tickets nach Eskalationsstufe
import * as C from '../core.js';
import * as S from '../store.js';
import { esc, icon } from '../ui.js';
import { A } from '../app-api.js';
import { taskMeta, sortTasks, catColor } from './common.js';

let catFilter = null;

export function render() {
  const now = A.now();
  const s = S.settings();
  const area = A.area();
  const open = S.tasks(t => !t.done && S.inArea(t, area) && (!catFilter || t.cat === catFilter));
  const cols = { green: [], yellow: [], red: [], alarm: [] };
  for (const t of open) { const l = C.ampel(t, now, s).level; (cols[l === 'none' ? 'green' : l]).push(t); }
  for (const k of Object.keys(cols)) cols[k] = sortTasks(cols[k], now);
  const def = [
    ['alarm', 'Alarm', `Überfällig seit mehr als ${s.amp.alarmH} Std (P1 schneller). Push alle ${s.amp.repeatH} Std, rotes Vollbild beim Öffnen.`],
    ['red', 'Überfällig', 'Frist verpasst. Wiederholte Push-Erinnerungen.'],
    ['yellow', 'Bald fällig', `Fällig in weniger als ${s.amp.yellowH} Std.`],
    ['green', 'Im Plan', 'Genug Zeit oder ohne Frist.'],
  ];
  const cats = S.cats(area);
  return `
  <div class="page-head"><div class="grow"><h1>Ampel & Tickets</h1><div class="page-sub">Jede Aufgabe ist ein Ticket. Je näher die Frist, desto höher die Stufe. Ab Rot eskaliert Zeitblick mit Benachrichtigungen, die bleiben, bis du sie entfernst.</div></div>
    <a class="btn sm" href="#/einstellungen/ampel">${icon('settings', 15)}Stufen einstellen</a></div>
  <div class="chips scroll" style="margin-bottom:14px">
    <button class="chip ${!catFilter ? 'on' : ''}" data-fcat="">Alle Kategorien</button>
    ${cats.map(c => `<button class="chip ${catFilter === c.id ? 'on' : ''}" data-fcat="${c.id}"><i class="cdot" style="background:${catColor(c)}"></i>${esc(c.icon || '')} ${esc(c.name)}</button>`).join('')}
  </div>
  <div class="board">
    ${def.map(([k, name, sub]) => `<section class="bcol ${k}">
      <div class="bcol-h"><i class="amp ${k}"></i>${name}<span class="n">${cols[k].length}</span></div>
      <div class="tiny muted" style="padding:0 4px 10px">${esc(sub)}</div>
      ${cols[k].map(t => `<button class="ticket ${k}" data-task="${t.id}">
        <div class="tno">#${String(t.no || 0).padStart(4, '0')} <span class="amp ${k}" style="width:8px;height:8px"></span> P${t.prio || 3}</div>
        <div class="tt">${esc(t.title)}</div>
        <div class="tmeta">${taskMeta(t)}</div>
      </button>`).join('') || '<div class="tiny muted" style="padding:6px 4px">Keine Tickets</div>'}
    </section>`).join('')}
  </div>`;
}

export function mount(root) {
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-fcat]');
    if (b) { catFilter = b.dataset.fcat || null; A.render(); }
  });
}
