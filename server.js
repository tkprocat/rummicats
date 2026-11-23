// Rummicats: a tiny multiplayer Rummikub with cats. No dependencies, just `node server.js`.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Rules = require('./public/rules.js');
const Bot = require('./bot.js');
const Avatar = require('./public/avatar.js');
const Persist = require('./persist.js');

const PORT = process.env.PORT || 3000;
const BOT_DELAY = Number(process.env.BOT_DELAY_MS ?? 1500); // pause before a bot plays, so people can follow along
const PUBLIC = path.join(__dirname, 'public');
// Joke avatars: KAT_JOKE=1 gives anyone named "Kat" the photo in public/art/kat.jpg instead of their cat. Off by default.
const config = { katJoke: /^(1|true|on|yes)$/i.test(process.env.KAT_JOKE || '') };
const rooms = new Map();
// Games in progress are saved at the start of every turn and restored after a restart (see persist.js).
// Off unless DATA_DIR is set; the Docker image sets it to /data.
let store = Persist.createStore(process.env.DATA_DIR);
const save = (room) => store && store.save(room);
const forget = (code) => store && store.remove(code);
const TURN_LIMITS = [60, 120, 180]; // seconds the host can pick for the turn timer
const IDLE_LIMITS = [30, 60, 120, 180, 300]; // ...and for the idle timer

// A member's avatar as everyone sees it: cleaned (so a client can never pick a photo itself), plus any joke photo.
function setAvatar(member, avatar) {
  member.avatar = Avatar.clean(avatar);
  if (config.katJoke && member.name.trim().toLowerCase() === 'kat') member.avatar.photo = 'kat';
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function newCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code;
  do code = Array.from({ length: 4 }, () => letters[crypto.randomInt(letters.length)]).join('');
  while (rooms.has(code));
  return code;
}

// Chat: lobby and in-game, players and spectators alike. Messages are plain text (shown as text, never HTML).
const CHAT_KEEP = 60; // messages kept per room
const CHAT_MAX = 200; // characters per message, counting an emoji like 👩‍👩‍👧 as one
const CHAT_BURST = 5; // at most this many messages...
const CHAT_WINDOW = 5000; // ...per this many ms, per person

const graphemes = new Intl.Segmenter();

// Tidy a message: one line, no control or text-direction characters, cut at whole characters so an emoji is
// never split in half. Emoji joiners (U+200D) and variation selectors are kept, so combined emoji survive.
function cleanChat(text) {
  text = String(text ?? '').normalize('NFC')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[\u0000-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/g, '')
    .trim();
  let out = '';
  let n = 0;
  for (const { segment } of graphemes.segment(text)) {
    if (++n > CHAT_MAX || out.length + segment.length > CHAT_MAX * 8) break; // the second cap stops piles of accents
    out += segment;
  }
  return out.trim();
}

function log(room, text) {
  room.log.push(text);
  if (room.log.length > 30) room.log.shift();
}

// Everyone in a room: players have a seat (room.players, bots included), spectators only watch.
// The host is whoever created the room, seated or watching; they add bots and start the game.
const members = (room) => [...room.players, ...room.spectators];

// What one member is allowed to see. Spectators get the same view as a player, minus a hand.
function viewFor(room, member) {
  const seat = room.players.indexOf(member); // -1 for a spectator
  const player = seat >= 0 ? member : null;
  return {
    code: room.code,
    started: room.started,
    over: room.over,
    turn: room.turn,
    turnId: room.turnId,
    turnLimit: room.turnLimit,
    turnEnds: room.turnEnds,
    idleLimit: room.idleLimit,
    idleEnds: room.idleEnds,
    glow: room.glow,
    lastPlayed: room.glow ? room.lastPlayed : [],
    now: Date.now(),
    pool: room.pool.length,
    table: room.table,
    draft: room.draft,
    log: room.log,
    chat: room.chat.map((c) => ({
      id: c.id, name: c.name, avatar: c.from.avatar, text: c.text, at: c.at, mine: c.from === member, watching: room.spectators.includes(c.from),
    })),
    you: seat,
    isHost: room.host === member,
    hand: player ? player.hand : [],
    hasMelded: player ? player.melded : false,
    players: room.players.map((p) => ({
      name: p.name, avatar: p.avatar, count: p.hand.length, melded: p.melded, bot: !!p.bot, host: room.host === p, online: !!p.bot || p.clients.size > 0,
    })),
    spectators: room.spectators.map((s) => ({ name: s.name, avatar: s.avatar, host: room.host === s, online: s.clients.size > 0 })),
  };
}

function broadcast(room) {
  for (const m of members(room))
    for (const res of m.clients) res.write(`data: ${JSON.stringify(viewFor(room, m))}\n\n`);
}

// Every turn end records what that turn put on the table (nothing for a draw, pass or skip),
// so the next player can see what changed.
function nextTurn(room, played = []) {
  room.lastPlayed = played;
  room.turn = (room.turn + 1) % room.players.length;
  room.turnId++;
  room.draft = null;
  startClock(room);
  startIdle(room);
  scheduleBot(room);
  save(room); // the start of the next turn is where a restart picks up
}

// Is a person (not a bot) looking at this room right now?
const humanWatching = (room) => members(room).some((m) => !m.bot && m.clients.size > 0);

// On a bot's turn, it plays after a short pause. Bots wait while nobody has the room open, so an
// abandoned game goes quiet (and expires); they pick up again when someone reconnects.
function scheduleBot(room) {
  clearTimeout(room.botTimer);
  const bot = room.players[room.turn];
  if (!room.started || room.over || !bot || !bot.bot || !humanWatching(room)) return;
  const turnId = room.turnId;
  room.botTimer = setTimeout(() => {
    if (room.turnId !== turnId || room.over) return;
    botTurn(room, bot);
    broadcast(room);
  }, BOT_DELAY);
}

// A bot's move goes through the same checks as a person's. If it's ever refused, the bot draws instead.
function botTurn(room, bot) {
  try {
    const move = Bot.chooseMove(room.table, bot.hand, bot.melded);
    if (move) return actions.commit({ table: move }, room, bot);
  } catch (e) {
    console.error(`Bot ${bot.name} in room ${room.code} made a move that was refused (${e.message}); drawing instead`);
  }
  try {
    actions.draw(null, room, bot);
  } catch (e) {
    console.error(`Bot ${bot.name} in room ${room.code} could not draw:`, e);
  }
}

// Turn timer (optional). When it runs out the moves are undone and the player draws:
// 3 cats if they left the table invalid, otherwise 1, like the official 2-minute rule.
function startClock(room) {
  clearTimeout(room.clock);
  room.turnEnds = null;
  if (!room.turnLimit || room.over) return;
  room.turnEnds = Date.now() + room.turnLimit * 1000;
  room.clock = setTimeout(() => {
    // An exception in a timer would take the whole server down, so contain it to this room.
    try {
      const player = room.players[room.turn];
      const messy = room.draft && !sameGroups(room.table, room.draft) &&
        !Rules.checkTurn(room.table, room.draft.filter((s) => s.length), player.hand, player.melded).ok;
      if (room.draft && sameGroups(room.table, room.draft)) room.table = room.draft;
      log(room, `⏰ ${player.name} ran out of time`);
      room.draft = null;
      drawCats(room, player, messy ? 3 : 1);
      broadcast(room);
    } catch (e) {
      console.error(`Turn timer failed in room ${room.code}:`, e);
    }
  }, room.turnLimit * 1000);
}

// Idle timer (optional). It starts again every time the player moves a cat; if they don't move one for that long,
// their moves are undone and the turn goes to the next player, without drawing. With an empty pile it counts as a
// pass, so a game where nobody can play still ends. Bots never sit idle, so their turns don't get one.
function startIdle(room) {
  clearTimeout(room.idleClock);
  room.idleEnds = null;
  const player = room.players[room.turn];
  if (!room.idleLimit || !room.started || room.over || !player || player.bot) return;
  room.idleEnds = Date.now() + room.idleLimit * 1000;
  const turnId = room.turnId;
  room.idleClock = setTimeout(() => {
    try {
      if (room.turnId !== turnId || room.over) return;
      log(room, `💤 ${player.name} was idle, turn skipped`);
      if (room.draft && sameGroups(room.table, room.draft)) room.table = room.draft;
      room.draft = null;
      if (room.pool.length) nextTurn(room);
      else drawCats(room, player, 1); // nothing to draw: counts as a pass
      broadcast(room);
    } catch (e) {
      console.error(`Idle timer failed in room ${room.code}:`, e);
    }
  }, room.idleLimit * 1000);
}

// Draw n cats and end the turn. With an empty pile the turn counts as a pass.
function drawCats(room, player, n) {
  if (room.pool.length) {
    const got = room.pool.splice(-n, n);
    player.hand.push(...got);
    room.passes = 0;
    log(room, `${player.name} drew ${got.length > 1 ? got.length + ' cats' : 'a cat'}`);
  } else {
    room.passes++;
    log(room, `${player.name} passed (no cats left to draw)`);
    if (room.passes >= room.players.length) {
      const best = [...room.players].sort((a, b) => Rules.handPenalty(a.hand) - Rules.handPenalty(b.hand))[0];
      return finish(room, best, 'Nobody could play, lowest hand wins.');
    }
  }
  nextTurn(room);
}

function finish(room, winner, why) {
  clearTimeout(room.clock);
  clearTimeout(room.botTimer);
  clearTimeout(room.idleClock);
  room.turnEnds = null;
  room.idleEnds = null;
  room.over = { winner: winner.name, why, scores: room.players.map((p) => ({ name: p.name, avatar: p.avatar, penalty: Rules.handPenalty(p.hand) })) };
  log(room, `🏆 ${winner.name} wins! ${why}`);
  forget(room.code); // finished games aren't kept across a restart
}

// A room with every field at its starting value. New rooms start here, and so do saved ones being restored,
// so a save from before a field existed still gets a sensible value for it.
function newRoom(code) {
  return {
    code, players: [], spectators: [], host: null, started: false, over: null, turn: 0, turnId: 0,
    pool: [], table: [], draft: null, log: [], chat: [], chatId: 0, passes: 0, turnLimit: 0, turnEnds: null, clock: null, botTimer: null,
    idleLimit: 0, idleEnds: null, idleClock: null, lastActive: Date.now(), glow: true, lastPlayed: [],
  };
}

// Bring back the games saved before a restart, each at the start of the turn it was on, with fresh timers.
// Bots wait as usual until someone has the room open.
function restoreRooms() {
  if (!store) return 0;
  const restored = store.loadAll(newRoom).filter((room) => room.started && room.players.length >= 2);
  for (const room of restored) {
    rooms.set(room.code, room);
    startClock(room);
    startIdle(room);
  }
  return restored.length;
}

const actions = {
  create(body) {
    const room = newRoom(newCode());
    rooms.set(room.code, room);
    const result = actions.join({ ...body, code: room.code });
    room.host = room.players[0];
    return result;
  },

  // Take a seat, or watch if all 4 seats are taken (by people or bots).
  join({ code, name, avatar }) {
    const room = rooms.get(String(code || '').toUpperCase());
    if (!room) throw new Error('No room with that code');
    if (room.started) throw new Error('That game has already started');
    name = String(name || '').trim().slice(0, 16) || `Cat ${members(room).length + 1}`;
    // No avatar sent (e.g. an older page): a random cat, so nobody looks the same by default.
    const member = { name, token: crypto.randomUUID(), hand: [], melded: false, clients: new Set() };
    setAvatar(member, avatar && typeof avatar === 'object' ? avatar : Avatar.random());
    const full = room.players.length >= 4;
    (full ? room.spectators : room.players).push(member);
    log(room, full ? `${name} is watching (all seats taken)` : `${name} joined`);
    room.lastActive = Date.now();
    broadcast(room);
    return { code: room.code, token: member.token };
  },

  // Say something to the room, in the lobby or during the game.
  chat({ text }, room, member) {
    text = cleanChat(text);
    if (!text) throw new Error('Empty message');
    const now = Date.now();
    member.chatTimes = (member.chatTimes || []).filter((t) => now - t < CHAT_WINDOW);
    if (member.chatTimes.length >= CHAT_BURST) throw new Error('Slow down a little 🐾');
    member.chatTimes.push(now);
    room.chat.push({ id: ++room.chatId, from: member, name: member.name, text, at: now });
    if (room.chat.length > CHAT_KEEP) room.chat.shift();
  },

  // Change your avatar, any time. Only values from the curated lists are kept (see public/avatar.js).
  avatar({ avatar }, room, member) {
    setAvatar(member, avatar);
  },

  // Lobby only: switch between a seat and watching.
  spectate(_, room, member) {
    mustBeLobby(room);
    const seat = room.players.indexOf(member);
    if (seat >= 0) {
      room.players.splice(seat, 1);
      room.spectators.push(member);
      log(room, `${member.name} is watching`);
    } else {
      if (room.players.length >= 4) throw new Error('No free seat');
      room.spectators.splice(room.spectators.indexOf(member), 1);
      room.players.push(member);
      log(room, `${member.name} took a seat`);
    }
  },

  addBot(_, room, member) {
    mustBeHostInLobby(room, member);
    if (room.players.length >= 4) throw new Error('All 4 seats are taken');
    const taken = new Set(room.players.map((p) => p.name));
    const name = Bot.BOT_NAMES.find((n) => !taken.has(n)) || `Bot ${room.players.length + 1}`;
    // A bot has a token like everyone else, but it's never sent anywhere, so nobody can act as a bot.
    room.players.push({ name, avatar: Avatar.random(), token: crypto.randomUUID(), hand: [], melded: false, clients: new Set(), bot: true });
    log(room, `🤖 ${name} joined`);
  },

  removeBot({ seat }, room, member) {
    mustBeHostInLobby(room, member);
    const bot = room.players[Number(seat)];
    if (!bot || !bot.bot) throw new Error('That seat is not a bot');
    room.players.splice(Number(seat), 1);
    log(room, `🤖 ${bot.name} left`);
  },

  // Lobby only: the host picks the timers and the glow, and everyone sees the choice in the room rules straight away.
  // Anything not on the list means off.
  settings({ timer, idle, glow }, room, member) {
    mustBeHostInLobby(room, member);
    if (timer !== undefined) room.turnLimit = TURN_LIMITS.includes(Number(timer)) ? Number(timer) : 0;
    if (idle !== undefined) room.idleLimit = IDLE_LIMITS.includes(Number(idle)) ? Number(idle) : 0;
    if (glow !== undefined) room.glow = glow === true;
  },

  start({ timer, idle, glow }, room, member) {
    if (room.started) throw new Error('Already started');
    if (room.host !== member) throw new Error('Only the host can start');
    if (room.players.length < 2) throw new Error('Need at least 2 players');
    actions.settings({ timer, idle, glow }, room, member); // settings sent with start win over earlier ones
    room.pool = shuffle(Rules.TILES.map((t) => t.id));
    for (const p of room.players) p.hand = room.pool.splice(0, 14);
    room.started = true;
    room.turn = crypto.randomInt(room.players.length);
    room.turnId++;
    log(room, `Game started. ${room.players[room.turn].name} goes first`);
    if (room.turnLimit) log(room, `⏰ Each turn has ${room.turnLimit / 60} min`);
    if (room.idleLimit) log(room, `💤 Idle for ${room.idleLimit < 60 ? room.idleLimit + " sec" : room.idleLimit / 60 + " min"} and your turn is skipped`);
    startClock(room);
    startIdle(room);
    scheduleBot(room); // a bot may go first
    save(room);
  },

  // After a game ends, the host takes the room back to the lobby for another one. Seats, bots and settings stay,
  // so they can start straight away, or let people join, swap seats and change the settings first.
  again(_, room, member) {
    if (!room.over) throw new Error('The game is not over yet');
    if (room.host !== member) throw new Error('Only the host can start a new game');
    Object.assign(room, { started: false, over: null, pool: [], table: [], draft: null, lastPlayed: [], passes: 0, turnEnds: null, idleEnds: null });
    for (const p of room.players) Object.assign(p, { hand: [], melded: false });
    log(room, `🔁 ${member.name} set up a new game`);
  },

  // Live preview of the current player's moves, so others can watch.
  // It's sent to every player, so only well-formed tables get through.
  draft({ table }, room, player) {
    mustBeTurn(room, player);
    room.draft = isTable(table) ? table : null;
    // The previous turn's glow goes out once this player starts changing the table.
    if (room.draft && !sameGroups(room.table, room.draft)) room.lastPlayed = [];
    startIdle(room); // moving a cat counts as not idle
  },

  draw(body, room, player) {
    mustBeTurn(room, player);
    const table = body && body.table;
    if (isTable(table) && sameGroups(room.table, table)) room.table = table;
    else if (!table && room.draft && sameGroups(room.table, room.draft)) room.table = room.draft;
    drawCats(room, player, 1);
  },

  commit({ table }, room, player) {
    mustBeTurn(room, player);
    if (!isTable(table)) throw new Error('Bad table');
    table = table.filter((s) => s.length);
    const r = Rules.checkTurn(room.table, table, player.hand, player.melded);
    if (!r.ok) throw new Error(r.reason);
    const played = new Set(r.played);
    player.hand = player.hand.filter((id) => !played.has(id));
    room.table = table;
    room.passes = 0;
    if (!player.melded) log(room, `${player.name} made their first meld!`);
    player.melded = true;
    log(room, `${player.name} played ${r.played.length} cat${r.played.length > 1 ? 's' : ''}`);
    if (player.hand.length === 0) return finish(room, player, 'Their paws are empty.');
    nextTurn(room, r.played);
  },
};

// A table from a client: a list of sets, each a list of real tile ids.
function isTable(table) {
  const isId = (id) => Number.isInteger(id) && id >= 0 && id < Rules.TILES.length;
  return Array.isArray(table) && table.every((s) => Array.isArray(s) && s.every(isId));
}

// Group order alone does not change any tile or set, including their order within a set.
function sameGroups(a, b) {
  return a.length === b.length && JSON.stringify(a.map((s) => JSON.stringify(s)).sort()) ===
    JSON.stringify(b.map((s) => JSON.stringify(s)).sort());
}

function mustBeTurn(room, member) {
  if (!room.started || room.over) throw new Error('Game is not running');
  if (room.players[room.turn] !== member) throw new Error('Not your turn');
}

function mustBeLobby(room) {
  if (room.started) throw new Error('The game has already started');
}

function mustBeHostInLobby(room, member) {
  mustBeLobby(room);
  if (room.host !== member) throw new Error('Only the host can do that');
}

// A player or spectator, by their secret token.
function findMember(code, token) {
  const room = rooms.get(String(code || '').toUpperCase());
  const member = room && typeof token === 'string' && members(room).find((m) => m.token === token);
  if (!member) throw new Error('Unknown room or player');
  return { room, member };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 1e5) {
        reject(new Error('Request too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(new Error('Bad JSON')); }
    });
  });
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');

  if (url.pathname === '/events') {
    let found;
    try { found = findMember(url.searchParams.get('code'), url.searchParams.get('token')); }
    catch (e) { res.writeHead(404); return res.end(); }
    const { room, member } = found;
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    member.clients.add(res);
    room.lastActive = Date.now();
    broadcast(room);
    scheduleBot(room); // bots pause while nobody is watching; pick up again
    const ping = setInterval(() => res.write(': ping\n\n'), 25000);
    req.on('close', () => {
      clearInterval(ping);
      member.clients.delete(res);
      broadcast(room);
    });
    return;
  }

  const m = url.pathname.match(/^\/api\/(\w+)$/);
  if (m && req.method === 'POST' && Object.hasOwn(actions, m[1])) {
    try {
      const body = await readBody(req);
      let result = {};
      if (m[1] === 'create' || m[1] === 'join') result = actions[m[1]](body);
      else {
        const { room, member } = findMember(body.code, body.token);
        room.lastActive = Date.now(); // only people keep a room alive, not bots playing on their own
        actions[m[1]](body, room, member);
        broadcast(room);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, ...result }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
    return;
  }

  const file = path.join(PUBLIC, url.pathname === '/' ? 'index.html' : path.normalize(url.pathname));
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

// Forget rooms nobody has touched for 6 hours.
setInterval(() => {
  for (const [code, room] of rooms)
    if (Date.now() - room.lastActive > 6 * 3600e3) {
      clearTimeout(room.clock);
      clearTimeout(room.botTimer);
      clearTimeout(room.idleClock);
      rooms.delete(code);
      forget(code);
    }
}, 600e3).unref();

// Start listening only when run directly (`node server.js`); tests require this file instead.
if (require.main === module) {
  const restored = restoreRooms();
  if (store) console.log(`💾 Saving games in progress to ${store.dir}${restored ? ` (restored ${restored})` : ''}`);
  server.listen(PORT, () => console.log(`🐱 Rummicats running on http://localhost:${PORT}`));
}

// Tests swap in a store of their own (persistence is off unless DATA_DIR is set).
const useStore = (s) => { store = s; };

module.exports = { actions, rooms, findMember, server, cleanChat, viewFor, config, restoreRooms, useStore };
