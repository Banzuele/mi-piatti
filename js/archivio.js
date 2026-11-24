// Archivio dati: Firebase (Firestore + login Google) se configurato,
// altrimenti solo su questo telefono (localStorage).
//
// Collezioni: pasti, spunte, extra, giorniCasa, impostazioni.
// In Firestore stanno sotto famiglie/{famiglia}/...

const SDK = "https://www.gstatic.com/firebasejs/10.12.2";

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
    const app = initializeApp(this.config);
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
  async accedi() {
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
}

export function creaArchivio(firebaseConfig, famiglia) {
  const valido = firebaseConfig && firebaseConfig.apiKey && !String(firebaseConfig.apiKey).includes("INCOLLA");
  return valido ? new ArchivioFirebase(firebaseConfig, famiglia || "famiglia") : new ArchivioLocale();
}
