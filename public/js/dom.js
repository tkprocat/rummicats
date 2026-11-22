// Small browser helpers shared by the other modules.

export const $ = (id) => document.getElementById(id);

// Settings remembered in this browser, under "rummicats:<key>". Storage can be missing or throw
// (private windows, blocked site data), and the game works fine without it.
export const store = {
  get(key) {
    try { return localStorage.getItem('rummicats:' + key); } catch (e) { return null; }
  },
  set(key, value) {
    try { localStorage.setItem('rummicats:' + key, value); } catch (e) {}
  },
};

// A short message under the turn buttons that clears itself after a few seconds.
let flashTimer = null;
export function flash(msg) {
  $('gameErr').textContent = msg;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => ($('gameErr').textContent = ''), 4000);
}

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
