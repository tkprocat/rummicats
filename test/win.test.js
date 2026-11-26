const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Exercise the browser dialog with a minimal DOM; confetti is purely decorative.
function dialog(you, why = 'Their paws are empty.') {
  function element() {
    const classes = new Set(['hidden']);
    return {
      textContent: '', innerHTML: '', children: [],
      classList: {
        toggle(name, on) { if (on) classes.add(name); else classes.delete(name); },
        add(name) { classes.add(name); }, remove(name) { classes.delete(name); },
        contains(name) { return classes.has(name); },
      },
      querySelector(selector) { return this[selector] ||= element(); },
      appendChild(child) { this.children.push(child); },
      focus() {},
    };
  }
  const elements = {};
  const $ = (id) => elements[id] ||= element();
  const over = { winner: 'Milo', why, scores: [{ name: 'Luna', penalty: 16 }, { name: 'Milo', penalty: 0 }] };
  const source = fs.readFileSync(require.resolve('../public/js/win.js'), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace(/export /g, '')
    .split('function confetti(canvas)')[0];
  const context = vm.createContext({ $, S: { over, code: 'CATS', you, isHost: you === 0,
    players: [{ name: 'Milo' }, { name: 'Luna' }] }, confetti() {}, document: {
    createElement() { const li = element(); li.children = [element(), element()]; return li; },
  } });
  vm.runInContext(source + '\nrenderWin();', context);
  return elements;
}

for (const [viewer, you, title, why] of [
  ['winner', 0, 'You win! 🎉', 'Your paws are empty.'],
  ['other player', 1, 'Milo wins!', "Milo's paws are empty."],
  ['spectator', -1, 'Milo wins!', "Milo's paws are empty."],
]) {
  test(`winner dialog uses player-relative wording for the ${viewer}`, () => {
    const els = dialog(you);
    assert.equal(els.winTitle.textContent, title);
    assert.equal(els.winPop.querySelector('.why').textContent, why);
    const rows = els.winPop.querySelector('.scores').children;
    assert.deepEqual(rows.map((row) => [row.querySelector('.who > span').textContent, row.children[1].textContent]),
      [['Milo', '0 pts left'], ['Luna', '16 pts left']]);
    assert.equal(els.winAgain.classList.contains('hidden'), you !== 0);
    assert.equal(els.winPop.querySelector('.againNote').classList.contains('hidden'), you === 0);
  });
}

test('winner dialog preserves blocked-game and missing explanations', () => {
  for (const why of ['Nobody could play, lowest hand wins.', undefined]) {
    for (const you of [0, 1, -1]) {
      const els = dialog(you, why === undefined ? null : why);
      assert.equal(els.winPop.querySelector('.why').textContent, why || '');
    }
  }
});
