// The game screen: state from the server, my moves during my turn, and drawing it all.
// Self-contained pieces live in their own modules (artwork, rack layout, dragging, themes, win screen, alerts).
import { $, store, flash } from './dom.js';
import { S, setState, myTurn } from './state.js';
import { session, setSession, savedToken, api } from './api.js';
import { artReady, avatarSvg } from './art.js';
import { myAvatar, openAvatarEditor, initAvatarEditor } from './avatarEditor.js';
import { rack, cols, keepOnly, dropInRack, setCols, fitRack, sortByColor, sortByRank, SORTS, autoSort, setAutoSort } from './rack.js';
import { work, selected, setRedraw, syncWork, shownSet, tableChanged, canUndo, pickTile, arrange, moveTo, onTileClick, initTurn } from './turn.js';
import { tileEl } from './tile.js';
import { renderBoard } from './board.js';
import { isDragging, startHandDrag, startBoardSelection, initHandDrag } from './drag.js';
import { wrapLongSets } from './setWrap.js';
import { initTheme } from './theme.js';
import { showWin, hideWin, initWin } from './win.js';
import { initNotify, notifyTurn } from './notify.js';
import { initChat, renderChat } from './chat.js';
import { renderRules } from './roomRules.js';
import { initCompact } from './compact.js';

const { TILES, COLOR_NAMES, checkSet, checkTurn, setPoints } = window.Rules;
const { turnChanges } = window.Changes;

let events = null;
let clockSkew = 0; // server time minus local time
let celebrated = null; // room code whose win we have already announced
let prevHand = null; // my hand in the last state, to spot cats I just drew
let lastDrawn = []; // cats I drew last time my hand changed; they glow on a sorted rack

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

// Cats that showed up in my hand were drawn. Any other change (a play, a new game) clears them.
// Cats that left my hand leave a gap on the rack; new ones get a slot when the rack is drawn.
function syncPaws() {
  const before = prevHand;
  prevHand = S.hand;
  if (!before || before.join() !== S.hand.join()) {
    const old = new Set(before || []);
    lastDrawn = before && before.length ? S.hand.filter((id) => !old.has(id)) : [];
  }
  keepOnly(new Set(S.hand));
}

// ---- Drawing ----

// Every redraw rebuilds the players, table and rack, and text above them can change length (say when you
// pick up a cat), which on a phone moves what you were looking at. Keep the paws where they were on screen
// if any of them were in view, otherwise the table, so picking up several cats doesn't send you scrolling back.
function holdScroll() {
  const inView = (el) => {
    const r = el.getBoundingClientRect();
    return r.height > 0 && r.bottom > 0 && r.top < innerHeight;
  };
  const anchor = [$('hand'), $('tableArea')].find(inView);
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
  document.querySelector('#waiting .code').textContent = S.code;

  const pl = $('players');
  pl.innerHTML = '';
  S.players.forEach((p, i) => {
    const d = document.createElement('div');
    d.className = 'player' + (S.started && S.turn === i && !S.over ? ' turn' : '') + (p.online ? '' : ' off');
    d.innerHTML = `<span class="pav">${avatarSvg(p.avatar, 36)}</span><div>` +
      `${p.bot ? '🤖 ' : ''}<span class="n"></span>${i === S.you ? ' (you)' : ''}<br>` +
      (S.started ? `${p.count} cats${p.melded ? '' : ' · not melded'}` : p.host ? 'host' : p.bot ? 'bot' : '') +
      (S.started && i !== S.you ? `<div class="minirack">${'<i></i>'.repeat(Math.min(p.count, 30))}</div>` : '') + '</div>';
    d.querySelector('.n').textContent = p.name;
    if (i === S.you) { // tap your own cat to change it
      const pav = d.querySelector('.pav');
      pav.classList.add('mine');
      pav.title = 'Change your cat';
      pav.setAttribute('role', 'button');
      pav.tabIndex = 0;
      pav.onclick = openAvatarEditor;
      pav.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openAvatarEditor(); } };
    }
    if (p.bot && S.isHost && !S.started) {
      const kick = document.createElement('button');
      kick.className = 'small kick';
      kick.textContent = '✕';
      kick.title = `Remove ${p.name}`;
      kick.onclick = () => api('removeBot', { seat: i }).catch((e) => ($('waitMsg').textContent = e.message));
      d.appendChild(kick);
    }
    pl.appendChild(d);
  });

  // People watching instead of playing, each with their cat (names from other people, so text only)
  const sp = $('spectators');
  sp.classList.toggle('hidden', !S.spectators.length);
  sp.textContent = '👀 Watching: ';
  S.spectators.forEach((s, k) => {
    const w = document.createElement('span');
    w.className = 'watcher';
    w.innerHTML = avatarSvg(s.avatar, 20);
    w.append(`${s.name}${s.host ? ' (host)' : ''}${k < S.spectators.length - 1 ? ',' : ''}`);
    sp.appendChild(w);
  });
  if (S.you < 0) sp.append(' (you are watching)');

  const seated = S.you >= 0;
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
  for (const id of ['status', 'tableArea']) $(id).classList.toggle('hidden', !S.started);
  // Spectators have no rack and no turn
  for (const id of ['controls', 'handBar', 'hand']) $(id).classList.toggle('hidden', !S.started || !seated);
  $('turnDot').classList.toggle('hidden', !myTurn());

  if (!S.over && celebrated) {
    // The host set up a new game: put the winner away, so the next win gets its own celebration.
    celebrated = null;
    hideWin();
  }
  $('againBtn').classList.toggle('hidden', !(S.over && S.isHost));
  if (S.over && celebrated !== S.code) {
    celebrated = S.code;
    const me = S.players[S.you];
    showWin(S.over, !!me && me.name === S.over.winner, S.isHost);
  }

  renderBoard();

  // Rack: tiers of slots, and gaps stay wherever you leave them
  const mine = myTurn();
  const glowing = S.glow && !tableChanged();
  const hd = $('hand');
  const shown = shownSet();
  const slotW = parseFloat(getComputedStyle(hd).getPropertyValue('--tile-w')) + 4; // cat width + gap, from the CSS
  setCols(Math.max(6, Math.floor((hd.clientWidth - 16) / slotW)));
  $('autoSort').value = autoSort; // auto-sort turns itself off when you move a cat, so keep the dropdown in step
  if (SORTS[autoSort]) SORTS[autoSort](shown);
  fitRack(shown);
  hd.innerHTML = '';
  hd.classList.toggle('picking', mine && selected.length > 0);
  hd.classList.toggle('returning', mine && selected.some((id) => !work.hand.includes(id)));
  for (let r = 0; r < rack.length / cols; r++) {
    const tier = document.createElement('div');
    tier.className = 'tier';
    for (let i = r * cols; i < (r + 1) * cols; i++) {
      const slot = document.createElement('div');
      slot.className = 'slot';
      slot.dataset.i = i;
      const id = rack[i];
      if (id != null && shown.has(id)) {
        const t = tileEl(id);
        if (!S.hand.includes(id)) t.classList.add('borrowed'); // a wild cat swapped off the table this turn
        // On a sorted rack a drawn cat lands somewhere in the middle, so show where.
        if (glowing && SORTS[autoSort] && lastDrawn.includes(id)) t.classList.add('glow');
        t.onclick = (e) => onTileClick(id, e);
        t.onpointerdown = (e) => startHandDrag(id, t, e, myTurn());
        slot.appendChild(t);
      } else {
        slot.onclick = (e) => { e.stopPropagation(); if (myTurn()) moveTo({ where: 'hand', slot: i }); };
      }
      tier.appendChild(slot);
    }
    hd.appendChild(tier);
  }

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

// Lobby
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

// Game
$('startBtn').onclick = () => api('start', { timer: $('timerSel').value, idle: $('idleSel').value, glow: $('glowSel').checked }).catch((e) => ($('waitMsg').textContent = e.message));
for (const [id, key] of [['timerSel', 'timer'], ['idleSel', 'idle']])
  $(id).onchange = () => api('settings', { [key]: $(id).value }).catch((e) => ($('waitMsg').textContent = e.message));
$('glowSel').onchange = () => api('settings', { glow: $('glowSel').checked }).catch((e) => ($('waitMsg').textContent = e.message));
const playAgain = () => api('again').then(hideWin, (e) => flash(e.message));
$('againBtn').onclick = playAgain;
$('winAgain').onclick = playAgain;
$('addBotBtn').onclick = () => api('addBot').catch((e) => ($('waitMsg').textContent = e.message));
$('seatBtn').onclick = () => api('spectate').catch((e) => ($('waitMsg').textContent = e.message));
$('hand').onclick = () => myTurn() && moveTo({ where: 'hand' });
window.addEventListener('resize', render);
$('copyLink').onclick = () => {
  const link = `${location.origin}${location.pathname}?room=${session.code}`;
  navigator.clipboard?.writeText(link).then(() => flash('Invite link copied!'), () => flash(link));
};
// One-off sorts for people who'd rather arrange their own cats afterwards. They turn auto-sort off,
// so the next draw doesn't re-sort the rack the other way.
$('sortColor').onclick = () => { setAutoSort('off'); sortByColor(shownSet()); render(); };
$('sortRank').onclick = () => { setAutoSort('off'); sortByRank(shownSet()); render(); };
$('autoSort').value = autoSort;
$('autoSort').onchange = (e) => { setAutoSort(e.target.value); render(); };

// ---- Start up ----

initHandDrag((id, slot) => {
  if (slot != null) {
    setAutoSort('off');
    dropInRack(id, slot, shownSet());
  }
  render();
}, (id, el, select) => {
  if (!myTurn()) return;
  pickTile(id, select);
  el.classList.toggle('selected', select);
}, () => {
  render();
});
setRedraw(render);
initTurn();
initTheme();
initCompact(render);
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
