// Sky view: an observer at LAT degrees north (js/astro.js) facing south, east on the left, west on the right.
import { state, pass, dayTrack, clock, dayTag, SUN_EVENTS, HORIZON } from './astro.js';

const AZ_MIN = 40, AZ_MAX = 320, ALT_MAX = 80;
const D = Math.PI / 180;

export function createSky(canvas) {
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, dpr = 1, last = null;
  // Fixed star field (decorative, shown only at night).
  const stars = Array.from({ length: 90 }, (_, i) => {
    const r = Math.sin(i * 12.9898) * 43758.5453;
    const r2 = Math.sin(i * 78.233) * 12345.678;
    return { x: r - Math.floor(r), y: r2 - Math.floor(r2), s: (i % 3) * 0.4 + 0.6 };
  });

  function layout() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = rect.width; H = rect.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  const geo = () => {
    const pad = 14, horizonY = H - 118, top = 20;
    return {
      pad, horizonY, top, stripTop: horizonY + 66,
      kx: (W - 2 * pad) / (AZ_MAX - AZ_MIN),
      ky: (horizonY - top) / ALT_MAX,
    };
  };
  const toXY = (g, az, alt) => [g.pad + (az - AZ_MIN) * g.kx, g.horizonY - alt * g.ky];

  function skyColour(sunAlt) {
    // Day blue -> twilight -> night, by the Sun's altitude.
    const mix = (a, b, f) => a.map((v, i) => Math.round(v + (b[i] - v) * f));
    const day = [[58, 120, 196], [140, 186, 230]];
    const dusk = [[34, 46, 96], [196, 110, 80]];
    const night = [[6, 10, 26], [14, 22, 48]];
    let top, bot;
    if (sunAlt >= 6) { [top, bot] = day; }
    else if (sunAlt >= -2) { const f = (6 - sunAlt) / 8; top = mix(day[0], dusk[0], f); bot = mix(day[1], dusk[1], f); }
    else if (sunAlt >= -12) { const f = (-2 - sunAlt) / 10; top = mix(dusk[0], night[0], f); bot = mix(dusk[1], night[1], f); }
    else { [top, bot] = night; }
    return [`rgb(${top})`, `rgb(${bot})`];
  }

  function drawTrack(g, pts, body, colour) {
    ctx.save();
    ctx.strokeStyle = colour; ctx.lineWidth = 2; ctx.setLineDash([5, 5]);
    ctx.beginPath();
    let prev = null;
    for (const p of pts) {
      const s = p[body];
      const visible = s.alt >= 0 && s.az >= AZ_MIN && s.az <= AZ_MAX;
      const [x, y] = toXY(g, s.az, Math.max(s.alt, 0));
      if (visible && prev && Math.abs(s.az - prev.az) < 60) ctx.lineTo(x, y);
      else if (visible) ctx.moveTo(x, y);
      prev = visible ? s : null;
    }
    ctx.stroke();
    ctx.restore();
  }

  // Screen angle of the bright limb: the Sun's direction projected onto the sky at the Moon,
  // expressed in this chart's azimuth/altitude axes.
  function brightLimbAngle(st, g) {
    const m = st.moonDir, s = st.sunDir;
    const { UP, NORTH, EAST } = HORIZON;
    const alt = st.moon.alt * D, az = st.moon.az * D;
    const eAlt = [0, 1, 2].map((i) => -Math.sin(alt) * (Math.cos(az) * NORTH[i] + Math.sin(az) * EAST[i]) + Math.cos(alt) * UP[i]);
    const eAz = [0, 1, 2].map((i) => -Math.sin(az) * NORTH[i] + Math.cos(az) * EAST[i]);
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const k = dot(s, m);
    const sp = s.map((v, i) => v - k * m[i]);            // Sun direction in the sky plane at the Moon
    const dAz = dot(sp, eAz) / Math.max(Math.cos(alt), 1e-6); // degrees of azimuth per unit
    const dAlt = dot(sp, eAlt);
    return Math.atan2(-dAlt * g.ky, dAz * g.kx);
  }

  // Moon disc: the lit half faces the Sun; the terminator is the projection of the
  // circle dividing lit from dark, an ellipse of half-width r*|cos(phase angle)|.
  function drawMoon(x, y, r, st, g, daylight) {
    const angle = brightLimbAngle(st, g);
    const i = Math.PI - st.E * D;          // phase angle (Sun-Moon-Earth), Sun at infinity
    const c = Math.cos(i);                  // -1 new, +1 full
    ctx.save();
    ctx.translate(x, y); ctx.rotate(angle);
    if (!daylight) { ctx.fillStyle = 'rgba(60,66,82,0.9)'; ctx.beginPath(); ctx.arc(0, 0, r, 0, 2 * Math.PI); ctx.fill(); }
    ctx.fillStyle = '#f4f1e6';
    ctx.beginPath();
    ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);   // bright limb on +x (toward the Sun)
    // terminator back from bottom to top; bulges toward the Sun (crescent) or away (gibbous)
    ctx.ellipse(0, 0, Math.abs(c) * r, r, 0, Math.PI / 2, -Math.PI / 2, c < 0);
    ctx.fill();
    ctx.strokeStyle = daylight ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, r, 0, 2 * Math.PI); ctx.stroke();
    ctx.restore();
  }

  function label(text, x, y, colour, align = 'center') {
    ctx.font = '600 12px system-ui, sans-serif';
    const w = ctx.measureText(text).width;
    let lx = align === 'center' ? x - w / 2 : x;
    lx = Math.max(4, Math.min(W - w - 4, lx));
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(lx - 4, y - 12, w + 8, 17);
    ctx.fillStyle = colour; ctx.fillText(text, lx, y);
  }

  function render(age, t) {
    last = [age, t];
    if (!W) layout();
    const g = geo();
    const st = state(age, t);
    const [skyTop, skyBot] = skyColour(st.sun.alt);
    const grad = ctx.createLinearGradient(0, 0, 0, g.horizonY);
    grad.addColorStop(0, skyTop); grad.addColorStop(1, skyBot);
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, g.horizonY);
    if (st.sun.alt < -8) {
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      for (const s of stars) { ctx.beginPath(); ctx.arc(s.x * W, s.y * (g.horizonY - 6), s.s, 0, 7); ctx.fill(); }
    }
    ctx.fillStyle = '#0d1410'; ctx.fillRect(0, g.horizonY, W, H - g.horizonY);
    ctx.strokeStyle = '#3d5a45'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, g.horizonY); ctx.lineTo(W, g.horizonY); ctx.stroke();

    // Compass points along the horizon.
    ctx.font = '700 12px system-ui, sans-serif'; ctx.fillStyle = '#8fb39a'; ctx.textAlign = 'center';
    for (const [n, az] of [['NE', 45], ['E', 90], ['SE', 135], ['S', 180], ['SW', 225], ['W', 270], ['NW', 315]]) {
      const [x] = toXY(g, az, 0); ctx.fillText(n, x, g.horizonY + 14);
    }
    ctx.textAlign = 'left';

    // Each body's pass across the sky, rise to set (the Moon's may span midnight).
    const track = dayTrack(age, t, 1 / 12);
    const sp = pass(age, t, 'sun'), mp = pass(age, t, 'moon');
    const passPts = (p) => {
      const a = p.rise ?? t - 12, b = p.set ?? t + 12, pts = [];
      for (let tau = a; tau <= b + 1e-9; tau += 1 / 30) pts.push(state(age + (tau - t) / 24, tau));
      pts.push(state(age + (b - t) / 24, b));
      return pts;
    };
    drawTrack(g, passPts(sp), 'sun', 'rgba(255,200,80,0.85)');
    drawTrack(g, passPts(mp), 'moon', 'rgba(220,226,240,0.75)');

    // Rise / set labels in the ground band: Sun row then Moon row.
    const sunRow = g.horizonY + 33, moonRow = g.horizonY + 53;
    label(`☀ up ${clock(sp.rise)}`, 6, sunRow, '#ffc850', 'left');
    label(`down ${clock(sp.set)} ☀`, W, sunRow, '#ffc850', 'left');
    const mRise = mp.rise == null ? 'no rise' : `up ${clock(mp.rise)}${dayTag(mp.rise)}`;
    const mSet = mp.set == null ? 'no set' : `down ${clock(mp.set)}${dayTag(mp.set)}`;
    label(`☾ ${mRise}`, 6, moonRow, '#dfe5f2', 'left');
    label(`${mSet} ☾`, W, moonRow, '#dfe5f2', 'left');

    // Bodies.
    const daylight = st.sun.alt > -4;
    if (st.sun.alt > -1) {
      const [x, y] = toXY(g, st.sun.az, st.sun.alt);
      const glow = ctx.createRadialGradient(x, y, 2, x, y, 30);
      glow.addColorStop(0, 'rgba(255,236,160,0.9)'); glow.addColorStop(1, 'rgba(255,236,160,0)');
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, 30, 0, 7); ctx.fill();
      ctx.fillStyle = '#ffe27a'; ctx.beginPath(); ctx.arc(x, y, 11, 0, 7); ctx.fill();
    }
    if (st.moon.alt > -1 && st.moon.az >= AZ_MIN && st.moon.az <= AZ_MAX) {
      const [x, y] = toXY(g, st.moon.az, st.moon.alt);
      const newish = st.E < 12 || st.E > 348;
      if (newish) {
        ctx.save(); ctx.setLineDash([3, 3]); ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.beginPath(); ctx.arc(x, y, 20, 0, 7); ctx.stroke(); ctx.restore();
      } else drawMoon(x, y, 20, st, g, daylight);
    }

    // 24-hour strip: when each body is above the horizon today.
    const sx0 = g.pad + 30, sx1 = W - g.pad, sy = g.stripTop;
    const tx = (h) => sx0 + (h / 24) * (sx1 - sx0);
    ctx.font = '600 11px system-ui, sans-serif'; ctx.fillStyle = '#9aa6bf';
    ctx.fillText('Sun', g.pad - 4, sy + 10); ctx.fillText('Moon', g.pad - 4, sy + 26);
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(sx0, sy, sx1 - sx0, 30);
    for (let k = 0; k < track.length - 1; k++) {
      const p = track[k], x0 = tx(p.t), x1 = tx(track[k + 1].t) + 0.5;
      if (p.sun.alt > 0) { ctx.fillStyle = '#e8b445'; ctx.fillRect(x0, sy + 2, x1 - x0, 11); }
      if (p.moon.alt > 0) { ctx.fillStyle = '#c9d1e3'; ctx.fillRect(x0, sy + 17, x1 - x0, 11); }
    }
    ctx.fillStyle = '#7b86a0'; ctx.textAlign = 'center';
    for (const h of [0, 6, 12, 18, 24]) ctx.fillText(h === 0 || h === 24 ? '12am' : h === 12 ? 'noon' : h === 6 ? '6am' : '6pm', tx(h), sy + 46);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ff6b6b'; ctx.fillRect(tx(t) - 1, sy - 3, 2, 36);

    return { st, sp, mp };
  }

  return { render, layout, rerender: () => last && render(...last) };
}
