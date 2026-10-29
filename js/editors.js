// Termin-Editor und Einplanen (Timeboxing)
import * as C from './core.js';
import * as S from './store.js';
import { esc, icon, sheet, confirmDialog, toast, isMobile } from './ui.js';
import { A } from './app-api.js';
import { catSelect } from './views/common.js';
import { recHtml, recBind, recRead } from './recur-ui.js';
import { handleNewOption } from './entities.js';

export function placeThumb(seg) {
  if (!seg) return;
  const th = seg.querySelector('.seg-thumb');
  const on = seg.querySelector('button[aria-pressed="true"]');
  if (!th || !on) return;
  th.style.width = on.offsetWidth + 'px';
  th.style.transform = `translateX(${on.offsetLeft - 3}px)`;
}

const EV_REMS = [[0, 'Zum Beginn'], [5, '5 Min'], [10, '10 Min'], [15, '15 Min'], [30, '30 Min'], [60, '1 Std'], [1440, '1 Tag']];

/** Vorgang als Zeitblock (Timebox) in den Kalender legen */
export function planTaskInCalendar(t, start = null) {
  const now = A.now();
  if (!start) {
    if (t.due && t.dueTime) start = C.addMinutes(C.parseLocal(t.due + 'T' + t.dueTime), -(t.dur || 60));
    else {
      const base = t.due ? C.parseYmd(t.due) : now;
      const h = C.sameDay(base, now) ? Math.min(21, now.getHours() + 1) : 15;
      start = C.setTime(base, `${h}:00`);
    }
    if (start < now) start = C.setTime(now, `${Math.min(22, now.getHours() + 1)}:00`);
  }
  const end = C.addMinutes(start, t.dur || 60);
  openEventEditor(null, { title: t.title, area: t.area, cat: t.cat, s: C.fmtLocal(start), e: C.fmtLocal(end), taskId: t.id });
}

/** Timebox direkt anlegen (Drag & Drop aus der Einplanen-Liste) */
export function createTimebox(t, start, durMin) {
  const end = C.addMinutes(start, durMin || t.dur || 60);
  const ev = S.put('events', { title: t.title, area: t.area || 'p', cat: t.cat || null, allDay: false, s: C.fmtLocal(start), e: C.fmtLocal(end), taskId: t.id, rem: null, rec: null });
  let x = C.addLog(t, `Eingeplant: ${C.fmtDateShort(start)}, ${C.hm(start)}–${C.hm(end)} Uhr`, 'system');
  if (C.statusOf(t) === 'neu') x = { ...x, status: 'geplant' };
  S.put('tasks', x);
  return ev;
}

export function openEventEditor(id, preset = {}, occ = null) {
  const existing = id ? S.event(id) : null;
  const s = S.settings();
  const now = A.now();
  const area0 = preset.area || (A.area() === 'all' ? 'p' : A.area());
  let ev;
  if (existing) {
    ev = C.structuredCloneSafe(existing);
    if (occ && existing.rec) {
      const durMs = C.parseLocal(existing.e) - C.parseLocal(existing.s);
      ev.s = existing.allDay ? C.ymd(occ) : C.fmtLocal(occ);
      ev.e = existing.allDay ? C.ymd(C.addDays(occ, Math.round(durMs / C.DAY))) : C.fmtLocal(new Date(occ.getTime() + durMs));
    }
  } else {
    const st = C.setTime(now, `${Math.min(22, now.getHours() + 1)}:00`);
    ev = { title: '', area: area0, cat: null, allDay: false, s: C.fmtLocal(st), e: C.fmtLocal(C.addMinutes(st, 60)), loc: '', notes: '', rem: null, rec: null, ...preset };
  }
  const allDay = !!ev.allDay;
  const sD = ev.s.slice(0, 10), sT = allDay ? '09:00' : (ev.s.slice(11, 16) || '09:00');
  const eD = (ev.e || ev.s).slice(0, 10), eT = allDay ? '10:00' : ((ev.e || '').slice(11, 16) || '10:00');
  const remSel = new Set(Array.isArray(ev.rem) ? ev.rem : s.rem.event);
  const isSeries = existing && existing.rec && existing.rec.f;
  const linked = ev.taskId ? S.task(ev.taskId) : null;

  const body = `
    <input class="title-in" data-f="title" placeholder="Titel hinzufügen" value="${esc(ev.title)}" ${existing ? '' : 'autofocus'} aria-label="Titel">
    ${isSeries && occ ? `<div class="banner" style="margin:12px 0 0">${icon('repeat', 15)}<span class="grow">Serientermin. Änderungen gelten für</span><select class="select" data-f="scope" style="width:auto;height:30px"><option value="one">nur diesen Termin</option><option value="all">alle Termine</option></select></div>` : ''}
    ${linked ? `<div class="banner" style="margin:12px 0 0">${icon('link', 15)}<span class="grow">Zeitblock für den Vorgang <b>${esc(linked.title)}</b></span><button type="button" class="link-btn" data-act="opentask">Öffnen</button></div>` : ''}
    <div class="props" style="margin-top:14px">
      <div class="k">${icon('clock', 15)}Ganztägig</div><div class="v"><label class="switch"><input type="checkbox" data-f="allDay" ${allDay ? 'checked' : ''}><span class="tr"></span></label></div>
      <div class="k">Beginn</div><div class="v"><input class="input" type="date" data-f="sD" value="${sD}" aria-label="Beginn Datum"><input class="input ${allDay ? 'hide' : ''}" type="time" data-f="sT" value="${sT}" step="300" data-time aria-label="Beginn Uhrzeit"></div>
      <div class="k">Ende</div><div class="v"><input class="input" type="date" data-f="eD" value="${eD}" aria-label="Ende Datum"><input class="input ${allDay ? 'hide' : ''}" type="time" data-f="eT" value="${eT}" step="300" data-time aria-label="Ende Uhrzeit"></div>
      <div class="k">Bereich</div><div class="v"><select class="select" data-f="area"><option value="p" ${ev.area !== 'b' ? 'selected' : ''}>Privat</option><option value="b" ${ev.area === 'b' ? 'selected' : ''}>Geschäftlich</option></select></div>
      <div class="k">${icon('tag', 15)}Kategorie</div><div class="v" data-catbox>${catSelect(ev.area, ev.cat, `data-f="cat" data-prev="${ev.cat || ''}"`)}</div>
      <div class="k">${icon('pin', 15)}Ort</div><div class="v"><input class="input" data-f="loc" value="${esc(ev.loc || '')}" placeholder="Adresse oder Raum"></div>
      <div class="k">${icon('layers', 15)}Themenblock</div><div class="v"><label class="switch"><input type="checkbox" data-f="theme" ${ev.theme ? 'checked' : ''}><span class="tr"></span></label><span class="hint" style="margin-left:8px">Dezente Fläche, passende Vorgänge werden vorgeschlagen</span></div>
      <div class="k">${icon('link', 15)}Verknüpft</div><div class="v"><select class="select" data-f="link" aria-label="Mit Routine oder Gewohnheit verknüpfen"><option value="">– keine –</option>${S.habits(h => !h.archived).sort((a, b) => (a.kind === 'routine' ? 0 : 1) - (b.kind === 'routine' ? 0 : 1) || a.title.localeCompare(b.title)).map(h => `<option value="${h.id}" ${ev.link && ev.link.c === 'habits' && ev.link.id === h.id ? 'selected' : ''}>${h.kind === 'routine' ? '▶ Routine: ' : '✓ '}${esc(h.title)}</option>`).join('')}</select></div>
    </div>
    ${recHtml(ev.rec, sD)}
    <div class="field"><label>${icon('bell', 15)}Erinnerungen</label><div class="chips">${EV_REMS.map(([m, l]) => `<button type="button" class="chip ${remSel.has(m) ? 'on' : ''}" data-rem="${m}">${l}</button>`).join('')}</div>
      <span class="hint">Ganztägige Termine erinnern morgens um ${esc(s.rem.allDayAt)} Uhr.</span></div>
    <div class="field"><label for="ee-notes">${icon('notes', 15)}Beschreibung</label><textarea id="ee-notes" class="textarea" data-f="notes" rows="3">${esc(ev.notes || '')}</textarea></div>`;
  const footer = `
    <div class="left">${existing ? `<button class="btn btn-ghost" data-act="del">${icon('trash', 15)}Löschen</button>` : ''}</div>
    <button class="btn" data-act="cancel">Abbrechen</button>
    <button class="btn btn-primary" data-act="save">${existing ? 'Speichern' : 'Anlegen'}</button>`;

  return sheet({
    title: existing ? 'Termin bearbeiten' : 'Neuer Termin', body, footer, side: !isMobile(),
    onMount: (el, close) => {
      recBind(el);
      const v = f => el.querySelector(`[data-f="${f}"]`);
      let sDcur = sD, sTcur = sT;
      el.addEventListener('change', async e => {
        const t = e.target;
        if (t === v('allDay')) el.querySelectorAll('[data-time]').forEach(x => x.classList.toggle('hide', t.checked));
        if (t === v('area')) { const cur = v('cat').value; el.querySelector('[data-catbox]').innerHTML = catSelect(t.value, S.cat(cur) && S.cat(cur).area === t.value ? cur : '', 'data-f="cat"'); }
        if (t === v('cat') && t.value === '__new') { await handleNewOption(t, 'cat', v('area').value); return; }
        if (t === v('sD')) {
          const shift = C.daysBetween(C.parseYmd(sDcur), C.parseYmd(v('sD').value || sDcur));
          if (v('eD').value) v('eD').value = C.ymd(C.addDays(C.parseYmd(v('eD').value), shift));
          sDcur = v('sD').value || sDcur;
        }
        if (t === v('sT')) {
          const dur = C.parseLocal(`${v('eD').value}T${v('eT').value}`) - C.parseLocal(`${v('sD').value}T${sTcur}`);
          const ns = C.parseLocal(`${v('sD').value}T${v('sT').value}`);
          if (ns && dur > 0) { const ne = new Date(ns.getTime() + dur); v('eD').value = C.ymd(ne); v('eT').value = C.hm(ne); }
          sTcur = v('sT').value;
        }
      });
      el.addEventListener('click', async e => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.rem !== undefined) b.classList.toggle('on');
        else if (b.dataset.act === 'cancel') close();
        else if (b.dataset.act === 'save') { if (save()) close(); }
        else if (b.dataset.act === 'opentask') { close(); A.openTask(linked.id); }
        else if (b.dataset.act === 'del') { if (await deleteEventFlow(existing, occ)) close(); }
      });
      v('title').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); if (save()) close(); } });

      function save() {
        const title = v('title').value.trim();
        if (!title) { v('title').focus(); v('title').placeholder = 'Bitte einen Titel eingeben'; return false; }
        const ad = v('allDay').checked;
        let sStr, eStr;
        if (ad) { sStr = v('sD').value; eStr = v('eD').value || sStr; if (eStr < sStr) eStr = sStr; }
        else {
          sStr = `${v('sD').value}T${v('sT').value || '09:00'}`;
          eStr = `${v('eD').value || v('sD').value}T${v('eT').value || '10:00'}`;
          if (C.parseLocal(eStr) <= C.parseLocal(sStr)) eStr = C.fmtLocal(C.addMinutes(C.parseLocal(sStr), 60));
        }
        const cat = v('cat').value === '__new' ? null : (v('cat').value || null);
        const lid = v('link').value;
        const keepLink = ev.link && ev.link.c !== 'habits' ? ev.link : null;
        const fields = { title, area: v('area').value, cat, allDay: ad, s: sStr, e: eStr, loc: v('loc').value.trim(), notes: v('notes').value, taskId: ev.taskId || null, rem: [...el.querySelectorAll('[data-rem].on')].map(x => Number(x.dataset.rem)), rec: recRead(el), theme: !ad && v('theme').checked, link: lid ? { c: 'habits', id: lid } : keepLink };
        const scope = v('scope') ? v('scope').value : 'all';
        if (existing && isSeries && occ && scope === 'one') {
          S.put('events', { ...existing, exd: [...(existing.exd || []), C.ymd(occ)] });
          S.put('events', { ...fields, rec: null, seriesOf: existing.id });
          toast('Nur dieser Termin wurde geändert');
          return true;
        }
        if (existing && isSeries && occ && scope === 'all') {
          const occS = existing.allDay ? C.parseYmd(C.ymd(occ)) : occ;
          const newS = C.parseLocal(sStr);
          const delta = newS - occS, dur = C.parseLocal(eStr) - newS;
          const baseS = new Date(C.parseLocal(existing.s).getTime() + delta), baseE = new Date(baseS.getTime() + dur);
          fields.s = ad ? C.ymd(baseS) : C.fmtLocal(baseS);
          fields.e = ad ? C.ymd(baseE) : C.fmtLocal(baseE);
        }
        const rec = S.put('events', { ...(existing || {}), ...fields });
        if (!existing && rec.taskId) {
          const t = S.task(rec.taskId);
          if (t) { let x = C.addLog(t, `Eingeplant: ${C.fmtDateShort(C.parseLocal(rec.s))}${rec.allDay ? '' : ', ' + rec.s.slice(11) + ' Uhr'}`, 'system'); if (C.statusOf(t) === 'neu') x.status = 'geplant'; S.put('tasks', x); }
        }
        toast(existing ? 'Termin gespeichert' : 'Termin angelegt');
        return true;
      }
    },
  });
}

export async function deleteEventFlow(existing, occ) {
  if (!existing) return false;
  if (existing.rec && existing.rec.f && occ) {
    return new Promise(resolve => {
      let r = false, pending = false;
      sheet({
        title: 'Serientermin löschen', cls: 'sheet-sm',
        body: `<p class="confirm-text">„${esc(existing.title)}“ wiederholt sich. Was soll gelöscht werden?</p>`,
        footer: `<button class="btn" data-close>Abbrechen</button><button class="btn" data-one>Nur diesen Termin</button><button class="btn btn-danger" data-all>Alle Termine</button>`,
        onMount: (el, close) => {
          el.querySelector('[data-one]').addEventListener('click', () => {
            S.put('events', { ...existing, exd: [...(existing.exd || []), C.ymd(occ)] });
            toast('Termin entfernt', { action: 'Rückgängig', onAction: () => S.put('events', { ...S.event(existing.id), exd: (S.event(existing.id).exd || []).filter(x => x !== C.ymd(occ)) }) });
            r = true; close();
          });
          el.querySelector('[data-all]').addEventListener('click', async () => {
            pending = true;
            close();
            if (await confirmDialog(`Alle Termine der Serie „${esc(existing.title)}“ werden gelöscht.`, { ok: 'Alle löschen', danger: true, title: 'Ganze Serie löschen?', cooldown: 3 })) {
              const prev = S.remove('events', existing.id);
              toast('Serie gelöscht', { action: 'Rückgängig', onAction: () => S.restore('events', prev) });
              r = true;
            }
            resolve(r);
          });
        },
        onClose: () => { if (!pending) resolve(r); },
      });
    });
  }
  if (await confirmDialog(`„${esc(existing.title)}“ wird aus dem Kalender gelöscht.`, { ok: 'Löschen', danger: true, title: 'Termin löschen?', cooldown: 3 })) {
    const prev = S.remove('events', existing.id);
    toast('Termin gelöscht', { action: 'Rückgängig', onAction: () => S.restore('events', prev) });
    return true;
  }
  return false;
}
