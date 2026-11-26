import { $ } from './dom.js';

// Turn ownership stays explicit beside the controls, independent of notifications.
export function renderTurnStatus(state) {
  const mine = !!state?.started && !state.over && state.you >= 0 && state.turn === state.you;
  const text = !state?.started ? 'Waiting to start'
    : state.over ? 'Game over'
    : mine ? 'Your turn' : `${state.players[state.turn].name}'s turn`;
  const el = $('turnLabel');
  if (el.textContent !== text) el.textContent = text;
  el.title = text;
  el.classList.toggle('myTurn', mine);
}
