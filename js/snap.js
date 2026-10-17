// Still pictures of a design for the step-by-step guides: one hidden
// SketchUp-style viewer renders the model at a chosen construction step,
// from a chosen direction, framed on a chosen box, and hands back an image
// URL. The parts added in that step are drawn highlighted.
import * as THREE from 'three';
import { Viewer } from './viewer.js';

const SIZE = { w: 960, h: 600 };
let viewer = null;
let current = null; // the parts array the viewer was last built from
let queue = Promise.resolve();

function ensureViewer() {
  if (viewer) return viewer;
  const host = document.createElement('div');
  host.className = 'snap-host';
  host.style.cssText = `position:fixed;left:-${SIZE.w * 2}px;top:0;width:${SIZE.w}px;height:${SIZE.h}px;pointer-events:none;`;
  host.setAttribute('aria-hidden', 'true');
  document.body.appendChild(host);
  viewer = new Viewer(host, { tooltip: false });
  viewer.active = false; // drawn on demand only
  viewer.renderer.setPixelRatio(1);
  viewer.resize();
  viewer.setMode('sketch');
  // pictures may look up at the roof from below
  viewer.controls.maxPolarAngle = Math.PI;
  return viewer;
}

const frame = () => new Promise((r) => requestAnimationFrame(() => r()));

// shot: { step, maxStep, dir: [x,y,z], box: {min,max}, zoom, explode,
//         ground: false hides the ground, hide: (part) => bool }
function render(v, s, maxStep) {
  v.explode = s.explode || 0;
  v.setStep(s.step ?? maxStep, maxStep);
  v.animT0 = null;
  v.applyState(true);
  if (s.hide) for (const m of v.meshes) if (m.visible && s.hide(m.userData.part)) m.visible = false;
  v.ground.visible = s.ground !== false;
  v.dimGroup.visible = false;
  const { min, max } = s.box;
  const c = new THREE.Vector3().fromArray(min).add(new THREE.Vector3().fromArray(max)).multiplyScalar(0.5);
  const half = new THREE.Vector3().fromArray(max).sub(new THREE.Vector3().fromArray(min)).multiplyScalar(0.5);
  const dir = new THREE.Vector3(...(s.dir || [0.62, 0.42, 1])).normalize();
  // fit the box's corners in the frame, looking along dir
  const cam = v.camera;
  cam.aspect = SIZE.w / SIZE.h;
  cam.updateProjectionMatrix();
  const up = Math.abs(dir.y) > 0.99 ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(up, dir).normalize();
  const vup = new THREE.Vector3().crossVectors(dir, right);
  const tv = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
  let dist = 0;
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const p = new THREE.Vector3(sx * half.x, sy * half.y, sz * half.z);
    const depth = p.dot(dir); // toward the camera
    dist = Math.max(dist, Math.abs(p.dot(vup)) / tv + depth, Math.abs(p.dot(right)) / (tv * cam.aspect) + depth);
  }
  dist *= 1.06 / (s.zoom || 1);
  cam.up.copy(up);
  cam.position.copy(c).addScaledVector(dir, dist);
  cam.near = Math.max(0.5, dist / 400);
  cam.far = dist * 40 + 5000;
  cam.updateProjectionMatrix();
  v.controls.target.copy(c);
  v.controls.update();
  cam.lookAt(c);
  v.dirty = true;
  v.tick();
  return new Promise((r) => v.renderer.domElement.toBlob((b) => r(URL.createObjectURL(b)), 'image/png'));
}

// Render every shot for one model; onShot(id, url) is called as each one is
// ready. Returns a promise that resolves when all are done. Calls queue up,
// so two guides never fight over the viewer.
export function snapshots(model, shots, onShot, isStale = () => false) {
  queue = queue.then(async () => {
    if (isStale()) return;
    const v = ensureViewer();
    if (current !== model.parts) {
      v.setModel({ parts: model.parts, bounds: model.bounds, dims: [] }, { fit: true });
      current = model.parts;
    }
    for (const s of shots) {
      if (isStale()) return;
      await frame();
      const url = await render(v, s, model.maxStep);
      onShot(s.id, url);
    }
    // leave the model as it was (all steps, nothing hidden)
    v.setStep(model.maxStep, model.maxStep);
    v.ground.visible = true;
  }).catch((e) => console.warn('snapshot failed', e));
  return queue;
}
