// Drag cats around in your paws to sort them. A tap without moving still counts as a tap (picks a cat up).
let drag = null; // { id, el, x0, y0, active, ghost, dx, dy, target }
let swallowClick = false;
let onDrop = () => {};
let onSelect = () => {};
let onSelectionEnd = () => {};

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
      current.select = !current.el.classList.contains('selected');
      selectTile(current.el);
    }, 300);
  }
}

// Board tiles can be swept up immediately, but cannot be dragged to rearrange them.
export function startBoardSelection(id, el, e, canSelect) {
  if (!canSelect || e.button !== 0 || e.pointerType !== 'mouse') return;
  startHandDrag(id, el, e, true);
  drag.board = true;
  clearTimeout(drag.timer);
}

function selectTile(el) {
  if (!el || drag.visited.has(el.dataset.id)) return;
  drag.visited.add(el.dataset.id);
  onSelect(+el.dataset.id, el, drag.select);
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
      drag.select = !drag.el.classList.contains('selected');
      selectTile(drag.el);
      const under = document.elementFromPoint(e.clientX, e.clientY);
      selectTile(under && under.closest('#table .tile'));
      return;
    }
    const r = drag.el.getBoundingClientRect();
    drag.dx = drag.x0 - r.left;
    drag.dy = drag.y0 - r.top;
    drag.ghost = drag.el.cloneNode(true);
    drag.ghost.classList.add('ghost');
    document.body.appendChild(drag.ghost);
    drag.el.classList.add('placeholder');
    drag.active = true;
  }
  drag.ghost.style.transform = `translate(${e.clientX - drag.dx}px, ${e.clientY - drag.dy}px)`;

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
  onDrop(d.id, d.target); // target is a rack slot index, or null when dropped off the rack
}

// dropHandler(id, slotOrNull) runs after every drag; it should put the cat there and redraw.
export function initHandDrag(dropHandler, selectHandler, selectionEndHandler) {
  onDrop = dropHandler;
  onSelect = selectHandler;
  onSelectionEnd = selectionEndHandler;
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', end);
  document.addEventListener('pointercancel', end);
  // The click that follows a drop shouldn't count as a tap.
  document.addEventListener('click', (e) => { if (swallowClick) { e.stopPropagation(); e.preventDefault(); } }, true);
}
