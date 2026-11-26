# Repository purpose

- Rummicats is a browser-based Rummikub game for two to four players, including bots. Rooms also support spectators and chat.

# Tech stack

- Use Node.js 18 or newer. The application has no runtime dependencies or frontend build step.
- The server uses Node's HTTP APIs and Server-Sent Events. The client uses HTML, CSS, and JavaScript ES modules.
- Tests use Node's built-in `node:test` runner. The Docker image uses Node 24 Alpine.

# Architecture

- Organize new code by capability. Use folders and `index.js` entry points where they give a capability a clear public interface. Split functionality, settings, and constants into focused files when that improves isolation.
- Use CommonJS for server code and tests. The browser client uses ES modules; preserve its existing module loading.
- Keep game rules in `public/rules.js` shared between the server and browser. Preserve both loading paths when changing its exports. `public/avatar.js` also serves both environments.
- Treat the server as the authority for room state and moves. Validate client input on the server, and route bot moves through the same rule checks as player moves.
- Keep each player's hand private: server views may include the recipient's hand, but must not expose other hands to players or spectators.
- Preserve the SVG class names and IDs used by the game when editing artwork. See `public/art/README.md` for the artwork contract.

# User interface

- Avoid introducing unexpected layout shifts when changing the interface, including as content loads or game state changes.
- Preserve a clear overview of the board and players' paws. Do not add interface elements that obscure them or make them harder to see or use.
- Treat the available playing viewport as a scarce resource, especially on mobile. Prefer existing surfaces and controls over additional status rows, fixed bars, or reserved indicator space.
- Design important gameplay feedback for players returning their attention to the game, including use on a secondary monitor. The current state must remain understandable without witnessing its transition.
- Place gameplay feedback where players look while playing: the board, paws, and relevant controls. Evaluate its visibility at realistic scroll positions.
- Evaluate mobile independently: player cards may be offscreen and desktop artwork may be hidden.
- Prefer static gameplay indicators. Avoid repeating attention animations; any necessary motion should be brief and respect reduced-motion preferences.
- Preserve the game's soft, cat-themed visual character. Reuse established colors, materials, artwork, and components when introducing feedback.
- Keep visual meanings distinct for turn ownership, selection, recent changes, placement targets, and keyboard focus. Review related indicators together before adding another highlight treatment.
- Keep feedback restrained. Prefer improving an existing element over accumulating redundant labels, decorations, outlines, or glows.

# Validation

- Run `npm test` after code changes. CI runs the suite on Node 18 and 24 and builds the Docker image for pull requests.
- Start the app with `npm start` and open `http://localhost:3000` to check changes that affect the browser. Exercise the changed flow, including multiple players or a spectator when relevant.
- Build the image with `docker build -t rummicats .` when changing the Dockerfile or files copied into the image.
- Report checks you ran and any checks you could not run. There are no configured lint, type-check, or frontend build commands.

# Testing

- Add or update tests for changed game rules, server actions, bot decisions, and other behavior that the Node test runner can exercise. Cover rejected input and boundary cases when relevant.
- Keep rule changes compatible with the recorded game in `test/replay.test.js`; update its expectations only when the intended rules change.
- For bot changes, run the existing full-game tests and check that bot moves pass the shared rules.

# Pull requests

- Keep each pull request focused on its intended change. Describe the behavior changed and why, and note any user-visible or deployment impact.
- Describe the final implemented changes, their purpose, and relevant design constraints. Omit abandoned approaches and unchanged features. Keep the title and description aligned with the final diff as the implementation evolves.
