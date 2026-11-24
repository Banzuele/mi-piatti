// Generazione del menù: 4 settimane da sabato a venerdì, pranzo e cena.
// Funzioni pure, senza DOM, così si possono testare con node.

import {
  aggiungiGiorni, inizioSettimana, stagione, deperibilitaGiorno,
  IMPOSTAZIONI_PREDEFINITE,
} from "./calendario.js";

export const PASTI = ["pranzo", "cena"];
const ORDINE_DEP = { Alta: 3, Media: 2, Bassa: 1 };

// Regole settimanali semplici (linee guida DGE): pesce e legumi almeno 2
// volte, carne rossa al massimo 2.
export const REGOLE_SETTIMANA = { pesceMin: 2, legumiMin: 2, carneRossaMax: 2 };

export const chiavePasto = (data, pasto) => `${data}_${pasto}`;

export function entroTempi(r, imp = IMPOSTAZIONI_PREDEFINITE) {
  return r.tempoPrep <= imp.maxPrep && r.tempoTotale <= imp.maxTotale;
}

// Una ricetta con pesce che esiste anche surgelato va bene tutti i giorni
export function surgelabile(r, alimentiPerId) {
  return r.ingredienti.some((i) => alimentiPerId.get(i.id)?.surgelato);
}

// Regola rigida per Alta e Bassa, flessibile per Media:
// - ricetta Alta: solo nei giorni Alta (salvo pesce surgelabile)
// - ricetta Media: giorni Alta e Media; anche Bassa (flessibile)
// - ricetta Bassa: sempre
export function deperibilitaCompatibile(depRicetta, depGiorno, puoSurgelare = false) {
  if (depRicetta === "Alta") return depGiorno === "Alta" || puoSurgelare;
  return true;
}

function contaSettimana(piano, ricettePerId, sabato) {
  const c = { Pesce: 0, Legumi: 0, "Carne rossa": 0 };
  for (let i = 0; i < 7; i++) {
    const d = aggiungiGiorni(sabato, i);
    for (const p of PASTI) {
      const r = ricettePerId.get(piano[chiavePasto(d, p)]);
      if (r && r.proteina in c) c[r.proteina]++;
    }
  }
  return c;
}

function contaUsi(piano) {
  const usi = new Map();
  for (const id of Object.values(piano)) usi.set(id, (usi.get(id) || 0) + 1);
  return usi;
}

// Sceglie la ricetta migliore per un pasto, dato il resto del piano
export function scegliRicetta({
  data, pasto, piano, ricette, ricettePerId, alimentiPerId,
  imp = IMPOSTAZIONI_PREDEFINITE, rng = Math.random, escludi = [],
}) {
  const st = stagione(data);
  const dep = deperibilitaGiorno(data);
  const altro = ricettePerId.get(piano[chiavePasto(data, pasto === "pranzo" ? "cena" : "pranzo")]);
  const ieri = ricettePerId.get(piano[chiavePasto(aggiungiGiorni(data, -1), pasto)]);
  const usi = contaUsi(piano);
  const attuale = piano[chiavePasto(data, pasto)];
  if (attuale) usi.set(attuale, (usi.get(attuale) || 1) - 1);
  const sett = contaSettimana(
    { ...piano, [chiavePasto(data, pasto)]: undefined }, ricettePerId, inizioSettimana(data));

  const base = ricette.filter((r) => r.pasto === pasto && entroTempi(r, imp) && !escludi.includes(r.id));
  const livelli = [
    (r) => r.stagioni.includes(st) && deperibilitaCompatibile(r.deperibilita, dep, surgelabile(r, alimentiPerId))
      && (usi.get(r.id) || 0) < imp.maxRipetizioni && (!altro || altro.proteina !== r.proteina),
    (r) => r.stagioni.includes(st) && (usi.get(r.id) || 0) < imp.maxRipetizioni
      && (!altro || altro.proteina !== r.proteina),
    (r) => (usi.get(r.id) || 0) < imp.maxRipetizioni && (!altro || altro.proteina !== r.proteina),
    () => true,
  ];

  for (let livello = 0; livello < livelli.length; livello++) {
    const candidati = base.filter(livelli[livello]);
    if (!candidati.length) continue;
    const punteggi = candidati.map((r) => {
      let s = rng() * 2.5;
      const u = usi.get(r.id) || 0;
      if (u === 0) s += 4;
      if (r.deperibilita === dep) s += 2;
      else if (ORDINE_DEP[r.deperibilita] < ORDINE_DEP[dep]) s += 0.5; // non sprecare i giorni "Alta"
      if (r.proteina === "Pesce" && sett.Pesce < REGOLE_SETTIMANA.pesceMin) s += 3;
      if (r.proteina === "Legumi" && sett.Legumi < REGOLE_SETTIMANA.legumiMin) s += 3;
      if (r.proteina === "Carne rossa" && sett["Carne rossa"] >= REGOLE_SETTIMANA.carneRossaMax) s -= 8;
      if (ieri && ieri.proteina === r.proteina) s -= 1.5;
      return { r, s };
    });
    punteggi.sort((a, b) => b.s - a.s);
    return { ricetta: punteggi[0].r, livello };
  }
  return { ricetta: null, livello: 9 };
}

// Valuta un piano: più basso è meglio
export function valutaPiano(piano, ricettePerId, inizio, settimane) {
  let penalita = 0;
  const problemi = [];
  for (let w = 0; w < settimane; w++) {
    const sab = aggiungiGiorni(inizio, w * 7);
    const c = contaSettimana(piano, ricettePerId, sab);
    if (c.Pesce < REGOLE_SETTIMANA.pesceMin) { penalita += 5; problemi.push(`Sett. ${w + 1}: pesce ${c.Pesce} volte`); }
    if (c.Legumi < REGOLE_SETTIMANA.legumiMin) { penalita += 5; problemi.push(`Sett. ${w + 1}: legumi ${c.Legumi} volte`); }
    if (c["Carne rossa"] > REGOLE_SETTIMANA.carneRossaMax) { penalita += 5; problemi.push(`Sett. ${w + 1}: carne rossa ${c["Carne rossa"]} volte`); }
  }
  return { penalita, problemi };
}

export function generaPiano({
  ricette, alimenti, inizio, settimane = 4, imp = IMPOSTAZIONI_PREDEFINITE,
  tentativi = 40, rng = Math.random,
}) {
  const ricettePerId = new Map(ricette.map((r) => [r.id, r]));
  const alimentiPerId = new Map(alimenti.map((a) => [a.id, a]));
  let migliore = null;
  for (let t = 0; t < tentativi; t++) {
    const piano = {};
    let penalita = 0;
    for (let g = 0; g < settimane * 7; g++) {
      const data = aggiungiGiorni(inizio, g);
      for (const pasto of PASTI) {
        const { ricetta, livello } = scegliRicetta({
          data, pasto, piano, ricette, ricettePerId, alimentiPerId, imp, rng,
        });
        if (ricetta) piano[chiavePasto(data, pasto)] = ricetta.id;
        penalita += livello * 10;
      }
    }
    const v = valutaPiano(piano, ricettePerId, inizio, settimane);
    penalita += v.penalita;
    if (!migliore || penalita < migliore.penalita) {
      migliore = { piano, penalita, problemi: v.problemi };
      if (penalita === 0) break;
    }
  }
  return migliore;
}

// Spostamento di un pasto nel Menù: solo pranzo con pranzo e cena con cena,
// tra ricette con lo stesso livello di deperibilità. Restituisce il motivo del
// divieto, oppure null se lo spostamento è consentito.
export function motivoNoSpostamento(a, b, ra, rb) {
  if (a === b) return "Scegli un altro pasto";
  if (!ra || !rb) return "Si può spostare solo su un altro pasto già nel menù";
  if (a.split("_")[1] !== b.split("_")[1]) return "Si possono spostare solo pranzi con pranzi e cene con cene";
  if (ra.deperibilita !== rb.deperibilita) {
    return `Non si può: "${ra.nome}" ha deperibilità ${ra.deperibilita}, "${rb.nome}" ${rb.deperibilita}`;
  }
  return null;
}
