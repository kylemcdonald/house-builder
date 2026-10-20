// Bill-of-materials page, shared by the house and the toilet house.
import { shoppingList, PHASES } from './bom.js';
import { QUOTE } from './catalog.js';
import { ftin, money, num } from './format.js';
import { shopRows, shopCSV, shopHTML } from './shopping.js';

// opts: { bom, P, ship, prices, area, areaLabel, csvName, onPrices, onResetPrices, extraCards }
export function renderBomDoc(host, o) {
  const { bom: b, P, ship } = o;
  const freight = ship ? ship.totVol * P.freight : 0;
  const total = b.subtotal + b.tax + freight;
  let h = `<h2>Bill of materials</h2>
  <p class="muted">Quantities are computed from the 3D model: lumber is cut-optimised from 16' boards, sheets are nested, nails, screws, anchors and ties are counted from the hardware drawn in the model, and each group carries its own contingency (set in the sidebar). Prices marked <span class="badge quote">quote</span> come from the Weno supply shop's written quote (${QUOTE.ref}, ${QUOTE.date}, valid for 7 days); the rest come from the shop's price sign, and items marked <span class="badge">est.</span> are on neither and are estimates. Edit any price and it is saved in this browser.</p>
  <div class="cards">
    <div class="card"><div class="k">Total</div><div class="v">${money(total)}</div><div class="s">incl. ${P.tax}% tax${freight ? ` and ${money(freight)} freight` : ''}</div></div>
    <div class="card"><div class="k">Per sq ft of floor</div><div class="v">${money(total / o.area)}</div><div class="s">${num(o.area, o.area < 100 ? 1 : 0)} sq ft${o.areaLabel ? ` ${o.areaLabel}` : ''}</div></div>
    <div class="card"><div class="k">Shipping weight</div><div class="v">${num(ship.totLb)} lb</div><div class="s">${num(ship.totLb * 0.4536)} kg</div></div>
    <div class="card"><div class="k">Shipping volume</div><div class="v">${num(ship.totVol)} ft³</div><div class="s">${num((ship.totVol / 1172) * 100)}% of a 20' container</div></div>
  </div>
  <div class="actions">
    <button class="btn" data-act="csv">Download CSV</button>
    <button class="btn" data-act="print">Print</button>
    ${o.shopName ? `<button class="btn" data-act="shopcsv">Store shopping list CSV${b.phased ? ' (phase 1)' : ''}</button>
    <button class="btn" data-act="shopprint">Print store shopping list${b.phased ? ' (phase 1)' : ''}</button>` : ''}
    <button class="btn" data-act="reset">Reset prices</button>
  </div>
  <div class="table-wrap"><table class="t"><thead><tr><th>Item</th><th>Used for</th><th class="n">Net</th><th class="n">+ Over</th><th class="n">Buy</th><th class="n">Unit price</th><th class="n">Total</th></tr></thead><tbody>`;
  // a phased BOM (the house) lists phase 1's sections, then phase 2's
  const phases = b.phased ? [1, 2] : [0];
  const inPhase = (l, ph) => !ph || (l.phase || 1) === ph;
  const groups = phases.flatMap((ph) => [{ ph }, ...b.sections.map((sec) => ({ ph, sec }))]);
  for (const { ph, sec } of groups) {
    const ls = b.lines.filter((l) => inPhase(l, ph) && (!sec || l.section === sec));
    if (!sec) {
      if (ph) h += `<tr class="tot"><td colspan="6">${PHASES[ph]}</td><td class="n">${money(ls.reduce((s, l) => s + l.total, 0))}</td></tr>`;
      continue;
    }
    if (!ls.length) continue;
    const st = ls.reduce((s, l) => s + l.total, 0);
    h += `<tr class="sec"><td colspan="6">${sec}</td><td class="n">${money(st)}</td></tr>`;
    for (const l of ls) {
      h += `<tr><td>${l.name}${l.est ? '<span class="badge">est.</span>' : ''}${l.quote ? '<span class="badge quote">quote</span>' : ''}${l.note ? `<div class="use">⚠ ${l.note}</div>` : ''}</td>
      <td><span class="use">${l.use}</span></td>
      <td class="n">${num(l.net, l.net % 1 ? 1 : 0)}</td>
      <td class="n">${l.ov}%</td>
      <td class="n"><b>${num(l.buy)}</b> ${l.unit !== 'ea' ? `<span class="use">${l.unit}</span>` : ''}</td>
      <td class="n">${l.fixed ? money(l.price) : `$<input class="price" data-key="${l.key}" type="number" step="0.05" min="0" value="${l.price.toFixed(2)}">`}</td>
      <td class="n">${money(l.total)}</td></tr>`;
    }
  }
  h += `<tr class="tot"><td colspan="6">Materials subtotal</td><td class="n">${money(b.subtotal)}</td></tr>`;
  if (b.tax) h += `<tr><td colspan="6">Sales tax ${P.tax}%</td><td class="n">${money(b.tax)}</td></tr>`;
  if (freight) h += `<tr><td colspan="6">Ferry freight: ${num(ship.totVol)} ft³ × ${money(P.freight)}</td><td class="n">${money(freight)}</td></tr>`;
  h += `<tr class="tot"><td colspan="6">Total</td><td class="n">${money(total)}</td></tr></tbody></table></div>`;

  for (const ph of phases) {
    const shop = shoppingList({ lines: b.lines.filter((l) => inPhase(l, ph)) }).filter((s) => s.total > 0);
    h += `<h3>Shopping list${ph ? ` — ${PHASES[ph].toLowerCase()}` : ''} (what to ask for at the counter)</h3><div class="table-wrap"><table class="t"><thead><tr><th>Item</th><th class="n">Qty</th><th class="n">Price</th><th class="n">Total</th></tr></thead><tbody>`;
    for (const s of shop) h += `<tr><td>${s.name}${s.est ? '<span class="badge">est.</span>' : ''}${s.quote ? '<span class="badge quote">quote</span>' : ''}</td><td class="n">${num(s.buy)} ${s.unit !== 'ea' ? s.unit : ''}</td><td class="n">${money(s.price)}</td><td class="n">${money(s.total)}</td></tr>`;
    h += `<tr class="tot"><td colspan="3">Total before tax</td><td class="n">${money(shop.reduce((t, s) => t + s.total, 0))}</td></tr></tbody></table></div>`;
  }

  h += `<h3>Local materials (gathered on Polowat, not purchased)</h3><div class="table-wrap"><table class="t"><thead><tr><th>Material</th><th class="n">Qty</th></tr></thead><tbody>`;
  for (const l of b.local.filter((x) => x.qty > 0)) h += `<tr><td>${l.name}</td><td class="n">${num(l.qty)} ${l.unit}</td></tr>`;
  h += `</tbody></table></div>`;

  if (o.shipTable) {
    h += `<h3>Shipping</h3><div class="table-wrap"><table class="t"><thead><tr><th>Bundle</th><th>Size (L × W × H)</th><th class="n">ft³</th><th class="n">lb</th></tr></thead><tbody>`;
    for (const s of ship.bundles) h += `<tr><td><b>${s.name}</b><div class="use">${s.qty}</div></td><td>${ftin(s.L)} × ${ftin(s.Wd)} × ${ftin(s.H)}</td><td class="n">${num(s.vol, 1)}</td><td class="n">${num(s.lb)}</td></tr>`;
    h += `<tr class="tot"><td colspan="2">Total</td><td class="n">${num(ship.totVol, 1)}</td><td class="n">${num(ship.totLb)}</td></tr></tbody></table></div>`;
  }

  h += `<h3>Cut list</h3><p class="muted">How each board, bar or length of pipe is cut. Hatched area is waste. Cuts include a 1/8" saw kerf.</p>`;
  for (const c of b.cuts) {
    const used = c.boards.reduce((s, bd) => s + bd.pieces.reduce((a, p) => a + p.len, 0), 0);
    const eff = (used / (c.boards.length * c.stock)) * 100;
    const unit = c.cat === 'pipe' || c.cat === 'gutter' ? 'lengths' : c.cat === 'rebar' ? 'bars' : c.cat === 'mesh' ? 'rolls' : 'boards';
    h += `<h4 style="margin:14px 0 6px">${c.section} — ${c.size} × ${ftin(c.stock)} · ${c.boards.length} ${unit} · ${num(eff)}% yield</h4><div class="cutlist">`;
    c.boards.forEach((bd, i) => {
      h += `<div class="cut-row"><span class="lab">#${i + 1}</span><div class="cut-bar">`;
      bd.pieces.forEach((pc, j) => {
        h += `<div class="${j % 2 ? 's' : ''}" style="width:${(pc.len / c.stock) * 100}%" title="${pc.label}: ${ftin(pc.len)}">${ftin(pc.len)} ${pc.label}</div>`;
      });
      h += `</div></div>`;
    });
    h += `</div>`;
  }
  host.innerHTML = h;
  host.querySelectorAll('input.price').forEach((inp) => inp.addEventListener('change', () => {
    o.prices[inp.dataset.key].price = Math.max(0, Number(inp.value) || 0);
    o.onPrices();
  }));
  host.querySelector('[data-act=csv]').addEventListener('click', () => downloadCSV(b, P, freight, o.csvName));
  host.querySelector('[data-act=print]').addEventListener('click', () => window.print());
  host.querySelector('[data-act=reset]').addEventListener('click', o.onResetPrices);
  if (o.shopName) {
    const rows = () => shopRows(b, b.phased ? 1 : 0);
    const label = b.phased ? `${o.shopTitle}, ${PHASES[1].toLowerCase()}` : o.shopTitle;
    host.querySelector('[data-act=shopcsv]').addEventListener('click', () => download(shopCSV(rows()), `${o.shopName}.csv`, 'text/csv'));
    host.querySelector('[data-act=shopprint]').addEventListener('click', () => {
      const w = window.open('', '_blank');
      if (!w) return;
      w.document.write(shopHTML(rows(), { title: `Shopping list: ${label}`, subtitle: 'For Ace Hardware, Weno, Chuuk', date: new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }) }));
      w.document.close();
      w.addEventListener('load', () => w.print());
    });
  }
  return total;
}

function download(text, name, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

function downloadCSV(b, P, freight, name) {
  const rows = [['Phase', 'Section', 'Item', 'Used for', 'Net', 'Overage %', 'Buy', 'Unit', 'Unit price', 'Total', 'Estimated price']];
  for (const l of b.lines) rows.push([b.phased ? PHASES[l.phase] : '', l.section, l.name, l.use, l.net.toFixed(2), l.ov, l.buy, l.unit, l.price.toFixed(2), l.total.toFixed(2), l.est ? 'yes' : '']);
  rows.push(['', '', 'Subtotal', '', '', '', '', '', '', b.subtotal.toFixed(2), '']);
  if (b.tax) rows.push(['', '', `Sales tax ${P.tax}%`, '', '', '', '', '', '', b.tax.toFixed(2), '']);
  rows.push(['', '', 'Total', '', '', '', '', '', '', (b.subtotal + b.tax + freight).toFixed(2), '']);
  if (freight) rows.push(['', '', 'Freight', '', '', '', '', '', '', freight.toFixed(2), '']);
  download(rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n'), name, 'text/csv');
}

export function bomTotal(b, P, ship) {
  return b.subtotal + b.tax + (ship ? ship.totVol * P.freight : 0);
}

// Shipping manifest beside a shipping-layout 3D view.
export function renderShipDoc(host, s, intro = 'Everything on the bill of materials, bundled and strapped as it would go on the ferry.') {
  const has = (re) => s.bundles.some((b) => re.test(b.name));
  let h = `<h2 style="margin-top:0">Shipping manifest</h2>
  <p class="muted">${intro} Hover the 3D view for item details.</p>
  <div class="cards">
    <div class="card"><div class="k">Weight</div><div class="v">${num(s.totLb)} lb</div><div class="s">${num(s.totLb * 0.4536)} kg</div></div>
    <div class="card"><div class="k">Volume</div><div class="v">${num(s.totVol)} ft³</div><div class="s">${num(s.totVol / 35.31, 1)} m³</div></div>
    <div class="card"><div class="k">Deck space</div><div class="v">${ftin(s.footprint.L)}</div><div class="s">× ${ftin(s.footprint.D)} laid out flat</div></div>
  </div>
  <table class="t"><thead><tr><th>Bundle</th><th>Size (L × W × H)</th><th class="n">ft³</th><th class="n">lb</th></tr></thead><tbody>`;
  for (const b of s.bundles) h += `<tr><td><b>${b.name}</b><div class="use">${b.qty}</div></td><td>${ftin(b.L)} × ${ftin(b.Wd)} × ${ftin(b.H)}</td><td class="n">${num(b.vol, 1)}</td><td class="n">${num(b.lb)}</td></tr>`;
  h += `<tr class="tot"><td colspan="2">Total</td><td class="n">${num(s.totVol, 1)}</td><td class="n">${num(s.totLb)}</td></tr></tbody></table>
  <h3>Packing tips</h3><ul>
  <li>Strap lumber in bundles at 3 points; put the longest boards on the bottom of the stack.</li>
  <li>Tin/PVC sheets nest tightly — keep them flat on lumber dunnage so they don't kink.${has(/plywood/i) ? ' Put a sheet of plywood on top to protect them.' : ''}</li>
  ${has(/Cement/) ? '<li>Wrap cement bags in a tarp: cement takes on moisture from the sea air and goes hard. Buy it as close to sailing as possible.</li>' : ''}
  ${has(/Louvre glass/) ? '<li>Pack louvre glass on edge in a crate with cardboard between blades. The BOM already adds 10% spare blades.</li>' : ''}
  ${has(/Toilet bowl/) ? '<li>Crate the toilet bowl with cardboard all round: it is the one item that can\'t be replaced on the island if it cracks.</li>' : ''}
  <li>Keep nails and hardware in sealed buckets — they double as mixing buckets on site.</li>
  </ul>`;
  host.innerHTML = h;
}
