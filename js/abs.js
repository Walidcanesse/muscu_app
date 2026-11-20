import { state, update, uid } from './store.js';
import { icons, esc, durLabel, mmss, parseNum, openSheet, toast, haptic } from './ui.js';
import { openTechnique, techniqueKey } from './technique.js';

const PREP = 5;

export function absTotalSec(a) {
  const n = a.exercises.length;
  if (!n) return 0;
  const round = a.exercises.reduce((t, e) => t + e.sec, 0) + a.rest * (n - 1);
  return round * a.rounds + a.roundRest * (a.rounds - 1);
}

export function renderAbs(root) {
  const a = state.abs;
  const n = a.exercises.length;
  const steps = [];
  a.exercises.forEach((e, i) => {
    const tech = techniqueKey(e.name);
    steps.push(`<li${tech ? ` class="has-tech" data-tech="${esc(e.name)}" role="button" tabindex="0" aria-label="Technique : ${esc(e.name)}"` : ''}><span class="c-n">${i + 1}</span><span class="c-name">${esc(e.name)}${tech ? '<small>Voir la technique</small>' : ''}</span><span class="c-t">${e.sec} s</span></li>`);
    if (i < n - 1) steps.push(`<li class="rest"><span class="c-n" aria-hidden="true">·</span><span class="c-name">Repos</span><span class="c-t">${a.rest} s</span></li>`);
  });
  if (a.rounds > 1) steps.push(`<li class="rest"><span class="c-n" aria-hidden="true">↻</span><span class="c-name">Pause, puis tour suivant</span><span class="c-t">${durLabel(a.roundRest)}</span></li>`);

  root.innerHTML = `
    <header class="head">
      <div><h1>Abdos</h1><div class="sub">Circuit chronométré</div></div>
      <button class="icon-btn" data-act="edit" aria-label="Modifier les exercices">${icons.pencil}</button>
    </header>

    <div class="abs-total">
      <div><span class="num">${mmss(absTotalSec(a))}</span>durée totale</div>
      <div><span class="num">${a.rounds}</span>tour${a.rounds > 1 ? 's' : ''}</div>
      <div><span class="num">${n}</span>exercice${n > 1 ? 's' : ''}</div>
    </div>

    <div class="group"><ol class="circuit">${steps.join('')}</ol></div>

    <button class="btn block" data-act="start" style="margin-top:16px" ${n ? '' : 'disabled'}>${icons.play}Lancer le circuit</button>

    <h2 class="section">Réglages</h2>
    <div class="group">
      ${stepRow('rounds', 'Tours', `${a.rounds}`, 'Nombre de passages du circuit')}
      ${stepRow('rest', 'Repos entre exercices', `${a.rest} s`)}
      ${stepRow('roundRest', 'Pause entre les tours', mmss(a.roundRest))}
      <div class="setting-row">
        <div><div>Annonce vocale</div><div class="r-sub">Le nom de l'exercice est lu à voix haute</div></div>
        <button class="check ${a.voice ? 'on' : ''}" data-act="voice" aria-pressed="${a.voice}" aria-label="Annonce vocale">${icons.check}</button>
      </div>
    </div>
    <p class="hint">Pendant le circuit, l'écran reste allumé. Pense à monter le son et à désactiver le mode silencieux.</p>
  `;

  root.onclick = (e) => {
    const tl = e.target.closest('[data-tech]');
    if (tl) { openTechnique(tl.dataset.tech); return; }
    const st = e.target.closest('[data-step]');
    if (st) {
      const [key, dir] = st.dataset.step.split(':');
      const d = Number(dir);
      update((s) => {
        const A = s.abs;
        if (key === 'rounds') A.rounds = Math.max(1, Math.min(6, A.rounds + d));
        if (key === 'rest') A.rest = Math.max(0, Math.min(60, A.rest + 5 * d));
        if (key === 'roundRest') A.roundRest = Math.max(0, Math.min(300, A.roundRest + 15 * d));
      });
      haptic(8);
      return;
    }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'start') startTimer();
    if (act === 'edit') openAbsEditor();
    if (act === 'voice') update((s) => { s.abs.voice = !s.abs.voice; });
  };
}

function stepRow(key, title, val, sub = '') {
  return `<div class="setting-row">
    <div><div>${title}</div>${sub ? `<div class="r-sub">${sub}</div>` : ''}</div>
    <div class="stepper"><button data-step="${key}:-1" aria-label="Diminuer">${icons.minus}</button><span class="num">${val}</span><button data-step="${key}:1" aria-label="Augmenter">${icons.plus}</button></div>
  </div>`;
}

/* ---------- Éditeur d'exercices ---------- */
function openAbsEditor() {
  let list = state.abs.exercises.map((e) => ({ ...e }));
  const rowsHtml = () => list.map((e, i) => `
    <div class="er" data-i="${i}">
      <input class="input" data-k="name" value="${esc(e.name)}" placeholder="Nom de l'exercice" aria-label="Nom">
      <input class="input small num" data-k="sec" inputmode="numeric" value="${e.sec}" aria-label="Durée en secondes" style="font-size:20px">
      <button class="icon-btn" data-up aria-label="Monter" ${i === 0 ? 'disabled style="opacity:.3"' : ''}><span style="display:block;transform:rotate(-90deg)">${icons.chev}</span></button>
      <button class="icon-btn" data-rm aria-label="Supprimer">${icons.trash}</button>
    </div>`).join('');
  openSheet({
    title: 'Exercices',
    body: `<p class="hint" style="margin-top:0">Nom et durée en secondes, dans l'ordre du circuit.</p>
      <div class="edit-list" id="abs-list">${rowsHtml()}</div>
      <button class="link" data-add>+ Ajouter un exercice</button>
      <div class="sheet-actions"><button class="btn block" data-save>Enregistrer</button></div>`,
    onMount(s) {
      const box = s.body.querySelector('#abs-list');
      const sync = () => {
        box.querySelectorAll('.er').forEach((r) => {
          const i = Number(r.dataset.i);
          list[i].name = r.querySelector('[data-k="name"]').value;
          list[i].sec = Math.max(5, Math.min(600, Math.round(parseNum(r.querySelector('[data-k="sec"]').value) ?? 45)));
        });
      };
      s.body.addEventListener('click', (e) => {
        const r = e.target.closest('.er');
        if (e.target.closest('[data-rm]') && r) { sync(); list.splice(Number(r.dataset.i), 1); box.innerHTML = rowsHtml(); }
        if (e.target.closest('[data-up]') && r) {
          sync(); const i = Number(r.dataset.i);
          if (i > 0) { [list[i - 1], list[i]] = [list[i], list[i - 1]]; box.innerHTML = rowsHtml(); }
        }
        if (e.target.closest('[data-add]')) { sync(); list.push({ id: uid(), name: '', sec: 45 }); box.innerHTML = rowsHtml(); box.lastElementChild.querySelector('input').focus(); }
        if (e.target.closest('[data-save]')) {
          sync();
          list = list.filter((x) => x.name.trim());
          update((st) => { st.abs.exercises = list.map((x) => ({ ...x, name: x.name.trim() })); });
          s.close();
          toast('Circuit enregistré');
        }
      });
    },
  });
}

/* ---------- Son et voix ---------- */
let ctx;
function audioInit() {
  try {
    if (navigator.audioSession) navigator.audioSession.type = 'playback';
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch { ctx = null; }
}
function beep(freq = 880, dur = 0.12, vol = 0.35) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'sine';
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}
let frVoice;
function pickVoice() {
  const vs = speechSynthesis?.getVoices?.() || [];
  frVoice = vs.find((v) => v.lang === 'fr-FR' && /Thomas|Amélie|Audrey|Aurélie/i.test(v.name)) || vs.find((v) => v.lang?.startsWith('fr'));
}
if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
function say(text) {
  if (!state.abs.voice || !('speechSynthesis' in window)) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'fr-FR';
    if (frVoice) u.voice = frVoice;
    u.rate = 1.02;
    speechSynthesis.speak(u);
  } catch { /* rien */ }
}

/* ---------- Écran de chrono ---------- */
let wakeLock = null;
async function keepAwake() {
  try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch { /* refusé */ }
}

function buildPhases(a) {
  const ph = [];
  const n = a.exercises.length;
  let workIndex = 0;
  ph.push({ kind: 'prep', dur: PREP, name: a.exercises[0].name, round: 1 });
  for (let r = 0; r < a.rounds; r++) {
    a.exercises.forEach((e, i) => {
      ph.push({ kind: 'work', dur: e.sec, name: e.name, round: r + 1, ex: i, w: workIndex++ });
      const nextEx = a.exercises[i + 1];
      if (i < n - 1 && a.rest > 0) ph.push({ kind: 'rest', dur: a.rest, name: nextEx.name, round: r + 1 });
    });
    if (r < a.rounds - 1 && a.roundRest > 0) ph.push({ kind: 'round', dur: a.roundRest, name: a.exercises[0].name, round: r + 2 });
  }
  return ph;
}

function startTimer() {
  const a = JSON.parse(JSON.stringify(state.abs));
  if (!a.exercises.length) return;
  audioInit();
  if ('speechSynthesis' in window) { try { speechSynthesis.speak(new SpeechSynthesisUtterance(' ')); } catch { /* rien */ } }
  keepAwake();

  const phases = buildPhases(a);
  const totalWork = phases.filter((p) => p.kind === 'work').length;
  // Cadran de 60 graduations : celles qui restent allumées = temps restant
  const R = 44, C = 2 * Math.PI * R, TICKS = 60, TICK = 0.8, TICK_W = 7;

  const el = document.createElement('div');
  el.className = 'timer prep';
  el.innerHTML = `
    <div class="t-bg" aria-hidden="true"><i class="gw"></i><i class="gr"></i><i class="gd"></i></div>
    <div class="t-top">
      <span class="t-round"></span>
      <button class="t-close" data-t="close" aria-label="Arrêter">${icons.close}</button>
    </div>
    <div class="t-progress">${Array.from({ length: totalWork }, () => '<i></i>').join('')}</div>
    <div class="t-center">
      <div class="t-kind"></div>
      <div class="t-name"></div>
      <div class="t-ring">
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <defs><mask id="t-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100"><circle class="prog" cx="50" cy="50" r="${R}" fill="none" stroke="#fff" stroke-width="12" stroke-dasharray="${C}" stroke-dashoffset="0"/></mask></defs>
          <circle class="ticks" cx="50" cy="50" r="${R}" fill="none" stroke-width="${TICK_W}" stroke-dasharray="${TICK} ${(C / TICKS - TICK).toFixed(3)}"/>
          <circle class="ticks lit" cx="50" cy="50" r="${R}" fill="none" stroke-width="${TICK_W}" stroke-dasharray="${TICK} ${(C / TICKS - TICK).toFixed(3)}" mask="url(#t-mask)"/>
        </svg>
        <div class="t-count"></div>
      </div>
      <div class="t-next"></div>
    </div>
    <div class="t-controls">
      <button class="t-btn" data-t="prev" aria-label="Étape précédente">${icons.back}</button>
      <button class="t-btn main" data-t="toggle" aria-label="Pause">${icons.pause}</button>
      <button class="t-btn" data-t="next" aria-label="Étape suivante">${icons.skip}</button>
    </div>`;
  document.getElementById('overlay-root').appendChild(el);

  const $ = (s) => el.querySelector(s);
  const segs = [...el.querySelectorAll('.t-progress i')];
  const ring = $('.prog');
  let idx = 0;
  let endAt = performance.now() + phases[0].dur * 1000;
  let paused = false, pausedLeft = 0, lastSec = null, finished = false;
  const startedAt = Date.now();

  function nextLabel(i) {
    const p = phases[i];
    if (p.kind !== 'work') return '';
    const nx = phases.slice(i + 1).find((x) => x.kind === 'work' || x.kind === 'round');
    if (!nx) return 'Dernier exercice';
    if (nx.kind === 'round') return `Ensuite : <b>pause de ${durLabel(nx.dur)}</b>`;
    return `Ensuite : <b>${esc(nx.name)}</b>`;
  }

  function show(announce = true) {
    const p = phases[idx];
    el.className = `timer ${p.kind}`;
    $('.t-round').textContent = `Tour ${p.round} sur ${a.rounds}`;
    const kinds = {
      prep: 'Prépare-toi',
      work: `Exercice ${p.ex + 1} sur ${a.exercises.length}`,
      rest: 'Repos, ensuite',
      round: `Pause, puis tour ${p.round}`,
    };
    $('.t-kind').textContent = kinds[p.kind];
    const nm = $('.t-name');
    nm.textContent = p.name;
    nm.classList.remove('swap'); void nm.offsetWidth; nm.classList.add('swap');
    $('.t-next').innerHTML = nextLabel(idx);
    segs.forEach((s, k) => {
      const cur = p.kind === 'work' && p.w === k;
      const nextW = phases.slice(idx).find((x) => x.kind === 'work');
      const doneUpTo = nextW ? nextW.w : totalWork;
      s.classList.toggle('done', k < (p.kind === 'work' ? p.w : doneUpTo));
      s.classList.toggle('cur', cur);
    });
    if (announce) {
      if (p.kind === 'work') { beep(1046, 0.35, 0.45); say(p.name); haptic(60); }
      if (p.kind === 'rest') { beep(523, 0.3); say(`Repos. Ensuite, ${p.name}`); }
      if (p.kind === 'round') { beep(523, 0.3); say(`Pause. Tour ${p.round} dans ${durLabel(p.dur).replace(' s', ' secondes')}`); }
      if (p.kind === 'prep') say(`Prépare-toi. ${p.name}`);
    }
    lastSec = null;
  }

  function finish() {
    finished = true;
    el.className = 'timer finish';
    segs.forEach((s) => { s.classList.add('done'); s.classList.remove('cur'); });
    $('.t-kind').textContent = `${durLabel(Math.round((Date.now() - startedAt) / 1000))} au total`;
    const nm = $('.t-name'); nm.textContent = 'Circuit terminé'; nm.classList.remove('swap'); void nm.offsetWidth; nm.classList.add('swap');
    $('.t-count').innerHTML = `<span style="width:38%;display:block">${icons.check}</span>`;
    ring.style.strokeDashoffset = 0;
    $('.t-next').textContent = 'Bien joué.';
    $('.t-controls').innerHTML = `<button class="btn t-done-btn" data-t="close">Fermer</button>`;
    beep(784, 0.15); setTimeout(() => beep(1046, 0.4), 170);
    say('Circuit terminé. Bien joué.');
    update((st) => { st.absLog.push(new Date().toISOString()); if (st.absLog.length > 200) st.absLog.shift(); });
  }

  function go(to) {
    if (to < 0) to = 0;
    if (to >= phases.length) return finish();
    idx = to;
    const now = performance.now();
    endAt = now + phases[idx].dur * 1000;
    if (paused) pausedLeft = phases[idx].dur * 1000;
    show();
  }

  function tick() {
    if (finished) return;
    const now = performance.now();
    if (!paused) {
      // rattrape le temps si l'appli a été mise en pause par iOS
      let caught = 0;
      while (now >= endAt) {
        if (idx + 1 >= phases.length) return finish();
        idx++;
        endAt += phases[idx].dur * 1000;
        caught++;
      }
      if (caught) show(now - (endAt - phases[idx].dur * 1000) < 1500);
    }
    const left = paused ? pausedLeft : endAt - now;
    const dur = phases[idx].dur * 1000;
    const sec = Math.ceil(left / 1000);
    const cnt = $('.t-count');
    if (sec !== lastSec) {
      cnt.textContent = mmss(sec);
      cnt.classList.remove('tick'); void cnt.offsetWidth; cnt.classList.add('tick');
      if (!paused && lastSec !== null && sec <= 3 && sec >= 1) beep(660, 0.09, 0.3);
      lastSec = sec;
    }
    const k = Math.min(1, Math.max(0, 1 - left / dur));
    ring.style.strokeDashoffset = (C * k).toFixed(2);
    const cur = el.querySelector('.t-progress i.cur');
    if (cur) cur.style.setProperty('--p', k.toFixed(3));
  }

  const iv = setInterval(tick, 100);
  let raf;
  const loop = () => { tick(); raf = requestAnimationFrame(loop); };
  raf = requestAnimationFrame(loop);
  show();

  const onVis = () => { if (document.visibilityState === 'visible') { keepAwake(); audioInit(); tick(); } };
  document.addEventListener('visibilitychange', onVis);

  function close() {
    clearInterval(iv);
    cancelAnimationFrame(raf);
    document.removeEventListener('visibilitychange', onVis);
    try { speechSynthesis.cancel(); } catch { /* rien */ }
    wakeLock?.release?.().catch(() => {});
    wakeLock = null;
    el.classList.add('closing');
    setTimeout(() => el.remove(), 400);
    if (finished) toast('Circuit enregistré');
  }

  el.addEventListener('click', (e) => {
    const t = e.target.closest('[data-t]')?.dataset.t;
    if (!t) return;
    haptic(10);
    if (t === 'close') return close();
    if (finished) return;
    if (t === 'toggle') {
      const btn = $('[data-t="toggle"]');
      if (!paused) { paused = true; pausedLeft = Math.max(0, endAt - performance.now()); btn.innerHTML = icons.play; btn.setAttribute('aria-label', 'Reprendre'); try { speechSynthesis.cancel(); } catch { /* rien */ } }
      else { paused = false; endAt = performance.now() + pausedLeft; btn.innerHTML = icons.pause; btn.setAttribute('aria-label', 'Pause'); audioInit(); }
    }
    if (t === 'next') go(idx + 1);
    if (t === 'prev') {
      // si on est au début de l'étape, on revient à la précédente
      const elapsed = phases[idx].dur * 1000 - (paused ? pausedLeft : endAt - performance.now());
      go(elapsed < 2000 ? idx - 1 : idx);
    }
  });
}
