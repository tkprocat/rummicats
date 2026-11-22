// Compact mode: smaller cats without the picture, so more of the table and your paws fit on a small screen.
// Remembered in this browser. The sizes live in style.css (the "compact" class on <html>).
import { $, store } from './dom.js';

export function initCompact(onChange) {
  const set = (on) => {
    document.documentElement.classList.toggle('compact', on);
    store.set('compact', on ? 'on' : 'off');
    $('compactBtn').textContent = on ? '🔎 Compact: on' : '🔎 Compact: off';
    $('compactBtn').setAttribute('aria-pressed', String(on));
  };
  set(store.get('compact') === 'on');
  $('compactBtn').onclick = () => {
    set(!document.documentElement.classList.contains('compact'));
    onChange(); // the rack fits a different number of cats per row
  };
}
