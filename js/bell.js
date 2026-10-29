// Glocke – Mitteilungen: zuerst der Tag, dann was Aufmerksamkeit braucht, dann die Zeitachse der Erinnerungen
import * as C from './core.js';
import * as S from './store.js';
import * as N from './notify.js';
import { esc, icon, sheet, toast, isMobile } from './ui.js';
import { A } from './app-api.js';

const KIND_ICON = { reminder: '⏰', due: '🔔', yellow: '🟡', red: '🔴', alarm: '🚨', event: '📅', note: '📌', habit: '🔁', inbox: '📥', person: '🎂', focus: '✨', review: '🌙', multi: '🔁' };
const GROUP = { reminder: 'Vorgänge', due: 'Vorgänge', yellow: 'Vorgänge', red: 'Vorgänge', alarm: 'Vorgänge', multi: 'Vorgänge', event: 'Termine', note: 'Notizen', habit: 'Gewohnheiten', inbox: 'Inbox', person: 'Beziehungen', review: 'Rückblick', focus: 'Fokus' };
let filter = '';

export function ring(done, total, size = 64, stroke = 7) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const p = total ? done / total : 0;
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--surface-3)" stroke-width="${stroke}"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${p >= 1 ? 'var(--ok)' : 'var(--accent)'}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${(c * p).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/></svg>`;
}

export function openBell(counts) {
  const now = new Date();
  const ag = C.agendaFor(S.getData(), now, now);
  const c = counts;
  const attn = [
    ['Überfällig', c.red, '#/vorgaenge?f=over', c.red ? 'red' : ''],
    ['Inbox wartet zu lange', c.inboxRed, '#/inbox', c.inboxRed ? 'red' : ''],
    ['Offene Klärungen', c.klar, '#/beziehungen', ''],
    ['In der Inbox', c.inbox, '#/inbox', ''],
  ];
  // Zeitachse: was heute noch kommt
  const end = C.endOfDay ? C.endOfDay(now) : C.addDays(C.startOfDay(now), 1);
  let upcoming = [];
  try { upcoming = C.buildReminders(S.getData(), now, { appUrl: '', horizonH: Math.max(0.1, (end - now) / C.HOUR), catchupMin: 0, max: 60 }).filter(r => r.at <= end.getTime()); } catch { upcoming = []; }
  const draw = (el) => {
    const list = N.messages();
    const groups = [...new Set(list.map(x => GROUP[x.level] || 'Sonstiges'))];
    const shown = filter ? list.filter(x => (GROUP[x.level] || 'Sonstiges') === filter) : list;
    el.querySelector('[data-bbody]').innerHTML = `
      <a class="bell-day" href="#/heute" data-close>
        <div class="bell-ring">${ring(ag.done, ag.total, 58, 6)}<b>${ag.done}<span>/${ag.total}</span></b></div>
        <div class="grow"><b>Heute</b><div class="bell-kinds">${Object.entries(ag.kinds).map(([k, [d, t]]) => `<span class="${d >= t ? 'ok' : ''}">${esc(C.AGENDA_KINDS[k].name)} ${d}/${t}</span>`).join('')}</div></div>${icon('right', 16)}
      </a>
      <div class="notif-attn">${attn.map(([l, n, h, cls]) => `<a class="attn ${cls} ${n ? '' : 'zero'}" href="${h}" data-close><b>${n}</b><span>${l}</span></a>`).join('')}</div>
      ${upcoming.length ? `<div class="section-t">Heute noch</div><div class="bell-tl">${upcoming.slice(0, 12).map(r => `<div class="btl" data-bref="${esc(JSON.stringify(r.ref || {}))}"><span class="t num">${C.hm(new Date(r.at))}</span><span class="i">${KIND_ICON[r.level] || '🔔'}</span><span class="grow ellip">${esc(r.title.replace(/^\S+\s/, ''))}</span>${r.quiet ? `<span class="tiny faint" title="Wegen Ruhezeit „${esc(r.quiet)}“ verschoben">verschoben</span>` : ''}</div>`).join('')}</div>` : ''}
      <div class="row" style="margin-top:16px"><div class="section-t grow" style="margin:0">Erinnerungen</div>${list.length ? '<button class="link-btn" data-clear>Alle entfernen</button>' : ''}</div>
      ${groups.length > 1 ? `<div class="chips" style="margin:8px 0 4px"><button class="chip ${!filter ? 'on' : ''}" data-bf="">Alle ${list.length}</button>${groups.map(g => `<button class="chip ${filter === g ? 'on' : ''}" data-bf="${esc(g)}">${esc(g)} ${list.filter(x => (GROUP[x.level] || 'Sonstiges') === g).length}</button>`).join('')}</div>` : ''}
      <div data-list>${shown.length ? shown.map(x => `<div class="notif lvl-${esc(x.level || '')} ${x.read ? '' : 'unread'}" data-id="${esc(x.id)}"><div class="ni">${KIND_ICON[x.level] || '🔔'}</div><div class="nb" data-open="${esc(x.id)}"><b>${esc(x.title)}</b><span>${esc(x.message || '')}\n${esc(C.fmtRelTime(x.firedAt || x.at))}</span>
          <div class="nacts">${x.ref && x.ref.type === 'note' ? `<button class="btn sm" data-read="${esc(x.ref.id)}">Gelesen</button>` : ''}${x.ref && x.ref.type === 'habit' ? `<button class="btn sm" data-hopen="${esc(x.ref.id)}">Abhaken</button>` : ''}${x.ref && x.ref.type === 'review' ? `<button class="btn sm" data-rev="${esc(x.ref.id)}">Starten</button>` : ''}${x.ref && x.ref.type === 'task' && S.task(x.ref.id) && C.isOpen(S.task(x.ref.id)) ? `<button class="btn sm" data-snooze="${esc(x.ref.id)}">1 Std später</button><button class="btn sm" data-focus="${esc(x.ref.id)}">${icon('play', 11)}Fokus</button>` : ''}</div></div>
          <button class="icon-btn sm" data-del="${esc(x.id)}" aria-label="Entfernen">${icon('x', 14)}</button></div>`).join('')
      : '<div class="empty" style="padding:22px 8px"><b>Keine Erinnerungen</b><div class="small">Erinnerungen bleiben hier stehen, bis du sie entfernst oder die Sache erledigt ist.</div></div>'}</div>`;
  };
  const sh = sheet({
    title: 'Mitteilungen', side: !isMobile(), cls: 'bell-sheet',
    body: '<div data-bbody></div>',
    footer: `<a class="btn btn-ghost" href="#/einstellungen/benachrichtigungen" data-close>${icon('settings', 14)}Benachrichtigungen einstellen</a>`,
    onMount: (el, close) => {
      draw(el);
      el.addEventListener('click', async e => {
        const f = e.target.closest('[data-bf]');
        if (f) { filter = f.dataset.bf; draw(el); return; }
        const d = e.target.closest('[data-del]');
        if (d) { N.removeMessage(d.dataset.del); draw(el); return; }
        if (e.target.closest('[data-clear]')) { N.clearMessages(); draw(el); return; }
        const rd = e.target.closest('[data-read]');
        if (rd) { A.markNoteRead(rd.dataset.read); draw(el); return; }
        const ho = e.target.closest('[data-hopen]');
        if (ho) { close(); A.openHabit(ho.dataset.hopen); return; }
        const rv = e.target.closest('[data-rev]');
        if (rv) { close(); A.startReview(rv.dataset.rev); return; }
        const sn = e.target.closest('[data-snooze]');
        if (sn) { const t = S.task(sn.dataset.snooze); if (t) S.put('tasks', { ...t, snooze: Date.now() + C.HOUR }); toast('Erinnerung in 1 Std'); N.resolveRef('task', sn.dataset.snooze); draw(el); return; }
        const fc = e.target.closest('[data-focus]');
        if (fc) { close(); A.startFocus(fc.dataset.focus, { autostart: true }); return; }
        const tl = e.target.closest('[data-bref]');
        if (tl) { let ref = null; try { ref = JSON.parse(tl.dataset.bref); } catch { } close(); A.openRef(ref); return; }
        const o = e.target.closest('[data-open]');
        if (o) { const it = N.messages().find(x => x.id === o.dataset.open); close(); if (it) A.openRef(it.ref); }
      });
    },
  });
  setTimeout(() => N.markRead(), 600);
  return sh;
}
