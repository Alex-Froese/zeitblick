// Eisenhower-Matrix – lebendig, mit Drag & Drop (Maus und Touch). Q1 → „Jetzt erledigen“ startet den Fokus.
import * as C from '../core.js';
import * as S from '../store.js';
import { esc, icon, toast, isMobile, reducedMotion, popover } from '../ui.js';
import { A } from '../app-api.js';
import { vibrate } from '../audio.js';
import { catColor, dueInfo, sortTasks, ampDot } from './common.js';

let filterCat = null;
let lastRects = new Map();
let knownIds = new Set();
const EMPTY = { 1: 'Nichts brennt gerade. Sehr gut.', 2: 'Plane hier, was dich langfristig voranbringt.', 3: 'Was kann jemand anderes übernehmen?', 4: 'Hier landet, was du streichen kannst.' };

function card(t, q, now) {
  const c = S.cat(t.cat);
  const d = dueInfo(t, now);
  const lvl = C.ampel(t, now, S.settings()).level;
  const st = C.statusOf(t);
  const go = q === 1
    ? `<button class="btn-now" data-act="focus" data-id="${t.id}" title="Jetzt erledigen: Fokus starten">${icon('play', 11)}<span>Jetzt erledigen</span></button>`
    : q === 4 ? `<button class="icon-btn sm" data-act="del" data-id="${t.id}" aria-label="Verwerfen" title="Verwerfen – ins Archiv">${icon('x', 14)}</button>`
      : `<button class="icon-btn sm" data-act="focus" data-id="${t.id}" aria-label="Fokus starten" title="Fokus starten">${icon('play', 13)}</button>`;
  return `<div class="qcard" data-task="${t.id}" data-drag="${t.id}" tabindex="0">
    <button class="check" data-act="done" data-id="${t.id}" aria-label="Erledigen">${icon('check', 11)}</button>
    <div class="grow">
      <div class="qt">${esc(t.title)}</div>
      <div class="qmeta">
        ${lvl !== 'none' && lvl !== 'done' ? ampDot(lvl) : ''}
        ${d ? `<span class="${d.cls}">${esc(d.txt)}</span>` : ''}
        ${c ? `<span><i class="catdot" style="background:${catColor(c)};margin-right:4px"></i>${esc(c.name)}</span>` : ''}
        ${st !== 'neu' ? `<span>${esc(C.STATUS[st].name)}</span>` : ''}
        ${t.subs && t.subs.length ? `<span>${t.subs.filter(x => x.d).length}/${t.subs.length}</span>` : ''}
        ${t.delegate ? `<span>→ ${esc(t.delegate)}</span>` : ''}
        ${t.rec && t.rec.f ? `<span>${icon('repeat', 11, 'inl')}</span>` : ''}
      </div>
    </div>
    ${go}
  </div>`;
}

export function render() {
  lastRects = new Map();
  document.querySelectorAll('.qcard[data-drag]').forEach(el => lastRects.set(el.dataset.drag, el.getBoundingClientRect()));
  const now = A.now();
  const s = S.settings();
  const area = A.area();
  const today = C.ymd(now);
  let list = S.openTasks(t => S.inArea(t, area));
  if (filterCat && !S.cat(filterCat)) filterCat = null;
  if (filterCat) list = list.filter(t => t.cat === filterCat);
  const by = { 1: [], 2: [], 3: [], 4: [] };
  for (const t of list) by[C.quadrant(t, now, s)].push(t);
  for (const k of [1, 2, 3, 4]) sortTasks(by[k], now);
  const doneToday = q => S.tasks(t => S.inArea(t, area) && C.statusOf(t) === 'erledigt' && t.doneAt && C.ymd(new Date(t.doneAt)) === today && (!filterCat || t.cat === filterCat) && C.quadrant({ ...t, done: false, status: 'neu' }, now, s) === q).length;
  const stack = isMobile() && S.local.matrixStack !== false;
  const fc = filterCat && S.cat(filterCat);
  return `<div class="page">
  <div class="page-head">
    <div class="grow"><h1>Eisenhower-Matrix</h1><div class="psub">Ziehe Vorgänge in das passende Feld. Rückt eine Frist näher, wird ein Vorgang automatisch dringend.</div></div>
    <div class="page-actions">
      <button class="btn ${fc ? 'on-f' : ''}" data-mflt>${icon('filter', 15)}${fc ? esc(fc.name) : 'Filter'}</button>
      ${isMobile() ? `<button class="btn" data-mx="stack">${stack ? 'Raster' : 'Liste'}</button>` : ''}
    </div>
  </div>
  <div class="matrix ${stack ? 'stackm' : ''}">
    ${[1, 2, 3, 4].map(k => {
      const dt = doneToday(k);
      return `<section class="quad q${k}" data-quad="${k}" aria-label="${C.QUADRANTS[k].name}">
        <div class="qhead"><span class="qm" style="background:var(--q${k})"></span><span class="qn">${C.QUADRANTS[k].name}</span><span class="qs">${C.QUADRANTS[k].sub}</span><span class="qc" title="${dt} heute erledigt">${by[k].length}${dt ? `<span class="faint" style="font-weight:500"> · ${dt} ✓</span>` : ''}</span></div>
        <div class="qbody">${by[k].length ? by[k].map(t => card(t, k, now)).join('') : `<div class="qempty">${EMPTY[k]}</div>`}</div>
        <label class="qadd">${icon('plus', 15)}<input data-qadd="${k}" placeholder="Vorgang hinzufügen" aria-label="Vorgang zu ${C.QUADRANTS[k].name} hinzufügen"></label>
      </section>`;
    }).join('')}
  </div></div>`;
}

function filterPop(anchor) {
  const cats = S.cats(A.area() === 'all' ? null : A.area());
  popover(anchor, `<div class="flt-pop"><div class="flt-sec"><div class="lbl">Kategorie</div><div class="chips"><button class="chip ${!filterCat ? 'on' : ''}" data-fcat="">Alle</button>${cats.map(c => `<button class="chip ${filterCat === c.id ? 'on' : ''}" data-fcat="${c.id}"><i class="catdot" style="background:${catColor(c)}"></i>${esc(c.name)}</button>`).join('')}</div>${cats.length ? '' : '<p class="hint" style="margin-top:6px">Noch keine Kategorien angelegt.</p>'}</div></div>`, {
    width: 320, place: 'below',
    onMount: (el, close) => el.addEventListener('click', e => { const b = e.target.closest('[data-fcat]'); if (!b) return; filterCat = b.dataset.fcat || null; close(); A.render(); }),
  });
}

export function mount(root, ctx = {}) {
  const signal = ctx.signal;
  if (!reducedMotion()) {
    root.querySelectorAll('.qcard[data-drag]').forEach(el => {
      const id = el.dataset.drag;
      const prev = lastRects.get(id);
      if (prev) {
        const r = el.getBoundingClientRect();
        const dx = prev.left - r.left, dy = prev.top - r.top;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
          el.style.transition = 'none';
          el.style.transform = `translate(${dx}px, ${dy}px)`;
          requestAnimationFrame(() => { el.style.transition = 'transform .38s cubic-bezier(.3,1.2,.5,1)'; el.style.transform = ''; });
        }
      } else if (knownIds.size) el.classList.add('enter');
    });
  }
  knownIds = new Set([...root.querySelectorAll('.qcard[data-drag]')].map(e => e.dataset.drag));

  root.addEventListener('click', async e => {
    const b = e.target.closest('button');
    if (b && b.hasAttribute('data-mflt')) { filterPop(b); return; }
    if (b && b.dataset.mx === 'stack') { S.local.matrixStack = S.local.matrixStack === false; S.saveLocal(); A.render(); return; }
    if (b && b.dataset.act === 'del') { e.stopPropagation(); await A.discardTask(b.dataset.id); }
  }, { capture: true });
  root.querySelectorAll('[data-qadd]').forEach(inp => inp.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || !inp.value.trim()) return;
    const k = Number(inp.dataset.qadd);
    const p = C.parseQuick(inp.value, A.now(), S.cats());
    const area = p.area || (A.area() === 'all' ? 'p' : A.area());
    S.put('tasks', {
      title: p.title || inp.value.trim(), area, cat: p.cat || filterCat || null, prio: p.prio || (k === 1 ? 2 : 3), type: 'aufgabe', status: 'neu', log: [],
      imp: C.QUADRANTS[k].imp, urg: C.QUADRANTS[k].urg, autoUrg: !!C.QUADRANTS[k].urg, esc: true,
      due: p.due, dueTime: p.dueTime, rec: p.rec, dur: p.dur, subs: [], people: [], no: S.nextTicketNo(),
    });
    S.local._refocusQadd = k;
    toast(`In „${C.QUADRANTS[k].name}“ angelegt`);
  }));
  if (S.local._refocusQadd) { const i = root.querySelector(`[data-qadd="${S.local._refocusQadd}"]`); if (i) i.focus(); delete S.local._refocusQadd; }

  // Drag & Drop
  let st = null;
  const quadAt = (x, y) => { const el = document.elementFromPoint(x, y); return el && el.closest('[data-quad]'); };
  root.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    const el = e.target.closest('.qcard[data-drag]');
    if (!el || e.target.closest('button, input')) return;
    st = { id: e.pointerId, el, x0: e.clientX, y0: e.clientY, touch: e.pointerType !== 'mouse', moved: false, active: false };
    if (st.touch) st.timer = setTimeout(() => { if (st && !st.moved) { activate(e.clientX, e.clientY); vibrate(15); } }, 300);
  });
  root.addEventListener('touchmove', e => { if (st && st.active) e.preventDefault(); }, { passive: false });
  const activate = (x, y) => {
    st.active = true;
    A.dragging = true;
    const r = st.el.getBoundingClientRect();
    st.offX = x - r.left; st.offY = y - r.top;
    st.clone = st.el.cloneNode(true);
    st.clone.classList.add('dragging');
    st.clone.style.width = r.width + 'px';
    st.clone.style.left = r.left + 'px'; st.clone.style.top = r.top + 'px';
    document.body.appendChild(st.clone);
    st.el.classList.add('ghost');
    st.from = st.el.closest('[data-quad]');
  };
  window.addEventListener('pointermove', e => {
    if (!st || e.pointerId !== st.id) return;
    if (!st.moved && Math.hypot(e.clientX - st.x0, e.clientY - st.y0) > 5) {
      st.moved = true;
      if (!st.touch) activate(e.clientX, e.clientY);
      else if (!st.active) { clearTimeout(st.timer); st = null; return; }
    }
    if (!st.active) return;
    e.preventDefault();
    const edge = 70;
    if (e.clientY < edge + 50) window.scrollBy(0, -14);
    else if (e.clientY > window.innerHeight - edge) window.scrollBy(0, 14);
    st.clone.style.left = (e.clientX - st.offX) + 'px';
    st.clone.style.top = (e.clientY - st.offY) + 'px';
    const q = quadAt(e.clientX, e.clientY);
    root.querySelectorAll('.quad').forEach(x => x.classList.toggle('drop', x === q && x !== st.from));
    st.target = q;
  }, { passive: false, signal });
  const end = (e, cancel) => {
    if (!st || e.pointerId !== st.id) return;
    const s0 = st; st = null; clearTimeout(s0.timer);
    root.querySelectorAll('.quad').forEach(x => x.classList.remove('drop'));
    if (!s0.active) return;
    A.dragging = false;
    if (s0.clone) s0.clone.remove();
    s0.el.classList.remove('ghost');
    const kill = ev => { ev.stopPropagation(); ev.preventDefault(); };
    window.addEventListener('click', kill, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', kill, { capture: true }), 50);
    if (cancel || !s0.target || s0.target === s0.from) { A.render(); return; }
    const k = Number(s0.target.dataset.quad);
    const t = S.task(s0.el.dataset.drag);
    if (!t) return;
    const prev = { ...t };
    const q = C.QUADRANTS[k];
    S.put('tasks', C.addLog({ ...t, imp: q.imp, urg: q.urg, autoUrg: !!q.urg }, `Matrix: ${q.name}`, 'system'));
    vibrate(10);
    toast(`Verschoben nach „${q.name}“`, { action: 'Rückgängig', onAction: () => S.put('tasks', { ...S.task(prev.id), imp: prev.imp, urg: prev.urg, autoUrg: prev.autoUrg }) });
  };
  window.addEventListener('pointerup', e => end(e, false), { signal });
  window.addEventListener('pointercancel', e => end(e, true), { signal });
}
