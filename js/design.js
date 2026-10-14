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
  width: 12, // ft
  depth: 8, // ft
  roof: 'gable', // 'gable' | 'shed'
  cladding: 'metal', // 'metal' | 'pvc'
  floorHeight: 36, // grade to top of floor, in
  wallHeight: 96, // floor to top of top plate at the eave, in
  pitch: 4, // rise per 12
  eave: 12, // eave overhang, in
  rake: 6, // gable/rake overhang, in
  postSpacing: 72, // max post spacing along beams, in
  joistSpan: 120, // max joist span before another beam line is added, in
  joistSpacing: 16,
  studSpacing: 24,
  rafterSpacing: 24,
  purlinSpacing: 24,
  embed: 36, // post embedment below grade, in
  holeDia: 16, // footing hole diameter, in
  floorPly: 'ply34x',
  wallPly: 'ply14',
  windowW: 3, // louvre blade length, ft
  windowH: 4, // louvre frame height, ft
  sill: 30, // window sill height above floor, in
  doorW: 32,
  doorH: 80,
  stairW: 36,
  tinCover: 30, // effective cover width of a corrugated sheet, in
  ovTin: 10,
  ovPly: 10,
  ovFraming: 10,
  ovPosts: 5,
  ovFasteners: 15,
  ovCement: 15,
  freight: 0, // $ per cubic foot
};

export const STEP = {
  SITE: 0, LAYOUT: 1, HOLES: 2, POSTS: 3, BEAMS: 4, JOISTS: 5, FLOOR: 6, STAIRS: 7,
  WALL_BACK: 8, WALL_FRONT: 9, WALL_ENDS: 10, ROOF_FRAME: 11, PURLINS: 12, ROOFING: 13,
  SIDING: 14, WINDOWS: 15, DOOR: 16, INTERIOR: 17, DONE: 18,
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

export function design(P) {
  const b = new Builder();
  const W = P.width * 12;
  const D = P.depth * 12;
  const shed = P.roof === 'shed';
  const p = P.pitch / 12;
  const theta = Math.atan(p);
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const Hf = P.floorHeight;
  const plyT = PLY[P.floorPly].t;
  const yJt = Hf - plyT;
  const yJb = yJt - 5.5;
  const yBt = yJb;
  const yBb = yBt - 5.5;
  const y0 = Hf;
  const H = P.wallHeight;
  const E = P.eave;
  const R = P.rake;
  const tinW = P.tinCover + 3;
  const warnings = [];

  const rafterSpanH = shed ? D - 7 : D / 2 - 3.5;
  const rafterSize = rafterSpanH > 84 ? '2x6' : '2x4';
  const rd = LUMBER[rafterSize].w;
  const yTop = y0 + H;
  const underside = (z) => (shed ? yTop + (z - 3.5) * p : yTop + (Math.min(z, D - z) - 3.5) * p);
  const rafterTop = (z) => underside(z) + rd / cos;
  const roofTop = (z) => rafterTop(z) + 1.5;
  const topBack = H;
  const topFront = shed ? H + (D - 7) * p : H;
  const endTop = (z) => (shed ? H + (Math.min(Math.max(z, 3.5), D - 3.5) - 3.5) * p : H);

  // Will shed rafters need a mid-span beam?
  const shedRafterLen = (D + 2 * E) / cos;
  const nRows = Math.max(2, Math.ceil(D / P.joistSpan) + 1);
  const roofBeams = shed && shedRafterLen > 192 && nRows > 2;
  if (shed && shedRafterLen > 192 && !roofBeams) warnings.push('Shed rafters are longer than 16 ft and will need to be spliced.');

  // ---------------------------------------------------------------- grid
  const nx = Math.max(2, Math.ceil(W / P.postSpacing) + 1);
  const xs = Array.from({ length: nx }, (_, i) => 2.75 + (i * (W - 5.5)) / (nx - 1));
  // The door is always centred in the front wall and framed between two
  // posts; other front posts shift out of its way.
  const doorRO = { w: P.doorW + 2, h: P.doorH + 1.5 };
  const doorC = W / 2;
  const dL = doorC - doorRO.w / 2 - 3;
  const dR = doorC + doorRO.w / 2 + 3;
  const fx0 = xs.filter((x, i) => i === 0 || i === nx - 1 || x + 2.75 < dL - 12 || x - 2.75 > dR + 12);
  fx0.push(dL - 2.75, dR + 2.75);
  fx0.sort((a, b) => a - b);
  const fxs = [fx0[0]];
  for (const x of fx0.slice(1)) {
    const last = fxs[fxs.length - 1];
    const n = Math.ceil((x - last) / (P.postSpacing * 1.15));
    for (let k = 1; k < n; k++) fxs.push(last + ((x - last) * k) / n);
    fxs.push(x);
  }

  const rows = [];
  for (let k = 0; k < nRows; k++) {
    const perim = k === 0 || k === nRows - 1;
    const zc = k === 0 ? 1.5 : k === nRows - 1 ? D - 1.5 : (D * k) / (nRows - 1);
    let pz, beams;
    if (k === 0) { pz = [0, 3]; beams = [[3, 4.5], [4.5, 6]]; } else if (k === nRows - 1) { pz = [D - 3, D]; beams = [[D - 6, D - 4.5], [D - 4.5, D - 3]]; } else { pz = [zc - 1.5, zc + 1.5]; beams = [[zc - 3, zc - 1.5], [zc + 1.5, zc + 3]]; }
    rows.push({ k, zc, perim, pz, beams, xs: k === nRows - 1 ? fxs : xs });
  }
  // ---------------------------------------------------------------- layout
  const tempStrings = { mat: 'string', group: 'temp', step: STEP.LAYOUT, stepTo: STEP.HOLES, name: 'Layout string line', temp: true, ex: [0, 0, 0] };
  const sy = 10;
  const st = 0.15;
  b.box(-0.05, 0.05, sy, sy + st, -30, D + 30, tempStrings);
  b.box(W - 0.05, W + 0.05, sy, sy + st, -30, D + 30, tempStrings);
  b.box(-30, W + 30, sy, sy + st, -0.05, 0.05, tempStrings);
  b.box(-30, W + 30, sy, sy + st, D - 0.05, D + 0.05, tempStrings);
  b.member(V(0, sy + 0.5, 0), V(W, sy + 0.5, D), { t: st, d: st }, UP, { ...tempStrings, name: 'Diagonal check string', mat: 'stringDiag' });
  b.member(V(W, sy + 0.5, 0), V(0, sy + 0.5, D), { t: st, d: st }, UP, { ...tempStrings, name: 'Diagonal check string', mat: 'stringDiag' });
  const stake = { ...tempStrings, mat: 'wood', name: 'Batter board' };
  for (const [cx, cz, dx, dz] of [[0, 0, -1, -1], [W, 0, 1, -1], [0, D, -1, 1], [W, D, 1, 1]]) {
    // L-shaped batter boards just outside each corner
    b.box(cx + dx * 18 - 12, cx + dx * 18 + 12, sy - 3.5, sy, cz + dz * 30 - 0.75, cz + dz * 30 + 0.75, stake);
    b.box(cx + dx * 30 - 0.75, cx + dx * 30 + 0.75, sy - 3.5, sy, cz + dz * 18 - 12, cz + dz * 18 + 12, stake);
    for (const [ox, oz] of [[dx * 30, dz * 30], [dx * 30, dz * 6], [dx * 6, dz * 30]]) {
      b.box(cx + ox - 0.75, cx + ox + 0.75, -6, sy + 2, cz + oz - 0.75, cz + oz + 0.75, { ...stake, name: 'Stake' });
    }
  }

  // ---------------------------------------------------------------- posts
  const posts = [];
  for (const row of rows) {
    row.xs.forEach((xc, i) => {
      const end = i === 0 || i === row.xs.length - 1;
      const tall = row.perim || end || roofBeams;
      let top;
      if (!tall) top = yBt;
      else if (row.k === 0) top = y0 + topBack - 3;
      else if (row.k === nRows - 1) top = y0 + topFront - 3;
      else if (end) top = y0 + endTop(row.zc) - 3;
      else top = underside(row.zc) - 5.5; // under a shed roof beam
      posts.push({ row, i, xc, x0: xc - 2.75, x1: xc + 2.75, z0: row.pz[0], z1: row.pz[1], top, tall, end });
    });
  }
  const bottom = -P.embed;
  let maxPost = 0;
  let shallow = 0;
  for (const po of posts) {
    // A post just over 16' is set a little shallower instead of spliced.
    const pb = po.top - bottom > 192 && po.top - bottom <= 200 ? po.top - 192 : bottom;
    if (pb !== bottom) shallow = Math.max(shallow, -pb);
    const L = po.top - pb;
    maxPost = Math.max(maxPost, L);
    // two laminated 2x6 plies, splices staggered
    [[po.z0, po.z0 + 1.5, 192], [po.z0 + 1.5, po.z1, 144]].forEach(([za, zb, split]) => {
      const cuts = L > 192 + 1e-6 ? [[pb, pb + split], [pb + split, po.top]] : [[pb, po.top]];
      for (const [ya, yb] of cuts) {
        b.lumberBox('2x6', po.x0, po.x1, ya, yb, za, zb, {
          name: po.tall ? 'Post ply (full height)' : 'Post ply (floor)', cat: 'structure', group: 'posts', step: STEP.POSTS, ex: [0, 0, 0],
        });
      }
    });
    // footing: hole, concrete with a crowned collar above grade, base wrap
    const r = P.holeDia / 2;
    b.cyl((po.x0 + po.x1) / 2, (po.z0 + po.z1) / 2, r, -0.2, 0.08, { mat: 'hole', name: 'Post hole', group: 'footing', step: STEP.HOLES, stepTo: STEP.HOLES, ex: [0, 0, 0] });
    b.cyl((po.x0 + po.x1) / 2, (po.z0 + po.z1) / 2, r, pb - 4, 2, { mat: 'concrete', name: `Concrete footing ⌀${inch(P.holeDia)}`, group: 'footing', step: STEP.POSTS, ex: [0, -1.2 * EX, 0] });
    b.box(po.x0 - 0.12, po.x1 + 0.12, -10, 6, po.z0 - 0.12, po.z1 + 0.12, { mat: 'wrap', name: 'Bitumen post-base wrap', group: 'posts', step: STEP.POSTS, ex: [0, 0, 0] });
  }
  if (shallow) warnings.push(`The tallest posts are set ${ftin(shallow)} deep (instead of ${ftin(P.embed)}) so they can be cut from one 16' board.`);
  if (maxPost > 192 + 1e-6) warnings.push(`Tallest post is ${ftin(maxPost)} — longer than 16 ft stock, so post plies are spliced (staggered).`);

  // temporary bracing on corner posts while concrete cures
  const corner = posts.filter((po) => po.row.perim && po.end);
  for (const po of corner) {
    const cx = (po.x0 + po.x1) / 2;
    const cz = (po.z0 + po.z1) / 2;
    const dx = po.xc < W / 2 ? -1 : 1;
    const dz = po.row.k === 0 ? -1 : 1;
    const o = { mat: 'wood', name: 'Temporary brace (reuse offcuts)', group: 'temp', step: STEP.POSTS, stepTo: STEP.JOISTS, temp: true, ex: [0, 0, 0] };
    b.member(V(cx + dx * 44, 0, cz), V(cx + dx * 4.5, 62, cz), { t: 1.5, d: 3.5 }, V(0, 0, 1), o);
    b.member(V(cx, 0, cz + dz * 44), V(cx, 62, cz + dz * 3.5), { t: 1.5, d: 3.5 }, V(1, 0, 0), o);
  }

  // ---------------------------------------------------------------- beams
  let bolts = 0;
  for (const row of rows) {
    const outward = row.k === 0 ? -1 : row.k === nRows - 1 ? 1 : 0;
    row.beams.forEach(([za, zb], ply) => {
      const segs = splitRange(0, W, row.xs, 192, ply === 1);
      for (const [s, e] of segs) {
        b.lumberBox('2x6', s, e, yBb, yBt, za, zb, { name: 'Floor beam ply', cat: 'structure', group: 'beams', step: STEP.BEAMS, ex: [0, 0.8 * EX, outward * 0.9 * EX] });
      }
    });
    bolts += row.xs.length * 2;
  }
  // Shed roof beams (only when the roof is deep enough to need them).
  if (roofBeams) {
    for (const row of rows.slice(1, -1)) {
      const yt = underside(row.zc);
      row.beams.forEach(([za, zb], ply) => {
        for (const [s, e] of splitRange(0, W, row.xs, 192, ply === 1)) {
          b.lumberBox('2x6', s, e, yt - 5.5, yt, za, zb, { name: 'Roof beam ply', cat: 'structure', group: 'roof', step: STEP.ROOF_FRAME, ex: [0, 6 * EX, 0] });
        }
      });
      bolts += row.xs.length * 2;
    }
  }

  // ---------------------------------------------------------------- joists
  const tallPosts = posts.filter((po) => po.tall);
  const joistOpt = { cat: 'framing', group: 'joists', step: STEP.JOISTS, ex: [0, 1.8 * EX, 0] };
  const interiorZ = rows.slice(1, -1).map((r) => r.zc);
  const midJoists = [];
  for (let c = P.joistSpacing; c < W - 1.5 - 4; c += P.joistSpacing) {
    let x = c;
    for (const po of posts) {
      if (!po.tall) continue;
      if (po.row.perim && overlaps(x - 0.75, x + 0.75, po.x0, po.x1)) x = po.x1 + 0.75;
    }
    if (x + 0.75 > W - 1.5) continue;
    midJoists.push(x);
  }
  let joistPieces = 0;
  for (const x of midJoists) {
    for (const [s, e] of splitRange(1.5, D - 1.5, interiorZ, 192)) {
      b.lumberBox('2x6', x - 0.75, x + 0.75, yJb, yJt, s, e, { ...joistOpt, name: 'Floor joist' });
      joistPieces++;
    }
  }
  for (const [xa, xb, left] of [[0, 1.5, true], [W - 1.5, W, false]]) {
    const holes = posts.filter((po) => po.end && po.xc < W / 2 === left && po.tall && !po.row.perim).map((po) => [po.z0, po.z1]);
    for (const [s0, e0] of subtract(3, D - 3, holes)) {
      for (const [s, e] of splitRange(s0, e0, interiorZ, 192)) {
        b.lumberBox('2x6', xa, xb, yJb, yJt, s, e, { ...joistOpt, name: 'End joist' });
        joistPieces++;
      }
    }
  }
  for (const [za, zb, k] of [[0, 1.5, 0], [D - 1.5, D, nRows - 1]]) {
    const holes = posts.filter((po) => po.row.k === k).map((po) => [po.x0, po.x1]);
    for (const [s0, e0] of subtract(0, W, holes)) {
      for (const [s, e] of splitRange(s0, e0, [], 192)) {
        b.lumberBox('2x6', s, e, yJb, yJt, za, zb, { ...joistOpt, name: 'Rim joist', ex: [0, 1.8 * EX, (k ? 1 : -1) * 0.5 * EX] });
      }
    }
  }
  let ties = (midJoists.length + 2) * nRows;

  // ---------------------------------------------------------------- floor
  const floorPieces = [];
  const floorOpt = { mat: 'plyFloor', name: PLY[P.floorPly].name + ' floor sheet', group: 'floor', step: STEP.FLOOR, ex: [0, 2.8 * EX, 0] };
  for (let r = 0, z = 0; z < D - 0.5; r++, z += 48) {
    const z1 = Math.min(z + 48, D);
    const off = r % 2 ? 48 : 0;
    for (let x = -off; x < W - 0.5; x += 96) {
      const xa = Math.max(0, x);
      const xb = Math.min(W, x + 96);
      if (xb - xa < 0.5) continue;
      b.box(xa + 0.06, xb - 0.06, yJt, Hf, z + 0.06, z1 - 0.06, { ...floorOpt, info: `${ftin(xb - xa)} × ${ftin(z1 - z)}` });
      floorPieces.push({ w: xb - xa, h: z1 - z });
    }
  }

  // ---------------------------------------------------------------- walls
  const mkWall = (key, O, U, n, L, ua, ub, top, sideTop, step) => ({ key, O, U, n, L, ua, ub, top, sideTop, step, posts: [], openings: [] });
  const walls = {
    back: mkWall('back', V(W, y0, 0), V(-1, 0, 0), V(0, 0, -1), W, 0, W, () => topBack, () => topBack, STEP.WALL_BACK),
    front: mkWall('front', V(0, y0, D), V(1, 0, 0), V(0, 0, 1), W, 0, W, () => topFront, () => topFront, STEP.WALL_FRONT),
    left: mkWall('left', V(0, y0, 0), V(0, 0, 1), V(-1, 0, 0), D, 3.5, D - 3.5, (u) => endTop(u), (u) => rafterTop(u) - y0, STEP.WALL_ENDS),
    right: mkWall('right', V(W, y0, D), V(0, 0, -1), V(1, 0, 0), D, 3.5, D - 3.5, (u) => endTop(D - u), (u) => rafterTop(D - u) - y0, STEP.WALL_ENDS),
  };
  const toW = (w, u, v, d) => w.O.clone().addScaledVector(w.U, u).addScaledVector(UP, v).addScaledVector(w.n, -d);
  const wallBox = (w, u0, u1, v0, v1, d0, d1) => {
    const a = toW(w, u0, v0, d0);
    const c = toW(w, u1, v1, d1);
    return [Math.min(a.x, c.x), Math.max(a.x, c.x), Math.min(a.y, c.y), Math.max(a.y, c.y), Math.min(a.z, c.z), Math.max(a.z, c.z)];
  };
  const wallEx = (w, out, layer) => [w.n.x * out * EX, layer * EX, w.n.z * out * EX];

  for (const po of tallPosts) {
    if (po.row.k === 0) walls.back.posts.push([W - po.x1, W - po.x0]);
    else if (po.row.k === nRows - 1) walls.front.posts.push([po.x0, po.x1]);
    if (!po.row.perim && po.end && po.xc < W / 2) walls.left.posts.push([po.z0, po.z1]);
    if (!po.row.perim && po.end && po.xc > W / 2) walls.right.posts.push([D - po.z1, D - po.z0]);
  }

  // Openings ---------------------------------------------------------
  const winRO = { w: P.windowW * 12 + 1, h: P.windowH * 12 + 1 };
  let sill = P.sill;
  if (sill + winRO.h + 5.5 > H - 4.5) {
    sill = Math.max(12, H - 4.5 - 5.5 - winRO.h);
    warnings.push(`Window sill lowered to ${inch(sill)} to fit under the wall plate.`);
  }
  const rowCenters = rows.map((r) => (r.k === 0 ? 1.5 : r.k === nRows - 1 ? D - 1.5 : r.zc));
  const windows = [];
  for (let k = 0; k < nRows - 1; k++) {
    const zc = (rowCenters[k] + rowCenters[k + 1]) / 2;
    const half = winRO.w / 2;
    if (rowCenters[k + 1] - rowCenters[k] - 3 < winRO.w + 6) continue;
    walls.left.openings.push({ type: 'window', u0: zc - half, u1: zc + half, v0: sill, v1: sill + winRO.h });
    walls.right.openings.push({ type: 'window', u0: D - zc - half, u1: D - zc + half, v0: sill, v1: sill + winRO.h });
  }
  // Extra windows in the back wall of longer houses.
  if (nx - 1 >= 3) {
    for (let i = 1; i < nx - 1; i += 2) {
      const xc = (xs[i] + xs[i + 1]) / 2;
      if (xs[i + 1] - xs[i] - 5.5 < winRO.w + 6) continue;
      walls.back.openings.push({ type: 'window', u0: W - xc - winRO.w / 2, u1: W - xc + winRO.w / 2, v0: sill, v1: sill + winRO.h });
    }
  }
  walls.front.openings.push({ type: 'door', u0: doorC - doorRO.w / 2, u1: doorC + doorRO.w / 2, v0: 0, v1: doorRO.h });

  // Framing ------------------------------------------------------------
  const blockLevels = [];
  const nLev = Math.max(1, Math.round(H / 32) - 1);
  for (let j = 1; j <= nLev; j++) blockLevels.push((H * j) / (nLev + 1));
  let studCount = 0;
  for (const w of Object.values(walls)) {
    const fo = { cat: 'framing', group: 'wall', step: w.step, ex: wallEx(w, 0.6, 3.8) };
    const add = (name, size, u0, u1, v0, v1, d0, d1, extra = {}) => {
      const [x0, x1, yy0, yy1, z0, z1] = wallBox(w, u0, u1, v0, v1, d0, d1);
      return b.lumberBox(size, x0, x1, yy0, yy1, z0, z1, { ...fo, name, ...extra });
    };
    const sloped = Math.abs(w.top(w.ua) - w.top(w.ub)) > 0.01;
    const doorHoles = w.openings.filter((o) => o.type === 'door').map((o) => [o.u0, o.u1]);
    // bottom plate (between posts, not across the door)
    for (const [s0, e0] of subtract(w.ua, w.ub, [...w.posts, ...doorHoles])) {
      for (const [s, e] of splitRange(s0, e0, [], 192)) add('Bottom plate', '2x4', s, e, 0, 1.5, 0, 3.5);
    }
    // double top plate
    for (const layer of [0, 1]) {
      if (!sloped) {
        const vt = w.top(w.ua) - 1.5 * layer;
        for (const [s, e] of splitRange(w.ua, w.ub, [], 192, layer === 1)) add(layer ? 'Top plate (lower)' : 'Top plate (upper)', '2x4', s, e, vt - 1.5, vt, 0, 3.5);
      } else {
        const off = 0.75 + 1.5 * layer;
        const a = toW(w, w.ua, w.top(w.ua) - off / cos, 1.75);
        const c = toW(w, w.ub, w.top(w.ub) - off / cos, 1.75);
        b.member(a, c, '2x4', w.n, { ...fo, name: 'Raked top plate' });
      }
    }
    // studs
    const vertical = [...w.posts.map(([a, bb]) => [a, bb])];
    const zones = w.openings.map((o) => [o.u0 - 3, o.u1 + 3]);
    const cands = new Set([w.ua + 0.75, w.ub - 0.75]);
    for (let c = 0; c <= w.L; c += P.studSpacing) if (c > w.ua + 3 && c < w.ub - 3) cands.add(c);
    for (const c of [...cands].sort((x, y) => x - y)) {
      const u0 = c - 0.75;
      const u1 = c + 0.75;
      if (w.posts.some(([a, bb]) => overlaps(u0 - 1, u1 + 1, a, bb))) continue;
      if (zones.some(([a, bb]) => overlaps(u0, u1, a, bb))) continue;
      add('Stud', '2x4', u0, u1, 1.5, w.top(c) - 3, 0, 3.5);
      vertical.push([u0, u1]);
      studCount++;
    }
    // openings
    for (const o of w.openings) {
      const { u0, u1, v0, v1 } = o;
      add('King stud', '2x4', u0 - 3, u0 - 1.5, 1.5, w.top(u0) - 3, 0, 3.5);
      add('King stud', '2x4', u1 + 1.5, u1 + 3, 1.5, w.top(u1) - 3, 0, 3.5);
      vertical.push([u0 - 3, u0 - 1.5], [u1 + 1.5, u1 + 3]);
      add('Trimmer stud', '2x4', u0 - 1.5, u0, 1.5, v1, 0, 3.5);
      add('Trimmer stud', '2x4', u1, u1 + 1.5, 1.5, v1, 0, 3.5);
      add('Header ply', '2x6', u0 - 1.5, u1 + 1.5, v1, v1 + 5.5, 0, 1.5);
      add('Header ply', '2x6', u0 - 1.5, u1 + 1.5, v1, v1 + 5.5, 2, 3.5);
      const grid = [];
      for (let c = 0; c <= w.L; c += P.studSpacing) if (c > u0 + 1 && c < u1 - 1) grid.push(c);
      if (!grid.length) grid.push((u0 + u1) / 2);
      for (const c of grid) {
        const tv = w.top(c) - 3;
        if (tv - (v1 + 5.5) > 2) add('Cripple stud', '2x4', c - 0.75, c + 0.75, v1 + 5.5, tv, 0, 3.5);
        if (o.type === 'window' && v0 - 1.5 - 1.5 > 2) add('Cripple stud', '2x4', c - 0.75, c + 0.75, 1.5, v0 - 1.5, 0, 3.5);
      }
      if (o.type === 'window') add('Rough sill', '2x4', u0, u1, v0 - 1.5, v0, 0, 3.5);
    }
    // blocking rows (nailers for vertical corrugated siding)
    vertical.sort((x, y) => x[0] - y[0]);
    for (const lv of blockLevels) {
      for (let i = 0; i + 1 < vertical.length; i++) {
        const s = vertical[i][1];
        const e = vertical[i + 1][0];
        if (e - s < 3) continue;
        const gc = (s + e) / 2;
        if (w.openings.some((o) => gc > o.u0 - 1.5 && gc < o.u1 + 1.5)) continue;
        add('Blocking / girt', '2x4', s, e, lv - 0.75, lv + 0.75, 0, 3.5);
      }
    }
    // gable-end studs above the plate
    if (!shed && (w.key === 'left' || w.key === 'right')) {
      for (let c = P.studSpacing; c < w.L; c += P.studSpacing) {
        if (c < 6 || c > w.L - 6) continue;
        const z = w.key === 'left' ? c : D - c;
        const hgt = underside(z) - y0 - H;
        if (hgt < 3) continue;
        const [x0, x1, yy0, yy1, z0, z1] = wallBox(w, c - 0.75, c + 0.75, H, H + hgt, 0, 3.5);
        b.lumberBox('2x4', x0, x1, yy0, yy1, z0, z1, { cat: 'framing', name: 'Gable stud', group: 'roof', step: STEP.ROOF_FRAME, ex: wallEx(w, 0.6, 6) });
      }
    }
  }
  ties += tallPosts.filter((po) => po.row.perim || po.end).length; // post-to-plate straps

  // ---------------------------------------------------------------- roof framing
  const rafterXs = [0.75];
  for (let c = 0.75 + P.rafterSpacing; c < W - 0.75 - 6; c += P.rafterSpacing) rafterXs.push(c);
  rafterXs.push(W - 0.75);
  const roofEx = [0, 6 * EX, 0];
  const rafterOpt = { cat: 'framing', group: 'roof', step: STEP.ROOF_FRAME, ex: roofEx, name: `Rafter (${rafterSize})` };
  const nBack = V(0, cos, -sin);
  const nFront = V(0, cos, sin);
  if (!shed) {
    for (const x of rafterXs) {
      for (const [z0, z1, nrm] of [[-E, D / 2 - 0.75, nBack], [D + E, D / 2 + 0.75, nFront]]) {
        const a = V(x, underside(z0), z0).addScaledVector(nrm, rd / 2);
        const c = V(x, underside(z1), z1).addScaledVector(nrm, rd / 2);
        b.member(a, c, rafterSize, UP, rafterOpt);
      }
    }
    const ridgeTop = rafterTop(D / 2 - 0.75);
    for (const [s, e] of splitRange(0, W, rafterXs, 192)) {
      b.lumberBox('2x6', s, e, ridgeTop - 5.5, ridgeTop, D / 2 - 0.75, D / 2 + 0.75, { ...rafterOpt, name: 'Ridge board' });
    }
    // ceiling / collar ties on every other rafter pair
    rafterXs.forEach((x, i) => {
      if (i === 0 || i === rafterXs.length - 1 || i % 2 === 0) return;
      for (const [s, e] of splitRange(0, D, [D / 2], 192)) {
        b.lumberBox('2x4', x + 0.75, x + 2.25, yTop, yTop + 3.5, s, e, { ...rafterOpt, name: 'Ceiling tie' });
      }
    });
    ties += rafterXs.length * 2;
  } else {
    const splitZ = roofBeams ? rows.slice(1, -1).map((r) => r.zc) : [];
    for (const x of rafterXs) {
      const zs = [-E, ...splitZ.filter((z) => z > -E && z < D + E), D + E];
      // pick splices so pieces fit 16 ft
      const segs = splitRange(-E, D + E, splitZ, 192 * cos);
      for (const [s, e] of segs) {
        const a = V(x, underside(s), s).addScaledVector(nBack, rd / 2);
        const c = V(x, underside(e), e).addScaledVector(nBack, rd / 2);
        b.member(a, c, rafterSize, UP, rafterOpt);
      }
      void zs;
    }
    ties += rafterXs.length * (2 + (roofBeams ? nRows - 2 : 0));
  }

  // purlins
  const slopes = shed
    ? [{ key: 'shed', zt: -E, dir: 1, top: (D + 2 * E) / cos, nrm: nBack }]
    : [
      { key: 'back', zt: -E, dir: 1, top: (D / 2 + E) / cos, nrm: nBack },
      { key: 'front', zt: D + E, dir: -1, top: (D / 2 + E) / cos, nrm: nFront },
    ];
  let purlinRows = 0;
  for (const sl of slopes) {
    const s0 = 1.75;
    const s1 = sl.top - (shed ? 1.75 : 2.5);
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
        b.member(a, c, '2x4', upDir, { cat: 'framing', group: 'purlins', step: STEP.PURLINS, ex: [0, 7.5 * EX, 0], name: 'Purlin (2x4 flat)', flat: true });
      }
    }
    // fascia at the eave
    const zf = sl.zt;
    const yf = rafterTop(zf);
    for (const [xa, xb] of splitRange(-R, W + R, rafterXs, 192)) {
      const za = sl.dir > 0 ? zf - 0.75 : zf;
      b.lumberBox('1x6', xa, xb, yf - 5.5, yf, za, za + 0.75, { cat: 'framing', group: 'roof', step: STEP.ROOF_FRAME, ex: [0, 6 * EX, -sl.dir * 0.4 * EX], name: 'Fascia' });
    }
  }
  if (shed) {
    // fascia at the high (front) eave too
    const zf = D + E;
    const yf = rafterTop(zf);
    for (const [xa, xb] of splitRange(-R, W + R, rafterXs, 192)) {
      b.lumberBox('1x6', xa, xb, yf - 5.5, yf, zf, zf + 0.75, { cat: 'framing', group: 'roof', step: STEP.ROOF_FRAME, ex: [0, 6 * EX, 0.4 * EX], name: 'Fascia' });
    }
  }

  // ---------------------------------------------------------------- roofing
  const tinPieces = [];
  const clad = P.cladding;
  const tinMat = clad === 'pvc' ? 'pvc' : 'tin';
  const tinName = clad === 'pvc' ? 'PVC tinroof sheet' : 'Metal tinroof sheet';
  let roofFasteners = 0;
  let roofArea = 0;
  const nCols = Math.ceil((W + 2 * R - (tinW - P.tinCover)) / P.tinCover);
  for (const sl of slopes) {
    const zs = sl.zt - sl.dir * 2; // 2" past the fascia
    const zEnd = shed ? D + E + 2 : D / 2 - sl.dir * 1;
    const Ls = Math.abs(zEnd - zs) / cos;
    const yAxis = V(0, sin, sl.dir * cos);
    const zAxis = sl.nrm.clone();
    const xAxis = new THREE.Vector3().crossVectors(yAxis, zAxis);
    const run = sheetRun(Ls);
    roofArea += (W + 2 * R) * Ls;
    for (let i = 0; i < nCols; i++) {
      const xi = -R + i * P.tinCover;
      const wi = Math.min(tinW, W + R - xi);
      if (wi < 4) continue;
      run.forEach((pc, j) => {
        const z = zs + sl.dir * pc.start * cos;
        const o = V(xAxis.x > 0 ? xi : xi + wi, roofTop(z), z).addScaledVector(zAxis, 0.12 + (i % 2) * 0.08 + j * 0.12);
        b.sheet(o, xAxis, yAxis, zAxis, { w: wi, h: pc.len, corr: CORR }, {
          mat: tinMat, name: tinName, info: `cut length ${ftin(pc.len)}`, group: 'roofing', step: STEP.ROOFING,
          ex: [zAxis.x * EX, 9.5 * EX + zAxis.y * EX, zAxis.z * EX],
        });
        tinPieces.push({ stock: pc.stock, len: pc.len, use: 'roof' });
        roofFasteners += Math.ceil(sl.purlins * (pc.len / Ls)) * 6;
      });
    }
  }
  let ridgePieces = 0;
  if (!shed) {
    const ridgeY = roofTop(D / 2);
    for (const sl of slopes) {
      const yAxis = V(0, sin, sl.dir * cos);
      const zAxis = sl.nrm.clone();
      const xAxis = new THREE.Vector3().crossVectors(yAxis, zAxis);
      const o = V(xAxis.x > 0 ? -R : W + R, ridgeY, D / 2).addScaledVector(yAxis, -7).addScaledVector(zAxis, 0.9);
      b.sheet(o, xAxis, yAxis, zAxis, { w: W + 2 * R, h: 7, corr: null }, { mat: tinMat, name: 'Ridge cap', group: 'roofing', step: STEP.ROOFING, ex: [0, 11 * EX, 0] });
    }
    ridgePieces = Math.ceil((W + 2 * R) / (120 - 6));
    roofFasteners += ridgePieces * 12;
  }

  // ---------------------------------------------------------------- siding
  let sidingFasteners = 0;
  const vb = yJb - 1 - y0;
  for (const w of Object.values(walls)) {
    const nc = Math.ceil((w.L - (tinW - P.tinCover)) / P.tinCover);
    for (let i = 0; i < nc; i++) {
      const ui = i * P.tinCover;
      const wi = Math.min(tinW, w.L - ui);
      if (wi < 3) continue;
      let top = -Infinity;
      for (let t = 0; t <= 8; t++) top = Math.max(top, w.sideTop(ui + (wi * t) / 8));
      const Lc = top - vb;
      sheetRun(Lc).forEach((pc, j) => {
        const base = vb + pc.start;
        const holes = w.openings.map((o) => ({ x0: o.u0 - ui, x1: o.u1 - ui, y0: o.v0 - base, y1: o.v1 - base }));
        const profile = (x) => w.sideTop(ui + x) - base;
        const o = toW(w, ui, base, -(0.15 + (i % 2) * 0.08 + j * 0.12));
        b.sheet(o, w.U, UP, w.n, { w: wi, h: pc.len, corr: CORR, holes, profile }, {
          mat: tinMat, name: tinName + ' (siding)', info: `cut length ${ftin(pc.len)}`, group: 'siding', step: STEP.SIDING, ex: wallEx(w, 2.2, 3.8),
        });
        tinPieces.push({ stock: pc.stock, len: pc.len, use: 'siding' });
        sidingFasteners += (blockLevels.length + 3) * 5 * (pc.len / Lc);
      });
    }
  }
  // corner boards over the siding
  const cb = { cat: 'framing', group: 'trim', step: STEP.SIDING, name: 'Corner trim (1x4)' };
  const cbBot = yJb - 1;
  const cbTopB = y0 + topBack;
  const cbTopF = y0 + topFront;
  const t0 = 0.85;
  b.lumberBox('1x4', 0, 3.5, cbBot, cbTopF, D + t0, D + t0 + 0.75, { ...cb, ex: [0, 3.8 * EX, 2.5 * EX] });
  b.lumberBox('1x4', W - 3.5, W, cbBot, cbTopF, D + t0, D + t0 + 0.75, { ...cb, ex: [0, 3.8 * EX, 2.5 * EX] });
  b.lumberBox('1x4', 0, 3.5, cbBot, cbTopB, -t0 - 0.75, -t0, { ...cb, ex: [0, 3.8 * EX, -2.5 * EX] });
  b.lumberBox('1x4', W - 3.5, W, cbBot, cbTopB, -t0 - 0.75, -t0, { ...cb, ex: [0, 3.8 * EX, -2.5 * EX] });
  b.lumberBox('1x4', -t0 - 0.75, -t0, cbBot, cbTopF, D - 3.5, D, { ...cb, ex: [-2.5 * EX, 3.8 * EX, 0] });
  b.lumberBox('1x4', -t0 - 0.75, -t0, cbBot, cbTopB, 0, 3.5, { ...cb, ex: [-2.5 * EX, 3.8 * EX, 0] });
  b.lumberBox('1x4', W + t0, W + t0 + 0.75, cbBot, cbTopF, D - 3.5, D, { ...cb, ex: [2.5 * EX, 3.8 * EX, 0] });
  b.lumberBox('1x4', W + t0, W + t0 + 0.75, cbBot, cbTopB, 0, 3.5, { ...cb, ex: [2.5 * EX, 3.8 * EX, 0] });

  // ---------------------------------------------------------------- windows & door
  const winList = [];
  const trimD = [-(t0 + 0.75), -t0];
  for (const w of Object.values(walls)) {
    for (const o of w.openings) {
      const { u0, u1, v0, v1 } = o;
      const isDoor = o.type === 'door';
      const step = isDoor ? STEP.DOOR : STEP.WINDOWS;
      const exOut = wallEx(w, 3.2, 3.8);
      const trimO = { cat: 'framing', group: 'trim', step, ex: wallEx(w, 2.8, 3.8), name: isDoor ? 'Door casing (1x4)' : 'Window casing (1x4)' };
      const addT = (u_0, u_1, v_0, v_1) => {
        const [x0, x1, yy0, yy1, z0, z1] = wallBox(w, u_0, u_1, v_0, v_1, trimD[0], trimD[1]);
        b.lumberBox('1x4', x0, x1, yy0, yy1, z0, z1, trimO);
      };
      addT(u0 - 3.5, u1 + 3.5, v1, v1 + 3.5);
      addT(u0 - 3.5, u0, isDoor ? 0 : v0, v1);
      addT(u1, u1 + 3.5, isDoor ? 0 : v0, v1);
      if (!isDoor) addT(u0 - 3.5, u1 + 3.5, v0 - 3.5, v0);
      if (!isDoor) {
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
        // jambs
        const jo = { cat: 'framing', group: 'door', step, ex: exOut, name: 'Door jamb (1x6)' };
        const addJ = (u_0, u_1, v_0, v_1) => {
          const [x0, x1, yy0, yy1, z0, z1] = wallBox(w, u_0, u_1, v_0, v_1, -0.75, 3.75);
          b.lumberBox('1x6', x0, x1, yy0, yy1, z0, z1, jo);
        };
        addJ(u0, u0 + 0.75, 0, v1);
        addJ(u1 - 0.75, u1, 0, v1);
        addJ(u0 + 0.75, u1 - 0.75, v1 - 0.75, v1);
        // leaf: vertical 1x6 boards with a Z-brace of 1x4
        const lu0 = u0 + 1;
        const lu1 = u1 - 1;
        const lv0 = 0.5;
        const lv1 = lv0 + P.doorH;
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
        b.box(x0, x1, yy0, yy1, z0, z1, { mat: 'steel', group: 'door', step, ex: exOut, name: 'Hasp & padlock' });
      }
    }
  }

  // ---------------------------------------------------------------- interior plywood
  const wallPlyPieces = [];
  for (const w of Object.values(walls)) {
    const ua = w.key === 'front' || w.key === 'back' ? 3.5 : 3.5;
    const ub = w.key === 'front' || w.key === 'back' ? w.L - 3.5 : w.L - 3.5;
    const isGableEnd = !shed && (w.key === 'left' || w.key === 'right');
    const topAt = (u) => (isGableEnd ? H : w.top(u));
    for (let u = ua; u < ub - 0.5; u += 48) {
      const cw = Math.min(48, ub - u);
      const hmax = Math.max(topAt(u), topAt(u + cw));
      for (let v = 0; v < hmax - 0.5; v += 96) {
        const rh = Math.min(96, hmax - v);
        const holes = w.openings.map((o) => ({ x0: o.u0 - u, x1: o.u1 - u, y0: o.v0 - v, y1: o.v1 - v }));
        const profile = (x) => topAt(u + x) - v;
        const o = toW(w, u, v, 3.62);
        b.sheet(o, w.U, UP, w.n, { w: cw - 0.06, h: rh, corr: null, holes, profile }, {
          mat: 'plyWall', name: PLY[P.wallPly].name + ' wall sheet', info: `${ftin(cw)} × ${ftin(rh)}`, group: 'interior', step: STEP.INTERIOR, ex: wallEx(w, -0.6, 3.8),
        });
        wallPlyPieces.push({ w: cw, h: rh });
      }
    }
  }

  // ---------------------------------------------------------------- stairs
  const SW = P.stairW;
  const nR = Math.ceil(Hf / 7.5);
  const r = Hf / nR;
  const nT = nR - 1;
  const g = 10.5;
  const Dw = D + 1.2;
  const xd = doorC;
  const alpha = Math.atan(r / g);
  const ca = Math.cos(alpha);
  const stairEx = [0, 1 * EX, 2.5 * EX];
  const so = { cat: 'framing', group: 'stairs', step: STEP.STAIRS, ex: stairEx };
  const yNT = nT * r;
  const T = (z) => yNT + 1.3 - (z - (Dw + 5.5)) * (r / g);
  const N = (z) => T(z) - 1.3 + 5.5 * (r / g);
  const zS = Dw + 0.2;
  const zE = Dw + 5.5 + ((yNT + 1.3 - 5.5 / ca) * g) / r;
  const stringerXs = [xd - SW / 2 - 0.75, xd + SW / 2 + 0.75];
  for (const sx of stringerXs) {
    const C = (z) => T(z) - 2.75 / ca;
    b.member(V(sx, C(zS), zS), V(sx, C(zE), zE), '2x6', UP, { ...so, name: 'Stair stringer (2x6)' });
  }
  for (let i = 1; i <= nT; i++) {
    const yi = i * r;
    const zb = Dw + (nT - i) * g;
    for (const [za, zc] of [[zb, zb + 5.5], [zb + 5.5, zb + 11]]) {
      b.lumberBox('2x6', xd - SW / 2, xd + SW / 2, yi - 1.5, yi, za + 0.06, zc - 0.06, { ...so, name: 'Stair tread (2x6)' });
    }
    for (const [xa, xb] of [[xd - SW / 2, xd - SW / 2 + 1.5], [xd + SW / 2 - 1.5, xd + SW / 2]]) {
      b.lumberBox('2x4', xa, xb, yi - 5, yi - 1.5, zb + 3, zb + 8, { ...so, name: 'Tread cleat (2x4)' });
    }
  }
  const blocks = 2;
  for (const sx of stringerXs) {
    b.box(sx - 3.8, sx + 3.8, -7.6, 0.4, zE - 12, zE + 3.6, { mat: 'block', name: 'Hollow block footing (concrete-filled)', group: 'stairs', step: STEP.STAIRS, ex: [0, 0, 2.5 * EX] });
  }
  // railings
  const zTop = Dw + 2.75;
  const zBot = zE - 8;
  for (const side of [-1, 1]) {
    const xo = side < 0 ? xd - SW / 2 - 1.5 : xd + SW / 2 + 1.5; // outer face of stringer
    const px0 = side < 0 ? xo - 1.5 : xo;
    const px1 = side < 0 ? xo : xo + 1.5;
    const pc = (px0 + px1) / 2;
    const railY = (z) => N(z) + 34;
    b.lumberBox('2x4', px0, px1, T(zTop) - 5.5 / ca - 1, railY(zTop), zTop - 1.75, zTop + 1.75, { ...so, name: 'Railing post (2x4)' });
    b.lumberBox('2x4', px0, px1, 0, railY(zBot), zBot - 1.75, zBot + 1.75, { ...so, name: 'Railing post (2x4)' });
    b.member(V(pc, railY(zTop - 1.75) + 0.75, zTop - 1.75), V(pc, railY(zBot + 4) + 0.75, zBot + 4), '2x4', V(1, 0, 0), { ...so, name: 'Handrail (2x4 flat)' });
    const mx = side < 0 ? px0 - 0.375 : px1 + 0.375;
    b.member(V(mx, railY(zTop) - 17, zTop - 1.75), V(mx, railY(zBot) - 17, zBot + 1.75), '1x4', UP, { ...so, name: 'Mid rail (1x4)' });
  }

  // ---------------------------------------------------------------- quantities
  // Concrete volume: hole incl. 4" below the post + 2" collar above grade.
  const rr = P.holeDia / 2;
  const perPost = Math.PI * rr * rr * (P.embed + 6) - 3 * 5.5 * (P.embed + 2);
  const concreteFt3 = (perPost * posts.length) / 1728 + 0.5; // + block fill / mortar
  const cementNet = concreteFt3 / BAG_YIELD_FT3;

  // fasteners
  let n16 = 0;
  for (const l of b.lumber) {
    if (l.cat === 'structure' && l.label.startsWith('Post')) n16 += Math.ceil(l.len / 12);
    else if (['1x4', '1x6', '1x8', '1x2', '1x3'].includes(l.size)) continue;
    else n16 += 4 + Math.floor(l.len / 24);
  }
  n16 += purlinRows * rafterXs.length * 2;
  let n8 = floorPieces.length * 70;
  for (const l of b.lumber) if (['1x4', '1x6', '1x8', '1x2', '1x3'].includes(l.size)) n8 += 4 + Math.floor(l.len / 12) * 2;
  n8 += nT * 2 * 8;
  const nPanel = wallPlyPieces.length * 50;
  const roofFast = Math.ceil(roofFasteners + sidingFasteners);

  // ---------------------------------------------------------------- steps
  const nPosts = posts.length;
  const diag = Math.hypot(W, D);
  const floorArea = (W * D) / 144;
  const roofAreaFt2 = roofArea / 144;
  const roofPlanFt2 = ((W + 2 * R) * (D + 2 * E)) / 144;
  const nWin = winList.length;
  const rainGal = roofPlanFt2 * 0.623;
  const steps = [
    { title: 'Bare site', text: `Pick the highest, best-drained spot available and clear it of debris and roots. The building footprint is ${ftin(W)} × ${ftin(D)} (${num(floorArea)} sq ft of floor), plus about ${ftin(nT * g + 12)} in front for the stairs. Orient the long walls so the two louvre windows face the prevailing trade winds for cross-ventilation.` },
    { title: 'Lay out & square the footprint', text: `Drive stakes and nail batter boards about 2' outside each corner, then stretch string lines along the outside faces of the building at ${ftin(W)} and ${ftin(D)}. Square the layout by measuring both diagonals — they must both be ${ftin(diag)}. Mark the ${nPosts} post centres (${nRows} beam lines; the front line has an extra pair of posts framing the door).` },
    { title: 'Dig post holes', text: `Dig ${nPosts} holes, ${inch(P.holeDia)} in diameter and ${ftin(P.embed + 4)} deep (the post sits on 4" of concrete). Keep the string lines up so each hole stays centred on its mark.` },
    { title: 'Set posts & pour footings', text: `Each post is two 2x6 plies nailed together (every 12", staggered) — the shop has no 4x4s, and laminated posts are straighter and stronger. Wrap the bottom 16" of every post in bitumen or heavy plastic. Pour 4" of concrete, set the post, plumb it in both directions with temporary braces, and fill the hole, crowning the concrete 2" above grade so water runs away from the wood. ${posts.filter((x) => x.tall).length} posts run full height to the wall plate; ${posts.filter((x) => !x.tall).length} stop under the floor. Mix about ${num(cementNet, 1)} bags of cement (1 : 2 : 3 cement : sand : gravel/crushed coral). Rinse beach sand with fresh water first. Keep the concrete damp and let it cure at least 3 days before loading.` },
    { title: 'Bolt the floor beams', text: `Snap a level line on every post at ${ftin(yBb)} above grade (bottom of beam). Each beam is two 2x6 plies bolted to the posts with two 1/2" galvanised bolts per post (${bolts} bolts in total). Beam lines: ${nRows}; splices only over a post.` },
    { title: 'Floor joists & rim', text: `Set ${midJoists.length + 2} 2x6 joists at ${inch(P.joistSpacing)} on centre across the beams, with rim joists across the ends nailed into the posts. Fit a hurricane tie wherever a joist crosses a beam. Check the frame is square (diagonals ${ftin(diag)}) and level before sheathing.` },
    { title: 'Floor sheathing', text: `Glue (if available) and nail ${floorPieces.length} pieces of ${PLY[P.floorPly].name} with the long edge across the joists and the joints staggered. Use 8d galvanised nails every 6" at edges and 12" in the field. Notch around posts.` },
    { title: 'Stairs & railing', text: `Build the stairs now so the crew has safe access. ${nR} risers of ${inch(r)} and ${nT} treads, ${inch(g)} going, ${ftin(SW)} wide. Two 2x6 stringers sit on concrete-filled hollow blocks and bolt to the rim; each tread is two 2x6s on 2x4 cleats. Handrails on both sides at 34" above the nosing.` },
    { title: 'Frame the back wall', text: `Frame the back wall flat on the deck and tilt it up between the posts: 2x4 bottom plate, studs at ${inch(P.studSpacing)} on centre, and ${blockLevels.length} rows of flat blocking — the vertical corrugated siding is nailed to these. Nail the studs and plates into the posts.` },
    { title: 'Frame the front wall & door opening', text: `Frame the front wall with a ${ftin(doorRO.w)} × ${ftin(doorRO.h)} rough opening for the ${inch(P.doorW)} door, centred between two posts, with king and trimmer studs each side and a doubled 2x6 header. The bottom plate is cut out at the door.` },
    { title: 'Frame the end walls & windows', text: `Frame both end walls with rough openings of ${ftin(winRO.w)} × ${ftin(winRO.h)} for the louvre windows, sill at ${ftin(sill)} above the floor${nWin > 2 ? ` (${nWin} windows in total — larger houses get an extra window per bay)` : ''}. Add the double top plate, lapping the corners, and strap every post to the plate. Brace the walls plumb.` },
    { title: 'Roof framing', text: shed ? `Single-slope (shed) roof at ${P.pitch}:12. The front wall is ${ftin(topFront - topBack)} taller than the back. Set ${rafterXs.length} ${rafterSize} rafters at ${inch(P.rafterSpacing)} on centre with ${inch(E)} eave overhangs, each tied to both plates with a hurricane tie.` : `Gable roof at ${P.pitch}:12. Raise the 2x6 ridge board on temporary props, then set ${rafterXs.length} pairs of ${rafterSize} rafters at ${inch(P.rafterSpacing)} on centre with ${inch(E)} eave overhangs. Tie every rafter to the plate with a hurricane tie and add ceiling ties on alternate pairs to stop the walls spreading. Fill the gable ends with studs. Nail 1x6 fascia to the rafter tails.` },
    { title: 'Purlins', text: `Nail 2x4 purlins flat across the rafters, ${slopes.map((s) => s.purlins).join(' + ')} rows at no more than ${inch(P.purlinSpacing)} apart, overhanging the gable ends by ${inch(R)}. The corrugated sheets fasten to these.` },
    { title: 'Roofing', text: `Lay ${tinPieces.filter((t) => t.use === 'roof').length} pieces of ${clad === 'pvc' ? 'PVC' : 'galvanised metal'} sheet, starting at the end away from the prevailing wind so the side laps face downwind. Lap one corrugation at the sides and ${inch(LAP)} at any end joints. Fasten through the crests (not the valleys) with sealing-washer roofing fasteners, ${clad === 'pvc' ? 'pre-drilling oversized holes so the PVC can expand' : 'about 6 per sheet at each purlin'}.${shed ? '' : ' Finish with the ridge cap.'} The plan area of the roof is ${num(roofPlanFt2)} sq ft — every 1" of rain can fill about ${num(rainGal)} gallons if you add gutters and a tank.` },
    { title: 'Siding', text: `Hang ${tinPieces.filter((t) => t.use === 'siding').length} ${clad === 'pvc' ? 'PVC' : 'metal'} sheet pieces vertically on the walls, nailed to the rim, blocking rows and top plate. The siding runs down past the floor frame to keep rain off it. Cut the window and door openings with tin snips after the sheet is up, and cover the corners with 1x4 trim.` },
    { title: 'Louvre windows', text: `Screw the ${P.windowH}' aluminium louvre frames into the ${nWin} window openings, then slide in the ${winList.reduce((s, x) => s + x.blades, 0)} ${P.windowW}' glass blades. Trim the outside with 1x4 casing; run a bead of sealant under the head casing.` },
    { title: 'Door', text: `Install 1x6 jambs, then build the door from vertical 1x6 boards with a 1x4 Z-brace (the diagonal must run up from the bottom hinge side). Hang it on three galvanised T-hinges and fit a hasp. Trim the outside with 1x4 casing.` },
    { title: 'Interior walls', text: `Nail ${wallPlyPieces.length} pieces of ${PLY[P.wallPly].name} to the inside of the wall studs with 1-1/4" galvanised panel nails. The space above the walls stays open to the roof for ventilation.` },
    { title: 'Complete', text: `Finished: ${ftin(W)} × ${ftin(D)} raised house with a ${shed ? 'single-slope' : 'gable'} ${clad === 'pvc' ? 'PVC' : 'metal'} roof, ${nWin} louvre windows and a ${inch(P.doorW)} door. Recommended extras: insect screen behind the louvres, a gutter and water tank on the ${shed ? 'low' : 'back'} eave, and a coat of paint or oil on exposed wood.` },
  ];

  // Dimension labels
  const dims = [
    { a: [0, 0.3, D + 18], b: [W, 0.3, D + 18], label: ftin(W) },
    { a: [W + 18, 0.3, 0], b: [W + 18, 0.3, D], label: ftin(D) },
  ];

  return {
    P, W, D, parts: b.parts, steps, dims, warnings,
    bounds: { min: [-R - 40, bottom - 4, -E - 40], max: [W + R + 40, roofTop(shed ? D + E : D / 2) + 12, zE + 40] },
    q: {
      lumber: b.lumber,
      floorPly: { type: P.floorPly, pieces: floorPieces },
      wallPly: { type: P.wallPly, pieces: wallPlyPieces },
      tin: tinPieces,
      ridgePieces,
      windows: winList,
      concreteFt3,
      cementNet,
      blocks,
      bolts,
      ties,
      n16,
      n8,
      nPanel,
      roofFast,
      posts: posts.length,
      hinges: 3,
    },
    info: {
      posts: posts.length, nx, nRows, rafterSize, diag, floorArea, roofAreaFt2, roofPlanFt2, rainGal, maxPost,
      risers: nR, rise: r, nFront: fxs.length, studCount, topFront, topBack, yBb, sill, nWin,
      ridgeHeight: roofTop(shed ? D + E : D / 2),
    },
  };
}
