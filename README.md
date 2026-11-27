# moon-phases

"Only the Moon Matters": an interactive page on why the Moon has phases, made for Ben Roberts (2026-11-27).
The 3D geometry panel comes first, the sky panel below; each has its own sliders, and both sets drive one shared state.
Live at https://jayploss.github.io/moon-phases/ (GitHub Pages from `main`, root folder).

- `index.html`, `style.css`: the page. Plain HTML/CSS/JS, no build step.
- `js/astro.js`: the astronomy (observer at 40°N, Sun at its late-November position, Moon on the ecliptic at
  mean speed, local solar time). Both views read the same Sun and Moon directions from here.
- `js/sky.js`: the sky as seen facing south, drawn on a 2D canvas.
- `js/orbit3d.js`: the geocentric 3D view (three.js).
- `vendor/`: three.js 0.160.0 (`three.module.min.js`, `OrbitControls.js` with its import pointed at the local file), MIT licence.

Run locally: serve this folder with any static server (for example Python's `http.server` on a free port from
20000 up) and open it in a browser. Opening `index.html` as a file does not work, because ES modules need HTTP.
