# Cube Trainer

Web app per imparare il cubo di Rubik: legge il cubo dalla webcam e poi
- **Allena algoritmi**: OLL (57), PLL (21), F2L (41), OLL e PLL in 2 fasi, più i tuoi algoritmi. Calcola il setup più corto per arrivare al caso scelto, lo mostra animato in 3D e in notazione, poi ti fa ripetere il caso in loop.
- **Risolvi passo passo**: metodo a strati per principianti (croce bianca, angoli, secondo strato, croce gialla, faccia gialla, angoli e spigoli gialli), con le mosse di ogni fase animate e spiegate.

Interfaccia in italiano, inglese, spagnolo, francese, tedesco, cinese e arabo (da destra a sinistra). Per pubblicarla online vedi [PUBLISHING.md](PUBLISHING.md).

```bash
npm install
npm run dev      # http://localhost:5173 (la webcam richiede localhost o HTTPS)
npm test         # test: modello del cubo, tutti i set di algoritmi, setup, guida, traduzioni, visione
npm run build    # build statica in dist/ (con dist/_headers di sicurezza)
npm run preview  # prova la build con gli header di produzione
```

## Come si usa
1. **Leggi il cubo**: avvia la webcam e gira il cubo in mano davanti alla camera, a qualsiasi distanza e posizione nell'inquadratura. Le facce vengono riconosciute anche inclinate (fino a 3 per fotogramma) e acquisite dopo pochi fotogrammi coerenti, senza stare fermi; con la sesta l'app parte da sola. Con la **scansione guidata** (predefinita) l'app ti dice quale faccia mostrare (bianca, verde, rossa, blu, arancione, gialla) e con i pulsanti colorati puoi indicare tu quale stai mostrando: i nomi dei colori sono certi, il centro di ogni faccia diventa un riferimento misurato con la luce del momento, e sui cubi stickerless (pezzi uguali adiacenti che si fondono) la faccia viene ricostruita anche dai 4 buchi neri interni. Se serve, c'è ancora la modalità a griglia fissa. Tieni il cubo a 40-60 cm: da vicino lo schermo si riflette sulle facce. In alternativa: "Il mio cubo è risolto", oppure scrivi le mosse fatte da risolto.
2. **Setup**: tieni il cubo col giallo sopra e il verde davanti, esegui le mosse mostrate (← → per scorrerle, P per l'animazione) e premi **spazio**.
3. **Esegui l'OLL**: riconosci il caso ed esegui l'algoritmo (A per vederlo), poi **spazio**. Il setup successivo è l'inverso del tuo algoritmo: niente scan ripetuti.

Il pulsante **Ricomincia scan** cancella le facce lette senza spegnere la webcam.

**Notazione.** Si possono scrivere gruppi e ripetizioni (`(R U R' U')3`, `(R U)'`), coniugati `[A: B]` = A B A', commutatori `[A, B]` = A B A' B', e trigger per nome (`sexy`, `sledge`, `hedge`, `sune`, `antisune`…). Non esiste uno standard ufficiale per i nomi dei trigger: sono quelli in uso nella community, in inglese in tutte le lingue. Mentre esegui un algoritmo, i trigger vengono riconosciuti e raggruppati, e con **Diteggiatura** sotto ogni mossa compare il dito suggerito (presa standard: polsi per R/L, indici per U, anulari per D/B e M).

Nel pannello degli algoritmi scegli il set e i casi da allenare (uno solo oppure a rotazione) e imposti il tuo algoritmo per ogni caso: viene verificato prima di salvarlo.

Per le prove senza cubo: "Simula webcam" (cubo sintetico in movimento) oppure "Usa un video" (un video registrato fa da webcam).

## Struttura
- `src/cube`: stato a 54 facelet, mosse ricavate dalla geometria 3D, notazione, cubie e validazione.
- `src/oll`, `src/algs`: i set di algoritmi. Ogni caso è un *pattern* (pezzi esatti, solo orientati o ignorati) ricavato dall'inverso dell'algoritmo; il setup generico vale per tutti i set. I 41 casi F2L sono generati con una ricerca ottimale in ⟨R,U,F⟩.
- `src/guide`: risolutore a strati che spiega: croce ottimale da tabella delle distanze, poi ricerca sui *macro* (U + algoritmo della fase in ogni slot, con rotazioni y).
- `src/i18n`: traduzioni in 7 lingue.
- `src/solver`: Kociemba (cubejs) in un Web Worker.
- `src/vision`: camera; rilevatore libero (componenti connesse → reticolo 3×3 verificato sulla forma degli sticker → omografia) in un Web Worker; tracciamento delle facce tra i fotogrammi; bilanciamento del bianco dallo sticker bianco (scelto per saturazione relativa, così un giallo pastello o un blu scuro non vengono scambiati per bianco); illuminazione stimata faccia per faccia (dominante e gradiente lineare, con stima robusta alternata alla classificazione); nomi dei colori assegnati per ordine di tinta e verificati con i vincoli del cubo; classificazione bilanciata (9 per colore) con calibrazione che si affina a ogni scan; ricostruzione senza vincoli di rotazione e riparazione automatica; renderer prospettico per test e webcam simulata.
- `src/render`: cubo three.js, player delle mosse, diagrammi OLL.
