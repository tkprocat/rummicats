// Replays the first 22 turns of a real 3-player game, transcribed from a recording of the official
// Rummikub app (youtube.com/watch?v=sI9PV3G1__s, frames #0-#46), through the server's own commit action.
// Every turn there was legal, so every turn here must be accepted. Run with: node --test
const test = require('node:test');
const assert = require('node:assert');
const { actions, rooms } = require('../server.js');
const Rules = require('../public/rules.js');

// Notation from the video: K=black, R=red, B=blue, O=orange, J=joker; a trailing ' is the second copy.
const COLOR = { O: 'ginger', K: 'midnight', B: 'smoky', R: 'pinky' };
function id(tile) {
  const second = tile.endsWith("'");
  const s = second ? tile.slice(0, -1) : tile;
  if (s === 'J') return second ? 105 : 104;
  return (second ? 52 : 0) + Rules.COLORS.indexOf(COLOR[s[0]]) * 13 + Number(s.slice(1)) - 1;
}
const sets = (...list) => list.map((s) => s.split(' ').map(id));

// The table after each committed turn.
const TURNS = [
  ['#2 Fluffy first meld, 12s (36)', 'Fluffy', ['B12 O12 R12']],
  ['#3 Sandra first meld, 13s (39)', 'Sandra', ['B12 O12 R12', 'K13 B13 O13']],
  ['#5 Sandra blue run', 'Sandra', ['B12 O12 R12', 'K13 B13 O13', 'B9 B10 B11']],
  ['#11 Me first meld, 4s + red 7-9 (36)', 'Me', ['B12 O12 R12', 'K13 B13 O13', 'B9 B10 B11', 'K4 B4 R4', 'R7 R8 R9']],
  ['#12 Sandra lays off O4, R6, R10', 'Sandra', ['B12 O12 R12', 'K13 B13 O13', 'B9 B10 B11', 'K4 B4 R4 O4', 'R6 R7 R8 R9 R10']],
  ['#15 Fluffy takes R4 out of a group for a red 1-4 run', 'Fluffy', ['B12 O12 R12', 'K13 B13 O13', 'B9 B10 B11', 'K4 B4 O4', 'R6 R7 R8 R9 R10', 'R1 R2 R3 R4']],
  ['#17 Fluffy makes a group of four', 'Fluffy', ['B12 O12 R12', 'K13 R13 B13 O13', 'B9 B10 B11', 'K4 B4 O4', 'R6 R7 R8 R9 R10', 'R1 R2 R3 R4']],
  ['#18 Me plays 5s', 'Me', ['B12 O12 R12', 'K13 R13 B13 O13', 'B9 B10 B11', 'K4 B4 O4', 'R6 R7 R8 R9 R10', 'R1 R2 R3 R4', 'B5 O5 R5']],
  ['#18 Fluffy splits a run with the second R8', 'Fluffy', ['B12 O12 R12', 'K13 R13 B13 O13', 'B9 B10 B11', 'K4 B4 O4', 'R6 R7 R8', "R8' R9 R10", 'R1 R2 R3 R4', 'B5 O5 R5']],
  ['#20 Fluffy adds the second B12', 'Fluffy', ['B12 O12 R12', 'K13 R13 B13 O13', "B9 B10 B11 B12'", 'K4 B4 O4', 'R6 R7 R8', "R8' R9 R10", 'R1 R2 R3 R4', 'B5 O5 R5']],
  ['#21 Me takes B12 back off a run into a group', 'Me', ['B12 O12 R12', 'K13 R13 B13 O13', 'B9 B10 B11', "K12 R12' B12'", 'K4 B4 O4', 'R6 R7 R8', "R8' R9 R10", 'R1 R2 R3 R4', 'B5 O5 R5']],
  ['#24 Me adds B8', 'Me', ['B12 O12 R12', 'K13 R13 B13 O13', 'B8 B9 B10 B11', "K12 R12' B12'", 'K4 B4 O4', 'R6 R7 R8', "R8' R9 R10", 'R1 R2 R3 R4', 'B5 O5 R5']],
  ['#26 Sandra rejoins a split run and builds 8s from two runs', 'Sandra', ['B12 O12 R12', 'K13 R13 B13 O13', 'B9 B10 B11', "K12 R12' B12'", 'K4 B4 O4', "R6 R7 R8' R9 R10", 'B8 K8 R8', 'R1 R2 R3 R4', 'B5 O5 R5']],
  ['#30 Fluffy plays 1s', 'Fluffy', ['B12 O12 R12', 'K13 R13 B13 O13', 'B9 B10 B11', "K12 R12' B12'", 'K4 B4 O4', "R6 R7 R8' R9 R10", 'B8 K8 R8', 'R1 R2 R3 R4', 'B5 O5 R5', 'K1 B1 O1']],
  ['#32 Sandra adds R11', 'Sandra', ['B12 O12 R12', 'K13 R13 B13 O13', 'B9 B10 B11', "K12 R12' B12'", 'K4 B4 O4', "R6 R7 R8' R9 R10 R11", 'B8 K8 R8', 'R1 R2 R3 R4', 'B5 O5 R5', 'K1 B1 O1']],
  ['#34 Fluffy extends a run downwards', 'Fluffy', ['B12 O12 R12', 'K13 R13 B13 O13', "B6 B7 B8' B9 B10 B11", "K12 R12' B12'", 'K4 B4 O4', "R6 R7 R8' R9 R10 R11", 'B8 K8 R8', 'R1 R2 R3 R4', 'B5 O5 R5', 'K1 B1 O1']],
  ['#36 Me splits a run and swaps a tile out of a group', 'Me', ["K12' O12 R12", 'K13 R13 B13 O13', "B6 B7 B8' B9 B10", "B10' B11 B12", "K12 R12' B12'", 'K4 B4 O4', "R6 R7 R8' R9 R10 R11", 'B8 K8 R8', 'R1 R2 R3 R4', 'B5 O5 R5', 'K1 B1 O1', 'K5 K6 K7']],
  ['#38 Sandra plays a run with a joker in the middle', 'Sandra', ["K12' O12 R12", 'K13 R13 B13 O13', "B6 B7 B8' B9 B10", "B10' B11 B12", "K12 R12' B12'", 'K4 B4 O4', "R6 R7 R8' R9 R10 R11", 'B8 K8 R8', 'R1 R2 R3 R4', 'B5 O5 R5', 'K1 B1 O1', 'K5 K6 K7', "K11 J K13'"]],
  ['#39 Fluffy extends the joker run', 'Fluffy', ["K12' O12 R12", 'K13 R13 B13 O13', "B6 B7 B8' B9 B10", "B10' B11 B12", "K12 R12' B12'", 'K4 B4 O4', "R6 R7 R8' R9 R10 R11", 'B8 K8 R8', 'R1 R2 R3 R4', 'B5 O5 R5', 'K1 B1 O1', 'K5 K6 K7', "K10 K11 J K13'"]],
  ['#39 Me takes K13 off the joker run (joker moves to the end)', 'Me', ["K12' O12 R12", 'K13 R13 B13 O13', "B6 B7 B8' B9 B10", "B10' B11 B12", "K12 R12' B12'", 'K4 B4 O4', "R6 R7 R8' R9 R10 R11", 'B8 K8 R8', 'R1 R2 R3 R4', 'B5 O5 R5', 'K1 B1 O1', 'K5 K6 K7', 'K10 K11 J', "B13' R13' K13'"]],
  ['#43 Fluffy takes R11 off a run for a new group', 'Fluffy', ["K12' O12 R12", 'K13 R13 B13 O13', "B6 B7 B8' B9 B10", "B10' B11 B12", "K12 R12' B12'", 'K4 B4 O4', "R6 R7 R8' R9 R10", 'B8 K8 R8', 'R1 R2 R3 R4', 'B5 O5 R5', 'K1 B1 O1', 'K5 K6 K7', 'K10 K11 J', "B13' R13' K13'", "R11 O11 B11'"]],
  ['#46 Me frees the joker with a table tile and reuses it in the same turn', 'Me', ["K12' O12 R12", 'K13 R13 B13 O13', "B7 B8' B9 B10", "B10' B11 B12", "K12 R12' B12'", 'K4 B4 O4', "R7 R8' R9", 'B8 K8 R8', 'R1 R2 R3 R4', 'B5 O5 R5', 'K1 B1 O1', 'K5 K6 K7', 'R10 K10 O10', "B13' R13' K13'", "R11 O11 K11 B11'", "B2 R2' J", 'B6 O6 R6']],
].map(([label, who, table]) => ({ label, who, table: sets(...table) }));

function newGame(names) {
  const { code } = actions.create({ name: names[0] });
  for (const name of names.slice(1)) actions.join({ code, name });
  const room = rooms.get(code);
  actions.start({ timer: 0 }, room, room.players[0]);
  return room;
}

// Make it this player's turn and hand them the cats they put down (from the pile or another hand).
function play(room, who, table) {
  const player = room.players.find((p) => p.name === who);
  const onTable = new Set(room.table.flat());
  for (const t of table.flat()) {
    if (onTable.has(t) || player.hand.includes(t)) continue;
    const from = [room.pool, ...room.players.map((p) => p.hand)].find((h) => h.includes(t));
    from.splice(from.indexOf(t), 1);
    player.hand.push(t);
  }
  room.turn = room.players.indexOf(player); // the recording sometimes skips past a turn between frames
  actions.commit({ table }, room, player);
}

test('a recorded real game replays turn by turn', async (t) => {
  const room = newGame(['Sandra', 'Fluffy', 'Me']);
  assert.strictEqual(room.pool.length, 64, '3 players x 14 cats leaves 64 to draw');
  for (const turn of TURNS) {
    await t.test(turn.label, () => {
      play(room, turn.who, turn.table);
      assert.deepStrictEqual(room.table, turn.table);
    });
  }
  assert.ok(room.players.every((p) => p.melded));
});

test('moves the real game would not allow are rejected', async (t) => {
  await t.test('first meld under 30 points', () => {
    const room = newGame(['A', 'B']);
    assert.throws(() => play(room, 'A', sets('K1 K2 K3')), /First meld needs 30 points/);
  });
  await t.test('first meld that borrows a table cat', () => {
    const room = newGame(['A', 'B']);
    play(room, 'A', sets('B12 O12 R12'));
    // 33 points of B's own, but also adding to A's set, which needs a meld first.
    assert.throws(() => play(room, 'B', sets("B12 O12 R12 K12'", 'K10 K11 K12')), /first meld must use only your own cats/);
  });
  await t.test('taking a table cat back into your hand', () => {
    const room = newGame(['A', 'B']);
    play(room, 'A', sets('B12 O12 R12 K12'));
    const player = room.players[0];
    player.hand.push(id('K13'), id('B13'), id('O13'));
    room.turn = 0;
    assert.throws(() => actions.commit({ table: sets('B12 O12 R12', 'K13 B13 O13') }, room, player), /cannot go back to your hand/);
  });
});
