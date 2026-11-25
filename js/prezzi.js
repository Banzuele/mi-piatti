// Prezzi della spesa: si registra solo quanto si è pagato un prodotto e quanto
// se n'è comprato (niente negozio). Da qui: prezzo al kg / al litro / al pezzo,
// ultimo prezzo, media e andamento.

export const UNITA_PREZZO = { g: "kg", ml: "l", pz: "pz" };
const LIMITE_PREZZO = 10000; // €, oltre è sicuramente un errore di battitura
const LIMITE_QUANTITA = 1e6;

// Chiave di un prodotto nello storico: l'ID dell'alimento, oppure il testo
// delle voci aggiunte a mano (così "Detersivo" di settimane diverse si somma).
export function chiaveProdotto({ alimento, nome }) {
  if (alimento) return alimento;
  return "x:" + String(nome || "").trim().toLowerCase().replace(/\s+/g, " ");
}

// "2,49" / "2.49" / "€ 2,49" -> 2.49 ; testo non valido -> null
export function leggiNumero(testo) {
  const t = String(testo ?? "").replace(/[€\s]/g, "").replace(",", ".");
  if (!/^\d*\.?\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Prezzo per kg (g), per litro (ml) o per pezzo (pz)
export function prezzoUnitario(prezzo, quantita, unita) {
  if (!(prezzo > 0) || !(quantita > 0)) return null;
  const div = unita === "g" || unita === "ml" ? quantita / 1000 : quantita;
  return { valore: prezzo / div, unita: UNITA_PREZZO[unita] || "pz" };
}

// Un prezzo letto da Firestore: si tiene solo se ha la forma giusta.
export function pulisciPrezzo(p) {
  if (!p || typeof p !== "object") return null;
  const prezzo = Number(p.prezzo), quantita = Number(p.quantita);
  if (!(prezzo > 0 && prezzo <= LIMITE_PREZZO)) return null;
  if (!(quantita > 0 && quantita <= LIMITE_QUANTITA)) return null;
  if (!["g", "ml", "pz"].includes(p.unita)) return null;
  if (typeof p.data !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(p.data)) return null;
  const prodotto = typeof p.prodotto === "string" ? p.prodotto.slice(0, 140) : "";
  if (!prodotto) return null;
  return {
    prodotto, prezzo, quantita, unita: p.unita, data: p.data,
    nome: typeof p.nome === "string" ? p.nome.slice(0, 120) : "",
    quando: Number(p.quando) || 0,
  };
}

// Storico di un prodotto, dal più recente; i prezzi con unità diversa
// (es. una voce libera prima in pezzi poi in grammi) restano separati.
export function storico(prezzi, prodotto) {
  return Object.entries(prezzi)
    .map(([id, p]) => ({ id, ...p }))
    .filter((p) => p.prodotto === prodotto)
    .sort((a, b) => b.data.localeCompare(a.data) || b.quando - a.quando)
    .map((p) => ({ ...p, unitario: prezzoUnitario(p.prezzo, p.quantita, p.unita) }));
}

// Ultimo prezzo unitario, media di tutti e andamento rispetto alla media dei
// precedenti: "su" se l'ultimo costa più del 3% in più, "giu" se meno del 3%.
export function statistiche(lista) {
  if (!lista.length) return null;
  const ultimo = lista[0].unitario;
  const stessi = lista.filter((p) => p.unitario.unita === ultimo.unita);
  const media = stessi.reduce((s, p) => s + p.unitario.valore, 0) / stessi.length;
  let tendenza = null;
  if (stessi.length > 1) {
    const prec = stessi.slice(1);
    const mediaPrec = prec.reduce((s, p) => s + p.unitario.valore, 0) / prec.length;
    const diff = (ultimo.valore - mediaPrec) / mediaPrec;
    tendenza = diff > 0.03 ? "su" : diff < -0.03 ? "giu" : "uguale";
  }
  return { ultimo, media, tendenza, n: stessi.length, data: lista[0].data };
}

export function formattaEuro(v) {
  return v.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}
export function formattaUnitario(u) {
  return u ? `${formattaEuro(u.valore)}/${u.unita}` : "";
}

// Costo di una quantità dato un prezzo al kg / al litro / al pezzo
export function costoDaUnitario(unitario, quantita, unita) {
  if (!(unitario > 0) || !(quantita > 0)) return null;
  return unitario * (unita === "g" || unita === "ml" ? quantita / 1000 : quantita);
}

// Costo previsto di una voce della spesa: il prezzo pagato questa settimana,
// altrimenti l'ultimo prezzo vero, altrimenti la stima iniziale dell'alimento.
// I prezzi veri, appena ci sono, prendono sempre il posto della stima.
export function costoVoce({ pagato, st, stima, quantita, unita }) {
  if (pagato) return { valore: pagato.prezzo, fonte: "pagato" };
  if (st && st.ultimo.unita === (UNITA_PREZZO[unita] || "pz")) {
    const v = costoDaUnitario(st.ultimo.valore, quantita, unita);
    if (v) return { valore: v, fonte: "ultimo" };
  }
  const v = costoDaUnitario(stima, quantita, unita);
  return v ? { valore: v, fonte: "stima" } : null;
}
