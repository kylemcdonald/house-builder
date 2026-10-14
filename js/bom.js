// Bill of materials: cut optimisation for lumber, sheet packing for plywood,
// overage contingency per material group, pricing and weights.
import { LUMBER, PLY, LUMBER_DENSITY, TIN_LB, CEMENT_LB, MESH } from './catalog.js';

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

export function computeBOM(d, P, prices) {
  const q = d.q;
  const lines = [];
  const pr = (k) => prices[k]?.price ?? 0;
  const add = (section, key, use, net, ovPct, opts = {}) => {
    if (net <= 0) return;
    const buy = opts.buy ?? Math.ceil(net * (1 + ovPct / 100) - 1e-9);
    const unit = opts.unit || 'ea';
    const price = pr(key);
    lines.push({
      section, key, name: opts.name || prices[key]?.name || key, use, net, ov: ovPct, buy, unit, price,
      total: buy * price, est: !!prices[key]?.est, quote: !!prices[key]?.quote, note: prices[key]?.note, lb: (opts.lb || 0) * buy, local: !!opts.local,
    });
  };

  // ---- lumber
  const cuts = [];
  const groups = {};
  for (const l of q.lumber) {
    const k = `${l.cat}|${l.size}`;
    (groups[k] ||= []).push(l);
  }
  const catInfo = {
    formwork: { section: 'Slab formwork (reused for blocking afterwards)', ov: P.ovFraming },
    framing: { section: 'Framing lumber', ov: P.ovFraming },
  };
  const order = ['framing'];
  const sizes = Object.keys(LUMBER);
  for (const cat of order) {
    for (const size of sizes) {
      const list = groups[`${cat}|${size}`];
      if (!list) continue;
      const stock = LUMBER[size].stock;
      const boards = cutBoards(list.map((l) => ({ len: l.len, label: l.label })), stock);
      cuts.push({ cat, section: catInfo[cat].section, size, stock, boards });
      const uses = [...new Set(list.map((l) => l.label.replace(/ \(.*\)/, '')))];
      add(catInfo[cat].section, 'L' + size, uses.join(', '), boards.length, catInfo[cat].ov, { lb: lumberLb(size), unit: 'boards' });
    }
  }

  // ---- plywood
  add('Plywood', q.wallPly.type, 'Interior wall lining', packSheets(q.wallPly.pieces), P.ovPly, { lb: PLY[q.wallPly.type].lb, unit: 'sheets' });

  // ---- corrugated sheets
  const pre = P.cladding === 'pvc' ? 'pvc' : 'metal';
  const stocks = [8, 10, 12].filter((f) => prices[`${pre}${f}`]).map((f) => ({ len: f * 12, cost: pr(`${pre}${f}`) }));
  const tin = packTin(q.tin, stocks);
  for (const { len: stock } of stocks) {
    const bins = tin.bins.filter((b) => b.stock === stock);
    const pcs = bins.flatMap((b) => b.pieces);
    const roof = pcs.filter((t) => t.use === 'roof').length;
    const side = pcs.filter((t) => t.use === 'siding').length;
    const uses = [roof && `${roof} roof pieces`, side && `${side} siding pieces`].filter(Boolean).join(', ');
    add('Roofing & siding', `${pre}${stock / 12}`, uses, bins.length, P.ovTin, { lb: (stock / 12) * TIN_LB[pre], unit: 'sheets' });
  }
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
  if (q.concreteFt3 > 0) {
    add('Floor slab', 'cement', `New floor slab (${q.concreteFt3.toFixed(0)} ft³ concrete)`, q.cementNet, P.ovCement, { lb: CEMENT_LB, unit: 'bags' });
    const rolls = cutBoards(q.mesh.map((len) => ({ len, label: 'Mesh strip' })), MESH.len);
    cuts.push({ cat: 'mesh', section: 'Floor slab', size: '7\' wire mesh', stock: MESH.len, boards: rolls });
    const meshFt = q.mesh.reduce((t, l) => t + l, 0) / 12;
    // whole rolls only; the offcut is the contingency
    const spare = (rolls.length * MESH.len) / 12 - meshFt;
    add('Floor slab', 'mesh', `Floor reinforcement: ${q.mesh.length} strips, ${Math.round(meshFt)} ft with 6" laps, ${Math.round(spare)} ft spare`, rolls.length, 0, { lb: MESH.lb, unit: 'rolls' });
    add('Floor slab', 'tieWire', 'Tying the mesh laps', 1, 0, { lb: 3.5, unit: 'rolls' });
    add('Floor slab', 'plastic', `Under slab (${q.plasticFt2.toFixed(0)} ft² incl. laps)`, q.plasticFt2 / 220, 0, { lb: 15, unit: 'rolls' });
  }

  // ---- fasteners & hardware
  const ovF = P.ovFasteners;
  add('Fasteners & hardware', 'nail16', `Framing (~${Math.round(q.n16)} nails)`, Math.max(1, q.n16 / 45), ovF, { lb: 1, unit: 'lb' });
  add('Fasteners & hardware', 'nail8', `Trim, doors, fascia (~${Math.round(q.n8)} nails)`, Math.max(1, q.n8 / 90), ovF, { lb: 1, unit: 'lb' });
  add('Fasteners & hardware', 'nailPanel', `Interior plywood (~${Math.round(q.nPanel)} nails)`, Math.max(1, q.nPanel / 300), ovF, { lb: 1, unit: 'lb' });
  add('Fasteners & hardware', 'roofFast', `Roof & siding (~${Math.round(q.roofFast)})`, q.roofFast / 100, ovF, { lb: 1.6, unit: 'boxes' });
  add('Fasteners & hardware', 'wedge', 'Wall plate to ring beam', q.wedge, ovF, { lb: 0.3 });
  add('Fasteners & hardware', 'conScrew', `Infill framing to concrete (~${q.screws})`, q.screws / 100, ovF, { lb: 3, unit: 'boxes' });
  add('Fasteners & hardware', 'tie', 'Rafters to wall plate', q.ties, ovF, { lb: 0.25 });
  add('Fasteners & hardware', 'hinge', `${q.doors} doors × 3`, q.doors * 3, 0, { lb: 0.8 });
  add('Fasteners & hardware', 'hasp', `${q.doors} doors`, q.doors, 0, { lb: 1 });

  // ---- local (not purchased)
  const bags = lines.find((l) => l.key === 'cement')?.buy || 0;
  const local = [
    { name: 'Sand (rinsed with fresh water)', qty: bags * 2, unit: 'ft³' },
    { name: 'Gravel / crushed coral aggregate', qty: bags * 3, unit: 'ft³' },
    { name: 'Fresh water for mixing & curing', qty: bags * 6, unit: 'gal' },
  ];

  const ORDER = ['Floor slab', 'Framing lumber', 'Plywood', 'Roofing & siding', 'Windows', 'Fasteners & hardware'];
  const sections = [...new Set(lines.map((l) => l.section))].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  const subtotal = lines.reduce((s, l) => s + l.total, 0);
  const tax = (subtotal * (P.tax || 0)) / 100;
  const weight = lines.reduce((s, l) => s + l.lb, 0);
  return { lines, sections, cuts, tinBins: tin.bins, local, subtotal, tax, weight };
}

// Sum of quantities by store item (for the consolidated shopping list).
export function shoppingList(bom) {
  const m = new Map();
  for (const l of bom.lines) {
    const e = m.get(l.key) || { key: l.key, name: l.name, buy: 0, price: l.price, unit: l.unit, est: l.est, quote: l.quote };
    e.buy += l.buy;
    m.set(l.key, e);
  }
  return [...m.values()].map((e) => ({ ...e, total: e.buy * e.price }));
}
