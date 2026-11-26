# Mi-Piatti

> **Regola del progetto: ogni modifica deve funzionare sia su Android (Chrome) sia su iPhone/iPad (Safari, app installata dalla schermata Home).** Vedi [`CLAUDE.md`](CLAUDE.md) per la lista dei controlli.

App per il telefono (PWA) che prepara il **menù di 4 settimane** (pranzo e cena; Menù e Lista mostrano sempre la settimana da lunedì a domenica e all'apertura, o tornando al Menù da un'altra scheda, il Menù scorre al giorno di oggi; in Menù, Spesa e Ricette la barra in alto resta fissa; tema automatico, chiaro o scuro in Altro) e la **lista della spesa** ordinata come i reparti Esselunga. Menù e spesa sono condivisi tra due telefoni in tempo reale e funzionano anche senza rete.

## Cosa fa

- **Menù**: genera da 1 a 4 settimane rispettando stagione, deperibilità (con la spesa il sabato: Alta sab-lun, Media mar-mer, Bassa gio-ven; il giorno della spesa si sceglie in Altro > Impostazioni), massimo 2 ripetizioni per ricetta, proteine diverse tra pranzo e cena, niente stesso carboidrato (es. pasta) a pranzo e a cena, e le regole settimanali da lunedì a domenica: quante volte ogni tipo di piatto (pesce, legumi, carne bianca, carne rossa, uova, formaggi, senza proteina) può essere proposto, con minimo e massimo che si scelgono in *Altro > Menù e budget* (consigliati: pesce e legumi almeno 2, carne rossa al massimo 2, uova al massimo 2, formaggi e carne bianca al massimo 3). In cima al Menù, sotto la barra, una scheda **Riepilogo della settimana** mostra quanti piatti per tipo (in rosso se fuori dai limiti) e il costo previsto dei piatti; toccando il titolo si chiude (resta solo il costo) o si riapre, e la scelta vale per quel telefono. **Budget** settimanale (in Altro, 0 = nessuno): il menù preferisce piatti più economici quando la settimana costerebbe di più; il costo usa le dosi dei piatti con gli ultimi prezzi pagati o le stime. **Cena doppia** (in Altro, predefinita: no, cena ×2,5): da lunedì a venerdì, tranne festivi, ferie e mensa chiusa, il pranzo è fatto con gli avanzi della cena prima (🍱): la cena si cucina anche per quel pranzo e la spesa lo comprende; ogni pranzo si può cambiare o rimettere agli avanzi dal Menù. Ogni pasto si può cambiare, scegliere dall'elenco o scambiare con un altro giorno. Tenendo premuto il simbolo ☰ a sinistra di un pasto lo si sblocca e lo si trascina su un altro pasto (pranzo su pranzo, cena su cena) con lo stesso livello di deperibilità; gli altri pasti restano attenuati e non accettano lo spostamento. Toccando il moltiplicatore (×1 / ×2,5) a destra di un pasto si cambiano le porzioni solo di quel pasto, e la spesa si aggiorna.
- **Porzioni**: pranzo feriale ×1 (solo la compagna), cene, weekend, festività nazionali, ferie e mensa chiusa ×2,5. Le festività (Pasqua compresa) sono calcolate in automatico; ferie e chiusure della mensa si inseriscono in *Altro*.
- **Spesa**: somma gli ingredienti della settimana, con quantità, confezioni e giorni in cui servono. Ordine reparti: verdure, frutta, banco frigo, pasta, conserve, salumi e formaggi, congelati, bevande, pane. Il pesce dei pasti da martedì a venerdì diventa la versione surgelata. I freschi dei pasti dal giorno della spesa a domenica (con la spesa il sabato: sabato e domenica) sono in fondo, nel gruppo **Da comprare sabato …**, da prendere quel giorno e non 7-8 giorni prima. **Modalità negozio** (per telefono): spuntando non si apre il prezzo; alla fine **Conferma i prezzi** apre tutti i prodotti presi con il prezzo proposto, da correggere e salvare insieme. Spunte condivise; spuntando un prodotto si apre il prezzo, già proposto (ultimo prezzo o stima) e senza tastiera: Salva per confermare, oppure lo si tocca per correggerlo ("Salta" per non scriverlo): accanto alla voce compaiono prezzo al kg, al litro o al pezzo, media e andamento (↑ ↓ =), e toccandoli lo storico. Si registra solo il costo, non il negozio. Finché un prodotto non ha prezzi veri si vede una **stima** (campo `stima` in `data/alimenti.json`, € al kg / al litro / al pezzo, prezzi indicativi da supermercato 2026); nella barra in alto ci sono i prodotti presi, una barra di avanzamento e il totale previsto della lista; sotto, tasti uguali a icona: Condividi, Copia, Togli spunte, **Dispensa** (mostra o nasconde i prodotti di dispensa) e **Negozio**, che restano evidenziati quando sono attivi. Il tasto **+** apre una finestra per aggiungere un prodotto: mentre si scrive suggerisce quelli già nell'app (con la loro unità); un prodotto nuovo si crea scegliendo unità e reparto. Voci aggiunte così (es. colazione e merenda). I prodotti spuntati scendono in fondo al loro reparto. Il pulsante **Condividi** apre il menu del telefono (WhatsApp, Keep, Note…) con la lista in testo con caselle `[ ]`; **Copia** la copia negli appunti.
- **Aggiornamenti automatici**: quando l'app trova una nuova versione compare l'intro con "Nuova versione: aggiorno…" e si ricarica da sola, senza premere nulla. Se in quel momento si sta scrivendo (pop-up aperto, campo attivo) aspetta che si abbia finito.
- **Aggiornare**: trascinando giù la pagina quando è in cima l'app cerca una nuova versione e rilegge ricette e alimenti, senza rifare l'intro; in alto, al posto della nuvola, gira una rotellina.
- **Ricette**: 150 ricette (73 pranzi, 77 cene), dosi per una porzione, con tempi di preparazione attiva e totale e il procedimento passo per passo. Quelle oltre 30 min attivi o 60 totali restano visibili ma non vengono proposte. Filtri per pasto e per stagione (primavera, estate, autunno, inverno). Dalla scheda *Ricette* si aggiungono ricette nuove (e, se serve, alimenti nuovi), si modificano quelle esistenti o si smette di proporle; le modifiche sono condivise tra i due telefoni.

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

Le stesse istruzioni sono nell'app: scheda **Altro** > *Installa sul telefono* (e un invito in cima al Menù finché l'app non è installata).

**Android**: apri l'indirizzo in **Chrome** > menu ⋮ > **Installa app** (o *Aggiungi a schermata Home*). Se Chrome lo permette, nell'app compare direttamente il pulsante *Installa*.

**iPhone / iPad**: apri l'indirizzo in **Safari** > **Condividi** (su iOS 26 è nel menu ⋯) > **Aggiungi alla schermata Home** > lascia attivo *Apri come app web* > **Aggiungi**. Poi apri l'app dall'icona e accedi con Google lì dentro: l'app installata ha un accesso separato da Safari.

### Accesso Google su iPhone (passo da fare una volta)

Su iPhone il popup di Google di Firebase non funziona bene (soprattutto nell'app installata), perché Safari tiene separati i dati di `mi-piatti.firebaseapp.com`. Su iOS l'app quindi va direttamente da Google e torna su `https://banzuele.github.io/mi-piatti/`. Google accetta il ritorno solo se l'indirizzo è autorizzato:

1. Apri <https://console.cloud.google.com/apis/credentials?project=mi-piatti>.
2. In *ID client OAuth 2.0* apri **Web client (auto created by Google Service)**.
3. In **Origini JavaScript autorizzate** aggiungi `https://banzuele.github.io`.
4. In **URI di reindirizzamento autorizzati** aggiungi `https://banzuele.github.io/mi-piatti/` (con la `/` finale), poi **Salva**. Può servire qualche minuto.

L'ID di quel client è in `config.js` (`googleClientId`). Se l'accesso su iPhone non va, nella schermata di accesso c'è *Prova l'altro metodo* (il popup classico). Su Android resta il popup classico.

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
| `js/calendario.js` | settimane da lunedì a domenica, deperibilità contata dal giorno della spesa, festività, stagioni, deperibilità, porzioni |
| `js/pianificatore.js` | generazione e sostituzione dei pasti |
| `js/spesa.js` | lista della spesa e testo da copiare |
| `js/prezzi.js` | prezzi pagati: prezzo unitario, media, andamento |
| `js/archivio.js` | Firebase (Firestore + Google) oppure solo locale |
| `js/app.js` | interfaccia |
| `sw.js` | funzionamento offline |
| `strumenti/genera_icone.cjs` | icone (compresa quella per iPhone, `icona-180.png`) |
| `strumenti/genera_splash.cjs` | schermate di avvio per iPhone (`icons/splash/`) e i loro `<link>` in `index.html` |

Il service worker prende i file dalla rete quando c'è, e dalla copia salvata quando manca. Se aggiungi file all'app, inseriscili nell'elenco `FILE` di `sw.js` e aumenta `VERSIONE`.
