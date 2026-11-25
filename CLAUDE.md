# Mi-Piatti: regole per chi modifica l'app

Rispondere e scrivere in italiano, in modo semplice.

## Ogni modifica deve funzionare su Android e su iPhone

L'app si usa installata sul telefono sia su **Android (Chrome)** sia su **iPhone/iPad (Safari, "Aggiungi alla schermata Home")**. Ogni modifica va pensata e controllata per entrambi. Prima di aprire una PR:

- Prova l'interfaccia almeno con l'emulazione di un iPhone (es. Playwright `devices['iPhone 15']`) e di un Android (`devices['Pixel 7']`).
- **Safe area**: in alto e in basso usare `env(safe-area-inset-*)` (notch, Dynamic Island, barra Home). Elementi fissi in basso stanno sopra la barra delle schede.
- **Campi di testo**: su iPhone almeno 16px, altrimenti Safari ingrandisce la pagina (regola in fondo a `css/stile.css`).
- **Tocchi lunghi e trascinamenti**: usare Pointer Events con `touch-action: none`, `-webkit-user-select: none` e `-webkit-touch-callout: none`, altrimenti iOS apre la lente o il menu.
- **Funzioni del browser**: controllare che esistano anche su Safari iOS (es. niente `beforeinstallprompt`, vibrazione, Web Share solo con gesto dell'utente). Se manca, prevedere un'alternativa.
- **Login Google**: su iOS si usa il ritorno diretto da Google (`accediIOS` in `js/archivio.js`), su Android il popup di Firebase. Non toccare uno senza provare l'altro.
- **Aggiornamenti**: a ogni rilascio aumentare insieme `data-versione` in `index.html` e `VERSIONE` in `sw.js`; i file nuovi vanno nell'elenco `FILE` di `sw.js`.
- **Icona e avvio su iPhone**: se cambia l'icona rigenerare `node strumenti/genera_icone.cjs icons` e poi `node strumenti/genera_splash.cjs`.
- Istruzioni di installazione per entrambi i sistemi: in `js/app.js` (`vistaInstalla`) e nel README.

## Test

```
node --test test/*.test.mjs
```
