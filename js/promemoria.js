// Promemoria per domani: cosa preparare oggi per i pasti di domani.
// Si vedono in cima al giorno di oggi nel Menù. Solo calcolo, niente pagina.
import { aggiungiGiorni, infoGiorno, usaSurgelato, giornoSettimana, lunediDi, IMPOSTAZIONI_PREDEFINITE } from "./calendario.js";
import { PASTI, chiavePasto } from "./pianificatore.js";

const NOME_PASTO = { pranzo: "pranzo", cena: "cena" };
const num = (v) => String(Math.round(v * 100) / 100).replace(".", ",");

// Tipi di promemoria, che si possono spegnere uno per uno in Altro
export const TIPI_PROMEMORIA = [
  { id: "surgelato", ico: "inverno", nome: "Surgelati da spostare in frigo la sera prima" },
  { id: "avanzi", ico: "avanzi", nome: "Cena doppia per il pranzo di domani" },
  { id: "casa", ico: "casa", nome: "Domani a casa (feste, ferie, mensa chiusa)" },
  { id: "menu", ico: "elenco", nome: "Pasti o menù ancora da scegliere" },
  { id: "spesa", ico: "carrello", nome: "Domani è il giorno della spesa" },
];

// Ogni promemoria: { tipo, ico: nome icona, testo }.
// pasti = menù salvato (con avanzi), piano = { chiave: id ricetta } già risolto,
// molt(k) = porzioni di un pasto.
export function promemoriaDomani({
  oggi, pasti = {}, piano = {}, ricettePerId, alimentiPerId, giorniCasa = {},
  imp = IMPOSTAZIONI_PREDEFINITE, molt = () => 1,
}) {
  const domani = aggiungiGiorni(oggi, 1);
  const out = [];

  // 1. pesce (o altro) surgelato domani: stasera dal freezer al frigo
  if (usaSurgelato(domani)) {
    for (const p of PASTI) {
      const k = chiavePasto(domani, p);
      if (pasti[k]?.avanzi) continue; // si cucina stasera, non domani
      const r = ricettePerId.get(piano[k]);
      if (!r) continue;
      const surg = r.ingredienti.map((i) => alimentiPerId.get(i.id))
        .filter((a) => a?.surgelato && alimentiPerId.has(a.surgelato))
        .map((a) => alimentiPerId.get(a.surgelato).nome);
      if (surg.length) {
        out.push({ tipo: "surgelato", ico: "inverno", testo: `Stasera sposta dal freezer al frigo: ${[...new Set(surg)].join(", ")} (${NOME_PASTO[p]} di domani).` });
      }
    }
  }

  // 2. cena doppia: stasera si cucina anche il pranzo di domani
  const kPranzoDomani = chiavePasto(domani, "pranzo");
  const kCenaOggi = chiavePasto(oggi, "cena");
  if (pasti[kPranzoDomani]?.avanzi && piano[kCenaOggi]) {
    out.push({ tipo: "avanzi", ico: "avanzi", testo: `Stasera cucina anche per il pranzo di domani (×${num(molt(kPranzoDomani))}) e mettilo da parte prima di servire.` });
  }

  // 3. domani a casa (festa, ferie, mensa chiusa) in un giorno feriale
  const infoD = infoGiorno(domani, giorniCasa, imp);
  const gsD = giornoSettimana(domani);
  if (infoD.motivo && gsD !== 0 && gsD !== 6) {
    out.push({ tipo: "casa", ico: "casa", testo: `Domani a casa (${infoD.motivo}): pranzo per tutta la famiglia (×${num(molt(kPranzoDomani))}).` });
  }

  // 4. pasti di domani ancora da scegliere / menù della settimana mancante
  const lun = lunediDi(domani);
  const settimanaVuota = ![...Array(7)].some((_, n) => PASTI.some((p) => {
    const k = chiavePasto(aggiungiGiorni(lun, n), p);
    return piano[k] || pasti[k]?.avanzi;
  }));
  if (settimanaVuota) {
    out.push({ tipo: "menu", ico: "dado", testo: "Il menù della settimana di domani non c'è ancora: generalo dal Menù." });
  } else {
    const vuoti = PASTI.filter((p) => !piano[chiavePasto(domani, p)] && !pasti[chiavePasto(domani, p)]?.avanzi);
    if (vuoti.length) {
      out.push({ tipo: "menu", ico: "elenco", testo: `Domani ${vuoti.map((p) => NOME_PASTO[p]).join(" e ")} da scegliere.` });
    }
  }

  // 5. domani è il giorno della spesa
  if (gsD === (imp.giornoSpesa ?? 6)) {
    out.push({ tipo: "spesa", ico: "carrello", testo: "Domani è il giorno della spesa: controlla la Lista." });
  }
  return out;
}
