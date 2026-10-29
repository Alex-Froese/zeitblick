// Verlauf – ein zentraler Strom über alles: Vorgänge, Notizen, Gewohnheiten, Termine, Fokus, Rückblicke, Kontakte
import * as C from '../core.js';
import * as S from '../store.js';
import { esc, icon, debounce } from '../ui.js';
import { A } from '../app-api.js';
import { emptyState, catColor } from './common.js';

const TYPES = {
  task: { name: 'Vorgänge', icon: 'list' }, note: { name: 'Notizen', icon: 'notes' }, habit: { name: 'Gewohnheiten', icon: 'repeat' },
  event: { name: 'Termine', icon: 'calendar' }, focus: { name: 'Fokus', icon: 'focus' }, review: { name: 'Rückblicke', icon: 'book' },
  person: { name: 'Kontakte', icon: 'person' }, inbox: { name: 'Inbox', icon: 'inbox' },
};
const RANGES = [['1', 'Heute'], ['7', '7 Tage'], ['30', '30 Tage'], ['90', '3 Monate'], ['365', 'Jahr'], ['all', 'Alles']];
const st = { range: '7', types: new Set(), cat: '', life: '', person: '', q: '', limit: 300 };

function collect(now) {
  const out = [];
  const cut = st.range === 'all' ? 0 : C.startOfDay(C.addDays(now, -(Number(st.range) - 1))).getTime();
  const add = e => { if (e.at >= cut && e.at <= now.getTime() + C.MIN) out.push(e); };
  const want = t => !st.types.size || st.types.has(t);
  if (want('task')) for (const t of S.tasks()) {
    const base = { type: 'task', open: ['tasks', t.id], area: t.area, cat: t.cat, life: C.lifeOfTask ? C.lifeOfTask(t, S.getData()) : null, people: t.people || [], ttl: t.title };
    if (t.createdAt) add({ ...base, at: t.createdAt, text: 'Vorgang angelegt' });
    for (const l of t.log || []) if (l.at) add({ ...base, at: l.at, text: l.text, kind: l.kind });
  }
  if (want('note')) for (const n of S.notes()) {
    const base = { type: 'note', open: ['notes', n.id], area: n.area, life: n.life, people: n.people || [], ttl: n.title || 'Ohne Titel' };
    if (n.createdAt) add({ ...base, at: n.createdAt, text: `${C.NOTE_KINDS[C.noteKind(n)].name} angelegt` });
    if (n.updatedAt && n.createdAt && n.updatedAt - n.createdAt > 5 * C.MIN) add({ ...base, at: n.updatedAt, text: 'Zuletzt bearbeitet' });
  }
  if (want('habit')) for (const h of S.habits()) {
    const base = { type: 'habit', open: ['habits', h.id], area: h.area, cat: h.cat, life: h.life, people: [], ttl: h.title };
    const runs = new Map((h.runs || []).map(r => [r.d, r]));
    for (const [k, v] of Object.entries(h.log || {})) {
      if (!C.habitDoneOn(h, k) && !(typeof v === 'number')) continue;
      const r = runs.get(k);
      const at = r ? r.at : C.setTime(C.parseYmd(k), h.time || '12:00').getTime();
      add({ ...base, at, dayOnly: !r, text: h.kind === 'routine' ? (r ? `Routine abgeschlossen in ${C.fmtDuration(Math.max(1, Math.round(r.dur / 60)))}` : 'Routine erledigt') : typeof v === 'number' ? `Eingetragen: ${v} ${h.unit || ''}`.trim() : 'Abgehakt' });
    }
  }
  if (want('event')) {
    const from = new Date(Math.max(cut, now.getTime() - 400 * C.DAY));
    for (const o of C.expandEvents(S.events(e => !e.theme), from, now)) {
      if (o.start > now) continue;
      add({ type: 'event', open: ['events', o.ev.id], area: o.ev.area, cat: o.ev.cat, people: [], ttl: o.ev.title, at: o.start.getTime(), allDay: o.ev.allDay, text: o.ev.allDay ? 'Ganztägig' : `${C.hm(o.start)}–${C.hm(o.end)}${o.ev.loc ? ' · ' + o.ev.loc : ''}` });
    }
  }
  if (want('focus')) for (const f of S.focusSessions()) {
    const t = f.taskId ? S.task(f.taskId) : null;
    add({ type: 'focus', open: t ? ['tasks', t.id] : null, area: f.area, cat: f.cat, people: [], ttl: t ? t.title : 'Fokuseinheit', at: f.s, text: `${f.ok ? 'Fokus' : 'Abgebrochen'} · ${C.fmtDuration(Math.round(f.min || 0))}` });
  }
  if (want('review')) for (const r of S.reviews(x => x.done)) add({ type: 'review', open: ['reviews', r.id], people: [], ttl: C.REVIEW_TYPES[r.type].name, at: r.doneAt || r.startedAt, text: r.word ? `„${r.word}“` : 'Abgeschlossen' });
  if (want('person')) for (const p of S.people()) for (const l of p.log || []) add({ type: 'person', open: ['people', p.id], area: p.area, people: [p.id], ttl: p.name, at: l.at, text: l.text });
  if (want('inbox')) for (const x of S.inboxItems()) if (x.createdAt) add({ type: 'inbox', open: null, nav: '#/inbox', people: [], ttl: x.text, at: x.createdAt, text: 'In die Inbox geschrieben' });
  const area = A.area();
  const qq = C.norm(st.q);
  return out.filter(e => (area === 'all' || !e.area || e.area === area)
    && (!st.cat || e.cat === st.cat) && (!st.life || e.life === st.life) && (!st.person || (e.people || []).includes(st.person))
    && (!qq || C.norm(e.ttl + ' ' + e.text).includes(qq)))
    .sort((a, b) => b.at - a.at);
}

function listHtml(now) {
  const all = collect(now);
  const items = all.slice(0, st.limit);
  if (!items.length) return `<div class="card">${emptyState('🕰️', 'Nichts im Verlauf', 'Für diese Filter gibt es keine Einträge. Wähle einen größeren Zeitraum oder entferne Filter.')}</div>`;
  const days = new Map();
  for (const e of items) { const k = C.ymd(new Date(e.at)); if (!days.has(k)) days.set(k, []); days.get(k).push(e); }
  const counts = {};
  for (const e of all) counts[e.type] = (counts[e.type] || 0) + 1;
  return `<div class="vl-sum">${Object.entries(counts).map(([t, n]) => `<span>${icon(TYPES[t].icon, 12)}${esc(TYPES[t].name)} <b>${n}</b></span>`).join('')}</div>
    ${[...days.entries()].map(([k, list]) => { const d = C.parseYmd(k); return `<div class="vl-day"><div class="vl-dh"><b>${esc(C.sameDay(d, now) ? 'Heute' : C.sameDay(d, C.addDays(now, -1)) ? 'Gestern' : C.WD_LONG[C.wdIdx(d)])}</b><span>${esc(C.fmtDateShort(d))}</span><span class="sp"></span><span class="tiny muted">${list.length}</span></div>
      ${list.map(e => { const c = e.cat ? S.cat(e.cat) : null; return `<div class="vl-i t-${e.type}" ${e.open ? `data-vopen="${e.open[0]}:${e.open[1]}"` : e.nav ? `data-vnav="${e.nav}"` : ''} tabindex="0"><span class="vl-t num">${e.dayOnly || e.allDay ? '' : C.hm(new Date(e.at))}</span><span class="vl-ic">${icon(TYPES[e.type].icon, 13)}</span><div class="grow"><div class="vl-ttl ellip">${esc(e.ttl)}</div><div class="vl-tx">${esc(e.text)}</div></div>${c ? `<span class="tag hide-s"><i class="catdot" style="background:${catColor(c)}"></i>${esc(c.name)}</span>` : ''}</div>`; }).join('')}</div>`; }).join('')}
    ${all.length > items.length ? `<div style="text-align:center;margin:14px 0"><button class="btn" data-more>${all.length - items.length} weitere laden</button></div>` : ''}`;
}

export function render() {
  const now = A.now();
  const cats = S.cats().filter(c => !c.deleted);
  const life = S.lifeAreas();
  const people = S.people().sort((a, b) => a.name.localeCompare(b.name));
  const active = st.types.size || st.cat || st.life || st.person || st.q;
  return `<div class="page">
    <div class="page-head"><div class="grow"><h1>Verlauf</h1><div class="psub">Alles, was passiert ist – an einem Ort, filterbar.</div></div>
      ${active ? '<div class="page-actions"><button class="btn btn-ghost" data-vreset>Filter zurücksetzen</button></div>' : ''}</div>
    <div class="card pad-sm vl-filters">
      <div class="row wrap"><div class="seg sm" role="group" aria-label="Zeitraum">${RANGES.map(([k, l]) => `<button data-vr="${k}" aria-pressed="${st.range === k}">${l}</button>`).join('')}</div>
        <div class="search-box sm grow" style="min-width:12rem">${icon('search', 14)}<input id="vlq" placeholder="Im Verlauf suchen" value="${esc(st.q)}" aria-label="Im Verlauf suchen"></div></div>
      <div class="chips" style="margin-top:8px">${Object.entries(TYPES).map(([k, t]) => `<button class="chip ${st.types.has(k) ? 'on' : ''}" data-vt="${k}">${icon(t.icon, 12)}${esc(t.name)}</button>`).join('')}</div>
      <div class="row wrap" style="margin-top:8px;gap:8px">
        <select class="select sm" data-vf="cat" aria-label="Kategorie"><option value="">Alle Kategorien</option>${cats.map(c => `<option value="${c.id}" ${st.cat === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
        <select class="select sm" data-vf="life" aria-label="Lebensbereich"><option value="">Alle Lebensbereiche</option>${life.map(l => `<option value="${l.id}" ${st.life === l.id ? 'selected' : ''}>${esc((l.icon || '') + ' ' + l.name)}</option>`).join('')}</select>
        <select class="select sm" data-vf="person" aria-label="Person"><option value="">Alle Personen</option>${people.map(p => `<option value="${p.id}" ${st.person === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
      </div>
    </div>
    <div data-vlist>${listHtml(now)}</div>
  </div>`;
}

export function mount(root, ctx) {
  const redraw = () => { const box = root.querySelector('[data-vlist]'); if (box) box.innerHTML = listHtml(A.now()); };
  root.addEventListener('click', e => {
    const r = e.target.closest('[data-vr]'); if (r) { st.range = r.dataset.vr; st.limit = 300; A.render(); return; }
    const t = e.target.closest('[data-vt]'); if (t) { const k = t.dataset.vt; if (st.types.has(k)) st.types.delete(k); else st.types.add(k); st.limit = 300; A.render(); return; }
    if (e.target.closest('[data-more]')) { st.limit += 300; redraw(); return; }
    if (e.target.closest('[data-vreset]')) { st.types.clear(); st.cat = st.life = st.person = st.q = ''; A.render(); return; }
    const o = e.target.closest('[data-vopen]'); if (o) { const [c, id] = o.dataset.vopen.split(':'); A.openItem(c, id); return; }
    const n = e.target.closest('[data-vnav]'); if (n) A.nav(n.dataset.vnav);
  }, { signal: ctx.signal });
  root.addEventListener('change', e => { const f = e.target.closest('[data-vf]'); if (f) { st[f.dataset.vf] = f.value; A.render(); } }, { signal: ctx.signal });
  const q = root.querySelector('#vlq');
  if (q) q.addEventListener('input', debounce(() => { st.q = q.value; redraw(); }, 200), { signal: ctx.signal });
  root.addEventListener('keydown', e => { if (e.key === 'Enter') { const o = e.target.closest('[data-vopen]'); if (o) o.click(); } }, { signal: ctx.signal });
}
