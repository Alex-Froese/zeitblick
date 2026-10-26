// Zeitblick – Editoren für Aufgaben und Termine
import * as C from './core.js';
import * as S from './store.js';
import { esc, icon, sheet, confirmDialog, toast, isMobile } from './ui.js';
import { A } from './app-api.js';
import { catColor } from './views/common.js';

/* ---------------- Wiederholungs-Baustein ---------------- */
function recPreset(rule) {
  if (!rule || !rule.f) return 'none';
  const i = Number(rule.i) || 1;
  const wd = (rule.wd || []).slice().sort().join(',');
  if (rule.f === 'd' && i === 1) return 'd';
  if (rule.f === 'w' && i === 1 && wd === '0,1,2,3,4') return 'wd';
  if (rule.f === 'w' && i === 1) return 'w';
  if (rule.f === 'm' && i === 1) return 'm';
  if (rule.f === 'y' && i === 1) return 'y';
  return 'c';
}
function recHtml(rule, dateStr) {
  const p = recPreset(rule);
  const r = rule || {};
  const baseWd = dateStr ? C.wdIdx(C.parseYmd(dateStr.slice(0, 10))) : C.wdIdx(new Date());
  const wds = r.wd && r.wd.length ? r.wd : [baseWd];
  const endMode = r.until ? 'until' : r.n ? 'n' : 'never';
  return `<div class="field"><label for="rec-sel">${icon('repeat', 15)}Wiederholen</label>
    <select class="select" id="rec-sel" data-rec="preset">
      <option value="none" ${p === 'none' ? 'selected' : ''}>Nicht wiederholen</option>
      <option value="d" ${p === 'd' ? 'selected' : ''}>Täglich</option>
      <option value="wd" ${p === 'wd' ? 'selected' : ''}>Werktags (Mo–Fr)</option>
      <option value="w" ${p === 'w' ? 'selected' : ''}>Wöchentlich</option>
      <option value="m" ${p === 'm' ? 'selected' : ''}>Monatlich</option>
      <option value="y" ${p === 'y' ? 'selected' : ''}>Jährlich</option>
      <option value="c" ${p === 'c' ? 'selected' : ''}>Benutzerdefiniert …</option>
    </select></div>
    <div data-rec="detail" class="${p === 'none' ? 'hide' : ''}">
      <div class="row wrap ${p === 'c' ? '' : 'hide'}" data-rec="custom" style="margin-bottom:12px">
        <span class="small">Alle</span>
        <input class="input" type="number" min="1" max="99" value="${Number(r.i) || 1}" data-rec="i" style="width:70px">
        <select class="select" data-rec="f" style="width:auto">
          <option value="d" ${r.f === 'd' ? 'selected' : ''}>Tage</option>
          <option value="w" ${!r.f || r.f === 'w' ? 'selected' : ''}>Wochen</option>
          <option value="m" ${r.f === 'm' ? 'selected' : ''}>Monate</option>
          <option value="y" ${r.f === 'y' ? 'selected' : ''}>Jahre</option>
        </select>
      </div>
      <div class="field ${(p === 'w' || (p === 'c' && (r.f || 'w') === 'w')) ? '' : 'hide'}" data-rec="wdbox"><label>An diesen Tagen</label>
        <div class="wd-pick">${C.WD_SHORT.map((w, i) => `<button type="button" data-wd="${i}" class="${wds.includes(i) ? 'on' : ''}" aria-pressed="${wds.includes(i)}">${w}</button>`).join('')}</div>
      </div>
      <div class="field"><label>Endet</label>
        <div class="row wrap">
          <select class="select" data-rec="end" style="width:auto">
            <option value="never" ${endMode === 'never' ? 'selected' : ''}>Nie</option>
            <option value="until" ${endMode === 'until' ? 'selected' : ''}>Am Datum</option>
            <option value="n" ${endMode === 'n' ? 'selected' : ''}>Nach Anzahl</option>
          </select>
          <input class="input ${endMode === 'until' ? '' : 'hide'}" type="date" data-rec="until" value="${esc(r.until || '')}" style="width:auto">
          <input class="input ${endMode === 'n' ? '' : 'hide'}" type="number" min="1" data-rec="n" value="${r.n || 10}" style="width:90px">
        </div>
      </div>
    </div>`;
}
function recBind(root) {
  const q = s => root.querySelector(`[data-rec="${s}"]`);
  const sync = () => {
    const p = q('preset').value;
    q('detail').classList.toggle('hide', p === 'none');
    q('custom').classList.toggle('hide', p !== 'c');
    const f = p === 'c' ? q('f').value : p === 'w' ? 'w' : '';
    q('wdbox').classList.toggle('hide', f !== 'w');
    const e = q('end').value;
    q('until').classList.toggle('hide', e !== 'until');
    q('n').classList.toggle('hide', e !== 'n');
  };
  root.addEventListener('change', e => { if (e.target.closest('[data-rec]')) sync(); });
  root.querySelectorAll('[data-wd]').forEach(b => b.addEventListener('click', () => {
    b.classList.toggle('on'); b.setAttribute('aria-pressed', b.classList.contains('on'));
    if (!root.querySelector('[data-wd].on')) { b.classList.add('on'); }
  }));
}
function recRead(root) {
  const q = s => root.querySelector(`[data-rec="${s}"]`);
  const p = q('preset').value;
  if (p === 'none') return null;
  let r;
  const wds = [...root.querySelectorAll('[data-wd].on')].map(b => Number(b.dataset.wd));
  if (p === 'd') r = { f: 'd', i: 1 };
  else if (p === 'wd') r = { f: 'w', i: 1, wd: [0, 1, 2, 3, 4] };
  else if (p === 'w') r = { f: 'w', i: 1, wd: wds };
  else if (p === 'm') r = { f: 'm', i: 1 };
  else if (p === 'y') r = { f: 'y', i: 1 };
  else { const f = q('f').value; r = { f, i: Math.max(1, Number(q('i').value) || 1) }; if (f === 'w') r.wd = wds; }
  const e = q('end').value;
  if (e === 'until' && q('until').value) r.until = q('until').value;
  if (e === 'n') r.n = Math.max(1, Number(q('n').value) || 1);
  return r;
}

/* ---------------- Gemeinsame Teile ---------------- */
function areaSeg(area) {
  return `<div class="seg small seg-area" data-areaseg role="group" aria-label="Bereich">
    <span class="seg-thumb"></span>
    <button type="button" data-area="p" aria-pressed="${area === 'p'}"><span class="dotp"></span>Privat</button>
    <button type="button" data-area="b" aria-pressed="${area === 'b'}"><span class="dotb"></span>Geschäftlich</button>
  </div>`;
}
export function placeThumb(seg) {
  if (!seg) return;
  const th = seg.querySelector('.seg-thumb');
  const on = seg.querySelector('button[aria-pressed="true"]');
  if (!th || !on) return;
  th.style.width = on.offsetWidth + 'px';
  th.style.transform = `translateX(${on.offsetLeft - 3}px)`;
}
function catPickHtml(area, sel) {
  const list = S.cats(area);
  return `<div class="cat-pick">${list.map(c => `<button type="button" data-cat="${c.id}" class="${c.id === sel ? 'on' : ''}" style="--cc:${catColor(c)}" aria-pressed="${c.id === sel}">${esc(c.icon || '')} ${esc(c.name)}</button>`).join('')}
    <button type="button" data-cat="" class="${!sel ? 'on' : ''}" style="--cc:var(--muted)" aria-pressed="${!sel}">Ohne</button></div>`;
}

const TASK_REMS = [[0, 'Bei Fälligkeit'], [15, '15 Min vorher'], [60, '1 Std'], [180, '3 Std'], [1440, '1 Tag'], [2880, '2 Tage']];
const EV_REMS = [[0, 'Zum Beginn'], [5, '5 Min'], [10, '10 Min'], [15, '15 Min'], [30, '30 Min'], [60, '1 Std'], [1440, '1 Tag']];

/* ---------------- Aufgaben-Editor ---------------- */
export function openTaskEditor(id, preset = {}) {
  const existing = id ? S.task(id) : null;
  const s = S.settings();
  const now = A.now();
  const area0 = preset.area || (A.area() === 'all' ? 'p' : A.area());
  const t = existing ? C.structuredCloneSafe(existing) : {
    title: '', notes: '', area: area0, cat: null, prio: 3, imp: false, urg: false, autoUrg: true, esc: true,
    due: null, dueTime: null, start: null, dur: null, rem: null, rec: null, subs: [], delegate: '', ...preset,
  };
  if (!t.subs) t.subs = [];
  const q0 = C.quadrant(t, now, s);
  const lvl = existing ? C.ampel(existing, now, s).level : 'none';
  const remDefault = !Array.isArray(t.rem);
  const remSel = new Set(Array.isArray(t.rem) ? t.rem : (s.rem.task[t.prio || 3] || [0]));

  const body = `
    ${existing ? `<div class="row wrap small muted" style="margin:-4px 0 6px;gap:10px">
      <span class="num">#${String(existing.no || 0).padStart(4, '0')}</span>
      ${lvl !== 'none' ? `<span class="amp-lbl ${lvl}"><i class="amp ${lvl}"></i>${esc(C.AMPEL[lvl].name)}</span>` : ''}
      ${existing.focusMin ? `<span>${icon('gem', 13)} ${esc(C.fmtDuration(existing.focusMin))} Fokus</span>` : ''}
      ${existing.createdAt ? `<span>Erstellt ${esc(C.fmtRelTime(existing.createdAt, now.getTime()))}</span>` : ''}
    </div>` : ''}
    <input class="input title-in" data-f="title" placeholder="Was ist zu tun?" value="${esc(t.title)}" ${existing ? '' : 'autofocus'} aria-label="Titel">
    <textarea class="textarea" data-f="notes" placeholder="Notizen, Details, Links …" rows="2" style="margin-top:8px;min-height:60px">${esc(t.notes || '')}</textarea>

    <div class="section-t">Einordnung</div>
    <div class="field"><label>Bereich</label>${areaSeg(t.area)}</div>
    <div class="field"><label>${icon('tag', 15)}Kategorie</label><div data-catbox>${catPickHtml(t.area, t.cat)}</div></div>
    <div class="field"><label>${icon('matrix', 15)}Eisenhower-Matrix</label>
      <div class="qpick">${[1, 2, 3, 4].map(k => `<button type="button" class="q${k} ${q0 === k ? 'on' : ''}" data-q="${k}" aria-pressed="${q0 === k}"><b>${C.QUADRANTS[k].name}</b><span>${C.QUADRANTS[k].sub}</span></button>`).join('')}</div>
      <label class="switch small" style="margin-top:8px"><input type="checkbox" data-f="autoUrg" ${t.autoUrg !== false ? 'checked' : ''}><span class="tr"></span>Automatisch dringend, wenn die Frist näher als ${s.amp.autoUrgH} Std ist</label>
    </div>
    <div class="field"><label>${icon('flag', 15)}Priorität</label>
      <div class="prio-pick">${[1, 2, 3, 4].map(p => `<button type="button" class="p${p} ${t.prio === p ? 'on' : ''}" data-prio="${p}" aria-pressed="${t.prio === p}"><i></i>${C.PRIOS[p].short} ${C.PRIOS[p].name}</button>`).join('')}</div>
    </div>

    <div class="section-t">Zeitraum</div>
    <div class="chips" style="margin-bottom:10px">
      <button type="button" class="chip" data-dq="today">Heute</button>
      <button type="button" class="chip" data-dq="tomorrow">Morgen</button>
      <button type="button" class="chip" data-dq="week">Nächste Woche</button>
      <button type="button" class="chip" data-dq="none">Ohne Datum</button>
    </div>
    <div class="fgrid keep">
      <div class="field"><label for="te-due">Fällig am</label><input id="te-due" class="input" type="date" data-f="due" value="${esc(t.due || '')}"></div>
      <div class="field"><label for="te-time">Uhrzeit</label><input id="te-time" class="input" type="time" data-f="dueTime" value="${esc(t.dueTime || '')}"></div>
    </div>
    <div class="fgrid keep">
      <div class="field"><label for="te-start">Beginn (optional)</label><input id="te-start" class="input" type="date" data-f="start" value="${esc(t.start || '')}"></div>
      <div class="field"><label for="te-dur">Geschätzte Dauer</label>
        <select id="te-dur" class="select" data-f="dur">
          ${[['', 'Keine Angabe'], [15, '15 Min'], [30, '30 Min'], [45, '45 Min'], [60, '1 Std'], [90, '1,5 Std'], [120, '2 Std'], [180, '3 Std'], [240, '4 Std'], [480, 'Ganzer Tag']].map(([v, l]) => `<option value="${v}" ${String(t.dur || '') === String(v) ? 'selected' : ''}>${l}</option>`).join('')}
        </select></div>
    </div>
    ${recHtml(t.rec, t.due)}

    <div class="section-t">Erinnerungen & Ampel</div>
    <div class="field"><label>${icon('bell', 15)}Erinnern</label>
      <label class="switch small"><input type="checkbox" data-f="remDefault" ${remDefault ? 'checked' : ''}><span class="tr"></span>Standard je Priorität verwenden</label>
      <div class="rem-pick ${remDefault ? 'hide' : ''}" data-rembox style="margin-top:8px">${TASK_REMS.map(([m, l]) => `<button type="button" class="chip ${remSel.has(m) ? 'on' : ''}" data-rem="${m}">${l}</button>`).join('')}</div>
    </div>
    <label class="switch small"><input type="checkbox" data-f="esc" ${t.esc !== false ? 'checked' : ''}><span class="tr"></span>Ampel-Eskalation: bei Überfälligkeit immer wieder per Push erinnern</label>

    <div class="section-t">Unteraufgaben</div>
    <div class="subs" data-subs></div>
    <div class="sub"><span class="chk" style="border-style:dashed"></span><input type="text" data-subadd placeholder="Unteraufgabe hinzufügen und Enter drücken"></div>

    <div class="field" style="margin-top:14px"><label for="te-del">${icon('person', 15)}Delegiert an</label><input id="te-del" class="input" data-f="delegate" value="${esc(t.delegate || '')}" placeholder="Name, falls du die Aufgabe abgibst"></div>
  `;
  const footer = `
    <div class="left">
      ${existing ? `<button class="btn btn-ghost" data-act="del" title="Löschen" aria-label="Löschen">${icon('trash', 17)}</button>` : ''}
      ${existing && !existing.done ? `<button class="btn btn-ghost" data-act="focus">${icon('play', 15)}Fokus</button>` : ''}
      <button class="btn btn-ghost" data-act="plan" title="Als Block im Kalender einplanen">${icon('calendar', 16)}<span class="${isMobile() ? 'hide' : ''}">Einplanen</span></button>
    </div>
    <button class="btn" data-act="cancel">Abbrechen</button>
    <button class="btn btn-primary" data-act="save">Speichern</button>`;

  let saved = false;
  let discard = false;
  let sh_doSave = null;
  const sh = sheet({
    title: existing ? 'Aufgabe bearbeiten' : 'Neue Aufgabe', body, footer, side: !isMobile(), cls: 'task-editor',
    onMount: (el, close) => {
      const subsBox = el.querySelector('[data-subs]');
      const renderSubs = () => {
        subsBox.innerHTML = t.subs.map((x, i) => `<div class="sub ${x.d ? 'done' : ''}" data-i="${i}">
          <button type="button" class="chk ${x.d ? 'on' : ''}" data-subt="${i}" aria-label="Unteraufgabe abhaken">${icon('check', 11)}</button>
          <input type="text" value="${esc(x.t)}" data-subed="${i}" aria-label="Unteraufgabe">
          <button type="button" class="icon-btn sm" data-subdel="${i}" aria-label="Entfernen">${icon('x', 14)}</button></div>`).join('');
      };
      renderSubs();
      requestAnimationFrame(() => placeThumb(el.querySelector('[data-areaseg]')));
      recBind(el);

      el.addEventListener('click', async e => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.area) {
          t.area = b.dataset.area;
          el.querySelectorAll('[data-areaseg] button').forEach(x => x.setAttribute('aria-pressed', x === b));
          placeThumb(el.querySelector('[data-areaseg]'));
          const c = S.cat(t.cat); if (c && c.area !== t.area) t.cat = null;
          el.querySelector('[data-catbox]').innerHTML = catPickHtml(t.area, t.cat);
        } else if (b.dataset.cat !== undefined && b.closest('.cat-pick')) {
          t.cat = b.dataset.cat || null;
          el.querySelectorAll('[data-cat]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); });
        } else if (b.dataset.q) {
          const k = Number(b.dataset.q);
          t.imp = C.QUADRANTS[k].imp; t.urg = C.QUADRANTS[k].urg;
          if (!t.urg) el.querySelector('[data-f="autoUrg"]').checked = false;
          el.querySelectorAll('[data-q]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); });
        } else if (b.dataset.prio) {
          t.prio = Number(b.dataset.prio);
          el.querySelectorAll('[data-prio]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); });
          if (el.querySelector('[data-f="remDefault"]').checked) {
            const def = new Set(s.rem.task[t.prio] || [0]);
            el.querySelectorAll('[data-rem]').forEach(x => x.classList.toggle('on', def.has(Number(x.dataset.rem))));
          }
        } else if (b.dataset.dq) {
          const due = el.querySelector('[data-f="due"]');
          const d = b.dataset.dq === 'today' ? now : b.dataset.dq === 'tomorrow' ? C.addDays(now, 1) : b.dataset.dq === 'week' ? C.addDays(C.startOfWeek(now), 7) : null;
          due.value = d ? C.ymd(d) : '';
          if (!d) el.querySelector('[data-f="dueTime"]').value = '';
        } else if (b.dataset.rem !== undefined) {
          b.classList.toggle('on');
        } else if (b.dataset.subt !== undefined) {
          const i = Number(b.dataset.subt); t.subs[i].d = !t.subs[i].d; renderSubs();
        } else if (b.dataset.subdel !== undefined) {
          t.subs.splice(Number(b.dataset.subdel), 1); renderSubs();
        } else if (b.dataset.act === 'save') {
          if (doSave()) { saved = true; close('save'); }
        } else if (b.dataset.act === 'cancel') {
          discard = true; close('cancel');
        } else if (b.dataset.act === 'del') {
          if (await confirmDialog(`„${esc(existing.title)}“ wird gelöscht.`, { ok: 'Löschen', danger: true, title: 'Aufgabe löschen?' })) {
            discard = true; close('del');
            const prev = S.remove('tasks', existing.id);
            toast('Aufgabe gelöscht', { action: 'Rückgängig', onAction: () => S.restore('tasks', prev) });
          }
        } else if (b.dataset.act === 'focus') {
          if (doSave(true)) { saved = true; close('focus'); A.startFocus(t.id || existing.id, { autostart: false }); }
        } else if (b.dataset.act === 'plan') {
          const rec = doSave(true);
          if (rec) { saved = true; close('plan'); planTaskInCalendar(rec); }
        }
      });
      el.addEventListener('change', e => {
        if (e.target.matches('[data-f="remDefault"]')) el.querySelector('[data-rembox]').classList.toggle('hide', e.target.checked);
      });
      el.addEventListener('input', e => { if (e.target.dataset.subed !== undefined) t.subs[Number(e.target.dataset.subed)].t = e.target.value; });
      const subAdd = el.querySelector('[data-subadd]');
      subAdd.addEventListener('keydown', e => {
        if (e.key === 'Enter' && subAdd.value.trim()) { e.preventDefault(); t.subs.push({ id: C.uid('s', 6), t: subAdd.value.trim(), d: false }); subAdd.value = ''; renderSubs(); }
      });
      el.querySelector('[data-f="title"]').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); if (doSave()) { saved = true; close('save'); } } });
      el.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); if (doSave()) { saved = true; close('save'); } } });

      function doSave(silent) {
        const v = f => el.querySelector(`[data-f="${f}"]`);
        const title = v('title').value.trim();
        if (!title) { v('title').focus(); v('title').placeholder = 'Bitte einen Titel eingeben'; return null; }
        t.title = title;
        t.notes = v('notes').value;
        t.due = v('due').value || null;
        t.dueTime = t.due ? (v('dueTime').value || null) : null;
        t.start = v('start').value || null;
        t.dur = Number(v('dur').value) || null;
        t.autoUrg = v('autoUrg').checked;
        t.esc = v('esc').checked;
        t.delegate = v('delegate').value.trim();
        t.rem = v('remDefault').checked ? null : [...el.querySelectorAll('[data-rem].on')].map(x => Number(x.dataset.rem));
        const newRec = recRead(el);
        if (JSON.stringify(newRec) !== JSON.stringify(existing ? existing.rec || null : null)) { t.recStart = null; t.exd = []; }
        t.rec = newRec;
        if (t.rec && !t.due) t.due = C.ymd(now);
        t.subs = t.subs.filter(x => x.t && x.t.trim());
        if (!existing && !t.no) t.no = S.nextTicketNo();
        const next = { ...(existing || {}), ...t };
        if (existing && silent === 'ifChanged') {
          const strip = o => { const x = { ...o }; delete x.updatedAt; delete x.dev; for (const k of Object.keys(x)) if (x[k] === undefined || x[k] === '' || (Array.isArray(x[k]) && !x[k].length)) delete x[k]; return JSON.stringify(Object.keys(x).sort().map(k => [k, x[k]])); };
          const cur = S.task(existing.id) || existing;
          if (strip(next) === strip(cur)) return null;
        }
        const rec = S.put('tasks', next);
        t.id = rec.id;
        if (silent !== true && silent !== 'ifChanged') toast(existing ? 'Aufgabe gespeichert' : 'Aufgabe erstellt');
        return rec;
      }
      sh_doSave = doSave;
    },
    onClose: (reason) => {
      if (saved || discard) return;
      // Bestehende Aufgaben beim Schließen automatisch sichern
      if (existing && sh_doSave && reason !== 'nav') {
        const tmp = sh_doSave('ifChanged');
        if (tmp) toast('Änderungen gespeichert');
      }
    },
  });
  return sh;
}

export function planTaskInCalendar(t) {
  const now = A.now();
  let start;
  if (t.due && t.dueTime) start = C.addMinutes(C.parseLocal(t.due + 'T' + t.dueTime), -(t.dur || 60));
  else {
    const base = t.due ? C.parseYmd(t.due) : now;
    const h = C.sameDay(base, now) ? Math.min(21, now.getHours() + 1) : 15;
    start = C.setTime(base, `${h}:00`);
  }
  if (start < now && !t.dueTime) start = C.setTime(now, `${Math.min(22, now.getHours() + 1)}:00`);
  const end = C.addMinutes(start, t.dur || 60);
  openEventEditor(null, { title: t.title, area: t.area, cat: t.cat, s: C.fmtLocal(start), e: C.fmtLocal(end), taskId: t.id, notes: t.notes || '' });
}

/* ---------------- Termin-Editor ---------------- */
export function openEventEditor(id, preset = {}, occ = null) {
  const existing = id ? S.event(id) : null;
  const s = S.settings();
  const now = A.now();
  const area0 = preset.area || (A.area() === 'all' ? 'p' : A.area());
  let ev;
  if (existing) {
    ev = C.structuredCloneSafe(existing);
    if (occ && existing.rec) {
      // Vorkommen anzeigen
      const durMs = C.parseLocal(existing.e) - C.parseLocal(existing.s);
      ev.s = existing.allDay ? C.ymd(occ) : C.fmtLocal(occ);
      ev.e = existing.allDay ? C.ymd(C.addDays(occ, Math.round(durMs / C.DAY))) : C.fmtLocal(new Date(occ.getTime() + durMs));
    }
  } else {
    const st = C.setTime(C.addDays(now, 0), `${Math.min(22, now.getHours() + 1)}:00`);
    ev = { title: '', area: area0, cat: null, allDay: false, s: C.fmtLocal(st), e: C.fmtLocal(C.addMinutes(st, 60)), loc: '', notes: '', rem: null, rec: null, ...preset };
  }
  const allDay = !!ev.allDay;
  const sD = ev.s.slice(0, 10), sT = allDay ? '09:00' : (ev.s.slice(11, 16) || '09:00');
  const eD = (ev.e || ev.s).slice(0, 10), eT = allDay ? '10:00' : ((ev.e || '').slice(11, 16) || '10:00');
  const remSel = new Set(Array.isArray(ev.rem) ? ev.rem : s.rem.event);
  const openTasksList = S.tasks(t => !t.done).sort((a, b) => a.title.localeCompare(b.title)).slice(0, 300);
  const isSeries = existing && existing.rec && existing.rec.f;

  const body = `
    <input class="input title-in" data-f="title" placeholder="Titel hinzufügen" value="${esc(ev.title)}" ${existing ? '' : 'autofocus'} aria-label="Titel">
    ${isSeries && occ ? `<div class="banner" style="margin-top:12px">${icon('repeat', 16)}<div class="grow">Serientermin. Änderungen gelten für
      <select class="select" data-f="scope" style="width:auto;height:32px;display:inline-block;margin-left:6px"><option value="one">nur diesen Termin</option><option value="all">alle Termine</option></select></div></div>` : ''}
    <div class="field" style="margin-top:12px"><label>Bereich</label>${areaSeg(ev.area)}</div>
    <div class="field"><label>${icon('tag', 15)}Kategorie</label><div data-catbox>${catPickHtml(ev.area, ev.cat)}</div></div>
    <div class="section-t">Zeit</div>
    <label class="switch small" style="margin-bottom:12px"><input type="checkbox" data-f="allDay" ${allDay ? 'checked' : ''}><span class="tr"></span>Ganztägig</label>
    <div class="fgrid keep">
      <div class="field"><label for="ee-sd">Beginn</label><input id="ee-sd" class="input" type="date" data-f="sD" value="${sD}"></div>
      <div class="field ${allDay ? 'hide' : ''}" data-timebox><label for="ee-st">Uhrzeit</label><input id="ee-st" class="input" type="time" data-f="sT" value="${sT}" step="300"></div>
    </div>
    <div class="fgrid keep">
      <div class="field"><label for="ee-ed">Ende</label><input id="ee-ed" class="input" type="date" data-f="eD" value="${eD}"></div>
      <div class="field ${allDay ? 'hide' : ''}" data-timebox><label for="ee-et">Uhrzeit</label><input id="ee-et" class="input" type="time" data-f="eT" value="${eT}" step="300"></div>
    </div>
    ${recHtml(ev.rec, sD)}
    <div class="section-t">Details</div>
    <div class="field"><label>${icon('bell', 15)}Erinnerungen</label>
      <div class="rem-pick">${EV_REMS.map(([m, l]) => `<button type="button" class="chip ${remSel.has(m) ? 'on' : ''}" data-rem="${m}">${l}</button>`).join('')}</div>
      <span class="hint">Ganztägige Termine erinnern morgens um ${esc(s.rem.allDayAt)} Uhr.</span>
    </div>
    <div class="field"><label for="ee-loc">${icon('pin', 15)}Ort</label><input id="ee-loc" class="input" data-f="loc" value="${esc(ev.loc || '')}" placeholder="Adresse oder Raum"></div>
    <div class="field"><label for="ee-notes">${icon('notes', 15)}Beschreibung</label><textarea id="ee-notes" class="textarea" data-f="notes" rows="3">${esc(ev.notes || '')}</textarea></div>
    <div class="field"><label for="ee-task">${icon('link', 15)}Verknüpfte Aufgabe</label>
      <select id="ee-task" class="select" data-f="taskId"><option value="">Keine</option>${openTasksList.map(x => `<option value="${x.id}" ${ev.taskId === x.id ? 'selected' : ''}>${esc(x.title)}</option>`).join('')}</select></div>
  `;
  const footer = `
    <div class="left">${existing ? `<button class="btn btn-ghost" data-act="del" aria-label="Löschen" title="Löschen">${icon('trash', 17)}</button>` : ''}</div>
    <button class="btn" data-act="cancel">Abbrechen</button>
    <button class="btn btn-primary" data-act="save">Speichern</button>`;

  let done = false;
  return sheet({
    title: existing ? 'Termin bearbeiten' : 'Neuer Termin', body, footer, side: !isMobile(),
    onMount: (el, close) => {
      requestAnimationFrame(() => placeThumb(el.querySelector('[data-areaseg]')));
      recBind(el);
      const v = f => el.querySelector(`[data-f="${f}"]`);
      el.addEventListener('change', e => {
        if (e.target === v('allDay')) el.querySelectorAll('[data-timebox]').forEach(x => x.classList.toggle('hide', e.target.checked));
        if (e.target === v('sD')) {
          // Ende mitschieben
          const oldS = C.parseYmd(sDcur), newS = C.parseYmd(v('sD').value || sDcur);
          const shift = C.daysBetween(oldS, newS);
          if (v('eD').value) v('eD').value = C.ymd(C.addDays(C.parseYmd(v('eD').value), shift));
          sDcur = v('sD').value || sDcur;
        }
        if (e.target === v('sT')) {
          const dur = C.parseLocal(`${v('eD').value}T${v('eT').value}`) - C.parseLocal(`${v('sD').value}T${sTcur}`);
          const ns = C.parseLocal(`${v('sD').value}T${v('sT').value}`);
          if (ns && dur > 0) { const ne = new Date(ns.getTime() + dur); v('eD').value = C.ymd(ne); v('eT').value = C.hm(ne); }
          sTcur = v('sT').value;
        }
      });
      let sDcur = sD, sTcur = sT;
      el.addEventListener('click', async e => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.area) {
          ev.area = b.dataset.area;
          el.querySelectorAll('[data-areaseg] button').forEach(x => x.setAttribute('aria-pressed', x === b));
          placeThumb(el.querySelector('[data-areaseg]'));
          const c = S.cat(ev.cat); if (c && c.area !== ev.area) ev.cat = null;
          el.querySelector('[data-catbox]').innerHTML = catPickHtml(ev.area, ev.cat);
        } else if (b.dataset.cat !== undefined && b.closest('.cat-pick')) {
          ev.cat = b.dataset.cat || null;
          el.querySelectorAll('[data-cat]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); });
        } else if (b.dataset.rem !== undefined) b.classList.toggle('on');
        else if (b.dataset.act === 'cancel') { done = true; close(); }
        else if (b.dataset.act === 'save') { if (save()) { done = true; close(); } }
        else if (b.dataset.act === 'del') {
          const ok = await deleteEventFlow(existing, occ);
          if (ok) { done = true; close(); }
        }
      });
      v('title').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); if (save()) { done = true; close(); } } });

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
        const fields = {
          title, area: ev.area, cat: ev.cat, allDay: ad, s: sStr, e: eStr,
          loc: v('loc').value.trim(), notes: v('notes').value, taskId: v('taskId').value || null,
          rem: [...el.querySelectorAll('[data-rem].on')].map(x => Number(x.dataset.rem)),
          rec: recRead(el),
        };
        const scope = v('scope') ? v('scope').value : 'all';
        if (existing && isSeries && occ && scope === 'one') {
          // Ausnahme in der Serie + Einzeltermin
          const exd = [...(existing.exd || []), C.ymd(occ)];
          S.put('events', { ...existing, exd });
          S.put('events', { ...fields, rec: null, seriesOf: existing.id });
          toast('Nur dieser Termin wurde geändert');
          return true;
        }
        if (existing && isSeries && occ && scope === 'all') {
          const occS = existing.allDay ? C.parseYmd(C.ymd(occ)) : occ;
          const newS = C.parseLocal(sStr);
          const delta = newS - occS;
          const dur = C.parseLocal(eStr) - newS;
          const baseS = new Date(C.parseLocal(existing.s).getTime() + delta);
          const baseE = new Date(baseS.getTime() + dur);
          fields.s = ad ? C.ymd(baseS) : C.fmtLocal(baseS);
          fields.e = ad ? C.ymd(baseE) : C.fmtLocal(baseE);
        }
        S.put('events', { ...(existing || {}), ...fields });
        toast(existing ? 'Termin gespeichert' : 'Termin erstellt');
        return true;
      }
    },
    onClose: () => { void done; },
  });
}

export async function deleteEventFlow(existing, occ) {
  if (!existing) return false;
  if (existing.rec && existing.rec.f && occ) {
    return new Promise(resolve => {
      let r = false;
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
          el.querySelector('[data-all]').addEventListener('click', () => {
            const prev = S.remove('events', existing.id);
            toast('Serie gelöscht', { action: 'Rückgängig', onAction: () => S.restore('events', prev) });
            r = true; close();
          });
        },
        onClose: () => resolve(r),
      });
    });
  }
  if (await confirmDialog(`„${esc(existing.title)}“ wird aus dem Kalender gelöscht.`, { ok: 'Löschen', danger: true, title: 'Termin löschen?' })) {
    const prev = S.remove('events', existing.id);
    toast('Termin gelöscht', { action: 'Rückgängig', onAction: () => S.restore('events', prev) });
    return true;
  }
  return false;
}
