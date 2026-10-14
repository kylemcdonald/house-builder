// Store catalog: prices from the supply-shop price sheet in Weno, Chuuk
// (IMG_1817). Items marked `est: true` are NOT on the shop sign and use an
// estimated price that should be checked in the store.

// Actual (dressed) lumber sizes in inches: t = thickness, w = width.
export const LUMBER = {
  '1x2': { t: 0.75, w: 1.5, stock: 192 },
  '1x3': { t: 0.75, w: 2.5, stock: 192 },
  '1x4': { t: 0.75, w: 3.5, stock: 192 },
  '1x6': { t: 0.75, w: 5.5, stock: 192 },
  '1x8': { t: 0.75, w: 7.25, stock: 216 },
  '2x2': { t: 1.5, w: 1.5, stock: 192 },
  '2x3': { t: 1.5, w: 2.5, stock: 192 },
  '2x4': { t: 1.5, w: 3.5, stock: 192 },
  '2x6': { t: 1.5, w: 5.5, stock: 192 },
};

// Plywood sheets are 4' x 8'. lb = approximate weight per sheet.
export const PLY = {
  ply18: { name: 'Plywood 1/8"', t: 0.125, lb: 12 },
  ply14: { name: 'Plywood 1/4"', t: 0.25, lb: 22 },
  ply38: { name: 'Plywood 3/8"', t: 0.375, lb: 33 },
  ply12: { name: 'Plywood 1/2"', t: 0.5, lb: 44 },
  ply18p: { name: 'Plywood 1/8" paneling', t: 0.125, lb: 12 },
  ply12x: { name: 'Plywood 1/2" exterior', t: 0.5, lb: 48 },
  ply34x: { name: 'Plywood 3/4" exterior', t: 0.75, lb: 70 },
};

export const DEFAULT_PRICES = {
  // lumber (16 ft unless noted)
  L1x2: { name: '1x2x16', price: 12.5 },
  L1x3: { name: '1x3x16', price: 15.5 },
  L1x4: { name: '1x4x16', price: 18.5 },
  L1x6: { name: '1x6x16', price: 24.5 },
  L1x8: { name: '1x8x18', price: 33.5 },
  L2x2: { name: '2x2x16', price: 15.5 },
  L2x3: { name: '2x3x16', price: 24.0 },
  L2x4: { name: '2x4x16', price: 26.5 },
  L2x6: { name: '2x6x16', price: 35.5 },
  // plywood 4x8
  ply18: { name: 'Plywood 1/8"', price: 24.95 },
  ply14: { name: 'Plywood 1/4"', price: 21.95 },
  ply38: { name: 'Plywood 3/8"', price: 27.0 },
  ply12: { name: 'Plywood 1/2"', price: 32.5 },
  ply18p: { name: 'Plywood 1/8" paneling', price: 24.95 },
  ply12x: { name: 'Plywood 1/2" exterior', price: 122.5 },
  ply34x: { name: 'Plywood 3/4" exterior', price: 135.0 },
  // corrugated sheets
  metal10: { name: 'Metal tinroof 10 ft', price: 28.0 },
  metal12: { name: 'Metal tinroof 12 ft', price: 29.5 },
  pvc10: { name: 'PVC tinroof 10 ft', price: 29.95 },
  pvc12: { name: 'PVC tinroof 12 ft', price: 30.95 },
  // masonry
  cement: { name: 'Cement 40 kg bag', price: 13.5, note: 'price was taped over on the sign — verify' },
  block: { name: 'Cement hollow block', price: 5.5 },
  // louvre windows
  louvreFrame3: { name: 'Louver frame 3 ft', price: 19.95 },
  louvreFrame4: { name: 'Louver frame 4 ft', price: 24.95 },
  louvreGlass3: { name: 'Louver glass 3 ft', price: 4.95 },
  louvreGlass4: { name: 'Louver glass 4 ft', price: 5.95 },
  // not on the sign: estimates
  nail16: { name: '16d galv. common nails (lb)', price: 4.5, est: true },
  nail8: { name: '8d galv. nails (lb)', price: 4.5, est: true },
  nailPanel: { name: '1-1/4" galv. panel nails (lb)', price: 5.0, est: true },
  roofFast: { name: 'Roofing fasteners w/ sealing washer (box of 100)', price: 15.0, est: true },
  bolt: { name: '1/2" x 8" galv. bolt, nut & 2 washers', price: 4.5, est: true },
  tie: { name: 'Hurricane tie / strap (galv.)', price: 2.0, est: true },
  hinge: { name: '4" galv. T-hinge', price: 6.0, est: true },
  hasp: { name: 'Hasp & padlock', price: 15.0, est: true },
  ridgeMetal: { name: 'Metal ridge cap 10 ft', price: 18.0, est: true },
  ridgePvc: { name: 'PVC ridge cap 10 ft', price: 22.0, est: true },
  postWrap: { name: 'Bitumen / plastic post-base wrap (per post)', price: 4.0, est: true },
};

// Shipping weights (lb) and sizes for stock items.
export const LUMBER_DENSITY = 38; // lb per cubic foot (mixed imported lumber)
export const TIN_LB = { metal: 1.7, pvc: 1.5 }; // lb per linear foot of 33" sheet
export const CEMENT_LB = 88; // 40 kg
export const BLOCK_LB = 35;
export const BAG_YIELD_FT3 = 3.7; // ft³ of 1:2:3 concrete per 40 kg bag
