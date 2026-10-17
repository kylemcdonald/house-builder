// Drawing kit for the step-by-step guides: a small SVG builder that works in
// inches (y up) or pixels (y down), dimension lines and leaders, and the
// close-up diagrams both guides share (nailing, drilling concrete, sheet
// laps, mixing concrete...). Colours come from CSS classes, so the drawings
// follow light and dark mode.
import { ftin, inch } from './format.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const f1 = (v) => +v.toFixed(1);

export class Fig {
  // World box x0..x1, y0..y1 (inches) mapped onto w px with padding.
  // flip: world y up (drawings to scale); false: pixel space, y down.
  constructor({ x0 = 0, y0 = 0, x1, y1, w, k, pad = 24, flip = true }) {
    const [t, r, b, l] = Array.isArray(pad) ? pad : [pad, pad, pad, pad];
    Object.assign(this, { x0, y0, x1, y1, t, r, b, l, flip });
    this.k = k ?? (w - l - r) / (x1 - x0);
    this.W = Math.round(w ?? (x1 - x0) * this.k + l + r);
    this.H = Math.round((y1 - y0) * Math.abs(this.k) + t + b);
    this.out = [];
    this.defs = '';
  }
  X(x) { return f1(this.l + (x - this.x0) * this.k); }
  Y(y) { const k = Math.abs(this.k); return f1(this.flip ? this.t + (this.y1 - y) * k : this.t + (y - this.y0) * k); }
  add(s) { this.out.push(s); return this; }
  rect(xa, ya, xb, yb, cls = '', extra = '') {
    const x = Math.min(this.X(xa), this.X(xb));
    const y = Math.min(this.Y(ya), this.Y(yb));
    const w = Math.abs(this.X(xb) - this.X(xa));
    const h = Math.abs(this.Y(yb) - this.Y(ya));
    return this.add(`<rect x="${x}" y="${y}" width="${f1(w)}" height="${f1(h)}" class="${cls}" ${extra}/>`);
  }
  poly(pts, cls = '', close = true) {
    const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${this.X(x)} ${this.Y(y)}`).join('') + (close ? 'Z' : '');
    return this.add(`<path d="${d}" class="${cls}"/>`);
  }
  line(xa, ya, xb, yb, cls = 'ln') {
    return this.add(`<line x1="${this.X(xa)}" y1="${this.Y(ya)}" x2="${this.X(xb)}" y2="${this.Y(yb)}" class="${cls}"/>`);
  }
  circle(x, y, rpx, cls = '') { return this.add(`<circle cx="${this.X(x)}" cy="${this.Y(y)}" r="${rpx}" class="${cls}"/>`); }
  text(x, y, s, o = {}) {
    const a = o.a || 'middle';
    const rot = o.rot ? ` transform="rotate(${o.rot} ${f1(this.X(x) + (o.dx || 0))} ${f1(this.Y(y) + (o.dy || 0))})"` : '';
    const lines = String(s).split('\n');
    const lh = (o.size || 12) * 1.2;
    const y0 = this.Y(y) + (o.dy || 0) - ((lines.length - 1) * lh) / 2;
    const tsp = lines.map((ln, i) => `<tspan x="${f1(this.X(x) + (o.dx || 0))}" y="${f1(y0 + i * lh)}">${esc(ln)}</tspan>`).join('');
    return this.add(`<text text-anchor="${a}" dominant-baseline="central" class="${o.cls || 'lab'}"${o.size ? ` font-size="${o.size}"` : ''}${rot}>${tsp}</text>`);
  }
  // horizontal dimension between xa and xb, drawn off px from world y
  dimH(xa, xb, y, label, off = -16, o = {}) {
    const ya = this.Y(y);
    const yd = ya + off;
    const xa2 = this.X(xa);
    const xb2 = this.X(xb);
    const ext = off < 0 ? -4 : 4;
    this.add(`<path d="M${xa2} ${f1(ya + (off < 0 ? -3 : 3))}V${f1(yd + ext)}M${xb2} ${f1(ya + (off < 0 ? -3 : 3))}V${f1(yd + ext)}" class="ext"/>`);
    this.add(`<path d="M${xa2} ${f1(yd)}H${xb2}M${f1(xa2 - 3)} ${f1(yd + 3)}l6 -6M${f1(xb2 - 3)} ${f1(yd + 3)}l6 -6" class="dim"/>`);
    const tx = o.at != null ? this.X(o.at) : (xa2 + xb2) / 2;
    return this.add(`<text x="${f1(tx)}" y="${f1(yd + (off < 0 ? -7 : 8))}" text-anchor="middle" dominant-baseline="central" class="dimt">${esc(label ?? ftin(Math.abs(xb - xa)))}</text>`);
  }
  // vertical dimension between ya and yb, drawn off px from world x
  dimV(ya, yb, x, label, off = 16, o = {}) {
    const xa = this.X(x);
    const xd = xa + off;
    const y1 = this.Y(ya);
    const y2 = this.Y(yb);
    const ext = off < 0 ? -4 : 4;
    this.add(`<path d="M${f1(xa + (off < 0 ? -3 : 3))} ${y1}H${f1(xd + ext)}M${f1(xa + (off < 0 ? -3 : 3))} ${y2}H${f1(xd + ext)}" class="ext"/>`);
    this.add(`<path d="M${f1(xd)} ${y1}V${y2}M${f1(xd - 3)} ${f1(y1 + 3)}l6 -6M${f1(xd - 3)} ${f1(y2 + 3)}l6 -6" class="dim"/>`);
    const ty = o.at != null ? this.Y(o.at) : (y1 + y2) / 2;
    const side = o.side || (off < 0 ? 'left' : 'right');
    if (o.rot) return this.add(`<text x="${f1(xd + (off < 0 ? -8 : 8))}" y="${f1(ty)}" text-anchor="middle" dominant-baseline="central" class="dimt" transform="rotate(-90 ${f1(xd + (off < 0 ? -8 : 8))} ${f1(ty)})">${esc(label ?? ftin(Math.abs(yb - ya)))}</text>`);
    return this.add(`<text x="${f1(xd + (side === 'left' ? -6 : 6))}" y="${f1(ty)}" text-anchor="${side === 'left' ? 'end' : 'start'}" dominant-baseline="central" class="dimt">${esc(label ?? ftin(Math.abs(yb - ya)))}</text>`);
  }
  // a leader from a world point to a label dx, dy px away
  lead(x, y, dx, dy, label, o = {}) {
    const px = this.X(x);
    const py = this.Y(y);
    const a = o.a || (dx < 0 ? 'end' : dx > 0 ? 'start' : 'middle');
    this.add(`<path d="M${px} ${py}L${f1(px + dx)} ${f1(py + dy)}" class="lead"/><circle cx="${px}" cy="${py}" r="2" class="leaddot"/>`);
    return this.text(x, y, label, { a, dx: dx + (a === 'start' ? 4 : a === 'end' ? -4 : 0), dy: dy + (a === 'middle' ? (dy < 0 ? -8 : 8) : 0), cls: o.cls || 'lab', size: o.size });
  }
  // Labels stacked in a column at px x (side 'right': text starts there,
  // 'left': text ends there), each with a leader to its world point. Labels
  // are pushed apart so they never overlap.
  labels(items, xpx, side = 'right', gap = 14) {
    const pts = items.map((it) => ({ ...it, px: this.X(it.x), py: this.Y(it.y), h: gap * String(it.t).split('\n').length }));
    pts.sort((a, b) => a.py - b.py);
    let bottom = -Infinity;
    for (const p of pts) { p.ty = Math.max(p.py, bottom + p.h / 2 + 2); bottom = p.ty + p.h / 2; }
    let top = this.H - 2;
    for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; p.ty = Math.min(p.ty, top - p.h / 2); top = p.ty - p.h / 2 - 2; }
    const sg = side === 'right' ? 1 : -1;
    for (const p of pts) {
      this.add(`<path d="M${p.px} ${p.py}L${f1(xpx - 10 * sg)} ${f1(p.ty)}H${f1(xpx - 3 * sg)}" class="lead"/><circle cx="${p.px}" cy="${p.py}" r="2" class="leaddot"/>`);
      const lines = String(p.t).split('\n');
      const y0 = p.ty - ((lines.length - 1) * gap) / 2;
      this.add(`<text text-anchor="${side === 'right' ? 'start' : 'end'}" dominant-baseline="central" class="${p.cls || 'lab'}">${lines.map((ln, i) => `<tspan x="${f1(xpx)}" y="${f1(y0 + i * gap)}">${esc(ln)}</tspan>`).join('')}</text>`);
    }
    return this;
  }
  svg(label = '', cls = '') {
    return `<svg class="gd ${cls}" viewBox="0 0 ${this.W} ${this.H}" role="img" aria-label="${esc(label)}">${this.defs}${this.out.join('')}</svg>`;
  }
}

// pixel-space figure, y down
export const px = (w, h, pad = 0) => new Fig({ x0: 0, y0: 0, x1: w, y1: h, w: w + 2 * pad, pad, flip: false });

// Drawings 700 px or wider take a whole row; none is shown larger than it
// was drawn, so the text stays the same size everywhere.
export function figure(svg, caption, cls = '') {
  const w = Number((svg.match(/viewBox="0 0 (\d+)/) || [])[1] || 0);
  const wide = w >= 700 || cls.includes('wide') ? ' wide' : '';
  const art = svg.replace('<svg ', `<svg style="max-width:${w}px" `);
  return `<figure class="gfig ${cls.replace('wide', '')}${wide}"><div class="gfig-art">${art}</div>${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>`;
}
export function shotFig(id, caption, cls = '') {
  return `<figure class="gfig shot ${cls}"><div class="gshot" data-shot="${id}"><img alt="${esc(caption.replace(/<[^>]+>/g, ''))}" hidden></div>${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>`;
}

// ---------------------------------------------------------------- shared pieces
// a 2x4 seen end-on at (x, y) (pixel figure), w × h px
function endGrain(F, x, y, w, h, cls = 'wood') {
  F.add(`<rect x="${x}" y="${y}" width="${w}" height="${h}" class="${cls}"/>`);
  for (let k = 1; k <= 3; k++) F.add(`<path d="M${x + 3} ${y + (h * k) / 4}q${w / 2 - 3} ${-h / 10} ${w - 6} 0" class="grain"/>`);
}
function nail(F, x, y, len, ang, cls = 'nail') {
  // head at (x,y), shank pointing at ang degrees (0 = right, 90 = down)
  const r = (ang * Math.PI) / 180;
  const ex = x + len * Math.cos(r);
  const ey = y + len * Math.sin(r);
  const hx = 5 * Math.sin(r);
  const hy = -5 * Math.cos(r);
  F.add(`<path d="M${f1(x)} ${f1(y)}L${f1(ex)} ${f1(ey)}" class="${cls}"/><path d="M${f1(x - hx)} ${f1(y - hy)}L${f1(x + hx)} ${f1(y + hy)}" class="${cls} head"/>`);
}
const T = (F, x, y, s, o = {}) => F.text(x, y, s, o);
const panelTitle = (F, x, y, s) => F.text(x, y, s, { cls: 'ttl', a: 'start' });
const arrow = (F, x1, y1, x2, y2, cls = 'arr') => {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const h = 7;
  F.add(`<path d="M${x1} ${y1}L${x2} ${y2}" class="${cls}"/><path d="M${f1(x2 - h * Math.cos(a - 0.45))} ${f1(y2 - h * Math.sin(a - 0.45))}L${x2} ${y2}L${f1(x2 - h * Math.cos(a + 0.45))} ${f1(y2 - h * Math.sin(a + 0.45))}" class="${cls} head"/>`);
};
const corr = (x0, x1, y, amp, pitch, ph = 0) => {
  let d = '';
  for (let x = x0; x <= x1 + 0.01; x += 2) d += `${d ? 'L' : 'M'}${f1(x)} ${f1(y - amp * Math.cos(((x - x0) / pitch) * 2 * Math.PI + ph))}`;
  return d;
};

// ---------------------------------------------------------------- generic diagrams
export function lumberSizes() {
  const F = px(720, 200);
  const items = [['2x4', 1.5, 3.5], ['2x6', 1.5, 5.5], ['1x4', 0.75, 3.5], ['1x6', 0.75, 5.5]];
  const k = 22;
  let x = 30;
  for (const [n, t, w] of items) {
    const W = t * k;
    const H = w * k;
    endGrain(F, x, 150 - H, W, H);
    T(F, x + W / 2, 168, n, { cls: 'ttl' });
    T(F, x + W / 2, 186, `${inch(t)} × ${inch(w)}`, { cls: 'note' });
    x += W + 120;
  }
  T(F, 640, 70, 'The name is the size\nbefore drying and\nplaning. Always\nmeasure the real\nboard.', { a: 'middle', cls: 'note' });
  return F.svg('Real sizes of 2x4, 2x6, 1x4 and 1x6 lumber');
}

export function nailing() {
  const F = px(760, 230);
  // face nail: through a 1x into a 2x
  panelTitle(F, 10, 16, '1. Face nail');
  F.add('<rect x="20" y="100" width="190" height="40" class="wood"/><rect x="20" y="88" width="190" height="12" class="wood2"/>');
  nail(F, 80, 72, 60, 90);
  nail(F, 150, 72, 60, 90);
  T(F, 115, 170, 'Straight through the thin\nboard into the thick one', { cls: 'note' });
  // end nail
  panelTitle(F, 265, 16, '2. End nail');
  F.add('<rect x="290" y="70" width="40" height="110" class="wood"/><rect x="330" y="105" width="150" height="40" class="wood"/>');
  nail(F, 268, 115, 85, 0);
  nail(F, 268, 135, 85, 0);
  T(F, 385, 196, 'Through the side of one\nboard into the end of the other', { cls: 'note' });
  // toenail
  panelTitle(F, 520, 16, '3. Toenail');
  F.add('<rect x="520" y="170" width="220" height="30" class="wood"/><rect x="610" y="40" width="40" height="130" class="wood"/>');
  nail(F, 598, 120, 66, 60);
  F.add('<path d="M604 170V140" class="dimx"/>');
  T(F, 600, 155, '1"', { a: 'end', cls: 'note' });
  F.add('<path d="M640 100 a40 40 0 0 1 -22 30" class="dimx"/>');
  T(F, 676, 104, '60°', { cls: 'note' });
  T(F, 630, 215, 'At a slant, started 1" up the stud', { cls: 'note' });
  return F.svg('Three ways to nail: face nailing, end nailing and toenailing');
}

export function measureMark() {
  const F = px(760, 200);
  panelTitle(F, 10, 16, '1. Hook the tape on the end, mark with a V');
  F.add('<rect x="20" y="60" width="330" height="44" class="wood"/>');
  F.add('<rect x="12" y="50" width="250" height="12" class="tape"/><rect x="12" y="50" width="6" height="22" class="tapehook"/>');
  for (let i = 0; i < 12; i++) F.add(`<path d="M${30 + i * 20} 50v${i % 4 ? 5 : 9}" class="tick"/>`);
  F.add('<path d="M244 64l6 12l6 -12" class="mark"/>');
  T(F, 250, 124, 'point of the V = the measurement', { cls: 'note' });
  panelTitle(F, 400, 16, '2. Square a line, X the waste side');
  F.add('<rect x="400" y="60" width="330" height="44" class="wood"/>');
  F.add('<path d="M560 58v48" class="mark"/>');
  F.add('<path d="M548 40h28l-28 28z" class="square"/>');
  F.add('<path d="M600 70l20 24M620 70l-20 24" class="mark"/>');
  T(F, 610, 124, 'waste', { cls: 'note' });
  F.add('<rect x="561" y="56" width="4" height="52" class="kerf"/>');
  T(F, 560, 150, 'Cut on the waste side of the line, so the\nsaw blade (about 1/8" wide) eats the waste,\nnot your measurement.', { cls: 'note' });
  T(F, 175, 160, 'Measure twice. Cut once.', { cls: 'ttl' });
  return F.svg('Measuring, marking and where to cut');
}

export function squareCheck(Wd, Dd) {
  const F = px(760, 250);
  panelTitle(F, 10, 16, 'Square: the two diagonals are equal');
  const x0 = 40, y0 = 50, w = 300, h = 150;
  F.add(`<rect x="${x0}" y="${y0}" width="${w}" height="${h}" class="outline"/>`);
  F.add(`<path d="M${x0} ${y0}L${x0 + w} ${y0 + h}M${x0 + w} ${y0}L${x0} ${y0 + h}" class="diag"/>`);
  T(F, x0 + w / 2, y0 + h + 22, Wd ? `diagonals should both be ${Wd}` : 'measure corner to corner both ways', { cls: 'note' });
  if (Dd) T(F, x0 + w / 2, y0 + h + 38, Dd, { cls: 'note' });
  panelTitle(F, 420, 16, 'Or check one corner with 3-4-5');
  const cx = 450, cy = 210, k = 40;
  F.add(`<path d="M${cx} ${cy}H${cx + 4 * k}M${cx} ${cy}V${cy - 3 * k}" class="outline"/>`);
  F.add(`<path d="M${cx + 4 * k} ${cy}L${cx} ${cy - 3 * k}" class="diag"/>`);
  T(F, cx + 2 * k, cy + 14, "4'", { cls: 'dimt' });
  T(F, cx - 14, cy - 1.5 * k, "3'", { cls: 'dimt' });
  T(F, cx + 2 * k + 16, cy - 1.5 * k - 12, "5'", { cls: 'dimt' });
  F.add(`<rect x="${cx}" y="${cy - 14}" width="14" height="14" class="outline"/>`);
  T(F, 660, 110, "Mark 3' along one side\nand 4' along the other.\nIf the corner is square,\nthe marks are exactly\n5' apart. Use 6-8-10\nfor bigger corners.", { cls: 'note' });
  return F.svg('Checking square with diagonals and with 3-4-5');
}

export function levelPlumb() {
  const F = px(760, 220);
  const level = (x, y, w, h, vertical) => {
    F.add(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" class="level"/>`);
    const cx = x + w / 2, cy = y + h / 2;
    if (vertical) F.add(`<rect x="${cx - 7}" y="${cy - 16}" width="14" height="32" rx="7" class="vial"/><circle cx="${cx}" cy="${cy}" r="5" class="bubble"/><path d="M${cx - 7} ${cy - 7}h14M${cx - 7} ${cy + 7}h14" class="tick"/>`);
    else F.add(`<rect x="${cx - 16}" y="${cy - 7}" width="32" height="14" rx="7" class="vial"/><circle cx="${cx}" cy="${cy}" r="5" class="bubble"/><path d="M${cx - 7} ${cy - 7}v14M${cx + 7} ${cy - 7}v14" class="tick"/>`);
  };
  panelTitle(F, 10, 16, 'Level: horizontal');
  F.add('<rect x="20" y="120" width="300" height="30" class="wood"/>');
  level(40, 96, 260, 22, false);
  T(F, 170, 175, 'bubble between the lines = level', { cls: 'note' });
  panelTitle(F, 400, 16, 'Plumb: exactly vertical');
  F.add('<rect x="470" y="30" width="30" height="180" class="wood"/>');
  level(500, 40, 22, 160, true);
  T(F, 640, 110, 'Hold the level on two\nfaces of a post or stud:\nthe side and the front.', { cls: 'note' });
  return F.svg('Checking level and plumb with a spirit level');
}

export function concreteScrew() {
  const F = px(760, 250);
  const plate = (x) => {
    F.add(`<rect x="${x}" y="70" width="150" height="34" class="wood"/><rect x="${x - 10}" y="104" width="170" height="120" class="conc"/><rect x="${x - 10}" y="104" width="170" height="5" class="plastic"/>`);
  };
  panelTitle(F, 10, 16, '1. Drill');
  plate(30);
  F.add('<rect x="98" y="20" width="14" height="40" class="tool"/><path d="M105 60V165" class="bit"/>');
  F.add('<rect x="101" y="70" width="8" height="98" class="hole"/>');
  F.add('<path d="M175 104v64" class="dimx"/>');
  T(F, 182, 136, 'at least\n2-1/4"\ninto the\nconcrete', { a: 'start', cls: 'note' });
  T(F, 105, 238, '3/16" masonry bit, hammer setting', { cls: 'note' });
  panelTitle(F, 270, 16, '2. Blow out the dust');
  plate(290);
  F.add('<rect x="361" y="70" width="8" height="98" class="hole"/>');
  F.add('<path d="M365 60c-20 -18 -40 -10 -60 -30M365 60c10 -24 20 -30 40 -38" class="dust"/>');
  T(F, 365, 238, 'or the screw will not bite', { cls: 'note' });
  panelTitle(F, 530, 16, '3. Drive the screw');
  plate(550);
  F.add('<rect x="621" y="70" width="8" height="98" class="hole"/>');
  F.add('<path d="M617 64h16v6h-16z" class="steelf"/><path d="M625 70V160" class="screw"/>');
  for (let y = 76; y < 160; y += 7) F.add(`<path d="M620 ${y}l10 4" class="thread"/>`);
  T(F, 625, 238, 'snug, then stop: too tight strips it', { cls: 'note' });
  return F.svg('Fixing wood to concrete with a concrete screw');
}

export function wedgeAnchor() {
  const F = px(760, 260);
  const base = (x) => F.add(`<rect x="${x}" y="80" width="150" height="34" class="wood"/><rect x="${x - 10}" y="114" width="170" height="120" class="conc"/><rect x="${x - 10}" y="114" width="170" height="5" class="plastic"/>`);
  panelTitle(F, 10, 16, '1. Drill through the plate');
  base(30);
  F.add('<rect x="98" y="80" width="14" height="110" class="hole"/><path d="M105 50V190" class="bit"/><rect x="96" y="22" width="18" height="30" class="tool"/>');
  F.add('<path d="M178 114v76" class="dimx"/>');
  T(F, 184, 152, '3-1/2"\ninto the\nconcrete', { a: 'start', cls: 'note' });
  T(F, 105, 250, '1/2" masonry bit · then blow it clean', { cls: 'note' });
  panelTitle(F, 270, 16, '2. Tap the anchor in');
  base(290);
  F.add('<rect x="358" y="80" width="14" height="110" class="hole"/>');
  F.add('<path d="M365 62V176" class="bolt"/><rect x="354" y="70" width="22" height="6" class="steelf"/><rect x="357" y="62" width="16" height="8" class="steelf"/><path d="M358 168l14 0l-3 10h-8z" class="steelf"/>');
  F.add('<rect x="340" y="28" width="50" height="16" rx="3" class="tool"/><path d="M365 44v14" class="tool"/>');
  T(F, 365, 250, 'nut flush with the top, washer on', { cls: 'note' });
  panelTitle(F, 530, 16, '3. Tighten 3–4 turns');
  base(550);
  F.add('<rect x="618" y="80" width="14" height="110" class="hole"/>');
  F.add('<path d="M625 50V170" class="bolt"/><rect x="614" y="74" width="22" height="6" class="steelf"/><rect x="617" y="66" width="16" height="8" class="steelf"/><path d="M616 162l18 0l-2 12h-14z" class="steelf"/>');
  F.add('<path d="M600 52a28 12 0 1 0 50 -2" class="arr"/>');
  T(F, 625, 250, 'the wedge at the bottom grips the concrete', { cls: 'note' });
  return F.svg('Setting a wedge anchor through a wall plate into concrete');
}

export function concreteMix(cementKg = 40) {
  const F = px(760, 240);
  const bucket = (x, n, cls, label) => {
    for (let i = 0; i < n; i++) {
      const bx = x + (i % 3) * 46;
      const by = 70 + Math.floor(i / 3) * 0;
      F.add(`<path d="M${bx} ${by}h38l-4 50h-30z" class="${cls}"/><path d="M${bx - 2} ${by}h42" class="ln"/>`);
    }
    T(F, x + Math.min(n, 3) * 23 - 4, 140, label, { cls: 'ttl' });
  };
  panelTitle(F, 10, 16, 'Concrete, by volume, using the same bucket for everything');
  bucket(20, 1, 'b-cem', '1 cement');
  T(F, 90, 95, '+', { cls: 'ttl', size: 20 });
  bucket(110, 2, 'b-sand', '2 sand');
  T(F, 220, 95, '+', { cls: 'ttl', size: 20 });
  bucket(240, 3, 'b-grav', '3 gravel');
  T(F, 390, 95, '+', { cls: 'ttl', size: 20 });
  F.add('<path d="M410 70h38l-4 50h-30z" class="b-water"/><path d="M408 70h42" class="ln"/><path d="M412 98h34" class="ln"/>');
  T(F, 429, 140, '½ water', { cls: 'ttl' });
  T(F, 230, 176, `Mix the dry parts first until the colour is even, then add water a little at a time.\nOne ${cementKg} kg bag of cement is about 1-1/2 buckets (5-gal).`, { cls: 'note' });
  panelTitle(F, 520, 16, 'How wet?');
  F.add('<path d="M540 120q30 -40 60 0z" class="conc"/><path d="M630 120q30 -8 70 0z" class="conc"/>');
  T(F, 570, 140, 'right: holds\nits shape', { cls: 'note' });
  T(F, 665, 140, 'too wet:\nslumps flat', { cls: 'note' });
  T(F, 620, 196, 'Like thick oatmeal. Extra\nwater makes weak concrete.', { cls: 'note' });
  return F.svg('Concrete mix proportions');
}

export function mortarMix() {
  const F = px(760, 170);
  panelTitle(F, 10, 16, 'Mortar for laying block: 1 cement : 4 sand (no gravel)');
  for (let i = 0; i < 5; i++) {
    const x = 30 + i * 52 + (i ? 30 : 0);
    F.add(`<path d="M${x} 50h38l-4 50h-30z" class="${i ? 'b-sand' : 'b-cem'}"/><path d="M${x - 2} 50h42" class="ln"/>`);
  }
  T(F, 49, 118, '1 cement', { cls: 'ttl' });
  T(F, 218, 118, '4 sand', { cls: 'ttl' });
  T(F, 560, 75, 'Add water until it is like soft peanut\nbutter: it holds on a tilted trowel\nwithout running off. Mix only what you\ncan use in an hour.', { cls: 'note' });
  T(F, 380, 150, 'Grout for filling block cells: concrete with small (pea-size) gravel, a little wetter so it flows into the cells.', { cls: 'note' });
  return F.svg('Mortar mix proportions');
}

export function speedSquare(pitch) {
  const F = px(760, 260);
  const th = Math.atan(pitch / 12);
  panelTitle(F, 10, 16, `Marking a ${pitch}-in-12 plumb line with a speed square`);
  const top = 120;
  F.add(`<rect x="30" y="${top}" width="440" height="80" class="wood"/>`);
  // the right angle is at the pivot; the ruler edge crosses the board, the
  // fence edge has swung up off it by the roof angle
  const P0 = [210, top];
  const L = 130;
  const R = [P0[0] + L * Math.sin(th), P0[1] + L * Math.cos(th)];
  const Fe = [P0[0] + L * Math.cos(th), P0[1] - L * Math.sin(th)];
  F.add(`<path d="M${P0[0]} ${P0[1]}L${f1(R[0])} ${f1(R[1])}L${f1(Fe[0])} ${f1(Fe[1])}Z" class="square"/>`);
  // where the hypotenuse crosses the board edge
  const t = (top - R[1]) / (Fe[1] - R[1]);
  const cx = R[0] + t * (Fe[0] - R[0]);
  F.add(`<circle cx="${P0[0]}" cy="${P0[1]}" r="4" class="leaddot"/><circle cx="${f1(cx)}" cy="${top}" r="4" class="leaddot"/>`);
  const k = 80 / Math.cos(th);
  F.add(`<path d="M${P0[0]} ${P0[1]}L${f1(P0[0] + k * Math.sin(th))} ${top + 80}" class="mark"/>`);
  F.lead(P0[0], P0[1], -40, -40, 'pivot on the edge');
  F.lead(cx, top, 40, -50, `"${pitch}" on the COMMON scale\nlines up with the same edge`);
  F.lead(P0[0] + (k / 2) * Math.sin(th), top + 40, -80, 30, 'draw along this edge:\nthe plumb line');
  T(F, 620, 110, '1. Hold the pivot on the edge\nof the board.\n2. Turn the square until the\nedge of the board crosses the\nnumber you want on the\n"COMMON" scale.\n3. Draw along the ruler edge.\nWhen the rafter is in place,\nthis line is vertical.', { cls: 'note' });
  T(F, 250, 236, 'A line square to the plumb line is level: that is the seat cut.', { cls: 'note' });
  return F.svg('Using a speed square to mark a roof-pitch line');
}

export function tinLap(pvc = false) {
  const F = px(760, 250);
  panelTitle(F, 10, 16, 'Side lap: one corrugation, screws through the crests');
  const y = 110;
  F.add(`<path d="${corr(20, 420, y, 9, 30)}" class="tin"/>`);
  F.add(`<path d="${corr(300, 740, y - 4, 9, 30)}" class="tin top"/>`);
  for (const x of [60, 180, 330, 480, 600, 720]) {
    const cx = x;
    F.add(`<path d="M${cx} ${y - 34}V${y + 28}" class="screw"/><rect x="${cx - 8}" y="${y - 30}" width="16" height="5" class="washer"/><rect x="${cx - 5}" y="${y - 38}" width="10" height="8" class="steelf"/>`);
  }
  F.add(`<rect x="10" y="${y + 26}" width="740" height="22" class="wood"/>`);
  T(F, 380, y + 37, 'purlin', { cls: 'note' });
  F.add(`<path d="M300 ${y + 60}h120" class="dimx"/>`);
  T(F, 360, y + 74, 'lap: one corrugation', { cls: 'note' });
  T(F, 560, 40, 'crest (high point) — water runs in the valleys,\nso a hole in a crest stays dry', { cls: 'note' });
  F.add('<path d="M480 52L480 80" class="lead"/>');
  T(F, 380, 222, pvc ? 'PVC: drill a hole 1/8" bigger than the screw first, so the sheet can grow and shrink in the sun.' : 'Self-drilling roofing screws go straight through the sheet into the wood: no pilot hole needed.', { cls: 'note' });
  return F.svg('How corrugated sheets overlap and where the screws go');
}

export function washerTight() {
  const F = px(760, 150);
  const one = (x, squash, label) => {
    F.add(`<path d="M${x - 50} 90q25 -26 50 0t50 0" class="tin"/>`);
    F.add(`<rect x="${x - 10}" y="${66 - (squash ? 0 : 6)}" width="20" height="${squash ? 4 : 6}" class="washer"/>`);
    if (squash > 1) F.add(`<path d="M${x - 14} 68h-4M${x + 14} 68h4" class="washer"/>`);
    F.add(`<rect x="${x - 6}" y="${54 - (squash ? 0 : 6)}" width="12" height="10" class="steelf"/><path d="M${x} 66V120" class="screw"/>`);
    T(F, x, 132, label, { cls: 'note' });
  };
  panelTitle(F, 10, 16, 'How tight?');
  one(130, 0, 'too loose: leaks');
  one(380, 1, 'right: washer just squeezed');
  one(630, 2, 'too tight: dents the sheet, leaks');
  return F.svg('How tight to drive roofing screws');
}

export function hurricaneTie(below = 'ring beam') {
  const F = px(560, 280);
  panelTitle(F, 10, 16, 'Hurricane tie: one on every rafter');
  F.add('<rect x="40" y="170" width="480" height="34" class="wood"/>');
  T(F, 470, 187, 'wall plate', { cls: 'note' });
  F.add('<rect x="40" y="204" width="480" height="60" class="conc"/>');
  T(F, 470, 238, below, { cls: 'note' });
  F.add('<path d="M120 170L470 40L470 90L180 196Z" class="wood"/>');
  T(F, 380, 66, 'rafter', { cls: 'note', rot: -20 });
  F.add('<path d="M250 150l40 -15v52h-40z" class="steelf tie"/><path d="M250 166h40v24h-40z" class="steelf tie"/>');
  for (const [x, y] of [[262, 152], [278, 146], [262, 162], [278, 156], [262, 178], [278, 178], [262, 186], [278, 186]]) F.add(`<circle cx="${x}" cy="${y}" r="2.6" class="nailhead"/>`);
  F.lead(290, 150, 70, -50, 'nail every hole with the\n1-1/2" tie nails', {});
  F.lead(250, 186, -60, 40, 'bottom flange on the plate', {});
  return F.svg('A hurricane tie holding a rafter to the wall plate');
}

export function openingFraming() {
  const F = px(760, 340);
  panelTitle(F, 10, 16, 'Parts around a window opening');
  const wd = (x, y, w, h, cls = 'wood') => F.add(`<rect x="${x}" y="${y}" width="${w}" height="${h}" class="${cls}"/>`);
  const X0 = 130, X1 = 570;
  F.add(`<rect x="${X0}" y="30" width="${X1 - X0}" height="22" class="conc"/><rect x="${X0}" y="296" width="${X1 - X0}" height="36" class="conc"/>`);
  wd(X0, 52, X1 - X0, 10, 'wood2');
  wd(X0, 286, X1 - X0, 10, 'wood2');
  wd(X0 + 14, 62, 14, 224);
  wd(X1 - 28, 62, 14, 224);
  wd(250, 62, 14, 224, 'wood hl');
  wd(436, 62, 14, 224, 'wood hl');
  wd(264, 112, 172, 12, 'wood hl2');
  wd(264, 232, 172, 12, 'wood hl2');
  wd(343, 62, 14, 50);
  wd(343, 244, 14, 42);
  wd(X0 + 28, 170, 250 - X0 - 28, 12, 'wood2');
  wd(450, 170, X1 - 28 - 450, 12, 'wood2');
  F.add('<rect x="264" y="124" width="172" height="108" class="areafill"/>');
  T(F, 350, 178, 'rough opening', { cls: 'note' });
  F.labels([
    { x: 350, y: 41, t: 'ring beam (concrete)' },
    { x: 350, y: 57, t: 'top plate' },
    { x: 350, y: 86, t: 'cripple stud' },
    { x: 400, y: 118, t: 'head (2x4 laid flat)' },
    { x: 443, y: 200, t: 'king stud' },
    { x: 400, y: 238, t: 'rough sill' },
    { x: 350, y: 268, t: 'cripple stud' },
    { x: 400, y: 291, t: 'bottom plate' },
    { x: 400, y: 314, t: 'pony wall (concrete)' },
  ], 596, 'right');
  F.labels([
    { x: X0 + 21, y: 110, t: 'stud' },
    { x: 200, y: 176, t: 'blocking' },
    { x: 257, y: 260, t: 'king stud' },
  ], 100, 'left');
  return F.svg('The framing around a window opening, with each part named');
}

// A ledged and braced board door seen from the batten side (inside), to
// scale. The hinges are on the right in this view.
export function doorBuild({ w, h, boards }) {
  const F = new Fig({ x0: -16, x1: w + 30, y0: -6, y1: h + 6, w: 520, pad: [16, 16, 30, 16] });
  const bw = w / boards;
  for (let k = 0; k < boards; k++) F.rect(k * bw + 0.05, 0, (k + 1) * bw - 0.05, h, 'wood');
  const b1 = [6, 9.5];
  const b2 = [h - 9.5, h - 6];
  F.rect(1, b1[0], w - 1, b1[1], 'wood2');
  F.rect(1, b2[0], w - 1, b2[1], 'wood2');
  // brace: low end on the hinge side (right here), high on the latch side
  const t = 3.5 / 2;
  F.poly([[w - 3 - t, b1[1]], [w - 3 + t * 0.4, b1[1]], [3 + t, b2[0]], [3 - t * 0.4, b2[0]]], 'wood2 hl');
  for (const v of [8, h / 2, h - 8]) F.rect(w, v - 1.75, w + 10, v + 1.75, 'steelf');
  F.text(w + 5, 0, 'hinge side', { cls: 'ttl', dy: 14 });
  F.text(w * 0.2, 0, 'latch side', { cls: 'ttl', dy: 14 });
  F.dimH(0, w, h, inch(w), -12);
  F.dimV(0, h, 0, ftin(h), -26, { rot: true });
  F.dimV(0, b1[0], w * 0.3, '6"', 6);
  F.dimV(b2[1], h, w * 0.3, '6"', 6);
  F.lead(w / 2, (b1[1] + b2[0]) / 2, 40, 30, 'brace: low end\non the hinge side');
  F.lead(w * 0.75, b2[0] + 1.75, 30, -16, 'batten');
  F.lead(w * 0.75, b1[0] + 1.75, 30, 16, 'batten');
  return F.svg('Board door with battens and a diagonal brace, from the inside');
}

// A louvre window in its rough opening, to scale, seen from outside.
export function louvreWin({ roW, roH, frameH, bladeW }) {
  const F = new Fig({ x0: -8, x1: roW + 8, y0: -8, y1: roH + 8, w: 380, pad: [24, 90, 20, 16] });
  F.rect(-5, -5, roW + 5, roH + 5, 'wood2');
  F.rect(0, 0, roW, roH, 'hole', 'style="fill:var(--panel)"');
  F.rect(0.25, 0.5, 1.25, 0.5 + frameH, 'alu');
  F.rect(roW - 1.25, 0.5, roW - 0.25, 0.5 + frameH, 'alu');
  const n = Math.round(frameH / 3.6);
  for (let k = 0; k < n; k++) {
    const y = 0.5 + ((k + 0.5) * frameH) / n;
    F.rect(1.25, y - 1.6, roW - 1.25, y + 1.6, 'glass');
  }
  F.dimH(0, roW, roH, `${ftin(roW)} opening`, -14);
  F.dimV(0, roH, roW, ftin(roH), 10);
  F.lead(roW - 0.75, roH * 0.25, 40, 10, 'frame\nchannel');
  F.lead(roW / 2, 0.5 + frameH / n / 2, 60, 28, `${inch(bladeW)} glass blade`);
  F.lead(-3, roH * 0.6, 0, 0, '');
  F.text(-5, roH + 5, 'casing (1x4)', { a: 'start', cls: 'note', dy: -12 });
  return F.svg('A louvre window in its rough opening');
}

export function pvcGlue() {
  const F = px(760, 220);
  const steps = [
    ['1. Cut square,\nscrape the burrs'],
    ['2. Dry-fit, mark\nwhere it lines up'],
    ['3. Primer on\nboth parts'],
    ['4. Cement on\nboth parts'],
    ['5. Push in fully,\n¼ turn, hold 30 s'],
  ];
  steps.forEach(([t], i) => {
    const x = 20 + i * 150;
    F.add(`<rect x="${x}" y="70" width="70" height="28" class="pipe"/><rect x="${x + 64}" y="62" width="50" height="44" rx="3" class="pipe fit"/>`);
    if (i === 0) F.add(`<path d="M${x + 4} 66v36" class="mark"/>`);
    if (i === 1) F.add(`<path d="M${x + 60} 60v48M${x + 84} 58v52" class="mark"/>`);
    if (i === 2) F.add(`<rect x="${x + 30}" y="68" width="34" height="32" class="primer"/>`);
    if (i === 3) F.add(`<rect x="${x + 30}" y="68" width="34" height="32" class="cement"/>`);
    if (i === 4) F.add(`<path d="M${x + 40} 130a40 14 0 0 0 50 0" class="arr"/>`);
    T(F, x + 60, 170, t, { cls: 'note' });
  });
  panelTitle(F, 10, 16, 'Gluing PVC pipe (work fast: the cement sets in seconds)');
  return F.svg('How to glue PVC pipe and fittings');
}

export function slopeCheck() {
  const F = px(760, 190);
  panelTitle(F, 10, 16, 'Checking the fall: 1/4" per foot is 1" over a 4\' level');
  F.add('<path d="M40 120L700 150" class="pipeline"/>');
  F.add('<rect x="120" y="96" width="480" height="18" rx="3" class="level" transform="rotate(0)"/>');
  F.add('<rect x="590" y="114" width="14" height="24" class="wood"/>');
  F.add('<circle cx="360" cy="105" r="5" class="bubble"/>');
  T(F, 640, 126, '1" block under\nthe low end', { a: 'start', cls: 'note' });
  T(F, 360, 176, 'Set the level on the pipe with a 1" block under its downhill end. When the bubble is centred, the fall is right.', { cls: 'note' });
  arrow(F, 30, 100, 105, 103);
  T(F, 30, 86, 'water flows this way', { cls: 'note', a: 'start' });
  return F.svg('Checking the drain slope with a level and a block');
}

export function blockBond() {
  const F = px(760, 260);
  panelTitle(F, 10, 16, 'Corner: the joints are staggered from one course to the next');
  const B = (x, y, w, h, cls = 'block') => F.add(`<rect x="${x}" y="${y}" width="${w}" height="${h}" class="${cls}"/>`);
  // plan of course 1 and 2 at a corner
  T(F, 120, 44, 'course 1 (plan)', { cls: 'note' });
  B(30, 60, 150, 30); B(184, 60, 150, 30);
  B(30, 94, 30, 150);
  T(F, 520, 44, 'course 2 (plan)', { cls: 'note' });
  B(430, 60, 30, 150); B(464, 60, 150, 30); B(618, 60, 120, 30);
  B(430, 214, 30, 30, 'block cut');
  T(F, 230, 150, 'The long wall runs through\nthe corner on course 1, the\nend wall runs through on\ncourse 2, and so on.', { cls: 'note' });
  T(F, 600, 150, 'Every block bridges the\njoint below it by about\nhalf a block.', { cls: 'note' });
  return F.svg('Running bond at a block corner');
}

export function blockString() {
  const F = px(760, 230);
  panelTitle(F, 10, 16, 'Lay the corners first, then fill in to a string line');
  const B = (x, y, w, h) => F.add(`<rect x="${x}" y="${y}" width="${w}" height="${h}" class="block"/>`);
  F.add('<rect x="10" y="196" width="740" height="16" class="conc"/>');
  for (let c = 0; c < 3; c++) {
    for (let i = 0; i < 3 - c; i++) {
      B(20 + i * 62 + (c % 2) * 31, 166 - c * 32, 60, 30);
      B(680 - i * 62 - (c % 2) * 31, 166 - c * 32, 60, 30);
    }
  }
  for (let i = 0; i < 4; i++) B(200 + i * 62, 166, 60, 30);
  F.add('<path d="M30 134L730 134" class="string"/>');
  T(F, 380, 122, 'string line, pulled tight at the height of the next course', { cls: 'note' });
  T(F, 380, 222, 'Each block: butter one end, set it on a bed of mortar, tap it down to the string and level with the trowel handle.', { cls: 'note' });
  return F.svg('Block corners built up first with a string line between them');
}

export function collarCast() {
  const F = px(760, 220);
  panelTitle(F, 10, 16, 'Casting a concrete collar on the pipe');
  F.add('<rect x="20" y="100" width="300" height="34" class="pipe"/>');
  F.add('<path d="M130 70h70l-6 92h-58z" class="b-cem"/>');
  F.add('<rect x="136" y="100" width="58" height="34" class="conc"/>');
  T(F, 165, 186, '5-gal bucket cut down to 6" tall,\nholes cut in both sides for the pipe', { cls: 'note' });
  T(F, 560, 90, '1. Slide the bucket ring onto the pipe on dry land.\n2. Tape the gaps around the pipe.\n3. Fill with concrete and pat it down.\n4. Wait 3 days, then cut the bucket off.\n5. One collar every 10 ft along the part in the water.', { cls: 'note' });
  return F.svg('Casting a concrete hold-down collar around the pipe');
}
