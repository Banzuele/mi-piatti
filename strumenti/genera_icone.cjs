// Genera le icone di Mi-Piatti (tre piatti = la famiglia): node strumenti/genera_icone.cjs icons
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const DEST = process.argv[2];

const VERDE = '#2f6b4f';
const VERDE_SCURO = '#275c43';

// Piatto grande a sinistra, medio in alto a destra, piccolo in basso a destra,
// tutti staccati tra loro; poi il gruppo è centrato e scalato per stare nel margine.
const GAP = 18;
function disposizione() {
  const rL = 120, rM = 84, rS = 58;
  const pos = (ang, d) => [Math.cos(ang * Math.PI / 180) * d, Math.sin(ang * Math.PI / 180) * d];
  const c = [[0, 0, rL], [...pos(-38, rL + rM + GAP), rM], [...pos(42, rL + rS + GAP), rS]];
  // centra sul cerchio minimo approssimato: centro del rettangolo di ingombro
  const minX = Math.min(...c.map(([x, , r]) => x - r)), maxX = Math.max(...c.map(([x, , r]) => x + r));
  const minY = Math.min(...c.map(([, y, r]) => y - r)), maxY = Math.max(...c.map(([, y, r]) => y + r));
  const ox = (minX + maxX) / 2, oy = (minY + maxY) / 2;
  const cc = c.map(([x, y, r]) => [x - ox, y - oy, r]);
  const lato = Math.max(maxX - minX, maxY - minY);
  const raggio = Math.max(...cc.map(([x, y, r]) => Math.hypot(x, y) + r));
  return { cc, lato, raggio };
}
// scala: per le icone normali il gruppo occupa "lato" px; per le maskable sta nel cerchio sicuro
function piatti(modo) {
  const { cc, lato, raggio } = disposizione();
  const k = modo === 'maskable' ? 190 / raggio : modo === 'apple' ? 205 / raggio : 372 / lato;
  return cc.map(([x, y, r0]) => {
    const r = r0 * k, cx = 256 + x * k, cy = 256 + y * k;
    const sw = Math.max(6, r * 0.12);
    return `<circle cx="${(cx + r * 0.04).toFixed(1)}" cy="${(cy + r * 0.08).toFixed(1)}" r="${r.toFixed(1)}" fill="#1d4532" opacity=".55"/>
    <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(r - sw / 2).toFixed(1)}" fill="${VERDE_SCURO}" stroke="#fff" stroke-width="${sw.toFixed(1)}"/>
    <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(r * 0.6).toFixed(1)}" fill="none" stroke="#fff" stroke-width="${(sw * 0.5).toFixed(1)}" opacity=".85"/>`;
  }).join('\n    ');
}

// tipo: "arrotondata" (sfondo con angoli), "piena" (quadrato pieno, per maskable/apple), scala del contenuto
function svg({ tondo = true, modo = 'normale' } = {}) {
  const sfondo = tondo
    ? `<rect width="512" height="512" rx="112" fill="${VERDE}"/>`
    : `<rect width="512" height="512" fill="${VERDE}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  ${sfondo}
  ${piatti(modo)}
</svg>
`;
}

(async () => {
  const varianti = {
    'icona.svg': { svg: svg(), size: null },
    'icona-192.png': { svg: svg(), size: 192 },
    'icona-512.png': { svg: svg(), size: 512 },
    'icona-maskable-512.png': { svg: svg({ tondo: false, modo: 'maskable' }), size: 512 },
    'icona-180.png': { svg: svg({ tondo: false, modo: 'apple' }), size: 180 },
    'favicon-32.png': { svg: svg(), size: 32 },
  };
  const b = await chromium.launch();
  const p = await b.newPage();
  for (const [nome, v] of Object.entries(varianti)) {
    if (!v.size) { fs.writeFileSync(path.join(DEST, nome), v.svg); continue; }
    await p.setViewportSize({ width: v.size, height: v.size });
    await p.setContent(`<html><body style="margin:0;background:transparent">${v.svg.replace('<svg ', `<svg width="${v.size}" height="${v.size}" `)}</body></html>`);
    await p.screenshot({ path: path.join(DEST, nome), omitBackground: true });
  }
  await b.close();
})();
