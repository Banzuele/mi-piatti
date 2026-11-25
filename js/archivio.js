// Archivio dati: Firebase (Firestore + login Google) se configurato,
// altrimenti solo su questo telefono (localStorage).
//
// Collezioni: pasti, spunte, extra, giorniCasa, impostazioni.
// In Firestore stanno sotto famiglie/{famiglia}/...

const SDK = "https://www.gstatic.com/firebasejs/10.12.2";

// iPhone e iPad (anche iPad che si presenta come Mac)
export const suIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
// App aperta dall'icona sulla schermata Home (non da una scheda del browser)
export const installata = () => navigator.standalone === true
  || matchMedia("(display-mode: standalone)").matches;

// Accesso Google su iPhone.
// Il popup e il redirect di Firebase passano da mi-piatti.firebaseapp.com: Safari
// separa i dati di quel sito da quelli dell'app (e nell'app installata il popup
// spesso resta bianco), quindi l'accesso non torna indietro. Su iOS l'app va
// direttamente da Google e Google rimanda il "biglietto" (id_token) a questa
// stessa pagina; poi Firebase lo verifica con signInWithCredential.
const CHIAVE_ACCESSO = "mipiatti:accesso-google";
const PAGINA_APP = () => new URL("./", location.href).href.split("#")[0].split("?")[0];

function casuale() {
  const b = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}
async function sha256hex(testo) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(testo));
  return Array.from(new Uint8Array(h), (x) => x.toString(16).padStart(2, "0")).join("");
}

class ArchivioLocale {
  constructor() {
    this.modalita = "locale";
    this.ascoltatori = new Map();
  }
  async avvia(onUtente) { onUtente({ nome: "Questo telefono", locale: true }); }
  leggiTutto(coll) {
    try { return JSON.parse(localStorage.getItem(`mipiatti:${coll}`) || "{}"); } catch { return {}; }
  }
  salvaTutto(coll, dati) {
    try { localStorage.setItem(`mipiatti:${coll}`, JSON.stringify(dati)); } catch { /* spazio pieno */ }
    for (const cb of this.ascoltatori.get(coll) || []) cb(dati, { inAttesa: false });
  }
  ascolta(coll, cb) {
    if (!this.ascoltatori.has(coll)) this.ascoltatori.set(coll, new Set());
    this.ascoltatori.get(coll).add(cb);
    cb(this.leggiTutto(coll), { inAttesa: false });
    return () => this.ascoltatori.get(coll).delete(cb);
  }
  async scriviMolti(ops) {
    const perColl = new Map();
    for (const op of ops) {
      if (!perColl.has(op.coll)) perColl.set(op.coll, this.leggiTutto(op.coll));
      const dati = perColl.get(op.coll);
      if (op.dati === null) delete dati[op.id];
      else dati[op.id] = { ...(dati[op.id] || {}), ...op.dati };
    }
    for (const [coll, dati] of perColl) this.salvaTutto(coll, dati);
  }
  scrivi(coll, id, dati) { return this.scriviMolti([{ coll, id, dati }]); }
  elimina(coll, id) { return this.scriviMolti([{ coll, id, dati: null }]); }
  async accedi() {}
  async esci() {}
}

class ArchivioFirebase {
  constructor(config, famiglia) {
    this.modalita = "cloud";
    this.config = config;
    this.famiglia = famiglia;
  }
  async avvia(onUtente, onErrore) {
    const [{ initializeApp }, fs, au] = await Promise.all([
      import(`${SDK}/firebase-app.js`),
      import(`${SDK}/firebase-firestore.js`),
      import(`${SDK}/firebase-auth.js`),
    ]);
    this.fs = fs;
    this.au = au;
    const { googleClientId, ...opzioni } = this.config;
    const app = initializeApp(opzioni);
    this.db = fs.initializeFirestore(app, {
      localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }),
    });
    this.auth = au.getAuth(app);
    this.auth.languageCode = "it";
    this.onErrore = onErrore;
    au.getRedirectResult(this.auth).catch((e) => onErrore?.(e));
    au.onAuthStateChanged(this.auth, (u) => {
      onUtente(u ? { nome: u.displayName || u.email, email: u.email, foto: u.photoURL } : null);
    });
    // dopo il primo stato dell'utente, così un eventuale errore resta visibile
    (this.auth.authStateReady?.() ?? Promise.resolve()).then(() => this.completaAccessoIOS()).catch((e) => onErrore?.(e));
  }
  rif(coll) { return this.fs.collection(this.db, "famiglie", this.famiglia, coll); }
  ascolta(coll, cb) {
    return this.fs.onSnapshot(this.rif(coll), { includeMetadataChanges: true }, (snap) => {
      const dati = {};
      snap.forEach((d) => { dati[d.id] = d.data(); });
      cb(dati, { inAttesa: snap.metadata.hasPendingWrites, daCache: snap.metadata.fromCache });
    }, (e) => this.onErrore?.(e));
  }
  async scriviMolti(ops) {
    const { writeBatch, doc } = this.fs;
    // Firestore accetta al massimo 500 operazioni per batch
    for (let i = 0; i < ops.length; i += 450) {
      const b = writeBatch(this.db);
      for (const op of ops.slice(i, i + 450)) {
        const r = doc(this.rif(op.coll), op.id);
        if (op.dati === null) b.delete(r); else b.set(r, op.dati, { merge: true });
      }
      // Offline il commit resta in coda: non aspettiamo la conferma del server
      b.commit().catch((e) => this.onErrore?.(e));
    }
  }
  scrivi(coll, id, dati) { return this.scriviMolti([{ coll, id, dati }]); }
  elimina(coll, id) { return this.scriviMolti([{ coll, id, dati: null }]); }
  // classico = true: popup di Firebase anche su iPhone (piano B)
  async accedi({ classico = false } = {}) {
    if (suIOS() && this.config.googleClientId && !classico) return this.accediIOS();
    const provider = new this.au.GoogleAuthProvider();
    try {
      await this.au.signInWithPopup(this.auth, provider);
    } catch (e) {
      if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment") {
        await this.au.signInWithRedirect(this.auth, provider);
      } else if (e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") {
        throw e;
      }
    }
  }
  async esci() { await this.au.signOut(this.auth); }

  async accediIOS() {
    const stato = casuale();
    const nonce = casuale();
    // localStorage (non sessionStorage): nell'app installata la pagina di Google
    // si apre sopra l'app e al ritorno la pagina viene ricaricata
    localStorage.setItem(CHIAVE_ACCESSO, JSON.stringify({ stato, nonce, quando: Date.now() }));
    const q = new URLSearchParams({
      client_id: this.config.googleClientId,
      redirect_uri: PAGINA_APP(),
      response_type: "id_token",
      scope: "openid email profile",
      nonce: await sha256hex(nonce), // come fa Firebase: nel token va l'impronta del nonce
      state: stato,
      prompt: "select_account",
    });
    location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${q}`);
  }

  // Al ritorno da Google l'indirizzo è .../mi-piatti/#id_token=...&state=...
  async completaAccessoIOS() {
    if (!location.hash.includes("id_token=") && !location.hash.includes("error=")) return;
    const r = new URLSearchParams(location.hash.slice(1));
    history.replaceState(null, "", location.pathname + location.search); // il token non resta nell'indirizzo
    let attesa = null;
    try { attesa = JSON.parse(localStorage.getItem(CHIAVE_ACCESSO) || "null"); } catch { /* niente */ }
    localStorage.removeItem(CHIAVE_ACCESSO);
    if (r.get("error")) {
      if (r.get("error") === "access_denied") return; // annullato dall'utente
      throw new Error(`Google ha risposto: ${r.get("error")}`);
    }
    if (!attesa || attesa.stato !== r.get("state") || Date.now() - attesa.quando > 15 * 60 * 1000) {
      throw new Error("Accesso scaduto o non valido: riprova");
    }
    const idToken = r.get("id_token");
    const conNonce = new this.au.OAuthProvider("google.com").credential({ idToken, rawNonce: attesa.nonce });
    try {
      await this.au.signInWithCredential(this.auth, conNonce);
    } catch (e) {
      if (!/nonce/i.test(e.code || "")) throw e;
      await this.au.signInWithCredential(this.auth, this.au.GoogleAuthProvider.credential(idToken));
    }
  }
}

export function creaArchivio(firebaseConfig, famiglia) {
  const valido = firebaseConfig && firebaseConfig.apiKey && !String(firebaseConfig.apiKey).includes("INCOLLA");
  return valido ? new ArchivioFirebase(firebaseConfig, famiglia || "famiglia") : new ArchivioLocale();
}
