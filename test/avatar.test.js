// Avatars: only curated values are kept, and everyone in the room sees each other's cat. Run with: node --test
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const Avatar = require('../public/avatar.js');
const { actions, rooms, viewFor, config } = require('../server.js');

test('clean keeps known choices and replaces anything else with a default', () => {
  const av = Avatar.clean({ ears: 'fold', fur: 'black', pattern: 'calico', eye: 'javascript:alert(1)', mouth: '<b>', extra: { x: 1 }, toString: 'x' });
  assert.strictEqual(av.ears, 'fold');
  assert.strictEqual(av.fur, 'black');
  assert.strictEqual(av.pattern, 'calico');
  assert.strictEqual(av.eye, 'green');
  assert.strictEqual(av.mouth, 'smile');
  assert.strictEqual(av.extra, 'none');
  assert.deepStrictEqual(Object.keys(av).sort(), ['acc', 'ears', 'extra', 'eye', 'eyes', 'fur', 'inner', 'mouth', 'pat1', 'pat2', 'pattern']);
  for (const bad of [null, 'cat', 42, ['fold']]) assert.deepStrictEqual(Avatar.clean(bad), Avatar.clean({}));
  assert.strictEqual(Avatar.clean({ fur: 'constructor' }).fur, 'ginger', 'no inherited property names');
});

test('random cats and presets are always valid', () => {
  for (let i = 0; i < 200; i++) {
    const av = Avatar.random();
    assert.deepStrictEqual(Avatar.clean(av), av);
  }
  for (const p of Avatar.PRESETS) assert.deepStrictEqual(Avatar.clean(p.set), { ...Avatar.clean({}), ...p.set }, p.name);
});

test('every shape option has a group in the artwork', () => {
  const svg = fs.readFileSync(path.join(__dirname, '../public/art/avatar.svg'), 'utf8');
  for (const [part, { options }] of Object.entries(Avatar.PARTS))
    for (const opt of Object.keys(options))
      if (!(part === 'pattern' && opt === 'solid') && !(part === 'extra' && opt === 'none'))
        assert.ok(svg.includes(`class="${part}-${opt}"`), `${part}-${opt} missing from avatar.svg`);
});

test('avatars are cleaned on join, shown to everyone, changeable, and bots get one', () => {
  const { code } = actions.create({ name: 'A', avatar: { ears: 'tufted', fur: 'nope' } });
  actions.join({ code, name: 'B' }); // an older page that sends no avatar
  const room = rooms.get(code);
  const [a, b] = room.players;
  assert.strictEqual(a.avatar.ears, 'tufted');
  assert.strictEqual(a.avatar.fur, 'ginger');
  assert.deepStrictEqual(Avatar.clean(b.avatar), b.avatar, 'a random valid cat');

  actions.avatar({ avatar: { pattern: 'tuxedo', pat1: '#fff' } }, room, b);
  assert.strictEqual(b.avatar.pattern, 'tuxedo');
  assert.strictEqual(b.avatar.pat1, 'cinnamon');

  actions.addBot({}, room, a);
  assert.deepStrictEqual(Avatar.clean(room.players[2].avatar), room.players[2].avatar);

  actions.chat({ text: 'hi' }, room, a);
  const view = viewFor(room, b);
  assert.deepStrictEqual(view.players.map((p) => p.avatar), room.players.map((p) => p.avatar));
  assert.deepStrictEqual(view.chat[0].avatar, a.avatar);
  rooms.delete(code);
});

test('KAT_JOKE: only when switched on, anyone named Kat gets the photo, and nobody can pick it themselves', () => {
  const was = config.katJoke;
  try {
    config.katJoke = false;
    let { code } = actions.create({ name: 'Kat' });
    assert.strictEqual(rooms.get(code).players[0].avatar.photo, undefined, 'off by default');
    rooms.delete(code);

    config.katJoke = true;
    ({ code } = actions.create({ name: ' kat ', avatar: { fur: 'black' } }));
    actions.join({ code, name: 'Bob', avatar: { photo: 'kat' } });
    const room = rooms.get(code);
    const [kat, bob] = room.players;
    assert.strictEqual(kat.avatar.photo, 'kat');
    assert.strictEqual(bob.avatar.photo, undefined, 'a client cannot ask for the photo');
    actions.avatar({ avatar: { fur: 'white' } }, room, kat);
    assert.strictEqual(kat.avatar.photo, 'kat', 'kept after changing the cat');
    actions.avatar({ avatar: { photo: 'kat' } }, room, bob);
    assert.strictEqual(bob.avatar.photo, undefined);
    rooms.delete(code);
  } finally {
    config.katJoke = was;
  }
});
