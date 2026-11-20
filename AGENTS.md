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
