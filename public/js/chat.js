// Room chat: a panel on the right that collapses to a tab, for the lobby and the game alike.
// Messages come from other people, so they only ever go into the page as text, never as HTML.
import { $, store } from './dom.js';
import { api } from './api.js';
import { avatarSvg } from './art.js';

const EMOJI = {
  '🐱': ['😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾', '🐱', '🐈', '🐈‍⬛', '🐾', '🐟', '🧶', '🥛'],
  '😀': ['😀', '😂', '🤣', '😅', '😊', '😍', '🥰', '😘', '🤔', '🤨', '😏', '🙃', '😬', '😱', '😭', '😤',
    '😡', '😎', '🥳', '🤯', '😴', '🥺', '😇', '🤭', '🫣', '🤐', '🙄', '😵‍💫', '🤓', '😈'],
  '👍': ['👍', '👎', '👏', '🙌', '🙏', '💪', '👋', '🤞', '✌️', '🫶', '🤝', '👀', '🫡', '🤷'],
  '🎉': ['🎉', '🔥', '💯', '⭐', '✨', '🏆', '🥇', '🎲', '🃏', '⏰', '💤', '❤️', '💔', '🍀', '🎯', '💩',
    '🎃', '👻', '🎄', '🎁', '❄️', '☕', '🍕', '🍪'],
};
const RECENT_MAX = 16;
const MAX_CHARS = 200; // the server's limit, counting an emoji like 👩‍👩‍👧 as one character

let lastId = 0; // newest message drawn
let seenId = 0; // newest message read with the panel open (remembered per room)
let messages = [];
let code = null;

const isOpen = () => document.body.classList.contains('chatOpen');

// A message of only emoji is shown big with no bubble, like in most chat apps. A long one wraps onto more lines.
const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|[\u{1F3FB}-\u{1F3FF}\u{E0020}-\u{E007F}\u200D\uFE0F\u20E3\s])+$/u;
const segmenter = new Intl.Segmenter();
const bigEmoji = (text) => EMOJI_ONLY.test(text) && /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(text);

const timeOf = (at) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

function drawMessages() {
  const list = $('chatList');
  const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
  list.innerHTML = '';
  if (!messages.length) {
    const li = document.createElement('li');
    li.className = 'chatEmpty';
    li.textContent = 'No messages yet. Say hi! 😺';
    list.appendChild(li);
  }
  let prev = null;
  for (const m of messages) {
    const li = document.createElement('li');
    li.className = 'msg' + (m.mine ? ' mine' : '') + (bigEmoji(m.text) ? ' big' : '');
    li.title = timeOf(m.at);
    // The name only when the sender changes, so a burst of messages reads as one block.
    if (!prev || prev.name !== m.name || prev.mine !== m.mine || m.at - prev.at > 5 * 60e3) {
      const who = document.createElement('div');
      who.className = 'who';
      who.innerHTML = m.avatar ? avatarSvg(m.avatar, 18) : '';
      who.append(`${m.watching ? '👀 ' : ''}${m.mine ? 'You' : m.name} · ${timeOf(m.at)}`);
      li.appendChild(who);
    }
    const body = document.createElement('div');
    body.className = 'text';
    body.textContent = m.text;
    li.appendChild(body);
    list.appendChild(li);
    prev = m;
  }
  // Stay at the bottom for new messages, unless you scrolled up to read older ones.
  if (nearBottom || messages.at(-1)?.mine) list.scrollTop = list.scrollHeight;
}

function updateBadge() {
  const unread = isOpen() ? 0 : messages.filter((m) => m.id > seenId && !m.mine).length;
  const badge = $('chatBadge');
  badge.textContent = unread > 9 ? '9+' : unread;
  badge.classList.toggle('hidden', !unread);
  $('chatTab').classList.toggle('unread', unread > 0);
}

function markSeen() {
  if (!isOpen() || !messages.length) return;
  seenId = Math.max(seenId, messages.at(-1).id);
  store.set('chatSeen:' + code, seenId);
}

// Called with every state update from the server; redraws only when something new arrived.
export function renderChat(S) {
  if (S.code !== code) { // a different room: its message ids start again from 1
    code = S.code;
    lastId = 0;
    seenId = Number(store.get('chatSeen:' + code) || 0);
  }
  messages = S.chat || [];
  const newest = messages.at(-1)?.id || 0;
  if (newest !== lastId) {
    lastId = newest;
    drawMessages();
  }
  markSeen();
  updateBadge();
}

function setOpen(open) {
  document.body.classList.toggle('chatOpen', open);
  store.set('chatOpen', open ? '1' : '0');
  $('chatTab').setAttribute('aria-expanded', open);
  if (open) {
    markSeen();
    const list = $('chatList');
    list.scrollTop = list.scrollHeight;
    // On a phone the panel covers the game, so don't pop the keyboard up uninvited.
    if (!matchMedia('(max-width: 900px)').matches) $('chatInput').focus({ preventScroll: true });
  } else {
    showPicker(false);
  }
  updateBadge();
  window.dispatchEvent(new Event('resize')); // the game area changed width: refit the rack
}

// ---- Sending ----

async function send() {
  const input = $('chatInput');
  const text = input.value.trim();
  if (!text) return;
  const n = [...segmenter.segment(text)].length;
  if (n > MAX_CHARS) return ($('chatErr').textContent = `That's ${n} characters, the limit is ${MAX_CHARS}`);
  $('chatErr').textContent = '';
  try {
    await api('chat', { text });
    input.value = '';
    showPicker(false);
  } catch (e) {
    $('chatErr').textContent = e.message;
  }
  input.focus();
}

// ---- Emoji picker ----

const recent = () => (store.get('recentEmoji') || '').split(' ').filter(Boolean);

function addRecent(emoji) {
  store.set('recentEmoji', [emoji, ...recent().filter((e) => e !== emoji)].slice(0, RECENT_MAX).join(' '));
}

// Put the emoji where the cursor is (or over the selected text), and keep typing from after it.
function insertEmoji(emoji) {
  const input = $('chatInput');
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  const next = input.value.slice(0, start) + emoji + input.value.slice(end);
  if (next.length > input.maxLength) return;
  input.value = next;
  const at = start + emoji.length;
  input.setSelectionRange(at, at);
  input.focus();
  addRecent(emoji);
}

let tab = '🐱';
function drawPicker() {
  const tabs = $('emojiTabs');
  tabs.innerHTML = '';
  const groups = recent().length ? { '🕘': recent(), ...EMOJI } : EMOJI;
  if (!groups[tab]) tab = '🐱';
  for (const key of Object.keys(groups)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = key;
    b.title = { '🕘': 'Recently used', '🐱': 'Cats', '😀': 'Faces', '👍': 'Hands', '🎉': 'Fun' }[key];
    b.className = key === tab ? 'on' : '';
    b.onclick = () => { tab = key; drawPicker(); };
    tabs.appendChild(b);
  }
  const grid = $('emojiGrid');
  grid.innerHTML = '';
  for (const e of groups[tab]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = e;
    b.onclick = () => insertEmoji(e);
    grid.appendChild(b);
  }
}

function showPicker(show) {
  if (show) drawPicker();
  $('emojiPicker').classList.toggle('hidden', !show);
  $('emojiBtn').setAttribute('aria-expanded', show);
}

// ---- Resizing: drag the panel's left edge, or focus it and use the arrow keys. Double-click resets. ----

const DEFAULT_W = 320;
const MIN_W = 240;
// Side by side (wide screens) it always leaves room for the game; sliding over the game (narrow screens) it may
// fill most of the screen.
const maxW = () => Math.max(MIN_W, window.innerWidth > 900 ? Math.min(720, window.innerWidth - 560) : window.innerWidth - 32);

let refit = 0;
function setWidth(w, save = true) {
  w = Math.round(Math.min(maxW(), Math.max(MIN_W, w)));
  document.documentElement.style.setProperty('--chat-w', `${w}px`);
  $('chatResize').setAttribute('aria-valuenow', w);
  if (save) store.set('chatWidth', w);
  // The game area changed width: refit the rack, at most once per frame while dragging.
  cancelAnimationFrame(refit);
  refit = requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
}

function initResize() {
  const handle = $('chatResize');
  handle.setAttribute('aria-valuemin', MIN_W);
  handle.onpointerdown = (e) => {
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    document.body.classList.add('chatResizing');
    handle.onpointermove = (m) => setWidth(window.innerWidth - m.clientX, false);
    const stop = () => {
      handle.onpointermove = handle.onpointerup = handle.onpointercancel = null;
      document.body.classList.remove('chatResizing');
      store.set('chatWidth', parseInt(getComputedStyle(document.documentElement).getPropertyValue('--chat-w')));
    };
    handle.onpointerup = handle.onpointercancel = stop;
  };
  handle.ondblclick = () => setWidth(DEFAULT_W);
  handle.onkeydown = (e) => {
    const now = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--chat-w'));
    const step = e.shiftKey ? 80 : 20;
    const next = { ArrowLeft: now + step, ArrowRight: now - step, Home: maxW(), End: MIN_W }[e.key];
    if (next == null) return;
    e.preventDefault();
    setWidth(next);
  };
  // A saved width may not fit after the window shrinks; squeeze it, but keep the saved choice for later.
  // Only for real window size changes: setWidth itself sends a 'resize' (for the rack), which must not undo a drag.
  let windowW = window.innerWidth;
  window.addEventListener('resize', () => {
    if (window.innerWidth === windowW) return;
    windowW = window.innerWidth;
    handle.setAttribute('aria-valuemax', maxW());
    const saved = Number(store.get('chatWidth')) || DEFAULT_W;
    const now = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--chat-w'));
    const fit = Math.min(maxW(), Math.max(MIN_W, saved));
    if (fit !== now) setWidth(fit, false);
  });
  handle.setAttribute('aria-valuemax', maxW());
  setWidth(Number(store.get('chatWidth')) || DEFAULT_W, false);
}

export function initChat() {
  initResize();
  $('chatTab').onclick = () => setOpen(true);
  $('chatClose').onclick = () => setOpen(false);
  $('chatForm').onsubmit = (e) => { e.preventDefault(); send(); };
  $('emojiBtn').onclick = () => showPicker($('emojiPicker').classList.contains('hidden'));
  $('chatInput').onkeydown = (e) => {
    if (e.key === 'Escape') { // Escape closes the picker first, then leaves the box
      e.stopPropagation();
      if (!$('emojiPicker').classList.contains('hidden')) showPicker(false);
      else $('chatInput').blur();
    }
  };
  // Clicking anywhere else closes the picker.
  document.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('#emojiPicker, #emojiBtn')) showPicker(false);
  });
  // Open on wide screens unless you closed it last time; closed on phones, where it would cover the game.
  const saved = store.get('chatOpen');
  setOpen(saved ? saved === '1' : !matchMedia('(max-width: 900px)').matches);
}
