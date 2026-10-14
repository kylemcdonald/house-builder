// Imperial formatting helpers. All internal dimensions are inches.

const FRACS = ['', '1/8', '1/4', '3/8', '1/2', '5/8', '3/4', '7/8'];

function inchStr(x) {
  let whole = Math.floor(x + 1e-6);
  let eighths = Math.round((x - whole) * 8);
  if (eighths === 8) { whole += 1; eighths = 0; }
  if (!eighths) return `${whole}`;
  return whole ? `${whole} ${FRACS[eighths]}` : FRACS[eighths];
}

// 87.5 -> 7'-3 1/2"
export function ftin(inches) {
  const neg = inches < 0;
  let x = Math.abs(inches);
  x = Math.round(x * 8) / 8;
  let ft = Math.floor(x / 12 + 1e-9);
  let rest = x - ft * 12;
  if (rest >= 12 - 1e-6) { ft += 1; rest = 0; }
  const s = ft ? `${ft}'-${inchStr(rest)}"` : `${inchStr(rest)}"`;
  return neg ? '-' + s : s;
}

// 5.5 -> 5 1/2"
export function inch(x) {
  return `${inchStr(Math.round(x * 8) / 8)}"`;
}

export function money(x) {
  return '$' + x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function num(x, d = 0) {
  return x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}
