// Stockage local : toutes les données restent sur le téléphone.
const KEY = 'fonte.v1';

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

const DEFAULT = () => ({
  v: 1,
  goals: { kcal: 2000, p: 140, f: 60, c: 225 },
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
