// Levels 2 and 3: the real sky. Sun and Moon on the ecliptic (the Moon's own 5.1-degree tilt left out),
// the Sun placed by date. Level 2: how high the Moon rides through the month and the year.
// Level 3: the angle of the lit edge as the Moon crosses the sky.
import { SYNODIC, LAT, HORIZON, state, eclToEq, elongation, sunLonForDay, transitAlt, clock, phaseName } from './astro.js';

const D = Math.PI / 180;
const AZ_MIN = 40, AZ_MAX = 320;
const COL = { sun: '#ffc850', moon: '#dfe5f2', grid: '#232b44', ink: '#9aa6bf', text: '#e6e9f2', ground: '#0b1a12', sky: '#0d1430' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MDAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
export function dateLabel(doy) {
  let d = Math.round(doy), m = 0;
  while (m < 11 && d > MDAYS[m]) { d -= MDAYS[m]; m++; }
  return `${d} ${MONTHS[m]}`;
}

function fitCanvas(canvas) {
  const r = canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
  const g = canvas.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { g, W: r.width, H: r.height };
}

// A south-facing sky frame: azimuth across (east left, west right), altitude up.
function skyFrame(W, H, altMax, bottomPad = 26) {
  const pad = 12, top = 14, base = H - bottomPad;
  const x = (az) => pad + ((az - AZ_MIN) / (AZ_MAX - AZ_MIN)) * (W - 2 * pad);
  const y = (alt) => base - (alt / altMax) * (base - top);
  return { pad, top, base, x, y, kx: (W - 2 * pad) / (AZ_MAX - AZ_MIN), ky: (base - top) / altMax };
}
function drawFrame(g, f, W, H, altMax) {
  g.fillStyle = COL.sky; g.fillRect(0, 0, W, f.base);
  g.fillStyle = COL.ground; g.fillRect(0, f.base, W, H - f.base);
  g.strokeStyle = COL.grid; g.lineWidth = 1; g.font = '11px system-ui, sans-serif'; g.fillStyle = COL.ink;
  for (let a = 20; a < altMax; a += 20) {
    g.beginPath(); g.moveTo(f.pad, f.y(a)); g.lineTo(W - f.pad, f.y(a)); g.stroke();
    g.fillText(`${a}°`, f.pad + 2, f.y(a) - 3);
  }
  g.strokeStyle = '#3a6b4a'; g.beginPath(); g.moveTo(0, f.base); g.lineTo(W, f.base); g.stroke();
  g.textAlign = 'center';
  for (const [az, n] of [[90, 'E'], [135, 'SE'], [180, 'S'], [225, 'SW'], [270, 'W']]) g.fillText(n, f.x(az), f.base + 15);
  g.textAlign = 'left';
}
// Path of a body of fixed declination through a whole day, as points above the horizon.
function arcPoints(dec) {
  const pts = [];
  for (let H = -180; H <= 180; H += 1) {
    const h = H * D, d = dec * D, v = [Math.cos(d) * Math.cos(h), Math.sin(d), Math.cos(d) * Math.sin(h)];
    const alt = Math.asin(v[0] * HORIZON.UP[0] + v[1] * HORIZON.UP[1]) / D;
    let az = Math.atan2(-v[2], v[0] * HORIZON.NORTH[0] + v[1] * HORIZON.NORTH[1]) / D; if (az < 0) az += 360;
    pts.push({ alt, az });
  }
  return pts;
}
function strokeArc(g, f, pts, colour, dash, width = 2.5) {
  g.save(); g.strokeStyle = colour; g.lineWidth = width; g.setLineDash(dash); g.beginPath();
  let on = false;
  for (const p of pts) {
    if (p.alt < 0 || p.az < AZ_MIN || p.az > AZ_MAX) { on = false; continue; }
    if (on) g.lineTo(f.x(p.az), f.y(p.alt)); else { g.moveTo(f.x(p.az), f.y(p.alt)); on = true; }
  }
  g.stroke(); g.restore();
}
function label(g, text, x, y, colour, align = 'center') {
  g.save(); g.font = '600 12px system-ui, sans-serif'; g.textAlign = align;
  const w = g.measureText(text).width, bx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(bx - 4, y - 12, w + 8, 16);
  g.fillStyle = colour; g.fillText(text, x, y); g.restore();
}

// The Moon's declination at moon age `age` when the Sun is at ecliptic longitude sunLon.
const moonDec = (age, sunLon) => eclToEq(sunLon + elongation(age)).dec;

// ---------------- Level 2 ----------------
export function createLevel2(root) {
  const arcs = root.querySelector('#arcs'), month = root.querySelector('#monthChart');
  const dateS = root.querySelector('#date2'), ageS = root.querySelector('#age3');
  const out = { date: root.querySelector('.dateOut'), age: root.querySelector('.age3Out'), read: root.querySelector('#heightRead') };
  ageS.max = SYNODIC.toFixed(2);
  let doy = 331, age = SYNODIC / 2;
  const ALT_MAX = 75;

  function render() {
    const sunLon = sunLonForDay(doy), sunDec = eclToEq(sunLon).dec, mDec = moonDec(age, sunLon);
    dateS.value = doy; ageS.value = age;
    out.date.textContent = dateLabel(doy);
    out.age.textContent = `Day ${age.toFixed(1)} · ${phaseName(age)}`;
    const sunTop = transitAlt(sunDec), moonTop = transitAlt(mDec);
    out.read.innerHTML = `<span class="sunT">Sun's highest: ${sunTop.toFixed(0)}°</span> · <span class="moonT">Moon's highest: ${moonTop.toFixed(0)}°</span>`;

    // Arcs: the Sun's path today (dashed), the Moon's path at this phase (solid), and, ghosted, the
    // level-1 arc (Sun and Moon on the celestial equator) for comparison.
    let { g, W, H } = fitCanvas(arcs);
    let f = skyFrame(W, H, ALT_MAX);
    drawFrame(g, f, W, H, ALT_MAX);
    strokeArc(g, f, arcPoints(0), 'rgba(230,233,242,0.28)', [2, 5], 2);
    strokeArc(g, f, arcPoints(sunDec), COL.sun, [7, 5]);
    strokeArc(g, f, arcPoints(mDec), COL.moon, []);
    const ySun = f.y(Math.max(sunTop, 0)), yMoon = f.y(Math.max(moonTop, 0));
    const close = Math.abs(ySun - yMoon) < 18;
    label(g, `Moon ${moonTop.toFixed(0)}°`, f.x(180) + (close ? 46 : 0), yMoon - 6, COL.moon);
    label(g, `Sun ${sunTop.toFixed(0)}°`, f.x(180) - (close ? 46 : 0), ySun - 6, COL.sun);
    label(g, 'level 1 arc', f.x(250), f.y(transitAlt(0) * 0.72) - 4, COL.ink);

    // Month chart: the Moon's highest altitude on each day of this month, Sun's as a flat dashed line.
    ({ g, W, H } = fitCanvas(month));
    const pad = { l: 34, r: 10, t: 10, b: 30 };
    const x = (a) => pad.l + (a / SYNODIC) * (W - pad.l - pad.r);
    const y = (alt) => H - pad.b - (alt / 80) * (H - pad.t - pad.b);
    g.fillStyle = '#0f1424'; g.fillRect(0, 0, W, H);
    g.font = '11px system-ui, sans-serif'; g.strokeStyle = COL.grid; g.fillStyle = COL.ink; g.lineWidth = 1;
    for (let a = 0; a <= 80; a += 20) { g.beginPath(); g.moveTo(pad.l, y(a)); g.lineTo(W - pad.r, y(a)); g.stroke(); g.fillText(`${a}°`, 4, y(a) + 4); }
    g.textAlign = 'center';
    [['New', 0], ['1st Q', SYNODIC / 4], ['Full', SYNODIC / 2], ['Last Q', (3 * SYNODIC) / 4], ['New', SYNODIC]]
      .forEach(([n, a], i, arr) => { g.textAlign = i === 0 ? 'left' : i === arr.length - 1 ? 'right' : 'center'; g.fillText(n, x(a), H - 10); });
    g.textAlign = 'left';
    g.save(); g.strokeStyle = COL.sun; g.lineWidth = 2; g.setLineDash([7, 5]);
    g.beginPath(); g.moveTo(pad.l, y(sunTop)); g.lineTo(W - pad.r, y(sunTop)); g.stroke(); g.restore();
    g.strokeStyle = COL.moon; g.lineWidth = 2; g.beginPath();
    for (let a = 0; a <= SYNODIC + 1e-9; a += 0.1) { const v = y(transitAlt(moonDec(a, sunLon))); a === 0 ? g.moveTo(x(a), v) : g.lineTo(x(a), v); }
    g.stroke();
    g.fillStyle = COL.moon; g.strokeStyle = '#0f1424'; g.lineWidth = 2;
    g.beginPath(); g.arc(x(age), y(moonTop), 6, 0, 2 * Math.PI); g.fill(); g.stroke();
    label(g, 'Sun', W - pad.r - 2, y(sunTop) - 6, COL.sun, 'right');
    label(g, 'Moon', pad.l + 4, y(transitAlt(moonDec(0, sunLon))) - 8, COL.moon, 'left');
  }

  dateS.addEventListener('input', () => { doy = +dateS.value; render(); });
  ageS.addEventListener('input', () => { age = +ageS.value; render(); });
  // Tap or drag on the month chart to choose the day of the month.
  const scrub = (e) => {
    const r = month.getBoundingClientRect(), W = r.width;
    age = Math.max(0, Math.min(SYNODIC, ((e.clientX - r.left - 34) / (W - 44)) * SYNODIC)); render();
  };
  month.addEventListener('pointerdown', (e) => { month.setPointerCapture(e.pointerId); scrub(e); });
  month.addEventListener('pointermove', (e) => { if (e.buttons) scrub(e); });
  root.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => {
    const [d, a] = b.dataset.preset.split(','); doy = +d; age = a === 'full' ? SYNODIC / 2 : +a; render();
  }));
  new ResizeObserver(render).observe(arcs);
  return { render, get: () => ({ doy, age }) };
}

// ---------------- Level 3 ----------------
// Direction toward the Sun as seen on the sky at the Moon's position, as an angle on screen
// (0 = toward the right/west, +90 = straight up). The lit edge faces that way; the terminator is square to it.
export function litAngle(st) {
  const m = st.moonDir, s = st.sunDir, { UP, NORTH, EAST } = HORIZON;
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const sm = dot(s, m), t = [s[0] - sm * m[0], s[1] - sm * m[1], s[2] - sm * m[2]];
  const A = st.moon.az * D, a = st.moon.alt * D;
  const eAz = [0, 1, 2].map((i) => -Math.sin(A) * NORTH[i] + Math.cos(A) * EAST[i]);
  const eAlt = [0, 1, 2].map((i) => -Math.sin(a) * Math.cos(A) * NORTH[i] - Math.sin(a) * Math.sin(A) * EAST[i] + Math.cos(a) * UP[i]);
  return Math.atan2(dot(t, eAlt), dot(t, eAz)) / D;
}
export function describeTilt(phi) {
  const tilt = Math.min(Math.abs(phi), 180 - Math.abs(phi));   // terminator's angle from upright
  if (tilt < 20) return `terminator nearly upright (${tilt.toFixed(0)}° from vertical)`;
  if (tilt > 70) return phi < 0 ? `lit from below, terminator nearly level (${tilt.toFixed(0)}° from vertical)` : `lit from above, terminator nearly level (${tilt.toFixed(0)}° from vertical)`;
  return `terminator tilted ${tilt.toFixed(0)}° from vertical, lit side toward the ${phi < 0 ? 'lower' : 'upper'} ${Math.abs(phi) < 90 ? 'right' : 'left'}`;
}
function drawMoon(g, cx, cy, r, phi, E, highlight) {
  const c = Math.cos(E * D);
  g.save(); g.translate(cx, cy); g.rotate(-phi * D);
  g.fillStyle = '#2a3048'; g.beginPath(); g.arc(0, 0, r, 0, 2 * Math.PI); g.fill();
  g.fillStyle = COL.moon; g.beginPath();
  for (let k = 0; k <= 40; k++) { const th = -Math.PI / 2 + (k / 40) * Math.PI; g.lineTo(r * Math.cos(th), r * Math.sin(th)); }
  for (let k = 0; k <= 40; k++) { const yy = r - (k / 40) * 2 * r; g.lineTo(c * Math.sqrt(Math.max(0, r * r - yy * yy)), yy); }
  g.fill();
  if (highlight) { g.strokeStyle = COL.sun; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, r + 4, 0, 2 * Math.PI); g.stroke(); }
  g.restore();
}

export function createLevel3(root) {
  const canvas = root.querySelector('#tilt'), ageS = root.querySelector('#age4'), timeS = root.querySelector('#time4');
  const out = { age: root.querySelector('.age4Out'), time: root.querySelector('.time4Out'), read: root.querySelector('#tiltRead') };
  ageS.max = SYNODIC.toFixed(2);
  const doy = 331, sunLon = sunLonForDay(doy);
  let age = 4.5, t = 17.5;
  const ALT_MAX = 75;
  const at = (tau) => state(age + (tau - t) / 24, tau, true, sunLon);

  function render() {
    ageS.value = age; timeS.value = t;
    const st = at(t);
    out.age.textContent = `Day ${age.toFixed(1)} · ${phaseName(age)} · ${Math.round(st.lit * 100)}% lit`;
    out.time.textContent = clock(t);
    const { g, W, H } = fitCanvas(canvas);
    const f = skyFrame(W, H, ALT_MAX);
    drawFrame(g, f, W, H, ALT_MAX);
    if (st.sun.alt > 0) { g.fillStyle = COL.sun; g.beginPath(); g.arc(f.x(st.sun.az), f.y(st.sun.alt), 9, 0, 2 * Math.PI); g.fill(); }
    // The Moon every 1.5 hours across the 24 hours around the chosen moment, then the chosen moment.
    const r = Math.max(11, Math.min(18, W / 26));
    for (let tau = t - 12; tau <= t + 12; tau += 1.5) {
      if (Math.abs(tau - t) < 0.75) continue;
      const s = at(tau);
      if (s.moon.alt < 1 || s.moon.az < AZ_MIN || s.moon.az > AZ_MAX) continue;
      drawMoon(g, f.x(s.moon.az), f.y(s.moon.alt), r * 0.8, litAngle(s), s.E, false);
      g.fillStyle = COL.ink; g.font = '10px system-ui, sans-serif'; g.textAlign = 'center';
      const below = f.y(s.moon.alt) + r + 6 < f.base - 2;   // label under the Moon, or above it near the horizon
      g.fillText(clock(((tau % 24) + 24) % 24).replace(':00', '').replace(' ', ''), f.x(s.moon.az), below ? f.y(s.moon.alt) + r + 6 : f.y(s.moon.alt) - r - 3);
    }
    if (st.moon.alt > 0) {
      const phi = litAngle(st);
      drawMoon(g, f.x(st.moon.az), f.y(st.moon.alt), r * 1.25, phi, st.E, true);
      out.read.textContent = `${clock(t)}, Moon ${st.moon.alt.toFixed(0)}° up: ${describeTilt(phi)}.`;
    } else {
      out.read.textContent = `${clock(t)}: the Moon is below the horizon. Move the time to see it.`;
    }
  }
  ageS.addEventListener('input', () => { age = +ageS.value; render(); });
  timeS.addEventListener('input', () => { const nt = +timeS.value; age = ((age + (nt - t) / 24) % SYNODIC + SYNODIC) % SYNODIC; t = nt; render(); });
  root.querySelectorAll('[data-tilt]').forEach((b) => b.addEventListener('click', () => {
    const [a, tt] = b.dataset.tilt.split(',').map(Number); age = a; t = tt; render();
  }));
  new ResizeObserver(render).observe(canvas);
  return { render, get: () => ({ age, t, phi: litAngle(at(t)), st: at(t) }) };
}
