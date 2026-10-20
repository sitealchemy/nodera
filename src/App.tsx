import React, { useState, useEffect } from 'react';
import { 
  ProjectState, 
  ViewportDevice, 
  ResponsiveScope, 
  WorkScope, 
  NodeElement, 
  ProposalComment,
  ProjectAssumption,
  DesignTokens
} from './types/document';
import { StorageService } from './services/storage';
import { AIAdapter, AICommandContext } from './services/aiAdapter';
import { INITIAL_SPLOT_PROJECT } from './data/splotDemo';

import { TopBar } from './components/Editor/TopBar';
import { BottomBar } from './components/Editor/BottomBar';
import { Canvas } from './components/Editor/Canvas';
import { SidebarLeft } from './components/Editor/SidebarLeft';
import { SidebarRight } from './components/Editor/SidebarRight';

import { IntakeView } from './components/Views/IntakeView';
import { DirectionsView } from './components/Views/DirectionsView';
import { ProposalView } from './components/Views/ProposalView';
import { PublishChecklistView } from './components/Views/PublishChecklistView';
import { CodeExportModal } from './components/Views/CodeExportModal';

export const App: React.FC = () => {
  // Screen routing: 'intake' | 'directions' | 'editor'
  const [screen, setScreen] = useState<'intake' | 'directions' | 'editor'>('editor');

  // Central project state
  const [project, setProject] = useState<ProjectState>(() => StorageService.loadProject());

  // History stack for undo/redo
  const [historyStack, setHistoryStack] = useState<ProjectState[]>([]);
  const [futureStack, setFutureStack] = useState<ProjectState[]>([]);

  // Editor states
  const [selectedElementId, setSelectedElementId] = useState<string | null>('materia-hero-heading');
  const [viewportDevice, setViewportDevice] = useState<ViewportDevice>('desktop');
  const [responsiveScope, setResponsiveScope] = useState<ResponsiveScope>('all');
  const [workScope, setWorkScope] = useState<WorkScope>('all');
  const [xrayMode, setXrayMode] = useState(false);
  const [focusMode, setFocusMode] = useState(false);

  // Modals
  const [isProposalOpen, setIsProposalOpen] = useState(false);
  const [isPublishChecklistOpen, setIsPublishChecklistOpen] = useState(false);
  const [isCodeExportOpen, setIsCodeExportOpen] = useState(false);

  // Last AI feedback
  const [lastExecutionFeedback, setLastExecutionFeedback] = useState<{
    summary: string;
    steps: string[];
  } | null>(null);

  // Persist project changes
  useEffect(() => {
    StorageService.saveProject(project);
  }, [project]);

  // Helper to commit state with undo
  const commitProjectUpdate = (newProject: ProjectState, isUndoOperation = false) => {
    if (!isUndoOperation) {
      setHistoryStack(prev => [...prev.slice(-25), JSON.parse(JSON.stringify(project))]);
      setFutureStack([]);
    }
    setProject(newProject);
  };

  const handleUndo = () => {
    if (historyStack.length === 0) return;
    const previous = historyStack[historyStack.length - 1];
    const newHistory = historyStack.slice(0, historyStack.length - 1);
    setFutureStack(prev => [JSON.parse(JSON.stringify(project)), ...prev]);
    setHistoryStack(newHistory);
    setProject(previous);
  };

  const handleRedo = () => {
    if (futureStack.length === 0) return;
    const next = futureStack[0];
    const newFuture = futureStack.slice(1);
    setHistoryStack(prev => [...prev, JSON.parse(JSON.stringify(project))]);
    setFutureStack(newFuture);
    setProject(next);
  };

  // Find node helper
  const findNodeRecursive = (node: NodeElement, id: string): NodeElement | null => {
    if (node.id === id) return node;
    if (node.children) {
      for (const child of node.children) {
        const found = findNodeRecursive(child, id);
        if (found) return found;
      }
    }
    return null;
  };

  const activeDirection = project.directions[project.activeDirectionId];
  const activePage = activeDirection.pages[project.activePageSlug] || Object.values(activeDirection.pages)[0];
  const selectedNode = selectedElementId ? findNodeRecursive(activePage.root, selectedElementId) : null;

  // Actions
  const handleNudgeElement = (id: string, dx: number, dy: number) => {
    const cloned: ProjectState = JSON.parse(JSON.stringify(project));
    const target = findNodeRecursive(cloned.directions[cloned.activeDirectionId].pages[cloned.activePageSlug].root, id);
    if (!target) return;

    target.opticalOffset = target.opticalOffset || { x: 0, y: 0 };
    target.opticalOffset.x += dx;
    target.opticalOffset.y += dy;

    commitProjectUpdate(cloned);
  };

  const handleResetNudge = () => {
    if (!selectedElementId) return;
    const cloned: ProjectState = JSON.parse(JSON.stringify(project));
    const target = findNodeRecursive(cloned.directions[cloned.activeDirectionId].pages[cloned.activePageSlug].root, selectedElementId);
    if (!target) return;
    target.opticalOffset = { x: 0, y: 0 };
    commitProjectUpdate(cloned);
  };

  const handleUpdateElementContent = (newContent: string) => {
    if (!selectedElementId) return;
    const cloned: ProjectState = JSON.parse(JSON.stringify(project));
    const target = findNodeRecursive(cloned.directions[cloned.activeDirectionId].pages[cloned.activePageSlug].root, selectedElementId);
    if (!target) return;
    target.content = newContent;
    commitProjectUpdate(cloned);
  };

  const handleUpdateElementStyles = (styles: any) => {
    if (!selectedElementId) return;
    const cloned: ProjectState = JSON.parse(JSON.stringify(project));
    const target = findNodeRecursive(cloned.directions[cloned.activeDirectionId].pages[cloned.activePageSlug].root, selectedElementId);
    if (!target) return;

    if (responsiveScope === 'mobile') {
      target.responsiveOverrides = target.responsiveOverrides || {};
      target.responsiveOverrides.mobile = { ...target.responsiveOverrides.mobile, ...styles };
    } else {
      target.styles = { ...target.styles, ...styles };
    }
    commitProjectUpdate(cloned);
  };

  // AI Command execution
  const handleExecuteAICommand = (prompt: string) => {
    const ctx: AICommandContext = {
      projectName: project.name,
      directionName: activeDirection.name,
      pageSlug: project.activePageSlug,
      selectedElementId,
      selectedElementName: selectedNode ? selectedNode.name : null,
      actionType: 'none',
      responsiveScope
    };

    const res = AIAdapter.executeCommand(prompt, ctx, project);
    if (res.success) {
      commitProjectUpdate(res.updatedProject);
      setLastExecutionFeedback({
        summary: res.summary,
        steps: res.detailedSteps
      });
    }
  };

  // Global design token updating
  const handleUpdateTokens = (tokenDelta: Partial<DesignTokens>) => {
    const cloned: ProjectState = JSON.parse(JSON.stringify(project));
    cloned.tokens = { ...cloned.tokens, ...tokenDelta };

    // If accent color changed, update all buttons across project
    if (tokenDelta.accentCopper) {
      Object.values(cloned.directions).forEach(dir => {
        Object.values(dir.pages).forEach(page => {
          const updateNodes = (n: NodeElement) => {
            if (n.tag === 'button' || n.tokenRef === 'buttonPrimary') {
              n.styles.backgroundColor = tokenDelta.accentCopper;
            }
            if (n.children) n.children.forEach(updateNodes);
          };
          updateNodes(page.root);
        });
      });
    }

    commitProjectUpdate(cloned);
  };

  // Snapshots & Comments
  const handleAddComment = (comment: ProposalComment) => {
    const cloned: ProjectState = JSON.parse(JSON.stringify(project));
    cloned.comments.unshift(comment);
    commitProjectUpdate(cloned);
  };

  const handleCreateSnapshot = (title: string) => {
    const cloned: ProjectState = JSON.parse(JSON.stringify(project));
    const snap = StorageService.createSnapshot(cloned, title);
    cloned.snapshots.push(snap);
    commitProjectUpdate(cloned);
  };

  // Route Views
  if (screen === 'intake') {
    return (
      <IntakeView
        onGenerateDirections={(notes, assumptions) => {
          setScreen('directions');
        }}
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
          setProject(prev => ({ ...prev, activeDirectionId: dirId }));
          setScreen('editor');
        }}
        onBackToIntake={() => setScreen('intake')}
      />
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-[#F6F4EF] text-[#292824] overflow-hidden select-none font-sans">
      
      {/* Top Bar */}
      <TopBar
        projectName={project.name}
        directions={project.directions}
        activeDirectionId={project.activeDirectionId}
        onSelectDirection={(dirId) => setProject(prev => ({ ...prev, activeDirectionId: dirId }))}
        pages={Object.keys(activeDirection.pages)}
        activePageSlug={project.activePageSlug}
        onSelectPage={(slug) => setProject(prev => ({ ...prev, activePageSlug: slug }))}
        viewportDevice={viewportDevice}
        onSelectViewport={setViewportDevice}
        responsiveScope={responsiveScope}
        onSelectResponsiveScope={setResponsiveScope}
        canUndo={historyStack.length > 0}
        canRedo={futureStack.length > 0}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onOpenProposal={() => setIsProposalOpen(true)}
        onOpenPublishChecklist={() => setIsPublishChecklistOpen(true)}
        onOpenCodeExport={() => setIsCodeExportOpen(true)}
        onOpenDirectionsView={() => setScreen('directions')}
      />

      {/* Main Workspace (Left Drawer + Central Canvas + Right Drawer) */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left Drawer */}
        <SidebarLeft
          pages={activeDirection.pages}
          activePageSlug={project.activePageSlug}
          onSelectPage={(slug) => setProject(prev => ({ ...prev, activePageSlug: slug }))}
          directions={project.directions}
          activeDirectionId={project.activeDirectionId}
          onSelectDirection={(id) => setProject(prev => ({ ...prev, activeDirectionId: id }))}
          rootElement={activePage.root}
          selectedElementId={selectedElementId}
          onSelectElement={setSelectedElementId}
          tokens={project.tokens}
          onUpdateTokens={handleUpdateTokens}
        />

        {/* Central Canvas */}
        <Canvas
          rootElement={activePage.root}
          selectedElementId={selectedElementId}
          onSelectElement={setSelectedElementId}
          viewportDevice={viewportDevice}
          responsiveScope={responsiveScope}
          workScope={workScope}
          tokens={project.tokens}
          xrayMode={xrayMode}
          focusMode={focusMode}
          onNudgeElement={handleNudgeElement}
          onUpdateElementContent={handleUpdateElementContent}
        />

        {/* Right Precision Inspector */}
        <SidebarRight
          selectedElement={selectedNode}
          onDeselect={() => setSelectedElementId(null)}
          onUpdateStyles={handleUpdateElementStyles}
          onUpdateContent={handleUpdateElementContent}
          onNudge={(dx, dy) => {
            if (selectedElementId) handleNudgeElement(selectedElementId, dx, dy);
          }}
          onResetNudge={handleResetNudge}
          responsiveScope={responsiveScope}
        />

      </div>

      {/* Bottom Command Bar */}
      <BottomBar
        projectName={project.name}
        pageName={activePage.name}
        selectedElementName={selectedNode ? selectedNode.name : null}
        responsiveScope={responsiveScope}
        workScope={workScope}
        onSubmitCommand={handleExecuteAICommand}
        lastExecutionFeedback={lastExecutionFeedback}
        onUndoLastAction={handleUndo}
      />

      {/* Modals */}
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
          onPublishSuccess={() => {
            setProject(prev => ({ ...prev, isPublished: true }));
          }}
        />
      )}

      {isCodeExportOpen && (
        <CodeExportModal
          project={project}
          onClose={() => setIsCodeExportOpen(false)}
        />
      )}

    </div>
  );
};

export default App;
