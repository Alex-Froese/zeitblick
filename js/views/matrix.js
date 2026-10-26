// Eisenhower-Matrix – lebendig, mit Drag & Drop (Maus und Touch)
import * as C from '../core.js';
import * as S from '../store.js';
import { esc, icon, toast, isMobile, reducedMotion } from '../ui.js';
import { A } from '../app-api.js';
import { vibrate } from '../audio.js';
import { catColor, dueInfo, sortTasks } from './common.js';

let filterCat = null;
let lastRects = new Map();
let knownIds = new Set();

function card(t, q, now) {
  const c = S.cat(t.cat);
  const d = dueInfo(t, now);
  const lvl = C.ampel(t, now, S.settings()).level;
  const subs = t.subs && t.subs.length ? `<span>${icon('sub', 12)}${t.subs.filter(x => x.d).length}/${t.subs.length}</span>` : '';
  const go = t.done ? '' : q === 1
    ? `<button class="btn-now" data-act="focus" data-id="${t.id}" title="Jetzt erledigen: Fokus starten">${icon('play', 12)}<span>Jetzt</span></button>`
    : q === 4 ? `<button class="icon-btn sm" data-act="del" data-id="${t.id}" aria-label="Streichen" title="Streichen">${icon('trash', 15)}</button>`
      : `<button class="icon-btn sm" data-act="focus" data-id="${t.id}" aria-label="Fokus starten" title="Fokus starten">${icon('play', 14)}</button>`;
  return `<div class="qcard ${lvl === 'alarm' ? 'alarm' : ''} ${t.done ? 'done' : ''}" data-task="${t.id}" data-drag="${t.id}" style="--cc:${c ? catColor(c) : 'var(--line-2)'}" tabindex="0">
    <button class="chk p${t.prio || 3} ${t.done ? 'on' : ''}" data-act="done" data-id="${t.id}" aria-label="Erledigen">${icon('check', 12)}</button>
    <div class="grow">
      <div class="qt" style="${t.done ? 'text-decoration:line-through;color:var(--muted)' : ''}">${esc(t.title)}</div>
      <div class="qm">
        ${lvl !== 'none' && lvl !== 'done' ? `<i class="amp ${lvl}"></i>` : ''}
        ${d && !t.done ? `<span class="${d.cls}">${esc(d.txt)}</span>` : ''}
        ${c ? `<span>${esc(c.icon || '')} ${esc(c.name)}</span>` : ''}
        ${subs}
        ${t.delegate ? `<span>${icon('person', 12)}${esc(t.delegate)}</span>` : ''}
        ${t.rec && t.rec.f ? `<span>${icon('repeat', 12)}</span>` : ''}
      </div>
    </div>
    <div class="go">${go}</div>
  </div>`;
}

export function render() {
  // Positionen für FLIP-Animation merken
  lastRects = new Map();
  document.querySelectorAll('.qcard[data-drag]').forEach(el => lastRects.set(el.dataset.drag, el.getBoundingClientRect()));
  const now = A.now();
  const s = S.settings();
  const area = A.area();
  const showDone = S.local.matrixShowDone;
  const today = C.ymd(now);
  let list = S.tasks(t => S.inArea(t, area) && (!t.done || (showDone && t.doneAt && C.ymd(new Date(t.doneAt)) === today)));
  if (filterCat) list = list.filter(t => t.cat === filterCat);
  const by = { 1: [], 2: [], 3: [], 4: [] };
  for (const t of list) by[C.quadrant(t, now, s)].push(t);
  for (const k of [1, 2, 3, 4]) by[k] = sortTasks(by[k], now).sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0));
  const cats = S.cats(area);
  const doneToday = q => S.tasks(t => S.inArea(t, area) && t.done && t.doneAt && C.ymd(new Date(t.doneAt)) === today && C.quadrant({ ...t, done: false }, now, s) === q).length;
  const stack = S.local.matrixStack && isMobile();
  return `
  <div class="page-head">
    <div class="grow"><h1>Eisenhower-Matrix</h1><div class="page-sub">Ziehe Aufgaben in das passende Feld. Rückt eine Frist näher, wird die Aufgabe automatisch dringend.</div></div>
    <label class="switch small"><input type="checkbox" data-mx="done" ${showDone ? 'checked' : ''}><span class="tr"></span>Heute erledigte zeigen</label>
    ${isMobile() ? `<button class="btn sm" data-mx="stack">${stack ? 'Raster' : 'Liste'}</button>` : ''}
  </div>
  <div class="chips scroll" style="margin-bottom:14px">
    <button class="chip ${!filterCat ? 'on' : ''}" data-fcat="">Alle Kategorien</button>
    ${cats.map(c => `<button class="chip ${filterCat === c.id ? 'on' : ''}" data-fcat="${c.id}"><i class="cdot" style="background:${catColor(c)}"></i>${esc(c.icon || '')} ${esc(c.name)}</button>`).join('')}
  </div>
  <div class="matrix ${stack ? 'stack' : ''}">
    ${[1, 2, 3, 4].map(k => {
      const open = by[k].filter(t => !t.done).length;
      const dt = doneToday(k);
      const pct = open + dt ? Math.round(dt / (open + dt) * 100) : 0;
      return `<section class="quad q${k}" data-quad="${k}" aria-label="${C.QUADRANTS[k].name}">
        <div class="qhead"><div><div class="qn">${C.QUADRANTS[k].name}</div><div class="qs">${C.QUADRANTS[k].sub}</div></div><div class="qcount" aria-label="${open} offen">${open}</div></div>
        <div class="q-progress" title="${dt} heute erledigt"><i style="width:${pct}%"></i></div>
        <div class="qbody">${by[k].length ? by[k].map(t => card(t, k, now)).join('') : `<div class="qempty">${k === 1 ? 'Nichts brennt gerade. Sehr gut.' : k === 2 ? 'Plane hier, was dich langfristig voranbringt.' : k === 3 ? 'Was kann jemand anderes übernehmen?' : 'Hier landet, was du streichen kannst.'}</div>`}</div>
        <label class="qadd">${icon('plus', 16)}<input data-qadd="${k}" placeholder="Aufgabe hinzufügen" aria-label="Aufgabe zu ${C.QUADRANTS[k].name} hinzufügen"></label>
      </section>`;
    }).join('')}
  </div>`;
}

export function mount(root, ctx = {}) {
  const signal = ctx.signal;
  // FLIP
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
    if (b && b.dataset.fcat !== undefined) { filterCat = b.dataset.fcat || null; A.render(); return; }
    if (b && b.dataset.mx === 'stack') { S.local.matrixStack = !S.local.matrixStack; S.saveLocal(); A.render(); return; }
    if (b && b.dataset.act === 'del') {
      e.stopPropagation();
      const prev = S.remove('tasks', b.dataset.id);
      toast('Aufgabe gestrichen', { action: 'Rückgängig', onAction: () => S.restore('tasks', prev) });
    }
  }, { capture: true });
  root.addEventListener('change', e => { if (e.target.dataset.mx === 'done') { S.local.matrixShowDone = e.target.checked; S.saveLocal(); A.render(); } });
  root.querySelectorAll('[data-qadd]').forEach(inp => inp.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || !inp.value.trim()) return;
    const k = Number(inp.dataset.qadd);
    const p = C.parseQuick(inp.value, A.now(), S.cats());
    const area = p.area || (A.area() === 'all' ? 'p' : A.area());
    S.put('tasks', {
      title: p.title || inp.value.trim(), area, cat: p.cat || filterCat || null, prio: p.prio || (k === 1 ? 2 : 3),
      imp: C.QUADRANTS[k].imp, urg: C.QUADRANTS[k].urg, autoUrg: C.QUADRANTS[k].urg ? true : false, esc: true,
      due: p.due, dueTime: p.dueTime, rec: p.rec, dur: p.dur, subs: [], no: S.nextTicketNo(),
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
    // Am Rand automatisch scrollen
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
    // Klick nach dem Ziehen unterdrücken
    const kill = ev => { ev.stopPropagation(); ev.preventDefault(); };
    window.addEventListener('click', kill, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', kill, { capture: true }), 50);
    if (cancel || !s0.target || s0.target === s0.from) { A.render(); return; }
    const k = Number(s0.target.dataset.quad);
    const t = S.task(s0.el.dataset.drag);
    if (!t) return;
    const prev = { ...t };
    const q = C.QUADRANTS[k];
    const upd = { ...t, imp: q.imp, urg: q.urg };
    if (!q.urg) upd.autoUrg = false; else upd.autoUrg = true;
    S.put('tasks', upd);
    vibrate(10);
    toast(`Verschoben nach „${q.name}“`, { action: 'Rückgängig', onAction: () => S.put('tasks', { ...S.task(prev.id), imp: prev.imp, urg: prev.urg, autoUrg: prev.autoUrg }) });
  };
  window.addEventListener('pointerup', e => end(e, false), { signal });
  window.addEventListener('pointercancel', e => end(e, true), { signal });
}
