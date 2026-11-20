// Custom cat avatars, shared by the server (require) and the browser (<script>).
// An avatar is a small object of choices, e.g. { ears: 'fold', pattern: 'tabby', fur: 'ginger', ... }.
// Colors are names from a curated palette (never raw CSS), and the server keeps only values on these lists,
// so whatever a client sends is safe to draw for everyone else.
(function (exports) {
  // Shapes. The first option is the default. Each one is a group in public/art/avatar.svg named <part>-<option>.
  const PARTS = {
    ears: { label: 'Ears', options: { pointy: 'Pointy', round: 'Round', fold: 'Folded', tufted: 'Lynx tufts' } },
    eyes: { label: 'Eyes', options: { round: 'Round', big: 'Sparkly', sleepy: 'Sleepy', happy: 'Happy', wink: 'Wink' } },
    mouth: { label: 'Mouth', options: { smile: 'Smile', w: ':3', open: 'Meow', blep: 'Blep' } },
    pattern: {
      label: 'Pattern',
      options: {
        solid: 'Solid', tabby: 'Tabby', tuxedo: 'Tuxedo', points: 'Siamese points', calico: 'Calico',
        tortie: 'Tortoiseshell', spotted: 'Spotted', patch: 'Eye patch', split: 'Split face',
      },
    },
    extra: { label: 'Extra', options: { none: 'None', bow: 'Bow', flower: 'Flower', glasses: 'Glasses', collar: 'Bell collar', crown: 'Crown' } },
  };

  // How many pattern colors each pattern uses (pat1, then pat2).
  const PATTERN_COLORS = { solid: 0, tabby: 1, tuxedo: 1, points: 1, calico: 2, tortie: 2, spotted: 1, patch: 1, split: 1 };

  // Curated palettes. `dark` marks fur where face lines and whiskers are drawn light instead of dark.
  const FUR = {
    white: { label: 'White', hex: '#fbf8f2' },
    cream: { label: 'Cream', hex: '#f3e2c4' },
    apricot: { label: 'Apricot', hex: '#f4b673' },
    ginger: { label: 'Ginger', hex: '#ef8a2b' },
    sand: { label: 'Sand', hex: '#d3b088' },
    cinnamon: { label: 'Cinnamon', hex: '#a8653a', dark: true },
    chocolate: { label: 'Chocolate', hex: '#5e3d2c', dark: true },
    silver: { label: 'Silver', hex: '#c4c7cc' },
    grey: { label: 'Grey', hex: '#8f9299' },
    blue: { label: 'Blue', hex: '#7d8fa8' },
    charcoal: { label: 'Charcoal', hex: '#4a4a52', dark: true },
    black: { label: 'Black', hex: '#2a2a33', dark: true },
    lilac: { label: 'Lilac', hex: '#c3b1d3' },
    pinky: { label: 'Pinky', hex: '#e45c93' },
  };
  const EYE = {
    green: { label: 'Green', hex: '#7cc35a' },
    yellow: { label: 'Yellow', hex: '#e8c33a' },
    amber: { label: 'Amber', hex: '#e0912a' },
    copper: { label: 'Copper', hex: '#c0602a' },
    blue: { label: 'Blue', hex: '#5aa9e6' },
    aqua: { label: 'Aqua', hex: '#4fc4b8' },
    violet: { label: 'Violet', hex: '#9a7ad6' },
    brown: { label: 'Brown', hex: '#7a4e2d' },
  };
  const INNER = {
    pink: { label: 'Pink', hex: '#ffc4c4' },
    rose: { label: 'Rose', hex: '#ef8fa3' },
    peach: { label: 'Peach', hex: '#f6c2a0' },
    brown: { label: 'Brown', hex: '#8a5a48' },
    black: { label: 'Black', hex: '#3a2f2c' },
  };
  const ACC = {
    red: { label: 'Red', hex: '#d8322f' },
    orange: { label: 'Orange', hex: '#ef8a2b' },
    yellow: { label: 'Yellow', hex: '#ffd84a' },
    green: { label: 'Green', hex: '#3fae5a' },
    blue: { label: 'Blue', hex: '#3f7fd8' },
    purple: { label: 'Purple', hex: '#8a5cc8' },
    pink: { label: 'Pink', hex: '#e45c93' },
    black: { label: 'Black', hex: '#2c2c36' },
  };

  // Color slots: which palette each uses and its default.
  const COLORS = {
    fur: { label: 'Fur', palette: FUR, default: 'ginger' },
    pat1: { label: 'Pattern color', palette: FUR, default: 'cinnamon' },
    pat2: { label: 'Second pattern color', palette: FUR, default: 'black' },
    eye: { label: 'Eye color', palette: EYE, default: 'green' },
    inner: { label: 'Nose & inner ears', palette: INNER, default: 'pink' },
    acc: { label: 'Extra color', palette: ACC, default: 'red' },
  };

  // Is this color slot used by this avatar? (Unused ones are hidden in the editor.)
  function usesColor(av, key) {
    if (key === 'pat1') return PATTERN_COLORS[av.pattern] >= 1;
    if (key === 'pat2') return PATTERN_COLORS[av.pattern] >= 2;
    if (key === 'acc') return av.extra !== 'none';
    return true;
  }

  // One-click breeds: they set the coat (and sometimes ears or eyes) and keep the rest of your choices.
  const PRESETS = [
    { name: 'Orange tabby', set: { fur: 'ginger', pattern: 'tabby', pat1: 'cinnamon', eye: 'amber', inner: 'pink' } },
    { name: 'Tuxedo', set: { fur: 'black', pattern: 'tuxedo', pat1: 'white', eye: 'yellow', inner: 'pink' } },
    { name: 'Siamese', set: { fur: 'cream', pattern: 'points', pat1: 'chocolate', eye: 'blue', inner: 'brown', ears: 'pointy' } },
    { name: 'Calico', set: { fur: 'white', pattern: 'calico', pat1: 'ginger', pat2: 'black', eye: 'green', inner: 'pink' } },
    { name: 'Tortie', set: { fur: 'black', pattern: 'tortie', pat1: 'ginger', pat2: 'apricot', eye: 'copper', inner: 'black' } },
    { name: 'Black cat', set: { fur: 'black', pattern: 'solid', eye: 'yellow', inner: 'black' } },
    { name: 'Russian Blue', set: { fur: 'blue', pattern: 'solid', eye: 'green', inner: 'rose' } },
    { name: 'Bengal', set: { fur: 'sand', pattern: 'spotted', pat1: 'chocolate', eye: 'green', inner: 'brown' } },
    { name: 'Scottish Fold', set: { fur: 'silver', pattern: 'tabby', pat1: 'charcoal', eye: 'copper', inner: 'rose', ears: 'fold' } },
    { name: 'Lynx', set: { fur: 'sand', pattern: 'spotted', pat1: 'cinnamon', eye: 'amber', inner: 'brown', ears: 'tufted' } },
  ];

  const pick = (list, rnd) => list[Math.floor(rnd() * list.length)];

  // Keep only known values; anything missing or unknown becomes the default.
  function clean(raw) {
    if (!raw || typeof raw !== 'object') raw = {};
    const av = {};
    for (const [key, part] of Object.entries(PARTS))
      av[key] = Object.hasOwn(part.options, raw[key]) ? raw[key] : Object.keys(part.options)[0];
    for (const [key, slot] of Object.entries(COLORS))
      av[key] = Object.hasOwn(slot.palette, raw[key]) ? raw[key] : slot.default;
    return av;
  }

  const applyPreset = (av, preset) => clean({ ...av, ...preset.set });

  // A random cat: usually a real breed, sometimes anything goes, with random face and extras.
  function random(rnd = Math.random) {
    const av = {};
    for (const [key, part] of Object.entries(PARTS)) av[key] = pick(Object.keys(part.options), rnd);
    for (const [key, slot] of Object.entries(COLORS)) av[key] = pick(Object.keys(slot.palette), rnd);
    if (rnd() < 0.6) av.extra = 'none';
    return rnd() < 0.75 ? applyPreset(av, pick(PRESETS, rnd)) : clean(av);
  }

  // Colors for drawing: CSS variables for the artwork, including light or dark lines to suit the fur.
  function cssVars(av) {
    const hex = (key) => COLORS[key].palette[av[key]].hex;
    const ink = (dark) => (dark ? '#f6eee2' : '#2b2420');
    // The mouth sits on the muzzle, which some patterns color with the pattern color.
    const muzzle = av.pattern === 'tuxedo' || av.pattern === 'points' ? av.pat1 : av.fur;
    return {
      fur: hex('fur'), pat1: hex('pat1'), pat2: hex('pat2'), eye: hex('eye'), inner: hex('inner'), acc: hex('acc'),
      'face-ink': ink(FUR[av.fur].dark),
      'muzzle-ink': ink(FUR[muzzle].dark),
      whisker: FUR[av.fur].dark ? '#ffffffaa' : '#00000040',
    };
  }

  Object.assign(exports, { PARTS, COLORS, PATTERN_COLORS, PRESETS, usesColor, clean, applyPreset, random, cssVars });
})(typeof module !== 'undefined' ? module.exports : (window.Avatar = {}));
