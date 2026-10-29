// Upgrade Checkout — github.com/veraetogrex-portfolio · zero dependencies
// The card mirrors what you type and turns around when the CVV field gets focus.
// On pay it glides to the centre while a stroke runs around it: Ion if paid, Flare if declined.

const checkout = document.querySelector('#checkout');
const form     = checkout.querySelector('.pay-form');
const f        = form.elements;                          // number · name · expiry · cvv
const wrap     = checkout.querySelector('.card-wrap');   // moves
const lift     = checkout.querySelector('.card-lift');   // hops while it turns
const card     = checkout.querySelector('.card');        // turns
const numberEl = checkout.querySelector('.card-number');
const cvvBox   = checkout.querySelector('.card-cvv');
const sheen    = checkout.querySelector('.sheen');
const outline  = checkout.querySelector('.outline');
const run      = checkout.querySelector('.outline-run');
const verdict  = checkout.querySelector('.verdict');
const line2    = checkout.querySelector('.steps-line-2 b');
const flood    = document.querySelector('.flood');
const waves    = document.querySelectorAll('.wave');

// Replace with a request to your payment provider. This test card is always declined.
const charge = async digits => digits !== '4000000000000002';
let busy = false;

// tiny tween: animate(ms, (t, p) => …, easing) — t is eased, p is raw progress
const ease = { linear: t => t, io: t => t < .5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2, out: t => 1 - (1 - t) ** 3 };
const animate = (ms, fn, e = ease.io) => new Promise(done => {
  const t0 = performance.now();
  const step = now => { const p = Math.min(1, (now - t0) / ms); fn(e(p), p); p < 1 ? requestAnimationFrame(step) : done(); };
  requestAnimationFrame(step);
});
const wait = ms => new Promise(r => setTimeout(r, ms));

// sixteen digit slots on the card, in four groups
numberEl.innerHTML = ('<span>' + '<i class="is-empty">•</i>'.repeat(4) + '</span>').repeat(4);
const slots = [...numberEl.querySelectorAll('i')];

// 1 · digits land on the card as you type
const digitsOf = v => v.replace(/\D/g, '').slice(0, 16);
function renderNumber() {
  const digits = digitsOf(f.number.value), focused = document.activeElement === f.number;
  slots.forEach((slot, i) => {
    const want = digits[i] || '•';
    if (slot.textContent !== want) {
      slot.textContent = want;
      slot.classList.toggle('is-empty', !digits[i]);
      if (digits[i]) { slot.classList.remove('is-pop'); void slot.offsetWidth; slot.classList.add('is-pop'); }
    }
    slot.classList.toggle('is-caret', focused && i === digits.length);
  });
  card.classList.toggle('is-typing', focused);
}
f.number.addEventListener('input', () => {
  f.number.value = digitsOf(f.number.value).replace(/(.{4})(?=.)/g, '$1 ');
  flag(f.number, '');
  renderNumber();
});
f.number.addEventListener('focus', renderNumber);
f.number.addEventListener('blur', renderNumber);
f.name.addEventListener('input', () => checkout.querySelector('.card-name').textContent = f.name.value || 'Your name');
f.expiry.addEventListener('input', () => {
  const d = f.expiry.value.replace(/\D/g, '').slice(0, 4);
  f.expiry.value = d.length > 2 ? d.slice(0, 2) + ' / ' + d.slice(2) : d;
  checkout.querySelector('.card-expiry').textContent = (d.slice(0, 2) || 'MM') + '/' + (d.slice(2) || 'YY');
});

// 2 · focus on the CVV turns the card around
function flip(on) {
  if (card.classList.contains('is-flipped') === on) return;
  lift.animate([{ scale: 1 }, { scale: 1.045, translate: '0 -6px' }, { scale: 1 }], { duration: 700, easing: 'cubic-bezier(.4,0,.2,1)' });
  card.classList.toggle('is-flipped', on);
}
function renderCvv() {
  const n = f.cvv.value.length;
  cvvBox.innerHTML = '•'.repeat(n) + `<span>${'•'.repeat(3 - n)}</span>`;
}
f.cvv.addEventListener('focus', () => { if (!busy) flip(true); });
f.cvv.addEventListener('blur', () => flip(false));
f.cvv.addEventListener('input', () => {
  f.cvv.value = f.cvv.value.replace(/\D/g, '').slice(0, 3);
  flag(f.cvv, '');
  renderCvv();
  if (f.cvv.value.length === 3) setTimeout(() => document.activeElement === f.cvv && form.querySelector('.pay').focus(), 260);
});
form.addEventListener('submit', e => { e.preventDefault(); pay(); });
wrap.addEventListener('click', () => { if (!busy && checkout.classList.contains('is-paid')) reset(); });

async function pay() {
  if (busy) return;
  const digits = digitsOf(f.number.value);
  if (digits.length < 16) return flag(f.number, 'Enter all 16 digits');
  if (f.cvv.value.length < 3) return flag(f.cvv, '3 digits');
  busy = true;
  document.activeElement.blur();
  flip(false);

  // 3 · the form dissolves, the card glides to the centre, the stepper heads for Done
  const dx = (wrap.parentElement.clientWidth - wrap.offsetWidth) / 2 - wrap.offsetLeft, dy = -40;
  form.inert = true;
  animate(600, t => line2.style.scale = `${.35 * t} 1`, ease.out);
  await animate(600, t => {
    form.style.opacity = 1 - t;
    form.style.translate = `${40 * t}px`;
    form.style.filter = `blur(${8 * t}px)`;
    wrap.style.translate = `${dx * t}px ${dy * t}px`;
    wrap.style.scale = 1 + .02 * Math.sin(Math.PI * t);
  });

  // 4 · processing: a Pulse stroke runs around the card while the bank thinks
  say('Processing…', '');
  const [ok] = await Promise.all([charge(digits), animate(1200, (t, p) => {
    outline.style.opacity = Math.min(1, p * 4);
    run.style.strokeDashoffset = -1600 * t;                      // 1.6 laps
    sheen.style.opacity = Math.sin(Math.PI * p);
    sheen.style.backgroundPosition = `${120 - 140 * (p * 1.6 % 1)}% 0`;
    line2.style.scale = `${.35 + .55 * t} 1`;
  })]);
  ok ? await approve() : await decline();
  busy = false;
}

// 5 · approved: the stroke closes in Ion, then the card's light washes the page
async function approve() {
  checkout.classList.add('is-paid');
  await animate(260, t => { run.setAttribute('stroke-dasharray', `${200 + 800 * t} ${800 - 800 * t}`); line2.style.scale = `${.9 + .1 * t} 1`; }, ease.out);
  const r = wrap.getBoundingClientRect();
  document.body.style.setProperty('--glow-x', r.left + r.width / 2 + 'px');
  document.body.style.setProperty('--glow-y', r.top + r.height / 2 + 'px');
  animate(1400, t => {
    flood.style.scale = .1 + .9 * ease.out(Math.min(1, t * 1.7));
    flood.style.opacity = t < .12 ? t / .12 : 1 - .6 * (t - .12) / .88;
  }, ease.linear);
  waves.forEach((w, i) => setTimeout(() => animate(1000, t => {
    w.style.width = 520 + 1500 * t + 'px';
    w.style.height = 328 + 1100 * t + 'px';
    w.style.opacity = .9 * (1 - t);
  }, ease.out), i * 170));
  checkout.querySelector('.step-pay').className = 'step step-pay is-done';
  checkout.querySelector('.step-done').className = 'step step-done is-ion';
  say("You're on Team Pro", '<b>$24.00</b> · next charge Nov 26');
  await animate(360, t => verdict.querySelector('.badge path').style.strokeDashoffset = 100 - 100 * t, ease.out);
}

async function decline() {
  checkout.classList.add('is-declined');
  await animate(220, t => run.setAttribute('stroke-dasharray', `${200 + 800 * t} ${800 - 800 * t}`), ease.out);
  lift.classList.remove('is-shake'); void lift.offsetWidth; lift.classList.add('is-shake');
  say('Card declined', 'Issuer said no · try another card');
  line2.style.scale = '0 1';
  await wait(1500);
  // back to the form, with the number flagged
  verdict.classList.remove('is-on');
  const [x, y] = wrap.style.translate.split(' ').map(parseFloat);
  await animate(500, t => {
    outline.style.opacity = 1 - t;
    form.style.opacity = t;
    form.style.translate = `${40 * (1 - t)}px`;
    form.style.filter = `blur(${8 * (1 - t)}px)`;
    wrap.style.translate = `${x * (1 - t)}px ${y * (1 - t)}px`;
  });
  checkout.classList.remove('is-declined');
  run.setAttribute('stroke-dasharray', '200 800');
  form.inert = false;
  f.cvv.value = ''; renderCvv();
  flag(f.number, 'Card declined');
  f.number.focus(); f.number.select();
}

function say(title, meta) {
  verdict.querySelector('.verdict-text').textContent = title;
  verdict.querySelector('.verdict-meta').innerHTML = meta;
  verdict.classList.add('is-on');
}

function flag(input, message) {
  const field = input.closest('.field');
  field.classList.toggle('is-bad', !!message);
  field.querySelector('em').textContent = message;
  if (message) { field.animate([{ translate: '0' }, { translate: '-10px' }, { translate: '8px' }, { translate: '-4px' }, { translate: '0' }], { duration: 360 }); input.focus(); }
}

function reset() {
  checkout.classList.remove('is-paid', 'is-declined');
  checkout.querySelector('.step-pay').className = 'step step-pay is-on';
  checkout.querySelector('.step-done').className = 'step step-done';
  [form, wrap, outline, flood, ...waves].forEach(el => el.style.cssText = '');
  form.inert = false;
  run.setAttribute('stroke-dasharray', '200 800');
  run.style.strokeDashoffset = 0;
  line2.style.scale = '0 1';
  verdict.classList.remove('is-on');
  verdict.querySelector('.badge path').style.strokeDashoffset = 100;
  f.number.value = f.cvv.value = '';
  renderNumber(); renderCvv();
}

renderCvv();
