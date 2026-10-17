// Step-by-step building guide for the toilet house: slab, block pony wall,
// framing, shed roof, siding, door, toilet and the drain to the outfall or
// pit. Every number comes from the current design.
import { TSTEP } from './toilet.js';
import { BLOCK } from './catalog.js';
import { ftin, inch, num } from './format.js';
import { renderGuide, tip, warn, check, need, figs, ol, ul } from './guide.js';
import {
  Fig, px, figure, shotFig, lumberSizes, nailing, measureMark, squareCheck, levelPlumb,
  concreteMix, mortarMix, speedSquare, tinLap, washerTight, hurricaneTie, doorBuild, pvcGlue, slopeCheck,
  blockBond, blockString, collarCast,
} from './guide-svg.js';

const WALL_NAME = { front: 'front (door)', back: 'back', left: 'left side', right: 'right side' };
const Cap = (s) => s[0].toUpperCase() + s.slice(1);
const r8 = (x) => Math.round(x * 8) / 8;
const plural = (n, a, b = a + 's') => `${n} ${n === 1 ? a : b}`;

// plan (x, z) of a point u along wall key, dd in from its outside face
function wallXZ(g, key, u, dd = 0) {
  if (key === 'front') return [u, g.D - dd];
  if (key === 'back') return [g.W - u, dd];
  if (key === 'left') return [dd, u];
  return [g.W - dd, g.D - u];
}

// ---------------------------------------------------------------- drawings
function siteFig(d, P) {
  const g = d.g;
  const pit = P.waste === 'pit';
  const F = px(760, 250);
  const gy = 120, shoreX = 360, hi = 150, lo = 170, outX = 720, tox = 130;
  F.add(`<path d="M0 ${gy} L${shoreX - 40} ${gy + 6}" class="ground"/>`);
  F.add(`<path d="M${shoreX - 40} ${gy + 6} Q${shoreX + 20} ${gy + 30} ${shoreX + 60} 206 L760 210" class="ground"/>`);
  F.add(`<rect x="${shoreX + 10}" y="${hi}" width="${760 - shoreX - 10}" height="${250 - hi}" class="water"/>`);
  F.add(`<path d="M${shoreX - 10} ${hi}H760" class="tide"/><path d="M${shoreX + 30} ${lo}H760" class="tide" style="opacity:.6"/>`);
  F.text(752, hi - 7, 'high tide', { a: 'end', cls: 'note' });
  F.text(752, lo - 7, 'low tide', { a: 'end', cls: 'note' });
  // toilet house, door on the left, water on the right
  F.add(`<rect x="${tox - 34}" y="${gy - 70}" width="68" height="66" class="ply"/><path d="M${tox - 46} ${gy - 82}L${tox + 46} ${gy - 66}" class="ln" style="stroke-width:3"/>`);
  F.add(`<rect x="${tox - 34}" y="${gy - 4}" width="68" height="6" class="conc"/>`);
  F.add(`<path d="M${tox + 10} ${gy - 4}V${gy - 92}" class="pipeline vent"/>`);
  F.text(tox - 40, gy - 30, 'door', { a: 'end', cls: 'note' });
  F.text(tox + 14, gy - 98, 'vent', { a: 'start', cls: 'note' });
  if (pit) {
    F.add(`<path d="M${tox} ${gy - 2}V${gy + 8}L${tox + 110} ${gy + 14}" class="pipeline"/><rect x="${tox + 110}" y="${gy + 2}" width="60" height="56" class="block" style="fill:none"/><rect x="${tox + 112}" y="${gy + 34}" width="56" height="22" class="water"/>`);
    F.text(tox + 140, gy + 74, `pit ${ftin(P.pitDepth)} deep, ${ftin(g.PIT.gap)} behind`, { cls: 'note' });
  } else {
    F.add(`<path d="M${tox} ${gy - 2}V${gy + 8}L${shoreX} ${gy + 30}L${shoreX + 40} 200L${outX} 200" class="pipeline"/><rect x="${outX}" y="194" width="10" height="12" class="steelf"/>`);
    for (let x = shoreX + 80; x < outX - 10; x += 60) F.add(`<rect x="${x}" y="193" width="8" height="14" class="conc"/>`);
    F.text((tox + shoreX) / 2 + 20, gy + 40, `${Math.round(d.info.landRun / 12)} ft buried, falling 1/4" per ft`, { cls: 'note' });
    F.text((shoreX + outX) / 2 + 30, 224, `${P.outfall} ft along the bottom · a collar every 10 ft · flap valve on the end`, { cls: 'note' });
  }
  F.add(`<path d="M${tox + 34} ${gy + 44}H${shoreX}" class="dimx"/>`);
  F.text((tox + 34 + shoreX) / 2, gy + 56, `${P.shore} ft from the back wall to the water's edge`, { cls: 'dimt' });
  F.text(tox - 40, gy - 80, 'floor well above\nthe highest tide', { a: 'end', cls: 'note' });
  return F.svg('Side view of the site, not to scale');
}

function drainFig(d, P) {
  const g = d.g;
  const { y0, T, bt, PH, zo, zv, zc, yd0, ydc, Ds } = g;
  const pr = d.info.pr;
  const F = new Fig({ x0: zc - 16, x1: Ds + 6, y0: -14, y1: y0 + PH + 18, k: 6.2, pad: [16, 250, 30, 16] });
  // ground, fill, slab and the block walls; z runs left to right, the
  // water (back) on the left
  F.rect(zc - 16, -14, Ds + 6, 0, 'earth');
  F.line(zc - 16, 0, 0, 0, 'ground');
  F.line(Ds, 0, Ds + 6, 0, 'ground');
  F.rect(0, y0 - T, Ds, y0, 'conc', 'style="fill-opacity:.6"');
  if (y0 - T > 0.5) F.rect(0, 0, Ds, y0 - T, 'earth');
  F.rect(0, y0, bt, y0 + PH, 'block');
  F.rect(g.D - bt, y0, g.D, y0 + PH, 'block');
  // drain: closet bend up to the floor, falling run to the cleanout
  const pp = (pts) => F.add(`<path d="${pts.map(([z, y], i) => `${i ? 'L' : 'M'}${F.X(z)} ${F.Y(y)}`).join('')}" class="pipeline" style="stroke-width:${(2 * pr * F.k).toFixed(1)};stroke-linecap:butt;opacity:.55"/>`);
  pp([[zo, y0], [zo, yd0], [zc, ydc]]);
  pp([[zc, ydc], [zc, 3]]);
  F.rect(zc - pr - 0.4, 3, zc + pr + 0.4, 4.2, 'steelf');
  F.rect(zo - pr - 1.2, y0 - 0.4, zo + pr + 1.2, y0 + 0.1, 'steelf');
  // vent up the back wall
  F.add(`<path d="M${F.X(zv)} ${F.Y(yd0 - 0.6 + (zo - zv) * 0.02)}V${F.Y(y0 + PH + 18)}" class="pipeline vent" style="stroke-width:${(2.4 * F.k).toFixed(1)};stroke-linecap:butt;opacity:.6"/>`);
  // the bowl, sketched
  F.add(`<path d="M${F.X(zo - 6)} ${F.Y(y0)}L${F.X(zo - 4)} ${F.Y(y0 + 12)}L${F.X(zo + 16)} ${F.Y(y0 + 15)}L${F.X(zo + 16)} ${F.Y(y0 + 12)}L${F.X(zo + 6)} ${F.Y(y0)}Z" class="ghost"/>`);
  F.labels([
    { x: zv, y: y0 + PH + 12, t: '2" vent, up the back wall and out\nthrough the roof' },
    { x: zo + 10, y: y0 + 13, t: 'pour-flush bowl (set last)' },
    { x: zo + pr + 1, y: y0 - 0.2, t: 'closet flange, flush with the floor' },
    { x: g.D - bt / 2, y: y0 + PH / 2, t: 'front block wall (door side)' },
    { x: bt / 2, y: y0 + PH * 0.75, t: 'back block wall (water side)' },
    { x: 30, y: y0 - T / 2, t: `${inch(T)} slab` },
    { x: (zo + zc) / 2, y: (yd0 + ydc) / 2, t: `${P.pipeD}" drain, falling 1/4" per foot` },
    { x: zv, y: yd0, t: 'sanitary tee for the vent' },
    { x: zc, y: 2, t: P.waste === 'pit' ? 'wye and screw plug (cleanout),\nthen on to the pit' : 'wye and screw plug (cleanout),\nthen on down the beach' },
  ], F.X(Ds + 6) + 20, 'right');
  F.dimH(0, zo, y0 + PH, `${inch(zo)} to the centre`, -12);
  F.dimH(zc, 0, 0, `${inch(-zc)}`, 26);
  F.dimV(yd0 - pr, 0, zo + 8, `${inch(-(yd0 - pr))} trench`, 4);
  return F.svg('Section through the drain under the slab, the water to the left');
}

function slabPlanFig(d, P) {
  const g = d.g;
  const { W, D, Ds, bt } = g;
  const F = new Fig({ x0: -20, x1: W + 20, y0: -16, y1: Ds + 16, k: 5.2, flip: false, pad: [14, 230, 14, 70] });
  F.rect(0, 0, W, Ds, 'conc', 'style="fill-opacity:.45"');
  // block wall footprint, door gap at the front
  F.rect(0, 0, W, bt, 'block');
  F.rect(0, bt, bt, D - bt, 'block');
  F.rect(W - bt, bt, W, D - bt, 'block');
  F.rect(0, D - bt, g.r0, D, 'block');
  F.rect(g.r1, D - bt, W, D, 'block');
  // grouted cells: dowels, and bolts where a plate is bolted
  const bolts = new Set();
  for (const w of Object.values(g.walls)) for (const u of w.bolts) bolts.add(`${w.key}|${Math.round(u)}`);
  for (const c of g.cells) {
    const [x, z] = wallXZ(g, c.wall, c.u, bt / 2);
    F.add(`<circle cx="${F.X(x)}" cy="${F.Y(z)}" r="5" class="${[...bolts].some((b) => b.startsWith(c.wall + '|') && Math.abs(Number(b.split('|')[1]) - c.u) < 6) ? 'hl' : 'steelf'}"/>`);
  }
  F.add(`<circle cx="${F.X(g.tx)}" cy="${F.Y(g.zo)}" r="${(3.5 * F.k / 2).toFixed(1)}" class="pipe"/><circle cx="${F.X(g.tx)}" cy="${F.Y(g.zv)}" r="${(1.2 * F.k).toFixed(1)}" class="pipe"/>`);
  F.dimH(0, W, 0, ftin(W), -16);
  F.dimV(0, D, 0, ftin(D), -16, { side: 'left' });
  F.dimV(D, Ds, 0, ftin(Ds - D), -16, { side: 'left' });
  F.dimH(0, g.tx, g.zo, `${inch(g.tx)}`, -10);
  F.dimV(0, g.zo, g.tx, inch(g.zo), 12);
  F.dimH(g.r0, g.r1, Ds, `door gap ${ftin(g.r1 - g.r0)}`, 16);
  F.labels([
    { x: W - bt / 2, y: bt / 2, t: 'BACK (toward the water)' },
    { x: g.tx + 2, y: g.zo, t: 'closet flange (centre)' },
    { x: g.tx + 1, y: g.zv, t: '2" vent' },
    { x: W - bt / 2, y: D / 2, t: 'block wall' },
    { x: W / 2 + 10, y: D + (Ds - D) / 2, t: 'step in front of the door' },
  ], F.X(W + 20) + 16, 'right');
  F.text(W + 20, Ds + 16, '● dowel   ● dowel + anchor bolt (orange)', { a: 'start', cls: 'note', dx: 16, dy: -6 });
  return F.svg('Plan of the slab with the block wall, dowels and the toilet drain');
}

function courseFig(g, k) {
  const { W, D, bt } = g;
  const F = new Fig({ x0: -4, x1: W + 4, y0: -4, y1: D + 4, k: 4.2, flip: false, pad: [24, 8, 8, 8] });
  for (const w of Object.values(g.walls)) {
    for (const b of w.blocks.filter((x) => x.course === k)) {
      const [xa, za] = wallXZ(g, w.key, b.u, 0);
      const [xb, zb] = wallXZ(g, w.key, b.u + b.len, bt);
      F.rect(xa, za, xb, zb, b.len < BLOCK.len - 0.1 ? 'block cut' : 'block');
    }
  }
  F.text(W / 2, -4, `course ${k + 1}`, { cls: 'ttl', dy: -12 });
  F.text(W / 2, D / 2, 'back ↑\nfront (door) ↓', { cls: 'note' });
  return F.svg(`Block layout, course ${k + 1}`);
}

function cellFig(d, P) {
  const g = d.g;
  const { T, PH, bt } = g;
  const F = new Fig({ x0: -14, x1: bt + 16, y0: -T - 6, y1: PH + 8, k: 9, pad: [12, 260, 12, 12] });
  F.rect(-14, -T - 6, bt + 16, -T, 'earth');
  F.rect(-14, -T, bt + 16, 0, 'conc', 'style="fill-opacity:.55"');
  for (let c = 0; c < P.courses; c++) F.rect(0, c * 8 + 0.375, bt, c * 8 + 8, 'block');
  F.rect(1.2, 0.4, bt - 1.2, PH, 'grout');
  F.rect(-1, PH, 3.5 - 1, PH + 1.5, 'wood');
  F.add(`<path d="M${F.X(bt / 2 + 0.6)} ${F.Y(PH - 2)}V${F.Y(-T + 1.5)}H${F.X(bt / 2 + 10.6)}" class="rebar"/>`);
  F.add(`<path d="M${F.X(1.25)} ${F.Y(PH - 5)}V${F.Y(PH + 3.2)}" class="bolt"/>`);
  F.rect(0.25, PH + 1.5, 2.25, PH + 1.8, 'steelf');
  F.rect(0.5, PH + 1.8, 2, PH + 2.6, 'steelf');
  F.labels([
    { x: 1.25, y: PH + 2.2, t: '1/2" anchor bolt, washer and nut' },
    { x: 1, y: PH + 0.75, t: '2x4 bottom plate (on a strip of plastic)' },
    { x: bt / 2 + 0.6, y: PH - 6, t: '#4 dowel, stops 2" below the top' },
    { x: 2, y: PH / 2 + 3, t: 'cell filled solid with concrete' },
    { x: bt - 0.3, y: 12, t: `${P.blockT}" hollow block, ${plural(P.courses, 'course')}` },
    { x: bt / 2 + 8, y: -T + 1.5, t: '10" hook, in the slab' },
    { x: bt + 10, y: -T / 2, t: `${inch(T)} slab` },
  ], F.X(bt + 16) + 16, 'right');
  return F.svg('Section through a grouted block cell with its dowel and anchor bolt');
}

function wallFig(d, key) {
  const g = d.g;
  const w = g.walls[key];
  const side = key === 'left' || key === 'right';
  const top = Math.max(g.Hf, ...(w.rake ? [w.rake.top0, w.rake.top1] : []));
  const F = new Fig({ x0: -4, x1: w.L + 4, y0: -2, y1: top + 4, k: Math.min(6, 420 / (top + 6)), pad: [26, 200, 40, 16] });
  const blocks = (w.blocks || []);
  for (const b of blocks) F.rect(b.u, b.course * 8 + 0.375, b.u + b.len, b.course * 8 + 8, 'block');
  F.line(-4, 0, w.L + 4, 0, 'ground');
  for (const f of w.frame) {
    const cls = /King|Trimmer|header|Cripple/.test(f.name) ? 'wood hl2' : /plate|Girt|Vent/i.test(f.name) ? 'wood2' : 'wood';
    F.rect(f.u0, f.v0, f.u1, f.v1, cls);
  }
  if (w.rake) {
    const r = w.rake;
    F.poly([[r.u0, r.top0], [r.u1, r.top1], [r.u1, r.top1 - r.drop], [r.u0, r.top0 - r.drop]], 'wood2');
  }
  if (side) F.rect(g.FW, g.vb, w.L - g.FW, g.vt, 'areafill');
  if (key === 'front') F.rect(g.r0, 0, g.r1, g.hRO, 'areafill');
  F.dimH(0, w.L, top, ftin(w.L), -14);
  const lv = [[0, 'floor'], [g.PH, 'top of the blocks']];
  if (side) lv.push([g.vb, 'vent sill'], [g.vt, 'vent head']);
  if (key === 'front') lv.push([g.hRO, 'underside of door header'], [g.Hf, 'top of the wall']);
  if (key === 'back') lv.push([d.info.lowH, 'top of the wall']);
  let lastY = Infinity;
  for (const [v, t] of lv.sort((a, b) => a[0] - b[0])) {
    const py = Math.min(F.Y(v), lastY - 13);
    lastY = py;
    F.add(`<path d="M${F.X(w.L + 4)} ${F.Y(v)}h8L${F.X(w.L + 4) + 14} ${py}h4" class="lead"/><text x="${F.X(w.L + 4) + 20}" y="${py}" dominant-baseline="central" class="note"><tspan class="dimt" style="stroke-width:0">${ftin(v)}</tspan> ${t}</text>`);
  }
  if (side && w.rake) {
    F.text(w.rake.u0, w.rake.top0, ftin(w.rake.top0), { cls: 'dimt', dy: -10, a: 'start' });
    F.text(w.rake.u1, w.rake.top1, ftin(w.rake.top1), { cls: 'dimt', dy: -10, a: 'end' });
  }
  F.text(-4, -2, 'Seen from OUTSIDE.', { a: 'start', cls: 'note', dy: 26 });
  return F.svg(`${Cap(WALL_NAME[key])} wall framing`);
}

function wallTable(d, key) {
  const w = d.g.walls[key];
  const vert = w.frame.filter((f) => f.v1 - f.v0 > f.u1 - f.u0).sort((a, b) => a.u0 - b.u0);
  const horiz = w.frame.filter((f) => !(f.v1 - f.v0 > f.u1 - f.u0)).sort((a, b) => a.v0 - b.v0 || a.u0 - b.u0);
  const side = !!w.rake;
  let h = `<div class="table-wrap"><table class="t g-cut"><thead><tr><th>Upright pieces (2x4)</th><th class="n">Left edge from the left end</th><th class="n">Cut length${side ? ' (to the middle of the slanted top)' : ''}</th></tr></thead><tbody>`;
  for (const f of vert) h += `<tr><td>${f.name}</td><td class="n">${ftin(f.u0)}</td><td class="n"><b>${ftin(f.v1 - f.v0)}</b></td></tr>`;
  h += `</tbody></table></div><div class="table-wrap" style="margin-top:8px"><table class="t g-cut"><thead><tr><th>Flat pieces (2x4)</th><th class="n">Left end from the left end</th><th class="n">Height of its top</th><th class="n">Cut length</th></tr></thead><tbody>`;
  for (const f of horiz) h += `<tr><td>${f.name}</td><td class="n">${ftin(f.u0)}</td><td class="n">${ftin(f.v1)}</td><td class="n"><b>${ftin(f.u1 - f.u0)}</b></td></tr>`;
  if (side) h += `<tr><td>Raked top plate</td><td class="n">${ftin(w.rake.u0)}</td><td class="n">${ftin(w.rake.top0)} → ${ftin(w.rake.top1)}</td><td class="n"><b>${ftin(Math.hypot(w.rake.u1 - w.rake.u0, w.rake.top1 - w.rake.top0))}</b></td></tr>`;
  return h + `</tbody></table></div>`;
}

function rafterFig(g) {
  const { E, FW, p, cos, rd, rafterLen: Lr, D } = g;
  const tn = p;
  const ang = Math.atan(p);
  const bot = (z) => -rd * tn + (z + E) / cos; // a point on the underside, along the bottom edge
  const notch = (zA) => {
    const A = bot(zA);
    return [[A, 0], [A + FW * p * Math.sin(ang), FW * p * cos], [A + FW / cos, 0]];
  };
  const n1 = notch(0);
  const n2 = notch(D - FW);
  const F = new Fig({ x0: -rd * tn - 4, x1: Lr + 4, y0: -16, y1: rd + 12, w: 760, pad: [40, 16, 56, 16] });
  F.poly([[0, rd], [Lr, rd], [Lr - rd * tn, 0], ...n2.slice().reverse(), ...n1.slice().reverse(), [-rd * tn, 0]], 'wood');
  F.poly(n1, 'areafill');
  F.poly(n2, 'areafill');
  F.text(Lr / 2, rd / 2, `${g.rafterSize} rafter — crown up ↑`, { cls: 'note' });
  F.dimH(0, Lr, rd, `${ftin(Lr)} along the top edge, long point to long point`, -18);
  F.dimH(-rd * tn, n1[0][0], 0, ftin(E / cos), 20);
  F.dimH(n1[0][0], n1[2][0], 0, inch(FW / cos), 20);
  F.dimH(-rd * tn, n2[0][0], 0, ftin((E + D - FW) / cos), 40);
  F.dimH(n2[0][0], n2[2][0], 0, inch(FW / cos), 20);
  F.text(-rd * tn, -16, 'low end (back, over the water)', { a: 'start', cls: 'note', dy: 20 });
  F.text(Lr, -16, 'high end (front, over the door)', { a: 'end', cls: 'note', dy: 20 });
  return F.svg('Rafter pattern for the single-slope roof');
}

function roofFig(d) {
  const g = d.g;
  const { E, FW, p, cos, rd, D, PH, bt } = g;
  const lowH = d.info.lowH;
  const ub = (z) => lowH + (z - FW) * p;
  const top = (z) => ub(z) + rd / cos;
  const F = new Fig({ x0: -E - 8, x1: D + E + 8, y0: -4, y1: top(D + E) + 6, k: 4.6, pad: [30, 16, 30, 70] });
  F.line(-E - 8, 0, D + E + 8, 0, 'ground');
  F.rect(0, 0, bt, PH, 'block');
  F.rect(D - bt, 0, D, PH, 'block');
  F.rect(0, PH, FW, lowH, 'wood');
  F.rect(D - FW, PH, D, g.Hf, 'wood');
  F.rect(FW, PH, D - FW, PH + 1.5, 'ghost');
  F.poly([[-E, ub(-E)], [0, ub(0)], [0, lowH], [FW, lowH], [D - FW, ub(D - FW)], [D - FW, g.Hf], [D, g.Hf], [D + E, ub(D + E)], [D + E, top(D + E)], [-E, top(-E)]], 'wood');
  for (const z of g.purlinZ) F.rect(z - 1.75, top(z), z + 1.75, top(z) + 1.5, 'wood hl');
  F.rect(-E - 0.75, top(-E) - 5.5, -E, top(-E), 'wood2');
  F.rect(D + E, top(D + E) - 5.5, D + E + 0.75, top(D + E), 'wood2');
  F.dimH(-E, 0, top(-E), ftin(E), -16);
  F.dimH(D, D + E, top(D + E), ftin(E), -16);
  F.dimH(0, D, 0, ftin(D), 18);
  F.dimV(0, lowH, -E - 4, ftin(lowH), -8, { rot: true });
  F.dimV(0, g.Hf, -E - 4, ftin(g.Hf), -26, { rot: true });
  F.text(-E, 0, 'water side', { a: 'start', cls: 'note', dy: 30 });
  F.text(D + E, 0, 'door side', { a: 'end', cls: 'note', dy: 30 });
  F.text(-E - 8, top(D + E) + 6, `The roof falls ${g.pitch}-in-12 toward the water. Orange = purlins.`, { cls: 'note', a: 'start', dy: -20 });
  return F.svg('Side view of the roof framing');
}

function pitFig(d, P) {
  const g = d.g;
  const F = px(760, 240);
  const k = 2.2, x0 = 220, y0 = 50;
  const w = g.PIT.l * k, h = P.pitDepth * k;
  F.add(`<rect x="0" y="${y0}" width="760" height="${240 - y0}" class="earth"/><path d="M0 ${y0}H760" class="ground"/>`);
  F.add(`<rect x="${x0}" y="${y0}" width="${w}" height="${h}" style="fill:var(--panel)"/>`);
  for (let y = y0; y < y0 + h; y += 8 * k) for (const x of [x0 - 13, x0 + w]) F.add(`<rect x="${x}" y="${y + 1}" width="13" height="${8 * k - 3}" class="block"/>`);
  const wt = y0 + P.waterTable * k;
  if (P.pitDepth > P.waterTable) F.add(`<rect x="${x0}" y="${wt}" width="${w}" height="${y0 + h - wt}" class="water"/><path d="M0 ${wt}H760" class="tide"/>`);
  F.add(`<rect x="${x0 - 26}" y="${y0 - 9}" width="${w + 52}" height="9" class="conc"/><rect x="${x0 + w / 2 - 20}" y="${y0 - 13}" width="40" height="5" class="conc"/>`);
  F.text(x0 + w + 40, y0 + 30, `${ftin(P.pitDepth)} deep, ${ftin(g.PIT.w)} × ${ftin(g.PIT.l)} inside`, { a: 'start', cls: 'note' });
  F.text(x0 + w + 40, y0 + 50, 'block laid with open joints', { a: 'start', cls: 'note' });
  F.text(x0 + w + 40, y0 - 4, '4" lid with an 18" access cover', { a: 'start', cls: 'note' });
  if (P.pitDepth > P.waterTable) F.text(40, wt - 8, `groundwater at ${ftin(P.waterTable)}`, { a: 'start', cls: 'note' });
  return F.svg('Section through the pit');
}

// ---------------------------------------------------------------- the guide
export function renderToiletGuide(host, { d, P, bom }) {
  const g = d.g;
  const i = d.info;
  const q = d.q;
  const pit = P.waste === 'pit';
  const clad = P.cladding === 'pvc' ? 'PVC' : 'metal';
  const buy = (k) => bom.lines.filter((l) => l.key === k).reduce((s, l) => s + l.buy, 0);
  const lumber = (re) => {
    const rows = new Map();
    for (const l of q.lumber) {
      if (!re.test(l.label)) continue;
      const k = `${l.label}|${l.size}|${r8(l.len)}`;
      const r = rows.get(k) || { label: l.label, size: l.size, len: r8(l.len), n: 0 };
      r.n++;
      rows.set(k, r);
    }
    return [...rows.values()];
  };
  const cutList = (re, title) => {
    const rows = lumber(re);
    if (!rows.length) return '';
    return `<div class="table-wrap"><table class="t g-cut"><thead><tr><th>${title}</th><th>Size</th><th class="n">Pieces</th><th class="n">Length</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${r.label}</td><td>${r.size}</td><td class="n">${r.n}</td><td class="n"><b>${ftin(r.len)}</b></td></tr>`).join('')}</tbody></table></div>`;
  };
  const W = g.W, D = g.D;
  const nRaf = g.rafterXs.length;
  const bags = buy('cement');

  // ---------------------------------------------------------- 3D pictures
  const top = d.bounds.max[1];
  const house = { min: [-g.R, 0, -g.E], max: [W + g.R, top, D + g.E] };
  const slabBox = { min: [-6, -6, -14], max: [W + 6, g.y0 + 4, g.Ds + 4] };
  const lowBox = { min: [-6, 0, -6], max: [W + 6, g.y0 + g.PH + 6, g.Ds + 4] };
  const shots = [
    { id: 'overview', step: TSTEP.DONE, box: house, dir: [0.62, 0.42, 1], zoom: 1.1 },
    { id: 'site', step: TSTEP.DONE, box: d.siteBounds, dir: [0.25, 0.45, 1] },
    { id: 'drain', step: TSTEP.DRAIN, box: { min: [g.tx - 16, -10, g.zc - 6], max: [g.tx + 16, g.y0 + 2, g.zo + 8] }, dir: [0.9, 0.5, 0.6], ground: false },
    { id: 'forms', step: TSTEP.FORMS, box: slabBox, dir: [0.6, 0.9, 1] },
    { id: 'slab', step: TSTEP.SLAB, box: slabBox, dir: [0.6, 0.9, 1] },
    { id: 'blocks', step: TSTEP.BLOCKS, box: lowBox, dir: [0.6, 0.8, 1] },
    { id: 'frame', step: TSTEP.FRAME, box: house, dir: [0.62, 0.5, 1] },
    { id: 'roof', step: TSTEP.ROOF_FRAME, box: house, dir: [0.62, 0.6, 1] },
    { id: 'purlins', step: TSTEP.PURLINS, box: house, dir: [-0.62, 0.8, -1] },
    { id: 'roofing', step: TSTEP.ROOFING, box: house, dir: [-0.62, 0.8, -1] },
    { id: 'screens', step: TSTEP.SCREENS, box: house, dir: [1, 0.35, 0.4] },
    { id: 'siding', step: TSTEP.SIDING, box: house, dir: [1, 0.35, 0.6] },
    { id: 'door', step: TSTEP.DOOR, box: { min: [g.r0 - 14, 0, D - 6], max: [g.r1 + 14, g.y0 + g.Hf + 4, D + 8] }, dir: [0.25, 0.15, 1] },
    {
      id: 'toilet', step: TSTEP.TOILET, box: { min: [6, g.y0, 0], max: [W - 6, g.y0 + 50, D - 16] }, dir: [0.25, 1.1, 1],
      hide: (pt) => ['roof', 'roofing', 'purlins'].includes(pt.group) || /55-gal/.test(pt.name || '') || (pt.pos && pt.pos[2] > D - 8 && pt.kind !== 'inst' && pt.group !== 'slab'),
    },
    { id: 'waste', step: TSTEP.WASTE, box: d.siteBounds, dir: [0.4, 0.6, 1] },
    { id: 'done', step: TSTEP.DONE, box: house, dir: [-0.8, 0.4, -1], zoom: 1.1 },
  ];

  // ---------------------------------------------------------- text
  const tools = [
    ['Tape measures', 'a 25\' tape, and a 100\' tape for the pipe'],
    ['String, stakes and a line level', 'to lay out the slab and the trench'],
    ['Chalk line, pencils, marker', ''],
    ['Speed square and a 4\' level', ''],
    ['Shovel, pick or digging bar', 'for the trench and the slab'],
    ['Wheelbarrow or mixing tub, a hoe, six 5-gal buckets', 'for concrete and mortar'],
    ['Hand tamper', 'to pack the fill'],
    ['Mason\'s trowel and a mortar board', 'for laying block'],
    ['Wood float and a straight 2x4', 'to finish the slab'],
    ['Hacksaw', 'for PVC pipe and the rebar'],
    ['Circular saw and handsaw', ''],
    [clad === 'PVC' ? 'Fine-tooth saw blade' : 'Tin snips', clad === 'PVC' ? 'for the PVC sheets' : 'for the metal sheets'],
    ['Framing hammer and a sledge hammer', 'the sledge for the form stakes'],
    ['Drill/driver', 'with a 5/16" nut driver for the roofing screws, and wood bits'],
    ['Hammer drill', 'with a 3/16" masonry bit (door jamb screws)'],
    ['Wrench or socket', '3/4", for the anchor bolt nuts'],
    ['Staple gun', 'with stainless staples, for the screen'],
    ['Stepladder', ''],
    ['Safety gear', 'safety glasses, gloves, rubber gloves and boots for concrete, a dust mask'],
  ];
  const gloss = [
    ['Slab', `the ${inch(g.T)} concrete floor everything stands on`],
    ['Form', 'boards that hold wet concrete in shape until it hardens'],
    ['Wire mesh', 'a steel grid set in the middle of the slab to stop it cracking'],
    ['Hollow block', `a concrete block with two holes (cells) through it; ${P.blockT}" thick here`],
    ['Course', 'one row of blocks'],
    ['Mortar', 'cement and sand paste that blocks are laid in'],
    ['Grout', 'runny concrete poured into the block cells'],
    ['Dowel', 'a bent steel bar (rebar) from the slab up into a grouted cell'],
    ['Anchor bolt', 'a bolt set in a grouted cell that holds the wood plate down'],
    ['Plate', 'a flat 2x4 at the bottom or top of a wall'],
    ['Stud', 'an upright 2x4 in a wall'],
    ['King / trimmer stud', 'the full-height stud / the shorter one under the header, each side of the door'],
    ['Header', 'the doubled 2x4 over the door'],
    ['Girt', 'a flat 2x4 across the studs that the wall sheets screw to'],
    ['Rafter', 'a sloping roof board from the back wall to the front wall'],
    ['Birdsmouth', 'the notch in a rafter where it sits on a wall'],
    ['Plumb / level', 'exactly vertical / exactly horizontal'],
    ['Frieze block', 'a short 2x4 between rafters on top of a wall, closing the gap'],
    ['Purlin', 'a 2x4 laid flat across the rafters; the roof sheets screw to these'],
    ['Fascia', 'the board across the ends of the rafters'],
    ['Closet flange', 'the round fitting in the floor the toilet bowl sits on'],
    ['Trap', 'the U-bend in the bowl that holds water and keeps smells down'],
    ['Vent', 'the 2" pipe up through the roof that lets the drain breathe'],
    ['Cleanout', 'a capped opening in the drain for clearing a blockage'],
    ['Fall', 'how much a pipe drops along its length; here 1/4" for every foot'],
    ['Toenail', 'a nail driven at a slant through one board into another'],
  ];

  const parts = [];
  parts.push({
    id: 'start', title: 'Before you start', intro: 'Read this part once all the way through before you buy anything or pick up a tool.',
    steps: [
      { title: 'How to use this guide', html: `<p>This guide takes you from bare ground to a working toilet house, one step at a time. It is written for someone who has never built anything. All the numbers come from your design: change a size in the sidebar and the guide changes with it.</p>
        ${ul([
          'Work through the parts <b>in order</b>: the pipe goes in before the concrete, the screen before the wall sheets.',
          'Read a whole step before you start it, and get everything ready first.',
          'In the 3D pictures, <b>the parts in orange are the ones you add in that step</b>.',
          'Measure in place before you cut: if your block wall comes out a little bigger or smaller, cut the wood to what is really there.',
          'Tick <b>Done</b> on each step as you finish it.',
        ])}
        ${tip('Two people can build all of it. Have three or four for the slab pour and for laying the pipe out into the water.')}` },
      { title: 'What you are building', html: `<p>A ${ftin(W)} × ${ftin(D)} toilet house with its back to the water:</p>
        ${ol([
          `a ${inch(g.T)} concrete slab with a step in front of the door, and the drain pipe cast in under it;`,
          `a ${P.courses}-course-high wall of ${P.blockT}" hollow block around the edge, held to the slab with steel dowels;`,
          '2x4 walls bolted on top, with a screened vent high up along both side walls;',
          `a roof that slopes down toward the water, in ${clad} sheets, and ${clad} sheets on the walls;`,
          'an outward-opening board door;',
          `a pour-flush toilet bowl, flushed with a bucket of seawater, draining ${pit ? 'to a block-lined pit' : `${P.outfall} ft out into the lagoon`}.`,
        ])}
        ${figs(shotFig('overview', '<b>The finished toilet house</b>, door side.'))}
        ${figs(figure(siteFig(d, P), '<b>The site, from the side</b> (not to scale).'))}` },
      { title: 'Tools', html: `<div class="g-tools">${tools.map(([a, b]) => `<div><b>${a}</b>${b ? `<span>${b}</span>` : ''}</div>`).join('')}</div>` },
      { title: 'Stay safe', html: ul([
        '<b>Wet cement burns skin.</b> Rubber gloves, boots and long sleeves when you mix or pour. Wash it off with fresh water straight away.',
        '<b>Eyes:</b> safety glasses when you cut metal, drill, or cut rebar.',
        '<b>Saws:</b> support the board on both sides of the cut and keep hands clear of the blade\'s path.',
        '<b>Trenches in sand cave in.</b> Keep them shallow and never lie in one.',
        '<b>In the water:</b> lay the pipe at low tide in calm weather, never alone, and watch the current and the waves.',
        '<b>PVC cement</b> fumes: use it in the open air, away from flames.',
        '<b>Heat:</b> drink plenty of water and work in the cooler hours.',
      ]) },
      { title: 'Words you will see', html: `<div class="g-gloss">${gloss.map(([a, b]) => `<div><b>${a}</b>: ${b}</div>`).join('')}</div>${figs(figure(lumberSizes(), '<b>Lumber sizes.</b> A "2x4" is really 1-1/2" × 3-1/2".'))}` },
      { title: 'Basic skills', html: `<p>The same few skills come up again and again. Practise on scraps first.</p>
        ${ul([
          '<b>Measure and mark</b> with a V, square a line across with the speed square, cut on the waste side.',
          '<b>Nail</b>: face-nail straight through, end-nail through one board into the end of another, toenail at a slant about 1" from the end.',
          '<b>Level and plumb</b>: the bubble between the lines.',
          '<b>Square</b>: both diagonals of a rectangle the same length.',
        ])}
        ${figs(figure(measureMark(), 'Measure, mark and cut.'), figure(nailing(), 'Face nail, end nail and toenail.'), figure(levelPlumb(), 'Level and plumb.'))}` },
    ],
  });

  parts.push({
    id: 'site', title: 'Choose the spot and lay it out', intro: 'Where the toilet goes decides whether it works. Take your time over this part.',
    steps: [
      { title: 'Check the spot', html: `${ol([
        '<b>Ask first.</b> Talk to the family that owns the land and the reef in front of it, the neighbours, the municipality and Chuuk State EPA before you dig or lay a pipe.',
        `<b>Height above the sea.</b> Watch a full spring tide (around new and full moon). The floor of the toilet will be ${inch(g.y0)} above the ground; it should be at least 2–3 ft above the highest water you have seen, storms included. If it isn't, raise "Floor above the ground" in the sidebar or move up the beach.`,
        `<b>Groundwater.</b> At high tide, dig a test hole where the toilet will go and measure down to the water. The design assumes ${ftin(P.waterTable)}.`,
        pit ? '<b>Wells.</b> The pit must be at least 100 ft from any well.' : `<b>Where the pipe goes.</b> Walk the line from the back of the toilet straight down the beach and ${P.outfall} ft out. At the end the water must still be a few feet deep at the lowest tide, and moving. Drop a coconut off the end on a falling tide: it should drift away from where people swim, wash and fish.`,
        `<b>Which way it faces.</b> The back wall faces the water and the door faces away from it. The back wall is ${P.shore} ft from the water's edge.`,
      ])}${figs(shotFig('site', `<b>The whole site</b>: the toilet house, ${pit ? 'the pit behind it' : 'and the pipe down the beach and out into the lagoon'}.`))}` },
      { title: 'Mark out the slab', html: `${need(['8 wooden stakes and a sledge hammer', 'string', 'a 100\' tape'])}
        ${ol([
          `The slab is <b>${ftin(W)} wide and ${ftin(g.Ds)} long</b>: ${ftin(D)} for the toilet house and ${ftin(g.Ds - D)} for the step in front of the door.`,
          'Drive a stake at one back corner. Measure along the line of the back and drive the second back stake.',
          'Measure the two sides out from the back stakes, at a right angle (use 3-4-5), and drive the front stakes.',
          `Measure both diagonals. They should both be <b>${ftin(Math.hypot(W, g.Ds))}</b>. Move the front stakes until they are.`,
          'Set a pair of stakes about 2\' outside each corner with a board across them (batter boards), and run strings between them over the corner stakes. The strings show the edge of the slab even after you dig.',
        ])}${figs(figure(squareCheck(ftin(Math.hypot(W, g.Ds))), 'Square the corners: both diagonals equal.'))}` },
    ],
  });

  // drain
  const trench0 = -(g.yd0 - i.pr);
  const trench1 = -(g.ydc - i.pr);
  parts.push({
    id: 'drain', title: 'Lay the drain under the slab', intro: 'The drain has to go in first, because the slab is poured over it.',
    steps: [
      { title: 'Dig the trench and lay the pipe', html: `${need([`${P.pipeD}" PVC pipe and a ${P.pipeD}" closet bend`, `a ${P.pipeD}" × ${P.pipeD}" × 2" sanitary tee`, `a ${P.pipeD}" wye with a screw-plug cleanout`, `a ${P.pipeD}" closet flange`, 'PVC primer and cement, a hacksaw'])}
        ${ol([
          `Mark the centre of the toilet drain: <b>${inch(g.tx)} from the left edge of the slab</b> (standing at the door, looking toward the water) and <b>${inch(g.zo)} from the back edge</b>. That puts the bowl ${inch(g.ROUGH_IN)} out from the inside face of the back block wall.`,
          `Dig a trench from there straight back, past the back edge of the slab by about a foot. At the toilet the bottom is <b>${inch(trench0)}</b> below the ground; at the cleanout, ${inch(-g.zc)} behind the slab, it is <b>${inch(trench1)}</b> down. Firm and smooth the bottom.`,
          `Dry-fit the pieces in the trench first: the closet bend standing up at the toilet mark, a short pipe back to the sanitary tee right behind it (its 2" outlet pointing straight up, ${inch(g.zv)} from the back edge of the slab, so the vent rises against the inside of the back wall), then pipe on to the wye just outside the slab.`,
          'Check the fall with a level: 1/4" for every foot, downhill toward the water.',
          'Glue every joint (below). Point the wye\'s branch straight up and fit a short pipe and the screw plug so it ends 2–3" above the ground: this is the cleanout.',
          `Cut the closet bend so its top is exactly at the finished floor (${inch(g.y0)} above the ground), and fit the closet flange on it. Cap the flange and the tee's vent outlet with tape and a plastic bag, so no concrete gets in.`,
          'Fill around the pipe with sand and pack it gently by hand, so it can\'t move when you pour.',
        ])}
        ${figs(figure(drainFig(d, P), '<b>The drain under the slab</b>, from the side. The water is to the left.', 'wide'))}
        ${figs(figure(pvcGlue(), 'Gluing PVC.'), figure(slopeCheck(), 'Checking the fall.'))}
        ${figs(shotFig('drain', '<b>The drain</b>, seen from below ground: closet bend, tee for the vent and the cleanout.'))}
        ${warn('Once the concrete is poured you can\'t move this pipe. Check the position, the fall and every glued joint twice.')}` },
    ],
  });

  // slab
  const dowelLen = g.PH - 3.5 + g.T + 10;
  parts.push({
    id: 'slab', title: 'Pour the slab', intro: `${ftin(W)} × ${ftin(g.Ds)} of ${inch(g.T)} concrete, with wire mesh and ${i.cells} steel dowels for the block wall.`,
    steps: [
      { title: 'Set the forms', html: `${need([`1x6 form boards and 2x4 stakes`, '16d nails, a level'])}
        ${ol([
          `Nail 1x6 boards on edge to 2x4 stakes driven into the ground along the strings, ${g.layers > 1 ? `${g.layers} boards high, ` : ''}so the inside faces of the boards are on the string lines.`,
          `Set the top edges of the boards ${inch(g.y0)} above the ground and <b>level</b> all the way round. The top of the boards is the top of the floor.`,
          'Brace the stakes so the boards can\'t bulge out when they are full of concrete.',
          g.y0 > g.T ? `Fill inside the forms with sand or crushed coral to ${inch(g.T)} below the top of the boards. Wet it and tamp it hard.` : null,
        ])}${figs(shotFig('forms', '<b>Forms, plastic, mesh and dowels</b>, ready for the concrete.'))}` },
      { title: 'Plastic, mesh and dowels', html: `${need(['6-mil plastic', 'wire mesh, tie wire', `${i.cells} #4 rebar dowels, each ${ftin(dowelLen)} long, bent to an L with a 10" foot (cut from ${plural(buy('rebar'), '20\' bar')})`])}
        ${ol([
          'Lay plastic over the fill and up the inside of the forms. Cut a cross where the drain comes up and tape the plastic round the pipe.',
          `Lay the wire mesh 3" in from the forms${q.mesh.length > 1 ? `, overlapping the strips by 6" and tying them` : ''}. Cut it round the drain. Set it on small stones about ${inch(g.T / 2)} high.`,
          'Bend each dowel: put the bar in a short piece of pipe or a hole in a block and pull it over to a right angle, 10" from one end.',
          `Stand the dowels where the drawing shows, in the middle of the block wall line: ${g.cells.length} of them, at each corner, each side of the door and under every anchor bolt. The foot lies in the slab, the bar stands up plumb. Tie each one to the mesh with wire so it stays put.`,
        ])}
        ${figs(figure(slabPlanFig(d, P), '<b>Plan of the slab</b>: the block wall line, the dowels (orange ones get an anchor bolt later) and the drain.', 'wide'))}
        ${tip('Real blocks have their holes in fixed places. Before you pour, lay a few blocks dry along the wall line to see where the holes fall, and move each dowel a couple of inches if needed so it lands in a hole.')}` },
      { title: 'Mix and pour', html: `${need([`${plural(bags, 'bag')} of cement (this pour and the grout later)`, 'clean sand, gravel or crushed coral, and fresh water', '3 or 4 people'])}
        ${ol([
          `This slab is ${num(q.slabFt3, 1)} ft³: about ${Math.ceil(q.slabFt3 / 3.7)} batches, each one bag of cement mixed 1 bucket of cement : 2 of sand : 3 of gravel, with about half a bucket of water.`,
          'Start at the back, away from the step. Fill to a little above the forms, and pull the mesh up into the middle of the concrete as you go.',
          'Work the concrete in around the pipe and the dowels with a stick so there are no holes.',
          'Pull a straight 2x4 across the top of the forms in a sawing motion to level it. Fill low spots and level again.',
          'Make the floor fall about 1/4" toward the door so it can be washed out.',
          'When the shine has gone off the top, smooth it with the wood float.',
        ])}
        ${figs(figure(concreteMix(), 'Measure everything with the same bucket.'), shotFig('slab', '<b>The slab</b>, poured.'))}` },
      { title: 'Let it cure', html: `${ol([
        'Cover the slab with plastic or wet sacks and keep it wet for a week.',
        'Take the forms off after 2 days. Wait 3 days before you lay any block on it.',
      ])}${check(['The dowels are plumb and in the wall line.', 'The flange is flush with the floor and still capped.', 'The slab has been kept wet for a week.'])}` },
    ],
  });

  // block wall
  const cellRows = ['back', 'front', 'left', 'right'].map((k) => {
    const cs = g.cells.filter((c) => c.wall === k).sort((a, b) => a.u - b.u);
    const bolts = g.walls[k].bolts;
    return `<tr><td><b>${Cap(WALL_NAME[k])}</b></td><td>${cs.map((c) => `${ftin(c.u)}${bolts.some((u) => Math.abs(u - c.u) < 6) ? ' <b>B</b>' : ''}`).join(', ')}</td></tr>`;
  }).join('');
  parts.push({
    id: 'blocks', title: 'Build the block wall', intro: `${plural(P.courses, 'course')} of ${P.blockT}" hollow block round the edge of the slab, ${ftin(g.PH)} high, with a ${ftin(g.r1 - g.r0)} gap for the door.`,
    steps: [
      { title: 'Lay the blocks', html: `${need([`${buy('block')} hollow blocks`, 'mortar: 1 cement to 4 sand', 'a trowel, a string line and a level', 'a strip of plastic for under the bottom plates'])}
        ${ol([
          `Snap chalk lines on the slab for the outside of the wall: flush with the back and side edges of the slab, and ${ftin(D)} from the back for the front wall. Mark the door gap: ${inch(g.r0)} to ${inch(g.r1)} from the left corner of the front wall.`,
          'Lay the blocks dry first, along the lines, to see how they fit. The drawings show where the cut blocks go (shaded). Cut a block by scoring it all round with a cold chisel and hammer, then tapping it apart.',
          'Spread a bed of mortar about 1" thick along the line, set the corner block on it, and tap it down until it is level both ways and the joint is about 3/8". Do all four corners and both sides of the door gap first.',
          'Stretch a string between the corner blocks at their top outside edge, and lay the blocks between them to it. Butter one end of each block with mortar before you set it against the last one.',
          'Next course: start the corners the other way round, so every joint sits over the middle of a block below. Again corners first, then fill in to the string.',
          'Scrape off the mortar that squeezes out, and smooth the joints with a piece of bent pipe when they start to firm up.',
          'Check every course for level, and the corners for plumb.',
        ])}
        ${figs(figure(blockBond(), 'Joints staggered at the corners.'), figure(blockString(), 'Corners first, then a string line.'))}
        ${figs(...Array.from({ length: Math.min(P.courses, 2) }, (_, k) => figure(courseFig(g, k), k ? 'Course 2 (and every even course).' : 'Course 1 (and every odd course). Shaded blocks are cut.')))}
        ${figs(figure(mortarMix(), 'Mortar and grout.'))}` },
      { title: 'Grout the cells and set the bolts', html: `${need([`${buy('bolt')} anchor bolts (1/2" × 8", with nuts and washers)`, 'concrete made with small gravel'])}
        ${ol([
          'Fill every block cell that has a dowel in it with concrete, all the way to the top. Poke it down with a stick as you go so there are no gaps.',
          'Before it sets, push an anchor bolt, thread up, into each cell marked <b>B</b> below, until 2-1/2" sticks up above the block. That is enough for the plate, the washer and the nut.',
          'Drill a 9/16" hole through each bottom-plate 2x4 at the bolt positions first, lay it on the blocks, and push the bolts in through the holes. Then the bolts are exactly where the plate needs them. Lift the plate off while the concrete sets.',
          'Leave it for 3 days, kept damp.',
        ])}
        <div class="table-wrap"><table class="t g-cut"><thead><tr><th>Wall</th><th>Grouted cells, from the left end as you face the wall from outside (B = anchor bolt)</th></tr></thead><tbody>${cellRows}</tbody></table></div>
        ${figs(figure(cellFig(d, P), '<b>A grouted cell</b>: the dowel ties the block wall to the slab, the bolt ties the wood to the block.', 'wide'), shotFig('blocks', '<b>The block wall</b>, with the door gap.'))}
        ${check(['Every course level, corners plumb.', 'Cells with dowels filled solid.', `All ${q.bolts} bolts standing straight up in the right places.`])}` },
    ],
  });

  // framing
  const wallSteps = ['back', 'front', 'left', 'right'].map((k) => {
    const w = g.walls[k];
    const side = !!w.rake;
    return `<details class="g-bay"${k === 'back' ? ' open' : ''}><summary>${Cap(WALL_NAME[k])} wall <span>— ${ftin(w.L)} long${side ? `, top sloping from ${ftin(w.rake.top0)} to ${ftin(w.rake.top1)}` : ''}</span></summary><div>
      ${figure(wallFig(d, k), `${Cap(WALL_NAME[k])} wall, seen from outside.${side ? ' The dashed band is the vent.' : k === 'front' ? ' The shaded area is the door opening.' : ''}`, 'wide')}${wallTable(d, k)}</div></details>`;
  }).join('');
  parts.push({
    id: 'frame', title: 'Frame the walls', intro: 'Four 2x4 walls on the blocks: the back one low, the front one high, and the two sides with sloping tops.',
    steps: [
      { title: 'Build the back and front walls', html: `${ol([
        'Lay a strip of plastic on top of the blocks where the plates go.',
        'Build each wall flat on the slab. Lay the bottom plate (with its bolt holes already drilled) and the top plate side by side, and mark the stud positions on both from the drawings.',
        'Cut the studs to the lengths in the tables. Stand them between the plates at the marks and end-nail through each plate into the stud with two 16d nails.',
        'Front wall: frame the door with a king stud and a shorter trimmer stud each side, the doubled header on top of the trimmers, and short cripples above it.',
        'Nail in the flat girts between the studs at the heights shown. The wall sheets screw to these.',
        'Lift the wall up and down over its bolts. Put on the washers and nuts and tighten them. Check the wall is plumb and brace it with a diagonal 2x4 to a stake.',
      ])}${tip('A stud cut 1/8" too long is fine: tap it in. One cut short leaves a gap; cut a new one.')}` },
      { title: 'Build the side walls', html: `${ol([
        'Bolt the side bottom plates down between the back and front walls.',
        `Cut the raked top plate. It runs from the back wall to the front wall and slopes ${g.pitch}-in-12 like the roof: its top edge is ${ftin(g.walls.left.rake.top0)} above the floor at the back and ${ftin(g.walls.left.rake.top1)} at the front (the right wall is the same, mirrored). Cut both ends plumb at ${g.pitch}-in-12.`,
        'Nail the raked plate to the inside of the back and front walls\' end studs at those heights, checking the slope with the level and a ruler.',
        `Measure each stud in place from the bottom plate to the underside of the raked plate, cut its top at ${g.pitch}-in-12, and toenail it at both ends.`,
        `Nail in the girts, then the flat 2x4 vent sill at ${ftin(g.vb)} and vent head at ${ftin(g.vt)} all along both side walls. The gap between them is the vent.`,
        'Nail the corner studs of the side walls to the end studs of the back and front walls with 16d nails every 12".',
      ])}${wallSteps}${figs(shotFig('frame', '<b>All four walls framed</b> on the blocks.'))}
      ${check(['Walls plumb and square (equal diagonals across the top).', 'All bolts tight.', `Door opening ${ftin(g.r1 - g.r0)} wide between the trimmers and ${ftin(g.hRO)} tall.`])}` },
    ],
  });

  // roof
  const p0 = 0.75 / g.cos;
  const purlinMarks = g.purlinZ.map((z) => ftin((z + g.E) / g.cos + p0 - 1.75));
  parts.push({
    id: 'roof', title: 'Frame the roof', intro: `${plural(nRaf, `${g.rafterSize} rafter`)}, sloping ${g.pitch}-in-12 down toward the water, tied down at both ends.`,
    steps: [
      { title: 'Make a pattern rafter', html: `${ol([
        `Pick a straight ${g.rafterSize} and put the crown up.`,
        `Mark a plumb line at ${g.pitch}-in-12 at one end with the speed square and cut it: this is the low (back) end.`,
        `From the top corner, measure <b>${ftin(g.rafterLen)}</b> along the top edge, draw a parallel plumb line and cut it: the high (front) end.`,
        `<b>Back birdsmouth:</b> from the bottom corner of the low end, measure <b>${ftin(g.E / g.cos)}</b> along the bottom edge. Draw a plumb line there, and from <b>${inch(g.FW / g.cos)}</b> further along draw a line square to it. Cut out the triangle.`,
        `<b>Front birdsmouth:</b> from the same corner, measure <b>${ftin((g.E + D - g.FW) / g.cos)}</b> along the bottom edge and cut the same notch there.`,
        'Try it on the walls: both notches should sit flat on the top plates, with the overhangs equal at both ends. Then trace it onto the other boards.',
      ])}${figs(figure(rafterFig(g), '<b>The pattern rafter</b>, with both birdsmouths.', 'wide'), figure(speedSquare(g.pitch), 'Marking the plumb line.'))}` },
      { title: 'Set the rafters', html: `${ol([
        `Mark the rafter positions on both top plates, from the left end: ${g.rafterXs.map((x) => ftin(x - 0.75)).join(', ')} (to the left edge of each rafter). The two end rafters are flush with the outside of the side walls.`,
        'Set each rafter on its marks and toenail it to both plates with two 16d nails.',
        `Fix a hurricane tie at both ends of every rafter (${q.ties} ties), nailing every hole with the short tie nails.`,
        'Cut 2x4 frieze blocks to fit between the rafters on top of the back and front walls, and toenail them in. They close the gap at the top of the wall so insects and rain can\'t get in.',
        'Nail a 1x6 fascia across the rafter ends at both eaves.',
      ])}${figs(figure(roofFig(d), '<b>The roof from the side</b>: both walls, a rafter, the purlins (orange) and the fascia.', 'wide'), figure(hurricaneTie('wall framing'), 'A hurricane tie at each end of every rafter.'))}
      ${figs(shotFig('roof', '<b>Rafters, frieze blocks and fascia.</b>'))}${cutList(/^Rafter|^Frieze|^Fascia/, 'Roof framing')}` },
      { title: 'Purlins', html: `${ol([
        `Mark the purlin positions on the end rafters, measuring along the top from the outside face of the back (low) fascia to the lower edge of each purlin: ${purlinMarks.join(', ')}.`,
        `Nail each 2x4 flat across the rafters, two 16d nails at every rafter. They stick out ${inch(g.R)} past the side walls.`,
        'There is one purlin right over each wall: the roof sheets are sealed against these.',
        'Nail short 2x4 blocks between the purlins on top of each end rafter, to close the edge of the roof.',
      ])}${figs(shotFig('purlins', '<b>Purlins</b> across the rafters.'))}${cutList(/^Purlin|^Blocking between purlins/, 'Purlins')}` },
    ],
  });

  // roofing, screens, siding
  const nRoof = q.tin.filter((t) => t.use === 'roof').length;
  const sideLog = g.sidingLog.find((r) => r.wall === 'left');
  parts.push({
    id: 'sheets', title: 'Roof, vent screens and wall sheets', intro: `${nRoof} roof sheets, the insect screen, then ${q.tin.filter((t) => t.use === 'siding').length} wall sheets.`,
    steps: [
      { title: 'Roof sheets', html: `${ol([
        `Cut ${nRoof} sheets ${ftin(g.Ls)} long: one piece from the back eave to the front eave, no joints.`,
        'Start at the downwind side (west, with the usual east trade winds). Lay the first sheet flush with the ends of the purlins, overhanging the back fascia by 2" so the water drips clear.',
        'Screw through every other crest into every purlin, just until the washer squeezes.',
        'Lap the next sheet one corrugation over the first, and so on.',
        'Fill the hollows under the sheets over the two eave purlins (one over each wall) with expanding foam, so insects can\'t crawl in. Trim it when it has set.',
      ])}${figs(figure(tinLap(clad === 'PVC'), 'Lap and screws.'), figure(washerTight(), 'Snug, not crushed.'))}${figs(shotFig('roofing', '<b>The roof sheeted</b>, seen from the water side.'))}` },
      { title: 'Vent screens', html: `${ol([
        `Do this <b>before</b> the side-wall sheets, so the sheets hold the edges of the screen.`,
        `Cut two strips of fiberglass insect screen ${ftin(g.screenStrips[0]?.len || 0)} long and ${inch(g.screenStrips[0]?.h || 0)} wide.`,
        `Staple each one over the vent band on the outside of the side-wall framing, from the vent sill at ${ftin(g.vb)} to the vent head at ${ftin(g.vt)}, with stainless staples every 3". Keep it tight and flat.`,
      ])}${tip('Use fiberglass screen and stainless staples: steel and aluminium rust away in salt air within a year or two.')}${figs(shotFig('screens', '<b>Screens</b> stapled over both vent bands.'))}` },
      { title: 'Wall sheets', html: `${ol([
        'All sheets stand upright, from 1-1/2" below the top of the blocks (so rain runs onto the blocks, not into the wood) up to the roof.',
        'Front wall: cut out the door opening. Back wall: notch the top round the rafters.',
        `Side walls: the top is cut along the roof slope, and a band is cut out for the vent, from ${ftin(g.vb)} to ${ftin(g.vt)}. ${sideLog ? `Each side takes ${plural(sideLog.n, 'sheet')}.` : ''} Hold each sheet in place, mark the cuts from inside, take it down and cut it.`,
        'Screw through every other crest into the bottom plate, every girt, the vent sill and head, and the top plate.',
        'Seal along the bottom where the sheets meet the block.',
      ])}${figs(shotFig('siding', '<b>Wall sheets on</b>, with the vent band left open behind its screen.'))}
      ${check(['No gaps where insects can get in except through the screen.', 'Every sheet screwed along every girt.'])}` },
    ],
  });

  // door
  const nBoards = Math.ceil(P.doorW / 5.5);
  parts.push({
    id: 'door', title: 'The door', intro: `A ${inch(P.doorW)} × ${ftin(i.leafH)} board door that opens outward, with no lock: a pull and hook outside, a bolt inside.`,
    steps: [
      { title: 'Jambs, door and hardware', html: `${ol([
        `Line the door opening with 1x6 jambs: two sides ${ftin(g.hRO)} long and a head across the top. Fix them with concrete screws into the grouted block cells beside the door and 8d nails into the trimmer studs.`,
        'Nail 1x4 casing round the outside of the opening.',
        `Build the door flat: ${nBoards} 1x6 boards ${ftin(i.leafH)} long, trimmed to ${inch(P.doorW)} total, two 1x4 battens across them (6" from the bottom, 9-1/2" from the top), and a diagonal brace with its <b>low end on the hinge side</b>. Nail through into every board and bend the nail points over.`,
        'Stand the door in the opening on 1/2" spacers and screw three T-hinges on the outside: the leaf on the casing, the strap on the door, 8" from the top, the middle and 8" from the bottom. The door swings out, so it never hits the bowl.',
        'Fit the pull outside, a hook and eye outside to hold it shut in the wind, and a barrel bolt inside for privacy.',
      ])}${figs(figure(doorBuild({ w: P.doorW, h: i.leafH, boards: nBoards }), '<b>The door, from the inside</b> (batten side). Hinges are on the left from outside, so on the right here.'), shotFig('door', '<b>The door hung</b>, opening outward.'))}` },
    ],
  });

  // toilet
  parts.push({
    id: 'toilet', title: 'Toilet bowl and vent', intro: 'The pour-flush bowl sits on the flange; the vent goes up the back wall and out through the roof.',
    steps: [
      { title: 'Set the bowl', html: `${ol([
        'Take the cap off the flange. Check the drain is clear by pouring a bucket of water down it.',
        'Set the bowl on the flange dry to check it sits level and square to the back wall. Mark round its base.',
        'Lift it off, spread a ring of mortar round the flange inside the marks, set the bowl down onto it and press until it is level. Clean off the extra mortar.',
        'Don\'t use it for 2 days while the mortar sets.',
      ])}` },
      { title: 'Run the vent', html: `${ol([
        `Glue 2" PVC into the tee's outlet and run it straight up the inside of the back wall. Hold it with pipe straps at ${g.straps.map((v) => ftin(v)).join(', ')} above the floor, screwed to 2x4 blocks fitted between the studs.`,
        'Where it meets the roof, drill a hole through the sheet over the pipe (on a crest, between two purlins), and push the pipe through so it ends 12" above the roof.',
        'Slide the rubber pipe boot down over the pipe onto the sheet, press it into the corrugations and screw round its edge. Seal round the pipe.',
        'Glue on the vent cap with its insect screen.',
        `Set the 55-gal drum outside by the door and fill it with seawater, and keep a 5-gal bucket inside. To flush, pour about ${P.flushGal} gal into the bowl quickly.`,
      ])}${figs(shotFig('toilet', '<b>Inside</b> (roof and front wall left out of the picture): the bowl, the vent up the back wall and the flushing bucket.'))}` },
    ],
  });

  // waste
  if (pit) {
    parts.push({
      id: 'waste', title: 'Dig the pit', intro: `A block-lined pit ${ftin(g.PIT.gap)} behind the toilet, with a concrete lid.`,
      steps: [
        { title: 'Dig, line and cover the pit', html: `${ol([
          `Dig a hole ${ftin(g.PIT.w + 2 * g.bt + 6)} × ${ftin(g.PIT.l + 2 * g.bt + 6)}, ${ftin(P.pitDepth)} deep, ${ftin(g.PIT.gap)} behind the back wall, centred on the drain.`,
          'Line it with block laid with 1" gaps between them (no mortar in the upright joints), so liquid can soak away.',
          'Run the drain from the cleanout into the top of the pit, still falling 1/4" per foot.',
          'Cast a 4" concrete lid on the ground beside it, on plastic, with a 12" grid of rebar, and a separate 18" access cover with two handles. Set the lid over the pit when it has cured.',
          P.pitDepth > P.waterTable ? `With groundwater at ${ftin(P.waterTable)}, the bottom ${inch(P.pitDepth - P.waterTable)} of the pit will stand in water. Read the Waste system page before you choose this.` : null,
        ])}${figs(figure(pitFig(d, P), '<b>The pit</b> in section.'), shotFig('waste', '<b>The pit</b> behind the toilet house.'))}` },
      ],
    });
  } else {
    parts.push({
      id: 'waste', title: 'Lay the outfall', intro: `${Math.round(i.landRun / 12)} ft of buried pipe down the beach, then ${P.outfall} ft along the lagoon floor.`,
      steps: [
        { title: 'Cast the collars', html: `${ol([
          `Make ${g.collars.length} concrete collars, one for every 10 ft of pipe in the water, cast straight onto the pipe on dry land (below).`,
          'Lay out the lengths of pipe that will go in the water on the beach, in the order they will go out, and cast the collars 10 ft apart.',
        ])}${figs(figure(collarCast(), 'A collar cast on the pipe in a cut-down bucket.'))}` },
        { title: 'Down the beach', html: `${ol([
          `Dig a trench from the cleanout straight to the water's edge, about a foot deep and still falling 1/4" per foot. At the water's edge the pipe is about ${inch(i.drainDropAtShore)} below the toilet floor.`,
          'Lay and glue the pipe in the trench, checking the fall every few lengths with the level and a 1" block.',
          'At the water\'s edge, two 45° bends turn the pipe down onto the bottom.',
          'Backfill the trench. Sun makes PVC brittle and feet break it, so keep it covered.',
        ])}${figs(figure(slopeCheck(), 'The same fall all the way down.'))}` },
        { title: 'Out along the bottom', html: `${ol([
          'Wait for a calm day and a low spring tide.',
          'Glue the lengths with collars into one long run on the beach, let the joints set for an hour, and carry or float it out along the line. Glue it to the bends at the water\'s edge.',
          'Lay it straight along the bottom. Where the bottom is hard reef, chisel a shallow groove or pin each collar with a short piece of rebar driven into the reef.',
          'Glue the flap valve on the far end, flap hanging down, so water can come out but waves, sand and crabs can\'t push in.',
          'Pour a few buckets down the toilet and watch for bubbles from any joint.',
        ])}${figs(shotFig('waste', `<b>The outfall</b>: the buried drain and ${P.outfall} ft of pipe along the bottom.`))}
        ${warn('Never work in the water alone, and stay out of it in waves or strong current.')}` },
      ],
    });
  }

  parts.push({
    id: 'finish', title: 'Using it and looking after it', intro: '',
    steps: [
      { title: 'Rules for everyone', html: ul([
        `<b>Flush</b> with about ${P.flushGal} gal of seawater, poured in quickly. Keep the drum topped up: ${num(i.flushPerDay)} gal a day for ${P.users} people.`,
        '<b>Only toilet paper and water</b> down the bowl. No wipes, pads, plastic or rags: they block the pipe. Keep a lidded bin inside.',
        '<b>Keep the door shut</b> with the hook, so insects stay out.',
      ]) },
      { title: 'Looking after it', html: `${ul([
        pit ? 'Check how full the pit is every few months.' : 'If the toilet drains slowly, open the cleanout and push a length of pipe or a plumber\'s snake down the drain.',
        pit ? '' : 'After every storm, walk the line of the pipe at low tide and check the collars and the flap valve.',
        'Once a year: check the roof screws, the foam at the eaves, the screen and the hurricane ties.',
        'Wash the floor out toward the door.',
      ])}${figs(shotFig('done', '<b>Finished</b>, seen from the water side.'))}` },
    ],
  });

  renderGuide(host, {
    key: 't', title: 'Step-by-step: building the toilet house',
    lede: `<p class="lede">How to build the ${ftin(W)} × ${ftin(D)} toilet house and its ${pit ? 'pit' : 'seawater outfall'}, from bare ground to the first flush. Every measurement below comes from your design.</p>`,
    parts, shots, model: { parts: d.parts, bounds: d.bounds, maxStep: TSTEP.DONE },
  });
}
