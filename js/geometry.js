import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Box with world-scaled UVs: u runs along the longest axis (wood grain).
export function boxGeometry(size, seed = 0) {
  const g = new THREE.BoxGeometry(size[0], size[1], size[2]);
  const grain = size.indexOf(Math.max(...size));
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const uv = g.attributes.uv;
  const ou = ((seed * 0.6180339) % 1) * 7;
  const ov = ((seed * 0.4142135) % 1) * 3;
  for (let i = 0; i < pos.count; i++) {
    const p = [pos.getX(i), pos.getY(i), pos.getZ(i)];
    const n = [Math.abs(nor.getX(i)), Math.abs(nor.getY(i)), Math.abs(nor.getZ(i))];
    const na = n.indexOf(Math.max(...n));
    const axes = [0, 1, 2].filter((a) => a !== na);
    let u, v;
    if (axes.includes(grain)) {
      const other = axes.find((a) => a !== grain);
      u = p[grain] / 48 + ou;
      v = p[other] / 12 + ov;
    } else {
      u = p[axes[0]] / 12 + ou;
      v = p[axes[1]] / 12 + ov;
    }
    uv.setXY(i, u, v);
  }
  return g;
}

// Thin sheet in local coords x∈[0,w], y∈[0,h], with optional rectangular
// holes, a top profile (x → max y) and a sine corrugation running along y.
export function sheetGeometry({ w, h, holes = [], profile = null, corr = null }) {
  const xb = new Set([0, w]);
  const step = corr ? corr.pitch / 8 : 6;
  for (let x = step; x < w; x += step) xb.add(+x.toFixed(4));
  const ybs = new Set([0, h]);
  const hs = holes.filter((o) => o.x1 > 0 && o.x0 < w && o.y1 > 0 && o.y0 < h);
  for (const o of hs) {
    if (o.x0 > 0 && o.x0 < w) xb.add(o.x0);
    if (o.x1 > 0 && o.x1 < w) xb.add(o.x1);
    if (o.y0 > 0 && o.y0 < h) ybs.add(o.y0);
    if (o.y1 > 0 && o.y1 < h) ybs.add(o.y1);
  }
  const X = [...xb].sort((a, b) => a - b).filter((x, i, a) => i === 0 || x - a[i - 1] > 1e-3);
  const Y = [...ybs].sort((a, b) => a - b).filter((y, i, a) => i === 0 || y - a[i - 1] > 1e-3);
  const A = corr ? corr.depth / 2 : 0;
  const zOf = (x) => (corr ? A + A * Math.sin((2 * Math.PI * x) / corr.pitch) : 0);
  const prof = X.map((x) => (profile ? Math.min(h, profile(x)) : h));
  const positions = [];
  const uvs = [];
  const index = [];
  const vid = new Map();
  const vert = (i, j) => {
    const key = i * 10000 + j;
    if (vid.has(key)) return vid.get(key);
    const x = X[i];
    const y = Math.max(0, Math.min(Y[j], prof[i]));
    positions.push(x, y, zOf(x));
    uvs.push(x / 24, y / 24);
    const id = positions.length / 3 - 1;
    vid.set(key, id);
    return id;
  };
  for (let i = 0; i + 1 < X.length; i++) {
    const cx = (X[i] + X[i + 1]) / 2;
    const ptop = Math.max(prof[i], prof[i + 1]);
    for (let j = 0; j + 1 < Y.length; j++) {
      if (Y[j] >= ptop - 1e-4) continue;
      const cy = (Y[j] + Y[j + 1]) / 2;
      if (hs.some((o) => cx > o.x0 && cx < o.x1 && cy > o.y0 && cy < o.y1)) continue;
      const a = vert(i, j);
      const b = vert(i + 1, j);
      const c = vert(i + 1, j + 1);
      const d = vert(i, j + 1);
      index.push(a, b, c, a, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

export function cylGeometry(r, h) {
  const g = new THREE.CylinderGeometry(r, r, h, 28, 1);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (2 * Math.PI * r) / 24, uv.getY(i) * h / 24);
  return g;
}

// Extruded polygon (pts in the shape's x/y plane, extruded along +z).
export function prismGeometry(pts, depth) {
  const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 48, uv.getY(i) / 12);
  return g;
}

// Small hardware in local coords: the head sits on the surface at the
// origin facing +Y and the shank runs down -Y into the wood.
const hcyl = (r0, r1, h, y, seg) => {
  const g = new THREE.CylinderGeometry(r0, r1, h, seg, 1);
  g.translate(0, y, 0);
  return g;
};
const HARDWARE = {
  // 16d common: 0.28" head, 3-1/2" long
  nail16: () => [hcyl(0.14, 0.14, 0.05, 0.025, 10), hcyl(0.08, 0.08, 3.5, -1.75, 6)],
  // 8d: 0.25" head, 2-1/2" long
  nail8: () => [hcyl(0.125, 0.125, 0.045, 0.022, 10), hcyl(0.065, 0.065, 2.5, -1.25, 6)],
  // short joist-hanger nail for hurricane ties
  tieNail: () => [hcyl(0.125, 0.125, 0.045, 0.022, 10), hcyl(0.07, 0.07, 1.5, -0.75, 6)],
  // 1-1/4" panel nail
  panelNail: () => [hcyl(0.1, 0.1, 0.03, 0.015, 8), hcyl(0.05, 0.05, 1.25, -0.625, 5)],
  // 1/4" hex-washer-head concrete screw, 3-1/4" long
  conScrew: () => [hcyl(0.25, 0.25, 0.05, 0.025, 12), hcyl(0.17, 0.17, 0.16, 0.13, 6), hcyl(0.12, 0.1, 3.25, -1.625, 6)],
  // hex-head roofing screw with a bonded sealing washer
  roofScrew: () => [hcyl(0.36, 0.34, 0.1, 0.05, 12), hcyl(0.19, 0.19, 0.25, 0.225, 6), hcyl(0.09, 0.07, 2.5, -1.25, 6)],
  // pan-head wood screw (hinges, hasps)
  woodScrew: () => [hcyl(0.15, 0.17, 0.07, 0.035, 10), hcyl(0.07, 0.05, 1.25, -0.625, 5)],
  // 1/2" wedge anchor: washer, nut and threaded stud
  wedge: () => [hcyl(0.6, 0.6, 0.1, 0.05, 16), hcyl(0.43, 0.43, 0.45, 0.325, 6), hcyl(0.25, 0.25, 5, -1.5, 10)],
};

export function hardwareGeometry(shape) {
  const g = mergeGeometries((HARDWARE[shape] || HARDWARE.nail16)());
  g.computeBoundingSphere();
  return g;
}
