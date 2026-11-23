// My turn: a working copy of the table and my paws that I change freely, checked by the server only when I press
// Done. Also the cats I've picked up and the steps for Undo move. Everything that changes them goes through here.
// The moves are sent as a draft so others can watch (see pushDraft), but that's only a preview.
import { $, flash } from './dom.js';
import { api } from './api.js';
import { S, myTurn } from './state.js';
import { dropInRack, SORTS, autoSort, setAutoSort } from './rack.js';

const { TILES, checkSet } = window.Rules;

export let work = null; // { table, hand } my local edits during my turn
let workTurnId = null;
let undoStack = []; // earlier copies of work this turn, for Undo move
export let selected = []; // tile ids picked up, in the order they were tapped

// The screen redraws after every change; app.js hands over its render function at startup.
let redraw = () => {};
export const setRedraw = (fn) => { redraw = fn; };
export const redrawPage = () => redraw();

// A new state from the server: start the working copy over when a new turn begins (or it isn't mine).
export function syncWork() {
  if (!myTurn() || workTurnId !== S.turnId) resetWork();
}

export function resetWork() {
  work = { table: S.table.map((s) => [...s]), hand: [...S.hand] };
  workTurnId = S.turnId;
  undoStack = [];
  selected = [];
}

// Cats on my rack right now. Cats put on the table this turn are not shown,
// but keep their slot in case they come back.
export const shownSet = () => new Set(myTurn() ? work.hand : S.hand);

// Have I changed the table this turn? (The glows go out once I do, like they do for everyone watching.)
const sameGroups = (a, b) => a.length === b.length &&
  JSON.stringify(a.map((s) => JSON.stringify(s)).sort()) === JSON.stringify(b.map((s) => JSON.stringify(s)).sort());
export const tableChanged = () => myTurn() && !sameGroups(work.table, S.table);

export const canUndo = () => undoStack.length > 0;

// Pick a cat up or put it down without moving it (sweeping across cats with the mouse).
export function pickTile(id, on) {
  if (on && !selected.includes(id)) selected.push(id);
  if (!on) selected = selected.filter((x) => x !== id);
}

// Where a tile currently sits in my working copy.
function locate(id) {
  const h = work.hand.indexOf(id);
  if (h >= 0) return { where: 'hand', i: h };
  for (let s = 0; s < work.table.length; s++) {
    const i = work.table[s].indexOf(id);
    if (i >= 0) return { where: 'table', s, i };
  }
  return null;
}

function removeTile(id) {
  const loc = locate(id);
  if (loc.where === 'hand') work.hand.splice(loc.i, 1);
  else work.table[loc.s].splice(loc.i, 1);
  return loc;
}

// Put cats in an order that makes a valid set, if one exists: by number, with wild cats tried in every slot.
export function arrange(ids) {
  const real = ids.filter((id) => !TILES[id].joker).sort((a, b) => TILES[a].rank - TILES[b].rank);
  const wild = ids.filter((id) => TILES[id].joker);
  const tryAll = (seq, left) => {
    if (!left.length) return checkSet(seq).ok ? seq : null;
    for (let i = 0; i <= seq.length; i++) {
      const found = tryAll([...seq.slice(0, i), left[0], ...seq.slice(i)], left.slice(1));
      if (found) return found;
    }
    return null;
  };
  return tryAll(real, wild);
}

const byRank = (ids) => [...ids].sort((a, b) => (TILES[a].joker ? 99 : TILES[a].rank) - (TILES[b].joker ? 99 : TILES[b].rank));

const saveUndo = () => undoStack.push({ table: work.table.map((s) => [...s]), hand: [...work.hand] });

export function reorderGroups(from, to) {
  if (!myTurn() || from === to || from < 0 || to < 0 || from >= work.table.length || to >= work.table.length) return;
  saveUndo();
  const [group] = work.table.splice(from, 1);
  work.table.splice(to, 0, group);
  pushDraft();
  redraw();
}

// Move every picked-up cat to the target in one go (one step for Undo move).
export function moveTo(target) {
  if (!selected.length) return;
  const ids = selected;
  if (target.where === 'hand') {
    const back = ids.filter((id) => !work.hand.includes(id));
    if (!back.every((id) => S.hand.includes(id))) return flash("Cats from the table can't go back to your paws");
    if (!back.length && target.slot == null) return; // already in your paws
    if (back.length) {
      saveUndo();
      back.forEach((id) => removeTile(id));
      work.hand.push(...back);
      work.table = work.table.filter((x) => x.length);
      pushDraft();
    }
    // Without a slot, cats go back to the slot they came from (or a free one when the rack is drawn).
    // With auto-sort on, cats coming back from the table just take their sorted place.
    if (target.slot != null && !(back.length && SORTS[autoSort])) {
      if (!back.length) setAutoSort('off');
      ids.forEach((id, k) => dropInRack(id, target.slot + k, shownSet()));
    }
    selected = [];
    return redraw();
  }
  saveUndo();
  if (target.newSet) {
    ids.forEach((id) => removeTile(id));
    work.table.push(arrange(ids) || byRank(ids));
  } else {
    const set = work.table[target.s];
    // Remember the cat right after the gap, since taking cats out shifts positions.
    const anchor = set.slice(target.i).find((id) => !ids.includes(id));
    ids.forEach((id) => removeTile(id));
    set.splice(anchor == null ? set.length : set.indexOf(anchor), 0, ...byRank(ids));
    const fixed = !checkSet(set).ok && arrange(set);
    if (fixed) set.splice(0, set.length, ...fixed);
  }
  work.table = work.table.filter((x) => x.length);
  selected = [];
  pushDraft();
  redraw();
}

function undoMove() {
  const prev = undoStack.pop();
  if (!prev || !myTurn()) return;
  // The rack keeps the player's own arrangement; returning cats find their old slot.
  work.table = prev.table;
  work.hand = prev.hand;
  selected = [];
  pushDraft();
  redraw();
}

// Send my moves so the other players can watch (debounced).
let draftTimer = null;
function pushDraft() {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => api('draft', { table: work.table }).catch(() => {}), 150);
}

export function onTileClick(id, e) {
  e.stopPropagation();
  if (!myTurn()) return;
  if (TILES[id].joker && selected.length === 1 && selected[0] !== id && swapWild(selected[0], id)) return;
  selected = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
  redraw();
}

// With one cat picked up, tapping a wild cat on the table that it can stand in for swaps them:
// the cat takes the wild cat's place and the wild cat comes to your paws, picked up, to be played elsewhere this turn.
function swapWild(cat, wild) {
  const at = locate(wild);
  if (at.where !== 'table' || TILES[cat].joker || work.table[at.s].includes(cat)) return false;
  const set = work.table[at.s];
  if (!checkSet(set.map((x) => (x === wild ? cat : x))).ok) return false;
  if (!S.hasMelded && S.table.some((s) => s.includes(wild))) {
    flash("You can take a wild cat from the table only after your first meld. Make your 30 points first, then swap it on a later turn.");
    return true;
  }
  saveUndo();
  removeTile(cat);
  set[set.indexOf(wild)] = cat;
  work.table = work.table.filter((x) => x.length);
  work.hand.push(wild);
  selected = [wild];
  pushDraft();
  redraw();
  flash('Swapped! The wild cat is in your paws. Play it in a set before you press Done.');
  return true;
}

// The turn's buttons and keys: Done, Undo move (Ctrl+Z), Undo turn, Draw (or tap the pile), and Escape to put
// picked-up cats down.
export function initTurn() {
  $('doneBtn').onclick = () => api('commit', { table: work.table }).catch((e) => flash(e.message));
  $('undoMoveBtn').onclick = undoMove;
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.target.closest('input, select')) {
      e.preventDefault();
      undoMove();
    }
    if (e.key === 'Escape' && selected.length && !e.target.closest('input, select')) {
      selected = [];
      redraw();
    }
  });
  $('undoBtn').onclick = () => { resetWork(); pushDraft(); redraw(); };
  $('drawBtn').onclick = () => { const table = work.table; resetWork(); api('draw', { table }).catch((e) => flash(e.message)); };
  $('pile').onclick = () => myTurn() && $('drawBtn').click();
}
