# Backend sicuro per la ricerca calorie

Questo Cloudflare Worker riceve soltanto il testo cercato, interroga la Responses API di OpenAI con `web_search` e restituisce risultati strutturati. La chiave OpenAI resta nei secret del Worker e non raggiunge mai GitHub Pages o l'iPhone.

## Endpoint

- `GET /health`: verifica configurazione e autenticazione senza effettuare ricerche a pagamento.
- `POST /v1/foods/search`: corpo JSON `{ "query": "yogurt greco bianco" }`.

Entrambi richiedono `Authorization: Bearer <APP_ACCESS_TOKEN>` e accettano in produzione soltanto l'origine `https://awkmauro.github.io`.

## Pubblicazione consigliata con Wrangler

1. Installa una versione recente di Node.js.
2. In questa cartella esegui `npm install` e `npx wrangler login`.
3. Inserisci la chiave creata nel pannello API OpenAI con `npx wrangler secret put OPENAI_API_KEY`.
4. Genera in KeePass un codice casuale di almeno 32 caratteri e inseriscilo con `npx wrangler secret put APP_ACCESS_TOKEN`.
5. Esegui `npm run deploy` e conserva l'indirizzo `https://...workers.dev` restituito.

I valori dei secret vanno digitati soltanto quando Wrangler li richiede: non inserirli nei file, nei commit o in chat. Per lo sviluppo locale copia `.dev.vars.example` in `.dev.vars`; il file reale è escluso da Git.

## Pubblicazione dal pannello Cloudflare

È possibile creare un Worker dal pannello, incollare `src/index.js` e aggiungere in **Settings → Variables and Secrets**:

- secret `OPENAI_API_KEY`;
- secret `APP_ACCESS_TOKEN`;
- variabile `ALLOWED_ORIGINS` = `https://awkmauro.github.io`;
- variabile `OPENAI_MODEL` = `gpt-5.6-luna`.

Il binding `AI_RATE_LIMITER` è opzionale nel codice ma raccomandato; `wrangler.jsonc` lo configura a 6 nuove ricerche al minuto. La cache del Worker e quella dell'iPhone riducono le chiamate ripetute.

## Protezioni incluse

- chiave OpenAI solo server-side;
- secondo token privato dell'app confrontato senza confronto diretto della stringa;
- CORS ristretto all'origine della PWA;
- corpo massimo 2 KB e query da 2 a 120 caratteri;
- una sola chiamata di ricerca web per richiesta;
- output JSON con schema fisso;
- URL accettato solo se compare tra le fonti realmente consultate;
- timeout, limite di frequenza e cache server-side;
- `store: false` e nessun log della query.

Imposta inoltre un limite di spesa basso sul progetto API OpenAI. La ricerca AI è un aiuto: l'etichetta del prodotto resta il riferimento.

