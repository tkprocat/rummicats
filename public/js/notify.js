// Your-turn notifications, remembered in this browser. Only sent while you're tabbed away.
import { $, store } from './dom.js';

const canNotify = 'Notification' in window && window.isSecureContext;
let notifyOn = false;
let notifiedTurn = null; // turnId we last sent a notification for

function setNotify(on) {
  notifyOn = on;
  store.set('notify', on ? 'on' : 'off');
  const btn = $('notifyBtn');
  btn.textContent = on ? '🔔 Your-turn alerts: on' : '🔕 Your-turn alerts: off';
  if (!canNotify) { btn.disabled = true; btn.title = 'Notifications need https or localhost'; }
  else if (Notification.permission === 'denied') btn.title = 'Notifications are blocked for this site in your browser settings';
}

export function initNotify() {
  setNotify(canNotify && Notification.permission === 'granted' && store.get('notify') === 'on');
  $('notifyBtn').onclick = async () => {
    if (notifyOn) return setNotify(false);
    if (Notification.permission !== 'granted') await Notification.requestPermission();
    setNotify(Notification.permission === 'granted');
  };
}

// Call on every state update; notifies once per turn of mine.
export function notifyTurn(state, mine) {
  if (!mine || notifiedTurn === state.turnId) return;
  notifiedTurn = state.turnId;
  if (!notifyOn || (document.hasFocus() && !document.hidden)) return; // you're already looking
  try {
    const n = new Notification('Rummicats: your turn! 🐾', { body: `Room ${state.code}. The cats are waiting for you.`, tag: 'rummicats-turn' });
    n.onclick = () => { window.focus(); n.close(); };
  } catch (e) {}
}
