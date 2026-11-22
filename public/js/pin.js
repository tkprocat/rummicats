// Pinned paws: on a phone, the turn buttons, sort bar and rack stay at the bottom of the screen while you scroll
// the table, so you can see both while planning a move. On by default, remembered in this browser. The layout
// lives in style.css (the "pinned" class on <html>), and only applies on narrow screens.
import { $, store } from './dom.js';

export function initPin() {
  const set = (on) => {
    document.documentElement.classList.toggle('pinned', on);
    store.set('pin', on ? 'on' : 'off');
    $('pinBtn').textContent = on ? '📌 Pinned' : '📌 Pin';
    $('pinBtn').setAttribute('aria-pressed', String(on));
  };
  set(store.get('pin') !== 'off');
  $('pinBtn').onclick = () => set(!document.documentElement.classList.contains('pinned'));
}
