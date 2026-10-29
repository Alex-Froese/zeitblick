// Zeitblick – UI-Helfer: Icons, Escaping, Dialoge, Popover, Toasts, Tooltips
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const P = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h5v-6h4v6h5V9.5"/>',
  calendar: '<rect x="3" y="4.5" width="18" height="16" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>',
  matrix: '<rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5"/>',
  list: '<path d="M10 6h11M10 12h11M10 18h11"/><path d="m3 6 1.5 1.5L7 5M3 12l1.5 1.5L7 11M3 18l1.5 1.5L7 17"/>',
  focus: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
  ampel: '<rect x="8" y="2.5" width="8" height="19" rx="4"/><circle cx="12" cy="7" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="17" r="1.6"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  night: '<path d="M12 3a6 6 0 0 0-3.5 10.9V17h7v-3.1A6 6 0 0 0 12 3z"/><path d="M9.5 21h5"/>',
  auto: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/>',
  sync: '<path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5M3 21v-5h5"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  left: '<path d="m15 18-6-6 6-6"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  up: '<path d="m6 15 6-6 6 6"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  play: '<path d="M8 5.2v13.6a.8.8 0 0 0 1.2.7l11-6.8a.8.8 0 0 0 0-1.4l-11-6.8A.8.8 0 0 0 8 5.2z" fill="currentColor" stroke="none"/>',
  pause: '<path d="M7 4.5h3.5v15H7zM13.5 4.5H17v15h-3.5z" fill="currentColor" stroke="none"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none"/>',
  repeat: '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="m7 22-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  tag: '<path d="M3 12V3h9l9 9-9 9z"/><circle cx="7.5" cy="7.5" r="1.3"/>',
  folder: '<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H10l2 2.5h7.5A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z"/>',
  download: '<path d="M12 3v13M7 11l5 5 5-5M4 21h16"/>',
  upload: '<path d="M12 21V8M7 13l5-5 5 5M4 3h16"/>',
  link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3.2-3.2a4.5 4.5 0 0 0-6.4-6.4L12 5.6"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3.2 3.2a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  more: '<circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none"/>',
  alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17.5v.5"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  notes: '<path d="M5 4h14v16H5z"/><path d="M9 9h6M9 13h6M9 17h3"/>',
  sound: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/>',
  expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
  laptop: '<rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M2 19h20"/>',
  cloud: '<path d="M7 18a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 18 8.5a4.5 4.5 0 0 1-.5 9.5z"/>',
  gem: '<path d="M12 2.5 19 8l-2.5 11.5h-9L5 8z"/><path d="m5 8 7 4 7-4M12 12v7.5"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM18 18h3v3h-3zM14 20h2"/>',
  snooze: '<circle cx="12" cy="13" r="7.5"/><path d="M12 9.5V13l2.5 1.5M4 4.5 6.5 2.5M20 4.5l-2.5-2"/>',
  open: '<path d="M7 17 17 7M8 7h9v9"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  brief: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  grip: '<circle cx="9" cy="6" r="1.4" fill="currentColor" stroke="none"/><circle cx="15" cy="6" r="1.4" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="9" cy="18" r="1.4" fill="currentColor" stroke="none"/><circle cx="15" cy="18" r="1.4" fill="currentColor" stroke="none"/>',
  sub: '<path d="M6 4v9a3 3 0 0 0 3 3h9"/><path d="m15 13 3 3-3 3"/>',
  inbox: '<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5.5 5h13L21 13v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6z"/>',
  archive: '<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4"/>',
  book: '<path d="M4 19.5V5a2 2 0 0 1 2-2h13v15H6a2 2 0 0 0-2 2 2 2 0 0 0 2 2h13"/>',
  heart: '<path d="M12 20s-7-4.4-9-9a4.6 4.6 0 0 1 9-3 4.6 4.6 0 0 1 9 3c-2 4.6-9 9-9 9z"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>',
  filter: '<path d="M3 5h18l-7 8.5V19l-4 2v-7.5z"/>',
  sort: '<path d="M7 4v16M3.5 16.5 7 20l3.5-3.5M17 20V4M13.5 7.5 17 4l3.5 3.5"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  minus: '<path d="M5 12h14"/>',
  person: '<circle cx="12" cy="7.5" r="3.5"/><path d="M5 20.5c.8-4 3.6-6 7-6s6.2 2 7 6"/>',
};
export function icon(name, size = 20, cls = '') {
  const r = +(size / 16).toFixed(4);
  return `<svg class="ic ${cls}" style="width:${r}rem;height:${r}rem" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
}

/* ---------------- Dialoge (Desktop: zentriert/Seitenpanel, Handy: Bottom-Sheet) ---------------- */
const openSheets = [];
export function sheet({ title = '', body = '', footer = '', cls = '', side = false, onMount, onClose, label }) {
  const back = document.createElement('div');
  back.className = 'sheet-back' + (side ? ' side' : '');
  back.innerHTML = `<div class="sheet ${cls}" role="dialog" aria-modal="true" aria-label="${esc(label || title)}">
    ${title !== null ? `<header class="sheet-head"><h2>${title}</h2><button class="icon-btn sheet-x" data-close aria-label="Schließen">${icon('x')}</button></header>` : ''}
    <div class="sheet-body">${body}</div>
    ${footer ? `<footer class="sheet-foot">${footer}</footer>` : ''}
  </div>`;
  document.body.appendChild(back);
  const el = back.querySelector('.sheet');
  const prevFocus = document.activeElement;
  let closed = false;
  const close = (reason) => {
    if (closed) return; closed = true;
    back.classList.remove('in');
    back.classList.add('out');
    const i = openSheets.indexOf(api); if (i >= 0) openSheets.splice(i, 1);
    setTimeout(() => back.remove(), 220);
    if (onClose) onClose(reason);
    try { if (prevFocus && prevFocus.focus) prevFocus.focus({ preventScroll: true }); } catch { }
  };
  const api = { el, back, close };
  openSheets.push(api);
  back.addEventListener('pointerdown', e => { if (e.target === back) back._downOnBack = true; else back._downOnBack = false; });
  back.addEventListener('click', e => {
    if (e.target === back && back._downOnBack) close('backdrop');
    const c = e.target.closest('[data-close]'); if (c && back.contains(c)) close('button');
  });
  requestAnimationFrame(() => back.classList.add('in'));
  if (onMount) onMount(el, close);
  setTimeout(() => {
    const f = el.querySelector('[autofocus]') || null;
    if (f) { try { f.focus({ preventScroll: true }); if (f.select && f.value) f.select(); } catch { } }
  }, 60);
  return api;
}
export function topSheet() { return openSheets[openSheets.length - 1] || null; }
export function closeAllSheets() { [...openSheets].forEach(s => s.close('nav')); }

// Sperrzeit für Bestätigungen (Einstellungen → Vorgänge); 0 = sofort bestätigbar
let confirmSec = 3;
export function setConfirmSec(n) { confirmSec = Math.max(0, Math.min(10, Number(n) || 0)); }
export function getConfirmSec() { return confirmSec; }
export function confirmDialog(text, { ok = 'OK', cancel = 'Abbrechen', danger = false, title = 'Bist du sicher?', cooldown = 0 } = {}) {
  if (cooldown) cooldown = confirmSec;
  return new Promise(resolve => {
    let done = false;
    sheet({
      title: esc(title), cls: 'sheet-sm',
      body: `<p class="confirm-text">${text}</p>`,
      footer: `<button class="btn" data-close>${esc(cancel)}</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'} cool" data-ok ${cooldown ? 'disabled' : 'autofocus'}><span data-okl>${esc(ok)}${cooldown ? ` (${cooldown})` : ''}</span>${cooldown ? '<i class="cd"></i>' : ''}</button>`,
      onMount: (el, close) => {
        const btn = el.querySelector('[data-ok]');
        btn.addEventListener('click', () => { if (btn.disabled) return; done = true; resolve(true); close('ok'); });
        if (cooldown) {
          // Sperre: erst nach Ablauf bestätigbar (schützt vor versehentlichem Klicken)
          const lab = el.querySelector('[data-okl]');
          const bar = el.querySelector('.cd');
          const t0 = Date.now(), ms = cooldown * 1000;
          const tick = () => {
            const left = ms - (Date.now() - t0);
            if (!document.body.contains(btn)) return;
            if (left <= 0) { btn.disabled = false; lab.textContent = ok; bar.style.width = '0'; btn.focus(); return; }
            lab.textContent = `${ok} (${Math.ceil(left / 1000)})`;
            bar.style.width = `${(left / ms) * 100}%`;
            setTimeout(tick, 40);
          };
          tick();
        }
      },
      onClose: () => { if (!done) resolve(false); },
    });
  });
}

export function promptDialog(text, { value = '', ok = 'Speichern', title = '', placeholder = '', multiline = false } = {}) {
  return new Promise(resolve => {
    let done = false;
    sheet({
      title: esc(title || text), cls: 'sheet-sm',
      body: `${title && text ? `<p class="confirm-text">${text}</p>` : ''}${multiline ? `<textarea class="textarea" data-in rows="4" placeholder="${esc(placeholder)}" autofocus>${esc(value)}</textarea>` : `<input class="input" data-in value="${esc(value)}" placeholder="${esc(placeholder)}" autofocus>`}`,
      footer: `<button class="btn" data-close>Abbrechen</button><button class="btn btn-primary" data-ok>${esc(ok)}</button>`,
      onMount: (el, close) => {
        const inp = el.querySelector('[data-in]');
        const go = () => { done = true; resolve(inp.value); close('ok'); };
        el.querySelector('[data-ok]').addEventListener('click', go);
        inp.addEventListener('keydown', e => { if (e.key === 'Enter' && (!multiline || e.ctrlKey || e.metaKey || !e.shiftKey)) { e.preventDefault(); go(); } });
      },
      onClose: () => { if (!done) resolve(null); },
    });
  });
}

/* ---------------- Popover ---------------- */
let currentPop = null;
export function closePopover() { if (currentPop) { const p = currentPop; currentPop = null; p.remove(); document.removeEventListener('pointerdown', onDocDown, true); } }
function onDocDown(e) { if (currentPop && !currentPop.contains(e.target) && !(currentPop._anchor && currentPop._anchor.contains && currentPop._anchor.contains(e.target))) closePopover(); }
export function popover(anchor, html, { cls = '', onMount, width = 320, place = 'auto' } = {}) {
  closePopover();
  const el = document.createElement('div');
  el.className = 'popover ' + cls;
  el.style.width = Math.min(width, window.innerWidth - 16) + 'px';
  el.innerHTML = html;
  document.body.appendChild(el);
  const r = anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y, width: 0, height: 0 };
  const pw = el.offsetWidth, ph = el.offsetHeight;
  const vw = window.innerWidth, vh = window.innerHeight;
  let x, y;
  if (place === 'below' || (place === 'auto' && r.width < 260)) {
    x = Math.min(Math.max(8, r.left + r.width / 2 - pw / 2), vw - pw - 8);
    y = r.bottom + 8; if (y + ph > vh - 8) y = Math.max(8, r.top - ph - 8);
  } else {
    x = r.right + 10; if (x + pw > vw - 8) x = r.left - pw - 10; if (x < 8) x = Math.min(Math.max(8, r.left + r.width / 2 - pw / 2), vw - pw - 8);
    y = Math.min(Math.max(8, r.top), vh - ph - 8);
  }
  el.style.left = x + 'px'; el.style.top = y + 'px';
  el._anchor = anchor;
  currentPop = el;
  setTimeout(() => document.addEventListener('pointerdown', onDocDown, true), 0);
  requestAnimationFrame(() => el.classList.add('in'));
  if (onMount) onMount(el, closePopover);
  return el;
}

/* ---------------- Toasts ---------------- */
export function toast(msg, { action, onAction, kind = '', ms = 4200 } = {}) {
  let wrap = document.getElementById('toasts');
  if (!wrap) { wrap = document.createElement('div'); wrap.id = 'toasts'; wrap.setAttribute('role', 'status'); wrap.setAttribute('aria-live', 'polite'); document.body.appendChild(wrap); }
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.innerHTML = `<span>${msg}</span>${action ? `<button class="toast-act">${esc(action)}</button>` : ''}`;
  wrap.appendChild(el);
  requestAnimationFrame(() => el.classList.add('in'));
  const kill = () => { el.classList.remove('in'); setTimeout(() => el.remove(), 250); };
  if (action) el.querySelector('.toast-act').addEventListener('click', () => { kill(); onAction && onAction(); });
  setTimeout(kill, ms);
  return kill;
}

/* ---------------- Tooltips für Diagramme ---------------- */
let tip = null;
export function initTooltips() {
  tip = document.createElement('div');
  tip.className = 'tip'; tip.setAttribute('role', 'tooltip');
  document.body.appendChild(tip);
  const show = (t, x, y) => {
    tip.innerHTML = t; tip.classList.add('in');
    const w = tip.offsetWidth, hh = tip.offsetHeight;
    let left = x - w / 2, top = y - hh - 12;
    left = Math.max(6, Math.min(left, window.innerWidth - w - 6));
    if (top < 6) top = y + 16;
    tip.style.left = left + 'px'; tip.style.top = top + 'px';
  };
  document.addEventListener('pointerover', e => {
    const t = e.target.closest && e.target.closest('[data-tip]');
    if (!t) { tip.classList.remove('in'); return; }
    const r = t.getBoundingClientRect();
    show(t.getAttribute('data-tip'), r.left + r.width / 2, r.top);
  });
  document.addEventListener('pointerdown', () => tip.classList.remove('in'));
  document.addEventListener('scroll', () => tip.classList.remove('in'), true);
}

/* ---------------- Kleine Helfer ---------------- */
export function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
export function isMobile() { return window.matchMedia('(max-width: 759px)').matches; }
export function reducedMotion() { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }

/** Farbe für den Nachtmodus in warmes Rot/Bernstein umrechnen */
export function tint(hex, theme) {
  if (theme !== 'night' || !hex || hex[0] !== '#') return hex;
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const L = 32 + l * 30; // 32–62 %
  const hue = 8 + Math.round(((r + g * 2 + b * 3) % 30));
  return `hsl(${hue} 85% ${L}%)`;
}

/** Konfetti-Burst an einem Element (für erledigte Aufgaben) */
export function burst(el, color = 'var(--accent)') {
  if (reducedMotion() || !el) return;
  const r = el.getBoundingClientRect();
  const wrap = document.createElement('div');
  wrap.className = 'burst';
  wrap.style.left = (r.left + r.width / 2) + 'px';
  wrap.style.top = (r.top + r.height / 2) + 'px';
  for (let i = 0; i < 12; i++) {
    const s = document.createElement('i');
    const a = (Math.PI * 2 * i) / 12 + Math.random() * 0.4;
    const d = 26 + Math.random() * 22;
    s.style.setProperty('--dx', Math.cos(a) * d + 'px');
    s.style.setProperty('--dy', Math.sin(a) * d + 'px');
    s.style.background = i % 3 === 0 ? 'var(--ok)' : i % 3 === 1 ? color : 'var(--warn)';
    wrap.appendChild(s);
  }
  document.body.appendChild(wrap);
  setTimeout(() => wrap.remove(), 700);
}

/** Datei herunterladen */
export function download(name, text, type = 'application/json') {
  let framed = false;
  try { framed = window.top !== window.self; } catch { framed = true; }
  if (framed) { toast('Herunterladen geht nur in der installierten App, nicht in der Vorschau.', { kind: 'bad' }); return; }
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch { } ta.remove(); return ok;
  }
}

export function pickFile(accept) {
  return new Promise(resolve => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = accept;
    inp.onchange = () => resolve(inp.files && inp.files[0] ? inp.files[0] : null);
    inp.click();
  });
}


/** Liste per Ziehen umsortieren (Maus und Touch). onDrop bekommt die neue Reihenfolge der data-sort-id. */
export function makeSortable(box, { item = '[data-sort-id]', handle = null, onDrop, signal } = {}) {
  let st = null;
  box.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    const it = e.target.closest(item);
    if (!it || !box.contains(it)) return;
    if (handle && !e.target.closest(handle)) return;
    if (!handle && e.target.closest('button, input, select, textarea, a')) return;
    st = { it, id: e.pointerId, y0: e.clientY, x0: e.clientX, moved: false, touch: e.pointerType !== 'mouse', active: false };
    if (st.touch && !handle) st.timer = setTimeout(() => { if (st && !st.moved) { st.active = true; it.classList.add('sorting'); } }, 320);
    else if (handle) st.active = true;
  });
  box.addEventListener('touchmove', e => { if (st && st.active) e.preventDefault(); }, { passive: false });
  const move = e => {
    if (!st || e.pointerId !== st.id) return;
    if (!st.moved && Math.hypot(e.clientX - st.x0, e.clientY - st.y0) > 5) {
      st.moved = true;
      if (!st.touch || handle) { st.active = true; st.it.classList.add('sorting'); }
      else if (!st.active) { clearTimeout(st.timer); st = null; return; }
    }
    if (!st.active) return;
    e.preventDefault();
    const els = [...box.querySelectorAll(item)].filter(x => x !== st.it);
    let before = null;
    for (const el of els) { const r = el.getBoundingClientRect(); const horiz = r.width < box.getBoundingClientRect().width * 0.6; if (horiz ? (e.clientY < r.bottom && e.clientX < r.left + r.width / 2) || e.clientY < r.top : e.clientY < r.top + r.height / 2) { before = el; break; } }
    if (before) { if (st.it.nextElementSibling !== before) before.parentNode.insertBefore(st.it, before); }
    else { const last = els[els.length - 1]; if (last && last.nextElementSibling !== st.it) last.parentNode.insertBefore(st.it, last.nextElementSibling); }
  };
  const up = e => {
    if (!st || e.pointerId !== st.id) return;
    const s0 = st; st = null; clearTimeout(s0.timer);
    s0.it.classList.remove('sorting');
    if (s0.active && s0.moved) {
      const kill = ev => { ev.stopPropagation(); ev.preventDefault(); };
      window.addEventListener('click', kill, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', kill, { capture: true }), 60);
      onDrop && onDrop([...box.querySelectorAll(item)].map(x => x.dataset.sortId));
    }
  };
  window.addEventListener('pointermove', move, { passive: false });
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
  const off = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
  if (signal) signal.addEventListener('abort', off);
  return off;
}
