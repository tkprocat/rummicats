// Games that survive a server restart. Each game in progress is saved to its own file, <room code>.json, at the
// start of every turn, and restored to that point when the server starts: the player whose turn it was starts
// their turn again, with fresh timers. Rooms in the lobby and finished games aren't saved, and neither is chat or
// an avatar change made since the turn began. Only on when DATA_DIR is set (the Docker image sets /data).
const fs = require('fs');
const path = require('path');

const VERSION = 1; // bump when the saved shape changes in a way older code can't read
const FILE = /^[A-Z]{4}\.json$/; // room codes are 4 capital letters, chosen by the server

// The parts of a room worth keeping. Connections, timers and the turn in progress (draft) are left out; people
// and the host are saved as their tokens, so they can be linked back up on load.
function toSaved(room) {
  const member = (m) => ({ name: m.name, avatar: m.avatar, token: m.token, hand: m.hand, melded: m.melded, bot: !!m.bot });
  return {
    version: VERSION,
    code: room.code,
    players: room.players.map(member),
    spectators: room.spectators.map(member),
    host: room.host ? room.host.token : null,
    started: room.started, turn: room.turn, turnId: room.turnId,
    pool: room.pool, table: room.table, lastPlayed: room.lastPlayed, passes: room.passes,
    turnLimit: room.turnLimit, idleLimit: room.idleLimit, glow: room.glow,
    log: room.log, chatId: room.chatId,
    chat: room.chat.map((c) => ({ id: c.id, from: c.from.token, name: c.name, text: c.text, at: c.at })),
    lastActive: room.lastActive,
  };
}

// Back from a save onto blank, a fresh room with every field at its default (so saves from older code, missing
// newer fields, still load).
function fromSaved(data, blank) {
  if (!data || data.version > VERSION) throw new Error(`saved by a newer version (${data && data.version})`);
  const member = (m) => {
    const out = { name: m.name, avatar: m.avatar, token: m.token, hand: m.hand, melded: m.melded, clients: new Set() };
    if (m.bot) out.bot = true;
    return out;
  };
  const room = Object.assign(blank, {
    players: data.players.map(member),
    spectators: data.spectators.map(member),
  });
  for (const key of ['started', 'turn', 'turnId', 'pool', 'table', 'lastPlayed', 'passes', 'turnLimit', 'idleLimit', 'glow', 'log', 'chatId', 'lastActive'])
    if (data[key] !== undefined) room[key] = data[key];
  const byToken = new Map([...room.players, ...room.spectators].map((m) => [m.token, m]));
  room.host = byToken.get(data.host) || room.players.find((m) => !m.bot) || null;
  room.chat = (data.chat || []).filter((c) => byToken.has(c.from)).map((c) => ({ ...c, from: byToken.get(c.from) }));
  return room;
}

// A store in dir, or null when there's nowhere to save: DATA_DIR not set, or a folder the server can't write to
// (say a volume created before /data belonged to the node user). That gets one clear warning, and the server runs
// on without saving, as it did before persistence existed.
function createStore(dir) {
  if (!dir) return null;
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.accessSync(dir, fs.constants.R_OK | fs.constants.W_OK);
  } catch (e) {
    console.warn(`⚠️ Can't save games to ${dir} (${e.code || e.message}), so games won't survive a restart. ` +
      'Check that the folder (or the volume mounted there) is writable by the user the server runs as.');
    return null;
  }
  const file = (code) => path.join(dir, `${code}.json`);
  return {
    dir,
    // Written to a temporary file first and then renamed over the old one, so a crash mid-write never leaves half
    // a save. A failed save is logged rather than thrown: the game carries on, it just won't survive a restart.
    save(room) {
      try {
        const tmp = `${file(room.code)}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(toSaved(room)));
        fs.renameSync(tmp, file(room.code));
      } catch (e) {
        console.error(`Could not save room ${room.code}:`, e.message);
      }
    },
    remove(code) {
      try { fs.rmSync(file(code), { force: true }); } catch (e) { console.error(`Could not remove the save for room ${code}:`, e.message); }
    },
    // Every saved game, rebuilt with blankRoom(code). A file that can't be read is skipped with a warning, so one
    // bad save never stops the server from starting.
    loadAll(blankRoom) {
      const out = [];
      let names = [];
      try { names = fs.readdirSync(dir); } catch (e) { console.warn(`Could not read saved games in ${dir}:`, e.message); }
      for (const name of names) {
        if (!FILE.test(name)) continue;
        const code = name.slice(0, 4);
        try {
          const data = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
          if (data.code !== code) throw new Error('the file name and the room code inside differ');
          out.push(fromSaved(data, blankRoom(code)));
        } catch (e) {
          console.warn(`Skipping saved room ${name}: ${e.message}`);
        }
      }
      return out;
    },
  };
}

module.exports = { createStore, toSaved, fromSaved, VERSION };
