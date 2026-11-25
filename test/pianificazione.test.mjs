// Test della logica: node --test test/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pasqua, festivita, inizioSettimana, infoGiorno, deperibilitaGiorno, aggiungiGiorni, stagione } from "../js/calendario.js";
import { generaPiano, chiavePasto, entroTempi, surgelabile, deperibilitaCompatibile, motivoNoSpostamento } from "../js/pianificatore.js";
import { calcolaSpesa } from "../js/spesa.js";

const ricette = JSON.parse(readFileSync(new URL("../data/ricette.json", import.meta.url)));
const alimenti = JSON.parse(readFileSync(new URL("../data/alimenti.json", import.meta.url)));
const ricettePerId = new Map(ricette.map((r) => [r.id, r]));
const alimentiPerId = new Map(alimenti.map((a) => [a.id, a]));

// generatore pseudo-casuale ripetibile
function rngFisso(seme = 42) { let s = seme; return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296); }

test("dati: ingredienti esistenti, niente orzo né ricette escluse", () => {
  for (const r of ricette) for (const i of r.ingredienti) assert.ok(alimentiPerId.has(i.id), `${r.id} usa ${i.id}`);
  for (const id of ["PRA36", "PRA56", "CEN57", "PRA49", "PRA38", "PRA40", "CEN60", "CEN49"]) assert.ok(!ricettePerId.has(id));
  assert.ok(!alimenti.some((a) => /orzo/i.test(a.nome)));
  assert.ok(!ricette.some((r) => /orzo/i.test(r.nome)));
  const prot = new Set(["Carne bianca", "Carne rossa", "Pesce", "Uova", "Formaggi", "Legumi", "Nessuna"]);
  for (const r of ricette) assert.ok(prot.has(r.proteina), `${r.id} ${r.proteina}`);
});

test("ricette: procedimento presente e ingredienti con dosi a porzione", () => {
  assert.ok(ricette.length >= 150);
  for (const r of ricette) {
    assert.ok(Array.isArray(r.procedimento) && r.procedimento.length >= 2, `${r.id} senza procedimento`);
    for (const i of r.ingredienti) assert.ok(i.q > 0, `${r.id} ${i.id} quantità`);
  }
});

test("cene 1-30 riportate a porzione singola", () => {
  const pollo = ricettePerId.get("CEN04").ingredienti.find((i) => i.id === "AL33");
  assert.equal(pollo.q, 200); // 500 g per famiglia / 2,5
});

test("Pasqua e festività", () => {
  assert.equal(pasqua(2026), "2026-04-05");
  assert.equal(pasqua(2027), "2027-03-28");
  const f = festivita(2026).map((x) => x.data);
  assert.ok(f.includes("2026-04-06") && f.includes("2026-12-08") && f.includes("2026-10-04"));
});

test("settimana sabato-venerdì e deperibilità", () => {
  assert.equal(inizioSettimana("2026-11-24"), "2026-11-21"); // martedì -> sabato prima
  assert.equal(inizioSettimana("2026-11-28"), "2026-11-28");
  assert.equal(inizioSettimana("2026-11-27"), "2026-11-21");
  assert.equal(deperibilitaGiorno("2026-11-28"), "Alta");
  assert.equal(deperibilitaGiorno("2026-12-01"), "Media");
  assert.equal(deperibilitaGiorno("2026-12-03"), "Bassa");
  assert.equal(stagione("2026-12-01"), "inverno");
});

test("moltiplicatori: feriale 1, weekend/festa/ferie 2,5, cena 2,5", () => {
  assert.equal(infoGiorno("2026-11-24").moltiplicatori.pranzo, 1);
  assert.equal(infoGiorno("2026-11-24").moltiplicatori.cena, 2.5);
  assert.equal(infoGiorno("2026-11-28").moltiplicatori.pranzo, 2.5);
  assert.equal(infoGiorno("2026-12-08").moltiplicatori.pranzo, 2.5); // Immacolata, martedì
  assert.equal(infoGiorno("2026-11-25", { "2026-11-25": { tipo: "mensa" } }).moltiplicatori.pranzo, 2.5);
});

test("piano di 4 settimane rispetta i vincoli", () => {
  for (const seme of [1, 7, 42, 99]) {
    const inizio = "2026-11-28";
    const { piano } = generaPiano({ ricette, alimenti, inizio, settimane: 4, rng: rngFisso(seme) });
    assert.equal(Object.keys(piano).length, 56);
    const usi = new Map();
    for (let g = 0; g < 28; g++) {
      const d = aggiungiGiorni(inizio, g);
      const pr = ricettePerId.get(piano[chiavePasto(d, "pranzo")]);
      const ce = ricettePerId.get(piano[chiavePasto(d, "cena")]);
      assert.equal(pr.pasto, "pranzo"); assert.equal(ce.pasto, "cena");
      assert.notEqual(pr.proteina, ce.proteina, `${d}: stessa proteina`);
      for (const r of [pr, ce]) {
        assert.ok(entroTempi(r), `${r.id} oltre i tempi`);
        assert.ok(r.stagioni.includes(stagione(d)), `${d} ${r.id} fuori stagione`);
        assert.ok(deperibilitaCompatibile(r.deperibilita, deperibilitaGiorno(d), surgelabile(r, alimentiPerId)), `${d} ${r.id} deperibilità`);
        usi.set(r.id, (usi.get(r.id) || 0) + 1);
      }
    }
    for (const [id, n] of usi) assert.ok(n <= 2, `${id} usata ${n} volte`);
  }
});

test("spesa: somma porzioni e usa il pesce surgelato da martedì", () => {
  const sab = "2026-11-28";
  const piano = {
    [chiavePasto("2026-11-28", "cena")]: "CEN02", // sabato: merluzzo fresco ×2,5
    [chiavePasto("2026-12-03", "cena")]: "CEN02", // giovedì: merluzzo surgelato ×2,5
    [chiavePasto("2026-12-01", "pranzo")]: "PRA01", // martedì pranzo ×1
  };
  const lista = calcolaSpesa({ piano, sabato: sab, ricettePerId, alimentiPerId });
  const v = (id) => lista.find((x) => x.id === id);
  assert.equal(v("AL37").quantita, 500);
  assert.equal(v("AL120").quantita, 500);
  assert.equal(v("AL01").quantita, 120);
  // ordine reparti: verdure prima del banco frigo, congelati dopo
  const idx = (r) => lista.findIndex((x) => x.reparto === r);
  // porzioni cambiate a mano: la cena di sabato per 1 sola persona
  const ridotta = calcolaSpesa({ piano, sabato: sab, ricettePerId, alimentiPerId,
    porzioni: { [chiavePasto("2026-11-28", "cena")]: 1 } });
  assert.equal(ridotta.find((x) => x.id === "AL37").quantita, 200);
  assert.ok(idx("verdure") < idx("banco_frigo") && idx("banco_frigo") < idx("congelati"));
});

test("spostamento pasti: stesso pasto e stessa deperibilità", () => {
  const alta = ricette.find((r) => r.pasto === "cena" && r.deperibilita === "Alta");
  const alta2 = ricette.find((r) => r.pasto === "cena" && r.deperibilita === "Alta" && r.id !== alta.id);
  const bassa = ricette.find((r) => r.pasto === "cena" && r.deperibilita === "Bassa");
  assert.equal(motivoNoSpostamento("2026-11-28_cena", "2026-12-01_cena", alta, alta2), null);
  assert.match(motivoNoSpostamento("2026-11-28_cena", "2026-12-03_cena", alta, bassa), /deperibilità/);
  assert.match(motivoNoSpostamento("2026-11-28_cena", "2026-11-28_pranzo", alta, alta2), /pranzi con pranzi/);
  assert.ok(motivoNoSpostamento("2026-11-28_cena", "2026-11-29_cena", alta, undefined));
  assert.ok(motivoNoSpostamento("2026-11-28_cena", "2026-11-28_cena", alta, alta));
});

test("giorno della spesa diverso dal sabato", async () => {
  const { inizioSettimana: inizio, deperibilitaGiorno: dep, intervalloGiorni, infoGiorno: info } = await import("../js/calendario.js");
  // spesa il mercoledì (3): la settimana va da mercoledì a martedì
  assert.equal(inizio("2026-11-24", 3), "2026-11-18"); // martedì -> mercoledì prima
  assert.equal(inizio("2026-11-25", 3), "2026-11-25");
  assert.equal(dep("2026-11-25", 3), "Alta"); // mer
  assert.equal(dep("2026-11-27", 3), "Alta"); // ven
  assert.equal(dep("2026-11-28", 3), "Media"); // sab
  assert.equal(dep("2026-12-01", 3), "Bassa"); // mar
  assert.equal(intervalloGiorni(0, 2, 3), "mer-ven");
  assert.equal(intervalloGiorni(0, 2), "sab-lun");
  assert.equal(info("2026-11-28", {}, { moltFamiglia: 2.5, moltPranzoFeriale: 1, giornoSpesa: 3 }).deperibilita, "Media");
});

test("spesa: i prodotti presi vanno in fondo al loro reparto", async () => {
  const { spuntatiInFondo } = await import("../js/spesa.js");
  const voci = [
    { nome: "Carote", reparto: "verdure", fatto: true },
    { nome: "Patate", reparto: "verdure", fatto: false },
    { nome: "Zucchine", reparto: "verdure", fatto: false },
    { nome: "Mele", reparto: "frutta", fatto: true },
    { nome: "Pere", reparto: "frutta", fatto: false },
  ];
  assert.deepEqual(spuntatiInFondo(voci).map((v) => v.nome), ["Patate", "Zucchine", "Carote", "Pere", "Mele"]);
});
