import { fetchTaskFile, fetchTaskFiles } from '../manus/client';
import { importSite, type IncomingFile } from './importSite';
import { SiteDocument, SiteOriginal } from './types';

/**
 * Downloads a finished task's files and turns them into a site document.
 *
 * The original delivery is kept alongside the editable copy, so a conversion
 * that goes wrong can be retried — or inspected — without paying for another
 * generation.
 */

/** Files we never need in the browser, and which can be very large. */
const SKIP = /\.(zip|tar|gz|7z|rar)$/i;

/** Text types that should be decoded rather than kept as blobs. */
const TEXT_TYPES = /^(text\/|application\/(json|xml|javascript))/i;

export interface IngestProgress {
  downloaded: number;
  total: number;
  current: string;
}

export interface IngestSuccess {
  ok: true;
  document: SiteDocument;
  original: SiteOriginal;
}

export interface IngestFailure {
  ok: false;
  reason: string;
  /** Whatever we managed to fetch, for diagnosis. */
  original: SiteOriginal | null;
}

const parseHtml = (html: string): Document =>
  new DOMParser().parseFromString(html, 'text/html');

const serialise = (doc: Document): string => `<!doctype html>\n${doc.documentElement.outerHTML}`;

/**
 * Fetches every file of a task and imports it.
 *
 * The archive is skipped on purpose: each file arrives separately with its
 * full path, so the project tree can be rebuilt without unpacking anything —
 * and without pulling a zip library into the bundle.
 */
export async function ingestTaskOutput(
  taskId: string,
  onProgress?: (progress: IngestProgress) => void,
): Promise<IngestSuccess | IngestFailure> {
  let listed;
  try {
    listed = await fetchTaskFiles(taskId);
  } catch (error) {
    return { ok: false, reason: (error as Error).message, original: null };
  }

  const wanted = listed.filter((file) => !SKIP.test(file.path));
  if (wanted.length === 0) {
    return {
      ok: false,
      reason:
        'Zadanie nie dołączyło żadnych plików projektu. Otwórz je w Manus i poproś o załączenie kodu źródłowego.',
      original: { taskId, files: [], complete: false, fetchedAt: Date.now() },
    };
  }

  const incoming: IncomingFile[] = [];
  const originalFiles: SiteOriginal['files'] = [];

  for (let index = 0; index < wanted.length; index += 1) {
    const file = wanted[index];
    onProgress?.({ downloaded: index, total: wanted.length, current: file.filename });
    try {
      const blob = await fetchTaskFile(taskId, file.path);
      const isText = TEXT_TYPES.test(file.contentType) || /\.(html?|css|md|txt|svg)$/i.test(file.path);
      const text = isText ? await blob.text() : undefined;

      incoming.push({
        path: file.path,
        contentType: file.contentType,
        text,
        blob,
        bytes: blob.size,
      });
      originalFiles.push({ path: file.path, contentType: file.contentType, text, blob });
    } catch (error) {
      return {
        ok: false,
        reason: `Nie udało się pobrać ${file.filename}: ${(error as Error).message}`,
        original: { taskId, files: originalFiles, complete: false, fetchedAt: Date.now() },
      };
    }
  }

  onProgress?.({ downloaded: wanted.length, total: wanted.length, current: '' });

  const original: SiteOriginal = {
    taskId,
    files: originalFiles,
    complete: true,
    fetchedAt: Date.now(),
  };
  const result = importSite(incoming, parseHtml, serialise);
  if (!result.ok) {
    return { ok: false, reason: `${result.reason} Otrzymane pliki: ${result.files.join(', ')}`, original };
  }

  return { ok: true, document: result.document, original };
}

export { parseHtml, serialise };
