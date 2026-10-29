// Rückblicke – geführter Tagesabschluss, Wochen- und Monatsrückblick, Archiv
import * as C from '../core.js';
import * as S from '../store.js';
import * as F from '../focus-engine.js';
import { esc, icon, sheet, toast, burst, isMobile, confirmDialog } from '../ui.js';
import { A } from '../app-api.js';
import { columns } from '../charts.js';
import { emptyState, catColor, progressBar } from './common.js';
import { habitCellState, toggleHabit } from './habits.js';
import { markRead } from './notes.js';
import { writeSection, journalNote } from '../journal.js';
import * as Cal from './calendar.js';

const MOODS = ['😞', '🙁', '😐', '🙂', '😄'];
const ENERGY = ['Leer', 'Müde', 'Okay', 'Gut', 'Voller Energie'];
const LABELS = {
  good: 'Was lief gut?', busy: 'Was hat dich beschäftigt?', thanks: 'Wofür bist du dankbar?', learned: 'Was nimmst du mit?',
  wins: 'Erfolge der Woche', hard: 'Was war schwierig?', lesson: 'Was lernst du daraus?',
  high: 'Highlights des Monats', insight: 'Erkenntnisse', resolve: 'Vorsätze für den nächsten Monat', goalsNext: 'Was willst du als Nächstes erreichen?',
};
let filterType = '';

function periodOf(type, d) {
  if (type === 'week') { const s = C.startOfWeek(d); return [s, C.addDays(s, 7)]; }
  if (type === 'month') { const s = C.startOfMonth(d); return [s, C.addMonths(s, 1)]; }
  const s = C.startOfDay(d); return [s, C.addDays(s, 1)];
}
export function periodLabel(type, key) {
  if (type === 'week') { const [y, w] = key.split('-W'); return `KW ${Number(w)} / ${y}`; }
  if (type === 'month') { const [y, m] = key.split('-'); return `${C.MONTHS[Number(m) - 1]} ${y}`; }
  const d = C.parseYmd(key); return `${C.WD_LONG[C.wdIdx(d)]}, ${C.fmtDateShort(d)}`;
}

/* ---------------- Statistiken ---------------- */
function statsFor(type, d) {
  const [a, b] = periodOf(type, d);
  const days = Math.round((b - a) / C.DAY);
  const data = S.getData();
  const keys = [...Array(days)].map((_, i) => C.ymd(C.addDays(a, i)));
  const doneMap = {};
  for (const t of S.tasks()) {
    if (C.statusOf(t) === 'erledigt' && t.doneAt) { const k = C.ymd(new Date(t.doneAt)); doneMap[k] = (doneMap[k] || 0) + 1; }
    for (const h of t.hist || []) doneMap[h] = (doneMap[h] || 0) + 1;
  }
  const focus = {};
  for (const f of S.focusSessions(x => x.ok)) { const k = C.ymd(new Date(f.s)); focus[k] = (focus[k] || 0) + (f.min || 0); }
  let hDue = 0, hDone = 0;
  const now = A.now();
  for (const h of S.habits(x => !x.archived)) for (const k of keys) { const dd = C.parseYmd(k); if (dd > now || !C.habitDueOn(h, dd)) continue; hDue++; if (C.habitDoneOn(h, k)) hDone++; }
  const dayRevs = S.reviews(r => r.type === 'day' && keys.includes(r.key));
  const moods = dayRevs.map(r => r.data && r.data.mood).filter(Boolean);
  return {
    keys, a, b,
    done: keys.reduce((s0, k) => s0 + (doneMap[k] || 0), 0), doneBy: keys.map(k => doneMap[k] || 0),
    focus: keys.reduce((s0, k) => s0 + (focus[k] || 0), 0), focusBy: keys.map(k => Math.round(focus[k] || 0)),
    habitRate: hDue ? hDone / hDue : null,
    reviewsDone: dayRevs.filter(r => r.done).length,
    mood: moods.length ? moods.reduce((s0, x) => s0 + x, 0) / moods.length : null,
    moodBy: keys.map(k => { const r = dayRevs.find(x => x.key === k); return r && r.data ? r.data.mood || 0 : 0; }),
    data,
  };
}

/* ---------------- Schritte ---------------- */
function moodPick(name, v, list) {
  return `<div class="mood" data-pick="${name}">${list.map((x, i) => `<button type="button" class="${v === i + 1 ? 'on' : ''}" data-v="${i + 1}" title="${esc(name === 'mood' ? ['Schlecht', 'Eher schlecht', 'Neutral', 'Gut', 'Sehr gut'][i] : ENERGY[i])}">${name === 'energy' ? `<i style="height:${(i + 1) * 20}%"></i><span>${esc(x)}</span>` : x}</button>`).join('')}</div>`;
}
function ta(rec, key, ph = '', rows = 3) { return `<div class="field"><label>${esc(LABELS[key] || key)}</label><textarea class="textarea" data-rf="${key}" rows="${rows}" placeholder="${esc(ph)}">${esc((rec.data || {})[key] || '')}</textarea></div>`; }

function stepTag(rec, d) {
  const now = A.now();
  const ag = C.agendaFor(S.getData(), d, now);
  const done = ag.items.filter(x => x.done);
  const st = statsFor('day', d);
  const occ = C.expandEvents(S.events(), C.startOfDay(d), C.addDays(C.startOfDay(d), 1)).filter(o => !o.ev.allDay && !o.ev.theme);
  return `<h2 class="rv-h">Wie war dein Tag?</h2>
    <div class="rv-stats"><div><b>${ag.done}/${ag.total}</b><span>Verbindliches erledigt</span></div><div><b>${st.done}</b><span>Vorgänge erledigt</span></div><div><b>${esc(C.fmtDurShort(st.focus))}</b><span>Fokus</span></div><div><b>${occ.length}</b><span>Termine</span></div></div>
    ${done.length ? `<div class="rv-done">${done.slice(0, 14).map(x => `<span class="chip on">${icon('check', 11)}${esc(x.title)}</span>`).join('')}${done.length > 14 ? `<span class="chip">+${done.length - 14}</span>` : ''}</div>` : '<p class="small muted">Heute wurde noch nichts abgehakt – auch das darf mal so sein.</p>'}
    <div class="section-t">Stimmung</div>${moodPick('mood', (rec.data || {}).mood, MOODS)}
    <div class="section-t">Energie</div>${moodPick('energy', (rec.data || {}).energy, ENERGY)}`;
}

function stepOffen(rec, d) {
  const now = A.now();
  const k = C.ymd(d);
  const ag = C.agendaFor(S.getData(), d, now);
  const open = ag.items.filter(x => !x.done);
  const tasks = open.filter(x => x.kind === 'task' || x.kind === 'multi');
  const habits = open.filter(x => x.kind === 'habit' || x.kind === 'routine');
  const notes = open.filter(x => x.kind === 'note');
  const inbox = S.inboxItems().length;
  if (!tasks.length && !habits.length && !notes.length) return `<h2 class="rv-h">Was ist offen?</h2>${emptyState('🎉', 'Alles erledigt', 'Für heute ist nichts mehr offen. Stark!')}${inbox ? `<p class="small muted" style="text-align:center">In der Inbox warten ${inbox} Gedanken – die kannst du morgen einsortieren.</p>` : ''}`;
  return `<h2 class="rv-h">Was ist offen?</h2><p class="small muted">Nichts verschwindet stillschweigend: Entscheide für jedes, wie es weitergeht.</p>
    ${tasks.length ? `<div class="section-t">Vorgänge</div>${tasks.map(x => `<div class="rv-row"><div class="grow"><div class="lt">${esc(x.title)}</div><div class="lm">${x.overdue ? '<span class="over">überfällig</span>' : ''}${x.kind === 'multi' ? `<span>${x.prog[0]}/${x.prog[1]} heute</span>` : ''}</div></div>
      <div class="rv-acts"><button class="btn sm" data-mv="${x.id}" data-to="1">Morgen</button><button class="btn sm" data-mv="${x.id}" data-to="7">Nächste Woche</button><button class="btn sm" data-rdone="${x.id}">${icon('check', 12)}Erledigt</button><button class="btn sm btn-ghost" data-rdisc="${x.id}" title="Verwerfen">${icon('trash', 12)}</button></div></div>`).join('')}` : ''}
    ${habits.length ? `<div class="section-t">Gewohnheiten & Routinen nachtragen</div><div class="hb-grid">${habits.map(x => { const st = habitCellState(x.rec, k); return `<div class="hb-i"><button class="hcell ${st.cls}" data-habit="${x.id}" data-day="${k}" aria-label="${esc(x.title)}">${st.label}</button><span class="grow ellip">${esc(x.title)}</span>${x.prog ? `<span class="tiny muted">${x.prog[0]}/${x.prog[1]}</span>` : ''}</div>`; }).join('')}</div>` : ''}
    ${notes.length ? `<div class="section-t">Noch einprägen</div>${notes.map(x => `<div class="rv-row"><div class="grow"><div class="lt">${esc(x.title)}</div><div class="lm ellip">${esc(String(x.rec.body || '').replace(/\s+/g, ' ').slice(0, 140))}</div></div><button class="btn sm" data-nread="${x.id}">${icon('check', 12)}Gelesen</button></div>`).join('')}` : ''}
    ${inbox ? `<p class="small muted" style="margin-top:12px">${icon('inbox', 13)} In der Inbox warten ${inbox} Gedanken.</p>` : ''}`;
}

function stepJournal(rec, d) {
  const jn = journalNote(C.ymd(d));
  const own = jn && String(jn.body || '').replace(/## Tagesabschluss[\s\S]*?(?=\n## |$)/, '').trim();
  return `<h2 class="rv-h">Journal</h2><p class="small muted">Ein paar ehrliche Sätze reichen. Das landet in deinem Journal von heute.</p>
    ${own ? `<details class="rv-own"><summary>Was du heute schon ins Journal geschrieben hast</summary><div class="note-body small">${esc(own).replace(/\n/g, '<br>')}</div></details>` : ''}
    ${ta(rec, 'good', 'Drei Dinge, die gut waren …')}${ta(rec, 'busy', 'Was ging dir durch den Kopf?')}${ta(rec, 'thanks', 'Ich bin dankbar für …', 2)}${ta(rec, 'learned', 'Eine Erkenntnis, ein Satz', 2)}`;
}

function stepMorgen(rec, d) {
  const tm = C.addDays(C.startOfDay(d), 1);
  const tk = C.ymd(tm);
  const occ = C.expandEvents(S.events(), tm, C.addDays(tm, 1)).filter(o => !o.ev.theme).sort((a, b) => a.start - b.start);
  const due = S.openTasks(t => t.due === tk);
  const ag = C.agendaFor(S.getData(), tm, A.now());
  const habitsN = ag.items.filter(x => x.kind === 'habit' || x.kind === 'routine').length;
  const top = (rec.data || {}).top || ['', '', ''];
  const open = S.openTasks().slice(0, 300);
  const sug = S.openTasks(t => !t.due || t.due > tk).sort((a, b) => C.quadrant(a, A.now(), S.settings()) - C.quadrant(b, A.now(), S.settings()) || (a.prio || 3) - (b.prio || 3)).slice(0, 6);
  return `<h2 class="rv-h">Morgen, ${esc(C.fmtDateShort(tm))}</h2>
    <div class="rv-stats"><div><b>${occ.length}</b><span>Termine</span></div><div><b>${due.length}</b><span>Vorgänge fällig</span></div><div><b>${habitsN}</b><span>Gewohnheiten & Routinen</span></div></div>
    ${occ.length ? `<div class="rv-tl">${occ.slice(0, 8).map(o => `<div><span class="num">${o.ev.allDay ? 'ganzt.' : C.hm(o.start)}</span><i style="background:${Cal.evColor(o.ev)}"></i><span class="ellip">${esc(o.ev.title)}</span></div>`).join('')}</div>` : ''}
    <div class="section-t">Die 3 wichtigsten Dinge für morgen</div>
    <datalist id="zb-rvtasks">${open.map(t => `<option value="${esc(t.title)}">`).join('')}</datalist>
    ${[0, 1, 2].map(i => `<div class="rv-top"><span class="n">${i + 1}</span><input class="input" data-top="${i}" list="zb-rvtasks" value="${esc(top[i] || '')}" placeholder="${i === 0 ? 'Das Wichtigste zuerst' : ''}"></div>`).join('')}
    ${sug.length ? `<div class="chips" style="margin-top:6px">${sug.map(t => `<button type="button" class="chip" data-sug="${esc(t.title)}">${icon('plus', 11)}${esc(t.title)}</button>`).join('')}</div>` : ''}
    <p class="hint">Was zu einem offenen Vorgang passt, wird auf morgen gelegt. Neues wird als Vorgang für morgen angelegt.</p>`;
}

function stepZahlen(rec, d, type) {
  const st = statsFor(type, d);
  const lbl = st.keys.map(k => { const x = C.parseYmd(k); return type === 'week' ? C.WD_SHORT[C.wdIdx(x)] : String(x.getDate()); });
  return `<h2 class="rv-h">${type === 'week' ? 'Deine Woche' : 'Dein Monat'} in Zahlen</h2>
    <div class="rv-stats"><div><b>${st.done}</b><span>Vorgänge erledigt</span></div><div><b>${esc(C.fmtDurShort(st.focus))}</b><span>Fokus</span></div><div><b>${st.habitRate == null ? '–' : Math.round(st.habitRate * 100) + '%'}</b><span>Gewohnheiten</span></div><div><b>${st.mood ? MOODS[Math.round(st.mood) - 1] : '–'}</b><span>Stimmung Ø</span></div><div><b>${st.reviewsDone}</b><span>Tagesabschlüsse</span></div></div>
    <div class="section-t">Erledigt je Tag</div>${columns(st.doneBy.map((v, i) => ({ label: lbl[i], v })), { height: 110, ariaLabel: 'Erledigt je Tag' })}
    <div class="section-t">Fokus je Tag</div>${columns(st.focusBy.map((v, i) => ({ label: lbl[i], v })), { height: 90, unit: ' Min', minMax: 60, color: 'var(--ok)', ariaLabel: 'Fokus je Tag' })}
    ${habitsTable(st, type)}`;
}
function habitsTable(st, type) {
  const now = A.now();
  const list = S.habits(h => !h.archived).map(h => {
    let due = 0, done = 0;
    for (const k of st.keys) { const dd = C.parseYmd(k); if (dd > now || !C.habitDueOn(h, dd)) continue; due++; if (C.habitDoneOn(h, k)) done++; }
    return { h, due, done };
  }).filter(x => x.due);
  if (!list.length) return '';
  return `<div class="section-t">Gewohnheiten ${type === 'week' ? 'diese Woche' : 'im Monat'}</div>${list.map(x => `<div class="rv-hab"><span class="grow ellip">${esc(x.h.title)}</span><span class="tiny muted">${x.done}/${x.due}</span>${progressBar(x.done / x.due)}</div>`).join('')}`;
}

function stepText(rec, keys, title, hint) { return `<h2 class="rv-h">${esc(title)}</h2>${hint ? `<p class="small muted">${esc(hint)}</p>` : ''}${keys.map(k => ta(rec, k)).join('')}`; }

function stepBereiche(rec, d, type) {
  const list = S.lifeAreas();
  if (!list.length) return `<h2 class="rv-h">Lebensbereiche</h2>${emptyState('🧭', 'Noch keine Lebensbereiche', 'Lege deine Säulen an, um sie regelmäßig zu bewerten.', '<a class="btn sm" href="#/lebensbereiche" data-close>Lebensbereiche anlegen</a>')}`;
  const r = (rec.data || {}).ratings || {};
  const [a] = periodOf(type, d);
  return `<h2 class="rv-h">Lebensbereiche bewerten</h2><p class="small muted">Wie zufrieden bist du gerade mit jedem Bereich? 1 = gar nicht, 10 = rundum.</p>
    ${list.map(l => { const last = C.lifeRating(l); const prev = (l.ratings || []).filter(x => x.d < C.ymd(a)).slice(-1)[0]; const v = r[l.id] ?? (last ? last.v : 5); return `<div class="rv-rate"><span class="ic">${esc(l.icon || '•')}</span><span class="grow ellip">${esc(l.name)}</span><input type="range" min="1" max="10" step="1" value="${v}" data-rate="${l.id}" aria-label="${esc(l.name)}"><b class="num" data-rv="${l.id}">${v}</b>${prev ? `<span class="tiny muted" title="Vorher">${prev.v > v ? '↓' : prev.v < v ? '↑' : '='}${prev.v}</span>` : '<span></span>'}</div>`; }).join('')}`;
}

function stepZiele(rec, d) {
  const goals = S.goals(g => !g.status || g.status === 'aktiv');
  const gn = (rec.data || {}).goals || {};
  return `<h2 class="rv-h">Ziele prüfen</h2>${goals.length ? goals.map(g => { const p = C.goalProgress(g, S.getData()); return `<div class="rv-goal"><div class="row"><b class="grow ellip">${esc(g.title)}</b><span class="tiny muted">${Math.round((p || 0) * 100)}%</span></div>${progressBar(p || 0)}<input class="input sm" data-goal="${g.id}" value="${esc(gn[g.id] || '')}" placeholder="Nächster Schritt dafür …"></div>`; }).join('') : emptyState('🎯', 'Keine aktiven Ziele', 'Ziele geben deinen Vorgängen Richtung.', '<a class="btn sm" href="#/ziele" data-close>Ziele</a>')}
    ${ta(rec, 'goalsNext', '', 2)}`;
}

function stepNaechste(rec, d) {
  const mon = C.addDays(C.startOfWeek(d), 7);
  const s = S.settings();
  const wt = C.weekType(s, mon);
  const tplId = C.templateForWeek(s, mon);
  const tpl = tplId ? S.get('templates', tplId) : null;
  const focus = (rec.data || {}).focus || ['', '', ''];
  const occ = C.expandEvents(S.events(e => !e.fromTpl && !e.theme), mon, C.addDays(mon, 7));
  return `<h2 class="rv-h">Nächste Woche · KW ${C.isoWeek(mon).week}</h2>
    <div class="rv-stats"><div><b>${wt === 'a' ? 'A' : wt === 'b' ? 'B' : wt === 'ferien' ? '🏖️' : '–'}</b><span>${wt === 'ferien' ? 'Ferienwoche' : wt ? 'Wochentyp' : 'kein Wochentyp'}</span></div><div><b>${occ.length}</b><span>feste Termine</span></div><div><b>${S.openTasks(t => t.due && t.due >= C.ymd(mon) && t.due < C.ymd(C.addDays(mon, 7))).length}</b><span>Vorgänge fällig</span></div></div>
    <div class="rv-plan"><div class="grow"><b>${tpl ? `Vorlage: ${esc(tpl.name)}` : 'Woche planen'}</b><div class="tiny muted">${tpl ? 'Passt laut deiner Regel zu dieser Woche.' : 'Wähle eine Vorlage oder kopiere eine Woche.'}</div></div><button class="btn sm btn-primary" data-planweek="${C.ymd(mon)}">${icon('calendar', 13)}Jetzt planen</button></div>
    <div class="section-t">Wochenfokus – worauf kommt es an?</div>
    ${[0, 1, 2].map(i => `<div class="rv-top"><span class="n">${i + 1}</span><input class="input" data-focus="${i}" value="${esc(focus[i] || '')}"></div>`).join('')}`;
}

function stepAbschluss(rec, d, type) {
  const x = rec.data || {};
  return `<h2 class="rv-h">Abschluss</h2>
    <div class="rv-sum">${x.mood ? `<div><span>Stimmung</span><b>${MOODS[x.mood - 1]}</b></div>` : ''}${x.energy ? `<div><span>Energie</span><b>${esc(ENERGY[x.energy - 1])}</b></div>` : ''}${(x.top || []).filter(Boolean).length ? `<div><span>Morgen</span><b>${(x.top || []).filter(Boolean).map(esc).join(' · ')}</b></div>` : ''}${(x.focus || []).filter(Boolean).length ? `<div><span>Wochenfokus</span><b>${(x.focus || []).filter(Boolean).map(esc).join(' · ')}</b></div>` : ''}</div>
    <div class="field" style="margin-top:14px"><label>${type === 'day' ? 'Dein Tag' : type === 'week' ? 'Deine Woche' : 'Dein Monat'} in einem Wort</label><input class="input" data-rf="word" value="${esc(x.word || '')}" placeholder="z. B. Durchbruch, zäh, ruhig …"></div>
    <p class="small muted">${type === 'day' ? 'Danke, dass du dir die Zeit genommen hast. Morgen geht es mit klarem Kopf weiter.' : 'Gut gemacht – Rückblicke sind das, was aus Erledigen Wachstum macht.'}</p>`;
}

const FLOWS = {
  day: [['tag', 'Tag', stepTag], ['offen', 'Offenes', stepOffen], ['journal', 'Journal', stepJournal], ['morgen', 'Morgen', stepMorgen], ['end', 'Abschluss', stepAbschluss]],
  week: [['zahlen', 'Zahlen', (r, d) => stepZahlen(r, d, 'week')], ['erfolge', 'Erfolge', r => stepText(r, ['wins', 'hard', 'lesson'], 'Erfolge und Erkenntnisse', 'Was hat diese Woche getragen, was hat gebremst?')], ['bereiche', 'Bereiche', (r, d) => stepBereiche(r, d, 'week')], ['ziele', 'Ziele', stepZiele], ['naechste', 'Nächste Woche', stepNaechste], ['end', 'Abschluss', (r, d) => stepAbschluss(r, d, 'week')]],
  month: [['zahlen', 'Zahlen', (r, d) => stepZahlen(r, d, 'month')], ['bereiche', 'Bereiche', (r, d) => stepBereiche(r, d, 'month')], ['ziele', 'Ziele', stepZiele], ['erk', 'Erkenntnisse', r => stepText(r, ['high', 'insight', 'resolve'], 'Erkenntnisse und Vorsätze', 'Was nimmst du aus diesem Monat mit?')], ['end', 'Abschluss', (r, d) => stepAbschluss(r, d, 'month')]],
};

/** Geführten Rückblick starten oder fortsetzen */
export function startReview(type = 'day', date) {
  if (!C.REVIEW_TYPES[type]) type = 'day';
  const now = A.now();
  let d = date ? new Date(date) : now;
  if (!date && type === 'day' && now.getHours() < 4 && !C.reviewDone(S.getData(), 'day', C.addDays(now, -1))) d = C.addDays(C.startOfDay(now), -1);
  if (!date && type === 'week' && C.wdIdx(now) < 3 && !C.reviewDone(S.getData(), 'week', C.addDays(now, -7))) d = C.addDays(now, -7);
  if (!date && type === 'month' && now.getDate() < 8 && !C.reviewDone(S.getData(), 'month', C.addMonths(now, -1))) d = C.addMonths(now, -1);
  const key = C.reviewKey(type, d);
  let rec = S.review(type, key) || S.put('reviews', { type, key, date: C.ymd(d), done: false, startedAt: Date.now(), step: 0, data: {} }, { noRender: true });
  const flow = FLOWS[type];
  let step = rec.done ? 0 : Math.min(rec.step || 0, flow.length - 1);
  const T = C.REVIEW_TYPES[type];
  sheet({
    title: `${T.icon} ${esc(T.name)} <span class="faint" style="font-weight:500">· ${esc(periodLabel(type, key))}</span>`, cls: 'sheet-review' + (isMobile() ? ' sheet-full' : ''),
    body: '<div class="rv-prog" data-prog></div><div class="rv-body" data-rbody></div>',
    footer: `<button class="btn btn-ghost" data-back>${icon('left', 14)}Zurück</button><span class="sp"></span><span class="tiny muted" data-saved>Wird automatisch gespeichert</span><button class="btn btn-primary" data-next>Weiter${icon('right', 14)}</button>`,
    onMount: (el, close) => {
      const body = el.querySelector('[data-rbody]');
      const draw = () => {
        rec = S.get('reviews', rec.id) || rec;
        el.querySelector('[data-prog]').innerHTML = flow.map((f, i) => `<button type="button" class="${i === step ? 'cur' : i < step ? 'on' : ''}" data-go="${i}"><i></i><span>${esc(f[1])}</span></button>`).join('');
        body.innerHTML = flow[step][2](rec, d);
        body.scrollTop = 0;
        el.querySelector('[data-back]').disabled = step === 0;
        const last = step === flow.length - 1;
        el.querySelector('[data-next]').innerHTML = last ? `${icon('check', 14)}${rec.done ? 'Speichern' : 'Abschließen'}` : `Weiter${icon('right', 14)}`;
      };
      const collect = () => {
        const x = { ...(rec.data || {}) };
        body.querySelectorAll('[data-rf]').forEach(i => { x[i.dataset.rf] = i.value; });
        if (body.querySelector('[data-top]')) x.top = [...body.querySelectorAll('[data-top]')].map(i => i.value.trim());
        if (body.querySelector('[data-focus]')) x.focus = [...body.querySelectorAll('[data-focus]')].map(i => i.value.trim());
        if (body.querySelector('[data-goal]')) { x.goals = { ...(x.goals || {}) }; body.querySelectorAll('[data-goal]').forEach(i => { x.goals[i.dataset.goal] = i.value.trim(); }); }
        if (body.querySelector('[data-rate]')) { x.ratings = { ...(x.ratings || {}) }; body.querySelectorAll('[data-rate]').forEach(i => { x.ratings[i.dataset.rate] = Number(i.value); }); }
        rec = S.put('reviews', { ...S.get('reviews', rec.id), data: x, step }, { noRender: true });
        const sv = el.querySelector('[data-saved]'); if (sv) { sv.textContent = 'Gespeichert ' + C.hm(new Date()); }
      };
      const applyStep = (id) => {
        const x = rec.data || {};
        if (id === 'journal' && type === 'day') {
          const txt = ['good', 'busy', 'thanks', 'learned'].filter(k => (x[k] || '').trim()).map(k => `**${LABELS[k]}**\n${x[k].trim()}`).join('\n\n');
          writeSection(C.ymd(d), 'Tagesabschluss', txt);
        }
        if (id === 'bereiche' && x.ratings) {
          const dk = C.ymd(type === 'day' ? d : A.now() < periodOf(type, d)[1] ? A.now() : C.addDays(periodOf(type, d)[1], -1));
          for (const [lid, v] of Object.entries(x.ratings)) {
            const l = S.get('life', lid); if (!l) continue;
            const ratings = (l.ratings || []).filter(r => r.d !== dk);
            ratings.push({ d: dk, v });
            S.put('life', { ...l, ratings: ratings.slice(-120) }, { noRender: true });
          }
        }
      };
      const finish = () => {
        const x = rec.data || {};
        const msgs = [];
        if (type === 'day' && (x.top || []).some(Boolean)) {
          const tk = C.ymd(C.addDays(C.startOfDay(d), 1));
          const applied = new Set(x.topApplied || []);
          for (const t0 of x.top.filter(Boolean)) {
            if (applied.has(t0)) continue;
            const hit = S.openTasks(t => C.norm(t.title) === C.norm(t0))[0];
            if (hit) { if (!hit.due || hit.due > tk) S.put('tasks', C.addLog({ ...hit, due: tk }, 'Im Tagesabschluss für morgen eingeplant', 'system'), { noRender: true }); }
            else S.put('tasks', { title: t0, due: tk, area: A.area() === 'b' ? 'b' : 'p', prio: 2, status: 'neu', type: 'aufgabe', log: [C.logEntry('Im Tagesabschluss angelegt', 'system')] }, { noRender: true });
            applied.add(t0);
          }
          x.topApplied = [...applied];
          msgs.push('Morgen ist vorbereitet');
        }
        if (type === 'day') {
          const head = [x.mood ? `Stimmung: ${MOODS[x.mood - 1]}` : '', x.energy ? `Energie: ${ENERGY[x.energy - 1]}` : '', x.word ? `In einem Wort: ${x.word}` : ''].filter(Boolean).join(' · ');
          const txt = [head, ...['good', 'busy', 'thanks', 'learned'].filter(k => (x[k] || '').trim()).map(k => `**${LABELS[k]}**\n${x[k].trim()}`), (x.top || []).some(Boolean) ? `**Morgen wichtig**\n${x.top.filter(Boolean).map((t, i) => `${i + 1}. ${t}`).join('\n')}` : ''].filter(Boolean).join('\n\n');
          writeSection(C.ymd(d), 'Tagesabschluss', txt);
        }
        S.put('reviews', { ...S.get('reviews', rec.id), data: x, done: true, doneAt: rec.doneAt || Date.now(), word: x.word || '', step: 0 });
        burst(el.querySelector('[data-next]'), 'var(--ok)');
        toast(`${T.name} abgeschlossen${msgs.length ? ' · ' + msgs.join(' · ') : ''}`);
        close();
      };
      el.addEventListener('click', async e => {
        const go = e.target.closest('[data-go]');
        if (go) { collect(); applyStep(flow[step][0]); step = Number(go.dataset.go); draw(); return; }
        if (e.target.closest('[data-back]')) { collect(); applyStep(flow[step][0]); step = Math.max(0, step - 1); draw(); return; }
        if (e.target.closest('[data-next]')) { collect(); applyStep(flow[step][0]); if (step === flow.length - 1) finish(); else { step++; collect(); draw(); } return; }
        const pk = e.target.closest('[data-pick] [data-v]');
        if (pk) { const name = pk.closest('[data-pick]').dataset.pick; const v = Number(pk.dataset.v); rec = S.put('reviews', { ...S.get('reviews', rec.id), data: { ...(rec.data || {}), [name]: v } }, { noRender: true }); pk.parentElement.querySelectorAll('[data-v]').forEach(b => b.classList.toggle('on', b === pk)); return; }
        const hb = e.target.closest('[data-habit]');
        if (hb) { toggleHabit(hb.dataset.habit, hb.dataset.day, hb); setTimeout(() => { if (flow[step][0] === 'offen') { collect(); draw(); } }, 250); return; }
        const nr = e.target.closest('[data-nread]');
        if (nr) { markRead(nr.dataset.nread); setTimeout(draw, 100); return; }
        const mv = e.target.closest('[data-mv]');
        if (mv) { const t = S.task(mv.dataset.mv); if (t) { const n = Number(mv.dataset.to); const due = n === 7 ? C.ymd(C.addDays(C.startOfWeek(C.addDays(d, 7)), 0)) : C.ymd(C.addDays(C.startOfDay(d), n)); S.put('tasks', C.addLog({ ...t, due, snooze: null }, `Im Rückblick verschoben auf ${C.fmtDue(due)}`, 'system'), { noRender: true }); toast(`Verschoben: ${esc(C.fmtDue(due))}`, { ms: 1500 }); draw(); } return; }
        const rd = e.target.closest('[data-rdone]');
        if (rd) { const id = rd.dataset.rdone; const t = S.task(id); if (t && t.multi && t.multi.on) await A.multiTick(id, rd); else await A.completeTask(id, rd); draw(); return; }
        const rx = e.target.closest('[data-rdisc]');
        if (rx) { await A.discardTask(rx.dataset.rdisc); draw(); return; }
        const sg = e.target.closest('[data-sug]');
        if (sg) { const empty = [...body.querySelectorAll('[data-top]')].find(i => !i.value.trim()); if (empty) { empty.value = sg.dataset.sug; sg.remove(); collect(); } else toast('Alle drei Plätze sind belegt'); return; }
        const pw = e.target.closest('[data-planweek]');
        if (pw) { collect(); Cal.planWeek(C.parseYmd(pw.dataset.planweek)); return; }
        if (e.target.closest('a[data-close]')) close();
      });
      el.addEventListener('input', e => { const r = e.target.closest('[data-rate]'); if (r) { const b = body.querySelector(`[data-rv="${r.dataset.rate}"]`); if (b) b.textContent = r.value; } });
      el.addEventListener('focusout', e => { if (e.target.matches('textarea, input')) collect(); });
      draw();
    },
    onClose: () => { A.render(); },
  });
}

/* ---------------- Archiv ---------------- */
function detailHtml(r) {
  const T = C.REVIEW_TYPES[r.type];
  const x = r.data || {};
  const rows = [];
  if (x.mood) rows.push(['Stimmung', MOODS[x.mood - 1]]);
  if (x.energy) rows.push(['Energie', ENERGY[x.energy - 1]]);
  if (x.word) rows.push(['In einem Wort', esc(x.word)]);
  for (const k of ['good', 'busy', 'thanks', 'learned', 'wins', 'hard', 'lesson', 'high', 'insight', 'resolve', 'goalsNext']) if ((x[k] || '').trim()) rows.push([LABELS[k], esc(x[k]).replace(/\n/g, '<br>')]);
  if ((x.top || []).some(Boolean)) rows.push(['Für morgen', x.top.filter(Boolean).map(esc).join('<br>')]);
  if ((x.focus || []).some(Boolean)) rows.push(['Wochenfokus', x.focus.filter(Boolean).map(esc).join('<br>')]);
  if (x.ratings) rows.push(['Lebensbereiche', Object.entries(x.ratings).map(([id, v]) => { const l = S.get('life', id); return l ? `${esc(l.icon || '')} ${esc(l.name)}: <b>${v}</b>` : ''; }).filter(Boolean).join(' · ')]);
  if (x.goals) rows.push(['Ziele', Object.entries(x.goals).filter(([, v]) => v).map(([id, v]) => { const g = S.get('goals', id); return g ? `<b>${esc(g.title)}</b>: ${esc(v)}` : ''; }).filter(Boolean).join('<br>')]);
  return `<div class="page page-narrow">
    <div class="page-head"><div class="grow"><a class="small" href="#/rueckblick">${icon('left', 12)} Alle Rückblicke</a><h1>${T.icon} ${esc(T.name)}</h1><div class="psub">${esc(periodLabel(r.type, r.key))} · ${r.done ? 'abgeschlossen ' + esc(C.fmtRelTime(r.doneAt)) : 'Entwurf'}</div></div>
      <div class="page-actions"><button class="btn" data-redo="${r.id}">${icon('edit', 14)}${r.done ? 'Bearbeiten' : 'Fortsetzen'}</button><button class="btn btn-ghost" data-rvdel="${r.id}" title="Löschen">${icon('trash', 14)}</button></div></div>
    <div class="card">${rows.length ? `<div class="rv-detail">${rows.map(([k, v]) => `<div class="k">${esc(k)}</div><div class="v">${v}</div>`).join('')}</div>` : '<p class="muted small">Noch keine Inhalte.</p>'}</div>
    ${r.type === 'day' && journalNote(r.key) ? `<a class="btn sm" href="#/notizen/${journalNote(r.key).id}" style="margin-top:12px">${icon('book', 13)}Journal dieses Tages</a>` : ''}
  </div>`;
}

export function render(route) {
  const id = route.parts[0];
  if (id) { const r = S.get('reviews', id); if (r) return detailHtml(r); }
  const now = A.now();
  const s = S.settings();
  const rv = s.review || {};
  const due = C.reviewsDueOn(s, now);
  const all = S.reviews().sort((a, b) => (b.key.length === a.key.length ? b.key.localeCompare(a.key) : (b.doneAt || b.startedAt || 0) - (a.doneAt || a.startedAt || 0)));
  const list = filterType ? all.filter(r => r.type === filterType) : all;
  const st = statsFor('month', C.addDays(now, -29));
  const last30 = [...Array(30)].map((_, i) => C.ymd(C.addDays(C.startOfDay(now), i - 29)));
  const dayRevs = Object.fromEntries(S.reviews(r => r.type === 'day').map(r => [r.key, r]));
  const moodItems = last30.map(k => { const r = dayRevs[k]; const v = r && r.data && r.data.mood || 0; const d = C.parseYmd(k); return { label: d.getDate() % 5 === 0 ? String(d.getDate()) : '', v, tip: `${C.fmtDateShort(d)}: ${v ? MOODS[v - 1] : 'kein Abschluss'}` }; });
  const byMonth = {};
  for (const r of list) { const m = (r.date || r.key).slice(0, 7); (byMonth[m] = byMonth[m] || []).push(r); }
  const dueHtml = due.map(x => { const done = C.reviewDone(S.getData(), x.type, now); return `<div class="rv-due ${done ? 'done' : ''}"><span class="ic">${C.REVIEW_TYPES[x.type].icon}</span><div class="grow"><b>${esc(C.REVIEW_TYPES[x.type].name)}</b><div class="tiny muted">heute ${esc(x.time)} Uhr${done ? ' · erledigt' : ''}</div></div>${done ? icon('check', 15) : `<button class="btn sm btn-primary" data-start="${x.type}">Starten</button>`}</div>`; }).join('');
  void st;
  return `<div class="page">
    <div class="page-head"><div class="grow"><h1>Rückblicke</h1><div class="psub">Täglich abschließen, wöchentlich ausrichten, monatlich wachsen.</div></div>
      <div class="page-actions"><button class="btn" data-start="day">🌙 Tag</button><button class="btn" data-start="week">🗓️ Woche</button><button class="btn" data-start="month">🏔️ Monat</button></div></div>
    <div class="grid g2">
      <div class="card"><div class="card-head"><h2>Heute</h2><a class="link" href="#/einstellungen/rueckblicke">Zeiten ändern</a></div>${dueHtml}
        <div class="tiny muted" style="margin-top:8px">Rhythmus: täglich ${esc(rv.dayTime || '21:00')} · ${esc(C.WD_LONG[Number(rv.weekDay ?? 6)])} ${esc(rv.weekTime || '18:00')} Wochenrückblick · Monatsende ${esc(rv.monthTime || '18:00')}</div></div>
      <div class="card"><div class="card-head"><h2>Stimmung · 30 Tage</h2><span class="small muted">${Object.keys(dayRevs).filter(k => last30.includes(k) && dayRevs[k].done).length} Abschlüsse</span></div>${columns(moodItems, { height: 90, minMax: 5, fmt: v => v ? MOODS[Math.min(4, Math.max(0, Math.round(v) - 1))] : '', color: 'var(--warn)', ariaLabel: 'Stimmung' })}</div>
    </div>
    <div class="row" style="margin:18px 0 8px"><div class="section-t grow" style="margin:0">Archiv</div><div class="chips">${[['', 'Alle'], ['day', 'Tage'], ['week', 'Wochen'], ['month', 'Monate']].map(([k, l]) => `<button class="chip ${filterType === k ? 'on' : ''}" data-ft="${k}">${l}</button>`).join('')}</div></div>
    ${list.length ? Object.entries(byMonth).map(([m, rs]) => `<div class="card pad-sm rv-month"><div class="rv-mh">${esc(C.MONTHS[Number(m.slice(5)) - 1])} ${m.slice(0, 4)}</div>${rs.map(r => { const x = r.data || {}; return `<a class="rv-li" href="#/rueckblick/${r.id}"><span class="ic">${C.REVIEW_TYPES[r.type].icon}</span><span class="grow"><b>${esc(periodLabel(r.type, r.key))}</b><span class="tiny muted"> · ${esc(C.REVIEW_TYPES[r.type].short)}</span></span>${x.mood ? `<span>${MOODS[x.mood - 1]}</span>` : ''}${r.word ? `<span class="rv-word">${esc(r.word)}</span>` : ''}${r.done ? '' : '<span class="pill st-wartet">Entwurf</span>'}</a>`; }).join('')}</div>`).join('')
      : `<div class="card">${emptyState('🌙', 'Noch keine Rückblicke', 'Starte heute Abend deinen ersten Tagesabschluss – etwa 10 Minuten, geführt Schritt für Schritt.', '<button class="btn btn-primary" data-start="day">Tagesabschluss starten</button>')}</div>`}
  </div>`;
}

export function mount(root) {
  root.addEventListener('click', async e => {
    const s0 = e.target.closest('[data-start]');
    if (s0) { startReview(s0.dataset.start); return; }
    const ft = e.target.closest('[data-ft]');
    if (ft) { filterType = ft.dataset.ft; A.render(); return; }
    const re = e.target.closest('[data-redo]');
    if (re) { const r = S.get('reviews', re.dataset.redo); if (r) startReview(r.type, C.parseYmd(r.date || C.ymd(A.now()))); return; }
    const del = e.target.closest('[data-rvdel]');
    if (del) { const r = S.get('reviews', del.dataset.rvdel); if (!r) return; if (await confirmDialog(`${esc(C.REVIEW_TYPES[r.type].name)} vom ${esc(periodLabel(r.type, r.key))} löschen? Das Journal bleibt erhalten.`, { ok: 'Löschen', danger: true, title: 'Rückblick löschen?', cooldown: 3 })) { const prev = S.remove('reviews', r.id); A.nav('#/rueckblick'); toast('Gelöscht', { action: 'Rückgängig', onAction: () => S.restore('reviews', prev) }); } }
  });
  void catColor; void F;
}
