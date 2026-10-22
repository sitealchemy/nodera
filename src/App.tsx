import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  DesignTokens,
  ElementStyles,
  NodeElement,
  OpticalOffset,
  ProjectState,
  ProposalComment,
  ResponsiveScope,
  ViewportDevice,
} from './types/document';
import { StorageService } from './services/storage';
import { AIAdapter, AICommandContext, AIExecutionResult } from './services/aiAdapter';
import { CERAMIC_IMAGES, INITIAL_SPLOT_PROJECT } from './data/splotDemo';
import { Camera, IDENTITY_CAMERA } from './lib/camera';
import { ElementAction, findNode, navigateFrom, nodeExists } from './lib/documentTree';
import {
  DocumentAction,
  DocumentState,
  canRedo as canRedoOf,
  canUndo as canUndoOf,
  createDocumentState,
  documentReducer,
} from './lib/history';
import { LinkTarget } from './lib/links';
import { resolveOpticalOffset } from './render/resolveStyles';

import { EditorHeader } from './components/Editor/EditorHeader';
import { DrawerId, DrawerRail, TreeEntry } from './components/Editor/DrawerRail';
import { CanvasViewport } from './components/Editor/CanvasViewport';
import { ActionInspector } from './components/Editor/ActionInspector';
import { CommandDock, CommandFeedback } from './components/Editor/CommandDock';

import { IntakeView } from './components/Views/IntakeView';
import { DirectionsView } from './components/Views/DirectionsView';
import { ProposalView } from './components/Views/ProposalView';
import { PublishChecklistView } from './components/Views/PublishChecklistView';
import { CodeExportModal } from './components/Views/CodeExportModal';
import { PreviewView } from './components/Views/PreviewView';

type Screen = 'intake' | 'directions' | 'editor' | 'preview';

export type SaveState = 'saved' | 'dirty' | 'saving' | 'error';

export interface EditorAppProps {
  /** The document this editor session works on. */
  initialProject: ProjectState;
  /** Called on every committed document change, for autosave. */
  onDocumentChange: (project: ProjectState) => void;
  /** Explicit save. */
  onSave: () => void;
  saveState: SaveState;
  saveError: string | null;
  onBackToDashboard: () => void;
}

/** Text entry must keep its native keyboard behaviour. */
function isTextEntryTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el?.tagName) return false;
  const tag = el.tagName.toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

/**
 * Elements whose own keyboard behaviour must not be hijacked.
 *
 * Space activates a focused button and Enter activates a focused link; a
 * global handler that swallows those breaks keyboard operation of the whole
 * interface, not just the canvas.
 */
function isInteractiveTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el?.closest) return false;
  return !!el.closest('button, a, [role="button"], [role="menuitem"], summary');
}

export const App: React.FC<EditorAppProps> = ({
  initialProject,
  onDocumentChange,
  onSave,
  saveState,
  saveError,
  onBackToDashboard,
}) => {
  const [screen, setScreen] = useState<Screen>('editor');

  // --- Document state (undoable) ------------------------------------------
  // One reducer holds project + past + future so every transition is pure and
  // atomic. Nested setState updaters with side effects double-fired under
  // StrictMode and pushed two history entries per edit.
  const [doc, dispatch] = useReducer(
    // Wrapped rather than passed by reference: the reducer is generic now
    // (a site document shares the same history machinery), and a bare
    // generic function does not bind its type parameter through useReducer's
    // lazy-initialiser overload.
    (state: DocumentState<ProjectState>, action: DocumentAction<ProjectState>) =>
      documentReducer(state, action),
    // Only the first value is used. Computing it inline keeps the generic
    // parameter inferrable, which the lazy-initialiser overload does not.
    // The component is keyed by project at the call site, so switching
    // projects mounts a fresh editor and no history leaks between documents.
    createDocumentState(initialProject),
  );
  const project = doc.project;

  // --- UI state (never undoable, never persisted into the document) -------
  const [camera, setCamera] = useState<Camera>(IDENTITY_CAMERA);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<ElementAction | null>(null);
  const [openDrawer, setOpenDrawer] = useState<DrawerId | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [handTool, setHandTool] = useState(false);
  const [viewportDevice, setViewportDevice] = useState<ViewportDevice>('desktop');
  const [responsiveScope, setResponsiveScope] = useState<ResponsiveScope>('all');
  const [pendingAnchor, setPendingAnchor] = useState<string | null>(null);

  const [isProposalOpen, setIsProposalOpen] = useState(false);
  const [isPublishChecklistOpen, setIsPublishChecklistOpen] = useState(false);
  const [isCodeExportOpen, setIsCodeExportOpen] = useState(false);
  const [feedback, setFeedback] = useState<CommandFeedback | null>(null);

  const isModalOpen = isProposalOpen || isPublishChecklistOpen || isCodeExportOpen;

  // The document now belongs to the project repository, so the editor reports
  // changes upwards instead of writing storage itself.
  //
  // The guard compares identity with the document we were handed: the reducer
  // only replaces `project` on a real edit. A one-shot "first render" flag
  // does not survive StrictMode's mount/cleanup/mount cycle, and reported a
  // phantom change that marked a freshly opened project as unsaved.
  useEffect(() => {
    if (project === initialProject) return;
    onDocumentChange(project);
  }, [project, initialProject, onDocumentChange]);

  const activeDirection = project.directions[project.activeDirectionId];
  const pages = useMemo(() => Object.values(activeDirection.pages), [activeDirection]);
  const activePage = activeDirection.pages[project.activePageSlug] ?? pages[0];

  // The drawer rail describes any document through the same small shape, so
  // the node tree is adapted here rather than the panel knowing about nodes.
  const treeEntries = useMemo((): TreeEntry => {
    const toEntry = (node: NodeElement): TreeEntry => ({
      id: node.id,
      tag: node.tag,
      label: node.name,
      children: node.children?.map(toEntry),
    });
    return toEntry(activePage.root);
  }, [activePage.root]);

  const demoAssets = useMemo(
    () => Object.entries(CERAMIC_IMAGES).map(([name, url]) => ({ name, url })),
    [],
  );
  const selectedNode = selectedElementId ? findNode(activePage.root, selectedElementId) : null;
  const pageSlugs = useMemo(() => pages.map((page) => page.slug), [pages]);

  /** The tokens that apply right now: this direction's own. */
  const activeTokens = activeDirection.tokens ?? project.tokens;

  // A selection that no longer exists (page or direction changed) is dropped
  // rather than left pointing at a stale id.
  useEffect(() => {
    if (selectedElementId && !nodeExists(activePage.root, selectedElementId)) {
      setSelectedElementId(null);
      setActiveAction(null);
    }
  }, [activePage, selectedElementId]);

  // --- Document mutation ---------------------------------------------------
  const commitProjectUpdate = useCallback((next: ProjectState) => {
    dispatch({ type: 'commit', next });
  }, []);

  const handleUndo = useCallback(() => dispatch({ type: 'undo' }), []);
  const handleRedo = useCallback(() => dispatch({ type: 'redo' }), []);

  /** Clone the project and hand the caller the selected node inside the clone. */
  const mutateSelectedNode = useCallback(
    (mutator: (node: NodeElement, draft: ProjectState) => void) => {
      if (!selectedElementId) return;
      const draft: ProjectState = JSON.parse(JSON.stringify(project));
      const page = draft.directions[draft.activeDirectionId].pages[draft.activePageSlug];
      const node = page ? findNode(page.root, selectedElementId) : null;
      if (!node) return;
      mutator(node, draft);
      commitProjectUpdate(draft);
    },
    [project, selectedElementId, commitProjectUpdate],
  );

  const handleUpdateElementContent = useCallback(
    (content: string) => {
      mutateSelectedNode((node) => {
        node.content = content;
      });
    },
    [mutateSelectedNode],
  );

  /**
   * Writes a style edit to the scope the UI is showing.
   *
   * Previously only `mobile` was handled, so choosing "tablet" silently wrote a
   * global style while the inspector claimed the edit was local.
   */
  const handleUpdateElementStyles = useCallback(
    (styles: Partial<ElementStyles>) => {
      mutateSelectedNode((node) => {
        if (responsiveScope === 'all') {
          node.styles = { ...node.styles, ...styles };
          return;
        }
        node.responsiveOverrides = node.responsiveOverrides ?? {};
        node.responsiveOverrides[responsiveScope] = {
          ...node.responsiveOverrides[responsiveScope],
          ...styles,
        };
      });
    },
    [mutateSelectedNode, responsiveScope],
  );

  /** Optical offset, also scope-aware. */
  const applyNudge = useCallback(
    (nodeId: string, dx: number, dy: number) => {
      const draft: ProjectState = JSON.parse(JSON.stringify(project));
      const page = draft.directions[draft.activeDirectionId].pages[draft.activePageSlug];
      const node = page ? findNode(page.root, nodeId) : null;
      if (!node) return;

      const current = resolveOpticalOffset(node, responsiveScope) ?? { x: 0, y: 0 };
      const next: OpticalOffset = { x: current.x + dx, y: current.y + dy };

      if (responsiveScope === 'all') {
        node.opticalOffset = next;
      } else {
        node.opticalOffsets = node.opticalOffsets ?? {};
        node.opticalOffsets[responsiveScope] = next;
      }
      commitProjectUpdate(draft);
    },
    [project, responsiveScope, commitProjectUpdate],
  );

  const handleResetNudge = useCallback(() => {
    mutateSelectedNode((node) => {
      if (responsiveScope === 'all') {
        node.opticalOffset = { x: 0, y: 0 };
      } else if (node.opticalOffsets) {
        delete node.opticalOffsets[responsiveScope];
      }
    });
  }, [mutateSelectedNode, responsiveScope]);

  /**
   * Token edits apply to the ACTIVE DIRECTION only.
   *
   * This used to walk `Object.values(draft.directions)` and repaint every
   * page of every direction, so trying one accent colour destroyed the other
   * two concepts. Each direction now owns its token object.
   */
  const handleUpdateTokens = useCallback(
    (delta: Partial<DesignTokens>) => {
      const draft: ProjectState = JSON.parse(JSON.stringify(project));
      const direction = draft.directions[draft.activeDirectionId];
      const nextTokens = { ...(direction.tokens ?? draft.tokens), ...delta };
      direction.tokens = nextTokens;
      // Mirrored for components that read the project-level field.
      draft.tokens = nextTokens;

      const paintButtons = (apply: (node: NodeElement) => void) => {
        Object.values(direction.pages).forEach((page) => {
          const walk = (node: NodeElement) => {
            if (node.tag === 'button' || node.tokenRef === 'buttonPrimary') apply(node);
            node.children?.forEach(walk);
          };
          walk(page.root);
        });
      };

      if (delta.accentCopper) {
        paintButtons((node) => {
          node.styles.backgroundColor = delta.accentCopper;
        });
      }
      if (delta.buttonRadius) {
        paintButtons((node) => {
          node.styles.borderRadius = delta.buttonRadius;
        });
      }

      commitProjectUpdate(draft);
    },
    [project, commitProjectUpdate],
  );

  /** Switching direction also restores that direction's own look. */
  const handleSelectDirection = useCallback(
    (directionId: string) => {
      const draft: ProjectState = JSON.parse(JSON.stringify(project));
      draft.activeDirectionId = directionId;
      const direction = draft.directions[directionId];
      if (direction?.tokens) draft.tokens = JSON.parse(JSON.stringify(direction.tokens));
      // Keep the current page if the new direction has it.
      if (!direction.pages[draft.activePageSlug]) {
        draft.activePageSlug = Object.keys(direction.pages)[0];
      }
      setSelectedElementId(null);
      setActiveAction(null);
      dispatch({ type: 'navigate', next: draft });
    },
    [project],
  );

  const handleSelectPage = useCallback(
    (slug: string) => {
      if (slug === project.activePageSlug) return;
      const draft: ProjectState = JSON.parse(JSON.stringify(project));
      draft.activePageSlug = slug;
      setSelectedElementId(null);
      setActiveAction(null);
      dispatch({ type: 'navigate', next: draft });
    },
    [project],
  );

  /** Navigation coming from a link inside the rendered document. */
  const handleDocumentNavigate = useCallback(
    (target: LinkTarget) => {
      switch (target.kind) {
        case 'page':
          handleSelectPage(target.slug);
          setPendingAnchor(target.hash);
          break;
        case 'anchor':
          setPendingAnchor(target.hash);
          break;
        case 'external':
          // Opened deliberately, in a new context, with the opener severed.
          window.open(target.href, '_blank', 'noopener,noreferrer');
          break;
        default:
          break;
      }
    },
    [handleSelectPage],
  );

  const handleExecuteAICommand = useCallback(
    (prompt: string): AIExecutionResult => {
      const context: AICommandContext = {
        projectName: project.name,
        directionName: activeDirection.name,
        pageSlug: project.activePageSlug,
        selectedElementId,
        selectedElementName: selectedNode?.name ?? null,
        // The action the user actually has open, not a hardcoded 'none'.
        actionType: activeAction ?? 'none',
        responsiveScope,
      };
      const result = AIAdapter.executeCommand(prompt, context, project);

      // Only a real change touches the document or the history.
      if (result.kind === 'applied' && result.updatedProject) {
        commitProjectUpdate(result.updatedProject);
      }
      setFeedback({
        kind: result.kind,
        summary: result.summary,
        steps: result.detailedSteps,
      });
      return result;
    },
    [
      project,
      activeDirection,
      selectedElementId,
      selectedNode,
      responsiveScope,
      activeAction,
      commitProjectUpdate,
    ],
  );

  const handleAddComment = useCallback(
    (comment: ProposalComment) => {
      const draft: ProjectState = JSON.parse(JSON.stringify(project));
      draft.comments.unshift(comment);
      commitProjectUpdate(draft);
    },
    [project, commitProjectUpdate],
  );

  const handleCreateSnapshot = useCallback(
    (title: string) => {
      const draft: ProjectState = JSON.parse(JSON.stringify(project));
      draft.snapshots.push(StorageService.createSnapshot(draft, title));
      commitProjectUpdate(draft);
    },
    [project, commitProjectUpdate],
  );

  /**
   * The editor shell behind an open modal is marked `inert`.
   *
   * Blocking the app's own shortcuts is not enough: the browser keeps its own
   * undo stack, and Ctrl+Z with focus on <body> re-focuses the last edited
   * field — the inspector's textarea, still mounted behind the dialog — and
   * reverts it, which fires onChange and silently rewrites the document.
   * `inert` removes the background from focus and interaction entirely, so
   * there is nothing there for the browser to undo into.
   */
  const shellRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    if (isModalOpen) shell.setAttribute('inert', '');
    else shell.removeAttribute('inert');
  }, [isModalOpen]);

  // --- Keyboard ------------------------------------------------------------
  const selectedIdRef = useRef(selectedElementId);
  selectedIdRef.current = selectedElementId;

  useEffect(() => {
    if (screen !== 'editor') return;

    const onKeyDown = (event: KeyboardEvent) => {
      // A modal owns the keyboard while it is open: editor shortcuts must not
      // reach through and modify the page behind it.
      if (isModalOpen) return;

      // Escape is handled before the text-entry guard. It is a dismiss key,
      // not a typing key, so it must still close an open action while the
      // caret sits in the inspector's own field — otherwise the action the
      // user just opened cannot be closed from the keyboard at all.
      // Fields that need Escape for themselves (the command dock) stop the
      // event before it reaches this window listener.
      if (event.key === 'Escape') {
        if (activeAction) {
          setActiveAction(null);
          (document.activeElement as HTMLElement | null)?.blur?.();
        } else if (selectedIdRef.current) {
          setSelectedElementId(null);
        } else if (openDrawer) {
          setOpenDrawer(null);
        }
        return;
      }

      if (isTextEntryTarget(event.target)) return;

      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) handleRedo();
        else handleUndo();
        return;
      }
      if (mod && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        handleRedo();
        return;
      }

      const id = selectedIdRef.current;
      if (!id) return;

      const arrows: Record<string, 'up' | 'down' | 'left' | 'right'> = {
        ArrowUp: 'up',
        ArrowDown: 'down',
        ArrowLeft: 'left',
        ArrowRight: 'right',
      };
      const direction = arrows[event.key];
      if (!direction) return;

      // Arrow keys move focus inside menus and toolbars; leave those alone.
      if (isInteractiveTarget(event.target)) return;

      event.preventDefault();
      if (activeAction === 'position') {
        const delta = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[direction];
        applyNudge(id, delta[0], delta[1]);
      } else {
        const next = navigateFrom(activePage.root, id, direction);
        if (next) setSelectedElementId(next.id);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    screen,
    isModalOpen,
    activeAction,
    openDrawer,
    activePage,
    applyNudge,
    handleUndo,
    handleRedo,
  ]);

  // --- Routing -------------------------------------------------------------
  if (screen === 'intake') {
    return (
      <IntakeView
        onGenerateDirections={() => setScreen('directions')}
        onLoadDemoProject={() => {
          dispatch({ type: 'reset', next: StorageService.migrateProject(INITIAL_SPLOT_PROJECT) });
          setScreen('editor');
        }}
      />
    );
  }

  if (screen === 'directions') {
    return (
      <DirectionsView
        directions={project.directions}
        activeDirectionId={project.activeDirectionId}
        onSelectDirectionAndOpenEditor={(dirId) => {
          handleSelectDirection(dirId);
          setScreen('editor');
        }}
        onBackToIntake={() => setScreen('intake')}
      />
    );
  }

  if (screen === 'preview') {
    return (
      <PreviewView
        pages={pages}
        activePageSlug={project.activePageSlug}
        onSelectPage={handleSelectPage}
        tokens={activeTokens}
        device={viewportDevice}
        onSelectDevice={setViewportDevice}
        onBackToEditor={() => setScreen('editor')}
        onNavigate={handleDocumentNavigate}
        pendingAnchor={pendingAnchor}
        onAnchorConsumed={() => setPendingAnchor(null)}
      />
    );
  }

  const effectiveOffset = selectedNode
    ? resolveOpticalOffset(selectedNode, responsiveScope) ?? { x: 0, y: 0 }
    : { x: 0, y: 0 };

  return (
    <div className="h-screen w-screen flex flex-col bg-[#F6F4EF] text-[#292824] overflow-hidden font-sans">
      <div ref={shellRef} className="flex-1 flex flex-col min-h-0">
      <EditorHeader
        projectName={project.name}
        pages={pages}
        activePageSlug={project.activePageSlug}
        onSelectPage={handleSelectPage}
        directionHint={project.directions[project.activeDirectionId]?.name}
        viewportDevice={viewportDevice}
        onSelectViewport={setViewportDevice}
        responsiveScope={responsiveScope}
        onSelectResponsiveScope={setResponsiveScope}
        canUndo={canUndoOf(doc)}
        canRedo={canRedoOf(doc)}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onOpenPreview={() => setScreen('preview')}
        onOpenProposal={() => setIsProposalOpen(true)}
        onOpenPublishChecklist={() => setIsPublishChecklistOpen(true)}
        onOpenCodeExport={() => setIsCodeExportOpen(true)}
        onOpenDirectionsView={() => setScreen('directions')}
        onBackToDashboard={onBackToDashboard}
        onSave={onSave}
        saveState={saveState}
        saveError={saveError}
      />

      <div className="flex-1 flex min-h-0 relative">
        <DrawerRail
          openDrawer={openDrawer}
          onToggleDrawer={(drawer) => setOpenDrawer((open) => (open === drawer ? null : drawer))}
          onCloseDrawer={() => setOpenDrawer(null)}
          pages={pages}
          activePageSlug={project.activePageSlug}
          onSelectPage={handleSelectPage}
          directions={project.directions}
          activeDirectionId={project.activeDirectionId}
          onSelectDirection={handleSelectDirection}
          tree={treeEntries}
          selectedElementId={selectedElementId}
          onSelectElement={setSelectedElementId}
          assets={demoAssets}
          tokens={activeTokens}
          onUpdateTokens={handleUpdateTokens}
          responsiveScope={responsiveScope}
        />

        {/* Must be a flex container: CanvasViewport sizes itself with flex-1,
            and in a block parent it would collapse to zero height and clip
            the whole canvas away under its own overflow-hidden. */}
        <div className="flex-1 relative min-w-0 flex flex-col">
          <CanvasViewport
            root={activePage.root}
            tokens={activeTokens}
            device={viewportDevice}
            camera={camera}
            onCameraChange={setCamera}
            selectedElementId={selectedElementId}
            onSelectElement={setSelectedElementId}
            activeAction={activeAction}
            onChooseAction={setActiveAction}
            selectMode={selectMode}
            onToggleSelectMode={() => setSelectMode((on) => !on)}
            handTool={handTool}
            onToggleHandTool={() => setHandTool((on) => !on)}
          />

          <CommandDock
            pageName={activePage.name}
            selectedElementName={selectedNode?.name ?? null}
            activeAction={activeAction}
            responsiveScope={responsiveScope}
            onSubmitCommand={handleExecuteAICommand}
            feedback={feedback}
            onUndoLastAction={() => {
              handleUndo();
              setFeedback(null);
            }}
            onDismissFeedback={() => setFeedback(null)}
          />
        </div>

        {selectedNode && activeAction && (
          <ActionInspector
            node={selectedNode}
            action={activeAction}
            responsiveScope={responsiveScope}
            effectiveOffset={effectiveOffset}
            onClose={() => setActiveAction(null)}
            onUpdateContent={handleUpdateElementContent}
            onUpdateStyles={handleUpdateElementStyles}
            onNudge={(dx, dy) => selectedElementId && applyNudge(selectedElementId, dx, dy)}
            onResetNudge={handleResetNudge}
          />
        )}
      </div>

      </div>

      {isProposalOpen && (
        <ProposalView
          project={project}
          onClose={() => setIsProposalOpen(false)}
          onAddComment={handleAddComment}
          onUpdateSnapshot={handleCreateSnapshot}
        />
      )}

      {isPublishChecklistOpen && (
        <PublishChecklistView
          project={project}
          onClose={() => setIsPublishChecklistOpen(false)}
          onPublishSuccess={() =>
            commitProjectUpdate({ ...project, isPublished: true })
          }
        />
      )}

      {isCodeExportOpen && (
        <CodeExportModal project={project} onClose={() => setIsCodeExportOpen(false)} />
      )}
    </div>
  );
};

export default App;
