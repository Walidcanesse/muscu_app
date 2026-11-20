// Calories dépensées, pas (import depuis Santé via Raccourcis) et suivi consommé / dépensé / poids.
import { state, update, dayKey, addDays, fromKey, dayTotals, dayExpenditure, weightAvg } from './store.js';
import { icons, esc, fmt, fmtKg, parseNum, openSheet, toast, shortDate } from './ui.js';

const SHORTCUT = 'Pas vers Sport';
const SEGS = [
  ['rest', 'Repos', 'var(--act-rest)'],
  ['walk', 'Pas', 'var(--act-walk)'],
  ['lift', 'Séance', 'var(--green)'],
  ['cardio', 'Cardio', 'var(--blue)'],
  ['abs', 'Abdos', 'var(--red)'],
];
const signed = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmt(Math.abs(v))}`;

/** Carte « Bilan du jour » (Aujourd'hui). */
export function energyCard(k = dayKey()) {
  const inK = dayTotals(k).kcal;
  const out = dayExpenditure(k);
  const bal = Math.round(inK - out.total);
  const cut = state.plan.mode === 'cut';
  const good = cut ? bal <= 0 : Math.abs(bal) <= 250;
  const segs = SEGS.filter(([key]) => out[key] > 0.5);
  return `
  <section class="energy">
    <div class="en-row">
      <div><span class="en-label">Consommées</span><span class="num">${fmt(inK)}</span></div>
      <div><span class="en-label">Dépensées</span><span class="num">${fmt(out.total)}</span></div>
      <div><span class="en-label">Bilan</span><span class="num ${good ? 'good' : 'warn'}">${signed(bal)}</span></div>
    </div>
    <div class="en-bar" aria-hidden="true">${segs.map(([key, , c]) => `<i style="flex-grow:${out[key].toFixed(0)};background:${c}"></i>`).join('')}</div>
    <div class="en-legend" style="--n:${Math.max(3, segs.length)}">${segs.map(([key, label, c]) => `<div><span class="en-k"><i style="background:${c}"></i>${label}</span><b>${fmt(out[key])}</b></div>`).join('')}</div>
    <button class="en-steps" data-steps="${k}">
      <span class="en-steps-ico">${icons.run}</span>
      <span class="r-main"><b>${out.steps != null ? `${fmt(out.steps)} pas` : 'Ajoute tes pas'}</b><small>${out.steps != null ? 'Touche pour mettre à jour' : 'Depuis Santé ou à la main'}</small></span>
      <span class="chev">${icons.chev}</span>
    </button>
  </section>`;
}

/* ---------- Pas ---------- */
export function openSteps(k = dayKey(), { pasteFirst = false } = {}) {
  const cur = state.steps[k];
  openSheet({
    title: k === dayKey() ? 'Pas du jour' : `Pas du ${shortDate(fromKey(k))}`,
    body: `
      <div class="qty" style="margin-top:4px">
        <input class="field num" id="st-in" inputmode="numeric" value="${cur != null ? cur : ''}" placeholder="0" aria-label="Nombre de pas">
        <span class="unit">pas</span>
      </div>
      ${pasteFirst ? `<button class="btn block" data-paste>${icons.download}Coller les pas copiés</button>` : ''}
      <button class="btn block" data-save ${pasteFirst ? 'hidden' : ''}>Enregistrer</button>
      <span class="label" style="margin-top:22px">Depuis l'app Santé</span>
      <div class="group">
        <button class="row" data-run>
          <span class="src-n">1</span>
          <div class="r-main"><div class="r-title">Importer depuis Santé</div><div class="r-sub">Lance le raccourci « ${esc(SHORTCUT)} »</div></div>
          <span class="r-ico">${icons.bolt}</span>
        </button>
        <button class="row ${pasteFirst ? 'hl' : ''}" data-paste>
          <span class="src-n">2</span>
          <div class="r-main"><div class="r-title">Coller les pas copiés</div><div class="r-sub">De retour ici, une fois le raccourci terminé</div></div>
          <span class="r-ico">${icons.download}</span>
        </button>
      </div>
      <details class="howto">
        <summary>Créer le raccourci (une seule fois)${icons.chev}</summary>
        <div class="howto-body">
          <p class="hint">Une appli web ne peut pas lire Santé directement : un raccourci iPhone copie tes pas, puis tu les colles ici.</p>
          <ol>
            <li><span>Ouvre l'app <b>Raccourcis</b> et touche <b>+</b>.</span></li>
            <li><span>Ajoute l'action <b>Rechercher des échantillons de santé</b> : type <b>Nombre de pas</b>, avec le filtre <b>Date de début</b> est <b>aujourd'hui</b>.</span></li>
            <li><span>Ajoute <b>Calculer des statistiques</b> et choisis <b>Somme</b>.</span></li>
            <li><span>Ajoute <b>Copier dans le presse-papiers</b>.</span></li>
            <li><span>Nomme le raccourci exactement <b>${esc(SHORTCUT)}</b>.</span></li>
          </ol>
          <p class="hint" style="margin-top:14px">Les noms des actions peuvent légèrement varier selon ta version d'iOS.</p>
        </div>
      </details>`,
    onMount(s) {
      const input = s.body.querySelector('#st-in');
      const save = (v) => {
        update((st) => { if (v == null) delete st.steps[k]; else st.steps[k] = v; });
        s.close();
        toast(v == null ? 'Pas effacés' : `${fmt(v)} pas enregistrés`, { fb: v == null ? 'delete' : 'success' });
      };
      s.body.addEventListener('click', async (e) => {
        if (e.target.closest('[data-run]')) {
          try { sessionStorage.setItem('fonte.stepsPending', k); } catch { /* rien */ }
          location.href = `shortcuts://run-shortcut?name=${encodeURIComponent(SHORTCUT)}`;
          return;
        }
        if (e.target.closest('[data-paste]')) {
          try {
            const txt = await navigator.clipboard.readText();
            const n = parseInt(String(txt).replace(/[^\d]/g, ''), 10);
            if (!Number.isFinite(n) || n > 200000) { toast('Aucun nombre de pas copié', { error: true }); return; }
            save(n);
          } catch {
            toast('Collage refusé : saisis le nombre à la main', { error: true });
            s.body.querySelector('[data-save]').hidden = false;
            input.focus();
          }
          return;
        }
        if (e.target.closest('[data-save]')) {
          const v = parseNum(input.value);
          save(v == null ? null : Math.max(0, Math.round(v)));
        }
      });
    },
  });
}

/** Au retour du raccourci : proposer de coller les pas. */
export function checkStepsReturn() {
  let k = null;
  try { k = sessionStorage.getItem('fonte.stepsPending'); sessionStorage.removeItem('fonte.stepsPending'); } catch { /* rien */ }
  if (k) setTimeout(() => openSteps(k, { pasteFirst: true }), 300);
}

/* ---------- Suivi : consommé / dépensé / poids ---------- */
const WD1 = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

/** Pas « rond » pour les graduations (500, 1 000…). */
function niceStep(max, n = 3) {
  const raw = max / n;
  const p = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw) || raw;
}

function barsChart(days) {
  const W = 320, H = 168, pad = { t: 8, b: 22, l: 0, r: 34 };
  const top = Math.max(1, ...days.flatMap((d) => [d.in || 0, d.out]));
  const step = niceStep(top);
  const max = Math.ceil(top / step) * step;
  const n = days.length;
  const plotW = W - pad.l - pad.r;
  const slot = plotW / n;
  const bw = Math.max(2.5, Math.min(11, slot * 0.32));
  const gap = Math.max(1, Math.min(2, slot * 0.06));
  const y = (v) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const base = H - pad.b;
  const grid = [];
  for (let v = 0; v <= max + 0.1; v += step) {
    grid.push(`<line x1="0" x2="${plotW}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="rgba(255,255,255,${v ? 0.07 : 0.14})" ${v ? 'stroke-dasharray="2 4"' : ''}/>`
      + (v ? `<text x="${W}" y="${(y(v) + 3.5).toFixed(1)}" text-anchor="end" font-size="10" fill="var(--chalk-3)">${fmt(v)}</text>` : ''));
  }
  const rx = Math.min(3, bw / 2);
  const bars = days.map((d, i) => {
    const cx = pad.l + slot * i + slot / 2;
    const delay = `animation-delay:${Math.round(i * (n > 7 ? 12 : 40))}ms`;
    const o = `<rect class="grow" style="${delay}" x="${(cx - bw - gap / 2).toFixed(1)}" y="${y(d.out).toFixed(1)}" width="${bw.toFixed(1)}" height="${(base - y(d.out)).toFixed(1)}" rx="${rx}" fill="var(--act-rest)"/>`;
    const c = d.in ? `<rect class="grow" style="${delay}" x="${(cx + gap / 2).toFixed(1)}" y="${y(d.in).toFixed(1)}" width="${bw.toFixed(1)}" height="${(base - y(d.in)).toFixed(1)}" rx="${rx}" fill="var(--chalk)"/>` : '';
    const isLast = i === n - 1;
    const lab = (n <= 7 || i % 5 === 4 || isLast) && !(n > 7 && !isLast && i > n - 4)
      ? `<text x="${cx.toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="10" font-weight="${isLast ? 700 : 400}" fill="${isLast ? 'var(--chalk)' : 'var(--chalk-3)'}">${n <= 7 ? WD1[d.date.getDay()] : d.date.getDate()}</text>` : '';
    return o + c + lab;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="track-chart" role="img" aria-label="Calories consommées et dépensées par jour">${grid.join('')}${bars}</svg>`;
}

function weightChart(days) {
  const pts = days.map((d, i) => [i, d.w]).filter(([, v]) => v != null);
  if (pts.length < 2) return '<div class="empty" style="padding:18px 0 14px">Ajoute au moins deux pesées pour voir la courbe.</div>';
  const W = 320, H = 132, n = days.length, R = 34;
  const vs = pts.map(([, v]) => v);
  let min = Math.floor((Math.min(...vs) - 0.1) * 2) / 2, max = Math.ceil((Math.max(...vs) + 0.1) * 2) / 2;
  if (max - min < 1) { min -= 0.5; max += 0.5; }
  if (max - min > 2) { min = Math.floor(min); max = Math.ceil(max); }
  const plotW = W - R;
  const X = (i) => 6 + (i * (plotW - 12)) / Math.max(1, n - 1);
  const Y = (v) => 8 + (1 - (v - min) / (max - min)) * (H - 30);
  let d = `M${X(pts[0][0]).toFixed(1)},${Y(pts[0][1]).toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = [X(pts[i - 1][0]), Y(pts[i - 1][1])], [x1, y1] = [X(pts[i][0]), Y(pts[i][1])];
    const cx = (x0 + x1) / 2;
    d += ` C${cx.toFixed(1)},${y0.toFixed(1)} ${cx.toFixed(1)},${y1.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
  }
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(X(pts[i][0]) - X(pts[i - 1][0]), Y(pts[i][1]) - Y(pts[i - 1][1]));
  len = Math.ceil(len * 1.3);
  const last = pts[pts.length - 1];
  const first = pts[0];
  const area = `${d} L${X(last[0]).toFixed(1)},${H - 22} L${X(first[0]).toFixed(1)},${H - 22} Z`;
  const tv = [];
  const st = max - min > 2 ? 1 : 0.5;
  for (let v = min; v <= max + 0.01; v += st) tv.push(v);
  const ticks = tv.map((v) => `<line x1="0" x2="${plotW}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="rgba(255,255,255,0.07)" stroke-dasharray="2 4"/>
    <text x="${W}" y="${(Y(v) + 3.5).toFixed(1)}" text-anchor="end" font-size="10" fill="var(--chalk-3)">${fmtKg(Math.round(v * 10) / 10)}</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="track-chart" role="img" aria-label="Courbe de poids">
    <defs><linearGradient id="wgrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--green)" stop-opacity="0.18"/><stop offset="1" stop-color="var(--green)" stop-opacity="0"/></linearGradient></defs>
    ${ticks}
    <path class="fade" d="${area}" fill="url(#wgrad)"/>
    <path class="path" d="${d}" fill="none" stroke="var(--green)" stroke-width="2.5" stroke-linecap="round" style="--len:${len}"/>
    ${pts.map(([i, v]) => `<circle class="fade" cx="${X(i).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="${i === last[0] ? 4 : 2.2}" fill="${i === last[0] ? 'var(--green)' : 'var(--sheet-2)'}" stroke="var(--green)" stroke-width="1.6"/>`).join('')}
    <text x="0" y="${H - 6}" font-size="10" fill="var(--chalk-3)">${shortDate(days[0].date)}</text>
    <text x="${plotW}" y="${H - 6}" font-size="10" fill="var(--chalk-3)" text-anchor="end">${shortDate(days[n - 1].date)}</text>
  </svg>`;
}

export function openTracking() {
  let span = 7;
  openSheet({
    title: 'Suivi',
    body: `<div class="seg fill" role="group" aria-label="Période"><button data-span="7" aria-pressed="true">7 jours</button><button data-span="30" aria-pressed="false">30 jours</button></div><div id="trk"></div>`,
    onMount(s) {
      const box = s.body.querySelector('#trk');
      const draw = () => {
        const today = dayKey();
        const days = Array.from({ length: span }, (_, i) => {
          const k = addDays(today, i - span + 1);
          const t = dayTotals(k).kcal;
          return { k, date: fromKey(k), in: t > 0 ? t : null, out: dayExpenditure(k).total, w: state.weights[k] ?? null };
        });
        const logged = days.filter((d) => d.in != null);
        const avgIn = logged.length ? logged.reduce((a, d) => a + d.in, 0) / logged.length : null;
        const avgOut = logged.length ? logged.reduce((a, d) => a + d.out, 0) / logged.length : days.reduce((a, d) => a + d.out, 0) / days.length;
        const bal = avgIn != null ? Math.round(avgIn - avgOut) : null;
        const goodBal = bal != null && (state.plan.mode === 'cut' ? bal <= 0 : Math.abs(bal) <= 250);
        const ws = days.filter((d) => d.w != null);
        const realDelta = ws.length >= 2 ? Math.round((ws[ws.length - 1].w - ws[0].w) * 10) / 10 : null;
        const avg7 = weightAvg(today, 7);
        box.innerHTML = `
          <div class="track-card">
            <div class="track-h"><b>Calories</b>
              <div class="track-legend"><span><i style="background:var(--chalk)"></i>Consommées</span><span><i style="background:var(--act-rest)"></i>Dépensées</span></div>
            </div>
            ${barsChart(days)}
          </div>
          <span class="label">Moyenne par jour${logged.length ? `, sur ${logged.length} jour${logged.length > 1 ? 's' : ''} renseigné${logged.length > 1 ? 's' : ''}` : ''}</span>
          <div class="stat-tiles">
            <div><small>Consommées</small><span class="num">${avgIn != null ? fmt(avgIn) : '–'}</span></div>
            <div><small>Dépensées</small><span class="num">${fmt(avgOut)}</span></div>
            <div><small>Bilan</small><span class="num ${bal == null ? '' : goodBal ? 'good' : 'warn'}">${bal != null ? signed(bal) : '–'}</span></div>
          </div>
          ${bal != null ? `<p class="hint">En théorie, ce bilan donne <b>${bal <= 0 ? '−' : '+'}${fmt(Math.abs((bal * 7) / 7700), 2)} kg par semaine</b>. La dépense est une estimation : fie-toi d'abord à l'évolution de ton poids.</p>` : '<p class="hint">Note tes repas pour voir ton bilan.</p>'}
          <div class="track-card" style="margin-top:18px">
            <div class="track-h"><b>Poids</b>${realDelta != null ? `<span class="num ${realDelta <= 0 ? 'good' : 'up'}">${realDelta > 0 ? '+' : realDelta < 0 ? '−' : ''}${fmtKg(Math.abs(realDelta))} kg</span>` : ''}</div>
            ${weightChart(days)}
          </div>
          ${realDelta != null ? `<p class="hint">Évolution sur ${span} jours${avg7 ? `. Moyenne des 7 derniers jours : <b>${fmtKg(Math.round(avg7.avg * 10) / 10)} kg</b>` : ''}.</p>` : ''}`;
      };
      draw();
      s.body.addEventListener('click', (e) => {
        const b = e.target.closest('[data-span]');
        if (!b || b.getAttribute('aria-pressed') === 'true') return;
        span = Number(b.dataset.span);
        s.body.querySelectorAll('[data-span]').forEach((x) => x.setAttribute('aria-pressed', x === b));
        draw();
      });
    },
  });
}
