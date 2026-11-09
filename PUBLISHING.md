# Pubblicare Cube Trainer

## Cosa c'è da pubblicare

L'app è **completamente statica**: `npm run build` produce la cartella `dist/` (HTML, JS, CSS, due Web Worker). Non c'è backend, database o account:

- il video della webcam viene elaborato nel browser e non lascia il dispositivo;
- impostazioni, statistiche e calibrazione dei colori stanno nel `localStorage` del browser dell'utente.

Basta quindi un hosting statico con **HTTPS**, che è obbligatorio: i browser concedono la webcam solo a pagine HTTPS (o `localhost`).

## Dove pubblicarla (consigliati, tutti con piano gratuito)

| Servizio | Pro | Header di sicurezza |
|---|---|---|
| **Cloudflare Pages** (consigliato) | CDN globale veloce, HTTPS automatico, dominio `*.pages.dev`, banda illimitata | sì: legge `dist/_headers`, generato dalla build |
| **Netlify** | molto semplice, deploy da Git o trascinando `dist/` | sì: legge `dist/_headers` |
| **Vercel** | deploy da Git, anteprime per ogni branch | sì, ma tramite un `vercel.json` (da creare con gli stessi valori di `security-headers.json`) |
| **GitHub Pages** | gratis con il repository | **no**: non permette header personalizzati (vedi sotto) |

Con Cloudflare Pages o Netlify:

1. metti il progetto su GitHub (repository anche privato);
2. collega il repository al servizio;
3. imposta il comando di build `npm run build` e la cartella `dist`;
4. ogni `git push` pubblica la nuova versione.

In alternativa, con Netlify puoi trascinare la cartella `dist/` nel sito.

Un dominio personale (circa 10 €/anno) si collega da pannello; il certificato HTTPS è automatico.

Server propri (VPS, Raspberry, NAS) non servono e aggiungono lavoro: aggiornamenti, certificati, firewall. Se proprio vuoi usarli, va bene qualsiasi server web statico (Caddy è il più semplice, perché fa HTTPS da solo) a cui aggiungi gli header di `security-headers.json`.

## Sicurezza

Gli header di sicurezza sono definiti in un solo posto, `security-headers.json`. La build li scrive in `dist/_headers`, e `npm run preview` li applica in locale, così puoi provare la build esattamente come andrà online. È verificato che l'app funzioni con questi header: scan, worker e solver.

- **Content-Security-Policy**: il browser esegue solo codice servito dal tuo dominio. Niente script esterni, niente `eval`, nessuna connessione verso altri server, la pagina non può essere incorniciata da altri siti (protezione dal clickjacking). Lo stile inline resta permesso perché lo usano il cubo 3D e la sovrapposizione video.
- **Permissions-Policy**: la camera è permessa solo al tuo dominio; microfono, posizione, pagamenti e USB sono negati.
- **Referrer-Policy: no-referrer**: i link esterni non rivelano da dove arriva l'utente.
- **HSTS**: forza HTTPS. Attivalo solo quando il dominio è definitivo, perché i browser lo ricordano per un anno.
- **Nessuna dipendenza caricata da CDN di terzi**: three.js e cubejs sono inclusi nella build.
- **Dipendenze**: prima di ogni rilascio lancia `npm audit`. Le dipendenze di runtime sono solo due (three, cubejs). Oggi `npm audit` segnala circa 40 vulnerabilità, tutte dentro `npm@6`, che cubejs dichiara (per errore) come sua dipendenza. Quel codice non finisce nella build e non arriva al browser: Vite include solo i moduli importati. Riguarda solo la macchina che installa i pacchetti.
- Il testo inserito dall'utente (nomi e algoritmi personalizzati) viene sempre mostrato come testo, mai come HTML.

GitHub Pages non permette di impostare gli header. Se lo usi, puoi aggiungere la sola CSP come `<meta http-equiv="Content-Security-Policy">` in `index.html`, ma senza `frame-ancestors`, che nei meta viene ignorata. Meglio Cloudflare Pages.

## Privacy (GDPR)

- Il video non viene mai inviato né registrato: l'elaborazione avviene nel browser, ed è scritto nell'app (riga "Privacy" sotto la webcam).
- Non ci sono cookie, analytics né tracciamento. Il `localStorage` contiene solo preferenze tecniche richieste dall'utente, quindi **non serve un banner cookie**.
- Il fornitore di hosting vede comunque gli indirizzi IP nei log del server: è normale per qualsiasi sito.
- Conviene comunque una breve pagina di informativa con chi gestisce il sito e un contatto, ciò che si salva in locale (preferenze, statistiche, calibrazione) e come cancellarlo (pulsante "Azzera calibrazione" o cancellazione dei dati del sito dal browser).
- Se un giorno aggiungerai statistiche di utilizzo, preferisci strumenti senza cookie e senza dati personali (Cloudflare Web Analytics, Plausible), e aggiorna l'informativa.

## Licenze

- **cubejs** e **three.js** sono MIT: mantieni le loro note di copyright, già presenti nei pacchetti npm.
- Gli algoritmi di OLL, PLL e F2L sono conoscenza comune della community. Quelli F2L sono generati dall'app.
- Il logo GAN, se mai comparisse in screenshot promozionali, è un marchio di GAN.
- Scegli una licenza per il tuo codice (ad esempio MIT) se lo pubblichi su GitHub.

## Checklist prima di pubblicare

- [ ] `npm test` e `npm run build` senza errori
- [ ] `npm run preview`, poi prova webcam, scan, allenamento e guida su `http://localhost:4173`
- [ ] `npm audit`
- [ ] prova da telefono (Android Chrome, iOS Safari) sull'URL HTTPS pubblicato
- [ ] informativa privacy raggiungibile dalla pagina
