// Generazione del menù: 4 settimane dal giorno della spesa (di solito sabato), pranzo e cena.
// Funzioni pure, senza DOM, così si possono testare con node.

import {
  aggiungiGiorni, stagione, deperibilitaGiorno, lunediDi, infoGiorno, giornoSettimana,
  IMPOSTAZIONI_PREDEFINITE,
} from "./calendario.js";

export const PASTI = ["pranzo", "cena"];
const ORDINE_DEP = { Alta: 3, Media: 2, Bassa: 1 };

// Quanti piatti di ogni tipo (proteina) in una settimana da lunedì a domenica.
// Valori predefiniti dalle linee guida (pesce e legumi almeno 2, carne rossa
// al massimo 2, formaggi e uova con moderazione); si cambiano in Altro.
export const TIPI_PIATTO = [
  { proteina: "Pesce", chiave: "Pesce", min: 2, max: 14 },
  { proteina: "Legumi", chiave: "Legumi", min: 2, max: 14 },
  { proteina: "Carne bianca", chiave: "CarneBianca", min: 0, max: 3 },
  { proteina: "Carne rossa", chiave: "CarneRossa", min: 0, max: 2 },
  { proteina: "Uova", chiave: "Uova", min: 0, max: 2 },
  { proteina: "Formaggi", chiave: "Formaggi", min: 0, max: 3 },
  { proteina: "Nessuna", chiave: "Nessuna", min: 0, max: 14 },
];
const MAX_PASTI_SETTIMANA = 14;

// Regole della settimana dalle impostazioni (minX / maxX), con i predefiniti
export function regoleSettimana(imp = IMPOSTAZIONI_PREDEFINITE) {
  const out = {};
  for (const t of TIPI_PIATTO) {
    const n = (v, def) => (Number.isFinite(Number(v)) && v !== "" && v != null
      ? Math.min(MAX_PASTI_SETTIMANA, Math.max(0, Math.round(Number(v)))) : def);
    const min = n(imp[`min${t.chiave}`], t.min);
    const max = Math.max(min, n(imp[`max${t.chiave}`], t.max));
    out[t.proteina] = { min, max };
  }
  return out;
}

export const chiavePasto = (data, pasto) => `${data}_${pasto}`;

export function entroTempi(r, imp = IMPOSTAZIONI_PREDEFINITE) {
  return r.tempoPrep <= imp.maxPrep && r.tempoTotale <= imp.maxTotale;
}

// Una ricetta con pesce che esiste anche surgelato va bene tutti i giorni
export function surgelabile(r, alimentiPerId) {
  return r.ingredienti.some((i) => alimentiPerId.get(i.id)?.surgelato);
}

// Carboidrato principale del piatto (dal nome degli ingredienti), per non
// avere per esempio pasta sia a pranzo sia a cena.
const CARBOIDRATI = [
  ["pasta", /pasta|spaghetti|pastina|cannelloni|lasagne|gnocchi|tortellini|ravioli/i],
  ["riso", /riso/i],
  ["cereali", /farro|couscous|quinoa|polenta|avena|bulgur/i],
  ["patate", /patat/i],
  ["pane", /pane a fette|piadin|pizza|focaccia/i],
];
export function carboidrato(r, alimentiPerId) {
  let migliore = null, q = 0;
  for (const i of r?.ingredienti || []) {
    const nome = alimentiPerId?.get(i.id)?.nome || "";
    const c = CARBOIDRATI.find(([, re]) => re.test(nome));
    if (c && i.q > q) { migliore = c[0]; q = i.q; }
  }
  return migliore;
}

// Regola rigida per Alta e Bassa, flessibile per Media:
// - ricetta Alta: solo nei giorni Alta (salvo pesce surgelabile)
// - ricetta Media: giorni Alta e Media; anche Bassa (flessibile)
// - ricetta Bassa: sempre
export function deperibilitaCompatibile(depRicetta, depGiorno, puoSurgelare = false) {
  if (depRicetta === "Alta") return depGiorno === "Alta" || puoSurgelare;
  return true;
}

// "Cena doppia": nei giorni feriali con il pranzo per una persona sola, il
// pranzo è fatto con gli avanzi della cena del giorno prima.
export function pranzoConAvanzi(data, giorniCasa = {}, imp = IMPOSTAZIONI_PREDEFINITE) {
  if (Number(imp.cenaDoppia) !== 1) return false;
  const gs = giornoSettimana(data);
  return gs >= 1 && gs <= 5 && !infoGiorno(data, giorniCasa, imp).motivo;
}

// Conta i piatti per tipo nella settimana (lun-dom) che contiene la data.
// Gli avanzi non contano: sono lo stesso piatto della cena prima.
function contaSettimana(piano, ricettePerId, lunedi, avanzi = new Set()) {
  const c = {};
  for (const t of TIPI_PIATTO) c[t.proteina] = 0;
  for (let i = 0; i < 7; i++) {
    const d = aggiungiGiorni(lunedi, i);
    for (const p of PASTI) {
      const k = chiavePasto(d, p);
      if (avanzi.has(k)) continue;
      const r = ricettePerId.get(piano[k]);
      if (r && r.proteina in c) c[r.proteina]++;
    }
  }
  return c;
}
export { contaSettimana as contaTipiSettimana };

function contaUsi(piano, avanzi = new Set()) {
  const usi = new Map();
  for (const [k, id] of Object.entries(piano)) if (!avanzi.has(k)) usi.set(id, (usi.get(id) || 0) + 1);
  return usi;
}

// Costo di una porzione di ricetta, dato il prezzo (€ al kg / l / pz) di ogni alimento
export function costoPorzione(r, alimentiPerId, prezzoDi) {
  let c = 0;
  for (const i of r?.ingredienti || []) {
    const a = alimentiPerId.get(i.id);
    const p = a ? prezzoDi(a) : null;
    if (!(p > 0)) continue;
    c += p * (a.unita === "g" || a.unita === "ml" ? i.q / 1000 : i.q);
  }
  return c;
}

// Porzioni totali di una settimana (per dividere il budget tra i pasti)
function porzioniSettimana(lunedi, giorniCasa, imp) {
  let n = 0;
  for (let i = 0; i < 7; i++) {
    const m = infoGiorno(aggiungiGiorni(lunedi, i), giorniCasa, imp).moltiplicatori;
    n += m.pranzo + m.cena;
  }
  return n;
}

// Sceglie la ricetta migliore per un pasto, dato il resto del piano
export function scegliRicetta({
  data, pasto, piano, ricette, ricettePerId, alimentiPerId,
  imp = IMPOSTAZIONI_PREDEFINITE, rng = Math.random, escludi = [],
  avanzi = new Set(), giorniCasa = {}, costi = null,
}) {
  const st = stagione(data);
  const g = imp.giornoSpesa ?? 6;
  const dep = deperibilitaGiorno(data, g);
  const regole = regoleSettimana(imp);
  const altro = ricettePerId.get(piano[chiavePasto(data, pasto === "pranzo" ? "cena" : "pranzo")]);
  const carbAltro = carboidrato(altro, alimentiPerId);
  const ieri = ricettePerId.get(piano[chiavePasto(aggiungiGiorni(data, -1), pasto)]);
  const usi = contaUsi(piano, avanzi);
  const attuale = piano[chiavePasto(data, pasto)];
  if (attuale && !avanzi.has(chiavePasto(data, pasto))) usi.set(attuale, (usi.get(attuale) || 1) - 1);
  const lunedi = lunediDi(data);
  const sett = contaSettimana(
    { ...piano, [chiavePasto(data, pasto)]: undefined }, ricettePerId, lunedi, avanzi);
  const budget = Number(imp.budget) > 0 ? Number(imp.budget) : 0;
  const quota = budget && costi ? budget / porzioniSettimana(lunedi, giorniCasa, imp) : 0;

  const sottoMax = (r) => sett[r.proteina] == null || sett[r.proteina] < regole[r.proteina].max;
  const base = ricette.filter((r) => r.pasto === pasto && entroTempi(r, imp) && !escludi.includes(r.id));
  const livelli = [
    (r) => r.stagioni.includes(st) && deperibilitaCompatibile(r.deperibilita, dep, surgelabile(r, alimentiPerId))
      && (usi.get(r.id) || 0) < imp.maxRipetizioni && (!altro || altro.proteina !== r.proteina) && sottoMax(r),
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
      const reg = regole[r.proteina];
      if (reg) {
        if (sett[r.proteina] < reg.min) s += 3;
        if (sett[r.proteina] >= reg.max) s -= 8;
      }
      if (ieri && ieri.proteina === r.proteina) s -= 1.5;
      if (carbAltro && carbAltro === carboidrato(r, alimentiPerId)) s -= 3;
      if (quota) {
        const c = costi.get(r.id);
        if (c > quota) s -= Math.min(6, 3 * (c / quota - 1));
      }
      return { r, s };
    });
    punteggi.sort((a, b) => b.s - a.s);
    return { ricetta: punteggi[0].r, livello };
  }
  return { ricetta: null, livello: 9 };
}

// Costo previsto di una settimana: costo a porzione × porzioni di ogni pasto
export function costoSettimana(piano, lunedi, { costi, giorniCasa = {}, imp = IMPOSTAZIONI_PREDEFINITE, porzioni = {} }) {
  let tot = 0;
  for (let i = 0; i < 7; i++) {
    const d = aggiungiGiorni(lunedi, i);
    const m = infoGiorno(d, giorniCasa, imp).moltiplicatori;
    for (const p of PASTI) {
      const k = chiavePasto(d, p);
      if (piano[k]) tot += (costi.get(piano[k]) || 0) * (porzioni[k] ?? m[p]);
    }
  }
  return tot;
}

// Valuta un piano: più basso è meglio
export function valutaPiano(piano, ricettePerId, inizio, settimane, {
  imp = IMPOSTAZIONI_PREDEFINITE, avanzi = new Set(), costi = null, giorniCasa = {},
} = {}) {
  let penalita = 0;
  const problemi = [];
  const regole = regoleSettimana(imp);
  const budget = Number(imp.budget) > 0 ? Number(imp.budget) : 0;
  for (let w = 0; w < settimane; w++) {
    const lun = lunediDi(aggiungiGiorni(inizio, w * 7));
    const c = contaSettimana(piano, ricettePerId, lun, avanzi);
    for (const t of TIPI_PIATTO) {
      const { min, max } = regole[t.proteina];
      if (c[t.proteina] < min) { penalita += 5 * (min - c[t.proteina]); problemi.push(`Sett. ${w + 1}: ${t.proteina.toLowerCase()} ${c[t.proteina]} volte (minimo ${min})`); }
      if (c[t.proteina] > max) { penalita += 5 * (c[t.proteina] - max); problemi.push(`Sett. ${w + 1}: ${t.proteina.toLowerCase()} ${c[t.proteina]} volte (massimo ${max})`); }
    }
    if (budget && costi) {
      const tot = costoSettimana(piano, lun, { costi, giorniCasa, imp });
      if (tot > budget) {
        penalita += Math.ceil(((tot - budget) / budget) * 40);
        problemi.push(`Sett. ${w + 1}: costo ~${Math.round(tot)} € (budget ${budget} €)`);
      }
    }
  }
  return { penalita, problemi };
}

// pianoEsistente: il menù già salvato, per gli avanzi del primo lunedì
// (la cena della domenica prima). costi: Map id ricetta -> € a porzione.
export function generaPiano({
  ricette, alimenti, inizio, settimane = 4, imp = IMPOSTAZIONI_PREDEFINITE,
  tentativi = 40, rng = Math.random, giorniCasa = {}, costi = null, pianoEsistente = {},
}) {
  const ricettePerId = new Map(ricette.map((r) => [r.id, r]));
  const alimentiPerId = new Map(alimenti.map((a) => [a.id, a]));
  let migliore = null;
  for (let t = 0; t < tentativi; t++) {
    const piano = {};
    const avanzi = new Set();
    let penalita = 0;
    for (let g = 0; g < settimane * 7; g++) {
      const data = aggiungiGiorni(inizio, g);
      for (const pasto of PASTI) {
        const k = chiavePasto(data, pasto);
        if (pasto === "pranzo" && pranzoConAvanzi(data, giorniCasa, imp)) {
          const kIeri = chiavePasto(aggiungiGiorni(data, -1), "cena");
          const ieri = g === 0 ? pianoEsistente[kIeri] : piano[kIeri];
          if (ieri) { piano[k] = ieri; avanzi.add(k); continue; }
        }
        const { ricetta, livello } = scegliRicetta({
          data, pasto, piano, ricette, ricettePerId, alimentiPerId, imp, rng, avanzi, giorniCasa, costi,
        });
        if (ricetta) piano[k] = ricetta.id;
        penalita += livello * 10;
      }
    }
    const v = valutaPiano(piano, ricettePerId, inizio, settimane, { imp, avanzi, costi, giorniCasa });
    penalita += v.penalita;
    if (!migliore || penalita < migliore.penalita) {
      migliore = { piano, avanzi: [...avanzi], penalita, problemi: v.problemi };
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
