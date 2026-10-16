// ---------- Particle portrait ----------
(() => {
  const canvas = document.getElementById('portrait');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SAMPLE_W = 300, SAMPLE_H = 375;     // sampling grid
  const SCALE = W / SAMPLE_W;                // canvas px per sample
  const DOT = 2;                             // dot size in canvas px

  let px = null, n = 0;                      // particle arrays
  let x, y, vx, vy, tx, ty, delay, color;
  let t0 = performance.now();
  const mouse = { x: -9999, y: -9999 };

  const img = new Image();
  img.src = 'assets/zohaib-cutout.jpg';
  img.onload = build;

  function build() {
    const off = document.createElement('canvas');
    off.width = SAMPLE_W; off.height = SAMPLE_H;
    const octx = off.getContext('2d', { willReadFrequently: true });
    octx.drawImage(img, 0, 60, 1280, 1540, 0, 0, SAMPLE_W, SAMPLE_H);
    const data = octx.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data;

    // background = near-black pixels connected to the image border (flood fill,
    // so the pale shirt collar inside the jacket is not removed)
    const N = SAMPLE_W * SAMPLE_H, bg = new Uint8Array(N), stack = [];
    const isBg = p => {
      const k = p * 4, r = data[k], g = data[k + 1], b = data[k + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      return lum < 22;                     // cutout photo: black backdrop
    };
    const push = p => { if (!bg[p] && isBg(p)) { bg[p] = 1; stack.push(p); } };
    for (let i = 0; i < SAMPLE_W; i++) { push(i); push((SAMPLE_H - 1) * SAMPLE_W + i); }
    for (let j = 0; j < SAMPLE_H; j++) { push(j * SAMPLE_W); push(j * SAMPLE_W + SAMPLE_W - 1); }
    while (stack.length) {
      const p = stack.pop(), x0 = p % SAMPLE_W;
      if (x0 > 0) push(p - 1);
      if (x0 < SAMPLE_W - 1) push(p + 1);
      if (p >= SAMPLE_W) push(p - SAMPLE_W);
      if (p < N - SAMPLE_W) push(p + SAMPLE_W);
    }

    const pts = [];
    for (let j = 0; j < SAMPLE_H; j++) {
      for (let i = 0; i < SAMPLE_W; i++) {
        const p = j * SAMPLE_W + i;
        if (bg[p]) continue;
        const k = p * 4;
        const lum = 0.299 * data[k] + 0.587 * data[k + 1] + 0.114 * data[k + 2];
        // monochrome shading with a floor so dark areas keep their silhouette
        const t = 0.1 + 0.9 * Math.pow(Math.min(Math.max((lum - 25) / 165, 0), 1), 1.3);
        pts.push([i, j, 255 * t | 0, 244 * t | 0, 228 * t | 0]);
      }
    }
    n = pts.length;
    x = new Float32Array(n); y = new Float32Array(n);
    vx = new Float32Array(n); vy = new Float32Array(n);
    tx = new Float32Array(n); ty = new Float32Array(n);
    delay = new Float32Array(n); color = new Uint32Array(n);

    for (let p = 0; p < n; p++) {
      const [i, j, r, g, b] = pts[p];
      tx[p] = i * SCALE; ty[p] = j * SCALE;
      color[p] = (255 << 24) | (b << 16) | (g << 8) | r;   // ABGR little-endian
    }
    scatter();
    px = ctx.createImageData(W, H);
    requestAnimationFrame(frame);
  }

  // Start state: a swirling ring of particles around the canvas, delayed per particle
  function scatter() {
    t0 = performance.now();
    for (let p = 0; p < n; p++) {
      const a = Math.random() * Math.PI * 2;
      const rad = (0.55 + Math.random() * 0.6) * Math.max(W, H);
      x[p] = W / 2 + Math.cos(a) * rad;
      y[p] = H / 2 + Math.sin(a) * rad;
      vx[p] = vy[p] = 0;
      // sweep from top to bottom so the portrait "draws" itself, with randomness
      delay[p] = (ty[p] / H) * 1.6 + Math.random() * 0.9;
    }
  }

  function frame(now) {
    const t = (now - t0) / 1000;
    const buf = new Uint32Array(px.data.buffer);
    buf.fill(0);
    const R = 70, R2 = R * R;
    for (let p = 0; p < n; p++) {
      if (reduce) { x[p] = tx[p]; y[p] = ty[p]; }
      else if (t > delay[p]) {
        // spring toward target
        let ax = (tx[p] - x[p]) * 0.045;
        let ay = (ty[p] - y[p]) * 0.045;
        // mouse repulsion
        const dx = x[p] - mouse.x, dy = y[p] - mouse.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < R2) {
          const d = Math.sqrt(d2) || 1, f = (1 - d / R) * 5.5;
          ax += (dx / d) * f; ay += (dy / d) * f;
        }
        vx[p] = (vx[p] + ax) * 0.86;
        vy[p] = (vy[p] + ay) * 0.86;
        x[p] += vx[p]; y[p] += vy[p];
      } else {
        // pre-assembly drift
        x[p] += Math.sin(t * 2 + p) * 0.4;
        y[p] += Math.cos(t * 2 + p * 1.3) * 0.4;
      }
      const ix = x[p] | 0, iy = y[p] | 0;
      if (ix < 0 || iy < 0 || ix > W - DOT || iy > H - DOT) continue;
      const base = iy * W + ix;
      const c = color[p];
      buf[base] = c; buf[base + 1] = c;
      buf[base + W] = c; buf[base + W + 1] = c;
    }
    ctx.putImageData(px, 0, 0);
    requestAnimationFrame(frame);
  }

  function pos(e) {
    const r = canvas.getBoundingClientRect();
    const p = e.touches ? e.touches[0] : e;
    mouse.x = (p.clientX - r.left) * (W / r.width);
    mouse.y = (p.clientY - r.top) * (H / r.height);
  }
  canvas.addEventListener('mousemove', pos);
  canvas.addEventListener('touchmove', pos, { passive: true });
  canvas.addEventListener('mouseleave', () => { mouse.x = mouse.y = -9999; });
  canvas.addEventListener('touchend', () => { mouse.x = mouse.y = -9999; });
  document.getElementById('replay').addEventListener('click', () => n && scatter());
})();

// ---------- Typed roles ----------
(() => {
  const el = document.getElementById('typed');
  const words = ['Full Stack .NET Developer', 'Azure Cloud Engineer', 'Team Lead', 'CRM & E-commerce Developer', 'Automation Engineer', 'Technical Project Manager', 'Digital Marketer'];
  let w = 0, c = 0, del = false;
  (function tick() {
    const word = words[w];
    el.textContent = word.slice(0, c);
    if (!del && c === word.length) { del = true; return setTimeout(tick, 1600); }
    if (del && c === 0) { del = false; w = (w + 1) % words.length; }
    c += del ? -1 : 1;
    setTimeout(tick, del ? 35 : 70);
  })();
})();

// ---------- Nav, reveal, counters ----------
const nav = document.getElementById('nav');
const bar = document.getElementById('progress'), toTop = document.getElementById('toTop');
function onScroll() {
  nav.classList.toggle('scrolled', scrollY > 30);
  const max = document.documentElement.scrollHeight - innerHeight;
  const p = max > 0 ? Math.min(scrollY / max, 1) : 0;
  bar.style.transform = 'scaleX(' + p + ')';
  toTop.classList.toggle('show', max > 0 && max - scrollY < 120);   // only once the user reaches the bottom
}
addEventListener('scroll', onScroll, { passive: true });
addEventListener('resize', onScroll);
toTop.addEventListener('click', () => scrollTo({ top: 0, behavior: 'smooth' }));
onScroll();
document.getElementById('yr').textContent = new Date().getFullYear();

const io = new IntersectionObserver(es => es.forEach(e => {
  if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
}), { threshold: .15 });
document.querySelectorAll('.reveal').forEach(el => io.observe(el));

document.querySelectorAll('[data-count]').forEach(el => {
  const end = +el.dataset.count, suf = el.dataset.suffix || '';
  const start = performance.now() + 900;
  (function step(now) {
    const p = Math.min(Math.max((now - start) / 1400, 0), 1);
    el.textContent = Math.round(end * (1 - Math.pow(1 - p, 3))) + (p === 1 ? suf : '');
    if (p < 1) requestAnimationFrame(step);
  })(performance.now());
});
