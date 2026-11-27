// 3D geocentric view: the Sun and Moon carried around a fixed Earth.
// Positions come from the same direction vectors as the sky view (js/astro.js).
import * as THREE from '../vendor/three.module.min.js';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { LAT, PLACE, OBLIQUITY, SUN_LON, pathToEq, PATH_POLE_DEC } from './astro.js';
let lastLst = 0;

const D = Math.PI / 180;
const R_EARTH = 1, R_MOON_ORBIT = 3.0, R_SUN = 5.4;   // not to scale (real: 1 : 60 : 23 500)
// Home view: from above the north side of the Moon's path (the pole of that path: the celestial pole in
// the level 1 model, else the ecliptic pole at RA 18h, dec +66.56), which turns with the sky, so it is
// worked out from the sidereal time when the view is reset.
const ECL_POLE_DEC = PATH_POLE_DEC;
function homeFor(lst) {
  const H = (lst - 270) * D, d = ECL_POLE_DEC * D;
  const pole = new THREE.Vector3(Math.cos(d) * Math.cos(H), Math.sin(d), Math.cos(d) * Math.sin(H));
  return pole.multiplyScalar(14.5).add(new THREE.Vector3(0.3, 0.3, 3));
}

export function createOrbit(container, labelsEl) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05070f);
  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 200);
  let homed = false;
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.enablePan = false;
  controls.minDistance = 4; controls.maxDistance = 40;

  scene.add(new THREE.AmbientLight(0xffffff, 0.07));
  const sunLight = new THREE.DirectionalLight(0xffffff, 3.0);
  scene.add(sunLight, sunLight.target);

  // Earth, its axis and equator, and the observer with their horizon plane.
  const earth = new THREE.Mesh(new THREE.SphereGeometry(R_EARTH, 48, 32),
    new THREE.MeshStandardMaterial({ color: 0x4a90e8, roughness: 0.85 }));
  scene.add(earth);
  const line = (pts, color, opts = {}) => {
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    const m = opts.dashed
      ? new THREE.LineDashedMaterial({ color, dashSize: 0.18, gapSize: 0.12, transparent: true, opacity: opts.opacity ?? 1 })
      : new THREE.LineBasicMaterial({ color, transparent: true, opacity: opts.opacity ?? 1 });
    const l = new THREE.Line(g, m); if (opts.dashed) l.computeLineDistances(); return l;
  };
  scene.add(line([new THREE.Vector3(0, -1.6, 0), new THREE.Vector3(0, 1.6, 0)], 0x9fb3d9, { opacity: 0.8 }));
  const ring = (r, y, color, opacity) => {
    const pts = []; for (let k = 0; k <= 128; k++) { const a = (k / 128) * 2 * Math.PI; pts.push(new THREE.Vector3(r * Math.cos(a), y, r * Math.sin(a))); }
    return line(pts, color, { opacity });
  };
  scene.add(ring(R_EARTH * 1.002, 0, 0x9fb3d9, 0.35));

  const obsPos = new THREE.Vector3(Math.cos(LAT * D), Math.sin(LAT * D), 0);
  const observer = new THREE.Group();
  const person = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.28, 12), new THREE.MeshBasicMaterial({ color: 0xff6b6b }));
  person.position.y = 0.14; observer.add(person);
  const horizon = new THREE.Mesh(new THREE.CircleGeometry(0.5, 48),
    new THREE.MeshBasicMaterial({ color: 0x7fd39a, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
  horizon.rotation.x = -Math.PI / 2; observer.add(horizon);
  observer.position.copy(obsPos);
  observer.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), obsPos.clone().normalize());
  scene.add(observer);

  // Sun: glowing ball on its daily circle. Moon: a sphere lit only by the Sun's light.
  const sun = new THREE.Mesh(new THREE.SphereGeometry(0.42, 32, 16), new THREE.MeshBasicMaterial({ color: 0xffd96a }));
  const halo = new THREE.Mesh(new THREE.SphereGeometry(0.75, 32, 16), new THREE.MeshBasicMaterial({ color: 0xffc040, transparent: true, opacity: 0.18 }));
  sun.add(halo); scene.add(sun);
  const moon = new THREE.Mesh(new THREE.SphereGeometry(0.4, 48, 32), new THREE.MeshStandardMaterial({ color: 0xe9e6dc, roughness: 1 }));
  scene.add(moon);

  // Moon's path (the celestial equator in the level 1 model; else the ecliptic, to within 5 degrees) and the Sun-Earth-Moon lines and angle.
  const orbitPts = Array.from({ length: 129 }, () => new THREE.Vector3());
  const orbitLine = line(orbitPts, 0xc9d1e3, { opacity: 0.45 }); scene.add(orbitLine);
  const sunRay = line([new THREE.Vector3(), new THREE.Vector3()], 0xffc850, { opacity: 0.9 });
  const moonRay = line([new THREE.Vector3(), new THREE.Vector3()], 0xdfe5f2, { opacity: 0.9 });
  scene.add(sunRay, moonRay);
  const arcPts = Array.from({ length: 65 }, () => new THREE.Vector3());
  const arc = line(arcPts, 0xff8f6b, { opacity: 1 }); scene.add(arc);

  const mkLabel = (cls, text) => { const el = document.createElement('div'); el.className = `tag ${cls}`; el.textContent = text; labelsEl.appendChild(el); return el; };
  const tags = { sun: mkLabel('sun', 'Sun'), moon: mkLabel('moon', 'Moon'), you: mkLabel('you', `You, ${LAT}°N`) };
  const anchors = { sun: new THREE.Vector3(), moon: new THREE.Vector3(), you: obsPos.clone().multiplyScalar(1.6) };

  const v = (a) => new THREE.Vector3(a[0], a[1], a[2]);
  const setLine = (l, pts) => { l.geometry.setFromPoints(pts); l.geometry.attributes.position.needsUpdate = true; };

  function update(st) {
    lastLst = st.lst;
    if (!homed) { resetView(); homed = true; }
    const sd = v(st.sunDir), md = v(st.moonDir);
    sun.position.copy(sd).multiplyScalar(R_SUN);
    moon.position.copy(md).multiplyScalar(R_MOON_ORBIT);
    // Sunlight arrives along the Sun's direction (parallel rays: the Sun is ~390x farther than the Moon).
    sunLight.position.copy(sd).multiplyScalar(20);
    setLine(sunRay, [new THREE.Vector3(), sd.clone().multiplyScalar(R_SUN - 0.45)]);
    setLine(moonRay, [new THREE.Vector3(), md.clone().multiplyScalar(R_MOON_ORBIT - 0.41)]);

    // The Moon's path at the Moon's distance, turned to today's sidereal time.
    for (let k = 0; k <= 128; k++) {
      const q = pathToEq((k / 128) * 360);
      const H = (st.lst - q.ra) * D, d = q.dec * D;
      orbitPts[k].set(Math.cos(d) * Math.cos(H), Math.sin(d), Math.cos(d) * Math.sin(H)).multiplyScalar(R_MOON_ORBIT);
    }
    setLine(orbitLine, orbitPts);

    // Sun-Earth-Moon angle, drawn along the Moon's path from the Sun's direction to the Moon's.
    const r = 1.75;
    const span = st.E <= 180 ? st.E : st.E - 360;
    for (let k = 0; k <= 64; k++) {
      const q = pathToEq(SUN_LON + (span * k) / 64);
      const H = (st.lst - q.ra) * D, d = q.dec * D;
      arcPts[k].set(Math.cos(d) * Math.cos(H), Math.sin(d), Math.cos(d) * Math.sin(H)).multiplyScalar(r);
    }
    setLine(arc, arcPts);
    anchors.sun.copy(sun.position);
    anchors.moon.copy(moon.position);
  }

  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container);
  resize();

  const OFFSET = { sun: 'translate(-50%, -190%)', moon: 'translate(-50%, -190%)', you: 'translate(-50%, 70%)' };
  function placeLabels() {
    const w = container.clientWidth, h = container.clientHeight;
    for (const k of Object.keys(tags)) {
      const p = anchors[k].clone().project(camera);
      const hidden = p.z > 1;
      tags[k].style.display = hidden ? 'none' : '';
      tags[k].style.transform = `translate(${((p.x + 1) / 2) * w}px, ${((1 - p.y) / 2) * h}px) ${OFFSET[k]}`;
    }
  }

  function loop() {
    controls.update();
    renderer.render(scene, camera);
    placeLabels();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  function resetView() { camera.position.copy(homeFor(lastLst)); controls.target.set(0, 0, 0); controls.update(); }

  return { update, resetView, OBLIQUITY };
}
