// Verknüpfungs-Netz: Panel „Verbunden mit“ und Auswahl für jede Art von Eintrag
import * as C from './core.js';
import * as S from './store.js';
import { esc, icon, popover, closePopover, sheet, isMobile, toast } from './ui.js';
import { A } from './app-api.js';

const VIA = { link: '', back: 'verweist hierher', field: 'Zuordnung', origin: 'Ursprung' };

function subOf(l) {
  const r = l.rec;
  if (l.c === 'tasks') return `${C.STATUS[C.statusOf(r)].name}${r.due ? ' · ' + C.fmtDue(r.due, r.dueTime) : ''}`;
  if (l.c === 'notes') return C.NOTE_KINDS[C.noteKind(r)].name;
  if (l.c === 'habits') return r.kind === 'routine' ? 'Routine' : 'Gewohnheit';
  if (l.c === 'events') return C.fmtDateShort(C.parseLocal(r.s));
  if (l.c === 'people') return r.rel || 'Person';
  return C.LINKABLE[l.c].name;
}

/** HTML für das Panel „Verbunden mit“ */
export function linkPanelHtml(col, id, opts = {}) {
  if (!id) return '';
  const list = C.linksOf(S.getData(), col, id).filter(l => !(opts.hide || []).includes(l.c));
  const groups = {};
  for (const l of list) (groups[l.c] = groups[l.c] || []).push(l);
  return `<div class="links" data-links="${col}:${id}">
    <div class="links-head"><span class="lbl">${icon('link', 13)} Verbunden mit</span><span class="sp"></span><button type="button" class="btn sm btn-ghost" data-link-add>${icon('plus', 13)}Verknüpfen</button></div>
    ${list.length ? Object.entries(groups).map(([c, ls]) => `<div class="links-g"><div class="links-gt">${esc(C.LINKABLE[c].name)}${ls.length > 1 ? ` · ${ls.length}` : ''}</div>${ls.slice(0, opts.max || 30).map(l => `<div class="link-chip" data-lopen="${l.c}:${l.id}" tabindex="0">${icon(C.LINKABLE[l.c].icon, 13)}<span class="grow ellip">${esc(C.titleOf(l.c, l.rec))}</span><span class="tiny muted ellip">${esc(subOf(l))}${VIA[l.via] ? ' · ' + VIA[l.via] : ''}</span>${l.via === 'link' || l.via === 'back' ? `<button type="button" class="icon-btn sm" data-lrm="${l.c}:${l.id}:${l.via}" aria-label="Verknüpfung lösen" title="Verknüpfung lösen">${icon('x', 12)}</button>` : ''}</div>`).join('')}</div>`).join('')
      : `<div class="tiny muted" style="padding:2px 0 4px">Noch nichts verknüpft. Verbinde Notizen, Personen, Projekte, Gewohnheiten oder Termine – so entsteht dein Netz.</div>`}
  </div>`;
}

/** Klicks im Panel binden (rerender = Funktion, die das Panel neu zeichnet) */
export function bindLinkPanel(root, col, id, rerender, signal) {
  root.addEventListener('click', e => {
    const box = e.target.closest('[data-links]');
    if (!box || box.dataset.links !== col + ':' + id) return;
    const add = e.target.closest('[data-link-add]');
    if (add) { e.preventDefault(); openLinkPicker(add, { col, id, onPick: () => rerender && rerender() }); return; }
    const rm = e.target.closest('[data-lrm]');
    if (rm) {
      e.preventDefault(); e.stopPropagation();
      const [c, oid, via] = rm.dataset.lrm.split(':');
      if (via === 'link') { const r = S.get(col, id); if (r) S.put(col, C.removeLink(r, c, oid)); }
      else { const r = S.get(c, oid); if (r) S.put(c, C.removeLink(r, col, id)); }
      toast('Verknüpfung gelöst', { ms: 1400 });
      rerender && rerender();
      return;
    }
    const op = e.target.closest('[data-lopen]');
    if (op) { e.preventDefault(); const [c, oid] = op.dataset.lopen.split(':'); closePopover(); A.openItem(c, oid); }
  }, signal ? { signal } : undefined);
}

function candidates(q, excludeKey) {
  const n = C.norm(q);
  const out = [];
  const add = (c, r) => { if (c + ':' + r.id === excludeKey) return; out.push({ c, id: r.id, t: C.titleOf(c, r), r }); };
  const data = S.getData();
  for (const c of Object.keys(C.LINKABLE)) {
    for (const r of Object.values(data[c] || {})) {
      if (!r || r.deleted) continue;
      if (c === 'tasks' && C.isClosed(r) && !n) continue;
      if (c === 'events' && !n) continue;
      const t = C.titleOf(c, r);
      if (n && !C.norm(t).includes(n)) continue;
      add(c, r);
    }
  }
  out.sort((a, b) => (b.r.updatedAt || 0) - (a.r.updatedAt || 0));
  return out.slice(0, 40);
}

/** Auswahl öffnen: sucht über alle Module, verknüpft beim Klick */
export function openLinkPicker(anchor, { col, id, onPick, only } = {}) {
  const selfKey = col + ':' + id;
  const html = `<div class="lpick"><div class="search-box sm">${icon('search', 15)}<input data-lq placeholder="Notiz, Person, Projekt, Vorgang … suchen" aria-label="Suchen"></div>
    <div class="chips" data-lf style="margin:8px 0 6px">${['', ...Object.keys(C.LINKABLE)].filter(c => !only || !c || only.includes(c)).map(c => `<button type="button" class="chip ${c ? '' : 'on'}" data-c="${c}">${c ? esc(C.LINKABLE[c].name) : 'Alle'}</button>`).join('')}</div>
    <div data-lres class="lres"></div></div>`;
  const mountFn = (el, close) => {
    const inp = el.querySelector('[data-lq]'); const box = el.querySelector('[data-lres]');
    let filter = '';
    const existing = new Set(C.linksOf(S.getData(), col, id).map(l => l.c + ':' + l.id));
    const draw = () => {
      let list = candidates(inp.value, selfKey);
      if (filter) list = list.filter(x => x.c === filter);
      if (only) list = list.filter(x => only.includes(x.c));
      box.innerHTML = list.map(x => `<button type="button" class="lres-i ${existing.has(x.c + ':' + x.id) ? 'on' : ''}" data-pick="${x.c}:${x.id}">${icon(C.LINKABLE[x.c].icon, 14)}<span class="grow ellip">${esc(x.t)}</span><span class="tiny muted">${esc(C.LINKABLE[x.c].name)}</span>${existing.has(x.c + ':' + x.id) ? icon('check', 13) : ''}</button>`).join('') || '<div class="tiny muted" style="padding:8px">Nichts gefunden.</div>';
    };
    inp.addEventListener('input', draw);
    el.querySelector('[data-lf]').addEventListener('click', e => { const b = e.target.closest('[data-c]'); if (!b) return; filter = b.dataset.c; el.querySelectorAll('[data-lf] .chip').forEach(x => x.classList.toggle('on', x === b)); draw(); });
    box.addEventListener('click', e => {
      const b = e.target.closest('[data-pick]'); if (!b) return;
      const [c, oid] = b.dataset.pick.split(':');
      if (existing.has(c + ':' + oid)) { toast('Schon verknüpft', { ms: 1200 }); return; }
      const r = S.get(col, id); if (!r) return;
      S.put(col, C.addLink(r, c, oid));
      existing.add(c + ':' + oid);
      toast(`Verknüpft mit „${esc(C.titleOf(c, S.get(c, oid)))}“`, { ms: 1600 });
      onPick && onPick({ c, id: oid });
      close();
    });
    draw();
    setTimeout(() => inp.focus(), 30);
  };
  if (isMobile() || !anchor) sheet({ title: 'Verknüpfen', cls: 'sheet-sm', body: html, onMount: mountFn });
  else popover(anchor, html, { width: 360, place: 'below', onMount: mountFn });
}
