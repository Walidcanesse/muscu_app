import { state, update, replaceAll, uid } from './store.js';
import { icons, esc, parseNum, openSheet, toast } from './ui.js';

export function openSettings() {
  const g = state.goals;
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
      <span class="label" style="margin-top:0">Objectifs du jour</span>
      <div class="grid-2">
        <div><label class="label" for="g-kcal" style="margin-top:0">Calories</label><input class="input num" id="g-kcal" inputmode="numeric" value="${g.kcal}" style="width:100%;font-size:20px"></div>
        <div><label class="label" for="g-p" style="margin-top:0">Protéines (g)</label><input class="input num" id="g-p" inputmode="numeric" value="${g.p}" style="width:100%;font-size:20px"></div>
        <div><label class="label" for="g-c">Glucides (g)</label><input class="input num" id="g-c" inputmode="numeric" value="${g.c}" style="width:100%;font-size:20px"></div>
        <div><label class="label" for="g-f">Lipides (g)</label><input class="input num" id="g-f" inputmode="numeric" value="${g.f}" style="width:100%;font-size:20px"></div>
      </div>
      <p class="hint" id="g-check"></p>

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
      <p class="hint" style="text-align:center;margin-top:26px">Fonte, version 1.1</p>`,
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
      const sync = () => box.querySelectorAll('.er').forEach((r) => {
        const e = exs[Number(r.dataset.i)];
        e.name = r.querySelector('[data-k="name"]').value;
        e.sets = Math.max(1, Math.min(10, Math.round(parseNum(r.querySelector('[data-k="sets"]').value) ?? 3)));
      });
      s.body.addEventListener('click', async (e) => {
        const r = e.target.closest('.er');
        if (e.target.closest('[data-rm]') && r) { sync(); exs.splice(Number(r.dataset.i), 1); box.innerHTML = exRows(); }
        if (e.target.closest('[data-load]') && r) { sync(); const x = exs[Number(r.dataset.i)]; x.load = x.load === 'Lest' ? 'kg' : 'Lest'; box.innerHTML = exRows(); }
        if (e.target.closest('[data-add]')) { sync(); exs.push({ id: uid(), name: '', sets: 3, load: 'kg' }); box.innerHTML = exRows(); box.lastElementChild.querySelector('input').focus(); }
        if (e.target.closest('[data-save]')) {
          sync();
          const goals = {
            kcal: Math.round(parseNum($('#g-kcal').value) || g.kcal),
            p: Math.round(parseNum($('#g-p').value) || g.p),
            c: Math.round(parseNum($('#g-c').value) || g.c),
            f: Math.round(parseNum($('#g-f').value) || g.f),
          };
          update((st) => {
            st.goals = goals;
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
          toast("Ce fichier n'est pas une sauvegarde Fonte", { error: true });
        }
      });
    },
  });
}

async function exportData() {
  const d = new Date();
  const name = `fonte-sauvegarde-${d.toISOString().slice(0, 10)}.json`;
  const blob = new Blob([JSON.stringify(state, null, 1)], { type: 'application/json' });
  const file = new File([blob], name, { type: 'application/json' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Sauvegarde Fonte' });
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
