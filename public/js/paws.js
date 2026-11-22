// My paws: the rack drawn from rack.js's slots, spotting cats I just drew, the sort buttons and auto-sort, and
// moving cats around on the rack (by dragging, or by tapping a slot with cats picked up).
import { $ } from './dom.js';
import { S, myTurn } from './state.js';
import { rack, cols, keepOnly, dropInRack, setCols, fitRack, sortByColor, sortByRank, SORTS, autoSort, setAutoSort } from './rack.js';
import { work, selected, shownSet, tableChanged, pickTile, moveTo, onTileClick } from './turn.js';
import { tileEl } from './tile.js';
import { startHandDrag, initHandDrag } from './drag.js';

let prevHand = null; // my hand in the last state, to spot cats I just drew
let lastDrawn = []; // cats I drew last time my hand changed; they glow on a sorted rack

// A new state from the server. Cats that showed up in my hand were drawn; any other change (a play, a new game)
// clears them. Cats that left my hand leave a gap on the rack; new ones get a slot when the rack is drawn.
export function syncPaws() {
  const before = prevHand;
  prevHand = S.hand;
  if (!before || before.join() !== S.hand.join()) {
    const old = new Set(before || []);
    lastDrawn = before && before.length ? S.hand.filter((id) => !old.has(id)) : [];
  }
  keepOnly(new Set(S.hand));
}

// Rack: tiers of slots, and gaps stay wherever you leave them
export function renderPaws() {
  // Put away with the paws tab: just the count on the tab. The rack isn't redrawn, since a hidden rack has no
  // width to fit its tiers to.
  const away = document.body.classList.contains('pawsHidden');
  $('pawsCount').textContent = S.hand.length;
  $('pawsCount').classList.toggle('hidden', !away);
  if (away) return;
  const mine = myTurn();
  // The drawn-cat glow goes out with the others once I start changing the table.
  const glowing = S.glow && !tableChanged();
  const hd = $('hand');
  const shown = shownSet();
  const slotW = parseFloat(getComputedStyle(hd).getPropertyValue('--tile-w')) + 4; // cat width + gap, from the CSS
  setCols(Math.max(6, Math.floor((hd.clientWidth - 16) / slotW)));
  $('autoSort').value = autoSort; // auto-sort turns itself off when you move a cat, so keep the dropdown in step
  if (SORTS[autoSort]) SORTS[autoSort](shown);
  fitRack(shown);
  hd.innerHTML = '';
  hd.classList.toggle('picking', mine && selected.length > 0);
  hd.classList.toggle('returning', mine && selected.some((id) => !work.hand.includes(id)));
  for (let r = 0; r < rack.length / cols; r++) {
    const tier = document.createElement('div');
    tier.className = 'tier';
    for (let i = r * cols; i < (r + 1) * cols; i++) {
      const slot = document.createElement('div');
      slot.className = 'slot';
      slot.dataset.i = i;
      const id = rack[i];
      if (id != null && shown.has(id)) {
        const t = tileEl(id);
        if (!S.hand.includes(id)) t.classList.add('borrowed'); // a wild cat swapped off the table this turn
        // On a sorted rack a drawn cat lands somewhere in the middle, so show where.
        if (glowing && SORTS[autoSort] && lastDrawn.includes(id)) t.classList.add('glow');
        t.onclick = (e) => onTileClick(id, e);
        t.onpointerdown = (e) => startHandDrag(id, t, e, myTurn());
        slot.appendChild(t);
      } else {
        slot.onclick = (e) => { e.stopPropagation(); if (myTurn()) moveTo({ where: 'hand', slot: i }); };
      }
      tier.appendChild(slot);
    }
    hd.appendChild(tier);
  }
}

// redraw: app.js's render, run after anything here changes the rack.
export function initPaws(redraw) {
  // The paws tab puts the sort bar and rack away and brings them back, to see more of the table. Not remembered,
  // so a reload never leaves you wondering where your cats went.
  $('pawsTab').onclick = () => {
    const away = document.body.classList.toggle('pawsHidden');
    $('pawsTab').setAttribute('aria-expanded', String(!away));
    $('pawsTab').title = away ? 'Show your paws' : 'Hide your paws';
    redraw();
  };
  $('hand').onclick = () => myTurn() && moveTo({ where: 'hand' });
  // One-off sorts for people who'd rather arrange their own cats afterwards. They turn auto-sort off,
  // so the next draw doesn't re-sort the rack the other way.
  $('sortColor').onclick = () => { setAutoSort('off'); sortByColor(shownSet()); redraw(); };
  $('sortRank').onclick = () => { setAutoSort('off'); sortByRank(shownSet()); redraw(); };
  $('autoSort').value = autoSort;
  $('autoSort').onchange = (e) => { setAutoSort(e.target.value); redraw(); };
  initHandDrag((id, slot) => {
    if (slot != null) {
      setAutoSort('off');
      dropInRack(id, slot, shownSet());
    }
    redraw();
  }, (id, el, select) => {
    if (!myTurn()) return;
    pickTile(id, select);
    el.classList.toggle('selected', select);
  }, () => {
    redraw();
  });
}
