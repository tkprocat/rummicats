// The game screen: state from the server, my moves during my turn, and drawing it all.
// Self-contained pieces live in their own modules (artwork, rack layout, dragging, themes, win screen, alerts).
import { $, store } from './dom.js';
import { session, setSession, savedToken, api } from './api.js';
import { artReady, catSvg, avatarSvg } from './art.js';
import { myAvatar, openAvatarEditor, initAvatarEditor } from './avatarEditor.js';
import { rack, cols, keepOnly, dropInRack, setCols, fitRack, sortByColor, sortByRank } from './rack.js';
import { isDragging, startHandDrag, startBoardSelection, initHandDrag } from './drag.js';
import { initTheme } from './theme.js';
import { showWin, initWin } from './win.js';
import { initNotify, notifyTurn } from './notify.js';
import { initChat, renderChat } from './chat.js';
import { renderRules } from './roomRules.js';

const { TILES, COLOR_NAMES, checkSet, checkTurn, setPoints } = window.Rules;

let S = null; // latest state from the server
let work = null; // { table, hand } my local edits during my turn
let workTurnId = null;
let undoStack = []; // earlier copies of work this turn, for Undo move
let selected = []; // tile ids picked up, in the order they were tapped
let events = null;
let clockSkew = 0; // server time minus local time
let celebrated = null; // room code whose win we have already announced
let prevHand = null; // my hand in the last state, to spot cats I just drew
let lastDrawn = []; // cats I drew last time my hand changed; they glow on a sorted rack

// Auto-sort: keep the rack in color or number order, so drawn cats land in place instead of at the end.
// Moving a cat to a slot yourself turns it off, since a sorted rack would undo the move.
const SORTS = { color: sortByColor, rank: sortByRank };
let autoSort = SORTS[store.get('autoSort')] ? store.get('autoSort') : 'off';
function setAutoSort(mode) {
  autoSort = SORTS[mode] ? mode : 'off';
  store.set('autoSort', autoSort);
  $('autoSort').value = autoSort;
}

function tileEl(id, opts = {}) {
  const t = TILES[id];
  const el = document.createElement('div');
  el.className = `tile c-${t.color}`;
  el.dataset.id = id;
  el.title = t.joker ? 'Wild cat (joker)' : `${COLOR_NAMES[t.color]} ${t.rank}`;
  el.innerHTML = `${catSvg()}<span class="rank">${t.joker ? '★' : t.rank}</span>`;
  if (selected.includes(id)) el.classList.add('selected');
  if (opts.fresh) el.classList.add('fresh');
  return el;
}

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
    S = JSON.parse(e.data);
    clockSkew = S.now - Date.now();
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

// ---- My turn: a working copy of the table and my hand ----

const myTurn = () => S && S.started && !S.over && S.turn === S.you;

function syncWork() {
  // Cats that showed up in my hand were drawn. Any other change (a play, a new game) clears them.
  const before = prevHand;
  prevHand = S.hand;
  if (!before || before.join() !== S.hand.join()) {
    const old = new Set(before || []);
    lastDrawn = before && before.length ? S.hand.filter((id) => !old.has(id)) : [];
  }
  // Cats that left my hand leave a gap; new ones get a slot when the rack is drawn.
  keepOnly(new Set(S.hand));
  if (!myTurn() || workTurnId !== S.turnId) resetWork();
}

function resetWork() {
  work = { table: S.table.map((s) => [...s]), hand: [...S.hand] };
  workTurnId = S.turnId;
  undoStack = [];
  selected = [];
}

// Cats on my rack right now. Cats put on the table this turn are not shown,
// but keep their slot in case they come back.
const shownSet = () => new Set(myTurn() ? work.hand : S.hand);

// Where a tile currently sits in my working copy.
function locate(id) {
  const h = work.hand.indexOf(id);
  if (h >= 0) return { where: 'hand', i: h };
  for (let s = 0; s < work.table.length; s++) {
    const i = work.table[s].indexOf(id);
    if (i >= 0) return { where: 'table', s, i };
  }
  return null;
}

function removeTile(id) {
  const loc = locate(id);
  if (loc.where === 'hand') work.hand.splice(loc.i, 1);
  else work.table[loc.s].splice(loc.i, 1);
  return loc;
}

// Put cats in an order that makes a valid set, if one exists: by number, with wild cats tried in every slot.
function arrange(ids) {
  const real = ids.filter((id) => !TILES[id].joker).sort((a, b) => TILES[a].rank - TILES[b].rank);
  const wild = ids.filter((id) => TILES[id].joker);
  const tryAll = (seq, left) => {
    if (!left.length) return checkSet(seq).ok ? seq : null;
    for (let i = 0; i <= seq.length; i++) {
      const found = tryAll([...seq.slice(0, i), left[0], ...seq.slice(i)], left.slice(1));
      if (found) return found;
    }
    return null;
  };
  return tryAll(real, wild);
}

const byRank = (ids) => [...ids].sort((a, b) => (TILES[a].joker ? 99 : TILES[a].rank) - (TILES[b].joker ? 99 : TILES[b].rank));

const saveUndo = () => undoStack.push({ table: work.table.map((s) => [...s]), hand: [...work.hand] });

// Move every picked-up cat to the target in one go (one step for Undo move).
function moveTo(target) {
  if (!selected.length) return;
  const ids = selected;
  if (target.where === 'hand') {
    const back = ids.filter((id) => !work.hand.includes(id));
    if (!back.every((id) => S.hand.includes(id))) return flash("Cats from the table can't go back to your paws");
    if (!back.length && target.slot == null) return; // already in your paws
    if (back.length) {
      saveUndo();
      back.forEach((id) => removeTile(id));
      work.hand.push(...back);
      work.table = work.table.filter((x) => x.length);
      pushDraft();
    }
    // Without a slot, cats go back to the slot they came from (or a free one when the rack is drawn).
    // With auto-sort on, cats coming back from the table just take their sorted place.
    if (target.slot != null && !(back.length && SORTS[autoSort])) {
      if (!back.length) setAutoSort('off');
      ids.forEach((id, k) => dropInRack(id, target.slot + k, shownSet()));
    }
    selected = [];
    return render();
  }
  saveUndo();
  if (target.newSet) {
    ids.forEach((id) => removeTile(id));
    work.table.push(arrange(ids) || byRank(ids));
  } else {
    const set = work.table[target.s];
    // Remember the cat right after the gap, since taking cats out shifts positions.
    const anchor = set.slice(target.i).find((id) => !ids.includes(id));
    ids.forEach((id) => removeTile(id));
    set.splice(anchor == null ? set.length : set.indexOf(anchor), 0, ...byRank(ids));
    const fixed = !checkSet(set).ok && arrange(set);
    if (fixed) set.splice(0, set.length, ...fixed);
  }
  work.table = work.table.filter((x) => x.length);
  selected = [];
  pushDraft();
  render();
}

function undoMove() {
  const prev = undoStack.pop();
  if (!prev || !myTurn()) return;
  // The rack keeps the player's own arrangement; returning cats find their old slot.
  work.table = prev.table;
  work.hand = prev.hand;
  selected = [];
  pushDraft();
  render();
}

// Send my moves so the other players can watch (debounced).
let draftTimer = null;
function pushDraft() {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => api('draft', { table: work.table }).catch(() => {}), 150);
}

function flash(msg) {
  $('gameErr').textContent = msg;
  clearTimeout(flash.t);
  flash.t = setTimeout(() => ($('gameErr').textContent = ''), 4000);
}

function onTileClick(id, e) {
  e.stopPropagation();
  if (!myTurn()) return;
  if (TILES[id].joker && selected.length === 1 && selected[0] !== id && swapWild(selected[0], id)) return;
  selected = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
  render();
}

// With one cat picked up, tapping a wild cat on the table that it can stand in for swaps them:
// the cat takes the wild cat's place and the wild cat comes to your paws, picked up, to be played elsewhere this turn.
function swapWild(cat, wild) {
  const at = locate(wild);
  if (at.where !== 'table' || TILES[cat].joker || work.table[at.s].includes(cat)) return false;
  const set = work.table[at.s];
  if (!checkSet(set.map((x) => (x === wild ? cat : x))).ok) return false;
  if (!S.hasMelded && S.table.some((s) => s.includes(wild))) {
    flash("You can take a wild cat from the table only after your first meld. Make your 30 points first, then swap it on a later turn.");
    return true;
  }
  saveUndo();
  removeTile(cat);
  set[set.indexOf(wild)] = cat;
  work.table = work.table.filter((x) => x.length);
  work.hand.push(wild);
  selected = [wild];
  pushDraft();
  render();
  flash('Swapped! The wild cat is in your paws. Play it in a set before you press Done.');
  return true;
}

// ---- Drawing ----

// Whose turn it is, as a big cat beside the board (shown only when the table is wide enough, see style.css).
// After the game, the winner sits there instead. Redrawn only when it changes, so the hop plays once per turn.
function renderTurnCat() {
  const box = $('turnCat');
  const i = !S.started ? -1 : S.over ? S.players.findIndex((p) => p.name === S.over.winner) : S.turn;
  const p = S.players[i];
  const key = p ? JSON.stringify([i, p.name, p.avatar, !!S.over, p.online]) : '';
  if (box.dataset.key === key) return;
  box.dataset.key = key;
  box.innerHTML = '';
  if (!p) return;
  const you = i === S.you;
  box.className = (S.over ? 'won' : you ? 'mine' : '') + (p.online ? '' : ' off');
  box.innerHTML = `<div class="tcAv">${avatarSvg(p.avatar, 112)}</div><div class="tcName"></div><div class="tcSub"></div>`;
  box.querySelector('.tcName').textContent = (p.bot ? '🤖 ' : '') + p.name + (you ? ' (you)' : '');
  box.querySelector('.tcSub').textContent = S.over ? '🏆 Winner!' : you ? 'Your turn!'
    : !p.online ? 'Away…' : p.bot ? 'Thinking…' : 'Playing…';
  box.classList.add('hop');
}

// The draw pile: a messy heap of face-down cats that shrinks as it's drawn from.
function renderPile(mine) {
  const heap = document.querySelector('#pile .heap');
  heap.innerHTML = '';
  const n = Math.min(30, Math.ceil(S.pool / 3));
  for (let k = 0; k < n; k++) {
    const rnd = (j) => { const x = Math.sin(k * 12.9898 + j * 78.233) * 43758.5453; return x - Math.floor(x); };
    const a = rnd(1) * Math.PI * 2;
    const r = Math.sqrt(rnd(2));
    const b = document.createElement('i');
    b.style.left = `${50 + Math.cos(a) * r * 34}%`;
    b.style.top = `${50 + Math.sin(a) * r * 30}%`;
    b.style.transform = `translate(-50%, -50%) rotate(${Math.round(rnd(3) * 180)}deg)`;
    heap.appendChild(b);
  }
  document.querySelector('#pile .pileCount').textContent = S.pool ? `${S.pool} left` : 'pile empty';
  $('pile').classList.toggle('can', mine);
  $('pile').title = mine ? $('drawBtn').textContent : `${S.pool} cats left to draw`;
}

function pickedText() {
  const n = selected.length;
  const set = n >= 3 && arrange(selected);
  return `${n === 1 ? '1 cat' : n + ' cats'} picked up${set ? ` (a valid set worth ${setPoints(set)})` : ''}. ` +
    'Tap more cats to add them, or tap the empty spot, a gap, or your paws to put them down.';
}

function render() {
  if (!S) return;
  if (isDragging()) return; // redrawn on drop
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

  const mine = myTurn();
  // Glows go out once I start changing the table on my turn, like they do for everyone watching.
  const glowing = S.glow && !(mine && JSON.stringify(work.table) !== JSON.stringify(S.table));
  const playedIds = new Set(mine ? work.table.flat().filter((id) => S.hand.includes(id)) : []);
  const moved = mine && (playedIds.size > 0 || JSON.stringify(work.table) !== JSON.stringify(S.table));
  if (S.over) {
    // Names come from other players, so they only ever go in as text.
    const scores = S.over.scores.map((x) => `${x.name}: ${x.penalty}`).join(' · ');
    $('status').innerHTML = '🏆 <span></span> wins! <small></small>';
    $('status').querySelector('span').textContent = S.over.winner;
    $('status').querySelector('small').textContent = `(cats left in paws, lower is better: ${scores})`;
    if (celebrated !== S.code) {
      celebrated = S.code;
      const me = S.players[S.you];
      showWin(S.over, !!me && me.name === S.over.winner);
    }
  } else if (mine) {
    $('status').textContent = selected.length ? pickedText()
      : playedIds.size ? 'Press Done when every set is valid, or Undo & draw to give up this turn.'
      : 'Your turn! Play at least one cat from your paws, or draw a cat to end your turn.';
  } else if (S.started) {
    $('status').textContent = `Watching ${S.players[S.turn].name}'s turn…`;
  }

  renderTurnCat();

  // Table
  const tableData = mine ? work.table : S.draft || S.table;
  const tb = $('table');
  tb.innerHTML = '';
  $('tableArea').classList.toggle('watching', !mine && !!S.draft);
  tb.classList.toggle('picking', mine && selected.length > 0);
  tableData.forEach((set, s) => {
    const r = checkSet(set);
    const el = document.createElement('div');
    el.className = 'set ' + (r.ok ? 'valid' : 'invalid');
    const gap = (i) => {
      const g = document.createElement('div');
      g.className = 'gap';
      g.onclick = (e) => { e.stopPropagation(); moveTo({ where: 'table', s, i }); };
      return g;
    };
    set.forEach((id, i) => {
      el.appendChild(gap(i));
      const t = tileEl(id, { fresh: playedIds.has(id) });
      if (glowing && S.lastPlayed.includes(id)) t.classList.add('glow'); // played last turn
      t.onclick = (e) => onTileClick(id, e);
      t.onpointerdown = (e) => startBoardSelection(id, t, e, myTurn());
      el.appendChild(t);
    });
    el.appendChild(gap(set.length));
    if (!r.ok) {
      const why = document.createElement('span');
      why.className = 'why';
      why.textContent = r.reason;
      el.appendChild(why);
    }
    tb.appendChild(el);
  });
  if (mine) {
    const ns = document.createElement('div');
    ns.className = 'newset';
    ns.textContent = selected.length ? '+ start a new set here' : 'empty spot';
    ns.onclick = (e) => { e.stopPropagation(); moveTo({ where: 'table', newSet: true }); };
    tb.appendChild(ns);
  } else if (!tableData.length) {
    tb.innerHTML = '<div class="newset">The table is empty</div>';
  }

  // Rack: tiers of slots, and gaps stay wherever you leave them
  const hd = $('hand');
  const shown = shownSet();
  const slotW = matchMedia('(max-width: 600px)').matches ? 52 : 62; // tile width + gap
  setCols(Math.max(6, Math.floor((hd.clientWidth - 16) / slotW)));
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

  // Controls
  const check = mine ? checkTurn(S.table, work.table, S.hand, S.hasMelded) : { ok: false };
  $('doneBtn').disabled = !mine || !check.ok;
  $('doneBtn').title = check.ok ? '' : check.reason || '';
  $('undoBtn').disabled = !moved;
  $('undoMoveBtn').disabled = !mine || !undoStack.length;
  $('drawBtn').disabled = !mine;
  $('drawBtn').textContent = (moved ? 'Undo & ' : '') + (S.pool ? (moved ? 'draw' : 'Draw & end turn') : (moved ? 'pass' : 'Pass'));
  $('drawBtn').title = 'Ends your turn. Anything you moved goes back.';
  if (mine && !S.hasMelded) {
    const pts = work.table.filter((s) => s.every((id) => S.hand.includes(id))).reduce((a, s) => a + setPoints(s), 0);
    $('meldInfo').textContent = `First meld: ${pts} / 30 points (each cat is worth its number)`;
  } else if (mine && work.hand.some((id) => !S.hand.includes(id))) {
    $('meldInfo').textContent = 'Play the wild cat you swapped off the table in a set, then press Done.';
  } else {
    $('meldInfo').textContent = mine && !check.ok && playedIds.size ? check.reason : '';
  }
  renderPile(mine);

  tick();

  $('log').innerHTML = '';
  for (const line of [...S.log].reverse()) {
    const li = document.createElement('li');
    li.textContent = line;
    $('log').appendChild(li);
  }
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
$('addBotBtn').onclick = () => api('addBot').catch((e) => ($('waitMsg').textContent = e.message));
$('seatBtn').onclick = () => api('spectate').catch((e) => ($('waitMsg').textContent = e.message));
$('doneBtn').onclick = () => api('commit', { table: work.table }).catch((e) => flash(e.message));
$('undoMoveBtn').onclick = undoMove;
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.target.closest('input, select')) {
    e.preventDefault();
    undoMove();
  }
  if (e.key === 'Escape' && selected.length && !e.target.closest('input, select')) {
    selected = [];
    render();
  }
});
$('undoBtn').onclick = () => { resetWork(); pushDraft(); render(); };
$('drawBtn').onclick = () => { resetWork(); api('draw').catch((e) => flash(e.message)); };
$('hand').onclick = () => myTurn() && moveTo({ where: 'hand' });
$('pile').onclick = () => myTurn() && $('drawBtn').click();
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
  if (select && !selected.includes(id)) selected.push(id);
  if (!select) selected = selected.filter((x) => x !== id);
  el.classList.toggle('selected', select);
}, () => {
  render();
});
initTheme();
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
