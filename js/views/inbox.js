// Inbox – nur schreiben und Priorität setzen. Sortiert nach Priorität, Ampel nach Liegezeit.
import * as C from '../core.js';
import * as S from '../store.js';
import { esc, icon, toast, popover, promptDialog } from '../ui.js';
import { A } from '../app-api.js';
import { emptyState } from './common.js';
import { editNote } from './notes.js';

let prio = 3;
const AMP_NAME = { green: 'Frisch', yellow: 'Wartet schon', red: 'Wartet zu lange' };

function age(ms, now) {
  const d = Math.floor((now - ms) / C.DAY);
  if (d <= 0) { const h = Math.floor((now - ms) / C.HOUR); return h < 1 ? 'gerade eben' : `vor ${h} Std`; }
  return d === 1 ? 'seit gestern' : `seit ${d} Tagen`;
}

export function render() {
  const now = A.now();
  const items = C.sortInbox(S.inboxItems());
  const red = items.filter(x => C.inboxAmpel(x, now) === 'red').length;
  const rows = items.map(x => {
    const amp = C.inboxAmpel(x, now);
    return `<div class="inbox-row" data-iid="${x.id}">
      <span class="dot ${amp}" title="${AMP_NAME[amp]}"></span>
      <button class="prio p${x.prio || 3} prio-btn" data-iprio="${x.id}" title="Priorität ändern">P${x.prio || 3}</button>
      <div class="txt" data-iedit="${x.id}" title="Klicken zum Bearbeiten">${esc(x.text)}</div>
      <span class="age ${amp === 'red' ? 'red' : ''}">${age(x.createdAt || now.getTime(), now.getTime())}</span>
      <div class="acts">
        <button class="btn sm" data-ito="task" data-id2="${x.id}" title="Als Vorgang einsortieren">${icon('list', 13)}<span class="hide-s">Vorgang</span></button>
        <button class="icon-btn sm" data-ito="event" data-id2="${x.id}" aria-label="Als Termin" title="Als Termin">${icon('calendar', 15)}</button>
        <button class="icon-btn sm" data-ito="note" data-id2="${x.id}" aria-label="Als Notiz" title="Als Notiz">${icon('notes', 15)}</button>
        <button class="icon-btn sm" data-ito="done" data-id2="${x.id}" aria-label="Erledigt, entfernen" title="Erledigt – entfernen">${icon('check', 15)}</button>
      </div></div>`;
  }).join('');
  return `<div class="page narrow">
    <div class="page-head"><div class="grow"><h1>Inbox</h1><div class="psub">Alles raus aus dem Kopf. Einsortieren kannst du später.</div></div></div>
    <form class="capture" data-capform autocomplete="off">
      <input id="inbox-in" data-cin placeholder="Was geht dir durch den Kopf?" aria-label="Neuer Eintrag" enterkeyhint="send">
      <div class="prio-pick" data-cprio aria-label="Priorität">${[1, 2, 3, 4].map(p => `<button type="button" class="p${p} ${p === prio ? 'on' : ''}" data-p="${p}" title="${C.PRIOS[p].name}">P${p}</button>`).join('')}</div>
      <button class="btn btn-primary" type="submit">${icon('plus', 15)}<span class="hide-s">Hinzufügen</span></button>
    </form>
    ${items.length ? `<div class="row small muted" style="margin:0 4px 8px"><span class="grow">${items.length} ${items.length === 1 ? 'Eintrag' : 'Einträge'}${red ? ` · <b style="color:var(--bad)">${red} ${red === 1 ? 'wartet' : 'warten'} zu lange</b>` : ''}</span><span>sortiert nach Priorität</span></div>
      <div class="card pad-sm">${rows}</div>
      <p class="hint" style="margin:12px 4px 0">Ampel: P1 wird nach 1 Tag gelb und nach 2 Tagen rot, P2 nach 2/4, P3 nach 5/10, P4 nach 14/30 Tagen. Rote Einträge erinnern dich morgens per Push.</p>`
    : `<div class="card">${emptyState('📥', 'Die Inbox ist leer', 'Schreib oben einfach alles rein, was dir einfällt – Aufgaben, Gedanken, Ideen. Hier wird nur gesammelt.')}</div>`}
  </div>`;
}

function prioPopover(anchor, x) {
  popover(anchor, `<div class="prio-pick">${[1, 2, 3, 4].map(p => `<button class="p${p} ${p === (x.prio || 3) ? 'on' : ''}" data-pp="${p}" title="${C.PRIOS[p].name}">P${p}</button>`).join('')}</div>`, {
    width: 170, place: 'below',
    onMount: (el, close) => el.addEventListener('click', e => { const b = e.target.closest('[data-pp]'); if (!b) return; close(); S.put('inbox', { ...S.get('inbox', x.id), prio: Number(b.dataset.pp) }); }),
  });
}

export function mount(root) {
  const inp = root.querySelector('[data-cin]');
  if (inp && !('ontouchstart' in window)) setTimeout(() => { if (document.activeElement === document.body) inp.focus({ preventScroll: true }); }, 50);
  root.querySelector('[data-capform]').addEventListener('submit', e => {
    e.preventDefault();
    const v = inp.value.trim(); if (!v) { inp.focus(); return; }
    S.put('inbox', { text: v, prio });
    inp.value = '';
    toast('In der Inbox', { ms: 1400 });
    setTimeout(() => { const i = document.getElementById('inbox-in'); if (i) i.focus(); }, 20);
  });
  root.addEventListener('click', async e => {
    const p = e.target.closest('[data-p]');
    if (p) { prio = Number(p.dataset.p); root.querySelectorAll('[data-cprio] [data-p]').forEach(x => x.classList.toggle('on', x === p)); inp.focus(); return; }
    const pr = e.target.closest('[data-iprio]');
    if (pr) { const x = S.get('inbox', pr.dataset.iprio); if (x) prioPopover(pr, x); return; }
    const ed = e.target.closest('[data-iedit]');
    if (ed) {
      const x = S.get('inbox', ed.dataset.iedit); if (!x) return;
      const v = await promptDialog('', { value: x.text, title: 'Eintrag bearbeiten', ok: 'Speichern', multiline: true });
      if (v !== null && v !== undefined && v.trim()) S.put('inbox', { ...S.get('inbox', x.id), text: v.trim() });
      return;
    }
    const to = e.target.closest('[data-ito]');
    if (!to) return;
    const x = S.get('inbox', to.dataset.id2); if (!x) return;
    const area = A.area() === 'all' ? 'p' : A.area();
    if (to.dataset.ito === 'task') A.newTask({ title: x.text, prio: x.prio || 3, imp: (x.prio || 3) <= 2, area, fromInbox: x });
    if (to.dataset.ito === 'event') { S.remove('inbox', x.id); A.newEvent({ title: x.text, area }); toast('Aus der Inbox entfernt', { action: 'Rückgängig', onAction: () => S.restore('inbox', x) }); }
    if (to.dataset.ito === 'note') { S.remove('inbox', x.id); editNote({ title: x.text.length > 60 ? x.text.slice(0, 60) + ' …' : x.text, body: x.text.length > 60 ? x.text : '', area }); }
    if (to.dataset.ito === 'done') { const prev = S.remove('inbox', x.id); toast('Entfernt', { action: 'Rückgängig', onAction: () => S.restore('inbox', prev) }); }
  });
}
