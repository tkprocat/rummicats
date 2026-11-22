// Getting into a room (create or join, with your name remembered in this browser) and the waiting room before a
// game: seats, bots, and the host's timer and glow settings, which live on the server so everyone sees them.
import { $, store } from './dom.js';
import { api, setSession } from './api.js';
import { myAvatar } from './avatarEditor.js';
import { S } from './state.js';

export function renderLobby() {
  const seated = S.you >= 0;
  document.querySelector('#waiting .code').textContent = S.code;
  $('waiting').classList.toggle('hidden', S.started);
  for (const id of ['startBtn', 'timerPick', 'idlePick', 'glowPick', 'addBotBtn']) $(id).classList.toggle('hidden', !S.isHost);
  $('glowSel').checked = S.glow;
  // The host's timer picks live on the server, so they show in everyone's rules and survive a refresh.
  for (const [id, value] of [['timerSel', S.turnLimit], ['idleSel', S.idleLimit]])
    if (document.activeElement !== $(id)) $(id).value = String(value || 0);
  $('addBotBtn').disabled = S.players.length >= 4;
  $('seatBtn').textContent = seated ? '👀 Watch instead' : '🪑 Take a seat';
  $('seatBtn').disabled = !seated && S.players.length >= 4;
  $('startBtn').disabled = S.players.length < 2;
  $('waitMsg').textContent = !S.isHost ? 'Waiting for the host to start…'
    : S.players.length < 2 ? 'Needs at least 2 players: invite friends or add bots.' : '';
}

// connect: app.js's function that opens the room once we have a seat (or a place watching) in it.
export function initLobby(connect) {
  $('createBtn').onclick = async () => {
    try {
      const r = await api('create', { name: $('name').value, avatar: myAvatar() });
      setSession(r.code, r.token);
      connect();
    } catch (e) { $('lobbyErr').textContent = e.message; }
  };
  $('joinBtn').onclick = async () => {
    const code = $('codeInput').value.trim().toUpperCase();
    try {
      const r = await api('join', { code, name: $('name').value, avatar: myAvatar() });
      setSession(r.code, r.token);
      connect();
    } catch (e) { $('lobbyErr').textContent = e.message; }
  };
  $('codeInput').onkeydown = (e) => { if (e.key === 'Enter') $('joinBtn').click(); };
  $('name').value = store.get('name') || '';
  $('name').onchange = () => store.set('name', $('name').value);

  // The waiting room. Errors show under the Start button.
  const waitErr = (e) => ($('waitMsg').textContent = e.message);
  $('startBtn').onclick = () => api('start', { timer: $('timerSel').value, idle: $('idleSel').value, glow: $('glowSel').checked }).catch(waitErr);
  for (const [id, key] of [['timerSel', 'timer'], ['idleSel', 'idle']])
    $(id).onchange = () => api('settings', { [key]: $(id).value }).catch(waitErr);
  $('glowSel').onchange = () => api('settings', { glow: $('glowSel').checked }).catch(waitErr);
  $('addBotBtn').onclick = () => api('addBot').catch(waitErr);
  $('seatBtn').onclick = () => api('spectate').catch(waitErr);
}
