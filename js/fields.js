// Sidebar parameter controls, shared by the house and the toilet house.
// groups: [{ title, open, fields: [{ k, label, type, min, max, step, fmt, opts, str, hint }] }]
// type: range (default) | select | pct | num, or anything custom(f) renders;
// when(P) hides a field that doesn't apply.

export function buildFields(host, groups, { P, onInput, prefix = '', custom = () => null }) {
  host.innerHTML = '';
  for (const g of groups) {
    const det = document.createElement('details');
    det.className = 'group';
    det.open = g.open;
    det.innerHTML = `<summary>${g.title}</summary>`;
    for (const f of g.fields) {
      const d = document.createElement('div');
      d.className = 'field' + (f.type === 'pct' || f.type === 'num' ? ' row' : '');
      const html = custom(f);
      if (html) {
        d.innerHTML = html;
        det.appendChild(d);
        continue;
      }
      const id = `${prefix}f-${f.k}`;
      if (f.type === 'select') {
        d.innerHTML = `<label for="${id}">${f.label}</label><select id="${id}">${f.opts.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>`;
      } else if (f.type === 'pct' || f.type === 'num') {
        d.innerHTML = `<label for="${id}">${f.label}${f.type === 'pct' ? ' (%)' : ''}</label><input type="number" id="${id}" min="${f.min ?? 0}"${f.max !== undefined ? ` max="${f.max}"` : ''} step="${f.step || 1}">`;
      } else {
        d.innerHTML = `<label for="${id}">${f.label} <span class="val" id="${prefix}v-${f.k}"></span></label><input type="range" id="${id}" min="${f.min}" max="${f.max}" step="${f.step}">`;
      }
      if (f.hint) d.insertAdjacentHTML('beforeend', `<div class="hint">${f.hint}</div>`);
      det.appendChild(d);
      const el = d.querySelector('input,select');
      el.addEventListener(f.type === 'select' ? 'change' : 'input', () => {
        let v = f.str ? el.value : Number(el.value);
        if (!f.str && f.max !== undefined) v = Math.min(f.max, Math.max(f.min ?? 0, v || 0));
        P[f.k] = v;
        onInput(f.k);
      });
    }
    host.appendChild(det);
  }
}

export function syncFields(groups, P, prefix = '') {
  for (const g of groups) {
    for (const f of g.fields) {
      const el = document.getElementById(`${prefix}f-${f.k}`);
      if (!el) continue;
      if (document.activeElement !== el) el.value = P[f.k];
      const v = document.getElementById(`${prefix}v-${f.k}`);
      if (v) v.textContent = f.fmt(P[f.k]);
      if (f.when) el.closest('.field').hidden = !f.when(P);
    }
  }
}
