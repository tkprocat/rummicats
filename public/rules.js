// Shared game rules, loaded by both the server (require) and the browser (<script>).
(function (exports) {
  const COLORS = ['ginger', 'midnight', 'smoky', 'pinky'];
  const COLOR_NAMES = { ginger: 'Ginger', midnight: 'Midnight', smoky: 'Smoky', pinky: 'Pinky' };
  // 106 tiles: 4 colors x 13 ranks x 2 copies, plus 2 jokers (wild cats).
  function makeTiles() {
    const tiles = [];
    for (let copy = 0; copy < 2; copy++)
      for (const color of COLORS)
        for (let rank = 1; rank <= 13; rank++) tiles.push({ id: tiles.length, color, rank, joker: false });
    tiles.push({ id: tiles.length, color: 'wild', rank: 0, joker: true });
    tiles.push({ id: tiles.length, color: 'wild', rank: 0, joker: true });
    return tiles;
  }
  const TILES = makeTiles();

  // Returns { ok, kind, values, reason } for an ordered list of tile ids.
  // values[i] is the rank each tile counts as (jokers take the rank they stand in for).
  function checkSet(ids) {
    const tiles = ids.map((id) => TILES[id]);
    if (tiles.length < 3) return { ok: false, reason: 'A set needs at least 3 cats' };
    const real = tiles.filter((t) => !t.joker);
    if (real.length === 0) return { ok: true, kind: 'group', values: tiles.map(() => 0) };

    // Group: same number, all different colors, 3 or 4 tiles.
    const sameRank = real.every((t) => t.rank === real[0].rank);
    const colorsDistinct = new Set(real.map((t) => t.color)).size === real.length;
    if (sameRank && colorsDistinct && tiles.length <= 4)
      return { ok: true, kind: 'group', values: tiles.map(() => real[0].rank) };

    // Run: same color, consecutive cats in order, no wrapping past 13.
    const sameColor = real.every((t) => t.color === real[0].color);
    if (sameColor) {
      const i0 = tiles.findIndex((t) => !t.joker);
      const start = tiles[i0].rank - i0;
      const fits = tiles.every((t, i) => t.joker || t.rank === start + i);
      if (fits && start >= 1 && start + tiles.length - 1 <= 13)
        return { ok: true, kind: 'run', values: tiles.map((_, i) => start + i) };
    }
    if (sameRank) return { ok: false, reason: 'A group needs different colors (max 4)' };
    if (sameColor) return { ok: false, reason: 'A run needs cats in order' };
    return { ok: false, reason: 'Not a run or a group' };
  }

  function setPoints(ids) {
    const r = checkSet(ids);
    return r.ok ? r.values.reduce((a, b) => a + b, 0) : 0;
  }

  function handPenalty(ids) {
    return ids.reduce((sum, id) => sum + (TILES[id].joker ? 30 : TILES[id].rank), 0);
  }

  // Validate a proposed table at the end of a turn.
  // oldTable/newTable: arrays of sets (arrays of ids). hand: ids in the player's hand at turn start.
  function checkTurn(oldTable, newTable, hand, hasMelded) {
    const oldIds = oldTable.flat();
    const newIds = newTable.flat();
    if (new Set(newIds).size !== newIds.length) return { ok: false, reason: 'A tile is on the table twice' };
    const newSet = new Set(newIds);
    if (!oldIds.every((id) => newSet.has(id))) return { ok: false, reason: 'Table cats cannot go back to your hand' };
    const oldSet = new Set(oldIds);
    const handSet = new Set(hand);
    const played = newIds.filter((id) => !oldSet.has(id));
    if (!played.every((id) => handSet.has(id))) return { ok: false, reason: 'You played a tile you do not have' };
    if (played.length === 0) return { ok: false, reason: 'Play at least one cat, or draw' };
    for (const s of newTable) {
      const r = checkSet(s);
      if (!r.ok) return { ok: false, reason: r.reason };
    }
    if (!hasMelded) {
      // First meld: 30+ points from your own tiles, without touching the sets already out.
      const oldKeys = new Set(oldTable.map((s) => s.join(',')));
      let points = 0;
      for (const s of newTable) {
        if (oldKeys.has(s.join(','))) continue;
        if (!s.every((id) => handSet.has(id)))
          return { ok: false, reason: 'Your first meld must use only your own cats' };
        points += setPoints(s);
      }
      if (points < 30) return { ok: false, reason: `First meld needs 30 points (you have ${points})` };
    }
    return { ok: true, played };
  }

  Object.assign(exports, { COLORS, COLOR_NAMES, TILES, checkSet, setPoints, handPenalty, checkTurn });
})(typeof module !== 'undefined' ? module.exports : (window.Rules = {}));
