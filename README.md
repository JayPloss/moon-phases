# moon-phases

"Only the Moon Matters": an interactive page on why the Moon has phases, made for Ben Roberts (2026-11-27).
The page has four levels, shown one at a time: the page opens on level 1, and links at the bottom of each level
go on or back (`#level2`, `#level3`, `#level4` in the address):
1. Phases and geometry: the 3D panel first, then the sky panel; each has its own sliders and both drive one shared
   state. Level 1 model: Sun and Moon both on the celestial equator, so the Moon's arc matches the Sun's and only
   its timing changes with phase.
2. How high the Moon rides: the real ecliptic, the Sun placed by date, arcs and a month chart of the Moon's highest point.
3. The angle of the lit edge: the Moon drawn along its real path with the lit edge at its true angle.
4. How the Moon lights the night: light on the ground from sunset to sunrise on a log scale, twilight plus moonlight,
   with a usable-light threshold (0.01 lux, a stated choice). Laws and sources are in `js/night.js` and on the page.
Live at https://jayploss.github.io/moon-phases/ (GitHub Pages from `main`, root folder).

- `index.html`, `style.css`: the page. Plain HTML/CSS/JS, no build step.
- `js/astro.js`: the astronomy (observer at 45.2°N, Knowlton QC; `SIMPLE` paths for level 1, `state(..., real)`
  for levels 2 and 3; Moon at mean speed, local solar time). Every view reads its Sun and Moon directions from here.
- `js/levels.js`: levels 2 and 3, drawn on 2D canvases.
- `js/night.js`: level 4: twilight (USNO Circular 171) and moonlight (Krisciunas & Schaefer 1991) through one night.
- `img/moon-waxing-gibbous-nasa.jpg`: NASA GSFC Scientific Visualization Studio, “Waxing Gibbous” (NASA Image and
  Video Library, GSFC_20171208_Archive_e000867), public domain, cropped and resized to 240 px.
- `js/sky.js`: the level 1 sky as seen facing south, drawn on a 2D canvas.
- `js/orbit3d.js`: the geocentric 3D view (three.js).
- `vendor/`: three.js 0.160.0 (`three.module.min.js`, `OrbitControls.js` with its import pointed at the local file), MIT licence.

Run locally: serve this folder with any static server (for example Python's `http.server` on a free port from
20000 up) and open it in a browser. Opening `index.html` as a file does not work, because ES modules need HTTP.
