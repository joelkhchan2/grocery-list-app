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
// Self-echo suppression keyed on id + updated_at (not bare id): our own writes register
// `${id}@${updated_at}` tokens, so the matching realtime echo is skipped but a PARTNER's later
// edit to the same row (different updated_at) still refreshes. Delete echoes (no reliable
// updated_at) simply fall through and trigger a harmless refetch.
export function selfEchoKey(row) { return row ? `${row.id}@${row.updated_at}` : ""; }
export function isSelfEcho(row, pending) { return !!row && pending.has(selfEchoKey(row)); }
// A realtime refresh re-renders the screen, so it should only wait when that would destroy
// in-progress input: a drag, or a text field with something typed in it. An EMPTY focused field
// (the add-bar stays focused after every add so the keyboard stays up) is not busy — treating it
// as busy starved refreshes for as long as the keyboard was open.
export function shouldDeferRefresh({ dragging = false, typing = false, hasText = false } = {}) {
  return !!dragging || (!!typing && !!hasText);
}
