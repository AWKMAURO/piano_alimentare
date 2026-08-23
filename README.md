# Il mio piano alimentare

PWA locale costruita dal file `Schema settimanale luglio 2026.pdf`.

Contiene il piano del giorno, l'anteprima del giorno successivo, la settimana completa e una lista della spesa selezionabile. Lo stato della lista viene conservato localmente nel browser.

Le alternative del documento originale sono mantenute esplicite. L'app non modifica né sostituisce le indicazioni professionali ricevute.

## Diario alimentare

La sezione Diario registra gli alimenti consumati per giorno e pasto. Le calorie sono calcolate da quantità e kcal per 100 g/ml. L'obiettivo giornaliero è facoltativo; alimenti, valori e impostazioni restano locali e possono essere esportati o importati tramite backup JSON.

La ricerca per nome e marca recupera online le kcal per 100 g/ml da Open Food Facts. I risultati scelti e le ricerche recenti vengono conservati sul dispositivo per ridurre le richieste e restare riutilizzabili offline. I dati esterni possono essere incompleti: l'etichetta del prodotto resta il riferimento da controllare.

