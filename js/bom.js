// Bill of materials: cut optimisation for lumber, sheet packing for plywood,
// overage contingency per material group, pricing and weights.
import { LUMBER, PLY, LUMBER_DENSITY, TIN_LB, CEMENT_LB, MESH, BLOCK, BAG_YIELD_FT3, MORTAR_FT3_PER_BAG } from './catalog.js';
import { ftin, inch } from './format.js';
import { houseTools, TOOL_LB } from './tools.js';

const KERF = 0.125;

// First-fit-decreasing cut optimisation. Returns boards with their pieces.
export function cutBoards(pieces, stock) {
  const sorted = [...pieces].sort((a, b) => b.len - a.len);
  const boards = [];
  for (const pc of sorted) {
    const len = Math.min(pc.len, stock);
    let best = null;
    for (const bd of boards) {
      const need = len + (bd.pieces.length ? KERF : 0);
      if (bd.left >= need - 1e-6 && (!best || bd.left < best.left)) best = bd;
    }
    if (!best) {
      best = { pieces: [], left: stock };
      boards.push(best);
    }
    best.left -= len + (best.pieces.length ? KERF : 0);
    best.pieces.push({ len, label: pc.label });
  }
  return boards;
}

// Cut corrugated-sheet pieces from the stock lengths on offer
// (stocks = [{len, cost}]) at the lowest cost.
export function packTin(pieces, stocks) {
  const st = [...stocks].sort((a, b) => a.len - b.len);
  const maxLen = st[st.length - 1].len;
  const sorted = [...pieces].sort((a, b) => b.len - a.len);
  let best = null;
  for (const strat of ['small', 'big', 'smart']) {
    const bins = [];
    sorted.forEach((p, idx) => {
      let bin = null;
      for (const b of bins) if (b.left >= p.len - 1e-6 && (!bin || b.left < bin.left)) bin = b;
      if (!bin) {
        const fit = st.filter((s) => s.len >= p.len - 1e-6);
        let stock = fit.length ? fit[0].len : Math.ceil(p.len / 12) * 12;
        if (strat === 'big') stock = Math.max(stock, maxLen);
        if (strat === 'smart' && fit.length > 1) {
          // take a longer sheet when its offcut would be used by a later piece
          const rest = sorted.slice(idx + 1);
          const fits = (cap) => rest.some((r) => r.len <= cap - p.len);
          if (!fits(fit[0].len)) stock = (fit.find((s) => fits(s.len)) || fit[0]).len;
        }
        bin = { stock, left: stock, pieces: [] };
        bins.push(bin);
      }
      bin.left -= p.len;
      bin.pieces.push(p);
    });
    // then swap each sheet for the cheapest stock that still holds its pieces
    let cost = 0;
    for (const b of bins) {
      const used = b.stock - b.left;
      const opts = st.filter((s) => s.len >= used - 1e-6).sort((x, y) => x.cost - y.cost || x.len - y.len);
      if (opts.length) {
        b.left = opts[0].len - used;
        b.stock = opts[0].len;
        cost += opts[0].cost;
      } else cost += st[st.length - 1].cost * Math.ceil(b.stock / maxLen);
    }
    if (!best || cost < best.cost - 1e-6) best = { bins, cost };
  }
  return best;
}

// Guillotine packing of rectangles into 48"x96" sheets. Returns sheet count.
export function packSheets(pieces, SW = 48, SH = 96) {
  const items = pieces
    .map((p) => (p.w > SW ? { w: p.h, h: p.w } : { ...p }))
    .map((p) => ({ w: Math.min(p.w, SW), h: Math.min(p.h, SH) }))
    .sort((a, b) => b.w * b.h - a.w * a.h);
  const sheets = [];
  const place = (free, p) => {
    for (let i = 0; i < free.length; i++) {
      const f = free[i];
      for (const [w, h] of [[p.w, p.h], [p.h, p.w]]) {
        if (w <= f.w + 1e-6 && h <= f.h + 1e-6) {
          free.splice(i, 1);
          if (f.w - w > 1) free.push({ w: f.w - w, h });
          if (f.h - h > 1) free.push({ w: f.w, h: f.h - h });
          free.sort((a, b) => a.w * a.h - b.w * b.h);
          return true;
        }
      }
    }
    return false;
  };
  for (const p of items) {
    let ok = false;
    for (const s of sheets) if (place(s, p)) { ok = true; break; }
    if (!ok) {
      const s = [{ w: SW, h: SH }];
      place(s, p);
      sheets.push(s);
    }
  }
  return sheets.length;
}

const lumberLb = (size) => {
  const L = LUMBER[size];
  return ((L.t * L.w * L.stock) / 1728) * LUMBER_DENSITY;
};

// A BOM line: net quantity, plus overage, rounded up to whole units.
function lineAdder(lines, prices) {
  return (section, key, use, net, ovPct, opts = {}) => {
    if (net <= 0) return;
    const buy = opts.buy ?? Math.ceil(net * (1 + ovPct / 100) - 1e-9);
    const unit = opts.unit || 'ea';
    const price = opts.price ?? prices[key]?.price ?? 0;
    lines.push({
      section, key, name: opts.name || prices[key]?.name || key, use, net, ov: ovPct, buy, unit, price,
      total: buy * price, est: !!prices[key]?.est, quote: !!prices[key]?.quote, store: prices[key]?.store, note: prices[key]?.note, lb: (opts.lb || 0) * buy, local: !!opts.local,
      fixed: !prices[key],
    });
  };
}

// Lumber, cut-optimised per category ({ cat: { section, ov } }) and size.
function addLumber(add, cuts, list, cats) {
  const groups = {};
  for (const l of list) (groups[`${l.cat}|${l.size}`] ||= []).push(l);
  for (const [cat, info] of Object.entries(cats)) {
    for (const size of Object.keys(LUMBER)) {
      const ls = groups[`${cat}|${size}`];
      if (!ls) continue;
      const stock = LUMBER[size].stock;
      const boards = cutBoards(ls.map((l) => ({ len: l.len, label: l.label })), stock);
      cuts.push({ cat, section: info.section, size, stock, boards });
      const uses = [...new Set(ls.map((l) => l.label.replace(/ \(.*\)/, '')))];
      add(info.section, 'L' + size, uses.join(', '), boards.length, info.ov, { lb: lumberLb(size), unit: 'boards' });
    }
  }
}

// Corrugated sheet pieces cut from the cheapest mix of 8', 10' and 12' sheets.
function addTin(add, pieces, P, prices) {
  const pre = P.cladding === 'pvc' ? 'pvc' : 'metal';
  const stocks = [8, 10, 12].filter((f) => prices[`${pre}${f}`]).map((f) => ({ len: f * 12, cost: prices[`${pre}${f}`].price }));
  const tin = packTin(pieces, stocks);
  for (const { len: stock } of stocks) {
    const bins = tin.bins.filter((b) => b.stock === stock);
    const pcs = bins.flatMap((b) => b.pieces);
    const roof = pcs.filter((t) => t.use === 'roof').length;
    const side = pcs.filter((t) => t.use === 'siding').length;
    const uses = [roof && `${roof} roof pieces`, side && `${side} siding pieces`].filter(Boolean).join(', ');
    add('Roofing & siding', `${pre}${stock / 12}`, uses, bins.length, P.ovTin, { lb: (stock / 12) * TIN_LB[pre], unit: 'sheets' });
  }
  return { tin, pre };
}

function totals(lines, P, order) {
  const sections = [...new Set(lines.map((l) => l.section))].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  const subtotal = lines.reduce((s, l) => s + l.total, 0);
  const tax = (subtotal * (P.tax || 0)) / 100;
  const weight = lines.reduce((s, l) => s + l.lb, 0);
  return { sections, subtotal, tax, weight };
}

export function computeBOM(d, P, prices) {
  const q = d.q;
  const lines = [];
  const add = lineAdder(lines, prices);

  // ---- lumber
  const cuts = [];
  addLumber(add, cuts, q.lumber, {
    framing: { section: 'Framing lumber', ov: P.ovFraming },
    screens: { section: 'Insect screens', ov: P.ovFraming },
    tank: { section: 'Gutters & water tank', ov: 0 },
  });

  // ---- plywood
  add('Plywood', q.wallPly.type, 'Interior wall lining', packSheets(q.wallPly.pieces), P.ovPly, { lb: PLY[q.wallPly.type].lb, unit: 'sheets' });

  // ---- corrugated sheets
  const { tin, pre } = addTin(add, q.tin, P, prices);
  if (q.ridgePieces) add('Roofing & siding', pre === 'pvc' ? 'ridgePvc' : 'ridgeMetal', 'Ridge', q.ridgePieces, P.ovTin, { lb: 8 });
  // a 10.1 oz tube runs about 20 ft of 3/8" bead
  add('Roofing & siding', 'sealant', `Where the sheets meet the concrete (${Math.round(q.sealFt)} ft)`, q.sealFt / 20, P.ovFasteners, { lb: 0.9, unit: 'tubes' });

  // ---- windows
  const nWin = q.windows.length;
  if (nWin) {
    const fh = q.windows[0].frame;
    const bl = q.windows[0].bladeLen;
    add('Windows', `louvreFrame${fh}`, `${nWin} windows`, nWin, 0, { lb: fh });
    const blades = q.windows.reduce((s, w) => s + w.blades, 0);
    add('Windows', `louvreGlass${bl}`, `${blades} blades + 10% spare for breakage`, blades, 10, { lb: bl * 0.75 });
  }

  // ---- floor slab
  let meshSpareFt = 0;
  if (q.concreteFt3 > 0) {
    add('Floor slab', 'cement', `New floor slab (${q.concreteFt3.toFixed(0)} ft³ concrete)`, q.cementNet, P.ovCement, { lb: CEMENT_LB, unit: 'bags' });
    const rolls = cutBoards(q.mesh.map((len) => ({ len, label: 'Mesh strip' })), MESH.len);
    cuts.push({ cat: 'mesh', section: 'Floor slab', size: '7\' wire mesh', stock: MESH.len, boards: rolls });
    const meshFt = q.mesh.reduce((t, l) => t + l, 0) / 12;
    // whole rolls only; the offcut is the contingency
    const spare = (rolls.length * MESH.len) / 12 - meshFt;
    meshSpareFt = spare;
    add('Floor slab', 'mesh', `Floor reinforcement: ${q.mesh.length} strips, ${Math.round(meshFt)} ft with 6" laps, ${Math.round(spare)} ft spare`, rolls.length, 0, { lb: MESH.lb, unit: 'rolls' });
    add('Floor slab', 'tieWire', 'Tying the mesh laps', 1, 0, { lb: 3.5, unit: 'rolls' });
    add('Floor slab', 'plastic', `Under slab (${q.plasticFt2.toFixed(0)} ft² incl. laps)`, q.plasticFt2 / 220, 0, { lb: 15, unit: 'rolls' });
  }

  // ---- insect screens
  const sc = q.screens;
  if (sc) {
    const ss = 'Insect screens';
    const nw = sc.windows.length;
    if (nw) {
      // cut across the roll: the roll width covers the shorter side
      const ft = sc.windows.reduce((t, x) => t + Math.max(x.w, x.h), 0) / 12;
      const key = { 36: 'screen', 48: 'screen48', 60: 'screen60' }[sc.rollW];
      add(ss, key, `${nw} window screens, ${ftin(sc.windows[0].w)} × ${ftin(sc.windows[0].h)}`, ft + 2, 5, { lb: 0.12, unit: 'ft' });
      add(ss, 'cornerBrace', `${nw} frames × 4 corners`, nw * 4, 0, { lb: 0.1 });
      add(ss, 'screenHinge', `${nw} frames × 2`, nw * 2, 0, { lb: 0.2 });
      add(ss, 'hookEye', 'Holds each frame shut', nw, 0, { lb: 0.1 });
    }
    if (sc.soffit.length) {
      const key = { 36: 'screen', 48: 'screen48', 60: 'screen60' }[sc.soffitRoll];
      const ft = sc.soffit.reduce((t, x) => t + x.len, 0) / 12;
      add(ss, key, `Under both eaves: ${sc.soffit.length} strips ${ftin(sc.soffit[0].len)} long, ${ftin(sc.soffitW)} wide`, ft, 5, { lb: 0.1, unit: 'ft' });
    }
    add(ss, 'staples', `Screen to the ${[nw && 'frames', sc.soffit.length && 'rafters'].filter(Boolean).join(' and ')}`, sc.soffit.length ? 2 : 1, 0, { lb: 1, unit: 'boxes' });
    add(ss, 'foam', `Corrugations over both eave purlins and under the ridge cap (${Math.round(sc.foamFt)} ft)`, sc.foamFt / 30, 0, { lb: 1.5, unit: 'cans' });
  }

  // ---- gutters & water tank
  const rn = q.rain;
  if (rn) {
    const gs = 'Gutters & water tank';
    const glen = cutBoards(rn.gutterPieces.map((len) => ({ len, label: 'Gutter' })), 120);
    cuts.push({ cat: 'gutter', section: gs, size: '5" PVC gutter', stock: 120, boards: glen });
    add(gs, 'gutter', `Both eaves, ${ftin(rn.gutterPieces.reduce((t, x) => t + x, 0) / 2)} each`, glen.length, P.ovTin, { lb: 6, unit: 'lengths' });
    add(gs, 'gutterJoin', 'Between gutter lengths', rn.joiners, 0, { lb: 0.3 });
    add(gs, 'gutterEnd', 'Both ends of each gutter', rn.ends, 0, { lb: 0.2 });
    add(gs, 'gutterOutlet', `At the ${rn.wall} end of each gutter`, rn.outlets, 0, { lb: 0.4 });
    add(gs, 'gutterBracket', `${rn.bracketXs.length} along each eave, at every rafter`, rn.brackets, P.ovFasteners, { lb: 0.15 });
    add(gs, 'screwSS', `Gutter brackets and pipe straps (~${rn.screws})`, rn.screws / 100, 0, { lb: 1, unit: 'boxes' });
    const sticks = cutBoards(rn.pipes.map((len) => ({ len, label: '3" rain pipe' })), 120);
    cuts.push({ cat: 'pipe', section: gs, size: '3" PVC', stock: 120, boards: sticks });
    add(gs, 'pipe3', 'Downpipes, header along the end wall, first flush, tank inlet and overflow', sticks.length, 0, { lb: 14, unit: '10\' lengths' });
    add(gs, 'elbow3', 'Under each outlet, over the tank, at the overflow', rn.elbows, 0, { lb: 0.5 });
    add(gs, 'tee3', 'Where the headers meet, and the first-flush chamber', rn.tees, 0, { lb: 0.6 });
    if (rn.couplings) add(gs, 'pvcCoupling', 'Joining the 10\' lengths', rn.couplings, 0, { lb: 0.4, name: '3" PVC coupling' });
    add(gs, 'ffCap', 'Bottom of the first-flush chamber (drill a 1/8" hole in the plug)', 1, 0, { lb: 0.4 });
    add(gs, 'pvcCement', 'All pipe joints', 1, 0, { lb: 1.5 });
    add(gs, 'pipeStrap3', 'Header to the end-wall columns', rn.straps, 0, { lb: 0.1 });
    const t = rn.tank;
    add(gs, `tank${t.gal}`, `${inch(t.d)} across × ${ftin(t.h)} tall`, 1, 0, { lb: t.lb });
    add(gs, 'tankTap', 'Tap at the bottom of the tank', 1, 0, { lb: 1.5 });
    if (t.blocks.length) {
      const bl = cutBoards(t.blocks.map((len) => ({ len, label: 'Block' })), BLOCK.len);
      add(gs, 'block', `Tank base, ${t.k} course${t.k > 1 ? 's' : ''}`, bl.length, 10, { lb: BLOCK.lb[6], name: 'Cement hollow block, 6"' });
    }
    const bars = cutBoards(t.rebar.map((len) => ({ len, label: 'Tank base bar' })), 240);
    cuts.push({ cat: 'rebar', section: gs, size: '#4 rebar', stock: 240, boards: bars });
    add(gs, 'rebar', `Tank base slab, 12" each way (${t.rebar.length} bars ${ftin(t.rebar[0])})`, bars.length, 0, { lb: 13.4, unit: 'bars' });
    add(gs, 'cement', `Tank base: slab ${t.concreteFt3.toFixed(1)} ft³${t.mortarFt3 ? `, mortar ${t.mortarFt3.toFixed(1)} ft³` : ''}`, t.concreteFt3 / BAG_YIELD_FT3 + t.mortarFt3 / MORTAR_FT3_PER_BAG, P.ovCement, { lb: CEMENT_LB, unit: 'bags' });
    if (!(q.concreteFt3 > 0)) add(gs, 'tieWire', 'Tying the rebar', 1, 0, { lb: 3.5, unit: 'rolls' });
  }

  // ---- fasteners & hardware
  const ovF = P.ovFasteners;
  add('Fasteners & hardware', 'nail16', `Framing (~${Math.round(q.n16)} nails)`, Math.max(1, q.n16 / 45), ovF, { lb: 1, unit: 'lb' });
  add('Fasteners & hardware', 'nail8', `Trim, doors, fascia (~${Math.round(q.n8)} nails)`, Math.max(1, q.n8 / 90), ovF, { lb: 1, unit: 'lb' });
  add('Fasteners & hardware', 'nailTie', `Hurricane ties (~${Math.round(q.nTie)} nails)`, Math.max(1, q.nTie / 150), ovF, { lb: 1, unit: 'lb' });
  add('Fasteners & hardware', 'nailPanel', `Interior plywood (~${Math.round(q.nPanel)} nails)`, Math.max(1, q.nPanel / 300), ovF, { lb: 1, unit: 'lb' });
  add('Fasteners & hardware', 'roofFast', `Roof & siding (~${Math.round(q.roofFast)})`, q.roofFast / 100, ovF, { lb: 1.6, unit: 'boxes' });
  add('Fasteners & hardware', 'wedge', 'Wall plate to ring beam', q.wedge, ovF, { lb: 0.3 });
  add('Fasteners & hardware', 'conScrew', `Infill framing${q.rain ? ' and rain-pipe standoffs' : ''} to concrete (~${q.screws})`, q.screws / 100, ovF, { lb: 3, unit: 'boxes' });
  add('Fasteners & hardware', 'tie', 'Rafters to wall plate', q.ties, ovF, { lb: 0.25 });
  add('Fasteners & hardware', 'hinge', `${q.doors} doors × 3`, q.doors * 3, 0, { lb: 0.8 });
  add('Fasteners & hardware', 'hasp', `${q.doors} doors`, q.doors, 0, { lb: 0.5 });
  add('Fasteners & hardware', 'padlock', `${q.doors} doors (ask for keyed alike)`, q.doors, 0, { lb: 0.5 });

  // ---- tools (the guide's "Tools" step)
  for (const t of houseTools({ pvc: P.cladding === 'pvc', screens: !!q.screens, rain: !!rn, concrete: q.concreteFt3 > 0 || !!rn })) {
    for (const [key, n] of t.items) add('Tools', key, t.name, n, 0, { lb: TOOL_LB[key] || 1 });
  }

  // ---- local (not purchased)
  const bags = lines.filter((l) => l.key === 'cement').reduce((t, l) => t + l.buy, 0);
  const local = [
    { name: 'Sand (rinsed with fresh water)', qty: bags * 2, unit: 'ft³' },
    { name: 'Gravel / crushed coral aggregate', qty: bags * 3, unit: 'ft³' },
    { name: 'Fresh water for mixing & curing', qty: bags * 6, unit: 'gal' },
    { name: 'Compacted sand / coral fill inside the tank base', qty: rn ? Math.ceil(rn.tank.fillFt3) : 0, unit: 'ft³' },
  ];

  const ORDER = ['Floor slab', 'Framing lumber', 'Plywood', 'Roofing & siding', 'Windows', 'Insect screens', 'Gutters & water tank', 'Fasteners & hardware', 'Tools'];
  return { lines, cuts, tinBins: tin.bins, local, meshSpareFt, ...totals(lines, P, ORDER) };
}

// The house is built in two phases: the house first, then the gutters and
// water tank. `base` is the BOM of the same design without the rainwater
// system. Its lines are phase 1; phase 2 is the gutters & tank section of the
// full BOM, plus whatever else the full design needs beyond phase 1 (the
// pipe standoffs, the screws that fix them, the tools for cutting pipe).
export const PHASES = { 1: 'Phase 1: the house', 2: 'Phase 2: gutters & water tank' };
export function phaseBOM(full, base, P) {
  const RAIN = 'Gutters & water tank';
  const lines = base.lines.map((l) => ({ ...l, phase: 1 }));
  const have = {};
  for (const l of base.lines) have[l.key] = (have[l.key] || 0) + l.buy;
  const more = new Map();
  for (const l of full.lines) {
    if (l.section === RAIN) lines.push({ ...l, phase: 2 });
    else {
      const e = more.get(l.key) || { l, buy: 0 };
      e.buy += l.buy;
      more.set(l.key, e);
    }
  }
  for (const { l, buy } of more.values()) {
    const n = buy - (have[l.key] || 0);
    if (n <= 0) continue;
    lines.push({
      ...l, section: RAIN, phase: 2, tool: l.section === 'Tools', net: n, ov: 0, buy: n, total: n * l.price, lb: (l.lb / l.buy) * n,
      use: l.section === 'Tools' ? `${l.use} (tool)` : `More than phase 1 needs, for the gutters and tank (${l.use})`,
    });
  }
  const ORDER = [...base.sections, RAIN];
  return { ...full, lines, phased: true, ...totals(lines, P, ORDER) };
}

// Toilet house. houseMeshSpareFt: wire mesh left on the house's roll.
export function computeToiletBOM(d, P, prices, { houseMeshSpareFt = 0 } = {}) {
  const q = d.q;
  const i = d.info;
  const lines = [];
  const add = lineAdder(lines, prices);
  const cuts = [];
  const pit = P.waste === 'pit';

  // ---- slab, blocks, concrete
  const sec = 'Slab & block wall';
  const blocks = cutBoards(q.blocks, BLOCK.len);
  add(sec, 'block', `${P.courses} courses, ${q.blocks.length} pieces incl. cuts (two short cuts share a block)`, blocks.length, P.ovBlock, { lb: BLOCK.lb[P.blockT] || 35, name: `Cement hollow block, ${P.blockT}"` });
  const bars = cutBoards(q.rebar, 240);
  cuts.push({ cat: 'rebar', section: sec, size: '#4 rebar', stock: 240, boards: bars });
  add(sec, 'rebar', `${q.rebar.filter((r) => r.label === 'Dowel').length} dowels into grouted cells, hooked into the slab${pit ? '; pit lid grid' : ''}`, bars.length, 0, { lb: 13.4, unit: 'bars' });
  const concrete = q.concreteFt3;
  const bags = concrete / BAG_YIELD_FT3 + q.mortarFt3 / MORTAR_FT3_PER_BAG;
  const parts = [
    `slab ${q.slabFt3.toFixed(1)} ft³`, `grout ${q.groutFt3.toFixed(1)} ft³`, `mortar ${q.mortarFt3.toFixed(1)} ft³`,
    q.collarFt3 && `pipe collars ${q.collarFt3.toFixed(1)} ft³`, q.lidFt3 && `pit lid ${q.lidFt3.toFixed(1)} ft³`,
  ].filter(Boolean).join(', ');
  add(sec, 'cement', parts, bags, P.ovCement, { lb: CEMENT_LB, unit: 'bags' });
  const meshNeed = q.mesh;
  const meshFt = meshNeed.reduce((t, l) => t + l, 0) / 12;
  const fromHouse = P.meshFrom === 'house' && houseMeshSpareFt >= meshFt + 1;
  if (fromHouse) {
    add(sec, 'meshOffcut', `${Math.ceil(meshFt)} ft of 7' mesh cut from the house roll (${Math.round(houseMeshSpareFt)} ft left over there)`, Math.ceil(meshFt), 0, {
      name: 'Galv. wire mesh #10, 6" × 6" (house roll offcut)', unit: 'ft', price: 0, local: true,
    });
  } else {
    const rolls = cutBoards(meshNeed.map((len) => ({ len, label: 'Mesh strip' })), MESH.len);
    add(sec, 'mesh', `${Math.ceil(meshFt)} ft needed${P.meshFrom === 'house' ? ' — not enough left on the house roll, so a whole roll' : ''}`, rolls.length, 0, { lb: MESH.lb, unit: 'rolls' });
  }
  add(sec, 'tieWire', 'Mesh laps and dowels', 1, 0, { lb: 3.5, unit: 'rolls' });
  add(sec, 'plastic', `Under the slab (${q.plasticFt2.toFixed(0)} ft²) and under the plates`, q.plasticFt2 / 220, 0, { lb: 15, unit: 'rolls' });

  // ---- lumber, sheets
  addLumber(add, cuts, q.lumber, {
    formwork: { section: 'Slab formwork', ov: 0 },
    framing: { section: 'Framing lumber', ov: P.ovFraming },
  });
  const { tin } = addTin(add, q.tin, P, prices);
  add('Roofing & siding', 'foam', `Seal the crests over both eave purlins (${Math.round(q.foamFt)} ft) and the vent boot`, q.foamFt / 15, 0, { lb: 1.5, unit: 'cans' });
  add('Roofing & siding', 'sealant', 'Vent boot and screw heads near it', 1, 0, { lb: 0.9, unit: 'tubes' });

  // ---- screens
  const scrIn = q.screen.reduce((s, x) => s + x.len * Math.ceil(x.h / 36), 0);
  const perWidth = Math.max(1, Math.floor(36 / (q.screen[0]?.h || 36)));
  const scrFt = Math.ceil((q.screen.reduce((s, x) => s + x.len, 0) / perWidth + 12) / 12);
  add('Vents & screens', 'screen', `${q.screen.length} strips ${ftin(q.screen[0]?.len || 0)} × ${ftin(q.screen[0]?.h || 0)}, ${perWidth} out of the 36" width`, scrIn ? scrFt : 0, 0, { lb: 0.1, unit: 'ft', buy: scrFt });
  add('Vents & screens', 'staples', 'Screen to the framing', 1, 0, { lb: 1 });

  // ---- toilet & plumbing
  const ps = pit ? 'Toilet, drain & pit' : 'Toilet & seawater outfall';
  const dia = P.pipeD;
  const ov = P.ovPlumbing;
  add(ps, 'toilet', 'Seat-height pour-flush bowl; no tank', 1, 0, { lb: 45 });
  const sticks = cutBoards(q.mainPipes.map((len) => ({ len, label: `${dia}" drain` })), 120);
  cuts.push({ cat: 'pipe', section: ps, size: `${dia}" PVC`, stock: 120, boards: sticks });
  add(ps, `pipe${dia}`, pit ? `Drain to the pit (${Math.round(i.landRun / 12)} ft)` : `Drain and outfall: ${Math.round(i.landRun / 12)} ft buried, ${Math.round(i.seaRun / 12)} ft in the water`, sticks.length, ov, { lb: dia === 4 ? 20 : 14, unit: '10\' lengths' });
  const vsticks = cutBoards(q.ventPipes.map((len) => ({ len, label: '2" vent' })), 120);
  cuts.push({ cat: 'pipe', section: ps, size: '2" PVC', stock: 120, boards: vsticks });
  add(ps, 'pipe2', 'Vent stack through the roof', vsticks.length, 0, { lb: 6.5, unit: '10\' lengths' });
  const f = q.fittings;
  add(ps, 'closetFlange', 'Under the bowl', f.flange, 0, { lb: 1, name: `${dia}" PVC closet flange` });
  add(ps, 'pvcBend', pit ? '90° closet bend' : '90° closet bend, two 45°s where the pipe meets the water', f.bend, 0, { lb: 1, name: `${dia}" PVC bends` });
  add(ps, 'pvcTee', 'Vent connection behind the bowl', f.tee, 0, { lb: 1, name: `${dia}" × ${dia}" × 2" PVC sanitary tee` });
  add(ps, 'cleanout', 'Just outside the back wall', f.cleanout, 0, { lb: 1.5, name: `${dia}" PVC wye with cleanout plug` });
  add(ps, 'pvcCoupling', 'Joining the 10\' lengths', f.couplings, ov, { lb: 0.4, name: `PVC couplings (${dia}" and 2")` });
  if (f.check) add(ps, 'checkValve', 'Outlet end', f.check, 0, { lb: 3, name: `${dia}" PVC flap check valve (outfall end)` });
  add(ps, 'pvcCement', 'All joints', 1, 0, { lb: 1.5 });
  add(ps, 'ventBoot', 'Where the vent goes through the roof', 1, 0, { lb: 1 });
  add(ps, 'ventCap', 'Top of the vent', 1, 0, { lb: 0.3 });
  add(ps, 'pipeStrap', 'Vent stack to the back wall', f.straps, 0, { lb: 0.1 });
  add(ps, 'drum', 'Seawater for flushing, by the door', 1, 0, { lb: 20 });
  add(ps, 'bucket', 'Pouring the flush', 1, 0, { lb: 2 });
  if (pit) {
    const pb = cutBoards(q.pitBlocks, BLOCK.len);
    add(ps, 'block', 'Pit lining, open joints', pb.length, P.ovBlock, { lb: BLOCK.lb[P.blockT] || 35, name: `Cement hollow block, ${P.blockT}"` });
  }

  // ---- fasteners & hardware
  const ovF = P.ovFasteners;
  const fh = 'Fasteners & hardware';
  add(fh, 'nail16', `Framing (~${Math.round(q.n16)} nails)`, Math.max(1, q.n16 / 45), ovF, { lb: 1, unit: 'lb' });
  add(fh, 'nail8', `Fascia, trim, door (~${Math.round(q.n8)} nails)`, Math.max(1, q.n8 / 90), ovF, { lb: 1, unit: 'lb' });
  add(fh, 'nailTie', `Hurricane ties (~${Math.round(q.nTie)} nails)`, Math.max(1, q.nTie / 150), ovF, { lb: 1, unit: 'lb' });
  add(fh, 'roofFast', `Roof & siding (~${Math.round(q.roofFast)})`, q.roofFast / 100, ovF, { lb: 1.6, unit: 'boxes' });
  add(fh, 'bolt', 'Bottom plates to the grouted block cells', q.bolts, ovF, { lb: 0.6 });
  add(fh, 'tie', 'Rafters to both top plates', q.ties, ovF, { lb: 0.25 });
  add(fh, 'conScrew', `Door jambs to the block (~${q.screws})`, q.screws / 100, 0, { lb: 3, unit: 'boxes' });
  add(fh, 'hinge', 'Door', 3, 0, { lb: 0.8 });
  add(fh, 'doorPull', 'Outside of the door', 1, 0, { lb: 0.4 });
  add(fh, 'hookEye', 'Keeps the door shut in the wind', 1, 0, { lb: 0.1 });
  add(fh, 'barrelBolt', 'Inside of the door', 1, 0, { lb: 0.4 });

  const bagsBuy = lines.find((l) => l.key === 'cement')?.buy || 0;
  const local = [
    { name: 'Sand (rinsed with fresh water)', qty: bagsBuy * 2.5, unit: 'ft³' },
    { name: 'Gravel / crushed coral aggregate', qty: (concrete / BAG_YIELD_FT3) * 3, unit: 'ft³' },
    { name: 'Fresh water for mixing & curing', qty: bagsBuy * 6, unit: 'gal' },
    { name: 'Compacted sand / coral fill under the slab', qty: P.floorAbove > P.slabT ? (d.W * (d.D + P.apron) * (P.floorAbove - P.slabT)) / 1728 : 0, unit: 'ft³' },
    { name: 'Buckets to cast the pipe collars in (reused)', qty: q.collarFt3 ? 4 : 0, unit: 'ea' },
  ];
  const ORDER = ['Slab & block wall', 'Slab formwork', 'Framing lumber', 'Roofing & siding', 'Vents & screens', 'Toilet & seawater outfall', 'Toilet, drain & pit', 'Fasteners & hardware'];
  return { lines, cuts, tinBins: tin.bins, local, meshFromHouse: fromHouse, ...totals(lines, P, ORDER) };
}

// Sum of quantities by store item (for the consolidated shopping list).
export function shoppingList(bom) {
  const m = new Map();
  for (const l of bom.lines) {
    const e = m.get(l.key) || { key: l.key, section: l.section, name: l.name, buy: 0, price: l.price, unit: l.unit, est: l.est, quote: l.quote, store: l.store, uses: [] };
    e.buy += l.buy;
    e.uses.push(l.use);
    m.set(l.key, e);
  }
  return [...m.values()].map((e) => ({ ...e, total: e.buy * e.price }));
}
