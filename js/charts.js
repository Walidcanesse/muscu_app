// Petits graphiques SVG faits main (pas de bibliothèque).
import { fmt } from './ui.js';

function smoothPath(pts) {
  if (pts.length < 2) return '';
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const cx = (x0 + x1) / 2;
    d += ` C${cx},${y0} ${cx},${y1} ${x1},${y1}`;
  }
  return d;
}

function pathLength(pts) {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return Math.ceil(l * 1.25);
}

/** Courbe de progression avec étiquettes min / max. */
export function lineChart(values, { color = 'var(--green)', w = 320, h = 150, labels = [], decimals = 0 } = {}) {
  if (!values.length) return '';
  const pad = { t: 18, b: 22, l: 6, r: 6 };
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const n = values.length;
  const pts = values.map((v, i) => [
    pad.l + (n === 1 ? (w - pad.l - pad.r) / 2 : (i * (w - pad.l - pad.r)) / (n - 1)),
    pad.t + (1 - (v - min) / span) * (h - pad.t - pad.b),
  ]);
  const line = smoothPath(pts);
  const area = n > 1 ? `${line} L${pts[n - 1][0]},${h - pad.b} L${pts[0][0]},${h - pad.b} Z` : '';
  const len = pathLength(pts);
  const gid = 'g' + Math.random().toString(36).slice(2, 7);
  const last = pts[n - 1];
  const grid = [0, 0.5, 1].map((k) => {
    const y = pad.t + k * (h - pad.t - pad.b);
    return `<line x1="0" x2="${w}" y1="${y}" y2="${y}" stroke="rgba(255,255,255,0.06)" stroke-dasharray="2 4"/>`;
  }).join('');
  const lab = (i, anchor) => labels[i] ? `<text x="${pts[i][0]}" y="${h - 4}" fill="var(--chalk-3)" font-size="11" text-anchor="${anchor}" font-family="-apple-system, system-ui">${labels[i]}</text>` : '';
  return `
  <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img">
    <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${color}" stop-opacity="0.28"/><stop offset="1" stop-color="${color}" stop-opacity="0"/>
    </linearGradient></defs>
    ${grid}
    <text x="0" y="${pad.t - 6}" fill="var(--chalk-3)" font-size="11" text-anchor="start" font-family="-apple-system, system-ui">max ${fmt(max, decimals)}</text>
    ${area ? `<path d="${area}" fill="url(#${gid})"/>` : ''}
    ${n > 1 ? `<path class="path" d="${line}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" style="--len:${len}" vector-effect="non-scaling-stroke"/>` : ''}
    ${pts.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="${i === n - 1 ? 4.5 : 2.5}" fill="${i === n - 1 ? color : 'var(--iron-2)'}" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke"/>`).join('')}
    ${lab(0, 'start')}${n > 1 ? lab(n - 1, 'end') : ''}
  </svg>`;
}

/** Mini-courbe de poids (les jours sans pesée sont sautés). */
export function sparkline(values, { w = 320, h = 54, color = 'var(--chalk-2)' } = {}) {
  const first = values.findIndex((v) => v != null);
  if (first > 0) values = values.slice(first);
  const pts0 = values.map((v, i) => [i, v]).filter(([, v]) => v != null);
  if (pts0.length < 2) return '';
  const ys = pts0.map(([, v]) => v);
  const min = Math.min(...ys) - 0.2, max = Math.max(...ys) + 0.2;
  const n = values.length;
  const pts = pts0.map(([i, v]) => [4 + (i * (w - 8)) / (n - 1), 4 + (1 - (v - min) / (max - min)) * (h - 8)]);
  const line = smoothPath(pts);
  const len = pathLength(pts);
  const last = pts[pts.length - 1];
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="width:100%;height:${h}px">
    <path class="path" d="${line}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" style="--len:${len}" vector-effect="non-scaling-stroke"/>
    <circle cx="${last[0]}" cy="${last[1]}" r="3.5" fill="var(--green)" />
  </svg>`;
}
