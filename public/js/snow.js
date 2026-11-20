// Christmas snow on one canvas behind everything. Flakes settle into a drift along the bottom of the screen:
// a heightmap of thin columns that spills sideways when a column gets too steep, so it piles up in soft mounds.
import { reducedMotion } from './dom.js';

const COL = 4, MAX = 40; // drift column width and tallest drift, in CSS px
let cv, ctx, w, h, flakes = [], drift = [], raf = 0, last = 0;

const flake = (anywhere) => {
  const r = 1 + Math.random() * 2.4;
  return { x: Math.random() * w, y: anywhere ? Math.random() * h : -4, r, vy: 14 + r * 12, ph: Math.random() * 6.3, sp: 0.6 + Math.random() };
};

function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  w = innerWidth;
  h = innerHeight;
  cv.width = w * dpr;
  cv.height = h * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const n = Math.ceil(w / COL) + 1, old = drift;
  drift = Array.from({ length: n }, (_, i) => old[Math.floor((i * old.length) / n)] || 0);
  flakes = Array.from({ length: Math.round(Math.min(160, (w * h) / 9000)) }, (_, i) => flakes[i] || flake(true));
}

function settle(i, amount) {
  drift[i] = Math.min(MAX, drift[i] + amount * (1 - drift[i] / MAX));
  // Let a steep column spill into its lower neighbour; a few local passes are plenty.
  for (let pass = 0; pass < 3; pass++) {
    for (let k = Math.max(1, i - 8); k < Math.min(drift.length - 1, i + 8); k++) {
      for (const j of [k - 1, k + 1]) {
        const d = drift[k] - drift[j];
        if (d > 1.5) { drift[k] -= (d - 1.5) / 2; drift[j] += (d - 1.5) / 2; }
      }
    }
  }
}

function draw() {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#ffffffd9';
  ctx.beginPath();
  for (const f of flakes) { ctx.moveTo(f.x + f.r, f.y); ctx.arc(f.x, f.y, f.r, 0, 6.283); }
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(0, h - drift[0]);
  for (let i = 1; i < drift.length; i++) ctx.quadraticCurveTo((i - 0.5) * COL, h - drift[i - 1], i * COL, h - (drift[i - 1] + drift[i]) / 2);
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fillStyle = '#eef4fb';
  ctx.fill();
}

function tick(t) {
  const dt = Math.min(0.05, (t - last) / 1000 || 0); // a long pause (hidden tab) doesn't teleport the flakes
  last = t;
  for (let n = 0; n < flakes.length; n++) {
    const f = flakes[n];
    f.ph += f.sp * dt;
    f.x += Math.sin(f.ph) * 14 * dt + 6 * dt;
    f.y += f.vy * dt;
    if (f.x < -4) f.x += w + 8; else if (f.x > w + 4) f.x -= w + 8;
    const i = Math.max(0, Math.min(drift.length - 1, Math.round(f.x / COL)));
    if (f.y >= h - drift[i]) { settle(i, f.r * 1.8); flakes[n] = flake(false); }
  }
  draw();
  raf = requestAnimationFrame(tick);
}

export function startSnow() {
  cv = document.querySelector('.deco-snow');
  ctx = cv.getContext('2d');
  if (raf) return;
  resize();
  addEventListener('resize', resize);
  if (reducedMotion()) {
    // No falling snow, just a settled drift.
    drift = drift.map((_, i) => 16 + Math.sin(i / 9) * 6 + Math.sin(i / 23) * 5);
    flakes = [];
    draw();
    raf = -1;
    return;
  }
  last = performance.now();
  raf = requestAnimationFrame(tick);
}

export function stopSnow() {
  if (!raf) return;
  if (raf > 0) cancelAnimationFrame(raf);
  raf = 0;
  removeEventListener('resize', resize);
  ctx.clearRect(0, 0, w, h);
}
