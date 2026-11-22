// Drag cats around in your paws to sort them. A tap without moving still counts as a tap (picks a cat up).
let drag = null; // { id, el, x0, y0, active, ghost, dx, dy, target }
let swallowClick = false;
let onDrop = () => {};
let onSelect = () => {};
let onSelectionEnd = () => {};

// A rack group consists of adjacent occupied slots on one tier; a board group is a set.
function selectionGroup(el, board) {
  if (board) return new Set(el.closest('.set').querySelectorAll('.tile'));
  const slot = el.closest('.slot');
  const tiles = [el];
  for (const direction of ['previousElementSibling', 'nextElementSibling']) {
    for (let neighbor = slot[direction]; neighbor; neighbor = neighbor[direction]) {
      const tile = neighbor.querySelector('.tile');
      if (!tile) break;
      tiles.push(tile);
    }
  }
  return new Set(tiles);
}

// True while a cat is being dragged; the page shouldn't be redrawn under it.
export const isDragging = () => !!(drag && (drag.active || drag.selecting));

// Call from a rack tile's pointerdown.
export function startHandDrag(id, el, e, canSelect) {
  if (e.button > 0) return;
  drag = { id, el, pointerId: e.pointerId, x0: e.clientX, y0: e.clientY, active: false };
  if (canSelect && e.pointerType === 'mouse') {
    const current = drag;
    current.timer = setTimeout(() => {
      if (drag !== current || current.active) return;
      current.selecting = true;
      current.visited = new Set();
      current.group = selectionGroup(current.el, false);
      current.select = !current.el.classList.contains('selected');
      selectTile(current.el);
    }, 300);
  }
}

// Board cats keep their original sweep-to-select gesture.
export function startBoardSelection(id, el, e, canSelect) {
  if (!canSelect || e.button !== 0 || e.pointerType !== 'mouse') return;
  startHandDrag(id, el, e, true);
  drag.board = true;
  clearTimeout(drag.timer);
}

// Only the group's frame starts a group drag, never a cat or insertion gap.
export function startBoardDrag(el, e, onGroupDrop, picking) {
  if (e.button !== 0 || drag || e.target.closest('.tile') || (picking && e.target.closest('.gap'))) return;
  drag = { el, boardGroup: el, onGroupDrop, pointerId: e.pointerId,
    x0: e.clientX, y0: e.clientY, active: false, groupDrag: true, target: null };
  el.setPointerCapture(e.pointerId);
  activateDrag(drag);
  positionGroupSlots(drag);
}

// One slot for each insertion point in the displayed order. Slots are overlays,
// so showing them does not make the table reflow during a drag.
function showGroupSlots(d) {
  const groups = [...document.querySelectorAll('#table .boardGroup')];
  const source = groups.indexOf(d.boardGroup);
  d.slots = [];
  for (let i = 0; i <= groups.length; i++) {
    if (i === source || i === source + 1) continue; // either side of the source is a no-op
    const slot = document.createElement('div');
    slot.className = 'groupDropSlot';
    slot.dataset.index = i;
    document.body.appendChild(slot);
    d.slots.push(slot);
  }
  d.groups = groups;
}

function positionGroupSlots(d) {
  for (const slot of d.slots) {
    const i = +slot.dataset.index;
    const previous = i ? d.groups[i - 1].getBoundingClientRect() : null;
    const next = i < d.groups.length ? d.groups[i].getBoundingClientRect() : null;
    const sameRow = previous && next && Math.min(previous.bottom, next.bottom) > Math.max(previous.top, next.top);
    const x = sameRow ? (previous.right + next.left) / 2 : next ? next.left - 6 : previous.right + 6;
    const top = sameRow ? Math.max(previous.top, next.top) : (next || previous).top;
    const bottom = sameRow ? Math.min(previous.bottom, next.bottom) : (next || previous).bottom;
    slot.style.left = `${x}px`;
    slot.style.top = `${top}px`;
    slot.style.height = `${bottom - top}px`;
  }
}

function selectTile(el) {
  if (!el || !drag.group.has(el) || drag.visited.has(el.dataset.id)) return;
  drag.visited.add(el.dataset.id);
  onSelect(+el.dataset.id, el, drag.select);
}

function activateDrag(d) {
  const source = d.groupDrag ? d.boardGroup : d.el;
  const r = source.getBoundingClientRect();
  d.dx = d.x0 - r.left;
  d.dy = d.y0 - r.top;
  d.ghost = source.cloneNode(true);
  d.ghost.classList.add(d.groupDrag ? 'groupGhost' : 'ghost');
  if (d.groupDrag) d.ghost.style.width = `${r.width}px`;
  d.ghost.style.transform = `translate(${r.left}px, ${r.top}px)`;
  document.body.appendChild(d.ghost);
  source.classList.add('placeholder');
  d.active = true;
  if (d.groupDrag) showGroupSlots(d);
}

function move(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  if (drag.selecting) {
    const under = document.elementFromPoint(e.clientX, e.clientY);
    selectTile(under && under.closest(drag.board ? '#table .tile' : '#hand .tile'));
    return;
  }
  if (!drag.active) {
    if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6) return;
    clearTimeout(drag.timer);
    if (drag.board) {
      drag.selecting = true;
      drag.visited = new Set();
      drag.group = selectionGroup(drag.el, true);
      drag.select = !drag.el.classList.contains('selected');
      selectTile(drag.el);
      const under = document.elementFromPoint(e.clientX, e.clientY);
      selectTile(under && under.closest('#table .tile'));
      return;
    }
    activateDrag(drag);
  }
  drag.ghost.style.transform = `translate(${e.clientX - drag.dx}px, ${e.clientY - drag.dy}px)`;

  if (drag.groupDrag) {
    positionGroupSlots(drag);
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const slot = under && under.closest('.groupDropSlot');
    drag.slots.forEach((s) => s.classList.toggle('over', s === slot));
    drag.target = slot ? +slot.dataset.index : null;
    return;
  }

  // Light up the rack slot under the pointer.
  const under = document.elementFromPoint(e.clientX, e.clientY);
  const slot = under && under.closest('#hand .slot');
  document.querySelectorAll('#hand .slot.over').forEach((s) => s.classList.remove('over'));
  if (slot) slot.classList.add('over');
  drag.target = slot ? +slot.dataset.i : null;
}

function end(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  const d = drag;
  drag = null;
  clearTimeout(d.timer);
  if (d.selecting) {
    swallowClick = true;
    setTimeout(() => (swallowClick = false));
    onSelectionEnd();
    return;
  }
  if (!d.active) return;
  d.ghost.remove();
  swallowClick = true;
  setTimeout(() => (swallowClick = false));
  if (d.groupDrag) {
    d.boardGroup.classList.remove('placeholder');
    d.slots.forEach((slot) => slot.remove());
    d.onGroupDrop(e.type === 'pointercancel' ? null : d.target);
  } else onDrop(d.id, d.target); // target is a rack slot index, or null when dropped off the rack
}

// dropHandler(id, slotOrNull) runs after every drag; it should put the cat there and redraw.
export function initHandDrag(dropHandler, selectHandler, selectionEndHandler) {
  onDrop = dropHandler;
  onSelect = selectHandler;
  onSelectionEnd = selectionEndHandler;
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', end);
  document.addEventListener('pointercancel', end);
  document.addEventListener('lostpointercapture', (e) => {
    if (drag && drag.groupDrag && e.pointerId === drag.pointerId) end({ pointerId: e.pointerId, type: 'pointercancel' });
  });
  window.addEventListener('blur', () => {
    if (drag && drag.groupDrag) end({ pointerId: drag.pointerId, type: 'pointercancel' });
  });
  // The click that follows a drop shouldn't count as a tap.
  document.addEventListener('click', (e) => { if (swallowClick) { e.stopPropagation(); e.preventDefault(); } }, true);
}
