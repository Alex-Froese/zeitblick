// Zeitblick 4 – Entwurfs-Karten unten rechts (wie bei Gmail): Was noch nicht angelegt ist, wartet hier.
// Klick öffnet den Entwurf, ↗ öffnet ihn als eigenes kleines Fenster, ✕ verwirft (mit Countdown, 30 Tage zurückholbar).
// Am Handy: ein kleiner Knopf „✎ 2 Entwürfe“, der die Liste öffnet. Hinweise wandern nach oben, solange Karten da sind.
import * as E from './entwuerfe.js';
import * as KR from './kern.js';
import { esc, icon, sheet, confirmDialog, toast, isMobile } from './ui.js';
import { A } from './app-api.js';

let box = null;
let zu = false;   // am Laptop eingeklappt
const MAX = 4;

function zeit(ms) {
  const m = Math.round((Date.now() - (ms || 0)) / 60000);
  if (m < 1) return 'gerade eben';
  if (m < 60) return `vor ${m} Min.`;
  const h = Math.round(m / 60);
  if (h < 24) return `vor ${h} Std.`;
  return new Date(ms).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
}

function liste() { return E.alle({ zustand: 'offen' }).filter(e => !E.istHierOffen(e.id)); }

function karte(e) {
  return `<div class="dock-k" data-ent="${esc(e.id)}">
    <button class="dock-t" data-dock="auf" title="Weiter bearbeiten">${icon('edit', 14)}<span class="grow"><b>${esc(E.name(e))}</b><span class="tiny muted">Entwurf · ${esc(zeit(e.geaendert))}</span></span></button>
    <button class="icon-btn sm" data-dock="fenster" title="In eigenem Fenster öffnen" aria-label="In eigenem Fenster öffnen">${icon('open', 14)}</button>
    <button class="icon-btn sm" data-dock="weg" title="Entwurf verwerfen" aria-label="Entwurf verwerfen">${icon('x', 14)}</button>
  </div>`;
}

export function zeichnen() {
  if (!box) return;
  const l = liste();
  document.body.classList.toggle('mit-dock', l.length > 0);
  if (!l.length) { box.innerHTML = ''; box.hidden = true; return; }
  box.hidden = false;
  if (isMobile() || zu) {
    box.innerHTML = `<button class="dock-pille" data-dock="liste">${icon('edit', 14)}${l.length === 1 ? '1 Entwurf' : `${l.length} Entwürfe`}</button>`;
    return;
  }
  const mehr = l.length - MAX;
  box.innerHTML = `<div class="dock-kopf"><span class="tiny muted">${l.length === 1 ? 'Entwurf' : `${l.length} Entwürfe`}</span><button class="icon-btn sm" data-dock="einklappen" title="Einklappen" aria-label="Einklappen">${icon('down', 14)}</button></div>
    ${l.slice(0, MAX).map(karte).join('')}${mehr > 0 ? `<button class="dock-mehr" data-dock="liste">+ ${mehr} weitere</button>` : ''}`;
}

async function verwerfen(id) {
  const ok = await confirmDialog('Diesen Entwurf verwerfen? Unter Einstellungen → Entwürfe kannst du ihn 30 Tage lang zurückholen.', { ok: 'Verwerfen', title: 'Entwurf verwerfen?', cooldown: 3 });
  if (!ok) return;
  E.verwerfen(id);
  toast('Entwurf verworfen', { action: 'Rückgängig', onAction: () => { E.zurueckholen(id); zeichnen(); } });
  zeichnen();
}

function listeZeigen() {
  const l = liste();
  sheet({
    auswahl: true, title: 'Entwürfe', cls: 'sheet-sm',
    body: l.length ? `<div class="dock-liste">${l.map(karte).join('')}</div>` : '<p class="small muted">Keine offenen Entwürfe.</p>',
    onMount: (el, close) => el.addEventListener('click', ev => {
      const b = ev.target.closest('[data-dock]'); if (!b) return;
      const id = b.closest('[data-ent]') && b.closest('[data-ent]').dataset.ent;
      if (b.dataset.dock === 'auf') { close(); A.newTask({ entwurf: id }); }
      if (b.dataset.dock === 'fenster') { close(); KR.fensterOeffnen('entwurf', id); }
      if (b.dataset.dock === 'weg') { close(); verwerfen(id); }
    }),
  });
}

export function starten() {
  if (KR.fenster || box) return;
  box = document.createElement('div');
  box.className = 'dock';
  box.setAttribute('aria-label', 'Entwürfe');
  document.body.appendChild(box);
  box.addEventListener('click', ev => {
    const b = ev.target.closest('[data-dock]'); if (!b) return;
    const id = b.closest('[data-ent]') && b.closest('[data-ent]').dataset.ent;
    const w = b.dataset.dock;
    if (w === 'auf') A.newTask({ entwurf: id });
    else if (w === 'fenster') KR.fensterOeffnen('entwurf', id).catch(err => toast(esc(err.message), { kind: 'bad' }));
    else if (w === 'weg') verwerfen(id);
    else if (w === 'liste') { if (zu && !isMobile()) { zu = false; zeichnen(); } else listeZeigen(); }
    else if (w === 'einklappen') { zu = true; zeichnen(); }
  });
  E.beobachten(() => setTimeout(zeichnen, 30));
  window.addEventListener('resize', () => zeichnen());
  setInterval(zeichnen, 60000);
  zeichnen();
}
