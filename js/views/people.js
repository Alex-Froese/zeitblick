// Beziehungen & Klärungen – eine Karte je wichtiger Person, mit Kontakt-Rhythmus, Klärungen und Verlauf
import * as C from '../core.js';
import * as S from '../store.js';
import { esc, icon, sheet, toast, isMobile, confirmDialog } from '../ui.js';
import { A } from '../app-api.js';
import { emptyState, initials, taskLine, sortTasks, fmtDateTime, ampDot } from './common.js';

const RHYTHMS = [['', 'Kein fester Rhythmus'], [1, 'Täglich'], [3, 'Alle 3 Tage'], [7, 'Wöchentlich'], [14, 'Alle 2 Wochen'], [30, 'Monatlich'], [90, 'Vierteljährlich'], [365, 'Jährlich']];
const AMP_TXT = { green: 'Kontakt im Rhythmus', yellow: 'Bald wieder melden', red: 'Länger kein Kontakt', none: '' };

function contactTxt(p, now) {
  if (!p.lastContact) return p.rhythm ? 'Noch kein Kontakt eingetragen' : '';
  const d = C.daysBetween(C.parseYmd(p.lastContact), now);
  return d <= 0 ? 'Kontakt heute' : d === 1 ? 'Kontakt gestern' : `Kontakt vor ${d} Tagen`;
}
function bdayTxt(p, now) {
  const b = C.nextBirthday(p, now); if (!b) return '';
  const d = C.daysBetween(C.startOfDay(now), b);
  const age = p.birthday && p.birthday.length === 10 ? b.getFullYear() - Number(p.birthday.slice(0, 4)) : null;
  return d === 0 ? `🎂 Heute Geburtstag${age ? ` (${age})` : ''}` : d <= 30 ? `🎂 in ${d} ${d === 1 ? 'Tag' : 'Tagen'}${age ? ` (${age})` : ''}` : '';
}

function cardHtml(p, now) {
  const amp = C.contactAmpel(p, now);
  const open = C.personTasks(p, S.getData()).filter(C.isOpen);
  const kl = open.filter(t => C.typeOf(t) === 'klaerung').length;
  const vs = open.filter(t => C.typeOf(t) === 'vorsatz').length;
  const bd = bdayTxt(p, now);
  return `<a class="ecard" href="#/beziehungen/${p.id}" style="text-decoration:none">
    <div class="row" style="gap:12px"><span class="avatar">${esc(initials(p.name))}</span><div class="grow"><div class="et">${esc(p.name)}${p.important ? ' <span title="Besonders wichtig">★</span>' : ''}</div><div class="small muted">${esc(p.rel || '')}</div></div>${amp !== 'none' ? ampDot(amp === 'red' ? 'red' : amp, AMP_TXT[amp]) : ''}</div>
    <div class="em">${contactTxt(p, now) ? `<span>${esc(contactTxt(p, now))}</span>` : ''}${kl ? `<span style="color:var(--ink)">${kl} ${kl === 1 ? 'Klärung' : 'Klärungen'}</span>` : ''}${vs ? `<span>${vs} ${vs === 1 ? 'Vorsatz' : 'Vorsätze'}</span>` : ''}${bd ? `<span>${esc(bd)}</span>` : ''}</div>
  </a>`;
}

function listView(now) {
  const area = A.area();
  const list = S.people(p => S.inArea(p, area));
  const rank = p => (p.important ? 0 : 1) * 10 + ({ red: 0, yellow: 1, green: 3, none: 4 })[C.contactAmpel(p, now)];
  list.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  const klar = sortTasks(S.openTasks(t => C.typeOf(t) === 'klaerung' && S.inArea(t, area)), now);
  const due = list.filter(p => C.contactAmpel(p, now) === 'red');
  return `<div class="page">
    <div class="page-head"><div class="grow"><h1>Beziehungen & Klärungen</h1><div class="psub">Die Menschen, die dir wichtig sind – was zu klären ist und worauf du achten willst.</div></div>
      <div class="page-actions"><button class="btn" data-newk>${icon('plus', 15)}Klärung</button><button class="btn btn-primary" data-newpp>${icon('plus', 15)}Person</button></div></div>
    ${list.length ? `${klar.length || due.length ? `<div class="grid g2" style="margin-bottom:20px">
        ${klar.length ? `<div class="card"><div class="card-head"><h2>Offene Klärungen</h2><a class="link" href="#/vorgaenge?type=klaerung">Im Index</a></div><div class="list">${klar.slice(0, 6).map(t => taskLine(t, { now, focus: false })).join('')}</div></div>` : ''}
        ${due.length ? `<div class="card"><div class="card-head"><h2>Mal wieder melden</h2></div><div class="list">${due.slice(0, 6).map(p => `<div class="li" style="cursor:default"><span class="avatar" style="width:30px;height:30px;font-size:11.5px">${esc(initials(p.name))}</span><div class="grow"><a class="lt" href="#/beziehungen/${p.id}" style="color:var(--ink)">${esc(p.name)}</a><div class="lm">${esc(contactTxt(p, now))}</div></div><button class="btn sm" data-contact="${p.id}">${icon('check', 13)}Kontakt</button></div>`).join('')}</div></div>` : ''}
      </div>` : ''}
      <div class="cards">${list.map(p => cardHtml(p, now)).join('')}</div>`
    : `<div class="card">${emptyState('🤝', 'Noch keine Personen', 'Lege die Menschen an, die dir wichtig sind. Zu jeder Person kannst du Klärungen (z. B. ein offenes Gespräch), Vorsätze („darauf achten, …“), einen Kontakt-Rhythmus und Notizen festhalten.', '<button class="btn btn-primary" data-newpp>Erste Person anlegen</button>')}</div>`}
  </div>`;
}

function detailView(p, now) {
  const all = C.personTasks(p, S.getData());
  const open = sortTasks(all.filter(C.isOpen), now);
  const kv = open.filter(t => C.typeOf(t) !== 'aufgabe');
  const other = open.filter(t => C.typeOf(t) === 'aufgabe');
  const closed = all.filter(t => C.isClosed(t)).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
  const amp = C.contactAmpel(p, now);
  const log = [...(p.log || [])].sort((a, b) => b.at - a.at);
  const bd = C.nextBirthday(p, now);
  return `<div class="page narrow">
    <a class="small muted" href="#/beziehungen" style="display:inline-flex;align-items:center;gap:4px;margin-bottom:12px">${icon('left', 14)}Beziehungen</a>
    <div class="row" style="gap:16px;margin-bottom:20px;align-items:flex-start;flex-wrap:wrap"><span class="avatar lg">${esc(initials(p.name))}</span>
      <div class="grow"><h1>${esc(p.name)}${p.important ? ' <span style="font-size:16px" title="Besonders wichtig">★</span>' : ''}</h1>
        <div class="psub">${[p.rel, bd ? `Geburtstag ${bd.getDate()}. ${C.MONTHS[bd.getMonth()]}` : '', p.rhythm ? 'Rhythmus: ' + (RHYTHMS.find(r => String(r[0]) === String(p.rhythm)) || ['', p.rhythm + ' Tage'])[1] : ''].filter(Boolean).map(esc).join(' · ')}</div>
        <div class="row small" style="margin-top:6px;gap:8px">${amp !== 'none' ? ampDot(amp === 'red' ? 'red' : amp) : ''}<span class="muted">${esc(contactTxt(p, now) || 'Noch kein Kontakt eingetragen')}</span></div></div>
      <div class="page-actions" style="width:auto"><button class="btn" data-editpp="${p.id}">${icon('edit', 14)}Bearbeiten</button><button class="btn btn-primary" data-contact="${p.id}">${icon('check', 14)}Kontakt eintragen</button></div></div>
    ${p.notes ? `<div class="card pad-sm" style="margin-bottom:16px"><div class="lbl" style="margin-bottom:4px">Was mir wichtig ist</div><div style="white-space:pre-wrap;color:var(--ink-2)">${esc(p.notes)}</div></div>` : ''}
    <div class="card"><div class="card-head"><h2>Klärungen & Vorsätze</h2><button class="btn sm" data-pk="${p.id}" data-kind="klaerung">${icon('plus', 13)}Klärung</button><button class="btn sm" data-pk="${p.id}" data-kind="vorsatz">${icon('plus', 13)}Vorsatz</button></div>
      <div class="list">${kv.map(t => taskLine(t, { now, focus: false })).join('') || '<p class="small muted" style="margin:0">Nichts offen. Eine Klärung ist z. B. ein Gespräch, das ansteht; ein Vorsatz etwas, worauf du achten willst.</p>'}</div></div>
    ${other.length ? `<div class="card" style="margin-top:16px"><div class="card-head"><h2>Vorgänge mit ${esc(p.name.split(' ')[0])}</h2></div><div class="list">${other.map(t => taskLine(t, { now })).join('')}</div></div>` : ''}
    <div class="card" style="margin-top:16px"><div class="card-head"><h2>Verlauf</h2></div>
      <div class="log-add"><textarea class="textarea" data-pplog rows="1" placeholder="Notiz, Gespräch, Beobachtung – wird mit Datum gespeichert"></textarea><button class="btn" data-addpplog="${p.id}">Hinzufügen</button></div>
      <div class="log">${log.map(x => `<div class="log-item ${x.kind === 'contact' ? 'note' : esc(x.kind || 'note')}"><span class="lb"></span><div><div class="lt">${x.kind === 'contact' ? '✓ Kontakt' + (x.text ? ': ' : '') : ''}${esc(x.text || '')}</div><div class="ld">${fmtDateTime(x.at)}</div></div></div>`).join('')}
        ${closed.map(t => `<div class="log-item system" data-task="${t.id}" style="cursor:pointer"><span class="lb"></span><div><div class="lt">${C.TYPES[C.typeOf(t)].name} abgeschlossen: ${esc(t.title)}</div><div class="ld">${fmtDateTime(t.doneAt || t.updatedAt)}</div></div></div>`).join('')}
        ${!log.length && !closed.length ? '<p class="small muted" style="margin:0">Noch keine Einträge.</p>' : ''}</div></div>
  </div>`;
}

export function render(route) {
  const now = A.now();
  const id = route.parts[0];
  if (id) { const p = S.get('people', id); if (p) return detailView(p, now); }
  return listView(now);
}

export function editPerson(p0) {
  const existing = p0 && p0.id ? S.get('people', p0.id) : null;
  const area0 = A.area() === 'all' ? 'p' : A.area();
  const p = existing ? { ...existing } : { name: '', rel: '', area: area0, birthday: '', rhythm: '', lastContact: '', phone: '', notes: '', important: false, log: [], ...(p0 || {}) };
  const bdVal = p.birthday ? (p.birthday.length === 5 ? `2000-${p.birthday}` : p.birthday) : '';
  sheet({
    title: existing ? 'Person bearbeiten' : 'Neue Person', side: !isMobile(),
    body: `<input class="title-in" data-f="name" value="${esc(p.name)}" placeholder="Name" ${existing ? '' : 'autofocus'} aria-label="Name">
      <div class="props" style="margin-top:12px">
        <div class="k">Beziehung</div><div class="v"><input class="input" data-f="rel" value="${esc(p.rel || '')}" placeholder="z. B. Partnerin, Vater, Freund, Kunde" list="zb-rels"><datalist id="zb-rels">${['Partnerin', 'Partner', 'Mutter', 'Vater', 'Schwester', 'Bruder', 'Sohn', 'Tochter', 'Freund', 'Freundin', 'Kollege', 'Kunde', 'Mentor'].map(x => `<option value="${x}">`).join('')}</datalist></div>
        <div class="k">Bereich</div><div class="v"><select class="select" data-f="area" style="width:auto"><option value="p" ${p.area !== 'b' ? 'selected' : ''}>Privat</option><option value="b" ${p.area === 'b' ? 'selected' : ''}>Geschäftlich</option></select></div>
        <div class="k">Geburtstag</div><div class="v"><input class="input" type="date" data-f="birthday" value="${esc(bdVal)}"><label class="switch small"><input type="checkbox" data-f="noyear" ${p.birthday && p.birthday.length === 5 ? 'checked' : ''}><span class="tr"></span>Jahr unbekannt</label></div>
        <div class="k">Kontakt-Rhythmus</div><div class="v"><select class="select" data-f="rhythm" style="width:auto">${RHYTHMS.map(([v, l]) => `<option value="${v}" ${String(p.rhythm || '') === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="k">Letzter Kontakt</div><div class="v"><input class="input" type="date" data-f="lastContact" value="${esc(p.lastContact || '')}"></div>
        <div class="k">Telefon</div><div class="v"><input class="input" type="tel" data-f="phone" value="${esc(p.phone || '')}"></div>
        <div class="k">Wichtig</div><div class="v"><label class="switch"><input type="checkbox" data-f="important" ${p.important ? 'checked' : ''}><span class="tr"></span><span class="small muted">oben anzeigen</span></label></div>
      </div>
      <div class="field" style="margin-top:12px"><label>Was mir an dieser Beziehung wichtig ist</label><textarea class="textarea" data-f="notes" rows="4" placeholder="Was braucht diese Person? Worauf willst du achten? Was magst du an ihr?">${esc(p.notes || '')}</textarea></div>`,
    footer: existing ? `<div class="left"><button class="btn btn-ghost" data-del>${icon('trash', 14)}Löschen</button></div><button class="btn" data-close>Abbrechen</button><button class="btn btn-primary" data-save>Speichern</button>` : `<button class="btn" data-close>Abbrechen</button><button class="btn btn-primary" data-save>Anlegen</button>`,
    onMount: (el, close) => {
      const v = n => el.querySelector(`[data-f="${n}"]`);
      const save = () => {
        const name = v('name').value.trim();
        if (!name) { v('name').focus(); v('name').placeholder = 'Bitte einen Namen eingeben'; return; }
        const bd = v('birthday').value;
        const rec = S.put('people', { ...(existing ? S.get('people', existing.id) : {}), name, rel: v('rel').value.trim(), area: v('area').value, birthday: bd ? (v('noyear').checked ? bd.slice(5) : bd) : '', rhythm: Number(v('rhythm').value) || null, lastContact: v('lastContact').value || '', phone: v('phone').value.trim(), important: v('important').checked, notes: v('notes').value, log: (existing && S.get('people', existing.id).log) || [] });
        toast(existing ? 'Gespeichert' : 'Person angelegt');
        close();
        if (!existing) A.nav('#/beziehungen/' + rec.id);
      };
      el.addEventListener('click', async e => {
        if (e.target.closest('[data-save]')) save();
        if (e.target.closest('[data-del]')) {
          if (await confirmDialog(`„${esc(existing.name)}“ löschen? Verknüpfte Vorgänge bleiben erhalten.`, { ok: 'Löschen', danger: true, title: 'Person löschen?', cooldown: 3 })) {
            const prev = S.remove('people', existing.id);
            toast('Gelöscht', { action: 'Rückgängig', onAction: () => S.restore('people', prev) });
            close(); A.nav('#/beziehungen');
          }
        }
      });
      v('name').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
    },
  });
}

function logContact(p) {
  sheet({
    title: `Kontakt mit ${esc(p.name)}`, cls: 'sheet-sm',
    body: `<div class="field"><label>Wann</label><input class="input" type="date" data-cd value="${C.ymd(A.now())}"></div>
      <div class="field"><label>Notiz (optional)</label><textarea class="textarea" data-cn rows="3" placeholder="Worüber habt ihr gesprochen? Was ist offen geblieben?" autofocus></textarea></div>`,
    footer: `<button class="btn" data-close>Abbrechen</button><button class="btn btn-primary" data-ok>Eintragen</button>`,
    onMount: (el, close) => el.querySelector('[data-ok]').addEventListener('click', () => {
      const d = el.querySelector('[data-cd]').value || C.ymd(A.now());
      const txt = el.querySelector('[data-cn]').value.trim();
      const cur = S.get('people', p.id);
      const at = C.parseYmd(d).getTime() + (d === C.ymd(A.now()) ? (Date.now() - C.startOfDay(A.now()).getTime()) : 12 * C.HOUR);
      S.put('people', { ...cur, lastContact: !cur.lastContact || d > cur.lastContact ? d : cur.lastContact, log: [...(cur.log || []), { ...C.logEntry(txt, 'contact', at) }].slice(-500) });
      toast('Kontakt eingetragen');
      close();
    }),
  });
}

export function mount(root) {
  root.addEventListener('click', e => {
    if (e.target.closest('[data-newpp]')) { editPerson(null); return; }
    if (e.target.closest('[data-newk]')) { A.newTask({ type: 'klaerung', imp: true }); return; }
    const ed = e.target.closest('[data-editpp]');
    if (ed) { editPerson(S.get('people', ed.dataset.editpp)); return; }
    const c = e.target.closest('[data-contact]');
    if (c) { e.preventDefault(); const p = S.get('people', c.dataset.contact); if (p) logContact(p); return; }
    const k = e.target.closest('[data-pk]');
    if (k) {
      const p = S.get('people', k.dataset.pk);
      const kind = k.dataset.kind;
      A.newTask({ type: kind, people: [p.id], area: p.area || 'p', imp: true, title: '', ...(kind === 'vorsatz' ? { esc: false } : {}) });
      return;
    }
    const al = e.target.closest('[data-addpplog]');
    if (al) {
      const ta = root.querySelector('[data-pplog]'); const txt = ta.value.trim(); if (!txt) { ta.focus(); return; }
      const p = S.get('people', al.dataset.addpplog);
      S.put('people', { ...p, log: [...(p.log || []), C.logEntry(txt, 'note')].slice(-500) });
      toast('Mit Datum gespeichert');
    }
  });
}
