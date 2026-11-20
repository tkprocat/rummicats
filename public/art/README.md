# Rummicats artwork

The game's drawings, one SVG per piece. Open and edit them in any design tool (Figma, Illustrator, Inkscape,
or a text editor) and reload the game to see the change. No build step.

| File | Where it shows up |
| --- | --- |
| `cat.svg` | The cat on every tile (all four fur colors and the rainbow wild cat) |
| `kitten.svg` | The kittens on the lobby card and the holiday decorations |
| `pumpkin.svg` | Halloween pumpkins |
| `sky.svg` | Halloween moon, stars and clouds |
| `present.svg` | Christmas presents |
| `tree.svg` | Christmas tree |
| `favicon.svg` | The browser tab icon. Shown as a plain image, so it has no class names and isn't recolored: edit its colors directly |

## Keep these class names

The game draws each file inline in the page, so the stylesheet (`public/style.css`) can recolor, animate and
hide parts of it **by class name**. You can change shapes, colors and add new parts freely, but keep the class on
anything that should keep its behaviour. A part without a class just keeps the colors from the file.

**Recolored by the game.** The color in the file is only a preview: the game picks the real one.

- `fur` (fill) and `fur-line` (stroke): the cat's fur color, from `--ginger`, `--midnight`, `--smoky` and
  `--pinky` at the top of `style.css`. Wild cats use the `rainbow` gradient defined in `cat.svg`.
- `hat-fill`: the wizard hat color, set per cat.
- `box` and `ribbon` (`present.svg`): set per present.
- On black (midnight) cats, `eye`, `mouth` and `inner` are swapped to the light versions in `style.css`.

**Shown, hidden or animated.**

- `cat.svg`: `hat` (Halloween wizard hat) and `santa` (Christmas hat) are hidden outside their theme.
- `kitten.svg`: `kithat` bounces when a kitten is poked; inside it, `wizard` or `santa` is shown.
- `pumpkin.svg`: `glow` is the flickering face (hidden on some pumpkins).
- `tree.svg`: every circle in `lights` blinks.
- `sky.svg`: `twinkle` stars twinkle, `cloud one` and `cloud two` drift at different speeds.

## Tips

- Keep the `viewBox` on the root `<svg>`. The game sets the size, so any `width`/`height` there is ignored.
- Save as plain SVG (Inkscape: "Plain SVG"; Illustrator: "SVG 1.1", styling as presentation attributes) so
  colors stay as `fill="…"` attributes rather than a `<style>` block, which would apply to the whole page.
- Ids (`rainbow`, `crescent`, `moonglow`) are shared by the whole page, so don't reuse them in another file.
