// Copia di sicurezza: tutti i dati della famiglia in un file .json da salvare
// (menù, spunte, voci aggiunte, giorni a casa, impostazioni, ricette e
// alimenti vostri, prezzi) e da ricaricare se serve. Solo calcolo, niente pagina.

export const COLLEZIONI_BACKUP = ["pasti", "spunte", "extra", "giorniCasa", "impostazioni", "ricetteUtente", "alimentiUtente", "prezzi"];
const LIMITE_DOC = 20000; // documenti in un file
const ID_VALIDO = /^[A-Za-z0-9_:.\- ]{1,200}$/; // niente "/" (Firestore) né caratteri strani

export function creaBackup(dati, versioneApp = "", adesso = new Date()) {
  const out = { app: "mi-piatti", formato: 1, versioneApp, creato: adesso.toISOString(), dati: {} };
  for (const c of COLLEZIONI_BACKUP) out.dati[c] = dati[c] && typeof dati[c] === "object" ? dati[c] : {};
  return out;
}

export const nomeFileBackup = (oggi) => `mi-piatti-copia-${oggi}.json`;

// Un valore salvabile: testo, numero, sì/no, null, liste e oggetti (non troppo profondi)
function valido(v, prof = 0) {
  if (prof > 6) return false;
  if (v === null || typeof v === "boolean" || typeof v === "string") return typeof v !== "string" || v.length <= 5000;
  if (typeof v === "number") return Number.isFinite(v);
  if (Array.isArray(v)) return v.length <= 200 && v.every((x) => valido(x, prof + 1));
  if (typeof v === "object") {
    const k = Object.keys(v);
    return k.length <= 100 && k.every((x) => x.length <= 100 && !x.startsWith("__") && valido(v[x], prof + 1));
  }
  return false;
}

// Testo del file -> { ops, conteggi } da scrivere, oppure { errore }
export function leggiBackup(testo) {
  let j;
  try { j = JSON.parse(testo); } catch { return { errore: "Il file non è una copia di Mi-Piatti (non è un JSON valido)." }; }
  if (!j || j.app !== "mi-piatti" || typeof j.dati !== "object" || !j.dati) {
    return { errore: "Il file non è una copia di Mi-Piatti." };
  }
  if (j.formato !== 1) return { errore: "Copia fatta con una versione dell'app più nuova: aggiorna l'app e riprova." };
  const ops = [], conteggi = {};
  for (const coll of COLLEZIONI_BACKUP) {
    const docs = j.dati[coll];
    if (docs == null) continue;
    if (typeof docs !== "object" || Array.isArray(docs)) return { errore: `Dati non validi in "${coll}".` };
    for (const [id, dati] of Object.entries(docs)) {
      if (!ID_VALIDO.test(id) || !dati || typeof dati !== "object" || Array.isArray(dati) || !valido(dati)) {
        return { errore: `Dati non validi in "${coll}" (${String(id).slice(0, 40)}).` };
      }
      ops.push({ coll, id, dati });
    }
    conteggi[coll] = Object.keys(docs).length;
  }
  if (ops.length > LIMITE_DOC) return { errore: "Il file è troppo grande." };
  if (!ops.length) return { errore: "La copia è vuota." };
  return { ops, conteggi, creato: typeof j.creato === "string" ? j.creato.slice(0, 10) : "" };
}
