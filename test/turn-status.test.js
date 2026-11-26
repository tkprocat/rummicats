const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Load the browser module with its real DOM helper, without changing the server's CommonJS setup.
const dataModule = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const helper = dataModule(fs.readFileSync(path.join(__dirname, '../public/js/dom.js'), 'utf8'));
const moduleUrl = dataModule(fs.readFileSync(path.join(__dirname, '../public/js/turnStatus.js'), 'utf8')
  .replace("'./dom.js'", JSON.stringify(helper)));

test('rack turn shadow follows local, opponent, spectator, rejoined and finished states without notifications', async (t) => {
  const { renderTurnStatus } = await import(moduleUrl);
  const elements = Object.fromEntries(['hand'].map((id) => [id, {
    classes: new Set(),
    classList: { toggle(name, on) { elements[id].classes[on ? 'add' : 'delete'](name); } },
  }]));
  const original = global.document;
  global.document = { getElementById: (id) => elements[id] };
  t.after(() => { global.document = original; });
  const state = { started: true, over: null, you: 0, turn: 0,
    players: [{ name: 'Alice' }, { name: '<Bob & cats>' }] };
  const expect = (mine) => {
    assert.equal(elements.hand.classes.has('myTurn'), mine);
  };
  renderTurnStatus(null);
  expect(false);
  renderTurnStatus({ ...state, started: false });
  expect(false);
  renderTurnStatus(state);
  expect(true);
  renderTurnStatus({ ...state, turn: 1 });
  expect(false);
  renderTurnStatus({ ...state, you: -1 });
  expect(false);
  renderTurnStatus({ ...state, you: -1, turn: 1, players: [state.players[0], { name: 'Bot', bot: true }] });
  expect(false);
  renderTurnStatus(state); // a fresh server snapshot on rejoin restores the local cue
  expect(true);
  renderTurnStatus({ ...state, over: { winner: 'Alice' } });
  expect(false);
  renderTurnStatus({ ...state, started: false });
  expect(false);
});
