// Step-by-step guide for the house's extras: insect screens, gutters and the
// rainwater tank. Drawings are made from the design; the parts and 3D
// pictures are added to the house guide by guide-house.js.
import { STEP } from './design.js';
import { ftin, inch, num } from './format.js';
import { tip, warn, check, need, figs, ol, ul } from './guide.js';
import { Fig, px, figure, shotFig, pvcGlue, concreteMix, mortarMix, blockString } from './guide-svg.js';

const plural = (n, a, b = a + 's') => `${n} ${n === 1 ? a : b}`;
const f1 = (v) => +v.toFixed(1);
const BT = 5.625; // a 6" block is really 5-5/8" thick

// arrow between pixel points
const arrowPx = (F, x1, y1, x2, y2, cls = 'arr') => {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const h = 7;
  F.add(`<path d="M${f1(x1)} ${f1(y1)}L${f1(x2)} ${f1(y2)}" class="${cls}"/><path d="M${f1(x2 - h * Math.cos(a - 0.45))} ${f1(y2 - h * Math.sin(a - 0.45))}L${f1(x2)} ${f1(y2)}L${f1(x2 - h * Math.cos(a + 0.45))} ${f1(y2 - h * Math.sin(a + 0.45))}" class="${cls} head"/>`);
};
// a pipe seen from the side, from (xa, ya) to (xb, yb), radius r (world units)
const pipeBand = (F, xa, ya, xb, yb, r, cls = 'pipe') => {
  const L = Math.hypot(xb - xa, yb - ya) || 1;
  const nx = (-(yb - ya) / L) * r;
  const ny = ((xb - xa) / L) * r;
  F.poly([[xa + nx, ya + ny], [xb + nx, yb + ny], [xb - nx, yb - ny], [xa - nx, ya - ny]], cls);
};
// half-round gutter seen end-on, rim at y, centred on x
const gutterEnd = (F, x, y, r, cls = 'pipe') => {
  const R = r * Math.abs(F.k);
  F.add(`<path d="M${F.X(x - r)} ${F.Y(y)}A${f1(R)} ${f1(R)} 0 0 0 ${F.X(x + r)} ${F.Y(y)}Z" class="${cls}"/>`);
};

// ---------------------------------------------------------------- drawings
// Section through the back eave (the front is the same, mirrored).
// mode: 'screen' highlights the screen and foam, 'gutter' the gutter.
export function eaveFig(d, mode) {
  const g = d.g;
  const { Rb, ringTop, pw, E, p, cos, rd, C } = g;
  const rn = g.rain;
  const sc = g.scr;
  const yT = ringTop + 1.5;
  const und = (x) => yT + (x - pw) * p;
  const top = (x) => und(x) + rd / cos;
  const xR = 14;
  const GR = 2.5;
  const rim = rn ? (mode === 'gutter' ? rn.rimHi : rn.rimLo) - g.y0 : 0;
  const xg = -E - 3.5;
  const yLo = Math.min(Rb - 6, rn ? rim - GR - 3 : Infinity, und(-E) - 3);
  const xL = rn ? xg - GR - 2 : -E - 4;
  const F = new Fig({ x0: xL, x1: xR + 1, y0: yLo, y1: top(xR) + 4, k: 9, pad: [14, 230, 30, 190] });
  // wall: framing, ring beam, plate, sheets
  F.rect(0, yLo, 3.5, Rb - 1.5, 'wood2');
  F.rect(0, Rb - 1.5, 3.5, Rb, 'wood');
  F.rect(0, Rb, Math.min(C, xR + 1), ringTop, 'conc');
  F.rect(0, ringTop, pw, yT, 'wood');
  F.line(-0.3, yLo, -0.3, Rb, 'tin');
  F.rect(3.5, yLo, 3.75, Rb, 'ply');
  // rafter, fascia, purlins, roof sheet
  F.poly([[-E, und(-E)], [0, und(0)], [0, yT], [pw, yT], [xR, und(xR)], [xR, top(xR)], [-E, top(-E)]], 'wood');
  F.rect(-E - 0.75, top(-E) - 5.5, -E, top(-E), 'wood2');
  const sn = Math.sin(Math.atan(p));
  const purl = [];
  for (const s of g.slopes[0].purlinS) {
    const x = -E + s * cos;
    if (x > xR) continue;
    const yy = top(x);
    const c1 = 1.75 * cos;
    const s1 = 1.75 * sn;
    const nx = -sn * 1.5;
    const ny = cos * 1.5;
    F.poly([[x - c1, yy - s1], [x + c1, yy + s1], [x + c1 + nx, yy + s1 + ny], [x - c1 + nx, yy - s1 + ny]], 'wood2');
    purl.push([[x - c1 + nx, yy - s1 + ny], [x + c1 + nx, yy + s1 + ny]]);
  }
  const sh = (x) => top(x) + 1.5 / cos + 0.4;
  const items = [];
  if (sc) {
    const [a, c] = purl[0];
    F.poly([a, c, [c[0], sh(c[0]) + 0.3], [a[0], sh(a[0]) + 0.3]], mode === 'screen' ? 'foam hl' : 'foam');
    items.push({ x: a[0] + 0.3, y: a[1] + 0.5, t: 'canned foam in every\ncorrugation over the purlin' });
  }
  F.line(-E - 2, sh(-E - 2), xR, sh(xR), 'tin');
  if (sc && sc.soffit.length) {
    F.poly([[-E + 0.06, und(-E) + 1.2], [-E + 0.06, und(-E) - 0.12], [-0.14, und(0) - 0.12], [-0.14, yT - 0.4]], mode === 'screen' ? 'scr hl' : 'scr', false);
    items.push(
      { x: -E * 0.55, y: und(-E * 0.55) - 0.15, t: 'insect screen, stapled under\nevery rafter' },
      { x: -E + 0.06, y: und(-E) + 0.8, t: 'front edge stapled to\nthe back of the fascia' },
      { x: -0.14, y: (und(0) + yT - 0.4) / 2, t: `back edge folded up ${inch(sc.fold)}\nand stapled to the wall plate` },
    );
  }
  if (rn) {
    gutterEnd(F, xg, rim, GR, mode === 'gutter' ? 'pipe hl' : 'pipe');
    F.rect(-E - 0.87, rim - 1.6, -E - 0.75, rim + 0.4, 'steelf');
    F.rect(xg - GR - 0.2, rim + 0.25, -E - 0.75, rim + 0.4, 'steelf');
    // water off the sheet into the gutter
    arrowPx(F, F.X(-E - 2), F.Y(sh(-E - 2)) + 3, F.X(xg + 0.4), F.Y(rim - 1.2), 'arr');
    items.push(
      { x: xg, y: rim - GR * 0.7, t: '5" PVC gutter' },
      { x: -E - 0.81, y: rim - 1.2, t: 'bracket: 2 screws\ninto the fascia' },
    );
    if (mode === 'gutter') items.push({ x: xg + GR, y: rim, t: `top of the gutter: ${inch(0.75)} below the\ntop of the fascia at the high end` });
  }
  items.push(
    { x: xR - 3, y: sh(xR - 3), t: 'roof sheet' },
    { x: -E - 0.4, y: top(-E) - 4.2, t: 'fascia (1x6)' },
    { x: 9, y: und(9) + rd / cos / 2, t: `rafter (${g.rafterSize})` },
    { x: pw / 2 + 1, y: yT - 0.75, t: '2x6 wall plate' },
    { x: Math.min(C, xR) / 2 + 1, y: (Rb + ringTop) / 2, t: 'ring beam' },
    { x: -0.3, y: yLo + 2, t: 'wall sheet' },
  );
  // things at the eave edge are labelled on the left, the rest on the right
  const edge = (it) => it.x < -E + 2;
  F.labels(items.filter(edge), F.X(xL) - 22, 'left');
  F.labels(items.filter((it) => !edge(it)), F.X(xR + 1) + 26, 'right');
  F.dimH(-E, 0, yLo, `${ftin(E)} eave`, 16);
  return F.svg(mode === 'gutter' ? 'Section through the eave, with the gutter on its bracket' : 'Section through the eave, with the insect screen and foam');
}

// A window screen frame, seen from inside the room.
export function screenFrameFig(g) {
  const FW = g.winRO.w + 3;
  const FH = g.winRO.h + 3;
  const bw = 2.5;
  const F = new Fig({ x0: -3, x1: FW + 3, y0: -2, y1: FH + 2, k: 5.2, pad: [34, 250, 40, 120] });
  F.rect(0.5, 0.5, FW - 0.5, FH - 0.5, 'scrf');
  F.rect(0, 0, FW, bw, 'wood');
  F.rect(0, FH - bw, FW, FH, 'wood');
  F.rect(0, bw, bw, FH - bw, 'wood2');
  F.rect(FW - bw, bw, FW, FH - bw, 'wood2');
  for (const [cx, cy, sx, sy] of [[0, 0, 1, 1], [FW, 0, -1, 1], [0, FH, 1, -1], [FW, FH, -1, -1]]) {
    const P = (a, b) => [cx + sx * a, cy + sy * b];
    F.poly([P(0.5, 0.5), P(3.5, 0.5), P(3.5, 1), P(1, 1), P(1, 3.5), P(0.5, 3.5)], 'steelf');
  }
  for (const y of [6, FH - 6]) F.rect(-1, y - 1, 0.3, y + 1, 'steelf');
  F.circle(FW + 1.2, FH / 2, 3, 'steelf');
  F.line(FW + 1.2, FH / 2, FW - 1.2, FH / 2 + 0.6, 'ln');
  F.lead(-0.4, FH - 6, -30, -12, 'hinge', { a: 'end' });
  F.lead(-0.4, 6, -30, 12, 'hinge', { a: 'end' });
  F.labels([
    { x: FW / 2 + 4, y: FH - bw / 2, t: `rail (1x3): ${ftin(FW)}, top and bottom` },
    { x: FW - bw / 2, y: FH * 0.7, t: `stile (1x3): ${ftin(FH - 2 * bw)}, each side` },
    { x: FW - 2, y: 1.5, t: 'corner brace at each corner' },
    { x: FW * 0.55, y: FH * 0.45, t: 'insect screen, stapled to\nthe back (the window side)' },
    { x: FW + 1.2, y: FH / 2, t: 'hook, and its eye\nin the wall' },
  ], F.X(FW + 3) + 22, 'right');
  F.dimH(0, FW, FH, ftin(FW), -18);
  F.dimV(0, FH, 0, ftin(FH), -96, { rot: true });
  return F.svg('Window screen frame seen from inside');
}

// Plan section through the hinge side of a window with its screen (generic).
export function screenSectionFig() {
  const F = px(700, 250);
  const k = 22;
  const x0 = 220;
  const y0 = 50; // outside face of the wall
  const Y = (dd) => y0 + dd * k;
  F.add(`<rect x="${x0 - 1.5 * k}" y="${Y(0)}" width="${1.5 * k}" height="${3.5 * k}" class="wood"/>`); // king stud
  F.add(`<rect x="120" y="${Y(3.5)}" width="${x0 - 120}" height="${0.25 * k}" class="ply"/>`);
  F.add(`<path d="M120 ${Y(-0.2)}H${x0}" class="tin"/>`);
  F.add(`<rect x="${x0 - 2 * k}" y="${Y(-0.95)}" width="${2 * k + 0.4 * k}" height="${0.75 * k}" class="wood2"/>`); // casing
  F.add(`<rect x="${x0 + 0.25 * k}" y="${Y(0.4)}" width="${k}" height="${2.7 * k}" class="alu"/>`);
  for (let i = 0; i < 2; i++) F.add(`<path d="M${x0 + 1.25 * k} ${Y(1.4 + i * 0.9)}L${560} ${Y(1.2 + i * 0.9)}" class="glass" stroke-width="3"/>`);
  // screen frame: stile laps 1-1/2" onto the wall
  const fy = Y(3.8);
  F.add(`<rect x="${x0 - 1.5 * k}" y="${fy}" width="${2.5 * k}" height="${0.75 * k}" class="wood hl"/>`);
  F.add(`<path d="M${x0 - k} ${fy - 1}H560" class="scr hl"/>`);
  // butt hinge: a leaf on the edge of the frame, a leaf on the wall
  const hx = x0 - 1.5 * k;
  F.add(`<path d="M${hx - 0.9 * k} ${fy - 1}H${hx}V${fy + 0.75 * k}" class="screw"/><circle cx="${hx}" cy="${fy - 1}" r="4" class="steelf"/>`);
  F.add(`<path d="M${hx + 14} ${fy + 50}a60 60 0 0 1 ${-40} -22" class="arr"/>`);
  F.text(0, 0, 'OUTSIDE', { cls: 'ttl', a: 'start', dx: 10, dy: 18 });
  F.text(0, 0, 'INSIDE (the room)', { cls: 'ttl', a: 'start', dx: 10, dy: 238 });
  const L = (x, y, tx, ty, t, a = 'start') => {
    F.add(`<path d="M${x} ${y}L${tx} ${ty}" class="lead"/><circle cx="${x}" cy="${y}" r="2" class="leaddot"/>`);
    F.text(0, 0, t, { a, dx: tx + (a === 'start' ? 4 : -4), dy: ty, cls: 'lab' });
  };
  L(x0 - 0.75 * k, Y(1.8), 150, 96, 'king stud', 'end');
  L(x0 + 0.75 * k, Y(1), 330, 28, 'louvre channel');
  L(470, Y(1.6), 490, 28, 'glass blades');
  L(150, Y(3.62), 120, 180, 'plywood', 'end');
  L(x0 + 0.6 * k, fy + 0.4 * k, 300, 206, 'screen frame (1x3), lapping 1-1/2" onto the wall');
  L(460, fy - 1, 480, 166, 'screen on the back of the frame');
  L(hx - 0.5 * k, fy - 1, 120, 140, 'hinge', 'end');
  F.text(0, 0, 'swings open\ninto the room', { cls: 'note', a: 'start', dx: hx + 22, dy: fy + 64 });
  return F.svg('Plan section through a window and its hinged screen');
}

// The fall of the gutters, seen from the front (exaggerated).
export function gutterFallFig(d) {
  const g = d.g;
  const rn = g.rain;
  const W = d.W;
  const R = g.R;
  const F = px(760, 250);
  const L = W + 2 * R;
  const X = (x) => f1(40 + ((x + R) / L) * 680);
  const yF = 70; // top of the fascia
  const drop = 34; // drawn fall, much bigger than real
  const yRim = (x) => {
    const t = Math.min(1, Math.abs(x - rn.xFar) / Math.abs(rn.xo - rn.xFar));
    return yF + 8 + drop * t;
  };
  F.add(`<rect x="${X(-R)}" y="${yF}" width="${f1(X(W + R) - X(-R))}" height="48" class="wood2"/>`);
  F.add(`<path d="M${X(rn.xFar)} ${yRim(rn.xFar)}L${X(rn.xo)} ${yRim(rn.xo)}L${X(rn.xNear)} ${yRim(rn.xNear)}" class="string"/>`);
  const pts = [[rn.xFar, yRim(rn.xFar)], [rn.xo, yRim(rn.xo)], [rn.xNear, yRim(rn.xNear)]];
  const top = pts.map(([x, y]) => `${X(x)} ${f1(y)}`).join('L');
  const bot = pts.slice().reverse().map(([x, y]) => `${X(x)} ${f1(y + 22)}`).join('L');
  F.add(`<path d="M${top}L${bot}Z" class="pipe hl"/>`);
  for (const x of rn.bracketXs) F.add(`<rect x="${f1(X(x) - 2)}" y="${f1(yRim(x) - 4)}" width="4" height="12" class="steelf"/>`);
  F.add(`<rect x="${f1(X(rn.xo) - 7)}" y="${f1(yRim(rn.xo) + 22)}" width="14" height="40" class="pipe"/>`);
  for (const x of [0, W]) F.add(`<path d="M${X(x)} 40V220" class="dimx"/>`);
  F.text(0, 0, 'left end wall', { cls: 'note', dx: X(0), dy: 30 });
  F.text(0, 0, 'right end wall', { cls: 'note', dx: X(W), dy: 30 });
  const fall = rn.rimHi - rn.rimLo;
  const farLeft = rn.xFar < rn.xNear;
  F.text(0, 0, `high end: top of the gutter\n3/4" below the top of the fascia`, { cls: 'lab', a: farLeft ? 'start' : 'end', dx: X(rn.xFar) + (farLeft ? 6 : -6), dy: 150 });
  F.text(0, 0, `outlet: ${inch(0.75 + fall)} below the top\nof the fascia, ${inch(3.25)} past the wall;\nlevel from there to the end`, { cls: 'lab', a: farLeft ? 'end' : 'start', dx: X(rn.xo) + (farLeft ? -12 : 12), dy: 176 });
  F.add(`<path d="M${X(rn.xFar)} ${yRim(rn.xFar) + 26}V136" class="lead"/><path d="M${X(rn.xo)} ${yRim(rn.xo) + 64}V156" class="lead"/>`);
  F.text(0, 0, `The gutter falls ${inch(fall)} over ${ftin(Math.abs(rn.xo - rn.xFar))} (1/2" every 10'), drawn much steeper here. Chalk line in red; the small marks are the brackets.`, { cls: 'note', dx: 380, dy: 240 });
  F.text(0, 0, 'Front eave, seen from the front. The back eave is the same, falling to the same end.', { cls: 'ttl', a: 'start', dx: 10, dy: 14 });
  return F.svg('The fall of the gutter along the eave');
}

// The tank end of the house seen from outside: gutters, downpipes and the
// header falling to the tee, with the tank (dashed) standing in front.
export function rainElevFig(d) {
  const g = d.g;
  const rn = g.rain;
  const t = rn.tank;
  const D = d.D;
  const w = g.walls[rn.wall];
  const h = (z) => (rn.sideR ? D - z : z);
  const GR = 2.5;
  const PR = rn.PR;
  const hz = rn.zg.map(h);
  const ht = h(t.z);
  const ridge = g.ridgeTop;
  const lo = Math.min(...hz) - GR - 8;
  const hi = Math.max(...hz) + GR + 8;
  const F = new Fig({ x0: lo, x1: hi, y0: 0, y1: ridge + 6, w: 760, pad: [14, 14, 44, 14] });
  const y0 = g.y0;
  F.line(lo, 0, hi, 0, 'ground');
  F.rect(0, 0, D, y0 + g.PH, 'conc');
  for (const [a, c] of w.bays) F.rect(a, y0 + g.PH - 1.5, c, y0 + g.Rb, 'tinfill');
  for (const [a, c] of w.cols) F.rect(a, y0 + g.PH, c, y0 + g.Rb, 'conc');
  F.rect(0, y0 + g.Rb, D, y0 + g.ringTop, 'conc');
  for (const o of w.openings) F.rect(o.u0, y0 + o.v0, o.u1, y0 + o.v1, o.type === 'door' ? 'wood' : 'glass');
  // gable and roof edge
  const zs = [];
  for (let k = 0; k <= 40; k++) zs.push((D * k) / 40);
  F.poly([[0, g.yTop - 1.5], ...zs.map((z) => [h(z), g.rafterTop(z)]), [D, g.yTop - 1.5]], 'tinfill');
  const rz = [];
  for (let k = 0; k <= 40; k++) rz.push(-g.E - 2 + ((D + 2 * g.E + 4) * k) / 40);
  F.poly(rz.map((z) => [h(z), g.rafterTop(Math.min(Math.max(z, -g.E), D + g.E)) + 1.5 / g.cos + 0.5 - (z < -g.E || z > D + g.E ? 2 * g.p : 0)]), 'tin', false);
  for (const z of [-g.E - 0.375, D + g.E + 0.375]) F.rect(h(z) - 0.375, g.rafterTop(-g.E) - 5.5, h(z) + 0.375, g.rafterTop(-g.E), 'wood2');
  // gutters end-on, downpipes, header, tee
  for (const x of hz) {
    gutterEnd(F, x, rn.rimLo, GR, 'pipe hl');
    F.rect(x - PR, rn.yH0, x + PR, rn.outletTop, 'pipe hl');
    F.circle(x, rn.yH0, f1((PR + 0.3) * F.k), 'pipe hl');
    pipeBand(F, x, rn.yH0, ht, rn.yHm, PR, 'pipe hl');
  }
  const corner = (x) => (x < ht ? Math.min(...hz) : Math.max(...hz));
  const yAt = (x) => rn.yH0 + ((rn.yHm - rn.yH0) * Math.abs(x - corner(x))) / Math.max(1, Math.abs(ht - corner(x)));
  for (const z of rn.strapZs) {
    const x = h(z);
    const yy = yAt(x);
    F.rect(x - 1.75, yy - 2, x + 1.75, yy + 2, 'wood');
    F.rect(x - 0.4, yy - PR - 0.1, x + 0.4, yy + PR + 0.1, 'steelf');
  }
  F.rect(ht - 2.4, rn.yHm - PR - 0.4, ht + 2.4, rn.yHm + PR + 0.4, 'pipe fit');
  // the tank and its base, in front
  F.rect(ht - t.S / 2, 0, ht + t.S / 2, t.base, 'ghost');
  F.rect(ht - t.d / 2, t.base, ht + t.d / 2, t.base + t.h, 'ghost');
  F.text(ht, t.base + t.h / 2, `${t.gal}-gal tank\n(standing ${inch(12)}\nout from the wall)`, { cls: 'note' });
  const lab = (x, y, dx, dy, s) => F.lead(x, y, dx, dy, s, { cls: 'labh' });
  const leftIsFront = rn.sideR;
  const hl0 = Math.min(...hz);
  lab(hl0, rn.rimLo, 24, -34, 'gutter (seen end-on), with\nthe outlet and downpipe below');
  lab(ht, rn.yHm + PR, 0, -42, `tee: pipe centre ${inch(y0 + g.Rb - rn.yHm)}\nbelow the ring beam`);
  const hc = Math.min(...hz);
  lab(hc + 6, yAt(hc + 6) - PR, 6, 40, `header: centre ${inch(y0 + g.Rb - rn.yH0)} below\nthe ring beam at the corner`, );
  const zr = rn.strapZs.map(h).sort((a, c) => c - a)[0];
  if (zr !== undefined) lab(zr, yAt(zr) - 2, -10, 46, 'standoff block and\nstrap on each column');
  F.dimH(0, ht, 0, ftin(ht), 20);
  F.dimH(ht, D, 0, ftin(D - ht), 20);
  F.text(0, 0, `${leftIsFront ? 'front' : 'back'} corner`, { cls: 'note', dy: 36 });
  F.text(D, 0, `${leftIsFront ? 'back' : 'front'} corner`, { cls: 'note', dy: 36 });
  return F.svg('The tank end of the house, with the gutters, downpipes and header');
}

// Section through the tank, the first flush and the base, seen from the front.
export function tankSectionFig(d) {
  const g = d.g;
  const rn = g.rain;
  const t = rn.tank;
  const y0 = g.y0;
  const e = (x) => (x - rn.xEnd) * rn.sx; // out from the wall
  const eo = e(rn.xo);
  const eF = e(rn.xFF);
  const eT = e(t.x);
  const PR = rn.PR;
  const yOut = (ee) => rn.yHm - (rn.pFall * Math.abs(ee - eo));
  const r = t.d / 2;
  const xMax = 12 + t.S + 10;
  const F = new Fig({ x0: -12, x1: xMax, y0: -10, y1: Math.max(rn.yHm, t.base + t.h) + 10, k: 4.4, pad: [14, 290, 30, 14] });
  // wall
  F.rect(-12, -10, xMax, 0, 'earth');
  F.line(-12, 0, xMax, 0, 'ground');
  F.rect(-g.Pt, -10, 0, y0 + g.PH, 'conc');
  F.rect(-3.5, y0 + g.PH, 0, y0 + g.Rb, 'wood2');
  F.line(0.4, y0 + g.PH - 1.5, 0.4, y0 + g.Rb, 'tin');
  F.rect(-g.C, y0 + g.Rb, 0, y0 + g.ringTop, 'conc');
  // base: blocks round fill, slab with rebar
  for (let j = 0; j < t.k; j++) {
    F.rect(12, 8 * j, 12 + BT, 8 * j + 7.625, 'block');
    F.rect(12 + t.S - BT, 8 * j, 12 + t.S, 8 * j + 7.625, 'block');
  }
  if (t.k) F.rect(12 + BT, 0, 12 + t.S - BT, 8 * t.k, 'earth');
  const ys = 8 * t.k;
  F.rect(12, ys, 12 + t.S, t.base, 'conc');
  F.line(15, ys + t.slabT / 2, 12 + t.S - 3, ys + t.slabT / 2, 'rebar');
  // tank with a domed top
  F.poly([[eT - r, t.base], [eT + r, t.base], [eT + r, t.base + t.h - 6], [eT + r * 0.6, t.base + t.h - 0.6], [eT - r * 0.6, t.base + t.h - 0.6], [eT - r, t.base + t.h - 6]], 'tankf');
  F.rect(eT - 8, t.base + t.h - 0.6, eT + 8, t.base + t.h, 'tankf');
  // header end-on, pipe out over the first flush to the tank
  pipeBand(F, eo, rn.yHm, eT, yOut(eT), PR, 'pipe hl');
  F.circle(eo, rn.yHm, f1(PR * F.k), 'pipe');
  F.rect(eF - PR, 16, eF + PR, yOut(eF), 'pipe hl');
  F.rect(eF - PR - 0.3, 13.5, eF + PR + 0.3, 16.5, 'pipe fit');
  F.rect(eF - 2.4, yOut(eF) - PR - 0.4, eF + 2.4, yOut(eF) + PR + 0.4, 'pipe fit');
  if (yOut(eT) - (t.base + t.h - 1) > 1) F.rect(eT - PR, t.base + t.h - 1, eT + PR, yOut(eT), 'pipe hl');
  F.rect(eT - PR - 0.4, yOut(eT) - PR - 0.4, eT + PR + 0.4, yOut(eT) + PR + 0.4, 'pipe fit');
  // overflow on the far side, tap on the front
  const yOv = t.base + t.h - 9;
  const eOv = eT + t.S / 2 + 4;
  pipeBand(F, eT + r - 1, yOv, eOv, yOv, PR, 'pipe');
  F.rect(eOv - PR, 4, eOv + PR, yOv, 'pipe');
  F.circle(eT, t.tapH, 4, 'steelf');
  F.labels([
    { x: eo, y: rn.yHm - PR, t: 'header along the wall (end-on)' },
    { x: (eF + eT) / 2, y: yOut((eF + eT) / 2) + PR, t: `pipe to the tank, falling 1/8" per foot` },
    { x: eF, y: 40, t: `first-flush chamber: holds about ${num(t.ffGal, 1)} gal` },
    { x: eF, y: 15, t: 'screw plug with a 1/8" drip hole' },
    { x: eT + 4, y: t.base + t.h - 0.3, t: 'lid with the inlet strainer' },
    { x: eT + r * 0.6, y: t.base + t.h * 0.55, t: `${t.gal}-gal tank, ${inch(t.d)} × ${ftin(t.h)}` },
    { x: eOv + PR, y: 20, t: 'overflow, screened at the bottom' },
    { x: eT, y: t.tapH, t: `tap on the front, ${inch(t.tapH)} up` },
    { x: 12 + t.S / 2 + 10, y: ys + t.slabT / 2, t: `${inch(t.slabT)} slab, #4 bars 12" each way` },
    ...(t.k ? [
      { x: 12 + t.S - BT / 2, y: 4, t: `${plural(t.k, 'course')} of 6" block` },
      { x: 12 + t.S / 2 + 18, y: 4 * t.k, t: 'compacted coral fill' },
    ] : []),
  ], F.X(xMax) + 22, 'right');
  F.dimV(0, t.base, 12, ftin(t.base), -16, { rot: true });
  F.dimV(0, t.base + t.h, xMax - 4, ftin(t.base + t.h), 12, { rot: true });
  F.dimH(0, 12, 0, inch(12), 18);
  F.dimH(12, 12 + t.S, -10, ftin(t.S), 12);
  F.text(-6, y0 + g.PH + 30, 'end\nwall', { cls: 'note' });
  return F.svg('Section through the tank, the first flush and the base');
}

// Plan of the base beside the wall, course 1 shown.
export function tankPlanFig(d) {
  const g = d.g;
  const rn = g.rain;
  const t = rn.tank;
  const D = d.D;
  const h = (z) => (rn.sideR ? D - z : z);
  const hc = h(t.z);
  const a = hc - t.S / 2;
  const b = hc + t.S / 2;
  const F = new Fig({ x0: -10, x1: D + 10, y0: -g.Pt - 4, y1: 12 + t.S + 14, w: 760, pad: [16, 14, 48, 14] });
  F.rect(0, -g.Pt, D, 0, 'conc');
  const w = g.walls[rn.wall];
  for (const [ca, cc] of w.cols) F.rect(ca, -g.C, cc, 0, 'conc');
  F.line(0, 3.25, D, 3.25, 'pipeline');
  // course 1: the sides square to the wall run right through the corners
  const run = (s0, s1, fn) => { for (let s = s0; s < s1 - 0.5; s += 16) fn(s, Math.min(s + 15.625, s1)); };
  run(12, 12 + t.S, (s, e) => { F.rect(a, s, a + BT, e, 'block'); F.rect(b - BT, s, b, e, 'block'); });
  run(a + 6, b - 6, (s, e) => { F.rect(s, 12, e, 12 + BT, 'block'); F.rect(s, 12 + t.S - BT, e, 12 + t.S, 'block'); });
  F.rect(a + BT, 12 + BT, b - BT, 12 + t.S - BT, 'earth');
  const nb = Math.floor((t.S - 6) / 12) + 1;
  for (let i = 0; i < nb; i++) {
    const s = 3 + ((t.S - 6) * i) / (nb - 1);
    F.line(a + s, 15, a + s, 12 + t.S - 3, 'dimx');
    F.line(a + 3, 12 + s, b - 3, 12 + s, 'dimx');
  }
  F.add(`<circle cx="${F.X(hc)}" cy="${F.Y(12 + t.S / 2)}" r="${f1((t.d / 2) * F.k)}" class="ghost"/>`);
  F.text(hc, 12 + t.S / 2, `tank\n${inch(t.d)} across`, { cls: 'note' });
  F.dimH(a, b, 12 + t.S, ftin(t.S), -14);
  F.dimV(12, 12 + t.S, b, ftin(t.S), 14);
  F.dimV(0, 12, a - 4, inch(12), -12);
  F.dimH(0, a, -g.Pt - 4, ftin(a), 14);
  F.dimH(b, D, -g.Pt - 4, ftin(D - b), 14);
  F.text(4, 3.25, 'header pipe along the wall', { cls: 'note', a: 'start', dy: -10 });
  F.text(0, -g.Pt - 4, `${rn.sideR ? 'front' : 'back'} corner`, { cls: 'note', a: 'start', dy: 36 });
  F.text(D, -g.Pt - 4, `${rn.sideR ? 'back' : 'front'} corner`, { cls: 'note', a: 'end', dy: 36 });
  F.text(D / 2, -g.Pt / 2, `${rn.wall} end wall (outside face at the top)`, { cls: 'note', dy: 18 });
  return F.svg('Plan of the tank base beside the end wall');
}

// How a first-flush chamber works (generic).
export function firstFlushFig() {
  const F = px(760, 270);
  const panels = [
    ['1. Rain starts', 0.45, 'The first water off the roof\ncarries the dust, leaves and\nbird droppings. It drops into\nthe chamber first.', false],
    ['2. Chamber full', 1, 'Once the chamber is full, the\nclean water runs on past it\ninto the tank.', true],
    ['3. After the rain', 0.25, 'The small hole in the plug lets\nthe chamber drain slowly, so it\nis empty for the next rain.', false],
  ];
  panels.forEach(([title, fill, text, flow], i) => {
    const x = 20 + i * 250;
    F.text(0, 0, title, { cls: 'ttl', a: 'start', dx: x, dy: 16 });
    const top = 46;
    const bot = 160;
    if (fill > 0) F.add(`<rect x="${x + 62}" y="${f1(bot - (bot - top - 18) * fill)}" width="16" height="${f1((bot - top - 18) * fill)}" class="dirty"/>`);
    F.add(`<path d="M${x} ${top}H${x + 200}M${x} ${top + 18}H${x + 61}V${bot}M${x + 79} ${bot}V${top + 18}H${x + 200}" class="ln"/>`);
    F.add(`<rect x="${x + 57}" y="${bot}" width="26" height="12" class="pipe fit"/>`);
    arrowPx(F, x + 2, top + 9, x + 50, top + 9, 'arr');
    if (flow) arrowPx(F, x + 100, top + 9, x + 196, top + 9, 'arr');
    else if (i === 0) arrowPx(F, x + 70, top + 22, x + 70, top + 50, 'arr');
    if (i === 2) F.add(`<path d="M${x + 70} ${bot + 14}v6m0 6v4" class="arr"/>`);
    F.text(0, 0, flow ? 'to the tank' : '', { cls: 'note', a: 'end', dx: x + 200, dy: top - 10 });
    F.text(0, 0, text, { cls: 'note', a: 'start', dx: x, dy: 228 });
  });
  return F.svg('How the first-flush chamber works');
}

// ---------------------------------------------------------------- 3D pictures
export function extraShots(d) {
  const g = d.g;
  const W = d.W;
  const D = d.D;
  const yT = g.yTop;
  const out = [];
  if (g.scr) {
    out.push({ id: 'rake-close', step: STEP.PURLINS, dir: [1, 0.45, 0.3], box: { min: [W - 4, yT + 4, D / 2 + 8], max: [W + 2, g.ridgeTop - 4, D + 2] } });
    if (g.scr.soffit.length) out.push({ id: 'eave-screen', step: STEP.SCREENS, dir: [0.35, -0.55, -1], box: { min: [W / 2 - 50, g.underside(-g.E) - 4, -g.E - 4], max: [W / 2 + 50, yT + 2, 4] } });
  }
  const rn = g.rain;
  if (rn) {
    const t = rn.tank;
    const sx = rn.sx;
    const xs = (a, b) => [Math.min(a, b), Math.max(a, b)];
    const [ga, gb] = xs(rn.xo - sx * 34, rn.xo + sx * 10);
    out.push({ id: 'outlet-close', step: STEP.GUTTERS, dir: [sx * 0.9, 0.3, 1], box: { min: [ga, rn.yH0 - 8, D - 14], max: [gb, rn.rimHi + 7, rn.zg[1] + 6] } });
    out.push({ id: 'gutters', step: STEP.GUTTERS, dir: [sx * 1, 0.5, 0.75], box: { min: [-g.R, 0, -g.E], max: [W + g.R, g.ridgeTop, D + g.E] } });
    const p = rn.plinth;
    const keep = (part) => ['block', 'fill', 'rebar', 'slab'].includes(part.mat);
    out.push({ id: 'base-blocks', step: STEP.TANK, dir: [sx * 0.6, 0.9, 1], box: { min: [p.x0 - 8, 0, p.z0 - 8], max: [p.x1 + 8, t.base + 8, p.z1 + 8] }, hide: (part) => part.group === 'tank' && !(keep(part) && part.mat !== 'slab') });
    out.push({ id: 'base-done', step: STEP.TANK, dir: [sx * 0.6, 0.9, 1], box: { min: [p.x0 - 8, 0, p.z0 - 8], max: [p.x1 + 8, t.base + 8, p.z1 + 8] }, hide: (part) => part.group === 'tank' && !keep(part) });
    const [ta, tb] = xs(rn.xEnd - sx * 30, rn.xEnd + sx * (12 + t.S + 14));
    out.push({ id: 'tank', step: STEP.TANK, dir: [sx * 1, 0.45, 0.8], box: { min: [ta, 0, p.z0 - 40], max: [tb, rn.rimHi + 6, p.z1 + 40] } });
    const [fa, fb] = xs(rn.xEnd - sx * 4, rn.xEnd + sx * 22);
    out.push({ id: 'ff-close', step: STEP.TANK, dir: [sx * 0.45, 0.25, 1], box: { min: [fa, 8, t.z - 14], max: [fb, rn.yHm + 6, t.z + 14] } });
  }
  return out;
}

// ---------------------------------------------------------------- parts
// ctx: { d, P, bom, buy, cutList, firstWin }
export function screenParts(ctx) {
  const { d, cutList } = ctx;
  const g = d.g;
  const sc = g.scr;
  if (!sc) return [];
  const nw = sc.windows.length;
  const FW = g.winRO.w + 3;
  const FH = g.winRO.h + 3;
  const sw = sc.windows[0]?.w || 0;
  const sh = sc.windows[0]?.h || 0;
  const steps = [];
  if (sc.soffit.length) {
    steps.push({ title: 'Screen the eaves', html: `${need([`${sc.soffitRoll}" fiberglass insect screen: two strips ${ftin(d.W)} long, ${ftin(sc.soffitW)} wide (one for each eave)`, 'a staple gun and 3/8" stainless staples', 'scissors, a tape measure and a ladder (two are easier)'])}
      ${ol([
        `The gap under the roof between the rafters, from the fascia back to the wall, is open to the outside. Close it with screen stapled under the rafters, along both eaves.`,
        `Cut each strip into pieces about 8' long, so they are easy to handle. Every joint between pieces lands on a rafter, with the pieces overlapping 2".`,
        'Start at one end. Staple the front edge of the screen to the back of the fascia, about 1" up, every 3".',
        'Pull the screen tight toward the wall and staple it to the underside of every rafter it crosses, every 4".',
        `At the wall, fold the last ${inch(sc.fold)} up against the face of the 2x6 wall plate and staple it there every 3". Push it right into the corner so there is no gap above the ring beam.`,
        'At the gable ends, staple the screen along the bottom of the end rafter.',
        'Look along the eave from below, in daylight. Any gap you can see light through is big enough for a mosquito: staple a scrap of screen over it.',
      ])}${figs(figure(eaveFig(d, 'screen'), '<b>Section through the eave.</b> The screen closes the gap between the fascia and the wall; foam closes the corrugations above.'), shotFig('eave-screen', '<b>Screen under the eave</b>, seen from below.'))}
      ${tip('Fiberglass screen is soft and easy to staple, and it doesn\'t rust in salt air. Aluminium and steel screen rust through in a year or two by the sea.')}` });
  }
  if (nw) {
    steps.push({ title: 'Build the window screens', html: `${need([`1x3 boards for ${plural(nw, 'frame')}, cut as below`, `${sc.rollW}" fiberglass insect screen: one piece ${ftin(sw)} × ${ftin(sh)} for each window`, `${nw * 4} flat corner braces with their screws`, 'the staple gun and stainless staples', 'a flat floor to work on'])}
      ${ol([
        `Each screen is a frame of 1x3 boards laid flat, ${ftin(FW)} × ${ftin(FH)}: ${inch(1.5)} bigger than the window opening all round, so it covers the edge of the plywood.`,
        `For each frame, cut two rails ${ftin(FW)} long (top and bottom) and two stiles ${ftin(FH - 5)} long (the sides, which fit between the rails).`,
        'Lay the four pieces on a flat floor with the stiles between the rails. Measure both diagonals and push the frame until they are equal: then it is square.',
        'Screw a corner brace across each joint, on the side that will face the room.',
        'Turn the frame over. Lay the screen on it and staple it to the frame: first in the middle of the top, then the middle of the bottom (pulling it tight), then the middles of the sides. Work out to the corners, a staple every 2", keeping the screen tight and the weave straight.',
        'Trim the screen 1/4" inside the outer edge of the frame with scissors.',
      ])}${figs(figure(screenFrameFig(g), `<b>A window screen frame</b>, seen from the room. ${plural(nw, 'frame')}, all the same.`))}${cutList(/^Screen frame/, 'Screen frames (1x3)')}` });
    steps.push({ title: 'Hang the window screens', html: `${need([`${nw * 2} 2" butt hinges with screws`, `${nw} hook-and-eye catches`, 'a drill/driver'])}
      ${ol([
        'Hold a frame over the window opening from inside, screen side against the wall, so it laps evenly onto the plywood all round. The king studs, head and sill behind the plywood are what you screw into.',
        'Hinges go on the <b>left</b> side as you face the window from inside, 6" from the top and 6" from the bottom. Screw one leaf of each hinge to the outer edge of the frame and the other flat on the wall, through the plywood into the king stud.',
        'Swing the frame shut and check it sits flat against the wall all round. If the plywood is not flat and there is a gap, plane the back of the frame or tack a thin strip of wood on the wall to close it.',
        'Fit the hook on the other side of the frame, at mid-height, and its eye in the wall so the hook pulls the frame tight shut.',
        'Open the screen to work the louvre handle, then close it again. Keep the screens shut from dusk until morning, when the mosquitoes are out.',
      ])}${figs(figure(screenSectionFig(), '<b>Looking down on the hinge side</b> of a window: the screen frame laps over the plywood and swings open into the room.'), shotFig('winscr-close', '<b>A screen hung</b> inside its window.'))}
      ${check([`All ${nw} screens hung, closing flat, with no gap at the edges.`, 'Every louvre handle can be reached with its screen open.', 'Eaves screened along both sides, with no gaps at the corners or the ends.', 'Foam in the corrugations at both eaves and under the ridge cap; the blocks over both gables in place.'])}
      ${tip('With every gap closed, insects can only come in through the doors. Keep them shut at dusk, or add a screen door to the one you use most.')}` });
  }
  return [{
    id: 'screens', title: 'Insect screens',
    intro: `Screens only keep insects out if there are no gaps anywhere. You have already blocked the tops of the gables and foamed the roof corrugations. Now ${sc.soffit.length ? 'close the eaves and ' : ''}fit a hinged screen inside each of the ${plural(nw, 'window')}.${sc.soffit.length ? '' : ' (With no eave overhang, the fascia already closes the top of the walls.)'}`,
    steps,
  }];
}

export function rainParts(ctx) {
  const { d, P, bom } = ctx;
  const g = d.g;
  const rn = g.rain;
  if (!rn) return [];
  const t = rn.tank;
  const i = d.info;
  const sec = 'Gutters & water tank';
  const line = (k) => bom.lines.find((l) => l.key === k && l.section === sec);
  const nb = (k) => line(k)?.buy || 0;
  const end = rn.wall;
  const other = end === 'right' ? 'left' : 'right';
  const fall = rn.rimHi - rn.rimLo;
  const run = Math.abs(rn.xo - rn.xFar);
  const ringU = g.y0 + g.Rb; // underside of the ring beam, world
  const eavePcs = rn.gutterPieces.slice(0, rn.gutterPieces.length / 2);
  const nFull = eavePcs.filter((x) => x > 119.9).length;
  const cutPc = eavePcs.find((x) => x <= 119.9);
  const gutterCuts = `${plural(nFull, 'full length')}${cutPc ? ` and one cut to ${ftin(cutPc)}` : ''}`;
  const bars = Math.floor((t.S - 6) / 12) + 1;
  const bags = nb('cement');
  const fromBack = t.z - t.S / 2;
  const days = Math.floor(t.gal / 30);
  const problems = d.warnings.filter((w) => /tank|rain pipe/i.test(w));
  const parts = [];
  parts.push({
    id: 'gutters', title: 'Gutters',
    intro: `5" PVC gutters along both eaves, falling gently toward the ${end} end, where the water goes down to the tank. Every inch of rain on the roof is about ${num(i.rainGal)} gallons.`,
    steps: [
      { title: 'Mark the fall', html: `${need(['a chalk line, a tape measure and a pencil', 'a line level or a long level', 'two ladders'])}
        ${ol([
          `A gutter must slope so the water runs to the outlet and doesn't sit in it. These fall <b>1/2" every 10'</b>: ${inch(fall)} over the ${ftin(run)} from the ${other} end to the outlet.`,
          `At the high (${other}) end of the fascia, mark ${inch(0.75)} below the top of the fascia. That is where the top of the gutter goes.`,
          `The outlet is ${inch(3.25)} past the outside face of the ${end} end wall. Mark the fascia there ${inch(0.75 + fall)} below its top.`,
          'Snap a chalk line between the two marks. From the outlet to the end of the fascia, mark level.',
          'Do the same on the other eave. Both gutters fall toward the same end.',
        ])}${figs(figure(gutterFallFig(d), `<b>The fall along the eave.</b> The top of every bracket goes on the chalk line.`, 'wide'))}` },
      { title: 'Fix the brackets', html: `${need([`${nb('gutterBracket')} gutter brackets`, 'stainless screws, 1-1/4"', 'a drill/driver'])}
        ${ol([
          `Put a bracket at every rafter (where the fascia is nailed on, so it is strongest), and one 3" in from each end of the fascia: ${plural(rn.bracketXs.length, 'bracket')} on each eave.`,
          'Hold each bracket with its top on the chalk line and screw it to the fascia with two stainless screws.',
          'Sight along the brackets from one end. They should make a straight, gently falling line; move any that stick out.',
        ])}${figs(figure(eaveFig(d, 'gutter'), '<b>Section through the eave</b> with the gutter. The edge of the roof sheet drips into the middle of the gutter.'))}` },
      { title: 'Hang the gutters', html: `${need([`${nb('gutter')} lengths of 5" PVC gutter (10')`, `${nb('gutterJoin')} joiners, ${nb('gutterEnd')} stop ends and ${nb('gutterOutlet')} drop outlets`, 'a fine-tooth saw and a file'])}
        ${ol([
          'Read the instructions for the gutter you buy: the parts of different makes join a little differently. Most clip into the brackets and join with a joiner that has a rubber seal.',
          `Each eave takes ${ftin(d.W + 2 * g.R)} of gutter from end to end of the fascia: ${gutterCuts.replace('full length', "full 10' length")}. Cut square with a fine saw and file the edge smooth.`,
          `Fit the drop outlet at the ${end} end, centred ${inch(3.25)} past the end wall, then the lengths, working toward the high end. Leave the gap the joiners show between lengths: PVC grows in the sun.`,
          'Clip each length into its brackets, put a stop end on both ends, and check every joiner is fully seated.',
        ])}${figs(shotFig('outlet-close', `<b>The outlet</b> at the ${end} end, with the downpipe and elbow below it.`))}
        ${warn('Work from ladders, not from the roof edge. A gutter will not hold your weight.')}` },
      { title: 'Downpipes and the header', html: `${need([`3" PVC pipe (${nb('pipe3')} lengths for the gutters and tank), elbows, tees and couplings`, 'PVC primer and cement', `${plural(rn.straps, 'standoff block')} (4" pieces of 2x4) and ${plural(rn.straps, 'pipe strap')}`, 'concrete screws, the hammer drill and a 3/16" bit', 'a hacksaw or PVC saw'])}
        ${ol([
          `The two downpipes come down from the outlets and turn along the ${end} end wall. This pipe along the wall is the <b>header</b>; its two halves meet at a tee. The tee is ${ftin(rn.sideR ? d.D - t.z : t.z)} from the front corner and ${ftin(rn.sideR ? t.z : d.D - t.z)} from the back corner (outside faces).`,
          `Screw a 4" block of 2x4 flat to each column the header crosses, with two concrete screws. It holds the pipe out ${inch(1.5)} from the wall, clear of the wall sheets.`,
          `Under each outlet: a short piece of pipe and an elbow turned toward the tee. The centre of the header is ${inch(ringU - rn.yH0)} below the underside of the ring beam at the corners and ${inch(ringU - rn.yHm)} below it at the tee, so it falls toward the tee.`,
          'Dry-fit everything first (no glue), with the tee\'s side outlet pointing straight out from the wall. Check the fall with a level, then mark across each joint so you can line it up again.',
          'Take it apart, then glue each joint with primer and cement, pushing it home with a quarter turn.',
          'Strap the header to each standoff block.',
        ])}${figs(figure(rainElevFig(d), `<b>The ${end} end of the house</b> from outside: gutters, downpipes and the header falling to the tee. The tank stands in front (dashed).`, 'wide'), figure(pvcGlue(), 'Gluing PVC pipe.'))}
        ${figs(shotFig('gutters', '<b>Gutters on both eaves</b>, with the header along the end wall.'))}
        ${check(['Pour a bucket of water into the high end of each gutter: it should all run to the outlet, with no water left standing.', 'No drips at the joiners, the outlets or the pipe joints.'])}` },
    ],
  });
  parts.push({
    id: 'tank', title: 'Water tank',
    intro: `A ${t.gal}-gal tank on a ${ftin(t.base)} base, ${inch(12)} out from the ${end} end wall. <b>Start the base early</b>: the slab needs a week to cure before the tank goes on, so build it while you are working on the walls or the roof.${problems.map((w) => warn(w)).join('')}`,
    steps: [
      { title: 'Build the base', html: `${need([
          t.k ? `${nb('block')} 6" hollow blocks` : null,
          `${plural(bags, 'bag')} of cement, about ${num(bags * 2)} ft³ of sand and ${num(bags * 3)} ft³ of gravel or crushed coral`,
          t.k ? `about ${num(Math.ceil(t.fillFt3))} ft³ of sand or coral fill` : null,
          `${nb('rebar') || 'some'} #4 bars (cut into ${bars * 2} pieces ${ftin(t.S - 6)} long) and tie wire`,
          `four 2x6 boards ${ftin(t.S + 3)} long for the edge forms`,
          'a trowel, a level, a hand tamper, a string line',
        ].filter(Boolean))}
        ${ol([
          `Mark out a square ${ftin(t.S)} × ${ftin(t.S)}: its near side ${inch(12)} out from the wall, starting ${ftin(fromBack)} from the back corner of the house. Check the diagonals are equal.`,
          'Dig out the topsoil and roots inside the square, about 4" down, and tamp the ground hard and level.',
          t.k ? `Lay ${plural(t.k, 'course')} of 6" block round the edge of the square on a bed of mortar, as in the plan. On each course, turn the pattern a quarter turn so the joints don't line up. Keep every course level, and check the square again.` : null,
          t.k ? 'Fill inside the blocks with sand or coral in 4" layers, wetting and tamping each layer hard, up to the top of the blocks. Fill the holes in the blocks too.' : null,
          `Nail the 2x6 forms round the outside so their tops stand ${inch(t.slabT)} above the ${t.k ? 'blocks' : 'ground'}. Check the tops are level both ways: the tank must sit dead flat.`,
          `Lay the bars in a grid, ${bars} each way, 12" apart, 3" in from the forms. Tie every crossing with wire and lift the grid onto small stones so it sits in the middle of the slab.`,
          `Mix and pour the concrete (${plural(bags, 'bag')} of cement, mixed 1 : 2 : 3), fill the forms, and strike it off level with a straight board across the forms. Smooth it with a float.`,
          'Keep it damp under plastic or wet sacks for 7 days before the tank goes on.',
        ])}${figs(figure(tankPlanFig(d), `<b>Plan of the base</b> beside the ${end} end wall, first course shown. The dashed lines are the bars.`, 'wide'))}
        ${figs(shotFig('base-blocks', '<b>The blocks and fill</b>, with the bars ready on top.'), shotFig('base-done', '<b>The finished base</b>.'), t.k ? figure(blockString(), 'Laying block to a string.') : figure(concreteMix(), 'Mixing concrete.'))}
        ${t.k ? figs(figure(mortarMix(), 'Mixing mortar.'), figure(concreteMix(), 'Mixing concrete.')) : ''}
        ${warn(`Full, the tank and its water weigh about ${num(t.gal * 8.34 + t.lb)} lb. Don't skimp on the tamping or the bars: a base that settles or cracks can tip the tank over.`)}` },
      { title: 'Set the tank', html: `${need([`the ${t.gal}-gal tank (${inch(t.d)} across, ${ftin(t.h)} tall)`, 'the outlet fitting, 12" nipple and brass tap, and thread tape', 'four people'])}
        ${ol([
          'Wait until the base is 7 days old. Sweep it clean and check nothing sharp is sticking up.',
          'Roll the empty tank on its bottom edge (never drop it) onto the base, and centre it. Turn it so the outlet at the bottom faces the front, where people will fill buckets.',
          `Fit the outlet fitting, then the 12" nipple and the tap, with thread tape on every thread. The tap ends up about 3" past the edge of the base, ${inch(t.tapH)} off the ground, so a bucket stands under it on the ground.`,
          `Fit a 3" pipe to the overflow near the top of the tank, on the side away from the house: an elbow and a pipe down to about 4" above the ground. Tie a piece of insect screen tightly over the bottom end with wire, so mosquitoes can't get in that way.`,
          'Check the lid closes tightly and its strainer basket is in place.',
        ])}` },
      { title: 'Connect the pipe and the first flush', html: `${need(['3" PVC pipe, a tee, an elbow and a cleanout adapter with its screw plug', 'PVC primer and cement', 'a drill and a 1/8" bit'])}
        ${ol([
          `From the side outlet of the header tee, glue a short piece of pipe and a second tee, 6" out from the first, with its branch pointing straight down. This is the first flush.`,
          `From the second tee, run the pipe on out to above the middle of the tank (${ftin(Math.abs(t.x - rn.xFF))} more), falling 1/8" per foot, then an elbow pointing down and a short piece into the strainer in the lid.`,
          `Glue a pipe down from the branch of the second tee to 16" above the ground: this is the first-flush chamber. It holds about ${num(t.ffGal, 1)} gallons.`,
          'Glue the cleanout adapter on the bottom of the chamber and screw in the plug. Drill a 1/8" hole in the middle of the plug.',
        ])}${figs(figure(tankSectionFig(d), '<b>Section through the tank</b>, seen from the front: the pipe from the header, the first flush and the base.', 'wide'))}${figs(figure(firstFlushFig(), '<b>How the first flush works.</b>'))}
        ${figs(shotFig('ff-close', '<b>The first flush</b>: the tee off the header, the chamber below and the pipe on to the tank.'), shotFig('tank', '<b>The tank in place</b>, with its overflow and tap.'))}` },
      { title: 'Using and looking after it', html: `${ul([
          `<b>How much water:</b> each inch of rain fills about ${num(i.rainGal)} gallons, so ${num(t.gal / i.rainGal, 1)}" of rain fills the tank. Used only for drinking and cooking, about 30 gal a day, a full tank lasts about ${plural(days, 'day')} without rain.`,
          '<b>The first tankful:</b> rinse out the new tank and pipes before the first rain. Don\'t drink the first tankful (use it for washing): it carries sawdust, metal filings and cement dust off the new roof.',
          '<b>Drinking water:</b> boil it, or treat it the way your health office recommends.',
          '<b>Every month:</b> scoop leaves out of the gutters, clean the strainer in the lid, and unscrew the first-flush plug to wash out the chamber, then screw it back in.',
          '<b>Mosquitoes:</b> if you see wrigglers in the tank, a screen has a hole or the lid is open. Find it and fix it.',
          '<b>Before a storm:</b> a full tank won\'t blow over, but a nearly empty one can. If a typhoon is coming, fill it, or tie it down.',
          '<b>Once a year:</b> check the brackets and joints, re-glue anything that leaks, and drain and scrub out the tank if sludge has built up on the bottom.',
        ])}
        ${check(['Tank level and steady on its base.', 'Tap, overflow, lid and first flush all fitted, with no leaks.', 'Overflow screened; lid closed.'])}` },
    ],
  });
  return parts;
}
