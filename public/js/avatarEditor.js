// Your cat avatar: remembered in this browser (localStorage, through store) and edited in a dialog.
// It's sent when you create or join a room, and again whenever you change it while in one.
import { $, store } from './dom.js';
import { session, api } from './api.js';
import { artReady, avatarSvg } from './art.js';

const A = window.Avatar;

// Editor sections, in order. Each key is a shape (Avatar.PARTS) or a color slot (Avatar.COLORS).
const SECTIONS = [
  ['Breed', null],
  ['Face', ['ears', 'eyes', 'mouth']],
  ['Coat', ['fur', 'pattern', 'pat1', 'pat2']],
  ['Details', ['eye', 'inner', 'extra', 'acc']],
];

let mine = null; // my saved avatar
let draft = null; // the one being edited
let onSaved = () => {};

// My avatar. The first time, a random cat is picked and remembered, so it stays the same from game to game.
export function myAvatar() {
  if (mine) return mine;
  try { mine = JSON.parse(store.get('avatar')); } catch (e) { mine = null; }
  mine = mine && typeof mine === 'object' ? A.clean(mine) : A.random();
  store.set('avatar', JSON.stringify(mine));
  return mine;
}

function chip(key, value, label, current, swatch) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = swatch ? 'swatch' : 'small chip';
  b.dataset.key = key;
  b.dataset.value = value;
  b.setAttribute('aria-pressed', value === current);
  if (swatch) {
    b.style.setProperty('--sw', swatch);
    b.title = label;
    b.setAttribute('aria-label', label);
  } else {
    b.textContent = label;
  }
  b.onclick = () => { draft = A.clean({ ...draft, [key]: value }); draw(); };
  return b;
}

function draw() {
  // Redrawing replaces the buttons, so put keyboard focus back on the same one afterwards.
  const focus = document.activeElement?.closest('#avatarPop button[data-key]')?.dataset;
  const was = focus && { key: focus.key, value: focus.value };

  $('avatarPreview').innerHTML = avatarSvg(draft, 128);
  const body = $('avatarRows');
  body.innerHTML = '';
  for (const [title, keys] of SECTIONS) {
    const h = document.createElement('h3');
    h.textContent = title;
    body.appendChild(h);
    if (!keys) { // breeds: one-click looks, drawn with your current face and extras
      const row = document.createElement('div');
      row.className = 'presets';
      A.PRESETS.forEach((p, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'preset';
        b.dataset.key = 'preset';
        b.dataset.value = i;
        b.innerHTML = `${avatarSvg(A.applyPreset(draft, p), 40)}<span></span>`;
        b.querySelector('span').textContent = p.name;
        b.onclick = () => { draft = A.applyPreset(draft, p); draw(); };
        row.appendChild(b);
      });
      body.appendChild(row);
      continue;
    }
    for (const key of keys) {
      const part = A.PARTS[key];
      const slot = A.COLORS[key];
      if (slot && !A.usesColor(draft, key)) continue;
      const row = document.createElement('div');
      row.className = 'avRow';
      const label = document.createElement('span');
      label.className = 'avLabel';
      label.textContent = (part || slot).label;
      const opts = document.createElement('div');
      opts.className = 'avOpts';
      opts.setAttribute('role', 'group');
      opts.setAttribute('aria-label', (part || slot).label);
      if (part) for (const [value, name] of Object.entries(part.options)) opts.appendChild(chip(key, value, name, draft[key]));
      else for (const [value, c] of Object.entries(slot.palette)) opts.appendChild(chip(key, value, c.label, draft[key], c.hex));
      row.append(label, opts);
      body.appendChild(row);
    }
  }
  if (was) body.querySelector(`button[data-key="${was.key}"][data-value="${was.value}"]`)?.focus();
}

export function openAvatarEditor() {
  artReady.then(() => {
    draft = { ...myAvatar() };
    draw();
    $('avatarPop').showModal();
  });
}

function save() {
  mine = A.clean(draft);
  store.set('avatar', JSON.stringify(mine));
  $('avatarPop').close();
  drawLobbyButton();
  if (session.code) api('avatar', { avatar: mine }).catch(() => {});
  onSaved();
}

function drawLobbyButton() {
  $('avatarBtn').innerHTML = `${avatarSvg(myAvatar(), 44)}<span class="pencil" aria-hidden="true">` +
    '<svg viewBox="0 0 12 12" width="11" height="11"><path d="M2 8.5 L8 2.5 L9.5 4 L3.5 10 L1.5 10.5 Z" fill="currentColor"/></svg></span>';
}

export function initAvatarEditor(saved) {
  onSaved = saved || onSaved;
  $('avatarBtn').onclick = openAvatarEditor;
  $('avatarSave').onclick = save;
  $('avatarCancel').onclick = () => $('avatarPop').close();
  $('avatarRandom').onclick = () => { draft = A.random(); draw(); };
  // A click on the dimmed backdrop (outside the card) closes without saving.
  $('avatarPop').onclick = (e) => { if (e.target === $('avatarPop')) $('avatarPop').close(); };
  artReady.then(drawLobbyButton, () => {});
}
