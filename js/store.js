// Estado de la aplicación, persistencia local y cálculos derivados.
// Todo se guarda en localStorage del dispositivo; nada sale del iPhone.

export const APP_VERSION = '1.1.0';
const KEY = 'ekotek-registro-v1';

/* ---------- utilidades ---------- */
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const pad = (n) => String(n).padStart(2, '0');
export const toDateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => toDateStr(new Date());
export function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(s, n) {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}
export function fmtDate(s) {
  if (!s) return '';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y.slice(2)}`;
}
export function fmtDateLong(s) {
  const t = parseDate(s).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  return t.charAt(0).toUpperCase() + t.slice(1);
}
export function fmtTime(ts) {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
/** Lunes de la semana de la fecha dada. */
export function weekStart(s) {
  const d = parseDate(s);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return toDateStr(d);
}
export const isSunday = (s) => parseDate(s).getDay() === 0;
export function num(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  const n = parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
  return isFinite(n) ? n : 0;
}
export const round2 = (n) => Math.round(n * 100) / 100;
export function money(n, sym = '$') {
  n = round2(num(n));
  const s = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
  return (n < 0 ? '-' : '') + sym + s;
}
export const plainNum = (n) => money(n, '');
export function norm(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
const sum = (arr, f) => arr.reduce((a, x) => a + num(f(x)), 0);

/* ---------- estado por defecto ---------- */
export const MUNICIPIOS_DEFAULT = [
  ['Cerro', 'cerro'], ['Plaza de la Revolución', 'cerro'], ['Centro Habana', 'cerro'],
  ['La Habana Vieja', 'cerro'], ['Diez de Octubre', 'cerro'], ['Arroyo Naranjo', 'cerro'],
  ['San Miguel del Padrón', 'cerro'], ['Regla', 'cerro'], ['Guanabacoa', 'cerro'],
  ['La Habana del Este', 'cerro'], ['Cotorro', 'cerro'], ['Boyeros', 'cerro'],
  ['La Lisa', 'lisa'], ['Marianao', 'lisa'], ['Playa', 'lisa'],
  ['Bauta', 'lisa'], ['Caimito', 'lisa'], ['San Antonio de los Baños', 'lisa'],
  ['Artemisa', 'lisa'], ['Mayabeque', 'cerro'],
].map(([name, wh]) => ({ name, wh }));

export function defaultState() {
  return {
    version: 2,
    settings: {
      asesor: '',
      asesores: [],
      asesorPct: 0.1,
      asesorBase: 'total', // 'total' = cobrado al cliente, 'empresa' = precio de la empresa
      currency: 'USD',
      closeShowVale: false,
      closeShowMoney: false,
      closeShowOwners: true,
      onboarded: false,
      seenVersion: '',
      lastBackup: null,
    },
    warehouses: [
      { id: 'cerro', name: 'Cerro', stockTitle: 'CERRO', salesTitle: 'KHOLY', emoji: '🏠' },
      { id: 'lisa', name: 'La Lisa', stockTitle: 'LA LISA', salesTitle: 'LISA', emoji: '🏡' },
    ],
    municipios: MUNICIPIOS_DEFAULT.map((m) => ({ ...m })),
    products: [], // {id, name, price, aliases:[]}
    movements: [], // {id, ts, date, type, wh, pid, qty, ref, group, note}
    sales: [], // ver saleCalc
    gestores: [], // {id, name, phone, notes}
    gestorPayments: [], // {id, gid, date, ts, amount, note, cashWh, account, week}
    gestorAdjust: [], // {id, gid, date, ts, amount, note} deudas anteriores y correcciones
    cash: [], // {id, date, ts, wh, account: 'caja'|'duenos', amount, type, note, ref}
    incidents: [], // {id, date, ts, wh, pid, text, status, resolvedDate}
    counts: [], // {id, date, ts, wh, diffs}
    closures: [], // {id, date, ts, text}
    asesorPayments: [], // {id, week, asesor, amount, date}
  };
}

function migrate(s) {
  const d = defaultState();
  for (const k of Object.keys(d)) if (s[k] === undefined) s[k] = d[k];
  s.settings = { ...d.settings, ...s.settings };
  // v1 → v2: los movimientos de dinero sin cuenta se leen con accountOf(); no hace falta reescribirlos.
  s.version = d.version;
  return s;
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch (e) {
    console.error(e);
  }
  return defaultState();
}

export let state = load();

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
}

export function replaceState(next) {
  state = migrate(next);
  save();
}

/* ---------- búsquedas ---------- */
export const wh = (id) => state.warehouses.find((w) => w.id === id);
export const whName = (id) => wh(id)?.name || '—';
export const product = (id) => state.products.find((p) => p.id === id);
export const productName = (id) => product(id)?.name || 'Producto eliminado';
export const gestor = (id) => state.gestores.find((g) => g.id === id);
export const gestorName = (id) => gestor(id)?.name || 'Gestor eliminado';

export function findProductByName(name) {
  const n = norm(name);
  if (!n) return null;
  return state.products.find((p) => norm(p.name) === n || (p.aliases || []).some((a) => norm(a) === n)) || null;
}

export function addProduct(name, price = 0) {
  const p = { id: uid(), name: name.trim(), price: num(price), aliases: [] };
  state.products.push(p);
  return p;
}

export function addGestor(name, phone = '') {
  const g = { id: uid(), name: name.trim(), phone: phone.trim(), notes: '' };
  state.gestores.push(g);
  return g;
}

/* ---------- inventario ---------- */
/** Mapa {wh: {pid: qty}} sumando movimientos hasta la fecha indicada (incluida). */
export function stockMap(upTo = null) {
  const m = {};
  for (const w of state.warehouses) m[w.id] = {};
  for (const mv of state.movements) {
    if (upTo && mv.date > upTo) continue;
    const w = m[mv.wh] || (m[mv.wh] = {});
    w[mv.pid] = (w[mv.pid] || 0) + mv.qty;
  }
  return m;
}

export function addMovement(mv) {
  const full = { id: uid(), ts: Date.now(), ...mv };
  state.movements.push(full);
  return full;
}

/** Ajusta el stock de un producto en un almacén a una cantidad exacta. */
export function setStock(whId, pid, target, date, type = 'ajuste', note = '') {
  const cur = stockMap()[whId]?.[pid] || 0;
  const diff = num(target) - cur;
  if (diff) addMovement({ date, type, wh: whId, pid, qty: diff, note });
  return diff;
}

/** Regenera los movimientos de stock asociados a una venta. */
export function syncSaleMovements(sale) {
  state.movements = state.movements.filter((m) => m.ref !== sale.id);
  if (sale.void) return;
  let date = sale.date;
  let whId = sale.wh;
  let type = 'venta';
  if (sale.type === 'anticipada') {
    if (!sale.delivered) return;
    date = sale.deliveredDate || sale.date;
    whId = sale.deliveredWh || sale.wh;
    type = 'entrega';
  }
  for (const it of sale.items) {
    if (it.pid && num(it.qty)) addMovement({ date, type, wh: whId, pid: it.pid, qty: -num(it.qty), ref: sale.id });
  }
}

export function openIncidents(upTo = null) {
  return state.incidents.filter((i) => (!upTo || i.date <= upTo) && (i.status !== 'resuelta' || (upTo && i.resolvedDate > upTo)));
}

export function hasIncident(whId, pid, upTo = null) {
  return openIncidents(upTo).some((i) => i.wh === whId && i.pid === pid);
}

/* ---------- ventas ---------- */
/**
 * Reparto de una venta: cobrado = dueños + caja + gestores.
 * Los dueños reciben el precio de la empresa. La caja se queda con lo que sobra del
 * sobreprecio después de pagar a los gestores (o con lo escrito a mano en `cajaManual`).
 * Si se cobró menos que el precio de la empresa (rebaja o combo), o la comisión supera
 * el sobreprecio, la diferencia sale de la parte de los dueños.
 * Cada venta guarda sus propios precios: cambiar el catálogo no altera ventas pasadas.
 */
export function saleCalc(s) {
  const base = round2(sum(s.items || [], (it) => num(it.qty) * num(it.price)));
  const total = round2(num(s.total));
  const gest = round2(sum(s.gestores || [], (g) => g.amount));
  const cajaAuto = round2(Math.max(0, total - base - gest));
  const manual = s.cajaManual !== undefined && s.cajaManual !== null && s.cajaManual !== '';
  const caja = manual ? round2(num(s.cajaManual)) : cajaAuto;
  const cash = s.payMethod === 'efectivo' ? total : s.payMethod === 'mixto' ? Math.min(num(s.cashAmount), total) : 0;
  return {
    base,
    total,
    extra: round2(total - base),
    gest,
    caja,
    cajaAuto,
    cajaManual: manual,
    owners: round2(total - gest - caja),
    discount: round2(Math.max(0, base - total)),
    cash: round2(cash),
  };
}

export const activeSales = () => state.sales.filter((s) => !s.void);

/** Almacén donde se anota el dinero de la venta. */
export const saleWh = (s) => s.cashWh || s.wh;

export function itemsSummary(items, sep = ', ') {
  return (items || []).map((it) => `${num(it.qty)} ${productName(it.pid)}`).join(sep);
}

export function asesorBaseOf(s) {
  const c = saleCalc(s);
  return state.settings.asesorBase === 'empresa' ? c.base : c.total;
}

/** Suma el reparto de varias ventas. */
export function salesTotals(sales) {
  const t = { count: 0, total: 0, base: 0, gest: 0, caja: 0, owners: 0, discount: 0 };
  for (const s of sales) {
    if (s.void) continue;
    const c = saleCalc(s);
    t.count++;
    for (const k of ['total', 'base', 'gest', 'caja', 'owners', 'discount']) t[k] += c[k];
  }
  for (const k of Object.keys(t)) if (k !== 'count') t[k] = round2(t[k]);
  return t;
}

/* ---------- dinero: cuentas de dueños y de caja por almacén ---------- */
export const ACCOUNTS = { caja: 'Caja', duenos: 'Dueños' };

/** Los movimientos anteriores a la versión 1.1 no tienen cuenta: las entregas son de los dueños y el resto de la caja. */
export const accountOf = (c) => c.account || (c.type === 'entrega' ? 'duenos' : 'caja');

export const MONEY_TYPES = {
  entrega: 'Entrega a los dueños',
  gasto: 'Gasto',
  ingreso: 'Ingreso',
  ajuste: 'Arqueo / ajuste',
  pago_gestor: 'Pago a gestor',
  pago_asesor: 'Pago a asesor',
};

/** Saldos {wh: {caja, duenos}} hasta la fecha indicada (incluida). */
export function moneyMap(upTo = null) {
  const m = {};
  const acc = (w) => (m[w] = m[w] || { caja: 0, duenos: 0 });
  for (const w of state.warehouses) acc(w.id);
  for (const c of state.cash) {
    if (upTo && c.date > upTo) continue;
    acc(c.wh)[accountOf(c)] += num(c.amount);
  }
  for (const s of activeSales()) {
    if (upTo && s.date > upTo) continue;
    const c = saleCalc(s);
    const a = acc(saleWh(s));
    a.caja += c.caja;
    a.duenos += c.owners;
  }
  for (const k in m) {
    m[k].caja = round2(m[k].caja);
    m[k].duenos = round2(m[k].duenos);
  }
  return m;
}

export function moneyEntries(whId, account = null) {
  const list = state.cash
    .filter((c) => c.wh === whId && (!account || accountOf(c) === account))
    .map((c) => ({ date: c.date, ts: c.ts, amount: num(c.amount), label: MONEY_TYPES[c.type] || c.type, note: c.note, cashId: c.id, account: accountOf(c) }));
  for (const s of activeSales()) {
    if (saleWh(s) !== whId) continue;
    const c = saleCalc(s);
    for (const [acc, amt] of [['duenos', c.owners], ['caja', c.caja]]) {
      if (amt && (!account || account === acc)) {
        list.push({ date: s.date, ts: s.ts, amount: amt, label: `Venta${s.vale ? ' · vale ' + s.vale : ''}`, note: itemsSummary(s.items), saleId: s.id, account: acc });
      }
    }
  }
  return list.sort((a, b) => b.date.localeCompare(a.date) || b.ts - a.ts);
}

/* ---------- gestores ---------- */
export function gestorLedger(gid) {
  const list = [];
  for (const s of activeSales()) {
    for (const g of s.gestores || []) {
      if (g.gid === gid && num(g.amount)) {
        list.push({ date: s.date, ts: s.ts, amount: num(g.amount), label: `Vale ${s.vale || 's/n'} · ${itemsSummary(s.items)}`, saleId: s.id });
      }
    }
  }
  for (const a of state.gestorAdjust) {
    if (a.gid === gid) list.push({ date: a.date, ts: a.ts, amount: num(a.amount), label: 'Ajuste de saldo' + (a.note ? ' · ' + a.note : ''), adjId: a.id });
  }
  for (const p of state.gestorPayments) {
    if (p.gid === gid) list.push({ date: p.date, ts: p.ts, amount: -num(p.amount), label: 'Pago entregado' + (p.note ? ' · ' + p.note : ''), payId: p.id });
  }
  return list.sort((a, b) => b.date.localeCompare(a.date) || b.ts - a.ts);
}

/** earned: comisiones de ventas · adjust: deudas anteriores y ajustes · balance: lo que se le debe. */
export function gestorStats(gid, from = null, to = null) {
  const inRange = (d) => !((from && d < from) || (to && d > to));
  let earned = 0;
  let adjust = 0;
  let paid = 0;
  for (const s of activeSales()) {
    if (!inRange(s.date)) continue;
    for (const g of s.gestores || []) if (g.gid === gid) earned += num(g.amount);
  }
  for (const a of state.gestorAdjust) if (a.gid === gid && inRange(a.date)) adjust += num(a.amount);
  for (const p of state.gestorPayments) if (p.gid === gid && inRange(p.date)) paid += num(p.amount);
  return { earned: round2(earned), adjust: round2(adjust), paid: round2(paid), balance: round2(earned + adjust - paid) };
}

/** Comisiones de gestores de un día: [{gid, amounts:[...], total}] */
export function gestorDay(date) {
  const map = new Map();
  for (const s of activeSales().filter((x) => x.date === date).sort((a, b) => a.ts - b.ts)) {
    for (const g of s.gestores || []) {
      if (!num(g.amount)) continue;
      if (!map.has(g.gid)) map.set(g.gid, { gid: g.gid, amounts: [], total: 0 });
      const e = map.get(g.gid);
      e.amounts.push(num(g.amount));
      e.total = round2(e.total + num(g.amount));
    }
  }
  return [...map.values()];
}

/** Registra un pago (a gestor o asesor) y, si sale de una cuenta, lo descuenta de ella. */
export function moneyOut({ wh: whId, account, amount, date, type, note, ref }) {
  if (!whId || !account) return;
  state.cash.push({ id: uid(), date, ts: Date.now(), wh: whId, account, amount: -Math.abs(num(amount)), type, note, ref });
}

/* ---------- semana ---------- */
export function weekSummary(ws) {
  const we = addDays(ws, 6);
  const sales = activeSales().filter((s) => s.date >= ws && s.date <= we);
  const pct = num(state.settings.asesorPct);
  const asesores = new Map();
  for (const s of sales) {
    const name = s.asesor || 'Sin asesor';
    if (!asesores.has(name)) asesores.set(name, { name, count: 0, base: 0 });
    const a = asesores.get(name);
    a.count++;
    a.base += asesorBaseOf(s);
  }
  const asesorList = [...asesores.values()].map((a) => {
    const paid = state.asesorPayments.find((p) => p.week === ws && p.asesor === a.name);
    return { ...a, base: round2(a.base), commission: round2((a.base * pct) / 100), paid };
  });
  const gestorList = state.gestores
    .map((g) => {
      const wk = gestorStats(g.id, ws, we);
      const all = gestorStats(g.id);
      return { g, week: wk.earned, paidWeek: wk.paid, balance: all.balance };
    })
    .filter((x) => x.week || x.balance || x.paidWeek);
  return { ws, we, sales, ...salesTotals(sales), asesores: asesorList, gestores: gestorList, pct };
}

/* ---------- importar stock desde texto de un cierre ---------- */
export function parseStockText(text) {
  let lines = String(text || '').split(/\r?\n/);
  const idx = lines.findIndex((l) => norm(l).includes('en stock'));
  if (idx >= 0) lines = lines.slice(idx + 1);
  const result = {};
  let cur = null;
  let started = false;
  const incRe = /\(?\s*incidencia\s*\)?/gi;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (/^[-_—–=]{4,}$/.test(line)) {
      if (started) break;
      continue;
    }
    const m = line.match(/^[-•*–·\s]*(\d+)\s*[-–]?\s*(.+)$/);
    if (!m) {
      const n = norm(line);
      if (!n) continue;
      const titles = (w) => [w.stockTitle, w.name, w.salesTitle].map(norm).filter(Boolean);
      const w =
        state.warehouses.find((w) => titles(w).includes(n)) ||
        state.warehouses.find((w) => titles(w).some((t) => n.includes(t)));
      if (w) {
        cur = w.id;
        result[cur] = result[cur] || [];
      }
      continue;
    }
    if (!cur) continue;
    let name = m[2];
    const inc = incRe.test(name);
    incRe.lastIndex = 0;
    name = name.replace(incRe, '').replace(/[\s\-–.,;:]+$/, '').replace(/\s+/g, ' ').trim();
    if (!name) continue;
    result[cur].push({ qty: Number(m[1]), name, inc, match: findProductByName(name) });
    started = true;
  }
  return result;
}

export function applyStockImport(parsed, { date, zeroOthers = true, makeIncidents = true }) {
  let created = 0;
  let changes = 0;
  for (const whId of Object.keys(parsed)) {
    const target = {};
    for (const it of parsed[whId]) {
      let p = findProductByName(it.name);
      if (!p) {
        p = addProduct(it.name);
        created++;
      }
      target[p.id] = (target[p.id] || 0) + it.qty;
      if (it.inc && makeIncidents && !hasIncident(whId, p.id)) {
        state.incidents.push({ id: uid(), date, ts: Date.now(), wh: whId, pid: p.id, text: `${p.name}: marcado con incidencia en el cierre anterior`, status: 'abierta' });
      }
    }
    if (zeroOthers) {
      const cur = stockMap()[whId] || {};
      for (const pid of Object.keys(cur)) if (!(pid in target) && cur[pid]) target[pid] = 0;
    }
    for (const pid of Object.keys(target)) if (setStock(whId, pid, target[pid], date, 'ajuste', 'Importado desde cierre')) changes++;
  }
  return { created, changes };
}

/** Une el producto `fromId` dentro de `intoId` (stock, ventas, incidencias). */
export function mergeProducts(fromId, intoId) {
  const from = product(fromId);
  const into = product(intoId);
  if (!from || !into || fromId === intoId) return;
  for (const m of state.movements) if (m.pid === fromId) m.pid = intoId;
  for (const s of state.sales) for (const it of s.items) if (it.pid === fromId) it.pid = intoId;
  for (const i of state.incidents) if (i.pid === fromId) i.pid = intoId;
  into.aliases = [...new Set([...(into.aliases || []), from.name, ...(from.aliases || [])])];
  state.products = state.products.filter((p) => p.id !== fromId);
}

export function productInUse(pid) {
  return state.movements.some((m) => m.pid === pid) || state.sales.some((s) => s.items.some((i) => i.pid === pid));
}

/* ---------- recomendación de almacén ---------- */
export function nearestWh(municipio) {
  const m = state.municipios.find((x) => norm(x.name) === norm(municipio));
  return m?.wh || null;
}

/**
 * items: [{pid, qty}] → { rows:[{pid, qty, stock:{wh:qty}}], best, reason }
 */
export function recommendWh(items, municipio) {
  const st = stockMap();
  const near = nearestWh(municipio);
  const order = [...state.warehouses].sort((a, b) => (a.id === near ? -1 : b.id === near ? 1 : 0));
  const rows = items.map((it) => ({ ...it, stock: Object.fromEntries(state.warehouses.map((w) => [w.id, st[w.id]?.[it.pid] || 0])) }));
  const canAll = (w) => rows.every((r) => r.stock[w.id] >= num(r.qty));
  const full = order.find(canAll);
  if (!rows.length) return { rows, best: null, reason: '' };
  if (full) {
    const isNear = full.id === near;
    return {
      rows, best: full.id,
      reason: isNear
        ? `Es el almacén más cercano al cliente y tiene todo el pedido.`
        : near
          ? `El almacén más cercano (${whName(near)}) no tiene todo el pedido; ${full.name} sí.`
          : `Tiene todo el pedido disponible.`,
    };
  }
  return { rows, best: null, reason: 'Ningún almacén tiene todo el pedido. Revisa la disponibilidad por producto o divide el pedido.' };
}
