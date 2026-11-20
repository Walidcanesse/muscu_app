// Stockage local : toutes les données restent sur le téléphone.
const KEY = 'fonte.v1'; // clé gardée pour ne pas perdre les données existantes

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

const DEFAULT = () => ({
  v: 1,
  goals: { kcal: 2000, p: 140, f: 60, c: 225 },   // objectifs du mode Manuel
  profile: { height: 179, age: 24, sex: 'm', activity: 'mod', weight: 68.5 },
  plan: { mode: 'cut', adjust: 0 },                // cut = sèche, maint = maintien, manual
  workout: [
    { id: 'tractions', name: 'Tractions supination', sets: 3, load: 'Lest' },
    { id: 'dc', name: 'Développé couché', sets: 2, load: 'kg' },
    { id: 'fentes', name: 'Fentes bulgares', sets: 3, load: 'kg' },
    { id: 'lat', name: 'Élévations latérales', sets: 3, load: 'kg' },
  ],
  draft: null,          // séance en cours
  sessions: [],         // séances terminées
  abs: {
    exercises: [
      { id: uid(), name: 'Crunch jambes levées', sec: 45 },
      { id: uid(), name: 'Crunch inversé', sec: 45 },
      { id: uid(), name: 'Russian twist', sec: 45 },
      { id: uid(), name: 'Gainage banane', sec: 45 },
    ],
    rest: 15,
    roundRest: 120,
    rounds: 2,
    voice: true,
  },
  absLog: [],           // dates des circuits terminés
  food: {},             // { 'AAAA-MM-JJ': [entrée] }
  recents: [],          // produits récents
  weights: {},          // { 'AAAA-MM-JJ': kg }
});

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT();
    const data = JSON.parse(raw);
    return { ...DEFAULT(), ...data };
  } catch {
    return DEFAULT();
  }
}

export const state = load();
const listeners = new Set();

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* stockage plein */ }
}

export function update(fn, { silent = false } = {}) {
  fn(state);
  save();
  if (!silent) listeners.forEach((l) => l());
}

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function replaceAll(data) {
  const fresh = { ...DEFAULT(), ...data };
  Object.keys(state).forEach((k) => delete state[k]);
  Object.assign(state, fresh);
  save();
  listeners.forEach((l) => l());
}

// Demande au navigateur de ne pas effacer les données
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().catch(() => {});
}

/* ---------- Dates ---------- */
export function dayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const j = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${j}`;
}
export function fromKey(k) {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(k, n) {
  const d = fromKey(k);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

/* ---------- Calculs ---------- */
export function dayTotals(k) {
  const list = state.food[k] || [];
  return list.reduce((t, e) => {
    const r = e.grams / 100;
    t.kcal += e.per100.kcal * r;
    t.p += e.per100.p * r;
    t.c += e.per100.c * r;
    t.f += e.per100.f * r;
    return t;
  }, { kcal: 0, p: 0, c: 0, f: 0 });
}

export function weightAvg(endKey, days = 7) {
  const vals = [];
  for (let i = 0; i < days; i++) {
    const v = state.weights[addDays(endKey, -i)];
    if (v) vals.push(v);
  }
  if (!vals.length) return null;
  return { avg: vals.reduce((a, b) => a + b, 0) / vals.length, n: vals.length };
}

export function lastSessionFor(exId) {
  for (let i = state.sessions.length - 1; i >= 0; i--) {
    const e = state.sessions[i].entries.find((x) => x.exId === exId);
    if (e && e.sets.some((s) => s.reps)) return { session: state.sessions[i], entry: e };
  }
  return null;
}

/* ---------- Objectifs caloriques ---------- */
export const ACTIVITY = {
  low: { f: 1.3, label: 'Faible', sub: 'Travail assis, 0 à 1 séance par semaine' },
  mod: { f: 1.45, label: 'Modérée', sub: '2 à 3 séances par semaine' },
  high: { f: 1.6, label: 'Élevée', sub: '4 à 5 séances, beaucoup de marche' },
  very: { f: 1.75, label: 'Intense', sub: 'Sport presque tous les jours' },
};

/** Poids de référence : moyenne des pesées sur 7 jours, sinon dernière pesée, sinon poids du profil. */
export function currentWeight() {
  const a = weightAvg(dayKey(), 7);
  if (a) return { w: a.avg, src: 'avg' };
  const keys = Object.keys(state.weights).sort();
  if (keys.length) return { w: state.weights[keys[keys.length - 1]], src: 'last' };
  return { w: state.profile.weight, src: 'profile' };
}

/**
 * Mifflin-St Jeor × activité = maintien.
 * Sèche : déficit pour perdre ~0,5 % du poids par semaine (1 kg de gras ≈ 7 700 kcal).
 * Protéines : 2 g/kg en sèche, 1,8 g/kg au maintien. Lipides : 0,9 g/kg. Glucides : le reste.
 */
export function computePlan(mode = state.plan.mode, profile = state.profile, adjust = state.plan.adjust) {
  const { w, src } = currentWeight();
  const male = profile.sex !== 'f';
  const bmr = 10 * w + 6.25 * profile.height - 5 * profile.age + (male ? 5 : -161);
  const tdee = bmr * (ACTIVITY[profile.activity] || ACTIVITY.mod).f;
  const deficit = mode === 'cut' ? Math.round((w * 0.005 * 7700) / 7) : 0;
  const floor = Math.round(bmr);
  let kcal = Math.round((tdee - deficit + adjust) / 10) * 10;
  const floored = kcal < floor;
  if (floored) kcal = Math.ceil(floor / 10) * 10;
  const p = Math.round(w * (mode === 'cut' ? 2 : 1.8));
  const f = Math.round(w * 0.9);
  const c = Math.max(0, Math.round((kcal - p * 4 - f * 9) / 4));
  return { kcal, p, f, c, w, src, bmr: Math.round(bmr), tdee: Math.round(tdee), deficit, floored };
}

export function getGoals() {
  return state.plan.mode === 'manual' ? state.goals : computePlan();
}

export const MODE_LABEL = { cut: 'Sèche', maint: 'Maintien', manual: 'Manuel' };
