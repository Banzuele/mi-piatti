// Service worker: l'app funziona anche senza rete (es. al supermercato).
// Cambiare VERSIONE a ogni rilascio: i telefoni riscaricano tutti i file.
const VERSIONE = "mi-piatti-v8";
const FILE = [
  "./", "index.html", "manifest.webmanifest", "config.js",
  "css/stile.css",
  "js/intro.js", "js/app.js", "js/archivio.js", "js/calendario.js", "js/pianificatore.js", "js/spesa.js", "js/prezzi.js",
  "data/ricette.json", "data/alimenti.json",
  "icons/icona-192.png", "icons/icona-512.png", "icons/icona.svg", "icons/favicon-32.png",
];

self.addEventListener("install", (e) => {
  // cache: "reload" scavalca la cache HTTP del telefono: si salvano i file appena pubblicati
  e.waitUntil(caches.open(VERSIONE)
    .then((c) => c.addAll(FILE.map((f) => new Request(f, { cache: "reload" }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((chiavi) => Promise.all(chiavi.filter((k) => k !== VERSIONE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const stessoSito = url.origin === self.location.origin;
  const sdkFirebase = url.hostname === "www.gstatic.com" && url.pathname.startsWith("/firebasejs/");
  if (!stessoSito && !sdkFirebase) return; // Firestore e login passano direttamente

  e.respondWith(stessoSito ? primaRete(req, url) : primaCache(req));
});

// File dell'app: prima la rete, così gli aggiornamenti arrivano subito.
// - cache "no-cache": chiede sempre al server se il file è cambiato, invece di
//   riusare per 10 minuti la copia nella cache HTTP del telefono (GitHub Pages);
// - se la rete non risponde entro 4 secondi si usa la copia salvata; se poi
//   arriva un file diverso, l'app mostra "Nuova versione disponibile".
async function primaRete(req, url) {
  const cache = await caches.open(VERSIONE);
  const chiave = req.mode === "navigate"
    ? new URL("index.html", self.registration.scope).href
    : url.origin + url.pathname;

  const daRete = fetch(url.origin + url.pathname, { cache: "no-cache", credentials: "same-origin" })
    .then(async (risp) => {
      if (risp.ok) await cache.put(chiave, risp.clone());
      return { risp, fonte: "rete" };
    });
  const daCache = new Promise((ok) => setTimeout(ok, 4000))
    .then(async () => ({ risp: await cache.match(chiave), fonte: "cache" }));

  try {
    const primo = await Promise.race([daRete, daCache]);
    if (primo.fonte === "cache" && primo.risp) {
      const vecchio = primo.risp.clone();
      daRete.then(async ({ risp }) => {
        if (risp.ok && (await risp.clone().text()) !== (await vecchio.text())) avvisaApp();
      }).catch(() => {});
      return primo.risp;
    }
    return (await daRete).risp;
  } catch {
    return (await cache.match(chiave)) || Response.error();
  }
}

function avvisaApp() {
  self.clients.matchAll({ type: "window" })
    .then((cl) => cl.forEach((c) => c.postMessage({ tipo: "aggiornamento" })));
}

// Librerie Firebase (versione fissa nell'indirizzo): prima la cache
async function primaCache(req) {
  const cache = await caches.open(VERSIONE);
  const salvata = await cache.match(req);
  if (salvata) return salvata;
  const risp = await fetch(req);
  if (risp.ok) cache.put(req, risp.clone());
  return risp;
}
