// Which cats a turn placed and moved, as shown to everyone watching. Run with: node --test
const test = require('node:test');
const assert = require('node:assert');
const { turnChanges } = require('../public/changes.js');

const check = (before, after, placed, moved) => {
  const r = turnChanges(before, after);
  assert.deepStrictEqual([...r.placed].sort((a, b) => a - b), placed, 'placed');
  assert.deepStrictEqual([...r.moved].sort((a, b) => a - b), moved, 'moved');
};

test('nothing changed: nothing marked', () => {
  check([[1, 2, 3], [4, 5, 6]], [[1, 2, 3], [4, 5, 6]], [], []);
  check([], [], [], []);
});

test('cats from the paws are placed, and the cats they push along are not moved', () => {
  check([[1, 2, 3]], [[1, 2, 3, 9]], [9], []); // added at the end
  check([[1, 2, 3]], [[9, 1, 2, 3]], [9], []); // added at the front: everything shifts, nothing moved
  check([[1, 2, 3]], [[1, 2, 3], [7, 8, 9]], [7, 8, 9], []); // a new set
});

test('cats taken from one set into another are moved, the rest of their set is not', () => {
  check([[1, 2, 3, 4], [5, 6, 7]], [[1, 2, 3], [4, 5, 6, 7]], [], [4]);
  // A set can also be reordered on the table so it pairs up the other way: still only the cat that left moves.
  check([[5, 6, 7], [1, 2, 3, 4]], [[4, 5, 6, 7], [1, 2, 3]], [], [4]);
});

test('splitting a set moves the smaller part, and sets can trade places in the list', () => {
  check([[1, 2, 3, 4, 5, 6, 7]], [[1, 2, 3, 4], [5, 6, 7]], [], [5, 6, 7]);
  check([[1, 2, 3], [4, 5, 6]], [[4, 5, 6], [1, 2, 3]], [], []); // only the list order changed
});

test('a cat out of order within its own set is moved', () => {
  check([[1, 2, 3, 4]], [[1, 3, 2, 4]], [], [2]);
});

test('putting things back clears the marks', () => {
  const start = [[1, 2, 3, 4], [5, 6, 7]];
  check(start, [[1, 2, 3], [4, 5, 6, 7]], [], [4]);
  check(start, [[1, 2, 3, 4], [5, 6, 7]], [], []);
});

test('a whole set broken up and merged elsewhere: every cat is moved', () => {
  check([[1, 2, 3], [4, 5, 6], [7, 8, 9]], [[1, 2, 3, 7], [4, 5, 6, 8, 9]], [], [7, 8, 9]);
});
