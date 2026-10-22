import React, { useCallback, useEffect, useRef, useState } from 'react';
import { App, SaveState } from './App';
import { DashboardView } from './components/Views/DashboardView';
import { GeneratingView } from './components/Views/GeneratingView';
import { fetchConfig } from './manus/client';
import { projectRepository } from './projects/indexedDbRepository';
import { useGeneration } from './projects/useGeneration';
import {
  ProjectRecord,
  ProjectSummary,
  emptyGeneration,
  nameFromPrompt,
  previewHeadingOf,
} from './projects/types';
import { INITIAL_SPLOT_PROJECT } from './data/splotDemo';
import { StorageService } from './services/storage';
import { ProjectState } from './types/document';

/**
 * Top-level shell: the dashboard, the generation screen and the editor.
 *
 * The editor itself is unchanged — it is handed one project and reports
 * changes back. Everything about *which* project is in play lives here.
 */

type Route =
  | { name: 'dashboard' }
  | { name: 'generating'; projectId: string }
  | { name: 'editor'; projectId: string };

/** Debounce for the automatic local draft, so typing does not thrash the DB. */
const AUTOSAVE_DELAY_MS = 900;

export const NoderaApp: React.FC = () => {
  const [route, setRoute] = useState<Route>({ name: 'dashboard' });
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [configMessage, setConfigMessage] = useState('');
  const [creating, setCreating] = useState(false);

  const [activeRecord, setActiveRecord] = useState<ProjectRecord | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [saveError, setSaveError] = useState<string | null>(null);

  const pendingDocument = useRef<ProjectState | null>(null);
  const autosaveTimer = useRef<number | null>(null);
  const creatingRef = useRef(false);

  /* ---------------------------------------------------------------- */
  /* Loading                                                           */
  /* ---------------------------------------------------------------- */

  const refreshList = useCallback(async () => {
    try {
      const list = await projectRepository.list();
      setProjects(list);
      setStorageError(null);
    } catch (error) {
      setStorageError((error as Error).message);
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        // A project saved by the pre-dashboard build is adopted once, rather
        // than being left behind in localStorage where nothing can reach it.
        await projectRepository.migrateLegacyProject();
      } catch {
        /* migration is best-effort; the dashboard still opens */
      }
      await refreshList();
    })();
  }, [refreshList]);

  useEffect(() => {
    void fetchConfig()
      .then((config) => setConfigMessage(config.configured ? '' : config.message))
      .catch(() => {
        setConfigMessage(
          'Nie mogę sprawdzić konfiguracji Manus API. Uruchom aplikację przez „bun run dev".',
        );
      });
  }, []);

  /* ---------------------------------------------------------------- */
  /* Saving                                                            */
  /* ---------------------------------------------------------------- */

  const writeDocument = useCallback(
    async (projectId: string, document: ProjectState) => {
      setSaveState('saving');
      try {
        const updated = await projectRepository.update(projectId, {
          document,
          previewHeading: previewHeadingOf(document),
        });
        setActiveRecord(updated);
        setSaveState('saved');
        setSaveError(null);
        pendingDocument.current = null;
        void refreshList();
      } catch (error) {
        // No false success: the indicator stays in error until a save works.
        setSaveState('error');
        setSaveError(`Nie udało się zapisać: ${(error as Error).message}`);
      }
    },
    [refreshList],
  );

  const handleDocumentChange = useCallback(
    (document: ProjectState) => {
      const projectId = activeRecord?.id;
      if (!projectId) return;
      pendingDocument.current = document;
      setSaveState('dirty');

      if (autosaveTimer.current !== null) window.clearTimeout(autosaveTimer.current);
      autosaveTimer.current = window.setTimeout(() => {
        const next = pendingDocument.current;
        if (next) void writeDocument(projectId, next);
      }, AUTOSAVE_DELAY_MS);
    },
    [activeRecord?.id, writeDocument],
  );

  const handleSaveNow = useCallback(() => {
    const projectId = activeRecord?.id;
    if (!projectId) return;
    if (autosaveTimer.current !== null) window.clearTimeout(autosaveTimer.current);
    const document = pendingDocument.current ?? activeRecord?.document;
    if (!document) {
      setSaveState('saved');
      return;
    }
    void writeDocument(projectId, document);
  }, [activeRecord, writeDocument]);

  useEffect(
    () => () => {
      if (autosaveTimer.current !== null) window.clearTimeout(autosaveTimer.current);
    },
    [],
  );

  /* ---------------------------------------------------------------- */
  /* Generation                                                        */
  /* ---------------------------------------------------------------- */

  const handleDocumentReady = useCallback(
    (record: ProjectRecord) => {
      setActiveRecord(record);
      setSaveState('saved');
      void refreshList();
      setRoute({ name: 'editor', projectId: record.id });
    },
    [refreshList],
  );

  const generation = useGeneration(
    activeRecord?.id ?? null,
    activeRecord?.generation ?? emptyGeneration(),
    handleDocumentReady,
  );

  // Re-attach to a task that was already running when the page reloaded.
  const resumedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!activeRecord) return;
    if (route.name !== 'generating') return;
    if (resumedFor.current === activeRecord.id) return;
    resumedFor.current = activeRecord.id;

    if (activeRecord.generation.taskId) {
      generation.resume(activeRecord);
    } else if (activeRecord.generation.status === 'none' && activeRecord.prompt) {
      void generation.start(activeRecord);
    }
  }, [activeRecord, route, generation]);

  /* ---------------------------------------------------------------- */
  /* Actions                                                           */
  /* ---------------------------------------------------------------- */

  const openProject = useCallback(async (id: string) => {
    try {
      const record = await projectRepository.get(id);
      if (!record) return;
      resumedFor.current = null;
      pendingDocument.current = null;
      setActiveRecord(record);
      setSaveState('saved');
      setSaveError(null);
      setRoute(
        record.document
          ? { name: 'editor', projectId: id }
          : { name: 'generating', projectId: id },
      );
    } catch (error) {
      setStorageError((error as Error).message);
    }
  }, []);

  const createProject = useCallback(
    async (prompt: string) => {
      // One task per click, even if the button is hit twice before the first
      // call returns — a second task would be billed separately.
      if (creatingRef.current) return;
      creatingRef.current = true;
      setCreating(true);

      const now = Date.now();
      const record: ProjectRecord = {
        id: `p-${now}-${Math.random().toString(36).slice(2, 8)}`,
        name: nameFromPrompt(prompt),
        prompt,
        createdAt: now,
        updatedAt: now,
        status: 'none',
        isDemo: false,
        previewHeading: '',
        document: null,
        generation: emptyGeneration(),
      };

      try {
        await projectRepository.create(record);
        resumedFor.current = null;
        setActiveRecord(record);
        setRoute({ name: 'generating', projectId: record.id });
        void refreshList();
      } catch (error) {
        setStorageError(`Nie udało się utworzyć projektu: ${(error as Error).message}`);
      } finally {
        creatingRef.current = false;
        setCreating(false);
      }
    },
    [refreshList],
  );

  const loadDemo = useCallback(async () => {
    const now = Date.now();
    const document = StorageService.migrateProject(
      JSON.parse(JSON.stringify(INITIAL_SPLOT_PROJECT)) as ProjectState,
    );
    const record: ProjectRecord = {
      id: `demo-${now}`,
      name: 'Pracownia Splot (demo)',
      prompt: '',
      createdAt: now,
      updatedAt: now,
      status: 'ready',
      // Flagged, so it is never presented as something the user generated.
      isDemo: true,
      previewHeading: previewHeadingOf(document),
      document,
      generation: { ...emptyGeneration(), status: 'ready' },
    };
    try {
      await projectRepository.create(record);
      setActiveRecord(record);
      setSaveState('saved');
      setRoute({ name: 'editor', projectId: record.id });
      void refreshList();
    } catch (error) {
      setStorageError((error as Error).message);
    }
  }, [refreshList]);

  const renameProject = useCallback(
    async (id: string, name: string) => {
      try {
        const updated = await projectRepository.update(id, { name });
        if (activeRecord?.id === id) setActiveRecord(updated);
        void refreshList();
      } catch (error) {
        setStorageError((error as Error).message);
      }
    },
    [activeRecord?.id, refreshList],
  );

  const deleteProject = useCallback(
    async (id: string) => {
      try {
        await projectRepository.remove(id);
        if (activeRecord?.id === id) setActiveRecord(null);
        void refreshList();
      } catch (error) {
        setStorageError((error as Error).message);
      }
    },
    [activeRecord?.id, refreshList],
  );

  const backToDashboard = useCallback(() => {
    // Flush anything still pending so leaving never silently drops an edit.
    const projectId = activeRecord?.id;
    const document = pendingDocument.current;
    if (projectId && document) {
      if (autosaveTimer.current !== null) window.clearTimeout(autosaveTimer.current);
      void writeDocument(projectId, document);
    }
    generation.stopWatching();
    setRoute({ name: 'dashboard' });
    void refreshList();
  }, [activeRecord?.id, generation, refreshList, writeDocument]);

  /* ---------------------------------------------------------------- */
  /* Render                                                            */
  /* ---------------------------------------------------------------- */

  if (route.name === 'dashboard') {
    return (
      <DashboardView
        projects={projects}
        loading={loadingList}
        storageError={storageError}
        configMessage={configMessage}
        creating={creating}
        onCreate={(prompt) => void createProject(prompt)}
        onOpen={(id) => void openProject(id)}
        onRename={(id, name) => void renameProject(id, name)}
        onDelete={(id) => void deleteProject(id)}
        onLoadDemo={() => void loadDemo()}
      />
    );
  }

  if (!activeRecord) {
    return (
      <div className="min-h-screen bg-[#F6F4EF] flex items-center justify-center text-sm text-[#706C65]">
        Wczytuję projekt…
      </div>
    );
  }

  if (route.name === 'generating') {
    return (
      <GeneratingView
        projectName={activeRecord.name}
        prompt={activeRecord.prompt}
        state={generation.state}
        watching={generation.watching}
        onBackToDashboard={backToDashboard}
        onAnswer={(text) => void generation.answer(text)}
        onRetry={() => {
          resumedFor.current = null;
          void generation.start({ ...activeRecord, generation: emptyGeneration() });
        }}
        onStopWatching={generation.stopWatching}
      />
    );
  }

  if (!activeRecord.document) {
    setRoute({ name: 'generating', projectId: activeRecord.id });
    return null;
  }

  return (
    <App
      // Keyed by project: switching projects mounts a fresh editor, so
      // history, selection and camera never carry across documents.
      key={activeRecord.id}
      initialProject={activeRecord.document}
      onDocumentChange={handleDocumentChange}
      onSave={handleSaveNow}
      saveState={saveState}
      saveError={saveError}
      onBackToDashboard={backToDashboard}
    />
  );
};

export default NoderaApp;
