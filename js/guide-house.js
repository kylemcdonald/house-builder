// Step-by-step building guide for the house: every number comes from the
// current design, the drawings are made from its parts, and the 3D pictures
// are the model itself at each stage.
import { STEP, subtract, LAP } from './design.js';
import { PLY } from './catalog.js';
import { ftin, inch, num } from './format.js';
import { renderGuide, tip, warn, check, need, figs, ol, ul } from './guide.js';
import {
  Fig, figure, shotFig, lumberSizes, nailing, measureMark, squareCheck, levelPlumb, concreteScrew, wedgeAnchor,
  concreteMix, speedSquare, tinLap, washerTight, hurricaneTie, openingFraming, doorBuild, louvreWin,
} from './guide-svg.js';

const WALL_NAME = { front: 'front', back: 'back', left: 'left end', right: 'right end' };
const Cap = (s) => s[0].toUpperCase() + s.slice(1);
const r8 = (x) => Math.round(x * 8) / 8;
const plural = (n, a, b = a + 's') => `${n} ${n === 1 ? a : b}`;

// world (x, z) of a point u along wall w, d in from its outside face
function wallXZ(d, key, u, dd = 0) {
  const W = d.W, D = d.D;
  if (key === 'front') return [u, D - dd];
  if (key === 'back') return [W - u, dd];
  if (key === 'left') return [dd, u];
  return [W - dd, D - u];
}
const NORMAL = { front: [0, 0, 1], back: [0, 0, -1], left: [-1, 0, 0], right: [1, 0, 0] };

// ---------------------------------------------------------------- drawings
function planFig(d) {
  const g = d.g;
  const W = d.W, D = d.D;
  const F = new Fig({ x0: -40, x1: W + 40, y0: -40, y1: D + 46, w: 760, flip: false, pad: [10, 10, 10, 10] });
  const wpt = (key, u, dd) => wallXZ(d, key, u, dd);
  // outline and pony walls, gaps at door openings
  for (const w of Object.values(g.walls)) {
    const long = w.key === 'front' || w.key === 'back';
    const ua = long ? 0 : g.Pt;
    const ub = long ? w.L : w.L - g.Pt;
    const gaps = [...w.openings.filter((o) => o.type === 'door').map((o) => [o.u0, o.u1])];
    for (const [s, e] of subtract(ua, ub, gaps)) {
      const [xa, za] = wpt(w.key, s, 0);
      const [xb, zb] = wpt(w.key, e, g.Pt);
      F.rect(xa, za, xb, zb, 'conc');
    }
    for (const [s, e] of w.covered) {
      const [xa, za] = wpt(w.key, s, 0);
      const [xb, zb] = wpt(w.key, e, 3.5);
      F.rect(xa, za, xb, zb, 'wood');
    }
    w.cols.forEach(([a, c], i) => {
      const [xa, za] = wpt(w.key, a, 0);
      const [xb, zb] = wpt(w.key, c, g.C);
      F.rect(xa, za, xb, zb, 'conc', 'style="stroke-width:1.6"');
    });
    for (const o of w.openings) {
      const [xa, za] = wpt(w.key, o.u0, -1.5);
      const [xb, zb] = wpt(w.key, o.u1, g.Pt + 1.5);
      F.rect(xa, za, xb, zb, o.type === 'door' ? 'areafill' : 'glass');
    }
    // bay numbers and clear widths, outside the wall
    w.bays.forEach(([a, c], j) => {
      const [x, z] = wpt(w.key, (a + c) / 2, -20);
      F.text(x, z, `${j + 1}`, { cls: 'ttl' });
      const [x2, z2] = wpt(w.key, (a + c) / 2, 18);
      F.text(x2, z2, ftin(c - a), { cls: 'note', rot: long ? 0 : -90 });
    });
  }
  F.text(W / 2, D + 36, 'FRONT', { cls: 'ttl' });
  F.text(W / 2, -32, 'BACK', { cls: 'ttl' });
  F.text(-30, D / 2, 'LEFT END', { cls: 'ttl', rot: -90 });
  F.text(W + 30, D / 2, 'RIGHT END', { cls: 'ttl', rot: 90 });
  F.add(`<path d="M${F.X(g.Pt + 4)} ${F.Y(g.Pt + 4)}L${F.X(W - g.Pt - 4)} ${F.Y(D - g.Pt - 4)}M${F.X(W - g.Pt - 4)} ${F.Y(g.Pt + 4)}L${F.X(g.Pt + 4)} ${F.Y(D - g.Pt - 4)}" class="diag" style="opacity:.35"/>`);
  F.text(W / 2, D / 2 - 14, `${ftin(W)} × ${ftin(D)} outside`, { cls: 'ttl' });
  F.text(W / 2, D / 2 + 4, `both diagonals ${ftin(Math.hypot(W, D))} (outside corners)`, { cls: 'note' });
  F.text(W / 2, D / 2 + 20, 'orange = door, blue = window, brown = closed-up door gap', { cls: 'note' });
  return F.svg('Plan of the concrete frame with columns, bays and openings');
}

// One bay seen from outside (or inside, mirrored): concrete around it and the
// framing, sheets or plywood in it.
function bayFig(d, P, key, j, mode = 'frame') {
  const g = d.g;
  const w = g.walls[key];
  const [a, c] = w.bays[j];
  const C = g.C, PH = g.PH, Rb = g.Rb, rt = g.ringTop;
  const inside = mode === 'ply';
  const xl = a - C - 3, xr = c + C + 3;
  const pad = [34, 200, 54, 20];
  const k = Math.min((760 - pad[1] - pad[3]) / (xr - xl), 420 / (rt + 6));
  const F = new Fig({ x0: inside ? xr : xl, x1: inside ? xl : xr, y0: -4, y1: rt + 2, k: inside ? -k : k, pad });
  const ops = w.openings.filter((o) => o.u0 >= a - 0.01 && o.u1 <= c + 0.01);
  const cov = w.covered.filter(([g0, g1]) => g0 >= a - 0.01 && g1 <= c + 0.01);
  const gaps = [...ops.filter((o) => o.type === 'door').map((o) => [o.u0, o.u1]), ...cov];
  for (const [s, e] of subtract(a - C, c + C, gaps)) F.rect(s, 0, e, PH, 'conc');
  F.rect(a - C, PH, a, Rb, 'conc');
  F.rect(c, PH, c + C, Rb, 'conc');
  F.rect(a - C, Rb, c + C, rt, 'conc');
  F.line(xl, 0, xr, 0, 'ground');
  const members = w.frame.filter((f) => f.bay === j);
  const cls = (n) => (/King|Head|sill|Cripple/.test(n) ? 'wood hl2' : /plate|Blocking|Nailer/i.test(n) ? 'wood2' : 'wood');
  if (mode === 'frame') {
    for (const f of members) F.rect(f.u0, f.v0, f.u1, f.v1, cls(f.name));
  } else {
    for (const f of members) F.rect(f.u0, f.v0, f.u1, f.v1, 'ghost');
  }
  for (const o of ops) {
    if (mode === 'frame') F.rect(o.u0, o.v0, o.u1, o.v1, 'areafill');
    const lab = o.type === 'door' ? `door opening\n${ftin(o.u1 - o.u0)} × ${ftin(o.v1 - o.v0)}` : `window opening\n${ftin(o.u1 - o.u0)} × ${ftin(o.v1 - o.v0)}`;
    if (mode === 'frame') F.text((o.u0 + o.u1) / 2, (o.v0 + o.v1) / 2, lab, { cls: 'note' });
  }
  const tops = [];
  if (mode === 'siding') {
    const rec = g.sidingLog.find((r) => r.wall === key && Math.abs(r.ua - a) < 0.1 && r.label === 'wall panel');
    const rows = [PH + 0.75, ...g.blockLevels, Rb - 0.75];
    if (rec) {
      for (const pc of rec.pieces) {
        F.rect(pc.u, rec.vbase, pc.u + pc.w, rec.vbase + pc.len, 'tinfill');
        for (let x = pc.u + 1.5; x < pc.u + pc.w; x += 3) F.line(x, rec.vbase, x, rec.vbase + pc.len, 'tinf');
        F.text(pc.u + pc.w / 2, rec.vbase + pc.len / 2 + 8, `sheet ${pc.col + 1}${pc.w < g.tinW - 0.1 ? `\ncut to ${ftin(pc.w)} wide` : ''}`, { cls: 'ttl' });
      }
      for (const o of ops) F.rect(o.u0, Math.max(o.v0, rec.vbase), o.u1, o.v1, 'hole', 'style="fill:var(--panel)"');
      for (const v of rows) {
        F.line(a, v, c, v, 'dimx');
        for (const pc of rec.pieces) for (let x = pc.u + 0.75; x < pc.u + pc.w - 0.3; x += 6) {
          if (ops.some((o) => x > o.u0 - 2 && x < o.u1 + 2 && v > o.v0 - 3.5 && v < o.v1 + 3.5)) continue;
          if (x < pc.u + P.tinCover - 0.3 || pc.col === rec.n - 1) F.circle(x, v, 1.8, 'leaddot');
        }
      }
    }
    for (const cg of cov) {
      const r2 = g.sidingLog.find((r) => r.wall === key && r.label === 'closed door gap' && Math.abs(r.ua - (cg[0] - 1)) < 0.1);
      if (r2) for (const pc of r2.pieces) F.rect(pc.u, r2.vbase, pc.u + pc.w, r2.vbase + pc.len, 'tinfill');
    }
  }
  if (mode === 'ply') {
    let k = 0;
    for (let u = a; u < c - 0.5; u += 48) {
      const cw = Math.min(48, c - u);
      const rh = Math.min(96, Rb - PH);
      F.rect(u + 0.1, PH, u + cw - 0.1, PH + rh, 'ply');
      k++;
      F.text(u + cw / 2, PH + rh / 2 + 10, `sheet ${k}\n${ftin(cw)} × ${ftin(rh)}`, { cls: 'ttl' });
    }
    for (const o of ops) F.rect(o.u0, Math.max(o.v0, PH), o.u1, o.v1, 'hole', 'style="fill:var(--panel)"');
    for (const [g0, g1] of cov) { F.rect(g0, 0, g1, PH, 'ply'); F.text((g0 + g1) / 2, PH / 2, `${ftin(g1 - g0)} × ${ftin(PH)}`, { cls: 'note' }); }
  }
  // dimensions: clear bay on top, opening edges along the bottom
  F.dimH(a, c, rt, `${ftin(c - a)} between the columns`, -16);
  const pts = [a, ...ops.flatMap((o) => [o.u0, o.u1]), ...cov.flat(), c].sort((x, y) => x - y);
  for (let i = 0; i + 1 < pts.length; i++) if (pts[i + 1] - pts[i] > 0.5) F.dimH(pts[i], pts[i + 1], 0, null, 22);
  // heights, on the right
  const lv = [[0, 'floor'], [PH, 'top of pony wall'], [Rb, 'underside of ring beam']];
  if (mode === 'frame') {
    for (const o of ops) {
      if (o.type === 'window') lv.push([o.v0, 'top of rough sill']);
      if (o.v1 + 1.5 <= Rb - 1.5) lv.push([o.v1, 'underside of head']);
    }
    for (const b of g.blockLevels) lv.push([b + 0.75, 'top of blocking']);
  }
  const uniq = [];
  for (const l of lv.sort((x, y) => x[0] - y[0])) if (!uniq.some((u) => Math.abs(u[0] - l[0]) < 0.3)) uniq.push(l);
  const ex = inside ? a - C : c + C;
  let lastY = Infinity;
  for (const [v, t] of uniq) {
    const py = Math.min(F.Y(v), lastY - 13);
    lastY = py;
    F.add(`<path d="M${F.X(ex)} ${F.Y(v)}h8L${F.X(ex) + 14} ${py}h4" class="lead"/>`);
    F.add(`<text x="${F.X(ex) + 20}" y="${py}" dominant-baseline="central" class="note"><tspan class="dimt" style="stroke-width:0">${ftin(v)}</tspan> ${t}</text>`);
    tops.push(v);
  }
  const side = inside ? 'Seen from INSIDE.' : 'Seen from OUTSIDE.';
  F.text(inside ? xr : xl, -4, side, { a: 'start', cls: 'note', dy: 36 });
  return F.svg(`${Cap(WALL_NAME[key])} wall bay ${j + 1}`);
}

// pieces of one bay's framing: where to mark them and how long to cut them
function bayTables(d, key, j) {
  const g = d.g;
  const w = g.walls[key];
  const [a] = w.bays[j];
  const members = w.frame.filter((f) => f.bay === j);
  const vert = members.filter((f) => f.v1 - f.v0 > f.u1 - f.u0).sort((x, y) => x.u0 - y.u0 || x.v0 - y.v0);
  const horiz = members.filter((f) => !(f.v1 - f.v0 > f.u1 - f.u0)).sort((x, y) => x.v0 - y.v0 || x.u0 - y.u0);
  const nm = (n) => n.replace(' (fixed to column)', ', against the column').replace('Head (flat 2x4)', 'Head (2x4 laid flat)');
  let h = `<div class="table-wrap"><table class="t g-cut"><thead><tr><th>Upright pieces (2x4)</th><th class="n">Left edge from the left column</th><th class="n">From</th><th class="n">To</th><th class="n">Cut length</th></tr></thead><tbody>`;
  for (const f of vert) h += `<tr><td>${nm(f.name)}</td><td class="n">${ftin(f.u0 - a)}</td><td class="n">${ftin(f.v0)}</td><td class="n">${ftin(f.v1)}</td><td class="n"><b>${ftin(f.v1 - f.v0)}</b></td></tr>`;
  h += `</tbody></table></div><div class="table-wrap" style="margin-top:8px"><table class="t g-cut"><thead><tr><th>Flat pieces (2x4)</th><th class="n">Left end from the left column</th><th class="n">Height of its top</th><th class="n">Cut length</th></tr></thead><tbody>`;
  for (const f of horiz) h += `<tr><td>${nm(f.name)}</td><td class="n">${ftin(f.u0 - a)}</td><td class="n">${ftin(f.v1)}</td><td class="n"><b>${ftin(f.u1 - f.u0)}</b></td></tr>`;
  h += `</tbody></table></div>`;
  return h;
}

// bays with identical framing (relative to the left column) are built the same
function bayGroups(d, keys) {
  const g = d.g;
  const groups = [];
  for (const key of keys) {
    const w = g.walls[key];
    w.bays.forEach(([a, c], j) => {
      const m = w.frame.filter((f) => f.bay === j).map((f) => [f.name, r8(f.u0 - a), r8(f.u1 - a), r8(f.v0), r8(f.v1)].join(','));
      const sig = [r8(c - a), ...m.sort()].join('|');
      let gr = groups.find((x) => x.sig === sig);
      if (!gr) groups.push((gr = { sig, list: [] }));
      gr.list.push({ key, j });
    });
  }
  return groups;
}

function wallSectionFig(d, P) {
  const g = d.g;
  const slab = P.floorSlab === 'yes';
  const { PH, Rb, ringTop, pw, E, p, cos, rd, C, Pt } = g;
  const yT = ringTop + 1.5; // top of the wall plate, above the floor
  const und = (x) => yT + (x - pw) * p;
  const top = (x) => und(x) + rd / cos;
  const xR = 40;
  const F = new Fig({ x0: -E - 4, x1: xR + 2, y0: -16, y1: top(xR) + 6, k: 4.6, pad: [14, 230, 14, 70] });
  // ground and floor
  F.rect(-E - 4, -16, 0, 0 - g.y0, 'earth');
  F.line(-E - 4, -g.y0, 0, -g.y0, 'ground');
  F.rect(0, -16, Pt, PH, 'conc');
  if (slab) {
    F.rect(Pt, -16, xR + 2, -g.T, 'earth');
    F.line(Pt, -g.T, xR + 2, -g.T, 'plasticl');
    F.rect(Pt, -g.T, xR + 2, 0, 'conc');
    F.line(Pt + 3, -g.T / 2, xR + 2, -g.T / 2, 'mesh');
  }
  // infill framing (a stud behind, blocking cut through)
  F.rect(0, PH + 1.5, 3.5, Rb - 1.5, 'wood2');
  F.rect(0, PH, 3.5, PH + 1.5, 'wood');
  F.rect(0, Rb - 1.5, 3.5, Rb, 'wood');
  for (const b of g.blockLevels) F.rect(0, b - 0.75, 3.5, b + 0.75, 'wood');
  F.rect(0, Rb, C, ringTop, 'conc');
  F.rect(0, ringTop, pw, yT, 'wood hl');
  F.line(pw / 2, yT + 1.2, pw / 2, ringTop - 3, 'bolt');
  // siding and plywood
  F.line(-0.3, PH - 1.5, -0.3, Rb, 'tin');
  F.rect(3.5, PH, 3.75, Rb, 'ply');
  // rafter with birdsmouth, fascia, tie
  F.poly([[-E, und(-E)], [0, und(0)], [0, yT], [pw, yT], [xR, und(xR)], [xR, top(xR)], [-E, top(-E)]], 'wood');
  F.rect(-E - 0.75, top(-E) - 5.5, -E, top(-E), 'wood2');
  F.rect(pw - 0.2, yT - 1.4, pw, yT + 3.4, 'steelf');
  F.rect(Pt, yT, xR + 2, yT + 3.5, 'ghost');
  // purlins and roof sheet
  for (const s of g.slopes[0].purlinS) {
    const x = -E + s * cos;
    if (x > xR + 2) continue;
    const yy = top(x);
    const c1 = 1.75 * cos, s1 = 1.75 * Math.sin(Math.atan(p));
    const nx = -Math.sin(Math.atan(p)) * 1.5, ny = cos * 1.5;
    F.poly([[x - c1, yy - s1], [x + c1, yy + s1], [x + c1 + nx, yy + s1 + ny], [x - c1 + nx, yy - s1 + ny]], 'wood2');
  }
  const sh = (x) => top(x) + 1.5 / cos + 0.4;
  F.line(-E - 2, sh(-E - 2), xR + 2, sh(xR + 2), 'tin');
  // labels in a column on the right, heights on the left
  const p1 = -E + g.slopes[0].purlinS[1] * cos;
  const items = [
    { x: xR - 4, y: sh(xR - 4), t: 'roof sheet' },
    { x: p1, y: top(p1) + 0.7, t: 'purlin (2x4 laid flat)' },
    { x: 20, y: und(20) + 2.5, t: `rafter (${g.rafterSize})` },
    { x: -E - 0.4, y: top(-E) - 3, t: 'fascia (1x6)' },
    { x: 30, y: yT + 1.75, t: 'ceiling tie (every other rafter)' },
    { x: pw - 0.1, y: yT + 1.5, t: 'hurricane tie' },
    { x: pw / 2, y: yT - 0.75, t: '2x6 wall plate, wedge anchor' },
    { x: C - 1, y: (Rb + ringTop) / 2, t: 'ring beam' },
    { x: 1.75, y: Rb - 0.75, t: 'top plate, screwed up' },
    { x: 1.75, y: (PH + Rb) / 2 + 9, t: 'stud' },
    ...g.blockLevels.map((b) => ({ x: 1.75, y: b, t: 'blocking' })),
    { x: 3.65, y: PH + 8, t: 'plywood inside' },
    { x: -0.3, y: PH + 14, t: `wall sheet, lapping 1-1/2"\nover the pony wall` },
    { x: 1.75, y: PH + 0.75, t: 'bottom plate, screwed down' },
    { x: Pt / 2, y: PH / 2, t: 'pony wall' },
  ];
  if (slab) items.push({ x: 24, y: -g.T / 2, t: `${inch(g.T)} floor slab, mesh in the middle` });
  F.labels(items, F.X(xR + 2) + 22, 'right');
  F.dimV(0, PH, -E - 4, ftin(PH), -10, { rot: true });
  F.dimV(0, Rb, -E - 4, ftin(Rb), -30, { rot: true });
  F.dimV(0, yT, -E - 4, ftin(yT), -50, { rot: true });
  F.text(-E - 4, 0, 'floor', { a: 'end', cls: 'note', dx: -4, dy: 8 });
  return F.svg('Section through a wall, from the floor to the roof');
}

function rafterFig(g) {
  const { E, pw, p, cos, rd, rafterLen: Lr } = g;
  const tn = p; // tan of the roof angle
  const F = new Fig({ x0: -rd * tn - 6, x1: Lr + 6, y0: -14, y1: rd + 12, w: 760, pad: [40, 16, 56, 16] });
  const A = E / cos - rd * tn; // heel line meets the bottom edge
  const B = A + pw / cos; // end of the seat cut
  const hx = A + pw * p * Math.sin(Math.atan(p));
  const hy = pw * p * cos;
  F.poly([[0, rd], [Lr, rd], [Lr - rd * tn, 0], [B, 0], [hx, hy], [A, 0], [-rd * tn, 0]], 'wood');
  F.text(Lr / 2, rd / 2, `${g.rafterSize} rafter — crown (hump) on this edge ↑`, { cls: 'note' });
  F.dimH(0, Lr, rd, `${ftin(Lr)} along the top edge, long point to long point`, -18);
  F.dimH(-rd * tn, A, 0, ftin(E / cos), 22);
  F.dimH(A, B, 0, ftin(pw / cos), 22, { at: (A + B) / 2 + 8 });
  F.text(-rd * tn, -12, 'tail end: plumb cut', { a: 'start', cls: 'note', dy: 30 });
  F.text(Lr, -12, 'ridge end: plumb cut', { a: 'end', cls: 'note', dy: 30 });
  F.text((A + B) / 2, 0, 'birdsmouth', { cls: 'ttl', dy: 40 });
  return F.svg('Rafter pattern with its cuts and measurements');
}

function birdsmouthFig(g) {
  const { E, pw, p, cos, rd } = g;
  const tn = p;
  const ang = Math.atan(p);
  const A = E / cos - rd * tn;
  const B = A + pw / cos;
  const hx = A + pw * p * Math.sin(ang);
  const hy = pw * p * cos;
  const F = new Fig({ x0: A - 9, x1: B + 9, y0: -3, y1: rd + 2.5, w: 520, pad: [30, 16, 40, 16] });
  F.poly([[A - 9, 0], [A, 0], [hx, hy], [B, 0], [B + 9, 0], [B + 9, rd], [A - 9, rd]], 'wood');
  F.poly([[A, 0], [hx, hy], [B, 0]], 'areafill');
  F.add(`<path d="M${F.X(A)} ${F.Y(0)}L${F.X(A + rd * Math.sin(ang) * 1.05)} ${F.Y(rd * cos * 1.05)}" class="dimx"/>`);
  F.lead((A + hx) / 2, hy / 2, -60, -26, `heel cut: plumb,\n${inch(pw * p)} high`);
  F.lead((hx + B) / 2, hy / 2, 60, -30, `seat cut: level, ${inch(pw)}\n(the width of the plate)`);
  F.dimH(A, B, 0, `${inch(pw / cos)} along the bottom edge`, 20);
  F.text((A + B) / 2, rd - 1, 'cut out the shaded triangle', { cls: 'note' });
  return F.svg('Close-up of the birdsmouth cut');
}

function gableFig(d) {
  const g = d.g;
  const D = d.D;
  const { E, R, pw, p, cos, rd, PH, Rb, ringTop } = g;
  const yT = ringTop + 1.5;
  const und = (z) => yT + (Math.min(z, D - z) - pw) * p;
  const top = (z) => und(z) + rd / cos;
  const ridge = g.ridgeTop - g.y0;
  const F = new Fig({ x0: -E - 10, x1: D + E + 10, y0: -6, y1: ridge + 14, w: 760, pad: [16, 14, 40, 14] });
  F.rect(0, 0, D, PH, 'conc');
  F.rect(0, PH, g.C, Rb, 'conc');
  F.rect(D - g.C, PH, D, Rb, 'conc');
  for (const [a, c] of g.walls.left.cols.slice(1, -1)) F.rect(a, PH, c, Rb, 'conc');
  F.rect(0, Rb, D, ringTop, 'conc');
  F.rect(0, ringTop, D, yT, 'wood2');
  F.line(-E - 10, 0, D + E + 10, 0, 'ground');
  for (const gs of g.walls.left.gable) F.rect(gs.u - 0.75, gs.v0, gs.u + 0.75, gs.v1, 'wood hl');
  // end rafters, ridge board, tie
  F.poly([[-E, und(-E)], [0, und(0)], [0, yT], [pw, yT], [g.zr, und(g.zr)], [g.zr, top(g.zr)], [-E, top(-E)]], 'wood');
  F.poly([[D + E, und(-E)], [D, und(0)], [D, yT], [D - pw, yT], [D - g.zr, und(g.zr)], [D - g.zr, top(g.zr)], [D + E, top(-E)]], 'wood');
  F.rect(D / 2 - 0.75, ridge - 5.5, D / 2 + 0.75, ridge, 'wood2');
  F.rect(0, yT, D, yT + 3.5, 'ghost');
  for (const sl of g.slopes) for (const s of sl.purlinS) {
    const z = -E + s * cos;
    for (const zz of sl.key === 'back' ? [z] : [D - z]) F.rect(zz - 1.75, top(z), zz + 1.75, top(z) + 1.5, 'wood2');
  }
  F.dimH(-E, 0, top(-E), ftin(E), -14);
  F.dimH(0, D, 0, ftin(D), 26);
  F.dimV(0, yT, D + E + 4, `${ftin(yT)} top of plate`, 4);
  F.dimV(yT, ridge, D * 0.68, `${ftin(ridge - yT)} plate to top of ridge`, 4);
  F.text(D / 2, ridge, 'ridge board (2x6)', { cls: 'note', dy: -10 });
  F.text(D / 2, yT + 6, 'ceiling tie (dashed)', { cls: 'note' });
  F.text(D * 0.25, (yT + und(D * 0.25)) / 2 + 4, 'gable studs', { cls: 'ttl' });
  return F.svg('Gable end: rafters, ridge, gable studs and purlins');
}

// distance along the top of a rafter from the outside face of the fascia
const fromFascia = (g, s) => s - 1.75 + 0.75 / g.cos;
function purlinFig(g) {
  const sl = g.slopes[0];
  const f = 0.75 / g.cos;
  const Lt = sl.top + f;
  const F = new Fig({ x0: -4, x1: Lt + 4, y0: -12, y1: 7, w: 760, pad: [18, 14, 30, 14] });
  F.rect(f, 0, Lt, 3.3, 'wood');
  F.rect(0, -2.5, f, 3.3, 'wood2');
  F.text(Lt / 2 + 6, 1.4, 'top of a rafter: the tail on the left, the middle of the ridge on the right', { cls: 'note' });
  F.text(f / 2, -2.5, 'fascia', { cls: 'note', dy: 12 });
  for (const s of sl.purlinS) {
    const x = fromFascia(g, s);
    F.rect(x, 3.3, x + 3.5, 5.2, 'wood hl');
    F.line(x, 5.2, x, -4, 'mark');
    F.text(x, -8, ftin(x), { cls: 'dimt' });
  }
  F.line(Lt, -4, Lt, 6, 'dimx');
  F.text(0, -8, '0', { cls: 'dimt' });
  return F.svg('Purlin positions measured along the rafter');
}

function roofSheetFig(d, P) {
  const g = d.g;
  const W = d.W;
  const sl = g.slopes[1];
  const L = sl.Ls;
  const x0 = -g.R, x1 = W + g.R;
  const F = new Fig({ x0: x0 - 10, x1: x1 + 10, y0: -18, y1: L + 22, w: 760, flip: true, pad: [10, 10, 10, 10] });
  F.rect(x0, 0, x1, L, 'ghost');
  for (let i = 0; i < g.nCols; i++) {
    const xi = x0 + i * P.tinCover;
    const wi = Math.min(g.tinW, x1 - xi);
    if (wi < 4) continue;
    F.rect(xi, 0, xi + wi, L, 'tinfill', `style="fill-opacity:${0.18 + (i % 2) * 0.16}"`);
    F.text(xi + wi / 2, L / 2, `${i + 1}`, { cls: 'ttl' });
  }
  const run = sl.run;
  if (run.length > 1) for (const pc of run.slice(1)) F.line(x0, pc.start, x1, pc.start, 'diag');
  for (const s of sl.purlinS) {
    const y = s - 2; // sheet starts 2" past the tail
    F.line(x0, L - y, x1, L - y, 'dimx');
  }
  F.text((x0 + x1) / 2, -10, `eave (fascia): sheets overhang it by 2"`, { cls: 'note' });
  F.text((x0 + x1) / 2, L + 12, 'ridge', { cls: 'note' });
  F.text(x0, L / 2, 'start\nhere →', { a: 'end', cls: 'ttl', dx: -2 });
  return F.svg('Sheet layout on one roof slope');
}

function slabFig(d, P) {
  const g = d.g;
  const T = g.T;
  const F = new Fig({ x0: -12, x1: 36, y0: -T - 10, y1: 12, k: 8, pad: [12, 300, 12, 12] });
  F.rect(-12, -T - 10, 0, -g.y0, 'earth');
  F.line(-12, -g.y0, 0, -g.y0, 'ground');
  F.rect(0, -T - 10, g.Pt, 12, 'conc');
  F.rect(g.Pt, -T - 10, 36, -T, 'earth');
  F.line(g.Pt, -T, 36, -T, 'plasticl');
  F.line(g.Pt, -T, g.Pt, -T + 3, 'plasticl');
  F.rect(g.Pt, -T, 36, 0, 'conc', 'style="fill-opacity:.55"');
  F.line(g.Pt + 3, -T / 2, 36, -T / 2, 'meshl');
  for (let x = g.Pt + 3; x < 36; x += 6) F.line(x, -T / 2 - 0.25, x, -T / 2 + 0.25, 'meshl');
  F.rect(20, -T, 22, -T / 2 - 0.2, 'conc');
  F.line(g.Pt, 0, 36, 0, 'mark');
  F.labels([
    { x: g.Pt / 2, y: 6, t: 'pony wall' },
    { x: 30, y: 0, t: 'finished floor: a chalk line on the pony wall' },
    { x: 28, y: -T / 2, t: 'wire mesh, in the middle of the slab' },
    { x: 21, y: -T + 0.4, t: 'a stone or piece of block holds it up' },
    { x: 33, y: -T, t: '6-mil plastic, turned up the wall' },
    { x: 30, y: -T - 5, t: 'compacted fill' },
  ], F.X(36) + 20, 'right');
  F.dimV(-T, 0, g.Pt + 3, inch(T), 0, { side: 'right' });
  return F.svg('Section through the edge of the floor slab');
}

function rafterPlanFig(d) {
  const g = d.g;
  const xs = g.rafterXs;
  const show = xs.slice(0, Math.min(5, xs.length));
  const xmax = show[show.length - 1] + 14;
  const F = new Fig({ x0: -6, x1: xmax, y0: -12, y1: 12, w: 760, flip: false, pad: [26, 10, 26, 10] });
  F.rect(0, -2.75, xmax, 2.75, 'wood2');
  F.text(xmax - 2, 2.75, '2x6 plate on the ring beam, seen from above. × = the side of the line the rafter goes', { a: 'end', cls: 'note', dy: -74 });
  for (const x of show) {
    F.rect(x - 0.75, -2.75, x + 0.75, 2.75, 'wood hl');
    F.text(x + 0.75, 0, '×', { a: 'start', cls: 'ttl', dx: 1 });
  }
  F.dimH(0, show[0] + 0.75, -2.75, inch(show[0] + 0.75), -12);
  for (let i = 1; i < show.length; i++) F.dimH(show[i - 1], show[i], 2.75, `${inch(show[i] - show[i - 1])} o.c.`, 14);
  F.text(0, 2.75, 'end of the wall', { a: 'start', cls: 'note', dy: 40 });
  return F.svg('Marking the rafter positions on the plate');
}

// ---------------------------------------------------------------- the guide
export function renderHouseGuide(host, { d, P, bom }) {
  const g = d.g;
  const q = d.q;
  const i = d.info;
  const W = d.W, D = d.D;
  const slab = P.floorSlab === 'yes';
  const clad = P.cladding === 'pvc' ? 'PVC' : 'metal';
  const buy = (k) => bom.lines.find((l) => l.key === k)?.buy || 0;
  const lumber = (re) => {
    const rows = new Map();
    for (const l of q.lumber) {
      if (!re.test(l.label)) continue;
      const k = `${l.label}|${l.size}|${r8(l.len)}`;
      const r = rows.get(k) || { label: l.label, size: l.size, len: r8(l.len), n: 0 };
      r.n++;
      rows.set(k, r);
    }
    return [...rows.values()].sort((a, b) => a.label.localeCompare(b.label) || b.len - a.len);
  };
  const cutList = (re, title = 'Cut list') => {
    const rows = lumber(re);
    if (!rows.length) return '';
    return `<div class="table-wrap"><table class="t g-cut"><thead><tr><th>${title}</th><th>Size</th><th class="n">Pieces</th><th class="n">Length</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${r.label}</td><td>${r.size}</td><td class="n">${r.n}</td><td class="n"><b>${ftin(r.len)}</b></td></tr>`).join('')}</tbody></table></div>`;
  };
  const allOps = Object.values(g.walls).flatMap((w) => w.openings.map((o) => ({ ...o, wall: w.key })));
  const nWin = i.nWin;
  const nDoors = i.nDoors;
  const nPairs = g.rafterXs.length;
  const firstWin = allOps.find((o) => o.type === 'window' && o.wall === 'front') || allOps.find((o) => o.type === 'window');
  const firstDoor = allOps.find((o) => o.type === 'door' && o.wall === 'front') || allOps.find((o) => o.type === 'door');
  const yT = g.yTop; // world top of the wall plate

  // ---------------------------------------------------------- 3D pictures
  const whole = { min: [-g.R, 0, -g.E], max: [W + g.R, i.ridgeHeight, D + g.E] };
  const walls = { min: [0, 0, 0], max: [W, g.y0 + g.ringTop, D] };
  const shots = [
    { id: 'overview', step: STEP.DONE, box: whole, dir: [0.62, 0.42, 1] },
    { id: 'site', step: STEP.SITE, box: walls, dir: [0.62, 0.6, 1] },
    { id: 'floor1', step: STEP.FLOOR_PREP, box: walls, dir: [0.35, 1.25, 0.8] },
    { id: 'floor2', step: STEP.FLOOR, box: walls, dir: [0.35, 1.25, 0.8] },
    { id: 'plates', step: STEP.PLATES, box: walls, dir: [0.62, 0.7, 1] },
    { id: 'plates-close', step: STEP.PLATES, box: { min: [W - 56, g.y0 + g.Rb - 4, D - 34], max: [W + 2, yT + 3, D + 2] }, dir: [0.75, 0.9, 1] },
    { id: 'walls-long', step: STEP.WALL_LONG, box: walls, dir: [0.62, 0.5, 1] },
    { id: 'walls-ends', step: STEP.WALL_ENDS, box: walls, dir: [-0.9, 0.5, 0.8] },
    { id: 'roof', step: STEP.ROOF_FRAME, box: whole, dir: [0.62, 0.75, 1] },
    { id: 'purlins', step: STEP.PURLINS, box: whole, dir: [0.62, 0.75, 1] },
    { id: 'roofing', step: STEP.ROOFING, box: whole, dir: [0.62, 0.8, 1] },
    { id: 'roofing-close', step: STEP.ROOFING, box: { min: [W - 30, yT - 6, D - 16], max: [W + g.R + 4, yT + 22, D + g.E + 6] }, dir: [0.9, 0.9, 1] },
    { id: 'siding', step: STEP.SIDING, box: whole, dir: [0.62, 0.42, 1] },
    { id: 'windows', step: STEP.WINDOWS, box: whole, dir: [-0.62, 0.42, 1] },
    { id: 'doors', step: STEP.DOOR, box: whole, dir: [0.62, 0.42, 1] },
    { id: 'done', step: STEP.DONE, box: whole, dir: [-0.75, 0.4, -1] },
  ];
  // close-ups along a wall
  const wallShot = (id, step, key, u0, u1, v0, v1, o = {}) => {
    const [xa, za] = wallXZ(d, key, u0, -4);
    const [xb, zb] = wallXZ(d, key, u1, (o.depth ?? 6));
    const n = NORMAL[key];
    const side = o.side ?? 0.25;
    const dir = o.inside ? [-n[0] + n[2] * side, o.up ?? 0.12, -n[2] - n[0] * side] : [n[0] + n[2] * side, o.up ?? 0.12, n[2] - n[0] * side];
    shots.push({
      id, step, dir, box: { min: [Math.min(xa, xb), g.y0 + v0, Math.min(za, zb)], max: [Math.max(xa, xb), g.y0 + v1, Math.max(za, zb)] },
      hide: o.hide,
    });
  };
  const fw = g.walls.front;
  const [fa, fc] = fw.bays[0];
  wallShot('bay-close', STEP.WALL_LONG, 'front', fa - g.C, fc + g.C, -2, g.ringTop + 2, { hide: (p) => p.pos && p.pos[2] < D - 24 && p.kind !== 'inst', side: 0.15, up: 0.3 });
  if (firstWin) wallShot('win-close', STEP.WINDOWS, firstWin.wall, firstWin.u0 - 14, firstWin.u1 + 14, firstWin.v0 - 14, firstWin.v1 + 12, { side: 0.3 });
  if (firstDoor) wallShot('door-close', STEP.DOOR, firstDoor.wall, firstDoor.u0 - 16, firstDoor.u1 + 16, -2, firstDoor.v1 + 14, { side: 0.35 });
  const bw = g.walls.back;
  const jb = bw.bays.findIndex((_, j) => bw.openings.some((o) => o.type === 'window' && o.u0 >= bw.bays[j][0] && o.u1 <= bw.bays[j][1]));
  const [ba, bc] = bw.bays[Math.max(0, jb)];
  wallShot('ply-close', STEP.INTERIOR, 'back', ba - g.C, bc + g.C, -2, g.ringTop + 2, { inside: true, side: 0.1, up: 0.1, depth: 30 });
  const xr = g.rafterXs[2] ?? g.rafterXs[1];
  shots.push({ id: 'seat-close', step: STEP.ROOF_FRAME, dir: [0.55, 0.3, -1], box: { min: [xr - 13, g.y0 + g.Rb - 2, D - 16], max: [xr + 13, yT + 9, D + 1] } });
  const xm = g.rafterXs[Math.floor(nPairs / 2)];
  shots.push({ id: 'ridge-close', step: STEP.ROOF_FRAME, dir: [0.55, -0.35, 0.9], box: { min: [xm - 34, g.ridgeTop - 24, D / 2 - 32], max: [xm + 34, g.ridgeTop + 2, D / 2 + 32] } });

  // ---------------------------------------------------------- text
  const wallBayCount = Object.values(g.walls).reduce((s, w) => s + w.bays.length, 0);
  const tools = [
    ['Tape measures', 'two 25\' tapes, and a 100\' tape for the diagonals'],
    ['Chalk line and pencils', 'carpenter\'s pencils and a marker'],
    ['Speed square', 'for square cuts and the roof angle'],
    ['Levels', 'a 4\' level and a short one'],
    ['String line and line level', 'for long straight lines'],
    ['Circular saw', '7-1/4", with spare blades'],
    ['Handsaw', 'to finish cuts the circular saw can\'t reach'],
    [clad === 'PVC' ? 'Fine-tooth saw blade' : 'Tin snips', clad === 'PVC' ? 'for cutting the PVC sheets' : 'left- and right-cut aviation snips for the metal sheets'],
    ['Two framing hammers', '20 oz, and a pry bar'],
    ['Hammer drill', 'with 3/16" and 1/2" masonry bits (buy spares)'],
    ['Drill/driver', 'with a 5/16" hex nut driver for the roofing screws'],
    ['Wrench or socket', '3/4" for the 1/2" wedge anchors'],
    ['Caulk gun', 'for the sealant'],
    ['Ladders and sawhorses', 'two stepladders, one long ladder, two sawhorses, some planks'],
    ['Power', 'a small generator and extension cords, or cordless tools with spare batteries'],
    ...(slab ? [['Concrete tools', 'shovels, a mixing tub or wheelbarrow, a hoe, six 5-gal buckets, a hand tamper, a straight 8\' 2x4, a wood float'], ['Water', 'a drum of fresh water for mixing and curing']] : []),
    ['Safety gear', 'safety glasses, ear protection, work gloves, dust masks, rubber gloves for concrete, a first-aid kit'],
  ];
  const gloss = [
    ['Pony wall', `the low concrete wall (${ftin(g.PH)} high) around the edge of the floor`],
    ['Column', `one of the ${i.columns} concrete posts (${inch(g.C)} square)`],
    ['Ring beam', 'the concrete beam on top of the columns, all the way round'],
    ['Bay', 'the space between two columns; each one gets its own wood frame'],
    ['Plate', 'a flat board screwed or bolted to the concrete that the other pieces are nailed to'],
    ['Stud', 'an upright 2x4 in a wall frame'],
    ['On centre (o.c.)', 'measured from the middle of one piece to the middle of the next'],
    ['King stud', 'the full-height stud each side of a window or door'],
    ['Head / rough sill', 'the flat 2x4 above / below a window opening'],
    ['Cripple', 'a short stud above a head or below a sill'],
    ['Blocking', 'short flat 2x4s between studs that the wall sheets are screwed to'],
    ['Rough opening', 'the hole you frame for a window or door, a little bigger than it'],
    ['Rafter', 'a sloping roof board running from the wall to the top of the roof'],
    ['Ridge board', 'the board at the very top that the rafters lean against'],
    ['Birdsmouth', 'the notch cut in a rafter so it sits flat on the wall plate'],
    ['Plumb / level', 'exactly vertical / exactly horizontal'],
    ['Square', 'at a perfect right angle (90°)'],
    ['Eave / gable', 'the low edge of the roof / the triangle of wall at each end'],
    ['Fascia', 'the board nailed across the ends of the rafters'],
    ['Purlin', 'a 2x4 laid flat across the rafters; the roof sheets screw to these'],
    ['Ceiling tie', 'a 2x4 across the house from wall to wall that stops the walls being pushed apart'],
    ['Hurricane tie', 'a bent steel bracket that ties each rafter down to the plate'],
    ['Crest / valley', 'the high / low parts of a corrugated sheet'],
    ['Lap', 'where one sheet overlaps the next'],
    ['Toenail', 'a nail driven at a slant through the side of one board into another'],
    ['Crown', 'the slight curve along most boards; put the hump up'],
  ];

  const parts = [];
  // ----- part 0
  parts.push({
    id: 'start', title: 'Before you start', intro: 'Read this part once all the way through before you buy anything or pick up a tool.',
    steps: [
      { title: 'How to use this guide', html: `<p>This guide takes you from the bare concrete frame to a finished house, one step at a time. It is written for someone who has never built anything, so it explains every word and every cut. All the numbers are worked out from your design: if you change a size in the sidebar, the guide changes with it.</p>
        ${ul([
          'Work through the parts <b>in order</b>. Each one needs the one before it.',
          'Read a whole step before you start it, and get everything you need ready first.',
          'In the 3D pictures, <b>the parts in orange are the ones you add in that step</b>.',
          'Every drawing marks its measurements. Where the guide says <i>measure in place</i>, do it: the concrete is never exactly where the drawing says, so cut each piece to fit what is really there.',
          'Tick <b>Done</b> on each step as you finish it, so the team knows where you are.',
          'The <b>Bill of Materials</b> page lists everything to buy, and shows how to cut every board from 16\' lumber with the least waste.',
        ])}
        ${tip('Two people can do almost all of this. Have three or four for the floor pour and for lifting the ridge board and the roof sheets.')}` },
      { title: 'What you are building', html: `<p>The concrete is already there: the outline, the pony walls, ${i.columns} columns and the ring beam on top. You will add:</p>
        ${ol([
          slab ? `a ${inch(g.T)} concrete floor inside the pony walls;` : null,
          'a 2x6 wood plate bolted on top of the ring beam;',
          `a wood frame in each of the ${wallBayCount} bays between the columns, with ${plural(nWin, 'window')} and ${plural(nDoors, 'door')};`,
          `the roof: ${plural(nPairs * 2, 'rafter')} on the plate, purlins across them and ${clad} sheets on top;`,
          `${clad} sheets on the outside of the walls and ${PLY[P.wallPly].name} on the inside.`,
        ])}
        ${figs(shotFig('overview', `<b>The finished house</b>, ${ftin(W)} × ${ftin(D)}.`))}${figs(figure(wallSectionFig(d, P), '<b>Section through a wall</b>: how all the layers fit together, from the floor to the roof. Heights on the left are from the floor.', 'wide'))}` },
      { title: 'Tools', html: `<p>Get these together before you start. Most of the work is cutting, nailing and drilling into concrete.</p><div class="g-tools">${tools.map(([a, b]) => `<div><b>${a}</b><span>${b}</span></div>`).join('')}</div>` },
      { title: 'Stay safe', html: ul([
        '<b>Eyes:</b> wear safety glasses when you drill concrete, cut metal or hammer nails. Chips fly.',
        '<b>Wet cement burns skin.</b> Wear rubber gloves and long sleeves, and wash it off with fresh water straight away. Rinse eyes for 15 minutes if it splashes.',
        '<b>Saws:</b> support the board on both sides of the cut so it doesn\'t pinch the blade, keep your hands away from the line of the cut, and unplug the saw to change a blade.',
        '<b>Ladders:</b> on firm, flat ground, the foot about one quarter of the height out from the wall, and someone holding it.',
        '<b>On the roof:</b> step only where there is a rafter or purlin under you, never between them. Don\'t work on the roof in wind or rain: a sheet catches wind like a sail, and wet metal is slippery. Metal edges are razor-sharp, so wear gloves.',
        '<b>Heat:</b> drink plenty of water, work in the early morning and late afternoon, and rest in the shade.',
        '<b>Storms:</b> if a typhoon warning comes while you are building, tie down or stack and weigh down every loose sheet and board, and don\'t leave roof sheets in place without all their screws.',
      ]) },
      { title: 'Words you will see', html: `<div class="g-gloss">${gloss.map(([a, b]) => `<div><b>${a}</b>: ${b}</div>`).join('')}</div>
        ${figs(figure(lumberSizes(), '<b>Lumber sizes.</b> A "2x4" is really 1-1/2" × 3-1/2".'), figure(openingFraming(), '<b>The parts of a wall frame</b> around a window.'))}` },
      { title: 'Measuring, marking and cutting', html: `${ol([
        'Hook the end of the tape on the board, pull it straight and mark the length with a small "V". The point of the V is the measurement.',
        'Put the speed square against the edge of the board, at the point of the V, and draw a line across.',
        'Draw an X on the side you will throw away (the waste side).',
        'Cut with the blade on the waste side of the line, just touching it. Let the saw reach full speed before it touches the wood, and don\'t force it.',
        'For lots of pieces the same length, cut one, check it fits, then use it to mark the others.',
      ])}${figs(figure(measureMark(), 'Mark with a V, square a line across, cut on the waste side.'))}` },
      { title: 'Nailing', html: `<p>You will use three kinds of nail: <b>16d (3-1/2")</b> for framing, <b>8d (2-1/2")</b> for trim, fascia and doors, and short <b>1-1/4" panel nails</b> for the plywood. All are galvanised, so they don't rust in the salt air.</p>
        ${ol([
          'Hold the nail near its point and tap it until it stands up by itself. Then let go and drive it with full swings, watching the nail head, not the hammer.',
          '<b>Face nail</b> when one board lies flat on another: straight through.',
          '<b>End nail</b> through the side of one board into the end of another: two nails.',
          '<b>Toenail</b> when a stud stands on a plate that is already fixed: start the nail about 1" up from the end of the stud and drive it at a slant (about 60°) so it goes through the stud and into the plate. Three toenails at each end: one in each side and one in the face.',
          'If a nail bends, pull it out with the claw and use a new one a little to one side.',
        ])}${figs(figure(nailing(), 'Face nail, end nail and toenail.'))}` },
      { title: 'Fixing wood to concrete', html: `<p>The wood is held to the concrete in two ways:</p>
        ${ul([
          `<b>Concrete screws</b> (1/4" × 3-1/4", about ${num(q.screws)} in all) hold the wall frames to the pony walls, columns and ring beam. Drill through the wood into the concrete with a <b>3/16" masonry bit</b> with the drill on its hammer setting, at least 2-1/4" into the concrete. Blow the dust out of the hole, then drive the screw until it is snug. Stop there: if you keep going it strips the thread it has cut in the concrete.`,
          `<b>Wedge anchors</b> (1/2" × 5", ${q.wedge} of them) bolt the 2x6 plate to the top of the ring beam. They are stronger, because the roof hangs on them in a storm.`,
          'Put a strip of plastic between wood and concrete everywhere they touch. Concrete stays damp, and wood that sits on it rots.',
        ])}${figs(figure(concreteScrew(), 'A concrete screw: drill, clean the hole, drive.'), figure(wedgeAnchor(), 'A wedge anchor: drill, tap it in, tighten.'))}
        ${warn('Wear safety glasses and a dust mask when drilling concrete. Hold the drill with both hands: if the bit jams, the drill twists hard.')}` },
      { title: 'Level, plumb and square', html: `<p>Three checks keep everything straight. Use them all the time.</p>
        ${ul([
          '<b>Level</b> (horizontal): put the level on the piece; the bubble should sit between the two lines.',
          '<b>Plumb</b> (vertical): hold the level against the side and the front of a stud.',
          '<b>Square</b> (a right angle): measure both diagonals of a rectangle. If they are the same, it is square. For a single corner, mark 3\' along one side and 4\' along the other: they should be exactly 5\' apart.',
        ])}${figs(figure(levelPlumb(), 'Level and plumb.'), figure(squareCheck(), 'Square: equal diagonals, or 3-4-5.'))}` },
    ],
  });

  // ----- part 1
  const bayRows = Object.values(g.walls).map((w) => `<tr><td><b>${Cap(WALL_NAME[w.key])} wall</b></td>${w.bays.map(([a, c]) => `<td class="n">${ftin(c - a)}</td>`).join('')}</tr>`).join('');
  parts.push({
    id: 'check', title: 'Check the concrete and get ready', intro: 'Before you order anything, make sure the concrete really is the size the design says.',
    steps: [
      { title: 'Measure the concrete frame', html: `<p>The design assumes the frame below. Measure each of these on site and write the real numbers down.</p>
        ${figs(figure(planFig(d), '<b>Plan of the concrete frame</b>, seen from above. The numbers outside the walls are the bays; the small figures are the clear width between the columns.'), shotFig('site', '<b>What is already there</b>: outline, pony walls, columns and ring beam.'))}
        ${ol([
          `<b>Outside size:</b> ${ftin(W)} along the front and back, ${ftin(D)} along the ends.`,
          `<b>Diagonals:</b> from the outside of one corner to the outside of the opposite corner, both ways. Both should be ${ftin(i.diag)}. If they differ by more than an inch, the frame is out of square; the infill still works because each bay is measured separately.`,
          `<b>Clear width of every bay</b>, between the faces of the columns, at the bottom and at the top:<div class="table-wrap" style="margin:6px 0"><table class="t g-cut"><thead><tr><th>Wall</th>${g.walls.front.bays.map((_, j) => `<th class="n">Bay ${j + 1}</th>`).join('')}</tr></thead><tbody>${bayRows}</tbody></table></div>Bays are numbered from left to right as you stand outside facing the wall.`,
          `<b>Heights</b>, from the floor (the concrete at the bottom of a door gap): pony walls ${ftin(g.PH)}, underside of the ring beam ${ftin(g.Rb)}, top of the ring beam ${ftin(g.ringTop)}.`,
          `<b>Door gaps</b> in the pony wall: where they are and how wide (the design needs ${ftin(g.doorRO.w)} for each door).`,
          '<b>Ring beam top</b>: run a string along it, or lay the level on it every few feet. The roof sits on it, so note any high or low spots.',
        ])}
        ${tip('If any number is more than about 1/2" different, change it in the sidebar under <b>Existing concrete</b> (or Size), and this guide, the drawings and the bill of materials all update.')}` },
      { title: 'Buy, ship and store the materials', html: `${ol([
        'Print the <b>Bill of Materials</b> and order from it. The <b>Shipping Layout</b> page shows how to bundle it all for the ferry.',
        'When it arrives, count everything against the list before the boat leaves.',
        'Stack lumber flat, off the ground on scraps of wood, under a tarp or roof, so it doesn\'t twist or rot. Put a board across the top and weigh it down.',
        `Keep cement off the ground and dry: sea air and rain make it go hard in the bag. ${slab ? 'Buy it as close to the pour as you can.' : ''}`,
        `Lay the ${clad} sheets flat on boards so they don't kink, and tie them down: the wind can carry them.`,
        'Keep nails and screws in sealed buckets.',
      ])}${check(['All materials counted and stored dry and off the ground.', 'Tools gathered and working; spare saw blades and masonry bits.', 'Measurements of the concrete written down and entered in the sidebar.'])}` },
    ],
  });

  // ----- part 2: floor
  if (slab) {
    const bags = buy('cement');
    parts.push({
      id: 'floor', title: 'Pour the floor', intro: `A ${inch(g.T)} concrete slab inside the pony walls. The walls act as the form, so there is no formwork to build.`,
      steps: [
        { title: 'Fill and compact the ground', html: `${need([`sand or crushed coral fill: enough to cover the ${num(i.floorArea)} sq ft floor up to ${inch(g.T)} below the finished floor`, 'a hand tamper', 'a chalk line and a level (or a clear hose filled with water, as a water level)'])}
          ${ol([
            'Find the <b>finished floor</b> height: it is the top of the concrete at the bottom of the door gaps.',
            'Snap a level chalk line all the way round the inside of the pony walls at that height.',
            `Fill inside the walls with sand or crushed coral, in layers about 4" deep. Wet each layer and tamp it hard until your foot leaves almost no mark.`,
            `Stop when the fill is ${inch(g.T)} below the chalk line everywhere. Check with a tape from the line every few feet.`,
          ])}
          ${figs(figure(slabFig(d, P), `<b>Edge of the floor.</b> The slab is ${inch(g.T)} thick with the wire mesh in its middle.`, 'wide'))}` },
        { title: 'Lay the plastic and wire mesh', html: `${need([`${buy('plastic')} roll${buy('plastic') === 1 ? '' : 's'} of 6-mil plastic`, `${q.mesh.length} strips of 6" × 6" wire mesh, ${ftin(q.mesh[0] || 0)} long (from ${plural(buy('mesh'), 'roll')})`, 'tie wire and pliers, bolt cutters or a hacksaw', 'small stones or pieces of block about 2" high'])}
          ${ol([
            'Spread the plastic over the fill. Overlap the joints by 12" and run it a few inches up the pony walls. Don\'t tear it.',
            `Roll out the mesh in strips ${g.meshDir === 'x' ? 'along the length of the house' : 'across the house'}, keeping it 3" in from the walls. Flatten each strip by walking it out and bending it back against its curl.`,
            'Overlap neighbouring strips by one square (6") and tie the overlap with tie wire about every 2\'.',
            `Set the mesh on stones or block pieces about ${inch(g.T / 2)} high, every 3\' or so, so it ends up in the middle of the slab. Mesh lying on the plastic does nothing.`,
          ])}
          ${figs(shotFig('floor1', '<b>Plastic and mesh</b> laid inside the pony walls.'))}` },
        { title: 'Mix and pour the concrete', html: `${need([`${plural(bags, 'bag')} of cement`, `about ${num(bags * 2)} ft³ of clean sand and ${num(bags * 3)} ft³ of gravel or crushed coral`, `about ${num(bags * 6)} gal of fresh water`, '4 to 6 people for the day'])}
          ${ol([
            `This is ${num(i.concreteFt3)} ft³ of concrete. Plan to do it in one day, starting early, and have every bag, bucket and tool ready first.`,
            'Rinse beach sand and coral with fresh water before you use them if you can. Salt rusts the mesh.',
            'Mix one batch: 1 bucket of cement, 2 of sand, 3 of gravel. Mix them dry until the colour is even, then add water a little at a time until it is like thick oatmeal. Each bag of cement makes about 3.7 ft³.',
            'Start in the corner farthest from a door and work back toward it, so you never have to walk on wet concrete.',
            'Fill a strip about 4\' wide a little above the chalk line. Pull the mesh up into the middle of the concrete with a rake or hook as you go.',
            'Lay a straight 8\' 2x4 across the wet concrete with its ends at the chalk line and pull it toward you in a sawing motion (this is <i>screeding</i>). Fill the low spots and screed again.',
            'When the water on top has gone (30 to 60 minutes), smooth the surface with the wood float in sweeping arcs.',
            'If you can\'t finish in one day, stop against a straight board on edge and continue from it the next morning.',
          ])}
          ${figs(figure(concreteMix(), 'Measure everything with the same bucket.'), shotFig('floor2', '<b>The floor slab</b>, poured and smoothed.'))}
          ${warn('Rubber gloves and boots. Wet concrete burns skin if it stays on it.')}` },
        { title: 'Let it cure', html: `${ol([
          'Keep the slab wet for 7 days: cover it with plastic or wet sacks and sprinkle it morning and evening. Concrete that dries out too fast cracks and stays weak.',
          'You can walk on it carefully after a day. Wait 3 days before you stack material on it or start the walls.',
        ])}${check(['The floor is smooth and flat, with no puddles when you pour a bucket of water on it.', 'It has been kept wet for a week.'])}` },
      ],
    });
  }

  // ----- part 3: plate on the ring beam
  const plateRows = Object.values(g.walls).map((w) => `<tr><td><b>${Cap(WALL_NAME[w.key])}</b></td><td>${w.plate.map(([s, e]) => ftin(e - s)).join(' + ')}</td><td class="n">${w.anchors.length}</td></tr>`).join('');
  const rafterMarks = g.rafterXs.map((x) => ftin(x)).join(', ');
  parts.push({
    id: 'plates', title: 'Wall plate on the ring beam', intro: 'A 2x6 laid flat on top of the ring beam, all the way round. The rafters sit on it, and in a storm it holds the roof down.',
    steps: [
      { title: 'Mark where the rafters go', html: `<p>The anchor bolts must not be where a rafter will sit, so mark the rafter positions first.</p>
        ${ol([
          'Stand outside the front wall. On the top of the ring beam, measure from the left end of the front wall and make a pencil mark at each of these distances. Each mark is the <b>middle</b> of a rafter:',
          `<span class="muted">${rafterMarks}</span>`,
          'Do the same on the back wall, measuring from the <b>same end of the house</b> (the left end when you face the front, which is the right end when you face the back). The rafters on the two walls must line up across the house.',
          'Draw a square line across the beam at each mark, and an X beside it to show which side of the line the rafter goes.',
        ])}${figs(figure(rafterPlanFig(d), `<b>Rafter layout</b>: the first rafter is flush with the end of the wall, then every ${inch(P.rafterSpacing)} on centre.`))}` },
      { title: 'Cut and lay the plates', html: `${need([`2x6 lumber, cut as below`, 'a strip of plastic as long as the plates, about 6" wide'])}
        <div class="table-wrap"><table class="t g-cut"><thead><tr><th>Wall</th><th>Plate pieces (2x6)</th><th class="n">Wedge anchors</th></tr></thead><tbody>${plateRows}</tbody></table></div>
        ${ol([
          'The front and back plates run the full length of the house. The end-wall plates fit between them.',
          'Lay a strip of plastic on the ring beam, then the plate on top, its outside edge flush with the outside face of the beam.',
          'Joints between pieces should butt tightly. Copy the rafter marks up onto the plates.',
          'Check the top of the plate with a level and a string. If the beam is low in places, pack under the plate with mortar or hardwood packers so the plate is straight and level.',
        ])}` },
      { title: 'Bolt the plates down', html: `${ol([
        `Drill a 1/2" hole through the middle of the plate width and 3-1/2" into the concrete: one hole 4" from each end of every piece, and the rest evenly spaced no more than 32" apart. Keep each hole at least 2" away from a rafter mark.`,
        'Blow the dust out of each hole.',
        'Put the washer and nut on a wedge anchor, with the nut flush with the top of the anchor so you don\'t hammer the thread.',
        'Tap the anchor down through the plate until the washer touches the wood.',
        'Tighten the nut with a wrench 3 to 4 turns past finger-tight. This pulls the wedge up and locks the anchor in the concrete.',
      ])}
      ${figs(shotFig('plates', '<b>Wall plates</b> on the ring beam, all four walls.'), shotFig('plates-close', '<b>Close-up</b> of a corner: plate, anchors and the rafter marks.'))}
      ${check(['Plates flush with the outside of the ring beam, straight and level.', `All ${q.wedge} anchors tight.`, 'Rafter marks on the front and back plates line up across the house.'])}` },
    ],
  });

  // ----- part 4: infill walls
  const groups = bayGroups(d, ['front', 'back', 'left', 'right']);
  const bayList = (list) => list.map(({ key, j }) => `${WALL_NAME[key]} wall bay ${j + 1}`).join(', ');
  const bayDetails = groups.map((gr, k) => {
    const { key, j } = gr.list[0];
    const w = g.walls[key];
    const [a, c] = w.bays[j];
    const ops = w.openings.filter((o) => o.u0 >= a - 0.01 && o.u1 <= c + 0.01);
    const cov = w.covered.filter(([g0, g1]) => g0 >= a - 0.01 && g1 <= c + 0.01);
    const what = [ops.filter((o) => o.type === 'door').length && plural(ops.filter((o) => o.type === 'door').length, 'door'), ops.filter((o) => o.type === 'window').length && plural(ops.filter((o) => o.type === 'window').length, 'window'), cov.length && 'closed-up door gap'].filter(Boolean).join(', ') || 'plain wall';
    return `<details class="g-bay"${k === 0 ? ' open' : ''}><summary>Frame ${String.fromCharCode(65 + k)}: ${what}, ${ftin(c - a)} wide <span>— build ${gr.list.length === 1 ? 'once' : `${gr.list.length} times`}: ${bayList(gr.list)}</span></summary><div>
      ${figure(bayFig(d, P, key, j), `Frame ${String.fromCharCode(65 + k)}, seen from outside. Darker pieces frame the openings.`, 'wide')}
      ${bayTables(d, key, j)}</div></details>`;
  }).join('');
  const nScrewCol = Math.ceil((g.Rb - g.PH) / 24);
  parts.push({
    id: 'walls', title: 'Frame the walls between the columns', intro: `Each of the ${wallBayCount} bays gets its own 2x4 frame, screwed to the concrete all round. The ring beam carries the roof, so these frames only hold the wall sheets, windows and doors.`,
    steps: [
      { title: 'How every bay is built', html: `<p>Every bay is built the same way, in this order. Do the front and back walls first, then the ends. The frame sits <b>flush with the outside face</b> of the concrete.</p>
        ${ol([
          'Lay a strip of plastic on top of the pony wall.',
          '<b>Bottom plate:</b> measure the bay at the bottom, between the columns. Cut a 2x4 to that length and lay it flat on the pony wall, flush with the outside. Drill and drive a concrete screw 3" from each end and about every 24" between.',
          '<b>Top plate:</b> measure the bay again at the top (it is often a little different). Cut a 2x4, hold it flat against the underside of the ring beam, flush with the outside, prop it with a stud, and screw it up into the beam the same way.',
          '<b>Marks:</b> using the drawing for this bay, mark the position of every stud on both plates. Measure from the face of the left column (seen from outside).',
          `<b>Studs against the columns:</b> measure between the plates at each column, cut a stud to fit snugly, set it against the column face, toenail it to both plates and screw it to the column with ${nScrewCol} concrete screws.`,
          '<b>Openings:</b> fit the two king studs, then the rough sill (windows) and the head at the heights in the drawing, nailed through the kings with two 16d nails each end. Then the short cripple studs above and below.',
          '<b>The other studs:</b> measure each one in place, cut it to fit snugly, and toenail it at the marks.',
          `<b>Blocking:</b> snap a level chalk line across the studs at the height in the drawing. Cut each block to fit between two studs, lay it flat with its edge flush with the outside, and toenail it at both ends. The wall sheets are screwed to these.`,
          'Check the studs are plumb, and the openings are the size in the drawing (measure both diagonals of each opening too).',
        ])}
        ${figs(shotFig('bay-close', `<b>One bay framed</b> (front wall, bay 1), seen from outside.`), figure(openingFraming(), 'The parts around an opening.'))}
        ${tip('Cut a stud a hair long rather than short: tap it into place with the hammer so it is tight. A stud that is too short is useless.')}` },
      { title: 'The frame drawings', html: `<p>Bays with exactly the same framing are drawn once. Open each frame below to see where every piece goes and how long to cut it. <b>Measure in place</b> and adjust if the bay is a little different.</p>${bayDetails}
        ${i.nCovered ? tip('A closed-up door gap gets a 2x4 plate on the floor, studs down to it, and a nailer level with the top of the pony wall where the plywood joins.') : ''}
        ${figs(shotFig('walls-long', '<b>Front and back walls</b> framed.'), shotFig('walls-ends', '<b>End walls</b> framed.'))}
        ${check([`All ${wallBayCount} bays framed, flush with the outside of the concrete.`, 'Studs plumb and tight.', `Window openings ${ftin(g.winRO.w)} × ${ftin(g.winRO.h)}${nDoors ? `, door openings ${ftin(g.doorRO.w)} × ${ftin(g.doorRO.h)}` : ''}.`])}` },
    ],
  });

  // ----- part 5: roof framing
  const gableRows = g.walls.left.gable.map((s) => `<tr><td class="n">${ftin(s.u)}</td><td class="n"><b>${ftin(s.v1 - s.v0)}</b></td></tr>`).join('');
  const tiePieces = g.tieXs[0]?.pieces || [];
  const ridgeRows = g.ridgeBoards.map(([s, e]) => ftin(e - s)).join(' + ');
  const propH = g.ridgeTop - 5.5 - g.y0;
  parts.push({
    id: 'roof', title: 'Frame the roof', intro: `A gable roof at ${P.pitch}-in-12 (it rises ${P.pitch}" for every 12" across). ${nPairs} pairs of ${g.rafterSize} rafters lean against a ridge board along the top.`,
    steps: [
      { title: 'Make a pattern rafter', html: `<p>Every rafter is the same, so make one perfect rafter, test it, then use it to mark all the others.</p>
        ${figs(figure(rafterFig(g), '<b>The pattern rafter.</b> Both end cuts are plumb (vertical when the rafter is in place) and parallel.', 'wide'))}
        ${ol([
          `Choose the straightest ${g.rafterSize}. Sight along its edge and put the crown (the hump) on top.`,
          `<b>Ridge end:</b> near the right end, use the speed square to draw a plumb line at ${P.pitch}-in-12 (see the drawing below) and cut along it.`,
          `<b>Tail end:</b> from the top corner of that cut, measure <b>${ftin(g.rafterLen)}</b> along the top edge and draw another plumb line, parallel to the first. Cut it.`,
          `<b>Birdsmouth:</b> from the bottom corner of the tail cut, measure <b>${ftin(g.E / g.cos)}</b> along the bottom edge and draw a plumb line: this is the heel cut, ${inch(g.pw * g.p)} high. From there measure another <b>${inch(g.pw / g.cos)}</b> along the bottom edge and draw a line square to the heel line until they meet: this is the seat cut, ${inch(g.pw)} long.`,
          'Cut the birdsmouth with the circular saw, stopping exactly at the corner where the lines meet, and finish the corner with a handsaw. Don\'t over-cut: it weakens the rafter.',
          'Test it: set it on the plate with its top end at the middle of the house. The seat should sit flat on the plate, with the heel tight against its outside edge.',
        ])}
        ${figs(figure(birdsmouthFig(g), '<b>The birdsmouth</b>, close up.'), figure(speedSquare(P.pitch), 'Marking a plumb line with the speed square.'))}` },
      { title: 'Cut all the rafters', html: `${ol([
        `You need <b>${nPairs * 2} rafters</b>: ${nPairs} for each side.`,
        'Lay the pattern on each board, crown up, and trace all the cuts. Write "pattern" on it so it doesn\'t get used.',
        'Cut them all the same way.',
      ])}${cutList(/^Rafter/, 'Rafters')}` },
      { title: 'Put up the ridge board', html: `${ol([
        `The ridge board is a 2x6 on edge running the length of the house: ${ridgeRows}. The joints fall at a rafter position.`,
        'Copy the rafter marks from the wall plates onto both faces of the ridge board.',
        `Make temporary props: 2x4 posts standing on the floor, with the top of each one <b>${ftin(propH)}</b> above the floor (that is the underside of the ridge board). Put one at each end and one every 8' or so, with a short board across the top to hold the ridge.`,
        `Set the props exactly in the middle of the house: ${ftin(D / 2)} from the outside of the front and back walls. Brace each prop in both directions with diagonal 2x4s nailed to stakes or to the wall frames.`,
        'Lay the ridge board on the props, on edge, and nail it lightly. Check it is straight (string line along it) and level.',
      ])}${figs(figure(gableFig(d), `<b>The end of the roof</b>: ${ftin(g.ridgeTop - g.y0)} from the floor to the top of the ridge board.`, 'wide'), shotFig('ridge-close', '<b>At the ridge</b>: rafters nailed to the ridge board, seen from below.'))}
      ${warn('Until the rafters are in, the ridge board is only held by the props. Keep everyone clear of it in wind, and don\'t climb on it.')}` },
      { title: 'Fit the rafters', html: `${ol([
        'Start with a pair at each end of the house. Set each rafter at its mark, the seat on the plate and the top against the ridge board.',
        'Nail the top of the first rafter through the ridge board with three 16d nails. Its partner on the other side can\'t be nailed through, so toenail it with three nails.',
        'Toenail each rafter to the plate with two 16d nails, one each side.',
        'Check the end pairs are plumb, then fill in all the others, working from both ends toward the middle.',
        'When all the rafters are in, check the ridge is still straight. Remove the props only after the ceiling ties are on.',
      ])}${figs(shotFig('roof', '<b>Roof framing</b>: ridge, rafters, ceiling ties and gable studs.'), shotFig('seat-close', '<b>Where a rafter sits on the plate</b>, seen from inside: the birdsmouth and the hurricane tie.'))}` },
      { title: 'Hurricane ties', html: `${ol([
        `Fix a hurricane tie on the inside face of every rafter where it sits on the plate (${q.ties} ties).`,
        'One flange goes against the rafter, the other against the plate.',
        'Fill every nail hole with the short 1-1/2" tie nails. Not ordinary nails: the long ones split the wood, and fewer nails means less strength.',
      ])}${figs(figure(hurricaneTie(), 'Every hole gets a nail.'))}${warn('These ties are what keep the roof on in a typhoon. Don\'t skip any.')}` },
      { title: 'Ceiling ties', html: `${ol([
        `On every other pair of rafters (${plural(g.tieXs.length, 'pair')}, not the end pairs), nail a 2x4 across the house at plate level, against the side of the rafters. It stops the weight of the roof pushing the walls apart.`,
        'Nail it to each rafter with three 16d nails near the wall.',
        tiePieces.length > 1 ? `The house is wider than a 16' board, so each tie is two pieces, ${tiePieces.map(([s, e]) => ftin(e - s)).join(' and ')}, butted end to end. Nail a 4' 2x4 across the joint on the other face (a <i>scab</i>), with six nails each side of the joint.` : null,
        'Now you can take down the ridge props.',
      ])}${cutList(/^Ceiling tie/, 'Ceiling ties')}` },
      { title: 'Gable studs', html: `<p>At each end of the house, fill the triangle between the plate and the end rafter with studs every ${inch(P.studSpacing)}, so the gable sheets have something to screw to.</p>
        ${ol([
          'Stand each stud on the plate, flush with the outside, under the end rafter. Measure from the plate to the underside of the rafter at that spot.',
          `Cut the top at the roof angle (${P.pitch}-in-12 with the speed square) so it sits flat under the rafter.`,
          'Toenail it to the plate and to the rafter.',
        ])}
        <div class="table-wrap"><table class="t g-cut"><thead><tr><th class="n">From the front wall</th><th class="n">Length (to the middle of the slanted cut)</th></tr></thead><tbody>${gableRows}</tbody></table></div>
        <p class="muted">The same lengths at both ends of the house.</p>` },
      { title: 'Fascia', html: `${ol([
        'The rafter tails along each eave must be in a straight line. Stretch a string from the end rafters and trim any tail that sticks out.',
        `Nail a 1x6 fascia board across the ends of the tails along both eaves, its top edge flush with the top of the rafters. Two 8d nails into each tail. Make joints on a rafter tail.`,
      ])}${cutList(/^Fascia/, 'Fascia')}
      ${check(['All rafters seated, nailed and tied.', 'Ridge straight; ceiling ties on; props removed.', 'Fascia straight along both eaves.'])}` },
    ],
  });

  // ----- part 6: purlins
  const sl = g.slopes[0];
  const purlinGap = sl.purlinS.length > 1 ? sl.purlinS[1] - sl.purlinS[0] : 0;
  parts.push({
    id: 'purlins', title: 'Purlins', intro: `Rows of 2x4s laid flat across the rafters. The roof sheets are screwed to them. ${sl.purlinS.length} rows on each side, ${inch(purlinGap)} apart.`,
    steps: [
      { title: 'Mark a story stick', html: `${ol([
        'Take a straight 1x4 or 2x4 a little longer than a rafter. Lay it on top of a rafter with its end flush with the outside face of the fascia.',
        'Mark the lower edge of every purlin on it, at these distances from the end:',
        `<span class="muted">${sl.purlinS.map((s) => ftin(fromFascia(g, s))).join(', ')}</span>`,
        'Use the stick to mark both ends of each slope (on the end rafters) and a few rafters in between.',
      ])}${figs(figure(purlinFig(g), `<b>Purlin positions</b> along the rafter, measured from the outside of the fascia to the lower edge of each purlin. The top row stops 3/4" short of the middle of the ridge, on both sides.`))}` },
      { title: 'Nail the purlins', html: `${ol([
        `Snap a chalk line across the rafters between the marks for each row.`,
        `Lay each 2x4 flat on the rafters with its lower edge on the line. It sticks out ${inch(g.R)} past the end rafters at both gables.`,
        'Nail it to every rafter it crosses with two 16d nails.',
        `Joints between pieces must be on a rafter: pieces are ${g.purlinPieces.map(([s, e]) => ftin(e - s)).join(' + ')} long.`,
        'Start at the bottom row (by the fascia) and work up; the rows below are your ladder. Step only on the rafters and purlins.',
      ])}${figs(shotFig('purlins', '<b>Purlins</b> on both slopes.'))}${cutList(/^Purlin/, 'Purlins')}
      ${check(['Every purlin straight (check with a string) and nailed at every rafter.'])}` },
    ],
  });

  // ----- part 7: roofing
  const nRoof = q.tin.filter((t) => t.use === 'roof').length;
  const runDesc = sl.run.length === 1 ? `one length, ${ftin(sl.Ls)}, from the eave to the ridge` : `${sl.run.length} pieces lapped ${inch(LAP)}: ${sl.run.map((r) => ftin(r.len)).join(' + ')}`;
  parts.push({
    id: 'roofing', title: 'Roof sheets', intro: `${nRoof} ${clad} sheets, ${g.nCols} across each slope, then the ridge cap.`,
    steps: [
      { title: 'Plan the sheets', html: `${ol([
        `Each slope needs ${g.nCols} columns of sheets. Each column is ${runDesc}. Cut sheets to length on the ground: measure, mark both edges, snap a line, and cut.`,
        `The sheets are ${inch(g.tinW)} wide and each one covers ${inch(P.tinCover)}, because they overlap by one corrugation.`,
        '<b>Start at the downwind end.</b> On Polowat the trade winds mostly come from the east, so start at the west end. Each new sheet then laps over the last one with its edge facing away from the wind, so rain isn\'t blown in under it.',
        `The last column is cut narrower to finish ${inch(g.R)} past the end rafter, flush with the purlins.`,
      ])}${figs(figure(roofSheetFig(d, P), '<b>Sheet layout on one slope.</b> Dashed lines are the purlins: one row of screws on each.'))}` },
      { title: 'Fix the sheets', html: `${ol([
        'Stretch a string along the eave, 2" out from the face of the fascia. The bottom of every sheet lines up with it, so water drips clear of the fascia.',
        'Lay the first sheet with its outside edge flush with the ends of the purlins and its bottom at the string. Check that it is square to the eave before you screw it.',
        'Screw it down through the <b>crests</b>, every other crest, along every purlin. Drive each screw just until the rubber washer squeezes.',
        'Lay the next sheet overlapping the first by one corrugation, and screw it the same way. The screw at the lap goes through both sheets.',
        'Check every few sheets that the bottom edge is still on the string and the sheets are not fanning out.',
        `Finish each slope, then fix the ridge cap along the top: pieces lapped 6", screwed through the cap into the top purlins on both sides (${plural(q.ridgePieces * 2, 'piece')} for the two sides).`,
      ])}
      ${figs(figure(tinLap(clad === 'PVC'), 'Side lap and screws.'), figure(washerTight(), 'Snug, not crushed.'))}
      ${figs(shotFig('roofing', '<b>The roof sheeted</b>, with the ridge cap.'), shotFig('roofing-close', '<b>At the eave</b>: sheets overhanging the fascia, screws along each purlin.'))}
      ${warn('Walk only along the lines of screws (that is where the purlins are), wear soft-soled shoes, and keep off the roof when it is wet or windy.')}
      ${check(['Every sheet screwed at every purlin.', 'No screw holes missed or left empty (fill a mistake with a screw and washer).', 'Ridge cap on and screwed.'])}` },
    ],
  });

  // ----- part 8: siding
  const sideRec = g.sidingLog.find((r) => r.label === 'wall panel');
  const nSide = q.tin.filter((t) => t.use === 'siding').length;
  const sideBay = (() => {
    const key = 'front';
    const w = g.walls[key];
    const j = w.bays.findIndex((_, jj) => w.openings.some((o) => o.u0 >= w.bays[jj][0] && o.u1 <= w.bays[jj][1] && o.type === 'window'));
    return { key, j: Math.max(0, j) };
  })();
  parts.push({
    id: 'siding', title: 'Wall sheets outside', intro: `${nSide} ${clad} sheets, standing upright, on the outside of every bay and the two gables.`,
    steps: [
      { title: 'Sheet each bay', html: `${ol([
        `Each bay's sheets run from <b>1-1/2" below the top of the pony wall</b> up to the underside of the ring beam: ${ftin(sideRec ? sideRec.pieces[0].len : 0)} long. The 1-1/2" lap means rain runs off the sheet onto the concrete, not into the wood.`,
        'Start at the left of the bay. Hold the first sheet in place and screw it through every other crest into the bottom plate, each row of blocking and the top plate.',
        'Overlap the next sheet by one corrugation, and so on. The last sheet is cut narrower to finish at the column.',
        'At a window or door: hold the sheet in place, mark the opening on it from the inside, take it down and cut it out with snips. Cut 1/4" inside the opening so the casing covers the edge.',
        'Run a bead of sealant along every edge where a sheet meets concrete: the columns, the ring beam and the pony wall.',
      ])}${figs(figure(bayFig(d, P, sideBay.key, sideBay.j, 'siding'), `<b>Sheets on ${WALL_NAME[sideBay.key]} wall bay ${sideBay.j + 1}</b>. Dots are the screws.`, 'wide'))}` },
      { title: 'Sheet the gables', html: `${ol([
        'At each end, the triangle above the ring beam is sheeted the same way, from 1" below the top of the ring beam up to the rafter.',
        'Hold each sheet in place and mark where the top of the rafter crosses it, then cut it on that slant.',
        'Screw it to the 2x6 plate, up each gable stud and along the end rafter.',
      ])}${figs(shotFig('siding', '<b>All the wall sheets on</b>, gables included.'))}
      ${check(['Every bay and both gables sheeted.', 'Sealant along every joint between sheet and concrete.'])}` },
    ],
  });

  // ----- part 9: windows
  parts.push({
    id: 'windows', title: 'Louvre windows', intro: `${plural(nWin, 'aluminium louvre window')}: ${P.windowH}' frames with ${P.windowW}' glass blades.`,
    steps: [
      { title: 'Fit the frames and glass', html: `${need([`${nWin} pairs of ${P.windowH}' louvre frames (a left and a right channel for each window)`, `${q.windows.reduce((s, x) => s + x.blades, 0)} glass blades plus spares`, '1x4 for the casing'])}
        ${ol([
          'Read the instructions that come with the frames: makes differ a little.',
          `Stand the two frame channels in the opening, one against each king stud, 1/2" above the rough sill. The opening is ${ftin(g.winRO.w)} wide: room for the ${P.windowW}' blades and the two channels.`,
          'Check each channel is plumb, and that the two are at exactly the same height (lay the level across from one to the other). If they are not, the blades jam.',
          'Nail or screw each channel to its king stud near the top, middle and bottom.',
          'Close the handle and slide the glass blades into the clips, starting at the bottom. Open and close the handle: all the blades should move together and close tightly.',
          'Nail a 1x4 casing round the outside of the opening (head, both sides and sill), over the cut edge of the sheet, with 8d nails every 16".',
        ])}${figs(figure(louvreWin({ roW: g.winRO.w, roH: g.winRO.h, frameH: P.windowH * 12, bladeW: P.windowW * 12 }), 'A louvre window in its opening.'), shotFig('win-close', '<b>A window fitted</b>, with its casing.'))}
        ${tip('Glass blades break easily. Leave them in their box until the frames are in, and carry them on edge.')}` },
    ],
  });

  // ----- part 10: doors
  if (nDoors) {
    const nBoards = Math.ceil(P.doorW / 5.5);
    parts.push({
      id: 'doors', title: 'Doors', intro: `${plural(nDoors, 'board door')}, ${inch(P.doorW)} × ${ftin(i.leafH)}, made from 1x6 boards and hung on three T-hinges so they open outward.`,
      steps: [
        { title: 'Fit the door jambs', html: `${ol([
          'The jambs are 1x6 boards that line the sides and top of the door opening.',
          `Cut two side jambs ${ftin(g.doorRO.h)} long and a head jamb to fit between them.`,
          'Stand each side jamb in the opening against the king stud and the end of the pony wall, its outside edge 3/4" proud of the framing so the casing covers it. Check it is plumb.',
          'Fix it with concrete screws into the end of the pony wall and 8d nails into the king stud, about every 16".',
          'Nail the head jamb across the top.',
          'Nail a 1x4 casing on the outside, up both sides of the opening, over the edge of the sheets.',
        ])}${cutList(/^Door jamb|^Door casing/, 'Jambs and casing')}` },
        { title: 'Build each door', html: `${ol([
          `Lay ${nBoards} 1x6 boards side by side on a flat surface, ${ftin(i.leafH)} long, and trim the outside ones so the total width is ${inch(P.doorW)}. Line up the ends with a square.`,
          'Lay two 1x4 battens across them, one 6" from the bottom and one 9-1/2" from the top, 1" in from each edge.',
          'Nail through each batten into every board with two 8d nails. Nails that come through the other side: bend them over flat (clinch them) so they hold tight.',
          '<b>The brace:</b> lay a 1x4 diagonally between the battens, with its <b>low end on the hinge side</b>. Mark the angle where it meets each batten, cut it to fit snugly, and nail it to every board.',
        ])}${figs(figure(doorBuild({ w: P.doorW, h: i.leafH, boards: nBoards }), '<b>A door, from the inside</b> (the side with the battens). The hinges are on the left when you look from outside, which is on the right here.'))}
        ${warn('If the brace runs the other way (low end on the latch side), the door sags within months. Check it before you nail it.')}` },
        { title: 'Hang the doors', html: `${ol([
          'Stand the door in its opening on two 1/2" spacers, with an equal gap at each side.',
          'Hold the T-hinges on the outside, the strap across the door and the leaf on the casing, at 8" from the top, in the middle, and 8" from the bottom.',
          'Screw the hinges to the door and to the casing. Take out the spacers and check the door swings freely and closes against the jambs.',
          'Fit the hasp at about 40" high: the hinged part on the door, the staple on the casing. Add the padlock.',
        ])}${figs(shotFig('door-close', '<b>A door hung</b>, with its hinges and hasp.'), shotFig('doors', '<b>Windows and doors</b> all in.'))}
        ${check(['Each door opens and closes without rubbing.', 'Brace runs up from the hinge side.', 'Hasp and padlock work.'])}` },
      ],
    });
  }

  // ----- part 11: plywood
  parts.push({
    id: 'interior', title: 'Plywood inside', intro: `The inside of every bay is lined with ${PLY[P.wallPly].name}: ${q.wallPly.pieces.length} pieces cut from ${buy(P.wallPly)} sheets.`,
    steps: [
      { title: 'Line the inside of each bay', html: `${ol([
        `Each bay gets plywood from the top of the pony wall up to the ring beam: ${ftin(Math.min(96, g.Rb - g.PH))} tall. Cut each 4' × 8' sheet to that height.`,
        'Start at one column. Hold the sheet against the framing, tight to the column, and nail it with 1-1/4" panel nails every 8" along every stud, plate, head, sill and block behind it.',
        'Before you nail, mark on the plywood where the studs are (from the marks on the plates) so you hit them.',
        'Cut out the window and door openings: hold the sheet in place, mark the opening from the other side, take it down and cut it with a saw.',
        'The last sheet in a bay is cut narrower to fit against the next column.',
        i.nCovered ? 'At a closed-up door gap, the lower part (below the pony-wall height) gets its own piece nailed to the studs and the nailer.' : null,
      ])}${figs(figure(bayFig(d, P, 'back', Math.max(0, jb), 'ply'), `<b>Plywood in back wall bay ${Math.max(0, jb) + 1}</b>, seen from inside.`, 'wide'), shotFig('ply-close', '<b>The same bay</b>, from inside the house.'))}
      ${tip('The concrete columns, pony walls and ring beam stay bare. Paint them if you like; a light colour makes the room brighter.')}` },
    ],
  });

  // ----- part 12: finish
  parts.push({
    id: 'finish', title: 'Finish and check', intro: 'A last walk round, and the extras worth adding.',
    steps: [
      { title: 'Final checks', html: `${check([
        'Inside on a sunny day: look up for pinholes of light in the roof; seal any with a screw and washer or sealant.',
        'After the first heavy rain, look for drips and damp patches, especially at the laps, the ridge and the windows.',
        'Every hurricane tie fully nailed and every wedge anchor tight.',
        'All windows open and close; all doors swing freely and lock.',
        'Offcuts, nails and sheet scraps picked up: a nail in the foot goes bad fast in the tropics.',
      ])}${figs(shotFig('done', '<b>The finished house</b>, from the back.'))}` },
      { title: 'Worth adding', html: ul([
        `<b>Gutters and a water tank.</b> The roof collects about ${num(i.rainGal)} gallons of rain for every inch that falls.`,
        '<b>Insect screen</b> behind the louvres.',
        '<b>Paint</b> on the outside of the trim and doors to make the wood last.',
        '<b>Once a year</b>, and after every storm: check for loose roof screws, re-seal joints, and look at the hurricane ties.',
      ]) },
    ],
  });

  renderGuide(host, {
    key: 'h', title: 'Step-by-step: building the house',
    lede: `<p class="lede">How to finish the ${ftin(W)} × ${ftin(D)} house on its concrete frame, from ${slab ? 'the floor' : 'the wall plates'} to the last coat of sealant. Every measurement below comes from your design.</p>`,
    parts, shots, model: { parts: d.parts, bounds: d.bounds, maxStep: STEP.DONE },
  });
}
