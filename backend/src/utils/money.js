/** Round to centavos, avoiding binary floating point drift (e.g. 0.1 + 0.2). */
function round2(n) {
  const v = Number(n) || 0;
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

function sum(values) {
  return round2(values.reduce((acc, v) => acc + (Number(v) || 0), 0));
}

/**
 * Split `total` into `parts` shares that add up exactly to `total`.
 * `weights` (optional) allows proportional splitting (e.g. by days stayed).
 * Any rounding remainder is assigned to the largest-weight shares first.
 */
function splitAmount(total, weights) {
  const cents = Math.round(round2(total) * 100);
  const w = weights.map((x) => Math.max(0, Number(x) || 0));
  const totalWeight = w.reduce((a, b) => a + b, 0);
  if (!w.length) return [];
  if (totalWeight === 0) return w.map(() => 0);

  const raw = w.map((x) => (cents * x) / totalWeight);
  const floored = raw.map(Math.floor);
  let remainder = cents - floored.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r), w: w[i] }))
    .sort((a, b) => b.frac - a.frac || b.w - a.w || a.i - b.i);
  for (let k = 0; remainder > 0 && k < order.length; k += 1, remainder -= 1) {
    floored[order[k].i] += 1;
  }
  return floored.map((c) => c / 100);
}

/** Peso amount for user-facing messages, e.g. ₱3,041.67 */
function formatPeso(n) {
  return `₱${round2(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

module.exports = { round2, sum, splitAmount, formatPeso };
