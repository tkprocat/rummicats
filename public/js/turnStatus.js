import { $ } from './dom.js';

// Turn feedback stays on the play surfaces and controls, independent of notifications.
export function renderTurnStatus(state) {
  const mine = !!state?.started && !state.over && state.you >= 0 && state.turn === state.you;
  const text = !state?.started ? 'Waiting to start'
    : state.over ? 'Game over'
    : mine ? 'Your turn' : `${state.players[state.turn].name}'s turn`;
  for (const id of ['turnStatus', 'turnLabel']) {
    const el = $(id);
    if (el.textContent !== text) el.textContent = text;
    el.title = text;
    el.classList.toggle('myTurn', mine);
  }
  const hand = $('hand');
  hand.classList.toggle('myTurn', mine);
  hand.dataset.turnLabel = text;
  const rackLabel = hand.querySelector('.turnEdge span');
  if (rackLabel) rackLabel.textContent = text;
  $('tableArea').classList.toggle('myTurn', mine);
}
