// Writes the printed shopping lists for the house in its default design:
// shopping/house-phase1-shopping-list.{csv,html} for the house itself and
// shopping/house-phase2-shopping-list.{csv,html} for the gutters and water tank.
// Run with `npm install && npm run shopping`.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { design, DEFAULTS } from '../js/design.js';
import { computeBOM, phaseBOM, PHASES } from '../js/bom.js';
import { DEFAULT_PRICES } from '../js/catalog.js';
import { shopRows, shopCSV, shopHTML } from '../js/shopping.js';

const P = { ...DEFAULTS };
const full = computeBOM(design(P), P, DEFAULT_PRICES);
const base = computeBOM(design({ ...P, rainwater: 'no' }), P, DEFAULT_PRICES);
const bom = phaseBOM(full, base, P);

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'shopping');
mkdirSync(out, { recursive: true });
const date = new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
const link = (f) => (process.env.AGENT_FILES_URL ? `${process.env.AGENT_FILES_URL}/#${encodeURI(f)}` : f);
for (const ph of [1, 2]) {
  const rows = shopRows(bom, ph);
  const name = `house-phase${ph}-shopping-list`;
  writeFileSync(join(out, `${name}.csv`), shopCSV(rows));
  writeFileSync(join(out, `${name}.html`), shopHTML(rows, {
    title: `Shopping list: ${P.width}' × ${P.depth}' house, ${PHASES[ph].toLowerCase()}`,
    subtitle: 'For Ace Hardware, Weno, Chuuk',
    date,
  }));
  const priced = rows.filter((r) => r.total != null);
  console.log(`${PHASES[ph]}: ${rows.length} items, ${rows.filter((r) => !r.item).length} without an Ace item #, $${priced.reduce((t, r) => t + r.total, 0).toFixed(2)} for ${priced.length} priced items`);
  console.log(`  ${link(join(out, `${name}.html`))}`);
}
