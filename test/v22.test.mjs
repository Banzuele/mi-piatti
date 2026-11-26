// Promemoria per domani, spesa reale, copia di sicurezza
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { promemoriaDomani } from "../js/promemoria.js";
import { spesaReale } from "../js/prezzi.js";
import { creaBackup, leggiBackup, COLLEZIONI_BACKUP } from "../js/backup.js";
import { lunediDi, impostaGiornoInizio } from "../js/calendario.js";
import { ICONE, ico, ICONA_PROTEINA_NOME } from "../js/icone.js";

const ricette = JSON.parse(readFileSync(new URL("../data/ricette.json", import.meta.url)));
const alimenti = JSON.parse(readFileSync(new URL("../data/alimenti.json", import.meta.url)));
const ricettePerId = new Map(ricette.map((r) => [r.id, r]));
const alimentiPerId = new Map(alimenti.map((a) => [a.id, a]));
const conMerluzzo = ricette.find((r) => r.ingredienti.some((i) => i.id === "AL37"));
const qualsiasi = ricette.find((r) => r !== conMerluzzo);

test("promemoria: surgelato da scongelare la sera prima", () => {
  impostaGiornoInizio(6);
  // mercoledì 2 dic 2026 -> domani giovedì: deperibilità bassa, si usa il surgelato
  const piano = { "2026-12-03_cena": conMerluzzo.id, "2026-12-03_pranzo": qualsiasi.id, "2026-12-02_cena": qualsiasi.id };
  const l = promemoriaDomani({ oggi: "2026-12-02", piano, pasti: {}, ricettePerId, alimentiPerId });
  const p = l.find((x) => x.ico === "inverno");
  assert.ok(p, JSON.stringify(l));
  assert.match(p.testo, /freezer.*cena di domani/);
});

test("promemoria: cena doppia, pasti da scegliere, giorno di spesa, menù mancante", () => {
  impostaGiornoInizio(6);
  const pasti = { "2026-12-04_pranzo": { avanzi: true } };
  const piano = { "2026-12-03_cena": qualsiasi.id };
  // giovedì 3 -> domani venerdì 4: pranzo con avanzi, cena da scegliere
  let l = promemoriaDomani({ oggi: "2026-12-03", piano, pasti, ricettePerId, alimentiPerId, molt: () => 1 });
  assert.ok(l.some((x) => x.ico === "avanzi" && /×1/.test(x.testo)));
  assert.ok(l.some((x) => x.ico === "elenco" && /cena da scegliere/.test(x.testo)));
  assert.ok(!l.some((x) => x.ico === "carrello"));
  // venerdì 4 -> domani sabato: giorno della spesa
  l = promemoriaDomani({ oggi: "2026-12-04", piano, pasti, ricettePerId, alimentiPerId });
  assert.ok(l.some((x) => x.ico === "carrello" && x.tipo === "spesa"));
  // domenica 6 -> lunedì 7, settimana senza menù
  l = promemoriaDomani({ oggi: "2026-12-06", piano, pasti, ricettePerId, alimentiPerId });
  assert.ok(l.some((x) => x.ico === "dado"));
});

test("promemoria: festa infrasettimanale = pranzo in famiglia", () => {
  // lunedì 7 dic -> martedì 8 dicembre (Immacolata)
  const l = promemoriaDomani({ oggi: "2026-12-07", piano: {}, pasti: {}, ricettePerId, alimentiPerId, molt: () => 2.5 });
  const p = l.find((x) => x.ico === "casa");
  assert.ok(p);
  assert.match(p.testo, /×2,5/);
});

test("spesa reale per settimana del menù e per mese", () => {
  const prezzi = {
    "2026-11-23_AL01": { prezzo: 2, data: "2026-11-21" },
    "2026-11-23_AL02": { prezzo: 3.5, data: "2026-11-21" },
    "2026-11-30_AL01": { prezzo: 10, data: "2026-12-01" },
    "abc123": { prezzo: 1, data: "2026-11-26" }, // voce aggiunta a mano: settimana della data
  };
  const { settimane, mesi } = spesaReale(prezzi, lunediDi);
  assert.equal(settimane.get("2026-11-23"), 6.5);
  assert.equal(settimane.get("2026-11-30"), 10);
  assert.equal(mesi.get("2026-11"), 6.5);
  assert.equal(mesi.get("2026-12"), 10);
});

test("copia di sicurezza: crea e rilegge", () => {
  const dati = { pasti: { "2026-12-01_cena": { ricetta: "CEN01", avanzi: false } }, prezzi: { "2026-11-30_AL01": { prezzo: 2, data: "2026-12-01", unita: "g", quantita: 500, prodotto: "AL01" } } };
  const copia = creaBackup(dati, "v22", new Date("2026-12-01T10:00:00Z"));
  assert.deepEqual(Object.keys(copia.dati), COLLEZIONI_BACKUP);
  const r = leggiBackup(JSON.stringify(copia));
  assert.equal(r.ops.length, 2);
  assert.equal(r.conteggi.pasti, 1);
  assert.equal(r.creato, "2026-12-01");
});

test("copia di sicurezza: file sbagliati rifiutati", () => {
  assert.ok(leggiBackup("non json").errore);
  assert.ok(leggiBackup(JSON.stringify({ app: "altro", dati: {} })).errore);
  assert.ok(leggiBackup(JSON.stringify({ app: "mi-piatti", formato: 1, dati: { pasti: { "a/b": { x: 1 } } } })).errore);
  assert.ok(leggiBackup(JSON.stringify({ app: "mi-piatti", formato: 1, dati: { pasti: { a: "testo" } } })).errore);
  assert.ok(leggiBackup(JSON.stringify({ app: "mi-piatti", formato: 2, dati: {} })).errore);
  assert.ok(leggiBackup(JSON.stringify({ app: "mi-piatti", formato: 1, dati: {} })).errore); // vuota
});

test("icone: ogni tipo di piatto ha la sua, svg valido", () => {
  for (const n of Object.values(ICONA_PROTEINA_NOME)) assert.ok(ICONE[n], n);
  assert.match(ico("pranzo"), /^<svg class="ic" viewBox="0 0 24 24"[^>]*>.*<\/svg>$/);
  assert.equal(ico("non-esiste"), "");
});
