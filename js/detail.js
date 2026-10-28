// Vorgang: Detailansicht (alle Infos, Status, Verlauf mit datierten Notizen) und Anlegen
import * as C from './core.js';
import * as S from './store.js';
import { esc, icon, sheet, toast, isMobile, promptDialog } from './ui.js';
import { A } from './app-api.js';
import { catSelect, projectSelect, goalSelect, fmtDateTime, ampDot } from './views/common.js';
import { recHtml, recBind, recRead } from './recur-ui.js';
import { handleNewOption } from './entities.js';
import { planTaskInCalendar } from './editors.js';

const REMS = [[0, 'Bei Fälligkeit'], [15, '15 Min vorher'], [60, '1 Std'], [180, '3 Std'], [1440, '1 Tag'], [2880, '2 Tage']];
const DURS = [['', '–'], [5, '5 Min'], [15, '15 Min'], [30, '30 Min'], [45, '45 Min'], [60, '1 Std'], [90, '1,5 Std'], [120, '2 Std'], [180, '3 Std'], [240, '4 Std'], [480, 'Ganzer Tag']];

function logHtml(t) {
  const list = [...(t.log || [])].sort((a, b) => b.at - a.at);
  const created = t.createdAt ? `<div class="log-item system"><span class="lb"></span><div><div class="lt">Vorgang erstellt</div><div class="ld">${fmtDateTime(t.createdAt)}</div></div></div>` : '';
  return list.map(x => `<div class="log-item ${esc(x.kind || 'note')}"><span class="lb"></span><div><div class="lt">${esc(x.text)}</div><div class="ld">${fmtDateTime(x.at)}${x.kind === 'note' ? '' : ''}</div></div></div>`).join('') + created;
}

function peopleHtml(t) {
  const ids = t.people || [];
  const chips = ids.map(id => { const p = S.get('people', id); return p ? `<span class="chip">${esc(p.name)}<button type="button" class="icon-btn sm x" data-unperson="${id}" aria-label="Entfernen" style="width:18px;height:18px">${icon('x', 12)}</button></span>` : ''; }).join('');
  const rest = S.people(p => !ids.includes(p.id)).sort((a, b) => a.name.localeCompare(b.name));
  return `${chips}<select class="select" data-f="addperson" style="width:auto;min-width:130px"><option value="">+ Person</option>${rest.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}<option value="__new">Neue Person …</option></select>`;
}

function subsHtml(t) {
  return (t.subs || []).map((x, i) => `<div class="sub ${x.d ? 'done' : ''}"><button type="button" class="check sq ${x.d ? 'on' : ''}" data-subt="${i}" aria-label="Abhaken">${icon('check', 11)}</button><input type="text" value="${esc(x.t)}" data-subed="${i}" aria-label="Unteraufgabe"><button type="button" class="icon-btn sm" data-subdel="${i}" aria-label="Entfernen">${icon('x', 13)}</button></div>`).join('');
}

export function openVorgang(id, preset = {}) {
  const existing = id ? S.task(id) : null;
  if (id && !existing) { toast('Diesen Vorgang gibt es nicht mehr'); return null; }
  const s = S.settings();
  const now = A.now();
  const area0 = preset.area || (A.area() === 'all' ? 'p' : A.area());
  let t = existing ? C.structuredCloneSafe(existing) : {
    title: '', notes: '', type: 'aufgabe', status: 'neu', area: area0, cat: null, prio: 3, imp: false, urg: false, autoUrg: true, esc: true,
    due: null, dueTime: null, start: null, dur: null, rem: null, rec: null, subs: [], log: [], people: [], project: null, goal: null, delegate: '', ...preset,
  };
  const closed = existing && C.isClosed(existing);
  const q0 = C.quadrant(t, now, s);
  const lvl = existing ? C.ampel(existing, now, s).level : 'none';
  const remDefault = !Array.isArray(t.rem);
  const remSel = new Set(Array.isArray(t.rem) ? t.rem : (s.rem.task[t.prio || 3] || [0]));
  const st = C.statusOf(t);

  const body = `
    ${existing ? `<div class="row small muted" style="gap:12px;margin:-4px 0 8px;flex-wrap:wrap">
      ${lvl !== 'none' && !closed ? `<span class="row" style="gap:6px">${ampDot(lvl)}${esc(C.AMPEL[lvl].name)}</span>` : ''}
      ${existing.createdAt ? `<span>Erstellt ${esc(fmtDateTime(existing.createdAt))}</span>` : ''}
      ${closed && existing.doneAt ? `<span>Geschlossen ${esc(fmtDateTime(existing.doneAt))}</span>` : ''}
      ${existing.focusMin ? `<span>${esc(C.fmtDuration(existing.focusMin))} Fokus</span>` : ''}
    </div>` : ''}
    <input class="title-in" data-f="title" placeholder="Was ist der Vorgang?" value="${esc(t.title)}" ${existing ? '' : 'autofocus'} aria-label="Titel">

    <div class="props" style="margin-top:12px">
      <div class="k">${icon('flag', 14)}Status</div><div class="v"><select class="select" data-f="status" style="width:auto">${C.STATUS_ORDER.map(k => `<option value="${k}" ${k === st ? 'selected' : ''}>${C.STATUS[k].name}</option>`).join('')}</select></div>
      <div class="k">${icon('layers', 14)}Typ</div><div class="v"><select class="select" data-f="type" style="width:auto">${Object.values(C.TYPES).map(x => `<option value="${x.key}" ${x.key === C.typeOf(t) ? 'selected' : ''}>${x.name}</option>`).join('')}</select><span class="hint" data-typehint>${esc(C.TYPES[C.typeOf(t)].hint)}</span></div>
      <div class="k">${icon('brief', 14)}Bereich</div><div class="v"><select class="select" data-f="area" style="width:auto"><option value="p" ${t.area !== 'b' ? 'selected' : ''}>Privat</option><option value="b" ${t.area === 'b' ? 'selected' : ''}>Geschäftlich</option></select></div>
      <div class="k">${icon('tag', 14)}Kategorie</div><div class="v" data-catbox>${catSelect(t.area, t.cat, `data-f="cat" data-prev="${t.cat || ''}" style="width:auto;max-width:100%"`)}</div>
      <div class="k">Priorität</div><div class="v"><div class="prio-pick" data-prio>${[1, 2, 3, 4].map(p => `<button type="button" class="p${p} ${t.prio === p ? 'on' : ''}" data-p="${p}" title="${C.PRIOS[p].name}">P${p}</button>`).join('')}</div><span class="hint">${esc(C.PRIOS[t.prio || 3].name)}</span></div>
      <div class="k">${icon('clock', 14)}Fällig</div><div class="v"><input class="input" type="date" data-f="due" value="${esc(t.due || '')}" aria-label="Fällig am"><input class="input" type="time" data-f="dueTime" value="${esc(t.dueTime || '')}" aria-label="Uhrzeit"></div>
      <div class="k">Beginn</div><div class="v"><input class="input" type="date" data-f="start" value="${esc(t.start || '')}" aria-label="Beginn"></div>
      <div class="k">Dauer</div><div class="v"><select class="select" data-f="dur" style="width:auto">${DURS.map(([v, l]) => `<option value="${v}" ${String(t.dur || '') === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="k">${icon('folder', 14)}Projekt</div><div class="v">${projectSelect(t.project, 'data-f="project" style="width:auto;max-width:100%"')}</div>
      <div class="k">${icon('flag', 14)}Ziel</div><div class="v">${goalSelect(t.goal, 'data-f="goal" style="width:auto;max-width:100%"')}</div>
      <div class="k">${icon('person', 14)}Personen</div><div class="v" data-peoplebox>${peopleHtml(t)}</div>
      <div class="k">Wartet auf</div><div class="v"><input class="input" data-f="delegate" value="${esc(t.delegate || '')}" placeholder="Person oder Sache (optional)"></div>
    </div>

    <div class="section-t">Beschreibung</div>
    <textarea class="textarea" data-f="notes" rows="3" placeholder="Worum geht es genau?">${esc(t.notes || '')}</textarea>

    <div class="section-t">Eisenhower-Matrix</div>
    <div class="qpick" data-q>${[1, 2, 3, 4].map(k => `<button type="button" class="${q0 === k ? 'on' : ''}" data-qk="${k}"><b>${C.QUADRANTS[k].name}</b><span>${C.QUADRANTS[k].sub}</span></button>`).join('')}</div>
    <label class="switch small" style="margin-top:10px"><input type="checkbox" data-f="autoUrg" ${t.autoUrg !== false ? 'checked' : ''}><span class="tr"></span>Automatisch dringend, wenn die Frist näher als ${s.amp.autoUrgH} Std ist</label>

    <div class="section-t">Wiederholung & Erinnerung</div>
    ${recHtml(t.rec, t.due)}
    <label class="switch small"><input type="checkbox" data-f="remDefault" ${remDefault ? 'checked' : ''}><span class="tr"></span>Standard-Erinnerung je Priorität</label>
    <div class="chips ${remDefault ? 'hide' : ''}" data-rembox style="margin-top:8px">${REMS.map(([m, l]) => `<button type="button" class="chip ${remSel.has(m) ? 'on' : ''}" data-rem="${m}">${l}</button>`).join('')}</div>
    <label class="switch small" style="margin-top:10px"><input type="checkbox" data-f="esc" ${t.esc !== false ? 'checked' : ''}><span class="tr"></span>Ampel-Eskalation (bei Überfälligkeit wiederholt erinnern)</label>

    <div class="section-t">Unteraufgaben</div>
    <div class="subs" data-subs>${subsHtml(t)}</div>
    <div class="sub"><span class="check sq" style="border-style:dashed"></span><input type="text" data-subadd placeholder="Unteraufgabe hinzufügen, Enter drücken"></div>

    ${existing ? `<div class="section-t">Verlauf & Notizen</div>
    <div class="log-add"><textarea class="textarea" data-lognew rows="1" placeholder="Notiz hinzufügen – wird automatisch mit Datum versehen"></textarea><button type="button" class="btn" data-act="addlog">Hinzufügen</button></div>
    <div class="log" data-log>${logHtml(t)}</div>` : ''}
  `;
  const footer = existing
    ? `<div class="left"><button class="btn btn-ghost" data-act="del" title="Löschen">${icon('trash', 15)}<span class="${isMobile() ? 'hide' : ''}">Löschen</span></button>
        ${!closed ? `<button class="btn btn-ghost" data-act="plan">${icon('calendar', 15)}<span class="${isMobile() ? 'hide' : ''}">Einplanen</span></button><button class="btn btn-ghost" data-act="focus">${icon('play', 13)}Fokus</button>` : ''}</div>
       ${closed ? `<button class="btn" data-act="reopen">Wieder öffnen</button>` : `<button class="btn btn-primary" data-act="done">${icon('check', 15)}Erledigen</button>`}`
    : `<button class="btn" data-act="cancel">Abbrechen</button><button class="btn btn-primary" data-act="create">Anlegen</button>`;

  let created = null;
  const sh = sheet({
    title: existing ? `Vorgang #${String(existing.no || 0).padStart(4, '0')} · ${C.TYPES[C.typeOf(t)].name}` : 'Neuer Vorgang', body, footer, side: !isMobile(), cls: 'vorgang',
    onMount: (el, close) => {
      recBind(el);
      const v = f => el.querySelector(`[data-f="${f}"]`);
      const persist = (patch, log) => {
        Object.assign(t, patch);
        if (!existing) return;
        const cur = S.task(existing.id); if (!cur) return;
        let next = { ...cur, ...patch };
        if (log) next = C.addLog(next, log, 'system');
        S.put('tasks', next);
      };
      const rerenderLog = () => { const box = el.querySelector('[data-log]'); if (box) box.innerHTML = logHtml(S.task(existing.id) || t); };
      const rerenderSubs = () => { el.querySelector('[data-subs]').innerHTML = subsHtml(t); };

      el.addEventListener('change', async e => {
        const x = e.target;
        const f = x.dataset.f;
        if (x.closest('[data-rec]')) { const r = recRead(el); persist({ rec: r, recStart: null, exd: [] }); if (r && !t.due) { v('due').value = C.ymd(now); persist({ due: C.ymd(now) }); } return; }
        if (!f) return;
        if (f === 'title') { const val = x.value.trim(); if (val) persist({ title: val }); return; }
        if (f === 'notes' || f === 'delegate') { persist({ [f]: x.value }); return; }
        if (f === 'status') {
          if (!existing) { t.status = x.value; return; }
          const cur = S.task(existing.id);
          if (x.value === 'erledigt') { x.value = C.statusOf(cur); const ok = await A.completeTask(existing.id); if (ok) close(); return; }
          if (x.value === 'verworfen') { x.value = C.statusOf(cur); const ok = await A.discardTask(existing.id); if (ok) close(); return; }
          S.put('tasks', C.setStatus(cur, x.value, new Date()));
          rerenderLog();
          return;
        }
        if (f === 'type') { persist({ type: x.value }); el.querySelector('[data-typehint]').textContent = C.TYPES[x.value].hint; return; }
        if (f === 'area') {
          const c = S.cat(t.cat); const keep = c && c.area === x.value ? t.cat : null;
          persist({ area: x.value, cat: keep });
          el.querySelector('[data-catbox]').innerHTML = catSelect(x.value, keep, `data-f="cat" data-prev="${keep || ''}" style="width:auto;max-width:100%"`);
          return;
        }
        if (f === 'cat') { if (x.value === '__new') { await handleNewOption(x, 'cat', v('area').value); return; } persist({ cat: x.value || null }); x.dataset.prev = x.value; return; }
        if (f === 'due') { persist({ due: x.value || null, dueTime: x.value ? (v('dueTime').value || null) : null, snooze: null }); if (!x.value) v('dueTime').value = ''; return; }
        if (f === 'dueTime') { if (!v('due').value && x.value) { v('due').value = C.ymd(now); } persist({ due: v('due').value || null, dueTime: x.value || null, snooze: null }); return; }
        if (f === 'start') { persist({ start: x.value || null }); return; }
        if (f === 'dur') { persist({ dur: Number(x.value) || null }); return; }
        if (f === 'project') { persist({ project: x.value || null }); return; }
        if (f === 'goal') { persist({ goal: x.value || null }); return; }
        if (f === 'autoUrg' || f === 'esc') { persist({ [f]: x.checked }); return; }
        if (f === 'remDefault') { el.querySelector('[data-rembox]').classList.toggle('hide', x.checked); persist({ rem: x.checked ? null : [...el.querySelectorAll('[data-rem].on')].map(b => Number(b.dataset.rem)) }); return; }
        if (f === 'addperson') {
          let pid = x.value;
          if (pid === '__new') {
            const name = await promptDialog('Name der Person', { title: 'Neue Person', ok: 'Anlegen' });
            pid = name && name.trim() ? S.put('people', { name: name.trim(), rel: '', area: t.area || 'p', info: [], log: [] }).id : '';
          }
          if (pid) { persist({ people: [...new Set([...(t.people || []), pid])] }); if (!existing && C.typeOf(t) === 'aufgabe') { /* nichts */ } }
          el.querySelector('[data-peoplebox]').innerHTML = peopleHtml(t);
        }
      });
      el.addEventListener('input', e => {
        if (e.target.dataset.subed !== undefined) { t.subs[Number(e.target.dataset.subed)].t = e.target.value; clearTimeout(el._st); el._st = setTimeout(() => persist({ subs: t.subs }), 500); }
      });
      el.addEventListener('click', async e => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.p) {
          const p = Number(b.dataset.p);
          el.querySelectorAll('[data-p]').forEach(x => x.classList.toggle('on', x === b));
          b.closest('.v').querySelector('.hint').textContent = C.PRIOS[p].name;
          persist({ prio: p });
          if (v('remDefault').checked) { const def = new Set(s.rem.task[p] || [0]); el.querySelectorAll('[data-rem]').forEach(x => x.classList.toggle('on', def.has(Number(x.dataset.rem)))); }
          return;
        }
        if (b.dataset.qk) {
          const q = C.QUADRANTS[b.dataset.qk];
          el.querySelectorAll('[data-qk]').forEach(x => x.classList.toggle('on', x === b));
          const patch = { imp: q.imp, urg: q.urg };
          if (!q.urg) { patch.autoUrg = false; v('autoUrg').checked = false; }
          persist(patch);
          return;
        }
        if (b.dataset.rem !== undefined) { b.classList.toggle('on'); persist({ rem: [...el.querySelectorAll('[data-rem].on')].map(x => Number(x.dataset.rem)) }); return; }
        if (b.dataset.unperson) { persist({ people: (t.people || []).filter(x => x !== b.dataset.unperson) }); el.querySelector('[data-peoplebox]').innerHTML = peopleHtml(t); return; }
        if (b.dataset.subt !== undefined) { const i = Number(b.dataset.subt); t.subs[i].d = !t.subs[i].d; persist({ subs: t.subs }); rerenderSubs(); return; }
        if (b.dataset.subdel !== undefined) { t.subs.splice(Number(b.dataset.subdel), 1); persist({ subs: t.subs }); rerenderSubs(); return; }
        const a = b.dataset.act;
        if (a === 'addlog') {
          const ta = el.querySelector('[data-lognew]');
          const txt = ta.value.trim(); if (!txt) { ta.focus(); return; }
          const cur = S.task(existing.id);
          S.put('tasks', C.addLog(cur, txt, 'note'));
          ta.value = ''; rerenderLog();
          toast('Notiz mit Datum gespeichert');
          return;
        }
        if (a === 'cancel') { close(); return; }
        if (a === 'create') { if (create()) close(); return; }
        if (a === 'done') { if (await A.completeTask(existing.id)) close(); return; }
        if (a === 'reopen') { const cur = S.task(existing.id); S.put('tasks', C.setStatus(cur, 'neu', new Date())); toast('Wieder geöffnet'); close(); return; }
        if (a === 'del') { if (await A.deleteTask(existing.id)) close(); return; }
        if (a === 'plan') { close(); planTaskInCalendar(S.task(existing.id)); return; }
        if (a === 'focus') { close(); A.startFocus(existing.id, { autostart: false }); return; }
      });
      const subAdd = el.querySelector('[data-subadd]');
      subAdd.addEventListener('keydown', e => {
        if (e.key === 'Enter' && subAdd.value.trim()) { e.preventDefault(); t.subs = [...(t.subs || []), { id: C.uid('s', 6), t: subAdd.value.trim(), d: false }]; subAdd.value = ''; persist({ subs: t.subs }); rerenderSubs(); }
      });
      const lognew = el.querySelector('[data-lognew]');
      if (lognew) lognew.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); el.querySelector('[data-act="addlog"]').click(); } });
      v('title').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); if (!existing) { if (create()) close(); } else v('title').blur(); } });

      function create() {
        const title = v('title').value.trim();
        if (!title) { v('title').focus(); v('title').placeholder = 'Bitte einen Titel eingeben'; return false; }
        t.title = title;
        t.notes = v('notes').value;
        t.delegate = v('delegate').value.trim();
        t.rec = recRead(el);
        if (t.rec && !t.due) t.due = C.ymd(now);
        t.subs = (t.subs || []).filter(x => x.t && x.t.trim());
        if (!t.rem && !v('remDefault').checked) t.rem = [...el.querySelectorAll('[data-rem].on')].map(x => Number(x.dataset.rem));
        t.no = S.nextTicketNo();
        t.log = [];
        if (preset.fromInbox) { t.log = [C.logEntry(`Aus der Inbox einsortiert (erfasst ${fmtDateTime(preset.fromInbox.createdAt)})`, 'system')]; delete t.fromInbox; }
        const rec = S.put('tasks', { ...t, status: t.status || 'neu' });
        created = rec;
        if (preset.fromInbox) S.remove('inbox', preset.fromInbox.id);
        toast(`Vorgang #${String(rec.no).padStart(4, '0')} angelegt`);
        return true;
      }
    },
    onClose: () => {
      // Titel/Beschreibung sichern, falls noch nicht per change übernommen
      if (!existing) return;
      const el = sh && sh.el; if (!el) return;
      const cur = S.task(existing.id); if (!cur) return;
      const title = el.querySelector('[data-f="title"]').value.trim();
      const notes = el.querySelector('[data-f="notes"]').value;
      const patch = {};
      if (title && title !== cur.title) patch.title = title;
      if (notes !== (cur.notes || '')) patch.notes = notes;
      const pending = el.querySelector('[data-lognew]');
      let next = { ...cur, ...patch };
      if (pending && pending.value.trim()) next = C.addLog(next, pending.value.trim(), 'note');
      if (Object.keys(patch).length || (pending && pending.value.trim())) S.put('tasks', next);
    },
  });
  void created;
  return sh;
}
