// Wiederholungs-Baustein für Vorgänge, Termine
import * as C from './core.js';
import { esc, icon } from './ui.js';

/* ---------------- Wiederholungs-Baustein ---------------- */
export function recPreset(rule) {
  if (!rule || !rule.f) return 'none';
  const i = Number(rule.i) || 1;
  const wd = (rule.wd || []).slice().sort().join(',');
  if (rule.f === 'd' && i === 1) return 'd';
  if (rule.f === 'w' && i === 1 && wd === '0,1,2,3,4') return 'wd';
  if (rule.f === 'w' && i === 1) return 'w';
  if (rule.f === 'm' && i === 1) return 'm';
  if (rule.f === 'y' && i === 1) return 'y';
  return 'c';
}
export function recHtml(rule, dateStr) {
  const p = recPreset(rule);
  const r = rule || {};
  const baseWd = dateStr ? C.wdIdx(C.parseYmd(dateStr.slice(0, 10))) : C.wdIdx(new Date());
  const wds = r.wd && r.wd.length ? r.wd : [baseWd];
  const endMode = r.until ? 'until' : r.n ? 'n' : 'never';
  return `<div class="field"><label for="rec-sel">${icon('repeat', 15)}Wiederholen</label>
    <select class="select" id="rec-sel" data-rec="preset">
      <option value="none" ${p === 'none' ? 'selected' : ''}>Nicht wiederholen</option>
      <option value="d" ${p === 'd' ? 'selected' : ''}>Täglich</option>
      <option value="wd" ${p === 'wd' ? 'selected' : ''}>Werktags (Mo–Fr)</option>
      <option value="w" ${p === 'w' ? 'selected' : ''}>Wöchentlich</option>
      <option value="m" ${p === 'm' ? 'selected' : ''}>Monatlich</option>
      <option value="y" ${p === 'y' ? 'selected' : ''}>Jährlich</option>
      <option value="c" ${p === 'c' ? 'selected' : ''}>Benutzerdefiniert …</option>
    </select></div>
    <div data-rec="detail" class="${p === 'none' ? 'hide' : ''}">
      <div class="row wrap ${p === 'c' ? '' : 'hide'}" data-rec="custom" style="margin-bottom:12px">
        <span class="small">Alle</span>
        <input class="input" type="number" min="1" max="99" value="${Number(r.i) || 1}" data-rec="i" style="width:70px">
        <select class="select" data-rec="f" style="width:auto">
          <option value="d" ${r.f === 'd' ? 'selected' : ''}>Tage</option>
          <option value="w" ${!r.f || r.f === 'w' ? 'selected' : ''}>Wochen</option>
          <option value="m" ${r.f === 'm' ? 'selected' : ''}>Monate</option>
          <option value="y" ${r.f === 'y' ? 'selected' : ''}>Jahre</option>
        </select>
      </div>
      <div class="field ${(p === 'w' || (p === 'c' && (r.f || 'w') === 'w')) ? '' : 'hide'}" data-rec="wdbox"><label>An diesen Tagen</label>
        <div class="wd-pick">${C.WD_SHORT.map((w, i) => `<button type="button" data-wd="${i}" class="${wds.includes(i) ? 'on' : ''}" aria-pressed="${wds.includes(i)}">${w}</button>`).join('')}</div>
      </div>
      <div class="field"><label>Endet</label>
        <div class="row wrap">
          <select class="select" data-rec="end" style="width:auto">
            <option value="never" ${endMode === 'never' ? 'selected' : ''}>Nie</option>
            <option value="until" ${endMode === 'until' ? 'selected' : ''}>Am Datum</option>
            <option value="n" ${endMode === 'n' ? 'selected' : ''}>Nach Anzahl</option>
          </select>
          <input class="input ${endMode === 'until' ? '' : 'hide'}" type="date" data-rec="until" value="${esc(r.until || '')}" style="width:auto">
          <input class="input ${endMode === 'n' ? '' : 'hide'}" type="number" min="1" data-rec="n" value="${r.n || 10}" style="width:90px">
        </div>
      </div>
    </div>`;
}
export function recBind(root) {
  const q = s => root.querySelector(`[data-rec="${s}"]`);
  const sync = () => {
    const p = q('preset').value;
    q('detail').classList.toggle('hide', p === 'none');
    q('custom').classList.toggle('hide', p !== 'c');
    const f = p === 'c' ? q('f').value : p === 'w' ? 'w' : '';
    q('wdbox').classList.toggle('hide', f !== 'w');
    const e = q('end').value;
    q('until').classList.toggle('hide', e !== 'until');
    q('n').classList.toggle('hide', e !== 'n');
  };
  root.addEventListener('change', e => { if (e.target.closest('[data-rec]')) sync(); });
  root.querySelectorAll('[data-wd]').forEach(b => b.addEventListener('click', () => {
    b.classList.toggle('on'); b.setAttribute('aria-pressed', b.classList.contains('on'));
    if (!root.querySelector('[data-wd].on')) { b.classList.add('on'); }
  }));
}
export function recRead(root) {
  const q = s => root.querySelector(`[data-rec="${s}"]`);
  const p = q('preset').value;
  if (p === 'none') return null;
  let r;
  const wds = [...root.querySelectorAll('[data-wd].on')].map(b => Number(b.dataset.wd));
  if (p === 'd') r = { f: 'd', i: 1 };
  else if (p === 'wd') r = { f: 'w', i: 1, wd: [0, 1, 2, 3, 4] };
  else if (p === 'w') r = { f: 'w', i: 1, wd: wds };
  else if (p === 'm') r = { f: 'm', i: 1 };
  else if (p === 'y') r = { f: 'y', i: 1 };
  else { const f = q('f').value; r = { f, i: Math.max(1, Number(q('i').value) || 1) }; if (f === 'w') r.wd = wds; }
  const e = q('end').value;
  if (e === 'until' && q('until').value) r.until = q('until').value;
  if (e === 'n') r.n = Math.max(1, Number(q('n').value) || 1);
  return r;
}

