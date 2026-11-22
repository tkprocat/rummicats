// Winner popup with confetti in the cat colors.
import { $ } from './dom.js';
import { avatarSvg } from './art.js';

// over: the server's { winner, why, scores: [{ name, penalty }] }. youWon picks the headline.
// isHost decides between the New game button and a note that the host can start one.
export function showWin(over, youWon, isHost) {
  const box = $('winPop');
  $('winAgain').classList.toggle('hidden', !isHost);
  box.querySelector('.againNote').classList.toggle('hidden', isHost);
  $('winTitle').textContent = youWon ? 'You win! 🎉' : `${over.winner} wins!`;
  box.querySelector('.why').textContent = over.why || '';
  // The winner's cat holds up the trophy
  const champ = over.scores.find((x) => x.name === over.winner);
  box.querySelector('.trophy').innerHTML = champ?.avatar ? `${avatarSvg(champ.avatar, 96)}<span>🏆</span>` : '🏆';
  const ul = box.querySelector('.scores');
  ul.innerHTML = '';
  [...over.scores].sort((a, b) => a.penalty - b.penalty).forEach((x) => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="who">${x.avatar ? avatarSvg(x.avatar, 24) : ''}<span></span></span><span></span>`;
    li.querySelector('.who > span').textContent = x.name;
    li.children[1].textContent = `${x.penalty} pts left`;
    ul.appendChild(li);
  });
  box.classList.remove('hidden');
  $('winClose').focus();
  confetti($('confetti'));
}

export function hideWin() {
  $('winPop').classList.add('hidden');
}

export function initWin() {
  $('winClose').onclick = hideWin;
  $('winPop').addEventListener('click', (e) => { if (e.target === $('winPop')) hideWin(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideWin(); });
}

function confetti(canvas) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth, H = canvas.clientHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  ctx.scale(dpr, dpr);
  const css = getComputedStyle(document.documentElement);
  const colors = ['--ginger', '--pinky', '--smoky', '--ok', '--tile'].map((v) => css.getPropertyValue(v).trim());
  const bits = [];
  const add = (x, y, vx, vy, drag) => bits.push({ x, y, vx, vy, drag, w: 6 + Math.random() * 6, h: 4 + Math.random() * 4, rot: Math.random() * 6, vr: (Math.random() - .5) * .3, c: colors[bits.length % colors.length], wob: Math.random() * 6 });
  // Explosions: rings of confetti popping at random spots, one after another
  const booms = [[W / 2, H * .35, 0]];
  for (let i = 1; i < 7; i++) booms.push([W * (.15 + Math.random() * .7), H * (.15 + Math.random() * .45), i * 280]);
  booms.forEach(([x, y, delay]) => setTimeout(() => {
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * Math.PI * 2, sp = 4 + Math.random() * 10;
      add(x, y, Math.cos(a) * sp, Math.sin(a) * sp - 2, .94);
    }
  }, delay));
  // Cannons from the bottom corners, and a gentle rain from the top
  for (let i = 0; i < 70; i++) {
    const a = -Math.PI / 2 + (Math.random() - .5) * .9, sp = 9 + Math.random() * 9;
    add(0, H, Math.cos(a + .5) * sp, Math.sin(a) * sp, .985);
    add(W, H, Math.cos(a - .5) * sp, Math.sin(a) * sp, .985);
  }
  for (let i = 0; i < 80; i++) add(Math.random() * W, -20 - Math.random() * H, (Math.random() - .5) * 2, 2 + Math.random() * 2, .985);
  const start = performance.now();
  (function frame(t) {
    if ($('winPop').classList.contains('hidden')) return ctx.clearRect(0, 0, W, H);
    ctx.clearRect(0, 0, W, H);
    let alive = 0;
    for (const b of bits) {
      b.vx *= b.drag; b.vy = Math.min(b.vy * b.drag + .25, 4); b.wob += .1;
      b.x += b.vx + Math.sin(b.wob) * .6; b.y += b.vy; b.rot += b.vr;
      if (b.y > H + 20) continue;
      alive++;
      ctx.save();
      ctx.translate(b.x, b.y); ctx.rotate(b.rot); ctx.scale(1, Math.cos(b.wob));
      ctx.fillStyle = b.c;
      ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
      ctx.restore();
    }
    if ((alive || t - start < 2000) && t - start < 9000) requestAnimationFrame(frame); else ctx.clearRect(0, 0, W, H);
  })(start);
}
