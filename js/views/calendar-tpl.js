// Kalender-Vorlagen: Tages- und Wochenvorlagen, A/B-Wochen, Ferien, Woche kopieren, Woche planen
import * as C from '../core.js';
import * as S from '../store.js';
import { esc, icon, sheet, toast, confirmDialog, isMobile, popover, tint } from '../ui.js';
import { A } from '../app-api.js';
import { getCur, evColor } from './calendar.js';

export const BW_HOLIDAYS = [
  { id: 'bw-h26', name: 'Herbstferien', from: '2026-11-02', to: '2026-11-06' },
  { id: 'bw-w26', name: 'Weihnachtsferien', from: '2026-12-23', to: '2027-01-09' },
  { id: 'bw-o27', name: 'Osterferien', from: '2027-03-25', to: '2027-04-03' },
  { id: 'bw-p27', name: 'Pfingstferien', from: '2027-05-18', to: '2027-05-29' },
  { id: 'bw-s27', name: 'Sommerferien', from: '2027-07-29', to: '2027-09-11' },
];
const BLOCK_COLORS = ['#33b679', '#039be5', '#3f51b5', '#1b4f72', '#8e24aa', '#e67c73', '#f6bf26', '#f4511e', '#0b8043', '#616161', '#9aa1a9', '#14a38b'];
const KIND_NAME = { week: 'Wochenvorlage', day: 'Tagesvorlage' };

function mins(t) { if (!t) return 0; const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); }
function hhmm(m) { m = ((m % 1440) + 1440) % 1440; return `${C.pad(Math.floor(m / 60))}:${C.pad(m % 60)}`; }
function blockDur(b) { let d = mins(b.e === '24:00' ? '23:59' : b.e) - mins(b.s); if (b.e === '24:00') d += 1; if (d <= 0) d += 1440; return d; }
function weekLabel(mon) { const e = C.addDays(mon, 6); const w = C.isoWeek(mon).week; return `KW ${w} · ${C.pad(mon.getDate())}.${C.pad(mon.getMonth() + 1)}.–${C.pad(e.getDate())}.${C.pad(e.getMonth() + 1)}.${e.getFullYear()}`; }
function typeLabel(t) { return t === 'a' ? 'A-Woche' : t === 'b' ? 'B-Woche' : t === 'ferien' ? 'Ferienwoche' : 'ohne Regel'; }
function habitOptions(sel) {
  const hs = S.habits(h => !h.archived).sort((a, b) => (a.kind === 'routine' ? 0 : 1) - (b.kind === 'routine' ? 0 : 1) || a.title.localeCompare(b.title));
  return `<option value="">– keine –</option>${hs.map(h => `<option value="${h.id}" ${sel === h.id ? 'selected' : ''}>${h.kind === 'routine' ? '▶ ' : '✓ '}${esc(h.title)}</option>`).join('')}`;
}

/** Mini-Zeitleiste eines Tages (0–24 Uhr) */
function dayStrip(blocks, cls = '') {
  return `<div class="tstrip ${cls}">${blocks.map(b => { const s0 = mins(b.s); const d = blockDur(b); const parts = s0 + d > 1440 ? [[s0, 1440 - s0], [0, s0 + d - 1440]] : [[s0, d]]; return parts.map(([a, l]) => `<i class="${b.theme ? 'th' : ''}" style="left:${(a / 1440) * 100}%;width:${Math.max(0.4, (l / 1440) * 100)}%;--c:${tint(b.color || (b.area === 'b' ? '#3f51b5' : '#039be5'), A.theme())}" title="${esc(b.s + '–' + b.e + ' ' + b.title)}"></i>`).join(''); }).join('')}</div>`;
}
function tplPreview(t) {
  if (t.kind === 'day') return dayStrip(t.blocks || []);
  return `<div class="tweek">${C.WD_SHORT.map((w, i) => `<div><span>${w}</span>${dayStrip((t.blocks || []).filter(b => Number(b.d) === i))}</div>`).join('')}</div>`;
}

/* ---------------- Übersicht ---------------- */
let tab = 'list';
export function openTemplates(start, startTab = 'list') {
  tab = startTab;
  const mon0 = C.startOfWeek(start || getCur());
  sheet({
    title: 'Vorlagen & Regeln', cls: 'sheet-wide' + (isMobile() ? ' sheet-full' : ''),
    body: '<div class="tabs" data-ttabs></div><div data-tbody></div>',
    footer: '<button class="btn" data-close>Schließen</button>',
    onMount: (el, close) => {
      const draw = () => {
        el.querySelector('[data-ttabs]').innerHTML = [['list', 'Vorlagen'], ['rules', 'Regeln: A/B-Wochen & Ferien']].map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-tt="${k}">${l}</button>`).join('');
        el.querySelector('[data-tbody]').innerHTML = tab === 'list' ? listHtml(mon0) : rulesHtml(mon0);
      };
      el.addEventListener('click', async e => {
        const tt = e.target.closest('[data-tt]'); if (tt) { tab = tt.dataset.tt; draw(); return; }
        const b = e.target.closest('[data-ta]'); if (!b) return;
        const a = b.dataset.ta, id = b.dataset.id;
        const t = id ? S.get('templates', id) : null;
        if (a === 'new-week') { editTemplate({ kind: 'week', name: '', blocks: [] }, draw); }
        if (a === 'new-day') { editTemplate({ kind: 'day', name: '', blocks: [] }, draw); }
        if (a === 'save-week') { saveFromCalendar('week', mon0, draw); }
        if (a === 'save-day') { saveFromCalendar('day', getCur(), draw); }
        if (a === 'edit' && t) editTemplate(t, draw);
        if (a === 'apply' && t) { applyFlow(t, t.kind === 'week' ? mon0 : getCur()); }
        if (a === 'dup' && t) { const c = C.structuredCloneSafe(t); delete c.id; delete c.createdAt; c.name = t.name + ' (Kopie)'; c.blocks = (c.blocks || []).map(x => ({ ...x, id: C.uid('b', 5) })); S.put('templates', c); toast('Vorlage kopiert'); draw(); }
        if (a === 'del' && t) {
          if (await confirmDialog(`Vorlage „${esc(t.name)}“ löschen? Bereits eingetragene Termine bleiben im Kalender.`, { ok: 'Löschen', danger: true, title: 'Vorlage löschen?', cooldown: 3 })) { const prev = S.remove('templates', t.id); toast('Vorlage gelöscht', { action: 'Rückgängig', onAction: () => { S.restore('templates', prev); draw(); } }); draw(); }
        }
        if (a === 'plan') { close(); planWeek(mon0); }
        if (a === 'copy') { close(); copyWeek(mon0); }
        if (a === 'anchor') { S.setSettingPath('cal.ab', { ...(S.settings().cal.ab || {}), on: true, anchor: C.ymd(mon0) }); toast(`${weekLabel(mon0)} ist jetzt eine A-Woche`); draw(); }
        if (a === 'hol-add') { const list = [...(S.settings().cal.holidays || [])]; list.push({ id: C.uid('h', 5), name: 'Ferien', from: C.ymd(mon0), to: C.ymd(C.addDays(mon0, 4)) }); S.setSettingPath('cal.holidays', list); draw(); }
        if (a === 'hol-bw') { const have = new Set((S.settings().cal.holidays || []).map(h => h.from + h.to)); const list = [...(S.settings().cal.holidays || []), ...BW_HOLIDAYS.filter(h => !have.has(h.from + h.to)).map(h => ({ ...h, id: C.uid('h', 5) }))]; S.setSettingPath('cal.holidays', list.sort((x, y) => x.from.localeCompare(y.from))); toast('Schulferien Baden-Württemberg eingetragen – bitte mit deiner Schule abgleichen'); draw(); }
        if (a === 'hol-del') { if (await confirmDialog('Diesen Ferienzeitraum entfernen?', { ok: 'Entfernen', danger: true, title: 'Ferien entfernen?', cooldown: 3 })) { S.setSettingPath('cal.holidays', (S.settings().cal.holidays || []).filter(h => h.id !== id)); draw(); } }
      });
      el.addEventListener('change', e => {
        const r = e.target.closest('[data-rule]');
        if (r) {
          const k = r.dataset.rule; const cal = S.settings().cal;
          if (k === 'ab.on') S.setSettingPath('cal.ab', { ...(cal.ab || {}), on: r.checked });
          else if (k === 'ab.a' || k === 'ab.b') S.setSettingPath('cal.ab', { ...(cal.ab || {}), [k.slice(3)]: r.value });
          else if (k === 'holidayTpl') S.setSettingPath('cal.holidayTpl', r.value);
          draw();
        }
        const h = e.target.closest('[data-hol]');
        if (h) { const [id, f] = h.dataset.hol.split(':'); const list = (S.settings().cal.holidays || []).map(x => x.id === id ? { ...x, [f]: h.value } : x); S.setSettingPath('cal.holidays', list); }
      });
      draw();
    },
  });
}

function listHtml(mon0) {
  const all = S.templates();
  const weeks = all.filter(t => t.kind === 'week'), days = all.filter(t => t.kind === 'day');
  const s = S.settings();
  const wt = C.weekType(s, mon0);
  const auto = C.templateForWeek(s, mon0);
  const row = t => `<div class="tpl-row"><div class="grow"><div class="row" style="gap:6px"><b>${esc(t.name)}</b>${auto === t.id ? `<span class="pill st-geplant">passt zu ${esc(weekLabel(mon0).split(' · ')[0])}</span>` : ''}</div><div class="tiny muted">${(t.blocks || []).length} Blöcke${t.note ? ' · ' + esc(t.note) : ''}</div>${tplPreview(t)}</div>
    <div class="tpl-acts"><button class="btn sm btn-primary" data-ta="apply" data-id="${t.id}">Anwenden</button><button class="btn sm" data-ta="edit" data-id="${t.id}">${icon('edit', 12)}Bearbeiten</button><button class="icon-btn sm" data-ta="dup" data-id="${t.id}" title="Kopieren" aria-label="Kopieren">${icon('copy', 14)}</button><button class="icon-btn sm" data-ta="del" data-id="${t.id}" title="Löschen" aria-label="Löschen">${icon('trash', 14)}</button></div></div>`;
  return `<div class="tpl-top"><div class="grow"><b>${esc(weekLabel(mon0))}</b><div class="tiny muted">Regel: ${esc(typeLabel(wt))}${auto ? ` → Vorlage „${esc((S.get('templates', auto) || {}).name || '?')}“` : ''}</div></div>
      <button class="btn sm btn-primary" data-ta="plan">${icon('calendar', 13)}Woche planen</button><button class="btn sm" data-ta="copy">${icon('copy', 13)}Woche kopieren</button></div>
    <div class="section-t row"><span class="grow">Wochenvorlagen</span><button class="btn sm btn-ghost" data-ta="save-week">${icon('download', 12)}Diese Woche speichern</button><button class="btn sm" data-ta="new-week">${icon('plus', 12)}Neu</button></div>
    ${weeks.map(row).join('') || '<p class="small muted">Noch keine Wochenvorlage.</p>'}
    <div class="section-t row"><span class="grow">Tagesvorlagen</span><button class="btn sm btn-ghost" data-ta="save-day">${icon('download', 12)}Tag ${esc(C.fmtDateShort(getCur()))} speichern</button><button class="btn sm" data-ta="new-day">${icon('plus', 12)}Neu</button></div>
    ${days.map(row).join('') || '<p class="small muted">Noch keine Tagesvorlage.</p>'}
    <p class="hint">Vorlagen tragen nichts von selbst ein. Du entscheidest pro Woche, ob du ergänzt oder ersetzt – mit Vorschau vorher.</p>`;
}

function rulesHtml(mon0) {
  const cal = S.settings().cal || {};
  const ab = cal.ab || {};
  const weeks = S.templates(t => t.kind === 'week');
  const opt = sel => `<option value="">– keine –</option>${weeks.map(t => `<option value="${t.id}" ${sel === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}`;
  const hol = cal.holidays || [];
  const next = [...Array(6)].map((_, i) => C.addDays(mon0, i * 7));
  return `<div class="set-sec" style="margin-top:6px">
      <label class="optrow"><span class="grow"><b>A/B-Wochen</b><span class="tiny muted" style="display:block">Für einen Zwei-Wochen-Rhythmus, z. B. Berufsschule montags nur jede zweite Woche.</span></span><label class="switch"><input type="checkbox" data-rule="ab.on" ${ab.on ? 'checked' : ''}><span></span></label></label>
      ${true ? `<div class="fgrid" style="margin-top:8px;${ab.on ? '' : 'opacity:.6'}"><div class="field"><label>Vorlage A-Woche</label><select class="select" data-rule="ab.a">${opt(ab.a)}</select></div><div class="field"><label>Vorlage B-Woche</label><select class="select" data-rule="ab.b">${opt(ab.b)}</select></div></div>
        <div class="row" style="margin-top:8px"><span class="small grow">${ab.anchor ? `Bezug: Woche ab ${esc(C.fmtDateShort(C.parseYmd(ab.anchor)))} ist eine A-Woche.` : 'Lege fest, welche Woche eine A-Woche ist – das schaltet A/B-Wochen ein.'}</span><button class="btn sm" data-ta="anchor">${esc(weekLabel(mon0).split(' · ')[0])} ist A-Woche</button></div>` : ''}
      <div class="field" style="margin-top:12px"><label>Vorlage in Ferienwochen</label><select class="select" data-rule="holidayTpl">${opt(cal.holidayTpl)}</select><div class="hint">In den Schulferien gilt diese Vorlage statt A/B (z. B. ohne Berufsschule).</div></div>
      <div class="tiny muted" style="margin-top:10px">Die nächsten Wochen: ${next.map(m => `<span class="chip sm">${C.isoWeek(m).week}: ${esc(typeLabel(C.weekType(S.settings(), m)))}</span>`).join(' ')}</div>
    </div>
    <div class="section-t row"><span class="grow">Ferien & freie Zeiträume</span><button class="btn sm btn-ghost" data-ta="hol-bw">Schulferien BW eintragen</button><button class="btn sm" data-ta="hol-add">${icon('plus', 12)}Zeitraum</button></div>
    ${hol.length ? hol.map(h => `<div class="hol-row"><input class="input sm" data-hol="${h.id}:name" value="${esc(h.name || '')}" aria-label="Name"><input class="input sm" type="date" data-hol="${h.id}:from" value="${esc(h.from)}" aria-label="Von"><span class="muted">–</span><input class="input sm" type="date" data-hol="${h.id}:to" value="${esc(h.to)}" aria-label="Bis"><button class="icon-btn sm" data-ta="hol-del" data-id="${h.id}" aria-label="Entfernen">${icon('trash', 13)}</button></div>`).join('') : '<p class="small muted">Noch keine Ferien eingetragen.</p>'}
    <p class="hint">Ferien erscheinen als Hinweis im Kalender und steuern die Wochenregel. Die BW-Termine sind ein Vorschlag – Schulen können abweichen.</p>`;
}

/* ---------------- Editor ---------------- */
export function editTemplate(t0, onDone) {
  const t = C.structuredCloneSafe(t0);
  t.blocks = (t.blocks || []).map(b => ({ ...b, id: b.id || C.uid('b', 5) }));
  let day = 0;
  const isWeek = t.kind === 'week';
  const sorted = () => t.blocks.filter(b => !isWeek || Number(b.d) === day).sort((a, b) => mins(a.s) - mins(b.s));
  const rowHtml = b => `<div class="tb-row" data-b="${b.id}">
      <input type="color" class="tb-col" data-bf="color" value="${esc(b.color || (b.area === 'b' ? '#3f51b5' : '#039be5'))}" aria-label="Farbe">
      <input class="input sm tb-t" type="time" data-bf="s" value="${esc(b.s)}" aria-label="Beginn"><input class="input sm tb-t" type="time" data-bf="e" value="${esc(b.e === '24:00' ? '23:59' : b.e)}" aria-label="Ende">
      <input class="input sm grow" data-bf="title" value="${esc(b.title)}" placeholder="Titel" aria-label="Titel">
      <select class="select sm tb-area" data-bf="area" aria-label="Bereich"><option value="p" ${b.area !== 'b' ? 'selected' : ''}>Privat</option><option value="b" ${b.area === 'b' ? 'selected' : ''}>Geschäftl.</option></select>
      <select class="select sm tb-link" data-bf="link" aria-label="Verknüpft mit" title="Mit Routine oder Gewohnheit verknüpfen">${habitOptions(b.link && b.link.c === 'habits' ? b.link.id : '')}</select>
      <label class="tb-flag" title="Themenblock: dezente Fläche im Hintergrund, passende Vorgänge werden vorgeschlagen"><input type="checkbox" data-bf="theme" ${b.theme ? 'checked' : ''}><span>Thema</span></label>
      <label class="tb-flag" title="Erinnerung zum Beginn"><input type="checkbox" data-bf="rem" ${b.rem ? 'checked' : ''}><span>${icon('bell', 12)}</span></label>
      ${isWeek ? `<button type="button" class="icon-btn sm" data-bcopy="${b.id}" title="Auf andere Tage kopieren" aria-label="Kopieren">${icon('copy', 13)}</button>` : ''}
      <button type="button" class="icon-btn sm" data-bdel="${b.id}" title="Entfernen" aria-label="Entfernen">${icon('x', 13)}</button>
    </div>`;
  sheet({
    title: t.id ? `${KIND_NAME[t.kind]} bearbeiten` : `Neue ${KIND_NAME[t.kind]}`, cls: 'sheet-wide' + (isMobile() ? ' sheet-full' : ''),
    body: `<div class="fgrid"><div class="field"><label>Name</label><input class="input" data-tn value="${esc(t.name)}" placeholder="${isWeek ? 'z. B. A-Woche' : 'z. B. Ausbildungstag'}"></div><div class="field"><label>Notiz</label><input class="input" data-tnote value="${esc(t.note || '')}" placeholder="Wofür ist die Vorlage?"></div></div>
      <div data-tprev style="margin:12px 0 4px"></div>
      ${isWeek ? `<div class="row wrap" style="margin-top:10px"><div class="chips" data-tdays></div><span class="sp"></span><select class="select sm" data-tinsert aria-label="Tagesvorlage einfügen"><option value="">Tagesvorlage einfügen …</option>${S.templates(x => x.kind === 'day').map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></div>` : ''}
      <div class="tb-list" data-tlist></div>
      <div class="row" style="margin-top:8px"><button type="button" class="btn sm" data-badd>${icon('plus', 12)}Block</button><span class="hint grow">Blöcke über Mitternacht (z. B. Schlaf 22:00–05:00) sind erlaubt. „Thema“ = Hintergrundfläche mit Vorschlägen.</span></div>`,
    footer: `<button class="btn" data-close>Abbrechen</button><button class="btn btn-primary" data-tsave>Speichern</button>`,
    onMount: (el, close) => {
      const read = () => {
        el.querySelectorAll('[data-b]').forEach(r => {
          const b = t.blocks.find(x => x.id === r.dataset.b); if (!b) return;
          const v = n => r.querySelector(`[data-bf="${n}"]`);
          b.s = v('s').value || b.s; b.e = v('e').value || b.e; if (b.e === '23:59') b.e = '24:00';
          b.title = v('title').value; b.area = v('area').value; b.color = v('color').value;
          b.theme = v('theme').checked; b.rem = v('rem').checked;
          const lid = v('link').value; b.link = lid ? { c: 'habits', id: lid } : null; if (lid) delete b.linkName;
        });
        t.name = el.querySelector('[data-tn]').value.trim(); t.note = el.querySelector('[data-tnote]').value.trim();
      };
      const draw = () => {
        el.querySelector('[data-tprev]').innerHTML = tplPreview(t);
        if (isWeek) el.querySelector('[data-tdays]').innerHTML = C.WD_SHORT.map((w, i) => `<button type="button" class="chip ${i === day ? 'on' : ''}" data-td="${i}">${w} <span class="faint">${t.blocks.filter(b => Number(b.d) === i).length}</span></button>`).join('');
        el.querySelector('[data-tlist]').innerHTML = sorted().map(rowHtml).join('') || '<p class="small muted" style="padding:8px 0">Noch keine Blöcke an diesem Tag.</p>';
      };
      el.addEventListener('click', e => {
        const td = e.target.closest('[data-td]'); if (td) { read(); day = Number(td.dataset.td); draw(); return; }
        if (e.target.closest('[data-badd]')) { read(); const last = sorted().slice(-1)[0]; const s0 = last ? last.e : '08:00'; const st = s0 === '24:00' ? '08:00' : s0; t.blocks.push({ id: C.uid('b', 5), d: day, s: st, e: hhmm(mins(st) + 60), title: '', area: A.area() === 'b' ? 'b' : 'p', color: BLOCK_COLORS[t.blocks.length % BLOCK_COLORS.length], theme: false, rem: false }); draw(); const rows = el.querySelectorAll('[data-b] [data-bf="title"]'); rows[rows.length - 1]?.focus(); return; }
        const bd = e.target.closest('[data-bdel]'); if (bd) { read(); t.blocks = t.blocks.filter(b => b.id !== bd.dataset.bdel); draw(); return; }
        const bc = e.target.closest('[data-bcopy]');
        if (bc) {
          read();
          const b = t.blocks.find(x => x.id === bc.dataset.bcopy);
          popover(bc, `<div><b class="small">„${esc(b.title || 'Block')}“ kopieren nach</b><div class="wd-pick" style="margin:8px 0">${C.WD_SHORT.map((w, i) => `<button type="button" data-cd="${i}" class="${i === Number(b.d) ? 'on' : ''}" ${i === Number(b.d) ? 'disabled' : ''}>${w}</button>`).join('')}</div><div class="row"><button class="btn sm" data-cdw>Mo–Fr</button><span class="sp"></span><button class="btn sm btn-primary" data-cdok>Kopieren</button></div></div>`, {
            width: 280, place: 'below',
            onMount: (pe, pclose) => {
              const sel = new Set();
              pe.addEventListener('click', ev => {
                const x = ev.target.closest('[data-cd]'); if (x && !x.disabled) { const i = Number(x.dataset.cd); if (sel.has(i)) sel.delete(i); else sel.add(i); x.classList.toggle('on', sel.has(i)); return; }
                if (ev.target.closest('[data-cdw]')) { [0, 1, 2, 3, 4].filter(i => i !== Number(b.d)).forEach(i => sel.add(i)); pe.querySelectorAll('[data-cd]').forEach(y => y.classList.toggle('on', sel.has(Number(y.dataset.cd)) || Number(y.dataset.cd) === Number(b.d))); return; }
                if (ev.target.closest('[data-cdok]')) { for (const i of sel) t.blocks.push({ ...b, id: C.uid('b', 5), d: i }); pclose(); draw(); toast(`Auf ${sel.size} Tag(e) kopiert`, { ms: 1400 }); }
              });
            },
          });
          return;
        }
        if (e.target.closest('[data-tsave]')) {
          read();
          if (!t.name) { el.querySelector('[data-tn]').focus(); toast('Bitte gib der Vorlage einen Namen'); return; }
          t.blocks = t.blocks.filter(b => b.title.trim() && b.s && b.e);
          if (!t.id) t.order = S.templates().length;
          S.put('templates', t);
          toast('Vorlage gespeichert');
          close(); onDone && onDone();
        }
      });
      el.addEventListener('change', e => {
        const ins = e.target.closest('[data-tinsert]');
        if (ins && ins.value) { read(); const d = S.get('templates', ins.value); if (d) { for (const b of d.blocks || []) t.blocks.push({ ...b, id: C.uid('b', 5), d: day }); toast(`„${esc(d.name)}“ auf ${C.WD_LONG[day]} eingefügt`, { ms: 1600 }); } ins.value = ''; draw(); return; }
        if (e.target.closest('[data-bf]')) { read(); el.querySelector('[data-tprev]').innerHTML = tplPreview(t); }
      });
      draw();
    },
  });
}

/* ---------------- Aus dem Kalender speichern ---------------- */
function saveFromCalendar(kind, start, onDone) {
  const d0 = kind === 'week' ? C.startOfWeek(start) : C.startOfDay(start);
  const d1 = C.addDays(d0, kind === 'week' ? 7 : 1);
  const occ = C.expandEvents(S.events(e => !e.allDay && !e.taskId), d0, d1).filter(o => o.start >= d0 && o.start < d1);
  if (!occ.length) { toast(kind === 'week' ? 'In dieser Woche gibt es keine Termine zum Speichern' : 'An diesem Tag gibt es keine Termine zum Speichern'); return; }
  const blocks = occ.map(o => ({ id: C.uid('b', 5), d: C.wdIdx(o.start), s: C.hm(o.start), e: (o.end - o.start) >= C.DAY ? '24:00' : C.hm(o.end), title: o.ev.title, area: o.ev.area || 'p', cat: o.ev.cat || null, color: o.ev.color || null, theme: !!o.ev.theme, link: o.ev.link || null, rem: !!(o.ev.rem && o.ev.rem.length) }));
  editTemplate({ kind, name: kind === 'week' ? `Woche ${C.isoWeek(d0).week}` : `${C.WD_LONG[C.wdIdx(d0)]}-Vorlage`, blocks: kind === 'day' ? blocks.map(b => ({ ...b, d: 0 })) : blocks }, onDone);
}

/* ---------------- Anwenden mit Vorschau ---------------- */
function existingIn(d0, d1) {
  const all = S.events(e => !e.allDay);
  const fromTpl = all.filter(e => (e.fromTpl || e.fromCopy) && !(e.rec && e.rec.f) && C.parseLocal(e.s) < d1 && C.parseLocal(e.e || e.s) > d0);
  const manual = C.expandEvents(all.filter(e => !e.fromTpl && !e.fromCopy && !e.theme), d0, d1);
  return { fromTpl, manual };
}
function conflictCount(evs, manual) {
  let n = 0;
  for (const e of evs) { if (e.theme) continue; const s = C.parseLocal(e.s), en = C.parseLocal(e.e); if (manual.some(o => o.start < en && o.end > s)) n++; }
  return n;
}

export function applyFlow(t, start) {
  let mode = 'add';
  let base = t.kind === 'week' ? C.startOfWeek(start) : C.startOfDay(start);
  sheet({
    title: `Vorlage anwenden: ${esc(t.name)}`, cls: 'sheet-md',
    body: `<div class="row wrap"><div class="field" style="margin:0"><label>${t.kind === 'week' ? 'Woche (beliebiger Tag)' : 'Tag'}</label><input class="input" type="date" data-ad value="${C.ymd(base)}"></div>
      <div class="seg" data-am role="group" aria-label="Art" style="align-self:flex-end"><button data-m="add" aria-pressed="true">Ergänzen</button><button data-m="replace" aria-pressed="false">Ersetzen</button></div></div>
      <div data-aprev style="margin-top:12px"></div>`,
    footer: `<button class="btn" data-close>Abbrechen</button><button class="btn btn-primary" data-ago>Anwenden</button>`,
    onMount: (el, close) => {
      let evs = [], ex = null;
      const draw = () => {
        const d1 = C.addDays(base, t.kind === 'week' ? 7 : 1);
        evs = C.templateEvents(t, base, S.getData());
        ex = existingIn(base, d1);
        const conf = conflictCount(evs, ex.manual);
        const byDay = {};
        for (const e of evs) { const k = e.s.slice(0, 10); (byDay[k] = byDay[k] || []).push(e); }
        const wt = t.kind === 'week' ? C.weekType(S.settings(), base) : '';
        el.querySelector('[data-aprev]').innerHTML = `<div class="small" style="margin-bottom:8px"><b>${t.kind === 'week' ? esc(weekLabel(base)) : esc(C.fmtDateLong(base))}</b>${wt ? ` · ${esc(typeLabel(wt))}` : ''}</div>
          <div class="ap-sum"><span><b>${evs.length}</b> Blöcke werden angelegt</span>${mode === 'replace' ? `<span class="${ex.fromTpl.length ? 'warn' : ''}"><b>${ex.fromTpl.length}</b> Blöcke aus früheren Vorlagen/Kopien werden entfernt</span>` : ex.fromTpl.length ? `<span><b>${ex.fromTpl.length}</b> Vorlagen-Blöcke sind schon da (Ergänzen = doppelt)</span>` : ''}${conf ? `<span class="warn"><b>${conf}</b> überschneiden sich mit deinen Terminen</span>` : ''}</div>
          <div class="ap-days">${Object.entries(byDay).sort().map(([k, list]) => { const d = C.parseYmd(k); return `<div class="ap-day"><div class="ap-dh"><b>${C.WD_SHORT[C.wdIdx(d)]} ${d.getDate()}.</b>${C.inHoliday(S.settings(), d) ? ' 🏖️' : ''}</div>${list.map(e => `<div class="ap-ev ${e.theme ? 'th' : ''}"><i style="background:${evColor(e)}"></i><span class="num">${e.s.slice(11)}</span><span class="ellip">${esc(e.title)}</span></div>`).join('')}</div>`; }).join('')}</div>
          <p class="hint">Deine eigenen Termine und Zeitblöcke von Vorgängen bleiben immer erhalten. „Ersetzen“ entfernt nur Blöcke, die vorher aus einer Vorlage oder Kopie kamen.</p>`;
      };
      el.addEventListener('click', async e => {
        const m = e.target.closest('[data-m]'); if (m) { mode = m.dataset.m; el.querySelectorAll('[data-m]').forEach(x => x.setAttribute('aria-pressed', x === m)); draw(); return; }
        if (e.target.closest('[data-ago]')) {
          if (mode === 'replace' && ex.fromTpl.length) {
            const ok = await confirmDialog(`${ex.fromTpl.length} Vorlagen-Blöcke in diesem Zeitraum werden durch „${esc(t.name)}“ ersetzt.`, { ok: 'Ersetzen', title: 'Blöcke ersetzen?', cooldown: 3 });
            if (!ok) return;
          }
          const removed = mode === 'replace' ? ex.fromTpl.map(x => ({ ...x })) : [];
          for (const r of removed) S.purge('events', r.id);
          const created = evs.map(x => ({ ...x, id: C.uid('e') }));
          S.putMany('events', created);
          close();
          toast(`${created.length} Blöcke aus „${esc(t.name)}“ eingetragen`, { ms: 6000, action: 'Rückgängig', onAction: () => { for (const c of created) S.purge('events', c.id); for (const r of removed) { const x = { ...r }; delete x.deleted; S.put('events', x); } } });
        }
      });
      el.querySelector('[data-ad]').addEventListener('change', e => { const d = C.parseYmd(e.target.value); if (d) { base = t.kind === 'week' ? C.startOfWeek(d) : C.startOfDay(d); draw(); } });
      draw();
    },
  });
}

/** Woche nach Regel planen: passende Vorlage (A/B/Ferien) vorschlagen */
export function planWeek(start) {
  const mon = C.startOfWeek(start || getCur());
  const s = S.settings();
  const id = C.templateForWeek(s, mon);
  const t = id ? S.get('templates', id) : null;
  if (t) { applyFlow(t, mon); return; }
  const weeks = S.templates(x => x.kind === 'week');
  if (!weeks.length) { openTemplates(mon); return; }
  sheet({
    title: `Woche planen · ${esc(weekLabel(mon))}`, cls: 'sheet-sm',
    body: `<p class="small muted" style="margin-top:0">Für diese Woche ist keine Regel hinterlegt (${esc(typeLabel(C.weekType(s, mon)))}). Welche Vorlage passt?</p>${weeks.map(w => `<button class="tpl-pick" data-pick="${w.id}"><b>${esc(w.name)}</b>${tplPreview(w)}</button>`).join('')}
      <p class="hint">Tipp: Unter „Vorlagen & Regeln“ legst du A/B-Wochen und Ferien fest – dann wird automatisch die richtige Vorlage vorgeschlagen.</p>`,
    footer: `<button class="btn btn-ghost" data-rules>Regeln festlegen</button><span class="sp"></span><button class="btn" data-close>Abbrechen</button>`,
    onMount: (el, close) => el.addEventListener('click', e => {
      const p = e.target.closest('[data-pick]'); if (p) { close(); applyFlow(S.get('templates', p.dataset.pick), mon); return; }
      if (e.target.closest('[data-rules]')) { close(); openTemplates(mon, 'rules'); }
    }),
  });
}

/** Eine Woche in die angezeigte Woche kopieren */
export function copyWeek(target) {
  const to = C.startOfWeek(target || getCur());
  let from = C.addDays(to, -7);
  let withBoxes = false, mode = 'add';
  sheet({
    title: `Woche kopieren nach ${esc(weekLabel(to).split(' · ')[0])}`, cls: 'sheet-md',
    body: `<div class="row wrap"><div class="field" style="margin:0"><label>Von Woche (beliebiger Tag)</label><input class="input" type="date" data-cf value="${C.ymd(from)}"></div>
      <div class="seg" data-cm role="group" aria-label="Art" style="align-self:flex-end"><button data-m="add" aria-pressed="true">Ergänzen</button><button data-m="replace" aria-pressed="false">Ersetzen</button></div></div>
      <label class="optrow" style="margin-top:10px"><span class="grow">Zeitblöcke von Vorgängen mitkopieren</span><label class="switch sm"><input type="checkbox" data-cb><span class="tr"></span></label></label>
      <div data-cprev style="margin-top:10px"></div>`,
    footer: `<button class="btn" data-close>Abbrechen</button><button class="btn btn-primary" data-cgo>Kopieren</button>`,
    onMount: (el, close) => {
      let src = [], ex = null;
      const draw = () => {
        const f1 = C.addDays(from, 7);
        src = S.events(e => !e.allDay && !(e.rec && e.rec.f) && (withBoxes || !e.taskId)).filter(e => { const s0 = C.parseLocal(e.s); return s0 >= from && s0 < f1; });
        ex = existingIn(to, C.addDays(to, 7));
        el.querySelector('[data-cprev]').innerHTML = `<div class="ap-sum"><span><b>${src.length}</b> einmalige Termine aus ${esc(weekLabel(from))}</span>${mode === 'replace' ? `<span class="${ex.fromTpl.length ? 'warn' : ''}"><b>${ex.fromTpl.length}</b> Vorlagen-/Kopie-Blöcke der Zielwoche werden entfernt</span>` : ''}</div>
          ${src.length ? `<div class="ap-days">${[0, 1, 2, 3, 4, 5, 6].map(i => { const list = src.filter(e => C.wdIdx(C.parseLocal(e.s)) === i).sort((a, b) => a.s.localeCompare(b.s)); return list.length ? `<div class="ap-day"><div class="ap-dh"><b>${C.WD_SHORT[i]}</b></div>${list.map(e => `<div class="ap-ev"><i style="background:${evColor(e)}"></i><span class="num">${e.s.slice(11)}</span><span class="ellip">${esc(e.title)}</span></div>`).join('')}</div>` : ''; }).join('')}</div>` : '<p class="small muted">In dieser Woche gibt es keine einmaligen Termine. Serientermine wiederholen sich ohnehin.</p>'}`;
      };
      el.addEventListener('click', async e => {
        const m = e.target.closest('[data-m]'); if (m) { mode = m.dataset.m; el.querySelectorAll('[data-m]').forEach(x => x.setAttribute('aria-pressed', x === m)); draw(); return; }
        if (e.target.closest('[data-cgo]')) {
          if (!src.length) { toast('Nichts zum Kopieren'); return; }
          if (C.ymd(from) === C.ymd(to)) { toast('Quelle und Ziel sind dieselbe Woche'); return; }
          if (mode === 'replace' && ex.fromTpl.length && !(await confirmDialog(`${ex.fromTpl.length} Vorlagen-/Kopie-Blöcke der Zielwoche werden entfernt und durch die Kopie ersetzt.`, { ok: 'Ersetzen', title: 'Blöcke ersetzen?', cooldown: 3 }))) return;
          const shift = C.daysBetween(from, to);
          const removed = mode === 'replace' ? ex.fromTpl.map(x => ({ ...x })) : [];
          for (const r of removed) S.purge('events', r.id);
          const created = src.map(e => { const x = { ...e }; delete x.createdAt; delete x.updatedAt; x.id = C.uid('e'); x.s = C.fmtLocal(C.addDays(C.parseLocal(e.s), shift)); x.e = C.fmtLocal(C.addDays(C.parseLocal(e.e || e.s), shift)); x.fromCopy = C.weekKey(from); x.boxDone = false; return x; });
          S.putMany('events', created);
          close();
          toast(`${created.length} Termine kopiert`, { ms: 6000, action: 'Rückgängig', onAction: () => { for (const c of created) S.purge('events', c.id); for (const r of removed) { const x = { ...r }; delete x.deleted; S.put('events', x); } } });
        }
      });
      el.addEventListener('change', e => {
        if (e.target.matches('[data-cf]')) { const d = C.parseYmd(e.target.value); if (d) { from = C.startOfWeek(d); draw(); } }
        if (e.target.matches('[data-cb]')) { withBoxes = e.target.checked; draw(); }
      });
      draw();
    },
  });
}
