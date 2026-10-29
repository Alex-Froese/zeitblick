// Aktionen & Tastenkürzel – eine Liste aller Befehle, frei belegbar (Einstellungen → Tastenkürzel)
import * as S from './store.js';
import { esc, icon, sheet, toast, topSheet } from './ui.js';
import { A } from './app-api.js';

/** Registrierte Aktionen: { id, name, group, keys (Standard), ctx, run, hint } */
export const ACTIONS = [];
const byId = new Map();
export function register(list) { for (const a of list) { if (byId.has(a.id)) { Object.assign(byId.get(a.id), a); continue; } ACTIONS.push(a); byId.set(a.id, a); } }
export function action(id) { return byId.get(id); }
export function run(id, ...args) { const a = byId.get(id); if (a) a.run(...args); }

export const GROUPS = ['Allgemein', 'Erstellen', 'Navigation', 'Kalender', 'Vorgänge', 'Im Vorgang'];

/** Aktuelle Belegung (eigene Belegung schlägt Standard; '' = keine) */
export function keyOf(id) {
  const own = (S.settings().keys || {})[id];
  if (own !== undefined) return own;
  const a = byId.get(id);
  return a ? (a.keys || '') : '';
}
export function setKey(id, combo) {
  const keys = { ...(S.settings().keys || {}) };
  const a = byId.get(id);
  if (a && (a.keys || '') === combo) delete keys[id]; else keys[id] = combo;
  S.setSettingPath('keys', keys);
}
export function resetKeys() { S.setSettingPath('keys', {}); }

/** Konflikte: andere Aktion im selben Kontext mit derselben Kombination */
export function conflictOf(id, combo) {
  if (!combo) return null;
  const a = byId.get(id);
  return ACTIONS.find(x => x.id !== id && keyOf(x.id) === combo && (x.ctx || '') === (a.ctx || '')) || null;
}

const KEYNAME = { ' ': 'Leertaste', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Escape: 'Esc', Enter: 'Enter', Backspace: '⌫', Delete: 'Entf', Tab: 'Tab' };
/** Tastendruck → Kombination wie „Strg+Umschalt+K“ */
export function comboOf(e) {
  const k = e.key;
  if (!k || ['Shift', 'Control', 'Alt', 'Meta', 'AltGraph', 'CapsLock', 'Dead'].includes(k)) return '';
  const parts = [];
  if (e.ctrlKey || e.metaKey) parts.push('Strg');
  if (e.altKey) parts.push('Alt');
  const isChar = k.length === 1;
  const letter = isChar && /[a-zäöüß0-9]/i.test(k);
  if (e.shiftKey && (!isChar || letter)) parts.push('Umschalt');
  let name = KEYNAME[k] || (isChar ? k.toLowerCase() : k);
  if (/^F\d+$/.test(k)) name = k;
  parts.push(name);
  return parts.join('+');
}
export function prettyCombo(combo) {
  if (!combo) return '';
  return combo.split(' ').map(ch => ch.split('+').map(p => `<span class="kbd">${esc(p.length === 1 ? p.toUpperCase() : p)}</span>`).join('<i class="kplus">+</i>')).join('<i class="kthen">dann</i>');
}

/* ---------------- Tastatur ---------------- */
let pending = '', pendingTimer = null;
function isTyping(e) {
  const t = e.target; const tag = (t.tagName || '').toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || t.isContentEditable;
}
/** Liefert die passende Aktion für eine Kombination im aktuellen Kontext */
function match(combo, ctx) {
  const cands = ACTIONS.filter(a => keyOf(a.id) === combo && (!a.when || a.when()));
  return cands.find(a => a.ctx && a.ctx === ctx) || cands.find(a => !a.ctx) || null;
}
export function handleKey(e, ctx) {
  const combo = comboOf(e);
  if (!combo) return false;
  const typing = isTyping(e);
  const sheetOpen = !!topSheet();
  // Im Textfeld nur Kombinationen mit Strg/Alt
  if (typing && !/^(Strg|Alt)\+/.test(combo)) return false;
  const effCtx = sheetOpen ? (topSheet().el.classList.contains('vorgang') ? 'vorgang' : 'sheet') : ctx;
  if (sheetOpen && !/^(Strg|Alt)\+/.test(combo)) return false;
  const full = pending ? pending + ' ' + combo : combo;
  let a = match(full, effCtx);
  if (!a && pending) { pending = ''; a = match(combo, effCtx); }
  if (a) { pending = ''; clearTimeout(pendingTimer); e.preventDefault(); a.run(e); return true; }
  // Anfang einer Tastenfolge (z. B. „g“ dann „h“)?
  if (!sheetOpen && !typing && ACTIONS.some(x => keyOf(x.id).startsWith(combo + ' '))) {
    pending = combo; clearTimeout(pendingTimer);
    pendingTimer = setTimeout(() => { pending = ''; }, 1400);
    e.preventDefault();
    return true;
  }
  return false;
}

/* ---------------- Übersicht aller Kürzel ---------------- */
export function openShortcuts() {
  sheet({
    title: 'Tastenkürzel', cls: 'sheet-keys',
    body: `<div class="search-box" style="margin-bottom:10px">${icon('search', 16)}<input data-ksq placeholder="Aktion oder Taste suchen …" autofocus aria-label="Kürzel suchen"></div>
      <div data-klist></div>
      <p class="hint" style="margin-top:12px">Folgen wie <span class="kbd">G</span><i class="kthen">dann</i><span class="kbd">H</span> nacheinander drücken. Alles ist änderbar unter <a href="#/einstellungen/tastenkuerzel" data-close>Einstellungen → Tastenkürzel</a>.</p>`,
    onMount: (el) => {
      const inp = el.querySelector('[data-ksq]'), box = el.querySelector('[data-klist]');
      const draw = () => {
        const q = inp.value.trim().toLowerCase();
        box.innerHTML = GROUPS.map(g => {
          const list = ACTIONS.filter(a => a.group === g && (!q || a.name.toLowerCase().includes(q) || keyOf(a.id).toLowerCase().includes(q)));
          if (!list.length) return '';
          return `<div class="section-t">${esc(g)}</div>${list.map(a => `<div class="krow"><span class="grow">${esc(a.name)}</span><span class="kcombo">${prettyCombo(keyOf(a.id)) || '<span class="faint small">–</span>'}</span></div>`).join('')}`;
        }).join('') || '<div class="muted small" style="padding:10px">Nichts gefunden.</div>';
      };
      inp.addEventListener('input', draw);
      draw();
    },
  });
}

/** Kombination aufnehmen (für Einstellungen) */
export function captureCombo() {
  return new Promise(resolve => {
    let done = false;
    let first = '';
    let t = null;
    const sh = sheet({
      title: 'Neue Tastenkombination', cls: 'sheet-sm',
      body: `<div class="capture-key" data-ck><span class="muted">Drücke jetzt die gewünschten Tasten …</span></div>
        <p class="hint" style="margin-top:10px">Einzelne Taste, Kombination (z. B. Strg+K) oder Folge aus zwei Tasten (z. B. G dann H). Esc bricht ab.</p>`,
      footer: `<button class="btn" data-none>Kürzel entfernen</button><span class="sp"></span><button class="btn" data-close>Abbrechen</button>`,
      onMount: (el, close) => {
        const box = el.querySelector('[data-ck]');
        const onKey = e => {
          if (e.key === 'Escape') return;
          const c = comboOf(e);
          if (!c) return;
          e.preventDefault(); e.stopPropagation();
          if (!first && !/\+/.test(c)) {
            first = c; box.innerHTML = prettyCombo(c) + '<span class="muted small" style="margin-left:8px">… zweite Taste für eine Folge, oder kurz warten</span>';
            t = setTimeout(() => { done = true; resolve(first); close(); }, 1100);
            return;
          }
          clearTimeout(t);
          const combo = first ? first + ' ' + c : c;
          box.innerHTML = prettyCombo(combo);
          done = true;
          setTimeout(() => { resolve(combo); close(); }, 250);
        };
        window.addEventListener('keydown', onKey, true);
        el._off = () => window.removeEventListener('keydown', onKey, true);
        el.querySelector('[data-none]').addEventListener('click', () => { done = true; resolve(''); close(); });
      },
      onClose: () => { clearTimeout(t); if (sh && sh.el._off) sh.el._off(); if (!done) resolve(null); },
    });
  });
}

export function toastKey(id) { const a = byId.get(id); if (a) toast(`${esc(a.name)}`, { ms: 1000 }); }
void A;
