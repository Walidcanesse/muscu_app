import { state, update, lastSessionFor, uid } from './store.js';
import { icons, esc, fmt, fmtKg, parseNum, relDay, longDate, openSheet, toast, haptic, shortDate, cap } from './ui.js';
import { lineChart } from './charts.js';
import { openTechnique, techniqueKey } from './technique.js';

let selectedEx = null;

const isLest = (ex) => ex.load === 'Lest';

function loadText(ex, kg) {
  if (isLest(ex)) return kg ? `+${fmtKg(kg)} kg` : 'PDC';
  return `${fmtKg(kg ?? 0)} kg`;
}

/** « 35 kg × 8, 7 » — résumé compact d'une liste de séries. */
export function setsSummary(ex, sets) {
  const done = sets.filter((s) => s.reps);
  if (!done.length) return '';
  const groups = [];
  done.forEach((s) => {
    const g = groups[groups.length - 1];
    if (g && g.kg === (s.kg || 0)) g.reps.push(s.reps);
    else groups.push({ kg: s.kg || 0, reps: [s.reps] });
  });
  return groups.map((g) => `${loadText(ex, g.kg)} × ${g.reps.join(', ')}`).join(' puis ');
}

function ensureDraft(st) {
  if (!st.draft) st.draft = { started: new Date().toISOString(), entries: {}, cardio: { min: 10, done: false }, open: st.workout[0]?.id ?? null };
  st.workout.forEach((ex) => {
    if (!st.draft.entries[ex.id]) st.draft.entries[ex.id] = Array.from({ length: ex.sets }, () => ({ kg: null, reps: null, done: false }));
  });
  return st.draft;
}

function exCard(ex, i) {
  const d = state.draft;
  const sets = d?.entries[ex.id] || Array.from({ length: ex.sets }, () => ({ kg: null, reps: null, done: false }));
  const last = lastSessionFor(ex.id);
  const lastSets = last?.entry.sets || [];
  const doneN = sets.filter((s) => s.done).length;
  const open = d ? d.open === ex.id : i === 0;
  return `
  <article class="ex ${open ? 'open' : ''} ${doneN === sets.length && sets.length ? 'done' : ''}" data-ex="${ex.id}">
    <button class="ex-head" data-toggle aria-expanded="${open}">
      <span class="ex-dots">${sets.map((s) => `<i class="${s.done ? 'on' : ''}"></i>`).join('')}</span>
      <span><div class="ex-name">${esc(ex.name)}</div>
      <div class="ex-last">${last ? `${cap(relDay(new Date(last.session.date)))} : ${setsSummary(ex, lastSets)}` : 'Première fois'}</div></span>
      <span class="chev">${icons.chev}</span>
    </button>
    <div class="collapse"><div>
      <div class="ex-body">
        <div class="sets-head"><span></span><span>${isLest(ex) ? 'Lest (kg)' : 'Charge (kg)'}</span><span>Reps</span><span></span></div>
        ${sets.map((s, j) => {
          const ls = lastSets[j] || lastSets[lastSets.length - 1];
          const phKg = ls ? fmtKg(ls.kg || 0) : '0';
          const phReps = ls?.reps ? ls.reps : '–';
          return `
          <div class="set ${s.done ? 'on' : ''}" data-set="${j}">
            <span class="set-n">${j + 1}</span>
            <input class="field" inputmode="decimal" data-f="kg" value="${s.kg ?? ''}" placeholder="${phKg}" aria-label="Charge série ${j + 1}">
            <input class="field" inputmode="numeric" data-f="reps" value="${s.reps ?? ''}" placeholder="${phReps}" aria-label="Répétitions série ${j + 1}">
            <button class="check ${s.done ? 'on' : ''}" data-check aria-label="Valider la série ${j + 1}" aria-pressed="${s.done}">${icons.check}</button>
          </div>`;
        }).join('')}
        ${techniqueKey(ex.name) ? `<button class="tech-btn" data-tech="${esc(ex.name)}">${icons.play}<span>Voir la technique</span></button>` : ''}
        <div class="ex-tools">
          <button class="link" data-addset>+ Ajouter une série</button>
          ${sets.length > 1 ? `<button class="link" data-rmset>Retirer</button>` : ''}
        </div>
      </div>
    </div></div>
  </article>`;
}

function metricFor(ex, entry) {
  const sets = entry.sets.filter((s) => s.reps);
  if (!sets.length) return null;
  const anyKg = sets.some((s) => s.kg > 0);
  if (!anyKg || isLest(ex)) return { v: sets.reduce((a, s) => a + s.reps, 0), kind: 'reps' };
  const best = Math.max(...sets.map((s) => (s.kg || 0) * (1 + s.reps / 30)));
  return { v: Math.round(best * 10) / 10, kind: 'kg' };
}

function progressBlock() {
  const exs = state.workout;
  if (!exs.length) return '';
  if (!selectedEx || !exs.find((e) => e.id === selectedEx)) selectedEx = exs[0].id;
  const ex = exs.find((e) => e.id === selectedEx);
  const points = [];
  state.sessions.forEach((s) => {
    const e = s.entries.find((x) => x.exId === ex.id);
    if (!e) return;
    const m = metricFor(ex, e);
    if (m) points.push({ ...m, date: new Date(s.date), sets: e.sets });
  });
  const kind = points.some((p) => p.kind === 'kg') ? 'kg' : 'reps';
  const pts = points.filter((p) => p.kind === kind).slice(-12);
  let body;
  if (!pts.length) {
    body = `<div class="empty"><b>Pas encore de données</b>Termine une séance avec cet exercice pour voir ta courbe apparaître.</div>`;
  } else {
    const lastP = pts[pts.length - 1];
    const first = pts[0];
    const diff = lastP.v - first.v;
    body = `
      <div class="chart-top">
        <div><span class="num">${kind === 'kg' ? fmtKg(lastP.v) + ' kg' : fmt(lastP.v) + ' reps'}</span>
        <small>${kind === 'kg' ? 'Force estimée (1RM)' : 'Répétitions au total'}</small></div>
        ${pts.length > 1 ? `<div style="text-align:right"><span class="num" style="font-size:19px;color:${diff >= 0 ? 'var(--green)' : 'var(--yellow)'}">${diff >= 0 ? '+' : '−'}${kind === 'kg' ? fmtKg(Math.abs(Math.round(diff * 10) / 10)) : fmt(Math.abs(diff))}</span><small>depuis le ${shortDate(first.date)}</small></div>` : ''}
      </div>
      ${lineChart(pts.map((p) => p.v), { labels: pts.map((p) => shortDate(p.date)), decimals: kind === 'kg' ? 1 : 0 })}`;
  }
  return `
    <h2 class="section">Progression</h2>
    <div class="seg" role="group" aria-label="Exercice">${exs.map((e) => `<button data-sel="${e.id}" aria-pressed="${e.id === selectedEx}">${esc(e.name)}</button>`).join('')}</div>
    <div class="chart">${body}</div>`;
}

function historyBlock() {
  const list = state.sessions.slice(-15).reverse();
  if (!list.length) return '';
  return `
    <h2 class="section">Historique <small>${state.sessions.length} séance${state.sessions.length > 1 ? 's' : ''}</small></h2>
    <div class="group">${list.map((s) => {
      const nSets = s.entries.reduce((a, e) => a + e.sets.length, 0);
      return `<button class="row" data-session="${s.id}">
        <div class="r-main"><div class="r-title">${longDate(new Date(s.date))}</div>
        <div class="r-sub">${s.entries.length} exercice${s.entries.length > 1 ? 's' : ''}, ${nSets} série${nSets > 1 ? 's' : ''}${s.cardio ? `, ${s.cardio} min de fractionné` : ''}</div></div>
        <span class="chev">${icons.chev}</span></button>`;
    }).join('')}</div>`;
}

export function renderWorkout(root) {
  const d = state.draft;
  const started = d ? new Date(d.started) : null;
  const cardio = d?.cardio || { min: 10, done: false };
  root.innerHTML = `
    <header class="head">
      <div><h1>Séance</h1><div class="sub">${d ? `Commencée à ${started.getHours()} h ${String(started.getMinutes()).padStart(2, '0')}` : 'Note tes séries au fur et à mesure'}</div></div>
      ${d ? `<button class="icon-btn" data-act="cancel" aria-label="Abandonner la séance">${icons.trash}</button>` : ''}
    </header>

    ${state.workout.map(exCard).join('')}

    <article class="ex ${cardio.done ? 'done' : ''}">
      <div class="cardio">
        <div class="r-main"><div class="ex-name">Fractionné</div><div class="ex-last">En minutes</div></div>
        <div class="stepper"><button data-cmin="-1" aria-label="Moins une minute">${icons.minus}</button><span class="num" id="cmin">${cardio.min}</span><button data-cmin="1" aria-label="Plus une minute">${icons.plus}</button></div>
        <button class="check ${cardio.done ? 'on' : ''}" data-cardio aria-label="Valider le fractionné" aria-pressed="${cardio.done}">${icons.check}</button>
      </div>
    </article>

    <button class="btn block" data-act="finish" style="margin-top:18px" ${d && hasData(d) ? '' : 'disabled'}>Terminer la séance</button>

    ${progressBlock()}
    ${historyBlock()}
  `;

  root.onclick = (e) => {
    const t = e.target;
    const card = t.closest('[data-ex]');
    if (t.closest('[data-toggle]') && card) {
      const id = card.dataset.ex;
      const willOpen = !card.classList.contains('open');
      root.querySelectorAll('.ex.open').forEach((c) => { c.classList.remove('open'); c.querySelector('[data-toggle]')?.setAttribute('aria-expanded', 'false'); });
      if (willOpen) { card.classList.add('open'); t.closest('[data-toggle]').setAttribute('aria-expanded', 'true'); }
      update((st) => { ensureDraft(st).open = willOpen ? id : null; }, { silent: true });
      return;
    }
    const tb = t.closest('[data-tech]');
    if (tb) { openTechnique(tb.dataset.tech); return; }
    const chk = t.closest('[data-check]');
    if (chk && card) return toggleSet(root, card, chk);
    if (t.closest('[data-addset]') && card) {
      update((st) => { const l = ensureDraft(st).entries[card.dataset.ex]; l.push({ kg: null, reps: null, done: false }); });
      return;
    }
    if (t.closest('[data-rmset]') && card) {
      update((st) => { const l = ensureDraft(st).entries[card.dataset.ex]; if (l.length > 1) l.pop(); });
      return;
    }
    const cm = t.closest('[data-cmin]');
    if (cm) {
      update((st) => { const c = ensureDraft(st).cardio; c.min = Math.max(1, Math.min(60, c.min + Number(cm.dataset.cmin))); }, { silent: true });
      root.querySelector('#cmin').textContent = state.draft.cardio.min;
      haptic(8);
      return;
    }
    const cd = t.closest('[data-cardio]');
    if (cd) {
      update((st) => { const c = ensureDraft(st).cardio; c.done = !c.done; }, { silent: true });
      const on = state.draft.cardio.done;
      cd.classList.toggle('on', on);
      cd.setAttribute('aria-pressed', on);
      cd.classList.remove('pop'); void cd.offsetWidth; cd.classList.add('pop');
      cd.closest('.ex').classList.toggle('done', on);
      refreshFinish(root);
      haptic(15);
      return;
    }
    const sel = t.closest('[data-sel]');
    if (sel) { selectedEx = sel.dataset.sel; renderWorkout(root); return; }
    const ses = t.closest('[data-session]');
    if (ses) return openSessionSheet(ses.dataset.session);
    const act = t.closest('[data-act]')?.dataset.act;
    if (act === 'finish') return finish();
    if (act === 'cancel') return confirmCancel();
  };

  // Saisie : on enregistre sans redessiner l'écran (le clavier reste ouvert)
  root.oninput = (e) => {
    const f = e.target.closest('[data-f]');
    if (!f) return;
    const card = f.closest('[data-ex]');
    const j = Number(f.closest('[data-set]').dataset.set);
    const v = parseNum(f.value);
    update((st) => {
      const s = ensureDraft(st).entries[card.dataset.ex][j];
      s[f.dataset.f] = f.dataset.f === 'reps' ? (v == null ? null : Math.round(v)) : v;
    }, { silent: true });
    refreshFinish(root);
  };
}

function hasData(d) {
  return Object.values(d.entries).some((l) => l.some((s) => s.done || s.reps)) || d.cardio.done;
}

function refreshFinish(root) {
  const b = root.querySelector('[data-act="finish"]');
  if (b) b.disabled = !(state.draft && hasData(state.draft));
}

function toggleSet(root, card, chk) {
  const row = chk.closest('[data-set]');
  const j = Number(row.dataset.set);
  const exId = card.dataset.ex;
  const kgIn = row.querySelector('[data-f="kg"]');
  const repsIn = row.querySelector('[data-f="reps"]');
  update((st) => {
    const s = ensureDraft(st).entries[exId][j];
    if (!s.done) {
      // Valider sans rien taper = refaire la même perf que la dernière fois
      if (s.kg == null) s.kg = parseNum(kgIn.placeholder) ?? 0;
      if (s.reps == null) s.reps = parseNum(repsIn.placeholder);
      if (!s.reps) { repsIn.focus(); return; }
      s.done = true;
    } else s.done = false;
  }, { silent: true });
  const s = state.draft.entries[exId][j];
  if (!s.reps) return;
  kgIn.value = s.kg ?? '';
  repsIn.value = s.reps ?? '';
  chk.classList.toggle('on', s.done);
  chk.setAttribute('aria-pressed', s.done);
  row.classList.toggle('on', s.done);
  chk.classList.remove('pop'); void chk.offsetWidth; chk.classList.add('pop');
  haptic(15);
  const list = state.draft.entries[exId];
  card.querySelectorAll('.ex-dots i').forEach((dot, k) => dot.classList.toggle('on', !!list[k]?.done));
  const allDone = list.every((x) => x.done);
  card.classList.toggle('done', allDone);
  refreshFinish(root);
  // Toutes les séries faites : on ferme et on ouvre l'exercice suivant
  if (allDone && s.done) {
    setTimeout(() => {
      const next = card.nextElementSibling;
      card.classList.remove('open');
      if (next?.dataset.ex && !next.classList.contains('done')) {
        next.classList.add('open');
        update((st) => { st.draft.open = next.dataset.ex; }, { silent: true });
        setTimeout(() => next.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 250);
      }
    }, 450);
  }
}

function finish() {
  const d = state.draft;
  const entries = state.workout.map((ex) => ({
    exId: ex.id,
    name: ex.name,
    load: ex.load,
    sets: (d.entries[ex.id] || []).filter((s) => s.reps).map((s) => ({ kg: s.kg || 0, reps: s.reps })),
  })).filter((e) => e.sets.length);
  update((st) => {
    st.sessions.push({ id: uid(), date: new Date().toISOString(), entries, cardio: d.cardio.done ? d.cardio.min : null });
    st.draft = null;
  });
  toast('Séance enregistrée');
  document.getElementById('view').scrollTo({ top: 0, behavior: 'smooth' });
}

function confirmCancel() {
  openSheet({
    title: 'Abandonner ?',
    body: `<p class="hint" style="font-size:15px;margin-top:0">Les séries notées dans cette séance seront effacées. Tes séances déjà terminées ne sont pas touchées.</p>
      <div class="sheet-actions"><button class="btn block danger" data-yes>Abandonner la séance</button><button class="btn block ghost" data-no>Continuer la séance</button></div>`,
    onMount(s) {
      s.body.querySelector('[data-yes]').onclick = () => { update((st) => { st.draft = null; }); s.close(); };
      s.body.querySelector('[data-no]').onclick = () => s.close();
    },
  });
}

function openSessionSheet(id) {
  const s = state.sessions.find((x) => x.id === id);
  if (!s) return;
  const exOf = (e) => ({ load: e.load });
  openSheet({
    title: longDate(new Date(s.date)),
    body: `
      <div class="group">${s.entries.map((e) => `
        <div class="row"><div class="r-main"><div class="r-title">${esc(e.name)}</div>
        <div class="r-sub" style="white-space:normal">${setsSummary(exOf(e), e.sets)}</div></div></div>`).join('')}
        ${s.cardio ? `<div class="row"><div class="r-main"><div class="r-title">Fractionné</div><div class="r-sub">${s.cardio} min</div></div></div>` : ''}
      </div>
      <div class="sheet-actions"><button class="btn block danger" data-del>Supprimer cette séance</button></div>`,
    onMount(sh) {
      sh.body.querySelector('[data-del]').onclick = () => {
        update((st) => { st.sessions = st.sessions.filter((x) => x.id !== id); });
        sh.close();
        toast('Séance supprimée');
      };
    },
  });
}
