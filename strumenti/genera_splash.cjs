// Schermate di avvio per iPhone (apple-touch-startup-image): node strumenti/genera_splash.cjs
// iOS non le ricava dal manifest: serve un'immagine per ogni misura di schermo.
// Riproducono l'intro (icona + nome) così l'apertura non ha stacchi bianchi.
// Scrive icons/splash/*.png e aggiorna i <link> in index.html tra i commenti SPLASH.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const RADICE = path.join(__dirname, '..');

// larghezza x altezza in punti CSS, densità (verticale)
const SCHERMI = [
  [440, 956, 3], // 16/17 Pro Max
  [402, 874, 3], // 16 Pro, 17, 17 Pro
  [420, 912, 3], // Air
  [430, 932, 3], // 14 Pro Max, 15 Plus/Pro Max, 16 Plus
  [393, 852, 3], // 14 Pro, 15, 15 Pro, 16, 16e
  [428, 926, 3], // 12/13 Pro Max, 14 Plus
  [390, 844, 3], // 12, 13, 14, 12/13 Pro
  [375, 812, 3], // X, XS, 11 Pro, 12/13 mini (scalato)
  [414, 896, 3], // XS Max, 11 Pro Max
  [414, 896, 2], // XR, 11
  [414, 736, 3], // 6/7/8 Plus
  [375, 667, 2], // SE 2a/3a gen, 6/7/8
];
const TEMI = {
  chiaro: { sfondo: '#f6f4ef', nome: '#2f6b4f', media: '(prefers-color-scheme: light)' },
  scuro: { sfondo: '#121614', nome: '#5fae86', media: '(prefers-color-scheme: dark)' },
};

(async () => {
  const icona = fs.readFileSync(path.join(RADICE, 'icons/icona.svg'), 'utf8');
  const dest = path.join(RADICE, 'icons/splash');
  fs.mkdirSync(dest, { recursive: true });
  const b = await chromium.launch();
  const link = [];
  for (const [w, h, d] of SCHERMI) {
    const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: d });
    for (const [nomeTema, t] of Object.entries(TEMI)) {
      // stessa disposizione di .intro in css/stile.css (icona 160px, nome, riga di stato vuota)
      await p.setContent(`<html><body style="margin:0;background:${t.sfondo}">
        <div style="position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;font:16px/1.4 -apple-system,system-ui,sans-serif">
          <div style="width:160px;height:160px;border-radius:35px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,.18)">${icona.replace('<svg ', '<svg width="160" height="160" ')}</div>
          <p style="margin:14px 0 0;font-size:22px;font-weight:700;color:${t.nome}">Mi-Piatti</p>
          <p style="margin:0;font-size:14px;min-height:1.4em"></p>
        </div></body></html>`);
      const file = `splash-${w * d}x${h * d}-${nomeTema}.png`;
      await p.screenshot({ path: path.join(dest, file) });
      link.push(`  <link rel="apple-touch-startup-image" href="icons/splash/${file}" media="screen and (device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${d}) and (orientation: portrait) and ${t.media}">`);
    }
    await p.close();
  }
  await b.close();
  const idx = path.join(RADICE, 'index.html');
  const html = fs.readFileSync(idx, 'utf8');
  const blocco = `  <!-- SPLASH: generato da strumenti/genera_splash.cjs -->\n${link.join('\n')}\n  <!-- /SPLASH -->`;
  const nuovo = /  <!-- SPLASH[\s\S]*?\/SPLASH -->/.test(html)
    ? html.replace(/  <!-- SPLASH[\s\S]*?\/SPLASH -->/, blocco)
    : html.replace('<!-- SPLASH -->', blocco.trimStart());
  fs.writeFileSync(idx, nuovo);
  console.log(`${link.length} schermate di avvio scritte in icons/splash`);
})();
