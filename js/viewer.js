import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { makeMaterials, TINT } from './materials.js';
import { boxGeometry, sheetGeometry, cylGeometry, prismGeometry, hardwareGeometry } from './geometry.js';
import { ftin } from './format.js';

function gradientTexture(top, bottom) {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, top);
  gr.addColorStop(1, bottom);
  g.fillStyle = gr;
  g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Clear tropical sky, in linear HDR units. The same colours drive the
// fog, so the ground fades into the horizon without a seam.
const EXPOSURE = 0.62;
const SKY = { zen: [0.085, 0.19, 0.44], hor: [0.58, 0.68, 0.82], gnd: [0.3, 0.28, 0.24] };
const SUN = (() => {
  const el = THREE.MathUtils.degToRad(52), az = THREE.MathUtils.degToRad(-35);
  return new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
})();

function skyMesh() {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uSun: { value: SUN.clone() },
      uZen: { value: new THREE.Vector3(...SKY.zen) },
      uHor: { value: new THREE.Vector3(...SKY.hor) },
      uGnd: { value: new THREE.Vector3(...SKY.gnd) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSun, uZen, uHor, uGnd;
      varying vec3 vDir;
      float h31(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
      float vn(vec3 p) {
        vec3 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(h31(i), h31(i + vec3(1, 0, 0)), f.x), mix(h31(i + vec3(0, 1, 0)), h31(i + vec3(1, 1, 0)), f.x), f.y),
                   mix(mix(h31(i + vec3(0, 0, 1)), h31(i + vec3(1, 0, 1)), f.x), mix(h31(i + vec3(0, 1, 1)), h31(i + vec3(1, 1, 1)), f.x), f.y), f.z);
      }
      float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * vn(p); p = p * 2.07 + 13.7; a *= 0.5; } return s; }
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        float cs = max(dot(d, uSun), 0.0);
        vec3 c;
        if (h < 0.0) {
          c = mix(uHor, uGnd, smoothstep(0.0, 0.2, -h));
        } else {
          c = mix(uHor, uZen, pow(h, 0.55));
          c = mix(c, uHor * 1.04, exp(-h * 18.0) * 0.5);
          c += vec3(1.0, 0.93, 0.82) * (0.12 * pow(cs, 5.0) + 0.45 * pow(cs, 48.0) + 3.0 * pow(cs, 900.0));
          // fair-weather cumulus on a flat layer
          vec2 cp = d.xz / (h + 0.07);
          float n = fbm(vec3(cp * 0.42 + vec2(3.1, 7.7), 0.5));
          float n2 = fbm(vec3(cp * 1.9, 4.0));
          float dens = smoothstep(0.52, 0.72, n * 0.85 + n2 * 0.25) * smoothstep(0.0, 0.1, h);
          float top = smoothstep(0.25, 0.85, n2 + dot(d.xz, uSun.xz) * 0.15);
          vec3 cl = mix(vec3(0.5, 0.56, 0.66), vec3(1.35, 1.32, 1.26), top) * (1.0 + 0.9 * pow(cs, 10.0));
          c = mix(c, cl, dens * 0.92);
          c += vec3(40.0, 37.0, 32.0) * smoothstep(0.99996, 0.99999, dot(d, uSun)) * (1.0 - dens);
        }
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(30000, 48, 24), mat);
  m.renderOrder = -10;
  m.frustumCulled = false;
  return m;
}

// Realistic view: per-vertex rest position (for shader noise that stays
// put when parts explode), a per-part colour tint and a random texture
// offset, so no two boards or sheets look the same.
function decorate(geo, p, mesh) {
  mesh.updateMatrix();
  const pos = geo.attributes.position;
  const rest = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrix);
    rest[i * 3] = v.x;
    rest[i * 3 + 1] = v.y;
    rest[i * 3 + 2] = v.z;
  }
  geo.setAttribute('aRest', new THREE.BufferAttribute(rest, 3));
  const seed = (p.id || 0) + 0.5;
  const [bs, hs] = TINT[p.mat] || [0, 0];
  const b = 1 + bs * (hash(seed) - 0.5) * 2;
  const hue = hs * (hash(seed + 7.3) - 0.5) * 2;
  const g = hs * (hash(seed + 3.1) - 0.5);
  const col = [b * (1 + hue), b * (1 + g), b * (1 - hue)];
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) colors.set(col, i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  if (p.kind !== 'box' && geo.attributes.uv) {
    const uv = geo.attributes.uv;
    const ou = hash(seed + 11.7) * 8, ov = hash(seed + 5.9) * 8;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) + ou, uv.getY(i) + ov);
  }
}

function hash(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export class Viewer {
  constructor(container, { tooltip = true } = {}) {
    this.container = container;
    this.mode = 'sketch';
    this.explode = 0;
    this.step = Infinity;
    this.maxStep = Infinity;
    this.showDims = true;
    this.active = true;
    this.meshes = [];
    this.parts = [];

    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }));
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(r.domElement);

    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.domElement.className = 'label-layer';
    container.appendChild(this.labelRenderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 2, 60000);
    this.camera.position.set(400, 260, 500);
    this.controls = new OrbitControls(this.camera, r.domElement);
    this.controls.enableDamping = true;
    this.controls.addEventListener('change', () => this.invalidate());
    this.dirty = true;
    this.controls.maxPolarAngle = Math.PI * 0.495;

    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.dimGroup = new THREE.Group();
    this.scene.add(this.dimGroup);
    this.labelGroup = new THREE.Group();
    this.scene.add(this.labelGroup);
    this.env = new THREE.Group();
    this.scene.add(this.env);

    if (tooltip) {
      this.tip = document.createElement('div');
      this.tip.className = 'tooltip';
      container.appendChild(this.tip);
      this.ray = new THREE.Raycaster();
      r.domElement.addEventListener('pointermove', (e) => {
        // raycasting thousands of parts is costly: at most once per frame
        if (!this.hoverEv) requestAnimationFrame(() => { this.onHover(this.hoverEv); this.hoverEv = null; });
        this.hoverEv = e;
      });
      r.domElement.addEventListener('pointerleave', () => (this.tip.style.display = 'none'));
    }

    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
    this.setupEnvironment();
    const loop = (t) => {
      requestAnimationFrame(loop);
      if (!this.active) return;
      this.tick(t);
    };
    requestAnimationFrame(loop);
  }

  resize() {
    this.invalidate();
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h);
    this.labelRenderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.composer) {
      this.composer.setSize(w, h);
    }
  }

  setupEnvironment() {
    this.env.clear();
    if (this.envMap) { this.envMap.dispose(); this.envMap = null; }
    this.scene.environment = null;
    this.scene.fog = null;
    this.sky = null;
    this.sun = null;
    const r = this.renderer;
    const realistic = this.mode === 'real';
    r.toneMapping = realistic ? THREE.NeutralToneMapping : THREE.NoToneMapping;
    r.toneMappingExposure = realistic ? EXPOSURE : 1;
    r.shadowMap.enabled = realistic;
    // the sun never moves, so the shadow map is redrawn only when parts do
    r.shadowMap.autoUpdate = false;
    r.shadowMap.needsUpdate = true;
    this.invalidate();
    this.M = makeMaterials(realistic ? 'real' : 'sketch');

    let groundGeo;
    if (realistic) {
      groundGeo = new THREE.CircleGeometry(30000, 96);
      groundGeo.rotateX(-Math.PI / 2);
    } else {
      groundGeo = new THREE.CircleGeometry(4000, 64);
      groundGeo.rotateX(-Math.PI / 2);
    }
    const ground = new THREE.Mesh(groundGeo, this.M.ground);
    ground.receiveShadow = true;
    ground.renderOrder = -1;
    ground.userData.ground = true;
    this.env.add(ground);
    this.ground = ground;

    if (!realistic) {
      this.scene.background = gradientTexture('#cfe3f3', '#f5f8fa');
      // SketchUp-style lighting: a key light that follows the camera, so
      // every wall you look at is lit from the side and its relief reads.
      this.env.add(new THREE.HemisphereLight(0xffffff, 0xb8b0a0, 1.25));
      const d = new THREE.DirectionalLight(0xffffff, 1.9);
      this.env.add(d);
      this.env.add(d.target);
      this.headLight = d;
      this.composer = null;
    } else {
      this.headLight = null;
      // the sky dome follows the camera; a copy at the origin is baked into
      // a prefiltered environment map for reflections and sky light
      const pm = new THREE.PMREMGenerator(r);
      const skyScene = new THREE.Scene();
      skyScene.add(skyMesh());
      this.envMap = pm.fromScene(skyScene, 0, 10, 50000).texture;
      pm.dispose();
      this.scene.environment = this.envMap;
      this.scene.environmentIntensity = 1.0;
      this.scene.background = null;
      this.sky = skyMesh();
      this.env.add(this.sky);
      this.scene.fog = new THREE.FogExp2(new THREE.Color().setRGB(...SKY.hor), 0.000055);

      const sunL = new THREE.DirectionalLight(0xfff4e6, 7.5);
      sunL.position.copy(SUN).multiplyScalar(1500);
      sunL.castShadow = true;
      sunL.shadow.mapSize.set(4096, 4096);
      sunL.shadow.bias = -0.0003;
      sunL.shadow.normalBias = 0.4;
      this.sun = sunL;
      this.env.add(sunL);
      this.env.add(sunL.target);
      this.updateShadowBounds();
      try {
        const w = this.container.clientWidth || 1;
        const h = this.container.clientHeight || 1;
        // 1.5× with 4× MSAA is indistinguishable from 2× on a laptop screen
        // and draws 44% fewer pixels through the AO and output passes
        const pr = Math.min(window.devicePixelRatio, 1.5);
        // multisampled HDR target: the corrugations alias badly without it
        const rt = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples: 4 });
        const comp = new EffectComposer(r, rt);
        comp.addPass(new RenderPass(this.scene, this.camera));
        const ao = new GTAOPass(this.scene, this.camera, w, h);
        ao.updateGtaoMaterial({ radius: 30, distanceExponent: 1.6, thickness: 8, scale: 1.0, samples: 12 });
        ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 8 });
        ao.blendIntensity = 1.0;
        comp.addPass(ao);
        comp.addPass(new OutputPass());
        comp.setPixelRatio(pr);
        comp.setSize(w, h);
        this.composer = comp;
      } catch (e) {
        console.warn('AO disabled', e);
        this.composer = null;
      }
    }
  }

  updateShadowBounds() {
    if (!this.sun || !this.bounds) return;
    const { min, max } = this.bounds;
    const c = new THREE.Vector3((min[0] + max[0]) / 2, 0, (min[2] + max[2]) / 2);
    const R = Math.max(max[0] - min[0], max[2] - min[2], max[1]) * 0.85 + 80;
    const cam = this.sun.shadow.camera;
    cam.left = -R; cam.right = R; cam.top = R; cam.bottom = -R;
    cam.near = 10; cam.far = 5000;
    cam.updateProjectionMatrix();
    this.sun.target.position.copy(c);
    const dir = this.sun.position.clone().sub(this.sun.target.position).normalize();
    this.sun.position.copy(c).addScaledVector(dir, 1500);
    const u = this.M.ground.userData.uHouse;
    if (u) u.value.set(min[0], min[2], max[0], max[2]);
    this.renderer.shadowMap.needsUpdate = true;
    this.invalidate();
  }

  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.setupEnvironment();
    this.build();
  }

  // parts from design() or shipping layout; bounds {min,max}; dims; labels
  setModel({ parts, bounds, dims = [], labels = [] }, { fit = false, dir = null } = {}) {
    if (dir) this.fitDir = dir;
    this.parts = parts;
    this.bounds = bounds;
    this.dims = dims;
    this.labels = labels;
    this.build();
    this.updateShadowBounds();
    if (fit || !this.fitted) { this.fit(); this.fitted = true; }
  }

  build() {
    for (const m of this.meshes) {
      m.geometry.dispose();
      m.children.forEach((c) => c.geometry && c.geometry.dispose());
    }
    this.root.clear();
    this.meshes = [];
    const sketch = this.mode === 'sketch';
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    const v = new THREE.Vector3();
    for (const p of this.parts) {
      if (p.kind === 'inst') {
        // nails, screws and anchors: one instanced mesh per group
        const n = p.items.length / 7;
        const mesh = new THREE.InstancedMesh(hardwareGeometry(p.shape), this.M[p.mat] || this.M.steel, n);
        for (let i = 0; i < n; i++) {
          const a = p.items;
          v.set(a[i * 7], a[i * 7 + 1], a[i * 7 + 2]);
          q.set(a[i * 7 + 3], a[i * 7 + 4], a[i * 7 + 5], a[i * 7 + 6]);
          mesh.setMatrixAt(i, m4.compose(v, q, one));
        }
        mesh.computeBoundingSphere();
        mesh.userData.part = p;
        mesh.userData.base = mesh.position.clone();
        this.root.add(mesh);
        this.meshes.push(mesh);
        continue;
      }
      let geo;
      if (p.kind === 'box') geo = boxGeometry(p.size, p.id);
      else if (p.kind === 'sheet') geo = sheetGeometry(p.geom);
      else if (p.kind === 'cyl') geo = cylGeometry(p.r, p.h);
      else if (p.kind === 'prism') geo = prismGeometry(p.pts, p.depth);
      else continue;
      const mat = this.M[p.mat] || this.M.wood;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.fromArray(p.pos);
      if (p.quat) mesh.quaternion.fromArray(p.quat);
      if (p.scale) mesh.scale.fromArray(p.scale);
      if (!sketch) decorate(geo, p, mesh);
      mesh.userData.part = p;
      mesh.userData.base = mesh.position.clone();
      mesh.castShadow = !sketch && !['glass', 'hole', 'water', 'screen'].includes(p.mat);
      mesh.receiveShadow = !sketch;
      if (p.mat === 'glass' || p.mat === 'water' || p.mat === 'screen') mesh.renderOrder = 2;
      if (sketch && p.mat !== 'string' && p.mat !== 'stringDiag') {
        const eg = new THREE.EdgesGeometry(geo, p.kind === 'sheet' ? 40 : 20);
        const lines = new THREE.LineSegments(eg, this.M.edge);
        lines.raycast = () => {};
        mesh.add(lines);
        mesh.userData.lines = lines;
      }
      this.root.add(mesh);
      this.meshes.push(mesh);
    }
    this.buildDims();
    this.buildLabels();
    this.applyState(true);
  }

  buildDims() {
    this.dimGroup.traverse((o) => o.isCSS2DObject && o.element.remove());
    this.dimGroup.clear();
    if (!this.dims) return;
    const mat = new THREE.LineBasicMaterial({ color: this.mode === 'sketch' ? 0x333333 : 0xffffff });
    for (const d of this.dims) {
      const a = new THREE.Vector3(...d.a);
      const b = new THREE.Vector3(...d.b);
      const dir = b.clone().sub(a).normalize();
      const perp = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(6);
      const pts = [a, b, a.clone().add(perp), a.clone().sub(perp), b.clone().add(perp), b.clone().sub(perp)];
      const g = new THREE.BufferGeometry().setFromPoints(pts);
      this.dimGroup.add(new THREE.LineSegments(g, mat));
      const el = document.createElement('div');
      el.className = 'dim-label';
      el.textContent = d.label;
      const lab = new CSS2DObject(el);
      lab.position.copy(a).add(b).multiplyScalar(0.5);
      this.dimGroup.add(lab);
    }
    this.dimGroup.visible = this.showDims;
  }

  buildLabels() {
    this.labelGroup.traverse((o) => o.isCSS2DObject && o.element.remove());
    this.labelGroup.clear();
    for (const l of this.labels || []) {
      const el = document.createElement('div');
      el.className = 'ship-label';
      el.innerHTML = l.html;
      const o = new CSS2DObject(el);
      o.position.fromArray(l.pos);
      this.labelGroup.add(o);
    }
  }

  setDims(on) {
    this.invalidate();
    this.showDims = on;
    this.dimGroup.traverse((o) => { if (o.isCSS2DObject) o.element.style.display = on ? '' : 'none'; });
    this.dimGroup.visible = on;
  }

  setExplode(e) {
    // pull the camera back as parts spread out so everything stays in view
    const f = (x) => 1 + 0.75 * x;
    const k = f(e) / f(this.explode);
    const off = this.camera.position.clone().sub(this.controls.target);
    this.controls.target.y *= k;
    this.camera.position.copy(this.controls.target).addScaledVector(off, k);
    this.explode = e;
    this.applyState();
  }

  setStep(s, maxStep) {
    const prev = this.step;
    this.step = s;
    this.maxStep = maxStep;
    if (s > prev && s < maxStep) this.animT0 = performance.now();
    else this.animT0 = null;
    this.applyState(true);
  }

  applyState(materials = false) {
    this.invalidate();
    this.renderer.shadowMap.needsUpdate = true;
    const s = this.step;
    const done = s >= this.maxStep;
    const now = performance.now();
    const anim = this.animT0 ? Math.min(1, (now - this.animT0) / 700) : 1;
    const ease = 1 - Math.pow(1 - anim, 3);
    for (const m of this.meshes) {
      const p = m.userData.part;
      const vis = p.step === undefined || (p.step <= s && (p.stepTo === undefined || s <= p.stepTo) && !(done && p.temp));
      m.visible = vis;
      if (!vis) continue;
      const cur = !done && p.step === s && s > 0;
      m.position.copy(m.userData.base);
      if (p.ex) m.position.x += p.ex[0] * this.explode, m.position.y += p.ex[1] * this.explode, m.position.z += p.ex[2] * this.explode;
      if (cur && anim < 1) m.position.y += (1 - ease) * 48;
      if (materials) {
        const key = p.mat;
        m.material = cur && this.M.hl[key] ? this.M.hl[key] : this.M[key] || this.M.wood;
        if (m.userData.lines) m.userData.lines.material = cur ? this.M.edgeHL : this.M.edge;
      }
    }
    if (this.ground) {
      // let posts show through the ground while setting them
    }
  }

  fit(bounds = this.bounds) {
    if (!bounds) return;
    const { min, max } = bounds;
    const c = new THREE.Vector3((min[0] + max[0]) / 2, (Math.max(0, min[1]) + max[1]) / 2 * 0.8, (min[2] + max[2]) / 2);
    const size = Math.max(max[0] - min[0], max[1] - Math.max(0, min[1]), max[2] - min[2]);
    const vf = THREE.MathUtils.degToRad(this.camera.fov);
    const hf = 2 * Math.atan(Math.tan(vf / 2) * this.camera.aspect);
    const dist = ((size * 0.5) / Math.tan(Math.min(vf, hf) / 2)) * (this.fitDir ? 1.2 : 1.24);
    const dir = new THREE.Vector3(...(this.fitDir || [0.62, 0.42, 1])).normalize();
    this.camera.position.copy(c).addScaledVector(dir, dist);
    this.controls.target.copy(c);
    this.controls.update();
  }

  view(name) {
    if (!this.bounds) return;
    const { min, max } = this.bounds;
    const c = this.controls.target.clone();
    const dist = this.camera.position.distanceTo(c);
    const dirs = {
      iso: [0.62, 0.42, 1], front: [0, 0.12, 1], back: [0, 0.12, -1], left: [-1, 0.12, 0], right: [1, 0.12, 0], top: [0, 1, 0.001],
    };
    const d = new THREE.Vector3(...(dirs[name] || dirs.iso)).normalize();
    this.camera.position.copy(c).addScaledVector(d, dist);
    this.controls.update();
    void min; void max;
  }

  onHover(e) {
    if (!this.meshes.length) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const m = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.ray.setFromCamera(m, this.camera);
    const hit = this.ray.intersectObjects(this.meshes.filter((x) => x.visible), false)[0];
    if (!hit) { this.tip.style.display = 'none'; return; }
    const p = hit.object.userData.part;
    let txt = `<b>${p.name || ''}</b>`;
    if (p.kind === 'inst') txt += `<br>${p.items.length / 7} in this group`;
    if (p.lumber) txt += `<br>${p.lumber} × ${ftin(p.len)}`;
    if (p.info) txt += `<br>${p.info}`;
    this.tip.innerHTML = txt;
    this.tip.style.display = 'block';
    this.tip.style.left = e.clientX - rect.left + 14 + 'px';
    this.tip.style.top = e.clientY - rect.top + 14 + 'px';
  }

  tick() {
    this.controls.update();
    if (this.sky) {
      this.sky.position.copy(this.camera.position);
      // eye adaptation: open up the exposure when the camera is indoors
      const c = this.camera.position, b = this.bounds;
      const inside = b && c.x > b.min[0] + 50 && c.x < b.max[0] - 50 && c.z > b.min[2] + 50 && c.z < b.max[2] - 50 && c.y < b.max[1] * 0.8;
      const target = EXPOSURE * (inside && this.step >= this.maxStep ? 2.6 : 1);
      const r = this.renderer;
      if (r.toneMappingExposure !== target) {
        r.toneMappingExposure += (target - r.toneMappingExposure) * (Math.abs(target - r.toneMappingExposure) < 0.01 ? 1 : 0.08);
        this.dirty = true;
      }
    }
    if (this.headLight) {
      // light from above and to the left of the viewer
      const cam = this.camera;
      const fwd = this.controls.target.clone().sub(cam.position).normalize();
      const right = new THREE.Vector3().crossVectors(fwd, cam.up).normalize();
      const dir = fwd.clone().multiplyScalar(-1).addScaledVector(right, -0.9).add(new THREE.Vector3(0, 1.1, 0)).normalize();
      this.headLight.target.position.copy(this.controls.target);
      this.headLight.position.copy(this.controls.target).addScaledVector(dir, 1000);
    }
    if (this.animT0) {
      this.applyState();
      if (performance.now() - this.animT0 > 750) this.animT0 = null;
    }
    // only draw when something changed: an idle view costs nothing
    if (!this.dirty) return;
    this.dirty = false;
    if (this.composer && this.mode === 'real') this.composer.render();
    else this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
  }

  invalidate() {
    this.dirty = true;
  }

  screenshot() {
    return this.renderer.domElement.toDataURL('image/png');
  }
}
