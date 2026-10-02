// Genera capturas de la app con datos de ejemplo (vista previa y manual).
// Uso: npx http-server -p 8080 . &  →  NODE_PATH=$(npm root -g) node tools/screenshots.cjs
// Opcional: FONT_DIR con los .woff2 de Inter para imitar la tipografía de iOS.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const URL = process.env.APP_URL || 'http://localhost:8080/';
const OUT = process.env.OUT_DIR || path.join(__dirname, '..', 'preview');
const FONT_DIR = process.env.FONT_DIR || '';
const DARK = process.env.DARK === '1';

const STOCK_TEXT = fs.readFileSync(path.join(__dirname, 'ejemplo-cierre.txt'), 'utf8');

async function seed(page) {
  await page.evaluate(async (stockText) => {
    const S = await import('/js/store.js');
    const { state } = S;
    const t = S.today();
    const ws = S.weekStart(t);
    const day = (n) => S.addDays(ws, n);
    Object.assign(state.settings, { asesor: 'Marco Cañizares', asesores: ['Marco Cañizares', 'Laura Gómez'], onboarded: true, lastBackup: t });

    S.applyStockImport(S.parseStockText(stockText), { date: S.addDays(ws, -1), zeroOthers: true, makeIncidents: false });
    const P = (n) => S.findProductByName(n);
    S.mergeProducts(P('Bluebety').id, P('Bluetty').id);
    S.mergeProducts(P('Dji 1000 V2').id, P('DJI Power 1000 V2').id);
    const prices = {
      'Ecoflow River 2 Pro': 420, 'Ecoflow Delta 3 Max': 1150, 'Ecoflow Delta 3': 690, 'Paneles rígidos RONMA de 685W': 165,
      'Ecoflow D2 extra battery': 520, 'Bluetty': 760, 'Oupes Exodus 1200': 540, 'DJI Power 1000 V2': 720, 'Ecoflow D2 Max': 890,
      'Oupes Guardia 6k': 1950, 'Paneles 685 W': 160, 'Panel portable 160 W': 190, 'Panel 45 W': 70, 'Oupes B2 Extra Battery': 610,
      'Ecoflow Extra Battery Delta 2': 520, 'Oupes G5 Extra Battery': 980, 'Growatt Helios 3600': 1490, 'Oupes Mega 3': 1180,
      'Oupes Exodus Mega 1': 450, 'Ecoflow Delta 2 Max': 890, 'Oupes Guardian 6000v2': 2050, 'Oupes Mega 2': 820,
      'Ecoflow Delta 3 Plus': 790, 'Paneles Solares Monocristalinos Bifaciales': 150, 'Paneles Portátiles de 30 W': 55, 'Panel Solar de 160w': 185,
    };
    for (const p of state.products) p.price = prices[p.name] || 100;

    const G = {};
    for (const [name, phone] of [
      ['Ernesto', '53124578'], ['Alicia R.', '52348812'], ['Yoel', '55671203'], ['55501122', ''], ['55503344', ''],
      ['Luis Alberto', '54219087'], ['Dayana', '58003341'], ['55507788 Yanet Gil', ''],
    ]) G[name] = S.addGestor(name, phone).id;

    let ts = Date.now() - 6 * 864e5;
    const sale = (o) => {
      const items = o.items.map(([n, q]) => ({ pid: P(n).id, qty: q, price: P(n).price }));
      const base = items.reduce((a, i) => a + i.qty * i.price, 0);
      const s = {
        id: S.uid(), ts: (ts += 3600e3), date: o.date, vale: o.vale, type: o.type || 'recogida', wh: o.wh, items,
        total: base + (o.extra || 0), payMethod: o.pay || 'efectivo', cashAmount: o.cash || 0, cashWh: o.wh,
        gestores: (o.g || []).map(([n, a]) => ({ gid: G[n], amount: a })), client: o.client || '', phone: o.phone || '',
        municipio: o.muni || '', address: o.address || '', notes: o.notes || '', asesor: o.asesor || 'Marco Cañizares',
        delivered: !!o.delivered, deliveredDate: o.delivered ? o.date : '', deliveredWh: o.delivered ? o.wh : null, void: false,
      };
      state.sales.push(s);
      S.syncSaleMovements(s);
      return s;
    };
    // Semana en curso
    sale({ date: day(0), vale: '1498', wh: 'lisa', items: [['Oupes Mega 2', 1]], extra: 20, g: [['Alicia R.', 20]], asesor: 'Laura Gómez', muni: 'Playa' });
    sale({ date: day(0), vale: '1499', wh: 'cerro', items: [['Ecoflow Delta 3', 1]], extra: 30, g: [['Luis Alberto', 15]], asesor: 'Laura Gómez' });
    sale({ date: day(1), vale: '1503', wh: 'lisa', items: [['Oupes Exodus 1200', 2]], extra: 40, g: [['55503344', 40]], pay: 'transferencia', muni: 'Marianao' });
    sale({ date: day(1), vale: '1504', wh: 'lisa', items: [['Paneles Solares Monocristalinos Bifaciales', 4]], extra: 0 });
    sale({ date: day(2), vale: '1510', wh: 'cerro', items: [['DJI Power 1000 V2', 1]], extra: 25, g: [['Dayana', 20]] });
    sale({ date: day(2), vale: '1511', wh: 'lisa', items: [['Oupes Mega 3', 1]], extra: 60, g: [['55503344', 60]], muni: 'La Lisa' });
    sale({ date: day(3), vale: '1520', wh: 'lisa', items: [['Oupes Mega 2', 1]], extra: 80, g: [['55503344', 80]], pay: 'mixto', cash: 500 });
    sale({ date: day(3), vale: '1521', wh: 'cerro', items: [['Ecoflow D2 extra battery', 1]], extra: 20, g: [['55507788 Yanet Gil', 20]] });
    sale({ date: day(3), vale: '1522', wh: 'cerro', type: 'anticipada', items: [['Ecoflow Delta 3 Max', 1]], extra: 50, g: [['Ernesto', 30]], client: 'Rosa Fernández', phone: '52223344', muni: 'Diez de Octubre' });
    // Hoy
    if (S.addDays(ws, 4) <= t) {
      sale({ date: t, vale: '1532', wh: 'cerro', items: [['Oupes Exodus 1200', 1]], extra: 28, g: [['Ernesto', 28]], muni: 'Cerro', client: 'Carlos M.' });
      sale({ date: t, vale: '1533', wh: 'cerro', items: [['Ecoflow River 2 Pro', 1]], extra: 10, g: [['Yoel', 5]], muni: 'Plaza de la Revolución' });
      sale({ date: t, vale: '1534', wh: 'lisa', items: [['Oupes Exodus Mega 1', 1]], extra: 10, g: [['Yoel', 5]], muni: 'Playa' });
      sale({ date: t, vale: '1535', wh: 'lisa', type: 'envio', items: [['Oupes Mega 2', 2]], extra: 40, g: [['55501122', 20], ['Alicia R.', 20]], client: 'Javier R.', phone: '53334455', muni: 'Marianao', address: 'Calle 51 #12408' });
      sale({ date: t, vale: '1536', wh: 'lisa', type: 'anticipada', items: [['Oupes Guardian 6000v2', 1]], extra: 50, g: [['Dayana', 20]], pay: 'transferencia', client: 'Yudith Pérez', phone: '54445566', muni: 'La Lisa' });
    }
    // Caja
    state.cash.push({ id: S.uid(), date: S.addDays(ws, -1), ts: 1, wh: 'cerro', amount: 20, type: 'ajuste', note: 'Saldo del cierre anterior' });
    state.cash.push({ id: S.uid(), date: S.addDays(ws, -1), ts: 2, wh: 'lisa', amount: 615, type: 'ajuste', note: 'Saldo del cierre anterior' });
    state.cash.push({ id: S.uid(), date: day(2), ts: 3, wh: 'lisa', amount: -1500, type: 'entrega', note: 'Entregado a los dueños' });
    state.cash.push({ id: S.uid(), date: day(3), ts: 4, wh: 'cerro', amount: -15, type: 'gasto', note: 'Transporte del panel' });
    // Incidencias
    state.incidents.push({ id: S.uid(), date: S.addDays(t, -1), ts: 10, wh: 'cerro', pid: P('Paneles rígidos RONMA de 685W').id, status: 'abierta', text: '1 panel RONMA 685W no se trajo a Kholy desde el Cerro' });
    state.incidents.push({ id: S.uid(), date: t, ts: 11, wh: 'cerro', pid: P('Ecoflow Delta 3').id, status: 'abierta', text: 'En el último cierre en el Cerro había 5 Delta 3 y ahora falta 1' });
    state.counts.push({ id: S.uid(), date: t, ts: Date.now() - 5 * 3600e3, wh: 'lisa', diffs: [] });
    S.save();
  }, STOCK_TEXT);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ args: ['--lang=es-ES'] });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    colorScheme: DARK ? 'dark' : 'light', locale: 'es-ES', serviceWorkers: 'block',
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && errors.push(m.text()));
  page.on('response', (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));
  if (FONT_DIR) {
    await page.route('**/__fonts/*', (r) => r.fulfill({ path: path.join(FONT_DIR, path.basename(r.request().url())), contentType: 'font/woff2' }));
  }
  const decorate = async () => {
    const fontCss = FONT_DIR
      ? [400, 500, 600, 700].map((w) => `@font-face{font-family:'SF Pro Text';font-weight:${w};src:url(/__fonts/inter-latin-${w}-normal.woff2) format('woff2');}@font-face{font-family:'SF Pro Text';font-weight:${w};src:url(/__fonts/inter-latin-ext-${w}-normal.woff2) format('woff2');unicode-range:U+0100-024F;}`).join('')
      : '';
    await page.addStyleTag({
      content: `${fontCss}
      :root{--safe-t:47px;--safe-b:34px;}
      body{letter-spacing:-0.35px}
      #sb{position:fixed;top:0;left:0;right:0;height:47px;z-index:999;display:flex;align-items:center;justify-content:space-between;padding:6px 30px 0 44px;font:600 16px 'SF Pro Text',sans-serif;color:var(--label);pointer-events:none}
      #sb i{display:inline-block;width:25px;height:12px;border:1.5px solid var(--label);border-radius:4px;position:relative;opacity:.9}
      #sb i::after{content:'';position:absolute;inset:1.5px;right:4px;background:var(--label);border-radius:1.5px}
      #hi{position:fixed;left:50%;bottom:8px;width:134px;height:5px;margin-left:-67px;border-radius:3px;background:var(--label);z-index:999;pointer-events:none}
      html.has-sheet #sb{color:#fff} html.has-sheet #sb i{border-color:#fff} html.has-sheet #sb i::after{background:#fff}`,
    });
    await page.evaluate(() => {
      const sb = document.createElement('div');
      sb.id = 'sb';
      sb.innerHTML = '<span>9:41</span><span style="display:flex;gap:6px;align-items:center;font-size:13px">●●●● &nbsp;<i></i></span>';
      document.body.appendChild(sb);
      const hi = document.createElement('div');
      hi.id = 'hi';
      document.body.appendChild(hi);
    });
    await page.evaluate(() => document.fonts.ready);
  };
  const shot = async (name) => {
    await page.waitForTimeout(550);
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
    console.log('✓', name);
  };
  const top = (sel) => page.locator('.sheet-wrap.open').last().locator(sel).first();
  const closeTop = async () => {
    await page.evaluate(async () => {
      const ui = await import('/js/ui.js');
      ui.sheets[ui.sheets.length - 1]?.close();
    });
    await page.waitForTimeout(400);
  };
  const tab = async (t) => {
    await page.click(`.tabbar [data-tab="${t}"]`);
    await page.evaluate(() => window.scrollTo(0, 0));
  };
  const scrollSheet = (y) => page.evaluate((yy) => { const b = [...document.querySelectorAll('.sheet-wrap.open .sheet-body')].pop(); b.scrollTop = yy; }, y);

  // 0. Bienvenida (estado vacío)
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await decorate();
  if (!DARK) await shot('00-bienvenida');

  // Datos de ejemplo
  await seed(page);
  await page.reload();
  await decorate();

  if (!DARK) {
    // 1. Hoy
    await shot('01-hoy');
    await page.evaluate(() => window.scrollTo(0, 600));
    await shot('02-hoy-abajo');
    await page.evaluate(() => window.scrollTo(0, 0));

    // 2. Nueva venta
    await page.click('.tile[data-act="newSale"]');
    await page.waitForTimeout(400);
    await top('[data-bind="vale"]').fill('1537');
    await top('[data-act="seg"][data-name="wh"][data-v="lisa"]').click();
    await top('[data-act="addItem"]').click();
    await page.waitForTimeout(450);
    await top('[data-search]').fill('mega 2');
    await page.waitForTimeout(200);
    await shot('03-elegir-producto');
    await top('[data-act="pick"]').click();
    await page.waitForTimeout(450);
    await top('[data-bind="total"]').fill('860');
    await top('[data-act="addGest"]').click();
    await page.waitForTimeout(450);
    await top('[data-search]').fill('ernesto');
    await top('[data-act="pick"]').click();
    await page.waitForTimeout(450);
    await top('[data-bind="gestores.0.amount"]').fill('25');
    await top('[data-bind="gestores.0.amount"]').blur();
    await scrollSheet(0);
    await shot('04-nueva-venta');
    await scrollSheet(560);
    await shot('05-nueva-venta-reparto');
    await top('[data-act="save"]').click();
    await page.waitForTimeout(1900);

    // 3. Ventas
    await tab('ventas');
    await shot('06-ventas');
    await page.click('.sale-row >> nth=1');
    await shot('07-detalle-venta');
    await closeTop();

    // 4. Inventario
    await tab('inventario');
    await page.click('[data-act="seg"][data-name="invWh"][data-v="cerro"]');
    await shot('08-inventario');
    await page.click('[data-act="seg"][data-name="invWh"][data-v="todos"]');
    await shot('09-inventario-ambos');
    await page.click('#inv-list .row >> nth=2');
    await shot('10-ficha-producto');
    await closeTop();

    // 5. Conteo con diferencia
    await page.click('.chips [data-act="count"]');
    await page.waitForTimeout(400);
    await top('[data-act="seg"][data-v="cerro"]').click();
    await page.waitForTimeout(200);
    const pid = await page.evaluate(async () => (await import('/js/store.js')).findProductByName('Oupes Exodus 1200').id);
    await top(`[data-count="${pid}"]`).fill('6');
    await shot('11-conteo');
    await top('[data-act="save"]').click();
    await page.waitForTimeout(400);
    await page.click('.alert-ov.open .alert-btns button.bold');
    await page.waitForTimeout(1900);

    // 6. ¿Dónde buscar?
    await page.click('.chips [data-act="finder"]');
    await page.waitForTimeout(400);
    await top('[data-act="addItem"]').click();
    await page.waitForTimeout(450);
    await top('[data-search]').fill('river');
    await top('[data-act="pick"]').click();
    await page.waitForTimeout(450);
    await top('[data-act="addItem"]').click();
    await page.waitForTimeout(450);
    await top('[data-search]').fill('delta 3');
    await top('[data-act="pick"]').click();
    await page.waitForTimeout(450);
    await top('[data-act="muni"]').click();
    await page.waitForTimeout(450);
    await top('[data-search]').fill('playa');
    await top('[data-act="pick"]').click();
    await page.waitForTimeout(450);
    await shot('12-donde-buscar');
    await closeTop();

    // 7. Importar
    await page.click('[data-act="invMenu"]');
    await page.waitForTimeout(400);
    await page.click('.as-group button >> nth=5');
    await page.waitForTimeout(450);
    await top('textarea').fill(fs.readFileSync(path.join(__dirname, 'ejemplo-cierre.txt'), 'utf8'));
    await shot('13-importar');
    await top('[data-act="parse"]').click();
    await shot('14-importar-revision');
    await closeTop();

    // 8. Caja e incidencias
    await tab('hoy');
    await page.evaluate(() => window.scrollTo(0, 500));
    await page.click('[data-act="cash"][data-wh="lisa"]');
    await shot('15-caja');
    await closeTop();
    await page.click('[data-act="incidents"]');
    await shot('16-incidencias');
    await closeTop();

    // 9. Gestores
    await tab('gestores');
    await shot('17-gestores');
    await page.click('[data-act="gestor"] >> nth=0');
    await shot('18-gestor');
    await closeTop();
    await page.click('.week-card');
    await shot('19-liquidacion');
    await scrollSheet(500);
    await shot('20-liquidacion-asesores');
    await closeTop();

    // 10. Cierre
    await tab('cierre');
    await shot('21-cierre');
    await page.evaluate(() => window.scrollTo(0, 420));
    await shot('22-cierre-texto');
    await page.evaluate(() => window.scrollTo(0, 1500));
    await shot('23-cierre-texto-2');
    const text = await page.inputValue('#closure-text');
    fs.writeFileSync(path.join(OUT, 'cierre-ejemplo.txt'), text);

    // 11. Ajustes
    await tab('hoy');
    await page.click('[data-act="settings"]');
    await shot('24-ajustes');
    await closeTop();
  } else {
    await shot('01-hoy-oscuro');
    await tab('ventas');
    await shot('06-ventas-oscuro');
    await page.click('.sale-row >> nth=0');
    await shot('07-detalle-oscuro');
  }

  console.log(errors.length ? 'ERRORES:\n' + errors.join('\n') : 'Sin errores de consola');
  await browser.close();
})();
