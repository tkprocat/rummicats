// The game page: the connection to the room, and one render() that redraws every part of the screen from the
// latest state. The parts live in their own modules:
//   state.js  what the server last told us       turn.js   my moves during my turn
//   lobby.js  joining and the waiting room        board.js  the table, status, turn buttons and pile
//   players.js who's in the room                  paws.js   my rack and its sorting
//   win.js    the winner popup and New game       plus chat, rules, themes, compact mode, pinned paws and alerts
import { $, flash } from './dom.js';
import { S, setState, myTurn } from './state.js';
import { session, setSession, savedToken } from './api.js';
import { artReady } from './art.js';
import { initAvatarEditor } from './avatarEditor.js';
import { setRedraw, syncWork, initTurn } from './turn.js';
import { renderBoard } from './board.js';
import { syncPaws, renderPaws, initPaws } from './paws.js';
import { isDragging } from './drag.js';
import { initTheme } from './theme.js';
import { renderWin, initWin } from './win.js';
import { renderPlayers } from './players.js';
import { renderLobby, initLobby } from './lobby.js';
import { initNotify, notifyTurn } from './notify.js';
import { initChat, renderChat } from './chat.js';
import { renderRules } from './roomRules.js';
import { initCompact } from './compact.js';
import { initPin } from './pin.js';

let events = null;
let clockSkew = 0; // server time minus local time

// ---- Connection ----

function connect() {
  if (events) events.close();
  $('lobby').classList.add('hidden');
  $('game').classList.remove('hidden');
  history.replaceState(null, '', `?room=${session.code}`);
  // Tiles are drawn from the artwork, so wait for it before the first state arrives.
  artReady.then(listen, (e) => showLobbyError(e.message));
}

function listen() {
  if (events) events.close();
  events = new EventSource(`/events?code=${session.code}&token=${session.token}`);
  events.onmessage = (e) => {
    setState(JSON.parse(e.data));
    clockSkew = S.now - Date.now();
    syncPaws();
    syncWork();
    render();
    renderChat(S); // separate from render(), which waits while you drag a cat
    renderRules(S);
    notifyTurn(S, myTurn());
  };
  events.onerror = () => {
    if (events.readyState === EventSource.CLOSED) showLobbyError('Lost the room. It may have expired.');
  };
}

function showLobbyError(msg) {
  $('game').classList.add('hidden');
  $('lobby').classList.remove('hidden');
  $('lobbyErr').textContent = msg;
}

// ---- Drawing ----

// Every redraw rebuilds the players, table and rack, and text above them can change length (say when you
// pick up a cat), which on a phone moves what you were looking at. Keep the paws where they were on screen
// if any of them were in view, otherwise the table, so picking up several cats doesn't send you scrolling back.
// Pinned paws stay on screen by themselves, so then it's the table that's held still.
function holdScroll() {
  const inView = (el) => {
    const r = el.getBoundingClientRect();
    return r.height > 0 && r.bottom > 0 && r.top < innerHeight;
  };
  const pinned = getComputedStyle($('dock')).position === 'sticky';
  const order = pinned ? [$('tableArea'), $('hand')] : [$('hand'), $('tableArea')];
  const anchor = order.find(inView);
  if (!anchor) return () => {};
  const top = anchor.getBoundingClientRect().top;
  return () => {
    const shift = anchor.getBoundingClientRect().top - top;
    if (shift) window.scrollBy(0, shift);
  };
}

function render() {
  if (!S) return;
  if (isDragging()) return; // redrawn on drop
  const restoreScroll = holdScroll();
  $('roomCode').textContent = S.code;
  renderPlayers();
  renderLobby();

  // Which parts of the game screen show: the table once the game starts, and the paws and turn buttons only
  // for players (spectators have no rack and no turn).
  const seated = S.you >= 0;
  for (const id of ['status', 'tableArea']) $(id).classList.toggle('hidden', !S.started);
  for (const id of ['controls', 'handBar', 'hand']) $(id).classList.toggle('hidden', !S.started || !seated);
  $('turnDot').classList.toggle('hidden', !myTurn());

  renderWin();
  renderBoard();
  renderPaws();

  tick();

  $('log').innerHTML = '';
  for (const line of [...S.log].reverse()) {
    const li = document.createElement('li');
    li.textContent = line;
    $('log').appendChild(li);
  }
  restoreScroll();
}

// Turn and idle countdowns, redrawn on their own between server updates. The idle one starts again on every move.
function tick() {
  const el = $('timer');
  el.innerHTML = '';
  if (!S) return;
  const countdown = (ends, icon, title) => {
    if (!ends) return;
    const left = Math.max(0, Math.ceil((ends - (Date.now() + clockSkew)) / 1000));
    const span = document.createElement('span');
    span.textContent = `${icon} ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    span.title = title;
    span.classList.toggle('low', left <= 15);
    el.appendChild(span);
  };
  countdown(S.turnEnds, '⏰', 'Time left this turn');
  countdown(S.idleEnds, '💤', 'Move a cat before this runs out, or the turn is skipped');
}
setInterval(tick, 250);

// ---- Buttons and keys ----

window.addEventListener('resize', render);
$('copyLink').onclick = () => {
  const link = `${location.origin}${location.pathname}?room=${session.code}`;
  navigator.clipboard?.writeText(link).then(() => flash('Invite link copied!'), () => flash(link));
};

// ---- Start up ----

setRedraw(render);
initTurn();
initPaws(render);
initLobby(connect);
initTheme();
initCompact(render);
initPin();
initWin();
initNotify();
initChat();
initAvatarEditor();
artReady.catch((e) => ($('lobbyErr').textContent = `${e.message}. Try reloading the page.`));

// Rejoin a room after a refresh, or prefill an invite link.
const roomParam = new URLSearchParams(location.search).get('room');
if (roomParam) {
  const code = roomParam.toUpperCase();
  const token = savedToken(code);
  if (token) { setSession(code, token); connect(); }
  else $('codeInput').value = code;
}
