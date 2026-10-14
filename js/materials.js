// Two material sets: a flat "SketchUp" look and a realistic PBR look with
// procedurally generated textures (no image downloads needed).
import * as THREE from 'three';

// --- tiny seeded value noise -------------------------------------------
function makeNoise(seed) {
  const perm = new Uint8Array(512);
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const val = (x, y) => perm[(x & 255) + perm[y & 255]] / 255;
  const sm = (t) => t * t * (3 - 2 * t);
  // periodic in both axes with period (px, py)
  const noise = (x, y, px = 256, py = 256) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const x0 = ((xi % px) + px) % px, x1 = (x0 + 1) % px;
    const y0 = ((yi % py) + py) % py, y1 = (y0 + 1) % py;
    const a = val(x0, y0), b = val(x1, y0), c = val(x0, y1), d = val(x1, y1);
    const u = sm(xf), v = sm(yf);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  const fbm = (x, y, px, py, oct = 4) => {
    let t = 0, amp = 0.5, f = 1, norm = 0;
    for (let o = 0; o < oct; o++) {
      t += amp * noise(x * f, y * f, px * f, py * f);
      norm += amp;
      amp *= 0.5;
      f *= 2;
    }
    return t / norm;
  };
  return { noise, fbm, rnd };
}

function canvasTex(w, h, fn, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = fn(x, y);
      const i = (y * w + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const lerp = (a, b, t) => a + (b - a) * t;
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const clamp01 = (x) => Math.max(0, Math.min(1, x));

// Wood texture: 1 tile = 48" along the grain × 12" across. Returns {map, bump}.
function woodTextures(dark, light, seed, streak = 1) {
  const N = makeNoise(seed);
  const W = 1024, H = 256;
  const height = new Float32Array(W * H);
  const map = canvasTex(W, H, (x, y) => {
    const u = x / W, v = y / H;
    const warp = N.fbm(u * 4, v * 3, 4, 3) * 2.2;
    const ring = 0.5 + 0.5 * Math.sin((v * 22 + warp * 3 + N.fbm(u * 2, v * 2, 2, 2) * 2) * Math.PI);
    const fine = N.fbm(u * 64, v * 24, 64, 24, 3);
    const streaks = N.fbm(u * 6, v * 60, 6, 60, 2);
    let t = clamp01(0.25 + 0.45 * Math.pow(ring, 1.6) * streak + 0.25 * (fine - 0.5) + 0.35 * (streaks - 0.5));
    height[y * W + x] = t;
    const c = mix3(dark, light, t);
    const knot = N.fbm(u * 3 + 7, v * 3 + 3, 3, 3);
    const k = knot > 0.78 ? (knot - 0.78) * 2.5 : 0;
    return [c[0] * (1 - k), c[1] * (1 - k), c[2] * (1 - k)];
  });
  const bump = canvasTex(W, H, (x, y) => {
    const h = height[y * W + x] * 255;
    return [h, h, h];
  }, false);
  return { map, bump };
}

function concreteTextures(seed, base = [150, 148, 142]) {
  const N = makeNoise(seed);
  const S = 512;
  const height = new Float32Array(S * S);
  const map = canvasTex(S, S, (x, y) => {
    const u = x / S, v = y / S;
    const n = N.fbm(u * 8, v * 8, 8, 8, 5);
    const spots = N.noise(u * 140, v * 140, 140, 140);
    const pore = spots > 0.86 ? 0.55 : 1;
    const agg = N.fbm(u * 30, v * 30, 30, 30, 2);
    height[y * S + x] = n * pore;
    const k = (0.82 + 0.3 * (n - 0.5) + 0.12 * (agg - 0.5)) * pore;
    return [base[0] * k, base[1] * k, base[2] * k];
  });
  const bump = canvasTex(S, S, (x, y) => {
    const h = height[y * S + x] * 255;
    return [h, h, h];
  }, false);
  return { map, bump };
}

function sandTexture(seed) {
  const N = makeNoise(seed);
  const S = 512;
  return canvasTex(S, S, (x, y) => {
    const u = x / S, v = y / S;
    const n = N.fbm(u * 6, v * 6, 6, 6, 5);
    const g = N.noise(u * 300, v * 300, 300, 300);
    const k = 0.86 + 0.18 * (n - 0.5) + 0.12 * (g - 0.5);
    return [196 * k, 178 * k, 140 * k];
  });
}

// Galvanised spangle: voronoi-ish crystals for roughness/colour variation.
function spangleTexture(seed) {
  const N = makeNoise(seed);
  const S = 512;
  const pts = Array.from({ length: 160 }, () => [N.rnd() * S, N.rnd() * S, 0.7 + N.rnd() * 0.3]);
  return canvasTex(S, S, (x, y) => {
    let best = 1e9, val = 1;
    for (const [px, py, v] of pts) {
      let dx = Math.abs(x - px), dy = Math.abs(y - py);
      dx = Math.min(dx, S - dx);
      dy = Math.min(dy, S - dy);
      const d = dx * dx + dy * dy;
      if (d < best) { best = d; val = v; }
    }
    const n = N.fbm(x / 64, y / 64, 8, 8, 3);
    const k = 255 * clamp01(val * 0.92 + (n - 0.5) * 0.15);
    return [k, k, k];
  }, false);
}

function plywoodTextures(seed) {
  const N = makeNoise(seed);
  const W = 512, H = 512;
  return canvasTex(W, H, (x, y) => {
    const u = x / W, v = y / H;
    const warp = N.fbm(u * 2, v * 3, 2, 3) * 3;
    const fig = 0.5 + 0.5 * Math.sin((v * 9 + warp) * Math.PI);
    const fine = N.fbm(u * 40, v * 6, 40, 6, 3);
    const t = clamp01(0.35 + 0.35 * fig + 0.3 * (fine - 0.5));
    return mix3([178, 128, 82], [214, 170, 120], t);
  });
}

let cache = null;
function textures() {
  if (cache) return cache;
  cache = {
    wood: woodTextures([92, 46, 26], [150, 84, 48], 3),
    woodTemp: woodTextures([150, 120, 85], [200, 170, 125], 9),
    concrete: concreteTextures(5),
    block: concreteTextures(11, [160, 158, 150]),
    sand: sandTexture(7),
    spangle: spangleTexture(13),
    ply: plywoodTextures(17),
  };
  return cache;
}

// --- palettes ----------------------------------------------------------
const SKETCH = {
  wood: 0xd8b98a,
  plyFloor: 0xe7cf9c,
  plyWall: 0xf0dfb8,
  tin: 0xc3c9cf,
  pvc: 0xe9eef0,
  concrete: 0xb7b7b2,
  block: 0xa9a9a4,
  glass: 0x9fc6e6,
  alu: 0xd0d4d8,
  steel: 0x55595e,
  wrap: 0x2b2b2b,
  hole: 0x4a3b2a,
  string: 0xff3b30,
  stringDiag: 0x2f7cf6,
};

export function makeMaterials(mode) {
  const M = {};
  if (mode === 'sketch') {
    for (const [k, c] of Object.entries(SKETCH)) {
      M[k] = new THREE.MeshLambertMaterial({
        color: c,
        side: THREE.DoubleSide,
        polygonOffset: k !== 'tin' && k !== 'pvc',
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
        transparent: k === 'glass',
        opacity: k === 'glass' ? 0.45 : 1,
        depthWrite: k !== 'glass',
      });
    }
    M.ground = new THREE.MeshLambertMaterial({ color: 0xc5cdb5, transparent: true, opacity: 0.8, depthWrite: false });
    M.edge = new THREE.LineBasicMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0.85 });
    M.edgeHL = new THREE.LineBasicMaterial({ color: 0xff6a00 });
  } else {
    const T = textures();
    const wood = (t, color = 0xffffff) => new THREE.MeshStandardMaterial({ map: t.map, bumpMap: t.bump, bumpScale: 0.6, roughness: 0.78, metalness: 0, color });
    M.wood = wood(T.wood);
    M.plyFloor = new THREE.MeshStandardMaterial({ map: T.ply, roughness: 0.7, color: 0xe8d2b8 });
    M.plyWall = new THREE.MeshStandardMaterial({ map: T.ply, roughness: 0.72, side: THREE.DoubleSide, color: 0xffffff });
    M.tin = new THREE.MeshStandardMaterial({ color: 0xc9cdd1, metalness: 0.92, roughness: 0.34, roughnessMap: T.spangle, side: THREE.DoubleSide, envMapIntensity: 1.0 });
    M.pvc = new THREE.MeshPhysicalMaterial({ color: 0xe6e9e6, metalness: 0, roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.35, side: THREE.DoubleSide, sheen: 0.2 });
    M.concrete = new THREE.MeshStandardMaterial({ map: T.concrete.map, bumpMap: T.concrete.bump, bumpScale: 1.2, roughness: 0.95 });
    M.block = new THREE.MeshStandardMaterial({ map: T.block.map, bumpMap: T.block.bump, bumpScale: 1.2, roughness: 0.95 });
    M.glass = new THREE.MeshPhysicalMaterial({ color: 0xcfe6ef, metalness: 0, roughness: 0.08, transmission: 0.0, transparent: true, opacity: 0.38, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.5 });
    M.alu = new THREE.MeshStandardMaterial({ color: 0xd8dadc, metalness: 1, roughness: 0.38 });
    M.steel = new THREE.MeshStandardMaterial({ color: 0x8a8f94, metalness: 1, roughness: 0.45 });
    M.wrap = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.55 });
    M.hole = new THREE.MeshStandardMaterial({ color: 0x5c4a35, roughness: 1 });
    M.string = new THREE.MeshStandardMaterial({ color: 0xff4a3a, roughness: 0.8 });
    M.stringDiag = new THREE.MeshStandardMaterial({ color: 0x2f7cf6, roughness: 0.8 });
    M.ground = new THREE.MeshStandardMaterial({ map: T.sand, roughness: 1, color: 0xffffff });
    M.edge = null;
    M.edgeHL = null;
  }
  // highlight variants for the current construction step
  M.hl = {};
  for (const [k, m] of Object.entries(M)) {
    if (!m || !m.isMaterial || k === 'ground' || k === 'edge' || k === 'edgeHL') continue;
    const h = m.clone();
    if (h.emissive) {
      h.emissive = new THREE.Color(0xff7a1a);
      h.emissiveIntensity = mode === 'sketch' ? 0.35 : 0.22;
    }
    M.hl[k] = h;
  }
  return M;
}

// texture repeat scale per material (uv units are already in "tiles")
export function groundTextureRepeat(M, size) {
  if (M.ground.map) {
    M.ground.map.repeat.set(size / 96, size / 96);
  }
}
