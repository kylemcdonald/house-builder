// Shopping list for the store counter: the bill of materials summed by item,
// with the shop's and Ace Hardware's item numbers, as CSV rows or as a
// printable page. Used by the BOM page and by scripts/shopping-list.mjs.
import { shoppingList, PHASES } from './bom.js';
import { ACE } from './ace-data.js';
import { QUOTE } from './catalog.js';
import { money, num } from './format.js';

const UNIT = { ea: '', boards: 'boards', sheets: 'sheets', bags: 'bags', rolls: 'rolls', tubes: 'tubes', cans: 'cans', boxes: 'boxes', lb: 'lb', ft: 'ft' };
const qtyText = (n, unit) => {
  let u = UNIT[unit] ?? unit;
  if (n === 1) u = u.replace(/^(\w+?)(?:(x)es|s)\b/, '$1$2'); // 1 box, 1 roll, 1 pack of 4
  return u ? `${num(n)} ${u}` : num(n);
};

// One row per store item. phase: 1 or 2 to take only that phase's lines.
//
// Quantity and price: an item on the shop's written quote is bought in the
// BOM's own units at the quoted price. Otherwise, when the Ace page is the
// same product (`exact`), the quantity is rounded up to Ace's pack (a 5 lb box
// of nails, a 100' roll of screen) and priced from acehardware.com. Failing
// both, the shop's price sign is used if the item is on it, then the price of
// the closest Ace item, or no price.
export function shopRows(bom, phase) {
  const lines = bom.lines.filter((l) => !l.local && (!phase || (l.phase || 1) === phase));
  const order = (s) => bom.sections.indexOf(s.section);
  return shoppingList({ lines }).filter((s) => s.buy > 0).sort((a, b) => order(a) - order(b)).map((s) => {
    const a = ACE[s.key] || {};
    const need = qtyText(s.buy, s.unit);
    let qty = s.buy;
    let unit = s.unit;
    let price = null;
    let source = '';
    if (s.quote) [price, source] = [s.price, 'quote'];
    else if (a.item && a.exact) {
      qty = Math.ceil(s.buy / (a.per || 1) - 1e-9);
      unit = a.unit || 'ea';
      if (a.price) [price, source] = [a.price, 'acehardware.com'];
    }
    if (price == null && !s.est && !s.quote) [price, source] = [s.price, 'price sign'];
    if (price == null && a.price && !a.exact) [price, source] = [a.price, 'acehardware.com, closest item'];
    return {
      phase: phase || 1, section: s.section, key: s.key, name: s.name, desc: a.desc || '', use: [...new Set(s.uses)].join('; '),
      qty, unit, qtyText: qtyText(qty, unit), need, converted: qty !== s.buy,
      store: s.store || '', item: a.item || '', mfr: a.mfr || '', aceName: a.title || '', url: a.url || '', exact: !!a.exact, aceNote: a.note || '',
      price, total: price == null ? null : price * qty, source,
    };
  });
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const csvCell = (c) => `"${String(c ?? '').replace(/"/g, '""')}"`;

export function shopCSV(rows) {
  const head = ['Phase', 'Section', 'Item', 'Description', 'Used for', 'Qty', 'Unit', 'Needed (BOM)', 'Store item # (quote)', 'Ace item #', 'Mfr #', 'Ace product', 'Ace match', 'Unit price', 'Total', 'Price source', 'Ace link', 'Notes'];
  const out = [head];
  for (const r of rows) {
    out.push([
      r.phase, r.section, r.name, r.desc, r.use, r.qty, r.unit === 'ea' ? 'each' : r.unit, r.need, r.store,
      r.item || 'unknown', r.mfr || (r.item ? '' : 'unknown'), r.aceName, r.item ? (r.exact ? 'same item' : 'closest item, check') : 'not found',
      r.price == null ? '' : r.price.toFixed(2), r.total == null ? '' : r.total.toFixed(2), r.source, r.url, r.aceNote,
    ]);
  }
  const priced = rows.filter((r) => r.total != null);
  out.push(['', '', `Total of ${priced.length} priced items (before ${QUOTE.tax}% tax)`, '', '', '', '', '', '', '', '', '', '', '', priced.reduce((t, r) => t + r.total, 0).toFixed(2), '', '', `${plural(rows.length - priced.length, 'item has', 'items have')} no price`]);
  return out.map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
}

// short price-source labels for the narrow printed column
const SOURCE = { quote: 'quote', 'acehardware.com': 'Ace web', 'price sign': 'price sign', 'acehardware.com, closest item': 'Ace web, closest' };

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// A clean page to print and hand to the store. The item names link to the Ace
// pages, without showing the addresses.
export function shopHTML(rows, { title, subtitle, date }) {
  const sections = [...new Set(rows.map((r) => r.section))];
  const priced = rows.filter((r) => r.total != null);
  const sum = priced.reduce((t, r) => t + r.total, 0);
  const unknown = rows.filter((r) => !r.item).length;
  let body = '';
  let n = 0;
  for (const sec of sections) {
    body += `<tr class="sec"><td colspan="7">${esc(sec)}</td></tr>`;
    for (const r of rows.filter((x) => x.section === sec)) {
      n++;
      const name = r.url ? `<a href="${esc(r.url)}">${esc(r.name)}</a>` : esc(r.name);
      const ace = r.item
        ? `${esc(r.item)}${r.exact ? '' : '<div class="flag">closest match, check</div>'}`
        : '<span class="unk">unknown</span>';
      body += `<tr>
        <td class="n idx">${n}</td>
        <td class="item"><div class="nm">${name}</div><div class="desc">${esc(r.desc)}</div><div class="use"><b>Used for:</b> ${esc(r.use)}</div>${r.aceName ? `<div class="ace">Ace: ${esc(r.aceName)}</div>` : ''}${r.aceNote ? `<div class="ace">${esc(r.aceNote)}</div>` : ''}</td>
        <td class="code">${ace}${r.store ? `<div class="store">Store # ${esc(r.store)}</div>` : ''}</td>
        <td class="code">${r.mfr ? esc(r.mfr) : '<span class="unk">unknown</span>'}</td>
        <td class="n qty"><b>${esc(r.qtyText)}</b>${r.converted ? `<div class="sub">need ${esc(r.need)}</div>` : ''}</td>
        <td class="n">${r.price == null ? '<span class="unk">—</span>' : money(r.price)}${r.source ? `<div class="sub">${SOURCE[r.source]}</div>` : ''}</td>
        <td class="n">${r.total == null ? '<span class="unk">—</span>' : money(r.total)}</td>
      </tr>`;
    }
  }
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
  @page { size: letter; margin: 0.45in 0.4in; }
  * { box-sizing: border-box; }
  body { font: 10pt/1.3 -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color: #111; background: #fff; margin: 0 auto; max-width: 8in; padding: 16px; }
  h1 { font-size: 16pt; margin: 0 0 2px; }
  .meta { color: #444; margin: 0 0 10px; }
  .note { border: 1px solid #bbb; padding: 6px 8px; margin: 0 0 12px; font-size: 9pt; color: #333; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  thead { display: table-header-group; }
  th { text-align: left; font-size: 8.5pt; text-transform: uppercase; letter-spacing: .03em; color: #333; border-bottom: 1.5px solid #111; padding: 4px; }
  td { padding: 5px 4px; border-bottom: 1px solid #ccc; vertical-align: top; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  tr.sec td { font-weight: 700; font-size: 10.5pt; border-bottom: 1.5px solid #111; padding-top: 12px; }
  .n { text-align: right; }
  .qty b, td.n > :first-child { white-space: nowrap; }
  .idx { color: #666; width: 22px; }
  .nm { font-weight: 600; }
  .nm a { color: inherit; text-decoration: none; border-bottom: 1px dotted #777; }
  .desc { margin-top: 1px; }
  .use, .ace, .sub, .store, .flag { font-size: 8.5pt; color: #444; }
  .ace { color: #666; }
  .flag { color: #a33; }
  .flag, .store { font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; }
  .code { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 9pt; overflow-wrap: anywhere; }
  .unk { color: #888; font-style: italic; font-family: inherit; }
  .qty b { font-size: 10.5pt; }
  tfoot { display: table-row-group; }
  tfoot td { border-bottom: none; border-top: 1.5px solid #111; font-weight: 700; padding-top: 8px; }
  @media print { body { padding: 0; max-width: none; } }
</style></head><body>
<h1>${esc(title)}</h1>
<p class="meta">${esc(subtitle)}${date ? ` · ${esc(date)}` : ''} · ${rows.length} items</p>
<p class="note">Item # is the Ace Hardware item number; Store # is the number on the shop's quote (${esc(QUOTE.ref)}, ${esc(QUOTE.date)}). "Unknown" means no matching item was found on acehardware.com. Under each price is where it comes from: the shop's quote, its price sign, or acehardware.com ("Ace web", U.S. prices; "closest" when the Ace item is only similar). Items with no price show —. Tap an item name to open its Ace page.</p>
<table>
<colgroup><col style="width:4%"><col style="width:41%"><col style="width:12%"><col style="width:13%"><col style="width:12%"><col style="width:8%"><col style="width:10%"></colgroup>
<thead><tr><th class="n">#</th><th>Item</th><th>Item #</th><th>Mfr #</th><th class="n">Qty</th><th class="n">Each</th><th class="n">Total</th></tr></thead>
<tbody>${body}</tbody>
<tfoot><tr><td></td><td colspan="5">Total of ${priced.length} priced items, before ${QUOTE.tax}% tax${rows.length > priced.length ? ` (${plural(rows.length - priced.length, 'item has', 'items have')} no price)` : ''}${unknown ? `. ${plural(unknown, 'item has', 'items have')} no known Ace item #.` : ''}</td><td class="n">${money(sum)}</td></tr></tfoot>
</table>
</body></html>
`;
}

export { PHASES };
