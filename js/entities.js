// Kategorien und Lebensbereiche anlegen/bearbeiten (mit Vorschlägen)
import * as C from './core.js';
import * as S from './store.js';
import { esc, sheet, toast, confirmDialog, icon } from './ui.js';

function colorPicker(sel) {
  return `<div class="color-pick" data-colors>${C.CAT_COLORS.map(c => `<button type="button" data-col="${c}" class="${c.toLowerCase() === (sel || '').toLowerCase() ? 'on' : ''}" style="background:${c}" aria-label="Farbe ${c}"></button>`).join('')}
    <input type="color" data-colin value="${esc(sel || '#1b4f72')}" aria-label="Eigene Farbe">
    <input class="input" data-colhex value="${esc(sel || '#1b4f72')}" maxlength="7" style="width:92px" aria-label="Hex-Code"></div>`;
}
function bindColor(el, get, set) {
  const hex = el.querySelector('[data-colhex]'), inp = el.querySelector('[data-colin]');
  const apply = v => {
    if (!/^#[0-9a-f]{6}$/i.test(v)) return;
    set(v); hex.value = v; inp.value = v;
    el.querySelectorAll('[data-col]').forEach(b => b.classList.toggle('on', b.dataset.col.toLowerCase() === v.toLowerCase()));
  };
  el.querySelectorAll('[data-col]').forEach(b => b.addEventListener('click', () => apply(b.dataset.col)));
  inp.addEventListener('input', () => apply(inp.value));
  hex.addEventListener('change', () => { let v = hex.value.trim(); if (!v.startsWith('#')) v = '#' + v; apply(v); if (!/^#[0-9a-f]{6}$/i.test(v)) hex.value = get(); });
}

/** Kategorie anlegen/bearbeiten. Liefert Promise mit der ID (oder null). */
export function editCategory(cat, { area = 'p' } = {}) {
  return new Promise(resolve => {
    const isNew = !cat;
    const cur = cat ? { ...cat } : { name: '', icon: '', area: area === 'b' ? 'b' : 'p', color: C.CAT_COLORS[(S.cats().length * 3) % C.CAT_COLORS.length], life: null };
    let result = null;
    const suggHtml = a => {
      const have = new Set(S.cats().map(c => C.norm(c.name)));
      const list = C.SUGGESTED_CATS[a].filter(([n]) => !have.has(C.norm(n)));
      return list.length ? `<div class="lbl" style="margin-bottom:6px">Vorschläge</div><div class="sugg">${list.map(([n, ic, col]) => `<button type="button" data-sugg="${esc(n)}" data-ic="${esc(ic)}" data-c="${col}"><i style="background:${col}"></i>${esc(n)}</button>`).join('')}</div><hr class="sep">` : '';
    };
    sheet({
      title: isNew ? 'Neue Kategorie' : 'Kategorie bearbeiten', cls: 'sheet-sm',
      body: `${isNew ? `<div data-suggbox>${suggHtml(cur.area)}</div>` : ''}
        <div class="field"><label for="cat-name">Name</label><input id="cat-name" class="input" data-k="name" value="${esc(cur.name)}" placeholder="z. B. Kundenpflege" autofocus></div>
        <div class="fgrid">
          <div class="field"><label for="cat-area">Bereich</label><select id="cat-area" class="select" data-k="area"><option value="p" ${cur.area === 'p' ? 'selected' : ''}>Privat</option><option value="b" ${cur.area === 'b' ? 'selected' : ''}>Geschäftlich</option></select></div>
          <div class="field"><label for="cat-icon">Symbol (optional)</label><input id="cat-icon" class="input" data-k="icon" value="${esc(cur.icon || '')}" maxlength="4" placeholder="🙂"></div>
        </div>
        <div class="field"><label>Farbe (Hex-Code möglich)</label>${colorPicker(cur.color)}</div>
        <div class="field"><label for="cat-life">Gehört zum Lebensbereich</label><select id="cat-life" class="select" data-k="life"><option value="">Keiner</option>${S.lifeAreas().map(l => `<option value="${l.id}" ${l.id === cur.life ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></div>`,
      footer: `${!isNew ? `<div class="left"><button class="btn btn-ghost" data-del>${icon('trash', 15)}Löschen</button></div>` : ''}<button class="btn" data-close>Abbrechen</button><button class="btn btn-primary" data-save>${isNew ? 'Anlegen' : 'Speichern'}</button>`,
      onMount: (el, close) => {
        bindColor(el, () => cur.color, v => { cur.color = v; });
        const v = k => el.querySelector(`[data-k="${k}"]`);
        v('area').addEventListener('change', () => { cur.area = v('area').value; const b = el.querySelector('[data-suggbox]'); if (b) b.innerHTML = suggHtml(cur.area); });
        el.addEventListener('click', async e => {
          const sg = e.target.closest('[data-sugg]');
          if (sg) {
            v('name').value = sg.dataset.sugg; v('icon').value = sg.dataset.ic;
            cur.color = sg.dataset.c; el.querySelector('[data-colhex]').value = cur.color; el.querySelector('[data-colin]').value = cur.color;
            el.querySelectorAll('[data-col]').forEach(b => b.classList.toggle('on', b.dataset.col === cur.color));
            el.querySelectorAll('[data-sugg]').forEach(b => b.style.borderStyle = b === sg ? 'solid' : '');
            return;
          }
          if (e.target.closest('[data-save]')) {
            const name = v('name').value.trim();
            if (!name) { v('name').focus(); return; }
            const rec = S.put('cats', { ...cur, name, icon: v('icon').value.trim(), area: v('area').value, life: v('life').value || null, order: cur.order ?? S.cats().length });
            result = rec.id;
            toast(isNew ? `Kategorie „${esc(name)}“ angelegt` : 'Kategorie gespeichert');
            close();
          }
          if (e.target.closest('[data-del]')) {
            const n = S.tasks(t => t.cat === cat.id).length + S.events(x => x.cat === cat.id).length;
            if (await confirmDialog(`„${esc(cat.name)}“ wird gelöscht.${n ? ` ${n} Einträge behalten ihren Inhalt, verlieren aber die Kategorie.` : ''}`, { ok: 'Löschen', danger: true, title: 'Kategorie löschen?', cooldown: 3 })) {
              for (const t of S.tasks(t => t.cat === cat.id)) S.put('tasks', { ...t, cat: null }, { silent: true });
              for (const x of S.events(x => x.cat === cat.id)) S.put('events', { ...x, cat: null }, { silent: true });
              S.remove('cats', cat.id);
              close();
            }
          }
        });
        v('name').addEventListener('keydown', e => { if (e.key === 'Enter') el.querySelector('[data-save]').click(); });
      },
      onClose: () => resolve(result),
    });
  });
}

/** Lebensbereich anlegen/bearbeiten */
export function editLife(life) {
  return new Promise(resolve => {
    const isNew = !life;
    const cur = life ? { ...life } : { name: '', icon: '', desc: '', color: '#1b4f72' };
    let result = null;
    const have = new Set(S.lifeAreas().map(l => C.norm(l.name)));
    const sugg = C.SUGGESTED_LIFE.filter(([n]) => !have.has(C.norm(n)));
    sheet({
      title: isNew ? 'Neuer Lebensbereich' : 'Lebensbereich bearbeiten', cls: 'sheet-sm',
      body: `${isNew && sugg.length ? `<div class="lbl" style="margin-bottom:6px">Vorschläge</div><div class="sugg">${sugg.map(([n, ic]) => `<button type="button" data-sugg="${esc(n)}" data-ic="${esc(ic)}">${esc(ic)} ${esc(n)}</button>`).join('')}</div>
          <button type="button" class="link-btn" data-all style="margin-top:8px">Alle Vorschläge auf einmal übernehmen</button><hr class="sep">` : ''}
        <div class="field"><label for="life-name">Name</label><input id="life-name" class="input" data-k="name" value="${esc(cur.name)}" placeholder="z. B. Gesundheit & Körper" autofocus></div>
        <div class="fgrid"><div class="field"><label for="life-icon">Symbol</label><input id="life-icon" class="input" data-k="icon" value="${esc(cur.icon || '')}" maxlength="4"></div><div></div></div>
        <div class="field"><label for="life-desc">Was bedeutet dieser Bereich für dich?</label><textarea id="life-desc" class="textarea" data-k="desc" rows="3">${esc(cur.desc || '')}</textarea></div>`,
      footer: `${!isNew ? `<div class="left"><button class="btn btn-ghost" data-del>${icon('trash', 15)}Löschen</button></div>` : ''}<button class="btn" data-close>Abbrechen</button><button class="btn btn-primary" data-save>${isNew ? 'Anlegen' : 'Speichern'}</button>`,
      onMount: (el, close) => {
        const v = k => el.querySelector(`[data-k="${k}"]`);
        el.addEventListener('click', async e => {
          const sg = e.target.closest('[data-sugg]');
          if (sg) { v('name').value = sg.dataset.sugg; v('icon').value = sg.dataset.ic; return; }
          if (e.target.closest('[data-all]')) {
            sugg.forEach(([n, ic], i) => S.put('life', { name: n, icon: ic, desc: '', ratings: [], order: S.lifeAreas().length + i }, { silent: true }));
            S.touch({ local: true, col: 'life', many: true });
            toast(`${sugg.length} Lebensbereiche angelegt`);
            result = 'many'; close(); return;
          }
          if (e.target.closest('[data-save]')) {
            const name = v('name').value.trim();
            if (!name) { v('name').focus(); return; }
            const rec = S.put('life', { ratings: [], ...cur, name, icon: v('icon').value.trim(), desc: v('desc').value, order: cur.order ?? S.lifeAreas().length });
            result = rec.id; toast(isNew ? 'Lebensbereich angelegt' : 'Gespeichert'); close();
          }
          if (e.target.closest('[data-del]')) {
            if (await confirmDialog(`„${esc(life.name)}“ wird gelöscht. Verknüpfte Ziele, Projekte und Kategorien bleiben erhalten.`, { ok: 'Löschen', danger: true, title: 'Lebensbereich löschen?', cooldown: 3 })) { S.remove('life', life.id); close(); }
          }
        });
      },
      onClose: () => resolve(result),
    });
  });
}

/** Für <select> mit Option „__new“: neue Kategorie anlegen und auswählen */
export async function handleNewOption(select, kind, area) {
  if (select.value !== '__new') return false;
  const prev = select.dataset.prev || '';
  const id = kind === 'life' ? await editLife(null) : await editCategory(null, { area });
  if (id && id !== 'many') {
    const rec = kind === 'life' ? S.get('life', id) : S.cat(id);
    const opt = document.createElement('option');
    opt.value = id; opt.textContent = rec ? rec.name : 'Neu';
    select.insertBefore(opt, select.querySelector('option[value="__new"]'));
    select.value = id;
  } else select.value = prev;
  select.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}
