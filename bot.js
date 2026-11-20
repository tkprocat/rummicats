// Computer players ("medium" strength). chooseMove() looks only at the table and the bot's own hand, never at
// other hands or the draw pile, and returns the table it wants to leave, or null to draw a cat instead.
// The server checks a bot's move exactly like a human's, so a mistake here can't break the rules.
//
// What a bot does on its turn:
//   1. Before its first meld: the most cats it can put down from its own hand in new sets worth 30+ points.
//   2. After that: frees wild cats from the table when it holds the cat they stand for, puts down the best
//      combination of new sets from its hand, adds single cats to the ends of sets on the table, and splits a
//      long run to make room for a duplicate cat.
// It never takes table sets apart beyond that (no big rearrangements). That would be the next level up.
const { TILES, COLORS, checkSet, checkTurn } = require('./public/rules.js');

const NODE_LIMIT = 20000; // cap on the set-combination search, so a turn always takes a few ms at most
const key = (color, rank) => color + rank;

// Every set the hand could make on its own, as a layout of color+rank keys (null = a wild cat goes here).
// count: how many of each key the hand holds. jokers: how many wild cats it holds.
function candidateSets(count, jokers) {
  const has = (c, r) => (count.get(key(c, r)) || 0) > 0;
  const out = [];
  // Runs: every color, start and length, with wild cats filling the gaps.
  for (const c of COLORS) {
    for (let start = 1; start <= 11; start++) {
      const layout = [];
      let missing = 0;
      for (let r = start; r <= 13; r++) {
        if (has(c, r)) layout.push(key(c, r));
        else { layout.push(null); missing++; }
        if (missing > jokers) break;
        const len = r - start + 1;
        if (len >= 3 && missing < len) out.push({ layout: [...layout], points: ((start + r) * len) / 2 });
      }
    }
  }
  // Groups: every number, any 1-4 of the colors held, topped up to 3 or 4 with wild cats.
  for (let r = 1; r <= 13; r++) {
    const colors = COLORS.filter((c) => has(c, r));
    for (let mask = 1; mask < 1 << colors.length; mask++) {
      const real = colors.filter((_, i) => mask & (1 << i)).map((c) => key(c, r));
      for (let j = 0; j <= jokers && real.length + j <= 4; j++) {
        if (real.length + j >= 3) out.push({ layout: [...real, ...Array(j).fill(null)], points: r * (real.length + j) });
      }
    }
  }
  // Longest sets first, so the first answers the search finds are already good ones.
  return out.sort((a, b) => b.layout.length - a.layout.length || b.points - a.points);
}

// The combination of new sets from these tiles that puts down the most cats (then the most points),
// worth at least minPoints in total. Returns a list of sets of tile ids, or null if there is none.
function bestSets(ids, minPoints = 0) {
  const count = new Map();
  let jokers = 0;
  for (const id of ids) {
    const t = TILES[id];
    if (t.joker) jokers++;
    else count.set(key(t.color, t.rank), (count.get(key(t.color, t.rank)) || 0) + 1);
  }
  const cands = candidateSets(count, jokers);
  const fits = (c) => c.layout.every((k) => k === null || count.get(k) > 0) && c.layout.filter((k) => k === null).length <= jokers;
  const use = (c, d) => { for (const k of c.layout) { if (k === null) jokers += d; else count.set(k, count.get(k) + d); } };

  let best = null, bestTiles = 0, bestPoints = 0, nodes = 0;
  const chosen = [];
  (function search(from, tiles, points) {
    if (++nodes > NODE_LIMIT) return;
    if (points >= minPoints && tiles > 0 && (tiles > bestTiles || (tiles === bestTiles && points > bestPoints))) {
      best = [...chosen]; bestTiles = tiles; bestPoints = points;
    }
    for (let i = from; i < cands.length && nodes <= NODE_LIMIT; i++) {
      const c = cands[i];
      if (!fits(c)) continue;
      use(c, -1);
      chosen.push(c);
      search(i, tiles + c.layout.length, points + c.points); // i, not i + 1: a hand can hold the same set twice
      chosen.pop();
      use(c, +1);
    }
  })(0, 0, 0);
  if (!best) return null;

  // Turn the layouts back into real tile ids.
  const byKey = new Map();
  const wild = [];
  for (const id of ids) {
    const t = TILES[id];
    if (t.joker) wild.push(id);
    else (byKey.get(key(t.color, t.rank)) || byKey.set(key(t.color, t.rank), []).get(key(t.color, t.rank))).push(id);
  }
  return best.map((c) => c.layout.map((k) => (k === null ? wild.shift() : byKey.get(k).shift())));
}

const takeOut = (list, id) => list.splice(list.indexOf(id), 1);

// Swap wild cats on the table for the real cats they stand for, taking the wild cats into `left`.
function freeWildCats(table, left) {
  for (const set of table) {
    for (let i = 0; i < set.length; i++) {
      if (!TILES[set[i]].joker) continue;
      const cat = left.find((id) => !TILES[id].joker && checkSet(set.map((x, k) => (k === i ? id : x))).ok);
      if (cat == null) continue;
      left.push(set[i]);
      set[i] = cat;
      takeOut(left, cat);
    }
  }
}

// Add single cats from `left` to either end of a table set (real cats first, wild cats last).
function layOff(table, left) {
  let placed = false;
  for (const id of [...left].sort((a, b) => TILES[a].joker - TILES[b].joker)) {
    for (const set of table) {
      const longer = [[...set, id], [id, ...set]].find((s) => checkSet(s).ok);
      if (!longer) continue;
      set.splice(0, set.length, ...longer);
      takeOut(left, id);
      placed = true;
      break;
    }
  }
  return placed;
}

// Fit a duplicate cat into a long run by splitting it there: 3 4 5 6 7 + 5  ->  3 4 5 and 5 6 7.
function splitRuns(table, left) {
  let placed = false;
  for (const id of [...left]) {
    const t = TILES[id];
    if (t.joker) continue;
    for (const set of table) {
      const r = checkSet(set);
      if (r.kind !== 'run' || set.length < 5) continue;
      const i = r.values.indexOf(t.rank);
      const head = set.slice(0, i + 1);
      const tail = [id, ...set.slice(i + 1)];
      if (i < 0 || !checkSet(head).ok || !checkSet(tail).ok) continue;
      set.splice(0, set.length, ...head);
      table.push(tail);
      takeOut(left, id);
      placed = true;
      break;
    }
  }
  return placed;
}

function afterMeld(oldTable, hand, freeWild) {
  const table = oldTable.map((s) => [...s]);
  const left = [...hand];
  if (freeWild) freeWildCats(table, left);
  for (const set of bestSets(left) || []) {
    table.push(set);
    set.forEach((id) => takeOut(left, id));
  }
  while (layOff(table, left) || splitRuns(table, left));
  return table;
}

function firstMeld(oldTable, hand) {
  const sets = bestSets(hand, 30);
  return sets && [...oldTable.map((s) => [...s]), ...sets];
}

// The bot's move: the table it wants to leave (checked with the same rules as a human's move), or null to draw.
function chooseMove(table, hand, hasMelded) {
  const plans = hasMelded ? [() => afterMeld(table, hand, true), () => afterMeld(table, hand, false)] : [() => firstMeld(table, hand)];
  for (const plan of plans) {
    const next = plan();
    if (next && checkTurn(table, next, hand, hasMelded).ok) return next;
  }
  return null;
}

// Cat names for bots, so a table of bots is easy to tell apart.
const BOT_NAMES = ['Whiskers', 'Mittens', 'Biscuit', 'Noodle', 'Pepper', 'Mochi', 'Socks', 'Ziggy'];

module.exports = { chooseMove, bestSets, BOT_NAMES };
