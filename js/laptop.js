// Zeitblick 4 – was nur am Laptop gilt: Statusdatei über den Kern, Nebenfenster (fenster.html), Rechtsklick
// „In neuem Fenster öffnen“, Willkommen am Laptop-Zuhause und der Umzugs-Hinweis unter der alten Adresse.
import * as C from './core.js';
import * as S from './store.js';
import * as SY from './sync.js';
import * as KR from './kern.js';
import * as E from './entwuerfe.js';
import * as U from './umzug.js';
import { esc, icon, toast, sheet, popover, closePopover } from './ui.js';
import { A } from './app-api.js';

/* ---------------- Statusdatei (Launcher-Kachel, Weitblick zahlen.md): nur Zahlen ---------------- */
let statusUhr = null, letzter = '';
export function statusBerechnen(now = new Date()) {
  const d = S.getData();
  const s = S.settings();
  const ag = C.agendaFor(d, now, now);
  const offen = S.openTasks();
  const ueber = offen.filter(t => t.due && t.due < C.ymd(now)).length;
  const rot = offen.filter(t => { const l = C.ampel(t, now, s).level; return l === 'red' || l === 'alarm'; }).length;
  const alarm = offen.filter(t => C.ampel(t, now, s).level === 'alarm').length;
  const k = ag.kinds || {};
  const zahl = (x, i) => (k[x] ? k[x][i] : 0);
  const details = {
    heuteErledigt: ag.done, heuteGesamt: ag.total,
    vorgaengeOffen: offen.length, ueberfaellig: ueber, rot,
    gewohnheitenErledigt: zahl('habit', 0), gewohnheitenGesamt: zahl('habit', 1),
    routinenErledigt: zahl('routine', 0), routinenGesamt: zahl('routine', 1),
    inbox: S.inboxItems().length, entwuerfe: E.alle({ zustand: 'offen' }).length,
  };
  return {
    text: ag.total ? `Heute: ${ag.done} von ${ag.total} erledigt` : 'Heute: nichts geplant',
    ampel: alarm ? 'rot' : (ueber || rot) ? 'gelb' : 'gruen',
    details,
  };
}
async function statusSenden() {
  if (!KR.aktiv) return;
  const st = statusBerechnen();
  const sig = JSON.stringify(st);
  if (sig === letzter) return;
  try { await KR.api('status', { method: 'PUT', body: st }); letzter = sig; } catch { /* nächster Versuch beim nächsten Mal */ }
}
export function statusBald(ms = 4000) { if (!KR.aktiv) return; clearTimeout(statusUhr); statusUhr = setTimeout(statusSenden, ms); }

/* ---------------- Rechtsklick „In neuem Fenster öffnen“ ---------------- */
function kontextmenue() {
  document.addEventListener('contextmenu', ev => {
    if (!(KR.aktiv || matchMedia('(pointer: fine)').matches)) return;
    const tk = ev.target.closest('[data-task]');
    if (!tk || ev.target.closest('input, textarea, select, .sheet')) return;
    ev.preventDefault();
    const id = tk.dataset.task;
    popover(tk, `<div class="menu"><button class="menu-i" data-km="auf">${icon('edit', 15)}Öffnen</button><button class="menu-i" data-km="fenster">${icon('open', 15)}In neuem Fenster öffnen</button></div>`, {
      width: 240, place: 'below',
      onMount: el => el.addEventListener('click', e => {
        const b = e.target.closest('[data-km]'); if (!b) return;
        closePopover();
        if (b.dataset.km === 'auf') A.openTask(id);
        else KR.fensterOeffnen('vorgang', id).catch(err => toast(esc(err.message), { kind: 'bad' }));
      }),
    });
  });
}

/* ---------------- Umzugs-Hinweis unter der alten Adresse ---------------- */
function umzugHinweis() {
  if (KR.aktiv || KR.fenster) return;
  const u = U.umgezogen();
  let html = '';
  if (u) html = `${icon('laptop', 16)}<span class="grow">Zeitblick wohnt am Laptop jetzt im eigenen Programm (umgezogen am ${esc(new Date(u.am).toLocaleDateString('de-DE'))}). Hier bleibt der alte Stand zum Nachsehen.</span><a class="btn sm btn-primary" href="${esc(u.ziel)}" target="_blank" rel="noopener">Zeitblick öffnen</a>`;
  else if (U.moeglich()) {
    let spaeter = 0; try { spaeter = Number(localStorage.getItem('zb.umzug.spaeter') || 0); } catch { }
    if (Date.now() < spaeter) return;
    html = `${icon('laptop', 16)}<span class="grow"><b>Zeitblick 4:</b> Am Laptop hat Zeitblick jetzt ein eigenes Programm. Zieh deine Daten mit einem Klick um – hier bleibt alles unverändert stehen.</span><button class="btn sm btn-primary" data-umzug="los">Daten umziehen</button><button class="btn sm btn-ghost" data-umzug="spaeter">Später</button>`;
  }
  if (!html) return;
  const el = document.createElement('div');
  el.className = 'umzug-band';
  el.innerHTML = html;
  document.body.appendChild(el);
  document.body.classList.add('mit-band');
  el.addEventListener('click', async e => {
    const b = e.target.closest('[data-umzug]'); if (!b) return;
    if (b.dataset.umzug === 'spaeter') { try { localStorage.setItem('zb.umzug.spaeter', String(Date.now() + 86400000)); } catch { } el.remove(); document.body.classList.remove('mit-band'); return; }
    b.disabled = true; b.textContent = 'Läuft …';
    try {
      const r = await U.starten();
      el.remove(); document.body.classList.remove('mit-band');
      umzugHinweis();
      toast(`Umgezogen: ${(r.anzahl && r.anzahl.tasks) || 0} Vorgänge und alles andere. Ab jetzt Zeitblick am Laptop öffnen.`, { ms: 9000 });
    } catch (err) { b.disabled = false; b.textContent = 'Daten umziehen'; toast(esc(err.message), { kind: 'bad', ms: 9000 }); }
  });
}
export const umzugStarten = () => U.starten();

/* ---------------- Willkommen am Laptop-Zuhause ---------------- */
export function willkommen() {
  if (!KR.aktiv || S.local.onboarded || S.tasks().length || S.events().length || S.inboxItems().length) return false;
  sheet({
    title: 'Zeitblick wohnt jetzt am Laptop', cls: 'sheet-sm',
    body: `<p class="confirm-text">Ab Zeitblick 4 hat die Lebenszentrale am Laptop ein eigenes Programm: Die Daten liegen als Dateien bei dir, werden automatisch gesichert und verschlüsselt mit dem Handy abgeglichen.</p>
      <ul class="small" style="padding-left:18px;color:var(--ink-2);line-height:1.8;margin:8px 0 12px"><li>Hast du Zeitblick schon unter <span class="code">alex-froese.github.io</span> benutzt? Öffne es dort einmal und klick auf <b>Daten umziehen</b>.</li><li>Öffnen: Symbol neben der Uhr, Taskleiste oder <b>Strg+Alt+Z</b>. Neuer Vorgang von überall: <b>Strg+Alt+G</b>.</li></ul>`,
    footer: `<button class="btn" data-w="leer">Leer starten</button><a class="btn btn-primary" href="https://alex-froese.github.io/zeitblick/" target="_blank" rel="noopener" data-w="alt">Alte Adresse öffnen</a>`,
    onMount: (el, close) => el.addEventListener('click', e => { const b = e.target.closest('[data-w]'); if (!b) return; S.local.onboarded = true; S.saveLocal(); close(); }),
    onClose: () => { S.local.onboarded = true; S.saveLocal(); },
  });
  return true;
}

/* ---------------- Start im Hauptfenster ---------------- */
export function starten() {
  kontextmenue();
  umzugHinweis();
  if (KR.aktiv) {
    S.subscribe(() => statusBald());
    SY.onState(st => { if (st.status === 'idle') statusBald(6000); });
    statusBald(2500);
    setInterval(() => statusBald(0), 10 * 60000);
    // Kein stilles Scheitern: Konnte der Kern ein Kürzel nicht anmelden (belegt), sagt es die App beim Öffnen.
    setTimeout(async () => {
      try {
        const z = (await KR.api('einstellungen')).zustand || {};
        const f = [z.kuerzelFehler, z.kuerzelVorgangFehler].filter(Boolean).join(' ');
        if (f) toast(esc(f), { kind: 'bad', ms: 12000, action: 'Ändern', onAction: () => A.nav('#/einstellungen/laptop') });
      } catch { /* Kern kurz weg */ }
    }, 1500);
    // Geht das Fenster in den Hintergrund, drosselt der Browser Zeitgeber: dann den Stand sofort schicken.
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { clearTimeout(statusUhr); statusSenden(); } });
  }
}

/* ---------------- Nebenfenster (fenster.html): ein Vorgang oder Entwurf, sonst nichts ---------------- */
export async function fensterStart(openVorgang) {
  const m = (location.hash || '').match(/^#\/(entwurf|vorgang)\/([A-Za-z0-9_-]+)/);
  document.getElementById('app').innerHTML = '<div class="fenster-flaeche"></div>';
  A.fensterZu = () => { setTimeout(() => { window.close(); setTimeout(() => { document.getElementById('app').innerHTML = `<div class="fenster-flaeche"><div class="empty"><b>Fertig</b><div class="small">Dieses Fenster kannst du schließen.</div></div></div>`; }, 300); }, 250); };
  if (!m) { A.fensterZu(); return; }
  if (m[1] === 'vorgang') {
    if (!S.task(m[2]) && SY.configured()) await SY.syncNow({ force: true });
    const t = S.task(m[2]);
    document.title = `${KR.praefix}${t ? `#${String(t.no || 0).padStart(4, '0')} ${t.title}` : 'Vorgang'} — Zeitblick`;
    if (!openVorgang(m[2])) A.fensterZu();
  } else {
    await E.vomKern();
    document.title = `${KR.praefix}${E.name(E.holen(m[2]) || {})} — Zeitblick`;
    openVorgang(null, { entwurf: m[2] });
    E.beobachten((art, id) => { if (id === m[2] && art === 'geaendert') document.title = `${KR.praefix}${E.name(E.holen(m[2]) || {})} — Zeitblick`; });
  }
}
