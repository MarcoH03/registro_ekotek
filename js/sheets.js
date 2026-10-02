// Hojas modales: formularios y fichas de detalle.
import { icon } from './icons.js';
import {
  state, save, uid, num, round2, money, fmtDate, fmtDateLong, fmtTime, today, addDays, weekStart, parseDate, norm,
  wh, whName, product, productName, gestor, gestorName, addProduct, addGestor, stockMap, addMovement,
  setStock, syncSaleMovements, saleCalc, itemsSummary, cashMap, cashEntries, CASH_TYPES, gestorLedger,
  gestorStats, weekSummary, parseStockText, applyStockImport, mergeProducts, productInUse, recommendWh,
  nearestWh, hasIncident, replaceState, APP_VERSION,
} from './store.js';
import {
  $, $$, esc, setPath, openSheet, alertBox, confirmBox, promptBox, actionSheet, toast, pickFromList,
  seg, toggle, stepper, section, field, inp, navRow, btnRow, infoRow, emptyRow,
} from './ui.js';
import { ctx, commit, refresh, copyText, shareText } from './core.js';
import { buildWeekly } from './closure.js';

const cur = () => state.settings.currency || 'USD';
const whSeg = (name, value, extra = []) => seg(name, [...extra, ...state.warehouses.map((w) => [w.id, `${w.emoji} ${w.name}`])], value);
const TYPE_LABEL = { recogida: 'Recogida', envio: 'Mensajería', anticipada: 'Compra anticipada' };
export const MOVE_LABEL = {
  venta: 'Venta', entrega: 'Entrega c. anticipada', entrada: 'Entrada', traslado: 'Traslado',
  salida: 'Salida / baja', ajuste: 'Ajuste', conteo: 'Conteo',
};
const signed = (n) => (n > 0 ? '+' : '') + n;

function rememberAsesor(name) {
  const n = (name || '').trim();
  if (n && !state.settings.asesores.includes(n)) state.settings.asesores.push(n);
}

/* ======================= Selectores ======================= */
export function pickProduct(whId = null, selected = null) {
  const st = stockMap();
  const items = [...state.products]
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))
    .map((p) => {
      const q = whId ? st[whId]?.[p.id] || 0 : null;
      return {
        value: p.id,
        label: p.name,
        sub: state.warehouses.map((w) => `${w.name}: ${st[w.id]?.[p.id] || 0}`).join(' · ') + (p.price ? ` · ${money(p.price)}` : ''),
        right: whId ? `<span class="badge ${q > 0 ? 'ok' : 'zero'}">${q}</span>` : '',
      };
    });
  return pickFromList({
    title: 'Producto',
    items,
    selected,
    searchPlaceholder: 'Buscar producto',
    addNew: { label: 'Nuevo producto', handler: (q) => createProductFlow(q) },
  });
}

async function createProductFlow(q = '') {
  const name = await promptBox({ title: 'Nuevo producto', message: 'Nombre del producto', value: q, placeholder: 'Ej. Oupes Mega 1' });
  if (!name || !name.trim()) return null;
  const price = await promptBox({ title: 'Precio de la empresa', message: `Precio de “${name.trim()}” en ${cur()} (sin comisión de gestores)`, inputmode: 'decimal', placeholder: '0' });
  const p = addProduct(name, price || 0);
  commit();
  return p.id;
}

export function pickGestor(selected = null) {
  const items = [...state.gestores]
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))
    .map((g) => {
      const b = gestorStats(g.id).balance;
      return { value: g.id, label: g.name, sub: [g.phone, b ? `pendiente ${money(b)}` : ''].filter(Boolean).join(' · '), right: '' };
    });
  return pickFromList({
    title: 'Gestor',
    items,
    selected,
    searchPlaceholder: 'Buscar por nombre o teléfono',
    addNew: {
      label: 'Nuevo gestor',
      handler: async (q) => {
        const name = await promptBox({ title: 'Nuevo gestor', message: 'Nombre o teléfono del gestor', value: q });
        if (!name || !name.trim()) return null;
        const g = addGestor(name);
        commit();
        return g.id;
      },
    },
  });
}

export function pickMunicipio(selected = '') {
  return pickFromList({
    title: 'Municipio del cliente',
    selected,
    items: state.municipios.map((m) => ({ value: m.name, label: m.name, sub: `Más cerca: ${whName(m.wh)}` })),
    addNew: {
      label: 'Otro lugar',
      handler: async (q) => {
        const n = await promptBox({ title: 'Lugar del cliente', value: q });
        return n && n.trim() ? n.trim() : null;
      },
    },
  });
}

/* ======================= Venta ======================= */
export function saleEditor(existing = null, prefill = {}) {
  const S = state.settings;
  const d = existing
    ? { ...structuredClone(existing), total: String(existing.total), cashAmount: String(existing.cashAmount || ''), totalTouched: true }
    : {
      id: null, date: ctx.date, vale: '', type: 'recogida', wh: state.warehouses[0].id, items: [], total: '',
      totalTouched: false, payMethod: 'efectivo', cashAmount: '', cashWh: null, gestores: [], client: '', phone: '',
      municipio: '', address: '', notes: '', asesor: S.asesor, delivered: false, deliveredDate: '', deliveredWh: null,
      ...prefill,
    };
  const baseOf = () => round2(d.items.reduce((a, i) => a + num(i.qty) * num(i.price), 0));
  const totalOf = () => (d.totalTouched && d.total !== '' ? num(d.total) : baseOf());

  const summary = () => {
    const c = saleCalc({ ...d, total: totalOf() });
    return `
      ${infoRow('Precio de la empresa', money(c.base))}
      ${infoRow('Cobrado al cliente', `<b>${money(c.total)}</b>`)}
      ${infoRow('Sobreprecio (extra)', money(c.extra), c.extra < 0 ? 'warn' : '')}
      ${infoRow('Comisión de gestores', money(c.gest))}
      ${infoRow('Extra para los dueños', money(c.ownerExtra), c.ownerExtra < 0 ? 'warn' : '')}
      ${infoRow('<b>Total para los dueños</b>', `<b>${money(c.owners)}</b>`)}`;
  };

  const render = () => {
    const st = stockMap();
    const near = nearestWh(d.municipio);
    const isCash = d.payMethod !== 'transferencia';
    return `
      ${section('', `
        ${field('Fecha', `<input class="inp" type="date" data-bind="date" value="${d.date}">`)}
        ${field('Nº de vale', inp('vale', d.vale, 'placeholder="Ej. 1532" inputmode="numeric"'))}
      `)}
      <div class="sec-h">Tipo de venta</div>
      <div class="pad">${seg('type', [['recogida', 'Recogida'], ['envio', 'Mensajería'], ['anticipada', 'Anticipada']], d.type)}</div>
      ${d.type === 'anticipada' ? `<div class="sec-f">El cliente paga ahora y recoge después. El stock se descuenta al marcarla como entregada.</div>` : ''}
      <div class="sec-h">Almacén ${d.type === 'anticipada' ? 'donde se reserva' : 'de donde sale'}</div>
      <div class="pad">${whSeg('wh', d.wh)}</div>
      ${near && near !== d.wh ? `<div class="sec-f hint">${icon('pin')} El almacén más cercano al cliente es ${esc(whName(near))}.</div>` : ''}

      <div class="sec-h">Productos</div>
      <div class="list">
        ${d.items.map((it, i) => {
          const q = st[d.wh]?.[it.pid] || 0;
          return `<div class="row item-row">
            <div class="item-top">
              <button class="item-name" data-act="chgItem" data-i="${i}">${esc(productName(it.pid))} ${icon('chevD')}</button>
              <button class="icon-btn red" data-act="rmItem" data-i="${i}" aria-label="Quitar">${icon('x')}</button>
            </div>
            <div class="item-sub">En ${esc(whName(d.wh))}: <b class="${q >= num(it.qty) ? 'ok' : 'bad'}">${q}</b> disponibles</div>
            <div class="item-bottom">
              ${stepper('step', `items.${i}.qty`, it.qty)}
              <label class="price">Precio u. <input class="inp" data-bind="items.${i}.price" value="${esc(it.price)}" inputmode="decimal"></label>
            </div>
          </div>`;
        }).join('')}
        ${btnRow('addItem', 'Añadir producto', { ic: 'plus' })}
      </div>

      ${section('Cobro', `
        ${infoRow('Precio de la empresa', `<span data-base>${money(baseOf())}</span>`)}
        ${field('Cobrado al cliente', inp('total', d.totalTouched ? d.total : '', `inputmode="decimal" placeholder="${baseOf()}"`))}
        <div class="row"><div class="grow">${seg('payMethod', [['efectivo', 'Efectivo'], ['transferencia', 'Transferencia'], ['mixto', 'Mixto']], d.payMethod)}</div></div>
        ${d.payMethod === 'mixto' ? field('Recibido en efectivo', inp('cashAmount', d.cashAmount, 'inputmode="decimal" placeholder="0"')) : ''}
        ${isCash ? `<div class="row col"><span class="lbl small">Caja donde entra el efectivo</span>${whSeg('cashWh', d.cashWh || d.wh)}</div>` : ''}
      `, 'Si el cliente pagó más que el precio de la empresa, la diferencia es el sobreprecio que se reparte entre gestores y dueños.')}

      <div class="sec-h">Comisión de gestores</div>
      <div class="list">
        ${d.gestores.map((g, i) => `
          <div class="row gest-row">
            <button class="item-name grow" data-act="chgGest" data-i="${i}">${esc(gestorName(g.gid))} ${icon('chevD')}</button>
            <input class="inp amt" data-bind="gestores.${i}.amount" value="${esc(g.amount)}" inputmode="decimal" placeholder="0">
            <button class="icon-btn red" data-act="rmGest" data-i="${i}" aria-label="Quitar">${icon('x')}</button>
          </div>`).join('')}
        ${btnRow('addGest', 'Añadir gestor', { ic: 'plus' })}
      </div>

      <div class="sec-h">Reparto del dinero</div>
      <div class="list" data-summary>${summary()}</div>

      ${section('Cliente', `
        ${field('Nombre', inp('client', d.client, `placeholder="${d.type === 'anticipada' ? 'Obligatorio' : 'Opcional'}"`))}
        ${field('Teléfono', inp('phone', d.phone, 'type="tel" inputmode="tel" placeholder="Opcional"'))}
        ${navRow('muni', 'Municipio', { right: esc(d.municipio || 'Elegir') })}
        ${d.type === 'envio' ? field('Dirección', inp('address', d.address, 'placeholder="Dirección de entrega"')) : ''}
      `)}

      ${d.type === 'anticipada' ? section('Entrega', `
        <div class="row"><span class="grow">Ya se entregó al cliente</span>${toggle('delivered', d.delivered)}</div>
        ${d.delivered ? `
          ${field('Fecha de entrega', `<input class="inp" type="date" data-bind="deliveredDate" value="${d.deliveredDate || ctx.date}">`)}
          <div class="row col"><span class="lbl small">Almacén de donde salió</span>${whSeg('deliveredWh', d.deliveredWh || d.wh)}</div>` : ''}
      `) : ''}

      ${section('Otros', `
        ${field('Asesor', inp('asesor', d.asesor, 'placeholder="Nombre del asesor"'))}
        <div class="row"><textarea class="ta" data-bind="notes" rows="2" placeholder="Notas">${esc(d.notes)}</textarea></div>
      `)}
      <div class="spacer"></div>`;
  };

  const updateSummary = (s) => {
    const box = $('[data-summary]', s.body);
    if (box) box.innerHTML = summary();
    const base = $('[data-base]', s.body);
    if (base) base.textContent = money(baseOf());
    const t = $('[data-bind="total"]', s.body);
    if (t) t.placeholder = baseOf();
  };

  openSheet({
    title: existing ? 'Editar venta' : 'Nueva venta',
    left: { label: 'Cancelar' },
    right: { label: 'Guardar', act: 'save', bold: true },
    dismissable: false,
    render,
    onInput: (s, el, ev) => {
      const b = el.dataset.bind;
      if (!b) return;
      const v = el.type === 'checkbox' ? el.checked : el.value;
      setPath(d, b, v);
      if (b === 'total') d.totalTouched = el.value !== '';
      if (el.type === 'checkbox' || (el.type === 'date' && ev.type === 'change')) s.render();
      else updateSummary(s);
    },
    acts: {
      seg: (el, ev, s) => {
        d[el.dataset.name] = el.dataset.v;
        s.render();
      },
      step: (el, ev, s) => {
        const path = el.dataset.path.split('.');
        const it = d.items[+path[1]];
        it.qty = Math.max(1, num(it.qty) + Number(el.dataset.d));
        s.render();
      },
      addItem: async (el, ev, s) => {
        const pid = await pickProduct(d.wh);
        if (!pid) return;
        const ex = d.items.find((i) => i.pid === pid);
        if (ex) ex.qty = num(ex.qty) + 1;
        else d.items.push({ pid, qty: 1, price: product(pid)?.price || 0 });
        s.render();
      },
      chgItem: async (el, ev, s) => {
        const it = d.items[+el.dataset.i];
        const pid = await pickProduct(d.wh, it.pid);
        if (!pid) return;
        it.pid = pid;
        it.price = product(pid)?.price || it.price;
        s.render();
      },
      rmItem: (el, ev, s) => {
        d.items.splice(+el.dataset.i, 1);
        s.render();
      },
      addGest: async (el, ev, s) => {
        const gid = await pickGestor();
        if (!gid) return;
        const c = saleCalc({ ...d, total: totalOf() });
        d.gestores.push({ gid, amount: c.ownerExtra > 0 ? String(c.ownerExtra) : '' });
        s.render();
      },
      chgGest: async (el, ev, s) => {
        const g = d.gestores[+el.dataset.i];
        const gid = await pickGestor(g.gid);
        if (gid) g.gid = gid;
        s.render();
      },
      rmGest: (el, ev, s) => {
        d.gestores.splice(+el.dataset.i, 1);
        s.render();
      },
      muni: async (el, ev, s) => {
        const m = await pickMunicipio(d.municipio);
        if (m == null) return;
        d.municipio = m;
        if (!existing && !d.items.length) d.wh = nearestWh(m) || d.wh;
        s.render();
      },
      save: async (el, ev, s) => {
        const items = d.items.filter((i) => i.pid && num(i.qty) > 0);
        if (!items.length) return alertBox({ title: 'Faltan productos', message: 'Añade al menos un producto a la venta.' });
        if (d.type === 'anticipada' && !d.client.trim()) return alertBox({ title: 'Falta el cliente', message: 'En una compra anticipada indica el nombre del cliente.' });
        const vale = String(d.vale || '').trim();
        if (!vale) {
          if (!(await confirmBox('Sin número de vale', '¿Guardar la venta sin número de vale?', 'Guardar'))) return;
        } else {
          const dup = state.sales.find((x) => x.id !== d.id && !x.void && String(x.vale).trim() === vale);
          if (dup && !(await confirmBox('Vale repetido', `Ya hay una venta con el vale ${vale} (${fmtDate(dup.date)}). ¿Guardar igualmente?`, 'Guardar'))) return;
        }
        const deducts = d.type !== 'anticipada' || d.delivered;
        if (deducts) {
          const whId = d.type === 'anticipada' ? d.deliveredWh || d.wh : d.wh;
          const st = stockMap();
          const own = {};
          if (d.id) for (const m of state.movements) if (m.ref === d.id && m.wh === whId) own[m.pid] = (own[m.pid] || 0) - m.qty;
          const need = {};
          items.forEach((i) => (need[i.pid] = (need[i.pid] || 0) + num(i.qty)));
          const short = Object.entries(need)
            .map(([pid, q]) => [pid, q, (st[whId]?.[pid] || 0) + (own[pid] || 0)])
            .filter(([, q, have]) => have < q);
          if (short.length) {
            const msg = short.map(([pid, q, have]) => `${productName(pid)}: hay ${have}, se venden ${q}`).join('\n');
            if (!(await confirmBox('Stock insuficiente', `${msg}\n\n¿Registrar la venta igualmente en ${whName(whId)}?`, 'Registrar'))) return;
          }
        }
        const sale = {
          id: d.id || uid(),
          ts: existing?.ts || Date.now(),
          date: d.date || ctx.date,
          vale,
          type: d.type,
          wh: d.wh,
          items: items.map((i) => ({ pid: i.pid, qty: num(i.qty), price: num(i.price) })),
          total: totalOf(),
          payMethod: d.payMethod,
          cashAmount: d.payMethod === 'mixto' ? num(d.cashAmount) : 0,
          cashWh: d.cashWh || d.wh,
          gestores: d.gestores.filter((g) => g.gid).map((g) => ({ gid: g.gid, amount: num(g.amount) })),
          client: d.client.trim(),
          phone: d.phone.trim(),
          municipio: d.municipio,
          address: (d.address || '').trim(),
          notes: d.notes.trim(),
          asesor: (d.asesor || '').trim() || S.asesor,
          delivered: d.type === 'anticipada' ? !!d.delivered : false,
          deliveredDate: d.type === 'anticipada' && d.delivered ? d.deliveredDate || ctx.date : '',
          deliveredWh: d.type === 'anticipada' && d.delivered ? d.deliveredWh || d.wh : null,
          void: existing?.void || false,
        };
        for (const it of sale.items) {
          const p = product(it.pid);
          if (p && !num(p.price) && it.price) p.price = it.price;
        }
        rememberAsesor(sale.asesor);
        const idx = state.sales.findIndex((x) => x.id === sale.id);
        if (idx >= 0) state.sales[idx] = sale;
        else state.sales.push(sale);
        syncSaleMovements(sale);
        commit();
        s.close();
        toast(existing ? 'Venta actualizada' : 'Venta registrada');
      },
    },
  });
}

export function saleDetail(id) {
  openSheet({
    title: 'Venta',
    live: true,
    right: { label: 'Editar', act: 'edit' },
    render: (s) => {
      const v = state.sales.find((x) => x.id === id);
      if (!v) {
        setTimeout(() => s.close());
        return '';
      }
      const c = saleCalc(v);
      const pending = v.type === 'anticipada' && !v.delivered;
      return `
        <div class="hero-card ${v.void ? 'void' : ''}">
          <div class="hero-amount">${money(c.total)}</div>
          <div class="hero-meta">${v.vale ? `Vale <b>${esc(v.vale)}</b> · ` : ''}${TYPE_LABEL[v.type]} · ${esc(wh(v.wh)?.emoji || '')} ${esc(whName(v.wh))}</div>
          <div class="hero-meta">${fmtDateLong(v.date)} · ${fmtTime(v.ts)}</div>
          ${v.void ? '<span class="pill red">ANULADA</span>' : pending ? '<span class="pill orange">Pendiente de entrega</span>' : v.type === 'anticipada' ? `<span class="pill green">Entregada ${fmtDate(v.deliveredDate)} · ${esc(whName(v.deliveredWh || v.wh))}</span>` : ''}
        </div>
        ${section('Productos', v.items.map((it) => infoRow(`${it.qty} × ${esc(productName(it.pid))}`, money(it.qty * it.price))).join(''))}
        ${section('Cobro', `
          ${infoRow('Precio de la empresa', money(c.base))}
          ${infoRow('Cobrado al cliente', money(c.total))}
          ${infoRow('Sobreprecio', money(c.extra))}
          ${infoRow('Método de pago', { efectivo: 'Efectivo', transferencia: 'Transferencia', mixto: `Mixto (${money(c.cash)} en efectivo)` }[v.payMethod])}
          ${c.cash ? infoRow('Caja', esc(whName(v.cashWh || v.wh))) : ''}`)}
        ${section('Reparto', `
          ${v.gestores.map((g) => navRow('openGestor', esc(gestorName(g.gid)), { right: money(g.amount), attrs: `data-id="${g.gid}"`, sub: 'Gestor' })).join('')}
          ${infoRow('Extra para los dueños', money(c.ownerExtra))}
          ${infoRow('<b>Total para los dueños</b>', `<b>${money(c.owners)}</b>`)}`)}
        ${v.client || v.phone || v.municipio || v.address ? section('Cliente', `
          ${v.client ? infoRow('Nombre', esc(v.client)) : ''}
          ${v.phone ? `<a class="row info" href="tel:${esc(v.phone)}"><span class="grow">Teléfono</span><span class="r link">${esc(v.phone)}</span></a>` : ''}
          ${v.municipio ? infoRow('Municipio', esc(v.municipio)) : ''}
          ${v.address ? infoRow('Dirección', esc(v.address)) : ''}`) : ''}
        ${section('', `${infoRow('Asesor', esc(v.asesor || '—'))}${v.notes ? `<div class="row note">${esc(v.notes)}</div>` : ''}`)}
        <div class="list">
          ${pending && !v.void ? btnRow('deliver', 'Marcar como entregada', { ic: 'check' }) : ''}
          ${v.type === 'anticipada' && v.delivered && !v.void ? btnRow('undeliver', 'Volver a pendiente de entrega', { ic: 'refresh' }) : ''}
          ${btnRow('toggleVoid', v.void ? 'Restaurar venta' : 'Anular venta', { ic: v.void ? 'refresh' : 'x', cls: v.void ? '' : 'orange' })}
          ${btnRow('del', 'Eliminar venta', { ic: 'trash', cls: 'red' })}
        </div>
        <div class="spacer"></div>`;
    },
    acts: {
      edit: (el, ev, s) => {
        const v = state.sales.find((x) => x.id === id);
        if (v) saleEditor(v);
      },
      openGestor: (el) => gestorSheet(el.dataset.id),
      deliver: async () => {
        const v = state.sales.find((x) => x.id === id);
        const w = await actionSheet({
          title: '¿De qué almacén sale?',
          message: `Se descontará el stock con fecha ${fmtDate(ctx.date)}.`,
          actions: state.warehouses.map((x) => ({ label: `${x.emoji} ${x.name}${x.id === v.wh ? ' (reservado aquí)' : ''}`, value: x.id })),
        });
        if (!w) return;
        Object.assign(v, { delivered: true, deliveredDate: ctx.date, deliveredWh: w });
        syncSaleMovements(v);
        commit();
        toast('Entregada');
      },
      undeliver: () => {
        const v = state.sales.find((x) => x.id === id);
        Object.assign(v, { delivered: false, deliveredDate: '', deliveredWh: null });
        syncSaleMovements(v);
        commit();
      },
      toggleVoid: async () => {
        const v = state.sales.find((x) => x.id === id);
        if (!v.void && !(await confirmBox('Anular venta', 'La venta quedará registrada como anulada y el stock y el dinero se devolverán.', 'Anular', true))) return;
        v.void = !v.void;
        syncSaleMovements(v);
        commit();
      },
      del: async (el, ev, s) => {
        if (!(await confirmBox('Eliminar venta', 'Se borrará por completo. Esta acción no se puede deshacer.', 'Eliminar', true))) return;
        const v = state.sales.find((x) => x.id === id);
        v.void = true;
        syncSaleMovements(v);
        state.sales = state.sales.filter((x) => x.id !== id);
        s.close();
        commit();
        toast('Venta eliminada', 'trash');
      },
    },
  });
}

/* ======================= Productos ======================= */
export function productSheet(pid) {
  openSheet({
    title: (s) => productName(pid),
    live: true,
    right: { label: 'Editar', act: 'edit' },
    render: (s) => {
      const p = product(pid);
      if (!p) {
        setTimeout(() => s.close());
        return '';
      }
      const st = stockMap();
      const moves = state.movements.filter((m) => m.pid === pid).sort((a, b) => b.date.localeCompare(a.date) || b.ts - a.ts).slice(0, 60);
      const total = state.warehouses.reduce((a, w) => a + (st[w.id]?.[pid] || 0), 0);
      return `
        <div class="hero-card">
          <div class="hero-amount">${total} <small>uds.</small></div>
          <div class="hero-meta">Precio de la empresa: <b>${money(p.price)}</b></div>
          ${p.aliases?.length ? `<div class="hero-meta small">También: ${esc(p.aliases.join(', '))}</div>` : ''}
        </div>
        ${section('Stock por almacén', state.warehouses.map((w) => navRow('whRow', `${w.emoji} ${esc(w.name)}`, {
          right: `${hasIncident(w.id, pid) ? `<span class="pill orange sm">Incidencia</span> ` : ''}<b class="${(st[w.id]?.[pid] || 0) < 0 ? 'bad' : ''}">${st[w.id]?.[pid] || 0}</b>`,
          attrs: `data-wh="${w.id}"`,
        })).join(''), 'Toca un almacén para ajustar la cantidad o reportar una incidencia.')}
        <div class="list">
          ${btnRow('entrada', 'Entrada de mercancía', { ic: 'inbox' })}
          ${btnRow('traslado', 'Trasladar entre almacenes', { ic: 'swap' })}
          ${btnRow('merge', 'Fusionar con otro producto', { ic: 'merge' })}
          ${btnRow('del', 'Eliminar producto', { ic: 'trash', cls: 'red' })}
        </div>
        ${section('Historial de movimientos', moves.length ? moves.map((m) => `
          <div class="row info"><span class="grow"><span class="t">${MOVE_LABEL[m.type] || m.type} · ${esc(whName(m.wh))}</span><span class="s">${fmtDate(m.date)}${m.note ? ' · ' + esc(m.note) : ''}</span></span><span class="r ${m.qty < 0 ? 'bad' : 'ok'}">${signed(m.qty)}</span></div>`).join('') : emptyRow('Sin movimientos'))}
        <div class="spacer"></div>`;
    },
    acts: {
      edit: () => productEditor(pid),
      whRow: async (el) => {
        const w = wh(el.dataset.wh);
        const a = await actionSheet({
          title: `${productName(pid)} · ${w.name}`,
          actions: [
            { label: 'Ajustar cantidad', value: 'adj' },
            { label: 'Reportar incidencia', value: 'inc' },
          ],
        });
        if (a === 'adj') adjustStockFlow(w.id, pid);
        if (a === 'inc') incidentEditor(null, { wh: w.id, pid });
      },
      entrada: () => moveEditor('entrada', [{ pid, qty: 1 }]),
      traslado: () => moveEditor('traslado', [{ pid, qty: 1 }]),
      merge: async (el, ev, s) => {
        const into = await pickFromList({
          title: 'Fusionar con…',
          items: state.products.filter((p) => p.id !== pid).map((p) => ({ value: p.id, label: p.name })),
        });
        if (!into) return;
        if (!(await confirmBox('Fusionar productos', `“${productName(pid)}” pasará a ser “${productName(into)}”. Se unirán su stock, ventas e incidencias.`, 'Fusionar'))) return;
        mergeProducts(pid, into);
        s.close();
        commit();
        productSheet(into);
        toast('Productos fusionados');
      },
      del: async (el, ev, s) => {
        if (productInUse(pid)) {
          return alertBox({ title: 'No se puede eliminar', message: 'Este producto tiene ventas o movimientos. Si está repetido, usa “Fusionar con otro producto”.' });
        }
        if (!(await confirmBox('Eliminar producto', `¿Eliminar “${productName(pid)}”?`, 'Eliminar', true))) return;
        state.products = state.products.filter((p) => p.id !== pid);
        s.close();
        commit();
      },
    },
  });
}

export async function adjustStockFlow(whId, pid) {
  const curQ = stockMap()[whId]?.[pid] || 0;
  const v = await promptBox({ title: 'Ajustar cantidad', message: `${productName(pid)} en ${whName(whId)}. Ahora: ${curQ}`, value: String(curQ), inputmode: 'numeric' });
  if (v == null || v === '') return;
  const target = Math.round(num(v));
  if (target === curQ) return;
  const reason = await promptBox({ title: 'Motivo del ajuste', message: 'Opcional', placeholder: 'Ej. error en el conteo' });
  setStock(whId, pid, target, ctx.date, 'ajuste', reason || '');
  commit();
  toast('Stock ajustado');
}

export function productEditor(pid = null) {
  const p = pid ? product(pid) : null;
  const d = { name: p?.name || '', price: p ? String(p.price || '') : '', aliases: (p?.aliases || []).join(', '), stock: {} };
  openSheet({
    title: p ? 'Editar producto' : 'Nuevo producto',
    left: { label: 'Cancelar' },
    right: { label: 'Guardar', act: 'save', bold: true },
    dismissable: false,
    render: () => `
      ${section('', `
        ${field('Nombre', inp('name', d.name, 'placeholder="Ej. Ecoflow Delta 3"'))}
        ${field(`Precio (${cur()})`, inp('price', d.price, 'inputmode="decimal" placeholder="0"'))}
      `, 'Precio de la empresa, sin la comisión de los gestores.')}
      ${section('Otros nombres', `<div class="row"><input class="inp left" data-bind="aliases" value="${esc(d.aliases)}" placeholder="Separados por comas"></div>`, 'Sirven para reconocer el producto al importar un cierre (ej. “Bluetty, Bluebety”).')}
      ${!p ? section('Stock inicial', state.warehouses.map((w) => field(`${w.emoji} ${esc(w.name)}`, inp(`stock.${w.id}`, d.stock[w.id] || '', 'inputmode="numeric" placeholder="0"'))).join('')) : ''}`,
    onInput: (s, el) => el.dataset.bind && setPath(d, el.dataset.bind, el.value),
    acts: {
      save: async (el, ev, s) => {
        if (!d.name.trim()) return alertBox({ title: 'Falta el nombre' });
        const dup = state.products.find((x) => x.id !== pid && norm(x.name) === norm(d.name));
        if (dup) return alertBox({ title: 'Ya existe', message: `Ya hay un producto llamado “${dup.name}”.` });
        const target = p || addProduct(d.name);
        target.name = d.name.trim();
        target.price = num(d.price);
        target.aliases = d.aliases.split(',').map((x) => x.trim()).filter(Boolean);
        if (!p) for (const w of state.warehouses) if (num(d.stock[w.id])) addMovement({ date: ctx.date, type: 'entrada', wh: w.id, pid: target.id, qty: Math.round(num(d.stock[w.id])), note: 'Stock inicial' });
        commit();
        s.close();
        toast('Producto guardado');
      },
    },
  });
}

export function catalogSheet() {
  openSheet({
    title: 'Catálogo de productos',
    live: true,
    right: { label: 'Añadir', act: 'add' },
    data: { q: '' },
    render: (s) => {
      const st = stockMap();
      const list = [...state.products].sort((a, b) => a.name.localeCompare(b.name, 'es'));
      return `
        ${section(`${list.length} productos`, list.length ? list.map((p) => navRow('open', esc(p.name), {
          right: money(p.price),
          sub: state.warehouses.map((w) => `${w.name}: ${st[w.id]?.[p.id] || 0}`).join(' · '),
          attrs: `data-id="${p.id}"`,
        })).join('') : emptyRow('No hay productos'), 'Toca un producto para ver su ficha, cambiar el precio o fusionarlo si está repetido.')}
        <div class="spacer"></div>`;
    },
    acts: { add: () => productEditor(), open: (el) => productSheet(el.dataset.id) },
  });
}

/* ======================= Movimientos de inventario ======================= */
export function moveEditor(kind = 'entrada', items = []) {
  const d = { kind, wh: state.warehouses[0].id, toWh: state.warehouses[1]?.id, date: ctx.date, items: items.map((i) => ({ ...i })), note: '' };
  const TITLES = { entrada: 'Entrada de mercancía', traslado: 'Traslado', salida: 'Salida / baja' };
  openSheet({
    title: () => TITLES[d.kind],
    left: { label: 'Cancelar' },
    right: { label: 'Guardar', act: 'save', bold: true },
    dismissable: false,
    render: () => {
      const st = stockMap();
      return `
        <div class="pad">${seg('kind', [['entrada', 'Entrada'], ['traslado', 'Traslado'], ['salida', 'Salida']], d.kind)}</div>
        <div class="sec-f">${{ entrada: 'Mercancía nueva que llega a un almacén.', traslado: 'Mover productos de un almacén a otro.', salida: 'Productos que salen sin venta (rotura, devolución, garantía…).' }[d.kind]}</div>
        <div class="sec-h">${d.kind === 'traslado' ? 'Desde' : 'Almacén'}</div>
        <div class="pad">${whSeg('wh', d.wh)}</div>
        ${d.kind === 'traslado' ? `<div class="sec-h">Hacia</div><div class="pad">${whSeg('toWh', d.toWh)}</div>` : ''}
        <div class="sec-h">Productos</div>
        <div class="list">
          ${d.items.map((it, i) => `
            <div class="row item-row">
              <div class="item-top">
                <button class="item-name" data-act="chgItem" data-i="${i}">${esc(productName(it.pid))} ${icon('chevD')}</button>
                <button class="icon-btn red" data-act="rmItem" data-i="${i}">${icon('x')}</button>
              </div>
              <div class="item-bottom">
                <span class="item-sub">En ${esc(whName(d.wh))}: ${st[d.wh]?.[it.pid] || 0}</span>
                ${stepper('step', `items.${i}.qty`, it.qty)}
              </div>
            </div>`).join('')}
          ${btnRow('addItem', 'Añadir producto', { ic: 'plus' })}
        </div>
        ${section('', `
          ${field('Fecha', `<input class="inp" type="date" data-bind="date" value="${d.date}">`)}
          <div class="row"><textarea class="ta" data-bind="note" rows="2" placeholder="Nota (opcional)">${esc(d.note)}</textarea></div>`)}
        <div class="spacer"></div>`;
    },
    onInput: (s, el) => el.dataset.bind && setPath(d, el.dataset.bind, el.value),
    acts: {
      seg: (el, ev, s) => {
        d[el.dataset.name] = el.dataset.v;
        s.render();
      },
      step: (el, ev, s) => {
        const it = d.items[+el.dataset.path.split('.')[1]];
        it.qty = Math.max(1, num(it.qty) + Number(el.dataset.d));
        s.render();
      },
      addItem: async (el, ev, s) => {
        const pid = await pickProduct(d.wh);
        if (!pid) return;
        const ex = d.items.find((i) => i.pid === pid);
        if (ex) ex.qty++;
        else d.items.push({ pid, qty: 1 });
        s.render();
      },
      chgItem: async (el, ev, s) => {
        const it = d.items[+el.dataset.i];
        const pid = await pickProduct(d.wh, it.pid);
        if (pid) it.pid = pid;
        s.render();
      },
      rmItem: (el, ev, s) => {
        d.items.splice(+el.dataset.i, 1);
        s.render();
      },
      save: async (el, ev, s) => {
        if (!d.items.length) return alertBox({ title: 'Añade al menos un producto' });
        if (d.kind === 'traslado' && d.wh === d.toWh) return alertBox({ title: 'Elige almacenes distintos' });
        if (d.kind !== 'entrada') {
          const st = stockMap();
          const short = d.items.filter((i) => (st[d.wh]?.[i.pid] || 0) < i.qty);
          if (short.length && !(await confirmBox('Stock insuficiente', short.map((i) => `${productName(i.pid)}: hay ${st[d.wh]?.[i.pid] || 0}`).join('\n') + '\n\n¿Continuar igualmente?', 'Continuar'))) return;
        }
        const group = uid();
        const note = d.note.trim();
        for (const it of d.items) {
          if (d.kind === 'entrada') addMovement({ date: d.date, type: 'entrada', wh: d.wh, pid: it.pid, qty: it.qty, note });
          if (d.kind === 'salida') addMovement({ date: d.date, type: 'salida', wh: d.wh, pid: it.pid, qty: -it.qty, note });
          if (d.kind === 'traslado') {
            addMovement({ date: d.date, type: 'traslado', wh: d.wh, pid: it.pid, qty: -it.qty, group, note: `Hacia ${whName(d.toWh)}${note ? ' · ' + note : ''}` });
            addMovement({ date: d.date, type: 'traslado', wh: d.toWh, pid: it.pid, qty: it.qty, group, note: `Desde ${whName(d.wh)}${note ? ' · ' + note : ''}` });
          }
        }
        commit();
        s.close();
        toast(TITLES[d.kind] + ' guardada');
      },
    },
  });
}

/* ======================= Conteo de inventario ======================= */
export function countSheet(whId = null) {
  const d = { wh: whId || state.warehouses[0].id, counts: {}, showAll: false, makeInc: true, q: '' };
  const expected = (pid) => stockMap()[d.wh]?.[pid] || 0;
  const counts = () => (d.counts[d.wh] = d.counts[d.wh] || {});
  const diffOf = (pid) => {
    const v = counts()[pid];
    return v === undefined || v === '' ? 0 : Math.round(num(v)) - expected(pid);
  };
  const rowHtml = (p) => {
    const v = counts()[p.id];
    const df = diffOf(p.id);
    return `
      <div class="row count-row ${df ? 'diff' : ''}" data-row="${p.id}">
        <span class="grow"><span class="t">${esc(p.name)}</span><span class="s">Sistema: ${expected(p.id)} <b class="cdiff">${df ? `(${signed(df)})` : ''}</b></span></span>
        <div class="stepper inline">
          <button data-act="cstep" data-pid="${p.id}" data-d="-1">${icon('minus')}</button>
          <input class="cnt" data-count="${p.id}" inputmode="numeric" value="${esc(v ?? '')}" placeholder="${expected(p.id)}">
          <button data-act="cstep" data-pid="${p.id}" data-d="1">${icon('plus')}</button>
        </div>
      </div>`;
  };
  const listHtml = () => {
    const st = stockMap()[d.wh] || {};
    const q = norm(d.q);
    const list = state.products.filter((p) => (d.showAll || st[p.id] || counts()[p.id] !== undefined) && (!q || norm(p.name).includes(q)));
    return list.length ? list.map(rowHtml).join('') : emptyRow(state.products.length ? 'Nada que mostrar. Activa “Mostrar todos”.' : 'Aún no hay productos.');
  };
  const summaryHtml = () => {
    const n = Object.keys(counts()).filter((pid) => diffOf(pid)).length;
    return n ? `<span class="bad">${n} producto${n > 1 ? 's' : ''} con diferencias</span>` : 'Sin diferencias por ahora';
  };
  const last = () => state.counts.filter((c) => c.wh === d.wh).sort((a, b) => b.ts - a.ts)[0];
  openSheet({
    title: 'Conteo',
    left: { label: 'Cancelar' },
    right: { label: 'Guardar', act: 'save', bold: true },
    dismissable: false,
    render: () => `
      <div class="pad">${whSeg('wh', d.wh)}</div>
      <div class="sec-f">Escribe lo que cuentas físicamente. Las casillas vacías se consideran correctas. ${last() ? `Último conteo aquí: ${fmtDate(last().date)} ${fmtTime(last().ts)}.` : ''}</div>
      <div class="searchbar">${icon('search')}<input type="search" data-q placeholder="Buscar producto" value="${esc(d.q)}"></div>
      <div class="list" data-list>${listHtml()}</div>
      <div class="list">
        <div class="row"><span class="grow">Mostrar todos los productos</span>${toggle('showAll', d.showAll)}</div>
        <div class="row"><span class="grow">Crear incidencias por diferencias</span>${toggle('makeInc', d.makeInc)}</div>
      </div>
      <div class="sec-f" data-sum>${summaryHtml()}</div>
      <div class="pad"><button class="btn-primary" data-act="allOk">${icon('check')} Todo coincide con el sistema</button></div>
      <div class="spacer"></div>`,
    onInput: (s, el, ev) => {
      if (el.matches('[data-q]')) {
        if (ev.type !== 'input') return;
        d.q = el.value;
        $('[data-list]', s.body).innerHTML = listHtml();
        return;
      }
      if (el.dataset.count) {
        counts()[el.dataset.count] = el.value;
        updRow(s, el.dataset.count);
        return;
      }
      if (el.dataset.bind) {
        d[el.dataset.bind] = el.checked;
        if (el.dataset.bind === 'showAll') $('[data-list]', s.body).innerHTML = listHtml();
      }
    },
    acts: {
      seg: (el, ev, s) => {
        d.wh = el.dataset.v;
        s.render();
      },
      cstep: (el, ev, s) => {
        const pid = el.dataset.pid;
        const v = counts()[pid];
        const base = v === undefined || v === '' ? expected(pid) : Math.round(num(v));
        counts()[pid] = String(Math.max(0, base + Number(el.dataset.d)));
        $(`[data-count="${pid}"]`, s.body).value = counts()[pid];
        updRow(s, pid);
      },
      allOk: (el, ev, s) => save(s, true),
      save: (el, ev, s) => save(s, false),
    },
  });
  function updRow(s, pid) {
    const row = $(`[data-row="${pid}"]`, s.body);
    const df = diffOf(pid);
    row.classList.toggle('diff', !!df);
    $('.cdiff', row).textContent = df ? `(${signed(df)})` : '';
    $('[data-sum]', s.body).innerHTML = summaryHtml();
  }
  async function save(s, allOk) {
    const results = [];
    for (const w of state.warehouses) {
      const c = d.counts[w.id];
      if ((!c || allOk) && w.id !== d.wh) continue;
      const diffs = [];
      for (const pid of Object.keys(c || {})) {
        if (c[pid] === '' || allOk) continue;
        const exp = stockMap()[w.id]?.[pid] || 0;
        const df = Math.round(num(c[pid])) - exp;
        if (!df) continue;
        diffs.push({ pid, exp, counted: exp + df, diff: df });
      }
      results.push({ wh: w.id, diffs });
    }
    const nDiff = results.reduce((a, r) => a + r.diffs.length, 0);
    if (nDiff && !(await confirmBox('Guardar conteo', `Se ajustará el stock en ${nDiff} producto${nDiff > 1 ? 's' : ''} para que coincida con lo contado.`, 'Guardar'))) return;
    for (const r of results) {
      for (const x of r.diffs) {
        addMovement({ date: ctx.date, type: 'conteo', wh: r.wh, pid: x.pid, qty: x.diff, note: `Sistema ${x.exp}, contado ${x.counted}` });
        if (d.makeInc) {
          const w = wh(r.wh);
          state.incidents.push({
            id: uid(), date: ctx.date, ts: Date.now(), wh: r.wh, pid: x.pid, status: 'abierta',
            text: x.diff < 0
              ? `En el ${w.name} había ${x.exp} ${productName(x.pid)} según el último registro y ahora hay ${x.counted} (falta${-x.diff > 1 ? 'n' : ''} ${-x.diff})`
              : `En el ${w.name} había ${x.exp} ${productName(x.pid)} según el último registro y ahora hay ${x.counted} (sobra${x.diff > 1 ? 'n' : ''} ${x.diff})`,
          });
        }
      }
      state.counts.push({ id: uid(), date: ctx.date, ts: Date.now(), wh: r.wh, diffs: r.diffs });
    }
    commit();
    s.close();
    toast(nDiff ? `Conteo guardado · ${nDiff} diferencia${nDiff > 1 ? 's' : ''}` : 'Conteo guardado · todo coincide');
  }
}

/* ======================= Importar stock desde un cierre ======================= */
export function importSheet() {
  const d = { text: '', parsed: null, zeroOthers: true, makeInc: true };
  openSheet({
    title: 'Importar inventario',
    left: { label: 'Cancelar' },
    right: (s) => (d.parsed ? { label: 'Aplicar', act: 'apply', bold: true } : { label: 'Analizar', act: 'parse', bold: true }),
    dismissable: false,
    render: () => {
      if (!d.parsed) {
        return `
          <div class="sec-f">Copia el último cierre general desde WhatsApp y pégalo aquí. Se leerá la sección <b>📦 EN STOCK</b> de cada almacén.</div>
          <div class="list"><div class="row"><textarea class="ta big" data-bind="text" rows="14" placeholder="📦 *EN STOCK*&#10;&#10;🏠 CERRO&#10;- 1 Ecoflow River 2 Pro&#10;- 4 Ecoflow Delta 3 (Incidencia)&#10;…&#10;&#10;🏡 LA LISA&#10;- 7-Bluetty&#10;…">${esc(d.text)}</textarea></div></div>
          <div class="pad"><button class="btn-secondary" data-act="paste">${icon('copy')} Pegar desde el portapapeles</button></div>`;
      }
      const whs = Object.keys(d.parsed);
      if (!whs.length) {
        return `<div class="empty-card">${icon('alert')}<p>No se encontraron almacenes ni productos. Comprueba que el texto incluye los títulos de los almacenes (${state.warehouses.map((w) => esc(w.stockTitle)).join(', ')}).</p><button class="btn-secondary" data-act="back">Volver</button></div>`;
      }
      return `
        ${whs.map((w) => section(`${esc(wh(w).emoji)} ${esc(wh(w).name)} · ${d.parsed[w].reduce((a, x) => a + x.qty, 0)} uds.`, d.parsed[w].map((x) => `
          <div class="row info"><span class="grow"><span class="t">${esc(x.name)}${x.inc ? ' <span class="pill orange sm">Incidencia</span>' : ''}</span><span class="s">${x.match ? `Existe: ${esc(x.match.name)}` : '<span class="ok">Producto nuevo</span>'}</span></span><span class="r"><b>${x.qty}</b></span></div>`).join(''))).join('')}
        ${section('Opciones', `
          <div class="row"><span class="grow">Poner a 0 lo que no aparece</span>${toggle('zeroOthers', d.zeroOthers)}</div>
          <div class="row"><span class="grow">Crear incidencias marcadas</span>${toggle('makeInc', d.makeInc)}</div>`, 'Al aplicar, el stock de cada almacén quedará igual que en el texto pegado.')}
        <div class="pad"><button class="btn-secondary" data-act="back">Editar el texto</button></div>
        <div class="spacer"></div>`;
    },
    onInput: (s, el) => {
      const b = el.dataset.bind;
      if (!b) return;
      d[b] = el.type === 'checkbox' ? el.checked : el.value;
    },
    acts: {
      paste: async (el, ev, s) => {
        try {
          d.text = await navigator.clipboard.readText();
          s.render();
        } catch {
          toast('Mantén pulsado el cuadro y elige Pegar', 'alert');
        }
      },
      parse: (el, ev, s) => {
        d.parsed = parseStockText(d.text);
        s.render();
      },
      back: (el, ev, s) => {
        d.parsed = null;
        s.render();
      },
      apply: async (el, ev, s) => {
        if (!(await confirmBox('Aplicar inventario', 'El stock de los almacenes leídos se ajustará a estas cantidades.', 'Aplicar'))) return;
        const r = applyStockImport(d.parsed, { date: ctx.date, zeroOthers: d.zeroOthers, makeIncidents: d.makeInc });
        commit();
        s.close();
        toast(`Importado · ${r.created} productos nuevos`);
      },
    },
  });
}

/* ======================= ¿Dónde buscar? ======================= */
export function finderSheet() {
  const d = { items: [], municipio: '' };
  openSheet({
    title: '¿Dónde buscar?',
    render: () => {
      const r = recommendWh(d.items, d.municipio);
      const near = nearestWh(d.municipio);
      return `
        <div class="sec-f">Indica qué pide el cliente y dónde vive para saber de qué almacén conviene sacarlo.</div>
        <div class="sec-h">Pedido</div>
        <div class="list">
          ${d.items.map((it, i) => `
            <div class="row item-row">
              <div class="item-top">
                <button class="item-name" data-act="chgItem" data-i="${i}">${esc(productName(it.pid))} ${icon('chevD')}</button>
                <button class="icon-btn red" data-act="rmItem" data-i="${i}">${icon('x')}</button>
              </div>
              <div class="item-bottom"><span></span>${stepper('step', `items.${i}.qty`, it.qty)}</div>
            </div>`).join('')}
          ${btnRow('addItem', 'Añadir producto', { ic: 'plus' })}
        </div>
        ${section('Cliente', navRow('muni', 'Municipio', { right: esc(d.municipio || 'Elegir'), ic: 'pin', color: 'indigo' }))}
        ${d.items.length ? `
          <div class="sec-h">Disponibilidad</div>
          <div class="list">
            <div class="row avail head"><span class="grow"></span>${state.warehouses.map((w) => `<span class="col-w">${w.emoji} ${esc(w.name)}${w.id === near ? ' 📍' : ''}</span>`).join('')}</div>
            ${r.rows.map((x) => `<div class="row avail"><span class="grow">${x.qty} × ${esc(productName(x.pid))}</span>${state.warehouses.map((w) => `<span class="col-w ${x.stock[w.id] >= x.qty ? 'ok' : 'bad'}">${x.stock[w.id]}</span>`).join('')}</div>`).join('')}
          </div>
          <div class="reco ${r.best ? 'good' : 'bad'}">
            ${r.best ? `<div class="reco-t">${icon('check')} Buscar en ${esc(wh(r.best).emoji)} ${esc(whName(r.best))}</div>` : `<div class="reco-t">${icon('alert')} Sin un almacén completo</div>`}
            <p>${esc(r.reason)}${!d.municipio ? ' Elige el municipio para tener en cuenta la cercanía.' : ''}</p>
          </div>
          <div class="pad"><button class="btn-primary" data-act="toSale">${icon('bag')} Registrar venta con este pedido</button></div>` : ''}
        <div class="spacer"></div>`;
    },
    acts: {
      step: (el, ev, s) => {
        const it = d.items[+el.dataset.path.split('.')[1]];
        it.qty = Math.max(1, it.qty + Number(el.dataset.d));
        s.render();
      },
      addItem: async (el, ev, s) => {
        const pid = await pickProduct();
        if (pid && !d.items.some((i) => i.pid === pid)) d.items.push({ pid, qty: 1 });
        s.render();
      },
      chgItem: async (el, ev, s) => {
        const pid = await pickProduct(null, d.items[+el.dataset.i].pid);
        if (pid) d.items[+el.dataset.i].pid = pid;
        s.render();
      },
      rmItem: (el, ev, s) => {
        d.items.splice(+el.dataset.i, 1);
        s.render();
      },
      muni: async (el, ev, s) => {
        const m = await pickMunicipio(d.municipio);
        if (m != null) d.municipio = m;
        s.render();
      },
      toSale: (el, ev, s) => {
        const r = recommendWh(d.items, d.municipio);
        s.close();
        saleEditor(null, {
          items: d.items.map((i) => ({ pid: i.pid, qty: i.qty, price: product(i.pid)?.price || 0 })),
          wh: r.best || nearestWh(d.municipio) || state.warehouses[0].id,
          municipio: d.municipio,
        });
      },
    },
  });
}

/* ======================= Caja ======================= */
export function cashSheet(whId) {
  openSheet({
    title: () => `Caja ${whName(whId)}`,
    live: true,
    render: () => {
      const bal = cashMap()[whId] || 0;
      const list = cashEntries(whId).slice(0, 80);
      return `
        <div class="hero-card">
          <div class="hero-label">Dinero en caja</div>
          <div class="hero-amount">${money(bal)}</div>
          <div class="hero-meta">${esc(wh(whId).emoji)} ${esc(whName(whId))}</div>
        </div>
        <div class="action-grid">
          <button data-act="mv" data-type="entrega">${icon('outbox')}<span>Entrega a dueños</span></button>
          <button data-act="mv" data-type="gasto">${icon('wallet')}<span>Gasto</span></button>
          <button data-act="mv" data-type="ingreso">${icon('inbox')}<span>Ingreso</span></button>
          <button data-act="arqueo">${icon('cash')}<span>Arqueo</span></button>
        </div>
        <div class="sec-f">El efectivo de las ventas entra solo. Usa “Arqueo” para fijar lo que hay contado físicamente.</div>
        ${section('Movimientos', list.length ? list.map((e) => `
          <button class="row info" data-act="entry" ${e.cashId ? `data-cash="${e.cashId}"` : ''} ${e.saleId ? `data-sale="${e.saleId}"` : ''}>
            <span class="grow"><span class="t">${esc(e.label)}</span><span class="s">${fmtDate(e.date)}${e.note ? ' · ' + esc(e.note) : ''}</span></span>
            <span class="r ${e.amount < 0 ? 'bad' : 'ok'}">${e.amount > 0 ? '+' : ''}${money(e.amount)}</span>
          </button>`).join('') : emptyRow('Sin movimientos'))}
        <div class="spacer"></div>`;
    },
    acts: {
      mv: async (el) => {
        const type = el.dataset.type;
        const v = await promptBox({ title: CASH_TYPES[type], message: `Importe en ${cur()}`, inputmode: 'decimal', placeholder: '0' });
        if (v == null || !num(v)) return;
        const note = await promptBox({ title: 'Nota', message: 'Opcional', value: type === 'entrega' ? 'Entregado a los dueños' : '' });
        state.cash.push({ id: uid(), date: ctx.date, ts: Date.now(), wh: whId, amount: type === 'ingreso' ? Math.abs(num(v)) : -Math.abs(num(v)), type, note: note || '' });
        commit();
        toast('Movimiento guardado');
      },
      arqueo: async () => {
        const bal = cashMap()[whId] || 0;
        const v = await promptBox({ title: 'Arqueo de caja', message: `Según el registro hay ${money(bal)}. ¿Cuánto hay contado?`, inputmode: 'decimal', value: String(bal) });
        if (v == null || v === '') return;
        const diff = round2(num(v) - bal);
        if (!diff) return toast('La caja cuadra');
        state.cash.push({ id: uid(), date: ctx.date, ts: Date.now(), wh: whId, amount: diff, type: 'ajuste', note: `Registro ${money(bal)}, contado ${money(num(v))}` });
        if (await confirmBox('Diferencia en caja', `${diff < 0 ? 'Faltan' : 'Sobran'} ${money(Math.abs(diff))}. ¿Crear una incidencia?`, 'Crear')) {
          state.incidents.push({ id: uid(), date: ctx.date, ts: Date.now(), wh: whId, pid: null, status: 'abierta', text: `Caja ${whName(whId)}: según el registro había ${money(bal)} y se contaron ${money(num(v))} (${diff < 0 ? 'faltan' : 'sobran'} ${money(Math.abs(diff))})` });
        }
        commit();
      },
      entry: async (el) => {
        if (el.dataset.sale) return saleDetail(el.dataset.sale);
        const c = state.cash.find((x) => x.id === el.dataset.cash);
        if (!c) return;
        if (c.ref) return alertBox({ title: 'Movimiento vinculado', message: 'Este movimiento pertenece a un pago. Elimínalo desde la ficha del gestor.' });
        const a = await actionSheet({ title: `${CASH_TYPES[c.type]} · ${money(c.amount)}`, actions: [{ label: 'Eliminar movimiento', value: 'del', destructive: true }] });
        if (a === 'del') {
          state.cash = state.cash.filter((x) => x.id !== c.id);
          commit();
        }
      },
    },
  });
}

/* ======================= Incidencias ======================= */
export function incidentsSheet() {
  const d = { filter: 'abiertas' };
  openSheet({
    title: 'Incidencias',
    live: true,
    right: { label: 'Nueva', act: 'add' },
    render: () => {
      const list = state.incidents
        .filter((i) => d.filter === 'todas' || i.status !== 'resuelta')
        .sort((a, b) => b.date.localeCompare(a.date) || b.ts - a.ts);
      return `
        <div class="pad">${seg('filter', [['abiertas', 'Abiertas'], ['todas', 'Todas']], d.filter)}</div>
        <div class="list">
          ${list.length ? list.map((i) => `
            <button class="row inc-row ${i.status === 'resuelta' ? 'done' : ''}" data-act="open" data-id="${i.id}">
              <span class="ricon ${i.status === 'resuelta' ? 'green' : 'orange'}">${icon(i.status === 'resuelta' ? 'check' : 'alert')}</span>
              <span class="grow"><span class="t wrap">${esc(i.text)}</span><span class="s">${fmtDate(i.date)}${i.wh ? ' · ' + esc(whName(i.wh)) : ''}${i.pid ? ' · ' + esc(productName(i.pid)) : ''}${i.status === 'resuelta' ? ` · resuelta ${fmtDate(i.resolvedDate)}` : ''}</span></span>
            </button>`).join('') : emptyRow(d.filter === 'abiertas' ? 'No hay incidencias abiertas 🎉' : 'Sin incidencias')}
        </div>
        <div class="sec-f">Las incidencias abiertas aparecen en el cierre y marcan el producto con “(Incidencia)” en el stock.</div>
        <div class="spacer"></div>`;
    },
    acts: {
      seg: (el, ev, s) => {
        d.filter = el.dataset.v;
        s.render();
      },
      add: () => incidentEditor(),
      open: async (el) => {
        const i = state.incidents.find((x) => x.id === el.dataset.id);
        const a = await actionSheet({
          title: 'Incidencia',
          message: i.text,
          actions: [
            i.status === 'resuelta' ? { label: 'Reabrir', value: 'reopen' } : { label: 'Marcar como resuelta', value: 'resolve' },
            { label: 'Editar', value: 'edit' },
            { label: 'Eliminar', value: 'del', destructive: true },
          ],
        });
        if (a === 'resolve') Object.assign(i, { status: 'resuelta', resolvedDate: ctx.date });
        if (a === 'reopen') Object.assign(i, { status: 'abierta', resolvedDate: '' });
        if (a === 'edit') return incidentEditor(i);
        if (a === 'del') {
          if (!(await confirmBox('Eliminar incidencia', '', 'Eliminar', true))) return;
          state.incidents = state.incidents.filter((x) => x.id !== i.id);
        }
        if (a) commit();
      },
    },
  });
}

export function incidentEditor(existing = null, prefill = {}) {
  const d = existing ? { ...existing } : { date: ctx.date, wh: '', pid: null, text: '', ...prefill };
  openSheet({
    title: existing ? 'Editar incidencia' : 'Nueva incidencia',
    left: { label: 'Cancelar' },
    right: { label: 'Guardar', act: 'save', bold: true },
    dismissable: false,
    render: () => `
      <div class="list"><div class="row"><textarea class="ta big" data-bind="text" rows="5" placeholder="Describe lo que pasó. Ej.: El panel RONMA 685W no se trajo a Kholy desde el Cerro">${esc(d.text)}</textarea></div></div>
      <div class="sec-h">Almacén</div>
      <div class="pad">${whSeg('wh', d.wh || '', [['', 'General']])}</div>
      ${section('', `
        ${navRow('pickP', 'Producto', { right: esc(d.pid ? productName(d.pid) : 'Ninguno') })}
        ${d.pid ? btnRow('clearP', 'Quitar producto', { cls: 'red' }) : ''}
        ${field('Fecha', `<input class="inp" type="date" data-bind="date" value="${d.date}">`)}`, 'Si eliges almacén y producto, en el stock del cierre aparecerá “(Incidencia)”.')}`,
    onInput: (s, el) => el.dataset.bind && setPath(d, el.dataset.bind, el.value),
    acts: {
      seg: (el, ev, s) => {
        d.wh = el.dataset.v;
        s.render();
      },
      pickP: async (el, ev, s) => {
        const pid = await pickProduct(d.wh || null, d.pid);
        if (pid) d.pid = pid;
        s.render();
      },
      clearP: (el, ev, s) => {
        d.pid = null;
        s.render();
      },
      save: (el, ev, s) => {
        if (!d.text.trim()) return alertBox({ title: 'Escribe la incidencia' });
        if (existing) Object.assign(existing, { text: d.text.trim(), wh: d.wh, pid: d.pid, date: d.date });
        else state.incidents.push({ id: uid(), ts: Date.now(), status: 'abierta', date: d.date, wh: d.wh, pid: d.pid, text: d.text.trim() });
        commit();
        s.close();
        toast('Incidencia guardada');
      },
    },
  });
}

/* ======================= Gestores ======================= */
export function gestorSheet(gid) {
  openSheet({
    title: () => gestorName(gid),
    live: true,
    right: { label: 'Editar', act: 'edit' },
    render: (s) => {
      const g = gestor(gid);
      if (!g) {
        setTimeout(() => s.close());
        return '';
      }
      const st = gestorStats(gid);
      const ws = weekStart(ctx.date);
      const wk = gestorStats(gid, ws, addDays(ws, 6));
      const led = gestorLedger(gid);
      const tel = (g.phone || (/^\+?\d[\d\s]{6,}$/.test(g.name) ? g.name : '')).replace(/\s/g, '');
      return `
        <div class="stats3">
          <div><span>Ganado</span><b>${money(st.earned)}</b></div>
          <div><span>Pagado</span><b>${money(st.paid)}</b></div>
          <div class="${st.balance > 0 ? 'hl' : ''}"><span>Pendiente</span><b>${money(st.balance)}</b></div>
        </div>
        <div class="sec-f">Esta semana: ${money(wk.earned)} en comisiones.</div>
        <div class="action-grid">
          <button data-act="pay">${icon('cash')}<span>Registrar pago</span></button>
          ${tel ? `<a href="tel:${esc(tel)}">${icon('phone')}<span>Llamar</span></a>` : ''}
          ${tel ? `<a href="https://wa.me/${esc(tel.replace(/^\+/, '').length === 8 ? '53' + tel : tel.replace(/^\+/, ''))}" target="_blank" rel="noopener">${icon('message')}<span>WhatsApp</span></a>` : ''}
        </div>
        ${g.notes ? section('Notas', `<div class="row note">${esc(g.notes)}</div>`) : ''}
        ${section('Historial', led.length ? led.map((e) => `
          <button class="row info" data-act="entry" ${e.saleId ? `data-sale="${e.saleId}"` : ''} ${e.payId ? `data-pay="${e.payId}"` : ''}>
            <span class="grow"><span class="t">${esc(e.label)}</span><span class="s">${fmtDate(e.date)}</span></span>
            <span class="r ${e.amount < 0 ? 'bad' : 'ok'}">${e.amount > 0 ? '+' : ''}${money(e.amount)}</span>
          </button>`).join('') : emptyRow('Sin comisiones todavía'))}
        <div class="list">${btnRow('del', 'Eliminar gestor', { ic: 'trash', cls: 'red' })}</div>
        <div class="spacer"></div>`;
    },
    acts: {
      edit: () => gestorEditor(gid),
      pay: () => paymentEditor(gid),
      entry: async (el) => {
        if (el.dataset.sale) return saleDetail(el.dataset.sale);
        const p = state.gestorPayments.find((x) => x.id === el.dataset.pay);
        const a = await actionSheet({ title: `Pago de ${money(p.amount)}`, message: fmtDate(p.date), actions: [{ label: 'Eliminar pago', value: 'del', destructive: true }] });
        if (a !== 'del') return;
        state.gestorPayments = state.gestorPayments.filter((x) => x.id !== p.id);
        state.cash = state.cash.filter((c) => c.ref !== p.id);
        commit();
      },
      del: async (el, ev, s) => {
        const used = state.sales.some((x) => x.gestores.some((g) => g.gid === gid)) || state.gestorPayments.some((p) => p.gid === gid);
        if (used) return alertBox({ title: 'No se puede eliminar', message: 'Este gestor tiene ventas o pagos registrados.' });
        if (!(await confirmBox('Eliminar gestor', '', 'Eliminar', true))) return;
        state.gestores = state.gestores.filter((g) => g.id !== gid);
        s.close();
        commit();
      },
    },
  });
}

export function gestorEditor(gid = null) {
  const g = gid ? gestor(gid) : null;
  const d = { name: g?.name || '', phone: g?.phone || '', notes: g?.notes || '' };
  openSheet({
    title: g ? 'Editar gestor' : 'Nuevo gestor',
    left: { label: 'Cancelar' },
    right: { label: 'Guardar', act: 'save', bold: true },
    dismissable: false,
    render: () => `
      ${section('', `
        ${field('Nombre', inp('name', d.name, 'placeholder="Nombre o número"'))}
        ${field('Teléfono', inp('phone', d.phone, 'type="tel" inputmode="tel" placeholder="Opcional"'))}
        <div class="row"><textarea class="ta" data-bind="notes" rows="3" placeholder="Notas (forma de pago, etc.)">${esc(d.notes)}</textarea></div>`)}`,
    onInput: (s, el) => el.dataset.bind && setPath(d, el.dataset.bind, el.value),
    acts: {
      save: (el, ev, s) => {
        if (!d.name.trim()) return alertBox({ title: 'Falta el nombre' });
        const t = g || addGestor(d.name);
        Object.assign(t, { name: d.name.trim(), phone: d.phone.trim(), notes: d.notes.trim() });
        commit();
        s.close();
        toast('Gestor guardado');
      },
    },
  });
}

export function paymentEditor(gid, amount = null) {
  const bal = gestorStats(gid).balance;
  const d = { amount: String(amount ?? (bal > 0 ? bal : '')), date: ctx.date, cashWh: '', note: '' };
  openSheet({
    title: 'Pago a gestor',
    left: { label: 'Cancelar' },
    right: { label: 'Guardar', act: 'save', bold: true },
    dismissable: false,
    render: () => `
      <div class="hero-card"><div class="hero-label">${esc(gestorName(gid))}</div><div class="hero-meta">Pendiente: <b>${money(bal)}</b></div></div>
      ${section('', `
        ${field(`Importe (${cur()})`, inp('amount', d.amount, 'inputmode="decimal" placeholder="0"'))}
        ${field('Fecha', `<input class="inp" type="date" data-bind="date" value="${d.date}">`)}
        <div class="row"><input class="inp left" data-bind="note" value="${esc(d.note)}" placeholder="Nota (opcional)"></div>`)}
      <div class="sec-h">¿Sale de alguna caja?</div>
      <div class="pad">${whSeg('cashWh', d.cashWh, [['', 'No']])}</div>
      <div class="sec-f">Si eliges una caja, el importe se descuenta del dinero en caja de ese almacén.</div>`,
    onInput: (s, el) => el.dataset.bind && setPath(d, el.dataset.bind, el.value),
    acts: {
      seg: (el, ev, s) => {
        d.cashWh = el.dataset.v;
        s.render();
      },
      save: (el, ev, s) => {
        const a = round2(num(d.amount));
        if (!a) return alertBox({ title: 'Indica el importe' });
        const p = { id: uid(), gid, date: d.date, ts: Date.now(), amount: a, note: d.note.trim(), cashWh: d.cashWh || null, week: weekStart(d.date) };
        state.gestorPayments.push(p);
        if (p.cashWh) state.cash.push({ id: uid(), date: p.date, ts: p.ts, wh: p.cashWh, amount: -a, type: 'pago_gestor', note: gestorName(gid), ref: p.id });
        commit();
        s.close();
        toast('Pago registrado');
      },
    },
  });
}

/* ======================= Liquidación semanal ======================= */
export function weekSheet(ws = null) {
  // El lunes (día de pago) se muestra por defecto la semana que acaba de terminar.
  const ref = parseDate(ctx.date).getDay() === 1 ? addDays(ctx.date, -1) : ctx.date;
  const d = { ws: ws || weekStart(ref) };
  openSheet({
    title: 'Liquidación semanal',
    live: true,
    render: () => {
      const w = weekSummary(d.ws);
      const pending = w.gestores.filter((x) => x.balance > 0);
      const totalPend = pending.reduce((a, x) => a + x.balance, 0);
      return `
        <div class="week-nav">
          <button class="icon-btn" data-act="prev">${icon('chevL')}</button>
          <div><b>${fmtDate(w.ws)} – ${fmtDate(w.we)}</b><span>Lunes a domingo · se paga el lunes ${fmtDate(addDays(w.we, 1))}</span></div>
          <button class="icon-btn" data-act="next">${icon('chevR')}</button>
        </div>
        <div class="stats3">
          <div><span>Ventas</span><b>${w.count}</b></div>
          <div><span>Cobrado</span><b>${money(w.total)}</b></div>
          <div><span>Extra dueños</span><b>${money(w.ownerExtra)}</b></div>
        </div>
        ${section('Gestores · a entregar', w.gestores.length ? w.gestores.map((x) => navRow('pay', esc(x.g.name), {
          sub: `Semana: ${money(x.week)}${x.paidWeek ? ` · pagado: ${money(x.paidWeek)}` : ''}`,
          right: x.balance > 0 ? `<b class="orange">${money(x.balance)}</b>` : `<span class="ok">${icon('check')} Al día</span>`,
          attrs: `data-id="${x.g.id}"`,
        })).join('') : emptyRow('Sin comisiones esta semana'), pending.length ? `Total pendiente de entregar: <b>${money(totalPend)}</b>. Incluye lo que quedó pendiente de semanas anteriores.` : '')}
        ${pending.length ? `<div class="pad"><button class="btn-secondary" data-act="payAll">${icon('cash')} Registrar pago de todos (${money(totalPend)})</button></div>` : ''}
        ${section(`Asesores · ${w.pct}% de las ventas`, w.asesores.length ? w.asesores.map((a) => `
          <button class="row info" data-act="asesor" data-name="${esc(a.name)}">
            <span class="grow"><span class="t">${esc(a.name)}</span><span class="s">${a.count} venta${a.count === 1 ? '' : 's'} · base ${money(a.base)}</span></span>
            <span class="r">${a.paid ? `<span class="ok">${icon('check')} ${money(a.commission)}</span>` : `<b>${money(a.commission)}</b>`}</span>
          </button>`).join('') : emptyRow('Sin ventas esta semana'), `Base de cálculo: ${state.settings.asesorBase === 'empresa' ? 'precio de la empresa' : 'total cobrado al cliente'}. Toca un asesor para marcarlo como pagado. Se cambia en Ajustes.`)}
        <div class="pad two">
          <button class="btn-secondary" data-act="copy">${icon('copy')} Copiar</button>
          <button class="btn-primary" data-act="share">${icon('share')} Compartir</button>
        </div>
        <div class="spacer"></div>`;
    },
    acts: {
      prev: (el, ev, s) => {
        d.ws = addDays(d.ws, -7);
        s.render();
      },
      next: (el, ev, s) => {
        d.ws = addDays(d.ws, 7);
        s.render();
      },
      pay: (el) => paymentEditor(el.dataset.id),
      payAll: async () => {
        const w = weekSummary(d.ws);
        const pending = w.gestores.filter((x) => x.balance > 0);
        const from = await actionSheet({
          title: 'Registrar todos los pagos',
          message: `${pending.length} gestores · ${money(pending.reduce((a, x) => a + x.balance, 0))}. ¿Sale de alguna caja?`,
          actions: [{ label: 'No descontar de caja', value: 'none' }, ...state.warehouses.map((x) => ({ label: `Caja ${x.name}`, value: x.id }))],
        });
        if (!from) return;
        for (const x of pending) {
          const p = { id: uid(), gid: x.g.id, date: ctx.date, ts: Date.now(), amount: x.balance, note: `Liquidación ${fmtDate(w.ws)}–${fmtDate(w.we)}`, cashWh: from === 'none' ? null : from, week: d.ws };
          state.gestorPayments.push(p);
          if (p.cashWh) state.cash.push({ id: uid(), date: p.date, ts: p.ts, wh: p.cashWh, amount: -p.amount, type: 'pago_gestor', note: x.g.name, ref: p.id });
        }
        commit();
        toast('Pagos registrados');
      },
      asesor: async (el) => {
        const name = el.dataset.name;
        const w = weekSummary(d.ws);
        const a = w.asesores.find((x) => x.name === name);
        if (a.paid) {
          if (!(await confirmBox('Desmarcar pago', `¿Marcar la comisión de ${name} como no pagada?`, 'Desmarcar'))) return;
          state.asesorPayments = state.asesorPayments.filter((p) => p !== a.paid);
          state.cash = state.cash.filter((c) => c.ref !== a.paid.id);
        } else {
          const from = await actionSheet({
            title: `Pagar ${money(a.commission)} a ${name}`,
            actions: [{ label: 'Marcar como pagado', value: 'none' }, ...state.warehouses.map((x) => ({ label: `Pagado de la caja ${x.name}`, value: x.id }))],
          });
          if (!from) return;
          const p = { id: uid(), week: d.ws, asesor: name, amount: a.commission, date: ctx.date };
          state.asesorPayments.push(p);
          if (from !== 'none') state.cash.push({ id: uid(), date: ctx.date, ts: Date.now(), wh: from, amount: -a.commission, type: 'pago_asesor', note: name, ref: p.id });
        }
        commit();
      },
      copy: () => copyText(buildWeekly(d.ws)),
      share: () => shareText(buildWeekly(d.ws)),
    },
  });
}

/* ======================= Ajustes ======================= */
export function settingsSheet() {
  openSheet({
    title: 'Ajustes',
    live: true,
    left: null,
    right: { label: 'OK', act: 'close', bold: true },
    render: () => {
      const S = state.settings;
      return `
        ${section('Asesor de turno', field('Nombre', inp('settings.asesor', S.asesor, 'placeholder="Tu nombre"')), 'Aparece en el cierre y se guarda en cada venta para calcular la comisión de asesores.')}
        ${section('Datos del negocio', `
          ${navRow('whs', 'Almacenes', { ic: 'home', color: 'blue', right: state.warehouses.map((w) => esc(w.name)).join(', ') })}
          ${navRow('catalog', 'Catálogo de productos', { ic: 'box', color: 'green', right: String(state.products.length) })}
          ${navRow('munis', 'Municipios y cercanía', { ic: 'pin', color: 'indigo' })}
          ${navRow('import', 'Importar stock desde un cierre', { ic: 'inbox', color: 'teal' })}`)}
        ${section('Comisiones', `
          ${field('% para asesores', inp('settings.asesorPct', S.asesorPct, 'inputmode="decimal" data-num'))}
          <div class="row col"><span class="lbl small">Calcular sobre</span>${seg('asesorBase', [['total', 'Total cobrado'], ['empresa', 'Precio empresa']], S.asesorBase)}</div>
          ${field('Moneda', inp('settings.currency', S.currency, 'placeholder="USD"'))}`, 'La comisión de asesores se calcula cada semana (lunes a domingo).')}
        ${section('Texto del cierre', `
          <div class="row"><span class="grow">Incluir nº de vale</span>${toggle('settings.closeShowVale', S.closeShowVale)}</div>
          <div class="row"><span class="grow">Incluir importe de cada venta</span>${toggle('settings.closeShowMoney', S.closeShowMoney)}</div>`)}
        ${section('Copia de seguridad', `
          ${btnRow('export', 'Exportar copia de seguridad', { ic: 'upload' })}
          ${btnRow('importBackup', 'Restaurar copia de seguridad', { ic: 'download' })}`,
          `Los datos solo están en este iPhone. Exporta una copia cada semana y guárdala en Archivos o envíatela por WhatsApp. ${S.lastBackup ? `Última copia: ${fmtDate(S.lastBackup)}.` : 'Aún no has hecho ninguna copia.'}`)}
        ${section('Ayuda', `
          <a class="row navrow" href="manual/Manual-Registro-Ekotek.pdf" target="_blank" rel="noopener"><span class="ricon purple">${icon('book')}</span><span class="grow">Manual de uso (PDF)</span>${icon('chevR', 'chev')}</a>
          ${btnRow('welcome', 'Ver pantalla de bienvenida', { ic: 'bolt' })}
          ${infoRow('Versión', APP_VERSION)}`)}
        <div class="list">${btnRow('wipe', 'Borrar todos los datos', { ic: 'trash', cls: 'red' })}</div>
        <div class="spacer"></div>`;
    },
    onInput: (s, el, ev) => {
      const b = el.dataset.bind;
      if (!b) return;
      let v = el.type === 'checkbox' ? el.checked : el.value;
      if (el.hasAttribute('data-num')) v = num(v);
      setPath(state, b, v);
      if (b === 'settings.asesor') rememberAsesor(v);
      save();
      // Un cambio de texto no vuelve a pintar esta hoja para no perder el toque en curso.
      if (ev.type === 'change') refresh(el.type === 'checkbox' ? null : s);
    },
    acts: {
      seg: (el) => {
        state.settings[el.dataset.name] = el.dataset.v;
        commit();
      },
      whs: () => warehousesSheet(),
      catalog: () => catalogSheet(),
      munis: () => municipiosSheet(),
      import: () => importSheet(),
      export: () => exportBackup(),
      importBackup: () => importBackup(),
      welcome: () => welcomeSheet(),
      wipe: async (el, ev, s) => {
        if (!(await confirmBox('Borrar todos los datos', 'Se eliminarán ventas, inventario, gestores y cierres de este iPhone. Exporta antes una copia de seguridad.', 'Continuar', true))) return;
        const v = await promptBox({ title: 'Confirmación', message: 'Escribe BORRAR para confirmar' });
        if ((v || '').trim().toUpperCase() !== 'BORRAR') return;
        const keep = { ...state.settings, onboarded: false };
        replaceState({ settings: keep });
        s.close();
        refresh();
        toast('Datos borrados', 'trash');
      },
    },
  });
}

function warehousesSheet() {
  openSheet({
    title: 'Almacenes',
    right: { label: 'OK', act: 'close', bold: true },
    left: null,
    render: () => state.warehouses.map((w, i) => section(`${esc(w.emoji)} ${esc(w.name)}`, `
      ${field('Nombre', inp(`warehouses.${i}.name`, w.name))}
      ${field('Título en ventas', inp(`warehouses.${i}.salesTitle`, w.salesTitle, 'placeholder="Ej. KHOLY"'))}
      ${field('Título en stock', inp(`warehouses.${i}.stockTitle`, w.stockTitle, 'placeholder="Ej. CERRO"'))}
      ${field('Emoji', inp(`warehouses.${i}.emoji`, w.emoji))}`)).join('') + `<div class="sec-f">“Título en ventas” es el nombre del punto de venta en el cierre (KHOLY, LISA). “Título en stock” es el del almacén (CERRO, LA LISA).</div>`,
    onInput: (s, el, ev) => {
      if (!el.dataset.bind) return;
      setPath(state, el.dataset.bind, el.value);
      save();
      if (ev.type === 'change') refresh(s);
    },
  });
}

function municipiosSheet() {
  openSheet({
    title: 'Municipios y cercanía',
    live: true,
    right: { label: 'Añadir', act: 'add' },
    render: () => `
      <div class="sec-f">Para cada lugar, elige el almacén más cercano. Se usa en “¿Dónde buscar?” y al registrar ventas.</div>
      <div class="list">${state.municipios.map((m, i) => `
        <div class="row col muni-row">
          <div class="muni-top"><span class="t">${esc(m.name)}</span><button class="icon-btn red" data-act="del" data-i="${i}">${icon('trash')}</button></div>
          ${seg(`m${i}`, state.warehouses.map((w) => [w.id, w.name]), m.wh)}
        </div>`).join('')}</div>
      <div class="spacer"></div>`,
    acts: {
      seg: (el) => {
        state.municipios[+el.dataset.name.slice(1)].wh = el.dataset.v;
        commit();
      },
      add: async () => {
        const n = await promptBox({ title: 'Nuevo lugar', placeholder: 'Ej. Santiago de las Vegas' });
        if (!n || !n.trim()) return;
        state.municipios.push({ name: n.trim(), wh: state.warehouses[0].id });
        commit();
      },
      del: async (el) => {
        const m = state.municipios[+el.dataset.i];
        if (!(await confirmBox('Eliminar', `¿Quitar “${m.name}”?`, 'Eliminar', true))) return;
        state.municipios.splice(+el.dataset.i, 1);
        commit();
      },
    },
  });
}

/* ======================= Copias de seguridad ======================= */
export async function exportBackup() {
  const name = `ekotek-respaldo-${today()}.json`;
  const file = new File([JSON.stringify(state)], name, { type: 'application/json' });
  const mark = () => {
    state.settings.lastBackup = today();
    commit();
  };
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
      return mark();
    }
  } catch (e) {
    if (e.name === 'AbortError') return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1500);
  mark();
}

export function importBackup() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.onchange = async () => {
    const f = input.files?.[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!Array.isArray(data.products) || !Array.isArray(data.sales)) throw new Error('formato');
      const ok = await confirmBox('Restaurar copia', `Copia con ${data.sales.length} ventas y ${data.products.length} productos. Reemplazará todos los datos actuales.`, 'Restaurar', true);
      if (!ok) return;
      replaceState(data);
      refresh();
      toast('Copia restaurada');
    } catch {
      alertBox({ title: 'Archivo no válido', message: 'Selecciona un archivo de copia de seguridad (.json) exportado desde esta app.' });
    }
  };
  input.click();
}

/* ======================= Bienvenida ======================= */
export function welcomeSheet() {
  const d = { name: state.settings.asesor || '' };
  openSheet({
    title: '',
    left: null,
    right: null,
    dismissable: false,
    cls: 'welcome',
    render: () => `
      <div class="welcome-hero">
        <img src="icons/icon-192.png" alt="" width="84" height="84">
        <h1>Registro Ekotek</h1>
        <p>Tu libreta de turno: ventas, inventario de los dos almacenes, comisiones y el cierre general listo para WhatsApp.</p>
      </div>
      <div class="features">
        <div>${icon('bag')}<span><b>Ventas con vale</b>Descuenta del almacén correcto y reparte el sobreprecio entre gestores y dueños.</span></div>
        <div>${icon('box')}<span><b>Inventario y conteo</b>Revisa los almacenes al empezar el turno y detecta diferencias.</span></div>
        <div>${icon('doc')}<span><b>Cierre general</b>Se genera solo, lo editas y lo compartes.</span></div>
        <div>${icon('shield')}<span><b>Sin internet</b>Todo queda guardado en este iPhone.</span></div>
      </div>
      ${section('¿Cómo te llamas?', field('Asesor', inp('name', d.name, 'placeholder="Nombre y apellido"')))}
      <div class="pad"><button class="btn-primary" data-act="start">Empezar</button></div>
      <div class="pad"><button class="btn-secondary" data-act="import">${icon('inbox')} Empezar importando el último cierre</button></div>
      <div class="spacer"></div>`,
    onInput: (s, el) => {
      if (el.dataset.bind) d.name = el.value;
    },
    acts: {
      start: (el, ev, s) => finish(s),
      import: (el, ev, s) => {
        finish(s);
        importSheet();
      },
    },
  });
  function finish(s) {
    state.settings.asesor = d.name.trim() || state.settings.asesor;
    rememberAsesor(state.settings.asesor);
    state.settings.onboarded = true;
    commit();
    s.close();
  }
}
