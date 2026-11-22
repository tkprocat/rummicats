// Pinned paws: when the table and your paws don't both fit on screen, the turn buttons, sort bar and rack stay at
// the bottom while you scroll the table, so you can compare your cats with the sets on it. On by default,
// remembered in this browser. The layout lives in style.css (the "pinned" class on <html>).
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
