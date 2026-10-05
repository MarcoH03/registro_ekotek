// Shell de la aplicación: pestañas, vistas principales y arranque.
import { icon } from './icons.js';
import {
  state, today, fmtDate, fmtDateLong, fmtTime, money, num, norm, isSunday, weekStart, addDays, parseDate,
  wh, whName, productName, gestorName, stockMap, moneyMap, activeSales, saleCalc, salesTotals, itemsSummary, openIncidents,
  hasIncident, gestorStats, weekSummary, APP_VERSION,
} from './store.js';
import { $, esc, seg, section, navRow, btnRow, infoRow, emptyRow, confirmBox, actionSheet, toast } from './ui.js';
import { ctx, onRefresh, refresh, commit, copyText, shareText } from './core.js';
import { buildClosure } from './closure.js';
import {
  saleEditor, saleDetail, productSheet, productEditor, moveEditor, countSheet, importSheet, finderSheet,
  moneySheet, incidentsSheet, incidentEditor, gestorSheet, gestorEditor, weekSheet, settingsSheet, welcomeSheet,
  exportBackup, whatsNewSheet,
} from './sheets.js';

const TABS = [
  ['hoy', 'Hoy', 'home'],
  ['ventas', 'Ventas', 'bag'],
  ['inventario', 'Inventario', 'box'],
  ['gestores', 'Gestores', 'people'],
  ['cierre', 'Cierre', 'doc'],
];
const vs = {
  ventas: { q: '', filter: 'todas' },
  inventario: { q: '', wh: 'todos', showZero: false },
  gestores: { q: '' },
  cierre: { date: null, text: '', source: 'auto' },
};
const scrollPos = {};
const TYPE_IC = { recogida: ['bag', 'blue'], envio: ['truck', 'teal'], anticipada: ['clock', 'orange'] };

/* ---------- piezas comunes ---------- */
function navbar(title, { left = '', right = '' } = {}) {
  return `
    <header class="nav"><div class="nav-bar"><div class="nav-side">${left}</div><div class="nav-title">${esc(title)}</div><div class="nav-side r">${right}</div></div></header>
    <h1 class="large-title">${esc(title)}</h1>`;
}
const navBtn = (ic, act, label) => `<button class="nav-btn" data-act="${act}" aria-label="${esc(label)}">${icon(ic)}</button>`;
const dateChip = (bind) => `
  <label class="date-chip">${icon('calendar')}<span>${fmtDate(bind === 'cierreDate' ? vs.cierre.date : ctx.date)}</span>${icon('chevD')}
    <input type="date" data-input="${bind}" value="${bind === 'cierreDate' ? vs.cierre.date : ctx.date}">
  </label>`;

function saleRow(s) {
  const c = saleCalc(s);
  const [ic, color] = TYPE_IC[s.type] || TYPE_IC.recogida;
  const pending = s.type === 'anticipada' && !s.delivered;
  const sub = [s.vale ? `Vale ${esc(s.vale)}` : '<span class="warn-t">Sin vale</span>', esc(wh(s.wh)?.salesTitle || whName(s.wh)), ...s.gestores.map((g) => `${esc(gestorName(g.gid))} ${money(g.amount)}`)];
  return `
    <button class="row sale-row ${s.void ? 'void' : ''}" data-act="sale" data-id="${s.id}">
      <span class="ricon ${color}">${icon(ic)}</span>
      <span class="grow"><span class="t">${esc(itemsSummary(s.items))}${s.client ? ` · ${esc(s.client)}` : ''}</span><span class="s">${sub.join(' · ')}</span></span>
      <span class="r"><b>${money(c.total)}</b>${s.void ? '<span class="pill red sm">Anulada</span>' : pending ? '<span class="pill orange sm">Pendiente</span>' : ''}</span>
      ${icon('chevR', 'chev')}
    </button>`;
}

/** Fila con el reparto de un grupo de ventas: dueños y caja (y rebajas). */
function splitBar(t) {
  return `<div class="row split-bar">
    <span class="acc-duenos"><small>Dueños</small><b>${money(t.owners)}</b></span>
    <span class="acc-caja"><small>Caja</small><b>${money(t.caja)}</b></span>
    ${t.discount ? `<span><small>Rebajas</small><b class="orange">${money(t.discount)}</b></span>` : ''}
  </div>`;
}

/* ---------- HOY ---------- */
function viewHoy() {
  const S = state.settings;
  const d = ctx.date;
  const sales = activeSales().filter((s) => s.date === d).sort((a, b) => b.ts - a.ts);
  const t = salesTotals(sales);
  const bal = moneyMap(d);
  const incOpen = openIncidents().length;
  const pend = activeSales().filter((s) => s.type === 'anticipada' && !s.delivered).length;
  const counted = (w) => state.counts.filter((c) => c.date === d && c.wh === w).sort((a, b) => b.ts - a.ts)[0];
  const backupOld = !S.lastBackup || (parseDate(today()) - parseDate(S.lastBackup)) / 864e5 >= 7;
  const w = weekSummary(weekStart(d));
  const gestPend = state.gestores.reduce((a, g) => a + Math.max(0, gestorStats(g.id).balance), 0);
  const tile = (ic, label, color, act) => `<button class="tile" data-act="${act}"><span class="ricon ${color}">${icon(ic)}</span><span>${label}</span></button>`;
  return `
    ${navbar('Hoy', { right: navBtn('gear', 'settings', 'Ajustes') })}
    <div class="subhead">${fmtDateLong(d)}${S.asesor ? ` · ${esc(S.asesor)}` : ''} ${dateChip('workDate')}</div>
    ${d !== today() ? `<div class="banner blue">${icon('calendar')}<span>Estás trabajando con el día ${fmtDate(d)}.</span><button data-act="goToday">Volver a hoy</button></div>` : ''}
    ${isSunday(d) ? `<button class="banner purple" data-act="week">${icon('week')}<span><b>Hoy es domingo.</b> Prepara la liquidación semanal de gestores y asesores.</span>${icon('chevR')}</button>` : ''}
    ${backupOld && state.sales.length ? `<button class="banner orange" data-act="backup">${icon('shield')}<span>${S.lastBackup ? `Última copia de seguridad: ${fmtDate(S.lastBackup)}.` : 'Aún no has hecho una copia de seguridad.'} Toca para exportar.</span>${icon('chevR')}</button>` : ''}
    <div class="tiles">
      ${tile('bag', 'Nueva venta', 'blue', 'newSale')}
      ${tile('pin', '¿Dónde buscar?', 'indigo', 'finder')}
      ${tile('clipboard', 'Conteo', 'green', 'count')}
      ${tile('alert', 'Incidencia', 'orange', 'newInc')}
      ${tile('swap', 'Traslado', 'teal', 'traslado')}
      ${tile('doc', 'Cierre', 'purple', 'goCierre')}
    </div>
    <div class="sec-h">Resumen del día <span class="sec-r">${t.count} venta${t.count === 1 ? '' : 's'}</span></div>
    <div class="stats3">
      <div><span>Cobrado</span><b>${money(t.total)}</b></div>
      <div class="acc-duenos"><span>Dueños</span><b>${money(t.owners)}</b></div>
      <div class="acc-caja"><span>Caja</span><b>${money(t.caja)}</b></div>
    </div>
    ${t.discount ? `<div class="sec-f">Incluye ${money(t.discount)} de rebajas y combos.</div>` : ''}
    ${section('Revisión de inventario', state.warehouses.map((x) => {
      const c = counted(x.id);
      return navRow('count', `Conteo ${esc(x.emoji)} ${esc(x.name)}`, {
        right: c ? `<span class="ok">${icon('check')} ${fmtTime(c.ts)}${c.diffs.length ? ` · ${c.diffs.length} dif.` : ''}</span>` : '<span class="orange">Pendiente</span>',
        attrs: `data-wh="${x.id}"`,
      });
    }).join(''), 'Al empezar el turno cuenta cada almacén para comprobar que coincide con el último cierre.')}
    ${section('Dinero', state.warehouses.map((x) => navRow('cash', `${esc(x.emoji)} ${esc(x.name)}`, {
      right: `<span class="money2"><span><small>Caja</small><b>${money(bal[x.id]?.caja || 0)}</b></span><span><small>Dueños</small><b>${money(bal[x.id]?.duenos || 0)}</b></span></span>`,
      attrs: `data-wh="${x.id}"`,
    })).join(''), 'Toca un almacén para anotar entregas a los dueños, gastos, ingresos o hacer un arqueo.')}
    ${section(`Ventas del ${fmtDate(d)}`, (sales.length ? sales.map(saleRow).join('') : emptyRow('Aún no hay ventas. Toca “Nueva venta”.')) + btnRow('newSale', 'Nueva venta', { ic: 'plus' }))}
    ${section('Seguimiento', `
      ${navRow('incidents', 'Incidencias abiertas', { ic: 'alert', color: 'orange', right: incOpen ? `<span class="badge-n">${incOpen}</span>` : '0' })}
      ${navRow('anticipadas', 'Compras anticipadas pendientes', { ic: 'clock', color: 'orange', right: pend ? `<span class="badge-n">${pend}</span>` : '0' })}
      ${navRow('week', 'Liquidación semanal', { ic: 'week', color: 'purple', right: gestPend ? money(gestPend) : '', sub: `${fmtDate(w.ws)} – ${fmtDate(w.we)} · ${w.count} ventas` })}`)}
    <div class="spacer"></div>`;
}

/* ---------- VENTAS ---------- */
function salesListHtml() {
  const { q, filter } = vs.ventas;
  const n = norm(q);
  let list = state.sales.filter((s) => filter === 'todas' || s.type === filter);
  if (n) {
    list = list.filter((s) => norm([s.vale, s.client, s.phone, itemsSummary(s.items), ...s.gestores.map((g) => gestorName(g.gid))].join(' ')).includes(n));
  }
  list.sort((a, b) => b.date.localeCompare(a.date) || b.ts - a.ts);
  if (filter === 'anticipada') {
    // Las compras anticipadas pendientes de entrega van primero.
    const pend = list.filter((s) => !s.delivered && !s.void);
    if (pend.length) {
      const rest = list.filter((s) => !pend.includes(s));
      return section(`Pendientes de entrega · ${pend.length}`, pend.map(saleRow).join('')) + (rest.length ? section('Entregadas o anuladas', rest.map(saleRow).join('')) : '');
    }
  }
  if (!list.length) return `<div class="empty-card">${icon('bag')}<p>${state.sales.length ? 'No hay ventas que coincidan.' : 'Aún no has registrado ventas.'}</p>${state.sales.length ? '' : '<button class="btn-primary" data-act="newSale">Registrar la primera venta</button>'}</div>`;
  const groups = new Map();
  for (const s of list) {
    if (!groups.has(s.date)) groups.set(s.date, []);
    groups.get(s.date).push(s);
  }
  return [...groups.entries()]
    .map(([date, arr]) => {
      const t = salesTotals(arr);
      return section(`${fmtDateLong(date)} <span class="sec-r">${money(t.total)}</span>`, (t.count ? splitBar(t) : '') + arr.map(saleRow).join(''));
    })
    .join('');
}

function viewVentas() {
  return `
    ${navbar('Ventas', { right: navBtn('plus', 'newSale', 'Nueva venta') })}
    <div class="searchbar">${icon('search')}<input type="search" data-input="salesQ" placeholder="Vale, producto, cliente, gestor" value="${esc(vs.ventas.q)}"></div>
    <div class="pad">${seg('salesFilter', [['todas', 'Todas'], ['recogida', 'Recogidas'], ['envio', 'Envíos'], ['anticipada', 'Anticipadas']], vs.ventas.filter)}</div>
    <div id="sales-list">${salesListHtml()}</div>
    <div class="spacer"></div>`;
}

/* ---------- INVENTARIO ---------- */
function invListHtml() {
  const { q, wh: w, showZero } = vs.inventario;
  const st = stockMap();
  const n = norm(q);
  if (!state.products.length) {
    return `<div class="empty-card">${icon('box')}<p>Aún no hay productos. Lo más rápido es pegar el stock del último cierre general.</p>
      <button class="btn-primary" data-act="import">${icon('inbox')} Importar desde un cierre</button>
      <button class="btn-secondary" data-act="newProduct">${icon('plus')} Añadir producto a mano</button></div>`;
  }
  const qty = (p) => (w === 'todos' ? state.warehouses.reduce((a, x) => a + (st[x.id]?.[p.id] || 0), 0) : st[w]?.[p.id] || 0);
  const all = state.products.filter((p) => !n || norm([p.name, ...(p.aliases || [])].join(' ')).includes(n));
  const vis = all.filter((p) => showZero || qty(p) !== 0);
  const hidden = all.length - vis.length;
  const units = vis.reduce((a, p) => a + qty(p), 0);
  const rows = vis.map((p) => {
    const inc = w === 'todos' ? state.warehouses.some((x) => hasIncident(x.id, p.id)) : hasIncident(w, p.id);
    const right = w === 'todos'
      ? `<span class="multi">${state.warehouses.map((x) => `<span class="${(st[x.id]?.[p.id] || 0) ? '' : 'dim'}"><small>${esc(x.emoji)}</small>${st[x.id]?.[p.id] || 0}</span>`).join('')}</span>`
      : `<span class="qty ${qty(p) < 0 ? 'bad' : qty(p) === 0 ? 'dim' : ''}">${qty(p)}</span>`;
    return `<button class="row" data-act="product" data-id="${p.id}">
      <span class="grow"><span class="t">${esc(p.name)}${inc ? ' <span class="pill orange sm">Incidencia</span>' : ''}</span>${p.price ? `<span class="s">${money(p.price)}</span>` : ''}</span>
      ${right}${icon('chevR', 'chev')}</button>`;
  });
  return `
    <div class="sec-h">${vis.length} producto${vis.length === 1 ? '' : 's'} · ${units} unidades</div>
    <div class="list">${rows.join('') || emptyRow('Sin resultados')}</div>
    ${hidden || showZero ? `<div class="pad"><button class="btn-plain" data-act="toggleZero">${showZero ? 'Ocultar productos sin stock' : `Mostrar ${hidden} producto${hidden === 1 ? '' : 's'} sin stock`}</button></div>` : ''}`;
}

function viewInventario() {
  return `
    ${navbar('Inventario', { right: navBtn('plus', 'invMenu', 'Añadir') })}
    <div class="searchbar">${icon('search')}<input type="search" data-input="invQ" placeholder="Buscar producto" value="${esc(vs.inventario.q)}"></div>
    <div class="pad">${seg('invWh', [...state.warehouses.map((w) => [w.id, `${w.emoji} ${w.name}`]), ['todos', 'Ambos']], vs.inventario.wh)}</div>
    <div class="chips">
      <button data-act="count">${icon('clipboard')} Conteo</button>
      <button data-act="entrada">${icon('inbox')} Entrada</button>
      <button data-act="traslado">${icon('swap')} Traslado</button>
      <button data-act="finder">${icon('pin')} ¿Dónde buscar?</button>
    </div>
    <div id="inv-list">${invListHtml()}</div>
    <div class="spacer"></div>`;
}

/* ---------- GESTORES ---------- */
function gestListHtml() {
  const n = norm(vs.gestores.q);
  const ws = weekStart(ctx.date);
  const list = state.gestores
    .filter((g) => !n || norm(`${g.name} ${g.phone}`).includes(n))
    .map((g) => ({ g, st: gestorStats(g.id), wk: gestorStats(g.id, ws, addDays(ws, 6)) }))
    .sort((a, b) => b.st.balance - a.st.balance || a.g.name.localeCompare(b.g.name, 'es'));
  if (!state.gestores.length) return `<div class="empty-card">${icon('people')}<p>Los gestores se añaden al registrar una venta o desde el botón +.</p><button class="btn-primary" data-act="newGestor">Añadir gestor</button></div>`;
  return section(`${list.length} gestores`, list.map(({ g, st, wk }) => `
    <button class="row" data-act="gestor" data-id="${g.id}">
      <span class="avatar">${esc((g.name.match(/[A-Za-zÁÉÍÓÚÑáéíóúñ]/g) || ['#']).slice(0, 1).join('').toUpperCase())}</span>
      <span class="grow"><span class="t">${esc(g.name)}</span><span class="s">${[g.phone, wk.earned ? `esta semana ${money(wk.earned)}` : ''].filter(Boolean).map(esc).join(' · ') || 'Sin comisiones esta semana'}</span></span>
      <span class="r">${st.balance > 0 ? `<b class="orange">${money(st.balance)}</b>` : st.balance < 0 ? `<b class="bad">${money(st.balance)}</b>` : '<span class="dim">Al día</span>'}</span>
      ${icon('chevR', 'chev')}
    </button>`).join('') || emptyRow('Sin resultados'), 'El importe es lo que se le debe a cada gestor (comisiones menos pagos).');
}

function viewGestores() {
  const ref = parseDate(ctx.date).getDay() === 1 ? addDays(ctx.date, -1) : ctx.date;
  const w = weekSummary(weekStart(ref));
  const pend = w.gestores.reduce((a, x) => a + Math.max(0, x.balance), 0);
  const ases = w.asesores.reduce((a, x) => a + x.commission, 0);
  return `
    ${navbar('Gestores', { right: navBtn('plus', 'newGestor', 'Nuevo gestor') })}
    <button class="week-card" data-act="week">
      <span class="ricon purple">${icon('week')}</span>
      <span class="grow"><span class="t">Liquidación semanal</span><span class="s">${fmtDate(w.ws)} – ${fmtDate(w.we)} · se entrega el lunes</span></span>
      <span class="wk-nums"><b>${money(pend)}</b><small>gestores</small><b>${money(ases)}</b><small>asesores</small></span>
      ${icon('chevR', 'chev')}
    </button>
    <div class="searchbar">${icon('search')}<input type="search" data-input="gestQ" placeholder="Buscar gestor" value="${esc(vs.gestores.q)}"></div>
    <div id="gest-list">${gestListHtml()}</div>
    <div class="spacer"></div>`;
}

/* ---------- CIERRE ---------- */
function closureState() {
  const cs = vs.cierre;
  if (!cs.date) cs.date = ctx.date;
  if (cs.source === 'auto') {
    const saved = state.closures.find((c) => c.date === cs.date);
    if (saved && !cs.ignoreSaved) {
      cs.source = 'saved';
      cs.text = saved.text;
    } else cs.text = buildClosure(cs.date);
  }
  return cs;
}

function viewCierre() {
  const cs = closureState();
  const d = cs.date;
  const saved = state.closures.find((c) => c.date === d);
  const daySales = activeSales().filter((s) => s.date === d);
  const noVale = daySales.filter((s) => !s.vale).length;
  const st = stockMap(d);
  const neg = [];
  for (const w of state.warehouses) for (const [pid, q] of Object.entries(st[w.id] || {})) if (q < 0) neg.push(`${productName(pid)} (${w.name}: ${q})`);
  const counted = state.warehouses.filter((w) => state.counts.some((c) => c.date === d && c.wh === w.id));
  const check = (ok, label, detail = '', act = '') => `
    <${act ? `button data-act="${act}"` : 'div'} class="row info check">
      <span class="ck ${ok ? 'ok' : 'warn'}">${icon(ok ? 'check' : 'alert')}</span>
      <span class="grow"><span class="t">${label}</span>${detail ? `<span class="s">${detail}</span>` : ''}</span>
      ${act ? icon('chevR', 'chev') : ''}
    </${act ? 'button' : 'div'}>`;
  const history = [...state.closures].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);
  return `
    ${navbar('Cierre', { right: navBtn('share', 'cShare', 'Compartir') })}
    <div class="subhead">Cierre general del ${fmtDateLong(d).toLowerCase()} ${dateChip('cierreDate')}</div>
    ${section('Revisión antes de enviar', `
      ${check(counted.length === state.warehouses.length, 'Conteo de inventario', counted.length === state.warehouses.length ? 'Hecho en todos los almacenes' : `Falta: ${state.warehouses.filter((w) => !counted.includes(w)).map((w) => esc(w.name)).join(', ')}`, counted.length === state.warehouses.length ? '' : 'count')}
      ${check(daySales.length > 0, `${daySales.length} venta${daySales.length === 1 ? '' : 's'} registrada${daySales.length === 1 ? '' : 's'}`, noVale ? `${noVale} sin número de vale` : '', 'goVentas')}
      ${check(!neg.length, neg.length ? 'Stock negativo' : 'Stock sin negativos', esc(neg.join(', ')))}
      ${check(true, `${openIncidents(d).length} incidencia${openIncidents(d).length === 1 ? '' : 's'} abierta${openIncidents(d).length === 1 ? '' : 's'}`, '', 'incidents')}`)}
    <div class="sec-h">Texto del cierre ${cs.source === 'saved' ? `<span class="sec-r">Guardado ${fmtTime(saved?.ts)}</span>` : cs.source === 'edited' ? '<span class="sec-r orange">Editado</span>' : '<span class="sec-r">Automático</span>'}</div>
    <div class="list"><textarea id="closure-text" class="closure-ta" data-input="closureText" spellcheck="false">${esc(cs.text)}</textarea></div>
    <div class="sec-f">Puedes escribir directamente en el texto antes de enviarlo. ${cs.source !== 'auto' ? 'Si registras más cambios, toca “Regenerar” para actualizarlo.' : 'Se actualiza solo mientras no lo edites.'}</div>
    <div class="pad three">
      <button class="btn-secondary" data-act="cRegen">${icon('refresh')} Regenerar</button>
      <button class="btn-secondary" data-act="cCopy">${icon('copy')} Copiar</button>
      <button class="btn-secondary" data-act="cSave">${icon('check')} Guardar</button>
    </div>
    <div class="pad"><button class="btn-primary green" data-act="cShare">${icon('share')} Enviar por WhatsApp</button></div>
    ${section('Cierres guardados', history.length ? history.map((c) => navRow('cOpen', `Cierre del ${fmtDate(c.date)}`, { sub: `Guardado a las ${fmtTime(c.ts)}`, attrs: `data-date="${c.date}"`, ic: 'doc', color: 'purple' })).join('') : emptyRow('Aún no has guardado ningún cierre'))}
    <div class="spacer"></div>`;
}

/* ---------- render ---------- */
const VIEWS = { hoy: viewHoy, ventas: viewVentas, inventario: viewInventario, gestores: viewGestores, cierre: viewCierre };

function render() {
  const v = $('#view');
  v.innerHTML = VIEWS[ctx.tab]();
  v.dataset.tab = ctx.tab;
  for (const b of document.querySelectorAll('.tabbar button')) b.classList.toggle('on', b.dataset.tab === ctx.tab);
  autosize();
  onScroll();
}

function autosize() {
  const ta = $('#closure-text');
  if (!ta) return;
  ta.style.height = 'auto';
  ta.style.height = ta.scrollHeight + 4 + 'px';
}

function setTab(t) {
  scrollPos[ctx.tab] = window.scrollY;
  if (t === ctx.tab) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  ctx.tab = t;
  if (t === 'cierre' && vs.cierre.source === 'auto') vs.cierre.date = ctx.date;
  render();
  window.scrollTo(0, scrollPos[t] || 0);
}

function onScroll() {
  const nav = $('.nav');
  if (nav) nav.classList.toggle('compact', window.scrollY > 38);
}

/* ---------- acciones de las vistas ---------- */
const acts = {
  settings: () => settingsSheet(),
  newSale: () => saleEditor(),
  sale: (el) => saleDetail(el.dataset.id),
  finder: () => finderSheet(),
  count: (el) => countSheet(el.dataset.wh || (vs.inventario.wh !== 'todos' ? vs.inventario.wh : null)),
  newInc: () => incidentEditor(),
  incidents: () => incidentsSheet(),
  traslado: () => moveEditor('traslado'),
  entrada: () => moveEditor('entrada'),
  cash: (el) => moneySheet(el.dataset.wh),
  week: () => weekSheet(),
  backup: () => exportBackup(),
  goToday: () => {
    ctx.date = today();
    render();
  },
  goCierre: () => setTab('cierre'),
  goVentas: () => {
    vs.ventas.filter = 'todas';
    setTab('ventas');
  },
  anticipadas: () => {
    vs.ventas.filter = 'anticipada';
    setTab('ventas');
  },
  seg: (el) => {
    const { name, v } = el.dataset;
    if (name === 'salesFilter') vs.ventas.filter = v;
    if (name === 'invWh') vs.inventario.wh = v;
    render();
  },
  product: (el) => productSheet(el.dataset.id),
  newProduct: () => productEditor(),
  import: () => importSheet(),
  toggleZero: () => {
    vs.inventario.showZero = !vs.inventario.showZero;
    render();
  },
  invMenu: async () => {
    const a = await actionSheet({
      title: 'Inventario',
      actions: [
        { label: 'Nuevo producto', value: () => productEditor() },
        { label: 'Entrada de mercancía', value: () => moveEditor('entrada') },
        { label: 'Traslado entre almacenes', value: () => moveEditor('traslado') },
        { label: 'Salida / baja', value: () => moveEditor('salida') },
        { label: 'Conteo de inventario', value: () => countSheet() },
        { label: 'Importar stock desde un cierre', value: () => importSheet() },
      ],
    });
    a?.();
  },
  gestor: (el) => gestorSheet(el.dataset.id),
  newGestor: () => gestorEditor(),
  cRegen: async () => {
    const cs = vs.cierre;
    if (cs.source !== 'auto' && !(await confirmBox('Regenerar cierre', 'Se reemplazará el texto actual por uno nuevo con los datos registrados. Perderás los cambios escritos a mano.', 'Regenerar', true))) return;
    cs.source = 'auto';
    cs.ignoreSaved = true;
    render();
    toast('Cierre actualizado');
  },
  cCopy: () => copyText(vs.cierre.text),
  cShare: () => shareText(vs.cierre.text),
  cSave: () => {
    const cs = vs.cierre;
    const ex = state.closures.find((c) => c.date === cs.date);
    if (ex) Object.assign(ex, { text: cs.text, ts: Date.now() });
    else state.closures.push({ id: Math.random().toString(36).slice(2), date: cs.date, ts: Date.now(), text: cs.text });
    cs.source = 'saved';
    cs.ignoreSaved = false;
    commit();
    toast('Cierre guardado');
  },
  cOpen: (el) => {
    const c = state.closures.find((x) => x.date === el.dataset.date);
    Object.assign(vs.cierre, { date: c.date, text: c.text, source: 'saved', ignoreSaved: false });
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },
};

function bindEvents() {
  document.addEventListener('click', (ev) => {
    if (ev.target.closest('.sheet-wrap, .overlay')) return;
    const tabBtn = ev.target.closest('.tabbar button');
    if (tabBtn) return setTab(tabBtn.dataset.tab);
    const el = ev.target.closest('[data-act]');
    if (el && acts[el.dataset.act]) acts[el.dataset.act](el, ev);
  });
  document.addEventListener('input', (ev) => {
    const el = ev.target;
    if (el.closest('.sheet-wrap, .overlay')) return;
    const k = el.dataset.input;
    if (k === 'salesQ') {
      vs.ventas.q = el.value;
      $('#sales-list').innerHTML = salesListHtml();
    } else if (k === 'invQ') {
      vs.inventario.q = el.value;
      $('#inv-list').innerHTML = invListHtml();
    } else if (k === 'gestQ') {
      vs.gestores.q = el.value;
      $('#gest-list').innerHTML = gestListHtml();
    } else if (k === 'closureText') {
      vs.cierre.text = el.value;
      vs.cierre.source = 'edited';
      autosize();
    }
  });
  document.addEventListener('change', (ev) => {
    const el = ev.target;
    const k = el.dataset.input;
    if (!el.value) return;
    if (k === 'workDate') {
      ctx.date = el.value;
      vs.cierre = { date: el.value, text: '', source: 'auto' };
      render();
    } else if (k === 'cierreDate') {
      vs.cierre = { date: el.value, text: '', source: 'auto' };
      render();
    }
  });
  window.addEventListener('scroll', onScroll, { passive: true });
}

function buildShell() {
  document.getElementById('app').innerHTML = '<main id="view"></main>';
  const nav = document.createElement('nav');
  nav.className = 'tabbar';
  nav.innerHTML = TABS.map(([id, label, ic]) => `<button data-tab="${id}">${icon(ic)}<span>${label}</span></button>`).join('');
  document.body.appendChild(nav);
}

/* ---------- service worker (uso sin conexión) ---------- */
function registerSW() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  navigator.serviceWorker.register('sw.js').then((reg) => {
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw?.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) showUpdate(nw);
      });
    });
  }).catch(() => {});
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    reloaded = true;
    location.reload();
  });
}

function showUpdate(worker) {
  const el = document.createElement('button');
  el.className = 'update-bar';
  el.innerHTML = `${icon('refresh')}<span>Hay una nueva versión. Toca para actualizar.</span>`;
  el.onclick = () => worker.postMessage('skipWaiting');
  document.body.appendChild(el);
}

/* ---------- arranque ---------- */
buildShell();
onRefresh(render);
bindEvents();
render();
registerSW();
navigator.storage?.persist?.().catch(() => {});
if (!state.settings.onboarded) welcomeSheet();
else if (state.settings.seenVersion !== APP_VERSION) whatsNewSheet();

// Al volver a la app se refresca la vista. Si el turno pasa de medianoche se mantiene
// la fecha de trabajo y la pantalla Hoy muestra un aviso para volver al día actual.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') refresh();
});

window.__ekotek = { state: () => state, ctx, refresh, commit };
