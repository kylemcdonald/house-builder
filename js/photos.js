// Photos page: a picture of every item on the house's and the toilet
// house's bills of materials, with the quantity each design needs.
import { PHOTOS } from './photo-data.js';
import { money, num } from './format.js';
import { TOOL_LB } from './tools.js';

const GROUPS = [
  ['Lumber', /^L\d/],
  ['Plywood', /^ply/],
  ['Roofing & siding', /^(metal|pvc)\d|^ridge|^(sealant|foam)$/],
  ['Windows & screens', /^louvre|^(screen\d*|staples|cornerBrace|screenHinge)$/],
  ['Gutters & water tank', /^(gutter\w*|elbow3|tee3|ffCap|pipeStrap3|tank\d+|tankTap|screwSS)$/],
  ['Concrete & masonry', /^(cement|block|mesh|meshOffcut|tieWire|plastic|rebar)$/],
  ['Toilet & plumbing', /^(toilet|pipe\d|closetFlange|pvcBend|pvcTee|cleanout|pvcCoupling|checkValve|pvcCement|ventBoot|ventCap|pipeStrap|drum|bucket)$/],
  ['Tools', new RegExp(`^(${Object.keys(TOOL_LB).join('|')})$`)],
  ['Fasteners & hardware', /./],
];

// local (not purchased) materials, matched to a photo by name
const LOCAL = [[/^Sand/, 'sand'], [/^Gravel/, 'gravel'], [/^Fresh water/, 'water'], [/fill/, 'fill'], [/^Buckets/, 'bucket']];

const DESIGNS = [['house', 'House'], ['toilet', 'Toilet house']];

let showAll = false;

// boms: { house, toilet }
export function renderPhotos(host, { boms, prices }) {
  const items = new Map();
  const item = (id, key, name) => {
    if (!items.has(id)) items.set(id, { id, key, name, uses: [], total: 0, est: false, quote: false });
    return items.get(id);
  };
  for (const [d, label] of DESIGNS) {
    const b = boms[d];
    if (!b) continue;
    for (const l of b.lines) {
      const it = item(l.key, l.key === 'meshOffcut' ? 'mesh' : l.key, l.name);
      const same = it.uses.find((u) => u.label === label && u.unit === l.unit);
      if (same) { same.buy += l.buy; same.use += `; ${l.use}`; } else it.uses.push({ label, buy: l.buy, unit: l.unit, use: l.use });
      it.total += l.total;
      it.est ||= l.est;
      it.quote ||= l.quote;
    }
    for (const l of b.local.filter((x) => x.qty > 0)) {
      const key = LOCAL.find(([re]) => re.test(l.name))?.[1];
      const it = item('local:' + (key || l.name), key, l.name);
      it.local = true;
      it.uses.push({ label, buy: l.qty, unit: l.unit });
    }
  }
  const used = new Set(items.keys());
  if (showAll) {
    for (const key of Object.keys(PHOTOS)) {
      if (!prices[key] || used.has(key)) continue;
      const it = item(key, key, prices[key].name);
      it.unused = true;
      it.est = !!prices[key].est;
      it.quote = !!prices[key].quote;
    }
  }

  const groups = new Map([...GROUPS.map(([g]) => [g, []]), ['Local materials (gathered on Polowat)', []]]);
  for (const it of items.values()) {
    const g = it.local ? 'Local materials (gathered on Polowat)' : GROUPS.find(([, re]) => re.test(it.id))[0];
    groups.get(g).push(it);
  }

  const nPurchased = [...items.values()].filter((i) => !i.local && !i.unused).length;
  let h = `<h2>Photos</h2>
  <p class="muted">A picture of each of the ${nPurchased} items you buy for the house and the toilet house, plus the local materials, so you can point at the right thing in the shop. Quantities and costs (before tax) follow the current designs. The photos come from manufacturers, shops and Wikimedia Commons and show the kind of item, not the exact product the Weno shop stocks; click a photo for its source.</p>
  <label class="chk photo-all"><input type="checkbox" id="photoAll"${showAll ? ' checked' : ''}> Also show catalog items the current designs don't use</label>`;
  for (const [g, list] of groups) {
    if (!list.length) continue;
    h += `<h3>${g}</h3><div class="photo-grid">`;
    for (const it of list) {
      const ph = PHOTOS[it.key];
      const img = ph?.file
        ? `<a class="ph" href="${ph.source}" target="_blank" rel="noopener" title="${esc(ph.caption)} — ${esc(ph.credit)}"><img src="${ph.file}" alt="${esc(ph.caption)}" loading="lazy"></a>`
        : `<div class="ph none">No photo</div>`;
      const qty = it.unused
        ? `<div class="pq muted">Not in the current designs</div>`
        : it.uses.map((u) => `<div class="pq" title="${esc(u.use || '')}"><span>${u.label}</span><b>${num(u.buy, u.buy % 1 ? 1 : 0)}${u.unit !== 'ea' ? ` ${u.buy === 1 ? u.unit.replace(/(x)es$|s$/, '$1') : u.unit}` : ''}</b></div>`).join('');
      h += `<figure class="photo${it.unused ? ' unused' : ''}">${img}<figcaption>
        <div class="pn">${it.name}${it.est ? '<span class="badge">est.</span>' : ''}${it.quote ? '<span class="badge quote">quote</span>' : ''}</div>
        ${qty}${it.total ? `<div class="pq"><span>Cost</span><b>${money(it.total)}</b></div>` : ''}
        ${ph?.file ? `<div class="pc">${esc(ph.credit)}</div>` : ''}
      </figcaption></figure>`;
    }
    h += `</div>`;
  }
  host.innerHTML = h;
  host.querySelector('#photoAll').addEventListener('change', (e) => {
    showAll = e.target.checked;
    renderPhotos(host, { boms, prices });
  });
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
