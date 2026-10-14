// Pure variant-selection logic for the product page (no DOM, testable in Node).
// Option logic cascades: a value is selectable when some in-stock variant has it together with the picks
// of the axes listed before it, so earlier choices (e.g. colour) can always be changed.
export function variantState(p, picks) {
  const rows = p.variants.filter((v) => !v.archived);
  const axes = [...new Set(rows.flatMap((v) => Object.keys(v.attributes || {})))];
  const sellable = rows.filter((v) => v.available && v.stock > 0);
  const values = Object.fromEntries(axes.map((a) => [a, [...new Set(rows.map((v) => v.attributes?.[a]).filter(Boolean))]]));
  const enabled = (axis, value) => {
    const before = axes.slice(0, axes.indexOf(axis));
    return sellable.some((v) => v.attributes?.[axis] === value && before.every((o) => !picks[o] || v.attributes?.[o] === picks[o]));
  };
  const match = axes.length && axes.every((a) => picks[a]) ? rows.find((v) => axes.every((a) => v.attributes?.[a] === picks[a])) : rows.length === 1 && !axes.length ? rows[0] : null;
  return { axes, values, enabled, match };
}
export function initialPicks(p) {
  const { axes, values } = variantState(p, {});
  const picks = {};
  for (const a of axes) if (values[a].length === 1) picks[a] = values[a][0];
  // Preselect the cheapest in-stock variant so the page opens ready to buy.
  const best = p.variants.filter((v) => !v.archived && v.available && v.stock > 0).sort((a, b) => (a.sale_price ?? a.price) - (b.sale_price ?? b.price))[0];
  if (best) Object.assign(picks, best.attributes);
  return picks;
}
