/**
 * One real task, to find out what Manus actually delivers for a full website.
 *
 * Creates a task, polls it, then dumps every message and downloads every
 * attachment into scripts/probe-out/. The point is to look at the artefacts
 * before designing an importer around guesses.
 *
 *   node scripts/manusSiteProbe.mjs create   # starts the task, prints its id
 *   node scripts/manusSiteProbe.mjs poll <id>
 *   node scripts/manusSiteProbe.mjs dump <id>
 *
 * The key is read from .env and never printed.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const ROOT = new URL('..', import.meta.url);
const OUT = new URL('./probe-out/', import.meta.url);

function env(name) {
  const text = readFileSync(new URL('.env', ROOT), 'utf8');
  const match = text.match(new RegExp(`^${name}=(.*)$`, 'm'));
  return match ? match[1].trim() : '';
}

const apiKey = env('MANUS_API_KEY');
if (!apiKey) {
  console.error('Brak MANUS_API_KEY w .env');
  process.exit(1);
}

const headers = { 'content-type': 'application/json', 'x-manus-api-key': apiKey };

async function api(path, init = {}) {
  const response = await fetch(`https://api.manus.ai/v2/${path}`, { headers, ...init });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }
  return { status: response.status, body };
}

const BRIEF = `Zaprojektuj i zbuduj kompletną, dopracowaną stronę internetową.

Klient: "Między Drzewami" — trzy domki do wynajęcia na Dolnym Śląsku, w lesie.

Kierunek wizualny: kremowe tło, leśna zieleń, rdzawy akcent, duże zdjęcia,
redakcyjna typografia z wyraźną hierarchią.

Wymagania:
- jedna kompletna strona, w pełni responsywna (desktop, tablet, telefon);
- statyczny HTML + CSS (Tailwind mile widziany), bez frameworka i bez builda;
- prawdziwe zdjęcia pasujące do tematu — znajdź lub wygeneruj je i DOŁĄCZ
  pliki obrazów do odpowiedzi; jeśli to zdjęcia poglądowe, nie podawaj ich
  jako autentycznych zdjęć tych domków;
- nie wymyślaj opinii gości, nagród, certyfikatów, numerów telefonu ani
  adresów — nie mam tych danych;
- treść po polsku.

BARDZO WAŻNE — sposób dostarczenia:
Dołącz do odpowiedzi RZECZYWISTE PLIKI projektu jako załączniki:
index.html, arkusz(e) stylów i wszystkie pliki obrazów.
Jeśli możesz dołączyć jedno archiwum .zip z całym projektem, zrób to.
Nie odsyłaj mnie wyłącznie do podglądu online — potrzebuję kodu źródłowego.`;

const mode = process.argv[2] ?? 'create';

if (mode === 'create') {
  const { status, body } = await api('task.create', {
    method: 'POST',
    body: JSON.stringify({
      message: { content: [{ type: 'text', text: BRIEF }] },
      locale: 'pl',
      agent_profile: 'standard',
      async_title: true,
    }),
  });
  console.log('STATUS', status);
  console.log('TASK  ', body.task_id ?? JSON.stringify(body));
  console.log('URL   ', body.task_url ?? '-');
  process.exit(0);
}

const taskId = process.argv[3];
if (!taskId) {
  console.error('Podaj task id');
  process.exit(1);
}

if (mode === 'poll') {
  const { body } = await api(`task.listMessages?task_id=${taskId}&order=desc&limit=30`);
  const messages = body.messages ?? [];
  const status = messages.find((m) => m.type === 'status_update');
  const attachments = messages.flatMap(
    (m) => m.assistant_message?.attachments ?? m.user_message?.attachments ?? [],
  );
  console.log('PHASE      ', status?.status_update?.agent_status ?? '?');
  console.log('BRIEF      ', (status?.status_update?.brief ?? '').slice(0, 80));
  console.log('MESSAGES   ', messages.length);
  console.log('ATTACHMENTS', attachments.length);
  attachments.forEach((a) =>
    console.log('   -', a.type, '|', a.filename, '|', a.content_type, '| url:', a.url ? 'tak' : 'nie'),
  );
  process.exit(0);
}

if (mode === 'dump') {
  mkdirSync(new URL('.', OUT), { recursive: true });

  // Page through every message, oldest first.
  const all = [];
  let cursor;
  do {
    const query = new URLSearchParams({ task_id: taskId, order: 'asc', limit: '100', verbose: 'true' });
    if (cursor) query.set('cursor', cursor);
    const { body } = await api(`task.listMessages?${query}`);
    all.push(...(body.messages ?? []));
    cursor = body.has_more ? body.next_cursor : undefined;
  } while (cursor);

  mkdirSync(new URL(OUT), { recursive: true });
  writeFileSync(new URL('messages.json', OUT), JSON.stringify(all, null, 2));
  console.log('zapisano messages.json, wiadomosci:', all.length);

  const types = {};
  all.forEach((m) => {
    types[m.type] = (types[m.type] ?? 0) + 1;
  });
  console.log('typy:', JSON.stringify(types));

  const attachments = all.flatMap((m) => [
    ...(m.assistant_message?.attachments ?? []),
    ...(m.user_message?.attachments ?? []),
  ]);
  console.log('zalaczniki:', attachments.length);

  const manifest = [];
  for (const attachment of attachments) {
    const entry = {
      type: attachment.type,
      filename: attachment.filename,
      content_type: attachment.content_type,
      path: attachment.path ?? null,
      file_uid: attachment.file_uid ?? null,
      downloaded: false,
      bytes: 0,
    };
    if (attachment.url) {
      try {
        const response = await fetch(attachment.url);
        const buffer = Buffer.from(await response.arrayBuffer());
        const target = new URL(`files/${attachment.filename}`, OUT);
        mkdirSync(dirname(target.pathname.slice(1)), { recursive: true });
        mkdirSync(new URL('files/', OUT), { recursive: true });
        writeFileSync(target, buffer);
        entry.downloaded = true;
        entry.bytes = buffer.length;
      } catch (error) {
        entry.error = String(error).slice(0, 120);
      }
    }
    manifest.push(entry);
    console.log(
      `   ${entry.downloaded ? 'OK ' : '-- '} ${entry.filename} (${entry.content_type}) ${entry.bytes}B`,
    );
  }
  writeFileSync(new URL('manifest.json', OUT), JSON.stringify(manifest, null, 2));

  // Any website checkpoints attached to this task?
  const site = await api(`website.status?task_id=${taskId}`);
  writeFileSync(new URL('website-status.json', OUT), JSON.stringify(site, null, 2));
  console.log('website.status:', site.status, JSON.stringify(site.body).slice(0, 200));

  const artifacts = await api('artifact.list?limit=20');
  writeFileSync(new URL('artifacts.json', OUT), JSON.stringify(artifacts.body, null, 2));
  const mine = (artifacts.body.data ?? []).filter((a) => a.task_id === taskId);
  console.log('artefakty tego zadania:', mine.length);
  mine.forEach((a) =>
    console.log('   -', a.file_type, '|', a.filename, '|', a.type, '| url:', a.url ? 'tak' : 'nie'),
  );
  process.exit(0);
}

console.error('Nieznany tryb:', mode);
process.exit(1);
