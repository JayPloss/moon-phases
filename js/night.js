// Level 4: how the Moon lights the night. Light on the ground from sunset to sunrise at Knowlton
// (45.2 N), 27 November, on a log scale: sky light from the Sun below the horizon, plus moonlight.
// Real sky (Sun and Moon on the ecliptic, as in levels 2 and 3), clock in local sun time.
//
// Twilight: Janiczek & DeYoung (1987), USNO Circular 171, sun illuminance 133775 lux x atmos(h), with
// their starlight-and-airglow floor of 0.0005 lux.
// Moonlight: Krisciunas & Schaefer (1991, PASP 103:1033), eqs. 8, 9 and 14: the Moon's V magnitude by
// phase angle (Allen 1976), turned into illuminance, dimmed by extinction k = 0.172 mag per air mass
// along the Rozenberg air mass, and spread over level ground by the sine of the Moon's altitude.
import { SYNODIC, LAT, SUN_LON, state, clock, phaseName } from './astro.js';

const D = Math.PI / 180;
export const THRESHOLD = 0.01;   // lux; our choice for "you could walk without a torch" (see the page)
export const FLOOR = 0.0005;     // lux; clear moonless sky, starlight and airglow (Janiczek & DeYoung 1987)
const K_EXT = 0.172;             // V-band extinction, mag per air mass (Krisciunas & Schaefer 1991)
const STEP = 2 / 60;             // hours between samples

// Janiczek & DeYoung's atmospheric factor for a body at altitude h degrees (works below the horizon too).
function atmos(h) {
  const U = Math.sin(h * D), X = 753.66156;
  const S = Math.asin((X * Math.cos(h * D)) / (X + 1));
  const M = X * (Math.cos(S) - U) + Math.cos(S);
  return Math.exp(-0.21 * M) * U + 0.0289 * Math.exp(-0.042 * M) * (1 + ((h + 90) * U) / 57.29577951);
}
export const twilightLux = (sunAlt) => (sunAlt < -30 ? 0 : Math.max(0, 133775 * atmos(sunAlt)));

// Moonlight on level ground, lux. E is the elongation (Sun-Earth-Moon angle); the phase angle is 180 - E.
// The phase law already holds the illuminated fraction: a half-lit Moon gives about a tenth of full, not
// half, because its rough surface is mostly in shadow when lit from the side.
export function moonLux(alt, E) {
  if (alt <= 0) return 0;
  const a = Math.abs(180 - E);
  const m = -12.73 + 0.026 * a + 4e-9 * a ** 4;               // K&S eq. 9
  const lux = 10.764 * 10 ** (-0.4 * (m + 16.57));           // K&S eq. 8, footcandles to lux
  const cz = Math.cos((90 - alt) * D);
  const X = 1 / (cz + 0.025 * Math.exp(-11 * cz));           // K&S eq. 14, air mass
  return lux * 10 ** (-0.4 * K_EXT * X) * Math.sin(alt * D);
}

// Sunset, sunrise and the twilight boundaries for the season (Sun's declination fixed for 27 November).
const sunAlt = (t) => state(0, t, true, SUN_LON).sun.alt;
function cross(a, b, level) {
  for (let k = 0; k < 40; k++) { const m = (a + b) / 2; if ((sunAlt(a) < level) === (sunAlt(m) < level)) a = m; else b = m; }
  return (a + b) / 2;
}
export const NIGHT = { set: cross(12, 23.9, 0), rise: cross(24.1, 36, 0) };
const BANDS = [0, -6, -12, -18].map((h) => ({ h, eve: cross(NIGHT.set - 0.01, 24, h), morn: cross(24, NIGHT.rise + 0.01, h) }));

// The night whose midnight finds the Moon at `age` days. Times run from sunset (about 16.5) to sunrise (about 31.5).
export function night(age) {
  const pts = [];
  for (let t = NIGHT.set; t <= NIGHT.rise + 1e-9; t += STEP) {
    const s = state(age + (t - 24) / 24, t, true, SUN_LON);
    const tw = twilightLux(s.sun.alt), mo = moonLux(s.moon.alt, s.E);
    pts.push({ t, tw, mo, tot: tw + mo + FLOOR, moonAlt: s.moon.alt });
  }
  let best = pts[0];
  for (const p of pts) if (p.mo > best.mo) best = p;
  // Stretches above the threshold.
  const runs = [];
  let start = null;
  pts.forEach((p, i) => {
    const on = p.tot >= THRESHOLD;
    if (on && start == null) start = p.t;
    if ((!on || i === pts.length - 1) && start != null) { runs.push([start, on ? p.t : pts[i - 1].t]); start = null; }
  });
  const usable = runs.reduce((s, [a, b]) => s + (b - a), 0);
  const rises = [], sets = [];
  for (let i = 1; i < pts.length; i++) {
    if (pts[i - 1].moonAlt < 0 && pts[i].moonAlt >= 0) rises.push(pts[i].t);
    if (pts[i - 1].moonAlt >= 0 && pts[i].moonAlt < 0) sets.push(pts[i].t);
  }
  const lit = (1 - Math.cos(state(age, 24, true, SUN_LON).E * D)) / 2;
  return { pts, best: best.mo > 0 ? best : null, runs, usable, rises, sets, lit };
}

export const hm = (h) => { const m = Math.round(h * 60); return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`; };
const luxText = (v) => (v >= 1 ? v.toFixed(0) : v >= 0.1 ? v.toFixed(2) : v >= 0.01 ? v.toFixed(3) : v.toFixed(4));

const COL = { ink: '#9aa6bf', grid: '#232b44', text: '#e6e9f2', sun: '#ffc850', moon: '#dfe5f2', ok: '#6fd39a' };
const BAND_FILL = ['#24345e', '#18223f', '#111831', '#0a0f1f'];
const BAND_NAME = ['civil twilight', 'nautical', 'astronomical', 'night'];
const LOG_MIN = -4, LOG_MAX = 3;

function fitCanvas(canvas) {
  const r = canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
  const g = canvas.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { g, W: r.width, H: r.height };
}

function draw(canvas, n) {
  const { g, W, H } = fitCanvas(canvas);
  if (W < 10) return;
  const L = 44, R = 10, T = 8, B = 40;
  const x = (t) => L + ((t - NIGHT.set) / (NIGHT.rise - NIGHT.set)) * (W - L - R);
  const y = (lux) => T + ((LOG_MAX - Math.log10(Math.max(lux, 10 ** LOG_MIN))) / (LOG_MAX - LOG_MIN)) * (H - T - B);
  const base = H - B;
  g.clearRect(0, 0, W, H);
  // Twilight bands, evening and morning mirrored, darkest in the middle.
  for (let i = 0; i < 4; i++) {
    const a = i === 0 ? NIGHT.set : BANDS[i].eve, b = i === 3 ? BANDS[3].morn : BANDS[i + 1].eve;
    const c = i === 0 ? NIGHT.rise : BANDS[i].morn, d = i === 3 ? BANDS[3].morn : BANDS[i + 1].morn;
    g.fillStyle = BAND_FILL[i];
    g.fillRect(x(a), T, x(b) - x(a), base - T);
    if (i < 3) g.fillRect(x(d), T, x(c) - x(d), base - T);
  }
  // Band names, written upright inside each thin band.
  g.save(); g.fillStyle = COL.ink; g.font = '11px system-ui, sans-serif'; g.textAlign = 'right';
  for (let i = 0; i < 3; i++) {
    const label = BAND_NAME[i].split(' ')[0];
    for (const [a, b] of [[i === 0 ? NIGHT.set : BANDS[i].eve, BANDS[i + 1].eve], [BANDS[i + 1].morn, i === 0 ? NIGHT.rise : BANDS[i].morn]]) {
      g.save(); g.translate((x(a) + x(b)) / 2 + 4, T + 4); g.rotate(-Math.PI / 2); g.fillText(label, 0, 0); g.restore();
    }
  }
  g.restore();
  // Decade grid and labels.
  g.font = '11px system-ui, sans-serif'; g.textAlign = 'right'; g.textBaseline = 'middle';
  for (let e = LOG_MIN; e <= LOG_MAX; e++) {
    g.strokeStyle = COL.grid; g.lineWidth = 1; g.beginPath(); g.moveTo(L, y(10 ** e)); g.lineTo(W - R, y(10 ** e)); g.stroke();
    g.fillStyle = COL.ink; g.fillText(e >= 0 ? String(10 ** e) : (10 ** e).toFixed(-e), L - 4, y(10 ** e));
  }
  g.textBaseline = 'alphabetic';
  // Hour ticks.
  g.textAlign = 'center';
  for (let h = Math.ceil(NIGHT.set); h <= NIGHT.rise; h++) {
    if (h % (W < 500 ? 2 : 1)) continue;
    g.fillStyle = COL.ink; g.fillRect(x(h), base, 1, 4);
    g.fillText(clock(h).replace(':00', ''), x(h), base + 15);
  }
  // Filled contributions.
  const area = (key, fill) => {
    g.beginPath(); g.moveTo(x(n.pts[0].t), base);
    for (const p of n.pts) g.lineTo(x(p.t), y(p[key]));
    g.lineTo(x(n.pts[n.pts.length - 1].t), base); g.closePath(); g.fillStyle = fill; g.fill();
  };
  area('tw', 'rgba(255,200,80,0.32)');
  area('mo', 'rgba(223,229,242,0.34)');
  // Threshold line.
  g.save(); g.strokeStyle = COL.ok; g.setLineDash([5, 4]); g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(L, y(THRESHOLD)); g.lineTo(W - R, y(THRESHOLD)); g.stroke(); g.restore();
  g.fillStyle = COL.ok; g.textAlign = 'right'; g.fillText(`${THRESHOLD} lux: walk without a torch`, W - R - 4, y(THRESHOLD) - 5);
  // Total light.
  g.strokeStyle = COL.text; g.lineWidth = 2; g.beginPath();
  n.pts.forEach((p, i) => (i ? g.lineTo(x(p.t), y(p.tot)) : g.moveTo(x(p.t), y(p.tot))));
  g.stroke();
  // Usable window as a green bar under the axis.
  g.fillStyle = COL.ok;
  for (const [a, b] of n.runs) g.fillRect(x(a), base + 22, Math.max(2, x(b) - x(a)), 6);
  // Most moonlight.
  if (n.best && n.best.mo >= 10 ** LOG_MIN) {
    const px = x(n.best.t), py = y(n.best.tot);
    g.strokeStyle = COL.moon; g.setLineDash([2, 3]); g.lineWidth = 1;
    g.beginPath(); g.moveTo(px, py); g.lineTo(px, base); g.stroke(); g.setLineDash([]);
    g.fillStyle = COL.moon; g.beginPath(); g.arc(px, py, 6, 0, 2 * Math.PI); g.fill();
    g.strokeStyle = '#070a14'; g.lineWidth = 2; g.stroke();
    const label = `most moonlight, ${clock(n.best.t)}`;
    g.font = '600 12px system-ui, sans-serif';
    const w = g.measureText(label).width;
    g.textAlign = 'left';
    const lx = Math.min(Math.max(px - w / 2, L + 2), W - R - w - 2);
    g.fillText(label, lx, py - 12);
  }
}

// The light at one clock time (hours from midnight before the night; evening values below 24 are 4 pm-midnight).
export function at(n, t) { return n.pts.reduce((b, p) => (Math.abs(p.t - t) < Math.abs(b.t - t) ? p : b)); }

export function createLevel4(root) {
  const canvas = root.querySelector('#night');
  const ageS = root.querySelector('#nightAge'), out = root.querySelector('.nightAgeOut'), read = root.querySelector('#nightRead');
  const presets = [...root.querySelectorAll('[data-night]')];
  ageS.max = SYNODIC.toFixed(2);
  let age = SYNODIC / 2;
  function render() {
    const n = night(age);
    ageS.value = age.toFixed(2);
    out.textContent = `${phaseName(age)}, day ${age.toFixed(1)} at midnight, ${Math.round(n.lit * 100)}% lit`;
    const span = n.runs.map(([a, b]) => `${clock(a)} – ${clock(b)}`).join(' and ');
    const moonUp = [...n.rises.map((t) => `rises ${clock(t)}`), ...n.sets.map((t) => `sets ${clock(t)}`)].join(', ');
    read.innerHTML = (n.best && n.best.mo >= 0.0005
      ? `<span class="moonT">Most moonlight: ${luxText(n.best.mo)} lux at ${clock(n.best.t)}, Moon ${n.best.moonAlt.toFixed(0)}° up.</span> `
      : '<span class="moonT">The Moon adds almost nothing tonight.</span> ')
      + `<span class="okT">Above ${THRESHOLD} lux: ${hm(n.usable)} of the ${hm(NIGHT.rise - NIGHT.set)} night${span ? ` (${span})` : ''}.</span>`
      + (moonUp ? ` <span class="dim">Moon ${moonUp}.</span>` : '');
    presets.forEach((b) => b.setAttribute('aria-pressed', String(Math.abs(+b.dataset.night - age) < 0.01)));
    draw(canvas, n);
  }
  ageS.addEventListener('input', () => { age = +ageS.value; render(); });
  presets.forEach((b) => b.addEventListener('click', () => { age = +b.dataset.night; render(); }));
  new ResizeObserver(render).observe(canvas);
  render();
  return { render, set: (a) => { age = a; render(); }, night, get: () => night(age) };
}

// Fill the page's numbers from the model, so the words cannot drift from the chart.
function fillFacts(root) {
  // The same nights the preset buttons show, so the words match the chart after a tap.
  const preset = (i) => +root.querySelectorAll('[data-night]')[i].dataset.night;
  const full = night(preset(0)), before = night(preset(1)), after = night(preset(2));
  const f = (k, v) => root.querySelectorAll(`[data-fact="${k}"]`).forEach((e) => { e.textContent = v; });
  f('fullMax', `${luxText(full.best.mo)} lux at ${clock(full.best.t)}`);
  f('fullUsable', hm(full.usable));
  f('beforeUsable', hm(before.usable));
  f('afterUsable', hm(after.usable));
  f('beforeSet', clock(before.sets[0]));
  f('afterRise', clock(after.rises[0]));
  f('full6', luxText(at(full, 18).tot));
  f('before6', luxText(at(before, 18).tot));
  f('lat', `${LAT}°N`);
}

const root = typeof document !== 'undefined' && document.getElementById('level4');
if (root) { fillFacts(root); window.__night = createLevel4(root); }
