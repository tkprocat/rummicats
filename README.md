# 🐾 Rummicats

Rummikub, but every tile is a cat. 2 to 4 players in the browser, rooms joined by a 4-letter code.

## Run it

Needs Node 18 or newer. No `npm install` needed, there are no dependencies.

```
node server.js
```

Open http://localhost:3000, create a room, and send the invite link to friends.
Friends on the same Wi-Fi can use `http://<your-computer's-IP>:3000`. To play over the
internet, deploy the folder to any Node host (Render, Railway, Fly.io…) or use a tunnel
like `npx localtunnel --port 3000`. Set `PORT` to change the port.
Start with `KAT_JOKE=1` (PowerShell: `$env:KAT_JOKE=1; node server.js`) and anyone who joins as "Kat" gets a
very special avatar.

## Bots and spectators

In the lobby, the host can fill empty seats with **🤖 bots** (✕ on a bot's chip removes it). Anyone in the lobby
can press **Watch instead** to give up their seat and spectate; the host stays host while watching, so for testing
you can watch 4 bots play each other. Spectators see the table and moves live, but no one's hand. A fifth person
joining a full room becomes a spectator.

Bots play on the server after a short pause (set `BOT_DELAY_MS`, default 1500, e.g. `BOT_DELAY_MS=200 node server.js`
to watch a fast game). They only see their own hand and the table, and their moves go through the same rule check as
everyone else's. They pause while nobody has the room open. The strategy is in `bot.js`: best combination of new sets
from its hand, adding cats to table sets, splitting long runs, and freeing wild cats. It doesn't do big table
rearrangements yet.

## Your cat

Tap the cat next to your name in the lobby (or your own cat on the player list during a game) to make your avatar:
ears, eyes, mouth, a coat pattern (tabby, tuxedo, Siamese points, calico, tortoiseshell, spotted, eye patch, split
face), an extra (bow, flower, glasses, bell collar, crown) and colors from a curated palette. Breed presets fill in a
look in one tap, and 🎲 picks a random one. Your cat is saved in this browser (localStorage), and it shows on the
player list and next to your chat messages. Bots get a random cat. The server only accepts values from the lists in
`public/avatar.js`.

## Chat

Everyone in a room (players and spectators) can chat in the lobby and during the game. The chat panel sits on the
right and collapses to a 💬 tab that shows how many messages you haven't read; it starts open on wide screens and
closed on phones, and remembers your choice. Drag its left edge to make it wider or narrower (or focus the
edge and use the arrow keys, Shift for bigger steps); double-click the edge to reset. The width is remembered too.
The 😺 button opens an emoji picker (cats, faces, hands, fun, and your recently used ones). A message of only emoji is
shown big with no bubble, wrapping onto more lines when it is long. Messages are plain text, up to 200 characters (an emoji counts as one), and the server keeps the last 60
per room. Sending more than 5 messages in 5 seconds is refused.

## The cats

Every tile is a cat with a number from 1 to 13. The 4 colors are fur colors: Ginger, Midnight,
Smoky and Pinky. Two rainbow **Wild** cats (★) are jokers.

## Rules

- Everyone starts with 14 cats. 106 tiles in total (2 of each cat in each color, plus 2 wilds).
- **Run**: 3+ cats of the same fur color with consecutive numbers (13 does not wrap to 1).
- **Group**: 3 or 4 cats with the same number, each a different color.
- **First meld**: your first play must be worth 30+ points (a cat is worth its number) using only cats from your paws.
- After that you can rearrange anything on the table, as long as every set is valid when you press Done and you played at least one cat.
- Each turn you either play at least one cat from your paws, or draw a cat. Drawing ends your turn.
- Optional turn timer (host picks 1, 2 or 3 minutes before starting). If time runs out your moves are undone and you draw a cat, or 3 cats if you left the table invalid.
- Optional idle timer (host picks 30 seconds to 5 minutes). Moving a cat restarts it; if you don't move one in time, your moves are undone and your turn is skipped without drawing. With an empty pile an idle turn counts as a pass. Bots never get one.
- The host's timer picks show up for everyone straight away under **📜 Rules** next to the invite link, along with these rules. Both countdowns show at the top right during a turn.
- When the pile is empty, you pass; if everyone passes, the lowest hand wins.
- First to empty their paws wins.

## How to play on screen
Your paws are a two-tier rack, like the real game: drag cats into any slot and leave gaps between bunches however you like (sort by color keeps each color together on one tier). Cats you play this turn leave a gap and go back to it if you take them back.
Tap cats to pick them up (as many as you like, e.g. a whole run or group; tap one again to put it back, Esc drops them all).
With a mouse, hold the left button and sweep across table cats to select or deselect them together. On your paws, hold briefly before sweeping; move immediately to rearrange a cat instead.
Then tap a gap in a set, the empty spot (new set), an empty slot on your rack, or the rack itself (only for cats you put down this turn).
To swap a wild cat on the table (after your first meld), pick up the cat it stands for and tap the wild cat: they trade places and the wild cat comes to your paws, picked up and ready to play in another set (you must play it that turn before Done).
Tap the draw pile to draw. Each player's chip shows their rack as face-down cats.
The theme menu at the top right picks normal, 🎃 Halloween (pumpkins and wizard-hat kittens you can poke) or 🎄 Christmas (presents, a lit tree, Santa-hat kittens and falling snow that slowly piles up along the bottom of the screen); remembered per browser.
Red sets are not valid yet. Undo move (or Ctrl+Z) steps back one move; Undo turn puts everything back. Other players watch your moves live.

## Tests

```
node --test
```

`test/replay.test.js` replays the first 22 turns of a real 3-player game (transcribed from a recording of the official Rummikub app) through the server's own move check, so rule changes that would reject a legal real-world move fail the test. It also checks that a few illegal moves are still refused.

## Files

- `server.js`: HTTP server, rooms, turn handling (Server-Sent Events push state to players and spectators)
- `bot.js`: the bots' strategy, `chooseMove(table, hand, hasMelded)`
- `public/rules.js`: tile set and rule checks, shared by server and browser
- `public/index.html`, `style.css`: the page and its look
- `public/js/`: the game client, as plain ES modules (no build step). `app.js` is the entry point: game state,
  moves and drawing the screen. The rest are self-contained pieces it imports:
  - `api.js`: the player's session and calls to the server
  - `rack.js`: rack slots and tiers, sliding cats into gaps, sort by color/number
  - `drag.js`: dragging cats around the rack
  - `art.js`: loads the SVG artwork and builds tiles and decorations from it
  - `theme.js`: normal/Halloween/Christmas themes and the pokeable decorations; `snow.js`: the Christmas snow
  - `win.js`: the winner popup and confetti
  - `notify.js`: your-turn browser notifications
  - `chat.js`: the chat panel, its resizing and the emoji picker
  - `roomRules.js`: the 📜 Rules dropdown, with the timers picked for the room
  - `dom.js`: tiny shared helpers (`$`, settings storage)
- `public/art/*.svg`: the cats, kittens and holiday decorations, editable in any design tool (see `public/art/README.md`)
- `test/replay.test.js`: rule tests (Node's built-in test runner, no dependencies)
- `test/server.test.js`: checks that the server rejects malformed input from clients, plus the turn and idle timers
- `test/bot.test.js`: bot strategy cases, plus 40 whole 4-bot games where every move must pass the rule check
- `test/rooms.test.js`: spectating, adding and removing bots, a 4-bot game played to the end, and chat

## License

MIT. See [LICENSE](LICENSE).
