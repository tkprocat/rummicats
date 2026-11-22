// Games in progress survive a restart: saved at the start of every turn, restored to that point. Run with: node --test
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { actions, rooms, findMember, restoreRooms, useStore } = require('../server.js');
const Persist = require('../persist.js');
const { TILES, COLORS } = require('../public/rules.js');

// A fresh save folder per test, and the server using it. All removed when the tests finish.
const dirs = [];
test.after(() => { for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true }); });
function freshStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rummicats-'));
  dirs.push(dir);
  const store = Persist.createStore(dir);
  useStore(store);
  return dir;
}
const stopTimers = (room) => { clearTimeout(room.clock); clearTimeout(room.idleClock); clearTimeout(room.botTimer); };
// A restart: everything in memory is gone, then the saved games come back.
function restart() {
  for (const room of rooms.values()) stopTimers(room);
  rooms.clear();
  return restoreRooms();
}
const current = (room) => room.players[room.turn];
const saved = (dir) => fs.readdirSync(dir).sort();

function newGame(settings = {}) {
  const { code, token } = actions.create({ name: 'A' });
  actions.join({ code, name: 'B' });
  const room = rooms.get(code);
  actions.start(settings, room, room.players[0]);
  return { room, code, token };
}

// A first meld the current player can always make, rigged into their hand.
function rigMeld(room) {
  const want = [11, 12, 13].map((rank) => TILES.find((t) => !t.joker && t.color === COLORS[0] && t.rank === rank).id);
  for (const p of room.players) p.hand = p.hand.filter((id) => !want.includes(id));
  room.pool = room.pool.filter((id) => !want.includes(id));
  current(room).hand.push(...want);
  return want;
}

test('a game comes back after a restart at the start of the turn it was on', () => {
  const dir = freshStore();
  const { room, code, token } = newGame({ timer: 120, glow: false });
  const [a, b] = room.players;
  actions.chat({ text: 'hello' }, room, a);
  const meld = rigMeld(room);
  const mover = current(room);
  actions.commit({ table: [meld] }, room, mover); // the turn ends: saved here
  assert.deepStrictEqual(saved(dir), [`${code}.json`]);
  const before = {
    turn: room.turn, turnId: room.turnId, table: room.table, pool: room.pool, lastPlayed: room.lastPlayed,
    hands: room.players.map((p) => p.hand), melded: room.players.map((p) => p.melded),
  };

  // Halfway through the next turn, the server restarts. The moves in progress aren't kept.
  actions.draft({ table: [[...meld].reverse()] }, room, current(room));
  assert.strictEqual(restart(), 1);

  const back = rooms.get(code);
  assert.notStrictEqual(back, room, 'a new room object, rebuilt from the file');
  assert.deepStrictEqual({
    turn: back.turn, turnId: back.turnId, table: back.table, pool: back.pool, lastPlayed: back.lastPlayed,
    hands: back.players.map((p) => p.hand), melded: back.players.map((p) => p.melded),
  }, before);
  assert.strictEqual(back.draft, null, 'the turn starts over');
  assert.deepStrictEqual([back.turnLimit, back.glow, back.started], [120, false, true], 'settings stay');
  assert.ok(back.turnEnds > Date.now() + 110e3, 'the current player gets a fresh turn timer');

  // Everyone gets back in with the token their browser kept, and the host is still the host.
  assert.strictEqual(findMember(code, token).member, back.players[0]);
  assert.strictEqual(back.host, back.players[0]);
  assert.deepStrictEqual(back.players.map((p) => p.name), [a.name, b.name]);
  assert.ok(back.players.every((p) => p.clients instanceof Set && p.clients.size === 0));
  // Chat from before the turn began is kept, linked back to who said it.
  assert.strictEqual(back.chat[0].text, 'hello');
  assert.strictEqual(back.chat[0].from, back.players[0]);

  // And the game carries on from there.
  actions.draw(null, back, current(back));
  assert.strictEqual(back.turnId, before.turnId + 1);
  stopTimers(back);
});

test('a game is saved as soon as it starts, and bots come back as bots', () => {
  const dir = freshStore();
  const { code, token } = actions.create({ name: 'A' });
  const room = rooms.get(code);
  actions.addBot(null, room, room.players[0]);
  assert.deepStrictEqual(saved(dir), [], 'a room in the lobby is not saved');
  actions.start({}, room, room.players[0]);
  assert.deepStrictEqual(saved(dir), [`${code}.json`]);
  restart();
  const back = rooms.get(code);
  assert.strictEqual(back.players[1].bot, true);
  assert.strictEqual(back.players[0].bot, undefined);
  assert.strictEqual(findMember(code, token).member, back.players[0]);
  stopTimers(back);
});

test('finished and expired games are not kept', () => {
  const dir = freshStore();
  const { room, code } = newGame();
  const winner = current(room);
  const meld = rigMeld(room);
  winner.hand = [...meld]; // their whole hand is one valid first meld, so playing it wins
  actions.commit({ table: [meld] }, room, winner);
  assert.ok(room.over, 'the game is over');
  assert.deepStrictEqual(saved(dir), [], 'its save is gone');
  assert.strictEqual(restart(), 0);
  assert.strictEqual(rooms.has(code), false);
});

test('a save that cannot be read is skipped, and the other games still load', () => {
  const dir = freshStore();
  const { code } = newGame();
  fs.writeFileSync(path.join(dir, 'ZZZZ.json'), '{ not json');
  fs.writeFileSync(path.join(dir, 'YYYY.json'), JSON.stringify({ version: Persist.VERSION + 1, code: 'YYYY' }));
  fs.writeFileSync(path.join(dir, 'XXXX.json'), JSON.stringify({ version: 1, code: 'WWWW', players: [], spectators: [] }));
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'not a room');
  const warn = console.warn;
  const warnings = [];
  console.warn = (msg) => warnings.push(msg);
  try {
    assert.strictEqual(restart(), 1);
  } finally {
    console.warn = warn;
  }
  assert.ok(rooms.has(code));
  assert.deepStrictEqual(warnings.length, 3, warnings.join('\n')); // the bad JSON, the newer version, the mismatched code
  stopTimers(rooms.get(code));
});

test('a save from before a setting existed gets its default', () => {
  const dir = freshStore();
  const { room, code } = newGame();
  const data = JSON.parse(fs.readFileSync(path.join(dir, `${code}.json`), 'utf8'));
  delete data.glow; // as if saved before the glow setting was added
  delete data.lastPlayed;
  fs.writeFileSync(path.join(dir, `${code}.json`), JSON.stringify(data));
  stopTimers(room);
  restart();
  const back = rooms.get(code);
  assert.strictEqual(back.glow, true);
  assert.deepStrictEqual(back.lastPlayed, []);
  stopTimers(back);
});

test('without a save folder nothing is written and nothing restored', () => {
  useStore(null);
  const { room } = newGame();
  assert.strictEqual(restart(), 0);
  stopTimers(room);
});

test('a save folder the server cannot use gives one warning and turns saving off', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rummicats-'));
  dirs.push(dir);
  const notAFolder = path.join(dir, 'file');
  fs.writeFileSync(notAFolder, ''); // a file where the folder should be: can't be created or written into
  const warn = console.warn;
  const warnings = [];
  console.warn = (msg) => warnings.push(msg);
  try {
    assert.strictEqual(Persist.createStore(path.join(notAFolder, 'rooms')), null);
  } finally {
    console.warn = warn;
  }
  assert.strictEqual(warnings.length, 1);
  assert.match(warnings[0], /won't survive a restart/);
});
