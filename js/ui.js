// Componentes de interfaz estilo iOS: hojas modales, alertas, menús de acción y avisos.
import { icon } from './icons.js';

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/* ---------- rutas tipo "items.0.qty" ---------- */
export function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]];
  o[keys[keys.length - 1]] = value;
}

/* ---------- hojas modales ---------- */
export const sheets = [];

function syncBackdrop() {
  const app = document.getElementById('app');
  if (app && sheets.length && !document.documentElement.classList.contains('has-sheet')) app.style.transformOrigin = `50% ${window.scrollY}px`;
  document.documentElement.classList.toggle('has-sheet', sheets.length > 0);
  sheets.forEach((s, i) => s.el.classList.toggle('behind', i < sheets.length - 1));
}

/**
 * opts: { title, left, right, render(sheet), acts, onInput(sheet, el, ev), onClose, data, dismissable, cls }
 * left/right: { label, act, bold, disabled } | null
 */
export function openSheet(opts) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap ' + (opts.cls || '');
  wrap.innerHTML = `<div class="sheet-backdrop"></div><section class="sheet" role="dialog" aria-modal="true"><div class="grabber"></div><header class="sheet-head"></header><div class="sheet-body"></div></section>`;
  const sheet = {
    el: wrap,
    opts,
    data: opts.data || {},
    head: $('.sheet-head', wrap),
    body: $('.sheet-body', wrap),
    render() {
      const st = sheet.body.scrollTop;
      sheet.renderHead();
      sheet.body.innerHTML = opts.render(sheet);
      sheet.body.scrollTop = st;
      opts.afterRender?.(sheet);
    },
    renderHead() {
      const btn = (b, side) =>
        b
          ? `<button class="sh-btn ${side} ${b.bold ? 'bold' : ''}" data-act="${b.act || 'close'}" ${b.disabled ? 'disabled' : ''}>${esc(b.label)}</button>`
          : `<span class="sh-btn ${side}"></span>`;
      const left = typeof opts.left === 'function' ? opts.left(sheet) : opts.left;
      const right = typeof opts.right === 'function' ? opts.right(sheet) : opts.right;
      const title = typeof opts.title === 'function' ? opts.title(sheet) : opts.title;
      sheet.head.innerHTML = `${btn(left === undefined ? { label: 'Cerrar' } : left, 'l')}<h2>${esc(title)}</h2>${btn(right, 'r')}`;
    },
    close(result) {
      if (sheet.closed) return;
      sheet.closed = true;
      wrap.classList.remove('open');
      const i = sheets.indexOf(sheet);
      if (i >= 0) sheets.splice(i, 1);
      syncBackdrop();
      setTimeout(() => wrap.remove(), 320);
      opts.onClose?.(sheet, result);
    },
  };
  wrap.addEventListener('click', (ev) => {
    if (ev.target.classList.contains('sheet-backdrop')) {
      if (opts.dismissable !== false) sheet.close();
      return;
    }
    const el = ev.target.closest('[data-act]');
    if (!el || !wrap.contains(el) || el.disabled) return;
    const act = el.dataset.act;
    if (opts.acts?.[act]) opts.acts[act](el, ev, sheet);
    else if (act === 'close') sheet.close();
  });
  const onInput = (ev) => opts.onInput?.(sheet, ev.target, ev);
  wrap.addEventListener('input', onInput);
  wrap.addEventListener('change', onInput);
  enableSwipeDown(sheet);
  document.body.appendChild(wrap);
  sheets.push(sheet);
  sheet.render();
  syncBackdrop();
  requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('open')));
  return sheet;
}

function enableSwipeDown(sheet) {
  const panel = $('.sheet', sheet.el);
  let y0 = null;
  let dy = 0;
  const start = (e) => {
    if (!e.target.closest('.sheet-head, .grabber') || e.target.closest('button')) return;
    y0 = e.touches[0].clientY;
    dy = 0;
    panel.style.transition = 'none';
  };
  const move = (e) => {
    if (y0 === null) return;
    dy = Math.max(0, e.touches[0].clientY - y0);
    panel.style.transform = `translateY(${dy}px)`;
  };
  const end = () => {
    if (y0 === null) return;
    y0 = null;
    panel.style.transition = '';
    panel.style.transform = '';
    if (dy > 110 && sheet.opts.dismissable !== false) sheet.close();
  };
  panel.addEventListener('touchstart', start, { passive: true });
  panel.addEventListener('touchmove', move, { passive: true });
  panel.addEventListener('touchend', end);
}

export const topSheet = () => sheets[sheets.length - 1];

/* ---------- alertas ---------- */
function overlay(cls, html) {
  const el = document.createElement('div');
  el.className = 'overlay ' + cls;
  el.innerHTML = html;
  document.body.appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('open')));
  return el;
}
function closeOverlay(el) {
  el.classList.remove('open');
  setTimeout(() => el.remove(), 250);
}

/** buttons: [{label, value, style: 'cancel'|'destructive'|'default'}] */
export function alertBox({ title, message = '', buttons = [{ label: 'OK', value: true }], input = null }) {
  return new Promise((resolve) => {
    const vertical = buttons.length > 2;
    const el = overlay(
      'alert-ov',
      `<div class="alert" role="alertdialog">
        <div class="alert-body">
          <h3>${esc(title)}</h3>
          ${message ? `<p>${esc(message).replace(/\n/g, '<br>')}</p>` : ''}
          ${input ? `<input class="alert-input" type="${input.type || 'text'}" inputmode="${input.inputmode || 'text'}" placeholder="${esc(input.placeholder || '')}" value="${esc(input.value ?? '')}" autocomplete="off">` : ''}
        </div>
        <div class="alert-btns ${vertical ? 'v' : ''}">
          ${buttons.map((b, i) => `<button data-i="${i}" class="${b.style || ''}">${esc(b.label)}</button>`).join('')}
        </div>
      </div>`,
    );
    const inp = $('.alert-input', el);
    if (inp) setTimeout(() => { inp.focus(); inp.select(); }, 280);
    el.addEventListener('click', (ev) => {
      const b = ev.target.closest('button[data-i]');
      if (!b) return;
      const btn = buttons[+b.dataset.i];
      closeOverlay(el);
      resolve(input && btn.style !== 'cancel' ? inp.value : btn.value);
    });
    inp?.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        const okIdx = buttons.findIndex((b) => b.style !== 'cancel');
        el.querySelector(`button[data-i="${okIdx}"]`)?.click();
      }
    });
  });
}

export const confirmBox = (title, message, ok = 'Aceptar', destructive = false) =>
  alertBox({
    title,
    message,
    buttons: [
      { label: 'Cancelar', value: false, style: 'cancel' },
      { label: ok, value: true, style: destructive ? 'destructive' : 'bold' },
    ],
  });

export const promptBox = ({ title, message, value = '', placeholder = '', inputmode = 'text', ok = 'Aceptar' }) =>
  alertBox({
    title,
    message,
    input: { value, placeholder, inputmode },
    buttons: [
      { label: 'Cancelar', value: null, style: 'cancel' },
      { label: ok, value: true, style: 'bold' },
    ],
  });

/** actions: [{label, value, destructive}] → value | null */
export function actionSheet({ title = '', message = '', actions = [], cancel = 'Cancelar' }) {
  return new Promise((resolve) => {
    const el = overlay(
      'as-ov',
      `<div class="as">
        <div class="as-group">
          ${title || message ? `<div class="as-head">${title ? `<b>${esc(title)}</b>` : ''}${message ? `<span>${esc(message)}</span>` : ''}</div>` : ''}
          ${actions.map((a, i) => `<button data-i="${i}" class="${a.destructive ? 'destructive' : ''}">${esc(a.label)}</button>`).join('')}
        </div>
        <button class="as-cancel" data-i="-1">${esc(cancel)}</button>
      </div>`,
    );
    el.addEventListener('click', (ev) => {
      const b = ev.target.closest('button[data-i]');
      if (!b && !ev.target.classList.contains('as-ov')) return;
      closeOverlay(el);
      const i = b ? +b.dataset.i : -1;
      resolve(i >= 0 ? actions[i].value : null);
    });
  });
}

let toastTimer;
export function toast(msg, ic = 'check') {
  let el = $('#toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  el.innerHTML = `${icon(ic)}<span>${esc(msg)}</span>`;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

/* ---------- selector genérico con búsqueda ---------- */
/**
 * items: [{value, label, sub, right}], addNew: {label, async handler(query) → value|null}
 */
export function pickFromList({ title, items, addNew = null, selected = null, searchPlaceholder = 'Buscar' }) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v, sheet) => {
      done = true;
      resolve(v);
      sheet.close();
    };
    const listHtml = (q) => {
      const n = q.trim().toLowerCase();
      const vis = items.filter((it) => !n || `${it.label} ${it.sub || ''}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(n.normalize('NFD').replace(/[̀-ͯ]/g, '')));
      return `
        ${addNew ? `<div class="list"><button class="row link" data-act="new">${icon('plus')}<span class="grow">${esc(addNew.label)}${q ? ` “${esc(q)}”` : ''}</span></button></div>` : ''}
        <div class="list">
          ${vis.length ? vis.map((it) => `
            <button class="row" data-act="pick" data-v="${esc(it.value)}">
              <span class="grow"><span class="t">${esc(it.label)}</span>${it.sub ? `<span class="s">${it.sub}</span>` : ''}</span>
              ${it.right ? `<span class="r">${it.right}</span>` : ''}
              ${selected === it.value ? `<span class="checkmark">${icon('check')}</span>` : ''}
            </button>`).join('') : `<div class="empty-row">Sin resultados</div>`}
        </div>`;
    };
    openSheet({
      title,
      left: { label: 'Cancelar' },
      data: { q: '' },
      render: (s) => `
        <div class="searchbar">${icon('search')}<input type="search" data-search placeholder="${esc(searchPlaceholder)}" value="${esc(s.data.q)}" autocomplete="off"></div>
        <div data-results>${listHtml(s.data.q)}</div>`,
      onInput: (s, el, ev) => {
        if (el.matches('[data-search]') && ev.type === 'input') {
          s.data.q = el.value;
          $('[data-results]', s.body).innerHTML = listHtml(el.value);
        }
      },
      acts: {
        pick: (el, ev, s) => {
          const it = items.find((x) => String(x.value) === el.dataset.v);
          finish(it ? it.value : null, s);
        },
        new: async (el, ev, s) => {
          const v = await addNew.handler(s.data.q.trim());
          if (v != null) finish(v, s);
        },
      },
      onClose: () => {
        if (!done) resolve(null);
      },
    });
  });
}

/* ---------- fragmentos de HTML reutilizables ---------- */
export function seg(name, options, value, act = 'seg') {
  return `<div class="seg" role="tablist">${options
    .map(([v, label]) => `<button class="${String(v) === String(value) ? 'on' : ''}" data-act="${act}" data-name="${name}" data-v="${esc(v)}">${esc(label)}</button>`)
    .join('')}</div>`;
}

export function toggle(bind, checked, extra = '') {
  return `<label class="switch"><input type="checkbox" data-bind="${bind}" ${checked ? 'checked' : ''} ${extra}><span></span></label>`;
}

export function stepper(act, path, value) {
  return `<div class="stepper"><button data-act="${act}" data-path="${path}" data-d="-1" aria-label="Menos">${icon('minus')}</button><span>${esc(value)}</span><button data-act="${act}" data-path="${path}" data-d="1" aria-label="Más">${icon('plus')}</button></div>`;
}

/* ---------- filas de listas agrupadas ---------- */
export const section = (title, body, footer = '') =>
  `${title ? `<div class="sec-h">${title}</div>` : ''}<div class="list">${body}</div>${footer ? `<div class="sec-f">${footer}</div>` : ''}`;

export const field = (label, control, cls = '') =>
  `<label class="row field ${cls}"><span class="lbl">${label}</span>${control}</label>`;

export const inp = (bind, value, attrs = '') =>
  `<input class="inp" data-bind="${bind}" value="${esc(value ?? '')}" autocomplete="off" ${attrs}>`;

export const navRow = (act, label, { right = '', attrs = '', ic = null, color = '', sub = '' } = {}) =>
  `<button class="row navrow" data-act="${act}" ${attrs}>${ic ? `<span class="ricon ${color}">${icon(ic)}</span>` : ''}<span class="grow"><span class="t">${label}</span>${sub ? `<span class="s">${sub}</span>` : ''}</span>${right ? `<span class="r">${right}</span>` : ''}${icon('chevR', 'chev')}</button>`;

export const btnRow = (act, label, { attrs = '', ic = null, cls = '' } = {}) =>
  `<button class="row link ${cls}" data-act="${act}" ${attrs}>${ic ? icon(ic) : ''}<span class="grow">${label}</span></button>`;

export const infoRow = (label, value, cls = '') =>
  `<div class="row info ${cls}"><span class="grow">${label}</span><span class="r">${value}</span></div>`;

export const emptyRow = (text) => `<div class="empty-row">${text}</div>`;
