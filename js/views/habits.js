// Gewohnheiten, Routinen, Grenzen – und wiederkehrende Vorgänge an einem Ort
import * as C from '../core.js';
import * as S from '../store.js';
import { esc, icon, sheet, popover, closePopover, toast, isMobile, confirmDialog, burst, pickFile } from '../ui.js';
import { heatmap } from '../charts.js';
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
  if (h.kind === 'routine') { if (k === C.ymd(A.now())) A.startRoutine(id, k); else openRoutine(h, k); return; }
  if (h.kind === 'count' || h.kind === 'limit') { valuePopover(el, h, k); return; }
  const was = C.habitValue(h, k) === true;
  const next = setValue(h, k, was ? undefined : true);
  const undo = () => setValue(S.get('habits', id) || h, k, was ? true : undefined);
  if (!was) { burst(el, 'var(--ok)'); const st = C.habitStreak(next, A.now()); toast(st >= 3 && k === C.ymd(A.now()) ? `✓ ${esc(h.title)} · ${st} in Folge` : `✓ ${esc(h.title)}`, { ms: 2600, action: 'Rückgängig', onAction: undo }); }
  else toast(`${esc(h.title)}: Haken entfernt`, { ms: 2200, action: 'Rückgängig', onAction: undo });
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
  let openStep = -1;
  const stepsHtml = () => steps.map((s0, i) => `<div class="step-ed ${openStep === i ? 'open' : ''}"><div class="sub"><span class="faint small num" style="width:16px">${i + 1}.</span><input type="text" value="${esc(s0.t)}" data-stepi="${i}" aria-label="Schritt ${i + 1}"><input class="input sm num" type="number" min="0" max="240" value="${s0.min || ''}" data-stepmin="${i}" placeholder="Min" title="Minuten (für den Timer im Player)" style="width:4.2rem"><button type="button" class="icon-btn sm ${s0.body || s0.img || s0.link ? 'on' : ''}" data-stepx="${i}" aria-label="Inhalt" title="Text, Bild oder Link für diesen Schritt">${icon('notes', 13)}</button><button type="button" class="icon-btn sm" data-stepup="${i}" aria-label="Nach oben" ${i ? '' : 'disabled'}>${icon('up', 13)}</button><button type="button" class="icon-btn sm" data-stepdel="${i}" aria-label="Entfernen">${icon('x', 13)}</button></div>
    ${openStep === i ? `<div class="step-x"><textarea class="textarea" rows="3" data-stepbody="${i}" placeholder="Anleitung, Gedanke oder Affirmation für diesen Schritt">${esc(s0.body || '')}</textarea>
      <div class="row wrap" style="gap:6px;margin-top:6px"><input class="input sm grow" data-steplink="${i}" value="${esc(s0.link || '')}" placeholder="Link (https://…), z. B. Video oder Playlist"><button type="button" class="btn sm" data-stepimg="${i}">${icon('upload', 12)}${s0.img ? 'Bild ersetzen' : 'Bild'}</button>${s0.img ? `<button type="button" class="btn sm btn-ghost" data-stepimgdel="${i}">Bild entfernen</button>` : ''}</div>
      ${s0.img ? `<img class="step-img" src="${esc(s0.img)}" alt="">` : ''}</div>` : ''}</div>`).join('');
  const totalMin = () => steps.reduce((a, x) => a + (Number(x.min) || 0), 0);
  sheet({
    title: existing ? 'Gewohnheit bearbeiten' : 'Neue Gewohnheit', side: !isMobile(),
    body: `<input class="title-in" data-f="title" placeholder="z. B. Morgens meditieren" value="${esc(h.title)}" ${existing ? '' : 'autofocus'} aria-label="Titel">
      <div class="section-t" style="margin-top:16px">Art</div>
      <div class="qpick" data-kinds>${kindBtns}</div>
      <div data-kbox="target" class="${h.kind === 'count' || h.kind === 'limit' ? '' : 'hide'}" style="margin-top:12px"><div class="fgrid"><div class="field"><label data-tlabel>${h.kind === 'limit' ? 'Höchstens' : 'Mindestens'}</label><input class="input" type="number" min="0" data-f="target" value="${esc(String(h.target ?? ''))}"></div><div class="field"><label>Einheit</label><input class="input" data-f="unit" value="${esc(h.unit || '')}" placeholder="${h.kind === 'limit' ? 'Min' : 'Gläser'}" list="zb-units"><datalist id="zb-units"><option value="Min"><option value="Std"><option value="Gläser"><option value="Seiten"><option value="Schritte"><option value="Mal"></datalist></div></div></div>
      <div data-kbox="steps" class="${h.kind === 'routine' ? '' : 'hide'}" style="margin-top:12px"><div class="row"><div class="lbl grow" style="margin-bottom:4px">Schritte der Routine</div><span class="tiny muted" data-ttot>${totalMin() ? 'gesamt ' + C.fmtDuration(totalMin()) : ''}</span></div><div class="subs" data-steps>${stepsHtml()}</div><div class="sub"><span class="faint small" style="width:16px">+</span><input type="text" data-stepadd placeholder="Schritt hinzufügen, Enter drücken"></div>
        <div class="row" style="margin-top:10px;gap:8px"><span class="lbl">Farbe im Player</span><div class="color-pick sm" data-rcolor>${['#1b4f72', '#33b679', '#039be5', '#8e24aa', '#e67c73', '#f4511e', '#f6bf26', '#616161'].map(c => `<button type="button" style="background:${c}" class="${(h.color || '#1b4f72') === c ? 'on' : ''}" data-rc="${c}" aria-label="${c}"></button>`).join('')}</div></div></div>
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
        const redrawSteps = () => { el.querySelector('[data-steps]').innerHTML = stepsHtml(); const tt = el.querySelector('[data-ttot]'); if (tt) tt.textContent = totalMin() ? 'gesamt ' + C.fmtDuration(totalMin()) : ''; };
        if (b.dataset.stepdel !== undefined) { steps.splice(Number(b.dataset.stepdel), 1); openStep = -1; redrawSteps(); return; }
        if (b.dataset.stepx !== undefined) { const i = Number(b.dataset.stepx); openStep = openStep === i ? -1 : i; redrawSteps(); return; }
        if (b.dataset.stepup !== undefined) { const i = Number(b.dataset.stepup); if (i > 0) { [steps[i - 1], steps[i]] = [steps[i], steps[i - 1]]; openStep = -1; redrawSteps(); } return; }
        if (b.dataset.stepimgdel !== undefined) { steps[Number(b.dataset.stepimgdel)].img = ''; redrawSteps(); return; }
        if (b.dataset.stepimg !== undefined) { const i = Number(b.dataset.stepimg); const f = await pickFile('image/*'); if (!f) return; try { steps[i].img = await shrinkImage(f); redrawSteps(); } catch { toast('Bild konnte nicht gelesen werden', { kind: 'bad' }); } return; }
        if (b.dataset.rc) { h.color = b.dataset.rc; el.querySelectorAll('[data-rc]').forEach(x => x.classList.toggle('on', x === b)); return; }
        if (b.hasAttribute('data-save')) { if (save()) close(); return; }
        if (b.hasAttribute('data-arch')) { S.put('habits', { ...S.get('habits', existing.id), archived: !existing.archived }); toast(existing.archived ? 'Reaktiviert' : 'Archiviert'); close(); return; }
        if (b.hasAttribute('data-del')) {
          if (await confirmDialog(`„${esc(existing.title)}“ samt Verlauf löschen? Im Papierkorb kannst du sie wiederherstellen.`, { ok: 'Löschen', danger: true, title: 'Gewohnheit löschen?', cooldown: 3 })) { const prev = S.remove('habits', existing.id); toast('Gelöscht', { action: 'Rückgängig', onAction: () => S.restore('habits', prev) }); close(); }
        }
      });
      el.addEventListener('input', e => {
        const d = e.target.dataset;
        if (d.stepi !== undefined) steps[Number(d.stepi)].t = e.target.value;
        if (d.stepmin !== undefined) { steps[Number(d.stepmin)].min = Math.max(0, Number(e.target.value) || 0); const tt = el.querySelector('[data-ttot]'); if (tt) tt.textContent = totalMin() ? 'gesamt ' + C.fmtDuration(totalMin()) : ''; }
        if (d.stepbody !== undefined) steps[Number(d.stepbody)].body = e.target.value;
        if (d.steplink !== undefined) steps[Number(d.steplink)].link = e.target.value.trim();
      });
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
          steps: kind === 'routine' ? steps.filter(x => x.t.trim()) : (existing ? existing.steps || [] : []), color: h.color || null, runs: (existing && existing.runs) || [],
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
    <td class="hname" data-edith="${h.id}">${c ? `<i class="catdot" style="background:${catColor(c)};margin-right:6px;vertical-align:1px"></i>` : ''}<b style="display:inline">${esc(h.title)}</b>${h.kind === 'routine' && !h.archived ? ` <button class="btn-go sm" data-rstart="${h.id}" title="Routine starten">${icon('play', 10)}</button>` : ''}<span style="display:block">${esc(sub)}</span></td>
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
    if (ed) { openHabitDetail(ed.dataset.edith); return; }
    const rs = e.target.closest('[data-rstart]');
    if (rs) { A.startRoutine(rs.dataset.rstart); return; }
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

/** Bild für Routine-Schritte verkleinern (max. 1000 px, JPEG) */
function shrinkImage(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = reject;
    fr.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const max = 1000; const sc = Math.min(1, max / Math.max(img.width, img.height));
        const cv = document.createElement('canvas'); cv.width = Math.round(img.width * sc); cv.height = Math.round(img.height * sc);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        resolve(cv.toDataURL('image/jpeg', 0.8));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

function bestStreak(h, now) {
  let best = 0, cur = 0;
  for (let i = 400; i >= 0; i--) {
    const d = C.addDays(C.startOfDay(now), -i);
    if (h.start && C.ymd(d) < h.start) continue;
    if (!C.habitDueOn(h, d)) continue;
    if (C.habitDoneOn(h, C.ymd(d))) { cur++; best = Math.max(best, cur); } else if (i > 0) cur = 0;
  }
  return best;
}

/** Gewohnheit/Routine im Detail: Heatmap, Serien, Quote, Durchschnittsdauer */
export function openHabitDetail(id) {
  const h = S.get('habits', id); if (!h) return;
  const now = A.now();
  const days = [...Array(182)].map((_, i) => { const d = C.addDays(C.startOfDay(now), i - 181); const k = C.ymd(d); const v = C.habitValue(h, k); return { d, v: C.habitDoneOn(h, k) ? 2 : (Array.isArray(v) && v.length) || typeof v === 'number' ? 1 : 0 }; });
  const runs = (h.runs || []).filter(r => r.dur);
  const avg = runs.length ? runs.slice(-20).reduce((a, r) => a + r.dur, 0) / Math.min(20, runs.length) : 0;
  const planned = (h.steps || []).reduce((a, x) => a + (Number(x.min) || 0), 0);
  const streak = C.habitStreak(h, now);
  const best = bestStreak(h, now);
  const st = habitCellState(h, C.ymd(now));
  const evs = S.events(e => e.link && e.link.c === 'habits' && e.link.id === h.id);
  sheet({
    title: `${h.kind === 'routine' ? 'Routine' : C.HABIT_KINDS[h.kind || 'check'].name}: ${esc(h.title)}`, side: !isMobile(),
    body: `<div class="row" style="gap:10px;margin-bottom:10px">${h.kind === 'routine' ? `<button class="btn btn-primary" data-hd="start">${icon('play', 13)}Routine starten</button>` : `<button class="hcell ${st.cls}" data-habit="${h.id}" data-day="${C.ymd(now)}" aria-label="Heute abhaken">${st.label}</button><span class="small">Heute ${C.habitDoneOn(h, C.ymd(now)) ? 'erledigt' : 'offen'}</span>`}<span class="sp"></span><button class="btn btn-ghost sm" data-hd="edit">${icon('edit', 13)}Bearbeiten</button></div>
      <div class="rv-stats"><div><b>${streak}</b><span>Serie</span></div><div><b>${best}</b><span>Beste Serie</span></div><div><b>${Math.round(C.habitRate(h, 30, now) * 100)}%</b><span>Quote 30 Tage</span></div><div><b>${Math.round(C.habitRate(h, 90, now) * 100)}%</b><span>Quote 90 Tage</span></div>${h.kind === 'routine' ? `<div><b>${avg ? esc(C.fmtDuration(Math.max(1, Math.round(avg / 60)))) : '–'}</b><span>Ø Dauer${planned ? ` (Plan ${esc(C.fmtDuration(planned))})` : ''}</span></div>` : ''}</div>
      <div class="section-t">Letzte 6 Monate</div>${heatmap(days, { unit: '', color: h.color || 'var(--ok)', label: 'Verlauf' })}
      ${h.note ? `<div class="section-t">Warum</div><p class="small" style="color:var(--ink-2)">${esc(h.note)}</p>` : ''}
      ${h.kind === 'routine' ? `<div class="section-t">Schritte</div><ol class="rp-steps-intro sm">${(h.steps || []).map((x, i) => `<li><span class="n">${i + 1}</span><span class="grow">${esc(x.t)}${x.body ? ` <span class="tiny muted">· Text</span>` : ''}${x.img ? ` <span class="tiny muted">· Bild</span>` : ''}${x.link ? ` <span class="tiny muted">· Link</span>` : ''}</span>${x.min ? `<span class="m">${x.min} Min</span>` : ''}</li>`).join('')}</ol>` : ''}
      ${runs.length ? `<div class="section-t">Letzte Durchgänge</div>${runs.slice(-8).reverse().map(r => `<div class="rv-row"><span class="grow small">${esc(C.fmtDateShort(C.parseYmd(r.d)))}</span><span class="small muted">${r.steps} Schritte</span><b class="small">${esc(C.fmtDuration(Math.max(1, Math.round(r.dur / 60))))}</b></div>`).join('')}` : ''}
      ${evs.length ? `<div class="section-t">Im Kalender verknüpft</div><div class="small muted">${evs.length} Kalenderblock${evs.length === 1 ? '' : 'e'} – dort startet ein Klick direkt ${h.kind === 'routine' ? 'diese Routine' : 'das Abhaken'}.</div>` : ''}`,
    onMount: (el, close) => el.addEventListener('click', e => {
      const b = e.target.closest('[data-hd]');
      if (b && b.dataset.hd === 'start') { close(); A.startRoutine(h.id); return; }
      if (b && b.dataset.hd === 'edit') { close(); editHabit(S.get('habits', h.id)); return; }
      const c = e.target.closest('[data-habit]');
      if (c) { toggleHabit(c.dataset.habit, c.dataset.day, c); setTimeout(() => { const nst = habitCellState(S.get('habits', h.id), C.ymd(A.now())); c.className = 'hcell ' + nst.cls; c.innerHTML = nst.label; }, 50); }
    }),
  });
}
