import { firebaseConfig, famiglia } from "../config.js";
import { creaArchivio } from "./archivio.js";
import {
  oggiISO, inizioSettimana, aggiungiGiorni, giorniSettimana, giornoSettimana,
  GIORNI_LUNGHI, formattaGiornoMese, intervalloSettimana, infoGiorno, festivita,
  usaSurgelato, IMPOSTAZIONI_PREDEFINITE, daISO,
} from "./calendario.js";
import {
  PASTI, chiavePasto, generaPiano, scegliRicetta, entroTempi, surgelabile,
  deperibilitaCompatibile, REGOLE_SETTIMANA,
} from "./pianificatore.js";
import { REPARTI, calcolaSpesa, spesaComeTesto, formattaQuantita } from "./spesa.js";

// ---------------------------------------------------------------- stato
const S = {
  ricette: [], alimenti: [], ricettePerId: new Map(), alimentiPerId: new Map(),
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
const num = (v) => String(Math.round(v * 100) / 100).replace(".", ",");
const imp = () => ({ ...IMPOSTAZIONI_PREDEFINITE, ...(S.impostazioni.generali || {}) });
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

// ---------------------------------------------------------------- avvio
async function avvia() {
  try {
    const [ricette, alimenti] = await Promise.all([
      fetch("data/ricette.json").then((r) => r.json()),
      fetch("data/alimenti.json").then((r) => r.json()),
    ]);
    S.ricette = ricette;
    S.alimenti = alimenti;
    S.ricettePerId = new Map(ricette.map((r) => [r.id, r]));
    S.alimentiPerId = new Map(alimenti.map((a) => [a.id, a]));
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
      for (const coll of ["pasti", "spunte", "extra", "giorniCasa", "impostazioni"]) {
        stacca.push(archivio.ascolta(coll, (dati, meta) => {
          S[coll] = dati;
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
      h += `<button class="pasto ${sel}" data-azione="pasto" data-chiave="${k}">
        <span class="pasto-ico">${PASTO[p].ico}</span>
        <span class="pasto-testo">
          <span class="pasto-nome">${r ? esc(r.nome) : "<em>— da scegliere —</em>"}</span>
          ${r ? `<span class="pasto-info">${ICONA_PROTEINA[r.proteina] || ""} ${esc(r.proteina)} · ${r.tempoTotale} min</span>` : ""}
        </span>
        <span class="molt">×${num(info.moltiplicatori[p])}</span>
      </button>`;
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
    const pA = S.scambio.split("_")[1], pB = k.split("_")[1];
    if (pA !== pB) { avviso("Si possono scambiare solo pranzi con pranzi e cene con cene"); return; }
    const a = S.pasti[S.scambio]?.ricetta || null, b = S.pasti[k]?.ricetta || null;
    archivio.scriviMolti([
      { coll: "pasti", id: S.scambio, dati: b ? { ricetta: b } : null },
      { coll: "pasti", id: k, dati: a ? { ricetta: a } : null },
    ]);
    S.scambio = null;
    avviso("Pasti scambiati");
    return;
  }
  const [d, p] = k.split("_");
  const r = S.ricettePerId.get(S.pasti[k]?.ricetta);
  apriModale(`<h2>${PASTO[p].ico} ${PASTO[p].nome} · ${GIORNI_LUNGHI[giornoSettimana(d)]} ${formattaGiornoMese(d)}</h2>
    ${r ? `<p class="sottotitolo">${esc(r.nome)}</p>` : ""}
    <div class="lista-azioni">
      ${r ? `<button class="btn largo" data-azione="vedi-ricetta" data-id="${r.id}" data-chiave="${k}">📖 Vedi ricetta e dosi</button>` : ""}
      <button class="btn largo" data-azione="cambia" data-chiave="${k}">🎲 Cambia (proposta automatica)</button>
      <button class="btn largo" data-azione="scegli" data-chiave="${k}">📋 Scegli dall'elenco</button>
      ${r ? `<button class="btn largo" data-azione="scambia" data-chiave="${k}">🔁 Scambia con un altro giorno</button>` : ""}
      ${r ? `<button class="btn largo pericolo" data-azione="svuota" data-chiave="${k}">🗑️ Togli questo pasto</button>` : ""}
    </div>
    <div class="azioni-modale"><button class="btn" data-azione="chiudi">Chiudi</button></div>`);
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
      <button class="riga-ricetta ${adatta ? "" : "sconsigliata"}" data-azione="scelto" data-chiave="${k}" data-id="${r.id}">
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
    molt = infoGiorno(d, S.giorniCasa, imp()).moltiplicatori[p];
  }
  const righe = r.ingredienti.map((i) => {
    const a = S.alimentiPerId.get(i.id);
    if (!a) return "";
    const surg = a.surgelato && data && usaSurgelato(data) ? S.alimentiPerId.get(a.surgelato) : null;
    const q = formattaQuantita(Math.round(i.q * molt * 10) / 10, a.unita);
    return `<li><span>${esc(surg ? surg.nome : a.nome)}${a.tipo === "dispensa" ? ' <small class="etichetta">dispensa</small>' : ""}</span><strong>${q}</strong></li>`;
  }).join("");
  const fuori = !entroTempi(r, imp());
  apriModale(`<h2>${esc(r.nome)}</h2>
    <div class="chip-riga">
      <span class="chip">${ICONA_PROTEINA[r.proteina] || ""} ${esc(r.proteina)}</span>
      <span class="chip">⏱️ ${r.tempoPrep} min attivi · ${r.tempoTotale} min totali</span>
      <span class="chip">Deperibilità ${esc(r.deperibilita)}</span>
      <span class="chip">${r.stagioni.length === 4 ? "Tutto l'anno" : r.stagioni.join(", ")}</span>
    </div>
    ${fuori ? `<p class="nota avvertenza">Supera i limiti di tempo (${imp().maxPrep} min attivi, ${imp().maxTotale} totali): non viene proposta nel menù.</p>` : ""}
    <h3>Ingredienti ${molt === 1 ? "(1 porzione)" : `(×${num(molt)} porzioni)`}</h3>
    <ul class="ingredienti">${righe}</ul>
    ${r.contorno ? `<p class="nota">Contorno e frutta: ${esc(r.contorno)}</p>` : ""}
    ${r.procedimento?.length ? `<h3>Procedimento</h3>
    <ol class="procedimento">${r.procedimento.map((p) => `<li>${esc(p)}</li>`).join("")}</ol>` : ""}
    ${r.link ? `<p><a href="${esc(r.link)}" target="_blank" rel="noopener">Apri la ricetta online ↗</a></p>` : ""}
    <div class="azioni-modale"><button class="btn" data-azione="chiudi">Chiudi</button></div>`);
}

// ---------------------------------------------------------------- spesa
function vociSpesa() {
  const voci = calcolaSpesa({
    piano: piano(), sabato: S.settimana, ricettePerId: S.ricettePerId,
    alimentiPerId: S.alimentiPerId, giorniCasa: S.giorniCasa, imp: imp(),
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
  return `<input type="search" id="cerca-ricette" placeholder="Cerca una ricetta o un ingrediente…" value="${esc(S.cercaRicetta)}">
    <div class="chip-riga">${filtri.map(([v, t]) =>
      `<button class="chip ${S.filtroPasto === v ? "attivo" : ""}" data-azione="filtro-pasto" data-valore="${v}">${t}</button>`).join("")}</div>
    <div id="lista-ricette"></div>`;
}

function disegnaListaRicette() {
  const el = document.getElementById("lista-ricette");
  if (!el) return;
  const f = S.cercaRicetta.toLowerCase().trim();
  const elenco = S.ricette.filter((r) => (S.filtroPasto === "tutti" || r.pasto === S.filtroPasto)
    && (!f || r.nome.toLowerCase().includes(f)
      || r.ingredienti.some((i) => S.alimentiPerId.get(i.id)?.nome.toLowerCase().includes(f))));
  el.innerHTML = `<p class="nota">${elenco.length} ricette</p>` + elenco.map((r) => `
    <button class="riga-ricetta ${entroTempi(r, imp()) ? "" : "sconsigliata"}" data-azione="vedi-ricetta" data-id="${r.id}">
      <span>${PASTO[r.pasto].ico} ${esc(r.nome)}</span>
      <small>${ICONA_PROTEINA[r.proteina] || ""} ${esc(r.proteina)} · ${r.tempoPrep}/${r.tempoTotale} min · ${r.stagioni.length === 4 ? "tutto l'anno" : r.stagioni.join(", ")}</small>
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
        <button class="btn-ico piccolo" data-azione="togli-casa" data-giorni="${g.giorni.join(",")}" aria-label="Togli">✕</button></li>`).join("")
      || "<li class='nota'>Nessun giorno inserito.</li>"}</ul>
    <details><summary>Prossime festività</summary>
      <ul class="elenco-casa">${feste.map((f) => `<li><span><strong>${formattaGiornoMese(f.data)} ${f.data.slice(0, 4)}</strong> ${esc(f.nome)}</span></li>`).join("")}</ul>
    </details>
  </section>

  <section class="pannello">
    <h2>Impostazioni</h2>
    <form class="form-imp" data-azione="salva-imp">
      <label>Porzioni pranzo feriale <input type="number" step="0.5" min="0.5" name="moltPranzoFeriale" value="${I.moltPranzoFeriale}"></label>
      <label>Porzioni famiglia (cene, weekend, feste) <input type="number" step="0.5" min="0.5" name="moltFamiglia" value="${I.moltFamiglia}"></label>
      <label>Preparazione attiva massima (min) <input type="number" min="5" name="maxPrep" value="${I.maxPrep}"></label>
      <label>Tempo totale massimo (min) <input type="number" min="5" name="maxTotale" value="${I.maxTotale}"></label>
      <label>Ripetizioni massime di una ricetta in 4 settimane <input type="number" min="1" name="maxRipetizioni" value="${I.maxRipetizioni}"></label>
      <button class="btn primario">Salva</button>
    </form>
  </section>
  <p class="nota centro">Mi-Piatti · ${S.ricette.length} ricette · ${S.alimenti.length} alimenti</p>`;
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

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("sw.js").catch((e) => console.warn("Service worker non registrato", e));
}

// per i test
window.__mipiatti = { S, daISO };

avvia();
