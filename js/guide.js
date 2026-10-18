// Shared layout for the step-by-step guides: a table of contents, parts made
// of numbered steps (each with a "done" tick remembered in this browser),
// and 3D pictures that are drawn after the page is shown.
import { snapshots } from './snap.js';

const DONE_KEY = 'polowat-guide-done';
let done = {};
try { done = JSON.parse(localStorage.getItem(DONE_KEY) || '{}'); } catch { /* storage unavailable */ }
const saveDone = () => { try { localStorage.setItem(DONE_KEY, JSON.stringify(done)); } catch { /* ignore */ } };

// small HTML helpers for the guide text
export const tip = (h) => `<div class="g-tip"><b>Tip</b>${h}</div>`;
export const warn = (h) => `<div class="g-warn"><b>Careful</b>${h}</div>`;
export const check = (items) => `<div class="g-check"><b>Check before you go on</b><ul>${items.filter(Boolean).map((x) => `<li>${x}</li>`).join('')}</ul></div>`;
export const need = (items, title = 'You need for this part') => `<div class="g-need"><b>${title}</b><ul>${items.filter(Boolean).map((x) => `<li>${x}</li>`).join('')}</ul></div>`;
export const figs = (...f) => `<div class="g-figs${f.length === 1 ? ' one' : ''}">${f.join('')}</div>`;
export const ol = (items) => `<ol>${items.filter(Boolean).map((x) => `<li>${x}</li>`).join('')}</ol>`;
export const ul = (items) => `<ul>${items.filter(Boolean).map((x) => `<li>${x}</li>`).join('')}</ul>`;

const timers = new WeakMap();
const urls = new WeakMap();
const tokens = new WeakMap();

// g: { key, title, lede, parts: [{ id, title, intro, steps: [{ title, html }] }],
//      shots: [...], model: { parts, bounds, maxStep } }
export function renderGuide(host, g) {
  const scroller = host.closest('.tpane');
  const keep = scroller ? scroller.scrollTop : 0;
  let n = 0;
  const total = g.parts.reduce((s, p) => s + p.steps.length, 0);
  let h = `<div class="guide"><h2>${g.title}</h2>${g.lede}
    <ol class="g-toc">${g.parts.map((p, i) => `<li><a href="#" data-goto="${g.key}-${p.id}"><span class="n">${i}</span>${p.title}</a></li>`).join('')}</ol>
    <p class="g-progress" data-progress></p>`;
  g.parts.forEach((p, i) => {
    h += `<section class="g-part" id="${g.key}-${p.id}"><header><div class="k">Part ${i}</div><h2>${p.title}</h2>${p.intro ? `<p>${p.intro}</p>` : ''}</header>`;
    for (const st of p.steps) {
      n++;
      const id = `${g.key}:${p.id}:${st.title}`;
      h += `<div class="g-step${done[id] ? ' done' : ''}"><div class="num">${n}</div><div class="body">
        <h3>${st.title}<label><input type="checkbox" data-done="${encodeURIComponent(id)}"${done[id] ? ' checked' : ''}> Done</label></h3>${st.html}</div></div>`;
    }
    h += `</section>`;
  });
  h += `</div>`;
  host.innerHTML = h;
  if (scroller) scroller.scrollTop = keep;

  const progress = () => {
    const ticks = host.querySelectorAll('input[data-done]');
    const c = [...ticks].filter((x) => x.checked).length;
    host.querySelector('[data-progress]').textContent = c ? `${c} of ${total} steps ticked off as done.` : `${total} steps. Tick each one off as you finish it; the ticks are kept in this browser.`;
  };
  progress();
  host.querySelectorAll('input[data-done]').forEach((cb) => cb.addEventListener('change', () => {
    const id = decodeURIComponent(cb.dataset.done);
    if (cb.checked) done[id] = 1;
    else delete done[id];
    saveDone();
    cb.closest('.g-step').classList.toggle('done', cb.checked);
    progress();
  }));
  host.querySelectorAll('[data-goto]').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    host.querySelector('#' + a.dataset.goto)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));

  // the 3D pictures: drawn one by one, a moment after the last change
  for (const u of urls.get(host) || []) URL.revokeObjectURL(u);
  const made = [];
  urls.set(host, made);
  const token = {};
  tokens.set(host, token);
  host.dataset.shots = 'pending';
  clearTimeout(timers.get(host));
  timers.set(host, setTimeout(() => {
    snapshots(g.model, g.shots, (id, url) => {
      made.push(url);
      for (const box of host.querySelectorAll(`.gshot[data-shot="${id}"]`)) {
        const img = box.querySelector('img');
        img.src = url;
        img.hidden = false;
        box.classList.add('ready');
      }
      if (made.length === g.shots.length) host.dataset.shots = 'done';
    }, () => tokens.get(host) !== token || !host.isConnected || !host.offsetParent);
  }, 350));
}
