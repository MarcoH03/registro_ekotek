// Generación de textos: cierre general diario y liquidación semanal.
import {
  state, fmtDate, money, num, stockMap, moneyMap, activeSales, saleCalc, productName,
  gestorName, gestorDay, gestorStats, hasIncident, openIncidents, itemsSummary, weekSummary, plainNum, round2,
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

  const money_ = moneyMap(date);
  for (const w of state.warehouses) {
    out.push(`💵 DINERO EN CAJA ${(w.stockTitle || w.name).toUpperCase()}`, '', money(money_[w.id]?.caja || 0), '', SEP, '');
  }
  if (S.closeShowOwners) {
    out.push('💼 DINERO DE LOS DUEÑOS', '');
    for (const w of state.warehouses) out.push(`${(w.stockTitle || w.name).toUpperCase()}: ${money(money_[w.id]?.duenos || 0)}`);
    out.push('', SEP, '');
  }

  out.push('💳 COMISIONES');
  out.push(...commissionLines(date, cur));
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
  out.push(`💰 Ventas de la semana: ${w.count}`, `Total cobrado: ${money(w.total)}`, `Para los dueños: ${money(w.owners)}`, `Para la caja: ${money(w.caja)}`);
  if (w.discount) out.push(`Rebajas y combos: ${money(w.discount)}`);
  out.push('', SEP, '');
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

const round = round2;

/**
 * Gestores a los que se les debe dinero a la fecha del cierre, aunque la comisión sea de días anteriores.
 * Primero los que ganaron comisión ese día; los que ya cobraron todo no aparecen.
 */
export function commissionLines(date, cur = state.settings.currency || 'USD') {
  const today = new Map(gestorDay(date).map((e) => [e.gid, e]));
  const order = [...today.keys(), ...[...state.gestores].sort((a, b) => a.name.localeCompare(b.name, 'es')).map((g) => g.id).filter((id) => !today.has(id))];
  const lines = [];
  for (const gid of order) {
    const bal = gestorStats(gid, null, date).balance;
    if (bal <= 0) continue;
    const t = today.get(gid);
    const prev = t ? round(bal - t.total) : 0;
    const hoy = t ? t.amounts.map(plainNum).join(' + ') : '';
    if (!t) lines.push(`${gestorName(gid)}: ${plainNum(bal)} ${cur}`);
    else if (prev > 0) lines.push(`${gestorName(gid)}: ${plainNum(bal)} ${cur} (anterior ${plainNum(prev)} + hoy ${hoy})`);
    else if (prev === 0 && t.amounts.length > 1) lines.push(`${gestorName(gid)}: ${hoy} = ${plainNum(bal)} ${cur}`);
    else lines.push(`${gestorName(gid)}: ${plainNum(bal)} ${cur}`);
  }
  return lines.length ? lines : ['NINGUNA'];
}
