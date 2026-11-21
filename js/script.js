'use strict';
/* =====================================================================
   wMaktab front end
   One file drives three pages: index (landing), login and dashboard.
   The dashboard is a small single-page app that talks to the Flask JSON API.
   ===================================================================== */

/* ---------------------------------------------------------------------
   Basics: DOM helpers, safe HTML templating, API client
   --------------------------------------------------------------------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

/** Marks a string as already-safe HTML. */
class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
const raw = (s) => new Raw(String(s));

/** Tagged template: every interpolated value is HTML-escaped unless it is Raw. */
function html(strings, ...vals) {
  const part = (v) => {
    if (v instanceof Raw) return v.s;
    if (Array.isArray(v)) return v.map(part).join('');
    if (v === false || v === null || v === undefined) return '';
    return esc(v);
  };
  let out = '';
  strings.forEach((s, i) => { out += s; if (i < vals.length) out += part(vals[i]); });
  return new Raw(out);
}

let CSRF = $('meta[name="csrf-token"]')?.content || '';

/* api() is provided by js/backend.js (in-browser backend with a JSON database). */

/* ---------------------------------------------------------------------
   Formatting helpers
   --------------------------------------------------------------------- */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const STATUSES = ['present', 'late', 'excused', 'absent'];

const fmt = (n, d = 2) => (n === null || n === undefined || Number.isNaN(Number(n))) ? '–' : Number(n).toFixed(d);
const pct = (n) => (n === null || n === undefined) ? '–' : `${Number(n).toFixed(Number(n) % 1 ? 1 : 0)}%`;
const cap = (s) => s ? s[0].toUpperCase() + s.slice(1) : '';
const pad2 = (n) => String(n).padStart(2, '0');
const initials = (name) => (name || '?').split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const gcls = (v) => `g${Math.min(5, Math.max(1, Math.round(Number(v)) || 1))}`;

function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}
function fmtShort(iso) {
  const [, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}
function daysUntil(iso) {
  const a = new Date(`${state.meta.today}T00:00:00`);
  const b = new Date(`${iso}T00:00:00`);
  return Math.round((b - a) / 86400000);
}
function dueInfo(iso) {
  const n = daysUntil(iso);
  if (n < 0) return { text: `${-n} day${n === -1 ? '' : 's'} overdue`, tone: 'b-red' };
  if (n === 0) return { text: 'Due today', tone: 'b-amber' };
  if (n === 1) return { text: 'Due tomorrow', tone: 'b-amber' };
  return { text: `Due in ${n} days`, tone: 'b-blue' };
}
function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}
/** Quarter of a date string (same calendar as the server). */
function quarterOf(iso) {
  const m = Number(iso.slice(5, 7));
  return [9, 10].includes(m) ? 1 : [11, 12].includes(m) ? 2 : [1, 2, 3].includes(m) ? 3 : 4;
}
/** A sensible default date for a new grade in the chosen quarter. */
function defaultGradeDate(q) {
  const startYear = Number(state.meta.school_year_start.slice(0, 4));
  const ends = { 1: `${startYear}-10-31`, 2: `${startYear}-12-31`, 3: `${startYear + 1}-03-31`, 4: `${startYear + 1}-05-31` };
  const end = ends[q] || state.meta.today;
  return end < state.meta.today ? end : state.meta.today;
}

/* ---------------------------------------------------------------------
   Icons (24px stroke icons)
   --------------------------------------------------------------------- */
const ICONS = {
  home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  chart: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
  check: '<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  book: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  sliders: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  menu: '<line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  edit: '<path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>',
  trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
  key: '<path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  tick: '<polyline points="20 6 9 17 4 12"/>',
  x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  pin: '<line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24z"/>',
  left: '<polyline points="15 18 9 12 15 6"/>',
  right: '<polyline points="9 18 15 12 9 6"/>',
  pause: '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>',
  power: '<path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/>',
  award: '<circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/>',
};
const icon = (name, cls = '') => raw(`<svg class="ico ${esc(cls)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`);

/* ---------------------------------------------------------------------
   Toasts, modals, confirm dialog, generic form modal
   --------------------------------------------------------------------- */
function toast(message, type = 'info') {
  const root = $('#toasts');
  if (!root) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.textContent = message;
  root.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, type === 'error' ? 5200 : 3200);
}

let lastFocus = null;
function openModal({ title, body, wide = false }) {
  closeModal();
  lastFocus = document.activeElement;
  const root = $('#modal-root');
  root.innerHTML = html`
    <div class="modal-backdrop" data-act="modal-backdrop">
      <div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${title}">
        <div class="modal-head"><h3>${title}</h3>
          <button class="icon-btn" type="button" data-act="modal-close" aria-label="Close">${icon('x')}</button></div>
        <div class="modal-body">${body}</div>
      </div>
    </div>`.s;
  document.body.classList.add('modal-open');
  const first = $('.modal-body input:not([type=hidden]), .modal-body select, .modal-body textarea', root);
  (first || $('.modal-head button', root))?.focus();
}
function closeModal() {
  const root = $('#modal-root');
  if (root && root.innerHTML) {
    root.innerHTML = '';
    document.body.classList.remove('modal-open');
    lastFocus?.focus?.();
  }
}

let cancelConfirm = null;
function confirmBox(message, { title = 'Are you sure?', okText = 'Delete', danger = true } = {}) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop confirm';
    wrap.innerHTML = html`
      <div class="modal small" role="alertdialog" aria-modal="true" aria-label="${title}">
        <div class="modal-body">
          <h3>${title}</h3><p>${message}</p>
          <div class="modal-actions">
            <button class="btn ghost" type="button" data-r="0">Cancel</button>
            <button class="btn ${danger ? 'danger' : 'primary'}" type="button" data-r="1">${okText}</button>
          </div>
        </div>
      </div>`.s;
    document.body.appendChild(wrap);
    const done = (v) => { wrap.remove(); cancelConfirm = null; resolve(v); };
    cancelConfirm = () => done(false);
    wrap.addEventListener('click', (e) => {
      const b = e.target.closest('[data-r]');
      if (b) done(b.dataset.r === '1');
      else if (e.target === wrap) done(false);
    });
    $('[data-r="1"]', wrap).focus();
  });
}

function fieldHtml(f, value) {
  const id = `f_${f.name}`;
  const v = value ?? f.value ?? '';
  const attrs = raw([
    f.required ? 'required' : '', f.min !== undefined ? `min="${esc(f.min)}"` : '',
    f.max !== undefined ? `max="${esc(f.max)}"` : '', f.maxlength ? `maxlength="${Number(f.maxlength)}"` : '',
    f.minlength ? `minlength="${Number(f.minlength)}"` : '', f.placeholder ? `placeholder="${esc(f.placeholder)}"` : '',
    f.autocomplete ? `autocomplete="${esc(f.autocomplete)}"` : '', f.readonly ? 'readonly' : '',
  ].filter(Boolean).join(' '));
  let control;
  if (f.type === 'select') {
    control = html`<select id="${id}" name="${f.name}" ${attrs}>${(f.options || []).map((o) =>
      html`<option value="${o.value}" ${String(o.value) === String(v) ? raw('selected') : ''}>${o.label}</option>`)}</select>`;
  } else if (f.type === 'textarea') {
    control = html`<textarea id="${id}" name="${f.name}" rows="${f.rows || 4}" ${attrs}>${v}</textarea>`;
  } else if (f.type === 'grade') {
    control = html`<div class="grade-picker" role="radiogroup" aria-label="Grade">${[5, 4, 3, 2, 1].map((n) =>
      html`<label class="gp ${gcls(n)}"><input type="radio" name="${f.name}" value="${n}" ${String(v) === String(n) ? raw('checked') : ''}><span>${n}</span></label>`)}</div>`;
  } else if (f.type === 'checkbox') {
    return html`<label class="check ${f.full ? 'full' : ''}"><input type="checkbox" name="${f.name}" ${v ? raw('checked') : ''}> <span>${f.label}</span></label>`;
  } else {
    control = html`<input id="${id}" name="${f.name}" type="${f.type || 'text'}" value="${v}" ${attrs}>`;
  }
  return html`<div class="field ${f.full ? 'full' : ''}" data-field="${f.name}"><label for="${id}">${f.label}${f.required ? html` <i class="req">*</i>` : ''}</label>${control}${f.hint ? html`<small class="hint">${f.hint}</small>` : ''}</div>`;
}

function readFields(form, fields) {
  const values = {};
  fields.forEach((f) => {
    if (f.type === 'checkbox') values[f.name] = form.elements[f.name].checked;
    else if (f.type === 'grade') values[f.name] = form.querySelector(`input[name="${f.name}"]:checked`)?.value ?? '';
    else values[f.name] = form.elements[f.name]?.value ?? '';
  });
  return values;
}

/** Opens a modal with a form. onSubmit(values) may throw an Error to show it inside the form. */
function formModal({ title, fields, values = {}, submitText = 'Save', onSubmit, onOpen, extraButtons, intro, wide }) {
  openModal({
    title, wide,
    body: html`<form id="modal-form" class="form">
      ${intro ? html`<p class="muted form-intro">${intro}</p>` : ''}
      <div class="form-grid">${fields.map((f) => fieldHtml(f, values[f.name]))}</div>
      <div class="alert error" id="form-error" role="alert" hidden></div>
      <div class="modal-actions">${extraButtons || ''}<span class="spacer"></span>
        <button class="btn ghost" type="button" data-act="modal-close">Cancel</button>
        <button class="btn primary" type="submit">${submitText}</button></div>
    </form>`,
  });
  const form = $('#modal-form');
  onOpen?.(form);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('button[type=submit]', form);
    const err = $('#form-error', form);
    err.hidden = true;
    btn.disabled = true;
    try {
      await onSubmit(readFields(form, fields), form);
      closeModal();
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
      btn.disabled = false;
    }
  });
}

/* ---------------------------------------------------------------------
   Small UI building blocks and charts (pure HTML/SVG, no libraries)
   --------------------------------------------------------------------- */
const options = (items, selected, val = (x) => x.id, label = (x) => x.name) =>
  items.map((x) => html`<option value="${val(x)}" ${String(val(x)) === String(selected) ? raw('selected') : ''}>${label(x)}</option>`);

const chip = (v, extra = '') => html`<span class="gc ${gcls(v)} ${extra}">${v}</span>`;
const empty = (text, sub = '') => html`<div class="empty"><div class="empty-ico">${icon('book')}</div><p>${text}</p>${sub ? html`<small>${sub}</small>` : ''}</div>`;
const pageHead = (title, sub = '', actions = '') => html`<div class="page-head"><div><h2>${title}</h2>${sub ? html`<p class="muted">${sub}</p>` : ''}</div><div class="page-actions">${actions}</div></div>`;
const btn = (label, act, ic, cls = 'primary', data = {}) => html`<button type="button" class="btn ${cls}" data-act="${act}" ${raw(Object.entries(data).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' '))}>${ic ? icon(ic) : ''}${label}</button>`;
const iconBtn = (ic, act, label, data = {}, cls = '') => html`<button type="button" class="icon-btn ${cls}" data-act="${act}" aria-label="${label}" title="${label}" ${raw(Object.entries(data).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' '))}>${icon(ic)}</button>`;

function statCard({ label, value, suffix = '', ic, tone = 'blue', hint = '', dec = 2 }) {
  const num = value === null || value === undefined || value === '' ? null : Number(value);
  return html`<div class="card stat ${tone}"><div class="stat-icon">${icon(ic)}</div>
    <div class="stat-body"><div class="stat-label">${label}</div>
      <div class="stat-value">${num === null ? '–' : html`<span class="count" data-to="${num}" data-dec="${dec}">0</span>${suffix}`}</div>
      ${hint ? html`<div class="stat-hint">${hint}</div>` : ''}</div></div>`;
}

function animateCounts(root) {
  $$('.count[data-to]', root).forEach((el) => {
    const to = Number(el.dataset.to), dec = Number(el.dataset.dec || 0);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = to.toFixed(dec); return; }
    const t0 = performance.now(), dur = 800;
    const tick = (t) => {
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = (to * e).toFixed(dec);
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

function barChart(items, { max = 5 } = {}) {
  if (!items.length) return empty('No data yet.');
  return html`<div class="bars">${items.map((it, i) => {
    const v = it.value, h = v === null || v === undefined ? 0 : Math.max(4, (v / max) * 100);
    return html`<div class="bar-col" title="${it.label}: ${fmt(v)}">
      <div class="bar-value">${fmt(v)}</div>
      <div class="bar-track"><div class="bar-fill ${v === null || v === undefined ? '' : gcls(v)}" style="--h:${h}%;--d:${i * 70}ms"></div></div>
      <div class="bar-label">${it.label}</div></div>`;
  })}</div>`;
}

function hbars(rows) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return html`<div class="hbars">${rows.map((r, i) => html`<div class="hbar">
    <span class="hbar-label">${r.label}</span>
    <div class="hbar-track"><div class="hbar-fill ${r.cls || ''}" style="--w:${(r.value / max) * 100}%;--d:${i * 80}ms"></div></div>
    <span class="hbar-val">${r.value}${r.sub ? html` <small>${r.sub}</small>` : ''}</span></div>`)}</div>`;
}

function distChart(dist) {
  const total = [1, 2, 3, 4, 5].reduce((a, k) => a + ((dist && dist[k]) || 0), 0);
  if (!total) return empty('No grades yet.');
  return hbars([5, 4, 3, 2, 1].map((k) => ({
    label: `Grade ${k}`, value: dist[k] || 0, cls: `g${k}`, sub: `${Math.round((100 * (dist[k] || 0)) / total)}%`,
  })));
}

function lineChart(points, { min = 1, max = 5 } = {}) {
  const valid = points.filter((p) => p.value !== null && p.value !== undefined);
  if (!valid.length) return empty('No data yet.');
  const W = 520, H = 230, L = 34, R = 18, T = 24, B = 34, n = points.length;
  const x = (i) => (n === 1 ? L + (W - L - R) / 2 : L + i * ((W - L - R) / (n - 1)));
  const y = (v) => T + (1 - (v - min) / (max - min)) * (H - T - B);
  const pts = points.map((p, i) => (p.value === null || p.value === undefined ? null : [x(i), y(p.value), p]));
  const line = pts.filter(Boolean).map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const first = pts.find(Boolean), last = [...pts].reverse().find(Boolean);
  const area = `${line} L${last[0].toFixed(1)},${H - B} L${first[0].toFixed(1)},${H - B} Z`;
  const grid = [];
  for (let g = min; g <= max; g++) grid.push(html`<line class="grid-line" x1="${L}" x2="${W - R}" y1="${y(g)}" y2="${y(g)}"/><text class="axis" x="${L - 8}" y="${y(g) + 4}" text-anchor="end">${g}</text>`);
  return html`<svg class="line-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Trend chart">
    <defs><linearGradient id="lc-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2563eb" stop-opacity=".22"/><stop offset="1" stop-color="#2563eb" stop-opacity="0"/></linearGradient></defs>
    ${grid}
    <path class="lc-area" d="${area}" fill="url(#lc-fill)"/>
    <path class="lc-line" pathLength="1" d="${line}" fill="none"/>
    ${pts.filter(Boolean).map((p) => html`<circle class="lc-dot" cx="${p[0]}" cy="${p[1]}" r="5"/><text class="lc-val" x="${p[0]}" y="${p[1] - 11}" text-anchor="middle">${fmt(p[2].value)}</text>`)}
    ${points.map((p, i) => html`<text class="axis" x="${x(i)}" y="${H - 10}" text-anchor="middle">${p.label}</text>`)}
  </svg>`;
}

function donut(parts, center, sub) {
  const total = parts.reduce((a, p) => a + p.value, 0);
  if (!total) return empty('No data yet.');
  let cum = 0;
  const segs = parts.filter((p) => p.value > 0).map((p) => {
    const len = (p.value / total) * 100, off = 25 - cum;
    cum += len;
    return html`<circle class="donut-seg ${p.cls}" r="15.9155" cx="21" cy="21" fill="none" stroke-width="5" stroke-dasharray="${len.toFixed(2)} ${(100 - len).toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}"/>`;
  });
  return html`<div class="donut-wrap"><svg class="donut" viewBox="0 0 42 42" role="img" aria-label="${sub}">
    <circle class="donut-track" r="15.9155" cx="21" cy="21" fill="none" stroke-width="5"/>${segs}
    <text class="donut-num" x="21" y="22.5" text-anchor="middle">${center}</text>
    <text class="donut-sub" x="21" y="27.5" text-anchor="middle">${sub}</text></svg>
    <ul class="legend">${parts.map((p) => html`<li><i class="dot ${p.cls}"></i>${p.label}<b>${p.value}</b></li>`)}</ul></div>`;
}

function statRow(summary, extra = []) {
  const s = summary || {};
  return html`<div class="grid cols-4 stat-row">
    ${statCard({ label: 'Average grade', value: s.mean, ic: 'chart', hint: s.count ? `${s.count} grades` : 'No grades yet' })}
    ${statCard({ label: 'Median', value: s.median, ic: 'star', tone: 'sky', dec: 1 })}
    ${statCard({ label: 'Quality rate (4-5)', value: s.quality_rate, suffix: '%', ic: 'award', tone: 'green', dec: 1 })}
    ${statCard({ label: 'Success rate (3-5)', value: s.pass_rate, suffix: '%', ic: 'tick', tone: 'indigo', dec: 1 })}
    ${extra}
  </div>`;
}

/* ---------------------------------------------------------------------
   Application state and navigation
   --------------------------------------------------------------------- */
const state = { user: null, meta: null };
const ui = { gb: {}, stats: {}, att: {}, tt: {}, hw: { filter: 'pending', class_id: '' }, users: { q: '', role: '', class_id: '' }, stu: {}, grades: {} };

const NAV = {
  student: [
    ['dashboard', 'Dashboard', 'home'], ['grades', 'My grades', 'star'], ['attendance', 'Attendance', 'check'],
    ['timetable', 'Timetable', 'clock'], ['homework', 'Homework', 'book'], ['statistics', 'Statistics', 'chart'],
    ['announcements', 'News', 'bell'], ['profile', 'My profile', 'user'],
  ],
  teacher: [
    ['dashboard', 'Dashboard', 'home'], ['grades', 'Grade book', 'star'], ['attendance', 'Attendance', 'check'],
    ['timetable', 'Timetable', 'clock'], ['homework', 'Homework', 'book'], ['students', 'My students', 'users'],
    ['statistics', 'Statistics', 'chart'], ['announcements', 'News', 'bell'], ['profile', 'My profile', 'user'],
  ],
  admin: [
    ['dashboard', 'Dashboard', 'home'], ['users', 'Users', 'users'], ['setup', 'School setup', 'sliders'],
    ['grades', 'Grade book', 'star'], ['attendance', 'Attendance', 'check'], ['timetable', 'Timetable', 'clock'],
    ['homework', 'Homework', 'book'], ['statistics', 'Statistics', 'chart'], ['announcements', 'News', 'bell'],
    ['profile', 'My profile', 'user'],
  ],
};

const VIEWS = {};
const view = () => $('#view');
const role = () => state.user.role;
const isStaff = () => role() !== 'student';

function currentRoute() { return (location.hash.replace(/^#\/?/, '') || 'dashboard').split('?')[0]; }

async function render() {
  const items = NAV[role()];
  let name = currentRoute();
  const item = items.find((i) => i[0] === name) || items[0];
  if (item[0] !== name) { location.replace(`#/${item[0]}`); return; }
  closeModal();
  $('#page-title').textContent = item[1];
  document.title = `${item[1]} - wMaktab`;
  $$('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.route === name));
  closeMenu();
  const el = view();
  el.innerHTML = '<div class="skeleton-wrap"><div class="skeleton" style="height:110px"></div><div class="skeleton" style="height:240px"></div></div>';
  try {
    await VIEWS[name](el);
    el.classList.remove('enter'); void el.offsetWidth; el.classList.add('enter');
    animateCounts(el);
  } catch (err) {
    el.innerHTML = html`<div class="card error-card"><h3>Something went wrong</h3><p>${err.message}</p>${btn('Try again', 'reload', 'right', 'primary')}</div>`.s;
  }
}

async function refresh() {
  const y = window.scrollY;
  await render();
  window.scrollTo(0, y);
}
async function reloadMeta() { state.meta = await api('/api/meta'); }

function openMenu() { $('#sidebar').classList.add('open'); $('#scrim').classList.add('show'); }
function closeMenu() { $('#sidebar')?.classList.remove('open'); $('#scrim')?.classList.remove('show'); }

/* ---------------------------------------------------------------------
   Reusable list renderers
   --------------------------------------------------------------------- */
function annCard(a, { compact = false } = {}) {
  const me = state.user;
  const canEdit = !compact && (me.role === 'admin' || (me.role === 'teacher' && a.author_id === me.id));
  const aud = { all: 'Everyone', students: 'Students', teachers: 'Teachers' }[a.audience];
  return html`<article class="ann ${a.pinned ? 'pinned' : ''}">
    <div class="ann-top"><div class="ann-badges">${a.pinned ? html`<span class="badge b-blue">${icon('pin')} Pinned</span>` : ''}<span class="badge b-gray">${aud}</span></div>
      ${canEdit ? html`<div class="row-actions">${iconBtn('edit', 'ann-edit', 'Edit announcement', { id: a.id })}${iconBtn('trash', 'ann-delete', 'Delete announcement', { id: a.id }, 'danger')}</div>` : ''}</div>
    <h3>${a.title}</h3>
    <p class="${compact ? 'clamp' : ''}">${a.body}</p>
    <small class="muted">${a.author_name || 'School'} &middot; ${fmtDate(a.created_at)}</small></article>`;
}

function lessonList(lessons, mode) {
  if (!lessons.length) return empty('No lessons scheduled.');
  return html`<ul class="list">${lessons.map((l) => html`<li class="lesson">
    <span class="lesson-no">${l.lesson_no}</span>
    <div><b>${l.subject_name}</b><small>${state.meta.lesson_times[l.lesson_no] || ''}${l.room ? ` · ${l.room}` : ''}${mode === 'teacher' ? ` · Class ${l.class_name}` : l.teacher_name ? ` · ${l.teacher_name}` : ''}</small></div></li>`)}</ul>`;
}

function annList(items) {
  return items.length ? html`<div class="ann-list">${items.map((a) => annCard(a, { compact: true }))}</div>` : empty('No announcements yet.');
}

/* ---------------------------------------------------------------------
   VIEW: Dashboard
   --------------------------------------------------------------------- */
function heroCard(title, sub) {
  return html`<section class="hero"><div><h2>${title}</h2><p>${sub}</p></div><div class="hero-art" aria-hidden="true"><i></i><i></i><i></i></div></section>`;
}

VIEWS.dashboard = async (el) => {
  const d = await api('/api/dashboard');
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const first = state.user.full_name.split(' ')[0];
  const dayLabel = d.is_next_school_day ? `Monday's lessons` : `Today's lessons`;
  const annCardHtml = html`<div class="card"><div class="card-head"><h3>School news</h3><a class="link" href="#/announcements">All news</a></div>${annList(d.announcements)}</div>`;
  let body;

  if (d.role === 'student') {
    const s = d.stats;
    body = html`
      ${heroCard(`${greeting()}, ${first}!`, `${today} · Class ${state.user.class_name || ''}`)}
      <div class="grid cols-4">
        ${statCard({ label: 'Average grade', value: s.average, ic: 'star', hint: `${s.grades_count} grades this year` })}
        ${statCard({ label: 'Quality rate', value: s.quality_rate, suffix: '%', ic: 'award', tone: 'green', dec: 0, hint: 'Grades of 4 and 5' })}
        ${statCard({ label: 'Attendance', value: s.attendance_rate, suffix: '%', ic: 'check', tone: 'sky', dec: 1, hint: 'Present or late' })}
        ${statCard({ label: 'Homework to do', value: s.homework_pending, ic: 'book', tone: s.homework_overdue ? 'amber' : 'indigo', dec: 0, hint: s.homework_overdue ? `${s.homework_overdue} overdue` : 'Nothing overdue' })}
      </div>
      <div class="grid cols-2">
        <div class="card"><div class="card-head"><h3>Subject averages</h3><span class="muted">Year to date</span></div>${barChart(d.subject_means.map((x) => ({ label: x.name, value: x.value })))}</div>
        <div class="card"><div class="card-head"><h3>${dayLabel}</h3><span class="muted">${d.day_name}</span></div>${lessonList(d.lessons, 'student')}</div>
      </div>
      <div class="grid cols-2">
        <div class="card"><div class="card-head"><h3>Latest grades</h3><a class="link" href="#/grades">All grades</a></div>
          ${d.recent_grades.length ? html`<ul class="list">${d.recent_grades.map((g) => html`<li class="row">${chip(g.value)}<div><b>${g.subject_name}</b><small>${g.kind} · ${fmtDate(g.date)}</small></div></li>`)}</ul>` : empty('No grades yet.')}</div>
        <div class="card"><div class="card-head"><h3>Homework to do</h3><a class="link" href="#/homework">All homework</a></div>
          ${d.homework.length ? html`<ul class="list">${d.homework.map((h) => { const di = dueInfo(h.due_date); return html`<li class="row"><span class="badge ${di.tone}">${di.text}</span><div><b>${h.title}</b><small>${h.subject_name}</small></div></li>`; })}</ul>` : empty('All caught up!', 'No homework waiting.')}</div>
      </div>
      ${annCardHtml}`;
  } else if (d.role === 'teacher') {
    const s = d.stats;
    body = html`
      ${heroCard(`${greeting()}, ${first}!`, `${today} · ${s.classes} classes, ${s.students} students`)}
      <div class="grid cols-4">
        ${statCard({ label: 'My classes', value: s.classes, ic: 'users', dec: 0 })}
        ${statCard({ label: 'Students', value: s.students, ic: 'user', tone: 'sky', dec: 0 })}
        ${statCard({ label: 'Average of my grades', value: s.average, ic: 'star', tone: 'green' })}
        ${statCard({ label: 'Open homework', value: s.homework_open, ic: 'book', tone: 'indigo', dec: 0, hint: 'Not yet due' })}
      </div>
      <div class="grid cols-2">
        <div class="card"><div class="card-head"><h3>My classes</h3><a class="link" href="#/grades">Open grade book</a></div>
          ${d.classes.length ? html`<ul class="list">${d.classes.map((c) => html`<li class="row"><span class="gc-lg ${c.mean ? gcls(c.mean) : ''}">${c.mean ? fmt(c.mean, 1) : '–'}</span><div><b>Class ${c.class_name}</b><small>${c.subjects.join(', ')} · ${c.students} students</small></div></li>`)}</ul>` : empty('No classes assigned yet.', 'Ask the administrator to assign your classes.')}</div>
        <div class="card"><div class="card-head"><h3>${dayLabel}</h3><span class="muted">${d.day_name}</span></div>${lessonList(d.lessons, 'teacher')}</div>
      </div>
      <div class="grid cols-2">
        <div class="card"><div class="card-head"><h3>Recently entered grades</h3></div>
          ${d.recent_grades.length ? html`<ul class="list">${d.recent_grades.map((g) => html`<li class="row">${chip(g.value)}<div><b>${g.student_name}</b><small>${g.subject_name} · ${g.kind} · ${fmtShort(g.date)}</small></div></li>`)}</ul>` : empty('No grades entered yet.')}</div>
        ${annCardHtml}
      </div>`;
  } else {
    const s = d.stats, at = s.attendance_today;
    body = html`
      ${heroCard(`${greeting()}, ${first}!`, `${today} · School year ${state.meta.school_year}`)}
      <div class="grid cols-4">
        ${statCard({ label: 'Students', value: s.students, ic: 'users', dec: 0 })}
        ${statCard({ label: 'Teachers', value: s.teachers, ic: 'user', tone: 'sky', dec: 0 })}
        ${statCard({ label: 'Classes', value: s.classes, ic: 'sliders', tone: 'indigo', dec: 0 })}
        ${statCard({ label: 'School average', value: s.average, ic: 'star', tone: 'green' })}
      </div>
      <div class="grid cols-2">
        <div class="card"><div class="card-head"><h3>Average by class</h3></div>${barChart(d.class_means.map((x) => ({ label: x.name, value: x.value })))}</div>
        <div class="card"><div class="card-head"><h3>Grade distribution</h3><span class="muted">Whole school</span></div>${distChart(d.distribution)}</div>
      </div>
      <div class="grid cols-2">
        <div class="card"><div class="card-head"><h3>Attendance today</h3><a class="link" href="#/attendance">Open</a></div>
          ${!s.is_school_day ? empty('No school today.') : at.total ? donut(STATUSES.map((k) => ({ label: cap(k), value: at[k], cls: `st-${k}` })), pct(at.rate), 'present') : empty('Not marked yet.', 'Teachers mark attendance during the day.')}</div>
        <div class="card"><div class="card-head"><h3>Newest accounts</h3><a class="link" href="#/users">Manage users</a></div>
          <ul class="list">${d.recent_users.map((u) => html`<li class="row"><span class="avatar sm">${initials(u.full_name)}</span><div><b>${u.full_name}</b><small>${cap(u.role)}${u.class_name ? ` · Class ${u.class_name}` : ''}</small></div></li>`)}</ul></div>
      </div>
      ${annCardHtml}`;
  }
  el.innerHTML = body.s;
};

/* ---------------------------------------------------------------------
   VIEW: Grades (student: own grades; teacher/admin: grade book)
   --------------------------------------------------------------------- */
function markCell(st) {
  if (!st) return html`<span class="muted">–</span>`;
  return html`<span class="mark-cell" title="Average ${fmt(st.mean)} from ${st.count} grade${st.count === 1 ? '' : 's'}">${chip(st.mark)}<small>${fmt(st.mean)}</small></span>`;
}

function summaryTable(sum) {
  return html`<div class="table-wrap"><table class="table">
    <thead><tr><th>Subject</th><th class="c">Quarter 1</th><th class="c">Quarter 2</th><th class="c">Quarter 3</th><th class="c">Quarter 4</th><th class="c">Year</th></tr></thead>
    <tbody>${sum.subjects.map((s) => html`<tr><td><b>${s.name}</b></td>${[1, 2, 3, 4].map((q) => html`<td class="c">${markCell(s.quarters[q])}</td>`)}<td class="c">${markCell(s.year)}</td></tr>`)}</tbody></table></div>
    <p class="muted small note">Quarter mark = average of the quarter's grades, rounded. Year mark = average of the quarter marks (so far).</p>`;
}

async function gradesStudent(el) {
  const [sum, list] = await Promise.all([api('/api/grades/summary'), api('/api/grades')]);
  const f = ui.grades;
  f.subject = f.subject || ''; f.quarter = f.quarter || '';
  const draw = () => {
    const rows = list.grades.filter((g) => (!f.subject || String(g.subject_id) === f.subject) && (!f.quarter || String(g.quarter) === f.quarter));
    $('#grade-list').innerHTML = (rows.length ? html`<div class="table-wrap"><table class="table"><thead><tr><th>Date</th><th>Subject</th><th class="c">Grade</th><th>Type</th><th>Teacher</th><th>Comment</th></tr></thead>
      <tbody>${rows.map((g) => html`<tr><td>${fmtDate(g.date)}</td><td>${g.subject_name}</td><td class="c">${chip(g.value)}</td><td>${g.kind}</td><td>${g.teacher_name || '–'}</td><td>${g.comment || ''}</td></tr>`)}</tbody></table></div>` : empty('No grades match these filters.')).s;
  };
  el.innerHTML = html`
    ${pageHead('My grades', `Class ${state.user.class_name || ''} · School year ${state.meta.school_year}`)}
    <div class="grid cols-4">
      ${statCard({ label: 'Average grade', value: sum.overall?.mean, ic: 'star', hint: `${sum.overall?.count || 0} grades` })}
      ${statCard({ label: 'Average of year marks', value: sum.gpa?.mean, ic: 'award', tone: 'green', hint: 'All subjects' })}
      ${statCard({ label: 'Best subject', value: Math.max(0, ...sum.subjects.map((s) => s.year?.mean || 0)) || null, ic: 'chart', tone: 'sky', hint: (sum.subjects.slice().sort((a, b) => (b.year?.mean || 0) - (a.year?.mean || 0))[0] || {}).name })}
      ${statCard({ label: 'Attendance', value: sum.attendance.rate, suffix: '%', ic: 'check', tone: 'indigo', dec: 1 })}
    </div>
    <div class="card"><div class="card-head"><h3>Marks by subject</h3></div>${summaryTable(sum)}</div>
    <div class="card"><div class="card-head"><h3>All grades</h3>
      <div class="filters"><select id="gf-subject" aria-label="Subject"><option value="">All subjects</option>${options(sum.subjects.map((s) => ({ id: s.subject_id, name: s.name })), f.subject)}</select>
      <select id="gf-quarter" aria-label="Quarter"><option value="">Whole year</option>${[1, 2, 3, 4].map((q) => html`<option value="${q}" ${String(q) === f.quarter ? raw('selected') : ''}>Quarter ${q}</option>`)}</select></div></div>
      <div id="grade-list"></div></div>`.s;
  draw();
  $('#gf-subject').onchange = (e) => { f.subject = e.target.value; draw(); };
  $('#gf-quarter').onchange = (e) => { f.quarter = e.target.value; draw(); };
}

/** Distinct classes (and per-class subjects) a staff member can work with. */
function staffClasses() {
  const seen = new Map();
  state.meta.assignments.forEach((a) => seen.set(a.class_id, { id: a.class_id, name: a.class_name }));
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}
const subjectsOfClass = (classId) => state.meta.assignments.filter((a) => String(a.class_id) === String(classId)).map((a) => ({ id: a.subject_id, name: a.subject_name }));

async function gradebook(el) {
  const classes = staffClasses();
  if (!classes.length) {
    el.innerHTML = html`${pageHead('Grade book')}<div class="card">${empty('No classes assigned yet.', role() === 'admin' ? 'Create teaching assignments in School setup.' : 'Ask the administrator to assign your classes.')}</div>`.s;
    return;
  }
  const g = ui.gb;
  if (!classes.some((c) => String(c.id) === String(g.class_id))) g.class_id = classes[0].id;
  let subs = subjectsOfClass(g.class_id);
  if (!subs.some((s) => String(s.id) === String(g.subject_id))) g.subject_id = subs[0]?.id;
  if (g.quarter === undefined) g.quarter = state.meta.quarter;

  const data = await api(`/api/gradebook?class_id=${g.class_id}&subject_id=${g.subject_id}&quarter=${g.quarter}`);
  g.map = {};
  if (data.mode === 'quarter') data.students.forEach((s) => s.grades.forEach((x) => { g.map[x.id] = { ...x, student_id: s.id, student_name: s.full_name }; }));
  g.students = Object.fromEntries(data.students.map((s) => [s.id, s]));

  const table = data.mode === 'quarter'
    ? html`<table class="table gb"><thead><tr><th>Student</th><th>Grades in quarter ${g.quarter}</th><th class="c">Count</th><th class="c">Average</th><th class="c">Mark</th></tr></thead>
      <tbody>${data.students.map((s) => html`<tr><td><button class="link strong" type="button" data-act="open-student" data-id="${s.id}">${s.full_name}</button></td>
        <td><div class="grade-chips">${s.grades.map((x) => html`<button type="button" class="gc ${gcls(x.value)}" data-act="edit-grade" data-id="${x.id}" title="${fmtDate(x.date)} · ${x.kind}${x.comment ? ` · ${x.comment}` : ''}" aria-label="Grade ${x.value}, ${fmtDate(x.date)}">${x.value}</button>`)}
          <button type="button" class="gc add" data-act="add-grade" data-id="${s.id}" aria-label="Add grade for ${s.full_name}" title="Add grade">${icon('plus')}</button></div></td>
        <td class="c">${s.count}</td><td class="c">${fmt(s.mean)}</td><td class="c">${s.mark ? chip(s.mark) : '–'}</td></tr>`)}</tbody></table>`
    : html`<table class="table"><thead><tr><th>Student</th><th class="c">Quarter 1</th><th class="c">Quarter 2</th><th class="c">Quarter 3</th><th class="c">Quarter 4</th><th class="c">Year</th></tr></thead>
      <tbody>${data.students.map((s) => html`<tr><td><button class="link strong" type="button" data-act="open-student" data-id="${s.id}">${s.full_name}</button></td>
        ${[1, 2, 3, 4].map((q) => html`<td class="c">${markCell(s.quarters[q])}</td>`)}<td class="c">${markCell(s.year)}</td></tr>`)}</tbody></table>`;

  el.innerHTML = html`
    ${pageHead('Grade book', 'Click + to add a grade, or a grade to edit or delete it.')}
    <div class="card toolbar">
      <div class="field inline"><label for="gb-class">Class</label><select id="gb-class">${options(classes, g.class_id)}</select></div>
      <div class="field inline"><label for="gb-subject">Subject</label><select id="gb-subject">${options(subs, g.subject_id)}</select></div>
      <div class="field inline"><label for="gb-quarter">Period</label><select id="gb-quarter">${[1, 2, 3, 4].map((q) => html`<option value="${q}" ${Number(g.quarter) === q ? raw('selected') : ''}>Quarter ${q}</option>`)}<option value="0" ${Number(g.quarter) === 0 ? raw('selected') : ''}>Whole year</option></select></div>
    </div>
    ${statRow(data.summary)}
    <div class="card"><div class="table-wrap">${data.students.length ? table : empty('No students in this class.')}</div></div>
    <p class="muted small note">Statistics are calculated automatically by the JavaScript engine every time you save.</p>`.s;

  $('#gb-class').onchange = (e) => { g.class_id = e.target.value; g.subject_id = undefined; render(); };
  $('#gb-subject').onchange = (e) => { g.subject_id = e.target.value; render(); };
  $('#gb-quarter').onchange = (e) => { g.quarter = Number(e.target.value); render(); };
}

VIEWS.grades = (el) => (isStaff() ? gradebook(el) : gradesStudent(el));

function gradeFields() {
  return [
    { name: 'value', label: 'Grade', type: 'grade', required: true, full: true },
    { name: 'kind', label: 'Type', type: 'select', options: state.meta.grade_kinds.map((k) => ({ value: k, label: k })) },
    { name: 'date', label: 'Date', type: 'date', required: true, min: state.meta.school_year_start, max: state.meta.today, hint: 'The quarter is set from the date.' },
    { name: 'comment', label: 'Comment (optional)', maxlength: 200, full: true },
  ];
}

/* ---------------------------------------------------------------------
   VIEW: Statistics
   --------------------------------------------------------------------- */
async function statsStudent(el) {
  const sum = await api('/api/grades/summary');
  const o = sum.overall, att = sum.attendance;
  el.innerHTML = html`
    ${pageHead('My statistics', 'Calculated automatically from your grades and attendance.')}
    <div class="grid cols-4">
      ${statCard({ label: 'Average grade', value: o?.mean, ic: 'star', hint: `${o?.count || 0} grades` })}
      ${statCard({ label: 'Median', value: o?.median, ic: 'chart', tone: 'sky', dec: 1 })}
      ${statCard({ label: 'Quality rate', value: o?.quality_rate, suffix: '%', ic: 'award', tone: 'green', dec: 1 })}
      ${statCard({ label: 'Success rate', value: o?.pass_rate, suffix: '%', ic: 'tick', tone: 'indigo', dec: 1 })}
    </div>
    <div class="grid cols-2">
      <div class="card"><div class="card-head"><h3>Progress by quarter</h3><span class="muted">Average grade</span></div>${lineChart([1, 2, 3, 4].map((q) => ({ label: `Q${q}`, value: sum.quarters[q]?.mean ?? null })))}</div>
      <div class="card"><div class="card-head"><h3>Average by subject</h3></div>${barChart(sum.subjects.map((s) => ({ label: s.name, value: s.year?.mean ?? null })))}</div>
    </div>
    <div class="grid cols-2">
      <div class="card"><div class="card-head"><h3>My grade distribution</h3></div>${distChart(o?.dist)}</div>
      <div class="card"><div class="card-head"><h3>Attendance</h3><span class="muted">${att.total} school days</span></div>${att.total ? donut(STATUSES.map((k) => ({ label: cap(k), value: att[k], cls: `st-${k}` })), pct(att.rate), 'attended') : empty('No attendance yet.')}</div>
    </div>
    <div class="card"><div class="card-head"><h3>Subject details</h3></div>${summaryTable(sum)}</div>
    <p class="muted small note">Engine: JavaScript.</p>`.s;
}

async function statsStaff(el) {
  const classes = staffClasses();
  const s = ui.stats;
  const isAdmin = role() === 'admin';
  if (s.class_id === undefined) s.class_id = isAdmin ? '0' : String(classes[0]?.id || '');
  if (!isAdmin && !classes.length) {
    el.innerHTML = html`${pageHead('Statistics')}<div class="card">${empty('No classes assigned yet.')}</div>`.s;
    return;
  }
  s.quarter = s.quarter || '0';
  const whole = isAdmin && s.class_id === '0';
  if (!whole && !classes.some((c) => String(c.id) === String(s.class_id))) s.class_id = String(classes[0].id);
  if (!whole && s.subject_id && !subjectsOfClass(s.class_id).some((x) => String(x.id) === String(s.subject_id))) s.subject_id = '';
  const url = whole ? `/api/statistics/school?quarter=${s.quarter}`
    : `/api/statistics/class?class_id=${s.class_id}&quarter=${s.quarter}${s.subject_id ? `&subject_id=${s.subject_id}` : ''}`;
  const d = await api(url);
  const att = d.attendance;

  const filters = html`<div class="card toolbar">
    <div class="field inline"><label for="st-class">Scope</label><select id="st-class">${isAdmin ? html`<option value="0" ${whole ? raw('selected') : ''}>Whole school</option>` : ''}${options(isAdmin ? classes : classes, s.class_id, (x) => x.id, (x) => `Class ${x.name}`)}</select></div>
    ${whole ? '' : html`<div class="field inline"><label for="st-subject">Subject</label><select id="st-subject"><option value="">${role() === 'teacher' ? 'All my subjects' : 'All subjects'}</option>${options(subjectsOfClass(s.class_id), s.subject_id || '')}</select></div>`}
    <div class="field inline"><label for="st-quarter">Period</label><select id="st-quarter"><option value="0">Whole year</option>${[1, 2, 3, 4].map((q) => html`<option value="${q}" ${String(q) === s.quarter ? raw('selected') : ''}>Quarter ${q}</option>`)}</select></div></div>`;

  const ranking = whole
    ? html`<div class="card"><div class="card-head"><h3>Classes compared</h3></div><div class="table-wrap"><table class="table"><thead><tr><th>Class</th><th class="c">Students</th><th class="c">Average</th><th class="c">Quality</th><th class="c">Success</th><th class="c">Attendance</th></tr></thead>
        <tbody>${d.classes.map((c) => html`<tr><td><b>Class ${c.name}</b></td><td class="c">${c.students}</td><td class="c">${c.mean ? html`<span class="gc-lg ${gcls(c.mean)}">${fmt(c.mean)}</span>` : '–'}</td><td class="c">${pct(c.quality_rate)}</td><td class="c">${pct(c.pass_rate)}</td><td class="c">${pct(c.attendance_rate)}</td></tr>`)}</tbody></table></div></div>`
    : html`<div class="card"><div class="card-head"><h3>Student ranking</h3><span class="muted">By average grade</span></div>
        ${d.ranking.length ? html`<div class="table-wrap"><table class="table"><thead><tr><th class="c">#</th><th>Student</th><th class="c">Grades</th><th class="c">Average</th></tr></thead>
        <tbody>${d.ranking.map((r, i) => html`<tr><td class="c">${i + 1}</td><td><button class="link strong" type="button" data-act="open-student" data-id="${r.id}">${r.name}</button></td><td class="c">${r.count}</td><td class="c"><span class="gc-lg ${gcls(r.mean)}">${fmt(r.mean)}</span></td></tr>`)}</tbody></table></div>` : empty('No grades for this selection.')}</div>`;

  el.innerHTML = html`
    ${pageHead('Statistics', whole ? 'School-wide results' : `Class ${(classes.find((c) => String(c.id) === s.class_id) || {}).name || ''}`)}
    ${filters}
    ${statRow(d.summary, statCard({ label: 'Attendance', value: att.rate, suffix: '%', ic: 'check', tone: 'sky', dec: 1, hint: `${att.total} marks` }))}
    <div class="grid cols-2">
      <div class="card"><div class="card-head"><h3>Average by subject</h3></div>${barChart(d.subjects.map((x) => ({ label: x.name, value: x.mean })))}</div>
      <div class="card"><div class="card-head"><h3>Grade distribution</h3></div>${distChart(d.summary?.dist)}</div>
    </div>
    <div class="grid cols-2">
      <div class="card"><div class="card-head"><h3>Trend by quarter</h3></div>${lineChart([1, 2, 3, 4].map((q) => ({ label: `Q${q}`, value: (d.quarters.find((x) => x.quarter === q) || {}).mean ?? null })))}</div>
      <div class="card"><div class="card-head"><h3>Attendance</h3></div>${att.total ? donut(STATUSES.map((k) => ({ label: cap(k), value: att[k], cls: `st-${k}` })), pct(att.rate), 'attended') : empty('No attendance marked yet.')}</div>
    </div>
    ${ranking}
    <p class="muted small note">Spread (std. deviation): ${fmt(d.summary?.stddev)} · Engine: JavaScript.</p>`.s;

  $('#st-class').onchange = (e) => { s.class_id = e.target.value; s.subject_id = ''; render(); };
  $('#st-subject') && ($('#st-subject').onchange = (e) => { s.subject_id = e.target.value; render(); });
  $('#st-quarter').onchange = (e) => { s.quarter = e.target.value; render(); };
}

VIEWS.statistics = (el) => (isStaff() ? statsStaff(el) : statsStudent(el));

/* ---------------------------------------------------------------------
   VIEW: Attendance
   --------------------------------------------------------------------- */
function shiftMonth(m, delta) {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo - 1 + delta, 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function calendarHtml(month, records) {
  const [y, m] = month.split('-').map(Number);
  const startPad = (new Date(y, m - 1, 1).getDay() + 6) % 7, days = new Date(y, m, 0).getDate();
  const byDate = Object.fromEntries(records.map((r) => [r.date, r]));
  const cells = [];
  for (let i = 0; i < startPad; i++) cells.push(html`<div class="cal-day blank"></div>`);
  for (let d = 1; d <= days; d++) {
    const iso = `${y}-${pad2(m)}-${pad2(d)}`, dow = (startPad + d - 1) % 7, rec = byDate[iso];
    cells.push(html`<div class="cal-day ${dow >= 5 ? 'weekend' : ''} ${rec ? `st-${rec.status}` : ''} ${iso === state.meta.today ? 'today' : ''}" title="${rec ? `${cap(rec.status)}${rec.note ? ` - ${rec.note}` : ''}` : dow >= 5 ? 'Weekend' : 'Not marked'}"><span>${d}</span></div>`);
  }
  return html`<div class="cal"><div class="cal-head">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((x) => html`<span>${x}</span>`)}</div><div class="cal-grid">${cells}</div></div>`;
}

async function attendanceStudent(el) {
  const a = ui.att;
  a.month = a.month || state.meta.today.slice(0, 7);
  const d = await api(`/api/attendance/student?month=${a.month}`);
  const sum = d.summary, startMonth = state.meta.school_year_start.slice(0, 7), nowMonth = state.meta.today.slice(0, 7);
  const [y, m] = a.month.split('-').map(Number);
  el.innerHTML = html`
    ${pageHead('My attendance', `School year ${state.meta.school_year}`)}
    <div class="grid cols-4">
      ${statCard({ label: 'Attendance rate', value: sum.rate, suffix: '%', ic: 'check', tone: 'green', dec: 1, hint: `${sum.total} school days` })}
      ${statCard({ label: 'Absent', value: sum.absent, ic: 'x', tone: 'red', dec: 0 })}
      ${statCard({ label: 'Late', value: sum.late, ic: 'clock', tone: 'amber', dec: 0 })}
      ${statCard({ label: 'Excused', value: sum.excused, ic: 'tick', tone: 'sky', dec: 0 })}
    </div>
    <div class="grid cols-2">
      <div class="card"><div class="card-head"><h3>${MONTHS_LONG[m - 1]} ${y}</h3>
        <div class="row-actions">${iconBtn('left', 'att-prev', 'Previous month', {}, a.month <= startMonth ? 'disabled' : '')}${iconBtn('right', 'att-next', 'Next month', {}, a.month >= nowMonth ? 'disabled' : '')}</div></div>
        ${calendarHtml(d.month, d.records)}
        <ul class="legend inline">${STATUSES.map((k) => html`<li><i class="dot st-${k}"></i>${cap(k)}</li>`)}</ul></div>
      <div class="card"><div class="card-head"><h3>Whole year</h3></div>${sum.total ? donut(STATUSES.map((k) => ({ label: cap(k), value: sum[k], cls: `st-${k}` })), pct(sum.rate), 'attended') : empty('No attendance yet.')}
        <p class="muted small note">Attendance rate = days present or late, divided by all marked days.</p></div>
    </div>
    <div class="card"><div class="card-head"><h3>Month by month</h3></div>
      ${d.by_month.length ? html`<div class="table-wrap"><table class="table"><thead><tr><th>Month</th><th class="c">Present</th><th class="c">Late</th><th class="c">Excused</th><th class="c">Absent</th><th class="c">Rate</th></tr></thead>
      <tbody>${d.by_month.map((r) => html`<tr><td>${MONTHS_LONG[Number(r.month.slice(5)) - 1]} ${r.month.slice(0, 4)}</td><td class="c">${r.present}</td><td class="c">${r.late}</td><td class="c">${r.excused}</td><td class="c">${r.absent}</td><td class="c"><b>${pct(r.rate)}</b></td></tr>`)}</tbody></table></div>` : empty('No attendance yet.')}</div>`.s;
}

function attendanceCounts() {
  const counts = { present: 0, late: 0, excused: 0, absent: 0 };
  $$('#roster .roster-row').forEach((row) => { const v = $('input:checked', row)?.value; if (v) counts[v]++; });
  $('#att-counts').innerHTML = STATUSES.map((k) => html`<span class="badge st-${k}">${cap(k)}: ${counts[k]}</span>`).map((r) => r.s).join('');
}

async function attendanceStaff(el) {
  const classes = staffClasses();
  if (!classes.length) { el.innerHTML = html`${pageHead('Attendance')}<div class="card">${empty('No classes assigned yet.')}</div>`.s; return; }
  const a = ui.att;
  if (!classes.some((c) => String(c.id) === String(a.class_id))) a.class_id = classes[0].id;
  a.date = a.date || state.meta.today;
  const d = await api(`/api/attendance/class?class_id=${a.class_id}&date=${a.date}`);
  const closed = !d.is_school_day;
  el.innerHTML = html`
    ${pageHead('Attendance', 'Mark who is at school. Saving again on the same day updates the record.')}
    <div class="card toolbar">
      <div class="field inline"><label for="at-class">Class</label><select id="at-class">${options(classes, a.class_id, (x) => x.id, (x) => `Class ${x.name}`)}</select></div>
      <div class="field inline"><label for="at-date">Date</label><input id="at-date" type="date" value="${a.date}" max="${state.meta.today}" min="${state.meta.school_year_start}"></div>
      <span class="spacer"></span>
      ${closed ? '' : btn('Mark all present', 'att-all-present', 'tick', 'ghost')}
      ${closed ? '' : btn('Save attendance', 'att-save', 'check', 'primary')}
    </div>
    ${closed ? html`<div class="card">${empty('School is closed on weekends.', 'Choose a weekday.')}</div>` : html`
      <div class="card">
        <div class="card-head"><h3>${d.students.length} students</h3><div id="att-counts" class="badges"></div></div>
        ${d.marked ? '' : html`<div class="alert info">Attendance for this day has not been saved yet. Everyone is shown as present until you change it.</div>`}
        <div id="roster" class="roster">${d.students.map((s) => html`<div class="roster-row" data-sid="${s.id}"><span class="name">${s.full_name}</span>
          <div class="seg" role="radiogroup" aria-label="Status for ${s.full_name}">${STATUSES.map((st) => html`<label class="seg-opt st-${st}"><input type="radio" name="st_${s.id}" value="${st}" ${(s.status || 'present') === st ? raw('checked') : ''}><span>${cap(st)}</span></label>`)}</div>
          <input class="note" name="note_${s.id}" maxlength="200" placeholder="Note (optional)" value="${s.note || ''}" aria-label="Note for ${s.full_name}"></div>`)}</div>
      </div>`}`.s;
  $('#at-class').onchange = (e) => { a.class_id = e.target.value; render(); };
  $('#at-date').onchange = (e) => { if (e.target.value) { a.date = e.target.value; render(); } };
  if (!closed) { attendanceCounts(); $('#roster').addEventListener('change', attendanceCounts); }
}

VIEWS.attendance = (el) => (isStaff() ? attendanceStaff(el) : attendanceStudent(el));

/* ---------------------------------------------------------------------
   VIEW: Timetable
   --------------------------------------------------------------------- */
function timetableGrid(entries, { editable = false, mode = 'class' } = {}) {
  const maxLesson = editable ? state.meta.max_lessons : Math.max(5, ...entries.map((e) => e.lesson_no));
  const byKey = Object.fromEntries(entries.map((e) => [`${e.weekday}-${e.lesson_no}`, e]));
  const todayWd = new Date(`${state.meta.today}T00:00:00`).getDay(); // 1..5 Mon..Fri
  const rows = [];
  for (let l = 1; l <= maxLesson; l++) {
    const cells = [1, 2, 3, 4, 5].map((day) => {
      const e = byKey[`${day}-${l}`];
      const inner = e ? html`<b>${e.subject_name}</b><small>${mode === 'teacher' ? `Class ${e.class_name}` : e.teacher_name || ''}${e.room ? ` · ${e.room}` : ''}</small>` : html`<span class="tt-empty">${editable ? icon('plus') : '–'}</span>`;
      const cls = `tt-cell ${e ? 'filled' : 'free'} ${day === todayWd ? 'today' : ''}`;
      return editable
        ? html`<td><button type="button" class="${cls}" data-act="tt-edit" data-day="${day}" data-lesson="${l}" aria-label="${DAYS[day - 1]} lesson ${l}">${inner}</button></td>`
        : html`<td><div class="${cls}">${inner}</div></td>`;
    });
    rows.push(html`<tr><th scope="row" class="tt-time"><b>${l}</b><small>${state.meta.lesson_times[l] || ''}</small></th>${cells}</tr>`);
  }
  return html`<div class="table-wrap"><table class="tt"><thead><tr><th></th>${DAYS.map((d, i) => html`<th class="${i + 1 === todayWd ? 'today' : ''}">${d}</th>`)}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

VIEWS.timetable = async (el) => {
  const t = ui.tt;
  let data, controls = '', editable = false, sub = '';
  if (role() === 'student') {
    data = await api('/api/timetable');
    sub = 'Your weekly lessons. Today is highlighted.';
  } else {
    const classes = state.meta.classes;
    const isTeacher = role() === 'teacher';
    if (!t.sel) t.sel = isTeacher ? 'mine' : String(classes[0]?.id || '');
    if (!isTeacher && t.sel === 'mine') t.sel = String(classes[0]?.id || '');
    data = t.sel === 'mine' ? await api('/api/timetable?mine=1') : await api(`/api/timetable?class_id=${t.sel}`);
    editable = role() === 'admin';
    ui.tt.data = data;
    controls = html`<div class="card toolbar"><div class="field inline"><label for="tt-sel">Show</label><select id="tt-sel">${isTeacher ? html`<option value="mine" ${t.sel === 'mine' ? raw('selected') : ''}>My schedule</option>` : ''}${options(classes, t.sel, (x) => x.id, (x) => `Class ${x.name}`)}</select></div>
      ${editable ? html`<span class="muted small">Click a cell to set or clear a lesson. Teachers are taken from the teaching assignments.</span>` : ''}</div>`;
    sub = editable ? 'Edit the weekly timetable.' : 'Weekly lesson grid.';
  }
  el.innerHTML = html`${pageHead('Weekly timetable', sub)}${controls}<div class="card">${data.entries.length || editable ? timetableGrid(data.entries, { editable, mode: data.mode }) : empty('No lessons scheduled.')}</div>`.s;
  $('#tt-sel') && ($('#tt-sel').onchange = (e) => { t.sel = e.target.value; render(); });
};

/* ---------------------------------------------------------------------
   VIEW: Homework
   --------------------------------------------------------------------- */
function hwStudentCard(h) {
  const di = dueInfo(h.due_date), overdue = !h.done && daysUntil(h.due_date) < 0;
  return html`<article class="card hw ${h.done ? 'done' : ''} ${overdue ? 'overdue' : ''}">
    <div class="hw-main"><div class="hw-tags"><span class="badge b-blue">${h.subject_name}</span>${h.done ? html`<span class="badge b-green">${icon('tick')} Done</span>` : html`<span class="badge ${di.tone}">${di.text}</span>`}</div>
      <h3>${h.title}</h3>${h.description ? html`<p class="pre">${h.description}</p>` : ''}
      <small class="muted">${h.teacher_name || 'Teacher'} · Due ${fmtDate(h.due_date)}</small></div>
    <div class="hw-side">${btn(h.done ? 'Mark as not done' : 'Mark as done', 'hw-toggle', h.done ? 'x' : 'tick', h.done ? 'ghost' : 'primary', { id: h.id, done: h.done ? 0 : 1 })}</div></article>`;
}

function hwStaffCard(h) {
  const di = dueInfo(h.due_date), total = h.total_students || 0, done = h.done_count || 0, p = total ? Math.round((100 * done) / total) : 0;
  return html`<article class="card hw">
    <div class="hw-main"><div class="hw-tags"><span class="badge b-blue">${h.subject_name}</span><span class="badge b-gray">Class ${h.class_name}</span><span class="badge ${di.tone}">${di.text}</span></div>
      <h3>${h.title}</h3>${h.description ? html`<p class="pre">${h.description}</p>` : ''}
      <small class="muted">${h.teacher_name || 'Teacher'} · Due ${fmtDate(h.due_date)}</small>
      <div class="progress" title="${done} of ${total} students done"><div class="progress-bar" style="--w:${p}%"></div></div>
      <small class="muted">${done} of ${total} students done (${p}%)</small></div>
    <div class="hw-side row-actions">${btn('Progress', 'hw-progress', 'eye', 'ghost sm', { id: h.id })}${iconBtn('edit', 'hw-edit', 'Edit homework', { id: h.id })}${iconBtn('trash', 'hw-delete', 'Delete homework', { id: h.id }, 'danger')}</div></article>`;
}

VIEWS.homework = async (el) => {
  const f = ui.hw;
  const classQuery = isStaff() && f.class_id ? `?class_id=${f.class_id}` : '';
  const data = await api(`/api/homework${classQuery}`);
  ui.hwItems = Object.fromEntries(data.homework.map((h) => [h.id, h]));
  let items = data.homework, tabs = '', filter = '';
  if (!isStaff()) {
    const counts = { pending: items.filter((h) => !h.done).length, done: items.filter((h) => h.done).length, all: items.length };
    items = items.filter((h) => f.filter === 'all' || (f.filter === 'done' ? h.done : !h.done));
    if (f.filter !== 'done') items = items.slice().sort((a, b) => a.due_date.localeCompare(b.due_date));
    tabs = html`<div class="tabs" role="tablist">${[['pending', 'To do'], ['done', 'Done'], ['all', 'All']].map(([k, label]) => html`<button type="button" role="tab" class="tab ${f.filter === k ? 'active' : ''}" data-act="hw-filter" data-id="${k}">${label} <span class="count-pill">${counts[k]}</span></button>`)}</div>`;
  } else {
    filter = html`<div class="card toolbar"><div class="field inline"><label for="hw-class">Class</label><select id="hw-class"><option value="">All classes</option>${options(staffClasses(), f.class_id, (x) => x.id, (x) => `Class ${x.name}`)}</select></div></div>`;
  }
  const canCreate = isStaff() && state.meta.assignments.length > 0;
  el.innerHTML = html`${pageHead('Homework', isStaff() ? 'Create tasks and follow who has finished them.' : 'Tick off tasks when you finish them.', canCreate ? btn('New homework', 'hw-new', 'plus') : '')}
    ${tabs}${filter}
    <div class="stack">${items.length ? items.map((h) => (isStaff() ? hwStaffCard(h) : hwStudentCard(h))) : html`<div class="card">${empty(isStaff() ? 'No homework yet.' : f.filter === 'pending' ? 'Nothing to do. Enjoy!' : 'No homework here.')}</div>`}</div>`.s;
  $('#hw-class') && ($('#hw-class').onchange = (e) => { f.class_id = e.target.value; render(); });
};

function homeworkForm(existing) {
  const asg = state.meta.assignments;
  const classes = staffClasses();
  const classId = existing?.class_id ?? classes[0]?.id;
  formModal({
    title: existing ? 'Edit homework' : 'New homework',
    values: existing || { class_id: classId, due_date: state.meta.today },
    submitText: existing ? 'Save changes' : 'Create homework',
    fields: [
      { name: 'class_id', label: 'Class', type: 'select', required: true, options: classes.map((c) => ({ value: c.id, label: `Class ${c.name}` })) },
      { name: 'subject_id', label: 'Subject', type: 'select', required: true, options: subjectsOfClass(classId).map((s) => ({ value: s.id, label: s.name })) },
      { name: 'title', label: 'Title', required: true, minlength: 3, maxlength: 120, full: true },
      { name: 'description', label: 'Description', type: 'textarea', maxlength: 1500, full: true },
      { name: 'due_date', label: 'Due date', type: 'date', required: true },
    ],
    onOpen: (form) => {
      form.elements.class_id.onchange = () => {
        form.elements.subject_id.innerHTML = subjectsOfClass(form.elements.class_id.value).map((s) => html`<option value="${s.id}">${s.name}</option>`).map((r) => r.s).join('');
      };
      if (existing) form.elements.subject_id.value = existing.subject_id;
    },
    onSubmit: async (v) => {
      await api(existing ? `/api/homework/${existing.id}` : '/api/homework', { method: existing ? 'PUT' : 'POST', body: v });
      toast(existing ? 'Homework updated.' : 'Homework created.', 'success');
      refresh();
    },
  });
  void asg;
}

/* ---------------------------------------------------------------------
   VIEW: Announcements
   --------------------------------------------------------------------- */
VIEWS.announcements = async (el) => {
  const d = await api('/api/announcements');
  ui.annItems = Object.fromEntries(d.announcements.map((a) => [a.id, a]));
  el.innerHTML = html`${pageHead('School news', 'Announcements from the school.', isStaff() ? btn('New announcement', 'ann-new', 'plus') : '')}
    ${d.announcements.length ? html`<div class="stack">${d.announcements.map((a) => html`<div class="card">${annCard(a)}</div>`)}</div>` : html`<div class="card">${empty('No announcements yet.')}</div>`}`.s;
};

function announcementForm(existing) {
  const admin = role() === 'admin';
  formModal({
    title: existing ? 'Edit announcement' : 'New announcement',
    values: existing || { audience: 'all' },
    submitText: existing ? 'Save changes' : 'Publish',
    fields: [
      { name: 'title', label: 'Title', required: true, minlength: 3, maxlength: 120, full: true },
      { name: 'body', label: 'Message', type: 'textarea', required: true, minlength: 3, maxlength: 3000, rows: 6, full: true },
      { name: 'audience', label: 'Audience', type: 'select', options: [{ value: 'all', label: 'Everyone' }, { value: 'students', label: 'Students only' }, ...(admin ? [{ value: 'teachers', label: 'Teachers only' }] : [])] },
      ...(admin ? [{ name: 'pinned', label: 'Pin to the top', type: 'checkbox' }] : []),
    ],
    onSubmit: async (v) => {
      await api(existing ? `/api/announcements/${existing.id}` : '/api/announcements', { method: existing ? 'PUT' : 'POST', body: v });
      toast(existing ? 'Announcement updated.' : 'Announcement published.', 'success');
      refresh();
    },
  });
}

/* ---------------------------------------------------------------------
   VIEW: Users (admin)
   --------------------------------------------------------------------- */
async function loadUsers() {
  const u = ui.users;
  const qs = new URLSearchParams();
  if (u.q) qs.set('q', u.q);
  if (u.role) qs.set('role', u.role);
  if (u.class_id) qs.set('class_id', u.class_id);
  const d = await api(`/api/users?${qs}`);
  ui.userItems = Object.fromEntries(d.users.map((x) => [x.id, x]));
  const me = state.user.id;
  $('#users-table').innerHTML = (d.users.length ? html`<div class="table-wrap"><table class="table"><thead><tr><th>Name</th><th>Role</th><th>Class</th><th>Contact</th><th>Status</th><th class="r">Actions</th></tr></thead>
    <tbody>${d.users.map((x) => html`<tr class="${x.active ? '' : 'inactive'}"><td><div class="who"><span class="avatar sm">${initials(x.full_name)}</span><div><b>${x.full_name}</b><small>@${x.username}</small></div></div></td>
      <td><span class="badge ${x.role === 'admin' ? 'b-indigo' : x.role === 'teacher' ? 'b-blue' : 'b-gray'}">${cap(x.role)}</span></td><td>${x.class_name || '–'}</td>
      <td><small>${x.email || '–'}</small></td><td><span class="badge ${x.active ? 'b-green' : 'b-red'}">${x.active ? 'Active' : 'Disabled'}</span></td>
      <td class="r"><div class="row-actions">${x.role === 'student' ? iconBtn('eye', 'user-view', 'View profile', { id: x.id }) : ''}${iconBtn('edit', 'user-edit', 'Edit user', { id: x.id })}${iconBtn('key', 'user-pw', 'Reset password', { id: x.id })}
        ${x.id === me ? '' : iconBtn(x.active ? 'pause' : 'power', 'user-toggle', x.active ? 'Disable account' : 'Enable account', { id: x.id })}${x.id === me ? '' : iconBtn('trash', 'user-delete', 'Delete user', { id: x.id }, 'danger')}</div></td></tr>`)}</tbody></table></div>` : empty('No users match your search.')).s;
  $('#users-count').textContent = `${d.users.length} user${d.users.length === 1 ? '' : 's'}`;
}

VIEWS.users = async (el) => {
  const u = ui.users;
  el.innerHTML = html`${pageHead('User management', 'Create accounts, assign classes and reset passwords.', btn('Add user', 'user-new', 'plus'))}
    <div class="card toolbar">
      <div class="field inline grow"><label for="u-q">Search</label><input id="u-q" type="search" placeholder="Name or username" value="${u.q}"></div>
      <div class="field inline"><label for="u-role">Role</label><select id="u-role"><option value="">All roles</option>${['student', 'teacher', 'admin'].map((r) => html`<option value="${r}" ${u.role === r ? raw('selected') : ''}>${cap(r)}s</option>`)}</select></div>
      <div class="field inline"><label for="u-class">Class</label><select id="u-class"><option value="">All classes</option>${options(state.meta.classes, u.class_id)}</select></div>
      <span class="muted small" id="users-count"></span></div>
    <div class="card" id="users-table"></div>`.s;
  let timer;
  $('#u-q').oninput = (e) => { clearTimeout(timer); timer = setTimeout(() => { u.q = e.target.value.trim(); loadUsers().catch((x) => toast(x.message, 'error')); }, 250); };
  $('#u-role').onchange = (e) => { u.role = e.target.value; loadUsers(); };
  $('#u-class').onchange = (e) => { u.class_id = e.target.value; loadUsers(); };
  await loadUsers();
};

function userCreateForm() {
  const classOpts = state.meta.classes.map((c) => ({ value: c.id, label: `Class ${c.name}` }));
  formModal({
    title: 'Add user', submitText: 'Create account', values: { role: 'student' },
    fields: [
      { name: 'full_name', label: 'Full name', required: true, minlength: 2, maxlength: 80, full: true },
      { name: 'username', label: 'Username', required: true, minlength: 3, maxlength: 32, autocomplete: 'off', hint: 'Letters, numbers, dot, dash, underscore.' },
      { name: 'role', label: 'Role', type: 'select', required: true, options: [{ value: 'student', label: 'Student' }, { value: 'teacher', label: 'Teacher' }, { value: 'admin', label: 'Administrator' }] },
      { name: 'class_id', label: 'Class', type: 'select', options: classOpts, hint: 'Students only.' },
      { name: 'password', label: 'Temporary password', type: 'password', required: true, minlength: 8, autocomplete: 'new-password', hint: 'At least 8 characters.' },
      { name: 'email', label: 'Email (optional)', type: 'email', maxlength: 120 },
      { name: 'phone', label: 'Phone (optional)', maxlength: 30 },
    ],
    onOpen: (form) => {
      const sync = () => { const isStudent = form.elements.role.value === 'student'; $('[data-field="class_id"]', form).style.display = isStudent ? '' : 'none'; };
      form.elements.role.onchange = sync; sync();
    },
    onSubmit: async (v) => {
      if (v.role !== 'student') delete v.class_id;
      await api('/api/users', { method: 'POST', body: v });
      toast('Account created.', 'success');
      await loadUsers();
    },
  });
}

function userEditForm(x) {
  formModal({
    title: `Edit ${x.full_name}`, submitText: 'Save changes', values: x,
    fields: [
      { name: 'full_name', label: 'Full name', required: true, minlength: 2, maxlength: 80, full: true },
      { name: 'email', label: 'Email', type: 'email', maxlength: 120 },
      { name: 'phone', label: 'Phone', maxlength: 30 },
      { name: 'birth_date', label: 'Birth date', type: 'date' },
      ...(x.role === 'student' ? [{ name: 'class_id', label: 'Class', type: 'select', required: true, options: state.meta.classes.map((c) => ({ value: c.id, label: `Class ${c.name}` })) }] : []),
      { name: 'address', label: 'Address', maxlength: 200, full: true },
    ],
    onSubmit: async (v) => {
      await api(`/api/users/${x.id}`, { method: 'PUT', body: { ...v, active: !!x.active } });
      toast('User updated.', 'success');
      await loadUsers();
    },
  });
}

/* ---------------------------------------------------------------------
   VIEW: School setup (admin)
   --------------------------------------------------------------------- */
VIEWS.setup = async (el) => {
  const d = await api('/api/setup');
  ui.setup = d;
  el.innerHTML = html`${pageHead('School setup', 'Classes, subjects and who teaches what.')}
    <div class="grid cols-2">
      <div class="card"><div class="card-head"><h3>Classes</h3></div>
        <form class="inline-form" data-form="class-add"><input name="name" placeholder="e.g. 11-A" maxlength="20" required aria-label="New class name"><button class="btn primary" type="submit">${icon('plus')}Add class</button></form>
        <ul class="list">${d.classes.map((c) => html`<li class="row between"><div><b>Class ${c.name}</b><small>${c.students} students</small></div>${iconBtn('trash', 'class-del', `Delete class ${c.name}`, { id: c.id }, 'danger')}</li>`)}</ul></div>
      <div class="card"><div class="card-head"><h3>Subjects</h3></div>
        <form class="inline-form" data-form="subject-add"><input name="name" placeholder="e.g. Geography" maxlength="40" required aria-label="New subject name"><button class="btn primary" type="submit">${icon('plus')}Add subject</button></form>
        <ul class="list">${d.subjects.map((s) => html`<li class="row between"><b>${s.name}</b>${iconBtn('trash', 'subject-del', `Delete subject ${s.name}`, { id: s.id }, 'danger')}</li>`)}</ul></div>
    </div>
    <div class="card"><div class="card-head"><h3>Teaching assignments</h3><span class="muted">One teacher per subject in each class</span></div>
      <form class="assign-form" data-form="assign-add">
        <select name="class_id" required aria-label="Class"><option value="">Class...</option>${options(d.classes, '', (x) => x.id, (x) => `Class ${x.name}`)}</select>
        <select name="subject_id" required aria-label="Subject"><option value="">Subject...</option>${options(d.subjects, '')}</select>
        <select name="teacher_id" required aria-label="Teacher"><option value="">Teacher...</option>${options(d.teachers, '', (x) => x.id, (x) => x.full_name)}</select>
        <button class="btn primary" type="submit">${icon('plus')}Assign</button></form>
      ${d.assignments.length ? html`<div class="table-wrap"><table class="table"><thead><tr><th>Class</th><th>Subject</th><th>Teacher</th><th class="r"></th></tr></thead>
      <tbody>${d.assignments.map((a) => html`<tr><td>Class ${a.class_name}</td><td>${a.subject_name}</td><td>${a.teacher_name}</td><td class="r">${iconBtn('trash', 'assign-del', 'Remove assignment', { id: a.id }, 'danger')}</td></tr>`)}</tbody></table></div>` : empty('No assignments yet.')}</div>`.s;
};

/* ---------------------------------------------------------------------
   VIEW: My students (teacher)
   --------------------------------------------------------------------- */
VIEWS.students = async (el) => {
  const classes = staffClasses();
  if (!classes.length) { el.innerHTML = html`${pageHead('My students')}<div class="card">${empty('No classes assigned yet.')}</div>`.s; return; }
  const s = ui.stu;
  if (!classes.some((c) => String(c.id) === String(s.class_id))) s.class_id = classes[0].id;
  const d = await api(`/api/students?class_id=${s.class_id}`);
  el.innerHTML = html`${pageHead('My students', 'Open a profile to see all marks and contact details.')}
    <div class="card toolbar"><div class="field inline"><label for="s-class">Class</label><select id="s-class">${options(classes, s.class_id, (x) => x.id, (x) => `Class ${x.name}`)}</select></div></div>
    <div class="card">${d.students.length ? html`<div class="table-wrap"><table class="table"><thead><tr><th>Student</th><th class="c">My grades</th><th class="c">Average</th><th class="c">Attendance</th><th class="r"></th></tr></thead>
      <tbody>${d.students.map((x) => html`<tr><td><div class="who"><span class="avatar sm">${initials(x.full_name)}</span><div><b>${x.full_name}</b><small>@${x.username}</small></div></div></td>
        <td class="c">${x.grades_count}</td><td class="c">${x.mean ? html`<span class="gc-lg ${gcls(x.mean)}">${fmt(x.mean)}</span>` : '–'}</td><td class="c">${pct(x.attendance_rate)}</td>
        <td class="r">${btn('Profile', 'open-student', 'eye', 'ghost sm', { id: x.id })}</td></tr>`)}</tbody></table></div>` : empty('No students in this class.')}</div>`.s;
  $('#s-class').onchange = (e) => { s.class_id = e.target.value; render(); };
};

/* ---------------------------------------------------------------------
   VIEW: Profile (own) and student profile modal (for staff)
   --------------------------------------------------------------------- */
function infoGrid(p) {
  const rows = [['Username', `@${p.username}`], ['Role', cap(p.role)], ...(p.class_name ? [['Class', p.class_name]] : []), ['Email', p.email || '–'], ['Phone', p.phone || '–'],
    ['Birth date', p.birth_date ? fmtDate(p.birth_date) : '–'], ['Address', p.address || '–'], ['Member since', fmtDate(p.created_at)]];
  return html`<dl class="info-grid">${rows.map(([k, v]) => html`<div><dt>${k}</dt><dd>${v}</dd></div>`)}</dl>`;
}

VIEWS.profile = async (el) => {
  const { profile: p } = await api(`/api/profile/${state.user.id}`);
  ui.profile = p;
  const s = p.summary;
  el.innerHTML = html`${pageHead('My profile')}
    <div class="card profile-head"><span class="avatar xl">${initials(p.full_name)}</span>
      <div class="grow"><h2>${p.full_name}</h2><p class="muted">${cap(p.role)}${p.class_name ? ` · Class ${p.class_name}` : ''}</p></div>
      <div class="row-actions">${btn('Edit details', 'profile-edit', 'edit', 'ghost')}${btn('Change password', 'profile-pw', 'key', 'ghost')}</div></div>
    ${s ? html`<div class="grid cols-3">${statCard({ label: 'Average grade', value: s.average, ic: 'star' })}${statCard({ label: 'Average of year marks', value: s.gpa, ic: 'award', tone: 'green' })}${statCard({ label: 'Attendance', value: s.attendance_rate, suffix: '%', ic: 'check', tone: 'sky', dec: 1 })}</div>` : ''}
    <div class="card"><div class="card-head"><h3>Personal details</h3></div>${infoGrid(p)}</div>
    ${p.role === 'teacher' ? html`<div class="card"><div class="card-head"><h3>I teach</h3></div>${p.assignments.length ? html`<div class="tags">${p.assignments.map((a) => html`<span class="badge b-blue">${a.subject_name} · ${a.class_name}</span>`)}</div>` : empty('No classes assigned yet.')}</div>` : ''}`.s;
};

async function openStudentModal(id) {
  const [{ profile: p }, sum] = await Promise.all([api(`/api/profile/${id}`), api(`/api/grades/summary?student_id=${id}`)]);
  openModal({
    title: p.full_name, wide: true,
    body: html`<div class="profile-head compact"><span class="avatar lg">${initials(p.full_name)}</span><div><h3>${p.full_name}</h3><p class="muted">Student · Class ${p.class_name || '–'}</p></div></div>
      <div class="grid cols-3 mini">${statCard({ label: 'Average grade', value: p.summary?.average, ic: 'star' })}${statCard({ label: 'Year marks avg.', value: p.summary?.gpa, ic: 'award', tone: 'green' })}${statCard({ label: 'Attendance', value: p.summary?.attendance_rate, suffix: '%', ic: 'check', tone: 'sky', dec: 1 })}</div>
      <h4 class="sub-h">Contact</h4>${infoGrid(p)}
      <h4 class="sub-h">Marks by subject</h4>${summaryTable(sum)}`,
  });
  animateCounts($('#modal-root'));
}

/* ---------------------------------------------------------------------
   Action handlers (all buttons are wired through data-act)
   --------------------------------------------------------------------- */
const actions = {
  'toggle-menu': () => ($('#sidebar').classList.contains('open') ? closeMenu() : openMenu()),
  'close-menu': () => closeMenu(),
  'modal-close': () => closeModal(),
  'modal-backdrop': (_d, el, e) => { if (e.target === el) closeModal(); },
  reload: () => render(),
  logout: async () => { await api('/api/logout', { method: 'POST', body: {} }); location.href = 'login.html'; },

  'open-student': (d) => openStudentModal(d.id),

  'add-grade': (d) => {
    const g = ui.gb, student = g.students[d.id];
    formModal({
      title: `Add grade - ${student.full_name}`, submitText: 'Save grade',
      values: { kind: 'Classwork', date: defaultGradeDate(Number(g.quarter) || state.meta.quarter) }, fields: gradeFields(),
      onSubmit: async (v) => {
        if (!v.value) throw new Error('Choose a grade from 1 to 5.');
        await api('/api/grades', { method: 'POST', body: { ...v, student_id: Number(d.id), subject_id: Number(g.subject_id) } });
        const q = quarterOf(v.date);
        if (Number(g.quarter) !== 0) g.quarter = q;
        toast(`Grade ${v.value} saved (quarter ${q}).`, 'success');
        refresh();
      },
    });
  },
  'edit-grade': (d) => {
    const g = ui.gb, x = g.map[d.id];
    formModal({
      title: `Edit grade - ${x.student_name}`, submitText: 'Save changes', values: x, fields: gradeFields(),
      extraButtons: raw(`<button class="btn danger" type="button" data-act="delete-grade" data-id="${Number(d.id)}">Delete grade</button>`),
      onSubmit: async (v) => {
        await api(`/api/grades/${d.id}`, { method: 'PUT', body: v });
        const q = quarterOf(v.date);
        if (Number(g.quarter) !== 0) g.quarter = q;
        toast('Grade updated.', 'success');
        refresh();
      },
    });
  },
  'delete-grade': async (d) => {
    if (!(await confirmBox('This grade will be removed and the statistics recalculated.', { title: 'Delete this grade?' }))) return;
    await api(`/api/grades/${d.id}`, { method: 'DELETE' });
    closeModal();
    toast('Grade deleted.', 'success');
    refresh();
  },

  'att-prev': () => { const a = ui.att; if (a.month > state.meta.school_year_start.slice(0, 7)) { a.month = shiftMonth(a.month, -1); render(); } },
  'att-next': () => { const a = ui.att; if (a.month < state.meta.today.slice(0, 7)) { a.month = shiftMonth(a.month, 1); render(); } },
  'att-all-present': () => { $$('#roster input[value="present"]').forEach((i) => { i.checked = true; }); attendanceCounts(); toast('Everyone set to present. Press Save to keep it.'); },
  'att-save': async (_d, el) => {
    const records = $$('#roster .roster-row').map((row) => ({
      student_id: Number(row.dataset.sid), status: $('input:checked', row).value, note: $('.note', row).value.trim(),
    }));
    el.disabled = true;
    try {
      const r = await api('/api/attendance/class', { method: 'POST', body: { class_id: Number(ui.att.class_id), date: ui.att.date, records } });
      toast(`Attendance saved for ${r.saved} students.`, 'success');
      await refresh();
    } finally { el.disabled = false; }
  },

  'tt-edit': (d) => {
    const classId = Number(ui.tt.sel), entry = ui.tt.data.entries.find((e) => e.weekday === Number(d.day) && e.lesson_no === Number(d.lesson));
    const subs = subjectsOfClass(classId).length ? subjectsOfClass(classId) : state.meta.subjects;
    formModal({
      title: `${DAYS[d.day - 1]}, lesson ${d.lesson}`, submitText: 'Save lesson', values: entry || {},
      intro: `${state.meta.lesson_times[d.lesson] || ''}`,
      fields: [
        { name: 'subject_id', label: 'Subject', type: 'select', required: true, options: subs.map((s) => ({ value: s.id, label: s.name })) },
        { name: 'room', label: 'Room', maxlength: 20, placeholder: 'e.g. Room 101' },
      ],
      extraButtons: entry ? raw(`<button class="btn danger" type="button" data-act="tt-clear" data-id="${entry.id}">Clear lesson</button>`) : '',
      onSubmit: async (v) => {
        await api('/api/timetable', { method: 'POST', body: { class_id: classId, weekday: Number(d.day), lesson_no: Number(d.lesson), subject_id: Number(v.subject_id), room: v.room } });
        toast('Lesson saved.', 'success');
        refresh();
      },
    });
  },
  'tt-clear': async (d) => { await api(`/api/timetable/${d.id}`, { method: 'DELETE' }); closeModal(); toast('Lesson cleared.', 'success'); refresh(); },

  'hw-filter': (d) => { ui.hw.filter = d.id; render(); },
  'hw-toggle': async (d, el) => {
    el.disabled = true;
    await api(`/api/homework/${d.id}/done`, { method: 'POST', body: { done: d.done === '1' } });
    toast(d.done === '1' ? 'Marked as done.' : 'Marked as not done.', 'success');
    refresh();
  },
  'hw-new': () => homeworkForm(null),
  'hw-edit': (d) => homeworkForm(ui.hwItems[d.id]),
  'hw-delete': async (d) => {
    if (!(await confirmBox(`"${ui.hwItems[d.id].title}" will be deleted for the whole class.`, { title: 'Delete homework?' }))) return;
    await api(`/api/homework/${d.id}`, { method: 'DELETE' });
    toast('Homework deleted.', 'success');
    refresh();
  },
  'hw-progress': async (d) => {
    const r = await api(`/api/homework/${d.id}/progress`);
    const done = r.students.filter((s) => s.done).length;
    openModal({ title: r.title, body: html`<p class="muted">${done} of ${r.students.length} students have finished this task.</p>
      <ul class="list">${r.students.map((s) => html`<li class="row between"><span>${s.full_name}</span>${s.done ? html`<span class="badge b-green">${icon('tick')} Done ${s.done_at ? fmtShort(s.done_at) : ''}</span>` : html`<span class="badge b-gray">Not yet</span>`}</li>`)}</ul>` });
  },

  'ann-new': () => announcementForm(null),
  'ann-edit': (d) => announcementForm(ui.annItems[d.id]),
  'ann-delete': async (d) => {
    if (!(await confirmBox(`"${ui.annItems[d.id].title}" will be removed for everyone.`, { title: 'Delete announcement?' }))) return;
    await api(`/api/announcements/${d.id}`, { method: 'DELETE' });
    toast('Announcement deleted.', 'success');
    refresh();
  },

  'user-new': () => userCreateForm(),
  'user-edit': (d) => userEditForm(ui.userItems[d.id]),
  'user-view': (d) => openStudentModal(d.id),
  'user-pw': (d) => {
    const x = ui.userItems[d.id];
    formModal({
      title: `Reset password - ${x.full_name}`, submitText: 'Set new password', intro: 'Choose a temporary password and share it with the user.',
      fields: [{ name: 'password', label: 'New password', type: 'password', required: true, minlength: 8, autocomplete: 'new-password', full: true, hint: 'At least 8 characters.' }],
      onSubmit: async (v) => { await api(`/api/users/${x.id}/password`, { method: 'POST', body: v }); toast('Password changed.', 'success'); },
    });
  },
  'user-toggle': async (d) => {
    const x = ui.userItems[d.id];
    const next = !x.active;
    if (!next && !(await confirmBox(`${x.full_name} will no longer be able to log in.`, { title: 'Disable this account?', okText: 'Disable' }))) return;
    await api(`/api/users/${x.id}`, { method: 'PUT', body: { full_name: x.full_name, email: x.email, phone: x.phone, address: x.address, birth_date: x.birth_date, class_id: x.class_id, active: next } });
    toast(next ? 'Account enabled.' : 'Account disabled.', 'success');
    await loadUsers();
  },
  'user-delete': async (d) => {
    const x = ui.userItems[d.id];
    if (!(await confirmBox(`${x.full_name} and all of their records (grades, attendance, homework) will be permanently deleted.`, { title: 'Delete this user?' }))) return;
    await api(`/api/users/${x.id}`, { method: 'DELETE' });
    toast('User deleted.', 'success');
    await loadUsers();
  },

  'class-del': async (d) => {
    const c = ui.setup.classes.find((x) => String(x.id) === d.id);
    if (!(await confirmBox(`Class ${c.name} will be deleted with its timetable, homework and teaching assignments. Students stay but lose their class.`, { title: `Delete class ${c.name}?` }))) return;
    await api(`/api/classes/${d.id}`, { method: 'DELETE' });
    await reloadMeta(); toast('Class deleted.', 'success'); refresh();
  },
  'subject-del': async (d) => {
    const s = ui.setup.subjects.find((x) => String(x.id) === d.id);
    if (!(await confirmBox(`${s.name} will be deleted with all of its grades, homework and timetable lessons.`, { title: `Delete ${s.name}?` }))) return;
    await api(`/api/subjects/${d.id}`, { method: 'DELETE' });
    await reloadMeta(); toast('Subject deleted.', 'success'); refresh();
  },
  'assign-del': async (d) => {
    if (!(await confirmBox('The timetable lessons for this subject in this class will also be removed.', { title: 'Remove this assignment?', okText: 'Remove' }))) return;
    await api(`/api/teaching/${d.id}`, { method: 'DELETE' });
    await reloadMeta(); toast('Assignment removed.', 'success'); refresh();
  },

  'profile-edit': () => {
    const p = ui.profile;
    formModal({
      title: 'Edit my details', submitText: 'Save', values: p,
      fields: [
        { name: 'email', label: 'Email', type: 'email', maxlength: 120, full: true },
        { name: 'phone', label: 'Phone', maxlength: 30 },
        { name: 'address', label: 'Address', maxlength: 200, full: true },
        ...(role() === 'admin' ? [{ name: 'full_name', label: 'Full name', required: true, full: true }, { name: 'birth_date', label: 'Birth date', type: 'date' }] : []),
      ],
      onSubmit: async (v) => { await api(`/api/profile/${p.id}`, { method: 'PUT', body: { full_name: p.full_name, birth_date: p.birth_date, ...v } }); toast('Details saved.', 'success'); const me = await api('/api/meta'); state.meta = me; state.user = me.user; paintShell(); refresh(); },
    });
  },
  'profile-pw': () => formModal({
    title: 'Change password', submitText: 'Change password',
    fields: [
      { name: 'current', label: 'Current password', type: 'password', required: true, autocomplete: 'current-password', full: true },
      { name: 'new', label: 'New password', type: 'password', required: true, minlength: 8, autocomplete: 'new-password', full: true, hint: 'At least 8 characters.' },
      { name: 'again', label: 'Repeat new password', type: 'password', required: true, autocomplete: 'new-password', full: true },
    ],
    onSubmit: async (v) => {
      if (v.new !== v.again) throw new Error('The new passwords do not match.');
      await api('/api/me/password', { method: 'POST', body: { current: v.current, new: v.new } });
      toast('Password changed.', 'success');
    },
  }),
};

const forms = {
  'class-add': async (f) => { await api('/api/classes', { method: 'POST', body: { name: f.elements.name.value } }); await reloadMeta(); toast('Class added.', 'success'); refresh(); },
  'subject-add': async (f) => { await api('/api/subjects', { method: 'POST', body: { name: f.elements.name.value } }); await reloadMeta(); toast('Subject added.', 'success'); refresh(); },
  'assign-add': async (f) => {
    await api('/api/teaching', { method: 'POST', body: { class_id: Number(f.elements.class_id.value), subject_id: Number(f.elements.subject_id.value), teacher_id: Number(f.elements.teacher_id.value) } });
    await reloadMeta(); toast('Teacher assigned.', 'success'); refresh();
  },
};

function bindDashboardEvents() {
  document.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled || el.classList.contains('disabled')) return;
    const fn = actions[el.dataset.act];
    if (!fn) return;
    try { await fn({ ...el.dataset }, el, e); }
    catch (err) { toast(err.message, 'error'); el.disabled = false; }
  });
  document.addEventListener('submit', async (e) => {
    const f = e.target.closest('[data-form]');
    if (!f) return;
    e.preventDefault();
    try { await forms[f.dataset.form](f); } catch (err) { toast(err.message, 'error'); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (cancelConfirm) cancelConfirm(); else { closeModal(); closeMenu(); }
  });
  window.addEventListener('hashchange', render);
}

/* ---------------------------------------------------------------------
   Page initialisers
   --------------------------------------------------------------------- */
function paintShell() {
  const u = state.user;
  $('#nav').innerHTML = NAV[u.role].map(([route, label, ic]) => html`<a href="#/${route}" data-route="${route}">${icon(ic)}<span>${label}</span></a>`).map((r) => r.s).join('');
  $('#user-mini').innerHTML = html`<span class="avatar">${initials(u.full_name)}</span><div><b>${u.full_name}</b><small>${cap(u.role)}${u.class_name ? ` · ${u.class_name}` : ''}</small></div>`.s;
  $('#user-chip').innerHTML = html`<span class="avatar sm">${initials(u.full_name)}</span><span class="uc-name">${u.full_name}</span>`.s;
  $('#year-pill').textContent = `School year ${state.meta.school_year}`;
  $('#menu-btn').innerHTML = icon('menu').s;
  $('#logout-icon').innerHTML = icon('logout').s;
  $$('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.route === currentRoute()));
}

async function initDashboard() {
  bindDashboardEvents();
  try {
    state.meta = await api('/api/meta');
    state.user = state.meta.user;
  } catch (err) {
    view().innerHTML = html`<div class="card error-card"><h3>Could not load the dashboard</h3><p>${err.message}</p></div>`.s;
    return;
  }
  paintShell();
  await render();
}

function initLogin() {
  const form = $('#login-form'), errBox = $('#login-error'), btnEl = $('#login-btn');
  const showError = (msg) => { errBox.textContent = msg; errBox.hidden = false; form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake'); };
  $('#pw-toggle').addEventListener('click', (e) => {
    const input = $('#password'), show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    e.currentTarget.textContent = show ? 'Hide' : 'Show';
    e.currentTarget.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  });
  $$('.demo-chip').forEach((b) => b.addEventListener('click', () => {
    $('#username').value = b.dataset.demoUser;
    $('#password').value = b.dataset.demoPass;
    errBox.hidden = true;
    $('#login-btn').focus();
  }));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errBox.hidden = true;
    const username = $('#username').value.trim(), password = $('#password').value;
    if (!username || !password) { showError('Enter your username and password.'); return; }
    btnEl.disabled = true; btnEl.textContent = 'Logging in...';
    try {
      const data = await api('/api/login', { method: 'POST', body: { username, password } });
      CSRF = data.csrf;
      btnEl.textContent = 'Welcome!';
      location.href = data.redirect || 'dashboard.html';
    } catch (err) {
      showError(err.message);
      btnEl.disabled = false; btnEl.textContent = 'Log in';
      $('#password').select();
    }
  });
}

function initIndex() {
  const els = $$('.reveal');
  if (!('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('in')); return; }
  const io = new IntersectionObserver((entries) => entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }), { threshold: 0.12 });
  els.forEach((e) => io.observe(e));
}

document.addEventListener('DOMContentLoaded', () => {
  const page = document.body.dataset.page;
  if (page === 'dashboard') initDashboard();
  else if (page === 'login') initLogin();
  else if (page === 'index') initIndex();
});
