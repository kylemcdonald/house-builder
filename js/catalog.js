// Store catalog. Prices come from the supply shop in Weno, Chuuk: the
// written quote (`quote: true`, estimate #785745/4 of 14 Oct 2026, valid for
// 7 days, plus 6% sales tax; `store` is the shop's item # on it) where it has
// the item, otherwise the shop's price sign (IMG_1817). Items marked `est: true` are on neither and use an
// estimated price that should be checked in the store.

export const QUOTE = { ref: 'Estimate #785745/4', date: '14 Oct 2026', tax: 6 };

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
  ply14: { name: 'Plywood 1/4" furniture grade', t: 0.25, lb: 22 },
  ply38: { name: 'Plywood 3/8"', t: 0.375, lb: 33 },
  ply12: { name: 'Plywood 1/2" furniture grade', t: 0.5, lb: 44 },
  ply18p: { name: 'Plywood 1/8" paneling', t: 0.125, lb: 12 },
  ply12x: { name: 'Plywood 1/2" ACX regular grade', t: 0.5, lb: 48 },
  ply34x: { name: 'Plywood 3/4" exterior', t: 0.75, lb: 70 },
};

export const DEFAULT_PRICES = {
  // lumber (16 ft unless noted)
  L1x2: { name: '1x2x16', price: 12.5 },
  L1x3: { name: '1x3x16', price: 15.5 },
  L1x4: { name: '1x4x16 treated', price: 20.99, quote: true, store: '1416PT' },
  L1x6: { name: '1x6x16 treated', price: 25.99, quote: true, store: '1616PT' },
  L1x8: { name: '1x8x18', price: 33.5 },
  L2x2: { name: '2x2x16', price: 15.5 },
  L2x3: { name: '2x3x16', price: 24.0 },
  L2x4: { name: '2x4x16 treated', price: 23.99, quote: true, store: '2416PT' },
  L2x6: { name: '2x6x16 treated', price: 36.99, quote: true, store: '2616PT' },
  // plywood 4x8
  ply18: { name: 'Plywood 1/8"', price: 24.95 },
  ply14: { name: 'Plywood 1/4" furniture grade', price: 19.99, quote: true, store: '58000783' },
  ply38: { name: 'Plywood 3/8"', price: 27.0 },
  ply12: { name: 'Plywood 1/2" furniture grade', price: 34.99, quote: true, store: '58000785' },
  ply18p: { name: 'Plywood 1/8" paneling', price: 24.95 },
  ply12x: { name: 'Plywood 1/2" ACX regular grade', price: 69.99, quote: true, store: '58002675' },
  ply34x: { name: 'Plywood 3/4" exterior', price: 135.0 },
  // corrugated sheets
  metal8: { name: 'Tin roof 8\' × 26 ga galv.', price: 29.99, quote: true, store: '58003374' },
  metal10: { name: 'Tin roof 10\' × 26 ga galv.', price: 36.99, quote: true, store: '58003375' },
  metal12: { name: 'Tin roof 12\' × 26 ga galv.', price: 39.99, quote: true, store: '58003376' },
  pvc10: { name: 'PVC tinroof 10 ft', price: 29.95 },
  pvc12: { name: 'PVC tinroof 12 ft', price: 30.95 },
  // masonry
  cement: { name: 'Cement, Portland (40 kg bag)', price: 13.99, quote: true, store: '58001000' },
  block: { name: 'Cement hollow block', price: 5.5 },
  // louvre windows
  louvreFrame3: { name: 'Louver frame 3 ft', price: 19.95 },
  louvreFrame4: { name: 'Louver frame 4 ft, 13 blade', price: 39.99, quote: true, store: '50023216' },
  louvreGlass3: { name: 'Louver glass 36" obscure', price: 2.15, quote: true, store: '58006307' },
  louvreGlass4: { name: 'Louver glass 4 ft', price: 5.95 },
  // not on the sign: estimates
  nail16: { name: '16d 3-1/2" galv. common nails (lb)', price: 4.5, est: true },
  nail8: { name: '8d 2-1/2" galv. common nails (lb)', price: 4.5, est: true },
  nailTie: { name: '8d 1-1/2" galv. joist-hanger nails (lb)', price: 5.0, est: true },
  nailPanel: { name: '1-1/4" galv. panel nails (lb)', price: 5.0, est: true },
  roofFast: { name: 'Roofing fasteners w/ sealing washer (box of 100)', price: 15.0, est: true },
  bolt: { name: '1/2" x 8" galv. bolt, nut & 2 washers', price: 4.5, est: true },
  tie: { name: 'Hurricane tie H2.5A', price: 0.99, quote: true, store: '5607510' },
  hinge: { name: '4" galv. T-hinge', price: 6.0, est: true },
  hasp: { name: 'Galv. safety hasp, 4-1/2"', price: 8.59, est: true },
  padlock: { name: 'Padlock, keyed alike', price: 19.99, est: true },
  wedge: { name: '1/2" x 5" galv. wedge anchor', price: 2.5, est: true },
  conScrew: { name: '1/4" x 3-1/4" concrete screws (box of 100)', price: 35.0, est: true },
  mesh: { name: 'Galv. wire mesh #10, 6" × 6", 7\' × 100\' roll', price: 299.99, quote: true, store: '50015517' },
  tieWire: { name: 'Tie wire (roll)', price: 8.0, est: true },
  sealant: { name: 'Gutter sealant, white, 10.1 oz tube', price: 10.99, quote: true, store: '1595842' },
  plastic: { name: '6-mil plastic sheeting, 10\' x 25\' roll', price: 30.0, est: true },
  ridgeMetal: { name: 'Metal ridge cap 10 ft', price: 18.0, est: true },
  ridgePvc: { name: 'PVC ridge cap 10 ft', price: 22.0, est: true },
  postWrap: { name: 'Bitumen / plastic post-base wrap (per post)', price: 4.0, est: true },
  // toilet house
  rebar: { name: '#4 rebar 1/2" × 20\' (Gr 60)', price: 12.99, quote: true, store: '4/8REBAR' },
  foam: { name: 'Great Stuff Pro window & door foam, 20 oz', price: 22.99, quote: true, store: '1306711' },
  screen: { name: 'Fiberglass insect screen, 36" wide (per ft)', price: 1.5, est: true },
  staples: { name: 'Stainless staples 3/8" (box)', price: 8.0, est: true },
  doorPull: { name: '6" galv. door pull', price: 4.0, est: true },
  hookEye: { name: '3" galv. hook & eye', price: 2.5, est: true },
  barrelBolt: { name: '4" barrel bolt (inside latch)', price: 5.0, est: true },
  toilet: { name: 'Pour-flush toilet bowl with seat (ceramic, built-in trap)', price: 85.0, est: true },
  pipe2: { name: '2" PVC pipe, 10 ft', price: 15.0, est: true },
  pipe3: { name: '3" PVC pipe, 10 ft', price: 28.0, est: true },
  pipe4: { name: '4" PVC pipe, 10 ft', price: 42.0, est: true },
  closetFlange: { name: 'PVC closet flange', price: 12.0, est: true },
  pvcBend: { name: 'PVC bend (90° closet bend / 45°)', price: 14.0, est: true },
  pvcTee: { name: 'PVC sanitary tee with 2" vent outlet', price: 16.0, est: true },
  cleanout: { name: 'PVC wye with cleanout plug', price: 25.0, est: true },
  pvcCoupling: { name: 'PVC coupling', price: 6.0, est: true },
  checkValve: { name: 'PVC flap check valve (outfall end)', price: 55.0, est: true },
  pvcCement: { name: 'PVC primer & cement set', price: 18.0, est: true },
  ventBoot: { name: 'Roof pipe boot for 2" vent', price: 15.0, est: true },
  ventCap: { name: '2" vent cap with insect screen', price: 8.0, est: true },
  pipeStrap: { name: 'Galv. pipe strap 2"', price: 0.75, est: true },
  drum: { name: '55-gal plastic drum', price: 40.0, est: true },
  bucket: { name: '5-gal bucket with lid', price: 8.0, est: true },
  // house: insect screens
  screen48: { name: 'Fiberglass insect screen, 48" wide (per ft)', price: 2.0, est: true },
  screen60: { name: 'Fiberglass insect screen, 60" wide (per ft)', price: 2.5, est: true },
  cornerBrace: { name: '2" galv. flat corner brace with screws', price: 1.25, est: true },
  screenHinge: { name: '2" galv. butt hinge with screws', price: 2.5, est: true },
  // house: gutters, downpipes and rainwater tank
  gutter: { name: 'PVC gutter 5", 10 ft', price: 18.0, est: true },
  gutterJoin: { name: 'PVC gutter joiner', price: 5.0, est: true },
  gutterEnd: { name: 'PVC gutter stop end', price: 4.0, est: true },
  gutterOutlet: { name: 'PVC gutter drop outlet for 3" pipe', price: 9.0, est: true },
  gutterBracket: { name: 'PVC gutter fascia bracket', price: 2.0, est: true },
  screwSS: { name: '1-1/4" stainless wood screws (box of 100)', price: 10.0, est: true },
  elbow3: { name: '3" PVC 90° elbow', price: 7.0, est: true },
  tee3: { name: '3" PVC tee', price: 10.0, est: true },
  ffCap: { name: '3" PVC cleanout adapter & threaded plug', price: 8.0, est: true },
  pipeStrap3: { name: 'Galv. pipe strap 3"', price: 1.0, est: true },
  tank300: { name: 'Poly water tank, 300 gal', price: 380.0, est: true },
  tank500: { name: 'Poly water tank, 500 gal', price: 560.0, est: true },
  tank800: { name: 'Poly water tank, 800 gal', price: 850.0, est: true },
  tank1000: { name: 'Poly water tank, 1000 gal', price: 1050.0, est: true },
  tank1500: { name: 'Poly water tank, 1500 gal', price: 1500.0, est: true },
  tankTap: { name: '3/4" tank outlet fitting, 12" nipple & brass tap', price: 30.0, est: true },
  // tools (js/tools.js): estimates from acehardware.com (U.S.) prices, Oct 2026
  tape25: { name: '25\' tape measure', price: 14.99, est: true },
  tape100: { name: '100\' open-reel tape measure', price: 19.99, est: true },
  chalkLine: { name: 'Chalk line reel, 100\'', price: 11.99, est: true },
  chalk: { name: 'Marking chalk, blue, 8 oz', price: 5.59, est: true },
  pencils: { name: 'Carpenter pencils (6)', price: 10.74, est: true },
  marker: { name: 'Permanent markers (pack)', price: 4.59, est: true },
  speedSquare: { name: '7" speed square', price: 16.99, est: true },
  level4: { name: '48" box level', price: 36.99, est: true },
  levelTorpedo: { name: '9" torpedo level', price: 9.59, est: true },
  stringLine: { name: 'Braided mason\'s line, 250\'', price: 11.99, est: true },
  lineLevel: { name: 'Line level', price: 6.99, est: true },
  circSaw: { name: '7-1/4" corded circular saw', price: 169.0, est: true },
  sawBlade: { name: '7-1/4" 24-tooth framing saw blade', price: 12.99, est: true },
  fineBlade: { name: '7-1/4" fine-tooth (plywood) saw blade', price: 12.0, est: true },
  handsaw: { name: '20" handsaw', price: 29.99, est: true },
  snipsL: { name: 'Aviation snips, left cut (red)', price: 24.99, est: true },
  snipsR: { name: 'Aviation snips, right cut (green)', price: 24.99, est: true },
  hammer: { name: '20 oz framing hammer', price: 35.99, est: true },
  prybar: { name: 'Flat pry bar', price: 16.99, est: true },
  hammerDrill: { name: '1/2" corded hammer drill', price: 109.0, est: true },
  bit316: { name: '3/16" × 6" masonry drill bit', price: 9.99, est: true },
  bit12: { name: '1/2" × 6" masonry drill bit', price: 15.99, est: true },
  drillDriver: { name: '3/8" corded drill/driver', price: 59.0, est: true },
  nutDriver: { name: '5/16" magnetic hex nut driver bit', price: 4.99, est: true },
  wrench34: { name: '3/4" combination wrench', price: 12.99, est: true },
  caulkGun: { name: 'Caulk gun', price: 12.99, est: true },
  stepladder: { name: '6\' fiberglass stepladder', price: 139.99, est: true },
  extLadder: { name: '20\' extension ladder', price: 259.99, est: true },
  sawhorse: { name: 'Folding sawhorse', price: 25.0, est: true },
  generator: { name: 'Portable generator, about 3300 W', price: 849.0, est: true },
  extCord: { name: '50\' 12-gauge outdoor extension cord', price: 79.99, est: true },
  stapleGun: { name: 'Heavy-duty staple gun (T50 staples)', price: 23.99, est: true },
  hacksaw: { name: '12" hacksaw', price: 14.99, est: true },
  file: { name: 'Half-round file', price: 23.99, est: true },
  shovel: { name: 'Square-point shovel', price: 26.99, est: true },
  wheelbarrow: { name: 'Contractor wheelbarrow, 6 cu ft', price: 129.99, est: true },
  hoe: { name: 'Mortar hoe', price: 35.99, est: true },
  tamper: { name: 'Steel hand tamper', price: 41.99, est: true },
  float: { name: 'Wood hand float', price: 9.99, est: true },
  glasses: { name: 'Safety glasses', price: 8.75, est: true },
  earMuffs: { name: 'Ear muffs', price: 31.99, est: true },
  gloves: { name: 'Leather work gloves (pair)', price: 16.99, est: true },
  dustMask: { name: 'N95 dust masks (pack)', price: 21.99, est: true },
  rubberGloves: { name: 'Heavy rubber gloves (pair)', price: 6.0, est: true },
  firstAid: { name: 'First-aid kit', price: 31.99, est: true },
};

// Vertical poly rainwater tanks: diameter and height (in), empty weight (lb).
// Typical sizes; measure the one you buy and check it still fits.
export const TANKS = {
  300: { d: 38, h: 64, lb: 60 },
  500: { d: 48, h: 68, lb: 95 },
  800: { d: 60, h: 70, lb: 150 },
  1000: { d: 64, h: 76, lb: 190 },
  1500: { d: 87, h: 66, lb: 270 },
};
// Fiberglass screen comes in these roll widths (in)
export const SCREEN_ROLLS = [36, 48, 60];

// Shipping weights (lb) and sizes for stock items.
export const LUMBER_DENSITY = 38; // lb per cubic foot (mixed imported lumber)
export const TIN_LB = { metal: 1.7, pvc: 1.5 }; // lb per linear foot of 33" sheet
export const CEMENT_LB = 88; // 40 kg
export const BLOCK_LB = 35;
// Hollow concrete block, nominal 4/6/8" thick: 15-5/8" × 7-5/8" faces laid
// with 3/8" joints (a 16" × 8" module). lb per block by nominal thickness.
export const BLOCK = { len: 15.625, h: 7.625, joint: 0.375, lb: { 4: 26, 6: 35, 8: 40 } };
export const MORTAR_FT3_PER_BAG = 3.5; // 1:4 cement:sand mortar per 40 kg bag
export const PIPE_OD = { 2: 2.375, 3: 3.5, 4: 4.5 }; // PVC outside diameters, in
export const MESH = { w: 84, len: 1200, grid: 6, wire: 0.135, lb: 147 }; // 7' × 100' roll, #10 wire
export const BAG_YIELD_FT3 = 3.7; // ft³ of 1:2:3 concrete per 40 kg bag
