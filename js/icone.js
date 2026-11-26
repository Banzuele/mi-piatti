// Icone dell'app: pittogrammi pieni e piatti, nel colore del testo con un
// accento ambra (classe "a"). Disegnati su una griglia 24×24; "s" = tratto nel
// colore del testo, "as" = tratto ambra. Colori in css/stile.css (.ic).

const raggi = (d) => [0, 45, 90, 135].map((g) => `<path transform="rotate(${g} 12 12)" d="${d}"/>`).join("");
const denti = () => [0, 45, 90, 135, 180, 225, 270, 315]
  .map((g) => `<rect transform="rotate(${g} 12 12)" x="10.3" y="1.6" width="3.4" height="4" rx=".8"/>`).join("");
const petali = [[12, 6.6], [17.1, 10.3], [15.2, 16.4], [8.8, 16.4], [6.9, 10.3]]
  .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.4"/>`).join("");

export const ICONE = {
  // pasti
  pranzo: raggi("M10.9 1h2.2v3.6h-2.2zM10.9 19.4h2.2V23h-2.2z") + `<circle class="a" cx="12" cy="12" r="5.3"/>`,
  cena: `<path d="M13.6 2.2a9.8 9.8 0 1 0 8.2 13.9A7.6 7.6 0 0 1 13.6 2.2z"/><path class="a" d="M18.5 2.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z"/>`,
  avanzi: `<rect class="a" x="9" y="2.6" width="6" height="3.2" rx="1"/><path class="a" d="M3.6 5h16.8A1.6 1.6 0 0 1 22 6.6V9H2V6.6A1.6 1.6 0 0 1 3.6 5z"/><path fill-rule="evenodd" d="M3 10.2h18v8.3a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 18.5zM7.5 13.2h9v2.2h-9z"/>`,
  // tipi di piatto
  pollo: `<ellipse cx="15.2" cy="8.8" rx="6.6" ry="5.4" transform="rotate(-45 15.2 8.8)"/><path class="as" stroke-width="3" d="M11 13 5.6 18.4"/><circle class="a" cx="3.9" cy="17.9" r="2"/><circle class="a" cx="6.1" cy="20.1" r="2"/>`,
  carne: `<path d="M4.2 8.2C4.6 4.6 8.6 2.7 13 3.2s8.4 3.6 7.9 8.1c-.4 3.4-2.6 4.6-4.6 6.1s-4 3.8-7.6 3.3S2.7 17.4 3.2 14.6c.3-1.6 1.6-2.4 1.3-3.8-.3-1-.4-1.6-.3-2.6z"/><circle class="a" cx="10.2" cy="9.6" r="2.8"/>`,
  pesce: `<path fill-rule="evenodd" d="M1.3 12C3.8 8 7.3 6 10.8 6s6.1 2.5 7.6 6c-1.5 3.5-4.1 6-7.6 6S3.8 16 1.3 12zM4.1 11a1 1 0 1 0 2 0 1 1 0 1 0-2 0z"/><path d="M17.4 12 22.8 7.2v9.6z"/><path class="a" d="M8.6 7.3c1 1.4 1.5 3 1.5 4.7s-.5 3.3-1.5 4.7l1.8.6c1-1.6 1.5-3.4 1.5-5.3s-.5-3.7-1.5-5.3zM12.6 7.4c.8 1.4 1.2 3 1.2 4.6s-.4 3.2-1.2 4.6l1.7.3c.8-1.5 1.2-3.2 1.2-4.9s-.4-3.4-1.2-4.9z"/>`,
  uovo: `<path d="M12.2 2.8c3 0 4.6 2 6.5 3.5s3.4 3.6 2.5 7.1-3 4.3-5 5.8-4.5 2.9-7.6 1.4S3.5 17 3.1 13.5 4.2 7.4 6.2 5.4s3-2.6 6-2.6z"/><circle class="a" cx="11.6" cy="12" r="4.1"/>`,
  formaggio: `<path class="a" d="M2 10.4 15.2 3.8l6.8 6.6z"/><path fill-rule="evenodd" d="M2 11.6h20v7.6a1.3 1.3 0 0 1-1.3 1.3H3.3A1.3 1.3 0 0 1 2 19.2zM5.6 14.6a1.7 1.7 0 1 0 3.4 0 1.7 1.7 0 1 0-3.4 0zM12.4 17.2a1.1 1.1 0 1 0 2.2 0 1.1 1.1 0 1 0-2.2 0zM16.6 14a1.3 1.3 0 1 0 2.6 0 1.3 1.3 0 1 0-2.6 0z"/>`,
  legumi: `<path d="M3 21C3 12 12 3 21 3c0 9-9 18-18 18z"/><circle class="a" cx="8" cy="16" r="2.3"/><circle class="a" cx="12" cy="12" r="2.3"/><circle class="a" cx="16" cy="8" r="2.3"/>`,
  spiga: `<path class="s" stroke-width="1.8" d="M12 22.5V6"/>${[[9.4, 8.6, -35], [14.6, 8.6, 35], [9.4, 12.6, -35], [14.6, 12.6, 35], [9.4, 16.6, -35], [14.6, 16.6, 35]]
    .map(([x, y, g]) => `<ellipse class="a" cx="${x}" cy="${y}" rx="1.8" ry="3" transform="rotate(${g} ${x} ${y})"/>`).join("")}<ellipse class="a" cx="12" cy="4" rx="1.6" ry="2.8"/>`,
  // azioni
  libro: `<path d="M11 5.6C9 4.1 5.5 3.6 2 4.6v14.2c3.5-1 7-.5 9 1z"/><path class="a" d="M13 5.6c2-1.5 5.5-2 9-1v14.2c-3.5-1-7-.5-9 1z"/>`,
  dado: `<path fill-rule="evenodd" d="M6 3h12a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3zM6.3 8a1.7 1.7 0 1 0 3.4 0 1.7 1.7 0 1 0-3.4 0zM14.3 8a1.7 1.7 0 1 0 3.4 0 1.7 1.7 0 1 0-3.4 0zM6.3 16a1.7 1.7 0 1 0 3.4 0 1.7 1.7 0 1 0-3.4 0zM14.3 16a1.7 1.7 0 1 0 3.4 0 1.7 1.7 0 1 0-3.4 0z"/><circle class="a" cx="12" cy="12" r="1.9"/>`,
  elenco: `<path fill-rule="evenodd" d="M5 4h14a1.5 1.5 0 0 1 1.5 1.5v15A1.5 1.5 0 0 1 19 22H5a1.5 1.5 0 0 1-1.5-1.5v-15A1.5 1.5 0 0 1 5 4zM7.5 10h9v1.7h-9zM7.5 13.6h9v1.7h-9zM7.5 17.2h6v1.7h-6z"/><rect class="a" x="8" y="2" width="8" height="4.6" rx="1.2"/>`,
  scambia: `<path d="M3 6h12V3l6 4.5-6 4.5V9H3z"/><path class="a" d="M21 15H9v-3l-6 4.5L9 21v-3h12z"/>`,
  cestino: `<path class="a" d="M9 2.4h6V5H9zM3 4.8h18v2.6H3z"/><path fill-rule="evenodd" d="M4.6 8.8h14.8l-1.3 11.6a1.8 1.8 0 0 1-1.8 1.6H7.7a1.8 1.8 0 0 1-1.8-1.6zM9 11.4h1.7v8H9zM13.3 11.4H15v8h-1.7z"/>`,
  matita: `<path class="a" d="M15.5 3.5l5 5L9 20l-5-5z"/><path d="M4 15l5 5-6.6 1.6z"/><path d="M16.9 2.1a1.6 1.6 0 0 1 2.3 0l2.7 2.7a1.6 1.6 0 0 1 0 2.3L20.5 8.5l-5-5z"/>`,
  occhio: `<path fill-rule="evenodd" d="M1.5 12C4 7 8 4.5 12 4.5S20 7 22.5 12C20 17 16 19.5 12 19.5S4 17 1.5 12zM6.8 12a5.2 5.2 0 1 0 10.4 0 5.2 5.2 0 1 0-10.4 0z"/><circle class="a" cx="12" cy="12" r="3.4"/><circle cx="12" cy="12" r="1.4"/>`,
  nascondi: `<path fill-rule="evenodd" d="M1.5 12C4 7 8 4.5 12 4.5S20 7 22.5 12C20 17 16 19.5 12 19.5S4 17 1.5 12zM6.8 12a5.2 5.2 0 1 0 10.4 0 5.2 5.2 0 1 0-10.4 0z"/><circle class="a" cx="12" cy="12" r="3.4"/><path class="s" stroke-width="2.4" d="M3.5 3.5l17 17"/>`,
  ripristina: `<path class="s" stroke-width="2.6" d="M6.2 7.4A7.6 7.6 0 1 1 4.6 14"/><path class="a" d="M2.2 3.4l1.2 7.8 7.3-2.9z"/>`,
  orologio: `<rect x="9.6" y=".8" width="4.8" height="2.4" rx=".8"/><circle cx="12" cy="13.2" r="9.6"/><circle class="a" cx="12" cy="13.2" r="7.4"/><path class="s" stroke-width="2" d="M12 8.6v4.6l3 2"/>`,
  condividi: `<path d="M4 10h4.2v2.4H6.4v7.2h11.2v-7.2h-1.8V10H20v12H4z"/><path class="a" d="M12 1.6l5.2 5.2h-3.7v8.4h-3V6.8H6.8z"/>`,
  carrello: `<path class="a" d="M6.4 6h15.1l-2 8H8.4z"/><path class="s" stroke-width="2.2" d="M1.8 3h3.1l3 12.4h11.6"/><circle cx="9.2" cy="19.6" r="1.9"/><circle cx="18" cy="19.6" r="1.9"/>`,
  calendario: `<path d="M6.8 1.8h2.2v4.4H6.8zM15 1.8h2.2v4.4H15z"/><path class="a" d="M4.5 4h15A1.5 1.5 0 0 1 21 5.5V9H3V5.5A1.5 1.5 0 0 1 4.5 4z"/><path fill-rule="evenodd" d="M3 10.2h18v9.3a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 19.5zM6 12.6h3v2.6H6zM10.5 12.6h3v2.6h-3zM15 12.6h3v2.6h-3zM6 16.6h3v2.6H6zM10.5 16.6h3v2.6h-3z"/>`,
  campanella: `<path d="M12 1.8a1.6 1.6 0 0 1 1.6 1.6v.8a6.6 6.6 0 0 1 5 6.4v4.2l2.2 2.6v1.4H3.2v-1.4l2.2-2.6v-4.2a6.6 6.6 0 0 1 5-6.4v-.8A1.6 1.6 0 0 1 12 1.8z"/><path class="a" d="M9.2 20h5.6a2.8 2.8 0 0 1-5.6 0z"/>`,
  grafico: `<rect x="2.5" y="12" width="4.4" height="9.5" rx="1"/><rect x="9.8" y="7" width="4.4" height="14.5" rx="1"/><rect class="a" x="17.1" y="2.5" width="4.4" height="19" rx="1"/>`,
  scarica: `<path d="M3 14h3v5h12v-5h3v8H3z"/><path class="a" d="M10.5 2h3v8.2h3.6L12 15.6l-5.1-5.4h3.6z"/>`,
  carica: `<path d="M3 14h3v5h12v-5h3v8H3z"/><path class="a" d="M12 2l5.1 5.4h-3.6v8.2h-3V7.4H6.9z"/>`,
  casa: `<path fill-rule="evenodd" d="M12 2.5l10 8.6-1.5 1.7-1.5-1.3V21H5V11.5l-1.5 1.3L2 11.1z"/><path class="a" d="M9.6 13.5h4.8V21H9.6z"/>`,
  // stagioni
  primavera: petali + `<circle class="a" cx="12" cy="12" r="3"/>`,
  autunno: `<path class="a" d="M20.8 3.2C11.2 2.7 4.6 7.8 5.1 17c9.2.5 16.2-5 15.7-13.8z"/><path class="s" stroke-width="2" d="M2.6 21.4 15 9"/>`,
  inverno: `<path class="s" stroke-width="2" d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M9 3.4l3 2.6 3-2.6M9 20.6l3-2.6 3 2.6M2.6 10.4l3.8-.8-1.2-3.7M21.4 13.6l-3.8.8 1.2 3.7M2.6 13.6l3.8.8-1.2 3.7M21.4 10.4l-3.8-.8 1.2-3.7"/><circle class="a" cx="12" cy="12" r="2.4"/>`,
  // stato e varie
  telefono: `<rect x="5" y="1.5" width="14" height="21" rx="2.4"/><rect class="a" x="7.2" y="4.4" width="9.6" height="13.2" rx=".6"/>`,
  installa: `<path fill-rule="evenodd" d="M7.4 1.5h9.2A2.4 2.4 0 0 1 19 3.9v16.2a2.4 2.4 0 0 1-2.4 2.4H7.4A2.4 2.4 0 0 1 5 20.1V3.9a2.4 2.4 0 0 1 2.4-2.4zM7.2 4.4v13.2h9.6V4.4z"/><path class="a" d="M10.6 6h2.8v5h2.4L12 15.4 8.2 11h2.4z"/>`,
  nuvola: `<path d="M6.4 19.5A4.6 4.6 0 0 1 5.9 10.3a6.2 6.2 0 0 1 11.9-1.6 5.4 5.4 0 0 1 .4 10.8z"/><path class="as" stroke-width="2.2" d="M8.8 14.2l2.3 2.3 4.4-4.4"/>`,
  offline: `<path d="M6.4 19.5A4.6 4.6 0 0 1 5.9 10.3a6.2 6.2 0 0 1 11.9-1.6 5.4 5.4 0 0 1 .4 10.8z"/><path class="as" stroke-width="2.4" d="M3 3l18 18"/>`,
  clessidra: `<rect x="4.5" y="1.6" width="15" height="2.6" rx="1"/><rect x="4.5" y="19.8" width="15" height="2.6" rx="1"/><path d="M6.4 4.2h11.2c0 4-3 5.6-4 7.8 1 2.2 4 3.8 4 7.8H6.4c0-4 3-5.6 4-7.8-1-2.2-4-3.8-4-7.8z"/><path class="a" d="M8.6 6.2h6.8c-.5 1.6-2 2.6-3.4 3.8-1.4-1.2-2.9-2.2-3.4-3.8zM8.4 18.4c.6-2 2.1-3 3.6-4 1.5 1 3 2 3.6 4z"/>`,
  piatto: `<circle cx="12" cy="12" r="7.2"/><circle class="a" cx="12" cy="12" r="4.6"/><path class="s" stroke-width="1.4" d="M1.9 3v5M3.6 3v18.5M5.3 3v5M1.9 8.2c0 1 .8 1.8 1.7 1.8s1.7-.8 1.7-1.8"/><path d="M22.4 21.5h-1.8V13h-1.8c0-5 1-8.6 3.6-10.3z"/>`,
  ok: `<circle class="a" cx="12" cy="12" r="10"/><path class="s" stroke-width="2.6" d="M7.2 12.4l3.2 3.2 6.4-6.6"/>`,
  piu: `<path d="M10.5 3.5h3v7h7v3h-7v7h-3v-7h-7v-3h7z"/>`,
  chiudi: `<path d="M5.6 3.5 12 9.9l6.4-6.4 2.1 2.1L14.1 12l6.4 6.4-2.1 2.1L12 14.1l-6.4 6.4-2.1-2.1L9.9 12 3.5 5.6z"/>`,
  maniglia: `<rect x="3" y="5" width="18" height="2.6" rx="1.3"/><rect x="3" y="10.7" width="18" height="2.6" rx="1.3"/><rect x="3" y="16.4" width="18" height="2.6" rx="1.3"/>`,
  euro: `<circle cx="12" cy="12" r="10.2"/><circle class="a" cx="12" cy="12" r="8.2"/><path class="s" stroke-width="2" d="M15.8 8.4a4.6 4.6 0 1 0 0 7.2M6.8 10.8h6.2M6.8 13.4h6.2"/>`,
  ingranaggio: denti() + `<path fill-rule="evenodd" d="M4.6 12a7.4 7.4 0 1 0 14.8 0 7.4 7.4 0 1 0-14.8 0zM8.4 12a3.6 3.6 0 1 1 7.2 0 3.6 3.6 0 1 1-7.2 0z"/><circle class="a" cx="12" cy="12" r="2.4"/>`,
  persona: `<circle class="a" cx="12" cy="7" r="4.6"/><path d="M3 22c0-5 4-8.4 9-8.4s9 3.4 9 8.4z"/>`,
};

// <svg> di un'icona; "cls" aggiunge classi (es. "grande")
export function ico(nome, cls = "") {
  const d = ICONE[nome];
  if (!d) return "";
  return `<svg class="ic${cls ? ` ${cls}` : ""}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${d}</svg>`;
}

// Icona di ogni tipo di piatto (proteina principale)
export const ICONA_PROTEINA_NOME = {
  "Carne bianca": "pollo", "Carne rossa": "carne", Pesce: "pesce", Uova: "uovo",
  Formaggi: "formaggio", Legumi: "legumi", Nessuna: "spiga",
};
