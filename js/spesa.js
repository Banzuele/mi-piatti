// Lista della spesa: somma gli ingredienti dei pasti di una settimana (da lunedì a domenica),
// moltiplicati per le porzioni, ordinati come i reparti Esselunga.

import {
  giorniSettimana, infoGiorno, usaSurgelato, GIORNI, giornoSettimana, aggiungiGiorni, IMPOSTAZIONI_PREDEFINITE,
} from "./calendario.js";
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
  avanzi = new Set(), // pranzi fatti con gli avanzi della cena del giorno prima
  compraDopo = null, // primo giorno della settimana i cui freschi si comprano il giorno della spesa
}) {
  const voci = new Map();
  for (const data of giorniSettimana(sabato)) {
    const info = infoGiorno(data, giorniCasa, imp);
    for (const pasto of PASTI) {
      const k = chiavePasto(data, pasto);
      const r = ricettePerId.get(piano[k]);
      if (!r) continue;
      const molt = porzioni[k] ?? info.moltiplicatori[pasto];
      // gli avanzi si cucinano (e si comprano) con la cena del giorno prima
      const cucina = avanzi.has(k) ? aggiungiGiorni(data, -1) : data;
      for (const ing of r.ingredienti) {
        let a = alimentiPerId.get(ing.id);
        if (!a) continue;
        if (a.surgelato && usaSurgelato(cucina, imp.giornoSpesa ?? 6)) a = alimentiPerId.get(a.surgelato) || a;
        const dopo = !!compraDopo && cucina >= compraDopo && a.tipo !== "dispensa";
        const id = dopo ? `${a.id}~dopo` : a.id;
        let v = voci.get(id);
        if (!v) {
          v = { alimento: a, quantita: 0, giorni: new Set(), ricette: new Set(), dopo };
          voci.set(id, v);
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
      dopo: v.dopo,
      nome: a.nome,
      reparto: a.reparto,
      tipo: a.tipo,
      unita: a.unita,
      quantita: q,
      testoQuantita: formattaQuantita(q, a.unita),
      confezioni: a.conf ? Math.ceil(q / a.conf - 1e-9) : null,
      testoConfezioni: a.conf ? testoConfezioni(Math.ceil(q / a.conf - 1e-9), a.confNome) : "",
      giorni,
      testoGiorni: giorni.map((d) => GIORNI[giornoSettimana(d)]).join(", "),
      ricette: [...v.ricette],
    };
  });
  return ordinaPerReparto(lista);
}

// "1 confezione", "2 confezioni", "2 pacchi"...
const PLURALI = {
  confezione: "confezioni", pacco: "pacchi", vasetto: "vasetti", bottiglia: "bottiglie", busta: "buste",
  bustina: "bustine", vaschetta: "vaschette", lattina: "lattine", panetto: "panetti", rotolo: "rotoli",
  scatoletta: "scatolette", barattolo: "barattoli", pezzo: "pezzi",
};
export function testoConfezioni(n, nome) {
  const s = nome || "conf.";
  if (n === 1) return `1 ${s}`;
  return `${n} ${PLURALI[s] || s}`;
}

export function ordinaPerReparto(lista) {
  return lista.sort((x, y) =>
    (x.dopo ? 1 : 0) - (y.dopo ? 1 : 0)
    || (POSIZIONE.get(x.reparto) ?? 99) - (POSIZIONE.get(y.reparto) ?? 99)
    || x.nome.localeCompare(y.nome, "it"));
}

// Dentro ogni reparto i prodotti già presi vanno in fondo; l'ordine dei reparti
// e quello dei prodotti ancora da prendere restano uguali.
export function spuntatiInFondo(voci) {
  return voci.map((v, i) => ({ v, i })).sort((a, b) =>
    (a.v.dopo ? 1 : 0) - (b.v.dopo ? 1 : 0)
    || (POSIZIONE.get(a.v.reparto) ?? 99) - (POSIZIONE.get(b.v.reparto) ?? 99)
    || (a.v.fatto ? 1 : 0) - (b.v.fatto ? 1 : 0) || a.i - b.i).map((x) => x.v);
}

// Testo con caselle [ ] da incollare (es. in Google Keep)
export function spesaComeTesto(titolo, voci, titoloDopo = "DA COMPRARE IL GIORNO DELLA SPESA") {
  const righe = [titolo];
  let reparto = null, dopo = false;
  for (const v of voci) {
    if (v.dopo && !dopo) {
      dopo = true;
      reparto = null;
      righe.push("", "", titoloDopo.toUpperCase());
    }
    if (v.reparto !== reparto) {
      reparto = v.reparto;
      righe.push("", (REPARTI.find((r) => r.id === reparto)?.nome || reparto).toUpperCase());
    }
    const q = v.testoQuantita ? ` – ${v.testoQuantita}` : "";
    righe.push(`${v.fatto ? "[x]" : "[ ]"} ${v.nome}${q}`);
  }
  return righe.join("\n");
}
