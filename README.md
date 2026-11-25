# Mi-Piatti

App per il telefono (PWA) che prepara il **menù di 4 settimane** (pranzo e cena, da sabato a venerdì) e la **lista della spesa** ordinata come i reparti Esselunga. Menù e spesa sono condivisi tra due telefoni in tempo reale e funzionano anche senza rete.

## Cosa fa

- **Menù**: genera da 1 a 4 settimane rispettando stagione, deperibilità (Alta sab-lun, Media mar-mer, Bassa gio-ven), massimo 2 ripetizioni per ricetta, proteine diverse tra pranzo e cena e le regole settimanali (pesce e legumi almeno 2 volte, carne rossa al massimo 2). Ogni pasto si può cambiare, scegliere dall'elenco o scambiare con un altro giorno. Tenendo premuto il simbolo ☰ a sinistra di un pasto lo si sblocca e lo si trascina su un altro pasto (pranzo su pranzo, cena su cena) con lo stesso livello di deperibilità; gli altri pasti restano attenuati e non accettano lo spostamento. Toccando il moltiplicatore (×1 / ×2,5) a destra di un pasto si cambiano le porzioni solo di quel pasto, e la spesa si aggiorna.
- **Porzioni**: pranzo feriale ×1 (solo la compagna), cene, weekend, festività nazionali, ferie e mensa chiusa ×2,5. Le festività (Pasqua compresa) sono calcolate in automatico; ferie e chiusure della mensa si inseriscono in *Altro*.
- **Spesa**: somma gli ingredienti della settimana, con quantità, confezioni e giorni in cui servono. Ordine reparti: verdure, frutta, banco frigo, pasta, conserve, salumi e formaggi, congelati, bevande, pane. Il pesce dei pasti da martedì a venerdì diventa la versione surgelata. Spunte condivise; spuntando un prodotto si può scrivere quanto lo si è pagato (facoltativo, "Salta"): accanto alla voce compaiono prezzo al kg, al litro o al pezzo, media e andamento (↑ ↓ =), e toccandoli lo storico. Si registra solo il costo, non il negozio. Finché un prodotto non ha prezzi veri si vede una **stima** (campo `stima` in `data/alimenti.json`, € al kg / al litro / al pezzo, prezzi indicativi da supermercato 2026); in alto c'è il totale previsto della lista. Il tasto **+** apre una finestra per aggiungere un prodotto: mentre si scrive suggerisce quelli già nell'app (con la loro unità); un prodotto nuovo si crea scegliendo unità e reparto. Voci aggiunte così (es. colazione e merenda), pulsante "Copia come testo" con caselle `[ ]`.
- **Ricette**: 150 ricette (73 pranzi, 77 cene), dosi per una porzione, con tempi di preparazione attiva e totale e il procedimento passo per passo. Quelle oltre 30 min attivi o 60 totali restano visibili ma non vengono proposte. Dalla scheda *Ricette* si aggiungono ricette nuove (e, se serve, alimenti nuovi), si modificano quelle esistenti o si smette di proporle; le modifiche sono condivise tra i due telefoni.

## Pubblicare l'app (GitHub Pages)

1. Su GitHub apri il repository > **Settings** > **Pages**.
2. In *Build and deployment* scegli **Deploy from a branch**, ramo **main**, cartella **/ (root)**, poi **Save**.
3. Dopo un paio di minuti l'app è su **https://banzuele.github.io/mi-piatti/**.

GitHub Pages gratuito funziona solo con repository **pubblici**. Il codice e le ricette non contengono dati personali; i dati della famiglia stanno in Firebase, protetti dalle regole.

## Collegare Firebase (per condividere tra i due telefoni)

Senza questo passaggio l'app funziona lo stesso, ma solo sul telefono dove la usi.

1. Vai su <https://console.firebase.google.com>, **Crea un progetto**, chiamalo `mi-piatti`. Google Analytics non serve: disattivalo.
2. **Accesso con Google**: menu *Build* > **Authentication** > *Inizia* > scheda *Sign-in method* > **Google** > attiva, scegli l'email di supporto, *Salva*.
   Poi scheda *Settings* > **Domini autorizzati** > *Aggiungi dominio* > `banzuele.github.io`.
3. **Database**: menu *Build* > **Firestore Database** > *Crea database* > località europea (es. `eur3` o `europe-west8` Milano) > *modalità produzione*.
   Apri la scheda **Regole**, incolla il contenuto del file [`firestore.rules`](firestore.rules) **sostituendo le due email** con i vostri account Google, poi **Pubblica**.
4. **Configurazione**: icona ingranaggio > *Impostazioni progetto* > in fondo *Le tue app* > icona **Web `</>`** > nome `Mi-Piatti` (non serve Firebase Hosting) > *Registra app*. Copia l'oggetto `firebaseConfig` che compare (le righe tra `{` e `}`).
5. Su GitHub apri [`config.js`](config.js) > icona matita > sostituisci `null` in `export const firebaseConfig = null;` con l'oggetto copiato > **Commit changes**.

Dopo un paio di minuti riapri l'app: chiederà di accedere con Google. Ognuno dei due accede con il proprio account (uno di quelli scritti nelle regole).

## Installare sul telefono

Android: apri l'indirizzo in **Chrome** > menu ⋮ > **Installa app** (o *Aggiungi a schermata Home*).
iPhone (in seguito): apri in **Safari** > Condividi > **Aggiungi alla schermata Home**.

## Ricette e alimenti

La fonte sono i file del repository: `data/ricette.json` (ricette con dosi per una porzione, tempi, stagioni, deperibilità e procedimento) e `data/alimenti.json` (alimenti con reparto, unità e confezioni). Il vecchio Excel non è più usato.

Le ricette aggiunte o modificate dall'app non cambiano questi file: sono salvate in Firebase (`ricetteUtente`, `alimentiUtente`) e si sovrappongono a quelle del repository. Per renderle definitive si possono copiare nei file JSON.

## Sviluppo

Nessuna compilazione: HTML, CSS e JavaScript puri.

```
python3 -m http.server 8080   # poi apri http://localhost:8080
node --test test/*.test.mjs   # test della logica (menù, festività, spesa, spostamenti)
```

| File | Contenuto |
|---|---|
| `js/calendario.js` | settimane sab-ven, festività, stagioni, deperibilità, porzioni |
| `js/pianificatore.js` | generazione e sostituzione dei pasti |
| `js/spesa.js` | lista della spesa e testo da copiare |
| `js/prezzi.js` | prezzi pagati: prezzo unitario, media, andamento |
| `js/archivio.js` | Firebase (Firestore + Google) oppure solo locale |
| `js/app.js` | interfaccia |
| `sw.js` | funzionamento offline |

Il service worker prende i file dalla rete quando c'è, e dalla copia salvata quando manca. Se aggiungi file all'app, inseriscili nell'elenco `FILE` di `sw.js` e aumenta `VERSIONE`.
