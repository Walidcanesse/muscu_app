import { state, update, dayKey, addDays, fromKey, uid } from './store.js';
import { icons, esc, fmt, parseNum, longDate, openSheet, toast, haptic, closeAllSheets } from './ui.js';
import { fuelCard, animateFuel } from './today.js';

let currentDay = dayKey();
let lastAddedId = null;

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
    },
    complete: kcal != null,
  };
}

async function fetchProduct(code) {
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

/* ---------- Vue ---------- */
function dayLabel(k) {
  const t = dayKey();
  if (k === t) return "Aujourd'hui";
  if (k === addDays(t, -1)) return 'Hier';
  return longDate(fromKey(k));
}

function entryRow(e) {
  const r = e.grams / 100;
  return `
  <button class="row food-row ${e.id === lastAddedId ? 'row-enter' : ''}" data-entry="${e.id}">
    <span class="dot">${e.img ? `<img src="${esc(e.img)}" alt="" loading="lazy">` : icons.food}</span>
    <div class="r-main">
      <div class="r-title">${esc(e.name)}</div>
      <div class="mini-macros"><span class="p">P <b>${fmt(e.per100.p * r)}</b></span><span class="c">G <b>${fmt(e.per100.c * r)}</b></span><span class="f">L <b>${fmt(e.per100.f * r)}</b></span></div>
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
    <h2 class="section">Journal <small>${list.length ? `${list.length} aliment${list.length > 1 ? 's' : ''}` : ''}</small></h2>
    ${list.length
      ? `<div class="group">${[...list].reverse().map(entryRow).join('')}</div>`
      : `<div class="group"><div class="empty"><b>Rien de noté ${isToday ? "aujourd'hui" : 'ce jour-là'}</b>Scanne un code-barres ou cherche un aliment avec le bouton +.</div></div>`}
    <button class="fab" data-act="add" aria-label="Ajouter un aliment">${icons.plus}</button>
  `;
  lastAddedId = null;
  animateFuel(root);

  root.onclick = (e) => {
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
    if (e.target.closest('[data-act="add"]')) openAddSheet();
  };
}

export function resetFoodDay() { currentDay = dayKey(); }

/* ---------- Ajouter ---------- */
function openAddSheet() {
  const rec = state.recents.slice(0, 12);
  openSheet({
    title: 'Ajouter',
    body: `
      <div class="add-grid">
        <button class="scan" data-a="scan">${icons.barcode}Scanner un code-barres</button>
        <button data-a="search">${icons.search}Rechercher</button>
        <button data-a="manual">${icons.pen}Saisie libre</button>
      </div>
      ${rec.length ? `<span class="label" style="margin-top:22px">Récents</span>
      <div class="group">${rec.map((p, i) => `
        <button class="row" data-rec="${i}">
          <div class="r-main"><div class="r-title">${esc(p.name)}</div><div class="r-sub">${p.manual ? 'Saisie libre' : `${esc(p.brand || 'Sans marque')}, ${fmt(p.lastGrams)} g`}</div></div>
          <div class="r-end"><span class="num">${fmt(p.per100.kcal * (p.lastGrams / 100))}</span><small>kcal</small></div>
        </button>`).join('')}</div>` : ''}`,
    onMount(s) {
      s.body.addEventListener('click', (e) => {
        const a = e.target.closest('[data-a]')?.dataset.a;
        if (a === 'scan') { s.close(); setTimeout(openScanner, 200); }
        if (a === 'search') { s.close(); setTimeout(openSearch, 200); }
        if (a === 'manual') { s.close(); setTimeout(() => openManual(), 200); }
        const r = e.target.closest('[data-rec]');
        if (r) {
          const p = state.recents[Number(r.dataset.rec)];
          s.close();
          setTimeout(() => (p.manual ? openManual(p) : openProduct(p, { grams: p.lastGrams })), 200);
        }
      });
    },
  });
}

function rememberRecent(p, grams) {
  const key = p.code || `m:${p.name}`;
  update((st) => {
    st.recents = st.recents.filter((x) => (x.code || `m:${x.name}`) !== key);
    st.recents.unshift({ code: p.code || null, name: p.name, brand: p.brand || '', img: p.img || '', per100: p.per100, serving: p.serving || null, manual: !!p.manual, lastGrams: grams });
    st.recents = st.recents.slice(0, 40);
  }, { silent: true });
}

function addEntry(p, grams) {
  const id = uid();
  lastAddedId = id;
  rememberRecent(p, grams);
  update((st) => {
    (st.food[currentDay] ||= []).push({ id, code: p.code || null, name: p.name, brand: p.brand || '', img: p.img || '', per100: p.per100, grams, manual: !!p.manual, t: Date.now() });
  });
}

/* ---------- Fiche produit ---------- */
function openProduct(p, { edit = false, grams } = {}) {
  let g = grams ?? p.grams ?? p.serving ?? 100;
  const chips = [50, 100, 150, 200, 250];
  openSheet({
    title: edit ? 'Modifier' : 'Quantité',
    body: `
      <div class="product-head">
        <div class="ph-img">${p.img ? `<img src="${esc(p.img)}" alt="">` : icons.food}</div>
        <div><h3>${esc(p.name)}</h3><p>${esc(p.brand || 'Sans marque')}</p></div>
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
      <p class="hint" style="margin-top:-8px">Pour 100 g : ${fmt(p.per100.kcal)} kcal, ${fmt(p.per100.p, 1)} g de protéines, ${fmt(p.per100.c, 1)} g de glucides, ${fmt(p.per100.f, 1)} g de lipides.</p>
      <div class="sheet-actions">
        <button class="btn block" data-save>${edit ? 'Enregistrer' : 'Ajouter au journal'}</button>
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
      };
      draw();
      input.addEventListener('input', draw);
      input.addEventListener('focus', () => input.select());
      s.body.addEventListener('click', (e) => {
        const c = e.target.closest('[data-g]');
        if (c) { input.value = fmt(Number(c.dataset.g)); draw(); haptic(8); }
        if (e.target.closest('[data-save]')) {
          const v = parseNum(input.value);
          if (!v || v <= 0) { input.focus(); return; }
          if (edit) {
            update((st) => { const it = (st.food[currentDay] || []).find((x) => x.id === p.id); if (it) it.grams = v; });
            toast('Quantité modifiée');
          } else {
            addEntry(p, v);
            toast('Ajouté au journal');
          }
          s.close();
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
  const editId = prefill.id && prefill.manual ? prefill.id : null;
  openSheet({
    title: 'Saisie libre',
    body: `
      <label class="label" for="m-name" style="margin-top:0">Nom</label>
      <input class="input" id="m-name" style="width:100%" value="${esc(prefill.name || '')}" placeholder="Ex. : assiette de pâtes bolognaise">
      <div class="grid-2">
        <div><label class="label" for="m-kcal">Calories (kcal)</label><input class="input num" id="m-kcal" inputmode="decimal" style="width:100%;font-size:20px" value="${v.kcal ?? ''}"></div>
        <div><label class="label" for="m-p">Protéines (g)</label><input class="input num" id="m-p" inputmode="decimal" style="width:100%;font-size:20px" value="${v.p ?? ''}"></div>
        <div><label class="label" for="m-c">Glucides (g)</label><input class="input num" id="m-c" inputmode="decimal" style="width:100%;font-size:20px" value="${v.c ?? ''}"></div>
        <div><label class="label" for="m-f">Lipides (g)</label><input class="input num" id="m-f" inputmode="decimal" style="width:100%;font-size:20px" value="${v.f ?? ''}"></div>
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
        const p = { name, brand: '', manual: true, code: null, per100: { kcal, p: parseNum($('#m-p').value) || 0, c: parseNum($('#m-c').value) || 0, f: parseNum($('#m-f').value) || 0 } };
        addEntry(p, 100);
        s.close();
        toast('Ajouté au journal');
      };
    },
  });
}

/* ---------- Recherche ---------- */
function openSearch() {
  openSheet({
    title: 'Rechercher',
    body: `
      <form class="search-box" id="s-form">
        <input class="input" id="s-q" type="search" enterkeyhint="search" placeholder="Ex. : skyr, thon, pain de mie" autocomplete="off">
        <button class="btn" style="height:48px;padding:0 16px" aria-label="Rechercher">${icons.search}</button>
      </form>
      <div id="s-res"><p class="hint">Base Open Food Facts, produits vendus en France.</p></div>`,
    onMount(s) {
      const q = s.body.querySelector('#s-q');
      const res = s.body.querySelector('#s-res');
      let results = [];
      setTimeout(() => q.focus(), 450);
      s.body.querySelector('#s-form').onsubmit = async (e) => {
        e.preventDefault();
        const term = q.value.trim();
        if (term.length < 2) return;
        q.blur();
        res.innerHTML = `<div class="empty">Recherche en cours…</div>`;
        try {
          results = await searchProducts(term);
          res.innerHTML = results.length
            ? `<div class="group">${results.map((p, i) => `
              <button class="row food-row row-enter" data-r="${i}" style="animation-delay:${Math.min(i, 8) * 30}ms">
                <span class="dot">${p.img ? `<img src="${esc(p.img)}" alt="" loading="lazy">` : icons.food}</span>
                <div class="r-main"><div class="r-title">${esc(p.name)}</div><div class="r-sub">${esc(p.brand || 'Sans marque')}</div></div>
                <div class="r-end"><span class="num">${fmt(p.per100.kcal)}</span><small>kcal / 100 g</small></div>
              </button>`).join('')}</div>`
            : `<div class="empty"><b>Aucun résultat</b>Essaie un autre mot, ou scanne directement le code-barres.</div>`;
        } catch {
          res.innerHTML = `<div class="empty"><b>Recherche impossible</b>Vérifie ta connexion internet, puis relance la recherche.</div>`;
        }
      };
      res.addEventListener('click', (e) => {
        const r = e.target.closest('[data-r]');
        if (r) { const p = results[Number(r.dataset.r)]; s.close(); setTimeout(() => openProduct(p), 200); }
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
      setTimeout(() => toast('Pas de connexion internet', { error: true }), 250);
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
          b.disabled = false; b.textContent = 'Chercher le produit';
          toast('Pas de connexion internet', { error: true });
        }
      };
    },
  });
}

function openNotFound(code) {
  openSheet({
    title: 'Introuvable',
    body: `<p class="hint" style="font-size:15px;margin-top:0">Le code ${esc(code)} n'est pas dans Open Food Facts. Recopie les valeurs de l'étiquette en saisie libre.</p>
      <div class="sheet-actions"><button class="btn block" data-m>Saisie libre</button><button class="btn block ghost" data-s>Rechercher par nom</button></div>`,
    onMount(s) {
      s.body.querySelector('[data-m]').onclick = () => { s.close(); setTimeout(() => openManual(), 200); };
      s.body.querySelector('[data-s]').onclick = () => { s.close(); setTimeout(openSearch, 200); };
    },
  });
}

export { closeAllSheets };
