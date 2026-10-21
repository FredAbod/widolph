// Hero globe: dotted continents, Sydney → Lagos air and sea routes,
// pulsing city markers. Bundled to public/js/globe.js by `npm run build`.
import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, SphereGeometry, Mesh, ShaderMaterial, MeshBasicMaterial,
  BufferGeometry, BufferAttribute, Points, Vector3, Color, AdditiveBlending, NormalBlending, BackSide, TubeGeometry,
  CatmullRomCurve3, Curve, RingGeometry, CircleGeometry, Sprite, SpriteMaterial, CanvasTexture, MathUtils, Timer
} from 'three';

const DEG = Math.PI / 180;
const MASK_W = 720;
const MASK_H = 360;

const CITIES = {
  sydney: { lat: -33.87, lon: 151.21, label: 'Sydney', code: 'SYD' },
  melbourne: { lat: -37.81, lon: 144.96, label: 'Melbourne' },
  brisbane: { lat: -27.47, lon: 153.03, label: 'Brisbane' },
  perth: { lat: -31.95, lon: 115.86, label: 'Perth' },
  lagos: { lat: 6.45, lon: 3.39, label: 'Lagos · Apapa', code: 'LOS' },
  abuja: { lat: 9.08, lon: 7.4, label: 'Abuja' },
  portHarcourt: { lat: 4.82, lon: 7.03, label: 'Port Harcourt' },
  onitsha: { lat: 6.14, lon: 6.79, label: 'Onitsha' }
};

// Rough sea lane: south of Australia, across the Indian Ocean, round the Cape
// and up the West African coast to Apapa.
const SEA_LANE = [
  [-33.9, 151.5], [-38.6, 149.5], [-40.0, 144.0], [-37.5, 135.0], [-35.6, 117.0], [-34.5, 110.0], [-32.0, 90.0],
  [-32.5, 65.0], [-35.5, 40.0], [-36.2, 22.0], [-34.5, 15.0], [-26.0, 11.0], [-14.0, 9.0], [-3.0, 6.0], [3.5, 4.0], [6.35, 3.4]
];

function latLon(lat, lon, r = 1, target = new Vector3()) {
  const phi = (90 - lat) * DEG;
  const theta = (lon + 180) * DEG;
  return target.set(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
}

// Great-circle arc that lifts off the surface.
class ArcCurve extends Curve {
  constructor(a, b, height) {
    super();
    this.a = a.clone().normalize();
    this.b = b.clone().normalize();
    this.angle = this.a.angleTo(this.b);
    this.height = height;
  }
  getPoint(t, target = new Vector3()) {
    const s = Math.sin(this.angle);
    target.copy(this.a).multiplyScalar(Math.sin((1 - t) * this.angle) / s).addScaledVector(this.b, Math.sin(t * this.angle) / s);
    return target.normalize().multiplyScalar(1 + this.height * Math.sin(Math.PI * t));
  }
}

// Spline through surface waypoints, kept just above the surface.
class SurfaceCurve extends Curve {
  constructor(points, altitude) {
    super();
    this.spline = new CatmullRomCurve3(points, false, 'centripetal');
    this.altitude = altitude;
  }
  getPoint(t, target = new Vector3()) {
    return this.spline.getPoint(t, target).normalize().multiplyScalar(1 + this.altitude);
  }
}

const dotShader = {
  vertex: /* glsl */ `
    attribute float aRand;
    uniform float uSize, uReveal, uTime, uPixelRatio;
    uniform vec3 uHiA, uHiB;
    varying float vAlpha, vHi;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vec3 n = normalize(normalMatrix * position);
      float facing = dot(n, normalize(-mv.xyz));
      float reveal = smoothstep(aRand - 0.12, aRand, uReveal);
      vHi = max(smoothstep(0.42, 0.0, distance(position, uHiA)), smoothstep(0.32, 0.0, distance(position, uHiB)));
      float twinkle = 0.82 + 0.18 * sin(uTime * 1.6 + aRand * 60.0);
      vAlpha = smoothstep(-0.05, 0.55, facing) * reveal * twinkle;
      gl_PointSize = uSize * uPixelRatio * (0.55 + 0.45 * max(facing, 0.0)) * (1.0 + vHi * 0.35) * reveal / -mv.z;
      gl_Position = projectionMatrix * mv;
    }`,
  fragment: /* glsl */ `
    uniform vec3 uColor, uAccent;
    uniform float uDim;
    varying float vAlpha, vHi;
    void main() {
      float d = length(gl_PointCoord - 0.5);
      if (d > 0.5) discard;
      float a = smoothstep(0.5, 0.22, d);
      gl_FragColor = vec4(mix(uColor, uAccent, vHi * 0.85), a * vAlpha * (0.78 + 0.22 * vHi) * uDim);
      #include <colorspace_fragment>
    }`
};

const fresnelVertex = /* glsl */ `
  varying vec3 vN; varying vec3 vV;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`;

const routeShader = {
  vertex: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragment: /* glsl */ `
    uniform vec3 uColor;
    uniform float uTime, uDraw, uMode, uSpeed, uOffset, uDim;
    varying vec2 vUv;
    void main() {
      float x = vUv.x;
      if (x > uDraw) discard;
      float a;
      if (uMode < 0.5) {
        // air: faint base + travelling comet
        float head = fract(uTime * uSpeed + uOffset);
        float d = head - x;
        float trail = (d > 0.0 && d < 0.3) ? pow(1.0 - d / 0.3, 2.2) : 0.0;
        a = 0.16 + trail * 0.95;
      } else {
        // sea: marching dashes
        float dash = smoothstep(0.35, 0.5, fract(x * 46.0 - uTime * uSpeed * 46.0)) * smoothstep(1.0, 0.85, fract(x * 46.0 - uTime * uSpeed * 46.0));
        a = 0.22 + dash * 0.78;
      }
      float ends = smoothstep(0.0, 0.03, x) * smoothstep(1.0, 0.97, x);
      gl_FragColor = vec4(uColor, a * mix(0.6, 1.0, ends) * uDim);
      #include <colorspace_fragment>
    }`
};

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.18, 'rgba(255,255,255,.85)');
  grd.addColorStop(0.45, 'rgba(255,255,255,.22)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new CanvasTexture(c);
}

function buildDots(mask, spacingDeg) {
  const pos = [];
  const rnd = [];
  const v = new Vector3();
  for (let lat = -84; lat <= 84; lat += spacingDeg) {
    const perRow = Math.max(1, Math.floor((360 * Math.cos(lat * DEG)) / spacingDeg));
    for (let i = 0; i < perRow; i++) {
      const lon = -180 + (i / perRow) * 360;
      const mx = Math.min(MASK_W - 1, Math.floor(((lon + 180) / 360) * MASK_W));
      const my = Math.min(MASK_H - 1, Math.floor(((90 - lat) / 180) * MASK_H));
      const idx = my * MASK_W + mx;
      if (!((mask[idx >> 3] >> (idx & 7)) & 1)) continue;
      latLon(lat, lon, 1.0, v);
      pos.push(v.x, v.y, v.z);
      // reveal order: sweeps out from Australia, with a little noise
      const sweep = ((lon - 151 + 540) % 360) / 360;
      rnd.push(MathUtils.clamp(0.08 + Math.min(sweep, 1 - sweep) * 1.6 + Math.random() * 0.18, 0, 1));
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('aRand', new BufferAttribute(new Float32Array(rnd), 1));
  return geo;
}

// Resolves to true once the globe is rendering, false if WebGL is unavailable.
export async function initGlobe(host, { labels, reducedMotion = false }) {
  const canvas = document.createElement('canvas');
  canvas.className = 'globe-canvas';
  canvas.setAttribute('aria-hidden', 'true');

  let renderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch {
    return false;
  }
  host.prepend(canvas);

  const mobileQuery = matchMedia('(max-width: 680px)');
  const mask = new Uint8Array(await (await fetch('/assets/land.bin')).arrayBuffer());

  const scene = new Scene();
  const camera = new PerspectiveCamera(32, 1, 0.1, 100);
  const globe = new Group();
  const world = new Group();
  world.add(globe);
  scene.add(world);

  const accent = new Color(getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#F5A524');

  // Occluding core with a soft fresnel rim.
  const core = new Mesh(
    new SphereGeometry(0.994, 72, 72),
    new ShaderMaterial({
      uniforms: { uBase: { value: new Color('#0C2546') }, uRim: { value: new Color('#3F7FD6') } },
      vertexShader: fresnelVertex,
      fragmentShader: /* glsl */ `
        uniform vec3 uBase, uRim; varying vec3 vN; varying vec3 vV;
        void main() { float f = pow(1.0 - max(dot(vN, vV), 0.0), 2.6); gl_FragColor = vec4(mix(uBase, uRim, f * 0.85), 1.0);
      #include <colorspace_fragment> }`
    })
  );
  globe.add(core);

  // Outer atmosphere glow.
  const atmosphere = new Mesh(
    new SphereGeometry(1.2, 64, 64),
    new ShaderMaterial({
      uniforms: { uColor: { value: new Color('#4C8DFF') }, uDim: { value: 1 } },
      vertexShader: fresnelVertex,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uDim; varying vec3 vN; varying vec3 vV;
        void main() { float i = pow(clamp(-dot(vN, vV) * 1.15, 0.0, 1.0), 2.2); gl_FragColor = vec4(uColor, 1.0) * i * 0.75 * uDim;
      #include <colorspace_fragment> }`,
      side: BackSide,
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false
    })
  );
  world.add(atmosphere);

  const dotUniforms = {
    uSize: { value: 2.6 }, uReveal: { value: reducedMotion ? 1.2 : 0 }, uTime: { value: 0 }, uPixelRatio: { value: 1 },
    uColor: { value: new Color('#B7CCEB') }, uAccent: { value: accent }, uDim: { value: 1 }, uHiA: { value: latLon(-30, 140) }, uHiB: { value: latLon(7, 5) }
  };
  const spacing = mobileQuery.matches ? 1.0 : 0.62;
  const dots = new Points(
    buildDots(mask, spacing),
    new ShaderMaterial({ uniforms: dotUniforms, vertexShader: dotShader.vertex, fragmentShader: dotShader.fragment, transparent: true, depthWrite: false })
  );
  globe.add(dots);

  // Routes.
  const routes = [];
  const addRoute = (curve, { mode, color, radius, speed, offset = 0, delay = 0 }) => {
    const mat = new ShaderMaterial({
      uniforms: {
        uColor: { value: new Color(color) }, uTime: { value: 0 }, uDraw: { value: reducedMotion ? 1 : 0 },
        uMode: { value: mode === 'sea' ? 1 : 0 }, uSpeed: { value: speed }, uOffset: { value: offset }, uDim: { value: 1 }
      },
      vertexShader: routeShader.vertex,
      fragmentShader: routeShader.fragment,
      transparent: true,
      depthWrite: false,
      blending: mode === 'sea' ? NormalBlending : AdditiveBlending
    });
    const mesh = new Mesh(new TubeGeometry(curve, 220, radius, 6, false), mat);
    globe.add(mesh);
    routes.push({ curve, mat, speed, delay });
  };

  const syd = latLon(CITIES.sydney.lat, CITIES.sydney.lon);
  const los = latLon(CITIES.lagos.lat, CITIES.lagos.lon);
  const seaCurve = new SurfaceCurve(SEA_LANE.map(([la, lo]) => latLon(la, lo)), 0.006);
  addRoute(seaCurve, { mode: 'sea', color: accent, radius: 0.0055, speed: 0.012, delay: 1.5 });
  addRoute(new ArcCurve(syd, los, 0.42), { mode: 'air', color: '#FFFFFF', radius: 0.0048, speed: 0.11, delay: 1.1 });
  addRoute(new ArcCurve(latLon(CITIES.melbourne.lat, CITIES.melbourne.lon), latLon(CITIES.abuja.lat, CITIES.abuja.lon), 0.36), { mode: 'air', color: '#9CC3FF', radius: 0.0032, speed: 0.08, offset: 0.4, delay: 1.5 });
  addRoute(new ArcCurve(latLon(CITIES.brisbane.lat, CITIES.brisbane.lon), latLon(CITIES.portHarcourt.lat, CITIES.portHarcourt.lon), 0.48), { mode: 'air', color: '#9CC3FF', radius: 0.0028, speed: 0.07, offset: 0.7, delay: 1.8 });
  addRoute(new ArcCurve(latLon(CITIES.perth.lat, CITIES.perth.lon), latLon(CITIES.onitsha.lat, CITIES.onitsha.lon), 0.3), { mode: 'air', color: '#9CC3FF', radius: 0.0028, speed: 0.09, offset: 0.15, delay: 2.0 });

  // Glowing heads that travel the routes (one plane, two ships).
  const glow = glowTexture();
  const heads = [
    { route: routes[1], size: 0.085, color: '#FFFFFF', phase: 0 }, // matches the comet (offset 0)
    { route: routes[0], size: 0.06, color: accent, phase: 0.18 },
    { route: routes[0], size: 0.06, color: accent, phase: 0.62 }
  ].map((h) => {
    const sprite = new Sprite(new SpriteMaterial({ map: glow, color: h.color, transparent: true, depthWrite: false, depthTest: false, blending: AdditiveBlending }));
    sprite.scale.setScalar(h.size);
    globe.add(sprite);
    return { ...h, sprite };
  });

  // City markers with pulsing rings.
  const markers = Object.entries(CITIES).map(([key, c], i) => {
    const major = key === 'sydney' || key === 'lagos';
    const p = latLon(c.lat, c.lon, 1.003);
    const dot = new Mesh(new CircleGeometry(major ? 0.016 : 0.009, 20), new MeshBasicMaterial({ color: accent, transparent: true, depthWrite: false }));
    const ring = new Mesh(new RingGeometry(0.8, 1, 40), new MeshBasicMaterial({ color: accent, transparent: true, depthWrite: false }));
    for (const m of [dot, ring]) {
      m.position.copy(p);
      m.lookAt(p.clone().multiplyScalar(2));
    }
    ring.scale.setScalar(0.02);
    globe.add(dot, ring);
    return { ring, major, phase: i * 0.37 };
  });

  // HTML labels for the two hubs.
  const labelEls = ['sydney', 'lagos'].map((key) => {
    const el = document.createElement('div');
    el.className = 'glabel';
    el.innerHTML = `<b>${CITIES[key].code}</b><span>${CITIES[key].label}</span>`;
    labels.appendChild(el);
    return { el, pos: latLon(CITIES[key].lat, CITIES[key].lon, 1.01) };
  });

  // Orientation: centre the view between Australia and West Africa.
  const base = { spin: (-90 - 80) * DEG, tilt: -12 * DEG };
  const state = { spin: base.spin, tilt: base.tilt, vSpin: 0, vTilt: 0, dragging: false, px: 0, py: 0, mx: 0, my: 0, scroll: 0, intro: reducedMotion ? 1 : 0 };
  globe.rotation.order = 'XYZ';

  let layout = { mobile: false, W: 1, H: 1 };
  function resize() {
    const rect = host.getBoundingClientRect();
    const W = Math.max(1, rect.width);
    const H = Math.max(1, rect.height);
    const dpr = Math.min(window.devicePixelRatio || 1, mobileQuery.matches ? 1.6 : 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(W, H, false);
    dotUniforms.uPixelRatio.value = dpr;
    camera.aspect = W / H;

    const art = host.parentElement.querySelector('.hero-art');
    const artRect = art?.getBoundingClientRect();
    const mobile = !artRect || artRect.width < 10;
    let cx, cy, R;
    if (mobile) {
      R = W * 0.62;
      cx = W * 0.5;
      cy = H - R * 0.42;
    } else {
      R = Math.min(artRect.width, artRect.height) * 0.47;
      cx = artRect.left - rect.left + artRect.width / 2;
      cy = artRect.top - rect.top + artRect.height / 2;
    }
    // Place the camera so a unit sphere has radius R px, centred at (cx, cy).
    const dist = H / (2 * Math.tan((camera.fov * DEG) / 2) * R);
    camera.position.set(0, 0, dist);
    camera.updateProjectionMatrix();
    // At z = 0 one world unit is R pixels.
    world.position.set((cx - W / 2) / R, -(cy - H / 2) / R, 0);
    // Dot diameter in px ≈ 85% of the dot spacing on screen.
    dotUniforms.uSize.value = R * spacing * DEG * 0.85 * dist;
    const dim = mobile ? 0.55 : 1;
    dotUniforms.uDim.value = dim;
    atmosphere.material.uniforms.uDim.value = dim;
    routes.forEach((r) => (r.mat.uniforms.uDim.value = mobile ? 0.75 : 1));
    layout = { mobile, W, H };
  }

  // Drag to spin, with inertia, then ease back to the hero composition.
  canvas.addEventListener('pointerdown', (e) => {
    if (layout.mobile) return;
    state.dragging = true;
    state.px = e.clientX;
    state.py = e.clientY;
    canvas.setPointerCapture(e.pointerId);
    host.classList.add('grabbing');
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!state.dragging) return;
    const dx = e.clientX - state.px;
    const dy = e.clientY - state.py;
    state.px = e.clientX;
    state.py = e.clientY;
    state.vSpin = dx * 0.0045;
    state.vTilt = dy * 0.0035;
    state.spin += state.vSpin;
    state.tilt = MathUtils.clamp(state.tilt + state.vTilt, -0.9, 0.6);
  });
  const endDrag = () => {
    state.dragging = false;
    host.classList.remove('grabbing');
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  window.addEventListener('pointermove', (e) => {
    state.mx = (e.clientX / innerWidth - 0.5) * 2;
    state.my = (e.clientY / innerHeight - 0.5) * 2;
  }, { passive: true });
  window.addEventListener('scroll', () => {
    state.scroll = Math.min(1, scrollY / layout.H);
  }, { passive: true });

  const timer = new Timer();
  let visible = true;
  let raf = 0;
  const tmp = new Vector3();
  const camPos = new Vector3();
  const nrm = new Vector3();
  // > 0 when a surface point faces the camera (works up to the true limb).
  const facingCam = (p) => nrm.copy(p).sub(world.position).normalize().dot(camPos.copy(camera.position).sub(p).normalize());
  const ease = (t) => 1 - Math.pow(1 - MathUtils.clamp(t, 0, 1), 3);

  function frame(now) {
    raf = requestAnimationFrame(frame);
    timer.update(now);
    const t = timer.getElapsed();
    if (!reducedMotion) state.intro = Math.min(1, t / 2.6);

    if (!state.dragging && !reducedMotion) {
      state.vSpin *= 0.94;
      state.vTilt *= 0.9;
      state.spin += state.vSpin;
      const targetSpin = base.spin + Math.sin(t * 0.11) * 0.12 + state.scroll * 0.6;
      state.spin += (targetSpin - state.spin) * 0.012;
      state.tilt += (base.tilt - state.tilt) * 0.02;
    }
    const introSpin = reducedMotion ? 0 : (1 - ease(state.intro)) * -1.1;
    globe.rotation.set(state.tilt + state.my * -0.05, state.spin + introSpin + state.mx * 0.08, 0);
    const s = reducedMotion ? 1 : 0.86 + 0.14 * ease(state.intro);
    world.scale.setScalar(s);

    dotUniforms.uTime.value = t;
    if (!reducedMotion) dotUniforms.uReveal.value = Math.min(1.2, t / 2.4);
    for (const r of routes) {
      r.mat.uniforms.uTime.value = t;
      if (!reducedMotion) r.mat.uniforms.uDraw.value = ease((t - r.delay) / 1.8);
    }

    for (const h of heads) {
      const drawn = h.route.mat.uniforms.uDraw.value;
      h.route.curve.getPoint((t * h.route.speed + h.phase) % 1, h.sprite.position);
      h.sprite.getWorldPosition(tmp);
      const facing = facingCam(tmp) > -0.05;
      h.sprite.material.opacity = drawn >= 0.99 && facing ? 1 : 0;
    }

    for (const m of markers) {
      const k = ((t * 0.55 + m.phase) % 1);
      m.ring.scale.setScalar((m.major ? 0.022 : 0.012) + k * (m.major ? 0.07 : 0.035));
      m.ring.material.opacity = (1 - k) * 0.85 * Math.min(1, state.intro * 2);
    }

    for (const l of labelEls) {
      tmp.copy(l.pos).applyMatrix4(globe.matrixWorld);
      const facing = facingCam(tmp) > 0.08;
      tmp.project(camera);
      const x = (tmp.x * 0.5 + 0.5) * layout.W;
      const y = (-tmp.y * 0.5 + 0.5) * layout.H;
      l.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      l.el.style.opacity = facing && state.intro > 0.75 && !layout.mobile ? '1' : '0';
    }

    renderer.render(scene, camera);
    if (reducedMotion) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }

  const start = () => { if (!raf && visible && !document.hidden) raf = requestAnimationFrame(frame); };
  const stop = () => { cancelAnimationFrame(raf); raf = 0; };

  new IntersectionObserver(([e]) => { visible = e.isIntersecting; visible ? start() : stop(); }).observe(host);
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  new ResizeObserver(() => { resize(); if (reducedMotion) start(); }).observe(host);
  mobileQuery.addEventListener('change', resize);

  resize();
  start();
  return true;
}
