// Coconut palms for the realistic view: procedural trunks and fronds with
// painted textures, placed around the site but kept out of the usual
// camera directions.
import * as THREE from 'three';

function rng(seed) {
  let s = seed * 9301 + 49297;
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
}

function canvasTexture(w, h, paint, alpha = false) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  paint(ctx);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (!alpha) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Grey-brown trunk with leaf-scar rings; one tile = 24" of trunk.
function trunkTexture() {
  const R = rng(5);
  return canvasTexture(256, 256, (ctx) => {
    ctx.fillStyle = '#7d7466';
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2600; i++) {
      const v = 90 + R() * 70;
      ctx.fillStyle = `rgba(${v | 0},${(v * 0.95) | 0},${(v * 0.85) | 0},0.35)`;
      ctx.fillRect(R() * 256, R() * 256, 1 + R() * 2, 6 + R() * 26);
    }
    let y = 0;
    while (y < 256) {
      const h = 3 + R() * 4;
      ctx.fillStyle = `rgba(52,46,40,${0.45 + R() * 0.3})`;
      ctx.fillRect(0, y, 256, h * 0.5);
      ctx.fillStyle = 'rgba(170,160,140,0.25)';
      ctx.fillRect(0, y + h * 0.5, 256, 1.5);
      y += 22 + R() * 14;
    }
  });
}

// One frond seen flat: the rib runs up the middle (v = 0 at the base,
// 1 at the tip) with leaflets angled toward the tip on both sides.
function frondTexture(seed, dry) {
  const R = rng(seed);
  return canvasTexture(256, 1024, (ctx) => {
    ctx.clearRect(0, 0, 256, 1024);
    ctx.lineCap = 'round';
    for (let i = 0; i < 150; i++) {
      const t = 0.06 + (i / 150) * 0.92;
      const y = 1024 * (1 - t);
      const side = i % 2 ? 1 : -1;
      const len = 128 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.05)), 0.7) * (0.85 + R() * 0.25);
      const ang = 0.55 + R() * 0.25;
      const g = 0.75 + R() * 0.35;
      const col = dry
        ? `rgb(${(150 * g) | 0},${(118 * g) | 0},${(64 * g) | 0})`
        : `rgb(${(70 * g) | 0},${(108 * g) | 0},${(34 * g) | 0})`;
      ctx.strokeStyle = col;
      ctx.lineWidth = 3 + R() * 2.5;
      const ex = 128 + side * len * Math.cos(ang);
      const ey = y - len * Math.sin(ang);
      ctx.beginPath();
      ctx.moveTo(128, y);
      ctx.quadraticCurveTo(128 + side * len * 0.55, y - len * 0.35, ex, ey + 6);
      ctx.stroke();
    }
    ctx.strokeStyle = dry ? '#8a6f45' : '#9b9a55';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(128, 1024);
    ctx.lineTo(128, 10);
    ctx.stroke();
  }, true);
}

let tex = null;
function textures() {
  if (!tex) tex = { trunk: trunkTexture(), frond: frondTexture(3, false), dry: frondTexture(9, true) };
  return tex;
}

function trunkGeometry(H, lean, R) {
  const rings = 36, segs = 14;
  const pos = [], uv = [], idx = [];
  const ldir = new THREE.Vector3(Math.cos(lean.a), 0, Math.sin(lean.a));
  const centre = (t) => new THREE.Vector3(0, H * t, 0).addScaledVector(ldir, lean.k * H * t * t + lean.s * H * Math.sin(Math.PI * t) * 0.05);
  let arc = 0;
  let prev = centre(0);
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    const c = centre(t);
    arc += c.distanceTo(prev);
    prev = c;
    const T = centre(Math.min(1, t + 0.01)).sub(centre(Math.max(0, t - 0.01))).normalize();
    const N = new THREE.Vector3(1, 0, 0).sub(T.clone().multiplyScalar(T.x)).normalize();
    const B = new THREE.Vector3().crossVectors(T, N);
    const r = (8.5 - 3 * t) * (1 + 0.6 * Math.exp(-t * 25)) * (1 + 0.04 * Math.sin(t * 40 + R() * 6));
    for (let j = 0; j <= segs; j++) {
      const a = (j / segs) * Math.PI * 2;
      const p = c.clone().addScaledVector(N, Math.cos(a) * r).addScaledVector(B, Math.sin(a) * r);
      pos.push(p.x, p.y, p.z);
      uv.push(j / segs * 2, arc / 24);
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < segs; j++) {
      const a = i * (segs + 1) + j, b = a + segs + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return { geo: g, top: centre(1) };
}

// A frond as a folded ribbon arching out from the crown and drooping.
function frondGeometry(len, width, az, elev, droop, fold) {
  const st = 18;
  const pos = [], uv = [], idx = [];
  const dirH = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
  const side = new THREE.Vector3(-Math.sin(az), 0, Math.cos(az));
  let p = new THREE.Vector3();
  for (let i = 0; i <= st; i++) {
    const s = i / st;
    const e = elev - droop * Math.pow(s, 1.6);
    const w = width * Math.pow(Math.sin(Math.PI * Math.min(1, s * 1.05 + 0.02)), 0.7);
    const d = dirH.clone().multiplyScalar(Math.cos(e)).add(new THREE.Vector3(0, Math.sin(e), 0));
    const up = new THREE.Vector3(0, Math.cos(e), 0).addScaledVector(dirH, -Math.sin(e));
    const l = p.clone().addScaledVector(side, -w).addScaledVector(up, -w * fold);
    const r = p.clone().addScaledVector(side, w).addScaledVector(up, -w * fold);
    pos.push(l.x, l.y, l.z, p.x, p.y, p.z, r.x, r.y, r.z);
    uv.push(0, s, 0.5, s, 1, s);
    p = p.addScaledVector(d, len / st);
  }
  for (let i = 0; i < st; i++) {
    const a = i * 3;
    idx.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

let mats = null;
function materials() {
  if (mats) return mats;
  const T = textures();
  mats = {
    trunk: new THREE.MeshStandardMaterial({ map: T.trunk, roughness: 0.9 }),
    frond: new THREE.MeshStandardMaterial({ map: T.frond, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.6 }),
    dry: new THREE.MeshStandardMaterial({ map: T.dry, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8 }),
    nut: new THREE.MeshStandardMaterial({ color: 0x6b7a2a, roughness: 0.5 }),
  };
  return mats;
}

export function palm(seed) {
  const R = rng(seed);
  const M = materials();
  const g = new THREE.Group();
  const H = 300 + R() * 220;
  const { geo, top } = trunkGeometry(H, { a: R() * Math.PI * 2, k: 0.08 + R() * 0.2, s: R() - 0.5 }, R);
  const trunk = new THREE.Mesh(geo, M.trunk);
  trunk.castShadow = true;
  g.add(trunk);
  const crown = new THREE.Group();
  crown.position.copy(top);
  g.add(crown);
  const n = 16 + Math.floor(R() * 6);
  for (let i = 0; i < n; i++) {
    const az = (i / n) * Math.PI * 2 * 2.618 + R() * 0.4;
    const tier = i / n;
    const elev = 0.9 - tier * 1.5 + (R() - 0.5) * 0.3;
    const dry = tier > 0.88 && R() < 0.7;
    const len = 130 + R() * 50;
    const f = new THREE.Mesh(frondGeometry(len, 30 + R() * 8, az, elev, dry ? 1.6 : 0.9 + R() * 0.6, 0.35), dry ? M.dry : M.frond);
    f.castShadow = true;
    crown.add(f);
  }
  const nuts = 5 + Math.floor(R() * 6);
  for (let i = 0; i < nuts; i++) {
    const a = R() * Math.PI * 2;
    const s = new THREE.Mesh(new THREE.SphereGeometry(4.5 + R(), 10, 8), M.nut);
    s.position.set(Math.cos(a) * 7, -6 - R() * 8, Math.sin(a) * 7);
    s.scale.y = 1.15;
    crown.add(s);
  }
  return g;
}

// Palms around a footprint {min, max} (inches). Angles are measured from
// +z toward +x; the default 3D view looks from about 30°, so that sector
// is left open.
export function palmGrove(bounds) {
  const g = new THREE.Group();
  const cx = (bounds.min[0] + bounds.max[0]) / 2;
  const cz = (bounds.min[2] + bounds.max[2]) / 2;
  const rad = Math.max(bounds.max[0] - bounds.min[0], bounds.max[2] - bounds.min[2]) / 2;
  const spots = [
    [-150, 1.5], [-128, 2.4], [-100, 1.9], [175, 1.7], [150, 2.9], [-60, 3.2], [118, 3.6], [-170, 4.5], [95, 5.5], [-35, 6.5], [200, 6.0], [-80, 7.0],
  ];
  spots.forEach(([deg, k], i) => {
    const a = THREE.MathUtils.degToRad(deg);
    const p = palm(11 + i * 7);
    p.position.set(cx + Math.sin(a) * (rad + 220) * k * 0.75, 0, cz + Math.cos(a) * (rad + 220) * k * 0.75);
    p.rotation.y = i * 1.7;
    g.add(p);
  });
  return g;
}
