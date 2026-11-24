// Configurazione di Firebase.
//
// Finché qui resta `null`, l'app funziona solo su questo telefono (nessuna
// condivisione). Per condividere menù e spesa:
//   1. segui i passi del README (sezione "Collegare Firebase");
//   2. incolla qui sotto l'oggetto firebaseConfig che ti dà la console Firebase,
//      al posto di `null`.
//
// Questi valori non sono segreti: i dati sono protetti dalle regole di
// Firestore (file firestore.rules), che ammettono solo i vostri due account.

export const firebaseConfig = null;

// Esempio di come deve apparire dopo averlo incollato:
// export const firebaseConfig = {
//   apiKey: "AIza...",
//   authDomain: "mi-piatti-xxxx.firebaseapp.com",
//   projectId: "mi-piatti-xxxx",
//   storageBucket: "mi-piatti-xxxx.firebasestorage.app",
//   messagingSenderId: "1234567890",
//   appId: "1:1234567890:web:abcdef",
// };

// Nome del "contenitore" condiviso in Firestore. Lasciatelo così.
export const famiglia = "famiglia";
