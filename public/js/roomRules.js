// The room's rules, in a dropdown at the top: the settings the host picked, then the basics of the game.
// Built as text (no HTML from the server), and only redrawn when the settings change.
import { $ } from './dom.js';

export const duration = (s) => (s < 60 ? `${s} sec` : `${s / 60} min`);

let drawn = null;

export function renderRules(S) {
  const key = `${S.turnLimit}|${S.idleLimit}|${S.glow}|${S.started}`;
  if (key === drawn) return;
  drawn = key;

  const body = $('rulesBody');
  body.innerHTML = '';
  const heading = (text) => {
    const h = document.createElement('h3');
    h.textContent = text;
    body.appendChild(h);
  };
  const list = (items) => {
    const ul = document.createElement('ul');
    for (const [label, text] of items) {
      const li = document.createElement('li');
      if (label) {
        const b = document.createElement('b');
        b.textContent = label;
        li.append(b, ' ');
      }
      li.append(text);
      ul.appendChild(li);
    }
    body.appendChild(ul);
  };

  heading('Settings in this room');
  list([
    ['⏰ Turn timer:', S.turnLimit
      ? `${duration(S.turnLimit)} per turn. When it runs out, your moves are undone and you draw a cat (3 cats if you left the table invalid).`
      : 'off. Take as long as you like.'],
    ['💤 Idle timer:', S.idleLimit
      ? `${duration(S.idleLimit)}. Moving a cat restarts it. If you don't move a cat in time, your moves are undone and your turn is skipped (you don't draw).`
      : 'off.'],
    ['✨ Glow:', S.glow
      ? 'on. The cats the last player put on the table glow until the next player starts moving cats. The cat you just drew glows too.'
      : 'off.'],
  ]);
  if (!S.started) {
    const p = document.createElement('p');
    p.className = 'note';
    p.textContent = 'The host can still change these until the game starts.';
    body.appendChild(p);
  }

  heading('How to play');
  list([
    ['', 'Everyone starts with 14 cats. There are 106: two of each number 1 to 13 in each of the 4 fur colors, plus 2 wild cats ★ that stand in for any cat.'],
    ['Run:', '3 or more cats of the same color with numbers in order (13 does not wrap to 1).'],
    ['Group:', '3 or 4 cats with the same number, each a different color.'],
    ['First meld:', 'your first play must be worth 30 points or more (each cat is worth its number), using only cats from your paws.'],
    ['Each turn:', 'play at least one cat from your paws, or draw a cat to end your turn. After your first meld you can rearrange anything on the table, as long as every set is valid when you press Done.'],
    ['Following a turn:', 'an orange dot marks cats placed from the paws this turn, and a blue ring marks cats moved on the table.'],
    ['Winning:', 'first to empty their paws wins. When the pile runs out and everyone passes, the lowest hand wins.'],
  ]);
}
