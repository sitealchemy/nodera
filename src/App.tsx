import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DesignTokens,
  ElementStyles,
  NodeElement,
  OpticalOffset,
  ProjectAssumption,
  ProjectState,
  ProposalComment,
  ResponsiveScope,
  ViewportDevice,
  WorkScope,
} from './types/document';
import { StorageService } from './services/storage';
import { AIAdapter, AICommandContext } from './services/aiAdapter';
import { INITIAL_SPLOT_PROJECT } from './data/splotDemo';
import { Camera, IDENTITY_CAMERA } from './lib/camera';
import { ElementAction, findNode, navigateFrom, nodeExists } from './lib/documentTree';
import { resolveOpticalOffset } from './render/resolveStyles';

import { EditorHeader } from './components/Editor/EditorHeader';
import { DrawerId, DrawerRail } from './components/Editor/DrawerRail';
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

/** Text entry must keep its native keyboard behaviour. */
function isTextEntryTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el?.tagName) return false;
  const tag = el.tagName.toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

export const App: React.FC = () => {
  const [screen, setScreen] = useState<Screen>('editor');

  // --- Document state (undoable) ------------------------------------------
  const [project, setProject] = useState<ProjectState>(() => StorageService.loadProject());
  const [historyStack, setHistoryStack] = useState<ProjectState[]>([]);
  const [futureStack, setFutureStack] = useState<ProjectState[]>([]);

  // --- UI state (never undoable, never persisted into the document) -------
  const [camera, setCamera] = useState<Camera>(IDENTITY_CAMERA);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<ElementAction | null>(null);
  const [openDrawer, setOpenDrawer] = useState<DrawerId | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [handTool, setHandTool] = useState(false);
  const [viewportDevice, setViewportDevice] = useState<ViewportDevice>('desktop');
  const [responsiveScope, setResponsiveScope] = useState<ResponsiveScope>('all');
  const [workScope] = useState<WorkScope>('all');

  const [isProposalOpen, setIsProposalOpen] = useState(false);
  const [isPublishChecklistOpen, setIsPublishChecklistOpen] = useState(false);
  const [isCodeExportOpen, setIsCodeExportOpen] = useState(false);
  const [feedback, setFeedback] = useState<CommandFeedback | null>(null);

  // Persist the document only. Camera, drawers and selection are session UI.
  useEffect(() => {
    StorageService.saveProject(project);
  }, [project]);

  const activeDirection = project.directions[project.activeDirectionId];
  const pages = useMemo(() => Object.values(activeDirection.pages), [activeDirection]);
  const activePage = activeDirection.pages[project.activePageSlug] ?? pages[0];
  const selectedNode = selectedElementId ? findNode(activePage.root, selectedElementId) : null;

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
    setProject((current) => {
      setHistoryStack((stack) => [...stack.slice(-24), JSON.parse(JSON.stringify(current))]);
      setFutureStack([]);
      return next;
    });
  }, []);

  const handleUndo = useCallback(() => {
    setHistoryStack((stack) => {
      if (stack.length === 0) return stack;
      const previous = stack[stack.length - 1];
      setProject((current) => {
        setFutureStack((future) => [JSON.parse(JSON.stringify(current)), ...future]);
        return previous;
      });
      return stack.slice(0, -1);
    });
  }, []);

  const handleRedo = useCallback(() => {
    setFutureStack((future) => {
      if (future.length === 0) return future;
      const next = future[0];
      setProject((current) => {
        setHistoryStack((stack) => [...stack, JSON.parse(JSON.stringify(current))]);
        return next;
      });
      return future.slice(1);
    });
  }, []);

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
   * global style while the inspector claimed the edit was local. Both scopes
   * now route to their own override bucket.
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

  /**
   * Optical offset, also scope-aware.
   *
   * The offset used to be a single value regardless of scope, so a nudge made
   * while editing mobile silently moved every breakpoint. Per-scope offsets
   * live in `opticalOffsets`; `opticalOffset` remains the shared value.
   */
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

  const handleUpdateTokens = useCallback(
    (delta: Partial<DesignTokens>) => {
      const draft: ProjectState = JSON.parse(JSON.stringify(project));
      draft.tokens = { ...draft.tokens, ...delta };

      if (delta.accentCopper) {
        Object.values(draft.directions).forEach((dir) => {
          Object.values(dir.pages).forEach((page) => {
            const walk = (node: NodeElement) => {
              if (node.tag === 'button' || node.tokenRef === 'buttonPrimary') {
                node.styles.backgroundColor = delta.accentCopper;
              }
              node.children?.forEach(walk);
            };
            walk(page.root);
          });
        });
      }
      if (delta.buttonRadius) {
        Object.values(draft.directions).forEach((dir) => {
          Object.values(dir.pages).forEach((page) => {
            const walk = (node: NodeElement) => {
              if (node.tag === 'button' || node.tokenRef === 'buttonPrimary') {
                node.styles.borderRadius = delta.buttonRadius;
              }
              node.children?.forEach(walk);
            };
            walk(page.root);
          });
        });
      }
      commitProjectUpdate(draft);
    },
    [project, commitProjectUpdate],
  );

  const handleExecuteAICommand = useCallback(
    (prompt: string) => {
      const context: AICommandContext = {
        projectName: project.name,
        directionName: activeDirection.name,
        pageSlug: project.activePageSlug,
        selectedElementId,
        selectedElementName: selectedNode?.name ?? null,
        actionType: 'none',
        responsiveScope,
      };
      const result = AIAdapter.executeCommand(prompt, context, project);
      if (!result.success) return;
      commitProjectUpdate(result.updatedProject);
      setFeedback({ summary: result.summary, steps: result.detailedSteps });
    },
    [project, activeDirection, selectedElementId, selectedNode, responsiveScope, commitProjectUpdate],
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

  // --- Keyboard ------------------------------------------------------------
  // Escape closes the action first, then the selection. Arrows either nudge
  // (position action) or walk the document structure.
  const selectedIdRef = useRef(selectedElementId);
  selectedIdRef.current = selectedElementId;

  useEffect(() => {
    if (screen !== 'editor') return;

    const onKeyDown = (event: KeyboardEvent) => {
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

      if (event.key === 'Escape') {
        if (activeAction) setActiveAction(null);
        else if (selectedIdRef.current) setSelectedElementId(null);
        else if (openDrawer) setOpenDrawer(null);
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

      event.preventDefault();
      if (activeAction === 'position') {
        const delta = {
          up: [0, -1],
          down: [0, 1],
          left: [-1, 0],
          right: [1, 0],
        }[direction];
        applyNudge(id, delta[0], delta[1]);
      } else {
        const next = navigateFrom(activePage.root, id, direction);
        if (next) setSelectedElementId(next.id);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [screen, activeAction, openDrawer, activePage, applyNudge, handleUndo, handleRedo]);

  // --- Routing -------------------------------------------------------------
  if (screen === 'intake') {
    return (
      <IntakeView
        onGenerateDirections={() => setScreen('directions')}
        onLoadDemoProject={() => {
          setProject(INITIAL_SPLOT_PROJECT);
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
          setProject((prev) => ({ ...prev, activeDirectionId: dirId }));
          setSelectedElementId(null);
          setActiveAction(null);
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
        onSelectPage={(slug) => setProject((prev) => ({ ...prev, activePageSlug: slug }))}
        tokens={project.tokens}
        device={viewportDevice}
        onSelectDevice={setViewportDevice}
        onBackToEditor={() => setScreen('editor')}
      />
    );
  }

  const effectiveOffset = selectedNode
    ? resolveOpticalOffset(selectedNode, responsiveScope) ?? { x: 0, y: 0 }
    : { x: 0, y: 0 };

  return (
    <div className="h-screen w-screen flex flex-col bg-[#F6F4EF] text-[#292824] overflow-hidden font-sans">
      <EditorHeader
        projectName={project.name}
        pages={pages}
        activePageSlug={project.activePageSlug}
        onSelectPage={(slug) => {
          setProject((prev) => ({ ...prev, activePageSlug: slug }));
          setSelectedElementId(null);
          setActiveAction(null);
        }}
        directions={project.directions}
        activeDirectionId={project.activeDirectionId}
        viewportDevice={viewportDevice}
        onSelectViewport={setViewportDevice}
        responsiveScope={responsiveScope}
        onSelectResponsiveScope={setResponsiveScope}
        canUndo={historyStack.length > 0}
        canRedo={futureStack.length > 0}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onOpenPreview={() => setScreen('preview')}
        onOpenProposal={() => setIsProposalOpen(true)}
        onOpenPublishChecklist={() => setIsPublishChecklistOpen(true)}
        onOpenCodeExport={() => setIsCodeExportOpen(true)}
        onOpenDirectionsView={() => setScreen('directions')}
      />

      <div className="flex-1 flex min-h-0 relative">
        <DrawerRail
          openDrawer={openDrawer}
          onToggleDrawer={(drawer) => setOpenDrawer((open) => (open === drawer ? null : drawer))}
          onCloseDrawer={() => setOpenDrawer(null)}
          pages={pages}
          activePageSlug={project.activePageSlug}
          onSelectPage={(slug) => {
            setProject((prev) => ({ ...prev, activePageSlug: slug }));
            setSelectedElementId(null);
            setActiveAction(null);
          }}
          directions={project.directions}
          activeDirectionId={project.activeDirectionId}
          onSelectDirection={(id) => {
            setProject((prev) => ({ ...prev, activeDirectionId: id }));
            setSelectedElementId(null);
            setActiveAction(null);
          }}
          rootElement={activePage.root}
          selectedElementId={selectedElementId}
          onSelectElement={setSelectedElementId}
          tokens={project.tokens}
          onUpdateTokens={handleUpdateTokens}
        />

        {/* Must be a flex container: CanvasViewport sizes itself with flex-1,
            and in a block parent it would collapse to zero height and clip
            the whole canvas away under its own overflow-hidden. */}
        <div className="flex-1 relative min-w-0 flex flex-col">
          <CanvasViewport
            root={activePage.root}
            tokens={project.tokens}
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
          onPublishSuccess={() => setProject((prev) => ({ ...prev, isPublished: true }))}
        />
      )}

      {isCodeExportOpen && (
        <CodeExportModal project={project} onClose={() => setIsCodeExportOpen(false)} />
      )}
    </div>
  );
};

export default App;
