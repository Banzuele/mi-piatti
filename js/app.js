import { firebaseConfig, famiglia } from "../config.js";
import { creaArchivio } from "./archivio.js";
import {
  oggiISO, inizioSettimana, aggiungiGiorni, giorniSettimana, giornoSettimana,
  GIORNI_LUNGHI, formattaGiornoMese, intervalloSettimana, infoGiorno, festivita,
  usaSurgelato, IMPOSTAZIONI_PREDEFINITE, daISO,
} from "./calendario.js";
import {
  PASTI, chiavePasto, generaPiano, scegliRicetta, entroTempi, surgelabile,
  deperibilitaCompatibile, REGOLE_SETTIMANA, motivoNoSpostamento as motivoNoSpost,
} from "./pianificatore.js";
import { REPARTI, calcolaSpesa, spesaComeTesto, formattaQuantita } from "./spesa.js";

// ---------------------------------------------------------------- stato
const S = {
  ricette: [], alimenti: [], ricettePerId: new Map(), alimentiPerId: new Map(),
  ricetteBase: [], alimentiBase: [], tutteRicette: [], ricetteUtente: {}, alimentiUtente: {},
  bozza: null, trascina: null, daRidisegnare: false,
  pasti: {}, spunte: {}, extra: {}, giorniCasa: {}, impostazioni: {},
  utente: null, pronto: false, inAttesa: false, errore: null,
  scheda: "menu", settimana: inizioSettimana(oggiISO()), scambio: null,
  mostraDispensa: true, cercaRicetta: "", filtroPasto: "tutti",
};
const archivio = creaArchivio(firebaseConfig, famiglia);
const $contenuto = document.getElementById("contenuto");
const $modale = document.getElementById("modale");

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// Solo indirizzi web veri: niente "javascript:" o simili nei link delle ricette
const linkSicuro = (u) => {
  try { const x = new URL(String(u)); return x.protocol === "https:" || x.protocol === "http:" ? x.href : ""; } catch { return ""; }
};
const num = (v) => String(Math.round(v * 100) / 100).replace(".", ",");
const imp = () => ({ ...IMPOSTAZIONI_PREDEFINITE, ...(S.impostazioni.generali || {}) });
// Porzioni di un pasto: quelle del calendario, oppure quelle scelte a mano nel menù
function moltPasto(k) {
  const [d, p] = k.split("_");
  const base = infoGiorno(d, S.giorniCasa, imp()).moltiplicatori[p];
  const f = S.pasti[k]?.molt;
  const forzato = f != null && f !== base;
  return { valore: forzato ? f : base, base, forzato };
}
const porzioniForzate = () => Object.fromEntries(Object.entries(S.pasti)
  .filter(([k, v]) => v.molt != null).map(([k, v]) => [k, v.molt]));
const piano = () => Object.fromEntries(Object.entries(S.pasti).map(([k, v]) => [k, v.ricetta]));
const idCasuale = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

const ICONA_PROTEINA = {
  "Carne bianca": "🐔", "Carne rossa": "🥩", Pesce: "🐟", Uova: "🥚",
  Formaggi: "🧀", Legumi: "🫘", Nessuna: "🌾",
};
const PASTO = { pranzo: { nome: "Pranzo", ico: "☀️" }, cena: { nome: "Cena", ico: "🌙" } };

function avviso(testo, ms = 2500) {
  const el = document.getElementById("avviso");
  el.textContent = testo;
  el.hidden = false;
  clearTimeout(avviso.t);
  avviso.t = setTimeout(() => { el.hidden = true; }, ms);
}

// Ricette e alimenti = file del repository + aggiunte e modifiche fatte nell'app
// (salvate in Firestore, condivise tra i telefoni).
function ricalcolaDati() {
  const al = new Map(S.alimentiBase.map((a) => [a.id, a]));
  for (const [id, a] of Object.entries(S.alimentiUtente)) {
    if (typeof a?.nome === "string" && a.nome) al.set(id, { ...a, nome: a.nome.slice(0, LIMITI.nome), id });
  }
  S.alimenti = [...al.values()];
  S.alimentiPerId = al;
  const base = new Map(S.ricetteBase.map((r) => [r.id, r]));
  const rs = new Map(base);
  for (const [id, d] of Object.entries(S.ricetteUtente)) {
    const r = d?.ricetta && pulisciRicetta(d.ricetta);
    if (r) rs.set(id, { ...r, id, modificata: base.has(id), mia: !base.has(id) });
    if (d?.nascosta && rs.has(id)) rs.set(id, { ...rs.get(id), nascosta: true });
  }
  S.tutteRicette = [...rs.values()];
  S.ricette = S.tutteRicette.filter((r) => !r.nascosta);
  S.ricettePerId = rs;
}

// Ricette salvate dall'app (Firestore): si accetta solo ciò che ha la forma
// giusta, così un dato rovinato non blocca l'app e non finisce nella pagina.
const LIMITI = { nome: 120, riga: 1000, righe: 40, link: 500, ingredienti: 40 };
function pulisciRicetta(r) {
  const testo = (v, max) => (typeof v === "string" ? v.slice(0, max) : "");
  const numero = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const nome = testo(r.nome, LIMITI.nome);
  if (!nome || !["pranzo", "cena"].includes(r.pasto)) return null;
  return {
    nome, pasto: r.pasto,
    proteina: PROTEINE.includes(r.proteina) ? r.proteina : "Nessuna",
    deperibilita: ["Alta", "Media", "Bassa"].includes(r.deperibilita) ? r.deperibilita : "Bassa",
    stagioni: STAGIONI.filter((x) => Array.isArray(r.stagioni) && r.stagioni.includes(x)),
    tempoPrep: numero(r.tempoPrep), tempoTotale: numero(r.tempoTotale),
    ingredienti: (Array.isArray(r.ingredienti) ? r.ingredienti : []).slice(0, LIMITI.ingredienti)
      .filter((i) => typeof i?.id === "string" && numero(i.q) > 0).map((i) => ({ id: i.id, q: numero(i.q) })),
    procedimento: (Array.isArray(r.procedimento) ? r.procedimento : []).slice(0, LIMITI.righe)
      .map((x) => testo(x, LIMITI.riga)).filter(Boolean),
    ...(r.contorno ? { contorno: testo(r.contorno, LIMITI.riga) } : {}),
    ...(linkSicuro(r.link) ? { link: linkSicuro(r.link) } : {}),
  };
}

// ---------------------------------------------------------------- avvio
async function avvia() {
  try {
    const [ricette, alimenti] = await Promise.all([
      fetch("data/ricette.json", { cache: "no-cache" }).then((r) => r.json()),
      fetch("data/alimenti.json", { cache: "no-cache" }).then((r) => r.json()),
    ]);
    S.ricetteBase = ricette;
    S.alimentiBase = alimenti;
    ricalcolaDati();
  } catch (e) {
    $contenuto.innerHTML = `<p class="vuoto">Impossibile caricare le ricette. Controlla la connessione e riapri l'app.</p>`;
    return;
  }

  let stacca = [];
  await archivio.avvia((utente) => {
    stacca.forEach((f) => f());
    stacca = [];
    S.utente = utente;
    S.errore = null;
    if (utente) {
      for (const coll of ["pasti", "spunte", "extra", "giorniCasa", "impostazioni", "ricetteUtente", "alimentiUtente"]) {
        stacca.push(archivio.ascolta(coll, (dati, meta) => {
          S[coll] = dati;
          if (coll === "ricetteUtente" || coll === "alimentiUtente") ricalcolaDati();
          S.inAttesa = meta.inAttesa;
          S.pronto = true;
          disegna();
        }));
      }
    } else {
      S.pronto = true;
    }
    disegna();
  }, (e) => {
    console.error(e);
    S.errore = e.code === "permission-denied"
      ? "Questo account non è autorizzato. Aggiungi la sua email nelle regole di Firestore (vedi README)."
      : `Errore: ${e.message || e}`;
    disegna();
  }).catch((e) => {
    S.errore = `Impossibile avviare Firebase: ${e.message || e}`;
    disegna();
  });
  disegna();
}

// ---------------------------------------------------------------- disegno
function disegnaStato() {
  const el = document.getElementById("stato-sync");
  if (archivio.modalita === "locale") el.textContent = "📱 Solo su questo telefono";
  else if (!S.utente) el.textContent = "";
  else if (!navigator.onLine) el.textContent = "📴 Offline: salvo e sincronizzo dopo";
  else el.textContent = S.inAttesa ? "⏳ Sincronizzo…" : "☁️ Sincronizzato";
}

function disegna() {
  if (S.trascina) { S.daRidisegnare = true; return; }
  disegnaStato();
  document.querySelectorAll("#schede button").forEach((b) =>
    b.classList.toggle("attiva", b.dataset.scheda === S.scheda));
  if (S.errore) {
    $contenuto.innerHTML = `<div class="scheda-errore">${esc(S.errore)}</div>` + vistaAccesso();
    return;
  }
  if (!S.pronto) return;
  if (archivio.modalita === "cloud" && !S.utente) {
    $contenuto.innerHTML = vistaAccesso();
    return;
  }
  const viste = { menu: vistaMenu, spesa: vistaSpesa, ricette: vistaRicette, altro: vistaAltro };
  $contenuto.innerHTML = viste[S.scheda]();
  if (S.scheda === "ricette") disegnaListaRicette();
}

function vistaAccesso() {
  if (archivio.modalita !== "cloud") return "";
  return `<div class="accesso">
    <div class="logo">🍽️</div>
    <h2>Benvenuti in Mi-Piatti</h2>
    <p>Accedete con il vostro account Google per condividere menù e spesa.</p>
    <button class="btn primario" data-azione="accedi">Accedi con Google</button>
  </div>`;
}

function navSettimana() {
  const corrente = inizioSettimana(oggiISO());
  const quale = S.settimana === corrente ? "Questa settimana"
    : S.settimana === aggiungiGiorni(corrente, 7) ? "Prossima settimana"
    : S.settimana === aggiungiGiorni(corrente, -7) ? "Settimana scorsa" : "Settimana";
  return `<div class="nav-sett">
    <button class="btn-ico" data-azione="sett" data-delta="-7" aria-label="Settimana precedente">‹</button>
    <div class="titolo-sett" data-azione="sett-oggi">
      <small>${quale}</small><strong>${intervalloSettimana(S.settimana)}</strong>
    </div>
    <button class="btn-ico" data-azione="sett" data-delta="7" aria-label="Settimana successiva">›</button>
  </div>`;
}

// ---------------------------------------------------------------- menù
function vistaMenu() {
  const giorni = giorniSettimana(S.settimana);
  const P = piano();
  const oggi = oggiISO();
  const haPasti = giorni.some((d) => PASTI.some((p) => P[chiavePasto(d, p)]));
  let h = navSettimana();
  if (S.scambio) {
    const [d, p] = S.scambio.split("_");
    h += `<div class="banner">Tocca un altro ${PASTO[p].nome.toLowerCase()} da scambiare con quello di ${formattaGiornoMese(d)}.
      <button class="btn piccolo" data-azione="annulla-scambio">Annulla</button></div>`;
  }
  if (!haPasti) {
    h += `<div class="vuoto">
      <p>Nessun menù per questa settimana.</p>
      <button class="btn primario" data-azione="apri-genera">Genera il menù</button></div>`;
    return h;
  }
  for (const d of giorni) {
    const info = infoGiorno(d, S.giorniCasa, imp());
    h += `<section class="giorno ${d === oggi ? "oggi" : ""}">
      <header><strong>${GIORNI_LUNGHI[giornoSettimana(d)]} ${formattaGiornoMese(d)}</strong>
        ${info.motivo ? `<span class="etichetta casa">${esc(info.motivo)}</span>` : ""}
        <span class="etichetta dep-${info.deperibilita.toLowerCase()}" title="Deperibilità">${info.deperibilita}</span>
      </header>`;
    for (const p of PASTI) {
      const k = chiavePasto(d, p);
      const r = S.ricettePerId.get(P[k]);
      const sel = S.scambio === k ? "selezionato" : "";
      const m = moltPasto(k);
      h += `<div class="pasto-riga ${sel}" data-chiave="${k}">
      ${r ? `<span class="maniglia" data-chiave="${k}" role="button" aria-label="Tieni premuto per spostare" title="Tieni premuto per spostare">☰</span>` : `<span class="maniglia vuota"></span>`}
      <button class="pasto" data-azione="pasto" data-chiave="${k}">
        <span class="pasto-ico">${PASTO[p].ico}</span>
        <span class="pasto-testo">
          <span class="pasto-nome">${r ? esc(r.nome) : "<em>— da scegliere —</em>"}</span>
          ${r ? `<span class="pasto-info">${ICONA_PROTEINA[r.proteina] || ""} ${esc(r.proteina)} · ${r.tempoTotale} min</span>` : ""}
        </span>
      </button>
      <button class="molt ${m.forzato ? "forzato" : ""}" data-azione="molt" data-chiave="${k}"
        aria-label="Porzioni: ${num(m.valore)}. Tocca per cambiare" title="${m.forzato ? `Modificato (di solito ×${num(m.base)})` : "Tocca per cambiare le porzioni"}">×${num(m.valore)}</button>
      </div>`;
    }
    h += `</section>`;
  }
  // riepilogo settimana
  const c = { Pesce: 0, Legumi: 0, "Carne rossa": 0 };
  for (const d of giorni) for (const p of PASTI) {
    const r = S.ricettePerId.get(P[chiavePasto(d, p)]);
    if (r && r.proteina in c) c[r.proteina]++;
  }
  const ok = (v, min, max) => (min != null && v < min) || (max != null && v > max) ? "ko" : "ok";
  h += `<div class="riepilogo">
    <span class="${ok(c.Pesce, REGOLE_SETTIMANA.pesceMin)}">🐟 Pesce ${c.Pesce}</span>
    <span class="${ok(c.Legumi, REGOLE_SETTIMANA.legumiMin)}">🫘 Legumi ${c.Legumi}</span>
    <span class="${ok(c["Carne rossa"], null, REGOLE_SETTIMANA.carneRossaMax)}">🥩 Carne rossa ${c["Carne rossa"]}</span>
  </div>
  <button class="btn secondario largo" data-azione="apri-genera">Rigenera menù…</button>`;
  return h;
}

function apriGenera() {
  const corrente = inizioSettimana(oggiISO());
  const opzioni = [0, 7, 14, 21].map((n) => aggiungiGiorni(corrente, n));
  const scelta = opzioni.includes(S.settimana) ? S.settimana : opzioni[S.settimana < corrente ? 0 : 1];
  apriModale(`<h2>Genera il menù</h2>
    <label>Da sabato
      <select id="gen-inizio">${opzioni.map((d) =>
        `<option value="${d}" ${d === scelta ? "selected" : ""}>${intervalloSettimana(d)}</option>`).join("")}</select>
    </label>
    <label>Per
      <select id="gen-sett">${[1, 2, 3, 4].map((n) =>
        `<option value="${n}" ${n === 4 ? "selected" : ""}>${n} ${n === 1 ? "settimana" : "settimane"}</option>`).join("")}</select>
    </label>
    <p class="nota">I pasti già presenti in queste settimane verranno sostituiti. Le spunte della spesa restano.</p>
    <div class="azioni-modale">
      <button class="btn" data-azione="chiudi">Annulla</button>
      <button class="btn primario" data-azione="genera">Genera</button>
    </div>`);
}

async function genera() {
  const inizio = document.getElementById("gen-inizio").value;
  const settimane = Number(document.getElementById("gen-sett").value);
  const ris = generaPiano({ ricette: S.ricette, alimenti: S.alimenti, inizio, settimane, imp: imp() });
  const ops = [];
  for (let g = 0; g < settimane * 7; g++) {
    const d = aggiungiGiorni(inizio, g);
    for (const p of PASTI) {
      const k = chiavePasto(d, p);
      ops.push({ coll: "pasti", id: k, dati: ris.piano[k] ? { ricetta: ris.piano[k] } : null });
    }
  }
  await archivio.scriviMolti(ops);
  S.settimana = inizio;
  chiudiModale();
  avviso(ris.problemi.length ? `Menù generato. Nota: ${ris.problemi.join("; ")}` : "Menù generato", 4000);
}

function apriPasto(k) {
  if (S.scambio) {
    if (S.scambio === k) { S.scambio = null; disegna(); return; }
    const motivo = motivoNoSpostamento(S.scambio, k);
    if (motivo) { avviso(motivo, 3500); return; }
    scambiaPasti(S.scambio, k);
    S.scambio = null;
    return;
  }
  const [d, p] = k.split("_");
  const r = S.ricettePerId.get(S.pasti[k]?.ricetta);
  apriModale(`<h2>${PASTO[p].ico} ${PASTO[p].nome} · ${GIORNI_LUNGHI[giornoSettimana(d)]} ${formattaGiornoMese(d)}</h2>
    ${r ? `<p class="sottotitolo">${esc(r.nome)}</p>` : ""}
    <div class="lista-azioni">
      ${r ? `<button class="btn largo" data-azione="vedi-ricetta" data-id="${esc(r.id)}" data-chiave="${k}">📖 Vedi ricetta e dosi</button>` : ""}
      <button class="btn largo" data-azione="cambia" data-chiave="${k}">🎲 Cambia (proposta automatica)</button>
      <button class="btn largo" data-azione="scegli" data-chiave="${k}">📋 Scegli dall'elenco</button>
      ${r ? `<button class="btn largo" data-azione="scambia" data-chiave="${k}">🔁 Scambia con un altro giorno</button>` : ""}
      ${r ? `<button class="btn largo pericolo" data-azione="svuota" data-chiave="${k}">🗑️ Togli questo pasto</button>` : ""}
    </div>
    <div class="azioni-modale"><button class="btn" data-azione="chiudi">Chiudi</button></div>`);
}

// ---------------------------------------------------------------- spostamento pasti
// Si possono scambiare solo due pasti dello stesso tipo (pranzo/cena) le cui
// ricette hanno la stessa deperibilità.
function motivoNoSpostamento(a, b) {
  return motivoNoSpost(a, b, S.ricettePerId.get(S.pasti[a]?.ricetta), S.ricettePerId.get(S.pasti[b]?.ricetta));
}

function scambiaPasti(a, b) {
  const ra = S.pasti[a]?.ricetta, rb = S.pasti[b]?.ricetta;
  archivio.scriviMolti([
    { coll: "pasti", id: a, dati: { ricetta: rb } },
    { coll: "pasti", id: b, dati: { ricetta: ra } },
  ]);
  avviso("Pasti spostati: spesa aggiornata");
}

function iniziaTrascina(maniglia, e) {
  const k = maniglia.dataset.chiave;
  const riga = maniglia.closest(".pasto-riga");
  const st = { k, riga, maniglia, id: e.pointerId, x0: e.clientX, y0: e.clientY, attivo: false, sopra: null, scorri: 0 };
  st.timer = setTimeout(() => attivaTrascina(st, e.clientY), 350);
  S.trascina = st;
  maniglia.setPointerCapture?.(e.pointerId);
}

function attivaTrascina(st, y) {
  st.attivo = true;
  navigator.vibrate?.(30);
  st.riga.classList.add("sbloccata");
  document.body.classList.add("trascinando");
  for (const r of document.querySelectorAll(".pasto-riga[data-chiave]")) {
    if (r === st.riga) continue;
    r.classList.add(motivoNoSpostamento(st.k, r.dataset.chiave) ? "bersaglio-no" : "bersaglio-ok");
  }
  const rect = st.riga.getBoundingClientRect();
  const fantasma = st.riga.cloneNode(true);
  fantasma.classList.remove("sbloccata");
  fantasma.classList.add("fantasma");
  fantasma.style.width = `${rect.width}px`;
  fantasma.style.left = `${rect.left}px`;
  document.body.appendChild(fantasma);
  st.fantasma = fantasma;
  st.dy = y - rect.top;
  muoviFantasma(st, y);
  const passo = () => {
    if (!S.trascina) return;
    if (st.scorri) window.scrollBy(0, st.scorri);
    st.raf = requestAnimationFrame(passo);
  };
  st.raf = requestAnimationFrame(passo);
}

function muoviFantasma(st, y) {
  st.fantasma.style.top = `${y - st.dy}px`;
  st.scorri = y < 110 ? -8 : y > window.innerHeight - 140 ? 8 : 0;
}

function trovaBersaglio(x, y) {
  const el = document.elementFromPoint(x, y)?.closest(".pasto-riga[data-chiave]");
  return el && !el.classList.contains("fantasma") ? el : null;
}

function fineTrascina(st, x, y, annulla) {
  clearTimeout(st.timer);
  cancelAnimationFrame(st.raf);
  if (st.attivo) {
    const b = annulla ? null : trovaBersaglio(x, y);
    st.fantasma?.remove();
    document.body.classList.remove("trascinando");
    document.querySelectorAll(".sbloccata, .bersaglio-ok, .bersaglio-no, .sopra").forEach((r) =>
      r.classList.remove("sbloccata", "bersaglio-ok", "bersaglio-no", "sopra"));
    S.trascina = null;
    if (b && b !== st.riga) {
      const motivo = motivoNoSpostamento(st.k, b.dataset.chiave);
      if (motivo) avviso(motivo, 3500); else scambiaPasti(st.k, b.dataset.chiave);
    }
  } else {
    S.trascina = null;
    if (!annulla) avviso("Tieni premuto ☰ per spostare il pasto");
  }
  if (S.daRidisegnare) { S.daRidisegnare = false; disegna(); }
}

document.addEventListener("pointerdown", (e) => {
  const m = e.target.closest(".maniglia[data-chiave]");
  if (!m || S.trascina) return;
  e.preventDefault();
  iniziaTrascina(m, e);
});
document.addEventListener("pointermove", (e) => {
  const st = S.trascina;
  if (!st || e.pointerId !== st.id) return;
  if (!st.attivo) {
    if (Math.hypot(e.clientX - st.x0, e.clientY - st.y0) > 12) fineTrascina(st, 0, 0, true);
    return;
  }
  e.preventDefault();
  muoviFantasma(st, e.clientY);
  const b = trovaBersaglio(e.clientX, e.clientY);
  if (st.sopra !== b) {
    st.sopra?.classList.remove("sopra");
    if (b && b !== st.riga) b.classList.add("sopra");
    st.sopra = b;
  }
}, { passive: false });
document.addEventListener("pointerup", (e) => {
  const st = S.trascina;
  if (st && e.pointerId === st.id) fineTrascina(st, e.clientX, e.clientY, false);
});
document.addEventListener("pointercancel", (e) => {
  const st = S.trascina;
  if (st && e.pointerId === st.id) fineTrascina(st, 0, 0, true);
});
document.addEventListener("contextmenu", (e) => { if (e.target.closest(".maniglia")) e.preventDefault(); });

// ---------------------------------------------------------------- editor ricette
const PROTEINE = ["Carne bianca", "Carne rossa", "Pesce", "Uova", "Formaggi", "Legumi", "Nessuna"];
const STAGIONI = ["primavera", "estate", "autunno", "inverno"];
const NOMI_UNITA = { g: "g", ml: "ml", pz: "pz" };

function nuovoIdRicetta(pasto) {
  const pre = pasto === "cena" ? "CEN" : "PRA";
  let max = 0;
  for (const r of S.tutteRicette) {
    const m = r.id.match(/^(PRA|CEN)(\d+)$/);
    if (m && m[1] === pre) max = Math.max(max, Number(m[2]));
  }
  return `${pre}${String(max + 1).padStart(2, "0")}`;
}

function nuovoIdAlimento() {
  let max = 0;
  for (const a of S.alimenti) { const m = a.id.match(/^AL(\d+)$/); if (m) max = Math.max(max, Number(m[1])); }
  return `AL${max + 1}`;
}

function apriEditor(id) {
  const r = id ? S.ricettePerId.get(id) : null;
  S.bozza = r ? {
    id: r.id, nome: r.nome, pasto: r.pasto, proteina: r.proteina, deperibilita: r.deperibilita,
    stagioni: [...r.stagioni], tempoPrep: r.tempoPrep, tempoTotale: r.tempoTotale,
    ingredienti: r.ingredienti.map((i) => ({ ...i })), procedimento: [...(r.procedimento || [])],
    contorno: r.contorno || "", link: r.link || "", nuovoAlimento: false,
  } : {
    id: null, nome: "", pasto: S.filtroPasto === "cena" ? "cena" : "pranzo", proteina: "Nessuna",
    deperibilita: "Media", stagioni: [...STAGIONI], tempoPrep: 15, tempoTotale: 30,
    ingredienti: [{ id: "", q: "" }], procedimento: [], contorno: "", link: "", nuovoAlimento: false,
  };
  disegnaEditor();
}

function disegnaEditor() {
  const b = S.bozza;
  const orig = b.id ? S.ricettePerId.get(b.id) : null;
  const alimenti = [...S.alimenti].sort((x, y) => x.nome.localeCompare(y.nome, "it"));
  const opz = (lista, val) => lista.map(([v, t]) => `<option value="${esc(v)}" ${v === val ? "selected" : ""}>${esc(t)}</option>`).join("");
  apriModale(`<h2>${b.id ? "Modifica ricetta" : "Nuova ricetta"}</h2>
  <form id="editor" class="editor" onsubmit="return false">
    <label>Nome <input name="nome" value="${esc(b.nome)}" required maxlength="120" placeholder="es. Pasta zucchine e ricotta"></label>
    <div class="griglia-2">
      <label>Pasto <select name="pasto" ${b.id ? "disabled" : ""}>${opz([["pranzo", "Pranzo"], ["cena", "Cena"]], b.pasto)}</select></label>
      <label>Proteina <select name="proteina">${opz(PROTEINE.map((p) => [p, p]), b.proteina)}</select></label>
      <label>Deperibilità <select name="deperibilita">${opz([["Alta", "Alta (sab-lun)"], ["Media", "Media (mar-mer)"], ["Bassa", "Bassa (gio-ven)"]], b.deperibilita)}</select></label>
      <span></span>
      <label>Minuti attivi <input name="tempoPrep" type="number" min="1" inputmode="numeric" value="${esc(b.tempoPrep)}"></label>
      <label>Minuti totali <input name="tempoTotale" type="number" min="1" inputmode="numeric" value="${esc(b.tempoTotale)}"></label>
    </div>
    <fieldset class="stagioni"><legend>Stagioni</legend>
      ${STAGIONI.map((st) => `<label class="spunta"><input type="checkbox" name="stagione" value="${st}" ${b.stagioni.includes(st) ? "checked" : ""}> ${st}</label>`).join("")}
    </fieldset>
    <h3>Ingredienti per 1 porzione</h3>
    <div class="ingr-editor">${b.ingredienti.map((i, n) => {
      const a = S.alimentiPerId.get(i.id);
      return `<div class="ingr-riga">
        <select name="ingr-id" data-i="${n}"><option value="">— scegli —</option>${alimenti.map((x) =>
          `<option value="${esc(x.id)}" ${x.id === i.id ? "selected" : ""}>${esc(x.nome)}</option>`).join("")}</select>
        <input name="ingr-q" data-i="${n}" type="number" min="0" step="any" inputmode="decimal" value="${esc(i.q)}" placeholder="qtà">
        <span class="unita">${a ? esc(NOMI_UNITA[a.unita] || a.unita) : ""}</span>
        <button type="button" class="btn-ico piccolo" data-azione="ed-togli-ingr" data-i="${n}" aria-label="Togli">✕</button>
      </div>`;
    }).join("")}</div>
    <div class="azioni-riga">
      <button type="button" class="btn piccolo" data-azione="ed-agg-ingr">+ Ingrediente</button>
      <button type="button" class="btn piccolo" data-azione="ed-nuovo-alimento">+ Alimento che non c'è</button>
    </div>
    ${b.nuovoAlimento ? `<div class="nuovo-alimento">
      <label>Nome alimento <input name="na-nome" maxlength="120" placeholder="es. Ceci neri"></label>
      <div class="griglia-2">
        <label>Reparto <select name="na-reparto">${REPARTI.map((r) => `<option value="${r.id}">${r.nome}</option>`).join("")}</select></label>
        <label>Unità <select name="na-unita"><option value="g">grammi</option><option value="ml">millilitri</option><option value="pz">pezzi</option></select></label>
        <label>Tipo <select name="na-tipo"><option value="fresco">fresco (da comprare)</option><option value="dispensa">dispensa</option></select></label>
      </div>
      <button type="button" class="btn piccolo primario" data-azione="ed-salva-alimento">Aggiungi alimento</button>
    </div>` : ""}
    <label>Procedimento (un passo per riga)
      <textarea name="procedimento" rows="6" placeholder="Lessa la pasta.&#10;Intanto...">${esc(b.procedimento.join("\n"))}</textarea></label>
    <label>Contorno o note (facoltativo) <input name="contorno" maxlength="1000" value="${esc(b.contorno)}"></label>
    <label>Link (facoltativo) <input name="link" type="url" maxlength="500" value="${esc(b.link)}" placeholder="https://…"></label>
  </form>
  ${orig ? `<div class="lista-azioni">
    ${orig.nascosta
      ? `<button class="btn largo" data-azione="ed-mostra" data-id="${esc(orig.id)}">👁️ Torna a proporla nel menù</button>`
      : `<button class="btn largo" data-azione="ed-nascondi" data-id="${esc(orig.id)}">🙈 Non proporla più nel menù</button>`}
    ${orig.modificata ? `<button class="btn largo" data-azione="ed-ripristina" data-id="${esc(orig.id)}">↺ Torna alla versione originale</button>` : ""}
    ${orig.mia ? `<button class="btn largo pericolo" data-azione="ed-elimina" data-id="${esc(orig.id)}">🗑️ Elimina la ricetta</button>` : ""}
  </div>` : ""}
  <div class="azioni-modale">
    <button class="btn" data-azione="chiudi">Annulla</button>
    <button class="btn primario" data-azione="ed-salva">Salva</button>
  </div>`);
}

function leggiEditor() {
  const f = document.getElementById("editor");
  if (!f || !S.bozza) return;
  const b = S.bozza;
  const v = (n) => f.elements[n]?.value ?? "";
  b.nome = v("nome").trim();
  if (!b.id) b.pasto = v("pasto");
  b.proteina = v("proteina");
  b.deperibilita = v("deperibilita");
  b.tempoPrep = v("tempoPrep");
  b.tempoTotale = v("tempoTotale");
  b.stagioni = [...f.querySelectorAll('input[name="stagione"]:checked')].map((x) => x.value);
  b.ingredienti = [...f.querySelectorAll('select[name="ingr-id"]')].map((sel) => ({
    id: sel.value, q: f.querySelector(`input[name="ingr-q"][data-i="${sel.dataset.i}"]`).value,
  }));
  b.procedimento = v("procedimento").split("\n").map((x) => x.trim()).filter(Boolean);
  b.contorno = v("contorno").trim();
  b.link = v("link").trim();
  if (b.nuovoAlimento) b.na = { nome: v("na-nome").trim(), reparto: v("na-reparto"), unita: v("na-unita"), tipo: v("na-tipo") };
}

function salvaEditor() {
  leggiEditor();
  const b = S.bozza;
  const ingr = b.ingredienti.filter((i) => i.id && Number(i.q) > 0).map((i) => ({ id: i.id, q: Number(i.q) }));
  const prep = Number(b.tempoPrep), tot = Number(b.tempoTotale);
  if (!b.nome) return avviso("Scrivi il nome della ricetta");
  if (b.nome.length > LIMITI.nome) return avviso(`Il nome è troppo lungo (massimo ${LIMITI.nome} caratteri)`);
  if (b.link && !linkSicuro(b.link)) return avviso("Il link deve iniziare con https:// (o http://)");
  if (b.link.length > LIMITI.link || b.procedimento.length > LIMITI.righe || b.procedimento.some((x) => x.length > LIMITI.riga)
    || b.contorno.length > LIMITI.riga) return avviso("Testo troppo lungo: accorcia procedimento, contorno o link");
  if (!ingr.length) return avviso("Aggiungi almeno un ingrediente con la quantità");
  if (!b.stagioni.length) return avviso("Scegli almeno una stagione");
  if (!(prep > 0) || !(tot >= prep)) return avviso("Controlla i tempi: il totale non può essere minore dei minuti attivi");
  const id = b.id || nuovoIdRicetta(b.pasto);
  const ricetta = {
    nome: b.nome, pasto: b.pasto, proteina: b.proteina, deperibilita: b.deperibilita,
    stagioni: STAGIONI.filter((s) => b.stagioni.includes(s)), tempoPrep: prep, tempoTotale: tot,
    ingredienti: ingr, procedimento: b.procedimento,
  };
  if (b.contorno) ricetta.contorno = b.contorno;
  if (b.link) ricetta.link = linkSicuro(b.link);
  archivio.scrivi("ricetteUtente", id, { ricetta, quando: Date.now() });
  S.bozza = null;
  chiudiModale();
  const r = { ...ricetta, id };
  avviso(entroTempi(r, imp()) ? "Ricetta salvata" : "Ricetta salvata, ma supera i limiti di tempo: non verrà proposta nel menù", 4000);
}

function salvaNuovoAlimento() {
  leggiEditor();
  const na = S.bozza.na;
  if (!na?.nome) return avviso("Scrivi il nome dell'alimento");
  if (na.nome.length > LIMITI.nome) return avviso(`Il nome è troppo lungo (massimo ${LIMITI.nome} caratteri)`);
  if (S.alimenti.some((a) => a.nome.toLowerCase() === na.nome.toLowerCase())) return avviso("Questo alimento c'è già nell'elenco");
  const id = nuovoIdAlimento();
  const a = { nome: na.nome, reparto: na.reparto, tipo: na.tipo, unita: na.unita };
  archivio.scrivi("alimentiUtente", id, a);
  // subito disponibile nella bozza, anche prima che arrivi la sincronizzazione
  S.alimentiUtente = { ...S.alimentiUtente, [id]: a };
  ricalcolaDati();
  const vuota = S.bozza.ingredienti.find((i) => !i.id);
  if (vuota) vuota.id = id; else S.bozza.ingredienti.push({ id, q: "" });
  S.bozza.nuovoAlimento = false;
  disegnaEditor();
  avviso(`Aggiunto "${na.nome}"`);
}

function cambia(k) {
  const [data, pasto] = k.split("_");
  const P = piano();
  const { ricetta } = scegliRicetta({
    data, pasto, piano: P, ricette: S.ricette, ricettePerId: S.ricettePerId,
    alimentiPerId: S.alimentiPerId, imp: imp(), escludi: P[k] ? [P[k]] : [],
  });
  if (!ricetta) { avviso("Nessuna alternativa disponibile"); return; }
  archivio.scrivi("pasti", k, { ricetta: ricetta.id });
  chiudiModale();
  avviso(`Nuova proposta: ${ricetta.nome}`);
}

function scegli(k, filtro = "") {
  const [data, pasto] = k.split("_");
  const info = infoGiorno(data, S.giorniCasa, imp());
  const f = filtro.toLowerCase();
  const elenco = S.ricette
    .filter((r) => r.pasto === pasto && (!f || r.nome.toLowerCase().includes(f)))
    .map((r) => {
      const adatta = r.stagioni.includes(info.stagione)
        && deperibilitaCompatibile(r.deperibilita, info.deperibilita, surgelabile(r, S.alimentiPerId))
        && entroTempi(r, imp());
      return { r, adatta };
    })
    .sort((a, b) => (b.adatta - a.adatta) || a.r.nome.localeCompare(b.r.nome, "it"));
  apriModale(`<h2>Scegli ${PASTO[pasto].nome.toLowerCase()} · ${formattaGiornoMese(data)}</h2>
    <input type="search" id="cerca-scelta" placeholder="Cerca…" value="${esc(filtro)}" data-chiave="${k}">
    <div class="elenco-scelta">${elenco.map(({ r, adatta }) => `
      <button class="riga-ricetta ${adatta ? "" : "sconsigliata"}" data-azione="scelto" data-chiave="${k}" data-id="${esc(r.id)}">
        <span>${esc(r.nome)}</span>
        <small>${ICONA_PROTEINA[r.proteina] || ""} ${esc(r.proteina)} · ${r.tempoTotale} min${adatta ? "" : " · fuori stagione o deperibilità"}</small>
      </button>`).join("")}
    </div>
    <div class="azioni-modale"><button class="btn" data-azione="chiudi">Annulla</button></div>`);
  const inp = document.getElementById("cerca-scelta");
  inp.addEventListener("input", () => {
    const v = inp.value;
    scegli(k, v);
    const n = document.getElementById("cerca-scelta");
    n.focus();
    n.setSelectionRange(v.length, v.length);
  });
}

function vediRicetta(id, k) {
  const r = S.ricettePerId.get(id);
  if (!r) return;
  let molt = 1, data = null;
  if (k) {
    const [d, p] = k.split("_");
    data = d;
    molt = moltPasto(k).valore;
  }
  const righe = r.ingredienti.map((i) => {
    const a = S.alimentiPerId.get(i.id);
    if (!a) return "";
    const surg = a.surgelato && data && usaSurgelato(data) ? S.alimentiPerId.get(a.surgelato) : null;
    const q = formattaQuantita(Math.round(i.q * molt * 10) / 10, a.unita);
    return `<li><span>${esc(surg ? surg.nome : a.nome)}${a.tipo === "dispensa" ? ' <small class="etichetta">dispensa</small>' : ""}</span><strong>${esc(q)}</strong></li>`;
  }).join("");
  const fuori = !entroTempi(r, imp());
  apriModale(`<h2>${esc(r.nome)}</h2>
    ${r.nascosta ? `<p class="nota avvertenza">Questa ricetta non viene più proposta nel menù.</p>` : ""}
    ${r.mia ? `<p class="nota">Ricetta aggiunta da voi.</p>` : r.modificata ? `<p class="nota">Ricetta modificata da voi.</p>` : ""}
    <div class="chip-riga">
      <span class="chip">${ICONA_PROTEINA[r.proteina] || ""} ${esc(r.proteina)}</span>
      <span class="chip">⏱️ ${r.tempoPrep} min attivi · ${r.tempoTotale} min totali</span>
      <span class="chip">Deperibilità ${esc(r.deperibilita)}</span>
      <span class="chip">${r.stagioni.length === 4 ? "Tutto l'anno" : esc(r.stagioni.join(", "))}</span>
    </div>
    ${fuori ? `<p class="nota avvertenza">Supera i limiti di tempo (${imp().maxPrep} min attivi, ${imp().maxTotale} totali): non viene proposta nel menù.</p>` : ""}
    <h3>Ingredienti ${molt === 1 ? "(1 porzione)" : `(×${num(molt)} porzioni)`}</h3>
    <ul class="ingredienti">${righe}</ul>
    ${r.contorno ? `<p class="nota">Contorno e frutta: ${esc(r.contorno)}</p>` : ""}
    ${r.procedimento?.length ? `<h3>Procedimento</h3>
    <ol class="procedimento">${r.procedimento.map((p) => `<li>${esc(p)}</li>`).join("")}</ol>` : ""}
    ${r.link ? `<p><a href="${esc(linkSicuro(r.link))}" target="_blank" rel="noopener noreferrer">Apri la ricetta online ↗</a></p>` : ""}
    <div class="azioni-modale">
      <button class="btn" data-azione="modifica-ricetta" data-id="${esc(r.id)}">✏️ Modifica</button>
      <button class="btn" data-azione="chiudi">Chiudi</button>
    </div>`);
}

// ---------------------------------------------------------------- spesa
function vociSpesa() {
  const voci = calcolaSpesa({
    piano: piano(), sabato: S.settimana, ricettePerId: S.ricettePerId,
    alimentiPerId: S.alimentiPerId, giorniCasa: S.giorniCasa, imp: imp(), porzioni: porzioniForzate(),
  }).map((v) => ({ ...v, chiave: `${S.settimana}_${v.id}`, fatto: !!S.spunte[`${S.settimana}_${v.id}`]?.fatto }));
  const extra = Object.entries(S.extra)
    .filter(([, e]) => e.settimana === S.settimana)
    .map(([id, e]) => ({
      id, chiave: id, extra: true, nome: e.testo, reparto: e.reparto || "altro", tipo: "fresco",
      testoQuantita: "", testoConfezioni: "", testoGiorni: "", fatto: !!e.fatto,
    }));
  const pos = new Map(REPARTI.map((r, i) => [r.id, i]));
  return [...voci, ...extra].sort((a, b) =>
    (pos.get(a.reparto) ?? 99) - (pos.get(b.reparto) ?? 99) || a.nome.localeCompare(b.nome, "it"));
}

function vistaSpesa() {
  let h = navSettimana();
  const tutte = vociSpesa();
  const voci = tutte.filter((v) => S.mostraDispensa || v.tipo !== "dispensa" || v.extra);
  const presi = voci.filter((v) => v.fatto).length;
  h += `<div class="barra-spesa">
    <span>${presi}/${voci.length} presi</span>
    <label class="interruttore"><input type="checkbox" data-azione="dispensa" ${S.mostraDispensa ? "checked" : ""}> Mostra dispensa</label>
  </div>`;
  if (!tutte.length) {
    h += `<div class="vuoto"><p>Nessun pasto in questa settimana, quindi niente da comprare.</p>
      <button class="btn" data-azione="vai-menu">Vai al menù</button></div>`;
  }
  let reparto = null;
  for (const v of voci) {
    if (v.reparto !== reparto) {
      if (reparto !== null) h += `</ul>`;
      reparto = v.reparto;
      h += `<h3 class="reparto">${esc(REPARTI.find((r) => r.id === reparto)?.nome || reparto)}</h3><ul class="spesa">`;
    }
    h += `<li class="${v.fatto ? "fatto" : ""}">
      <label>
        <input type="checkbox" data-azione="spunta" data-chiave="${esc(v.chiave)}" ${v.extra ? 'data-extra="1"' : ""} ${v.fatto ? "checked" : ""}>
        <span class="voce">
          <span class="voce-nome">${esc(v.nome)}${v.tipo === "dispensa" && !v.extra ? ' <small class="etichetta">dispensa</small>' : ""}</span>
          <span class="voce-dett">${[v.testoQuantita, v.testoConfezioni && `${v.testoConfezioni}`, v.testoGiorni].filter(Boolean).map(esc).join(" · ")}</span>
        </span>
      </label>
      ${v.extra ? `<button class="btn-ico piccolo" data-azione="togli-extra" data-id="${esc(v.id)}" aria-label="Togli">✕</button>` : ""}
    </li>`;
  }
  if (reparto !== null) h += `</ul>`;
  h += `<form class="aggiungi" data-azione="aggiungi-extra">
    <input name="testo" placeholder="Aggiungi altro (es. detersivo)" autocomplete="off" required>
    <select name="reparto">${REPARTI.map((r) => `<option value="${r.id}" ${r.id === "altro" ? "selected" : ""}>${r.nome}</option>`).join("")}</select>
    <button class="btn primario">+</button>
  </form>
  <div class="azioni-riga">
    <button class="btn" data-azione="copia-spesa">📋 Copia come testo</button>
    <button class="btn" data-azione="azzera-spunte">↺ Togli le spunte</button>
  </div>
  <p class="nota">Il pesce dei pasti da martedì a venerdì è già nella versione surgelata.</p>`;
  return h;
}

// ---------------------------------------------------------------- ricette
function vistaRicette() {
  const filtri = [["tutti", "Tutte"], ["pranzo", "Pranzi"], ["cena", "Cene"]];
  return `<button class="btn primario largo centro-testo" data-azione="nuova-ricetta">+ Nuova ricetta</button>
    <input type="search" id="cerca-ricette" placeholder="Cerca una ricetta o un ingrediente…" value="${esc(S.cercaRicetta)}">
    <div class="chip-riga">${filtri.map(([v, t]) =>
      `<button class="chip ${S.filtroPasto === v ? "attivo" : ""}" data-azione="filtro-pasto" data-valore="${v}">${t}</button>`).join("")}</div>
    <div id="lista-ricette"></div>`;
}

function disegnaListaRicette() {
  const el = document.getElementById("lista-ricette");
  if (!el) return;
  const f = S.cercaRicetta.toLowerCase().trim();
  const elenco = S.tutteRicette.filter((r) => (S.filtroPasto === "tutti" || r.pasto === S.filtroPasto)
    && (!f || r.nome.toLowerCase().includes(f)
      || r.ingredienti.some((i) => S.alimentiPerId.get(i.id)?.nome.toLowerCase().includes(f))));
  elenco.sort((a, b) => (a.nascosta ? 1 : 0) - (b.nascosta ? 1 : 0));
  el.innerHTML = `<p class="nota">${elenco.length} ricette</p>` + elenco.map((r) => `
    <button class="riga-ricetta ${entroTempi(r, imp()) && !r.nascosta ? "" : "sconsigliata"}" data-azione="vedi-ricetta" data-id="${esc(r.id)}">
      <span>${PASTO[r.pasto].ico} ${esc(r.nome)}${r.nascosta ? ' <small class="etichetta">non proposta</small>' : r.mia ? ' <small class="etichetta">vostra</small>' : r.modificata ? ' <small class="etichetta">modificata</small>' : ""}</span>
      <small>${ICONA_PROTEINA[r.proteina] || ""} ${esc(r.proteina)} · ${r.tempoPrep}/${r.tempoTotale} min · ${r.stagioni.length === 4 ? "tutto l'anno" : esc(r.stagioni.join(", "))}</small>
    </button>`).join("");
}

// ---------------------------------------------------------------- altro
function vistaAltro() {
  const I = imp();
  const anno = Number(oggiISO().slice(0, 4));
  const casa = Object.entries(S.giorniCasa).sort(([a], [b]) => a.localeCompare(b));
  // raggruppa giorni consecutivi con lo stesso tipo e nota
  const gruppi = [];
  for (const [d, v] of casa) {
    const g = gruppi[gruppi.length - 1];
    if (g && aggiungiGiorni(g.al, 1) === d && g.tipo === v.tipo && (g.nota || "") === (v.nota || "")) {
      g.al = d; g.giorni.push(d);
    } else gruppi.push({ dal: d, al: d, tipo: v.tipo, nota: v.nota, giorni: [d] });
  }
  const oggi = oggiISO();
  const nomeTipo = { ferie: "Ferie", mensa: "Mensa chiusa", altro: "A casa" };
  const feste = [...festivita(anno), ...festivita(anno + 1)].filter((f) => f.data >= oggi).slice(0, 8);
  return `
  <section class="pannello">
    <h2>Account</h2>
    ${archivio.modalita === "locale"
      ? `<p>L'app funziona solo su questo telefono. Per condividere menù e spesa bisogna collegare Firebase (istruzioni nel README del progetto).</p>`
      : `<p>Connesso come <strong>${esc(S.utente?.nome)}</strong>${S.utente?.email ? ` (${esc(S.utente.email)})` : ""}.</p>
         <button class="btn" data-azione="esci">Esci</button>`}
  </section>

  <section class="pannello">
    <h2>Giorni a casa</h2>
    <p class="nota">Ferie e giorni con la mensa chiusa: il pranzo diventa per tutta la famiglia (×${num(I.moltFamiglia)}). Le festività nazionali sono già incluse.</p>
    <form class="form-casa" data-azione="aggiungi-casa">
      <label>Dal <input type="date" name="dal" required value="${oggi}"></label>
      <label>Al <input type="date" name="al" value=""></label>
      <label>Motivo <select name="tipo"><option value="ferie">Ferie</option><option value="mensa">Mensa chiusa</option><option value="altro">Altro</option></select></label>
      <label>Nota <input name="nota" placeholder="facoltativa"></label>
      <button class="btn primario">Aggiungi</button>
    </form>
    <ul class="elenco-casa">${gruppi.filter((g) => g.al >= aggiungiGiorni(oggi, -30)).map((g) => `
      <li><span><strong>${g.dal === g.al ? formattaGiornoMese(g.dal) : `${formattaGiornoMese(g.dal)} – ${formattaGiornoMese(g.al)}`}</strong>
        ${esc(nomeTipo[g.tipo] || g.tipo)}${g.nota ? ` · ${esc(g.nota)}` : ""}</span>
        <button class="btn-ico piccolo" data-azione="togli-casa" data-giorni="${esc(g.giorni.join(","))}" aria-label="Togli">✕</button></li>`).join("")
      || "<li class='nota'>Nessun giorno inserito.</li>"}</ul>
    <details><summary>Prossime festività</summary>
      <ul class="elenco-casa">${feste.map((f) => `<li><span><strong>${formattaGiornoMese(f.data)} ${f.data.slice(0, 4)}</strong> ${esc(f.nome)}</span></li>`).join("")}</ul>
    </details>
  </section>

  <section class="pannello">
    <h2>Impostazioni</h2>
    <form class="form-imp" data-azione="salva-imp">
      <label>Porzioni pranzo feriale <input type="number" step="0.5" min="0.5" name="moltPranzoFeriale" value="${esc(I.moltPranzoFeriale)}"></label>
      <label>Porzioni famiglia (cene, weekend, feste) <input type="number" step="0.5" min="0.5" name="moltFamiglia" value="${esc(I.moltFamiglia)}"></label>
      <label>Preparazione attiva massima (min) <input type="number" min="5" name="maxPrep" value="${esc(I.maxPrep)}"></label>
      <label>Tempo totale massimo (min) <input type="number" min="5" name="maxTotale" value="${esc(I.maxTotale)}"></label>
      <label>Ripetizioni massime di una ricetta in 4 settimane <input type="number" min="1" name="maxRipetizioni" value="${esc(I.maxRipetizioni)}"></label>
      <button class="btn primario">Salva</button>
    </form>
  </section>
  <p class="nota centro">Mi-Piatti v6 · ${S.ricette.length} ricette · ${S.alimenti.length} alimenti</p>`;
}

// ---------------------------------------------------------------- modale
function apriModale(html) {
  $modale.innerHTML = `<div class="foglio" role="dialog" aria-modal="true">${html}</div>`;
  $modale.hidden = false;
  document.body.classList.add("bloccato");
}
function chiudiModale() {
  $modale.hidden = true;
  $modale.innerHTML = "";
  document.body.classList.remove("bloccato");
}

// ---------------------------------------------------------------- eventi
document.getElementById("schede").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-scheda]");
  if (!b) return;
  S.scheda = b.dataset.scheda;
  S.scambio = null;
  disegna();
  window.scrollTo(0, 0);
});

$modale.addEventListener("click", (e) => { if (e.target === $modale) chiudiModale(); });

document.addEventListener("click", async (e) => {
  const el = e.target.closest("[data-azione]");
  if (!el || el.tagName === "FORM" || el.tagName === "INPUT") return;
  const { azione, chiave, id } = el.dataset;
  switch (azione) {
    case "accedi":
      try { await archivio.accedi(); } catch (err) { avviso(`Accesso non riuscito: ${err.message}`, 5000); }
      break;
    case "esci": await archivio.esci(); break;
    case "sett": S.settimana = aggiungiGiorni(S.settimana, Number(el.dataset.delta)); disegna(); break;
    case "sett-oggi": S.settimana = inizioSettimana(oggiISO()); disegna(); break;
    case "apri-genera": apriGenera(); break;
    case "genera": await genera(); break;
    case "pasto": apriPasto(chiave); break;
    case "molt": {
      const I = imp(), m = moltPasto(chiave);
      const nuovo = m.valore === I.moltFamiglia ? I.moltPranzoFeriale : I.moltFamiglia;
      archivio.scrivi("pasti", chiave, { molt: nuovo === m.base ? null : nuovo });
      avviso(`Porzioni ×${num(nuovo)}: lista della spesa aggiornata`);
      break;
    }
    case "cambia": cambia(chiave); break;
    case "scegli": scegli(chiave); break;
    case "scelto":
      archivio.scrivi("pasti", chiave, { ricetta: id });
      chiudiModale();
      break;
    case "scambia": S.scambio = chiave; chiudiModale(); disegna(); break;
    case "annulla-scambio": S.scambio = null; disegna(); break;
    case "svuota": archivio.elimina("pasti", chiave); chiudiModale(); break;
    case "vedi-ricetta": vediRicetta(id, chiave); break;
    case "nuova-ricetta": apriEditor(null); break;
    case "modifica-ricetta": apriEditor(id); break;
    case "ed-agg-ingr": leggiEditor(); S.bozza.ingredienti.push({ id: "", q: "" }); disegnaEditor(); break;
    case "ed-togli-ingr": leggiEditor(); S.bozza.ingredienti.splice(Number(el.dataset.i), 1); disegnaEditor(); break;
    case "ed-nuovo-alimento": leggiEditor(); S.bozza.nuovoAlimento = !S.bozza.nuovoAlimento; disegnaEditor(); break;
    case "ed-salva-alimento": salvaNuovoAlimento(); break;
    case "ed-salva": salvaEditor(); break;
    case "ed-nascondi":
      archivio.scrivi("ricetteUtente", id, { nascosta: true }); chiudiModale(); avviso("Non verrà più proposta nel menù"); break;
    case "ed-mostra":
      archivio.scrivi("ricetteUtente", id, { nascosta: false }); chiudiModale(); avviso("Verrà di nuovo proposta nel menù"); break;
    case "ed-ripristina":
      if (S.ricetteUtente[id]?.nascosta) archivio.scriviMolti([{ coll: "ricetteUtente", id, dati: null }, { coll: "ricetteUtente", id, dati: { nascosta: true } }]);
      else archivio.elimina("ricetteUtente", id);
      chiudiModale(); avviso("Ripristinata la versione originale"); break;
    case "ed-elimina":
      archivio.elimina("ricetteUtente", id); chiudiModale(); avviso("Ricetta eliminata"); break;
    case "chiudi": chiudiModale(); break;
    case "vai-menu": S.scheda = "menu"; disegna(); break;
    case "filtro-pasto": S.filtroPasto = el.dataset.valore; disegna(); break;
    case "togli-extra": archivio.elimina("extra", id); break;
    case "togli-casa":
      archivio.scriviMolti(el.dataset.giorni.split(",").map((d) => ({ coll: "giorniCasa", id: d, dati: null })));
      break;
    case "copia-spesa": {
      const voci = vociSpesa().filter((v) => S.mostraDispensa || v.tipo !== "dispensa" || v.extra);
      const testo = spesaComeTesto(`Spesa ${intervalloSettimana(S.settimana)}`, voci);
      try { await navigator.clipboard.writeText(testo); avviso("Lista copiata"); }
      catch { apriModale(`<h2>Copia la lista</h2><textarea class="testo-copia" readonly>${esc(testo)}</textarea>
        <div class="azioni-modale"><button class="btn" data-azione="chiudi">Chiudi</button></div>`); }
      break;
    }
    case "azzera-spunte": {
      const ops = [];
      for (const k of Object.keys(S.spunte)) if (k.startsWith(`${S.settimana}_`)) ops.push({ coll: "spunte", id: k, dati: null });
      for (const [k, v] of Object.entries(S.extra)) if (v.settimana === S.settimana && v.fatto) ops.push({ coll: "extra", id: k, dati: { fatto: false } });
      archivio.scriviMolti(ops);
      break;
    }
  }
});

document.addEventListener("change", (e) => {
  const el = e.target;
  if (el.dataset.azione === "spunta") {
    if (el.dataset.extra) archivio.scrivi("extra", el.dataset.chiave, { fatto: el.checked });
    else if (el.checked) archivio.scrivi("spunte", el.dataset.chiave, { fatto: true, quando: Date.now() });
    else archivio.elimina("spunte", el.dataset.chiave);
  } else if (el.name === "ingr-id") {
    const a = S.alimentiPerId.get(el.value);
    const u = el.parentElement.querySelector(".unita");
    if (u) u.textContent = a ? NOMI_UNITA[a.unita] || a.unita : "";
  } else if (el.dataset.azione === "dispensa") {
    S.mostraDispensa = el.checked;
    disegna();
  }
});

document.addEventListener("input", (e) => {
  if (e.target.id === "cerca-ricette") {
    S.cercaRicetta = e.target.value;
    disegnaListaRicette();
  }
});

document.addEventListener("submit", (e) => {
  const f = e.target;
  e.preventDefault();
  const dati = Object.fromEntries(new FormData(f));
  if (f.dataset.azione === "aggiungi-extra") {
    if (!dati.testo.trim()) return;
    archivio.scrivi("extra", idCasuale(), { settimana: S.settimana, testo: dati.testo.trim(), reparto: dati.reparto, fatto: false });
  } else if (f.dataset.azione === "aggiungi-casa") {
    const dal = dati.dal, al = dati.al && dati.al >= dal ? dati.al : dal;
    const ops = [];
    for (let d = dal; d <= al && ops.length < 120; d = aggiungiGiorni(d, 1)) {
      ops.push({ coll: "giorniCasa", id: d, dati: { tipo: dati.tipo, nota: dati.nota || "" } });
    }
    archivio.scriviMolti(ops);
    avviso(ops.length === 1 ? "Giorno aggiunto" : `${ops.length} giorni aggiunti`);
  } else if (f.dataset.azione === "salva-imp") {
    const nuovi = {};
    for (const [k, v] of Object.entries(dati)) nuovi[k] = Number(v);
    archivio.scrivi("impostazioni", "generali", nuovi);
    avviso("Impostazioni salvate");
  }
});

window.addEventListener("online", disegnaStato);
window.addEventListener("offline", disegnaStato);
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$modale.hidden) chiudiModale(); });

// Aggiornamenti: il telefono controlla se c'è una nuova versione a ogni apertura
// e quando l'app torna in primo piano; se c'è, mostra un avviso per ricaricare.
function avvisoAggiornamento() {
  if (document.getElementById("aggiorna")) return;
  const el = document.createElement("div");
  el.id = "aggiorna";
  el.className = "aggiorna";
  el.innerHTML = `<span>Nuova versione disponibile</span><button class="btn piccolo primario">Aggiorna</button>`;
  el.querySelector("button").addEventListener("click", () => location.reload());
  document.body.appendChild(el);
}

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  const giaControllata = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then((reg) => {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") reg.update().catch(() => {});
    });
  }).catch((e) => console.warn("Service worker non registrato", e));
  // un nuovo service worker ha preso il controllo mentre l'app era aperta
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (giaControllata) avvisoAggiornamento(); });
  // il service worker ha servito una copia vecchia e poi ha scaricato quella nuova
  navigator.serviceWorker.addEventListener("message", (e) => {
    if (e.data?.tipo === "aggiornamento") avvisoAggiornamento();
  });
}

// per i test
window.__mipiatti = { S, daISO };

avvia();
