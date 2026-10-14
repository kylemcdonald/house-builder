// Lays every purchased item out flat, bundled the way it would be strapped
// for the ferry, and reports bundle sizes, volumes and weights.
import { LUMBER, PLY } from './catalog.js';
import { ftin, num } from './format.js';

const CORR = { pitch: 3, depth: 0.75 };

export function shippingLayout(bom, P) {
  const parts = [];
  const labels = [];
  const bundles = [];
  let id = 0;
  const box = (x0, x1, y0, y1, z0, z1, mat, name, info) =>
    parts.push({ id: id++, kind: 'box', size: [x1 - x0, y1 - y0, z1 - z0], pos: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], quat: null, mat, name, info });

  // Collect bundle generators: each returns {L, Wd, H, draw(x, z)}
  const gens = [];
  const lumber = {};
  for (const l of bom.lines) if (l.key.startsWith('L')) lumber[l.key.slice(1)] = (lumber[l.key.slice(1)] || 0) + l.buy;
  for (const [size, n] of Object.entries(lumber)) {
    const { t, w, stock } = LUMBER[size];
    const cols = Math.max(1, Math.round(Math.sqrt((n * t) / w)));
    const layers = Math.ceil(n / cols);
    const lb = bom.lines.filter((l) => l.key === 'L' + size).reduce((s, l) => s + l.lb, 0);
    gens.push({
      name: `${size}x${stock / 12} lumber`, qty: `${n} boards`, L: stock, Wd: cols * w, H: layers * t, lb,
      draw(x, z) {
        for (let i = 0; i < n; i++) {
          const c = i % cols;
          const r = Math.floor(i / cols);
          box(x, x + stock, r * t, (r + 1) * t - 0.02, z + c * w, z + (c + 1) * w - 0.05, 'wood', `${size} × ${ftin(stock)}`, `board ${i + 1} of ${n}`);
        }
      },
    });
  }
  for (const l of bom.lines.filter((x) => PLY[x.key])) {
    const t = PLY[l.key].t;
    const n = l.buy;
    gens.push({
      name: PLY[l.key].name, qty: `${n} sheets`, L: 96, Wd: 48, H: n * t, lb: l.lb,
      draw(x, z) {
        for (let i = 0; i < n; i++) box(x, x + 96, i * t, (i + 1) * t - 0.01, z, z + 48, 'plyFloor', PLY[l.key].name, `sheet ${i + 1} of ${n}`);
      },
    });
  }
  const tinMat = P.cladding === 'pvc' ? 'pvc' : 'tin';
  for (const l of bom.lines.filter((x) => /^(metal|pvc)\d+$/.test(x.key))) {
    const L = Number(l.key.match(/\d+$/)[0]) * 12;
    const n = l.buy;
    const sw = P.tinCover + 3;
    gens.push({
      name: l.name, qty: `${n} sheets`, L, Wd: sw, H: 0.75 + n * 0.12, lb: l.lb,
      draw(x, z) {
        // local x across sheet → world z, local y along sheet → world x, local z → up
        const q = [-0.5, -0.5, -0.5, 0.5]; // basis (Z, X, Y)
        for (let i = 0; i < n; i++) {
          parts.push({ id: id++, kind: 'sheet', geom: { w: sw, h: L, corr: CORR }, pos: [x, i * 0.12, z], quat: q, mat: tinMat, name: l.name, info: `sheet ${i + 1} of ${n}` });
        }
      },
    });
  }
  const ridge = bom.lines.find((x) => x.key.startsWith('ridge'));
  if (ridge) {
    gens.push({
      name: ridge.name, qty: `${ridge.buy} pcs`, L: 120, Wd: 14, H: ridge.buy * 0.3 + 2, lb: ridge.lb,
      draw(x, z) {
        for (let i = 0; i < ridge.buy; i++) box(x, x + 120, i * 0.3, i * 0.3 + 2, z, z + 14, tinMat, ridge.name, '');
      },
    });
  }
  const cement = bom.lines.find((x) => x.key === 'cement');
  if (cement) {
    // pallets of up to 60 bags (10 layers of 6)
    let left = cement.buy;
    let pal = 0;
    const nPal = Math.ceil(cement.buy / 60);
    while (left > 0) {
      const n = Math.min(60, left);
      left -= n;
      pal++;
      const per = 6;
      const layers = Math.ceil(n / per);
      gens.push({
        name: `Cement pallet ${pal} of ${nPal}`, qty: `${n} bags`, L: 48, Wd: 48, H: layers * 6 + 5, lb: (cement.lb / cement.buy) * n + 40,
        draw(x, z) {
          box(x, x + 48, 0, 5, z, z + 48, 'wood', 'Pallet', '');
          for (let i = 0; i < n; i++) {
            const k = i % per;
            const r = Math.floor(i / per);
            const [bx, bz, sx, sz] = r % 2 ? [Math.floor(k / 2) * 16, (k % 2) * 24, 16, 24] : [(k % 2) * 24, Math.floor(k / 2) * 16, 24, 16];
            box(x + bx + 0.3, x + bx + sx - 0.3, 5 + r * 6, 5 + r * 6 + 5.8, z + bz + 0.3, z + bz + sz - 0.3, 'concrete', 'Cement bag 40 kg', `${i + 1} of ${n}`);
          }
        },
      });
    }
  }
  const mesh = bom.lines.find((x) => x.key === 'mesh');
  if (mesh) {
    const d = 30; // a 100' roll of 7' mesh coils to about 30" across
    gens.push({
      name: 'Wire mesh rolls', qty: `${mesh.buy} roll${mesh.buy > 1 ? 's' : ''}`, L: 84, Wd: mesh.buy * (d + 2), H: d, lb: mesh.lb,
      draw(x, z) {
        for (let i = 0; i < mesh.buy; i++) parts.push({ id: id++, kind: 'cyl', r: d / 2, h: 84, pos: [x + 42, d / 2, z + i * (d + 2) + d / 2], quat: [0, 0, Math.SQRT1_2, Math.SQRT1_2], mat: 'steel', name: mesh.name, info: `roll ${i + 1} of ${mesh.buy}` });
      },
    });
  }
  const plastic = bom.lines.find((x) => x.key === 'plastic');
  if (plastic) {
    gens.push({
      name: 'Plastic sheeting rolls', qty: `${plastic.buy} rolls`, L: 120, Wd: plastic.buy * 7, H: 7, lb: plastic.lb,
      draw(x, z) {
        for (let i = 0; i < plastic.buy; i++) parts.push({ id: id++, kind: 'cyl', r: 3.4, h: 120, pos: [x + 60, 3.5, z + i * 7 + 3.5], quat: [0, 0, Math.SQRT1_2, Math.SQRT1_2], mat: 'plastic', name: plastic.name, info: '' });
      },
    });
  }
  const lf = bom.lines.find((x) => x.key.startsWith('louvreFrame'));
  const lg = bom.lines.find((x) => x.key.startsWith('louvreGlass'));
  if (lf) {
    const fh = lf.key.endsWith('4') ? 48 : 36;
    gens.push({
      name: 'Louvre frames', qty: `${lf.buy} pairs`, L: fh, Wd: 6, H: lf.buy * 1.4, lb: lf.lb,
      draw(x, z) {
        for (let i = 0; i < lf.buy * 2; i++) box(x, x + fh, i * 0.7, i * 0.7 + 0.65, z + 0.2, z + 2.6, 'alu', lf.name, '');
      },
    });
  }
  if (lg) {
    const bl = lg.key.endsWith('4') ? 48 : 36;
    const h = Math.max(6, Math.ceil(lg.buy / 2) * 0.25 + 3);
    gens.push({
      name: 'Louvre glass (crated)', qty: `${lg.buy} blades`, L: bl + 4, Wd: 12, H: h, lb: lg.lb + 15,
      draw(x, z) {
        box(x, x + bl + 4, 0, h, z, z + 12, 'plyFloor', 'Glass crate — pack blades on edge in cardboard', `${lg.buy} blades`);
      },
    });
  }
  const hw = bom.lines.filter((x) => x.section === 'Fasteners & hardware' || x.key === 'sealant' || x.key === 'tieWire');
  if (hw.length) {
    const lb = hw.reduce((s, l) => s + l.lb, 0);
    const n = Math.max(1, Math.ceil(lb / 45));
    gens.push({
      name: 'Hardware cartons', qty: `${n} cartons`, L: n * 17, Wd: 12, H: 10, lb,
      draw(x, z) {
        for (let i = 0; i < n; i++) box(x + i * 17, x + i * 17 + 16, 0, 10, z, z + 12, 'plyWall', 'Carton: nails, fasteners, anchors, ties, hinges, sealant, tie wire', '');
      },
    });
  }

  // Shelf layout on the "deck"
  gens.sort((a, b) => b.L - a.L || b.Wd - a.Wd);
  const maxRow = 480;
  const gap = 30;
  let x = 0;
  let z = 0;
  let rowD = 0;
  let maxX = 0;
  for (const g of gens) {
    if (x > 0 && x + g.L > maxRow) {
      x = 0;
      z += rowD + gap * 1.6;
      rowD = 0;
    }
    g.draw(x, z);
    const vol = (g.L * g.Wd * g.H) / 1728;
    bundles.push({ name: g.name, qty: g.qty, L: g.L, Wd: g.Wd, H: g.H, vol, lb: g.lb });
    labels.push({
      pos: [x + g.L / 2, g.H + 6, z + g.Wd / 2],
      html: `<b>${g.name}</b><span>${g.qty} · ${num(g.lb)} lb</span>`,
    });
    x += g.L + gap;
    maxX = Math.max(maxX, x);
    rowD = Math.max(rowD, g.Wd);
  }
  const depth = z + rowD;
  const totVol = bundles.reduce((s, b) => s + b.vol, 0);
  const totLb = bundles.reduce((s, b) => s + b.lb, 0);
  return {
    parts,
    labels,
    bundles,
    totVol,
    totLb,
    footprint: { L: maxX - gap, D: depth },
    bounds: { min: [-20, 0, -20], max: [maxX, 40, depth + 20] },
  };
}
