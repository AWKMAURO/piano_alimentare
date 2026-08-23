import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest, normalizeProducts, normalizeQuery, openAiRequest } from '../src/index.js';

const ORIGIN = 'https://awkmauro.github.io';
const ENV = {
  APP_ACCESS_TOKEN: 'a-very-long-private-application-token',
  OPENAI_API_KEY: 'test-openai-key',
  OPENAI_MODEL: 'test-model',
  ALLOWED_ORIGINS: ORIGIN,
  AI_RATE_LIMITER: { limit: async () => ({ success: true }) }
};

function request(path, options = {}) {
  return new Request(`https://worker.example${path}`, {
    method: options.method || 'GET',
    headers: {
      Origin: ORIGIN,
      Authorization: `Bearer ${options.token || ENV.APP_ACCESS_TOKEN}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
}

test('normalizza la query senza accettare caratteri di controllo', () => {
  assert.equal(normalizeQuery('  yogurt\n greco  '), 'yogurt greco');
});

test('la richiesta OpenAI forza web search e output strutturato', () => {
  const body = openAiRequest('yogurt greco', ENV);
  assert.equal(body.model, 'test-model');
  assert.equal(body.tools[0].type, 'web_search');
  assert.equal(body.text.format.type, 'json_schema');
  assert.equal(body.store, false);
});

test('scarta una fonte inventata non presente tra le fonti consultate', () => {
  const products = normalizeProducts({
    results: [{ name: 'Yogurt', brand: null, kcalPer100: 60, basis: '100 g', sourceTitle: 'Fonte', sourceUrl: 'https://inventata.example/yogurt', confidence: 'alta', note: '' }]
  }, new Map([['https://reale.example/yogurt', { url: 'https://reale.example/yogurt', title: 'Reale' }]]));
  assert.deepEqual(products, []);
});

test('health richiede il codice privato', async () => {
  const response = await handleRequest(request('/health', { token: 'sbagliato' }), ENV);
  assert.equal(response.status, 401);
});

test('health conferma la configurazione senza consumare una chiamata OpenAI', async () => {
  const response = await handleRequest(request('/health'), ENV);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, openaiConfigured: true, model: 'test-model' });
});

test('ricerca restituisce soltanto un valore collegato a una fonte consultata', async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => new Response(JSON.stringify({
    output: [
      { type: 'web_search_call', action: { sources: [{ url: 'https://example.com/yogurt', title: 'Scheda yogurt' }] } },
      { type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ results: [{ name: 'Yogurt bianco', brand: null, kcalPer100: 62, basis: '100 g', sourceTitle: 'Scheda yogurt', sourceUrl: 'https://example.com/yogurt', confidence: 'alta', note: 'Valore dichiarato.' }] }) }] }
    ]
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  const response = await handleRequest(request('/v1/foods/search', { method: 'POST', body: { query: 'yogurt bianco' } }), ENV);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.products.length, 1);
  assert.equal(payload.products[0].kcalPer100, 62);
  assert.equal(payload.products[0].sourceUrl, 'https://example.com/yogurt');
});

