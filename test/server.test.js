// Server checks on what clients send. Run with: node --test
const test = require('node:test');
const assert = require('node:assert');

// Turn timers fire after 50ms instead of minutes. Set up before loading the server, which reads setTimeout then.
const realSetTimeout = setTimeout;
global.setTimeout = (fn, ms, ...args) => realSetTimeout(fn, Math.min(ms, 50), ...args);
const { actions, rooms, viewFor } = require('../server.js');

function newGame(timer = 0) {
  const { code } = actions.create({ name: 'A' });
  actions.join({ code, name: 'B' });
  const room = rooms.get(code);
  actions.start({ timer }, room, room.players[0]);
  return room;
}
const current = (room) => room.players[room.turn];

test('malformed drafts are dropped instead of being sent to every player', () => {
  const room = newGame();
  for (const table of [[null], [[999, 1000, 1001]], [[-1]], [['0', '1', '2']], [[{}]], 'nope', [[0.5]]]) {
    actions.draft({ table }, room, current(room));
    assert.strictEqual(room.draft, null, JSON.stringify(table));
  }
  actions.draft({ table: [[0, 1, 2]] }, room, current(room));
  assert.deepStrictEqual(room.draft, [[0, 1, 2]]);
});

test('commit refuses tile ids that do not exist', () => {
  const room = newGame();
  assert.throws(() => actions.commit({ table: [[200, 201, 202]] }, room, current(room)), /Bad table/);
});

test('the turn timer survives a bad draft and passes the turn on', async () => {
  const room = newGame(60);
  const player = current(room);
  const handBefore = player.hand.length;
  actions.draft({ table: [null] }, room, player); // used to crash the whole server when the timer fired
  await new Promise((resolve) => realSetTimeout(resolve, 80));
  assert.notStrictEqual(current(room), player, 'turn moved on');
  assert.strictEqual(player.hand.length, handBefore + 1, 'drew one cat');
  clearTimeout(room.clock);
});

// ---- Idle timer (fires after 50ms here too) ----

function idleGame(idle, names = ['A', 'B']) {
  const { code } = actions.create({ name: names[0] });
  for (const n of names.slice(1)) actions.join({ code, name: n });
  const room = rooms.get(code);
  actions.settings({ idle }, room, room.host);
  actions.start({}, room, room.host);
  return room;
}
const stopTimers = (room) => { clearTimeout(room.clock); clearTimeout(room.idleClock); clearTimeout(room.botTimer); rooms.delete(room.code); };

test('an idle player has their moves undone and their turn skipped, without drawing', async () => {
  const room = idleGame(60);
  const player = current(room);
  const handBefore = player.hand.length;
  assert.ok(room.idleEnds > Date.now());
  actions.draft({ table: [[player.hand[0]]] }, room, player); // a move restarts the clock...
  await new Promise((resolve) => realSetTimeout(resolve, 80)); // ...but then nothing for too long
  assert.notStrictEqual(current(room), player, 'turn moved on');
  assert.strictEqual(player.hand.length, handBefore, 'no cat drawn');
  assert.deepStrictEqual(room.table, [], 'moves undone');
  assert.strictEqual(room.draft, null);
  assert.ok(room.log.some((l) => l.includes('was idle')));
  stopTimers(room);
});

test('moving a cat restarts the idle timer', async () => {
  const room = idleGame(60);
  const player = current(room);
  const first = room.idleEnds;
  await new Promise((resolve) => realSetTimeout(resolve, 20));
  actions.draft({ table: [] }, room, player);
  assert.ok(room.idleEnds > first, 'deadline pushed back');
  assert.strictEqual(current(room), player);
  stopTimers(room);
});

test('with an empty pile, idle turns count as passes, so the game still ends', async () => {
  const room = idleGame(60);
  room.pool = [];
  await new Promise((resolve) => realSetTimeout(resolve, 200));
  assert.ok(room.over, 'game over');
  assert.match(room.over.why, /lowest hand/);
  stopTimers(room);
});

test('bots never get an idle timer', async () => {
  const { code } = actions.create({ name: 'A' });
  const room = rooms.get(code);
  actions.addBot({}, room, room.host);
  actions.start({ idle: 60 }, room, room.host);
  // Nobody has the room open, so the bot waits; the person's turn (if first) is skipped for being idle.
  await new Promise((resolve) => realSetTimeout(resolve, 120));
  assert.ok(current(room).bot);
  assert.strictEqual(room.idleEnds, null);
  stopTimers(room);
});

test('only the host picks the timers, only in the lobby, and only from the list', () => {
  const { code } = actions.create({ name: 'A' });
  actions.join({ code, name: 'B' });
  const room = rooms.get(code);
  const [host, guest] = room.players;
  assert.throws(() => actions.settings({ idle: 60 }, room, guest), /Only the host/);
  actions.settings({ timer: 120, idle: 30 }, room, host);
  assert.deepStrictEqual([room.turnLimit, room.idleLimit], [120, 30]);
  actions.settings({ idle: 7 }, room, host); // not on the list: off
  assert.deepStrictEqual([room.turnLimit, room.idleLimit], [120, 0]);
  actions.settings({ idle: 300 }, room, host);
  actions.start({}, room, host); // start without timers keeps what was picked
  assert.deepStrictEqual([room.turnLimit, room.idleLimit], [120, 300]);
  assert.throws(() => actions.settings({ idle: 60 }, room, host), /already started/);
  stopTimers(room);
});

// ---- Glow on the cats played last turn ----

// A turn the current player can always make: their first meld, rigged into their hand.
function rigMeld(room) {
  const { TILES, COLORS } = require('../public/rules.js');
  const want = [11, 12, 13].map((rank) => TILES.find((t) => !t.joker && t.color === COLORS[0] && t.rank === rank).id);
  for (const p of room.players) p.hand = p.hand.filter((id) => !want.includes(id));
  room.pool = room.pool.filter((id) => !want.includes(id));
  current(room).hand.push(...want);
  return want;
}

test('the cats a turn played are shown to everyone until the next player changes the table', () => {
  const room = newGame();
  const meld = rigMeld(room);
  actions.commit({ table: [meld] }, room, current(room));
  assert.deepStrictEqual(room.lastPlayed, meld);
  assert.deepStrictEqual(viewFor(room, room.spectators[0] || current(room)).lastPlayed, meld);
  const next = current(room);
  actions.draft({ table: [meld] }, room, next); // nothing changed yet
  assert.deepStrictEqual(room.lastPlayed, meld);
  actions.draft({ table: [[...meld].reverse()] }, room, next);
  assert.deepStrictEqual(room.lastPlayed, []);
  stopTimers(room);
});

test('a turn that only draws leaves nothing glowing', () => {
  const room = newGame();
  const meld = rigMeld(room);
  actions.commit({ table: [meld] }, room, current(room));
  actions.draw(null, room, current(room));
  assert.deepStrictEqual(room.lastPlayed, []);
  stopTimers(room);
});

test('the host can turn the glow off in the lobby, and then nobody is sent it', () => {
  const { code } = actions.create({ name: 'A' });
  actions.join({ code, name: 'B' });
  const room = rooms.get(code);
  const [host, guest] = room.players;
  assert.strictEqual(room.glow, true, 'on by default');
  assert.throws(() => actions.settings({ glow: false }, room, guest), /Only the host/);
  actions.settings({ glow: 'yes' }, room, host); // anything but true means off
  assert.strictEqual(room.glow, false);
  actions.start({ glow: false }, room, host);
  const meld = rigMeld(room);
  actions.commit({ table: [meld] }, room, current(room));
  assert.deepStrictEqual(viewFor(room, host).lastPlayed, [], 'not sent with the glow off');
  assert.strictEqual(viewFor(room, guest).glow, false);
  assert.throws(() => actions.settings({ glow: true }, room, host), /already started/);
  stopTimers(room);
});

// ---- Another game in the same room ----

test('after a game ends the host can take the room back to the lobby, keeping seats and settings', () => {
  const { code } = actions.create({ name: 'A' });
  actions.join({ code, name: 'B' });
  const room = rooms.get(code);
  const [host, guest] = room.players;
  actions.addBot(null, room, host);
  actions.start({ timer: 120, glow: false }, room, host);
  assert.throws(() => actions.again(null, room, host), /not over/);

  const winner = current(room);
  actions.commit({ table: [rigMeld(room)] }, room, winner); // not a win yet: rig an empty hand next
  winner.hand = [];
  room.over = { winner: winner.name, why: 'test', scores: [] };
  assert.throws(() => actions.again(null, room, guest), /Only the host/);

  const turnId = room.turnId;
  actions.again(null, room, host);
  assert.strictEqual(room.started, false);
  assert.strictEqual(room.over, null);
  assert.deepStrictEqual(room.table, []);
  assert.deepStrictEqual(room.players.map((p) => [p.name, p.hand.length, p.melded]), [['A', 0, false], ['B', 0, false], [room.players[2].name, 0, false]]);
  assert.ok(room.players[2].bot, 'the bot keeps its seat');
  assert.deepStrictEqual([room.turnLimit, room.glow], [120, false], 'settings stay');

  // It's a lobby again: people can join, and the host starts a fresh game.
  actions.join({ code, name: 'C' });
  actions.start({}, room, host);
  assert.ok(room.players.every((p) => p.hand.length === 14));
  assert.strictEqual(room.pool.length, 106 - 4 * 14);
  assert.ok(room.turnId > turnId, 'turn ids keep counting up, so old timers and drafts never match');
  stopTimers(room);
});
