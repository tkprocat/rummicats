// The table area: the status line, whose turn it is, the sets on the table (the draft while someone plays), the
// turn buttons and the draw pile. The moves themselves live in turn.js; this only draws them.
import { $ } from './dom.js';
import { avatarSvg } from './art.js';
import { S, myTurn } from './state.js';
import { work, selected, tableChanged, canUndo, moveTo, onTileClick, redrawPage, reorderGroups } from './turn.js';
import { tileEl } from './tile.js';
import { startBoardDrag, startBoardSelection } from './drag.js';
import { wrapLongSets } from './setWrap.js';

const { checkSet, checkTurn } = window.Rules;
const { turnChanges } = window.Changes;

export function renderBoard() {
  const mine = myTurn();
  // Glows go out once I start changing the table on my turn, like they do for everyone watching.
  const glowing = S.glow && !tableChanged();
  const playedIds = new Set(mine ? work.table.flat().filter((id) => S.hand.includes(id)) : []);
  const moved = mine && (playedIds.size > 0 || tableChanged());
  renderStatus();
  renderTurnCat();
  renderTable(mine, glowing);
  renderControls(mine, playedIds, moved);
  renderPile(mine);
}

function renderStatus() {
  if (S.over) {
    // Names come from other players, so they only ever go in as text.
    const scores = S.over.scores.map((x) => `${x.name}: ${x.penalty}`).join(' · ');
    $('status').innerHTML = '🏆 <span></span> wins! <small></small>';
    $('status').querySelector('span').textContent = S.over.winner;
    $('status').querySelector('small').textContent = `(cats left in paws, lower is better: ${scores})`;
  }
}

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

function renderTable(mine, glowing) {
  const tableData = mine ? work.table : S.draft || S.table;
  // What this turn has changed so far, for the player and everyone watching. Gone once the turn ends.
  const changes = S.started && !S.over ? turnChanges(S.table, tableData) : { placed: new Set(), moved: new Set() };
  const tb = $('table');
  tb.innerHTML = '';
  $('tableArea').classList.toggle('watching', !mine && !!S.draft);
  tb.classList.toggle('picking', mine && selected.length > 0);
  const displayed = tableData;
  displayed.forEach((set, s) => {
    const position = s;
    const group = document.createElement('div');
    group.className = 'boardGroup';
    if (mine && displayed.length > 1) {
      group.classList.add('reorderable');
      group.title = 'Drag the edge of the group to reorder the board.';
      group.onpointerdown = (e) => startBoardDrag(group, e, (target) => {
        if (Number.isInteger(target)) {
          let destination = target;
          if (destination > position) destination--;
          reorderGroups(position, destination);
        }
        redrawPage();
      }, selected.length > 0);
    }
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
      const t = tileEl(id, { placed: changes.placed.has(id), moved: changes.moved.has(id) });
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
    group.appendChild(el);
    if (mine && displayed.length > 1) {
      for (const edge of ['top', 'bottom']) {
        const handle = document.createElement('div');
        handle.className = `groupEdge ${edge}`;
        handle.setAttribute('aria-hidden', 'true');
        group.appendChild(handle);
      }
    }
    tb.appendChild(group);
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
  wrapLongSets(tb); // long runs wrap onto rows on a narrow screen
}

// Which turn buttons work right now, and the hint beside them.
function renderControls(mine, playedIds, moved) {
  const check = mine ? checkTurn(S.table, work.table, S.hand, S.hasMelded) : { ok: false };
  $('doneBtn').disabled = !mine || !check.ok;
  $('doneBtn').title = check.ok ? '' : check.reason || '';
  $('undoBtn').disabled = !mine || JSON.stringify(work.table) === JSON.stringify(S.table);
  $('undoMoveBtn').disabled = !mine || !canUndo();
  $('drawBtn').disabled = !mine;
  $('drawBtn').textContent = (moved ? 'Undo & ' : '') + (S.pool ? (moved ? 'draw' : 'Draw & end turn') : (moved ? 'pass' : 'Pass'));
  $('drawBtn').title = 'Ends your turn. Anything you moved goes back.';
  if (mine && S.hasMelded && work.hand.some((id) => !S.hand.includes(id))) {
    $('meldInfo').textContent = 'Play the wild cat you swapped off the table in a set, then press Done.';
  } else {
    $('meldInfo').textContent = mine && S.hasMelded && !check.ok && playedIds.size ? check.reason : '';
  }
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
