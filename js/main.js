import { SYNODIC, SUN_EVENTS, LAT, PLACE, pass, clock, phaseName, state } from './astro.js';
import { createSky } from './sky.js';
import { createLevel2, createLevel3 } from './levels.js';

const $ = (id) => document.getElementById(id);
const sky = createSky($('sky'));
let orbit = null;

// One state drives both views: moon age (days since new moon) at the shown moment, and clock time.
let age = 17.5, t = 8.27;

// Two sets of sliders, one per panel; both drive the same state, so moving either moves both views.
const ageSliders = [...document.querySelectorAll('.age')], timeSliders = [...document.querySelectorAll('.time')];
ageSliders.forEach((s) => { s.max = SYNODIC.toFixed(2); });

// The age line under the sky view is a second handle on the same age: drag it sideways, or use the arrow keys.
// Its full width sweeps one whole cycle (29.53 days). A mostly vertical drag is left to scroll the page.
const scrub = document.querySelector('.scrub'), scrubOut = document.getElementById('ageScrub');
const clampAge = (a) => Math.min(SYNODIC, Math.max(0, a));
let drag = null, dragged = false;
scrub.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  drag = { id: e.pointerId, x: e.clientX, y: e.clientY, from: age, mode: null }; dragged = false;
});
scrub.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (!drag.mode) {
    if (Math.hypot(dx, dy) < 6) return;
    drag.mode = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
    if (drag.mode === 'v') { drag = null; return; }
    scrub.setPointerCapture(e.pointerId); scrub.classList.add('grabbing'); dragged = true; clearBeat();
  }
  e.preventDefault();
  age = clampAge(drag.from + (dx / scrub.clientWidth) * SYNODIC); render();
});
const endDrag = () => { drag = null; scrub.classList.remove('grabbing'); };
scrub.addEventListener('pointerup', endDrag); scrub.addEventListener('pointercancel', endDrag);
// A drag ends with a click on the label, which would otherwise move focus to the slider.
scrub.addEventListener('click', (e) => { if (dragged) { e.preventDefault(); dragged = false; } });
scrubOut.addEventListener('keydown', (e) => {
  const step = e.shiftKey ? 1 : 0.1;
  const next = { ArrowLeft: age - step, ArrowDown: age - step, ArrowRight: age + step, ArrowUp: age + step, Home: 0, End: SYNODIC }[e.key];
  if (next === undefined) return;
  e.preventDefault(); clearBeat(); age = clampAge(next); render();
});

const wrapAge = (a) => ((a % SYNODIC) + SYNODIC) % SYNODIC;

function render() {
  const r = sky.render(age, t);
  if (orbit) orbit.update(r.st);
  ageSliders.forEach((s) => { s.value = age; }); timeSliders.forEach((s) => { s.value = t; });
  const ageText = `Day ${age.toFixed(1)} of 29.53 · ${phaseName(age)} · ${Math.round(r.st.lit * 100)}% lit`;
  document.querySelectorAll('.ageOut').forEach((o) => { o.textContent = ageText; });
  scrubOut.setAttribute('aria-valuenow', age.toFixed(2)); scrubOut.setAttribute('aria-valuetext', ageText);
  document.querySelectorAll('.timeOut').forEach((o) => { o.textContent = clock(t); });
  // Phase name from the same lit percentage, shown in the 3D panel's top corner.
  $('phaseTag').innerHTML = `${phaseName(age)}<small>${Math.round(r.st.lit * 100)}% lit</small>`;
}
document.querySelector('.place').textContent = `${LAT}°N – ${PLACE}`;

ageSliders.forEach((s) => s.addEventListener('input', () => { clearBeat(); age = +s.value; render(); }));
// Moving the clock moves the Moon along too: it keeps ageing as the hours pass.
timeSliders.forEach((s) => s.addEventListener('input', () => {
  clearBeat();
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
  b: { q: 'THEN it set exactly as the sun came up — that was the full moon.',
       n: (p) => `Sun and Moon 180° apart, Earth between them. Moonset ${clock(p.set)}, sunrise ${clock(SUN_EVENTS.rise)}: one goes down as the other comes up.` },
  c: { q: 'NOW the moon is lingering in the daytime sky in the west, setting AFTER the sun has already come up.',
       n: (p) => `Past full, the Moon has slipped behind: it is more than 180° round from the Sun. Sunrise ${clock(SUN_EVENTS.rise)}, but the Moon does not set until ${clock(p.set)}.` },
  d: { q: 'So for the next two weeks we’ll enjoy a daytime moon, but it will be shrinking, getting more slender every day until, finally we don’t see it at all because it’s rising AT THE SAME TIME as the sun.',
       n: (p) => `New moon: same direction as the Sun, its lit half facing away from us. Moonrise ${clock(p.rise)}, sunrise ${clock(SUN_EVENTS.rise)}.` },
};

function clearBeat() { document.querySelectorAll('.beat').forEach((b) => b.setAttribute('aria-pressed', 'false')); }
function showBeat(key) {
  [age, t] = BEATS[key]();
  document.querySelectorAll('.beat').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.beat === key)));
  const p = pass(age, t, 'moon');
  $('captionQuote').innerHTML = `“${CAPTIONS[key].q}”`;
  $('captionNote').textContent = CAPTIONS[key].n(p);
  render();
}
document.querySelectorAll('.beat').forEach((b) => b.addEventListener('click', () => showBeat(b.dataset.beat)));

$('reset').addEventListener('click', () => orbit && orbit.resetView());

new ResizeObserver(() => { sky.layout(); sky.rerender(); }).observe($('sky'));

showBeat('c');

// The 3D view loads after the first sky render so a slow phone still gets something on screen at once.
import('./orbit3d.js').then(({ createOrbit }) => {
  orbit = createOrbit($('orbit'), $('orbitLabels'));
  render();
}).catch((e) => { $('orbit').textContent = '3D view could not start on this device: ' + e.message; });

const level2 = createLevel2($('level2'));
const level3 = createLevel3($('level3'));
level2.render(); level3.render();

// One level at a time. The page opens on level 1; the buttons at the bottom of each level go on or back.
// The level lives in the address (#level2, #level3) so the browser's back button steps back too.
// Each level keeps its own slider values while hidden, so moving between levels resets nothing.
const levels = [...document.querySelectorAll('.level')];
function showLevel() {
  const n = { '#level2': 2, '#level3': 3, '#level4': 4 }[location.hash] || 1;
  levels.forEach((l, i) => { l.hidden = i + 1 !== n; });
  scrollTo(0, 0);
}
// The level links are real links (#level1 … #level4), so they can be opened in a new tab, copied or long-pressed.
// A plain click adds a history entry and shows the level without the browser's jump to the anchor;
// a click with a modifier key is left to the browser.
document.querySelectorAll('a.go').forEach((a) => a.addEventListener('click', (e) => {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  history.pushState(null, '', a.hash);
  showLevel();
}));
addEventListener('hashchange', showLevel);
addEventListener('popstate', showLevel);
showLevel();

window.__moon = { level2, level3, get: () => ({ age, t, st: state(age, t) }), showBeat };
