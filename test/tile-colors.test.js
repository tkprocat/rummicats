const test = require('node:test');
const assert = require('node:assert/strict');
const { COLORS, COLOR_NAMES, TILES } = require('../public/rules.js');

test('tile color names match the palette while saved tile IDs remain stable', () => {
  const colors = [
    ['ginger', 'Orange'], ['midnight', 'Black'], ['smoky', 'Blue'], ['pinky', 'Red'],
  ];
  assert.deepEqual(COLORS, colors.map(([key]) => key));
  for (const [index, [key, name]] of colors.entries()) {
    assert.equal(COLOR_NAMES[key], name);
    for (const copy of [0, 1]) {
      for (let rank = 1; rank <= 13; rank++) {
        const id = copy * 52 + index * 13 + rank - 1;
        assert.deepEqual(TILES[id], { id, color: key, rank, joker: false });
      }
    }
  }
  assert.deepEqual(TILES.slice(104).map((tile) => [tile.id, tile.color, tile.joker]),
    [[104, 'wild', true], [105, 'wild', true]]);
});
