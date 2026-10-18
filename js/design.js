// Parametric design engine. Turns a handful of parameters into a list of
// physical parts (with positions, materials, construction step and explode
// offsets) plus the raw quantities needed for the bill of materials.
//
// Coordinate system (inches): X = width (left→right as seen from the front),
// Y = up (ground = 0), Z = depth (back wall at z=0, front/door wall at z=D).

import * as THREE from 'three';
import { LUMBER, PLY, BAG_YIELD_FT3, MESH, QUOTE, TANKS, PIPE_OD, BLOCK, SCREEN_ROLLS } from './catalog.js';
import { ftin, inch, num } from './format.js';

export const DEFAULTS = {
  width: 36, // ft, outside of the concrete outline
  depth: 17, // ft
  cladding: 'metal', // 'metal' | 'pvc'
  // existing concrete frame
  floorAbove: 7, // finished floor above grade, in
  ponyT: 6, // perimeter outline / pony wall thickness, in
  ponyH: 24, // pony wall height above the floor, in
  colSize: 9, // square concrete columns, in
  midPosts: 2, // columns between the corners on each wall
  ringBottom: 94, // underside of the ring beam above the floor, in
  ringH: 9, // ring beam height, in
  // new floor slab inside the outline
  floorSlab: 'yes',
  floorSlabT: 4,
  // roof
  pitch: 4,
  eave: 24,
  rake: 18,
  studSpacing: 24,
  rafterSpacing: 24,
  purlinSpacing: 32,
  wallPly: 'ply14',
  // door per bay between columns, per wall (bays left→right seen from outside):
  // front-back-left-right, '1' = door
  doorBays: '011-100-010-100',
  // door gaps to close up with framing, tin and plywood instead of a door
  coverBays: '000-100-010-000',
  doorW: 36,
  doorH: 80,
  winSpacing: 11.5, // ft
  windowW: 3,
  windowH: 4,
  sill: 22,
  tinCover: 30,
  // insect screens: hinged frames inside the louvres, screened eaves
  screens: 'yes',
  // gutters on both eaves into a tank at one gable end
  rainwater: 'yes',
  tankGal: 1000,
  tankEnd: 'right',
  ovTin: 10,
  ovPly: 10,
  ovFraming: 10,
  ovFasteners: 15,
  ovCement: 15,
  freight: 0,
  tax: QUOTE.tax, // sales tax, %
};

export const STEP = {
  SITE: 0, FLOOR_PREP: 1, FLOOR: 2, PLATES: 3, WALL_LONG: 4, WALL_ENDS: 5, ROOF_FRAME: 6,
  PURLINS: 7, ROOFING: 8, SIDING: 9, WINDOWS: 10, DOOR: 11, INTERIOR: 12, SCREENS: 13, GUTTERS: 14, TANK: 15, DONE: 16,
};

export const EX = 24; // explode unit, inches
const TIN_STOCK = [120, 144];
export const LAP = 6; // end lap for corrugated sheets
export const CORR = { pitch: 3, depth: 0.75 };

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);

export class Builder {
  constructor() {
    this.parts = [];
    this.lumber = [];
    this.hw = new Map();
    this.hwCount = {};
  }
  // A nail, screw or anchor with its head at pos, facing out. Hardware is
  // grouped (shape, name, step, explode) into one instanced part per group.
  fasten(shape, pos, out, o) {
    const ex = o.ex || [0, 0, 0];
    const key = [shape, o.name, o.step, o.stepTo, ex.join(',')].join('|');
    let g = this.hw.get(key);
    if (!g) {
      g = { kind: 'inst', shape, items: [], mat: 'steel', name: o.name, step: o.step, stepTo: o.stepTo, group: o.group, ex };
      this.hw.set(key, g);
    }
    const q = new THREE.Quaternion().setFromUnitVectors(UP, out.clone().normalize());
    g.items.push(+pos.x.toFixed(3), +pos.y.toFixed(3), +pos.z.toFixed(3), q.x, q.y, q.z, q.w);
    this.hwCount[shape] = (this.hwCount[shape] || 0) + 1;
  }
  flushHardware() {
    for (const g of this.hw.values()) this.add(g);
    this.hw.clear();
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
export function splitRange(a, b, cands, max, fromRight = false) {
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
export function subtract(lo, hi, holes) {
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
export function sheetRun(L) {
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
  const screensOn = P.screens === 'yes';
  const rainOn = P.rainwater === 'yes';
  const yTop = y0 + ringTop + 1.5; // top of wall plate

  const rafterSpanH = D / 2 - pw;
  const rafterSize = rafterSpanH > 84 ? '2x6' : '2x4';
  const rd = LUMBER[rafterSize].w;
  const underside = (z) => yTop + (Math.min(z, D - z) - pw) * p;
  const rafterTop = (z) => underside(z) + rd / cos;
  const roofTop = (z) => rafterTop(z) + 1.5 / cos; // top of the purlins

  // ---------------------------------------------------------------- walls & openings
  const mkWall = (key, O, U, n, L, step) => ({ key, O, U, n, L, step, cols: [], bays: [], openings: [], covered: [], frame: [], plate: [], anchors: [], gable: [] });
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
  // direction in a wall's frame: a along the wall, b up, c inward
  const wDir = (w, a, bb, c) => w.U.clone().multiplyScalar(a).addScaledVector(UP, bb).addScaledVector(w.n, -c).normalize();
  const fastW = (w, shape, u, v, d, out, o) => b.fasten(shape, toW(w, u, v, d), out, o);
  // n evenly spaced positions along [lo,hi], kept in from the ends
  const spread = (lo, hi, n, m = 3) => {
    const k = Math.min(m, (hi - lo) / 4);
    return n <= 1 ? [(lo + hi) / 2] : Array.from({ length: n }, (_, i) => lo + k + ((hi - lo - 2 * k) * i) / (n - 1));
  };
  // three toenails at each end of a vertical member [u0,u1] × [vb,vt]
  const toeEnds = (w, u0, u1, vb, vt, o, ends = [true, true]) => {
    const uc = (u0 + u1) / 2;
    if (ends[0]) {
      fastW(w, 'nail16', u0, vb + 1.5, 1.2, wDir(w, -0.5, 0.866, 0), o);
      fastW(w, 'nail16', u1, vb + 1.5, 2.3, wDir(w, 0.5, 0.866, 0), o);
      fastW(w, 'nail16', uc, vb + 1.5, 3.5, wDir(w, 0, 0.866, 0.5), o);
    }
    if (ends[1]) {
      fastW(w, 'nail16', u0, vt - 1.5, 2.3, wDir(w, -0.5, -0.866, 0), o);
      fastW(w, 'nail16', u1, vt - 1.5, 1.2, wDir(w, 0.5, -0.866, 0), o);
      fastW(w, 'nail16', uc, vt - 1.5, 3.5, wDir(w, 0, -0.866, 0.5), o);
    }
  };
  // toenails through the top face of a flat horizontal member at each end
  const toeFlat = (w, s0, e0, vTopFace, o) => {
    for (const d of [1.2, 2.3]) {
      fastW(w, 'nail16', s0 + 1.25, vTopFace, d, wDir(w, 0.5, 0.866, 0), o);
      fastW(w, 'nail16', e0 - 1.25, vTopFace, d, wDir(w, -0.5, 0.866, 0), o);
    }
  };

  const winRO = { w: P.windowW * 12 + 1, h: P.windowH * 12 + 1 };
  const doorRO = { w: P.doorW + 2, h: Math.min(P.doorH + 1.5, Rb - 1.5) };
  const leafH = doorRO.h - 1.5;
  if (leafH < P.doorH - 0.01) warnings.push(`The ring beam is low: doors can only be ${inch(leafH)} tall.`);
  let sill = Math.max(P.sill, PH + 3);
  if (P.sill < PH + 3) warnings.push(`Window sill raised from ${inch(P.sill)} to ${inch(sill)} so the window sits above the ${inch(PH)} pony wall and its 2x4 plate.`);
  if (sill + winRO.h + 1.5 > Rb - 1.5) sill = Rb - 3 - winRO.h;
  if (sill < PH + 3) warnings.push(`A ${P.windowH}' louvre doesn't fit between the pony wall and the ring beam.`);
  const S = P.winSpacing * 12;
  const doorMap = parseDoorBays(P.doorBays, m + 1);
  const coverMap = parseDoorBays(P.coverBays, m + 1);
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
      if (coverMap[w.key][idx]) {
        w.covered.push([t - doorRO.w / 2, t + doorRO.w / 2]);
        continue;
      }
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
    const gaps = [...w.openings.filter((o) => o.type === 'door').map((o) => [o.u0, o.u1]), ...w.covered];
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
  const mesh = []; // strip lengths cut from the 7' × 100' rolls
  let meshDir = 'x';
  let concreteFt3 = 0;
  if (slab) {
    // Welded wire mesh in 7' strips lapped one square (6"), 3" in from the
    // pony walls. Run the strips whichever way uses the fewest rolls.
    const lo = [Pt + 3, Pt + 3];
    const hi = [W - Pt - 3, D - Pt - 3];
    const g = MESH.grid;
    const plan = (a) => {
      const L = hi[a] - lo[a];
      const across = hi[1 - a] - lo[1 - a];
      const n = across <= MESH.w ? 1 : Math.ceil((across - MESH.w) / (MESH.w - g)) + 1;
      const lens = Array(n).fill(L);
      let rolls = 0;
      const left = [];
      for (const l of lens) {
        const i = left.findIndex((r) => r >= l);
        if (i >= 0) left[i] -= l;
        else { left.push(MESH.len - l); rolls++; }
      }
      return { a, L, n, lens, rolls, tot: L * n };
    };
    const px = plan(0);
    const pz = plan(1);
    const best = px.rolls < pz.rolls || (px.rolls === pz.rolls && px.tot <= pz.tot) ? px : pz;
    meshDir = best.a === 0 ? 'x' : 'z';
    mesh.push(...best.lens);
    const mo = { mat: 'steel', group: 'floor', step: STEP.FLOOR_PREP, stepTo: STEP.FLOOR_PREP, name: 'Galv. wire mesh #10, 6" × 6"', ex: ex0 };
    const ry = y0 - T / 2;
    const r = MESH.wire;
    const a = best.a;
    // box in strip coords: u along the strip, c across it
    const wire = (u0, u1, c0, c1, yb) => {
      const [x0, x1, z0, z1] = a === 0 ? [u0, u1, c0, c1] : [c0, c1, u0, u1];
      b.box(x0, x1, yb, yb + r, z0, z1, mo);
    };
    for (let k = 0; k < best.n; k++) {
      const c0 = lo[1 - a] + k * (MESH.w - g);
      const c1 = Math.min(c0 + MESH.w, hi[1 - a]);
      const yb = ry + (k % 2) * 2 * r; // laps sit on top of the strip below
      for (let c = c0; c <= c1 + 0.01; c += g) wire(lo[a], hi[a], c - r / 2, c + r / 2, yb + r);
      for (let u = lo[a]; u <= hi[a] + 0.01; u += g) wire(u - r / 2, u + r / 2, c0, c1, yb);
    }
    b.box(Pt, W - Pt, y0 - T - 0.1, y0 - T, Pt, D - Pt, { mat: 'plastic', name: '6-mil plastic under the floor', group: 'floor', step: STEP.FLOOR_PREP, stepTo: STEP.FLOOR_PREP, ex: ex0 });
    b.box(Pt, W - Pt, y0 - T, y0, Pt, D - Pt, { mat: 'slab', name: `New floor slab, ${inch(T)} thick`, group: 'floor', step: STEP.FLOOR, ex: [0, -0.8 * EX, 0] });
    concreteFt3 = ((W - 2 * Pt) * (D - 2 * Pt) * T) / 1728;
  }
  const cementNet = concreteFt3 / BAG_YIELD_FT3;
  const plasticFt2 = slab ? ((W - 2 * Pt + 12) * (D - 2 * Pt + 12)) / 144 : 0;

  const rafterXs = [0.75];
  for (let c = 0.75 + P.rafterSpacing; c < W - 0.75 - 6; c += P.rafterSpacing) rafterXs.push(c);
  rafterXs.push(W - 0.75);

  // ---------------------------------------------------------------- wall plates on the ring beam
  for (const w of Object.values(walls)) {
    const long = w.key === 'front' || w.key === 'back';
    // keep anchors clear of rafter seats (long walls) and gable studs (ends)
    const blocked = long ? rafterXs.map((x) => (w.key === 'front' ? x : W - x)) : [];
    if (!long) for (let g = P.studSpacing; g < w.L; g += P.studSpacing) blocked.push(g);
    const po = { name: '1/2" wedge anchor', group: 'plates', step: STEP.PLATES, ex: [0, 2.5 * EX, 0] };
    for (const [s, e] of splitRange(long ? 0 : pw, long ? w.L : w.L - pw, [], 192)) {
      const [x0, x1, yy0, yy1, z0, z1] = wallBox(w, s, e, ringTop, ringTop + 1.5, 0, pw);
      b.lumberBox('2x6', x0, x1, yy0, yy1, z0, z1, { cat: 'framing', name: 'Wall plate on ring beam (2x6)', group: 'plates', step: STEP.PLATES, ex: [0, 2.5 * EX, 0] });
      w.plate.push([s, e]);
      for (let u of spread(s, e, Math.ceil((e - s) / 32) + 1, 4)) {
        for (let k = 0; k < 4 && blocked.some((x) => Math.abs(x - u) < 1.7); k++) u += u + 2.6 < e ? 2.6 : -2.6;
        fastW(w, 'wedge', u, ringTop + 1.5, pw / 2, UP, po);
        w.anchors.push(u);
      }
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
      // kept in wall coordinates for the step-by-step framing drawings
      const uc = (u0 + u1) / 2;
      w.frame.push({ name, u0, u1, v0, v1, bay: w.bays.findIndex(([a, c]) => uc > a - 0.1 && uc < c + 0.1) });
      return b.lumberBox(size, x0, x1, yy0, yy1, z0, z1, { ...fo, name, ...extra });
    };
    const nailO = { ...fo, name: '16d 3-1/2" galv. framing nail' };
    const scrO = { ...fo, name: 'Concrete screw 1/4" × 3-1/4"' };
    const screwRow = (u0, u1, v, out) => { for (const u of spread(u0, u1, Math.ceil((u1 - u0) / 24) + 1)) fastW(w, 'conScrew', u, v, 1.75, out, scrO); };
    const screwCol = (u, v0, v1, out, n) => { for (const v of spread(v0, v1, n, 4)) fastW(w, 'conScrew', u, v, 1.75, out, scrO); };
    // lines of framing behind the plywood, for the panel nails
    w.vl = [];
    w.hl = [];
    const vline = (u0, u1, v0, v1) => w.vl.push({ u: (u0 + u1) / 2, v0, v1 });
    for (const [a, c] of w.bays) {
      const ops = w.openings.filter((o) => o.u0 >= a - 0.01 && o.u1 <= c + 0.01);
      const doors = ops.filter((o) => o.type === 'door');
      const cov = w.covered.filter(([g0, g1]) => g0 >= a - 0.01 && g1 <= c + 0.01);
      const inGap = (u) => cov.some(([g0, g1]) => u > g0 && u < g1);
      for (const [s, e] of subtract(a, c, [...doors.map((o) => [o.u0, o.u1]), ...cov])) {
        add('Bottom plate on pony wall', '2x4', s, e, PH, PH + 1.5, 0, 3.5);
        screwRow(s, e, PH + 1.5, UP);
        w.hl.push({ v: PH + 0.75, u0: s, u1: e });
      }
      add('Top plate under ring beam', '2x4', a, c, Rb - 1.5, Rb, 0, 3.5);
      screwRow(a, c, Rb - 1.5, UP.clone().negate());
      w.hl.push({ v: Rb - 0.75, u0: a, u1: c });
      const vtop = Rb - 1.5;
      const vbot = PH + 1.5;
      const vertical = [];
      const zonesB = ops.map((o) => [o.u0 - 1.5, o.u1 + 1.5]);
      for (const [u0, u1] of [[a, a + 1.5], [c - 1.5, c]]) {
        if (zonesB.some(([za, zc]) => overlaps(u0, u1, za, zc))) continue;
        add('Stud (fixed to column)', '2x4', u0, u1, vbot, vtop, 0, 3.5);
        vertical.push([u0, u1]);
        vline(u0, u1, vbot, vtop);
        toeEnds(w, u0, u1, vbot, vtop, nailO);
        if (u0 === a) screwCol(u1, vbot, vtop, w.U, Math.ceil(bayH / 24));
        else screwCol(u0, vbot, vtop, w.U.clone().negate(), Math.ceil(bayH / 24));
      }
      // closed-up door gaps: framing runs down to the floor
      for (const [g0, g1] of cov) {
        add('Bottom plate on floor (closed door gap)', '2x4', g0, g1, 0, 1.5, 0, 3.5);
        screwRow(g0, g1, 1.5, UP);
        w.hl.push({ v: 0.75, u0: g0, u1: g1 });
        const gv = [];
        for (const [u0, u1] of [[g0, g0 + 1.5], [g1 - 1.5, g1]]) {
          if (zonesB.some(([za, zc]) => overlaps(u0, u1, za, zc))) continue;
          add('Stud (closed door gap)', '2x4', u0, u1, 1.5, vtop, 0, 3.5);
          gv.push([u0, u1]);
          vertical.push([u0, u1]);
          vline(u0, u1, 1.5, vtop);
          toeEnds(w, u0, u1, 1.5, vtop, nailO);
          // screwed to the end of the pony wall
          if (u0 === g0) screwCol(u1, 1.5, PH, w.U, Math.ceil(PH / 12));
          else screwCol(u0, 1.5, PH, w.U.clone().negate(), Math.ceil(PH / 12));
        }
        for (let g = 0; g <= w.L; g += P.studSpacing) {
          if (g - 0.75 < g0 + 3 || g + 0.75 > g1 - 3) continue;
          if (zonesB.some(([za, zc]) => overlaps(g - 1.75, g + 1.75, za, zc))) continue;
          add('Stud (closed door gap)', '2x4', g - 0.75, g + 0.75, 1.5, vtop, 0, 3.5);
          gv.push([g - 0.75, g + 0.75]);
          vertical.push([g - 0.75, g + 0.75]);
          vline(g - 0.75, g + 0.75, 1.5, vtop);
          toeEnds(w, g - 0.75, g + 0.75, 1.5, vtop, nailO);
        }
        gv.sort((x, y) => x[0] - y[0]);
        for (let i = 0; i + 1 < gv.length; i++) {
          if (gv[i + 1][0] - gv[i][1] <= 2) continue;
          // straddles the joint between the lower and upper plywood
          add('Nailer at pony-wall height', '2x4', gv[i][1], gv[i + 1][0], PH - 0.75, PH + 0.75, 0, 3.5);
          toeFlat(w, gv[i][1], gv[i + 1][0], PH + 0.75, nailO);
          w.hl.push({ v: PH, u0: gv[i][1], u1: gv[i + 1][0] });
        }
      }
      for (let g = 0; g <= w.L; g += P.studSpacing) {
        const u0 = g - 0.75;
        const u1 = g + 0.75;
        if (u0 < a + 4 || u1 > c - 4) continue;
        if (zonesB.some(([za, zc]) => overlaps(u0 - 1, u1 + 1, za, zc))) continue;
        if (cov.some(([g0, g1]) => overlaps(u0 - 1.5, u1 + 1.5, g0, g1))) continue;
        add('Stud', '2x4', u0, u1, vbot, vtop, 0, 3.5);
        vertical.push([u0, u1]);
        vline(u0, u1, vbot, vtop);
        toeEnds(w, u0, u1, vbot, vtop, nailO);
      }
      for (const o of ops) {
        const { u0, u1, v0, v1 } = o;
        const kingBot = inGap(u0 - 0.75) ? 1.5 : vbot;
        add('King stud', '2x4', u0 - 1.5, u0, kingBot, vtop, 0, 3.5);
        add('King stud', '2x4', u1, u1 + 1.5, kingBot, vtop, 0, 3.5);
        toeEnds(w, u0 - 1.5, u0, kingBot, vtop, nailO);
        toeEnds(w, u1, u1 + 1.5, kingBot, vtop, nailO);
        if (u0 - 1.5 <= a + 0.01) screwCol(u0, vbot, vtop, w.U, Math.ceil(bayH / 24));
        if (u1 + 1.5 >= c - 0.01) screwCol(u1, vbot, vtop, w.U.clone().negate(), Math.ceil(bayH / 24));
        vertical.push([u0 - 1.5, u0], [u1, u1 + 1.5]);
        vline(u0 - 1.5, u0, kingBot, vtop);
        vline(u1, u1 + 1.5, kingBot, vtop);
        // end nails through the kings into heads and sills
        const endNails = (v) => {
          for (const d of [1.2, 2.3]) {
            fastW(w, 'nail16', u0 - 1.5, v, d, w.U.clone().negate(), nailO);
            fastW(w, 'nail16', u1 + 1.5, v, d, w.U, nailO);
          }
        };
        const grid = [];
        for (let g = 0; g <= w.L; g += P.studSpacing) if (g > u0 + 2 && g < u1 - 2) grid.push(g);
        if (!grid.length) grid.push((u0 + u1) / 2);
        if (v1 + 1.5 <= vtop - 0.01) {
          add('Head (flat 2x4)', '2x4', u0, u1, v1, v1 + 1.5, 0, 3.5);
          endNails(v1 + 0.75);
          w.hl.push({ v: v1 + 0.75, u0, u1 });
          if (vtop - (v1 + 1.5) > 2) {
            for (const g of grid) {
              add('Cripple stud', '2x4', g - 0.75, g + 0.75, v1 + 1.5, vtop, 0, 3.5);
              toeEnds(w, g - 0.75, g + 0.75, v1 + 1.5, vtop, nailO);
              vline(g - 0.75, g + 0.75, v1 + 1.5, vtop);
            }
          }
        }
        if (o.type === 'window') {
          add('Rough sill', '2x4', u0, u1, v0 - 1.5, v0, 0, 3.5);
          endNails(v0 - 0.75);
          w.hl.push({ v: v0 - 0.75, u0, u1 });
          for (const g of grid) {
            const cb = inGap(g) ? 1.5 : vbot;
            if (v0 - 1.5 - cb > 2) {
              add('Cripple stud', '2x4', g - 0.75, g + 0.75, cb, v0 - 1.5, 0, 3.5);
              toeEnds(w, g - 0.75, g + 0.75, cb, v0 - 1.5, nailO);
              vline(g - 0.75, g + 0.75, cb, v0 - 1.5);
            }
          }
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
          toeFlat(w, s, e, lv + 0.75, nailO);
        }
      }
    }
    // gable-end studs above the ring beam
    w.gableStuds = [];
    if (w.key === 'left' || w.key === 'right') {
      const go = { cat: 'framing', name: 'Gable stud', group: 'roof', step: STEP.ROOF_FRAME, ex: wallEx(w, 0.6, 3.5) };
      for (let g = P.studSpacing; g < w.L; g += P.studSpacing) {
        const z = w.key === 'left' ? g : D - g;
        const hgt = underside(z) - yTop;
        if (hgt < 3) continue;
        const [x0, x1, yy0, yy1, z0, z1] = wallBox(w, g - 0.75, g + 0.75, ringTop + 1.5, ringTop + 1.5 + hgt, 0, 3.5);
        b.lumberBox('2x4', x0, x1, yy0, yy1, z0, z1, go);
        w.gable.push({ u: g, v0: ringTop + 1.5, v1: ringTop + 1.5 + hgt });
        toeEnds(w, g - 0.75, g + 0.75, ringTop + 1.5, ringTop + 1.5 + hgt, { ...go, name: '16d 3-1/2" galv. framing nail' }, [true, hgt > 6]);
        w.gableStuds.push(g);
      }
    }
  }

  // ---------------------------------------------------------------- roof framing
  const roofEx = [0, 3.5 * EX, 0];
  const rafterOpt = { cat: 'framing', group: 'roof', step: STEP.ROOF_FRAME, ex: roofEx, name: `Rafter (${rafterSize})` };
  const nBack = V(0, cos, -sin);
  const nFront = V(0, cos, sin);
  const zr = D / 2 - 0.75;
  const rafterLen = (zr + E) / cos;
  const profile = [[-E, underside(-E)], [0, underside(0)], [0, yTop], [pw, yTop], [zr, underside(zr)], [zr, rafterTop(zr)], [-E, rafterTop(-E)]];
  const roofNail = { group: 'roof', step: STEP.ROOF_FRAME, ex: roofEx, name: '16d 3-1/2" galv. framing nail' };
  const tieO = { mat: 'steel', group: 'roof', step: STEP.ROOF_FRAME, ex: roofEx, name: 'Hurricane tie (galv.)' };
  const tieNail = { ...roofNail, name: 'Hurricane tie nail 8d 1-1/2"' };
  let ties = 0;
  rafterXs.forEach((x, i) => {
    b.prism(profile, x - 0.75, x + 0.75, rafterSize, rafterLen, rafterOpt);
    b.prism(profile.map(([z, y]) => [D - z, y]).reverse(), x - 0.75, x + 0.75, rafterSize, rafterLen, rafterOpt);
    for (const dir of [1, -1]) {
      const Z = (z) => (dir > 0 ? z : D - z);
      // toenails at the seat on the wall plate and at the ridge
      for (const sx of [1, -1]) {
        b.fasten('nail16', V(x + sx * 0.75, yTop + 1.25, Z(pw / 2)), V(sx * 0.5, 0.866, 0), roofNail);
        const zz = zr - 2.5;
        b.fasten('nail16', V(x + sx * 0.75, (underside(zz) + rafterTop(zz)) / 2, Z(zz)), V(sx * 0.5, 0, -dir * 0.866), roofNail);
      }
      // hurricane tie on the inside face: one flange on the rafter, one on the plate
      const sx = i === rafterXs.length - 1 ? -1 : 1;
      const xf = x + sx * 0.75;
      const xs = (a, c) => [Math.min(xf + sx * a, xf + sx * c), Math.max(xf + sx * a, xf + sx * c)];
      const zs = (a, c) => [Math.min(Z(a), Z(c)), Math.max(Z(a), Z(c))];
      let [xa, xc] = xs(0, 0.06);
      let [za, zc] = zs(3.2, pw);
      b.box(xa, xc, yTop + 0.1, yTop + 3.6, za, zc, tieO);
      [xa, xc] = xs(0, 1.75);
      [za, zc] = zs(pw, pw + 0.06);
      b.box(xa, xc, yTop - 1.4, yTop, za, zc, tieO);
      ties++;
      for (const y of [yTop + 1.2, yTop + 2.6]) for (const z of [3.8, 4.9]) b.fasten('tieNail', V(xf + sx * 0.06, y, Z(z)), V(sx, 0, 0), tieNail);
      for (const xo of [0.5, 1.25]) b.fasten('tieNail', V(xf + sx * xo, yTop - 0.7, Z(pw + 0.06)), V(0, 0, dir), tieNail);
    }
  });
  const ridgeTop = rafterTop(zr);
  const ridgeBoards = splitRange(0, W, rafterXs, 192);
  const tieXs = [];
  for (const [s, e] of ridgeBoards) {
    b.lumberBox('2x6', s, e, ridgeTop - 5.5, ridgeTop, D / 2 - 0.75, D / 2 + 0.75, { ...rafterOpt, name: 'Ridge board' });
  }
  rafterXs.forEach((x, i) => {
    if (i === 0 || i === rafterXs.length - 1 || i % 2 === 0) return;
    const pieces = splitRange(0, D, [D / 2 + 12], 192);
    tieXs.push({ x, pieces });
    for (const [s, e] of pieces) {
      b.lumberBox('2x4', x + 0.75, x + 2.25, yTop, yTop + 3.5, s, e, { ...rafterOpt, name: 'Ceiling tie' });
      // face-nailed to the rafter at the wall
      const zz = s < 1 ? [2.5, 6, 9.5] : e > D - 1 ? [D - 2.5, D - 6, D - 9.5] : [];
      zz.forEach((z, k) => b.fasten('nail16', V(x + 2.25, yTop + 1.75 + (k % 2 ? 0.8 : -0.8), z), V(1, 0, 0), roofNail));
    }
    // butt joints are spliced with a 4' 2x4 scab nailed across the joint
    for (let k = 1; k < pieces.length; k++) {
      const j = pieces[k][0];
      const half = Math.min(24, j - 12, D - 12 - j);
      b.lumberBox('2x4', x + 2.25, x + 3.75, yTop, yTop + 3.5, j - half, j + half, { ...rafterOpt, name: 'Ceiling tie splice (2x4 scab)' });
      for (const sgn of [-1, 1]) {
        for (const dz of [2.5, half * 0.45, half - 2.5]) {
          for (const dy of [1, 2.5]) b.fasten('nail16', V(x + 3.75, yTop + dy, j + sgn * (dz + (dy > 2 ? 1.5 : 0))), V(1, 0, 0), roofNail);
        }
      }
    }
  });

  const slopes = [
    { key: 'back', zt: -E, dir: 1, top: (D / 2 + E) / cos, nrm: nBack },
    { key: 'front', zt: D + E, dir: -1, top: (D / 2 + E) / cos, nrm: nFront },
  ];
  for (const sl of slopes) {
    const s0 = 1.75;
    const s1 = sl.top - 2.5;
    const n = Math.ceil((s1 - s0) / P.purlinSpacing) + 1;
    sl.purlins = n;
    sl.purlinS = [];
    const upDir = V(0, sin, sl.dir * cos);
    const purO = { cat: 'framing', group: 'purlins', step: STEP.PURLINS, ex: [0, 5 * EX, 0], name: 'Purlin (2x4 flat)' };
    for (let j = 0; j < n; j++) {
      const s = s0 + ((s1 - s0) * j) / (n - 1);
      sl.purlinS.push(s);
      const z = sl.zt + sl.dir * s * cos;
      const y = rafterTop(z);
      for (const [xa, xb] of splitRange(-R, W + R, rafterXs, 192)) {
        const a = V(xa, y, z).addScaledVector(sl.nrm, 0.75);
        const c = V(xb, y, z).addScaledVector(sl.nrm, 0.75);
        b.member(a, c, '2x4', upDir, purO);
        // two nails into every rafter it crosses
        for (const x of rafterXs) {
          if (x < xa - 0.01 || x > xb + 0.01) continue;
          const xn = Math.min(xb - 0.5, Math.max(xa + 0.5, x));
          for (const k of [-1, 1]) b.fasten('nail16', V(xn, y, z).addScaledVector(sl.nrm, 1.5).addScaledVector(upDir, k), sl.nrm, { ...purO, name: '16d 3-1/2" galv. framing nail' });
        }
      }
    }
    if (screensOn) {
      // blocks between the purlins over each end rafter close the rake
      // against insects (the gable sheets stop at the top of the rafter)
      const bO = { ...purO, name: 'Blocking between purlins over the end rafter' };
      for (const xc of [1.75, W - 1.75]) {
        for (let j = 0; j + 1 < n; j++) {
          const sa = sl.purlinS[j] + 1.75;
          const sb = sl.purlinS[j + 1] - 1.75;
          if (sb - sa < 2) continue;
          const za = sl.zt + sl.dir * sa * cos;
          const zb = sl.zt + sl.dir * sb * cos;
          b.member(V(xc, rafterTop(za), za).addScaledVector(sl.nrm, 0.75), V(xc, rafterTop(zb), zb).addScaledVector(sl.nrm, 0.75), '2x4', V(1, 0, 0), bO);
        }
      }
    }
    const yf = rafterTop(sl.zt);
    const fasO = { cat: 'framing', group: 'roof', step: STEP.ROOF_FRAME, ex: [0, 3.5 * EX, -sl.dir * 0.4 * EX], name: 'Fascia' };
    for (const [xa, xb] of splitRange(-R, W + R, rafterXs, 192)) {
      const za = sl.dir > 0 ? sl.zt - 0.75 : sl.zt;
      b.lumberBox('1x6', xa, xb, yf - 5.5, yf, za, za + 0.75, fasO);
    }
    const zOut = sl.dir > 0 ? sl.zt - 0.75 : sl.zt + 0.75;
    for (const x of rafterXs) for (const y of [yf - 1.5, yf - 4]) b.fasten('nail8', V(x, y, zOut), V(0, 0, -sl.dir), { ...fasO, name: '8d 2-1/2" galv. nail' });
  }

  // ---------------------------------------------------------------- roofing
  const tinPieces = [];
  const clad = P.cladding;
  const tinMat = clad === 'pvc' ? 'pvc' : 'tin';
  const tinName = clad === 'pvc' ? 'PVC tinroof sheet' : 'Metal tinroof sheet';
  // every other crest, skipping the lap that the next sheet covers
  const crests = (wi, last) => {
    const xs = [];
    for (let x = CORR.pitch / 4; x < wi - 0.3; x += 2 * CORR.pitch) if (last || x < P.tinCover - 0.3) xs.push(x);
    return xs;
  };
  const nCols = Math.ceil((W + 2 * R - (tinW - P.tinCover)) / P.tinCover);
  for (const sl of slopes) {
    const zs = sl.zt - sl.dir * 2;
    const zEnd = D / 2 - sl.dir * 1;
    const Ls = Math.abs(zEnd - zs) / cos;
    const yAxis = V(0, sin, sl.dir * cos);
    const zAxis = sl.nrm.clone();
    const xAxis = new THREE.Vector3().crossVectors(yAxis, zAxis);
    const run = sheetRun(Ls);
    sl.run = run;
    sl.Ls = Ls;
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
        const sO = { group: 'roofing', step: STEP.ROOFING, ex: [zAxis.x * EX, 7 * EX + zAxis.y * EX, zAxis.z * EX], name: 'Roofing screw with sealing washer' };
        for (const sp of sl.purlinS) {
          const yl = sp + 2 / cos - pc.start;
          if (yl < 0.5 || yl > pc.len - 0.5) continue;
          for (const xl of crests(wi, i === nCols - 1)) {
            b.fasten('roofScrew', o.clone().addScaledVector(xAxis, xl).addScaledVector(yAxis, yl).addScaledVector(zAxis, CORR.depth), zAxis, sO);
          }
        }
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
    const nr = Math.ceil((W + 2 * R) / (120 - 6)) * 6;
    for (let k = 0; k < nr; k++) {
      b.fasten('roofScrew', o.clone().addScaledVector(xAxis, ((k + 0.5) * (W + 2 * R)) / nr).addScaledVector(yAxis, 3.5), zAxis, { group: 'roofing', step: STEP.ROOFING, ex: [0, 8.5 * EX, 0], name: 'Roofing screw with sealing washer' });
    }
  }
  const ridgePieces = Math.ceil((W + 2 * R) / (120 - 6));

  // ---------------------------------------------------------------- siding
  // fix(ui, wi, base, len, last) → [[u, v]] screw positions (wall coords)
  const sidingLog = [];
  const hang = (w, ua, ub, vbase, topFn, holes0, label, off = 0.15, fix = null) => {
    const L = ub - ua;
    const nc = Math.max(1, Math.ceil((L - (tinW - P.tinCover)) / P.tinCover));
    const rec = { wall: w.key, label, ua, ub, vbase, n: nc, pieces: [] };
    sidingLog.push(rec);
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
        rec.pieces.push({ col: i, u: ui, w: wi, len: pc.len, stock: pc.stock });
        const holes = holes0.map((o) => ({ x0: o.u0 - ui, x1: o.u1 - ui, y0: o.v0 - base, y1: o.v1 - base }));
        const profile = (x) => topFn(ui + x) - base;
        const so = off + (i % 2) * 0.08 + j * 0.12;
        const o = toW(w, ui, base, -so);
        const sex = wallEx(w, 2.2, 1.5);
        b.sheet(o, w.U, UP, w.n, { w: wi, h: pc.len, corr: CORR, holes, profile }, {
          mat: tinMat, name: `${tinName} (${label})`, info: `cut length ${ftin(pc.len)}`, group: 'siding', step: STEP.SIDING, ex: sex,
        });
        tinPieces.push({ stock: pc.stock, len: pc.len, use: 'siding' });
        if (!fix) return;
        for (const [u, v] of fix(ui, wi, base, pc.len, i === nc - 1)) {
          if (v < base + 0.5 || v > base + pc.len - 0.5 || v > topFn(u) - 0.5) continue;
          if (holes0.some((h) => u > h.u0 - 2 && u < h.u1 + 2 && v > h.v0 - 3.5 && v < h.v1 + 3.5)) continue;
          fastW(w, 'roofScrew', u, v, -(so + CORR.depth), w.n, { group: 'siding', step: STEP.SIDING, ex: sex, name: 'Roofing screw with sealing washer' });
        }
      });
    }
  };
  // screws in rows along the horizontal framing
  const rowFix = (rows) => (ui, wi, base, len, last) => rows.flatMap((v) => crests(wi, last).map((x) => [ui + x, v]));
  for (const w of Object.values(walls)) {
    for (const [a, c] of w.bays) hang(w, a, c, PH - 1.5, () => Rb, w.openings.filter((o) => o.u0 >= a - 0.01 && o.u1 <= c + 0.01), 'wall panel', 0.15, rowFix([PH + 0.75, ...blockLevels, Rb - 0.75]));
    // closed door gaps: a lower sheet tucked behind the panel above
    for (const [g0, g1] of w.covered) hang(w, g0 - 1, g1 + 1, -1.5, () => PH + 4, [], 'closed door gap', 0.02, rowFix([0.75]));
    if (w.sideTop) {
      // gables: along the wall plate, up each gable stud and along the end rafter
      const gableFix = (ui, wi, base, len, last) => {
        const pts = rowFix([ringTop + 0.75])(ui, wi, base, len, last);
        const cr = crests(wi, last).map((x) => ui + x);
        for (const g of w.gableStuds) {
          if (g < ui || g > ui + wi) continue;
          const u = cr.reduce((bst, x) => (Math.abs(x - g) < Math.abs(bst - g) ? x : bst), cr[0]);
          for (let v = ringTop + 14; v < w.sideTop(u) - 4; v += 16) pts.push([u, v]);
        }
        for (const u of cr) pts.push([u, w.sideTop(u) - 3]);
        return pts;
      };
      hang(w, 0, w.L, ringTop - 1, w.sideTop, [], 'gable', 0.15, gableFix);
    }
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
      const n8 = (o) => ({ group: o.group, step, ex: o.ex, name: '8d 2-1/2" galv. nail' });
      const addT = (a, c, va, vc) => {
        if (vc - va < 1) return;
        const [x0, x1, yy0, yy1, z0, z1] = wallBox(w, a, c, va, vc, trimD[0], trimD[1]);
        b.lumberBox('1x4', x0, x1, yy0, yy1, z0, z1, trimO);
        // pairs of nails about every 16"
        const horiz = c - a > vc - va;
        const [l0, l1] = horiz ? [a, c] : [va, vc];
        for (const t of spread(l0, l1, Math.ceil((l1 - l0) / 16) + 1, 2)) {
          for (const e of [0.8, 2.7]) {
            const [u, v] = horiz ? [t, va + e * ((vc - va) / 3.5)] : [a + e * ((c - a) / 3.5), t];
            fastW(w, 'nail8', u, v, trimD[0], w.n, n8(trimO));
          }
        }
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
          // nailed through the frame into the king studs
          const left = a < u0 + 1;
          for (const f of [0.12, 0.5, 0.88]) fastW(w, 'nail8', left ? c : a, v0 + 0.5 + fh * f, 1.75, left ? w.U : w.U.clone().negate(), n8(al));
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
        // jambs: concrete screws into the pony-wall ends, nails into the kings
        const jd = (Pt - 1.25) / 2;
        for (const v of spread(0, v1 - 0.75, Math.ceil(v1 / 16) + 1, 4)) {
          const [shape, nm] = v < PH ? ['conScrew', 'Concrete screw 1/4" × 3-1/4"'] : ['nail8', '8d 2-1/2" galv. nail'];
          fastW(w, shape, u0 + 0.75, v, jd, w.U, { ...jo, name: nm });
          fastW(w, shape, u1 - 0.75, v, jd, w.U.clone().negate(), { ...jo, name: nm });
        }
        for (const u of spread(u0 + 0.75, u1 - 0.75, 3, 4)) fastW(w, 'nail8', u, v1 - 0.75, jd, UP.clone().negate(), { ...jo, name: '8d 2-1/2" galv. nail' });
        const lu0 = u0 + 1;
        const lu1 = u1 - 1;
        const lv0 = 0.5;
        const lv1 = lv0 + leafH;
        const lo = { cat: 'framing', group: 'door', step, ex: exOut, name: 'Door board (1x6)' };
        const boards = [];
        for (let u = lu0; u < lu1 - 0.5; u += 5.5) {
          const ue = Math.min(u + 5.5, lu1);
          const [x0, x1, yy0, yy1, z0, z1] = wallBox(w, u + 0.03, ue - 0.03, lv0, lv1, 0.25, 1.0);
          b.lumberBox('1x6', x0, x1, yy0, yy1, z0, z1, lo);
          boards.push((u + ue) / 2);
        }
        const bo = { ...lo, name: 'Door batten (1x4)' };
        const doorNail = { ...lo, name: '8d 2-1/2" galv. nail (clinched)' };
        for (const vv of [lv0 + 6, lv1 - 9.5]) {
          const [x0, x1, yy0, yy1, z0, z1] = wallBox(w, lu0 + 1, lu1 - 1, vv, vv + 3.5, 1.0, 1.75);
          b.lumberBox('1x4', x0, x1, yy0, yy1, z0, z1, bo);
          for (const bu of boards) for (const k of [-1.3, 1.3]) fastW(w, 'nail8', bu + k, vv + 1.75 + k * 0.4, 0.25, w.n, doorNail);
        }
        // the brace rises from the bottom hinge to the latch side, so it
        // pushes up the free corner (in compression) instead of hanging from it
        const ba = [lu0 + 3, lv0 + 9.5 + 1.75];
        const bc = [lu1 - 3, lv1 - 9.5 - 1.75];
        b.member(toW(w, ba[0], ba[1], 1.375), toW(w, bc[0], bc[1], 1.375), '1x4', w.n, { ...bo, flat: true, name: 'Door brace (1x4)' });
        for (const bu of boards) {
          const t = (bu - ba[0]) / (bc[0] - ba[0]);
          if (t < 0.02 || t > 0.98) continue;
          const bv = ba[1] + (bc[1] - ba[1]) * t;
          for (const k of [-0.9, 0.9]) fastW(w, 'nail8', bu, bv + k, 0.25, w.n, doorNail);
        }
        // T-hinges: leaf on the casing, knuckle at its edge, strap cranked in onto the door
        const hw = { mat: 'steel', group: 'door', step, ex: exOut, name: 'Galvanised 4" T-hinge' };
        const wsO = { group: 'door', step, ex: exOut, name: 'Wood screw (hinge / hasp)' };
        const cf = trimD[0];
        const hbox = (a, c, va, vc, d0, d1) => {
          const [x0, x1, yy0, yy1, z0, z1] = wallBox(w, a, c, va, vc, d0, d1);
          b.box(x0, x1, yy0, yy1, z0, z1, hw);
        };
        for (const vv of [lv0 + 8, (lv0 + lv1) / 2, lv1 - 8]) {
          hbox(u0 - 2.6, u0 - 0.25, vv - 1.75, vv + 1.75, cf - 0.08, cf);
          const kc = toW(w, u0 - 0.1, vv, cf - 0.2);
          b.cyl(kc.x, kc.z, 0.22, vv + y0 - 1.75, vv + y0 + 1.75, hw);
          hbox(u0 + 0.78, u0 + 0.9, vv - 0.5, vv + 0.5, cf, 0.25);
          hbox(u0 - 0.1, u0 + 0.9, vv - 0.5, vv + 0.5, cf - 0.08, cf);
          hbox(u0 + 0.78, lu0 + 4, vv - 0.5, vv + 0.5, 0.17, 0.25);
          for (const k of [-1.1, 0, 1.1]) fastW(w, 'woodScrew', u0 - 1.5 + (k ? 0 : -0.6), vv + k, cf - 0.08, w.n, wsO);
          for (const u of [lu0 + 1, lu0 + 3.2]) fastW(w, 'woodScrew', u, vv, 0.17, w.n, wsO);
        }
        // hasp on the door, staple on the casing, and a padlock
        const vh = 40;
        hbox(lu1 - 4.5, lu1 + 0.15, vh - 0.75, vh + 0.75, 0.17, 0.25);
        hbox(lu1 + 0.05, lu1 + 0.15, vh - 0.75, vh + 0.75, cf - 0.06, 0.25);
        hbox(lu1 + 0.05, u1 + 2.2, vh - 0.75, vh + 0.75, cf - 0.14, cf - 0.06);
        hbox(u1 + 2.4, u1 + 3.3, vh - 1, vh + 1, cf - 0.08, cf);
        hbox(u1 + 1.75, u1 + 1.95, vh - 0.3, vh + 0.3, cf - 0.75, cf - 0.08);
        for (const u of [lu1 - 3.8, lu1 - 2.4]) fastW(w, 'woodScrew', u, vh, 0.17, w.n, wsO);
        for (const v of [vh - 0.55, vh + 0.55]) fastW(w, 'woodScrew', u1 + 2.85, v, cf - 0.08, w.n, wsO);
        const lockO = { ...hw, name: 'Padlock' };
        const [l0, l1, ly0, ly1, lz0, lz1] = wallBox(w, u1 + 0.95, u1 + 2.75, vh - 3.6, vh - 1.4, cf - 1.05, cf - 0.45);
        b.box(l0, l1, ly0, ly1, lz0, lz1, { ...lockO, mat: 'brass' });
        for (const [a, c] of [[u1 + 1.15, u1 + 1.4], [u1 + 2.3, u1 + 2.55]]) {
          const [x0, x1, yy0, yy1, z0, z1] = wallBox(w, a, c, vh - 1.4, vh + 0.1, cf - 0.85, cf - 0.65);
          b.box(x0, x1, yy0, yy1, z0, z1, lockO);
        }
        const [s0, s1, sy0, sy1, sz0, sz1] = wallBox(w, u1 + 1.15, u1 + 2.55, vh + 0.1, vh + 0.35, cf - 0.85, cf - 0.65);
        b.box(s0, s1, sy0, sy1, sz0, sz1, lockO);
      }
    }
  }

  // ---------------------------------------------------------------- interior plywood
  const wallPlyPieces = [];
  // nails about every 8" along each stud, plate, head and sill behind a sheet
  const panelNails = (w, su0, su1, sv0, sv1, holes0) => {
    const o = { group: 'interior', step: STEP.INTERIOR, ex: wallEx(w, -0.6, 1.5), name: 'Panel nail 1-1/4"' };
    const inward = w.n.clone().negate();
    const free = (u, v) => !holes0.some((h) => u > h.u0 - 0.6 && u < h.u1 + 0.6 && v > h.v0 - 0.6 && v < h.v1 + 0.6);
    const clampIn = (x, lo, hi) => Math.min(hi - 0.4, Math.max(lo + 0.4, x));
    const us = [];
    for (const l of w.vl) {
      const u = clampIn(l.u, su0, su1);
      if (Math.abs(u - l.u) > 0.8 || us.some((x) => Math.abs(x - u) < 1)) continue;
      const lo = Math.max(l.v0, sv0) + 1;
      const hi = Math.min(l.v1, sv1) - 1;
      if (hi <= lo) continue;
      us.push(u);
      const n = Math.max(1, Math.round((hi - lo) / 8));
      for (let k = 0; k <= n; k++) if (free(u, lo + ((hi - lo) * k) / n)) fastW(w, 'panelNail', u, lo + ((hi - lo) * k) / n, 3.63, inward, o);
    }
    for (const l of w.hl) {
      const v = clampIn(l.v, sv0, sv1);
      if (Math.abs(v - l.v) > 0.8) continue;
      const lo = Math.max(l.u0, su0) + 1;
      const hi = Math.min(l.u1, su1) - 1;
      if (hi <= lo) continue;
      const n = Math.max(1, Math.round((hi - lo) / 8));
      for (let k = 0; k <= n; k++) {
        const u = lo + ((hi - lo) * k) / n;
        if (us.some((x) => Math.abs(x - u) < 1.5) || !free(u, v)) continue;
        fastW(w, 'panelNail', u, v, 3.63, inward, o);
      }
    }
  };
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
          panelNails(w, u, u + cw, v, v + rh, holes0);
        }
      }
    }
    for (const [g0, g1] of w.covered) {
      const o = toW(w, g0, 0, 3.62);
      b.sheet(o, w.U, UP, w.n, { w: g1 - g0, h: PH, corr: null }, {
        mat: 'plyWall', name: PLY[P.wallPly].name + ' (closed door gap)', info: `${ftin(g1 - g0)} × ${ftin(PH)}`, group: 'interior', step: STEP.INTERIOR, ex: wallEx(w, -0.6, 1.5),
      });
      wallPlyPieces.push({ w: g1 - g0, h: PH });
      panelNails(w, g0, g1, 0, PH, []);
    }
  }

  // ---------------------------------------------------------------- insect screens
  const scr = { windows: [], soffit: [], foamFt: 0, rollW: 0, soffitRoll: 0, fold: 0, soffitW: 0 };
  const rollFor = (need) => SCREEN_ROLLS.find((r) => r >= need) || SCREEN_ROLLS[SCREEN_ROLLS.length - 1];
  if (screensOn) {
    // a hinged 1x3 frame inside every louvre, lapping 1-1/2" onto the
    // plywood all round; it swings open to reach the louvre handle
    const fd0 = 3.8;
    const fd1 = fd0 + 0.75;
    for (const w of Object.values(walls)) {
      const sEx = wallEx(w, -1.4, 1.5);
      const so = { cat: 'screens', group: 'screens', step: STEP.SCREENS, ex: sEx };
      const hw = { mat: 'steel', group: 'screens', step: STEP.SCREENS, ex: sEx };
      for (const o of w.openings) {
        if (o.type !== 'window') continue;
        const fa = o.u0 - 1.5;
        const fc = o.u1 + 1.5;
        const fb = o.v0 - 1.5;
        const ft = o.v1 + 1.5;
        const piece = (name, a, c, va, vc) => b.lumberBox('1x3', ...wallBox(w, a, c, va, vc, fd0, fd1), { ...so, name });
        piece('Screen frame rail (1x3)', fa, fc, fb, fb + 2.5);
        piece('Screen frame rail (1x3)', fa, fc, ft - 2.5, ft);
        piece('Screen frame stile (1x3)', fa, fa + 2.5, fb + 2.5, ft - 2.5);
        piece('Screen frame stile (1x3)', fc - 2.5, fc, fb + 2.5, ft - 2.5);
        const sw = fc - fa - 1;
        const sh = ft - fb - 1;
        b.sheet(toW(w, fa + 0.5, fb + 0.5, fd0 - 0.04), w.U, UP, w.n, { w: sw, h: sh, corr: null }, {
          mat: 'screen', name: 'Fiberglass insect screen, stapled to the back of the frame', info: `${ftin(sw)} × ${ftin(sh)}`, group: 'screens', step: STEP.SCREENS, ex: sEx,
        });
        scr.windows.push({ w: sw, h: sh, wall: w.key });
        // hinges on the high-u side (the left, looking out from inside), a hook on the other
        for (const v of [fb + 6, ft - 6]) {
          b.box(...wallBox(w, fc - 1, fc, v - 1, v + 1, fd1, fd1 + 0.06), { ...hw, name: '2" butt hinge' });
          b.box(...wallBox(w, fc, fc + 1, v - 1, v + 1, 3.75, 3.81), { ...hw, name: '2" butt hinge' });
          const kp = toW(w, fc, v, fd1);
          b.cyl(kp.x, kp.z, 0.14, y0 + v - 1, y0 + v + 1, { ...hw, name: '2" butt hinge' });
        }
        const vm = (fb + ft) / 2;
        b.box(...wallBox(w, fa - 1.2, fa - 0.4, vm - 0.3, vm + 0.3, 3.75, fd1 + 0.2), { ...hw, name: 'Hook & eye' });
        b.box(...wallBox(w, fa - 0.4, fa + 1.6, vm - 0.06, vm + 0.06, fd1 + 0.1, fd1 + 0.22), { ...hw, name: 'Hook & eye' });
      }
    }
    if (scr.windows.length) scr.rollW = rollFor(Math.min(...scr.windows.map((x) => Math.min(x.w, x.h))));
    if (scr.windows.some((x) => Math.min(x.w, x.h) > SCREEN_ROLLS[SCREEN_ROLLS.length - 1])) warnings.push('The window screens are wider than a 60" roll of screen; join two pieces on the frame.');
    // screen under the rafter tails, from the fascia back to the wall, its
    // back edge folded up onto the face of the wall plate
    if (E >= 3) {
      const fold = yTop - 0.4 - underside(0);
      scr.fold = fold;
      scr.soffitW = E / cos + fold + 1;
      scr.soffitRoll = rollFor(scr.soffitW + 1);
      for (const sl of slopes) {
        const zw = sl.dir > 0 ? 0 : D;
        const o = { mat: 'screen', group: 'screens', step: STEP.SCREENS, ex: [0, -0.6 * EX, -sl.dir * 0.8 * EX] };
        const yAx = V(0, sin, sl.dir * cos);
        const zAx = V(0, -cos, sl.dir * sin);
        const xAx = new THREE.Vector3().crossVectors(yAx, zAx);
        b.sheet(V(xAx.x > 0 ? 0 : W, underside(sl.zt) - 0.06, sl.zt), xAx, yAx, zAx, { w: W, h: E / cos, corr: null }, {
          ...o, name: 'Fiberglass insect screen under the eave', info: `${ftin(W)} long, ${ftin(scr.soffitW)} wide with the folds`,
        });
        const zO = V(0, 0, -sl.dir);
        const xO = new THREE.Vector3().crossVectors(UP, zO);
        b.sheet(V(xO.x > 0 ? 0 : W, underside(zw) - 0.06, zw - sl.dir * 0.04), xO, UP, zO, { w: W, h: fold + 0.06, corr: null }, { ...o, name: 'Eave screen folded up onto the wall plate' });
        scr.soffit.push({ len: W + 6, w: scr.soffitW, key: sl.key });
      }
    }
    // canned foam in the corrugations along both eave purlins and under the ridge cap
    scr.foamFt = (4 * (W + 2 * R)) / 12;
  }

  // ---------------------------------------------------------------- gutters, downpipes and the rainwater tank
  const rain = { gutterPieces: [], joiners: 0, ends: 0, outlets: 0, brackets: 0, bracketXs: [], screws: 0, pipes: [], couplings: 0, elbows: 0, tees: 0, straps: 0, strapZs: [] };
  let tank = null;
  const rod = (a, c, r, o) => {
    const dir = c.clone().sub(a);
    const len = dir.length();
    const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize());
    return b.add({ kind: 'cyl', r, h: len, pos: a.clone().add(c).multiplyScalar(0.5).toArray(), quat: q.toArray(), ...o });
  };
  // a profile drawn in the (z, y) plane, relative to height ya at xa and yb at xb
  const prismX = (pts, xa, xb, ya, yb, o) => {
    if (xb < xa) [xa, xb, ya, yb] = [xb, xa, yb, ya];
    const q = new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), Math.atan2(yb - ya, xb - xa)).multiply(new THREE.Quaternion().setFromAxisAngle(UP, Math.PI / 2));
    return b.add({ kind: 'prism', pts: pts.map(([z, y]) => [-z, y]), depth: Math.hypot(xb - xa, yb - ya), pos: [xa, ya, 0], quat: q.toArray(), ...o });
  };
  if (rainOn) {
    const sideR = P.tankEnd !== 'left';
    const sx = sideR ? 1 : -1; // outward along x at the tank end
    const tw = sideR ? walls.right : walls.left;
    const xEnd = sideR ? W : 0;
    const xFar = sideR ? -R : W + R; // high end of the gutters
    const xNear = sideR ? W + R : -R;
    const xo = xEnd + sx * 3.25; // downpipes and header, on 1-1/2" standoffs off the wall
    const GR = 2.5; // 5" half-round gutter
    const PR = PIPE_OD[3] / 2;
    const gFall = 0.5 / 120; // gutters fall 1/2" every 10'
    const pFall = 1 / 96; // pipes fall 1/8" per foot
    const yf = rafterTop(-E);
    const rimHi = yf - 0.75;
    const rimLo = rimHi - gFall * Math.abs(xo - xFar);
    // the short stub past the outlet is level
    const rim = (x) => ((x - xo) * sx > 0 ? rimLo : rimHi - gFall * Math.abs(x - xFar));
    const outletTop = rimLo - GR;
    const yH0 = outletTop - 3 - PR; // header centre at the corners
    const zg = slopes.map((sl) => sl.zt - sl.dir * (1 + GR)); // gutter centre lines [back, front]

    // tank: on a square block base, clear of any door in that wall
    const TK = TANKS[P.tankGal] || TANKS[1000];
    const S = Math.ceil((TK.d + 12) / 16) * 16;
    const doorZ = tw.openings.filter((o) => o.type === 'door').map((o) => {
      const a = toW(tw, o.u0, 0, 0).z;
      const c = toW(tw, o.u1, 0, 0).z;
      return [Math.min(a, c), Math.max(a, c)];
    });
    const clear = (z) => !doorZ.some(([a, c]) => z + S / 2 + 6 > a && z - S / 2 - 6 < c);
    const cands = [];
    for (let z = Math.min(D / 2, S / 2 - E + 6); z <= Math.max(D / 2, D + E - S / 2 - 6); z += 2) cands.push(z);
    cands.sort((a, c) => Math.abs(a - D / 2) - Math.abs(c - D / 2));
    let zT = cands.find(clear);
    if (zT === undefined) {
      zT = D / 2;
      warnings.push(`The water tank is in front of a door in the ${tw.key} end wall. Put the tank at the other end, or move the door.`);
    }
    const yHm = yH0 - pFall * Math.max(Math.abs(zT - zg[0]), Math.abs(zg[1] - zT));
    const yHdr = (z) => {
      const z0 = z < zT ? zg[0] : zg[1];
      return yH0 + ((yHm - yH0) * Math.abs(z - z0)) / Math.max(1, Math.abs(zT - z0));
    };
    const xT = xEnd + sx * (12 + S / 2);
    const xFF = xo + sx * 6;
    const yOut = (x) => yHm - pFall * Math.abs(x - xo);
    const yIn = yOut(xT) - PR - 3; // highest the top of the tank can be
    const room = yIn - TK.h;
    const k = Math.max(0, Math.min(3, Math.floor((room - 4) / 8)));
    const slabT = Math.max(4, Math.min(5.5, Math.floor((room - 8 * k) * 4) / 4));
    const base = 8 * k + slabT;
    const tapH = base + 3;
    if (room < 4) warnings.push(`A ${P.tankGal}-gal tank (${inch(TK.h)} tall) is too tall to fill from the gutters, which reach only ${ftin(yIn)} above the ground at the tank. Choose a smaller tank.`);
    else if (tapH < 16) warnings.push(`The tank's tap is only ${inch(tapH)} off the ground, too low to fill a bucket under it. Use a short hose on the tap, or choose a shorter tank so its base can be higher.`);
    for (const o of tw.openings) {
      if (yHm - PR - y0 < o.v1 + (o.type === 'window' ? 3.5 : 1) && yH0 + PR - y0 > o.v0) {
        warnings.push(`The rain pipe along the ${tw.key} end wall would cross a ${o.type} there. Put the tank at the other end${o.type === 'door' ? ', or move that door' : ''}.`);
        break;
      }
    }

    // gutters, outlets, brackets and downpipes
    const gO = { mat: 'pvcPipe', group: 'gutters', step: STEP.GUTTERS, ex: [0, 0, 0] };
    const arc = (r0, r1, zc, n = 14) => {
      const pts = [];
      for (let i = 0; i <= n; i++) { const t = Math.PI + (Math.PI * i) / n; pts.push([zc + r1 * Math.cos(t), r1 * Math.sin(t)]); }
      for (let i = n; i >= 0; i--) { const t = Math.PI + (Math.PI * i) / n; pts.push([zc + r0 * Math.cos(t), r0 * Math.sin(t)]); }
      return pts;
    };
    const disc = (r, zc, n = 14) => Array.from({ length: n + 1 }, (_, i) => { const t = Math.PI + (Math.PI * i) / n; return [zc + r * Math.cos(t), r * Math.sin(t)]; });
    const fit = (p, dirs, o) => { for (const dv of dirs) rod(p.clone().addScaledVector(dv, -0.3), p.clone().addScaledVector(dv, 2.6), PR + 0.22, o); };
    const pO = { mat: 'pvcPipe', group: 'gutters', step: STEP.GUTTERS, ex: [0, 0, 0] };
    const pipeLen = (l) => {
      // cut from 10' lengths, joined with couplings
      const pcs = splitRange(0, l + 2, [], 120);
      rain.couplings += pcs.length - 1;
      for (const [s0, e0] of pcs) rain.pipes.push(e0 - s0);
    };
    const xLo = Math.min(xFar, xNear);
    const xHi = Math.max(xFar, xNear);
    const bxs = [xLo + 3, xHi - 3, ...rafterXs.filter((x) => x > xLo + 9 && x < xHi - 9)].sort((a, c) => a - c);
    for (let i = 0; i + 1 < bxs.length; i++) if (bxs[i + 1] - bxs[i] > 30) bxs.splice(i + 1, 0, (bxs[i] + bxs[i + 1]) / 2);
    rain.bracketXs = bxs;
    slopes.forEach((sl, si) => {
      const zc = zg[si];
      const zFace = sl.zt - sl.dir * 0.75;
      const pcs = splitRange(xLo, xHi, [], 120, !sideR);
      for (const [s0, e0] of pcs) {
        rain.gutterPieces.push(e0 - s0);
        const cuts = [s0, e0];
        if (xo > s0 + 0.5 && xo < e0 - 0.5) cuts.splice(1, 0, xo);
        for (let i = 0; i + 1 < cuts.length; i++) {
          prismX(arc(GR - 0.1, GR, zc), cuts[i], cuts[i + 1], rim(cuts[i]), rim(cuts[i + 1]), { ...gO, name: 'PVC gutter 5"', info: `piece ${ftin(e0 - s0)}` });
        }
      }
      for (let i = 1; i < pcs.length; i++) {
        const x = pcs[i][0];
        prismX(arc(GR, GR + 0.15, zc), x - 1.5, x + 1.5, rim(x - 1.5), rim(x + 1.5), { ...gO, name: 'Gutter joiner' });
        rain.joiners++;
      }
      for (const x of [xLo, xHi]) {
        prismX(disc(GR, zc), x - 0.08, x + 0.08, rim(x), rim(x), { ...gO, name: 'Gutter stop end' });
        rain.ends++;
      }
      b.cyl(xo, zc, PR + 0.25, outletTop - 2.5, outletTop + 0.3, { ...gO, name: 'Gutter drop outlet' });
      rain.outlets++;
      for (const x of bxs) {
        const r0 = rim(x);
        const [za, zb] = [zFace, zFace - sl.dir * 0.12].sort((a, c) => a - c);
        b.box(x - 0.5, x + 0.5, r0 - 1.6, r0 + 0.4, za, zb, { ...gO, name: 'Gutter bracket' });
        const [zc0, zc1] = [zFace, zc - sl.dir * (GR + 0.2)].sort((a, c) => a - c);
        b.box(x - 0.5, x + 0.5, r0 + 0.25, r0 + 0.4, zc0, zc1, { ...gO, name: 'Gutter bracket' });
        for (const dy of [-1.1, -0.1]) b.fasten('woodScrew', V(x, r0 + dy, zFace - sl.dir * 0.12), V(0, 0, -sl.dir), { group: 'gutters', step: STEP.GUTTERS, ex: [0, 0, 0], name: 'Stainless screw (gutter bracket)' });
        rain.brackets++;
        rain.screws += 2;
      }
      // downpipe from the outlet, elbow, then the header along the end wall
      rod(V(xo, outletTop - 2, zc), V(xo, yH0, zc), PR, { ...pO, name: '3" PVC downpipe' });
      const hd = V(0, yHm - yH0, zT - zc).normalize();
      fit(V(xo, yH0, zc), [UP, hd], { ...pO, name: '3" PVC elbow' });
      rain.elbows++;
      rod(V(xo, yH0, zc), V(xo, yHm, zT), PR, { ...pO, name: '3" PVC rain header along the end wall', info: `falls ${inch(yH0 - yHm)} toward the tank` });
      pipeLen(outletTop - 2 - yH0);
      pipeLen(Math.abs(zT - zc));
    });
    // standoff blocks and straps on the end-wall columns
    for (const [ca, cc] of tw.cols) {
      const zm = toW(tw, (ca + cc) / 2, 0, 0).z;
      const yh = yHdr(zm);
      if (yh - y0 < PH + 4 || yh - y0 > Rb - 3) continue;
      const [xa, xb] = [xEnd, xEnd + sx * 1.5].sort((a, c) => a - c);
      b.lumberBox('2x4', xa, xb, yh - 2, yh + 2, zm - 1.75, zm + 1.75, { cat: 'framing', group: 'gutters', step: STEP.GUTTERS, ex: [0, 0, 0], name: 'Standoff block for the rain pipe' });
      rod(V(xo, yh, zm - 0.4), V(xo, yh, zm + 0.4), PR + 0.06, { mat: 'steel', group: 'gutters', step: STEP.GUTTERS, ex: [0, 0, 0], name: 'Galv. pipe strap 3"' });
      for (const dy of [-1.3, 1.3]) b.fasten('conScrew', V(xEnd + sx * 1.5, yh + dy, zm + 0.9), V(sx, 0, 0), { group: 'gutters', step: STEP.GUTTERS, ex: [0, 0, 0], name: 'Concrete screw 1/4" × 3-1/4"' });
      rain.straps++;
      rain.strapZs.push(zm);
      rain.screws += 2;
    }
    const tee = V(xo, yHm, zT);
    fit(tee, [V(0, 0, 1), V(0, 0, -1), V(sx, 0, 0)], { ...pO, name: '3" PVC tee where the two headers meet' });
    rain.tees++;

    // tank base: courses of 6" block round compacted fill, under a slab
    const tO = { group: 'tank', step: STEP.TANK, ex: [0, 0, 0] };
    const [px0, px1] = [xEnd + sx * 12, xEnd + sx * (12 + S)].sort((a, c) => a - c);
    const pz0 = zT - S / 2;
    const pz1 = zT + S / 2;
    const blockPieces = [];
    const bO = { ...tO, mat: 'block', name: '6" hollow concrete block' };
    const bt = 5.625;
    const run = (s0, s1, fn) => {
      for (let s = s0; s < s1 - 0.5; s += BLOCK.len + BLOCK.joint) {
        const e = Math.min(s + BLOCK.len, s1);
        blockPieces.push(e - s);
        fn(s, e);
      }
    };
    for (let j = 0; j < k; j++) {
      const ya = j * 8;
      const yb = ya + BLOCK.h;
      const xFull = j % 2 === 0;
      for (const [za, zb] of [[pz0, pz0 + bt], [pz1 - bt, pz1]]) run(xFull ? px0 : px0 + 6, xFull ? px1 : px1 - 6, (s0, e0) => b.box(s0, e0, ya, yb, za, zb, bO));
      for (const [xa, xb] of [[px0, px0 + bt], [px1 - bt, px1]]) run(xFull ? pz0 + 6 : pz0, xFull ? pz1 - 6 : pz1, (s0, e0) => b.box(xa, xb, ya, yb, s0, e0, bO));
    }
    if (k) b.box(px0 + bt, px1 - bt, 0, 8 * k, pz0 + bt, pz1 - bt, { ...tO, mat: 'fill', name: 'Compacted sand / coral fill inside the blocks' });
    const ys = 8 * k;
    const rebarPieces = [];
    const nb = Math.floor((S - 6) / 12) + 1;
    const rO = { ...tO, mat: 'rebar', name: '#4 rebar, 12" each way' };
    for (let i = 0; i < nb; i++) {
      const t = 3 + ((S - 6) * i) / (nb - 1);
      b.box(px0 + 3, px1 - 3, ys + slabT / 2 - 0.5, ys + slabT / 2, pz0 + t - 0.25, pz0 + t + 0.25, rO);
      b.box(px0 + t - 0.25, px0 + t + 0.25, ys + slabT / 2, ys + slabT / 2 + 0.5, pz0 + 3, pz1 - 3, rO);
      rebarPieces.push(S - 6, S - 6);
    }
    b.box(px0, px1, ys, base, pz0, pz1, { ...tO, mat: 'slab', name: `Tank base slab, ${inch(slabT)} thick` });
    for (let i = 0; i < 4; i++) b.lumber.push({ size: '2x6', len: S + 3, cat: 'tank', label: 'Tank base edge form (2x6)' });

    // the tank, with a domed top
    const tankO = { ...tO, mat: 'tank', name: `${P.tankGal}-gal poly water tank`, info: `${inch(TK.d)} across × ${ftin(TK.h)} tall; ${num(P.tankGal * 8.34)} lb of water when full` };
    const r = TK.d / 2;
    b.cyl(xT, zT, r, base, base + TK.h - 6, tankO);
    b.cyl(xT, zT, r * 0.94, base + TK.h - 6, base + TK.h - 3.5, tankO);
    b.cyl(xT, zT, r * 0.78, base + TK.h - 3.5, base + TK.h - 1.5, tankO);
    b.cyl(xT, zT, r * 0.5, base + TK.h - 1.5, base + TK.h - 0.6, tankO);
    b.cyl(xT, zT, 8, base + TK.h - 0.6, base + TK.h, { ...tO, mat: 'tank', name: 'Tank lid with inlet strainer' });
    const tp = { ...tO, mat: 'pvcPipe' };
    // out from the tee, over the first-flush chamber, to above the tank
    rod(tee, V(xT, yOut(xT), zT), PR, { ...tp, name: '3" PVC pipe to the tank' });
    pipeLen(Math.abs(xFF - xo));
    pipeLen(Math.abs(xT - xFF));
    fit(V(xFF, yOut(xFF), zT), [V(sx, 0, 0), V(-sx, 0, 0), UP.clone().negate()], { ...tp, name: '3" PVC tee for the first-flush chamber' });
    rain.tees++;
    rod(V(xFF, yOut(xFF), zT), V(xFF, 16, zT), PR, { ...tp, name: 'First-flush chamber', info: 'fills with the dirtiest water off the roof before any reaches the tank' });
    pipeLen(yOut(xFF) - 16);
    rod(V(xFF, 13.5, zT), V(xFF, 16.5, zT), PR + 0.3, { ...tp, name: 'Cleanout plug with a 1/8" drip hole' });
    fit(V(xT, yOut(xT), zT), [V(sx, 0, 0), UP.clone().negate()], { ...tp, name: '3" PVC elbow' });
    rain.elbows++;
    if (yOut(xT) - (base + TK.h - 1) > 1) {
      rod(V(xT, yOut(xT), zT), V(xT, base + TK.h - 1, zT), PR, { ...tp, name: '3" PVC pipe into the tank inlet' });
      pipeLen(yOut(xT) - (base + TK.h - 1));
    }
    // overflow, screened, led down to the ground
    const yOv = base + TK.h - 9;
    const xOv = xT + sx * (S / 2 + 4);
    rod(V(xT + sx * (r - 1), yOv, zT), V(xOv, yOv, zT), PR, { ...tp, name: 'Overflow pipe' });
    fit(V(xOv, yOv, zT), [V(sx, 0, 0), UP.clone().negate()], { ...tp, name: '3" PVC elbow' });
    rain.elbows++;
    rod(V(xOv, yOv, zT), V(xOv, 4, zT), PR, { ...tp, name: 'Overflow pipe, down to the ground' });
    rod(V(xOv, 3.6, zT), V(xOv, 4.1, zT), PR + 0.15, { ...tO, mat: 'screen', name: 'Insect screen tied over the overflow' });
    pipeLen(Math.abs(xOv - xT) - r + 1);
    pipeLen(yOv - 4);
    // tap on a nipple that reaches past the edge of the base
    const zTap = zT + S / 2 + 3;
    rod(V(xT, tapH, zT + r - 1), V(xT, tapH, zTap), 0.53, { ...tO, mat: 'steel', name: '3/4" outlet fitting and nipple' });
    b.box(xT - 0.6, xT + 0.6, tapH - 0.7, tapH + 1.6, zTap - 0.4, zTap + 0.9, { ...tO, mat: 'brass', name: 'Brass tap' });
    rod(V(xT, tapH - 0.5, zTap + 0.6), V(xT, tapH - 2, zTap + 0.6), 0.35, { ...tO, mat: 'brass', name: 'Brass tap' });

    const ffGal = (Math.PI * 1.52 ** 2 * (yOut(xFF) - 16)) / 231;
    tank = {
      gal: P.tankGal, d: TK.d, h: TK.h, lb: TK.lb, S, k, slabT, base, tapH, x: xT, z: zT, room, ffGal,
      blocks: blockPieces, rebar: rebarPieces,
      concreteFt3: (S * S * slabT) / 1728,
      mortarFt3: blockPieces.length * 0.025,
      fillFt3: k ? ((S - 2 * bt) ** 2 * 8 * k) / 1728 : 0,
    };
    Object.assign(rain, { sideR, sx, xEnd, xFar, xNear, xo, xFF, GR, PR, gFall, pFall, yf, rimHi, rimLo, outletTop, yH0, yHm, yIn, zg, wall: tw.key, plinth: { x0: px0, x1: px1, z0: pz0, z1: pz1 } });
  }

  // ---------------------------------------------------------------- quantities
  // fastener counts are the hardware actually placed in the model
  b.flushHardware();
  const hc = (k) => b.hwCount[k] || 0;
  const n16 = hc('nail16');
  const n8 = hc('nail8');
  const nTie = hc('tieNail');
  const nPanel = hc('panelNail');
  const roofFast = hc('roofScrew');
  const wedge = hc('wedge');
  const screws = hc('conScrew');
  // where corrugated sheet meets concrete: along the pony wall, the columns
  // and the ring beam in every bay, and under the gables
  let sealIn = 0;
  for (const w of Object.values(walls)) {
    for (const [a, c] of w.bays) sealIn += 2 * (c - a) + 2 * (Rb - PH + 1.5);
    for (const [g0, g1] of w.covered) sealIn += 2 * PH + (g1 - g0);
    if (w.sideTop) sealIn += w.L;
  }
  const sealFt = sealIn / 12;

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
  const nCov = Object.values(walls).reduce((n, w) => n + w.covered.length, 0);
  const covText = nCov ? ` ${nCov} existing door gap${nCov > 1 ? 's are' : ' is'} closed up instead of getting a door: a 2x4 plate on the floor, studs down to it, and a nailer level with the pony-wall top, then tin outside and plywood inside like the rest of the wall.` : '';
  const steps = [
    { title: 'Existing concrete frame', text: `Already built: a ${ftin(W)} × ${ftin(D)} concrete outline, ${inch(Pt)} thick. On it are pony walls ${ftin(PH)} high and ${nColumns} columns (${inch(C)} × ${inch(C)}: the corners plus ${m} along each wall), with a ${inch(P.ringH)} ring beam whose underside is ${ftin(Rb)} above the floor. Before ordering, check: both diagonals ${ftin(diag)}; the clear bays between columns (long walls ${bayList}; end walls ${endBays}); and the ring-beam height. Adjust the inputs to match what was actually poured.` },
    slab ? { title: 'Prepare the floor', text: `Fill inside the outline with compacted sand or coral to ${ftin(T)} below the finished floor. Lay 6-mil plastic, then ${mesh.length} strips of 6" × 6" #10 galvanised wire mesh, ${ftin(mesh[0] || 0)} long, running ${meshDir === 'x' ? 'along the house' : 'across the house'}. Lap the strips one square (6") and tie the laps with wire. Set the mesh on small blocks or pull it up into the middle of the slab as you pour, so it isn't left at the bottom.` } : { title: 'Floor (not included)', text: 'No floor slab is included in this design. Turn it on under "Floor slab" to add it to the plan and the bill of materials.' },
    slab ? { title: 'Pour the floor slab', text: `Pour a ${inch(T)} floor slab inside the outline — ${num(concreteFt3)} ft³, about ${Math.ceil(cementNet)} bags of cement. The pony walls act as the form. Leave the door thresholds flush and slope the floor slightly toward the doors. Keep it damp for a week.` } : { title: 'Floor (not included)', text: 'Skipped.' },
    { title: 'Wall plates', text: `Bolt a 2x6 wall plate flat on top of the ring beam with 1/2" wedge anchors about every 32" (${wedge} anchors) — the rafters sit on this. In every bay, fasten a 2x4 bottom plate to the pony wall and a 2x4 top plate to the underside of the ring beam, using concrete screws (drill with a hammer drill). Put a strip of plastic or bitumen under any wood that touches concrete.` },
    { title: 'Infill the long walls', text: `Frame each bay between the columns. Studs at ${inch(P.studSpacing)} on centre are screwed to the columns at each end, with ${blockLevels.length} row${blockLevels.length > 1 ? 's' : ''} of flat blocking for the siding. Front wall: ${count('front', 'door')} doors, ${count('front', 'window')} windows. Back wall: ${count('back', 'door')} door${count('back', 'door') === 1 ? '' : 's'}, ${count('back', 'window')} windows. The ring beam carries the roof, so openings need only a flat 2x4 head, not a header.${covText}` },
    { title: 'Infill the end walls', text: `Frame the end-wall bays the same way: ${count('left', 'door')} door and ${count('left', 'window')} windows in each. The louvre rough opening is ${ftin(winRO.w)} × ${ftin(winRO.h)}, with the sill at ${ftin(sill)}. Windows are never more than ${ftin(S)} apart.` },
    { title: 'Roof framing', text: `Gable roof at ${P.pitch}:12. Set the 2x6 ridge on temporary props, then fit ${rafterXs.length} pairs of ${rafterSize} rafters at ${inch(P.rafterSpacing)} on centre. Each rafter is birdsmouthed onto the wall plate, plumb-cut at the tail for the fascia, and tied down with a hurricane tie. Add 2x4 ceiling ties on alternate pairs, nailed to the rafters at each wall${D > 192 ? '. A tie is longer than a 16\' board, so it comes in two pieces butted together, with a 4\' 2x4 scab nailed across the joint (12 nails, 6 each side)' : ''}. Frame the gable ends above the ring beam with studs.` },
    { title: 'Purlins', text: `Nail 2x4 purlins flat across the rafters, ${slopes.map((s) => s.purlins).join(' + ')} rows at no more than ${inch(P.purlinSpacing)} apart, overhanging the gable ends by ${inch(R)}.${screensOn ? ' Fill the gaps between the purlins over each end rafter with flat 2x4 blocks, so insects can\'t get in along the top of the gables.' : ''}` },
    { title: 'Roofing', text: `Lay ${tinPieces.filter((t) => t.use === 'roof').length} pieces of ${clad === 'pvc' ? 'PVC' : 'galvanised metal'} sheet, starting at the end away from the prevailing wind. Lap one corrugation at the sides and ${inch(LAP)} at any end joints, and fasten through the crests.${screensOn ? ' Fill the corrugations over both eave purlins with canned foam as you go.' : ''} Finish with the ridge cap${screensOn ? ', with foam in the corrugations under both edges' : ''}. Each inch of rain on the ${num(roofPlanFt2)} sq ft roof yields about ${num(rainGal)} gallons.` },
    { title: 'Siding', text: `Clad each bay with vertical ${clad === 'pvc' ? 'PVC' : 'metal'} sheets from just below the pony-wall top up to the ring beam, lapping 1-1/2" over the concrete so water runs off. Closed door gaps get a lower sheet tucked behind the panel above. Clad the gable triangles above the ring beam too (${tinPieces.filter((t) => t.use === 'siding').length} pieces in total). Seal the joints where tin meets concrete.` },
    { title: 'Louvre windows', text: `Fit ${nWin} ${P.windowH}' aluminium louvre frames and ${winList.reduce((s, x) => s + x.blades, 0)} ${P.windowW}' glass blades, then trim with 1x4 casing.` },
    { title: 'Doors', text: `Hang ${nDoors} doors (${doorDesc}), each ${inch(P.doorW)} × ${ftin(leafH)}. Each sits in a gap in the pony wall. The 1x6 jambs are screwed to the concrete below and to the king studs above. Doors are vertical 1x6 boards with a 1x4 Z-brace, on three galvanised T-hinges, with a hasp.` },
    { title: 'Interior walls', text: `Line the inside of the infill panels with ${wallPlyPieces.length} pieces of ${PLY[P.wallPly].name}. The concrete columns, pony walls and ring beam stay exposed (paint them if you like). The roof space stays open for ventilation.` },
    screensOn
      ? { title: 'Insect screens', text: `Build ${scr.windows.length} hinged 1x3 screen frames and hang one inside each louvre window, over the plywood, so it swings open to reach the louvre handle.${scr.soffit.length ? ` Staple screen under the rafter tails along both eaves, from the fascia back to the wall, folding the back edge up onto the wall plate.` : ''} With the foam at the eaves and ridge and the blocks over the gables, insects can only get in through the doors.` }
      : { title: 'Insect screens (not included)', text: 'No insect screens in this design. Turn them on under "Screens & rainwater" to add them.' },
    rainOn
      ? { title: 'Gutters', text: `Hang 5" PVC gutters on brackets along both eaves (${rain.brackets} brackets), falling 1/2" every 10' toward the ${rain.wall} end. At that end a drop outlet on each gutter feeds a 3" downpipe; the two pipes run along the ${rain.wall} end wall on standoff blocks and meet at a tee over the tank.` }
      : { title: 'Gutters (not included)', text: 'No gutters in this design. Turn them on under "Screens & rainwater" to add them and the water tank.' },
    rainOn
      ? { title: 'Water tank', text: `Build a ${ftin(tank.S)} square base${tank.k ? ` of ${tank.k} course${tank.k > 1 ? 's' : ''} of 6" block filled with compacted coral, under` : ' from'} a ${inch(tank.slabT)} slab — ${ftin(tank.base)} high in all, so the top of the tank sits below the pipes. Set the ${tank.gal}-gal tank on it, with the pipe running in through a first-flush chamber that catches the dirtiest water off the roof. Fit the tap on a nipple that reaches past the edge of the base, and screen the overflow. Each inch of rain on the ${num(roofPlanFt2)} sq ft roof yields about ${num(rainGal)} gallons, so ${num(tank.gal / rainGal, 1)}" of rain fills the tank.` }
      : { title: 'Water tank (not included)', text: 'Skipped.' },
    { title: 'Complete', text: `Finished: a ${ftin(W)} × ${ftin(D)} house on the existing concrete frame, with a gable ${clad === 'pvc' ? 'PVC' : 'metal'} roof, ${nWin} louvre windows and ${nDoors} doors${screensOn ? ', insect screens' : ''}${rainOn ? `, and gutters feeding a ${tank.gal}-gal water tank` : ''}.${!screensOn || !rainOn ? ` Recommended extras: ${[!screensOn && 'insect screens', !rainOn && 'gutters and a water tank'].filter(Boolean).join(', ')}.` : ''}` },
  ];

  const dims = [
    { a: [0, y0 + 0.3, D + 18], b: [W, y0 + 0.3, D + 18], label: ftin(W) },
    { a: [W + 18, y0 + 0.3, 0], b: [W + 18, y0 + 0.3, D], label: ftin(D) },
  ];

  return {
    P, W, D, parts: b.parts, steps, dims, warnings,
    bounds: {
      min: [Math.min(-R - 40, rainOn ? rain.plinth.x0 - 40 : 0), footBot, -E - 40],
      max: [Math.max(W + R + 40, rainOn ? rain.plinth.x1 + 40 : 0), roofTop(D / 2) + 12, D + E + 40],
    },
    q: {
      lumber: b.lumber, wallPly: { type: P.wallPly, pieces: wallPlyPieces }, tin: tinPieces, ridgePieces, windows: winList,
      concreteFt3, cementNet, mesh, plasticFt2, sealFt, wedge, screws, ties, n16, n8, nTie, nPanel, roofFast, doors: nDoors,
      screens: screensOn ? scr : null, rain: rainOn ? { ...rain, tank } : null,
    },
    // positions the step-by-step guide draws and measures from
    g: {
      y0, Pt, PH, C, Rb, ringTop, yTop, pw, E, R, pitch: P.pitch, p, cos, rd, zr, rafterSize, rafterLen, rafterXs, ridgeTop, ridgeBoards, tieXs,
      blockLevels, winRO, doorRO, leafH, sill, nCols, tinW, sidingLog, mesh, meshDir, T, sin, underside, rafterTop,
      scr: screensOn ? scr : null, rain: rainOn ? { ...rain, tank } : null,
      slopes: slopes.map((sl) => ({ key: sl.key, purlinS: sl.purlinS, top: sl.top, run: sl.run, Ls: sl.Ls })),
      purlinPieces: splitRange(-R, W + R, rafterXs, 192),
      walls: Object.fromEntries(Object.values(walls).map((w) => [w.key, {
        key: w.key, L: w.L, cols: w.cols, bays: w.bays, openings: w.openings, covered: w.covered, frame: w.frame, plate: w.plate, anchors: w.anchors, gable: w.gable,
      }])),
    },
    doorGrid: Object.fromEntries(Object.values(walls).map((w) => [w.key, w.bays.map(([a, c], i) => ({ width: c - a, fits: w.doorFits[i], door: w.openings.some((o) => o.type === 'door' && o.u0 >= a && o.u1 <= c), covered: w.covered.some(([g0, g1]) => g0 >= a && g1 <= c) }))])),
    info: {
      columns: nColumns, nCovered: Object.values(walls).reduce((n, w) => n + w.covered.length, 0), midPosts: m, rafterSize, diag, floorArea, roofPlanFt2, rainGal, sill, nWin, nDoors, concreteFt3,
      ridgeHeight: roofTop(D / 2), leafH, bayList, endBays,
    },
  };
}
