// Service worker: l'app funziona anche senza rete (es. al supermercato).
// Cambiare VERSIONE quando cambia l'elenco dei file.
const VERSIONE = "mi-piatti-v2";
const FILE = [
  "./", "index.html", "manifest.webmanifest", "config.js",
  "css/stile.css",
  "js/app.js", "js/archivio.js", "js/calendario.js", "js/pianificatore.js", "js/spesa.js",
  "data/ricette.json", "data/alimenti.json",
  "icons/icona-192.png", "icons/icona-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSIONE).then((c) => c.addAll(FILE)).then(() => self.skipWaiting()));
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

  e.respondWith(stessoSito ? primaRete(req) : primaCache(req));
});

// File dell'app: prima la rete (così gli aggiornamenti arrivano subito),
// ma se la rete non risponde entro 3 secondi si usa la copia salvata.
async function primaRete(req) {
  const cache = await caches.open(VERSIONE);
  const salvata = () => cache.match(req, { ignoreSearch: true })
    .then((r) => r || (req.mode === "navigate" ? cache.match("index.html") : undefined));
  const rete = fetch(req).then((risp) => {
    if (risp.ok) cache.put(req, risp.clone());
    return risp;
  });
  rete.catch(() => {});
  const attesa = new Promise((ok) => setTimeout(ok, 3000)).then(salvata);
  try {
    const primo = await Promise.race([rete, attesa]);
    if (primo) return primo;
    return await rete;
  } catch {
    return (await salvata()) || Response.error();
  }
}

// Librerie Firebase (versione fissa): prima la cache
async function primaCache(req) {
  const cache = await caches.open(VERSIONE);
  const salvata = await cache.match(req);
  if (salvata) return salvata;
  const risp = await fetch(req);
  if (risp.ok) cache.put(req, risp.clone());
  return risp;
}
