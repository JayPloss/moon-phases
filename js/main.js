import { SYNODIC, SUN_EVENTS, pass, clock, dayTag, phaseName, state } from './astro.js';
import { createSky } from './sky.js';

const $ = (id) => document.getElementById(id);
const sky = createSky($('sky'));
let orbit = null;

// One state drives both views: moon age (days since new moon) at the shown moment, and clock time.
let age = 17.5, t = 8.27;

// Two sets of sliders, one per panel; both drive the same state, so moving either moves both views.
const ageSliders = [...document.querySelectorAll('.age')], timeSliders = [...document.querySelectorAll('.time')];
const playButtons = [...document.querySelectorAll('.play')];
ageSliders.forEach((s) => { s.max = SYNODIC.toFixed(2); });

const wrapAge = (a) => ((a % SYNODIC) + SYNODIC) % SYNODIC;

function render() {
  const r = sky.render(age, t);
  if (orbit) orbit.update(r.st);
  ageSliders.forEach((s) => { s.value = age; }); timeSliders.forEach((s) => { s.value = t; });
  const ageText = `Day ${age.toFixed(1)} of 29.53 · ${phaseName(age)} · ${Math.round(r.st.lit * 100)}% lit`;
  document.querySelectorAll('.ageOut').forEach((o) => { o.textContent = ageText; });
  document.querySelectorAll('.timeOut').forEach((o) => { o.textContent = clock(t); });
  const mp = r.mp;
  const rise = mp.rise == null ? 'does not rise' : `rises ${clock(mp.rise)}${dayTag(mp.rise)}`;
  const set = mp.set == null ? 'does not set' : `sets ${clock(mp.set)}${dayTag(mp.set)}`;
  $('status').textContent = `${clock(t)}. Sun up ${clock(SUN_EVENTS.rise)}, down ${clock(SUN_EVENTS.set)}. Moon ${rise}, ${set}. ${r.moonNote}`;
}

ageSliders.forEach((s) => s.addEventListener('input', () => { stop(); clearBeat(); age = +s.value; render(); }));
// Moving the clock moves the Moon along too: it keeps ageing as the hours pass.
timeSliders.forEach((s) => s.addEventListener('input', () => {
  stop(); clearBeat();
  const nt = +s.value;
  age = wrapAge(age + (nt - t) / 24); t = nt; render();
}));

// The four beats from Jay's texts.
const BEATS = {
  a: () => {
    // Waxing gibbous a few days before full: find a morning when it sets before sunrise,
    // and show it just above the western horizon in the dark.
    let a = 11.6, tt = 3;
    for (let k = 0; k < 4; k++) {
      const p = pass(a, tt, 'moon');
      const nt = p.set - 0.3; a = a + (nt - tt) / 24; tt = nt;
    }
    return [a, tt];
  },
  b: () => [SYNODIC / 2, SUN_EVENTS.rise],
  c: () => [17.5, SUN_EVENTS.rise + 1],
  d: () => [0, SUN_EVENTS.rise],
};
const CAPTIONS = {
  a: { q: 'So the moon <em>was</em> going to bed before the sun came up. That was two weeks ago when we did my trailer move.',
       n: (p) => `A few days before full, the Moon is less than halfway round from the Sun, so it sets at ${clock(p.set)} while it is still dark. Sunrise is ${clock(SUN_EVENTS.rise)}.` },
  b: { q: 'THEN it set exactly as the sun came up — that was the full moon. The full moon is when they’re exactly opposite each other like two tango dancers during a break.',
       n: (p) => `Sun and Moon 180° apart, Earth between them. Moonset ${clock(p.set)}, sunrise ${clock(SUN_EVENTS.rise)}: one goes down as the other comes up.` },
  c: { q: 'NOW the moon is lingering in the daytime sky in the west, setting AFTER the sun has already come up.',
       n: (p) => `Past full, the Moon has slipped behind: it is more than 180° round from the Sun. Sunrise ${clock(SUN_EVENTS.rise)}, but the Moon does not set until ${clock(p.set)}.` },
  d: { q: 'So for the next two weeks we’ll enjoy a daytime moon, but it will be shrinking, getting more slender every day until, finally we don’t see it at all because it’s rising AT THE SAME TIME as the sun.',
       n: (p) => `New moon: same direction as the Sun, its lit half facing away from us. Moonrise ${clock(p.rise)}, sunrise ${clock(SUN_EVENTS.rise)}.` },
};

function clearBeat() { document.querySelectorAll('.beat').forEach((b) => b.setAttribute('aria-pressed', 'false')); }
function showBeat(key) {
  stop();
  [age, t] = BEATS[key]();
  document.querySelectorAll('.beat').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.beat === key)));
  const p = pass(age, t, 'moon');
  $('captionQuote').innerHTML = `“${CAPTIONS[key].q}”`;
  $('captionNote').textContent = CAPTIONS[key].n(p);
  render();
}
document.querySelectorAll('.beat').forEach((b) => b.addEventListener('click', () => showBeat(b.dataset.beat)));

// Play the month: same clock time, one day after another for 29.53 days.
let playing = null;
function stop() { if (playing) { cancelAnimationFrame(playing.raf); playing = null; setPlayLabel('▶ Play the month'); } }
function setPlayLabel(text) { playButtons.forEach((b) => { b.textContent = text; }); }
playButtons.forEach((btn) => btn.addEventListener('click', () => {
  if (playing) return stop();
  clearBeat();
  const start = performance.now(), from = age, secs = 20;
  setPlayLabel('❚❚ Pause');
  const step = (now) => {
    const f = (now - start) / 1000 / secs;
    if (f >= 1) { age = wrapAge(from + SYNODIC); render(); return stop(); }
    age = wrapAge(from + f * SYNODIC); render();
    playing.raf = requestAnimationFrame(step);
  };
  playing = { raf: requestAnimationFrame(step) };
}));
$('reset').addEventListener('click', () => orbit && orbit.resetView());

new ResizeObserver(() => { sky.layout(); sky.rerender(); }).observe($('sky'));

showBeat('c');

// The 3D view loads after the first sky render so a slow phone still gets something on screen at once.
import('./orbit3d.js').then(({ createOrbit }) => {
  orbit = createOrbit($('orbit'), $('orbitLabels'));
  render();
}).catch((e) => { $('orbit').textContent = '3D view could not start on this device: ' + e.message; });

window.__moon = { get: () => ({ age, t, st: state(age, t) }), showBeat };
