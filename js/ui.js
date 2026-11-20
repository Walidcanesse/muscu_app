// Icônes, feuilles, toast et petits utilitaires d'interface.
import { feedback } from './feedback.js';

const S = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;

export const icons = {
  today: S('<rect x="3.5" y="4.5" width="17" height="16" rx="3.5"/><path d="M3.5 9.5h17M8 2.8v3.4M16 2.8v3.4"/><circle cx="12" cy="15" r="1.6" fill="currentColor" stroke="none"/>'),
  home: S('<path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5H15v-6h-6v6H5.5A1.5 1.5 0 0 1 4 19z"/>'),
  bowl: S('<path d="M3.5 11.5h17a8.5 8.5 0 0 1-17 0z"/><path d="M8 8c0-1.5 1-2 1-3.5M12 8c0-1.5 1-2 1-3.5M16 8c0-1.5 1-2 1-3.5"/>'),
  star: S('<path d="M12 3.8l2.5 5.2 5.6.7-4.1 3.9 1 5.6L12 16.5l-5 2.7 1-5.6-4.1-3.9 5.6-.7z"/>'),
  dumbbell: S('<path d="M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11"/>'),
  timer: S('<circle cx="12" cy="13.5" r="7.5"/><path d="M12 13.5V9.8M9.5 2.8h5M18.8 6.6l1.4-1.4"/>'),
  food: S('<path d="M7 3v8M4.5 3v5a2.5 2.5 0 0 0 5 0V3M7 11v10M17 21V3c-2.2 1.2-3.5 3.8-3.5 7.2V13h3.5"/>'),
  gear: S('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  plus: S('<path d="M12 5v14M5 12h14"/>'),
  minus: S('<path d="M5 12h14"/>'),
  close: S('<path d="M6 6l12 12M18 6L6 18"/>'),
  check: S('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 'stroke-width="2.4"'),
  chev: S('<path d="M9 5.5l6.5 6.5L9 18.5"/>'),
  chevL: S('<path d="M15 5.5L8.5 12l6.5 6.5"/>'),
  barcode: S('<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 8v8M10 8v8M13.5 8v8M17 8v8"/>'),
  search: S('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>'),
  clock: S('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  pencil: S('<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>'),
  trash: S('<path d="M4.5 7h15M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4.5h6V7"/>'),
  play: S('<path d="M7.5 4.8v14.4a.8.8 0 0 0 1.2.7l11.3-7.2a.8.8 0 0 0 0-1.4L8.7 4.1a.8.8 0 0 0-1.2.7z" fill="currentColor" stroke="none"/>'),
  pause: S('<rect x="6" y="4.5" width="4" height="15" rx="1.2" fill="currentColor" stroke="none"/><rect x="14" y="4.5" width="4" height="15" rx="1.2" fill="currentColor" stroke="none"/>'),
  skip: S('<path d="M5 5.5v13l9-6.5-9-6.5z" fill="currentColor" stroke="none"/><path d="M18.5 5.5v13" stroke-width="2.4"/>'),
  back: S('<path d="M19 5.5v13l-9-6.5 9-6.5z" fill="currentColor" stroke="none"/><path d="M5.5 5.5v13" stroke-width="2.4"/>'),
  scale: S('<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M8.5 9a5 5 0 0 1 7 0M12 9l1.2-1.8"/>'),
  flame: S('<path d="M12 21c3.9 0 6.5-2.6 6.5-6.3 0-3.9-3-6.4-4.4-9.7-.6 2.4-1.8 3.6-3 4.4-.3-1.4-.9-2.4-1.8-3.2C8.2 9.4 5.5 11.3 5.5 14.7 5.5 18.4 8.1 21 12 21z"/>'),
  run: S('<circle cx="15" cy="4.5" r="1.8"/><path d="M8 21l2.8-5.5 3 2.5V21M6.5 11l3-3.5h4.2l2.3 3.5 3 1M11.2 7.5l-1.4 6"/>'),
  history: S('<path d="M3.5 12a8.5 8.5 0 1 0 2.5-6L3.5 8.5"/><path d="M3.5 4v4.5H8M12 7.5V12l3 2"/>'),
  sound: S('<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4zM16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"/>'),
  download: S('<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M4.5 19.5h15"/>'),
  upload: S('<path d="M12 15V4M7.5 8.5L12 4l4.5 4.5M4.5 19.5h15"/>'),
  pen: S('<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z"/>'),
  bolt: S('<path d="M13 3L5 13.5h6L10 21l8-10.5h-6L13 3z"/>'),
};

export function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => {
    if (!el.firstElementChild) el.innerHTML = icons[el.dataset.icon] || '';
  });
}

/* ---------- Texte ---------- */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const parseNum = (v) => {
  const n = parseFloat(String(v ?? '').replace(',', '.').replace(/\s/g, ''));
  return Number.isFinite(n) ? n : null;
};
export const fmt = (n, d = 0) => (n == null ? '–' : Number(n).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }));
export const fmtKg = (n) => (n == null ? '–' : fmt(n, Number.isInteger(n) ? 0 : 1));
export const mmss = (s) => {
  s = Math.max(0, Math.round(s));
  const m = Math.floor(s / 60);
  return m ? `${m}:${String(s % 60).padStart(2, '0')}` : String(s);
};
export const durLabel = (s) => {
  const m = Math.floor(s / 60), r = s % 60;
  if (!m) return `${r} s`;
  if (!r) return `${m} min`;
  return `${m} min ${String(r).padStart(2, '0')}`;
};

const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MONTHS_S = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
export const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export const longDate = (d) => `${cap(DAYS[d.getDay()])} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
export const shortDate = (d) => `${d.getDate()} ${MONTHS_S[d.getMonth()]}`;
export function relDay(d) {
  const a = new Date(); a.setHours(0, 0, 0, 0);
  const b = new Date(d); b.setHours(0, 0, 0, 0);
  const n = Math.round((a - b) / 86400000);
  if (n === 0) return "aujourd'hui";
  if (n === 1) return 'hier';
  if (n < 7) return `il y a ${n} jours`;
  return `le ${shortDate(b)}`;
}

/* ---------- Toast ---------- */
let toastTimer;
/** fb : retour son et toucher ('success' par défaut, 'error' pour une erreur, 'delete', ou false pour aucun). */
export function toast(msg, { error = false, fb } = {}) {
  const kind = fb === undefined ? (error ? 'error' : 'success') : fb;
  if (kind) feedback(kind);
  const t = document.getElementById('toast');
  t.innerHTML = `${error ? '' : icons.check}<span>${esc(msg)}</span>`;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2000);
}

/* ---------- Compteur animé ---------- */
export function countUp(el, to, { decimals = 0, duration = 700 } = {}) {
  const from = parseNum(el.dataset.v) ?? 0;
  el.dataset.v = to;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || from === to) {
    el.textContent = fmt(to, decimals);
    return;
  }
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / duration);
    const e = 1 - Math.pow(1 - k, 3);
    el.textContent = fmt(from + (to - from) * e, decimals);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ---------- Feuilles (bottom sheets) ---------- */
const stack = [];

export function openSheet({ title, body, onMount, onClose }) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `
    <div class="backdrop"></div>
    <section class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="grab"><i></i></div>
      <header class="sheet-head"><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="Fermer">${icons.close}</button></header>
      <div class="sheet-body">${body}</div>
    </section>`;
  document.getElementById('sheets').appendChild(wrap);
  const sheet = wrap.querySelector('.sheet');
  const api = {
    el: wrap,
    body: wrap.querySelector('.sheet-body'),
    setTitle: (t) => { wrap.querySelector('.sheet-head h2').textContent = t; },
    close: () => close(),
  };
  let closed = false;
  // Clavier iOS : la feuille reste au-dessus du clavier, champ de saisie visible
  const vv = window.visualViewport;
  const fit = () => {
    if (!vv) return;
    const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    wrap.style.setProperty('--kb', `${Math.round(kb)}px`);
    wrap.style.setProperty('--vvh', `${Math.round(vv.height)}px`);
    wrap.classList.toggle('kb-open', kb > 80);
    if (vv.offsetTop > 0 && kb > 80) window.scrollTo(0, 0);
  };
  vv?.addEventListener('resize', fit);
  vv?.addEventListener('scroll', fit);
  fit();
  wrap.addEventListener('focusin', (e) => {
    if (e.target.matches('input, textarea')) setTimeout(() => { fit(); e.target.scrollIntoView({ block: 'nearest' }); }, 320);
  });

  function close() {
    if (closed) return;
    closed = true;
    vv?.removeEventListener('resize', fit);
    vv?.removeEventListener('scroll', fit);
    document.activeElement?.blur?.();
    wrap.classList.remove('open');
    sheet.style.transform = '';
    const i = stack.indexOf(api);
    if (i >= 0) stack.splice(i, 1);
    setTimeout(() => wrap.remove(), 450);
    onClose && onClose();
  }
  // Fermeture voulue par l'utilisateur (fond, croix, glisser) : petit souffle descendant.
  // Une fermeture par le code (après « Enregistrer »…) reste muette : le retour de l'action suffit.
  const dismiss = () => { if (!closed) feedback('close'); close(); };
  wrap.querySelector('.backdrop').addEventListener('click', dismiss);
  wrap.querySelector('[data-close]').addEventListener('click', dismiss);

  // Glisser vers le bas pour fermer
  let y0 = null, dy = 0;
  const startDrag = (e) => { y0 = e.clientY; dy = 0; wrap.classList.add('dragging'); e.target.setPointerCapture?.(e.pointerId); };
  const moveDrag = (e) => {
    if (y0 == null) return;
    dy = Math.max(0, e.clientY - y0);
    sheet.style.transform = `translateY(${dy}px)`;
  };
  const endDrag = () => {
    if (y0 == null) return;
    y0 = null;
    wrap.classList.remove('dragging');
    if (dy > 110) dismiss(); else sheet.style.transform = '';
  };
  wrap.querySelectorAll('.grab, .sheet-head').forEach((h) => {
    h.addEventListener('pointerdown', (e) => { if (!e.target.closest('button')) startDrag(e); });
    h.addEventListener('pointermove', moveDrag);
    h.addEventListener('pointerup', endDrag);
    h.addEventListener('pointercancel', endDrag);
  });

  stack.push(api);
  feedback('open');
  onMount && onMount(api);
  requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('open')));
  return api;
}

export function closeAllSheets() { [...stack].forEach((s) => s.close()); }
