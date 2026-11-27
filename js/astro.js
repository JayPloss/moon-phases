// Standard spherical astronomy for the page. No fitted constants: every number below is a
// published astronomical value or a choice of place and season stated on the page.

export const SYNODIC = 29.530589;   // days, new moon to new moon
export const SIDEREAL = 27.321662;  // days, one orbit relative to the stars
export const OBLIQUITY = 23.44;     // degrees, tilt of Earth's axis to the ecliptic
export const MOON_INCL = 5.14;      // degrees, tilt of the Moon's orbit to the ecliptic
export const LAT = 45.2;            // degrees north: Knowlton, Quebec (45.217 N, 72.519 W, Wikipedia)
export const PLACE = 'Knowlton, QC';
// Sun's ecliptic longitude on 27 November (it moves ~1 degree a day; held fixed on the page).
export const SUN_LON = 245.0;
// Simplified model (this version): Sun and Moon both travel the celestial equator, as the Sun does at
// the equinoxes, so the Moon's daily arc has exactly the Sun's shape and only its timing changes with
// phase. The Sun-Earth-Moon angle is still exactly the elongation, so the phases are unchanged.
// Set SIMPLE = false to put both back on the ecliptic (real seasonal Sun, Moon riding high and low).
export const SIMPLE = true;

const D = Math.PI / 180;

// Ecliptic longitude (latitude 0) -> right ascension and declination, degrees.
export function eclToEq(lon) {
  const l = lon * D, e = OBLIQUITY * D;
  const x = Math.cos(l), y = Math.cos(e) * Math.sin(l), z = Math.sin(e) * Math.sin(l);
  return { ra: Math.atan2(y, x) / D, dec: Math.asin(z) / D };
}

// Earth-fixed frame used by both views (Earth does not spin, the sky turns around it):
//   +Y = north celestial pole, +X = toward the observer's meridian (south of the zenith side),
//   -Z = east. A body at hour angle H (west positive) and declination dec points along
//   (cos dec cos H, sin dec, cos dec sin H).
export function dirFromHaDec(H, dec) {
  const h = H * D, d = dec * D;
  return [Math.cos(d) * Math.cos(h), Math.sin(d), Math.cos(d) * Math.sin(h)];
}

// Horizon basis for the observer at latitude LAT.
const UP = [Math.cos(LAT * D), Math.sin(LAT * D), 0];
const NORTH = [-Math.sin(LAT * D), Math.cos(LAT * D), 0];
const EAST = [0, 0, -1];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const HORIZON = { UP, NORTH, EAST };

export function altAz(v) {
  const alt = Math.asin(Math.max(-1, Math.min(1, dot(v, UP)))) / D;
  let az = Math.atan2(dot(v, EAST), dot(v, NORTH)) / D;  // from north through east
  if (az < 0) az += 360;
  return { alt, az };
}

// Where a body at longitude `lon` along the shared path sits on the sky, in RA and declination.
export const pathToEq = (lon, simple = SIMPLE) => (simple ? { ra: ((lon % 360) + 360) % 360, dec: 0 } : eclToEq(lon));
// The pole of that path (for the 3D home view): the celestial pole when SIMPLE, else the ecliptic pole.
export const PATH_POLE_DEC = SIMPLE ? 90 : 90 - OBLIQUITY;

const SUN_EQ = pathToEq(SUN_LON);

// Elongation (Moon east of Sun along the ecliptic) for a moon age in days.
export const elongation = (age) => (((age / SYNODIC) * 360) % 360 + 360) % 360;

// Full state at local solar clock time t (hours) for moon age (days since new) at that moment.
// Level 1 uses the defaults (simplified paths). Levels 2 and 3 pass real = true and the Sun's ecliptic
// longitude for the date: Sun and Moon on the ecliptic (the Moon's own 5.1-degree tilt still left out).
export function state(age, t, real = false, sunLon = SUN_LON) {
  const sunEq = real ? eclToEq(sunLon) : SUN_EQ;
  const Hs = (t - 12) * 15;                 // Sun's hour angle: noon = due south
  const lst = sunEq.ra + Hs;                // local sidereal time, degrees
  const E = elongation(age);
  const moonLon = sunLon + E;
  const m = pathToEq(moonLon, real ? false : SIMPLE);
  const sunDir = dirFromHaDec(Hs, sunEq.dec);
  const moonDir = dirFromHaDec(lst - m.ra, m.dec);
  return {
    t, age, E, lst, moonLon,
    sunDir, moonDir,
    sun: { ...altAz(sunDir), dec: sunEq.dec },
    moon: { ...altAz(moonDir), dec: m.dec },
    // Illuminated fraction from the Sun-Earth-Moon angle (Sun treated as infinitely far).
    lit: (1 - Math.cos(E * D)) / 2,
  };
}

// Track over the displayed day (00:00 to 24:00) when the shown moment is clock t with moon age
// `age`; the Moon keeps ageing through the day (about 12.2 degrees per day east of the Sun).
export function dayTrack(age, t, step = 1 / 60) {
  const pts = [];
  for (let tau = 0; tau <= 24 + 1e-9; tau += step) pts.push(state(age + (tau - t) / 24, tau));
  return pts;
}

// Rise and set clock times (geometric centre on the horizon, no refraction) found by scanning
// the day minute by minute and refining each crossing by bisection.
export function events(age, t, body) {
  const f = (tau) => state(age + (tau - t) / 24, tau)[body].alt;
  const out = { rise: null, set: null };
  let prevT = 0, prev = f(0);
  for (let i = 1; i <= 24 * 60; i++) {
    const tau = i / 60, cur = f(tau);
    if ((prev < 0) !== (cur < 0)) {
      let a = prevT, b = tau, fa = prev;
      for (let k = 0; k < 30; k++) {
        const m = (a + b) / 2, fm = f(m);
        if ((fa < 0) === (fm < 0)) { a = m; fa = fm; } else b = m;
      }
      const when = (a + b) / 2;
      if (prev < 0) out.rise = when; else out.set = when;
    }
    prevT = tau; prev = cur;
  }
  return out;
}

export function clock(h) {
  if (h == null) return '—';
  let mins = Math.round(h * 60);
  mins = ((mins % 1440) + 1440) % 1440;
  const hh = Math.floor(mins / 60), mm = mins % 60;
  const ap = hh < 12 ? 'am' : 'pm';
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${String(mm).padStart(2, '0')} ${ap}`;
}

export function phaseName(age) {
  const E = elongation(age);
  if (E < 6 || E > 354) return 'New moon';
  if (E < 84) return 'Waxing crescent';
  if (E < 96) return 'First quarter';
  if (E < 174) return 'Waxing gibbous';
  if (E < 186) return 'Full moon';
  if (E < 264) return 'Waning gibbous';
  if (E < 276) return 'Last quarter';
  return 'Waning crescent';
}

// Sunrise / sunset for the fixed season (the Sun's declination does not depend on moon age).
export const SUN_EVENTS = events(0, 12, 'sun');

// Horizon crossings of `body` in a window around the shown moment, ageing the Moon with time.
function crossings(age, t, body, from, to) {
  const f = (tau) => state(age + (tau - t) / 24, tau)[body].alt;
  const out = [];
  let prevT = from, prev = f(from);
  for (let tau = from + 1 / 60; tau <= to + 1e-9; tau += 1 / 60) {
    const cur = f(tau);
    if ((prev < 0) !== (cur < 0)) {
      let a = prevT, b = tau, fa = prev;
      for (let k = 0; k < 30; k++) {
        const m = (a + b) / 2, fm = f(m);
        if ((fa < 0) === (fm < 0)) { a = m; fa = fm; } else b = m;
      }
      out.push({ at: (a + b) / 2, kind: prev < 0 ? 'rise' : 'set' });
    }
    prevT = tau; prev = cur;
  }
  return out;
}

// The pass above the horizon that is on now, or the next one if the body is down at clock t.
// Times can fall on the day before (< 0) or the next day (>= 24).
export function pass(age, t, body) {
  const xs = crossings(age, t, body, t - 30, t + 30);
  const up = state(age, t)[body].alt > 0;
  let rise, set;
  if (up) {
    rise = [...xs].reverse().find((x) => x.kind === 'rise' && x.at <= t);
    set = xs.find((x) => x.kind === 'set' && x.at > t);
  } else {
    rise = xs.find((x) => x.kind === 'rise' && x.at > t);
    set = rise && xs.find((x) => x.kind === 'set' && x.at > rise.at);
  }
  return { up, rise: rise ? rise.at : null, set: set ? set.at : null };
}

export function dayTag(h) {
  if (h == null) return '';
  if (h < 0) return ' (day before)';
  if (h >= 24) return ' (next day)';
  return '';
}

// Hours above the horizon for the pass on now (or the next one), and how much of it the Sun is also up.
export function hoursUp(age, t) {
  const p = pass(age, t, 'moon');
  if (p.rise == null || p.set == null) return null;
  let day = 0;
  const n = Math.max(1, Math.round((p.set - p.rise) * 60));
  for (let i = 0; i < n; i++) {
    const tau = p.rise + ((i + 0.5) / n) * (p.set - p.rise);
    if (state(age + (tau - t) / 24, tau).sun.alt > 0) day += (p.set - p.rise) / n;
  }
  return { up: p.set - p.rise, day };
}

// The same, averaged over one month of moon ages (sampled every quarter day, each at the age's own moonrise).
export function monthAverage() {
  let up = 0, day = 0, n = 0;
  for (let a = 0; a < SYNODIC; a += 0.25) { const h = hoursUp(a, 12); if (h) { up += h.up; day += h.day; n++; } }
  return { up: up / n, day: day / n };
}

export function hm(h) {
  const m = Math.round(h * 60);
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

// Sun's ecliptic longitude on a day of the year (1 = 1 January): mean-anomaly formula, good to about a degree.
export function sunLonForDay(doy) {
  const g = (357.53 + 0.98560 * (doy - 2)) * D;    // mean anomaly, perihelion about 3 January
  return ((280.46 + 0.98565 * (doy - 1) + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) % 360 + 360) % 360;
}
// Highest altitude of a body of declination dec as it crosses the meridian (south of the zenith here).
export const transitAlt = (dec) => 90 - LAT + dec;
