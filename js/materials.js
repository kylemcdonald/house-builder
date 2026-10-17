// Two material sets: a flat "SketchUp" look and a realistic PBR look.
// The realistic textures are generated procedurally (no image downloads).
// Every realistic surface also gets shader noise in rest-position space
// (the attribute aRest, added by the viewer), so stains and colour drift
// never repeat and don't slide when the model is exploded.
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
  t.anisotropy = 16;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const lerp = (a, b, t) => a + (b - a) * t;
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// Sawn softwood (pressure-treated pine). One tile is a whole 16' board
// (192") along the grain × 12" across, so a board never shows a repeat.
// Earlywood is pale, latewood bands are darker and a little green from the
// treatment; there are mill marks across the grain and a few small knots.
function woodTextures(early, late, seed) {
  const N = makeNoise(seed);
  const W = 2048, H = 256;
  const height = new Float32Array(W * H);
  const knots = Array.from({ length: 4 }, () => [N.rnd() * W, N.rnd() * H, 3 + N.rnd() * 5]);
  const map = canvasTex(W, H, (x, y) => {
    const u = x / W, v = y / H;
    // ring position across the board, wandering slowly along it
    let r = v * 15 + N.fbm(u * 2, v * 1.5, 2, 2) * 4 + N.fbm(u * 6, v * 3, 6, 3, 2) * 0.5;
    // uneven growth: rings bunch up and spread out across the board
    r += 2.2 * N.fbm(u * 1, v * 6, 1, 6, 2);
    // knots pull the rings around them
    let kd = 1e9;
    for (const [kx, ky, kr] of knots) {
      let dx = Math.abs(x - kx); dx = Math.min(dx, W - dx) / 4;
      let dy = Math.abs(y - ky); dy = Math.min(dy, H - dy);
      const d = Math.hypot(dx, dy) / kr;
      kd = Math.min(kd, d);
      r += 1.6 * Math.exp(-d * d * 0.5) * Math.sign(y - ky || 1);
    }
    const f = r - Math.floor(r);
    // latewood: a sharp darker band at the end of each ring
    const lwStart = 0.5 + 0.3 * N.noise(u * 3, v * 15, 3, 15);
    const lw = smooth(lwStart, lwStart + 0.12, f) * (1 - smooth(0.93, 1, f)) * (0.45 + 0.55 * N.noise(u * 4, r * 0.7, 4, 256));
    const pores = N.fbm(u * 900, v * 60, 900, 60, 2);
    const mill = 0.5 + 0.5 * Math.sin(u * 2 * Math.PI * 520 + N.fbm(u * 4, v, 4, 1) * 4);
    const blotch = N.fbm(u * 5, v * 1.5, 5, 2, 3);
    const fiber = N.fbm(u * 3, v * 180, 3, 180, 3);
    let t = clamp01(lw * 0.55 + (pores - 0.5) * 0.2 + (blotch - 0.5) * 0.4 + (fiber - 0.5) * 0.45);
    let c = mix3(early, late, t);
    const k = Math.exp(-kd * kd * 1.2);
    if (k > 0.01) c = mix3(c, [120, 84, 46], k * 0.75);
    const m = 1 - 0.012 * mill;
    height[y * W + x] = clamp01(0.6 - 0.45 * lw - 0.15 * k + 0.12 * (pores - 0.5) + 0.015 * mill);
    return [c[0] * m, c[1] * m, c[2] * m];
  });
  const bump = canvasTex(W, H, (x, y) => {
    const h = height[y * W + x] * 255;
    return [h, h, h];
  }, false);
  return { map, bump };
}

// Concrete tile = 48" × 48", applied triplanar. Mottled cement paste with
// sand grains, a few exposed aggregate stones and small air pores.
function concreteTexture(seed, base) {
  const N = makeNoise(seed);
  const S = 1024;
  const stones = Array.from({ length: 900 }, () => [N.rnd() * S, N.rnd() * S, 1.5 + N.rnd() * 4, N.rnd()]);
  const grid = Array.from({ length: 64 * 64 }, () => []);
  for (const st of stones) grid[Math.floor(st[1] / 16) * 64 + Math.floor(st[0] / 16)].push(st);
  return canvasTex(S, S, (x, y) => {
    const u = x / S, v = y / S;
    const mott = N.fbm(u * 6, v * 6, 6, 6, 5);
    const fine = N.fbm(u * 160, v * 160, 160, 160, 2);
    const grain = N.noise(u * 520, v * 520, 520, 520);
    let k = 0.9 + 0.32 * (mott - 0.5) + 0.12 * (fine - 0.5) + 0.14 * (grain - 0.5);
    let tint = [1, 1, 1];
    // exposed aggregate
    const gx = Math.floor(x / 16), gy = Math.floor(y / 16);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const cell = grid[((gy + j + 64) % 64) * 64 + ((gx + i + 64) % 64)];
      for (const [sx, sy, sr, sv] of cell) {
        let dx = Math.abs(x - sx); dx = Math.min(dx, S - dx);
        let dy = Math.abs(y - sy); dy = Math.min(dy, S - dy);
        if (dx * dx + dy * dy < sr * sr) {
          if (sv < 0.05 && sr < 3) { k *= 0.55; } // air pore
          else { k *= 0.82 + sv * 0.3; tint = sv > 0.6 ? [1.04, 1.0, 0.94] : [0.96, 0.98, 1.02]; }
        }
      }
    }
    return [base[0] * k * tint[0], base[1] * k * tint[1], base[2] * k * tint[2]].map((c) => Math.min(255, c));
  });
}

// Galvanised sheet: spangle crystals plus faint streaks along the roll
// direction. One tile = 24" × 24". Grey in rgb, used as colour and as the
// roughness map.
function spangleTexture(seed) {
  const N = makeNoise(seed);
  const S = 512;
  // jittered grid of crystal centres: one per 16 px cell, so only the 3×3
  // neighbouring cells need checking
  const C = 16, G = S / C;
  const cell = Array.from({ length: G * G }, () => [N.rnd() * C, N.rnd() * C, N.rnd()]);
  return canvasTex(S, S, (x, y) => {
    let best = 1e9, second = 1e9, val = 1;
    const gx = Math.floor(x / C), gy = Math.floor(y / C);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const cx = gx + i, cy = gy + j;
      const [ox, oy, v] = cell[((cy + G) % G) * G + ((cx + G) % G)];
      const dx = x - (cx * C + ox), dy = y - (cy * C + oy);
      const d = dx * dx + dy * dy;
      if (d < best) { second = best; best = d; val = v; } else if (d < second) second = d;
    }
    const edge = smooth(0, 2.5, Math.sqrt(second) - Math.sqrt(best));
    const streak = N.fbm(x / 6, y / 160, S / 6, S / 160, 3);
    const k = 255 * clamp01(0.8 + val * 0.12 - (1 - edge) * 0.05 + (streak - 0.5) * 0.12);
    return [k, k, k];
  }, false);
}

// Rotary-cut tropical hardwood (lauan) veneer: one tile = one 4' × 8'
// sheet. Wide wavy figure with fine pores running along the sheet.
function plywoodTexture(seed) {
  const N = makeNoise(seed);
  const W = 512, H = 1024;
  return canvasTex(W, H, (x, y) => {
    const u = x / W, v = y / H;
    const warp = N.fbm(u * 2, v * 4, 2, 4) * 4 + N.fbm(u * 6, v * 2, 6, 2) * 0.8;
    const fig = 0.5 + 0.5 * Math.sin((u * 7 + warp) * Math.PI);
    const pores = N.fbm(u * 220, v * 14, 220, 14, 2);
    const blotch = N.fbm(u * 3, v * 3, 3, 3, 3);
    const t = clamp01(0.45 + 0.28 * (fig - 0.5) + 0.25 * (pores - 0.5) + 0.45 * (blotch - 0.5));
    return mix3([170, 124, 92], [208, 164, 124], t);
  });
}

// Draws tileable strokes/dots on a 2D canvas: fn(ctx, x, y) is called at
// every wrapped copy of a mark that crosses the tile edge.
function wrapDraw(ctx, S, x, y, r, fn) {
  for (const dx of [-S, 0, S]) {
    if ((dx < 0 && x + r < S) || (dx > 0 && x - r > 0)) continue;
    for (const dy of [-S, 0, S]) {
      if ((dy < 0 && y + r < S) || (dy > 0 && y - r > 0)) continue;
      fn(ctx, x + dx, y + dy);
    }
  }
}
function paintedTex(S, paint) {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  paint(c.getContext('2d'));
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 16;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Coral sand: one tile = 18". Mottled base, thousands of grains, bits of
// white shell and coral and a few dark pebbles.
function sandTexture(seed) {
  const N = makeNoise(seed);
  const S = 1024;
  return paintedTex(S, (ctx) => {
    const img = ctx.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const n = N.fbm(x / 64, y / 64, S / 64, S / 64, 4);
      const g = N.noise(x / 2.5, y / 2.5, S / 2.5, S / 2.5);
      const k = 0.9 + 0.2 * (n - 0.5) + 0.22 * (g - 0.5);
      const i = (y * S + x) * 4;
      img.data[i] = 196 * k; img.data[i + 1] = 182 * k; img.data[i + 2] = 152 * k; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const dot = (n, rMin, rMax, col) => {
      for (let i = 0; i < n; i++) {
        const x = N.rnd() * S, y = N.rnd() * S, r = rMin + N.rnd() * (rMax - rMin);
        ctx.fillStyle = col(N.rnd());
        wrapDraw(ctx, S, x, y, r * 1.6, (c, px, py) => {
          c.beginPath();
          c.ellipse(px, py, r, r * (0.6 + N.rnd() * 0.4), N.rnd() * Math.PI, 0, Math.PI * 2);
          c.fill();
        });
      }
    };
    dot(26000, 0.6, 1.6, (v) => `rgba(${120 + v * 120 | 0},${110 + v * 112 | 0},${86 + v * 100 | 0},0.55)`);
    dot(900, 1.5, 5, (v) => `rgba(${226 + v * 29 | 0},${222 + v * 28 | 0},${208 + v * 30 | 0},0.9)`);
    dot(160, 1.5, 4, (v) => `rgba(${70 + v * 50 | 0},${64 + v * 44 | 0},${54 + v * 36 | 0},0.8)`);
  });
}

// Short tropical grass and weeds seen from above: one tile = 36". Blades
// are drawn as strokes in many greens over sandy soil, with some dry ones.
function grassTexture(seed) {
  const N = makeNoise(seed);
  const S = 1024;
  return paintedTex(S, (ctx) => {
    const img = ctx.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const n = N.fbm(x / 48, y / 48, S / 48, S / 48, 3);
      const k = 0.75 + 0.5 * (n - 0.5);
      const i = (y * S + x) * 4;
      img.data[i] = 104 * k; img.data[i + 1] = 98 * k; img.data[i + 2] = 70 * k; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    ctx.lineCap = 'round';
    for (let i = 0; i < 52000; i++) {
      const x = N.rnd() * S, y = N.rnd() * S;
      const len = 6 + N.rnd() * 26, a = N.rnd() * Math.PI * 2;
      const dry = N.rnd() < 0.12;
      const l = 0.35 + N.rnd() * 0.65;
      const col = dry
        ? `rgb(${150 * l + 40 | 0},${136 * l + 34 | 0},${86 * l + 20 | 0})`
        : `rgb(${(46 + N.rnd() * 50) * l + 10 | 0},${(84 + N.rnd() * 56) * l + 14 | 0},${(24 + N.rnd() * 26) * l | 0})`;
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.2 + N.rnd() * 2.2;
      const bend = (N.rnd() - 0.5) * 0.8;
      wrapDraw(ctx, S, x, y, len, (c, px, py) => {
        c.beginPath();
        c.moveTo(px, py);
        c.quadraticCurveTo(px + Math.cos(a) * len * 0.5, py + Math.sin(a) * len * 0.5, px + Math.cos(a + bend) * len, py + Math.sin(a + bend) * len);
        c.stroke();
      });
    }
  });
}

let cache = null;
function textures() {
  if (cache) return cache;
  cache = {
    wood: woodTextures([190, 176, 134], [138, 120, 82], 3),
    concrete: concreteTexture(5, [150, 147, 140]),
    spangle: spangleTexture(13),
    ply: plywoodTexture(17),
    sand: sandTexture(7),
    grass: grassTexture(23),
  };
  return cache;
}

// --- shader noise and patches -------------------------------------------
const NOISE_GLSL = /* glsl */ `
float hb_h31(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float hb_vn(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hb_h31(i), hb_h31(i + vec3(1, 0, 0)), f.x), mix(hb_h31(i + vec3(0, 1, 0)), hb_h31(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hb_h31(i + vec3(0, 0, 1)), hb_h31(i + vec3(1, 0, 1)), f.x), mix(hb_h31(i + vec3(0, 1, 1)), hb_h31(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float hb_fbm(vec3 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) { s += a * hb_vn(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return s / 0.9375;
}
vec3 hb_perturb(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection) {
  vec3 vSigmaX = normalize(dFdx(surf_pos.xyz));
  vec3 vSigmaY = normalize(dFdy(surf_pos.xyz));
  vec3 R1 = cross(vSigmaY, surf_norm);
  vec3 R2 = cross(surf_norm, vSigmaX);
  float fDet = dot(vSigmaX, R1) * faceDirection;
  vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
  return normalize(abs(fDet) * surf_norm - vGrad);
}
`;

// cfg: { tri: {tex, scale, bump}, macro: [scale, amp], rough: amp,
//        weather: amount (vertical streaks + grime at the base), id }
function patch(mat, cfg) {
  const uniforms = {};
  if (cfg.tri) {
    uniforms.uTri = { value: cfg.tri.tex };
    uniforms.uTriScale = { value: cfg.tri.scale };
    uniforms.uTriBump = { value: cfg.tri.bump || 0 };
  }
  mat.customProgramCacheKey = () => 'hb-' + cfg.id;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nattribute vec3 aRest;\nvarying vec3 vRest;\nvarying vec3 vRestN;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvRest = aRest;\nvRestN = normalize(mat3(modelMatrix) * objectNormal);`);
    let frag = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vRest;\nvarying vec3 vRestN;\n${cfg.tri ? 'uniform sampler2D uTri; uniform float uTriScale; uniform float uTriBump;' : ''}\n${NOISE_GLSL}`);
    let mapCode = '#include <map_fragment>\n';
    if (cfg.tri) {
      // triplanar in rest space, blended between two scales by noise so
      // the tile never repeats visibly
      mapCode = `
      vec3 hbW = pow(abs(normalize(vRestN)), vec3(6.0)); hbW /= (hbW.x + hbW.y + hbW.z);
      vec3 hbP = vRest / uTriScale;
      vec3 hbA = texture2D(uTri, hbP.zy).rgb * hbW.x + texture2D(uTri, hbP.xz).rgb * hbW.y + texture2D(uTri, hbP.xy).rgb * hbW.z;
      vec3 hbQ = vRest / (uTriScale * 2.71) + 0.37;
      vec3 hbB = texture2D(uTri, hbQ.zy).rgb * hbW.x + texture2D(uTri, hbQ.xz).rgb * hbW.y + texture2D(uTri, hbQ.xy).rgb * hbW.z;
      float hbSel = smoothstep(0.35, 0.65, hb_vn(vRest / 37.0));
      vec3 hbTex = mix(hbA, hbB, hbSel);
      diffuseColor.rgb *= hbTex;
      float hbHeight = dot(hbTex, vec3(0.3, 0.59, 0.11));
      `;
    }
    const [ms, ma] = cfg.macro || [60, 0.1];
    mapCode += `
      float hbM = hb_fbm(vRest / ${ms.toFixed(2)});
      float hbM2 = hb_vn(vRest / ${(ms * 0.21).toFixed(2)});
      diffuseColor.rgb *= 1.0 + ${ma.toFixed(3)} * ((hbM - 0.5) * 1.6 + (hbM2 - 0.5) * 0.5);
    `;
    if (cfg.weather) {
      const a = cfg.weather.toFixed(3);
      mapCode += `
      // rain streaks running down from edges, and splash-back grime near the ground
      float hbS = hb_vn(vec3(vRest.x * 0.35, vRest.y * 0.012, vRest.z * 0.35));
      float hbS2 = hb_vn(vec3(vRest.x * 1.3, vRest.y * 0.03, vRest.z * 1.3));
      float hbStreak = smoothstep(0.5, 0.85, hbS) * (0.6 + 0.4 * hbS2);
      float hbBase = 1.0 - smoothstep(-2.0, 22.0, vRest.y + (hbM - 0.5) * 16.0);
      vec3 hbDirt = vec3(0.62, 0.62, 0.58);
      diffuseColor.rgb *= mix(vec3(1.0), hbDirt, ${a} * (hbStreak * 0.55 + hbBase * 0.8));
      // a hint of green algae in the damp zone at the bottom
      diffuseColor.rgb *= mix(vec3(1.0), vec3(0.86, 0.93, 0.8), ${a} * hbBase * smoothstep(0.45, 0.7, hbM2));
      `;
    }
    frag = frag.replace('#include <map_fragment>', mapCode);
    if (cfg.rough) {
      frag = frag.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor * (1.0 + ${cfg.rough.toFixed(3)} * (hbM - 0.5) * 2.0), 0.04, 1.0);`);
    }
    if (cfg.tri && cfg.tri.bump) {
      frag = frag.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\nnormal = hb_perturb(-vViewPosition, normal, vec2(dFdx(hbHeight), dFdy(hbHeight)) * uTriBump, faceDirection);`);
    }
    sh.fragmentShader = frag;
  };
  return mat;
}

// Ground: coral sand with patches of grass and weeds, bare and trampled
// around the house. Two detail textures are mixed in world space at two
// scales each, with noise deciding where grass grows.
function groundMaterial(T) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0, color: 0xffffff });
  const uHouse = { value: new THREE.Vector4(0, 0, 400, 200) };
  m.userData.uHouse = uHouse;
  m.customProgramCacheKey = () => 'hb-ground';
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uHouse = uHouse;
    sh.uniforms.uSand = { value: T.sand };
    sh.uniforms.uGrass = { value: T.grass };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vGW;\nuniform vec4 uHouse;\nuniform sampler2D uSand, uGrass;\n${NOISE_GLSL}`)
      .replace('#include <map_fragment>', `
        vec2 gp = vGW.xz;
        vec2 gr = mat2(0.80, 0.60, -0.60, 0.80) * gp;
        // distance outside the house footprint (inches)
        vec2 hd = max(max(uHouse.xy - gp, gp - uHouse.zw), 0.0);
        float dHouse = length(hd);
        float big = hb_fbm(vec3(gp / 1100.0, 1.3));
        float mid = hb_fbm(vec3(gp / 160.0, 7.1));
        float sel = smoothstep(0.3, 0.7, hb_vn(vec3(gp / 70.0, 4.2)));
        vec3 sandT = mix(texture2D(uSand, gp / 18.0).rgb, texture2D(uSand, gr / 43.0 + 0.31).rgb, sel);
        vec3 grassT = mix(texture2D(uGrass, gp / 36.0).rgb, texture2D(uGrass, gr / 77.0 + 0.57).rgb, 1.0 - sel);
        // grass grows away from the house, in irregular patches
        float field = big * 0.8 + mid * 0.55 - 0.16 + smoothstep(80.0, 600.0, dHouse) * 0.28 - (1.0 - smoothstep(30.0, 200.0, dHouse)) * 0.45;
        float edge = hb_vn(vec3(gp / 7.0, 3.3));
        float edge2 = hb_vn(vec3(gp / 31.0, 8.8));
        float grassAmt = smoothstep(0.47, 0.6, field + (edge - 0.5) * 0.14 + (edge2 - 0.5) * 0.12);
        vec3 sand = sandT * vec3(0.93, 0.9, 0.86) * (0.92 + 0.22 * (mid - 0.5) + 0.12 * (big - 0.5));
        vec3 grass = grassT * mix(vec3(0.9, 1.0, 0.8), vec3(1.25, 1.08, 0.78), smoothstep(0.35, 0.75, hb_fbm(vec3(gp / 380.0, 2.2)))) * (0.75 + 0.5 * mid);
        // thin grass at the edge of each patch lets the sand show through
        grass = mix(sand * 0.85, grass, smoothstep(0.0, 0.6, grassAmt));
        diffuseColor.rgb = mix(sand, grass, grassAmt);
        float hbHeight = dot(mix(sandT, grassT * 1.6, grassAmt), vec3(0.3, 0.59, 0.11));
      `)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\nnormal = hb_perturb(-vViewPosition, normal, vec2(dFdx(hbHeight), dFdy(hbHeight)) * 1.5, faceDirection);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(0.95, 0.85, grassAmt);');
  };
  return m;
}

// --- palettes ----------------------------------------------------------
const SKETCH = {
  wood: 0xd8b98a,
  plyFloor: 0xe7cf9c,
  plyWall: 0xf0dfb8,
  tin: 0xc3c9cf,
  pvc: 0xe9eef0,
  concrete: 0xb7b7b2,
  slab: 0xc4c3bd,
  block: 0xa9a9a4,
  glass: 0x9fc6e6,
  alu: 0xd0d4d8,
  steel: 0x55595e,
  brass: 0xb08d3c,
  wrap: 0x2b2b2b,
  hole: 0x4a3b2a,
  string: 0xff3b30,
  stringDiag: 0x2f7cf6,
  rebar: 0x9a5a36,
  plastic: 0x3a4652,
  mortar: 0xd2cec4,
  fill: 0xd9cba8,
  ceramic: 0xf7f7f4,
  seat: 0xf0f0ec,
  pvcPipe: 0xe9e9e3,
  screen: 0x2f3438,
  water: 0x3a9fb0,
  drum: 0x1f5fa8,
  bucket: 0xe8742a,
  rubber: 0x2a2a2a,
};

// Per-part colour variation in the realistic view (brightness spread, hue
// spread), applied by the viewer as vertex colours.
export const TINT = {
  wood: [0.16, 0.06],
  plyWall: [0.1, 0.04],
  plyFloor: [0.1, 0.04],
  tin: [0.05, 0],
  pvc: [0.03, 0],
  concrete: [0.06, 0.01],
  slab: [0.04, 0],
  block: [0.07, 0.01],
};

export function makeMaterials(mode) {
  if (mode !== 'sketch' && !cache) {
    const t0 = performance.now();
    textures();
    console.info(`realistic textures: ${Math.round(performance.now() - t0)} ms`);
  }
  const M = {};
  if (mode === 'sketch') {
    for (const [k, c] of Object.entries(SKETCH)) {
      M[k] = new THREE.MeshLambertMaterial({
        color: c,
        side: THREE.DoubleSide,
        polygonOffset: k !== 'tin' && k !== 'pvc',
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
        transparent: k === 'glass' || k === 'water' || k === 'screen',
        opacity: { glass: 0.45, water: 0.45, screen: 0.55 }[k] ?? 1,
        depthWrite: k !== 'glass' && k !== 'water' && k !== 'screen',
      });
    }
    M.ground = new THREE.MeshLambertMaterial({ color: 0xc5cdb5, transparent: true, opacity: 0.8, depthWrite: false });
    M.edge = new THREE.LineBasicMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0.85 });
    M.edgeHL = new THREE.LineBasicMaterial({ color: 0xff6a00 });
  } else {
    const T = textures();
    const std = (o) => new THREE.MeshStandardMaterial({ vertexColors: true, ...o });
    M.wood = patch(std({ map: T.wood.map, bumpMap: T.wood.bump, bumpScale: 1.4, roughness: 0.82 }), { id: 'wood', macro: [70, 0.12], rough: 0.15 });
    // the board texture is one whole sheet; sheet uvs are in 24" units
    const ply = T.ply.clone();
    ply.repeat.set(0.5, 0.25);
    ply.needsUpdate = true;
    M.plyWall = patch(std({ map: ply, roughness: 0.68, side: THREE.DoubleSide }), { id: 'ply', macro: [40, 0.08], rough: 0.1 });
    M.plyFloor = patch(std({ map: ply, roughness: 0.7 }), { id: 'plyf', macro: [40, 0.08] });
    // new hot-dip galvanised steel: bright, slightly mottled
    M.tin = patch(std({ color: 0xd2d5d6, metalness: 0.8, roughness: 0.45, roughnessMap: T.spangle, map: T.spangle, side: THREE.DoubleSide }), { id: 'tin', macro: [90, 0.06], rough: 0.2 });
    M.tin.map.colorSpace = THREE.NoColorSpace;
    M.pvc = patch(new THREE.MeshPhysicalMaterial({ vertexColors: true, color: 0xe4e6e2, metalness: 0, roughness: 0.38, clearcoat: 0.25, clearcoatRoughness: 0.3, side: THREE.DoubleSide }), { id: 'pvc', macro: [80, 0.04] });
    // weathered existing concrete and a new, smoother troweled slab
    M.concrete = patch(std({ color: 0xffffff, roughness: 0.93 }), { id: 'conc', tri: { tex: T.concrete, scale: 48, bump: 0.9 }, macro: [55, 0.28], rough: 0.08, weather: 1 });
    M.slab = patch(std({ color: 0xeceae6, roughness: 0.72 }), { id: 'slab', tri: { tex: T.concrete, scale: 72, bump: 0.25 }, macro: [70, 0.14], rough: 0.25 });
    // new hollow block: paler and cleaner than the old frame, deep texture
    M.block = patch(std({ color: 0xf2efe8, roughness: 0.92 }), { id: 'block', tri: { tex: T.concrete, scale: 30, bump: 1.2 }, macro: [45, 0.12], rough: 0.08, weather: 0.35 });
    M.mortar = patch(std({ color: 0xd8d3c8, roughness: 0.95 }), { id: 'mortar', tri: { tex: T.concrete, scale: 20, bump: 0.6 }, macro: [40, 0.1] });
    M.fill = std({ color: 0xcdbd98, roughness: 1 });
    M.ceramic = new THREE.MeshPhysicalMaterial({ vertexColors: true, color: 0xf6f6f2, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 });
    M.seat = std({ color: 0xeeeeea, roughness: 0.35 });
    M.pvcPipe = std({ color: 0xe6e6df, roughness: 0.4 });
    M.screen = new THREE.MeshStandardMaterial({ color: 0x1c2024, roughness: 0.8, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false });
    M.water = new THREE.MeshPhysicalMaterial({ color: 0x2c8f9c, roughness: 0.06, metalness: 0, transparent: true, opacity: 0.72, depthWrite: false, envMapIntensity: 1.1 });
    M.drum = std({ color: 0x1d4f9c, roughness: 0.5 });
    M.bucket = std({ color: 0xe0661e, roughness: 0.55 });
    M.rubber = std({ color: 0x1a1a1a, roughness: 0.8 });
    M.glass = new THREE.MeshPhysicalMaterial({ color: 0xe8efec, metalness: 0, roughness: 0.32, transparent: true, opacity: 0.62, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.2 });
    M.alu = new THREE.MeshStandardMaterial({ color: 0xc9ccce, metalness: 1, roughness: 0.32 });
    M.steel = new THREE.MeshStandardMaterial({ color: 0xa4a8ab, metalness: 1, roughness: 0.42 });
    M.brass = new THREE.MeshStandardMaterial({ color: 0xc9a54a, metalness: 1, roughness: 0.3 });
    M.wrap = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.55 });
    M.hole = new THREE.MeshStandardMaterial({ color: 0x5c4a35, roughness: 1 });
    M.string = new THREE.MeshStandardMaterial({ color: 0xff4a3a, roughness: 0.8 });
    M.stringDiag = new THREE.MeshStandardMaterial({ color: 0x2f7cf6, roughness: 0.8 });
    M.ground = groundMaterial(T);
    M.rebar = new THREE.MeshStandardMaterial({ color: 0x6b3d24, metalness: 0.6, roughness: 0.75 });
    M.plastic = new THREE.MeshStandardMaterial({ color: 0x1d232b, roughness: 0.3, side: THREE.DoubleSide });
    M.edge = null;
    M.edgeHL = null;
  }
  // highlight variants for the current construction step
  M.hl = {};
  for (const [k, m] of Object.entries(M)) {
    if (!m || !m.isMaterial || k === 'ground' || k === 'edge' || k === 'edgeHL') continue;
    const h = m.clone();
    h.onBeforeCompile = m.onBeforeCompile;
    h.customProgramCacheKey = m.customProgramCacheKey;
    if (h.emissive) {
      h.emissive = new THREE.Color(0xff7a1a);
      h.emissiveIntensity = mode === 'sketch' ? 0.35 : 0.22;
    }
    M.hl[k] = h;
  }
  return M;
}
