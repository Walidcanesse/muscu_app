// Fiches technique : personnage animé (de côté, de face ou de dos), vue subjective, erreurs à éviter et points clés.
import { esc, openSheet, icons } from './ui.js';

/* ================= Outils géométriques ================= */
const rad = (d) => (d * Math.PI) / 180;
const polar = (len, deg) => [len * Math.cos(rad(deg)), -len * Math.sin(rad(deg))];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const lerp = (a, b, t) => a + (b - a) * t;
const mixP = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
const unit = (v) => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
const angle = (v) => (Math.atan2(v[1], v[0]) * 180) / Math.PI;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const n1 = (v) => v.toFixed(1);
const P = (p) => `${n1(p[0])} ${n1(p[1])}`;

/** Cinématique inverse à deux segments : renvoie [articulation, extrémité]. */
function ik(P0, T, a, b, bend) {
  const dx = T[0] - P0[0], dy = T[1] - P0[1];
  const d = Math.min(a + b - 0.05, Math.max(Math.abs(a - b) + 0.1, Math.hypot(dx, dy)));
  const base = Math.atan2(dy, dx);
  const A = Math.acos(Math.min(1, Math.max(-1, (a * a + d * d - b * b) / (2 * a * d))));
  const ang = base + bend * A;
  return [[P0[0] + a * Math.cos(ang), P0[1] + a * Math.sin(ang)], [P0[0] + d * Math.cos(base), P0[1] + d * Math.sin(base)]];
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

/** Interpolation adoucie entre plusieurs poses clés [[u, pose], …]. */
function keys(list, u) {
  if (u <= list[0][0]) return list[0][1];
  for (let i = 1; i < list.length; i++) {
    const [u1, p1] = list[i];
    const [u0, p0] = list[i - 1];
    if (u <= u1) return mix(p0, p1, ease((u - u0) / (u1 - u0 || 1)));
  }
  return list[list.length - 1][1];
}

const L = { torso: 48, neck: 17, ua: 27, fa: 25, th: 37, sh: 35, foot: 11 };

/* ================= Palette ================= */
const SKIN = '#F1C9A8', SKIN_FAR = '#DDA987', SKIN_LN = '#C98E6B';
const SHIRT = '#4B4D57', SHIRT_FAR = '#34363F', SHIRT_SH = '#3E4049', SHIRT_HI = '#5C5F6A';
const SHORTS = '#2F3647', SHORTS_FAR = '#232836';
const HAIR = '#3B291E', HAIR_HI = '#6A4B36', HAIR_SH = '#2A1C14';
const EYE = '#2B1E17', LIP = '#C98676';
const PROP = '#3C3C44', PROP_2 = '#26262C', FLOOR = '#2A2A30', CUE = '#34D17A', BAD = '#FF5468';
const NEAR = { skin: SKIN, shirt: SHIRT, shorts: SHORTS, shoe: '#E6E6EB', sole: '#FBFBFC', det: '#A3A4AE', ln: SKIN_LN, sock: '#F3F3F5' };
const FAR = { skin: SKIN_FAR, shirt: SHIRT_FAR, shorts: SHORTS_FAR, shoe: '#AEAEB7', sole: '#C4C4CB', det: '#83848E', ln: '#B57A57', sock: '#BDBDC4' };

/* ================= Formes de base ================= */
/**
 * Membre effilé : rayon ra en a, rb en b, ventre musculaire m1 / m2 (de chaque côté) à la position u.
 * ref oriente le côté « m1 » (ex. mollet vers l'arrière).
 */
function limbD(a, b, ra, rb, m1, m2, u = 0.45, ref = null) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 0.001;
  let nx = -dy / len, ny = dx / len;
  if (ref && nx * ref[0] + ny * ref[1] < 0) { nx = -nx; ny = -ny; }
  if (m1 == null) m1 = (ra + rb) / 2;
  if (m2 == null) m2 = m1;
  const pt = (t, r) => [a[0] + dx * t + nx * r, a[1] + dy * t + ny * r];
  const p0 = pt(0, ra), p1 = pt(u, m1), p2 = pt(1, rb);
  const q0 = pt(1, -rb), q1 = pt(u, -m2), q2 = pt(0, -ra);
  const c = (s, m, e) => [2 * m[0] - (s[0] + e[0]) / 2, 2 * m[1] - (s[1] + e[1]) / 2];
  const sw = (nx * dy - ny * dx) / len > 0 ? 1 : 0;
  return `M${P(p0)}Q${P(c(p0, p1, p2))} ${P(p2)}A${n1(rb)} ${n1(rb)} 0 0 ${sw} ${P(q0)}Q${P(c(q0, q1, q2))} ${P(q2)}A${n1(ra)} ${n1(ra)} 0 0 ${sw} ${P(p0)}Z`;
}
const limb = (a, b, ra, rb, m1, m2, u, ref, col) => `<path d="${limbD(a, b, ra, rb, m1, m2, u, ref)}" fill="${col}"/>`;
/** Place un dessin défini dans un repère local (x vers l'avant / le long du segment). */
const place = (o, a, inner, sx = 1, sy = 1) => `<g transform="translate(${n1(o[0])} ${n1(o[1])}) rotate(${n1(a)})${sx !== 1 || sy !== 1 ? ` scale(${sx} ${sy})` : ''}">${inner}</g>`;
const circles = (list, col) => list.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${col}"/>`).join('');
const strokes = (d, col, w = 0.9, op = 1) => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${op < 1 ? ` opacity="${op}"` : ''}/>`;
const seg = (a, b, w, c) => `<line x1="${n1(a[0])}" y1="${n1(a[1])}" x2="${n1(b[0])}" y2="${n1(b[1])}" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>`;
const dot = (p, r, c, extra = '') => `<circle cx="${n1(p[0])}" cy="${n1(p[1])}" r="${r}" fill="${c}" ${extra}/>`;

/* ---------- Tête de profil (repère : centre de la tête, x vers le visage, y vers le bas) ---------- */
const HEAD_SIDE_SKIN = `<path d="M-3.9 13.5C-4.1 9.4-4.7 6.3-6.6 3.7C-9 .4-9.2-5.4-6.6-8.8C-4-12 2-12.4 5.2-9.4C7-7.6 7.8-5.4 7.7-3.4L7.9-1.4C8.6 0 9.6 1.4 9.8 2.3C9.9 2.9 9.2 3.3 8 3.3L8.2 4.9C8.4 5.4 8 5.7 7.8 6C8.1 6.5 8 7 7.6 7.4C7.6 8.6 7 9.6 5.4 9.9C4.1 10.2 2.8 9.8 2 9.4L2.8 13.5Z" fill="${SKIN}"/>`
  + strokes('M2.2 9.5C3.6 10.4 5.2 10.4 6.4 9.6', SKIN_LN, 0.7, 0.55);
const HAIR_SIDE = `<path d="M6.9-6.2C8.4-9.6 6-13.6 1-14.4C-4.6-15.2-10.4-12.4-11.8-7C-12.8-3-12.4 2.4-10.6 6.4C-9.8 8.4-8.4 9.8-6.4 10.1C-6.8 7.4-6.2 4.6-4.5 3.2C-3.5 2.4-3.3.6-3.5-1.6C-1.6-3.8 1.4-4.8 3.2-5.4C4.6-5 5.8-5.4 6.9-6.2Z" fill="${HAIR}"/>`
  + circles([[5.6, -9.8, 2.6], [2.4, -12.9, 3], [-2, -14.1, 3.1], [-6.4, -12.7, 3.1], [-9.9, -9.5, 3], [-11.5, -5, 2.9], [-11.7, -0.4, 2.8], [-10.9, 4.2, 2.6], [-8.7, 7.9, 2.4], [-5.8, 9.4, 1.9], [7.1, -6.9, 1.9], [-2.6, -9, 2.6], [-6.8, -6, 2.4]], HAIR)
  + strokes('M3.6-11.6q1.6-1 2.7.4M-1-12.8q1.8-1.2 3.1.2M-6-11.2q1.6-1.4 3.1-.2M-9.8-6.8q.6-1.8 2.4-1.8M-10.2-1.2q.2-1.8 2-2.2M-9.6 3.8q0-1.6 1.8-2.2M-7.2 7.6q.4-1.4 1.8-1.6M5.6-7.6q1-.8 1.9 0M-4.2-8q1.4-1.2 2.8 0', HAIR_HI, 0.9, 0.9)
  + strokes('M-4.4 3.2C-3.4 1.6-3.2-.2-3.5-1.6', HAIR_SH, 0.8, 0.8);
const HEAD_SIDE_TOP = `<ellipse cx="-1.4" cy=".8" rx="2.3" ry="3.3" fill="${SKIN}"/>`
  + strokes('M-.7-1.6C-2.4-1.3-2.6 2.4-.9 2.9', SKIN_LN, 0.75)
  + HAIR_SIDE
  + `<ellipse cx="4.9" cy="-1.5" rx=".8" ry="1" fill="${EYE}"/>`
  + strokes('M3.3-3.9Q5.1-4.7 7-3.9', HAIR, 1.1)
  + strokes('M7.4 5.6L6.3 5.7', LIP, 0.8);

/* ---------- Tête de face (centre de la tête, y vers le bas) ---------- */
const HAIR_FRONT_BACK = `<path d="M-8.4 8.6C-10.8 3-11.2-6-8.6-10.8C-6-15.6 6-15.6 8.6-10.8C11.2-6 10.8 3 8.4 8.6C7.8 4 7.2 0 6.6-2.4L-6.6-2.4C-7.2 0-7.8 4-8.4 8.6Z" fill="${HAIR}"/>`
  + circles([[-8.5, 7.4, 2.2], [8.5, 7.4, 2.2], [-9.8, 2.8, 2.6], [9.8, 2.8, 2.6], [-10.1, -2.6, 2.8], [10.1, -2.6, 2.8], [-8.8, -8.2, 3], [8.8, -8.2, 3]], HAIR)
  + strokes('M-10.6 1.6q.4-1.6 2-1.8M9 .2q1.4.2 1.8 1.6M-10.6-3.8q.6-1.6 2.2-1.6M8.6-5.4q1.6 0 2 1.6M-9.4 6.6q.6-1.2 1.8-1.2M7.8 5.4q1.2 0 1.6 1.2', HAIR_HI, 0.9, 0.85);
const FACE_FRONT = `<ellipse cx="-6.7" cy=".6" rx="1.7" ry="2.8" fill="${SKIN_FAR}"/><ellipse cx="6.7" cy=".6" rx="1.7" ry="2.8" fill="${SKIN_FAR}"/>`
  + `<path d="M0-10.6C5.6-10.6 6.9-5 6.7-1C6.5 3.6 4.4 8.2 0 9.3C-4.4 8.2-6.5 3.6-6.7-1C-6.9-5-5.6-10.6 0-10.6Z" fill="${SKIN}"/>`;
const faceFeatures = (k = 0) => `<g transform="translate(${n1(k * 2.3)} 0)">`
  + `<ellipse cx="-2.5" cy="-.6" rx=".8" ry="1" fill="${EYE}"/><ellipse cx="2.5" cy="-.6" rx=".8" ry="1" fill="${EYE}"/>`
  + strokes('M-4-2.8Q-2.6-3.6-1.1-2.9M1.1-2.9Q2.6-3.6 4-2.8', HAIR, 1)
  + strokes('M.2.4L.9 3.3Q.3 3.9-.6 3.6', SKIN_LN, 0.75)
  + strokes('M-1.7 5.8Q0 6.5 1.7 5.8', LIP, 0.9) + '</g>';
const HAIR_FRONT_FRINGE = `<path d="M-6.9-3.4C-6.6-9.2-3-12.4 0-12.4C3-12.4 6.6-9.2 6.9-3.4C5.6-5.6 4-6 2.6-5.6C1.4-6.8-.6-6.6-1.6-5.8C-3-6.6-5.2-6.2-6.9-3.4Z" fill="${HAIR}"/>`
  + circles([[-4.2, -9, 2.6], [0, -10.6, 2.8], [4.2, -9, 2.6], [-6.2, -5.6, 2], [6.2, -5.6, 2], [-2.2, -6.6, 1.8], [2.2, -6.8, 1.8], [-7.4, -11.6, 3], [7.4, -11.6, 3], [-3.8, -13.8, 3.1], [3.8, -13.8, 3.1]], HAIR)
  + strokes('M-5.4-10q1.4-1.2 2.8 0M-1.4-11.8q1.4-1.2 2.8 0M2.8-10q1.4-1.2 2.8 0M-3-7.4q.8-.8 1.8-.2M1.2-7.6q.8-.8 1.8-.2M-8.6-12.6q1.2-1.4 2.8-.8M-4.8-15q1.4-1.2 2.8-.4M2.2-15.2q1.6-.6 2.8.6M5.8-12.8q1.6-.4 2.6.9', HAIR_HI, 0.9, 0.85);
const headFront = (k = 0) => HAIR_FRONT_BACK + FACE_FRONT + faceFeatures(k) + HAIR_FRONT_FRINGE;

/* ---------- Tête de dos ---------- */
const HEAD_BACK = `<ellipse cx="-6.8" cy=".8" rx="1.7" ry="2.8" fill="${SKIN_FAR}"/><ellipse cx="6.8" cy=".8" rx="1.7" ry="2.8" fill="${SKIN_FAR}"/>`
  + `<path d="M-8.8 7.4C-11.2 2-11.2-6-8.6-10.8C-6-15.6 6-15.6 8.6-10.8C11.2-6 11.2 2 8.8 7.4C6 10.4-6 10.4-8.8 7.4Z" fill="${HAIR}"/>`
  + circles([[-8.6, 6.8, 2.5], [8.6, 6.8, 2.5], [-5, 9, 2.4], [0, 9.6, 2.4], [5, 9, 2.4], [-10, 1.8, 2.8], [10, 1.8, 2.8], [-10.1, -3.6, 2.9], [10.1, -3.6, 2.9], [-8.4, -9.2, 3], [8.4, -9.2, 3], [-4, -13, 3.1], [4, -13, 3.1], [0, -14, 3]], HAIR)
  + strokes('M-6 -6q1.4-1.4 3-.4M1.4-7q1.6-1 3 .2M-3.4-1q1.4-1.2 2.8 0M2.4.2q1.4-1 2.8.2M-7.6 3.6q1.2-1.2 2.6-.4M4.4 4q1.4-.8 2.6.4M-2 5.4q1.4-1 2.8 0M-1-11q1.4-1.2 2.8-.2M-9.4-4q.6-1.6 2.2-1.4M7.4-4.6q1.4.2 1.9 1.6', HAIR_HI, 0.9, 0.85)
  + strokes('M-7.6 8.2q3.8 2 7.6 1.4q3.8.6 7.6-1.4', HAIR_SH, 0.8, 0.7);

/* ---------- Mains (repère : poignet, x le long de l'avant-bras) ---------- */
const handFist = (T) => `<path d="M-.8-3C2.4-4 6.6-4.2 8.6-3C10.4-1.8 10.4 2.6 8.6 3.6C6.4 4.6 2.4 4.2-.8 3Z" fill="${T.skin}"/>`
  + strokes('M7.2-2.4C8.2-.8 8.2 1.4 7.2 3', T.ln, 0.75, 0.8);
const handOpen = (T) => `<path d="M-.8-3C3-3.6 7-3.4 9-2.8L14.2-1.9C15.4-1.6 15.4.8 14.2 1.1L9 2.2C6 3.6 2 3.6-.8 3Z" fill="${T.skin}"/>`
  + strokes('M9.6-1.2L13.6-.6M9.4.6L13.4.4', T.ln, 0.6, 0.7);
const FIST = { n: handFist(NEAR), f: handFist(FAR) };
const OPEN = { n: handOpen(NEAR), f: handOpen(FAR) };

/* ---------- Baskets ---------- */
const shoeSide = (T) => `<path d="M-5 2.6C-5.7-.6-4.4-3.8-1.6-4.4C0-4.7 1.4-4.2 2.4-3.4C5.4-2.4 9.6-1 12.6 0C14.6.8 15.4 2 15 3L-5 3Z" fill="${T.shoe}"/>`
  + `<path d="M-5.4 2.6L15.1 2.6C15.6 3.4 15.4 5 14 5L-4.2 5C-5.4 5-5.8 3.6-5.4 2.6Z" fill="${T.sole}"/>`
  + strokes('M2.8-3.2L8.2-1.2', T.det, 1.2) + strokes('M-3.8 1.4C.4.6 6 .8 11.4 1.8', T.det, 0.7, 0.8);
const SHOE_SIDE = { n: shoeSide(NEAR), f: shoeSide(FAR) };
const shoeFront = (T, back) => `<path d="M-3.8-2.8C-4.9-.4-5.2 2.6-4.8 4.6L4.8 4.6C5.2 2.6 4.9-.4 3.8-2.8C1.4-3.6-1.4-3.6-3.8-2.8Z" fill="${T.shoe}"/>`
  + `<path d="M-5.2 4.2H5.2C5.7 5.2 5.3 6.6 4.2 6.6H-4.2C-5.3 6.6-5.7 5.2-5.2 4.2Z" fill="${T.sole}"/>`
  + (back ? strokes('M0-3.2V1.6', T.det, 1.6) : strokes('M-1.7-1.4H1.7M-1.9.6H1.9', T.det, 0.9));
const SHOE_FRONT = shoeFront(NEAR, false), SHOE_BACK = shoeFront(NEAR, true);
const shoeTop = (T) => `<path d="M-4-1C-5 4-4.8 10-3 13.8C-1.4 16-.2 16.4 0 16.4C.2 16.4 1.4 16 3 13.8C4.8 10 5 4 4-1C2.6-3.2-2.6-3.2-4-1Z" fill="${T.sole}"/>`
  + `<path d="M-3.2-.6C-4 4-3.8 9.6-2.4 13C-1.2 14.8 1.2 14.8 2.4 13C3.8 9.6 4 4 3.2-.6C2-2.2-2-2.2-3.2-.6Z" fill="${T.shoe}"/>`
  + strokes('M-1.4 2.6H1.4M-1.5 4.8H1.5M-1.5 7H1.5', T.det, 0.9);
const SHOE_TOP = shoeTop(NEAR);

/* ================= Personnage de profil ================= */
function limbJ(from, spec, l1, l2) {
  if (spec.ik) return ik(from, spec.ik, l1, l2, spec.bend);
  const mid = add(from, polar(l1, spec.u));
  return [mid, add(mid, polar(l2, spec.f))];
}

function solveSide(p, def = {}) {
  const J = {};
  J.hip = [p.hip[0], p.hip[1]];
  J.sho = add(J.hip, polar(L.torso, p.torso));
  J.head = add(J.sho, polar(L.neck, p.torso + (p.neck || 0)));
  [J.elb1, J.wri1] = limbJ(J.sho, p.a1, L.ua, L.fa);
  [J.elb2, J.wri2] = limbJ(J.sho, p.a2 || p.a1, L.ua, L.fa);
  [J.kne1, J.ank1] = limbJ(J.hip, p.l1, L.th, L.sh);
  [J.kne2, J.ank2] = limbJ(J.hip, p.l2 || p.l1, L.th, L.sh);
  const footDir = (k, kn, an) => (p[k] ?? Math.atan2(-(an[1] - kn[1]), an[0] - kn[0]) * 180 / Math.PI + 90);
  J.toe1 = add(J.ank1, polar(L.foot, footDir('f1', J.kne1, J.ank1)));
  J.toe2 = add(J.ank2, polar(L.foot, footDir('f2', J.kne2, J.ank2)));
  if (def.anchor) {
    const [jn, at] = def.anchor;
    const dx = at[0] - J[jn][0], dy = at[1] - J[jn][1];
    for (const k in J) J[k] = [J[k][0] + dx, J[k][1] + dy];
  }
  // centre de la prise (milieu du poing)
  J.grip1 = add(J.wri1, unit(sub(J.wri1, J.elb1)).map((v) => v * 4.6));
  J.grip2 = add(J.wri2, unit(sub(J.wri2, J.elb2)).map((v) => v * 4.6));
  J.chest = add(J.hip, polar(L.torso * 0.78, p.torso)); // milieu des pectoraux, sur l'axe
  const ha = rad(90 - p.torso - (p.neck || 0));
  J.chin = [J.head[0] + 6 * Math.cos(ha) - 9.4 * Math.sin(ha), J.head[1] + 6 * Math.sin(ha) + 9.4 * Math.cos(ha)];
  return J;
}

// Buste de profil (repère : hanche, x vers l'avant, y vers le bas ; épaule en (0,-48))
const SHIRT_SIDE = `<path d="M4.2-52C7.8-51.4 10.4-48.6 11-44C11.6-39.4 10.8-34.4 9-31.4C7.8-26 7.2-18 7.4-11C7.5-6.6 8-3.4 8.4-1.2C3-.2-5-.2-10.6-1.6C-9.6-6.4-8-11.6-7.8-17C-7.6-23.4-9.4-31-9.8-38C-10-44.4-8.6-50.6-4.8-55C-3.6-55.8-2.4-55.4-1.6-54.6C.2-53 2.2-52.2 4.2-52Z" fill="${SHIRT}"/>`
  + strokes('M-8.6-40C-8-33-7.2-26-6.8-19', SHIRT_SH, 1.6, 0.9)
  + strokes('M9.8-41.4C9.6-37 8.6-33.6 7.4-31.6', SHIRT_HI, 1, 0.6)
  + strokes('M-1.6-54.6C.2-53 2.2-52.2 4.2-52', SHIRT_SH, 1.2);
const SHORTS_SIDE = `<path d="M7.6-7.4C8.8-3 8.6 2 6.6 6.8L-3 9.6C-8 10-11.2 6.6-11.2 1.6C-11.2-2.4-10.8-5.4-10-7.6Z" fill="${SHORTS}"/>`;

function sideLeg(J, n, T) {
  const hip = J.hip, k = J['kne' + n], a = J['ank' + n], toe = J['toe' + n];
  const fd = unit(sub(toe, a));
  const kd = sub(k, a);
  const flip = (-fd[1] * kd[0] + fd[0] * kd[1]) > 0;
  const tag = T === NEAR ? 'n' : 'f';
  return limb(hip, k, 7.8, 5.3, 7.4, 7, 0.4, unit(sub(a, k)), T.skin)
    + limb(k, a, 5.1, 2.9, 6.1, 4.4, 0.3, [-fd[0], -fd[1]], T.skin)
    + limb(mixP(k, a, 0.86), a, 3.3, 3.2, null, null, 0.5, null, T.sock)
    + place(a, angle(fd), SHOE_SIDE[tag], 1, flip ? -1 : 1)
    + limb(hip, mixP(hip, k, 0.5), 9.4, 8.4, null, null, 0.5, null, T.shorts);
}

function sideArm(J, n, T, hand = 'fist') {
  const s = J.sho, e = J['elb' + n], w = J['wri' + n];
  const fd = unit(sub(w, e));
  const tag = T === NEAR ? 'n' : 'f';
  return limb(s, e, 5.4, 3.7, 4.9, 4.5, 0.42, null, T.skin)
    + limb(e, w, 3.8, 2.5, 4.4, 3.9, 0.3, null, T.skin)
    + place(w, angle(fd), (hand === 'open' ? OPEN : FIST)[tag])
    + limb(s, mixP(s, e, 0.46), 6.6, 5.7, null, null, 0.5, null, T.shirt);
}

function drawSide(J, p, d = {}) {
  const up = p.torso, hd = p.torso + (p.neck || 0);
  const ta = 90 - up, ha = 90 - hd;
  const tp = (x, y) => { const c = Math.cos(rad(ta)), s = Math.sin(rad(ta)); return [J.hip[0] + x * c - y * s, J.hip[1] + x * s + y * c]; };
  const hpt = (x, y) => { const c = Math.cos(rad(ha)), s = Math.sin(rad(ha)); return [J.head[0] + x * c - y * s, J.head[1] + x * s + y * c]; };
  const far = sideLeg(J, 2, FAR) + sideArm(J, 2, FAR, d.hand2 || d.hand);
  const body = limb(tp(-0.2, -50), hpt(-0.6, 9), 4.3, 4, null, null, 0.5, null, SKIN)
    + place(J.head, ha, HEAD_SIDE_SKIN)
    + sideLeg(J, 1, NEAR)
    + place(J.hip, ta, SHORTS_SIDE + SHIRT_SIDE)
    + place(J.head, ha, HEAD_SIDE_TOP);
  const near = sideArm(J, 1, NEAR, d.hand);
  return { far, body, near };
}

/* ================= Personnage de face / de dos ================= */
function solveFront(p) {
  const J = {};
  const k = p.k || 0;
  J.hip = [p.hip[0], p.hip[1]];
  J.sc = [J.hip[0] + (p.lean || 0) * k, J.hip[1] - (p.tl || L.torso)];
  const hw = 15 * (1 - 0.4 * Math.abs(k));
  J.shR = [J.sc[0] + hw, J.sc[1]];
  J.shL = [J.sc[0] - hw, J.sc[1]];
  J.head = [J.sc[0] + k * 3, J.sc[1] - 18];
  J.hipR = [J.hip[0] + 8.5, J.hip[1]];
  J.hipL = [J.hip[0] - 8.5, J.hip[1]];
  const mirror = (s) => (s.ik ? { ik: [2 * J.sc[0] - s.ik[0], s.ik[1]], bend: -s.bend } : { u: 180 - s.u, f: 180 - s.f });
  // russian twist : le poids passe devant le ventre (plus haut) entre les deux côtés
  const lift = (s) => (s.ik && p.legs === 'seated' ? { ik: [s.ik[0], s.ik[1] - 16 * (1 - k * k)], bend: s.bend } : s);
  [J.elbR, J.wriR] = limbJ(J.shR, lift(p.aR), L.ua, L.fa);
  [J.elbL, J.wriL] = limbJ(J.shL, lift(p.aL || mirror(p.aR)), L.ua, L.fa);
  if (p.legs === 'seated') {
    J.kneR = [J.hip[0] + 11, J.hip[1] - 17]; J.kneL = [J.hip[0] - 11, J.hip[1] - 17];
    J.ankR = [J.hip[0] + 13, J.hip[1] + 4]; J.ankL = [J.hip[0] - 13, J.hip[1] + 4];
  } else {
    [J.kneR, J.ankR] = limbJ(J.hipR, p.lR || { u: -87, f: -89.5 }, L.th, L.sh);
    [J.kneL, J.ankL] = limbJ(J.hipL, p.lL || { u: -93, f: -90.5 }, L.th, L.sh);
  }
  J.gripR = add(J.wriR, unit(sub(J.wriR, J.elbR)).map((v) => v * 4.6));
  J.gripL = add(J.wriL, unit(sub(J.wriL, J.elbL)).map((v) => v * 4.6));
  return J;
}

function frontTorso(J, mode) {
  const { sc, hip } = J;
  const hw = (J.shR[0] - J.shL[0]) / 2;
  const at = (f, dx) => [lerp(sc[0], hip[0], f) + dx, lerp(sc[1], hip[1], f)];
  const nL = [sc[0] - 4.4, sc[1] - 4.8], nR = [sc[0] + 4.4, sc[1] - 4.8];
  const tL = [J.shL[0] + 1, J.shL[1] - 4.8], tR = [J.shR[0] - 1, J.shR[1] - 4.8];
  const aL = at(0.2, -hw * 0.9), aR = at(0.2, hw * 0.9);
  const wL = at(0.74, -10.6), wR = at(0.74, 10.6);
  const hL = at(1.03, -12.6), hR = at(1.03, 12.6);
  const collar = mode === 'back' ? [sc[0], sc[1] - 3.4] : [sc[0], sc[1] + 0.4];
  const d = `M${P(nL)}C${P([nL[0] - 3, nL[1] + 0.6])} ${P([tL[0] + 3, tL[1]])} ${P(tL)}C${P([J.shL[0] - 4.5, J.shL[1] - 2])} ${P([aL[0] - 3, aL[1] - 4])} ${P(aL)}`
    + `C${P([aL[0] + 1.2, aL[1] + 9])} ${P([wL[0] - 0.6, wL[1] - 9])} ${P(wL)}L${P(hL)}Q${P([hip[0], hL[1] + 1.6])} ${P(hR)}L${P(wR)}`
    + `C${P([wR[0] + 0.6, wR[1] - 9])} ${P([aR[0] - 1.2, aR[1] + 9])} ${P(aR)}C${P([aR[0] + 3, aR[1] - 4])} ${P([J.shR[0] + 4.5, J.shR[1] - 2])} ${P(tR)}`
    + `C${P([tR[0] - 3, tR[1]])} ${P([nR[0] + 3, nR[1] + 0.6])} ${P(nR)}Q${P(collar)} ${P(nL)}Z`;
  let s = `<path d="${d}" fill="${SHIRT}"/>`;
  const m = at(0.45, 0);
  if (mode === 'back') {
    // colonne et omoplates : plis du t-shirt
    s += strokes(`M${P(at(0.08, 0))}L${P(at(0.9, 0))}`, SHIRT_SH, 1.3, 0.9);
    const bY = sc[1] + (J.blade ?? 10), bX = J.bladeX ?? 8;
    s += strokes(`M${n1(sc[0] - bX - 4)} ${n1(bY - 6)}q-1.6 6 1.2 11.6M${n1(sc[0] + bX + 4)} ${n1(bY - 6)}q1.6 6-1.2 11.6`, SHIRT_SH, 1.4, 0.95);
    s += strokes(`M${n1(sc[0] - bX - 1)} ${n1(bY + 6)}q${n1(bX * 0.6)} 2 ${n1(bX * 0.9)} 0M${n1(sc[0] + bX + 1)} ${n1(bY + 6)}q${n1(-bX * 0.6)} 2 ${n1(-bX * 0.9)} 0`, SHIRT_HI, 1, 0.6);
  } else {
    s += strokes(`M${P([sc[0] - 4.4, sc[1] - 4.8])}Q${P(collar)} ${P([sc[0] + 4.4, sc[1] - 4.8])}`, SHIRT_SH, 1.4);
    s += strokes(`M${n1(m[0] - 9)} ${n1(sc[1] + 13)}q4 2.6 8.4 1.4M${n1(m[0] + 9)} ${n1(sc[1] + 13)}q-4 2.6-8.4 1.4`, SHIRT_SH, 1.2, 0.8);
  }
  return s;
}

function frontShorts(J) {
  const wy = J.hip[1] - 5;
  const tube = (h, k) => limb(h, mixP(h, k, 0.46), 9.2, 8.6, null, null, 0.5, null, SHORTS);
  return `<path d="M${n1(J.hip[0] - 12.4)} ${n1(wy)}H${n1(J.hip[0] + 12.4)}L${n1(J.hip[0] + 15)} ${n1(J.hip[1] + 2)}L${n1(J.hip[0])} ${n1(J.hip[1] + 7)}L${n1(J.hip[0] - 15)} ${n1(J.hip[1] + 2)}Z" fill="${SHORTS}"/>`
    + tube(J.hipL, J.kneL) + tube(J.hipR, J.kneR)
    + strokes(`M${n1(J.hip[0])} ${n1(J.hip[1] + 6)}V${n1(wy + 4)}`, SHORTS_FAR, 0.9);
}

function frontLeg(h, k, a, side, mode, seated) {
  const out = [side, 0];
  let s = limb(h, k, 7.6, 5.1, 7.4, 7, 0.35, out, SKIN)
    + limb(k, a, 5, 2.8, mode === 'back' ? 5.6 : 5, mode === 'back' ? 5.8 : 5.7, 0.3, out, SKIN);
  if (mode !== 'back' && !seated) s += strokes(`M${n1(k[0] - 2.6)} ${n1(k[1] + 1.4)}q2.6 2.4 5.2 0`, SKIN_LN, 0.7, 0.6);
  s += limb(mixP(k, a, 0.88), a, 3.2, 3.1, null, null, 0.5, null, NEAR.sock);
  s += place([a[0] + side * 1.2, a[1]], 0, mode === 'back' ? SHOE_BACK : SHOE_FRONT);
  if (seated) {
    // genoux vers l'avant : la cuisse passe devant le tibia
    s += limb(h, k, 7.6, 6.2, 7.4, 7.2, 0.5, out, SKIN)
      + strokes(`M${n1(k[0] - 3.4)} ${n1(k[1] + 0.6)}q3.4-3.6 6.8 0`, SKIN_LN, 0.8, 0.6);
  }
  return s;
}

function frontArm(sh, e, w, hand = 'fist') {
  const fd = unit(sub(w, e));
  return limb(sh, e, 5.4, 3.7, 4.9, 4.6, 0.42, null, SKIN)
    + limb(e, w, 3.8, 2.5, 4.4, 4, 0.3, null, SKIN)
    + place(w, angle(fd), hand === 'open' ? OPEN.n : FIST.n)
    + limb(sh, mixP(sh, e, 0.45), 6.8, 5.8, null, null, 0.5, null, SHIRT);
}

/** Personnage vu de face (mode 'front') ou de dos (mode 'back'). */
function drawFront(J, p, mode = 'front', between = '') {
  const seated = p.legs === 'seated';
  const legs = frontLeg(J.hipL, J.kneL, J.ankL, -1, mode, seated) + frontLeg(J.hipR, J.kneR, J.ankR, 1, mode, seated);
  let s = seated ? `<path d="M${n1(J.hip[0] - 12)} ${n1(J.hip[1] - 5)}h24l3 12h-30Z" fill="${SHORTS}"/>` : legs + frontShorts(J);
  s += limb([J.head[0], J.head[1] + 5], [J.sc[0], J.sc[1] - 3], 3.9, 4.4, null, null, 0.5, null, SKIN);
  s += frontTorso(J, mode);
  s += place(J.head, 0, mode === 'back' ? HEAD_BACK : headFront(p.k || 0));
  s += between;
  s += frontArm(J.shL, J.elbL, J.wriL, p.hand) + frontArm(J.shR, J.elbR, J.wriR, p.hand);
  if (seated) s += legs;
  return s;
}

/* ================= Repères ================= */
function tag(x, y, text, anchor = 'middle', col = CUE) {
  if (!text) return '';
  const w = text.length * 5.1 + 10;
  let left = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w + 5 : x - 5;
  left = Math.max(3, Math.min(237 - w, left));
  const yy = Math.max(13, Math.min(184, y));
  const cx = left + w / 2;
  return `<rect x="${n1(left)}" y="${n1(yy - 11)}" width="${n1(w)}" height="15" rx="7.5" fill="rgba(0,0,0,.74)"${col === BAD ? ' stroke="rgba(255,84,104,.45)" stroke-width=".8"' : ''}/>
    <text x="${n1(cx)}" y="${n1(yy)}" text-anchor="middle" fill="${col}" font-size="9.5" font-weight="700" font-family="ui-rounded, 'SF Pro Rounded', Nunito, system-ui">${esc(text)}</text>`;
}

function pin(p, q, text, anchor, col = CUE) {
  const line = col === BAD ? 'rgba(255,84,104,.7)' : 'rgba(52,209,122,.6)';
  const head = col === BAD
    ? `${dot(p, 4.4, BAD)}${strokes(`M${n1(p[0] - 1.9)} ${n1(p[1] - 1.9)}l3.8 3.8M${n1(p[0] + 1.9)} ${n1(p[1] - 1.9)}l-3.8 3.8`, '#fff', 1.3)}`
    : dot(p, 3.4, CUE, 'stroke="rgba(0,0,0,.45)" stroke-width="1"');
  return `<g class="mk">${seg(p, q, 1, line)}${head}${tag(q[0], q[1] - 2, text, anchor, col)}</g>`;
}

function markers(J, list, tf = (p) => p, t = 0) {
  return list.map(({ at, text, dx = 0, dy = -24, anchor = 'middle', from = 0, to = 1, bad = false }) => {
    if (t < from || t > to) return '';
    const raw = typeof at === 'function' ? at(J) : J[at];
    if (!raw) return '';
    const p = tf(raw);
    return pin(p, [p[0] + dx, p[1] + dy], text, anchor, bad ? BAD : CUE);
  }).join('');
}

/** Bandeau « À éviter » en haut à gauche. */
const badBadge = (x = 6, y = 6) => `<g><rect x="${x}" y="${y}" width="62" height="17" rx="8.5" fill="rgba(255,84,104,.16)" stroke="rgba(255,84,104,.5)" stroke-width=".8"/>
  <circle cx="${x + 9}" cy="${y + 8.5}" r="5.4" fill="${BAD}"/>${strokes(`M${x + 7} ${y + 6.5}l4 4M${x + 11} ${y + 6.5}l-4 4`, '#fff', 1.4)}
  <text x="${x + 18}" y="${y + 12}" fill="${BAD}" font-size="9" font-weight="800" font-family="ui-rounded, 'SF Pro Rounded', Nunito, system-ui">À éviter</text></g>`;

/* ================= Décor ================= */
const floor = (y = 172) => `<line x1="0" x2="240" y1="${y}" y2="${y}" stroke="${FLOOR}" stroke-width="2"/>`;
const bench = (x1, x2, top, legs = true) => `<rect x="${x1}" y="${top}" width="${x2 - x1}" height="9" rx="4.5" fill="${PROP}"/>`
  + (legs ? `<rect x="${x1 + 10}" y="${top + 9}" width="6" height="${172 - top - 9}" fill="${PROP_2}"/><rect x="${x2 - 16}" y="${top + 9}" width="6" height="${172 - top - 9}" fill="${PROP_2}"/>` : '');
const plate = (p, r) => `<circle cx="${n1(p[0])}" cy="${n1(p[1])}" r="${r}" fill="${PROP_2}" stroke="${PROP}" stroke-width="2.5"/><circle cx="${n1(p[0])}" cy="${n1(p[1])}" r="${n1(r * 0.28)}" fill="${PROP}"/>`;
const dumbbellEnd = (p) => `<circle cx="${n1(p[0])}" cy="${n1(p[1])}" r="6.6" fill="${PROP_2}" stroke="${PROP}" stroke-width="2.2"/>`;
const pullBar = (x1, x2, y) => `<rect x="${x1}" y="${y - 3}" width="${x2 - x1}" height="6" rx="3" fill="${PROP}"/><rect x="${x2 - 4}" y="0" width="5" height="${y}" fill="${PROP_2}"/><rect x="${x1 - 1}" y="0" width="5" height="${y}" fill="${PROP_2}"/>`;

/* ================= Vues subjectives (« À ta place ») ================= */
const povFrame = (inner) => `<defs><radialGradient id="vig" cx="50%" cy="50%" r="70%"><stop offset="60%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity=".85"/></radialGradient></defs><rect width="240" height="190" fill="#0B0B0E"/>${inner}<rect width="240" height="190" fill="url(#vig)"/>`;
const label = (x, y, text, anchor = 'middle') => tag(x, y, text, anchor);
const guide = (x1, y1, x2, y2, col = CUE) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="1.2" stroke-dasharray="3 4" opacity=".7"/>`;
/** Membre en gros plan, avec un liseré d'ombre pour le volume. */
function povLimb(a, b, ra, rb, col = SKIN, shade = SKIN_FAR, side = 1) {
  const d = unit(sub(b, a));
  const nn = [-d[1] * side, d[0] * side];
  const o = (p, r) => add(p, nn.map((v) => v * r * 0.18));
  return limb(a, b, ra, rb, null, null, 0.5, null, shade) + limb(o(a, ra), o(b, rb), ra * 0.8, rb * 0.8, null, null, 0.5, null, col);
}
/** Main qui tient une barre, vue de face (paume visible : supination, dos : pronation). */
function povGrip(x, y, s, mirror, palm) {
  const fingers = [-6.6, -2.2, 2.2, 6.6].map((fx) => `<rect x="${fx - 2.15}" y="${palm ? -8.6 : -10.4}" width="4.3" height="${palm ? 12 : 8}" rx="2.15" fill="${palm ? SKIN : SKIN_FAR}"/>`).join('');
  const inner = palm
    ? `<path d="M-9.2 1C-9.8 7-7.6 12.6-1 13.6C5 14 8.8 10 9.2 3L9.2 1Z" fill="${SKIN}"/>${fingers}`
      + strokes('M-8.4-3.6H8.4', SKIN_LN, 0.6, 0.5) + strokes('M-5 8.6Q0 10.4 5 8.2', SKIN_LN, 0.7, 0.6)
      + limb([8.6, 7], [11.4, -2.6], 3, 2.4, null, null, 0.5, null, SKIN)
    : `${fingers}<path d="M-10 10C-10.6 3-10-3-8.4-6C-4-7.8 4-7.8 8.4-6C10-3 10.6 3 10 10C6 12-6 12-10 10Z" fill="${SKIN}"/>`
      + circles([[-6.6, -5.8, 2.3], [-2.2, -6.4, 2.3], [2.2, -6.4, 2.3], [6.6, -5.8, 2.3]], SKIN)
      + strokes('M-6.6-4.2V-2M-2.2-4.8V-2.6M2.2-4.8V-2.6M6.6-4.2V-2', SKIN_LN, 0.6, 0.55)
      + limb([-9.4, 6], [-3.4, 5.4], 2.9, 2.5, null, null, 0.5, null, SKIN_FAR);
  return `<g transform="translate(${n1(x)} ${n1(y)}) scale(${mirror ? -s : s} ${s})">${inner}</g>`;
}

const POV = {
  tractions(t) {
    const by = lerp(34, 120, t);
    const wall = lerp(150, 215, t);
    const s = lerp(1, 1.22, t);
    return povFrame(`
      <line x1="0" x2="240" y1="${n1(wall)}" y2="${n1(wall)}" stroke="${FLOOR}" stroke-width="2"/>
      ${povLimb([84, by + 10], [60, 206], 6.6 * s, 17, SKIN, SKIN_FAR, -1)}${povLimb([156, by + 10], [180, 206], 6.6 * s, 17, SKIN, SKIN_FAR, 1)}
      ${seg([6, by], [234, by], 7, PROP)}${seg([6, by - 2], [234, by - 2], 1.4, '#4A4A54')}
      ${povGrip(84, by, s * 1.3, true, true)}${povGrip(156, by, s * 1.3, false, true)}
      ${guide(84, by - 22, 156, by - 22)}${label(120, by - 27, 'Paumes vers toi, largeur d\'épaules')}
      ${t > 0.7 ? label(120, by + 34, 'Poitrine vers la barre') : ''}`);
  },
  dc(t) {
    // t = 0 : bras tendus (barre loin), t = 1 : barre sur la poitrine (proche)
    const s = lerp(0.72, 1.12, t);
    const y = lerp(70, 112, t);
    const hx = 46 * s;
    const bar = `${seg([120 - 112 * s, y], [120 + 112 * s, y], 5 * s, '#5A5A62')}
      <rect x="${n1(120 - 106 * s)}" y="${n1(y - 22 * s)}" width="${n1(9 * s)}" height="${n1(44 * s)}" rx="${n1(3 * s)}" fill="${PROP}"/>
      <rect x="${n1(120 + 97 * s)}" y="${n1(y - 22 * s)}" width="${n1(9 * s)}" height="${n1(44 * s)}" rx="${n1(3 * s)}" fill="${PROP}"/>`;
    return povFrame(`
      ${[40, 95, 150].map((x) => `<rect x="${x}" y="8" width="50" height="5" rx="2.5" fill="#1A1A20"/>`).join('')}
      ${povLimb([120 - hx, y + 10 * s], [lerp(70, 34, t), 206], 6.8 * s, 17, SKIN, SKIN_FAR, -1)}${povLimb([120 + hx, y + 10 * s], [lerp(170, 206, t), 206], 6.8 * s, 17, SKIN, SKIN_FAR, 1)}
      ${bar}
      ${povGrip(120 - hx, y, s * 1.3, false, false)}${povGrip(120 + hx, y, s * 1.3, true, false)}
      ${label(120, y - 30 * s, t < 0.5 ? 'Barre au-dessus des épaules' : 'Descends vers le bas des pecs')}
      ${label(120, 182, 'Poignets droits, au-dessus des coudes')}`);
  },
  fentes(t) {
    // Vue plongeante sur la jambe avant : le genou avance au-dessus du pied, dans son axe
    const ky = lerp(156, 120, t);
    const ks = lerp(1, 1.12, t);
    const hem = lerp(206, ky, 0.42);
    return povFrame(`
      ${[-60, -20, 20, 60].map((d) => `<line x1="${120 + d * 0.4}" y1="30" x2="${120 + d * 2.2}" y2="190" stroke="#16161B" stroke-width="1.5"/>`).join('')}
      <line x1="0" x2="240" y1="30" y2="30" stroke="${FLOOR}" stroke-width="2"/>
      ${place([120, 106], 180, SHOE_TOP, 3.1, 3.1)}
      ${povLimb([120, 104], [120, ky], 9, 13 * ks, SKIN, SKIN_FAR)}
      ${guide(120, 40, 120, 190)}
      ${povLimb([120, 214], [120, ky], 34 * ks, 15 * ks, SKIN, SKIN_FAR)}
      ${strokes(`M${n1(120 - 7 * ks)} ${n1(ky + 4)}q${n1(7 * ks)} ${n1(5 * ks)} ${n1(14 * ks)} 0`, SKIN_LN, 1.1, 0.6)}
      ${limb([120, 214], [120, hem], 36 * ks, 30 * ks, null, null, 0.5, null, SHORTS)}
      ${strokes(`M${n1(120 - 26 * ks)} ${n1(hem + 8)}Q120 ${n1(hem - 6)} ${n1(120 + 26 * ks)} ${n1(hem + 8)}`, SHORTS_FAR, 1.4, 0.8)}
      ${label(120, 24, 'Genou dans l\'axe du pied')}
      ${t > 0.6 ? label(182, ky + 4, 'Talon collé au sol') : ''}`);
  },
  lat(t) {
    const hy = lerp(186, 92, t);
    const ex = lerp(40, 22, t);
    const arm = (sx, hx, m) => {
      const a = [sx, 220], w = [hx, hy];
      const d = unit(sub(w, a));
      return povLimb(a, w, 21, 9, SKIN, SKIN_FAR, m)
        + limb(a, mixP(a, w, 0.36), 25, 21, null, null, 0.5, null, SHIRT)
        + `<g transform="translate(${P(add(w, d.map((v) => v * 12)))}) rotate(${n1(angle(d))})"><rect x="-7" y="-21" width="14" height="42" rx="5" fill="${PROP}"/><rect x="-4.5" y="-19" width="3.4" height="38" rx="1.7" fill="#50505A"/></g>`
        + place(w, angle(d), FIST.n, 2.4, 2.4 * m);
    };
    return povFrame(`
      ${guide(0, 88, 240, 88)}${label(120, 80, 'Stop à hauteur d\'épaules')}
      ${arm(lerp(66, 36, t), ex, -1)}${arm(lerp(174, 204, t), 240 - ex, 1)}
      ${label(120, 176, 'Mène avec les coudes, épaules basses')}`);
  },
  toeTouch(t) {
    const hy = lerp(150, 70, t);
    const sole = (x) => `<g transform="translate(${x} 20)"><ellipse rx="12" ry="9.5" fill="${NEAR.sole}"/><ellipse rx="9" ry="6.8" fill="#D6D6DC"/>${strokes('M-6-2.4H6M-7 0H7M-6 2.4H6', '#BDBDC4', 1)}</g>`;
    return povFrame(`
      ${povLimb([104, 214], [110, 30], 24, 10, SKIN, SKIN_FAR, -1)}${povLimb([136, 214], [130, 30], 24, 10, SKIN, SKIN_FAR, 1)}
      ${limb([102, 214], [105, 160], 27, 24, null, null, 0.5, null, SHORTS)}${limb([138, 214], [135, 160], 27, 24, null, null, 0.5, null, SHORTS)}
      ${sole(110)}${sole(130)}
      ${povLimb([60, 214], [106, hy + 8], 14, 7, SKIN, SKIN_FAR, -1)}${povLimb([180, 214], [134, hy + 8], 14, 7, SKIN, SKIN_FAR, 1)}
      ${limb([60, 214], [74, 186], 18, 16, null, null, 0.5, null, SHIRT)}${limb([180, 214], [166, 186], 18, 16, null, null, 0.5, null, SHIRT)}
      <circle cx="120" cy="${n1(hy - 6)}" r="17" fill="${PROP_2}" stroke="${PROP}" stroke-width="3"/><circle cx="120" cy="${n1(hy - 6)}" r="4.6" fill="${PROP}"/>
      ${place([106, hy + 8], -60, FIST.n, 1.9, -1.9)}${place([134, hy + 8], -120, FIST.n, 1.9, 1.9)}
      ${label(120, 186, 'Regarde tes pieds, monte vers eux')}`);
  },
  reverse(t) {
    const ky = lerp(186, 104, t);
    const ks = lerp(0.9, 1.35, t);
    const leg = (x, m) => {
      const k = [x, ky], f = [x + m * 4, ky - 48 * ks];
      return povLimb(f, k, 9 * ks, 15 * ks, SKIN, SKIN_FAR, m)
        + place([f[0], f[1] - 2], -90, SHOE_TOP, 1.5 * ks, 1.5 * ks)
        + povLimb([x - m * 2, 230], k, 26, 17 * ks, SKIN, SKIN_FAR, m)
        + limb([x - m * 2, 230], mixP([x - m * 2, 230], k, 0.45), 28, 22, null, null, 0.5, null, SHORTS)
        + strokes(`M${n1(x - 6 * ks)} ${n1(ky - 3)}q${n1(6 * ks)} ${n1(-5 * ks)} ${n1(12 * ks)} 0`, SKIN_LN, 1, 0.6);
    };
    return povFrame(`
      ${[40, 95, 150].map((x) => `<rect x="${x}" y="8" width="50" height="5" rx="2.5" fill="#1A1A20"/>`).join('')}
      ${leg(98, -1)}${leg(142, 1)}
      ${label(120, 30, t > 0.5 ? 'Les fesses décollent' : 'Genoux vers la poitrine')}`);
  },
  twist(t) {
    const k = lerp(-1, 1, t);
    const x = 120 + 70 * k;
    const leg = (kx, fx, m) => {
      const kn = [kx, 168], ft = [fx, 120];
      return povLimb(ft, kn, 8, 13, SKIN_FAR, '#C99572', m) + place([fx, 108], 180, SHOE_TOP, -1.3 * m, 1.3)
        + povLimb([kx - m * 6, 226], kn, 26, 17, SKIN, SKIN_FAR, m)
        + limb([kx - m * 6, 226], [kx - m * 4, 206], 28, 25, null, null, 0.5, null, SHORTS)
        + strokes(`M${kx - 8} ${n1(170)}q8-7 16 0`, SKIN_LN, 1, 0.6);
    };
    return povFrame(`
      <g transform="rotate(${n1(-6 * k)} 120 95)"><line x1="-40" x2="280" y1="70" y2="70" stroke="${FLOOR}" stroke-width="2"/></g>
      ${leg(98, 94, -1)}${leg(142, 146, 1)}
      ${povLimb([60, 214], [x - 15, 120], 15, 7, SKIN, SKIN_FAR, -1)}${povLimb([180, 214], [x + 15, 120], 15, 7, SKIN, SKIN_FAR, 1)}
      ${limb([60, 214], [70, 192], 19, 17, null, null, 0.5, null, SHIRT)}${limb([180, 214], [170, 192], 19, 17, null, null, 0.5, null, SHIRT)}
      <circle cx="${n1(x)}" cy="112" r="17" fill="${PROP_2}" stroke="${PROP}" stroke-width="3"/>
      ${place([x - 15, 120], -70, FIST.n, 1.8, -1.8)}${place([x + 15, 120], -110, FIST.n, 1.8, 1.8)}
      ${label(120, 40, 'Suis le poids des yeux, les épaules tournent')}`);
  },
  hollow(t) {
    const b = Math.sin(t * Math.PI) * 3;
    return povFrame(`
      ${[40, 95, 150].map((x) => `<rect x="${x}" y="8" width="50" height="5" rx="2.5" fill="#1A1A20"/>`).join('')}
      ${povLimb([104, 214], [114, 66 + b], 25, 9, SKIN, SKIN_FAR, -1)}${povLimb([136, 214], [126, 66 + b], 25, 9, SKIN, SKIN_FAR, 1)}
      ${limb([102, 214], [106, 156], 28, 24, null, null, 0.5, null, SHORTS)}${limb([138, 214], [134, 156], 28, 24, null, null, 0.5, null, SHORTS)}
      ${place([113, 64 + b], -94, SHOE_TOP, 1.3, 1.3)}${place([127, 64 + b], -86, SHOE_TOP, 1.3, 1.3)}
      ${label(120, 34, 'Pieds bas mais décollés, jambes serrées')}
      ${label(120, 182, 'Bas du dos plaqué au sol')}`);
  },
};

/* ================= Vues de dos ================= */
function pullBackJ(t, o = {}) {
  const hipY = lerp(132, 84, t);
  const J = { hip: [120, hipY], sc: [120, hipY - 48] };
  J.shR = [135, J.sc[1]]; J.shL = [105, J.sc[1]];
  J.head = [120, J.sc[1] - 18];
  J.hipR = [128, hipY]; J.hipL = [112, hipY];
  [J.elbR, J.wriR] = ik(J.shR, [142, 30], L.ua, L.fa, 1);
  [J.elbL, J.wriL] = ik(J.shL, [98, 30], L.ua, L.fa, -1);
  [J.kneR, J.ankR] = limbJ(J.hipR, { u: -87, f: -91 }, L.th, L.sh);
  [J.kneL, J.ankL] = limbJ(J.hipL, { u: -93, f: -89 }, L.th, L.sh);
  // omoplates : descendent et se rapprochent en haut
  J.blade = lerp(9, 13, t); J.bladeX = lerp(9, 6, t);
  return Object.assign(J, o);
}

const BACK = {
  tractions(t) {
    const f = { s: 0.8, x: 24, y: 6 };
    const T = (q) => [f.x + f.s * q[0], f.y + f.s * q[1]];
    const J = pullBackJ(t);
    const grips = place([98, 26], 0, `<rect x="-5.4" y="-4.6" width="10.8" height="10" rx="4.4" fill="${SKIN}"/>${strokes('M-3.4-4V4.6M0-4.4V4.8M3.4-4V4.6', SKIN_LN, 0.6, 0.6)}`)
      + place([142, 26], 0, `<rect x="-5.4" y="-4.6" width="10.8" height="10" rx="4.4" fill="${SKIN}"/>${strokes('M-3.4-4V4.6M0-4.4V4.8M3.4-4V4.6', SKIN_LN, 0.6, 0.6)}`);
    const scene = `${pullBar(40, 200, 24)}${drawFront(J, { hand: 'fist' }, 'back')}${grips}`;
    const bp = [120 + J.bladeX + 3, J.sc[1] + J.blade];
    return `${floor(182)}<g transform="translate(${f.x} ${f.y}) scale(${f.s})">${scene}</g>
      ${pin(T(bp), add(T(bp), [44, 30]), 'Omoplates vers le bas', 'start')}
      ${t >= 0.35 ? pin(T(J.elbL), add(T(J.elbL), [-26, 26]), 'Coudes vers les côtes', 'end') : ''}`;
  },
  dc(t) {
    // Vue depuis la tête du banc : la barre, les avant-bras et la largeur de prise
    const barY = lerp(72, 108, t);
    const shR = [143, 124], shL = [97, 124];
    const hR = [156, barY], hL = [84, barY];
    const eR = [hR[0] + lerp(0, 2, t), barY + 25], eL = [hL[0] - lerp(0, 2, t), barY + 25];
    const arm = (sh, e, h) => limb(sh, e, 6, 4, 5.2, 5, 0.45, null, SKIN) + limb(e, [h[0], h[1] + 4], 4.2, 3, 4.6, 4.4, 0.3, null, SKIN)
      + limb(sh, mixP(sh, e, 0.42), 7.4, 6.4, null, null, 0.5, null, SHIRT);
    const fist = (h) => `<rect x="${n1(h[0] - 5.6)}" y="${n1(h[1] - 5)}" width="11.2" height="11" rx="4.6" fill="${SKIN}"/>${strokes(`M${n1(h[0] - 5)} ${n1(h[1] - 1)}h10`, SKIN_LN, 0.7, 0.6)}`;
    const crown = place([120, 136], 180, `${circles([[0, 0, 10.4]], HAIR)}${circles([[-7, -6, 3.2], [0, -9, 3.4], [7, -6, 3.2], [-9.4, 1.4, 3.2], [9.4, 1.4, 3.2], [-6, 7.6, 3.2], [0, 9.4, 3.4], [6, 7.6, 3.2], [-3, -1, 3], [3.4, 2.2, 3]], HAIR)}`
      + strokes('M-8-6q1.6-1.6 3.2-.4M-1.6-9.6q1.6-1.2 3.2 0M5-6.6q1.6-.6 2.8.8M-10.4.6q.6-1.6 2.2-1.6M7.8.2q1.6 0 2 1.6M-4.4-1.6q1.4-1.2 2.8 0M2 1.6q1.4-1 2.8.2M-7 7q1.2-1.2 2.6-.6M-1.4 8.8q1.4-1 2.8 0M4.6 7q1.4-.6 2.4.6', HAIR_HI, 0.9, 0.85));
    const scene = `
      ${floor()}
      <rect x="102" y="140" width="36" height="9" rx="4.5" fill="${PROP}"/><rect x="116" y="149" width="8" height="23" fill="${PROP_2}"/>
      <path d="M92 134C90 121 102 110 120 109C138 110 150 121 148 134Z" fill="${SHIRT}"/>
      ${strokes('M104 116Q120 112 136 116', SHIRT_SH, 1.2, 0.8)}
      ${arm(shL, eL, hL)}${arm(shR, eR, hR)}
      ${seg([28, barY], [212, barY], 4, '#5A5A62')}
      <rect x="30" y="${n1(barY - 23)}" width="10" height="46" rx="3" fill="${PROP}"/><rect x="200" y="${n1(barY - 23)}" width="10" height="46" rx="3" fill="${PROP}"/>
      ${fist(hL)}${fist(hR)}
      ${crown}`;
    const midF = [eR[0], (eR[1] + hR[1]) / 2];
    return `${scene}
      ${guide(hR[0], barY - 34, hR[0], barY + 40)}
      ${pin(midF, [midF[0] + 24, midF[1] + 34], 'Avant-bras verticaux', 'start')}
      ${tag(120, Math.max(18, barY - 36), 'Prise un peu plus large que les épaules')}`;
  },
};

/* ================= Vues « À éviter » ================= */
/** Développé couché vu du dessus : angle des coudes (flare en degrés). u = 0 bras tendus, 1 barre sur la poitrine. */
function dcTop(u, flare, ghost) {
  const O = [76, 95];
  const R = (q) => [O[0] + q[1], O[1] - q[0]]; // repère couché : tête à gauche
  const proj = lerp(0.3, 1, u);
  const dir = (side) => [side * Math.sin(rad(flare)), Math.cos(rad(flare))];
  const J = { sc: [0, 0], hip: [0, 48], shL: [-15, 0], shR: [15, 0], head: [0, -18], hipL: [-8, 48], hipR: [8, 48] };
  J.elbR = add(J.shR, dir(1).map((v) => v * L.ua * proj));
  J.elbL = add(J.shL, dir(-1).map((v) => v * L.ua * proj));
  J.wriR = add(J.elbR, [0, -1.5]); J.wriL = add(J.elbL, [0, -1.5]);
  J.kneR = [10, 84]; J.kneL = [-10, 84]; J.ankR = [11, 90]; J.ankL = [-11, 90];
  const hs = lerp(1.25, 1, u);
  const by = J.wriR[1];
  const legs = (h, k, a, side) => limb(h, k, 7.6, 6.4, 7.6, 7.4, 0.4, null, SKIN) + place(a, 0, SHOE_TOP, side, 1);
  let inner = `<rect x="-14" y="-40" width="28" height="112" rx="6" fill="${PROP}"/>`
    + legs(J.hipL, J.kneL, J.ankL, -1) + legs(J.hipR, J.kneR, J.ankR, 1)
    + `<path d="M-11.4 43L11.4 43L17 66L1 66L0 56L-1 66L-17 66Z" fill="${SHORTS}" stroke="${SHORTS}" stroke-width="2.4" stroke-linejoin="round"/>`
    + limb([0, -13], [0, -3], 3.9, 4.4, null, null, 0.5, null, SKIN)
    + frontTorso(J, 'front') + place(J.head, 0, headFront(0));
  const arm = (sh, e) => limb(sh, e, 5.4, 4.2, 4.9, 4.7, 0.45, null, SKIN) + limb(sh, mixP(sh, e, 0.45), 6.8, 6, null, null, 0.5, null, SHIRT);
  inner += arm(J.shL, J.elbL) + arm(J.shR, J.elbR);
  inner += `<line x1="-74" x2="74" y1="${n1(by)}" y2="${n1(by)}" stroke="#5A5A62" stroke-width="4" stroke-linecap="round"/>`
    + `<rect x="-72" y="${n1(by - 4)}" width="7" height="8" rx="2" fill="${PROP}"/><rect x="65" y="${n1(by - 4)}" width="7" height="8" rx="2" fill="${PROP}"/>`
    + `<rect x="-64" y="${n1(by - 21)}" width="6" height="42" rx="2.5" fill="${PROP}"/><rect x="58" y="${n1(by - 21)}" width="6" height="42" rx="2.5" fill="${PROP}"/>`;
  const fist = (p) => `<g transform="translate(${P(p)}) scale(${n1(hs)})"><rect x="-5.6" y="-6" width="11.2" height="10.4" rx="4.6" fill="${SKIN}"/>${strokes('M-3.6-5.4V-2M0-5.8V-2.2M3.6-5.4V-2', SKIN_LN, 0.6, 0.6)}</g>`;
  inner += fist(J.wriL) + fist(J.wriR);
  let out = `<g transform="translate(${O[0]} ${O[1]}) rotate(-90)">${inner}</g>`;
  // repères : angle bras / buste
  const sh = R(J.shL), el = R(J.elbL);
  const axis = R([-15, 26]);
  const r = 15;
  const a1 = angle(sub(axis, sh)), a2 = angle(sub(el, sh));
  const arc = `M${P(add(sh, [r * Math.cos(rad(a1)), r * Math.sin(rad(a1))]))}A${r} ${r} 0 0 ${a2 > a1 ? 1 : 0} ${P(add(sh, [r * Math.cos(rad(a2)), r * Math.sin(rad(a2))]))}`;
  out += strokes(`M${P(sh)}L${P(axis)}`, 'rgba(255,255,255,.35)', 1, 1);
  if (ghost) {
    const g = R(add([-15, 0], [-Math.sin(rad(45)) * 30, Math.cos(rad(45)) * 30]));
    const ge = R(add([-15, 0], [-Math.sin(rad(45)) * L.ua * proj, Math.cos(rad(45)) * L.ua * proj]));
    out += `<path d="${limbD(sh, ge, 5.4, 4.2, 4.9, 4.7, 0.45)}" fill="rgba(52,209,122,.08)" stroke="${CUE}" stroke-width="1" stroke-dasharray="2.5 2.5" opacity=".8"/>`;
    out += guide(n1(sh[0]), n1(sh[1]), n1(g[0]), n1(g[1])) + tag(g[0] + 12, g[1] + 12, '45° ✓', 'middle', CUE);
  }
  out += strokes(arc, BAD, 1.8) + tag(sh[0] - 30, sh[1] + 16, '90° ✗', 'middle', BAD);
  out += pin(R(J.elbR), add(R(J.elbR), [34, 12]), 'Coudes écartés', 'start', BAD);
  return out;
}

const BAD_SIDE = {
  // Tractions : élan des jambes (kipping)
  kip: [
    [0, { hip: [130, 129], torso: 96, neck: 0, a1: { ik: [128, 31], bend: 1 }, l1: { u: -97, f: -118 }, l2: { u: -92, f: -112 } }],
    [0.3, { hip: [138, 126], torso: 86, neck: 6, a1: { ik: [128, 31], bend: 1 }, l1: { u: -118, f: -150 }, l2: { u: -114, f: -146 } }],
    [0.68, { hip: [118, 104], torso: 116, neck: -4, a1: { ik: [128, 31], bend: 1 }, l1: { u: -22, f: -84 }, l2: { u: -26, f: -88 } }],
    [1, { hip: [121, 82], torso: 108, neck: 0, a1: { ik: [128, 31], bend: 1 }, l1: { u: -58, f: -112 }, l2: { u: -62, f: -114 } }],
  ],
  // Tractions : demi-répétitions (bras jamais tendus)
  half: [
    [0, { hip: [128, 106], torso: 99, neck: 0, a1: { ik: [128, 31], bend: 1 }, l1: { u: -97, f: -118 }, l2: { u: -92, f: -112 } }],
    [1, { hip: [125, 80], torso: 102, neck: 0, a1: { ik: [128, 31], bend: 1 }, l1: { u: -97, f: -118 }, l2: { u: -92, f: -112 } }],
  ],
  // Tractions : menton tendu vers la barre
  chin: [
    [0, { hip: [129, 116], torso: 97, neck: 0, a1: { ik: [128, 31], bend: 1 }, l1: { u: -97, f: -118 }, l2: { u: -92, f: -112 } }],
    [0.5, { hip: [127, 92], torso: 100, neck: 0, a1: { ik: [128, 31], bend: 1 }, l1: { u: -97, f: -118 }, l2: { u: -92, f: -112 } }],
    [1, { hip: [127, 91], torso: 99, neck: 34, a1: { ik: [128, 31], bend: 1 }, l1: { u: -97, f: -118 }, l2: { u: -92, f: -112 } }],
  ],
};
// Développé couché : épaules fixes sur le banc, la hanche se soulève (fesses décollées)
const dcPose = (torso, bar) => {
  const sho = [104, 107];
  return { hip: sub(sho, polar(L.torso, torso)), torso, neck: 0, a1: { ik: bar, bend: 1 }, l1: { ik: [186, 166], bend: -1 }, l2: { ik: [180, 166], bend: -1 }, f1: 0, f2: 0 };
};

function sideScene(d, p, t, marks, extra = '', ghost = null) {
  const J = solveSide(p, d);
  const parts = drawSide(J, p, d);
  const f = d.fit || { s: 1, x: 0, y: 0 };
  const tf = (q) => [f.x + f.s * q[0], f.y + f.s * q[1]];
  let gh = '';
  if (ghost) {
    const G = drawSide(solveSide(ghost, d), ghost, d);
    gh = `<g opacity=".24">${G.far}${G.body}${G.near}</g>`;
  }
  const scene = `${d.noFloor ? '' : floor()}${gh}${parts.far}${d.props ? d.props(J) : ''}${parts.body}${d.mid ? d.mid(J) : ''}${parts.near}${d.after ? d.after(J) : ''}`;
  const ex = typeof extra === 'function' ? extra(J, tf) : extra;
  return `${d.noFloor ? floor(182) : ''}<g transform="translate(${f.x} ${f.y}) scale(${f.s})">${scene}</g>${ex}${markers(J, marks || [], tf, t)}`;
}

const BAD_VIEWS = {
  tractions(t) {
    const d = LIB.tractions.side;
    if (t < 1.5) {
      const u = Math.min(1, Math.max(0, t));
      const p = keys(BAD_SIDE.kip, u);
      // trajectoire de balancier des pieds
      const arc = (J, tf) => {
        const c = tf([128, 31]);
        return `<path d="M${n1(c[0] - 46)} ${n1(c[1] + 118)}Q${n1(c[0] + 6)} ${n1(c[1] + 150)} ${n1(c[0] + 60)} ${n1(c[1] + 96)}" fill="none" stroke="${BAD}" stroke-width="1.6" stroke-dasharray="4 4" opacity=".85"/>`
          + `<path d="M${n1(c[0] + 60)} ${n1(c[1] + 96)}l-7.4 1.2M${n1(c[0] + 60)} ${n1(c[1] + 96)}l-1.8 7.2" stroke="${BAD}" stroke-width="1.6" stroke-linecap="round" fill="none"/>`;
      };
      return badBadge() + sideScene(d, p, 0, [{ at: 'kne1', text: 'Élan des jambes', dx: 34, dy: 18, anchor: 'start', bad: true }], arc);
    }
    if (t < 3.5) {
      const u = Math.min(1, Math.max(0, t - 2));
      const p = keys(BAD_SIDE.half, u);
      // silhouette fantôme : la position bras tendus jamais atteinte
      const gap = (J, tf) => {
        const a = tf(J.ank1), b = tf(add(J.ank1, [0, 23]));
        return `<path d="M${n1(a[0] + 12)} ${n1(a[1])}V${n1(b[1])}M${n1(a[0] + 8)} ${n1(a[1])}h8M${n1(a[0] + 8)} ${n1(b[1])}h8" stroke="${BAD}" stroke-width="1.4" stroke-dasharray="3 3" fill="none"/>${tag(a[0] + 18, b[1] + 4, 'Amplitude manquante', 'start', BAD)}`;
      };
      return badBadge() + sideScene(d, p, 0, u < 0.45 ? [{ at: 'elb1', text: 'Bras jamais tendus', dx: 32, dy: 18, anchor: 'start', bad: true }] : [], u < 0.45 ? gap : '', LIB.tractions.side.A);
    }
    const u = Math.min(1, Math.max(0, t - 4));
    const p = keys(BAD_SIDE.chin, u);
    return badBadge() + sideScene(d, p, 0, u > 0.6 ? [{ at: 'chin', text: 'Menton tendu vers la barre', dx: 34, dy: 44, anchor: 'start', bad: true }] : []);
  },
  dc(t) {
    if (t < 1.5) return badBadge() + dcTop(Math.min(1, Math.max(0, t)), 90, true);
    const d = LIB.dc.side;
    if (t < 3.5) {
      const u = Math.min(1, Math.max(0, t - 2));
      const p = dcPose(lerp(180, 194, Math.min(1, u * 1.3)), [lerp(116, 106, u), lerp(95, 54, u)]);
      return badBadge() + sideScene(d, p, 1, u > 0.25 ? [{ at: 'hip', text: 'Fesses décollées', dx: 22, dy: -40, anchor: 'start', bad: true }] : []);
    }
    const u = t - 4;
    const p = dcPose(180, [lerp(106, 116, u), lerp(52, 98, u)]);
    const hit = u > 0.86;
    const burst = (J, tf) => {
      if (!hit) return '';
      const c = tf(add(J.grip1, [0, 6]));
      return strokes(`M${n1(c[0] - 12)} ${n1(c[1] - 2)}l-6-4M${n1(c[0] + 12)} ${n1(c[1] - 2)}l6-4M${n1(c[0])} ${n1(c[1] - 18)}v-6M${n1(c[0] - 9)} ${n1(c[1] - 14)}l-4-5M${n1(c[0] + 9)} ${n1(c[1] - 14)}l4-5`, BAD, 1.6);
    };
    return badBadge() + sideScene(d, p, 1, hit ? [{ at: 'grip1', text: 'Rebond sur la poitrine', dx: 30, dy: -34, anchor: 'start', bad: true }] : [], burst);
  },
};

/* ================= Bibliothèque d'exercices ================= */
const BAR = [128, 31];
const LIB = {
  tractions: {
    name: 'Tractions supination',
    side: {
      title: 'De côté',
      fit: { s: 0.8, x: 22, y: 8 },
      noFloor: true,
      props: () => pullBar(70, 190, 26),
      A: { hip: [130, 129], torso: 96, a1: { ik: BAR, bend: 1 }, l1: { u: -97, f: -118 }, l2: { u: -92, f: -112 } },
      B: { hip: [125, 80], torso: 102, a1: { ik: BAR, bend: 1 }, l1: { u: -97, f: -118 }, l2: { u: -92, f: -112 } },
      marks: [{ at: 'elb1', text: 'Coudes vers les hanches', dx: 30, dy: 24, anchor: 'start' }, { at: 'head', text: 'Menton au-dessus', dx: -40, dy: 4, anchor: 'end', from: 0.75 }],
    },
    pov: POV.tractions,
    back: BACK.tractions,
    seq: [{ to: 1, dur: 1100, label: 'Monte en tirant les coudes' }, { hold: 400, label: 'Menton au-dessus de la barre' }, { to: 0, dur: 2300, label: 'Descends lentement' }, { hold: 500, label: 'Bras tendus, épaules engagées' }],
    bad: {
      render: BAD_VIEWS.tractions,
      still: 0.68,
      seq: [
        { hold: 400, label: 'Erreur : élan des jambes (kipping)' },
        { to: 0.3, dur: 600, label: 'Erreur : élan des jambes (kipping)' },
        { to: 1, dur: 700, label: 'Erreur : élan des jambes (kipping)' },
        { hold: 300, label: 'Erreur : élan des jambes (kipping)' },
        { to: 0, dur: 1000, label: 'À faire : jambes serrées, corps gainé, aucun élan' },
        { hold: 700, label: 'À faire : jambes serrées, corps gainé, aucun élan' },
        { set: 2 },
        { to: 3, dur: 700, label: 'Erreur : demi-répétitions' },
        { to: 2, dur: 700, label: 'Erreur : demi-répétitions' },
        { to: 3, dur: 700, label: 'Erreur : demi-répétitions' },
        { to: 2, dur: 700, label: 'Erreur : demi-répétitions' },
        { hold: 1100, label: 'À faire : redescends jusqu\'aux bras tendus' },
        { set: 4 },
        { to: 4.5, dur: 900, label: 'Erreur : cou tendu pour passer le menton' },
        { to: 5, dur: 500, label: 'Erreur : cou tendu pour passer le menton' },
        { hold: 700, label: 'Erreur : cou tendu pour passer le menton' },
        { to: 4.5, dur: 500, label: 'À faire : monte la poitrine, cou neutre' },
        { to: 4, dur: 900, label: 'À faire : monte la poitrine, cou neutre' },
      ],
    },
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
      props: (J) => bench(58, 168, 116) + plate(J.grip1, 17),
      A: { hip: [152, 107], torso: 180, neck: 0, a1: { ik: [106, 54], bend: 1 }, l1: { ik: [186, 166], bend: -1 }, l2: { ik: [180, 166], bend: -1 }, f1: 0, f2: 0 },
      B: { hip: [152, 107], torso: 180, neck: 0, a1: { ik: [116, 98], bend: 1 }, l1: { ik: [186, 166], bend: -1 }, l2: { ik: [180, 166], bend: -1 }, f1: 0, f2: 0 },
      marks: [{ at: 'sho', text: 'Omoplates serrées', dx: -6, dy: 40 }, { at: 'grip1', text: 'Bas des pecs', dx: 36, dy: -8, anchor: 'start', from: 0.7 }],
    },
    pov: POV.dc,
    back: BACK.dc,
    seq: [{ hold: 400, label: 'Bras tendus, barre au-dessus des épaules' }, { to: 1, dur: 1800, label: 'Descends en contrôlant' }, { hold: 250, label: 'Touche légèrement la poitrine' }, { to: 0, dur: 1000, label: 'Pousse' }],
    bad: {
      render: BAD_VIEWS.dc,
      still: 1,
      seq: [
        { hold: 400, label: 'Erreur : coudes écartés à 90°' },
        { to: 1, dur: 1500, label: 'Erreur : coudes écartés à 90°' },
        { hold: 400, label: 'Erreur : coudes écartés à 90°' },
        { to: 0, dur: 1100, label: 'À faire : coudes à environ 45° du buste' },
        { hold: 700, label: 'À faire : coudes à environ 45° du buste' },
        { set: 2 },
        { hold: 300, label: 'Erreur : les fesses décollent du banc' },
        { to: 3, dur: 1000, label: 'Erreur : les fesses décollent du banc' },
        { hold: 500, label: 'Erreur : les fesses décollent du banc' },
        { to: 2, dur: 1100, label: 'À faire : fesses collées, pieds poussent dans le sol' },
        { hold: 600, label: 'À faire : fesses collées, pieds poussent dans le sol' },
        { set: 4 },
        { hold: 300, label: 'Erreur : la barre rebondit sur la poitrine' },
        { to: 5, dur: 480, label: 'Erreur : la barre rebondit sur la poitrine' },
        { to: 4.55, dur: 170, label: 'Erreur : la barre rebondit sur la poitrine' },
        { to: 4, dur: 650, label: 'Erreur : la barre rebondit sur la poitrine' },
        { hold: 1100, label: 'À faire : descends en 2 s, léger contact, puis pousse' },
      ],
    },
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
      A: { hip: [114, 101], torso: 82, a1: { u: -94, f: -92 }, a2: { u: -88, f: -90 }, l1: { ik: [150, 165], bend: -1 }, l2: { ik: [50, 130], bend: -1 }, f1: 0, f2: 180 },
      B: { hip: [106, 126], torso: 76, a1: { u: -100, f: -96 }, a2: { u: -92, f: -92 }, l1: { ik: [150, 165], bend: -1 }, l2: { ik: [50, 130], bend: -1 }, f1: 0, f2: 180 },
      mid: (J) => dumbbellEnd(J.grip1),
      marks: [{ at: 'kne1', text: 'Genou au-dessus du pied', dx: 22, dy: -30, anchor: 'start' }, { at: 'hip', text: 'Descends à la verticale', dx: -10, dy: -82 }],
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
      A: { hip: [120, 95], aR: { u: -80, f: -86 } },
      B: { hip: [120, 95], aR: { u: -2, f: -14 } },
      under: (J) => dumbbellEnd(J.gripR) + dumbbellEnd(J.gripL),
      marks: [{ at: 'elbR', text: 'Jusqu\'aux épaules', dx: 24, dy: -28, anchor: 'start', from: 0.45 }, { at: (J) => [J.shL[0] + 3, J.shL[1] - 4], text: 'Épaules basses', dx: -20, dy: -26, anchor: 'end' }],
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
      A: { hip: [140, 162], torso: 180, neck: -8, a1: { u: 62, f: 62 }, a2: { u: 60, f: 60 }, l1: { u: 88, f: 90 }, l2: { u: 92, f: 91 }, f1: 0, f2: 0 },
      B: { hip: [140, 162], torso: 156, neck: -14, a1: { u: 50, f: 50 }, a2: { u: 48, f: 48 }, l1: { u: 88, f: 90 }, l2: { u: 92, f: 91 }, f1: 0, f2: 0 },
      mid: (J) => `<circle cx="${n1(J.grip1[0])}" cy="${n1(J.grip1[1])}" r="8.5" fill="${PROP_2}" stroke="${PROP}" stroke-width="2.5"/>`,
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
      anchor: ['sho', [86, 162]],
      hand: 'open',
      A: { hip: [134, 162], torso: 180, neck: 0, a1: { u: -2, f: 0 }, l1: { u: 90, f: 0 }, l2: { u: 94, f: 2 }, f1: 0, f2: 0 },
      B: { hip: [134, 162], torso: 202, neck: -22, a1: { u: -2, f: 0 }, l1: { u: 132, f: 58 }, l2: { u: 136, f: 60 }, f1: 60, f2: 62 },
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
      A: { hip: [120, 158], k: -1, lean: 6, tl: 44, legs: 'seated', aR: { ik: [86, 132], bend: 1 }, aL: { ik: [86, 132], bend: -1 } },
      B: { hip: [120, 158], k: 1, lean: 6, tl: 44, legs: 'seated', aR: { ik: [154, 132], bend: 1 }, aL: { ik: [154, 132], bend: -1 } },
      between: (J) => `<circle cx="${n1((J.gripR[0] + J.gripL[0]) / 2)}" cy="${n1((J.gripR[1] + J.gripL[1]) / 2)}" r="9.5" fill="${PROP_2}" stroke="${PROP}" stroke-width="2.5"/>`,
      marks: [{ at: 'sc', text: 'Les épaules tournent', dx: 0, dy: -46 }],
      floorY: 170,
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
      hand: 'open',
      A: { hip: [124, 161], torso: 166, neck: -6, a1: { u: 172, f: 174 }, l1: { u: 14, f: 12 }, l2: { u: 16, f: 13 } },
      B: { hip: [124, 161], torso: 163, neck: -8, a1: { u: 170, f: 172 }, l1: { u: 17, f: 14 }, l2: { u: 18, f: 15 } },
      marks: [{ at: 'hip', text: 'Bas du dos collé au sol', dx: -30, dy: -60 }, { at: 'ank1', text: 'Jambes tendues', dx: 0, dy: -24 }],
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
export function renderFrame(key, view, t) {
  const ex = LIB[key];
  if (view === 'pov') return ex.pov(t);
  if (view === 'back' && ex.back) return ex.back(t);
  if (view === 'bad' && ex.bad) return ex.bad.render(t);
  const p = mix(ex.side.A, ex.side.B, t);
  const d = ex.side;
  if (d.front) {
    const J = solveFront(p);
    return `${floor(d.floorY || 172)}${d.under ? d.under(J) : ''}${drawFront(J, p, 'front', d.between ? d.between(J) : '')}${d.after ? d.after(J) : ''}${markers(J, d.marks || [], undefined, t)}`;
  }
  return sideScene(d, p, t, d.marks);
}

/** Position dans la séquence au temps ms : renvoie { t, label }. */
function timeline(seq, ms) {
  const total = seq.reduce((a, s) => a + (s.dur || s.hold || 0), 0);
  let x = ms % total;
  let cur = 0;
  for (const s of seq) {
    if ('set' in s) { cur = s.set; continue; }
    const d = s.dur || s.hold;
    if (x < d) {
      if (s.hold) return { t: cur, label: s.label };
      const k = ease(x / d);
      return { t: lerp(cur, s.to, k), label: s.label };
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
  let t0 = performance.now();
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  openSheet({
    title: ex.name,
    body: `
      <div class="seg fill" role="group" aria-label="Vue">
        <button data-view="side" aria-pressed="true">${ex.side.title}</button>
        ${ex.back ? '<button data-view="back" aria-pressed="false">De dos</button>' : ''}
        <button data-view="pov" aria-pressed="false">À ta place</button>
        ${ex.bad ? '<button data-view="bad" aria-pressed="false">À éviter</button>' : ''}
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
        const bad = view === 'bad' && ex.bad;
        let st;
        if (reduce) st = bad ? { t: ex.bad.still, label: ex.bad.seq[0].label } : { t: 1, label: '' };
        else st = timeline(bad ? ex.bad.seq : ex.seq, now - t0);
        svg.innerHTML = renderFrame(key, view, st.t);
        if (st.label !== lastLabel) {
          lastLabel = st.label;
          ph.textContent = st.label || ' ';
          ph.style.color = bad && /^Erreur/.test(st.label || '') ? 'var(--red, #FF5468)' : '';
          ph.classList.remove('swap'); void ph.offsetWidth; ph.classList.add('swap');
        }
        if (!reduce) raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
      s.body.addEventListener('click', (e) => {
        const b = e.target.closest('[data-view]');
        if (!b) return;
        const prev = view;
        view = b.dataset.view;
        if ((prev === 'bad') !== (view === 'bad')) t0 = performance.now();
        s.body.querySelectorAll('[data-view]').forEach((x) => x.setAttribute('aria-pressed', x === b));
        svg.classList.remove('swap'); void svg.offsetWidth; svg.classList.add('swap');
        if (reduce) frame(performance.now());
      });
    },
    onClose() { cancelAnimationFrame(raf); },
  });
  return true;
}
