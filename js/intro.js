// Intro all'apertura: icona con i piatti che girano mentre si cercano aggiornamenti.
// Script classico (non modulo): parte subito, prima che l'app sia caricata.
// Si rivede anche quando si torna all'app dopo che è rimasta in secondo piano.
(function () {
  var intro = document.getElementById("intro");
  if (!intro) return;
  var stato = document.getElementById("intro-stato");
  var versione = document.documentElement.dataset.versione || "";
  document.getElementById("intro-versione").textContent = "Mi-Piatti " + versione;

  var DURATA_MINIMA = 1400; // almeno un giro completo dei piatti
  var ATTESA_MASSIMA = 4000; // con rete lenta non si aspetta oltre
  var RIAPERTURA_DOPO = 30000; // in secondo piano da almeno 30 s = app "riaperta"

  // appena ricaricata dopo un aggiornamento automatico: lo si dice nell'intro
  var aggiornata = false;
  try {
    aggiornata = !!sessionStorage.getItem("mipiatti:aggiornata");
    sessionStorage.removeItem("mipiatti:aggiornata");
  } catch (e) { /* niente */ }
  var FINE = aggiornata ? "Aggiornata a " + versione : "";

  function attendi(ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); }

  function cercaAggiornamenti() {
    if (!("serviceWorker" in navigator) || location.protocol === "file:") return Promise.resolve();
    if (!navigator.onLine) {
      stato.textContent = "Senza rete: uso la copia salvata";
      return Promise.resolve();
    }
    return navigator.serviceWorker.getRegistration()
      .then(function (reg) {
        if (!reg) return;
        return reg.update().then(function () {
          stato.textContent = reg.installing || reg.waiting ? "Nuova versione trovata" : FINE;
        });
      })
      .catch(function () { stato.textContent = "Uso la copia salvata"; });
  }

  var inCorso = false;
  var bloccata = false; // aggiornamento in corso: l'intro resta fino alla ricarica

  // Chiamata dall'app quando trova una nuova versione: intro fissa, poi la pagina si ricarica
  window.mostraIntroAggiornamento = function (testo) {
    bloccata = true;
    stato.textContent = testo;
    intro.classList.remove("chiusa");
  };

  function mostra() {
    if (inCorso) return;
    inCorso = true;
    stato.textContent = FINE || "Cerco aggiornamenti…";
    intro.classList.remove("chiusa");
    Promise.all([
      Promise.race([cercaAggiornamenti(), attendi(ATTESA_MASSIMA)]),
      attendi(DURATA_MINIMA),
    ]).then(function () { return attendi(250); })
      .then(function () {
        if (!bloccata) intro.classList.add("chiusa");
        inCorso = false;
      });
  }

  var nascostaDa = 0;
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") nascostaDa = Date.now();
    else if (nascostaDa && Date.now() - nascostaDa >= RIAPERTURA_DOPO) mostra();
  });

  // Pagina ricaricata (trascinando giù o con "Aggiorna"): niente intro,
  // l'app mostra il caricamento al posto della nuvola in alto.
  if (document.documentElement.classList.contains("ricaricata")) intro.classList.add("chiusa");
  else mostra();

})();
