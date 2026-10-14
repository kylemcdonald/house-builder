import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { makeMaterials, groundTextureRepeat } from './materials.js';
import { boxGeometry, sheetGeometry, cylGeometry } from './geometry.js';
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
    this.camera = new THREE.PerspectiveCamera(40, 1, 2, 40000);
    this.camera.position.set(400, 260, 500);
    this.controls = new OrbitControls(this.camera, r.domElement);
    this.controls.enableDamping = true;
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
      r.domElement.addEventListener('pointermove', (e) => this.onHover(e));
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
    const r = this.renderer;
    const realistic = this.mode === 'real';
    r.toneMapping = realistic ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
    r.toneMappingExposure = realistic ? 0.9 : 1;
    r.shadowMap.enabled = realistic;
    this.M = makeMaterials(realistic ? 'real' : 'sketch');

    const ground = new THREE.Mesh(new THREE.CircleGeometry(4000, 64), this.M.ground);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.renderOrder = -1;
    ground.userData.ground = true;
    groundTextureRepeat(this.M, 8000);
    if (this.M.ground.map) {
      ground.geometry.attributes.uv.array.forEach((_, i, a) => (a[i] = a[i]));
    }
    this.env.add(ground);
    this.ground = ground;

    if (!realistic) {
      this.scene.background = gradientTexture('#cfe3f3', '#f5f8fa');
      this.env.add(new THREE.HemisphereLight(0xffffff, 0xb8b0a0, 1.7));
      const d = new THREE.DirectionalLight(0xffffff, 1.5);
      d.position.set(-0.6, 1, 0.8);
      this.env.add(d);
      this.composer = null;
    } else {
      const sky = new Sky();
      sky.scale.setScalar(30000);
      const u = sky.material.uniforms;
      u.turbidity.value = 2.5;
      u.rayleigh.value = 2.2;
      u.mieCoefficient.value = 0.004;
      u.mieDirectionalG.value = 0.8;
      const sun = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(38), THREE.MathUtils.degToRad(140));
      u.sunPosition.value.copy(sun);
      // environment map from the sky
      const pm = new THREE.PMREMGenerator(r);
      const envScene = new THREE.Scene();
      const sky2 = new Sky();
      sky2.scale.setScalar(1000);
      Object.entries(u).forEach(([k, v]) => (sky2.material.uniforms[k].value = v.value?.clone ? v.value.clone() : v.value));
      envScene.add(sky2);
      const gEnv = new THREE.Mesh(new THREE.CircleGeometry(900, 32), new THREE.MeshBasicMaterial({ color: 0xbfae8a }));
      gEnv.rotation.x = -Math.PI / 2;
      gEnv.position.y = -5;
      envScene.add(gEnv);
      this.envMap = pm.fromScene(envScene, 0.02).texture;
      pm.dispose();
      this.scene.environment = this.envMap;
      this.scene.background = null;
      this.env.add(sky);
      const sunL = new THREE.DirectionalLight(0xfff1dc, 3.2);
      sunL.position.copy(sun).multiplyScalar(1500);
      sunL.castShadow = true;
      sunL.shadow.mapSize.set(4096, 4096);
      sunL.shadow.bias = -0.0004;
      sunL.shadow.normalBias = 0.6;
      sunL.shadow.radius = 3;
      this.sun = sunL;
      this.env.add(sunL);
      this.env.add(sunL.target);
      this.env.add(new THREE.HemisphereLight(0xcfe6ff, 0xc9b48a, 0.5));
      this.updateShadowBounds();
      try {
        const w = this.container.clientWidth || 1;
        const h = this.container.clientHeight || 1;
        const comp = new EffectComposer(r);
        comp.addPass(new RenderPass(this.scene, this.camera));
        const ao = new GTAOPass(this.scene, this.camera, w, h);
        ao.updateGtaoMaterial({ radius: 24, distanceExponent: 1.5, thickness: 6, scale: 1.2 });
        ao.blendIntensity = 0.85;
        comp.addPass(ao);
        comp.addPass(new OutputPass());
        comp.setSize(w, h);
        comp.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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
    for (const p of this.parts) {
      let geo;
      if (p.kind === 'box') geo = boxGeometry(p.size, p.id);
      else if (p.kind === 'sheet') geo = sheetGeometry(p.geom);
      else if (p.kind === 'cyl') geo = cylGeometry(p.r, p.h);
      else continue;
      const mat = this.M[p.mat] || this.M.wood;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.fromArray(p.pos);
      if (p.quat) mesh.quaternion.fromArray(p.quat);
      mesh.userData.part = p;
      mesh.userData.base = mesh.position.clone();
      mesh.castShadow = !sketch && p.mat !== 'glass' && p.mat !== 'hole';
      mesh.receiveShadow = !sketch;
      if (p.mat === 'glass') mesh.renderOrder = 2;
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

  fit() {
    if (!this.bounds) return;
    const { min, max } = this.bounds;
    const c = new THREE.Vector3((min[0] + max[0]) / 2, (Math.max(0, min[1]) + max[1]) / 2 * 0.8, (min[2] + max[2]) / 2);
    const size = Math.max(max[0] - min[0], max[1] - Math.max(0, min[1]), max[2] - min[2]);
    const dist = size / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * (this.fitDir ? 0.6 : 0.62);
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
    if (p.lumber) txt += `<br>${p.lumber} × ${ftin(p.len)}`;
    if (p.info) txt += `<br>${p.info}`;
    this.tip.innerHTML = txt;
    this.tip.style.display = 'block';
    this.tip.style.left = e.clientX - rect.left + 14 + 'px';
    this.tip.style.top = e.clientY - rect.top + 14 + 'px';
  }

  tick() {
    this.controls.update();
    if (this.animT0) {
      this.applyState();
      if (performance.now() - this.animT0 > 750) this.animT0 = null;
    }
    if (this.composer && this.mode === 'real') this.composer.render();
    else this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
  }

  screenshot() {
    return this.renderer.domElement.toDataURL('image/png');
  }
}
