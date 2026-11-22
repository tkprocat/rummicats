// One cat tile, as drawn on the table and in the paws.
import { catSvg } from './art.js';
import { selected } from './turn.js';

const { TILES, COLOR_NAMES } = window.Rules;

// opts.placed / opts.moved: what this turn has done to it so far (see changes.js).
export function tileEl(id, opts = {}) {
  const t = TILES[id];
  const el = document.createElement('div');
  el.className = `tile c-${t.color}`;
  el.dataset.id = id;
  el.title = (t.joker ? 'Wild cat (joker)' : `${COLOR_NAMES[t.color]} ${t.rank}`) +
    (opts.placed ? ' · placed this turn' : opts.moved ? ' · moved this turn' : '');
  el.innerHTML = `${catSvg()}<span class="rank">${t.joker ? '★' : t.rank}</span>`;
  if (selected.includes(id)) el.classList.add('selected');
  if (opts.placed) el.classList.add('placed');
  if (opts.moved) el.classList.add('moved');
  return el;
}
