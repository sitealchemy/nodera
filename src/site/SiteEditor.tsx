import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AlertTriangle, FileText } from 'lucide-react';
import { Camera, IDENTITY_CAMERA } from '../lib/camera';
import { ElementAction } from '../lib/documentTree';
import {
  DocumentAction,
  DocumentState,
  canRedo as canRedoOf,
  canUndo as canUndoOf,
  createDocumentState,
  documentReducer,
} from '../lib/history';
import { EditorHeader } from '../components/Editor/EditorHeader';
import { DrawerId, DrawerRail } from '../components/Editor/DrawerRail';
import { CommandDock } from '../components/Editor/CommandDock';
import { SelectionDescriptor } from '../components/Editor/SelectionOverlay';
import { SITE_DOCUMENT_CAPABILITIES, siteActionsFor } from '../editor/capabilities';
import { ViewportDevice } from '../types/document';
import { PREVIEW_WIDTHS, SiteCanvas } from './SiteCanvas';
import { SiteActionInspector } from './SiteActionInspector';
import { SitePreview } from './SitePreview';
import { ConversionReportModal } from './ConversionReportModal';
import { SiteDocument } from './types';
import {
  describeSelection,
  exportSite,
  labelFor,
  overridesFor,
  setImage,
  setStyle,
  setText,
} from './editSite';
import { buildOutline, findEntry } from './outline';
import { parseHtml, serialise } from './ingest';

/**
 * The editor for a page Manus designed.
 *
 * Deliberately not a screen of its own any more: it composes the same header,
 * drawer rail, canvas chrome, selection overlay and contextual inspector as
 * the node editor. Only the document underneath differs, so only the panel
 * contents differ. Everything the workspace offers is either here and working,
 * or visibly off with the reason why — see `editor/capabilities.ts`.
 */

export type SaveState = 'saved' | 'dirty' | 'saving' | 'error';

export interface SiteEditorProps {
  initialSite: SiteDocument;
  projectName: string;
  onDocumentChange: (site: SiteDocument) => void;
  onSave: () => void;
  saveState: SaveState;
  saveError: string | null;
  onBackToDashboard: () => void;
}

/** The preview width control is shared with the node editor's device switch. */
const DEVICE_WIDTH: Record<ViewportDevice, keyof typeof PREVIEW_WIDTHS> = {
  desktop: 'desktop',
  tablet: 'tablet',
  mobile: 'mobile',
};

export const SiteEditor: React.FC<SiteEditorProps> = ({
  initialSite,
  projectName,
  onDocumentChange,
  onSave,
  saveState,
  saveError,
  onBackToDashboard,
}) => {
  const [doc, dispatch] = useReducer(
    (state: DocumentState<SiteDocument>, action: DocumentAction<SiteDocument>) =>
      documentReducer(state, action),
    createDocumentState(initialSite),
  );
  const site = doc.project;

  const [camera, setCamera] = useState<Camera>(IDENTITY_CAMERA);
  const [device, setDevice] = useState<ViewportDevice>('desktop');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<ElementAction | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [handTool, setHandTool] = useState(false);
  const [openDrawer, setOpenDrawer] = useState<DrawerId | null>(null);
  const [screen, setScreen] = useState<'editor' | 'preview'>('editor');
  const [reportOpen, setReportOpen] = useState(false);

  // Report changes upwards; mounting is not an edit.
  useEffect(() => {
    if (site === initialSite) return;
    onDocumentChange(site);
  }, [site, initialSite, onDocumentChange]);

  const commit = useCallback((next: SiteDocument) => dispatch({ type: 'commit', next }), []);

  /* ---------------------------------------------------------------- */
  /* Derived views of the document                                     */
  /* ---------------------------------------------------------------- */

  const outline = useMemo(() => buildOutline(site, parseHtml), [site]);

  const selection = useMemo(
    () => (selectedId ? describeSelection(site, selectedId, parseHtml) : null),
    [site, selectedId],
  );

  const describe = useCallback(
    (nodeId: string): SelectionDescriptor | null => {
      const entry = findEntry(outline, nodeId);
      if (entry) return { id: entry.id, tag: entry.tag, label: entry.label };
      // The outline skips a few tags; the overlay should still label a hit.
      const hit = describeSelection(site, nodeId, parseHtml);
      return hit ? { id: nodeId, tag: hit.tagName, label: labelFor(hit) } : null;
    },
    [outline, site],
  );

  const availableActions = useMemo((): ElementAction[] => {
    if (!selection) return [];
    return siteActionsFor({
      hasOwnText: selection.text !== null,
      isImage: selection.image !== null,
    });
  }, [selection]);

  // Blob URLs for the asset panel and the image picker, made once per asset
  // list: minting them inline would leak one per keystroke in the inspector.
  const images = useMemo(
    () =>
      site.assets
        .filter((asset) => asset.contentType.startsWith('image/'))
        .map((asset) => ({ ...asset, thumbnail: URL.createObjectURL(asset.blob) })),
    [site.assets],
  );
  useEffect(() => () => images.forEach((asset) => URL.revokeObjectURL(asset.thumbnail)), [images]);

  const drawerAssets = useMemo(
    () =>
      images.map((asset) => ({
        name: asset.path.split('/').pop() ?? asset.path,
        url: asset.thumbnail,
      })),
    [images],
  );

  /* ---------------------------------------------------------------- */
  /* Actions                                                           */
  /* ---------------------------------------------------------------- */

  const handleSelect = useCallback((nodeId: string | null) => {
    setSelectedId(nodeId);
    // Clearing the selection closes its panel, so a stale inspector never
    // sits open over nothing.
    if (nodeId === null) setActiveAction(null);
  }, []);

  const handleExport = useCallback(async () => {
    const files = exportSite(site, parseHtml, serialise);
    // One file at a time: a zip would need a dependency, and the export is
    // small enough that the browser's own download does the job.
    for (const file of files) {
      const blob = file.blob ?? new Blob([file.text ?? ''], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = file.path.split('/').pop() ?? 'plik';
      anchor.click();
      URL.revokeObjectURL(url);
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
  }, [site]);

  // Undo/redo and Escape from the keyboard, with text fields left alone.
  const hasSelection = useRef(false);
  hasSelection.current = selectedId !== null;
  const actionOpen = useRef(false);
  actionOpen.current = activeAction !== null;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        !!target &&
        (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable);

      if (event.key === 'Escape') {
        // Same order as the node editor: the open action first, then the
        // selection, so Escape never throws away two things at once.
        if (actionOpen.current) setActiveAction(null);
        else if (hasSelection.current) setSelectedId(null);
        return;
      }
      if (typing) return;

      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        dispatch({ type: event.shiftKey ? 'redo' : 'undo' });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  /* ---------------------------------------------------------------- */
  /* Render                                                            */
  /* ---------------------------------------------------------------- */

  if (screen === 'preview') {
    return (
      <SitePreview
        site={site}
        device={device}
        onSelectDevice={setDevice}
        onBackToEditor={() => setScreen('editor')}
      />
    );
  }

  const limitationCount = site.report.limitations.length + site.report.missingAssets.length;
  const entryPage = [{ slug: site.entry, name: site.entry }];

  return (
    <div className="h-screen w-screen flex flex-col bg-[#F6F4EF] text-[#292824] overflow-hidden font-sans">
      <EditorHeader
        projectName={projectName}
        documentBadge="Strona z Manusa"
        pages={entryPage}
        activePageSlug={site.entry}
        onSelectPage={() => {}}
        unsupported={SITE_DOCUMENT_CAPABILITIES}
        extraMenuItems={[
          {
            icon: limitationCount > 0 ? AlertTriangle : FileText,
            label: 'Raport konwersji',
            hint: limitationCount > 0 ? String(limitationCount) : undefined,
            action: () => setReportOpen(true),
          },
        ]}
        viewportDevice={device}
        onSelectViewport={setDevice}
        responsiveScope="all"
        onSelectResponsiveScope={() => {}}
        canUndo={canUndoOf(doc)}
        canRedo={canRedoOf(doc)}
        onUndo={() => dispatch({ type: 'undo' })}
        onRedo={() => dispatch({ type: 'redo' })}
        onOpenPreview={() => setScreen('preview')}
        onOpenCodeExport={() => void handleExport()}
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
          pages={entryPage}
          activePageSlug={site.entry}
          onSelectPage={() => {}}
          tree={outline}
          selectedElementId={selectedId}
          onSelectElement={handleSelect}
          assets={drawerAssets}
          responsiveScope="all"
          unsupported={SITE_DOCUMENT_CAPABILITIES}
        />

        {/* Must be a flex container: the canvas sizes itself with flex-1, and
            in a block parent it would collapse to zero height. */}
        <div className="flex-1 relative min-w-0 flex flex-col">
          <SiteCanvas
            site={site}
            width={DEVICE_WIDTH[device]}
            camera={camera}
            onCameraChange={setCamera}
            selectedId={selectedId}
            onSelect={handleSelect}
            selectMode={selectMode}
            onToggleSelectMode={() => setSelectMode((on) => !on)}
            handTool={handTool}
            onToggleHandTool={() => setHandTool((on) => !on)}
            describe={describe}
            availableActions={availableActions}
            activeAction={activeAction}
            onChooseAction={setActiveAction}
          />

          <CommandDock
            pageName={site.entry}
            selectedElementName={selection ? labelFor(selection) : null}
            activeAction={activeAction}
            responsiveScope="all"
            // Unreachable: the dock never expands while a reason is set.
            onSubmitCommand={() => ({
              kind: 'unsupported' as const,
              summary: SITE_DOCUMENT_CAPABILITIES.commands ?? '',
              detailedSteps: [],
              affectedElementIds: [],
            })}
            feedback={null}
            onUndoLastAction={() => dispatch({ type: 'undo' })}
            onDismissFeedback={() => {}}
            unsupportedReason={SITE_DOCUMENT_CAPABILITIES.commands}
          />
        </div>

        {selection && activeAction && (
          <SiteActionInspector
            selection={selection}
            action={activeAction}
            overrides={selectedId ? overridesFor(site, selectedId) : {}}
            images={images}
            onClose={() => setActiveAction(null)}
            onSetText={(text) => {
              const next = setText(site, selection.nodeId, text, parseHtml, serialise);
              if (next) commit(next);
            }}
            onSetImage={(change) => {
              const next = setImage(site, selection.nodeId, change, parseHtml, serialise);
              if (next) commit(next);
            }}
            onSetStyle={(declarations) => commit(setStyle(site, selection.nodeId, declarations))}
          />
        )}
      </div>

      {reportOpen && (
        <ConversionReportModal report={site.report} onClose={() => setReportOpen(false)} />
      )}
    </div>
  );
};
