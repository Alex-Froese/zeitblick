// Einstellungen: Einrichtung, Darstellung, Navigation, Heute, Tastenkürzel, Kategorien, Kalender & Vorlagen, Ampel, Erinnerungen, Benachrichtigungen, Rückblicke, Sync, Obsidian, Sicherung, Info & Bauplan
import * as C from '../core.js';
import * as S from '../store.js';
import * as SY from '../sync.js';
import * as N from '../notify.js';
import * as NT from '../ntfy.js';
import * as O from '../obsidian.js';
import { esc, icon, toast, confirmDialog, download, pickFile, copyText, sheet, promptDialog, makeSortable, debounce, isMobile } from '../ui.js';
import * as K from '../actions.js';
import * as BP from '../bauplan.js';
import { A } from '../app-api.js';
import { catColor, areaName } from './common.js';
import { editCategory as editCat, editLife } from '../entities.js';

const SECTIONS = [
  ['einrichtung', 'Einrichtung', 'bolt'],
  ['darstellung', 'Darstellung', 'sun'],
  ['navigation', 'Navigation', 'menu'],
  ['heute', 'Heute', 'home'],
  ['tastenkuerzel', 'Tastenkürzel', 'bolt'],
  ['kategorien', 'Kategorien', 'tag'],
  ['kalender', 'Kalender & Vorlagen', 'calendar'],
  ['vorgaenge', 'Vorgänge & Ampel', 'ampel'],
  ['erinnerungen', 'Erinnerungen', 'clock'],
  ['benachrichtigungen', 'Benachrichtigungen', 'bell'],
  ['rueckblicke', 'Rückblicke', 'book'],
  ['sync', 'Sync & Cloud', 'cloud'],
  ['obsidian', 'Obsidian', 'gem'],
  ['backup', 'Datensicherung', 'shield'],
  ['fokus', 'Fokus', 'focus'],
  ['leitsaetze', 'Leitsätze', 'notes'],
  ['info', 'Info & Bauplan', 'settings'],
];
const SEC_ALIAS = { ampel: 'vorgaenge', tasten: 'tastenkuerzel', keys: 'tastenkuerzel' };
const NOTIF_TYPES = [['task', 'Vorgänge', 'Fälligkeit und Erinnerungen'], ['esc', 'Eskalation', 'Überfällig, Rot und Alarm'], ['event', 'Termine', 'Erinnerungen vor Terminen'], ['multi', 'Mehrmals täglich', 'Jeder Durchgang'], ['habit', 'Gewohnheiten & Routinen', 'Zur eingestellten Uhrzeit'], ['note', 'Einprägen', 'Notizen lesen'], ['review', 'Rückblicke', 'Tag, Woche, Monat'], ['inbox', 'Inbox', 'Wenn Gedanken zu lange warten'], ['birthday', 'Beziehungen', 'Geburtstage und Kontakt-Rhythmus']];
const QUIET_PRESETS = [['Ausbildung', '06:40', '16:15', [0, 1, 2, 3, 4]], ['Abends zu zweit', '19:30', '21:00', [0, 1, 2, 3, 4, 5, 6]], ['Nacht', '22:30', '04:45', [0, 1, 2, 3, 4, 5, 6]]];

export let installPrompt = null;
export function setInstallPrompt(e) { installPrompt = e; }

function qrSvg(text) {
  try {
    const q = window.qrcode(0, 'M');
    q.addData(text);
    q.make();
    return q.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
  } catch { return '<div class="small muted">QR-Code nicht verfügbar</div>'; }
}

function sw(path, checked, label, hint = '') {
  return `<div class="optrow"><div class="grow"><b>${label}</b>${hint ? `<span>${hint}</span>` : ''}</div><label class="switch"><input type="checkbox" data-set="${path}" ${checked ? 'checked' : ''} aria-label="${esc(label)}"><span class="tr"></span></label></div>`;
}
function num(path, value, label, hint, min, max, step = 1, unit = '') {
  return `<div class="optrow"><div class="grow"><b>${label}</b>${hint ? `<span>${hint}</span>` : ''}</div><div class="row"><input class="input" type="number" data-setnum="${path}" value="${value}" min="${min}" max="${max}" step="${step}" style="width:90px" aria-label="${esc(label)}"><span class="small muted">${unit}</span></div></div>`;
}

function isStandalone() { return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true; }

function setupSection() {
  const s = S.settings();
  const synced = SY.configured();
  const ntfyOn = N.ntfyConfigured();
  const perm = typeof Notification !== 'undefined' ? Notification.permission : 'unsupported';
  const obs = O.ostate.status === 'ok';
  const card = (done, ic, title, text, action) => `<div class="setup-card ${done ? 'done' : ''}"><div class="st-ic">${icon(done ? 'check' : ic, 20)}</div><div class="grow"><b>${title}</b><p>${text}</p>${action}</div></div>`;
  return `<section class="card set-sec" id="set-einrichtung"><div class="card-head"><h2>Einrichtung</h2></div>
    <p class="small muted">In fünf Schritten läuft Zeitblick auf Handy und Laptop synchron, mit Push-Erinnerungen und automatischer Ablage in Obsidian.</p>
    ${card(isStandalone(), 'download', 'App installieren', isStandalone() ? 'Zeitblick läuft als installierte App.' : 'Installiere Zeitblick, damit es wie eine echte App startet. Am Handy: im Browser-Menü „Zum Startbildschirm hinzufügen“. Am Laptop: Installieren-Symbol in der Adressleiste.', installPrompt && !isStandalone() ? `<button class="btn sm btn-primary" data-act="install">${icon('download', 15)}Jetzt installieren</button>` : '')}
    ${card(synced, 'cloud', 'Sync zwischen allen Geräten', synced ? `Verbunden mit GitHub (${esc((S.local.gist || {}).login || '')}). Alle Änderungen landen automatisch in deinem privaten Cloud-Speicher mit Versionsverlauf.` : 'Verbinde einen kostenlosen GitHub-Account. Deine Daten liegen dann in einem privaten Speicher und sind auf allen Geräten gleich.', `<a class="btn sm ${synced ? '' : 'btn-primary'}" href="#/einstellungen/sync">${synced ? 'Verwalten' : 'Sync einrichten'}</a>`)}
    ${card(ntfyOn, 'phone', 'Push aufs Handy', ntfyOn ? `Aktiv über Kanal „${esc(s.ntfy.topic)}“. Erinnerungen bleiben, bis du sie wegwischst.` : 'Installiere die kostenlose App „ntfy“ und abonniere deinen persönlichen Kanal. Zeitblick plant alle Erinnerungen dort ein.', `<a class="btn sm ${ntfyOn ? '' : 'btn-primary'}" href="#/einstellungen/push">${ntfyOn ? 'Verwalten' : 'Push einrichten'}</a>`)}
    ${card(perm === 'granted' && S.local.sysNotif, 'laptop', 'Benachrichtigungen auf diesem Gerät', perm === 'granted' ? 'Erlaubt. Erinnerungen erscheinen als Systembenachrichtigung und bleiben stehen.' : perm === 'denied' ? 'Im Browser blockiert. Erlaube Benachrichtigungen über das Schloss-Symbol in der Adressleiste.' : 'Erlaube Benachrichtigungen, damit dich Zeitblick am Laptop erinnert.', perm !== 'granted' && perm !== 'denied' && perm !== 'unsupported' ? `<button class="btn sm btn-primary" data-act="perm">Erlauben</button>` : '')}
    ${card(false, 'clock', 'Erinnerungen auch bei ausgeschaltetem Gerät (optional)', 'Zeitblick plant Push-Nachrichten bis zu drei Tage im Voraus, sobald die App irgendwo geöffnet ist. Damit auch längere Pausen abgedeckt sind, kann stündlich ein kostenloser Helfer in deinem GitHub-Repository laufen. Anleitung: README, Abschnitt „Server-Erinnerungen“.', synced ? `<button class="btn sm" data-act="copygist">${icon('copy', 15)}Gist-ID kopieren</button>` : '')}
    ${card(obs, 'gem', 'Ablage in Obsidian', obs ? `Schreibt automatisch in „${esc(O.ostate.folder)}/Zeitblick“.` : O.supported ? 'Wähle deinen Obsidian-Vault. Zeitblick legt Vorgänge, Notizen, Termine, Ziele, Projekte, Personen und tägliche Backups als Markdown ab.' : 'Am Laptop in Chrome oder Edge verfügbar.', O.supported ? `<a class="btn sm ${obs ? '' : 'btn-primary'}" href="#/einstellungen/obsidian">${obs ? 'Verwalten' : 'Ordner wählen'}</a>` : '')}
  </section>`;
}


function uiSection(s) {
  const pctv = Math.round((Number(S.local.uiScale) || 0.86) * 100);
  const dens = S.local.density || 'normal';
  const mods = (A.modules || []);
  return `<section class="card set-sec" id="set-darstellung"><div class="card-head"><h2>Darstellung</h2></div>
    <div class="field"><label for="s-name">Dein Name für die Begrüßung</label><input id="s-name" class="input" data-settext="name" value="${esc(s.name)}" style="max-width:320px"></div>
    <div class="optrow"><div class="grow"><b>Oberflächengröße</b><span>Gilt auf diesem Gerät. Standard: Laptop 86 %, Handy 94 % (100 % = Größe von Version 2)</span></div><div class="row" style="gap:10px"><input type="range" min="70" max="110" step="2" value="${pctv}" data-uiscale aria-label="Oberflächengröße" style="width:11rem"><b class="num" data-uiscalev style="width:3.2rem;text-align:right">${pctv} %</b><button class="btn sm btn-ghost" data-act="uireset">Standard</button></div></div>
    <div class="optrow"><div class="grow"><b>Dichte</b><span>Wie viel Luft zwischen Karten und Zeilen ist</span></div><div class="seg sm" role="group" aria-label="Dichte">${[['luftig', 'Luftig'], ['normal', 'Normal'], ['kompakt', 'Kompakt']].map(([k, l]) => `<button data-density="${k}" aria-pressed="${dens === k}">${l}</button>`).join('')}</div></div>
    <div class="field"><label>Farbmodus</label>
      <div class="chips">${[['light', 'Hell', 'sun'], ['dark', 'Dunkel', 'moon'], ['night', 'Nacht (Rotlicht)', 'night'], ['auto', 'Wie System', 'auto']].map(([k, l, ic]) => `<button class="chip ${S.local.theme === k ? 'on' : ''}" data-theme-set="${k}">${icon(ic, 14)}${l}</button>`).join('')}</div>
      <span class="hint">Der Nachtmodus filtert Blaulicht weg und zeigt alles in warmem Rotlicht.</span></div>
    ${sw('local.nightAuto', S.local.nightAuto, 'Nachtmodus automatisch', 'Zwischen 21 und 6 Uhr auf diesem Gerät automatisch Rotlicht')}
    <div class="optrow"><div class="grow"><b>Startseite auf diesem Gerät</b><span>Was beim Öffnen erscheint. Handy und Laptop starten standardmäßig gleich mit „Heute“ – hier kannst du es pro Gerät umstellen.</span></div><select class="select" data-setlocal="startPage" style="width:auto">${mods.filter(m => m.id !== 'einstellungen').map(m => `<option value="${m.id}" ${(S.local.startPage || 'heute') === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></div>
    <div class="optrow"><div class="grow"><b>Bestätigung mit Countdown</b><span>Beim Erledigen, Verwerfen, Löschen und Schließen – auch in der Inbox. 0 = sofort bestätigbar</span></div><div class="row"><input class="input" type="number" data-setnum="confirmSec" value="${s.confirmSec ?? 3}" min="0" max="10" step="1" style="width:5rem" aria-label="Sekunden"><span class="small muted">Sek.</span></div></div>
  </section>`;
}

function navSection() {
  const n = S.settings().nav || {};
  const hidden = new Set(n.hidden || []);
  const order = n.order || [];
  const mods = [...(A.modules || [])].sort((a, b) => { const ia = order.indexOf(a.id), ib = order.indexOf(b.id); return (ia < 0 ? 100 + A.modules.indexOf(a) : ia) - (ib < 0 ? 100 + A.modules.indexOf(b) : ib); });
  const groups = A.navGroups || [];
  return `<section class="card set-sec" id="set-navigation"><div class="card-head"><h2>Navigation</h2><button class="btn sm btn-ghost" data-act="navreset">Standard</button></div>
    <p class="small muted">Ziehe Module in deine Reihenfolge und blende aus, was du nicht brauchst. Die ersten vier sichtbaren erscheinen am Handy unten in der Leiste, alle anderen unter „Mehr“. Ausgeblendete Module erreichst du weiter über die Suche (Strg+K).</p>
    <div class="nav-edit" data-navlist>${mods.map(m => `<div class="cust-i ${hidden.has(m.id) ? 'off' : ''}" data-sort-id="${m.id}"><span class="grip" data-grip>${icon('grip', 14)}</span>${icon(m.icon, 15)}<b class="grow">${esc(m.name)}</b><select class="select sm" data-navgroup="${m.id}" style="width:auto" aria-label="Gruppe">${groups.map(([g, l]) => `<option value="${g}" ${((n.groups || {})[m.id] || m.group) === g ? 'selected' : ''}>${esc(l || 'Hauptbereich')}</option>`).join('')}</select>${m.id === 'einstellungen' ? '<span class="tiny muted" style="width:2.6rem;text-align:center">immer</span>' : `<label class="switch sm"><input type="checkbox" data-navvis="${m.id}" ${hidden.has(m.id) ? '' : 'checked'}><span class="tr"></span></label>`}</div>`).join('')}</div>
  </section>`;
}

function heuteSection() {
  const h = S.settings().heute || {};
  const hidden = new Set(h.hidden || []);
  return `<section class="card set-sec" id="set-heute"><div class="card-head"><h2>Heute</h2><button class="btn sm btn-primary" data-act="heutecust">${icon('settings', 13)}Blöcke anpassen</button></div>
    <p class="small muted">„Heute“ zeigt alles Verbindliche des Tages – Vorgänge, Mehrmals-täglich, Routinen, Gewohnheiten, Einprägen und Rückblick – unabhängig von der Glocke. Ausgeblendet: ${hidden.size ? [...hidden].map(esc).join(', ') : 'nichts'}.</p>
  </section>`;
}

function keysSection(q) {
  const qq = (q || '').toLowerCase();
  const used = new Set(K.ACTIONS.map(a => K.keyOf(a.id)).filter(Boolean));
  const suggest = a => { if (K.keyOf(a.id)) return ''; const letters = 'abcdefghijklmnopqrstuvwxyz'; const first = (a.name.replace(/^(Neue?r?s?|Gehe zu|Kalender:|Vorgänge:)\s*/i, '')[0] || 'x').toLowerCase(); const cands = [`Alt+${first}`, ...letters.split('').map(l => `Alt+${l}`)]; return cands.find(c => !used.has(c)) || ''; };
  const custom = Object.keys(S.settings().keys || {}).length;
  return `<section class="card set-sec" id="set-tastenkuerzel"><div class="card-head"><h2>Tastenkürzel</h2>${custom ? `<button class="btn sm btn-ghost" data-act="keysreset">Alle zurücksetzen (${custom})</button>` : ''}</div>
    <p class="small muted">Jede Aktion ist frei belegbar: einzelne Taste, Kombination (Strg+K) oder Folge (G dann H). Konflikte werden angezeigt. <button class="link-btn" data-act="keyshelp">Übersicht öffnen (?)</button></p>
    <div class="search-box sm" style="margin:8px 0 6px">${icon('search', 14)}<input data-keyq value="${esc(q || '')}" placeholder="Aktion oder Taste suchen" aria-label="Kürzel suchen"></div>
    <div data-keylist>${K.GROUPS.map(g => { const list = K.ACTIONS.filter(a => a.group === g && (!qq || a.name.toLowerCase().includes(qq) || K.keyOf(a.id).toLowerCase().includes(qq))); if (!list.length) return ''; return `<div class="section-t">${esc(g)}</div>${list.map(a => { const k = K.keyOf(a.id); const own = (S.settings().keys || {})[a.id] !== undefined; const conf = K.conflictOf(a.id, k); const sg = suggest(a); return `<div class="krow ${conf ? 'conf' : ''}"><span class="grow">${esc(a.name)}${a.ctx ? ` <span class="tiny muted">· nur in ${esc(a.ctx === 'vorgang' ? 'Vorgang' : a.ctx === 'kalender' ? 'Kalender' : 'Vorgänge')}</span>` : ''}${conf ? ` <span class="tiny" style="color:var(--bad)">Konflikt mit „${esc(conf.name)}“</span>` : ''}</span><span class="kcombo">${K.prettyCombo(k) || '<span class="faint small">–</span>'}</span>${!k && sg ? `<button class="btn sm btn-ghost" data-keysug="${a.id}" data-combo="${esc(sg)}" title="Vorschlag übernehmen">${K.prettyCombo(sg)}</button>` : ''}<button class="btn sm" data-keyset="${a.id}">Ändern</button>${own ? `<button class="icon-btn sm" data-keydef="${a.id}" title="Standard wiederherstellen" aria-label="Standard">${icon('undo', 13)}</button>` : ''}</div>`; }).join('')}`; }).join('')}</div>
    <div class="section-t">Am Handy</div>
    <ul class="small" style="padding-left:18px;color:var(--ink-2);line-height:1.8;margin:0"><li><b>+ antippen</b>: Gedanke in die Inbox · <b>+ lange drücken</b>: Schnellmenü (Vorgang, Termin, Notiz, Journal …)</li><li><b>Kalender wischen</b>: links/rechts blättert Tage oder Wochen</li><li><b>Lange drücken und ziehen</b>: Termine verschieben, Vorgänge in Matrix und Kanban umsortieren</li><li><b>Unten „Mehr“</b>: alle weiteren Module; Reihenfolge unter Navigation</li></ul>
  </section>`;
}

function notifSection(s) {
  const n = s.notif || {};
  const types = n.types || {};
  const quiet = n.quiet || [];
  let prev = [];
  try { prev = C.buildReminders(S.getData(), new Date(), { appUrl: '', horizonH: 24, catchupMin: 0, max: 30 }); } catch { prev = []; }
  return `<section class="card set-sec" id="set-benachrichtigungen"><div class="card-head"><h2>Benachrichtigungen</h2></div>
    <p class="small muted">Lege fest, welche Arten dich erreichen und wann Ruhe ist. Während einer Ruhezeit werden normale Erinnerungen ans Ende verschoben; Alarm und Fokus kommen trotzdem.</p>
    <div class="ntypes">${NOTIF_TYPES.map(([k, l, h]) => `<label class="ntype ${types[k] === false ? 'off' : ''}"><span class="grow"><b>${esc(l)}</b><span>${esc(h)}</span></span><span class="switch sm"><input type="checkbox" data-ntype="${k}" ${types[k] === false ? '' : 'checked'}><span class="tr"></span></span></label>`).join('')}</div>
    <div class="section-t row"><span class="grow">Ruhezeiten</span>${QUIET_PRESETS.filter(([nm]) => !quiet.some(w => w.name === nm)).map(([nm]) => `<button class="btn sm btn-ghost" data-qpreset="${esc(nm)}">${icon('plus', 11)}${esc(nm)}</button>`).join('')}<button class="btn sm" data-qadd>${icon('plus', 12)}Eigene</button></div>
    ${quiet.map(w => `<div class="qrow ${w.on === false ? 'off' : ''}"><label class="switch sm"><input type="checkbox" data-qf="${w.id}:on" ${w.on === false ? '' : 'checked'}><span class="tr"></span></label><input class="input sm" data-qf="${w.id}:name" value="${esc(w.name || '')}" style="width:9rem" aria-label="Name"><input class="input sm" type="time" data-qf="${w.id}:from" value="${esc(w.from)}" aria-label="Von"><span class="muted">–</span><input class="input sm" type="time" data-qf="${w.id}:to" value="${esc(w.to)}" aria-label="Bis"><div class="wd-pick sm">${C.WD_SHORT.map((d, i) => `<button type="button" class="${(w.days || [0, 1, 2, 3, 4, 5, 6]).includes(i) ? 'on' : ''}" data-qday="${w.id}:${i}">${d[0]}</button>`).join('')}</div><button class="icon-btn sm" data-qdel="${w.id}" aria-label="Entfernen">${icon('trash', 13)}</button></div>`).join('') || '<p class="small muted">Keine Ruhezeiten.</p>'}
    <div class="section-t">Vorschau – die nächsten 24 Stunden</div>
    <div class="bell-tl">${prev.length ? prev.slice(0, 14).map(r => `<div class="btl"><span class="t num">${C.WD_SHORT[C.wdIdx(new Date(r.at))]} ${C.hm(new Date(r.at))}</span><span class="grow ellip">${esc(r.title)}</span>${r.quiet ? `<span class="tiny faint">verschoben (${esc(r.quiet)})</span>` : ''}</div>`).join('') : '<p class="small muted">In den nächsten 24 Stunden ist nichts geplant.</p>'}</div>
  </section>`;
}

function reviewSection(s) {
  const r = s.review || {};
  return `<section class="card set-sec" id="set-rueckblicke"><div class="card-head"><h2>Rückblicke</h2><a class="btn sm" href="#/rueckblick">Archiv</a></div>
    <p class="small muted">Geführt Schritt für Schritt. Erinnerung zur gewählten Zeit, bis der Rückblick erledigt ist.</p>
    <div class="optrow"><div class="grow"><b>Tagesabschluss</b><span>ca. 10 Minuten: Tag, Offenes, Journal, Morgen</span></div><input class="input" type="time" data-settext="review.dayTime" value="${esc(r.dayTime || '21:00')}" style="width:auto"><label class="switch"><input type="checkbox" data-set="review.dayOn" ${r.dayOn !== false ? 'checked' : ''}><span class="tr"></span></label></div>
    <div class="optrow"><div class="grow"><b>Wochenrückblick</b><span>Zahlen, Erfolge, Lebensbereiche bewerten, Ziele, nächste Woche planen</span></div><select class="select" data-setnumsel="review.weekDay" style="width:auto">${C.WD_LONG.map((d, i) => `<option value="${i}" ${Number(r.weekDay ?? 6) === i ? 'selected' : ''}>${d}</option>`).join('')}</select><input class="input" type="time" data-settext="review.weekTime" value="${esc(r.weekTime || '18:00')}" style="width:auto"><label class="switch"><input type="checkbox" data-set="review.weekOn" ${r.weekOn !== false ? 'checked' : ''}><span class="tr"></span></label></div>
    <div class="optrow"><div class="grow"><b>Monatsrückblick</b><span>Am letzten Tag des Monats: Trends, Bereiche, Ziele, Vorsätze</span></div><input class="input" type="time" data-settext="review.monthTime" value="${esc(r.monthTime || '18:00')}" style="width:auto"><label class="switch"><input type="checkbox" data-set="review.monthOn" ${r.monthOn !== false ? 'checked' : ''}><span class="tr"></span></label></div>
  </section>`;
}

function infoSection() {
  return `<section class="card set-sec" id="set-info"><div class="card-head"><h2>Info & Bauplan</h2></div>
    <p class="small">Version <b>${C.APP_VERSION}</b> · Datenstand ${C.DATA_VERSION} · Gerät <span class="code">${esc(S.local.deviceId)}</span></p>
    <div class="section-t">Bauplan</div>
    <div class="plan-list2">${BP.PLAN.map(p => `<div class="pl2 ${p.status === 'fertig' ? 'ok' : ''}"><span class="pill ${p.status === 'fertig' ? 'st-erledigt' : 'st-wartet'}">${p.status === 'fertig' ? '✓ fertig' : 'später'}</span><b>${esc(p.name)}</b><span class="small muted">${esc(p.text)}</span></div>`).join('')}</div>
    <div class="section-t">Versionsverlauf</div>
    ${BP.VERSIONS.map((v, i) => `<details class="ver" ${i === 0 ? 'open' : ''}><summary><b>${esc(v.v)}</b> · ${esc(v.title)} <span class="tiny muted">${esc(C.fmtDateShort(C.parseYmd(v.date)))} ${v.date.slice(0, 4)}</span></summary><ul>${v.items.map(x => `<li>${esc(x)}</li>`).join('')}</ul></details>`).join('')}
    <p class="small muted" style="margin-top:12px">Erklärungen und dein eigenes Regelwerk findest du in der <a href="#/anleitung">Anleitung</a>.</p>
    <div class="row wrap">${A.hasDemo && A.hasDemo() ? `<button class="btn sm" data-act="rmdemo">${icon('x', 15)}Beispieldaten entfernen</button>` : `<button class="btn sm" data-act="demo">${icon('layers', 15)}Beispieldaten anlegen</button>`}
    <button class="btn sm btn-ghost" data-act="wipe" style="color:var(--bad)">${icon('trash', 15)}Lokale Daten auf diesem Gerät löschen</button></div>
  </section>`;
}
let keyQ = '';

function catsSection() {
  const life = S.lifeAreas();
  const row = c => { const l = c.life && S.get('life', c.life); return `<div class="cat-row"><i class="catdot" style="background:${catColor(c)};width:10px;height:10px;border-radius:3px"></i><span class="grow">${esc(c.icon ? c.icon + ' ' : '')}${esc(c.name)}${l ? `<span class="small muted"> · ${esc(l.name)}</span>` : ''}</span><span class="code" style="font-size:11px">${esc(c.color || '')}</span>
    <button class="icon-btn sm" data-catedit="${c.id}" aria-label="Bearbeiten">${icon('edit', 15)}</button></div>`; };
  const areaCol = a => { const list = S.cats(a); return `<div><div class="lbl" style="margin-bottom:4px">${areaName(a)}</div>${list.map(row).join('') || '<p class="small muted">Noch keine Kategorien.</p>'}<button class="btn sm" data-catnew="${a}" style="margin-top:8px">${icon('plus', 14)}Kategorie</button></div>`; };
  return `<section class="card set-sec" id="set-kategorien"><div class="card-head"><h2>Kategorien & Lebensbereiche</h2></div>
    <p class="small muted">Kategorien legst du selbst an – mit eigener Farbe (auch als Hex-Code). Beim Anlegen bekommst du Vorschläge. Die Farbe nutzt der Kalender wie bei Google.</p>
    <div class="grid g2" style="gap:24px">${areaCol('p')}${areaCol('b')}</div>
    <hr class="sep">
    <div class="lbl" style="margin-bottom:4px">Lebensbereiche</div>
    <p class="small muted" style="margin-bottom:6px">Die großen Felder deines Lebens. Ordne Kategorien, Projekte, Ziele, Gewohnheiten und Notizen zu.</p>
    ${life.map(l => `<div class="cat-row"><span style="width:22px;text-align:center">${esc(l.icon || '•')}</span><span class="grow">${esc(l.name)}</span><button class="icon-btn sm" data-lifeedit="${l.id}" aria-label="Bearbeiten">${icon('edit', 15)}</button></div>`).join('') || ''}
    <button class="btn sm" data-lifenew style="margin-top:8px">${icon('plus', 14)}Lebensbereich</button>
  </section>`;
}

function calSection(s) {
  const c = s.cal || {};
  return `<section class="card set-sec" id="set-kalender"><div class="card-head"><h2>Kalender & Planung</h2></div>
    <div class="optrow"><div class="grow"><b>Farben ohne Kategorie</b><span>Für Termine, denen keine Kategorie zugeordnet ist</span></div><div class="row"><span class="small">Privat</span><input type="color" data-setcolor="cal.p" value="${esc(c.p || '#039be5')}" aria-label="Farbe Privat"><span class="small">Geschäftlich</span><input type="color" data-setcolor="cal.b" value="${esc(c.b || '#3f51b5')}" aria-label="Farbe Geschäftlich"></div></div>
    ${num('dayStart', s.dayStart ?? 7, 'Planungsfenster beginnt', 'Ab dieser Stunde sucht Zeitblick freie Zeit und scrollt der Kalender', 0, 14, 1, 'Uhr')}
    ${num('cal.dayEnd', c.dayEnd ?? 22, 'Planungsfenster endet', 'Danach plant Zeitblick nichts mehr ein', 12, 24, 1, 'Uhr')}
    ${num('cal.maxLoad', c.maxLoad ?? 80, 'Leerraum schützen ab', 'Ab dieser Auslastung wird der Tagesbalken gelb und du bekommst einen Hinweis', 40, 100, 5, '%')}
    ${num('cal.boxLen', c.boxLen ?? 30, 'Standarddauer für Zeitblöcke', 'Wenn ein Vorgang keine Dauer hat', 5, 240, 5, 'Min')}
    ${sw('cal.squeeze', c.squeeze !== false, 'Nacht stauchen', 'Stunden in der Nacht werden schmaler gezeigt – so passt der ganze Tag auf den Bildschirm')}
    <div class="optrow"><div class="grow"><b>Nacht</b><span>von – bis (volle Stunden)</span></div><div class="row"><input class="input" type="number" min="0" max="23" data-setnum="cal.nightFrom" value="${c.nightFrom ?? 22}" style="width:5rem"><span>–</span><input class="input" type="number" min="0" max="23" data-setnum="cal.nightTo" value="${c.nightTo ?? 5}" style="width:5rem"><span class="small muted">Uhr</span></div></div>
    <div class="optrow"><div class="grow"><b>Vorlagen, A/B-Wochen & Ferien</b><span>${S.templates().length} Vorlagen · A/B ${c.ab && c.ab.on ? 'an' : 'aus'} · ${(c.holidays || []).length} Ferienzeiträume</span></div><button class="btn sm btn-primary" data-act="tplopen">${icon('layers', 13)}Öffnen</button></div>
  </section>`;
}

export function render(route) {
  const s = S.settings();
  const g = S.local.gist;
  const st = SY.state;
  const ns = N.nstate;
  const perm = typeof Notification !== 'undefined' ? Notification.permission : 'unsupported';
  const topic = s.ntfy.topic;
  const server = NT.cleanServer(s.ntfy.server);
  const appUrl = N.appUrl();
  const sec = SEC_ALIAS[route.parts[0]] || route.parts[0] || 'einrichtung';
    const counts = S.countData(S.getData());
  const remChips = (path, sel, opts) => `<div class="rem-pick" data-rempath="${path}">${opts.map(([m, l]) => `<button type="button" class="chip ${sel.includes(m) ? 'on' : ''}" data-remv="${m}">${l}</button>`).join('')}</div>`;
  const TR = [[0, 'Bei Fälligkeit'], [15, '15 Min'], [60, '1 Std'], [180, '3 Std'], [1440, '1 Tag'], [2880, '2 Tage']];
  const ER = [[0, 'Zum Beginn'], [5, '5 Min'], [10, '10 Min'], [15, '15 Min'], [30, '30 Min'], [60, '1 Std'], [1440, '1 Tag']];

  return `<div class="page">
  <div class="page-head"><div class="grow"><h1>Einstellungen</h1><div class="psub">Alles, was Zeitblick an dich anpasst.</div></div></div>
  <div class="set-grid">
    <nav class="set-nav">${SECTIONS.map(([k, n, ic]) => `<a href="#/einstellungen/${k}" class="${k === sec ? 'on' : ''}">${icon(ic, 17)}${n}</a>`).join('')}</nav>
    <div>
      ${setupSection()}

      ${uiSection(s)}
      ${navSection()}
      ${heuteSection()}
      ${keysSection(keyQ)}
      ${catsSection()}
      ${calSection(s)}

      <section class="card set-sec" id="set-vorgaenge"><div class="card-head"><h2>Vorgänge & Ampel</h2></div>
        <p class="small muted">So wandern deine Vorgänge durch die Ampel: Grün → Gelb (Frist naht) → Rot (überfällig) → Alarm (lange überfällig). Ab Rot kommen wiederholte Push-Nachrichten mit höchster Priorität, beim Öffnen erscheint ein rotes Alarm-Fenster.</p>
        ${sw('amp.escOn', s.amp.escOn, 'Eskalation aktiv', 'Wiederholte Push-Erinnerungen und Alarm-Fenster für überfällige Vorgänge')}
        ${num('amp.yellowH', s.amp.yellowH, 'Gelb ab', 'Stunden vor Fälligkeit (P1 doppelt so früh, P4 halb so früh)', 1, 336, 1, 'Std')}
        ${num('amp.alarmH', s.amp.alarmH, 'Alarm nach', 'Stunden Überfälligkeit (P1 nach einem Viertel, P2 nach der Hälfte)', 1, 336, 1, 'Std')}
        ${num('amp.repeatH', s.amp.repeatH, 'Push wiederholen alle', 'Solange ein Vorgang überfällig ist', 0.5, 24, 0.5, 'Std')}
        ${num('amp.autoUrgH', s.amp.autoUrgH, 'Automatisch dringend', 'Wenn die Frist näher ist als', 1, 336, 1, 'Std')}
        ${sw('amp.quietOn', s.amp.quietOn, 'Ruhezeit für Eskalationen', 'Wiederholte Überfällig-Nachrichten pausieren nachts. Normale Erinnerungen kommen trotzdem.')}
        <div class="optrow"><div class="grow"><b>Ruhezeit</b><span>von – bis</span></div><div class="row"><input class="input" type="time" data-settext="amp.quietFrom" value="${esc(s.amp.quietFrom)}" style="width:auto"><span>–</span><input class="input" type="time" data-settext="amp.quietTo" value="${esc(s.amp.quietTo)}" style="width:auto"></div></div>
      </section>

      <section class="card set-sec" id="set-erinnerungen"><div class="card-head"><h2>Standard-Erinnerungen</h2></div>
        ${[1, 2, 3, 4].map(p => `<div class="field"><label>${C.PRIOS[p].short} ${C.PRIOS[p].name}</label>${remChips('rem.task.' + p, s.rem.task[p] || [], TR)}</div>`).join('')}
        <div class="field"><label>Termine</label>${remChips('rem.event', s.rem.event || [], ER)}</div>
        <div class="optrow"><div class="grow"><b>Ganztägige Termine</b><span>Erinnerung am Morgen um</span></div><input class="input" type="time" data-settext="rem.allDayAt" value="${esc(s.rem.allDayAt)}" style="width:auto"></div>
      </section>

      ${notifSection(s)}
      ${reviewSection(s)}
      <section class="card set-sec" id="set-push"><div class="card-head"><h2>Geräte & Handy-Push</h2></div>
        <h3 style="margin-bottom:8px">${icon('laptop', 16)} Dieses Gerät</h3>
        <div class="status-line ${perm === 'granted' ? 'ok' : perm === 'denied' ? 'err' : ''}">${perm === 'granted' ? '✓ Systembenachrichtigungen erlaubt' : perm === 'denied' ? 'Im Browser blockiert – über das Schloss-Symbol in der Adressleiste erlauben.' : perm === 'unsupported' ? 'Dieser Browser unterstützt keine Benachrichtigungen.' : 'Noch nicht erlaubt'}</div>
        ${sw('local.sysNotif', S.local.sysNotif, 'Erinnerungen als Systembenachrichtigung', 'Erscheinen groß, bleiben stehen, bis du sie wegklickst, und öffnen per Klick direkt die richtige Stelle')}
        ${sw('local.sound', S.local.sound, 'Ton bei Erinnerungen', 'Kurzer Signalton in der App')}
        <div class="row wrap" style="margin:8px 0 18px">${perm === 'default' ? `<button class="btn btn-primary sm" data-act="perm">Benachrichtigungen erlauben</button>` : ''}<button class="btn sm" data-act="testlocal">Test-Benachrichtigung</button></div>
        <hr class="sep">
        <h3 style="margin-bottom:8px">${icon('phone', 16)} Handy-Push über ntfy</h3>
        <p class="small muted">ntfy ist eine kostenlose Push-App (Android und iPhone). Zeitblick plant jede Erinnerung bis zu drei Tage im Voraus auf dem ntfy-Server ein – sie kommt also auch, wenn die App zu ist. Erledigst du etwas, verschwindet die Nachricht wieder vom Handy.</p>
        ${N.ntfyConfigured() ? `<div class="status-line ${ns.ntfy.status === 'error' ? 'err' : ns.ntfy.status === 'ok' ? 'ok' : ''}">${ns.ntfy.status === 'error' ? esc(ns.ntfy.error || 'Fehler') : ns.ntfy.last ? `✓ Abgeglichen ${esc(C.fmtRelTime(ns.ntfy.last))}, ${ns.ntfy.scheduled} Erinnerungen geplant` : 'Wird abgeglichen …'}</div>` : ''}
        ${sw('ntfy.on', s.ntfy.on, 'Handy-Push aktiv')}
        <div class="field" style="margin-top:10px"><label for="s-topic">Dein persönlicher Kanal</label><div class="row"><input id="s-topic" class="input" data-settext="ntfy.topic" value="${esc(topic)}" placeholder="wird erzeugt"><button class="btn sm" data-act="newtopic">Neu erzeugen</button></div><span class="hint">Der Kanalname ist wie ein Passwort: Wer ihn kennt, kann mitlesen. Er wird lang und zufällig erzeugt.</span></div>
        <div class="field"><label for="s-server">Server</label><input id="s-server" class="input" data-settext="ntfy.server" value="${esc(s.ntfy.server)}"></div>
        ${topic ? `<div class="row wrap" style="gap:18px;align-items:flex-start">
          <div class="qr-box" style="width:150px">${qrSvg(`${server}/${topic}`)}</div>
          <ol class="steps" style="flex:1;min-width:220px">
            <li>App „ntfy“ aus dem Play Store bzw. App Store installieren.</li>
            <li>In ntfy auf „+“ tippen und den Kanal <span class="code">${esc(topic)}</span> abonnieren (Server: ${esc(server.replace('https://', ''))}). Oder diesen QR-Code mit der Kamera scannen.</li>
            <li>In ntfy beim Kanal Benachrichtigungen auf „Max. Priorität: Dauerhaft alarmieren“ stellen, wenn Alarm-Tickets nicht zu überhören sein sollen.</li>
            <li><button class="btn sm" data-act="testntfy">Test-Push senden</button></li>
          </ol></div>` : ''}
        <div class="field" style="margin-top:6px"><label for="s-appurl">Adresse der App (für Deep Links)</label><input id="s-appurl" class="input" data-settext="appUrl" value="${esc(s.appUrl || '')}" placeholder="${esc(N.baseUrl())}"><span class="hint">Tippst du auf eine Benachrichtigung, öffnet sich diese Adresse direkt an der richtigen Stelle. Leer lassen = aktuelle Adresse (${esc(N.baseUrl())}).</span></div>
      </section>

      <section class="card set-sec" id="set-sync"><div class="card-head"><h2>Sync & Cloud-Speicher</h2></div>
        ${g ? `<div class="status-line ${st.status === 'error' ? 'err' : st.status === 'idle' ? 'ok' : ''}">${st.status === 'error' ? esc(st.error) : st.status === 'offline' ? 'Offline – Änderungen werden übertragen, sobald du wieder online bist.' : st.lastSync ? `✓ Synchronisiert ${esc(C.fmtRelTime(st.lastSync))} mit GitHub (${esc(g.login || '')})` : 'Verbinde …'}</div>
          <div class="row wrap"><button class="btn btn-primary sm" data-act="syncnow">${icon('sync', 15)}Jetzt synchronisieren</button><button class="btn sm" data-act="pair">${icon('qr', 15)}Weiteres Gerät verbinden</button><a class="btn sm" href="https://gist.github.com/${esc(g.login || '')}/${esc(g.id)}" target="_blank" rel="noopener">${icon('open', 15)}Speicher ansehen</a><button class="btn sm btn-ghost" data-act="unsync" style="color:var(--bad)">Trennen</button></div>
          <p class="small muted" style="margin-top:12px">Jede Änderung wird als neue Version gespeichert. Im Gist-Verlauf auf GitHub kannst du jeden früheren Stand wiederherstellen.</p>
          <div class="optrow"><div class="grow"><b>Gist-ID</b><span>Brauchst du für die Server-Erinnerungen (Secret ZB_GIST_ID)</span></div><span class="code">${esc(g.id)}</span><button class="icon-btn sm" data-act="copygist" aria-label="Gist-ID kopieren">${icon('copy', 15)}</button></div>`
    : `<p class="small muted">Zeitblick speichert alles zuerst lokal auf dem Gerät. Für den Abgleich zwischen Handy und Laptop nutzt es einen privaten „Gist“ in deinem kostenlosen GitHub-Account – mit Versionsverlauf als Cloud-Backup.</p>
          <ol class="steps">
            <li>Kostenlosen Account auf <a href="https://github.com/signup" target="_blank" rel="noopener">github.com</a> anlegen (falls noch keiner da ist).</li>
            <li><a href="https://github.com/settings/tokens/new?scopes=gist&description=Zeitblick" target="_blank" rel="noopener">Token erstellen</a>: Haken bei „gist“ ist schon gesetzt, Ablauf „No expiration“ wählen, unten „Generate token“.</li>
            <li>Token hier einfügen und verbinden. Auf dem zweiten Gerät denselben Token nutzen – oder einfach den QR-Code scannen.</li>
          </ol>
          <div class="row"><input class="input" data-token type="password" placeholder="ghp_… oder github_pat_…" autocomplete="off" aria-label="GitHub-Token"><button class="btn btn-primary" data-act="connect">Verbinden</button></div>
          ${st.error ? `<div class="status-line err" style="margin-top:10px">${esc(st.error)}</div>` : ''}`}
      </section>

      <section class="card set-sec" id="set-obsidian"><div class="card-head"><h2>Obsidian</h2></div>
        ${!O.supported ? '<div class="status-line">Direktes Schreiben in Ordner geht nur am Laptop in Chrome oder Edge. Auf dem Handy landen die Daten über den Sync trotzdem überall.</div>'
    : O.ostate.status === 'ok' ? `<div class="status-line ok">✓ Schreibt in „${esc(O.ostate.folder)}/Zeitblick“${O.ostate.last ? `, zuletzt ${esc(C.fmtRelTime(O.ostate.last))}` : ''}</div>`
      : O.ostate.status === 'needs-permission' ? `<div class="status-line">Der Browser fragt nach einem Neustart erneut nach Zugriff auf „${esc(O.ostate.folder)}“. <button class="btn sm btn-primary" data-act="obsregrant" style="margin-left:auto">Zugriff erlauben</button></div>`
        : O.ostate.status === 'error' ? `<div class="status-line err">${esc(O.ostate.error)}</div>` : ''}
        <p class="small muted">Wähle deinen Vault-Ordner. Zeitblick legt darin einen Ordner „Zeitblick“ an mit: Übersicht, einer Datei pro Vorgang (mit Eigenschaften für Dataview), deinen Notizen, Zielen, Projekten, Personen, Gewohnheiten, Kalender je Monat, Fokus-Log, Tagesnotizen, der kompletten Datendatei und täglichen Backups (30 Tage).</p>
        ${O.supported ? `<div class="row wrap"><button class="btn btn-primary sm" data-act="obschoose">${icon('folder', 15)}${O.ostate.folder ? 'Anderen Ordner wählen' : 'Vault-Ordner wählen'}</button>${O.ostate.status === 'ok' ? `<button class="btn sm" data-act="obsnow">Jetzt schreiben</button><button class="btn sm btn-ghost" data-act="obsoff">Trennen</button>` : ''}</div>` : ''}
        ${sw('local.obsidian.notes', S.local.obsidian.notes !== false, 'Eine Datei pro Vorgang', 'Mit YAML-Eigenschaften: ticket, typ, status, bereich, kategorie, prioritaet, quadrant, ampel, faellig, projekt …')}
        ${sw('local.obsidian.daily', S.local.obsidian.daily !== false, 'Tagesnotizen', 'Für die letzten 14 und nächsten 7 Tage')}
      </section>

      <section class="card set-sec" id="set-backup"><div class="card-head"><h2>Datensicherung</h2></div>
        <p class="small muted">Automatisch: jeden Tag ein Schnappschuss hier auf dem Gerät (21 Tage), mit Sync zusätzlich jede Änderung als Version in der Cloud, mit Obsidian täglich eine Sicherungsdatei im Vault.</p>
        <div class="row wrap" style="margin-bottom:12px">
          <button class="btn sm" data-act="export">${icon('download', 15)}Sicherung herunterladen</button>
          <button class="btn sm" data-act="import">${icon('upload', 15)}Sicherung einspielen</button>
          <button class="btn sm" data-act="snapnow">${icon('shield', 15)}Schnappschuss jetzt</button>
        </div>
        <div class="small muted" style="margin-bottom:6px">Aktuell: ${counts.tasks} Vorgänge, ${counts.events} Termine, ${counts.notes} Notizen, ${counts.habits} Gewohnheiten, ${counts.goals} Ziele, ${counts.projects} Projekte, ${counts.people} Personen, ${counts.focus} Fokus-Einheiten.</div>
        <div class="optrow"><div class="grow"><b>Kalender-Datei (.ics)</b><span>Einmalig Termine aus einer Datei übernehmen (z. B. aus einem alten Kalender) oder deine Termine exportieren. Es entsteht keine Verbindung.</span></div><div class="row wrap"><button class="btn sm" data-act="icsimport" data-area="p">${icon('upload', 14)}Nach Privat</button><button class="btn sm" data-act="icsimport" data-area="b">${icon('upload', 14)}Nach Geschäftlich</button><button class="btn sm" data-act="icsexport">${icon('download', 14)}Exportieren</button></div></div>
        <div data-snaps><div class="small muted">Lade Schnappschüsse …</div></div>
      </section>

      <section class="card set-sec" id="set-fokus"><div class="card-head"><h2>Fokus</h2></div>
        ${num('focus.len', s.focus.len, 'Standard-Fokuszeit', '', 5, 180, 5, 'Min')}
        ${num('focus.brk', s.focus.brk, 'Kurze Pause', '', 1, 60, 1, 'Min')}
        ${sw('focus.strict', s.focus.strict, 'Strenger Modus als Standard', 'Verlässt du die App länger als 12 Sekunden, zerbricht der Kristall')}
      </section>

      <section class="card set-sec" id="set-leitsaetze"><div class="card-head"><h2>Leitsätze</h2></div>
        <p class="small muted">Einer pro Zeile. Jeden Tag erscheint ein anderer in „Heute“.</p>
        <textarea class="textarea" data-leit rows="7">${esc(S.leitsaetze().join('\n'))}</textarea>
        <div class="row" style="margin-top:8px;justify-content:flex-end"><button class="btn sm btn-primary" data-act="saveleit">Speichern</button></div>
      </section>

      ${infoSection()}
    </div>
  </div></div>`;
}

async function renderSnaps(root) {
  const box = root.querySelector('[data-snaps]');
  if (!box) return;
  const list = await S.listSnapshots();
  box.innerHTML = list.length ? list.map(x => `<div class="snap"><span class="grow">${esc(C.fmtDateShort(C.parseYmd(x.key)))} ${C.parseYmd(x.key).getFullYear()}<span class="small muted">, ${x.counts.tasks} Vorgänge, ${x.counts.events} Termine, ${x.counts.notes || 0} Notizen</span></span><button class="btn sm" data-restore="${x.key}">Wiederherstellen</button></div>`).join('') : '<div class="small muted">Noch keine Schnappschüsse.</div>';
}

export function mount(root, ctx, route) {
  const sec = SEC_ALIAS[route.parts[0]] || route.parts[0];
  if (sec && !mount._noScroll) { const el = root.querySelector('#set-' + sec); if (el) requestAnimationFrame(() => el.scrollIntoView({ block: 'start' })); }
  mount._noScroll = false;
  const keep = () => { mount._noScroll = true; };
  const nl = root.querySelector('[data-navlist]');
  if (nl) makeSortable(nl, { handle: '[data-grip]', signal: ctx.signal, onDrop: ids => { keep(); S.setSettingPath('nav', { ...(S.settings().nav || {}), order: ids }); } });
  const us = root.querySelector('[data-uiscale]');
  if (us) {
    us.addEventListener('input', () => { S.local.uiScale = Number(us.value) / 100; A.applyUi(); const v = root.querySelector('[data-uiscalev]'); if (v) v.textContent = us.value + ' %'; }, { signal: ctx.signal });
    us.addEventListener('change', () => { S.saveLocal(); keep(); A.render(); }, { signal: ctx.signal });
  }
  const kq = root.querySelector('[data-keyq]');
  if (kq) kq.addEventListener('input', debounce(() => { keyQ = kq.value; const box = root.querySelector('[data-keylist]'); if (box) { const tmp = document.createElement('div'); tmp.innerHTML = keysSection(keyQ); box.innerHTML = tmp.querySelector('[data-keylist]').innerHTML; } }, 150), { signal: ctx.signal });
  renderSnaps(root);

  const setPath = (path, value) => {
    if (path.startsWith('local.')) {
      const parts = path.slice(6).split('.');
      let o = S.local; for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]];
      o[parts[parts.length - 1]] = value; S.saveLocal(); A.render();
    } else S.setSettingPath(path, value);
  };
  root.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.setlocal) { S.local[t.dataset.setlocal] = t.value; S.saveLocal(); toast('Gespeichert', { ms: 1200 }); return; }
    if (t.dataset.setnumsel) { keep(); S.setSettingPath(t.dataset.setnumsel, Number(t.value)); return; }
    if (t.dataset.navvis) { keep(); const n = S.settings().nav || {}; const h = new Set(n.hidden || []); if (t.checked) h.delete(t.dataset.navvis); else h.add(t.dataset.navvis); S.setSettingPath('nav', { ...n, hidden: [...h] }); return; }
    if (t.dataset.navgroup) { keep(); const n = S.settings().nav || {}; S.setSettingPath('nav', { ...n, groups: { ...(n.groups || {}), [t.dataset.navgroup]: t.value } }); return; }
    if (t.dataset.ntype) { keep(); const n = S.settings().notif || {}; S.setSettingPath('notif', { ...n, types: { ...(n.types || {}), [t.dataset.ntype]: t.checked } }); return; }
    if (t.dataset.qf) { keep(); const [id, f] = t.dataset.qf.split(':'); const n = S.settings().notif || {}; S.setSettingPath('notif', { ...n, quiet: (n.quiet || []).map(w => w.id === id ? { ...w, [f]: f === 'on' ? t.checked : t.value } : w) }); return; }
    if (t.dataset.set || t.dataset.setnum || t.dataset.settext || t.dataset.setcolor) keep();
    if (t.dataset.setcolor) { S.setSettingPath(t.dataset.setcolor, t.value); return; }
    if (t.dataset.set) setPath(t.dataset.set, t.checked);
    if (t.dataset.setnum) { const v = Number(t.value); if (!Number.isNaN(v)) setPath(t.dataset.setnum, v); }
    if (t.dataset.settext) {
      let v = t.value.trim();
      if (t.dataset.settext === 'ntfy.topic') v = v.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
      if (t.dataset.settext === 'appUrl' && v && !/^https?:\/\//.test(v)) { toast('Bitte eine vollständige Adresse mit https:// angeben', { kind: 'bad' }); return; }
      setPath(t.dataset.settext, v);
    }
    if (t.dataset.set === 'ntfy.on' && t.checked) {
      if (!S.settings().ntfy.topic) S.setSettingPath('ntfy.topic', NT.randomTopic());
      if (!S.settings().appUrl && location.protocol === 'https:') S.setSettingPath('appUrl', N.baseUrl());
    }
    if (t.dataset.set === 'local.sysNotif' && t.checked && typeof Notification !== 'undefined' && Notification.permission === 'default') N.requestPermission().then(() => A.render());
  });

  root.addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b) return;
    const a = b.dataset.act;
    if (b.dataset.themeSet) { keep(); S.local.theme = b.dataset.themeSet; S.saveLocal(); A.applyTheme(); A.render(); return; }
    if (b.dataset.density) { keep(); S.local.density = b.dataset.density; S.saveLocal(); A.render(); return; }
    if (a === 'uireset') { keep(); S.local.uiScale = isMobile() ? 0.94 : 0.86; S.saveLocal(); A.render(); return; }
    if (a === 'navreset') { keep(); S.setSettingPath('nav', { order: [], hidden: [], groups: {} }); return; }
    if (a === 'heutecust') { (await import('./heute.js')).openCustomize(); return; }
    if (a === 'tplopen') { (await import('./calendar.js')).openTemplates(); return; }
    if (a === 'keyshelp') { K.openShortcuts(); return; }
    if (a === 'keysreset') { if (await confirmDialog('Alle eigenen Tastenkürzel werden auf den Standard zurückgesetzt.', { ok: 'Zurücksetzen', title: 'Tastenkürzel zurücksetzen?', cooldown: 3 })) { keep(); K.resetKeys(); } return; }
    if (b.dataset.keydef) { keep(); const keys = { ...(S.settings().keys || {}) }; delete keys[b.dataset.keydef]; S.setSettingPath('keys', keys); return; }
    if (b.dataset.keysug) { keep(); K.setKey(b.dataset.keysug, b.dataset.combo); toast('Kürzel übernommen', { ms: 1200 }); return; }
    if (b.dataset.keyset) {
      const id = b.dataset.keyset;
      const combo = await K.captureCombo();
      if (combo === null) return;
      const conf = K.conflictOf(id, combo);
      if (conf && !(await confirmDialog(`${K.prettyCombo(combo)} ist schon „${esc(conf.name)}“ zugeordnet. Dort entfernen und hier verwenden?`, { ok: 'Übernehmen', title: 'Kürzel belegt' }))) return;
      if (conf) K.setKey(conf.id, '');
      keep(); K.setKey(id, combo);
      toast(combo ? 'Kürzel gespeichert' : 'Kürzel entfernt', { ms: 1400 });
      return;
    }
    if (b.dataset.qpreset) { keep(); const p0 = QUIET_PRESETS.find(x => x[0] === b.dataset.qpreset); const n = S.settings().notif || {}; S.setSettingPath('notif', { ...n, quiet: [...(n.quiet || []), { id: C.uid('q', 5), name: p0[0], from: p0[1], to: p0[2], days: p0[3], on: true }] }); return; }
    if (b.hasAttribute('data-qadd')) { keep(); const n = S.settings().notif || {}; S.setSettingPath('notif', { ...n, quiet: [...(n.quiet || []), { id: C.uid('q', 5), name: 'Ruhezeit', from: '12:00', to: '13:00', days: [0, 1, 2, 3, 4, 5, 6], on: true }] }); return; }
    if (b.dataset.qdel) { if (await confirmDialog('Diese Ruhezeit entfernen?', { ok: 'Entfernen', danger: true, title: 'Ruhezeit entfernen?', cooldown: 3 })) { keep(); const n = S.settings().notif || {}; S.setSettingPath('notif', { ...n, quiet: (n.quiet || []).filter(w => w.id !== b.dataset.qdel) }); } return; }
    if (b.dataset.qday) { keep(); const [id, i] = b.dataset.qday.split(':'); const n = S.settings().notif || {}; S.setSettingPath('notif', { ...n, quiet: (n.quiet || []).map(w => { if (w.id !== id) return w; const d = new Set(w.days || [0, 1, 2, 3, 4, 5, 6]); if (d.has(Number(i))) d.delete(Number(i)); else d.add(Number(i)); return { ...w, days: [...d].sort() }; }) }); return; }
    if (b.dataset.catnew) { await editCat(null, { area: b.dataset.catnew }); return; }
    if (b.dataset.catedit) { await editCat(S.cat(b.dataset.catedit)); return; }
    if (b.hasAttribute('data-lifenew')) { await editLife(null); return; }
    if (b.dataset.lifeedit) { await editLife(S.get('life', b.dataset.lifeedit)); return; }
    if (b.dataset.remv !== undefined) {
      b.classList.toggle('on');
      const box = b.closest('[data-rempath]');
      const vals = [...box.querySelectorAll('.on')].map(x => Number(x.dataset.remv));
      S.setSettingPath(box.dataset.rempath, vals);
      return;
    }
    if (b.dataset.restore) {
      if (await confirmDialog('Der aktuelle Stand wird durch den Schnappschuss ersetzt. Vorher wird automatisch ein Schnappschuss von heute angelegt.', { ok: 'Wiederherstellen', title: 'Schnappschuss wiederherstellen?' })) {
        await S.dailySnapshot(true);
        const d = await S.getSnapshot(b.dataset.restore);
        if (d) { restoreData(d); toast('Wiederhergestellt'); }
      }
      return;
    }
    if (a === 'install' && installPrompt) { installPrompt.prompt(); try { await installPrompt.userChoice; } catch { } installPrompt = null; A.render(); }
    if (a === 'perm') { await N.requestPermission(); A.render(); }
    if (a === 'testlocal') {
      if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') await N.requestPermission();
      const ok = await N.testSystem();
      toast(ok ? 'Test-Benachrichtigung gesendet' : 'Benachrichtigungen sind auf diesem Gerät nicht erlaubt', { kind: ok ? '' : 'bad' });
    }
    if (a === 'newtopic') { S.setSettingPath('ntfy.topic', NT.randomTopic()); toast('Neuer Kanal erzeugt – in der ntfy-App neu abonnieren'); }
    if (a === 'testntfy') {
      const s = S.settings();
      try { await NT.sendTest(s.ntfy.server, s.ntfy.topic, N.appUrl()); toast('Test-Push gesendet – schau aufs Handy'); }
      catch (err) { toast('Push fehlgeschlagen: ' + esc(err.message), { kind: 'bad', ms: 7000 }); }
    }
    if (a === 'connect') {
      const tok = root.querySelector('[data-token]').value;
      b.disabled = true; b.textContent = 'Verbinde …';
      try { await SY.connect(tok); toast('Sync verbunden'); }
      catch (err) { SY.state.error = err.message; toast(esc(err.message), { kind: 'bad', ms: 7000 }); }
      A.render();
    }
    if (a === 'syncnow') { await SY.syncNow({ force: true }); toast(SY.state.status === 'idle' ? 'Synchronisiert' : esc(SY.state.error || 'Sync fehlgeschlagen'), { kind: SY.state.status === 'idle' ? '' : 'bad' }); A.render(); }
    if (a === 'unsync') { if (await confirmDialog('Dieses Gerät synchronisiert dann nicht mehr. Die Daten bleiben lokal und im Cloud-Speicher erhalten.', { ok: 'Trennen', title: 'Sync trennen?' })) { SY.disconnect(); A.render(); } }
    if (a === 'pair') showPair();
    if (a === 'copygist') toast(await copyText((S.local.gist || {}).id || '') ? 'Gist-ID kopiert' : 'Kopieren nicht möglich');
    if (a === 'rmdemo') { const n = A.removeDemo(); toast(`${n} Beispiel-Einträge entfernt`); }
    if (a === 'demo') { A.seedDemo(); toast('Beispiele angelegt'); }
    if (a === 'obschoose') { try { await O.choose(); toast('Obsidian verbunden'); } catch (err) { if (err.name !== 'AbortError') toast(esc(err.message), { kind: 'bad' }); } A.render(); }
    if (a === 'obsregrant') { await O.regrant(); A.render(); }
    if (a === 'obsnow') { await O.exportAll(true); toast(O.ostate.status === 'ok' ? `In Obsidian geschrieben (${O.ostate.written} Dateien)` : esc(O.ostate.error || 'Fehler'), { kind: O.ostate.status === 'ok' ? '' : 'bad' }); A.render(); }
    if (a === 'obsoff') { await O.disconnect(); A.render(); }
    if (a === 'export') download(`zeitblick-sicherung-${C.ymd(new Date())}.json`, S.exportJson());
    if (a === 'import') {
      const f = await pickFile('.json,application/json'); if (!f) return;
      try {
        const d = S.parseImport(await f.text());
        const n = S.countData(d);
        const choice = await chooseImportMode(n);
        if (!choice) return;
        await S.dailySnapshot(true);
        if (choice === 'replace') restoreData(d);
        else { const { merged } = C.mergeData(S.getData(), d); restoreData(merged); }
        toast('Sicherung eingespielt');
      } catch (err) { toast('Datei konnte nicht gelesen werden: ' + esc(err.message), { kind: 'bad' }); }
    }
    if (a === 'snapnow') { await S.dailySnapshot(true); toast('Schnappschuss gespeichert'); renderSnaps(root); }
    if (a === 'icsimport') {
      const f = await pickFile('.ics,text/calendar'); if (!f) return;
      try {
        const list = C.parseICS(await f.text());
        const area = b.dataset.area;
        let n = 0;
        const existing = new Set(S.events().map(e => e.icsUid).filter(Boolean));
        for (const ev of list) {
          if (existing.has(ev.uid)) continue;
          S.put('events', { title: ev.title, notes: ev.notes, loc: ev.loc, allDay: ev.allDay, s: ev.s, e: ev.e, rec: ev.rec, exd: ev.exd, area, icsUid: ev.uid, rem: null }, { silent: true });
          n++;
        }
        S.touch({ local: true, col: 'events', many: true });
        toast(`${n} Termine nach ${areaName(area)} importiert`);
      } catch (err) { toast('Import fehlgeschlagen: ' + esc(err.message), { kind: 'bad' }); }
    }
    if (a === 'icsexport') download(`zeitblick-termine-${C.ymd(new Date())}.ics`, C.toICS(S.events(), 'Zeitblick'), 'text/calendar');
    if (a === 'saveleit') {
      const list = root.querySelector('[data-leit]').value.split('\n').map(x => x.trim()).filter(Boolean);
      S.put('meta', { id: 'leitsaetze', list: list.length ? list : C.DEFAULT_LEITSAETZE });
      toast('Leitsätze gespeichert');
    }
    if (a === 'wipe') {
      if (await confirmDialog('Alle Daten auf diesem Gerät werden entfernt. Was im Cloud-Speicher liegt, bleibt erhalten und kommt beim nächsten Sync zurück.', { ok: 'Löschen', danger: true, title: 'Lokale Daten löschen?' })) {
        const name = await promptDialog('Zur Bestätigung „LÖSCHEN“ eingeben', { title: 'Wirklich löschen?', ok: 'Endgültig löschen' });
        if (name && name.trim().toUpperCase() === 'LÖSCHEN') {
          try { indexedDB.deleteDatabase('zeitblick'); localStorage.clear(); } catch { }
          location.reload();
        }
      }
    }
  });
}

function restoreData(d) {
  // Wiederhergestellte Datensätze bekommen neue Zeitstempel, damit sie sich beim Sync durchsetzen
  const now = Date.now();
  const out = C.emptyData();
  for (const c of C.COLLECTIONS) {
    const cur = S.getData()[c] || {};
    const src = d[c] || {};
    for (const [id, rec] of Object.entries(src)) out[c][id] = { ...rec, updatedAt: now + 1 };
    for (const [id, rec] of Object.entries(cur)) if (!src[id] && !rec.deleted) out[c][id] = { id, deleted: true, updatedAt: now + 1 };
  }
  S.replaceAll(out, { local: true });
  S.touch({ local: true, restored: true });
}

function chooseImportMode(n) {
  return new Promise(resolve => {
    let r = null;
    sheet({
      title: 'Sicherung einspielen', cls: 'sheet-sm',
      body: `<p class="confirm-text">Die Datei enthält ${n.tasks} Vorgänge, ${n.events} Termine, ${n.notes || 0} Notizen und ${n.focus} Fokus-Einheiten.</p><p class="small muted">Zusammenführen behält beides (neuere Version gewinnt). Ersetzen stellt genau den Stand der Datei her.</p>`,
      footer: `<button class="btn" data-close>Abbrechen</button><button class="btn" data-m="merge">Zusammenführen</button><button class="btn btn-primary" data-m="replace">Ersetzen</button>`,
      onMount: (el, close) => el.addEventListener('click', e => { const b = e.target.closest('[data-m]'); if (b) { r = b.dataset.m; close(); } }),
      onClose: () => resolve(r),
    });
  });
}

function showPair() {
  const s = S.settings();
  const payload = SY.pairPayload({ n: s.ntfy.topic || undefined });
  const url = `${N.baseUrl()}#pair=${payload}`;
  sheet({
    title: 'Weiteres Gerät verbinden', cls: 'sheet-sm',
    body: `<p class="small muted">Scanne den Code mit der Kamera des Handys. Zeitblick öffnet sich und verbindet sich automatisch mit deinem Sync.</p>
      <div style="text-align:center;margin:12px 0"><div class="qr-box" style="width:230px">${qrSvg(url)}</div></div>
      <div class="banner warn small">${icon('alert', 16)}<span>Der Code enthält deinen Sync-Zugang. Zeige ihn niemandem und mache keinen Screenshot.</span></div>
      <button class="btn sm" data-copy style="width:100%">${icon('copy', 15)}Link kopieren</button>`,
    onMount: (el) => el.querySelector('[data-copy]').addEventListener('click', async () => { toast(await copyText(url) ? 'Link kopiert' : 'Kopieren nicht möglich'); }),
  });
}
