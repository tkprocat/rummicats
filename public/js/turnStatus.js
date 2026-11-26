import { $ } from './dom.js';

// The rack shadow follows the server's turn state, independently of notifications.
export function renderTurnStatus(state) {
  const mine = !!state?.started && !state.over && state.you >= 0 && state.turn === state.you;
  $('hand').classList.toggle('myTurn', mine);
}
