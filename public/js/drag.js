// Drag cats around in your paws to sort them. A tap without moving still counts as a tap (picks a cat up).
let drag = null; // { id, el, x0, y0, active, ghost, dx, dy, target }
let swallowClick = false;
let onDrop = () => {};

// True while a cat is being dragged; the page shouldn't be redrawn under it.
export const isDragging = () => !!(drag && drag.active);

// Call from a rack tile's pointerdown.
export function startHandDrag(id, el, e) {
  if (e.button > 0) return;
  drag = { id, el, x0: e.clientX, y0: e.clientY, active: false };
}

function move(e) {
  if (!drag) return;
  if (!drag.active) {
    if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6) return;
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

function end() {
  if (!drag) return;
  const d = drag;
  drag = null;
  if (!d.active) return;
  d.ghost.remove();
  swallowClick = true;
  setTimeout(() => (swallowClick = false));
  onDrop(d.id, d.target); // target is a rack slot index, or null when dropped off the rack
}

// dropHandler(id, slotOrNull) runs after every drag; it should put the cat there and redraw.
export function initHandDrag(dropHandler) {
  onDrop = dropHandler;
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', end);
  document.addEventListener('pointercancel', end);
  // The click that follows a drop shouldn't count as a tap.
  document.addEventListener('click', (e) => { if (swallowClick) { e.stopPropagation(); e.preventDefault(); } }, true);
}
