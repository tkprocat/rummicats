// Rooms with bots and spectators. Run with: node --test
const test = require('node:test');
const assert = require('node:assert');

process.env.BOT_DELAY_MS = '0'; // bots play instantly here; set before loading the server
const { actions, rooms, findMember, server } = require('../server.js');

// Pretend a browser has the room open for this member (bots only play while someone is watching).
const watch = (member) => { const fake = { write() {} }; member.clients.add(fake); return fake; };
const waitFor = async (cond, ms = 10000) => {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 5));
  }
};

test('the host can watch while 4 bots play a whole game', async () => {
  const { code } = actions.create({ name: 'Host' });
  const room = rooms.get(code);
  const host = room.players[0];
  actions.spectate({}, room, host);
  assert.strictEqual(room.players.length, 0);
  assert.strictEqual(room.spectators[0], host);
  for (let i = 0; i < 4; i++) actions.addBot({}, room, host);
  assert.throws(() => actions.addBot({}, room, host), /All 4 seats/);
  assert.deepStrictEqual(room.players.map((p) => p.name), ['Whiskers', 'Mittens', 'Biscuit', 'Noodle']);

  watch(host);
  actions.start({ timer: 0 }, room, host);
  await waitFor(() => room.over);
  assert.ok(room.over.winner);
  assert.ok(room.log.some((l) => l.includes('wins')));
  rooms.delete(code);
});

test('bots wait while nobody has the room open, and carry on when someone comes back', async () => {
  // Over real HTTP, since opening the event stream is what wakes the bots up.
  await new Promise((r) => server.listen(0, r));
  const base = `http://localhost:${server.address().port}`;
  try {
    const { code } = actions.create({ name: 'Host' });
    const room = rooms.get(code);
    const host = room.players[0];
    actions.spectate({}, room, host);
    actions.addBot({}, room, host);
    actions.addBot({}, room, host);
    actions.start({ timer: 0 }, room, host);
    const turnId = room.turnId;
    await new Promise((r) => setTimeout(r, 50));
    assert.strictEqual(room.turnId, turnId, 'no moves with nobody watching');

    const stop = new AbortController();
    const res = await fetch(`${base}/events?code=${code}&token=${host.token}`, { signal: stop.signal });
    assert.strictEqual(res.status, 200);
    await waitFor(() => room.over || room.turnId > turnId + 3);
    stop.abort();
    await waitFor(() => host.clients.size === 0);
    rooms.delete(code);
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
});

test('only the host manages bots, and only in the lobby', () => {
  const { code } = actions.create({ name: 'Host' });
  const room = rooms.get(code);
  const { token } = actions.join({ code, name: 'Guest' });
  const guest = room.players[1];
  assert.strictEqual(guest.token, token);
  assert.throws(() => actions.addBot({}, room, guest), /Only the host/);
  actions.addBot({}, room, room.host);
  assert.throws(() => actions.removeBot({ seat: 0 }, room, room.host), /not a bot/);
  actions.removeBot({ seat: 2 }, room, room.host);
  assert.strictEqual(room.players.length, 2);
  actions.addBot({}, room, room.host);
  actions.addBot({}, room, room.host);
  // A fifth person joins as a spectator instead of being turned away
  actions.join({ code, name: 'Late' });
  assert.strictEqual(room.spectators[0].name, 'Late');
  assert.throws(() => actions.spectate({}, room, room.spectators[0]), /No free seat/);
  actions.start({ timer: 0 }, room, room.host);
  assert.throws(() => actions.addBot({}, room, room.host), /already started/);
  assert.throws(() => actions.spectate({}, room, guest), /already started/);
  rooms.delete(code);
});

test('nobody can act as a bot: bots have no usable token', () => {
  const { code } = actions.create({ name: 'Host' });
  const room = rooms.get(code);
  actions.addBot({}, room, room.host);
  for (const token of [null, undefined, '', 0]) assert.throws(() => findMember(code, token), /Unknown room or player/);
  rooms.delete(code);
});

test('chat works in the lobby and in the game, for players and spectators, and keeps emoji whole', () => {
  const { code } = actions.create({ name: 'Host' });
  const room = rooms.get(code);
  const host = room.players[0];
  actions.join({ code, name: 'Guest' });
  const guest = room.players[1];
  actions.chat({ text: '  hi 👋\nready? ' }, room, host);
  actions.spectate({}, room, guest);
  actions.chat({ text: '👩‍👩‍👧🐈‍⬛❤️' }, room, guest);
  actions.addBot({}, room, host);
  actions.start({ timer: 0 }, room, host);
  actions.chat({ text: 'gl hf 😼' }, room, host);
  assert.deepStrictEqual(room.chat.map((c) => c.text), ['hi 👋 ready?', '👩‍👩‍👧🐈‍⬛❤️', 'gl hf 😼']);
  assert.throws(() => actions.chat({ text: '  \n ' }, room, host), /Empty/);

  // Each viewer sees which messages are theirs and who was watching; no tokens leak through the chat
  const { viewFor } = require('../server.js');
  const seen = viewFor(room, guest).chat;
  assert.deepStrictEqual(seen.map((c) => [c.name, c.mine, c.watching]), [['Host', false, false], ['Guest', true, true], ['Host', false, false]]);
  assert.ok(!JSON.stringify(viewFor(room, guest)).includes(host.token));
  rooms.delete(code);
});

test('chat messages are trimmed to 200 characters without splitting an emoji, and spam is slowed down', () => {
  const { cleanChat } = require('../server.js');
  const long = cleanChat('👩‍👩‍👧'.repeat(250));
  assert.strictEqual([...new Intl.Segmenter().segment(long)].length, 200);
  assert.ok(long.endsWith('👩‍👩‍👧'));
  assert.strictEqual(cleanChat('‮gnp.exe\u0007'), 'gnp.exe'); // no text-direction tricks or control characters
  assert.strictEqual(cleanChat(null), '');

  const { code } = actions.create({ name: 'Host' });
  const room = rooms.get(code);
  const host = room.players[0];
  for (let i = 0; i < 5; i++) actions.chat({ text: `${i}` }, room, host);
  assert.throws(() => actions.chat({ text: 'too fast' }, room, host), /Slow down/);
  for (let i = 0; i < 70; i++) { host.chatTimes = []; actions.chat({ text: `${i}` }, room, host); }
  assert.strictEqual(room.chat.length, 60);
  rooms.delete(code);
});
