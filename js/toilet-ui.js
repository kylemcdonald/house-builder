// The Toilet House tab: its sidebar, 3D model with construction playback,
// waste-system write-up, shipping layout, bill of materials and design notes.
import { toiletDesign, TDEFAULTS, TSTEP } from './toilet.js';
import { computeToiletBOM } from './bom.js';
import { shippingLayout } from './shipping.js';
import { Viewer } from './viewer.js';
import { buildFields, syncFields } from './fields.js';
import { renderBomDoc, renderShipDoc, bomTotal } from './bomview.js';
import { ftin, inch, money, num } from './format.js';
import { renderToiletGuide } from './guide-toilet.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const ft = (v) => ftin(v * 12);
const GROUPS = [
  {
    title: 'Size & style', open: true, fields: [
      { k: 'width', label: 'Width', min: 3.5, max: 8, step: 0.5, fmt: ft },
      { k: 'depth', label: 'Depth', min: 4, max: 9, step: 0.5, fmt: ft },
      { k: 'cladding', label: 'Roof & outer walls', type: 'select', str: true, opts: [['metal', 'Metal tinroof'], ['pvc', 'PVC tinroof']] },
    ],
  },
  {
    title: 'Waste system', open: true, fields: [
      { k: 'waste', label: 'Where the waste goes', type: 'select', str: true, opts: [['outfall', 'Seawater flush → outfall'], ['pit', 'Pit behind the toilet']] },
      { k: 'pipeD', label: 'Drain pipe', type: 'select', opts: [[3, '3" PVC'], [4, '4" PVC']], hint: '3" moves waste further per flush; 4" is harder to block' },
      { k: 'shore', label: 'Back wall to the water\'s edge', min: 5, max: 100, step: 1, fmt: (v) => `${v} ft` },
      { k: 'outfall', label: 'Outfall beyond the water\'s edge', min: 20, max: 300, step: 5, fmt: (v) => `${v} ft`, when: (P) => P.waste === 'outfall' },
      { k: 'users', label: 'People using it', min: 1, max: 20, step: 1, fmt: (v) => `${v}` },
      { k: 'flushGal', label: 'Seawater per flush', min: 0.5, max: 3, step: 0.25, fmt: (v) => `${v} gal` },
      { k: 'pitDepth', label: 'Pit depth', min: 24, max: 96, step: 6, fmt: ftin, when: (P) => P.waste === 'pit' },
      { k: 'waterTable', label: 'Groundwater below the surface', min: 12, max: 96, step: 6, fmt: ftin, hint: 'Dig a test hole at high tide to find it' },
    ],
  },
  {
    title: 'Vents & door', open: false, fields: [
      { k: 'ventBottom', label: 'Vent sill above the floor', min: 54, max: 90, step: 1, fmt: ftin, hint: 'Above eye level, so nobody can see in' },
      { k: 'ventH', label: 'Vent height', min: 4, max: 16, step: 1, fmt: inch },
      { k: 'doorW', label: 'Door width', min: 24, max: 36, step: 1, fmt: inch },
      { k: 'doorH', label: 'Door height', min: 72, max: 84, step: 1, fmt: ftin },
    ],
  },
  {
    title: 'Slab & block wall', open: false, fields: [
      { k: 'floorAbove', label: 'Floor above the ground', min: 4, max: 24, step: 1, fmt: inch },
      { k: 'slabT', label: 'Slab thickness', min: 3, max: 6, step: 0.5, fmt: inch },
      { k: 'apron', label: 'Step in front of the door', min: 0, max: 36, step: 1, fmt: inch },
      { k: 'blockT', label: 'Block thickness (nominal)', type: 'select', opts: [[4, '4"'], [6, '6"'], [8, '8"']] },
      { k: 'courses', label: 'Courses of block', min: 1, max: 6, step: 1, fmt: (v) => `${v} (${ftin(v * 8)})` },
      { k: 'meshFrom', label: 'Wire mesh', type: 'select', str: true, opts: [['house', 'Offcut from the house roll'], ['buy', 'Buy a roll']] },
    ],
  },
  {
    title: 'Roof & framing', open: false, fields: [
      { k: 'lowH', label: 'Back (low) wall height', min: 72, max: 108, step: 1, fmt: ftin },
      { k: 'pitch', label: 'Roof pitch', min: 2, max: 6, step: 0.5, fmt: (v) => `${v}:12` },
      { k: 'eave', label: 'Eave overhang (front & back)', min: 0, max: 30, step: 1, fmt: inch },
      { k: 'rake', label: 'Side overhang', min: 0, max: 24, step: 1, fmt: inch },
      { k: 'studSpacing', label: 'Stud & rafter spacing', type: 'select', opts: [[16, '16" o.c.'], [24, '24" o.c.']] },
      { k: 'purlinSpacing', label: 'Max purlin spacing', min: 16, max: 32, step: 1, fmt: inch },
      { k: 'tinCover', label: 'Corrugated sheet cover width', min: 24, max: 40, step: 1, fmt: inch },
    ],
  },
  {
    title: 'Overage / contingency', open: false, fields: [
      { k: 'ovTin', label: 'Roofing & siding', type: 'pct' },
      { k: 'ovFraming', label: 'Framing lumber', type: 'pct' },
      { k: 'ovBlock', label: 'Blocks & rebar', type: 'pct' },
      { k: 'ovCement', label: 'Cement', type: 'pct' },
      { k: 'ovPlumbing', label: 'Pipe & couplings', type: 'pct' },
      { k: 'ovFasteners', label: 'Nails, fasteners & hardware', type: 'pct' },
    ],
  },
  {
    title: 'Tax & shipping', open: false, fields: [
      { k: 'tax', label: 'Sales tax', type: 'pct' },
      { k: 'freight', label: 'Ferry freight rate ($ per ft³)', type: 'num', step: 0.25 },
    ],
  },
];

// opts: { P, prices, sub, getMode, onChange, onSub, onPrices, onResetPrices, houseMeshSpare }
export function createToiletUI(o) {
  const P = o.P;
  let D = null;
  let BOM = null;
  let SHIP = null;
  let viewer = null;
  let shipViewer = null;
  let shipDirty = true;
  let step = TSTEP.DONE;
  let sub = 'model';
  let active = false;
  let pending = false;
  let playTimer = null;
  let guideDirty = true;

  buildFields($('#toiletFields'), GROUPS, { P, prefix: 't', onInput: () => schedule() });
  $('#tResetBtn').addEventListener('click', () => { Object.assign(P, TDEFAULTS); schedule(); if (viewer) viewer.fitted = false; });

  function schedule() {
    syncFields(GROUPS, P, 't');
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; regenerate(); });
  }

  function computeBOM() {
    BOM = computeToiletBOM(D, P, o.prices, { houseMeshSpareFt: o.houseMeshSpare() });
    SHIP = shippingLayout(BOM, P);
    shipDirty = true;
    updateShip();
  }

  function regenerate() {
    D = toiletDesign(P);
    computeBOM();
    if (viewer) showModel();
    renderAll();
    o.onChange();
  }

  // the step-by-step guide is only rebuilt while it is on screen (or if its
  // 3D pictures were interrupted by leaving the tab)
  function updateGuide() {
    if (!D || !BOM || !active || sub !== 'guide') return;
    if (!guideDirty && $('#tGuideDoc').dataset.shots === 'done') return;
    guideDirty = false;
    renderToiletGuide($('#tGuideDoc'), { d: D, P, bom: BOM });
  }

  function renderAll() {
    guideDirty = true;
    updateGuide();
    updateStepUI();
    renderBOM();
    renderWaste();
    renderNotes();
    $('#tWarnings').innerHTML = D.warnings.map((w) => `<div>⚠ ${w}</div>`).join('');
  }

  function showModel() {
    viewer.setModel({ parts: D.parts, bounds: D.bounds, dims: D.dims });
    viewer.setStep(step, TSTEP.DONE);
    viewer.setDims($('#tDimsChk').checked);
  }

  // the shipping layout is only rebuilt while it is on screen
  function updateShip() {
    if (!SHIP || !active || sub !== 'ship') return;
    if (!shipViewer) {
      shipViewer = new Viewer($('#tShipViewport'));
      shipViewer.setMode(o.getMode());
    }
    if (shipDirty) {
      shipViewer.setModel({ parts: SHIP.parts, bounds: SHIP.bounds, labels: SHIP.labels }, { fit: true, dir: [0.25, 1.3, 0.9] });
      shipViewer.setStep(Infinity, Infinity);
      renderShipDoc($('#tShipTable'), SHIP);
      shipDirty = false;
    }
    shipViewer.active = true;
    shipViewer.resize();
  }

  // ---------------------------------------------------------------- 3D view & playback
  function ensureViewer() {
    if (viewer) return;
    viewer = new Viewer($('#tViewport'));
    viewer.setMode(o.getMode());
    showModel();
    viewer.fit();
  }
  const slider = $('#tStepSlider');
  slider.max = TSTEP.DONE;
  slider.value = step;
  function setStep(s) {
    step = Math.max(0, Math.min(TSTEP.DONE, s));
    slider.value = step;
    if (viewer) viewer.setStep(step, TSTEP.DONE);
    updateStepUI();
  }
  function updateStepUI() {
    if (!D) return;
    const st = D.steps[step];
    $('#tStepNum').textContent = step === TSTEP.DONE ? 'Complete' : step === 0 ? 'Start' : `Step ${step} of ${TSTEP.DONE - 1}`;
    $('#tStepTitle').textContent = st.title;
    $('#tStepText').textContent = st.text;
  }
  function play() {
    if (playTimer) return stop();
    if (step >= TSTEP.DONE) setStep(0);
    $('#tPlayBtn').textContent = '❚❚';
    playTimer = setInterval(() => (step >= TSTEP.DONE ? stop() : setStep(step + 1)), 2600);
  }
  function stop() {
    clearInterval(playTimer);
    playTimer = null;
    $('#tPlayBtn').textContent = '▶';
  }
  slider.addEventListener('input', () => { stop(); setStep(Number(slider.value)); });
  $('#tPlayBtn').addEventListener('click', play);
  $('#tPrevStep').addEventListener('click', () => { stop(); setStep(step - 1); });
  $('#tNextStep').addEventListener('click', () => { stop(); setStep(step + 1); });
  {
    const ticks = $('#tStepTicks');
    const labels = { [TSTEP.DRAIN]: 'Drain', [TSTEP.SLAB]: 'Slab', [TSTEP.BLOCKS]: 'Blocks', [TSTEP.FRAME]: 'Walls', [TSTEP.ROOF_FRAME]: 'Roof', [TSTEP.SIDING]: 'Siding', [TSTEP.TOILET]: 'Toilet', [TSTEP.WASTE]: 'Waste' };
    for (const [k, v] of Object.entries(labels)) {
      const sp = document.createElement('span');
      sp.textContent = v;
      sp.dataset.k = k;
      ticks.appendChild(sp);
    }
    new ResizeObserver(() => {
      const r = slider.getBoundingClientRect();
      const pr = slider.parentElement.getBoundingClientRect();
      ticks.querySelectorAll('span').forEach((sp) => {
        sp.style.left = r.left - pr.left + 8 + ((r.width - 16) * Number(sp.dataset.k)) / TSTEP.DONE + 'px';
      });
    }).observe(slider);
  }
  $('#tExplode').addEventListener('input', (e) => viewer && viewer.setExplode(Number(e.target.value)));
  $('#tDimsChk').addEventListener('change', (e) => viewer && viewer.setDims(e.target.checked));
  $$('#tViews button').forEach((bt) => bt.addEventListener('click', () => {
    if (!viewer) return;
    if (bt.dataset.view === 'site') viewer.fit(D.siteBounds);
    else if (bt.dataset.view === 'fit') viewer.fit();
    else viewer.view(bt.dataset.view);
  }));

  // ---------------------------------------------------------------- sub-tabs
  function showSub(s) {
    sub = $(`#toiletTabs button[data-sub="${s}"]`) ? s : 'model';
    $$('#toiletTabs button').forEach((x) => x.classList.toggle('on', x.dataset.sub === sub));
    $$('#pane-toilet .tpane').forEach((p) => p.classList.toggle('active', p.id === 'tpane-' + sub));
    if (viewer) viewer.active = active && sub === 'model';
    if (shipViewer) shipViewer.active = active && sub === 'ship';
    if (sub === 'model' && active) requestAnimationFrame(() => { ensureViewer(); viewer.active = true; viewer.resize(); });
    if (sub === 'guide') requestAnimationFrame(updateGuide);
    if (sub === 'ship') requestAnimationFrame(updateShip);
  }
  showSub(o.sub);
  $$('#toiletTabs button').forEach((bt) => bt.addEventListener('click', () => { showSub(bt.dataset.sub); o.onSub(sub); }));

  // ---------------------------------------------------------------- pages
  function renderBOM() {
    renderBomDoc($('#tBomDoc'), {
      bom: BOM, P, ship: SHIP, prices: o.prices, area: D.info.innerArea, areaLabel: 'inside', shipTable: true,
      csvName: `toilet-house-${P.width}x${P.depth}-bom.csv`, onPrices: o.onPrices, onResetPrices: o.onResetPrices,
    });
  }

  // cost of the other waste option, for the comparison
  function altTotal(waste) {
    const P2 = { ...P, waste };
    const d2 = toiletDesign(P2);
    const b2 = computeToiletBOM(d2, P2, o.prices, { houseMeshSpareFt: o.houseMeshSpare() });
    return bomTotal(b2, P2, shippingLayout(b2, P2));
  }

  function renderWaste() {
    const i = D.info;
    const pit = P.waste === 'pit';
    const outT = pit ? altTotal('outfall') : bomTotal(BOM, P, SHIP);
    const pitT = pit ? bomTotal(BOM, P, SHIP) : altTotal('pit');
    const pipeGal = i.pipeGalPerFt * i.floodedFt;
    const days = pipeGal / Math.max(1, i.flushPerDay);
    const ftPerFlush = P.flushGal / i.pipeGalPerFt;
    const wet = P.pitDepth - P.waterTable;
    let h = `<h2>Handling the waste</h2>
    <p class="lede">Short answer: <b>yes, a seawater-flushed toilet with a pipe out into the lagoon works</b>, and on this site it is a better choice than a hole in the ground. It also takes the waste further from where people walk and swim than going straight off the shore does. The design below is the outfall. The same building also works with a pit (switch it under “Waste system”), and the comparison further down says why the pit is the weaker choice here.</p>
    ${schematic(D, P)}
    <h3>How the outfall works</h3>
    <ol>
      <li><b>Flush with seawater.</b> A seat-height <i>pour-flush</i> bowl has a water-seal trap built in and no tank. You flush by pouring a bucket of about ${P.flushGal} gal into the bowl quickly. Toilet tanks and their valves corrode in seawater; a bucket can't break. A 55-gal drum by the door holds the day's water.</li>
      <li><b>Drain and vent.</b> A ${P.pipeD}" drain leaves the bowl under the slab. A 2" vent goes up behind the bowl and through the roof. Without it, each flush and every wave surge pulls the water out of the trap, and you get smell and cockroaches. A wye with a screw plug just outside the back wall gives you a way to rod out the pipe.</li>
      <li><b>Down the beach.</b> The pipe falls ${inch(0.25)} per foot and is buried about a foot down: sun makes PVC brittle, and people walk over it. At the water's edge it is about ${inch(i.drainDropAtShore)} below the toilet floor.</li>
      <li><b>Out along the bottom.</b> ${P.outfall} ft of pipe lies on the lagoon floor, held down by a concrete collar every 10 ft (cast in a bucket around the pipe). A flap valve on the end stops waves, sand and crabs from pushing up into it.</li>
    </ol>
    <h3>The numbers for ${P.users} people</h3>
    <div class="cards">
      <div class="card"><div class="k">Flush water</div><div class="v">${num(i.flushPerDay)} gal/day</div><div class="s">${num(i.flushPerDay * 8.5)} lb carried, or pumped</div></div>
      <div class="card"><div class="k">Water in the pipe</div><div class="v">${num(pipeGal)} gal</div><div class="s">${num(i.floodedFt)} ft below sea level, always full</div></div>
      <div class="card"><div class="k">Each flush moves it</div><div class="v">${num(ftPerFlush, 1)} ft</div><div class="s">along the flooded pipe</div></div>
      <div class="card"><div class="k">Waste reaches the end</div><div class="v">${days < 1 ? 'same day' : `~${num(days, 1)} days`}</div><div class="s">at ${num(i.flushPerDay)} gal/day</div></div>
    </div>
    <p>One thing that surprises people: the part of the pipe that is under the sea is <b>always full of seawater</b>, so a flush doesn't shoot anything ${P.outfall} ft out. It pushes the whole column of water along by about ${num(ftPerFlush, 1)} ft, and the same amount comes out of the far end. With ${P.users} people the pipe's contents are replaced about ${days < 1 ? `${num(1 / days, 1)} times a day` : `every ${num(days, 1)} days`}. Waste breaks down on the way, and what comes out is mostly liquid. ${P.pipeD === 4 ? 'A 3" pipe holds about half as much water, so waste moves twice as far per flush.' : 'This is why the default is a 3" pipe: a 4" one holds about twice as much water, so waste moves half as far per flush.'}</p>
    <h3>What makes or breaks it</h3>
    <ul>
      <li><b>Floor height above the tide.</b> At high tide, the sea fills the pipe up to sea level. The bowl's trap has to stay well above the highest tide plus storm surge and wave run-up, or the sea comes up into the bowl. Allow at least 2–3 ft above the highest tide you have seen. If the site is low, raise “Floor above the ground”.</li>
      <li><b>Where the outlet goes.</b> Put it in water that is still a few feet deep at the lowest spring tide and that moves: a channel or the edge of the reef flat, not a still corner. It should be down-current from where people swim, wash, fish and collect shellfish. Check where the current goes on an ebbing tide by dropping a coconut or some dye off the end. ${P.outfall} ft may not be far enough over a shallow reef flat; the length is adjustable.</li>
      <li><b>Waves.</b> Exposed PVC in the surf zone gets broken in storms. Bury it through the beach and the first part of the water. Where the bottom is hard reef, lay it in a chiselled groove or pin each collar with a short piece of rebar driven into the reef. Check it after every storm.</li>
      <li><b>Only toilet paper and water.</b> No wipes, pads, plastic or rags: in a long flooded pipe they catch and block it. Keep a lidded bin in the toilet.</li>
      <li><b>Ask first.</b> The reef and lagoon in front of a piece of land often belong to a family or clan, and neighbours fish there. Talk to them, the municipality and Chuuk State EPA before you lay the pipe.</li>
    </ul>
    <h3>Outfall vs. pit vs. what happens now</h3>
    <div class="table-wrap"><table class="t cmp"><thead><tr><th></th><th>Seawater outfall</th><th>Pit (“a big hole”)</th><th>Shore, as now</th></tr></thead><tbody>
      <tr><td><b>Cost with this building</b></td><td>${money(outT)}</td><td>${money(pitT)}</td><td>—</td></tr>
      <tr><td><b>Where the waste ends up</b></td><td>${P.outfall} ft out, in moving water</td><td>In the groundwater under the site, which seeps into the lagoon a few feet away</td><td>At the water's edge, where people walk and children play</td></tr>
      <tr><td><b>Groundwater & wells</b></td><td>Not touched: the pipe is sealed</td><td>${wet > 0 ? `The bottom ${inch(wet)} sits in tidal groundwater, so the pit is directly connected to it` : 'Above the groundwater only if the water table really is that deep'}. Keep any pit 100 ft or more from wells.</td><td>Not touched</td></tr>
      <tr><td><b>Smell & flies</b></td><td>Low: water seal and vent</td><td>Higher: a wet pit near the surface</td><td>High</td></tr>
      <tr><td><b>Lifetime</b></td><td>Until a storm breaks the pipe; rod it out now and then</td><td>Fills in about ${num(pit ? i.fillYears : (36 * 48 * Math.max(0, P.pitDepth - 18)) / 1728 / (P.users * 1.41), 1)} years for ${P.users} people, then needs emptying or a new pit</td><td>—</td></tr>
      <tr><td><b>Daily work</b></td><td>Fill the drum: ${num(i.flushPerDay)} gal/day</td><td>Less water (it can be dry, or a small pour)</td><td>None</td></tr>
    </tbody></table></div>
    <p>A hole near the water on an atoll is the weak option. The ground is coral sand, and groundwater is only a few feet down and rises and falls with the tide. Within a few dozen feet of the shore it is basically seawater. So the pit becomes a wet hole that leaches untreated waste straight into the same water the outfall would reach, but right at the shore and without any dilution. It also threatens the freshwater lens that wells draw from, smells, and fills up. ${wet > 0 ? `With the pit ${ftin(P.pitDepth)} deep and groundwater at ${ftin(P.waterTable)}, the model shows it standing in water.` : ''}</p>
    <h3>Worth considering</h3>
    <ul>
      <li><b>A settling tank before the outfall.</b> A sealed 200–300 gal plastic tank between the cleanout and the beach holds back the solids, so only liquid goes out the pipe. The outfall then hardly ever blocks and the discharge is cleaner. Have the tank pumped or emptied every few years. This is the single best upgrade.</li>
      <li><b>Pumping the flush water.</b> Carrying ${num(i.flushPerDay)} gal a day is real work. A hand pitcher pump on a pipe into the water, or a small 12 V pump on one of the shop's 100 W solar panels filling a drum on a stand, does it for you. A drum on a stand can then feed a tap over the bowl.</li>
      <li><b>A composting toilet.</b> No water and no pipe; the waste becomes compost. This is the safest option for the groundwater and is promoted on other atolls, but it needs daily care (a scoop of dry leaves or coconut husk after each use) and a raised, two-chamber vault under the seat.</li>
    </ul>`;
    $('#tWasteDoc').innerHTML = h;
  }

  function renderNotes() {
    const i = D.info;
    const specs = [
      ['Footprint', `${ftin(D.W)} × ${ftin(D.D)} outside the block (${inch(i.innerW)} × ${inch(i.innerD)} clear inside, ${num(i.innerArea, 1)} sq ft)`],
      ['Slab', `${inch(P.slabT)} concrete with 6" × 6" #10 wire mesh, top ${inch(P.floorAbove)} above the ground, with a ${inch(P.apron)} step in front of the door`],
      ['Pony wall', `${P.courses} course${P.courses > 1 ? 's' : ''} of ${P.blockT}" hollow block (${ftin(P.courses * 8)}), ${i.cells} cells grouted with #4 dowels hooked into the slab`],
      ['Walls', `2x4 @ ${P.studSpacing}" o.c. on a bolted bottom plate; back wall ${ftin(i.lowH)}, front wall ${ftin(i.Hf)}; ${P.cladding === 'pvc' ? 'PVC' : 'metal'} corrugated outside`],
      ['Roof', `Single slope ${P.pitch}:12, falling toward the water; ${i.rafterSize} rafters @ ${P.studSpacing}" with hurricane ties at both ends, 2x4 purlins; ${num(i.roofArea)} sq ft of roof`],
      ['Vents', `Screened band on both side walls, ${inch(P.ventH)} high with the sill at ${ftin(i.vb)} above the floor`],
      ['Door', `${inch(P.doorW)} × ${ftin(i.leafH)} board door, opening outward, barrel bolt inside`],
      ['Toilet', `Pour-flush bowl ${inch(i.tx - (P.blockT - 0.375))} from the left wall to its centre, 2" vent through the roof`],
      ['Waste', P.waste === 'pit' ? `Block-lined pit ${ftin(P.pitDepth)} deep, about ${num(i.fillYears, 1)} years for ${P.users} people` : `${P.pipeD}" drain, ${Math.round(i.landRun / 12)} ft buried and ${Math.round(i.seaRun / 12)} ft along the lagoon floor`],
    ];
    const notes = [
      ['Roof falls toward the water', 'The single-slope roof is high over the door and low at the back. Rain runs off behind the toilet, toward the sea, and not onto whoever is at the door. The high front wall also leaves room for a full-height door and its header.'],
      ['Vents above eye level', `The vent band runs the whole length of both side walls, from ${ftin(i.vb)} to ${ftin(i.vt)} above the floor: too high to see in, low enough to sit under the roof. Wind blows across from one side to the other. The side overhang and the roof above keep most rain out.`],
      ['Insect-proof', 'The vents are covered with fiberglass screen, which doesn\'t rust. The eaves are closed with frieze blocks, and the corrugations over the eave purlins are filled with expanding foam. The vent pipe has a screened cap. That leaves the gaps around the door as the only way in, so keep it shut.'],
      ['Holding it down', 'Typhoon uplift goes from the roof through hurricane ties at both ends of every rafter, then through the studs to a bottom plate bolted into grouted block cells. Each of those cells has a #4 dowel hooked into the slab. The blocks alone are only held by mortar, and the dowels are what stop the wall lifting off the slab.'],
      ['Door opens out', 'In a room this small a door that opens in hits the bowl. Opening out also means wind presses it shut, and someone who falls inside can still be reached.'],
      ['Water off the wood', 'The siding laps 1-1/2" down over the top of the block, so rain runs onto concrete rather than into the bottom plate. Put a strip of plastic under the plate.'],
    ];
    let h = `<h2>Design notes</h2>`;
    if (D.warnings.length) h += `<div class="warnings" style="position:static;max-width:none;margin-bottom:12px">${D.warnings.map((w) => `<div>⚠ ${w}</div>`).join('')}</div>`;
    h += `<h3>Key specifications</h3><div class="table-wrap"><table class="t"><tbody>${specs.map(([k, v]) => `<tr><td style="width:160px"><b>${k}</b></td><td>${v}</td></tr>`).join('')}</tbody></table></div>`;
    h += `<h3>Design choices</h3><div class="note-grid">${notes.map(([t, p]) => `<div class="note"><h4>${t}</h4><p>${p}</p></div>`).join('')}</div>`;
    h += `<h3>Assumptions to verify</h3><ul>
      <li>The “cement hollow block” on the shop's sign ($5.50) is assumed to be ${P.blockT}" × 8" × 16". Measure one and set the block thickness.</li>
      <li>Rebar and expanding foam are priced from the written quote. PVC pipe and fittings, the toilet bowl, screen, the drum and the bolts are not on the quote or the sign: their prices are estimates. Ask the shop for 3" and 4" PVC, and check whether pipe comes in 10' or 20' lengths.</li>
      <li>The wire mesh comes from what is left on the house's 100 ft roll, if there is enough. If the house isn't built first, switch “Wire mesh” to buy a roll ($300 for a few feet is a lot, so a scrap from someone else's job is worth asking for).</li>
      <li>Tide levels, depth and current at the outlet, and the groundwater depth all have to be checked on site. Watch the water for a full spring-tide cycle before choosing where the outlet goes.</li>
      <li>This is a planning tool, not a stamped engineering design or an environmental approval.</li>
    </ul>`;
    $('#tNotesDoc').innerHTML = h;
  }

  return {
    P,
    regenerate,
    refreshBOM() { if (!D) return; computeBOM(); renderBOM(); renderWaste(); o.onChange(); },
    sync() { syncFields(GROUPS, P, 't'); },
    setMode(m) { if (viewer) viewer.setMode(m); if (shipViewer) shipViewer.setMode(m); },
    setActive(on) {
      active = on;
      if (on) {
        if (sub === 'model') {
          requestAnimationFrame(() => { ensureViewer(); viewer.active = true; viewer.resize(); });
        }
        if (sub === 'guide') requestAnimationFrame(updateGuide);
        if (sub === 'ship') requestAnimationFrame(updateShip);
      } else {
        if (viewer) viewer.active = false;
        if (shipViewer) shipViewer.active = false;
      }
    },
    total() { return D ? bomTotal(BOM, P, SHIP) : 0; },
    subtitle() { return D ? `${ftin(D.W)} × ${ftin(D.D)} toilet house · ${P.waste === 'pit' ? 'pit' : `${P.outfall} ft seawater outfall`}` : ''; },
    onKey(e) {
      if (sub !== 'model') return;
      if (e.key === 'ArrowRight') { stop(); setStep(step + 1); }
      if (e.key === 'ArrowLeft') { stop(); setStep(step - 1); }
      if (e.key === ' ') { e.preventDefault(); play(); }
    },
    get D() { return D; }, get BOM() { return BOM; }, get SHIP() { return SHIP; }, get viewer() { return viewer; }, setStep,
  };
}

// Side-on cross-section of the drain from the toilet to the outlet, not to scale.
function schematic(D, P) {
  const pit = P.waste === 'pit';
  const W = 760;
  const H = 230;
  const gy = 120; // ground level at the toilet
  const shoreX = 330;
  const hi = 150; // high tide
  const lo = 172; // low tide
  const outX = 700;
  const tox = 120; // toilet
  const pipe = pit
    ? `M${tox} ${gy - 4} L${tox} ${gy + 10} L${tox + 120} ${gy + 16}`
    : `M${tox} ${gy - 4} L${tox} ${gy + 10} L${shoreX} ${gy + 30} L${shoreX + 40} ${200} L${outX} ${200}`;
  const seabed = `M${shoreX - 40} ${gy + 6} Q${shoreX + 20} ${gy + 30} ${shoreX + 60} 206 L${W} 210`;
  return `<figure class="schem"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Cross-section of the toilet drain">
    <path d="M0 ${gy} L${shoreX - 40} ${gy + 6}" class="s-ground"/>
    <path d="${seabed}" class="s-ground"/>
    <path d="M${shoreX - 10} ${hi} L${W} ${hi}" class="s-tide"/>
    <path d="M${shoreX + 30} ${lo} L${W} ${lo}" class="s-tide lo"/>
    <rect x="${shoreX + 10}" y="${hi}" width="${W - shoreX - 10}" height="${H - hi}" class="s-water"/>
    <text x="${W - 8}" y="${hi - 5}" text-anchor="end" class="s-lab">high tide</text>
    <text x="${W - 8}" y="${lo - 5}" text-anchor="end" class="s-lab">low tide</text>
    <rect x="${tox - 40}" y="${gy - 70}" width="80" height="66" class="s-house"/>
    <path d="M${tox - 52} ${gy - 66} L${tox + 52} ${gy - 82}" class="s-roof"/>
    <rect x="${tox - 9}" y="${gy - 16}" width="18" height="12" rx="3" class="s-bowl"/>
    <path d="M${tox - 30} ${gy - 4} L${tox - 30} ${gy - 96}" class="s-vent"/>
    <path d="${pipe}" class="s-pipe"/>
    ${pit ? `<rect x="${tox + 112}" y="${gy + 2}" width="56" height="48" class="s-pit"/><rect x="${tox + 113}" y="${gy + 30}" width="54" height="19" class="s-water"/><text x="${tox + 140}" y="${gy + 66}" text-anchor="middle" class="s-lab">pit in the groundwater</text>`
      : `<rect x="${outX}" y="194" width="10" height="12" class="s-valve"/><text x="${outX - 4}" y="224" text-anchor="end" class="s-lab">${P.outfall} ft out · flap valve</text>
    <text x="${shoreX + 90}" y="192" class="s-lab">pipe always full of seawater out here</text>
    <text x="${(tox + shoreX) / 2}" y="${gy + 42}" text-anchor="middle" class="s-lab">buried ~1 ft, falls 1/4" per ft</text>`}
    <text x="${tox}" y="${gy - 90}" text-anchor="middle" class="s-lab">vent</text>
    <text x="${tox + 46}" y="${gy - 8}" class="s-lab">floor well above the highest tide</text>
  </svg><figcaption>Not to scale. The water is behind the toilet; the roof falls toward it.</figcaption></figure>`;
}
