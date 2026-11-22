// What a turn has changed on the table so far, so everyone can follow it: which cats were placed from the
// player's paws, and which cats already on the table were moved. Shared with Node for the tests, like rules.js.
(function (exports) {
  // before: the table at the start of the turn. after: the table now (the player's draft). Both are lists of
  // sets of tile ids. Returns { placed, moved }, two Sets of tile ids.
  //
  // Placed: on the table now but not at the start, so it came from the player's paws. Only cats that are on the
  // table show up, so nothing is given away about the paws themselves.
  // Moved: on the table at the start, but in a different set now, or out of order within its set. Cats that just
  // shift along because another cat went in or came out next to them don't count.
  function turnChanges(before, after) {
    const home = new Map(); // tile id -> [starting set, position in it]
    before.forEach((set, s) => set.forEach((id, i) => home.set(id, [s, i])));

    // Pair each set now with the starting set it shares the most cats with, biggest overlaps first, so a set
    // that was split or extended still counts as the same set. Each starting set pairs at most once.
    const overlaps = [];
    after.forEach((set, a) => {
      const counts = new Map();
      for (const id of set) if (home.has(id)) counts.set(home.get(id)[0], (counts.get(home.get(id)[0]) || 0) + 1);
      for (const [b, n] of counts) overlaps.push([n, a, b]);
    });
    overlaps.sort((x, y) => y[0] - x[0] || x[1] - y[1] || x[2] - y[2]);
    const pairOf = new Map(); // set now -> starting set
    const paired = new Set();
    for (const [, a, b] of overlaps) {
      if (pairOf.has(a) || paired.has(b)) continue;
      pairOf.set(a, b);
      paired.add(b);
    }

    const placed = new Set();
    const moved = new Set();
    after.forEach((set, a) => {
      const stayed = []; // [id, old position] for cats still in their starting set, in their order now
      for (const id of set) {
        if (!home.has(id)) placed.add(id);
        else if (home.get(id)[0] !== pairOf.get(a)) moved.add(id);
        else stayed.push([id, home.get(id)[1]]);
      }
      // The longest run that kept its order stays put; any other cat in the set was moved within it.
      const keep = longestInOrder(stayed.map(([, i]) => i));
      stayed.forEach(([id], k) => { if (!keep.has(k)) moved.add(id); });
    });
    return { placed, moved };
  }

  // Indexes of one longest strictly increasing subsequence of xs (fine for sets of at most 13 cats).
  function longestInOrder(xs) {
    const len = xs.map(() => 1);
    const prev = xs.map(() => -1);
    for (let k = 0; k < xs.length; k++)
      for (let j = 0; j < k; j++)
        if (xs[j] < xs[k] && len[j] + 1 > len[k]) { len[k] = len[j] + 1; prev[k] = j; }
    let end = -1;
    for (let k = 0; k < xs.length; k++) if (end < 0 || len[k] > len[end]) end = k;
    const keep = new Set();
    for (let k = end; k >= 0; k = prev[k]) keep.add(k);
    return keep;
  }

  Object.assign(exports, { turnChanges });
})(typeof module !== 'undefined' ? module.exports : (window.Changes = {}));
