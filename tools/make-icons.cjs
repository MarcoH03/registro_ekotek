// Genera los iconos PNG de la app a partir de tools/icon.svg.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
(async () => {
  const svg = fs.readFileSync(path.join(__dirname, 'icon.svg'), 'utf8');
  const out = path.join(__dirname, '..', 'icons');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const shot = async (size, file, pad = 0) => {
    await page.setViewportSize({ width: size, height: size });
    const inner = size - pad * 2;
    await page.setContent(`<html><body style="margin:0;background:#0b8f6a"><div style="padding:${pad}px;width:${size}px;height:${size}px;box-sizing:border-box;background:linear-gradient(#3ddc84,#0b8f6a)">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div></body></html>`);
    await page.screenshot({ path: path.join(out, file) });
  };
  await shot(180, 'apple-touch-icon.png');
  await shot(192, 'icon-192.png');
  await shot(512, 'icon-512.png');
  await shot(512, 'icon-maskable-512.png', 56);
  await browser.close();
})();
