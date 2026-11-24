// Normal, dark, Halloween or Christmas look, remembered in this browser, plus the pokeable decorations.
import { $, store, reducedMotion } from './dom.js';
import { artReady, kittenSvg, pumpkinSvg, presentSvg, treeSvg, skySvg } from './art.js';
import { startSnow, stopSnow } from './snow.js';

const THEME_LOGOS = { normal: '🐾', dark: '🌙', halloween: '🎃', christmas: '🎄' };

// Fill the decoration spots in the page for a theme; CSS only shows them in the holiday themes.
function decorate(theme) {
  const fill = (sel, html) => document.querySelectorAll(sel).forEach((el) => (el.innerHTML = html));
  const xmas = theme === 'christmas';
  // The lobby cats sit on the card in every theme; their hats only show in the holiday themes.
  const lobbyCats = [[62, 'ginger', '#2d3a8c'], [80, 'midnight', '#6a3a9a'], [54, 'smoky', '#4b2a7a', true], [72, 'pinky', '#2d3a8c', true], [48, 'ginger', '#6a3a9a', true]];
  fill('.lobby-cats', lobbyCats.map(([h, fur, hat, flip]) => `<span class="${flip ? 'flip' : ''}">${kittenSvg(h, fur, xmas ? 'santa' : hat)}</span>`).join(''));
  if (xmas) {
    fill('.deco-table', `<div class="left">${presentSvg(40)}${presentSvg(26, '#2f8a4f', '#fff')}</div><div class="right">${presentSvg(28, '#6c87ad', '#fff')}${presentSvg(38, '#2f8a4f', '#d8322f')}</div>`);
    fill('.deco-rack', `${presentSvg(30, '#6c87ad', '#fff')}${kittenSvg(74, 'midnight', 'santa')}`);
    fill('.deco-card', `<div class="patch">${presentSvg(32)}${presentSvg(22, '#2f8a4f', '#fff')}</div>`);
    fill('.deco-side.left', `${kittenSvg(110, 'smoky', 'santa')}${treeSvg(130)}${presentSvg(40, '#2f8a4f', '#fff')}`);
    fill('.deco-side.right', `${presentSvg(44, '#6c87ad', '#fff')}${presentSvg(56)}${kittenSvg(110, 'pinky', 'santa')}`);
    fill('.deco-sky', '');
    startSnow();
    return;
  }
  stopSnow();
  fill('.deco-table', `<div class="left">${pumpkinSvg(46)}${pumpkinSvg(28, false)}</div><div class="right">${pumpkinSvg(30, false)}${pumpkinSvg(40)}</div>`);
  fill('.deco-rack', `${pumpkinSvg(30)}${kittenSvg(74, 'midnight', '#4b2a7a')}`);
  fill('.deco-card', `<div class="patch">${pumpkinSvg(34)}${pumpkinSvg(24, false)}</div>`);
  fill('.deco-side.left', `${kittenSvg(110, 'smoky', '#6a3a9a')}${pumpkinSvg(64)}${pumpkinSvg(40, false)}`);
  fill('.deco-side.right', `${pumpkinSvg(44, false)}${pumpkinSvg(70)}${kittenSvg(110, 'pinky', '#2d3a8c')}`);
  fill('.deco-sky', skySvg());
}

function setTheme(theme) {
  if (!THEME_LOGOS[theme]) theme = 'normal';
  if (theme === 'normal') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  $('logo').textContent = THEME_LOGOS[theme];
  $('themePick').value = theme;
  artReady.then(() => decorate(theme), () => {}); // a failed load is reported in the lobby instead
  store.set('theme', theme);
}

// Poke a kitten, pumpkin, present or tree: the kitten hops and says something, the others wobble.
const MEWS = ['mew!', 'purr…', 'meow ✨', 'mrrp?'];
const THEME_MEWS = { halloween: ['abracadabra!', 'hocus pocus!', 'boo!'], christmas: ['ho ho ho!', 'jingle!', 'merry meowmas!'] };

function pop(cls, x, y, text) {
  const el = document.createElement('span');
  el.className = cls;
  el.textContent = text;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  const a = Math.random() * Math.PI * 2;
  el.style.setProperty('--dx', `${Math.cos(a) * 34}px`);
  el.style.setProperty('--dy', `${Math.sin(a) * 26 - 14}px`);
  document.body.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}

function poke(e) {
  const deco = e.target.closest('.deco .kitten, .deco .pumpkin, .deco .present, .deco .tree, .lobby-cats .kitten');
  if (!deco) return;
  const theme = document.documentElement.dataset.theme; // undefined in normal mode, where hats are hidden
  const xmas = theme === 'christmas';
  deco.classList.remove('poke');
  void deco.getBoundingClientRect(); // restart the animation on quick repeat taps
  deco.classList.add('poke');
  clearTimeout(deco.pokeTimer);
  deco.pokeTimer = setTimeout(() => deco.classList.remove('poke'), 1000);
  const r = deco.getBoundingClientRect();
  const x = r.left + r.width / 2;
  const sparks = reducedMotion() ? 0 : 6;
  if (deco.classList.contains('kitten')) {
    const mews = [...MEWS, ...(THEME_MEWS[theme] || [])];
    pop('bubble', x, r.top + (theme === 'halloween' || xmas ? 0 : r.height * 0.25) - 4, mews[Math.floor(Math.random() * mews.length)]);
    for (let k = 0; k < sparks; k++) pop(xmas ? 'sparkle flake' : 'sparkle', x, r.top + r.height * 0.25, xmas ? '❄' : '✦');
  } else {
    for (let k = 0; k < sparks; k++) pop(xmas ? 'sparkle' : 'sparkle ember', x, r.top + r.height * 0.4, '✦');
  }
}

export function initTheme() {
  setTheme(store.get('theme') || 'normal');
  $('themePick').onchange = (e) => setTheme(e.target.value);
  document.addEventListener('click', poke);
}
