// Parametric design for a one-toilet outhouse: a 4" slab with wire mesh,
// a hollow-block pony wall, 2x4 framing with corrugated sheet outside, a
// single-slope (shed) roof, screened vents high on the side walls, and a
// drain to either a seawater-flushed outfall into the lagoon or a pit.
//
// Same coordinates as the house (inches): X = width (left→right seen from
// the door), Y = up (ground = 0), Z = depth (back wall at z=0, door wall at
// z=D). The water is behind the toilet, toward -Z.

import * as THREE from 'three';
import { LUMBER, MESH, QUOTE, BLOCK, PIPE_OD } from './catalog.js';
import { Builder, sheetRun, splitRange, subtract, CORR, LAP, EX } from './design.js';
import { ftin, inch, num } from './format.js';

export const TDEFAULTS = {
  width: 5, // ft, outside of the block wall
  depth: 6, // ft
  cladding: 'metal',
  // slab and block pony wall
  floorAbove: 4, // top of slab above grade, in
  slabT: 4,
  apron: 18, // slab carried out in front of the door, in
  blockT: 6, // nominal block thickness, in
  courses: 3, // 8" courses of block
  meshFrom: 'house', // 'house' (offcut of the house's roll) | 'buy'
  // framing and roof
  lowH: 84, // top of the back (low) wall above the floor, in
  pitch: 3,
  eave: 12,
  rake: 12,
  studSpacing: 24,
  purlinSpacing: 24,
  tinCover: 30,
  // door and vents
  doorW: 30,
  doorH: 80,
  ventBottom: 72, // above the floor, in
  ventH: 8,
  // waste
  waste: 'outfall', // 'outfall' | 'pit'
  pipeD: 3, // drain pipe, in
  shore: 25, // back wall to the water's edge, ft
  outfall: 100, // pipe beyond the water's edge, ft
  flushGal: 1.5, // seawater per flush, gal
  users: 6,
  pitDepth: 48, // in, below grade
  waterTable: 36, // groundwater below grade, in
  // contingency, tax, freight
  ovTin: 10,
  ovFraming: 10,
  ovFasteners: 15,
  ovCement: 15,
  ovBlock: 10,
  ovPlumbing: 10,
  freight: 0,
  tax: QUOTE.tax,
};

export const TSTEP = {
  SITE: 0, DRAIN: 1, FORMS: 2, SLAB: 3, BLOCKS: 4, FRAME: 5, ROOF_FRAME: 6, PURLINS: 7,
  ROOFING: 8, SIDING: 9, SCREENS: 10, DOOR: 11, TOILET: 12, WASTE: 13, DONE: 14,
};

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
const FW = 3.5; // depth of the 2x4 walls
const SLOPE = 0.25; // drain fall, in per ft
const PIT = { w: 36, l: 48, gap: 36 }; // pit inside size and distance behind the back wall
const ROUGH_IN = 12; // back wall to the centre of the toilet outlet

export function toiletDesign(P) {
  const b = new Builder();
  const warnings = [];
  const W = P.width * 12;
  const D = P.depth * 12;
  const Ds = D + P.apron; // slab depth
  const T = P.slabT;
  const y0 = P.floorAbove;
  const bt = P.blockT - BLOCK.joint; // actual block thickness
  const PH = P.courses * 8;
  const p = P.pitch / 12;
  const theta = Math.atan(p);
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const E = P.eave;
  const R = P.rake;
  const tinW = P.tinCover + 3;
  const pit = P.waste === 'pit';

  // The rafters' underside runs through the inside edge of the back wall
  // plate and the outside edge of the front one, so both get a full seat.
  const yb = y0 + P.lowH;
  const yu = (z) => yb + (z - FW) * p;
  const yf = yu(D);
  const rafterSize = D - 2 * FW > 96 ? '2x6' : '2x4';
  const rd = LUMBER[rafterSize].w;
  const rafterTop = (z) => yu(z) + rd / cos;
  const roofTop = (z) => rafterTop(z) + 1.5 / cos;
  const nrm = V(0, cos, -sin); // roof normal
  const upSlope = V(0, sin, cos);

  // ---------------------------------------------------------------- walls
  const mkWall = (key, O, U, n, L) => ({ key, O, U, n, L });
  const walls = {
    back: mkWall('back', V(W, y0, 0), V(-1, 0, 0), V(0, 0, -1), W),
    front: mkWall('front', V(0, y0, D), V(1, 0, 0), V(0, 0, 1), W),
    left: mkWall('left', V(0, y0, 0), V(0, 0, 1), V(-1, 0, 0), D),
    right: mkWall('right', V(W, y0, D), V(0, 0, -1), V(1, 0, 0), D),
  };
  walls.left.z = (u) => u;
  walls.right.z = (u) => D - u;
  const toW = (w, u, v, d) => w.O.clone().addScaledVector(w.U, u).addScaledVector(UP, v).addScaledVector(w.n, -d);
  const wallBox = (w, u0, u1, v0, v1, d0, d1) => {
    const a = toW(w, u0, v0, d0);
    const c = toW(w, u1, v1, d1);
    return [Math.min(a.x, c.x), Math.max(a.x, c.x), Math.min(a.y, c.y), Math.max(a.y, c.y), Math.min(a.z, c.z), Math.max(a.z, c.z)];
  };
  const wallEx = (w, out, layer) => [w.n.x * out * EX, layer * EX, w.n.z * out * EX];
  const wDir = (w, a, bb, c) => w.U.clone().multiplyScalar(a).addScaledVector(UP, bb).addScaledVector(w.n, -c).normalize();
  const fastW = (w, shape, u, v, d, out, o) => b.fasten(shape, toW(w, u, v, d), out, o);
  const boxW = (w, u0, u1, v0, v1, d0, d1, o) => {
    const [x0, x1, yy0, yy1, z0, z1] = wallBox(w, u0, u1, v0, v1, d0, d1);
    return b.box(x0, x1, yy0, yy1, z0, z1, o);
  };
  const lumberW = (w, size, u0, u1, v0, v1, d0, d1, o) => {
    const [x0, x1, yy0, yy1, z0, z1] = wallBox(w, u0, u1, v0, v1, d0, d1);
    return b.lumberBox(size, x0, x1, yy0, yy1, z0, z1, o);
  };
  const spread = (lo, hi, n, m = 3) => {
    const k = Math.min(m, (hi - lo) / 4);
    return n <= 1 ? [(lo + hi) / 2] : Array.from({ length: n }, (_, i) => lo + k + ((hi - lo - 2 * k) * i) / (n - 1));
  };
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
  const toeFlat = (w, s0, e0, vTopFace, o) => {
    for (const d of [1.2, 2.3]) {
      fastW(w, 'nail16', s0 + 1.25, vTopFace, d, wDir(w, 0.5, 0.866, 0), o);
      fastW(w, 'nail16', e0 - 1.25, vTopFace, d, wDir(w, -0.5, 0.866, 0), o);
    }
  };
  // a round part (pipe, rebar) along a→c
  const rod = (a, c, r, o) => {
    const dir = c.clone().sub(a);
    const len = dir.length();
    const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize());
    return b.add({ kind: 'cyl', r, h: len, pos: a.clone().add(c).multiplyScalar(0.5).toArray(), quat: q.toArray(), ...o });
  };

  // ---------------------------------------------------------------- openings
  const doorRO = { w: P.doorW + 2, h: P.doorH + 1.5 };
  const r0 = W / 2 - doorRO.w / 2;
  const r1 = W / 2 + doorRO.w / 2;
  const hRO = doorRO.h;
  const Hf = yf - y0; // top of the front wall plate above the floor
  if (r0 - 3 < 1.5 + 2) warnings.push(`A ${inch(P.doorW)} door is too wide for a ${ftin(W)} front wall.`);
  if (hRO + 3.5 > Hf - 1.5) warnings.push(`The front wall is too low for a ${ftin(P.doorH)} door and its header: raise the back wall or the roof pitch.`);
  if (PH > hRO - 6) warnings.push('The block wall is nearly as tall as the door.');
  // the vent band runs the length of both side walls, just under the roof
  let vb = P.ventBottom;
  const vh = P.ventH;
  const sideTopMin = yu(FW + 1.5) - y0 - 1.5 / cos; // underside of the raked plate at its low end
  if (vb + vh + 1.5 > sideTopMin - 0.5) {
    const nv = Math.floor(sideTopMin - 2 - vh - 1.5);
    warnings.push(`The vents were lowered from ${ftin(vb)} to ${ftin(nv)} to fit under the low end of the roof.`);
    vb = nv;
  }
  if (vb < PH + 12) warnings.push('The vents are below the top of the block wall.');
  const vt = vb + vh;
  if (vb < 66) warnings.push(`The vent sill (${ftin(vb)}) is below eye level: people outside can see in.`);
  const innerW = W - 2 * bt;
  const innerD = D - 2 * bt;
  if (innerW < 32) warnings.push(`Only ${inch(innerW)} clear between the block walls; a toilet needs 30" or more.`);
  if (innerD < 48) warnings.push(`Only ${inch(innerD)} clear front to back; allow at least 21" in front of the bowl.`);

  // ---------------------------------------------------------------- existing ground, water
  const zShore = -P.shore * 12;
  const waterO = { mat: 'water', name: 'Lagoon', info: `water's edge ${ftin(-zShore)} behind the toilet` };
  b.box(-2400, W + 2400, 0.4, 5, zShore - 3600, zShore, waterO);

  // ---------------------------------------------------------------- rafter layout (studs line up under it)
  const rafterXs = [0.75];
  for (let c = P.studSpacing; c < W - 0.75 - 6; c += P.studSpacing) rafterXs.push(c);
  rafterXs.push(W - 0.75);
  // the toilet sits behind the vent stack, in the rafter bay nearest the middle
  const mids = rafterXs.slice(1).map((x, i) => (x + rafterXs[i]) / 2).filter((x) => x - bt >= 15 && W - bt - x >= 15);
  const tx = mids.length ? mids.reduce((a, x) => (Math.abs(x - W / 2) < Math.abs(a - W / 2) ? x : a), mids[0]) : W / 2;
  const zo = bt + ROUGH_IN; // toilet outlet

  // ---------------------------------------------------------------- drain under the slab
  const pD = P.pipeD;
  const pr = PIPE_OD[pD] / 2;
  const vr = PIPE_OD[2] / 2;
  const pipeO = (step, name, ex = [0, 0, 0]) => ({ mat: 'pvcPipe', group: 'plumbing', step, ex, name });
  const mainPipes = []; // pipe runs (in) cut from 10' lengths
  const ventPipes = [];
  const runs = []; // long joined runs, for couplings
  const yd0 = y0 - T - pr - 1; // pipe centre under the slab at the toilet
  const fall = (z0, z1) => (Math.abs(z1 - z0) / 12) * SLOPE;
  const zc = -10; // cleanout, just outside the back wall
  const ydc = yd0 - fall(zo, zc);
  const exDrain = [0, -1.2 * EX, 0];
  rod(V(tx, y0, zo), V(tx, yd0, zo), pr, pipeO(TSTEP.DRAIN, `${pD}" closet bend from the toilet`, exDrain));
  rod(V(tx, yd0, zo), V(tx, ydc, zc), pr, pipeO(TSTEP.DRAIN, `${pD}" drain under the slab, falling ${inch(SLOPE)} per foot`, exDrain));
  b.cyl(tx, zo, pr + 1.2, y0 - 0.4, y0 + 0.05, { mat: 'pvcPipe', group: 'plumbing', step: TSTEP.DRAIN, ex: exDrain, name: 'Closet flange' });
  mainPipes.push(y0 - yd0 + 2, zo - zc);
  // cleanout riser with a screw plug, a couple of inches above the sand
  b.cyl(tx, zc, pr, ydc, 3, pipeO(TSTEP.DRAIN, 'Cleanout: wye and screw plug — rod the outfall from here', exDrain));
  b.cyl(tx, zc, pr + 0.4, 3, 4.2, { ...pipeO(TSTEP.DRAIN, 'Cleanout plug', exDrain), mat: 'rubber' });
  mainPipes.push(3 - ydc);

  // ---------------------------------------------------------------- outfall or pit
  const collars = [];
  let outEnd = null;
  let landRun = 0;
  let seaRun = 0;
  let pitInfo = null;
  const exWaste = [0, 0, 0];
  if (!pit) {
    // buried run down the beach, then out along the bottom
    const ys = ydc - fall(zc, zShore);
    rod(V(tx, ydc, zc), V(tx, ys, zShore), pr, pipeO(TSTEP.WASTE, `${pD}" outfall, buried, falling ${inch(SLOPE)} per foot`, exWaste));
    const zb = zShore - 48; // where the pipe comes out onto the bottom
    rod(V(tx, ys, zShore), V(tx, pr + 0.2, zb), pr, pipeO(TSTEP.WASTE, `${pD}" outfall at the water's edge (two 45° bends)`, exWaste));
    const zEnd = zShore - P.outfall * 12;
    rod(V(tx, pr + 0.2, zb), V(tx, pr + 0.2, zEnd), pr, pipeO(TSTEP.WASTE, `${pD}" outfall along the bottom`, exWaste));
    landRun = zc - zShore;
    seaRun = zShore - zEnd;
    runs.push(landRun + 50 + seaRun - 48);
    for (const l of [landRun, 52, seaRun - 48]) for (const [s, e] of splitRange(0, l, [], 120)) mainPipes.push(e - s);
    // concrete collars hold it down every 10 ft
    const co = { mat: 'concrete', group: 'waste', step: TSTEP.WASTE, ex: exWaste, name: 'Concrete collar (cast in a bucket) to hold the pipe down' };
    for (let z = zb - 24; z > zEnd + 12; z -= 120) {
      rod(V(tx, pr + 0.2, z + 3), V(tx, pr + 0.2, z - 3), pr + 3, co);
      collars.push(z);
    }
    // flap valve stops waves and crabs pushing up the pipe
    b.box(tx - pr - 0.4, tx + pr + 0.4, 0.2, 2 * pr + 0.6, zEnd - 5, zEnd, { mat: 'rubber', group: 'waste', step: TSTEP.WASTE, ex: exWaste, name: 'Flap check valve on the outlet' });
    outEnd = zEnd - 5;
  } else {
    // block-lined pit behind the toilet, covered with a concrete lid
    const px0 = tx - PIT.w / 2;
    const px1 = tx + PIT.w / 2;
    const pz1 = -PIT.gap - bt; // near inside face
    const pz0 = pz1 - PIT.l;
    const yPit = -P.pitDepth;
    const zIn = pz1;
    const yIn = ydc - fall(zc, zIn);
    rod(V(tx, ydc, zc), V(tx, yIn, zIn + 1), pr, pipeO(TSTEP.WASTE, `${pD}" drain to the pit`, exWaste));
    mainPipes.push(zc - zIn);
    landRun = zc - zIn;
    pitInfo = { px0, px1, pz0, pz1, yPit };
  }

  // ---------------------------------------------------------------- slab: formwork, plastic, mesh, dowels
  const formO = { cat: 'formwork', group: 'forms', step: TSTEP.FORMS, stepTo: TSTEP.SLAB, ex: [0, 0, 0] };
  const formH = y0 + 1; // the boards are dug in an inch
  const layers = Math.ceil(formH / 5.5);
  const formRing = (x0, x1, z0, z1, label) => {
    for (let k = 0; k < layers; k++) {
      const ya = y0 - 5.5 * (k + 1);
      const yb2 = y0 - 5.5 * k;
      for (const [s, e] of splitRange(x0 - 0.75, x1 + 0.75, [], 192)) {
        b.lumberBox('1x6', s, e, ya, yb2, z0 - 0.75, z0, { ...formO, name: `${label} form board (1x6)` });
        b.lumberBox('1x6', s, e, ya, yb2, z1, z1 + 0.75, { ...formO, name: `${label} form board (1x6)` });
      }
      for (const [s, e] of splitRange(z0, z1, [], 192)) {
        b.lumberBox('1x6', x0 - 0.75, x0, ya, yb2, s, e, { ...formO, name: `${label} form board (1x6)` });
        b.lumberBox('1x6', x1, x1 + 0.75, ya, yb2, s, e, { ...formO, name: `${label} form board (1x6)` });
      }
    }
    // 18" stakes about every 32"
    const stake = (x, z) => b.lumberBox('2x4', x - 0.75, x + 0.75, -12, y0 - 0.5, z - 1.75, z + 1.75, { ...formO, name: 'Form stake (2x4 × 18")' });
    const stakeX = (x0b, x1b, z) => { for (const x of spread(x0b, x1b, Math.ceil((x1b - x0b) / 32) + 1, 4)) stake(x, z); };
    stakeX(x0, x1, z0 - 2.5);
    stakeX(x0, x1, z1 + 2.5);
    for (const z of spread(z0, z1, Math.ceil((z1 - z0) / 32) + 1, 6)) {
      b.lumberBox('2x4', x0 - 4.25, x0 - 0.75, -12, y0 - 0.5, z - 0.75, z + 0.75, { ...formO, name: 'Form stake (2x4 × 18")' });
      b.lumberBox('2x4', x1 + 0.75, x1 + 4.25, -12, y0 - 0.5, z - 0.75, z + 0.75, { ...formO, name: 'Form stake (2x4 × 18")' });
    }
  };
  formRing(0, W, 0, Ds, 'Slab');
  const slabO = { group: 'slab', step: TSTEP.FORMS, stepTo: TSTEP.FORMS, ex: [0, 0, 0] };
  b.box(0, W, y0 - T - 0.1, y0 - T, 0, Ds, { ...slabO, mat: 'plastic', name: '6-mil plastic under the slab' });
  if (y0 - T > 0.5) b.box(0, W, 0, y0 - T - 0.1, 0, Ds, { mat: 'fill', group: 'slab', step: TSTEP.FORMS, ex: [0, 0, 0], name: `Compacted sand / coral fill, ${inch(y0 - T)}` });
  // Welded mesh: one 7' strip covers most toilet slabs; lapped 6" if not.
  const meshStrips = [];
  const meshAt = (lo, hi, o) => {
    const g = MESH.grid;
    const r = MESH.wire;
    const plan = (a) => {
      const L = hi[a] - lo[a];
      const across = hi[1 - a] - lo[1 - a];
      const n = across <= MESH.w ? 1 : Math.ceil((across - MESH.w) / (MESH.w - g)) + 1;
      return { a, L, n, tot: L * n };
    };
    const px = plan(0);
    const pz = plan(1);
    const best = px.tot <= pz.tot ? px : pz;
    const a = best.a;
    const wire = (u0, u1, c0, c1, yy) => {
      const [x0, x1, z0, z1] = a === 0 ? [u0, u1, c0, c1] : [c0, c1, u0, u1];
      b.box(x0, x1, yy, yy + r, z0, z1, o);
    };
    for (let k = 0; k < best.n; k++) {
      const c0 = lo[1 - a] + k * (MESH.w - g);
      const c1 = Math.min(c0 + MESH.w, hi[1 - a]);
      const yy = o.yMesh + (k % 2) * 2 * r;
      for (let c = c0; c <= c1 + 0.01; c += g) wire(lo[a], hi[a], c - r / 2, c + r / 2, yy + r);
      for (let u = lo[a]; u <= hi[a] + 0.01; u += g) wire(u - r / 2, u + r / 2, c0, c1, yy);
      meshStrips.push(best.L);
    }
    return best;
  };
  const meshO = { mat: 'steel', group: 'slab', step: TSTEP.FORMS, stepTo: TSTEP.FORMS, ex: [0, 0, 0], name: 'Galv. wire mesh #10, 6" × 6"' };
  const slabMesh = meshAt([3, 3], [W - 3, Ds - 3], { ...meshO, yMesh: y0 - T / 2 });
  b.box(0, W, y0 - T, y0, 0, Ds, { mat: 'slab', name: `Slab, ${inch(T)} thick`, group: 'slab', step: TSTEP.SLAB, ex: [0, -0.8 * EX, 0] });
  // a hole is left in the slab for the closet flange
  const slabFt3 = (W * Ds * T) / 1728;

  // ---------------------------------------------------------------- block pony wall
  const BL = BLOCK.len;
  const BJ = BLOCK.joint;
  const blockPieces = [];
  for (let k = 0; k < P.courses; k++) {
    for (const w of Object.values(walls)) {
      const long = w.key === 'front' || w.key === 'back';
      const through = (k % 2 === 0) === long;
      const [ua, ub] = through ? [0, w.L] : [bt + BJ, w.L - bt - BJ];
      const gaps = w.key === 'front' ? [[r0, r1]] : [];
      const bo = { mat: 'block', group: 'blocks', step: TSTEP.BLOCKS, ex: wallEx(w, 0.25, 0.5), name: `${P.blockT}" hollow concrete block` };
      for (const [s, e] of subtract(ua, ub, gaps)) {
        // mortar set back from every exposed face shows as tooled joints
        // (and never shares a face with a block, which would z-fight)
        const ms = s === ua && !through ? s - BJ : s + 0.35;
        const me = e === ub && !through ? e + BJ : e - 0.35;
        const mt = k * 8 + 8 - (k === P.courses - 1 ? 0.35 : 0);
        boxW(w, ms, me, k * 8, mt, 0.35, bt - 0.35, { ...bo, mat: 'mortar', name: 'Mortar, 1 : 4' });
        let u = s;
        while (u < e - 0.5) {
          const rem = e - u;
          // never leave a sliver at the end: split the last two blocks evenly
          const len = rem <= BL ? rem : rem - BL - BJ < 4 ? (rem - BJ) / 2 : BL;
          boxW(w, u, u + len, k * 8 + BJ, k * 8 + 8, 0, bt, { ...bo, info: len < BL - 0.1 ? `cut to ${ftin(len)}` : 'whole block' });
          blockPieces.push({ len, label: 'Wall block' });
          u += len + BJ;
        }
      }
    }
  }

  // ---------------------------------------------------------------- bottom plates and anchor bolts
  const plateRuns = {
    front: subtract(0, W, [[r0, r1]]),
    back: [[0, W]],
    left: [[FW, D - FW]],
    right: [[FW, D - FW]],
  };
  // studs: in line with the rafters on the front and back, at the stud
  // spacing on the sides
  const studU = {
    front: rafterXs.map((x) => x),
    back: rafterXs.map((x) => W - x),
    left: [], right: [],
  };
  for (const k of ['left', 'right']) {
    studU[k].push(FW + 0.75, D - FW - 0.75);
    for (let g = P.studSpacing; g < D; g += P.studSpacing) if (g > FW + 5 && g < D - FW - 5) studU[k].push(g);
    studU[k].sort((a, c) => a - c);
  }
  const cells = []; // grouted, reinforced block cells: { w, u }
  const addCell = (w, u) => { if (!cells.some((c) => c.w === w && Math.abs(c.u - u) < 6)) cells.push({ w, u }); };
  for (const k of ['front', 'back']) { addCell(walls[k], 4); addCell(walls[k], W - 4); }
  addCell(walls.front, r0 - 4);
  addCell(walls.front, r1 + 4);
  for (const w of Object.values(walls)) {
    const fo = { cat: 'framing', group: 'wall', step: TSTEP.FRAME, ex: wallEx(w, 0.6, 1.5) };
    const bolts = { group: 'wall', step: TSTEP.FRAME, ex: wallEx(w, 0.6, 1.5), name: '1/2" anchor bolt, nut & washer (set in a grouted cell)' };
    for (const [s, e] of plateRuns[w.key]) {
      lumberW(w, '2x4', s, e, PH, PH + 1.5, 0, FW, { ...fo, name: 'Bottom plate on the blocks (2x4)' });
      // a bolt 6" from each end and at most 32" apart, clear of the studs
      for (let u of spread(s + 3, e - 3, Math.max(2, Math.ceil((e - s - 12) / 32) + 1), 3)) {
        for (let i = 0; i < 4 && studU[w.key].some((x) => Math.abs(x - u) < 1.7); i++) u += u + 2.6 < e ? 2.6 : -2.6;
        fastW(w, 'wedge', u, PH + 1.5, FW / 2, UP, bolts);
        addCell(w, u);
      }
    }
  }
  // #4 dowels hooked into the slab tie each grouted cell down
  const rebarPieces = [];
  const dowelO = { mat: 'rebar', group: 'slab', step: TSTEP.FORMS, ex: [0, 0, 0], name: '#4 rebar dowel, hooked into the slab' };
  for (const c of cells) {
    const top = toW(c.w, c.u, PH - 2, bt / 2);
    const bot = toW(c.w, c.u, -T + 1.5, bt / 2);
    const hook = bot.clone().addScaledVector(c.w.n, -10);
    rod(bot, top, 0.25, dowelO);
    rod(bot, hook, 0.25, dowelO);
    rebarPieces.push({ len: PH - 3.5 + T + 10, label: 'Dowel' });
  }
  const coreFt3 = ((BL * bt * 0.5) / 2 * 8) / 1728; // one core, one course
  const groutFt3 = cells.length * P.courses * coreFt3 * 1.1;

  // ---------------------------------------------------------------- wall framing
  const vents = [];
  const girtRows = {}; // rows of horizontal framing behind the siding, for screws
  const sidePlateTop = (w, u) => yu(w.z(u)) - y0; // top of the raked plate
  for (const w of Object.values(walls)) {
    const side = w.key === 'left' || w.key === 'right';
    const fo = { cat: 'framing', group: 'wall', step: TSTEP.FRAME, ex: wallEx(w, 0.6, 1.5) };
    const nailO = { ...fo, name: '16d 3-1/2" galv. framing nail' };
    const add = (name, size, u0, u1, v0, v1, d0 = 0, d1 = FW) => lumberW(w, size, u0, u1, v0, v1, d0, d1, { ...fo, name });
    const vbot = PH + 1.5;
    const topOf = side ? (u) => sidePlateTop(w, u) - 1.5 / cos : () => (w.key === 'front' ? Hf : P.lowH) - 1.5;
    const rows = [PH + 0.75];
    // top plate
    if (side) {
      const pt = (u) => toW(w, u, sidePlateTop(w, u) - 0.75 / cos, FW / 2);
      b.member(pt(FW), pt(D - FW), '2x4', w.n.clone().negate(), { ...fo, name: 'Raked top plate (2x4)' });
    } else {
      for (const [s, e] of splitRange(0, W, [], 192)) add('Top plate (2x4)', '2x4', s, e, topOf(0), topOf(0) + 1.5);
      rows.push(topOf(0) + 0.3);
    }
    const verticals = [];
    const stud = (name, u0, u1, v0, v1) => {
      add(name, '2x4', u0, u1, v0, v1);
      toeEnds(w, u0, u1, v0, v1, nailO);
      verticals.push([u0, u1, v0, v1]);
    };
    const door = w.key === 'front';
    const nearDoor = (u) => door && u > r0 - 5 && u < r1 + 5;
    for (const u of studU[w.key]) {
      if (nearDoor(u)) continue;
      const u0 = Math.max(side ? FW : 0, u - 0.75);
      const u1 = Math.min(side ? D - FW : W, u0 + 1.5);
      stud('Stud', u1 - 1.5, u1, vbot, topOf(u));
    }
    if (door) {
      stud('King stud', r0 - 3, r0 - 1.5, vbot, topOf(0));
      stud('King stud', r1 + 1.5, r1 + 3, vbot, topOf(0));
      stud('Trimmer stud', r0 - 1.5, r0, vbot, hRO);
      stud('Trimmer stud', r1, r1 + 1.5, vbot, hRO);
      for (const d0 of [0.25, 1.75]) add('Door header (2x4 on edge)', '2x4', r0 - 1.5, r1 + 1.5, hRO, hRO + 3.5, d0, d0 + 1.5);
      for (const d of [1.0, 2.5]) for (const v of [hRO + 1, hRO + 2.5]) {
        fastW(w, 'nail16', r0 - 3, v, d, w.U.clone().negate(), nailO);
        fastW(w, 'nail16', r1 + 3, v, d, w.U, nailO);
      }
      const ct = topOf(0);
      if (ct - (hRO + 3.5) > 2) {
        for (const u of studU.front.filter((x) => x > r0 + 1 && x < r1 - 1)) {
          add('Cripple stud', '2x4', u - 0.75, u + 0.75, hRO + 3.5, ct);
          toeEnds(w, u - 0.75, u + 0.75, hRO + 3.5, ct, nailO);
        }
      }
    }
    verticals.sort((x, y) => x[0] - y[0]);
    // girts for the siding: rows no more than 32" apart
    const girt = (lv, name) => {
      for (let i = 0; i + 1 < verticals.length; i++) {
        const s = verticals[i][1];
        const e = verticals[i + 1][0];
        if (e - s < 3) continue;
        if (Math.min(verticals[i][3], verticals[i + 1][3]) < lv + 2) continue;
        if (door && s >= r0 - 0.1 && e <= r1 + 0.1 && lv < hRO + 4) continue;
        add(name, '2x4', s, e, lv - 0.75, lv + 0.75);
        toeFlat(w, s, e, lv + 0.75, nailO);
      }
      rows.push(lv);
    };
    if (side) {
      const span = vb - 1.5 - vbot;
      const n = Math.max(0, Math.ceil(span / 32) - 1);
      for (let j = 1; j <= n; j++) girt(vbot + (span * j) / (n + 1), 'Girt (flat 2x4)');
      girt(vb - 0.75, 'Vent sill (flat 2x4)');
      girt(vt + 0.75, 'Vent head (flat 2x4)');
      vents.push({ w, u0: FW + 0.75, u1: D - FW - 0.75, v0: vb, v1: vt });
    } else {
      const top = topOf(0);
      const span = top - vbot;
      const n = Math.max(1, Math.ceil(span / 32) - 1);
      for (let j = 1; j <= n; j++) girt(vbot + (span * j) / (n + 1), 'Girt (flat 2x4)');
    }
    girtRows[w.key] = rows.sort((x, y) => x - y);
  }

  // ---------------------------------------------------------------- roof framing
  const roofEx = [0, 3.5 * EX, 0];
  const rafterOpt = { cat: 'framing', group: 'roof', step: TSTEP.ROOF_FRAME, ex: roofEx, name: `Rafter (${rafterSize})` };
  const roofNail = { group: 'roof', step: TSTEP.ROOF_FRAME, ex: roofEx, name: '16d 3-1/2" galv. framing nail' };
  const tieO = { mat: 'steel', group: 'roof', step: TSTEP.ROOF_FRAME, ex: roofEx, name: 'Hurricane tie (galv.)' };
  const tieNail = { ...roofNail, name: 'Hurricane tie nail 8d 1-1/2"' };
  const profile = [
    [-E, yu(-E)], [0, yu(0)], [0, yb], [FW, yb], [D - FW, yu(D - FW)], [D - FW, yf], [D, yf], [D + E, yu(D + E)],
    [D + E, rafterTop(D + E)], [-E, rafterTop(-E)],
  ];
  const rafterLen = (D + 2 * E) / cos;
  let ties = 0;
  rafterXs.forEach((x) => {
    b.prism(profile, x - 0.75, x + 0.75, rafterSize, rafterLen, rafterOpt);
    const sx = x < W / 2 ? 1 : -1; // ties on the side facing the middle
    const xf = x + sx * 0.75;
    for (const [zp0, zp1, yp, zin] of [[0, FW, yb, FW], [D - FW, D, yf, D - FW]]) {
      for (const k of [1, -1]) b.fasten('nail16', V(x + k * 0.75, yp + 1.25, (zp0 + zp1) / 2), V(k * 0.5, 0.866, 0), roofNail);
      const inward = zin === FW ? 1 : -1;
      const xs = (a, c) => [Math.min(xf + sx * a, xf + sx * c), Math.max(xf + sx * a, xf + sx * c)];
      let [xa, xc] = xs(0, 0.06);
      b.box(xa, xc, yp + 0.1, yp + 3.4, Math.min(zp0, zp1) + 0.6, Math.max(zp0, zp1) - 0.6, tieO);
      [xa, xc] = xs(0, 1.75);
      const zf = zin + inward * 0.06;
      b.box(xa, xc, yp - 1.4, yp, Math.min(zin, zf), Math.max(zin, zf), tieO);
      ties++;
      for (const y of [yp + 1.2, yp + 2.6]) for (const z of [zp0 + 1.2, zp1 - 1.2]) b.fasten('tieNail', V(xf + sx * 0.06, y, z), V(sx, 0, 0), tieNail);
      for (const xo of [0.5, 1.25]) b.fasten('tieNail', V(xf + sx * xo, yp - 0.7, zf), V(0, 0, inward), tieNail);
    }
  });
  // frieze blocks close the eaves between the rafters
  const friezeO = { ...rafterOpt, name: 'Frieze block between rafters (2x4)' };
  for (const [z0, z1, yp] of [[0, 1.5, yb], [D - 1.5, D, yf]]) {
    for (let i = 0; i + 1 < rafterXs.length; i++) {
      const s = rafterXs[i] + 0.75;
      const e = rafterXs[i + 1] - 0.75;
      if (e - s < 2) continue;
      b.lumberBox('2x4', s, e, yp, Math.min(yp + 3.5, rafterTop((z0 + z1) / 2) - 0.05), z0, z1, friezeO);
      for (const xn of [s + 0.6, e - 0.6]) b.fasten('nail16', V(xn, yp + 1.5, (z0 + z1) / 2), V(xn < (s + e) / 2 ? -0.5 : 0.5, 0.866, 0), roofNail);
    }
  }
  // fascia on the rafter tails
  for (const [za, zt] of [[-E - 0.75, -E], [D + E, D + E]]) {
    const yt = rafterTop(zt);
    const fasO = { cat: 'framing', group: 'roof', step: TSTEP.ROOF_FRAME, ex: [0, 3.5 * EX, (zt < 0 ? -0.4 : 0.4) * EX], name: 'Fascia (1x6)' };
    for (const [xa, xb] of splitRange(-R, W + R, rafterXs, 192)) b.lumberBox('1x6', xa, xb, yt - 5.5, yt, za, za + 0.75, fasO);
    const zOut = zt < 0 ? za : za + 0.75;
    for (const x of rafterXs) for (const y of [yt - 1.2, yt - 3]) b.fasten('nail8', V(x, y, zOut), V(0, 0, zt < 0 ? -1 : 1), { ...fasO, name: '8d 2-1/2" galv. nail' });
  }

  // ---------------------------------------------------------------- purlins
  // one over each wall line closes the eave, the rest spread evenly
  const keys = [-E + 1.75, 1.75, D - 1.75, D + E - 1.75].sort((a, c) => a - c);
  const fixedZ = [];
  for (const k of keys) if (!fixedZ.some((z) => Math.abs(z - k) < 4)) fixedZ.push(k);
  const purlinZ = [...fixedZ];
  for (let i = 1; i < fixedZ.length; i++) {
    const a = fixedZ[i - 1];
    const c = fixedZ[i];
    const n = Math.ceil((c - a) / cos / P.purlinSpacing);
    for (let j = 1; j < n; j++) purlinZ.push(a + ((c - a) * j) / n);
  }
  purlinZ.sort((a, c) => a - c);
  const purO = { cat: 'framing', group: 'purlins', step: TSTEP.PURLINS, ex: [0, 5 * EX, 0], name: 'Purlin (2x4 flat)' };
  for (const z of purlinZ) {
    const y = rafterTop(z);
    for (const [xa, xb] of splitRange(-R, W + R, rafterXs, 192)) {
      b.member(V(xa, y, z).addScaledVector(nrm, 0.75), V(xb, y, z).addScaledVector(nrm, 0.75), '2x4', upSlope, purO);
      for (const x of rafterXs) {
        if (x < xa - 0.01 || x > xb + 0.01) continue;
        const xn = Math.min(xb - 0.5, Math.max(xa + 0.5, x));
        for (const k of [-1, 1]) b.fasten('nail16', V(xn, y, z).addScaledVector(nrm, 1.5).addScaledVector(upSlope, k), nrm, { ...purO, name: '16d 3-1/2" galv. framing nail' });
      }
    }
  }
  // blocking between the purlins over each end rafter closes the rake
  for (const xc of [1.75, W - 1.75]) {
    for (let i = 0; i + 1 < purlinZ.length; i++) {
      const za = purlinZ[i] + 1.75 * cos;
      const zb = purlinZ[i + 1] - 1.75 * cos;
      if (zb - za < 2 || za < 0 || zb > D) continue;
      const pa = V(xc, rafterTop(za), za).addScaledVector(nrm, 0.75);
      const pb = V(xc, rafterTop(zb), zb).addScaledVector(nrm, 0.75);
      b.member(pa, pb, '2x4', V(1, 0, 0), { ...purO, name: 'Blocking between purlins over the end rafter' });
    }
  }

  // ---------------------------------------------------------------- roofing
  const tinPieces = [];
  const clad = P.cladding;
  const tinMat = clad === 'pvc' ? 'pvc' : 'tin';
  const tinName = clad === 'pvc' ? 'PVC tinroof sheet' : 'Metal tinroof sheet';
  const crests = (wi, last) => {
    const xs = [];
    for (let x = CORR.pitch / 4; x < wi - 0.3; x += 2 * CORR.pitch) if (last || x < P.tinCover - 0.3) xs.push(x);
    return xs;
  };
  const zs = -E - 2; // 2" past the low fascia so water drips clear
  const ze = D + E + 1;
  const Ls = (ze - zs) / cos;
  const nCols = Math.ceil((W + 2 * R - (tinW - P.tinCover)) / P.tinCover);
  const xAxisR = new THREE.Vector3().crossVectors(upSlope, nrm);
  const roofSheets = sheetRun(Ls);
  const rEx = [nrm.x * EX, 7 * EX + nrm.y * EX, nrm.z * EX];
  for (let i = 0; i < nCols; i++) {
    const xi = -R + i * P.tinCover;
    const wi = Math.min(tinW, W + R - xi);
    if (wi < 4) continue;
    roofSheets.forEach((pc, j) => {
      const z = zs + pc.start * cos;
      const o = V(xAxisR.x > 0 ? xi : xi + wi, roofTop(z), z).addScaledVector(nrm, 0.3 + (i % 2) * 0.1 + j * 0.15);
      b.sheet(o, xAxisR, upSlope, nrm, { w: wi, h: pc.len, corr: CORR }, {
        mat: tinMat, name: tinName, info: `cut length ${ftin(pc.len)}`, group: 'roofing', step: TSTEP.ROOFING, ex: rEx,
      });
      tinPieces.push({ stock: pc.stock, len: pc.len, use: 'roof' });
      const sO = { group: 'roofing', step: TSTEP.ROOFING, ex: rEx, name: 'Roofing screw with sealing washer' };
      for (const zp of purlinZ) {
        const yl = (zp - zs) / cos - pc.start;
        if (yl < 0.5 || yl > pc.len - 0.5) continue;
        for (const xl of crests(wi, i === nCols - 1)) b.fasten('roofScrew', o.clone().addScaledVector(xAxisR, xl).addScaledVector(upSlope, yl).addScaledVector(nrm, CORR.depth), nrm, sO);
      }
    });
  }

  // ---------------------------------------------------------------- siding
  const hang = (w, ua, ub, vbase, topFn, holes0, label, rows) => {
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
        const profile2 = (x) => topFn(ui + x) - base;
        const so = 0.15 + (i % 2) * 0.08 + j * 0.12;
        const sex = wallEx(w, 2.2, 1.5);
        b.sheet(toW(w, ui, base, -so), w.U, UP, w.n, { w: wi, h: pc.len, corr: CORR, holes, profile: profile2 }, {
          mat: tinMat, name: `${tinName} (${label})`, info: `cut length ${ftin(pc.len)}`, group: 'siding', step: TSTEP.SIDING, ex: sex,
        });
        tinPieces.push({ stock: pc.stock, len: pc.len, use: 'siding' });
        const pts = [];
        for (const v of rows) for (const x of crests(wi, i === nc - 1)) pts.push([ui + x, v]);
        if (w.z) for (const x of crests(wi, i === nc - 1)) pts.push([ui + x, topFn(ui + x) - 2]);
        for (const [u, v] of pts) {
          if (v < base + 0.5 || v > base + pc.len - 0.5 || v > topFn(u) - 0.5) continue;
          if (holes0.some((h) => u > h.u0 - 2 && u < h.u1 + 2 && v > h.v0 - 0.5 && v < h.v1 + 0.5)) continue;
          fastW(w, 'roofScrew', u, v, -(so + CORR.depth), w.n, { group: 'siding', step: TSTEP.SIDING, ex: sex, name: 'Roofing screw with sealing washer' });
        }
      });
    }
  };
  hang(walls.front, 0, W, PH - 1.5, () => Hf, [{ u0: r0, u1: r1, v0: -10, v1: hRO }], 'front wall', girtRows.front);
  // notched around the rafter tails under the back eave
  hang(walls.back, 0, W, PH - 1.5, () => P.lowH - 0.6, [], 'back wall', girtRows.back);
  for (const k of ['left', 'right']) {
    const w = walls[k];
    const ve = vents.find((x) => x.w === w);
    hang(w, 0, D, PH - 1.5, (u) => rafterTop(w.z(u)) - y0 - 0.1, [ve], 'side wall, cut out for the vent', girtRows[k]);
  }

  // ---------------------------------------------------------------- screens
  const screenStrips = [];
  for (const ve of vents) {
    const w = ve.w;
    const u0 = FW;
    const u1 = D - FW;
    const h = vh + 3;
    b.sheet(toW(w, u0, vb - 1.5, -0.03), w.U, UP, w.n, { w: u1 - u0, h, corr: null }, {
      mat: 'screen', name: 'Fiberglass insect screen, stapled to the framing behind the tin', info: `${ftin(u1 - u0)} × ${ftin(h)}`, group: 'screens', step: TSTEP.SCREENS, ex: wallEx(w, 1.6, 1.5),
    });
    screenStrips.push({ len: u1 - u0, h });
  }

  // ---------------------------------------------------------------- door
  const trimD = [-(0.85 + 0.75), -0.85];
  const w = walls.front;
  const exOut = wallEx(w, 3.2, 1.5);
  const trimO = { cat: 'framing', group: 'trim', step: TSTEP.DOOR, ex: wallEx(w, 2.8, 1.5), name: 'Door casing (1x4)' };
  const n8 = (o) => ({ group: o.group, step: TSTEP.DOOR, ex: o.ex, name: '8d 2-1/2" galv. nail' });
  const addT = (a, c, va, vc) => {
    if (vc - va < 1) return;
    lumberW(w, '1x4', a, c, va, vc, trimD[0], trimD[1], trimO);
    const horiz = c - a > vc - va;
    const [l0, l1] = horiz ? [a, c] : [va, vc];
    for (const t of spread(l0, l1, Math.ceil((l1 - l0) / 16) + 1, 2)) {
      for (const e of [0.8, 2.7]) {
        const [u, v] = horiz ? [t, va + e * ((vc - va) / 3.5)] : [a + e * ((c - a) / 3.5), t];
        fastW(w, 'nail8', u, v, trimD[0], w.n, n8(trimO));
      }
    }
  };
  const u0 = r0;
  const u1 = r1;
  const v1 = hRO;
  addT(u0 - 3.5, u0, PH - 1.5, v1);
  addT(u1, u1 + 3.5, PH - 1.5, v1);
  addT(u0 - 3.5, u1 + 3.5, v1, v1 + 3.5);
  const jo = { cat: 'framing', group: 'door', step: TSTEP.DOOR, ex: exOut, name: 'Door jamb (1x6)' };
  const addJ = (a, c, va, vc) => lumberW(w, '1x6', a, c, va, vc, -0.75, Math.min(bt, 5.5) - 0.75, jo);
  addJ(u0, u0 + 0.75, 0, v1);
  addJ(u1 - 0.75, u1, 0, v1);
  addJ(u0 + 0.75, u1 - 0.75, v1 - 0.75, v1);
  const jd = (Math.min(bt, 5.5) - 1.5) / 2;
  for (const v of spread(0, v1 - 0.75, Math.ceil(v1 / 16) + 1, 4)) {
    const [shape, nm] = v < PH ? ['conScrew', 'Concrete screw 1/4" × 3-1/4" (into the grouted jamb cell)'] : ['nail8', '8d 2-1/2" galv. nail'];
    fastW(w, shape, u0 + 0.75, v, jd, w.U, { ...jo, name: nm });
    fastW(w, shape, u1 - 0.75, v, jd, w.U.clone().negate(), { ...jo, name: nm });
  }
  for (const u of spread(u0 + 0.75, u1 - 0.75, 3, 4)) fastW(w, 'nail8', u, v1 - 0.75, jd, UP.clone().negate(), { ...jo, name: '8d 2-1/2" galv. nail' });
  const leafH = hRO - 1.5;
  const lu0 = u0 + 1;
  const lu1 = u1 - 1;
  const lv0 = 0.5;
  const lv1 = lv0 + leafH;
  const lo = { cat: 'framing', group: 'door', step: TSTEP.DOOR, ex: exOut, name: 'Door board (1x6)' };
  const boards = [];
  for (let u = lu0; u < lu1 - 0.5; u += 5.5) {
    const ue = Math.min(u + 5.5, lu1);
    lumberW(w, '1x6', u + 0.03, ue - 0.03, lv0, lv1, 0.25, 1.0, lo);
    boards.push((u + ue) / 2);
  }
  const bo = { ...lo, name: 'Door batten (1x4)' };
  const doorNail = { ...lo, name: '8d 2-1/2" galv. nail (clinched)' };
  for (const vv of [lv0 + 6, lv1 - 9.5]) {
    lumberW(w, '1x4', lu0 + 1, lu1 - 1, vv, vv + 3.5, 1.0, 1.75, bo);
    for (const bu of boards) for (const k of [-1.3, 1.3]) fastW(w, 'nail8', bu + k, vv + 1.75 + k * 0.4, 0.25, w.n, doorNail);
  }
  const ba = [lu1 - 3, lv0 + 9.5 + 1.75];
  const bc = [lu0 + 3, lv1 - 9.5 - 1.75];
  b.member(toW(w, ba[0], ba[1], 1.375), toW(w, bc[0], bc[1], 1.375), '1x4', w.n, { ...bo, flat: true, name: 'Door brace (1x4)' });
  for (const bu of boards) {
    const t = (bu - ba[0]) / (bc[0] - ba[0]);
    if (t < 0.02 || t > 0.98) continue;
    const bv = ba[1] + (bc[1] - ba[1]) * t;
    for (const k of [-0.9, 0.9]) fastW(w, 'nail8', bu, bv + k, 0.25, w.n, doorNail);
  }
  // T-hinges outside, so the door swings out and leaves the room clear
  const hw = { mat: 'steel', group: 'door', step: TSTEP.DOOR, ex: exOut, name: 'Galvanised 4" T-hinge' };
  const wsO = { group: 'door', step: TSTEP.DOOR, ex: exOut, name: 'Wood screw (hinge / pull / bolt)' };
  const cf = trimD[0];
  const hbox = (a, c, va, vc, d0, d1, o = hw) => boxW(w, a, c, va, vc, d0, d1, o);
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
  // no lock: a pull outside, a hook and eye to keep it shut in the wind,
  // and a barrel bolt inside for privacy
  const vh2 = 40;
  const pu = lu1 - 3;
  hbox(pu - 0.35, pu + 0.35, vh2 - 3.5, vh2 + 3.5, -1.0, -0.65, { ...hw, name: 'Door pull' });
  for (const k of [-3, 3]) hbox(pu - 0.3, pu + 0.3, vh2 + k - 0.3, vh2 + k + 0.3, -0.65, 0.25, { ...hw, name: 'Door pull' });
  for (const k of [-3, 3]) fastW(w, 'woodScrew', pu, vh2 + k, 0.25, w.n, wsO);
  const hv = vh2 + 12;
  hbox(lu1 - 1.6, lu1 - 1.3, hv - 0.15, hv + 0.15, -2.0, 0.25, { ...hw, name: 'Screw eye' });
  hbox(lu1 - 1.9, u1 + 2.4, hv - 0.12, hv + 0.12, -2.0, -1.78, { ...hw, name: 'Hook (keeps the door shut in the wind)' });
  hbox(u1 + 2.15, u1 + 2.45, hv - 0.15, hv + 0.15, -2.0, trimD[0], { ...hw, name: 'Hook' });
  const boltV = 48;
  hbox(lu1 - 4.5, lu1 - 0.6, boltV - 0.6, boltV + 0.6, 1.0, 1.5, { ...hw, name: 'Barrel bolt (inside)' });
  hbox(lu1 - 0.6, u1 - 0.75, boltV - 0.2, boltV + 0.2, 1.1, 1.4, { ...hw, name: 'Barrel bolt (inside)' });
  hbox(u1 - 0.75, u1 - 0.1, boltV - 0.6, boltV + 0.6, 1.0, 1.8, { ...hw, name: 'Barrel bolt keeper' });
  for (const u of [lu1 - 3.8, lu1 - 1.4]) fastW(w, 'woodScrew', u, boltV, 1.5, w.n.clone().negate(), wsO);

  // ---------------------------------------------------------------- toilet, flush water, vent stack
  const fx = { group: 'toilet', step: TSTEP.TOILET, ex: [0, 0, 0] };
  const zBowl = bt + 14;
  b.add({ kind: 'cyl', r: 1, h: 10, pos: [tx, y0 + 5, zo], quat: null, scale: [4.5, 1, 6.5], mat: 'ceramic', ...fx, name: 'Pour-flush toilet bowl (ceramic)' });
  b.add({ kind: 'cyl', r: 1, h: 6, pos: [tx, y0 + 12, zBowl], quat: null, scale: [7, 1, 10], mat: 'ceramic', ...fx, name: 'Pour-flush toilet bowl (ceramic)' });
  b.add({ kind: 'cyl', r: 1, h: 1, pos: [tx, y0 + 15.5, zBowl + 0.3], quat: null, scale: [7.3, 1, 10.3], mat: 'seat', ...fx, name: 'Toilet seat' });
  b.add({ kind: 'cyl', r: 1, h: 0.06, pos: [tx, y0 + 16.03, zBowl + 1.5], quat: null, scale: [4.5, 1, 6.6], mat: 'hole', ...fx, name: 'Bowl opening' });
  const bucketX = tx > W / 2 ? bt + 9 : W - bt - 9;
  b.cyl(bucketX, bt + 9, 5.75, y0, y0 + 14, { mat: 'bucket', ...fx, name: '5-gal bucket of seawater — pour it into the bowl to flush' });
  const drumX = W + R + 2;
  b.cyl(drumX, D - 14, 11.25, 0, 34.5, { mat: 'drum', ...fx, name: '55-gal drum of seawater for flushing' });
  // vent stack straight up behind the bowl, through the roof
  const zv = bt + vr + 0.15;
  const ventTop = roofTop(zv) + 12;
  b.cyl(tx, zv, vr, yd0, ventTop, { mat: 'pvcPipe', ...fx, name: '2" vent stack — lets air in and out of the drain so the trap keeps its water' });
  b.cyl(tx, zv, vr + 0.5, ventTop, ventTop + 2.5, { mat: 'screen', ...fx, name: 'Vent cap with insect screen' });
  b.cyl(tx, zv, vr + 1.4, roofTop(zv) + 0.4, roofTop(zv) + 2.6, { mat: 'rubber', ...fx, name: 'Roof pipe boot' });
  ventPipes.push(ventTop - yd0);
  // strapped to 2x4 blocks set flush with the inside of the back wall studs
  const straps = [];
  const bay = Math.max(0, rafterXs.findIndex((x, i) => x < tx && rafterXs[i + 1] > tx));
  const [sx0, sx1] = [rafterXs[bay] + 0.75, rafterXs[bay + 1] - 0.75];
  for (const v of [PH + 12, Math.round((PH + P.lowH) / 2), P.lowH - 8]) {
    b.box(tx - 1, tx + 1, y0 + v - 0.4, y0 + v + 0.4, FW, zv + vr + 0.06, { mat: 'steel', ...fx, name: 'Pipe strap' });
    b.lumberBox('2x4', sx0, sx1, y0 + v - 1.75, y0 + v + 1.75, FW - 1.5, FW, { cat: 'framing', ...fx, name: 'Strap block between studs (2x4)' });
    straps.push(v);
  }

  // ---------------------------------------------------------------- pit (option)
  const pitBlocks = [];
  let lidFt3 = 0;
  if (pitInfo) {
    const { px0, px1, pz0, pz1, yPit } = pitInfo;
    const po = { mat: 'block', group: 'waste', step: TSTEP.WASTE, ex: [0, 0, 0], name: `${P.blockT}" block pit lining, open joints so liquid soaks away` };
    const nC = Math.ceil(-yPit / 8);
    for (let k = 0; k < nC; k++) {
      const ya = yPit + k * 8;
      const yb3 = Math.min(0, ya + BLOCK.h);
      // honeycomb: 1" gaps between blocks
      const sideRun = (fixed, a0, a1, alongX, outer) => {
        for (let u = a0; u < a1 - 2; u += BL + 1) {
          const len = Math.min(BL, a1 - u);
          if (alongX) b.box(u, u + len, ya, yb3, outer ? fixed - bt : fixed, outer ? fixed : fixed + bt, po);
          else b.box(outer ? fixed - bt : fixed, outer ? fixed : fixed + bt, ya, yb3, u, u + len, po);
          pitBlocks.push({ len, label: 'Pit block' });
        }
      };
      sideRun(pz0, px0 - bt, px1 + bt, true, true);
      sideRun(pz1, px0 - bt, px1 + bt, true, false);
      sideRun(px0, pz0, pz1, false, true);
      sideRun(px1, pz0, pz1, false, false);
    }
    // lid: a 4" slab with mesh over the lining, and a cast access cover
    const lx0 = px0 - bt - 6, lx1 = px1 + bt + 6, lz0 = pz0 - bt - 6, lz1 = pz1 + bt + 6;
    const lid = { mat: 'slab', group: 'waste', step: TSTEP.WASTE, ex: [0, 0.5 * EX, 0] };
    const ax0 = (px0 + px1) / 2 - 9, ax1 = ax0 + 18, az0 = (pz0 + pz1) / 2 - 9, az1 = az0 + 18;
    const lidName = 'Pit lid, 4" concrete on a 12" grid of #4 rebar';
    b.box(lx0, lx1, 0, 4, lz0, az0, { ...lid, name: lidName });
    b.box(lx0, lx1, 0, 4, az1, lz1, { ...lid, name: lidName });
    b.box(lx0, ax0, 0, 4, az0, az1, { ...lid, name: lidName });
    b.box(ax1, lx1, 0, 4, az0, az1, { ...lid, name: lidName });
    b.box(ax0 + 0.25, ax1 - 0.25, 0.3, 4.6, az0 + 0.25, az1 - 0.25, { ...lid, name: 'Access cover (cast separately, with two handles)' });
    lidFt3 = ((lx1 - lx0) * (lz1 - lz0) * 4) / 1728;
    for (let x = lx0 + 3; x < lx1 - 2; x += 12) rebarPieces.push({ len: lz1 - lz0 - 3, label: 'Pit lid bar' });
    for (let z = lz0 + 3; z < lz1 - 2; z += 12) rebarPieces.push({ len: lx1 - lx0 - 3, label: 'Pit lid bar' });
    const gw = -P.waterTable;
    if (yPit < gw) b.box(px0 + 0.2, px1 - 0.2, yPit, gw, pz0 + 0.2, pz1 - 0.2, { mat: 'water', group: 'waste', step: TSTEP.WASTE, ex: [0, 0, 0], name: 'Groundwater standing in the pit', info: `${inch(gw - yPit)} deep, rising and falling with the tide` });
  }

  // ---------------------------------------------------------------- quantities
  b.flushHardware();
  const hc = (k) => b.hwCount[k] || 0;
  const mortarFt3 = (blockPieces.length * 0.085 * bt) / 7.625 + (pitBlocks.length * 0.04 * bt) / 7.625;
  const collarFt3 = collars.length * ((Math.PI * ((pr + 3) ** 2 - pr ** 2) * 6) / 1728);
  const concreteFt3 = slabFt3 + groutFt3 + collarFt3 + lidFt3;
  const plasticFt2 = ((W + 12) * (Ds + 12)) / 144;
  const pipeGal = (d) => (Math.PI * ((d - 0.25) / 2) ** 2 * 12) / 231; // per ft, roughly the bore
  const flushPerDay = P.users * 5 * P.flushGal;
  const floodedFt = pit ? 0 : P.outfall + 4;
  const pitVolFt3 = pit ? (PIT.w * PIT.l * Math.max(0, P.pitDepth - 18)) / 1728 : 0;
  const fillYears = pit ? pitVolFt3 / (P.users * 1.41) : 0; // ~0.04 m³ of sludge per person a year
  const innerArea = (innerW * innerD) / 144;
  const fittings = {
    flange: 1,
    bend: pit ? 1 : 3,
    tee: 1,
    cleanout: 1,
    couplings: runs.reduce((n, l) => n + Math.max(0, Math.ceil(l / 120) - 1), 0) + Math.max(0, Math.ceil(ventPipes[0] / 120) - 1),
    check: pit ? 0 : 1,
    straps: straps.length,
  };

  // ---------------------------------------------------------------- steps
  const nBolts = hc('wedge');
  const nBlocks = blockPieces.length;
  const steps = [
    { title: 'Site', text: `A ${ftin(W)} × ${ftin(D)} toilet house with its back to the water, ${ftin(P.shore * 12)} from the water's edge. ${pit ? `The pit goes ${ftin(PIT.gap)} behind it.` : `A ${pD}" drain runs from the toilet down the beach and ${P.outfall} ft out along the bottom.`} Square the slab with strings: both diagonals ${ftin(Math.hypot(W, Ds))}. Check the toilet floor will sit well above the highest tide you have seen, storm surge included.` },
    { title: 'Drain rough-in', text: `Before any concrete, dig a trench and lay the ${pD}" drain under the slab: a closet bend coming up where the toilet goes (outlet ${inch(ROUGH_IN)} in front of the inside of the back wall), a sanitary tee for the 2" vent right behind it, then out under the back edge at ${inch(SLOPE)} per foot to a wye with a screw-plug cleanout just outside. Cap the open ends so no concrete or sand gets in.` },
    { title: 'Forms, mesh and dowels', text: `Set 1x6 form boards around the slab${layers > 1 ? ` (${layers} high)` : ''} on 2x4 stakes, ${ftin(W)} × ${ftin(Ds)} including a ${inch(P.apron)} step in front of the door. Lay 6-mil plastic, then ${meshStrips.length === 1 ? 'one strip' : `${meshStrips.length} strips`} of 6" × 6" #10 wire mesh. Stand ${cells.length} #4 rebar dowels where the block cells will be grouted: one at each corner, one each side of the door, and one at each anchor bolt. Each has a 10" hook in the slab and rises to the top course.` },
    { title: 'Pour the slab', text: `Pour the ${inch(T)} slab: ${num(slabFt3, 1)} ft³, about ${Math.ceil(slabFt3 / 3.7)} bags of cement. Pull the mesh up into the middle of the slab as you go. Slope the floor about 1/4" toward the door so it can be washed out, and keep the slab damp for a week.` },
    { title: 'Block pony wall', text: `Lay ${P.courses} course${P.courses > 1 ? 's' : ''} of ${P.blockT}" hollow block (${nBlocks} blocks with cuts) around the edge, ${ftin(PH)} high, with a ${inch(doorRO.w)} gap for the door. Alternate which wall runs through at each corner. Fill the ${cells.length} cells with the dowels solid with concrete and set a 1/2" anchor bolt in each one that is under a plate.` },
    { title: 'Wall framing', text: `Bolt a 2x4 bottom plate to the blocks (${nBolts} bolts) on a strip of plastic. Frame the back wall ${ftin(P.lowH)} high and the front wall ${ftin(Hf)} high, with studs at ${inch(P.studSpacing)} lined up under the rafters. The side walls have raked top plates at ${P.pitch}:12. The door gets a doubled 2x4 header. Along both side walls, add a flat 2x4 sill at ${ftin(vb)} and a head at ${ftin(vt)}: this is the vent, above eye level.` },
    { title: 'Roof framing', text: `Set ${rafterXs.length} ${rafterSize} rafters at ${inch(P.studSpacing)}, birdsmouthed onto both top plates so the roof falls ${P.pitch}:12 toward the water and away from the door. Tie each end down with a hurricane tie (${ties} in all). Fit 2x4 frieze blocks between the rafters on both walls to close the eaves, then nail on the 1x6 fascia. Overhangs: ${inch(E)} at the eaves, ${inch(R)} at the sides.` },
    { title: 'Purlins', text: `${purlinZ.length} rows of flat 2x4 purlins, no more than ${inch(P.purlinSpacing)} apart, with one directly over each wall so the eaves can be sealed. Block between the purlins over the two end rafters.` },
    { title: 'Roofing', text: `${tinPieces.filter((t) => t.use === 'roof').length} ${clad === 'pvc' ? 'PVC' : 'galvanised'} sheets, ${ftin(Ls)} long, one length from eave to eave with no end laps. Screw through the crests into every purlin. Fill the crests over the two eave purlins with expanding foam so insects can't get in under the sheets.` },
    { title: 'Siding', text: `Clad the walls with vertical sheets from 1-1/2" below the top of the blocks (so rain runs off onto the block, not into the wood) up to the roof. On the side walls, cut out a ${inch(vh)}-high band for the vents. ${tinPieces.filter((t) => t.use === 'siding').length} pieces in all.` },
    { title: 'Vent screens', text: `The vent band on each side wall is ${ftin(D - 2 * FW)} long and ${inch(vh)} high, sill at ${ftin(vb)}. Air comes in on one side and out the other, and the roof overhang keeps most rain out. Staple fiberglass insect screen over the band on the outside of the framing, so the tin clamps its edges. Fiberglass doesn't rust in salt air; aluminium and steel screen don't last.` },
    { title: 'Door', text: `A ${inch(P.doorW)} × ${ftin(leafH)} board door hung on three T-hinges outside, so it swings out and leaves the room clear. No lock: a pull and a hook and eye outside to keep it shut in the wind, and a barrel bolt inside for privacy.` },
    { title: 'Toilet and vent', text: `Bed the pour-flush bowl on mortar over the closet flange. Run the 2" vent up the back wall and through the roof with a rubber pipe boot, ending 12" above the roof with a screened cap. Flushing: a bucket of seawater (about ${P.flushGal} gal) poured quickly into the bowl. A 55-gal drum outside holds the day's water.` },
    pit
      ? { title: 'Pit', text: `Dig a ${ftin(PIT.w)} × ${ftin(PIT.l)} pit ${ftin(P.pitDepth)} deep, ${ftin(PIT.gap)} behind the toilet, and line it with block laid with open joints. Cover it with a 4" concrete lid with an 18" access cover. ${P.pitDepth > P.waterTable ? `With groundwater at ${ftin(P.waterTable)}, the bottom ${inch(P.pitDepth - P.waterTable)} will stand in tidal water.` : ''} It holds about ${num(fillYears, 1)} years of sludge for ${P.users} people.` }
      : { title: 'Outfall', text: `Carry the drain down the beach in a trench about a foot deep, still falling ${inch(SLOPE)} per foot, then two 45° bends bring it onto the bottom. Lay ${P.outfall} ft of pipe out along the bottom, held down by ${collars.length} concrete collars cast in buckets, with a flap valve on the end. Aim the outlet where the water is deep and moving at the lowest tide.` },
    { title: 'Complete', text: `A ${ftin(W)} × ${ftin(D)} toilet house: ${inch(T)} slab, ${P.courses}-course block pony wall, ${clad === 'pvc' ? 'PVC' : 'metal'} shed roof and siding, screened vents on both sides, and a ${pit ? 'pit' : `${P.outfall} ft seawater-flushed outfall`}.` },
  ];

  const dims = [
    { a: [0, y0 + 0.3, Ds + 14], b: [W, y0 + 0.3, Ds + 14], label: ftin(W) },
    { a: [W + R + 30, y0 + 0.3, 0], b: [W + R + 30, y0 + 0.3, D], label: ftin(D) },
    { a: [-30, 6, 0], b: [-30, 6, zShore], label: `${ftin(P.shore * 12)} to the water` },
  ];
  if (!pit) dims.push({ a: [tx + 36, 8, zShore], b: [tx + 36, 8, outEnd], label: `${P.outfall} ft outfall` });
  const zMin = pitInfo ? Math.min(pitInfo.pz0 - bt - 30, -E - 40) : -E - 40;
  const top = Math.max(roofTop(D + E), ventTop + 3) + 6;

  return {
    P, W, D, parts: b.parts, steps, dims, warnings,
    bounds: { min: [-R - 40, -12, zMin], max: [W + R + 40, top, Ds + 30] },
    siteBounds: { min: [-R - 60, -12, pit ? zMin - 60 : (outEnd ?? zShore) - 60], max: [W + R + 60, top, Ds + 60] },
    q: {
      lumber: b.lumber, tin: tinPieces, blocks: blockPieces, pitBlocks, rebar: rebarPieces,
      slabFt3, groutFt3, mortarFt3, collarFt3, lidFt3, concreteFt3, plasticFt2,
      mesh: meshStrips, screen: screenStrips, mainPipes, ventPipes, fittings,
      ties, bolts: nBolts, n16: hc('nail16'), n8: hc('nail8'), nTie: hc('tieNail'), roofFast: hc('roofScrew'), screws: hc('conScrew'),
      foamFt: (2 * (W + 2 * R)) / 12 + 6,
    },
    info: {
      innerW, innerD, innerArea, Hf, lowH: P.lowH, vb, vt, rafterSize, nBlocks, cells: cells.length,
      tx, landRun, seaRun, pr, flushPerDay, floodedFt, pipeGalPerFt: pipeGal(pD), pitVolFt3, fillYears,
      drainDropAtShore: y0 - (ydc - fall(zc, zShore)), roofArea: ((W + 2 * R) * (D + 2 * E)) / 144, leafH, slabMeshDir: slabMesh.a ? 'z' : 'x',
    },
  };
}
