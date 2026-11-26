import { firebaseConfig, famiglia } from "../config.js";
import { creaArchivio, suIOS, installata } from "./archivio.js";
import {
  oggiISO, aggiungiGiorni, giorniSettimana, giornoSettimana,
  GIORNI_LUNGHI, formattaGiornoMese, intervalloSettimana, infoGiorno, festivita,
  usaSurgelato, IMPOSTAZIONI_PREDEFINITE, daISO, formattaBreve,
  impostaGiornoInizio, intervalloGiorni, lunediDi, lunediDopo, stagione as stagioneDi,
} from "./calendario.js";
import {
  PASTI, chiavePasto, generaPiano, scegliRicetta, entroTempi, surgelabile,
  deperibilitaCompatibile, motivoNoSpostamento as motivoNoSpost,
  TIPI_PIATTO, regoleSettimana, contaTipiSettimana, costoPorzione, costoSettimana,
} from "./pianificatore.js";
import { ico, ICONA_PROTEINA_NOME } from "./icone.js";
import { promemoriaDomani, TIPI_PROMEMORIA } from "./promemoria.js";
import { creaBackup, leggiBackup, nomeFileBackup } from "./backup.js";
import { REPARTI, calcolaSpesa, spesaComeTesto, formattaQuantita, spuntatiInFondo } from "./spesa.js";
import {
  chiaveProdotto, leggiNumero, prezzoUnitario, pulisciPrezzo, storico, statistiche, formattaEuro, formattaUnitario,
  costoVoce, UNITA_PREZZO, spesaReale,
} from "./prezzi.js";

// ---------------------------------------------------------------- stato
const S = {
  ricette: [], alimenti: [], ricettePerId: new Map(), alimentiPerId: new Map(),
  ricetteBase: [], alimentiBase: [], tutteRicette: [], ricetteUtente: {}, alimentiUtente: {},
  bozza: null, trascina: null, daRidisegnare: false,
  pasti: {}, spunte: {}, extra: {}, giorniCasa: {}, impostazioni: {}, prezzi: {}, prezzoAperto: null,
  utente: null, pronto: false, inAttesa: false, errore: null,
  scheda: "menu", settimana: lunediDi(oggiISO()), oggiMostrato: false, scambio: null,
  mostraDispensa: true, cercaRicetta: "", filtroPasto: "tutti", filtroStagione: "tutte", aggiornando: false,
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
// Menù salvato: { "AAAA-MM-GG_pasto": id ricetta }. Un pranzo "avanzi" usa la
// ricetta della cena del giorno prima (e la segue se la cena cambia).
const cenaDiIeri = (k) => chiavePasto(aggiungiGiorni(k.split("_")[0], -1), "cena");
function piano() {
  const P = {};
  for (const [k, v] of Object.entries(S.pasti)) {
    if (v.avanzi) {
      const c = S.pasti[cenaDiIeri(k)];
      if (c?.ricetta && !c.avanzi) P[k] = c.ricetta;
    } else if (v.ricetta) P[k] = v.ricetta;
  }
  return P;
}
const chiaviAvanzi = () => new Set(Object.entries(S.pasti).filter(([, v]) => v.avanzi).map(([k]) => k));
// Pranzo del giorno dopo fatto con gli avanzi di questa cena?
const cenaConAvanzi = (k) => !!S.pasti[chiavePasto(aggiungiGiorni(k.split("_")[0], 1), "pranzo")]?.avanzi;

// Prezzo di un alimento (€ al kg / l / pz): l'ultimo prezzo vero, altrimenti la stima
function prezzoAlimento(a) {
  const st = statistiche(storico(S.prezzi, chiaveProdotto({ alimento: a.id })));
  if (st && st.ultimo.unita === (UNITA_PREZZO[a.unita] || "pz")) return st.ultimo.valore;
  return Number(a.stima) > 0 ? Number(a.stima) : null;
}
// Costo a porzione di ogni ricetta, per il budget del menù
function costiRicette() {
  const cache = new Map();
  const prezzo = (a) => { if (!cache.has(a.id)) cache.set(a.id, prezzoAlimento(a)); return cache.get(a.id); };
  return new Map(S.tutteRicette.map((r) => [r.id, costoPorzione(r, S.alimentiPerId, prezzo)]));
}
const idCasuale = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

const ICONA_PROTEINA = Object.fromEntries(Object.entries(ICONA_PROTEINA_NOME).map(([p, n]) => [p, ico(n)]));
const PASTO = { pranzo: { nome: "Pranzo", ico: ico("pranzo") }, cena: { nome: "Cena", ico: ico("cena") } };

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

// Giorno della spesa (Altro > Impostazioni): conta per la deperibilità e il
// surgelato. Menù e Lista restano comunque da lunedì a domenica.
function applicaGiornoSpesa() {
  impostaGiornoInizio(imp().giornoSpesa);
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
      for (const coll of ["pasti", "spunte", "extra", "giorniCasa", "impostazioni", "ricetteUtente", "alimentiUtente", "prezzi"]) {
        stacca.push(archivio.ascolta(coll, (dati, meta) => {
          S[coll] = coll === "prezzi" ? pulisciTuttiPrezzi(dati) : dati;
          if (coll === "impostazioni") applicaGiornoSpesa();
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

// ---------------------------------------------------------------- tema
// Automatico (come il telefono), chiaro o scuro. Salvato solo su questo
// telefono; index.html lo applica già prima di disegnare la pagina.
const CHIAVE_TEMA = "mipiatti:tema";
function leggiTema() {
  try { const t = localStorage.getItem(CHIAVE_TEMA); return t === "chiaro" || t === "scuro" ? t : "auto"; } catch { return "auto"; }
}
function impostaTema(t) {
  const tema = t === "chiaro" || t === "scuro" ? t : "auto";
  try { if (tema === "auto") localStorage.removeItem(CHIAVE_TEMA); else localStorage.setItem(CHIAVE_TEMA, tema); } catch { /* niente */ }
  if (tema === "auto") delete document.documentElement.dataset.tema;
  else document.documentElement.dataset.tema = tema;
  // colore della barra di stato del telefono
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    m.content = tema === "scuro" ? "#2b5a44" : tema === "chiaro" ? "#2f6b4f" : (m.dataset.scuro || m.dataset.chiaro);
  });
}

// ---------------------------------------------------------------- disegno
// Stato della sincronizzazione: piccola etichetta in cima a ogni pagina
// (sotto le date della settimana nel Menù e nella Spesa).
function testoStato() {
  if (S.aggiornando) return ["", "Aggiorno…"];
  if (archivio.modalita === "locale") return ["telefono", "Solo su questo telefono"];
  if (!S.utente) return ["", ""];
  if (!navigator.onLine) return ["offline", "Offline: salvo e sincronizzo dopo"];
  return S.inAttesa ? ["clessidra", "Sincronizzo…"] : ["nuvola", "Sincronizzato"];
}
const htmlStato = () => { const [i, t] = testoStato(); return t ? `${ico(i)} <span class="testo-stato${i === "nuvola" ? " solo-icona" : ""}">${esc(t)}</span>` : ""; };
function disegnaStato() {
  const t = htmlStato();
  document.querySelectorAll(".stato-sync").forEach((el) => {
    el.innerHTML = t;
    el.classList.toggle("carica", S.aggiornando);
  });
}
// durante l'aggiornamento (trascinando giù la pagina) al posto della nuvola c'è una rotellina
const statoSync = () => `<span class="stato-sync${S.aggiornando ? " carica" : ""}">${htmlStato()}</span>`;

const ORDINE_SCHEDE = ["menu", "spesa", "ricette", "altro"];
function disegna() {
  if (S.trascina) { S.daRidisegnare = true; return; }
  document.querySelectorAll("#schede button").forEach((b) =>
    b.classList.toggle("attiva", b.dataset.scheda === S.scheda));
  document.getElementById("schede").style.setProperty("--attiva", String(Math.max(0, ORDINE_SCHEDE.indexOf(S.scheda))));
  document.body.dataset.scheda = S.scheda;
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
  disegnaStato();
  if (!S.oggiMostrato && S.scheda === "menu") mostraOggi(true);
}

// All'apertura il Menù scorre al giorno di oggi e lo porta in cima allo schermo
// (sabato e domenica, in fondo alla pagina, arrivano solo fin dove si può).
function mostraOggi(avvio = false) {
  const el = S.scheda === "menu" && document.querySelector(".giorno.oggi");
  if (!el) return;
  S.oggiMostrato = true;
  if (avvio && window.scrollY > 0) return; // l'utente ha già scorso da solo
  // sotto la barra fissa in alto (che copre anche il notch)
  requestAnimationFrame(() => {
    const barra = document.querySelector(".barra-fissa")?.offsetHeight || 0;
    window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - barra - 10);
  });
}
// L'app installata spesso non si riavvia ma torna dallo sfondo (soprattutto su
// iPhone): se è rimasta chiusa a lungo si riapre come nuova, sulla settimana e
// sul giorno di oggi.
let nascostaDa = 0;
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") { nascostaDa = Date.now(); return; }
  if (!nascostaDa || Date.now() - nascostaDa < 30 * 60 * 1000 || S.scheda !== "menu" || S.trascina || !$modale.hidden) return;
  nascostaDa = 0;
  S.settimana = lunediDi(oggiISO());
  S.oggiMostrato = false;
  window.scrollTo(0, 0);
  disegna();
});

function vistaAccesso() {
  if (archivio.modalita !== "cloud") return "";
  return `<div class="accesso">
    <div class="logo">${ico("piatto")}</div>
    <h2>Benvenuti in Mi-Piatti</h2>
    <p>Accedete con il vostro account Google per condividere menù e spesa.</p>
    <button class="btn primario" data-azione="accedi">Accedi con Google</button>
    ${suIOS() ? `<p class="nota">Problemi ad accedere? <button class="link" data-azione="accedi-classico">Prova l'altro metodo</button></p>` : ""}
    ${installata() ? "" : `<p class="nota">Consiglio: prima installa l'app sul telefono, poi accedi dall'icona.
      <button class="link" data-azione="installa">Come si installa</button></p>`}
  </div>`;
}

// ---------------------------------------------------------------- installazione
// Android: Chrome offre "Installa app" (e l'evento beforeinstallprompt per un pulsante).
// iPhone: solo a mano da Safari, Condividi > Aggiungi alla schermata Home.
let richiestaInstalla = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  richiestaInstalla = e;
  disegna();
});
window.addEventListener("appinstalled", () => { richiestaInstalla = null; disegna(); });

const NASCONDI_INSTALLA = "mipiatti:nascondi-installa";
function invitoInstalla() {
  if (installata()) return "";
  try { if (localStorage.getItem(NASCONDI_INSTALLA)) return ""; } catch { /* niente */ }
  return `<div class="banner invito-installa">
    <span>${ico("installa")} Installa Mi-Piatti sul telefono: si apre come un'app e funziona anche senza rete.</span>
    <span class="azioni-invito">
      <button class="btn piccolo primario" data-azione="installa">${richiestaInstalla ? "Installa" : "Come"}</button>
      <button class="btn-ico piccolo" data-azione="nascondi-installa" aria-label="Non mostrare più">${ico("chiudi")}</button>
    </span>
  </div>`;
}

function istruzioniIOS() {
  return `<ol class="passi">
    <li>Apri <strong>banzuele.github.io/mi-piatti</strong> con <strong>Safari</strong>.</li>
    <li>Tocca <strong>Condividi</strong> <span class="simbolo" aria-hidden="true">${ico("condividi")}</span>
      (il quadrato con la freccia; su iOS 26 è nel menu <strong>⋯</strong> in basso).</li>
    <li>Scorri e scegli <strong>Aggiungi alla schermata Home</strong>. Se compare, lascia attivo <strong>Apri come app web</strong>.</li>
    <li>Tocca <strong>Aggiungi</strong>, poi apri Mi-Piatti dall'icona con i tre piatti.</li>
    <li>Accedi con Google <strong>dentro l'app</strong>: l'app installata non condivide l'accesso con Safari.</li>
  </ol>`;
}
function istruzioniAndroid() {
  return `<ol class="passi">
    <li>Apri <strong>banzuele.github.io/mi-piatti</strong> con <strong>Chrome</strong>.</li>
    <li>Tocca il menu <strong>⋮</strong> in alto a destra.</li>
    <li>Scegli <strong>Installa app</strong> (o <strong>Aggiungi a schermata Home</strong>), poi <strong>Installa</strong>.</li>
  </ol>`;
}
function vistaInstalla(pannello) {
  if (installata()) return pannello ? `<p>${ico("ok")} Stai usando l'app installata.</p>` : "";
  const ios = suIOS();
  return `${!pannello ? "<h2>Installa sul telefono</h2>" : ""}
    ${richiestaInstalla ? `<button class="btn primario largo" data-azione="installa-ora">Installa Mi-Piatti</button>` : ""}
    <h3>${ios ? "iPhone e iPad" : "Android"}</h3>
    ${ios ? istruzioniIOS() : istruzioniAndroid()}
    <details><summary>${ios ? "Android" : "iPhone e iPad"}</summary>${ios ? istruzioniAndroid() : istruzioniIOS()}</details>`;
}

function navSettimana(fissa = false, sotto = "") {
  const corrente = lunediDi(oggiISO());
  const quale = S.settimana === corrente ? "Questa settimana"
    : S.settimana === aggiungiGiorni(corrente, 7) ? "Prossima settimana"
    : S.settimana === aggiungiGiorni(corrente, -7) ? "Settimana scorsa" : "Settimana";
  // barra sottile: frecce piccole ai lati, settimana e stato su due righe
  return `${fissa ? `<div class="barra-fissa">` : ""}<div class="nav-sett">
    <button class="freccia-sett" data-azione="sett" data-delta="-7" aria-label="Settimana precedente">‹</button>
    <div class="titolo-sett">
      <span class="riga-quale"><small>${quale}</small>${S.settimana === corrente ? statoSync() : ""}</span>
      <strong>${intervalloSettimana(S.settimana)}</strong>
      ${S.settimana !== corrente ? `<button class="torna-oggi" data-azione="sett-oggi">↩ Torna a questa settimana</button>` : ""}
    </div>
    <button class="freccia-sett" data-azione="sett" data-delta="7" aria-label="Settimana successiva">›</button>
  </div>${sotto}${fissa ? "</div>" : ""}`;
}

// ---------------------------------------------------------------- menù
// Riepilogo della settimana, in alto nel Menù: piatti per tipo (rosso se fuori
// dai limiti scelti in Altro) e costo previsto della lista rispetto al budget.
function riepilogoSettimana(giorni) {
  const I = imp();
  const regole = regoleSettimana(I);
  const c = contaTipiSettimana(piano(), S.ricettePerId, giorni[0], chiaviAvanzi());
  const chip = TIPI_PIATTO.filter((t) => c[t.proteina] > 0 || regole[t.proteina].min > 0).map((t) => {
    const { min, max } = regole[t.proteina];
    const n = c[t.proteina];
    const ko = n < min || n > max;
    const titolo = `${t.proteina}: ${n} (${min ? `minimo ${min}` : ""}${min && max < 14 ? ", " : ""}${max < 14 ? `massimo ${max}` : ""})`;
    return `<span class="chip ${ko ? "ko" : ""}" title="${esc(titolo)}">${ICONA_PROTEINA[t.proteina]} ${n}${ko ? (n < min ? ` <small>min ${min}</small>` : ` <small>max ${max}</small>`) : ""}</span>`;
  });
  // costo dei piatti (dosi usate), lo stesso che il menù confronta con il budget
  const tot = costoSettimana(piano(), giorni[0], {
    costi: costiRicette(), giorniCasa: S.giorniCasa, imp: I, porzioni: porzioniForzate(),
  });
  const budget = Number(I.budget) > 0 ? Number(I.budget) : 0;
  if (tot) {
    chip.push(`<span class="chip ${budget && tot > budget ? "ko" : ""}" title="Costo dei piatti della settimana (dosi usate)">${ico("euro")} ≈ ${Math.round(tot)} €${budget ? ` / ${budget} €` : ""}</span>`);
  }
  return `<div class="chip-riga scorre riepilogo" aria-label="Riepilogo della settimana">${chip.join("")}</div>`;
}

// Promemoria per domani, in cima al giorno di oggi. Si spengono in Altro
// (tutti o uno per uno); la scelta vale solo su questo telefono, come il tema.
const CHIAVE_PROMEMORIA = "mipiatti:promemoria";
function leggiPromemoria() {
  try {
    const v = JSON.parse(localStorage.getItem(CHIAVE_PROMEMORIA) || "null");
    return { attivi: v?.attivi !== false, spenti: Array.isArray(v?.spenti) ? v.spenti : [] };
  } catch { return { attivi: true, spenti: [] }; }
}
function salvaPromemoria(v) {
  try { localStorage.setItem(CHIAVE_PROMEMORIA, JSON.stringify(v)); } catch { /* niente */ }
}
function vistaPromemoria() {
  const scelta = leggiPromemoria();
  if (!scelta.attivi) return "";
  const lista = promemoriaDomani({
    oggi: oggiISO(), pasti: S.pasti, piano: piano(), ricettePerId: S.ricettePerId,
    alimentiPerId: S.alimentiPerId, giorniCasa: S.giorniCasa, imp: imp(), molt: (k) => moltPasto(k).valore,
  }).filter((x) => !scelta.spenti.includes(x.tipo));
  if (!lista.length) return "";
  return `<div class="promemoria" role="note" aria-label="Promemoria per domani">
    <strong>${ico("campanella")} Per domani</strong>
    <ul>${lista.map((x) => `<li>${ico(x.ico)}<span>${esc(x.testo)}</span></li>`).join("")}</ul>
  </div>`;
}

function vistaMenu() {
  const giorni = giorniSettimana(S.settimana);
  const P = piano();
  const oggi = oggiISO();
  const haPasti = giorni.some((d) => PASTI.some((p) => P[chiavePasto(d, p)] || S.pasti[chiavePasto(d, p)]?.avanzi));
  let h = navSettimana(true, haPasti ? riepilogoSettimana(giorni) : "") + invitoInstalla();
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
      </header>${d === oggi ? vistaPromemoria() : ""}`;
    for (const p of PASTI) {
      const k = chiavePasto(d, p);
      const r = S.ricettePerId.get(P[k]);
      const avanzi = !!S.pasti[k]?.avanzi;
      const sel = S.scambio === k ? "selezionato" : "";
      const m = moltPasto(k);
      const info2 = avanzi ? (r ? `${ico("avanzi")} Avanzi della cena di ieri` : "")
        : r ? `${ICONA_PROTEINA[r.proteina] || ""} ${esc(r.proteina)} · ${r.tempoTotale} min${p === "cena" && cenaConAvanzi(k) ? ` · ${ico("avanzi")} anche per il pranzo di domani` : ""}` : "";
      h += `<div class="pasto-riga ${sel} ${avanzi ? "avanzi" : ""}" data-chiave="${k}">
      ${r && !avanzi ? `<span class="maniglia" data-chiave="${k}" role="button" aria-label="Tieni premuto per spostare" title="Tieni premuto per spostare">${ico("maniglia")}</span>` : `<span class="maniglia vuota"></span>`}
      <button class="pasto" data-azione="pasto" data-chiave="${k}">
        <span class="pasto-ico">${avanzi ? ico("avanzi") : PASTO[p].ico}</span>
        <span class="pasto-testo">
          <span class="pasto-nome">${r ? esc(r.nome) : avanzi ? "<em>Avanzi: manca la cena di ieri</em>" : "<em>— da scegliere —</em>"}</span>
          ${info2 ? `<span class="pasto-info">${info2}</span>` : ""}
        </span>
      </button>
      <button class="molt ${m.forzato ? "forzato" : ""}" data-azione="molt" data-chiave="${k}"
        aria-label="Porzioni: ${num(m.valore)}. Tocca per cambiare" title="${m.forzato ? `Modificato (di solito ×${num(m.base)})` : "Tocca per cambiare le porzioni"}">×${num(m.valore)}</button>
      </div>`;
    }
    h += `</section>`;
  }
  h += `<button class="btn secondario largo" data-azione="apri-genera">Rigenera menù…</button>`;
  return h;
}

function apriGenera() {
  const corrente = lunediDi(oggiISO());
  const opzioni = [0, 7, 14, 21].map((n) => aggiungiGiorni(corrente, n));
  const scelta = opzioni.includes(S.settimana) ? S.settimana : opzioni[S.settimana < corrente ? 0 : 1];
  apriModale(`<h2>Genera il menù</h2>
    <label>Da lunedì
      <select id="gen-inizio">${opzioni.map((d) =>
        `<option value="${d}" ${d === scelta ? "selected" : ""}>${intervalloSettimana(d)}</option>`).join("")}</select>
    </label>
    <label>Per
      <select id="gen-sett">${[1, 2, 3, 4].map((n) =>
        `<option value="${n}" ${n === 4 ? "selected" : ""}>${n} ${n === 1 ? "settimana" : "settimane"}</option>`).join("")}</select>
    </label>
    <p class="nota">I pasti già presenti in queste settimane verranno sostituiti. Le spunte della spesa restano.</p>
    ${Number(imp().cenaDoppia) === 1 ? `<p class="nota">${ico("avanzi")} Cena doppia attiva: nei giorni feriali il pranzo è fatto con gli avanzi della cena prima (si cambia in Altro).</p>` : ""}
    <div class="azioni-modale">
      <button class="btn" data-azione="chiudi">Annulla</button>
      <button class="btn primario" data-azione="genera">Genera</button>
    </div>`);
}

async function genera() {
  const inizio = document.getElementById("gen-inizio").value;
  const settimane = Number(document.getElementById("gen-sett").value);
  const ris = generaPiano({
    ricette: S.ricette, alimenti: S.alimenti, inizio, settimane, imp: imp(),
    giorniCasa: S.giorniCasa, costi: costiRicette(), pianoEsistente: piano(),
  });
  const avanzi = new Set(ris.avanzi);
  const ops = [];
  for (let g = 0; g < settimane * 7; g++) {
    const d = aggiungiGiorni(inizio, g);
    for (const p of PASTI) {
      const k = chiavePasto(d, p);
      const dati = avanzi.has(k) ? { avanzi: true, ricetta: null }
        : ris.piano[k] ? { ricetta: ris.piano[k], avanzi: false } : null;
      ops.push({ coll: "pasti", id: k, dati });
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
  const avanzi = !!S.pasti[k]?.avanzi;
  const r = S.ricettePerId.get(piano()[k]);
  // avanzi della cena di ieri: possibili per un pranzo se ieri sera c'è una ricetta
  const cenaIeri = S.pasti[cenaDiIeri(k)];
  const puoAvanzi = p === "pranzo" && !avanzi && cenaIeri?.ricetta && !cenaIeri.avanzi;
  apriModale(`<h2>${avanzi ? ico("avanzi") : PASTO[p].ico} ${PASTO[p].nome} · ${GIORNI_LUNGHI[giornoSettimana(d)]} ${formattaGiornoMese(d)}</h2>
    ${r ? `<p class="sottotitolo">${avanzi ? "Avanzi della cena di ieri: " : ""}${esc(r.nome)}</p>` : ""}
    <div class="lista-azioni">
      ${r ? `<button class="btn largo" data-azione="vedi-ricetta" data-id="${esc(r.id)}" data-chiave="${avanzi ? cenaDiIeri(k) : k}">${ico("libro")} Vedi ricetta e dosi</button>` : ""}
      ${puoAvanzi ? `<button class="btn largo" data-azione="usa-avanzi" data-chiave="${k}">${ico("avanzi")} Usa gli avanzi della cena di ieri</button>` : ""}
      <button class="btn largo" data-azione="cambia" data-chiave="${k}">${ico("dado")} ${avanzi ? "Cucina un piatto (proposta automatica)" : "Cambia (proposta automatica)"}</button>
      <button class="btn largo" data-azione="scegli" data-chiave="${k}">${ico("elenco")} Scegli dall'elenco</button>
      ${r && !avanzi ? `<button class="btn largo" data-azione="scambia" data-chiave="${k}">${ico("scambia")} Scambia con un altro giorno</button>` : ""}
      ${r || avanzi ? `<button class="btn largo pericolo" data-azione="svuota" data-chiave="${k}">${ico("cestino")} Togli questo pasto</button>` : ""}
    </div>
    <div class="azioni-modale"><button class="btn" data-azione="chiudi">Chiudi</button></div>`);
}

// ---------------------------------------------------------------- spostamento pasti
// Si possono scambiare solo due pasti dello stesso tipo (pranzo/cena) le cui
// ricette hanno la stessa deperibilità.
function motivoNoSpostamento(a, b) {
  if (S.pasti[a]?.avanzi || S.pasti[b]?.avanzi) return "Gli avanzi seguono la cena del giorno prima: non si spostano";
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
    if (!annulla) avviso("Tieni premute le tre righe a sinistra per spostare il pasto");
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
      <label>Deperibilità <select name="deperibilita">${opz([["Alta", `Alta (${intervalloGiorni(0, 2)})`], ["Media", `Media (${intervalloGiorni(3, 4)})`], ["Bassa", `Bassa (${intervalloGiorni(5, 6)})`]], b.deperibilita)}</select></label>
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
        <button type="button" class="btn-ico piccolo" data-azione="ed-togli-ingr" data-i="${n}" aria-label="Togli">${ico("chiudi")}</button>
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
      ? `<button class="btn largo" data-azione="ed-mostra" data-id="${esc(orig.id)}">${ico("occhio")} Torna a proporla nel menù</button>`
      : `<button class="btn largo" data-azione="ed-nascondi" data-id="${esc(orig.id)}">${ico("nascondi")} Non proporla più nel menù</button>`}
    ${orig.modificata ? `<button class="btn largo" data-azione="ed-ripristina" data-id="${esc(orig.id)}">${ico("ripristina")} Torna alla versione originale</button>` : ""}
    ${orig.mia ? `<button class="btn largo pericolo" data-azione="ed-elimina" data-id="${esc(orig.id)}">${ico("cestino")} Elimina la ricetta</button>` : ""}
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
  const avanzi = chiaviAvanzi();
  avanzi.delete(k);
  const { ricetta } = scegliRicetta({
    data, pasto, piano: P, ricette: S.ricette, ricettePerId: S.ricettePerId,
    alimentiPerId: S.alimentiPerId, imp: imp(), escludi: P[k] ? [P[k]] : [],
    avanzi, giorniCasa: S.giorniCasa, costi: costiRicette(),
  });
  if (!ricetta) { avviso("Nessuna alternativa disponibile"); return; }
  archivio.scrivi("pasti", k, { ricetta: ricetta.id, avanzi: false });
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
      <button class="riga-ricetta ${esc(r.pasto)} ${adatta ? "" : "sconsigliata"}" data-azione="scelto" data-chiave="${k}" data-id="${esc(r.id)}">
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
  let molt = 1, data = null, perAvanzi = 0;
  if (k) {
    const [d] = k.split("_");
    data = d;
    molt = moltPasto(k).valore;
    // cena doppia: si cucina anche la porzione del pranzo di domani
    if (cenaConAvanzi(k)) {
      perAvanzi = moltPasto(chiavePasto(aggiungiGiorni(d, 1), "pranzo")).valore;
      molt += perAvanzi;
    }
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
      <span class="chip">${ico("orologio")} ${r.tempoPrep} min attivi · ${r.tempoTotale} min totali</span>
      <span class="chip">Deperibilità ${esc(r.deperibilita)}</span>
      <span class="chip">${r.stagioni.length === 4 ? "Tutto l'anno" : esc(r.stagioni.join(", "))}</span>
    </div>
    ${fuori ? `<p class="nota avvertenza">Supera i limiti di tempo (${imp().maxPrep} min attivi, ${imp().maxTotale} totali): non viene proposta nel menù.</p>` : ""}
    <h3>Ingredienti ${molt === 1 ? "(1 porzione)" : `(×${num(molt)} porzioni)`}</h3>
    ${perAvanzi ? `<p class="nota">${ico("avanzi")} Comprende ×${num(perAvanzi)} per il pranzo di domani: mettilo da parte prima di servire.</p>` : ""}
    <ul class="ingredienti">${righe}</ul>
    ${r.contorno ? `<p class="nota">Contorno e frutta: ${esc(r.contorno)}</p>` : ""}
    ${r.procedimento?.length ? `<h3>Procedimento</h3>
    <ol class="procedimento">${r.procedimento.map((p) => `<li>${esc(p)}</li>`).join("")}</ol>` : ""}
    ${r.link ? `<p><a href="${esc(linkSicuro(r.link))}" target="_blank" rel="noopener noreferrer">Apri la ricetta online ↗</a></p>` : ""}
    <div class="azioni-modale">
      <button class="btn" data-azione="modifica-ricetta" data-id="${esc(r.id)}">${ico("matita")} Modifica</button>
      <button class="btn" data-azione="chiudi">Chiudi</button>
    </div>`);
}

// ---------------------------------------------------------------- spesa
// La Lista va da lunedì a domenica, ma la spesa si fa (di solito) il sabato:
// i freschi dei giorni dal giorno della spesa in poi (sabato e domenica) si
// comprano quel giorno, non 7-8 giorni prima. Con la spesa il lunedì niente gruppo.
function giornoCompraDopo() {
  const g = imp().giornoSpesa ?? 6;
  const scarto = (g + 6) % 7; // lunedì = 0 ... domenica = 6
  return scarto ? aggiungiGiorni(S.settimana, scarto) : null;
}
const titoloCompraDopo = (d) => `Da comprare ${GIORNI_LUNGHI[giornoSettimana(d)].toLowerCase()} ${formattaGiornoMese(d)}`;

function vociSpesa() {
  const voci = calcolaSpesa({
    piano: piano(), sabato: S.settimana, ricettePerId: S.ricettePerId,
    alimentiPerId: S.alimentiPerId, giorniCasa: S.giorniCasa, imp: imp(), porzioni: porzioniForzate(),
    avanzi: chiaviAvanzi(), compraDopo: giornoCompraDopo(),
  }).map((v) => {
    const chiave = `${S.settimana}_${v.id}${v.dopo ? "_dopo" : ""}`;
    return { ...v, chiave, prodotto: chiaveProdotto({ alimento: v.id }), fatto: !!S.spunte[chiave]?.fatto };
  });
  const extra = Object.entries(S.extra)
    .filter(([, e]) => typeof e.settimana === "string" && lunediDopo(e.settimana) === S.settimana)
    .map(([id, e]) => {
      const a = typeof e.alimento === "string" ? S.alimentiPerId.get(e.alimento) : null;
      const unita = a?.unita || (["g", "ml", "pz"].includes(e.unita) ? e.unita : "pz");
      const q = Number(e.quantita) > 0 && Number(e.quantita) < 1e6 ? Number(e.quantita) : 0;
      return {
        id, chiave: id, extra: true, alimento: a?.id || null,
        nome: a?.nome || String(e.testo || "").slice(0, LIMITI.nome),
        reparto: a?.reparto || e.reparto || "altro", tipo: "fresco",
        prodotto: chiaveProdotto({ alimento: a?.id, nome: e.testo }), unita, quantita: q || (unita === "pz" ? 1 : 0),
        testoQuantita: q ? formattaQuantita(q, unita) : "", testoConfezioni: "", testoGiorni: "", fatto: !!e.fatto,
      };
    });
  const pos = new Map(REPARTI.map((r, i) => [r.id, i]));
  return [...voci, ...extra].sort((a, b) => (a.dopo ? 1 : 0) - (b.dopo ? 1 : 0)
    || (pos.get(a.reparto) ?? 99) - (pos.get(b.reparto) ?? 99) || a.nome.localeCompare(b.nome, "it"));
}

// ---------------------------------------------------------------- prezzi
function pulisciTuttiPrezzi(dati) {
  const out = {};
  for (const [id, p] of Object.entries(dati || {})) {
    const ok = pulisciPrezzo(p);
    if (ok) out[id] = ok;
  }
  return out;
}

const FRECCE = { su: ["↑", "più caro"], giu: ["↓", "più economico"], uguale: ["=", "stabile"] };

// Riga sotto la voce della spesa: prezzo pagato questa settimana, oppure ultimo
// prezzo e media; toccandola si apre il prezzo con lo storico.
// Stima iniziale dell'alimento (€ al kg / al litro / al pezzo), dai file del repository
function stimaDi(v) {
  const s = S.alimentiPerId.get(v.extra ? v.alimento : v.id)?.stima;
  return Number(s) > 0 ? Number(s) : null;
}
// Quantità che si compra davvero: le confezioni intere se note
function quantitaComprata(v) {
  const a = v.extra ? null : S.alimentiPerId.get(v.id);
  return a?.conf && v.confezioni ? v.confezioni * a.conf : v.quantita || 1;
}

// Prezzo medio dallo storico (stessa unità dell'ultimo prezzo)
const unitarioMedio = (st) => ({ valore: st.media, unita: st.ultimo.unita });
// Riquadro del prezzo medio nel pop-up del prezzo
function boxMedia(st, stima, unita) {
  if (st) return `<p class="box-media" id="box-media" data-media="${st.media}" data-unita="${esc(st.ultimo.unita)}">
    <span>Prezzo medio</span><b>${formattaUnitario(unitarioMedio(st))}</b>
    <small>${st.n === 1 ? "su 1 acquisto" : `su ${st.n} acquisti`} · ultimo ${formattaUnitario(st.ultimo)} (${esc(formattaBreve(st.data))})</small></p>`;
  return `<p class="box-media vuota"><span>Prezzo medio</span><b>—</b>
    <small>${stima ? `nessun acquisto ancora · stima ${formattaUnitario({ valore: stima, unita: UNITA_PREZZO[unita] || "pz" })} (indicativa)` : "nessun acquisto ancora: questo è il primo prezzo"}</small></p>`;
}

function rigaPrezzo(v) {
  const pagato = S.prezzi[v.chiave];
  const st = statistiche(storico(S.prezzi, v.prodotto));
  if (!pagato && !st) {
    const stima = stimaDi(v);
    if (!stima) return "";
    const c = costoVoce({ stima, quantita: quantitaComprata(v), unita: v.unita });
    return `<button type="button" class="voce-prezzo stima" data-azione="apri-prezzo" data-chiave="${esc(v.chiave)}">${ico("euro")} stima ${formattaUnitario({ valore: stima, unita: UNITA_PREZZO[v.unita] || "pz" })}${c ? ` · ~${formattaEuro(c.valore)}` : ""}</button>`;
  }
  const parti = [];
  if (pagato) parti.push(`pagato ${formattaEuro(pagato.prezzo)}`);
  if (st) {
    parti.push(`${pagato ? "" : "ultimo "}${formattaUnitario(st.ultimo)}`);
    parti.push(`media ${formattaUnitario(unitarioMedio(st))}`);
  }
  const fr = st?.tendenza ? FRECCE[st.tendenza] : null;
  return `<button type="button" class="voce-prezzo${fr ? ` tend-${st.tendenza}` : ""}" data-azione="apri-prezzo" data-chiave="${esc(v.chiave)}">${ico("euro")} ${esc(parti.join(" · "))}${fr ? ` <b title="${fr[1]}">${fr[0]}</b>` : ""}</button>`;
}

function apriPrezzo(chiave) {
  const v = vociSpesa().find((x) => x.chiave === chiave);
  if (!v) return;
  const esistente = S.prezzi[chiave];
  const unitaFissa = !v.extra;
  const unita = esistente?.unita || v.unita || "pz";
  let quantita = esistente?.quantita;
  if (!quantita) {
    quantita = quantitaComprata(v);
  }
  S.prezzoAperto = { chiave, prodotto: v.prodotto, nome: v.nome, unitaFissa, data: esistente?.data };
  const lista = storico(S.prezzi, v.prodotto);
  const st = statistiche(lista);
  // Prezzo già scritto, oppure proposto (ultimo prezzo al kg o stima × quantità):
  // se va bene basta toccare Salva, senza aprire la tastiera.
  const proposta = esistente ? null
    : costoVoce({ pagato: null, st, stima: stimaDi(v), quantita, unita });
  const numVal = esistente ? esistente.prezzo : proposta ? Math.round(proposta.valore * 100) / 100 : null;
  const valore = numVal ? numVal.toFixed(2).replace(".", ",") : "";
  apriModale(`<h2>${ico("euro")} ${esc(v.nome)}</h2>
  <form class="editor" data-azione="salva-prezzo">
    <div class="griglia-2">
      <label>Prezzo pagato (€) <input id="prezzo-valore" name="prezzo" inputmode="decimal" autocomplete="off" placeholder="es. 2,49" value="${esc(valore)}"></label>
      <label>Quantità comprata
        <span class="ingr-riga"><input id="prezzo-q" name="quantita" type="number" min="0" step="any" inputmode="decimal" value="${esc(+quantita.toFixed(3))}">
        ${unitaFissa
          ? `<span class="unita">${NOMI_UNITA[unita] || unita}</span><input type="hidden" name="unita" value="${unita}">`
          : `<select name="unita" id="prezzo-unita">${["pz", "g", "ml"].map((u) => `<option value="${u}" ${u === unita ? "selected" : ""}>${u}</option>`).join("")}</select>`}
        </span></label>
    </div>
    <p class="anteprima-prezzo" id="anteprima-prezzo"></p>
    ${boxMedia(st, stimaDi(v), unita)}
    ${proposta ? `<p class="nota proposta">Prezzo proposto ${proposta.fonte === "ultimo" ? "dall'ultimo acquisto" : "dalla stima (indicativa)"}: se è giusto tocca <b>Salva</b>, altrimenti toccalo e correggilo.</p>` : ""}
    ${lista.length ? `<details class="storico"><summary>Storico (${lista.length})</summary><table class="storico-prezzi"><tbody>${lista.slice(0, 12).map((p) => `<tr>
      <td>${esc(formattaBreve(p.data))}</td><td>${formattaEuro(p.prezzo)}</td>
      <td>${esc(formattaQuantita(p.quantita, p.unita))}</td><td><b>${formattaUnitario(p.unitario)}</b></td></tr>`).join("")}</tbody></table></details>` : ""}
    <div class="azioni-modale azioni-prezzo">
      ${esistente ? `<button type="button" class="btn pericolo" data-azione="togli-prezzo" data-chiave="${esc(chiave)}">Togli</button>` : ""}
      <button type="button" class="btn" data-azione="chiudi">${esistente ? "Chiudi" : "Salta"}</button>
      <button class="btn primario salva">Salva</button>
    </div>
  </form>`);
  aggiornaAnteprimaPrezzo();
  // niente tastiera all'apertura: si apre solo toccando il campo (che si seleziona tutto)
}

function aggiornaAnteprimaPrezzo() {
  const el = document.getElementById("anteprima-prezzo");
  if (!el) return;
  const f = el.closest("form");
  const prezzo = leggiNumero(f.prezzo.value);
  const u = prezzoUnitario(prezzo, Number(f.quantita.value), f.unita.value);
  let testo = u ? `= ${formattaUnitario(u)}` : "";
  // confronto con il prezzo medio, se la stessa unità
  const m = document.getElementById("box-media");
  const media = Number(m?.dataset.media);
  if (u && media > 0 && m.dataset.unita === u.unita) {
    const d = Math.round(((u.valore - media) / media) * 100);
    testo += d === 0 ? " · in linea con la media" : ` · ${d > 0 ? "+" : ""}${d}% ${d > 0 ? "sopra" : "sotto"} la media`;
  }
  el.textContent = testo;
}

function salvaPrezzo(dati) {
  const a = S.prezzoAperto;
  if (!a) return;
  const prezzo = leggiNumero(dati.prezzo);
  const quantita = Number(dati.quantita);
  if (!prezzo) return avviso("Scrivi il prezzo, es. 2,49 (oppure Salta)");
  if (!(quantita > 0)) return avviso("Scrivi la quantità comprata");
  const p = pulisciPrezzo({
    prodotto: a.prodotto, nome: a.nome, prezzo, quantita, unita: dati.unita,
    data: a.data || oggiISO(), quando: Date.now(),
  });
  if (!p) return avviso("Prezzo non valido");
  archivio.scrivi("prezzi", a.chiave, p);
  S.prezzoAperto = null;
  chiudiModale();
  avviso(`Salvato: ${formattaUnitario(prezzoUnitario(p.prezzo, p.quantita, p.unita))}`);
}

// Totale della lista visibile: prezzi pagati + ultimi prezzi veri + stime
function totaleSpesa(voci) {
  let tot = 0, pagato = 0, stime = 0;
  for (const v of voci) {
    const st = statistiche(storico(S.prezzi, v.prodotto));
    const c = costoVoce({ pagato: S.prezzi[v.chiave], st, stima: stimaDi(v), quantita: quantitaComprata(v), unita: v.unita });
    if (!c) continue;
    tot += c.valore;
    if (c.fonte === "pagato") pagato += c.valore;
    if (c.fonte === "stima") stime++;
  }
  return { tot, pagato, stime };
}

// ---------------------------------------------------------------- aggiungi alla spesa
// Finestra del "+": mentre si scrive suggerisce i prodotti già presenti nell'app
// (con la loro unità); se non c'è, si crea con unità e reparto scelti.
const NOMI_UNITA_LUNGHI = { g: "grammi", ml: "millilitri", pz: "pezzi" };
function apriAggiungi() {
  S.aggiungi = { alimento: null };
  apriModale(`<h2>Aggiungi alla spesa</h2>
  <form class="editor" data-azione="aggiungi-extra" autocomplete="off">
    <label>Prodotto <input id="agg-nome" name="testo" placeholder="es. Yogurt, detersivo…" required maxlength="${LIMITI.nome}"></label>
    <ul class="suggerimenti" id="agg-sugg"></ul>
    <div class="griglia-2">
      <label>Quantità (facoltativa) <input name="quantita" type="number" min="0" step="any" inputmode="decimal" placeholder="es. 500"></label>
      <label>Unità <select name="unita" id="agg-unita">${["pz", "g", "ml"].map((u) => `<option value="${u}">${NOMI_UNITA_LUNGHI[u]}</option>`).join("")}</select></label>
    </div>
    <label id="agg-reparto-l">Reparto <select name="reparto" id="agg-reparto">${REPARTI.map((r) => `<option value="${r.id}" ${r.id === "altro" ? "selected" : ""}>${r.nome}</option>`).join("")}</select></label>
    <p class="nota" id="agg-info">Scrivi il nome: se il prodotto è già nell'app lo trovi qui sopra.</p>
    <div class="azioni-modale">
      <button type="button" class="btn" data-azione="chiudi">Annulla</button>
      <button class="btn primario">Aggiungi</button>
    </div>
  </form>`);
  setTimeout(() => document.getElementById("agg-nome")?.focus(), 50);
}

const normalizza = (t) => String(t || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

function aggiornaSuggerimenti() {
  const inp = document.getElementById("agg-nome");
  const ul = document.getElementById("agg-sugg");
  if (!inp || !ul) return;
  const q = normalizza(inp.value);
  const scelto = S.aggiungi?.alimento && S.alimentiPerId.get(S.aggiungi.alimento);
  if (scelto && normalizza(scelto.nome) !== q) scegliProdotto(null);
  if (q.length < 2 || (scelto && normalizza(scelto.nome) === q)) { ul.innerHTML = ""; return; }
  const trovati = S.alimenti
    .map((a) => ({ a, n: normalizza(a.nome) }))
    .filter(({ n }) => n.includes(q))
    .sort((x, y) => (y.n.startsWith(q) - x.n.startsWith(q)) || x.n.localeCompare(y.n))
    .slice(0, 6);
  ul.innerHTML = trovati.map(({ a }) => `<li><button type="button" data-azione="scegli-prodotto" data-id="${esc(a.id)}">
      ${esc(a.nome)} <small>${NOMI_UNITA_LUNGHI[a.unita] || a.unita} · ${esc(REPARTI.find((r) => r.id === a.reparto)?.nome || "")}</small></button></li>`).join("")
    + (trovati.some(({ n }) => n === q) ? "" : `<li class="nuovo">${ico("piu")} Nuovo prodotto "${esc(inp.value.trim())}": scegli unità e reparto qui sotto</li>`);
}

function scegliProdotto(id) {
  const a = id ? S.alimentiPerId.get(id) : null;
  S.aggiungi = { alimento: a?.id || null };
  const unita = document.getElementById("agg-unita");
  const reparto = document.getElementById("agg-reparto");
  const info = document.getElementById("agg-info");
  if (!unita) return;
  unita.disabled = !!a;
  reparto.disabled = !!a;
  if (a) {
    document.getElementById("agg-nome").value = a.nome;
    unita.value = a.unita;
    reparto.value = a.reparto || "altro";
    info.textContent = `Unità: ${NOMI_UNITA_LUNGHI[a.unita] || a.unita}${a.stima ? ` · stima ${formattaUnitario({ valore: a.stima, unita: UNITA_PREZZO[a.unita] })}` : ""}`;
    document.getElementById("agg-sugg").innerHTML = "";
  } else {
    info.textContent = "Prodotto nuovo: scegli unità e reparto.";
  }
}

function salvaAggiungi(dati) {
  const nome = String(dati.testo || "").trim().slice(0, LIMITI.nome);
  if (!nome) return avviso("Scrivi il nome del prodotto");
  let id = S.aggiungi?.alimento || null;
  if (!id) {
    // già nell'app con lo stesso nome? altrimenti lo si aggiunge agli alimenti
    const uguale = S.alimenti.find((a) => normalizza(a.nome) === normalizza(nome));
    if (uguale) id = uguale.id;
    else {
      id = nuovoIdAlimento();
      const unita = ["g", "ml", "pz"].includes(dati.unita) ? dati.unita : "pz";
      const reparto = REPARTI.some((r) => r.id === dati.reparto) ? dati.reparto : "altro";
      const a = { nome, reparto, tipo: "fresco", unita };
      archivio.scrivi("alimentiUtente", id, a);
      S.alimentiUtente = { ...S.alimentiUtente, [id]: a };
      ricalcolaDati();
    }
  }
  const a = S.alimentiPerId.get(id);
  const q = Number(dati.quantita);
  archivio.scrivi("extra", idCasuale(), {
    settimana: S.settimana, testo: a.nome, alimento: id, reparto: a.reparto || "altro", unita: a.unita,
    ...(q > 0 && q < 1e6 ? { quantita: q } : {}), fatto: false,
  });
  S.aggiungi = null;
  chiudiModale();
  avviso(`Aggiunto: ${a.nome}`);
}

// Modalità negozio (per telefono): spuntando non si apre il prezzo; i prezzi
// si confermano tutti insieme alla fine con "Conferma i prezzi".
const CHIAVE_NEGOZIO = "mipiatti:negozio";
function modalitaNegozio() {
  try { return localStorage.getItem(CHIAVE_NEGOZIO) === "1"; } catch { return false; }
}
function impostaNegozio(on) {
  try { if (on) localStorage.setItem(CHIAVE_NEGOZIO, "1"); else localStorage.removeItem(CHIAVE_NEGOZIO); } catch { /* niente */ }
}
const senzaPrezzo = (voci) => voci.filter((v) => v.fatto && !S.prezzi[v.chiave]);

function vistaSpesa() {
  const tutte = vociSpesa();
  const voci = spuntatiInFondo(tutte.filter((v) => S.mostraDispensa || v.tipo !== "dispensa" || v.extra));
  const presi = voci.filter((v) => v.fatto).length;
  const negozio = modalitaNegozio();
  const daPrezzare = senzaPrezzo(tutte).length;
  // nella barra: quanti presi, avanzamento e totale previsto
  const { tot, pagato, stime } = totaleSpesa(voci);
  const avanz = voci.length ? `<div class="avanz-spesa">
    <span>${presi}/${voci.length} presi</span>
    <span class="barra-avanz" role="progressbar" aria-valuemin="0" aria-valuemax="${voci.length}" aria-valuenow="${presi}" aria-label="Prodotti presi"><i style="width:${Math.round((presi / voci.length) * 100)}%"></i></span>
    ${tot ? `<b class="totale-spesa" title="${stime} prezzi stimati${pagato ? ` · pagati ${formattaEuro(pagato)}` : ""}">≈ ${formattaEuro(tot)}</b>` : ""}
  </div>` : "";
  let h = navSettimana(true, avanz);
  // sotto la barra: tasti uguali a icona; Dispensa e Negozio restano accesi quando attivi
  const tasti = [
    "share" in navigator && `<button class="strumento" data-azione="condividi-spesa">${ico("condividi")}<span>Condividi</span></button>`,
    `<button class="strumento" data-azione="copia-spesa">${ico("elenco")}<span>Copia</span></button>`,
    `<button class="strumento" data-azione="azzera-spunte">${ico("ripristina")}<span>Togli spunte</span></button>`,
    `<button class="strumento${S.mostraDispensa ? " acceso" : ""}" data-azione="dispensa" aria-pressed="${S.mostraDispensa}">${ico("casa")}<span>Dispensa</span></button>`,
    `<button class="strumento${negozio ? " acceso" : ""}" data-azione="negozio" aria-pressed="${negozio}">${ico("carrello")}<span>Negozio</span></button>`,
  ].filter(Boolean);
  h += `<div class="strumenti-spesa" style="--n:${tasti.length}">${tasti.join("")}</div>
  ${daPrezzare ? `<button class="btn primario largo conferma-prezzi" data-azione="conferma-prezzi">${ico("euro")} Conferma i prezzi (${daPrezzare})</button>` : ""}
  ${negozio ? `<p class="nota">Modalità negozio: spunta e vai avanti, i prezzi li confermi tutti insieme alla fine.</p>` : ""}`;
  if (!tutte.length) {
    h += `<div class="vuoto"><p>Nessun pasto in questa settimana, quindi niente da comprare.</p>
      <button class="btn" data-azione="vai-menu">Vai al menù</button></div>`;
  }
  let reparto = null, dopo = false;
  for (const v of voci) {
    if (v.dopo && !dopo) {
      if (reparto !== null) h += `</ul>`;
      dopo = true;
      reparto = null;
      h += `<h2 class="compra-dopo">${ico("calendario")} ${esc(titoloCompraDopo(giornoCompraDopo()))}</h2>
        <p class="nota">Freschi per i pasti da ${esc(GIORNI_LUNGHI[giornoSettimana(giornoCompraDopo())].toLowerCase())} a domenica: comprali il giorno della spesa, così sono freschi.</p>`;
    }
    if (v.reparto !== reparto) {
      if (reparto !== null) h += `</ul>`;
      reparto = v.reparto;
      h += `<h3 class="reparto">${esc(REPARTI.find((r) => r.id === reparto)?.nome || reparto)}</h3><ul class="spesa">`;
    }
    h += `<li class="${v.fatto ? "fatto" : ""}" data-voce="${esc(v.chiave)}">
      <label>
        <input type="checkbox" data-azione="spunta" data-chiave="${esc(v.chiave)}" ${v.extra ? 'data-extra="1"' : ""} ${v.fatto ? "checked" : ""}>
        <span class="voce">
          <span class="voce-nome">${esc(v.nome)}${v.tipo === "dispensa" && !v.extra ? ' <small class="etichetta">dispensa</small>' : ""}</span>
          <span class="voce-dett">${[v.testoQuantita, v.testoConfezioni && `${v.testoConfezioni}`, v.testoGiorni].filter(Boolean).map(esc).join(" · ")}</span>
          ${rigaPrezzo(v)}
        </span>
      </label>
      ${v.extra ? `<button class="btn-ico piccolo" data-azione="togli-extra" data-id="${esc(v.id)}" aria-label="Togli">${ico("chiudi")}</button>` : ""}
    </li>`;
  }
  if (reparto !== null) h += `</ul>`;
  h += `<button class="fab" data-azione="apri-aggiungi" aria-label="Aggiungi un prodotto alla spesa">+</button>
  <p class="nota">Il pesce dei pasti da martedì a venerdì è già nella versione surgelata.</p>`;
  return h;
}

// Fine spesa in modalità negozio: tutti i prodotti presi senza prezzo, con il
// prezzo proposto (ultimo o stima) già scritto. Campo vuoto = non registrare.
function apriConfermaPrezzi() {
  const voci = senzaPrezzo(vociSpesa());
  if (!voci.length) { avviso("Tutti i prodotti presi hanno già il prezzo"); return; }
  const righe = voci.map((v) => {
    const quantita = quantitaComprata(v);
    const st = statistiche(storico(S.prezzi, v.prodotto));
    const prop = costoVoce({ pagato: null, st, stima: stimaDi(v), quantita, unita: v.unita });
    const val = prop ? (Math.round(prop.valore * 100) / 100).toFixed(2).replace(".", ",") : "";
    return `<li><span class="voce"><span class="voce-nome">${esc(v.nome)}</span>
        <span class="voce-dett">${esc(formattaQuantita(quantita, v.unita))}${prop ? ` · ${prop.fonte === "stima" ? "stima" : "ultimo prezzo"}` : ""}${st ? ` · media ${formattaUnitario(unitarioMedio(st))}` : ""}</span></span>
      <input name="${esc(v.chiave)}" class="prezzo-riga" inputmode="decimal" autocomplete="off" placeholder="€" value="${esc(val)}" aria-label="Prezzo di ${esc(v.nome)}"></li>`;
  }).join("");
  apriModale(`<h2>${ico("euro")} Conferma i prezzi</h2>
  <form class="editor" data-azione="salva-prezzi">
    <p class="nota">Prezzi proposti dall'ultimo acquisto o dalla stima: correggi quelli diversi dallo scontrino. Lascia vuoto per non registrare un prezzo.</p>
    <ul class="conferma-prezzi">${righe}</ul>
    <div class="azioni-modale">
      <button type="button" class="btn" data-azione="chiudi">Annulla</button>
      <button class="btn primario">Salva tutti</button>
    </div>
  </form>`);
}

function salvaPrezziInBlocco(dati) {
  const voci = new Map(vociSpesa().map((v) => [v.chiave, v]));
  const ops = [];
  let saltati = 0;
  for (const [chiave, testo] of Object.entries(dati)) {
    const v = voci.get(chiave);
    if (!v || !String(testo).trim()) continue;
    const prezzo = leggiNumero(testo);
    const p = prezzo && pulisciPrezzo({
      prodotto: v.prodotto, nome: v.nome, prezzo, quantita: quantitaComprata(v), unita: v.unita,
      data: oggiISO(), quando: Date.now(),
    });
    if (p) ops.push({ coll: "prezzi", id: chiave, dati: p }); else saltati++;
  }
  if (saltati) return avviso(`Controlla ${saltati === 1 ? "un prezzo" : `${saltati} prezzi`}: scrivi per esempio 2,49`, 3500);
  archivio.scriviMolti(ops);
  chiudiModale();
  avviso(ops.length === 1 ? "Salvato 1 prezzo" : `Salvati ${ops.length} prezzi`);
}

// ---------------------------------------------------------------- ricette
const NOMI_STAGIONI = { primavera: `${ico("primavera")} Primavera`, estate: `${ico("pranzo")} Estate`, autunno: `${ico("autunno")} Autunno`, inverno: `${ico("inverno")} Inverno` };
function vistaRicette() {
  const filtri = [["tutti", "Tutte"], ["pranzo", "Pranzi"], ["cena", "Cene"]];
  return `<div class="barra-fissa">
    <div class="riga-titolo"><strong>Ricette</strong>${statoSync()}</div>
    <input type="search" id="cerca-ricette" placeholder="Cerca una ricetta o un ingrediente…" value="${esc(S.cercaRicetta)}">
    <div class="chip-riga">${filtri.map(([v, t]) =>
      `<button class="chip ${S.filtroPasto === v ? "attivo" : ""}" data-azione="filtro-pasto" data-valore="${v}">${t}</button>`).join("")}</div>
    <div class="chip-riga scorre" role="group" aria-label="Stagione">${[["tutte", "Tutte le stagioni"], ...STAGIONI.map((s) => [s, NOMI_STAGIONI[s]])].map(([v, t]) =>
      `<button class="chip ${S.filtroStagione === v ? "attivo" : ""}" data-azione="filtro-stagione" data-valore="${v}"
        ${v === stagioneDi(oggiISO()) ? 'title="Stagione attuale"' : ""}>${t}${v === stagioneDi(oggiISO()) ? ' <span class="ora">ora</span>' : ""}</button>`).join("")}</div>
    </div>
    <button class="btn primario largo centro-testo" data-azione="nuova-ricetta">+ Nuova ricetta</button>
    <div id="lista-ricette"></div>`;
}

function disegnaListaRicette() {
  const el = document.getElementById("lista-ricette");
  if (!el) return;
  const f = S.cercaRicetta.toLowerCase().trim();
  const elenco = S.tutteRicette.filter((r) => (S.filtroPasto === "tutti" || r.pasto === S.filtroPasto)
    && (S.filtroStagione === "tutte" || r.stagioni.includes(S.filtroStagione))
    && (!f || r.nome.toLowerCase().includes(f)
      || r.ingredienti.some((i) => S.alimentiPerId.get(i.id)?.nome.toLowerCase().includes(f))));
  elenco.sort((a, b) => (a.nascosta ? 1 : 0) - (b.nascosta ? 1 : 0));
  el.innerHTML = `<p class="nota">${elenco.length} ricette</p>` + elenco.map((r) => `
    <button class="riga-ricetta ${esc(r.pasto)} ${entroTempi(r, imp()) && !r.nascosta ? "" : "sconsigliata"}" data-azione="vedi-ricetta" data-id="${esc(r.id)}">
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
  const tema = leggiTema();
  return `<div class="barra-fissa"><div class="riga-titolo"><strong>Altro</strong>${statoSync()}</div></div>
  <section class="pannello">
    <h2>Tema</h2>
    <div class="scelta-tema" role="group" aria-label="Tema">${[["auto", "Automatico"], ["chiaro", `${ico("pranzo")} Chiaro`], ["scuro", `${ico("cena")} Scuro`]].map(([v, t]) =>
      `<button class="chip ${tema === v ? "attivo" : ""}" data-azione="tema" data-valore="${v}" aria-pressed="${tema === v}">${t}</button>`).join("")}</div>
    <p class="nota">Automatico segue l'impostazione del telefono. La scelta vale solo su questo telefono.</p>
  </section>
  ${vistaImpPromemoria()}
  <section class="pannello">
    <h2>Account</h2>
    ${archivio.modalita === "locale"
      ? `<p>L'app funziona solo su questo telefono. Per condividere menù e spesa bisogna collegare Firebase (istruzioni nel README del progetto).</p>`
      : `<p>Connesso come <strong>${esc(S.utente?.nome)}</strong>${S.utente?.email ? ` (${esc(S.utente.email)})` : ""}.</p>
         <button class="btn" data-azione="esci">Esci</button>`}
  </section>

  <section class="pannello">
    <h2>Installa sul telefono</h2>
    ${vistaInstalla(true)}
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
        <button class="btn-ico piccolo" data-azione="togli-casa" data-giorni="${esc(g.giorni.join(","))}" aria-label="Togli">${ico("chiudi")}</button></li>`).join("")
      || "<li class='nota'>Nessun giorno inserito.</li>"}</ul>
    <details><summary>Prossime festività</summary>
      <ul class="elenco-casa">${feste.map((f) => `<li><span><strong>${formattaGiornoMese(f.data)} ${f.data.slice(0, 4)}</strong> ${esc(f.nome)}</span></li>`).join("")}</ul>
    </details>
  </section>

  <section class="pannello">
    <h2>Menù e budget</h2>
    <form class="form-imp" data-azione="salva-imp">
      <label>Cena dei giorni feriali
        <select name="cenaDoppia">
          <option value="0" ${Number(I.cenaDoppia) === 1 ? "" : "selected"}>Normale ×${num(I.moltFamiglia)} (predefinita)</option>
          <option value="1" ${Number(I.cenaDoppia) === 1 ? "selected" : ""}>Doppia: ×${num(I.moltFamiglia)} + avanzi per il pranzo dopo (×${num(I.moltPranzoFeriale)})</option>
        </select>
      </label>
      <p class="nota">Con la cena doppia, da lunedì a venerdì (non nei festivi, ferie e mensa chiusa) il pranzo è fatto con gli avanzi della cena prima: una cottura in meno. Vale dal prossimo menù generato; ogni pranzo si può comunque cambiare dal Menù.</p>
      <label>Budget settimanale della spesa (€, 0 = nessuno)
        <input type="number" min="0" step="1" inputmode="numeric" name="budget" value="${esc(Number(I.budget) > 0 ? Number(I.budget) : 0)}"></label>
      <p class="nota">Con un budget il menù preferisce piatti più economici quando la settimana costa troppo. Conta il costo dei piatti (le dosi usate, con gli ultimi prezzi pagati o le stime), che si vede in alto nel Menù. La lista della spesa può costare di più: si comprano confezioni intere e prodotti di dispensa che durano più settimane.</p>
      <h3>Piatti per tipo in una settimana</h3>
      <p class="nota">Quante volte ogni tipo di piatto può essere proposto da lunedì a domenica (14 pasti; gli avanzi non contano).</p>
      <table class="tabella-tipi">
        <thead><tr><th></th><th>Minimo</th><th>Massimo</th></tr></thead>
        <tbody>${TIPI_PIATTO.map((t) => {
          const reg = regoleSettimana(I)[t.proteina];
          return `<tr><th scope="row">${ICONA_PROTEINA[t.proteina]} ${esc(t.proteina === "Nessuna" ? "Senza proteina" : t.proteina)}</th>
            <td><input type="number" min="0" max="14" inputmode="numeric" name="min${t.chiave}" value="${reg.min}" aria-label="${esc(t.proteina)} minimo"></td>
            <td><input type="number" min="0" max="14" inputmode="numeric" name="max${t.chiave}" value="${reg.max}" aria-label="${esc(t.proteina)} massimo"></td></tr>`;
        }).join("")}</tbody>
      </table>
      <button class="btn primario">Salva</button>
      <button type="button" class="btn" data-azione="tipi-predefiniti">Valori consigliati</button>
    </form>
  </section>

  ${vistaSpesaReale()}

  <section class="pannello">
    <h2>${ico("scarica")} Copia di sicurezza</h2>
    <p class="nota">Salva in un file menù, spesa, giorni a casa, impostazioni, ricette vostre e prezzi. Ricaricandola i dati del file si aggiungono a quelli dell'app (quelli con lo stesso giorno o nome vengono sostituiti).</p>
    <div class="azioni-backup">
      <button class="btn" data-azione="backup-scarica">${ico("scarica")} Scarica la copia</button>
      <label class="btn">${ico("carica")} Ricarica una copia…<input type="file" class="nascosto" accept=".json,application/json" data-azione="backup-file"></label>
    </div>
    ${suIOS() ? `<p class="nota">Su iPhone si apre Condividi: scegli <strong>Salva su File</strong>.</p>` : ""}
  </section>

  <section class="pannello">
    <h2>Impostazioni</h2>
    <form class="form-imp" data-azione="salva-imp">
      <label>Giorno della spesa e del nuovo menù
        <select name="giornoSpesa">${[6, 0, 1, 2, 3, 4, 5].map((g) =>
          `<option value="${g}" ${g === I.giornoSpesa ? "selected" : ""}>${GIORNI_LUNGHI[g]}</option>`).join("")}</select>
      </label>
      <p class="nota">Menù e Lista vanno sempre da lunedì a domenica; questo giorno serve per la deperibilità: Alta ${intervalloGiorni(0, 2)}, Media ${intervalloGiorni(3, 4)}, Bassa ${intervalloGiorni(5, 6)}.</p>
      <label>Porzioni pranzo feriale <input type="number" step="0.5" min="0.5" name="moltPranzoFeriale" value="${esc(I.moltPranzoFeriale)}"></label>
      <label>Porzioni famiglia (cene, weekend, feste) <input type="number" step="0.5" min="0.5" name="moltFamiglia" value="${esc(I.moltFamiglia)}"></label>
      <label>Preparazione attiva massima (min) <input type="number" min="5" name="maxPrep" value="${esc(I.maxPrep)}"></label>
      <label>Tempo totale massimo (min) <input type="number" min="5" name="maxTotale" value="${esc(I.maxTotale)}"></label>
      <label>Ripetizioni massime di una ricetta in 4 settimane <input type="number" min="1" name="maxRipetizioni" value="${esc(I.maxRipetizioni)}"></label>
      <button class="btn primario">Salva</button>
    </form>
  </section>
  <p class="nota centro">Mi-Piatti ${document.documentElement.dataset.versione || ""} · ${S.ricette.length} ricette · ${S.alimenti.length} alimenti</p>`;
}

function vistaImpPromemoria() {
  const { attivi, spenti } = leggiPromemoria();
  return `<section class="pannello">
    <h2>${ico("campanella")} Promemoria</h2>
    <label class="interruttore grande-tocco"><input type="checkbox" data-azione="promemoria-tutti" ${attivi ? "checked" : ""}> Mostra i promemoria "Per domani" nel Menù</label>
    <fieldset class="tipi-promemoria" ${attivi ? "" : "disabled"}>
      <legend class="nota">Quali mostrare:</legend>
      ${TIPI_PROMEMORIA.map((x) => `<label class="interruttore grande-tocco"><input type="checkbox" data-azione="promemoria-tipo" data-tipo="${x.id}" ${spenti.includes(x.id) ? "" : "checked"}> ${ico(x.ico)} ${esc(x.nome)}</label>`).join("")}
    </fieldset>
    <p class="nota">La scelta vale solo su questo telefono.</p>
  </section>`;
}

// Quanto si spende davvero: totale dei prezzi scritti nella Spesa, per
// settimana (ultime 8, con il budget) e per mese (ultimi 6). Niente stime.
const MESI_BREVI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
function vistaSpesaReale() {
  const { settimane, mesi } = spesaReale(S.prezzi, lunediDi);
  const titolo = `<h2>${ico("grafico")} Quanto spendete</h2>`;
  if (!settimane.size) {
    return `<section class="pannello">${titolo}
      <p class="nota">Ancora nessun prezzo. Il grafico si riempie con i prezzi che scrivete nella Spesa (le stime non contano).</p></section>`;
  }
  const budget = Number(imp().budget) > 0 ? Number(imp().budget) : 0;
  const corrente = lunediDi(oggiISO());
  const elenco = [...Array(8)].map((_, i) => aggiungiGiorni(corrente, (i - 7) * 7));
  const valori = elenco.map((d) => settimane.get(d) || 0);
  const massimo = Math.max(budget, ...valori) || 1;
  const conValore = valori.filter((v) => v > 0);
  const ultime4 = valori.slice(4).filter((v) => v > 0);
  const media = ultime4.length ? ultime4.reduce((a, b) => a + b, 0) / ultime4.length : 0;
  const iMax = valori.indexOf(Math.max(...valori));
  const barre = elenco.map((d, i) => {
    const v = valori[i];
    const oltre = budget && v > budget;
    const etichetta = `Settimana ${intervalloSettimana(d)}: ${v ? formattaEuro(v) : "nessun prezzo"}${oltre ? ", oltre il budget" : ""}`;
    return `<button type="button" class="barra-sett${oltre ? " oltre" : ""}${d === corrente ? " corrente" : ""}" data-azione="info-barra"
      data-testo="${esc(etichetta)}" aria-label="${esc(etichetta)}" title="${esc(etichetta)}">
      <span class="valore">${v && (i === iMax || d === corrente) ? Math.round(v) : ""}</span>
      <span class="pista"><span class="colonna" style="height:${Math.max(v ? 3 : 0, Math.round((v / massimo) * 100))}%"></span></span>
      <span class="giorno-barra">${Number(d.slice(8, 10))}/${Number(d.slice(5, 7))}</span>
    </button>`;
  }).join("");
  const ultimiMesi = [...mesi.keys()].sort().reverse().slice(0, 6);
  return `<section class="pannello">${titolo}
    <p class="nota">Totale dei prezzi scritti nella Spesa, per settimana del menù (tocca una barra per il dettaglio).</p>
    <div class="grafico-spesa" role="group" aria-label="Spesa delle ultime 8 settimane">
      ${budget ? `<div class="linea-budget" style="top:${16 + Math.round((1 - budget / massimo) * 120)}px"><span>budget ${budget} €</span></div>` : ""}
      ${barre}
    </div>
    <p class="riassunto-spesa">${media ? `Media ultime 4 settimane: <strong>${formattaEuro(media)}</strong>` : ""}${conValore.length && budget ? ` · ${valori.filter((v) => v > budget).length} su ${conValore.length} oltre il budget` : ""}</p>
    <table class="tabella-mesi"><caption>Per mese</caption><tbody>${ultimiMesi.map((m) => `<tr><th scope="row">${MESI_BREVI[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}</th><td>${formattaEuro(mesi.get(m))}</td></tr>`).join("")}</tbody></table>
  </section>`;
}

// ---------------------------------------------------------------- copia di sicurezza
function scaricaFile(file) {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url; a.download = file.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
// iPhone: il download dall'app installata non è affidabile, si usa Condividi
// (Salva su File). Android: download normale nella cartella Download.
async function scaricaBackup() {
  const copia = creaBackup(S, document.documentElement.dataset.versione || "");
  const file = new File([JSON.stringify(copia)], nomeFileBackup(oggiISO()), { type: "application/json" });
  if (suIOS() && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: file.name }); return; } catch (err) {
      if (err?.name === "AbortError") return;
    }
  }
  scaricaFile(file);
  avviso("Copia scaricata");
}
let backupInAttesa = null;
const NOMI_COLL = {
  pasti: "pasti del menù", spunte: "spunte", extra: "voci aggiunte", giorniCasa: "giorni a casa",
  impostazioni: "impostazioni", ricetteUtente: "ricette vostre", alimentiUtente: "prodotti vostri", prezzi: "prezzi",
};
async function apriBackup(file) {
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) return avviso("Il file è troppo grande", 3500);
  const ris = leggiBackup(await file.text());
  if (ris.errore) return avviso(ris.errore, 4000);
  backupInAttesa = ris.ops;
  apriModale(`<h2>${ico("carica")} Ricarica la copia</h2>
    ${ris.creato ? `<p class="sottotitolo">Copia del ${esc(formattaGiornoMese(ris.creato))} ${esc(ris.creato.slice(0, 4))}</p>` : ""}
    <ul class="elenco-backup">${Object.entries(ris.conteggi).filter(([, n]) => n).map(([c, n]) => `<li><span>${esc(NOMI_COLL[c] || c)}</span><strong>${n}</strong></li>`).join("")}</ul>
    <p class="nota">I dati del file si aggiungono a quelli dell'app; quelli con lo stesso giorno o nome vengono sostituiti. ${archivio.modalita === "cloud" ? "Valgono per tutti i telefoni collegati." : ""}</p>
    <div class="azioni-modale">
      <button class="btn" data-azione="chiudi">Annulla</button>
      <button class="btn primario" data-azione="backup-ricarica">Ricarica</button>
    </div>`);
}

// Testo della lista (stesso ordine della pagina) da condividere o copiare
function testoSpesa() {
  const voci = spuntatiInFondo(vociSpesa().filter((v) => S.mostraDispensa || v.tipo !== "dispensa" || v.extra));
  const dopo = giornoCompraDopo();
  return spesaComeTesto(`Spesa ${intervalloSettimana(S.settimana)}`, voci, dopo ? titoloCompraDopo(dopo) : undefined);
}
async function copiaTesto(testo) {
  try { await navigator.clipboard.writeText(testo); avviso("Lista copiata"); }
  catch {
    apriModale(`<h2>Copia la lista</h2><p class="nota">Tieni premuto sul testo e scegli Copia.</p>
      <textarea class="testo-copia" readonly>${esc(testo)}</textarea>
      <div class="azioni-modale"><button class="btn" data-azione="chiudi">Chiudi</button></div>`);
  }
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
  vaiAScheda(b.dataset.scheda);
});
// Passando da una scheda all'altra si riparte dall'alto; il Menù torna sempre
// alla settimana in corso con il giorno di oggi in cima.
function vaiAScheda(scheda) {
  S.scheda = scheda;
  S.scambio = null;
  if (scheda === "menu") S.settimana = lunediDi(oggiISO());
  disegna();
  window.scrollTo(0, 0);
  if (scheda === "menu") mostraOggi();
}

$modale.addEventListener("click", (e) => { if (e.target === $modale) chiudiModale(); });

document.addEventListener("click", async (e) => {
  const el = e.target.closest("[data-azione]");
  if (!el || el.tagName === "FORM" || el.tagName === "INPUT") return;
  const { azione, chiave, id } = el.dataset;
  switch (azione) {
    case "accedi":
    case "accedi-classico":
      try { await archivio.accedi({ classico: azione === "accedi-classico" }); } catch (err) { avviso(`Accesso non riuscito: ${err.message}`, 5000); }
      break;
    case "installa":
      if (richiestaInstalla) { richiestaInstalla.prompt(); richiestaInstalla = null; break; }
      apriModale(`${vistaInstalla(false)}<div class="azioni-modale"><button class="btn" data-azione="chiudi">Chiudi</button></div>`);
      break;
    case "installa-ora":
      if (richiestaInstalla) { richiestaInstalla.prompt(); richiestaInstalla = null; }
      break;
    case "nascondi-installa":
      try { localStorage.setItem(NASCONDI_INSTALLA, "1"); } catch { /* niente */ }
      disegna();
      break;
    case "esci": await archivio.esci(); break;
    case "sett": S.settimana = aggiungiGiorni(S.settimana, Number(el.dataset.delta)); disegna(); break;
    case "sett-oggi": S.settimana = lunediDi(oggiISO()); disegna(); mostraOggi(); break;
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
      archivio.scrivi("pasti", chiave, { ricetta: id, avanzi: false });
      chiudiModale();
      break;
    case "usa-avanzi":
      archivio.scrivi("pasti", chiave, { avanzi: true, ricetta: null });
      chiudiModale();
      avviso("Pranzo con gli avanzi: la cena di ieri si cucina anche per questo pranzo");
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
    case "vai-menu": vaiAScheda("menu"); break;
    case "tipi-predefiniti": {
      const f = el.closest("form");
      for (const t of TIPI_PIATTO) {
        f.elements[`min${t.chiave}`].value = t.min;
        f.elements[`max${t.chiave}`].value = t.max;
      }
      avviso("Valori consigliati: tocca Salva per usarli");
      break;
    }
    case "tema": impostaTema(el.dataset.valore); disegna(); break;
    case "info-barra": avviso(el.dataset.testo, 3500); break;
    case "backup-scarica": await scaricaBackup(); break;
    case "backup-ricarica":
      if (backupInAttesa) archivio.scriviMolti(backupInAttesa);
      avviso(`Copia ricaricata (${backupInAttesa?.length || 0} dati)`, 3500);
      backupInAttesa = null;
      chiudiModale();
      break;
    case "filtro-pasto": S.filtroPasto = el.dataset.valore; disegna(); break;
    case "filtro-stagione": S.filtroStagione = el.dataset.valore; disegna(); break;
    case "togli-extra": archivio.elimina("extra", id); break;
    case "togli-casa":
      archivio.scriviMolti(el.dataset.giorni.split(",").map((d) => ({ coll: "giorniCasa", id: d, dati: null })));
      break;
    case "apri-prezzo": e.preventDefault(); apriPrezzo(chiave); break;
    case "apri-aggiungi": apriAggiungi(); break;
    case "conferma-prezzi": apriConfermaPrezzi(); break;
    case "scegli-prodotto": scegliProdotto(id); break;
    case "togli-prezzo": archivio.elimina("prezzi", chiave); S.prezzoAperto = null; chiudiModale(); avviso("Prezzo tolto"); break;
    case "condividi-spesa": {
      // Web Share: Android e iPhone aprono il loro menu (WhatsApp, Keep, Note…).
      // Va chiamata subito nel tocco, senza attese prima (Safari lo richiede).
      const testo = testoSpesa();
      try {
        await navigator.share({ title: `Spesa ${intervalloSettimana(S.settimana)}`, text: testo });
      } catch (err) {
        if (err?.name !== "AbortError") await copiaTesto(testo); // annullato dall'utente: niente
      }
      break;
    }
    case "copia-spesa": await copiaTesto(testoSpesa()); break;
    case "dispensa": S.mostraDispensa = !S.mostraDispensa; disegna(); break;
    case "negozio": {
      const on = !modalitaNegozio();
      impostaNegozio(on);
      disegna();
      avviso(on ? "Modalità negozio attiva" : "Modalità negozio spenta");
      if (!on && senzaPrezzo(vociSpesa()).length) apriConfermaPrezzi();
      break;
    }
    case "azzera-spunte": {
      const ops = [];
      for (const k of Object.keys(S.spunte)) if (k.startsWith(`${S.settimana}_`)) ops.push({ coll: "spunte", id: k, dati: null });
      for (const [k, v] of Object.entries(S.extra)) if (typeof v.settimana === "string" && lunediDopo(v.settimana) === S.settimana && v.fatto) ops.push({ coll: "extra", id: k, dati: { fatto: false } });
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
    // spuntando si può scrivere subito il prezzo (facoltativo: "Salta")
    // (in modalità negozio no: i prezzi si confermano alla fine)
    if (el.checked && !S.prezzi[el.dataset.chiave] && !modalitaNegozio()) apriPrezzo(el.dataset.chiave);
  } else if (el.name === "ingr-id") {
    const a = S.alimentiPerId.get(el.value);
    const u = el.parentElement.querySelector(".unita");
    if (u) u.textContent = a ? NOMI_UNITA[a.unita] || a.unita : "";
  } else if (el.id === "prezzo-unita") {
    aggiornaAnteprimaPrezzo();
  } else if (el.dataset.azione === "promemoria-tutti") {
    salvaPromemoria({ ...leggiPromemoria(), attivi: el.checked });
    disegna();
    avviso(el.checked ? "Promemoria attivi" : "Promemoria spenti");
  } else if (el.dataset.azione === "promemoria-tipo") {
    const v = leggiPromemoria();
    const spenti = new Set(v.spenti);
    if (el.checked) spenti.delete(el.dataset.tipo); else spenti.add(el.dataset.tipo);
    salvaPromemoria({ ...v, spenti: [...spenti] });
  } else if (el.dataset.azione === "backup-file") {
    apriBackup(el.files?.[0]);
    el.value = "";
  }
});

// toccando il prezzo si seleziona tutto, così si riscrive subito (Android e iPhone)
document.addEventListener("focusin", (e) => {
  if (e.target.id === "prezzo-valore" || e.target.id === "prezzo-q" || e.target.classList?.contains("prezzo-riga")) {
    const el = e.target;
    setTimeout(() => { try { el.select(); } catch { /* campi number su alcuni browser */ } }, 0);
  }
});

document.addEventListener("input", (e) => {
  if (e.target.id === "prezzo-valore" || e.target.id === "prezzo-q") aggiornaAnteprimaPrezzo();
  if (e.target.id === "agg-nome") aggiornaSuggerimenti();
  if (e.target.id === "cerca-ricette") {
    S.cercaRicetta = e.target.value;
    disegnaListaRicette();
  }
});

document.addEventListener("submit", (e) => {
  const f = e.target;
  e.preventDefault();
  const dati = Object.fromEntries(new FormData(f));
  if (f.dataset.azione === "salva-prezzo") {
    salvaPrezzo(dati);
  } else if (f.dataset.azione === "salva-prezzi") {
    salvaPrezziInBlocco(dati);
  } else if (f.dataset.azione === "aggiungi-extra") {
    // i campi disattivati (unità e reparto di un prodotto già noto) non sono in FormData
    salvaAggiungi(dati);
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
    for (const t of TIPI_PIATTO) {
      if (nuovi[`min${t.chiave}`] > nuovi[`max${t.chiave}`]) {
        return avviso(`${t.proteina}: il minimo non può superare il massimo`, 3500);
      }
    }
    if (TIPI_PIATTO.every((t) => `min${t.chiave}` in nuovi)) {
      const sommaMin = TIPI_PIATTO.reduce((x, t) => x + nuovi[`min${t.chiave}`], 0);
      const sommaMax = TIPI_PIATTO.reduce((x, t) => x + nuovi[`max${t.chiave}`], 0);
      if (sommaMin > 14) return avviso("I minimi insieme superano i 14 pasti della settimana", 3500);
      if (sommaMax < 14) return avviso("I massimi insieme non arrivano ai 14 pasti della settimana", 3500);
    }
    archivio.scrivi("impostazioni", "generali", nuovi);
    avviso("Impostazioni salvate");
  }
});

window.addEventListener("online", disegnaStato);
window.addEventListener("offline", disegnaStato);
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$modale.hidden) chiudiModale(); });

// Aggiornamenti: il telefono controlla se c'è una nuova versione a ogni apertura
// e quando l'app torna in primo piano; se c'è, si aggiorna da sola: compare
// l'intro con "Aggiorno…" e la pagina si ricarica. Se si sta scrivendo (pop-up
// aperto, campo attivo, trascinamento) si aspetta che si abbia finito.
// Se dopo un aggiornamento automatico ne arriva subito un altro (meno di 30 s),
// per non ricaricare all'infinito si mostra il vecchio avviso con "Aggiorna".
const CHIAVE_AGG = "mipiatti:aggiornata";
const CHIAVE_ULTIMO_AGG = "mipiatti:ultimo-aggiornamento";
let attesaAggiornamento = null;
function occupato() {
  const a = document.activeElement;
  return !$modale.hidden || !!S.trascina || !!tira
    || (a && ["INPUT", "TEXTAREA", "SELECT"].includes(a.tagName));
}
function applicaAggiornamento() {
  clearTimeout(attesaAggiornamento);
  if (occupato()) { attesaAggiornamento = setTimeout(applicaAggiornamento, 1500); return; }
  let ultimo = 0;
  try { ultimo = Number(sessionStorage.getItem(CHIAVE_ULTIMO_AGG)) || 0; } catch { /* niente */ }
  if (Date.now() - ultimo < 30000) { avvisoAggiornamento(); return; }
  try {
    sessionStorage.setItem(CHIAVE_AGG, "1");
    sessionStorage.setItem(CHIAVE_ULTIMO_AGG, String(Date.now()));
  } catch { /* senza sessionStorage si ricarica comunque */ }
  window.mostraIntroAggiornamento?.("Nuova versione: aggiorno…");
  setTimeout(() => location.reload(), 900);
}
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
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (giaControllata) applicaAggiornamento(); });
  // il service worker ha servito una copia vecchia e poi ha scaricato quella nuova
  navigator.serviceWorker.addEventListener("message", (e) => {
    if (e.data?.tipo === "aggiornamento") applicaAggiornamento();
  });
}

// ---------------------------------------------------------------- trascina giù per aggiornare
// Al posto della ricarica del browser (che rifarebbe l'intro): si trascina giù
// la pagina quando è già in cima, compare una freccia che gira e, lasciando,
// l'app cerca una nuova versione e rilegge ricette e alimenti. Menù e spesa
// arrivano già da soli da Firestore. Durante l'attesa, in alto al posto della
// nuvola c'è una rotellina. Touch events: funzionano uguali su Android e iPhone.
const $tira = document.getElementById("tira");
const SOGLIA_TIRA = 64;
let tira = null;
const attendi = (ms) => new Promise((ok) => setTimeout(ok, ms));

function mostraTira(d, gira = false) {
  $tira.classList.toggle("gira", gira);
  $tira.classList.toggle("pronta", d >= SOGLIA_TIRA);
  $tira.style.setProperty("--d", `${d}px`);
  $tira.style.setProperty("--r", `${d * 4}deg`);
  $tira.style.setProperty("--o", String(Math.min(1, d / 40)));
}

async function aggiornaApp() {
  if (S.aggiornando) return;
  S.aggiornando = true;
  disegnaStato();
  // se in pagina non c'è lo stato (es. un'altra settimana) gira la freccia in alto
  const conStato = [...document.querySelectorAll(".stato-sync")].some((el) => el.offsetParent);
  mostraTira(conStato ? 0 : SOGLIA_TIRA, !conStato);
  const t0 = Date.now();
  try {
    const reg = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : null;
    const [ricette, alimenti] = await Promise.all([
      fetch("data/ricette.json", { cache: "no-cache" }).then((r) => r.json()),
      fetch("data/alimenti.json", { cache: "no-cache" }).then((r) => r.json()),
      reg ? Promise.race([reg.update().catch(() => {}), attendi(4000)]) : null,
    ]);
    S.ricetteBase = ricette;
    S.alimentiBase = alimenti;
    ricalcolaDati();
  } catch (e) {
    console.warn("Aggiornamento non riuscito", e);
  }
  await attendi(Math.max(0, 900 - (Date.now() - t0)));
  S.aggiornando = false;
  mostraTira(0);
  disegna();
}

window.addEventListener("touchstart", (e) => {
  if (e.touches.length !== 1 || window.scrollY > 0 || !$modale.hidden || S.trascina || S.aggiornando) return;
  if (e.target.closest(".maniglia, input, textarea, select")) return;
  tira = { x0: e.touches[0].clientX, y0: e.touches[0].clientY, d: 0, deciso: false };
}, { passive: true });

window.addEventListener("touchmove", (e) => {
  if (!tira) return;
  const dx = e.touches[0].clientX - tira.x0, dy = e.touches[0].clientY - tira.y0;
  if (!tira.deciso) {
    if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
    // solo un trascinamento verso il basso, con la pagina in cima
    if (dy <= 0 || Math.abs(dx) > Math.abs(dy) || window.scrollY > 0) { tira = null; return; }
    tira.deciso = true;
  }
  if (e.cancelable) e.preventDefault(); // niente ricarica né rimbalzo del browser
  tira.d = Math.min(110, Math.max(0, dy) * 0.5);
  mostraTira(tira.d);
}, { passive: false });

function fineTira() {
  if (!tira) return;
  const ok = tira.deciso && tira.d >= SOGLIA_TIRA;
  tira = null;
  if (ok) aggiornaApp(); else mostraTira(0);
}
window.addEventListener("touchend", fineTira);
window.addEventListener("touchcancel", fineTira);

// Pagina ricaricata dal browser: la rotellina resta finché i dati non sono pronti
if (document.documentElement.classList.contains("ricaricata")) {
  S.aggiornando = true;
  const t0 = Date.now();
  const controlla = () => {
    if ((S.pronto && Date.now() - t0 > 700) || Date.now() - t0 > 8000) { S.aggiornando = false; disegnaStato(); }
    else setTimeout(controlla, 150);
  };
  controlla();
}

// per i test
window.__mipiatti = { S, daISO, aggiornaApp };

avvia();
