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
  width: 36, // ft
  depth: 17, // ft
  cladding: 'metal', // 'metal' | 'pvc'
  foundation: 'slab', // 'slab' (solid) | 'edge' (4" slab with thickened edge)
  slabT: 12, // foundation thickness (solid slab, or edge-beam depth), in
  slabAbove: 6, // top of slab above grade, in
  wallHeight: 96, // slab to top of top plate, in
  pitch: 4, // rise per 12
  eave: 12, // eave overhang, in
  rake: 6, // gable overhang, in
  midPosts: 2, // posts between the corners on each wall
  studSpacing: 24,
  rafterSpacing: 24,
  purlinSpacing: 24,
  embed: 36, // post depth below top of slab, in
  holeDia: 16, // post footing hole diameter, in
  rebarSpacing: 18, // slab rebar grid, in
  wallPly: 'ply14',
  doorsFront: 2,
  doorsBack: 1,
  doorsSide: 1, // on each end wall
  doorW: 32,
  doorH: 80,
  winSpacing: 10, // max window spacing along a wall, ft
  windowW: 3, // louvre blade length, ft
  windowH: 4, // louvre frame height, ft
  sill: 30, // window sill height above floor, in
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
  SITE: 0, LAYOUT: 1, DIG: 2, POSTS: 3, SLAB: 4, WALL_BACK: 5, WALL_FRONT: 6, WALL_ENDS: 7,
  ROOF_FRAME: 8, PURLINS: 9, ROOFING: 10, SIDING: 11, WINDOWS: 12, DOOR: 13, INTERIOR: 14, DONE: 15,
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
  const p = P.pitch / 12;
  const theta = Math.atan(p);
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const y0 = P.slabAbove; // floor = top of slab
  const H = P.wallHeight;
  const E = P.eave;
  const R = P.rake;
  const tinW = P.tinCover + 3;
  const warnings = [];
  const edge = P.foundation === 'edge';
  const slabCore = edge ? 4 : P.slabT;
  const yS0 = y0 - P.slabT; // bottom of slab / edge beam

  const rafterSpanH = D / 2 - 3.5;
  const rafterSize = rafterSpanH > 84 ? '2x6' : '2x4';
  const rd = LUMBER[rafterSize].w;
  const yTop = y0 + H;
  const underside = (z) => yTop + (Math.min(z, D - z) - 3.5) * p;
  const rafterTop = (z) => underside(z) + rd / cos;
  const roofTop = (z) => rafterTop(z) + 1.5;

  // ---------------------------------------------------------------- walls & openings
  const mkWall = (key, O, U, n, L, ua, ub, sideTop, step) => ({ key, O, U, n, L, ua, ub, top: () => H, sideTop, step, posts: [], openings: [] });
  const walls = {
    back: mkWall('back', V(W, y0, 0), V(-1, 0, 0), V(0, 0, -1), W, 0, W, () => H, STEP.WALL_BACK),
    front: mkWall('front', V(0, y0, D), V(1, 0, 0), V(0, 0, 1), W, 0, W, () => H, STEP.WALL_FRONT),
    left: mkWall('left', V(0, y0, 0), V(0, 0, 1), V(-1, 0, 0), D, 3.5, D - 3.5, (u) => rafterTop(u) - y0, STEP.WALL_ENDS),
    right: mkWall('right', V(W, y0, D), V(0, 0, -1), V(1, 0, 0), D, 3.5, D - 3.5, (u) => rafterTop(D - u) - y0, STEP.WALL_ENDS),
  };
  const toW = (w, u, v, d) => w.O.clone().addScaledVector(w.U, u).addScaledVector(UP, v).addScaledVector(w.n, -d);
  const wallBox = (w, u0, u1, v0, v1, d0, d1) => {
    const a = toW(w, u0, v0, d0);
    const c = toW(w, u1, v1, d1);
    return [Math.min(a.x, c.x), Math.max(a.x, c.x), Math.min(a.y, c.y), Math.max(a.y, c.y), Math.min(a.z, c.z), Math.max(a.z, c.z)];
  };
  const wallEx = (w, out, layer) => [w.n.x * out * EX, layer * EX, w.n.z * out * EX];

  const m = P.midPosts;
  const winRO = { w: P.windowW * 12 + 1, h: P.windowH * 12 + 1 };
  const doorRO = { w: P.doorW + 2, h: P.doorH + 1.5 };
  let sill = P.sill;
  if (sill + winRO.h + 5.5 > H - 4.5) {
    sill = Math.max(12, H - 4.5 - 5.5 - winRO.h);
    warnings.push(`Window sill lowered to ${inch(sill)} to fit under the wall plate.`);
  }
  const S = P.winSpacing * 12;
  const doorCount = { front: P.doorsFront, back: P.doorsBack, left: P.doorsSide, right: P.doorsSide };
  // Doors go in the bays between posts; windows are spread so they are never
  // more than S apart. Mid-wall posts slide sideways to clear an opening.
  for (const w of Object.values(walls)) {
    const long = w.key === 'front' || w.key === 'back';
    const lo = long ? 5.5 : 3.5; // inside face of the corner post / corner studs
    const hi = w.L - lo;
    const c0 = long ? 2.75 : 1.5;
    const posts = [];
    for (let i = 1; i <= m; i++) posts.push(c0 + (i * (w.L - 2 * c0)) / (m + 1));
    const zones = []; // [a, b, type]
    const free = (a, c, ignorePost = -1) => a >= lo - 1e-6 && c <= hi + 1e-6
      && !zones.some(([za, zc]) => overlaps(a, c, za, zc))
      && !posts.some((pc, i) => i !== ignorePost && overlaps(a, c, pc - 2.75, pc + 2.75));
    // try to open [a,c] by moving posts that are in the way
    const clearFor = (a, c) => {
      const moved = posts.slice();
      for (let i = 0; i < posts.length; i++) {
        if (!overlaps(a, c, posts[i] - 2.75, posts[i] + 2.75)) continue;
        const left = a - 2.75;
        const right = c + 2.75;
        const opts = Math.abs(left - posts[i]) < Math.abs(right - posts[i]) ? [left, right] : [right, left];
        const ok = opts.find((pc) => pc - 2.75 >= lo - 5.5 - 1e-6 && pc + 2.75 <= hi + 5.5 + 1e-6
          && !zones.some(([za, zc]) => overlaps(pc - 2.75, pc + 2.75, za, zc))
          && !moved.some((q, j) => j !== i && overlaps(pc - 2.75, pc + 2.75, q - 2.75, q + 2.75))
          && pc - 2.75 >= (long ? 5.5 : 3.5) - 1e-6 && pc + 2.75 <= w.L - (long ? 5.5 : 3.5) + 1e-6);
        if (ok === undefined) return false;
        moved[i] = ok;
      }
      posts.splice(0, posts.length, ...moved);
      return true;
    };
    const nd = doorCount[w.key];
    const hz = doorRO.w / 2 + 3;
    let placed = 0;
    for (let k = 0; k < nd; k++) {
      // centre of the k-th of nd evenly chosen bays, or evenly spaced
      const nb = m + 1;
      const bayW = (w.L - 2 * c0) / nb;
      let t = nd <= nb ? c0 + (Math.min(nb - 1, Math.max(0, Math.round(((k + 0.5) * nb) / nd - 0.5))) + 0.5) * bayW : lo + ((k + 0.5) * (hi - lo)) / nd;
      t = Math.min(hi - hz, Math.max(lo + hz, t));
      if (zones.some(([za, zc]) => overlaps(t - hz, t + hz, za, zc)) || !clearFor(t - hz, t + hz)) continue;
      w.openings.push({ type: 'door', u0: t - doorRO.w / 2, u1: t + doorRO.w / 2, v0: 0, v1: doorRO.h });
      zones.push([t - hz, t + hz, 'door']);
      placed++;
    }
    if (placed < nd) warnings.push(`Only ${placed} of ${nd} door${nd === 1 ? '' : 's'} fit on the ${w.key} wall.`);
    const slots = Math.max(1, Math.ceil(w.L / S));
    const wz = winRO.w / 2 + 3;
    for (let k = 0; k < slots; k++) {
      const t = (w.L * (k + 0.5)) / slots;
      if (zones.some(([za, zc, ty]) => ty === 'door' && overlaps(t - wz, t + wz, za - 6, zc + 6))) continue;
      // 1) slide the window to the nearest gap between posts
      let best = null;
      const obst = [...zones.map(([a, c]) => [a - 3, c + 3]), ...posts.map((pc) => [pc - 2.75, pc + 2.75])];
      for (const [a, c] of subtract(lo, hi, obst)) {
        if (c - a < 2 * wz) continue;
        const cc = Math.min(c - wz, Math.max(a + wz, t));
        if (best === null || Math.abs(cc - t) < Math.abs(best - t)) best = cc;
      }
      if (best !== null && Math.abs(best - t) > Math.min(S / 2, 24)) best = null;
      // 2) otherwise move a post out of the way
      if (best === null) {
        const tc = Math.min(hi - wz, Math.max(lo + wz, t));
        if (!zones.some(([za, zc]) => overlaps(tc - wz - 3, tc + wz + 3, za, zc)) && clearFor(tc - wz, tc + wz)) best = tc;
      }
      if (best === null) continue;
      w.openings.push({ type: 'window', u0: best - winRO.w / 2, u1: best + winRO.w / 2, v0: sill, v1: sill + winRO.h });
      zones.push([best - wz, best + wz, 'window']);
    }
    w.midPostU = posts.slice();
  }

  // ---------------------------------------------------------------- posts
  const posts = [];
  const addPost = (x0, x1, z0, z1, wall, corner) => posts.push({ x0, x1, z0, z1, xc: (x0 + x1) / 2, zc: (z0 + z1) / 2, wall, corner });
  addPost(0, 5.5, 0, 3, 'back', true);
  addPost(W - 5.5, W, 0, 3, 'back', true);
  addPost(0, 5.5, D - 3, D, 'front', true);
  addPost(W - 5.5, W, D - 3, D, 'front', true);
  for (const u of walls.back.midPostU) addPost(W - u - 2.75, W - u + 2.75, 0, 3, 'back', false);
  for (const u of walls.front.midPostU) addPost(u - 2.75, u + 2.75, D - 3, D, 'front', false);
  for (const u of walls.left.midPostU) addPost(0, 3, u - 2.75, u + 2.75, 'left', false);
  for (const u of walls.right.midPostU) addPost(W - 3, W, D - u - 2.75, D - u + 2.75, 'right', false);
  for (const po of posts) {
    if (po.wall === 'back') walls.back.posts.push([W - po.x1, W - po.x0]);
    else if (po.wall === 'front') walls.front.posts.push([po.x0, po.x1]);
    else if (po.wall === 'left') walls.left.posts.push([po.z0, po.z1]);
    else walls.right.posts.push([D - po.z1, D - po.z0]);
  }
  const longSpan = (W - 5.5) / (m + 1);
  if (longSpan > 168) warnings.push(`Posts on the long walls are ${ftin(longSpan)} apart — consider more posts per wall.`);

  // ---------------------------------------------------------------- layout
  const tempStrings = { mat: 'string', group: 'temp', step: STEP.LAYOUT, stepTo: STEP.DIG, name: 'Layout string line', temp: true, ex: [0, 0, 0] };
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
    b.box(cx + dx * 18 - 12, cx + dx * 18 + 12, sy - 3.5, sy, cz + dz * 30 - 0.75, cz + dz * 30 + 0.75, stake);
    b.box(cx + dx * 30 - 0.75, cx + dx * 30 + 0.75, sy - 3.5, sy, cz + dz * 18 - 12, cz + dz * 18 + 12, stake);
    for (const [ox, oz] of [[dx * 30, dz * 30], [dx * 30, dz * 6], [dx * 6, dz * 30]]) {
      b.box(cx + ox - 0.75, cx + ox + 0.75, -6, sy + 2, cz + oz - 0.75, cz + oz + 0.75, { ...stake, name: 'Stake' });
    }
  }

  // ---------------------------------------------------------------- excavation
  const digDepth = Math.max(0, -yS0);
  b.box(0, W, 0.02, 0.12, 0, D, { mat: 'hole', name: `Excavation, ${ftin(digDepth)} deep`, group: 'footing', step: STEP.DIG, stepTo: STEP.DIG, ex: [0, 0, 0] });
  const r = P.holeDia / 2;
  for (const po of posts) {
    b.cyl(po.xc, po.zc, r, 0.12, 0.3, { mat: 'hole', name: 'Post hole', group: 'footing', step: STEP.DIG, stepTo: STEP.DIG, ex: [0, 0, 0] });
  }

  // ---------------------------------------------------------------- posts
  const bottom = y0 - P.embed;
  let maxPost = 0;
  let shallow = 0;
  for (const po of posts) {
    const top = yTop - 3;
    const pb = top - bottom > 192 && top - bottom <= 200 ? top - 192 : bottom;
    if (pb !== bottom) shallow = Math.max(shallow, y0 - pb);
    const L = top - pb;
    maxPost = Math.max(maxPost, L);
    const alongX = po.x1 - po.x0 > po.z1 - po.z0;
    const plies = alongX ? [[po.z0, po.z0 + 1.5], [po.z0 + 1.5, po.z1]] : [[po.x0, po.x0 + 1.5], [po.x0 + 1.5, po.x1]];
    plies.forEach(([a, c], k) => {
      const split = k === 0 ? 192 : 144;
      const cuts = L > 192 + 1e-6 ? [[pb, pb + split], [pb + split, top]] : [[pb, top]];
      for (const [ya, yb] of cuts) {
        const [x0, x1, z0, z1] = alongX ? [po.x0, po.x1, a, c] : [a, c, po.z0, po.z1];
        b.lumberBox('2x6', x0, x1, ya, yb, z0, z1, { name: po.corner ? 'Corner post ply' : 'Wall post ply', cat: 'structure', group: 'posts', step: STEP.POSTS, ex: [0, 0, 0] });
      }
    });
    b.box(po.x0 - 0.12, po.x1 + 0.12, pb, y0 + 6, po.z0 - 0.12, po.z1 + 0.12, { mat: 'wrap', name: 'Bitumen wrap on the embedded part of the post', group: 'posts', step: STEP.POSTS, ex: [0, 0, 0] });
    if (pb - 4 < yS0) {
      b.cyl(po.xc, po.zc, r, pb - 4, yS0 + 0.01, { mat: 'concrete', name: `Post footing ⌀${inch(P.holeDia)} (poured with the slab)`, group: 'footing', step: STEP.SLAB, ex: [0, -1.8 * EX, 0] });
    }
  }
  if (shallow) warnings.push(`Posts are set ${ftin(shallow)} below the slab top (instead of ${ftin(P.embed)}) so they can be cut from one 16' board.`);
  if (maxPost > 192 + 1e-6) warnings.push(`Posts are ${ftin(maxPost)} — longer than 16 ft stock, so post plies are spliced (staggered).`);

  // temporary bracing on corner posts until the walls are up
  for (const po of posts.filter((x) => x.corner)) {
    const dx = po.xc < W / 2 ? -1 : 1;
    const dz = po.zc < D / 2 ? -1 : 1;
    const o = { mat: 'wood', name: 'Temporary brace (reuse offcuts)', group: 'temp', step: STEP.POSTS, stepTo: STEP.WALL_FRONT, temp: true, ex: [0, 0, 0] };
    b.member(V(po.xc + dx * 48, 0, po.zc), V(po.xc + dx * 3.5, 66, po.zc), { t: 1.5, d: 3.5 }, V(0, 0, 1), o);
    b.member(V(po.xc, 0, po.zc + dz * 48), V(po.xc, 66, po.zc + dz * 2.5), { t: 1.5, d: 3.5 }, V(1, 0, 0), o);
  }

  // ---------------------------------------------------------------- formwork, plastic, rebar
  const formRows = Math.max(1, Math.ceil((y0 + 0.5) / 5.5));
  const fo = { cat: 'formwork', group: 'formwork', step: STEP.POSTS, stepTo: STEP.SLAB, name: 'Slab form board (2x6, reuse later)', ex: [0, 0, 0] };
  for (let k = 0; k < formRows; k++) {
    const ya = y0 - 5.5 * (k + 1);
    const yb = y0 - 5.5 * k;
    for (const [s, e] of splitRange(-1.5, W + 1.5, [], 192)) {
      b.lumberBox('2x6', s, e, ya, yb, -1.5, 0, fo);
      b.lumberBox('2x6', s, e, ya, yb, D, D + 1.5, fo);
    }
    for (const [s, e] of splitRange(0, D, [], 192)) {
      b.lumberBox('2x6', -1.5, 0, ya, yb, s, e, fo);
      b.lumberBox('2x6', W, W + 1.5, ya, yb, s, e, fo);
    }
  }
  const stakeO = { ...fo, name: 'Form stake (2x4)' };
  for (let x = 24; x < W; x += 48) {
    b.lumberBox('2x4', x - 0.75, x + 0.75, -14, y0, -3, -1.5, stakeO);
    b.lumberBox('2x4', x - 0.75, x + 0.75, -14, y0, D + 1.5, D + 3, stakeO);
  }
  for (let z = 24; z < D; z += 48) {
    b.lumberBox('2x4', -3, -1.5, -14, y0, z - 0.75, z + 0.75, stakeO);
    b.lumberBox('2x4', W + 1.5, W + 3, -14, y0, z - 0.75, z + 0.75, stakeO);
  }
  b.box(0.5, W - 0.5, y0 - slabCore - 0.12, y0 - slabCore - 0.02, 0.5, D - 0.5, { mat: 'plastic', name: '6-mil plastic under the slab', group: 'formwork', step: STEP.POSTS, stepTo: STEP.POSTS, ex: [0, 0, 0] });
  const rebar = [];
  const rebarY = edge ? y0 - 2 : y0 - P.slabT / 2;
  const ro = { mat: 'rebar', group: 'formwork', step: STEP.POSTS, stepTo: STEP.POSTS, name: '1/2" rebar', ex: [0, 0, 0] };
  const barPieces = (L) => {
    const n = Math.max(1, Math.ceil((L - 12) / (240 - 12)));
    const len = (L + 12 * (n - 1)) / n;
    for (let i = 0; i < n; i++) rebar.push(len);
  };
  const sp = P.rebarSpacing;
  for (let z = 3; z <= D - 3 + 0.01; z += sp) {
    b.box(3, W - 3, rebarY, rebarY + 0.5, z - 0.25, z + 0.25, { ...ro, info: `${ftin(W - 6)} run` });
    barPieces(W - 6);
  }
  for (let x = 3; x <= W - 3 + 0.01; x += sp) {
    b.box(x - 0.25, x + 0.25, rebarY + 0.5, rebarY + 1, 3, D - 3, { ...ro, info: `${ftin(D - 6)} run` });
    barPieces(D - 6);
  }
  if (edge) {
    for (const yy of [yS0 + 3, y0 - 6]) {
      b.box(6, W - 6, yy, yy + 0.5, 6, 6.5, ro); b.box(6, W - 6, yy, yy + 0.5, D - 6.5, D - 6, ro);
      b.box(6, 6.5, yy, yy + 0.5, 6, D - 6, ro); b.box(W - 6.5, W - 6, yy, yy + 0.5, 6, D - 6, ro);
      barPieces(W - 12); barPieces(W - 12); barPieces(D - 12); barPieces(D - 12);
    }
  }

  // ---------------------------------------------------------------- slab
  const slabName = edge ? 'Concrete slab (4") with thickened edge' : `Concrete slab, ${inch(P.slabT)} thick`;
  const so = { mat: 'concrete', name: slabName, info: `${ftin(W)} × ${ftin(D)}, top ${inch(P.slabAbove)} above grade`, group: 'slab', step: STEP.SLAB, ex: [0, -1.5 * EX, 0] };
  b.box(0, W, y0 - slabCore, y0, 0, D, so);
  if (edge) {
    const eo = { ...so, name: `Thickened slab edge, 12" wide × ${inch(P.slabT)} deep` };
    b.box(0, W, yS0, y0 - 4, 0, 12, eo);
    b.box(0, W, yS0, y0 - 4, D - 12, D, eo);
    b.box(0, 12, yS0, y0 - 4, 12, D - 12, eo);
    b.box(W - 12, W, yS0, y0 - 4, 12, D - 12, eo);
  }

  // ---------------------------------------------------------------- walls
  // Framing ------------------------------------------------------------
  const blockLevels = [];
  const nLev = Math.max(1, Math.round(H / 32) - 1);
  for (let j = 1; j <= nLev; j++) blockLevels.push((H * j) / (nLev + 1));
  let studCount = 0;
  let anchors = 0;
  for (const w of Object.values(walls)) {
    const fo2 = { cat: 'framing', group: 'wall', step: w.step, ex: wallEx(w, 0.6, 1.5) };
    const add = (name, size, u0, u1, v0, v1, d0, d1, extra = {}) => {
      const [x0, x1, yy0, yy1, z0, z1] = wallBox(w, u0, u1, v0, v1, d0, d1);
      return b.lumberBox(size, x0, x1, yy0, yy1, z0, z1, { ...fo2, name, ...extra });
    };
    const doorHoles = w.openings.filter((o) => o.type === 'door').map((o) => [o.u0, o.u1]);
    for (const [s0, e0] of subtract(w.ua, w.ub, [...w.posts, ...doorHoles])) {
      for (const [s, e] of splitRange(s0, e0, [], 192)) {
        add('Bottom plate (anchored to slab)', '2x4', s, e, 0, 1.5, 0, 3.5);
        anchors += Math.max(2, Math.ceil((e - s) / 48) + 1);
      }
    }
    for (const layer of [0, 1]) {
      const vt = H - 1.5 * layer;
      for (const [s, e] of splitRange(w.ua, w.ub, [], 192, layer === 1)) add(layer ? 'Top plate (lower)' : 'Top plate (upper)', '2x4', s, e, vt - 1.5, vt, 0, 3.5);
    }
    const vertical = [...w.posts.map(([a, c]) => [a, c])];
    const zones = w.openings.map((o) => [o.u0 - 3, o.u1 + 3]);
    const cands = new Set([w.ua + 0.75, w.ub - 0.75]);
    for (let c = 0; c <= w.L; c += P.studSpacing) if (c > w.ua + 3 && c < w.ub - 3) cands.add(c);
    for (const c of [...cands].sort((x, y) => x - y)) {
      const u0 = c - 0.75;
      const u1 = c + 0.75;
      if (w.posts.some(([a, c2]) => overlaps(u0 - 1, u1 + 1, a, c2))) continue;
      if (zones.some(([a, c2]) => overlaps(u0, u1, a, c2))) continue;
      add('Stud', '2x4', u0, u1, 1.5, H - 3, 0, 3.5);
      vertical.push([u0, u1]);
      studCount++;
    }
    for (const o of w.openings) {
      const { u0, u1, v0, v1 } = o;
      add('King stud', '2x4', u0 - 3, u0 - 1.5, 1.5, H - 3, 0, 3.5);
      add('King stud', '2x4', u1 + 1.5, u1 + 3, 1.5, H - 3, 0, 3.5);
      vertical.push([u0 - 3, u0 - 1.5], [u1 + 1.5, u1 + 3]);
      add('Trimmer stud', '2x4', u0 - 1.5, u0, 1.5, v1, 0, 3.5);
      add('Trimmer stud', '2x4', u1, u1 + 1.5, 1.5, v1, 0, 3.5);
      add('Header ply', '2x6', u0 - 1.5, u1 + 1.5, v1, v1 + 5.5, 0, 1.5);
      add('Header ply', '2x6', u0 - 1.5, u1 + 1.5, v1, v1 + 5.5, 2, 3.5);
      const grid = [];
      for (let c = 0; c <= w.L; c += P.studSpacing) if (c > u0 + 1 && c < u1 - 1) grid.push(c);
      if (!grid.length) grid.push((u0 + u1) / 2);
      for (const c of grid) {
        const tv = H - 3;
        if (tv - (v1 + 5.5) > 2) add('Cripple stud', '2x4', c - 0.75, c + 0.75, v1 + 5.5, tv, 0, 3.5);
        if (o.type === 'window' && v0 - 1.5 - 1.5 > 2) add('Cripple stud', '2x4', c - 0.75, c + 0.75, 1.5, v0 - 1.5, 0, 3.5);
      }
      if (o.type === 'window') add('Rough sill', '2x4', u0, u1, v0 - 1.5, v0, 0, 3.5);
    }
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
    if (w.key === 'left' || w.key === 'right') {
      for (let c = P.studSpacing; c < w.L; c += P.studSpacing) {
        if (c < 6 || c > w.L - 6) continue;
        const z = w.key === 'left' ? c : D - c;
        const hgt = underside(z) - y0 - H;
        if (hgt < 3) continue;
        const [x0, x1, yy0, yy1, z0, z1] = wallBox(w, c - 0.75, c + 0.75, H, H + hgt, 0, 3.5);
        b.lumberBox('2x4', x0, x1, yy0, yy1, z0, z1, { cat: 'framing', name: 'Gable stud', group: 'roof', step: STEP.ROOF_FRAME, ex: wallEx(w, 0.6, 3.5) });
      }
    }
  }
  let ties = posts.length; // post-to-plate straps

  // ---------------------------------------------------------------- roof framing
  const rafterXs = [0.75];
  for (let c = 0.75 + P.rafterSpacing; c < W - 0.75 - 6; c += P.rafterSpacing) rafterXs.push(c);
  rafterXs.push(W - 0.75);
  const roofEx = [0, 3.5 * EX, 0];
  const rafterOpt = { cat: 'framing', group: 'roof', step: STEP.ROOF_FRAME, ex: roofEx, name: `Rafter (${rafterSize})` };
  const nBack = V(0, cos, -sin);
  const nFront = V(0, cos, sin);
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
  rafterXs.forEach((x, i) => {
    if (i === 0 || i === rafterXs.length - 1 || i % 2 === 0) return;
    for (const [s, e] of splitRange(0, D, [D / 2 + 12], 192)) {
      b.lumberBox('2x4', x + 0.75, x + 2.25, yTop, yTop + 3.5, s, e, { ...rafterOpt, name: 'Ceiling tie' });
    }
  });
  ties += rafterXs.length * 2;

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
        b.member(a, c, '2x4', upDir, { cat: 'framing', group: 'purlins', step: STEP.PURLINS, ex: [0, 5 * EX, 0], name: 'Purlin (2x4 flat)', flat: true });
      }
    }
    const zf = sl.zt;
    const yf = rafterTop(zf);
    for (const [xa, xb] of splitRange(-R, W + R, rafterXs, 192)) {
      const za = sl.dir > 0 ? zf - 0.75 : zf;
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
        const o = V(xAxis.x > 0 ? xi : xi + wi, roofTop(z), z).addScaledVector(zAxis, 0.12 + (i % 2) * 0.08 + j * 0.12);
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
    const o = V(xAxis.x > 0 ? -R : W + R, ridgeY, D / 2).addScaledVector(yAxis, -7).addScaledVector(zAxis, 0.9);
    b.sheet(o, xAxis, yAxis, zAxis, { w: W + 2 * R, h: 7, corr: null }, { mat: tinMat, name: 'Ridge cap', group: 'roofing', step: STEP.ROOFING, ex: [0, 8.5 * EX, 0] });
  }
  const ridgePieces = Math.ceil((W + 2 * R) / (120 - 6));
  roofFasteners += ridgePieces * 12;

  // ---------------------------------------------------------------- siding
  let sidingFasteners = 0;
  const vb = -1.5; // laps 1-1/2" over the slab edge
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
          mat: tinMat, name: tinName + ' (siding)', info: `cut length ${ftin(pc.len)}`, group: 'siding', step: STEP.SIDING, ex: wallEx(w, 2.2, 1.5),
        });
        tinPieces.push({ stock: pc.stock, len: pc.len, use: 'siding' });
        sidingFasteners += (blockLevels.length + 2) * 5 * (pc.len / Lc);
      });
    }
  }
  const cb = { cat: 'framing', group: 'trim', step: STEP.SIDING, name: 'Corner trim (1x4)' };
  const cbBot = y0 + vb;
  const cbTop = yTop;
  const t0 = 0.85;
  b.lumberBox('1x4', 0, 3.5, cbBot, cbTop, D + t0, D + t0 + 0.75, { ...cb, ex: [0, 1.5 * EX, 2.5 * EX] });
  b.lumberBox('1x4', W - 3.5, W, cbBot, cbTop, D + t0, D + t0 + 0.75, { ...cb, ex: [0, 1.5 * EX, 2.5 * EX] });
  b.lumberBox('1x4', 0, 3.5, cbBot, cbTop, -t0 - 0.75, -t0, { ...cb, ex: [0, 1.5 * EX, -2.5 * EX] });
  b.lumberBox('1x4', W - 3.5, W, cbBot, cbTop, -t0 - 0.75, -t0, { ...cb, ex: [0, 1.5 * EX, -2.5 * EX] });
  b.lumberBox('1x4', -t0 - 0.75, -t0, cbBot, cbTop, D - 3.5, D, { ...cb, ex: [-2.5 * EX, 1.5 * EX, 0] });
  b.lumberBox('1x4', -t0 - 0.75, -t0, cbBot, cbTop, 0, 3.5, { ...cb, ex: [-2.5 * EX, 1.5 * EX, 0] });
  b.lumberBox('1x4', W + t0, W + t0 + 0.75, cbBot, cbTop, D - 3.5, D, { ...cb, ex: [2.5 * EX, 1.5 * EX, 0] });
  b.lumberBox('1x4', W + t0, W + t0 + 0.75, cbBot, cbTop, 0, 3.5, { ...cb, ex: [2.5 * EX, 1.5 * EX, 0] });

  // ---------------------------------------------------------------- windows & doors
  const winList = [];
  let nDoors = 0;
  const trimD = [-(t0 + 0.75), -t0];
  for (const w of Object.values(walls)) {
    for (const o of w.openings) {
      const { u0, u1, v0, v1 } = o;
      const isDoor = o.type === 'door';
      const step = isDoor ? STEP.DOOR : STEP.WINDOWS;
      const exOut = wallEx(w, 3.2, 1.5);
      const trimO = { cat: 'framing', group: 'trim', step, ex: wallEx(w, 2.8, 1.5), name: isDoor ? 'Door casing (1x4)' : 'Window casing (1x4)' };
      const addT = (a, c, va, vc) => {
        const [x0, x1, yy0, yy1, z0, z1] = wallBox(w, a, c, va, vc, trimD[0], trimD[1]);
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
        nDoors++;
        const jo = { cat: 'framing', group: 'door', step, ex: exOut, name: 'Door jamb (1x6)' };
        const addJ = (a, c, va, vc) => {
          const [x0, x1, yy0, yy1, z0, z1] = wallBox(w, a, c, va, vc, -0.75, 3.75);
          b.lumberBox('1x6', x0, x1, yy0, yy1, z0, z1, jo);
        };
        addJ(u0, u0 + 0.75, 0, v1);
        addJ(u1 - 0.75, u1, 0, v1);
        addJ(u0 + 0.75, u1 - 0.75, v1 - 0.75, v1);
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
        b.box(x0, x1, yy0, yy1, z0, z1, { mat: 'steel', group: 'door', step, ex: exOut, name: 'Hasp' });
      }
    }
  }

  // ---------------------------------------------------------------- interior plywood
  const wallPlyPieces = [];
  for (const w of Object.values(walls)) {
    const ua = 3.5;
    const ub = w.L - 3.5;
    for (let u = ua; u < ub - 0.5; u += 48) {
      const cw = Math.min(48, ub - u);
      for (let v = 0; v < H - 0.5; v += 96) {
        const rh = Math.min(96, H - v);
        const holes = w.openings.map((o) => ({ x0: o.u0 - u, x1: o.u1 - u, y0: o.v0 - v, y1: o.v1 - v }));
        const o = toW(w, u, v, 3.62);
        b.sheet(o, w.U, UP, w.n, { w: cw - 0.06, h: rh, corr: null, holes }, {
          mat: 'plyWall', name: PLY[P.wallPly].name + ' wall sheet', info: `${ftin(cw)} × ${ftin(rh)}`, group: 'interior', step: STEP.INTERIOR, ex: wallEx(w, -0.6, 1.5),
        });
        wallPlyPieces.push({ w: cw, h: rh });
      }
    }
  }

  // ---------------------------------------------------------------- quantities
  const postArea = 3 * 5.5;
  let holeVol = 0;
  for (let i = 0; i < posts.length; i++) {
    const depth = yS0 - (bottom - 4);
    if (depth > 0) holeVol += Math.PI * r * r * depth - postArea * Math.max(0, yS0 - bottom);
  }
  const slabVol = edge ? W * D * 4 + (2 * (W + D) * 12 - 4 * 144) * (P.slabT - 4) : W * D * P.slabT;
  const postInSlab = posts.length * postArea * (edge ? P.slabT : P.slabT);
  const concreteFt3 = (slabVol + holeVol - postInSlab) / 1728;
  const cementNet = concreteFt3 / BAG_YIELD_FT3;
  const plasticFt2 = ((W + 12) * (D + 12)) / 144;

  let n16 = 0;
  for (const l of b.lumber) {
    if (l.cat === 'formwork') n16 += 4;
    else if (l.cat === 'structure') n16 += Math.ceil(l.len / 12);
    else if (['1x4', '1x6', '1x8', '1x2', '1x3'].includes(l.size)) continue;
    else n16 += 4 + Math.floor(l.len / 24);
  }
  n16 += purlinRows * rafterXs.length * 2;
  let n8 = 0;
  for (const l of b.lumber) if (['1x4', '1x6', '1x8', '1x2', '1x3'].includes(l.size)) n8 += 4 + Math.floor(l.len / 12) * 2;
  const nPanel = wallPlyPieces.length * 50;
  const roofFast = Math.ceil(roofFasteners + sidingFasteners);

  // ---------------------------------------------------------------- steps
  const nPosts = posts.length;
  const diag = Math.hypot(W, D);
  const floorArea = (W * D) / 144;
  const roofPlanFt2 = ((W + 2 * R) * (D + 2 * E)) / 144;
  const nWin = winList.length;
  const rainGal = roofPlanFt2 * 0.623;
  const bagsR = Math.ceil(cementNet);
  const doorDesc = [P.doorsFront && `${P.doorsFront} in the front wall`, P.doorsBack && `${P.doorsBack} in the back wall`, P.doorsSide && `${P.doorsSide} in each end wall`].filter(Boolean).join(', ');
  const steps = [
    { title: 'Bare site', text: `Choose the highest, best-drained ground available and clear it. The foundation is ${ftin(W)} × ${ftin(D)} (${num(floorArea)} sq ft). Turn the long walls toward the prevailing trade winds so the louvres cross-ventilate.` },
    { title: 'Lay out & square the foundation', text: `Set batter boards about 2' outside each corner and stretch string lines on the outside edges of the slab at ${ftin(W)} and ${ftin(D)}. Square the layout by measuring the diagonals — both must be ${ftin(diag)}. Mark the ${nPosts} post centres: one at each corner and ${m} between the corners on every wall.` },
    { title: 'Excavate', text: `Dig the slab area out ${ftin(digDepth)} below grade so the ${edge ? 'thickened edge' : `${inch(P.slabT)} slab`} finishes ${inch(P.slabAbove)} above the ground${edge ? ` (trench the 12"-wide edge beam ${ftin(P.slabT)} deep around the perimeter)` : ''}. Then dig ${nPosts} post holes, ${inch(P.holeDia)} across, down to ${ftin(P.embed + 4)} below the finished slab. Compact the bottom.` },
    { title: 'Set posts, forms & rebar', text: `Each post is two 2x6s nailed together every 12", staggered. Wrap the part that goes into concrete in bitumen or heavy plastic. Stand the posts on 4" of concrete in their holes, plumb them both ways and brace them. Nail 2x6 form boards around the perimeter on stakes, with the top edge exactly level at slab height. Lay 6-mil plastic, then a ${inch(sp)} grid of 1/2" rebar on chairs at mid-depth, tied at the crossings and to the posts.` },
    { title: 'Pour the slab', text: `Pour the post holes and slab in one go — about ${num(concreteFt3)} ft³ (${num(concreteFt3 / 27, 1)} yd³) of 1 : 2 : 3 concrete, roughly ${bagsR} bags of cement. That is a big hand-mixing job: line up a crew, mixers or boards, and plenty of fresh water. Screed the top flat, slope it slightly toward the doors, and set 1/2" J-bolts for the wall plates (${anchors}) while the concrete is wet. Keep it damp under wet sacks for 7 days.` },
    { title: 'Frame the back wall', text: `Lay a strip of plastic or bitumen under the 2x4 bottom plate and bolt the plate to the slab. Frame between the posts with studs at ${inch(P.studSpacing)} on centre, ${blockLevels.length} rows of flat blocking for the siding, and a double top plate running over the posts. ${walls.back.openings.length ? `Openings: ${walls.back.openings.filter((o) => o.type === 'door').length} door, ${walls.back.openings.filter((o) => o.type === 'window').length} windows.` : ''}` },
    { title: 'Frame the front wall', text: `Frame the front wall the same way, with ${walls.front.openings.filter((o) => o.type === 'door').length} door openings (${ftin(doorRO.w)} × ${ftin(doorRO.h)} rough opening, doubled 2x6 headers) and ${walls.front.openings.filter((o) => o.type === 'window').length} windows. The bottom plate is cut out at each door.` },
    { title: 'Frame the end walls', text: `Frame both end walls. Each has ${walls.left.openings.filter((o) => o.type === 'door').length} door and ${walls.left.openings.filter((o) => o.type === 'window').length} louvre windows (${ftin(winRO.w)} × ${ftin(winRO.h)} rough opening, sill at ${ftin(sill)}). Windows are never more than ${ftin(S)} apart along a wall. Lap the top plates at the corners and strap every post to the plate.` },
    { title: 'Roof framing', text: `Gable roof at ${P.pitch}:12. Raise the 2x6 ridge board on temporary props, then set ${rafterXs.length} pairs of ${rafterSize} rafters at ${inch(P.rafterSpacing)} on centre with ${inch(E)} eave overhangs. Tie every rafter to the plate with a hurricane tie. Add 2x4 ceiling ties on alternate pairs to stop the walls spreading, and fill the gable ends with studs. Nail 1x6 fascia to the rafter tails.` },
    { title: 'Purlins', text: `Nail 2x4 purlins flat across the rafters, ${slopes.map((s) => s.purlins).join(' + ')} rows at no more than ${inch(P.purlinSpacing)} apart, overhanging the gable ends by ${inch(R)}.` },
    { title: 'Roofing', text: `Lay ${tinPieces.filter((t) => t.use === 'roof').length} pieces of ${clad === 'pvc' ? 'PVC' : 'galvanised metal'} sheet, starting at the end away from the prevailing wind. Lap one corrugation at the sides and ${inch(LAP)} at any end joints. Fasten through the crests with sealing-washer roofing fasteners${clad === 'pvc' ? ', pre-drilling oversized holes so the PVC can expand' : ''}. Finish with the ridge cap. Each inch of rain on the ${num(roofPlanFt2)} sq ft roof is about ${num(rainGal)} gallons — worth catching with gutters and a tank.` },
    { title: 'Siding', text: `Hang ${tinPieces.filter((t) => t.use === 'siding').length} ${clad === 'pvc' ? 'PVC' : 'metal'} siding pieces vertically, nailed to the bottom plate, blocking rows and top plate. Let them lap 1-1/2" down over the slab edge so rain drips clear. Cut the openings after the sheets are up and cover the corners with 1x4 trim.` },
    { title: 'Louvre windows', text: `Screw the ${P.windowH}' aluminium louvre frames into the ${nWin} window openings and slide in the ${winList.reduce((s, x) => s + x.blades, 0)} ${P.windowW}' glass blades. Trim the outside with 1x4 casing.` },
    { title: 'Doors', text: `Hang ${nDoors} doors (${doorDesc}). Each has 1x6 jambs and is built from vertical 1x6 boards with a 1x4 Z-brace — the diagonal runs up from the bottom hinge side. Use three galvanised T-hinges and a hasp per door, then trim the outside with 1x4 casing.` },
    { title: 'Interior walls', text: `Nail ${wallPlyPieces.length} pieces of ${PLY[P.wallPly].name} to the inside of the wall framing with 1-1/4" galvanised panel nails. The roof space stays open above the walls for ventilation.` },
    { title: 'Complete', text: `Finished: a ${ftin(W)} × ${ftin(D)} house on a concrete slab, with a gable ${clad === 'pvc' ? 'PVC' : 'metal'} roof, ${nPosts} posts, ${nWin} louvre windows and ${nDoors} doors. Recommended extras: insect screen behind the louvres, gutters and a water tank, and paint or oil on exposed wood.` },
  ];

  const dims = [
    { a: [0, y0 + 0.3, D + 18], b: [W, y0 + 0.3, D + 18], label: ftin(W) },
    { a: [W + 18, y0 + 0.3, 0], b: [W + 18, y0 + 0.3, D], label: ftin(D) },
  ];

  return {
    P, W, D, parts: b.parts, steps, dims, warnings,
    bounds: { min: [-R - 40, bottom - 4, -E - 40], max: [W + R + 40, roofTop(D / 2) + 12, D + E + 40] },
    q: {
      lumber: b.lumber,
      wallPly: { type: P.wallPly, pieces: wallPlyPieces },
      tin: tinPieces,
      ridgePieces,
      windows: winList,
      concreteFt3,
      cementNet,
      rebar,
      plasticFt2,
      anchors,
      ties,
      n16,
      n8,
      nPanel,
      roofFast,
      posts: posts.length,
      doors: nDoors,
    },
    info: {
      posts: nPosts, midPosts: m, rafterSize, diag, floorArea, roofPlanFt2, rainGal, maxPost, longSpan,
      studCount, sill, nWin, nDoors, concreteFt3, ridgeHeight: roofTop(D / 2), digDepth,
    },
  };
}
