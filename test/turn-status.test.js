const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Load the browser module with its real DOM helper, without changing the server's CommonJS setup.
const dataModule = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const helper = dataModule(fs.readFileSync(path.join(__dirname, '../public/js/dom.js'), 'utf8'));
const moduleUrl = dataModule(fs.readFileSync(path.join(__dirname, '../public/js/turnStatus.js'), 'utf8')
  .replace("'./dom.js'", JSON.stringify(helper)));

test('turn feedback follows local, opponent, spectator, rejoined and finished states without notifications', async (t) => {
  const { renderTurnStatus } = await import(moduleUrl);
  const elements = Object.fromEntries(['turnLabel'].map((id) => [id, {
    textContent: '', title: '', classes: new Set(),
    classList: { toggle(name, on) { elements[id].classes[on ? 'add' : 'delete'](name); } },
  }]));
  const original = global.document;
  global.document = { getElementById: (id) => elements[id] };
  t.after(() => { global.document = original; });
  const state = { started: true, over: null, you: 0, turn: 0,
    players: [{ name: 'Alice' }, { name: '<Bob & cats>' }] };
  const expect = (text, mine) => {
    assert.equal(elements.turnLabel.textContent, text);
    assert.equal(elements.turnLabel.title, text);
    assert.equal(elements.turnLabel.classes.has('myTurn'), mine);
  };
  renderTurnStatus(null);
  expect('Waiting to start', false);
  renderTurnStatus({ ...state, started: false });
  expect('Waiting to start', false);
  renderTurnStatus(state);
  expect('Your turn', true);
  renderTurnStatus({ ...state, turn: 1 });
  expect("<Bob & cats>'s turn", false);
  renderTurnStatus({ ...state, you: -1 });
  expect("Alice's turn", false);
  renderTurnStatus({ ...state, you: -1, turn: 1, players: [state.players[0], { name: 'Bot', bot: true }] });
  expect("Bot's turn", false);
  renderTurnStatus(state); // a fresh server snapshot on rejoin restores the local cue
  expect('Your turn', true);
  renderTurnStatus({ ...state, over: { winner: 'Alice' } });
  expect('Game over', false);
  renderTurnStatus({ ...state, started: false });
  expect('Waiting to start', false);
});
