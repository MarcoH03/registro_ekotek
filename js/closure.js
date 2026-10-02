// Generación de textos: cierre general diario y liquidación semanal.
import {
  state, fmtDate, money, num, stockMap, cashMap, activeSales, saleCalc, productName,
  gestorName, gestorDay, hasIncident, openIncidents, itemsSummary, weekSummary, plainNum,
} from './store.js';

export const SEP = '------------------------------------';

function saleLines(s, suffix = '') {
  const S = state.settings;
  const lines = s.items.map((it) => `${num(it.qty)}-${productName(it.pid)}${suffix}`);
  const extras = [];
  if (S.closeShowVale && s.vale) extras.push(`Vale ${s.vale}`);
  if (S.closeShowMoney) extras.push(money(saleCalc(s).total));
  if (extras.length && lines.length) lines[lines.length - 1] += ` (${extras.join(' · ')})`;
  return lines;
}

export function buildClosure(date) {
  const S = state.settings;
  const cur = S.currency || 'USD';
  const out = [];
  out.push('📊 *VENTAS GENERALES*', '', `📅 ${fmtDate(date)}`, '', `🧑‍🧒 Asesor Comercial: ${S.asesor || ''}`, '', '', SEP, '');

  const sales = activeSales().sort((a, b) => a.ts - b.ts);
  for (const w of state.warehouses) {
    out.push(`${w.emoji} ${(w.salesTitle || w.name).toUpperCase()}`, '', '', '💰 Ventas:', '');
    const day = sales.filter((s) => s.wh === w.id && s.date === date && s.type !== 'anticipada');
    const delivered = sales.filter(
      (s) => s.type === 'anticipada' && s.delivered && s.deliveredDate === date && (s.deliveredWh || s.wh) === w.id,
    );
    const rec = day.filter((s) => s.type !== 'envio');
    const env = day.filter((s) => s.type === 'envio');
    if (!rec.length && !env.length && !delivered.length) out.push('•   NINGUNA', '');
    if (rec.length || delivered.length) {
      out.push('🔄 Recogidas:');
      rec.forEach((s) => out.push(...saleLines(s)));
      delivered.forEach((s) => out.push(...saleLines(s, ' (compra anticipada)')));
      out.push('');
    }
    if (env.length) {
      out.push('🚚 Mensajerías:');
      env.forEach((s) => out.push(...saleLines(s)));
      out.push('');
    }
    out.push('', '📋 Compras anticipadas:', '');
    const ant = sales.filter((s) => s.type === 'anticipada' && s.date === date && s.wh === w.id);
    if (!ant.length) out.push('•   NINGUNA');
    else ant.forEach((s) => out.push(...saleLines(s, s.client ? ` (${s.client})` : '')));
    out.push('', SEP, '');
  }

  out.push('📦 *EN STOCK*', '');
  const st = stockMap(date);
  for (const w of state.warehouses) {
    out.push(`${w.emoji} ${(w.stockTitle || w.name).toUpperCase()}`);
    const lines = state.products
      .filter((p) => num(st[w.id]?.[p.id]))
      .map((p) => `- ${st[w.id][p.id]} ${p.name}${hasIncident(w.id, p.id, date) ? ' (Incidencia)' : ''}`);
    out.push(...(lines.length ? lines : ['- Sin productos']), '', '');
  }
  out.push(SEP, '');

  const cash = cashMap(date);
  for (const w of state.warehouses) {
    out.push(`💵 DINERO EN CAJA ${(w.stockTitle || w.name).toUpperCase()}`, '', money(cash[w.id] || 0), '', SEP, '');
  }

  out.push('💳 COMISIONES');
  const comm = gestorDay(date);
  if (!comm.length) out.push('NINGUNA');
  for (const c of comm) {
    const amounts = c.amounts.map(plainNum);
    out.push(
      amounts.length > 1
        ? `${gestorName(c.gid)}: ${amounts.join(' + ')} = ${plainNum(c.total)} ${cur}`
        : `${gestorName(c.gid)}: ${amounts[0]} ${cur}`,
    );
  }
  out.push('', '', SEP, '');

  out.push('📋 LISTADO DE COMPRAS ANTICIPADAS ', '#| Cliente| Cantidad / Equipos');
  const pending = sales.filter(
    (s) => s.type === 'anticipada' && s.date <= date && (!s.delivered || (s.deliveredDate || s.date) > date),
  );
  pending.forEach((s, i) => out.push(`${s.vale || i + 1}| ${s.client || '—'}| ${itemsSummary(s.items)}`));
  out.push('', '', SEP, '');

  out.push('⚠️ INCIDENCIAS:');
  const inc = state.incidents
    .filter((i) => i.date === date || openIncidents(date).includes(i))
    .sort((a, b) => a.date.localeCompare(b.date) || a.ts - b.ts);
  if (!inc.length) out.push('- NINGUNA');
  inc.forEach((i, n) => {
    const tags = [];
    if (i.date < date) tags.push(`desde ${fmtDate(i.date)}`);
    if (i.status === 'resuelta' && i.resolvedDate && i.resolvedDate <= date) tags.push('resuelta');
    out.push(`${n + 1}- ${i.text}${tags.length ? ` (${tags.join(', ')})` : ''}`);
  });
  return out.join('\n');
}

export function buildWeekly(ws) {
  const w = weekSummary(ws);
  const cur = state.settings.currency || 'USD';
  const out = [];
  out.push('💳 *LIQUIDACIÓN SEMANAL*', '', `📅 Semana del ${fmtDate(w.ws)} al ${fmtDate(w.we)}`, '');
  out.push(`🧑‍🧒 Asesor: ${state.settings.asesor || ''}`, '', SEP, '');
  out.push(`💰 Ventas de la semana: ${w.count}`, `Total cobrado: ${money(w.total)}`, `Sobreprecio para los dueños: ${money(w.ownerExtra)}`, '', SEP, '');
  out.push('👥 GESTORES (a entregar el lunes)');
  const pay = w.gestores.filter((x) => x.balance > 0);
  if (!pay.length) out.push('NINGUNO');
  pay.forEach((x) => {
    const carry = round(x.balance - x.week);
    out.push(`${x.g.name}: ${plainNum(x.balance)} ${cur}${carry > 0 ? ` (semana ${plainNum(x.week)} + pendiente anterior ${plainNum(carry)})` : ''}`);
  });
  const totalG = pay.reduce((a, x) => a + x.balance, 0);
  out.push(`Total gestores: ${plainNum(totalG)} ${cur}`, '', SEP, '');
  out.push(`🧑‍💼 ASESORES (${w.pct}% de las ventas)`);
  if (!w.asesores.length) out.push('NINGUNO');
  w.asesores.forEach((a) => out.push(`${a.name}: ${plainNum(a.commission)} ${cur} (ventas ${money(a.base)})`));
  return out.join('\n');
}

const round = (n) => Math.round(n * 100) / 100;
