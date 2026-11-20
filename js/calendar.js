// Calendrier : vue du mois, puis détail nutrition et sport du jour choisi.
import { state, update, dayKey, addDays, fromKey, dayTotals, getGoals, dayExpenditure } from './store.js';
import { icons, esc, fmt, fmtKg, longDate, toast } from './ui.js';
import { setsSummary, setWorkoutDay } from './workout.js';
import { openSteps } from './energy.js';
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

const hm = (d) => `${d.getHours()} h ${String(d.getMinutes()).padStart(2, '0')}`;

function cell(k, d, act, goal) {
  const t = dayTotals(k);
  const ratio = t.kcal / goal;
  const C = 2 * Math.PI * 15;
  const a = act[k];
  const isToday = k === dayKey();
  const future = k > dayKey();
  const ring = t.kcal > 0
    ? `<svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15" class="cal-track"/><circle cx="18" cy="18" r="15" class="cal-fill" stroke-dasharray="${(Math.min(1, ratio) * C).toFixed(1)} ${C.toFixed(1)}"/></svg>`
    : '';
  return `<button class="cal-day ${isToday ? 'today' : ''} ${k === selected ? 'sel' : ''} ${ratio > 1.05 ? 'over' : ''}" data-k="${k}" ${future ? 'disabled' : ''} aria-label="${longDate(d)}" ${k === selected ? 'aria-current="date"' : ''}>
    ${ring}<span class="cal-n">${d.getDate()}</span>
    <span class="cal-dots">${a?.sessions.length ? '<i class="g"></i>' : ''}${a?.abs.length ? '<i class="r"></i>' : ''}</span>
  </button>`;
}

function grid() {
  const act = activityByDay();
  const goal = getGoals().kcal || 2000;
  const first = new Date(month);
  const offset = (first.getDay() + 6) % 7; // lundi en premier
  const nDays = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: offset }, () => '<span class="cal-day blank" aria-hidden="true"></span>');
  for (let i = 1; i <= nDays; i++) {
    const d = new Date(first.getFullYear(), first.getMonth(), i);
    cells.push(cell(dayKey(d), d, act, goal));
  }
  return `<div class="cal-wd" aria-hidden="true">${WD.map((w) => `<span>${w}</span>`).join('')}</div><div class="cal-grid">${cells.join('')}</div>`;
}

function detail(k) {
  const d = fromKey(k);
  const t = dayTotals(k);
  const g = getGoals();
  const food = state.food[k] || [];
  const a = activityByDay()[k] || { sessions: [], abs: [] };
  const w = state.weights[k];
  const ex = dayExpenditure(k);
  const bal = Math.round(t.kcal - ex.total);
  const today = dayKey();
  const rel = k === today ? "Aujourd'hui" : k === addDays(today, -1) ? 'Hier' : '';
  const blocks = [];

  if (food.length) {
    blocks.push(`<section class="cal-card">
      <div class="cal-card-h"><span>${icons.food}Nutrition</span><button class="link" data-open-food="${k}">Ouvrir le journal</button></div>
      <div class="cal-kcal"><span class="num">${fmt(t.kcal)}</span> / ${fmt(g.kcal)} kcal</div>
      <div class="mini-macros"><span class="p">Protéines <b>${fmt(t.p)} g</b></span><span class="c">Glucides <b>${fmt(t.c)} g</b></span><span class="f">Lipides <b>${fmt(t.f)} g</b></span>${t.fib ? `<span class="fi">Fibres <b>${fmt(t.fib)} g</b></span>` : ''}${t.sug ? `<span class="su">Sucres <b>${fmt(t.sug)} g</b></span>` : ''}</div>
      <p class="cal-foods">${food.map((e) => esc(e.name)).join(', ')}</p>
    </section>`);
  }
  blocks.push(`<section class="cal-card">
      <div class="cal-card-h"><span>${icons.flame}Dépense estimée</span><span class="num">${fmt(ex.total)} kcal</span></div>
      <div class="cal-note">${ex.steps != null ? `${fmt(ex.steps)} pas` : 'Pas non renseignés'}${food.length ? `, bilan ${bal > 0 ? '+' : bal < 0 ? '−' : ''}${fmt(Math.abs(bal))} kcal` : ''}</div>
    </section>`);
  a.sessions.forEach((s) => {
    blocks.push(`<section class="cal-card">
      <div class="cal-card-h"><span class="g">${icons.dumbbell}Séance</span><span class="cal-time">${hm(new Date(s.date))}</span></div>
      <div class="cal-lines">
        ${s.entries.map((e) => `<div class="cal-line"><b>${esc(e.name)}</b><span>${setsSummary({ load: e.load }, e.sets)}</span></div>`).join('')}
        ${s.cardio ? `<div class="cal-line"><b>Fractionné</b><span>${s.cardio} min</span></div>` : ''}
      </div>
    </section>`);
  });
  if (a.abs.length) {
    blocks.push(`<section class="cal-card">
      <div class="cal-card-h"><span class="r">${icons.timer}${a.abs.length > 1 ? `${a.abs.length} circuits abdos` : 'Circuit abdos'}</span><span class="cal-time">${a.abs.map(hm).join(', ')}</span></div>
    </section>`);
  }
  if (w) {
    blocks.push(`<section class="cal-card"><div class="cal-card-h"><span>${icons.scale}Pesée</span><span class="num">${fmtKg(w)} kg</span></div></section>`);
  }
  return `
    <div class="cal-head"><h2>${longDate(d)}</h2>${rel ? `<small>${rel}</small>` : ''}</div>
    <div class="cal-actions" role="group" aria-label="Ajouter à ce jour">
      <button data-add-session="${k}" aria-label="Ajouter une séance">${icons.plus}<span>Séance</span></button>
      <button data-add-abs="${k}" aria-label="Ajouter un circuit abdos">${icons.plus}<span>Abdos</span></button>
      <button data-add-steps="${k}" aria-label="Ajouter des pas">${icons.plus}<span>Pas</span></button>
    </div>
    ${!food.length && !a.sessions.length && !a.abs.length && !w ? `<div class="group" style="margin-bottom:10px"><div class="empty" style="padding:20px"><b>Rien de noté ce jour-là</b>Les repas, séances, circuits abdos et pesées apparaissent ici.</div></div>` : ''}
    ${blocks.join('')}`;
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
        <button class="icon-btn" data-m="1" aria-label="Mois suivant" ${atCurrent ? 'disabled' : ''}>${icons.chev}</button>
      </div>
    </header>
    <section class="cal">${grid()}
      <div class="cal-legend"><span><i class="lg-ring"></i>Calories</span><span><i class="g"></i>Séance</span><span><i class="r"></i>Abdos</span></div>
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
    const as = e.target.closest('[data-add-session]');
    if (as) {
      setWorkoutDay(as.dataset.addSession);
      window.dispatchEvent(new CustomEvent('tab', { detail: 'workout' }));
      return;
    }
    const ab = e.target.closest('[data-add-abs]');
    if (ab) {
      const k = ab.dataset.addAbs;
      const when = k === dayKey() ? new Date() : (() => { const x = fromKey(k); x.setHours(18, 0, 0, 0); return x; })();
      update((st) => { st.absLog.push(when.toISOString()); st.absLog.sort(); });
      toast('Circuit abdos ajouté');
      return;
    }
    const sp = e.target.closest('[data-add-steps]');
    if (sp) return openSteps(sp.dataset.addSteps);
    const f = e.target.closest('[data-open-food]');
    if (f) {
      setFoodDay(f.dataset.openFood);
      window.dispatchEvent(new CustomEvent('tab', { detail: 'food' }));
    }
  };
}

export function resetCalendar() { selected = null; month = null; }
