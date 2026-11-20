import { state, update, replaceAll, uid, computePlan, ACTIVITY } from './store.js';
import { icons, esc, parseNum, openSheet, toast, fmt } from './ui.js';

export function openSettings() {
  const g = state.goals;
  let mode = state.plan.mode;
  let adjust = state.plan.adjust;
  const prof = { ...state.profile };
  let exs = state.workout.map((e) => ({ ...e }));
  const exRows = () => exs.map((e, i) => `
    <div class="er" data-i="${i}">
      <input class="input" data-k="name" value="${esc(e.name)}" placeholder="Nom de l'exercice" aria-label="Nom">
      <input class="input small num" data-k="sets" inputmode="numeric" value="${e.sets}" aria-label="Nombre de séries" style="font-size:20px">
      <button class="icon-btn" data-load aria-label="Type de charge" style="width:auto;padding:0 10px;font-size:13px;font-weight:600">${e.load === 'Lest' ? 'Lest' : 'kg'}</button>
      <button class="icon-btn" data-rm aria-label="Supprimer">${icons.trash}</button>
    </div>`).join('');

  openSheet({
    title: 'Réglages',
    body: `
      <span class="label" style="margin-top:0">Objectif</span>
      <div class="seg fill" id="mode" role="group" aria-label="Objectif">
        <button data-mode="cut">Sèche</button><button data-mode="maint">Maintien</button><button data-mode="manual">Manuel</button>
      </div>

      <div id="auto-box">
        <div class="plan-card" id="plan"></div>
        <div class="grid-2">
          <div><label class="label" for="p-h">Taille (cm)</label><input class="input num" id="p-h" inputmode="numeric" value="${prof.height}" style="width:100%;font-size:20px"></div>
          <div><label class="label" for="p-a">Âge</label><input class="input num" id="p-a" inputmode="numeric" value="${prof.age}" style="width:100%;font-size:20px"></div>
        </div>
        <span class="label">Sexe</span>
        <div class="seg fill" id="sex" role="group" aria-label="Sexe"><button data-sex="m">Homme</button><button data-sex="f">Femme</button></div>
        <span class="label">Activité</span>
        <div class="seg fill" id="act" role="group" aria-label="Activité">${Object.entries(ACTIVITY).map(([k, a]) => `<button data-act="${k}">${a.label}</button>`).join('')}</div>
        <p class="hint" id="act-sub" style="margin-top:2px"></p>
        <div class="setting-row" style="padding:12px 0 0">
          <div><div>Ajustement</div><div class="r-sub">Selon l'évolution de ton poids</div></div>
          <div class="stepper"><button data-adj="-50" aria-label="Moins 50 kcal">${icons.minus}</button><span class="num" id="adj" style="min-width:74px"></span><button data-adj="50" aria-label="Plus 50 kcal">${icons.plus}</button></div>
        </div>
      </div>

      <div id="manual-box">
        <div class="grid-2">
          <div><label class="label" for="g-kcal">Calories</label><input class="input num" id="g-kcal" inputmode="numeric" value="${g.kcal}" style="width:100%;font-size:20px"></div>
          <div><label class="label" for="g-p">Protéines min. (g)</label><input class="input num" id="g-p" inputmode="numeric" value="${g.p}" style="width:100%;font-size:20px"></div>
          <div><label class="label" for="g-c">Glucides (g)</label><input class="input num" id="g-c" inputmode="numeric" value="${g.c}" style="width:100%;font-size:20px"></div>
          <div><label class="label" for="g-f">Lipides min. (g)</label><input class="input num" id="g-f" inputmode="numeric" value="${g.f}" style="width:100%;font-size:20px"></div>
          <div><label class="label" for="g-fib">Fibres min. (g)</label><input class="input num" id="g-fib" inputmode="numeric" value="${g.fib ?? 30}" style="width:100%;font-size:20px"></div>
          <div><label class="label" for="g-sug">Sucres max. (g)</label><input class="input num" id="g-sug" inputmode="numeric" value="${g.sug ?? 50}" style="width:100%;font-size:20px"></div>
        </div>
        <p class="hint" id="g-check"></p>
      </div>

      <span class="label" style="margin-top:26px">Exercices de la séance</span>
      <p class="hint" style="margin-top:0">Nom, nombre de séries, et type de charge : kg pour une charge classique, Lest pour un poids ajouté au poids du corps.</p>
      <div class="edit-list" id="ex-list">${exRows()}</div>
      <button class="link" data-add>+ Ajouter un exercice</button>

      <div class="sheet-actions"><button class="btn block" data-save>Enregistrer</button></div>

      <span class="label" style="margin-top:30px">Sauvegarde</span>
      <p class="hint" style="margin-top:0">Tes données restent uniquement sur ce téléphone. Exporte une sauvegarde de temps en temps (dans Fichiers ou iCloud Drive) pour ne rien perdre.</p>
      <div class="btn-row" style="margin-top:10px">
        <button class="btn ghost" data-export>${icons.download}Exporter</button>
        <button class="btn ghost" data-import>${icons.upload}Importer</button>
      </div>
      <input type="file" id="imp" accept="application/json,.json" hidden>
      <p class="hint" style="text-align:center;margin-top:26px">Sport & Nutrition, version 1.9.3</p>`,
    onMount(s) {
      const $ = (q) => s.body.querySelector(q);
      const box = $('#ex-list');
      const check = () => {
        const kcal = parseNum($('#g-kcal').value) || 0;
        const sum = (parseNum($('#g-p').value) || 0) * 4 + (parseNum($('#g-c').value) || 0) * 4 + (parseNum($('#g-f').value) || 0) * 9;
        $('#g-check').textContent = `Tes macros font ${Math.round(sum)} kcal${Math.abs(sum - kcal) > 60 ? `, pour un objectif de ${Math.round(kcal)} kcal.` : '.'}`;
      };
      check();
      s.body.querySelectorAll('#g-kcal,#g-p,#g-c,#g-f').forEach((i) => i.addEventListener('input', check));

      const readProfile = () => {
        prof.height = Math.round(Math.min(230, Math.max(120, parseNum($('#p-h').value) || prof.height)));
        prof.age = Math.round(Math.min(90, Math.max(14, parseNum($('#p-a').value) || prof.age)));
      };
      const drawPlan = () => {
        s.body.querySelectorAll('#mode [data-mode]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.mode === mode));
        s.body.querySelectorAll('#sex [data-sex]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.sex === prof.sex));
        s.body.querySelectorAll('#act [data-act]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.act === prof.activity));
        $('#act-sub').textContent = ACTIVITY[prof.activity].sub;
        $('#adj').textContent = `${adjust > 0 ? '+' : adjust < 0 ? '−' : ''}${Math.abs(adjust)} kcal`;
        $('#auto-box').hidden = mode === 'manual';
        $('#manual-box').hidden = mode !== 'manual';
        if (mode === 'manual') return;
        const t = { ...prof };
        const r = computePlan(mode, t, adjust);
        const src = r.src === 'avg' ? 'moyenne de tes pesées sur 7 jours' : r.src === 'last' ? 'dernière pesée' : 'aucune pesée encore, ajoute-en une';
        $('#plan').innerHTML = `
          <div class="plan-kcal"><span class="num">${fmt(r.kcal)}</span> kcal par jour</div>
          <div class="plan-macros">
            <div><i style="background:var(--prot)"></i>Protéines<b>${r.p} g</b><small>minimum</small></div>
            <div><i style="background:var(--fat)"></i>Lipides<b>${r.f} g</b><small>minimum</small></div>
            <div><i style="background:var(--carb)"></i>Glucides<b>${r.c} g</b><small>le reste</small></div>
            <div><i style="background:var(--fib)"></i>Fibres<b>${Math.max(30, Math.round((r.kcal / 1000) * 14))} g</b><small>minimum</small></div>
            <div><i style="background:var(--sug)"></i>Sucres<b>${Math.round((r.kcal * 0.1) / 4)} g</b><small>maximum</small></div>
          </div>
          <p class="hint">Calculé pour ${fmt(r.w, 1)} kg (${src}), ${t.height} cm et ${t.age} ans. Maintien estimé : ${fmt(r.tdee)} kcal${mode === 'cut' ? `, moins ${r.deficit} kcal pour perdre environ 0,5 % de ton poids par semaine` : ''}.${r.floored ? ' Les calories sont bloquées à ton métabolisme de base, à ne pas descendre en dessous.' : ''} Les objectifs se mettent à jour à chaque pesée.</p>`;
      };
      drawPlan();
      s.body.querySelectorAll('#p-h,#p-a').forEach((i) => i.addEventListener('input', () => { readProfile(); drawPlan(); }));
      const sync = () => box.querySelectorAll('.er').forEach((r) => {
        const e = exs[Number(r.dataset.i)];
        e.name = r.querySelector('[data-k="name"]').value;
        e.sets = Math.max(1, Math.min(10, Math.round(parseNum(r.querySelector('[data-k="sets"]').value) ?? 3)));
      });
      s.body.addEventListener('click', async (e) => {
        const md = e.target.closest('[data-mode]');
        if (md) { mode = md.dataset.mode; drawPlan(); return; }
        const sx = e.target.closest('[data-sex]');
        if (sx) { prof.sex = sx.dataset.sex; drawPlan(); return; }
        const ac = e.target.closest('#act [data-act]');
        if (ac) { prof.activity = ac.dataset.act; drawPlan(); return; }
        const adj = e.target.closest('[data-adj]');
        if (adj) { adjust = Math.max(-500, Math.min(500, adjust + Number(adj.dataset.adj))); drawPlan(); return; }
        const r = e.target.closest('.er');
        if (e.target.closest('[data-rm]') && r) { sync(); exs.splice(Number(r.dataset.i), 1); box.innerHTML = exRows(); }
        if (e.target.closest('[data-load]') && r) { sync(); const x = exs[Number(r.dataset.i)]; x.load = x.load === 'Lest' ? 'kg' : 'Lest'; box.innerHTML = exRows(); }
        if (e.target.closest('[data-add]')) { sync(); exs.push({ id: uid(), name: '', sets: 3, load: 'kg' }); box.innerHTML = exRows(); box.lastElementChild.querySelector('input').focus(); }
        if (e.target.closest('[data-save]')) {
          sync();
          readProfile();
          const goals = {
            kcal: Math.round(parseNum($('#g-kcal').value) || g.kcal),
            p: Math.round(parseNum($('#g-p').value) || g.p),
            c: Math.round(parseNum($('#g-c').value) || g.c),
            f: Math.round(parseNum($('#g-f').value) || g.f),
            fib: Math.round(parseNum($('#g-fib').value) || g.fib || 30),
            sug: Math.round(parseNum($('#g-sug').value) || g.sug || 50),
          };
          update((st) => {
            st.goals = goals;
            st.profile = { ...prof };
            st.plan = { mode, adjust };
            st.workout = exs.filter((x) => x.name.trim()).map((x) => ({ ...x, name: x.name.trim() }));
            if (st.draft) {
              st.workout.forEach((x) => {
                const l = st.draft.entries[x.id];
                if (l) while (l.length < x.sets) l.push({ kg: null, reps: null, done: false });
              });
            }
          });
          s.close();
          toast('Réglages enregistrés');
        }
        if (e.target.closest('[data-export]')) exportData();
        if (e.target.closest('[data-import]')) $('#imp').click();
      });
      $('#imp').addEventListener('change', async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        try {
          const data = JSON.parse(await f.text());
          if (!data || typeof data !== 'object' || !('goals' in data)) throw new Error('format');
          replaceAll(data);
          s.close();
          toast('Sauvegarde importée');
        } catch {
          toast("Ce fichier n'est pas une sauvegarde de l'appli", { error: true });
        }
      });
    },
  });
}

async function exportData() {
  const d = new Date();
  const name = `sport-nutrition-sauvegarde-${d.toISOString().slice(0, 10)}.json`;
  const blob = new Blob([JSON.stringify(state, null, 1)], { type: 'application/json' });
  const file = new File([blob], name, { type: 'application/json' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Sauvegarde Sport & Nutrition' });
      return;
    }
  } catch (err) {
    if (err?.name === 'AbortError') return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  toast('Sauvegarde exportée');
}
