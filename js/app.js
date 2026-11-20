import { subscribe, dayKey } from './store.js';
import { hydrateIcons } from './ui.js';
import { renderToday } from './today.js';
import { renderWorkout } from './workout.js';
import { renderAbs } from './abs.js';
import { renderFood, resetFoodDay } from './food.js';
import { renderCalendar, resetCalendar } from './calendar.js';
import { checkStepsReturn } from './energy.js';

const views = { today: renderToday, workout: renderWorkout, abs: renderAbs, food: renderFood, cal: renderCalendar };
const root = document.getElementById('view');
const tabs = [...document.querySelectorAll('.tab')];
let current = sessionStorage.getItem('fonte.tab') || 'today';
if (!views[current]) current = 'today';
let renderedDay = dayKey();
let enterTimer = 0;

hydrateIcons(document);

// iOS 26 : l'appli installée n'occupe parfois pas tout l'écran (bande vide en bas).
// On mesure la bande pour ne pas compter deux fois la zone de la barre de geste.
function measureGap() {
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const vvOpen = window.visualViewport && window.visualViewport.height < window.innerHeight - 80; // clavier ouvert
  if (!standalone || vvOpen) return;
  const portrait = window.innerHeight > window.innerWidth;
  const full = portrait ? Math.max(screen.height, screen.width) : Math.min(screen.height, screen.width);
  const gap = Math.max(0, Math.min(60, Math.round(full - window.innerHeight)));
  document.documentElement.style.setProperty('--ios-gap', `${gap}px`);
}
measureGap();
window.addEventListener('resize', measureGap);
window.addEventListener('orientationchange', () => setTimeout(measureGap, 300));

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
  clearTimeout(enterTimer);
  root.classList.remove('enter');
  if (animate) {
    void root.offsetWidth;
    root.classList.add('enter');
    // Le fondu ne vaut que pour l'arrivée sur l'onglet : un nouveau rendu (donnée modifiée) ne le rejoue pas
    enterTimer = setTimeout(() => root.classList.remove('enter'), 650);
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
  clearTimeout(enterTimer);
  root.classList.remove('enter');
  views[current](root);
  root.scrollTop = top;
});

// Au retour dans l'appli le lendemain, on repart sur la bonne date
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') checkStepsReturn();
  if (document.visibilityState === 'visible' && dayKey() !== renderedDay) {
    renderedDay = dayKey();
    resetFoodDay();
    resetCalendar();
    show(current, { animate: false });
  }
});

show(current);
checkStepsReturn();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
