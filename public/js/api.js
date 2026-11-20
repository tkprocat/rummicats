// Talking to the server: the player's session and the POST /api/<action> calls.
import { store } from './dom.js';

// Which room I'm in and my secret token for it. Remembered per room so a refresh rejoins the game.
export const session = { code: null, token: null };

export function setSession(code, token) {
  session.code = code;
  session.token = token;
  store.set(code, token);
}

export const savedToken = (code) => store.get(code);

export async function api(action, body = {}) {
  const res = await fetch(`/api/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...session, ...body }),
  });
  // A server that doesn't know this action (e.g. still running older code) answers with plain text, not JSON.
  const data = await res.json().catch(() => {
    throw new Error(res.status === 404 ? 'The server doesn\'t support this yet. It may need a restart.' : `Server error (${res.status})`);
  });
  if (!data.ok) throw new Error(data.error);
  return data;
}
