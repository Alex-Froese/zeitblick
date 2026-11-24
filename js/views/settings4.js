// Zeitblick 4 – neue Abschnitte der Einstellungen: verschlüsselter Sync, Laptop & Kern, Beispieldaten, Entwürfe,
// Speicherorte. Dazu der Baustein „wie global | eigener Wert“ für Einstellungen je Element.
import * as C from '../core.js';
import * as S from '../store.js';
import * as SY from '../sync.js';
import * as KR from '../kern.js';
import * as E from '../entwuerfe.js';
import * as O from '../obsidian.js';
import * as U from '../umzug.js';
import { esc, icon, toast, confirmDialog, sheet, copyText } from '../ui.js';
import { A } from '../app-api.js';

const SAMMLUNG_NAME = { tasks: 'Vorgänge', events: 'Termine', focus: 'Fokus', cats: 'Kategorien', life: 'Lebensbereiche', goals: 'Ziele', projects: 'Projekte', people: 'Personen', habits: 'Gewohnheiten & Routinen', notes: 'Notizen', inbox: 'Inbox', reviews: 'Rückblicke', templates: 'Kalender-Vorlagen' };

function qrSvg(text) {
  try { const q = window.qrcode(0, 'L'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 4, margin: 0, scalable: true }); }
  catch { return '<div class="small muted">QR-Code nicht verfügbar</div>'; }
}
const rel = iso => { if (!iso) return 'noch nie'; return C.fmtRelTime(new Date(iso).getTime()); };

/* ---------------- Sync ---------------- */
export function syncSection() {
  const st = SY.state;
  if (KR.aktiv) {
    const g = st.gist || {};
    const ok = g.verbunden && g.status !== 'fehler';
    return `<section class="card set-sec" id="set-sync"><div class="card-head"><h2>Sync & Cloud-Speicher</h2><span class="pill st-erledigt" title="AES-256 + HMAC-SHA256">${icon('shield', 12)} verschlüsselt</span></div>
      <p class="small muted">Am Laptop ist der <b>Zeitblick-Kern</b> das Zuhause deiner Daten (Dateien in deinem Benutzerordner, automatisch gesichert). Er gleicht <b>verschlüsselt</b> mit einem privaten GitHub-Gist ab, auch wenn kein Fenster offen ist. Den Schlüssel haben nur deine Geräte. Kundenblick spricht direkt mit dem Kern.</p>
      ${g.verbunden ? `<div class="status-line ${g.status === 'fehler' ? 'err' : ok ? 'ok' : ''}">${g.status === 'fehler' ? esc(g.fehler) : g.status === 'offline' ? 'Offline – der Kern überträgt, sobald wieder Netz da ist.' : `✓ Verschlüsselt abgeglichen ${esc(rel(g.letzter))} (${esc(g.login || '')}, Speicher ${esc(g.gist || '')})`}</div>
        <div class="row wrap"><button class="btn btn-primary sm" data-a4="jetzt">${icon('sync', 15)}Jetzt abgleichen</button><button class="btn sm" data-a4="koppeln">${icon('qr', 15)}Handy verbinden</button><button class="btn sm" data-a4="schluessel">${icon('shield', 15)}Wiederherstellungs-Schlüssel</button><button class="btn sm btn-ghost" data-a4="trennen" style="color:var(--bad)">Trennen</button></div>
        <p class="small muted" style="margin-top:10px">Der alte Zeitblick-3-Speicher (unverschlüsselt) wird nicht mehr benutzt und bleibt unverändert. Löschen kannst du ihn später selbst auf github.com, wenn alles läuft.</p>`
      : `<ol class="steps">
          <li><a href="https://github.com/settings/tokens/new?scopes=gist&description=Zeitblick%204" target="_blank" rel="noopener">Token erstellen</a>: Haken bei „gist“, Ablauf „No expiration“, unten „Generate token“. Den alten Token aus Zeitblick 3 kannst du auch nehmen.</li>
          <li>Token hier einfügen. Zeitblick legt einen <b>neuen, verschlüsselten</b> Speicher an und zeigt dir einmal den Wiederherstellungs-Schlüssel zum Aufschreiben.</li>
        </ol>
        <div class="field"><label>GitHub-Token</label><input class="input" data-s4="token" type="password" placeholder="ghp_… oder github_pat_…" autocomplete="off"></div>
        <div class="field"><label>Wiederherstellungs-Schlüssel <span class="faint">(nur wenn es schon einen Zeitblick-4-Speicher gibt)</span></label><input class="input mono" data-s4="key" placeholder="ABCD-EFGH-…" autocomplete="off" spellcheck="false"></div>
        <button class="btn btn-primary" data-a4="verbinden">Verbinden</button>
        ${g.fehler ? `<div class="status-line err" style="margin-top:10px">${esc(g.fehler)}</div>` : ''}`}
      <div class="optrow" style="margin-top:12px"><div class="grow"><b>Daten von der alten Adresse</b><span>Hast du Zeitblick unter alex-froese.github.io benutzt: dort Einstellungen → Sync → „Daten umziehen“. Hier wird vorher gesichert, dort bleibt alles stehen.</span></div><a class="btn sm" href="https://alex-froese.github.io/zeitblick/#/einstellungen/sync" target="_blank" rel="noopener">${icon('open', 14)}Alte Adresse</a></div>
    </section>`;
  }
  const g = S.local.gist && S.local.gist.v === 4 ? S.local.gist : null;
  const umzug = U.moeglich() || U.umgezogen();
  return `<section class="card set-sec" id="set-sync"><div class="card-head"><h2>Sync & Cloud-Speicher</h2><span class="pill st-erledigt">${icon('shield', 12)} verschlüsselt</span></div>
    ${SY.altEingetragen() ? `<div class="status-line" style="margin-bottom:10px">Der alte, unverschlüsselte Sync aus Zeitblick 3 ist beendet. Verbinde dieses Gerät neu (QR-Code vom Laptop). Der alte Speicher bleibt unverändert.</div>` : ''}
    ${g ? `<div class="status-line ${st.status === 'error' ? 'err' : st.status === 'idle' ? 'ok' : ''}">${st.status === 'error' ? esc(st.error) : st.status === 'offline' ? 'Offline – Änderungen werden übertragen, sobald du wieder online bist.' : st.lastSync ? `✓ Verschlüsselt synchronisiert ${esc(C.fmtRelTime(st.lastSync))} (${esc(g.login || '')})` : 'Verbinde …'}</div>
        <div class="row wrap"><button class="btn btn-primary sm" data-a4="jetzt">${icon('sync', 15)}Jetzt synchronisieren</button><button class="btn sm" data-a4="schluessel">${icon('shield', 15)}Wiederherstellungs-Schlüssel</button><button class="btn sm btn-ghost" data-a4="trennen" style="color:var(--bad)">Trennen</button></div>`
    : `<p class="small muted">Am Handy verbindest du am einfachsten mit dem <b>QR-Code vom Laptop</b> (Zeitblick am Laptop → Einstellungen → Sync → „Handy verbinden“). Darin stecken Zugang und Schlüssel, getippt werden muss nichts.</p>
        <details class="small"><summary>Von Hand verbinden</summary>
          <div class="field" style="margin-top:8px"><label>GitHub-Token</label><input class="input" data-s4="token" type="password" placeholder="ghp_… oder github_pat_…" autocomplete="off"></div>
          <div class="field"><label>Wiederherstellungs-Schlüssel</label><input class="input mono" data-s4="key" placeholder="ABCD-EFGH-…" autocomplete="off" spellcheck="false"></div>
          <button class="btn btn-primary sm" data-a4="verbinden">Verbinden</button>
        </details>
        ${st.error ? `<div class="status-line err" style="margin-top:10px">${esc(st.error)}</div>` : ''}`}
    ${umzug ? `<div class="optrow" style="margin-top:12px"><div class="grow"><b>Zum Laptop-Programm umziehen</b><span>${U.umgezogen() ? `Umgezogen am ${esc(new Date(U.umgezogen().am).toLocaleDateString('de-DE'))}. Hier bleibt der alte Stand unverändert zum Nachsehen.` : 'Am Laptop wohnt Zeitblick jetzt im eigenen Programm. Ein Klick übergibt alle Daten, hier bleibt alles stehen (Rückweg).'}</span></div><button class="btn sm ${U.umgezogen() ? '' : 'btn-primary'}" data-a4="umzug">${icon('upload', 14)}${U.umgezogen() ? 'Nochmal übergeben' : 'Daten umziehen'}</button></div>` : ''}
  </section>`;
}

/* ---------------- Laptop & Kern ---------------- */
export function laptopSection() {
  if (!KR.aktiv) return '';
  return `<section class="card set-sec" id="set-laptop"><div class="card-head"><h2>Laptop & Kern</h2></div>
    <div data-s4box="laptop"><div class="small muted">Lädt …</div></div>
  </section>`;
}

function laptopHtml(e, info) {
  const z = e.zustand || {};
  const kz = (art, wert, fehler, std) => `<div class="optrow"><div class="grow"><b>${art}</b><span>${fehler ? `<span style="color:var(--bad)">${esc(fehler)}</span>` : `Von überall in Windows. Standard ${std}, „aus“ schaltet ab.`}</span></div><input class="input" data-s4k="${art === 'Zeitblick zeigen' ? 'kuerzel' : 'kuerzelVorgang'}" value="${esc(wert || '')}" placeholder="${std}" style="width:9.5rem"><button class="btn sm" data-a4="kuerzel">Übernehmen</button></div>`;
  const sw = (k, an, titel, hint) => `<div class="optrow"><div class="grow"><b>${titel}</b><span>${hint}</span></div><label class="switch"><input type="checkbox" data-s4set="${k}" ${an ? 'checked' : ''}><span class="tr"></span></label></div>`;
  return `${kz('Zeitblick zeigen', z.kuerzel, z.kuerzelFehler, 'Strg+Alt+Z')}
    ${kz('Neuer Vorgang', z.kuerzelVorgang, z.kuerzelVorgangFehler, 'Strg+Alt+A')}
    ${z.test ? '<div class="status-line">Testinstanz: kein Autostart, Spiegel und Statusdatei nur im Testordner.</div>' : sw('autostart', e.autostart !== false, 'Mit Windows starten', z.autostartAktiv ? 'Startet still im Infobereich (neben der Uhr).' : 'Aus: Zeitblick startet erst, wenn du es öffnest.')}
    ${sw('spiegel', e.spiegel !== false, 'Markdown-Spiegel im Vault', `Reiner Inhalt als Markdown nach <span class="code">${esc(info.spiegel || '')}</span>, damit Klarblick ihn findet.`)}
    ${sw('status', e.status !== false, 'Statusdatei für Launcher und Weitblick', `Nur Zahlen („Heute: 3 von 8 erledigt“) nach <span class="code">${esc(info.statusdatei || '')}</span>.`)}
    ${z.vaultDa === false ? `<div class="status-line err">Der Vault-Ordner fehlt: ${esc(e.vault)}</div>` : ''}
    <div class="section-t">Taskleiste</div>
    <p class="small muted">Eigenes Symbol „Zeitblick“, einzeln anheftbar. Rechtsklick darauf: <b>Neues Fenster</b> und <b>Neuer Vorgang</b>. Rechtsklick auf einen Vorgang: <b>In neuem Fenster öffnen</b>.${z.sprungliste ? ` <span style="color:var(--bad)">${esc(z.sprungliste)}</span>` : ''}</p>
    <div class="row wrap"><button class="btn sm" data-a4="neuesfenster">${icon('open', 14)}Neues Fenster</button><button class="btn sm" data-a4="neuervorgang">${icon('plus', 14)}Neuer Vorgang im eigenen Fenster</button></div>`;
}

/* ---------------- Beispieldaten ---------------- */
function beispiele() {
  const d = S.getData();
  const out = [];
  for (const c of C.BEISPIEL_SAMMLUNGEN) for (const x of Object.values(d[c] || {})) if (C.istBeispiel(x)) out.push({ c, x });
  return out;
}
export function beispielSection() {
  const l = beispiele();
  const nach = {};
  for (const b of l) (nach[b.c] = nach[b.c] || []).push(b);
  return `<section class="card set-sec" id="set-beispiele"><div class="card-head"><h2>Beispieldaten</h2>${l.length ? `<div class="row"><button class="btn sm" data-a4="bsp-alle-ok">Alle übernehmen</button><button class="btn sm btn-ghost" data-a4="bsp-alle-weg" style="color:var(--bad)">Alle löschen</button></div>` : ''}</div>
    <p class="small muted">Was Zeitblick als Vorschlag vorbelegt, trägt das Abzeichen <span class="pill bsp">Beispiel</span>. <b>Übernehmen</b> macht es zu deinem (Abzeichen weg), <b>Löschen</b> entfernt es (im Papierkorb zurückholbar).</p>
    ${l.length ? Object.entries(nach).map(([c, xs]) => `<div class="section-t">${esc(SAMMLUNG_NAME[c] || c)} <span class="faint">${xs.length}</span></div>
      ${xs.map(({ x }) => `<div class="optrow bsp-zeile"><div class="grow"><b>${esc(C.titleOf(c, x) || x.name || x.title || x.id)}</b></div><button class="btn sm" data-a4="bsp-ok" data-c="${c}" data-id="${esc(x.id)}">Übernehmen</button><button class="btn sm btn-ghost" data-a4="bsp-weg" data-c="${c}" data-id="${esc(x.id)}">Löschen</button></div>`).join('')}`).join('')
    : '<div class="status-line ok">Keine Beispieldaten mehr – alles gehört dir.</div>'}
  </section>`;
}

function uebernehmen(c, id) {
  const x = S.get(c, id); if (!x) return;
  const n = { ...x, beispiel: false }; delete n.demo; delete n.example;
  S.put(c, n, { silent: true });
}

/* ---------------- Entwürfe ---------------- */
export function entwuerfeSection() {
  const offen = E.alle({ zustand: 'offen' }), weg = E.alle({ zustand: 'verworfen' });
  const zeile = (e, knopf) => `<div class="optrow"><div class="grow"><b>${esc(E.name(e))}</b><span>${esc(new Date(e.geaendert || e.erstellt || Date.now()).toLocaleString('de-DE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}${e.text ? ' · ' + esc(String(e.text).slice(0, 60)) : ''}</span></div>${knopf}</div>`;
  return `<section class="card set-sec" id="set-entwuerfe"><div class="card-head"><h2>Entwürfe</h2></div>
    <p class="small muted">Neue Vorgänge sind ab dem ersten Buchstaben gesichert (im Gerät${KR.aktiv ? ' und im Kern, mit früheren Fassungen' : ''}). Fenster schließen nur über ✕ oder Esc. Verworfene Entwürfe bleiben 30 Tage hier.</p>
    <div class="section-t">Offen <span class="faint">${offen.length}</span></div>
    ${offen.length ? offen.map(e => zeile(e, `<button class="btn sm" data-a4="ent-auf" data-id="${esc(e.id)}">Öffnen</button>`)).join('') : '<div class="small muted">Keine offenen Entwürfe.</div>'}
    <div class="section-t">Verworfen <span class="faint">${weg.length}</span></div>
    ${weg.length ? weg.map(e => zeile(e, `<button class="btn sm" data-a4="ent-zurueck" data-id="${esc(e.id)}">Zurückholen</button>`)).join('') : '<div class="small muted">Nichts verworfen.</div>'}
  </section>`;
}

/* ---------------- Speicherorte (Info) ---------------- */
export function speicherorteHtml() {
  return `<div class="section-t">Speicherorte</div><div data-s4box="orte" class="small">${KR.aktiv ? '<span class="muted">Lädt …</span>' : `Daten: im Speicher dieses Browsers (IndexedDB) · Sync: verschlüsselter GitHub-Gist${S.local.gist && S.local.gist.v === 4 ? '' : ' (nicht verbunden)'} · Rückweg: „Stand vor Version 4“ unter Datensicherung`}</div>`;
}
function orteHtml(i) {
  const z = (k, v) => `<div class="optrow"><div class="grow"><b>${k}</b><span class="code">${esc(v || '–')}</span></div></div>`;
  return z('Daten (Kern)', i.daten) + z('Sicherungen', `${i.sicherungen} · ${i.sicherungenAnzahl} vorhanden`) + z('Markdown-Spiegel', i.spiegel) + z('Statusdatei', i.statusdatei) + z('Programm', i.programm) + z('Kern', `127.0.0.1:${i.port} · Ausweis ${i.appId}${i.test ? ' · Testinstanz' : ''}`)
    + `<div class="row wrap" style="margin-top:8px"><button class="btn sm" data-a4="sichern">${icon('shield', 14)}Jetzt sichern</button></div>`;
}

/* ---------------- Einstellung je Element: „wie global“ oder eigener Wert ---------------- */
/** Auswahl für Ja/Nein-Einstellungen: wie global (mit dem globalen Wert) · an · aus. el.einst[pfad] bleibt leer = wie global. */
export function einstFeld(el, pfad, titel, hinweis = '') {
  const eigen = el && el.einst && Object.prototype.hasOwnProperty.call(el.einst, pfad) ? el.einst[pfad] : null;
  const glob = C.getPath(S.settings(), pfad);
  const v = eigen === null || eigen === undefined ? 'global' : eigen ? 'an' : 'aus';
  return `<div class="optrow einst-feld"><div class="grow"><b>${titel}</b><span>${hinweis}${hinweis ? ' · ' : ''}Global: ${glob ? 'an' : 'aus'}</span></div>
    <div class="seg sm" data-einst="${esc(pfad)}">${[['global', 'Wie global'], ['an', 'An'], ['aus', 'Aus']].map(([k, l]) => `<button type="button" class="${k === v ? 'on' : ''}" data-ev="${k}">${l}</button>`).join('')}</div></div>`;
}
/** Liest die Felder aus einem Formular zurück: { pfad: true|false } nur für eigene Werte. */
export function einstLesen(root, alt = {}) {
  const e = { ...(alt || {}) };
  root.querySelectorAll('[data-einst]').forEach(seg => {
    const on = seg.querySelector('button.on'); const k = on ? on.dataset.ev : 'global';
    if (k === 'global') delete e[seg.dataset.einst]; else e[seg.dataset.einst] = k === 'an';
  });
  return Object.keys(e).length ? e : undefined;
}
export function einstBinden(root) {
  root.addEventListener('click', ev => {
    const b = ev.target.closest('[data-einst] [data-ev]'); if (!b) return;
    b.parentElement.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
  });
}

/* ---------------- Dialoge ---------------- */
async function koppelnZeigen() {
  let payload;
  try { payload = await SY.pairPayload({ n: S.settings().ntfy.topic || undefined }); }
  catch (e) { toast(esc(e.message), { kind: 'bad' }); return; }
  const url = `https://alex-froese.github.io/zeitblick/#pair=${payload}`;
  sheet({
    title: 'Handy verbinden', cls: 'sheet-sm',
    body: `<p class="small">Am Handy die Kamera auf den Code halten und den Link öffnen. Darin stecken Zugang und Schlüssel: Das Handy gleicht danach <b>verschlüsselt</b> ab.</p>
      <div class="qr-box" style="max-width:260px;margin:12px auto">${qrSvg(url)}</div>
      <p class="tiny muted">Den Code wie ein Passwort behandeln: nicht fotografieren, nicht weitergeben. Schließe dieses Fenster, wenn das Handy verbunden ist.</p>`,
    footer: '<button class="btn btn-primary" data-close>Fertig</button>',
  });
}

function schluesselZeigen(text, neu = false) {
  sheet({
    title: neu ? 'Bitte jetzt aufschreiben' : 'Wiederherstellungs-Schlüssel', cls: 'sheet-sm',
    body: `<p class="small">${neu ? 'Dein Sync ist eingerichtet und <b>verschlüsselt</b>. ' : ''}Mit diesem Schlüssel kommst du an deine Daten im Sync-Speicher, falls ein Gerät verloren geht. <b>Auf Papier oder in den Passwort-Manager</b>, nicht in den Vault, nicht in einen Chat.</p>
      <div class="schluessel-box mono">${esc(text)}</div>`,
    footer: `<button class="btn" data-sk="kopie">${icon('copy', 14)}Kopieren</button><button class="btn btn-primary" data-close>${neu ? 'Habe ich notiert' : 'Fertig'}</button>`,
    onMount: el => el.addEventListener('click', e => { if (e.target.closest('[data-sk="kopie"]')) { copyText(text); toast('Kopiert – danach die Zwischenablage leeren'); } }),
  });
}

/* ---------------- Ereignisse ---------------- */
export function mount(root, ctx) {
  const box = n => root.querySelector(`[data-s4box="${n}"]`);
  if (KR.aktiv) {
    Promise.all([KR.api('einstellungen'), KR.api('info')]).then(([e, i]) => {
      if (box('laptop')) box('laptop').innerHTML = laptopHtml(e, i);
      if (box('orte')) box('orte').innerHTML = orteHtml(i);
    }).catch(err => { if (box('laptop')) box('laptop').innerHTML = `<div class="status-line err">${esc(err.message)}</div>`; });
    SY.gistInfoJetzt();
  }
  root.addEventListener('change', async ev => {
    const x = ev.target.closest('[data-s4set]'); if (!x) return;
    try {
      const e = await KR.api('einstellungen', { method: 'PUT', body: { [x.dataset.s4set]: x.checked } });
      if (x.dataset.s4set === 'spiegel') { S.local.obsidian = { ...(S.local.obsidian || {}), kernAus: !x.checked }; S.saveLocal(); await O.init(); }
      toast('Gespeichert', { ms: 1200 });
      const i = await KR.api('info'); if (box('laptop')) box('laptop').innerHTML = laptopHtml(e, i);
    } catch (err) { toast(esc(err.message), { kind: 'bad' }); }
  }, { signal: ctx.signal });
  root.addEventListener('click', async ev => {
    const b = ev.target.closest('[data-a4]'); if (!b) return;
    const a = b.dataset.a4;
    try {
      if (a === 'verbinden') {
        const token = root.querySelector('[data-s4="token"]').value.trim();
        const key = (root.querySelector('[data-s4="key"]') || {}).value || '';
        b.disabled = true; b.textContent = 'Verbinde …';
        try {
          const r = await SY.connect(token, '', key.trim());
          if (r && r.wiederherstellung) schluesselZeigen(r.wiederherstellung, true);
          else toast('Verbunden – alles wird verschlüsselt abgeglichen');
        } catch (err) {
          toast(esc(err.message), { kind: 'bad', ms: 9000 });
          if (err.code === 'schluessel-noetig') { const k = root.querySelector('[data-s4="key"]'); if (k) { k.focus(); k.closest('details') && (k.closest('details').open = true); } }
        }
        A.render(); return;
      }
      if (a === 'jetzt') { if (KR.aktiv) { await KR.api('sync/jetzt', { method: 'POST' }); await SY.gistInfoJetzt(); } await SY.syncNow({ force: true }); toast('Abgeglichen', { ms: 1400 }); A.render(); return; }
      if (a === 'koppeln') { koppelnZeigen(); return; }
      if (a === 'schluessel') {
        const ok = await confirmDialog('Den Wiederherstellungs-Schlüssel anzeigen? Achte darauf, dass niemand mitliest.', { ok: 'Anzeigen', title: 'Schlüssel anzeigen?', cooldown: 3 });
        if (ok) schluesselZeigen(await SY.wiederherstellung());
        return;
      }
      if (a === 'trennen') {
        const ok = await confirmDialog(KR.aktiv ? 'Den Laptop vom Sync-Speicher trennen? Deine Daten bleiben im Kern und im Speicher, es wird nur nicht mehr abgeglichen.' : 'Dieses Gerät vom Sync trennen? Die Daten auf dem Gerät bleiben.', { ok: 'Trennen', danger: true, title: 'Sync trennen?', cooldown: 3 });
        if (ok) { await SY.disconnect(); A.render(); }
        return;
      }
      if (a === 'umzug') { b.disabled = true; const r = await U.starten(); toast(`Umgezogen: ${(r.anzahl && r.anzahl.tasks) || 0} Vorgänge und alles andere.`, { ms: 7000 }); A.render(); return; }
      if (a === 'kuerzel') {
        const body = {}; root.querySelectorAll('[data-s4k]').forEach(i => { body[i.dataset.s4k] = i.value.trim(); });
        const e = await KR.api('einstellungen', { method: 'PUT', body });
        const i = await KR.api('info'); if (box('laptop')) box('laptop').innerHTML = laptopHtml(e, i);
        const z = e.zustand || {}; toast(z.kuerzelFehler || z.kuerzelVorgangFehler ? esc(z.kuerzelFehler || z.kuerzelVorgangFehler) : 'Kürzel übernommen', { kind: z.kuerzelFehler || z.kuerzelVorgangFehler ? 'bad' : '' });
        return;
      }
      if (a === 'neuesfenster') { await KR.fensterOeffnen('haupt'); return; }
      if (a === 'neuervorgang') { await KR.fensterOeffnen('entwurf', E.neueId()); return; }
      if (a === 'sichern') { const r = await KR.api('sicherung', { method: 'POST', body: { grund: 'hand' } }); toast('Gesichert: ' + esc(r.name)); const i = await KR.api('info'); if (box('orte')) box('orte').innerHTML = orteHtml(i); return; }
      if (a === 'bsp-ok') { uebernehmen(b.dataset.c, b.dataset.id); toast('Übernommen'); A.render(); return; }
      if (a === 'bsp-weg') { S.remove(b.dataset.c, b.dataset.id); toast('Gelöscht', { action: 'Rückgängig', onAction: () => { const x = S.getData()[b.dataset.c][b.dataset.id]; if (x) S.restore(b.dataset.c, x); } }); return; }
      if (a === 'bsp-alle-ok') { for (const { c, x } of beispiele()) uebernehmen(c, x.id); S.touch({}); toast('Alle Beispiele übernommen'); return; }
      if (a === 'bsp-alle-weg') {
        const l = beispiele();
        const ok = await confirmDialog(`Alle ${l.length} Beispiel-Einträge löschen? Im Papierkorb lassen sie sich zurückholen.`, { ok: 'Alle löschen', danger: true, title: 'Beispieldaten löschen?', cooldown: 3 });
        if (ok) { for (const { c, x } of l) S.remove(c, x.id); toast(`${l.length} Beispiele gelöscht`); }
        return;
      }
      if (a === 'vorv4') {
        const v = await S.vorV4();
        if (!v) { toast('Dieses Gerät hatte vor Version 4 keine Daten (oder ist schon neu eingerichtet).'); return; }
        const { download } = await import('../ui.js');
        download(`zeitblick-vor-v4-${C.ymd(new Date(v.at))}.json`, JSON.stringify({ app: 'Zeitblick', version: `${v.version}.x (vor 4.0.0)`, exportedAt: new Date(v.at).toISOString(), data: v.data }, null, 1));
        toast('Stand vor Version 4 heruntergeladen. Mit „Sicherung einspielen“ (auch in Version 3) wiederherstellbar.', { ms: 7000 });
        return;
      }
      if (a === 'ent-auf') { A.newTask({ entwurf: b.dataset.id }); return; }
      if (a === 'ent-zurueck') { E.zurueckholen(b.dataset.id); toast('Zurückgeholt – unten rechts weitermachen'); A.render(); return; }
    } catch (err) { b.disabled = false; toast(esc(err.message), { kind: 'bad', ms: 7000 }); }
  }, { signal: ctx.signal });
}
