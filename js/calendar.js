// Calendrier : vue du mois, puis détail nutrition et sport du jour choisi.
import { state, dayKey, addDays, fromKey, dayTotals, getGoals } from './store.js';
import { icons, esc, fmt, fmtKg, longDate } from './ui.js';
import { setsSummary } from './workout.js';
import { setFoodDay } from './food.js';

const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const WD = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

let month = null;      // premier jour du mois affiché
let selected = null;   // 'AAAA-MM-JJ'

function activityByDay() {
  const map = {};
  const get = (k) => (map[k] ||= { sessions: [], abs: [] });
  state.sessions.forEach((s) => get(dayKey(new Date(s.date))).sessions.push(s));
  state.absLog.forEach((iso) => get(dayKey(new Date(iso))).abs.push(new Date(iso)));
  return map;
}

function cell(k, d, act, goal, inMonth) {
  const t = dayTotals(k);
  const pct = Math.min(1, t.kcal / goal);
  const C = 2 * Math.PI * 15;
  const a = act[k];
  const isToday = k === dayKey();
  const future = k > dayKey();
  return `<button class="cal-day ${inMonth ? '' : 'out'} ${isToday ? 'today' : ''} ${k === selected ? 'sel' : ''}" data-k="${k}" ${future ? 'disabled' : ''} aria-label="${longDate(d)}">
    <svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15" class="cal-track"/>${t.kcal ? `<circle cx="18" cy="18" r="15" class="cal-fill" stroke-dasharray="${(pct * C).toFixed(1)} ${C.toFixed(1)}"/>` : ''}</svg>
    <span class="cal-n">${d.getDate()}</span>
    <span class="cal-dots">${a?.sessions.length ? '<i class="g"></i>' : ''}${a?.abs.length ? '<i class="r"></i>' : ''}</span>
  </button>`;
}

function grid() {
  const act = activityByDay();
  const goal = getGoals().kcal || 2000;
  const first = new Date(month);
  const offset = (first.getDay() + 6) % 7; // lundi en premier
  const start = new Date(first); start.setDate(1 - offset);
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    if (i >= 35 && d.getMonth() !== first.getMonth()) break;
    cells.push(cell(dayKey(d), d, act, goal, d.getMonth() === first.getMonth()));
  }
  return `<div class="cal-wd">${WD.map((w) => `<span>${w}</span>`).join('')}</div><div class="cal-grid">${cells.join('')}</div>`;
}

function detail(k) {
  const d = fromKey(k);
  const t = dayTotals(k);
  const g = getGoals();
  const food = state.food[k] || [];
  const a = activityByDay()[k] || { sessions: [], abs: [] };
  const w = state.weights[k];
  const blocks = [];

  if (food.length) {
    blocks.push(`<section class="cal-card">
      <div class="cal-card-h"><span>${icons.food}Nutrition</span><button class="link" data-open-food="${k}">Ouvrir</button></div>
      <div class="cal-kcal"><span class="num">${fmt(t.kcal)}</span> / ${fmt(g.kcal)} kcal</div>
      <div class="mini-macros" style="font-size:13px;gap:14px;margin-top:4px"><span class="p">Protéines <b>${fmt(t.p)} g</b></span><span class="c">Glucides <b>${fmt(t.c)} g</b></span><span class="f">Lipides <b>${fmt(t.f)} g</b></span></div>
      <p class="cal-foods">${food.map((e) => esc(e.name)).join(', ')}</p>
    </section>`);
  }
  a.sessions.forEach((s) => {
    blocks.push(`<section class="cal-card">
      <div class="cal-card-h"><span class="g">${icons.dumbbell}Séance</span><span class="cal-time">${new Date(s.date).getHours()} h ${String(new Date(s.date).getMinutes()).padStart(2, '0')}</span></div>
      ${s.entries.map((e) => `<div class="cal-line"><b>${esc(e.name)}</b><span>${setsSummary({ load: e.load }, e.sets)}</span></div>`).join('')}
      ${s.cardio ? `<div class="cal-line"><b>Fractionné</b><span>${s.cardio} min</span></div>` : ''}
    </section>`);
  });
  if (a.abs.length) {
    blocks.push(`<section class="cal-card">
      <div class="cal-card-h"><span class="r">${icons.timer}Circuit abdos</span><span class="cal-time">${a.abs.map((x) => `${x.getHours()} h ${String(x.getMinutes()).padStart(2, '0')}`).join(', ')}</span></div>
      <div class="cal-line"><span>${a.abs.length > 1 ? `${a.abs.length} circuits terminés` : 'Circuit terminé'}</span></div>
    </section>`);
  }
  if (w) {
    blocks.push(`<section class="cal-card"><div class="cal-card-h"><span>${icons.scale}Pesée</span><span class="num" style="font-size:18px;font-weight:800">${fmtKg(w)} kg</span></div></section>`);
  }
  return `
    <h2 class="section">${longDate(d)}</h2>
    ${blocks.length ? blocks.join('') : `<div class="group"><div class="empty"><b>Rien de noté ce jour-là</b>Les repas, séances, circuits abdos et pesées apparaissent ici.</div></div>`}`;
}

export function renderCalendar(root) {
  if (!selected) selected = dayKey();
  if (!month) { const d = fromKey(selected); month = new Date(d.getFullYear(), d.getMonth(), 1); }
  const now = new Date();
  const atCurrent = month.getFullYear() === now.getFullYear() && month.getMonth() === now.getMonth();
  root.innerHTML = `
    <header class="head">
      <div><h1>Calendrier</h1><div class="sub">${MONTHS[month.getMonth()]} ${month.getFullYear()}</div></div>
      <div class="day-nav">
        <button class="icon-btn" data-m="-1" aria-label="Mois précédent">${icons.chevL}</button>
        <button class="icon-btn" data-m="1" aria-label="Mois suivant" ${atCurrent ? 'disabled style="opacity:.3"' : ''}>${icons.chev}</button>
      </div>
    </header>
    <section class="cal">${grid()}
      <div class="cal-legend"><span><i class="ring"></i>Calories</span><span><i class="g"></i>Séance</span><span><i class="r"></i>Abdos</span></div>
    </section>
    <div id="cal-detail">${detail(selected)}</div>`;

  root.onclick = (e) => {
    const m = e.target.closest('[data-m]');
    if (m && !m.disabled) {
      month = new Date(month.getFullYear(), month.getMonth() + Number(m.dataset.m), 1);
      renderCalendar(root);
      return;
    }
    const c = e.target.closest('[data-k]');
    if (c && !c.disabled) {
      selected = c.dataset.k;
      root.querySelectorAll('.cal-day.sel').forEach((x) => x.classList.remove('sel'));
      c.classList.add('sel');
      const box = root.querySelector('#cal-detail');
      box.innerHTML = detail(selected);
      box.classList.remove('swap'); void box.offsetWidth; box.classList.add('swap');
      if (fromKey(selected).getMonth() !== month.getMonth()) {
        const d = fromKey(selected); month = new Date(d.getFullYear(), d.getMonth(), 1); renderCalendar(root);
      }
      return;
    }
    const f = e.target.closest('[data-open-food]');
    if (f) {
      setFoodDay(f.dataset.openFood);
      window.dispatchEvent(new CustomEvent('tab', { detail: 'food' }));
    }
  };
}

export function resetCalendar() { selected = null; month = null; }
