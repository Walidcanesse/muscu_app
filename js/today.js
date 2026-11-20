import { state, update, dayKey, addDays, dayTotals, weightAvg, fromKey } from './store.js';
import { icons, esc, fmt, fmtKg, parseNum, longDate, relDay, countUp, openSheet, toast, haptic, durLabel } from './ui.js';
import { sparkline } from './charts.js';
import { openSettings } from './settings.js';
import { absTotalSec } from './abs.js';

/** Carte « carburant » : calories et macros du jour (réutilisée dans Nutrition). */
export function fuelCard(k) {
  const t = dayTotals(k);
  const g = state.goals;
  const left = Math.round(g.kcal - t.kcal);
  const segs = [
    ['var(--red)', t.p * 4],
    ['var(--blue)', t.c * 4],
    ['var(--yellow)', t.f * 9],
  ];
  const eaten = segs.reduce((a, [, v]) => a + v, 0);
  const total = Math.max(g.kcal, eaten);
  const macro = (key, name, color, val, goal) => `
    <div class="macro">
      <div class="m-name"><i style="background:${color};color:${color}"></i>${name}</div>
      <div class="m-val"><span data-count="${val.toFixed(0)}">0</span><small> / ${fmt(goal)} g</small></div>
      <div class="bar"><i data-w="${Math.min(100, (val / goal) * 100).toFixed(1)}" style="background:${color};color:${color}"></i></div>
    </div>`;
  return `
  <section class="fuel">
    <div class="fuel-top">
      <span class="fuel-big" data-count="${Math.round(t.kcal)}">0</span>
      <span class="fuel-of">/ ${fmt(g.kcal)} kcal</span>
    </div>
    <div class="fuel-left ${left < 0 ? 'over' : ''}">${left >= 0
      ? `Il te reste <b>${fmt(left)} kcal</b>`
      : `<b>${fmt(-left)} kcal</b> au-dessus de ton objectif`}</div>
    <div class="stack" aria-hidden="true">
      ${segs.map(([c, v]) => `<span data-grow="${(v / total).toFixed(4)}" style="background:${c};color:${c};flex-grow:0"></span>`).join('')}
      <span class="rest" data-grow="${Math.max(0, (total - eaten) / total).toFixed(4)}" style="flex-grow:1"></span>
    </div>
    <div class="macros">
      ${macro('p', 'Protéines', 'var(--red)', t.p, g.p)}
      ${macro('c', 'Glucides', 'var(--blue)', t.c, g.c)}
      ${macro('f', 'Lipides', 'var(--yellow)', t.f, g.f)}
    </div>
  </section>`;
}

/** Lance les animations (compteurs, barres) après insertion. */
export function animateFuel(root) {
  root.querySelectorAll('[data-count]').forEach((el) => countUp(el, Number(el.dataset.count)));
  requestAnimationFrame(() => {
    root.querySelectorAll('[data-grow]').forEach((el) => { el.style.flexGrow = el.dataset.grow; });
    root.querySelectorAll('[data-w]').forEach((el) => { el.style.width = el.dataset.w + '%'; });
  });
}

function weightBlock() {
  const today = dayKey();
  const keys = Object.keys(state.weights).sort();
  const lastKey = keys[keys.length - 1];
  const thisW = weightAvg(today, 7);
  const prevW = weightAvg(addDays(today, -7), 7);
  const series = Array.from({ length: 30 }, (_, i) => state.weights[addDays(today, i - 29)] ?? null);

  let delta = '', advice;
  if (thisW && prevW && thisW.n >= 3 && prevW.n >= 3) {
    const d = thisW.avg - prevW.avg;
    delta = `<div class="delta ${d <= 0 ? 'down' : 'up'}">${d > 0 ? '+' : d < 0 ? '−' : ''}${fmt(Math.abs(d), 2)} kg</div><div class="delta-label">sur 7 jours</div>`;
    if (d < -0.7) advice = `Tu perds plus de 0,7 kg par semaine. <b>Ajoute 150 kcal</b>, en glucides, pour garder tes muscles.`;
    else if (d <= -0.2) advice = `<b>Bon rythme.</b> Ne change rien : c'est la zone où tu perds du gras sans perdre de muscle.`;
    else advice = `Moins de 0,2 kg perdu cette semaine. Si ça se répète la semaine prochaine, <b>enlève 150 kcal</b>, en glucides.`;
  } else {
    advice = `Pèse-toi le matin à jeun, au moins 3 fois par semaine. La moyenne de chaque semaine sera comparée à la précédente.`;
  }

  if (!lastKey) {
    return `<section class="weight"><div class="empty" style="padding:10px 0 4px"><b>Aucune pesée</b>Ajoute ta première pesée pour suivre ta moyenne de la semaine.</div>
      <button class="btn block ghost" data-act="weigh" style="margin-top:8px">${icons.scale}Ajouter ma pesée</button></section>`;
  }
  return `
  <section class="weight">
    <div class="weight-row">
      <div>
        <div class="weight-big">${fmtKg(thisW ? Math.round(thisW.avg * 10) / 10 : state.weights[lastKey])}<small>kg</small></div>
        <div class="weight-meta">${thisW ? `Moyenne sur 7 jours, ${thisW.n} pesée${thisW.n > 1 ? 's' : ''}` : `Dernière pesée ${relDay(fromKey(lastKey))}`}</div>
      </div>
      <div>${delta}</div>
    </div>
    ${sparkline(series) ? `<div class="spark">${sparkline(series)}</div>` : ''}
    <div class="advice">${advice}</div>
  </section>`;
}

export function renderToday(root) {
  const now = new Date();
  const last = state.sessions[state.sessions.length - 1];
  const lastAbs = state.absLog[state.absLog.length - 1];
  const a = state.abs;
  root.innerHTML = `
    <header class="head">
      <div><h1>Aujourd'hui</h1><div class="sub">${longDate(now)}</div></div>
      <button class="icon-btn" data-act="settings" aria-label="Réglages">${icons.gear}</button>
    </header>

    ${fuelCard(dayKey())}

    <div class="quick">
      <button data-act="go-workout">
        <span class="q-ico" style="background:rgba(43,245,160,.12);color:var(--green)">${icons.dumbbell}</span>
        <span><span class="q-title">${state.draft ? 'Reprendre la séance' : 'Séance'}</span>
        <span class="q-sub" style="display:block">${state.draft ? 'En cours' : last ? `Dernière : ${relDay(new Date(last.date))}` : 'Pas encore commencée'}</span></span>
      </button>
      <button data-act="go-abs">
        <span class="q-ico" style="background:rgba(255,55,95,.12);color:var(--red)">${icons.timer}</span>
        <span><span class="q-title">Circuit abdos</span>
        <span class="q-sub" style="display:block">${lastAbs ? `Fait ${relDay(new Date(lastAbs))}` : durLabel(absTotalSec(a))}</span></span>
      </button>
    </div>

    <h2 class="section">Poids <button class="link" data-act="weigh">Ajouter</button></h2>
    ${weightBlock()}
  `;
  animateFuel(root);

  root.onclick = (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'settings') openSettings();
    if (act === 'weigh') openWeighSheet();
    if (act === 'go-workout') window.dispatchEvent(new CustomEvent('tab', { detail: 'workout' }));
    if (act === 'go-abs') window.dispatchEvent(new CustomEvent('tab', { detail: 'abs' }));
  };
}

export function openWeighSheet() {
  const today = dayKey();
  const keys = Object.keys(state.weights).sort();
  let val = state.weights[today] ?? state.weights[keys[keys.length - 1]] ?? 68.5;
  const recent = keys.slice(-7).reverse();
  openSheet({
    title: 'Pesée du jour',
    body: `
      <div class="qty">
        <div class="stepper" style="flex:1;justify-content:space-between">
          <button data-d="-0.1" aria-label="Moins 100 g">${icons.minus}</button>
          <input class="field num" id="w-in" inputmode="decimal" value="${fmt(val, 1)}" aria-label="Poids en kg" style="background:transparent;font-size:30px;height:56px">
          <button data-d="0.1" aria-label="Plus 100 g">${icons.plus}</button>
        </div>
        <span class="unit">kg</span>
      </div>
      <p class="hint">Le matin, à jeun, après être passé aux toilettes : c'est la mesure la plus stable.</p>
      ${recent.length ? `<span class="label">Dernières pesées</span><div class="group">${recent.map((k) => `
        <div class="row"><div class="r-main"><div class="r-title">${longDate(new Date(k + 'T12:00'))}</div></div>
        <div class="r-end"><span class="num">${fmtKg(state.weights[k])}</span></div>
        <button class="icon-btn" data-del="${k}" aria-label="Supprimer" style="width:34px;height:34px;background:transparent;border:0">${icons.trash}</button></div>`).join('')}</div>` : ''}
      <div class="sheet-actions"><button class="btn block" data-save>Enregistrer</button></div>`,
    onMount(s) {
      const input = s.body.querySelector('#w-in');
      s.body.addEventListener('click', (e) => {
        const d = e.target.closest('[data-d]');
        if (d) {
          val = Math.round(((parseNum(input.value) ?? val) + Number(d.dataset.d)) * 10) / 10;
          input.value = fmt(val, 1);
          haptic(8);
        }
        const del = e.target.closest('[data-del]');
        if (del) {
          update((st) => { delete st.weights[del.dataset.del]; });
          del.closest('.row').remove();
        }
        if (e.target.closest('[data-save]')) {
          const v = parseNum(input.value);
          if (!v || v < 30 || v > 250) { input.focus(); return; }
          update((st) => { st.weights[today] = Math.round(v * 10) / 10; });
          s.close();
          toast('Pesée enregistrée');
        }
      });
    },
  });
}
