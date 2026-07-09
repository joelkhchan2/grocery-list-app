export function bySortOrder(rows) {
  return [...rows].sort((a, b) =>
    (a.sort_order - b.sort_order) || String(a.created_at).localeCompare(String(b.created_at)));
}
export function isNumericAmount(s) { return /^\d+$/.test(String(s ?? "").trim()); }
export function stepAmount(s, delta) {
  if (!isNumericAmount(s)) return s;
  return String(Math.max(1, parseInt(String(s).trim(), 10) + delta));
}
export function idsToClear(items) {
  return items.filter(i => i.checked && !i.watch).map(i => i.id);
}
export function watchNames(items) {
  return items.filter(i => i.watch).map(i => i.name);
}
export function isSelfEcho(row, pendingIds) { return pendingIds.has(row?.id); }
