// The bot's strategy (bot.js). Run with: node --test
const test = require('node:test');
const assert = require('node:assert');
const { chooseMove, bestSets } = require('../bot.js');
const { actions, rooms } = require('../server.js');
const Rules = require('../public/rules.js');

// Tile ids by name: 'pinky5', 'pinky5b' (the second copy), 'wild', 'wildb'.
function id(name) {
  if (name.startsWith('wild')) return name.endsWith('b') ? 105 : 104;
  const [, color, rank, b] = name.match(/^([a-z]+?)(\d+)(b?)$/);
  return (b ? 52 : 0) + Rules.COLORS.indexOf(color) * 13 + Number(rank) - 1;
}
const ids = (s) => s.split(' ').map(id);
const names = (set) => set.map((t) => (Rules.TILES[t].joker ? 'wild' : Rules.TILES[t].color + Rules.TILES[t].rank)).join(' ');

test('first meld: needs 30 points from its own cats', () => {
  assert.strictEqual(chooseMove([], ids('ginger1 ginger2 ginger3 smoky9 pinky12'), false), null, '6 points is not enough');
  const move = chooseMove([], ids('pinky10 pinky11 pinky12 smoky2 midnight7'), false);
  assert.deepStrictEqual(move.map(names), ['pinky10 pinky11 pinky12']);
});

test('finds several sets at once, and the same set twice from duplicate cats', () => {
  const sets = bestSets(ids('ginger5 ginger6 ginger7 ginger5b ginger6b ginger7b smoky9 midnight9 pinky9'));
  assert.strictEqual(sets.flat().length, 9);
});

test('after melding: lays off onto table sets and splits a long run for a duplicate', () => {
  const table = [ids('smoky3 smoky4 smoky5 smoky6 smoky7'), ids('ginger8 midnight8 pinky8')];
  const move = chooseMove(table, ids('smoky5b smoky8 smoky8b midnight1'), true);
  assert.ok(Rules.checkTurn(table, move, ids('smoky5b smoky8 smoky8b midnight1'), true).ok);
  // smoky8 on the end of the run, smoky8b as the 4th cat of the 8s, smoky5b splits the run
  assert.strictEqual(move.flat().length, table.flat().length + 3);
});

test('frees a wild cat from the table and plays it the same turn', () => {
  const table = [ids('pinky5 wild pinky7')];
  const hand = ids('pinky6 midnight9 smoky9');
  const move = chooseMove(table, hand, true);
  assert.ok(Rules.checkTurn(table, move, hand, true).ok);
  const sorted = (set) => names(set).split(' ').sort().join(' ');
  assert.deepStrictEqual(move.map(sorted).sort(), ['midnight9 smoky9 wild', 'pinky5 pinky6 pinky7']);
});

test('whole games between 4 bots: every move is legal and every game ends', async (t) => {
  const GAMES = 40;
  let emptied = 0, blocked = 0, turns = 0;
  for (let g = 0; g < GAMES; g++) {
    const { code } = actions.create({ name: 'A' });
    for (const n of ['B', 'C', 'D']) actions.join({ code, name: n });
    const room = rooms.get(code);
    actions.start({ timer: 0 }, room, room.players[0]);
    let n = 0;
    while (!room.over) {
      assert.ok(++n < 2000, 'game should end');
      const p = room.players[room.turn];
      const move = chooseMove(room.table, p.hand, p.melded);
      if (move) actions.commit({ table: move }, room, p); // throws if the move breaks a rule
      else actions.draw(null, room, p);
    }
    turns += n;
    if (room.over.why.startsWith('Their paws')) emptied++; else blocked++;
    rooms.delete(code);
  }
  t.diagnostic(`${GAMES} games: ${emptied} won by emptying paws, ${blocked} ended with the pile empty, ${Math.round(turns / GAMES)} turns on average`);
  assert.ok(emptied > 0, 'bots should be able to win outright');
});
