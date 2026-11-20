// Artwork lives in public/art/*.svg so it can be edited in a design tool. Each file is loaded once and inlined
// (not used as an <img>), so the stylesheet can still recolor, animate and show/hide parts of it by class name.
// See public/art/README.md for the class names the game relies on.

const ART = {};

export const artReady = Promise.all(['cat', 'kitten', 'pumpkin', 'present', 'tree', 'sky', 'avatar'].map(async (name) => {
  const res = await fetch(new URL(`../art/${name}.svg`, import.meta.url));
  if (!res.ok) throw new Error(`Couldn't load the ${name} artwork`);
  let svg = await res.text();
  svg = svg.slice(svg.indexOf('<svg')); // drop an XML header or doctype a design tool may add
  // Size comes from the page, not the file, so drop any width/height a design tool saved on the root.
  svg = svg.replace(/^<svg[^>]*>/, (tag) => tag.replace(/\s(width|height)="[^"]*"/g, ''));
  if (name === 'cat' || name === 'avatar') {
    // Shared defs (the wild cat's rainbow, the avatar's head outline) go on the page once, instead of once per drawing.
    const defs = svg.match(/<defs>[\s\S]*?<\/defs>/);
    if (defs) {
      svg = svg.replace(defs[0], '');
      document.body.insertAdjacentHTML('beforeend', `<svg width="0" height="0" style="position:absolute" aria-hidden="true">${defs[0]}</svg>`);
    }
  }
  ART[name] = svg;
}));

// One piece of artwork as an inline <svg>, with a class, a size and CSS variables (e.g. { fur: '#fff' } sets --fur).
export function art(name, { cls = '', width, height, vars } = {}) {
  let attrs = `class="${name}${cls ? ' ' + cls : ''}" aria-hidden="true"`;
  if (width) attrs += ` width="${width}"`;
  if (height) attrs += ` height="${height}"`;
  if (vars) attrs += ` style="${Object.entries(vars).map(([k, v]) => `--${k}:${v}`).join(';')}"`;
  return ART[name].replace('<svg', `<svg ${attrs}`);
}

// The cat on a tile; its colors come from the tile's c-<color> class in style.css.
export const catSvg = () => art('cat');
export const pumpkinSvg = (size, face = true) => art('pumpkin', { cls: face ? '' : 'noface', width: size, height: size * 0.85 });
// fur is a cat color (ginger, midnight, smoky, pinky); hat is a wizard hat color or 'santa'.
export const kittenSvg = (height, fur, hat) => art('kitten', {
  cls: [fur === 'midnight' ? 'dark' : '', hat === 'santa' ? 'santa-hat' : ''].filter(Boolean).join(' '),
  height,
  vars: { fur: `var(--${fur})`, ...(hat === 'santa' ? {} : { hat }) },
});
export const presentSvg = (size, box = '#d8322f', ribbon = '#ffd84a') => art('present', { width: size, height: size, vars: { box, ribbon } });
export const treeSvg = (height) => art('tree', { width: height * 0.8, height });
export const skySvg = () => art('sky', { width: 180, height: 140 });

// A player's avatar (see public/avatar.js) at a size in pixels. The artwork has every option of every part;
// only the chosen group of each part (named <part>-<option>) is kept. Its colors come from CSS variables.
let avatarTemplate = null;
export function avatarSvg(av, size = 32) {
  // A joke photo the server gave this player (see KAT_JOKE in server.js). Only this fixed file, never a URL from anyone.
  if (av && av.photo === 'kat') return `<img class="avatar photo" src="art/kat.jpg" width="${size}" height="${size}" alt="" aria-hidden="true">`;
  av = window.Avatar.clean(av);
  if (!avatarTemplate) {
    const t = document.createElement('template');
    t.innerHTML = ART.avatar;
    avatarTemplate = t.content.querySelector('svg');
  }
  const svg = avatarTemplate.cloneNode(true);
  for (const el of svg.querySelectorAll('[class]')) {
    const m = el.getAttribute('class').match(/^(ears|eyes|mouth|pattern|extra)-(\w+)$/);
    // Only real options count, so a class like mouth-line (a color hook) is never mistaken for one.
    if (m && Object.hasOwn(window.Avatar.PARTS[m[1]].options, m[2]) && av[m[1]] !== m[2]) el.remove();
  }
  svg.setAttribute('class', `avatar pat-${av.pattern}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('style', Object.entries(window.Avatar.cssVars(av)).map(([k, v]) => `--${k}:${v}`).join(';'));
  return svg.outerHTML;
}
