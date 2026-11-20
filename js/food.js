import { state, update, dayKey, addDays, fromKey, uid } from './store.js';
import { icons, esc, fmt, parseNum, longDate, openSheet, toast, haptic, closeAllSheets } from './ui.js';
import { fuelCard, animateFuel } from './today.js';
import { openSettings } from './settings.js';

let currentDay = dayKey();
let lastAddedId = null;

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
const kcalOf = (p, g) => (p.per100.kcal * g) / 100;

/* ---------- Open Food Facts ---------- */
const FIELDS = 'code,product_name,product_name_fr,brands,nutriments,image_front_small_url,serving_quantity';

function toProduct(p) {
  const n = p.nutriments || {};
  let kcal = n['energy-kcal_100g'];
  if (kcal == null && n.energy_100g != null) kcal = n.energy_100g / 4.184;
  return {
    code: p.code,
    name: (p.product_name_fr || p.product_name || 'Produit sans nom').trim(),
    brand: (p.brands || '').split(',')[0].trim(),
    img: p.image_front_small_url || '',
    serving: Number(p.serving_quantity) || null,
    per100: {
      kcal: Number(kcal) || 0,
      p: Number(n.proteins_100g) || 0,
      c: Number(n.carbohydrates_100g) || 0,
      f: Number(n.fat_100g) || 0,
      fib: Number(n.fiber_100g) || 0,
      sug: Number(n.sugars_100g) || 0,
    },
    complete: kcal != null,
  };
}

async function fetchProduct(code) {
  // Tes aliments d'abord : un produit que tu as créé est reconnu au scan, même hors ligne
  const mine = state.foods.find((f) => f.code && f.code === code);
  if (mine) return mine;
  const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${FIELDS}`);
  if (!r.ok && r.status !== 404) throw new Error('reseau');
  const j = await r.json();
  if (j.status !== 1 || !j.product) return null;
  return toProduct({ ...j.product, code });
}

async function searchProducts(q) {
  const url = `https://fr.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=30&fields=${FIELDS}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('reseau');
  const j = await r.json();
  return (j.products || []).map(toProduct).filter((p) => p.complete);
}

/** Recherche locale : tes aliments puis tes récents. */
function searchLocal(q) {
  const n = norm(q);
  const match = (p) => !n || norm(`${p.name} ${p.brand || ''}`).includes(n);
  const mine = state.foods.filter(match).map((p) => ({ ...p, mine: true }));
  const seen = new Set(mine.map((p) => p.id));
  const rec = state.recents.filter((p) => !p.manual && match(p) && !(p.foodId && seen.has(p.foodId)));
  return { mine, rec };
}

/* ---------- Vue ---------- */
function dayLabel(k) {
  const t = dayKey();
  if (k === t) return "Aujourd'hui";
  if (k === addDays(t, -1)) return 'Hier';
  return longDate(fromKey(k));
}

const thumb = (p) => `<span class="dot">${p.img ? `<img src="${esc(p.img)}" alt="" loading="lazy">` : icons.food}</span>`;

function entryRow(e) {
  const r = e.grams / 100;
  return `
  <button class="row food-row ${e.id === lastAddedId ? 'row-enter' : ''}" data-entry="${e.id}">
    ${thumb(e)}
    <div class="r-main">
      <div class="r-title">${esc(e.name)}</div>
      <div class="mini-macros"><span class="p">P <b>${fmt(e.per100.p * r)}</b></span><span class="c">G <b>${fmt(e.per100.c * r)}</b></span><span class="f">L <b>${fmt(e.per100.f * r)}</b></span>${e.per100.fib ? `<span class="fi">Fi <b>${fmt(e.per100.fib * r)}</b></span>` : ''}${e.per100.sug ? `<span class="su">S <b>${fmt(e.per100.sug * r)}</b></span>` : ''}</div>
    </div>
    <div class="r-end"><span class="num">${fmt(e.per100.kcal * r)}</span><small>${e.manual ? '1 portion' : `${fmt(e.grams)} g`}</small></div>
  </button>`;
}

export function renderFood(root) {
  const list = state.food[currentDay] || [];
  const isToday = currentDay === dayKey();
  root.innerHTML = `
    <header class="head">
      <div><h1>Nutrition</h1><div class="sub">${dayLabel(currentDay)}</div></div>
      <div class="day-nav">
        <button class="icon-btn" data-day="-1" aria-label="Jour précédent">${icons.chevL}</button>
        <button class="icon-btn" data-day="1" aria-label="Jour suivant" ${isToday ? 'disabled style="opacity:.3"' : ''}>${icons.chev}</button>
      </div>
    </header>
    ${fuelCard(currentDay)}
    <h2 class="section">Journal ${list.length ? `<button class="link" data-save-meal>Enregistrer comme repas</button>` : ''}</h2>
    ${list.length
      ? `<div class="group">${[...list].reverse().map(entryRow).join('')}</div>`
      : `<div class="group"><div class="empty"><b>Rien de noté ${isToday ? "aujourd'hui" : 'ce jour-là'}</b>Scanne un code-barres, choisis un repas type ou cherche un aliment avec le bouton +.</div></div>`}
    <button class="fab" data-act="add" aria-label="Ajouter un aliment">${icons.plus}</button>
  `;
  lastAddedId = null;
  animateFuel(root);

  root.onclick = (e) => {
    if (e.target.closest('[data-open-goals]')) return openSettings();
    const d = e.target.closest('[data-day]');
    if (d && !d.disabled) {
      const next = addDays(currentDay, Number(d.dataset.day));
      if (next > dayKey()) return;
      currentDay = next;
      renderFood(root);
      return;
    }
    const en = e.target.closest('[data-entry]');
    if (en) {
      const item = (state.food[currentDay] || []).find((x) => x.id === en.dataset.entry);
      if (item) openProduct(item, { edit: true });
      return;
    }
    if (e.target.closest('[data-save-meal]')) {
      const items = (state.food[currentDay] || []).map(toItem);
      return openMealEditor(null, items);
    }
    if (e.target.closest('[data-act="add"]')) openAddSheet();
  };
}

export function resetFoodDay() { currentDay = dayKey(); }
export function setFoodDay(k) { currentDay = k > dayKey() ? dayKey() : k; }

/* ---------- Journal ---------- */
const keyOf = (x) => x.code || x.foodId || `m:${x.name}`;
function rememberRecent(p, grams) {
  const rec = { code: p.code || null, foodId: p.mine ? p.id : (p.foodId || null), name: p.name, brand: p.brand || '', img: p.img || '', per100: p.per100, serving: p.serving || null, manual: !!p.manual, lastGrams: grams };
  const key = keyOf(rec);
  update((st) => {
    st.recents = [rec, ...st.recents.filter((x) => keyOf(x) !== key)].slice(0, 40);
  }, { silent: true });
}

function addEntry(p, grams, { silent = false } = {}) {
  const id = uid();
  lastAddedId = id;
  rememberRecent(p, grams);
  update((st) => {
    (st.food[currentDay] ||= []).push({ id, code: p.code || null, name: p.name, brand: p.brand || '', img: p.img || '', per100: p.per100, grams, manual: !!p.manual, t: Date.now() });
  }, { silent });
}

const toItem = (e) => ({ name: e.name, brand: e.brand || '', img: e.img || '', code: e.code || null, per100: { ...e.per100 }, grams: e.grams, manual: !!e.manual });

/* ---------- Ajouter ---------- */
function openAddSheet() {
  const rec = state.recents.slice(0, 10);
  const meals = state.meals.slice(0, 4);
  openSheet({
    title: 'Ajouter',
    body: `
      <div class="add-grid">
        <button class="scan" data-a="scan">${icons.barcode}Scanner un code-barres</button>
        <button data-a="meals">${icons.bowl}Repas types</button>
        <button data-a="search">${icons.search}Rechercher</button>
        <button data-a="mine">${icons.star}Mes aliments</button>
        <button data-a="manual">${icons.pen}Saisie libre</button>
      </div>
      ${meals.length ? `<span class="label" style="margin-top:22px">Repas types</span>
      <div class="group">${meals.map((m) => `
        <button class="row" data-meal="${m.id}">
          <div class="r-main"><div class="r-title">${esc(m.name)}</div><div class="r-sub">${m.items.length} aliment${m.items.length > 1 ? 's' : ''}</div></div>
          <div class="r-end"><span class="num">${fmt(mealTotals(m).kcal)}</span><small>kcal</small></div>
        </button>`).join('')}</div>` : ''}
      ${rec.length ? `<span class="label" style="margin-top:22px">Récents</span>
      <div class="group">${rec.map((p, i) => `
        <button class="row" data-rec="${i}">
          <div class="r-main"><div class="r-title">${esc(p.name)}</div><div class="r-sub">${p.manual ? 'Saisie libre' : `${esc(p.brand || 'Sans marque')}, ${fmt(p.lastGrams)} g`}</div></div>
          <div class="r-end"><span class="num">${fmt(p.per100.kcal * (p.lastGrams / 100))}</span><small>kcal</small></div>
        </button>`).join('')}</div>` : ''}`,
    onMount(s) {
      s.body.addEventListener('click', (e) => {
        const go = (fn) => { s.close(); setTimeout(fn, 200); };
        const a = e.target.closest('[data-a]')?.dataset.a;
        if (a === 'scan') go(openScanner);
        if (a === 'search') go(() => openSearch());
        if (a === 'manual') go(() => openManual());
        if (a === 'meals') go(openMeals);
        if (a === 'mine') go(openMyFoods);
        const m = e.target.closest('[data-meal]');
        if (m) go(() => openMeal(m.dataset.meal));
        const r = e.target.closest('[data-rec]');
        if (r) {
          const p = state.recents[Number(r.dataset.rec)];
          go(() => (p.manual ? openManual(p) : openProduct(p, { grams: p.lastGrams })));
        }
      });
    },
  });
}

/* ---------- Fiche produit (quantité) ---------- */
function openProduct(p, { edit = false, grams, cta, onConfirm } = {}) {
  const g = grams ?? p.grams ?? p.serving ?? 100;
  const chips = [50, 100, 150, 200, 250];
  openSheet({
    title: edit ? 'Modifier' : 'Quantité',
    body: `
      <div class="product-head">
        <div class="ph-img">${p.img ? `<img src="${esc(p.img)}" alt="">` : icons.food}</div>
        <div><h3>${esc(p.name)}</h3><p>${esc(p.brand || (p.mine ? 'Mon aliment' : 'Sans marque'))}</p></div>
      </div>
      <div class="qty">
        <input class="field num" id="g-in" inputmode="decimal" value="${fmt(g)}" aria-label="Quantité en grammes">
        <span class="unit">g</span>
      </div>
      <div class="chips">
        ${p.serving ? `<button data-g="${p.serving}">1 portion (${fmt(p.serving)} g)</button>` : ''}
        ${chips.map((c) => `<button data-g="${c}">${c} g</button>`).join('')}
      </div>
      <div class="calc" id="calc"></div>
      <div class="calc-extra" id="calc-extra"></div>
      <p class="per100">Pour 100 g : ${fmt(p.per100.kcal)} kcal, ${fmt(p.per100.p, 1)} g de protéines, ${fmt(p.per100.c, 1)} g de glucides, ${fmt(p.per100.f, 1)} g de lipides, ${fmt(p.per100.fib || 0, 1)} g de fibres, ${fmt(p.per100.sug || 0, 1)} g de sucres.</p>
      <div class="sheet-actions">
        <button class="btn block" data-save>${cta || (edit ? 'Enregistrer' : 'Ajouter au journal')}</button>
        ${edit ? `<button class="btn block danger" data-del>Retirer du journal</button>` : ''}
      </div>`,
    onMount(s) {
      const input = s.body.querySelector('#g-in');
      const calc = s.body.querySelector('#calc');
      const draw = () => {
        const r = (parseNum(input.value) ?? 0) / 100;
        calc.innerHTML = `
          <div><span class="num">${fmt(p.per100.kcal * r)}</span><small>kcal</small></div>
          <div class="p"><span class="num">${fmt(p.per100.p * r)}</span><small>prot.</small></div>
          <div class="c"><span class="num">${fmt(p.per100.c * r)}</span><small>gluc.</small></div>
          <div class="f"><span class="num">${fmt(p.per100.f * r)}</span><small>lip.</small></div>`;
        extra.innerHTML = `<span class="fi">Fibres<b>${fmt((p.per100.fib || 0) * r, 1)} g</b></span><span class="su">Sucres<b>${fmt((p.per100.sug || 0) * r, 1)} g</b></span>`;
      };
      const extra = s.body.querySelector('#calc-extra');
      draw();
      input.addEventListener('input', draw);
      input.addEventListener('focus', () => input.select());
      s.body.addEventListener('click', (e) => {
        const c = e.target.closest('[data-g]');
        if (c) { input.value = fmt(Number(c.dataset.g)); draw(); haptic(8); }
        if (e.target.closest('[data-save]')) {
          const v = parseNum(input.value);
          if (!v || v <= 0) { input.focus(); return; }
          s.close();
          if (onConfirm) return onConfirm(p, v);
          if (edit) {
            update((st) => { const it = (st.food[currentDay] || []).find((x) => x.id === p.id); if (it) it.grams = v; });
            toast('Quantité modifiée');
          } else {
            addEntry(p, v);
            toast('Ajouté au journal');
          }
        }
        if (e.target.closest('[data-del]')) {
          update((st) => { st.food[currentDay] = (st.food[currentDay] || []).filter((x) => x.id !== p.id); });
          s.close();
          toast('Retiré du journal');
        }
      });
    },
  });
}

/* ---------- Saisie libre ---------- */
function openManual(prefill = {}) {
  const v = prefill.per100 || {};
  openSheet({
    title: 'Saisie libre',
    body: `
      <label class="label" for="m-name" style="margin-top:0">Nom</label>
      <input class="input" id="m-name" style="width:100%" value="${esc(prefill.name || '')}" placeholder="Ex. : assiette de pâtes bolognaise">
      <div class="grid-2">
        ${numField('m-kcal', 'Calories (kcal)', v.kcal)}${numField('m-p', 'Protéines (g)', v.p)}
        ${numField('m-c', 'Glucides (g)', v.c)}${numField('m-f', 'Lipides (g)', v.f)}
        ${numField('m-fib', 'Fibres (g)', v.fib)}${numField('m-sug', 'Sucres (g)', v.sug)}
      </div>
      <p class="hint">Valeurs pour la portion entière que tu as mangée.</p>
      <div class="sheet-actions"><button class="btn block" data-save>Ajouter au journal</button></div>`,
    onMount(s) {
      const $ = (id) => s.body.querySelector(id);
      if (!prefill.name) setTimeout(() => $('#m-name').focus(), 450);
      $('[data-save]').onclick = () => {
        const name = $('#m-name').value.trim();
        const kcal = parseNum($('#m-kcal').value);
        if (!name) { $('#m-name').focus(); return; }
        if (kcal == null) { $('#m-kcal').focus(); return; }
        const p = { name, brand: '', manual: true, code: null, per100: { kcal, p: parseNum($('#m-p').value) || 0, c: parseNum($('#m-c').value) || 0, f: parseNum($('#m-f').value) || 0, fib: parseNum($('#m-fib').value) || 0, sug: parseNum($('#m-sug').value) || 0 } };
        addEntry(p, 100);
        s.close();
        toast('Ajouté au journal');
      };
    },
  });
}

const numField = (id, lab, val) => `<div><label class="label" for="${id}">${lab}</label><input class="input num" id="${id}" inputmode="decimal" style="width:100%;font-size:20px" value="${val ?? ''}"></div>`;

/* ---------- Mes aliments (base perso) ---------- */
function openMyFoods() {
  openSheet({
    title: 'Mes aliments',
    body: `
      <button class="btn block ghost" data-new>${icons.plus}Créer un aliment</button>
      <div id="mf-list" style="margin-top:14px"></div>`,
    onMount(s) {
      const list = s.body.querySelector('#mf-list');
      const draw = () => {
        list.innerHTML = state.foods.length
          ? `<div class="group">${state.foods.map((f) => `
            <div class="row food-row">
              ${thumb(f)}
              <button class="r-main r-act" data-use="${f.id}"><div class="r-title">${esc(f.name)}</div><div class="r-sub">${fmt(f.per100.kcal)} kcal et ${fmt(f.per100.p, 1)} g de protéines pour 100 g</div></button>
              <button class="mini-btn" data-edit="${f.id}" aria-label="Modifier ${esc(f.name)}">${icons.pencil}</button>
            </div>`).join('')}</div>`
          : `<div class="empty"><b>Aucun aliment perso</b>Crée les aliments que tu ne trouves pas : ils apparaîtront dans la recherche et dans tes repas types.</div>`;
      };
      draw();
      s.body.addEventListener('click', (e) => {
        if (e.target.closest('[data-new]')) { s.close(); setTimeout(() => openFoodForm(), 200); }
        const ed = e.target.closest('[data-edit]');
        if (ed) { const f = state.foods.find((x) => x.id === ed.dataset.edit); s.close(); setTimeout(() => openFoodForm(f), 200); }
        const u = e.target.closest('[data-use]');
        if (u) { const f = state.foods.find((x) => x.id === u.dataset.use); s.close(); setTimeout(() => openProduct({ ...f, mine: true }), 200); }
      });
    },
  });
}

function openFoodForm(food = null, { code = null, after } = {}) {
  const v = food?.per100 || {};
  openSheet({
    title: food ? 'Modifier l\'aliment' : 'Nouvel aliment',
    body: `
      <label class="label" for="f-name" style="margin-top:0">Nom</label>
      <input class="input" id="f-name" style="width:100%" value="${esc(food?.name || '')}" placeholder="Ex. : flocons d'avoine">
      <label class="label" for="f-brand">Marque (facultatif)</label>
      <input class="input" id="f-brand" style="width:100%" value="${esc(food?.brand || '')}">
      <span class="label" style="margin-top:18px">Valeurs pour 100 g (sur l'étiquette)</span>
      <div class="grid-2" style="margin-top:-8px">
        ${numField('f-kcal', 'Calories (kcal)', v.kcal)}${numField('f-p', 'Protéines (g)', v.p)}
        ${numField('f-c', 'Glucides (g)', v.c)}${numField('f-f', 'Lipides (g)', v.f)}
        ${numField('f-fib', 'Fibres (g)', v.fib)}${numField('f-sug', 'dont sucres (g)', v.sug)}
      </div>
      <div class="grid-2">${numField('f-serv', 'Portion habituelle (g)', food?.serving)}<div></div></div>
      ${(code || food?.code) ? `<p class="hint">Code-barres ${esc(code || food.code)} : l'aliment sera reconnu au prochain scan.</p>` : ''}
      <div class="sheet-actions">
        <button class="btn block" data-save>${food ? 'Enregistrer' : 'Créer et ajouter au journal'}</button>
        ${food ? '<button class="btn block danger" data-del>Supprimer cet aliment</button>' : ''}
      </div>`,
    onMount(s) {
      const $ = (id) => s.body.querySelector(id);
      if (!food) setTimeout(() => $('#f-name').focus(), 450);
      s.body.addEventListener('click', (e) => {
        if (e.target.closest('[data-del]')) {
          update((st) => { st.foods = st.foods.filter((x) => x.id !== food.id); });
          s.close(); toast('Aliment supprimé');
          return;
        }
        if (!e.target.closest('[data-save]')) return;
        const name = $('#f-name').value.trim();
        const kcal = parseNum($('#f-kcal').value);
        if (!name) { $('#f-name').focus(); return; }
        if (kcal == null) { $('#f-kcal').focus(); return; }
        const rec = {
          id: food?.id || uid(),
          name, brand: $('#f-brand').value.trim(), img: '', code: code || food?.code || null,
          serving: parseNum($('#f-serv').value) || null,
          per100: { kcal, p: parseNum($('#f-p').value) || 0, c: parseNum($('#f-c').value) || 0, f: parseNum($('#f-f').value) || 0, fib: parseNum($('#f-fib').value) || 0, sug: parseNum($('#f-sug').value) || 0 },
        };
        update((st) => {
          const i = st.foods.findIndex((x) => x.id === rec.id);
          if (i >= 0) st.foods[i] = rec; else st.foods.unshift(rec);
        });
        s.close();
        if (food) { toast('Aliment enregistré'); return; }
        toast('Aliment créé');
        setTimeout(() => (after ? after({ ...rec, mine: true }) : openProduct({ ...rec, mine: true })), 250);
      });
    },
  });
}

/* ---------- Repas types ---------- */
function mealTotals(m) {
  return m.items.reduce((t, it) => {
    const r = it.grams / 100;
    t.kcal += it.per100.kcal * r; t.p += it.per100.p * r; t.c += it.per100.c * r; t.f += it.per100.f * r;
    return t;
  }, { kcal: 0, p: 0, c: 0, f: 0 });
}

function openMeals() {
  openSheet({
    title: 'Repas types',
    body: `
      <button class="btn block ghost" data-new>${icons.plus}Créer un repas type</button>
      <div style="margin-top:14px">${state.meals.length
        ? `<div class="group">${state.meals.map((m) => {
          const t = mealTotals(m);
          return `<button class="row" data-meal="${m.id}">
            <div class="r-main"><div class="r-title">${esc(m.name)}</div><div class="r-sub">${m.items.map((i) => esc(i.name)).join(', ')}</div></div>
            <div class="r-end"><span class="num">${fmt(t.kcal)}</span><small>${fmt(t.p)} g prot.</small></div>
          </button>`;
        }).join('')}</div>`
        : `<div class="empty"><b>Aucun repas type</b>Crée tes repas habituels une fois, puis ajoute-les au journal en un geste. Tu peux aussi enregistrer le journal d'une journée comme repas.</div>`}</div>`,
    onMount(s) {
      s.body.addEventListener('click', (e) => {
        if (e.target.closest('[data-new]')) { s.close(); setTimeout(() => openMealEditor(), 200); }
        const m = e.target.closest('[data-meal]');
        if (m) { s.close(); setTimeout(() => openMeal(m.dataset.meal), 200); }
      });
    },
  });
}

function openMeal(id) {
  const m = state.meals.find((x) => x.id === id);
  if (!m) return;
  const t = mealTotals(m);
  openSheet({
    title: m.name,
    body: `
      <div class="calc">
        <div><span class="num">${fmt(t.kcal)}</span><small>kcal</small></div>
        <div class="p"><span class="num">${fmt(t.p)}</span><small>prot.</small></div>
        <div class="c"><span class="num">${fmt(t.c)}</span><small>gluc.</small></div>
        <div class="f"><span class="num">${fmt(t.f)}</span><small>lip.</small></div>
      </div>
      <div class="group">${m.items.map((i) => `
        <div class="row food-row">${thumb(i)}
          <div class="r-main"><div class="r-title">${esc(i.name)}</div><div class="r-sub">${i.manual ? '1 portion' : `${fmt(i.grams)} g`}</div></div>
          <div class="r-end"><span class="num">${fmt(kcalOf(i, i.grams))}</span><small>kcal</small></div>
        </div>`).join('')}</div>
      <div class="sheet-actions">
        <button class="btn block" data-add>Ajouter au journal</button>
        <div class="btn-row"><button class="btn ghost" data-edit>Modifier</button><button class="btn danger" data-del>Supprimer</button></div>
      </div>`,
    onMount(s) {
      s.body.addEventListener('click', (e) => {
        if (e.target.closest('[data-add]')) {
          m.items.forEach((it, k) => addEntry(it, it.grams, { silent: k < m.items.length - 1 }));
          s.close();
          toast(`${m.name} ajouté au journal`);
        }
        if (e.target.closest('[data-edit]')) { s.close(); setTimeout(() => openMealEditor(m), 200); }
        if (e.target.closest('[data-del]')) {
          update((st) => { st.meals = st.meals.filter((x) => x.id !== m.id); });
          s.close(); toast('Repas supprimé');
        }
      });
    },
  });
}

function openMealEditor(meal = null, preset = null) {
  let items = (meal ? meal.items : preset || []).map((i) => ({ ...i, per100: { ...i.per100 } }));
  openSheet({
    title: meal ? 'Modifier le repas' : 'Nouveau repas type',
    body: `
      <label class="label" for="ml-name" style="margin-top:0">Nom du repas</label>
      <input class="input" id="ml-name" style="width:100%" value="${esc(meal?.name || '')}" placeholder="Ex. : petit-déj habituel">
      <span class="label" style="margin-top:18px">Aliments</span>
      <div id="ml-items"></div>
      <button class="link" data-pick>+ Ajouter un aliment</button>
      <span class="label" style="margin-top:8px">Total du repas</span>
      <div class="calc" id="ml-tot"></div>
      <div class="sheet-actions"><button class="btn block" data-save>Enregistrer le repas</button></div>`,
    onMount(s) {
      const box = s.body.querySelector('#ml-items');
      const tot = s.body.querySelector('#ml-tot');
      const drawTot = () => {
        const t = mealTotals({ items });
        tot.innerHTML = `
          <div><span class="num">${fmt(t.kcal)}</span><small>kcal</small></div>
          <div class="p"><span class="num">${fmt(t.p)}</span><small>prot.</small></div>
          <div class="c"><span class="num">${fmt(t.c)}</span><small>gluc.</small></div>
          <div class="f"><span class="num">${fmt(t.f)}</span><small>lip.</small></div>`;
      };
      const draw = () => {
        box.innerHTML = items.length ? `<div class="group">${items.map((i, k) => `
          <div class="row ml-row" data-k="${k}">
            <div class="r-main"><div class="r-title">${esc(i.name)}</div><div class="r-sub">${fmt(kcalOf(i, i.grams))} kcal${i.brand ? `, ${esc(i.brand)}` : ''}</div></div>
            ${i.manual ? '<span class="r-sub">1 portion</span>' : `<span class="ml-g-wrap"><input class="input ml-g" inputmode="decimal" value="${fmt(i.grams)}" aria-label="Grammes de ${esc(i.name)}"><span>g</span></span>`}
            <button class="mini-btn" data-rm aria-label="Retirer ${esc(i.name)}">${icons.trash}</button>
          </div>`).join('')}</div>` : '<div class="group"><div class="empty" style="padding:18px">Aucun aliment pour l\'instant.</div></div>';
        drawTot();
      };
      draw();
      box.addEventListener('input', (e) => {
        const r = e.target.closest('[data-k]');
        if (!r || !e.target.classList.contains('ml-g')) return;
        const v = parseNum(e.target.value);
        if (v && v > 0) {
          const it = items[Number(r.dataset.k)];
          it.grams = v;
          r.querySelector('.r-sub').textContent = `${fmt(kcalOf(it, v))} kcal${it.brand ? `, ${it.brand}` : ''}`;
          drawTot();
        }
      });
      s.body.addEventListener('click', (e) => {
        const r = e.target.closest('[data-k]');
        if (e.target.closest('[data-rm]') && r) { items.splice(Number(r.dataset.k), 1); draw(); return; }
        if (e.target.closest('[data-pick]')) {
          pickFood((p, g) => { items.push({ ...toItem({ ...p, grams: g }) }); draw(); });
          return;
        }
        if (e.target.closest('[data-save]')) {
          const name = s.body.querySelector('#ml-name').value.trim();
          if (!name) { s.body.querySelector('#ml-name').focus(); return; }
          if (!items.length) { toast('Ajoute au moins un aliment', { error: true }); return; }
          update((st) => {
            const rec = { id: meal?.id || uid(), name, items };
            const i = st.meals.findIndex((x) => x.id === rec.id);
            if (i >= 0) st.meals[i] = rec; else st.meals.unshift(rec);
          });
          s.close();
          toast('Repas enregistré');
        }
      });
    },
  });
}

/** Choisir un aliment (pour un repas type) : tes aliments, tes récents, ou Open Food Facts. */
function pickFood(onPick) {
  openSearch({ title: 'Choisir un aliment', onChoose: (p) => openProduct(p, { cta: 'Ajouter au repas', onConfirm: onPick }) });
}

/* ---------- Recherche ---------- */
function resultRow(p, i, src) {
  return `<button class="row food-row" data-r="${src}:${i}">
    ${thumb(p)}
    <div class="r-main"><div class="r-title">${esc(p.name)}</div><div class="r-sub">${esc(p.brand || (src === 'mine' ? 'Mon aliment' : 'Sans marque'))}</div></div>
    <div class="r-end"><span class="num">${fmt(p.per100.kcal)}</span><small>kcal / 100 g</small></div>
  </button>`;
}

function openSearch({ title = 'Rechercher', onChoose } = {}) {
  openSheet({
    title,
    body: `
      <form class="search-box" id="s-form">
        <input class="input" id="s-q" type="search" enterkeyhint="search" placeholder="Ex. : skyr, thon, pain de mie" autocomplete="off">
        <button class="btn" style="height:48px;padding:0 16px" aria-label="Rechercher">${icons.search}</button>
      </form>
      <div id="s-local"></div>
      <div id="s-res"></div>
      <button class="link" data-create style="margin-top:10px">+ Créer un aliment</button>`,
    onMount(s) {
      const q = s.body.querySelector('#s-q');
      const local = s.body.querySelector('#s-local');
      const res = s.body.querySelector('#s-res');
      let found = { mine: [], rec: [], off: [] };
      const choose = (p) => { s.close(); setTimeout(() => (onChoose ? onChoose(p) : openProduct(p)), 200); };
      const drawLocal = () => {
        const { mine, rec } = searchLocal(q.value);
        found.mine = mine; found.rec = rec.slice(0, 8);
        local.innerHTML = (mine.length ? `<span class="label">Mes aliments</span><div class="group">${mine.map((p, i) => resultRow(p, i, 'mine')).join('')}</div>` : '')
          + (found.rec.length ? `<span class="label">Récents</span><div class="group">${found.rec.map((p, i) => resultRow(p, i, 'rec')).join('')}</div>` : '');
      };
      drawLocal();
      q.addEventListener('input', drawLocal);
      setTimeout(() => q.focus(), 450);
      s.body.querySelector('#s-form').onsubmit = async (e) => {
        e.preventDefault();
        const term = q.value.trim();
        if (term.length < 2) return;
        q.blur();
        res.innerHTML = `<div class="empty">Recherche dans Open Food Facts…</div>`;
        try {
          found.off = await searchProducts(term);
          res.innerHTML = found.off.length
            ? `<span class="label">Open Food Facts</span><div class="group">${found.off.map((p, i) => resultRow(p, i, 'off')).join('')}</div>`
            : `<div class="empty"><b>Aucun résultat</b>Essaie un autre mot, scanne le code-barres ou crée l'aliment toi-même.</div>`;
        } catch {
          res.innerHTML = `<div class="empty"><b>Recherche impossible</b>Vérifie ta connexion internet, puis relance la recherche.</div>`;
        }
      };
      s.body.addEventListener('click', (e) => {
        const r = e.target.closest('[data-r]');
        if (r) {
          const [src, i] = r.dataset.r.split(':');
          const p = found[src][Number(i)];
          return choose(src === 'rec' ? { ...p, grams: p.lastGrams } : p);
        }
        if (e.target.closest('[data-create]')) {
          s.close();
          setTimeout(() => openFoodForm(null, { after: onChoose ? (f) => onChoose(f) : undefined }), 200);
        }
      });
    },
  });
}

/* ---------- Scanner ---------- */
function openScanner() {
  const el = document.createElement('div');
  el.className = 'scanner';
  el.innerHTML = `
    <video playsinline muted autoplay></video>
    <div class="scan-mask"><div class="scan-win"></div></div>
    <div class="scan-top"><span style="font-weight:600">Scanner</span><button class="t-close" data-x aria-label="Fermer">${icons.close}</button></div>
    <div class="scan-hint"><span id="sc-msg">Place le code-barres dans le cadre</span><br>
      <button class="btn ghost" data-type style="background:rgba(255,255,255,.14);border:0;color:#fff;height:44px">Taper le code</button></div>`;
  document.getElementById('overlay-root').appendChild(el);
  const video = el.querySelector('video');
  const msg = el.querySelector('#sc-msg');
  let stream = null, stopped = false, reader = null, rafId = null;

  function stop() {
    stopped = true;
    cancelAnimationFrame(rafId);
    try { reader?.reset(); } catch { /* rien */ }
    stream?.getTracks().forEach((t) => t.stop());
  }
  function close() {
    stop();
    el.classList.add('closing');
    setTimeout(() => el.remove(), 350);
  }
  el.querySelector('[data-x]').onclick = close;
  el.querySelector('[data-type]').onclick = () => { close(); setTimeout(openTypeCode, 250); };

  async function onCode(code) {
    if (stopped) return;
    stop();
    el.querySelector('.scan-win').classList.add('hit');
    haptic(40);
    msg.textContent = 'Recherche du produit…';
    try {
      const p = await fetchProduct(code);
      close();
      setTimeout(() => (p ? openProduct(p) : openNotFound(code)), 250);
    } catch {
      close();
      setTimeout(() => openNotFound(code, true), 250);
    }
  }

  (async () => {
    const formats = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];
    let native = null;
    if ('BarcodeDetector' in window) {
      try {
        const ok = await window.BarcodeDetector.getSupportedFormats();
        if (formats.some((f) => ok.includes(f))) native = new window.BarcodeDetector({ formats: formats.filter((f) => ok.includes(f)) });
      } catch { native = null; }
    }
    try {
      if (native) {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false });
        if (stopped) return stop();
        video.srcObject = stream;
        await video.play();
        const loop = async () => {
          if (stopped) return;
          try {
            const r = await native.detect(video);
            if (r.length) return onCode(r[0].rawValue);
          } catch { /* image pas prête */ }
          rafId = requestAnimationFrame(loop);
        };
        loop();
      } else {
        const Z = window.ZXing;
        if (!Z) throw new Error('lib');
        const hints = new Map();
        hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.UPC_A, Z.BarcodeFormat.UPC_E]);
        hints.set(Z.DecodeHintType.TRY_HARDER, true);
        reader = new Z.BrowserMultiFormatReader(hints, 150);
        await reader.decodeFromConstraints({ video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false }, video, (result) => {
          if (result) onCode(result.getText());
        });
        stream = video.srcObject;
        if (stopped) stop();
      }
    } catch (err) {
      msg.innerHTML = err?.name === 'NotAllowedError'
        ? "Accès à la caméra refusé. Autorise-le dans Réglages, puis Safari, puis Caméra."
        : 'Caméra indisponible. Tape le code à la main.';
    }
  })();
}

function openTypeCode() {
  openSheet({
    title: 'Code-barres',
    body: `<input class="input num" id="c-in" inputmode="numeric" placeholder="Les chiffres sous le code-barres" style="width:100%;font-size:22px;letter-spacing:.06em">
      <div class="sheet-actions"><button class="btn block" data-go>Chercher le produit</button></div>`,
    onMount(s) {
      const i = s.body.querySelector('#c-in');
      setTimeout(() => i.focus(), 450);
      s.body.querySelector('[data-go]').onclick = async () => {
        const code = i.value.replace(/\D/g, '');
        if (code.length < 8) { i.focus(); return; }
        const b = s.body.querySelector('[data-go]');
        b.disabled = true; b.textContent = 'Recherche…';
        try {
          const p = await fetchProduct(code);
          s.close();
          setTimeout(() => (p ? openProduct(p) : openNotFound(code)), 200);
        } catch {
          s.close();
          setTimeout(() => openNotFound(code, true), 200);
        }
      };
    },
  });
}

function openNotFound(code, offline = false) {
  openSheet({
    title: offline ? 'Pas de connexion' : 'Introuvable',
    body: `<p class="hint" style="font-size:15px;margin-top:0">${offline
      ? `Impossible de chercher le code ${esc(code)} sans internet. Tu peux créer l'aliment avec les valeurs de l'étiquette : il sera reconnu à chaque scan.`
      : `Le code ${esc(code)} n'est pas dans Open Food Facts. Crée l'aliment avec les valeurs de l'étiquette : il sera reconnu à chaque scan.`}</p>
      <div class="sheet-actions"><button class="btn block" data-c>Créer cet aliment</button><button class="btn block ghost" data-s>Rechercher par nom</button></div>`,
    onMount(s) {
      s.body.querySelector('[data-c]').onclick = () => { s.close(); setTimeout(() => openFoodForm(null, { code }), 200); };
      s.body.querySelector('[data-s]').onclick = () => { s.close(); setTimeout(() => openSearch(), 200); };
    },
  });
}

export { closeAllSheets };
