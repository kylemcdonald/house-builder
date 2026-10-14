// Parametric design engine. Turns a handful of parameters into a list of
// physical parts (with positions, materials, construction step and explode
// offsets) plus the raw quantities needed for the bill of materials.
//
// Coordinate system (inches): X = width (left→right as seen from the front),
// Y = up (ground = 0), Z = depth (back wall at z=0, front/door wall at z=D).

import * as THREE from 'three';
import { LUMBER, PLY, BAG_YIELD_FT3 } from './catalog.js';
import { ftin, inch, num } from './format.js';

export const DEFAULTS = {
  width: 36, // ft, outside of the concrete outline
  depth: 17, // ft
  cladding: 'metal', // 'metal' | 'pvc'
  // existing concrete frame
  floorAbove: 6, // finished floor above grade, in
  ponyT: 6, // perimeter outline / pony wall thickness, in
  ponyH: 24, // pony wall height above the floor, in
  colSize: 9, // square concrete columns, in
  midPosts: 2, // columns between the corners on each wall
  ringBottom: 84, // underside of the ring beam above the floor, in
  ringH: 9, // ring beam height, in
  // new floor slab inside the outline
  floorSlab: 'yes',
  floorSlabT: 4,
  rebarSpacing: 24,
  // roof
  pitch: 4,
  eave: 12,
  rake: 6,
  studSpacing: 24,
  rafterSpacing: 24,
  purlinSpacing: 24,
  wallPly: 'ply14',
  // door per bay between columns, per wall (bays left→right seen from outside):
  // front-back-left-right, '1' = door
  doorBays: '101-010-010-010',
  doorW: 32,
  doorH: 80,
  winSpacing: 10, // ft
  windowW: 3,
  windowH: 4,
  sill: 30,
  tinCover: 30,
  ovTin: 10,
  ovPly: 10,
  ovFraming: 10,
  ovFasteners: 15,
  ovCement: 15,
  freight: 0,
};

export const STEP = {
  SITE: 0, FLOOR_PREP: 1, FLOOR: 2, PLATES: 3, WALL_LONG: 4, WALL_ENDS: 5, ROOF_FRAME: 6,
  PURLINS: 7, ROOFING: 8, SIDING: 9, WINDOWS: 10, DOOR: 11, INTERIOR: 12, DONE: 13,
};

const EX = 24; // explode unit, inches
const TIN_STOCK = [120, 144];
const LAP = 6; // end lap for corrugated sheets
const CORR = { pitch: 3, depth: 0.75 };

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);

class Builder {
  constructor() {
    this.parts = [];
    this.lumber = [];
  }
  add(p) {
    p.id = this.parts.length;
    this.parts.push(p);
    return p;
  }
  box(x0, x1, y0, y1, z0, z1, o) {
    return this.add({
      kind: 'box',
      size: [Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)],
      pos: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2],
      quat: null,
      ...o,
    });
  }
  lumberBox(size, x0, x1, y0, y1, z0, z1, o) {
    const p = this.box(x0, x1, y0, y1, z0, z1, { mat: 'wood', ...o });
    p.lumber = size;
    p.len = Math.max(...p.size);
    this.lumber.push({ size, len: p.len, cat: o.cat || 'framing', label: o.name });
    return p;
  }
  // A member along a→b. dims = lumber size key or {t, d}. The deep face (d)
  // points along depthDir (orthogonalised); o.flat swaps the faces.
  member(a, b, dims, depthDir, o) {
    let t, d, size = null;
    if (typeof dims === 'string') { size = dims; t = LUMBER[dims].t; d = LUMBER[dims].w; } else { t = dims.t; d = dims.d; }
    if (o.flat) [t, d] = [d, t];
    const X = b.clone().sub(a);
    const len = X.length();
    X.normalize();
    const Y = depthDir.clone().sub(X.clone().multiplyScalar(depthDir.dot(X))).normalize();
    const Z = new THREE.Vector3().crossVectors(X, Y);
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
    const c = a.clone().add(b).multiplyScalar(0.5);
    const p = this.add({ kind: 'box', size: [len, d, t], pos: c.toArray(), quat: q.toArray(), mat: size ? 'wood' : 'wood', ...o });
    if (size && !o.temp) {
      p.lumber = size;
      p.len = len;
      this.lumber.push({ size, len, cat: o.cat || 'framing', label: o.name });
    }
    return p;
  }
  // Thin sheet built in local (x across, y up, z out) coordinates.
  sheet(origin, xAxis, yAxis, zAxis, geom, o) {
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis));
    return this.add({ kind: 'sheet', geom, pos: origin.toArray(), quat: q.toArray(), ...o });
  }
  // Lumber cut to a profile drawn in the (z, y) plane, spanning x0..x1.
  prism(pts, x0, x1, size, len, o) {
    const q = new THREE.Quaternion().setFromAxisAngle(UP, Math.PI / 2);
    const p = this.add({ kind: 'prism', pts: pts.map(([z, y]) => [-z, y]), depth: x1 - x0, pos: [x0, 0, 0], quat: q.toArray(), mat: 'wood', ...o });
    p.lumber = size;
    p.len = len;
    this.lumber.push({ size, len, cat: o.cat || 'framing', label: o.name });
    return p;
  }
  cyl(x, z, r, y0, y1, o) {
    return this.add({ kind: 'cyl', r, h: y1 - y0, pos: [x, (y0 + y1) / 2, z], quat: null, ...o });
  }
}

// Split [a,b] into pieces no longer than max, preferring to split at one of
// the candidate positions (e.g. over a post or rafter).
function splitRange(a, b, cands, max, fromRight = false) {
  if (fromRight) {
    return splitRange(-b, -a, cands.map((c) => -c), max).map(([s, e]) => [-e, -s]).reverse();
  }
  const out = [];
  let s = a;
  const cs = [...cands].sort((x, y) => x - y);
  while (b - s > max) {
    let c = null;
    for (const x of cs) if (x > s + 12 && x <= s + max) c = x;
    if (c === null) c = s + max;
    out.push([s, c]);
    s = c;
  }
  out.push([s, b]);
  return out;
}

// Subtract a list of [a,b] intervals from [lo,hi].
function subtract(lo, hi, holes) {
  let segs = [[lo, hi]];
  for (const [a, b] of holes) {
    const next = [];
    for (const [s, e] of segs) {
      if (b <= s || a >= e) { next.push([s, e]); continue; }
      if (a > s) next.push([s, a]);
      if (b < e) next.push([b, e]);
    }
    segs = next;
  }
  return segs.filter(([s, e]) => e - s > 0.5);
}

const overlaps = (a0, a1, b0, b1) => a0 < b1 - 1e-6 && b0 < a1 - 1e-6;

// Cheapest (shortest total) way to cover length L with 10'/12' sheets lapped 6".
export function sheetCombo(L) {
  let best = null;
  const tryCombo = (arr) => {
    const cover = arr.reduce((s, x) => s + x, 0) - LAP * (arr.length - 1);
    if (cover + 1e-6 < L) return;
    const tot = arr.reduce((s, x) => s + x, 0);
    if (!best || tot < best.tot || (tot === best.tot && arr.length < best.arr.length)) best = { arr, tot };
  };
  for (const a of TIN_STOCK) {
    tryCombo([a]);
    for (const b2 of TIN_STOCK) {
      tryCombo([a, b2]);
      for (const c of TIN_STOCK) tryCombo([a, b2, c]);
    }
  }
  if (!best) {
    const n = Math.ceil((L - LAP) / (144 - LAP));
    best = { arr: Array(n).fill(144) };
  }
  // Longest sheet at the bottom.
  return best.arr.sort((x, y) => y - x);
}

// Lay pieces of corrugated sheet up a column of length L. Returns
// [{start, len, stock}] where start is measured from the bottom.
function sheetRun(L) {
  const combo = sheetCombo(L);
  const out = [];
  let s = 0;
  combo.forEach((stock, i) => {
    const len = i === combo.length - 1 ? L - s : stock;
    out.push({ start: s, len: Math.min(len, stock), stock });
    s += stock - LAP;
  });
  return out;
}

export const WALL_KEYS = ['front', 'back', 'left', 'right'];

// '101-010-010-010' → { front: [true,false,true], ... }, padded to nBays.
export function parseDoorBays(str, nBays) {
  const parts = String(str || '').split('-');
  const out = {};
  WALL_KEYS.forEach((k, i) => {
    const bits = parts[i] || '';
    out[k] = Array.from({ length: nBays }, (_, j) => bits[j] === '1');
  });
  return out;
}

export function formatDoorBays(map) {
  return WALL_KEYS.map((k) => map[k].map((b) => (b ? '1' : '0')).join('')).join('-');
}

export function design(P) {
  const b = new Builder();
  const W = P.width * 12;
  const D = P.depth * 12;
  const p = P.pitch / 12;
  const theta = Math.atan(p);
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const y0 = P.floorAbove; // finished floor
  const Pt = P.ponyT;
  const PH = P.ponyH;
  const C = P.colSize;
  const Rb = P.ringBottom;
  const ringTop = Rb + P.ringH;
  const E = P.eave;
  const R = P.rake;
  const tinW = P.tinCover + 3;
  const warnings = [];
  const m = P.midPosts;
  const pw = 5.5; // 2x6 wall plate on the ring beam
  const yTop = y0 + ringTop + 1.5; // top of wall plate

  const rafterSpanH = D / 2 - pw;
  const rafterSize = rafterSpanH > 84 ? '2x6' : '2x4';
  const rd = LUMBER[rafterSize].w;
  const underside = (z) => yTop + (Math.min(z, D - z) - pw) * p;
  const rafterTop = (z) => underside(z) + rd / cos;
  const roofTop = (z) => rafterTop(z) + 1.5 / cos; // top of the purlins

  // ---------------------------------------------------------------- walls & openings
  const mkWall = (key, O, U, n, L, step) => ({ key, O, U, n, L, step, cols: [], bays: [], openings: [] });
  const walls = {
    back: mkWall('back', V(W, y0, 0), V(-1, 0, 0), V(0, 0, -1), W, STEP.WALL_LONG),
    front: mkWall('front', V(0, y0, D), V(1, 0, 0), V(0, 0, 1), W, STEP.WALL_LONG),
    left: mkWall('left', V(0, y0, 0), V(0, 0, 1), V(-1, 0, 0), D, STEP.WALL_ENDS),
    right: mkWall('right', V(W, y0, D), V(0, 0, -1), V(1, 0, 0), D, STEP.WALL_ENDS),
  };
  walls.left.sideTop = (u) => rafterTop(u) - y0;
  walls.right.sideTop = (u) => rafterTop(D - u) - y0;
  const toW = (w, u, v, d) => w.O.clone().addScaledVector(w.U, u).addScaledVector(UP, v).addScaledVector(w.n, -d);
  const wallBox = (w, u0, u1, v0, v1, d0, d1) => {
    const a = toW(w, u0, v0, d0);
    const c = toW(w, u1, v1, d1);
    return [Math.min(a.x, c.x), Math.max(a.x, c.x), Math.min(a.y, c.y), Math.max(a.y, c.y), Math.min(a.z, c.z), Math.max(a.z, c.z)];
  };
  const wallEx = (w, out, layer) => [w.n.x * out * EX, layer * EX, w.n.z * out * EX];

  const winRO = { w: P.windowW * 12 + 1, h: P.windowH * 12 + 1 };
  const doorRO = { w: P.doorW + 2, h: Math.min(P.doorH + 1.5, Rb - 1.5) };
  const leafH = doorRO.h - 1.5;
  if (leafH < P.doorH - 0.01) warnings.push(`The ring beam is low: doors can only be ${inch(leafH)} tall.`);
  let sill = Math.max(P.sill, PH + 3);
  if (sill + winRO.h + 1.5 > Rb - 1.5) sill = Rb - 3 - winRO.h;
  if (sill < PH + 3) warnings.push(`A ${P.windowH}' louvre doesn't fit between the pony wall and the ring beam.`);
  const S = P.winSpacing * 12;
  const doorMap = parseDoorBays(P.doorBays, m + 1);
  for (const w of Object.values(walls)) {
    w.cols.push([0, C]);
    for (let i = 1; i <= m; i++) {
      const c = C / 2 + (i * (w.L - C)) / (m + 1);
      w.cols.push([c - C / 2, c + C / 2]);
    }
    w.cols.push([w.L - C, w.L]);
    for (let i = 0; i + 1 < w.cols.length; i++) w.bays.push([w.cols[i][1], w.cols[i + 1][0]]);
    const zones = [];
    w.doorFits = w.bays.map(([a, c]) => c - a >= doorRO.w + 3);
    for (let idx = 0; idx < w.bays.length; idx++) {
      if (!doorMap[w.key][idx]) continue;
      const [a, c] = w.bays[idx];
      if (!w.doorFits[idx]) {
        warnings.push(`A door doesn't fit in bay ${idx + 1} of the ${w.key} wall (${ftin(c - a)} clear).`);
        continue;
      }
      const t = (a + c) / 2;
      w.openings.push({ type: 'door', u0: t - doorRO.w / 2, u1: t + doorRO.w / 2, v0: 0, v1: doorRO.h });
      zones.push([t - doorRO.w / 2 - 1.5, t + doorRO.w / 2 + 1.5, 'door']);
    }
    const slots = Math.max(1, Math.ceil(w.L / S));
    const half = winRO.w / 2 + 1.5;
    for (let k = 0; k < slots; k++) {
      const t = (w.L * (k + 0.5)) / slots;
      if (zones.some(([a, c, ty]) => ty === 'door' && overlaps(t - half, t + half, a - 6, c + 6))) continue;
      let best = null;
      for (const [a0, c0] of w.bays) {
        for (const [a, c] of subtract(a0, c0, zones.map(([za, zc]) => [za - 6, zc + 6]))) {
          if (c - a < 2 * half) continue;
          const cc = Math.min(c - half, Math.max(a + half, t));
          if (best === null || Math.abs(cc - t) < Math.abs(best - t)) best = cc;
        }
      }
      if (best === null || Math.abs(best - t) > S / 2) continue;
      w.openings.push({ type: 'window', u0: best - winRO.w / 2, u1: best + winRO.w / 2, v0: sill, v1: sill + winRO.h });
      zones.push([best - half, best + half, 'window']);
    }
  }

  // ---------------------------------------------------------------- existing concrete
  const ex0 = [0, 0, 0];
  const conc = { mat: 'concrete', group: 'existing', step: STEP.SITE, ex: ex0 };
  const footBot = -12;
  // perimeter outline (continuous below the floor) and pony walls (gapped at doors)
  for (const w of Object.values(walls)) {
    const long = w.key === 'front' || w.key === 'back';
    const ua = long ? 0 : Pt;
    const ub = long ? w.L : w.L - Pt;
    let [x0, x1, yy0, yy1, z0, z1] = wallBox(w, ua, ub, footBot - y0, 0, 0, Pt);
    b.box(x0, x1, yy0, yy1, z0, z1, { ...conc, name: `Existing concrete outline, ${inch(Pt)} thick` });
    const gaps = w.openings.filter((o) => o.type === 'door').map((o) => [o.u0, o.u1]);
    for (const [s, e] of subtract(ua, ub, gaps)) {
      [x0, x1, yy0, yy1, z0, z1] = wallBox(w, s, e, 0, PH, 0, Pt);
      b.box(x0, x1, yy0, yy1, z0, z1, { ...conc, name: `Existing pony wall, ${ftin(PH)} high` });
    }
  }
  // columns and ring beam
  const colWorld = [];
  for (const w of Object.values(walls)) {
    w.cols.forEach(([a, c], i) => {
      if (i === 0 && (w.key === 'left' || w.key === 'right')) return; // corners belong to the long walls
      if (i === w.cols.length - 1 && (w.key === 'left' || w.key === 'right')) return;
      const [x0, x1, , , z0, z1] = wallBox(w, a, c, 0, 1, 0, C);
      colWorld.push([x0, x1, z0, z1]);
      b.box(x0, x1, y0 + PH, y0 + Rb, z0, z1, { ...conc, name: `Existing concrete column ${inch(C)} × ${inch(C)}` });
    });
  }
  for (const w of Object.values(walls)) {
    const long = w.key === 'front' || w.key === 'back';
    const [x0, x1, yy0, yy1, z0, z1] = wallBox(w, long ? 0 : C, long ? w.L : w.L - C, Rb, ringTop, 0, C);
    b.box(x0, x1, yy0, yy1, z0, z1, { ...conc, name: `Existing ring beam, ${inch(P.ringH)} high` });
  }

  // ---------------------------------------------------------------- floor slab
  const slab = P.floorSlab === 'yes';
  const T = P.floorSlabT;
  const rebar = [];
  let concreteFt3 = 0;
  if (slab) {
    const ro = { mat: 'rebar', group: 'floor', step: STEP.FLOOR_PREP, stepTo: STEP.FLOOR_PREP, name: '1/2" rebar', ex: ex0 };
    const barPieces = (L) => {
      const n = Math.max(1, Math.ceil((L - 12) / (240 - 12)));
      for (let i = 0; i < n; i++) rebar.push((L + 12 * (n - 1)) / n);
    };
    const ry = y0 - T / 2;
    const sp = P.rebarSpacing;
    for (let z = Pt + 3; z <= D - Pt - 3 + 0.01; z += sp) {
      b.box(Pt + 3, W - Pt - 3, ry - 0.5, ry, z - 0.25, z + 0.25, ro);
      barPieces(W - 2 * Pt - 6);
    }
    for (let x = Pt + 3; x <= W - Pt - 3 + 0.01; x += sp) {
      b.box(x - 0.25, x + 0.25, ry, ry + 0.5, Pt + 3, D - Pt - 3, ro);
      barPieces(D - 2 * Pt - 6);
    }
    b.box(Pt, W - Pt, y0 - T - 0.1, y0 - T, Pt, D - Pt, { mat: 'plastic', name: '6-mil plastic under the floor', group: 'floor', step: STEP.FLOOR_PREP, stepTo: STEP.FLOOR_PREP, ex: ex0 });
    b.box(Pt, W - Pt, y0 - T, y0, Pt, D - Pt, { mat: 'concrete', name: `New floor slab, ${inch(T)} thick`, group: 'floor', step: STEP.FLOOR, ex: [0, -0.8 * EX, 0] });
    concreteFt3 = ((W - 2 * Pt) * (D - 2 * Pt) * T) / 1728;
  }
  const cementNet = concreteFt3 / BAG_YIELD_FT3;
  const plasticFt2 = slab ? ((W - 2 * Pt + 12) * (D - 2 * Pt + 12)) / 144 : 0;

  // ---------------------------------------------------------------- wall plates on the ring beam
  let wedge = 0;
  let screws = 0;
  for (const w of Object.values(walls)) {
    const long = w.key === 'front' || w.key === 'back';
    for (const [s, e] of splitRange(long ? 0 : pw, long ? w.L : w.L - pw, [], 192)) {
      const [x0, x1, yy0, yy1, z0, z1] = wallBox(w, s, e, ringTop, ringTop + 1.5, 0, pw);
      b.lumberBox('2x6', x0, x1, yy0, yy1, z0, z1, { cat: 'framing', name: 'Wall plate on ring beam (2x6)', group: 'plates', step: STEP.PLATES, ex: [0, 2.5 * EX, 0] });
      wedge += Math.ceil((e - s) / 32) + 1;
    }
  }

  // ---------------------------------------------------------------- infill framing
  const blockLevels = [];
  const bayH = Rb - PH;
  const nLev = Math.max(1, Math.round(bayH / 30) - 1);
  for (let j = 1; j <= nLev; j++) blockLevels.push(PH + (bayH * j) / (nLev + 1));
  for (const w of Object.values(walls)) {
    const fo = { cat: 'framing', group: 'wall', step: w.step, ex: wallEx(w, 0.6, 1.5) };
    const add = (name, size, u0, u1, v0, v1, d0, d1, extra = {}) => {
      const [x0, x1, yy0, yy1, z0, z1] = wallBox(w, u0, u1, v0, v1, d0, d1);
      return b.lumberBox(size, x0, x1, yy0, yy1, z0, z1, { ...fo, name, ...extra });
    };
    for (const [a, c] of w.bays) {
      const ops = w.openings.filter((o) => o.u0 >= a - 0.01 && o.u1 <= c + 0.01);
      const doors = ops.filter((o) => o.type === 'door');
      for (const [s, e] of subtract(a, c, doors.map((o) => [o.u0, o.u1]))) {
        add('Bottom plate on pony wall', '2x4', s, e, PH, PH + 1.5, 0, 3.5);
        screws += Math.ceil((e - s) / 24) + 1;
      }
      add('Top plate under ring beam', '2x4', a, c, Rb - 1.5, Rb, 0, 3.5);
      screws += Math.ceil((c - a) / 24) + 1;
      const vtop = Rb - 1.5;
      const vbot = PH + 1.5;
      const vertical = [];
      const zonesB = ops.map((o) => [o.u0 - 1.5, o.u1 + 1.5]);
      for (const [u0, u1] of [[a, a + 1.5], [c - 1.5, c]]) {
        if (zonesB.some(([za, zc]) => overlaps(u0, u1, za, zc))) continue;
        add('Stud (fixed to column)', '2x4', u0, u1, vbot, vtop, 0, 3.5);
        vertical.push([u0, u1]);
        screws += Math.ceil(bayH / 24);
      }
      for (let g = 0; g <= w.L; g += P.studSpacing) {
        const u0 = g - 0.75;
        const u1 = g + 0.75;
        if (u0 < a + 4 || u1 > c - 4) continue;
        if (zonesB.some(([za, zc]) => overlaps(u0 - 1, u1 + 1, za, zc))) continue;
        add('Stud', '2x4', u0, u1, vbot, vtop, 0, 3.5);
        vertical.push([u0, u1]);
      }
      for (const o of ops) {
        const { u0, u1, v0, v1 } = o;
        const kingBot = o.type === 'door' ? PH + 1.5 : vbot;
        add('King stud', '2x4', u0 - 1.5, u0, kingBot, vtop, 0, 3.5);
        add('King stud', '2x4', u1, u1 + 1.5, kingBot, vtop, 0, 3.5);
        if (u0 - 1.5 <= a + 0.01) screws += Math.ceil(bayH / 24);
        if (u1 + 1.5 >= c - 0.01) screws += Math.ceil(bayH / 24);
        vertical.push([u0 - 1.5, u0], [u1, u1 + 1.5]);
        const grid = [];
        for (let g = 0; g <= w.L; g += P.studSpacing) if (g > u0 + 2 && g < u1 - 2) grid.push(g);
        if (!grid.length) grid.push((u0 + u1) / 2);
        if (v1 + 1.5 <= vtop - 0.01) {
          add('Head (flat 2x4)', '2x4', u0, u1, v1, v1 + 1.5, 0, 3.5);
          if (vtop - (v1 + 1.5) > 2) for (const g of grid) add('Cripple stud', '2x4', g - 0.75, g + 0.75, v1 + 1.5, vtop, 0, 3.5);
        }
        if (o.type === 'window') {
          add('Rough sill', '2x4', u0, u1, v0 - 1.5, v0, 0, 3.5);
          if (v0 - 1.5 - vbot > 2) for (const g of grid) add('Cripple stud', '2x4', g - 0.75, g + 0.75, vbot, v0 - 1.5, 0, 3.5);
        }
      }
      vertical.sort((x, y) => x[0] - y[0]);
      for (const lv of blockLevels) {
        for (let i = 0; i + 1 < vertical.length; i++) {
          const s = vertical[i][1];
          const e = vertical[i + 1][0];
          if (e - s < 3) continue;
          const gc = (s + e) / 2;
          if (ops.some((o) => gc > o.u0 - 1.5 && gc < o.u1 + 1.5 && lv > o.v0 - 3 && lv < o.v1 + 3)) continue;
          add('Blocking / girt', '2x4', s, e, lv - 0.75, lv + 0.75, 0, 3.5);
        }
      }
    }
    // gable-end studs above the ring beam
    if (w.key === 'left' || w.key === 'right') {
      for (let g = P.studSpacing; g < w.L; g += P.studSpacing) {
        const z = w.key === 'left' ? g : D - g;
        const hgt = underside(z) - yTop;
        if (hgt < 3) continue;
        const [x0, x1, yy0, yy1, z0, z1] = wallBox(w, g - 0.75, g + 0.75, ringTop + 1.5, ringTop + 1.5 + hgt, 0, 3.5);
        b.lumberBox('2x4', x0, x1, yy0, yy1, z0, z1, { cat: 'framing', name: 'Gable stud', group: 'roof', step: STEP.ROOF_FRAME, ex: wallEx(w, 0.6, 3.5) });
      }
    }
  }

  // ---------------------------------------------------------------- roof framing
  const rafterXs = [0.75];
  for (let c = 0.75 + P.rafterSpacing; c < W - 0.75 - 6; c += P.rafterSpacing) rafterXs.push(c);
  rafterXs.push(W - 0.75);
  const roofEx = [0, 3.5 * EX, 0];
  const rafterOpt = { cat: 'framing', group: 'roof', step: STEP.ROOF_FRAME, ex: roofEx, name: `Rafter (${rafterSize})` };
  const nBack = V(0, cos, -sin);
  const nFront = V(0, cos, sin);
  const zr = D / 2 - 0.75;
  const rafterLen = (zr + E) / cos;
  const profile = [[-E, underside(-E)], [0, underside(0)], [0, yTop], [pw, yTop], [zr, underside(zr)], [zr, rafterTop(zr)], [-E, rafterTop(-E)]];
  for (const x of rafterXs) {
    b.prism(profile, x - 0.75, x + 0.75, rafterSize, rafterLen, rafterOpt);
    b.prism(profile.map(([z, y]) => [D - z, y]).reverse(), x - 0.75, x + 0.75, rafterSize, rafterLen, rafterOpt);
  }
  const ridgeTop = rafterTop(zr);
  for (const [s, e] of splitRange(0, W, rafterXs, 192)) {
    b.lumberBox('2x6', s, e, ridgeTop - 5.5, ridgeTop, D / 2 - 0.75, D / 2 + 0.75, { ...rafterOpt, name: 'Ridge board' });
  }
  rafterXs.forEach((x, i) => {
    if (i === 0 || i === rafterXs.length - 1 || i % 2 === 0) return;
    for (const [s, e] of splitRange(0, D, [D / 2 + 12], 192)) {
      b.lumberBox('2x4', x + 0.75, x + 2.25, yTop, yTop + 3.5, s, e, { ...rafterOpt, name: 'Ceiling tie' });
    }
  });
  const ties = rafterXs.length * 2;

  const slopes = [
    { key: 'back', zt: -E, dir: 1, top: (D / 2 + E) / cos, nrm: nBack },
    { key: 'front', zt: D + E, dir: -1, top: (D / 2 + E) / cos, nrm: nFront },
  ];
  let purlinRows = 0;
  for (const sl of slopes) {
    const s0 = 1.75;
    const s1 = sl.top - 2.5;
    const n = Math.ceil((s1 - s0) / P.purlinSpacing) + 1;
    sl.purlins = n;
    purlinRows += n;
    const upDir = V(0, sin, sl.dir * cos);
    for (let j = 0; j < n; j++) {
      const s = s0 + ((s1 - s0) * j) / (n - 1);
      const z = sl.zt + sl.dir * s * cos;
      const y = rafterTop(z);
      for (const [xa, xb] of splitRange(-R, W + R, rafterXs, 192)) {
        const a = V(xa, y, z).addScaledVector(sl.nrm, 0.75);
        const c = V(xb, y, z).addScaledVector(sl.nrm, 0.75);
        b.member(a, c, '2x4', upDir, { cat: 'framing', group: 'purlins', step: STEP.PURLINS, ex: [0, 5 * EX, 0], name: 'Purlin (2x4 flat)' });
      }
    }
    const yf = rafterTop(sl.zt);
    for (const [xa, xb] of splitRange(-R, W + R, rafterXs, 192)) {
      const za = sl.dir > 0 ? sl.zt - 0.75 : sl.zt;
      b.lumberBox('1x6', xa, xb, yf - 5.5, yf, za, za + 0.75, { cat: 'framing', group: 'roof', step: STEP.ROOF_FRAME, ex: [0, 3.5 * EX, -sl.dir * 0.4 * EX], name: 'Fascia' });
    }
  }

  // ---------------------------------------------------------------- roofing
  const tinPieces = [];
  const clad = P.cladding;
  const tinMat = clad === 'pvc' ? 'pvc' : 'tin';
  const tinName = clad === 'pvc' ? 'PVC tinroof sheet' : 'Metal tinroof sheet';
  let roofFasteners = 0;
  const nCols = Math.ceil((W + 2 * R - (tinW - P.tinCover)) / P.tinCover);
  for (const sl of slopes) {
    const zs = sl.zt - sl.dir * 2;
    const zEnd = D / 2 - sl.dir * 1;
    const Ls = Math.abs(zEnd - zs) / cos;
    const yAxis = V(0, sin, sl.dir * cos);
    const zAxis = sl.nrm.clone();
    const xAxis = new THREE.Vector3().crossVectors(yAxis, zAxis);
    const run = sheetRun(Ls);
    for (let i = 0; i < nCols; i++) {
      const xi = -R + i * P.tinCover;
      const wi = Math.min(tinW, W + R - xi);
      if (wi < 4) continue;
      run.forEach((pc, j) => {
        const z = zs + sl.dir * pc.start * cos;
        const o = V(xAxis.x > 0 ? xi : xi + wi, roofTop(z), z).addScaledVector(zAxis, 0.3 + (i % 2) * 0.1 + j * 0.15);
        b.sheet(o, xAxis, yAxis, zAxis, { w: wi, h: pc.len, corr: CORR }, {
          mat: tinMat, name: tinName, info: `cut length ${ftin(pc.len)}`, group: 'roofing', step: STEP.ROOFING,
          ex: [zAxis.x * EX, 7 * EX + zAxis.y * EX, zAxis.z * EX],
        });
        tinPieces.push({ stock: pc.stock, len: pc.len, use: 'roof' });
        roofFasteners += Math.ceil(sl.purlins * (pc.len / Ls)) * 6;
      });
    }
  }
  const ridgeY = roofTop(D / 2);
  for (const sl of slopes) {
    const yAxis = V(0, sin, sl.dir * cos);
    const zAxis = sl.nrm.clone();
    const xAxis = new THREE.Vector3().crossVectors(yAxis, zAxis);
    const o = V(xAxis.x > 0 ? -R : W + R, ridgeY, D / 2).addScaledVector(yAxis, -7).addScaledVector(zAxis, 1.3);
    b.sheet(o, xAxis, yAxis, zAxis, { w: W + 2 * R, h: 7, corr: null }, { mat: tinMat, name: 'Ridge cap', group: 'roofing', step: STEP.ROOFING, ex: [0, 8.5 * EX, 0] });
  }
  const ridgePieces = Math.ceil((W + 2 * R) / (120 - 6));
  roofFasteners += ridgePieces * 12;

  // ---------------------------------------------------------------- siding
  let sidingFasteners = 0;
  const hang = (w, ua, ub, vbase, topFn, holes0, label) => {
    const L = ub - ua;
    const nc = Math.max(1, Math.ceil((L - (tinW - P.tinCover)) / P.tinCover));
    for (let i = 0; i < nc; i++) {
      const ui = ua + i * P.tinCover;
      const wi = Math.min(tinW, ub - ui);
      if (wi < 3) continue;
      let top = -Infinity;
      for (let t = 0; t <= 8; t++) top = Math.max(top, topFn(ui + (wi * t) / 8));
      const Lc = top - vbase;
      if (Lc < 2) continue;
      sheetRun(Lc).forEach((pc, j) => {
        const base = vbase + pc.start;
        const holes = holes0.map((o) => ({ x0: o.u0 - ui, x1: o.u1 - ui, y0: o.v0 - base, y1: o.v1 - base }));
        const profile = (x) => topFn(ui + x) - base;
        const o = toW(w, ui, base, -(0.15 + (i % 2) * 0.08 + j * 0.12));
        b.sheet(o, w.U, UP, w.n, { w: wi, h: pc.len, corr: CORR, holes, profile }, {
          mat: tinMat, name: `${tinName} (${label})`, info: `cut length ${ftin(pc.len)}`, group: 'siding', step: STEP.SIDING, ex: wallEx(w, 2.2, 1.5),
        });
        tinPieces.push({ stock: pc.stock, len: pc.len, use: 'siding' });
        sidingFasteners += (blockLevels.length + 2) * 5 * (pc.len / Lc);
      });
    }
  };
  for (const w of Object.values(walls)) {
    for (const [a, c] of w.bays) hang(w, a, c, PH - 1.5, () => Rb, w.openings.filter((o) => o.u0 >= a - 0.01 && o.u1 <= c + 0.01), 'wall panel');
    if (w.sideTop) hang(w, 0, w.L, ringTop - 1, w.sideTop, [], 'gable');
  }

  // ---------------------------------------------------------------- windows & doors
  const winList = [];
  let nDoors = 0;
  const t0 = 0.85;
  const trimD = [-(t0 + 0.75), -t0];
  for (const w of Object.values(walls)) {
    for (const o of w.openings) {
      const { u0, u1, v0, v1 } = o;
      const isDoor = o.type === 'door';
      const step = isDoor ? STEP.DOOR : STEP.WINDOWS;
      const exOut = wallEx(w, 3.2, 1.5);
      const trimO = { cat: 'framing', group: 'trim', step, ex: wallEx(w, 2.8, 1.5), name: isDoor ? 'Door casing (1x4)' : 'Window casing (1x4)' };
      const addT = (a, c, va, vc) => {
        if (vc - va < 1) return;
        const [x0, x1, yy0, yy1, z0, z1] = wallBox(w, a, c, va, vc, trimD[0], trimD[1]);
        b.lumberBox('1x4', x0, x1, yy0, yy1, z0, z1, trimO);
      };
      if (!isDoor) {
        addT(u0 - 3.5, u1 + 3.5, v1, Math.min(v1 + 3.5, Rb));
        addT(u0 - 3.5, u0, v0, v1);
        addT(u1, u1 + 3.5, v0, v1);
        addT(u0 - 3.5, u1 + 3.5, v0 - 3.5, v0);
        const fh = P.windowH * 12;
        const al = { mat: 'alu', group: 'windows', step, ex: exOut, name: `Louvre frame ${P.windowH}'` };
        for (const [a, c] of [[u0 + 0.25, u0 + 1.25], [u1 - 1.25, u1 - 0.25]]) {
          const [x0, x1, yy0, yy1, z0, z1] = wallBox(w, a, c, v0 + 0.5, v0 + 0.5 + fh, 0.4, 3.1);
          b.box(x0, x1, yy0, yy1, z0, z1, al);
        }
        const nBl = Math.round(fh / 3.6);
        const tilt = (25 * Math.PI) / 180;
        const dDir = UP.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(w.n, Math.sin(tilt));
        for (let k = 0; k < nBl; k++) {
          const vc = v0 + 0.5 + ((k + 0.5) * fh) / nBl;
          b.member(toW(w, u0 + 1.25, vc, 1.75), toW(w, u1 - 1.25, vc, 1.75), { t: 0.2, d: 4 }, dDir, {
            mat: 'glass', group: 'windows', step, ex: exOut, name: `Louvre glass blade ${P.windowW}'`,
          });
        }
        winList.push({ frame: P.windowH, blades: nBl, bladeLen: P.windowW, wall: w.key });
      } else {
        nDoors++;
        addT(u0 - 3.5, u0, PH - 1.5, v1);
        addT(u1, u1 + 3.5, PH - 1.5, v1);
        const jo = { cat: 'framing', group: 'door', step, ex: exOut, name: 'Door jamb (1x6)' };
        const addJ = (a, c, va, vc) => {
          const [x0, x1, yy0, yy1, z0, z1] = wallBox(w, a, c, va, vc, -0.75, Pt - 0.5);
          b.lumberBox('1x6', x0, x1, yy0, yy1, z0, z1, jo);
        };
        addJ(u0, u0 + 0.75, 0, v1);
        addJ(u1 - 0.75, u1, 0, v1);
        addJ(u0 + 0.75, u1 - 0.75, v1 - 0.75, v1);
        const lu0 = u0 + 1;
        const lu1 = u1 - 1;
        const lv0 = 0.5;
        const lv1 = lv0 + leafH;
        const lo = { cat: 'framing', group: 'door', step, ex: exOut, name: 'Door board (1x6)' };
        for (let u = lu0; u < lu1 - 0.5; u += 5.5) {
          const [x0, x1, yy0, yy1, z0, z1] = wallBox(w, u + 0.03, Math.min(u + 5.5, lu1) - 0.03, lv0, lv1, 0.25, 1.0);
          b.lumberBox('1x6', x0, x1, yy0, yy1, z0, z1, lo);
        }
        const bo = { ...lo, name: 'Door batten (1x4)' };
        for (const vv of [lv0 + 6, lv1 - 9.5]) {
          const [x0, x1, yy0, yy1, z0, z1] = wallBox(w, lu0 + 1, lu1 - 1, vv, vv + 3.5, 1.0, 1.75);
          b.lumberBox('1x4', x0, x1, yy0, yy1, z0, z1, bo);
        }
        b.member(toW(w, lu1 - 3, lv0 + 9.5 + 1.75, 1.375), toW(w, lu0 + 3, lv1 - 9.5 - 1.75, 1.375), '1x4', w.n, { ...bo, flat: true, name: 'Door brace (1x4)' });
        for (const vv of [lv0 + 8, (lv0 + lv1) / 2, lv1 - 8]) {
          const [x0, x1, yy0, yy1, z0, z1] = wallBox(w, lu0 - 1.5, lu0 + 6, vv - 0.6, vv + 0.6, 0.05, 0.25);
          b.box(x0, x1, yy0, yy1, z0, z1, { mat: 'steel', group: 'door', step, ex: exOut, name: 'Galvanised T-hinge' });
        }
        const [x0, x1, yy0, yy1, z0, z1] = wallBox(w, lu1 - 4, lu1 + 1.2, 40, 41.5, 0.0, 0.25);
        b.box(x0, x1, yy0, yy1, z0, z1, { mat: 'steel', group: 'door', step, ex: exOut, name: 'Hasp' });
      }
    }
  }

  // ---------------------------------------------------------------- interior plywood
  const wallPlyPieces = [];
  for (const w of Object.values(walls)) {
    for (const [a, c] of w.bays) {
      const holes0 = w.openings.filter((o) => o.u0 >= a - 0.01 && o.u1 <= c + 0.01);
      for (let u = a; u < c - 0.5; u += 48) {
        const cw = Math.min(48, c - u);
        for (let v = PH; v < Rb - 0.5; v += 96) {
          const rh = Math.min(96, Rb - v);
          const holes = holes0.map((o) => ({ x0: o.u0 - u, x1: o.u1 - u, y0: o.v0 - v, y1: o.v1 - v }));
          const o = toW(w, u, v, 3.62);
          b.sheet(o, w.U, UP, w.n, { w: cw - 0.06, h: rh, corr: null, holes }, {
            mat: 'plyWall', name: PLY[P.wallPly].name + ' wall sheet', info: `${ftin(cw)} × ${ftin(rh)}`, group: 'interior', step: STEP.INTERIOR, ex: wallEx(w, -0.6, 1.5),
          });
          wallPlyPieces.push({ w: cw, h: rh });
        }
      }
    }
  }

  // ---------------------------------------------------------------- quantities
  let n16 = 0;
  for (const l of b.lumber) {
    if (['1x4', '1x6', '1x8', '1x2', '1x3'].includes(l.size)) continue;
    n16 += 4 + Math.floor(l.len / 24);
  }
  n16 += purlinRows * rafterXs.length * 2;
  let n8 = 0;
  for (const l of b.lumber) if (['1x4', '1x6', '1x8', '1x2', '1x3'].includes(l.size)) n8 += 4 + Math.floor(l.len / 12) * 2;
  const nPanel = wallPlyPieces.length * 50;
  const roofFast = Math.ceil(roofFasteners + sidingFasteners);

  // ---------------------------------------------------------------- steps
  const diag = Math.hypot(W, D);
  const floorArea = ((W - 2 * Pt) * (D - 2 * Pt)) / 144;
  const roofPlanFt2 = ((W + 2 * R) * (D + 2 * E)) / 144;
  const nWin = winList.length;
  const rainGal = roofPlanFt2 * 0.623;
  const nColumns = colWorld.length;
  const bayList = walls.front.bays.map(([a, c]) => ftin(c - a)).join(', ');
  const endBays = walls.left.bays.map(([a, c]) => ftin(c - a)).join(', ');
  const doorDesc = Object.values(walls).map((w) => [w.key, w.openings.filter((o) => o.type === 'door').length]).filter(([, n]) => n).map(([k, n]) => `${n} in the ${k} wall`).join(', ');
  const count = (k, t) => walls[k].openings.filter((o) => o.type === t).length;
  const steps = [
    { title: 'Existing concrete frame', text: `Already built: a ${ftin(W)} × ${ftin(D)} concrete outline, ${inch(Pt)} thick. On it are pony walls ${ftin(PH)} high and ${nColumns} columns (${inch(C)} × ${inch(C)}: the corners plus ${m} along each wall), with a ${inch(P.ringH)} ring beam whose underside is ${ftin(Rb)} above the floor. Before ordering, check: both diagonals ${ftin(diag)}; the clear bays between columns (long walls ${bayList}; end walls ${endBays}); and the ring-beam height. Adjust the inputs to match what was actually poured.` },
    slab ? { title: 'Prepare the floor', text: `Fill inside the outline with compacted sand or coral to ${ftin(T)} below the finished floor. Lay 6-mil plastic, then a ${inch(P.rebarSpacing)} grid of 1/2" rebar on chairs.` } : { title: 'Floor (not included)', text: 'No floor slab is included in this design. Turn it on under "Floor slab" to add it to the plan and the bill of materials.' },
    slab ? { title: 'Pour the floor slab', text: `Pour a ${inch(T)} floor slab inside the outline — ${num(concreteFt3)} ft³, about ${Math.ceil(cementNet)} bags of cement. The pony walls act as the form. Leave the door thresholds flush and slope the floor slightly toward the doors. Keep it damp for a week.` } : { title: 'Floor (not included)', text: 'Skipped.' },
    { title: 'Wall plates', text: `Bolt a 2x6 wall plate flat on top of the ring beam with 1/2" wedge anchors about every 32" (${wedge} anchors) — the rafters sit on this. In every bay, fasten a 2x4 bottom plate to the pony wall and a 2x4 top plate to the underside of the ring beam, using concrete screws (drill with a hammer drill). Put a strip of plastic or bitumen under any wood that touches concrete.` },
    { title: 'Infill the long walls', text: `Frame each bay between the columns. Studs at ${inch(P.studSpacing)} on centre are screwed to the columns at each end, with ${blockLevels.length} row${blockLevels.length > 1 ? 's' : ''} of flat blocking for the siding. Front wall: ${count('front', 'door')} doors, ${count('front', 'window')} windows. Back wall: ${count('back', 'door')} door${count('back', 'door') === 1 ? '' : 's'}, ${count('back', 'window')} windows. The ring beam carries the roof, so openings need only a flat 2x4 head, not a header.` },
    { title: 'Infill the end walls', text: `Frame the end-wall bays the same way: ${count('left', 'door')} door and ${count('left', 'window')} windows in each. The louvre rough opening is ${ftin(winRO.w)} × ${ftin(winRO.h)}, with the sill at ${ftin(sill)}. Windows are never more than ${ftin(S)} apart.` },
    { title: 'Roof framing', text: `Gable roof at ${P.pitch}:12. Set the 2x6 ridge on temporary props, then fit ${rafterXs.length} pairs of ${rafterSize} rafters at ${inch(P.rafterSpacing)} on centre. Each rafter is birdsmouthed onto the wall plate, plumb-cut at the tail for the fascia, and tied down with a hurricane tie. Add 2x4 ceiling ties on alternate pairs, and frame the gable ends above the ring beam with studs.` },
    { title: 'Purlins', text: `Nail 2x4 purlins flat across the rafters, ${slopes.map((s) => s.purlins).join(' + ')} rows at no more than ${inch(P.purlinSpacing)} apart, overhanging the gable ends by ${inch(R)}.` },
    { title: 'Roofing', text: `Lay ${tinPieces.filter((t) => t.use === 'roof').length} pieces of ${clad === 'pvc' ? 'PVC' : 'galvanised metal'} sheet, starting at the end away from the prevailing wind. Lap one corrugation at the sides and ${inch(LAP)} at any end joints, and fasten through the crests. Finish with the ridge cap. Each inch of rain on the ${num(roofPlanFt2)} sq ft roof yields about ${num(rainGal)} gallons.` },
    { title: 'Siding', text: `Clad each bay with vertical ${clad === 'pvc' ? 'PVC' : 'metal'} sheets from just below the pony-wall top up to the ring beam, lapping 1-1/2" over the concrete so water runs off. Clad the gable triangles above the ring beam too (${tinPieces.filter((t) => t.use === 'siding').length} pieces in total). Seal the joints where tin meets concrete.` },
    { title: 'Louvre windows', text: `Fit ${nWin} ${P.windowH}' aluminium louvre frames and ${winList.reduce((s, x) => s + x.blades, 0)} ${P.windowW}' glass blades, then trim with 1x4 casing.` },
    { title: 'Doors', text: `Hang ${nDoors} doors (${doorDesc}), each ${inch(P.doorW)} × ${ftin(leafH)}. Each sits in a gap in the pony wall. The 1x6 jambs are screwed to the concrete below and to the king studs above. Doors are vertical 1x6 boards with a 1x4 Z-brace, on three galvanised T-hinges, with a hasp.` },
    { title: 'Interior walls', text: `Line the inside of the infill panels with ${wallPlyPieces.length} pieces of ${PLY[P.wallPly].name}. The concrete columns, pony walls and ring beam stay exposed (paint them if you like). The roof space stays open for ventilation.` },
    { title: 'Complete', text: `Finished: a ${ftin(W)} × ${ftin(D)} house on the existing concrete frame, with a gable ${clad === 'pvc' ? 'PVC' : 'metal'} roof, ${nWin} louvre windows and ${nDoors} doors. Recommended extras: insect screen behind the louvres, gutters and a water tank.` },
  ];

  const dims = [
    { a: [0, y0 + 0.3, D + 18], b: [W, y0 + 0.3, D + 18], label: ftin(W) },
    { a: [W + 18, y0 + 0.3, 0], b: [W + 18, y0 + 0.3, D], label: ftin(D) },
  ];

  return {
    P, W, D, parts: b.parts, steps, dims, warnings,
    bounds: { min: [-R - 40, footBot, -E - 40], max: [W + R + 40, roofTop(D / 2) + 12, D + E + 40] },
    q: {
      lumber: b.lumber, wallPly: { type: P.wallPly, pieces: wallPlyPieces }, tin: tinPieces, ridgePieces, windows: winList,
      concreteFt3, cementNet, rebar, plasticFt2, wedge, screws, ties, n16, n8, nPanel, roofFast, doors: nDoors,
    },
    doorGrid: Object.fromEntries(Object.values(walls).map((w) => [w.key, w.bays.map(([a, c], i) => ({ width: c - a, fits: w.doorFits[i], door: w.openings.some((o) => o.type === 'door' && o.u0 >= a && o.u1 <= c) }))])),
    info: {
      columns: nColumns, midPosts: m, rafterSize, diag, floorArea, roofPlanFt2, rainGal, sill, nWin, nDoors, concreteFt3,
      ridgeHeight: roofTop(D / 2), leafH, bayList, endBays,
    },
  };
}
