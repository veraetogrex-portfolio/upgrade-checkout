/* Veraetogrex · stage runtime
 *
 * Mockup contract:
 *   <div id="stage" class="grid" data-title="T01 Orbit OTP" data-url="veraetogrex-portfolio.github.io/verify"> ... </div>
 *   <script src="../_shared/stage.js"></script>
 *   <script>
 *     Stage.init({
 *       reset(){ ...restore initial state... },
 *       async demo(s){ await s.wait(300); await s.click(el); await s.type(input,'abc'); ... },
 *     });
 *   </script>
 *
 * Modes:  ?autoplay  (or window.AUTOPLAY = true before stage.js) — demo loops forever, cursor drawn
 *         ?frame     — wraps the 1440×900 screen into a browser window
 *         ?clean     — hides the control pill in interactive mode
 *         ?once      — autoplay plays the demo once and stops on the last frame
 * Keys (interactive): D — play demo, R — reset.
 *
 * All coordinates passed to s.* are stage pixels (1440×900), independent of window scale.
 * Synthetic pointer events (pointermove/down/up, click) are dispatched while the demo
 * cursor moves, so the same handlers serve both the real user and the demo.
 */
(function () {
  const params = new URLSearchParams(location.search);
  const AUTOPLAY = window.AUTOPLAY === true || params.has('autoplay');
  const FRAME = params.has('frame');
  const ONCE = params.has('once');
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (AUTOPLAY) document.body.classList.add('autoplay');
  if (params.has('clean')) document.body.classList.add('clean');

  const stage = document.getElementById('stage');
  const W = 1440, H = 900;

  // ---------- shell, frame, scale ----------
  let shell = stage;
  const vp = document.createElement('div');
  vp.className = 'li-viewport';
  stage.parentNode.insertBefore(vp, stage);
  if (FRAME) {
    shell = document.createElement('div');
    shell.className = 'li-browser';
    shell.innerHTML = '<div class="li-browser-bar"><div class="li-dots"><i></i><i></i><i></i></div><div class="li-url"></div><div style="width:52px"></div></div>';
    shell.querySelector('.li-url').textContent = stage.dataset.url || 'veraetogrex-portfolio.github.io';
    shell.appendChild(stage);
  }
  shell.classList.add('li-shell');
  vp.appendChild(shell);
  function fit() {
    const sw = shell.offsetWidth, sh = shell.offsetHeight;
    const s = Math.min(innerWidth / sw, innerHeight / sh);
    shell.style.transform = `translate(-50%,-50%) scale(${s})`;
  }
  addEventListener('resize', fit); fit();

  // ---------- coordinates ----------
  function scale() { return stage.getBoundingClientRect().width / W; }
  function toClient(x, y) { const r = stage.getBoundingClientRect(), k = r.width / W; return [r.left + x * k, r.top + y * k]; }
  function toStage(cx, cy) { const r = stage.getBoundingClientRect(), k = r.width / W; return [(cx - r.left) / k, (cy - r.top) / k]; }
  function rectOf(el) {
    const r = el.getBoundingClientRect(), s = stage.getBoundingClientRect(), k = s.width / W;
    return { x: (r.left - s.left) / k, y: (r.top - s.top) / k, w: r.width / k, h: r.height / k,
             cx: (r.left - s.left + r.width / 2) / k, cy: (r.top - s.top + r.height / 2) / k };
  }

  // ---------- easing ----------
  const ease = {
    linear: t => t,
    in: t => t * t * t,
    out: t => 1 - Math.pow(1 - t, 3),
    inOut: t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
    outBack: t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
    spring: t => t === 1 ? 1 : 1 - Math.exp(-6.5 * t) * Math.cos(11 * t),
  };
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

  // ---------- tracked timers (cleared on reset) ----------
  let timers = new Set(), rafs = new Set();
  function later(fn, ms) { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); return id; }
  function frame(fn) { const id = requestAnimationFrame(t => { rafs.delete(id); fn(t); }); rafs.add(id); return id; }
  function clearAll() { timers.forEach(clearTimeout); rafs.forEach(cancelAnimationFrame); timers = new Set(); rafs = new Set(); }

  // ---------- cursor ----------
  const cur = document.createElement('div');
  cur.id = 'li-cursor';
  cur.innerHTML =
    '<svg width="28" height="28" viewBox="0 0 28 28"><g class="arrow"><path d="M4 3 L4 22.5 L9.2 17.6 L12.6 25.2 L16 23.7 L12.7 16.3 L19.8 16.3 Z" fill="#fff" stroke="#0B0C12" stroke-width="1.6" stroke-linejoin="round"/></g>' +
    '<g class="hand"><path d="M9 13V6.5a1.8 1.8 0 0 1 3.6 0V12m0-1.2V5.2a1.8 1.8 0 0 1 3.6 0V12m0-5.2a1.8 1.8 0 0 1 3.6 0V13m0-3.6a1.8 1.8 0 0 1 3.6 0V17c0 4-2.8 7-6.8 7h-1.6c-2.4 0-3.8-.9-5.2-2.6L5 16.8a1.9 1.9 0 0 1 2.8-2.5L9 15.6" fill="#fff" stroke="#0B0C12" stroke-width="1.5" stroke-linejoin="round" transform="translate(-2,-1)"/></g></svg>';
  stage.appendChild(cur);
  const cursor = { x: W * .62, y: H * .82 };
  function placeCursor() { cur.style.transform = `translate(${cursor.x - 4}px,${cursor.y - 3}px)`; }
  placeCursor();

  let pressed = false, pressTarget = null;
  function targetAt(x, y) {
    const [cx, cy] = toClient(x, y);
    const el = document.elementFromPoint(cx, cy);
    return el && stage.contains(el) ? el : stage;
  }
  function dispatchPointer(type, x, y, target) {
    const [cx, cy] = toClient(x, y);
    const t = target || targetAt(x, y);
    const init = { clientX: cx, clientY: cy, bubbles: true, cancelable: true, composed: true, pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons: pressed ? 1 : 0 };
    t.dispatchEvent(new PointerEvent(type, init));
    if (type === 'pointermove') t.dispatchEvent(new MouseEvent('mousemove', init));
    if (type === 'pointerdown') t.dispatchEvent(new MouseEvent('mousedown', init));
    if (type === 'pointerup') t.dispatchEvent(new MouseEvent('mouseup', init));
    return t;
  }
  let hoverEl = null;
  function updateHover(x, y) {
    const t = targetAt(x, y);
    if (t !== hoverEl) {
      if (hoverEl) { hoverEl.dispatchEvent(new PointerEvent('pointerleave', { bubbles: false })); hoverEl.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false })); hoverEl.dispatchEvent(new PointerEvent('pointerout', { bubbles: true })); }
      document.querySelectorAll('.li-hover').forEach(e => e.classList.remove('li-hover'));
      hoverEl = t;
      if (t) { t.dispatchEvent(new PointerEvent('pointerover', { bubbles: true })); t.dispatchEvent(new PointerEvent('pointerenter', { bubbles: false })); t.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
        let e = t; while (e && e !== stage) { e.classList.add('li-hover'); e = e.parentElement; } }
    }
  }

  // ---------- run context with cancellation ----------
  class Abort extends Error {}
  let runId = 0;
  function makeCtx(id) {
    const alive = () => { if (id !== runId) throw new Abort(); };
    const ctx = {
      W, H, ease, lerp, clamp, reduced: REDUCED, autoplay: AUTOPLAY,
      get alive() { return id === runId; },
      wait(ms) { alive(); return new Promise((res, rej) => later(() => id === runId ? res() : rej(new Abort()), ms)); },
      until(t0, ms) { return ctx.wait(Math.max(0, ms - (performance.now() - t0))); },
      tween(ms, fn, e = ease.inOut) {
        alive();
        return new Promise((res, rej) => {
          const t0 = performance.now();
          const step = now => {
            if (id !== runId) return rej(new Abort());
            const p = clamp((now - t0) / ms);
            fn(e(p), p);
            if (p < 1) frame(step); else res();
          };
          frame(step);
        });
      },
      rect: rectOf, toClient, toStage,
      cursor: {
        show() { cur.classList.add('on'); },
        hide() { cur.classList.remove('on'); },
        set(x, y) { cursor.x = x; cursor.y = y; placeCursor(); },
        grab(on = true) { cur.classList.toggle('grab', on); },
        get x() { return cursor.x; }, get y() { return cursor.y; },
      },
      /** move cursor to (x,y) or to an element (+dx,dy offset from its center) */
      async move(target, ms = 520, opts = {}) {
        let x, y;
        if (target instanceof Element) { const r = rectOf(target); x = r.cx + (opts.dx || 0); y = r.cy + (opts.dy || 0); }
        else [x, y] = target;
        const x0 = cursor.x, y0 = cursor.y;
        const bend = opts.arc === undefined ? .12 : opts.arc;   // slight natural arc
        const nx = -(y - y0) * bend, ny = (x - x0) * bend;
        cur.classList.add('on');
        await ctx.tween(ms, t => {
          const a = 4 * t * (1 - t);
          cursor.x = lerp(x0, x, t) + nx * a; cursor.y = lerp(y0, y, t) + ny * a;
          placeCursor();
          dispatchPointer('pointermove', cursor.x, cursor.y, pressed ? pressTarget : null);
          if (!pressed) updateHover(cursor.x, cursor.y);
        }, opts.ease || ease.inOut);
      },
      async down() { alive(); pressed = true; cur.classList.add('down'); pressTarget = dispatchPointer('pointerdown', cursor.x, cursor.y); return pressTarget; },
      async up() {
        alive(); const t = targetAt(cursor.x, cursor.y);
        dispatchPointer('pointerup', cursor.x, cursor.y, pressed ? pressTarget : t);
        pressed = false; cur.classList.remove('down'); return t;
      },
      ripple(x = cursor.x, y = cursor.y) {
        const r = document.createElement('div'); r.className = 'li-ripple'; r.style.left = x + 'px'; r.style.top = y + 'px';
        stage.appendChild(r); later(() => r.remove(), 520);
      },
      /** move to element (optional) and click it: pointer events + click() + focus */
      async click(target, opts = {}) {
        if (target) await ctx.move(target, opts.ms || 520, opts);
        const t = await ctx.down();
        ctx.ripple();
        await ctx.wait(opts.hold || 90);
        const upT = await ctx.up();
        const el = (target instanceof Element ? target : null) || upT || t;
        if (el.matches && el.matches('input,textarea,[tabindex]')) el.focus({ preventScroll: true });
        el.click();
        return el;
      },
      /** drag from current cursor position (or given element/point) along to point(s) */
      async drag(to, ms = 800, opts = {}) {
        if (opts.from) await ctx.move(opts.from, opts.fromMs || 450);
        cur.classList.add('grab');
        await ctx.down();
        await ctx.wait(opts.pre || 80);
        const pts = Array.isArray(to[0]) ? to : [to];
        const per = ms / pts.length;
        for (const p of pts) await ctx.move(p, per, { arc: opts.arc ?? 0, ease: opts.ease || (pts.length > 1 ? ease.linear : ease.inOut) });
        await ctx.wait(opts.post || 60);
        await ctx.up();
        cur.classList.remove('grab');
      },
      /** type text into an input/textarea (value + input events) or element (textContent) */
      async type(el, text, opts = {}) {
        const cps = opts.cps || 16, jitter = opts.jitter ?? .35;
        const isInput = el.matches('input,textarea');
        if (isInput) el.focus({ preventScroll: true });
        let v = opts.append ? (isInput ? el.value : el.textContent) : '';
        if (!opts.append) { if (isInput) el.value = ''; else el.textContent = ''; }
        for (const ch of text) {
          await ctx.wait(1000 / cps * (1 + (Math.random() - .5) * jitter));
          v += ch;
          if (isInput) { el.value = v; el.dispatchEvent(new InputEvent('input', { bubbles: true, data: ch, inputType: 'insertText' })); }
          else el.textContent = v;
          if (opts.onChar) opts.onChar(v, ch);
        }
      },
      async key(el, key) { alive(); el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })); el.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true })); },
      later, frame,
    };
    return ctx;
  }

  // ---------- public API ----------
  let spec = null, playing = false;
  function hardReset() {
    runId++; clearAll();
    pressed = false; cur.classList.remove('down', 'grab');
    document.querySelectorAll('.li-ripple').forEach(r => r.remove());
    document.querySelectorAll('.li-hover').forEach(e => e.classList.remove('li-hover'));
    hoverEl = null;
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    if (spec && spec.reset) spec.reset(Stage.ctx());
  }
  async function playDemo(loop) {
    hardReset();
    playing = true; stage.classList.add('demo-running');
    const id = runId, ctx = makeCtx(id);
    const start = spec.cursorStart || [W * .62, H * .86];
    ctx.cursor.set(start[0], start[1]); ctx.cursor.show();
    try {
      await spec.demo(ctx);
      if (loop && !ONCE && id === runId) { await ctx.wait(spec.loopGap ?? 0); return playDemo(true); }
      if (!loop && id === runId) { await ctx.wait(600); hardReset(); }
    } catch (e) { if (!(e instanceof Abort)) console.error(e); }
    finally { if (id === runId || !loop) { playing = false; stage.classList.remove('demo-running'); if (!AUTOPLAY) cur.classList.remove('on'); } }
  }

  const Stage = {
    W, H, stage, autoplay: AUTOPLAY, reduced: REDUCED, ease, lerp, clamp, later, frame, rect: rectOf, toStage, toClient,
    /** context for interactive code (tween/wait that get cancelled by the next reset) */
    ctx() { return makeCtx(runId); },
    get playing() { return playing; },
    init(s) {
      spec = s;
      const go = () => {
        hardReset();
        if (AUTOPLAY) playDemo(true);
        else buildControls();
      };
      (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(() => setTimeout(go, 60));
    },
    play() { return playDemo(false); },
    reset: hardReset,
  };
  function buildControls() {
    if (document.querySelector('.li-controls')) return;
    const c = document.createElement('div');
    c.className = 'li-controls';
    c.innerHTML = `<span class="li-title"></span><button data-a="demo">▶ Demo · D</button><button data-a="reset">↻ Reset · R</button>`;
    c.querySelector('.li-title').textContent = stage.dataset.title || document.title;
    c.addEventListener('click', e => { const a = e.target.dataset.a; if (a === 'demo') Stage.play(); if (a === 'reset') hardReset(); });
    document.body.appendChild(c);
    addEventListener('keydown', e => {
      if (e.target.matches && e.target.matches('input,textarea')) return;
      if (e.key === 'd' || e.key === 'D') Stage.play();
      if (e.key === 'r' || e.key === 'R') hardReset();
    });
    // real user interaction cancels a running demo
    stage.addEventListener('pointerdown', e => { if (playing && e.isTrusted) hardReset(); }, true);
  }
  window.Stage = Stage;
})();
