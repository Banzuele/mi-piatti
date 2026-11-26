// Lista della spesa: somma gli ingredienti dei pasti di una settimana (da lunedì a domenica),
// moltiplicati per le porzioni, ordinati come i reparti Esselunga.

import { giorniSettimana, infoGiorno, usaSurgelato, GIORNI, giornoSettimana, IMPOSTAZIONI_PREDEFINITE } from "./calendario.js";
import { PASTI, chiavePasto } from "./pianificatore.js";

export const REPARTI = [
  { id: "verdure", nome: "Verdure" },
  { id: "frutta", nome: "Frutta" },
  { id: "banco_frigo", nome: "Banco frigo" },
  { id: "pasta", nome: "Pasta, riso e farine" },
  { id: "conserve", nome: "Conserve" },
  { id: "salumi_formaggi", nome: "Salumi e formaggi" },
  { id: "congelati", nome: "Congelati" },
  { id: "bevande", nome: "Bevande" },
  { id: "pane", nome: "Pane" },
  { id: "altro", nome: "Altro" },
];
const POSIZIONE = new Map(REPARTI.map((r, i) => [r.id, i]));

export function quantitaDaComprare(q, unita) {
  if (unita === "g" || unita === "ml") return q < 10 ? Math.ceil(q) : Math.ceil(q / 10) * 10;
  return Math.ceil(q - 1e-9);
}

export function formattaQuantita(q, unita) {
  const n = (v) => String(Math.round(v * 10) / 10).replace(".", ",");
  if (unita === "g") return q >= 1000 ? `${n(q / 1000)} kg` : `${n(q)} g`;
  if (unita === "ml") return q >= 1000 ? `${n(q / 1000)} l` : `${n(q)} ml`;
  return `${n(q)} pz`;
}

export function calcolaSpesa({
  piano, sabato, ricettePerId, alimentiPerId, giorniCasa = {}, imp = IMPOSTAZIONI_PREDEFINITE,
  porzioni = {}, // porzioni scelte a mano per singolo pasto: { "AAAA-MM-GG_cena": 1 }
}) {
  const voci = new Map();
  for (const data of giorniSettimana(sabato)) {
    const info = infoGiorno(data, giorniCasa, imp);
    for (const pasto of PASTI) {
      const r = ricettePerId.get(piano[chiavePasto(data, pasto)]);
      if (!r) continue;
      const molt = porzioni[chiavePasto(data, pasto)] ?? info.moltiplicatori[pasto];
      for (const ing of r.ingredienti) {
        let a = alimentiPerId.get(ing.id);
        if (!a) continue;
        if (a.surgelato && usaSurgelato(data, imp.giornoSpesa ?? 6)) a = alimentiPerId.get(a.surgelato) || a;
        let v = voci.get(a.id);
        if (!v) {
          v = { alimento: a, quantita: 0, giorni: new Set(), ricette: new Set() };
          voci.set(a.id, v);
        }
        v.quantita += ing.q * molt;
        v.giorni.add(data);
        v.ricette.add(r.nome);
      }
    }
  }
  const lista = [...voci.values()].map((v) => {
    const a = v.alimento;
    const q = quantitaDaComprare(v.quantita, a.unita);
    const giorni = [...v.giorni].sort();
    return {
      id: a.id,
      nome: a.nome,
      reparto: a.reparto,
      tipo: a.tipo,
      unita: a.unita,
      quantita: q,
      testoQuantita: formattaQuantita(q, a.unita),
      confezioni: a.conf ? Math.ceil(q / a.conf - 1e-9) : null,
      testoConfezioni: a.conf ? `${Math.ceil(q / a.conf - 1e-9)} ${a.confNome || "conf."}` : "",
      giorni,
      testoGiorni: giorni.map((d) => GIORNI[giornoSettimana(d)]).join(", "),
      ricette: [...v.ricette],
    };
  });
  return ordinaPerReparto(lista);
}

export function ordinaPerReparto(lista) {
  return lista.sort((x, y) =>
    (POSIZIONE.get(x.reparto) ?? 99) - (POSIZIONE.get(y.reparto) ?? 99)
    || x.nome.localeCompare(y.nome, "it"));
}

// Dentro ogni reparto i prodotti già presi vanno in fondo; l'ordine dei reparti
// e quello dei prodotti ancora da prendere restano uguali.
export function spuntatiInFondo(voci) {
  return voci.map((v, i) => ({ v, i })).sort((a, b) =>
    (POSIZIONE.get(a.v.reparto) ?? 99) - (POSIZIONE.get(b.v.reparto) ?? 99)
    || (a.v.fatto ? 1 : 0) - (b.v.fatto ? 1 : 0) || a.i - b.i).map((x) => x.v);
}

// Testo con caselle [ ] da incollare (es. in Google Keep)
export function spesaComeTesto(titolo, voci) {
  const righe = [titolo];
  let reparto = null;
  for (const v of voci) {
    if (v.reparto !== reparto) {
      reparto = v.reparto;
      righe.push("", (REPARTI.find((r) => r.id === reparto)?.nome || reparto).toUpperCase());
    }
    const q = v.testoQuantita ? ` – ${v.testoQuantita}` : "";
    righe.push(`${v.fatto ? "[x]" : "[ ]"} ${v.nome}${q}`);
  }
  return righe.join("\n");
}
