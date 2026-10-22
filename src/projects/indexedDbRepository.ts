import { StorageService } from '../services/storage';
import { ProjectState } from '../types/document';
import {
  ProjectRecord,
  ProjectRepository,
  ProjectSummary,
  emptyGeneration,
  previewHeadingOf,
} from './types';

/**
 * IndexedDB-backed project storage.
 *
 * Two stores: `summaries` for the dashboard list and `documents` for the full
 * project state. The dashboard reads only summaries, so opening it never
 * deserialises every document — which matters as soon as a project carries
 * images and snapshots.
 */

const DB_NAME = 'nodera';
const DB_VERSION = 1;
const SUMMARY_STORE = 'summaries';
const DOCUMENT_STORE = 'documents';

/** The pre-dashboard single-project key, migrated once on first open. */
const LEGACY_KEY = 'nodera_project_state_v1';
const MIGRATION_FLAG = 'nodera_migrated_to_projects_v1';

export class StorageUnavailableError extends Error {
  constructor(cause: unknown) {
    super(
      'Nie udało się otworzyć lokalnej bazy projektów. ' +
        'Sprawdź, czy przeglądarka nie blokuje danych witryny (tryb prywatny).',
    );
    this.name = 'StorageUnavailableError';
    this.cause = cause;
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (error) {
      reject(new StorageUnavailableError(error));
      return;
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SUMMARY_STORE)) {
        db.createObjectStore(SUMMARY_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(DOCUMENT_STORE)) {
        db.createObjectStore(DOCUMENT_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new StorageUnavailableError(request.error));
    request.onblocked = () => reject(new StorageUnavailableError('blocked'));
  });
}

function runTransaction<T>(
  db: IDBDatabase,
  stores: string[],
  mode: IDBTransactionMode,
  work: (tx: IDBTransaction) => Promise<T> | T,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    let result: T;
    // The transaction's own completion decides success. Resolving on the
    // request callback instead would report a save that a later abort undid.
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error ?? new Error('Transakcja bazy nie powiodła się.'));
    tx.onabort = () => reject(tx.error ?? new Error('Transakcja bazy została przerwana.'));

    Promise.resolve(work(tx))
      .then((value) => {
        result = value;
      })
      .catch((error) => {
        try {
          tx.abort();
        } catch {
          /* already finished */
        }
        reject(error);
      });
  });
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

interface StoredDocument {
  id: string;
  document: ProjectState | null;
  generation: ProjectRecord['generation'];
}

function toSummary(record: ProjectRecord): ProjectSummary {
  return {
    id: record.id,
    name: record.name,
    prompt: record.prompt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    status: record.status,
    isDemo: record.isDemo,
    previewHeading: record.previewHeading,
  };
}

export class IndexedDbProjectRepository implements ProjectRepository {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private db(): Promise<IDBDatabase> {
    if (!this.dbPromise) this.dbPromise = openDatabase();
    return this.dbPromise;
  }

  async list(): Promise<ProjectSummary[]> {
    const db = await this.db();
    const summaries = await runTransaction(db, [SUMMARY_STORE], 'readonly', (tx) =>
      request(tx.objectStore(SUMMARY_STORE).getAll() as IDBRequest<ProjectSummary[]>),
    );
    return summaries.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async get(id: string): Promise<ProjectRecord | null> {
    const db = await this.db();
    return runTransaction(db, [SUMMARY_STORE, DOCUMENT_STORE], 'readonly', async (tx) => {
      const summary = await request(
        tx.objectStore(SUMMARY_STORE).get(id) as IDBRequest<ProjectSummary | undefined>,
      );
      if (!summary) return null;
      const stored = await request(
        tx.objectStore(DOCUMENT_STORE).get(id) as IDBRequest<StoredDocument | undefined>,
      );
      return {
        ...summary,
        document: stored?.document ?? null,
        generation: stored?.generation ?? emptyGeneration(),
      };
    });
  }

  async create(record: ProjectRecord): Promise<void> {
    const db = await this.db();
    await runTransaction(db, [SUMMARY_STORE, DOCUMENT_STORE], 'readwrite', async (tx) => {
      await request(tx.objectStore(SUMMARY_STORE).put(toSummary(record)));
      await request(
        tx.objectStore(DOCUMENT_STORE).put({
          id: record.id,
          document: record.document,
          generation: record.generation,
        } satisfies StoredDocument),
      );
    });
  }

  async update(id: string, patch: Partial<Omit<ProjectRecord, 'id'>>): Promise<ProjectRecord> {
    const existing = await this.get(id);
    if (!existing) throw new Error(`Projekt ${id} nie istnieje.`);

    const next: ProjectRecord = {
      ...existing,
      ...patch,
      id,
      updatedAt: Date.now(),
    };
    // Keep the card preview in step with the document it describes.
    if (patch.document !== undefined) {
      next.previewHeading = previewHeadingOf(next.document) || existing.previewHeading;
    }

    await this.create(next);
    return next;
  }

  async remove(id: string): Promise<void> {
    const db = await this.db();
    await runTransaction(db, [SUMMARY_STORE, DOCUMENT_STORE], 'readwrite', async (tx) => {
      await request(tx.objectStore(SUMMARY_STORE).delete(id));
      await request(tx.objectStore(DOCUMENT_STORE).delete(id));
    });
  }

  /**
   * Moves a pre-dashboard single project into the repository, once.
   *
   * The old document is left in localStorage rather than deleted: if anything
   * about the move is wrong, the original is still there to look at. The flag
   * stops it from reappearing after the user deletes the migrated copy.
   */
  async migrateLegacyProject(): Promise<ProjectSummary | null> {
    let raw: string | null = null;
    try {
      if (window.localStorage.getItem(MIGRATION_FLAG)) return null;
      raw = window.localStorage.getItem(LEGACY_KEY);
    } catch {
      return null;
    }
    if (!raw) return null;

    let document: ProjectState;
    try {
      document = StorageService.migrateProject(JSON.parse(raw) as ProjectState);
    } catch {
      return null;
    }

    const now = Date.now();
    const record: ProjectRecord = {
      id: `legacy-${now}`,
      name: document.name || 'Zaimportowany projekt',
      prompt: '',
      createdAt: now,
      updatedAt: now,
      status: 'ready',
      isDemo: false,
      previewHeading: previewHeadingOf(document),
      document,
      generation: { ...emptyGeneration(), status: 'ready' },
    };

    await this.create(record);
    try {
      window.localStorage.setItem(MIGRATION_FLAG, String(now));
    } catch {
      /* the project is saved; the flag is a convenience */
    }
    return toSummary(record);
  }
}

export const projectRepository = new IndexedDbProjectRepository();
