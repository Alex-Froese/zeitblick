// Zeitblick – schlanke SVG-Diagramme (Balken, Heatmap, Anteilsbalken, Ring)
import { esc } from './ui.js';

function niceMax(v) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  const m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return m * p;
}
export function niceMin(v) {
  for (const m of [30, 60, 90, 120, 180, 240, 360, 480, 600, 720, 960, 1200, 1440]) if (v <= m) return m;
  return Math.ceil(v / 480) * 480;
}
function barPath(x, y, w, h, r = 4) {
  if (h <= 0) return '';
  r = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

/**
 * Säulendiagramm als HTML (skaliert sauber, Text bleibt lesbar). items: [{ label, v, tip }]
 */
export function columns(items, { height = 150, unit = '', color = 'var(--accent)', highlight = -1, fmt = v => String(v), ariaLabel = '', minMax = 4 } = {}) {
  const top = Math.max(minMax, ...items.map(i => i.v));
  const max = minMax >= 60 ? niceMin(top) : niceMax(top);
  const n = items.length || 1;
  const every = n > 16 && items.every(i => i.label) ? Math.ceil(n / 12) : 1;
  const ticks = [max, max / 2, 0];
  let bars = '', xs = '';
  items.forEach((it, i) => {
    const pct = Math.max(0, Math.min(100, (it.v / max) * 100));
    const hl = i === highlight;
    bars += `<div class="cb${hl ? ' hl' : ''}" data-tip="${esc(it.tip || `${it.label}: ${fmt(it.v)}${unit}`)}"><i style="height:${pct}%;background:${hl ? color : `color-mix(in srgb, ${color} 55%, var(--surface))`}"></i></div>`;
    xs += `<span>${i % every === 0 ? esc(it.label) : ''}</span>`;
  });
  return `<div class="cols" style="--h:${height}px" role="img" aria-label="${esc(ariaLabel)}">
    <div class="cols-y">${ticks.map((t, i) => `<span style="top:${i * 50}%">${esc(fmt(t))}</span>`).join('')}</div>
    <div class="cols-plot"><div class="cols-grid"><i></i><i></i><i></i></div><div class="cols-bars">${bars}</div><div class="cols-x">${xs}</div></div>
  </div>`;
}

/** Aktivitäts-Heatmap (Wochen als Spalten, Mo–So als Zeilen). days: [{ d: Date, v, key }] */
const MON = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
export function heatmap(days, { unit = 'Min', color = 'var(--accent)', label = '' } = {}) {
  if (!days.length) return '';
  const cell = 13, gap = 3, top = 16, left = 24;
  const first = days[0].d;
  const offset = (first.getDay() + 6) % 7;
  const cols = Math.ceil((days.length + offset) / 7);
  const W = cols * (cell + gap) + left, H = 7 * (cell + gap) + top + 2;
  const max = Math.max(1, ...days.map(d => d.v));
  const lvl = v => v <= 0 ? 0 : Math.min(4, 1 + Math.floor((v / max) * 3.999));
  const mix = [null, 28, 50, 74, 100];
  let s = `<div class="heat-wrap"><svg class="chart heat" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">`;
  ['Mo', '', 'Mi', '', 'Fr', '', ''].forEach((t, i) => { if (t) s += `<text class="tick" x="0" y="${top + i * (cell + gap) + 10}">${t}</text>`; });
  let lastM = -1;
  days.forEach((d, i) => {
    const idx = i + offset;
    const c = Math.floor(idx / 7), r = idx % 7;
    if (r === 0 || i === 0) {
      const m = d.d.getMonth();
      if (m !== lastM && (d.d.getDate() <= 7 || i === 0)) { if (c < cols - 1 || i === 0) s += `<text class="tick" x="${left + c * (cell + gap)}" y="10">${MON[m]}</text>`; lastM = m; }
    }
    const L = lvl(d.v);
    const fill = L === 0 ? 'var(--surface-3)' : `color-mix(in srgb, ${color} ${mix[L]}%, var(--surface))`;
    s += `<rect x="${left + c * (cell + gap)}" y="${top + r * (cell + gap)}" width="${cell}" height="${cell}" rx="3" style="fill:${fill}" data-tip="${esc(`${d.d.getDate()}.${d.d.getMonth() + 1}.: ${d.v} ${unit}`)}"/>`;
  });
  s += `</svg></div>`;
  return s;
}

/** 100%-Anteilsbalken mit Legende. segs: [{ label, v, color }] */
export function shareBar(segs, { unit = '', legend = true } = {}) {
  const total = segs.reduce((a, s) => a + s.v, 0);
  if (!total) return `<div class="share-empty">Noch keine Daten</div>`;
  let bar = `<div class="share">`;
  for (const s of segs) {
    if (!s.v) continue;
    bar += `<span style="flex:${s.v};background:${s.color}" data-tip="${esc(`${s.label}: ${s.v}${unit} (${Math.round(s.v / total * 100)} %)`)}"></span>`;
  }
  bar += `</div>`;
  if (legend) {
    bar += `<ul class="legend">`;
    for (const s of segs) { if (!s.v) continue; bar += `<li><i style="background:${s.color}"></i>${esc(s.label)}<b>${s.v}${unit}</b></li>`; }
    bar += `</ul>`;
  }
  return bar;
}

/** Fortschrittsring */
export function ring(p, { size = 64, stroke = 7, color = 'var(--accent)', track = 'var(--surface-3)', label = '' } = {}) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, p || 0));
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(label)}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${track}" stroke-width="${stroke}"/>
    <circle class="ring-val" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - v)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
  </svg>`;
}

const C_fmt = v => { v = Math.round(v); return v < 60 ? `${v}m` : `${Math.floor(v / 60)}h${v % 60 ? ' ' + (v % 60) + 'm' : ''}`; };
/** 24-Stunden-Verteilung (wann wird fokussiert) */
export function hours24(mins, { color = 'var(--accent)' } = {}) {
  const items = mins.map((v, h) => ({ label: h % 6 === 0 ? String(h) : '', v: Math.round(v), tip: `${h}–${h + 1} Uhr: ${Math.round(v)} Min` }));
  return columns(items, { height: 120, unit: ' Min', color, fmt: v => C_fmt(v), minMax: 60, ariaLabel: 'Fokus nach Tageszeit' });
}
