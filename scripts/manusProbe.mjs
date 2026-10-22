/**
 * Direct probe against the Manus API, for diagnosing a rejected request.
 *
 * Reads the key from .env and never prints it. Sends one request and prints
 * the status and body verbatim, so the failure can be read rather than guessed.
 *
 *   node scripts/manusProbe.mjs schema   # validate the structured schema
 *   node scripts/manusProbe.mjs minimal  # same request with no schema
 */
import { readFileSync } from 'node:fs';

function readEnv(name) {
  const text = readFileSync(new URL('../.env', import.meta.url), 'utf8');
  const match = text.match(new RegExp(`^${name}=(.*)$`, 'm'));
  return match ? match[1].trim() : '';
}

const apiKey = readEnv('MANUS_API_KEY');
if (!apiKey) {
  console.error('Brak MANUS_API_KEY w .env');
  process.exit(1);
}

const mode = process.argv[2] ?? 'schema';

// Imported as JSON rather than from the TS module, so this runs under plain node.
const schema = JSON.parse(
  readFileSync(new URL('./manusSchema.json', import.meta.url), 'utf8'),
);

const body = {
  message: { content: [{ type: 'text', text: 'Zwróć przykładową stronę jednej piekarni.' }] },
  locale: 'pl',
  agent_profile: 'standard',
  async_title: true,
  ...(mode === 'schema' ? { structured_output_schema: schema } : {}),
};

const response = await fetch('https://api.manus.ai/v2/task.create', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-manus-api-key': apiKey },
  body: JSON.stringify(body),
});

const text = await response.text();
console.log('MODE   :', mode);
console.log('STATUS :', response.status);
// The key never appears in a response body, but redact defensively anyway.
console.log('BODY   :', text.replaceAll(apiKey, '<REDACTED>'));
