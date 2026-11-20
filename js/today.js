import { state, update, dayKey, addDays, dayTotals, weightAvg, fromKey, getGoals, MODE_LABEL } from './store.js';
import { icons, esc, fmt, fmtKg, parseNum, longDate, relDay, countUp, openSheet, toast, haptic, durLabel } from './ui.js';
import { sparkline } from './charts.js';
import { openSettings } from './settings.js';
import { absTotalSec } from './abs.js';
import { energyCard, openSteps, openTracking } from './energy.js';

/** Carte « carburant » : anneau des calories et macros du jour (réutilisée dans Nutrition). */
const RING_R = 52, RING_W = 10, RING_C = 2 * Math.PI * RING_R;
// Dernières valeurs affichées, par jour : l'anneau part de là au lieu de repartir de zéro
const shown = {};

export function fuelCard(k) {
  const t = dayTotals(k);
  const g = getGoals();
  const was = shown[k] || {};
  const left = Math.round(g.kcal - t.kcal);
  const segs = [
    ['var(--prot)', t.p * 4],
    ['var(--carb)', t.c * 4],
    ['var(--fat)', t.f * 9],
  ];
  const eaten = segs.reduce((a, [, v]) => a + v, 0);
  const total = Math.max(g.kcal, eaten, 1);
  // Chaque macro est un arc de l'anneau, séparé des autres par un petit jour
  const gap = 4;
  let acc = 0;
  const arcs = segs.map(([c, v], i) => {
    const len = (v / total) * RING_C;
    const from = acc;
    acc += len;
    if (len < 0.5) return '';
    const vis = Math.max(0.01, len - RING_W - gap);
    const off = (-(from + RING_W / 2 + gap / 2)).toFixed(2);
    return `<circle class="arc" cx="60" cy="60" r="${RING_R}" stroke="${c}" stroke-width="${RING_W}"
      stroke-dasharray="${was['a' + i] || `0 ${RING_C.toFixed(2)}`}" data-key="a${i}" data-dash="${vis.toFixed(2)} ${RING_C.toFixed(2)}"
      data-off="${off}" style="stroke-dashoffset:${was['o' + i] ?? off};transition-delay:${was['a' + i] ? 0 : i * 120}ms"/>`;
  }).join('');
  const counter = (key, val) => `data-key="${key}" data-count="${val}" data-v="${was[key] ?? 0}">${fmt(was[key] ?? 0)}`;
  const macro = (key, name, color, val, goal, max = false) => `
    <div class="macro ${max && val > goal ? 'over' : ''}">
      <div class="m-top"><span class="m-name">${name}</span><span class="m-val"><b ${counter(key, Math.round(val))}</b> / ${fmt(goal)} g${max ? ' max' : ''}</span></div>
      <div class="bar"><i data-key="w${key}" data-w="${Math.min(100, (val / goal) * 100).toFixed(1)}" style="background:${color};width:${was['w' + key] ?? 0}%"></i></div>
    </div>`;
  return `
  <section class="fuel" data-fuel-day="${k}">
    <div class="fuel-main">
      <div class="ring" role="img" aria-label="${fmt(Math.round(t.kcal))} kcal sur ${fmt(g.kcal)}">
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <circle class="ring-track" cx="60" cy="60" r="${RING_R}" stroke-width="${RING_W}"/>
          ${arcs}
        </svg>
        <div class="ring-label"><span class="fuel-big num" ${counter('kcal', Math.round(t.kcal))}</span><span class="fuel-of">sur ${fmt(g.kcal)}</span></div>
      </div>
      <div class="macros">
        ${macro('p', 'Protéines', 'var(--prot)', t.p, g.p)}
        ${macro('c', 'Glucides', 'var(--carb)', t.c, g.c)}
        ${macro('f', 'Lipides', 'var(--fat)', t.f, g.f)}
      </div>
    </div>
    <div class="fuel-extra">
      ${macro('fi', 'Fibres', 'var(--fib)', t.fib, g.fib)}
      ${macro('su', 'Sucres', 'var(--sug)', t.sug, g.sug, true)}
    </div>
    <div class="fuel-foot">
      <div class="fuel-left ${left < 0 ? 'over' : ''}">${left >= 0
        ? `Il te reste <b>${fmt(left)} kcal</b>`
        : `<b>${fmt(-left)} kcal</b> au-dessus de ton objectif`}</div>
      <button class="mode-tag" data-open-goals aria-label="Changer d'objectif">${MODE_LABEL[state.plan.mode]}</button>
    </div>
  </section>`;
}

/** Lance les animations (compteurs, anneau, barres) après insertion. */
export function animateFuel(root) {
  const card = root.querySelector('.fuel');
  if (!card) return;
  const mem = (shown[card.dataset.fuelDay] ||= {});
  card.querySelectorAll('[data-count]').forEach((el) => {
    const v = Number(el.dataset.count);
    mem[el.dataset.key] = v;
    countUp(el, v);
  });
  card.querySelectorAll('[data-dash]').forEach((el) => {
    mem[el.dataset.key] = el.dataset.dash;
    mem['o' + el.dataset.key.slice(1)] = el.dataset.off;
  });
  card.querySelectorAll('[data-w]').forEach((el) => { mem[el.dataset.key] = el.dataset.w; });
  requestAnimationFrame(() => requestAnimationFrame(() => {
    card.querySelectorAll('[data-dash]').forEach((el) => {
      el.style.strokeDasharray = el.dataset.dash;
      el.style.strokeDashoffset = el.dataset.off;
    });
    card.querySelectorAll('[data-w]').forEach((el) => { el.style.width = el.dataset.w + '%'; });
  }));
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
    const where = state.plan.mode === 'manual' ? 'dans tes objectifs' : "dans Réglages, ligne Ajustement";
    if (state.plan.mode === 'cut') {
      if (d < -0.7) advice = `Tu perds plus de 0,7 kg par semaine. <b>Ajoute 150 kcal</b> (${where}) pour garder tes muscles.`;
      else if (d <= -0.2) advice = `<b>Bon rythme.</b> Ne change rien : c'est la zone où tu perds du gras sans perdre de muscle.`;
      else advice = `Moins de 0,2 kg perdu cette semaine. Si ça se répète la semaine prochaine, <b>enlève 150 kcal</b> (${where}).`;
    } else {
      if (d < -0.3) advice = `Tu perds du poids alors que tu es au maintien. Si ça se répète, <b>ajoute 150 kcal</b> (${where}).`;
      else if (d > 0.3) advice = `Tu prends du poids alors que tu es au maintien. Si ça se répète, <b>enlève 150 kcal</b> (${where}).`;
      else advice = `<b>Poids stable.</b> Tes calories correspondent bien à ton maintien.`;
    }
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
        <span class="q-title"><span class="q-ico green">${icons.dumbbell}</span>${'Séance'}</span>
        <span class="q-sub">${state.draft ? 'En cours, touche pour reprendre' : last ? `Faite ${relDay(new Date(last.date))}` : 'Pas encore faite'}</span>
      </button>
      <button data-act="go-abs">
        <span class="q-title"><span class="q-ico red">${icons.timer}</span>Circuit abdos</span>
        <span class="q-sub">${lastAbs ? `Fait ${relDay(new Date(lastAbs))}` : `${durLabel(absTotalSec(a))} au total`}</span>
      </button>
    </div>

    <h2 class="section">Bilan du jour <button class="link" data-track>Suivi</button></h2>
    ${energyCard()}

    <h2 class="section">Poids <button class="link" data-act="weigh">Ajouter</button></h2>
    ${weightBlock()}
  `;
  animateFuel(root);

  root.onclick = (e) => {
    if (e.target.closest('[data-open-goals]')) return openSettings();
    const st = e.target.closest('[data-steps]');
    if (st) return openSteps(st.dataset.steps);
    if (e.target.closest('[data-track]')) return openTracking();
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
