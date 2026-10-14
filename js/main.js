import { design, DEFAULTS, STEP, WALL_KEYS, parseDoorBays, formatDoorBays } from './design.js';
import { computeBOM, shoppingList } from './bom.js';
import { shippingLayout } from './shipping.js';
import { Viewer } from './viewer.js';
import { DEFAULT_PRICES, PLY } from './catalog.js';
import { ftin, inch, money, num } from './format.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

// ------------------------------------------------------------ state
const P = { ...DEFAULTS };
function readHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  for (const [k, v] of h) {
    if (!(k in DEFAULTS)) continue;
    P[k] = typeof DEFAULTS[k] === 'number' ? Number(v) : v;
  }
}
function writeHash() {
  const h = new URLSearchParams();
  for (const k of Object.keys(DEFAULTS)) if (P[k] !== DEFAULTS[k]) h.set(k, P[k]);
  const s = h.toString();
  history.replaceState(null, '', s ? '#' + s : location.pathname + location.search);
}
readHash();
window.addEventListener('hashchange', () => { readHash(); schedule(); });

const PRICE_KEY = 'polowat-house-prices-v1';
let prices = structuredClone(DEFAULT_PRICES);
try {
  const saved = JSON.parse(localStorage.getItem(PRICE_KEY) || '{}');
  for (const [k, v] of Object.entries(saved)) if (prices[k]) prices[k].price = v;
} catch { /* storage unavailable */ }
function savePrices() {
  try {
    const out = {};
    for (const [k, v] of Object.entries(prices)) if (v.price !== DEFAULT_PRICES[k].price) out[k] = v.price;
    localStorage.setItem(PRICE_KEY, JSON.stringify(out));
  } catch { /* ignore */ }
}

let renderMode = 'sketch';
try { renderMode = localStorage.getItem('polowat-render') || 'sketch'; } catch { /* ignore */ }

// ------------------------------------------------------------ advanced controls
const plyOpts = Object.entries(PLY).map(([k, v]) => [k, v.name]);
const ADV = [
  {
    title: 'Doors & windows', open: true, fields: [
      { k: 'doorBays', type: 'doorgrid' },
      { k: 'winSpacing', label: 'Max window spacing', min: 4, max: 30, step: 0.5, fmt: (v) => ftin(v * 12), hint: 'Windows are spread along every wall no further apart than this; doors take the place of a window' },
      { k: 'windowW', label: 'Louvre blade length (window width)', type: 'select', opts: [[3, '3 ft'], [4, '4 ft']] },
      { k: 'windowH', label: 'Louvre frame height', type: 'select', opts: [[3, '3 ft'], [4, '4 ft']] },
      { k: 'sill', label: 'Window sill height', min: 12, max: 48, step: 1, fmt: ftin },
      { k: 'doorW', label: 'Door width', min: 24, max: 40, step: 1, fmt: inch },
      { k: 'doorH', label: 'Door height', min: 72, max: 84, step: 1, fmt: ftin },
    ],
  },
  {
    title: 'Existing concrete', open: false, fields: [
      { k: 'midPosts', label: 'Columns between corners (each wall)', min: 0, max: 8, step: 1, fmt: (v) => `${v}` },
      { k: 'colSize', label: 'Column size', min: 6, max: 14, step: 0.5, fmt: (v) => `${inch(v)} × ${inch(v)}` },
      { k: 'ponyT', label: 'Outline / pony wall thickness', min: 4, max: 10, step: 0.5, fmt: inch },
      { k: 'ponyH', label: 'Pony wall height (above floor)', min: 6, max: 48, step: 1, fmt: ftin },
      { k: 'ringBottom', label: 'Ring beam underside (above floor)', min: 78, max: 108, step: 1, fmt: ftin },
      { k: 'ringH', label: 'Ring beam height', min: 6, max: 16, step: 0.5, fmt: inch },
      { k: 'floorAbove', label: 'Floor above grade', min: 0, max: 24, step: 1, fmt: inch },
    ],
  },
  {
    title: 'Floor slab', open: false, fields: [
      { k: 'floorSlab', label: 'Pour a concrete floor inside the outline', type: 'select', str: true, opts: [['yes', 'Yes'], ['no', 'No']] },
      { k: 'floorSlabT', label: 'Floor slab thickness', min: 3, max: 8, step: 0.5, fmt: inch },
      { k: 'rebarSpacing', label: 'Rebar grid', type: 'select', opts: [[12, '12" o.c.'], [16, '16" o.c.'], [18, '18" o.c.'], [24, '24" o.c.']] },
    ],
  },
  {
    title: 'Roof & framing', open: false, fields: [
      { k: 'pitch', label: 'Roof pitch', min: 2, max: 8, step: 0.5, fmt: (v) => `${v}:12` },
      { k: 'eave', label: 'Eave overhang', min: 0, max: 30, step: 1, fmt: inch },
      { k: 'rake', label: 'Gable-end overhang', min: 0, max: 18, step: 1, fmt: inch },
      { k: 'studSpacing', label: 'Stud spacing', type: 'select', opts: [[16, '16" o.c.'], [24, '24" o.c.']] },
      { k: 'rafterSpacing', label: 'Rafter spacing', type: 'select', opts: [[16, '16" o.c.'], [24, '24" o.c.']] },
      { k: 'purlinSpacing', label: 'Max purlin spacing', min: 16, max: 32, step: 1, fmt: inch },
    ],
  },
  {
    title: 'Sheet materials', open: false, fields: [
      { k: 'wallPly', label: 'Inner wall plywood', type: 'select', opts: plyOpts, str: true },
      { k: 'tinCover', label: 'Corrugated sheet cover width', min: 24, max: 40, step: 1, fmt: inch, hint: 'Usable width per sheet after the side lap' },
    ],
  },
  {
    title: 'Overage / contingency', open: false, fields: [
      { k: 'ovTin', label: 'Roofing & outer walls (tin/PVC)', type: 'pct' },
      { k: 'ovPly', label: 'Inner wall plywood', type: 'pct' },
      { k: 'ovFraming', label: 'Framing lumber', type: 'pct' },
      { k: 'ovFasteners', label: 'Nails, fasteners & hardware', type: 'pct' },
      { k: 'ovCement', label: 'Floor slab cement & rebar', type: 'pct' },
    ],
  },
  {
    title: 'Shipping', open: false, fields: [
      { k: 'freight', label: 'Ferry freight rate ($ per ft³)', type: 'num', step: 0.25, hint: 'Leave at 0 to exclude freight from the total' },
    ],
  },
];

function buildAdvanced() {
  const host = $('#advanced');
  host.innerHTML = '';
  for (const g of ADV) {
    const det = document.createElement('details');
    det.className = 'group';
    det.open = g.open;
    det.innerHTML = `<summary>${g.title}</summary>`;
    for (const f of g.fields) {
      const d = document.createElement('div');
      d.className = 'field' + (f.type === 'pct' || f.type === 'num' ? ' row' : '');
      if (f.type === 'doorgrid') {
        d.innerHTML = `<label>Doors</label><div class="door-grid" id="doorGrid"></div><div class="hint">One box per bay between columns, numbered left → right as seen from outside. Greyed bays are too narrow for a door.</div>`;
        det.appendChild(d);
        continue;
      }
      if (f.type === 'select') {
        d.innerHTML = `<label for="f-${f.k}">${f.label}</label><select id="f-${f.k}">${f.opts.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>`;
      } else if (f.type === 'pct' || f.type === 'num') {
        d.innerHTML = `<label for="f-${f.k}">${f.label}${f.type === 'pct' ? ' (%)' : ''}</label><input type="number" id="f-${f.k}" min="${f.min ?? 0}"${f.max !== undefined ? ` max="${f.max}"` : ''} step="${f.step || 1}">`;
      } else {
        d.innerHTML = `<label for="f-${f.k}">${f.label} <span class="val" id="v-${f.k}"></span></label><input type="range" id="f-${f.k}" min="${f.min}" max="${f.max}" step="${f.step}">`;
      }
      if (f.hint) d.insertAdjacentHTML('beforeend', `<div class="hint">${f.hint}</div>`);
      det.appendChild(d);
      const el = d.querySelector('input,select');
      el.addEventListener(f.type === 'select' ? 'change' : 'input', () => {
        let v = f.str ? el.value : Number(el.value);
        if (!f.str && f.max !== undefined) v = Math.min(f.max, Math.max(f.min ?? 0, v || 0));
        P[f.k] = v;
        schedule();
      });
    }
    host.appendChild(det);
  }
}

function syncControls() {
  $('#width').value = P.width;
  $('#depth').value = P.depth;
  $('#widthVal').textContent = ftin(P.width * 12);
  $('#depthVal').textContent = ftin(P.depth * 12);
  $$('.seg[data-param]').forEach((s) => s.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === P[s.dataset.param])));
  for (const g of ADV) {
    for (const f of g.fields) {
      if (f.type === 'doorgrid') continue;
      const el = $('#f-' + f.k);
      if (document.activeElement !== el) el.value = P[f.k];
      const v = $('#v-' + f.k);
      if (v) v.textContent = f.fmt(P[f.k]);
    }
  }
  $$('#renderSeg button, #renderSeg2 button').forEach((b) => b.classList.toggle('on', b.dataset.v === renderMode));
}

const WALL_LABEL = { front: 'Front', back: 'Back', left: 'Left end', right: 'Right end' };
function renderDoorGrid() {
  const host = $('#doorGrid');
  if (!host || !D) return;
  const nb = P.midPosts + 1;
  const map = parseDoorBays(P.doorBays, nb);
  let h = `<div class="dg-row dg-head"><span></span>${Array.from({ length: nb }, (_, j) => `<span>${j + 1}</span>`).join('')}</div>`;
  for (const k of WALL_KEYS) {
    h += `<div class="dg-row"><span class="dg-wall">${WALL_LABEL[k]}</span>`;
    D.doorGrid[k].forEach((bay, j) => {
      const tip = `${WALL_LABEL[k]} wall, bay ${j + 1}: ${ftin(bay.width)} clear${bay.fits ? '' : ' — too narrow for a door'}`;
      h += `<label class="dg-cell${bay.fits ? '' : ' dg-bad'}" title="${tip}"><input type="checkbox" data-wall="${k}" data-bay="${j}"${map[k][j] ? ' checked' : ''}${!bay.fits && !map[k][j] ? ' disabled' : ''}></label>`;
    });
    h += `</div>`;
  }
  host.style.setProperty('--nb', nb);
  host.innerHTML = h;
  host.querySelectorAll('input').forEach((cb) => cb.addEventListener('change', () => {
    const m2 = parseDoorBays(P.doorBays, nb);
    m2[cb.dataset.wall][Number(cb.dataset.bay)] = cb.checked;
    P.doorBays = formatDoorBays(m2);
    schedule();
  }));
}

// ------------------------------------------------------------ viewers
const viewer = new Viewer($('#viewport'));
let shipViewer = null;
viewer.setMode(renderMode);

let D = null;
let BOM = null;
let SHIP = null;
let step = STEP.DONE;
let pending = false;
let shipDirty = true;
let lastSize = '';

function schedule() {
  syncControls();
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => {
    pending = false;
    regenerate();
  });
}

function regenerate() {
  writeHash();
  D = design(P);
  BOM = computeBOM(D, P, prices);
  SHIP = shippingLayout(BOM, P);
  const sizeKey = `${P.width}x${P.depth}`;
  viewer.setModel({ parts: D.parts, bounds: D.bounds, dims: D.dims }, { fit: sizeKey !== lastSize && Math.abs(parseFloat(lastSize) - P.width) > 6 });
  lastSize = sizeKey;
  viewer.setStep(step, STEP.DONE);
  viewer.setDims($('#dimsChk').checked);
  shipDirty = true;
  if (activeTab === 'ship') updateShip();
  updateStepUI();
  renderDoorGrid();
  renderBOM();
  renderNotes();
  $('#subtitle').textContent = `${ftin(D.W)} × ${ftin(D.D)} on the existing concrete frame · ${D.info.nDoors} doors · ${D.info.nWin} windows`;
  $('#warnings').innerHTML = D.warnings.map((w) => `<div>⚠ ${w}</div>`).join('');
}

function updateShip() {
  if (!shipViewer) {
    shipViewer = new Viewer($('#shipViewport'));
    shipViewer.setMode(renderMode);
  }
  if (shipDirty) {
    shipViewer.setModel({ parts: SHIP.parts, bounds: SHIP.bounds, labels: SHIP.labels }, { fit: true, dir: [0.25, 1.3, 0.9] });
    shipViewer.setStep(Infinity, Infinity);
    renderShipTable();
    shipDirty = false;
  }
}

// ------------------------------------------------------------ step playback
const slider = $('#stepSlider');
slider.max = STEP.DONE;
slider.value = step;
let playTimer = null;

function setStep(s) {
  step = Math.max(0, Math.min(STEP.DONE, s));
  slider.value = step;
  viewer.setStep(step, STEP.DONE);
  updateStepUI();
}
function updateStepUI() {
  if (!D) return;
  const st = D.steps[step];
  $('#stepNum').textContent = step === STEP.DONE ? 'Complete' : step === 0 ? 'Start' : `Step ${step} of ${STEP.DONE - 1}`;
  $('#stepTitle').textContent = st.title;
  $('#stepText').textContent = st.text;
}
function play() {
  if (playTimer) return stop();
  if (step >= STEP.DONE) setStep(0);
  $('#playBtn').textContent = '❚❚';
  playTimer = setInterval(() => {
    if (step >= STEP.DONE) return stop();
    setStep(step + 1);
  }, 2600);
}
function stop() {
  clearInterval(playTimer);
  playTimer = null;
  $('#playBtn').textContent = '▶';
}
slider.addEventListener('input', () => { stop(); setStep(Number(slider.value)); });
$('#playBtn').addEventListener('click', play);
$('#prevStep').addEventListener('click', () => { stop(); setStep(step - 1); });
$('#nextStep').addEventListener('click', () => { stop(); setStep(step + 1); });
{
  const ticks = $('#stepTicks');
  const labels = { [STEP.FLOOR_PREP]: 'Floor', [STEP.PLATES]: 'Plates', [STEP.WALL_LONG]: 'Walls', [STEP.ROOF_FRAME]: 'Roof', [STEP.SIDING]: 'Siding', [STEP.INTERIOR]: 'Interior' };
  for (const [k, v] of Object.entries(labels)) {
    const sp = document.createElement('span');
    sp.textContent = v;
    sp.dataset.k = k;
    ticks.appendChild(sp);
  }
  const place = () => {
    const r = slider.getBoundingClientRect();
    const pr = slider.parentElement.getBoundingClientRect();
    const thumb = 8;
    ticks.querySelectorAll('span').forEach((sp) => {
      sp.style.left = r.left - pr.left + thumb + ((r.width - 2 * thumb) * Number(sp.dataset.k)) / STEP.DONE + 'px';
    });
  };
  new ResizeObserver(place).observe(slider);
}
window.addEventListener('keydown', (e) => {
  if (activeTab !== 'model' || e.target.matches('input,select,textarea')) return;
  if (e.key === 'ArrowRight') { stop(); setStep(step + 1); }
  if (e.key === 'ArrowLeft') { stop(); setStep(step - 1); }
  if (e.key === ' ') { e.preventDefault(); play(); }
});

// ------------------------------------------------------------ main controls
$('#width').addEventListener('input', (e) => { P.width = Number(e.target.value); schedule(); });
$('#depth').addEventListener('input', (e) => { P.depth = Number(e.target.value); schedule(); });
$$('.seg[data-param]').forEach((s) => s.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  P[s.dataset.param] = b.dataset.v;
  schedule();
}));
$$('#renderSeg, #renderSeg2').forEach((s) => s.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  renderMode = b.dataset.v;
  try { localStorage.setItem('polowat-render', renderMode); } catch { /* ignore */ }
  viewer.setMode(renderMode);
  if (shipViewer) shipViewer.setMode(renderMode);
  syncControls();
}));
$('#explode').addEventListener('input', (e) => viewer.setExplode(Number(e.target.value)));
$('#dimsChk').addEventListener('change', (e) => viewer.setDims(e.target.checked));
$$('.views button').forEach((b) => b.addEventListener('click', () => viewer.view(b.dataset.view)));
$('#resetBtn').addEventListener('click', () => {
  Object.assign(P, DEFAULTS);
  lastSize = '';
  schedule();
  viewer.fitted = false;
});
$('#shareBtn').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(location.href);
    $('#shareBtn').textContent = 'Link copied ✓';
  } catch {
    $('#shareBtn').textContent = 'Copy the address bar';
  }
  setTimeout(() => ($('#shareBtn').textContent = 'Copy share link'), 1800);
});

// ------------------------------------------------------------ tabs
let activeTab = 'model';
$$('.tab').forEach((t) => t.addEventListener('click', () => {
  activeTab = t.dataset.tab;
  $$('.tab').forEach((x) => x.classList.toggle('active', x === t));
  $$('.pane').forEach((p) => p.classList.toggle('active', p.id === 'pane-' + activeTab));
  viewer.active = activeTab === 'model';
  if (shipViewer) shipViewer.active = activeTab === 'ship';
  if (activeTab === 'ship') requestAnimationFrame(() => { updateShip(); shipViewer.active = true; shipViewer.resize(); });
  if (activeTab === 'model') requestAnimationFrame(() => viewer.resize());
}));

// ------------------------------------------------------------ BOM
function freightCost() {
  return SHIP ? SHIP.totVol * P.freight : 0;
}
function renderBOM() {
  const b = BOM;
  const freight = freightCost();
  const total = b.subtotal + freight;
  $('#totalChip').textContent = money(total);
  const floorArea = D.info.floorArea;
  let h = `<h2>Bill of materials</h2>
  <p class="muted">Quantities are computed from the 3D model: lumber is cut-optimised from 16' boards, plywood is nested on 4'×8' sheets, and each group carries its own contingency (set in the sidebar). Prices come from the Weno supply shop sign; items marked <span class="badge">est.</span> are not on the sign and are estimates — edit any price and it is saved in this browser.</p>
  <div class="cards">
    <div class="card"><div class="k">Total</div><div class="v">${money(total)}</div><div class="s">${freight ? `incl. ${money(freight)} freight` : 'materials only'}</div></div>
    <div class="card"><div class="k">Per sq ft of floor</div><div class="v">${money(total / floorArea)}</div><div class="s">${num(floorArea)} sq ft</div></div>
    <div class="card"><div class="k">Shipping weight</div><div class="v">${num(SHIP.totLb)} lb</div><div class="s">${num(SHIP.totLb * 0.4536)} kg</div></div>
    <div class="card"><div class="k">Shipping volume</div><div class="v">${num(SHIP.totVol)} ft³</div><div class="s">${num((SHIP.totVol / 1172) * 100)}% of a 20' container</div></div>
  </div>
  <div class="actions">
    <button class="btn" id="csvBtn">Download CSV</button>
    <button class="btn" id="printBtn">Print</button>
    <button class="btn" id="resetPrices">Reset prices to shop sign</button>
  </div>
  <div class="table-wrap"><table class="t"><thead><tr><th>Item</th><th>Used for</th><th class="n">Net</th><th class="n">+ Over</th><th class="n">Buy</th><th class="n">Unit price</th><th class="n">Total</th></tr></thead><tbody>`;
  for (const sec of b.sections) {
    const ls = b.lines.filter((l) => l.section === sec);
    const st = ls.reduce((s, l) => s + l.total, 0);
    h += `<tr class="sec"><td colspan="6">${sec}</td><td class="n">${money(st)}</td></tr>`;
    for (const l of ls) {
      h += `<tr><td>${l.name}${l.est ? '<span class="badge">est.</span>' : ''}${l.note ? `<div class="use">⚠ ${l.note}</div>` : ''}</td>
      <td><span class="use">${l.use}</span></td>
      <td class="n">${num(l.net, l.net % 1 ? 1 : 0)}</td>
      <td class="n">${l.ov}%</td>
      <td class="n"><b>${num(l.buy)}</b> ${l.unit !== 'ea' ? `<span class="use">${l.unit}</span>` : ''}</td>
      <td class="n">$<input class="price" data-key="${l.key}" type="number" step="0.05" min="0" value="${l.price.toFixed(2)}"></td>
      <td class="n">${money(l.total)}</td></tr>`;
    }
  }
  h += `<tr class="tot"><td colspan="6">Materials subtotal</td><td class="n">${money(b.subtotal)}</td></tr>`;
  if (freight) h += `<tr><td colspan="6">Ferry freight: ${num(SHIP.totVol)} ft³ × ${money(P.freight)}</td><td class="n">${money(freight)}</td></tr>`;
  h += `<tr class="tot"><td colspan="6">Total</td><td class="n">${money(total)}</td></tr></tbody></table></div>`;

  // consolidated shopping list
  const shop = shoppingList(b);
  h += `<h3>Shopping list (what to ask for at the counter)</h3><div class="table-wrap"><table class="t"><thead><tr><th>Item</th><th class="n">Qty</th><th class="n">Price</th><th class="n">Total</th></tr></thead><tbody>`;
  for (const s of shop) h += `<tr><td>${s.name}${s.est ? '<span class="badge">est.</span>' : ''}</td><td class="n">${num(s.buy)} ${s.unit !== 'ea' ? s.unit : ''}</td><td class="n">${money(s.price)}</td><td class="n">${money(s.total)}</td></tr>`;
  h += `</tbody></table></div>`;

  h += `<h3>Local materials (gathered on Polowat, not purchased)</h3><div class="table-wrap"><table class="t"><thead><tr><th>Material</th><th class="n">Qty</th></tr></thead><tbody>`;
  for (const l of b.local.filter((x) => x.qty > 0)) h += `<tr><td>${l.name}</td><td class="n">${num(l.qty)} ${l.unit}</td></tr>`;
  h += `</tbody></table></div>`;

  // cut list
  h += `<h3>Cut list</h3><p class="muted">How each 16' (or 18') board is cut. Hatched area is waste. Cuts include a 1/8" saw kerf.</p>`;
  for (const c of b.cuts) {
    const used = c.boards.reduce((s, bd) => s + bd.pieces.reduce((a, p) => a + p.len, 0), 0);
    const eff = (used / (c.boards.length * c.stock)) * 100;
    h += `<h4 style="margin:14px 0 6px">${c.section} — ${c.size} × ${ftin(c.stock)} · ${c.boards.length} boards · ${num(eff)}% yield</h4><div class="cutlist">`;
    c.boards.forEach((bd, i) => {
      h += `<div class="cut-row"><span class="lab">#${i + 1}</span><div class="cut-bar">`;
      bd.pieces.forEach((pc, j) => {
        h += `<div class="${j % 2 ? 's' : ''}" style="width:${(pc.len / c.stock) * 100}%" title="${pc.label}: ${ftin(pc.len)}">${ftin(pc.len)} ${pc.label}</div>`;
      });
      h += `</div></div>`;
    });
    h += `</div>`;
  }
  $('#bomDoc').innerHTML = h;
  $$('#bomDoc input.price').forEach((inp) => inp.addEventListener('change', () => {
    const k = inp.dataset.key;
    prices[k].price = Math.max(0, Number(inp.value) || 0);
    savePrices();
    BOM = computeBOM(D, P, prices);
    renderBOM();
  }));
  $('#csvBtn').addEventListener('click', downloadCSV);
  $('#printBtn').addEventListener('click', () => window.print());
  $('#resetPrices').addEventListener('click', () => {
    prices = structuredClone(DEFAULT_PRICES);
    savePrices();
    BOM = computeBOM(D, P, prices);
    renderBOM();
  });
}

function downloadCSV() {
  const rows = [['Section', 'Item', 'Used for', 'Net', 'Overage %', 'Buy', 'Unit', 'Unit price', 'Total', 'Estimated price']];
  for (const l of BOM.lines) rows.push([l.section, l.name, l.use, l.net.toFixed(2), l.ov, l.buy, l.unit, l.price.toFixed(2), l.total.toFixed(2), l.est ? 'yes' : '']);
  rows.push(['', 'Subtotal', '', '', '', '', '', '', BOM.subtotal.toFixed(2), '']);
  if (freightCost()) rows.push(['', 'Freight', '', '', '', '', '', '', freightCost().toFixed(2), '']);
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `house-${P.width}x${P.depth}-bom.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ------------------------------------------------------------ shipping table
function renderShipTable() {
  const s = SHIP;
  let h = `<h2 style="margin-top:0">Shipping manifest</h2>
  <p class="muted">Everything on the bill of materials, bundled and strapped as it would go on the ferry. Hover the 3D view for item details.</p>
  <div class="cards">
    <div class="card"><div class="k">Weight</div><div class="v">${num(s.totLb)} lb</div><div class="s">${num(s.totLb * 0.4536)} kg</div></div>
    <div class="card"><div class="k">Volume</div><div class="v">${num(s.totVol)} ft³</div><div class="s">${num(s.totVol / 35.31, 1)} m³</div></div>
    <div class="card"><div class="k">Deck space</div><div class="v">${ftin(s.footprint.L)}</div><div class="s">× ${ftin(s.footprint.D)} laid out flat</div></div>
  </div>
  <table class="t"><thead><tr><th>Bundle</th><th>Size (L × W × H)</th><th class="n">ft³</th><th class="n">lb</th></tr></thead><tbody>`;
  for (const b of s.bundles) h += `<tr><td><b>${b.name}</b><div class="use">${b.qty}</div></td><td>${ftin(b.L)} × ${ftin(b.Wd)} × ${ftin(b.H)}</td><td class="n">${num(b.vol, 1)}</td><td class="n">${num(b.lb)}</td></tr>`;
  h += `<tr class="tot"><td colspan="2">Total</td><td class="n">${num(s.totVol, 1)}</td><td class="n">${num(s.totLb)}</td></tr></tbody></table>
  <h3>Packing tips</h3><ul>
  <li>Strap lumber in bundles at 3 points; put the longest boards on the bottom of the stack.</li>
  <li>Tin/PVC sheets nest tightly — keep them flat on lumber dunnage so they don't kink. Put a sheet of plywood on top to protect them.</li>
  <li>Wrap cement bags in a tarp: cement takes on moisture from the sea air and goes hard. Buy it as close to sailing as possible.</li>
  <li>Pack louvre glass on edge in a crate with cardboard between blades. The BOM already adds 10% spare blades.</li>
  <li>Keep nails and hardware in sealed buckets — they double as mixing buckets on site.</li>
  </ul>`;
  $('#shipTable').innerHTML = h;
}

// ------------------------------------------------------------ notes
function renderNotes() {
  const i = D.info;
  const slab = P.floorSlab === 'yes';
  const specs = [
    ['Footprint', `${ftin(D.W)} × ${ftin(D.D)} outside the concrete (${num(i.floorArea)} sq ft inside)`],
    ['Existing concrete', `${inch(P.ponyT)} outline with ${ftin(P.ponyH)} pony walls, ${i.columns} columns ${inch(P.colSize)} × ${inch(P.colSize)}, and a ${inch(P.ringH)} ring beam at ${ftin(P.ringBottom)}`],
    ['Bays between columns', `Long walls: ${i.bayList}. End walls: ${i.endBays}`],
    ['Floor', slab ? `New ${inch(P.floorSlabT)} slab, ${num(i.concreteFt3)} ft³ of concrete` : 'Not included'],
    ['Infill walls', `2x4 @ ${P.studSpacing}" o.c. between the columns, ${PLY[P.wallPly].name} inside, ${P.cladding === 'pvc' ? 'PVC' : 'metal'} corrugated outside`],
    ['Roof', `Gable ${P.pitch}:12 on a 2x6 plate bolted to the ring beam, ${i.rafterSize} rafters @ ${P.rafterSpacing}" o.c., 2x4 purlins`],
    ['Ridge height', `${ftin(i.ridgeHeight)} above grade`],
    ['Doors', `${i.nDoors}, ${inch(P.doorW)} × ${ftin(i.leafH)} (${WALL_KEYS.map((k) => `${k}: ${D.doorGrid[k].map((b, j) => (b.door ? `bay ${j + 1}` : null)).filter(Boolean).join(' & ') || 'none'}`).join('; ')})`],
    ['Windows', `${i.nWin} aluminium louvre windows, ${P.windowW}' × ${P.windowH}', at most ${ftin(P.winSpacing * 12)} apart, sill at ${ftin(i.sill)}`],
    ['Layout diagonal', ftin(i.diag)],
    ['Rainwater', `≈ ${num(i.rainGal)} gal per inch of rain off ${num(i.roofPlanFt2)} sq ft of roof`],
  ];
  const notes = [
    ['Building on the existing frame', 'The concrete outline, pony walls, columns and ring beam are already poured, so they are not in the bill of materials. Everything new is either wood fastened to that concrete or the roof sitting on it.'],
    ['Measure first', 'Concrete is never exactly where the drawing says. Measure every bay between the columns, the ring-beam height and both diagonals, then set the "Existing concrete" inputs so the cut list matches what is on site.'],
    ['Roof tie-down', 'The rafters sit on a 2x6 plate that is wedge-anchored to the ring beam, with a hurricane tie on every rafter. The ring beam and columns carry the roof, so the wood infill walls are not load-bearing.'],
    ['Infill panels', 'Each bay is framed separately and screwed to the concrete all round. Openings need no headers, because the ring beam spans over them.'],
    ['Water and the pony walls', 'The siding laps 1-1/2" down over the pony walls, so rain runs off onto concrete rather than into the wood. Put plastic or bitumen under every plate that touches concrete.'],
    ['Doors in the pony walls', 'The plan assumes a gap was left in the pony wall at each door. If not, the pony wall has to be cut out there, or a step built over it.'],
    ['Windows & doors', `Doors are centred in bays between the columns. Windows fill the remaining bays, no more than ${ftin(P.winSpacing * 12)} apart. With louvres on all sides and open eaves, the house cross-ventilates from any direction.`],
    ['Rainwater catchment', `The roof collects about ${num(i.rainGal)} gallons per inch of rain. Gutters on both eaves feeding a tank are strongly recommended (not in the BOM).`],
    ['Metal vs PVC', 'Galvanised steel is cheaper but rusts in the salt air. PVC "tinroof" costs a little more but never rusts; pre-drill oversized holes for thermal movement.'],
  ];
  let h = `<h2>Design notes</h2>`;
  if (D.warnings.length) h += `<div class="warnings" style="position:static;max-width:none;margin-bottom:12px">${D.warnings.map((w) => `<div>⚠ ${w}</div>`).join('')}</div>`;
  h += `<h3>Key specifications</h3><div class="table-wrap"><table class="t"><tbody>${specs.map(([k, v]) => `<tr><td style="width:200px"><b>${k}</b></td><td>${v}</td></tr>`).join('')}</tbody></table></div>`;
  h += `<h3>Design choices &amp; improvements</h3><div class="note-grid">${notes.map(([t, p]) => `<div class="note"><h4>${t}</h4><p>${p}</p></div>`).join('')}</div>`;
  h += `<h3>Assumptions to verify</h3><ul>
    <li>Lumber is assumed to be dressed to standard sizes (2x6 = 1-1/2" × 5-1/2"). If the shop sells rough-sawn full-size lumber, the design still works and is stronger.</li>
    <li>The cement price was taped over on the shop sign; ${money(prices.cement.price)} per 40 kg bag is a placeholder. Prices marked <span class="badge">est.</span> are not on the sign.</li>
    <li>Louvre frames are assumed to be sold by height (3' or 4') and glass blades by length (3' or 4' — this sets the window width). About one blade per 3-1/2" of frame height.</li>
    <li>Corrugated sheets are assumed to be 33" wide with ${inch(P.tinCover)} of cover. Measure a sheet in the shop and adjust under “Sheet materials”.</li>
    <li>Floor concrete is a 1 : 2 : 3 mix, which gives about 3.7 ft³ per 40 kg bag. Rebar, tie wire, plastic, wedge anchors and concrete screws are not on the shop sign, so their prices are estimates. You will also need a hammer drill and masonry bits.</li>
    <li>This is a planning tool, not a stamped engineering design. Have someone experienced with local typhoon construction review it.</li>
  </ul>`;
  $('#notesDoc').innerHTML = h;
}

// ------------------------------------------------------------ go
buildAdvanced();
syncControls();
regenerate();
viewer.fit();

// expose for debugging
window.__house = { P, get D() { return D; }, get BOM() { return BOM; }, viewer, setStep };
