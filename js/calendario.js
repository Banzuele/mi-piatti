// Date, festività, stagioni, deperibilità e moltiplicatori.
// Le date sono stringhe "AAAA-MM-GG"; i calcoli usano UTC per evitare
// problemi con l'ora legale.

export const GIORNI = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];
export const GIORNI_LUNGHI = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];
export const MESI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

export function daISO(iso) {
  const [a, m, g] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, g));
}

export function aISO(d) {
  return d.toISOString().slice(0, 10);
}

export function oggiISO(adesso = new Date()) {
  return aISO(new Date(Date.UTC(adesso.getFullYear(), adesso.getMonth(), adesso.getDate())));
}

export function aggiungiGiorni(iso, n) {
  const d = daISO(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return aISO(d);
}

export function giornoSettimana(iso) {
  return daISO(iso).getUTCDay(); // 0 = domenica
}

// Giorno in cui si fa la spesa e parte il menù (0 = domenica ... 6 = sabato).
// Di solito sabato; si cambia in Altro > Impostazioni.
let giornoInizio = 6;
export function impostaGiornoInizio(g) {
  const n = Number(g);
  giornoInizio = Number.isInteger(n) && n >= 0 && n <= 6 ? n : 6;
}
export const leggiGiornoInizio = () => giornoInizio;

// Quanti giorni sono passati dal giorno della spesa (0..6)
export function giornoDellaSettimanaSpesa(iso, inizio = giornoInizio) {
  return (giornoSettimana(iso) - inizio + 7) % 7;
}

// Primo giorno (di solito sabato) della settimana di spesa che contiene la data
export function inizioSettimana(iso, inizio = giornoInizio) {
  return aggiungiGiorni(iso, -giornoDellaSettimanaSpesa(iso, inizio));
}

// Nomi brevi dei giorni a partire da un certo numero di giorni dalla spesa,
// es. con la spesa il sabato: intervalloGiorni(0, 2) = "sab-lun"
export function intervalloGiorni(da, a, inizio = giornoInizio) {
  return `${GIORNI[(inizio + da) % 7]}-${GIORNI[(inizio + a) % 7]}`;
}

// Menù e Lista mostrano sempre la settimana da lunedì a domenica,
// qualunque sia il giorno della spesa (che conta per la deperibilità).
export function lunediDi(iso) {
  return aggiungiGiorni(iso, -((giornoSettimana(iso) + 6) % 7));
}
// Lunedì da cui si vede una settimana salvata prima della v15 (che poteva
// partire dal giorno della spesa, es. sabato): il lunedì subito dopo.
export function lunediDopo(iso) {
  return aggiungiGiorni(iso, (8 - giornoSettimana(iso)) % 7);
}

export function giorniSettimana(sabato) {
  return Array.from({ length: 7 }, (_, i) => aggiungiGiorni(sabato, i));
}

export function formattaBreve(iso) {
  const d = daISO(iso);
  return `${GIORNI[d.getUTCDay()]} ${d.getUTCDate()} ${MESI[d.getUTCMonth()]}`;
}

export function formattaGiornoMese(iso) {
  const d = daISO(iso);
  return `${d.getUTCDate()} ${MESI[d.getUTCMonth()]}`;
}

export function intervalloSettimana(sabato) {
  return `${formattaGiornoMese(sabato)} – ${formattaGiornoMese(aggiungiGiorni(sabato, 6))}`;
}

// Domenica di Pasqua (algoritmo di Meeus/Jones/Butcher)
export function pasqua(anno) {
  const a = anno % 19, b = Math.floor(anno / 100), c = anno % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mese = Math.floor((h + l - 7 * m + 114) / 31);
  const giorno = ((h + l - 7 * m + 114) % 31) + 1;
  return aISO(new Date(Date.UTC(anno, mese - 1, giorno)));
}

const pad = (n) => String(n).padStart(2, "0");

// Festività nazionali italiane
export function festivita(anno) {
  const fisse = [
    ["01-01", "Capodanno"], ["01-06", "Epifania"], ["04-25", "Festa della Liberazione"],
    ["05-01", "Festa dei Lavoratori"], ["06-02", "Festa della Repubblica"],
    ["08-15", "Ferragosto"], ["11-01", "Ognissanti"], ["12-08", "Immacolata"],
    ["12-25", "Natale"], ["12-26", "Santo Stefano"],
  ];
  // San Francesco d'Assisi, di nuovo festa nazionale dal 2026
  if (anno >= 2026) fisse.push(["10-04", "San Francesco"]);
  const elenco = fisse.map(([md, nome]) => ({ data: `${anno}-${md}`, nome }));
  const p = pasqua(anno);
  elenco.push({ data: p, nome: "Pasqua" }, { data: aggiungiGiorni(p, 1), nome: "Pasquetta" });
  return elenco.sort((x, y) => x.data.localeCompare(y.data));
}

const cacheFeste = new Map();
export function nomeFestivita(iso) {
  const anno = Number(iso.slice(0, 4));
  if (!cacheFeste.has(anno)) {
    cacheFeste.set(anno, new Map(festivita(anno).map((f) => [f.data, f.nome])));
  }
  return cacheFeste.get(anno).get(iso) || null;
}

export function stagione(iso) {
  const m = Number(iso.slice(5, 7));
  if (m >= 3 && m <= 5) return "primavera";
  if (m >= 6 && m <= 8) return "estate";
  if (m >= 9 && m <= 11) return "autunno";
  return "inverno";
}

// Deperibilità ammessa nel giorno, contando dal giorno della spesa:
// Alta i primi 3 giorni, Media i 2 dopo, Bassa gli ultimi 2
// (con la spesa il sabato: Alta sab-dom-lun, Media mar-mer, Bassa gio-ven)
export function deperibilitaGiorno(iso, inizio = giornoInizio) {
  const n = giornoDellaSettimanaSpesa(iso, inizio);
  if (n <= 2) return "Alta";
  if (n <= 4) return "Media";
  return "Bassa";
}

// Il pesce fresco comprato il giorno della spesa si usa per 3 giorni; poi il surgelato
export function usaSurgelato(iso, inizio = giornoInizio) {
  return deperibilitaGiorno(iso, inizio) !== "Alta";
}

export const IMPOSTAZIONI_PREDEFINITE = {
  moltPranzoFeriale: 1.0,
  moltFamiglia: 2.5,
  maxPrep: 30,
  maxTotale: 60,
  maxRipetizioni: 2,
  giornoSpesa: 6, // sabato
};

// giorniCasa: Map/oggetto data -> {tipo, nota}
export function infoGiorno(iso, giorniCasa = {}, imp = IMPOSTAZIONI_PREDEFINITE) {
  const gs = giornoSettimana(iso);
  const festa = nomeFestivita(iso);
  const casa = giorniCasa[iso];
  const weekend = gs === 0 || gs === 6;
  const pranzoInFamiglia = weekend || !!festa || !!casa;
  let motivo = null;
  if (festa) motivo = festa;
  else if (casa) motivo = casa.tipo === "mensa" ? "Mensa chiusa" : casa.tipo === "ferie" ? "Ferie" : (casa.nota || "A casa");
  return {
    data: iso,
    festa,
    motivo,
    moltiplicatori: {
      pranzo: pranzoInFamiglia ? imp.moltFamiglia : imp.moltPranzoFeriale,
      cena: imp.moltFamiglia,
    },
    stagione: stagione(iso),
    deperibilita: deperibilitaGiorno(iso, imp.giornoSpesa ?? 6),
  };
}
