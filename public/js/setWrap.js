// Long sets on a narrow table: wrap them onto rows instead of running off the screen. The rows are balanced
// (13 cats on room for 6 per row become 5 + 4 + 4, not 6 + 6 + 1) so no cat sits alone and looks like a set of
// its own, and they sit closer together than separate sets do (see .set in style.css).

// How many cats go on each row: as few rows as fit, with the cats shared out evenly between them,
// any one extra going to the top rows (13 on room for 6: [5, 4, 4]).
export function rowSizes(n, perRow) {
  if (perRow < 1 || n <= perRow) return [n];
  const rows = Math.ceil(n / perRow);
  return Array.from({ length: rows }, (_, r) => Math.floor(n / rows) + (r < n % rows ? 1 : 0));
}

// table: the #table element, already filled with .set elements (gap, cat, gap, cat, ..., gap).
// Measures the cats as drawn, so it follows whatever size the CSS gives them (phone or desktop).
export function wrapLongSets(table) {
  const tile = table.querySelector('.set .tile');
  const gap = table.querySelector('.set .gap');
  if (!tile || !gap) return;
  const px = (style, ...keys) => keys.reduce((sum, k) => sum + parseFloat(style[k]), 0);
  const room = table.clientWidth - px(getComputedStyle(table), 'paddingLeft', 'paddingRight');
  const step = tile.offsetWidth + gap.offsetWidth;

  for (const set of table.querySelectorAll('.set')) {
    const tiles = [...set.querySelectorAll(':scope > .tile')];
    const frame = px(getComputedStyle(set), 'paddingLeft', 'paddingRight', 'borderLeftWidth', 'borderRightWidth');
    const rows = rowSizes(tiles.length, Math.floor((room - frame - gap.offsetWidth - 1) / step));
    if (rows.length === 1) continue;
    // Each row is a gap, then cat and gap in turn, so every row starts and ends with a place to insert.
    // The page uses border-box, so the width includes the frame; 1px spare so rounding never wraps a row early.
    set.style.width = `${frame + gap.offsetWidth + rows[0] * step + 1}px`;
    for (let r = 0, b = 0; r < rows.length - 1; r++) {
      b += rows[r];
      // The gap before cat b ends the row above; a copy of it (inserting at the same spot) starts the next row.
      const before = tiles[b].previousElementSibling;
      const copy = before.cloneNode();
      copy.onclick = before.onclick;
      const br = document.createElement('div');
      br.className = 'rowBreak';
      set.insertBefore(br, tiles[b]);
      set.insertBefore(copy, tiles[b]);
    }
  }
}
