// Genera manual/Manual-Registro-Ekotek.pdf a partir de tools/manual.html y las capturas de preview/.
// Uso: NODE_PATH=$(npm root -g) node tools/make-manual.cjs   (opcional: FONT_DIR con Inter .woff2)
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const src = path.join(__dirname, 'manual.html');
  const out = path.join(__dirname, '..', 'manual', 'Manual-Registro-Ekotek.pdf');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('file://' + src);
  const fontDir = process.env.FONT_DIR;
  if (fontDir) {
    const css = [400, 500, 600, 700]
      .map((w) => `@font-face{font-family:'SF Pro Text';font-weight:${w};src:url(file://${path.join(fontDir, `inter-latin-${w}-normal.woff2`)});}@font-face{font-family:'SF Pro Text';font-weight:${w};src:url(file://${path.join(fontDir, `inter-latin-ext-${w}-normal.woff2`)});unicode-range:U+0100-024F;}`)
      .join('');
    await page.addStyleTag({ content: css });
  }
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  await page.pdf({
    path: out,
    format: 'A4',
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate: '<div style="width:100%;font-size:8px;color:#8e8e93;padding:0 16mm;display:flex;justify-content:space-between;font-family:Arial"><span>Registro Ekotek · Manual de uso</span><span class="pageNumber"></span></div>',
    margin: { top: '16mm', bottom: '18mm', left: '16mm', right: '16mm' },
  });
  await browser.close();
  console.log('PDF:', out);
})();
