// What the server last told us about the room, and questions about it. Every part of the screen reads it;
// only the connection in app.js replaces it (other modules can read an exported let, but not assign to it).
export let S = null;
export function setState(next) { S = next; }

// Is it my turn right now?
export const myTurn = () => !!S && S.started && !S.over && S.turn === S.you;
