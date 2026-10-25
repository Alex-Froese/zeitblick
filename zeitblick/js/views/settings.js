// Einstellungen: Einrichtung, Darstellung, Kategorien, Ampel, Erinnerungen, Push, Sync, Obsidian, Backups, Google
import * as C from '../core.js';
import * as S from '../store.js';
import * as SY from '../sync.js';
import * as N from '../notify.js';
import * as NT from '../ntfy.js';
import * as O from '../obsidian.js';
import { esc, icon, toast, confirmDialog, download, pickFile, copyText, sheet, promptDialog } from '../ui.js';
import { A } from '../app-api.js';
import { catColor, areaName } from './common.js';

const SECTIONS = [
  ['einrichtung', 'Einrichtung', 'bolt'],
  ['darstellung', 'Darstellung', 'sun'],
  ['kategorien', 'Kategorien', 'tag'],
  ['ampel', 'Ampel & Eskalation', 'ampel'],
  ['erinnerungen', 'Erinnerungen', 'bell'],
  ['push', 'Benachrichtigungen', 'phone'],
  ['sync', 'Sync & Cloud', 'cloud'],
  ['obsidian', 'Obsidian', 'gem'],
  ['backup', 'Datensicherung', 'shield'],
  ['google', 'Google Kalender', 'calendar'],
  ['fokus', 'Fokus', 'focus'],
  ['leitsaetze', 'Leitsätze', 'notes'],
  ['info', 'Über Zeitblick', 'settings'],
];

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
  return `<section class="panel set-sec" id="set-einrichtung"><div class="panel-head"><h2>Einrichtung</h2></div>
    <p class="small muted">In fünf Schritten läuft Zeitblick auf Handy und Laptop synchron, mit Push-Erinnerungen und automatischer Ablage in Obsidian.</p>
    ${card(isStandalone(), 'download', 'App installieren', isStandalone() ? 'Zeitblick läuft als installierte App.' : 'Installiere Zeitblick, damit es wie eine echte App startet. Am Handy: im Browser-Menü „Zum Startbildschirm hinzufügen“. Am Laptop: Installieren-Symbol in der Adressleiste.', installPrompt && !isStandalone() ? `<button class="btn sm btn-primary" data-act="install">${icon('download', 15)}Jetzt installieren</button>` : '')}
    ${card(synced, 'cloud', 'Sync zwischen allen Geräten', synced ? `Verbunden mit GitHub (${esc((S.local.gist || {}).login || '')}). Alle Änderungen landen automatisch in deinem privaten Cloud-Speicher mit Versionsverlauf.` : 'Verbinde einen kostenlosen GitHub-Account. Deine Daten liegen dann in einem privaten Speicher und sind auf allen Geräten gleich.', `<a class="btn sm ${synced ? '' : 'btn-primary'}" href="#/einstellungen/sync">${synced ? 'Verwalten' : 'Sync einrichten'}</a>`)}
    ${card(ntfyOn, 'phone', 'Push aufs Handy', ntfyOn ? `Aktiv über Kanal „${esc(s.ntfy.topic)}“. Erinnerungen bleiben, bis du sie wegwischst.` : 'Installiere die kostenlose App „ntfy“ und abonniere deinen persönlichen Kanal. Zeitblick plant alle Erinnerungen dort ein.', `<a class="btn sm ${ntfyOn ? '' : 'btn-primary'}" href="#/einstellungen/push">${ntfyOn ? 'Verwalten' : 'Push einrichten'}</a>`)}
    ${card(perm === 'granted' && S.local.sysNotif, 'laptop', 'Benachrichtigungen auf diesem Gerät', perm === 'granted' ? 'Erlaubt. Erinnerungen erscheinen als Systembenachrichtigung und bleiben stehen.' : perm === 'denied' ? 'Im Browser blockiert. Erlaube Benachrichtigungen über das Schloss-Symbol in der Adressleiste.' : 'Erlaube Benachrichtigungen, damit dich Zeitblick am Laptop erinnert.', perm !== 'granted' && perm !== 'denied' && perm !== 'unsupported' ? `<button class="btn sm btn-primary" data-act="perm">Erlauben</button>` : '')}
    ${card(false, 'clock', 'Erinnerungen auch bei ausgeschaltetem Gerät (optional)', 'Zeitblick plant Push-Nachrichten bis zu drei Tage im Voraus, sobald die App irgendwo geöffnet ist. Damit auch längere Pausen abgedeckt sind und dein Google Kalender automatisch einfließt, läuft stündlich ein kostenloser Helfer in deinem GitHub-Repository. Anleitung: README, Abschnitt „Server-Erinnerungen“.', synced ? `<button class="btn sm" data-act="copygist">${icon('copy', 15)}Gist-ID kopieren</button>` : '')}
    ${card(obs, 'gem', 'Ablage in Obsidian', obs ? `Schreibt automatisch in „${esc(O.ostate.folder)}/Zeitblick“.` : O.supported ? 'Wähle deinen Obsidian-Vault. Zeitblick legt Aufgaben, Termine, Fokus-Log, Tagesnotizen und tägliche Backups als Markdown ab.' : 'Am Laptop in Chrome oder Edge verfügbar.', O.supported ? `<a class="btn sm ${obs ? '' : 'btn-primary'}" href="#/einstellungen/obsidian">${obs ? 'Verwalten' : 'Ordner wählen'}</a>` : '')}
  </section>`;
}

function catsSection() {
  const row = c => `<div class="cat-row"><span class="em">${esc(c.icon || '•')}</span><i class="catdot" style="background:${catColor(c)}"></i><span class="grow">${esc(c.name)}</span>
    <button class="icon-btn sm" data-catedit="${c.id}" aria-label="Bearbeiten">${icon('edit', 16)}</button><button class="icon-btn sm" data-catdel="${c.id}" aria-label="Löschen">${icon('trash', 16)}</button></div>`;
  return `<section class="panel set-sec" id="set-kategorien"><div class="panel-head"><h2>Kategorien</h2><button class="btn sm" data-catnew="p">${icon('plus', 15)}Privat</button><button class="btn sm" data-catnew="b">${icon('plus', 15)}Geschäftlich</button></div>
    <div class="area-cols">
      <div><div class="area-h"><i style="background:var(--priv)"></i>Privat</div>${S.cats('p').map(row).join('')}</div>
      <div><div class="area-h"><i style="background:var(--biz)"></i>Geschäftlich</div>${S.cats('b').map(row).join('')}</div>
    </div></section>`;
}

function editCategory(c, area) {
  const isNew = !c;
  const cur = c ? { ...c } : { name: '', icon: '⭐', area, color: C.PALETTE[S.cats(area).length % C.PALETTE.length] };
  sheet({
    title: isNew ? 'Neue Kategorie' : 'Kategorie bearbeiten', cls: 'sheet-sm',
    body: `<div class="row" style="align-items:flex-end;gap:10px"><div class="field"><label>Symbol</label><input class="input emoji-in" data-c="icon" value="${esc(cur.icon || '')}" maxlength="4"></div>
      <div class="field grow"><label>Name</label><input class="input" data-c="name" value="${esc(cur.name)}" placeholder="z. B. Kundenpflege" autofocus></div></div>
      <div class="field"><label>Bereich</label><select class="select" data-c="area"><option value="p" ${cur.area === 'p' ? 'selected' : ''}>Privat</option><option value="b" ${cur.area === 'b' ? 'selected' : ''}>Geschäftlich</option></select></div>
      <div class="field"><label>Farbe</label><div class="color-pick">${C.PALETTE.map(p => `<button type="button" data-col="${p}" class="${p === cur.color ? 'on' : ''}" style="background:${p}" aria-label="Farbe ${p}"></button>`).join('')}</div></div>`,
    footer: `<button class="btn" data-close>Abbrechen</button><button class="btn btn-primary" data-save>Speichern</button>`,
    onMount: (el, close) => {
      el.addEventListener('click', e => {
        const b = e.target.closest('[data-col]');
        if (b) { cur.color = b.dataset.col; el.querySelectorAll('[data-col]').forEach(x => x.classList.toggle('on', x === b)); }
        if (e.target.closest('[data-save]')) {
          const name = el.querySelector('[data-c="name"]').value.trim();
          if (!name) return el.querySelector('[data-c="name"]').focus();
          S.put('cats', { ...cur, name, icon: el.querySelector('[data-c="icon"]').value.trim() || '•', area: el.querySelector('[data-c="area"]').value, order: cur.order ?? 99 });
          toast(isNew ? 'Kategorie angelegt' : 'Kategorie gespeichert');
          close();
        }
      });
    },
  });
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
  const sec = route.parts[0] || 'einrichtung';
  const googleCount = S.getGoogleEvents().length;
  const counts = S.countData(S.getData());
  const remChips = (path, sel, opts) => `<div class="rem-pick" data-rempath="${path}">${opts.map(([m, l]) => `<button type="button" class="chip ${sel.includes(m) ? 'on' : ''}" data-remv="${m}">${l}</button>`).join('')}</div>`;
  const TR = [[0, 'Bei Fälligkeit'], [15, '15 Min'], [60, '1 Std'], [180, '3 Std'], [1440, '1 Tag'], [2880, '2 Tage']];
  const ER = [[0, 'Zum Beginn'], [5, '5 Min'], [10, '10 Min'], [15, '15 Min'], [30, '30 Min'], [60, '1 Std'], [1440, '1 Tag']];

  return `
  <div class="page-head"><div class="grow"><h1>Einstellungen</h1><div class="page-sub">Alles, was Zeitblick an dich anpasst.</div></div></div>
  <div class="set-grid">
    <nav class="set-nav">${SECTIONS.map(([k, n, ic]) => `<a href="#/einstellungen/${k}" class="${k === sec ? 'on' : ''}">${icon(ic, 17)}${n}</a>`).join('')}</nav>
    <div>
      ${setupSection()}

      <section class="panel set-sec" id="set-darstellung"><div class="panel-head"><h2>Darstellung</h2></div>
        <div class="field"><label for="s-name">Dein Name für die Begrüßung</label><input id="s-name" class="input" data-settext="name" value="${esc(s.name)}" style="max-width:320px"></div>
        <div class="field"><label>Farbmodus</label>
          <div class="chips">${[['light', 'Hell', 'sun'], ['dark', 'Dunkel', 'moon'], ['night', 'Nacht (Rotlicht)', 'night'], ['auto', 'Wie System', 'auto']].map(([k, l, ic]) => `<button class="chip ${S.local.theme === k ? 'on' : ''}" data-theme-set="${k}">${icon(ic, 14)}${l}</button>`).join('')}</div>
          <span class="hint">Der Nachtmodus filtert Blaulicht weg und zeigt alles in warmem Rotlicht – angenehm für späte Stunden.</span></div>
        ${sw('local.nightAuto', S.local.nightAuto, 'Nachtmodus automatisch', 'Zwischen 21 und 6 Uhr auf diesem Gerät automatisch Rotlicht')}
        ${num('dayStart', s.dayStart ?? 7, 'Kalender scrollt zu', 'Stunde, die in der Tages- und Wochenansicht oben steht', 0, 12, 1, 'Uhr')}
      </section>

      ${catsSection()}

      <section class="panel set-sec" id="set-ampel"><div class="panel-head"><h2>Ampel & Eskalation</h2></div>
        <p class="small muted">So wandern deine Tickets durch die Ampel: Grün → Gelb (Frist naht) → Rot (überfällig) → Alarm (lange überfällig). Ab Rot kommen wiederholte Push-Nachrichten mit höchster Priorität, beim Öffnen erscheint ein rotes Alarm-Fenster.</p>
        ${sw('amp.escOn', s.amp.escOn, 'Eskalation aktiv', 'Wiederholte Push-Erinnerungen und Alarm-Fenster für überfällige Aufgaben')}
        ${num('amp.yellowH', s.amp.yellowH, 'Gelb ab', 'Stunden vor Fälligkeit (P1 doppelt so früh, P4 halb so früh)', 1, 336, 1, 'Std')}
        ${num('amp.alarmH', s.amp.alarmH, 'Alarm nach', 'Stunden Überfälligkeit (P1 nach einem Viertel, P2 nach der Hälfte)', 1, 336, 1, 'Std')}
        ${num('amp.repeatH', s.amp.repeatH, 'Push wiederholen alle', 'Solange eine Aufgabe überfällig ist', 0.5, 24, 0.5, 'Std')}
        ${num('amp.autoUrgH', s.amp.autoUrgH, 'Automatisch dringend', 'Wenn die Frist näher ist als', 1, 336, 1, 'Std')}
        ${sw('amp.quietOn', s.amp.quietOn, 'Ruhezeit für Eskalationen', 'Wiederholte Überfällig-Nachrichten pausieren nachts. Normale Erinnerungen kommen trotzdem.')}
        <div class="optrow"><div class="grow"><b>Ruhezeit</b><span>von – bis</span></div><div class="row"><input class="input" type="time" data-settext="amp.quietFrom" value="${esc(s.amp.quietFrom)}" style="width:auto"><span>–</span><input class="input" type="time" data-settext="amp.quietTo" value="${esc(s.amp.quietTo)}" style="width:auto"></div></div>
      </section>

      <section class="panel set-sec" id="set-erinnerungen"><div class="panel-head"><h2>Standard-Erinnerungen</h2></div>
        ${[1, 2, 3, 4].map(p => `<div class="field"><label>${C.PRIOS[p].short} ${C.PRIOS[p].name}</label>${remChips('rem.task.' + p, s.rem.task[p] || [], TR)}</div>`).join('')}
        <div class="field"><label>Termine</label>${remChips('rem.event', s.rem.event || [], ER)}</div>
        <div class="optrow"><div class="grow"><b>Ganztägige Termine</b><span>Erinnerung am Morgen um</span></div><input class="input" type="time" data-settext="rem.allDayAt" value="${esc(s.rem.allDayAt)}" style="width:auto"></div>
      </section>

      <section class="panel set-sec" id="set-push"><div class="panel-head"><h2>Benachrichtigungen</h2></div>
        <h3 style="margin-bottom:8px">${icon('laptop', 16)} Dieses Gerät</h3>
        <div class="status-line ${perm === 'granted' ? 'ok' : perm === 'denied' ? 'err' : ''}">${perm === 'granted' ? '✓ Systembenachrichtigungen erlaubt' : perm === 'denied' ? 'Im Browser blockiert – über das Schloss-Symbol in der Adressleiste erlauben.' : perm === 'unsupported' ? 'Dieser Browser unterstützt keine Benachrichtigungen.' : 'Noch nicht erlaubt'}</div>
        ${sw('local.sysNotif', S.local.sysNotif, 'Erinnerungen als Systembenachrichtigung', 'Erscheinen groß, bleiben stehen, bis du sie wegklickst, und öffnen per Klick direkt die Aufgabe')}
        ${sw('local.sound', S.local.sound, 'Ton bei Erinnerungen', 'Kurzer Signalton in der App')}
        <div class="row wrap" style="margin:8px 0 18px">${perm === 'default' ? `<button class="btn btn-primary sm" data-act="perm">Benachrichtigungen erlauben</button>` : ''}<button class="btn sm" data-act="testlocal">Test-Benachrichtigung</button></div>
        <hr class="sep">
        <h3 style="margin-bottom:8px">${icon('phone', 16)} Handy-Push über ntfy</h3>
        <p class="small muted">ntfy ist eine kostenlose Push-App (Android und iPhone). Zeitblick plant jede Erinnerung bis zu drei Tage im Voraus auf dem ntfy-Server ein – sie kommt also auch, wenn die App zu ist. Erledigst du eine Aufgabe, verschwindet die Nachricht wieder vom Handy.</p>
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
        <div class="field" style="margin-top:6px"><label for="s-appurl">Adresse der App (für Deep Links)</label><input id="s-appurl" class="input" data-settext="appUrl" value="${esc(s.appUrl || '')}" placeholder="${esc(N.baseUrl())}"><span class="hint">Tippst du auf eine Benachrichtigung, öffnet sich diese Adresse direkt bei der Aufgabe. Leer lassen = aktuelle Adresse (${esc(N.baseUrl())}).</span></div>
      </section>

      <section class="panel set-sec" id="set-sync"><div class="panel-head"><h2>Sync & Cloud-Speicher</h2></div>
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

      <section class="panel set-sec" id="set-obsidian"><div class="panel-head"><h2>Obsidian</h2></div>
        ${!O.supported ? '<div class="status-line">Direktes Schreiben in Ordner geht nur am Laptop in Chrome oder Edge. Auf dem Handy landen die Daten über den Sync trotzdem überall.</div>'
    : O.ostate.status === 'ok' ? `<div class="status-line ok">✓ Schreibt in „${esc(O.ostate.folder)}/Zeitblick“${O.ostate.last ? `, zuletzt ${esc(C.fmtRelTime(O.ostate.last))}` : ''}</div>`
      : O.ostate.status === 'needs-permission' ? `<div class="status-line">Der Browser fragt nach einem Neustart erneut nach Zugriff auf „${esc(O.ostate.folder)}“. <button class="btn sm btn-primary" data-act="obsregrant" style="margin-left:auto">Zugriff erlauben</button></div>`
        : O.ostate.status === 'error' ? `<div class="status-line err">${esc(O.ostate.error)}</div>` : ''}
        <p class="small muted">Wähle deinen Vault-Ordner. Zeitblick legt darin einen Ordner „Zeitblick“ an mit: Übersicht, einer Notiz pro Aufgabe (mit Eigenschaften für Dataview), Kalender je Monat, Fokus-Log, Tagesnotizen, der kompletten Datendatei und täglichen Backups (30 Tage).</p>
        ${O.supported ? `<div class="row wrap"><button class="btn btn-primary sm" data-act="obschoose">${icon('folder', 15)}${O.ostate.folder ? 'Anderen Ordner wählen' : 'Vault-Ordner wählen'}</button>${O.ostate.status === 'ok' ? `<button class="btn sm" data-act="obsnow">Jetzt schreiben</button><button class="btn sm btn-ghost" data-act="obsoff">Trennen</button>` : ''}</div>` : ''}
        ${sw('local.obsidian.notes', S.local.obsidian.notes !== false, 'Eine Notiz pro Aufgabe', 'Mit YAML-Eigenschaften: ticket, status, bereich, kategorie, prioritaet, quadrant, ampel, faellig …')}
        ${sw('local.obsidian.daily', S.local.obsidian.daily !== false, 'Tagesnotizen', 'Für die letzten 14 und nächsten 7 Tage')}
      </section>

      <section class="panel set-sec" id="set-backup"><div class="panel-head"><h2>Datensicherung</h2></div>
        <p class="small muted">Automatisch: jeden Tag ein Schnappschuss hier auf dem Gerät (21 Tage), mit Sync zusätzlich jede Änderung als Version in der Cloud, mit Obsidian täglich eine Sicherungsdatei im Vault.</p>
        <div class="row wrap" style="margin-bottom:12px">
          <button class="btn sm" data-act="export">${icon('download', 15)}Sicherung herunterladen</button>
          <button class="btn sm" data-act="import">${icon('upload', 15)}Sicherung einspielen</button>
          <button class="btn sm" data-act="snapnow">${icon('shield', 15)}Schnappschuss jetzt</button>
        </div>
        <div class="small muted" style="margin-bottom:6px">Aktuell: ${counts.tasks} Aufgaben, ${counts.events} Termine, ${counts.focus} Fokus-Einheiten, ${counts.cats} Kategorien.</div>
        <div data-snaps><div class="small muted">Lade Schnappschüsse …</div></div>
      </section>

      <section class="panel set-sec" id="set-google"><div class="panel-head"><h2>Google Kalender</h2></div>
        <div class="status-line ${googleCount ? 'ok' : ''}">${googleCount ? `✓ ${googleCount} Google-Termine eingelesen (nur lesen, im Kalender als eigene Ebene)` : 'Noch keine Google-Termine eingelesen.'}</div>
        <p class="small muted"><b>Dauerhaft eingebunden:</b> Die Server-Erinnerung auf GitHub (siehe Anleitung in der README) liest stündlich deine geheime iCal-Adresse aus Google Kalender (Einstellungen → dein Kalender → „Privatadresse im iCal-Format“) und legt die Termine im Sync-Speicher ab.</p>
        <p class="small muted"><b>Einmalig übernehmen:</b> Eine .ics-Datei (Google Kalender → Einstellungen → Exportieren) als bearbeitbare Zeitblick-Termine importieren.</p>
        <div class="row wrap"><button class="btn sm" data-act="icsimport" data-area="p">${icon('upload', 15)}.ics nach Privat</button><button class="btn sm" data-act="icsimport" data-area="b">${icon('upload', 15)}.ics nach Geschäftlich</button><button class="btn sm" data-act="icsexport">${icon('download', 15)}Zeitblick-Termine als .ics</button></div>
      </section>

      <section class="panel set-sec" id="set-fokus"><div class="panel-head"><h2>Fokus</h2></div>
        ${num('focus.len', s.focus.len, 'Standard-Fokuszeit', '', 5, 180, 5, 'Min')}
        ${num('focus.brk', s.focus.brk, 'Kurze Pause', '', 1, 60, 1, 'Min')}
        ${sw('focus.strict', s.focus.strict, 'Strenger Modus als Standard', 'Verlässt du die App länger als 12 Sekunden, zerbricht der Kristall')}
      </section>

      <section class="panel set-sec" id="set-leitsaetze"><div class="panel-head"><h2>Leitsätze</h2></div>
        <p class="small muted">Einer pro Zeile. Jeden Tag erscheint ein anderer auf dem Dashboard.</p>
        <textarea class="textarea" data-leit rows="7">${esc(S.leitsaetze().join('\n'))}</textarea>
        <div class="row" style="margin-top:8px;justify-content:flex-end"><button class="btn sm btn-primary" data-act="saveleit">Speichern</button></div>
      </section>

      <section class="panel set-sec" id="set-info"><div class="panel-head"><h2>Über Zeitblick</h2></div>
        <p class="small">Version ${C.APP_VERSION}. Gerät: <span class="code">${esc(S.local.deviceId)}</span></p>
        <p class="small muted">Tastenkürzel: N neue Aufgabe, E neuer Termin, F Fokus, / Suche, 1–5 Ansichten, im Kalender T, D, W, M, A, J, K.</p>
        <div class="row wrap">${A.hasDemo && A.hasDemo() ? `<button class="btn sm" data-act="rmdemo">${icon('x', 15)}Beispieldaten entfernen</button>` : `<button class="btn sm" data-act="demo">${icon('layers', 15)}Beispieldaten anlegen</button>`}
        <button class="btn sm btn-ghost" data-act="wipe" style="color:var(--bad)">${icon('trash', 15)}Lokale Daten auf diesem Gerät löschen</button></div>
      </section>
    </div>
  </div>`;
}

async function renderSnaps(root) {
  const box = root.querySelector('[data-snaps]');
  if (!box) return;
  const list = await S.listSnapshots();
  box.innerHTML = list.length ? list.map(x => `<div class="snap"><span class="grow">${esc(C.fmtDateShort(C.parseYmd(x.key)))} ${C.parseYmd(x.key).getFullYear()}<span class="small muted">, ${x.counts.tasks} Aufgaben, ${x.counts.events} Termine</span></span><button class="btn sm" data-restore="${x.key}">Wiederherstellen</button></div>`).join('') : '<div class="small muted">Noch keine Schnappschüsse.</div>';
}

export function mount(root, ctx, route) {
  const sec = route.parts[0];
  if (sec) { const el = root.querySelector('#set-' + sec); if (el) requestAnimationFrame(() => el.scrollIntoView({ block: 'start' })); }
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
    if (b.dataset.themeSet) { S.local.theme = b.dataset.themeSet; S.saveLocal(); A.applyTheme(); A.render(); return; }
    if (b.dataset.catnew) return editCategory(null, b.dataset.catnew);
    if (b.dataset.catedit) return editCategory(S.cat(b.dataset.catedit));
    if (b.dataset.catdel) {
      const c = S.cat(b.dataset.catdel);
      const n = S.tasks(t => t.cat === c.id).length;
      if (await confirmDialog(`„${esc(c.name)}“ wird gelöscht.${n ? ` ${n} Aufgaben behalten ihren Inhalt, verlieren aber die Kategorie.` : ''}`, { ok: 'Löschen', danger: true, title: 'Kategorie löschen?' })) {
        for (const t of S.tasks(t => t.cat === c.id)) S.put('tasks', { ...t, cat: null }, { silent: true });
        S.remove('cats', c.id);
      }
      return;
    }
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
      body: `<p class="confirm-text">Die Datei enthält ${n.tasks} Aufgaben, ${n.events} Termine und ${n.focus} Fokus-Einheiten.</p><p class="small muted">Zusammenführen behält beides (neuere Version gewinnt). Ersetzen stellt genau den Stand der Datei her.</p>`,
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
