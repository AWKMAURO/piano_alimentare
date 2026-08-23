# Il mio piano alimentare

PWA locale costruita dal file `Schema settimanale luglio 2026.pdf`.

Contiene il piano del giorno, l'anteprima del giorno successivo, la settimana completa e una lista della spesa selezionabile. Lo stato della lista viene conservato localmente nel browser.

Le alternative del documento originale sono mantenute esplicite. L'app non modifica né sostituisce le indicazioni professionali ricevute.

## Diario alimentare

La sezione Diario registra gli alimenti consumati per giorno e pasto. Le calorie sono calcolate da quantità e kcal per 100 g/ml. L'obiettivo giornaliero è facoltativo; alimenti, valori e impostazioni restano locali e possono essere esportati o importati tramite backup JSON.

La ricerca gratuita per nome e marca recupera le kcal per 100 g/ml da Open Food Facts. La ricerca intelligente opzionale usa un backend Cloudflare Worker protetto per interrogare OpenAI con ricerca web e mostra soltanto risultati collegati a una fonte consultabile. Entrambi i tipi di risultato vengono conservati sul dispositivo per ridurre le richieste.

La chiave API OpenAI non viene mai inserita nel browser o nel repository. Il Worker la legge da un secret e accetta le richieste soltanto dall'origine GitHub Pages e con un secondo codice privato dell'app. La cartella `worker/` contiene backend, configurazione e test.

I valori esterni possono essere incompleti o non corrispondere esattamente al prodotto consumato: l'etichetta resta il riferimento da controllare.

