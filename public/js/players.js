// Who's in the room: the players (with whose turn it is and cats left) and the people watching.
// Shown in the lobby and during the game. Names come from other people, so they only ever go in as text.
import { $ } from './dom.js';
import { api } from './api.js';
import { avatarSvg } from './art.js';
import { openAvatarEditor } from './avatarEditor.js';
import { S, myTurn } from './state.js';
import { work } from './turn.js';

export function renderPlayers() {
  const pl = $('players');
  pl.innerHTML = '';
  S.players.forEach((p, i) => {
    const ownMeld = S.started && i === S.you && !p.melded && !S.over;
    const points = ownMeld && myTurn()
      ? work.table.filter((set) => set.every((id) => S.hand.includes(id))).reduce((sum, set) => sum + window.Rules.setPoints(set), 0)
      : 0;
    const d = document.createElement('div');
    d.className = 'player' + (S.started && S.turn === i && !S.over ? ' turn' : '') + (p.online ? '' : ' off');
    d.innerHTML = `<span class="pav">${avatarSvg(p.avatar, 36)}</span><div>` +
      `${p.bot ? '🤖 ' : ''}<span class="n"></span>${i === S.you ? ' (you)' : ''}<br>` +
      (S.started ? `${p.count} cats${ownMeld ? ` · First meld: ${points} / 30` : p.melded ? '' : ' · not melded'}` : p.host ? 'host' : p.bot ? 'bot' : '') + '</div>';
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

  // People watching instead of playing, each with their cat
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
}
