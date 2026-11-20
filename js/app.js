import { subscribe, dayKey } from './store.js';
import { hydrateIcons } from './ui.js';
import { renderToday } from './today.js';
import { renderWorkout } from './workout.js';
import { renderAbs } from './abs.js';
import { renderFood, resetFoodDay } from './food.js';

const views = { today: renderToday, workout: renderWorkout, abs: renderAbs, food: renderFood };
const root = document.getElementById('view');
const tabs = [...document.querySelectorAll('.tab')];
let current = sessionStorage.getItem('fonte.tab') || 'today';
if (!views[current]) current = 'today';
let renderedDay = dayKey();

hydrateIcons(document);

function show(name, { animate = true } = {}) {
  const changed = name !== current;
  current = name;
  sessionStorage.setItem('fonte.tab', name);
  tabs.forEach((t) => t.setAttribute('aria-current', t.dataset.tab === name ? 'page' : 'false'));
  const i = tabs.findIndex((t) => t.dataset.tab === name);
  document.querySelector('.tab-ind').style.transform = `translateX(calc(${i} * (100% + 12px)))`;
  if (changed) root.scrollTop = 0;
  root.classList.toggle('has-fab', name === 'food');
  views[name](root);
  if (animate) {
    root.classList.remove('enter');
    void root.offsetWidth;
    root.classList.add('enter');
  }
}

tabs.forEach((t) => t.addEventListener('click', () => {
  if (t.dataset.tab === current) { root.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  show(t.dataset.tab);
}));
window.addEventListener('tab', (e) => show(e.detail));

// Toute modification des données redessine l'écran courant, sans animation
subscribe(() => {
  const top = root.scrollTop;
  views[current](root);
  root.scrollTop = top;
});

// Au retour dans l'appli le lendemain, on repart sur la bonne date
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && dayKey() !== renderedDay) {
    renderedDay = dayKey();
    resetFoodDay();
    show(current, { animate: false });
  }
});

show(current);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
