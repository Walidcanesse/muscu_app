// Retours son et toucher : une petite famille de sons synthétisés et de vibrations.
// Même base tonale que les bips du chrono abdos (do majeur), sons très courts, volume bas.
// Rien ne sonne avant le premier geste de l'utilisateur.
import { state } from './store.js';

/* ---------- Plateforme ---------- */
const UA = navigator.userAgent || '';
export const isIOS = /iPad|iPhone|iPod/.test(UA) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const HAS_VIBRATE = typeof navigator.vibrate === 'function';                       // Android
const HAS_SWITCH = typeof HTMLInputElement !== 'undefined' && 'switch' in HTMLInputElement.prototype; // Safari 17.4+
const TOUCH = navigator.maxTouchPoints > 0;
/** Vibrations possibles sur cet appareil (Android, ou iPhone avec iOS 18 et plus). */
export const canVibrate = HAS_VIBRATE || (isIOS && HAS_SWITCH);
const USE_OVERLAY = !HAS_VIBRATE && HAS_SWITCH && TOUCH && isIOS;

const prefs = () => state.feedback || { sound: true, haptics: true };

/* ---------- Gammes ---------- */
const N = {
  C5: 523.25, E5: 659.25, G5: 783.99,
  C6: 1046.5, D6: 1174.66, E6: 1318.51, G6: 1567.98, C7: 2093,
};

/* ---------- Audio : un seul contexte partagé ---------- */
const VOLUME = 0.8;      // volume global des sons d'interface (les bips du chrono n'y passent pas)
let ctx = null, master = null, unlocked = false, hold = false, idleTimer = 0;
let sessionType = null;

/** Type de session audio iOS : 'ambient' (suit le bouton silencieux, se mélange à la musique) ou 'playback' (chrono). */
export function setAudioSession(type) {
  sessionType = type;
  try { if (navigator.audioSession && navigator.audioSession.type !== type) navigator.audioSession.type = type; } catch { /* rien */ }
}

/** Contexte audio partagé, créé ou relancé (à appeler pendant un geste). force : même si les sons d'interface sont coupés. */
export function audio({ force = false } = {}) {
  if (!force && !prefs().sound) return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!ctx) {
    if (!sessionType) setAudioSession('ambient');
    try { ctx = new AC({ latencyHint: 'interactive' }); } catch { return null; }
    master = ctx.createGain();
    master.gain.value = VOLUME;
    master.connect(ctx.destination);
  }
  if (ctx.state !== 'running' && ctx.state !== 'closed') ctx.resume().catch(() => {});
  return ctx;
}

/** Garde le contexte éveillé (pendant le chrono). */
export function holdAudio(on) {
  hold = on;
  clearTimeout(idleTimer);
  if (!on) scheduleIdle();
}
function scheduleIdle() {
  clearTimeout(idleTimer);
  // Après 30 s sans son, on met le contexte en veille (batterie) ; il repart au geste suivant
  idleTimer = setTimeout(() => { if (!hold && ctx?.state === 'running') ctx.suspend().catch(() => {}); }, 30000);
}

/* ---------- Synthèse ---------- */
const noiseBufs = new WeakMap();
function noiseBuf(c) {
  let b = noiseBufs.get(c);
  if (!b) {
    b = c.createBuffer(1, Math.round(c.sampleRate * 0.25), c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseBufs.set(c, b);
  }
  return b;
}

function env(c, t, g, a, d) {
  const v = c.createGain();
  v.gain.setValueAtTime(0, t);
  v.gain.linearRampToValueAtTime(g, t + a);
  v.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  return v;
}

/** Une note : oscillateur, glissé de hauteur facultatif, enveloppe percussive. */
function note(c, out, t, { f, to, glide = 0.02, type = 'sine', g = 0.06, a = 0.002, d = 0.05, partial }) {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + glide);
  const v = env(c, t, g, a, d);
  o.connect(v).connect(out);
  o.start(t);
  o.stop(t + a + d + 0.03);
  if (partial) note(c, out, t, { f: f * partial.k, to: to && to * partial.k, glide, g: g * partial.g, a, d: d * (partial.d ?? 0.6) });
}

/** Un souffle : bruit filtré dont la fréquence glisse (feuilles qui s'ouvrent ou se ferment). */
function air(c, out, t, { f, to, q = 1, g = 0.04, a = 0.01, d = 0.08 }) {
  const s = c.createBufferSource();
  s.buffer = noiseBuf(c);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = q;
  bp.frequency.setValueAtTime(f, t);
  if (to) bp.frequency.exponentialRampToValueAtTime(to, t + a + d);
  const v = env(c, t, g, a, d);
  s.connect(bp).connect(v).connect(out);
  s.start(t);
  s.stop(t + a + d + 0.03);
}

/**
 * La palette. Toutes les hauteurs sont des notes de do majeur ;
 * seul « success » enchaîne plusieurs notes (un arpège do–mi–sol).
 */
const SOUNDS = {
  // toucher léger : un petit « tic » aigu, presque un bruit de bois
  tap: (c, o, t) => note(c, o, t, { f: N.C7, to: N.G6, glide: 0.012, type: 'triangle', g: 0.032, a: 0.001, d: 0.022 }),
  // choix dans une liste (segments, jour du calendrier) : tic plus net, de mi vers do
  select: (c, o, t) => note(c, o, t, { f: N.E6, to: N.C6, glide: 0.03, g: 0.05, d: 0.036, partial: { k: 2, g: 0.12 } }),
  // changement d'onglet : « toc » plus rond, une quinte plus bas
  tab: (c, o, t) => note(c, o, t, { f: N.C6, to: N.G5, glide: 0.028, g: 0.06, a: 0.002, d: 0.045, partial: { k: 2, g: 0.18 } }),
  // stepper et puces : clic minuscule, plus aigu pour +, plus grave pour −
  step: (c, o, t, { dir = 0 } = {}) => note(c, o, t, { f: dir > 0 ? N.G6 : dir < 0 ? N.D6 : N.E6, type: 'triangle', g: 0.045, a: 0.001, d: 0.02 }),
  // feuille qui monte : souffle qui s'éclaircit
  open: (c, o, t) => air(c, o, t, { f: 650, to: 2600, q: 0.9, g: 0.045, a: 0.045, d: 0.07 }),
  // feuille qui descend : souffle qui s'assombrit, plus court
  close: (c, o, t) => air(c, o, t, { f: 2300, to: 600, q: 0.9, g: 0.038, a: 0.008, d: 0.08 }),
  // interrupteur : glissé montant (activé) ou descendant (désactivé)
  toggle: (c, o, t, { on = true } = {}) => note(c, o, t, { f: on ? N.C6 : N.G6, to: on ? N.G6 : N.C6, glide: 0.03, g: 0.055, d: 0.05, partial: { k: 2, g: 0.1 } }),
  // série validée : « pop » rond, avec un petit clic d'attaque
  check: (c, o, t) => {
    note(c, o, t, { f: N.G5, to: N.C6, glide: 0.016, g: 0.09, a: 0.002, d: 0.085, partial: { k: 2, g: 0.22, d: 0.5 } });
    note(c, o, t, { f: N.C7, type: 'triangle', g: 0.025, a: 0.001, d: 0.012 });
  },
  // enregistré, ajouté, séance terminée : le seul son mélodique, arpège do–mi–sol
  success: (c, o, t) => {
    note(c, o, t, { f: N.C6, g: 0.055, a: 0.003, d: 0.09, partial: { k: 2, g: 0.12 } });
    note(c, o, t + 0.055, { f: N.E6, g: 0.055, a: 0.003, d: 0.09, partial: { k: 2, g: 0.12 } });
    note(c, o, t + 0.11, { f: N.G6, g: 0.06, a: 0.003, d: 0.2, partial: { k: 2, g: 0.12 } });
  },
  // suppression, abandon : une note grave qui descend (mi vers do)
  delete: (c, o, t) => note(c, o, t, { f: N.E5, to: N.C5, glide: 0.09, type: 'triangle', g: 0.085, a: 0.004, d: 0.13 }),
  // saisie invalide : deux petits coups graves sur la même note
  error: (c, o, t) => {
    note(c, o, t, { f: N.C5, to: N.C5 * 0.94, glide: 0.04, type: 'triangle', g: 0.08, a: 0.002, d: 0.05 });
    note(c, o, t + 0.09, { f: N.C5, to: N.C5 * 0.94, glide: 0.04, type: 'triangle', g: 0.08, a: 0.002, d: 0.06 });
  },
  // code-barres reconnu : un bip pur, comme une caisse, mais doux
  scan: (c, o, t) => note(c, o, t, { f: N.G6, g: 0.06, a: 0.003, d: 0.075, partial: { k: 2, g: 0.08 } }),
};
SOUNDS.warn = SOUNDS.delete;

// Plus le chiffre est haut, plus le retour est important : un son faible ne recouvre pas un son fort
const PRIORITY = { tap: 0, select: 1, tab: 1, step: 1, open: 1, close: 1, toggle: 2, check: 2, scan: 2, delete: 3, warn: 3, success: 3, error: 4 };

/** Joue un son de la palette dans un contexte donné (utilisé aussi pour le rendu hors ligne). */
export function synth(c, out, kind, t, opt) {
  const fn = SOUNDS[kind];
  if (fn) fn(c, out, t, opt);
}

let lastSound = { kind: null, at: -1e9, pri: -1 };
function playSound(kind, opt) {
  if (!unlocked || !prefs().sound || !SOUNDS[kind]) return;
  const now = performance.now();
  const pri = PRIORITY[kind] ?? 0;
  // Pas de doublon ni d'empilement : un son plus faible juste après un plus fort est ignoré
  if (now - lastSound.at < 70 && (pri < lastSound.pri || (pri === lastSound.pri && kind === lastSound.kind))) return;
  const c = audio();
  if (!c) return;
  lastSound = { kind, at: now, pri };
  synth(c, master, kind, c.currentTime + 0.004, opt);
  if (!hold) scheduleIdle();
}

/* ---------- Toucher ---------- */
// [motif Android en ms, impulsions iOS, écart entre impulsions iOS en ms]
const HAPTIC = {
  select: [8, 1], tab: [8, 1], step: [6, 1], toggle: [10, 1], check: [14, 1],
  success: [[12, 70, 22], 2, 90],
  delete: [26, 1], warn: [26, 1],
  error: [[22, 50, 22, 50, 22], 3, 80],
  scan: [18, 1],
  work: [[35, 80, 35], 2, 110],   // chrono : début d'un exercice
  rest: [16, 1],                  // chrono : repos, pause
};

// iPhone : cliquer le libellé d'un <input type="checkbox" switch> déclenche le retour haptique du système.
// Un libellé caché sert aux impulsions lancées par le code (iOS 18 à 26.4) ; certains boutons portent
// en plus un libellé transparent, touché directement par le doigt (fonctionne aussi après iOS 26.4).
let proxy = null;
function proxyTick() {
  if (!proxy) {
    proxy = document.createElement('label');
    proxy.className = 'hx-proxy';
    proxy.setAttribute('aria-hidden', 'true');
    proxy.style.display = 'none';
    const i = document.createElement('input');
    i.type = 'checkbox';
    i.setAttribute('switch', '');
    i.tabIndex = -1;
    proxy.append(i);
    document.body.append(proxy);
  }
  try { proxy.click(); } catch { /* rien */ }
}

let evId = 0, firedEv = -1, nativeEv = -1, nativeAt = -1e9, nativeDoneAt = -1e9;
const mark = () => { firedEv = evId; };

/** Retour haptique seul. */
export function haptic(kind) {
  mark();
  if (!prefs().haptics) return;
  const h = HAPTIC[kind];
  if (!h) return;
  const [pattern, pulses = 1, gap = 90] = h;
  if (HAS_VIBRATE) {
    try { navigator.vibrate(pattern); } catch { /* rien */ }
    return;
  }
  if (!HAS_SWITCH) return;
  // Le doigt a touché un libellé posé sur le bouton : le système fait la première impulsion,
  // sauf si le bouton a été redessiné entre-temps (le clic n'atteint alors plus l'interrupteur).
  // On vérifie donc juste après la fin du clic, avant de la faire nous-mêmes.
  const viaFinger = nativeEv === evId && performance.now() - nativeAt < 400;
  if (viaFinger) {
    const at = nativeAt;
    setTimeout(() => { if (nativeDoneAt < at) proxyTick(); }, 0);
  } else proxyTick();
  for (let k = 1; k < pulses; k++) setTimeout(proxyTick, k * gap);
}

/** Son seul. */
export function sound(kind, opt) {
  mark();
  playSound(kind, opt);
}

/** Son et toucher ensemble : c'est l'appel normal. */
export function feedback(kind, opt) {
  mark();
  playSound(kind, opt);
  if (kind !== 'tap' && kind !== 'open' && kind !== 'close') haptic(kind);
}

/* ---------- Libellés posés sur les boutons (iPhone) ---------- */
const HX_SEL = '.tab, button.check, .stepper button, .chips button, .seg button, button.cal-day, .t-btn, .btn:not(.ghost)';
function addOverlay(el) {
  if (el.closest('form') || el.querySelector(':scope > .hx')) return;
  const l = document.createElement('label');
  l.className = 'hx';
  l.setAttribute('aria-hidden', 'true');
  const i = document.createElement('input');
  i.type = 'checkbox';
  i.setAttribute('switch', '');
  i.tabIndex = -1;
  l.append(i);
  if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
  el.append(l);
}
let observer = null;
function scan(node) {
  if (node.nodeType !== 1 || node.classList.contains('hx')) return;
  if (node.matches(HX_SEL)) addOverlay(node);
  node.querySelectorAll(HX_SEL).forEach(addOverlay);
}
export function syncOverlays() {
  if (!USE_OVERLAY) return;
  const on = prefs().haptics;
  if (on && !observer) {
    observer = new MutationObserver((list) => list.forEach((m) => {
      m.addedNodes.forEach(scan);
      const host = m.target.nodeType === 1 && m.target.closest(HX_SEL);
      if (host) addOverlay(host);
    }));
    observer.observe(document.body, { childList: true, subtree: true });
    scan(document.body);
  }
  if (!on && observer) {
    observer.disconnect();
    observer = null;
    document.querySelectorAll('.hx').forEach((l) => l.remove());
  }
}

/* ---------- Écoute globale ---------- */
function tapKind(t) {
  if (t.closest('.timer, .hx-proxy')) return null;
  const b = t.closest('button, [role="button"], summary');
  if (!b || b.disabled || b.matches('.tab')) return null;
  if (b.closest('.seg')) return b.getAttribute('aria-pressed') === 'true' ? 'tap' : 'select';
  if (b.closest('.chips')) return 'step';
  return 'tap';
}

let initDone = false;
let pending = null, pendingEv = -1;   // retour « par défaut » du clic en cours
export function initFeedback() {
  if (initDone) return;
  initDone = true;
  // Premier geste : on peut créer (ou relancer) le contexte audio
  const unlock = (e) => {
    if (!e.isTrusted) return;
    unlocked = true;
    if (prefs().sound) audio();
  };
  ['pointerdown', 'touchend', 'keydown'].forEach((ev) => window.addEventListener(ev, unlock, { capture: true, passive: true }));

  window.addEventListener('click', (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    // Les clics des interrupteurs cachés ne doivent atteindre aucun autre gestionnaire
    if (t.matches('.hx > input')) nativeDoneAt = performance.now(); // le libellé a bien transmis le toucher
    if (t.closest('.hx-proxy') || t.matches('.hx > input')) { e.stopPropagation(); return; }
    if (e.isTrusted) { unlocked = true; if (prefs().sound) audio(); }
    evId++;
    // Toucher direct d'un interrupteur visible (Réglages) : impulsion du système, déjà faite
    if (HAS_SWITCH && t.matches('input[switch]')) { nativeEv = evId; nativeAt = nativeDoneAt = performance.now(); }
    if (USE_OVERLAY && t.matches('.hx')) { nativeEv = evId; nativeAt = performance.now(); }
    pending = e.isTrusted ? tapKind(t) : null;
    pendingEv = evId;
  }, true);
  ['input', 'change'].forEach((ev) => window.addEventListener(ev, (e) => {
    if (e.target instanceof Element && e.target.closest('.hx, .hx-proxy')) e.stopPropagation();
  }, true));
  // Après les gestionnaires de l'appli : un simple « tic » si rien d'autre n'a répondu
  document.addEventListener('click', () => {
    if (!pending || pendingEv !== evId || firedEv === evId) return;
    const k = pending;
    pending = null;
    if (k === 'tap') sound('tap'); else feedback(k);
  });
  syncOverlays();
}
