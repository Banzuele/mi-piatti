import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chiaveProdotto, leggiNumero, prezzoUnitario, pulisciPrezzo, storico, statistiche, formattaUnitario,
} from "../js/prezzi.js";

test("lettura del prezzo scritto a mano", () => {
  assert.equal(leggiNumero("2,49"), 2.49);
  assert.equal(leggiNumero("€ 3.5"), 3.5);
  assert.equal(leggiNumero(",99"), 0.99);
  assert.equal(leggiNumero(""), null);
  assert.equal(leggiNumero("0"), null);
  assert.equal(leggiNumero("abc"), null);
  assert.equal(leggiNumero("1,2,3"), null);
});

test("prezzo al kg, al litro e al pezzo", () => {
  assert.deepEqual(prezzoUnitario(2.5, 500, "g"), { valore: 5, unita: "kg" });
  const l = prezzoUnitario(1.2, 1500, "ml");
  assert.equal(l.unita, "l");
  assert.ok(Math.abs(l.valore - 0.8) < 1e-9);
  assert.deepEqual(prezzoUnitario(3, 6, "pz"), { valore: 0.5, unita: "pz" });
  assert.equal(prezzoUnitario(0, 500, "g"), null);
  assert.equal(formattaUnitario({ valore: 5, unita: "kg" }).replace(/\s/g, " "), "5,00 €/kg");
});

test("chiave prodotto per alimenti e voci libere", () => {
  assert.equal(chiaveProdotto({ alimento: "AL012" }), "AL012");
  assert.equal(chiaveProdotto({ nome: "  Detersivo   Piatti " }), "x:detersivo piatti");
});

test("prezzi rovinati scartati", () => {
  const ok = { prodotto: "AL012", prezzo: 2, quantita: 500, unita: "g", data: "2026-11-21" };
  assert.ok(pulisciPrezzo(ok));
  assert.equal(pulisciPrezzo({ ...ok, prezzo: -1 }), null);
  assert.equal(pulisciPrezzo({ ...ok, prezzo: "x" }), null);
  assert.equal(pulisciPrezzo({ ...ok, unita: "kg" }), null);
  assert.equal(pulisciPrezzo({ ...ok, data: "ieri" }), null);
  assert.equal(pulisciPrezzo({ ...ok, prodotto: "" }), null);
  assert.equal(pulisciPrezzo(null), null);
});

test("storico, media e andamento", () => {
  const prezzi = {
    a: { prodotto: "AL012", prezzo: 2, quantita: 1000, unita: "g", data: "2026-11-07" },
    b: { prodotto: "AL012", prezzo: 1, quantita: 500, unita: "g", data: "2026-11-14" },
    c: { prodotto: "AL012", prezzo: 1.5, quantita: 500, unita: "g", data: "2026-11-21" },
    d: { prodotto: "AL099", prezzo: 9, quantita: 1, unita: "pz", data: "2026-11-21" },
  };
  const s = storico(prezzi, "AL012");
  assert.deepEqual(s.map((p) => p.id), ["c", "b", "a"]);
  const st = statistiche(s);
  assert.equal(st.ultimo.valore, 3);
  assert.equal(st.media, (3 + 2 + 2) / 3);
  assert.equal(st.tendenza, "su");
  assert.equal(st.n, 3);
  assert.equal(statistiche(storico(prezzi, "AL099")).tendenza, null);
  assert.equal(statistiche([]), null);
  const giu = statistiche(storico({ ...prezzi, c: { ...prezzi.c, prezzo: 0.8 } }, "AL012"));
  assert.equal(giu.tendenza, "giu");
});

test("costo previsto: pagato, poi ultimo prezzo vero, poi stima", async () => {
  const { costoVoce, costoDaUnitario } = await import("../js/prezzi.js");
  assert.equal(costoDaUnitario(2, 500, "g"), 1);
  assert.equal(costoDaUnitario(0.4, 3, "pz"), 1.2000000000000002);
  const st = { ultimo: { valore: 3, unita: "kg" } };
  assert.deepEqual(costoVoce({ pagato: { prezzo: 2.49 }, st, stima: 2, quantita: 500, unita: "g" }), { valore: 2.49, fonte: "pagato" });
  assert.deepEqual(costoVoce({ st, stima: 2, quantita: 500, unita: "g" }), { valore: 1.5, fonte: "ultimo" });
  assert.deepEqual(costoVoce({ stima: 2, quantita: 500, unita: "g" }), { valore: 1, fonte: "stima" });
  assert.equal(costoVoce({ quantita: 500, unita: "g" }), null);
});

test("ogni alimento ha una stima di prezzo plausibile", async () => {
  const { readFileSync } = await import("node:fs");
  const alimenti = JSON.parse(readFileSync(new URL("../data/alimenti.json", import.meta.url)));
  for (const a of alimenti) {
    assert.ok(a.stima > 0 && a.stima < 100, `${a.id} ${a.nome}: stima ${a.stima}`);
  }
});
