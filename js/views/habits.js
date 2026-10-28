// Gewohnheiten, Routinen, Grenzen – und wiederkehrende Vorgänge an einem Ort
import * as C from '../core.js';
import * as S from '../store.js';
import { esc, icon, sheet, popover, closePopover, toast, isMobile, confirmDialog, burst } from '../ui.js';
import { A } from '../app-api.js';
import { emptyState, catSelect, lifeSelect, pct, catColor } from './common.js';
import { handleNewOption } from '../entities.js';

let weekOff = 0;
let showArchived = false;

export function habitCellState(h, k) {
  const day = C.parseYmd(k);
  const today = C.ymd(A.now());
  if (k > today) return { cls: 'off', label: '', disabled: true };
  const v = C.habitValue(h, k);
  const due = C.habitDueOn(h, day);
  if (h.kind === 'routine') {
    const total = (h.steps || []).length;
    const n = Array.isArray(v) ? v.filter(id => (h.steps || []).some(s0 => s0.id === id)).length : (v === true ? total : 0);
    if (C.habitDoneOn(h, k)) return { cls: 'on', label: icon('check', 12) };
    if (n) return { cls: 'part', label: `${n}/${total}` };
  } else if (h.kind === 'count') {
    if (typeof v === 'number' && v > 0) return { cls: C.habitDoneOn(h, k) ? 'on' : 'part', label: String(v) };
  } else if (h.kind === 'limit') {
    if (typeof v === 'number') return { cls: C.habitFailedOn(h, k) ? 'fail' : 'on', label: String(v) };
  } else if (v === true) return { cls: 'on', label: icon('check', 12) };
  return { cls: due ? '' : 'off', label: '', disabled: false };
}

function setValue(h, k, val) {
  const cur = S.get('habits', h.id) || h;
  const log = { ...(cur.log || {}) };
  if (val === undefined || val === null || val === false || (Array.isArray(val) && !val.length)) delete log[k];
  else log[k] = val;
  return S.put('habits', { ...cur, log });
}

/** Klick auf eine Zelle: abhaken, zählen, Wert eintragen oder Routine öffnen */
export function toggleHabit(id, k, el) {
  const h = S.get('habits', id); if (!h) return;
  if (k > C.ymd(A.now())) return;
  if (h.kind === 'routine') { openRoutine(h, k); return; }
  if (h.kind === 'count' || h.kind === 'limit') { valuePopover(el, h, k); return; }
  const was = C.habitValue(h, k) === true;
  const next = setValue(h, k, was ? undefined : true);
  if (!was) { burst(el, 'var(--accent)'); const st = C.habitStreak(next, A.now()); if (st >= 3 && k === C.ymd(A.now())) toast(`${esc(h.title)}: ${st} in Folge`, { ms: 2200 }); }
}

function valuePopover(anchor, h, k) {
  const v = C.habitValue(h, k);
  const unit = h.unit || (h.kind === 'limit' ? 'Min' : '');
  const step = h.step || (h.kind === 'limit' && unit === 'Min' ? 15 : 1);
  const html = `<div><b>${esc(h.title)}</b><div class="small muted" style="margin:2px 0 12px">${esc(C.fmtDateShort(C.parseYmd(k)))} · ${h.kind === 'limit' ? 'höchstens' : 'mindestens'} ${esc(String(h.target || 0))} ${esc(unit)}</div>
    <div class="row" style="justify-content:center;gap:10px"><button class="icon-btn" data-st="-1" aria-label="Weniger">${icon('minus', 18)}</button><input class="input num" type="number" min="0" step="${step}" data-val value="${typeof v === 'number' ? v : (h.kind === 'count' ? 0 : '')}" style="width:90px;text-align:center;font-size:18px;height:40px" aria-label="Wert"><button class="icon-btn" data-st="1" aria-label="Mehr">${icon('plus', 18)}</button></div>
    ${unit ? `<div class="small muted" style="text-align:center;margin-top:4px">${esc(unit)}</div>` : ''}
    <div class="row" style="justify-content:space-between;margin-top:14px"><button class="btn sm btn-ghost" data-clear>Leeren</button><button class="btn sm btn-primary" data-ok>Speichern</button></div></div>`;
  popover(anchor, html, {
    width: 250, place: 'below',
    onMount: (el, close) => {
      const inp = el.querySelector('[data-val]');
      setTimeout(() => { inp.focus(); inp.select(); }, 30);
      const save = () => { const n = inp.value === '' ? undefined : Math.max(0, Number(inp.value)); const next = setValue(h, k, n); close(); if (C.habitDoneOn(next, k) && h.kind === 'count') burst(anchor, 'var(--accent)'); if (C.habitFailedOn(next, k)) toast(`Grenze überschritten: ${n} ${esc(unit)} (Ziel ${h.target})`, { kind: 'bad' }); };
      el.addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.st) { inp.value = Math.max(0, (Number(inp.value) || 0) + Number(b.dataset.st) * step); }
        if (b.hasAttribute('data-clear')) { setValue(h, k, undefined); close(); }
        if (b.hasAttribute('data-ok')) save();
      });
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') save(); });
    },
  });
}

function openRoutine(h, k) {
  const steps = h.steps || [];
  const v = C.habitValue(h, k);
  const doneSet = new Set(Array.isArray(v) ? v : v === true ? steps.map(s0 => s0.id) : []);
  sheet({
    title: esc(h.title), cls: 'sheet-sm',
    body: `<div class="small muted" style="margin-bottom:10px">${esc(C.fmtDateLong(C.parseYmd(k)))}${h.time ? ` · ${esc(h.time)} Uhr` : ''}</div>
      ${h.note ? `<p class="small" style="color:var(--ink-2)">${esc(h.note)}</p>` : ''}
      <div class="subs" data-steps>${steps.map((s0, i) => `<label class="sub ${doneSet.has(s0.id) ? 'done' : ''}" style="cursor:pointer"><button type="button" class="check sq ${doneSet.has(s0.id) ? 'on' : ''}" data-step="${s0.id}" aria-label="Schritt ${i + 1}">${icon('check', 11)}</button><span style="flex:1;font-size:14px">${esc(s0.t)}</span></label>`).join('') || '<p class="muted small">Diese Routine hat noch keine Schritte. Lege sie unter „Bearbeiten“ an.</p>'}</div>`,
    footer: `<button class="btn btn-ghost" data-edit>${icon('edit', 14)}Bearbeiten</button><span class="sp"></span><button class="btn" data-all>Alle abhaken</button><button class="btn btn-primary" data-close>Fertig</button>`,
    onMount: (el, close) => {
      const save = () => { setValue(h, k, [...doneSet]); };
      el.addEventListener('click', e => {
        const b = e.target.closest('[data-step]');
        if (b) { e.preventDefault(); const id = b.dataset.step; if (doneSet.has(id)) doneSet.delete(id); else doneSet.add(id); b.classList.toggle('on', doneSet.has(id)); b.closest('.sub').classList.toggle('done', doneSet.has(id)); save(); if (steps.length && doneSet.size === steps.length) { burst(b, 'var(--accent)'); toast('Routine geschafft'); } return; }
        if (e.target.closest('[data-all]')) { steps.forEach(s0 => doneSet.add(s0.id)); save(); close(); toast('Routine geschafft'); return; }
        if (e.target.closest('[data-edit]')) { close(); editHabit(S.get('habits', h.id)); }
      });
    },
  });
}

/* ---------------- Bearbeiten ---------------- */
export function editHabit(h0) {
  const existing = h0 && h0.id ? S.get('habits', h0.id) : null;
  const area0 = A.area() === 'all' ? 'p' : A.area();
  const h = existing ? C.structuredCloneSafe(existing) : { title: '', kind: 'check', freq: { type: 'daily', days: [0, 1, 2, 3, 4], times: 3 }, target: '', unit: '', steps: [], time: '', area: area0, cat: null, life: null, note: '', log: {}, ...(h0 || {}) };
  const f = h.freq || { type: 'daily' };
  const days = new Set(f.days || [0, 1, 2, 3, 4]);
  let steps = [...(h.steps || [])];
  const kindBtns = Object.entries(C.HABIT_KINDS).map(([k, x]) => `<button type="button" data-kind="${k}" class="${h.kind === k ? 'on' : ''}"><b>${x.name}</b><span>${x.hint}</span></button>`).join('');
  const stepsHtml = () => steps.map((s0, i) => `<div class="sub"><span class="faint small num" style="width:16px">${i + 1}.</span><input type="text" value="${esc(s0.t)}" data-stepi="${i}" aria-label="Schritt ${i + 1}"><button type="button" class="icon-btn sm" data-stepdel="${i}" aria-label="Entfernen">${icon('x', 13)}</button></div>`).join('');
  sheet({
    title: existing ? 'Gewohnheit bearbeiten' : 'Neue Gewohnheit', side: !isMobile(),
    body: `<input class="title-in" data-f="title" placeholder="z. B. Morgens meditieren" value="${esc(h.title)}" ${existing ? '' : 'autofocus'} aria-label="Titel">
      <div class="section-t" style="margin-top:16px">Art</div>
      <div class="qpick" data-kinds>${kindBtns}</div>
      <div data-kbox="target" class="${h.kind === 'count' || h.kind === 'limit' ? '' : 'hide'}" style="margin-top:12px"><div class="fgrid"><div class="field"><label data-tlabel>${h.kind === 'limit' ? 'Höchstens' : 'Mindestens'}</label><input class="input" type="number" min="0" data-f="target" value="${esc(String(h.target ?? ''))}"></div><div class="field"><label>Einheit</label><input class="input" data-f="unit" value="${esc(h.unit || '')}" placeholder="${h.kind === 'limit' ? 'Min' : 'Gläser'}" list="zb-units"><datalist id="zb-units"><option value="Min"><option value="Std"><option value="Gläser"><option value="Seiten"><option value="Schritte"><option value="Mal"></datalist></div></div></div>
      <div data-kbox="steps" class="${h.kind === 'routine' ? '' : 'hide'}" style="margin-top:12px"><div class="lbl" style="margin-bottom:4px">Schritte der Routine</div><div class="subs" data-steps>${stepsHtml()}</div><div class="sub"><span class="faint small" style="width:16px">+</span><input type="text" data-stepadd placeholder="Schritt hinzufügen, Enter drücken"></div></div>
      <div class="section-t">Wie oft</div>
      <div class="chips" data-freq>${[['daily', 'Täglich'], ['days', 'An bestimmten Tagen'], ['week', 'x-mal pro Woche']].map(([k, l]) => `<button type="button" class="chip ${f.type === k ? 'on' : ''}" data-ft="${k}">${l}</button>`).join('')}</div>
      <div class="wd-pick ${f.type === 'days' ? '' : 'hide'}" data-wd style="margin-top:10px">${C.WD_SHORT.map((w, i) => `<button type="button" class="${days.has(i) ? 'on' : ''}" data-wdi="${i}">${w}</button>`).join('')}</div>
      <div class="row ${f.type === 'week' ? '' : 'hide'}" data-times style="margin-top:10px"><input class="input" type="number" min="1" max="7" data-f="times" value="${f.times || 3}" style="width:80px"><span class="small muted">Mal pro Woche</span></div>
      <div class="section-t">Erinnerung</div>
      <div class="row"><input class="input" type="time" data-f="time" value="${esc(h.time || '')}" style="width:130px" aria-label="Uhrzeit"><span class="hint">Push-Benachrichtigung mit Link, solange nicht erledigt. Leer = keine.</span></div>
      <div class="section-t">Zuordnung</div>
      <div class="props">
        <div class="k">Bereich</div><div class="v"><select class="select" data-f="area" style="width:auto"><option value="p" ${h.area !== 'b' ? 'selected' : ''}>Privat</option><option value="b" ${h.area === 'b' ? 'selected' : ''}>Geschäftlich</option></select></div>
        <div class="k">Kategorie</div><div class="v" data-catbox>${catSelect(h.area, h.cat, 'data-f="cat" style="width:auto;max-width:100%"')}</div>
        <div class="k">Lebensbereich</div><div class="v">${lifeSelect(h.life, 'data-f="life" style="width:auto;max-width:100%"')}</div>
        <div class="k">Beginnt am</div><div class="v"><input class="input" type="date" data-f="start" value="${esc(h.start || '')}"></div>
      </div>
      <div class="field" style="margin-top:10px"><label>Warum ist dir das wichtig?</label><textarea class="textarea" data-f="note" rows="2" placeholder="Erinnert dich an den Sinn dahinter">${esc(h.note || '')}</textarea></div>`,
    footer: `${existing ? `<div class="left"><button class="btn btn-ghost" data-del>${icon('trash', 14)}Löschen</button><button class="btn btn-ghost" data-arch>${existing.archived ? 'Reaktivieren' : 'Archivieren'}</button></div>` : ''}<button class="btn" data-close>Abbrechen</button><button class="btn btn-primary" data-save>${existing ? 'Speichern' : 'Anlegen'}</button>`,
    onMount: (el, close) => {
      const v = n => el.querySelector(`[data-f="${n}"]`);
      let kind = h.kind || 'check', ftype = f.type || 'daily';
      el.addEventListener('click', async e => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.kind) {
          kind = b.dataset.kind; el.querySelectorAll('[data-kind]').forEach(x => x.classList.toggle('on', x === b));
          el.querySelector('[data-kbox="target"]').classList.toggle('hide', !(kind === 'count' || kind === 'limit'));
          el.querySelector('[data-kbox="steps"]').classList.toggle('hide', kind !== 'routine');
          el.querySelector('[data-tlabel]').textContent = kind === 'limit' ? 'Höchstens' : 'Mindestens';
          v('unit').placeholder = kind === 'limit' ? 'Min' : 'Gläser';
          return;
        }
        if (b.dataset.ft) {
          ftype = b.dataset.ft; el.querySelectorAll('[data-ft]').forEach(x => x.classList.toggle('on', x === b));
          el.querySelector('[data-wd]').classList.toggle('hide', ftype !== 'days'); el.querySelector('[data-times]').classList.toggle('hide', ftype !== 'week');
          return;
        }
        if (b.dataset.wdi !== undefined) { const i = Number(b.dataset.wdi); if (days.has(i)) days.delete(i); else days.add(i); b.classList.toggle('on', days.has(i)); return; }
        if (b.dataset.stepdel !== undefined) { steps.splice(Number(b.dataset.stepdel), 1); el.querySelector('[data-steps]').innerHTML = stepsHtml(); return; }
        if (b.hasAttribute('data-save')) { if (save()) close(); return; }
        if (b.hasAttribute('data-arch')) { S.put('habits', { ...S.get('habits', existing.id), archived: !existing.archived }); toast(existing.archived ? 'Reaktiviert' : 'Archiviert'); close(); return; }
        if (b.hasAttribute('data-del')) {
          if (await confirmDialog(`„${esc(existing.title)}“ samt Verlauf löschen? Im Papierkorb kannst du sie wiederherstellen.`, { ok: 'Löschen', danger: true, title: 'Gewohnheit löschen?', cooldown: 3 })) { const prev = S.remove('habits', existing.id); toast('Gelöscht', { action: 'Rückgängig', onAction: () => S.restore('habits', prev) }); close(); }
        }
      });
      el.addEventListener('input', e => { if (e.target.dataset.stepi !== undefined) steps[Number(e.target.dataset.stepi)].t = e.target.value; });
      el.addEventListener('change', async e => {
        if (e.target === v('area')) el.querySelector('[data-catbox]').innerHTML = catSelect(e.target.value, null, 'data-f="cat" style="width:auto;max-width:100%"');
        if (e.target === v('cat') && e.target.value === '__new') await handleNewOption(e.target, 'cat', v('area').value);
        if (e.target === v('life') && e.target.value === '__new') await handleNewOption(e.target, 'life');
      });
      const add = el.querySelector('[data-stepadd]');
      add.addEventListener('keydown', e => { if (e.key === 'Enter' && add.value.trim()) { e.preventDefault(); steps.push({ id: C.uid('st', 5), t: add.value.trim() }); add.value = ''; el.querySelector('[data-steps]').innerHTML = stepsHtml(); } });
      v('title').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); if (save()) close(); } });
      function save() {
        const title = v('title').value.trim();
        if (!title) { v('title').focus(); v('title').placeholder = 'Bitte einen Titel eingeben'; return false; }
        if (add.value.trim()) steps.push({ id: C.uid('st', 5), t: add.value.trim() });
        if (kind === 'routine' && !steps.filter(x => x.t.trim()).length) { toast('Lege mindestens einen Schritt an'); add.focus(); return false; }
        if ((kind === 'count' || kind === 'limit') && v('target').value === '') { toast('Bitte einen Zielwert eintragen'); v('target').focus(); return false; }
        const cat = v('cat').value === '__new' ? null : v('cat').value || null;
        const life = v('life').value === '__new' ? null : v('life').value || null;
        const rec = {
          ...(existing || {}), title, kind,
          freq: { type: ftype, days: [...days].sort(), times: Math.max(1, Math.min(7, Number(v('times').value) || 3)) },
          target: kind === 'count' || kind === 'limit' ? Number(v('target').value) : null, unit: v('unit').value.trim(),
          steps: kind === 'routine' ? steps.filter(x => x.t.trim()) : (existing ? existing.steps || [] : []),
          time: v('time').value || '', area: v('area').value, cat, life, start: v('start').value || null, note: v('note').value.trim(), log: (existing && existing.log) || {},
        };
        if (!existing) rec.order = S.habits().length;
        S.put('habits', rec);
        toast(existing ? 'Gespeichert' : 'Gewohnheit angelegt');
        return true;
      }
    },
  });
}

/* ---------------- Ansicht ---------------- */
function rowHtml(h, dayKeys, now) {
  const streak = C.habitStreak(h, now);
  const rate = C.habitRate(h, 30, now);
  const f = h.freq || {};
  const week = f.type === 'week' ? `${C.habitWeekCount(h, now)}/${f.times || 1} diese Woche` : '';
  const sub = [C.HABIT_KINDS[h.kind || 'check'].name, C.describeHabitFreq(h), h.kind === 'count' || h.kind === 'limit' ? `${h.kind === 'limit' ? '≤' : '≥'} ${h.target} ${h.unit || ''}`.trim() : '', h.kind === 'routine' ? `${(h.steps || []).length} Schritte` : '', h.time ? h.time + ' Uhr' : '', week].filter(Boolean).join(' · ');
  const c = S.cat(h.cat);
  return `<tr>
    <td class="hname" data-edith="${h.id}">${c ? `<i class="catdot" style="background:${catColor(c)};margin-right:6px;vertical-align:1px"></i>` : ''}<b style="display:inline">${esc(h.title)}</b><span style="display:block">${esc(sub)}</span></td>
    ${dayKeys.map(k => { const st = habitCellState(h, k); return `<td><button class="hcell ${st.cls}" data-habit="${h.id}" data-day="${k}" ${st.disabled ? 'disabled' : ''} aria-label="${esc(h.title)}, ${esc(C.fmtDateShort(C.parseYmd(k)))}">${st.label}</button></td>`; }).join('')}
    <td class="hstat"><span class="streak" title="Serie">${streak ? `${streak}${f.type === 'week' ? ' Wo.' : ''} ${icon('bolt', 11, 'inl')}` : '–'}</span></td>
    <td class="hstat hide-s" title="Quote der letzten 30 Tage">${pct(rate)}</td>
  </tr>`;
}

function recurringCard(now, area) {
  const list = S.tasks(t => t.rec && t.rec.f && C.isOpen(t) && S.inArea(t, area)).sort((a, b) => (a.due || '').localeCompare(b.due || ''));
  if (!list.length) return '';
  const keys = [...Array(7)].map((_, i) => C.ymd(C.addDays(now, i - 6)));
  return `<div class="card flush" style="margin-top:20px"><div class="card-head" style="padding:16px 20px 0"><h2>Wiederkehrende Vorgänge</h2><a class="link" href="#/vorgaenge?rec=1">Im Index</a></div>
    <div class="table-wrap"><table class="tbl"><thead><tr><th>Vorgang</th><th>Rhythmus</th><th>Nächstes Mal</th><th>Letzte 7 Tage</th><th>Serie</th></tr></thead><tbody>
    ${list.map(t => { const hist = new Set(t.hist || []); const d = t.due ? C.fmtDue(t.due, t.dueTime, now) : '–'; const over = t.due && t.due < C.ymd(now); return `<tr data-task="${t.id}"><td class="t-title"><div class="tt">${esc(t.title)}</div></td><td class="small muted">${esc(C.describeRule(t.rec, t.due))}</td><td class="t-date ${over ? 'over' : ''}">${esc(d)}</td><td><span class="read-count">${keys.map(k => `<i class="${hist.has(k) ? 'on' : ''}" title="${esc(C.fmtDateShort(C.parseYmd(k)))}"></i>`).join('')}</span></td><td class="small">${C.streakOf(t.hist, now) || '–'}</td></tr>`; }).join('')}
    </tbody></table></div></div>`;
}

export function render() {
  const now = A.now();
  const area = A.area();
  const all = S.habits(h => S.inArea(h, area)).sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.title.localeCompare(b.title));
  const active = all.filter(h => !h.archived);
  const archived = all.filter(h => h.archived);
  const end = C.addDays(C.startOfDay(now), weekOff * 7);
  const nDays = isMobile() ? 5 : 7;
  const dayKeys = [...Array(nDays)].map((_, i) => C.ymd(C.addDays(end, i - nDays + 1)));
  const todayKey = C.ymd(now);
  const dueToday = active.filter(h => C.habitDueOn(h, now));
  const doneToday = dueToday.filter(h => C.habitDoneOn(h, todayKey)).length;
  const best = active.reduce((m, h) => Math.max(m, C.habitStreak(h, now)), 0);
  const avg = active.length ? active.reduce((a, h) => a + C.habitRate(h, 30, now), 0) / active.length : 0;
  const groups = [['Gewohnheiten', active.filter(h => h.kind === 'check' || h.kind === 'count' || !h.kind)], ['Routinen', active.filter(h => h.kind === 'routine')], ['Grenzen', active.filter(h => h.kind === 'limit')]].filter(g => g[1].length);
  const head = `<tr><th class="hname">${weekOff ? `<button class="link-btn" data-wk="0">Zu heute</button>` : ''}</th>${dayKeys.map(k => { const d = C.parseYmd(k); return `<th class="${k === todayKey ? 'today' : ''}">${C.WD_SHORT[C.wdIdx(d)]}<br><span style="font-weight:500">${d.getDate()}</span></th>`; }).join('')}<th>Serie</th><th class="hide-s">30 T.</th></tr>`;
  return `<div class="page">
    <div class="page-head"><div class="grow"><h1>Gewohnheiten & Routinen</h1><div class="psub">Was du regelmäßig tust, worauf du achtest und welche Grenzen du dir setzt.</div></div>
      <div class="page-actions"><button class="btn btn-primary" data-newh>${icon('plus', 15)}Neu</button></div></div>
    ${active.length ? `<div class="stats">
      <div class="stat"><div class="l">Heute</div><div class="v">${doneToday}/${dueToday.length}</div><div class="s">erledigt</div></div>
      <div class="stat"><div class="l">Beste Serie</div><div class="v">${best}</div><div class="s">in Folge</div></div>
      <div class="stat"><div class="l">Quote 30 Tage</div><div class="v">${pct(avg)}</div><div class="s">im Schnitt</div></div>
      <div class="stat"><div class="l">Aktiv</div><div class="v">${active.length}</div><div class="s">${archived.length ? archived.length + ' archiviert' : 'Gewohnheiten'}</div></div>
    </div>
    <div class="card pad-sm">
      <div class="row" style="justify-content:flex-end;margin-bottom:4px"><button class="icon-btn sm" data-wk="-1" aria-label="Vorherige Woche">${icon('left', 16)}</button><button class="icon-btn sm" data-wk="1" aria-label="Nächste Woche" ${weekOff >= 0 ? 'disabled' : ''}>${icon('right', 16)}</button></div>
      <div class="table-wrap"><table class="htable"><thead>${head}</thead>
      ${groups.map(([name, list]) => `<tbody>${groups.length > 1 ? `<tr><td colspan="10" class="hgrp">${name}</td></tr>` : ''}${list.map(h => rowHtml(h, dayKeys, now)).join('')}</tbody>`).join('')}
      </table></div>
    </div>` : `<div class="card">${emptyState('🔁', 'Noch keine Gewohnheiten', 'Lege fest, was du regelmäßig tun willst (Sport, Lesen), welche Routinen du hast (Morgenroutine) oder welche Grenzen du dir setzt (max. 60 Min Handyzeit).', '<button class="btn btn-primary" data-newh>Erste Gewohnheit anlegen</button>')}</div>`}
    ${recurringCard(now, area)}
    ${archived.length ? `<div style="margin-top:18px"><button class="link-btn" data-arch>${showArchived ? 'Archiv ausblenden' : `Archivierte anzeigen (${archived.length})`}</button>
      ${showArchived ? `<div class="card pad-sm" style="margin-top:8px">${archived.map(h => `<div class="li" data-edith="${h.id}"><div class="grow"><div class="lt">${esc(h.title)}</div><div class="lm">${esc(C.describeHabitFreq(h))}</div></div><span class="small muted">archiviert</span></div>`).join('')}</div>` : ''}</div>` : ''}
  </div>`;
}

export function mount(root, ctx, route) {
  root.addEventListener('click', e => {
    const c = e.target.closest('[data-habit]');
    if (c) { toggleHabit(c.dataset.habit, c.dataset.day, c); return; }
    const ed = e.target.closest('[data-edith]');
    if (ed) { editHabit(S.get('habits', ed.dataset.edith)); return; }
    if (e.target.closest('[data-newh]')) { editHabit(null); return; }
    const wk = e.target.closest('[data-wk]');
    if (wk) { const d = Number(wk.dataset.wk); weekOff = d === 0 ? 0 : Math.min(0, weekOff + d); A.render(); return; }
    if (e.target.closest('[data-arch]')) { showArchived = !showArchived; A.render(); }
  });
  const hid = route && route.params && route.params.h;
  if (hid && S.get('habits', hid)) {
    history.replaceState(null, '', '#/gewohnheiten');
    setTimeout(() => { const el = root.querySelector(`[data-habit="${hid}"][data-day="${C.ymd(A.now())}"]`); if (el) { el.scrollIntoView({ block: 'center' }); const h = S.get('habits', hid); if (h.kind === 'routine' || h.kind === 'count' || h.kind === 'limit') toggleHabit(hid, C.ymd(A.now()), el); else { el.classList.add('flash'); toast('Tippe auf den Kreis, um abzuhaken'); } } }, 150);
  }
  void closePopover;
}
