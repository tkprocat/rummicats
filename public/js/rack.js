// My rack: tiers of slots, like the real game, where gaps stay wherever the player leaves them.
// `rack` is slot by slot, row after row: a tile id, or null for a gap. Cats played this turn keep their slot
// (they're just not shown) so they go back to it if taken back. `shown` is always the set of ids on the rack now.
import { store } from './dom.js';

const { TILES, COLORS } = window.Rules;

export let rack = [];
export let cols = 10; // slots per rack row, fitted to the screen

// Forget cats that have left my hand for good (played on an earlier turn); their slot becomes a gap.
export function keepOnly(inHand) {
  rack = rack.map((id) => (id != null && inHand.has(id) ? id : null));
}

// Put a cat in rack slot t. If t is taken, cats slide toward the nearest gap in that row, like on a real rack.
export function dropInRack(id, t, shown) {
  const from = rack.indexOf(id);
  if (from === t) return;
  if (from >= 0) rack[from] = null;
  const empty = (i) => rack[i] == null || !shown.has(rack[i]);
  if (!empty(t)) {
    const row0 = t - (t % cols);
    let e = -1;
    for (let d = 1; d < cols && e < 0; d++) {
      if (t + d < row0 + cols && empty(t + d)) e = t + d;
      else if (t - d >= row0 && empty(t - d)) e = t - d;
    }
    if (e < 0) for (e = t; !empty(e); e++); // row is full: push into the next one
    const step = e > t ? -1 : 1;
    for (let k = e; k !== t; k += step) rack[k] = rack[k + step];
  }
  rack[t] = id;
}

// Change the slots per row without moving cats to another tier (a tier too long for the new width wraps).
export function setCols(n) {
  if (n === cols) return;
  const rows = [];
  for (let i = 0; i < rack.length; i += cols) {
    const row = rack.slice(i, i + cols);
    while (row.length && row[row.length - 1] == null) row.pop();
    for (let j = 0; j < Math.max(row.length, 1); j += n) rows.push(row.slice(j, j + n));
  }
  cols = n;
  rack = rows.flatMap((r) => [...r, ...Array(n - r.length).fill(null)]);
}

// Give every shown cat a slot (new cats go after the last one) and size the rack:
// at least two tiers, and always at least one gap to move cats into.
export function fitRack(shown) {
  for (const id of shown) {
    if (rack.includes(id)) continue;
    let i = rack.length;
    while (i > 0 && rack[i - 1] == null) i--;
    rack[i] = id;
  }
  let used = rack.length;
  while (used > 0 && rack[used - 1] == null) used--;
  let rows = Math.max(2, Math.ceil(used / cols));
  const free = (n) => Array.from({ length: n }, (_, i) => rack[i]).some((id) => id == null || !shown.has(id));
  if (!free(rows * cols)) rows++;
  rack = Array.from({ length: rows * cols }, (_, i) => rack[i] ?? null);
}

// Re-lay the rack in order, with a gap wherever split(prev, next) says a new bunch starts.
// A bunch that doesn't fit on what's left of a tier starts the next tier.
function sortRack(shown, key, split) {
  const ids = [...shown].sort((a, b) => key(TILES[a]) - key(TILES[b]));
  const bunches = [];
  ids.forEach((id, k) => {
    if (!k || split(TILES[ids[k - 1]], TILES[id])) bunches.push([]);
    bunches[bunches.length - 1].push(id);
  });
  rack = [];
  for (const b of bunches) {
    const left = cols - (rack.length % cols);
    if (rack.length % cols && b.length > left - 1 && b.length <= cols) while (rack.length % cols) rack.push(null);
    else if (rack.length % cols) rack.push(null);
    rack.push(...b);
  }
}

const colorIdx = (t) => (t.joker ? 99 : COLORS.indexOf(t.color));
// Each color together, one bunch per color.
export const sortByColor = (shown) => sortRack(shown, (t) => colorIdx(t) * 100 + t.rank, (a, b) => colorIdx(a) !== colorIdx(b));
// Each number together, with wild cats in their own bunch last.
export const sortByRank = (shown) => sortRack(shown, (t) => (t.joker ? 9999 : t.rank * 100 + colorIdx(t)), (a, b) => a.rank !== b.rank);

// Auto-sort, remembered in this browser: keep the rack in color or number order, so drawn cats land in place
// instead of at the end. Moving a cat to a slot yourself turns it off, since a sorted rack would undo the move.
export const SORTS = { color: sortByColor, rank: sortByRank };
export let autoSort = SORTS[store.get('autoSort')] ? store.get('autoSort') : 'off';
export function setAutoSort(mode) {
  autoSort = SORTS[mode] ? mode : 'off';
  store.set('autoSort', autoSort);
}
