// Fiches technique : mannequin animé (vue de côté ou de face), vue subjective et points clés.
import { esc, openSheet, icons } from './ui.js';

/* ================= Outils géométriques ================= */
const rad = (d) => (d * Math.PI) / 180;
const polar = (len, deg) => [len * Math.cos(rad(deg)), -len * Math.sin(rad(deg))];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Cinématique inverse à deux segments : renvoie [articulation, extrémité]. */
function ik(P, T, a, b, bend) {
  const dx = T[0] - P[0], dy = T[1] - P[1];
  const d = Math.min(a + b - 0.05, Math.max(Math.abs(a - b) + 0.1, Math.hypot(dx, dy)));
  const base = Math.atan2(dy, dx);
  const A = Math.acos(Math.min(1, Math.max(-1, (a * a + d * d - b * b) / (2 * a * d))));
  const ang = base + bend * A;
  return [[P[0] + a * Math.cos(ang), P[1] + a * Math.sin(ang)], [P[0] + d * Math.cos(base), P[1] + d * Math.sin(base)]];
}

/** Interpole récursivement deux poses (nombres, tableaux, objets). */
function mix(a, b, t) {
  if (typeof a === 'number') return lerp(a, b, t);
  if (Array.isArray(a)) return a.map((v, i) => mix(v, b[i], t));
  if (a && typeof a === 'object') {
    const o = {};
    for (const k in a) o[k] = k in b ? mix(a[k], b[k], t) : a[k];
    return o;
  }
  return t < 0.5 ? a : b;
}

const L = { torso: 48, neck: 15, ua: 27, fa: 25, th: 37, sh: 35, foot: 11 };
const NEAR = '#ECECEF', FAR = '#5E5E68', PROP = '#3C3C44', PROP_2 = '#26262C', FLOOR = '#2A2A30', CUE = '#34D17A';

function limb(from, spec, l1, l2) {
  if (spec.ik) {
    const [mid, end] = ik(from, spec.ik, l1, l2, spec.bend);
    return [mid, end];
  }
  const mid = add(from, polar(l1, spec.u));
  return [mid, add(mid, polar(l2, spec.f))];
}

/* ---------- Mannequin de profil ---------- */
function solveSide(p, def) {
  const J = {};
  J.hip = [p.hip[0], p.hip[1]];
  J.sho = add(J.hip, polar(L.torso, p.torso));
  J.head = add(J.sho, polar(L.neck, p.torso + (p.neck || 0)));
  [J.elb1, J.wri1] = limb(J.sho, p.a1, L.ua, L.fa);
  [J.elb2, J.wri2] = limb(J.sho, p.a2 || p.a1, L.ua, L.fa);
  [J.kne1, J.ank1] = limb(J.hip, p.l1, L.th, L.sh);
  [J.kne2, J.ank2] = limb(J.hip, p.l2 || p.l1, L.th, L.sh);
  const footDir = (k, kn, an) => (p[k] ?? Math.atan2(-(an[1] - kn[1]), an[0] - kn[0]) * 180 / Math.PI + 90);
  J.toe1 = add(J.ank1, polar(L.foot, footDir('f1', J.kne1, J.ank1)));
  J.toe2 = add(J.ank2, polar(L.foot, footDir('f2', J.kne2, J.ank2)));
  if (def.anchor) {
    const [jn, at] = def.anchor;
    const dx = at[0] - J[jn][0], dy = at[1] - J[jn][1];
    for (const k in J) J[k] = [J[k][0] + dx, J[k][1] + dy];
  }
  return J;
}

const seg = (a, b, w, c) => `<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>`;
const dot = (p, r, c, extra = '') => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${r}" fill="${c}" ${extra}/>`;

function drawSide(J, p) {
  const far = seg(J.hip, J.kne2, 10, FAR) + seg(J.kne2, J.ank2, 9, FAR) + seg(J.ank2, J.toe2, 7, FAR)
    + seg(J.sho, J.elb2, 9, FAR) + seg(J.elb2, J.wri2, 8, FAR);
  const torso = seg(J.hip, J.sho, 17, NEAR);
  const neck = seg(J.sho, add(J.sho, polar(7, p.torso + (p.neck || 0))), 8, NEAR);
  const head = dot(J.head, 9.5, NEAR);
  const near = seg(J.hip, J.kne1, 11, NEAR) + seg(J.kne1, J.ank1, 10, NEAR) + seg(J.ank1, J.toe1, 8, NEAR)
    + seg(J.sho, J.elb1, 10, NEAR) + seg(J.elb1, J.wri1, 9, NEAR) + dot(J.wri1, 5, NEAR);
  return { far, body: torso + neck + head, near };
}

/* ---------- Mannequin de face ---------- */
function solveFront(p) {
  const J = {};
  const k = p.k || 0;
  J.hip = [p.hip[0], p.hip[1]];
  J.sc = [J.hip[0] + (p.lean || 0) * k, J.hip[1] - (p.tl || L.torso)];
  const hw = 15 * (1 - 0.45 * Math.abs(k));
  J.shR = [J.sc[0] + hw, J.sc[1]];
  J.shL = [J.sc[0] - hw, J.sc[1]];
  J.head = [J.sc[0] + k * 3, J.sc[1] - 16];
  J.hipR = [J.hip[0] + 8, J.hip[1]];
  J.hipL = [J.hip[0] - 8, J.hip[1]];
  const mirror = (s) => (s.ik ? { ik: [2 * J.sc[0] - s.ik[0], s.ik[1]], bend: -s.bend } : { u: 180 - s.u, f: 180 - s.f });
  [J.elbR, J.wriR] = limb(J.shR, p.aR, L.ua, L.fa);
  [J.elbL, J.wriL] = limb(J.shL, p.aL || mirror(p.aR), L.ua, L.fa);
  if (p.legs === 'seated') {
    J.kneR = [J.hip[0] + 12, J.hip[1] - 22]; J.kneL = [J.hip[0] - 12, J.hip[1] - 22];
    J.ankR = [J.hip[0] + 15, J.hip[1] + 4]; J.ankL = [J.hip[0] - 15, J.hip[1] + 4];
  } else {
    [J.kneR, J.ankR] = limb(J.hipR, { u: -88, f: -90 }, L.th, L.sh);
    [J.kneL, J.ankL] = limb(J.hipL, { u: -92, f: -90 }, L.th, L.sh);
  }
  return J;
}

function drawFront(J, p) {
  let s = '';
  // jambes
  if (p.legs === 'seated') {
    s += seg(J.hipL, J.kneL, 11, FAR) + seg(J.kneL, J.ankL, 10, FAR) + seg(J.hipR, J.kneR, 11, FAR) + seg(J.kneR, J.ankR, 10, FAR);
  } else {
    s += seg(J.hipL, J.kneL, 11, NEAR) + seg(J.kneL, J.ankL, 10, NEAR) + seg(J.hipR, J.kneR, 11, NEAR) + seg(J.kneR, J.ankR, 10, NEAR);
    s += seg(J.ankL, add(J.ankL, [-7, 0]), 7, NEAR) + seg(J.ankR, add(J.ankR, [7, 0]), 7, NEAR);
  }
  // buste : trapèze arrondi
  s += `<path d="M${J.shL[0]},${J.shL[1]} L${J.shR[0]},${J.shR[1]} L${J.hipR[0]},${J.hipR[1]} L${J.hipL[0]},${J.hipL[1]} Z" fill="${NEAR}" stroke="${NEAR}" stroke-width="10" stroke-linejoin="round"/>`;
  s += seg(J.sc, J.head, 8, NEAR) + dot(J.head, 9.5, NEAR);
  s += seg(J.shL, J.elbL, 10, NEAR) + seg(J.elbL, J.wriL, 9, NEAR) + seg(J.shR, J.elbR, 10, NEAR) + seg(J.elbR, J.wriR, 9, NEAR);
  return s;
}

/* ---------- Repères des points clés ---------- */
function tag(x, y, text, anchor = 'middle') {
  if (!text) return '';
  const w = text.length * 5.1 + 10;
  let left = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w + 5 : x - 5;
  left = Math.max(3, Math.min(237 - w, left));
  const cx = left + w / 2;
  return `<rect x="${left.toFixed(1)}" y="${(y - 11).toFixed(1)}" width="${w.toFixed(1)}" height="15" rx="7.5" fill="rgba(0,0,0,.72)"/>
    <text x="${cx.toFixed(1)}" y="${(y).toFixed(1)}" text-anchor="middle" fill="${CUE}" font-size="9.5" font-weight="700" font-family="ui-rounded, 'SF Pro Rounded', Nunito, system-ui">${esc(text)}</text>`;
}

function markers(J, list, tf = (p) => p, t = 0) {
  return list.map(({ at, text, dx = 0, dy = -24, anchor = 'middle', from = 0, to = 1 }) => {
    if (t < from || t > to) return '';
    const raw = typeof at === 'function' ? at(J) : J[at];
    if (!raw) return '';
    const p = tf(raw);
    const q = [p[0] + dx, p[1] + dy];
    return `<g class="mk">${seg(p, q, 1, 'rgba(52,209,122,.6)')}${dot(p, 3.4, CUE)}${tag(q[0], q[1] - 2, text, anchor)}</g>`;
  }).join('');
}

const floor = (y = 172) => `<line x1="0" x2="240" y1="${y}" y2="${y}" stroke="${FLOOR}" stroke-width="2"/>`;
const bench = (x1, x2, top, legs = true) => `<rect x="${x1}" y="${top}" width="${x2 - x1}" height="9" rx="4.5" fill="${PROP}"/>`
  + (legs ? `<rect x="${x1 + 10}" y="${top + 9}" width="6" height="${172 - top - 9}" fill="${PROP_2}"/><rect x="${x2 - 16}" y="${top + 9}" width="6" height="${172 - top - 9}" fill="${PROP_2}"/>` : '');
const plate = (p, r) => `<circle cx="${p[0]}" cy="${p[1]}" r="${r}" fill="${PROP_2}" stroke="${PROP}" stroke-width="2.5"/><circle cx="${p[0]}" cy="${p[1]}" r="${r * 0.28}" fill="${PROP}"/>`;
const dumbbellEnd = (p) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="7" fill="${PROP_2}" stroke="${PROP}" stroke-width="2.5"/>`;

/* ================= Vues subjectives (« ta vue ») ================= */
const povFrame = (inner) => `<defs><radialGradient id="vig" cx="50%" cy="50%" r="70%"><stop offset="60%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity=".85"/></radialGradient></defs>${inner}<rect width="240" height="190" fill="url(#vig)"/>`;
const label = (x, y, text, anchor = 'middle') => tag(x, y, text, anchor);
const guide = (x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${CUE}" stroke-width="1.2" stroke-dasharray="3 4" opacity=".7"/>`;
const capsule = (a, b, w, c) => seg(a, b, w, c);
const hand = (x, y, s = 1, palm = true) => `<g transform="translate(${x} ${y}) scale(${s})">
  <rect x="-11" y="-6" width="22" height="16" rx="7" fill="${NEAR}"/>${palm ? '<path d="M-6 -2 v6 M0 -3 v7 M6 -2 v6" stroke="#B9B9C0" stroke-width="1.5" stroke-linecap="round"/>' : ''}</g>`;

const POV = {
  tractions(t) {
    const by = lerp(34, 120, t);
    const wall = lerp(150, 215, t);
    return povFrame(`
      <rect width="240" height="190" fill="#0B0B0E"/>
      <line x1="0" x2="240" y1="${wall}" y2="${wall}" stroke="${FLOOR}" stroke-width="2"/>
      ${seg([10, by], [230, by], 7, PROP)}
      ${capsule([84, by + 4], [64, 200], 15, NEAR)}${capsule([156, by + 4], [176, 200], 15, NEAR)}
      ${hand(84, by - 1)}${hand(156, by - 1)}
      ${guide(84, by - 22, 156, by - 22)}${label(120, by - 27, 'Paumes vers toi, largeur d\'épaules')}
      ${t > 0.7 ? label(120, by + 30, 'Poitrine vers la barre') : ''}`);
  },
  dc(t) {
    // t = 0 : bras tendus (barre loin), t = 1 : barre sur la poitrine (proche)
    const s = lerp(0.72, 1.12, t);
    const y = lerp(70, 112, t);
    const hx = 46 * s;
    const bar = `${seg([120 - 112 * s, y], [120 + 112 * s, y], 5 * s, '#5A5A62')}
      <rect x="${120 - 106 * s}" y="${y - 22 * s}" width="${9 * s}" height="${44 * s}" rx="${3 * s}" fill="${PROP}"/>
      <rect x="${120 + 97 * s}" y="${y - 22 * s}" width="${9 * s}" height="${44 * s}" rx="${3 * s}" fill="${PROP}"/>`;
    return povFrame(`
      <rect width="240" height="190" fill="#0B0B0E"/>
      ${[40, 95, 150].map((x) => `<rect x="${x}" y="8" width="50" height="5" rx="2.5" fill="#1A1A20"/>`).join('')}
      ${bar}
      ${capsule([120 - hx, y + 6], [lerp(70, 34, t), 200], 16, NEAR)}${capsule([120 + hx, y + 6], [lerp(170, 206, t), 200], 16, NEAR)}
      ${hand(120 - hx, y, s, false)}${hand(120 + hx, y, s, false)}
      ${label(120, y - 30 * s, t < 0.5 ? 'Barre au-dessus des épaules' : 'Descends vers le bas des pecs')}
      ${label(120, 182, 'Poignets droits, au-dessus des coudes')}`);
  },
  fentes(t) {
    // Vue plongeante sur la jambe avant : le genou avance au-dessus du pied, dans son axe
    const ky = lerp(156, 118, t);
    const ks = lerp(1, 1.12, t);
    return povFrame(`
      <rect width="240" height="190" fill="#0B0B0E"/>
      ${[-60, -20, 20, 60].map((d) => `<line x1="${120 + d * 0.4}" y1="30" x2="${120 + d * 2.2}" y2="190" stroke="#16161B" stroke-width="1.5"/>`).join('')}
      <line x1="0" x2="240" y1="30" y2="30" stroke="${FLOOR}" stroke-width="2"/>
      <path d="M108 104 Q106 66 120 56 Q134 66 132 104 Q131 114 120 114 Q109 114 108 104 Z" fill="#8E8E96"/>
      ${capsule([120, ky], [120, 104], 20 * ks, '#A9A9B1')}
      ${guide(120, 40, 120, 190)}
      ${capsule([120, 200], [120, ky], 30 * ks, '#D9D9DE')}
      ${dot([120, ky], 16 * ks, NEAR)}
      ${label(120, 24, 'Genou dans l\'axe du pied')}
      ${t > 0.6 ? label(176, ky + 4, 'Talon collé au sol') : ''}`);
  },
  lat(t) {
    const hy = lerp(186, 92, t);
    const ex = lerp(30, 6, t);
    return povFrame(`
      <rect width="240" height="190" fill="#0B0B0E"/>
      ${guide(0, 88, 240, 88)}${label(120, 80, 'Stop à hauteur d\'épaules')}
      ${capsule([lerp(70, 40, t), 200], [ex + 14, hy], 16, NEAR)}${capsule([lerp(170, 200, t), 200], [240 - ex - 14, hy], 16, NEAR)}
      <rect x="${ex}" y="${hy - 8}" width="28" height="16" rx="6" fill="${PROP}"/><rect x="${240 - ex - 28}" y="${hy - 8}" width="28" height="16" rx="6" fill="${PROP}"/>
      ${label(120, 176, 'Mène avec les coudes, épaules basses')}`);
  },
  toeTouch(t) {
    const hy = lerp(150, 70, t);
    return povFrame(`
      <rect width="240" height="190" fill="#0B0B0E"/>
      ${capsule([104, 200], [110, 22], 22, '#C9C9CF')}${capsule([136, 200], [130, 22], 22, '#C9C9CF')}
      <ellipse cx="110" cy="18" rx="12" ry="9" fill="${NEAR}"/><ellipse cx="130" cy="18" rx="12" ry="9" fill="${NEAR}"/>
      ${capsule([60, 200], [108, hy], 14, NEAR)}${capsule([180, 200], [132, hy], 14, NEAR)}
      <circle cx="120" cy="${hy - 6}" r="16" fill="${PROP_2}" stroke="${PROP}" stroke-width="3"/>
      ${label(120, 186, 'Regarde tes pieds, monte vers eux')}`);
  },
  reverse(t) {
    const ky = lerp(186, 100, t);
    const ks = lerp(0.9, 1.35, t);
    return povFrame(`
      <rect width="240" height="190" fill="#0B0B0E"/>
      ${[40, 95, 150].map((x) => `<rect x="${x}" y="8" width="50" height="5" rx="2.5" fill="#1A1A20"/>`).join('')}
      ${dot([100, ky], 18 * ks, NEAR)}${dot([140, ky], 18 * ks, NEAR)}
      ${capsule([100, ky], [96, ky - 50 * ks], 18 * ks, '#C9C9CF')}${capsule([140, ky], [144, ky - 50 * ks], 18 * ks, '#C9C9CF')}
      ${label(120, 30, t > 0.5 ? 'Les fesses décollent' : 'Genoux vers la poitrine')}`);
  },
  twist(t) {
    const k = lerp(-1, 1, t);
    const x = 120 + 70 * k;
    return povFrame(`
      <rect width="240" height="190" fill="#0B0B0E"/>
      <g transform="rotate(${-6 * k} 120 95)"><line x1="-40" x2="280" y1="70" y2="70" stroke="${FLOOR}" stroke-width="2"/></g>
      ${dot([96, 176], 20, '#C9C9CF')}${dot([144, 176], 20, '#C9C9CF')}
      ${capsule([60, 200], [x - 10, 118], 15, NEAR)}${capsule([180, 200], [x + 10, 118], 15, NEAR)}
      <circle cx="${x}" cy="112" r="17" fill="${PROP_2}" stroke="${PROP}" stroke-width="3"/>
      ${label(120, 40, 'Suis le poids des yeux, les épaules tournent')}`);
  },
  hollow(t) {
    const b = Math.sin(t * Math.PI) * 3;
    return povFrame(`
      <rect width="240" height="190" fill="#0B0B0E"/>
      ${[40, 95, 150].map((x) => `<rect x="${x}" y="8" width="50" height="5" rx="2.5" fill="#1A1A20"/>`).join('')}
      ${capsule([106, 200], [114, 60 + b], 22, '#C9C9CF')}${capsule([134, 200], [126, 60 + b], 22, '#C9C9CF')}
      <ellipse cx="114" cy="${54 + b}" rx="11" ry="8" fill="${NEAR}"/><ellipse cx="126" cy="${54 + b}" rx="11" ry="8" fill="${NEAR}"/>
      ${label(120, 34, 'Pieds bas mais décollés, jambes serrées')}
      ${label(120, 182, 'Bas du dos plaqué au sol')}`);
  },
};


/* ================= Vues de dos ================= */
const BACK = {
  tractions(t) {
    const f = { s: 0.8, x: 24, y: 6 };
    const T = (q) => [f.x + f.s * q[0], f.y + f.s * q[1]];
    const hipY = lerp(132, 84, t);
    const sc = [120, hipY - 48];
    const shR = [135, sc[1]], shL = [105, sc[1]];
    const gripR = [142, 24], gripL = [98, 24];
    const [elbR, wriR] = ik(shR, gripR, L.ua, L.fa, 1);
    const [elbL, wriL] = ik(shL, gripL, L.ua, L.fa, -1);
    const hipR = [128, hipY], hipL = [112, hipY];
    // omoplates : descendent et se rapprochent en haut
    const bY = sc[1] + lerp(8, 13, t), bX = lerp(9, 6, t);
    const scene = `
      <rect x="40" y="21" width="160" height="6" rx="3" fill="${PROP}"/><rect x="40" y="0" width="5" height="22" fill="${PROP_2}"/><rect x="195" y="0" width="5" height="22" fill="${PROP_2}"/>
      ${seg(hipL, [hipL[0] - 2, hipY + 37], 11, NEAR)}${seg([hipL[0] - 2, hipY + 37], [hipL[0] - 1, hipY + 70], 10, NEAR)}
      ${seg(hipR, [hipR[0] + 2, hipY + 37], 11, NEAR)}${seg([hipR[0] + 2, hipY + 37], [hipR[0] + 1, hipY + 70], 10, NEAR)}
      <path d="M${shL[0] - 3},${shL[1]} L${shR[0] + 3},${shR[1]} L${hipR[0]},${hipY} L${hipL[0]},${hipY} Z" fill="${NEAR}" stroke="${NEAR}" stroke-width="10" stroke-linejoin="round"/>
      ${seg([120, sc[1] + 4], [120, hipY - 2], 1.6, '#A8A8B0')}
      <ellipse cx="${120 - bX}" cy="${bY}" rx="5" ry="8" fill="none" stroke="#A8A8B0" stroke-width="1.6"/>
      <ellipse cx="${120 + bX}" cy="${bY}" rx="5" ry="8" fill="none" stroke="#A8A8B0" stroke-width="1.6"/>
      ${seg(sc, [120, sc[1] - 16], 8, NEAR)}${dot([120, sc[1] - 16], 9.5, NEAR)}
      ${seg(shL, elbL, 10, NEAR)}${seg(elbL, wriL, 9, NEAR)}${seg(shR, elbR, 10, NEAR)}${seg(elbR, wriR, 9, NEAR)}`;
    const mk = (pt, text, dx, dy, from = 0, anchor = 'middle') => (t < from ? '' : `${seg(T(pt), [T(pt)[0] + dx, T(pt)[1] + dy], 1, 'rgba(52,209,122,.6)')}${dot(T(pt), 3.4, CUE)}${tag(T(pt)[0] + dx, T(pt)[1] + dy - 2, text, anchor)}`);
    return `${floor(182)}<g transform="translate(${f.x} ${f.y}) scale(${f.s})">${scene}</g>
      ${mk([120 + bX, bY], 'Omoplates vers le bas', 48, 26, 0, 'start')}
      ${mk(elbL, 'Coudes vers les côtes', -30, 20, 0.35, 'end')}`;
  },
  dc(t) {
    // Vue depuis la tête du banc : la barre, les avant-bras et la largeur de prise
    const barY = lerp(72, 108, t);
    const shR = [142, 124], shL = [98, 124];
    const hR = [156, barY], hL = [84, barY];
    const eR = [hR[0] + lerp(0, 2, t), barY + 25], eL = [hL[0] - lerp(0, 2, t), barY + 25];
    const scene = `
      ${floor()}
      <rect x="104" y="138" width="32" height="9" rx="4.5" fill="${PROP}"/><rect x="116" y="147" width="8" height="25" fill="${PROP_2}"/>
      <ellipse cx="120" cy="${118}" rx="27" ry="16" fill="#C9C9CF"/>
      ${seg(shL, eL, 10, NEAR)}${seg(shR, eR, 10, NEAR)}
      ${seg(eL, hL, 9, NEAR)}${seg(eR, hR, 9, NEAR)}
      ${seg([28, barY], [212, barY], 4, '#5A5A62')}
      <rect x="30" y="${barY - 23}" width="10" height="46" rx="3" fill="${PROP}"/><rect x="200" y="${barY - 23}" width="10" height="46" rx="3" fill="${PROP}"/>
      ${dot(hL, 5.5, NEAR)}${dot(hR, 5.5, NEAR)}
      ${dot([120, 134], 10.5, NEAR)}`;
    const midF = [eR[0], (eR[1] + hR[1]) / 2];
    return `${scene}
      ${guide(hR[0], barY - 34, hR[0], barY + 40)}
      ${seg(midF, [midF[0] + 26, midF[1] + 34], 1, 'rgba(52,209,122,.6)')}${dot(midF, 3.4, CUE)}${tag(midF[0] + 26, midF[1] + 34, 'Avant-bras verticaux', 'start')}
      ${tag(120, Math.max(18, barY - 36), 'Prise un peu plus large que les épaules')}`;
  },
};

/* ================= Bibliothèque d'exercices ================= */
const BAR = [128, 26];
const LIB = {
  tractions: {
    name: 'Tractions supination',
    side: {
      title: 'De côté',
      fit: { s: 0.8, x: 22, y: 8 },
      noFloor: true,
      props: () => `<rect x="70" y="${BAR[1] - 3}" width="120" height="6" rx="3" fill="${PROP}"/><rect x="186" y="0" width="5" height="26" fill="${PROP_2}"/><rect x="69" y="0" width="5" height="26" fill="${PROP_2}"/>`,
      A: { hip: [130, 129], torso: 96, a1: { ik: BAR, bend: 1 }, l1: { u: -97, f: -118 }, l2: { u: -92, f: -112 } },
      B: { hip: [125, 80], torso: 102, a1: { ik: BAR, bend: 1 }, l1: { u: -97, f: -118 }, l2: { u: -92, f: -112 } },
      marks: [{ at: 'elb1', text: 'Coudes vers les hanches', dx: 30, dy: 24, anchor: 'start' }, { at: 'head', text: 'Menton au-dessus', dx: -40, dy: 4, anchor: 'end', from: 0.75 }],
    },
    pov: POV.tractions,
    back: BACK.tractions,
    seq: [{ to: 1, dur: 1100, label: 'Monte en tirant les coudes' }, { hold: 400, label: 'Menton au-dessus de la barre' }, { to: 0, dur: 2300, label: 'Descends lentement' }, { hold: 500, label: 'Bras tendus, épaules engagées' }],
    tips: [
      'Prise paumes vers toi, mains à largeur d\'épaules.',
      'Pars bras tendus, puis tire d\'abord les épaules vers le bas avant de plier les bras.',
      'Monte en tirant les coudes vers les hanches, poitrine vers la barre, jusqu\'au menton au-dessus.',
      'Redescends en 2 à 3 secondes jusqu\'aux bras tendus.',
      'Jambes serrées et abdos gainés : aucun élan.',
    ],
    mistakes: ['Demi-répétitions, sans tendre les bras en bas.', 'Balancer les jambes pour monter.', 'Tendre le cou pour passer le menton.'],
  },
  dc: {
    name: 'Développé couché',
    side: {
      title: 'De côté',
      props: (J) => bench(58, 168, 116) + plate(J.wri1.map((v) => +v.toFixed(1)), 17),
      propsFront: () => '',
      A: { hip: [152, 107], torso: 180, neck: 0, a1: { ik: [106, 52], bend: 1 }, l1: { ik: [186, 166], bend: -1 }, l2: { ik: [180, 166], bend: -1 }, f1: 0, f2: 0 },
      B: { hip: [152, 107], torso: 180, neck: 0, a1: { ik: [116, 95], bend: 1 }, l1: { ik: [186, 166], bend: -1 }, l2: { ik: [180, 166], bend: -1 }, f1: 0, f2: 0 },
      marks: [{ at: 'sho', text: 'Omoplates serrées', dx: -6, dy: 40 }, { at: 'wri1', text: 'Bas des pecs', dx: 36, dy: -8, anchor: 'start', from: 0.7 }],
    },
    pov: POV.dc,
    back: BACK.dc,
    seq: [{ hold: 400, label: 'Bras tendus, barre au-dessus des épaules' }, { to: 1, dur: 1800, label: 'Descends en contrôlant' }, { hold: 250, label: 'Touche légèrement la poitrine' }, { to: 0, dur: 1000, label: 'Pousse' }],
    tips: [
      'Yeux sous la barre, omoplates serrées et basses, fesses sur le banc, pieds bien à plat.',
      'Prise un peu plus large que les épaules, poignets droits au-dessus des coudes.',
      'Descends vers le bas des pectoraux, coudes à environ 45° du buste, pas à 90°.',
      'Touche la poitrine sans rebondir, puis pousse vers le haut et légèrement vers tes épaules.',
      'Sans pareur : mets les barres de sécurité et arrête-toi une répétition avant l\'échec.',
    ],
    mistakes: ['Coudes écartés à 90° (mauvais pour les épaules).', 'Fesses qui décollent du banc.', 'Faire rebondir la barre sur la poitrine.'],
  },
  fentes: {
    name: 'Fentes bulgares',
    side: {
      title: 'De côté',
      props: () => bench(14, 70, 136),
      A: { hip: [114, 103], torso: 82, a1: { u: -94, f: -92 }, a2: { u: -88, f: -90 }, l1: { ik: [150, 165], bend: -1 }, l2: { ik: [52, 129], bend: -1 }, f1: 0, f2: 180 },
      B: { hip: [106, 128], torso: 76, a1: { u: -100, f: -96 }, a2: { u: -92, f: -92 }, l1: { ik: [150, 165], bend: -1 }, l2: { ik: [52, 129], bend: -1 }, f1: 0, f2: 180 },
      after: (J) => dumbbellEnd(J.wri1),
      marks: [{ at: 'kne1', text: 'Genou au-dessus du pied', dx: 22, dy: -30, anchor: 'start' }, { at: 'hip', text: 'Descends à la verticale', dx: -10, dy: -78 }],
    },
    pov: POV.fentes,
    seq: [{ hold: 400, label: 'Debout, poids sur le pied avant' }, { to: 1, dur: 1600, label: 'Descends à la verticale' }, { hold: 300, label: 'Cuisse avant presque parallèle au sol' }, { to: 0, dur: 1100, label: 'Pousse dans le talon avant' }],
    tips: [
      'Dessus du pied arrière posé sur le banc, pied avant assez loin pour que le genou arrière descende près du sol.',
      'Descends à la verticale jusqu\'à avoir la cuisse avant presque parallèle au sol.',
      'Genou avant dans l\'axe des orteils, sans rentrer vers l\'intérieur. Talon collé au sol.',
      'Pousse dans le talon et le milieu du pied avant : la jambe arrière sert juste à l\'équilibre.',
      'Buste un peu penché en avant pour les fessiers, plus droit pour les quadriceps. Tiens un support si tu manques d\'équilibre.',
    ],
    mistakes: ['Pied avant trop près du banc (genou qui part très loin devant).', 'Genou avant qui rentre vers l\'intérieur.', 'Pousser avec la jambe arrière.'],
  },
  lat: {
    name: 'Élévations latérales',
    side: {
      title: 'De face',
      front: true,
      A: { hip: [120, 100], aR: { u: -80, f: -86 } },
      B: { hip: [120, 100], aR: { u: -2, f: -14 } },
      after: (J) => `<rect x="${(J.wriR[0] - 6).toFixed(1)}" y="${(J.wriR[1] - 6).toFixed(1)}" width="12" height="12" rx="4" fill="${PROP}"/><rect x="${(J.wriL[0] - 6).toFixed(1)}" y="${(J.wriL[1] - 6).toFixed(1)}" width="12" height="12" rx="4" fill="${PROP}"/>`,
      marks: [{ at: 'elbR', text: 'Jusqu\'aux épaules', dx: 8, dy: -40, anchor: 'middle' }, { at: (J) => [J.shL[0] + 3, J.shL[1] - 2], text: 'Épaules basses', dx: -20, dy: -30, anchor: 'end' }],
    },
    pov: POV.lat,
    seq: [{ to: 1, dur: 1000, label: 'Monte sur les côtés' }, { hold: 300, label: 'Bras à hauteur d\'épaules' }, { to: 0, dur: 2000, label: 'Redescends en 2 secondes' }, { hold: 400, label: '' }],
    tips: [
      'Debout, buste très légèrement penché en avant, coudes un peu fléchis.',
      'Monte les bras sur les côtés jusqu\'à hauteur d\'épaules, pas plus haut.',
      'Mène le mouvement avec les coudes, mains un peu plus basses : pense « écarter » plutôt que « lever ».',
      'Garde les épaules basses, loin des oreilles.',
      'Redescends en 2 secondes, sans élan. Prends léger : c\'est un petit muscle.',
    ],
    mistakes: ['Hausser les épaules (ce sont les trapèzes qui travaillent).', 'Balancer le buste pour monter.', 'Charges trop lourdes.'],
  },
  toeTouch: {
    name: 'Crunch jambes levées',
    side: {
      title: 'De côté',
      A: { hip: [140, 164], torso: 180, neck: -8, a1: { u: 62, f: 62 }, a2: { u: 60, f: 60 }, l1: { u: 88, f: 90 }, l2: { u: 92, f: 91 }, f1: 0, f2: 0 },
      B: { hip: [140, 164], torso: 156, neck: -14, a1: { u: 50, f: 50 }, a2: { u: 48, f: 48 }, l1: { u: 88, f: 90 }, l2: { u: 92, f: 91 }, f1: 0, f2: 0 },
      after: (J) => `<circle cx="${J.wri1[0].toFixed(1)}" cy="${J.wri1[1].toFixed(1)}" r="8" fill="${PROP_2}" stroke="${PROP}" stroke-width="2.5"/>`,
      marks: [{ at: 'hip', text: 'Bas du dos plaqué', dx: 30, dy: -6, anchor: 'start' }, { at: 'sho', text: 'Omoplates décollées', dx: -16, dy: -34, anchor: 'end' }],
    },
    pov: POV.toeTouch,
    seq: [{ to: 1, dur: 900, label: 'Enroule le haut du dos, vise tes pieds' }, { hold: 300, label: 'Expire' }, { to: 0, dur: 1400, label: 'Redescends sans poser la tête' }, { hold: 300, label: '' }],
    tips: [
      'Jambes tendues à la verticale, bas du dos plaqué au sol.',
      'Enroule le haut du dos pour décoller les omoplates, bras tendus vers les pieds.',
      'Expire en montant, regarde tes pieds, ne tire pas sur la nuque.',
      'Redescends en contrôlant, sans reposer complètement la tête.',
    ],
    mistakes: ['Lancer les bras au lieu d\'enrouler le buste.', 'Jambes qui tombent vers l\'avant.', 'Menton collé à la poitrine.'],
  },
  reverse: {
    name: 'Crunch inversé',
    side: {
      title: 'De côté',
      anchor: ['sho', [86, 164]],
      A: { hip: [134, 164], torso: 180, neck: 0, a1: { u: -2, f: 0 }, l1: { u: 90, f: 0 }, l2: { u: 94, f: 2 }, f1: 0, f2: 0 },
      B: { hip: [134, 164], torso: 202, neck: -22, a1: { u: -2, f: 0 }, l1: { u: 132, f: 58 }, l2: { u: 136, f: 60 }, f1: 60, f2: 62 },
      marks: [{ at: 'hip', text: 'Les fesses décollent', dx: 26, dy: 4, anchor: 'start' }, { at: 'kne1', text: 'Genoux vers la poitrine', dx: 6, dy: -26 }],
    },
    pov: POV.reverse,
    seq: [{ to: 1, dur: 1000, label: 'Enroule le bassin' }, { hold: 300, label: 'Bas du dos décollé' }, { to: 0, dur: 1800, label: 'Redescends lentement' }, { hold: 300, label: '' }],
    tips: [
      'Allongé, bras le long du corps, genoux pliés à 90°.',
      'Ramène les genoux vers la poitrine, puis décolle les fesses et le bas du dos : c\'est cet enroulement qui fait travailler les abdos.',
      'Redescends en 2 à 3 secondes sans reposer les pieds.',
      'Expire en montant, pas d\'élan.',
    ],
    mistakes: ['Monter seulement les jambes sans enrouler le bassin.', 'Se servir de l\'élan des jambes.', 'Pousser fort avec les mains au sol.'],
  },
  twist: {
    name: 'Russian twist',
    side: {
      title: 'De face',
      front: true,
      A: { hip: [120, 160], k: -1, lean: 6, tl: 44, legs: 'seated', aR: { ik: [86, 132], bend: 1 }, aL: { ik: [86, 132], bend: -1 } },
      B: { hip: [120, 160], k: 1, lean: 6, tl: 44, legs: 'seated', aR: { ik: [154, 132], bend: 1 }, aL: { ik: [154, 132], bend: -1 } },
      after: (J) => `<circle cx="${((J.wriR[0] + J.wriL[0]) / 2).toFixed(1)}" cy="${((J.wriR[1] + J.wriL[1]) / 2).toFixed(1)}" r="9" fill="${PROP_2}" stroke="${PROP}" stroke-width="2.5"/>`,
      marks: [{ at: 'sc', text: 'Les épaules tournent', dx: 0, dy: -42 }],
      floorY: 166,
    },
    pov: POV.twist,
    seq: [{ to: 1, dur: 900, label: 'Tourne les épaules' }, { hold: 200, label: '' }, { to: 0, dur: 900, label: 'De l\'autre côté' }, { hold: 200, label: '' }],
    tips: [
      'Assis, buste incliné vers l\'arrière à 45° environ, dos droit et pas rond.',
      'Tourne les épaules, pas seulement les bras : le poids reste près du ventre et suit le buste.',
      'Va presque toucher le sol de chaque côté, à un rythme contrôlé.',
      'Pieds au sol pour débuter, décollés pour plus de difficulté.',
    ],
    mistakes: ['Ne bouger que les bras.', 'Dos rond.', 'Aller trop vite.'],
  },
  hollow: {
    name: 'Gainage banane',
    side: {
      title: 'De côté',
      A: { hip: [124, 163], torso: 166, neck: -6, a1: { u: 172, f: 174 }, l1: { u: 14, f: 12 }, l2: { u: 16, f: 13 } },
      B: { hip: [124, 163], torso: 163, neck: -8, a1: { u: 170, f: 172 }, l1: { u: 17, f: 14 }, l2: { u: 18, f: 15 } },
      marks: [{ at: 'hip', text: 'Bas du dos collé au sol', dx: -30, dy: -60 }, { at: 'ank1', text: 'Jambes tendues', dx: 0, dy: -22 }],
    },
    pov: POV.hollow,
    seq: [{ to: 1, dur: 2200, label: 'Tiens la position' }, { to: 0, dur: 2200, label: 'Respire calmement' }],
    tips: [
      'Bas du dos plaqué au sol pendant toute la tenue : c\'est le point le plus important.',
      'Épaules et jambes décollées, bras tendus derrière la tête, jambes tendues et serrées.',
      'Si le bas du dos se décolle, plie les genoux ou ramène les bras le long du corps.',
      'Respire calmement, regard vers tes pieds.',
    ],
    mistakes: ['Bas du dos creusé.', 'Jambes trop hautes (l\'exercice devient trop facile).', 'Bloquer la respiration.'],
  },
};

const ALIASES = {
  'tractions supination': 'tractions', tractions: 'tractions', 'developpe couche': 'dc',
  'fentes bulgares': 'fentes', 'elevations laterales': 'lat',
  'crunch jambes levees': 'toeTouch', 'crunch inverse': 'reverse', 'russian twist': 'twist', 'gainage banane': 'hollow',
};
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
export function techniqueKey(name) { return ALIASES[norm(name)] || null; }

/* ================= Rendu d'une image ================= */
function poseAt(ex, t) {
  return mix(ex.side.A, ex.side.B, t);
}

export function renderFrame(key, view, t) {
  const ex = LIB[key];
  if (view === 'pov') return ex.pov(t);
  if (view === 'back') return ex.back(t);
  const p = poseAt(ex, t);
  const d = ex.side;
  if (d.front) {
    const J = solveFront(p);
    return `${floor(d.floorY || 172)}${drawFront(J, p)}${d.after ? d.after(J) : ''}${markers(J, d.marks || [], undefined, t)}`;
  }
  const J = solveSide(p, d);
  const parts = drawSide(J, p);
  const f = d.fit || { s: 1, x: 0, y: 0 };
  const tf = (q) => [f.x + f.s * q[0], f.y + f.s * q[1]];
  const scene = `${d.noFloor ? '' : floor()}${parts.far}${d.props ? d.props(J) : ''}${parts.body}${parts.near}${d.after ? d.after(J) : ''}`;
  return `${d.noFloor ? floor(182) : ''}<g transform="translate(${f.x} ${f.y}) scale(${f.s})">${scene}</g>${markers(J, d.marks || [], tf, t)}`;
}

/** Position dans la séquence au temps ms : renvoie { t, label }. */
function timeline(seq, ms) {
  const total = seq.reduce((a, s) => a + (s.dur || s.hold || 0), 0);
  let x = ms % total;
  let cur = 0;
  for (const s of seq) {
    const d = s.dur || s.hold;
    if (x < d) {
      if (s.hold) return { t: cur, label: s.label };
      const k = ease(x / d);
      const t = lerp(cur, s.to, k);
      return { t, label: s.label };
    }
    x -= d;
    if (!s.hold) cur = s.to;
  }
  return { t: cur, label: '' };
}

/* ================= Fiche ================= */
export function openTechnique(name) {
  const key = techniqueKey(name);
  if (!key) return false;
  const ex = LIB[key];
  let view = 'side';
  let raf = null;
  const t0 = performance.now();
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  openSheet({
    title: ex.name,
    body: `
      <div class="seg fill" role="group" aria-label="Vue">
        <button data-view="side" aria-pressed="true">${ex.side.title}</button>
        ${ex.back ? '<button data-view="back" aria-pressed="false">De dos</button>' : ''}
        <button data-view="pov" aria-pressed="false">À ta place</button>
      </div>
      <div class="tech-stage"><svg viewBox="0 0 240 190" id="tech-svg" role="img" aria-label="Animation de l'exercice"></svg></div>
      <div class="tech-phase" id="tech-phase"></div>
      <span class="label" style="margin-top:18px">Points clés</span>
      <ul class="tech-list ok">${ex.tips.map((x) => `<li>${icons.check}<span>${esc(x)}</span></li>`).join('')}</ul>
      <span class="label" style="margin-top:18px">Erreurs à éviter</span>
      <ul class="tech-list ko">${ex.mistakes.map((x) => `<li>${icons.close}<span>${esc(x)}</span></li>`).join('')}</ul>`,
    onMount(s) {
      const svg = s.body.querySelector('#tech-svg');
      const ph = s.body.querySelector('#tech-phase');
      let lastLabel = null;
      const frame = (now) => {
        const { t, label } = reduce ? { t: 1, label: '' } : timeline(ex.seq, now - t0);
        svg.innerHTML = renderFrame(key, view, t);
        if (label !== lastLabel) {
          lastLabel = label;
          ph.textContent = label || ' ';
          ph.classList.remove('swap'); void ph.offsetWidth; ph.classList.add('swap');
        }
        if (!reduce) raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
      s.body.addEventListener('click', (e) => {
        const b = e.target.closest('[data-view]');
        if (!b) return;
        view = b.dataset.view;
        s.body.querySelectorAll('[data-view]').forEach((x) => x.setAttribute('aria-pressed', x === b));
        svg.classList.remove('swap'); void svg.offsetWidth; svg.classList.add('swap');
        if (reduce) frame(performance.now());
      });
    },
    onClose() { cancelAnimationFrame(raf); },
  });
  return true;
}
